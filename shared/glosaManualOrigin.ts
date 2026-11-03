/** Âncora de idempotência, não um documento físico nem um formato de importação. */
export const GLOSA_MANUAL_ORIGIN_PREFIX = "manual-glosa:v1:";
export const GLOSA_MANUAL_ORIGIN_LABEL = "Lançamento manual";
export const GLOSA_MANUAL_NO_ORIGINAL_MESSAGE = "Registro manual não possui arquivo original.";

/** A guarda backend usa o nome interno persistido, nunca uma flag fornecida pelo cliente. */
export function isGlosaManualOriginName(nome: unknown): boolean {
  return typeof nome === "string" && nome.startsWith(GLOSA_MANUAL_ORIGIN_PREFIX);
}

/** A UI também reconhece o DTO sanitizado, que não expõe hashes da âncora. */
export function isGlosaManualOrigin(arquivo: {
  nome?: unknown;
  origemManual?: unknown;
} | null | undefined): boolean {
  return arquivo?.origemManual === true || isGlosaManualOriginName(arquivo?.nome);
}
