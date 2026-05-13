import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { contratosConvenios, contratosTabelasFechadas, contratosTabelasValores } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export const contratosConveniosRouter = router({
  listar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional()
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      let query = db.select().from(contratosConvenios);
      if (input.estabelecimentoId) {
        query = query.where(eq(contratosConvenios.estabelecimentoId, input.estabelecimentoId)) as any;
      }
      
      const lista = await query.orderBy(desc(contratosConvenios.createdAt));
      return lista;
    }),

  obterBase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const contrato = await db.select().from(contratosConvenios)
        .where(eq(contratosConvenios.id, input.id))
        .limit(1);
      return contrato[0] || null;
    }),

  criar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number(),
      numeroContrato: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      diasAvisoVencimento: z.coerce.number().default(45),
      observacoes: z.string().optional(),
      emailContato: z.string().optional(),
      reajusteProposto: z.coerce.number().optional(),
      modeloEmailProposta: z.string().optional(),
      dataEnvioProposta: z.string().optional(),
      status: z.enum(["ativo", "vencendo", "vencido", "inativo", "renovado"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      await db.insert(contratosConvenios).values({
        estabelecimentoId: input.estabelecimentoId,
        convenioId: input.convenioId,
        numeroContrato: input.numeroContrato,
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        diasAvisoVencimento: input.diasAvisoVencimento,
        observacoes: input.observacoes,
        emailContato: input.emailContato,
        reajusteProposto: input.reajusteProposto?.toString() as any,
        modeloEmailProposta: input.modeloEmailProposta,
        dataEnvioProposta: input.dataEnvioProposta ? new Date(input.dataEnvioProposta) : null,
        status: input.status,
      });
      return { success: true };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      numeroContrato: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      status: z.enum(["ativo", "vencendo", "vencido", "inativo", "renovado"]).optional(),
      observacoes: z.string().optional(),
      emailContato: z.string().optional(),
      reajusteProposto: z.coerce.number().optional(),
      modeloEmailProposta: z.string().optional(),
      dataEnvioProposta: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};
      if (input.numeroContrato !== undefined) updateData.numeroContrato = input.numeroContrato;
      if (input.dataInicio !== undefined) updateData.dataInicio = input.dataInicio ? new Date(input.dataInicio) : null;
      if (input.dataFim !== undefined) updateData.dataFim = input.dataFim ? new Date(input.dataFim) : null;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
      if (input.emailContato !== undefined) updateData.emailContato = input.emailContato;
      if (input.reajusteProposto !== undefined) updateData.reajusteProposto = input.reajusteProposto?.toString() as any;
      if (input.modeloEmailProposta !== undefined) updateData.modeloEmailProposta = input.modeloEmailProposta;
      if (input.dataEnvioProposta !== undefined) updateData.dataEnvioProposta = input.dataEnvioProposta ? new Date(input.dataEnvioProposta) : null;

      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      await db.update(contratosConvenios)
        .set(updateData)
        .where(eq(contratosConvenios.id, input.id));
      
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      await db.delete(contratosConvenios).where(eq(contratosConvenios.id, input.id));
      return { success: true };
    }),
});
