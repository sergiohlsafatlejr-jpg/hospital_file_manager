/** Atualiza somente a consulta da tela; não agenda importações nem escreve no banco. */
export const ATENDIMENTOS_BI_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
} as const;
