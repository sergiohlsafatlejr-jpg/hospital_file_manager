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

      // 1. FATURISTA: Totais de faturamento
      const [faturamento] = await database.execute(sql.raw(`
        SELECT 
          COUNT(*) as totalItens,
          COUNT(DISTINCT numeroGuia) as totalContas,
          COALESCE(SUM(valorFaturado), 0) as valorTotalFaturado,
          MAX(competencia) as competenciaAtual
        FROM faturamento_unificado 
        WHERE estabelecimentoId = ${estabelecimentoId}
        ${compFilter ? `AND competencia = '${compFilter}'` : `AND competencia = (SELECT MAX(competencia) FROM faturamento_unificado WHERE estabelecimentoId = ${estabelecimentoId})`}
      `));

      // 2. FATURISTA: Top 5 convênios por valor faturado
      const conveniosTop = await database.execute(sql.raw(`
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

      // 3. FATURISTA: Evolução mensal (últimos 6 meses)
      const evolucaoMensal = await database.execute(sql.raw(`
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

      // 4. RECURSO DE GLOSA: Status do fluxo
      const [recursoStatus] = await database.execute(sql.raw(`
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

      // 5. RECURSO DE GLOSA: Recursos com prazo próximo (próximos 30 dias)
      const recursosComPrazo = await database.execute(sql.raw(`
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

      // 6. RECURSO DE GLOSA: Fluxo do processo (pipeline)
      const [fluxoPipeline] = await database.execute(sql.raw(`
        SELECT
          (SELECT COUNT(DISTINCT fu.numeroGuia) FROM faturamento_unificado fu WHERE fu.estabelecimentoId = ${estabelecimentoId} ${compFilter ? `AND fu.competencia = '${compFilter}'` : ''}) as totalGuiasFaturadas,
          (SELECT COUNT(*) FROM nfse_notas n JOIN nfse_hospitais h ON n.hospitalId = h.id WHERE h.estabelecimentoId = ${estabelecimentoId}) as totalNfEmitidas,
          (SELECT COUNT(DISTINCT a.id) FROM arquivos a WHERE a.estabelecimentoId = ${estabelecimentoId} AND a.direcao = 'retornado' AND a.status = 'processado') as totalDemonstrativosImportados,
          (SELECT COUNT(*) FROM recursosGlosa WHERE estabelecimentoId = ${estabelecimentoId} AND status NOT IN ('rascunho','cancelado')) as totalRecursosFeitos
      `));

      // 7. CONCILIAÇÃO: Resumo
      const [conciliacao] = await database.execute(sql.raw(`
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

      return {
        faturista: {
          totalItens: Number((faturamento as any)?.totalItens || 0),
          totalContas: Number((faturamento as any)?.totalContas || 0),
          valorTotalFaturado: Number((faturamento as any)?.valorTotalFaturado || 0),
          competenciaAtual: (faturamento as any)?.competenciaAtual || compFilter || '',
          conveniosTop: (conveniosTop as any[]).map((c: any) => ({
            convenio: c.convenio,
            totalGuias: Number(c.totalGuias),
            totalFaturado: Number(c.totalFaturado),
          })),
          evolucaoMensal: (evolucaoMensal as any[]).map((e: any) => ({
            competencia: e.competencia,
            totalContas: Number(e.totalContas),
            valorFaturado: Number(e.valorFaturado),
          })).reverse(),
        },
        recursoGlosa: {
          totalRecursos: Number((recursoStatus as any)?.totalRecursos || 0),
          rascunho: Number((recursoStatus as any)?.rascunho || 0),
          pendenteEnvio: Number((recursoStatus as any)?.pendenteEnvio || 0),
          enviado: Number((recursoStatus as any)?.enviado || 0),
          emAnalise: Number((recursoStatus as any)?.emAnalise || 0),
          deferido: Number((recursoStatus as any)?.deferido || 0),
          deferidoParcial: Number((recursoStatus as any)?.deferidoParcial || 0),
          indeferido: Number((recursoStatus as any)?.indeferido || 0),
          valorTotalGlosado: Number((recursoStatus as any)?.valorTotalGlosado || 0),
          valorTotalRecursado: Number((recursoStatus as any)?.valorTotalRecursado || 0),
          valorTotalRecuperado: Number((recursoStatus as any)?.valorTotalRecuperado || 0),
          recursosComPrazo: (recursosComPrazo as any[]).map((r: any) => ({
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
          totalGuiasFaturadas: Number((fluxoPipeline as any)?.totalGuiasFaturadas || 0),
          totalNfEmitidas: Number((fluxoPipeline as any)?.totalNfEmitidas || 0),
          totalDemonstrativosImportados: Number((fluxoPipeline as any)?.totalDemonstrativosImportados || 0),
          totalRecursosFeitos: Number((fluxoPipeline as any)?.totalRecursosFeitos || 0),
        },
        conciliacao: {
          totalItens: Number((conciliacao as any)?.totalItens || 0),
          conciliados: Number((conciliacao as any)?.conciliados || 0),
          glosados: Number((conciliacao as any)?.glosados || 0),
          semPagamento: Number((conciliacao as any)?.semPagamento || 0),
          acrescimos: Number((conciliacao as any)?.acrescimos || 0),
          totalPago: Number((conciliacao as any)?.totalPago || 0),
          totalGlosa: Number((conciliacao as any)?.totalGlosa || 0),
        },
      };
    }),
});
