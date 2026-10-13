import Decimal from "decimal.js";
import {
  HUP_CONCILIACAO_STATUS,
  formatoDecimalExato,
  type HupConciliacaoItem,
  type HupConciliacaoStatus,
} from "./hupConciliacaoPilotoCompare";

const DecimalExato = Decimal.clone({ precision: 80 });

export type HupConciliacaoGuiaStatus = HupConciliacaoStatus | "misto";

export type HupConciliacaoGuia = {
  chave: string;
  conta: string;
  guiaPrestador: string;
  guiaOperadora: string;
  totalItens: number;
  totalGrupos: number;
  valorFaturado: string;
  valorFaturadoHospital: string;
  valorFaturadoMedicoDireto: string;
  status: HupConciliacaoGuiaStatus;
  statusContagens: Record<HupConciliacaoStatus, number>;
  valorPagoCandidato: string | null;
  valorGlosaCandidata: string | null;
  gruposComPago: number;
  gruposComGlosa: number;
  gruposCandidatos: number;
  gruposHospitalares: number;
  itens: HupConciliacaoItem[];
  detalhesLimitados: boolean;
};

type GuiaEmConstrucao = Omit<
  HupConciliacaoGuia,
  | "valorFaturado"
  | "valorFaturadoHospital"
  | "valorFaturadoMedicoDireto"
  | "status"
  | "valorPagoCandidato"
  | "valorGlosaCandidata"
> & {
  valorFaturado: Decimal;
  valorFaturadoHospital: Decimal;
  valorFaturadoMedicoDireto: Decimal;
  valorPagoCandidato: Decimal | null;
  valorGlosaCandidata: Decimal | null;
};

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

/**
 * Identificadores ausentes/zerados não têm segurança para reunir itens distintos.
 * Nesses casos, cada grupo de comparação é mantido em sua própria guia visual.
 */
function identificadorPresente(valor: string): boolean {
  return valor.length > 0 && !/^0+$/.test(valor);
}

function novoStatusContagens(): Record<HupConciliacaoStatus, number> {
  const contagens = {} as Record<HupConciliacaoStatus, number>;
  for (const status of HUP_CONCILIACAO_STATUS) contagens[status] = 0;
  return contagens;
}

function novaGuia(item: HupConciliacaoItem, chave: string): GuiaEmConstrucao {
  return {
    // Literal identifier tuple: never an origin, hash or technical code.
    chave,
    conta: texto(item.conta),
    guiaPrestador: texto(item.guiaPrestador),
    guiaOperadora: texto(item.guiaOperadora),
    totalItens: 0,
    totalGrupos: 0,
    valorFaturado: new DecimalExato(0),
    valorFaturadoHospital: new DecimalExato(0),
    valorFaturadoMedicoDireto: new DecimalExato(0),
    statusContagens: novoStatusContagens(),
    valorPagoCandidato: null,
    valorGlosaCandidata: null,
    gruposComPago: 0,
    gruposComGlosa: 0,
    gruposCandidatos: 0,
    gruposHospitalares: 0,
    itens: [],
    detalhesLimitados: false,
  };
}

/**
 * Agrupa o resultado completo do motor por conta e guias, antes de qualquer filtro
 * ou paginação. A chave de agrupamento é literalmente o JSON da tupla solicitada.
 */
export function agruparGuiasHup(items: readonly HupConciliacaoItem[], limiteDetalhes = 100): HupConciliacaoGuia[] {
  const porGuia = new Map<string, GuiaEmConstrucao>();
  const isoladas: GuiaEmConstrucao[] = [];

  for (const item of items) {
    const conta = texto(item.conta);
    const guiaPrestador = texto(item.guiaPrestador);
    const guiaOperadora = texto(item.guiaOperadora);
    const chaveAgrupamento = JSON.stringify([conta, guiaPrestador, guiaOperadora]);
    const incompleta = !identificadorPresente(conta)
      || !identificadorPresente(guiaPrestador)
      || !identificadorPresente(guiaOperadora);
    // Uma tupla sem todos os identificadores não usa o Map: nunca mescla vazios.
    let guia = incompleta ? undefined : porGuia.get(chaveAgrupamento);
    if (!guia) {
      guia = novaGuia(item, chaveAgrupamento);
      if (incompleta) isoladas.push(guia);
      else porGuia.set(chaveAgrupamento, guia);
    }

    guia.totalItens += item.totalItens;
    guia.totalGrupos += 1;
    guia.valorFaturado = guia.valorFaturado.plus(item.valorFaturado);
    if (item.modalidade === "S") {
      guia.valorFaturadoHospital = guia.valorFaturadoHospital.plus(item.valorFaturado);
      guia.gruposHospitalares += 1;
    }
    if (item.modalidade === "N") guia.valorFaturadoMedicoDireto = guia.valorFaturadoMedicoDireto.plus(item.valorFaturado);
    guia.statusContagens[item.status] += 1;
    if (item.status === "candidato") {
      guia.gruposCandidatos += 1;
      // O motor já garante exclusividade; não se deduplica por valor ou código de guia.
      if (item.valorPagoCandidato != null) {
        guia.valorPagoCandidato = (guia.valorPagoCandidato ?? new DecimalExato(0)).plus(item.valorPagoCandidato);
        guia.gruposComPago += 1;
      }
      if (item.valorGlosaCandidata != null) {
        guia.valorGlosaCandidata = (guia.valorGlosaCandidata ?? new DecimalExato(0)).plus(item.valorGlosaCandidata);
        guia.gruposComGlosa += 1;
      }
    }
    if (guia.itens.length < limiteDetalhes) guia.itens.push(item);
    else guia.detalhesLimitados = true;
  }

  return [...porGuia.values(), ...isoladas].map((guia, indice) => {
    const statusPresentes = HUP_CONCILIACAO_STATUS.filter((status) => guia.statusContagens[status] > 0);
    return {
      // Posição visual, sem hash/origem e sem colisão entre tuplas incompletas iguais.
      chave: `guia-${indice + 1}`,
      conta: guia.conta,
      guiaPrestador: guia.guiaPrestador,
      guiaOperadora: guia.guiaOperadora,
      totalItens: guia.totalItens,
      totalGrupos: guia.totalGrupos,
      valorFaturado: formatoDecimalExato(guia.valorFaturado),
      valorFaturadoHospital: formatoDecimalExato(guia.valorFaturadoHospital),
      valorFaturadoMedicoDireto: formatoDecimalExato(guia.valorFaturadoMedicoDireto),
      status: statusPresentes.length === 1 ? statusPresentes[0]! : "misto",
      statusContagens: guia.statusContagens,
      valorPagoCandidato: guia.valorPagoCandidato == null ? null : formatoDecimalExato(guia.valorPagoCandidato),
      valorGlosaCandidata: guia.valorGlosaCandidata == null ? null : formatoDecimalExato(guia.valorGlosaCandidata),
      gruposComPago: guia.gruposComPago,
      gruposComGlosa: guia.gruposComGlosa,
      gruposCandidatos: guia.gruposCandidatos,
      gruposHospitalares: guia.gruposHospitalares,
      itens: guia.itens,
      detalhesLimitados: guia.detalhesLimitados,
    };
  });
}
