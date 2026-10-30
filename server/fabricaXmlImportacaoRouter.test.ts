import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const deps = vi.hoisted(() => ({
  getDb: vi.fn(), convenio: vi.fn(), parseXML: vi.fn(), parseHonorarios: vi.fn(), comparar: vi.fn(),
  criarServico: vi.fn(), indexar: vi.fn(), consultar: vi.fn(), cofre: vi.fn(),
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
function banco() {
  let id = 100;
  const pendentes: Array<{ tabela: string; valor: any }> = [];
  const confirmados: typeof pendentes = [];
  const eventos: string[] = [];
  const tx: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [conta] }) }) }),
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
});
