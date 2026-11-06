import { safeParseDate } from "./dateUtils";

export const PRAZO_VENCIMENTO_GUIA_DIAS = 25;
export const ALERTA_PREVENTIVO_GUIA_DIAS = 20;
export const PRAZO_FATURAMENTO_SAFATLE_HORAS = 60;
export const ALERTA_PREVENTIVO_FATURAMENTO_HORAS = 48;

export interface ContaFabricaPrazoInput {
  dataEntrada?: string | Date | null;
  dataAlta?: string | Date | null;
  dataRecebimentoSafatle?: string | Date | null;
  entradaSetorAtualEm?: string | Date | null;
  horasNoSetorAtual?: number | null;
  horasNaSafatle?: number | null;
  diasDesdeAlta?: number | null;
  setorAtual?: string | null;
  statusSetor?: string | null;
}

export interface AlertaPrazoContaFabrica {
  // 1. Prazo de Vencimento da Guia (25 dias a partir da Data de Alta)
  possuiDataAlta: boolean;
  dataBaseAltaFormatada: string;
  dataVencimentoGuia: Date | null;
  dataVencimentoGuiaFormatada: string;
  diasDesdeAlta: number | null;
  diasRestantesGuia: number | null;
  diasExcedidosGuia: number;
  guiaEntregueConvenio: boolean;
  guiaVencida25Dias: boolean;
  guiaEmAlertaPreventivo: boolean;

  // 2. Tempo Parado no Setor Atual
  horasNoSetor: number;
  diasParadosNoSetor: number;
  tempoParadoSetorFormatado: string;

  // 3. Prazo de Faturamento Safatle (60 horas a partir da chegada na Safatle)
  possuiDataRecebimentoSafatle: boolean;
  dataChegadaSafatle: Date | null;
  dataLimiteFaturamento60h: Date | null;
  dataLimiteFaturamento60hFormatada: string;
  horasDesdeChegadaSafatle: number | null;
  horasRestantesFaturamento60h: number | null;
  horasExcedidasFaturamento60h: number;
  contaPendenteFaturamento: boolean;
  prazoFaturamento60hEstourado: boolean;
  prazoFaturamento60hEmAlerta: boolean;

  // 4. Status Geral de Alerta Crítico (muda a cor da linha igual ao alerta de erro)
  possuiAlertaCriticoPrazo: boolean;
  deveDestacarLinhaComoErro: boolean;
}

function formatarDataCurtaBR(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "-";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraCurtaBR(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "-";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} às ${hora}:${min}`;
}

/**
 * Faz o parse da data de chegada na Safatle preservando o horário quando disponível,
 * ou assumindo 08:00:00 do dia civil quando informada apenas a data (padrão da Recepção Safatle).
 */
export function parseDataChegadaSafatle(
  raw: string | Date | null | undefined
): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    if (
      raw.getUTCHours() === 0 &&
      raw.getUTCMinutes() === 0 &&
      raw.getUTCSeconds() === 0
    ) {
      return new Date(
        raw.getUTCFullYear(),
        raw.getUTCMonth(),
        raw.getUTCDate(),
        8,
        0,
        0
      );
    }
    return raw;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Apenas YYYY-MM-DD ou meia-noite zerada -> 08:00:00 local (mesma regra do backend)
  const matchDateOnlyOrMidnight = str.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/i
  );
  if (matchDateOnlyOrMidnight) {
    const [, y, m, d] = matchDateOnlyOrMidnight;
    return new Date(Number(y), Number(m) - 1, Number(d), 8, 0, 0);
  }

  // Formato YYYY-MM-DD HH:mm:ss ou YYYY-MM-DDTHH:mm:ss sem timezone
  const matchLocalDateTime = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (matchLocalDateTime) {
    const [, y, m, d, hh, mm, ss] = matchLocalDateTime;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || 0)
    );
  }

  return safeParseDate(str);
}

/**
 * Calcula todos os indicadores e alertas de prazo de uma conta na Esteira de Faturamento:
 * 1) Prazo de vencimento da guia: 25 dias a partir da Data de Alta (não pode ficar sem entregar em 25 dias).
 * 2) Alerta de dias parados no setor com destaque visual igual ao alerta de erro.
 * 3) Prazo de faturamento Safatle: 60 horas a partir da chegada na Safatle para a conta ser feita.
 */
export function calcularAlertasPrazoContaFabrica(
  conta: ContaFabricaPrazoInput,
  agora: Date = new Date()
): AlertaPrazoContaFabrica {
  const setorAtual = String(conta.setorAtual || "faturamento");
  const statusSetor = String(conta.statusSetor || "fila");

  const guiaEntregueConvenio =
    setorAtual === "enviado_convenio" ||
    setorAtual === "recursos" ||
    setorAtual === "finalizado";

  // Conta ainda está pendente de ser feita pelo faturamento (na Recepção ou no Setor de Faturamento não concluído)
  const contaPendenteFaturamento =
    (setorAtual === "faturamento" || setorAtual === "recepcao") &&
    statusSetor !== "concluido";

  // -------------------------------------------------------------------------
  // 1. Cálculo do Tempo Parado no Setor Atual
  // -------------------------------------------------------------------------
  let horasNoSetor = Math.max(0, Number(conta.horasNoSetorAtual) || 0);
  if (horasNoSetor === 0 && conta.entradaSetorAtualEm) {
    const dEntradaSetor = safeParseDate(conta.entradaSetorAtualEm);
    if (dEntradaSetor) {
      horasNoSetor = Math.max(
        0,
        Math.floor((agora.getTime() - dEntradaSetor.getTime()) / 3600000)
      );
    }
  }
  const diasParadosNoSetor = Math.floor(horasNoSetor / 24);
  const horasRestoSetor = horasNoSetor % 24;
  const tempoParadoSetorFormatado =
    diasParadosNoSetor > 0
      ? `${diasParadosNoSetor}d ${horasRestoSetor}h (${horasNoSetor}h)`
      : `${horasNoSetor}h`;

  // -------------------------------------------------------------------------
  // 2. Cálculo do Prazo de Vencimento da Guia (25 dias a partir da Data Alta)
  // -------------------------------------------------------------------------
  const dataAltaDate = safeParseDate(conta.dataAlta);
  const possuiDataAlta = Boolean(dataAltaDate);

  let dataVencimentoGuia: Date | null = null;
  let diasDesdeAlta: number | null = null;
  let diasRestantesGuia: number | null = null;
  let diasExcedidosGuia = 0;

  if (dataAltaDate) {
    const inicioAltaMeioDia = new Date(
      dataAltaDate.getFullYear(),
      dataAltaDate.getMonth(),
      dataAltaDate.getDate(),
      12,
      0,
      0
    );
    const agoraMeioDia = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
      12,
      0,
      0
    );

    dataVencimentoGuia = new Date(inicioAltaMeioDia.getTime());
    dataVencimentoGuia.setDate(
      dataVencimentoGuia.getDate() + PRAZO_VENCIMENTO_GUIA_DIAS
    );

    diasDesdeAlta = Math.max(
      0,
      Math.round((agoraMeioDia.getTime() - inicioAltaMeioDia.getTime()) / 86400000)
    );
    diasRestantesGuia = PRAZO_VENCIMENTO_GUIA_DIAS - diasDesdeAlta;
    diasExcedidosGuia = Math.max(0, diasDesdeAlta - PRAZO_VENCIMENTO_GUIA_DIAS);
  }

  const guiaVencida25Dias =
    !guiaEntregueConvenio &&
    diasDesdeAlta !== null &&
    diasDesdeAlta >= PRAZO_VENCIMENTO_GUIA_DIAS;

  const guiaEmAlertaPreventivo =
    !guiaEntregueConvenio &&
    !guiaVencida25Dias &&
    diasDesdeAlta !== null &&
    diasDesdeAlta >= ALERTA_PREVENTIVO_GUIA_DIAS;

  // -------------------------------------------------------------------------
  // 3. Cálculo do Prazo de Faturamento (60 horas da chegada na Safatle)
  // -------------------------------------------------------------------------
  const dataChegadaSafatle = parseDataChegadaSafatle(conta.dataRecebimentoSafatle);
  const possuiDataRecebimentoSafatle = Boolean(dataChegadaSafatle);

  let dataLimiteFaturamento60h: Date | null = null;
  let horasDesdeChegadaSafatle: number | null = null;
  let horasRestantesFaturamento60h: number | null = null;
  let horasExcedidasFaturamento60h = 0;

  if (dataChegadaSafatle) {
    dataLimiteFaturamento60h = new Date(
      dataChegadaSafatle.getTime() + PRAZO_FATURAMENTO_SAFATLE_HORAS * 3600000
    );

    const diffHoras = Math.max(
      0,
      Math.floor((agora.getTime() - dataChegadaSafatle.getTime()) / 3600000)
    );
    horasDesdeChegadaSafatle =
      typeof conta.horasNaSafatle === "number" && conta.horasNaSafatle > diffHoras
        ? conta.horasNaSafatle
        : diffHoras;

    horasRestantesFaturamento60h =
      PRAZO_FATURAMENTO_SAFATLE_HORAS - horasDesdeChegadaSafatle;
    horasExcedidasFaturamento60h = Math.max(
      0,
      horasDesdeChegadaSafatle - PRAZO_FATURAMENTO_SAFATLE_HORAS
    );
  }

  const prazoFaturamento60hEstourado =
    contaPendenteFaturamento &&
    horasDesdeChegadaSafatle !== null &&
    horasDesdeChegadaSafatle > PRAZO_FATURAMENTO_SAFATLE_HORAS;

  const prazoFaturamento60hEmAlerta =
    contaPendenteFaturamento &&
    !prazoFaturamento60hEstourado &&
    horasDesdeChegadaSafatle !== null &&
    horasDesdeChegadaSafatle >= ALERTA_PREVENTIVO_FATURAMENTO_HORAS;

  const possuiAlertaCriticoPrazo =
    guiaVencida25Dias || prazoFaturamento60hEstourado;

  const deveDestacarLinhaComoErro =
    statusSetor === "devolvido_erro" || possuiAlertaCriticoPrazo;

  return {
    possuiDataAlta,
    dataBaseAltaFormatada: formatarDataCurtaBR(dataAltaDate),
    dataVencimentoGuia,
    dataVencimentoGuiaFormatada: formatarDataCurtaBR(dataVencimentoGuia),
    diasDesdeAlta,
    diasRestantesGuia,
    diasExcedidosGuia,
    guiaEntregueConvenio,
    guiaVencida25Dias,
    guiaEmAlertaPreventivo,

    horasNoSetor,
    diasParadosNoSetor,
    tempoParadoSetorFormatado,

    possuiDataRecebimentoSafatle,
    dataChegadaSafatle,
    dataLimiteFaturamento60h,
    dataLimiteFaturamento60hFormatada: formatarDataHoraCurtaBR(
      dataLimiteFaturamento60h
    ),
    horasDesdeChegadaSafatle,
    horasRestantesFaturamento60h,
    horasExcedidasFaturamento60h,
    contaPendenteFaturamento,
    prazoFaturamento60hEstourado,
    prazoFaturamento60hEmAlerta,

    possuiAlertaCriticoPrazo,
    deveDestacarLinhaComoErro,
  };
}
