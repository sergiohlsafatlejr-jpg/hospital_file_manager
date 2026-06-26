import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const dashboardHomeRouter = router({
  // Dados do dashboard para a tela inicial
  resumoGeral: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(), // formato YYYY-MM
    }))
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados não disponível' });

      const { estabelecimentoId, competencia } = input;
      // Usar a competência mais recente se não especificada
      const compFilter = competencia || null;

      // database.execute(sql.raw(...)) retorna [[rows], [fields]]
      // Precisamos desestruturar corretamente

      // 1. FATURISTA: Totais de faturamento
      const [faturamentoRows] = await database.execute(sql.raw(`
        SELECT 
          COUNT(*) as totalItens,
          COUNT(DISTINCT numeroGuia) as totalContas,
          COALESCE(SUM(valorFaturado), 0) as valorTotalFaturado,
          MAX(competencia) as competenciaAtual
        FROM faturamento_unificado 
        WHERE estabelecimentoId = ${estabelecimentoId}
        ${compFilter ? `AND competencia = '${compFilter}'` : `AND competencia = (SELECT MAX(competencia) FROM faturamento_unificado WHERE estabelecimentoId = ${estabelecimentoId})`}
      `));
      const faturamento = (faturamentoRows as any[])?.[0] || {};

      // 2. FATURISTA: Top 5 convênios por valor faturado
      const [conveniosTopRows] = await database.execute(sql.raw(`
        SELECT 
          c.nome as convenio,
          COUNT(DISTINCT fu.numeroGuia) as totalGuias,
          COALESCE(SUM(fu.valorFaturado), 0) as totalFaturado
        FROM faturamento_unificado fu 
        JOIN convenios c ON fu.convenioId = c.id 
        WHERE fu.estabelecimentoId = ${estabelecimentoId}
        ${compFilter ? `AND fu.competencia = '${compFilter}'` : `AND fu.competencia = (SELECT MAX(competencia) FROM faturamento_unificado WHERE estabelecimentoId = ${estabelecimentoId})`}
        GROUP BY c.nome 
        ORDER BY totalFaturado DESC 
        LIMIT 5
      `));
      const conveniosTop = (conveniosTopRows as any[]) || [];

      // 3. FATURISTA: Evolução mensal (últimos 6 meses)
      const [evolucaoMensalRows] = await database.execute(sql.raw(`
        SELECT 
          competencia,
          COUNT(DISTINCT numeroGuia) as totalContas,
          COALESCE(SUM(valorFaturado), 0) as valorFaturado
        FROM faturamento_unificado 
        WHERE estabelecimentoId = ${estabelecimentoId}
        GROUP BY competencia 
        ORDER BY competencia DESC 
        LIMIT 6
      `));
      const evolucaoMensal = (evolucaoMensalRows as any[]) || [];

      // 4. RECURSO DE GLOSA: Status do fluxo
      const [recursoStatusRows] = await database.execute(sql.raw(`
        SELECT 
          COUNT(*) as totalRecursos,
          SUM(CASE WHEN status = 'rascunho' THEN 1 ELSE 0 END) as rascunho,
          SUM(CASE WHEN status = 'pendente_envio' THEN 1 ELSE 0 END) as pendenteEnvio,
          SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as enviado,
          SUM(CASE WHEN status = 'em_analise' THEN 1 ELSE 0 END) as emAnalise,
          SUM(CASE WHEN status = 'deferido' THEN 1 ELSE 0 END) as deferido,
          SUM(CASE WHEN status = 'deferido_parcial' THEN 1 ELSE 0 END) as deferidoParcial,
          SUM(CASE WHEN status = 'indeferido' THEN 1 ELSE 0 END) as indeferido,
          COALESCE(SUM(valorGlosado), 0) as valorTotalGlosado,
          COALESCE(SUM(valorCobrado), 0) as valorTotalRecursado,
          COALESCE(SUM(valorRecuperado), 0) as valorTotalRecuperado
        FROM recursosGlosa 
        WHERE estabelecimentoId = ${estabelecimentoId}
      `));
      const recursoStatus = (recursoStatusRows as any[])?.[0] || {};

      // 5. RECURSO DE GLOSA: Recursos com prazo próximo (próximos 30 dias)
      const [recursosComPrazoRows] = await database.execute(sql.raw(`
        SELECT 
          rg.id,
          rg.guiaNumero,
          rg.pacienteNome,
          rg.valorGlosado,
          rg.dataPrazoResposta,
          rg.status,
          c.nome as convenioNome,
          DATEDIFF(rg.dataPrazoResposta, NOW()) as diasRestantes
        FROM recursosGlosa rg
        LEFT JOIN convenios c ON rg.convenioId = c.id
        WHERE rg.estabelecimentoId = ${estabelecimentoId}
          AND rg.dataPrazoResposta IS NOT NULL
          AND rg.dataPrazoResposta >= NOW()
          AND rg.status IN ('enviado', 'em_analise')
        ORDER BY rg.dataPrazoResposta ASC
        LIMIT 10
      `));
      const recursosComPrazo = (recursosComPrazoRows as any[]) || [];

      // 6. RECURSO DE GLOSA: Fluxo do processo (pipeline)
      const [fluxoPipelineRows] = await database.execute(sql.raw(`
        SELECT
          (SELECT COUNT(DISTINCT fu.numeroGuia) FROM faturamento_unificado fu WHERE fu.estabelecimentoId = ${estabelecimentoId} ${compFilter ? `AND fu.competencia = '${compFilter}'` : ''}) as totalGuiasFaturadas,
          (SELECT COUNT(*) FROM nfse_notas n JOIN nfse_hospitais h ON n.hospitalId = h.id WHERE h.estabelecimentoId = ${estabelecimentoId}) as totalNfEmitidas,
          (SELECT COUNT(DISTINCT a.id) FROM arquivos a WHERE a.estabelecimentoId = ${estabelecimentoId} AND a.direcao = 'retornado' AND a.status = 'processado') as totalDemonstrativosImportados,
          (SELECT COUNT(*) FROM recursosGlosa WHERE estabelecimentoId = ${estabelecimentoId} AND status NOT IN ('rascunho','cancelado')) as totalRecursosFeitos
      `));
      const fluxoPipeline = (fluxoPipelineRows as any[])?.[0] || {};

      // 7. CONCILIAÇÃO: Resumo
      const [conciliacaoRows] = await database.execute(sql.raw(`
        SELECT 
          COUNT(*) as totalItens,
          SUM(CASE WHEN ca.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as conciliados,
          SUM(CASE WHEN ca.statusConciliacao IN ('glosa_total','glosa_parcial') THEN 1 ELSE 0 END) as glosados,
          SUM(CASE WHEN ca.statusConciliacao = 'sem_pagamento' THEN 1 ELSE 0 END) as semPagamento,
          SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) as acrescimos,
          COALESCE(SUM(ca.valorPago), 0) as totalPago,
          COALESCE(SUM(ca.valorGlosa), 0) as totalGlosa
        FROM conciliados_automatico ca
        JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
        WHERE fu.estabelecimentoId = ${estabelecimentoId}
        ${compFilter ? `AND fu.competencia = '${compFilter}'` : ''}
      `));
      const conciliacao = (conciliacaoRows as any[])?.[0] || {};

      return {
        faturista: {
          totalItens: Number(faturamento?.totalItens || 0),
          totalContas: Number(faturamento?.totalContas || 0),
          valorTotalFaturado: Number(faturamento?.valorTotalFaturado || 0),
          competenciaAtual: faturamento?.competenciaAtual || compFilter || '',
          conveniosTop: conveniosTop.map((c: any) => ({
            convenio: c.convenio || 'Sem convênio',
            totalGuias: Number(c.totalGuias || 0),
            totalFaturado: Number(c.totalFaturado || 0),
          })),
          evolucaoMensal: evolucaoMensal.map((e: any) => ({
            competencia: e.competencia,
            totalContas: Number(e.totalContas || 0),
            valorFaturado: Number(e.valorFaturado || 0),
          })).reverse(),
        },
        recursoGlosa: {
          totalRecursos: Number(recursoStatus?.totalRecursos || 0),
          rascunho: Number(recursoStatus?.rascunho || 0),
          pendenteEnvio: Number(recursoStatus?.pendenteEnvio || 0),
          enviado: Number(recursoStatus?.enviado || 0),
          emAnalise: Number(recursoStatus?.emAnalise || 0),
          deferido: Number(recursoStatus?.deferido || 0),
          deferidoParcial: Number(recursoStatus?.deferidoParcial || 0),
          indeferido: Number(recursoStatus?.indeferido || 0),
          valorTotalGlosado: Number(recursoStatus?.valorTotalGlosado || 0),
          valorTotalRecursado: Number(recursoStatus?.valorTotalRecursado || 0),
          valorTotalRecuperado: Number(recursoStatus?.valorTotalRecuperado || 0),
          recursosComPrazo: recursosComPrazo.map((r: any) => ({
            id: r.id,
            guiaNumero: r.guiaNumero,
            pacienteNome: r.pacienteNome,
            valorGlosado: Number(r.valorGlosado || 0),
            dataPrazoResposta: r.dataPrazoResposta,
            status: r.status,
            convenioNome: r.convenioNome,
            diasRestantes: Number(r.diasRestantes || 0),
          })),
        },
        fluxoPipeline: {
          totalGuiasFaturadas: Number(fluxoPipeline?.totalGuiasFaturadas || 0),
          totalNfEmitidas: Number(fluxoPipeline?.totalNfEmitidas || 0),
          totalDemonstrativosImportados: Number(fluxoPipeline?.totalDemonstrativosImportados || 0),
          totalRecursosFeitos: Number(fluxoPipeline?.totalRecursosFeitos || 0),
        },
        conciliacao: {
          totalItens: Number(conciliacao?.totalItens || 0),
          conciliados: Number(conciliacao?.conciliados || 0),
          glosados: Number(conciliacao?.glosados || 0),
          semPagamento: Number(conciliacao?.semPagamento || 0),
          acrescimos: Number(conciliacao?.acrescimos || 0),
          totalPago: Number(conciliacao?.totalPago || 0),
          totalGlosa: Number(conciliacao?.totalGlosa || 0),
        },
      };
    }),
});
