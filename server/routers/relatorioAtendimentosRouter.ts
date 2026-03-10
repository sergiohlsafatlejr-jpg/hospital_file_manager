import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buscarAtendimentos,
  buscarOpcoesFiltro,
  sincronizarRelatorioAtendimentos,
  obterStatusSincronizacao,
} from "../relatorioAtendimentos";

export const relatorioAtendimentosRouter = router({
  buscar: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        tipoAtendimento: z.string().optional(),
        codServ: z.string().optional(),
        codPlaco: z.string().optional(),
        codPrest: z.string().optional(),
        codCc: z.string().optional(),
        carater: z.string().optional(),
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      return buscarAtendimentos(input);
    }),

  opcoesFiltro: protectedProcedure.query(async () => {
    return buscarOpcoesFiltro();
  }),

  // Sincronizar dados do Warleine para cache local
  sincronizar: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        estabelecimentoId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return sincronizarRelatorioAtendimentos(
        input.estabelecimentoId,
        input.dataInicio,
        input.dataFim,
        ctx.user.id,
        ctx.user.name || undefined
      );
    }),

  // Obter status da última sincronização
  statusSincronizacao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return obterStatusSincronizacao(input.estabelecimentoId);
    }),
});
