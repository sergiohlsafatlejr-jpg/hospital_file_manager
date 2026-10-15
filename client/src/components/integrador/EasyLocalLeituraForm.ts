export type EasyLocalOrigemSelecionada = {
  schema: string;
  tabela: string;
};

export type EasyLocalLeituraParaReuso = {
  origem: EasyLocalOrigemSelecionada;
  colunaEstabelecimento: string;
  valorEstabelecimento: string;
};

export type ContextoDeteccaoEasyLocal = {
  estabelecimentoId: number;
  origem: EasyLocalOrigemSelecionada;
};

export function chaveOrigemEasyLocal(
  origem: EasyLocalOrigemSelecionada
): string {
  return `${origem.schema}.${origem.tabela}`;
}

export function mesmaOrigemEasyLocal(
  esquerda: EasyLocalOrigemSelecionada | null | undefined,
  direita: EasyLocalOrigemSelecionada | null | undefined
): boolean {
  return Boolean(
    esquerda &&
      direita &&
      esquerda.schema === direita.schema &&
      esquerda.tabela === direita.tabela
  );
}

/**
 * A lista recebida já é limitada pelo estabelecimento no procedimento do
 * servidor. Mesmo nesse escopo, o valor só pode ser reaproveitado para o par
 * exato origem + coluna; nunca para outra origem ou outro campo.
 */
export function valorVinculoPersistido(
  leiturasDaUnidade: EasyLocalLeituraParaReuso[],
  origem: EasyLocalOrigemSelecionada,
  colunaEstabelecimento: string
): string {
  const valores = new Set(
    leiturasDaUnidade
      .filter(
        leitura =>
          mesmaOrigemEasyLocal(leitura.origem, origem) &&
          leitura.colunaEstabelecimento === colunaEstabelecimento
      )
      .map(leitura => leitura.valorEstabelecimento.trim())
      .filter(Boolean)
  );
  return valores.size === 1 ? [...valores][0]! : "";
}

/** Uma resposta de metadados só é aplicável ao contexto que a solicitou. */
export function contextoDeteccaoAindaAtual(
  solicitado: ContextoDeteccaoEasyLocal,
  atual: ContextoDeteccaoEasyLocal | null
): boolean {
  return Boolean(
    atual &&
      solicitado.estabelecimentoId === atual.estabelecimentoId &&
      mesmaOrigemEasyLocal(solicitado.origem, atual.origem)
  );
}

/** Só sugere o campo de vínculo para a correspondência exata documentada. */
export function colunaEstabelecimentoDetectada(
  campos: Array<{ nome: string }>
): string {
  return campos.some(campo => campo.nome === "estabelecimentos_id")
    ? "estabelecimentos_id"
    : "";
}
