export type ItemFinanceiroOxUti = {
  situacaoItem?: string | null;
  valorInformado?: number | string | null;
  valorPago?: number | string | null;
  valorGlosa?: number | string | null;
};

const numero = (valor: number | string | null | undefined) => {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
};

const normalizarSituacao = (situacao: string | null | undefined) =>
  (situacao ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * O formato alternativo da Unimed fornece apenas "Valor Pagamento".
 * Quando a situação é PARCIAL ou GLOSADO e não existe valor de glosa
 * separado, esse valor representa o montante apontado com glosa no item.
 */
export function calcularValoresRelatorioOxUti(item: ItemFinanceiroOxUti) {
  const situacao = normalizarSituacao(item.situacaoItem);
  const informadoOriginal = numero(item.valorInformado);
  const pagoOriginal = numero(item.valorPago);
  const glosaOriginal = numero(item.valorGlosa);
  const aguardandoAnalise = ["EM ANALISE", "PENDENTE"].includes(situacao);
  const glosaSemSeparacao = ["GLOSADO", "PARCIAL"].includes(situacao) && glosaOriginal <= 0;

  const valorPago = situacao === "GLOSADO" || aguardandoAnalise || glosaSemSeparacao
    ? 0
    : pagoOriginal;
  const valorGlosa = glosaOriginal > 0
    ? glosaOriginal
    : glosaSemSeparacao
      ? (informadoOriginal > 0 ? informadoOriginal : pagoOriginal)
      : 0;
  const valorInformado = informadoOriginal > 0
    ? informadoOriginal
    : valorPago + valorGlosa;

  return { valorInformado, valorPago, valorGlosa };
}

export const sqlValoresRelatorioOxUti = (alias = "d") => {
  const situacao = `UPPER(TRIM(COALESCE(${alias}.situacao_item, '')))`;
  const glosaOriginal = `COALESCE(${alias}.valor_glosa, 0)`;
  const informadoOriginal = `COALESCE(${alias}.valor_informado, 0)`;
  const pagoOriginal = `COALESCE(${alias}.valor_pago, 0)`;
  const glosaSemSeparacao = `(${situacao} IN ('GLOSADO', 'PARCIAL') AND ${glosaOriginal} <= 0)`;

  const valorPago = `(CASE
    WHEN ${situacao} IN ('GLOSADO', 'EM ANÁLISE', 'EM ANALISE', 'PENDENTE') THEN 0
    WHEN ${glosaSemSeparacao} THEN 0
    ELSE ${pagoOriginal}
  END)`;
  const valorGlosa = `(CASE
    WHEN ${glosaOriginal} > 0 THEN ${glosaOriginal}
    WHEN ${glosaSemSeparacao} THEN COALESCE(NULLIF(${alias}.valor_informado, 0), ${alias}.valor_pago, 0)
    ELSE 0
  END)`;
  const valorInformado = `(CASE
    WHEN ${informadoOriginal} > 0 THEN ${informadoOriginal}
    ELSE ${valorPago} + ${valorGlosa}
  END)`;

  return { valorInformado, valorPago, valorGlosa };
};
