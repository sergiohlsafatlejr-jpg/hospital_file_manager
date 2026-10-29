import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  padraoPrecoConvenio,
  padraoGlosaConvenio,
  padraoQuantidadeItem,
  padroesCobranca,
  feedbackDivergencias,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { logger } from "../_core/logger";
import {
  exigirHospitalProprietario,
  resolverHospitaisAutorizados,
} from "../hospitalScope";

function exigirProprietarioDoPadrao<T extends { estabelecimentoId: number | null }>(padrao: T): T & { estabelecimentoId: number } {
  if (!Number.isSafeInteger(padrao.estabelecimentoId) || (padrao.estabelecimentoId ?? 0) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Padrão sem hospital proprietário válido; regularize o cadastro antes da operação." });
  }
  return padrao as T & { estabelecimentoId: number };
}

function filtroHospitaisSql(hospitalIds: readonly number[]) {
  return sql`estabelecimentoId IN (${sql.join(hospitalIds.map((id) => sql`${id}`), sql`, `)})`;
}

function criarFiltroFaturamento(
  hospitalIds: readonly number[],
  filtros: { convenio?: string; setor?: string; competenciaInicio?: string; competenciaFim?: string },
  condicoesBase: any[],
) {
  const condicoes: any[] = [filtroHospitaisSql(hospitalIds), ...condicoesBase];
  if (filtros.convenio) condicoes.push(sql`convenio = ${filtros.convenio}`);
  if (filtros.setor) condicoes.push(sql`setor = ${filtros.setor}`);
  if (filtros.competenciaInicio) condicoes.push(sql`competencia >= ${filtros.competenciaInicio}`);
  if (filtros.competenciaFim) condicoes.push(sql`competencia <= ${filtros.competenciaFim}`);
  return sql`WHERE ${sql.join(condicoes, sql` AND `)}`;
}

/**
 * Router para Padrões de Cobrança por Convênio
 * 4 tipos de análise baseados na tabela faturamento_unificado
 */
export const padroesCobrancaRouter = router({
  /**
   * Listar convênios disponíveis para análise
   */
  listarConvenios: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const filtroEstab = filtroHospitaisSql(hospitaisAutorizados);

      const result = await db.execute(sql`
        SELECT 
          convenio,
          COUNT(*) as totalItens,
          COUNT(DISTINCT contaNumero) as totalContas,
          ROUND(SUM(CAST(valorFaturado AS DECIMAL(14,2))), 2) as totalFaturado
        FROM faturamento_unificado
        WHERE ${filtroEstab}
          AND convenio IS NOT NULL AND convenio != ''
        GROUP BY convenio
        ORDER BY COUNT(*) DESC
      `);

      return (result as any)[0] || [];
    }),

  /**
   * Listar competências disponíveis
   */
  listarCompetencias: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const filtroEstab = filtroHospitaisSql(hospitaisAutorizados);

      const result = await db.execute(sql`
        SELECT competencia, COUNT(*) as total
        FROM faturamento_unificado
        WHERE ${filtroEstab}
        GROUP BY competencia
        ORDER BY competencia DESC
      `);

      return (result as any)[0] || [];
    }),

  /**
   * Listar setores disponíveis
   */
  listarSetores: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const filtroEstab = filtroHospitaisSql(hospitaisAutorizados);

      const result = await db.execute(sql`
        SELECT setor, COUNT(*) as total
        FROM faturamento_unificado
        WHERE ${filtroEstab}
          AND setor IS NOT NULL AND setor != ''
        GROUP BY setor
        ORDER BY COUNT(*) DESC
      `);

      return (result as any)[0] || [];
    }),

  listarProfissionais: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const filtroEstab = filtroHospitaisSql(hospitaisAutorizados);

      const result = await db.execute(sql`
        SELECT profissionalExecutante as profissional, COUNT(*) as total
        FROM faturamento_unificado
        WHERE ${filtroEstab}
          AND profissionalExecutante IS NOT NULL AND profissionalExecutante != ''
          AND tipoItem IN ('P', 'C', 'PROCEDIMENTO', 'O', '01', 'PROC')
        GROUP BY profissionalExecutante
        ORDER BY COUNT(*) DESC
      `);

      return (result as any)[0] || [];
    }),

  // ============================================================
  // PADRÃO 1: Preço por Procedimento/Convênio
  // ============================================================
  gerarPadroesPreco: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        setor: z.string().optional(),
        competenciaInicio: z.string().optional(),
        competenciaFim: z.string().optional(),
        agruparPorSetor: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const whereClause = criarFiltroFaturamento(
        [input.estabelecimentoId],
        input,
        [
          sql`codigoItem IS NOT NULL AND codigoItem != ''`,
          sql`convenio IS NOT NULL AND convenio != ''`,
          sql`tipoItem IN ('P', 'C', 'PROCEDIMENTO', 'O', '01', 'PROC', 'PROC/TAXA')`,
        ],
      );
      const statsResult = await db.execute(input.agruparPorSetor ? sql`
        SELECT
          convenio,
          COALESCE(setor, 'TODOS') as setor,
          codigoItem,
          MAX(descricaoItem) as descricaoItem,
          MAX(tipoItem) as tipoItem,
          ROUND(AVG(CAST(valorUnitario AS DECIMAL(12,4))), 4) as mediaUnitario,
          ROUND(MIN(CAST(valorUnitario AS DECIMAL(12,4))), 4) as minUnitario,
          ROUND(MAX(CAST(valorUnitario AS DECIMAL(12,4))), 4) as maxUnitario,
          ROUND(STDDEV(CAST(valorUnitario AS DECIMAL(12,4))), 4) as desvioUnitario,
          ROUND(AVG(CAST(valorFaturado AS DECIMAL(12,4))), 4) as mediaFaturado,
          ROUND(MIN(CAST(valorFaturado AS DECIMAL(12,4))), 4) as minFaturado,
          ROUND(MAX(CAST(valorFaturado AS DECIMAL(12,4))), 4) as maxFaturado,
          ROUND(STDDEV(CAST(valorFaturado AS DECIMAL(12,4))), 4) as desvioFaturado,
          COUNT(*) as totalOcorrencias,
          COUNT(DISTINCT contaNumero) as totalContas,
          MIN(competencia) as competenciaInicio,
          MAX(competencia) as competenciaFim
        FROM faturamento_unificado
        ${whereClause}
        GROUP BY convenio, COALESCE(setor, 'TODOS'), codigoItem
        HAVING COUNT(*) >= 3
      ` : sql`
        SELECT
          convenio,
          codigoItem,
          MAX(descricaoItem) as descricaoItem,
          MAX(tipoItem) as tipoItem,
          ROUND(AVG(CAST(valorUnitario AS DECIMAL(12,4))), 4) as mediaUnitario,
          ROUND(MIN(CAST(valorUnitario AS DECIMAL(12,4))), 4) as minUnitario,
          ROUND(MAX(CAST(valorUnitario AS DECIMAL(12,4))), 4) as maxUnitario,
          ROUND(STDDEV(CAST(valorUnitario AS DECIMAL(12,4))), 4) as desvioUnitario,
          ROUND(AVG(CAST(valorFaturado AS DECIMAL(12,4))), 4) as mediaFaturado,
          ROUND(MIN(CAST(valorFaturado AS DECIMAL(12,4))), 4) as minFaturado,
          ROUND(MAX(CAST(valorFaturado AS DECIMAL(12,4))), 4) as maxFaturado,
          ROUND(STDDEV(CAST(valorFaturado AS DECIMAL(12,4))), 4) as desvioFaturado,
          COUNT(*) as totalOcorrencias,
          COUNT(DISTINCT contaNumero) as totalContas,
          MIN(competencia) as competenciaInicio,
          MAX(competencia) as competenciaFim
        FROM faturamento_unificado
        ${whereClause}
        GROUP BY convenio, codigoItem
        HAVING COUNT(*) >= 3
      `);

      const stats = (statsResult as any)[0] || [];
      if (stats.length === 0) {
        return { total: 0, message: "Nenhum dado encontrado para gerar padrões" };
      }

      // Limpar padrões anteriores
      const deleteConditions: any[] = [
        eq(padraoPrecoConvenio.estabelecimentoId, input.estabelecimentoId),
      ];
      if (input.convenio) {
        deleteConditions.push(eq(padraoPrecoConvenio.convenio, input.convenio));
      }
      await db.delete(padraoPrecoConvenio).where(and(...deleteConditions));

      // Inserir novos padrões em lotes
      const batchSize = 100;
      for (let i = 0; i < stats.length; i += batchSize) {
        const batch = stats.slice(i, i + batchSize);
        await db.insert(padraoPrecoConvenio).values(
          batch.map((s: any) => ({
            estabelecimentoId: input.estabelecimentoId,
            convenio: String(s.convenio),
            setor: (input.agruparPorSetor && s.setor && s.setor !== 'TODOS') ? String(s.setor) : null,
            codigoItem: String(s.codigoItem),
            descricaoItem: s.descricaoItem ? String(s.descricaoItem).substring(0, 500) : null,
            tipoItem: s.tipoItem ? String(s.tipoItem) : null,
            mediaUnitario: String(s.mediaUnitario || 0),
            minUnitario: String(s.minUnitario || 0),
            maxUnitario: String(s.maxUnitario || 0),
            desvioUnitario: String(s.desvioUnitario || 0),
            mediaFaturado: String(s.mediaFaturado || 0),
            minFaturado: String(s.minFaturado || 0),
            maxFaturado: String(s.maxFaturado || 0),
            desvioFaturado: String(s.desvioFaturado || 0),
            totalOcorrencias: Number(s.totalOcorrencias),
            totalContas: Number(s.totalContas),
            confianca: calcularConfianca(Number(s.totalOcorrencias)),
            competenciaInicio: s.competenciaInicio || input.competenciaInicio,
            competenciaFim: s.competenciaFim || input.competenciaFim,
          }))
        );
      }

      return { total: stats.length, message: `${stats.length} padrões de preço gerados` };
    }),

  consultarPadroesPreco: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        setor: z.string().optional(),
        tipoItem: z.string().optional(),
        busca: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [inArray(padraoPrecoConvenio.estabelecimentoId, hospitaisAutorizados)];
      if (input.convenio) conditions.push(eq(padraoPrecoConvenio.convenio, input.convenio));
      if (input.setor) conditions.push(eq(padraoPrecoConvenio.setor, input.setor));
      if (input.tipoItem) conditions.push(eq(padraoPrecoConvenio.tipoItem, input.tipoItem));
      if (input.busca) {
        conditions.push(
          sql`(${padraoPrecoConvenio.codigoItem} LIKE ${`%${input.busca}%`} OR ${padraoPrecoConvenio.descricaoItem} LIKE ${`%${input.busca}%`})`
        );
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(padraoPrecoConvenio)
          .where(and(...conditions))
          .orderBy(sql`totalOcorrencias DESC`)
          .limit(input.limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoPrecoConvenio)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  /**
   * Comparar preço de um item entre convênios
   */
  compararPrecoConvenios: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        codigoItem: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const result = await db
        .select()
        .from(padraoPrecoConvenio)
        .where(
          and(
            inArray(padraoPrecoConvenio.estabelecimentoId, hospitaisAutorizados),
            eq(padraoPrecoConvenio.codigoItem, input.codigoItem)
          )
        )
        .orderBy(sql`CAST(mediaFaturado AS DECIMAL(12,4)) DESC`);

      return result;
    }),

  // ============================================================
  // PADRÃO 2: Composição de Conta / Kit Cirúrgico
  // ============================================================
  gerarPadroesComposicao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        setor: z.string().optional(),
        competenciaInicio: z.string().optional(),
        competenciaFim: z.string().optional(),
        minOcorrencias: z.number().default(5),
        agruparPorSetor: z.boolean().default(true), // Agrupar padrões por setor de atendimento
        agruparPorProfissional: z.boolean().default(false), // Agrupar padrões por profissional executante
      })
    )
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const whereClause = criarFiltroFaturamento(
        [input.estabelecimentoId],
        input,
        [
          sql`codigoItem IS NOT NULL AND codigoItem != ''`,
          sql`contaNumero IS NOT NULL AND contaNumero != ''`,
        ],
      );

      // Buscar todos os itens agrupados por conta e, opcionalmente, setor e profissional.
      const setorSelect = input.agruparPorSetor ? sql`COALESCE(setor, 'GERAL') as setor` : sql`'GERAL' as setor`;
      const setorGroupBy = input.agruparPorSetor ? sql`, COALESCE(setor, 'GERAL')` : sql``;
      const profSelect = input.agruparPorProfissional ? sql`MAX(profissionalExecutante) as profissionalExecutante` : sql`NULL as profissionalExecutante`;
      const itensResult = await db.execute(sql`
        SELECT contaNumero, codigoItem,
          ${setorSelect},
          ${profSelect},
          SUBSTRING(MAX(descricaoItem), 1, 500) as descricaoItem,
          MAX(tipoItem) as tipoItem,
          SUM(CAST(quantidade AS DECIMAL(10,4))) as quantidade,
          SUM(CAST(valorFaturado AS DECIMAL(14,2))) as valorFaturado,
          MAX(convenio) as convenio
        FROM faturamento_unificado
        ${whereClause}
        GROUP BY contaNumero, codigoItem${setorGroupBy}
      `);

      const itens = (itensResult as any)[0] || [];
      if (itens.length === 0) {
        return { total: 0, message: "Nenhum dado encontrado" };
      }

      // Agrupar por conta+setor (cada setor da conta gera padrões separados)
      const contasMap = new Map<string, any[]>();
      for (const item of itens) {
        const key = `${item.contaNumero}|${item.setor || 'GERAL'}`;
        if (!contasMap.has(key)) contasMap.set(key, []);
        contasMap.get(key)!.push(item);
      }

      // Se agruparPorProfissional, buscar profissional por conta
      const profissionalPorConta = new Map<string, string>();
      if (input.agruparPorProfissional) {
        const profResult = await db.execute(sql`
          SELECT DISTINCT contaNumero, profissionalExecutante
          FROM faturamento_unificado
          ${whereClause}
            AND profissionalExecutante IS NOT NULL AND profissionalExecutante != ''
            AND tipoItem IN ('P', 'C', 'PROCEDIMENTO', 'O', '01', 'PROC')
        `);
        const profRows = (profResult as any)[0] || [];
        for (const row of profRows) {
          if (row.contaNumero && row.profissionalExecutante) {
            profissionalPorConta.set(String(row.contaNumero), String(row.profissionalExecutante));
          }
        }
      }

      // Tipos de procedimentos principais (apenas procedimentos, excluindo materiais, medicamentos, taxas e diárias)
      const tiposPrincipais = new Set(["P", "C", "PROCEDIMENTO", "O", "01", "PROC"]);
      // Tipos que NÃO devem gerar padrão de composição (materiais, medicamentos, taxas, diárias)
      const tiposExcluidos = new Set(["02", "03", "05", "07", "M", "MATERIAL", "MEDICAMENTO", "TAXA", "TAXA/ALUGUÉIS", "DIÁRIA", "DIARIA", "MAT", "MED"]);

      // Para cada procedimento principal, encontrar itens associados (agora com setor)
      const padroesMap = new Map<string, {
        codigo: string;
        descricao: string;
        tipo: string;
        convenio: string;
        setor: string;
        profissional: string | null;
        contas: number;
        valorTotal: number;
        itensAssociados: Map<string, {
          codigo: string;
          descricao: string;
          tipo: string;
          ocorrencias: number;
          quantidadeTotal: number;
          valorTotal: number;
        }>;
      }>();

      for (const [contaSetorKey, itensConta] of Array.from(contasMap.entries())) {
        const setorDaConta = itensConta[0]?.setor || 'GERAL';
        
        // Procedimentos principais: deve ser tipo de procedimento E não pode ser tipo excluído
        const procedimentosPrincipais = itensConta.filter(
          (i: any) => {
            const tipo = String(i.tipoItem || "").toUpperCase();
            if (tiposExcluidos.has(tipo)) return false;
            if (tiposPrincipais.has(tipo)) return true;
            return false;
          }
        );
        const outrosItens = itensConta.filter(
          (i: any) => {
            const tipo = String(i.tipoItem || "").toUpperCase();
            if (tiposExcluidos.has(tipo)) return true;
            if (tiposPrincipais.has(tipo)) return false;
            return true;
          }
        );

        for (const proc of procedimentosPrincipais) {
          // Chave inclui setor e profissional para diferenciar padrões
          const profissional = input.agruparPorProfissional ? (profissionalPorConta.get(String(proc.contaNumero)) || 'TODOS') : 'TODOS';
          const key = `${proc.codigoItem}|${proc.convenio || "TODOS"}|${setorDaConta}|${profissional}`;
          if (!padroesMap.has(key)) {
            padroesMap.set(key, {
              codigo: String(proc.codigoItem),
              descricao: String(proc.descricaoItem || ""),
              tipo: String(proc.tipoItem || ""),
              convenio: String(proc.convenio || ""),
              setor: setorDaConta,
              profissional: profissional !== 'TODOS' ? profissional : null,
              contas: 0,
              valorTotal: 0,
              itensAssociados: new Map(),
            });
          }

          const padrao = padroesMap.get(key)!;
          padrao.contas++;
          padrao.valorTotal += parseFloat(proc.valorFaturado || "0");

          for (const outro of outrosItens) {
            const outroKey = String(outro.codigoItem);
            if (!padrao.itensAssociados.has(outroKey)) {
              padrao.itensAssociados.set(outroKey, {
                codigo: outroKey,
                descricao: String(outro.descricaoItem || ""),
                tipo: String(outro.tipoItem || ""),
                ocorrencias: 0,
                quantidadeTotal: 0,
                valorTotal: 0,
              });
            }
            const assoc = padrao.itensAssociados.get(outroKey)!;
            assoc.ocorrencias++;
            assoc.quantidadeTotal += parseFloat(outro.quantidade || "1");
            assoc.valorTotal += parseFloat(outro.valorFaturado || "0");
          }
        }
      }

      // Filtrar padrões com mínimo de ocorrências e salvar
      const padroesParaSalvar: any[] = [];
      for (const [, padrao] of Array.from(padroesMap.entries())) {
        if (padrao.contas < input.minOcorrencias) continue;

        const itensFrequentes = Array.from(padrao.itensAssociados.values())
          .filter((i: any) => i.ocorrencias >= padrao.contas * 0.3)
          .map((i: any) => ({
            codigo: i.codigo,
            descricao: i.descricao,
            tipo: i.tipo,
            frequencia: Math.round((i.ocorrencias / padrao.contas) * 100),
            quantidadeMedia: Math.round((i.quantidadeTotal / i.ocorrencias) * 100) / 100,
            valorMedio: Math.round((i.valorTotal / i.ocorrencias) * 100) / 100,
          }))
          .sort((a, b) => b.frequencia - a.frequencia);

        if (itensFrequentes.length === 0) continue;

        padroesParaSalvar.push({
          convenioId: null,
          estabelecimentoId: input.estabelecimentoId,
          setor: padrao.setor !== 'GERAL' ? padrao.setor : null,
          profissionalExecutante: (padrao as any).profissional || null,
          codigoProcedimentoPrincipal: padrao.codigo,
          descricaoProcedimentoPrincipal: padrao.descricao,
          tipoProcedimentoPrincipal: padrao.tipo,
          itensAssociados: itensFrequentes,
          totalOcorrencias: padrao.contas,
          valorMedioConta: String(Math.round((padrao.valorTotal / padrao.contas) * 100) / 100),
          valorMinConta: null,
          valorMaxConta: null,
          confianca: calcularConfianca(padrao.contas),
          status: padrao.contas >= 20 ? "ativo" : "aprendendo",
        });
      }

      // Limpar padrões antigos gerados automaticamente (não gabaritos)
      const deleteConditions: any[] = [
        eq(padroesCobranca.estabelecimentoId, input.estabelecimentoId),
        eq(padroesCobranca.status, "aprendendo"),
      ];
      // Não deletar gabaritos manuais
      deleteConditions.push(sql`isGabarito = 0`);
      await db
        .delete(padroesCobranca)
        .where(and(...deleteConditions));

      if (padroesParaSalvar.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < padroesParaSalvar.length; i += batchSize) {
          const batch = padroesParaSalvar.slice(i, i + batchSize);
          await db.insert(padroesCobranca).values(batch as any);
        }
      }

      // Contar setores distintos nos padrões gerados
      const setoresDistintos = new Set(padroesParaSalvar.map(p => p.setor || 'GERAL'));

      return {
        total: padroesParaSalvar.length,
        totalContas: contasMap.size,
        totalSetores: setoresDistintos.size,
        message: `${padroesParaSalvar.length} padrões de composição gerados a partir de ${contasMap.size} contas em ${setoresDistintos.size} setor(es)`,
      };
    }),

  consultarPadroesComposicao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        busca: z.string().optional(),
        setor: z.string().optional(),
        profissional: z.string().optional(),
        status: z.enum(["aprendendo", "ativo", "revisao", "inativo"]).optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [inArray(padroesCobranca.estabelecimentoId, hospitaisAutorizados)];
      if (input.status) conditions.push(eq(padroesCobranca.status, input.status));
      if (input.setor) conditions.push(eq(padroesCobranca.setor, input.setor));
      if (input.profissional) conditions.push(eq(padroesCobranca.profissionalExecutante, input.profissional));
      if (input.busca) {
        conditions.push(
          sql`(${padroesCobranca.codigoProcedimentoPrincipal} LIKE ${`%${input.busca}%`} OR ${padroesCobranca.descricaoProcedimentoPrincipal} LIKE ${`%${input.busca}%`})`
        );
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(padroesCobranca)
          .where(and(...conditions))
          .orderBy(sql`totalOcorrencias DESC`)
          .limit(input.limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padroesCobranca)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  // ============================================================
  // PADRÃO 3: Glosa por Convênio
  // ============================================================
  gerarPadroesGlosa: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        competenciaInicio: z.string().optional(),
        competenciaFim: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const whereClause = criarFiltroFaturamento(
        [input.estabelecimentoId],
        input,
        [
          sql`codigoItem IS NOT NULL AND codigoItem != ''`,
          sql`convenio IS NOT NULL AND convenio != ''`,
          sql`tipoItem IN ('P', 'C', 'PROCEDIMENTO', 'O', '01', 'PROC', 'PROC/TAXA')`,
        ],
      );

      // Estatísticas de glosa por convênio + item
      const statsResult = await db.execute(sql`
        SELECT
          convenio,
          codigoItem,
          SUBSTRING(MAX(descricaoItem), 1, 500) as descricaoItem,
          MAX(tipoItem) as tipoItem,
          COUNT(*) as totalFaturado,
          SUM(CASE WHEN CAST(valorGlosa AS DECIMAL(14,2)) > 0 THEN 1 ELSE 0 END) as totalGlosado,
          ROUND(SUM(CAST(valorFaturado AS DECIMAL(14,2))), 2) as valorTotalFaturado,
          ROUND(SUM(CAST(valorGlosa AS DECIMAL(14,2))), 2) as valorTotalGlosado,
          ROUND(SUM(CAST(valorPago AS DECIMAL(14,2))), 2) as valorTotalPago,
          MIN(competencia) as competenciaInicio,
          MAX(competencia) as competenciaFim
        FROM faturamento_unificado
        ${whereClause}
        GROUP BY convenio, codigoItem
        HAVING COUNT(*) >= 3
      `);

      const stats = (statsResult as any)[0] || [];
      if (stats.length === 0) {
        return { total: 0, message: "Nenhum dado encontrado" };
      }

      // Buscar códigos de glosa frequentes
      const glosaResult = await db.execute(sql`
        SELECT convenio, codigoItem, codigoGlosa,
          SUBSTRING(MAX(motivoGlosa), 1, 255) as motivoGlosa,
          COUNT(*) as freq
        FROM faturamento_unificado
        ${whereClause}
          AND codigoGlosa IS NOT NULL AND codigoGlosa != ''
        GROUP BY convenio, codigoItem, codigoGlosa
      `);

      const codigosGlosa = (glosaResult as any)[0] || [];
      const glosaMap = new Map<string, any[]>();
      for (const cg of codigosGlosa) {
        const key = `${cg.convenio}|${cg.codigoItem}`;
        if (!glosaMap.has(key)) glosaMap.set(key, []);
        glosaMap.get(key)!.push({
          codigoGlosa: String(cg.codigoGlosa),
          descricao: String(cg.motivoGlosa || ""),
          frequencia: Number(cg.freq),
        });
      }

      // Limpar padrões anteriores
      const deleteConditions: any[] = [
        eq(padraoGlosaConvenio.estabelecimentoId, input.estabelecimentoId),
      ];
      if (input.convenio) {
        deleteConditions.push(eq(padraoGlosaConvenio.convenio, input.convenio));
      }
      await db.delete(padraoGlosaConvenio).where(and(...deleteConditions));

      // Inserir novos padrões
      const batchSize = 100;
      for (let i = 0; i < stats.length; i += batchSize) {
        const batch = stats.slice(i, i + batchSize);
        await db.insert(padraoGlosaConvenio).values(
          batch.map((s: any) => {
            const totalGlosado = Number(s.totalGlosado) || 0;
            const totalFaturado = Number(s.totalFaturado) || 1;
            const taxaGlosa = Math.round((totalGlosado / totalFaturado) * 10000) / 100;
            const key = `${s.convenio}|${s.codigoItem}`;

            return {
              estabelecimentoId: input.estabelecimentoId,
              convenio: String(s.convenio),
              codigoItem: String(s.codigoItem),
              descricaoItem: s.descricaoItem ? String(s.descricaoItem).substring(0, 500) : null,
              tipoItem: s.tipoItem ? String(s.tipoItem) : null,
              totalFaturado,
              totalGlosado,
              taxaGlosa: String(taxaGlosa),
              valorTotalFaturado: String(s.valorTotalFaturado || 0),
              valorTotalGlosado: String(s.valorTotalGlosado || 0),
              valorTotalPago: String(s.valorTotalPago || 0),
              codigosGlosaFrequentes: glosaMap.get(key) || [],
              nivelRisco: calcularNivelRisco(taxaGlosa, totalGlosado),
              competenciaInicio: s.competenciaInicio || input.competenciaInicio,
              competenciaFim: s.competenciaFim || input.competenciaFim,
            };
          })
        );
      }

      const totalComGlosa = stats.filter((s: any) => Number(s.totalGlosado) > 0).length;
      return {
        total: stats.length,
        totalComGlosa,
        message: `${stats.length} padrões de glosa gerados (${totalComGlosa} com glosas registradas)`,
      };
    }),

  consultarPadroesGlosa: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        nivelRisco: z.enum(["baixo", "medio", "alto", "critico"]).optional(),
        busca: z.string().optional(),
        apenasComGlosa: z.boolean().default(false),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [inArray(padraoGlosaConvenio.estabelecimentoId, hospitaisAutorizados)];
      if (input.convenio) conditions.push(eq(padraoGlosaConvenio.convenio, input.convenio));
      if (input.nivelRisco) conditions.push(eq(padraoGlosaConvenio.nivelRisco, input.nivelRisco));
      if (input.apenasComGlosa) conditions.push(sql`${padraoGlosaConvenio.totalGlosado} > 0`);
      if (input.busca) {
        conditions.push(
          sql`(${padraoGlosaConvenio.codigoItem} LIKE ${`%${input.busca}%`} OR ${padraoGlosaConvenio.descricaoItem} LIKE ${`%${input.busca}%`})`
        );
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(padraoGlosaConvenio)
          .where(and(...conditions))
          .orderBy(sql`CAST(taxaGlosa AS DECIMAL(5,2)) DESC`)
          .limit(input.limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoGlosaConvenio)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  // ============================================================
  // PADRÃO 4: Quantidade por Item
  // ============================================================
  gerarPadroesQuantidade: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        setor: z.string().optional(),
        competenciaInicio: z.string().optional(),
        competenciaFim: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const whereClause = criarFiltroFaturamento(
        [input.estabelecimentoId],
        input,
        [
          sql`codigoItem IS NOT NULL AND codigoItem != ''`,
          sql`tipoItem IN ('P', 'C', 'PROCEDIMENTO', 'O', '01', 'PROC', 'PROC/TAXA')`,
        ],
      );

      const statsResult = await db.execute(sql`
        SELECT
          COALESCE(convenio, 'TODOS') as convenio,
          COALESCE(setor, 'TODOS') as setor,
          codigoItem,
          SUBSTRING(MAX(descricaoItem), 1, 500) as descricaoItem,
          MAX(tipoItem) as tipoItem,
          ROUND(AVG(CAST(quantidade AS DECIMAL(10,4))), 4) as mediaQuantidade,
          ROUND(MIN(CAST(quantidade AS DECIMAL(10,4))), 4) as minQuantidade,
          ROUND(MAX(CAST(quantidade AS DECIMAL(10,4))), 4) as maxQuantidade,
          ROUND(STDDEV(CAST(quantidade AS DECIMAL(10,4))), 4) as desvioQuantidade,
          COUNT(*) as totalOcorrencias,
          COUNT(DISTINCT contaNumero) as totalContas,
          MIN(competencia) as competenciaInicio,
          MAX(competencia) as competenciaFim
        FROM faturamento_unificado
        ${whereClause}
        GROUP BY COALESCE(convenio, 'TODOS'), COALESCE(setor, 'TODOS'), codigoItem
        HAVING COUNT(*) >= 3
      `);

      const stats = (statsResult as any)[0] || [];
      if (stats.length === 0) {
        return { total: 0, message: "Nenhum dado encontrado" };
      }

      // Limpar padrões anteriores
      const deleteConditions: any[] = [
        eq(padraoQuantidadeItem.estabelecimentoId, input.estabelecimentoId),
      ];
      if (input.convenio) {
        deleteConditions.push(eq(padraoQuantidadeItem.convenio, input.convenio));
      }
      await db.delete(padraoQuantidadeItem).where(and(...deleteConditions));

      // Inserir novos
      const batchSize = 100;
      for (let i = 0; i < stats.length; i += batchSize) {
        const batch = stats.slice(i, i + batchSize);
        await db.insert(padraoQuantidadeItem).values(
          batch.map((s: any) => {
            const media = parseFloat(s.mediaQuantidade || "0");
            const desvio = parseFloat(s.desvioQuantidade || "0");
            return {
              estabelecimentoId: input.estabelecimentoId,
              convenio: s.convenio !== "TODOS" ? String(s.convenio) : null,
              setor: s.setor !== "TODOS" ? String(s.setor) : null,
              codigoItem: String(s.codigoItem),
              descricaoItem: s.descricaoItem ? String(s.descricaoItem).substring(0, 500) : null,
              tipoItem: s.tipoItem ? String(s.tipoItem) : null,
              mediaQuantidade: String(s.mediaQuantidade || 0),
              minQuantidade: String(s.minQuantidade || 0),
              maxQuantidade: String(s.maxQuantidade || 0),
              desvioQuantidade: String(s.desvioQuantidade || 0),
              medianaQuantidade: String(s.mediaQuantidade || 0),
              totalOcorrencias: Number(s.totalOcorrencias),
              totalContas: Number(s.totalContas),
              limiteInferior: String(Math.max(0, Math.round((media - 2 * desvio) * 10000) / 10000)),
              limiteSuperior: String(Math.round((media + 2 * desvio) * 10000) / 10000),
              confianca: calcularConfianca(Number(s.totalOcorrencias)),
              competenciaInicio: s.competenciaInicio || input.competenciaInicio,
              competenciaFim: s.competenciaFim || input.competenciaFim,
            };
          })
        );
      }

      return { total: stats.length, message: `${stats.length} padrões de quantidade gerados` };
    }),

  consultarPadroesQuantidade: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        setor: z.string().optional(),
        tipoItem: z.string().optional(),
        busca: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [inArray(padraoQuantidadeItem.estabelecimentoId, hospitaisAutorizados)];
      if (input.convenio) conditions.push(eq(padraoQuantidadeItem.convenio, input.convenio));
      if (input.setor) conditions.push(eq(padraoQuantidadeItem.setor, input.setor));
      if (input.tipoItem) conditions.push(eq(padraoQuantidadeItem.tipoItem, input.tipoItem));
      if (input.busca) {
        conditions.push(
          sql`(${padraoQuantidadeItem.codigoItem} LIKE ${`%${input.busca}%`} OR ${padraoQuantidadeItem.descricaoItem} LIKE ${`%${input.busca}%`})`
        );
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(padraoQuantidadeItem)
          .where(and(...conditions))
          .orderBy(sql`totalOcorrencias DESC`)
          .limit(input.limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoQuantidadeItem)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  // ============================================================
  // Resumo geral dos padrões
  // ============================================================
  resumo: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const [precoCount, composicaoCount, glosaCount, quantidadeCount] = await Promise.all([
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoPrecoConvenio)
          .where(inArray(padraoPrecoConvenio.estabelecimentoId, hospitaisAutorizados)),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padroesCobranca)
          .where(inArray(padroesCobranca.estabelecimentoId, hospitaisAutorizados)),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoGlosaConvenio)
          .where(inArray(padraoGlosaConvenio.estabelecimentoId, hospitaisAutorizados)),
        db
          .select({ total: sql<number>`COUNT(*)` })
          .from(padraoQuantidadeItem)
          .where(inArray(padraoQuantidadeItem.estabelecimentoId, hospitaisAutorizados)),
      ]);

      // Dados de faturamento disponíveis no subconjunto finito autorizado.
      const fatResult = await db.execute(sql`
        SELECT
          COUNT(*) as totalItens,
          COUNT(DISTINCT contaNumero) as totalContas,
          COUNT(DISTINCT convenio) as totalConvenios,
          MIN(competencia) as competenciaMin,
          MAX(competencia) as competenciaMax
        FROM faturamento_unificado
        WHERE ${filtroHospitaisSql(hospitaisAutorizados)}
      `);

      const fatStats = ((fatResult as any)[0] || [{}])[0];

      return {
        padroes: {
          preco: precoCount[0]?.total || 0,
          composicao: composicaoCount[0]?.total || 0,
          glosa: glosaCount[0]?.total || 0,
          quantidade: quantidadeCount[0]?.total || 0,
        },
        dadosDisponiveis: {
          totalItens: Number(fatStats?.totalItens || 0),
          totalContas: Number(fatStats?.totalContas || 0),
          totalConvenios: Number(fatStats?.totalConvenios || 0),
          competenciaMin: fatStats?.competenciaMin || null,
          competenciaMax: fatStats?.competenciaMax || null,
        },
      };
    }),

  // ============================================================
  // PASSO 1: REVISÃO DE PADRÕES (aprovar/rejeitar/editar)
  // ============================================================
  
  /**
   * Obter detalhes de um padrão específico para revisão
   */
  getPadraoDetalhes: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const [padrao] = await db
        .select()
        .from(padroesCobranca)
        .where(eq(padroesCobranca.id, input.id)).then((rows) => rows.map(exigirProprietarioDoPadrao));

      if (!padrao) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
      await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "visualizar");

      // Buscar feedbacks anteriores deste padrão no mesmo hospital proprietário.
      const feedbacks = await db
        .select()
        .from(feedbackDivergencias)
        .where(and(
          eq(feedbackDivergencias.padraoId, input.id),
          eq(feedbackDivergencias.estabelecimentoId, padrao.estabelecimentoId),
        ))
        .orderBy(desc(feedbackDivergencias.createdAt))
        .limit(20);

      return { padrao, feedbacks };
    }),

  /**
   * Validar padrão (aprovar, rejeitar, colocar em revisão)
   */
  validarPadrao: protectedProcedure
    .input(z.object({
      id: z.number(),
      acao: z.enum(["aprovar", "rejeitar", "revisao"]),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const [padrao] = await db.select({ estabelecimentoId: padroesCobranca.estabelecimentoId })
        .from(padroesCobranca).where(eq(padroesCobranca.id, input.id)).then((rows) => rows.map(exigirProprietarioDoPadrao));
      if (!padrao) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
      await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "editar");

      const novoStatus = input.acao === "aprovar" ? "ativo" as const
        : input.acao === "rejeitar" ? "inativo" as const
        : "revisao" as const;

      await db.update(padroesCobranca)
        .set({
          status: novoStatus,
          validadoPor: ctx.user.id,
          dataValidacao: new Date(),
          observacoesValidacao: input.observacoes || null,
          confianca: input.acao === "aprovar" ? 100 : input.acao === "rejeitar" ? 0 : 50,
        })
        .where(and(
          eq(padroesCobranca.id, input.id),
          eq(padroesCobranca.estabelecimentoId, padrao.estabelecimentoId),
        ));

      logger.info({ message: "Padrão validado", userId: ctx.user.id });
      return { success: true, novoStatus };
    }),

  /**
   * Editar itens associados de um padrão (ajustar quantidades, remover itens, etc.)
   */
   editarPadrao: protectedProcedure
    .input(z.object({
      id: z.number(),
      convenioId: z.number().nullable().optional(),
      codigoProcedimentoPrincipal: z.string().optional(),
      descricaoProcedimentoPrincipal: z.string().optional(),
      setor: z.string().nullable().optional(),
      itensAssociados: z.array(z.object({
        codigo: z.string(),
        descricao: z.string(),
        tipo: z.string().optional(),
        frequencia: z.number(),
        quantidadeMedia: z.number(),
        quantidadeMin: z.number().optional(),
        quantidadeMax: z.number().optional(),
        valorMedio: z.number().optional(),
        categoria: z.enum(['obrigatorio', 'condicional', 'opcional']).default('obrigatorio'),
        grupo: z.string().optional(), // Nome do grupo condicional (ex: "UTI", "Enfermaria")
        grupoAlternativo: z.string().trim().min(1).optional(),
        grupoObrigatorio: z.boolean().optional(),
      })),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const [padrao] = await db.select({ estabelecimentoId: padroesCobranca.estabelecimentoId })
        .from(padroesCobranca).where(eq(padroesCobranca.id, input.id)).then((rows) => rows.map(exigirProprietarioDoPadrao));
      if (!padrao) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
      await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "editar");

      const updateData: any = {
        itensAssociados: input.itensAssociados,
        convenioId: input.convenioId !== undefined ? (input.convenioId || null) : undefined,
        validadoPor: ctx.user.id,
        dataValidacao: new Date(),
        observacoesValidacao: input.observacoes || null,
        status: "ativo",
        confianca: 100,
      };
      // Permitir edição do código e descrição do procedimento principal
      if (input.codigoProcedimentoPrincipal !== undefined) {
        updateData.codigoProcedimentoPrincipal = input.codigoProcedimentoPrincipal;
      }
      if (input.descricaoProcedimentoPrincipal !== undefined) {
        updateData.descricaoProcedimentoPrincipal = input.descricaoProcedimentoPrincipal;
      }
      if (input.setor !== undefined) {
        updateData.setor = input.setor || null;
      }

      await db.update(padroesCobranca)
        .set(updateData)
        .where(and(
          eq(padroesCobranca.id, input.id),
          eq(padroesCobranca.estabelecimentoId, padrao.estabelecimentoId),
        ));

      logger.info({ message: "Padrão editado manualmente", userId: ctx.user.id });
      return { success: true };
    }),

  // ============================================================
  // PASSO 2: GABARITO MANUAL (criar padrão do zero)
  // ============================================================
  
  /**
   * Criar gabarito manual - padrão definido pelo auditor
   */
  criarGabarito: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number().optional(),
      setor: z.string().optional(), // Setor de atendimento (ex: CENTRO CIRURGICO)
      codigoProcedimentoPrincipal: z.string(),
      descricaoProcedimentoPrincipal: z.string(),
      itensAssociados: z.array(z.object({
        codigo: z.string(),
        descricao: z.string(),
        tipo: z.string().optional(),
        frequencia: z.number().default(100),
        quantidadeMedia: z.number(),
        quantidadeMin: z.number().optional(),
        quantidadeMax: z.number().optional(),
        valorMedio: z.number().optional(),
        categoria: z.enum(['obrigatorio', 'condicional', 'opcional']).default('obrigatorio'),
        grupo: z.string().optional(), // Nome do grupo condicional (ex: "UTI", "Enfermaria")
        grupoAlternativo: z.string().trim().min(1).optional(),
        grupoObrigatorio: z.boolean().optional(),
      })),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Verificar se já existe gabarito para este procedimento+setor
      const existenteConditions: any[] = [
        eq(padroesCobranca.estabelecimentoId, input.estabelecimentoId),
        eq(padroesCobranca.codigoProcedimentoPrincipal, input.codigoProcedimentoPrincipal),
        sql`isGabarito = 1`,
      ];
      if (input.setor) {
        existenteConditions.push(eq(padroesCobranca.setor, input.setor));
      } else {
        existenteConditions.push(sql`setor IS NULL`);
      }
      const existente = await db
        .select({ id: padroesCobranca.id })
        .from(padroesCobranca)
        .where(and(...existenteConditions));

      if (existente.length > 0) {
        // Atualizar gabarito existente
        await db.update(padroesCobranca)
          .set({
            descricaoProcedimentoPrincipal: input.descricaoProcedimentoPrincipal,
            itensAssociados: input.itensAssociados,
            convenioId: input.convenioId || null,
            setor: input.setor || null,
            validadoPor: ctx.user.id,
            dataValidacao: new Date(),
            observacoesValidacao: input.observacoes || null,
            status: "ativo",
            confianca: 100,
          })
          .where(and(
            eq(padroesCobranca.id, existente[0].id),
            eq(padroesCobranca.estabelecimentoId, input.estabelecimentoId),
          ));

        return { success: true, id: existente[0].id, atualizado: true };
      }

      // Criar novo gabarito
      const [result] = await db.insert(padroesCobranca).values({
        estabelecimentoId: input.estabelecimentoId,
        convenioId: input.convenioId || null,
        setor: input.setor || null,
        codigoProcedimentoPrincipal: input.codigoProcedimentoPrincipal,
        descricaoProcedimentoPrincipal: input.descricaoProcedimentoPrincipal,
        tipoProcedimentoPrincipal: "PROCEDIMENTO",
        itensAssociados: input.itensAssociados,
        totalOcorrencias: 0,
        confianca: 100,
        status: "ativo",
        isGabarito: 1,
        validadoPor: ctx.user.id,
        dataValidacao: new Date(),
        observacoesValidacao: input.observacoes || null,
      });

      logger.info({ message: "Gabarito manual criado", userId: ctx.user.id });
      return { success: true, id: result.insertId, atualizado: false };
    }),

  /**
   * Listar gabaritos manuais
   */
  listarGabaritos: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      busca: z.string().optional(),
      setor: z.string().optional(),
      profissional: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [
        inArray(padroesCobranca.estabelecimentoId, hospitaisAutorizados),
        eq(padroesCobranca.isGabarito, 1),
      ];
      if (input.setor) conditions.push(eq(padroesCobranca.setor, input.setor));
      if (input.profissional) conditions.push(eq(padroesCobranca.profissionalExecutante, input.profissional));
      if (input.busca) {
        conditions.push(
          sql`(${padroesCobranca.codigoProcedimentoPrincipal} LIKE ${`%${input.busca}%`} OR ${padroesCobranca.descricaoProcedimentoPrincipal} LIKE ${`%${input.busca}%`})`
        );
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db.select().from(padroesCobranca)
          .where(and(...conditions))
          .orderBy(desc(padroesCobranca.updatedAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)` })
          .from(padroesCobranca)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  /**
   * Excluir gabarito manual
   */
  excluirGabarito: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Verificar se é gabarito e autorizar o hospital proprietário persistido.
      const [padrao] = await db.select({
        isGabarito: padroesCobranca.isGabarito,
        estabelecimentoId: padroesCobranca.estabelecimentoId,
      }).from(padroesCobranca).where(eq(padroesCobranca.id, input.id)).then((rows) => rows.map(exigirProprietarioDoPadrao));
      if (!padrao || padrao.isGabarito !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas gabaritos manuais podem ser excluídos" });
      }
      await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "excluir");

      await db.delete(padroesCobranca).where(and(
        eq(padroesCobranca.id, input.id),
        eq(padroesCobranca.estabelecimentoId, padrao.estabelecimentoId),
      ));
      logger.info({ message: "Gabarito excluído", userId: ctx.user.id });
      return { success: true };
    }),

  /**
   * Duplicar gabarito manual - copia um gabarito existente para outro convênio/setor
   */
  duplicarGabarito: protectedProcedure
    .input(z.object({
      id: z.number(), // ID do gabarito original
      novoConvenioId: z.number().nullable().optional(), // Convênio destino (null = todos)
      novoSetor: z.string().nullable().optional(), // Setor destino (null = geral)
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Buscar gabarito original
      const [original] = await db.select().from(padroesCobranca).where(eq(padroesCobranca.id, input.id)).then((rows) => rows.map(exigirProprietarioDoPadrao));
      if (!original) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gabarito original não encontrado" });
      }
      // A cópia sempre será criada como gabarito (isGabarito = 1). A origem
      // precisa ser visível e o mesmo hospital de destino precisa ser editável.
      await exigirHospitalProprietario(ctx.user, original.estabelecimentoId, "visualizar");
      await exigirHospitalProprietario(ctx.user, original.estabelecimentoId, "editar");

      const novoConvenioId = input.novoConvenioId !== undefined ? (input.novoConvenioId || null) : original.convenioId;
      const novoSetor = input.novoSetor !== undefined ? (input.novoSetor || null) : original.setor;

      // Verificar se já existe gabarito para este procedimento+convênio+setor
      const existenteConditions: any[] = [
        eq(padroesCobranca.estabelecimentoId, original.estabelecimentoId),
        eq(padroesCobranca.codigoProcedimentoPrincipal, original.codigoProcedimentoPrincipal),
        eq(padroesCobranca.isGabarito, 1),
      ];
      if (novoConvenioId) {
        existenteConditions.push(eq(padroesCobranca.convenioId, novoConvenioId));
      } else {
        existenteConditions.push(sql`convenioId IS NULL`);
      }
      if (novoSetor) {
        existenteConditions.push(eq(padroesCobranca.setor, novoSetor));
      } else {
        existenteConditions.push(sql`setor IS NULL`);
      }
      const existente = await db
        .select({ id: padroesCobranca.id })
        .from(padroesCobranca)
        .where(and(...existenteConditions));

      if (existente.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um gabarito para este procedimento com o convênio/setor selecionado" });
      }

      // Criar cópia
      const [result] = await db.insert(padroesCobranca).values({
        estabelecimentoId: original.estabelecimentoId,
        convenioId: novoConvenioId,
        setor: novoSetor,
        profissionalExecutante: original.profissionalExecutante,
        codigoProcedimentoPrincipal: original.codigoProcedimentoPrincipal,
        descricaoProcedimentoPrincipal: original.descricaoProcedimentoPrincipal,
        tipoProcedimentoPrincipal: original.tipoProcedimentoPrincipal,
        itensAssociados: original.itensAssociados,
        totalOcorrencias: 0,
        confianca: 100,
        status: "ativo",
        isGabarito: 1,
        validadoPor: ctx.user.id,
        dataValidacao: new Date(),
        observacoesValidacao: input.observacoes || `Duplicado do gabarito #${original.id}`,
      });

      logger.info({ message: "Gabarito duplicado", userId: ctx.user.id });
      return { success: true, id: result.insertId, originalId: original.id };
    }),

  /**
   * Duplicar múltiplos gabaritos/composições em lote para outro convênio
   */
  duplicarEmLote: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1, "Selecione pelo menos um padrão"),
      novoConvenioId: z.number().nullable().optional(),
      novoSetor: z.string().nullable().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const resultados: { originalId: number; novoId: number; codigo: string }[] = [];
      const erros: { originalId: number; codigo: string; motivo: string }[] = [];
      const originais = await db.select().from(padroesCobranca)
        .where(inArray(padroesCobranca.id, [...new Set(input.ids)])).then((rows) => rows.map(exigirProprietarioDoPadrao));
      const originaisPorId = new Map(originais.map((padrao) => [padrao.id, padrao]));

      // Autorizar todas as origens e destinos antes da primeira mutação do lote.
      for (const original of originais) {
        await exigirHospitalProprietario(ctx.user, original.estabelecimentoId, "visualizar");
        await exigirHospitalProprietario(ctx.user, original.estabelecimentoId, "editar");
      }

      for (const id of input.ids) {
        try {
          const original = originaisPorId.get(id);
          if (!original) {
            erros.push({ originalId: id, codigo: "?", motivo: "Padrão não encontrado" });
            continue;
          }

          const novoConvenioId = input.novoConvenioId !== undefined ? (input.novoConvenioId || null) : original.convenioId;
          const novoSetor = input.novoSetor !== undefined ? (input.novoSetor || null) : original.setor;

          // Verificar duplicata
          const existenteConditions: any[] = [
            eq(padroesCobranca.estabelecimentoId, original.estabelecimentoId),
            eq(padroesCobranca.codigoProcedimentoPrincipal, original.codigoProcedimentoPrincipal),
            eq(padroesCobranca.isGabarito, 1),
          ];
          if (novoConvenioId) {
            existenteConditions.push(eq(padroesCobranca.convenioId, novoConvenioId));
          } else {
            existenteConditions.push(sql`convenioId IS NULL`);
          }
          if (novoSetor) {
            existenteConditions.push(eq(padroesCobranca.setor, novoSetor));
          } else {
            existenteConditions.push(sql`setor IS NULL`);
          }
          const existente = await db
            .select({ id: padroesCobranca.id })
            .from(padroesCobranca)
            .where(and(...existenteConditions));

          if (existente.length > 0) {
            erros.push({ originalId: id, codigo: original.codigoProcedimentoPrincipal || "?", motivo: "Já existe gabarito para este procedimento+convênio+setor" });
            continue;
          }

          const [result] = await db.insert(padroesCobranca).values({
            estabelecimentoId: original.estabelecimentoId,
            convenioId: novoConvenioId,
            setor: novoSetor,
            profissionalExecutante: original.profissionalExecutante,
            codigoProcedimentoPrincipal: original.codigoProcedimentoPrincipal,
            descricaoProcedimentoPrincipal: original.descricaoProcedimentoPrincipal,
            tipoProcedimentoPrincipal: original.tipoProcedimentoPrincipal,
            itensAssociados: original.itensAssociados,
            totalOcorrencias: 0,
            confianca: 100,
            status: "ativo",
            isGabarito: 1,
            validadoPor: ctx.user.id,
            dataValidacao: new Date(),
            observacoesValidacao: input.observacoes || `Duplicado em lote do padrão #${original.id}`,
          });

          resultados.push({ originalId: id, novoId: result.insertId as number, codigo: original.codigoProcedimentoPrincipal || "?" });
        } catch (err: any) {
          erros.push({ originalId: id, codigo: "?", motivo: err.message || "Erro desconhecido" });
        }
      }

      logger.info({ message: "Duplicação de gabaritos em lote concluída", userId: ctx.user.id });
      return {
        sucesso: resultados.length,
        erros: erros.length,
        resultados,
        detalhesErros: erros,
        message: `${resultados.length} gabarito(s) duplicado(s) com sucesso${erros.length > 0 ? `, ${erros.length} erro(s)` : ""}`,
      };
    }),

  // ============================================================
  // PASSO 4: FEEDBACK LOOP (aceitar/rejeitar divergências)
  // ============================================================
  
  /**
   * Registrar feedback do auditor sobre uma divergência
   */
  registrarFeedback: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      codigoItem: z.string().optional(),
      padraoId: z.number().optional(),
      tipoDivergencia: z.string(),
      decisao: z.enum(["aceitar", "rejeitar", "ignorar"]),
      justificativa: z.string().optional(),
      dadosDivergencia: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const [padrao] = input.padraoId ? await db.select({
        estabelecimentoId: padroesCobranca.estabelecimentoId,
        confianca: padroesCobranca.confianca,
      }).from(padroesCobranca).where(eq(padroesCobranca.id, input.padraoId)).then((rows) => rows.map(exigirProprietarioDoPadrao)) : [undefined];
      if (input.padraoId) {
        if (!padrao) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
        await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "editar");
        if (padrao.estabelecimentoId !== input.estabelecimentoId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O padrão não pertence ao hospital do feedback." });
        }
      }

      // Registrar feedback
      await db.insert(feedbackDivergencias).values({
        numeroConta: input.numeroConta,
        estabelecimentoId: input.estabelecimentoId,
        codigoItem: input.codigoItem || null,
        padraoId: input.padraoId || null,
        tipoDivergencia: input.tipoDivergencia,
        decisao: input.decisao,
        justificativa: input.justificativa || null,
        dadosDivergencia: input.dadosDivergencia || null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || null,
      });

      // Se "aceitar" (divergência é válida) e tem padrãoId, ajustar o padrão
      if (input.decisao === "aceitar" && input.padraoId) {
        // Contar feedbacks "aceitar" para este padrão
        const [countResult] = await db
          .select({ total: sql<number>`COUNT(*)` })
          .from(feedbackDivergencias)
          .where(and(
            eq(feedbackDivergencias.padraoId, input.padraoId),
            eq(feedbackDivergencias.estabelecimentoId, padrao!.estabelecimentoId),
            eq(feedbackDivergencias.decisao, "aceitar"),
          ));

        const totalAceitos = countResult?.total || 0;

        // Se muitos feedbacks "aceitar", colocar padrão em revisão
        if (totalAceitos >= 3) {
          await db.update(padroesCobranca)
            .set({ status: "revisao" })
            .where(and(
              eq(padroesCobranca.id, input.padraoId),
              eq(padroesCobranca.estabelecimentoId, padrao!.estabelecimentoId),
            ));

          logger.info({ message: "Padrão movido para revisão após feedbacks", userId: ctx.user.id });
        }
      }

      // Se "rejeitar" (falso positivo) e tem padrãoId, aumentar confiança
      if (input.decisao === "rejeitar" && input.padraoId) {
        if (padrao) {
          const novaConfianca = Math.min(100, (padrao.confianca || 50) + 5);
          await db.update(padroesCobranca)
            .set({ confianca: novaConfianca })
            .where(and(
              eq(padroesCobranca.id, input.padraoId),
              eq(padroesCobranca.estabelecimentoId, padrao.estabelecimentoId),
            ));
        }
      }

      logger.info({ message: "Feedback registrado", userId: ctx.user.id });
      return { success: true };
    }),

  /**
   * Listar feedbacks de um padrão ou estabelecimento
   */
  listarFeedbacks: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      padraoId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const conditions: any[] = [
        inArray(feedbackDivergencias.estabelecimentoId, hospitaisAutorizados),
      ];
      if (input.padraoId) {
        const [padrao] = await db.select({ estabelecimentoId: padroesCobranca.estabelecimentoId })
          .from(padroesCobranca).where(eq(padroesCobranca.id, input.padraoId)).then((rows) => rows.map(exigirProprietarioDoPadrao));
        if (!padrao) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
        await exigirHospitalProprietario(ctx.user, padrao.estabelecimentoId, "visualizar");
        if (!hospitaisAutorizados.includes(padrao.estabelecimentoId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Padrão fora do escopo solicitado." });
        }
        conditions.push(eq(feedbackDivergencias.padraoId, input.padraoId));
      }

      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        db.select().from(feedbackDivergencias)
          .where(and(...conditions))
          .orderBy(desc(feedbackDivergencias.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)` })
          .from(feedbackDivergencias)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: countResult[0]?.total || 0,
        page: input.page,
        totalPages: Math.ceil((countResult[0]?.total || 0) / input.limit),
      };
    }),

  /**
   * Autocomplete de códigos de itens do faturamento_unificado
   * Busca códigos e descrições para preencher campos do gabarito
   */
  autocompleteCodigos: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      busca: z.string().min(2),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const buscaLike = `%${input.busca}%`;

      const result = await db.execute(sql`
        SELECT 
          codigoItem as codigo,
          MAX(descricaoItem) as descricao,
          MAX(tipoItem) as tipo,
          COUNT(*) as totalOcorrencias,
          ROUND(AVG(CAST(COALESCE(NULLIF(quantidade, ''), '1') AS DECIMAL(12,2))), 2) as quantidadeMedia,
          ROUND(AVG(CAST(COALESCE(NULLIF(valorFaturado, ''), '0') AS DECIMAL(14,2))), 2) as valorMedio
        FROM faturamento_unificado
        WHERE ${filtroHospitaisSql(hospitaisAutorizados)}
          AND codigoItem IS NOT NULL AND codigoItem != ''
          AND (
            codigoItem LIKE ${buscaLike}
            OR descricaoItem LIKE ${buscaLike}
          )
        GROUP BY codigoItem
        ORDER BY COUNT(*) DESC
        LIMIT ${input.limit}
      `);

      return ((result as any)[0] || []).map((r: any) => ({
        codigo: r.codigo,
        descricao: r.descricao || '',
        tipo: r.tipo || 'MAT_MED',
        totalOcorrencias: Number(r.totalOcorrencias || 0),
        quantidadeMedia: Number(r.quantidadeMedia || 1),
        valorMedio: Number(r.valorMedio || 0),
      }));
    }),

  /**
   * Estatísticas de feedbacks por padrão
   */
  estatisticasFeedback: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input.estabelecimentoId, "visualizar");
      const stats = await db.execute(sql`
        SELECT 
          padraoId,
          SUM(CASE WHEN decisao = 'aceitar' THEN 1 ELSE 0 END) as totalAceitos,
          SUM(CASE WHEN decisao = 'rejeitar' THEN 1 ELSE 0 END) as totalRejeitados,
          SUM(CASE WHEN decisao = 'ignorar' THEN 1 ELSE 0 END) as totalIgnorados,
          COUNT(*) as totalFeedbacks
        FROM feedback_divergencias
        WHERE ${filtroHospitaisSql(hospitaisAutorizados)}
          AND padraoId IS NOT NULL
        GROUP BY padraoId
      `);

      return (stats as any)[0] || [];
    }),

  // ============================================================
  // PADRÕES TASY (dados do contas_convenio_itens)
  // ============================================================

  /**
   * Analisar padrões de cobrança a partir dos dados do Tasy
   * Retorna composição, preços, quantidade e padrões por médico
   */
  analisarPadroesTasy: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        competencia: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const { analisarPadroesCobrancaTasy } = await import("../db");
      return analisarPadroesCobrancaTasy(input);
    }),

  /**
   * Salvar/atualizar padrões de cobrança Tasy na tabela padroesCobranca
   */
  salvarPadroesTasy: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        competencia: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const { salvarPadroesCobrancaTasy } = await import("../db");
      return salvarPadroesCobrancaTasy(input);
    }),

});

// ============================================================
// Funções auxiliares
// ============================================================


function calcularConfianca(totalOcorrencias: number): number {
  if (totalOcorrencias >= 100) return 95;
  if (totalOcorrencias >= 50) return 85;
  if (totalOcorrencias >= 20) return 70;
  if (totalOcorrencias >= 10) return 55;
  if (totalOcorrencias >= 5) return 40;
  return 20;
}

function calcularNivelRisco(taxaGlosa: number, totalGlosado: number): "baixo" | "medio" | "alto" | "critico" {
  if (totalGlosado === 0) return "baixo";
  if (taxaGlosa >= 50) return "critico";
  if (taxaGlosa >= 25) return "alto";
  if (taxaGlosa >= 10) return "medio";
  return "baixo";
}
