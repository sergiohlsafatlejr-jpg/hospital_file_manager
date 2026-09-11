export type RawGlosaResumo = {
  total_processado?: unknown;
  total_pago?: unknown;
  total_glosa?: unknown;
  total_itens_glosados?: unknown;
  total_guias_glosadas?: unknown;
  glosa_sem_recurso?: unknown;
  glosa_aceita?: unknown;
  glosa_recursada?: unknown;
  glosa_pendente?: unknown;
};

export type RawRankingGlosa = Record<string, unknown> & {
  valor_glosado?: unknown;
  valor_pago?: unknown;
  glosa_sem_recurso?: unknown;
  glosa_aceita?: unknown;
  glosa_recursada?: unknown;
  glosa_pendente?: unknown;
  qtd_itens?: unknown;
};

export type DimensaoFiltroCruzado = "mesPagamento" | "convenio" | "item" | "procedimento" | "motivo";

export type FiltrosPainelGlosas = {
  estabelecimentoId: number;
  convenioId?: number;
  mesPagamentoInicio?: string;
  mesPagamentoFim?: string;
  categoriaGlosa?: string;
  mesPagamento?: string;
  itemDescricao?: string;
  procedimentoCodigo?: string;
  motivoCodigo?: string;
};

export function construirFiltroPainelGlosas(
  input: FiltrosPainelGlosas,
  excluirDimensao?: DimensaoFiltroCruzado,
) {
  const clausulas = ["d.estabelecimentoId = ?"];
  const params: Array<string | number> = [input.estabelecimentoId];

  if (input.convenioId && excluirDimensao !== "convenio") {
    clausulas.push("d.convenio_id = ?");
    params.push(input.convenioId);
  }
  if (input.mesPagamentoInicio) {
    clausulas.push("DATE_FORMAT(d.data_pagamento, '%Y/%m') >= ?");
    params.push(input.mesPagamentoInicio);
  }
  if (input.mesPagamentoFim) {
    clausulas.push("DATE_FORMAT(d.data_pagamento, '%Y/%m') <= ?");
    params.push(input.mesPagamentoFim);
  }
  if (input.categoriaGlosa) {
    clausulas.push("COALESCE(mg.grupo, 'Outros') = ?");
    params.push(input.categoriaGlosa);
  }
  if (input.mesPagamento && excluirDimensao !== "mesPagamento") {
    clausulas.push("DATE_FORMAT(d.data_pagamento, '%Y/%m') = ?");
    params.push(input.mesPagamento);
  }
  if (input.itemDescricao && excluirDimensao !== "item") {
    if (input.itemDescricao === "Item sem descrição") {
      clausulas.push("(d.descricao_item IS NULL OR TRIM(d.descricao_item) = '')");
    } else {
      clausulas.push("TRIM(d.descricao_item) = ?");
      params.push(input.itemDescricao);
    }
  }
  if (input.procedimentoCodigo && excluirDimensao !== "procedimento") {
    if (input.procedimentoCodigo === "S/CÓDIGO") {
      clausulas.push("(d.codigo_item IS NULL OR TRIM(d.codigo_item) = '')");
    } else {
      clausulas.push("TRIM(d.codigo_item) = ?");
      params.push(input.procedimentoCodigo);
    }
  }
  if (input.motivoCodigo && excluirDimensao !== "motivo") {
    if (input.motivoCodigo === "S/MOTIVO") {
      clausulas.push("(d.codigo_glosa IS NULL OR TRIM(d.codigo_glosa) = '')");
    } else {
      clausulas.push("TRIM(d.codigo_glosa) = ?");
      params.push(input.motivoCodigo);
    }
  }

  return {
    where: `WHERE ${clausulas.join(" AND ")}`,
    params,
  };
}

export const numeroGlosa = (valor: unknown): number => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
};

export const percentualGlosa = (parte: number, total: number): number =>
  total > 0 ? Number(((parte / total) * 100).toFixed(2)) : 0;

export function montarResumoGlosas(row: RawGlosaResumo) {
  const totalPago = numeroGlosa(row.total_pago);
  const totalGlosa = numeroGlosa(row.total_glosa);
  const totalProcessadoInformado = numeroGlosa(row.total_processado);
  const totalItensGlosados = numeroGlosa(row.total_itens_glosados);
  const totalGuiasGlosadas = numeroGlosa(row.total_guias_glosadas);
  const glosaSemRecurso = numeroGlosa(row.glosa_sem_recurso);
  const glosaAceita = numeroGlosa(row.glosa_aceita);
  const glosaRecursada = numeroGlosa(row.glosa_recursada);
  const glosaPendente = numeroGlosa(row.glosa_pendente);
  const valorProcessado = totalProcessadoInformado > 0 ? totalProcessadoInformado : totalPago + totalGlosa;
  const valorAnalisado = glosaAceita + glosaRecursada;

  return {
    valorCobrado: valorProcessado,
    valorProcessado,
    valorPago: totalPago,
    valorGlosado: totalGlosa,
    totalItensGlosados,
    totalGuiasGlosadas,
    ticketMedio: totalItensGlosados > 0 ? Number((totalGlosa / totalItensGlosados).toFixed(2)) : 0,
    taxaGlosa: percentualGlosa(totalGlosa, valorProcessado),
    glosaSemRecurso,
    glosaAceita,
    glosaRecursada,
    glosaPendente,
    valorAnalisado,
    percentualAceito: percentualGlosa(glosaAceita, totalGlosa),
    percentualRecursado: percentualGlosa(glosaRecursada, totalGlosa),
    percentualAnalisado: percentualGlosa(valorAnalisado, totalGlosa),
  };
}

export function complementarRankingGlosa<T extends RawRankingGlosa>(rows: T[], totalGlosa: number) {
  return rows.map((row) => {
    const valorGlosado = numeroGlosa(row.valor_glosado);
    const valorPago = numeroGlosa(row.valor_pago);
    const valorProcessado = valorPago + valorGlosado;
    return {
      ...row,
      valorGlosado,
      valorPago,
      valorCobrado: valorProcessado,
      valorProcessado,
      glosaSemRecurso: numeroGlosa(row.glosa_sem_recurso),
      glosaAceita: numeroGlosa(row.glosa_aceita),
      glosaRecursada: numeroGlosa(row.glosa_recursada),
      glosaPendente: numeroGlosa(row.glosa_pendente),
      qtdItens: numeroGlosa(row.qtd_itens),
      percentualTotal: percentualGlosa(valorGlosado, totalGlosa),
      taxaGlosa: percentualGlosa(valorGlosado, valorProcessado),
    };
  });
}
