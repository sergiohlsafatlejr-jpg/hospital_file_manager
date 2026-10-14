/** Os Selects usam "all"; os endpoints esperam ausência de filtro, não NaN. */
export function filtroNumericoOpcional(value: string): number | undefined {
  if (!value || value === "all") return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}
