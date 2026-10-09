// A confirmação de Sergio em 09/10/2026 refere-se à staging Hop HUP.
// A coluna histórica dataAberturaConta preserva o valor bruto: não regravar fatos.
const HUP_ESTABELECIMENTO_ID = 1260036;

export type WarleineItemPresentationSource = {
  origemRegistroId?: unknown;
  dataAberturaConta?: unknown;
  codigoTipoServico?: unknown;
  recebimentoViaHospital?: unknown;
};

export function getWarleineItemPresentation(
  estabelecimentoId: number,
  row: WarleineItemPresentationSource,
) {
  const isHopHup = estabelecimentoId === HUP_ESTABELECIMENTO_ID
    && String(row.origemRegistroId ?? "").startsWith("hop_hup:");
  const dataOrigem = row.dataAberturaConta ? String(row.dataAberturaConta) : null;
  const modalidadeRecebimento = String(row.recebimentoViaHospital ?? "").trim().toUpperCase();
  return {
    dataItem: isHopHup ? dataOrigem : null,
    dataOrigem,
    dataOrigemRotulo: isHopHup ? "Data do item" : "Data de origem (abertura da conta)",
    tipoItemCodigo: String(row.codigoTipoServico ?? ""),
    modalidadeRecebimento,
    modalidadeRecebimentoRotulo: modalidadeRecebimento === "S" ? "Via hospital"
      : modalidadeRecebimento === "N" ? "Médico direto" : "Não informado",
  };
}

// Datas civis não devem passar por conversão de fuso, que pode mudar o dia.
export function formatWarleineItemCivilDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "—";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}
