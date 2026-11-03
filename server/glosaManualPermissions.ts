import { TRPCError } from "@trpc/server";
import { getConvenioById, verificarPermissaoEstabelecimento } from "./db";

/** A mesma conexão injetada deve atender ambas as leituras deste pré-check. */
export type GlosaManualPermissionConnection = Parameters<typeof verificarPermissaoEstabelecimento>[3];

/** Pré-check: hospital explícito com editar e convênio ativo global (NULL) ou próprio.
 * O serviço revalida usuário, hospital, editar, módulos e convênio sob locks antes da escrita.
 */
export async function exigirPermissaoGlosaManual(
  userId: number,
  estabelecimentoId: number,
  convenioId: number,
  connection?: GlosaManualPermissionConnection,
) {
  if (![userId, estabelecimentoId, convenioId].every(id => Number.isInteger(id) && id > 0 && id <= 2_147_483_647)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário, hospital e convênio positivos são obrigatórios" });
  }

  const permitido = connection === undefined
    ? await verificarPermissaoEstabelecimento(userId, estabelecimentoId, "editar")
    : await verificarPermissaoEstabelecimento(userId, estabelecimentoId, "editar", connection);
  if (!permitido) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão de escrita no hospital selecionado" });
  }

  const convenio = connection === undefined
    ? await getConvenioById(convenioId)
    : await getConvenioById(convenioId, connection);
  if (!convenio || convenio.id !== convenioId || convenio.ativo !== "sim" ||
      (convenio.estabelecimentoId !== null && convenio.estabelecimentoId !== estabelecimentoId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Selecione um convênio ativo global ou pertencente ao hospital" });
  }
  return convenio;
}
