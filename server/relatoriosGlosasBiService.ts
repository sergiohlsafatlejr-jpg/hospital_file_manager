export type RawGlosaResumo = {
  total_pago?: unknown;
  total_glosa?: unknown;
  total_itens_glosados?: unknown;
  total_guias_glosadas?: unknown;
  glosa_sem_recurso?: unknown;
  glosa_recursada?: unknown;
};

export type RawRankingGlosa = Record<string, unknown> & {
  valor_glosado?: unknown;
  valor_pago?: unknown;
  glosa_sem_recurso?: unknown;
  glosa_recursada?: unknown;
  qtd_itens?: unknown;
};

export const numeroGlosa = (valor: unknown): number => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
};

export const percentualGlosa = (parte: number, total: number): number =>
  total > 0 ? Number(((parte / total) * 100).toFixed(2)) : 0;

export function montarResumoGlosas(row: RawGlosaResumo) {
  const totalPago = numeroGlosa(row.total_pago);
  const totalGlosa = numeroGlosa(row.total_glosa);
  const totalItensGlosados = numeroGlosa(row.total_itens_glosados);
  const totalGuiasGlosadas = numeroGlosa(row.total_guias_glosadas);
  const glosaSemRecurso = numeroGlosa(row.glosa_sem_recurso);
  const glosaRecursada = numeroGlosa(row.glosa_recursada);
  const valorCobrado = totalPago + totalGlosa;

  return {
    valorCobrado,
    valorPago: totalPago,
    valorGlosado: totalGlosa,
    totalItensGlosados,
    totalGuiasGlosadas,
    ticketMedio: totalItensGlosados > 0 ? Number((totalGlosa / totalItensGlosados).toFixed(2)) : 0,
    taxaGlosa: percentualGlosa(totalGlosa, valorCobrado),
    glosaSemRecurso,
    glosaRecursada,
    percentualRecursado: percentualGlosa(glosaRecursada, totalGlosa),
  };
}

export function complementarRankingGlosa<T extends RawRankingGlosa>(rows: T[], totalGlosa: number) {
  return rows.map((row) => {
    const valorGlosado = numeroGlosa(row.valor_glosado);
    const valorPago = numeroGlosa(row.valor_pago);
    return {
      ...row,
      valorGlosado,
      valorPago,
      valorCobrado: valorPago + valorGlosado,
      glosaSemRecurso: numeroGlosa(row.glosa_sem_recurso),
      glosaRecursada: numeroGlosa(row.glosa_recursada),
      qtdItens: numeroGlosa(row.qtd_itens),
      percentualTotal: percentualGlosa(valorGlosado, totalGlosa),
      taxaGlosa: percentualGlosa(valorGlosado, valorPago + valorGlosado),
    };
  });
}
