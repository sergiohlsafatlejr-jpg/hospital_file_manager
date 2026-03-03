/**
 * Router tRPC para Faturamento Unificado e Conciliação Cruzada
 * Expõe procedures para popular, consultar e conciliar dados de faturamento
 */

import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as faturamentoService from "../faturamentoUnificadoService";

export const faturamentoUnificadoRouter = router({
  /**
   * Popular faturamento unificado a partir do integ_faturado (Warleine)
   */
  popularDeIntegFaturado: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.popularDeIntegFaturado(input.estabelecimentoId, input.competencia);
    }),

  /**
   * @deprecated Use popularDeIntegFaturado em vez desta procedure.
   * Popular faturamento unificado a partir do Tasy (legado)
   */
  popularDeTasy: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.popularDeTasy(input.estabelecimentoId, input.competencia);
    }),

  /**
   * Popular faturamento unificado a partir do XML TISS
   */
  popularDeXmlTiss: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      dataReferencia: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.popularDeXmlTiss(input.estabelecimentoId, input.dataReferencia);
    }),

  /**
   * Popular faturamento unificado de ambas as fontes
   */
  popularTudo: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.popularFaturamentoUnificado(input.estabelecimentoId, input.competencia);
    }),

  /**
   * Listar faturamento unificado com filtros
   */
  listar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenio: z.string().optional(),
      convenioId: z.number().optional(),
      statusConciliacao: z.string().optional(),
      codigoItem: z.string().optional(),
      pacienteNome: z.string().optional(),
      limite: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.listarFaturamentoUnificado(input);
    }),

  /**
   * Resumo por convenio
   */
  resumoPorConvenio: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.resumoFaturamentoPorConvenio(input);
    }),

  /**
   * Resumo por guia/conta (agrupado) - principal para a tela de conciliacao
   */
  resumoPorGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenio: z.string().optional(),
      convenioId: z.number().optional(),
      statusConciliacao: z.string().optional(),
      busca: z.string().optional(),
      limite: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.resumoFaturamentoPorGuia(input);
    }),

  /**
   * Itens detalhados de uma guia/conta
   */
  itensPorGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      contaNumero: z.string().optional(),
      numeroGuia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.itensPorGuia(input);
    }),

  /**
   * Competencias disponiveis
   */
  competencias: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.competenciasDisponiveis(input.estabelecimentoId);
    }),

  /**
   * Convenios disponiveis
   */
  convenios: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.conveniosDisponiveis(input);
    }),

  /**
   * Atualizar status de conciliacao de um item
   */
  atualizarStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      statusConciliacao: z.string(),
      recebimentoVinculadoId: z.number().optional(),
      recebimentoOrigem: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await faturamentoService.atualizarStatusConciliacao(input);
      return { success: true };
    }),

  /**
   * Vincular manualmente guias do faturamento com recebimentos
   */
  vincularGuia: protectedProcedure
    .input(z.object({
      faturamentoIds: z.array(z.number()),
      recebimentoId: z.number(),
      recebimentoOrigem: z.enum(['excel', 'xml']),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.vincularGuiaManual(input);
    }),

  /**
   * Buscar recebimentos candidatos para vinculacao manual
   * (busca por nome do paciente, carteira ou competencia)
   */
  buscarRecebimentosCandidatos: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      pacienteNome: z.string().optional(),
      carteiraBeneficiario: z.string().optional(),
      competencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.buscarRecebimentosCandidatos(input);
    }),

  /**
   * Executar conciliacao automatica
   * Cruza faturamento_unificado com recebimentos_excel
   */
  conciliarAutomaticamente: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
      toleranciaPercentual: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.executarConciliacaoAutomatica(input);
    }),

  /**
   * Resetar conciliacao (voltar itens para pendente)
   */
  resetarConciliacao: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.resetarConciliacao(input);
    }),
});
