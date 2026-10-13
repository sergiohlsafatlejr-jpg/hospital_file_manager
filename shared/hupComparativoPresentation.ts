import Decimal from "decimal.js";

const DecimalExato = Decimal.clone({ precision: 80 });

/**
 * Structural public fields needed to present a conservative comparison.  It is
 * intentionally independent from the server matching engine so it can be used
 * by both API aggregation and a client without importing server modules.
 */
export type HupComparativoItemEstrutural = {
  modalidade: string;
  status: string;
  numeroCandidatos: number;
  dataItem: string | null;
  valorFaturado: string;
  valorPagoCandidato: string | null;
  valorGlosaCandidata: string | null;
  candidatos: readonly { dataItem: string | null }[];
};

export type HupAvaliacaoComparativa = {
  comparavel: boolean;
  diferenca: string | null;
  motivo: string;
};

function dataCivilValida(valor: string | null): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return ano >= 1900 && ano <= 2200
    && data.getUTCFullYear() === ano
    && data.getUTCMonth() + 1 === mes
    && data.getUTCDate() === dia;
}

function decimalExato(valor: string): Decimal | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(valor)) return null;
  const parsed = new DecimalExato(valor);
  return parsed.isFinite() ? parsed : null;
}

function textoDecimal(valor: Decimal): string {
  return valor.toFixed(Math.max(2, valor.decimalPlaces() ?? 0));
}

/**
 * Does not establish a payment link or allocate values.  A difference is
 * exposed only for an already-exclusive engine candidate whose item date is
 * proven equal to the demonstrativo date and whose two values are known.
 */
export function avaliarComparativoItem(item: HupComparativoItemEstrutural): HupAvaliacaoComparativa {
  if (item.modalidade === "N") return { comparavel: false, diferenca: null, motivo: "medico_direto" };
  if (item.modalidade !== "S") return { comparavel: false, diferenca: null, motivo: "dados_incompletos" };
  if (item.status !== "candidato") {
    return {
      comparavel: false,
      diferenca: null,
      motivo: item.status === "ambiguo" || item.status === "sem_candidato" || item.status === "dados_incompletos"
        ? item.status
        : "dados_incompletos",
    };
  }
  if (item.numeroCandidatos !== 1 || item.candidatos.length !== 1) {
    return { comparavel: false, diferenca: null, motivo: "ambiguo" };
  }
  const candidato = item.candidatos[0]!;
  if (!dataCivilValida(item.dataItem) || !dataCivilValida(candidato.dataItem) || candidato.dataItem !== item.dataItem) {
    return { comparavel: false, diferenca: null, motivo: "sem_prova_data" };
  }
  if (item.valorPagoCandidato == null || item.valorGlosaCandidata == null) {
    return { comparavel: false, diferenca: null, motivo: "valores_nao_informados" };
  }
  const faturado = decimalExato(item.valorFaturado);
  const pago = decimalExato(item.valorPagoCandidato);
  const glosa = decimalExato(item.valorGlosaCandidata);
  if (!faturado || !pago || !glosa) {
    return { comparavel: false, diferenca: null, motivo: "valores_nao_informados" };
  }
  return {
    comparavel: true,
    diferenca: textoDecimal(faturado.minus(pago).minus(glosa)),
    motivo: "comparavel",
  };
}
