const RH_AUDIT_ONLY_KEY = "__rhPermissionAuditOnly";
const RH_STATE_ACTIONS = new Set(["criar_permissao", "alterar_permissao", "remover_permissao"]);

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** O log genérico conserva a auditoria, mas não é uma nova escrita de estado RH. */
export function markRhPermissionAuditOnly(action: string, values: unknown): unknown {
  if (!RH_STATE_ACTIONS.has(action)) return values;
  const object = jsonObject(values);
  return {
    ...(object ?? { valorOriginal: values ?? null }),
    [RH_AUDIT_ONLY_KEY]: true,
  };
}

/** Logs legados e eventos transacionais continuam elegíveis; descrições nunca vencem. */
export function isRhPermissionAuditOnly(values: unknown): boolean {
  return jsonObject(values)?.[RH_AUDIT_ONLY_KEY] === true;
}
