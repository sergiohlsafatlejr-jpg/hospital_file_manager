import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buscarAtendimentos,
  buscarOpcoesFiltro,
  sincronizarRelatorioAtendimentos,
  obterStatusSincronizacao,
  buscarMetricasDashboard,
  buscarComparacaoPeriodos,
  buscarMetricasAvancadas,
  buscarAnaliticasDemograficas,
  buscarAnaliticasOperacionais,
  buscarDadosMapaCalor,
  buscarPacientesInternados,
  buscarPacientesHemodialise,
} from "../relatorioAtendimentos";

const filtrosDashboardSchema = z.object({
  dataInicio: z.string(),
  dataFim: z.string(),
  tipoAtendimento: z.string().optional(),
  codPlaco: z.string().optional(),
  codPrest: z.string().optional(),
  codServ: z.string().optional(),
});

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

  // Métricas agregadas para dashboard
  metricasDashboard: protectedProcedure
    .input(filtrosDashboardSchema)
    .query(async ({ input }) => {
      return buscarMetricasDashboard(input);
    }),

  // Comparação de períodos (atual vs anterior)
  comparacaoPeriodos: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
      })
    )
    .query(async ({ input }) => {
      return buscarComparacaoPeriodos(input.dataInicio, input.dataFim);
    }),

  // Métricas avançadas (permanência, turno, conversão, caráter)
  metricasAvancadas: protectedProcedure
    .input(filtrosDashboardSchema)
    .query(async ({ input }) => {
      return buscarMetricasAvancadas(input);
    }),

  // Analíticas demográficas (sexo, CEP)
  analiticasDemograficas: protectedProcedure
    .input(filtrosDashboardSchema)
    .query(async ({ input }) => {
      return buscarAnaliticasDemograficas(input);
    }),

  // Analíticas operacionais (centro de custo, CBO, proveniência, especialidade)
  analiticasOperacionais: protectedProcedure
    .input(filtrosDashboardSchema)
    .query(async ({ input }) => {
      return buscarAnaliticasOperacionais(input);
    }),

  // Mapa de calor geográfico por CEP
  mapaCalor: protectedProcedure
    .input(
      z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
      })
    )
    .query(async ({ input }) => {
      return buscarDadosMapaCalor(input);
    }),

  // Pacientes internados (internações sem data de saída)
  pacientesInternados: protectedProcedure
    .query(async () => {
      return buscarPacientesInternados();
    }),

  // Pacientes de hemodiálise (PARIII)
  pacientesHemodialise: protectedProcedure
    .query(async () => {
      return buscarPacientesHemodialise();
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
