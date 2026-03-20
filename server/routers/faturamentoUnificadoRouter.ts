/**
 * Router tRPC para Faturamento Unificado e Conciliação Cruzada
 * Expõe procedures para popular, consultar e conciliar dados de faturamento
 */

import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as faturamentoService from "../faturamentoUnificadoService";
import * as xmlRecursoService from "../xmlRecursoService";

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
      loteXml: z.string().optional(),
      loteRetorno: z.string().optional(),
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
   * Resetar conciliacao (deletar registros da conciliados_automatico)
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

  /**
   * Listar resultados da conciliação automática (tabela conciliados_automatico)
   */
  listarConciliados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
      statusConciliacao: z.string().optional(),
      busca: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.listarConciliadosAutomatico(input);
    }),

  /**
   * Resumo dos resultados da conciliação automática por status
   */
  resumoConciliados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.resumoConciliadosAutomatico(input);
    }),

  /**
   * Competências disponíveis na conciliados_automatico
   */
  competenciasConciliados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.competenciasConciliados(input.estabelecimentoId);
    }),

  /**
   * Convênios disponíveis na conciliados_automatico
   */
  conveniosConciliados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.conveniosConciliados(input.estabelecimentoId, input.competencia);
    }),

  /**
   * Resumo agrupado por GUIA dos conciliados automáticos
   */
  resumoConciliadosPorGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
      statusConciliacao: z.string().optional(),
      busca: z.string().optional(),
      loteXml: z.string().optional(),
      loteRetorno: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.resumoConciliadosPorGuia(input);
    }),

  /**
   * Itens detalhados de uma guia na conciliados_automatico
   */
  itensConciliadosPorGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      numeroGuia: z.string().optional(),
      contaNumero: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.itensConciliadosPorGuia(input);
    }),

  /**
   * Glosar itens individuais (mudar de nao_recebido para glosado)
   */
  glosarItens: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      estabelecimentoId: z.number(),
      motivoGlosa: z.string().optional(),
      codigoGlosa: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.glosarItens(input);
    }),

  /**
   * Glosar TODOS os itens não recebidos de uma guia
   */
  glosarTodosNaoRecebidosPorGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      numeroGuia: z.string().optional(),
      contaNumero: z.string().optional(),
      motivoGlosa: z.string().optional(),
      codigoGlosa: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.glosarTodosNaoRecebidosPorGuia(input);
    }),

  /**
   * Reverter glosa de itens (voltar para nao_recebido)
   */
  reverterGlosa: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await faturamentoService.reverterGlosa(input);
    }),

  // ============================================================
  // XML DE RECURSO DE GLOSA
  // ============================================================

  /**
   * Gerar XML de recurso para guias glosadas (individual ou lote)
   */
  gerarXmlRecurso: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      guias: z.array(z.string()).min(1),
      convenioId: z.number().optional(),
      registroANS: z.string().optional(),
      cnpjOperadora: z.string().optional(),
      numeroDemonstrativo: z.string().optional(),
      numeroProtocolo: z.string().optional(),
      lotePrestador: z.string().optional(),
      dataProtocolo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await xmlRecursoService.gerarXmlRecurso({
        ...input,
        userId: ctx.user?.id,
      });
    }),

  /**
   * Listar XMLs de recurso gerados
   */
  listarXmlsGerados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competencia: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await xmlRecursoService.listarXmlsGerados(input);
    }),

  /**
   * Buscar guias glosadas disponíveis para geração de XML
   */
  guiasGlosadasDisponiveis: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competencia: z.string().optional(),
      apenasNaoGeradas: z.boolean().optional(),
      loteXml: z.string().optional(),
      loteRetorno: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await xmlRecursoService.guiasGlosadasDisponiveis(input);
    }),

  /**
   * Download de XML de recurso gerado
   */
  downloadXmlRecurso: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      return await xmlRecursoService.downloadXmlRecurso(input.id);
    }),

  /**
   * Lotes do retorno/demonstrativo (lote_prestador + protocolo)
   */
  lotesRetorno: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.lotesRetornoDisponiveis(input);
    }),

  /**
   * Lotes do XML TISS enviado (numero_lote)
   */
  lotesXmlTiss: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenioId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await faturamentoService.lotesXmlTissDisponiveis(input);
    }),
});
