import { z } from "zod";

/** Limites defensivos para filtros enviados pela tela de recurso de glosa. */
export const MAX_COMPETENCIAS_DEMONSTRATIVO = 60;
export const MAX_DATAS_PAGAMENTO_DEMONSTRATIVO = 100;
export const MAX_RECEBIMENTO_IDS_DEMONSTRATIVO = 5000;
export const MAX_PAGE_SIZE_DEMONSTRATIVO = 100;
export const MAX_PAGE_DEMONSTRATIVO = 100_000;

function isCompetenciaCalendario(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return year >= 1 && month >= 1 && month <= 12;
}

function isDataCalendario(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysByMonth[month - 1]!;
}

export const idPositivoDemonstrativoSchema = z.number().int().positive("ID deve ser um inteiro positivo");

export const competenciaDemonstrativoSchema = z
  .string()
  .refine(isCompetenciaCalendario, "Competência deve estar no formato real YYYY-MM");

export const dataPagamentoDemonstrativoSchema = z
  .string()
  .refine(isDataCalendario, "Data de pagamento deve estar no formato real YYYY-MM-DD");

export const competenciasDemonstrativoSchema = z
  .array(competenciaDemonstrativoSchema)
  .max(MAX_COMPETENCIAS_DEMONSTRATIVO, `Informe no máximo ${MAX_COMPETENCIAS_DEMONSTRATIVO} competências`);

export const datasPagamentoDemonstrativoSchema = z
  .array(dataPagamentoDemonstrativoSchema)
  .max(MAX_DATAS_PAGAMENTO_DEMONSTRATIVO, `Informe no máximo ${MAX_DATAS_PAGAMENTO_DEMONSTRATIVO} datas de pagamento`);

export const recebimentoIdsDemonstrativoSchema = z
  .array(idPositivoDemonstrativoSchema)
  .max(MAX_RECEBIMENTO_IDS_DEMONSTRATIVO, `Informe no máximo ${MAX_RECEBIMENTO_IDS_DEMONSTRATIVO} IDs`);

export const pageDemonstrativoSchema = z.number().int().min(1).max(MAX_PAGE_DEMONSTRATIVO);
export const pageSizeDemonstrativoSchema = z.number().int().min(1).max(MAX_PAGE_SIZE_DEMONSTRATIVO);

/**
 * Filtros comuns da seção Recurso Glosa Demonstrativo.
 *
 * Quando o array é enviado, ele tem precedência sobre o filtro escalar.
 * Um array vazio representa "Todas" naquela dimensão.
 */
export const recursoGlosaDemonstrativoRecorteSchema = z.object({
  estabelecimentoId: idPositivoDemonstrativoSchema,
  convenioId: idPositivoDemonstrativoSchema.optional(),
  competencia: competenciaDemonstrativoSchema.optional(),
  competencias: competenciasDemonstrativoSchema.optional(),
  dataPagto: dataPagamentoDemonstrativoSchema.optional(),
  datasPagto: datasPagamentoDemonstrativoSchema.optional(),
  recebimentoIds: recebimentoIdsDemonstrativoSchema.optional(),
});

export type RecursoGlosaDemonstrativoRecorteInput = z.input<typeof recursoGlosaDemonstrativoRecorteSchema>;

export type RecursoGlosaDemonstrativoRecorteNormalizado = {
  estabelecimentoId: number;
  convenioId?: number;
  competencias?: string[];
  datasPagto?: string[];
  recebimentoIds?: number[];
  competenciasFoiInformado: boolean;
  datasPagtoFoiInformado: boolean;
  recebimentoIdsFoiInformado: boolean;
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Valida e aplica a precedência array > escalar sem transformar entrada inválida
 * em um recorte mais amplo. Arrays vazios são normalizados como ausência de
 * condição SQL, preservando o significado explícito de "Todas".
 */
export function normalizarRecorteRecursoGlosaDemonstrativo(
  input: RecursoGlosaDemonstrativoRecorteInput,
): RecursoGlosaDemonstrativoRecorteNormalizado {
  const parsed = recursoGlosaDemonstrativoRecorteSchema.parse(input);
  const competenciasFoiInformado = parsed.competencias !== undefined;
  const datasPagtoFoiInformado = parsed.datasPagto !== undefined;
  const recebimentoIdsFoiInformado = parsed.recebimentoIds !== undefined;

  const competencias = competenciasFoiInformado
    ? unique(parsed.competencias!)
    : parsed.competencia ? [parsed.competencia] : undefined;
  const datasPagto = datasPagtoFoiInformado
    ? unique(parsed.datasPagto!)
    : parsed.dataPagto ? [parsed.dataPagto] : undefined;
  const recebimentoIds = recebimentoIdsFoiInformado
    ? unique(parsed.recebimentoIds!)
    : undefined;

  return {
    estabelecimentoId: parsed.estabelecimentoId,
    convenioId: parsed.convenioId,
    competencias: competencias?.length ? competencias : undefined,
    datasPagto: datasPagto?.length ? datasPagto : undefined,
    recebimentoIds: recebimentoIds?.length ? recebimentoIds : undefined,
    competenciasFoiInformado,
    datasPagtoFoiInformado,
    recebimentoIdsFoiInformado,
  };
}

function assertSqlAlias(alias: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error("Alias SQL inválido para o recorte do demonstrativo");
  }
}

function quoted(values: string[]): string {
  // Os valores já passaram por schemas de formato fechado; manter esta proteção
  // torna o helper seguro também quando chamado fora do router.
  return values.map(value => `'${value.replace(/'/g, "''")}'`).join(", ");
}

/**
 * Cria o predicado comum de todas as consultas da seção. A competência é sempre
 * derivada do mês de `data_pagamento`, e não de uma coluna de competência.
 */
export function montarRecorteRecursoGlosaDemonstrativoSql(
  alias: string,
  input: RecursoGlosaDemonstrativoRecorteInput | RecursoGlosaDemonstrativoRecorteNormalizado,
): string {
  assertSqlAlias(alias);
  const filters = "competenciasFoiInformado" in input
    ? input
    : normalizarRecorteRecursoGlosaDemonstrativo(input);

  const conditions = [`${alias}.estabelecimentoId = ${filters.estabelecimentoId}`];
  if (filters.convenioId !== undefined) {
    conditions.push(`${alias}.convenio_id = ${filters.convenioId}`);
  }
  if (filters.competencias?.length) {
    conditions.push(`DATE_FORMAT(${alias}.data_pagamento, '%Y-%m') IN (${quoted(filters.competencias)})`);
  }
  if (filters.datasPagto?.length) {
    conditions.push(`DATE_FORMAT(${alias}.data_pagamento, '%Y-%m-%d') IN (${quoted(filters.datasPagto)})`);
  }
  if (filters.recebimentoIds?.length) {
    conditions.push(`${alias}.id IN (${filters.recebimentoIds.join(", ")})`);
  }

  return conditions.join(" AND ");
}
