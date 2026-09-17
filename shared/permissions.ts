export const MODULE_PERMISSION_KEYS = [
  "acessoDashboard",
  "acessoArquivos",
  "acessoComparacoes",
  "acessoFaturamento",
  "acessoTabelasPreco",
  "acessoAnaliseGlosa",
  "acessoDicionarioGlosas",
  "acessoRecursosGlosa",
  "acessoConvenios",
  "acessoRegrasNegocio",
  "acessoProdutividade",
  "acessoEstabelecimentos",
  "acessoPermissoes",
  "acessoImportacaoTasy",
  "acessoContasFaturadas",
  "acessoRelatoriosTasy",
  "acessoRelatoriosBi",
  "acessoConciliacaoContasPagas",
  "acessoRecebimentosXml",
  "acessoRecebimentosExcel",
  "acessoDemonstrativo",
  "acessoContaConvenio",
  "acessoRecursos",
  "acessoAtendimentos",
  "acessoAtendimentosFaturar",
  "acessoRelFaturadoRecebido",
  "acessoRelRecebimentoGeral",
  "acessoRelFaturamento",
  "acessoRelAtendimentos",
  "acessoRelCustos",
  "acessoRelNaoRecebidos",
  "acessoRelPrevisaoGlosa",
  "acessoRelatoriosGlosasBi",
  "acessoFaturamentoExterno",
  "acessoPainelExecutivo",
  "acessoVisaoGeral",
  "acessoFinanceiro",
  "acessoContratos",
  "acessoPropostas",
  "acessoAtendimentosConsolidados",
  "acessoNfseConsolidado",
] as const;

export type ModulePermissionKey = (typeof MODULE_PERMISSION_KEYS)[number];
export type PermissionValue = "sim" | "nao";
export type StandardServiceGroup =
  | "administrador"
  | "faturista"
  | "recurso_glosa"
  | "gestor"
  | "visualizador"
  | "usuario_tasy";

export const ACTIVE_BI_PERMISSION_KEYS = [
  "acessoRelFaturadoRecebido",
  "acessoRelFaturamento",
  "acessoFaturamentoExterno",
  "acessoRelatoriosGlosasBi",
  "acessoRelAtendimentos",
  "acessoRelCustos",
] as const satisfies readonly ModulePermissionKey[];

const PROFILE_MODULES: Record<StandardServiceGroup, readonly ModulePermissionKey[]> = {
  administrador: MODULE_PERMISSION_KEYS,
  faturista: [
    "acessoDashboard", "acessoArquivos", "acessoComparacoes", "acessoFaturamento",
    "acessoTabelasPreco", "acessoConvenios", "acessoRegrasNegocio", "acessoRecebimentosXml",
    "acessoRecebimentosExcel", "acessoDemonstrativo", "acessoContaConvenio",
    "acessoConciliacaoContasPagas", "acessoRelatoriosBi", "acessoRelFaturadoRecebido",
    "acessoRelFaturamento", "acessoFaturamentoExterno", "acessoRelatoriosGlosasBi",
  ],
  recurso_glosa: [
    "acessoDashboard", "acessoAnaliseGlosa", "acessoDicionarioGlosas", "acessoRecursosGlosa",
    "acessoDemonstrativo", "acessoRecursos", "acessoRelatoriosBi", "acessoRelatoriosGlosasBi",
  ],
  gestor: [
    "acessoDashboard", "acessoArquivos", "acessoComparacoes", "acessoFaturamento",
    "acessoAnaliseGlosa", "acessoRecursosGlosa", "acessoConvenios", "acessoProdutividade",
    "acessoRecebimentosXml", "acessoRecebimentosExcel", "acessoDemonstrativo",
    "acessoContaConvenio", "acessoRecursos", "acessoAtendimentos", "acessoAtendimentosFaturar",
    "acessoConciliacaoContasPagas", "acessoRelatoriosBi", "acessoRelFaturadoRecebido",
    "acessoRelFaturamento", "acessoFaturamentoExterno", "acessoRelatoriosGlosasBi",
    "acessoRelAtendimentos", "acessoRelCustos", "acessoPermissoes",
  ],
  visualizador: ["acessoDashboard"],
  usuario_tasy: [
    "acessoDashboard", "acessoImportacaoTasy", "acessoContasFaturadas", "acessoRelatoriosTasy",
    "acessoConciliacaoContasPagas", "acessoRelatoriosBi", "acessoRelFaturadoRecebido",
    "acessoRelFaturamento", "acessoFaturamentoExterno", "acessoRelatoriosGlosasBi",
    "acessoRelAtendimentos", "acessoRelCustos",
  ],
};

export const ACTION_PROFILE_DEFAULTS: Record<StandardServiceGroup, {
  podeVisualizar: PermissionValue;
  podeEditar: PermissionValue;
  podeExcluir: PermissionValue;
  podeGerenciar: PermissionValue;
}> = {
  administrador: { podeVisualizar: "sim", podeEditar: "sim", podeExcluir: "sim", podeGerenciar: "sim" },
  faturista: { podeVisualizar: "sim", podeEditar: "sim", podeExcluir: "nao", podeGerenciar: "nao" },
  recurso_glosa: { podeVisualizar: "sim", podeEditar: "sim", podeExcluir: "nao", podeGerenciar: "nao" },
  gestor: { podeVisualizar: "sim", podeEditar: "sim", podeExcluir: "nao", podeGerenciar: "sim" },
  visualizador: { podeVisualizar: "sim", podeEditar: "nao", podeExcluir: "nao", podeGerenciar: "nao" },
  usuario_tasy: { podeVisualizar: "sim", podeEditar: "sim", podeExcluir: "nao", podeGerenciar: "nao" },
};

export function getModulePermissionsForGroup(group: StandardServiceGroup): Record<ModulePermissionKey, PermissionValue> {
  const enabled = new Set(PROFILE_MODULES[group] || PROFILE_MODULES.visualizador);
  return Object.fromEntries(
    MODULE_PERMISSION_KEYS.map((key) => [key, enabled.has(key) ? "sim" : "nao"]),
  ) as Record<ModulePermissionKey, PermissionValue>;
}

export function normalizeBiParent<T extends Partial<Record<ModulePermissionKey, PermissionValue>>>(permissions: T): T & { acessoRelatoriosBi: PermissionValue } {
  const hasAnyBiReport = ACTIVE_BI_PERMISSION_KEYS.some((key) => permissions[key] === "sim");
  return {
    ...permissions,
    acessoRelatoriosBi: hasAnyBiReport ? "sim" : "nao",
  };
}

export function sanitizeCustomModulePermissions(input: unknown): Record<ModulePermissionKey, PermissionValue> {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const sanitized = Object.fromEntries(
    MODULE_PERMISSION_KEYS.map((key) => [key, source[key] === "sim" ? "sim" : "nao"]),
  ) as Record<ModulePermissionKey, PermissionValue>;
  return normalizeBiParent(sanitized);
}
