import { router, publicProcedure, protectedProcedure, trackedProtectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

/**
 * Router de Integração com Tasy
 * Implementa relatórios de glosas e análise IA
 */
export const tasyRouter = router({
  gerarRelatorioGlosas: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia: z.string().optional(),
      convenio: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database não disponível");

      const { estabelecimentoId, competencia, convenio } = input;

      const whereParts: string[] = [`re.estabelecimentoId = ${estabelecimentoId}`];
      if (competencia) {
        const parts = competencia.includes('/') ? competencia.split('/') : competencia.split('-');
        const year = parts[0];
        const month = parseInt(parts[1]);
        whereParts.push(`YEAR(re.data_referencia) = ${year} AND MONTH(re.data_referencia) = ${month}`);
      }
      if (convenio) {
        whereParts.push(`c.nome = '${convenio.replace(/'/g, "''")}'`);
      }
      const whereClause = whereParts.join(' AND ');

      // Resumo geral
      const [resumoRows] = await db.execute(sql.raw(`
        SELECT 
          SUM(COALESCE(re.valor_informado, 0)) as vlCobrado,
          SUM(COALESCE(re.valor_pagamento, 0)) as vlPago,
          SUM(COALESCE(re.valor_glosa, 0)) as vlGlosa,
          COUNT(*) as linhas,
          COUNT(DISTINCT c.nome) as conveniosDistintos,
          MIN(re.data_referencia) as compIni,
          MAX(re.data_referencia) as compFim
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        WHERE ${whereClause}
      `));

      const resumoRaw = (resumoRows as unknown as any[])[0] || {};
      const vlCobrado = parseFloat(resumoRaw.vlCobrado || '0');
      const vlPago = parseFloat(resumoRaw.vlPago || '0');
      const vlGlosa = parseFloat(resumoRaw.vlGlosa || '0');
      const linhas = parseInt(resumoRaw.linhas || '0');
      const conveniosDistintos = parseInt(resumoRaw.conveniosDistintos || '0');
      const pctGlosa = vlCobrado > 0 ? (vlGlosa / vlCobrado) * 100 : 0;
      const compIni = resumoRaw.compIni ? new Date(resumoRaw.compIni).toISOString().slice(0, 7) : null;
      const compFim = resumoRaw.compFim ? new Date(resumoRaw.compFim).toISOString().slice(0, 7) : null;

      // Por Motivo de Glosa
      const [motivoRows] = await db.execute(sql.raw(`
        SELECT 
          COALESCE(re.codigo_glosa, 'Sem código') as motivo,
          COALESCE(mg.descricaoSimplificada, mg.descricao, re.codigo_glosa, 'Sem motivo') as descricao,
          SUM(COALESCE(re.valor_glosa, 0)) as valor,
          COUNT(*) as qtd
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        LEFT JOIN motivosGlosa mg ON mg.codigo = re.codigo_glosa AND mg.estabelecimentoId = re.estabelecimentoId
        WHERE ${whereClause} AND re.valor_glosa > 0
        GROUP BY re.codigo_glosa, COALESCE(mg.descricaoSimplificada, mg.descricao, re.codigo_glosa, 'Sem motivo')
        ORDER BY SUM(COALESCE(re.valor_glosa, 0)) DESC
        LIMIT 30
      `));

      const totalGlosaMotivos = (motivoRows as unknown as any[]).reduce((acc: number, r: any) => acc + parseFloat(r.valor || '0'), 0);
      const porMotivo = (motivoRows as unknown as any[]).map((r: any) => ({
        motivo: r.motivo,
        descricao: r.descricao,
        valor: parseFloat(r.valor || '0'),
        qtd: parseInt(r.qtd || '0'),
        participacao: totalGlosaMotivos > 0 ? (parseFloat(r.valor || '0') / totalGlosaMotivos) * 100 : 0,
      }));

      // Por Convênio
      const [convRows] = await db.execute(sql.raw(`
        SELECT 
          COALESCE(c.nome, 'Sem Convênio') as convenio,
          SUM(COALESCE(re.valor_informado, 0)) as vlCobrado,
          SUM(COALESCE(re.valor_pagamento, 0)) as vlPago,
          SUM(COALESCE(re.valor_glosa, 0)) as vlGlosa,
          COUNT(*) as qtd
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        WHERE ${whereClause}
        GROUP BY COALESCE(c.nome, 'Sem Convênio')
        ORDER BY SUM(COALESCE(re.valor_glosa, 0)) DESC
        LIMIT 20
      `));

      const porConvenio = (convRows as unknown as any[]).map((r: any) => ({
        convenio: r.convenio,
        vlCobrado: parseFloat(r.vlCobrado || '0'),
        vlPago: parseFloat(r.vlPago || '0'),
        vlGlosa: parseFloat(r.vlGlosa || '0'),
        qtd: parseInt(r.qtd || '0'),
        pctGlosa: parseFloat(r.vlCobrado || '0') > 0 ? (parseFloat(r.vlGlosa || '0') / parseFloat(r.vlCobrado || '0')) * 100 : 0,
      }));

      // Por Setor (tipo de item)
      const [setorRows] = await db.execute(sql.raw(`
        SELECT 
          COALESCE(re.tipo_item, 'Outros') as setor,
          SUM(COALESCE(re.valor_informado, 0)) as vlCobrado,
          SUM(COALESCE(re.valor_pagamento, 0)) as vlPago,
          SUM(COALESCE(re.valor_glosa, 0)) as vlGlosa,
          COUNT(*) as qtd
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        WHERE ${whereClause}
        GROUP BY COALESCE(re.tipo_item, 'Outros')
        ORDER BY SUM(COALESCE(re.valor_glosa, 0)) DESC
      `));

      const porSetor = (setorRows as unknown as any[]).map((r: any) => ({
        setor: r.setor,
        vlCobrado: parseFloat(r.vlCobrado || '0'),
        vlPago: parseFloat(r.vlPago || '0'),
        vlGlosa: parseFloat(r.vlGlosa || '0'),
        qtd: parseInt(r.qtd || '0'),
        pctGlosa: parseFloat(r.vlCobrado || '0') > 0 ? (parseFloat(r.vlGlosa || '0') / parseFloat(r.vlCobrado || '0')) * 100 : 0,
      }));

      // Por Item (procedimento)
      const [itemRows] = await db.execute(sql.raw(`
        SELECT 
          COALESCE(re.item, 'SEM_COD') as codigo,
          COALESCE(re.item_desc, 'Sem descrição') as descricao,
          SUM(COALESCE(re.valor_informado, 0)) as vlCobrado,
          SUM(COALESCE(re.valor_pagamento, 0)) as vlPago,
          SUM(COALESCE(re.valor_glosa, 0)) as vlGlosa,
          COUNT(*) as qtd
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        WHERE ${whereClause} AND re.valor_glosa > 0
        GROUP BY COALESCE(re.item, 'SEM_COD'), COALESCE(re.item_desc, 'Sem descrição')
        ORDER BY SUM(COALESCE(re.valor_glosa, 0)) DESC
        LIMIT 30
      `));

      const porItem = (itemRows as unknown as any[]).map((r: any) => ({
        codigo: r.codigo,
        descricao: r.descricao,
        vlCobrado: parseFloat(r.vlCobrado || '0'),
        vlPago: parseFloat(r.vlPago || '0'),
        vlGlosa: parseFloat(r.vlGlosa || '0'),
        qtd: parseInt(r.qtd || '0'),
        pctGlosa: parseFloat(r.vlCobrado || '0') > 0 ? (parseFloat(r.vlGlosa || '0') / parseFloat(r.vlCobrado || '0')) * 100 : 0,
      }));

      // Evolução Mensal
      const [evolRows] = await db.execute(sql.raw(`
        SELECT 
          CONCAT(YEAR(re.data_referencia), '-', LPAD(MONTH(re.data_referencia), 2, '0')) as competencia,
          SUM(COALESCE(re.valor_informado, 0)) as vlCobrado,
          SUM(COALESCE(re.valor_pagamento, 0)) as vlPago,
          SUM(COALESCE(re.valor_glosa, 0)) as vlGlosa,
          COUNT(*) as qtd
        FROM recebimentos_excel re
        LEFT JOIN convenios c ON re.convenioId = c.id
        WHERE ${whereClause} AND re.data_referencia IS NOT NULL
        GROUP BY CONCAT(YEAR(re.data_referencia), '-', LPAD(MONTH(re.data_referencia), 2, '0'))
        ORDER BY competencia
      `));

      const evolucaoMensal = (evolRows as unknown as any[]).map((r: any) => ({
        competencia: r.competencia,
        vlCobrado: parseFloat(r.vlCobrado || '0'),
        vlPago: parseFloat(r.vlPago || '0'),
        vlGlosa: parseFloat(r.vlGlosa || '0'),
        qtd: parseInt(r.qtd || '0'),
        pctGlosa: parseFloat(r.vlCobrado || '0') > 0 ? (parseFloat(r.vlGlosa || '0') / parseFloat(r.vlCobrado || '0')) * 100 : 0,
      }));

      // Oportunidades
      const oportunidades = porItem
        .filter((i: any) => i.vlGlosa > 50)
        .slice(0, 10)
        .map((i: any) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          valorRecuperavel: i.vlGlosa,
          motivo: 'Glosa recorrente',
          sugestao: 'Verificar documentação e solicitar recurso',
        }));

      return {
        resumo: { vlCobrado, vlPago, vlGlosa, pctGlosa, linhas, conveniosDistintos, compIni, compFim },
        porMotivo,
        porConvenio,
        porSetor,
        porItem,
        evolucaoMensal,
        oportunidades,
        fonte: 'recebimentos_excel',
      };
    }),

  gerarAnaliseComparativaIA: protectedProcedure
    .input(z.object({ mesA: z.any(), mesB: z.any() }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um analista de faturamento hospitalar. Analise os dados comparativos entre dois meses e forneça insights sobre variações, tendências e recomendações. Responda em português brasileiro." },
            { role: "user", content: `Compare os seguintes dados de glosas entre dois meses:\n\nMês A: ${JSON.stringify(input.mesA)}\n\nMês B: ${JSON.stringify(input.mesB)}\n\nForneça: 1. Principais variações 2. Tendências identificadas 3. Recomendações de ação` },
          ],
        });
        return { analise: response.choices?.[0]?.message?.content || "Análise não disponível" };
      } catch (e) {
        return { analise: "Erro ao gerar análise comparativa. Tente novamente." };
      }
    }),

  gerarAnaliseIA: protectedProcedure
    .input(z.object({ dados: z.any() }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um analista especialista em faturamento hospitalar e glosas. Analise os dados fornecidos e gere um relatório executivo com insights, tendências e recomendações práticas. Responda em português brasileiro." },
            { role: "user", content: `Analise os seguintes dados de glosas hospitalares:\n\n${JSON.stringify(input.dados)}\n\nInclua: 1. Resumo executivo 2. Principais motivos de glosa 3. Convênios com maior índice 4. Tendências mensais 5. Recomendações` },
          ],
        });
        return { analise: response.choices?.[0]?.message?.content || "Análise não disponível" };
      } catch (e) {
        return { analise: "Erro ao gerar análise. Tente novamente." };
      }
    }),
});

/**
 * Wrapper para fallback para monolito
 */
export async function tasyFallback(
  procedure: string,
  input: any,
  ctx: any
): Promise<any> {
  throw new Error(`Procedure ${procedure} não implementada em módulo tasy`);
}
