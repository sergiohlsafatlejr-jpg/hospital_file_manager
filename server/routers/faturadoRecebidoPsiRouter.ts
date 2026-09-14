import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";
import {
  agruparFinanceiroPsi,
  calcularIndicadoresPsi,
  consolidarRegistrosPsi,
  normalizarConvenioPsi,
  PSI_ESTABELECIMENTO_ID,
  type RegistroFinanceiroPsi,
} from "../faturadoRecebidoPsiService";

const inputSchema = z.object({
  estabelecimentoId: z.literal(PSI_ESTABELECIMENTO_ID),
  competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  convenio: z.string().min(1).max(255).optional(),
  limite: z.number().int().min(5).max(30).default(10),
});

async function validarAcessoPsi(ctx: any) {
  if (ctx.user?.role === "admin") return;
  const permitido = await verificarPermissaoEstabelecimento(ctx.user.id, PSI_ESTABELECIMENTO_ID, "visualizar");
  if (!permitido) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao Pronto Socorro Infantil" });
}

export const faturadoRecebidoPsiRouter = router({
  dados: protectedProcedure.input(inputSchema).query(async ({ input, ctx }) => {
    await validarAcessoPsi(ctx);
    const databaseUrl = getApplicationDatabaseUrl();
    if (!databaseUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não configurado" });

    const mysql2 = await import("mysql2/promise");
    const conn = await mysql2.createConnection(databaseUrl);
    try {
      const fatParams: any[] = [PSI_ESTABELECIMENTO_ID];
      let fatWhere = "WHERE ci.estabelecimentoId = ?";
      if (input.competencia) { fatWhere += " AND ci.competencia = ?"; fatParams.push(input.competencia); }
      if (input.convenio) { fatWhere += " AND TRIM(ci.convenio) = TRIM(?)"; fatParams.push(input.convenio); }

      const retParams: any[] = [PSI_ESTABELECIMENTO_ID];
      let retWhere = "WHERE d.estabelecimentoId = ?";
      if (input.competencia) { retWhere += " AND DATE_FORMAT(d.data_referencia, '%Y/%m') = ?"; retParams.push(input.competencia); }
      if (input.convenio) { retWhere += " AND TRIM(c.nome) = TRIM(?)"; retParams.push(input.convenio); }

      const recParams: any[] = [PSI_ESTABELECIMENTO_ID, PSI_ESTABELECIMENTO_ID];
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
          SUM(CASE WHEN d.classificacao_glosa IN ('aceitar','auto_aceitar') THEN COALESCE(d.valor_glosa,0) ELSE 0 END) AS glosa_aceita,
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

      const registros: RegistroFinanceiroPsi[] = [];
      const nomes = new Map<string, string>();
      const nomeCanonico = (valor: string) => {
        const chave = normalizarConvenioPsi(valor);
        if (!nomes.has(chave)) nomes.set(chave, valor || "Sem convênio");
        return nomes.get(chave)!;
      };
      for (const row of fatRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "faturado", faturado: Number(row.faturado || 0), quantidade: Number(row.quantidade || 0) });
      for (const row of retRows) registros.push({ competencia: row.competencia || null, convenio: nomeCanonico(String(row.convenio)), fonte: "retorno", recebido: Number(row.recebido || 0), glosado: Number(row.glosado || 0), glosaAceita: Number(row.glosa_aceita || 0), quantidade: Number(row.quantidade || 0) });
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
      `, [PSI_ESTABELECIMENTO_ID, PSI_ESTABELECIMENTO_ID]);
      const [convenioRows] = await conn.execute<any[]>(`
        SELECT convenio FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') AS convenio FROM contas_convenio_itens WHERE estabelecimentoId=?
          UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') FROM demonstrativo d LEFT JOIN convenios c ON c.id=d.convenio_id WHERE d.estabelecimentoId=?
        ) convenios_psi ORDER BY convenio
      `, [PSI_ESTABELECIMENTO_ID, PSI_ESTABELECIMENTO_ID]);

      const registrosConsolidados = consolidarRegistrosPsi(registros);
      const porConvenio = (agruparFinanceiroPsi(registrosConsolidados, "convenio") as any[]).sort((a, b) => b.totalFaturado - a.totalFaturado);
      const porMes = (agruparFinanceiroPsi(registrosConsolidados, "competencia") as any[]).sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
      const resumo = calcularIndicadoresPsi(registrosConsolidados);

      return {
        estabelecimento: { id: PSI_ESTABELECIMENTO_ID, nome: "Pronto Socorro Infantil" },
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
          recursos: "recursosGlosa, vinculado ao demonstrativo por guia, código e valor",
        },
      };
    } finally {
      await conn.end();
    }
  }),
});
