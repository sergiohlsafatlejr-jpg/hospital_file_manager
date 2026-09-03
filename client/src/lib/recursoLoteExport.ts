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

export function deveMarcarLoteComoEnviado(lote: LoteParaExportacao | undefined): boolean {
  return lote?.status === "rascunho" || lote?.status === "pendente_envio";
}
