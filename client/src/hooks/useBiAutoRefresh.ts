import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  BI_PROCESSING_POLL_ACTIVE_MS,
  BI_PROCESSING_POLL_IDLE_MS,
  getBiAutoRefreshQueryOptions,
} from "@shared/biAutoRefresh";

export interface UseBiAutoRefreshParams {
  estabelecimentoId?: number | null;
  enabled?: boolean;
  onRefresh?: () => Promise<unknown> | void;
  onRefetch?: () => Promise<unknown> | void;
  monitorarProcessamento?: boolean;
  defaultAtivo?: boolean;
}

export function useBiAutoRefresh({
  estabelecimentoId,
  enabled = true,
  onRefresh,
  onRefetch,
  monitorarProcessamento = true,
  defaultAtivo = true,
}: UseBiAutoRefreshParams) {
  const [autoRefreshAtivo, setAutoRefreshAtivo] = useState<boolean>(defaultAtivo);
  const [observouProcessamento, setObservouProcessamento] = useState(false);
  const estabId = estabelecimentoId ?? 0;

  useEffect(() => {
    setObservouProcessamento(false);
  }, [estabId]);

  const processamentoQuery = trpc.arquivos.processando.useQuery(
    { estabelecimentoId: estabId },
    {
      enabled: enabled && estabId > 0 && monitorarProcessamento && autoRefreshAtivo,
      refetchInterval: (state) =>
        state.state.data?.length ? BI_PROCESSING_POLL_ACTIVE_MS : BI_PROCESSING_POLL_IDLE_MS,
      refetchIntervalInBackground: true,
    }
  );

  const arquivosEmProcessamento = processamentoQuery.data?.length || 0;

  useEffect(() => {
    if (!enabled || !monitorarProcessamento || !autoRefreshAtivo) return;
    if (arquivosEmProcessamento > 0) {
      setObservouProcessamento(true);
      return;
    }
    if (observouProcessamento) {
      setObservouProcessamento(false);
      const callback = onRefresh ?? onRefetch;
      void Promise.resolve(callback?.()).then(() => {
        toast.success("Importações concluídas e relatório atualizado.");
      });
    }
  }, [
    arquivosEmProcessamento,
    observouProcessamento,
    enabled,
    monitorarProcessamento,
    autoRefreshAtivo,
    onRefresh,
    onRefetch,
  ]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshAtivo((atual) => !atual);
  }, []);

  const queryOptions = useMemo(
    () => getBiAutoRefreshQueryOptions(autoRefreshAtivo),
    [autoRefreshAtivo]
  );

  return {
    autoRefreshAtivo,
    setAutoRefreshAtivo,
    toggleAutoRefresh,
    arquivosEmProcessamento,
    queryOptions,
  };
}
