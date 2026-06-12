import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { buscarTotaisFaturamentoExterno } from "../faturamentoExterno";

/**
 * Relatório Comparativo Mês a Mês
 * Compara faturamento do ano atual vs ano anterior, agrupado por mês e convênio
 * Fonte de dados: integ_faturado (Warleine/Tasy) + faturamento_externo
 * Mostra: Faturado Ano Atual, Faturado Ano Anterior, Variação %, Contas Ano Atual, Contas Ano Anterior
 */

function parseValor(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

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

      const prefixoAtual = `${anoAtual}/`;
      const prefixoAnterior = `${anoAnterior}/`;

      // Query para buscar dados agrupados por mês e convênio para ambos os anos
      // Fonte: integ_faturado (Warleine/Tasy)
      const query = `
        SELECT 
          SUBSTRING(TRIM(mesprod), 6, 2) as mes,
          SUBSTRING(TRIM(mesprod), 1, 4) as ano,
          COALESCE(TRIM(nomeconv), 'SEM CONVÊNIO') as convenioNome,
          COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as valorFaturado,
          COUNT(DISTINCT numconta) as totalContas
        FROM integ_faturado
        WHERE estabelecimento_id = ${estabelecimentoId}
          AND (TRIM(mesprod) LIKE '${prefixoAtual}%' OR TRIM(mesprod) LIKE '${prefixoAnterior}%')
          AND vl_faturado IS NOT NULL
          AND vl_faturado != ''
        GROUP BY SUBSTRING(TRIM(mesprod), 6, 2), SUBSTRING(TRIM(mesprod), 1, 4), COALESCE(TRIM(nomeconv), 'SEM CONVÊNIO')
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
        const convenioNome = (row.convenioNome || 'SEM CONVÊNIO').trim();
        const valorFaturado = parseValor(row.valorFaturado);
        const totalContas = Number(row.totalContas) || 0;

        if (!mes || mes < 1 || mes > 12) continue;

        const key = `${mes}-${convenioNome}`;

        if (!convenioMap[key]) {
          convenioMap[key] = {
            convenioId: null,
            convenioNome,
            faturadoAtual: 0,
            faturadoAnterior: 0,
            contasAtual: 0,
            contasAnterior: 0,
          };
        }

        if (ano === anoAtual) {
          convenioMap[key].faturadoAtual += valorFaturado;
          convenioMap[key].contasAtual += totalContas;
          mesesMap[mes].faturadoAtual += valorFaturado;
          mesesMap[mes].contasAtual += totalContas;
        } else {
          convenioMap[key].faturadoAnterior += valorFaturado;
          convenioMap[key].contasAnterior += totalContas;
          mesesMap[mes].faturadoAnterior += valorFaturado;
          mesesMap[mes].contasAnterior += totalContas;
        }
      }

      // Incluir dados de faturamento_externo (agrupados por mês, sem convênio individual)
      try {
        const externoMesesAtual = await buscarTotaisFaturamentoExterno(estabelecimentoId, anoAtual);
        for (const ext of externoMesesAtual) {
          const mesNum = ext.mesNum ? Number(ext.mesNum) : 0;
          if (mesNum < 1 || mesNum > 12) continue;
          mesesMap[mesNum].faturadoAtual += ext.totalFaturado || 0;
        }

        const externoMesesAnterior = await buscarTotaisFaturamentoExterno(estabelecimentoId, anoAnterior);
        for (const ext of externoMesesAnterior) {
          const mesNum = ext.mesNum ? Number(ext.mesNum) : 0;
          if (mesNum < 1 || mesNum > 12) continue;
          mesesMap[mesNum].faturadoAnterior += ext.totalFaturado || 0;
        }
      } catch { /* sem dados externos */ }

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

      const prefixoAtual = `${anoAtual}/`;
      const prefixoAnterior = `${anoAnterior}/`;

      const query = `
        SELECT 
          SUBSTRING(TRIM(mesprod), 6, 2) as mes,
          SUBSTRING(TRIM(mesprod), 1, 4) as ano,
          COALESCE(TRIM(nomeconv), 'SEM CONVÊNIO') as convenioNome,
          COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as valorFaturado,
          COUNT(DISTINCT numconta) as totalContas
        FROM integ_faturado
        WHERE estabelecimento_id = ${estabelecimentoId}
          AND (TRIM(mesprod) LIKE '${prefixoAtual}%' OR TRIM(mesprod) LIKE '${prefixoAnterior}%')
          AND vl_faturado IS NOT NULL
          AND vl_faturado != ''
        GROUP BY SUBSTRING(TRIM(mesprod), 6, 2), SUBSTRING(TRIM(mesprod), 1, 4), COALESCE(TRIM(nomeconv), 'SEM CONVÊNIO')
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
        const convenioNome = (row.convenioNome || 'SEM CONVÊNIO').trim();
        const key = `${mes}-${convenioNome}`;

        if (!exportMap[key]) {
          exportMap[key] = {
            mes,
            mesNome: nomesMeses[mes] || '',
            convenioNome,
            faturadoAtual: 0,
            faturadoAnterior: 0,
            contasAtual: 0,
            contasAnterior: 0,
          };
        }

        if (ano === anoAtual) {
          exportMap[key].faturadoAtual += parseValor(row.valorFaturado);
          exportMap[key].contasAtual += Number(row.totalContas) || 0;
        } else {
          exportMap[key].faturadoAnterior += parseValor(row.valorFaturado);
          exportMap[key].contasAnterior += Number(row.totalContas) || 0;
        }
      }

      // Nota: faturamento_externo não tem detalhamento por convênio com mês,
      // então não é incluído na exportação por convênio

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
