import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { consultarSaldo, consultarExtrato, consultarExtratoCompleto, exportarExtratoPdf, getInterStatus, emitirBoleto, consultarBoleto, listarBoletos, downloadBoletoPdf, cancelarBoleto, sumarioBoletos } from "../bancoInter";
import {
  finEmpresas, finClientes, finCategorias, finTiposPagamento,
  finTiposRecebivel, finBancos, finCustos, finTransacoes,
  finRecebiveis, finExtratos, finPrevisaoReceita, finCentrosCusto,
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
      cep: z.string().optional(), endereco: z.string().optional(), numero: z.string().optional(),
      complemento: z.string().optional(), bairro: z.string().optional(),
      cidade: z.string().optional(), uf: z.string().optional(), cnpjSafatle: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finClientes).values({
        empresaId: input.empresaId || null, nome: input.nome, cnpj: input.cnpj || null,
        email: input.email || null, telefone: input.telefone || null, valorContrato: input.valorContrato || null,
        cep: input.cep || null, endereco: input.endereco || null, numero: input.numero || null,
        complemento: input.complemento || null, bairro: input.bairro || null,
        cidade: input.cidade || null, uf: input.uf || null,
        cnpjSafatle: input.cnpjSafatle || "24.785.393/0001-54",
        userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), nome: z.string().min(1), cnpj: z.string().optional(),
      email: z.string().optional(), telefone: z.string().optional(), valorContrato: z.string().optional(),
      cep: z.string().optional(), endereco: z.string().optional(), numero: z.string().optional(),
      complemento: z.string().optional(), bairro: z.string().optional(),
      cidade: z.string().optional(), uf: z.string().optional(), cnpjSafatle: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finClientes).set({
        ...data, empresaId: data.empresaId || null, cnpj: data.cnpj || null,
        email: data.email || null, telefone: data.telefone || null, valorContrato: data.valorContrato || null,
        cep: data.cep || null, endereco: data.endereco || null, numero: data.numero || null,
        complemento: data.complemento || null, bairro: data.bairro || null,
        cidade: data.cidade || null, uf: data.uf || null,
        cnpjSafatle: data.cnpjSafatle || "24.785.393/0001-54",
      }).where(eq(finClientes.id, id));
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
      centroCustoId: z.number().optional(),
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
      if (p.centroCustoId) conditions.push(eq(finTransacoes.centroCustoId, p.centroCustoId));
      if (p.pago) conditions.push(eq(finTransacoes.pago, p.pago));
      if (p.dataInicio) conditions.push(gte(finTransacoes.dataVencimento, new Date(p.dataInicio)));
      if (p.dataFim) conditions.push(lte(finTransacoes.dataVencimento, new Date(p.dataFim)));
      if (p.busca) conditions.push(like(finTransacoes.descricao, `%${p.busca}%`));

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select({
          id: finTransacoes.id,
          descricao: finTransacoes.descricao,
          valor: finTransacoes.valor,
          dataVencimento: finTransacoes.dataVencimento,
          dataPagamento: finTransacoes.dataPagamento,
          pago: finTransacoes.pago,
          observacoes: finTransacoes.observacoes,
          empresaId: finTransacoes.empresaId,
          categoriaId: finTransacoes.categoriaId,
          bancoId: finTransacoes.bancoId,
          centroCustoId: finTransacoes.centroCustoId,
          tipoId: finTransacoes.tipoId,
          custoId: finTransacoes.custoId,
          userId: finTransacoes.userId,
          categoriaNome: finCategorias.nome,
          centroCustoNome: finCentrosCusto.nome,
        })
          .from(finTransacoes)
          .leftJoin(finCategorias, eq(finTransacoes.categoriaId, finCategorias.id))
          .leftJoin(finCentrosCusto, eq(finTransacoes.centroCustoId, finCentrosCusto.id))
          .where(where)
          .orderBy(desc(finTransacoes.dataVencimento))
          .limit(p.limit)
          .offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(finTransacoes).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),
  criar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(), categoriaId: z.number().optional(), tipoId: z.number().optional(),
      custoId: z.number().optional(), bancoId: z.number().optional(), centroCustoId: z.number().optional(),
      descricao: z.string().min(1),
      valor: z.string(), dataVencimento: z.string(), dataPagamento: z.string().optional(),
      pago: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finTransacoes).values({
        empresaId: input.empresaId || null, categoriaId: input.categoriaId || null, tipoId: input.tipoId || null,
        custoId: input.custoId || null, bancoId: input.bancoId || null, centroCustoId: input.centroCustoId || null, descricao: input.descricao,
        valor: input.valor, dataVencimento: new Date(input.dataVencimento), dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : null,
        pago: input.pago || "nao", observacoes: input.observacoes || null, userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), categoriaId: z.number().optional(), tipoId: z.number().optional(),
      custoId: z.number().optional(), bancoId: z.number().optional(), centroCustoId: z.number().optional(),
      descricao: z.string().min(1),
      valor: z.string(), dataVencimento: z.string(), dataPagamento: z.string().optional(),
      pago: z.enum(["sim", "nao"]).optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finTransacoes).set({
        empresaId: data.empresaId || null, categoriaId: data.categoriaId || null, tipoId: data.tipoId || null,
        custoId: data.custoId || null, bancoId: data.bancoId || null, centroCustoId: data.centroCustoId || null, descricao: data.descricao,
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
  duplicar: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [original] = await db.select().from(finTransacoes).where(eq(finTransacoes.id, input.id)).limit(1);
    if (!original) throw new Error("Registro não encontrado");
    const [result] = await db.insert(finTransacoes).values({
      empresaId: original.empresaId, categoriaId: original.categoriaId, tipoId: original.tipoId,
      custoId: original.custoId, bancoId: original.bancoId, centroCustoId: original.centroCustoId,
      descricao: `${original.descricao} (cópia)`, valor: original.valor,
      dataVencimento: original.dataVencimento, dataPagamento: null,
      pago: "nao", observacoes: original.observacoes, userId: ctx.user.id,
    });
    return { id: result.insertId };
  }),
  duplicarEmLote: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const originais = await db.select().from(finTransacoes).where(inArray(finTransacoes.id, input.ids));
    if (originais.length === 0) throw new Error("Nenhum registro encontrado");
    for (const original of originais) {
      await db.insert(finTransacoes).values({
        empresaId: original.empresaId, categoriaId: original.categoriaId, tipoId: original.tipoId,
        custoId: original.custoId, bancoId: original.bancoId, centroCustoId: original.centroCustoId,
        descricao: `${original.descricao} (cópia)`, valor: original.valor,
        dataVencimento: original.dataVencimento, dataPagamento: null,
        pago: "nao", observacoes: original.observacoes, userId: ctx.user.id,
      });
    }
    return { count: originais.length };
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
      tipoServico: z.string().optional(),
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
      if (p.tipoServico) conditions.push(eq(finRecebiveis.tipoServico, p.tipoServico));
      if (p.dataInicio) conditions.push(gte(finRecebiveis.dataVencimento, new Date(p.dataInicio)));
      if (p.dataFim) conditions.push(lte(finRecebiveis.dataVencimento, new Date(p.dataFim)));
      if (p.busca) {
        conditions.push(
          sql`(${finRecebiveis.descricao} LIKE ${`%${p.busca}%`} OR ${finRecebiveis.tipoServico} LIKE ${`%${p.busca}%`} OR ${finRecebiveis.descricaoServico} LIKE ${`%${p.busca}%`})`
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const [items, [countResult]] = await Promise.all([
        db.select({
          id: finRecebiveis.id,
          empresaId: finRecebiveis.empresaId,
          clienteId: finRecebiveis.clienteId,
          tipoId: finRecebiveis.tipoId,
          bancoId: finRecebiveis.bancoId,
          descricao: finRecebiveis.descricao,
          valor: finRecebiveis.valor,
          dataVencimento: finRecebiveis.dataVencimento,
          dataRecebimento: finRecebiveis.dataRecebimento,
          recebido: finRecebiveis.recebido,
          tipoServico: finRecebiveis.tipoServico,
          descricaoServico: finRecebiveis.descricaoServico,
          observacoes: finRecebiveis.observacoes,
          userId: finRecebiveis.userId,
          createdAt: finRecebiveis.createdAt,
          updatedAt: finRecebiveis.updatedAt,
          clienteNome: finClientes.nome,
        })
          .from(finRecebiveis)
          .leftJoin(finClientes, eq(finRecebiveis.clienteId, finClientes.id))
          .where(where)
          .orderBy(desc(finRecebiveis.dataVencimento))
          .limit(p.limit)
          .offset((p.page - 1) * p.limit),
        db.select({ count: sql<number>`count(*)` }).from(finRecebiveis).where(where),
      ]);
      return { items, total: countResult.count, page: p.page, limit: p.limit };
    }),
  tiposServicoDistintos: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const result = await db.selectDistinct({ tipoServico: finRecebiveis.tipoServico }).from(finRecebiveis).where(sql`${finRecebiveis.tipoServico} IS NOT NULL AND ${finRecebiveis.tipoServico} != ''`).orderBy(finRecebiveis.tipoServico);
    return result.map(r => r.tipoServico).filter(Boolean) as string[];
  }),
  criar: protectedProcedure
    .input(z.object({
      empresaId: z.number().optional(), clienteId: z.number().optional(), tipoId: z.number().optional(),
      bancoId: z.number().optional(), descricao: z.string().min(1), valor: z.string(),
      dataVencimento: z.string(), dataRecebimento: z.string().optional(),
      recebido: z.enum(["sim", "nao"]).optional(),
      tipoServico: z.string().optional(), descricaoServico: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finRecebiveis).values({
        empresaId: input.empresaId || null, clienteId: input.clienteId || null, tipoId: input.tipoId || null,
        bancoId: input.bancoId || null, descricao: input.descricao, valor: input.valor,
        dataVencimento: new Date(input.dataVencimento), dataRecebimento: input.dataRecebimento ? new Date(input.dataRecebimento) : null,
        recebido: input.recebido || "nao", tipoServico: input.tipoServico || null, descricaoServico: input.descricaoServico || null,
        observacoes: input.observacoes || null, userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(), empresaId: z.number().optional(), clienteId: z.number().optional(), tipoId: z.number().optional(),
      bancoId: z.number().optional(), descricao: z.string().min(1), valor: z.string(),
      dataVencimento: z.string(), dataRecebimento: z.string().optional(),
      recebido: z.enum(["sim", "nao"]).optional(),
      tipoServico: z.string().optional(), descricaoServico: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finRecebiveis).set({
        empresaId: data.empresaId || null, clienteId: data.clienteId || null, tipoId: data.tipoId || null,
        bancoId: data.bancoId || null, descricao: data.descricao, valor: data.valor,
        dataVencimento: new Date(data.dataVencimento), dataRecebimento: data.dataRecebimento ? new Date(data.dataRecebimento) : null,
        recebido: data.recebido || "nao", tipoServico: data.tipoServico || null, descricaoServico: data.descricaoServico || null,
        observacoes: data.observacoes || null,
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
  duplicar: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const [original] = await db.select().from(finRecebiveis).where(eq(finRecebiveis.id, input.id)).limit(1);
    if (!original) throw new Error("Registro não encontrado");
    const [result] = await db.insert(finRecebiveis).values({
      empresaId: original.empresaId, clienteId: original.clienteId, tipoId: original.tipoId,
      bancoId: original.bancoId, descricao: `${original.descricao} (cópia)`, valor: original.valor,
      dataVencimento: original.dataVencimento, dataRecebimento: null,
      recebido: "nao", tipoServico: original.tipoServico, descricaoServico: original.descricaoServico,
      observacoes: original.observacoes, userId: ctx.user.id,
    });
    return { id: result.insertId };
  }),
  duplicarEmLote: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    const originais = await db.select().from(finRecebiveis).where(inArray(finRecebiveis.id, input.ids));
    if (originais.length === 0) throw new Error("Nenhum registro encontrado");
    for (const original of originais) {
      await db.insert(finRecebiveis).values({
        empresaId: original.empresaId, clienteId: original.clienteId, tipoId: original.tipoId,
        bancoId: original.bancoId, descricao: `${original.descricao} (cópia)`, valor: original.valor,
        dataVencimento: original.dataVencimento, dataRecebimento: null,
        recebido: "nao", tipoServico: original.tipoServico, descricaoServico: original.descricaoServico,
        observacoes: original.observacoes, userId: ctx.user.id,
      });
    }
    return { count: originais.length };
  }),
  excluirEmLote: protectedProcedure.input(z.object({ ids: z.array(z.number()) })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (input.ids.length > 0) await db.delete(finRecebiveis).where(inArray(finRecebiveis.id, input.ids));
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
  importarSaudeCaixaPdf: protectedProcedure
    .input(z.object({
      base64File: z.string()
    }))
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.base64File, "base64");
        const data = await pdfParse(buffer);
        const lines = data.text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        
        // Helper: parse a Brazilian number string ("1.234,56" -> 1234.56)
        const parseBR = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

        // Helper: detect if a string is a "Grau de Participação" (small integer like "12", "00")
        const isGrauParticipacao = (s: string) => /^\d{1,2}$/.test(s);

        // Helper: detect if a string looks like a procedure code
        const isProcedureCode = (s: string) => /^(\d\.\d{2}\.\d{2}\.\d{3}|\d{10,})$/.test(s);

        // Helper: detect if string is a date dd/mm/yyyy
        const isDate = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);

        // Helper: detect if string is a time hh:mm
        const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s);

        // Helper: detect if string is a CNPJ pattern
        const isCNPJ = (s: string) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(s);

        // Helper: detect if string looks like a long number (carteirinha)
        const isCarteirinha = (s: string) => /^\d{13,}$/.test(s);

        // ============================================================
        // PASS 1: Extract guia headers
        // Pattern: After "2338130" (CNES) or after page header, look for:
        //   [lote] [protocolo] [dataProtocolo] [statusProtocolo]
        //   [guiaPrestador] [guiaOperadora] [senha]
        //   [nomePaciente] [carteirinha]
        //   [dataInicio] [horaInicio] [dataFim] [horaFim] [statusGuia]
        // ============================================================
        interface GuiaHeader {
          lineIndex: number;
          lote: string;
          protocolo: string;
          guiaPrestador: string;
          guiaOperadora: string;
          senha: string;
          pacienteNome: string;
          carteirinha: string;
          dataInicio: string;
          dataFim: string;
        }

        const guiaHeaders: GuiaHeader[] = [];

        for (let i = 0; i < lines.length - 10; i++) {
          // Look for CNES "2338130" followed by lote/protocolo pattern
          // The CNES appears after prestador name at fixed positions in header
          // After CNES: [lote] [protocolo] [dataProtocolo] [statusCode]
          // Then:       [guiaPrestador] [guiaOperadora] [senha]
          // Then:       [pacienteNome] [carteirinha]
          // Then:       [dataInicio] [horaInicio] [dataFim] [horaFim] [statusGuia]

          // Detect guia section: look for a sequence that matches the pattern
          // Heuristic: a line that's a long number (lote, ~9+ digits), followed by
          // another number (protocolo), followed by a date, followed by a status code
          if (/^\d{6,}$/.test(lines[i]) && // lote (e.g. 130093155)
              /^\d{5,}$/.test(lines[i+1]) && // protocolo (e.g. 7214460)
              isDate(lines[i+2]) && // data protocolo
              /^\d{1}$/.test(lines[i+3]) && // status protocolo (e.g. "6")
              /^\d{5,}$/.test(lines[i+4]) // guia prestador
          ) {
            const lote = lines[i];
            const protocolo = lines[i+1];
            // i+2 = data protocolo, i+3 = status
            const guiaPrestador = lines[i+4];
            const guiaOperadora = lines[i+5] || "";
            const senha = lines[i+6] || "";

            // Next should be paciente nome and carteirinha
            const pacienteNome = lines[i+7] || "";
            const carteirinha = lines[i+8] || "";

            // Dates
            let dataInicio = "";
            let dataFim = "";
            if (isDate(lines[i+9])) {
              dataInicio = lines[i+9];
              // i+10 = hora inicio
              if (isDate(lines[i+11])) {
                dataFim = lines[i+11];
              }
            }

            guiaHeaders.push({
              lineIndex: i,
              lote,
              protocolo,
              guiaPrestador,
              guiaOperadora,
              senha,
              pacienteNome: isCarteirinha(pacienteNome) ? "" : pacienteNome, // safety: don't use numbers as names
              carteirinha: isCarteirinha(carteirinha) ? carteirinha : (isCarteirinha(pacienteNome) ? pacienteNome : ""),
              dataInicio,
              dataFim,
            });
          }
        }

        // ============================================================
        // PASS 2: Extract procedure items and link to nearest guia
        // ============================================================
        const extracted = [];
        let numId = 1;

        // Find the guia header that applies to a given line index
        const findGuia = (lineIdx: number): GuiaHeader | null => {
          let best: GuiaHeader | null = null;
          for (const g of guiaHeaders) {
            if (g.lineIndex < lineIdx) {
              if (!best || g.lineIndex > best.lineIndex) best = g;
            }
          }
          return best;
        };

        for (let i = 0; i < lines.length; i++) {
          // Each item block starts with a date line (dd/mm/yyyy)
          if (!isDate(lines[i])) continue;

          // lines[i+1] = Tabela (e.g. "22", "18", "19", "20")
          // lines[i+2] = Código do procedimento
          const tabelaLine = lines[i + 1];
          const codeLine = lines[i + 2];
          if (!tabelaLine || !/^\d{1,2}$/.test(tabelaLine)) continue;
          if (!codeLine || !isProcedureCode(codeLine)) continue;

          const date = lines[i];
          const descricao = lines[i + 3] || "";

          // After description, there may or may not be a "Grau de Participação"
          const field4 = lines[i + 4] || "";
          let offset: number;

          if (isGrauParticipacao(field4) && !field4.includes(",") && lines[i + 5]?.includes(",")) {
            offset = i + 5;
          } else {
            offset = i + 4;
          }

          const valorInfStr = lines[offset] || "0";
          const qtyStr = lines[offset + 1] || "0";
          const valorProcStr = lines[offset + 2] || "0";
          const valorLibStr = lines[offset + 3] || "0";

          const isNegative = valorInfStr.startsWith("-");
          const valorInformado = parseBR(valorInfStr);
          const quantidade = parseBR(qtyStr);
          const valorProcessado = parseBR(valorProcStr);
          const valorLiberado = parseBR(valorLibStr);

          // Detect glosa
          let valorGlosa = 0;
          let motivoGlosa = "";

          if (isNegative) {
            valorGlosa = Math.abs(valorProcessado);
            const glosaCodeField = lines[offset + 4] || "";
            if (/^\d+$/.test(glosaCodeField)) motivoGlosa = glosaCodeField;
          } else {
            if (valorProcessado > valorLiberado && valorLiberado >= 0) {
              valorGlosa = valorProcessado - valorLiberado;
              const possibleGlosaVal = lines[offset + 4] || "";
              const possibleGlosaCode = lines[offset + 5] || "";
              if (possibleGlosaVal.includes(",") && parseBR(possibleGlosaVal) < 0) {
                motivoGlosa = possibleGlosaCode;
              } else if (/^\d{3,4}$/.test(possibleGlosaCode)) {
                motivoGlosa = possibleGlosaCode;
              }
            }
          }

          // Link to guia header
          const guia = findGuia(i);

          extracted.push({
            id: numId++,
            dataFaturamento: date,
            codigo: codeLine,
            descricao,
            quantidade: String(Math.abs(quantidade)),
            valorApresentado: Math.abs(valorProcessado),
            valorPago: Math.abs(valorLiberado),
            valorGlosa: Math.abs(valorGlosa),
            motivoGlosa,
            isGlosa: isNegative || valorGlosa > 0,
            isNegativeBlock: isNegative,
            // Guia metadata
            guiaPrestador: guia?.guiaPrestador || null,
            guiaOperadora: guia?.guiaOperadora || null,
            protocolo: guia?.protocolo || null,
            lote: guia?.lote || null,
            pacienteNome: guia?.pacienteNome || null,
            carteirinha: guia?.carteirinha || null,
            senha: guia?.senha || null,
          });
        }
        
        return { success: true, items: extracted };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao processar PDF: " + err.message });
      }
    }),
  salvarSaudeCaixaNoDemonstrativo: protectedProcedure
    .input(z.object({
      itens: z.array(z.any()),
      arquivoId: z.number().optional(), 
      convenioId: z.number().optional(),
      dataReferencia: z.string().optional(),
      dataPagamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { arquivos, demonstrativo } = await import("../../drizzle/schema");

      let arquivoId = input.arquivoId;

      if (!arquivoId) {
        const [arquivoResult] = await db.insert(arquivos).values({
          nome: "Demonstrativo_Saude_Caixa_PDF.pdf",
          tipoArquivo: 'pdf',
          direcao: 'retornado',
          convenioId: input.convenioId || null,
          estabelecimentoId: ctx.user.estabelecimentoId || 1,
          userId: ctx.user.id,
          s3Key: "nao_se_aplica",
          s3Url: "nao_se_aplica",
          tamanho: 0,
          status: 'processado',
          totalItens: input.itens.length,
          itensProcessados: input.itens.length,
          dataReferencia: input.dataReferencia ? new Date(input.dataReferencia) : null,
          dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : null,
        });
        arquivoId = arquivoResult.insertId;
      }

      // Parse dates from input
      const dataRefGlobal = input.dataReferencia ? new Date(input.dataReferencia) : null;
      const dataPagGlobal = input.dataPagamento ? new Date(input.dataPagamento) : null;

      // Convert from PDF output to demonstrativo
      const recordsToInsert = input.itens.map(item => ({
        arquivoId: arquivoId!,
        origemTipo: 'excel' as const, // Pretend it's excel since table doesn't have PDF enum
        convenioId: input.convenioId || null,
        estabelecimentoId: ctx.user.estabelecimentoId || 1,
        dataPagamento: dataPagGlobal || (item.dataFaturamento ? new Date(item.dataFaturamento.split('/').reverse().join('-')) : null),
        dataReferencia: dataRefGlobal || (item.dataFaturamento ? new Date(item.dataFaturamento.split('/').reverse().join('-')) : null),
        numeroGuia: item.guiaPrestador || null,
        protocolo: item.protocolo || null,
        lotePrestador: item.lote || null,
        nomeBeneficiario: item.pacienteNome || null,
        carteiraBeneficiario: item.carteirinha || null,
        codigoItem: item.codigo,
        descricaoItem: item.descricao,
        quantidade: String(item.quantidade),
        valorInformado: String(item.valorApresentado),
        valorPago: String(item.valorPago),
        valorGlosa: String(item.valorGlosa), 
        situacaoItem: item.valorGlosa > 0 && item.valorPago === 0 ? "GLOSADO" : item.valorGlosa > 0 ? "PARCIAL" : "PAGO",
        codigoGlosa: item.motivoGlosa || null
      }));

      // chunk insert
      const BATCH_SIZE = 100;
      for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        await db.insert(demonstrativo).values(recordsToInsert.slice(i, i + BATCH_SIZE));
      }

      return { success: true, arquivoId };
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

      // Saldo bancário
      const saldoBancario = await db.select({
        total: sql<string>`COALESCE(SUM(saldoInicial), 0)`,
        qtdBancos: sql<number>`COUNT(*)`
      }).from(finBancos);

      const [[despPago], [despPendente], [despVencido], [despVencidoCount], [recRecebido], [recPendente], [recPendenteCount], [despPendenteCount],
        [pagDia], [pagDiaCount], [pagDiaTotal],
        [totalPagoGeral], [totalRecebidoGeral],
        [custosFixos]] = await Promise.all([
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "sim"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "nao"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(eq(finTransacoes.pago, "nao"), lte(finTransacoes.dataVencimento, new Date(hoje)))),
        db.select({ count: sql<number>`COUNT(*)` }).from(finTransacoes).where(and(eq(finTransacoes.pago, "nao"), lte(finTransacoes.dataVencimento, new Date(hoje)))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...condReceber, eq(finRecebiveis.recebido, "sim"))),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...condReceber, eq(finRecebiveis.recebido, "nao"))),
        db.select({ count: sql<number>`COUNT(*)` }).from(finRecebiveis).where(and(...condReceber, eq(finRecebiveis.recebido, "nao"))),
        db.select({ count: sql<number>`COUNT(*)` }).from(finTransacoes).where(and(...condPagar, eq(finTransacoes.pago, "nao"))),
        // Pagamentos do dia
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(eq(finTransacoes.dataVencimento, new Date(hoje)), eq(finTransacoes.pago, "nao"))),
        db.select({ count: sql<number>`COUNT(*)` }).from(finTransacoes).where(eq(finTransacoes.dataVencimento, new Date(hoje))),
        db.select({ count: sql<number>`COUNT(*)` }).from(finTransacoes).where(and(eq(finTransacoes.dataVencimento, new Date(hoje)), eq(finTransacoes.pago, "nao"))),
        // Total pago geral (todos os meses)
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(eq(finTransacoes.pago, "sim")),
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(eq(finRecebiveis.recebido, "sim")),
        // Custos fixos
        db.select({ total: sql<string>`COALESCE(SUM(valor), 0)`, count: sql<number>`COUNT(*)` }).from(finCustos).where(eq(finCustos.tipo, "fixo")),
      ]);

      // Próximos vencimentos (7 dias)
      const proxVencimentos = await db.select({
        id: finTransacoes.id,
        descricao: finTransacoes.descricao,
        valor: finTransacoes.valor,
        dataVencimento: finTransacoes.dataVencimento,
        empresaNome: finEmpresas.nome,
      }).from(finTransacoes)
        .leftJoin(finEmpresas, eq(finTransacoes.empresaId, finEmpresas.id))
        .where(and(
          eq(finTransacoes.pago, "nao"),
          gte(finTransacoes.dataVencimento, new Date(hoje)),
          lte(finTransacoes.dataVencimento, new Date(new Date(hoje).getTime() + 7 * 86400000)),
        ))
        .orderBy(asc(finTransacoes.dataVencimento))
        .limit(10);

      const proxVencTotal = await db.select({
        total: sql<string>`COALESCE(SUM(valor), 0)`,
        count: sql<number>`COUNT(*)`
      }).from(finTransacoes).where(and(
        eq(finTransacoes.pago, "nao"),
        gte(finTransacoes.dataVencimento, new Date(hoje)),
        lte(finTransacoes.dataVencimento, new Date(new Date(hoje).getTime() + 7 * 86400000)),
      ));

      // Próximos recebimentos (7 dias)
      const proxRecebimentos = await db.select({
        id: finRecebiveis.id,
        descricao: finRecebiveis.descricao,
        valor: finRecebiveis.valor,
        dataVencimento: finRecebiveis.dataVencimento,
        clienteNome: finClientes.nome,
      }).from(finRecebiveis)
        .leftJoin(finClientes, eq(finRecebiveis.clienteId, finClientes.id))
        .where(and(
          eq(finRecebiveis.recebido, "nao"),
          gte(finRecebiveis.dataVencimento, new Date(hoje)),
          lte(finRecebiveis.dataVencimento, new Date(new Date(hoje).getTime() + 7 * 86400000)),
        ))
        .orderBy(asc(finRecebiveis.dataVencimento))
        .limit(10);

      const proxRecebTotal = await db.select({
        total: sql<string>`COALESCE(SUM(valor), 0)`,
        count: sql<number>`COUNT(*)`
      }).from(finRecebiveis).where(and(
        eq(finRecebiveis.recebido, "nao"),
        gte(finRecebiveis.dataVencimento, new Date(hoje)),
        lte(finRecebiveis.dataVencimento, new Date(new Date(hoje).getTime() + 7 * 86400000)),
      ));

      // Top 5 maiores pagamentos do mês
      const topPagamentos = await db.select({
        id: finTransacoes.id,
        descricao: finTransacoes.descricao,
        valor: finTransacoes.valor,
        dataVencimento: finTransacoes.dataVencimento,
        pago: finTransacoes.pago,
        empresaNome: finEmpresas.nome,
        categoriaNome: finCategorias.nome,
      }).from(finTransacoes)
        .leftJoin(finEmpresas, eq(finTransacoes.empresaId, finEmpresas.id))
        .leftJoin(finCategorias, eq(finTransacoes.categoriaId, finCategorias.id))
        .where(and(...condPagar))
        .orderBy(desc(finTransacoes.valor))
        .limit(5);

      // Pagamentos por categoria (mês atual vs mês anterior)
      const mesAnterior = new Date(ano, mesNum - 2, 1);
      const maIni = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}-01`;
      const maLastDay = new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 0).getDate();
      const maFim = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}-${maLastDay}`;

      const catAtual = await db.select({
        categoriaId: finTransacoes.categoriaId,
        categoriaNome: finCategorias.nome,
        totalPago: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'sim' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        totalPendente: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'nao' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        totalGeral: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
      }).from(finTransacoes)
        .leftJoin(finCategorias, eq(finTransacoes.categoriaId, finCategorias.id))
        .where(and(gte(finTransacoes.dataVencimento, new Date(inicio)), lte(finTransacoes.dataVencimento, new Date(fim))))
        .groupBy(finTransacoes.categoriaId, finCategorias.nome)
        .orderBy(desc(sql`SUM(${finTransacoes.valor})`));

      const catAnterior = await db.select({
        categoriaId: finTransacoes.categoriaId,
        totalGeral: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
        totalPendente: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'nao' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
      }).from(finTransacoes)
        .where(and(gte(finTransacoes.dataVencimento, new Date(maIni)), lte(finTransacoes.dataVencimento, new Date(maFim))))
        .groupBy(finTransacoes.categoriaId);

      const catAnteriorMap = new Map(catAnterior.map(c => [c.categoriaId, c]));
      const categorias = catAtual.map(c => {
        const ant = catAnteriorMap.get(c.categoriaId);
        const totalAnt = ant ? Number(ant.totalGeral) : 0;
        const totalAtual = Number(c.totalGeral);
        const variacao = totalAnt > 0 ? ((totalAtual - totalAnt) / totalAnt * 100) : 0;
        return {
          categoriaId: c.categoriaId,
          nome: c.categoriaNome || "Sem categoria",
          mesAtual: totalAtual,
          mesAtualPendente: Number(c.totalPendente),
          mesAnterior: totalAnt,
          mesAnteriorPendente: ant ? Number(ant.totalPendente) : 0,
          variacao: Math.round(variacao),
          total: totalAtual + totalAnt,
        };
      });

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

        const [[despT], [despPagoM], [recT], [recRecM]] = await Promise.all([
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...cP)),
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(...cP, eq(finTransacoes.pago, "sim"))),
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...cR)),
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(...cR, eq(finRecebiveis.recebido, "sim"))),
        ]);
        evolucao.push({ mes: mLabel, despesas: Number(despT.total), despesasPago: Number(despPagoM.total), receitas: Number(recT.total), receitasRecebido: Number(recRecM.total) });
      }

      return {
        mesRef,
        saldoBancario: saldoBancario[0]?.total || "0",
        qtdBancos: saldoBancario[0]?.qtdBancos || 0,
        despesasPago: despPago.total,
        despesasPendente: despPendente.total,
        despesasPendenteCount: despPendenteCount.count,
        despesasVencido: despVencido.total,
        despesasVencidoCount: despVencidoCount.count,
        receitasRecebido: recRecebido.total,
        receitasPendente: recPendente.total,
        receitasPendenteCount: recPendenteCount.count,
        pagamentoDia: pagDia.total,
        pagamentoDiaCount: pagDiaCount.count,
        pagamentoDiaPendente: pagDiaTotal.count,
        totalPagoGeral: totalPagoGeral.total,
        totalRecebidoGeral: totalRecebidoGeral.total,
        custosFixos: custosFixos.total,
        custosFixosCount: custosFixos.count,
        proxVencimentos,
        proxVencTotal: { total: proxVencTotal[0]?.total || "0", count: proxVencTotal[0]?.count || 0 },
        proxRecebimentos,
        proxRecebTotal: { total: proxRecebTotal[0]?.total || "0", count: proxRecebTotal[0]?.count || 0 },
        topPagamentos,
        categorias,
        evolucao,
        mesAtualLabel: `${MONTHS_SHORT[mesNum - 1]}/${String(ano).slice(2)}`,
        mesAnteriorLabel: `${MONTHS_SHORT[mesAnterior.getMonth()]}/${String(mesAnterior.getFullYear()).slice(2)}`,
      };
    }),

  // Fluxo de caixa projetado
  fluxoCaixa: protectedProcedure
    .input(z.object({ dias: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date();
      const hojeStr = hoje.toISOString().slice(0, 10);
      const fimDate = new Date(hoje.getTime() + input.dias * 86400000);
      const fimStr = fimDate.toISOString().slice(0, 10);

      // Buscar todos os pagamentos e recebimentos no período
      const pagamentos = await db.select({
        dataVencimento: finTransacoes.dataVencimento,
        valor: finTransacoes.valor,
        pago: finTransacoes.pago,
      }).from(finTransacoes)
        .where(and(
          gte(finTransacoes.dataVencimento, new Date(hojeStr)),
          lte(finTransacoes.dataVencimento, new Date(fimStr)),
        ));

      const recebimentos = await db.select({
        dataVencimento: finRecebiveis.dataVencimento,
        valor: finRecebiveis.valor,
        recebido: finRecebiveis.recebido,
      }).from(finRecebiveis)
        .where(and(
          gte(finRecebiveis.dataVencimento, new Date(hojeStr)),
          lte(finRecebiveis.dataVencimento, new Date(fimStr)),
        ));

      // Agrupar por dia
      const diasMap = new Map<string, { receber: number; pagar: number }>();
      for (let i = 0; i <= input.dias; i++) {
        const d = new Date(hoje.getTime() + i * 86400000).toISOString().slice(0, 10);
        diasMap.set(d, { receber: 0, pagar: 0 });
      }

      for (const p of pagamentos) {
        const d = new Date(p.dataVencimento).toISOString().slice(0, 10);
        const entry = diasMap.get(d);
        if (entry) entry.pagar += Number(p.valor);
      }
      for (const r of recebimentos) {
        const d = new Date(r.dataVencimento).toISOString().slice(0, 10);
        const entry = diasMap.get(d);
        if (entry) entry.receber += Number(r.valor);
      }

      let saldoAcumulado = 0;
      let totalReceber = 0;
      let totalPagar = 0;
      const pontos = Array.from(diasMap.entries()).sort().map(([data, v]) => {
        saldoAcumulado += v.receber - v.pagar;
        totalReceber += v.receber;
        totalPagar += v.pagar;
        return { data, receber: v.receber, pagar: v.pagar, saldo: saldoAcumulado };
      });

      return { pontos, totalReceber, totalPagar, saldoFinal: saldoAcumulado };
    }),

  // Comparativo mensal
  comparativoMensal: protectedProcedure
    .input(z.object({ mes1: z.string(), mes2: z.string(), tipo: z.enum(["categoria", "descricao"]).default("categoria") }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const parse = (m: string) => {
        const [a, n] = m.split("-").map(Number);
        const ini = `${a}-${String(n).padStart(2, "0")}-01`;
        const ld = new Date(a, n, 0).getDate();
        const fim = `${a}-${String(n).padStart(2, "0")}-${ld}`;
        return { ini, fim, label: `${MONTHS_SHORT[n - 1]}/${String(a).slice(2)}` };
      };
      const m1 = parse(input.mes1);
      const m2 = parse(input.mes2);

      const groupField = input.tipo === "categoria" ? finCategorias.nome : finTransacoes.descricao;

      const getData = async (ini: string, fim: string) => {
        if (input.tipo === "categoria") {
          return db.select({
            nome: sql<string>`COALESCE(${finCategorias.nome}, 'Sem categoria')`,
            total: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
          }).from(finTransacoes)
            .leftJoin(finCategorias, eq(finTransacoes.categoriaId, finCategorias.id))
            .where(and(gte(finTransacoes.dataVencimento, new Date(ini)), lte(finTransacoes.dataVencimento, new Date(fim))))
            .groupBy(finCategorias.nome)
            .orderBy(desc(sql`SUM(${finTransacoes.valor})`));
        } else {
          return db.select({
            nome: finTransacoes.descricao,
            total: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
          }).from(finTransacoes)
            .where(and(gte(finTransacoes.dataVencimento, new Date(ini)), lte(finTransacoes.dataVencimento, new Date(fim))))
            .groupBy(finTransacoes.descricao)
            .orderBy(desc(sql`SUM(${finTransacoes.valor})`));
        }
      };

      const [data1, data2] = await Promise.all([getData(m1.ini, m1.fim), getData(m2.ini, m2.fim)]);
      const map2 = new Map(data2.map(d => [d.nome, Number(d.total)]));
      const total1 = data1.reduce((s, d) => s + Number(d.total), 0);
      const total2 = data2.reduce((s, d) => s + Number(d.total), 0);
      const varTotal = total1 > 0 ? ((total2 - total1) / total1 * 100) : 0;

      const allNames = new Set([...data1.map(d => d.nome), ...data2.map(d => d.nome)]);
      const map1 = new Map(data1.map(d => [d.nome, Number(d.total)]));
      const items = Array.from(allNames).map(nome => {
        const v1 = map1.get(nome) || 0;
        const v2 = map2.get(nome) || 0;
        const variacao = v1 > 0 ? ((v2 - v1) / v1 * 100) : (v2 > 0 ? 100 : 0);
        return { nome, mes1: v1, mes2: v2, variacao: Math.round(variacao * 10) / 10 };
      }).sort((a, b) => b.mes1 - a.mes1);

      return { mes1Label: m1.label, mes2Label: m2.label, total1, total2, varTotal: Math.round(varTotal * 10) / 10, items };
    }),

  // DRE
  dre: protectedProcedure
    .input(z.object({ mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const mesRef = input?.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mesNum] = mesRef.split("-").map(Number);
      const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mesNum, 0).getDate();
      const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`;

      // Receitas por tipo de serviço
      const receitas = await db.select({
        tipoServico: sql<string>`COALESCE(${finRecebiveis.tipoServico}, 'Outros')`,
        recebido: sql<string>`COALESCE(SUM(CASE WHEN ${finRecebiveis.recebido} = 'sim' THEN ${finRecebiveis.valor} ELSE 0 END), 0)`,
        pendente: sql<string>`COALESCE(SUM(CASE WHEN ${finRecebiveis.recebido} = 'nao' THEN ${finRecebiveis.valor} ELSE 0 END), 0)`,
        total: sql<string>`COALESCE(SUM(${finRecebiveis.valor}), 0)`,
      }).from(finRecebiveis)
        .where(and(gte(finRecebiveis.dataVencimento, new Date(inicio)), lte(finRecebiveis.dataVencimento, new Date(fim))))
        .groupBy(finRecebiveis.tipoServico)
        .orderBy(desc(sql`SUM(${finRecebiveis.valor})`));

      // Despesas por categoria
      const despesas = await db.select({
        categoria: sql<string>`COALESCE(${finCategorias.nome}, 'Sem categoria')`,
        pago: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'sim' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        pendente: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'nao' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        total: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
      }).from(finTransacoes)
        .leftJoin(finCategorias, eq(finTransacoes.categoriaId, finCategorias.id))
        .where(and(gte(finTransacoes.dataVencimento, new Date(inicio)), lte(finTransacoes.dataVencimento, new Date(fim))))
        .groupBy(finCategorias.nome)
        .orderBy(desc(sql`SUM(${finTransacoes.valor})`));

      // Despesas por centro de custo
      const despesasPorCC = await db.select({
        centroCusto: sql<string>`COALESCE(${finCentrosCusto.nome}, 'Sem centro de custo')`,
        total: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
      }).from(finTransacoes)
        .leftJoin(finCentrosCusto, eq(finTransacoes.centroCustoId, finCentrosCusto.id))
        .where(and(gte(finTransacoes.dataVencimento, new Date(inicio)), lte(finTransacoes.dataVencimento, new Date(fim))))
        .groupBy(finCentrosCusto.nome)
        .orderBy(desc(sql`SUM(${finTransacoes.valor})`));

      const totalReceitas = receitas.reduce((s, r) => s + Number(r.total), 0);
      const totalDespesas = despesas.reduce((s, d) => s + Number(d.total), 0);
      const resultado = totalReceitas - totalDespesas;

      // Evolução DRE últimos 6 meses
      const evolucaoDre = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(ano, mesNum - 1 - i, 1);
        const mIni = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const mLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const mFim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${mLastDay}`;
        const mLabel = `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;

        const [[rec], [desp]] = await Promise.all([
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finRecebiveis).where(and(gte(finRecebiveis.dataVencimento, new Date(mIni)), lte(finRecebiveis.dataVencimento, new Date(mFim)))),
          db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(finTransacoes).where(and(gte(finTransacoes.dataVencimento, new Date(mIni)), lte(finTransacoes.dataVencimento, new Date(mFim)))),
        ]);
        evolucaoDre.push({ mes: mLabel, receitas: Number(rec.total), despesas: Number(desp.total), resultado: Number(rec.total) - Number(desp.total) });
      }

      return { mesRef, receitas, despesas, despesasPorCC, totalReceitas, totalDespesas, resultado, evolucaoDre };
    }),
});

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ============================================================
// CENTROS DE CUSTO
// ============================================================
const centrosCustoRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(finCentrosCusto).orderBy(asc(finCentrosCusto.nome));
  }),
  criar: protectedProcedure
    .input(z.object({
      codigo: z.string().min(1),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      responsavel: z.string().optional(),
      orcamentoMensal: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(finCentrosCusto).values({
        codigo: input.codigo,
        nome: input.nome,
        descricao: input.descricao || null,
        responsavel: input.responsavel || null,
        orcamentoMensal: input.orcamentoMensal || null,
        userId: ctx.user.id,
      });
      return { id: result.insertId };
    }),
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      codigo: z.string().min(1),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      responsavel: z.string().optional(),
      orcamentoMensal: z.string().optional(),
      ativo: z.enum(["sim", "nao"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(finCentrosCusto).set({
        codigo: data.codigo,
        nome: data.nome,
        descricao: data.descricao || null,
        responsavel: data.responsavel || null,
        orcamentoMensal: data.orcamentoMensal || null,
        ativo: data.ativo || "sim",
      }).where(eq(finCentrosCusto.id, id));
      return { success: true };
    }),
  excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(finCentrosCusto).where(eq(finCentrosCusto.id, input.id));
    return { success: true };
  }),
  // Dashboard: total de contas a pagar por centro de custo
  resumo: protectedProcedure
    .input(z.object({ mes: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const mesRef = input?.mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mesNum] = mesRef.split("-").map(Number);
      const inicio = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mesNum, 0).getDate();
      const fim = `${ano}-${String(mesNum).padStart(2, "0")}-${lastDay}`;

      const result = await db.select({
        centroCustoId: finTransacoes.centroCustoId,
        ccNome: finCentrosCusto.nome,
        ccCodigo: finCentrosCusto.codigo,
        ccOrcamento: finCentrosCusto.orcamentoMensal,
        totalPago: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'sim' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        totalPendente: sql<string>`COALESCE(SUM(CASE WHEN ${finTransacoes.pago} = 'nao' THEN ${finTransacoes.valor} ELSE 0 END), 0)`,
        totalGeral: sql<string>`COALESCE(SUM(${finTransacoes.valor}), 0)`,
        qtdTransacoes: sql<number>`COUNT(*)`,
      })
      .from(finTransacoes)
      .leftJoin(finCentrosCusto, eq(finTransacoes.centroCustoId, finCentrosCusto.id))
      .where(and(
        gte(finTransacoes.dataVencimento, new Date(inicio)),
        lte(finTransacoes.dataVencimento, new Date(fim)),
        sql`${finTransacoes.centroCustoId} IS NOT NULL`,
      ))
      .groupBy(finTransacoes.centroCustoId, finCentrosCusto.nome, finCentrosCusto.codigo, finCentrosCusto.orcamentoMensal);

      return result;
    }),
});

// ============================================================
// IMPORTADOR EXCEL (Contas a Pagar / Contas a Receber)
// ============================================================
const importadorRouter = router({
  importarContasPagar: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        descricao: z.string(),
        valor: z.string(),
        dataVencimento: z.string(),
        dataPagamento: z.string().optional(),
        pago: z.enum(["sim", "nao"]).optional(),
        empresaId: z.number().optional(),
        categoriaId: z.number().optional(),
        centroCustoId: z.number().optional(),
        bancoId: z.number().optional(),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      let imported = 0;
      let errors = 0;
      for (const item of input.items) {
        try {
          await db.insert(finTransacoes).values({
            descricao: item.descricao,
            valor: item.valor,
            dataVencimento: new Date(item.dataVencimento),
            dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
            pago: item.pago || "nao",
            empresaId: item.empresaId || null,
            categoriaId: item.categoriaId || null,
            centroCustoId: item.centroCustoId || null,
            bancoId: item.bancoId || null,
            observacoes: item.observacoes || null,
            userId: ctx.user.id,
          });
          imported++;
        } catch {
          errors++;
        }
      }
      return { imported, errors, total: input.items.length };
    }),
  importarContasReceber: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        descricao: z.string(),
        valor: z.string(),
        dataVencimento: z.string(),
        dataRecebimento: z.string().optional(),
        recebido: z.enum(["sim", "nao"]).optional(),
        empresaId: z.number().optional(),
        clienteId: z.number().optional(),
        bancoId: z.number().optional(),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      let imported = 0;
      let errors = 0;
      for (const item of input.items) {
        try {
          await db.insert(finRecebiveis).values({
            descricao: item.descricao,
            valor: item.valor,
            dataVencimento: new Date(item.dataVencimento),
            dataRecebimento: item.dataRecebimento ? new Date(item.dataRecebimento) : null,
            recebido: item.recebido || "nao",
            empresaId: item.empresaId || null,
            clienteId: item.clienteId || null,
            bancoId: item.bancoId || null,
            observacoes: item.observacoes || null,
            userId: ctx.user.id,
          });
          imported++;
        } catch {
          errors++;
        }
      }
      return { imported, errors, total: input.items.length };
    }),
});

// ============================================================
// BANCO INTER
// ============================================================
const bancoInterRouter = router({
  status: protectedProcedure.query(async () => {
    return getInterStatus();
  }),

  saldo: protectedProcedure.query(async () => {
    return consultarSaldo();
  }),

  extrato: protectedProcedure
    .input(z.object({
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ input }) => {
      return consultarExtrato(input.dataInicio, input.dataFim);
    }),

  extratoCompleto: protectedProcedure
    .input(z.object({
      dataInicio: z.string(),
      dataFim: z.string(),
      pagina: z.number().optional(),
      tamanhoPagina: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return consultarExtratoCompleto(input.dataInicio, input.dataFim, input.pagina, input.tamanhoPagina);
    }),

  extratoPdf: protectedProcedure
    .input(z.object({
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .mutation(async ({ input }) => {
      return exportarExtratoPdf(input.dataInicio, input.dataFim);
    }),

  // ---- COBRANÇA (BOLETO COM PIX) ----
  emitirBoleto: protectedProcedure
    .input(z.object({
      seuNumero: z.string().max(15),
      valorNominal: z.number().min(2.5).max(99999999.99),
      dataVencimento: z.string(), // YYYY-MM-DD
      numDiasAgenda: z.number().int().min(0).max(60).default(30),
      pagador: z.object({
        cpfCnpj: z.string(),
        tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
        nome: z.string(),
        endereco: z.string(),
        bairro: z.string(),
        cidade: z.string(),
        uf: z.string().length(2),
        cep: z.string(),
        email: z.string().optional(),
        ddd: z.string().optional(),
        telefone: z.string().optional(),
        numero: z.string().optional(),
        complemento: z.string().optional(),
      }),
      desconto: z.object({
        taxa: z.number(),
        codigo: z.enum(["PERCENTUALDATAINFORMADA", "VALORFIXODATAINFORMADA"]),
        quantidadeDias: z.number(),
      }).optional(),
      multa: z.object({
        taxa: z.number(),
        codigo: z.enum(["PERCENTUAL", "VALORFIXO"]),
      }).optional(),
      mora: z.object({
        taxa: z.number(),
        codigo: z.enum(["TAXAMENSAL", "VALORFIXO"]),
      }).optional(),
      mensagem: z.object({
        linha1: z.string().optional(),
        linha2: z.string().optional(),
        linha3: z.string().optional(),
        linha4: z.string().optional(),
        linha5: z.string().optional(),
      }).optional(),
      formasRecebimento: z.array(z.enum(["BOLETO", "PIX"])).optional(),
    }))
    .mutation(async ({ input }) => {
      return emitirBoleto(input);
    }),

  consultarBoleto: protectedProcedure
    .input(z.object({ codigoSolicitacao: z.string() }))
    .query(async ({ input }) => {
      return consultarBoleto(input.codigoSolicitacao);
    }),

  listarBoletos: protectedProcedure
    .input(z.object({
      dataInicial: z.string(),
      dataFinal: z.string(),
      situacao: z.string().optional(),
      pagina: z.number().optional(),
      itensPorPagina: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return listarBoletos(input.dataInicial, input.dataFinal, input.situacao, input.pagina, input.itensPorPagina);
    }),

  downloadBoletoPdf: protectedProcedure
    .input(z.object({ codigoSolicitacao: z.string() }))
    .mutation(async ({ input }) => {
      return downloadBoletoPdf(input.codigoSolicitacao);
    }),

  cancelarBoleto: protectedProcedure
    .input(z.object({
      codigoSolicitacao: z.string(),
      motivoCancelamento: z.string().max(50),
    }))
    .mutation(async ({ input }) => {
      return cancelarBoleto(input.codigoSolicitacao, input.motivoCancelamento);
    }),

  sumarioBoletos: protectedProcedure
    .input(z.object({
      dataInicial: z.string(),
      dataFinal: z.string(),
    }))
    .query(async ({ input }) => {
      return sumarioBoletos(input.dataInicial, input.dataFinal);
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
  centrosCusto: centrosCustoRouter,
  transacoes: transacoesRouter,
  recebiveis: recebiveisRouter,
  extratos: extratosRouter,
  previsao: previsaoRouter,
  dashboard: dashboardRouter,
  importador: importadorRouter,
  bancoInter: bancoInterRouter,
});
