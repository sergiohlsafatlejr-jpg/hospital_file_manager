import { TRPCError } from "@trpc/server";

const STAGINGS_EXISTENTES = new Set([
  "stagion_atendimentos_parados_urologico",
  "stagion_faturado_recebido_urologico",
  "stagion_atendimentos_parados_iad",
  "stagion_faturado_recebido_iad",
]);

function marcador(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).marker
      : null;
  } catch {
    return null;
  }
}

/** Cadastro não é autorização de escrita. Nem um bit de liberação adulterado
 * torna o importador de destinos novos compatível com os contratos Hop.
 * A adoção de um escritor de staging exige um adaptador e procedimento próprios.
 */
export function exigirDestinoEasyLocalExecutavel(
  nome: unknown,
  ...descricoes: unknown[]
): void {
  if (
    (typeof nome === "string" && STAGINGS_EXISTENTES.has(nome.toLowerCase())) ||
    descricoes.some(raw => marcador(raw) === "easylocal-staging-v1")
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Vínculo de staging preparado, sem carga ou horário liberado. Valide o contrato de chave, os tipos e a exclusividade do escritor antes da ativação.",
    });
  }
}
