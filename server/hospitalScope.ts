import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { estabelecimentos, permissoesEstabelecimento } from "../drizzle/schema";
import { getDb, verificarPermissaoEstabelecimento } from "./db";

export const ESTABELECIMENTO_CENTRAL_SAFATLE = 2160001;
export type UsuarioHospital = { id: number; role: string };
export type HospitalAcao = "visualizar" | "editar" | "excluir" | "gerenciar";
const camposPermissao = {
  visualizar: "podeVisualizar",
  editar: "podeEditar",
  excluir: "podeExcluir",
  gerenciar: "podeGerenciar",
} as const;

function exigirUsuario(usuario: UsuarioHospital): void {
  if (!usuario || !Number.isSafeInteger(usuario.id) || usuario.id <= 0) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário autenticado obrigatório." });
  }
}
function exigirIdHospital(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0 || id === ESTABELECIMENTO_CENTRAL_SAFATLE) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o hospital de origem da conta." });
  }
}

/** Central authorization grants entry to the workspace, not access to other hospitals. */
export async function exigirAcessoFabrica(usuario: UsuarioHospital): Promise<void> {
  exigirUsuario(usuario);
  if (!await verificarPermissaoEstabelecimento(usuario.id, ESTABELECIMENTO_CENTRAL_SAFATLE, "visualizar")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à central SAFATLE." });
  }
}

/** The persisted owner, never a client-supplied central ID, governs write authorization. */
export async function exigirHospitalProprietario(
  usuario: UsuarioHospital,
  hospitalId: number,
  acao: HospitalAcao = "visualizar",
): Promise<void> {
  exigirUsuario(usuario);
  exigirIdHospital(hospitalId);
  if (!await verificarPermissaoEstabelecimento(usuario.id, hospitalId, acao)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta operação no hospital de origem." });
  }
}

/** Pure permission selection, useful for testing without business records. */
export function filtrarHospitaisPorPermissoes(
  usuario: UsuarioHospital,
  hospitais: readonly { id: number }[],
  permissoes: readonly Record<string, unknown>[],
  acao: HospitalAcao,
): number[] {
  exigirUsuario(usuario);
  const ids = hospitais.map(item => item.id).filter(id => Number.isSafeInteger(id) && id > 0 && id !== ESTABELECIMENTO_CENTRAL_SAFATLE);
  const permitidos = usuario.role === "admin" ? ids : ids.filter(id => permissoes.some(p =>
    Number(p.userId) === usuario.id && Number(p.estabelecimentoId) === id && p[camposPermissao[acao]] === "sim",
  ));
  return [...new Set(permitidos)].sort((a, b) => a - b);
}

/** All central reads receive a finite, server-derived list; an empty list fails closed. */
export async function resolverHospitaisAutorizados(
  usuario: UsuarioHospital,
  hospitalId?: number | null,
  acao: HospitalAcao = "visualizar",
): Promise<number[]> {
  exigirUsuario(usuario);
  const central = hospitalId == null || hospitalId === ESTABELECIMENTO_CENTRAL_SAFATLE;
  if (central) await exigirAcessoFabrica(usuario);
  else await exigirHospitalProprietario(usuario, hospitalId, acao);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível validar o escopo de hospitais." });
  const hospitais = await db.select({ id: estabelecimentos.id }).from(estabelecimentos).where(
    central ? eq(estabelecimentos.ativo, "sim") : and(eq(estabelecimentos.ativo, "sim"), eq(estabelecimentos.id, hospitalId!)),
  );
  const permissoes = usuario.role === "admin" ? [] : await db.select().from(permissoesEstabelecimento).where(eq(permissoesEstabelecimento.userId, usuario.id));
  const ids = filtrarHospitaisPorPermissoes(usuario, hospitais, permissoes, acao);
  if (!ids.length) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum hospital autorizado para esta operação." });
  return ids;
}

/** Validate every persisted owner before the caller performs its first mutation. */
export async function autorizarLoteHospitalar(
  usuario: UsuarioHospital,
  recursos: readonly { hospitalEstabelecimentoId: number }[],
  acao: HospitalAcao,
): Promise<void> {
  exigirUsuario(usuario);
  if (!recursos.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos uma conta válida." });
  for (const id of [...new Set(recursos.map(item => item.hospitalEstabelecimentoId))]) {
    await exigirHospitalProprietario(usuario, id, acao);
  }
}
