import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (path: string) =>
  readFileSync(new URL(path, root), "utf8").replace(/\s+/g, " ");
const ui = read("client/src/components/integrador/EasyLocalImportacaoAcao.tsx");
const tabs = read(
  "client/src/components/integrador/EasyLocalIntegradorTabs.tsx"
);
const page = read("client/src/pages/IntegradorEasyLocal.tsx");
describe("confirmação de importação EASYLocal no Portal", () => {
  it("a prévia não aciona a importação e o usuário confirma contagens e alvo", () => {
    expect(ui).toContain("preverImportacao.useMutation");
    expect(ui).toContain("Registros lidos:");
    expect(ui).toContain("registrosInseridos");
    expect(ui).toContain("registrosAtualizados");
    expect(ui).toContain("registrosInalterados");
    expect(ui).toContain("Destino no Portal:");
    expect(ui).toContain("Estabelecimento:");
    expect(ui).toContain("confirmarImportacao: true");
    expect(ui).toContain("tokenPrevia: previa.tokenPrevia");
    expect(ui).toContain(
      "!previa || !confirmado || expirada || execute.isPending"
    );
  });
  it("desativa retentativa automática e limpa plano após sucesso ou erro", () => {
    expect(ui.match(/retry: false/g)).toHaveLength(2);
    expect(ui).toContain("Confira o destino antes de repetir");
    expect(ui.match(/setPrevia\(null\)/g)!.length).toBeGreaterThan(3);
    expect(ui).toContain("Resultado da importação não confirmado");
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
  });
  it("troca unidade e conexão central descartam planos antigos", () => {
    expect(page).toContain('key={estabelecimentoAtual?.id ?? "sem-unidade"}');
    expect(tabs).toContain("key={`${configuracao.id}-${versaoConexao}`}");
    expect(tabs).toContain("estabelecimentoId={estabelecimentoId}");
  });
  it("não promete agendamento ou publicação final ao importar staging", () => {
    expect(ui).toContain("Não ativa os horários de busca");
    expect(ui).toContain("depende do adaptador do domínio");
    expect(tabs).toContain("Salvar a frequência desejada não ativa horários");
    expect(tabs).toContain("destino no Portal");
    expect(ui).not.toMatch(/cron|setInterval|scheduleCronTask/);
  });
});
