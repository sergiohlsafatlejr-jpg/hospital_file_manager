import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buscarRelatorioUnificado,
  listarConveniosUnificado,
  buscarTabelaPorConvenioUnificado,
  obterConfiguracaoFonte,
} from "../fonteRelatoriosService";
import {
  buscarDetalheMesConvenio,
  buscarTabelaPorSetor,
  buscarTabelaPorTipoAtendimento,
} from "../relatorioFaturamento";

export const relatorioFaturamentoRouter = router({
  buscar: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number().optional(),
        anoAnterior: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      // Usa o service unificado que busca da fonte correta por estabelecimento
      const resultado = await buscarRelatorioUnificado(input);
      // Retorna no formato compatível com o frontend existente
      return {
        acumulado: resultado.acumulado,
        porSetor: resultado.porSetor,
        porMes: resultado.porMes,
        porTipoAtendimento: resultado.porTipoAtendimento,
        porConvenio: resultado.porConvenio,
        tabelaComparativa: resultado.tabelaComparativa,
        // Metadados extras
        _fonte: resultado.fonte,
        _sistemaOrigem: resultado.sistemaOrigem,
      };
    }),

  listarConvenios: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
      })
    )
    .query(async ({ input }) => {
      // Usa o service unificado que busca convênios da fonte correta
      return listarConveniosUnificado(input.estabelecimentoId);
    }),

  buscarPorConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number(),
        anoAnterior: z.number(),
        convenio: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      // Usa o service unificado para buscar tabela comparativa por convênio
      const tabelaComparativa = await buscarTabelaPorConvenioUnificado(input);
      
      // Calcular totais para manter compatibilidade com frontend
      let totalFaturadoAtual = 0;
      let totalFaturadoAnterior = 0;
      let qtdContasAtual = 0;
      let qtdContasAnterior = 0;
      for (const mes of tabelaComparativa) {
        totalFaturadoAtual += mes.faturadoAtual;
        totalFaturadoAnterior += mes.faturadoAnterior;
        qtdContasAtual += mes.qtdContasAtual;
        qtdContasAnterior += mes.qtdContasAnterior;
      }
      const variacaoPercentual = totalFaturadoAnterior > 0
        ? Math.round(((totalFaturadoAtual - totalFaturadoAnterior) / totalFaturadoAnterior) * 10000) / 100
        : (totalFaturadoAtual > 0 ? 100 : 0);

      return {
        convenio: input.convenio,
        anoAtual: input.anoAtual,
        anoAnterior: input.anoAnterior,
        totalFaturadoAtual,
        totalFaturadoAnterior,
        variacaoPercentual,
        qtdContasAtual,
        qtdContasAnterior,
        tabelaComparativa,
      };
    }),

  buscarPorSetor: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number(),
        anoAnterior: z.number(),
        setor: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      // Mantém a implementação legada por enquanto (setor detalhado)
      return buscarTabelaPorSetor(input);
    }),

  buscarPorTipoAtendimento: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number(),
        anoAnterior: z.number(),
        tipoAtendimento: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      // Mantém a implementação legada por enquanto (tipo detalhado)
      return buscarTabelaPorTipoAtendimento(input);
    }),

  detalheMesConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number(),
        anoAnterior: z.number(),
        mes: z.string().min(1).max(2),
      })
    )
    .query(async ({ input }) => {
      return buscarDetalheMesConvenio(input);
    }),
});
