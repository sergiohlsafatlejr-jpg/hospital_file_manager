import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  easyLocalCriarTabela,
  easyLocalEstabelecimento,
  easyLocalLeitura,
  easyLocalOrigem,
} from "../../shared/easyLocalIntegrador";
import {
  criarEasyLocalTabela,
  listarEasyLocalTabelas,
  listarEasyLocalLeituras,
  salvarEasyLocalLeitura,
} from "../easyLocalIntegradorService";
import {
  detectarEasyLocalCampos,
  listarEasyLocalOrigens,
} from "../easyLocalMetadata";
import {
  preverEasyLocalImportacao,
  executarEasyLocalImportacao,
} from "../easyLocalImportacaoService";
import { getDb } from "../db";
import { estabelecimentos } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const unidade = z
  .object({ estabelecimentoId: easyLocalEstabelecimento })
  .strict();
async function verificarUnidade(id: number) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Catálogo indisponível.",
    });
  const rows = await db
    .select({ id: estabelecimentos.id })
    .from(estabelecimentos)
    .where(eq(estabelecimentos.id, id))
    .limit(1);
  if (rows.length !== 1)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Estabelecimento não encontrado.",
    });
}
async function operacao<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Operação não confirmada. Confira a configuração e o catálogo antes de repetir.",
    });
  }
}
export const easyLocalIntegradorRouter = router({
  listarTabelas: adminProcedure
    .input(unidade)
    .query(({ input }) =>
      operacao(() => listarEasyLocalTabelas(input.estabelecimentoId))
    ),
  criarTabela: adminProcedure
    .input(easyLocalCriarTabela)
    .mutation(({ input, ctx }) =>
      operacao(() => criarEasyLocalTabela(input, ctx.user.id))
    ),
  listarOrigens: adminProcedure.input(unidade).query(({ input }) =>
    operacao(async () => {
      await verificarUnidade(input.estabelecimentoId);
      return listarEasyLocalOrigens();
    })
  ),
  detectarCampos: adminProcedure
    .input(unidade.extend({ origem: easyLocalOrigem }).strict())
    .mutation(({ input }) =>
      operacao(async () => {
        await verificarUnidade(input.estabelecimentoId);
        return detectarEasyLocalCampos(input.origem);
      })
    ),
  listarLeituras: adminProcedure
    .input(unidade)
    .query(({ input }) =>
      operacao(() => listarEasyLocalLeituras(input.estabelecimentoId))
    ),
  salvarLeitura: adminProcedure
    .input(easyLocalLeitura)
    .mutation(({ input, ctx }) =>
      operacao(() => salvarEasyLocalLeitura(input, ctx.user.id))
    ),
  preverImportacao: adminProcedure
    .input(unidade.extend({ leituraId: z.number().int().positive() }).strict())
    .mutation(({ input, ctx }) =>
      operacao(() => preverEasyLocalImportacao(input, ctx.user.id))
    ),
  executarImportacao: adminProcedure
    .input(
      unidade
        .extend({
          leituraId: z.number().int().positive(),
          confirmarImportacao: z.literal(true),
          tokenPrevia: z.string().min(1).max(8192),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      operacao(() => executarEasyLocalImportacao(input, ctx.user.id))
    ),
});
