import Decimal from "decimal.js";

const ExactDecimal = Decimal.clone({ precision: 80 });

export const HUP_CONCILIACAO_STATUS = [
  "candidato",
  "ambiguo",
  "sem_candidato",
  "medico_direto",
  "dados_incompletos",
] as const;

export type HupConciliacaoStatus = (typeof HUP_CONCILIACAO_STATUS)[number];

export type HupSnapshotItem = {
  conta: string;
  guiaPrestador: string;
  guiaOperadora: string;
  codigoTuss: string;
  dataItem: string | null;
  tipoItem: string;
  setor: string;
  modalidade: string;
  quantidade: string;
  valorFaturado: string;
  descricaoItem?: string;
  /** A origem nome/código apontou para mais de um convênio manual. */
  mapeamentoAmbiguo?: boolean;
};

export type HupDemonstrativoEvento = {
  id: string;
  arquivoId: string;
  guia: string;
  codigoTuss: string;
  dataItem: string | null;
  dataPagamento: string | null;
  valorPago: string | null;
  valorGlosa: string | null;
};

export type HupConciliacaoCandidato = {
  guia: string;
  codigoTuss: string;
  dataItem: string | null;
  dataPagamento: string | null;
  valorPago: string | null;
  valorGlosa: string | null;
};

export type HupConciliacaoItem = {
  chave: string;
  descricoesItem?: string[];
  conta: string;
  guiaPrestador: string;
  guiaOperadora: string;
  codigoTuss: string;
  dataItem: string | null;
  tipoItem: string;
  setor: string;
  modalidade: string;
  totalItens: number;
  quantidade: string;
  valorFaturado: string;
  status: HupConciliacaoStatus;
  motivo: string;
  numeroCandidatos: number;
  valorPagoCandidato: string | null;
  valorGlosaCandidata: string | null;
  diferencaEstimada: string | null;
  candidatos: HupConciliacaoCandidato[];
};

export type HupConciliacaoResumo = {
  totalItens: number;
  totalGrupos: number;
  totalEventos: number;
  valorFaturadoHospital: string;
  valorFaturadoMedicoDireto: string;
  valorPagoDemonstrativo: string | null;
  valorGlosaDemonstrativo: string | null;
  eventosSemValorPago: number;
  eventosSemValorGlosa: number;
  gruposCandidatos: number;
  gruposAmbiguos: number;
  gruposSemCandidato: number;
  gruposDadosIncompletos: number;
  gruposMedicoDireto: number;
};

type GrupoInterno = {
  ordem: number;
  descricoes: Set<string>;
  conta: string;
  guiaPrestador: string;
  guiaOperadora: string;
  codigoTuss: string;
  dataItem: string | null;
  tipoItem: string;
  setor: string;
  modalidade: string;
  mapeamentoAmbiguo: boolean;
  totalItens: number;
  quantidade: Decimal;
  valorFaturado: Decimal;
};

type EventoElegivel = {
  evento: HupDemonstrativoEvento;
  dataSemProva: boolean;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function decimal(value: unknown): Decimal {
  const raw = Decimal.isDecimal(value) ? value.toFixed() : text(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error("VALOR_DECIMAL_INVALIDO");
  const parsed = new ExactDecimal(raw);
  if (!parsed.isFinite()) throw new Error("VALOR_DECIMAL_INVALIDO");
  return parsed;
}

export function dataCivilPiloto(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y
    && date.getUTCMonth() + 1 === m && date.getUTCDate() === d ? value : null;
}

function identificador(value: string): boolean { return value.length > 0 && !/^0+$/.test(value); }

/**
 * Formata um Decimal sem passar por Number. Não arredonda: os campos de origem
 * já chegam como DECIMAL/string e a saída permanece exata para o consumidor.
 */
export function formatoDecimalExato(value: Decimal.Value, casasMinimas = 2): string {
  const parsed = decimal(value);
  const casas = Math.max(casasMinimas, parsed.decimalPlaces() ?? 0);
  return parsed.toFixed(casas);
}

function chaveGrupo(item: HupSnapshotItem): string {
  // Separador de controle impede colisões de concatenação sem usar origem/hash.
  return [
    text(item.conta),
    text(item.guiaPrestador),
    text(item.guiaOperadora),
    text(item.codigoTuss),
    item.dataItem ?? "",
    text(item.tipoItem),
    text(item.setor),
    text(item.modalidade).toUpperCase(),
  ].map(v => JSON.stringify(v)).join("\u001f");
}

function eventoAssinatura(evento: HupDemonstrativoEvento): string {
  // Serve apenas para sinalizar repetição entre arquivos. Eventos nunca são removidos.
  return [
    text(evento.guia),
    text(evento.codigoTuss),
    evento.dataItem ?? "",
    evento.dataPagamento ?? "",
    evento.valorPago == null ? "NAO_INFORMADO" : formatoDecimalExato(evento.valorPago),
    evento.valorGlosa == null ? "NAO_INFORMADO" : formatoDecimalExato(evento.valorGlosa),
  ].join("\u001f");
}

function dadosObrigatoriosAusentes(grupo: GrupoInterno): string[] {
  const faltando: string[] = [];
  if (!identificador(grupo.conta)) faltando.push("conta");
  if (!identificador(grupo.guiaPrestador) && !identificador(grupo.guiaOperadora)) faltando.push("guia");
  if (!identificador(grupo.codigoTuss)) faltando.push("código TUSS");
  if (!dataCivilPiloto(grupo.dataItem)) faltando.push("data do item válida");
  if (grupo.modalidade !== "S" && grupo.modalidade !== "N") {
    faltando.push("modalidade S/N");
  }
  return faltando;
}

function eventoCombinaGrupo(grupo: GrupoInterno, evento: HupDemonstrativoEvento): EventoElegivel | null {
  const guia = text(evento.guia);
  const codigo = text(evento.codigoTuss);
  if (!identificador(guia) || !identificador(codigo) || codigo !== grupo.codigoTuss) return null;
  if (guia !== grupo.guiaPrestador && guia !== grupo.guiaOperadora) return null;

  const dataSemProva = !grupo.dataItem || !dataCivilPiloto(evento.dataItem);
  if (!dataSemProva && grupo.dataItem !== evento.dataItem) return null;
  return { evento, dataSemProva };
}

function candidato(evento: HupDemonstrativoEvento): HupConciliacaoCandidato {
  return {
    guia: text(evento.guia),
    codigoTuss: text(evento.codigoTuss),
    dataItem: evento.dataItem,
    dataPagamento: evento.dataPagamento,
    valorPago: evento.valorPago == null ? null : formatoDecimalExato(evento.valorPago),
    valorGlosa: evento.valorGlosa == null ? null : formatoDecimalExato(evento.valorGlosa),
  };
}

function itemBase(grupo: GrupoInterno): Omit<HupConciliacaoItem, "status" | "motivo" | "numeroCandidatos" | "valorPagoCandidato" | "valorGlosaCandidata" | "diferencaEstimada" | "candidatos"> {
  return {
    // A chave é uma posição determinística do grupo, jamais origemRegistroId/hash.
    chave: `grupo-${grupo.ordem + 1}`,
    descricoesItem: [...grupo.descricoes],
    conta: grupo.conta,
    guiaPrestador: grupo.guiaPrestador,
    guiaOperadora: grupo.guiaOperadora,
    codigoTuss: grupo.codigoTuss,
    dataItem: grupo.dataItem,
    tipoItem: grupo.tipoItem,
    setor: grupo.setor,
    modalidade: grupo.modalidade,
    totalItens: grupo.totalItens,
    quantidade: formatoDecimalExato(grupo.quantidade, 0),
    valorFaturado: formatoDecimalExato(grupo.valorFaturado),
  };
}

export function compararSnapshotHup(
  itensSnapshot: readonly HupSnapshotItem[],
  eventosDemonstrativo: readonly HupDemonstrativoEvento[],
): { items: HupConciliacaoItem[]; resumo: HupConciliacaoResumo } {
  const porGrupo = new Map<string, GrupoInterno>();
  for (const item of itensSnapshot) {
    const key = chaveGrupo(item);
    const existente = porGrupo.get(key);
    if (existente) {
      existente.totalItens += 1;
      if (text(item.descricaoItem)) existente.descricoes.add(text(item.descricaoItem));
      existente.quantidade = existente.quantidade.plus(decimal(item.quantidade));
      existente.valorFaturado = existente.valorFaturado.plus(decimal(item.valorFaturado));
      existente.mapeamentoAmbiguo ||= Boolean(item.mapeamentoAmbiguo);
      continue;
    }
    porGrupo.set(key, {
      ordem: porGrupo.size,
      descricoes: new Set(text(item.descricaoItem) ? [text(item.descricaoItem)] : []),
      conta: text(item.conta),
      guiaPrestador: text(item.guiaPrestador),
      guiaOperadora: text(item.guiaOperadora),
      codigoTuss: text(item.codigoTuss),
      dataItem: item.dataItem,
      tipoItem: text(item.tipoItem),
      setor: text(item.setor),
      modalidade: text(item.modalidade).toUpperCase(),
      mapeamentoAmbiguo: Boolean(item.mapeamentoAmbiguo),
      totalItens: 1,
      quantidade: decimal(item.quantidade),
      valorFaturado: decimal(item.valorFaturado),
    });
  }

  const grupos = [...porGrupo.values()];
  const indiceEventos = new Map<string, HupDemonstrativoEvento[]>();
  for (const evento of eventosDemonstrativo) {
    const key = JSON.stringify([text(evento.guia), text(evento.codigoTuss)]);
    const bucket = indiceEventos.get(key) ?? [];
    bucket.push(evento);
    indiceEventos.set(key, bucket);
  }
  const elegiveisPorGrupo = new Map<number, EventoElegivel[]>();
  const gruposPorEvento = new Map<string, Set<number>>();
  for (const grupo of grupos) {
    if (!["S", "N"].includes(grupo.modalidade) || dadosObrigatoriosAusentes(grupo).length > 0 || grupo.mapeamentoAmbiguo) {
      continue;
    }
    const eventosPossiveis = new Map<string, HupDemonstrativoEvento>();
    for (const guia of [grupo.guiaPrestador, grupo.guiaOperadora]) {
      for (const evento of indiceEventos.get(JSON.stringify([guia, grupo.codigoTuss])) ?? []) {
        eventosPossiveis.set(evento.id, evento);
      }
    }
    const elegiveis = [...eventosPossiveis.values()]
      .map((evento) => eventoCombinaGrupo(grupo, evento))
      .filter((evento): evento is EventoElegivel => evento !== null);
    elegiveisPorGrupo.set(grupo.ordem, elegiveis);
    for (const elegivel of elegiveis) {
      const ids = gruposPorEvento.get(elegivel.evento.id) ?? new Set<number>();
      ids.add(grupo.ordem);
      gruposPorEvento.set(elegivel.evento.id, ids);
    }
  }

  const arquivosPorAssinatura = new Map<string, Set<string>>();
  for (const evento of eventosDemonstrativo) {
    const assinatura = eventoAssinatura(evento);
    const arquivos = arquivosPorAssinatura.get(assinatura) ?? new Set<string>();
    arquivos.add(text(evento.arquivoId));
    arquivosPorAssinatura.set(assinatura, arquivos);
  }
  const duplicadoEntreArquivos = (evento: HupDemonstrativoEvento) =>
    (arquivosPorAssinatura.get(eventoAssinatura(evento))?.size ?? 0) > 1;

  const items: HupConciliacaoItem[] = grupos.map((grupo) => {
    const base = itemBase(grupo);
    const faltando = dadosObrigatoriosAusentes(grupo);
    if (grupo.modalidade === "N") {
      return {
        ...base,
        status: "medico_direto",
        motivo: "Recebimento via hospital marcado como N; item de médico direto, sem pendência hospitalar.",
        numeroCandidatos: 0,
        valorPagoCandidato: null,
        valorGlosaCandidata: null,
        diferencaEstimada: null,
        candidatos: [],
      };
    }
    if (faltando.length > 0) {
      return {
        ...base,
        status: "dados_incompletos",
        motivo: `Dados obrigatórios ausentes: ${faltando.join(", ")}.`,
        numeroCandidatos: 0,
        valorPagoCandidato: null,
        valorGlosaCandidata: null,
        diferencaEstimada: null,
        candidatos: [],
      };
    }
    if (grupo.mapeamentoAmbiguo) {
      return {
        ...base,
        status: "ambiguo",
        motivo: "Conflito entre mapeamentos manuais de nome e código do convênio; nenhuma associação foi concluída.",
        numeroCandidatos: 0,
        valorPagoCandidato: null,
        valorGlosaCandidata: null,
        diferencaEstimada: null,
        candidatos: [],
      };
    }

    const elegiveis = elegiveisPorGrupo.get(grupo.ordem) ?? [];
    const eventos = elegiveis.map(({ evento }) => evento);
    const candidatos = elegiveis.slice(0, 5).map(({ evento }) => candidato(evento));
    if (eventos.length === 0) {
      return {
        ...base,
        status: "sem_candidato",
        motivo: "Nenhum candidato no demonstrativo; isto não indica glosa nem pagamento.",
        numeroCandidatos: 0,
        valorPagoCandidato: null,
        valorGlosaCandidata: null,
        diferencaEstimada: null,
        candidatos,
      };
    }

    const eventoCompartilhado = eventos.some((evento) => (gruposPorEvento.get(evento.id)?.size ?? 0) > 1);
    const eventoDuplicado = eventos.some(duplicadoEntreArquivos);
    if (eventos.length !== 1 || eventoCompartilhado || eventoDuplicado) {
      const motivo = eventoDuplicado
        ? "Há eventos repetidos entre arquivos de demonstrativo; nenhuma associação foi concluída."
        : eventoCompartilhado
          ? "Um mesmo evento é elegível para mais de um grupo; nenhuma associação foi concluída."
          : "Há mais de um evento candidato; nenhuma associação foi concluída.";
      return {
        ...base,
        status: "ambiguo",
        motivo,
        numeroCandidatos: eventos.length,
        valorPagoCandidato: null,
        valorGlosaCandidata: null,
        diferencaEstimada: null,
        candidatos,
      };
    }

    const unico = eventos[0]!;
    const semProvaDeData = elegiveis[0]?.dataSemProva ?? false;
    const valorPago = unico.valorPago == null ? null : decimal(unico.valorPago);
    const valorGlosa = unico.valorGlosa == null ? null : decimal(unico.valorGlosa);
    return {
      ...base,
      status: "candidato",
      motivo: valorPago == null || valorGlosa == null
        ? "Candidato por guia e código, mas há valor de pagamento ou glosa não informado. Nenhuma diferença foi calculada nem associação concluída."
        : semProvaDeData
        ? "Candidato único por guia e código; a data do item está ausente em uma das fontes, sem prova de item. Associação não concluída."
        : "Candidato único por guia, código e data. Associação não concluída.",
      numeroCandidatos: 1,
      valorPagoCandidato: valorPago == null ? null : formatoDecimalExato(valorPago),
      valorGlosaCandidata: valorGlosa == null ? null : formatoDecimalExato(valorGlosa),
      diferencaEstimada: valorPago == null || valorGlosa == null ? null : formatoDecimalExato(grupo.valorFaturado.minus(valorPago).minus(valorGlosa)),
      candidatos,
    };
  });

  let valorFaturadoHospital = new ExactDecimal(0);
  let valorFaturadoMedicoDireto = new ExactDecimal(0);
  for (const grupo of grupos) {
    if (grupo.modalidade === "S") valorFaturadoHospital = valorFaturadoHospital.plus(grupo.valorFaturado);
    if (grupo.modalidade === "N") valorFaturadoMedicoDireto = valorFaturadoMedicoDireto.plus(grupo.valorFaturado);
  }

  const resumo: HupConciliacaoResumo = {
    totalItens: itensSnapshot.length,
    totalGrupos: items.length,
    totalEventos: eventosDemonstrativo.length,
    valorFaturadoHospital: formatoDecimalExato(valorFaturadoHospital),
    valorFaturadoMedicoDireto: formatoDecimalExato(valorFaturadoMedicoDireto),
    // Cada evento é agregado uma única vez nesta lista, nunca via grupos candidatos.
    valorPagoDemonstrativo: eventosDemonstrativo.length && eventosDemonstrativo.every(e=>e.valorPago==null) ? null : formatoDecimalExato(eventosDemonstrativo.reduce((total, evento) => evento.valorPago == null ? total : total.plus(decimal(evento.valorPago)), new ExactDecimal(0))),
    valorGlosaDemonstrativo: eventosDemonstrativo.length && eventosDemonstrativo.every(e=>e.valorGlosa==null) ? null : formatoDecimalExato(eventosDemonstrativo.reduce((total, evento) => evento.valorGlosa == null ? total : total.plus(decimal(evento.valorGlosa)), new ExactDecimal(0))),
    eventosSemValorPago: eventosDemonstrativo.filter(e=>e.valorPago==null).length,
    eventosSemValorGlosa: eventosDemonstrativo.filter(e=>e.valorGlosa==null).length,
    gruposCandidatos: items.filter((item) => item.status === "candidato").length,
    gruposAmbiguos: items.filter((item) => item.status === "ambiguo").length,
    gruposSemCandidato: items.filter((item) => item.status === "sem_candidato").length,
    gruposDadosIncompletos: items.filter((item) => item.status === "dados_incompletos").length,
    gruposMedicoDireto: items.filter((item) => item.status === "medico_direto").length,
  };

  return { items, resumo };
}
