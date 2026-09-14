import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";
import {
  agruparEventosAnaliseGlosa,
  complementarRankingGlosa,
  construirFiltroPainelGlosas,
  filtrarEventosAnaliseGlosa,
  montarResumoGlosas,
  percentualGlosa,
  resumirEventosAnaliseGlosa,
  type DimensaoFiltroCruzado,
  type EventoAnaliseGlosa,
} from "../relatoriosGlosasBiService";

// Nota: Os códigos TISS reais são resolvidos via LEFT JOIN motivosGlosa na query SQL.
// Textos descritivos do IPASGO já foram convertidos para códigos TISS no banco (backfill)
// e o parser converte automaticamente em novas importações.

function getMotivoDescricao(codigo: string | null): string {
  if (!codigo) return "Glosa sem motivo informado pelo convênio";
  // Código numérico sem descrição na tabela - retornar apenas o código
  return codigo;
}

function getGrupoFromCodigo(codigo: string | null): string | null {
  if (!codigo) return "Sem Motivo Informado";
  // Para códigos numéricos, o grupo vem da tabela motivosGlosa via JOIN na query SQL
  return null;
}

function getDescricaoSimplificada(codigo: string | null): string | null {
  if (!codigo) return "Sem motivo informado";
  return null;
}

// Categorias de glosa - grupos reais da tabela TISS + IPASGO
const CATEGORIAS_GLOSA_FIXAS: string[] = [
  "Beneficiário",
  "Guia/Autorização",
  "Guia/Documentação",
  "Procedimento/Cobrança",
  "Procedimento/Autorização",
  "Procedimento/Diagnóstico",
  "Honorários",
  "Honorários/Procedimentos",
  "Material",
  "Medicamento",
  "OPME",
  "Acomodação/Diárias",
  "Prestador/Profissional",
  "Mensagem Eletrônica/Validação",
  "Administrativa",
  "Documentação",
  "Técnica",
  "Cobrança",
  "Autorização",
  "Elegibilidade",
  "Outros",
];

const filtroPainelGlosasSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  convenioId: z.number().int().positive().optional(),
  mesPagamentoInicio: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  mesPagamentoFim: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  categoriaGlosa: z.string().min(1).optional(),
  mesPagamento: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  itemDescricao: z.string().min(1).max(500).optional(),
  procedimentoCodigo: z.string().min(1).max(100).optional(),
  motivoCodigo: z.string().min(1).max(100).optional(),
  limite: z.number().int().min(5).max(50).default(15),
});

async function validarAcessoPainelGlosas(ctx: any, estabelecimentoId: number) {
  if (ctx.user?.role === "admin") return;
  const permitido = await verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, "visualizar");
  if (!permitido) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao estabelecimento selecionado" });
  }
}


export const relatoriosGlosasBiRouter = router({
  painelExecutivo: protectedProcedure
    .input(filtroPainelGlosasSchema)
    .query(async ({ input, ctx }) => {
      await validarAcessoPainelGlosas(ctx, input.estabelecimentoId);

      const mysql2 = await import("mysql2/promise");
      const databaseUrl = getApplicationDatabaseUrl();
      if (!databaseUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });
      }
      const conn = await mysql2.createConnection(databaseUrl);
      try {
        const joinBase = `
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
        `;
        const aceiteCondicao = `(
          COALESCE(d.glosa_aceita, 0) = 1
          OR COALESCE(d.classificacao_glosa, 'pendente') IN ('aceitar','auto_aceitar')
        )`;
        const recursoCondicao = `(
          COALESCE(d.classificacao_glosa, 'pendente') NOT IN ('aceitar','auto_aceitar')
          AND (
            COALESCE(d.recurso_status, 'sem_recurso') IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido')
            OR COALESCE(d.classificacao_glosa, 'pendente') IN ('recursar','auto_recursar')
          )
        )`;
        const pendenteCondicao = `(
          CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2)) > 0
          AND NOT (${aceiteCondicao})
          AND NOT (${recursoCondicao})
        )`;
        const resumoFiltro = construirFiltroPainelGlosas(input);
        const mesFiltro = construirFiltroPainelGlosas(input, "mesPagamento");
        const convenioFiltro = construirFiltroPainelGlosas(input, "convenio");
        const itemFiltro = construirFiltroPainelGlosas(input, "item");
        const procedimentoFiltro = construirFiltroPainelGlosas(input, "procedimento");
        const motivoFiltro = construirFiltroPainelGlosas(input, "motivo");

        const [resumoRows] = await conn.execute<any[]>(`
          SELECT
            SUM(CAST(COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS total_processado,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS total_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS total_glosa,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS total_itens_glosados,
            COUNT(DISTINCT CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN d.numero_guia END) AS total_guias_glosadas,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente
          ${joinBase}
          ${resumoFiltro.where}
        `, resumoFiltro.params);
        const resumo = montarResumoGlosas(resumoRows[0] || {});

        const [mesRows] = await conn.execute<any[]>(`
          SELECT
            DATE_FORMAT(d.data_pagamento, '%Y/%m') AS mes_pagamento,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS valor_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS valor_glosado,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS qtd_itens
          ${joinBase}
          ${mesFiltro.where} AND d.data_pagamento IS NOT NULL
          GROUP BY DATE_FORMAT(d.data_pagamento, '%Y/%m')
          HAVING SUM(COALESCE(d.valor_glosa, 0)) > 0
          ORDER BY mes_pagamento DESC
          LIMIT 18
        `, mesFiltro.params);

        const limite = input.limite;
        const [convenioRows] = await conn.execute<any[]>(`
          SELECT
            d.convenio_id AS convenio_id,
            COALESCE(NULLIF(TRIM(c.nome), ''), CONCAT('Convênio ', d.convenio_id)) AS nome,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS valor_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS valor_glosado,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS qtd_itens
          ${joinBase}
          ${convenioFiltro.where}
          GROUP BY d.convenio_id, c.nome
          HAVING SUM(COALESCE(d.valor_glosa, 0)) > 0
          ORDER BY valor_glosado DESC
          LIMIT ${limite}
        `, convenioFiltro.params);

        const [itemRows] = await conn.execute<any[]>(`
          SELECT
            MIN(NULLIF(TRIM(d.codigo_item), '')) AS codigo_item,
            COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Item sem descrição') AS nome,
            COALESCE(NULLIF(TRIM(d.tipo_lancamento), ''), 'Não informado') AS tipo_lancamento,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS valor_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS valor_glosado,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS qtd_itens
          ${joinBase}
          ${itemFiltro.where}
          GROUP BY COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Item sem descrição'), COALESCE(NULLIF(TRIM(d.tipo_lancamento), ''), 'Não informado')
          HAVING SUM(COALESCE(d.valor_glosa, 0)) > 0
          ORDER BY valor_glosado DESC
          LIMIT ${limite}
        `, itemFiltro.params);

        const [procedimentoRows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(NULLIF(TRIM(d.codigo_item), ''), 'S/CÓDIGO') AS codigo_item,
            MIN(COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Procedimento sem descrição')) AS nome,
            COALESCE(NULLIF(TRIM(d.tipo_lancamento), ''), 'Não informado') AS tipo_lancamento,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS valor_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS valor_glosado,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS qtd_itens
          ${joinBase}
          ${procedimentoFiltro.where}
          GROUP BY COALESCE(NULLIF(TRIM(d.codigo_item), ''), 'S/CÓDIGO'), COALESCE(NULLIF(TRIM(d.tipo_lancamento), ''), 'Não informado')
          HAVING SUM(COALESCE(d.valor_glosa, 0)) > 0
          ORDER BY valor_glosado DESC
          LIMIT ${limite}
        `, procedimentoFiltro.params);

        const [motivoRows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(NULLIF(TRIM(d.codigo_glosa), ''), 'S/MOTIVO') AS codigo_glosa,
            COALESCE(NULLIF(TRIM(mg.descricaoSimplificada), ''), NULLIF(TRIM(mg.descricao), ''), 'Motivo não cadastrado') AS nome,
            COALESCE(NULLIF(TRIM(mg.grupo), ''), 'Outros') AS categoria,
            SUM(CAST(COALESCE(d.valor_pago, 0) AS DECIMAL(14,2))) AS valor_pago,
            SUM(CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2))) AS valor_glosado,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_sem_recurso,
            SUM(CASE WHEN ${aceiteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_aceita,
            SUM(CASE WHEN ${recursoCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_recursada,
            SUM(CASE WHEN ${pendenteCondicao} THEN CAST(d.valor_glosa AS DECIMAL(14,2)) ELSE 0 END) AS glosa_pendente,
            SUM(CASE WHEN COALESCE(d.valor_glosa, 0) > 0 THEN 1 ELSE 0 END) AS qtd_itens
          ${joinBase}
          ${motivoFiltro.where}
          GROUP BY d.codigo_glosa, mg.descricaoSimplificada, mg.descricao, mg.grupo
          HAVING SUM(COALESCE(d.valor_glosa, 0)) > 0
          ORDER BY valor_glosado DESC
          LIMIT ${limite}
        `, motivoFiltro.params);

        const [analiseRows] = await conn.execute<any[]>(`
          WITH candidatos_base AS (
            SELECT d.estabelecimentoId, d.convenio_id,
              TRIM(COALESCE(d.codigo_item,'')) AS codigo_item,
              ROUND(COALESCE(d.valor_glosa,0),2) AS valor_glosa,
              DATE_FORMAT(d.data_pagamento,'%Y/%m') AS mes_pagamento,
              COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição') AS item_descricao,
              COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO') AS motivo_codigo,
              COALESCE(NULLIF(TRIM(mgd.grupo),''),'Outros') AS categoria_glosa
            FROM demonstrativo d
            LEFT JOIN motivosGlosa mgd ON mgd.codigo=d.codigo_glosa AND mgd.ativo='sim'
            WHERE COALESCE(d.valor_glosa,0)>0

            UNION ALL

            SELECT re.estabelecimentoId, re.convenioId,
              TRIM(COALESCE(re.item,'')), ROUND(COALESCE(re.valor_glosa,0),2),
              DATE_FORMAT(COALESCE(re.data_pagamento,re.data_pagamento_upload,re.data_pagto),'%Y/%m'),
              COALESCE(NULLIF(TRIM(re.item_desc),''),'Item sem descrição'),
              COALESCE(NULLIF(TRIM(re.codigo_glosa),''),'S/MOTIVO'),
              COALESCE(NULLIF(TRIM(mgre.grupo),''),'Outros')
            FROM recebimentos_excel re
            LEFT JOIN motivosGlosa mgre ON mgre.codigo=re.codigo_glosa AND mgre.ativo='sim'
            WHERE COALESCE(re.valor_glosa,0)>0

            UNION ALL

            SELECT ca.estabelecimentoId, ca.convenioId,
              TRIM(COALESCE(ca.codigoItem,'')), ROUND(COALESCE(ca.valorGlosa,0),2),
              NULLIF(TRIM(ca.competenciaPagamento),''),
              COALESCE(NULLIF(TRIM(ca.descricaoItem),''),'Item sem descrição'),
              COALESCE(NULLIF(TRIM(ca.codigoGlosa),''),'S/MOTIVO'),
              COALESCE(NULLIF(TRIM(mgca.grupo),''),'Outros')
            FROM conciliados_automatico ca
            LEFT JOIN motivosGlosa mgca ON mgca.codigo=ca.codigoGlosa AND mgca.ativo='sim'
            WHERE COALESCE(ca.valorGlosa,0)>0
          ),
          candidatos AS (
            SELECT estabelecimentoId, convenio_id, codigo_item, valor_glosa,
              MIN(mes_pagamento) AS mes_pagamento,
              MIN(item_descricao) AS item_descricao,
              MIN(motivo_codigo) AS motivo_codigo,
              MIN(categoria_glosa) AS categoria_glosa
            FROM candidatos_base
            GROUP BY estabelecimentoId, convenio_id, codigo_item, valor_glosa
          ),
          mapa_candidatos AS (
            SELECT convenio_id, codigo_item, valor_glosa,
              COUNT(DISTINCT estabelecimentoId) AS qtd_estabelecimentos,
              MIN(estabelecimentoId) AS estabelecimento_id
            FROM candidatos
            GROUP BY convenio_id, codigo_item, valor_glosa
          )
          SELECT
            'aceita' AS tipo,
            CAST(COALESCE(d.valor_glosa, 0) AS DECIMAL(14,2)) AS valor,
            DATE_FORMAT(d.data_pagamento, '%Y/%m') AS mes_pagamento,
            d.convenio_id,
            COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Item sem descrição') AS item_descricao,
            COALESCE(NULLIF(TRIM(d.codigo_item), ''), 'S/CÓDIGO') AS procedimento_codigo,
            COALESCE(NULLIF(TRIM(d.codigo_glosa), ''), 'S/MOTIVO') AS motivo_codigo,
            COALESCE(NULLIF(TRIM(mg.grupo), ''), 'Outros') AS categoria_glosa,
            1 AS vinculado_demonstrativo,
            'demonstrativo' AS fonte,
            'aceita' AS status_recurso,
            d.recurso_id AS lote_id,
            lr.numeroLote AS numero_lote,
            COALESCE(c.nome, CONCAT('Convênio ', d.convenio_id)) AS convenio_nome,
            DATE_FORMAT(d.glosa_aceita_em, '%Y-%m-%d') AS data_criacao,
            DATE_FORMAT(lr.dataEnvio, '%Y-%m-%d') AS data_envio
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
          LEFT JOIN lotesRecurso lr ON lr.id = d.recurso_id AND lr.estabelecimentoId = d.estabelecimentoId
          WHERE d.estabelecimentoId = ?
            AND COALESCE(d.valor_glosa, 0) > 0
            AND ${aceiteCondicao}

          UNION ALL

          SELECT
            'aceita' AS tipo,
            CAST(COALESCE(dg.valorGlosado,0) AS DECIMAL(14,2)) AS valor,
            NULL AS mes_pagamento,
            dg.convenioId AS convenio_id,
            COALESCE(ck.item_descricao,NULLIF(TRIM(dg.codigoProcedimento),''),'Item sem descrição') AS item_descricao,
            COALESCE(NULLIF(TRIM(dg.codigoProcedimento),''),'S/CÓDIGO') AS procedimento_codigo,
            COALESCE(NULLIF(TRIM(ck.motivo_codigo),''),NULLIF(TRIM(dg.codigoGlosa),''),'S/MOTIVO') AS motivo_codigo,
            COALESCE(NULLIF(TRIM(ck.categoria_glosa),''),'Outros') AS categoria_glosa,
            0 AS vinculado_demonstrativo,
            'decisoesGlosa' AS fonte,
            'aceita_historica' AS status_recurso,
            NULL AS lote_id,
            NULL AS numero_lote,
            COALESCE(cdg.nome,CONCAT('Convênio ',dg.convenioId)) AS convenio_nome,
            DATE_FORMAT(dg.createdAt,'%Y-%m-%d') AS data_criacao,
            NULL AS data_envio
          FROM decisoesGlosa dg
          INNER JOIN mapa_candidatos mc
            ON mc.convenio_id=dg.convenioId
            AND mc.codigo_item=TRIM(COALESCE(dg.codigoProcedimento,''))
            AND mc.valor_glosa=ROUND(COALESCE(dg.valorGlosado,0),2)
          INNER JOIN candidatos ck
            ON ck.estabelecimentoId=?
            AND ck.convenio_id=dg.convenioId
            AND ck.codigo_item=TRIM(COALESCE(dg.codigoProcedimento,''))
            AND ck.valor_glosa=ROUND(COALESCE(dg.valorGlosado,0),2)
          LEFT JOIN convenios cdg ON cdg.id=dg.convenioId
          WHERE dg.decisao='aceitar'
            AND mc.qtd_estabelecimentos=1
            AND mc.estabelecimento_id=?
            AND NOT EXISTS (
              SELECT 1 FROM demonstrativo datual
              WHERE datual.id=dg.procedimentoId
                AND datual.estabelecimentoId=?
                AND COALESCE(datual.valor_glosa,0)>0
                AND (
                  COALESCE(datual.glosa_aceita,0)=1
                  OR COALESCE(datual.classificacao_glosa,'pendente') IN ('aceitar','auto_aceitar')
                )
            )

          UNION ALL

          SELECT
            'recursada' AS tipo,
            CAST(COALESCE(NULLIF(rg.valorGlosado, 0), rg.valorCobrado, 0) AS DECIMAL(14,2)) AS valor,
            DATE_FORMAT(dm.data_pagamento, '%Y/%m') AS mes_pagamento,
            rg.convenioId AS convenio_id,
            COALESCE(dm.item_descricao, NULLIF(TRIM(rg.descricaoProcedimento), ''), 'Item sem descrição') AS item_descricao,
            COALESCE(dm.procedimento_codigo, NULLIF(TRIM(rg.codigoProcedimento), ''), 'S/CÓDIGO') AS procedimento_codigo,
            COALESCE(dm.motivo_codigo, CASE
              WHEN TRIM(SUBSTRING_INDEX(COALESCE(rg.motivoGlosaConvenio, ''), '-', 1)) REGEXP '^[0-9]+$'
                THEN TRIM(SUBSTRING_INDEX(rg.motivoGlosaConvenio, '-', 1))
              ELSE 'S/MOTIVO'
            END) AS motivo_codigo,
            COALESCE(dm.categoria_glosa, NULLIF(TRIM(rgmg.grupo), ''), 'Outros') AS categoria_glosa,
            CASE WHEN dm.numero_guia IS NULL THEN 0 ELSE 1 END AS vinculado_demonstrativo,
            'recursosGlosa' AS fonte,
            rg.status AS status_recurso,
            rg.loteId AS lote_id,
            lr.numeroLote AS numero_lote,
            COALESCE(c.nome, CONCAT('Convênio ', rg.convenioId)) AS convenio_nome,
            DATE_FORMAT(rg.createdAt, '%Y-%m-%d') AS data_criacao,
            DATE_FORMAT(lr.dataEnvio, '%Y-%m-%d') AS data_envio
          FROM recursosGlosa rg
          LEFT JOIN (
            SELECT
              d.estabelecimentoId,
              d.numero_guia,
              TRIM(COALESCE(d.codigo_item, '')) AS codigo_item_match,
              ROUND(COALESCE(d.valor_glosa, 0), 2) AS valor_glosa_match,
              MIN(d.data_pagamento) AS data_pagamento,
              MIN(COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Item sem descrição')) AS item_descricao,
              MIN(COALESCE(NULLIF(TRIM(d.codigo_item), ''), 'S/CÓDIGO')) AS procedimento_codigo,
              MIN(COALESCE(NULLIF(TRIM(d.codigo_glosa), ''), 'S/MOTIVO')) AS motivo_codigo,
              MIN(COALESCE(NULLIF(TRIM(mg2.grupo), ''), 'Outros')) AS categoria_glosa
            FROM demonstrativo d
            LEFT JOIN motivosGlosa mg2 ON mg2.codigo = d.codigo_glosa AND mg2.ativo = 'sim'
            WHERE d.estabelecimentoId = ? AND COALESCE(d.valor_glosa, 0) > 0
            GROUP BY d.estabelecimentoId, d.numero_guia, TRIM(COALESCE(d.codigo_item, '')), ROUND(COALESCE(d.valor_glosa, 0), 2)
          ) dm
            ON dm.estabelecimentoId = rg.estabelecimentoId
            AND dm.numero_guia = rg.guiaNumero
            AND dm.codigo_item_match = TRIM(COALESCE(rg.codigoProcedimento, ''))
            AND dm.valor_glosa_match = ROUND(COALESCE(rg.valorGlosado, 0), 2)
          LEFT JOIN convenios c ON c.id = rg.convenioId
          LEFT JOIN motivosGlosa rgmg
            ON rgmg.codigo = TRIM(SUBSTRING_INDEX(COALESCE(rg.motivoGlosaConvenio, ''), '-', 1))
            AND rgmg.ativo = 'sim'
          LEFT JOIN lotesRecurso lr ON lr.id = rg.loteId AND lr.estabelecimentoId = rg.estabelecimentoId
          WHERE rg.estabelecimentoId = ?
            AND rg.status <> 'cancelado'
            AND COALESCE(NULLIF(rg.valorGlosado, 0), rg.valorCobrado, 0) > 0

          UNION ALL

          SELECT
            'recursada' AS tipo,
            CAST(COALESCE(NULLIF(d.valor_recurso, 0), d.valor_glosa, 0) AS DECIMAL(14,2)) AS valor,
            DATE_FORMAT(d.data_pagamento, '%Y/%m') AS mes_pagamento,
            d.convenio_id,
            COALESCE(NULLIF(TRIM(d.descricao_item), ''), 'Item sem descrição') AS item_descricao,
            COALESCE(NULLIF(TRIM(d.codigo_item), ''), 'S/CÓDIGO') AS procedimento_codigo,
            COALESCE(NULLIF(TRIM(d.codigo_glosa), ''), 'S/MOTIVO') AS motivo_codigo,
            COALESCE(NULLIF(TRIM(mg.grupo), ''), 'Outros') AS categoria_glosa,
            1 AS vinculado_demonstrativo,
            'demonstrativo' AS fonte,
            d.recurso_status AS status_recurso,
            d.recurso_id AS lote_id,
            lr.numeroLote AS numero_lote,
            COALESCE(c.nome, CONCAT('Convênio ', d.convenio_id)) AS convenio_nome,
            DATE_FORMAT(d.data_importacao_sistema, '%Y-%m-%d') AS data_criacao,
            DATE_FORMAT(lr.dataEnvio, '%Y-%m-%d') AS data_envio
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
          LEFT JOIN lotesRecurso lr ON lr.id = d.recurso_id AND lr.estabelecimentoId = d.estabelecimentoId
          WHERE d.estabelecimentoId = ?
            AND COALESCE(d.valor_glosa, 0) > 0
            AND ${recursoCondicao}
            AND NOT EXISTS (
              SELECT 1
              FROM recursosGlosa rg
              WHERE rg.estabelecimentoId = d.estabelecimentoId
                AND rg.status <> 'cancelado'
                AND rg.guiaNumero = d.numero_guia
                AND TRIM(COALESCE(rg.codigoProcedimento, '')) = TRIM(COALESCE(d.codigo_item, ''))
                AND ROUND(COALESCE(rg.valorGlosado, 0), 2) = ROUND(COALESCE(d.valor_glosa, 0), 2)
            )
        `, [
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
          input.estabelecimentoId,
        ]);

        const eventosAnalise: EventoAnaliseGlosa[] = analiseRows.map((row: any) => ({
          tipo: row.tipo === "aceita" ? "aceita" : "recursada",
          valor: Number(row.valor || 0),
          mesPagamento: row.mes_pagamento ? String(row.mes_pagamento) : null,
          convenioId: row.convenio_id == null ? null : Number(row.convenio_id),
          itemDescricao: row.item_descricao ? String(row.item_descricao) : "Item sem descrição",
          procedimentoCodigo: row.procedimento_codigo ? String(row.procedimento_codigo) : "S/CÓDIGO",
          motivoCodigo: row.motivo_codigo ? String(row.motivo_codigo) : "S/MOTIVO",
          categoriaGlosa: row.categoria_glosa ? String(row.categoria_glosa) : "Outros",
          vinculadoAoDemonstrativo: Number(row.vinculado_demonstrativo) === 1,
          fonte: row.fonte === "recursosGlosa" ? "recursosGlosa" : row.fonte === "decisoesGlosa" ? "decisoesGlosa" : "demonstrativo",
          statusRecurso: row.status_recurso ? String(row.status_recurso) : null,
          loteId: row.lote_id == null ? null : Number(row.lote_id),
          numeroLote: row.numero_lote ? String(row.numero_lote) : null,
          convenioNome: row.convenio_nome ? String(row.convenio_nome) : null,
          dataCriacao: row.data_criacao ? String(row.data_criacao) : null,
          dataEnvio: row.data_envio ? String(row.data_envio) : null,
        }));

        const aplicarAnaliseResumo = () => {
          const eventos = filtrarEventosAnaliseGlosa(eventosAnalise, input);
          const totais = resumirEventosAnaliseGlosa(eventos, resumo.valorGlosado);
          return {
            eventos,
            resumoConsolidado: {
              ...resumo,
              ...totais,
            valorAnalisado: totais.glosaAceita + totais.glosaRecursada,
            percentualAceito: percentualGlosa(totais.glosaAceita, resumo.valorGlosado),
            percentualRecursado: percentualGlosa(totais.glosaRecursada, resumo.valorGlosado),
            percentualAnalisado: percentualGlosa(totais.glosaAceita + totais.glosaRecursada, resumo.valorGlosado),
            },
          };
        };

        const aplicarAnaliseRanking = (
          rows: any[],
          dimensao: DimensaoFiltroCruzado,
          chave: (row: any) => string | number,
        ) => {
          const eventos = filtrarEventosAnaliseGlosa(eventosAnalise, input, dimensao);
          const agrupados = agruparEventosAnaliseGlosa(eventos, dimensao);
          return rows.map((row) => {
            const analise = agrupados.get(String(chave(row))) ?? { glosaAceita: 0, glosaRecursada: 0 };
            const valorGlosado = Number(row.valorGlosado || 0);
            const glosaRecursada = Math.min(valorGlosado, analise.glosaRecursada);
            const glosaAceita = Math.min(Math.max(0, valorGlosado - glosaRecursada), analise.glosaAceita);
            const glosaPendente = Math.max(0, Number((valorGlosado - glosaAceita - glosaRecursada).toFixed(2)));
            return {
              ...row,
              glosaAceita: Number(glosaAceita.toFixed(2)),
              glosaRecursada: Number(glosaRecursada.toFixed(2)),
              glosaPendente,
              glosaSemRecurso: glosaPendente,
            };
          });
        };

        const { eventos: eventosResumo, resumoConsolidado } = aplicarAnaliseResumo();
        const montarRankingBase = (rows: any[]) => complementarRankingGlosa(rows, resumo.valorGlosado);
        const porMesPagamento = aplicarAnaliseRanking(
          montarRankingBase([...mesRows].reverse().map((row: any) => ({ ...row, mesPagamento: row.mes_pagamento }))),
          "mesPagamento",
          (row) => row.mesPagamento,
        );
        const porConvenio = aplicarAnaliseRanking(
          montarRankingBase(convenioRows.map((row: any) => ({ ...row, convenioId: Number(row.convenio_id), nome: String(row.nome) }))),
          "convenio",
          (row) => row.convenioId,
        );
        const porItem = aplicarAnaliseRanking(
          montarRankingBase(itemRows.map((row: any) => ({ ...row, codigoItem: row.codigo_item, nome: String(row.nome), tipoLancamento: String(row.tipo_lancamento) }))),
          "item",
          (row) => row.nome,
        );
        const porProcedimento = aplicarAnaliseRanking(
          montarRankingBase(procedimentoRows.map((row: any) => ({ ...row, codigoItem: String(row.codigo_item), nome: String(row.nome), tipoLancamento: String(row.tipo_lancamento) }))),
          "procedimento",
          (row) => row.codigoItem,
        );
        const porMotivo = aplicarAnaliseRanking(
          montarRankingBase(motivoRows.map((row: any) => ({ ...row, codigoGlosa: String(row.codigo_glosa), nome: String(row.nome), categoria: String(row.categoria) }))),
          "motivo",
          (row) => row.codigoGlosa,
        );

        const lotesMap = new Map<string, any>();
        for (const evento of eventosResumo.filter((item) => item.tipo === "recursada")) {
          const chave = evento.loteId ? `lote:${evento.loteId}` : `pendente:${evento.convenioId ?? "sem-convenio"}`;
          const atual = lotesMap.get(chave) ?? {
            loteId: evento.loteId ?? null,
            numeroLote: evento.numeroLote ?? null,
            convenioId: evento.convenioId ?? null,
            convenioNome: evento.convenioNome ?? "Convênio não identificado",
            status: evento.loteId ? (evento.statusRecurso ?? "enviado") : "aguardando_lote",
            dataCriacao: evento.dataCriacao ?? null,
            dataEnvio: evento.dataEnvio ?? null,
            quantidadeItens: 0,
            valorRecursado: 0,
            itensSemVinculoAtual: 0,
          };
          atual.quantidadeItens += 1;
          atual.valorRecursado += evento.valor;
          if (evento.vinculadoAoDemonstrativo === false) atual.itensSemVinculoAtual += 1;
          if (evento.dataCriacao && (!atual.dataCriacao || evento.dataCriacao < atual.dataCriacao)) atual.dataCriacao = evento.dataCriacao;
          if (evento.dataEnvio && (!atual.dataEnvio || evento.dataEnvio < atual.dataEnvio)) atual.dataEnvio = evento.dataEnvio;
          lotesMap.set(chave, atual);
        }
        const lotesRecursos = [...lotesMap.values()]
          .map((lote) => ({ ...lote, valorRecursado: Number(lote.valorRecursado.toFixed(2)) }))
          .sort((a, b) => String(b.dataEnvio || b.dataCriacao || "").localeCompare(String(a.dataEnvio || a.dataCriacao || "")));

        return {
          resumo: resumoConsolidado,
          porMesPagamento,
          porConvenio,
          porItem,
          porProcedimento,
          porMotivo,
          recursosAnalisados: {
            quantidadeAceita: eventosResumo.filter((item) => item.tipo === "aceita").length,
            quantidadeAceitaHistorica: eventosResumo.filter((item) => item.tipo === "aceita" && item.fonte === "decisoesGlosa").length,
            valorAceitaHistorica: Number(eventosResumo.filter((item) => item.tipo === "aceita" && item.fonte === "decisoesGlosa").reduce((total, item) => total + item.valor, 0).toFixed(2)),
            quantidadeAceitaHistoricaSemPeriodo: eventosResumo.filter((item) => item.tipo === "aceita" && item.fonte === "decisoesGlosa" && !item.mesPagamento).length,
            quantidadeRecursada: eventosResumo.filter((item) => item.tipo === "recursada").length,
            quantidadeHistoricaSemVinculo: eventosResumo.filter((item) => item.tipo === "recursada" && item.vinculadoAoDemonstrativo === false).length,
            valorHistoricoSemVinculo: resumoConsolidado.glosaRecursadaHistoricaSemVinculo,
            lotes: lotesRecursos,
          },
        };
      } finally {
        await conn.end();
      }
    }),

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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
        // VALOR FATURADO = XML (faturamento_tiss) ou banco do cliente
        const valorFaturado = totalFaturadoTiss;
        // VALOR COBRADO = valor_pago + valor_glosa (do demonstrativo)
        const valorCobrado = Number(kpi.total_pago) + Number(kpi.total_glosa);
        // % TAXA DE GLOSA = GLOSADO / COBRADO
        const taxaGlosa = valorCobrado > 0
          ? (Number(kpi.total_glosa) / valorCobrado) * 100
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
          valorFaturado,
          valorCobrado,
          totalFaturadoTiss,
          totalInformado: valorCobrado, // backward compat
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
            DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') as competencia,
            COUNT(CASE WHEN d.valor_glosa > 0 THEN 1 END) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            COUNT(DISTINCT d.numero_guia) as total_guias
          FROM demonstrativo d
          ${demoWhere}
          AND COALESCE(d.data_referencia, d.data_pagamento) IS NOT NULL
          GROUP BY DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m')
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
          const faturadoXml = tissMap[r.competencia] || 0;
          const glosa = Number(r.total_glosa);
          const pago = Number(r.total_pago);
          const cobrado = pago + glosa; // Cobrado = Pago + Glosado (sempre do demonstrativo)
          return {
            competencia: r.competencia,
            totalGlosados: Number(r.total_glosados),
            totalInformado: cobrado, // Cobrado = pago + glosa
            totalFaturadoXml: faturadoXml, // Faturado do XML separado
            totalGlosa: glosa,
            totalPago: pago,
            totalGuias: Number(r.total_guias),
            taxaGlosa: cobrado > 0
              ? Number(((glosa / cobrado) * 100).toFixed(2))
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }

        // Buscar totais GERAIS por convênio (todos os itens) para calcular Cobrado corretamente
        const paramsAll: any[] = [input.estabelecimentoId];
        let whereAll = "WHERE d.estabelecimentoId = ?";
        if (input.competenciaInicio) {
          whereAll += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          paramsAll.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          whereAll += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
          paramsAll.push(input.competenciaFim);
        }

        const [rows] = await conn.execute<any[]>(`
          SELECT
            c.nome as convenio,
            d.convenio_id,
            SUM(CASE WHEN d.valor_glosa > 0 THEN 1 ELSE 0 END) as total_glosados,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado,
            SUM(CAST(d.valor_pago AS DECIMAL(12,2))) as total_pago,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          ${whereAll}
          GROUP BY d.convenio_id, c.nome
          HAVING total_glosa > 0
          ORDER BY total_glosa DESC
        `, paramsAll);

        return rows.map(r => {
          const pago = Number(r.total_pago || 0);
          const glosa = Number(r.total_glosa);
          const cobrado = pago + glosa;
          return {
            convenio: r.convenio || `Convênio ${r.convenio_id}`,
            convenioId: r.convenio_id,
            totalGlosados: Number(r.total_glosados),
            totalInformado: Number(r.total_informado),
            totalPago: pago,
            totalGlosa: glosa,
            totalRecuperado: Number(r.total_recuperado),
            taxaGlosa: cobrado > 0
              ? Number(((glosa / cobrado) * 100).toFixed(2))
              : 0,
          };
        });
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
        const limite = Math.max(1, Math.min(100, Number(input.limite) || 20));
        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.codigo_glosa, 'S/MOTIVO') as codigo_glosa,
            mg.descricao as descricao_dicionario,
            mg.grupo as grupo_dicionario,
            mg.descricaoSimplificada as descricao_simplificada,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CASE WHEN d.recurso_status = 'recurso_deferido' THEN CAST(d.valor_glosa AS DECIMAL(12,2)) ELSE 0 END) as total_recuperado
          FROM demonstrativo d
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
          ${where}
          GROUP BY d.codigo_glosa, mg.descricao, mg.grupo, mg.descricaoSimplificada
          ORDER BY total_glosa DESC
          LIMIT ${limite}
        `, params);

        return rows.map(r => {
          const cod = r.codigo_glosa === 'S/MOTIVO' ? null : r.codigo_glosa;
          const isNumerico = cod ? /^\d+$/.test(cod.trim()) : false;
          let descricao: string;
          let grupo: string | null;
          let descSimplificada: string | null;

          if (r.descricao_dicionario) {
            // Encontrou na tabela motivosGlosa
            descricao = isNumerico ? `${cod} - ${r.descricao_dicionario}` : r.descricao_dicionario;
            grupo = r.grupo_dicionario || getGrupoFromCodigo(cod);
            descSimplificada = r.descricao_simplificada || getDescricaoSimplificada(cod);
          } else {
            // Não encontrou na tabela - resolver localmente
            descricao = getMotivoDescricao(cod);
            grupo = getGrupoFromCodigo(cod);
            descSimplificada = getDescricaoSimplificada(cod);
          }

          return {
            codigoGlosa: r.codigo_glosa,
            descricao,
            grupo,
            descricaoSimplificada: descSimplificada,
            totalGlosados: Number(r.total_glosados),
            totalGlosa: Number(r.total_glosa),
            totalRecuperado: Number(r.total_recuperado),
            taxaRecuperacao: r.total_glosa > 0
              ? Number(((Number(r.total_recuperado) / Number(r.total_glosa)) * 100).toFixed(2))
              : 0,
          };
        });
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
            COALESCE(d.data_referencia, d.data_pagamento) as data_referencia,
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
            DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') as competencia,
            COALESCE(d.codigo_glosa, 'S/MOTIVO') as codigo_glosa,
            COUNT(*) as total_glosados,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
          FROM demonstrativo d
          WHERE d.estabelecimentoId = ? AND d.convenio_id = ? AND d.valor_glosa > 0
          GROUP BY DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m'), d.codigo_glosa
          ORDER BY competencia DESC, total_glosa DESC
          LIMIT ${Math.max(1, Math.min(5000, Number(input.meses) * 20 || 240))}
        `, [input.estabelecimentoId, input.convenioId]);

        // Agrupar por competência
        const porCompetencia: Record<string, any[]> = {};
        for (const r of rows) {
          if (!porCompetencia[r.competencia]) porCompetencia[r.competencia] = [];
          porCompetencia[r.competencia].push({
            codigoGlosa: r.codigo_glosa,
            descricao: getMotivoDescricao(r.codigo_glosa === 'S/MOTIVO' ? null : r.codigo_glosa),
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
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await validarAcessoPainelGlosas(ctx, input.estabelecimentoId);
      const mysql2 = await import("mysql2/promise");
      const databaseUrl = getApplicationDatabaseUrl();
      if (!databaseUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });
      }
      const conn = await mysql2.createConnection(databaseUrl);
      try {
        const estabParams = [input.estabelecimentoId];

        const [convenios] = await conn.execute<any[]>(`
          SELECT DISTINCT c.id, c.nome
          FROM demonstrativo d
          LEFT JOIN convenios c ON c.id = d.convenio_id
          WHERE d.valor_glosa > 0 AND c.id IS NOT NULL AND d.estabelecimentoId = ?
          ORDER BY c.nome
        `, estabParams);

        const [competencias] = await conn.execute<any[]>(`
          SELECT DISTINCT DATE_FORMAT(data_pagamento, '%Y/%m') as competencia
          FROM demonstrativo
          WHERE valor_glosa > 0 AND data_pagamento IS NOT NULL AND estabelecimentoId = ?
          ORDER BY competencia DESC
        `, estabParams);

        const [tipos] = await conn.execute<any[]>(`
          SELECT DISTINCT tipo_lancamento
          FROM demonstrativo
          WHERE valor_glosa > 0 AND tipo_lancamento IS NOT NULL AND tipo_lancamento != '' AND estabelecimentoId = ?
          ORDER BY tipo_lancamento
        `, estabParams);

        const [categorias] = await conn.execute<any[]>(`
          SELECT DISTINCT COALESCE(NULLIF(TRIM(mg.grupo), ''), 'Outros') AS categoria
          FROM demonstrativo d
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
          WHERE d.valor_glosa > 0 AND d.estabelecimentoId = ?
          ORDER BY categoria
        `, estabParams);

        return {
          convenios: convenios.map(c => ({ id: c.id, nome: c.nome })),
          competencias: competencias.map(c => c.competencia),
          tiposLancamento: tipos.map(t => t.tipo_lancamento),
          categoriasGlosa: categorias.map(c => c.categoria).filter(Boolean),
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
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
            MIN(DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m')) as competencia_inicio,
            MAX(DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m')) as competencia_fim
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
      estabelecimentoId: z.number().int().positive(),
      competencia1: z.string(), // YYYY/MM
      competencia2: z.string(), // YYYY/MM
      convenioId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await validarAcessoPainelGlosas(ctx, input.estabelecimentoId);
      const mysql2 = await import("mysql2/promise");
      const databaseUrl = getApplicationDatabaseUrl();
      if (!databaseUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });
      }
      const conn = await mysql2.createConnection(databaseUrl);
      try {
        const getKpiMes = async (competencia: string) => {
          const params: any[] = [input.estabelecimentoId, competencia];
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') = ?";
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
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') = ? AND d.valor_glosa > 0";
          if (input.convenioId) { where += " AND d.convenio_id = ?"; params.push(input.convenioId); }
          const [rows] = await conn.execute<any[]>(`
            SELECT
              COALESCE(d.codigo_glosa, 'S/MOTIVO') as codigo_glosa,
              SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa
            FROM demonstrativo d ${where}
            GROUP BY d.codigo_glosa ORDER BY total_glosa DESC LIMIT 5
          `, params);
          return rows.map(r => ({ codigo: r.codigo_glosa, descricao: getMotivoDescricao(r.codigo_glosa === 'S/MOTIVO' ? null : r.codigo_glosa), valor: Number(r.total_glosa) }));
        };

        const getTopConvenios = async (competencia: string) => {
          const params: any[] = [input.estabelecimentoId, competencia];
          let where = "WHERE d.estabelecimentoId = ? AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') = ? AND d.valor_glosa > 0";
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

  // Motivos de glosa por item (código glosa + descrição item + valor glosado + %)
  motivosPorItem: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      competenciaInicio: z.string().optional(),
      competenciaFim: z.string().optional(),
      limite: z.number().default(50),
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
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') >= ?";
          params.push(input.competenciaInicio);
        }
        if (input.competenciaFim) {
          where += " AND DATE_FORMAT(COALESCE(d.data_referencia, d.data_pagamento), '%Y/%m') <= ?";
          params.push(input.competenciaFim);
        }
        const limite = Math.max(1, Math.min(500, Number(input.limite) || 50));

        // Buscar total geral de glosa para calcular %
        const [totalRows] = await conn.execute<any[]>(`
          SELECT SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_geral
          FROM demonstrativo d
          ${where}
        `, params);
        const totalGeral = Number(totalRows[0]?.total_geral || 0);

        // Buscar motivos agrupados por código glosa + item
        const [rows] = await conn.execute<any[]>(`
          SELECT
            COALESCE(d.codigo_glosa, 'S/MOTIVO') as codigo_glosa,
            mg.descricao as motivo_descricao,
            mg.grupo as motivo_grupo,
            d.codigo_item,
            d.descricao_item,
            d.tipo_lancamento,
            COUNT(*) as qtd_itens,
            SUM(CAST(d.valor_glosa AS DECIMAL(12,2))) as total_glosa,
            SUM(CAST(d.valor_informado AS DECIMAL(12,2))) as total_informado
          FROM demonstrativo d
          LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa AND mg.ativo = 'sim'
          ${where}
          GROUP BY d.codigo_glosa, mg.descricao, mg.grupo, d.codigo_item, d.descricao_item, d.tipo_lancamento
          ORDER BY total_glosa DESC
          LIMIT ${limite}
        `, params);

        return {
          totalGeral,
          items: rows.map(r => ({
            codigoGlosa: r.codigo_glosa,
            descricaoGlosa: r.motivo_descricao || getMotivoDescricao(r.codigo_glosa),
            codigoItem: r.codigo_item,
            descricaoItem: r.descricao_item,
            tipoLancamento: r.tipo_lancamento,
            qtdItens: Number(r.qtd_itens),
            totalGlosa: Number(r.total_glosa),
            totalInformado: Number(r.total_informado),
            percentualGlosa: totalGeral > 0
              ? Number(((Number(r.total_glosa) / totalGeral) * 100).toFixed(2))
              : 0,
            taxaGlosaItem: Number(r.total_informado) > 0
              ? Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2))
              : 0,
          })),
        };
      } finally {
        await conn.end();
      }
    }),
});
