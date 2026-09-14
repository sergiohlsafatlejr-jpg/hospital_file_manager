export type RegistroFinanceiroUnificado = {
  competencia: string | null;
  convenio: string;
  fonte?: "faturado" | "retorno" | "recurso";
  faturado?: number;
  recebido?: number;
  glosado?: number;
  glosaAceita?: number;
  glosaRecursada?: number;
  glosaEmRecurso?: number;
  glosaRecuperada?: number;
  acrescimo?: number;
  quantidade?: number;
};

export type IndicadoresFinanceirosUnificado = {
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalSaldo: number;
  totalAcrescimo: number;
  glosaARecursar: number;
  glosaEmRecurso: number;
  glosaRecursada: number;
  glosaRecuperada: number;
  glosaAceita: number;
  quantidade: number;
  percentualGlosa: number;
  percentualRecebido: number;
  percentualRecurso: number;
};

const arredondar = (valor: number) => Number(Number(valor || 0).toFixed(2));
const percentual = (valor: number, base: number) => base > 0 ? arredondar((valor / base) * 100) : 0;

export function normalizarConvenio(valor: string | null | undefined) {
  return String(valor || "Sem convênio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function consolidarRegistrosFinanceiros(registros: RegistroFinanceiroUnificado[]) {
  const grupos = new Map<string, {
    competencia: string | null;
    convenio: string;
    faturadoXml: number;
    recebido: number;
    glosado: number;
    glosaAceita: number;
    glosaRecursada: number;
    glosaEmRecurso: number;
    glosaRecuperada: number;
    quantidadeFaturada: number;
    quantidadeRetorno: number;
  }>();

  for (const item of registros) {
    const chave = `${item.competencia || "SEM_COMPETENCIA"}|${normalizarConvenio(item.convenio)}`;
    const atual = grupos.get(chave) || {
      competencia: item.competencia,
      convenio: item.convenio,
      faturadoXml: 0,
      recebido: 0,
      glosado: 0,
      glosaAceita: 0,
      glosaRecursada: 0,
      glosaEmRecurso: 0,
      glosaRecuperada: 0,
      quantidadeFaturada: 0,
      quantidadeRetorno: 0,
    };
    atual.faturadoXml += Number(item.faturado || 0);
    atual.recebido += Number(item.recebido || 0);
    atual.glosado += Number(item.glosado || 0);
    atual.glosaAceita += Number(item.glosaAceita || 0);
    atual.glosaRecursada += Number(item.glosaRecursada || 0);
    atual.glosaEmRecurso += Number(item.glosaEmRecurso || 0);
    atual.glosaRecuperada += Number(item.glosaRecuperada || 0);
    if (item.fonte === "faturado") atual.quantidadeFaturada += Number(item.quantidade || 0);
    if (item.fonte === "retorno") atual.quantidadeRetorno += Number(item.quantidade || 0);
    grupos.set(chave, atual);
  }

  return [...grupos.values()].map((item): RegistroFinanceiroUnificado => {
    const processadoNoRetorno = item.recebido + item.glosado;
    return {
      competencia: item.competencia,
      convenio: item.convenio,
      faturado: arredondar(Math.max(item.faturadoXml, processadoNoRetorno)),
      recebido: arredondar(item.recebido),
      glosado: arredondar(item.glosado),
      glosaAceita: arredondar(item.glosaAceita),
      glosaRecursada: arredondar(item.glosaRecursada),
      glosaEmRecurso: arredondar(item.glosaEmRecurso),
      glosaRecuperada: arredondar(item.glosaRecuperada),
      quantidade: Math.max(item.quantidadeFaturada, item.quantidadeRetorno),
    };
  });
}

export function calcularIndicadoresFinanceiros(registros: RegistroFinanceiroUnificado[]): IndicadoresFinanceirosUnificado {
  const bruto = registros.reduce((total, item) => ({
    totalFaturado: total.totalFaturado + Number(item.faturado || 0),
    totalRecebido: total.totalRecebido + Number(item.recebido || 0),
    totalGlosado: total.totalGlosado + Number(item.glosado || 0),
    glosaAceita: total.glosaAceita + Number(item.glosaAceita || 0),
    glosaRecursada: total.glosaRecursada + Number(item.glosaRecursada || 0),
    glosaEmRecurso: total.glosaEmRecurso + Number(item.glosaEmRecurso || 0),
    glosaRecuperada: total.glosaRecuperada + Number(item.glosaRecuperada || 0),
    quantidade: total.quantidade + Number(item.quantidade || 0),
  }), {
    totalFaturado: 0,
    totalRecebido: 0,
    totalGlosado: 0,
    glosaAceita: 0,
    glosaRecursada: 0,
    glosaEmRecurso: 0,
    glosaRecuperada: 0,
    quantidade: 0,
  });

  const totalFaturado = arredondar(bruto.totalFaturado);
  const totalRecebido = arredondar(bruto.totalRecebido);
  const totalGlosado = arredondar(bruto.totalGlosado);
  const glosaAceita = arredondar(bruto.glosaAceita);
  const glosaRecursada = arredondar(bruto.glosaRecursada);
  const glosaEmRecurso = arredondar(bruto.glosaEmRecurso);
  const glosaRecuperada = arredondar(bruto.glosaRecuperada);
  const totalSaldo = arredondar(Math.max(totalFaturado - totalRecebido - totalGlosado, 0));
  const totalAcrescimo = arredondar(Math.max(totalRecebido + totalGlosado - totalFaturado, 0));
  const glosaARecursar = arredondar(Math.max(totalGlosado - glosaAceita - glosaRecursada, 0));

  return {
    totalFaturado,
    totalRecebido,
    totalGlosado,
    totalSaldo,
    totalAcrescimo,
    glosaARecursar,
    glosaEmRecurso,
    glosaRecursada,
    glosaRecuperada,
    glosaAceita,
    quantidade: bruto.quantidade,
    percentualGlosa: percentual(totalGlosado, totalFaturado),
    percentualRecebido: percentual(totalRecebido, totalFaturado),
    percentualRecurso: percentual(glosaRecursada, totalGlosado),
  };
}

export function agruparFinanceiro(registros: RegistroFinanceiroUnificado[], dimensao: "competencia" | "convenio") {
  const grupos = new Map<string, RegistroFinanceiroUnificado[]>();
  for (const registro of registros) {
    const chave = dimensao === "competencia" ? (registro.competencia || "Sem competência") : registro.convenio;
    const atual = grupos.get(chave) || [];
    atual.push(registro);
    grupos.set(chave, atual);
  }
  return [...grupos.entries()].map(([chave, itens]) => ({
    [dimensao]: chave,
    ...calcularIndicadoresFinanceiros(itens),
  }));
}
