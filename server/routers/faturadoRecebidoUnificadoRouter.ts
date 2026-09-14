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
      let fatWhere = "WHERE ci.estabelecimentoId = ?";
      if (input.competencia) { fatWhere += " AND ci.competencia = ?"; fatParams.push(input.competencia); }
      if (input.convenio) { fatWhere += " AND TRIM(ci.convenio) = TRIM(?)"; fatParams.push(input.convenio); }

      const retParams: Array<string | number> = [input.estabelecimentoId];
      let retWhere = "WHERE d.estabelecimentoId = ?";
      if (input.competencia) { retWhere += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') = ?"; retParams.push(input.competencia); }
      if (input.convenio) { retWhere += " AND TRIM(c.nome) = TRIM(?)"; retParams.push(input.convenio); }

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
        SELECT DATE_FORMAT(d.data_referencia,'%Y/%m') AS competencia,
          COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') AS convenio,
          SUM(COALESCE(d.valor_pago,0)) AS recebido,
          SUM(COALESCE(d.valor_glosa,0)) AS glosado,
          SUM(CASE WHEN COALESCE(d.glosa_aceita,0)=1 OR d.classificacao_glosa IN ('aceitar','auto_aceitar') THEN COALESCE(d.valor_glosa,0) ELSE 0 END) AS glosa_aceita,
          COUNT(*) AS quantidade
        FROM demonstrativo d
        LEFT JOIN convenios c ON c.id = d.convenio_id
        ${retWhere}
        GROUP BY DATE_FORMAT(d.data_referencia,'%Y/%m'), COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio')
      `, retParams);

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
      for (const row of fatRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "faturado", faturado: Number(row.faturado || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of retRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", recebido: Number(row.recebido || 0), glosado: Number(row.glosado || 0), glosaAceita: Number(row.glosa_aceita || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of aceiteHistoricoRows) registros.push({ competencia: null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", glosaAceita: Number(row.glosa_aceita || 0), quantidade: 0 });
      for (const row of recRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "recurso", glosaRecursada: Number(row.glosa_recursada || 0), glosaEmRecurso: Number(row.glosa_em_recurso || 0), glosaRecuperada: Number(row.glosa_recuperada || 0), quantidade: Number(row.quantidade || 0) });

      const [motivoRows] = await conn.execute<any[]>(`
        SELECT COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO') AS codigo,
          COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado') AS motivo,
          SUM(COALESCE(d.valor_glosa,0)) AS valor_glosado, COUNT(*) AS quantidade
        FROM demonstrativo d
        LEFT JOIN convenios c ON c.id=d.convenio_id
        LEFT JOIN motivosGlosa mg ON mg.codigo=d.codigo_glosa AND mg.ativo='sim'
        ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
        GROUP BY COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO'), COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado')
        ORDER BY valor_glosado DESC LIMIT ${input.limite}
      `, retParams);

      const [itemRows] = await conn.execute<any[]>(`
        SELECT COALESCE(NULLIF(TRIM(d.codigo_item),''),'S/CÓDIGO') AS codigo,
          COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição') AS item,
          COALESCE(NULLIF(TRIM(d.tipo_lancamento),''),NULLIF(TRIM(d.tipo_item),''),'Não informado') AS tipo,
          SUM(COALESCE(d.valor_glosa,0)) AS valor_glosado, COUNT(*) AS quantidade
        FROM demonstrativo d
        LEFT JOIN convenios c ON c.id=d.convenio_id
        ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
        GROUP BY COALESCE(NULLIF(TRIM(d.codigo_item),''),'S/CÓDIGO'), COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição'), COALESCE(NULLIF(TRIM(d.tipo_lancamento),''),NULLIF(TRIM(d.tipo_item),''),'Não informado')
        ORDER BY valor_glosado DESC LIMIT ${input.limite}
      `, retParams);

      const [competenciaRows] = await conn.execute<any[]>(`
        SELECT competencia FROM (
          SELECT DISTINCT competencia FROM contas_convenio_itens WHERE estabelecimentoId=? AND competencia IS NOT NULL AND competencia<>''
          UNION SELECT DISTINCT DATE_FORMAT(data_referencia,'%Y/%m') FROM demonstrativo WHERE estabelecimentoId=? AND data_referencia IS NOT NULL
        ) periodos ORDER BY competencia DESC
      `, [input.estabelecimentoId, input.estabelecimentoId]);
      const [convenioRows] = await conn.execute<any[]>(`
        SELECT convenio FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') AS convenio FROM contas_convenio_itens WHERE estabelecimentoId=?
          UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') FROM demonstrativo d LEFT JOIN convenios c ON c.id=d.convenio_id WHERE d.estabelecimentoId=?
        ) convenios_unificado ORDER BY convenio
      `, [input.estabelecimentoId, input.estabelecimentoId]);

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
        filtrosDisponiveis: {
          competencias: competenciaRows.map((row) => String(row.competencia)),
          convenios: convenioRows.map((row) => String(row.convenio)),
        },
        metodologia: {
          faturado: "contas_convenio_itens por competência",
          recebidoGlosado: "demonstrativo por mês de referência",
          recursos: "recursosGlosa vinculado ao demonstrativo por estabelecimento, guia, código e valor",
          glosaAceita: "decisões atuais e histórico associado somente quando convênio, código, valor e estabelecimento são inequívocos; histórico sem data não é atribuído a Mês/Ano",
        },
      };
    } finally {
      await conn.end();
    }
  }),
});
