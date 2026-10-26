export type StatusLoteRecurso =
  | "rascunho"
  | "pendente_envio"
  | "enviado"
  | "em_analise"
  | "respondido"
  | "finalizado"
  | string
  | null
  | undefined;

export interface LoteParaConfirmacaoManual {
  status?: StatusLoteRecurso;
}

export interface ConfirmacaoEnvioManualInput {
  dataEnvio: string;
  protocoloEnvio: string;
}

export type ResultadoValidacaoConfirmacao =
  | { valido: true; dataEnvio: string; protocoloEnvio: string; erros: [] }
  | {
      valido: false;
      dataEnvio?: undefined;
      protocoloEnvio?: undefined;
      erros: string[];
    };

export interface CamposFinanceirosRecurso {
  fonte?: string | null;
  valorPagoOriginal?: number | string | null;
  dataPagamentoOriginal?: string | Date | null;
  valorRecebidoRecurso?: number | string | null;
  dataRecebimentoRecurso?: string | Date | null;
  valorAcatado?: number | string | null;
  /** Alias legado: representa recebimento do recurso, nunca o pagamento original. */
  valorRecebido?: number | string | null;
  /** Alias legado: representa a data de recebimento do recurso, nunca a data de pagamento original. */
  dataPagamento?: string | Date | null;
}

export interface CamposFinanceirosNormalizados {
  valorPagoOriginal: number | string | null;
  dataPagamentoOriginal: string | Date | null;
  valorRecebidoRecurso: number | string | null;
  dataRecebimentoRecurso: string | Date | null;
  valorAcatado: number | string | null;
}

export function podeConfirmarEnvioManual(
  lote: LoteParaConfirmacaoManual | undefined
): boolean {
  return lote?.status === "rascunho" || lote?.status === "pendente_envio";
}

function isDataIsoValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const date = new Date(`${data}T12:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === data
  );
}

export function validarConfirmacaoEnvioManual(
  input: ConfirmacaoEnvioManualInput
): ResultadoValidacaoConfirmacao {
  const dataEnvio = input.dataEnvio.trim();
  const protocoloEnvio = input.protocoloEnvio.trim();
  const erros: string[] = [];

  if (!isDataIsoValida(dataEnvio)) {
    erros.push("Informe uma data de envio válida.");
  }
  if (!protocoloEnvio) {
    erros.push("Informe o protocolo de envio.");
  }

  if (erros.length > 0) return { valido: false, erros };
  return { valido: true, dataEnvio, protocoloEnvio, erros: [] };
}

/**
 * Mantém os nomes financeiros explícitos na UI. Os aliases antigos só podem
 * preencher o recebimento do recurso; nunca são usados para inferir o
 * pagamento original, que permanece desconhecido como null.
 */
export function normalizarCamposFinanceirosRecurso(
  item: CamposFinanceirosRecurso
): CamposFinanceirosNormalizados {
  return {
    valorPagoOriginal: item.valorPagoOriginal ?? null,
    dataPagamentoOriginal: item.dataPagamentoOriginal ?? null,
    valorRecebidoRecurso:
      item.valorRecebidoRecurso ?? item.valorRecebido ?? null,
    dataRecebimentoRecurso:
      item.dataRecebimentoRecurso ?? item.dataPagamento ?? null,
    valorAcatado: item.valorAcatado ?? null,
  };
}

export function isFonteComRecebimentoRecursoInformado(
  fonte: string | null | undefined
): boolean {
  return fonte === "recursos_glosa" || fonte === "antigo" || fonte === "manual";
}

export function rotuloRecebimentoRecurso(
  item: CamposFinanceirosRecurso
): string {
  return isFonteComRecebimentoRecursoInformado(item.fonte)
    ? "Recebimento do recurso (informado)"
    : "Sem recebimento de recurso registrado";
}

export interface ContextoUnidade {
  estabelecimentoId: number | null | undefined;
  versao: number;
}

export function contextoUnidadeAindaAtual(
  contextoInicial: ContextoUnidade | null | undefined,
  contextoAtual: ContextoUnidade
): boolean {
  return Boolean(
    contextoInicial &&
      contextoInicial.estabelecimentoId !== null &&
      contextoInicial.estabelecimentoId === contextoAtual.estabelecimentoId &&
      contextoInicial.versao === contextoAtual.versao
  );
}
