import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";

export const auditSystemRouter = router({
  getLogs: publicProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(20),
        userId: z.number().optional(),
        acao: z.enum(["CRIAR", "EDITAR", "EXCLUIR", "ACESSO", "SISTEMA"]).optional(),
        entidade: z.string().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [];

      if (input.userId) {
        conditions.push(eq(auditLogs.userId, input.userId));
      }
      if (input.acao) {
        conditions.push(eq(auditLogs.acao, input.acao));
      }
      if (input.entidade) {
        conditions.push(like(auditLogs.entidade, `%${input.entidade}%`));
      }
      if (input.dataInicio) {
        conditions.push(gte(auditLogs.createdAt, input.dataInicio));
      }
      if (input.dataFim) {
        conditions.push(lte(auditLogs.createdAt, input.dataFim));
      }

      const offset = (input.page - 1) * input.pageSize;
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const items = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereClause);

      return {
        items,
        total: Number(count),
      };
    }),
});
