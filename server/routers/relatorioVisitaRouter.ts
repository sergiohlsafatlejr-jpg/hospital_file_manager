import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { reportProcedure, router } from "../_core/trpc";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";

const codigoVisitaSql = `REGEXP_REPLACE(COALESCE(d.codigo_item, ''), '[^0-9]', '') = '10102019'`;
const codigoVisitaFaturadoSql = `REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') = '10102019'`;
const faturadoSemRetornoCteSql = `WITH faturado_visita_deduplicado AS (
  SELECT f.*,
         REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') AS codigo_normalizado,
         CASE
           WHEN REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '') <> ''
             THEN CONCAT('C:', REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', ''))
           ELSE CONCAT('G:', COALESCE(NULLIF(TRIM(LEADING '0' FROM COALESCE(f.numero_guia_operadora, '')), ''), TRIM(LEADING '0' FROM COALESCE(f.numero_guia_prestador, ''))))
         END AS chave_beneficiario,
         ROW_NUMBER() OVER (
           PARTITION BY f.estabelecimentoId, f.convenioId,
             REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', ''),
             CASE
               WHEN REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '') <> ''
                 THEN CONCAT('C:', REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', ''))
               ELSE CONCAT('G:', COALESCE(NULLIF(TRIM(LEADING '0' FROM COALESCE(f.numero_guia_operadora, '')), ''), TRIM(LEADING '0' FROM COALESCE(f.numero_guia_prestador, ''))))
             END,
             DATE(f.data_execucao), CAST(COALESCE(f.valor_faturado, 0) AS DECIMAL(12,2)),
             COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')
           ORDER BY f.id DESC
         ) AS duplicidade_ordem
  FROM faturamento_tiss f
  WHERE f.estabelecimentoId = ? AND ${codigoVisitaFaturadoSql}
), faturado_visita_unico AS (
  SELECT * FROM faturado_visita_deduplicado WHERE duplicidade_ordem = 1
), faturado_visita_ocorrencia AS (
  SELECT fu.*,
         ROW_NUMBER() OVER (
           PARTITION BY fu.estabelecimentoId, fu.convenioId, fu.codigo_normalizado, fu.chave_beneficiario, DATE(fu.data_execucao)
           ORDER BY fu.id
         ) AS ocorrencia_item
  FROM faturado_visita_unico fu
), retorno_visita_ocorrencia AS (
  SELECT d.id, d.estabelecimentoId, d.convenio_id,
         REGEXP_REPLACE(COALESCE(d.codigo_item, ''), '[^0-9]', '') AS codigo_normalizado,
         CASE
           WHEN REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(d.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '') <> ''
             THEN CONCAT('C:', REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(d.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', ''))
           ELSE CONCAT('G:', TRIM(LEADING '0' FROM COALESCE(d.numero_guia, '')))
         END AS chave_beneficiario,
         DATE(d.data_execucao) AS data_execucao,
         ROW_NUMBER() OVER (
           PARTITION BY d.estabelecimentoId, d.convenio_id,
             REGEXP_REPLACE(COALESCE(d.codigo_item, ''), '[^0-9]', ''),
             CASE
               WHEN REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(d.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '') <> ''
                 THEN CONCAT('C:', REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(d.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', ''))
               ELSE CONCAT('G:', TRIM(LEADING '0' FROM COALESCE(d.numero_guia, '')))
             END,
             DATE(d.data_execucao)
           ORDER BY d.id
         ) AS ocorrencia_item
  FROM demonstrativo d
  WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql}
), faturado_sem_retorno AS (
  SELECT f.*
  FROM faturado_visita_ocorrencia f
  LEFT JOIN retorno_visita_ocorrencia r
    ON r.estabelecimentoId = f.estabelecimentoId
   AND r.convenio_id = f.convenioId
   AND r.codigo_normalizado = f.codigo_normalizado
   AND r.chave_beneficiario = f.chave_beneficiario
   AND r.data_execucao <=> DATE(f.data_execucao)
   AND r.ocorrencia_item = f.ocorrencia_item
  WHERE r.id IS NULL
)`;
const profissionalCteSql = `WITH profissionais_guia AS (
  SELECT estabelecimento_id, codigo_item, guia,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(medico) ELSE NULL END AS medico,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(crm) ELSE NULL END AS crm,
         CASE WHEN COUNT(DISTINCT chave_profissional) > 1 THEN 1 ELSE 0 END AS ambiguo
  FROM (
    SELECT f.estabelecimentoId AS estabelecimento_id,
           REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') AS codigo_item,
           TRIM(LEADING '0' FROM COALESCE(f.numero_guia_operadora, '')) AS guia,
           NULLIF(TRIM(f.nome_prof), '') AS medico,
           NULLIF(TRIM(f.conselho_prof), '') AS crm,
           CONCAT(COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), '|', COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')) AS chave_profissional
    FROM faturamento_tiss f
    WHERE f.estabelecimentoId = ? AND REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') = '10102019'
    UNION ALL
    SELECT f.estabelecimentoId AS estabelecimento_id,
           REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') AS codigo_item,
           TRIM(LEADING '0' FROM COALESCE(f.numero_guia_prestador, '')) AS guia,
           NULLIF(TRIM(f.nome_prof), '') AS medico,
           NULLIF(TRIM(f.conselho_prof), '') AS crm,
           CONCAT(COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), '|', COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')) AS chave_profissional
    FROM faturamento_tiss f
    WHERE f.estabelecimentoId = ? AND REGEXP_REPLACE(COALESCE(f.codigo_item, ''), '[^0-9]', '') = '10102019'
  ) origem
  WHERE guia <> '' AND (medico IS NOT NULL OR crm IS NOT NULL)
  GROUP BY estabelecimento_id, codigo_item, guia
), profissionais_carteira AS (
  SELECT estabelecimento_id, convenio_id, carteira,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(medico) ELSE NULL END AS medico,
         CASE WHEN COUNT(DISTINCT chave_profissional) = 1 THEN MAX(crm) ELSE NULL END AS crm,
         CASE WHEN COUNT(DISTINCT chave_profissional) > 1 THEN 1 ELSE 0 END AS ambiguo
  FROM (
    SELECT f.estabelecimentoId AS estabelecimento_id,
           f.convenioId AS convenio_id,
           REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(f.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '') AS carteira,
           NULLIF(TRIM(f.nome_prof), '') AS medico,
           NULLIF(TRIM(f.conselho_prof), '') AS crm,
           CONCAT(COALESCE(NULLIF(TRIM(f.nome_prof), ''), ''), '|', COALESCE(NULLIF(TRIM(f.conselho_prof), ''), '')) AS chave_profissional
    FROM faturamento_tiss f
    WHERE f.estabelecimentoId = ?
  ) origem
  WHERE carteira <> '' AND (medico IS NOT NULL OR crm IS NOT NULL)
  GROUP BY estabelecimento_id, convenio_id, carteira
), profissionais_xml AS (
  SELECT d.id AS demonstrativo_id,
         CASE WHEN pg.guia IS NOT NULL THEN pg.medico ELSE pc.medico END AS medico,
         CASE WHEN pg.guia IS NOT NULL THEN pg.crm ELSE pc.crm END AS crm,
         CASE WHEN pg.guia IS NOT NULL THEN pg.ambiguo ELSE COALESCE(pc.ambiguo, 0) END AS ambiguo,
         CASE
           WHEN pg.guia IS NOT NULL AND pg.ambiguo = 0 AND (pg.medico IS NOT NULL OR pg.crm IS NOT NULL) THEN 'guia_codigo'
           WHEN pg.guia IS NULL AND pc.carteira IS NOT NULL AND pc.ambiguo = 0 AND (pc.medico IS NOT NULL OR pc.crm IS NOT NULL) THEN 'carteira_convenio'
           ELSE NULL
         END AS fonte
  FROM demonstrativo d
  LEFT JOIN profissionais_guia pg
    ON pg.estabelecimento_id = d.estabelecimentoId
   AND pg.codigo_item = REGEXP_REPLACE(COALESCE(d.codigo_item, ''), '[^0-9]', '')
   AND pg.guia = TRIM(LEADING '0' FROM COALESCE(d.numero_guia, ''))
  LEFT JOIN profissionais_carteira pc
    ON pc.estabelecimento_id = d.estabelecimentoId
   AND pc.convenio_id = d.convenio_id
   AND pc.carteira = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(d.carteira_beneficiario, ''), '.', ''), '-', ''), '/', ''), ' ', '')
   AND NULLIF(TRIM(d.carteira_beneficiario), '') IS NOT NULL
  WHERE d.estabelecimentoId = ?
)`;
const profissionalJoinSql = `LEFT JOIN profissionais_xml px
  ON px.demonstrativo_id = d.id`;

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

const relatorioProcedure = reportProcedure("relVisitaHospitalar");

export const relatorioVisitaRouter = router({
  convenios: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await autorizar(ctx.user.id, input.estabelecimentoId);
      const conn = await conectar();
      try {
        const [rows] = await conn.execute(
          `SELECT x.convenio_id, COALESCE(c.nome, CONCAT('Convênio ', x.convenio_id)) AS convenio_nome
           FROM (
             SELECT DISTINCT d.convenio_id
             FROM demonstrativo d
             WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql} AND d.convenio_id IS NOT NULL
             UNION
             SELECT DISTINCT f.convenioId
             FROM faturamento_tiss f
             WHERE f.estabelecimentoId = ? AND ${codigoVisitaFaturadoSql}
               AND f.convenioId IS NOT NULL
           ) x
           LEFT JOIN convenios c ON c.id = x.convenio_id
           ORDER BY convenio_nome`,
          [input.estabelecimentoId, input.estabelecimentoId]
        );
        return (rows as any[]).map((r) => ({ id: Number(r.convenio_id), nome: r.convenio_nome || `Convênio ${r.convenio_id}` }));
      } finally {
        await conn.end().catch(() => {});
      }
    }),

  medicos: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await autorizar(ctx.user.id, input.estabelecimentoId);
      const conn = await conectar();
      try {
        const [rows] = await conn.execute(
          `${profissionalCteSql}
           SELECT medico, crm, SUM(total_visitas) AS total_visitas
           FROM (
             SELECT px.medico, px.crm, COUNT(DISTINCT d.id) AS total_visitas
             FROM demonstrativo d
             INNER JOIN profissionais_xml px ON px.demonstrativo_id = d.id
             WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql} AND px.ambiguo = 0 AND px.medico IS NOT NULL
             GROUP BY px.medico, px.crm
             UNION ALL
             SELECT NULLIF(TRIM(f.nome_prof), '') AS medico, NULLIF(TRIM(f.conselho_prof), '') AS crm, COUNT(*) AS total_visitas
             FROM faturamento_tiss f
             WHERE f.estabelecimentoId = ? AND ${codigoVisitaFaturadoSql}
               AND NULLIF(TRIM(f.nome_prof), '') IS NOT NULL
             GROUP BY NULLIF(TRIM(f.nome_prof), ''), NULLIF(TRIM(f.conselho_prof), '')
           ) profissionais
           GROUP BY medico, crm ORDER BY medico`,
          [
            input.estabelecimentoId,
            input.estabelecimentoId,
            input.estabelecimentoId,
            input.estabelecimentoId,
            input.estabelecimentoId,
            input.estabelecimentoId,
          ]
        );
        return (rows as any[]).map((r) => ({ medico: r.medico, crm: r.crm || null, totalVisitas: Number(r.total_visitas || 0) }));
      } finally {
        await conn.end().catch(() => {});
      }
    }),

  dados: relatorioProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      mesReferencia: z.number().min(1).max(12).optional(),
      anoReferencia: z.number().min(2000).max(2100).optional(),
      convenioId: z.number().optional(),
      statusFiltro: z.enum(["todos", "pago", "glosado", "parcial", "aguardando"]).optional(),
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

        let whereFaturado = "";
        const filtrosFaturado: unknown[] = [];
        if (input.mesReferencia && input.anoReferencia) {
          whereFaturado += " AND MONTH(COALESCE(f.data_referencia, f.data_execucao)) = ? AND YEAR(COALESCE(f.data_referencia, f.data_execucao)) = ?";
          filtrosFaturado.push(input.mesReferencia, input.anoReferencia);
        }
        if (input.convenioId) {
          whereFaturado += " AND f.convenioId = ?";
          filtrosFaturado.push(input.convenioId);
        }
        if (input.medico) {
          whereFaturado += " AND TRIM(f.nome_prof) = ?";
          filtrosFaturado.push(input.medico.trim());
        }
        if (input.crm) {
          whereFaturado += " AND TRIM(f.conselho_prof) = ?";
          filtrosFaturado.push(input.crm.trim());
        }
        const incluirFaturadosSemRetorno = !input.statusFiltro
          || input.statusFiltro === "todos"
          || input.statusFiltro === "aguardando";

        const baseWhere = `d.estabelecimentoId = ? AND ${codigoVisitaSql}`;
        const parametros = [
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          ...filtros,
        ];
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
            `${faturadoSemRetornoCteSql}
             SELECT mes, ano, SUM(total) AS total
             FROM (
               SELECT MONTH(COALESCE(d.data_referencia, d.data_pagamento)) AS mes,
                      YEAR(COALESCE(d.data_referencia, d.data_pagamento)) AS ano, COUNT(*) AS total
               FROM demonstrativo d
               WHERE d.estabelecimentoId = ? AND ${codigoVisitaSql}
                 AND COALESCE(d.data_referencia, d.data_pagamento) IS NOT NULL
               GROUP BY MONTH(COALESCE(d.data_referencia, d.data_pagamento)), YEAR(COALESCE(d.data_referencia, d.data_pagamento))
               UNION ALL
               SELECT MONTH(COALESCE(f.data_referencia, f.data_execucao)) AS mes,
                      YEAR(COALESCE(f.data_referencia, f.data_execucao)) AS ano, COUNT(*) AS total
               FROM faturado_sem_retorno f
               WHERE COALESCE(f.data_referencia, f.data_execucao) IS NOT NULL
               GROUP BY MONTH(COALESCE(f.data_referencia, f.data_execucao)), YEAR(COALESCE(f.data_referencia, f.data_execucao))
             ) periodos
             GROUP BY mes, ano ORDER BY ano DESC, mes DESC`,
            [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId]
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
                    CASE WHEN px.ambiguo = 0 THEN px.fonte ELSE NULL END AS origem_profissional,
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
            origem_profissional: i.origem_profissional === "carteira_convenio"
              ? "XML histórico — carteirinha e convênio"
              : i.origem_profissional === "guia_codigo"
                ? "XML enviado — guia e código"
                : null,
          }));
        }

        const resumo = (resumoRows as any[])[0] || {};
        const totalItens = Number(resumo.total_itens || 0);
        const totalComMedico = Number(resumo.total_com_medico || 0);
        let faturadosSemRetorno: any[] = [];
        if (incluirFaturadosSemRetorno) {
          const [rowsFaturados] = await conn.execute(
            `${faturadoSemRetornoCteSql}
             SELECT f.id, f.codigo_item, f.descricao_item,
                    CAST(f.valor_faturado AS DECIMAL(12,2)) AS valor_informado,
                    COALESCE(NULLIF(f.numero_guia_operadora, ''), f.numero_guia_prestador) AS numero_guia,
                    NULL AS nome_beneficiario, f.data_execucao, f.data_referencia,
                    NULL AS data_pagamento, NULL AS codigo_glosa, f.convenioId AS convenio_id,
                    COALESCE(c.nome, CONCAT('Convênio ', f.convenioId)) AS convenio_nome,
                    NULLIF(TRIM(f.nome_prof), '') AS medico,
                    NULLIF(TRIM(f.conselho_prof), '') AS crm,
                    'XML faturado — item sem correspondência no retorno' AS origem_profissional
             FROM faturado_sem_retorno f
             LEFT JOIN convenios c ON c.id = f.convenioId
             WHERE 1 = 1 ${whereFaturado}
             ORDER BY f.data_execucao DESC, numero_guia, f.id`,
            [input.estabelecimentoId, input.estabelecimentoId, ...filtrosFaturado]
          );
          faturadosSemRetorno = rowsFaturados as any[];
        }

        const mapaConvenios = new Map<number, any>();
        for (const convenio of porConvenio as any[]) {
          mapaConvenios.set(Number(convenio.convenio_id), {
            convenioId: convenio.convenio_id,
            convenioNome: convenio.convenio_nome || `Convênio ${convenio.convenio_id}`,
            qtd: Number(convenio.qtd), codigos: Number(convenio.codigos),
            totalPago: Number(convenio.total_pago || 0), totalGlosa: Number(convenio.total_glosa || 0),
            totalFaturadoSemRetorno: 0,
          });
        }
        for (const item of faturadosSemRetorno) {
          const id = Number(item.convenio_id);
          const atual = mapaConvenios.get(id) || {
            convenioId: id,
            convenioNome: item.convenio_nome || `Convênio ${id}`,
            qtd: 0, codigos: 0, totalPago: 0, totalGlosa: 0, totalFaturadoSemRetorno: 0,
          };
          atual.qtd += 1;
          atual.codigos = Math.max(atual.codigos, 1);
          atual.totalFaturadoSemRetorno += Number(item.valor_informado || 0);
          mapaConvenios.set(id, atual);
        }

        const mapaMedicos = new Map<string, any>();
        for (const medico of porMedico as any[]) {
          const chave = `${medico.medico || ''}|${medico.crm || ''}`;
          mapaMedicos.set(chave, {
            medico: medico.medico || null, crm: medico.crm || null, qtd: Number(medico.qtd || 0),
            totalPago: Number(medico.total_pago || 0), totalGlosa: Number(medico.total_glosa || 0),
            totalFaturadoSemRetorno: 0,
          });
        }
        for (const item of faturadosSemRetorno) {
          if (!item.medico) continue;
          const chave = `${item.medico}|${item.crm || ''}`;
          const atual = mapaMedicos.get(chave) || {
            medico: item.medico, crm: item.crm || null, qtd: 0, totalPago: 0, totalGlosa: 0, totalFaturadoSemRetorno: 0,
          };
          atual.qtd += 1;
          atual.totalFaturadoSemRetorno += Number(item.valor_informado || 0);
          mapaMedicos.set(chave, atual);
        }

        const totalFaturadoSemRetorno = faturadosSemRetorno.reduce((s, item) => s + Number(item.valor_informado || 0), 0);
        const totalComMedicoSemRetorno = faturadosSemRetorno.filter((item) => item.medico || item.crm).length;
        const porCodigoCompleto = [...(porCodigo as any[])];
        if (faturadosSemRetorno.length) {
          porCodigoCompleto.push({
            codigo_item: "10102019",
            descricao: "Visita Hospitalar (item sem correspondência no retorno)",
            situacao_item: "AGUARDANDO RETORNO",
            qtd: faturadosSemRetorno.length,
            total_pago: 0,
            total_glosa: 0,
            total_faturado_sem_retorno: totalFaturadoSemRetorno,
          });
        }
        const porSituacaoCompleto = [...(porSituacao as any[])];
        if (faturadosSemRetorno.length) {
          porSituacaoCompleto.push({
            situacao_item: "AGUARDANDO RETORNO",
            total: faturadosSemRetorno.length,
            vl_pago: 0,
            vl_glosa: 0,
            vl_faturado: totalFaturadoSemRetorno,
          });
        }
        if (input.mesReferencia && input.anoReferencia) {
          itens.push(...faturadosSemRetorno.map((item) => ({
            ...item,
            id: `xml-${item.id}`,
            situacao_item: "AGUARDANDO RETORNO",
            valor_pago: 0,
            valor_glosa: 0,
            profissional_ambiguo: false,
          })));
        }
        return {
          itens,
          porCodigo: porCodigoCompleto,
          porSituacao: porSituacaoCompleto,
          porConvenio: Array.from(mapaConvenios.values()).sort((a, b) =>
            (b.totalPago + b.totalGlosa + b.totalFaturadoSemRetorno)
            - (a.totalPago + a.totalGlosa + a.totalFaturadoSemRetorno)
          ),
          porMedico: Array.from(mapaMedicos.values()).sort((a, b) => b.qtd - a.qtd),
          resumo: {
            totalItens: totalItens + faturadosSemRetorno.length,
            totalPago: Number(resumo.total_pago || 0), totalGlosa: Number(resumo.total_glosa || 0),
            totalInformado: Number(resumo.total_informado || 0) + totalFaturadoSemRetorno,
            codigosUnicos: totalItens + faturadosSemRetorno.length > 0 ? 1 : 0,
            totalComMedico: totalComMedico + totalComMedicoSemRetorno,
            totalSemMedico: totalItens + faturadosSemRetorno.length - totalComMedico - totalComMedicoSemRetorno,
            totalMedicos: mapaMedicos.size,
            totalFaturadoSemRetorno,
            totalAguardandoRetorno: faturadosSemRetorno.length,
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
