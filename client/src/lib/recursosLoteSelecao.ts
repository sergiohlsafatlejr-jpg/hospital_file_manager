export const FONTES_RECURSO_LOTE = [
  "demonstrativo",
  "conciliacao",
] as const;

export type FonteRecursoLote = (typeof FONTES_RECURSO_LOTE)[number];

export interface ContextoSelecaoRecursosLote {
  estabelecimentoId: number | null | undefined;
  convenioId: number | null | undefined;
  filtroDataPagamento: string | null | undefined;
}

export interface RecursoLoteSelecionavel {
  id: unknown;
  fonte: unknown;
  guiaNumero?: unknown;
}

/**
 * O snapshot deliberadamente não carrega valores financeiros. Ele representa
 * apenas a identidade dos itens que o usuário viu e confirmou naquele escopo.
 */
export interface ItemSnapshotRecursoLote {
  id: number;
  fonte: FonteRecursoLote;
  guiaNumero: string | null;
}

export interface SnapshotCriacaoLote {
  contexto: {
    estabelecimentoId: number;
    convenioId: number;
    filtroDataPagamento: string;
  };
  convenioNome: string;
  itens: readonly ItemSnapshotRecursoLote[];
}

type CodigoFalhaSelecaoLote =
  | "CONTEXTO_INVALIDO"
  | "LISTA_DE_ORIGEM_INDISPONIVEL"
  | "NENHUM_ITEM"
  | "FONTE_DESCONHECIDA"
  | "ITEM_FORA_DO_ESCOPO"
  | "CONTEXTO_ALTERADO";

export type ResultadoSnapshotLote =
  | { valido: true; snapshot: SnapshotCriacaoLote }
  | { valido: false; codigo: CodigoFalhaSelecaoLote };

export type ResultadoValidacaoSnapshotLote =
  | { valido: true; itens: readonly ItemSnapshotRecursoLote[] }
  | { valido: false; codigo: CodigoFalhaSelecaoLote };

export function fonteRecursoLoteValida(
  fonte: unknown,
): fonte is FonteRecursoLote {
  return typeof fonte === "string" && (FONTES_RECURSO_LOTE as readonly string[]).includes(fonte);
}

/**
 * IDs das duas fontes não compartilham namespace. A chave sempre inclui a
 * fonte para que demonstrativo 42 e conciliação 42 sejam itens distintos.
 */
export function chaveRecursoLote(item: Pick<RecursoLoteSelecionavel, "id" | "fonte">): string | null {
  if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0) return null;
  if (!fonteRecursoLoteValida(item.fonte)) return null;
  return `${item.fonte}:${item.id}`;
}

export function normalizarContextoSelecaoLote(
  contexto: ContextoSelecaoRecursosLote,
): SnapshotCriacaoLote["contexto"] | null {
  if (!Number.isSafeInteger(contexto.estabelecimentoId) || (contexto.estabelecimentoId as number) <= 0) {
    return null;
  }
  if (!Number.isSafeInteger(contexto.convenioId) || (contexto.convenioId as number) <= 0) {
    return null;
  }

  return {
    estabelecimentoId: contexto.estabelecimentoId as number,
    convenioId: contexto.convenioId as number,
    filtroDataPagamento: contexto.filtroDataPagamento ?? "",
  };
}

export function contextosSelecaoLoteIguais(
  primeiro: ContextoSelecaoRecursosLote,
  segundo: ContextoSelecaoRecursosLote,
): boolean {
  const contextoPrimeiro = normalizarContextoSelecaoLote(primeiro);
  const contextoSegundo = normalizarContextoSelecaoLote(segundo);

  return !!contextoPrimeiro
    && !!contextoSegundo
    && contextoPrimeiro.estabelecimentoId === contextoSegundo.estabelecimentoId
    && contextoPrimeiro.convenioId === contextoSegundo.convenioId
    && contextoPrimeiro.filtroDataPagamento === contextoSegundo.filtroDataPagamento;
}

function criarItensSnapshot(
  itens: readonly RecursoLoteSelecionavel[] | undefined,
): { valido: true; itens: readonly ItemSnapshotRecursoLote[] } | { valido: false; codigo: CodigoFalhaSelecaoLote } {
  if (!itens) return { valido: false, codigo: "LISTA_DE_ORIGEM_INDISPONIVEL" };
  if (itens.length === 0) return { valido: false, codigo: "NENHUM_ITEM" };

  const itensPorChave = new Map<string, ItemSnapshotRecursoLote>();
  for (const item of itens) {
    if (!fonteRecursoLoteValida(item.fonte)) {
      return { valido: false, codigo: "FONTE_DESCONHECIDA" };
    }

    const chave = chaveRecursoLote(item);
    if (!chave) return { valido: false, codigo: "ITEM_FORA_DO_ESCOPO" };

    itensPorChave.set(chave, {
      id: item.id as number,
      fonte: item.fonte,
      guiaNumero: typeof item.guiaNumero === "string" && item.guiaNumero.trim()
        ? item.guiaNumero
        : null,
    });
  }

  const itensNormalizados = [...itensPorChave.values()];
  return itensNormalizados.length > 0
    ? { valido: true, itens: itensNormalizados }
    : { valido: false, codigo: "NENHUM_ITEM" };
}

/**
 * Cria um snapshot exclusivamente da lista recebida. Não há fallback para
 * lista global, dados de outro convênio nem para itens carregados anteriormente.
 */
export function criarSnapshotLote(params: {
  contexto: ContextoSelecaoRecursosLote;
  convenioNome: string;
  itens: readonly RecursoLoteSelecionavel[] | undefined;
}): ResultadoSnapshotLote {
  const contexto = normalizarContextoSelecaoLote(params.contexto);
  if (!contexto) return { valido: false, codigo: "CONTEXTO_INVALIDO" };

  const resultadoItens = criarItensSnapshot(params.itens);
  if (!resultadoItens.valido) return resultadoItens;

  return {
    valido: true,
    snapshot: {
      contexto,
      convenioNome: params.convenioNome,
      itens: resultadoItens.itens,
    },
  };
}

/**
 * Deriva o snapshot da seleção manual e confirma que cada chave selecionada
 * pertence à lista explicitamente exibida para o escopo atual.
 */
export function criarSnapshotDaSelecaoLote(params: {
  contexto: ContextoSelecaoRecursosLote;
  convenioNome: string;
  itensDisponiveis: readonly RecursoLoteSelecionavel[] | undefined;
  chavesSelecionadas: ReadonlySet<string>;
}): ResultadoSnapshotLote {
  if (!params.itensDisponiveis) {
    return { valido: false, codigo: "LISTA_DE_ORIGEM_INDISPONIVEL" };
  }
  if (params.chavesSelecionadas.size === 0) {
    return { valido: false, codigo: "NENHUM_ITEM" };
  }

  const itensPorChave = new Map<string, RecursoLoteSelecionavel>();
  for (const item of params.itensDisponiveis) {
    if (!fonteRecursoLoteValida(item.fonte)) continue;
    const chave = chaveRecursoLote(item);
    if (chave) itensPorChave.set(chave, item);
  }

  const itensSelecionados: RecursoLoteSelecionavel[] = [];
  for (const chave of params.chavesSelecionadas) {
    const item = itensPorChave.get(chave);
    if (!item) return { valido: false, codigo: "ITEM_FORA_DO_ESCOPO" };
    itensSelecionados.push(item);
  }

  return criarSnapshotLote({
    contexto: params.contexto,
    convenioNome: params.convenioNome,
    itens: itensSelecionados,
  });
}

export function validarSnapshotParaCriacaoLote(
  snapshot: SnapshotCriacaoLote | null | undefined,
  contextoAtual: ContextoSelecaoRecursosLote,
): ResultadoValidacaoSnapshotLote {
  if (!snapshot) return { valido: false, codigo: "NENHUM_ITEM" };
  if (!contextosSelecaoLoteIguais(snapshot.contexto, contextoAtual)) {
    return { valido: false, codigo: "CONTEXTO_ALTERADO" };
  }

  const resultadoItens = criarItensSnapshot(snapshot.itens);
  if (!resultadoItens.valido) return resultadoItens;
  return { valido: true, itens: resultadoItens.itens };
}

export interface ItensLotePorFonte {
  demonstrativoIds: number[];
  conciliacaoIds: number[];
}

export function separarItensLotePorFonte(
  itens: readonly ItemSnapshotRecursoLote[],
): ItensLotePorFonte {
  const demonstrativoIds: number[] = [];
  const conciliacaoIds: number[] = [];

  for (const item of itens) {
    if (item.fonte === "demonstrativo") demonstrativoIds.push(item.id);
    if (item.fonte === "conciliacao") conciliacaoIds.push(item.id);
  }

  return { demonstrativoIds, conciliacaoIds };
}

export function agruparItensLotePorGuia(
  itens: readonly ItemSnapshotRecursoLote[],
): Map<string, readonly ItemSnapshotRecursoLote[]> {
  const grupos = new Map<string, ItemSnapshotRecursoLote[]>();
  for (const item of itens) {
    const guia = item.guiaNumero || "sem_guia";
    const grupo = grupos.get(guia) || [];
    grupo.push(item);
    grupos.set(guia, grupo);
  }
  return grupos;
}
