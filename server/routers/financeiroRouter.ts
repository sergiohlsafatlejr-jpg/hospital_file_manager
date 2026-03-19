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
