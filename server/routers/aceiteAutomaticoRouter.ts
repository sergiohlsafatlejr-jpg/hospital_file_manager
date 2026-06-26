import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { glosasAceiteAutomatico } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export const aceiteAutomaticoRouter = router({
  // Listar todos os padrões de aceite automático
  listar: protectedProcedure
    .input(z.object({
      convenioId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const conditions: any[] = [eq(glosasAceiteAutomatico.ativo, "sim")];
      
      if (input?.convenioId) {
        conditions.push(eq(glosasAceiteAutomatico.convenioId, input.convenioId));
      }
      if (input?.estabelecimentoId) {
        conditions.push(eq(glosasAceiteAutomatico.estabelecimentoId, input.estabelecimentoId));
      }
      
      const result = await db
        .select()
        .from(glosasAceiteAutomatico)
        .where(and(...conditions))
        .orderBy(glosasAceiteAutomatico.codigoGlosa);
      
      return result;
    }),

  // Criar novo padrão de aceite automático
  criar: protectedProcedure
    .input(z.object({
      codigoGlosa: z.string().min(1),
      descricaoGlosa: z.string().optional(),
      convenioId: z.number().nullable().optional(),
      estabelecimentoId: z.number().nullable().optional(),
      motivoAceite: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [result] = await db
        .insert(glosasAceiteAutomatico)
        .values({
          codigoGlosa: input.codigoGlosa,
          descricaoGlosa: input.descricaoGlosa || null,
          convenioId: input.convenioId || null,
          estabelecimentoId: input.estabelecimentoId || null,
          motivoAceite: input.motivoAceite || null,
          criadoPor: ctx.user.id,
          criadoPorNome: ctx.user.name || 'Usuário',
        });
      
      return { id: result.insertId, success: true };
    }),

  // Criar múltiplos padrões de uma vez
  criarEmLote: protectedProcedure
    .input(z.object({
      itens: z.array(z.object({
        codigoGlosa: z.string().min(1),
        descricaoGlosa: z.string().optional(),
        convenioId: z.number().nullable().optional(),
        estabelecimentoId: z.number().nullable().optional(),
        motivoAceite: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const values = input.itens.map(item => ({
        codigoGlosa: item.codigoGlosa,
        descricaoGlosa: item.descricaoGlosa || null,
        convenioId: item.convenioId || null,
        estabelecimentoId: item.estabelecimentoId || null,
        motivoAceite: item.motivoAceite || null,
        criadoPor: ctx.user.id,
        criadoPorNome: ctx.user.name || 'Usuário',
      }));
      
      if (values.length > 0) {
        await db.insert(glosasAceiteAutomatico).values(values);
      }
      
      return { success: true, count: values.length };
    }),

  // Editar padrão existente
  editar: protectedProcedure
    .input(z.object({
      id: z.number(),
      codigoGlosa: z.string().min(1).optional(),
      descricaoGlosa: z.string().optional(),
      convenioId: z.number().nullable().optional(),
      estabelecimentoId: z.number().nullable().optional(),
      motivoAceite: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const { id, ...updates } = input;
      const updateData: any = {};
      
      if (updates.codigoGlosa !== undefined) updateData.codigoGlosa = updates.codigoGlosa;
      if (updates.descricaoGlosa !== undefined) updateData.descricaoGlosa = updates.descricaoGlosa;
      if (updates.convenioId !== undefined) updateData.convenioId = updates.convenioId;
      if (updates.estabelecimentoId !== undefined) updateData.estabelecimentoId = updates.estabelecimentoId;
      if (updates.motivoAceite !== undefined) updateData.motivoAceite = updates.motivoAceite;
      
      await db
        .update(glosasAceiteAutomatico)
        .set(updateData)
        .where(eq(glosasAceiteAutomatico.id, id));
      
      return { success: true };
    }),

  // Excluir (desativar) padrão
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db
        .update(glosasAceiteAutomatico)
        .set({ ativo: "nao" })
        .where(eq(glosasAceiteAutomatico.id, input.id));
      
      return { success: true };
    }),

  // Aplicar padrões nos dados existentes (demonstrativo + recebimentos_excel)
  aplicarNosExistentes: protectedProcedure
    .input(z.object({
      convenioId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Buscar todos os padrões ativos
      const padroes = await db
        .select()
        .from(glosasAceiteAutomatico)
        .where(eq(glosasAceiteAutomatico.ativo, "sim"));
      
      if (padroes.length === 0) {
        return { success: true, totalAfetados: 0, message: "Nenhum padrão de aceite automático cadastrado." };
      }
      
      const usuario = ctx.user.name || 'Sistema (Aceite Automático)';
      let totalAfetados = 0;
      
      for (const padrao of padroes) {
        // Construir condições para o UPDATE
        let condicoesDemonstrativo = `codigo_glosa = '${padrao.codigoGlosa.replace(/'/g, "''")}'`;
        let condicoesExcel = `codigo_glosa = '${padrao.codigoGlosa.replace(/'/g, "''")}'`;
        
        // Filtro por convênio do padrão
        if (padrao.convenioId) {
          condicoesDemonstrativo += ` AND convenio_id = ${padrao.convenioId}`;
          condicoesExcel += ` AND convenioId = ${padrao.convenioId}`;
        }
        
        // Filtro por estabelecimento do padrão
        if (padrao.estabelecimentoId) {
          condicoesDemonstrativo += ` AND estabelecimentoId = ${padrao.estabelecimentoId}`;
          condicoesExcel += ` AND estabelecimentoId = ${padrao.estabelecimentoId}`;
        }
        
        // Filtro adicional do input
        if (input?.convenioId) {
          condicoesDemonstrativo += ` AND convenio_id = ${input.convenioId}`;
          condicoesExcel += ` AND convenioId = ${input.convenioId}`;
        }
        if (input?.estabelecimentoId) {
          condicoesDemonstrativo += ` AND estabelecimentoId = ${input.estabelecimentoId}`;
          condicoesExcel += ` AND estabelecimentoId = ${input.estabelecimentoId}`;
        }
        
        // Aplicar na tabela demonstrativo (apenas onde glosa_aceita não está marcada e tem glosa)
        const sqlDemo = `
          UPDATE demonstrativo 
          SET glosa_aceita = 1, 
              glosa_aceita_por = '${usuario.replace(/'/g, "''")} (Auto: ${padrao.codigoGlosa})', 
              glosa_aceita_em = NOW(),
              valor_recurso = 0,
              recurso_status = 'sem_recurso'
          WHERE ${condicoesDemonstrativo}
            AND (glosa_aceita IS NULL OR glosa_aceita = 0)
            AND valor_glosa > 0
        `;
        
        const [[demoResult]] = await db.execute(sql.raw(sqlDemo));
        totalAfetados += (demoResult as any)?.affectedRows || 0;
        
        // Aplicar na tabela recebimentos_excel (apenas onde glosa_aceita não está marcada e tem glosa)
        const sqlExcel = `
          UPDATE recebimentos_excel 
          SET glosa_aceita = 1, 
              glosa_aceita_por = '${usuario.replace(/'/g, "''")} (Auto: ${padrao.codigoGlosa})', 
              glosa_aceita_em = NOW(),
              valor_recurso = 0,
              status_recurso_item = 'aceita'
          WHERE ${condicoesExcel}
            AND (glosa_aceita IS NULL OR glosa_aceita = 0)
            AND (valor_glosa > 0 OR erro_tiss IS NOT NULL)
        `;
        
        const [[excelResult]] = await db.execute(sql.raw(sqlExcel));
        totalAfetados += (excelResult as any)?.affectedRows || 0;
      }
      
      return { 
        success: true, 
        totalAfetados, 
        message: `${totalAfetados} itens marcados como aceite automático.` 
      };
    }),

  // Buscar códigos de glosa disponíveis (para autocomplete)
  codigosDisponiveis: protectedProcedure
    .input(z.object({
      busca: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      
      let query = `
        SELECT codigo, descricaoSimplificada as descricao, grupo
        FROM motivosGlosa 
        WHERE ativo = 'sim'
      `;
      
      if (input?.busca) {
        const busca = input.busca.replace(/'/g, "''");
        query += ` AND (codigo LIKE '%${busca}%' OR descricaoSimplificada LIKE '%${busca}%')`;
      }
      
      query += ` ORDER BY codigo LIMIT 50`;
      
      const [[rows]] = await db.execute(sql.raw(query));
      return rows as Array<{ codigo: string; descricao: string; grupo: string }>;
    }),

  // Estatísticas: quantos itens seriam afetados se aplicar agora
  simularAplicacao: protectedProcedure
    .input(z.object({
      codigoGlosa: z.string(),
      convenioId: z.number().nullable().optional(),
      estabelecimentoId: z.number().nullable().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalItens: 0, valorTotal: 0, demonstrativo: 0, recebimentosExcel: 0 };
      
      let condicoesDemonstrativo = `codigo_glosa = '${input.codigoGlosa.replace(/'/g, "''")}'`;
      let condicoesExcel = `codigo_glosa = '${input.codigoGlosa.replace(/'/g, "''")}'`;
      
      if (input.convenioId) {
        condicoesDemonstrativo += ` AND convenio_id = ${input.convenioId}`;
        condicoesExcel += ` AND convenioId = ${input.convenioId}`;
      }
      if (input.estabelecimentoId) {
        condicoesDemonstrativo += ` AND estabelecimentoId = ${input.estabelecimentoId}`;
        condicoesExcel += ` AND estabelecimentoId = ${input.estabelecimentoId}`;
      }
      
      const sqlDemo = `
        SELECT COUNT(*) as total, COALESCE(SUM(valor_glosa), 0) as valorTotal
        FROM demonstrativo 
        WHERE ${condicoesDemonstrativo}
          AND (glosa_aceita IS NULL OR glosa_aceita = 0)
          AND valor_glosa > 0
      `;
      
      const sqlExcel = `
        SELECT COUNT(*) as total, COALESCE(SUM(valor_glosa), 0) as valorTotal
        FROM recebimentos_excel 
        WHERE ${condicoesExcel}
          AND (glosa_aceita IS NULL OR glosa_aceita = 0)
          AND (valor_glosa > 0 OR erro_tiss IS NOT NULL)
      `;
      
      const [[demoRows]] = await db.execute(sql.raw(sqlDemo));
      const [[excelRows]] = await db.execute(sql.raw(sqlExcel));
      
      const demoData = (demoRows as any[])[0] || { total: 0, valorTotal: 0 };
      const excelData = (excelRows as any[])[0] || { total: 0, valorTotal: 0 };
      
      return {
        totalItens: Number(demoData.total) + Number(excelData.total),
        valorTotal: Number(demoData.valorTotal) + Number(excelData.valorTotal),
        demonstrativo: Number(demoData.total),
        recebimentosExcel: Number(excelData.total),
      };
    }),
});
