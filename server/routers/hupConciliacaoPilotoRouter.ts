import { z } from "zod";
import { router, reportProcedure } from "../_core/trpc";
import { compararHupPiloto, opcoesHupPiloto } from "../hupConciliacaoPilotoService";
import { HUP_CONCILIACAO_STATUS } from "../hupConciliacaoPilotoCompare";
const leitura = reportProcedure("conciliacaoContasPagas");
const unidade = z.number().int().positive();
const competencia = z.string().regex(/^(19|20|21|22)\d{2}\/(0[1-9]|1[0-2])$/);
export const hupConciliacaoPilotoRouter = router({
  opcoes: leitura.input(z.object({estabelecimentoId:unidade})).query(({input})=>opcoesHupPiloto(input.estabelecimentoId)),
  comparar: leitura.input(z.object({
    estabelecimentoId:unidade,competencia,convenioId:z.number().int().positive(),
    page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(50),
    status:z.enum(["todos",...HUP_CONCILIACAO_STATUS]).default("todos"),
    busca:z.string().trim().max(100).optional(),
    mesPagamento:z.string().regex(/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/).optional(),
  })).query(({input})=>compararHupPiloto(input)),
});
