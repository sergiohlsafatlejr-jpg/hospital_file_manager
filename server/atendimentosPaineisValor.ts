import Decimal from "decimal.js";
import { sql, type SQL } from "drizzle-orm";

/** Expressões fixas: os filtros da listagem e os agrupamentos usam o mesmo significado. */
export const ATENDIMENTOS_VALOR_SQL = {
  etapa: sql`COALESCE(NULLIF(TRIM(etapaConta), ''), 'SEM ETAPA')`,
  convenio: sql`COALESCE(NULLIF(TRIM(convenio), ''), 'SEM CONVÊNIO')`,
  setor: sql`COALESCE(NULLIF(TRIM(setorEtapa), ''), NULLIF(TRIM(dsSetorEntrada), ''), 'SEM SETOR')`,
  mesEntrada: sql`COALESCE(DATE_FORMAT(data_entrada, '%Y-%m'), '__SEM_ENTRADA__')`,
  permanencia: sql`CASE
    WHEN COALESCE(dtEntrega, dtEtapa) IS NULL THEN 'SEM REFERÊNCIA'
    WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 14 THEN '0-14 DIAS'
    WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 30 THEN '15-30 DIAS'
    WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 60 THEN '31-60 DIAS'
    WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 90 THEN '61-90 DIAS'
    ELSE '90+ DIAS' END`,
} as const;

export type PainelMetric = "valor" | "quantidade";
export type PainelValorRow = { chave: string; quantidade: number; valor: number };
export type PaineisValor = Record<keyof typeof ATENDIMENTOS_VALOR_SQL, PainelValorRow[]> & { metric: PainelMetric };
export const PAINEIS_VALOR_VAZIOS: PaineisValor = { metric: "valor", etapa: [], convenio: [], setor: [], mesEntrada: [], permanencia: [] };
export type PaineisValorOptions = {
  metric?: PainelMetric;
  expressions?: Partial<typeof ATENDIMENTOS_VALOR_SQL>;
};

/** COUNT(valorConta), não SUM: valor zero informado é diferente de NULL. */
export function escolherMetricaPainel(valoresInformados: number): PainelMetric {
  return valoresInformados > 0 ? "valor" : "quantidade";
}

export function parsePainelValor(rows: unknown): PainelValorRow[] {
  const outer = rows as any[];
  const data = Array.isArray(outer?.[0]) ? outer[0] : outer;
  if (!Array.isArray(data)) throw new Error("Formato de agrupamento inválido.");
  return data.map((row: any) => {
    const money = new Decimal(String(row.valor ?? 0));
    const count = new Decimal(String(row.quantidade ?? 0));
    if (!money.isFinite() || !money.times(100).isInteger() || money.times(100).abs().greaterThan(Number.MAX_SAFE_INTEGER) ||
        !count.isFinite() || !count.isInteger() || count.isNegative() || count.greaterThan(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Agrupamento de atendimentos fora da faixa segura.");
    }
    const valor = money.toNumber();
    if (!new Decimal(String(valor)).equals(money)) throw new Error("Valor perderia precisão na serialização.");
    return { chave: String(row.chave), quantidade: count.toNumber(), valor };
  });
}

/** Só consultas agregadas. O where é o mesmo usado por total, tabela e valor total. */
export async function getAtendimentosPaineisValor(
  db: { execute: (statement: SQL) => Promise<unknown> },
  where: SQL,
  { metric = "valor", expressions = {} }: PaineisValorOptions = {},
): Promise<PaineisValor> {
  const keys = Object.keys(ATENDIMENTOS_VALOR_SQL) as (keyof typeof ATENDIMENTOS_VALOR_SQL)[];
  const results = await Promise.all(keys.map(async (key) => {
    const expression = expressions[key] || ATENDIMENTOS_VALOR_SQL[key];
    const order = key === "mesEntrada" ? sql`chave ASC` : key === "permanencia"
      ? sql`FIELD(chave, '0-14 DIAS', '15-30 DIAS', '31-60 DIAS', '61-90 DIAS', '90+ DIAS', 'SEM REFERÊNCIA')`
      : metric === "quantidade" ? sql`quantidade DESC, chave ASC` : sql`valor DESC, chave ASC`;
    return parsePainelValor(await db.execute(sql`SELECT ${expression} AS chave, COUNT(*) AS quantidade,
      COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))), 0) AS valor
      FROM atendimentos_unificados WHERE ${where} GROUP BY chave ORDER BY ${order}`));
  }));
  return { metric, ...Object.fromEntries(keys.map((key, index) => [key, results[index]])) } as PaineisValor;
}
