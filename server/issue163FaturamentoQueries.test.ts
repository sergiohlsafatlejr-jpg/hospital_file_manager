import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getRawPool: vi.fn(), precos: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb, getRawPool: mocks.getRawPool }));
vi.mock("./contratosPrecoAplicavel", () => ({ buscarPrecosPorItens: mocks.precos, dataReferenciaUnica: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createPool: () => { throw new Error("Banco real proibido"); } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => { throw new Error("Banco real proibido"); } }));
vi.mock("./_core/llm", () => ({ invokeLLM: () => { throw new Error("IA real proibida"); } }));

import * as manual from "./glosaManualService";
import {
  buscarGuiaFaturamentoParaGlosaManual,
  exportarPlanilhaRecursoDemonstrativo,
  gerarExcelRecursoConciliacao,
  itensConciliadosPorGuia,
  itensGlosadosDetalheGuia,
  itensGlosadosDetalhePorItem,
  itensGlosadosDetalhePorMotivo,
  lancarGlosaManualDemonstrativo,
} from "./faturamentoUnificadoService";

const dialect = new MySqlDialect();
const build = (query: unknown) => dialect.sqlToQuery(query as any);
type Row = Record<string, string | number | null>;
const columns = {
  conciliados_automatico: ["id", "faturamentoUnificadoId", "estabelecimentoId", "convenioId", "numeroGuia", "codigoItem", "dataExecucao", "recebimentoOrigem", "recebimentoId", "contaNumero", "pacienteNome", "convenio", "competencia", "codigoItemTuss", "descricaoItem", "tipoItem", "origemSistema", "valorFaturado", "valorPago", "valorGlosa", "quantidade", "codigoGlosa", "motivoGlosa", "statusConciliacao", "metodoConciliacao", "vinculadoAoId", "diferenca", "percentualDiferenca", "toleranciaUsada", "competenciaPagamento", "criadoEm", "executadoPor", "executadoPorNome", "xmlRecursoGerado", "glosaAceita", "glosaAceitaPor", "glosaAceitaEm", "valorRecurso", "statusRecursoItem"],
  demonstrativo: ["id", "estabelecimentoId", "convenio_id", "numero_guia", "codigo_item", "data_execucao", "sequencial_item", "protocolo", "erro_tiss", "data_pagamento"],
  faturamento_unificado: ["id", "estabelecimentoId", "convenioId", "numeroGuia", "codigoItem", "dataExecucao", "origemSistema", "origemId", "protocolo", "descricaoItem", "tipoItem", "senha", "carteiraBeneficiario"],
  faturamento_tiss: ["id", "estabelecimentoId", "convenioId", "numero_guia_prestador", "numero_guia_operadora", "codigo_item", "data_execucao", "sequencial_item"],
  motivosGlosa: ["codigo", "descricao", "ativo", "grupo"],
  recebimentos_excel: ["id", "estabelecimentoId", "convenioId", "data_execucao", "data_pagto"],
  recursos_glosa_justificativas: ["conciliadoId", "justificativa"],
};
type Fixtures = Partial<Record<keyof typeof columns, Row[]>>;
const ca = (overrides: Row = {}): Row => ({
  id: 201, faturamentoUnificadoId: 401, estabelecimentoId: 10, convenioId: 20,
  numeroGuia: "GUIA-FICTICIA", codigoItem: "PROC-FICTICIO", dataExecucao: "2026-10-01 09:00:00",
  recebimentoOrigem: null, recebimentoId: null, contaNumero: "CONTA-FICTICIA", pacienteNome: "Pessoa fictícia",
  convenio: "Convênio fictício", competencia: "2026-10", descricaoItem: "Procedimento fictício", tipoItem: "CON",
  valorFaturado: "0.30", valorPago: "0.20", valorGlosa: "0.10", quantidade: 1,
  codigoGlosa: "COD-FICTICIO", motivoGlosa: "Motivo próprio fictício", statusConciliacao: "glosa_parcial",
  ...overrides,
});
const demo = (overrides: Row = {}): Row => ({
  id: 101, estabelecimentoId: 10, convenio_id: 20, numero_guia: "GUIA-FICTICIA",
  codigo_item: "PROC-FICTICIO", data_execucao: "2026-10-01", sequencial_item: 1,
  protocolo: "PROTO-FICTICIO-A", erro_tiss: "Erro fictício A", data_pagamento: "2026-10-10", ...overrides,
});
const fu = (overrides: Row = {}): Row => ({
  id: 401, estabelecimentoId: 10, convenioId: 20, numeroGuia: "GUIA-FICTICIA", codigoItem: "PROC-FICTICIO",
  dataExecucao: "2026-10-01 09:00:00", origemSistema: "XML_TISS", origemId: "501",
  protocolo: "PROTO-FICTICIO-A", descricaoItem: "Descrição faturamento fictícia", ...overrides,
});
const ft = (overrides: Row = {}): Row => ({
  id: 501, estabelecimentoId: 10, convenioId: 20, numero_guia_prestador: "GUIA-FICTICIA",
  numero_guia_operadora: "GUIA-OPERADORA-FICTICIA", codigo_item: "PROC-FICTICIO",
  data_execucao: "2026-10-01 09:00:00", sequencial_item: 1, ...overrides,
});

/** Apenas SELECT sobre CTEs/VALUES. Nenhum DDL ou conexão real. */
function memoryDb(fixtures: Fixtures) {
  let lastRows: Row[] = [];
  const execute = vi.fn(async (query: unknown) => {
    const compiled = build(query);
    expect(compiled.sql.trim()).toMatch(/^SELECT\b/i);
    const bindings: Array<string | number | bigint | null> = [];
    const ctes = Object.entries(columns).map(([table, names]) => {
      const rows = fixtures[table as keyof Fixtures] ?? [];
      const values = rows.length ? "VALUES " + rows.map(row => {
        bindings.push(...names.map(name => {
          const value = row[name] ?? null;
          return typeof value === "number" && Number.isInteger(value) ? BigInt(value) : value;
        }));
        return "(" + names.map(() => "?").join(",") + ")";
      }).join(",") : "SELECT " + names.map(() => "NULL").join(",") + " WHERE 0";
      return `${table}(${names.join(",")}) AS (${values})`;
    });
    const db = new DatabaseSync(":memory:");
    try {
      // SQLite CHAR tem afinidade numérica. Só este CAST textual é adaptado.
      const querySql = compiled.sql.replace(/CAST\(ft\.id AS CHAR\)/g, "CAST(ft.id AS TEXT)");
      lastRows = db.prepare(`WITH ${ctes.join(",")} ${querySql}`).all(...bindings, ...compiled.params) as Row[];
      return [lastRows];
    } finally {
      db.close();
    }
  });
  mocks.getDb.mockResolvedValue({ execute });
  return { execute, rows: () => lastRows };
}
const paths = [
  { name: "detalhes conciliados", run: () => itensConciliadosPorGuia({ estabelecimentoId: 10, numeroGuia: "GUIA-FICTICIA" }) },
  { name: "glosas por guia", run: () => itensGlosadosDetalheGuia({ estabelecimentoId: 10, numeroGuia: "GUIA-FICTICIA" }) },
  { name: "exportação conciliação", run: () => gerarExcelRecursoConciliacao({ estabelecimentoId: 10 }) },
  { name: "glosas por item", run: () => itensGlosadosDetalhePorItem({ estabelecimentoId: 10, codigoItem: "PROC-FICTICIO" }) },
  { name: "glosas por motivo", run: () => itensGlosadosDetalhePorMotivo({ estabelecimentoId: 10, codigoGlosa: "COD-FICTICIO" }) },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.precos.mockImplementation(async (_db: unknown, _hospital: unknown, rows: Row[]) => rows.map(() => undefined));
  mocks.getRawPool.mockImplementation(() => { throw new Error("Pool real proibido"); });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida"); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const path of paths) {
  describe(`Issue163 — ${path.name}`, () => {
    async function run(fixtures: Fixtures = {}) {
      const db = memoryDb({ conciliados_automatico: [ca()], ...fixtures });
      const result = await path.run();
      const rows = db.rows();
      expect(rows).toHaveLength(fixtures.conciliados_automatico?.length ?? 1);
      const publicRows = Array.isArray(result) ? result : result.dados;
      expect(publicRows).toHaveLength(rows.length);
      return { ...db, result };
    }
    it("SQL parametrizada com prioridade ID e candidato único, sem DISTINCT/LIMIT de desempate", async () => {
      const db = await run();
      const compiled = build(db.execute.mock.calls[0][0]);
      expect(compiled.params).toContain(10);
      expect(compiled.sql).not.toMatch(/\bDISTINCT\b|\bLIMIT\s+1\b/i);
      expect(compiled.sql).toMatch(/d\.estabelecimentoId = ca\.estabelecimentoId[\s\S]*d\.convenio_id = ca\.convenioId/);
      expect(compiled.sql).toMatch(/d\.id = ca\.recebimentoId/);
      expect(compiled.sql).toMatch(/ca\.recebimentoId IS NULL[\s\S]*SELECT MIN\(candidato\.id\)[\s\S]*HAVING COUNT\(\*\) = 1/);
      expect(compiled.sql).toContain("candidato.sequencial_item = ft.sequencial_item");
      expect(compiled.sql).toContain("candidato.protocolo = TRIM(fu.protocolo)");
      expect(compiled.sql).toContain("ft.convenioId = ca.convenioId");
    });
    it("dois snapshots candidatos não multiplicam nem alteram valores/motivo próprios", async () => {
      const db = await run({ demonstrativo: [demo(), demo({ id: 102, protocolo: "OUTRO-PROTO", erro_tiss: "Outro erro" })] });
      expect(db.rows()[0]).toMatchObject({ valorFaturado: "0.30", valorPago: "0.20", valorGlosa: "0.10", motivoGlosa: "Motivo próprio fictício", protocoloTiss: "", erroTiss: "Motivo próprio fictício" });
    });
    it("ID exato ignora filtros descritivos legados e vence duplicados", async () => {
      const db = await run({
        conciliados_automatico: [ca({ recebimentoOrigem: "demonstrativo", recebimentoId: 102 })],
        demonstrativo: [demo(), demo({ id: 102, numero_guia: "GUIA-EXATA", data_execucao: "2026-09-01", sequencial_item: 9, protocolo: "EXATO", erro_tiss: "Erro exato" })],
        faturamento_unificado: [fu()], faturamento_tiss: [ft()],
      });
      expect(db.rows()[0]).toMatchObject({ protocoloTiss: "EXATO", erroTiss: "Erro exato", valorPago: "0.20" });
    });
    it.each([{ estabelecimentoId: 11 }, { convenio_id: 21 }])("ID explícito fora do escopo não recorre ao legado: %j", async scope => {
      const db = await run({ conciliados_automatico: [ca({ recebimentoOrigem: "demonstrativo", recebimentoId: 102 })], demonstrativo: [demo(), demo({ id: 102, ...scope })] });
      expect(db.rows()[0]).toMatchObject({ protocoloTiss: "", motivoGlosa: "Motivo próprio fictício" });
    });
    it.each([
      { recebimentoOrigem: "demonstrativo", recebimentoId: 999 },
      { recebimentoOrigem: "excel", recebimentoId: 101 },
      { recebimentoOrigem: "excel", recebimentoId: null },
      { recebimentoOrigem: "xml", recebimentoId: null },
      { recebimentoOrigem: null, recebimentoId: 101 },
    ])("não interpreta origem/ID incompatível como demonstrativo: %j", async link => {
      const db = await run({ conciliados_automatico: [ca(link)], demonstrativo: [demo()] });
      expect(db.rows()[0]).toMatchObject({ protocoloTiss: "", erroTiss: "Motivo próprio fictício" });
    });
    it("candidato único é restrito a hospital, convênio, guia, código e data disponíveis", async () => {
      const db = await run({ demonstrativo: [demo(), demo({ id: 102, estabelecimentoId: 11 }), demo({ id: 103, convenio_id: 21 }), demo({ id: 104, numero_guia: "OUTRA-GUIA" }), demo({ id: 105, codigo_item: "OUTRO-COD" }), demo({ id: 106, data_execucao: "2026-10-02" })] });
      expect(db.rows()[0]).toMatchObject({ protocoloTiss: "PROTO-FICTICIO-A", erroTiss: "Erro fictício A" });
    });
    it("usa sequência da origem XML e protocolo exato, não snapshot arbitrário", async () => {
      const db = await run({ faturamento_unificado: [fu()], faturamento_tiss: [ft()], demonstrativo: [demo(), demo({ id: 102, sequencial_item: 2 }), demo({ id: 103, protocolo: "OUTRO-PROTO" })] });
      expect(db.rows()[0].protocoloTiss).toBe("PROTO-FICTICIO-A");
    });
    it("dois candidatos com TODOS os descritores iguais permanecem ambíguos", async () => {
      const db = await run({ faturamento_unificado: [fu()], faturamento_tiss: [ft()], demonstrativo: [demo(), demo({ id: 102 })] });
      expect(db.rows()[0]).toMatchObject({ protocoloTiss: "", erroTiss: "Motivo próprio fictício" });
    });
    it("faturamento de outro convênio/guia não fornece protocolo para desempate", async () => {
      const db = await run({ faturamento_unificado: [fu({ convenioId: 21 })], faturamento_tiss: [ft()], demonstrativo: [demo(), demo({ id: 102, protocolo: "OUTRO-PROTO" })] });
      expect(db.rows()[0].protocoloTiss).toBe("");
    });
    it("origem XML sem PK vinculada não fornece sequência para desempate", async () => {
      const db = await run({ faturamento_unificado: [fu({ origemId: "999" })], faturamento_tiss: [ft()], demonstrativo: [demo(), demo({ id: 102, sequencial_item: 2 })] });
      expect(db.rows()[0].protocoloTiss).toBe("");
    });
    it("preserva procedimentos repetidos legítimos e total financeiro da exportação", async () => {
      const db = await run({ conciliados_automatico: [ca({ recebimentoOrigem: "demonstrativo", recebimentoId: 101 }), ca({ id: 202, recebimentoOrigem: "demonstrativo", recebimentoId: 102 })], demonstrativo: [demo(), demo({ id: 102, sequencial_item: 2 })] });
      expect(db.rows().map(row => row.id)).toEqual([201, 202]);
      if (!Array.isArray(db.result)) expect(db.result.totais).toMatchObject({ totalItens: 2, totalValorFaturado: 0.6, totalValorPago: 0.4, totalValorGlosa: 0.2 });
    });
  });
}

const oddText = "FICTICIO\\' OR 1=1 -- \" %_";
function captureDb(rows: unknown[][] = [[]]) {
  const execute = vi.fn();
  for (const row of rows) execute.mockResolvedValueOnce([row]);
  mocks.getDb.mockResolvedValue({ execute });
  return execute;
}

describe("Issue163 — parâmetros e nomes físicos", () => {
  it.each([oddText, "FICTICIO'", "FICTICIO\\", 'FICTICIO"'])("busca manual conserva aspas/backslash nos parâmetros: %s", async termo => {
    const execute = captureDb();
    await buscarGuiaFaturamentoParaGlosaManual({ estabelecimentoId: 10, convenioId: 20, termo });
    const compiled = build(execute.mock.calls[0][0]);
    expect(compiled.sql).toContain("fu.lotePrestador AS lote");
    expect(compiled.sql).not.toMatch(/fu\.lote\b/);
    expect(compiled.sql).not.toContain(termo);
    expect(compiled.params).toEqual([10, 20, `%${termo}%`, `%${termo}%`, `%${termo}%`]);
  });
  it("busca vazia não consulta e DTO mantém lote contratual e dois procedimentos", async () => {
    const execute = captureDb([[{ id: 1, numeroGuia: "GUIA-FICTICIA", convenioId: 20, lote: "LOTE-FICTICIO", codigoItem: "PROC", valorFaturado: "10.00" }, { id: 2, numeroGuia: "GUIA-FICTICIA", convenioId: 20, lote: "LOTE-FICTICIO", codigoItem: "PROC", valorFaturado: "20.00" }]]);
    expect(await buscarGuiaFaturamentoParaGlosaManual({ estabelecimentoId: 10, termo: "  " })).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
    const result = await buscarGuiaFaturamentoParaGlosaManual({ estabelecimentoId: 10, termo: "GUIA" });
    expect(result[0]).toMatchObject({ lote: "LOTE-FICTICIO", valorTotalFaturado: 30 });
    expect(result[0].itens).toHaveLength(2);
  });
  it("exportação demonstrativo parametriza recorte e busca mantendo arrays sobre scalars", async () => {
    const execute = captureDb([[], []]);
    await exportarPlanilhaRecursoDemonstrativo({ estabelecimentoId: 10, convenioId: 20, competencia: "2026-01", competencias: ["2026-02", "2026-03"], dataPagto: "2026-01-01", datasPagto: ["2026-02-10"], busca: oddText, apenasRecursados: true });
    const compiled = build(execute.mock.calls[1][0]);
    expect(compiled.sql).not.toContain(oddText);
    expect(compiled.params).toEqual([10, 20, "2026-02", "2026-03", "2026-02-10", ...Array(5).fill(`%${oddText}%`)]);
    expect(compiled.sql).toContain("d.lote_prestador AS lote");
    expect(compiled.sql).toContain("d.justificativa_recurso IS NOT NULL");
    expect(compiled.sql).not.toMatch(/d\.competencia\b/);
  });
  it("exportação Todas explícita não volta a aplicar scalar", async () => {
    const execute = captureDb([[], []]);
    await exportarPlanilhaRecursoDemonstrativo({ estabelecimentoId: 10, competencia: "2026-01", competencias: [], dataPagto: "2026-01-01", datasPagto: [] });
    expect(build(execute.mock.calls[1][0]).params).toEqual([10]);
  });
  it("exportação rejeita recorte calendário inválido antes de acessar banco", async () => {
    await expect(exportarPlanilhaRecursoDemonstrativo({ estabelecimentoId: 10, datasPagto: ["2026-02-29"] })).rejects.toThrow();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("exportação demonstrativo preserva DTO frontend e valores financeiros legados", async () => {
    captureDb([[], [{ guia: "GUIA-FICTICIA", protocolo: "PROTO-FICTICIO", lote: "LOTE-FICTICIO", sequencialItem: 2, valorGlosa: "10.00", valorRecursado: "7.00", glosaAceita: 0, dataAtendimento: "2026-10-01", erroTiss: "Erro fictício", convenioNome: "Convênio fictício" }]]);
    const result = await exportarPlanilhaRecursoDemonstrativo({ estabelecimentoId: 10 });
    expect(result.dados[0]).toMatchObject({ "Protocolo TISS": "PROTO-FICTICIO", "Lote Prestador": "LOTE-FICTICIO", "Valor Glosado": 10, "Valor Recursado": 7, "Data Atendto": "01/10/2026" });
    expect(result.totais).toEqual({ totalItens: 1, totalValorGlosado: 10, totalValorRecursado: 7 });
  });
  it.each([
    { name: "detalhes", call: () => itensConciliadosPorGuia({ estabelecimentoId: 10, numeroGuia: oddText, contaNumero: oddText }), expected: [10, oddText, oddText] },
    { name: "guia", call: () => itensGlosadosDetalheGuia({ estabelecimentoId: 10, numeroGuia: oddText, convenioId: 20, competencia: oddText, dataPagto: "2026-10-10" }), expected: [10, oddText, 20, `${oddText}%`, "2026-10-10", "2026-10-10"] },
    { name: "item", call: () => itensGlosadosDetalhePorItem({ estabelecimentoId: 10, codigoItem: oddText, convenioId: 20, competencia: oddText }), expected: [10, oddText, 20, `${oddText}%`] },
    { name: "motivo", call: () => itensGlosadosDetalhePorMotivo({ estabelecimentoId: 10, codigoGlosa: oddText, convenioId: 20, competencia: oddText }), expected: [10, oddText, 20, `${oddText}%`] },
    { name: "excel", call: () => gerarExcelRecursoConciliacao({ estabelecimentoId: 10, guias: [oddText, "OUTRA-GUIA"], itensIds: [201, 202], convenioId: 20, competencia: oddText }), expected: [10, oddText, "OUTRA-GUIA", 201, 202, 20, `${oddText}%`] },
  ])("filtros de $name sem interpolação/escape manual", async test => {
    const execute = captureDb();
    await test.call();
    const compiled = build(execute.mock.calls[0][0]);
    expect(compiled.sql).not.toContain(oddText);
    expect(compiled.params).toEqual(test.expected);
  });
  it.each([
    { origem: "demonstrativo", hospital: 10, convenio: 20 },
    { origem: "excel", hospital: 11, convenio: 20 },
    { origem: "excel", hospital: 10, convenio: 21 },
  ])("join Excel não confunde IDs homônimos nem cruza escopo: %j", async scope => {
    const db = memoryDb({ conciliados_automatico: [ca({ recebimentoOrigem: scope.origem, recebimentoId: 101 })], demonstrativo: [demo()], recebimentos_excel: [{ id: 101, estabelecimentoId: scope.hospital, convenioId: scope.convenio, data_execucao: "2099-01-01" }] });
    await itensGlosadosDetalheGuia({ estabelecimentoId: 10, numeroGuia: "GUIA-FICTICIA" });
    expect(db.rows()[0].dataExecucao).toBe("2026-10-01 09:00:00");
    expect(build(db.execute.mock.calls[0][0]).sql).toContain("re.convenioId = ca.convenioId");
  });
});

const input: manual.RegistrarGlosaManualInput = {
  estabelecimentoId: 10, convenioId: 20, userId: 30, idempotencyKey: "29fa1c35-089c-442b-b956-e927b53f7781",
  numeroGuia: "GUIA-FICTICIA", nomeBeneficiario: "Pessoa fictícia", dataPagamento: "2026-10-10",
  itens: [{ codigoItem: "PROC-FICTICIO", descricaoItem: "Procedimento fictício", valorInformado: 30, valorPago: 20, valorGlosa: 10, justificativa: "Justificativa fictícia" }],
};
describe("Issue163 — wrapper manual integrado", () => {
  it("chave ausente falha antes de qualquer acesso ao banco no wrapper real", async () => {
    await expect(lancarGlosaManualDemonstrativo({ ...input, idempotencyKey: undefined } as unknown as manual.RegistrarGlosaManualInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("delega payload, userId e chave obrigatória ao helper sem pós-sincronização", async () => {
    const dto: manual.RegistrarGlosaManualResult = { success: true, totalInseridos: 1, idsInseridos: [901], dataPagamento: "2026-10-10", competencia: "2026-10" };
    const safe = vi.spyOn(manual, "registrarGlosaManualSegura").mockResolvedValue(dto);
    expect(await lancarGlosaManualDemonstrativo(input)).toBe(dto);
    expect(safe).toHaveBeenCalledTimes(1);
    expect(safe).toHaveBeenCalledWith(input);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getRawPool).not.toHaveBeenCalled();
  });
  it("wrapper real usa uma transação com âncora, item, recurso e vínculo exato", async () => {
    const execute = vi.fn(async (query: unknown) => {
      const text = build(query).sql;
      if (text.includes("FROM estabelecimentos")) return [[{ id: 10, ativo: "sim" }]];
      if (text.includes("FROM users")) return [[{ id: 30, role: "admin" }]];
      if (text.includes("FROM convenios")) return [[{ id: 20, estabelecimentoId: 10, ativo: "sim" }]];
      if (text.includes("FROM arquivos") || text.includes("FROM motivosGlosa")) return [[]];
      if (text.includes("INSERT INTO arquivos")) return [{ insertId: 800 }];
      if (text.includes("INSERT INTO demonstrativo")) return [{ insertId: 901 }];
      if (text.includes("INSERT INTO recursosGlosa")) return [{ insertId: 910 }];
      if (text.includes("UPDATE demonstrativo")) return [{ affectedRows: 1 }];
      throw new Error("SQL fora do wrapper transacional");
    });
    const transaction = vi.fn(async (callback: (tx: any) => unknown) => callback({ execute }));
    const outside = vi.fn(() => { throw new Error("SQL fora da transação proibida"); });
    mocks.getDb.mockResolvedValue({ transaction, execute: outside });
    expect(await lancarGlosaManualDemonstrativo(input)).toEqual({ success: true, totalInseridos: 1, idsInseridos: [901], dataPagamento: "2026-10-10", competencia: "2026-10" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    expect(build(execute.mock.calls[0][0]).sql).toMatch(/FROM estabelecimentos[\s\S]*FOR UPDATE/);
    const queries = execute.mock.calls.map(([query]) => build(query));
    expect(queries.filter(q => q.sql.includes("INSERT INTO demonstrativo"))).toHaveLength(1);
    expect(queries.find(q => q.sql.includes("INSERT INTO demonstrativo"))!.params).toContain(800);
    expect(queries.find(q => q.sql.includes("UPDATE demonstrativo"))!.params).toEqual([910, 901, 800, 10, 20]);
    expect(mocks.getRawPool).not.toHaveBeenCalled();
  });
  it("propaga falha da transação e não retorna sucesso parcial", async () => {
    const error = new Error("Rollback sintético");
    const safe = vi.spyOn(manual, "registrarGlosaManualSegura").mockRejectedValue(error);
    await expect(lancarGlosaManualDemonstrativo(input)).rejects.toBe(error);
    expect(safe).toHaveBeenCalledTimes(1);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
