export type ConciliacaoStatusVisual = 'Associado' | 'Desassociado' | 'Acréscimo' | 'Terceiro';

export function getConciliacaoStatusLabel(status: string, item?: any): ConciliacaoStatusVisual {
  if (item?.statusConciliacao === 'glosado' && item?.metodoConciliacao === 'manual_confirmacao') {
    return 'Associado';
  }

  if (item?.codigoGlosa && item.codigoGlosa !== '9999') {
    return 'Associado';
  }

  if (item?.codigoGlosa === '9999') {
    return item.metodoConciliacao ? 'Associado' : 'Desassociado';
  }

  switch (status) {
    case 'conciliado':
    case 'glosa_total':
    case 'glosa_parcial':
    case 'conciliado_manual':
    case 'glosado':
      return 'Associado';
    case 'divergente':
    case 'acrescimo':
      return 'Acréscimo';
    case 'terceiro':
      return 'Terceiro';
    case 'sem_pagamento':
    case 'nao_recebido':
    case 'pendente':
    default:
      return 'Desassociado';
  }
}
