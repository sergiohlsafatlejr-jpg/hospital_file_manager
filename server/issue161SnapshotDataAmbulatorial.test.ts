import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), getConvenioById: vi.fn(), verificarPermissaoEstabelecimento: vi.fn(), parseXML: vi.fn(),
  criarXml: vi.fn(), confirmarXml: vi.fn(), popular: vi.fn(),
  scope: { exigirAcessoFabrica: vi.fn(), exigirHospitalProprietario: vi.fn(), resolverHospitaisAutorizados: vi.fn(), autorizarLoteHospitalar: vi.fn() },
}));
vi.mock("./db", async original => ({ ...(await original<typeof import("./db")>()),
  getDb: mocks.getDb, getConvenioById: mocks.getConvenioById, verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));
vi.mock("./hospitalScope", () => ({ ...mocks.scope, ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001 }));
vi.mock("./parsers", () => ({ parseXML: mocks.parseXML }));
vi.mock("./fabricaXmlSeguro", () => ({
  decodificarXmlFabricaBase64: (s: string) => Buffer.from(s, "base64"),
  criarArquivoXmlFabricaProtegido: mocks.criarXml, confirmarArquivoXmlFabrica: mocks.confirmarXml,
}));
vi.mock("./faturamentoUnificadoService", () => ({ popularDeXmlTissArquivoRestrito: mocks.popular }));

import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";
import * as servico from "./services/esteiraAmbulatorialService";
import * as comparador from "./services/comparadorPadroes";
import { convenios, fabricaContas, tabelasPreco, vinculacaoCodigos } from "../drizzle/schema";

const convenio = { id: 55, estabelecimentoId: 3, nome: "OPERADORA SINTÉTICA", ativo: "sim" };
const user = { id: 71, role: "admin", name: "Sintético", email: "synthetic@example.test" };
const caller = () => fabricaFaturamentoRouter.createCaller({ user, req: {}, res: {} } as any);
const input = { hospitalEstabelecimentoId: 3, convenioId: 55, nomeArquivo: "synthetic.xml",
  numeroLoteManual: "LOTE-SINTETICO", conteudoBase64: Buffer.from("<synthetic/>").toString("base64"), enviarDiretoSeConforme: true };
function procedimento(extra: Record<string, unknown> = {}) {
  return { codigo: "40304361", descricao: "Item sintético", quantidade: 1, valorUnitario: 25, valorTotal: 25,
    guiaNumero: "GUIA-1", pacienteNome: "Beneficiário sintético", pacienteCarteirinha: "CARTEIRA-SINTETICA",
    codigoPrestadorExecutante: "SINTETICO", dataExecucao: new Date("2026-10-15T00:00:00Z"), ...extra };
}
function preco(codigo = "40304361", extra = {}) {
  return { id: 1, convenioId: 55, estabelecimentoId: 3, tipo: "procedimentos", procedimentoFonte: "dados_completo", codigo,
    nome: "Item sintético", valor: "25.00", vigenciaInicio: new Date("2025-01-01T00:00:00Z"), porte: null, ativo: "sim", ...extra };
}

/** Nenhuma conexão real: selects sintéticos, write-set publicado somente no commit. */
function banco(precos: unknown[] = [], vinculos: unknown[] = []) {
  const committed: Array<{ tabela: string; valores: any }> = [];
  const attempts: Array<{ tabela: string; valores: any }> = [];
  const commits = vi.fn();
  const rollbacks = vi.fn();
  let nextId = 300;
  let executor: any;
  const tx: any = {
    select: vi.fn(() => ({ from: (table: unknown) => {
      const rows = table === convenios ? [convenio] : table === tabelasPreco ? precos : table === vinculacaoCodigos ? vinculos : [];
      const query = Object.assign(Promise.resolve(rows), { for: async () => rows, limit: async () => rows });
      return Object.assign(Promise.resolve(rows), { where: () => query, limit: async () => rows });
    } })),
    execute: vi.fn(async () => [[]]),
    update: vi.fn((table: any) => ({ set: (valores: any) => ({ where: async () => {
      attempts.push({ tabela: getTableName(table), valores: structuredClone(valores) });
      return [{ affectedRows: 1 }];
    } }) })),
    insert: vi.fn((table: any) => ({ values: async (valores: any) => {
      attempts.push({ tabela: getTableName(table), valores: structuredClone(valores) });
      return [{ insertId: ++nextId }];
    } })),
  };
  const outer = {
    select: vi.fn(() => { throw new Error("Select de negócio fora da tx"); }),
    execute: vi.fn(async () => [[]]),
    transaction: vi.fn(async (callback: (db: any) => Promise<unknown>) => {
      const start = attempts.length;
      executor = tx;
      try { const result = await callback(tx); committed.push(...attempts.slice(start)); commits(); return result; }
      catch (error) { rollbacks(); throw error; }
    }),
  };
  mocks.getDb.mockResolvedValue(outer);
  return { outer, tx, committed, attempts, commits, rollbacks, executor: () => executor };
}

const validarSpy = vi.spyOn(servico, "validarGuiaAmbulatorial");
const compararSpy = vi.spyOn(comparador, "compararItensComPadroes");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConvenioById.mockResolvedValue(convenio);
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.scope.resolverHospitaisAutorizados.mockResolvedValue([3]);
  mocks.scope.exigirAcessoFabrica.mockResolvedValue(undefined);
  mocks.scope.exigirHospitalProprietario.mockResolvedValue(undefined);
  mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento()] });
  mocks.criarXml.mockResolvedValue(200);
  mocks.confirmarXml.mockResolvedValue(undefined);
  mocks.popular.mockResolvedValue({ inseridos: 1 });
});

describe("Issue161 — transformação importador→serviço→comparador REAL sem DB", () => {
  it.each([undefined, null, new Date(NaN), "2026-02-30", "15/10/2026"])(
    "de-para contratual sem data real (%s) nunca conforme/enviado; não herda data da irmã nem today", async data => {
      const db = banco([preco()], [{ codigoHospital: "INTERNO", codigoConvenio: "40304361", convenioId: 55 }]);
      mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [
        procedimento({ guiaNumero: "GUIA-VALIDA" }),
        procedimento({ guiaNumero: "GUIA-SEM-DATA", codigo: "INTERNO", dataExecucao: data }),
      ] });
      await expect(caller().importarLoteAmbulatorialXml(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      const guia = validarSpy.mock.calls.find(([, , g]) => g.numeroGuia === "GUIA-SEM-DATA")![2];
      expect(guia.procedimentos[0].dataExecucao).toEqual(data);
      expect(guia.itensPadronizados[0].dataExecucao).toBeNull();
      const args = compararSpy.mock.calls.find(([args]) => args.numeroConta === "GUIA-SEM-DATA")![0];
      expect(args.itens[0].dataExecucao).toBeNull();
      expect(args.banco).toBe(db.tx);
      expect(await compararSpy.mock.results.at(-1)!.value).toMatchObject({ statusGeral: "incompleta" });
      expect(db.committed).toEqual([]);
      expect(db.attempts.some(w => w.tabela === getTableName(fabricaContas))).toBe(false);
      expect(db.rollbacks).toHaveBeenCalledOnce();
      expect(mocks.popular).not.toHaveBeenCalled();
      expect(mocks.confirmarXml).not.toHaveBeenCalled();
    });

  it.each(["40304361", "040304361"])("preço direto/normalizado (%s) sem data falha fechado", async codigo => {
    const db = banco([preco()]);
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento({ codigo, dataExecucao: undefined })] });
    await expect(caller().importarLoteAmbulatorialXml(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(validarSpy.mock.calls[0][2].itensPadronizados[0].dataExecucao).toBeNull();
    expect(db.committed).toEqual([]);
    expect(db.commits).not.toHaveBeenCalled();
  });

  it("item inválido na mesma guia não herda data do primeiro procedimento válido", async () => {
    const db = banco([preco()], [{ codigoHospital: "INTERNO", codigoConvenio: "40304361", convenioId: 55 }]);
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento(), procedimento({ codigo: "INTERNO", dataExecucao: undefined })] });
    await expect(caller().importarLoteAmbulatorialXml(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(validarSpy.mock.calls[0][2].itensPadronizados.map(item => item.dataExecucao)).toEqual([new Date("2026-10-15T00:00:00Z"), null]);
    expect(db.committed).toEqual([]);
  });

  it("sem preço dependente de data preserva null no staging e nos itens, não fabrica execução", async () => {
    const db = banco();
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento({ dataExecucao: undefined })] });
    await caller().importarLoteAmbulatorialXml({ ...input, enviarDiretoSeConforme: false });
    const values = db.committed.filter(w => Array.isArray(w.valores)).flatMap(w => w.valores);
    expect(values.filter(v => "dataExecucao" in v).map(v => v.dataExecucao)).toEqual([null, null]);
  });

  it("datas reais distintas preservadas exatas e cada item usa sua vigência pelo de-para real", async () => {
    const db = banco([preco(), preco("40304361", { id: 2, valor: "30.00", vigenciaInicio: new Date("2026-10-16T00:00:00Z") })],
      [{ codigoHospital: "INTERNO", codigoConvenio: "40304361", convenioId: 55 }]);
    const datas = [new Date("2026-10-15T00:00:00Z"), new Date("2026-10-16T08:30:20Z")];
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [
      procedimento({ codigo: "INTERNO", dataExecucao: datas[0] }),
      procedimento({ codigo: "INTERNO", dataExecucao: datas[1], valorUnitario: 30, valorTotal: 30 }),
    ] });
    expect(await caller().importarLoteAmbulatorialXml(input)).toMatchObject({ enviadoDiretoConvenio: true, guiasConformes: 1 });
    expect(validarSpy.mock.calls[0][2].itensPadronizados.map(item => item.dataExecucao)).toEqual(datas);
    expect(compararSpy.mock.calls[0][0].itens.map(item => item.dataExecucao)).toEqual(datas);
    const values = db.committed.filter(w => Array.isArray(w.valores)).flatMap(w => w.valores);
    expect(values.filter(v => "dataExecucao" in v).map(v => v.dataExecucao)).toEqual([...datas, ...datas]);
    expect(db.committed.find(w => w.tabela === getTableName(fabricaContas))!.valores.setorAtual).toBe("enviado_convenio");
    expect(db.outer.select).not.toHaveBeenCalled();
    expect(mocks.getConvenioById.mock.calls.every(([, connection]) => connection === db.tx)).toBe(true);
    expect(mocks.popular.mock.calls[0][1]).toBe(db.tx);
    expect(mocks.criarXml.mock.calls[0][0]).toBe(db.tx);
  });
});

describe("Issue161 — preflight número de lote/guia e fallback <=20", () => {
  it("fallback aleatório curto permanece distinto e compatível com limite restrito", async () => {
    const db = banco();
    const lotes = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const result = await caller().importarLoteAmbulatorialXml({ ...input, numeroLoteManual: null });
      expect(result.numeroLote).toMatch(/^AMB-\d{8}-[0-9a-f]{7}$/);
      expect(result.numeroLote.length).toBeLessThanOrEqual(20);
      lotes.add(result.numeroLote);
      const helperInput = mocks.popular.mock.calls.at(-1)![0];
      expect(helperInput.numeroLote).toBe(result.numeroLote);
      expect(helperInput.numeroLote.length).toBeLessThanOrEqual(20);
    }
    expect(lotes.size).toBe(30);
  });

  it("lote manual >20 recusa com mensagem explícita antes de parse/cofre", async () => {
    banco();
    await expect(caller().importarLoteAmbulatorialXml({ ...input, numeroLoteManual: "L".repeat(21) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.parseXML).not.toHaveBeenCalled();
    expect(mocks.criarXml).not.toHaveBeenCalled();
  });

  it.each(["guia", "lote"])("%s XML >20 recusa antes do cofre e antes de writes", async campo => {
    const db = banco();
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento(campo === "guia" ? { guiaNumero: "G".repeat(21) } : { numeroLote: "L".repeat(21) })] });
    await expect(caller().importarLoteAmbulatorialXml({ ...input, numeroLoteManual: null })).rejects.toMatchObject({
      code: "BAD_REQUEST", message: expect.stringContaining("20 caracteres"),
    });
    expect(mocks.criarXml).not.toHaveBeenCalled();
    expect(db.attempts).toEqual([]);
  });

  it("aceita manual e guia no limite exato de 20 sem truncamento nem enfraquecer helper", async () => {
    banco();
    mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [procedimento({ guiaNumero: "G".repeat(20) })] });
    expect(await caller().importarLoteAmbulatorialXml({ ...input, numeroLoteManual: "L".repeat(20) })).toMatchObject({ numeroLote: "L".repeat(20) });
    expect(mocks.popular.mock.calls[0][0]).toMatchObject({ numeroGuia: "G".repeat(20), numeroLote: "L".repeat(20) });
  });
});

describe("Issue161 — versão humana da UI", () => {
  it("captura tripla ao abrir modal e confirmação envia cópia sem consultar latest", () => {
    const source = readFileSync(new URL("../client/src/components/EsteiraAmbulatorialPanel.tsx", import.meta.url), "utf8");
    const abertura = source.slice(source.indexOf("const handleAbrirJustificativa"), source.indexOf("const handleConfirmarJustificativa"));
    const confirmacao = source.slice(source.indexOf("const handleConfirmarJustificativa"), source.indexOf("const lotes ="));
    expect(abertura).toContain("setSnapshotsAlvoJustificativa(");
    for (const campo of ["arquivoXmlFinalId:", "contaConvenioResumoId:", "updatedAt:"]) expect(abertura).toContain(campo);
    expect(confirmacao).toContain("expectedSnapshots: snapshotsAlvoJustificativa");
    expect(confirmacao).not.toMatch(/guiasData|refetch|\.find\(|setSnapshotsAlvoJustificativa/);
  });
});


function xmlCalendarSintetico(data: string, codigo = "INTERNO-1") {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <mensagemTISS><cabecalho><origem><identificacaoPrestador><codigoPrestadorNaOperadora>SINTETICO</codigoPrestadorNaOperadora></identificacaoPrestador></origem></cabecalho>
  <prestadorParaOperadora><loteGuias><numeroLote>LOTE-SINTETICO</numeroLote><guiasTISS><guiaSP-SADT>
  <cabecalhoGuia><numeroGuiaPrestador>GUIA-1</numeroGuiaPrestador></cabecalhoGuia>
  <dadosBeneficiario><numeroCarteira>CARTEIRA-SINTETICA</numeroCarteira><nomeBeneficiario>Beneficiário sintético</nomeBeneficiario></dadosBeneficiario>
  <dadosExecutante><contratadoExecutante><codigoPrestadorNaOperadora>SINTETICO</codigoPrestadorNaOperadora></contratadoExecutante></dadosExecutante>
  <procedimentosExecutados><procedimentoExecutado><dataExecucao>${data}</dataExecucao><procedimento><codigoTabela>22</codigoTabela><codigoProcedimento>${codigo}</codigoProcedimento><descricaoProcedimento>Item sintético</descricaoProcedimento></procedimento>
  <quantidadeExecutada>1</quantidadeExecutada><valorUnitario>25.00</valorUnitario><valorTotal>25.00</valorTotal></procedimentoExecutado></procedimentosExecutados>
  </guiaSP-SADT></guiasTISS></loteGuias></prestadorParaOperadora></mensagemTISS>`;
}

describe("Issue161: XML bruto e calendário real antes da comparação contratual", () => {
  it.each(["2026-02-30", "2026-02-29", "2026-04-31", "30/02/2026", "2026-02-30T12:00:00Z", "30/02/2026 12:00:00"])(
    "parser real não fabrica Date para %s", async data => {
      const parser = await vi.importActual<typeof import("./parsers")>("./parsers");
      const parsed = await parser.parseXML(xmlCalendarSintetico(data));
      expect(parsed.success).toBe(true);
      expect(parsed.procedimentos).toHaveLength(1);
      expect(parsed.procedimentos[0].dataExecucao).toBeUndefined();
    },
  );
  it.each(["2024-02-29", "29/02/2024", "2026-02-28"])("preserva o calendário válido do XML bruto (%s)", async data => {
    const parser = await vi.importActual<typeof import("./parsers")>("./parsers");
    const parsed = await parser.parseXML(xmlCalendarSintetico(data));
    const date = parsed.procedimentos[0].dataExecucao;
    expect(date).toBeInstanceOf(Date);
    expect(date?.getMonth()).toBe(1);
    expect(date?.getDate()).toBe(data.includes("28") ? 28 : 29);
    expect(date?.getHours()).toBe(12);
  });
  it("XML bruto impossível com de-para real não libera a guia pelo preço de uma data artificial", async () => {
    const parser = await vi.importActual<typeof import("./parsers")>("./parsers");
    mocks.parseXML.mockImplementation(parser.parseXML);
    const db = banco([preco()], [{ codigoHospital: "INTERNO-1", codigoConvenio: "40304361", convenioId: 55 }]);
    const xml = xmlCalendarSintetico("2026-02-30");
    await expect(caller().importarLoteAmbulatorialXml({ ...input, conteudoBase64: Buffer.from(xml).toString("base64") })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(validarSpy).toHaveBeenCalled();
    expect(validarSpy.mock.calls[0][2].itensPadronizados[0].dataExecucao).toBeNull();
    expect(compararSpy).toHaveBeenCalled();
    expect(await compararSpy.mock.results.at(-1)!.value).toMatchObject({ statusGeral: "incompleta" });
    expect(db.commits).not.toHaveBeenCalled();
    expect(db.rollbacks).toHaveBeenCalled();
    expect(db.committed).toEqual([]);
    expect(db.attempts.some(attempt => attempt.valores.setorAtual === "enviado_convenio")).toBe(false);
  });
});
