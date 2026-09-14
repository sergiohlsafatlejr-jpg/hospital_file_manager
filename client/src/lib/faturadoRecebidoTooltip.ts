export type FinanceiroTooltipRow = {
  competencia?: string;
  convenio?: string;
  codigo?: string;
  motivo?: string;
  item?: string;
  tipo?: string;
  totalFaturado?: number;
  totalRecebido?: number;
  totalGlosado?: number;
  totalSaldo?: number;
  totalAcrescimo?: number;
  glosaARecursar?: number;
  glosaEmRecurso?: number;
  glosaRecuperada?: number;
  glosaAceita?: number;
  percentualRecebido?: number;
  percentualGlosa?: number;
  percentualRecurso?: number;
  valorGlosado?: number;
  quantidade?: number;
};

export type FinanceiroTooltipMetric = {
  label: string;
  value: number;
  format: "money" | "percent" | "number";
  tone: "neutral" | "positive" | "negative" | "warning" | "info" | "violet";
};

export type FinanceiroTooltipModel = {
  title: string;
  eyebrow: string;
  description?: string;
  metrics: FinanceiroTooltipMetric[];
  resourceMetrics: FinanceiroTooltipMetric[];
};

const number = (value: unknown) => Number(value || 0);

export function criarTooltipFinanceiro(
  row: FinanceiroTooltipRow,
  context: "mes" | "convenio" | "ranking",
  options?: { monthLabel?: (value: string) => string; totalGlosado?: number },
): FinanceiroTooltipModel {
  if (context === "ranking") {
    const valorGlosado = number(row.valorGlosado);
    const quantidade = number(row.quantidade);
    const participacao = number(options?.totalGlosado) > 0
      ? (valorGlosado / number(options?.totalGlosado)) * 100
      : 0;
    return {
      title: row.motivo || row.item || "Não informado",
      eyebrow: row.codigo ? `Código ${row.codigo}` : "Detalhamento da glosa",
      description: row.tipo || undefined,
      metrics: [
        { label: "Valor glosado", value: valorGlosado, format: "money", tone: "negative" },
        { label: "Quantidade de itens", value: quantidade, format: "number", tone: "neutral" },
        { label: "Média por item", value: quantidade > 0 ? valorGlosado / quantidade : 0, format: "money", tone: "info" },
        { label: "Participação na glosa", value: participacao, format: "percent", tone: "warning" },
      ],
      resourceMetrics: [],
    };
  }

  const competencia = row.competencia || "Sem competência";
  return {
    title: context === "mes"
      ? (options?.monthLabel ? options.monthLabel(competencia) : competencia)
      : (row.convenio || "Sem convênio"),
    eyebrow: context === "mes" ? "Resultado do mês" : "Resultado do convênio",
    description: context === "mes" ? "Toque ou clique nas barras para filtrar o relatório" : "Toque ou clique para filtrar o relatório",
    metrics: [
      { label: "Faturado", value: number(row.totalFaturado), format: "money", tone: "neutral" },
      { label: "Recebido", value: number(row.totalRecebido), format: "money", tone: "positive" },
      { label: "Glosado", value: number(row.totalGlosado), format: "money", tone: "negative" },
      { label: "A baixar", value: number(row.totalSaldo), format: "money", tone: "warning" },
      { label: "Acréscimo", value: number(row.totalAcrescimo), format: "money", tone: "info" },
      { label: "% recebido", value: number(row.percentualRecebido), format: "percent", tone: "positive" },
      { label: "% glosa", value: number(row.percentualGlosa), format: "percent", tone: "negative" },
    ],
    resourceMetrics: [
      { label: "A recursar", value: number(row.glosaARecursar), format: "money", tone: "warning" },
      { label: "Em recurso", value: number(row.glosaEmRecurso), format: "money", tone: "info" },
      { label: "Recuperada", value: number(row.glosaRecuperada), format: "money", tone: "positive" },
      { label: "Aceita", value: number(row.glosaAceita), format: "money", tone: "violet" },
      { label: "% recurso", value: number(row.percentualRecurso), format: "percent", tone: "info" },
    ],
  };
}
