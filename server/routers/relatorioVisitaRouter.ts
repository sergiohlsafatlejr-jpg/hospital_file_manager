import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";

const codigoVisitaSql = `REPLACE(COALESCE(d.codigo_item, ''), '.', '') = '10102019'`;
const profissionalCteSql = `WITH profissionais_xml AS (
  SELECT estabelecimento_id, codigo_item, guia,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(medico) ELSE NULL END AS medico,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(crm) ELSE NULL END AS crm,
         CASE WHEN COUNT(DISTINCT chave_profissional) > 1 THEN 1 ELSE 0 END AS ambiguo
  FROM (
    SELECT f.estabelecimentoId AS estabelecimento_id,
           REPLACE(COALESCE(f.codigo_item, ''), '.', '') AS codigo_item,
           TRIM(LEADING '0' FROM COALESCE(f.numero_guia_operadora, '')) AS guia,
           NULLIF(TRIM(f.nome_prof), '') AS medico,
           NULLIF(TRIM(f.conselho_prof), '') AS crm,
           CONCAT(COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), '|', COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')) AS chave_profissional
    FROM faturamento_tiss f
    WHERE f.estabelecimentoId = ? AND REPLACE(COALESCE(f.codigo_item, ''), '.', '') = '10102019'
    UNION ALL
    SELECT f.estabelecimentoId AS estabelecimento_id,
           REPLACE(COALESCE(f.codigo_item, ''), '.', '') AS codigo_item,
           TRIM(LEADING '0' FROM COALESCE(f.numero_guia_prestador, '')) AS guia,
           NULLIF(TRIM(f.nome_prof), '') AS medico,
           NULLIF(TRIM(f.conselho_prof), '') AS crm,
           CONCAT(COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), '|', COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')) AS chave_profissional
    FROM faturamento_tiss f
    WHERE f.estabelecimentoId = ? AND REPLACE(COALESCE(f.codigo_item, ''), '.', '') = '10102019'
  ) origem
  WHERE guia <> '' AND (medico IS NOT NULL OR crm IS NOT NULL)
  GROUP BY estabelecimento_id, codigo_item, guia
)`;
const profissionalJoinSql = `LEFT JOIN profissionais_xml px
  ON px.estabelecimento_id = d.estabelecimentoId
 AND px.codigo_item = REPLACE(COALESCE(d.codigo_item, ''), '.', '')
 AND px.guia = TRIM(LEADING '0' FROM COALESCE(d.numero_guia, ''))`;

async function autorizar(userId: number, estabelecimentoId: number) {
  const permitido = await verificarPermissaoEstabelecimento(userId, estabelecimentoId, "visualizar");
  if (!permitido) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para visualizar este estabelecimento" });
  }
}

async function conectar() {
  const mysql2 = await import("mysql2/promise");
  const databaseUrl = getApplicationDatabaseUrl();
  if (!databaseUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });
  return mysql2.createConnection(databaseUrl);
}

export const relatorioVisitaRouter = router({
  convenios: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await autorizar(ctx.user.id, input.estabelecimentoId);
      const conn = await conectar();
      try {
        const [rows] = await conn.execute(
          `SELECT DISTINCT d.convenio_id, c.nome AS convenio_nome
           FROM demonstrativo d LEFT JOIN convenios c ON c.id = d.convenio_id
           WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql} AND d.convenio_id IS NOT NULL
           ORDER BY c.nome`,
          [input.estabelecimentoId]
        );
        return (rows as any[]).map((r) => ({ id: Number(r.convenio_id), nome: r.convenio_nome || `Convênio ${r.convenio_id}` }));
      } finally {
        await conn.end().catch(() => {});
      }
    }),

  medicos: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await autorizar(ctx.user.id, input.estabelecimentoId);
      const conn = await conectar();
      try {
        const [rows] = await conn.execute(
          `${profissionalCteSql}
           SELECT px.medico, px.crm, COUNT(DISTINCT d.id) AS total_visitas
           FROM demonstrativo d
           INNER JOIN profissionais_xml px
             ON px.estabelecimento_id = d.estabelecimentoId
            AND px.codigo_item = REPLACE(COALESCE(d.codigo_item, ''), '.', '')
            AND px.guia = TRIM(LEADING '0' FROM COALESCE(d.numero_guia, ''))
           WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql} AND px.ambiguo = 0 AND px.medico IS NOT NULL
           GROUP BY px.medico, px.crm ORDER BY px.medico`,
          [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId]
        );
        return (rows as any[]).map((r) => ({ medico: r.medico, crm: r.crm || null, totalVisitas: Number(r.total_visitas || 0) }));
      } finally {
        await conn.end().catch(() => {});
      }
    }),

  dados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      mesReferencia: z.number().min(1).max(12).optional(),
      anoReferencia: z.number().min(2000).max(2100).optional(),
      convenioId: z.number().optional(),
      statusFiltro: z.enum(["todos", "pago", "glosado", "parcial"]).optional(),
      medico: z.string().min(1).optional(),
      crm: z.string().min(1).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await autorizar(ctx.user.id, input.estabelecimentoId);
      const conn = await conectar();
      try {
        let whereExtra = "";
        const filtros: unknown[] = [];
        if (input.mesReferencia && input.anoReferencia) {
          whereExtra += " AND MONTH(COALESCE(d.data_referencia, d.data_pagamento)) = ? AND YEAR(COALESCE(d.data_referencia, d.data_pagamento)) = ?";
          filtros.push(input.mesReferencia, input.anoReferencia);
        }
        if (input.convenioId) {
          whereExtra += " AND d.convenio_id = ?";
          filtros.push(input.convenioId);
        }
        if (input.statusFiltro && input.statusFiltro !== "todos") {
          whereExtra += " AND UPPER(d.situacao_item) = ?";
          filtros.push(input.statusFiltro.toUpperCase());
        }
        if (input.medico) {
          whereExtra += " AND px.medico = ? AND px.ambiguo = 0";
          filtros.push(input.medico.trim());
        }
        if (input.crm) {
          whereExtra += " AND px.crm = ? AND px.ambiguo = 0";
          filtros.push(input.crm.trim());
        }

        const baseWhere = `d.estabelecimentoId = ? AND ${codigoVisitaSql}`;
        const parametros = [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId, ...filtros];
        const fromSql = `FROM demonstrativo d ${profissionalJoinSql}`;

        const [[porCodigo], [resumoRows], [competencias], [porSituacao], [porConvenio], [porMedico]] = await Promise.all([
          conn.execute(
            `${profissionalCteSql} SELECT d.codigo_item, MIN(d.descricao_item) AS descricao, d.situacao_item,
                    COUNT(*) AS qtd, SUM(CAST(d.valor_pago AS DECIMAL(12,2))) AS total_pago,
                    SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) AS total_glosa
             ${fromSql} WHERE ${baseWhere} ${whereExtra}
             GROUP BY d.codigo_item, d.situacao_item ORDER BY total_pago DESC`,
            parametros
          ),
          conn.execute(
            `${profissionalCteSql} SELECT COUNT(*) AS total_itens, COUNT(DISTINCT d.codigo_item) AS codigos_unicos,
                    SUM(CAST(d.valor_pago AS DECIMAL(12,2))) AS total_pago,
                    SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) AS total_glosa,
                    SUM(CAST(d.valor_informado AS DECIMAL(12,2))) AS total_informado,
                    SUM(CASE WHEN px.ambiguo = 0 AND (px.medico IS NOT NULL OR px.crm IS NOT NULL) THEN 1 ELSE 0 END) AS total_com_medico,
                    COUNT(DISTINCT CASE WHEN px.ambiguo = 0 AND px.medico IS NOT NULL THEN CONCAT(px.medico, '|', COALESCE(px.crm, '')) END) AS total_medicos
             ${fromSql} WHERE ${baseWhere} ${whereExtra}`,
            parametros
          ),
          conn.execute(
            `SELECT MONTH(COALESCE(d.data_referencia, d.data_pagamento)) AS mes,
                    YEAR(COALESCE(d.data_referencia, d.data_pagamento)) AS ano, COUNT(*) AS total
             FROM demonstrativo d
             WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql} AND COALESCE(d.data_referencia, d.data_pagamento) IS NOT NULL
             GROUP BY MONTH(COALESCE(d.data_referencia, d.data_pagamento)), YEAR(COALESCE(d.data_referencia, d.data_pagamento))
             ORDER BY ano DESC, mes DESC`,
            [input.estabelecimentoId]
          ),
          conn.execute(
            `${profissionalCteSql} SELECT d.situacao_item, COUNT(*) AS total,
                    SUM(CAST(d.valor_pago AS DECIMAL(12,2))) AS vl_pago,
                    SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) AS vl_glosa
             ${fromSql} WHERE ${baseWhere} ${whereExtra} GROUP BY d.situacao_item`,
            parametros
          ),
          conn.execute(
            `${profissionalCteSql} SELECT d.convenio_id, c.nome AS convenio_nome, COUNT(*) AS qtd,
                    COUNT(DISTINCT d.codigo_item) AS codigos,
                    SUM(CAST(d.valor_pago AS DECIMAL(12,2))) AS total_pago,
                    SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) AS total_glosa
             ${fromSql} LEFT JOIN convenios c ON c.id = d.convenio_id
             WHERE ${baseWhere} ${whereExtra}
             GROUP BY d.convenio_id, c.nome ORDER BY total_pago DESC`,
            parametros
          ),
          conn.execute(
            `${profissionalCteSql} SELECT px.medico, px.crm, COUNT(*) AS qtd,
                    SUM(CAST(d.valor_pago AS DECIMAL(12,2))) AS total_pago,
                    SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) AS total_glosa
             ${fromSql} WHERE ${baseWhere} ${whereExtra} AND px.ambiguo = 0 AND px.medico IS NOT NULL
             GROUP BY px.medico, px.crm ORDER BY qtd DESC, px.medico`,
            parametros
          ),
        ]);

        let itens: any[] = [];
        if (input.mesReferencia && input.anoReferencia) {
          const [itensResult] = await conn.execute(
            `${profissionalCteSql} SELECT d.id, d.codigo_item, d.descricao_item, d.situacao_item,
                    CAST(d.valor_pago AS DECIMAL(12,2)) AS valor_pago,
                    CAST(d.valor_glosa AS DECIMAL(12,2)) AS valor_glosa,
                    CAST(d.valor_informado AS DECIMAL(12,2)) AS valor_informado,
                    d.numero_guia, d.nome_beneficiario, d.data_execucao, d.data_referencia,
                    d.data_pagamento, d.codigo_glosa, d.convenio_id, c.nome AS convenio_nome,
                    CASE WHEN px.ambiguo = 0 THEN px.medico ELSE NULL END AS medico,
                    CASE WHEN px.ambiguo = 0 THEN px.crm ELSE NULL END AS crm,
                    COALESCE(px.ambiguo, 0) AS profissional_ambiguo
             ${fromSql} LEFT JOIN convenios c ON c.id = d.convenio_id
             WHERE ${baseWhere} ${whereExtra}
             ORDER BY d.data_execucao DESC, d.numero_guia, d.codigo_item`,
            parametros
          );
          itens = (itensResult as any[]).map((i) => ({
            ...i,
            medico: i.medico || null,
            crm: i.crm || null,
            profissional_ambiguo: Boolean(i.profissional_ambiguo),
            origem_profissional: i.medico || i.crm ? "XML enviado" : null,
          }));
        }

        const resumo = (resumoRows as any[])[0] || {};
        const totalItens = Number(resumo.total_itens || 0);
        const totalComMedico = Number(resumo.total_com_medico || 0);
        return {
          itens,
          porCodigo: porCodigo as any[],
          porSituacao: porSituacao as any[],
          porConvenio: (porConvenio as any[]).map((c) => ({
            convenioId: c.convenio_id,
            convenioNome: c.convenio_nome || `Convênio ${c.convenio_id}`,
            qtd: Number(c.qtd), codigos: Number(c.codigos),
            totalPago: Number(c.total_pago || 0), totalGlosa: Number(c.total_glosa || 0),
          })),
          porMedico: (porMedico as any[]).map((m) => ({
            medico: m.medico || null, crm: m.crm || null, qtd: Number(m.qtd || 0),
            totalPago: Number(m.total_pago || 0), totalGlosa: Number(m.total_glosa || 0),
          })),
          resumo: {
            totalItens, totalPago: Number(resumo.total_pago || 0), totalGlosa: Number(resumo.total_glosa || 0),
            totalInformado: Number(resumo.total_informado || 0), codigosUnicos: Number(resumo.codigos_unicos || 0),
            totalComMedico, totalSemMedico: totalItens - totalComMedico, totalMedicos: Number(resumo.total_medicos || 0),
          },
          competencias: (competencias as any[]).map((c) => ({
            value: `${c.mes}-${c.ano}`, label: `${String(c.mes).padStart(2, "0")}/${c.ano}`,
            total: Number(c.total), mes: Number(c.mes), ano: Number(c.ano),
          })),
        };
      } finally {
        await conn.end().catch(() => {});
      }
    }),
});
