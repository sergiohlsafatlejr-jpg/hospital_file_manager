import { sql } from "drizzle-orm";

export type AtendimentoNormalizationInput = {
  origemSistema?: string | null;
  tipoAtendimento?: string | null;
  descricaoAtendimento?: string | null;
  dsCategoria?: string | null;
  codigoServico?: string | null;
  dsSetorEntrada?: string | null;
};

export type AtendimentoNormalizationSqlFields = {
  origemSistema: any;
  tipoAtendimento: any;
  descricaoAtendimento: any;
  dsCategoria: any;
  codigoServico: any;
  dsSetorEntrada: any;
};

function clean(value?: string | null): string {
  return String(value || "").trim();
}

function comparable(value?: string | null): string {
  return clean(value).toUpperCase();
}

export function normalizeAtendimentoCategory(input: AtendimentoNormalizationInput): string {
  const isTasy = ["tasy", "tasy_hemolabor"].includes(clean(input.origemSistema).toLowerCase());
  const semanticSource = comparable(
    clean(input.dsCategoria)
      || clean(input.descricaoAtendimento)
      || clean(input.tipoAtendimento),
  );

  if (/INTERN|APARTAMENTO|ENFERMARIA/.test(semanticSource)) return "INTERNACAO";
  if (/EXAME/.test(semanticSource)) return "EXAME";
  if (/AMBULAT|AMBULT/.test(semanticSource)) return "AMBULATORIO";
  if (/PRONTO|SOCORRO/.test(semanticSource)) return "PRONTO SOCORRO";

  const sourceCode = comparable(input.tipoAtendimento);
  if (!isTasy && sourceCode === "I") return "INTERNACAO";
  if (!isTasy && sourceCode === "E") return "EXAME";
  if (!isTasy && sourceCode === "A") return "AMBULATORIO";

  return "OUTROS";
}

export function resolveAtendimentoServiceType(input: AtendimentoNormalizationInput): string {
  const isTasy = ["tasy", "tasy_hemolabor"].includes(clean(input.origemSistema).toLowerCase());
  if (isTasy) {
    return clean(input.dsSetorEntrada)
      || clean(input.codigoServico)
      || clean(input.descricaoAtendimento)
      || "SEM TIPO DE SERVICO";
  }
  return clean(input.codigoServico)
    || clean(input.descricaoAtendimento)
    || clean(input.dsSetorEntrada)
    || "SEM TIPO DE SERVICO";
}

export function buildAtendimentoNormalizationSql(fields: AtendimentoNormalizationSqlFields) {
  const categorySourceSql = sql`UPPER(COALESCE(
    NULLIF(TRIM(${fields.dsCategoria}), ''),
    NULLIF(TRIM(${fields.descricaoAtendimento}), ''),
    NULLIF(TRIM(${fields.tipoAtendimento}), ''),
    ''
  ))`;
  const isTasySql = sql`LOWER(TRIM(COALESCE(${fields.origemSistema}, ''))) IN ('tasy', 'tasy_hemolabor')`;
  const normalizedCategorySql = sql`CASE
    WHEN ${categorySourceSql} REGEXP 'INTERN|APARTAMENTO|ENFERMARIA' THEN 'INTERNACAO'
    WHEN ${categorySourceSql} LIKE '%EXAME%' THEN 'EXAME'
    WHEN ${categorySourceSql} REGEXP 'AMBULAT|AMBULT' THEN 'AMBULATORIO'
    WHEN ${categorySourceSql} REGEXP 'PRONTO|SOCORRO' THEN 'PRONTO SOCORRO'
    WHEN NOT (${isTasySql}) AND UPPER(TRIM(COALESCE(${fields.tipoAtendimento}, ''))) = 'I' THEN 'INTERNACAO'
    WHEN NOT (${isTasySql}) AND UPPER(TRIM(COALESCE(${fields.tipoAtendimento}, ''))) = 'E' THEN 'EXAME'
    WHEN NOT (${isTasySql}) AND UPPER(TRIM(COALESCE(${fields.tipoAtendimento}, ''))) = 'A' THEN 'AMBULATORIO'
    ELSE 'OUTROS'
  END`;
  const normalizedServiceSql = sql`CASE
    WHEN ${isTasySql}
      THEN COALESCE(
        NULLIF(TRIM(${fields.dsSetorEntrada}), ''),
        NULLIF(TRIM(${fields.codigoServico}), ''),
        NULLIF(TRIM(${fields.descricaoAtendimento}), ''),
        'SEM TIPO DE SERVICO'
      )
    ELSE COALESCE(
      NULLIF(TRIM(${fields.codigoServico}), ''),
      NULLIF(TRIM(${fields.descricaoAtendimento}), ''),
      NULLIF(TRIM(${fields.dsSetorEntrada}), ''),
      'SEM TIPO DE SERVICO'
    )
  END`;

  return { normalizedCategorySql, normalizedServiceSql };
}
