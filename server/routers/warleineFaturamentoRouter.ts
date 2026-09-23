import { z } from "zod";
import { adminProcedure, router, reportProcedure } from "../_core/trpc";
import {
  approveWarleineSnapshotReduction,
  compararContaWarleineComPadroes,
  getWarleineAccountDetails,
  getWarleineAccountItems,
  getWarleineAccounts,
  getWarleineFinancialData,
  getWarleineGlosaDashboard,
  getWarleineGlosaFilters,
  getWarleineLotSummary,
} from "../warleineFaturamentoService";

const estabelecimentoSchema = z.object({ estabelecimentoId: z.number().int().positive() });

export const warleineFaturamentoRouter = router({
  faturadoRecebido: reportProcedure("relFaturadoRecebido")
    .input(estabelecimentoSchema.extend({
      competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
      convenio: z.string().trim().min(1).max(255).optional(),
      limite: z.number().int().min(5).max(30).default(10),
    }))
    .query(({ input }) => getWarleineFinancialData(input)),

  filtrosGlosas: reportProcedure("relatoriosGlosasBi")
    .input(estabelecimentoSchema)
    .query(({ input }) => getWarleineGlosaFilters(input.estabelecimentoId)),

  glosasBi: reportProcedure("relatoriosGlosasBi")
    .input(estabelecimentoSchema.extend({
      convenioChave: z.string().trim().min(1).max(255).optional(),
      mesPagamentoInicio: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
      mesPagamentoFim: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
      categoriaGlosa: z.enum(["COM_CODIGO", "SEM_CODIGO"]).optional(),
      mesPagamento: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
      itemDescricao: z.string().trim().min(1).max(500).optional(),
      procedimentoCodigo: z.string().trim().min(1).max(100).optional(),
      motivoCodigo: z.string().trim().min(1).max(100).optional(),
      limite: z.number().int().min(5).max(50).default(20),
    }))
    .query(({ input }) => getWarleineGlosaDashboard(input)),

  listarContas: reportProcedure("contaConvenio")
    .input(estabelecimentoSchema.extend({
      competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
      competenciaAno: z.string().regex(/^\d{4}$/).optional(),
      convenio: z.string().trim().min(1).max(255).optional(),
      statusAnalise: z.enum(["pendente", "conforme", "divergente", "revisado"]).optional(),
      search: z.string().trim().min(1).max(255).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(10).max(100).default(20),
    }))
    .query(({ input }) => getWarleineAccounts(input)),

  compararComPadroes: reportProcedure("contaConvenio")
    .input(estabelecimentoSchema.extend({
      competencia: z.string().regex(/^\d{4}\/\d{2}$/),
      numeroConta: z.string().trim().min(1).max(100),
      convenioChave: z.string().trim().min(1).max(255),
    }))
    .mutation(({ ctx, input }) => compararContaWarleineComPadroes({ ...input, userId: ctx.user.id })),

  listarItensConta: reportProcedure("contaConvenio")
    .input(estabelecimentoSchema.extend({
      competencia: z.string().regex(/^\d{4}\/\d{2}$/),
      numeroConta: z.string().trim().min(1).max(100),
      convenioChave: z.string().trim().min(1).max(255),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(20).max(200).default(100),
    }))
    .query(({ input }) => getWarleineAccountItems(input.estabelecimentoId, input.competencia, input.numeroConta, input.convenioChave, input.page, input.pageSize)),

  detalharConta: reportProcedure("contaConvenio")
    .input(estabelecimentoSchema.extend({
      competencia: z.string().regex(/^\d{4}\/\d{2}$/),
      numeroConta: z.string().trim().min(1).max(100),
      convenioChave: z.string().trim().min(1).max(255),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(20).max(200).default(100),
    }))
    .query(({ input }) => getWarleineAccountDetails(input.estabelecimentoId, input.competencia, input.numeroConta, input.convenioChave, input.page, input.pageSize)),

  lotes: reportProcedure("contaConvenio")
    .input(estabelecimentoSchema)
    .query(({ input }) => getWarleineLotSummary(input.estabelecimentoId)),

  aprovarReducaoSnapshot: adminProcedure
    .input(estabelecimentoSchema.extend({
      loteId: z.number().int().positive(),
      motivo: z.string().trim().min(10).max(1000),
    }))
    .mutation(({ ctx, input }) => approveWarleineSnapshotReduction(input.estabelecimentoId, input.loteId, ctx.user.id, input.motivo)),
});
