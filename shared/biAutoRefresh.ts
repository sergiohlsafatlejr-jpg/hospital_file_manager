/**
 * Política híbrida padronizada de atualização automática para o módulo de Relatórios BI.
 * Combina:
 * 1) Verificação automática a cada 1 minuto enquanto a aba está visível (com opção de pausar).
 * 2) Gatilho imediato pós-processamento de arquivos/importações em background.
 * 3) Atualização ao abrir a tela, focar a janela ou reconectar à rede.
 */

export const BI_AUTO_REFRESH_INTERVAL_MS = 60_000 as const;
export const BI_PROCESSING_POLL_ACTIVE_MS = 3_000 as const;
export const BI_PROCESSING_POLL_IDLE_MS = 15_000 as const;

export function getBiAutoRefreshQueryOptions(autoRefreshAtivo = true) {
  return {
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always" as const,
    refetchInterval: autoRefreshAtivo ? BI_AUTO_REFRESH_INTERVAL_MS : (false as const),
    refetchIntervalInBackground: false,
  };
}

export function formatBiLastUpdated(dataUpdatedAt?: number): string | null {
  if (!dataUpdatedAt || dataUpdatedAt <= 0) return null;
  return new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Invalida todas as consultas de relatórios BI após importações (XML, Excel, PDF) ou sincronizações.
 */
export function invalidateAllBiQueries(utils: Record<string, any>): void {
  if (!utils) return;
  try {
    utils.faturadoRecebidoUnificado?.dados?.invalidate?.();
    utils.relatoriosGlosasBi?.painelExecutivo?.invalidate?.();
    utils.relatoriosGlosasBi?.filtros?.invalidate?.();
    utils.warleineFaturamento?.faturadoRecebido?.invalidate?.();
    utils.warleineFaturamento?.glosasBi?.invalidate?.();
    utils.warleineFaturamento?.filtrosGlosas?.invalidate?.();
    utils.relatorioFaturamento?.buscar?.invalidate?.();
    utils.relatorioFaturamento?.listarConvenios?.invalidate?.();
    utils.comparativoMesAMes?.getDados?.invalidate?.();
    utils.relatorioLaboratorio?.dados?.invalidate?.();
    utils.relatorioUltrassom?.dados?.invalidate?.();
    utils.relatorioVisita?.dados?.invalidate?.();
    utils.relatorioVisitaXml?.dados?.invalidate?.();
    utils.relatorioOxUti?.dados?.invalidate?.();
    utils.relatorioOxUtiFaturado?.dados?.invalidate?.();
    utils.resumoPacienteOxUti?.faturado?.invalidate?.();
    utils.resumoPacienteOxUti?.recebido?.invalidate?.();
    utils.relatorioFisioterapia?.getDados?.invalidate?.();
    utils.previsaoPagamentosImec?.dados?.invalidate?.();
    utils.atendimentosBi?.painel?.invalidate?.();
  } catch {
    // Ignora falhas silenciosamente caso algum router não esteja montado no mock/contexto
  }
}
