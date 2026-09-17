import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
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
  competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  convenio: z.string().min(1).max(255).optional(),
  limite: z.number().int().min(5).max(30).default(10),
});

async function validarAcesso(ctx: any, estabelecimentoId: number) {
  if (ctx.user?.role === "admin") return;
  const permitido = await verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, "visualizar");
  if (!permitido) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao estabelecimento selecionado" });
}

export const faturadoRecebidoUnificadoRouter = router({
  dados: protectedProcedure.input(inputSchema).query(async ({ input, ctx }) => {
    await validarAcesso(ctx, input.estabelecimentoId);
    const databaseUrl = getApplicationDatabaseUrl();
    if (!databaseUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });

    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection(databaseUrl);
    try {
      const [estabelecimentos] = await conn.execute<any[]>("SELECT id, nome FROM estabelecimentos WHERE id=? LIMIT 1", [input.estabelecimentoId]);
      const estabelecimento = estabelecimentos[0];
      if (!estabelecimento) throw new TRPCError({ code: "NOT_FOUND", message: "Estabelecimento não encontrado" });

      const fatParams: Array<string | number> = [input.estabelecimentoId];
      let fatWhere = `WHERE ci.estabelecimentoId = ?
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
        WITH prestadores_proprios AS (
          SELECT convenioId, TRIM(codigoPrestador) AS codigoPrestador
          FROM convenioEstabelecimentoPrestador
          WHERE estabelecimentoId = ? AND tipoPrestador = 'proprio' AND ativo = 'sim'
        ), faturado_base AS (
          SELECT ci.competencia, ci.convenioId,
            TRIM(COALESCE(ci.numeroGuia,'')) AS guia_prestador,
            TRIM(COALESCE(ci.numeroGuiaOperadora,'')) AS guia_operadora,
            TRIM(COALESCE(ci.codigoItem,'')) AS codigo_item,
            TRIM(COALESCE(ci.codigoItemTuss,'')) AS codigo_item_tuss,
            DATE(ci.dataExecucao) AS data_execucao
          FROM contas_convenio_itens ci
          WHERE ci.estabelecimentoId = ?
            AND ci.competencia IS NOT NULL AND ci.competencia <> ''
            AND (
              NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = ci.convenioId)
              OR EXISTS (
                SELECT 1 FROM prestadores_proprios pp_match
                WHERE pp_match.convenioId = ci.convenioId
                  AND pp_match.codigoPrestador = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
              )
            )
        ), faturado_guias AS (
          SELECT competencia, convenioId, guia_prestador AS guia, codigo_item, codigo_item_tuss, data_execucao
          FROM faturado_base WHERE guia_prestador <> ''
          UNION
          SELECT competencia, convenioId, guia_operadora, codigo_item, codigo_item_tuss, data_execucao
          FROM faturado_base WHERE guia_operadora <> ''
        ), faturado_chaves AS (
          SELECT competencia, convenioId, guia, codigo_item AS codigo_item, data_execucao
          FROM faturado_guias WHERE codigo_item <> ''
          UNION
          SELECT competencia, convenioId, guia, codigo_item_tuss, data_execucao
          FROM faturado_guias WHERE codigo_item_tuss <> ''
        ), atribuicoes AS (
          SELECT d.id AS demonstrativo_id,
            MIN(f.competencia) AS competencia_faturada,
            COUNT(DISTINCT f.competencia) AS quantidade_competencias
          FROM demonstrativo d
          JOIN faturado_chaves f
            ON f.convenioId = d.convenio_id
            AND f.guia = TRIM(COALESCE(d.numero_guia,''))
            AND f.codigo_item = TRIM(COALESCE(d.codigo_item,''))
            AND (f.data_execucao IS NULL OR d.data_execucao IS NULL OR f.data_execucao = d.data_execucao)
          WHERE d.estabelecimentoId = ?
          GROUP BY d.id
        ), pares_faturados AS (
          SELECT DISTINCT competencia, convenioId FROM faturado_base
        ), retorno_final AS (
          SELECT d.*, a.competencia_faturada
          FROM demonstrativo d
          JOIN atribuicoes a ON a.demonstrativo_id = d.id AND a.quantidade_competencias = 1
          UNION ALL
          SELECT d.*, DATE_FORMAT(d.data_referencia,'%Y/%m') AS competencia_faturada
          FROM demonstrativo d
          WHERE d.estabelecimentoId = ?
            AND d.data_referencia IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM atribuicoes a
              WHERE a.demonstrativo_id = d.id AND a.quantidade_competencias = 1
            )
            AND NOT EXISTS (
              SELECT 1 FROM pares_faturados pf
              WHERE pf.convenioId = d.convenio_id
                AND pf.competencia = DATE_FORMAT(d.data_referencia,'%Y/%m')
            )
            AND (
              NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = d.convenio_id)
              OR EXISTS (
                SELECT 1 FROM prestadores_proprios pp_match
                WHERE pp_match.convenioId = d.convenio_id
                  AND pp_match.codigoPrestador IN (
                    TRIM(COALESCE(d.codigo_prestador,'')),
                    TRIM(COALESCE(d.prestador_executante,'')),
                    TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                  )
              )
            )
        )`;
      let retWhere = "WHERE 1=1";
      if (input.competencia) { retWhere += " AND d.competencia_faturada = ?"; retParams.push(input.competencia); }
      if (input.convenio) { retWhere += " AND TRIM(c.nome) = TRIM(?)"; retParams.push(input.convenio); }

      const manualParams: Array<string | number> = [input.estabelecimentoId];
      let manualWhere = `WHERE fe.estabelecimento_id = ?
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
                AND DATE_FORMAT(d_auto.data_referencia,'%Y/%m') = fe.mes_ano
                AND UPPER(TRIM(COALESCE(c_auto.nome,''))) = UPPER(TRIM(fe.convenio))
            )
          )
        )`;
      if (input.competencia) { manualWhere += " AND fe.mes_ano = ?"; manualParams.push(input.competencia); }
      if (input.convenio) { manualWhere += " AND TRIM(fe.convenio) = TRIM(?)"; manualParams.push(input.convenio); }

      const recParams: Array<string | number> = [input.estabelecimentoId, input.estabelecimentoId];
      let recWhere = "WHERE rg.estabelecimentoId = ? AND rg.status <> 'cancelado' AND COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) > 0";
      if (input.competencia) { recWhere += " AND dm.competencia = ?"; recParams.push(input.competencia); }
      if (input.convenio) { recWhere += " AND TRIM(c.nome) = TRIM(?)"; recParams.push(input.convenio); }

      const [fatRows] = await conn.execute<any[]>(`
        SELECT ci.competencia, COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio') AS convenio,
          SUM(COALESCE(ci.valorTotal,0)) AS faturado, COUNT(*) AS quantidade
        FROM contas_convenio_itens ci ${fatWhere}
        GROUP BY ci.competencia, COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio')
      `, fatParams);

      const [retRows] = await conn.execute<any[]>(`
        ${retornoVinculadoCte}
        SELECT d.competencia_faturada AS competencia,
          COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') AS convenio,
          SUM(COALESCE(d.valor_pago,0)) AS recebido,
          SUM(COALESCE(d.valor_glosa,0)) AS glosado,
          SUM(CASE WHEN COALESCE(d.glosa_aceita,0)=1 OR d.classificacao_glosa IN ('aceitar','auto_aceitar') THEN COALESCE(d.valor_glosa,0) ELSE 0 END) AS glosa_aceita,
          COUNT(*) AS quantidade
        FROM retorno_final d
        LEFT JOIN convenios c ON c.id = d.convenio_id
        ${retWhere}
        GROUP BY d.competencia_faturada, COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio')
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
        SELECT dm.competencia,
          COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',rg.convenioId)) AS convenio,
          SUM(COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0)) AS glosa_recursada,
          SUM(CASE WHEN rg.status IN ('rascunho','pendente_envio','enviado','em_analise') THEN COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) ELSE 0 END) AS glosa_em_recurso,
          SUM(GREATEST(COALESCE(rg.valorRecebido,0),COALESCE(rg.valorRecuperado,0))) AS glosa_recuperada,
          COUNT(*) AS quantidade
        FROM recursosGlosa rg
        LEFT JOIN (
          SELECT d.estabelecimentoId, d.numero_guia,
            TRIM(COALESCE(d.codigo_item,'')) AS codigo_item,
            ROUND(COALESCE(d.valor_glosa,0),2) AS valor_glosa,
            MIN(DATE_FORMAT(d.data_referencia,'%Y/%m')) AS competencia
          FROM demonstrativo d
          WHERE d.estabelecimentoId = ? AND COALESCE(d.valor_glosa,0) > 0
          GROUP BY d.estabelecimentoId,d.numero_guia,TRIM(COALESCE(d.codigo_item,'')),ROUND(COALESCE(d.valor_glosa,0),2)
        ) dm ON dm.estabelecimentoId=rg.estabelecimentoId
          AND dm.numero_guia=rg.guiaNumero
          AND dm.codigo_item=TRIM(COALESCE(rg.codigoProcedimento,''))
          AND dm.valor_glosa=ROUND(COALESCE(rg.valorGlosado,0),2)
        LEFT JOIN convenios c ON c.id=rg.convenioId
        ${recWhere}
        GROUP BY dm.competencia, COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',rg.convenioId))
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
      for (const row of retRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", origem: "automatica", recebido: Number(row.recebido || 0), glosado: Number(row.glosado || 0), glosaAceita: Number(row.glosa_aceita || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of manualRows) {
        const convenioManual = nomeCanonico(String(row.convenio));
        const origem = String(row.origem).trim().toLowerCase() === "manual" ? "manual" : "planilha";
        registros.push({ competencia: row.competencia || null, convenio: convenioManual, fonte: "faturado", origem, faturado: Number(row.faturado || 0), quantidade: 1 });
        registros.push({ competencia: row.competencia || null, convenio: convenioManual, fonte: "retorno", origem, recebido: Number(row.recebido || 0), glosado: Number(row.glosado || 0), quantidade: 1 });
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

      const [competenciaRows] = await conn.execute<any[]>(`
        SELECT competencia FROM (
          SELECT DISTINCT competencia FROM contas_convenio_itens WHERE estabelecimentoId=? AND competencia IS NOT NULL AND competencia<>''
          UNION SELECT DISTINCT DATE_FORMAT(data_referencia,'%Y/%m') FROM demonstrativo WHERE estabelecimentoId=? AND data_referencia IS NOT NULL
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
        filtrosAplicados: { competencia: input.competencia || null, convenio: input.convenio || null },
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
          faturado: "contas_convenio_itens por competência, limitado ao prestador próprio ativo cadastrado em /convenios; quando não há prestador próprio cadastrado, preserva os itens do estabelecimento",
          recebidoGlosado: "demonstrativo associado aos itens faturados do prestador próprio por convênio, guia, procedimento e data; usa o mês de referência somente quando não existe fonte faturada para o mesmo convênio e competência",
          recursos: "recursosGlosa vinculado ao demonstrativo por estabelecimento, guia, código e valor",
          glosaAceita: "decisões atuais e histórico associado somente quando convênio, código, valor e estabelecimento são inequívocos; histórico sem data não é atribuído a Mês/Ano",
          manual: "cadastros manuais complementam as fontes automáticas; importações por planilha são usadas somente quando não existe conta faturada nem demonstrativo para o mesmo estabelecimento, convênio e competência",
        },
      };
    } finally {
      await conn.end();
    }
  }),
});
