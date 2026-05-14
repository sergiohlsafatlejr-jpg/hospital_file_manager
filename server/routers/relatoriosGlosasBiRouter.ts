import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";

// Dicionário TISS de motivos de glosa (principais códigos)
const MOTIVOS_GLOSA: Record<string, string> = {
  "12": "Procedimento não coberto pelo plano",
  "13": "Procedimento não autorizado",
  "14": "Procedimento fora do prazo",
  "15": "Documentação incompleta",
  "16": "Beneficiário sem cobertura",
  "17": "Carência não cumprida",
  "18": "Limite de utilização excedido",
  "19": "Procedimento duplicado",
  "20": "Código de procedimento incorreto",
  "21": "Quantidade acima do permitido",
  "22": "Valor acima da tabela",
  "23": "Solicitação de glosa administrativa",
  "24": "Falta de autorização prévia",
  "25": "Beneficiário não identificado",
  "26": "Prestador não credenciado",
  "27": "Divergência de dados cadastrais",
  "28": "Guia não localizada",
  "29": "Procedimento não compatível com CID",
  "30": "Número de guia inválido",
  "31": "Data de atendimento inválida",
  "32": "Incompatibilidade de sexo",
  "33": "Incompatibilidade de idade",
  "34": "Procedimento experimental",
  "35": "Falta de laudo médico",
  "36": "Código TUSS inválido",
  "37": "Quantidade de diárias excedida",
  "38": "Cobrança de material sem autorização",
  "39": "Cobrança de medicamento sem autorização",
  "40": "Valor de honorário acima do contratado",
  "41": "Procedimento não realizado",
  "42": "Cobrança em duplicidade",
  "43": "Prazo de recurso expirado",
  "44": "Glosa técnica",
  "45": "Glosa por auditoria",
  "46": "Inconsistência no faturamento",
  "47": "Falta de relatório médico",
  "48": "Procedimento não compatível com especialidade",
  "49": "Cobrança de OPME sem autorização",
  "50": "Divergência de valores",
};

function getMotivoDescricao(codigo: string | null): string {
  if (!codigo) return "Sem motivo - GLOSADO";
  const codigos = codigo.split(/[,;|\/]/).map(c => c.trim());
  const descricoes = codigos.map(c => {
    const desc = MOTIVOS_GLOSA[c];
    return desc ? `${c} - ${desc}` : c;
  });
  return descricoes.join("; ");
}

// Categorias de glosa para filtro
const CATEGORIAS_GLOSA: Record<string, string[]> = {
  "Elegibilidade": ["16", "17", "25", "27", "32", "33"],
  "Autorização": ["13", "14", "24", "28", "30", "31"],
  "Valorização": ["22", "40", "50"],
  "Cobrança": ["19", "21", "42", "46"],
  "Documentação": ["15", "35", "47"],
  "Técnica": ["29", "34", "44", "45", "48"],
  "Administrativa": ["12", "18", "20", "23", "26", "36", "37", "38", "39", "41", "43", "49"],
};

export const relatoriosGlosasBiRouter = router({
  // KPIs gerais
  kpis: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(), // YYYY/MM
      competenciaFim: z.string().optional(),    // YYYY/MM
      tipoLancamento: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [];
        let where = "WHERE 1=1";
        // estabId=0 significa 'Todos os Estabelecimentos'
        if (input.estabelecimentoId > 0) {
          where += " AND d.estabelecimentoId = ?";
          params.push(input.estabelecimentoId);
        }
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
        if (input.tipoLancamento) {
          where += " AND d.tipo_lancamento = ?";
          params.push(input.tipoLancamento);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            COUNT(*) as total_itens,
            SUM(CASE WHEN d.valor_glosa > 0 THEN 1 ELSE 0 END) as total_glosados,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            COUNT(DISTINCT d.numero_guia) as total_guias,
            COUNT(DISTINCT CASE WHEN d.valor_glosa > 0 THEN d.numero_guia END) as guias_com_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado,
            SUM(CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado') THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_em_recurso,
            SUM(CASE WHEN d.classificacao_glosa = 'pendente' AND d.valor_glosa > 0 THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_pendente_analise
          FROM demonstrativo d
          ${where}
        `, params);

        // Buscar Valor Cobrado do faturamento_tiss (XML enviado)
        const tissParams: any[] = [];
        let tissWhere = "WHERE 1=1";
        if (input.estabelecimentoId > 0) {
          tissWhere += " AND estabelecimentoId = ?";
          tissParams.push(input.estabelecimentoId);
        }
        if (input.convenioId) {
          tissWhere += " AND convenioId = ?";
          tissParams.push(input.convenioId);
        }
        if (input.competenciaInicio && input.competenciaFim) {
          // Intervalo: >= inicio AND <= fim
          tissWhere += " AND competencia >= ? AND competencia <= ?";
          tissParams.push(input.competenciaInicio, input.competenciaFim);
        } else if (input.competenciaInicio) {
          // Competência exata: = competenciaInicio
          tissWhere += " AND competencia = ?";
          tissParams.push(input.competenciaInicio);
        }
        const [tissRows] = await conn.execute<any[]>(`
          SELECT SUM(CAST(valor_faturado AS DECIMAL(12,2))) as total_faturado
          FROM faturamento_tiss
          ${tissWhere}
        `, tissParams);
        const totalFaturadoTiss = Number(tissRows[0]?.total_faturado || 0);

        const kpi = rows[0];
        // Taxa de glosa: glosado / cobrado (XML). Fallback: glosado / (pago + glosado)
        const baseTaxa = totalFaturadoTiss > 0
          ? totalFaturadoTiss
          : (Number(kpi.total_pago) + Number(kpi.total_glosa));
        const taxaGlosa = baseTaxa > 0
          ? (Number(kpi.total_glosa) / baseTaxa) * 100
          : 0;
        const ticketMedioGlosa = kpi.total_glosados > 0
          ? Number(kpi.total_glosa) / Number(kpi.total_glosados)
          : 0;
        const taxaRecuperacao = kpi.total_glosa > 0
          ? (Number(kpi.total_recuperado) / Number(kpi.total_glosa)) * 100
          : 0;

        return {
          totalItens: Number(kpi.total_itens),
          totalGlosados: Number(kpi.total_glosados),
          totalInformado: totalFaturadoTiss > 0 ? totalFaturadoTiss : Number(kpi.total_pago) + Number(kpi.total_glosa),
          totalFaturadoTiss,
          totalPago: Number(kpi.total_pago),
          totalGlosa: Number(kpi.total_glosa),
          totalGuias: Number(kpi.total_guias),
          guiasComGlosa: Number(kpi.guias_com_glosa),
          totalRecuperado: Number(kpi.total_recuperado),
          totalEmRecurso: Number(kpi.total_em_recurso),
          totalPendenteAnalise: Number(kpi.total_pendente_analise),
          taxaGlosa: Number(taxaGlosa.toFixed(2)),
          ticketMedioGlosa: Number(ticketMedioGlosa.toFixed(2)),
          taxaRecuperacao: Number(taxaRecuperacao.toFixed(2)),
        };
      } finally {
        await conn.end();
      }
    }),

  // Tendência mensal de glosas
  tendenciaMensal: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      meses: z.number().default(12),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        // Dados do demonstrativo (pago, glosado) por competência
        const demoParams: any[] = [];
        let demoWhere = "WHERE 1=1";
        if (input.estabelecimentoId > 0) {
          demoWhere += " AND d.estabelecimentoId = ?";
          demoParams.push(input.estabelecimentoId);
        }
        if (input.convenioId) {
          demoWhere += " AND d.convenio_id = ?";
          demoParams.push(input.convenioId);
        }
        const mesesLimite = Math.max(1, Math.min(60, Number(input.meses) || 12));
        const [demoRows] = await conn.execute<any[]>(`
          SELECT
            DATE_FORMAT(d.data_referencia, '%Y/%m') as competencia,
            COUNT(CASE WHEN d.valor_glosa > 0 THEN 1 END) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            COUNT(DISTINCT d.numero_guia) as total_guias
          FROM demonstrativo d
          ${demoWhere}
          AND d.data_referencia IS NOT NULL
          GROUP BY DATE_FORMAT(d.data_referencia, '%Y/%m')
          ORDER BY competencia DESC
          LIMIT ${mesesLimite}
        `, demoParams);;

        // Dados do faturamento_tiss (cobrado) por competência
        const tissParams: any[] = [];
        let tissWhere = "WHERE 1=1";
        if (input.estabelecimentoId > 0) {
          tissWhere += " AND estabelecimentoId = ?";
          tissParams.push(input.estabelecimentoId);
        }
        if (input.convenioId) {
          tissWhere += " AND convenioId = ?";
          tissParams.push(input.convenioId);
        }
        const [tissRows] = await conn.execute<any[]>(`
          SELECT
            competencia,
            SUM(CAST(valor_faturado AS DECIMAL(12,2))) as total_faturado
          FROM faturamento_tiss
          ${tissWhere}
          GROUP BY competencia
          ORDER BY competencia DESC
        `, tissParams);

        // Mapear faturamento TISS por competência
        const tissMap: Record<string, number> = {};
        for (const r of tissRows) {
          tissMap[r.competencia] = Number(r.total_faturado || 0);
        }

        return demoRows.map(r => {
          const cobrado = tissMap[r.competencia] || 0;
          const glosa = Number(r.total_glosa);
          const pago = Number(r.total_pago);
          const base = cobrado > 0 ? cobrado : pago + glosa;
          return {
            competencia: r.competencia,
            totalGlosados: Number(r.total_glosados),
            totalInformado: cobrado > 0 ? cobrado : pago + glosa,
            totalGlosa: glosa,
            totalPago: pago,
            totalGuias: Number(r.total_guias),
            taxaGlosa: base > 0
              ? Number(((glosa / base) * 100).toFixed(2))
              : 0,
          };
        }).reverse();
      } finally {
        await conn.end();
      }
    }),

  // Glosas por convênio
  porConvenio: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0";
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            c.nome as convenio,
            d.convenio_id,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          ${where}
          GROUP BY d.convenio_id, c.nome
          ORDER BY total_glosa DESC
        `, params);

        return rows.map(r => ({
          convenio: r.convenio || `Convênio ${r.convenio_id}`,
          convenioId: r.convenio_id,
          totalGlosados: Number(r.total_glosados),
          totalInformado: Number(r.total_informado),
          totalGlosa: Number(r.total_glosa),
          totalRecuperado: Number(r.total_recuperado),
          taxaGlosa: r.total_informado > 0
            ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
            : 0,
        }));
      } finally {
        await conn.end();
      }
    }),

  // Glosas por código (motivo)
  porCodigo: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
      limite: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [];
        let where = "WHERE d.valor_glosa > 0";
        if (input.estabelecimentoId > 0) {
          where += " AND d.estabelecimentoId = ?";
          params.push(input.estabelecimentoId);
        }
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
         const limite = Math.max(1, Math.min(100, Number(input.limite) || 20));
        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.codigo_glosa, 'Sem código') as codigo_glosa,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado
          FROM demonstrativo d
          ${where}
          GROUP BY d.codigo_glosa
          ORDER BY total_glosa DESC
          LIMIT ${limite}
        `, params);

        return rows.map(r => ({
          codigoGlosa: r.codigo_glosa,
          descricao: getMotivoDescricao(r.codigo_glosa === 'Sem código' ? null : r.codigo_glosa),
          totalGlosados: Number(r.total_glosados),
          totalGlosa: Number(r.total_glosa),
          totalRecuperado: Number(r.total_recuperado),
          taxaRecuperacao: r.total_glosa > 0
            ? Number(((Number(r.total_recuperado) / Number(r.total_glosa)) * 100).toFixed(2))
            : 0,
        }));
      } finally {
        await conn.end();
      }
    }),

  // Glosas por tipo de lançamento
  porTipoLancamento: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.tipo_lancamento, 'Não informado') as tipo_lancamento,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
          FROM demonstrativo d
          ${where}
          GROUP BY d.tipo_lancamento
          ORDER BY total_glosa DESC
        `, params);

        return rows.map(r => ({
          tipoLancamento: r.tipo_lancamento,
          totalGlosados: Number(r.total_glosados),
          totalInformado: Number(r.total_informado),
          totalGlosa: Number(r.total_glosa),
          taxaGlosa: r.total_informado > 0
            ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
            : 0,
        }));
      } finally {
        await conn.end();
      }
    }),

  // Status de recurso de glosa
  statusRecurso: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.recurso_status, 'sem_recurso') as recurso_status,
            COUNT(*) as total,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
          FROM demonstrativo d
          ${where}
          GROUP BY d.recurso_status
          ORDER BY total_glosa DESC
        `, params);

        const statusLabel: Record<string, string> = {
          'sem_recurso': 'Sem Recurso',
          'recurso_criado': 'Recurso Criado',
          'recurso_enviado': 'Recurso Enviado',
          'recurso_deferido': 'Recurso Deferido',
          'recurso_indeferido': 'Recurso Indeferido',
        };

        return rows.map(r => ({
          status: r.recurso_status,
          label: statusLabel[r.recurso_status] || r.recurso_status,
          total: Number(r.total),
          totalGlosa: Number(r.total_glosa),
        }));
      } finally {
        await conn.end();
      }
    }),

  // Top itens mais glosados (por código de procedimento)
  topItensGlosados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
      limite: z.number().default(15),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
        const limiteItem = Math.max(1, Math.min(200, Number(input.limite) || 20));
        const [rows] = await conn.execute<any[]>(`
          SELECT
            d.codigo_item,
            d.descricao_item,
            d.tipo_lancamento,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            AVG(CAST(d.valor_glosa AS DECIMAL(12,2))) as ticket_medio_glosa
          FROM demonstrativo d
          ${where}
          GROUP BY d.codigo_item, d.descricao_item, d.tipo_lancamento
          ORDER BY total_glosa DESC
          LIMIT ${limiteItem}
        `, params);;

        return rows.map(r => ({
          codigoItem: r.codigo_item,
          descricaoItem: r.descricao_item,
          tipoLancamento: r.tipo_lancamento,
          totalGlosados: Number(r.total_glosados),
          totalGlosa: Number(r.total_glosa),
          totalInformado: Number(r.total_informado),
          ticketMedioGlosa: Number(Number(r.ticket_medio_glosa).toFixed(2)),
          taxaGlosa: r.total_informado > 0
            ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
            : 0,
        }));
      } finally {
        await conn.end();
      }
    }),

  // Recursos de glosa integrados (cruzando demonstrativo com recursosGlosa)
  recursosIntegrados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
      status: z.string().optional(), // 'pendente', 'recurso_criado', 'recurso_enviado', 'recurso_deferido', 'recurso_indeferido'
      limite: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
        if (input.status) {
          if (input.status === 'pendente') {
            where += " AND (d.recurso_status IS NULL OR d.recurso_status = 'sem_recurso')";
          } else {
            where += " AND d.recurso_status = ?";
            params.push(input.status);
          }
        }

        // Count total
        const countParams = [...params];
        const [countRows] = await conn.execute<any[]>(`
          SELECT COUNT(*) as total FROM demonstrativo d ${where}
        `, countParams);
        const total = Number(countRows[0].total);

        const limitePag = Math.max(1, Math.min(200, Number(input.limite) || 50));
        const offsetPag = Math.max(0, Number(input.offset) || 0);
        const [rows] = await conn.execute<any[]>(`
          SELECT
            d.id,
            d.numero_guia,
            d.nome_beneficiario,
            d.carteira_beneficiario,
            d.codigo_item,
            d.descricao_item,
            d.tipo_lancamento,
            d.valor_informado,
            d.valor_pago,
            d.valor_glosa,
            d.codigo_glosa,
            d.situacao_item,
            d.recurso_status,
            d.recurso_id,
            d.classificacao_glosa,
            d.data_referencia,
            d.data_execucao,
            c.nome as convenio_nome,
            rg.status as recurso_status_detalhe,
            rg.justificativaRecurso,
            rg.protocoloRecurso,
            rg.dataEnvioRecurso,
            rg.dataPrazoResposta,
            rg.respostaConvenio
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          LEFT JOIN recursosGlosa rg ON rg.id = d.recurso_id
          ${where}
          ORDER BY d.valor_glosa DESC
          LIMIT ${limitePag} OFFSET ${offsetPag}
        `, params);

        return {
          total,
          items: rows.map(r => ({
            id: r.id,
            numeroGuia: r.numero_guia,
            nomeBeneficiario: r.nome_beneficiario,
            carteiraBeneficiario: r.carteira_beneficiario,
            codigoItem: r.codigo_item,
            descricaoItem: r.descricao_item,
            tipoLancamento: r.tipo_lancamento,
            valorInformado: Number(r.valor_informado || 0),
            valorPago: Number(r.valor_pago || 0),
            valorGlosa: Number(r.valor_glosa || 0),
            codigoGlosa: r.codigo_glosa,
            descricaoGlosa: getMotivoDescricao(r.codigo_glosa),
            situacaoItem: r.situacao_item,
            recursoStatus: r.recurso_status,
            recursoId: r.recurso_id,
            classificacaoGlosa: r.classificacao_glosa,
            dataReferencia: r.data_referencia,
            dataExecucao: r.data_execucao,
            convenioNome: r.convenio_nome,
            recursoDetalhe: r.recurso_id ? {
              status: r.recurso_status_detalhe,
              justificativa: r.justificativaRecurso,
              protocolo: r.protocoloRecurso,
              dataEnvio: r.dataEnvioRecurso,
              dataPrazo: r.dataPrazoResposta,
              resposta: r.respostaConvenio,
            } : null,
          })),
        };
      } finally {
        await conn.end();
      }
    }),

  // Análise por setor/tipo de lançamento com detalhamento
  analisePorSetor: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ?";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.tipo_lancamento, 'Não informado') as setor,
            COUNT(*) as total_itens,
            SUM(CASE WHEN d.valor_glosa > 0 THEN 1 ELSE 0 END) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado
          FROM demonstrativo d
          ${where}
          GROUP BY d.tipo_lancamento
          ORDER BY total_glosa DESC
        `, params);

        return rows.map(r => ({
          setor: r.setor,
          totalItens: Number(r.total_itens),
          totalGlosados: Number(r.total_glosados),
          totalInformado: Number(r.total_informado),
          totalPago: Number(r.total_pago),
          totalGlosa: Number(r.total_glosa),
          totalRecuperado: Number(r.total_recuperado),
          taxaGlosa: r.total_informado > 0
            ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
            : 0,
          taxaRecuperacao: r.total_glosa > 0
            ? Number(((Number(r.total_recuperado) / Number(r.total_glosa)) * 100).toFixed(2))
            : 0,
        }));
      } finally {
        await conn.end();
      }
    }),

  // Padrões de glosa por convênio ao longo do tempo
  padroesPorConvenio: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number(),
      meses: z.number().default(6),
    }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const [rows] = await conn.execute<any[]>(`
          SELECT
            DATE_FORMAT(d.data_referencia, '%Y/%m') as competencia,
            COALESCE(d.codigo_glosa, 'Sem código') as codigo_glosa,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
          FROM demonstrativo d
          WHERE d.estabelecimentoId = ? AND d.convenio_id = ? AND d.valor_glosa > 0
          GROUP BY DATE_FORMAT(d.data_referencia, '%Y/%m'), d.codigo_glosa
          ORDER BY competencia DESC, total_glosa DESC
          LIMIT ${Math.max(1, Math.min(5000, Number(input.meses) * 20 || 240))}
        `, [input.estabelecimentoId, input.convenioId]);

        // Agrupar por competência
        const porCompetencia: Record<string, any[]> = {};
        for (const r of rows) {
          if (!porCompetencia[r.competencia]) porCompetencia[r.competencia] = [];
          porCompetencia[r.competencia].push({
            codigoGlosa: r.codigo_glosa,
            descricao: getMotivoDescricao(r.codigo_glosa === 'Sem código' ? null : r.codigo_glosa),
            totalGlosados: Number(r.total_glosados),
            totalGlosa: Number(r.total_glosa),
          });
        }

        return Object.entries(porCompetencia)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([competencia, codigos]) => ({ competencia, codigos }));
      } finally {
        await conn.end();
      }
    }),

  // Filtros disponíveis
  filtros: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const estabFilter = input.estabelecimentoId > 0 ? "AND d.estabelecimentoId = ?" : "";
        const estabParams = input.estabelecimentoId > 0 ? [input.estabelecimentoId] : [];

        const [convenios] = await conn.execute<any[]>(`
          SELECT DISTINCT c.id, c.nome
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          WHERE d.valor_glosa > 0 AND c.id IS NOT NULL ${estabFilter}
          ORDER BY c.nome
        `, estabParams);

        const [competencias] = await conn.execute<any[]>(`
          SELECT DISTINCT DATE_FORMAT(data_referencia, '%Y/%m') as competencia
          FROM demonstrativo
          WHERE valor_glosa > 0 ${input.estabelecimentoId > 0 ? 'AND estabelecimentoId = ?' : ''}
          ORDER BY competencia DESC
        `, estabParams);

        const [tipos] = await conn.execute<any[]>(`
          SELECT DISTINCT tipo_lancamento
          FROM demonstrativo
          WHERE valor_glosa > 0 AND tipo_lancamento IS NOT NULL AND tipo_lancamento != '' ${input.estabelecimentoId > 0 ? 'AND estabelecimentoId = ?' : ''}
          ORDER BY tipo_lancamento
        `, estabParams);

        return {
          convenios: convenios.map(c => ({ id: c.id, nome: c.nome })),
          competencias: competencias.map(c => c.competencia),
          tiposLancamento: tipos.map(t => t.tipo_lancamento),
          categoriasGlosa: Object.keys(CATEGORIAS_GLOSA),
        };
      } finally {
        await conn.end();
      }
    }),

  // IA: Análise de devolutivas por motivo de glosa com sugestões de melhoria
  analisarDevolutiva: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      codigoGlosa: z.string(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        // Buscar dados reais do demonstrativo para o código de glosa
        const params: any[] = [input.estabelecimentoId, input.codigoGlosa];
        let where = "WHERE d.estabelecimentoId = ? AND d.codigo_glosa = ?";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        if (input.competenciaInicio) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        const [dadosGlosa] = await conn.execute<any[]>(`
          SELECT
            COUNT(*) as total_ocorrencias,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_valor_glosado,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN 1 ELSE 0 END) as recursos_deferidos,
            SUM(CASE WHEN d.recurso_status = 'recurso_indeferido' THEN 1 ELSE 0 END) as recursos_indeferidos,
            SUM(CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado') THEN 1 ELSE 0 END) as recursos_em_andamento,
            GROUP_CONCAT(DISTINCT d.tipo_lancamento ORDER BY d.tipo_lancamento SEPARATOR ', ') as tipos_lancamento,
            GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ', ') as convenios_afetados,
            MIN(DATE_FORMAT(d.data_referencia, '%Y/%m')) as competencia_inicio,
            MAX(DATE_FORMAT(d.data_referencia, '%Y/%m')) as competencia_fim
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          ${where}
        `, params);

        // Buscar histórico de recursos bem-sucedidos para este código
        const [historicoBemSucedido] = await conn.execute<any[]>(`
          SELECT
            rg.justificativaRecurso,
            rg.respostaConvenio,
            rg.status,
            c.nome as convenio
          FROM recursosGlosa rg
          LEFT JOIN convenios c ON c.id = rg.convenioId
          WHERE rg.estabelecimentoId = ? AND rg.motivoGlosaConvenio LIKE ?
            AND rg.status = 'deferido'
          ORDER BY rg.updatedAt DESC
          LIMIT 5
        `, [input.estabelecimentoId, `%${input.codigoGlosa}%`]);

        // Buscar aprendizado de auditoria para este código
        const [aprendizado] = await conn.execute<any[]>(`
          SELECT dadosAprendizado, confianca, totalOcorrencias
          FROM aprendizado_auditoria
          WHERE estabelecimentoId = ? AND codigoItem = ? AND ativo = 1
          ORDER BY confianca DESC
          LIMIT 3
        `, [input.estabelecimentoId, input.codigoGlosa]);

        const kpi = dadosGlosa[0];
        const descricaoMotivo = getMotivoDescricao(input.codigoGlosa);

        // Montar contexto para a IA
        const contexto = `
Código de Glosa: ${input.codigoGlosa}
Descrição TISS: ${descricaoMotivo}
Total de Ocorrências: ${kpi.total_ocorrencias}
Valor Total Glosado: R$ ${Number(kpi.total_valor_glosado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Recursos Deferidos: ${kpi.recursos_deferidos || 0}
Recursos Indeferidos: ${kpi.recursos_indeferidos || 0}
Recursos em Andamento: ${kpi.recursos_em_andamento || 0}
Tipos de Lançamento Afetados: ${kpi.tipos_lancamento || 'Não informado'}
Convênios Afetados: ${kpi.convenios_afetados || 'Não informado'}
Período: ${kpi.competencia_inicio || 'N/A'} a ${kpi.competencia_fim || 'N/A'}

${historicoBemSucedido.length > 0 ? `Histórico de Recursos Deferidos (${historicoBemSucedido.length} casos):
${historicoBemSucedido.map((r, i) => `${i+1}. Convênio: ${r.convenio} | Justificativa: ${r.justificativaRecurso?.substring(0, 200) || 'N/A'}`).join('\n')}` : 'Sem histórico de recursos deferidos para este código.'}

${aprendizado.length > 0 ? `Aprendizado de IA disponível: ${aprendizado.length} padrões identificados.` : ''}
        `.trim();

        // Chamar IA para análise
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Você é um especialista em faturamento hospitalar e gestão de glosas de planos de saúde no Brasil. 
Analise os dados de glosa fornecidos e retorne uma análise estruturada em JSON com:
1. Diagnóstico do problema (causa raiz provável)
2. Impacto financeiro e operacional
3. Sugestões de melhoria de processo (ações preventivas)
4. Argumentos para recurso de glosa (baseados no histórico de sucesso)
5. Prioridade de ação (alta/média/baixa)
6. Estimativa de recuperabilidade (% do valor que pode ser recuperado via recurso)

Responda APENAS com JSON válido, sem markdown ou texto adicional.`,
            },
            {
              role: "user",
              content: `Analise os seguintes dados de glosa hospitalar:\n\n${contexto}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "analise_glosa",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  diagnostico: { type: "string", description: "Causa raiz provável do problema de glosa" },
                  impacto: { type: "string", description: "Impacto financeiro e operacional" },
                  sugestoesMelhoria: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de ações preventivas para reduzir este tipo de glosa"
                  },
                  argumentosRecurso: {
                    type: "array",
                    items: { type: "string" },
                    description: "Argumentos para usar no recurso de glosa"
                  },
                  prioridade: { type: "string", description: "alta, media ou baixa" },
                  estimativaRecuperabilidade: { type: "number", description: "Percentual estimado de recuperação (0-100)" },
                  resumoExecutivo: { type: "string", description: "Resumo executivo em 2-3 frases" },
                },
                required: ["diagnostico", "impacto", "sugestoesMelhoria", "argumentosRecurso", "prioridade", "estimativaRecuperabilidade", "resumoExecutivo"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        let analise: any;
        try {
          analise = typeof content === "string" ? JSON.parse(content) : content;
        } catch {
          analise = {
            diagnostico: "Não foi possível processar a análise automática.",
            impacto: `${kpi.total_ocorrencias} ocorrências com R$ ${Number(kpi.total_valor_glosado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} glosados.`,
            sugestoesMelhoria: ["Revisar processo de faturamento para este código", "Verificar documentação exigida pelo convênio"],
            argumentosRecurso: ["Contestar com base na prestação do serviço documentada"],
            prioridade: "media",
            estimativaRecuperabilidade: 30,
            resumoExecutivo: "Análise automática indisponível. Revisar manualmente.",
          };
        }

        return {
          codigoGlosa: input.codigoGlosa,
          descricaoMotivo,
          dados: {
            totalOcorrencias: Number(kpi.total_ocorrencias),
            totalValorGlosado: Number(kpi.total_valor_glosado || 0),
            recursosDeferidos: Number(kpi.recursos_deferidos || 0),
            recursosIndeferidos: Number(kpi.recursos_indeferidos || 0),
            recursosEmAndamento: Number(kpi.recursos_em_andamento || 0),
            tiposLancamento: kpi.tipos_lancamento || '',
            conveniosAfetados: kpi.convenios_afetados || '',
          },
          analise,
          historicoBemSucedido: historicoBemSucedido.map(r => ({
            convenio: r.convenio,
            justificativa: r.justificativaRecurso,
          })),
        };
      } finally {
        await conn.end();
      }
    }),

  // Comparativo entre dois meses com análise de IA
  comparativoMeses: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      competencia1: z.string(), // YYYY/MM
      competencia2: z.string(), // YYYY/MM
      convenioId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const getKpiMes = async (competencia: string) => {
          const params: any[] = [input.estabelecimentoId, competencia];
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(d.data_referencia, '%Y/%m') = ?";
          if (input.convenioId) { where += " AND d.convenio_id = ?"; params.push(input.convenioId); }
          const [rows] = await conn.execute<any[]>(`
            SELECT
              COUNT(*) as total_itens,
              SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
              SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
              SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
              COUNT(CASE WHEN d.valor_glosa > 0 THEN 1 END) as total_glosados,
              COUNT(DISTINCT d.convenio_id) as total_convenios
            FROM demonstrativo d ${where}
          `, params);
          const r = rows[0];
          const totalInformado = Number(r.total_informado || 0);
          const totalGlosa = Number(r.total_glosa || 0);
          return {
            competencia,
            totalItens: Number(r.total_itens),
            totalInformado,
            totalPago: Number(r.total_pago || 0),
            totalGlosa,
            totalGlosados: Number(r.total_glosados),
            totalConvenios: Number(r.total_convenios),
            taxaGlosa: totalInformado > 0 ? Number(((totalGlosa / totalInformado) * 100).toFixed(2)) : 0,
          };
        };

        const getTopMotivos = async (competencia: string) => {
          const params: any[] = [input.estabelecimentoId, competencia];
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(d.data_referencia, '%Y/%m') = ? AND d.valor_glosa > 0";
          if (input.convenioId) { where += " AND d.convenio_id = ?"; params.push(input.convenioId); }
          const [rows] = await conn.execute<any[]>(`
            SELECT
              COALESCE(d.codigo_glosa, 'Sem código') as codigo_glosa,
              SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
            FROM demonstrativo d ${where}
            GROUP BY d.codigo_glosa ORDER BY total_glosa DESC LIMIT 5
          `, params);
          return rows.map(r => ({ codigo: r.codigo_glosa, descricao: getMotivoDescricao(r.codigo_glosa === 'Sem código' ? null : r.codigo_glosa), valor: Number(r.total_glosa) }));
        };

        const getTopConvenios = async (competencia: string) => {
          const params: any[] = [input.estabelecimentoId, competencia];
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(d.data_referencia, '%Y/%m') = ? AND d.valor_glosa > 0";
          if (input.convenioId) { where += " AND d.convenio_id = ?"; params.push(input.convenioId); }
          const [rows] = await conn.execute<any[]>(`
            SELECT c.nome as convenio, SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
            FROM demonstrativo d LEFT JOIN convenios c ON c.id = d.convenio_id ${where}
            GROUP BY d.convenio_id, c.nome ORDER BY total_glosa DESC LIMIT 5
          `, params);
          return rows.map(r => ({ convenio: r.convenio || 'Sem convênio', valor: Number(r.total_glosa) }));
        };

        const [kpi1, kpi2, motivos1, motivos2, convenios1, convenios2] = await Promise.all([
          getKpiMes(input.competencia1),
          getKpiMes(input.competencia2),
          getTopMotivos(input.competencia1),
          getTopMotivos(input.competencia2),
          getTopConvenios(input.competencia1),
          getTopConvenios(input.competencia2),
        ]);

        const variacaoGlosa = kpi2.totalGlosa - kpi1.totalGlosa;
        const variacaoTaxa = kpi2.taxaGlosa - kpi1.taxaGlosa;
        const variacaoFaturado = kpi2.totalInformado - kpi1.totalInformado;

        const contexto = `
Comparativo entre ${input.competencia1} e ${input.competencia2}:

PERÍODO 1 (${input.competencia1}):
- Faturado: R$ ${kpi1.totalInformado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Pago: R$ ${kpi1.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Glosado: R$ ${kpi1.totalGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Taxa de Glosa: ${kpi1.taxaGlosa}%
- Top Motivos: ${motivos1.map(m => `${m.codigo}: R$ ${m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', ')}
- Top Convênios: ${convenios1.map(c => `${c.convenio}: R$ ${c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', ')}

PERÍODO 2 (${input.competencia2}):
- Faturado: R$ ${kpi2.totalInformado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Pago: R$ ${kpi2.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Glosado: R$ ${kpi2.totalGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Taxa de Glosa: ${kpi2.taxaGlosa}%
- Top Motivos: ${motivos2.map(m => `${m.codigo}: R$ ${m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', ')}
- Top Convênios: ${convenios2.map(c => `${c.convenio}: R$ ${c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', ')}

VARIAÇÕES:
- Variação no Faturado: R$ ${variacaoFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Variação no Glosado: R$ ${variacaoGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Variação na Taxa de Glosa: ${variacaoTaxa.toFixed(2)} p.p.
        `.trim();

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Você é um especialista em faturamento hospitalar e gestão de glosas. Analise o comparativo entre dois períodos e retorne uma análise estruturada em JSON. Seja específico e use os dados fornecidos.`,
            },
            { role: "user", content: contexto },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "comparativo_meses",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  visaoGeral: { type: "string", description: "Resumo comparativo dos dois períodos em 2-3 frases" },
                  analiseVariacoes: { type: "string", description: "Análise das variações de faturado, pago e glosado" },
                  comparativoMotivos: { type: "string", description: "Comparação dos principais motivos de glosa entre os períodos" },
                  comparativoConvenios: { type: "string", description: "Comparação do desempenho por convênio" },
                  diagnostico: { type: "string", description: "Diagnóstico geral da situação" },
                  recomendacoes: { type: "string", description: "Recomendações de ações" },
                  acoesPrioritarias: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        area: { type: "string" },
                        situacao: { type: "string" },
                        acao: { type: "string" },
                        impactoEstimado: { type: "number", description: "Valor em reais estimado de impacto" },
                      },
                      required: ["area", "situacao", "acao", "impactoEstimado"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["visaoGeral", "analiseVariacoes", "comparativoMotivos", "comparativoConvenios", "diagnostico", "recomendacoes", "acoesPrioritarias"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        let analise: any;
        try {
          analise = typeof content === "string" ? JSON.parse(content) : content;
        } catch {
          analise = {
            visaoGeral: `Comparando ${input.competencia1} com ${input.competencia2}: variação de R$ ${variacaoGlosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no valor glosado.`,
            analiseVariacoes: `Taxa de glosa variou ${variacaoTaxa.toFixed(2)} p.p.`,
            comparativoMotivos: "Análise de motivos indisponível.",
            comparativoConvenios: "Análise de convênios indisponível.",
            diagnostico: "Análise automática indisponível.",
            recomendacoes: "Revisar manualmente os dados dos dois períodos.",
            acoesPrioritarias: [],
          };
        }

        return {
          periodo1: { ...kpi1, topMotivos: motivos1, topConvenios: convenios1 },
          periodo2: { ...kpi2, topMotivos: motivos2, topConvenios: convenios2 },
          variacoes: { glosa: variacaoGlosa, taxa: variacaoTaxa, faturado: variacaoFaturado },
          analise,
        };
      } finally {
        await conn.end();
      }
    }),
});
