import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { finClientes, finEmpresas, finRecebiveis, finTransacoes } from "../drizzle/schema";
import { getDb, verificarPermissaoEstabelecimento } from "./db";

/** O estabelecimento solicitado é obrigatório mesmo para administradores; a autorização não substitui o filtro SQL. */
export async function exigirUnidadeFinanceira(userId: number, estabelecimentoId: number, acao: "visualizar" | "editar" | "excluir" = "visualizar") {
  if (!Number.isSafeInteger(estabelecimentoId) || estabelecimentoId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Estabelecimento obrigatório" });
  }
  if (!await verificarPermissaoEstabelecimento(userId, estabelecimentoId, acao)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso ao estabelecimento" });
  }
}

/** Subquery de escopo que ignora empresas órfãs e evita misturar registros de unidades. */
export const recebivelDaUnidade = (estabelecimentoId: number): SQL =>
  sql`${finRecebiveis.empresaId} IN (SELECT ${finEmpresas.id} FROM ${finEmpresas} WHERE ${finEmpresas.estabelecimentoId} = ${estabelecimentoId})`;
export const clienteDaUnidade = (estabelecimentoId: number): SQL =>
  sql`${finClientes.empresaId} IN (SELECT ${finEmpresas.id} FROM ${finEmpresas} WHERE ${finEmpresas.estabelecimentoId} = ${estabelecimentoId})`;
export const transacaoDaUnidade = (estabelecimentoId: number): SQL =>
  sql`${finTransacoes.empresaId} IN (SELECT ${finEmpresas.id} FROM ${finEmpresas} WHERE ${finEmpresas.estabelecimentoId} = ${estabelecimentoId})`;

export async function exigirEmpresaDaUnidade(empresaId: number, estabelecimentoId: number) {
  const db = await getDb();
  if (!db || !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
    !(await db.select({ id: finEmpresas.id }).from(finEmpresas).where(and(eq(finEmpresas.id, empresaId), eq(finEmpresas.estabelecimentoId, estabelecimentoId))).limit(1)).length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Empresa financeira não vinculada ao estabelecimento" });
  }
}

export async function exigirClienteDaEmpresa(clienteId: number, empresaId: number) {
  const db = await getDb();
  if (!db || !Number.isSafeInteger(clienteId) || clienteId <= 0 || !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
    !(await db.select({ id: finClientes.id }).from(finClientes).where(and(
      eq(finClientes.id, clienteId),
      or(
        eq(finClientes.empresaId, empresaId),
        sql`${finClientes.empresaId} IN (SELECT e2.id FROM ${finEmpresas} e1 INNER JOIN ${finEmpresas} e2 ON e1.estabelecimentoId = e2.estabelecimentoId WHERE e1.id = ${empresaId})`
      )
    )).limit(1)).length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cliente não vinculado à empresa financeira" });
  }
}

export async function exigirRecebiveisDaUnidade(ids: number[], estabelecimentoId: number) {
  const unicos = [...new Set(ids)];
  if (!unicos.length || unicos.length !== ids.length || unicos.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "IDs de recebíveis inválidos" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const registros = await db.select({ id: finRecebiveis.id, empresaId: finRecebiveis.empresaId })
    .from(finRecebiveis).where(and(inArray(finRecebiveis.id, unicos), recebivelDaUnidade(estabelecimentoId)));
  if (registros.length !== unicos.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Recebível não pertence ao estabelecimento" });
  }
  return registros;
}

export async function exigirTransacoesDaUnidade(ids: number[], estabelecimentoId: number) {
  const unicos = [...new Set(ids)];
  if (!unicos.length || unicos.length !== ids.length || unicos.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "IDs de despesas inválidos" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const registros = await db.select({ id: finTransacoes.id, empresaId: finTransacoes.empresaId })
    .from(finTransacoes).where(and(inArray(finTransacoes.id, unicos), transacaoDaUnidade(estabelecimentoId)));
  if (registros.length !== unicos.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Despesa não pertence ao estabelecimento" });
  }
  return registros;
}
