import Decimal from "decimal.js";
import type { RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";

export type AtendimentosBiFilters = {
  estabelecimentoId: number;
  mesEntrada?: string;
  etapa?: string;
  convenio?: string;
  setor?: string;
  categoria?: string;
  permanencia?: string;
  limite?: number;
};

type SqlWhere = { clause: string; params: unknown[] };

const TASY_ORIGINS = "LOWER(TRIM(COALESCE(origemSistema,''))) IN ('tasy','tasy_hemolabor')";
const CATEGORY_SQL = `COALESCE(NULLIF(TRIM(dsCategoria), ''), NULLIF(TRIM(tipo_atendimento), ''), 'SEM CATEGORIA')`;
const CATEGORY_CANONICAL_SQL = `UPPER(${CATEGORY_SQL})`;
const STAGE_SQL = `COALESCE(NULLIF(TRIM(etapaConta), ''), 'SEM ETAPA')`;
const CONVENIO_SQL = `COALESCE(NULLIF(TRIM(convenio), ''), 'SEM CONVÊNIO')`;
const SECTOR_SQL = `COALESCE(NULLIF(TRIM(setorEtapa), ''), NULLIF(TRIM(dsSetorEntrada), ''), 'SEM SETOR')`;
const MONTH_SQL = `DATE_FORMAT(data_entrada, '%Y-%m')`;
const AGE_SQL = `CASE
  WHEN COALESCE(dtEntrega, dtEtapa) IS NULL THEN 'SEM REFERÊNCIA'
  WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 14 THEN '0-14 DIAS'
  WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 30 THEN '15-30 DIAS'
  WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 60 THEN '31-60 DIAS'
  WHEN DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa)) <= 90 THEN '61-90 DIAS'
  ELSE '90+ DIAS'
END`;

function asCount(value: unknown): number {
  const decimal = new Decimal(String(value ?? 0));
  if (!decimal.isFinite() || !decimal.isInteger() || decimal.isNegative() || decimal.greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Quantidade de atendimentos fora da faixa segura.");
  }
  return decimal.toNumber();
}

function asMoney(value: unknown): number {
  const decimal = new Decimal(String(value ?? 0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const scaled = decimal.times(100);
  if (!decimal.isFinite() || !scaled.isInteger() || scaled.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Valor de atendimentos fora da faixa segura.");
  }
  const numeric = scaled.toNumber() / 100;
  if (!new Decimal(String(numeric)).equals(decimal)) {
    throw new Error("Valor de atendimentos perderia precisão na serialização.");
  }
  return numeric;
}

function label(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function canonicalCategory(value: unknown): string {
  return label(value, "SEM CATEGORIA").toLocaleUpperCase("pt-BR");
}

function buildWhere(filters: AtendimentosBiFilters): SqlWhere {
  const clauses = [
    "estabelecimentoId=?",
    "ativoNaFonte=1",
    "COALESCE(descricao_atendimento, '') NOT LIKE '%A_FATURAR%'",
    "(titulo IS NULL OR TRIM(titulo)='')",
    `(NOT (${TASY_ORIGINS}) OR UPPER(TRIM(COALESCE(convenio,''))) <> 'PARTICULAR')`,
  ];
  const params: unknown[] = [filters.estabelecimentoId];

  if (filters.mesEntrada) {
    clauses.push(`${MONTH_SQL}=?`);
    params.push(filters.mesEntrada);
  }
  if (filters.etapa) {
    clauses.push(`${STAGE_SQL}=?`);
    params.push(filters.etapa);
  }
  if (filters.convenio) {
    clauses.push(`${CONVENIO_SQL}=?`);
    params.push(filters.convenio);
  }
  if (filters.setor) {
    clauses.push(`${SECTOR_SQL}=?`);
    params.push(filters.setor);
  }
  if (filters.categoria) {
    clauses.push(`${CATEGORY_CANONICAL_SQL}=?`);
    params.push(filters.categoria);
  }
  if (filters.permanencia) {
    clauses.push(`${AGE_SQL}=?`);
    params.push(filters.permanencia);
  }
  return { clause: clauses.join(" AND "), params };
}

function rankRows(rows: RowDataPacket[], key: string, fallback: string) {
  return rows.map((row) => ({
    chave: label(row[key], fallback),
    quantidade: asCount(row.quantidade),
    valor: asMoney(row.valor),
  }));
}

export async function getAtendimentosBiDashboard(filters: AtendimentosBiFilters) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");

  const limit = Math.max(5, Math.min(30, filters.limite ?? 12));
  const filtered = buildWhere(filters);
  const available = buildWhere({ estabelecimentoId: filters.estabelecimentoId });

  const [
    summaryResult,
    monthResult,
    stageResult,
    convenioResult,
    sectorResult,
    categoryResult,
    ageResult,
    filterMonthsResult,
    filterStagesResult,
    filterConveniosResult,
    filterSetoresResult,
    filterCategoriasResult,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))), 0) AS valor,
        COUNT(*) AS semTitulo,
        SUM(CASE WHEN ${STAGE_SQL}='SEM ETAPA' THEN 1 ELSE 0 END) AS semEtapa,
        SUM(CASE WHEN data_saida IS NULL THEN 1 ELSE 0 END) AS semSaida,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))), 0) AS valorSemTitulo,
        COALESCE(SUM(CASE WHEN ${STAGE_SQL}='SEM ETAPA' THEN CAST(valorConta AS DECIMAL(18,2)) ELSE 0 END), 0) AS valorSemEtapa,
        COALESCE(SUM(CASE WHEN data_saida IS NULL THEN CAST(valorConta AS DECIMAL(18,2)) ELSE 0 END), 0) AS valorSemSaida,
        COALESCE(SUM(CASE WHEN ${STAGE_SQL}<>'SEM ETAPA' THEN CAST(valorConta AS DECIMAL(18,2)) ELSE 0 END), 0) AS valorComEtapa,
        COALESCE(SUM(CASE WHEN data_saida IS NOT NULL THEN CAST(valorConta AS DECIMAL(18,2)) ELSE 0 END), 0) AS valorComSaida
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
    `, filtered.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${MONTH_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause} AND data_entrada IS NOT NULL
      GROUP BY chave ORDER BY chave ASC
    `, filtered.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${STAGE_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
      GROUP BY chave ORDER BY valor DESC, chave ASC LIMIT ?
    `, [...filtered.params, limit]),
    pool.query<RowDataPacket[]>(`
      SELECT ${CONVENIO_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
      GROUP BY chave ORDER BY valor DESC, chave ASC LIMIT ?
    `, [...filtered.params, limit]),
    pool.query<RowDataPacket[]>(`
      SELECT ${SECTOR_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
      GROUP BY chave ORDER BY valor DESC, chave ASC LIMIT ?
    `, [...filtered.params, limit]),
    pool.query<RowDataPacket[]>(`
      SELECT ${CATEGORY_CANONICAL_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
      GROUP BY chave ORDER BY valor DESC, chave ASC LIMIT ?
    `, [...filtered.params, limit]),
    pool.query<RowDataPacket[]>(`
      SELECT ${AGE_SQL} AS chave, COUNT(*) AS quantidade,
        COALESCE(SUM(CAST(valorConta AS DECIMAL(18,2))),0) AS valor
      FROM atendimentos_unificados
      WHERE ${filtered.clause}
      GROUP BY chave
      ORDER BY FIELD(chave, '0-14 DIAS', '15-30 DIAS', '31-60 DIAS', '61-90 DIAS', '90+ DIAS', 'SEM REFERÊNCIA')
    `, filtered.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${MONTH_SQL} AS chave FROM atendimentos_unificados
      WHERE ${available.clause} AND data_entrada IS NOT NULL
      GROUP BY chave ORDER BY chave DESC
    `, available.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${STAGE_SQL} AS chave FROM atendimentos_unificados
      WHERE ${available.clause} GROUP BY chave ORDER BY chave ASC LIMIT 100
    `, available.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${CONVENIO_SQL} AS chave FROM atendimentos_unificados
      WHERE ${available.clause} GROUP BY chave ORDER BY chave ASC LIMIT 200
    `, available.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${SECTOR_SQL} AS chave FROM atendimentos_unificados
      WHERE ${available.clause} GROUP BY chave ORDER BY chave ASC LIMIT 200
    `, available.params),
    pool.query<RowDataPacket[]>(`
      SELECT ${CATEGORY_CANONICAL_SQL} AS chave FROM atendimentos_unificados
      WHERE ${available.clause} GROUP BY chave ORDER BY chave ASC LIMIT 100
    `, available.params),
  ]);

  const summary = summaryResult[0][0] || {} as RowDataPacket;
  const months = filterMonthsResult[0].map((row) => label(row.chave, "")).filter(Boolean);
  const stages = filterStagesResult[0].map((row) => label(row.chave, "SEM ETAPA"));
  const convenios = filterConveniosResult[0].map((row) => label(row.chave, "SEM CONVÊNIO"));
  const setores = filterSetoresResult[0].map((row) => label(row.chave, "SEM SETOR"));
  const categorias = filterCategoriasResult[0].map((row) => canonicalCategory(row.chave));
  const permanencias = ["0-14 DIAS", "15-30 DIAS", "31-60 DIAS", "61-90 DIAS", "90+ DIAS", "SEM REFERÊNCIA"];

  const quantidadeResumo = asCount(summary.quantidade);
  const valorResumo = asMoney(summary.valor);
  return {
    filtrosAplicados: {
      mesEntrada: filters.mesEntrada ?? null,
      etapa: filters.etapa ?? null,
      convenio: filters.convenio ?? null,
      setor: filters.setor ?? null,
      categoria: filters.categoria ?? null,
      permanencia: filters.permanencia ?? null,
      situacao: "pendentes",
    },
    resumo: {
      quantidade: quantidadeResumo,
      valor: valorResumo,
      ticketMedio: quantidadeResumo > 0
        ? asMoney(new Decimal(String(summary.valor || 0)).dividedBy(quantidadeResumo))
        : 0,
      semTitulo: asCount(summary.semTitulo),
      semEtapa: asCount(summary.semEtapa),
      semSaida: asCount(summary.semSaida),
      valorSemTitulo: asMoney(summary.valorSemTitulo),
      valorSemEtapa: asMoney(summary.valorSemEtapa),
      valorSemSaida: asMoney(summary.valorSemSaida),
      valorComEtapa: asMoney(summary.valorComEtapa),
      valorComSaida: asMoney(summary.valorComSaida),
    },
    porMesEntrada: rankRows(monthResult[0], "chave", "SEM DATA"),
    porEtapa: rankRows(stageResult[0], "chave", "SEM ETAPA"),
    porConvenio: rankRows(convenioResult[0], "chave", "SEM CONVÊNIO"),
    porSetor: rankRows(sectorResult[0], "chave", "SEM SETOR"),
    porCategoria: categoryResult[0].map((row) => ({
      chave: label(row.chave, "SEM CATEGORIA"),
      quantidade: asCount(row.quantidade),
      valor: asMoney(row.valor),
    })),
    porPermanencia: rankRows(ageResult[0], "chave", "SEM REFERÊNCIA"),
    cicloProcessos: [
      { chave: "COM ETAPA", quantidade: quantidadeResumo - asCount(summary.semEtapa), valor: asMoney(summary.valorComEtapa) },
      { chave: "SEM ETAPA", quantidade: asCount(summary.semEtapa), valor: asMoney(summary.valorSemEtapa) },
      { chave: "COM SAÍDA", quantidade: quantidadeResumo - asCount(summary.semSaida), valor: asMoney(summary.valorComSaida) },
      { chave: "SEM SAÍDA", quantidade: asCount(summary.semSaida), valor: asMoney(summary.valorSemSaida) },
    ],
    filtrosDisponiveis: { mesesEntrada: months, etapas: stages, convenios, setores, categorias, permanencias },
    metodologia: {
      fonte: "Atendimentos unificados ativos e sem título do estabelecimento selecionado.",
      privacidade: "O painel retorna somente agrupamentos; não retorna paciente, conta, matrícula, atendimento ou outro identificador individual.",
      particulares: "Registros Tasy com convênio Particular são excluídos, conforme a regra da tela de atendimentos.",
      pendencia: "O painel usa somente registros com o campo de título vazio; contas com título são excluídas no backend.",
      permanencia: "Para Tasy, a permanência é calculada a partir de dtEntrega; quando não existe, usa dtEtapa. Sem ambas, fica Sem referência.",
    },
  };
}
