import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { reportProcedure, router } from "../_core/trpc";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";
import {
  agruparFinanceiro,
  calcularIndicadoresFinanceiros,
  consolidarRegistrosFinanceiros,
  normalizarConvenio,
  type RegistroFinanceiroUnificado,
} from "../faturadoRecebidoUnificadoService";

const inputSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  criterioPeriodo: z.enum(["PAGAMENTO", "FATURAMENTO"]).default("PAGAMENTO"),
  competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  convenio: z.string().min(1).max(255).optional(),
  limite: z.number().int().min(5).max(30).default(10),
});

async function validarAcesso(ctx: any, estabelecimentoId: number) {
  if (ctx.user?.role === "admin") return;
  const permitido = await verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, "visualizar");
  if (!permitido) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao estabelecimento selecionado" });
}

const relatorioProcedure = reportProcedure("relFaturadoRecebido");

export const faturadoRecebidoUnificadoRouter = router({
  dados: relatorioProcedure.input(inputSchema).query(async ({ input, ctx }) => {
    await validarAcesso(ctx, input.estabelecimentoId);
    const databaseUrl = getApplicationDatabaseUrl();
    if (!databaseUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });

    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection(databaseUrl);
    try {
      const porMesPagamento = input.criterioPeriodo === "PAGAMENTO";
      const [estabelecimentos] = await conn.execute<any[]>("SELECT id, nome FROM estabelecimentos WHERE id=? LIMIT 1", [input.estabelecimentoId]);
      const estabelecimento = estabelecimentos[0];
      if (!estabelecimento) throw new TRPCError({ code: "NOT_FOUND", message: "Estabelecimento não encontrado" });

      const fatParams: Array<string | number> = [input.estabelecimentoId];
      let fatWhere = `WHERE ci.estabelecimentoId = ?
        AND NOT EXISTS (
          SELECT 1
          FROM convenioEstabelecimentoPrestador cep_terceiro
          WHERE cep_terceiro.estabelecimentoId = ci.estabelecimentoId
            AND cep_terceiro.convenioId = ci.convenioId
            AND cep_terceiro.tipoPrestador = 'terceiro'
            AND TRIM(cep_terceiro.codigoPrestador) = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
        )
        AND (
          NOT EXISTS (
            SELECT 1
            FROM convenioEstabelecimentoPrestador cep_config
            WHERE cep_config.estabelecimentoId = ci.estabelecimentoId
              AND cep_config.convenioId = ci.convenioId
              AND cep_config.tipoPrestador = 'proprio'
              AND cep_config.ativo = 'sim'
          )
          OR EXISTS (
            SELECT 1
            FROM convenioEstabelecimentoPrestador cep_match
            WHERE cep_match.estabelecimentoId = ci.estabelecimentoId
              AND cep_match.convenioId = ci.convenioId
              AND cep_match.tipoPrestador = 'proprio'
              AND cep_match.ativo = 'sim'
              AND TRIM(cep_match.codigoPrestador) = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
          )
        )`;
      if (input.competencia) { fatWhere += " AND ci.competencia = ?"; fatParams.push(input.competencia); }
      if (input.convenio) { fatWhere += " AND TRIM(ci.convenio) = TRIM(?)"; fatParams.push(input.convenio); }

      const retParams: Array<string | number> = [
        input.estabelecimentoId,
        input.estabelecimentoId,
        input.estabelecimentoId,
        input.estabelecimentoId,
      ];
      const retornoVinculadoCte = `
        WITH prestadores_configurados AS (
          SELECT convenioId, TRIM(codigoPrestador) AS codigoPrestador, tipoPrestador, ativo
          FROM convenioEstabelecimentoPrestador
          WHERE estabelecimentoId = ?
        ), prestadores_proprios AS (
          SELECT convenioId, codigoPrestador FROM prestadores_configurados WHERE tipoPrestador='proprio' AND ativo='sim'
        ), prestadores_terceiros AS (
          SELECT convenioId, codigoPrestador FROM prestadores_configurados WHERE tipoPrestador='terceiro'
        ), faturado_base AS (
          SELECT ci.competencia, ci.convenioId,
            CONCAT_WS('|',ci.competencia,COALESCE(NULLIF(TRIM(ci.numeroConta),''),CONCAT('ID:',ci.id))) AS conta_chave,
            TRIM(COALESCE(ci.numeroGuia,'')) AS guia_prestador,
            TRIM(COALESCE(ci.numeroGuiaOperadora,'')) AS guia_operadora,
            TRIM(COALESCE(ci.codigoItem,'')) AS codigo_item,
            TRIM(COALESCE(ci.codigoItemTuss,'')) AS codigo_item_tuss,
            DATE(ci.dataExecucao) AS data_execucao
          FROM contas_convenio_itens ci
          WHERE ci.estabelecimentoId = ?
            AND ci.competencia IS NOT NULL AND ci.competencia <> ''
            AND NOT EXISTS (
              SELECT 1 FROM prestadores_terceiros pt
              WHERE pt.convenioId=ci.convenioId
                AND pt.codigoPrestador=TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
            )
            AND (
              NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = ci.convenioId)
              OR EXISTS (
                SELECT 1 FROM prestadores_proprios pp_match
                WHERE pp_match.convenioId = ci.convenioId
                  AND pp_match.codigoPrestador = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
              )
            )
        ), faturado_guias AS (
          SELECT competencia, convenioId, conta_chave, guia_prestador AS guia, codigo_item, codigo_item_tuss, data_execucao
          FROM faturado_base WHERE guia_prestador <> ''
          UNION
          SELECT competencia, convenioId, conta_chave, guia_operadora, codigo_item, codigo_item_tuss, data_execucao
          FROM faturado_base WHERE guia_operadora <> ''
        ), faturado_chaves AS (
          SELECT competencia, convenioId, conta_chave, guia, codigo_item AS codigo_item, data_execucao
          FROM faturado_guias WHERE codigo_item <> ''
          UNION
          SELECT competencia, convenioId, conta_chave, guia, codigo_item_tuss, data_execucao
          FROM faturado_guias WHERE codigo_item_tuss <> ''
        ), atribuicoes AS (
          SELECT d.id AS demonstrativo_id,
            MIN(f.competencia) AS competencia_faturada,
            COUNT(DISTINCT f.conta_chave) AS quantidade_contas
          FROM demonstrativo d
          JOIN faturado_chaves f
            ON f.convenioId = d.convenio_id
            AND f.guia = TRIM(COALESCE(d.numero_guia,''))
            AND f.codigo_item = TRIM(COALESCE(d.codigo_item,''))
            AND (f.data_execucao IS NULL OR d.data_execucao IS NULL OR f.data_execucao = d.data_execucao)
          WHERE d.estabelecimentoId = ?
          GROUP BY d.id
        ), vinculos_elegiveis AS (
          SELECT d.id AS demonstrativo_id, d.convenio_id,
            d.codigo_prestador, d.prestador_executante, d.codigo_prestador_pagamento,
            a.competencia_faturada
          FROM demonstrativo d
          JOIN atribuicoes a ON a.demonstrativo_id=d.id AND a.quantidade_contas=1
          WHERE NOT EXISTS (
            SELECT 1 FROM prestadores_terceiros pt
            WHERE pt.convenioId=d.convenio_id
              AND pt.codigoPrestador IN (
                TRIM(COALESCE(d.codigo_prestador,'')),
                TRIM(COALESCE(d.prestador_executante,'')),
                TRIM(COALESCE(d.codigo_prestador_pagamento,''))
              )
          )
        ), aliases_prestador_vinculados AS (
          SELECT v.convenio_id AS convenioId, TRIM(v.codigo_prestador) AS codigoPrestador
          FROM vinculos_elegiveis v
          WHERE TRIM(COALESCE(v.codigo_prestador,''))<>''
          UNION
          SELECT v.convenio_id, TRIM(v.prestador_executante)
          FROM vinculos_elegiveis v
          WHERE TRIM(COALESCE(v.prestador_executante,''))<>''
          UNION
          SELECT v.convenio_id, TRIM(v.codigo_prestador_pagamento)
          FROM vinculos_elegiveis v
          WHERE TRIM(COALESCE(v.codigo_prestador_pagamento,''))<>''
        ), retorno_final AS (
          SELECT d.*,
            v.competencia_faturada,
            DATE_FORMAT(d.data_referencia,'%Y/%m') AS competencia_informada,
            DATE_FORMAT(d.data_pagamento,'%Y/%m') AS mes_pagamento,
            CASE WHEN v.demonstrativo_id IS NOT NULL THEN 'vinculado' ELSE 'sem_vinculo' END AS status_vinculo
          FROM demonstrativo d
          LEFT JOIN vinculos_elegiveis v ON v.demonstrativo_id = d.id
          WHERE d.estabelecimentoId = ?
            AND NOT EXISTS (
              SELECT 1 FROM prestadores_terceiros pt
              WHERE pt.convenioId=d.convenio_id
                AND pt.codigoPrestador IN (
                  TRIM(COALESCE(d.codigo_prestador,'')),
                  TRIM(COALESCE(d.prestador_executante,'')),
                  TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                )
            )
            AND (
              NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = d.convenio_id)
              OR (
                v.demonstrativo_id IS NOT NULL
                  OR (
                    TRIM(COALESCE(d.codigo_prestador,'')) = ''
                    AND TRIM(COALESCE(d.prestador_executante,'')) = ''
                    AND TRIM(COALESCE(d.codigo_prestador_pagamento,'')) = ''
                  )
                  OR EXISTS (
                    SELECT 1 FROM prestadores_proprios pp_match
                    WHERE pp_match.convenioId = d.convenio_id
                      AND pp_match.codigoPrestador IN (
                        TRIM(COALESCE(d.codigo_prestador,'')),
                        TRIM(COALESCE(d.prestador_executante,'')),
                        TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                      )
                  )
                  OR EXISTS (
                    SELECT 1 FROM aliases_prestador_vinculados alias_match
                    WHERE alias_match.convenioId = d.convenio_id
                      AND alias_match.codigoPrestador IN (
                        TRIM(COALESCE(d.codigo_prestador,'')),
                        TRIM(COALESCE(d.prestador_executante,'')),
                        TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                      )
                  )
              )
            )
        )`;
      const periodoRetornoSql = porMesPagamento
        ? "d.mes_pagamento"
        : "COALESCE(d.competencia_faturada,d.competencia_informada)";
      let retWhere = "WHERE 1=1";
      if (input.competencia) { retWhere += ` AND ${periodoRetornoSql} = ?`; retParams.push(input.competencia); }
      if (input.convenio) { retWhere += " AND TRIM(c.nome) = TRIM(?)"; retParams.push(input.convenio); }

      const manualParams: Array<string | number> = [input.estabelecimentoId];
      let manualWhere = `WHERE fe.estabelecimento_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM convenios c_terceiro
          JOIN convenioEstabelecimentoPrestador cep_terceiro
            ON cep_terceiro.convenioId=c_terceiro.id
          WHERE cep_terceiro.estabelecimentoId=fe.estabelecimento_id
            AND cep_terceiro.tipoPrestador='terceiro'
            AND TRIM(c_terceiro.nome)=TRIM(fe.convenio)
            AND TRIM(cep_terceiro.codigoPrestador)=TRIM(COALESCE(fe.codigo_prestador,''))
        )
        AND (
          LOWER(TRIM(COALESCE(fe.origem, ''))) = 'manual'
          OR (
            NOT EXISTS (
              SELECT 1 FROM contas_convenio_itens ci_auto
              WHERE ci_auto.estabelecimentoId = fe.estabelecimento_id
                AND ci_auto.competencia = fe.mes_ano
                AND UPPER(TRIM(ci_auto.convenio)) = UPPER(TRIM(fe.convenio))
            )
            AND NOT EXISTS (
              SELECT 1 FROM demonstrativo d_auto
              LEFT JOIN convenios c_auto ON c_auto.id = d_auto.convenio_id
              WHERE d_auto.estabelecimentoId = fe.estabelecimento_id
                AND ${porMesPagamento ? "DATE_FORMAT(d_auto.data_pagamento,'%Y/%m')" : "DATE_FORMAT(d_auto.data_referencia,'%Y/%m')"} = fe.mes_ano
                AND UPPER(TRIM(COALESCE(c_auto.nome,''))) = UPPER(TRIM(fe.convenio))
            )
          )
        )`;
      if (input.competencia) { manualWhere += " AND fe.mes_ano = ?"; manualParams.push(input.competencia); }
      if (input.convenio) { manualWhere += " AND TRIM(fe.convenio) = TRIM(?)"; manualParams.push(input.convenio); }

      const recParams: Array<string | number> = [...retParams, input.estabelecimentoId];
      const exigirVinculoLegadoNoRecorte = input.competencia || input.convenio ? "AND d.id IS NOT NULL" : "";

      const [fatRows] = await conn.execute<any[]>(`
        SELECT ci.competencia, COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio') AS convenio,
          SUM(COALESCE(ci.valorTotal,0)) AS faturado, COUNT(*) AS quantidade
        FROM contas_convenio_itens ci ${fatWhere}
        GROUP BY ci.competencia, COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio')
      `, fatParams);

      const [retRows] = await conn.execute<any[]>(`
        ${retornoVinculadoCte}
        SELECT ${periodoRetornoSql} AS competencia,
          COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') AS convenio,
          SUM(COALESCE(d.valor_pago,0)) AS recebido,
          SUM(CASE WHEN d.status_vinculo='vinculado' THEN COALESCE(d.valor_pago,0) ELSE 0 END) AS recebido_vinculado,
          SUM(CASE WHEN d.status_vinculo='sem_vinculo' THEN COALESCE(d.valor_pago,0) ELSE 0 END) AS recebido_sem_vinculo,
          SUM(COALESCE(d.valor_glosa,0)) AS glosado,
          SUM(CASE WHEN COALESCE(d.glosa_aceita,0)=1 OR d.classificacao_glosa IN ('aceitar','auto_aceitar') THEN COALESCE(d.valor_glosa,0) ELSE 0 END) AS glosa_aceita,
          COUNT(*) AS quantidade
        FROM retorno_final d
        LEFT JOIN convenios c ON c.id = d.convenio_id
        ${retWhere}
        GROUP BY ${periodoRetornoSql}, COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio')
      `, retParams);

      const [manualRows] = await conn.execute<any[]>(`
        SELECT fe.id, fe.mes_ano AS competencia,
          COALESCE(NULLIF(TRIM(fe.convenio),''),'Sem convênio') AS convenio,
          fe.codigo_prestador, COALESCE(fe.valor_faturado,0) AS faturado,
          COALESCE(fe.valor_recebido,0) AS recebido,
          COALESCE(fe.valor_glosado,0) AS glosado,
          COALESCE(NULLIF(fe.origem,''),'manual') AS origem,
          fe.observacao, fe.atualizado_por_nome, fe.atualizado_em
        FROM faturamento_externo fe
        ${manualWhere}
        ORDER BY fe.mes_ano DESC, fe.convenio
      `, manualParams);

      const [recRows] = await conn.execute<any[]>(`
        ${retornoVinculadoCte}
        , retornos_glosados_periodo AS (
          SELECT d.*, ${periodoRetornoSql} AS competencia_recurso,
            COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',d.convenio_id)) AS convenio_recurso
          FROM retorno_final d
          LEFT JOIN convenios c ON c.id=d.convenio_id
          ${retWhere}
            AND COALESCE(d.valor_glosa,0)>0
        ), vinculos_legados AS (
          SELECT rg.id AS recurso_id,
            MIN(d.competencia_recurso) AS competencia,
            MIN(d.convenio_recurso) AS convenio,
            MAX(CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido') THEN 1 ELSE 0 END) AS possui_recurso_novo
          FROM recursosGlosa rg
          LEFT JOIN retornos_glosados_periodo d
            ON d.estabelecimentoId=rg.estabelecimentoId
            AND d.numero_guia=rg.guiaNumero
            AND TRIM(COALESCE(d.codigo_item,''))=TRIM(COALESCE(rg.codigoProcedimento,''))
            AND ROUND(COALESCE(d.valor_glosa,0),2)=ROUND(COALESCE(rg.valorGlosado,0),2)
          WHERE rg.estabelecimentoId=?
            AND rg.status<>'cancelado'
            AND COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0)>0
            ${exigirVinculoLegadoNoRecorte}
          GROUP BY rg.id
        ), recursos_unificados AS (
          SELECT d.competencia_recurso AS competencia, d.convenio_recurso AS convenio,
            COALESCE(NULLIF(d.valor_recurso,0),d.valor_glosa,0) AS glosa_recursada,
            CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado') THEN COALESCE(NULLIF(d.valor_recurso,0),d.valor_glosa,0) ELSE 0 END AS glosa_em_recurso,
            0 AS glosa_recuperada
          FROM retornos_glosados_periodo d
          WHERE d.recurso_status IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido')
          UNION ALL
          SELECT vl.competencia,
            COALESCE(vl.convenio,NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',rg.convenioId)) AS convenio,
            COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) AS glosa_recursada,
            CASE WHEN rg.status IN ('rascunho','pendente_envio','enviado','em_analise') THEN COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) ELSE 0 END AS glosa_em_recurso,
            GREATEST(COALESCE(rg.valorRecebido,0),COALESCE(rg.valorRecuperado,0)) AS glosa_recuperada
          FROM vinculos_legados vl
          JOIN recursosGlosa rg ON rg.id=vl.recurso_id
          LEFT JOIN convenios c ON c.id=rg.convenioId
          WHERE COALESCE(vl.possui_recurso_novo,0)=0
        )
        SELECT competencia, convenio,
          SUM(glosa_recursada) AS glosa_recursada,
          SUM(glosa_em_recurso) AS glosa_em_recurso,
          SUM(glosa_recuperada) AS glosa_recuperada,
          COUNT(*) AS quantidade
        FROM recursos_unificados
        GROUP BY competencia, convenio
      `, recParams);

      let aceiteHistoricoRows: any[] = [];
      if (!input.competencia) {
        const aceiteParams: Array<string | number> = [input.estabelecimentoId];
        let aceiteWhere = "WHERE u.estabelecimento_id = ?";
        if (input.convenio) { aceiteWhere += " AND TRIM(c.nome) = TRIM(?)"; aceiteParams.push(input.convenio); }
        const [rows] = await conn.execute<any[]>(`
          WITH chaves_decisao AS (
            SELECT
              dg.id AS decisao_id,
              d.estabelecimentoId AS estabelecimento_id,
              d.convenio_id,
              COUNT(*) AS quantidade_candidatos,
              COUNT(DISTINCT d.estabelecimentoId) AS quantidade_estabelecimentos
            FROM decisoesGlosa dg
            JOIN demonstrativo d
              ON d.convenio_id = dg.convenioId
              AND TRIM(COALESCE(d.codigo_item,'')) = TRIM(COALESCE(dg.codigoProcedimento,''))
              AND ROUND(COALESCE(d.valor_glosa,0),2) = ROUND(COALESCE(dg.valorGlosado,0),2)
              AND COALESCE(d.valor_glosa,0) > 0
            WHERE dg.decisao='aceitar' AND COALESCE(dg.valorGlosado,0) > 0
            GROUP BY dg.id, d.estabelecimentoId, d.convenio_id
          ), decisao_vinculo_unico AS (
            SELECT ck.decisao_id, MIN(ck.estabelecimento_id) AS estabelecimento_id, MIN(ck.convenio_id) AS convenio_id
            FROM chaves_decisao ck
            GROUP BY ck.decisao_id
            HAVING COUNT(DISTINCT ck.estabelecimento_id)=1 AND MAX(ck.quantidade_estabelecimentos)=1
          )
          SELECT COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',u.convenio_id)) AS convenio,
            SUM(COALESCE(dg.valorGlosado,0)) AS glosa_aceita,
            COUNT(*) AS quantidade
          FROM decisao_vinculo_unico u
          JOIN decisoesGlosa dg ON dg.id=u.decisao_id AND dg.decisao='aceitar'
          LEFT JOIN convenios c ON c.id=u.convenio_id
          ${aceiteWhere}
            AND NOT EXISTS (
              SELECT 1 FROM demonstrativo d_atual
              WHERE d_atual.estabelecimentoId=u.estabelecimento_id
                AND d_atual.convenio_id=dg.convenioId
                AND TRIM(COALESCE(d_atual.codigo_item,''))=TRIM(COALESCE(dg.codigoProcedimento,''))
                AND ROUND(COALESCE(d_atual.valor_glosa,0),2)=ROUND(COALESCE(dg.valorGlosado,0),2)
                AND (COALESCE(d_atual.glosa_aceita,0)=1 OR d_atual.classificacao_glosa IN ('aceitar','auto_aceitar'))
            )
          GROUP BY COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',u.convenio_id))
        `, aceiteParams);
        aceiteHistoricoRows = rows;
      }

      const registros: RegistroFinanceiroUnificado[] = [];
      const nomes = new Map<string, string>();
      const nomeCanonico = (valor: string) => {
        const chave = normalizarConvenio(valor);
        if (!nomes.has(chave)) nomes.set(chave, valor || "Sem convênio");
        return nomes.get(chave)!;
      };
      for (const row of fatRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "faturado", origem: "automatica", faturado: Number(row.faturado || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of retRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", origem: "automatica", recebido: Number(row.recebido || 0), recebidoVinculado: Number(row.recebido_vinculado || 0), recebidoSemVinculo: Number(row.recebido_sem_vinculo || 0), glosado: Number(row.glosado || 0), glosaAceita: Number(row.glosa_aceita || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of manualRows) {
        const convenioManual = nomeCanonico(String(row.convenio));
        const origem = String(row.origem).trim().toLowerCase() === "manual" ? "manual" : "planilha";
        registros.push({ competencia: row.competencia || null, convenio: convenioManual, fonte: "faturado", origem, faturado: Number(row.faturado || 0), quantidade: 1 });
        registros.push({ competencia: row.competencia || null, convenio: convenioManual, fonte: "retorno", origem, recebido: Number(row.recebido || 0), recebidoSemVinculo: Number(row.recebido || 0), glosado: Number(row.glosado || 0), quantidade: 1 });
      }
      for (const row of aceiteHistoricoRows) registros.push({ competencia: null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", glosaAceita: Number(row.glosa_aceita || 0), quantidade: 0 });
      for (const row of recRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "recurso", glosaRecursada: Number(row.glosa_recursada || 0), glosaEmRecurso: Number(row.glosa_em_recurso || 0), glosaRecuperada: Number(row.glosa_recuperada || 0), quantidade: Number(row.quantidade || 0) });

      const [motivoRows] = await conn.execute<any[]>(`
        ${retornoVinculadoCte}
        SELECT COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO') AS codigo,
          COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado') AS motivo,
          SUM(COALESCE(d.valor_glosa,0)) AS valor_glosado, COUNT(*) AS quantidade
        FROM retorno_final d
        LEFT JOIN convenios c ON c.id=d.convenio_id
        LEFT JOIN motivosGlosa mg ON mg.codigo=d.codigo_glosa AND mg.ativo='sim'
        ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
        GROUP BY COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO'), COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado')
        ORDER BY valor_glosado DESC LIMIT ${input.limite}
      `, retParams);

      const [itemRows] = await conn.execute<any[]>(`
        ${retornoVinculadoCte}
        SELECT COALESCE(NULLIF(TRIM(d.codigo_item),''),'S/CÓDIGO') AS codigo,
          COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição') AS item,
          COALESCE(NULLIF(TRIM(d.tipo_lancamento),''),NULLIF(TRIM(d.tipo_item),''),'Não informado') AS tipo,
          SUM(COALESCE(d.valor_glosa,0)) AS valor_glosado, COUNT(*) AS quantidade
        FROM retorno_final d
        LEFT JOIN convenios c ON c.id=d.convenio_id
        ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
        GROUP BY COALESCE(NULLIF(TRIM(d.codigo_item),''),'S/CÓDIGO'), COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição'), COALESCE(NULLIF(TRIM(d.tipo_lancamento),''),NULLIF(TRIM(d.tipo_item),''),'Não informado')
        ORDER BY valor_glosado DESC LIMIT ${input.limite}
      `, retParams);

      const periodoDisponivelSql = porMesPagamento
        ? "DATE_FORMAT(data_pagamento,'%Y/%m')"
        : "DATE_FORMAT(data_referencia,'%Y/%m')";
      const [competenciaRows] = await conn.execute<any[]>(`
        SELECT competencia FROM (
          SELECT DISTINCT competencia FROM contas_convenio_itens WHERE estabelecimentoId=? AND competencia IS NOT NULL AND competencia<>''
          UNION SELECT DISTINCT ${periodoDisponivelSql} FROM demonstrativo WHERE estabelecimentoId=? AND ${porMesPagamento ? "data_pagamento" : "data_referencia"} IS NOT NULL
          UNION SELECT DISTINCT mes_ano FROM faturamento_externo WHERE estabelecimento_id=? AND mes_ano IS NOT NULL AND mes_ano<>''
        ) periodos ORDER BY competencia DESC
      `, [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId]);
      const [convenioRows] = await conn.execute<any[]>(`
        SELECT convenio FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') AS convenio FROM contas_convenio_itens WHERE estabelecimentoId=?
          UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') FROM demonstrativo d LEFT JOIN convenios c ON c.id=d.convenio_id WHERE d.estabelecimentoId=?
          UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') FROM faturamento_externo WHERE estabelecimento_id=?
        ) convenios_unificado ORDER BY convenio
      `, [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId]);

      const registrosConsolidados = consolidarRegistrosFinanceiros(registros);
      const porConvenio = (agruparFinanceiro(registrosConsolidados, "convenio") as any[]).sort((a, b) => b.totalFaturado - a.totalFaturado);
      const porMes = (agruparFinanceiro(registrosConsolidados, "competencia") as any[]).sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
      const resumo = calcularIndicadoresFinanceiros(registrosConsolidados);

      return {
        estabelecimento: { id: Number(estabelecimento.id), nome: String(estabelecimento.nome) },
        filtrosAplicados: { criterioPeriodo: input.criterioPeriodo, competencia: input.competencia || null, convenio: input.convenio || null },
        resumo,
        porConvenio,
        porMes,
        motivosGlosa: motivoRows.map((row) => ({ codigo: String(row.codigo), motivo: String(row.motivo), valorGlosado: Number(row.valor_glosado || 0), quantidade: Number(row.quantidade || 0) })),
        itensGlosados: itemRows.map((row) => ({ codigo: String(row.codigo), item: String(row.item), tipo: String(row.tipo), valorGlosado: Number(row.valor_glosado || 0), quantidade: Number(row.quantidade || 0) })),
        lancamentosExternosConsiderados: manualRows.map((row) => ({
          id: Number(row.id), competencia: String(row.competencia), convenio: String(row.convenio),
          codigoPrestador: row.codigo_prestador ? String(row.codigo_prestador) : null,
          faturado: Number(row.faturado || 0), recebido: Number(row.recebido || 0), glosado: Number(row.glosado || 0),
          origem: String(row.origem || "manual"), observacao: row.observacao ? String(row.observacao) : null,
          atualizadoPorNome: row.atualizado_por_nome ? String(row.atualizado_por_nome) : null,
          atualizadoEm: row.atualizado_em || null,
        })),
        filtrosDisponiveis: {
          competencias: competenciaRows.map((row) => String(row.competencia)),
          convenios: convenioRows.map((row) => String(row.convenio)),
        },
        metodologia: {
          criterioPeriodo: porMesPagamento
            ? "recebido e glosado pela data efetiva de pagamento; faturado permanece no mês de competência da conta"
            : "recebido e glosado pela competência da conta faturada quando há vínculo único; sem vínculo usa a competência informada pelo retorno",
          faturado: "contas_convenio_itens por competência, limitado ao prestador próprio ativo cadastrado em /convenios; quando não há prestador próprio cadastrado, preserva os itens do estabelecimento",
          recebidoGlosado: "preserva no período escolhido os retornos vinculados ao faturamento próprio, sem código de prestador ou com identificador confirmado por vínculo anterior; valores sem correspondência única ficam visíveis como sem vínculo, enquanto identificadores de outro prestador permanecem excluídos",
          recursos: "itens do demonstrativo vinculados ao lote novo são a fonte principal; recursosGlosa é usado somente como fallback por estabelecimento, guia, código e valor, sem dupla contagem",
          glosaAceita: "decisões atuais e histórico associado somente quando convênio, código, valor e estabelecimento são inequívocos; histórico sem data não é atribuído a Mês/Ano",
          manual: "cadastros manuais complementam as fontes automáticas; importações por planilha são usadas somente quando não existe conta faturada nem demonstrativo para o mesmo estabelecimento, convênio e competência",
        },
      };
    } finally {
      await conn.end();
    }
  }),
});
