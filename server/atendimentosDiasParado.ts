import { sql } from "drizzle-orm";

export type AtendimentoDiasParadoInput = {
  dataEntrada?: string | Date | null;
  dataSaida?: string | Date | null;
  origemSistema?: string | null;
  categoriaAtendimento?: string | null;
  dtEntrega?: string | Date | null;
  dtEtapa?: string | Date | null;
};

export type AtendimentoDiasParadoSqlFields = {
  origemSistema: any;
  dataEntrada: any;
  dataSaida: any;
  categoriaAtendimento: any;
  dtEntrega: any;
  dtEtapa: any;
};

export type SaidaEfetiva = {
  dataSaidaEfetiva: string | Date | null;
  dataSaidaInferida: boolean;
};

function normalizarTexto(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function mesmaOrigem(origemSistema: string | null | undefined, origem: string): boolean {
  return normalizarTexto(origemSistema) === origem;
}

export function categoriaWarleineComSaidaNaEntrada(categoriaAtendimento?: string | null): boolean {
  const categoria = normalizarTexto(categoriaAtendimento);
  return categoria === "EXAME" || categoria === "AMBULATORIO" || categoria === "AMBULATORIA";
}

/**
 * WARLEINE informa atendimentos ambulatoriais/exames sem data de saída. Para a
 * visualização de dias parado, a entrada é a saída efetiva nesses casos. A data
 * original permanece nula: esta função não persiste nem substitui dados da fonte.
 */
export function resolverSaidaEfetivaAtendimento({
  dataEntrada,
  dataSaida,
  origemSistema,
  categoriaAtendimento,
}: Pick<AtendimentoDiasParadoInput, "dataEntrada" | "dataSaida" | "origemSistema" | "categoriaAtendimento">): SaidaEfetiva {
  if (dataSaida) return { dataSaidaEfetiva: dataSaida, dataSaidaInferida: false };
  if (
    mesmaOrigem(origemSistema, "WARLEINE")
    && categoriaWarleineComSaidaNaEntrada(categoriaAtendimento)
    && dataEntrada
  ) {
    return { dataSaidaEfetiva: dataEntrada, dataSaidaInferida: true };
  }
  return { dataSaidaEfetiva: null, dataSaidaInferida: false };
}

function diferencaDiasAteHoje(data: string | Date | null | undefined, agora: Date): number {
  if (!data) return 0;
  const referencia = new Date(data);
  if (Number.isNaN(referencia.getTime())) return 0;
  const inicioReferencia = new Date(referencia);
  inicioReferencia.setHours(0, 0, 0, 0);
  const inicioHoje = new Date(agora);
  inicioHoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((inicioHoje.getTime() - inicioReferencia.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Dias parados após a saída, preservando nula a saída que não existe na fonte. */
export function calcularDiasAposSaida(
  { dataEntrada, dataSaida, origemSistema, categoriaAtendimento }: AtendimentoDiasParadoInput,
  agora: Date = new Date(),
): number {
  const { dataSaidaEfetiva } = resolverSaidaEfetivaAtendimento({
    dataEntrada,
    dataSaida,
    origemSistema,
    categoriaAtendimento,
  });
  return diferencaDiasAteHoje(dataSaidaEfetiva, agora);
}

/**
 * Expressões SQL equivalentes ao valor mostrado em /atendimentos, usadas na
 * ordenação server-side. `categoriaAtendimento` deve ser a categoria canônica
 * já calculada pelo router para evitar reimplementar os critérios de origem.
 */
export function buildAtendimentoDiasParadoSql(fields: AtendimentoDiasParadoSqlFields) {
  const origemNormalizada = sql`LOWER(TRIM(COALESCE(${fields.origemSistema}, '')))`;
  const ehTasy = sql`${origemNormalizada} IN ('tasy', 'tasy_hemolabor')`;
  const ehWarleine = sql`${origemNormalizada} = 'warleine'`;
  const categoriaComSaidaNaEntrada = sql`${fields.categoriaAtendimento} IN ('AMBULATORIO', 'EXAME')`;
  const dataSaidaEfetivaSql = sql`CASE
    WHEN ${ehWarleine}
      AND ${fields.dataSaida} IS NULL
      AND ${categoriaComSaidaNaEntrada}
      AND ${fields.dataEntrada} IS NOT NULL
      THEN ${fields.dataEntrada}
    ELSE ${fields.dataSaida}
  END`;
  const referenciaPermanenciaSql = sql`CASE
    WHEN ${ehWarleine} THEN ${dataSaidaEfetivaSql}
    ELSE COALESCE(${fields.dtEntrega}, ${fields.dtEtapa})
  END`;
  const diasParadoSql = sql`CASE
    WHEN ${ehTasy} THEN GREATEST(0, DATEDIFF(CURDATE(), COALESCE(${fields.dtEntrega}, ${fields.dtEtapa})))
    WHEN ${ehWarleine} THEN CASE
      WHEN ${dataSaidaEfetivaSql} IS NULL THEN 0
      ELSE GREATEST(0, DATEDIFF(CURDATE(), ${dataSaidaEfetivaSql}))
    END
    WHEN ${fields.dataSaida} IS NULL THEN 0
    ELSE GREATEST(0, DATEDIFF(CURDATE(), ${fields.dataSaida}))
  END`;

  return { dataSaidaEfetivaSql, referenciaPermanenciaSql, diasParadoSql };
}

/** Faixas da tela de atendimentos a partir da mesma referência de dias parado. */
export function buildAtendimentoPermanenciaSql(referenciaPermanenciaSql: any) {
  return sql`CASE
    WHEN ${referenciaPermanenciaSql} IS NULL THEN 'SEM REFERÊNCIA'
    WHEN DATEDIFF(CURDATE(), ${referenciaPermanenciaSql}) <= 14 THEN '0-14 DIAS'
    WHEN DATEDIFF(CURDATE(), ${referenciaPermanenciaSql}) <= 30 THEN '15-30 DIAS'
    WHEN DATEDIFF(CURDATE(), ${referenciaPermanenciaSql}) <= 60 THEN '31-60 DIAS'
    WHEN DATEDIFF(CURDATE(), ${referenciaPermanenciaSql}) <= 90 THEN '61-90 DIAS'
    ELSE '90+ DIAS'
  END`;
}
