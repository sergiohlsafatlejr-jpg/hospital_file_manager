import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { propostas, propostaItens, contratos, contratosHistorico } from "../../drizzle/schema";
import { eq, desc, and, sql, like } from "drizzle-orm";

export const propostasRouter = router({
  listar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      status: z.enum(["rascunho", "aguardando", "aprovada", "recusada", "negociando"]).optional(),
      busca: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, limit: 50 };
      const conditions = [];
      if (p.estabelecimentoId) conditions.push(eq(propostas.estabelecimentoId, p.estabelecimentoId));
      if (p.status) conditions.push(eq(propostas.status, p.status));
      if (p.busca) conditions.push(like(propostas.titulo, `%${p.busca}%`));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select().from(propostas).where(where).orderBy(desc(propostas.updatedAt)).limit(p.limit).offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(propostas).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),

  buscarPorId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [proposta] = await db.select().from(propostas).where(eq(propostas.id, input.id));
      if (!proposta) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada" });
      const itens = await db.select().from(propostaItens).where(eq(propostaItens.propostaId, input.id));
      return { ...proposta, itens };
    }),

  criar: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      titulo: z.string().min(1),
      cliente: z.string().min(1),
      tipoCliente: z.enum(["hospital", "clinica", "laboratorio", "plano_saude", "governo"]).optional(),
      responsavel: z.string().optional(),
      condicoesPagamento: z.string().optional(),
      validadeDias: z.number().optional(),
      dataExpiracao: z.string().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        codigo: z.string().optional(),
        descricao: z.string().min(1),
        categoria: z.string().optional(),
        unidade: z.string().optional(),
        quantidade: z.number().default(1),
        precoUnitario: z.string(),
        desconto: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Gerar número da proposta
      const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(propostas);
      const numero = `PROP-${new Date().getFullYear()}-${String((countResult.count || 0) + 1).padStart(4, "0")}`;

      // Calcular valor total
      const valorTotal = (input.itens || []).reduce((sum, item) => {
        const subtotal = item.quantidade * Number(item.precoUnitario);
        const desconto = Number(item.desconto || 0);
        return sum + subtotal * (1 - desconto / 100);
      }, 0);

      const [result] = await db.insert(propostas).values({
        estabelecimentoId: input.estabelecimentoId || null,
        numero,
        titulo: input.titulo,
        cliente: input.cliente,
        tipoCliente: input.tipoCliente || "hospital",
        responsavel: input.responsavel || null,
        status: "rascunho",
        valorTotal: String(valorTotal.toFixed(2)),
        condicoesPagamento: input.condicoesPagamento || null,
        validadeDias: input.validadeDias || 30,
        dataExpiracao: input.dataExpiracao ? new Date(input.dataExpiracao) : null,
        observacoes: input.observacoes || null,
        userId: ctx.user.id,
      });

      // Inserir itens
      if (input.itens && input.itens.length > 0) {
        await db.insert(propostaItens).values(
          input.itens.map(item => ({
            propostaId: result.insertId,
            codigo: item.codigo || null,
            descricao: item.descricao,
            categoria: item.categoria || null,
            unidade: item.unidade || "Unidade",
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            desconto: item.desconto || "0",
          }))
        );
      }

      return { id: result.insertId, numero };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().min(1),
      cliente: z.string().min(1),
      tipoCliente: z.enum(["hospital", "clinica", "laboratorio", "plano_saude", "governo"]).optional(),
      responsavel: z.string().optional(),
      condicoesPagamento: z.string().optional(),
      validadeDias: z.number().optional(),
      dataExpiracao: z.string().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        codigo: z.string().optional(),
        descricao: z.string().min(1),
        categoria: z.string().optional(),
        unidade: z.string().optional(),
        quantidade: z.number().default(1),
        precoUnitario: z.string(),
        desconto: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { id, itens, ...data } = input;

      const valorTotal = (itens || []).reduce((sum, item) => {
        const subtotal = item.quantidade * Number(item.precoUnitario);
        const desconto = Number(item.desconto || 0);
        return sum + subtotal * (1 - desconto / 100);
      }, 0);

      await db.update(propostas).set({
        titulo: data.titulo,
        cliente: data.cliente,
        tipoCliente: data.tipoCliente || "hospital",
        responsavel: data.responsavel || null,
        valorTotal: String(valorTotal.toFixed(2)),
        condicoesPagamento: data.condicoesPagamento || null,
        validadeDias: data.validadeDias || 30,
        dataExpiracao: data.dataExpiracao ? new Date(data.dataExpiracao) : null,
        observacoes: data.observacoes || null,
      }).where(eq(propostas.id, id));

      // Substituir itens
      if (itens) {
        await db.delete(propostaItens).where(eq(propostaItens.propostaId, id));
        if (itens.length > 0) {
          await db.insert(propostaItens).values(
            itens.map(item => ({
              propostaId: id,
              codigo: item.codigo || null,
              descricao: item.descricao,
              categoria: item.categoria || null,
              unidade: item.unidade || "Unidade",
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              desconto: item.desconto || "0",
            }))
          );
        }
      }

      return { success: true };
    }),

  alterarStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["rascunho", "aguardando", "aprovada", "recusada", "negociando"]) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(propostas).set({ status: input.status }).where(eq(propostas.id, input.id));
      return { success: true };
    }),

  converterEmContrato: protectedProcedure
    .input(z.object({
      propostaId: z.number(),
      estabelecimentoId: z.number().optional(),
      prazoContrato: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [proposta] = await db.select().from(propostas).where(eq(propostas.id, input.propostaId));
      if (!proposta) throw new TRPCError({ code: "NOT_FOUND" });

      // Criar contrato a partir da proposta
      const [result] = await db.insert(contratos).values({
        estabelecimentoId: input.estabelecimentoId || proposta.estabelecimentoId || null,
        contratanteNome: proposta.cliente,
        valorMensal: proposta.valorTotal,
        prazoContrato: input.prazoContrato || null,
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
        dataFim: input.dataFim ? new Date(input.dataFim) : null,
        status: "ativo",
        userId: ctx.user.id,
      });

      // Registrar no histórico do contrato
      await db.insert(contratosHistorico).values({
        contratoId: result.insertId,
        tipo: "criacao",
        descricao: `Contrato criado a partir da proposta ${proposta.numero}`,
        valorNovo: proposta.valorTotal,
        userId: ctx.user.id,
      });

      // Atualizar proposta com referência ao contrato
      await db.update(propostas).set({ status: "aprovada", contratoId: result.insertId }).where(eq(propostas.id, input.propostaId));

      return { contratoId: result.insertId };
    }),

  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(propostaItens).where(eq(propostaItens.propostaId, input.id));
    await db.delete(propostas).where(eq(propostas.id, input.id));
    return { success: true };
  }),

  dashboard: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [];
      if (input?.estabelecimentoId) conditions.push(eq(propostas.estabelecimentoId, input.estabelecimentoId));
      const where = conditions.length ? and(...conditions) : undefined;

      const todas = await db.select().from(propostas).where(where);

      const rascunhos = todas.filter(p => p.status === "rascunho");
      const aguardando = todas.filter(p => p.status === "aguardando");
      const aprovadas = todas.filter(p => p.status === "aprovada");
      const recusadas = todas.filter(p => p.status === "recusada");
      const negociando = todas.filter(p => p.status === "negociando");

      const valorTotalAprovadas = aprovadas.reduce((sum, p) => sum + Number(p.valorTotal || 0), 0);
      const valorTotalPipeline = [...aguardando, ...negociando].reduce((sum, p) => sum + Number(p.valorTotal || 0), 0);
      const taxaConversao = todas.length > 0 ? (aprovadas.length / todas.length) * 100 : 0;

      return {
        total: todas.length,
        rascunhos: rascunhos.length,
        aguardando: aguardando.length,
        aprovadas: aprovadas.length,
        recusadas: recusadas.length,
        negociando: negociando.length,
        valorTotalAprovadas,
        valorTotalPipeline,
        taxaConversao,
      };
    }),
});
