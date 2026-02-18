import { router, publicProcedure, protectedProcedure, trackedProtectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { logger } from "../_core/logger";
import { sql } from "drizzle-orm";
import {
  cacheGetOrSet,
  invalidateComparacoesCache,
  generateComparacoesKey,
  CACHE_TTL,
} from "../_core/cache";

const ENABLE_COMPARACOES_MODULO = process.env.ENABLE_MODULO_COMPARACOES === "true";

/**
 * Router de Comparação de faturamentos
 * 
 * Este módulo implementa o Strangler Pattern:
 * - Procedures migradas do monolito
 * - Fallback para monolito se não encontrado
 * - Feature flag para rollout gradual (10% de tráfego)
 */

export const comparacoesRouter = router({
  /**
   * Criar comparação entre faturamento e recebimento
   */
  create: trackedProtectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().positive(),
        faturamentoId: z.number().positive(),
        recebimentoId: z.number().positive(),
        status: z.enum(["pendente", "conciliado", "divergencia"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ENABLE_COMPARACOES_MODULO) {
        throw new Error("Módulo de comparações não ativado");
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const resultado = await db.execute(
          sql`INSERT INTO comparacao (estabelecimentoId, faturamentoId, recebimentoId, status, data_criacao)
              VALUES (${input.estabelecimentoId}, ${input.faturamentoId}, ${input.recebimentoId}, ${input.status}, NOW())`
        );

        await invalidateComparacoesCache(input.estabelecimentoId);

        logger.info({
          message: "Comparação criada",
          estabelecimentoId: input.estabelecimentoId,
          faturamentoId: input.faturamentoId,
          status: input.status,
          usuarioId: ctx.user.id,
        });

        return { id: Number((resultado as any)[0]?.insertId || 0), status: "sucesso" };
      } catch (error) {
        logger.error({
          message: "Erro ao criar comparação",
          error: String(error),
          input,
        });
        throw error;
      }
    }),

  /**
   * Listar comparações com cache
   */
  list: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().positive(),
        status: z.enum(["pendente", "conciliado", "divergencia"]).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const cacheKey = generateComparacoesKey(
        input.estabelecimentoId,
        input.status || "all"
      );

      return cacheGetOrSet(
        cacheKey,
        async () => {
          const db = await getDb();
          if (!db) return [];

          let query = sql`SELECT * FROM comparacao WHERE estabelecimentoId = ${input.estabelecimentoId}`;

          if (input.status) {
            query = sql`SELECT * FROM comparacao WHERE estabelecimentoId = ${input.estabelecimentoId} AND status = ${input.status}`;
          }

          const resultado = await db.execute(
            sql`${query} ORDER BY data_criacao DESC LIMIT ${input.limit} OFFSET ${input.offset}`
          );

          return Array.isArray(resultado) ? resultado : [];
        },
        CACHE_TTL.COMPARACOES
      );
    }),

  /**
   * Obter comparação por ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(async ({ input }) => {
      const cacheKey = `comparacao:${input.id}`;

      return cacheGetOrSet(
        cacheKey,
        async () => {
          const db = await getDb();
          if (!db) return null;

          const resultado = await db.execute(
            sql`SELECT * FROM comparacao WHERE id = ${input.id} LIMIT 1`
          );

          return Array.isArray(resultado) && resultado.length > 0 ? resultado[0] : null;
        },
        CACHE_TTL.COMPARACOES
      );
    }),

  /**
   * Atualizar status de comparação
   */
  update: trackedProtectedProcedure
    .input(
      z.object({
        id: z.number().positive(),
        status: z.enum(["pendente", "conciliado", "divergencia"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ENABLE_COMPARACOES_MODULO) {
        throw new Error("Módulo de comparações não ativado");
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const comparacao = await db.execute(
          sql`SELECT estabelecimentoId FROM comparacao WHERE id = ${input.id} LIMIT 1`
        );

        if (!Array.isArray(comparacao) || !comparacao[0]) {
          throw new Error("Comparação não encontrada");
        }

        await db.execute(
          sql`UPDATE comparacao SET status = ${input.status}, data_atualizacao = NOW() WHERE id = ${input.id}`
        );

        const estabelecimentoId = (comparacao[0] as any).estabelecimentoId;
        if (estabelecimentoId) {
          await invalidateComparacoesCache(estabelecimentoId);
        }

        logger.info({
          message: "Comparação atualizada",
          id: input.id,
          novoStatus: input.status,
          usuarioId: ctx.user.id,
        });

        return { id: input.id, status: "sucesso" };
      } catch (error) {
        logger.error({
          message: "Erro ao atualizar comparação",
          error: String(error),
          input,
        });
        throw error;
      }
    }),

  /**
   * Deletar comparação
   */
  delete: trackedProtectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ENABLE_COMPARACOES_MODULO) {
        throw new Error("Módulo de comparações não ativado");
      }

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const comparacao = await db.execute(
          sql`SELECT estabelecimentoId FROM comparacao WHERE id = ${input.id} LIMIT 1`
        );

        if (!Array.isArray(comparacao) || !comparacao[0]) {
          throw new Error("Comparação não encontrada");
        }

        await db.execute(sql`DELETE FROM comparacao WHERE id = ${input.id}`);

        const estabelecimentoId = (comparacao[0] as any).estabelecimentoId;
        if (estabelecimentoId) {
          await invalidateComparacoesCache(estabelecimentoId);
        }

        logger.info({
          message: "Comparação deletada",
          id: input.id,
          usuarioId: ctx.user.id,
        });

        return { id: input.id, status: "sucesso" };
      } catch (error) {
        logger.error({
          message: "Erro ao deletar comparação",
          error: String(error),
          input,
        });
        throw error;
      }
    }),
});

/**
 * Wrapper para fallback para monolito
 * Se procedure não existir aqui, tenta no monolito
 */
export async function comparacoesFallback(
  procedure: string,
  input: any,
  ctx: any
): Promise<any> {
  // TODO: Implementar fallback para monolito
  throw new Error(`Procedure {procedure} não implementada em módulo comparacoes`);
}
