import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const { storageGet, extrairChaveXmlDaUrl, extrairRecursosDoXml } = vi.hoisted(() => ({
  storageGet: vi.fn(),
  extrairChaveXmlDaUrl: vi.fn(),
  extrairRecursosDoXml: vi.fn(),
}));

// Uma tentativa de abrir conexão real faz o teste falhar imediatamente.
vi.mock("mysql2/promise", () => ({ createPool: () => { throw new Error("Banco real proibido"); } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => { throw new Error("Banco real proibido"); } }));
vi.mock("./storage", () => ({ storageGet }));
vi.mock("./recursoExcelFallback", () => ({ extrairChaveXmlDaUrl, extrairRecursosDoXml }));

import { getDetalhesLoteRecurso, getRecursosLoteParaExportacao } from "./db";

type Row = Record<string, string | number | null>;
const dialect = new MySqlDialect();
const lote = {
  id: 71, numeroLote: "LOTE-FICTICIO", estabelecimentoId: 10, convenioId: 20,
  status: "pendente_envio", quantidadeItens: 2, valorTotalRecebido: "0.00",
  valorTotalRecuperado: "0.00", xmlUrl: null, protocoloEnvio: null,
};
const columns = {
  conciliados_automatico: ["id", "faturamentoUnificadoId", "estabelecimentoId", "convenioId", "numeroGuia", "codigoItem", "dataExecucao", "recebimentoOrigem", "recebimentoId", "xmlRecursoLoteId", "pacienteNome", "descricaoItem", "valorGlosa", "valorRecurso", "valorPago", "statusRecursoItem", "motivoGlosa", "codigoGlosa", "quantidade"],
  demonstrativo: ["id", "estabelecimentoId", "convenio_id", "numero_guia", "codigo_item", "data_execucao", "sequencial_item", "protocolo", "erro_tiss", "codigo_glosa", "recurso_id", "nome_beneficiario", "carteira_beneficiario", "descricao_item", "valor_glosa", "valor_recurso", "valor_pago", "data_pagamento", "data_referencia", "recurso_status", "justificativa_recurso", "quantidade"],
  faturamento_unificado: ["id", "estabelecimentoId", "convenioId", "numeroGuia", "codigoItem", "dataExecucao", "origemSistema", "origemId", "protocolo"],
  faturamento_tiss: ["id", "estabelecimentoId", "convenioId", "numero_guia_prestador", "numero_guia_operadora", "codigo_item", "data_execucao", "sequencial_item"],
};
type Fixtures = Partial<Record<keyof typeof columns, Row[]>>;

function ca(overrides: Row = {}): Row {
  return {
    id: 201, faturamentoUnificadoId: 401, estabelecimentoId: 10, convenioId: 20,
    numeroGuia: "GUIA-FICTICIA", codigoItem: "PROC-FICTICIO", dataExecucao: "2026-10-01 09:00:00",
    recebimentoOrigem: null, recebimentoId: null, xmlRecursoLoteId: 71,
    pacienteNome: "Pessoa fictícia", descricaoItem: "Item fictício", valorGlosa: "0.10",
    valorRecurso: "0.10", valorPago: "0.20", statusRecursoItem: "iniciado",
    motivoGlosa: "Motivo próprio fictício", codigoGlosa: "COD-FICTICIO", quantidade: "1",
    ...overrides,
  };
}

function demo(overrides: Row = {}): Row {
  return {
    id: 101, estabelecimentoId: 10, convenio_id: 20, numero_guia: "GUIA-FICTICIA",
    codigo_item: "PROC-FICTICIO", data_execucao: "2026-10-01", sequencial_item: 1,
    protocolo: "PROTO-FICTICIO-A", erro_tiss: "Erro fictício A", codigo_glosa: "COD-DEMO",
    recurso_id: null, nome_beneficiario: "Pessoa fictícia demo", carteira_beneficiario: "C-FICTICIA",
    descricao_item: "Item fictício demo", valor_glosa: "99.00", valor_recurso: "99.00",
    valor_pago: "88.00", data_pagamento: "2026-10-10", data_referencia: "2026-10-01",
    recurso_status: "recurso_criado", justificativa_recurso: "Texto fictício", quantidade: "1",
    ...overrides,
  };
}

function fu(overrides: Row = {}): Row {
  return {
    id: 401, estabelecimentoId: 10, convenioId: 20, numeroGuia: "GUIA-FICTICIA",
    codigoItem: "PROC-FICTICIO", dataExecucao: "2026-10-01 09:00:00", origemSistema: "XML_TISS",
    origemId: "501", protocolo: "PROTO-FICTICIO-A", ...overrides,
  };
}

function ft(overrides: Row = {}): Row {
  return {
    id: 501, estabelecimentoId: 10, convenioId: 20, numero_guia_prestador: "GUIA-FICTICIA",
    numero_guia_operadora: "GUIA-FICTICIA", codigo_item: "PROC-FICTICIO",
    data_execucao: "2026-10-01 09:00:00", sequencial_item: 1, ...overrides,
  };
}

function queryChain(result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain), where: vi.fn(() => chain), orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/** Simula resultados de db.execute com SELECT sobre VALUES/CTEs, sem CREATE/DDL. */
function mockSqlDb(fixtures: Fixtures, exportacao = false) {
  const selectResults = exportacao
    ? [[lote], [], [{ id: 20, nome: "Convênio fictício" }]]
    : [[lote], [], [{ id: 20, nome: "Convênio fictício" }], [{ id: 10, nome: "Hospital fictício" }]];
  return {
    select: vi.fn(() => queryChain(selectResults.shift() ?? [])),
    execute: vi.fn(async (query: unknown) => {
      const built = dialect.sqlToQuery(query as any);
      expect(built.sql.trim()).toMatch(/^SELECT\b/i);
      // faturamento_tiss (utf8mb4_unicode_ci) x demais tabelas (utf8mb4_general_ci):
      // sem COLLATE explícito o MySQL falha com ER 1267 (Illegal mix of collations).
      expectSemSubqueryEmOn(built.sql);
      if (/LEFT JOIN faturamento_tiss ft/.test(built.sql)) {
        expect(built.sql).toMatch(/CAST\(ft\.id AS CHAR\) COLLATE utf8mb4_general_ci = fu\.origemId/);
        expect(built.sql).toMatch(/ft\.numero_guia_prestador = ca\.numeroGuia COLLATE utf8mb4_unicode_ci/);
        expect(built.sql).toMatch(/ft\.numero_guia_operadora = ca\.numeroGuia COLLATE utf8mb4_unicode_ci/);
        expect(built.sql).toMatch(/ft\.codigo_item = ca\.codigoItem COLLATE utf8mb4_unicode_ci/);
      }
      const params: Array<string | number | bigint | null> = [];
      const ctes = Object.entries(columns).map(([table, names]) => {
        const rows = fixtures[table as keyof Fixtures] ?? [];
        const values = rows.length
          ? "VALUES " + rows.map(row => {
            params.push(...names.map(name => {
              const value = row[name] ?? null;
              return typeof value === "number" && Number.isInteger(value) ? BigInt(value) : value;
            }));
            return "(" + names.map(() => "?").join(",") + ")";
          }).join(",")
          : "SELECT " + names.map(() => "NULL").join(",") + " WHERE 0";
        return `${table}(${names.join(",")}) AS (${values})`;
      });
      const memory = new DatabaseSync(":memory:");
      try {
        // SQLite trata CHAR como afinidade numérica; simula o CAST textual MySQL.
        // O SQL original continua verificado estruturalmente acima, sem alterações.
        // COLLATE utf8mb4_* (MySQL) não existe no SQLite e é removido apenas na simulação.
        const simulatedSql = built.sql
          .replace(/CAST\(ft\.id AS CHAR\)/g, "CAST(ft.id AS TEXT)")
          .replace(/\s+COLLATE\s+utf8mb4_\w+/g, "");
        const rows = memory.prepare(`WITH ${ctes.join(",")} ${simulatedSql}`).all(...params, ...built.params);
        return [rows];
      } finally {
        memory.close();
      }
    }),
  };
}

async function detalhes(fixtures: Fixtures) {
  const db = mockSqlDb({ conciliados_automatico: [ca()], ...fixtures });
  const result = await getDetalhesLoteRecurso(71, db);
  expect(result!.itens).toHaveLength(fixtures.conciliados_automatico?.length ?? 1);
  return result!;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** TiDB rejeita subquery em condição ON ("ON condition doesn't support subqueries yet"). */
function expectSemSubqueryEmOn(sqlText: string) {
  const trechosOn = sqlText.split(/\bON\b/).slice(1)
    .map(trecho => trecho.split(/\b(?:LEFT JOIN|INNER JOIN|JOIN|WHERE|ORDER BY|GROUP BY)\b|\)\s*ca\b/)[0]);
  for (const trecho of trechosOn) expect(trecho).not.toMatch(/\bSELECT\b/i);
}
describe("Issue163 — vínculo descritivo de lote sem multiplicação", () => {
  it.each([false, true])("usa SQL parametrizada, nomes físicos e unicidade explícita (exportação=%s)", async exportacao => {
    const db = mockSqlDb({ conciliados_automatico: [ca()] }, exportacao);
    if (exportacao) await getRecursosLoteParaExportacao(71, db);
    else await getDetalhesLoteRecurso(71, db);
    for (const [query] of db.execute.mock.calls) {
      const built = dialect.sqlToQuery(query as any);
      expect(built.params).toEqual([71, 10, 20]);
      expect(built.sql).not.toMatch(/\bDISTINCT\b|\bLIMIT\s+1\b/i);
    }
    const sql = dialect.sqlToQuery(db.execute.mock.calls[1][0] as any).sql;
    expect(sql).toMatch(/d\.estabelecimentoId = ca\.estabelecimentoId[\s\S]*d\.convenio_id = ca\.convenioId/);
    expect(sql).toMatch(/WHEN ca\.recebimentoOrigem = 'demonstrativo' AND ca\.recebimentoId IS NOT NULL\s+THEN ca\.recebimentoId/);
    expect(sql).toMatch(/LEFT JOIN demonstrativo d\s+ON d\.id = ca\.demonstrativoVinculadoId/);
    expect(sql).toMatch(/ca\.recebimentoId IS NULL[\s\S]*SELECT MIN\(candidato\.id\)[\s\S]*HAVING COUNT\(\*\) = 1/);
    expect(sql).toMatch(/candidato\.data_execucao = DATE\(COALESCE\(ca\.dataExecucao, fu\.dataExecucao, ft\.data_execucao\)\)/);
    expect(sql).toMatch(/candidato\.sequencial_item = ft\.sequencial_item/);
    expect(sql).toMatch(/candidato\.protocolo = TRIM\(fu\.protocolo\)/);
    expect(sql).toMatch(/CAST\(ft\.id AS CHAR\) COLLATE utf8mb4_general_ci = fu\.origemId/);
  });

  it("prioriza ID exato sobre candidatos com mesma guia/código, sem reaplicar filtros legados", async () => {
    const result = await detalhes({
      conciliados_automatico: [ca({ recebimentoOrigem: "demonstrativo", recebimentoId: 102 })],
      demonstrativo: [demo(), demo({ id: 102, data_execucao: "2026-09-01", sequencial_item: 9, protocolo: "PROTO-EXATO", erro_tiss: "Erro exato" })],
      faturamento_unificado: [fu()], faturamento_tiss: [ft()],
    });
    expect(result.itens[0]).toMatchObject({ protocolo: "PROTO-EXATO", erroTiss: "Erro exato", valorPagoOriginal: "0.20" });
  });

  it.each([
    { estabelecimentoId: 11 }, { convenio_id: 21 },
  ])("ID explícito não atravessa escopo nem recorre ao legado: %j", async foraEscopo => {
    const result = await detalhes({
      conciliados_automatico: [ca({ recebimentoOrigem: "demonstrativo", recebimentoId: 102 })],
      demonstrativo: [demo(), demo({ id: 102, ...foraEscopo })],
    });
    expect(result.itens[0]).toMatchObject({ protocolo: null, erroTiss: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it.each([
    { recebimentoOrigem: "demonstrativo", recebimentoId: 999 },
    { recebimentoOrigem: "excel", recebimentoId: 101 },
    { recebimentoOrigem: "excel", recebimentoId: null },
    { recebimentoOrigem: "xml", recebimentoId: null },
    { recebimentoOrigem: null, recebimentoId: 101 },
  ])("não reinterpreta vínculo ausente/incompatível como demonstrativo: %j", async vinculo => {
    const result = await detalhes({ conciliados_automatico: [ca(vinculo)], demonstrativo: [demo()] });
    expect(result.itens[0]).toMatchObject({ protocolo: null, erroTiss: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it("legado só considera candidatos do hospital e convênio da conciliação", async () => {
    const result = await detalhes({ demonstrativo: [
      demo(), demo({ id: 102, estabelecimentoId: 11 }), demo({ id: 103, convenio_id: 21 }),
    ] });
    expect(result.itens[0]).toMatchObject({ protocolo: "PROTO-FICTICIO-A", erroTiss: "Erro fictício A" });
  });

  it("não escolhe entre demonstrativos indistinguíveis e preserva duas conciliações legítimas repetidas", async () => {
    const fixture = {
      conciliados_automatico: [ca(), ca({ id: 202 })],
      demonstrativo: [demo(), demo({ id: 102, protocolo: "PROTO-FICTICIO-B", erro_tiss: "Erro fictício B" })],
    };
    const result = await detalhes(fixture);
    expect(result.itens.map((item: any) => item.chaveItem)).toEqual(["conciliacao-201", "conciliacao-202"]);
    for (const item of result.itens) {
      expect(item).toMatchObject({ protocolo: null, erroTiss: null, motivoGlosa: "Motivo próprio fictício", valorGlosado: "0.10", valorPagoOriginal: "0.20" });
    }
    expect(result).toMatchObject({ totalRecursos: 2, valorTotalPagoOriginal: "0.40", valorTotalRecebidoRecurso: "0.00", valorTotalAcatado: "0.00" });
    const exported = await getRecursosLoteParaExportacao(71, mockSqlDb(fixture, true));
    expect(exported!.recursos).toHaveLength(2);
    expect(exported!.recursos.map(item => item.protocoloDP)).toEqual(["", ""]);
    expect(exported!.recursos.map(item => item.motivoGlosa)).toEqual(["Motivo próprio fictício", "Motivo próprio fictício"]);
    expect(exported!.totais).toMatchObject({ totalItens: 2, totalValorGlosado: 0.2, totalValorRecursado: 0.2, totalValorPagoOriginal: 0.4, totalValorRecebidoRecurso: 0, totalValorAcatado: 0 });
  });

  it("valida data, sequência e protocolo juntos antes de contar candidatos", async () => {
    const fixture = {
      demonstrativo: [demo(),
        demo({ id: 102, data_execucao: "2026-10-02" }),
        demo({ id: 103, sequencial_item: 2 }),
        demo({ id: 104, protocolo: "PROTO-FICTICIO-B" }),
      ],
      faturamento_unificado: [fu()], faturamento_tiss: [ft()],
    };
    const result = await detalhes(fixture);
    expect(result.itens[0]).toMatchObject({ protocolo: "PROTO-FICTICIO-A", erroTiss: "Erro fictício A" });
    const exported = await getRecursosLoteParaExportacao(71, mockSqlDb({ conciliados_automatico: [ca()], ...fixture }, true));
    expect(exported!.recursos[0]).toMatchObject({ protocoloDP: "PROTO-FICTICIO-A", protocoloTiss: "PROTO-FICTICIO-A", erroTiss: "Erro fictício A", valorGlosado: 0.1, valorPagoOriginal: 0.2 });
  });

  it.each([
    { data_execucao: "2026-10-02" }, { data_execucao: null },
    { sequencial_item: 2 }, { sequencial_item: null },
    { protocolo: "PROTO-FICTICIO-B" }, { protocolo: null },
  ])("candidato único ainda é rejeitado quando uma identidade disponível diverge: %j", async divergencia => {
    const result = await detalhes({ demonstrativo: [demo(divergencia)], faturamento_unificado: [fu()], faturamento_tiss: [ft()] });
    expect(result.itens[0]).toMatchObject({ protocolo: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it("não ignora ambiguidade mesmo com data, sequência e protocolo iguais", async () => {
    const result = await detalhes({ demonstrativo: [demo(), demo({ id: 102 })], faturamento_unificado: [fu()], faturamento_tiss: [ft()] });
    expect(result.itens[0]).toMatchObject({ protocolo: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it("consulta legado sem identidades opcionais só enriquece candidato único", async () => {
    const result = await detalhes({ conciliados_automatico: [ca({ dataExecucao: null })], demonstrativo: [demo()] });
    expect(result.itens[0]).toMatchObject({ protocolo: "PROTO-FICTICIO-A" });
  });

  it.each([
    { estabelecimentoId: 11 }, { convenioId: 21 }, { numeroGuia: "OUTRA-GUIA" }, { codigoItem: "OUTRO-CODIGO" },
  ])("faturamento fora da identidade não fornece protocolo/sequência: %j", async divergencia => {
    const result = await detalhes({ demonstrativo: [demo(), demo({ id: 102, protocolo: "PROTO-FICTICIO-B" })], faturamento_unificado: [fu(divergencia)], faturamento_tiss: [ft()] });
    expect(result.itens[0]).toMatchObject({ protocolo: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it.each([
    { estabelecimentoId: 11 }, { convenioId: 21 }, { codigo_item: "OUTRO-CODIGO" }, { numero_guia_prestador: "OUTRA-GUIA", numero_guia_operadora: "OUTRA-GUIA" },
  ])("origem XML fora da identidade não fornece sequência: %j", async divergencia => {
    const result = await detalhes({ demonstrativo: [demo(), demo({ id: 102, sequencial_item: 2 })], faturamento_unificado: [fu()], faturamento_tiss: [ft(divergencia)] });
    expect(result.itens[0]).toMatchObject({ protocolo: null, motivoGlosa: "Motivo próprio fictício" });
  });

  it.each([{ numeroGuia: "" }, { codigoItem: "" }])("não liga legado com chave vazia: %j", async vazio => {
    const result = await detalhes({ conciliados_automatico: [ca(vazio)], demonstrativo: [demo({ numero_guia: vazio.numeroGuia ?? "GUIA-FICTICIA", codigo_item: vazio.codigoItem ?? "PROC-FICTICIO" })] });
    expect(result.itens[0]).toMatchObject({ protocolo: null });
  });

  it("ausência de demonstrativo preserva a conciliação e seus valores", async () => {
    const result = await detalhes({ demonstrativo: [] });
    expect(result.itens[0]).toMatchObject({ id: 201, protocolo: null, motivoGlosa: "Motivo próprio fictício", valorGlosado: "0.10", valorPagoOriginal: "0.20" });
  });
});

describe("Issue163 — complemento XML da exportação não escolhe candidato arbitrário", () => {
  it.each([0, 1, 2])("aceita complemento apenas com exatamente um resultado (candidatos=%s)", async count => {
    const xmlLote = { ...lote, xmlUrl: "https://ficticio.invalid/recursos-glosa/lote.xml" };
    const complementos = Array.from({ length: count }, (_, index) => ({
      pacienteNome: `Pessoa fictícia ${index}`, protocolo: "PROTO-XML-FICTICIO", erroTiss: "Erro XML fictício", quantidade: "9",
    }));
    const complementoChain = queryChain(complementos);
    const selects = [queryChain([xmlLote]), queryChain([]), complementoChain, queryChain([{ nome: "Convênio fictício" }])];
    const db = { select: vi.fn(() => selects.shift()), execute: vi.fn(async () => [[]]) };
    storageGet.mockResolvedValue({ url: "https://ficticio.invalid/download" });
    extrairChaveXmlDaUrl.mockReturnValue("recursos-glosa/ficticio.xml");
    extrairRecursosDoXml.mockReturnValue([{ guiaNumero: "GUIA-XML-FICTICIA", codigoProcedimento: "PROC-XML-FICTICIO", protocoloDP: "PROTO-XML-FICTICIO", dataAtendimento: "2026-10-01", valorRecursado: 0.1, codigoGlosa: "COD-XML", justificativa: "Texto fictício" }]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<xml-ficticio />" })));
    const result = await getRecursosLoteParaExportacao(71, db);
    expect(result!.recursos).toHaveLength(1);
    expect(complementoChain.limit).toHaveBeenCalledWith(2);
    const filter = dialect.sqlToQuery(complementoChain.where.mock.calls[0][0]);
    expect(filter.sql).toMatch(/`demonstrativo`\.`data_execucao` = \?/);
    expect(filter.sql).toMatch(/`demonstrativo`\.`protocolo` = \?/);
    expect(filter.params).toEqual([10, 20, "GUIA-XML-FICTICIA", "PROC-XML-FICTICIO", "2026-10-01", "PROTO-XML-FICTICIO"]);
    expect(result!.recursos[0]).toMatchObject({ protocoloDP: "PROTO-XML-FICTICIO", erroTiss: count === 1 ? "Erro XML fictício" : "COD-XML", quantidade: count === 1 ? 9 : 1, valorPagoOriginal: null, valorRecebidoRecurso: 0, valorAcatado: 0 });
    expect(result!.totais.totalValorRecursado).toBe(0.1);
  });
});
