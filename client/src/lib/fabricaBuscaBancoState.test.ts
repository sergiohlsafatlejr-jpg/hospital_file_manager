import { describe, expect, it } from "vitest";
import { FabricaBuscaBancoState } from "./fabricaBuscaBancoState";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../pages/FabricaFaturamento.tsx", import.meta.url), "utf8");

describe("Issue168: identidade volátil das buscas da Recepção", () => {
  it("consome somente a resposta mais recente uma vez", () => {
    const state = new FabricaBuscaBancoState();
    const ticket = state.begin(1, "synthetic-A");
    expect(state.isCurrent(ticket)).toBe(true);
    expect(state.consume(ticket)).toBe(true);
    expect(state.consume(ticket)).toBe(false);
  });

  it.each(["hospital", "conta", "guia", "atendimento", "paciente", "convênio", "datas", "cadastro", "desmontagem"])("descarta a resposta após mudar %s", () => {
    const state = new FabricaBuscaBancoState();
    const ticket = state.begin(1, "synthetic-A");
    state.invalidate();
    expect(state.consume(ticket)).toBe(false);
  });

  it("não confunde dois pedidos da mesma conta", () => {
    const state = new FabricaBuscaBancoState();
    const before = state.begin(1, "synthetic-A");
    const after = state.begin(1, "synthetic-A");
    expect(state.consume(before)).toBe(false);
    expect(state.consume(after)).toBe(true);
  });

  it("não aceita resposta de A depois de alternar A→B→A", () => {
    const state = new FabricaBuscaBancoState();
    const a = state.begin(1, "synthetic-A");
    state.begin(2, "synthetic-A");
    const latest = state.begin(1, "synthetic-A");
    expect(state.consume(a)).toBe(false);
    expect(state.consume(latest)).toBe(true);
  });

  it("resposta atrasada não invalida uma busca nova pendente", () => {
    const state = new FabricaBuscaBancoState();
    const old = state.begin(1, "synthetic-A");
    const latest = state.begin(1, "synthetic-B");
    expect(state.consume(old)).toBe(false);
    expect(state.isCurrent(latest)).toBe(true);
  });

  it("normaliza somente espaços exteriores do número", () => {
    const ticket = new FabricaBuscaBancoState().begin(1, "  001 A  ");
    expect(ticket.numeroConta).toBe("001 A");
    expect(Object.isFrozen(ticket)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity])("nega hospital inválido %s", (hospitalId) => {
    expect(() => new FabricaBuscaBancoState().begin(hospitalId, "synthetic-A")).toThrow();
  });

  it("nega número vazio", () => {
    expect(() => new FabricaBuscaBancoState().begin(1, "   ")).toThrow();
  });

  it("ambos os seletores usam a mesma invalidação síncrona", () => {
    expect(page.match(/onValueChange=\{alterarHospitalRecepcao\}/g)).toHaveLength(2);
    expect(page).toContain("onChange={(e) => alterarNumeroContaRecepcao(e.target.value)}");
  });

  it("a UI consome o ticket antes de aplicar sucesso ou erro", () => {
    expect(page.match(/if \(!buscaBancoState.current.consume\(ticket\)\) return;/g)).toHaveLength(2);
    expect(page).not.toContain("if (cab.nomePaciente) setRecNomePaciente");
    expect(page).not.toContain("if (cab.dataEntrada) setRecDataEntrada");
    expect(page).toContain('setRecNomePaciente(cab.nomePaciente || "")');
    expect(page).toContain('setRecDataEntrada(cab.dataEntrada || "")');
  });

  it("o formulário não cadastra enquanto a busca está pendente", () => {
    const handler = page.slice(page.indexOf("const handleCadastrarRecepcao"), page.indexOf("const fileToBase64"));
    expect(handler.indexOf("buscarContaBancoRecepcaoMutation.isPending")).toBeLessThan(handler.indexOf("cadastrarMutation.mutate"));
  });

  it("a UI não transforma comparação pendente ou incompleta em Conforme", () => {
    const inicio = page.indexOf('conta.statusAuditoriaRegras === "divergente"');
    const fim = page.indexOf("</TableCell>", inicio);
    const auditoria = page.slice(inicio, fim);
    expect(inicio).toBeGreaterThan(0);
    expect(auditoria).toContain('conta.statusAuditoriaRegras === "conforme" ?');
    expect(auditoria).toContain("Comparação pendente/incompleta");
    expect(auditoria).toContain("Banco: snapshot vazio — comparação pendente");
  });

  it("recibo restrito é confirmado sem exigir itens ou valores do novo setor", () => {
    const inicio = page.indexOf("const sincronizarContaBancoEsteiraMutation");
    const fim = page.indexOf("const sincronizarContaBanco =", inicio);
    const retorno = page.slice(inicio, fim);
    expect(retorno).toContain('"reconciliacaoRestrita" in res && res.reconciliacaoRestrita');
    expect(retorno.indexOf("res.reconciliacaoRestrita")).toBeLessThan(retorno.indexOf("res.possuiItensBaixados"));
    expect(retorno).toContain("toast.success(res.mensagem)");
    expect(retorno).not.toMatch(/res\.valor|res\.itens|res\.comparativo|setLocation/);
  });

  it("controle não persiste dados no navegador", () => {
    const helper = readFileSync(new URL("./fabricaBuscaBancoState.ts", import.meta.url), "utf8");
    expect(helper).not.toMatch(/sessionStorage|localStorage|indexedDB|fetch\(/);
  });
});
