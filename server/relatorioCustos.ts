import pg from "pg";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { custosProtudosCache, custosProdutosSyncMeta } from "../drizzle/schema-integracao";
import { eq, and, like, sql, count, desc, asc } from "drizzle-orm";

const { Pool } = pg;

let warleinePool: pg.Pool | null = null;

function getWarleinePool(): pg.Pool {
  if (!warleinePool) {
    warleinePool = new Pool({
      host: ENV.warleineDbHost,
      port: parseInt(ENV.warleineDbPort, 10),
      database: ENV.warleineDbName,
      user: ENV.warleineDbUser,
      password: ENV.warleineDbPassword,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
  }
  return warleinePool;
}

// ============================================================
// MAPEAMENTOS
// ============================================================

const TIPO_PROD_MAP: Record<string, string> = {
  M: "Medicamento",
  T: "Taxa",
  O: "Outros",
};

// ============================================================
// INTERFACES
// ============================================================

export interface FiltroCustos {
  tipoprod?: string;
  codtbmm?: string;
  convenio?: string;
  busca?: string;
  limit?: number;
  offset?: number;
}

export interface MetricasCustosDashboard {
  totalProdutos: number;
  totalMedicamentos: number;
  totalTaxas: number;
  totalOutros: number;
  custoMedioEstoque: number;
  custoMedioFatura: number;
  valorMedioMM: number;
  porTipoProduto: { nome: string; codigo: string; total: number }[];
  porTabelaPreco: { nome: string; codigo: string; total: number }[];
  topCustoEstoque: { codprod: string; descricao: string; custoEstoque: number; tipoprod: string }[];
  topCustoFatura: { codprod: string; descricao: string; custoMultFat: number; tipoprod: string }[];
  comparativoCustos: { tipo: string; custoEstoque: number; custoFatura: number; valorMM: number }[];
  fonte: "cache_local" | "postgresql_direto";
}

// ============================================================
// HELPER: Buscar tabelas de preço reais via cadplaco
// ============================================================

async function buscarTabelasAtivas(): Promise<string[]> {
  const client = await getWarleinePool().connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT a.codtbmm
      FROM "PACIENTE".cadplaco a
      WHERE a.inativo IS NULL
        AND a.codtbmm IS NOT NULL
        AND TRIM(a.codtbmm) != ''
      ORDER BY a.codtbmm
    `);
    return result.rows.map((r: any) => r.codtbmm.trim());
  } finally {
    client.release();
  }
}

// ============================================================
// SQL BASE: Query corrigida usando cadplaco como ponte
// tabprod → tabmprop (via codprod) → cadplaco (via codtbmm) → cadconv (via codconv)
// ============================================================

function buildBaseQueryCorrigida(extraConditions: string[] = []): string {
  const whereExtra = extraConditions.length > 0 ? ` AND ${extraConditions.join(" AND ")}` : "";
  return `
    SELECT 
      A.codprod,
      A.descricao,
      A.tipoprod,
      A.capacidade AS capacidade_estoque,
      A.multcobr AS mult_estoque,
      B.multcobr AS mult_faturas,
      A.unidade AS unidade_estoque,
      B.unidade AS unidade_faturas,
      A.custoatual AS custo_estoque,
      CASE 
        WHEN A.tipoprod IN ('M','T','O') AND COALESCE(B.multcobr, 0) > 0 
          THEN A.custoatual / B.multcobr
        ELSE A.custoatual 
      END AS custo_mult_fat,
      B.valormm,
      B.codtbmm,
      PL.codplaco,
      PL.nomeplaco AS nome_plano,
      C.codconv,
      C.nomeconv AS nome_convenio,
      A.prevenbras,
      A.prefabsimp
    FROM "PACIENTE".tabprod A
    INNER JOIN "PACIENTE".tabmprop B ON A.codprod = B.codprod
    INNER JOIN "PACIENTE".cadplaco PL ON PL.codtbmm = B.codtbmm AND PL.inativo IS NULL
    INNER JOIN "PACIENTE".cadconv C ON C.codconv = PL.codconv
    WHERE A.tipoprod IN ('M','T','O')
      AND A.inativo IS NULL
      ${whereExtra}
  `;
}

// ============================================================
// BUSCAR PRODUTOS - Cache local ou PostgreSQL
// ============================================================

export async function buscarCustosProdutos(
  estabelecimentoId: number,
  filtros: FiltroCustos
): Promise<{
  dados: any[];
  total: number;
  pagina: number;
  totalPaginas: number;
  fonte: "cache_local" | "postgresql_direto";
}> {
  const limit = filtros.limit || 50;
  const offset = filtros.offset || 0;

  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(custosProtudosCache)
        .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

      if (cacheCount[0]?.total > 0) {
        return buscarDoCache(db, estabelecimentoId, filtros, limit, offset);
      }
    }
  } catch (e) {
    console.warn("[RelatorioCustos] Cache local indisponível:", (e as Error).message);
  }

  // Fallback: PostgreSQL direto
  return buscarDoPostgresql(filtros, limit, offset);
}

async function buscarDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  estabelecimentoId: number,
  filtros: FiltroCustos,
  limit: number,
  offset: number
): Promise<{
  dados: any[];
  total: number;
  pagina: number;
  totalPaginas: number;
  fonte: "cache_local" | "postgresql_direto";
}> {
  const conditions: any[] = [eq(custosProtudosCache.estabelecimentoId, estabelecimentoId)];

  if (filtros.tipoprod) {
    conditions.push(eq(custosProtudosCache.tipoprod, filtros.tipoprod));
  }
  if (filtros.codtbmm) {
    conditions.push(eq(custosProtudosCache.codtbmm, filtros.codtbmm));
  }
  if (filtros.convenio) {
    conditions.push(eq(custosProtudosCache.codplaco, filtros.convenio));
  }
  if (filtros.busca) {
    conditions.push(
      sql`(${custosProtudosCache.descricao} LIKE ${"%" + filtros.busca + "%"} OR ${custosProtudosCache.codprod} LIKE ${"%" + filtros.busca + "%"})`
    );
  }

  const whereClause = and(...conditions);

  const [totalResult, dados] = await Promise.all([
    db.select({ total: count() }).from(custosProtudosCache).where(whereClause),
    db
      .select()
      .from(custosProtudosCache)
      .where(whereClause)
      .orderBy(asc(custosProtudosCache.descricao))
      .limit(limit)
      .offset(offset),
  ]);

  const total = totalResult[0]?.total || 0;

  return {
    dados: dados.map((d) => ({
      codprod: d.codprod,
      codtbmm: d.codtbmm,
      descricao: d.descricao,
      tipoprod: d.tipoprod,
      tipoprodDesc: TIPO_PROD_MAP[d.tipoprod || ""] || d.tipoprod,
      tabelaPrecoDesc: `Tabela ${d.codtbmm}`,
      nomeConvenio: d.nomeConvenio || "",
      nomePlano: d.nomePlano || "",
      codplaco: d.codplaco || "",
      capacidadeEstoque: d.capacidadeEstoque ? parseFloat(d.capacidadeEstoque) : null,
      multEstoque: d.multEstoque ? parseFloat(d.multEstoque) : null,
      multFaturas: d.multFaturas ? parseFloat(d.multFaturas) : null,
      unidadeEstoque: d.unidadeEstoque,
      unidadeFaturas: d.unidadeFaturas,
      custoEstoque: d.custoEstoque ? parseFloat(d.custoEstoque) : null,
      custoMultFat: d.custoMultFat ? parseFloat(d.custoMultFat) : null,
      valormm: d.valormm ? parseFloat(d.valormm) : null,
      prevenbras: d.prevenbras ? parseFloat(d.prevenbras) : null,
      prefabsimp: d.prefabsimp ? parseFloat(d.prefabsimp) : null,
    })),
    total,
    pagina: Math.floor(offset / limit) + 1,
    totalPaginas: Math.ceil(total / limit),
    fonte: "cache_local",
  };
}

async function buscarDoPostgresql(
  filtros: FiltroCustos,
  limit: number,
  offset: number
): Promise<{
  dados: any[];
  total: number;
  pagina: number;
  totalPaginas: number;
  fonte: "cache_local" | "postgresql_direto";
}> {
  const client = await getWarleinePool().connect();
  try {
    const params: any[] = [];
    let paramIdx = 1;

    const extraConditions: string[] = [];
    if (filtros.tipoprod) {
      extraConditions.push(`A.tipoprod = $${paramIdx}`);
      params.push(filtros.tipoprod);
      paramIdx++;
    }
    if (filtros.codtbmm) {
      extraConditions.push(`B.codtbmm = $${paramIdx}`);
      params.push(filtros.codtbmm);
      paramIdx++;
    }
    if (filtros.convenio) {
      extraConditions.push(`PL.codplaco = $${paramIdx}`);
      params.push(filtros.convenio);
      paramIdx++;
    }
    if (filtros.busca) {
      extraConditions.push(`(A.descricao ILIKE $${paramIdx} OR A.codprod ILIKE $${paramIdx})`);
      params.push(`%${filtros.busca}%`);
      paramIdx++;
    }

    const fullQuery = buildBaseQueryCorrigida(extraConditions);

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM (${fullQuery}) sub`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Fetch data with pagination
    const dataQuery = `SELECT * FROM (${fullQuery}) sub ORDER BY descricao ASC LIMIT ${limit} OFFSET ${offset}`;
    const dataResult = await client.query(dataQuery, params);

    return {
      dados: dataResult.rows.map((r: any) => ({
        codprod: r.codprod,
        codtbmm: r.codtbmm,
        descricao: r.descricao,
        tipoprod: r.tipoprod,
        tipoprodDesc: TIPO_PROD_MAP[r.tipoprod] || r.tipoprod,
        tabelaPrecoDesc: `Tabela ${r.codtbmm}`,
        nomeConvenio: r.nome_convenio || "",
        nomePlano: r.nome_plano || "",
        codplaco: r.codplaco || "",
        capacidadeEstoque: r.capacidade_estoque ? parseFloat(r.capacidade_estoque) : null,
        multEstoque: r.mult_estoque ? parseFloat(r.mult_estoque) : null,
        multFaturas: r.mult_faturas ? parseFloat(r.mult_faturas) : null,
        unidadeEstoque: r.unidade_estoque,
        unidadeFaturas: r.unidade_faturas,
        custoEstoque: r.custo_estoque ? parseFloat(r.custo_estoque) : null,
        custoMultFat: r.custo_mult_fat ? parseFloat(r.custo_mult_fat) : null,
        valormm: r.valormm ? parseFloat(r.valormm) : null,
        prevenbras: r.prevenbras ? parseFloat(r.prevenbras) : null,
        prefabsimp: r.prefabsimp ? parseFloat(r.prefabsimp) : null,
      })),
      total,
      pagina: Math.floor(offset / limit) + 1,
      totalPaginas: Math.ceil(total / limit),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ============================================================
// BUSCAR OPÇÕES DE FILTRO
// ============================================================

export async function buscarOpcoesFiltrosCustos(estabelecimentoId: number): Promise<{
  tiposProduto: { codigo: string; nome: string }[];
  tabelasPreco: { codigo: string; nome: string }[];
  convenios: { codplaco: string; nome: string }[];
  fonte: "cache_local" | "postgresql_direto";
}> {
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(custosProtudosCache)
        .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

      if (cacheCount[0]?.total > 0) {
        const [tipos, tabelas, convenios] = await Promise.all([
          db
            .selectDistinct({ codigo: custosProtudosCache.tipoprod })
            .from(custosProtudosCache)
            .where(
              and(
                eq(custosProtudosCache.estabelecimentoId, estabelecimentoId),
                sql`${custosProtudosCache.tipoprod} IS NOT NULL`
              )
            )
            .orderBy(custosProtudosCache.tipoprod),
          db
            .selectDistinct({ codigo: custosProtudosCache.codtbmm })
            .from(custosProtudosCache)
            .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId))
            .orderBy(custosProtudosCache.codtbmm),
          db
            .selectDistinct({ 
              codplaco: custosProtudosCache.codplaco, 
              nome: custosProtudosCache.nomeConvenio 
            })
            .from(custosProtudosCache)
            .where(
              and(
                eq(custosProtudosCache.estabelecimentoId, estabelecimentoId),
                sql`${custosProtudosCache.codplaco} IS NOT NULL`
              )
            )
            .orderBy(custosProtudosCache.nomeConvenio),
        ]);

        return {
          tiposProduto: tipos
            .filter((t) => t.codigo)
            .map((t) => ({
              codigo: t.codigo!,
              nome: TIPO_PROD_MAP[t.codigo!] || t.codigo!,
            })),
          tabelasPreco: tabelas.map((t) => ({
            codigo: t.codigo,
            nome: `Tabela ${t.codigo}`,
          })),
          convenios: convenios
            .filter((c) => c.codplaco)
            .map((c) => ({
              codplaco: c.codplaco!,
              nome: c.nome || c.codplaco!,
            })),
          fonte: "cache_local",
        };
      }
    }
  } catch (e) {
    console.warn("[RelatorioCustos] Cache indisponível para filtros:", (e as Error).message);
  }

  // Fallback: buscar do PostgreSQL direto
  try {
    const client = await getWarleinePool().connect();
    try {
      const [tabelasResult, conveniosResult] = await Promise.all([
        client.query(`
          SELECT DISTINCT a.codtbmm
          FROM "PACIENTE".cadplaco a
          WHERE a.inativo IS NULL
            AND a.codtbmm IS NOT NULL AND TRIM(a.codtbmm) != ''
          ORDER BY a.codtbmm
        `),
        client.query(`
          SELECT DISTINCT a.codplaco, b.nomeconv
          FROM "PACIENTE".cadplaco a
          INNER JOIN "PACIENTE".cadconv b ON b.codconv = a.codconv
          WHERE a.inativo IS NULL
            AND a.codtbmm IS NOT NULL AND TRIM(a.codtbmm) != ''
          ORDER BY b.nomeconv
        `),
      ]);

      return {
        tiposProduto: [
          { codigo: "M", nome: "Medicamento" },
          { codigo: "T", nome: "Taxa" },
          { codigo: "O", nome: "Outros" },
        ],
        tabelasPreco: tabelasResult.rows.map((r: any) => ({
          codigo: r.codtbmm.trim(),
          nome: `Tabela ${r.codtbmm.trim()}`,
        })),
        convenios: conveniosResult.rows.map((r: any) => ({
          codplaco: r.codplaco,
          nome: r.nomeconv || r.codplaco,
        })),
        fonte: "postgresql_direto",
      };
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn("[RelatorioCustos] Erro ao buscar filtros do PG:", (e as Error).message);
  }

  // Fallback estático mínimo
  return {
    tiposProduto: [
      { codigo: "M", nome: "Medicamento" },
      { codigo: "T", nome: "Taxa" },
      { codigo: "O", nome: "Outros" },
    ],
    tabelasPreco: [],
    convenios: [],
    fonte: "postgresql_direto",
  };
}

// ============================================================
// MÉTRICAS AGREGADAS PARA DASHBOARD
// ============================================================

export async function buscarMetricasCustosDashboard(
  estabelecimentoId: number,
  filtros?: { tipoprod?: string; codtbmm?: string }
): Promise<MetricasCustosDashboard> {
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(custosProtudosCache)
        .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

      if (cacheCount[0]?.total > 0) {
        return buscarMetricasDoCache(db, estabelecimentoId, filtros);
      }
    }
  } catch (e) {
    console.warn("[DashboardCustos] Cache indisponível:", (e as Error).message);
  }

  return buscarMetricasDoPostgresql(filtros);
}

async function buscarMetricasDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  estabelecimentoId: number,
  filtros?: { tipoprod?: string; codtbmm?: string }
): Promise<MetricasCustosDashboard> {
  const baseConditions: any[] = [eq(custosProtudosCache.estabelecimentoId, estabelecimentoId)];
  if (filtros?.tipoprod) {
    baseConditions.push(eq(custosProtudosCache.tipoprod, filtros.tipoprod));
  }
  if (filtros?.codtbmm) {
    baseConditions.push(eq(custosProtudosCache.codtbmm, filtros.codtbmm));
  }
  const whereClause = and(...baseConditions);

  const [
    totalResult,
    porTipo,
    porTabela,
    topCustoEstoque,
    topCustoFatura,
    avgResult,
    comparativo,
  ] = await Promise.all([
    db
      .select({
        tipoprod: custosProtudosCache.tipoprod,
        total: count(),
      })
      .from(custosProtudosCache)
      .where(whereClause)
      .groupBy(custosProtudosCache.tipoprod),
    db
      .select({
        codigo: custosProtudosCache.tipoprod,
        total: count(),
      })
      .from(custosProtudosCache)
      .where(whereClause)
      .groupBy(custosProtudosCache.tipoprod)
      .orderBy(desc(count())),
    db
      .select({
        codigo: custosProtudosCache.codtbmm,
        total: count(),
      })
      .from(custosProtudosCache)
      .where(whereClause)
      .groupBy(custosProtudosCache.codtbmm)
      .orderBy(desc(count())),
    db
      .select({
        codprod: custosProtudosCache.codprod,
        descricao: custosProtudosCache.descricao,
        custoEstoque: custosProtudosCache.custoEstoque,
        tipoprod: custosProtudosCache.tipoprod,
      })
      .from(custosProtudosCache)
      .where(
        and(
          ...baseConditions,
          sql`${custosProtudosCache.custoEstoque} IS NOT NULL AND ${custosProtudosCache.custoEstoque} > 0`
        )
      )
      .orderBy(desc(custosProtudosCache.custoEstoque))
      .limit(20),
    db
      .select({
        codprod: custosProtudosCache.codprod,
        descricao: custosProtudosCache.descricao,
        custoMultFat: custosProtudosCache.custoMultFat,
        tipoprod: custosProtudosCache.tipoprod,
      })
      .from(custosProtudosCache)
      .where(
        and(
          ...baseConditions,
          sql`${custosProtudosCache.custoMultFat} IS NOT NULL AND ${custosProtudosCache.custoMultFat} > 0`
        )
      )
      .orderBy(desc(custosProtudosCache.custoMultFat))
      .limit(20),
    db
      .select({
        avgCustoEstoque: sql<string>`AVG(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
        avgCustoFatura: sql<string>`AVG(CAST(${custosProtudosCache.custoMultFat} AS DECIMAL(18,6)))`,
        avgValorMM: sql<string>`AVG(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
      })
      .from(custosProtudosCache)
      .where(whereClause),
    db
      .select({
        tipoprod: custosProtudosCache.tipoprod,
        avgCustoEstoque: sql<string>`AVG(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
        avgCustoFatura: sql<string>`AVG(CAST(${custosProtudosCache.custoMultFat} AS DECIMAL(18,6)))`,
        avgValorMM: sql<string>`AVG(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
      })
      .from(custosProtudosCache)
      .where(whereClause)
      .groupBy(custosProtudosCache.tipoprod),
  ]);

  let totalProdutos = 0;
  let totalMedicamentos = 0;
  let totalTaxas = 0;
  let totalOutros = 0;
  for (const r of totalResult) {
    totalProdutos += r.total;
    if (r.tipoprod === "M") totalMedicamentos = r.total;
    if (r.tipoprod === "T") totalTaxas = r.total;
    if (r.tipoprod === "O") totalOutros = r.total;
  }

  return {
    totalProdutos,
    totalMedicamentos,
    totalTaxas,
    totalOutros,
    custoMedioEstoque: parseFloat(avgResult[0]?.avgCustoEstoque || "0"),
    custoMedioFatura: parseFloat(avgResult[0]?.avgCustoFatura || "0"),
    valorMedioMM: parseFloat(avgResult[0]?.avgValorMM || "0"),
    porTipoProduto: porTipo.map((t) => ({
      nome: TIPO_PROD_MAP[t.codigo || ""] || t.codigo || "?",
      codigo: t.codigo || "",
      total: t.total,
    })),
    porTabelaPreco: porTabela.map((t) => ({
      nome: `Tabela ${t.codigo}`,
      codigo: t.codigo,
      total: t.total,
    })),
    topCustoEstoque: topCustoEstoque.map((d) => ({
      codprod: d.codprod,
      descricao: d.descricao || "",
      custoEstoque: parseFloat(d.custoEstoque || "0"),
      tipoprod: d.tipoprod || "",
    })),
    topCustoFatura: topCustoFatura.map((d) => ({
      codprod: d.codprod,
      descricao: d.descricao || "",
      custoMultFat: parseFloat(d.custoMultFat || "0"),
      tipoprod: d.tipoprod || "",
    })),
    comparativoCustos: comparativo.map((c) => ({
      tipo: TIPO_PROD_MAP[c.tipoprod || ""] || c.tipoprod || "?",
      custoEstoque: parseFloat(c.avgCustoEstoque || "0"),
      custoFatura: parseFloat(c.avgCustoFatura || "0"),
      valorMM: parseFloat(c.avgValorMM || "0"),
    })),
    fonte: "cache_local",
  };
}

async function buscarMetricasDoPostgresql(
  filtros?: { tipoprod?: string; codtbmm?: string }
): Promise<MetricasCustosDashboard> {
  const client = await getWarleinePool().connect();
  try {
    const params: any[] = [];
    let paramIdx = 1;

    const extraConditions: string[] = [];
    if (filtros?.tipoprod) {
      extraConditions.push(`A.tipoprod = $${paramIdx}`);
      params.push(filtros.tipoprod);
      paramIdx++;
    }
    if (filtros?.codtbmm) {
      extraConditions.push(`B.codtbmm = $${paramIdx}`);
      params.push(filtros.codtbmm);
      paramIdx++;
    }

    const fullQuery = buildBaseQueryCorrigida(extraConditions);

    const [
      porTipoResult,
      porTabelaResult,
      topEstoqueResult,
      topFaturaResult,
      avgResult,
      comparativoResult,
    ] = await Promise.all([
      client.query(`SELECT tipoprod, COUNT(*) as total FROM (${fullQuery}) sub GROUP BY tipoprod ORDER BY total DESC`, params),
      client.query(`SELECT codtbmm, COUNT(*) as total FROM (${fullQuery}) sub GROUP BY codtbmm ORDER BY total DESC`, params),
      client.query(`SELECT codprod, descricao, custo_estoque, tipoprod FROM (${fullQuery}) sub WHERE custo_estoque > 0 ORDER BY custo_estoque DESC LIMIT 20`, params),
      client.query(`SELECT codprod, descricao, custo_mult_fat, tipoprod FROM (${fullQuery}) sub WHERE custo_mult_fat > 0 ORDER BY custo_mult_fat DESC LIMIT 20`, params),
      client.query(`SELECT AVG(custo_estoque) as avg_estoque, AVG(custo_mult_fat) as avg_fatura, AVG(valormm) as avg_mm FROM (${fullQuery}) sub`, params),
      client.query(`SELECT tipoprod, AVG(custo_estoque) as avg_estoque, AVG(custo_mult_fat) as avg_fatura, AVG(valormm) as avg_mm FROM (${fullQuery}) sub GROUP BY tipoprod`, params),
    ]);

    let totalProdutos = 0;
    let totalMedicamentos = 0;
    let totalTaxas = 0;
    let totalOutros = 0;
    for (const r of porTipoResult.rows) {
      const n = parseInt(r.total, 10);
      totalProdutos += n;
      if (r.tipoprod === "M") totalMedicamentos = n;
      if (r.tipoprod === "T") totalTaxas = n;
      if (r.tipoprod === "O") totalOutros = n;
    }

    return {
      totalProdutos,
      totalMedicamentos,
      totalTaxas,
      totalOutros,
      custoMedioEstoque: parseFloat(avgResult.rows[0]?.avg_estoque || "0"),
      custoMedioFatura: parseFloat(avgResult.rows[0]?.avg_fatura || "0"),
      valorMedioMM: parseFloat(avgResult.rows[0]?.avg_mm || "0"),
      porTipoProduto: porTipoResult.rows.map((r: any) => ({
        nome: TIPO_PROD_MAP[r.tipoprod] || r.tipoprod,
        codigo: r.tipoprod,
        total: parseInt(r.total, 10),
      })),
      porTabelaPreco: porTabelaResult.rows.map((r: any) => ({
        nome: `Tabela ${r.codtbmm}`,
        codigo: r.codtbmm,
        total: parseInt(r.total, 10),
      })),
      topCustoEstoque: topEstoqueResult.rows.map((r: any) => ({
        codprod: r.codprod,
        descricao: r.descricao || "",
        custoEstoque: parseFloat(r.custo_estoque || "0"),
        tipoprod: r.tipoprod,
      })),
      topCustoFatura: topFaturaResult.rows.map((r: any) => ({
        codprod: r.codprod,
        descricao: r.descricao || "",
        custoMultFat: parseFloat(r.custo_mult_fat || "0"),
        tipoprod: r.tipoprod,
      })),
      comparativoCustos: comparativoResult.rows.map((r: any) => ({
        tipo: TIPO_PROD_MAP[r.tipoprod] || r.tipoprod,
        custoEstoque: parseFloat(r.avg_estoque || "0"),
        custoFatura: parseFloat(r.avg_fatura || "0"),
        valorMM: parseFloat(r.avg_mm || "0"),
      })),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ============================================================
// SINCRONIZAÇÃO: Warleine → Cache Local (CORRIGIDA via cadplaco)
// ============================================================

export async function sincronizarCustosProdutos(
  estabelecimentoId: number,
  executadoPor?: number,
  executadoPorNome?: string
): Promise<{
  sucesso: boolean;
  mensagem: string;
  totalRegistros: number;
  duracaoSegundos: number;
}> {
  const db = await getDb();
  if (!db) {
    return { sucesso: false, mensagem: "Banco de dados local não disponível", totalRegistros: 0, duracaoSegundos: 0 };
  }

  const inicio = Date.now();

  // Atualizar status para em_andamento
  await upsertSyncMeta(db, estabelecimentoId, {
    status: "em_andamento",
    executadoPor: executadoPor || null,
    executadoPorNome: executadoPorNome || null,
  });

  try {
    const client = await getWarleinePool().connect();
    let totalRegistros = 0;

    try {
      // Query corrigida: usa cadplaco como ponte para associar cada produto ao convênio correto
      const query = buildBaseQueryCorrigida();

      const result = await client.query(query);
      const rows = result.rows;
      totalRegistros = rows.length;

      // Limpar cache anterior deste estabelecimento
      await db.delete(custosProtudosCache).where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

      // Inserir em lotes de 500
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await db.insert(custosProtudosCache).values(
          batch.map((r: any) => {
            const toDecimal = (val: any): string | null => {
              if (val == null || val === '' || val === undefined) return null;
              const num = parseFloat(String(val));
              if (isNaN(num)) return null;
              return num.toFixed(6);
            };

            return {
              estabelecimentoId,
              codprod: r.codprod?.trim() || "",
              descricao: r.descricao?.trim() || null,
              tipoprod: r.tipoprod?.trim() || null,
              capacidadeEstoque: toDecimal(r.capacidade_estoque),
              multEstoque: toDecimal(r.mult_estoque),
              multFaturas: toDecimal(r.mult_faturas),
              unidadeEstoque: r.unidade_estoque?.trim() || null,
              unidadeFaturas: r.unidade_faturas?.trim() || null,
              custoEstoque: toDecimal(r.custo_estoque),
              custoMultFat: toDecimal(r.custo_mult_fat),
              valormm: toDecimal(r.valormm),
              prevenbras: toDecimal(r.prevenbras),
              prefabsimp: toDecimal(r.prefabsimp),
              codtbmm: r.codtbmm?.trim() || "",
              codplaco: r.codplaco?.trim() || null,
              nomeConvenio: r.nome_convenio?.trim() || null,
              nomePlano: r.nome_plano?.trim() || null,
            };
          })
        );
      }
    } finally {
      client.release();
    }

    const duracao = Math.round((Date.now() - inicio) / 1000);

    await upsertSyncMeta(db, estabelecimentoId, {
      status: "sucesso",
      ultimaSincronizacao: new Date(),
      totalRegistros,
      duracaoSegundos: duracao,
      mensagemErro: null,
    });

    return {
      sucesso: true,
      mensagem: `Sincronização concluída: ${totalRegistros.toLocaleString("pt-BR")} registros (produto x convênio) importados em ${duracao}s`,
      totalRegistros,
      duracaoSegundos: duracao,
    };
  } catch (e) {
    const duracao = Math.round((Date.now() - inicio) / 1000);
    const errorMsg = (e as Error).message;

    await upsertSyncMeta(db, estabelecimentoId, {
      status: "erro",
      duracaoSegundos: duracao,
      mensagemErro: errorMsg,
    });

    return {
      sucesso: false,
      mensagem: `Erro na sincronização: ${errorMsg}`,
      totalRegistros: 0,
      duracaoSegundos: duracao,
    };
  }
}

// ============================================================
// STATUS DE SINCRONIZAÇÃO
// ============================================================

export async function obterStatusSincronizacaoCustos(estabelecimentoId: number) {
  const db = await getDb();
  if (!db) return null;

  try {
    const meta = await db
      .select()
      .from(custosProdutosSyncMeta)
      .where(eq(custosProdutosSyncMeta.estabelecimentoId, estabelecimentoId))
      .limit(1);

    const cacheCount = await db
      .select({ total: count() })
      .from(custosProtudosCache)
      .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

    const totalRegistrosCache = cacheCount[0]?.total || 0;

    if (meta.length === 0) {
      return {
        status: "nunca",
        ultimaSincronizacao: null,
        totalRegistrosCache,
        duracaoSegundos: 0,
        mensagemErro: null,
      };
    }

    const m = meta[0];
    return {
      status: m.status,
      ultimaSincronizacao: m.ultimaSincronizacao,
      totalRegistrosCache,
      duracaoSegundos: m.duracaoSegundos || 0,
      mensagemErro: m.mensagemErro,
    };
  } catch (e) {
    console.warn("[RelatorioCustos] Erro ao obter status:", (e as Error).message);
    return null;
  }
}

// ============================================================
// HELPER: Upsert sync metadata
// ============================================================

async function upsertSyncMeta(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  estabelecimentoId: number,
  data: Partial<{
    status: string;
    ultimaSincronizacao: Date | null;
    totalRegistros: number;
    duracaoSegundos: number;
    mensagemErro: string | null;
    executadoPor: number | null;
    executadoPorNome: string | null;
  }>
) {
  const existing = await db
    .select()
    .from(custosProdutosSyncMeta)
    .where(eq(custosProdutosSyncMeta.estabelecimentoId, estabelecimentoId))
    .limit(1);

  const updateData: any = { ...data, atualizadoEm: new Date() };

  if (existing.length === 0) {
    await db.insert(custosProdutosSyncMeta).values({
      estabelecimentoId,
      ...updateData,
    });
  } else {
    await db
      .update(custosProdutosSyncMeta)
      .set(updateData)
      .where(eq(custosProdutosSyncMeta.estabelecimentoId, estabelecimentoId));
  }
}


// ============================================================
// COMPARAÇÃO: CUSTO HOSPITAL vs VALOR CONVÊNIO (CORRIGIDA)
// ============================================================

export interface FiltroComparacao {
  tipoprod?: string;
  codtbmm?: string;
  convenio?: string;
  busca?: string;
  apenasComPrejuizo?: boolean;
  limit?: number;
  offset?: number;
}

export interface ComparacaoCustoConvenio {
  itens: {
    codprod: string;
    descricao: string;
    tipoprod: string;
    tipoprodDesc: string;
    codtbmm: string;
    tabelaPrecoDesc: string;
    nomeConvenio: string;
    codplaco: string;
    custoHospital: number;
    valorConvenio: number;
    margemReais: number;
    margemPercent: number;
    status: "lucro" | "prejuizo" | "neutro";
  }[];
  total: number;
  pagina: number;
  totalPaginas: number;
  resumo: {
    totalItens: number;
    totalComLucro: number;
    totalComPrejuizo: number;
    totalNeutro: number;
    margemMediaPercent: number;
    margemTotalReais: number;
    custoTotalHospital: number;
    valorTotalConvenio: number;
  };
  topPrejuizo: { codprod: string; descricao: string; tipoprod: string; codtbmm: string; tabelaPrecoDesc: string; nomeConvenio: string; custoHospital: number; valorConvenio: number; margemReais: number; margemPercent: number }[];
  topLucro: { codprod: string; descricao: string; tipoprod: string; codtbmm: string; tabelaPrecoDesc: string; nomeConvenio: string; custoHospital: number; valorConvenio: number; margemReais: number; margemPercent: number }[];
  margemPorTipo: { tipo: string; margemMedia: number; custoMedio: number; valorMedio: number; total: number }[];
  margemPorTabela: { tabela: string; codigo: string; margemMedia: number; custoMedio: number; valorMedio: number; total: number }[];
  margemPorConvenio: { convenio: string; codplaco: string; margemMedia: number; custoMedio: number; valorMedio: number; total: number }[];
  conveniosDisponiveis: { codplaco: string; nome: string }[];
  fonte: "cache_local" | "postgresql_direto";
}

export async function buscarComparacaoCustoConvenio(
  estabelecimentoId: number,
  filtros: FiltroComparacao
): Promise<ComparacaoCustoConvenio> {
  const limit = filtros.limit || 50;
  const offset = filtros.offset || 0;

  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(custosProtudosCache)
        .where(eq(custosProtudosCache.estabelecimentoId, estabelecimentoId));

      if (cacheCount[0]?.total > 0) {
        return buscarComparacaoDoCache(db, estabelecimentoId, filtros, limit, offset);
      }
    }
  } catch (e) {
    console.warn("[RelatorioCustos] Cache indisponível para comparação:", (e as Error).message);
  }

  // Fallback: PostgreSQL direto
  return buscarComparacaoDoPostgresql(filtros, limit, offset);
}

async function buscarComparacaoDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  estabelecimentoId: number,
  filtros: FiltroComparacao,
  limit: number,
  offset: number
): Promise<ComparacaoCustoConvenio> {
  const conditions: any[] = [
    eq(custosProtudosCache.estabelecimentoId, estabelecimentoId),
    sql`${custosProtudosCache.custoEstoque} IS NOT NULL`,
    sql`${custosProtudosCache.custoEstoque} > 0`,
    sql`${custosProtudosCache.valormm} IS NOT NULL`,
    sql`${custosProtudosCache.valormm} > 0`,
  ];

  if (filtros.tipoprod) {
    conditions.push(eq(custosProtudosCache.tipoprod, filtros.tipoprod));
  }
  if (filtros.codtbmm) {
    conditions.push(eq(custosProtudosCache.codtbmm, filtros.codtbmm));
  }
  if (filtros.convenio) {
    conditions.push(eq(custosProtudosCache.codplaco, filtros.convenio));
  }
  if (filtros.busca) {
    conditions.push(
      sql`(${custosProtudosCache.descricao} LIKE ${"%" + filtros.busca + "%"} OR ${custosProtudosCache.codprod} LIKE ${"%" + filtros.busca + "%"})`
    );
  }
  if (filtros.apenasComPrejuizo) {
    conditions.push(sql`CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) < CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6))`);
  }

  const whereClause = and(...conditions);

  const [totalResult, dados] = await Promise.all([
    db.select({ total: count() }).from(custosProtudosCache).where(whereClause),
    db
      .select()
      .from(custosProtudosCache)
      .where(whereClause)
      .orderBy(sql`(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) - CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6))) ASC`)
      .limit(limit)
      .offset(offset),
  ]);

  const total = totalResult[0]?.total || 0;

  const itens = dados.map((d) => {
    const custoHospital = parseFloat(d.custoEstoque || "0");
    const valorConvenio = parseFloat(d.valormm || "0");
    const margemReais = valorConvenio - custoHospital;
    const margemPercent = custoHospital > 0 ? ((margemReais / custoHospital) * 100) : 0;

    return {
      codprod: d.codprod,
      descricao: d.descricao || "",
      tipoprod: d.tipoprod || "",
      tipoprodDesc: TIPO_PROD_MAP[d.tipoprod || ""] || d.tipoprod || "?",
      codtbmm: d.codtbmm,
      tabelaPrecoDesc: `Tabela ${d.codtbmm}`,
      nomeConvenio: d.nomeConvenio || "",
      codplaco: d.codplaco || "",
      custoHospital,
      valorConvenio,
      margemReais,
      margemPercent,
      status: (margemReais > 0.01 ? "lucro" : margemReais < -0.01 ? "prejuizo" : "neutro") as "lucro" | "prejuizo" | "neutro",
    };
  });

  // Resumo geral (sem paginação)
  const baseConditions: any[] = [
    eq(custosProtudosCache.estabelecimentoId, estabelecimentoId),
    sql`${custosProtudosCache.custoEstoque} IS NOT NULL`,
    sql`${custosProtudosCache.custoEstoque} > 0`,
    sql`${custosProtudosCache.valormm} IS NOT NULL`,
    sql`${custosProtudosCache.valormm} > 0`,
  ];
  if (filtros.tipoprod) baseConditions.push(eq(custosProtudosCache.tipoprod, filtros.tipoprod));
  if (filtros.codtbmm) baseConditions.push(eq(custosProtudosCache.codtbmm, filtros.codtbmm));
  if (filtros.convenio) baseConditions.push(eq(custosProtudosCache.codplaco, filtros.convenio));
  if (filtros.busca) {
    baseConditions.push(
      sql`(${custosProtudosCache.descricao} LIKE ${"%" + filtros.busca + "%"} OR ${custosProtudosCache.codprod} LIKE ${"%" + filtros.busca + "%"})`
    );
  }
  const baseWhere = and(...baseConditions);

  const [resumoResult, topPrejuizoResult, topLucroResult, margemPorTipoResult, margemPorTabelaResult, margemPorConvenioResult, conveniosResult] = await Promise.all([
    db.select({
      totalItens: count(),
      totalComLucro: sql<number>`SUM(CASE WHEN CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) > CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)) + 0.01 THEN 1 ELSE 0 END)`,
      totalComPrejuizo: sql<number>`SUM(CASE WHEN CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) < CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)) - 0.01 THEN 1 ELSE 0 END)`,
      custoTotalHospital: sql<string>`SUM(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
      valorTotalConvenio: sql<string>`SUM(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
    }).from(custosProtudosCache).where(baseWhere),

    db.select()
      .from(custosProtudosCache)
      .where(and(...baseConditions, sql`CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) < CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)) - 0.01`))
      .orderBy(sql`(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) - CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6))) ASC`)
      .limit(15),

    db.select()
      .from(custosProtudosCache)
      .where(and(...baseConditions, sql`CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) > CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)) + 0.01`))
      .orderBy(sql`(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)) - CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6))) DESC`)
      .limit(15),

    db.select({
      tipoprod: custosProtudosCache.tipoprod,
      total: count(),
      avgCusto: sql<string>`AVG(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
      avgValor: sql<string>`AVG(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
    }).from(custosProtudosCache).where(baseWhere).groupBy(custosProtudosCache.tipoprod),

    db.select({
      codtbmm: custosProtudosCache.codtbmm,
      total: count(),
      avgCusto: sql<string>`AVG(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
      avgValor: sql<string>`AVG(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
    }).from(custosProtudosCache).where(baseWhere).groupBy(custosProtudosCache.codtbmm),

    db.select({
      codplaco: custosProtudosCache.codplaco,
      nomeConvenio: custosProtudosCache.nomeConvenio,
      total: count(),
      avgCusto: sql<string>`AVG(CAST(${custosProtudosCache.custoEstoque} AS DECIMAL(18,6)))`,
      avgValor: sql<string>`AVG(CAST(${custosProtudosCache.valormm} AS DECIMAL(18,6)))`,
    }).from(custosProtudosCache).where(baseWhere).groupBy(custosProtudosCache.codplaco, custosProtudosCache.nomeConvenio),

    db.selectDistinct({
      codplaco: custosProtudosCache.codplaco,
      nome: custosProtudosCache.nomeConvenio,
    }).from(custosProtudosCache).where(
      and(
        eq(custosProtudosCache.estabelecimentoId, estabelecimentoId),
        sql`${custosProtudosCache.codplaco} IS NOT NULL`
      )
    ).orderBy(custosProtudosCache.nomeConvenio),
  ]);

  const r = resumoResult[0];
  const custoTotal = parseFloat(r?.custoTotalHospital || "0");
  const valorTotal = parseFloat(r?.valorTotalConvenio || "0");
  const margemTotal = valorTotal - custoTotal;
  const totalItens = r?.totalItens || 0;

  const mapItem = (d: any) => {
    const ch = parseFloat(d.custoEstoque || "0");
    const vc = parseFloat(d.valormm || "0");
    const mr = vc - ch;
    return {
      codprod: d.codprod,
      descricao: d.descricao || "",
      tipoprod: d.tipoprod || "",
      codtbmm: d.codtbmm,
      tabelaPrecoDesc: `Tabela ${d.codtbmm}`,
      nomeConvenio: d.nomeConvenio || "",
      custoHospital: ch,
      valorConvenio: vc,
      margemReais: mr,
      margemPercent: ch > 0 ? (mr / ch) * 100 : 0,
    };
  };

  return {
    itens,
    total,
    pagina: Math.floor(offset / limit) + 1,
    totalPaginas: Math.ceil(total / limit),
    resumo: {
      totalItens,
      totalComLucro: Number(r?.totalComLucro || 0),
      totalComPrejuizo: Number(r?.totalComPrejuizo || 0),
      totalNeutro: totalItens - Number(r?.totalComLucro || 0) - Number(r?.totalComPrejuizo || 0),
      margemMediaPercent: custoTotal > 0 ? (margemTotal / custoTotal) * 100 : 0,
      margemTotalReais: margemTotal,
      custoTotalHospital: custoTotal,
      valorTotalConvenio: valorTotal,
    },
    topPrejuizo: topPrejuizoResult.map(mapItem),
    topLucro: topLucroResult.map(mapItem),
    margemPorTipo: margemPorTipoResult.map((t) => {
      const avgC = parseFloat(t.avgCusto || "0");
      const avgV = parseFloat(t.avgValor || "0");
      return {
        tipo: TIPO_PROD_MAP[t.tipoprod || ""] || t.tipoprod || "?",
        margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0,
        custoMedio: avgC,
        valorMedio: avgV,
        total: t.total,
      };
    }),
    margemPorTabela: margemPorTabelaResult.map((t) => {
      const avgC = parseFloat(t.avgCusto || "0");
      const avgV = parseFloat(t.avgValor || "0");
      return {
        tabela: `Tabela ${t.codtbmm}`,
        codigo: t.codtbmm,
        margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0,
        custoMedio: avgC,
        valorMedio: avgV,
        total: t.total,
      };
    }),
    margemPorConvenio: margemPorConvenioResult
      .filter((c) => c.codplaco)
      .map((c) => {
        const avgC = parseFloat(c.avgCusto || "0");
        const avgV = parseFloat(c.avgValor || "0");
        return {
          convenio: c.nomeConvenio || c.codplaco || "",
          codplaco: c.codplaco || "",
          margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0,
          custoMedio: avgC,
          valorMedio: avgV,
          total: c.total,
        };
      }),
    conveniosDisponiveis: conveniosResult
      .filter((c) => c.codplaco)
      .map((c) => ({
        codplaco: c.codplaco!,
        nome: c.nome || c.codplaco!,
      })),
    fonte: "cache_local",
  };
}

async function buscarComparacaoDoPostgresql(
  filtros: FiltroComparacao,
  limit: number,
  offset: number
): Promise<ComparacaoCustoConvenio> {
  const client = await getWarleinePool().connect();
  try {
    const params: any[] = [];
    let paramIdx = 1;

    const extraConditions: string[] = [
      "A.custoatual IS NOT NULL",
      "A.custoatual > 0",
      "B.valormm IS NOT NULL",
      "B.valormm > 0",
    ];
    if (filtros.tipoprod) {
      extraConditions.push(`A.tipoprod = $${paramIdx}`);
      params.push(filtros.tipoprod);
      paramIdx++;
    }
    if (filtros.codtbmm) {
      extraConditions.push(`B.codtbmm = $${paramIdx}`);
      params.push(filtros.codtbmm);
      paramIdx++;
    }
    if (filtros.convenio) {
      extraConditions.push(`PL.codplaco = $${paramIdx}`);
      params.push(filtros.convenio);
      paramIdx++;
    }
    if (filtros.busca) {
      extraConditions.push(`(A.descricao ILIKE $${paramIdx} OR A.codprod ILIKE $${paramIdx})`);
      params.push(`%${filtros.busca}%`);
      paramIdx++;
    }

    const fullQuery = `
      SELECT 
        A.codprod, B.codtbmm, A.descricao, A.tipoprod,
        A.custoatual AS custo_hospital,
        B.valormm AS valor_convenio,
        (B.valormm - A.custoatual) AS margem_reais,
        PL.codplaco,
        C.nomeconv AS nome_convenio
      FROM "PACIENTE".tabprod A
      INNER JOIN "PACIENTE".tabmprop B ON A.codprod = B.codprod
      INNER JOIN "PACIENTE".cadplaco PL ON PL.codtbmm = B.codtbmm AND PL.inativo IS NULL
      INNER JOIN "PACIENTE".cadconv C ON C.codconv = PL.codconv
      WHERE A.tipoprod IN ('M','T','O')
        AND A.inativo IS NULL
        AND ${extraConditions.join(" AND ")}
    `;

    let filteredQuery = fullQuery;
    if (filtros.apenasComPrejuizo) {
      filteredQuery = `SELECT * FROM (${fullQuery}) sub WHERE margem_reais < -0.01`;
    }

    // Buscar convênios disponíveis
    const conveniosQuery = `
      SELECT DISTINCT PL.codplaco, C.nomeconv
      FROM "PACIENTE".cadplaco PL
      INNER JOIN "PACIENTE".cadconv C ON C.codconv = PL.codconv
      WHERE PL.inativo IS NULL AND PL.codtbmm IS NOT NULL AND TRIM(PL.codtbmm) != ''
      ORDER BY C.nomeconv
    `;

    const [countResult, dataResult, resumoResult, topPrejResult, topLucroResult, porTipoResult, porTabelaResult, porConvenioResult, conveniosResult] = await Promise.all([
      client.query(`SELECT COUNT(*) as total FROM (${filteredQuery}) sub2`, params),
      client.query(`SELECT * FROM (${filteredQuery}) sub2 ORDER BY margem_reais ASC LIMIT ${limit} OFFSET ${offset}`, params),
      client.query(`SELECT COUNT(*) as total, SUM(CASE WHEN margem_reais > 0.01 THEN 1 ELSE 0 END) as lucro, SUM(CASE WHEN margem_reais < -0.01 THEN 1 ELSE 0 END) as prejuizo, SUM(custo_hospital) as custo_total, SUM(valor_convenio) as valor_total FROM (${fullQuery}) sub`, params),
      client.query(`SELECT * FROM (${fullQuery}) sub WHERE margem_reais < -0.01 ORDER BY margem_reais ASC LIMIT 15`, params),
      client.query(`SELECT * FROM (${fullQuery}) sub WHERE margem_reais > 0.01 ORDER BY margem_reais DESC LIMIT 15`, params),
      client.query(`SELECT tipoprod, COUNT(*) as total, AVG(custo_hospital) as avg_custo, AVG(valor_convenio) as avg_valor FROM (${fullQuery}) sub GROUP BY tipoprod`, params),
      client.query(`SELECT codtbmm, COUNT(*) as total, AVG(custo_hospital) as avg_custo, AVG(valor_convenio) as avg_valor FROM (${fullQuery}) sub GROUP BY codtbmm`, params),
      client.query(`SELECT nome_convenio, codplaco, COUNT(*) as total, AVG(custo_hospital) as avg_custo, AVG(valor_convenio) as avg_valor FROM (${fullQuery}) sub GROUP BY nome_convenio, codplaco ORDER BY nome_convenio`, params),
      client.query(conveniosQuery),
    ]);

    const total = parseInt(countResult.rows[0]?.total || "0", 10);
    const rs = resumoResult.rows[0];
    const custoTotal = parseFloat(rs?.custo_total || "0");
    const valorTotal = parseFloat(rs?.valor_total || "0");
    const margemTotal = valorTotal - custoTotal;
    const totalItens = parseInt(rs?.total || "0", 10);

    const mapRow = (r: any) => {
      const ch = parseFloat(r.custo_hospital || "0");
      const vc = parseFloat(r.valor_convenio || "0");
      const mr = vc - ch;
      return {
        codprod: r.codprod,
        descricao: r.descricao || "",
        tipoprod: r.tipoprod || "",
        tipoprodDesc: TIPO_PROD_MAP[r.tipoprod] || r.tipoprod,
        codtbmm: r.codtbmm,
        tabelaPrecoDesc: `Tabela ${r.codtbmm}`,
        nomeConvenio: r.nome_convenio || "",
        codplaco: r.codplaco || "",
        custoHospital: ch,
        valorConvenio: vc,
        margemReais: mr,
        margemPercent: ch > 0 ? (mr / ch) * 100 : 0,
        status: (mr > 0.01 ? "lucro" : mr < -0.01 ? "prejuizo" : "neutro") as "lucro" | "prejuizo" | "neutro",
      };
    };

    const mapTopItem = (r: any) => {
      const ch = parseFloat(r.custo_hospital || "0");
      const vc = parseFloat(r.valor_convenio || "0");
      const mr = vc - ch;
      return {
        codprod: r.codprod,
        descricao: r.descricao || "",
        tipoprod: r.tipoprod,
        codtbmm: r.codtbmm,
        tabelaPrecoDesc: `Tabela ${r.codtbmm}`,
        nomeConvenio: r.nome_convenio || "",
        custoHospital: ch,
        valorConvenio: vc,
        margemReais: mr,
        margemPercent: ch > 0 ? (mr / ch) * 100 : 0,
      };
    };

    return {
      itens: dataResult.rows.map(mapRow),
      total,
      pagina: Math.floor(offset / limit) + 1,
      totalPaginas: Math.ceil(total / limit),
      resumo: {
        totalItens,
        totalComLucro: parseInt(rs?.lucro || "0", 10),
        totalComPrejuizo: parseInt(rs?.prejuizo || "0", 10),
        totalNeutro: totalItens - parseInt(rs?.lucro || "0", 10) - parseInt(rs?.prejuizo || "0", 10),
        margemMediaPercent: custoTotal > 0 ? (margemTotal / custoTotal) * 100 : 0,
        margemTotalReais: margemTotal,
        custoTotalHospital: custoTotal,
        valorTotalConvenio: valorTotal,
      },
      topPrejuizo: topPrejResult.rows.map(mapTopItem),
      topLucro: topLucroResult.rows.map(mapTopItem),
      margemPorTipo: porTipoResult.rows.map((r: any) => {
        const avgC = parseFloat(r.avg_custo || "0");
        const avgV = parseFloat(r.avg_valor || "0");
        return { tipo: TIPO_PROD_MAP[r.tipoprod] || r.tipoprod, margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0, custoMedio: avgC, valorMedio: avgV, total: parseInt(r.total, 10) };
      }),
      margemPorTabela: porTabelaResult.rows.map((r: any) => {
        const avgC = parseFloat(r.avg_custo || "0");
        const avgV = parseFloat(r.avg_valor || "0");
        return { tabela: `Tabela ${r.codtbmm}`, codigo: r.codtbmm, margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0, custoMedio: avgC, valorMedio: avgV, total: parseInt(r.total, 10) };
      }),
      margemPorConvenio: porConvenioResult.rows.map((r: any) => {
        const avgC = parseFloat(r.avg_custo || "0");
        const avgV = parseFloat(r.avg_valor || "0");
        return {
          convenio: r.nome_convenio || "",
          codplaco: r.codplaco || "",
          margemMedia: avgC > 0 ? ((avgV - avgC) / avgC) * 100 : 0,
          custoMedio: avgC,
          valorMedio: avgV,
          total: parseInt(r.total, 10),
        };
      }),
      conveniosDisponiveis: conveniosResult.rows.map((r: any) => ({
        codplaco: r.codplaco,
        nome: r.nomeconv || r.codplaco,
      })),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}


// ============================================================
// CUSTOS POR CONVÊNIO - Dados diretos do PostgreSQL Warleine
// Tabelas: lancamen + contas + cadplaco + tabprod
// ============================================================

export interface FiltroCustoPorConvenio {
  convenio?: string;
  tipoItem?: string; // P = Produto, S = Serviço
  competencia?: string; // formato YYYY-MM
  busca?: string;
}

export interface ItemDetalhadoConvenio {
  codprod: string;
  descricao: string;
  tipoItem: string;
  tipoItemLabel: string;
  convenio: string;
  codplaco: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  valorCobradoUnitario: number;
  valorCobradoTotal: number;
  vlcusto: number;
  margem: number;
  resultado: "lucro" | "prejuizo" | "empate";
}

export interface ItemCustoConvenio {
  codprod: string;
  descricao: string;
  tipoItem: string;
  custoEstoque: number;
  convenios: {
    convenio: string;
    codplaco: string;
    quantidade: number;
    valorCobrado: number;
    vlcusto: number;
    custoTotal: number;
    margem: number;
    resultado: "lucro" | "prejuizo" | "empate";
  }[];
}

export interface ResumoConvenio {
  convenio: string;
  codplaco: string;
  totalLancamentos: number;
  totalFaturado: number;
  totalCusto: number;
  margem: number;
  margemPercent: number;
  resultado: "lucro" | "prejuizo" | "empate";
}

export interface CustoPorConvenioResult {
  itensDetalhados: ItemDetalhadoConvenio[];
  totalItensDetalhados: number;
  itens: ItemCustoConvenio[];
  totalItens: number;
  resumoPorConvenio: ResumoConvenio[];
  kpis: {
    totalConvenios: number;
    totalItensAnalisados: number;
    totalItensSemCusto: number;
    valorFaturadoTotal: number;
    custoTotal: number;
    margemTotal: number;
    margemMediaPercent: number;
  };
  topItensPrejuizo: {
    codprod: string;
    descricao: string;
    convenio: string;
    quantidade: number;
    valorCobrado: number;
    custoTotal: number;
    margem: number;
  }[];
  topItensLucro: {
    codprod: string;
    descricao: string;
    convenio: string;
    quantidade: number;
    valorCobrado: number;
    custoTotal: number;
    margem: number;
  }[];
  conveniosDisponiveis: { codplaco: string; nome: string }[];
  competenciasDisponiveis: string[];
  fonte: string;
}

export async function buscarCustosPorConvenio(
  _estabelecimentoId: number,
  filtros: FiltroCustoPorConvenio
): Promise<CustoPorConvenioResult> {
  const pool = getWarleinePool();
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '120s'");

    // ---- Filtros dinâmicos ----
    const conditions: string[] = [
      `L.vltotreais::numeric > 0`,
    ];
    const params: any[] = [];
    let paramIdx = 1;

    if (filtros.competencia) {
      conditions.push(`TO_CHAR(L.data, 'YYYY-MM') = $${paramIdx}`);
      params.push(filtros.competencia);
      paramIdx++;
    } else {
      conditions.push(`L.data >= NOW() - INTERVAL '12 months'`);
    }

    if (filtros.convenio) {
      conditions.push(`CP.codplaco = $${paramIdx}`);
      params.push(filtros.convenio);
      paramIdx++;
    }

    if (filtros.tipoItem) {
      conditions.push(`L.tipoitem = $${paramIdx}`);
      params.push(filtros.tipoItem);
      paramIdx++;
    }

    if (filtros.busca) {
      conditions.push(`(L.descricao ILIKE $${paramIdx} OR L.codprod ILIKE $${paramIdx})`);
      params.push(`%${filtros.busca}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    // ---- 1. Buscar convênios disponíveis ----
    const conveniosResult = await client.query(
      `SELECT codplaco, nomeplaco FROM "PACIENTE".cadplaco WHERE inativo IS NULL ORDER BY nomeplaco`
    );
    const conveniosDisponiveis = conveniosResult.rows.map((r: any) => ({
      codplaco: r.codplaco,
      nome: r.nomeplaco,
    }));

    // ---- 2. Buscar competências disponíveis ----
    const compResult = await client.query(
      `SELECT DISTINCT TO_CHAR(L.data, 'YYYY-MM') as comp
       FROM "PACIENTE".lancamen L
       WHERE L.data >= NOW() - INTERVAL '24 months'
       ORDER BY comp DESC`
    );
    const competenciasDisponiveis = compResult.rows.map((r: any) => r.comp);

    // ---- 3a. Query detalhada ----
    const detalhadoQuery = `
      SELECT
        TRIM(L.codprod) as codprod,
        L.descricao,
        L.tipoitem,
        CP.codplaco,
        CP.nomeplaco as convenio,
        COALESCE(NULLIF(TRIM(L.unimatmed), ''), NULLIF(TRIM(TP.unidade), ''), 'UND') as unidade,
        SUM(L.quantidade::numeric) as total_quantidade,
        AVG(L.vlunitab::numeric) as vlunitab_medio,
        SUM(L.vltotreais::numeric) as total_cobrado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        COALESCE(TP.custoatual::numeric, 0) as custo_estoque_unitario,
        COUNT(*) as num_lancamentos
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY TRIM(L.codprod), L.descricao, L.tipoitem, CP.codplaco, CP.nomeplaco, COALESCE(NULLIF(TRIM(L.unimatmed), ''), NULLIF(TRIM(TP.unidade), ''), 'UND'), TP.custoatual
      ORDER BY L.descricao ASC, CP.nomeplaco ASC
      LIMIT 1000
    `;
    const detalhadoResult = await client.query(detalhadoQuery, params);

    // ---- 3b. Query agrupada ----
    const mainQuery = `
      SELECT
        TRIM(L.codprod) as codprod,
        L.descricao,
        L.tipoitem,
        CP.codplaco,
        CP.nomeplaco as convenio,
        SUM(L.quantidade::numeric) as total_quantidade,
        SUM(L.vltotreais::numeric) as total_cobrado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        TP.custoatual::numeric as custo_estoque_unitario,
        COUNT(*) as num_lancamentos
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY TRIM(L.codprod), L.descricao, L.tipoitem, CP.codplaco, CP.nomeplaco, TP.custoatual
      ORDER BY total_cobrado DESC
    `;
    const mainResult = await client.query(mainQuery, params);

    // ---- 4. Query de resumo por convênio ----
    const resumoQuery = `
      SELECT
        CP.codplaco,
        CP.nomeplaco as convenio,
        COUNT(*) as total_lancamentos,
        SUM(L.vltotreais::numeric) as total_faturado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        SUM(COALESCE(TP.custoatual::numeric, 0) * L.quantidade::numeric) as total_custo_estoque
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      WHERE ${whereClause}
      GROUP BY CP.codplaco, CP.nomeplaco
      ORDER BY total_faturado DESC
    `;
    const resumoResult = await client.query(resumoQuery, params);

    // ---- Processar dados detalhados ----
    const TIPO_ITEM_LABEL: Record<string, string> = {
      M: "Medicamento",
      T: "Taxa",
      P: "Produto",
      S: "Serviço",
      O: "Outros",
    };

    const itensDetalhados: ItemDetalhadoConvenio[] = detalhadoResult.rows.map((row: any) => {
      const codprod = (row.codprod || "").trim();
      const descricao = (row.descricao || "").trim();
      const tipoItem = row.tipoitem || "P";
      const convenio = row.convenio || "Sem Convênio";
      const codplaco = row.codplaco || "";
      const unidade = (row.unidade || "UND").trim();
      const quantidade = parseFloat(row.total_quantidade || "0");
      const vlunitabMedio = parseFloat(row.vlunitab_medio || "0");
      const valorCobradoTotal = parseFloat(row.total_cobrado || "0");
      const vlcusto = parseFloat(row.total_vlcusto || "0");
      const custoEstoqueUnit = parseFloat(row.custo_estoque_unitario || "0");
      const custoTotal = custoEstoqueUnit > 0 ? custoEstoqueUnit * quantidade : vlcusto;
      const margem = valorCobradoTotal - custoTotal;

      return {
        codprod,
        descricao,
        tipoItem,
        tipoItemLabel: TIPO_ITEM_LABEL[tipoItem] || tipoItem,
        convenio,
        codplaco,
        unidade,
        quantidade: Math.round(quantidade * 100) / 100,
        custoUnitario: Math.round(custoEstoqueUnit * 100) / 100,
        custoTotal: Math.round(custoTotal * 100) / 100,
        valorCobradoUnitario: Math.round(vlunitabMedio * 100) / 100,
        valorCobradoTotal: Math.round(valorCobradoTotal * 100) / 100,
        vlcusto: Math.round(vlcusto * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      };
    });

    // ---- Processar dados agrupados ----
    const itensMap = new Map<string, ItemCustoConvenio>();
    let totalItensSemCusto = 0;
    let valorFaturadoTotal = 0;
    let custoTotalGeral = 0;

    for (const row of mainResult.rows) {
      const codprod = (row.codprod || "").trim();
      const descricao = (row.descricao || "").trim();
      const tipoItem = row.tipoitem || "P";
      const convenio = row.convenio || "Sem Convênio";
      const codplaco = row.codplaco || "";
      const quantidade = parseFloat(row.total_quantidade || "0");
      const valorCobrado = parseFloat(row.total_cobrado || "0");
      const vlcusto = parseFloat(row.total_vlcusto || "0");
      const custoEstoqueUnit = parseFloat(row.custo_estoque_unitario || "0");
      const custoTotal = custoEstoqueUnit > 0 ? custoEstoqueUnit * quantidade : vlcusto;
      const margem = valorCobrado - custoTotal;

      if (custoEstoqueUnit === 0 && vlcusto === 0) {
        totalItensSemCusto++;
      }

      valorFaturadoTotal += valorCobrado;
      custoTotalGeral += custoTotal;

      if (!itensMap.has(codprod)) {
        itensMap.set(codprod, {
          codprod,
          descricao,
          tipoItem,
          custoEstoque: custoEstoqueUnit,
          convenios: [],
        });
      }

      const item = itensMap.get(codprod)!;
      item.convenios.push({
        convenio,
        codplaco,
        quantidade: Math.round(quantidade * 100) / 100,
        valorCobrado: Math.round(valorCobrado * 100) / 100,
        vlcusto: Math.round(vlcusto * 100) / 100,
        custoTotal: Math.round(custoTotal * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        resultado: margem > 0.01 ? "lucro" : margem < -0.01 ? "prejuizo" : "empate",
      });
    }

    const itens = Array.from(itensMap.values())
      .sort((a, b) => {
        const totalA = a.convenios.reduce((s, c) => s + c.valorCobrado, 0);
        const totalB = b.convenios.reduce((s, c) => s + c.valorCobrado, 0);
        return totalB - totalA;
      })
      .slice(0, 200);

    // Resumo por convênio
    const resumoPorConvenio: ResumoConvenio[] = resumoResult.rows.map((r: any) => {
      const totalFaturado = parseFloat(r.total_faturado || "0");
      const totalCustoEstoque = parseFloat(r.total_custo_estoque || "0");
      const totalVlcusto = parseFloat(r.total_vlcusto || "0");
      const totalCusto = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
      const margem = totalFaturado - totalCusto;
      return {
        convenio: r.convenio || "Sem Convênio",
        codplaco: r.codplaco || "",
        totalLancamentos: parseInt(r.total_lancamentos || "0"),
        totalFaturado: Math.round(totalFaturado * 100) / 100,
        totalCusto: Math.round(totalCusto * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        margemPercent: totalCusto > 0 ? Math.round((margem / totalCusto) * 10000) / 100 : 0,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      };
    });

    // Top 20 itens
    const todosItensConvenio: { codprod: string; descricao: string; convenio: string; quantidade: number; valorCobrado: number; custoTotal: number; margem: number }[] = [];
    for (const item of itensMap.values()) {
      for (const conv of item.convenios) {
        todosItensConvenio.push({
          codprod: item.codprod,
          descricao: item.descricao,
          convenio: conv.convenio,
          quantidade: conv.quantidade,
          valorCobrado: conv.valorCobrado,
          custoTotal: conv.custoTotal,
          margem: conv.margem,
        });
      }
    }

    const topItensPrejuizo = todosItensConvenio
      .filter((i) => i.margem < -0.01)
      .sort((a, b) => a.margem - b.margem)
      .slice(0, 20);

    const topItensLucro = todosItensConvenio
      .filter((i) => i.margem > 0.01)
      .sort((a, b) => b.margem - a.margem)
      .slice(0, 20);

    const margemTotal = valorFaturadoTotal - custoTotalGeral;

    return {
      itensDetalhados,
      totalItensDetalhados: detalhadoResult.rows.length,
      itens,
      totalItens: itensMap.size,
      resumoPorConvenio,
      kpis: {
        totalConvenios: resumoPorConvenio.length,
        totalItensAnalisados: mainResult.rows.length,
        totalItensSemCusto,
        valorFaturadoTotal: Math.round(valorFaturadoTotal * 100) / 100,
        custoTotal: Math.round(custoTotalGeral * 100) / 100,
        margemTotal: Math.round(margemTotal * 100) / 100,
        margemMediaPercent: custoTotalGeral > 0
          ? Math.round((margemTotal / custoTotalGeral) * 10000) / 100
          : 0,
      },
      topItensPrejuizo,
      topItensLucro,
      conveniosDisponiveis,
      competenciasDisponiveis,
      fonte: "postgresql_warleine_direto",
    };
  } finally {
    client.release();
  }
}


// ============================================================
// CUSTOS POR CONTA - Dados diretos do PostgreSQL Warleine
// Agrupa por numconta: paciente, convênio, custo total vs valor cobrado = lucro/prejuízo
// ============================================================

export interface FiltroCustoPorConta {
  convenio?: string;
  competencia?: string; // formato YYYY-MM
  busca?: string; // busca por numconta ou paciente
  numconta?: string; // drill-down em conta específica
}

export interface ContaCustoResumo {
  numconta: string;
  paciente: string;
  convenio: string;
  codplaco: string;
  dataExecucao: string;
  totalItens: number;
  custoTotal: number;
  valorCobrado: number;
  margem: number;
  margemPercent: number;
  resultado: "lucro" | "prejuizo" | "empate";
}

export interface ItemContaCusto {
  codprod: string;
  descricao: string;
  tipoItem: string;
  tipoItemLabel: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  valorCobradoUnitario: number;
  valorCobradoTotal: number;
  margem: number;
  resultado: "lucro" | "prejuizo" | "empate";
}

export interface CustoPorContaResult {
  contas: ContaCustoResumo[];
  totalContas: number;
  kpis: {
    totalContas: number;
    totalItens: number;
    custoTotalGeral: number;
    valorCobradoGeral: number;
    margemGeral: number;
    margemMediaPercent: number;
    contasComLucro: number;
    contasComPrejuizo: number;
  };
  topContasPrejuizo: ContaCustoResumo[];
  topContasLucro: ContaCustoResumo[];
  conveniosDisponiveis: { codplaco: string; nome: string }[];
  competenciasDisponiveis: string[];
  fonte: string;
}

export interface DetalheContaCusto {
  numconta: string;
  paciente: string;
  convenio: string;
  codplaco: string;
  dataExecucao: string;
  itens: ItemContaCusto[];
  totalItens: number;
  custoTotal: number;
  valorCobrado: number;
  margem: number;
  margemPercent: number;
  resultado: "lucro" | "prejuizo" | "empate";
  itensPrejuizo: number;
  itensLucro: number;
  itensSemCusto: number;
}

export async function buscarCustosPorConta(
  _estabelecimentoId: number,
  filtros: FiltroCustoPorConta
): Promise<CustoPorContaResult> {
  const pool = getWarleinePool();
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '120s'");

    // ---- Filtros dinâmicos ----
    const conditions: string[] = [
      `L.vltotreais::numeric > 0`,
    ];
    const params: any[] = [];
    let paramIdx = 1;

    if (filtros.competencia) {
      conditions.push(`TO_CHAR(L.data, 'YYYY-MM') = $${paramIdx}`);
      params.push(filtros.competencia);
      paramIdx++;
    } else {
      conditions.push(`L.data >= NOW() - INTERVAL '12 months'`);
    }

    if (filtros.convenio) {
      conditions.push(`CP.codplaco = $${paramIdx}`);
      params.push(filtros.convenio);
      paramIdx++;
    }

    if (filtros.busca) {
      conditions.push(`(C.numconta::text ILIKE $${paramIdx} OR PAC.nomepac ILIKE $${paramIdx})`);
      params.push(`%${filtros.busca}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    // ---- 1. Buscar convênios disponíveis ----
    const conveniosResult = await client.query(
      `SELECT codplaco, nomeplaco FROM "PACIENTE".cadplaco WHERE inativo IS NULL ORDER BY nomeplaco`
    );
    const conveniosDisponiveis = conveniosResult.rows.map((r: any) => ({
      codplaco: r.codplaco,
      nome: r.nomeplaco,
    }));

    // ---- 2. Buscar competências disponíveis ----
    const compResult = await client.query(
      `SELECT DISTINCT TO_CHAR(L.data, 'YYYY-MM') as comp
       FROM "PACIENTE".lancamen L
       WHERE L.data >= NOW() - INTERVAL '24 months'
       ORDER BY comp DESC`
    );
    const competenciasDisponiveis = compResult.rows.map((r: any) => r.comp);

    // ---- 3. Query principal: agrupar por conta ----
    const mainQuery = `
      SELECT
        C.numconta,
        PAC.nomepac as paciente,
        CP.nomeplaco as convenio,
        CP.codplaco,
        TO_CHAR(MIN(L.data), 'YYYY-MM-DD') as data_execucao,
        COUNT(*) as total_itens,
        SUM(L.vltotreais::numeric) as total_cobrado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        SUM(COALESCE(TP.custoatual::numeric, 0) * L.quantidade::numeric) as total_custo_estoque
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadpac PAC ON C.prontuario = PAC.codpac
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY C.numconta, PAC.nomepac, CP.nomeplaco, CP.codplaco
      ORDER BY total_cobrado DESC
      LIMIT 500
    `;
    const mainResult = await client.query(mainQuery, params);

    // ---- Processar contas ----
    let custoTotalGeral = 0;
    let valorCobradoGeral = 0;
    let contasComLucro = 0;
    let contasComPrejuizo = 0;
    let totalItensGeral = 0;

    const contas: ContaCustoResumo[] = mainResult.rows.map((row: any) => {
      const totalCobrado = parseFloat(row.total_cobrado || "0");
      const totalCustoEstoque = parseFloat(row.total_custo_estoque || "0");
      const totalVlcusto = parseFloat(row.total_vlcusto || "0");
      const custoTotal = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
      const margem = totalCobrado - custoTotal;
      const totalItens = parseInt(row.total_itens || "0");

      custoTotalGeral += custoTotal;
      valorCobradoGeral += totalCobrado;
      totalItensGeral += totalItens;
      if (margem > 0.01) contasComLucro++;
      if (margem < -0.01) contasComPrejuizo++;

      return {
        numconta: row.numconta,
        paciente: (row.paciente || "").trim(),
        convenio: row.convenio || "Sem Convênio",
        codplaco: row.codplaco || "",
        dataExecucao: row.data_execucao || "",
        totalItens,
        custoTotal: Math.round(custoTotal * 100) / 100,
        valorCobrado: Math.round(totalCobrado * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        margemPercent: custoTotal > 0 ? Math.round((margem / custoTotal) * 10000) / 100 : 0,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      };
    });

    const margemGeral = valorCobradoGeral - custoTotalGeral;

    const topContasPrejuizo = [...contas]
      .filter(c => c.resultado === "prejuizo")
      .sort((a, b) => a.margem - b.margem)
      .slice(0, 20);

    const topContasLucro = [...contas]
      .filter(c => c.resultado === "lucro")
      .sort((a, b) => b.margem - a.margem)
      .slice(0, 20);

    return {
      contas,
      totalContas: contas.length,
      kpis: {
        totalContas: contas.length,
        totalItens: totalItensGeral,
        custoTotalGeral: Math.round(custoTotalGeral * 100) / 100,
        valorCobradoGeral: Math.round(valorCobradoGeral * 100) / 100,
        margemGeral: Math.round(margemGeral * 100) / 100,
        margemMediaPercent: custoTotalGeral > 0
          ? Math.round((margemGeral / custoTotalGeral) * 10000) / 100
          : 0,
        contasComLucro,
        contasComPrejuizo,
      },
      topContasPrejuizo,
      topContasLucro,
      conveniosDisponiveis,
      competenciasDisponiveis,
      fonte: "postgresql_warleine_direto",
    };
  } finally {
    client.release();
  }
}

export async function buscarDetalheContaCusto(
  _estabelecimentoId: number,
  numconta: string
): Promise<DetalheContaCusto | null> {
  const pool = getWarleinePool();
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '60s'");

    const TIPO_ITEM_LABEL: Record<string, string> = {
      M: "Medicamento",
      T: "Taxa",
      P: "Produto",
      S: "Serviço",
      O: "Outros",
      H: "Honorário",
      C: "Cirurgia",
    };

    // Buscar dados da conta
    const contaResult = await client.query(
      `SELECT C.numconta, PAC.nomepac, CP.nomeplaco, CP.codplaco, TO_CHAR(C.datafech, 'YYYY-MM-DD') as data_execucao
       FROM "PACIENTE".contas C
       LEFT JOIN "PACIENTE".cadpac PAC ON C.prontuario = PAC.codpac
       LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
       WHERE C.numconta = $1
       LIMIT 1`,
      [numconta]
    );

    if (contaResult.rows.length === 0) return null;

    const contaInfo = contaResult.rows[0];

    // Buscar itens da conta
    const itensResult = await client.query(
      `SELECT
        TRIM(L.codprod) as codprod,
        L.descricao,
        L.tipoitem,
        COALESCE(NULLIF(TRIM(L.unimatmed), ''), NULLIF(TRIM(TP.unidade), ''), 'UND') as unidade,
        L.quantidade::numeric as quantidade,
        L.vlunitab::numeric as vlunitab,
        L.vltotreais::numeric as vltotreais,
        L.vlcusto::numeric as vlcusto,
        COALESCE(TP.custoatual::numeric, 0) as custo_estoque_unitario
      FROM "PACIENTE".lancamen L
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      WHERE L.numconta = $1
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      ORDER BY L.descricao`,
      [numconta]
    );

    let custoTotal = 0;
    let valorCobrado = 0;
    let itensPrejuizo = 0;
    let itensLucro = 0;
    let itensSemCusto = 0;

    const itens: ItemContaCusto[] = itensResult.rows.map((row: any) => {
      const quantidade = parseFloat(row.quantidade || "0");
      const vlunitab = parseFloat(row.vlunitab || "0");
      const vltotreais = parseFloat(row.vltotreais || "0");
      const vlcusto = parseFloat(row.vlcusto || "0");
      const custoEstoqueUnit = parseFloat(row.custo_estoque_unitario || "0");
      const custoItem = custoEstoqueUnit > 0 ? custoEstoqueUnit * quantidade : vlcusto;
      const margem = vltotreais - custoItem;

      custoTotal += custoItem;
      valorCobrado += vltotreais;
      if (margem > 0.01) itensLucro++;
      if (margem < -0.01) itensPrejuizo++;
      if (custoEstoqueUnit === 0 && vlcusto === 0) itensSemCusto++;

      return {
        codprod: (row.codprod || "").trim(),
        descricao: (row.descricao || "").trim(),
        tipoItem: row.tipoitem || "P",
        tipoItemLabel: TIPO_ITEM_LABEL[row.tipoitem] || row.tipoitem || "Outros",
        unidade: (row.unidade || "UND").trim(),
        quantidade: Math.round(quantidade * 100) / 100,
        custoUnitario: Math.round(custoEstoqueUnit * 100) / 100,
        custoTotal: Math.round(custoItem * 100) / 100,
        valorCobradoUnitario: Math.round(vlunitab * 100) / 100,
        valorCobradoTotal: Math.round(vltotreais * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      };
    });

    const margem = valorCobrado - custoTotal;

    return {
      numconta,
      paciente: (contaInfo.nomepac || "").trim(),
      convenio: contaInfo.nomeplaco || "Sem Convênio",
      codplaco: contaInfo.codplaco || "",
      dataExecucao: contaInfo.data_execucao || "",
      itens,
      totalItens: itens.length,
      custoTotal: Math.round(custoTotal * 100) / 100,
      valorCobrado: Math.round(valorCobrado * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      margemPercent: custoTotal > 0 ? Math.round((margem / custoTotal) * 10000) / 100 : 0,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      itensPrejuizo,
      itensLucro,
      itensSemCusto,
    };
  } finally {
    client.release();
  }
}


// ============================================================
// CUSTOS POR SETOR - Dados diretos do PostgreSQL Warleine
// Agrupa lançamentos por setor/centro de custo para análise setorial
// ============================================================

export interface FiltroCustoPorSetor {
  setor?: string;
  convenio?: string;
  competencia?: string; // formato YYYY-MM
  busca?: string;
}

export interface ResumoSetor {
  setor: string;
  totalLancamentos: number;
  totalItens: number;
  totalContas: number;
  totalFaturado: number;
  totalCusto: number;
  margem: number;
  margemPercent: number;
  resultado: "lucro" | "prejuizo" | "empate";
  topItens: { descricao: string; quantidade: number; custoTotal: number; valorCobrado: number; margem: number }[];
}

export interface ItemDetalhadoSetor {
  codprod: string;
  descricao: string;
  tipoItem: string;
  tipoItemLabel: string;
  setor: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  valorCobradoUnitario: number;
  valorCobradoTotal: number;
  margem: number;
  resultado: "lucro" | "prejuizo" | "empate";
}

export interface CustoPorSetorResult {
  resumoPorSetor: ResumoSetor[];
  itensDetalhados: ItemDetalhadoSetor[];
  totalItensDetalhados: number;
  kpis: {
    totalSetores: number;
    totalLancamentos: number;
    valorFaturadoTotal: number;
    custoTotal: number;
    margemTotal: number;
    margemMediaPercent: number;
    setoresComLucro: number;
    setoresComPrejuizo: number;
  };
  topSetoresPrejuizo: ResumoSetor[];
  topSetoresLucro: ResumoSetor[];
  setoresDisponiveis: string[];
  conveniosDisponiveis: { codplaco: string; nome: string }[];
  competenciasDisponiveis: string[];
  fonte: string;
}

export async function buscarCustosPorSetor(
  _estabelecimentoId: number,
  filtros: FiltroCustoPorSetor
): Promise<CustoPorSetorResult> {
  const pool = getWarleinePool();
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '120s'");

    // ---- Filtros dinâmicos ----
    const conditions: string[] = [
      `L.vltotreais::numeric > 0`,
    ];
    const params: any[] = [];
    let paramIdx = 1;

    if (filtros.competencia) {
      conditions.push(`TO_CHAR(L.data, 'YYYY-MM') = $${paramIdx}`);
      params.push(filtros.competencia);
      paramIdx++;
    } else {
      conditions.push(`L.data >= NOW() - INTERVAL '12 months'`);
    }

    if (filtros.convenio) {
      conditions.push(`CP.codplaco = $${paramIdx}`);
      params.push(filtros.convenio);
      paramIdx++;
    }

    if (filtros.setor) {
      conditions.push(`COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor') = $${paramIdx}`);
      params.push(filtros.setor);
      paramIdx++;
    }

    if (filtros.busca) {
      conditions.push(`(L.descricao ILIKE $${paramIdx} OR L.codprod ILIKE $${paramIdx})`);
      params.push(`%${filtros.busca}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    // ---- 1. Buscar convênios disponíveis ----
    const conveniosResult = await client.query(
      `SELECT codplaco, nomeplaco FROM "PACIENTE".cadplaco WHERE inativo IS NULL ORDER BY nomeplaco`
    );
    const conveniosDisponiveis = conveniosResult.rows.map((r: any) => ({
      codplaco: r.codplaco,
      nome: r.nomeplaco,
    }));

    // ---- 2. Buscar competências disponíveis ----
    const compResult = await client.query(
      `SELECT DISTINCT TO_CHAR(L.data, 'YYYY-MM') as comp
       FROM "PACIENTE".lancamen L
       WHERE L.data >= NOW() - INTERVAL '24 months'
       ORDER BY comp DESC`
    );
    const competenciasDisponiveis = compResult.rows.map((r: any) => r.comp);

    // ---- 3. Buscar setores disponíveis ----
    const setoresResult = await client.query(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor') as setor
       FROM "PACIENTE".lancamen L
       LEFT JOIN "PACIENTE".cadcc CC ON L.codcc = CC.codcc
       WHERE L.data >= NOW() - INTERVAL '24 months'
         AND L.vltotreais::numeric > 0
       ORDER BY setor`
    );
    const setoresDisponiveis = setoresResult.rows.map((r: any) => r.setor);

    // ---- 4. Query resumo por setor ----
    const resumoQuery = `
      SELECT
        COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor') as setor,
        COUNT(*) as total_lancamentos,
        COUNT(DISTINCT TRIM(L.codprod)) as total_itens,
        COUNT(DISTINCT L.numconta) as total_contas,
        SUM(L.vltotreais::numeric) as total_faturado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        SUM(COALESCE(TP.custoatual::numeric, 0) * L.quantidade::numeric) as total_custo_estoque
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      LEFT JOIN "PACIENTE".cadcc CC ON L.codcc = CC.codcc
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor')
      ORDER BY total_faturado DESC
    `;
    const resumoResult = await client.query(resumoQuery, params);

    // ---- 5. Query detalhada por item + setor ----
    const detalhadoQuery = `
      SELECT
        TRIM(L.codprod) as codprod,
        L.descricao,
        L.tipoitem,
        COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor') as setor,
        COALESCE(NULLIF(TRIM(L.unimatmed), ''), NULLIF(TRIM(TP.unidade), ''), 'UND') as unidade,
        SUM(L.quantidade::numeric) as total_quantidade,
        AVG(L.vlunitab::numeric) as vlunitab_medio,
        SUM(L.vltotreais::numeric) as total_cobrado,
        SUM(L.vlcusto::numeric) as total_vlcusto,
        COALESCE(TP.custoatual::numeric, 0) as custo_estoque_unitario,
        COUNT(*) as num_lancamentos
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      LEFT JOIN "PACIENTE".cadcc CC ON L.codcc = CC.codcc
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY TRIM(L.codprod), L.descricao, L.tipoitem, COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor'),
               COALESCE(NULLIF(TRIM(L.unimatmed), ''), NULLIF(TRIM(TP.unidade), ''), 'UND'), TP.custoatual
      ORDER BY total_cobrado DESC
      LIMIT 1000
    `;
    const detalhadoResult = await client.query(detalhadoQuery, params);

    // ---- 6. Top itens por setor ----
    const topItensPorSetorQuery = `
      SELECT
        COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor') as setor,
        L.descricao,
        SUM(L.quantidade::numeric) as quantidade,
        SUM(COALESCE(TP.custoatual::numeric, 0) * L.quantidade::numeric) as custo_total,
        SUM(L.vltotreais::numeric) as valor_cobrado
      FROM "PACIENTE".lancamen L
      JOIN "PACIENTE".contas C ON L.numconta = C.numconta
      LEFT JOIN "PACIENTE".cadplaco CP ON C.codplaco = CP.codplaco
      LEFT JOIN "PACIENTE".tabprod TP ON TRIM(L.codprod) = TRIM(TP.codprod)
      LEFT JOIN "PACIENTE".cadcc CC ON L.codcc = CC.codcc
      WHERE ${whereClause}
        AND L.codprod IS NOT NULL
        AND TRIM(L.codprod) != ''
      GROUP BY COALESCE(NULLIF(TRIM(CC.nomecc), ''), 'Sem Setor'), L.descricao
      ORDER BY custo_total DESC
    `;
    const topItensResult = await client.query(topItensPorSetorQuery, params);

    // ---- Processar top itens por setor ----
    const topItensPorSetorMap = new Map<string, { descricao: string; quantidade: number; custoTotal: number; valorCobrado: number; margem: number }[]>();
    for (const row of topItensResult.rows) {
      const setor = row.setor || "Sem Setor";
      const custoTotal = parseFloat(row.custo_total || "0");
      const valorCobrado = parseFloat(row.valor_cobrado || "0");
      if (!topItensPorSetorMap.has(setor)) {
        topItensPorSetorMap.set(setor, []);
      }
      const arr = topItensPorSetorMap.get(setor)!;
      if (arr.length < 5) {
        arr.push({
          descricao: (row.descricao || "").trim(),
          quantidade: parseFloat(row.quantidade || "0"),
          custoTotal: Math.round(custoTotal * 100) / 100,
          valorCobrado: Math.round(valorCobrado * 100) / 100,
          margem: Math.round((valorCobrado - custoTotal) * 100) / 100,
        });
      }
    }

    // ---- Processar resumo por setor ----
    let valorFaturadoTotal = 0;
    let custoTotalGeral = 0;
    let setoresComLucro = 0;
    let setoresComPrejuizo = 0;
    let totalLancamentos = 0;

    const resumoPorSetor: ResumoSetor[] = resumoResult.rows.map((r: any) => {
      const setor = r.setor || "Sem Setor";
      const totalFaturado = parseFloat(r.total_faturado || "0");
      const totalCustoEstoque = parseFloat(r.total_custo_estoque || "0");
      const totalVlcusto = parseFloat(r.total_vlcusto || "0");
      const totalCusto = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
      const margem = totalFaturado - totalCusto;
      const lancamentos = parseInt(r.total_lancamentos || "0");

      valorFaturadoTotal += totalFaturado;
      custoTotalGeral += totalCusto;
      totalLancamentos += lancamentos;

      if (margem > 0.01) setoresComLucro++;
      if (margem < -0.01) setoresComPrejuizo++;

      return {
        setor,
        totalLancamentos: lancamentos,
        totalItens: parseInt(r.total_itens || "0"),
        totalContas: parseInt(r.total_contas || "0"),
        totalFaturado: Math.round(totalFaturado * 100) / 100,
        totalCusto: Math.round(totalCusto * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        margemPercent: totalCusto > 0 ? Math.round((margem / totalCusto) * 10000) / 100 : 0,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
        topItens: topItensPorSetorMap.get(setor) || [],
      };
    });

    // ---- Processar itens detalhados ----
    const TIPO_ITEM_LABEL: Record<string, string> = {
      M: "Medicamento",
      T: "Taxa",
      P: "Produto",
      S: "Serviço",
      O: "Outros",
    };

    const itensDetalhados: ItemDetalhadoSetor[] = detalhadoResult.rows.map((row: any) => {
      const quantidade = parseFloat(row.total_quantidade || "0");
      const vlunitabMedio = parseFloat(row.vlunitab_medio || "0");
      const valorCobradoTotal = parseFloat(row.total_cobrado || "0");
      const vlcusto = parseFloat(row.total_vlcusto || "0");
      const custoEstoqueUnit = parseFloat(row.custo_estoque_unitario || "0");
      const custoTotal = custoEstoqueUnit > 0 ? custoEstoqueUnit * quantidade : vlcusto;
      const margem = valorCobradoTotal - custoTotal;
      const tipoItem = row.tipoitem || "P";

      return {
        codprod: (row.codprod || "").trim(),
        descricao: (row.descricao || "").trim(),
        tipoItem,
        tipoItemLabel: TIPO_ITEM_LABEL[tipoItem] || tipoItem,
        setor: row.setor || "Sem Setor",
        unidade: (row.unidade || "UND").trim(),
        quantidade: Math.round(quantidade * 100) / 100,
        custoUnitario: Math.round(custoEstoqueUnit * 100) / 100,
        custoTotal: Math.round(custoTotal * 100) / 100,
        valorCobradoUnitario: Math.round(vlunitabMedio * 100) / 100,
        valorCobradoTotal: Math.round(valorCobradoTotal * 100) / 100,
        margem: Math.round(margem * 100) / 100,
        resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      };
    });

    // Top setores
    const topSetoresPrejuizo = [...resumoPorSetor]
      .filter((s) => s.margem < -0.01)
      .sort((a, b) => a.margem - b.margem)
      .slice(0, 10);

    const topSetoresLucro = [...resumoPorSetor]
      .filter((s) => s.margem > 0.01)
      .sort((a, b) => b.margem - a.margem)
      .slice(0, 10);

    const margemTotal = valorFaturadoTotal - custoTotalGeral;

    return {
      resumoPorSetor,
      itensDetalhados,
      totalItensDetalhados: detalhadoResult.rows.length,
      kpis: {
        totalSetores: resumoPorSetor.length,
        totalLancamentos,
        valorFaturadoTotal: Math.round(valorFaturadoTotal * 100) / 100,
        custoTotal: Math.round(custoTotalGeral * 100) / 100,
        margemTotal: Math.round(margemTotal * 100) / 100,
        margemMediaPercent: custoTotalGeral > 0
          ? Math.round((margemTotal / custoTotalGeral) * 10000) / 100
          : 0,
        setoresComLucro,
        setoresComPrejuizo,
      },
      topSetoresPrejuizo,
      topSetoresLucro,
      setoresDisponiveis,
      conveniosDisponiveis,
      competenciasDisponiveis,
      fonte: "postgresql_warleine_direto",
    };
  } finally {
    client.release();
  }
}
