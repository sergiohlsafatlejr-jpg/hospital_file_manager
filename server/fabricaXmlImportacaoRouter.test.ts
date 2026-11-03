import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
const deps = vi.hoisted(() => ({
  getDb: vi.fn(), convenio: vi.fn(), parseXML: vi.fn(), parseHonorarios: vi.fn(), comparar: vi.fn(),
  criarServico: vi.fn(), indexar: vi.fn(), consultar: vi.fn(), cofre: vi.fn(),
  projetar: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: deps.getDb, verificarPermissaoEstabelecimento: vi.fn(async () => false) }));
vi.mock("./hospitalScope", () => ({
  ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001,
  exigirAcessoFabrica: vi.fn(), exigirHospitalProprietario: vi.fn(), resolverHospitaisAutorizados: vi.fn(), autorizarLoteHospitalar: vi.fn(),
}));
vi.mock("./recursoGlosaPermissions", () => ({ exigirConvenioDoEstabelecimento: deps.convenio }));
vi.mock("./parsers", () => ({ parseXML: deps.parseXML }));
vi.mock("./contaHonorariosParser", () => ({ parseContaHonorarios: deps.parseHonorarios }));
vi.mock("./contaContextoMedicoDrizzle", () => ({ criarServicoContaContextoMedicoParaUsuario: deps.criarServico }));
vi.mock("./services/comparadorPadroes", () => ({ compararContaComPadroes: deps.comparar, executarComparacaoESalvar: vi.fn() }));
vi.mock("./faturamentoUnificadoService", () => ({ popularDeXmlTissArquivoRestrito: deps.projetar }));
vi.mock("./xmlImportacaoLoteVault", () => ({
  armazenamentoXmlImportacaoPronto: () => true,
  criarChaveStorageXmlImportacao: (s: any) => `sintetico-${s.arquivoId}.enc`,
  salvarXmlImportacaoProtegido: deps.cofre,
  lerXmlImportacaoProtegido: vi.fn(),
  XML_IMPORTACAO_MAX_FILE_BYTES: 16 * 1024 * 1024,
}));
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";

const hospitalXml = Buffer.from("<xml>conta-sintetica</xml>");
const medicoXml = Buffer.from("<xml>honorarios-sinteticos</xml>");
const conta = {
  id: 9, hospitalEstabelecimentoId: 20, convenioId: 30, convenioNome: "Convênio Sintético", setorAtual: "faturamento", statusSetor: "em_processamento",
  numeroGuia: "GUIA-SINTETICA", numeroLote: "LOTE-SINTETICO", nomePaciente: "Paciente Sintético", dataEntrada: "2026-10-01", dataAlta: "2026-10-03", valorFaturadoInicial: "0.00",
};
function banco(contaDaFixture = conta) {
  let id = 100;
  const pendentes: Array<{ tabela: string; valor: any }> = [];
  const confirmados: typeof pendentes = [];
  const eventos: string[] = [];
  const tx: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [contaDaFixture] }) }) }),
    execute: vi.fn(async () => [[{ observacao: JSON.stringify({ cargoSetor: "Faturista", setoresPermitidos: ["faturamento"], hospitaisPermitidos: [20], verRelatoriosGerenciais: false }) }], []]),
    insert: (table: any) => ({ values: async (valor: any) => { pendentes.push({ tabela: getTableName(table), valor }); eventos.push(`insert:${getTableName(table)}`); return [{ insertId: ++id }]; } }),
    update: (table: any) => ({ set: (valor: any) => ({ where: async () => {
      pendentes.push({ tabela: getTableName(table), valor });
      eventos.push(valor.status === "processado" ? "processado" : `update:${getTableName(table)}`);
      return [{ affectedRows: 1 }];
    } }) }),
  };
  const db = { transaction: vi.fn(async (callback: (b: any) => Promise<any>) => {
    try { const result = await callback(tx); confirmados.push(...pendentes); eventos.push("commit"); return result; }
    catch (error) { eventos.push("rollback"); throw error; }
  }) };
  deps.getDb.mockResolvedValue(db);
  deps.cofre.mockImplementation(async () => { eventos.push("cofre"); });
  return { db, tx, pendentes, confirmados, eventos };
}
function caller() {
  return fabricaFaturamentoRouter.createCaller({ user: { id: 71, role: "user", name: "Operador Sintético", email: "operador@example.test" }, req: {}, res: {} } as any);
}
const request = { fabricaContaId: 9, nomeArquivo: "conta.xml", conteudoBase64: hospitalXml.toString("base64"), nomeArquivoHonorarios: "honorarios.xml", conteudoHonorariosBase64: medicoXml.toString("base64") };

describe("Fábrica: API de dois XMLs, proteção e transação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.convenio.mockResolvedValue({ id: 30, nome: "Convênio Sintético" });
    deps.parseXML.mockResolvedValue({ success: true, procedimentos: [{ guiaNumero: "GUIA-SINTETICA", numeroLote: "LOTE-SINTETICO", tipoDespesa: "medicamento", codigo: "HOSP-SINTETICO", quantidade: 1, valorTotal: 10, valorUnitario: 10 }] });
    deps.parseHonorarios.mockReturnValue({ recognized: false, guias: [] });
    deps.indexar.mockResolvedValue({ indexadas: 1, jaIndexadas: 0, semCorrespondencia: 0, ambiguas: 0 });
    deps.consultar.mockImplementation(async ({ scope }) => ({ configuracaoPendente: false, diagnosticoSnapshot: null, fontes: [{ arquivoId: 105, registros: 1, codigosDistintos: 1, procedimentos: [] }], candidatos: [], contexto: null, itensHospitalares: 1, setorInformado: false, avisos: [] }));
    deps.criarServico.mockReturnValue({ indexarAutomaticamente: deps.indexar, consultar: deps.consultar });
    deps.comparar.mockResolvedValue({ totalDivergencias: 0, scoreRisco: { score: 0 }, statusGeral: "conforme", divergencias: [] });
    deps.projetar.mockResolvedValue({ inseridos: 1, total: 1 });
  });
  it("dois XMLs válidos só são processados após cofre/correlação e comparação usa a transação", async () => {
    const b = banco();
    const res = await caller().importarXmlNaConta(request);
    expect(res).toMatchObject({ sucesso: true, honorariosIndexados: true, novoSetor: "auditoria_interna" });
    expect(b.eventos.at(-1)).toBe("commit");
    expect(deps.cofre).toHaveBeenCalledTimes(2);
    expect(deps.indexar).toHaveBeenCalledWith(expect.objectContaining({
      arquivoHospitalIdsPermitidos: [101],
      escoposHospitalaresPermitidos: [expect.objectContaining({ estabelecimentoId: 20, convenioId: 30, numeroConta: "GUIA-SINTETICA", arquivoHospitalId: 101, numeroLote: "LOTE-SINTETICO", competencia: "2026/10" })],
    }));
    expect(deps.comparar).toHaveBeenCalledWith("GUIA-SINTETICA", 20, expect.objectContaining({ banco: b.tx }));
    expect(deps.projetar).toHaveBeenCalledWith(expect.objectContaining({ estabelecimentoId: 20, convenioId: 30, arquivoId: 101, numeroGuia: "GUIA-SINTETICA", numeroLote: "LOTE-SINTETICO", competencia: "2026/10" }), b.tx);
    expect(b.eventos.indexOf("processado")).toBeGreaterThan(b.eventos.lastIndexOf("cofre"));
    expect(b.confirmados.filter(r => r.tabela === "arquivos" && r.valor.status === "processado")).toHaveLength(2);
    expect(JSON.stringify(b.confirmados)).not.toContain("local://");
  });
  it("falha de correlação faz rollback, não confirma itens nem avança setor", async () => {
    const b = banco(); deps.indexar.mockRejectedValue(new Error("guia-nao-correlacionada"));
    await expect(caller().importarXmlNaConta(request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(b.eventos.at(-1)).toBe("rollback");
    expect(b.confirmados).toEqual([]);
    expect(deps.comparar).not.toHaveBeenCalled();
    expect(b.pendentes.filter(r => r.tabela === "fabrica_contas")).toEqual([]);
    expect(b.eventos).not.toContain("processado");
  });
  it("falha de cofre interrompe antes de materializar itens ou tentar correlação", async () => {
    const b = banco(); deps.cofre.mockRejectedValue(new Error("storage-interno"));
    await expect(caller().importarXmlNaConta(request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(b.eventos.at(-1)).toBe("rollback"); expect(b.confirmados).toEqual([]);
    expect(b.pendentes.every(r => r.tabela === "arquivos")).toBe(true);
    expect(deps.indexar).not.toHaveBeenCalled(); expect(deps.comparar).not.toHaveBeenCalled();
  });

  it("falha da projeção restrita faz rollback e não confirma arquivo nem setor", async () => {
    const b = banco(); deps.projetar.mockRejectedValue(new Error("projecao-sintetica-indisponivel"));
    await expect(caller().importarXmlNaConta(request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.not.stringContaining("projecao-sintetica-indisponivel") });
    expect(b.confirmados).toEqual([]); expect(b.eventos.at(-1)).toBe("rollback");
    expect(b.eventos).not.toContain("processado"); expect(deps.indexar).not.toHaveBeenCalled();
  });

  it.each(["UNIMED", "SEM-CORRESPONDENCIA"])("convênio %s sem escolha única bloqueia antes do cofre", async nome => {
    const b = banco();
    const convenios = [{ id: 30, nome: "UNIMED SINTETICA A", estabelecimentoId: 20, ativo: "sim" }, { id: 31, nome: "UNIMED SINTETICA B", estabelecimentoId: 20, ativo: "sim" }];
    b.tx.select = () => ({ from: (table: any) => {
      const rows = getTableName(table) === "fabrica_contas" ? [{ ...conta, convenioId: null, convenioNome: nome }] : convenios;
      const query = Object.assign(Promise.resolve(rows), { limit: async () => rows });
      return Object.assign(query, { where: () => query });
    } });
    await expect(caller().importarXmlNaConta(request)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.cofre).not.toHaveBeenCalled(); expect(b.confirmados).toEqual([]);
  });

  it("convênio existente só em outro hospital não é selecionado e a validação final nega antes do cofre", async () => {
    const b = banco({ ...conta, convenioId: 31, convenioNome: "Convênio de outra unidade" });
    const convenioDeOutroHospital = {
      id: 31, nome: "Convênio de outra unidade", estabelecimentoId: 99, ativo: "sim",
    };
    let selecao = 0;
    b.tx.select = vi.fn(() => ({
      from: () => {
        const rows = selecao++ === 0 ? [{ ...conta, convenioId: 31, convenioNome: "Convênio de outra unidade" }] : [convenioDeOutroHospital];
        const query: any = Object.assign(Promise.resolve(rows), {
          where: () => query,
          limit: async () => rows,
        });
        return query;
      },
    }));
    deps.convenio.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Convênio pertence a outro hospital." }));

    await expect(caller().importarXmlNaConta({ ...request, conteudoHonorariosBase64: undefined }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.convenio).toHaveBeenLastCalledWith(71, 31, 20, "editar", undefined);
    expect(deps.cofre).not.toHaveBeenCalled();
    expect(b.pendentes).toEqual([]);
    expect(b.confirmados).toEqual([]);
  });

  it("não usa catálogo de outro hospital mesmo quando a validação mockada aceitaria o convênio", async () => {
    const contaSemConvenio = { ...conta, convenioId: null, convenioNome: "Convênio Exclusivo Sintético" };
    const b = banco();
    b.tx.select = () => ({ from: (table: any) => {
      const rows = getTableName(table) === "fabrica_contas" ? [contaSemConvenio]
        : [{ id: 31, nome: "Convênio Exclusivo Sintético", estabelecimentoId: 99, ativo: "sim" }];
      const query: any = Object.assign(Promise.resolve(rows), { limit: async () => rows });
      return Object.assign(query, { where: () => query });
    } });
    deps.convenio.mockResolvedValue({ id: 31, nome: "Convênio Exclusivo Sintético" });
    await expect(caller().importarXmlNaConta({ ...request, conteudoHonorariosBase64: undefined }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.convenio).not.toHaveBeenCalled();
    expect(deps.cofre).not.toHaveBeenCalled();
    expect(b.confirmados).toEqual([]);
  });

  it("candidato do catálogo recusado pela validação não é devolvido pelo catch", async () => {
    const b = banco();
    b.tx.select = () => ({ from: (table: any) => {
      const rows = getTableName(table) === "fabrica_contas" ? [conta]
        : [{ id: 30, nome: "Convênio Sintético", estabelecimentoId: 20, ativo: "sim" }];
      const query: any = Object.assign(Promise.resolve(rows), { limit: async () => rows });
      return Object.assign(query, { where: () => query });
    } });
    deps.convenio.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Permissão sintética negada." }));
    await expect(caller().importarXmlNaConta({ ...request, conteudoHonorariosBase64: undefined }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Convênio não pertence ao hospital da conta." });
    expect(deps.cofre).not.toHaveBeenCalled();
    expect(b.pendentes).toEqual([]);
    expect(b.confirmados).toEqual([]);
  });

  it.each(["limpeza_prontuario", "enviado_convenio", "recursos"] as const)(
    "perfil somente faturamento não importa XML da conta em %s antes de cofre ou escrita",
    async setorAtual => {
      const b = banco({ ...conta, setorAtual });

      await expect(caller().importarXmlNaConta(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(deps.cofre).not.toHaveBeenCalled();
      expect(b.pendentes).toEqual([]);
      expect(b.confirmados).toEqual([]);
    },
  );

  it.each([
    ["recursos", "limpeza_prontuario"],
    ["recursos", "enviado_convenio"],
    ["limpeza_prontuario", "recursos"],
  ] as const)("reciprocidade permite perfil %s importar XML em %s", async (setorPermitido, setorAtual) => {
    const b = banco({ ...conta, setorAtual });
    b.tx.execute.mockResolvedValue([[
      { observacao: JSON.stringify({ cargoSetor: "Operador Sintético", setoresPermitidos: [setorPermitido], hospitaisPermitidos: [20], verRelatoriosGerenciais: false }) },
    ], []]);

    await expect(caller().importarXmlNaConta(request)).resolves.toMatchObject({ sucesso: true });
    expect(deps.cofre).toHaveBeenCalled();
    expect(b.eventos).toContain("commit");
  });
});
