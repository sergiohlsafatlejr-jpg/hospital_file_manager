import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  finEmpresas, finClientes, finCategorias, finTiposPagamento,
  finTiposRecebivel, finBancos, finCustos, finTransacoes,
  finRecebiveis, finExtratos, finPrevisaoReceita,
} from "../../drizzle/schema";
import { eq, desc, and, sql, like, gte, lte, asc, inArray } from "drizzle-orm";

// ============================================================
// EMPRESAS
// ============================================================
const empresasRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finEmpresas).orderBy(finEmpresas.nome);
  }),
  criar: protectedProcedure
    .input(z.object({ nome: z.string().min(1), cnpj: z.string().optional(), estabelecimentoId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finEmpresas).values({ ...input, cnpj: input.cnpj || null, estabelecimentoId: input.estabelecimentoId || null, userId: ctx.user.id });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1), cnpj: z.string().optional(), estabelecimentoId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(finEmpresas).set({ nome: input.nome, cnpj: input.cnpj || null, estabelecimentoId: input.estabelecimentoId || null }).where(eq(finEmpresas.id, input.id));
      return { success: true };
    }),
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(finEmpresas).where(eq(finEmpresas.id, input.id));
      return { success: true };
    }),
});

// ============================================================
// CLIENTES
// ============================================================
const clientesRouter = router({
  listar: protectedProcedure
    .input(z.object({ empresaId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [];
      if (input?.empresaId) conditions.push(eq(finClientes.empresaId, input.empresaId));
      return db.select().from(finClientes).where(conditions.length ? and(...conditions) : undefined).orderBy(finClientes.nome);
    }),
  criar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(), nome: z.string().min(1), cnpj: z.string().optional(),
      email: z.string().optional(), telefone: z.string().optional(), valorContrato: z.string().optional(),
      cep: z.string().optional(), endereco: z.string().optional(), cidade: z.string().optional(), uf: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finClientes).values({
        empresaId: input.empresaId || null, nome: input.nome, cnpj: input.cnpj || null,
        email: input.email || null, telefone: input.telefone || null, valorContrato: input.valorContrato || null,
        cep: input.cep || null, endereco: input.endereco || null, cidade: input.cidade || null, uf: input.uf || null,
        userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), nome: z.string().min(1), cnpj: z.string().optional(),
      email: z.string().optional(), telefone: z.string().optional(), valorContrato: z.string().optional(),
      cep: z.string().optional(), endereco: z.string().optional(), cidade: z.string().optional(), uf: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finClientes).set({ ...data, empresaId: data.empresaId || null, cnpj: data.cnpj || null, email: data.email || null, telefone: data.telefone || null, valorContrato: data.valorContrato || null, cep: data.cep || null, endereco: data.endereco || null, cidade: data.cidade || null, uf: data.uf || null }).where(eq(finClientes.id, id));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finClientes).where(eq(finClientes.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// CATEGORIAS
// ============================================================
const categoriasRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finCategorias).orderBy(finCategorias.nome);
  }),
  criar: protectedProcedure.input(z.object({ nome: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [result] = await db.insert(finCategorias).values({ nome: input.nome, userId: ctx.user.id });
    return { id: result.insertId };
  }),
  atualizar: protectedProcedure.input(z.object({ id: z.number(), nome: z.string().min(1) })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(finCategorias).set({ nome: input.nome }).where(eq(finCategorias.id, input.id));
    return { success: true };
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finCategorias).where(eq(finCategorias.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// TIPOS DE PAGAMENTO
// ============================================================
const tiposPagamentoRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finTiposPagamento).orderBy(finTiposPagamento.descricao);
  }),
  criar: protectedProcedure.input(z.object({ descricao: z.string().min(1), categoriaId: z.number().optional(), custoId: z.number().optional() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [result] = await db.insert(finTiposPagamento).values({ descricao: input.descricao, categoriaId: input.categoriaId || null, custoId: input.custoId || null, userId: ctx.user.id });
    return { id: result.insertId };
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finTiposPagamento).where(eq(finTiposPagamento.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// TIPOS DE RECEBÍVEL
// ============================================================
const tiposRecebivelRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finTiposRecebivel).orderBy(finTiposRecebivel.descricao);
  }),
  criar: protectedProcedure.input(z.object({ descricao: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [result] = await db.insert(finTiposRecebivel).values({ descricao: input.descricao, userId: ctx.user.id });
    return { id: result.insertId };
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finTiposRecebivel).where(eq(finTiposRecebivel.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// BANCOS
// ============================================================
const bancosRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finBancos).orderBy(finBancos.nome);
  }),
  criar: protectedProcedure.input(z.object({ nome: z.string().min(1), cor: z.string().optional(), saldoInicial: z.string().optional() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [result] = await db.insert(finBancos).values({ nome: input.nome, cor: input.cor || "#3b82f6", saldoInicial: input.saldoInicial || "0", userId: ctx.user.id });
    return { id: result.insertId };
  }),
  atualizar: protectedProcedure.input(z.object({ id: z.number(), nome: z.string().min(1), cor: z.string().optional(), saldoInicial: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(finBancos).set({ nome: input.nome, cor: input.cor || "#3b82f6", saldoInicial: input.saldoInicial || "0" }).where(eq(finBancos.id, input.id));
    return { success: true };
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finBancos).where(eq(finBancos.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// CUSTOS
// ============================================================
const custosRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finCustos).orderBy(finCustos.descricao);
  }),
  criar: protectedProcedure.input(z.object({ descricao: z.string().min(1), valor: z.string(), tipo: z.enum(["fixo", "variavel"]), categoriaId: z.number().optional() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [result] = await db.insert(finCustos).values({ descricao: input.descricao, valor: input.valor, tipo: input.tipo, categoriaId: input.categoriaId || null, userId: ctx.user.id });
    return { id: result.insertId };
  }),
  atualizar: protectedProcedure.input(z.object({ id: z.number(), descricao: z.string().min(1), valor: z.string(), tipo: z.enum(["fixo", "variavel"]), categoriaId: z.number().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(finCustos).set({ descricao: input.descricao, valor: input.valor, tipo: input.tipo, categoriaId: input.categoriaId || null }).where(eq(finCustos.id, input.id));
    return { success: true };
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finCustos).where(eq(finCustos.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// TRANSAÇÕES (CONTAS A PAGAR)
// ============================================================
const transacoesRouter = router({
  listar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(),
      categoriaId: z.number().optional(),
      bancoId: z.number().optional(),
      pago: z.enum(["sim", "nao"]).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      busca: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, limit: 50 };
      const conditions = [];
      if (p.empresaId) conditions.push(eq(finTransacoes.empresaId, p.empresaId));
      if (p.categoriaId) conditions.push(eq(finTransacoes.categoriaId, p.categoriaId));
      if (p.bancoId) conditions.push(eq(finTransacoes.bancoId, p.bancoId));
      if (p.pago) conditions.push(eq(finTransacoes.pago, p.pago));
      if (p.dataInicio) conditions.push(gte(finTransacoes.dataVencimento, new Date(p.dataInicio)));
      if (p.dataFim) conditions.push(lte(finTransacoes.dataVencimento, new Date(p.dataFim)));
      if (p.busca) conditions.push(like(finTransacoes.descricao, `%${p.busca}%`));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select().from(finTransacoes).where(where).orderBy(desc(finTransacoes.dataVencimento)).limit(p.limit).offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(finTransacoes).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),
  criar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(), categoriaId: z.number().optional(), tipoId: z.number().optional(),
      custoId: z.number().optional(), bancoId: z.number().optional(), descricao: z.string().min(1),
      valor: z.string(), dataVencimento: z.string(), dataPagamento: z.string().optional(),
      pago: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finTransacoes).values({
        empresaId: input.empresaId || null, categoriaId: input.categoriaId || null, tipoId: input.tipoId || null,
        custoId: input.custoId || null, bancoId: input.bancoId || null, descricao: input.descricao,
        valor: input.valor, dataVencimento: new Date(input.dataVencimento), dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : null,
        pago: input.pago || "nao", observacoes: input.observacoes || null, userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), categoriaId: z.number().optional(), tipoId: z.number().optional(),
      custoId: z.number().optional(), bancoId: z.number().optional(), descricao: z.string().min(1),
      valor: z.string(), dataVencimento: z.string(), dataPagamento: z.string().optional(),
      pago: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finTransacoes).set({
        empresaId: data.empresaId || null, categoriaId: data.categoriaId || null, tipoId: data.tipoId || null,
        custoId: data.custoId || null, bancoId: data.bancoId || null, descricao: data.descricao,
        valor: data.valor, dataVencimento: new Date(data.dataVencimento), dataPagamento: data.dataPagamento ? new Date(data.dataPagamento) : null,
        pago: data.pago || "nao", observacoes: data.observacoes || null,
      }).where(eq(finTransacoes.id, id));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finTransacoes).where(eq(finTransacoes.id, input.id));
    return { success: true };
  }),
  excluirEmLote: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (input.ids.length > 0) await db.delete(finTransacoes).where(inArray(finTransacoes.id, input.ids));
    return { success: true };
  }),
  marcarPago: protectedProcedure.input(z.object({ id: z.number(), dataPagamento: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(finTransacoes).set({ pago: "sim", dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : new Date() }).where(eq(finTransacoes.id, input.id));
    return { success: true };
  }),
  dashboard: protectedProcedure
    .input(z.object({ empresaId: z.number().optional(), mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const mesRef = input?.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mesNum] = mesRef.split("-").map(Number);
      const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mesNum, 0).getDate();
      const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`;

      const conditions = [gte(finTransacoes.dataVencimento, new Date(inicio)), lte(finTransacoes.dataVencimento, new Date(fim))];
      if (input?.empresaId) conditions.push(eq(finTransacoes.empresaId, input.empresaId));

      const [totalPago] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...conditions, eq(finTransacoes.pago, "sim")));
      const [totalPendente] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...conditions, eq(finTransacoes.pago, "nao")));
      const [totalVencido] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...conditions, eq(finTransacoes.pago, "nao"), lte(finTransacoes.dataVencimento, new Date(now.toISOString().slice(0, 10)))));

      // Por categoria
      const porCategoria = await db.select({
        categoriaId: finTransacoes.categoriaId,
        total: sql<string>`SUM(valor)`,
        count: sql<number>`COUNT(*)`,
      }).from(finTransacoes).where(and(...conditions)).groupBy(finTransacoes.categoriaId);

      return {
        mesRef,
        totalPago: totalPago.total,
        totalPendente: totalPendente.total,
        totalVencido: totalVencido.total,
        porCategoria,
      };
    }),
});

// ============================================================
// RECEBÍVEIS (CONTAS A RECEBER)
// ============================================================
const recebiveisRouter = router({
  listar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(),
      clienteId: z.number().optional(),
      recebido: z.enum(["sim", "nao"]).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      busca: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, limit: 50 };
      const conditions = [];
      if (p.empresaId) conditions.push(eq(finRecebiveis.empresaId, p.empresaId));
      if (p.clienteId) conditions.push(eq(finRecebiveis.clienteId, p.clienteId));
      if (p.recebido) conditions.push(eq(finRecebiveis.recebido, p.recebido));
      if (p.dataInicio) conditions.push(gte(finRecebiveis.dataVencimento, new Date(p.dataInicio)));
      if (p.dataFim) conditions.push(lte(finRecebiveis.dataVencimento, new Date(p.dataFim)));
      if (p.busca) conditions.push(like(finRecebiveis.descricao, `%${p.busca}%`));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select().from(finRecebiveis).where(where).orderBy(desc(finRecebiveis.dataVencimento)).limit(p.limit).offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(finRecebiveis).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),
  criar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(), clienteId: z.number().optional(), tipoId: z.number().optional(),
      bancoId: z.number().optional(), descricao: z.string().min(1), valor: z.string(),
      dataVencimento: z.string(), dataRecebimento: z.string().optional(),
      recebido: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finRecebiveis).values({
        empresaId: input.empresaId || null, clienteId: input.clienteId || null, tipoId: input.tipoId || null,
        bancoId: input.bancoId || null, descricao: input.descricao, valor: input.valor,
        dataVencimento: new Date(input.dataVencimento), dataRecebimento: input.dataRecebimento ? new Date(input.dataRecebimento) : null,
        recebido: input.recebido || "nao", observacoes: input.observacoes || null, userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), clienteId: z.number().optional(), tipoId: z.number().optional(),
      bancoId: z.number().optional(), descricao: z.string().min(1), valor: z.string(),
      dataVencimento: z.string(), dataRecebimento: z.string().optional(),
      recebido: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finRecebiveis).set({
        empresaId: data.empresaId || null, clienteId: data.clienteId || null, tipoId: data.tipoId || null,
        bancoId: data.bancoId || null, descricao: data.descricao, valor: data.valor,
        dataVencimento: new Date(data.dataVencimento), dataRecebimento: data.dataRecebimento ? new Date(data.dataRecebimento) : null,
        recebido: data.recebido || "nao", observacoes: data.observacoes || null,
      }).where(eq(finRecebiveis.id, id));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finRecebiveis).where(eq(finRecebiveis.id, input.id));
    return { success: true };
  }),
  marcarRecebido: protectedProcedure.input(z.object({ id: z.number(), dataRecebimento: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(finRecebiveis).set({ recebido: "sim", dataRecebimento: input.dataRecebimento ? new Date(input.dataRecebimento) : new Date() }).where(eq(finRecebiveis.id, input.id));
    return { success: true };
  }),
  dashboard: protectedProcedure
    .input(z.object({ empresaId: z.number().optional(), mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const mesRef = input?.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mesNum] = mesRef.split("-").map(Number);
      const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mesNum, 0).getDate();
      const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`;

      const conditions = [gte(finRecebiveis.dataVencimento, new Date(inicio)), lte(finRecebiveis.dataVencimento, new Date(fim))];
      if (input?.empresaId) conditions.push(eq(finRecebiveis.empresaId, input.empresaId));

      const [totalRecebido] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...conditions, eq(finRecebiveis.recebido, "sim")));
      const [totalPendente] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...conditions, eq(finRecebiveis.recebido, "nao")));

      return { mesRef, totalRecebido: totalRecebido.total, totalPendente: totalPendente.total };
    }),
});

// ============================================================
// EXTRATOS BANCÁRIOS
// ============================================================
const extratosRouter = router({
  listar: protectedProcedure
    .input(z.object({
      bancoId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      conciliado: z.enum(["sim", "nao"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(100),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, limit: 100 };
      const conditions = [];
      if (p.bancoId) conditions.push(eq(finExtratos.bancoId, p.bancoId));
      if (p.dataInicio) conditions.push(gte(finExtratos.data, new Date(p.dataInicio)));
      if (p.dataFim) conditions.push(lte(finExtratos.data, new Date(p.dataFim)));
      if (p.conciliado) conditions.push(eq(finExtratos.conciliado, p.conciliado));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select().from(finExtratos).where(where).orderBy(desc(finExtratos.data)).limit(p.limit).offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(finExtratos).where(where),
      ]);
      return { items, total: countResult.count };
    }),
  criar: protectedProcedure
    .input(z.object({ bancoId: z.number(), data: z.string(), descricao: z.string().min(1), valor: z.string(), tipo: z.enum(["credito", "debito"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finExtratos).values({ bancoId: input.bancoId, data: new Date(input.data), descricao: input.descricao, valor: input.valor, tipo: input.tipo, conciliado: "nao", userId: ctx.user.id });
      return { id: result.insertId };
    }),
  criarEmLote: protectedProcedure
    .input(z.object({ itens: z.array(z.object({ bancoId: z.number(), data: z.string(), descricao: z.string(), valor: z.string(), tipo: z.enum(["credito", "debito"]) })) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      if (input.itens.length === 0) return { count: 0 };
      const values = input.itens.map(item => ({ bancoId: item.bancoId, data: new Date(item.data), descricao: item.descricao, valor: item.valor, tipo: item.tipo, conciliado: "nao" as const, userId: ctx.user.id }));
      await db.insert(finExtratos).values(values);
      return { count: input.itens.length };
    }),
  conciliar: protectedProcedure
    .input(z.object({ id: z.number(), transacaoId: z.number().optional(), recebivelId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(finExtratos).set({ conciliado: "sim", transacaoId: input.transacaoId || null, recebivelId: input.recebivelId || null }).where(eq(finExtratos.id, input.id));
      // Marcar transação/recebível como pago/recebido
      if (input.transacaoId) await db.update(finTransacoes).set({ pago: "sim" }).where(eq(finTransacoes.id, input.transacaoId));
      if (input.recebivelId) await db.update(finRecebiveis).set({ recebido: "sim" }).where(eq(finRecebiveis.id, input.recebivelId));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finExtratos).where(eq(finExtratos.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// PREVISÃO DE RECEITA
// ============================================================
const previsaoRouter = router({
  listar: protectedProcedure
    .input(z.object({ empresaId: z.number().optional(), mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [];
      if (input?.empresaId) conditions.push(eq(finPrevisaoReceita.empresaId, input.empresaId));
      if (input?.mes) {
        const [ano, mesNum] = input.mes.split("-").map(Number);
        conditions.push(gte(finPrevisaoReceita.dataPrevisao, new Date(`${ano}-${String(mesNum).padStart(2, "0")}-01`)));
        const lastDay = new Date(ano, mesNum, 0).getDate();
        conditions.push(lte(finPrevisaoReceita.dataPrevisao, new Date(`${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`)));
      }
      return db.select().from(finPrevisaoReceita).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(finPrevisaoReceita.dataPrevisao));
    }),
  criar: protectedProcedure
    .input(z.object({ empresaId: z.number().optional(), dataPrevisao: z.string(), valorPrevisto: z.string(), valorRealizado: z.string().optional(), descricao: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finPrevisaoReceita).values({
        empresaId: input.empresaId || null, dataPrevisao: new Date(input.dataPrevisao),
        valorPrevisto: input.valorPrevisto, valorRealizado: input.valorRealizado || null,
        descricao: input.descricao || null, userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({ id: z.number(), valorPrevisto: z.string().optional(), valorRealizado: z.string().optional(), descricao: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      const updates: any = {};
      if (data.valorPrevisto !== undefined) updates.valorPrevisto = data.valorPrevisto;
      if (data.valorRealizado !== undefined) updates.valorRealizado = data.valorRealizado;
      if (data.descricao !== undefined) updates.descricao = data.descricao;
      await db.update(finPrevisaoReceita).set(updates).where(eq(finPrevisaoReceita.id, id));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finPrevisaoReceita).where(eq(finPrevisaoReceita.id, input.id));
    return { success: true };
  }),
});

// ============================================================
// DASHBOARD FINANCEIRO CONSOLIDADO
// ============================================================
const dashboardRouter = router({
  resumo: protectedProcedure
    .input(z.object({ empresaId: z.number().optional(), mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const mesRef = input?.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mesNum] = mesRef.split("-").map(Number);
      const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mesNum, 0).getDate();
      const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`;
      const hoje = now.toISOString().slice(0, 10);

      const condPagar = [gte(finTransacoes.dataVencimento, new Date(inicio)), lte(finTransacoes.dataVencimento, new Date(fim))];
      const condReceber = [gte(finRecebiveis.dataVencimento, new Date(inicio)), lte(finRecebiveis.dataVencimento, new Date(fim))];
      if (input?.empresaId) {
        condPagar.push(eq(finTransacoes.empresaId, input.empresaId));
        condReceber.push(eq(finRecebiveis.empresaId, input.empresaId));
      }

      const [[despPago], [despPendente], [despVencido], [recRecebido], [recPendente]] = await Promise.all([
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "sim"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "nao"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "nao"), lte(finTransacoes.dataVencimento, new Date(hoje)))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...condReceber, eq(finRecebiveis.recebido, "sim"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...condReceber, eq(finRecebiveis.recebido, "nao"))),
      ]);

      // Evolução últimos 6 meses
      const evolucao = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(ano, mesNum - 1 - i, 1);
        const mIni = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const mLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const mFim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${mLastDay}`;
        const mLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const cP = [gte(finTransacoes.dataVencimento, new Date(mIni)), lte(finTransacoes.dataVencimento, new Date(mFim))];
        const cR = [gte(finRecebiveis.dataVencimento, new Date(mIni)), lte(finRecebiveis.dataVencimento, new Date(mFim))];
        if (input?.empresaId) { cP.push(eq(finTransacoes.empresaId, input.empresaId)); cR.push(eq(finRecebiveis.empresaId, input.empresaId)); }

        const [[desp], [rec]] = await Promise.all([
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...cP)),
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...cR)),
        ]);
        evolucao.push({ mes: mLabel, despesas: Number(desp.total), receitas: Number(rec.total) });
      }

      return {
        mesRef,
        despesasPago: despPago.total,
        despesasPendente: despPendente.total,
        despesasVencido: despVencido.total,
        receitasRecebido: recRecebido.total,
        receitasPendente: recPendente.total,
        evolucao,
      };
    }),
});

// ============================================================
// EXPORT ROUTER
// ============================================================
export const financeiroRouter = router({
  empresas: empresasRouter,
  clientes: clientesRouter,
  categorias: categoriasRouter,
  tiposPagamento: tiposPagamentoRouter,
  tiposRecebivel: tiposRecebivelRouter,
  bancos: bancosRouter,
  custos: custosRouter,
  transacoes: transacoesRouter,
  recebiveis: recebiveisRouter,
  extratos: extratosRouter,
  previsao: previsaoRouter,
  dashboard: dashboardRouter,
});
