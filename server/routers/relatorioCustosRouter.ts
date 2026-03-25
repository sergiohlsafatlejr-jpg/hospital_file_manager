import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buscarCustosProdutos,
  buscarOpcoesFiltrosCustos,
  sincronizarCustosProdutos,
  obterStatusSincronizacaoCustos,
  buscarMetricasCustosDashboard,
  buscarComparacaoCustoConvenio,
  buscarCustosPorConvenio,
  buscarCustosPorConta,
  buscarDetalheContaCusto,
  buscarCustosPorSetor,
} from "../relatorioCustos";
import {
  buscarCustosPorConvenioSamaritano,
  buscarCustosPorContaSamaritano,
  buscarDetalheContaCustoSamaritano,
  buscarCustosPorSetorSamaritano,
} from "../relatorioCustosSamaritano";
import { buscarDashboardSamaritano } from "../dashboardSamaritano";

// ID do estabelecimento Samaritano
const SAMARITANO_ID = 2280016;

function isSamaritano(estabelecimentoId: number): boolean {
  return estabelecimentoId === SAMARITANO_ID;
}

export const relatorioCustosRouter = router({
  buscar: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        tipoprod: z.string().optional(),
        codtbmm: z.string().optional(),
        convenio: z.string().optional(),
        busca: z.string().optional(),
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      return buscarCustosProdutos(estabelecimentoId, filtros);
    }),

  opcoesFiltro: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return buscarOpcoesFiltrosCustos(input.estabelecimentoId);
    }),

  sincronizar: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return sincronizarCustosProdutos(
        input.estabelecimentoId,
        ctx.user.id,
        ctx.user.name || undefined
      );
    }),

  metricasDashboard: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        tipoprod: z.string().optional(),
        codtbmm: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      return buscarMetricasCustosDashboard(estabelecimentoId, filtros);
    }),

  statusSincronizacao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return obterStatusSincronizacaoCustos(input.estabelecimentoId);
    }),

  comparacaoCustoConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        tipoprod: z.string().optional(),
        codtbmm: z.string().optional(),
        convenio: z.string().optional(),
        busca: z.string().optional(),
        apenasComPrejuizo: z.boolean().optional(),
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      return buscarComparacaoCustoConvenio(estabelecimentoId, filtros);
    }),

  custosPorConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        tipoItem: z.string().optional(),
        competencia: z.string().optional(),
        busca: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      if (isSamaritano(estabelecimentoId)) {
        return buscarCustosPorConvenioSamaritano(estabelecimentoId, filtros);
      }
      return buscarCustosPorConvenio(estabelecimentoId, filtros);
    }),

  custosPorConta: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        competencia: z.string().optional(),
        busca: z.string().optional(),
        setor: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      if (isSamaritano(estabelecimentoId)) {
        return buscarCustosPorContaSamaritano(estabelecimentoId, filtros);
      }
      return buscarCustosPorConta(estabelecimentoId, filtros);
    }),

  detalheContaCusto: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        numconta: z.string(),
      })
    )
    .query(async ({ input }) => {
      if (isSamaritano(input.estabelecimentoId)) {
        return buscarDetalheContaCustoSamaritano(input.estabelecimentoId, input.numconta);
      }
      return buscarDetalheContaCusto(input.estabelecimentoId, input.numconta);
    }),

  dashboardSamaritano: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        competencia: z.union([z.string(), z.array(z.string())]).optional(),
        convenio: z.union([z.string(), z.array(z.string())]).optional(),
        tipoAtend: z.union([z.string(), z.array(z.string())]).optional(),
        setor: z.union([z.string(), z.array(z.string())]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      if (!isSamaritano(estabelecimentoId)) {
        throw new Error("Dashboard Samaritano disponível apenas para o Hospital Samaritano");
      }
      return buscarDashboardSamaritano(estabelecimentoId, filtros);
    }),

  custosPorSetor: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        setor: z.string().optional(),
        convenio: z.string().optional(),
        competencia: z.string().optional(),
        busca: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { estabelecimentoId, ...filtros } = input;
      if (isSamaritano(estabelecimentoId)) {
        return buscarCustosPorSetorSamaritano(estabelecimentoId, filtros);
      }
      return buscarCustosPorSetor(estabelecimentoId, filtros);
    }),
});
