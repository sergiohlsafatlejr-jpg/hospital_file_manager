export interface RecursoGlosaDetailRow {
  id: number;
  codigoGlosa?: string | null;
  motivoGlosa?: string | null;
}

export interface MotivoGlosaOption {
  value: string;
  label: string;
  codigoGlosa: string | null;
  motivoGlosa: string | null;
}

export interface DemonstrativoScopeInput {
  estabelecimentoId: number;
  competencias: string[];
  datasPagto: string[];
  convenioId?: number;
}

const normalizarTexto = (valor: string | null | undefined) => {
  const texto = valor?.trim();
  return texto ? texto : null;
};

/** [] é o contrato explícito de "todas" as opções para a API de demonstrativo. */
export function normalizarSelecao(valores: string[]): string[] {
  return [...new Set(valores.map((valor) => valor.trim()).filter(Boolean))];
}

export function criarEscopoDemonstrativo({
  estabelecimentoId,
  competencias,
  datasPagto,
  convenioId,
}: DemonstrativoScopeInput): string {
  return JSON.stringify({
    estabelecimentoId,
    competencias: normalizarSelecao(competencias).sort(),
    datasPagto: normalizarSelecao(datasPagto).sort(),
    convenioId: convenioId ?? null,
  });
}

export function escopoMudou(escopoAtivo: string | null, proximoEscopo: string): boolean {
  return escopoAtivo !== proximoEscopo;
}

export function reconciliarSelecao(valoresSelecionados: string[], valoresDisponiveis: string[]): string[] {
  const disponiveis = new Set(valoresDisponiveis);
  return normalizarSelecao(valoresSelecionados).filter((valor) => disponiveis.has(valor));
}

export function mesmaSelecao(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((valor, indice) => valor === b[indice]);
}

/**
 * A chave inclui código e texto. Assim, um mesmo código com descrições distintas
 * nunca é condensado silenciosamente; ausência de código/texto também é uma opção.
 */
export function chaveMotivoGlosa(row: Pick<RecursoGlosaDetailRow, "codigoGlosa" | "motivoGlosa">): string {
  return JSON.stringify([normalizarTexto(row.codigoGlosa), normalizarTexto(row.motivoGlosa)]);
}

export function derivarOpcoesMotivoGlosa(rows: RecursoGlosaDetailRow[]): MotivoGlosaOption[] {
  const options = new Map<string, MotivoGlosaOption>();

  for (const row of rows) {
    const codigoGlosa = normalizarTexto(row.codigoGlosa);
    const motivoGlosa = normalizarTexto(row.motivoGlosa);
    const value = chaveMotivoGlosa({ codigoGlosa, motivoGlosa });

    if (!options.has(value)) {
      options.set(value, {
        value,
        // O travessão sinaliza ausência do dado, sem atribuir descrição ao motivo.
        label: `${codigoGlosa ?? "—"} · ${motivoGlosa ?? "—"}`,
        codigoGlosa,
        motivoGlosa,
      });
    }
  }

  return [...options.values()];
}

export function filtrarDetalhePorMotivos<T extends RecursoGlosaDetailRow>(
  rows: T[],
  motivosSelecionados: string[],
): T[] {
  if (motivosSelecionados.length === 0) return rows;
  const selecionados = new Set(motivosSelecionados);
  return rows.filter((row) => selecionados.has(chaveMotivoGlosa(row)));
}

/** Mantém inclusive o ID 0 em fixtures e remove apenas IDs ausentes/duplicados. */
export function idsRecebimentosVisiveis(rows: Array<Pick<RecursoGlosaDetailRow, "id">>): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (Number.isFinite(row.id)) ids.add(row.id);
  }
  return [...ids];
}
