import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * Relatório de Fisioterapia - Ox UTI
 * Lista pacientes pagos no demonstrativo para códigos de fisioterapia:
 * - 20103093: Atendimento Fisiátrico No Pré E Pós-Operatório
 * - 20203047: Assistência Fisiátrica Respiratória Em Doente Clínico Internado
 * 
 * IMPORTANTE: O agrupamento por mês usa data_referencia (data do demonstrativo/pagamento),
 * NÃO data_execucao (data em que o procedimento foi realizado).
 */

const CODIGOS_FISIOTERAPIA = ['20103093', '20203047'];

export const relatorioFisioterapiaRouter = router({
  /**
   * Buscar dados do relatório de fisioterapia
   * Retorna pacientes pagos agrupados por guia/paciente com detalhes por dia
   */
  getDados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      mesAno: z.string().regex(/^\d{4}-\d{2}$/, "Formato deve ser YYYY-MM").optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { estabelecimentoId, mesAno } = input;

      let whereClause = `re.estabelecimentoId = ${estabelecimentoId} AND re.item IN ('20103093', '20203047') AND COALESCE(re.valor_pagamento, 0) > 0`;
      
      if (mesAno) {
        // Filtrar pela data_referencia (data do demonstrativo), não data_execucao
        whereClause += ` AND DATE_FORMAT(re.data_referencia, '%Y-%m') = '${mesAno}'`;
      }

      // Buscar dados detalhados
      const query = `
        SELECT 
          re.numero_guia as numeroGuia,
          re.nome_beneficiario as paciente,
          re.item as codigoItem,
          re.item_desc as descricaoItem,
          re.data_execucao as dataExecucao,
          re.data_referencia as dataReferencia,
          COALESCE(re.valor_pagamento, 0) as valorPago,
          COALESCE(re.quantidade, 0) as quantidade,
          re.situacao_item as situacao
        FROM recebimentos_excel re
        WHERE ${whereClause}
        ORDER BY re.nome_beneficiario, re.data_execucao, re.item
      `;

      const [rows] = await db.execute(sql.raw(query));
      const itens = rows as any[];

      // Agrupar por paciente
      const pacientesMap = new Map<string, {
        paciente: string;
        numeroGuia: string;
        totalPago: number;
        totalSessoes: number;
        itens: any[];
        dataInicio: string | null;
        dataFim: string | null;
      }>();

      for (const item of itens) {
        const key = `${item.paciente}|${item.numeroGuia}`;
        if (!pacientesMap.has(key)) {
          pacientesMap.set(key, {
            paciente: item.paciente,
            numeroGuia: item.numeroGuia,
            totalPago: 0,
            totalSessoes: 0,
            itens: [],
            dataInicio: null,
            dataFim: null,
          });
        }
        const pac = pacientesMap.get(key)!;
        const valorPago = Number(item.valorPago) || 0;
        const quantidade = Number(item.quantidade) || 1;
        pac.totalPago += valorPago;
        pac.totalSessoes += quantidade;
        pac.itens.push({
          codigoItem: item.codigoItem,
          descricaoItem: item.descricaoItem,
          dataExecucao: item.dataExecucao,
          dataReferencia: item.dataReferencia,
          valorPago,
          quantidade,
          situacao: item.situacao,
        });

        const dataStr = item.dataExecucao ? String(item.dataExecucao).slice(0, 10) : null;
        if (dataStr) {
          if (!pac.dataInicio || dataStr < pac.dataInicio) pac.dataInicio = dataStr;
          if (!pac.dataFim || dataStr > pac.dataFim) pac.dataFim = dataStr;
        }
      }

      const pacientes = Array.from(pacientesMap.values()).sort((a, b) => 
        a.paciente.localeCompare(b.paciente)
      );

      // Resumo geral
      const totalGeralPago = pacientes.reduce((sum, p) => sum + p.totalPago, 0);
      const totalGeralSessoes = pacientes.reduce((sum, p) => sum + p.totalSessoes, 0);

      return {
        pacientes,
        resumo: {
          totalPacientes: pacientes.length,
          totalGeralPago,
          totalGeralSessoes,
          totalRegistros: itens.length,
        },
      };
    }),

  /**
   * Buscar meses disponíveis para o filtro
   * Usa data_referencia (data do demonstrativo) para agrupar por mês
   */
  getMesesDisponiveis: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { estabelecimentoId } = input;

      const query = `
        SELECT 
          DATE_FORMAT(data_referencia, '%Y-%m') as mes,
          COUNT(*) as qtd,
          SUM(valor_pagamento) as totalPago,
          COUNT(DISTINCT nome_beneficiario) as pacientes
        FROM recebimentos_excel
        WHERE estabelecimentoId = ${estabelecimentoId}
          AND item IN ('20103093', '20203047')
          AND COALESCE(valor_pagamento, 0) > 0
        GROUP BY DATE_FORMAT(data_referencia, '%Y-%m')
        ORDER BY mes DESC
      `;

      const [rows] = await db.execute(sql.raw(query));
      return (rows as any[]).map(r => ({
        mes: r.mes,
        qtd: Number(r.qtd),
        totalPago: Number(r.totalPago),
        pacientes: Number(r.pacientes),
      }));
    }),

  /**
   * Exportar dados para Excel (retorna dados formatados para download)
   * Usa data_referencia para filtrar por mês
   */
  exportarExcel: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      mesAno: z.string().regex(/^\d{4}-\d{2}$/, "Formato deve ser YYYY-MM").optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { estabelecimentoId, mesAno } = input;

      let whereClause = `re.estabelecimentoId = ${estabelecimentoId} AND re.item IN ('20103093', '20203047') AND COALESCE(re.valor_pagamento, 0) > 0`;
      
      if (mesAno) {
        whereClause += ` AND DATE_FORMAT(re.data_referencia, '%Y-%m') = '${mesAno}'`;
      }

      const query = `
        SELECT 
          re.nome_beneficiario as paciente,
          re.numero_guia as numeroGuia,
          re.item as codigoItem,
          re.item_desc as descricaoItem,
          DATE_FORMAT(re.data_execucao, '%d/%m/%Y') as dataExecucao,
          DATE_FORMAT(re.data_referencia, '%d/%m/%Y') as dataReferencia,
          COALESCE(re.quantidade, 0) as quantidade,
          COALESCE(re.valor_pagamento, 0) as valorPago,
          re.situacao_item as situacao
        FROM recebimentos_excel re
        WHERE ${whereClause}
        ORDER BY re.nome_beneficiario, re.data_execucao, re.item
      `;

      const [rows] = await db.execute(sql.raw(query));
      return rows as any[];
    }),
});
