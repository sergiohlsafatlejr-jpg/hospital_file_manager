import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import type { PainelBiExecutivoResponse } from "./painelBiPersonalizadoService";

// O módulo real db.ts nunca é importado; nem appRouter/ERP/storage são inicializados.
const state = vi.hoisted(() => ({ pool: null as any }));
vi.mock("./db", () => ({ getRawPool: async () => state.pool }));
import { buscarDadosPainelBiExecutivo } from "./painelBiPersonalizadoService";

type Row = Record<string, any>;
type Query = { sql: string; params: any[] };
const hospital = 101;
const periodo = "2026/10";
const plano = "Plano Sintético A";
const semDim = "Sem dimensão / Retorno sem atribuição exata";

function poolFixture(rows: Row[][] = [], handler?: (query: Query, index: number) => Row[] | undefined) {
  const queries: Query[] = [];
  let n = 0;
  const pool = {
    queries,
    async query(sql: string, params: any[]) {
      const query = { sql, params };
      queries.push(query);
      expect(sql).toMatch(/^\s*(SELECT|WITH)\b/);
      if (sql.includes("SELECT id, nome, cnpj FROM estabelecimentos")) {
        return [[{ id: hospital, nome: "Hospital Sintético A", cnpj: null }], []];
      }
      if (sql.includes("FROM estabelecimento_bi_personalizado")) return [[], []];
      const index = n++;
      return [handler?.(query, index) ?? rows[index] ?? [], []];
    },
    execute() { throw new Error("MUTAÇÃO_FINANCEIRA_PROIBIDA"); },
  };
  state.pool = pool;
  return pool;
}

function xmlRows() {
  const rows: Row[][] = [];
  rows[0] = [{ competencia: periodo, convenio: plano, faturado: 100, quantidade: 2 }];
  rows[1] = [{ competencia: periodo, convenio: plano, setor: "Setor A", faturado: 100, qtdContas: 1 }];
  rows[2] = [{ competencia: periodo, convenio: plano, tipo: "Procedimento", faturado: 100, qtdContas: 1 }];
  rows[4] = [{ qtdContas: 1, qtdItens: 2 }];
  rows[5] = [{ competencia: periodo, convenio: plano, recebido: 80, recebido_sem_vinculo: 80, glosado: 0, quantidade: 1 }];
  rows[6] = [{ setor: semDim, recebido: 80, glosado: 0, qtdGuias: 1 }];
  rows[7] = [{ tipo: semDim, recebido: 80, glosado: 0 }];
  return rows;
}

const cents = (n: number) => Math.round(n * 100);
function assertReconciliado(r: PainelBiExecutivoResponse) {
  for (const matrix of [r.porCompetencia, r.porConvenio, r.porSetor, r.porTipoItem]) {
    for (const key of ["produzido", "faturado", "recebido", "glosa", "aReceber"] as const) {
      expect(matrix.reduce((sum, row) => sum + cents(row[key]), 0), key).toBe(cents(r.resumo[key]));
    }
  }
}

// Executa apenas o subset SQL emitido pelo serviço contra tabelas sintéticas
// SQLite :memory:. Não é prova de compatibilidade do driver/TiDB físico.
const sqliteScript = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
c = sqlite3.connect(':memory:')
c.row_factory = sqlite3.Row
c.create_function('GREATEST', -1, lambda *args: max(args))
for table, rows in payload['tables'].items():
    cols = list(rows[0])
    c.execute('CREATE TABLE "' + table + '" (' + ','.join('"' + col + '"' for col in cols) + ')')
    c.executemany('INSERT INTO "' + table + '" VALUES (' + ','.join('?' for col in cols) + ')', [[row[col] for col in cols] for row in rows])
print(json.dumps([dict(row) for row in c.execute(payload['sql'], payload['params'])]))
`;
function sqlite(sql: string, params: any[], tables: Record<string, Row[]>): Row[] {
  return JSON.parse(execFileSync("/usr/bin/python3", ["-c", sqliteScript], {
    input: JSON.stringify({ sql, params, tables }), encoding: "utf8",
  }));
}

beforeEach(() => { state.pool = null; });

describe("BI-H01 — motivos hospital/global resolvidos antes do SUM", () => {
  function catalogoRows() {
    return [
      { id: 1, codigo: "X", descricao: "Global X", estabelecimentoId: null, ativo: "sim" },
      { id: 2, codigo: "X", descricao: "PRIVADO OUTRO HOSPITAL", estabelecimentoId: 202, ativo: "sim" },
      { id: 8, codigo: "X", descricao: "Local X duplicado", estabelecimentoId: hospital, ativo: "sim" },
      { id: 7, codigo: "X", descricao: "Local X escolhido", estabelecimentoId: hospital, ativo: "sim" },
      { id: 0, codigo: "X", descricao: "Local X inativo", estabelecimentoId: hospital, ativo: "nao" },
      { id: 3, codigo: "G", descricao: "Global G escolhido", estabelecimentoId: null, ativo: "sim" },
      { id: 4, codigo: "G", descricao: "Global G duplicado", estabelecimentoId: null, ativo: "sim" },
      { id: 5, codigo: "F", descricao: "PRIVADO OUTRO HOSPITAL", estabelecimentoId: 202, ativo: "sim" },
    ];
  }
  it("executa o SELECT real: prioridade local, menor id, globals únicos, fallback sem vazamento/fanout", async () => {
    const rows: Row[][] = [];
    rows[5] = [{ competencia: periodo, convenio: plano, recebido: 0, glosado: 40, quantidade: 4 }];
    rows[6] = [{ setor: semDim, recebido: 0, glosado: 40 }];
    rows[7] = [{ tipo: semDim, recebido: 0, glosado: 40 }];
    const p = poolFixture(rows, (query) => {
      if (!query.sql.includes("motivos_resolvidos AS")) return;
      const sql = "WITH " + query.sql.slice(query.sql.indexOf("motivos_resolvidos AS"));
      return sqlite(sql, [hospital], {
        motivosGlosa: catalogoRows().reverse(),
        retorno_final: [
          { codigo_glosa: "X", erro_tiss: "erro X", valor_glosa: 10, convenio_id: 1 },
          { codigo_glosa: "G", erro_tiss: "erro G", valor_glosa: 10, convenio_id: 1 },
          { codigo_glosa: "F", erro_tiss: "Fallback F", valor_glosa: 10, convenio_id: 1 },
          { codigo_glosa: "", erro_tiss: "", valor_glosa: 10, convenio_id: 1 },
        ],
        convenios: [{ id: 1, nome: plano }],
      });
    });
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    expect(r.porMotivoGlosa).toHaveLength(4);
    expect(r.porMotivoGlosa.reduce((t, x) => t + x.glosa, 0)).toBe(40);
    expect(r.porMotivoGlosa.reduce((t, x) => t + x.quantidade, 0)).toBe(4);
    expect(r.porMotivoGlosa.reduce((t, x) => t + x.pctParticipacao, 0)).toBe(100);
    expect(r.porMotivoGlosa.find(x => x.codigo === "X")?.motivo).toBe("Local X escolhido");
    expect(r.porMotivoGlosa.find(x => x.codigo === "G")?.motivo).toBe("Global G escolhido");
    expect(r.porMotivoGlosa.find(x => x.codigo === "F")?.motivo).toBe("Fallback F");
    expect(JSON.stringify(r)).not.toContain("PRIVADO OUTRO HOSPITAL");
    const sql = p.queries.find(q => q.sql.includes("motivos_resolvidos AS"))!.sql;
    expect(sql).not.toMatch(/LEFT JOIN motivosGlosa/);
    expect(sql.match(/LEFT JOIN motivos_resolvidos[^\n]*/)?.[0]).toBe("LEFT JOIN motivos_resolvidos mg ON mg.codigo=TRIM(d.codigo_glosa)");
    assertReconciliado(r);
  });

  it("insere parâmetro hospitalar do catálogo antes dos filtros da consulta", async () => {
    const p = poolFixture();
    await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML", competencias: [periodo], convenios: [plano], setores: ["Setor A"] });
    const q = p.queries.find(q => q.sql.includes("motivos_resolvidos AS"))!;
    expect(q.params).toEqual([hospital, hospital, hospital, hospital, hospital, periodo, plano, "Setor A"]);
    expect((q.sql.match(/\?/g) || []).length).toBe(q.params.length);
  });
});

describe("BI-H03 — base financeira XML única e cobertura explícita", () => {
  it("AUDIT DATA-01: retorno sem vínculo não reconhece de novo os 100 conhecidos", async () => {
    const p = poolFixture(xmlRows());
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    expect(r.resumo.faturado).toBe(100);
    expect(r.resumo.aReceber).toBe(20);
    expect(r.porSetor.find(x => x.chave === "Setor A")?.recebido).toBe(0);
    expect(r.porSetor.find(x => x.chave === semDim)).toMatchObject({ faturado: 0, recebido: 80, aReceber: -80, qtdContas: 0 });
    expect(r.porTipoItem.find(x => x.chave === semDim)?.faturado).toBe(0);
    assertReconciliado(r);
    expect(p.queries.every(q => q.params[0] === hospital)).toBe(true);
    expect(p.queries.some(q => /INSERT|UPDATE\s+\w+\s+SET|DELETE\s+FROM/.test(q.sql))).toBe(false);
  });

  it.each(["manual", "planilha"])("AUDIT DATA-02: %s faturado 100/recebido 40/glosa 10 incluído em tipo sem dimensão", async (origem) => {
    const rows: Row[][] = [];
    rows[8] = [{ id: 7001, competencia: periodo, convenio: plano, faturado: 100, recebido: 40, glosado: 10, origem }];
    poolFixture(rows);
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    expect(r.resumo).toMatchObject({ faturado: 100, recebido: 40, glosa: 10, aReceber: 50 });
    expect(r.porTipoItem.length).toBeGreaterThan(0);
    expect(r.porTipoItem.every(x => x.label.includes("Sem dimensão"))).toBe(true);
    assertReconciliado(r);
  });

  it("complementa por grupo faltante, não por total nem por tipo, e preserva XML prioritário sobre manual", async () => {
    const rows = xmlRows();
    rows[8] = [
      { id: 1, competencia: periodo, convenio: plano, faturado: 999, recebido: 5, glosado: 2, origem: "manual" },
      { id: 2, competencia: "2026/09", convenio: "Outro plano", faturado: 50, recebido: 20, glosado: 5, origem: "manual" },
    ];
    rows[5].push({ competencia: "2026/08", convenio: "Plano apenas retorno", recebido: 30, glosado: 10, quantidade: 1 });
    rows[6][0].recebido += 30; rows[6][0].glosado += 10;
    rows[7][0].recebido += 30; rows[7][0].glosado += 10;
    poolFixture(rows);
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    expect(r.resumo.faturado).toBe(190);
    expect(r.porSetor.find(x => x.chave === "Setor A")?.faturado).toBe(100);
    expect(r.porTipoItem.filter(x => x.label.includes("Faturado reconhecido")).reduce((s, x) => s + x.faturado, 0)).toBe(90);
    assertReconciliado(r);
  });

  it("não descarta sem competência; mantém saldo líquido por grupo com ajuste explícito do clamp global", async () => {
    const rows = xmlRows();
    rows[5][0].recebido = 180;
    rows[6][0].recebido = 180;
    rows[7][0].recebido = 180;
    rows[8] = [{ competencia: null, convenio: "Manual sem período", faturado: 50, recebido: 0, glosado: 0, origem: "manual" }];
    poolFixture(rows);
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    expect(r.resumo.aReceber).toBe(0);
    expect(r.porCompetencia.some(x => x.chave === "Sem competência" && x.faturado === 50)).toBe(true);
    for (const matrix of [r.porCompetencia, r.porConvenio, r.porSetor, r.porTipoItem]) {
      expect(matrix.find(x => x.chave === "BI_AJUSTE_SALDO_GLOBAL")).toMatchObject({ aReceber: 30, faturado: 0, recebido: 0, glosa: 0 });
    }
    assertReconciliado(r);
  });

  it("usa somente dimensão única do vínculo; MIN não adivinha setor/tipo ambíguo nem retorno sem vínculo", async () => {
    const p = poolFixture();
    await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML" });
    const sql = p.queries.find(q => q.sql.includes("AS qtdGuias"))!.sql;
    expect(sql).toContain("CASE WHEN COUNT(DISTINCT f.dim_setor)=1 THEN MIN(f.dim_setor) ELSE NULL END");
    expect(sql).toContain("CASE WHEN COUNT(DISTINCT f.tipo_item_vinculado)=1 THEN MIN(f.tipo_item_vinculado) ELSE NULL END");
    expect(sql).toContain(`COALESCE(v.dim_setor_vinculado, '${semDim}')`);
    expect(sql).toContain(`COALESCE(v.tipo_item_vinculado, '${semDim}')`);
    expect(p.queries.find(q => q.sql.includes("AS tipo,") && q.sql.includes("FROM retorno_final"))!.sql).toContain("GROUP BY d.tipo_dimensao");
  });

  it("recorte de setor não inclui complemento manual sem setor", async () => {
    const p = poolFixture();
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "XML", setores: ["Setor A"] });
    expect(p.queries.some(q => q.sql.includes("SELECT fe.id"))).toBe(false);
    assertReconciliado(r);
  });
});

function bancoLinha(source: "WARLEINE" | "RECEBIMENTO_GERAL", setor: string, fat: number, rec: number, glosa: number, saldo: number | null): Row {
  if (source === "WARLEINE") return {
    estabelecimentoId: hospital, competencia: periodo, convenioFaturadoCodigo: plano, convenioFaturadoNome: plano,
    tipoItem: setor, setorNome: setor, numeroConta: setor,
    valorFaturado: fat, valorTotalRecebido: rec, valorGlosa: glosa, valorAberto: saldo,
    valorRecursado: 0, valorGlosaRecuperada: 0, valorGlosaAceita: 0, valorGlosaAnalise: 0,
  };
  return {
    estabelecimentoId: hospital, mes_producao: periodo, convenio: plano, tipo_procedimento: setor, nome_setor: setor,
    numero_conta: setor, vl_faturado: fat, vl_total_recebido: rec, vl_recebido: rec, vl_glosas: glosa, vl_aberto: saldo,
    vl_recurso: 0, gl_recuperado: 0, gl_aceita: 0, gl_analise: 0,
  };
}

function bancoPool(source: "WARLEINE" | "RECEBIMENTO_GERAL", items: Row[], options: { colunaAusente?: boolean; outroErro?: boolean } = {}) {
  const table = source === "WARLEINE" ? "warleine_faturamento_itens_ativos" : "recebimento_geral";
  const coluna = source === "WARLEINE" ? "valorAberto" : "vl_aberto";
  return poolFixture([], q => {
    if (!q.sql.includes(" AS aReceber")) return [];
    if (options.colunaAusente && q.sql.includes(coluna)) {
      throw Object.assign(new Error(`Unknown column '${options.outroErro ? "outra_coluna" : coluna}' in 'field list'`), { code: "ER_BAD_FIELD_ERROR", errno: 1054 });
    }
    expect(q.sql).not.toContain(`SUM(${coluna})`);
    return sqlite(q.sql, q.params, { [table]: items });
  });
}

describe.each(["RECEBIMENTO_GERAL", "WARLEINE"] as const)("BI-H04 — %s saldo antes da agregação", (source) => {
  it("AUDIT DATA-03: saldo 20 e zero informado permanecem 20 em resumo e todas matrizes", async () => {
    bancoPool(source, [bancoLinha(source, "Setor A", 100, 80, 0, 20), bancoLinha(source, "Setor B", 100, 0, 0, 0)]);
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "BANCO_CSV", subFonteBanco: source });
    expect(r.resumo.aReceber).toBe(20);
    expect(r.porSetor.find(x => x.chave === "Setor B")?.aReceber).toBe(0);
    assertReconciliado(r);
  });

  it("NULL estima por linha, zero/negativo informado prevalece, e excesso não cancela outra linha ausente", async () => {
    bancoPool(source, [
      bancoLinha(source, "A", 100, 80, 0, 20),
      bancoLinha(source, "B", 100, 0, 0, null),
      bancoLinha(source, "C", 100, 150, 0, null),
      bancoLinha(source, "D", 100, 0, 0, 0),
      bancoLinha(source, "E", 100, 0, 0, -5),
    ]);
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "BANCO_CSV", subFonteBanco: source });
    expect(r.resumo.aReceber).toBe(115);
    expect(r.porSetor.find(x => x.chave === "B")?.aReceber).toBe(100);
    expect(r.porSetor.find(x => x.chave === "C")?.aReceber).toBe(0);
    expect(r.porSetor.find(x => x.chave === "D")?.aReceber).toBe(0);
    expect(r.porSetor.find(x => x.chave === "E")?.aReceber).toBe(-5);
    assertReconciliado(r);
  });

  it("legacy sem coluna usa fallback por linha, não após SUM, e somente queries necessárias são repetidas", async () => {
    const coluna = source === "WARLEINE" ? "valorAberto" : "vl_aberto";
    const rows = [bancoLinha(source, "A", 100, 150, 0, null), bancoLinha(source, "B", 100, 0, 0, null)];
    rows.forEach(row => delete row[coluna]);
    const p = bancoPool(source, rows, { colunaAusente: true });
    const r = await buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "BANCO_CSV", subFonteBanco: source });
    expect(r.resumo.aReceber).toBe(100);
    expect(p.queries.filter(q => q.sql.includes(" AS aReceber"))).toHaveLength(10);
    expect(p.queries.filter(q => q.sql.includes(" AS aReceber") && !q.sql.includes(coluna))).toHaveLength(5);
    assertReconciliado(r);
  });

  it("não disfarça erro de outra coluna como legado sem saldo", async () => {
    const p = bancoPool(source, [bancoLinha(source, "A", 100, 0, 0, 0)], { colunaAusente: true, outroErro: true });
    await expect(buscarDadosPainelBiExecutivo({ estabelecimentoId: hospital, modoFonte: "BANCO_CSV", subFonteBanco: source })).rejects.toThrow("outra_coluna");
    expect(p.queries.filter(q => q.sql.includes(" AS aReceber"))).toHaveLength(5);
  });
});
