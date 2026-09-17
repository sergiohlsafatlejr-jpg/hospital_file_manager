import { TRPCError } from "@trpc/server";
import {
  getConvenioById,
  getLoteRecursoById,
  getRecursoById,
  verificarPermissaoEstabelecimento,
} from "./db";

export type PermissaoRecurso = "visualizar" | "editar" | "excluir" | "gerenciar";

export async function exigirAcessoEstabelecimento(
  userId: number,
  estabelecimentoId: number | null | undefined,
  permissao: PermissaoRecurso = "visualizar",
) {
  if (!estabelecimentoId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selecione um estabelecimento para acessar os recursos de glosa",
    });
  }

  const permitido = await verificarPermissaoEstabelecimento(userId, estabelecimentoId, permissao);
  if (!permitido) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sem permissão para acessar os recursos deste estabelecimento",
    });
  }
}

export async function exigirAcessoRecurso(
  userId: number,
  recursoId: number,
  permissao: PermissaoRecurso = "visualizar",
) {
  const recurso = await getRecursoById(recursoId);
  if (!recurso) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Recurso não encontrado" });
  }

  if (!recurso.estabelecimentoId) {
    if (recurso.userId !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Recurso legado sem estabelecimento não pode ser acessado por outro usuário",
      });
    }
    return recurso;
  }

  await exigirAcessoEstabelecimento(userId, recurso.estabelecimentoId, permissao);
  return recurso;
}

export async function exigirAcessoLote(
  userId: number,
  loteId: number,
  permissao: PermissaoRecurso = "visualizar",
) {
  const lote = await getLoteRecursoById(loteId);
  if (!lote) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote de recurso não encontrado" });
  }

  await exigirAcessoEstabelecimento(userId, lote.estabelecimentoId, permissao);
  return lote;
}

export async function exigirConvenioDoEstabelecimento(
  userId: number,
  convenioId: number,
  estabelecimentoId: number | null | undefined,
  permissao: PermissaoRecurso = "visualizar",
) {
  await exigirAcessoEstabelecimento(userId, estabelecimentoId, permissao);

  const convenio = await getConvenioById(convenioId);
  if (!convenio) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Convênio não encontrado" });
  }

  if (convenio.estabelecimentoId && convenio.estabelecimentoId !== estabelecimentoId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "O convênio informado não pertence ao estabelecimento selecionado",
    });
  }

  return convenio;
}
