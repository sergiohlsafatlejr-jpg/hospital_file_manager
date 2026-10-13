import { z } from "zod";
import { router, reportProcedure } from "../_core/trpc";
import { compararHupPiloto, guiasHupPiloto, itensGuiaHupPiloto, opcoesHupPiloto } from "../hupConciliacaoPilotoService";
import { HUP_CONCILIACAO_STATUS } from "../hupConciliacaoPilotoCompare";
const leitura = reportProcedure("conciliacaoContasPagas");
const unidade = z.number().int().positive();
const competencia = z.string().regex(/^(19|20|21|22)\d{2}\/(0[1-9]|1[0-2])$/);
const filtros = {
  estabelecimentoId: unidade,
  competencia,
  convenioId: z.number().int().positive(),
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  busca: z.string().trim().max(100).optional(),
  mesPagamento: z.string().regex(/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/).optional(),
};
export const hupConciliacaoPilotoRouter = router({
  opcoes: leitura.input(z.object({ estabelecimentoId: unidade })).query(({ input }) => opcoesHupPiloto(input.estabelecimentoId)),
  comparar: leitura.input(z.object({
    ...filtros,
    status: z.enum(["todos", ...HUP_CONCILIACAO_STATUS]).default("todos"),
  })).query(({ input }) => compararHupPiloto(input)),
  guias: leitura.input(z.object({
    ...filtros,
    pageSize: z.number().int().min(1).max(50).default(50),
    status: z.enum(["todos", "misto", ...HUP_CONCILIACAO_STATUS]).default("todos"),
  })).query(({ input }) => guiasHupPiloto(input)),
  itensGuia: leitura.input(z.object({
    estabelecimentoId: unidade,
    competencia,
    convenioId: z.number().int().positive(),
    mesPagamento: z.string().regex(/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/).optional(),
    guiaChave: z.string().regex(/^guia-\d+$/),
    conta: z.string().max(250),
    guiaPrestador: z.string().max(250),
    guiaOperadora: z.string().max(250),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })).query(({ input }) => itensGuiaHupPiloto(input)),
});
