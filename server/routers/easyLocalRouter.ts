import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  testarConexaoEasyLocal,
  testarConexaoComConfig,
} from "../easyLocalConnection";
import { easyLocalCadastroInput } from "../../shared/easyLocalCadastro";
import {
  obterEasyLocalCadastro,
  salvarEasyLocalCadastro,
  resolverEasyLocalConfig,
  prepararEasyLocalRascunho,
} from "../easyLocalCadastroStore";

/** Cadastro central: exclusivo de administradores, sem ativação de importações. */
export const easyLocalRouter = router({
  obterPreparacao: adminProcedure
    .input(z.object({}).strict())
    .query(async () => ({
      configuracaoDisponivel: (await resolverEasyLocalConfig()) !== null,
      piloto: { estabelecimentoId: 1260036, nome: "Hospital Urológico" },
      ingestaoAtiva: false as const,
    })),
  obterCadastro: adminProcedure
    .input(z.object({}).strict())
    .query(() => obterEasyLocalCadastro()),
  salvarCadastro: adminProcedure
    .input(easyLocalCadastroInput)
    .mutation(({ input, ctx }) => salvarEasyLocalCadastro(input, ctx.user.id)),
  testarRascunho: adminProcedure
    .input(easyLocalCadastroInput)
    .mutation(async ({ input }) => {
      try {
        return await testarConexaoComConfig(
          await prepararEasyLocalRascunho(input)
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível testar o cadastro EASYLocal.",
        });
      }
    }),
  testarConexao: adminProcedure
    .input(z.object({}).strict())
    .mutation(() => testarConexaoEasyLocal()),
});
