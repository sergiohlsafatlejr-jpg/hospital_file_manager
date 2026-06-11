import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * Relatório Comparativo Mês a Mês
 * Compara faturamento do ano atual vs ano anterior, agrupado por mês e convênio
 * Mostra: Faturado Ano Atual, Faturado Ano Anterior, Variação %, Contas Ano Atual, Contas Ano Anterior
 */

export const comparativoMesAMesRouter = router({
  /**
   * Buscar dados do comparativo mês a mês
   * Retorna totais por mês com detalhamento por convênio
   */
  getDados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      anoAtual: z.number().min(2020).max(2030).default(2026),
      anoAnterior: z.number().min(2019).max(2029).default(2025),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { estabelecimentoId, anoAtual, anoAnterior } = input;

      // Query para buscar dados agrupados por mês e convênio para ambos os anos
      const query = `
        SELECT 
          MONTH(fu.dataExecucao) as mes,
          YEAR(fu.dataExecucao) as ano,
          fu.convenioId,
          COALESCE(c.nome, 'SEM CONVÊNIO') as convenioNome,
          SUM(fu.valorFaturado) as valorFaturado,
          COUNT(DISTINCT fu.contaNumero) as totalContas
        FROM faturamento_unificado fu
        LEFT JOIN convenios c ON fu.convenioId = c.id
        WHERE fu.estabelecimentoId = ${estabelecimentoId}
          AND YEAR(fu.dataExecucao) IN (${anoAtual}, ${anoAnterior})
        GROUP BY MONTH(fu.dataExecucao), YEAR(fu.dataExecucao), fu.convenioId, c.nome
        ORDER BY mes, ano DESC, valorFaturado DESC
      `;

      const [rows]: any[] = await db.execute(sql.raw(query));

      // Organizar dados por mês
      const mesesMap: Record<number, {
        mes: number,
        faturadoAtual: number,
        faturadoAnterior: number,
        contasAtual: number,
        contasAnterior: number,
        convenios: Array<{
          convenioId: number | null,
          convenioNome: string,
          faturadoAtual: number,
          faturadoAnterior: number,
          contasAtual: number,
          contasAnterior: number,
        }>
      }> = {};

      // Inicializar todos os meses (1-12)
      for (let m = 1; m <= 12; m++) {
        mesesMap[m] = {
          mes: m,
          faturadoAtual: 0,
          faturadoAnterior: 0,
          contasAtual: 0,
          contasAnterior: 0,
          convenios: [],
        };
      }

      // Map para agrupar por mês+convênio
      const convenioMap: Record<string, {
        convenioId: number | null,
        convenioNome: string,
        faturadoAtual: number,
        faturadoAnterior: number,
        contasAtual: number,
        contasAnterior: number,
      }> = {};

      for (const row of rows) {
        const mes = Number(row.mes);
        const ano = Number(row.ano);
        const convenioId = row.convenioId ? Number(row.convenioId) : null;
        const convenioNome = row.convenioNome || 'SEM CONVÊNIO';
        const valorFaturado = Number(row.valorFaturado) || 0;
        const totalContas = Number(row.totalContas) || 0;

        const key = `${mes}-${convenioId}`;

        if (!convenioMap[key]) {
          convenioMap[key] = {
            convenioId,
            convenioNome,
            faturadoAtual: 0,
            faturadoAnterior: 0,
            contasAtual: 0,
            contasAnterior: 0,
          };
        }

        if (ano === anoAtual) {
          convenioMap[key].faturadoAtual = valorFaturado;
          convenioMap[key].contasAtual = totalContas;
          mesesMap[mes].faturadoAtual += valorFaturado;
          mesesMap[mes].contasAtual += totalContas;
        } else {
          convenioMap[key].faturadoAnterior = valorFaturado;
          convenioMap[key].contasAnterior = totalContas;
          mesesMap[mes].faturadoAnterior += valorFaturado;
          mesesMap[mes].contasAnterior += totalContas;
        }
      }

      // Distribuir convênios nos meses
      for (const [key, conv] of Object.entries(convenioMap)) {
        const mes = Number(key.split('-')[0]);
        // Só incluir se tem dados em pelo menos um dos anos
        if (conv.faturadoAtual > 0 || conv.faturadoAnterior > 0) {
          mesesMap[mes].convenios.push(conv);
        }
      }

      // Ordenar convênios por valor faturado (maior primeiro)
      for (const mes of Object.values(mesesMap)) {
        mes.convenios.sort((a, b) => (b.faturadoAtual || b.faturadoAnterior) - (a.faturadoAtual || a.faturadoAnterior));
      }

      // Filtrar meses que têm dados
      const resultado = Object.values(mesesMap)
        .filter(m => m.faturadoAtual > 0 || m.faturadoAnterior > 0)
        .sort((a, b) => a.mes - b.mes);

      return {
        anoAtual,
        anoAnterior,
        meses: resultado,
      };
    }),

  /**
   * Exportar dados do comparativo para Excel (retorna dados formatados)
   */
  getExportData: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      anoAtual: z.number().min(2020).max(2030).default(2026),
      anoAnterior: z.number().min(2019).max(2029).default(2025),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { estabelecimentoId, anoAtual, anoAnterior } = input;

      const query = `
        SELECT 
          MONTH(fu.dataExecucao) as mes,
          YEAR(fu.dataExecucao) as ano,
          fu.convenioId,
          COALESCE(c.nome, 'SEM CONVÊNIO') as convenioNome,
          SUM(fu.valorFaturado) as valorFaturado,
          COUNT(DISTINCT fu.contaNumero) as totalContas
        FROM faturamento_unificado fu
        LEFT JOIN convenios c ON fu.convenioId = c.id
        WHERE fu.estabelecimentoId = ${estabelecimentoId}
          AND YEAR(fu.dataExecucao) IN (${anoAtual}, ${anoAnterior})
        GROUP BY MONTH(fu.dataExecucao), YEAR(fu.dataExecucao), fu.convenioId, c.nome
        ORDER BY mes, convenioNome, ano DESC
      `;

      const [rows]: any[] = await db.execute(sql.raw(query));

      // Formatar para exportação em linhas planas
      const nomesMeses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

      // Agrupar por mês + convênio
      const exportMap: Record<string, {
        mes: number,
        mesNome: string,
        convenioNome: string,
        faturadoAtual: number,
        faturadoAnterior: number,
        contasAtual: number,
        contasAnterior: number,
      }> = {};

      for (const row of rows) {
        const mes = Number(row.mes);
        const ano = Number(row.ano);
        const convenioNome = row.convenioNome || 'SEM CONVÊNIO';
        const key = `${mes}-${convenioNome}`;

        if (!exportMap[key]) {
          exportMap[key] = {
            mes,
            mesNome: nomesMeses[mes],
            convenioNome,
            faturadoAtual: 0,
            faturadoAnterior: 0,
            contasAtual: 0,
            contasAnterior: 0,
          };
        }

        if (ano === anoAtual) {
          exportMap[key].faturadoAtual = Number(row.valorFaturado) || 0;
          exportMap[key].contasAtual = Number(row.totalContas) || 0;
        } else {
          exportMap[key].faturadoAnterior = Number(row.valorFaturado) || 0;
          exportMap[key].contasAnterior = Number(row.totalContas) || 0;
        }
      }

      const exportRows = Object.values(exportMap)
        .filter(r => r.faturadoAtual > 0 || r.faturadoAnterior > 0)
        .sort((a, b) => a.mes - b.mes || a.convenioNome.localeCompare(b.convenioNome));

      return {
        anoAtual,
        anoAnterior,
        rows: exportRows,
      };
    }),
});
