export interface LoteParaExportacao {
  convenioId?: number | string | null;
  convenioNome?: string | null;
  protocoloEnvio?: string | null;
  status?: string | null;
}

export function isLoteUnimed(lote: LoteParaExportacao): boolean {
  const descricao = `${lote.convenioNome || ""} ${lote.protocoloEnvio || ""}`.toLowerCase();
  return Number(lote.convenioId) === 1 || descricao.includes("unimed");
}

/**
 * Mantido temporariamente para consumidores legados. A geração ou o novo
 * download de um arquivo nunca confirma o envio externo do lote.
 */
export function deveMarcarLoteComoEnviado(_lote: LoteParaExportacao | undefined): boolean {
  return false;
}
