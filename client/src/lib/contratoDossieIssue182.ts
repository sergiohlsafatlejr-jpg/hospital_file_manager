// Guardas locais do dossiê; não calculam preços nem autorizam persistência.
export const DOSSIE_STALE_TIME = 60_000;
export const MAX_GLOSAS_DOSSIE = 200;

export interface ConsultaDossieSegura {
  data?: { contratoId: number };
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isStale?: boolean;
  isPlaceholderData?: boolean;
  dataUpdatedAt?: number;
}

export function consultaDossiePronta(query: ConsultaDossieSegura, contratoId: number | null) {
  return Boolean(contratoId && query.data?.contratoId === contratoId &&
    !query.isLoading && !query.isFetching && !query.isError &&
    !query.isStale && !query.isPlaceholderData);
}

export function cacheDossiePronto(state: {
  status: string;
  fetchStatus: string;
  isInvalidated: boolean;
  dataUpdatedAt: number;
  data?: unknown;
} | undefined, data: unknown, agora = Date.now()) {
  return Boolean(state && state.data === data && state.status === "success" &&
    state.fetchStatus === "idle" && !state.isInvalidated &&
    agora - state.dataUpdatedAt < DOSSIE_STALE_TIME);
}

export function mensagemResultadoIA(resultado: {
  geradoComIA: boolean;
  salvo: boolean;
  motivo: "sem_texto" | "ia_indisponivel" | null;
}) {
  const leitura = resultado.geradoComIA
    ? "Dossiê contratual enriquecido com IA."
    : resultado.motivo === "sem_texto"
      ? "Sem texto contratual útil: dossiê-base retornado, sem enriquecimento com IA."
      : "IA indisponível: dossiê-base retornado, sem enriquecimento com IA.";
  return { sucesso: resultado.geradoComIA && resultado.salvo,
    texto: `${leitura} ${resultado.salvo ? "Salvamento confirmado." : "Não houve salvamento."}` };
}

// Um clique tardio não reutiliza seleção de outra consulta, mesmo antes dos effects.
export function criarGuardaDossie() {
  let escopo = "";
  let identidade = 0;
  let base: unknown;
  let atualizadaEm = 0;
  let ativa = true;
  return {
    atualizar(novoEscopo: string, novaBase: unknown, timestamp: number, pronta: boolean) {
      if (novoEscopo !== escopo || base !== novaBase || atualizadaEm !== timestamp || !pronta) {
        identidade++;
        escopo = novoEscopo;
        base = pronta ? novaBase : undefined;
        atualizadaEm = timestamp;
      }
      return identidade;
    },
    invalidar() { identidade++; base = undefined; },
    identidade: () => identidade,
    atual: (id: number) => ativa && id === identidade,
    ativar() { ativa = true; },
    desativar() { ativa = false; identidade++; },
  };
}

// O bloqueio sobrevive ao fechamento/remount; só a promessa originária o libera.
const processando = new Set<number>();
const ouvintes = new Set<() => void>();
function notificar() { ouvintes.forEach(ouvinte => ouvinte()); }
export const assinarProcessamentoDossie = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
};
export const contratoDossieProcessando = (contratoId: number | null) =>
  Boolean(contratoId && processando.has(contratoId));
export function iniciarProcessamentoDossie(contratoId: number) {
  if (processando.has(contratoId)) return null;
  processando.add(contratoId);
  notificar();
  let concluido = false;
  return () => {
    if (concluido) return;
    concluido = true;
    processando.delete(contratoId);
    notificar();
  };
}

// Resumos por guia/item/motivo podem conter MAX(dataExecucao), não uma execução
// única. Sem informação autoritativa por item, a query aceita referência omitida.
export const AVISO_CONTEXTO_INDETERMINADO =
  "Base contratual indeterminada: o resumo não informa uma data de execução única e autoritativa. Não aplicar preços ou cláusulas atuais como se fossem vigentes no atendimento. Consulte os itens reais para fundamentação temporal.";
