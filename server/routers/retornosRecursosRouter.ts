import { protectedProcedure, router } from "../_core/trpc";
import {
  retornoAnexoSchema,
  retornoArquivoSchema,
  retornoDetalheSchema,
  retornoEstornoSchema,
  retornoImportarSchema,
  retornoListarSchema,
  retornoPagamentoSchema,
  retornoPreviaSchema,
  retornoRebuscarSchema,
  retornoRevisarSchema,
} from "../../shared/retornosRecursos";
import {
  retornosAnexarProtocolo,
  retornosArquivo,
  retornosDetalhe,
  retornosEstornarPagamento,
  retornosImportar,
  retornosListar,
  retornosPrever,
  retornosRebuscar,
  retornosRegistrarPagamento,
  retornosRevisar,
} from "../retornosRecursosService";

/**
 * Contrato tRPC para respostas de recursos CASSI.
 * A validação de acesso hospitalar, módulo e operação é reforçada pelo service.
 */
export const retornosRecursosRouter = router({
  prever: protectedProcedure
    .input(retornoPreviaSchema)
    .mutation(({ ctx, input }) => retornosPrever(input, ctx.user.id)),

  importar: protectedProcedure
    .input(retornoImportarSchema)
    .mutation(({ ctx, input }) => retornosImportar(input, ctx.user.id)),

  listar: protectedProcedure
    .input(retornoListarSchema)
    .query(({ ctx, input }) => retornosListar(input, ctx.user.id)),

  detalhe: protectedProcedure
    .input(retornoDetalheSchema)
    .query(({ ctx, input }) => retornosDetalhe(input, ctx.user.id)),

  rebuscar: protectedProcedure
    .input(retornoRebuscarSchema)
    .mutation(({ ctx, input }) => retornosRebuscar(input, ctx.user.id)),

  revisar: protectedProcedure
    .input(retornoRevisarSchema)
    .mutation(({ ctx, input }) => retornosRevisar(input, ctx.user.id)),

  anexarProtocolo: protectedProcedure
    .input(retornoAnexoSchema)
    .mutation(({ ctx, input }) => retornosAnexarProtocolo(input, ctx.user.id)),

  arquivo: protectedProcedure
    .input(retornoArquivoSchema)
    .mutation(({ ctx, input }) => retornosArquivo(input, ctx.user.id)),

  registrarPagamento: protectedProcedure
    .input(retornoPagamentoSchema)
    .mutation(({ ctx, input }) => retornosRegistrarPagamento(input, ctx.user.id)),

  estornarPagamento: protectedProcedure
    .input(retornoEstornoSchema)
    .mutation(({ ctx, input }) => retornosEstornarPagamento(input, ctx.user.id)),
});
