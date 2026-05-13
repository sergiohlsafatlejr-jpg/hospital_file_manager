import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

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
  if (!codigo) return "Sem código";
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
        if (input.tipoLancamento) {
          where += " AND d.tipo_lancamento = ?";
          params.push(input.tipoLancamento);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            COUNT(*) as total_itens,
            SUM(CASE WHEN d.valor_glosa > 0 THEN 1 ELSE 0 END) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
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

        const kpi = rows[0];
        const taxaGlosa = kpi.total_informado > 0
          ? (Number(kpi.total_glosa) / Number(kpi.total_informado)) * 100
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
          totalInformado: Number(kpi.total_informado),
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
        const params: any[] = [input.estabelecimentoId];
        let where = "WHERE d.estabelecimentoId = ?";
        if (input.convenioId) {
          where += " AND d.convenio_id = ?";
          params.push(input.convenioId);
        }
        params.push(input.meses);

        const [rows] = await conn.execute<any[]>(`
          SELECT
            DATE_FORMAT(d.data_referencia, '%Y/%m') as competencia,
            COUNT(CASE WHEN d.valor_glosa > 0 THEN 1 END) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            COUNT(DISTINCT d.numero_guia) as total_guias
          FROM demonstrativo d
          ${where}
          GROUP BY DATE_FORMAT(d.data_referencia, '%Y/%m')
          ORDER BY competencia DESC
          LIMIT ?
        `, params);

        return rows.map(r => ({
          competencia: r.competencia,
          totalGlosados: Number(r.total_glosados),
          totalInformado: Number(r.total_informado),
          totalGlosa: Number(r.total_glosa),
          totalPago: Number(r.total_pago),
          totalGuias: Number(r.total_guias),
          taxaGlosa: r.total_informado > 0
            ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
            : 0,
        })).reverse();
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
        params.push(input.limite);

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
          LIMIT ?
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
        params.push(input.limite);

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
          LIMIT ?
        `, params);

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

  // Filtros disponíveis
  filtros: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      const mysql2 = await import("mysql2/promise");
      const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
      try {
        const [convenios] = await conn.execute<any[]>(`
          SELECT DISTINCT c.id, c.nome
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          WHERE d.estabelecimentoId = ? AND d.valor_glosa > 0 AND c.id IS NOT NULL
          ORDER BY c.nome
        `, [input.estabelecimentoId]);

        const [competencias] = await conn.execute<any[]>(`
          SELECT DISTINCT DATE_FORMAT(data_referencia, '%Y/%m') as competencia
          FROM demonstrativo
          WHERE estabelecimentoId = ? AND valor_glosa > 0
          ORDER BY competencia DESC
        `, [input.estabelecimentoId]);

        const [tipos] = await conn.execute<any[]>(`
          SELECT DISTINCT tipo_lancamento
          FROM demonstrativo
          WHERE estabelecimentoId = ? AND valor_glosa > 0 AND tipo_lancamento IS NOT NULL AND tipo_lancamento != ''
          ORDER BY tipo_lancamento
        `, [input.estabelecimentoId]);

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
});
