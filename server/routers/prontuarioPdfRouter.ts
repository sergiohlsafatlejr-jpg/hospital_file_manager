import { reportProcedure, router } from "../_core/trpc";
import {
  prontuarioPdfInativarSchema,
  prontuarioPdfListarSchema,
} from "../../shared/prontuarioPdf";
import {
  prontuarioPdfInativar,
  prontuarioPdfListar,
} from "../prontuarioPdfService";

/**
 * Contratos tRPC públicos de anexos de prontuário. O upload é exclusivamente
 * multipart autenticado em POST /api/prontuario-pdf/upload; nenhum DTO tRPC
 * aceita conteúdo de arquivo, Base64, URL, hash ou chave de storage.
 */
export const prontuarioPdfRouter = router({
  listar: reportProcedure("contaConvenio")
    .input(prontuarioPdfListarSchema)
    .query(({ ctx, input }) => prontuarioPdfListar(input, ctx.user.id)),

  inativar: reportProcedure("contaConvenio")
    .input(prontuarioPdfInativarSchema)
    .mutation(({ ctx, input }) => prontuarioPdfInativar(input, ctx.user.id)),
});
