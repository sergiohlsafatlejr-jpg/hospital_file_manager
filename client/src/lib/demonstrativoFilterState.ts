type FilterOption = {
  value: string;
};

export function resolveCompetenciaDisponivel(
  competenciaAtual: string,
  inicializada: boolean,
  competencias: FilterOption[] | undefined,
): string {
  if (!competencias) return competenciaAtual;
  if (competenciaAtual === "all") return competenciaAtual;
  if (competencias.length === 0) return "all";

  const competenciaValida = competencias.some((item) => item.value === competenciaAtual);
  if (!inicializada || !competenciaAtual || !competenciaValida) {
    return competencias[0].value;
  }

  return competenciaAtual;
}

export function resolveFiltroOpcionalDisponivel(
  valorAtual: string,
  opcoes: FilterOption[] | undefined,
): string {
  if (!opcoes || !valorAtual || valorAtual === "all") return valorAtual;
  return opcoes.some((item) => item.value === valorAtual) ? valorAtual : "all";
}
