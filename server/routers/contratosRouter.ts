import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { contratos, contratosHistorico } from "../../drizzle/schema";
import { eq, desc, and, sql, like, gte, lte } from "drizzle-orm";

export const contratosRouter = router({
  listar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      status: z.enum(["rascunho", "ativo", "suspenso", "encerrado", "renovacao"]).optional(),
      busca: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, limit: 50 };
      const conditions = [];
      if (p.estabelecimentoId) conditions.push(eq(contratos.estabelecimentoId, p.estabelecimentoId));
      if (p.status) conditions.push(eq(contratos.status, p.status));
      if (p.busca) conditions.push(like(contratos.contratanteNome, `%${p.busca}%`));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select().from(contratos).where(where).orderBy(desc(contratos.updatedAt)).limit(p.limit).offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(contratos).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),

  buscarPorId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [contrato] = await db.select().from(contratos).where(eq(contratos.id, input.id));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      // Buscar histórico
      const historico = await db.select().from(contratosHistorico).where(eq(contratosHistorico.contratoId, input.id)).orderBy(desc(contratosHistorico.createdAt));
      return { ...contrato, historico };
    }),

  criar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      contratanteNome: z.string().min(1),
      contratanteCnpj: z.string().optional(),
      contratadaNome: z.string().optional(),
      contratadaCnpj: z.string().optional(),
      servicos: z.any().optional(),
      modelosCobranca: z.any().optional(),
      valorMensal: z.string().optional(),
      valorHora: z.string().optional(),
      valorPercentualConvenio: z.string().optional(),
      prazoContrato: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      status: z.enum(["rascunho", "ativo", "suspenso", "encerrado", "renovacao"]).optional(),
      dadosCompletos: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(contratos).values({
        estabelecimentoId: input.estabelecimentoId || null,
        contratanteNome: input.contratanteNome,
        contratanteCnpj: input.contratanteCnpj || null,
        contratadaNome: input.contratadaNome || null,
        contratadaCnpj: input.contratadaCnpj || null,
        servicos: input.servicos || null,
        modelosCobranca: input.modelosCobranca || null,
        valorMensal: input.valorMensal || null,
        valorHora: input.valorHora || null,
        valorPercentualConvenio: input.valorPercentualConvenio || null,
        prazoContrato: input.prazoContrato || null,
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        status: input.status || "rascunho",
        dadosCompletos: input.dadosCompletos || null,
        userId: ctx.user.id,
      });
      // Registrar no histórico
      await db.insert(contratosHistorico).values({
        contratoId: result.insertId,
        tipo: "criacao",
        descricao: `Contrato criado com ${input.contratanteNome}`,
        valorNovo: input.valorMensal || null,
        userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      contratanteNome: z.string().min(1),
      contratanteCnpj: z.string().optional(),
      contratadaNome: z.string().optional(),
      contratadaCnpj: z.string().optional(),
      servicos: z.any().optional(),
      modelosCobranca: z.any().optional(),
      valorMensal: z.string().optional(),
      valorHora: z.string().optional(),
      valorPercentualConvenio: z.string().optional(),
      prazoContrato: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      status: z.enum(["rascunho", "ativo", "suspenso", "encerrado", "renovacao"]).optional(),
      dadosCompletos: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      // Buscar contrato atual para histórico
      const [atual] = await db.select().from(contratos).where(eq(contratos.id, id));
      await db.update(contratos).set({
        contratanteNome: data.contratanteNome,
        contratanteCnpj: data.contratanteCnpj || null,
        contratadaNome: data.contratadaNome || null,
        contratadaCnpj: data.contratadaCnpj || null,
        servicos: data.servicos || null,
        modelosCobranca: data.modelosCobranca || null,
        valorMensal: data.valorMensal || null,
        valorHora: data.valorHora || null,
        valorPercentualConvenio: data.valorPercentualConvenio || null,
        prazoContrato: data.prazoContrato || null,
        dataInicio: data.dataInicio ? new Date(data.dataInicio) : null,
        dataFim: data.dataFim ? new Date(data.dataFim) : null,
        status: data.status || "rascunho",
        dadosCompletos: data.dadosCompletos || null,
      }).where(eq(contratos.id, id));
      // Registrar alteração no histórico
      await db.insert(contratosHistorico).values({
        contratoId: id,
        tipo: "alteracao",
        descricao: "Contrato atualizado",
        valorAnterior: atual?.valorMensal || null,
        valorNovo: data.valorMensal || null,
        userId: ctx.user.id,
      });
      return { success: true };
    }),

  alterarStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["rascunho", "ativo", "suspenso", "encerrado", "renovacao"]), descricao: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(contratos).set({ status: input.status }).where(eq(contratos.id, input.id));
      const tipoMap: Record<string, "suspensao" | "encerramento" | "renovacao" | "alteracao"> = {
        suspenso: "suspensao", encerrado: "encerramento", renovacao: "renovacao",
      };
      await db.insert(contratosHistorico).values({
        contratoId: input.id,
        tipo: tipoMap[input.status] || "alteracao",
        descricao: input.descricao || `Status alterado para ${input.status}`,
        userId: ctx.user.id,
      });
      return { success: true };
    }),

  reajustar: protectedProcedure
    .input(z.object({
      id: z.number(), indiceReajuste: z.string(), percentualReajuste: z.string(),
      novoValorMensal: z.string(), descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [atual] = await db.select().from(contratos).where(eq(contratos.id, input.id));
      if (!atual) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(contratos).set({ valorMensal: input.novoValorMensal }).where(eq(contratos.id, input.id));
      await db.insert(contratosHistorico).values({
        contratoId: input.id,
        tipo: "reajuste",
        descricao: input.descricao || `Reajuste por ${input.indiceReajuste} (${input.percentualReajuste}%)`,
        valorAnterior: atual.valorMensal,
        valorNovo: input.novoValorMensal,
        indiceReajuste: input.indiceReajuste,
        percentualReajuste: input.percentualReajuste,
        userId: ctx.user.id,
      });
      return { success: true };
    }),

  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(contratosHistorico).where(eq(contratosHistorico.contratoId, input.id));
    await db.delete(contratos).where(eq(contratos.id, input.id));
    return { success: true };
  }),

  dashboard: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [];
      if (input?.estabelecimentoId) conditions.push(eq(contratos.estabelecimentoId, input.estabelecimentoId));
      const where = conditions.length ? and(...conditions) : undefined;

      const todos = await db.select().from(contratos).where(where);
      const hoje = new Date().toISOString().slice(0, 10);
      const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const ativos = todos.filter(c => c.status === "ativo");
      const vencendoEm30 = ativos.filter(c => c.dataFim && c.dataFim <= new Date(em30dias) && c.dataFim >= new Date(hoje));
      const vencidos = ativos.filter(c => c.dataFim && c.dataFim < new Date(hoje));
      const valorTotalMensal = ativos.reduce((sum, c) => sum + Number(c.valorMensal || 0), 0);

      return {
        total: todos.length,
        ativos: ativos.length,
        rascunhos: todos.filter(c => c.status === "rascunho").length,
        suspensos: todos.filter(c => c.status === "suspenso").length,
        encerrados: todos.filter(c => c.status === "encerrado").length,
        vencendoEm30: vencendoEm30.length,
        vencidos: vencidos.length,
        valorTotalMensal,
        alertas: [...vencendoEm30.map(c => ({ tipo: "vencendo" as const, contrato: c })), ...vencidos.map(c => ({ tipo: "vencido" as const, contrato: c }))],
      };
    }),
});
