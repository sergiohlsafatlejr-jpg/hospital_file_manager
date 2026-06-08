import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { nfseHospitais, nfseConvenios, nfseNotas, convenios } from "../../drizzle/schema";
import { eq, desc, and, sql, like, gte, lte } from "drizzle-orm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm";

// ============================================================
// HOSPITAIS NFS-e
// ============================================================

const hospitaisRouter = router({
  listar: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [eq(nfseHospitais.ativo, "sim")];
      if (input?.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      return db.select().from(nfseHospitais).where(and(...conditions)).orderBy(nfseHospitais.nome);
    }),

  buscarPorId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [hospital] = await db.select().from(nfseHospitais).where(eq(nfseHospitais.id, input.id));
      if (!hospital) throw new TRPCError({ code: "NOT_FOUND", message: "Hospital não encontrado" });
      return hospital;
    }),

  criar: protectedProcedure
    .input(z.object({
      nome: z.string().min(1),
      cnpj: z.string().optional(),
      cpfNf: z.string().optional(),
      senhaNf: z.string().optional(),
      endereco: z.string().optional(),
      telefone: z.string().optional(),
      estabelecimentoId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(nfseHospitais).values({
        nome: input.nome,
        cnpj: input.cnpj || null,
        cpfNf: input.cpfNf || null,
        senhaNf: input.senhaNf || null,
        endereco: input.endereco || null,
        telefone: input.telefone || null,
        estabelecimentoId: input.estabelecimentoId || null,
      });
      return { id: result.insertId, success: true };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1),
      cnpj: z.string().optional(),
      cpfNf: z.string().optional(),
      senhaNf: z.string().optional(),
      endereco: z.string().optional(),
      telefone: z.string().optional(),
      estabelecimentoId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseHospitais).set({
        nome: input.nome,
        cnpj: input.cnpj || null,
        cpfNf: input.cpfNf || null,
        senhaNf: input.senhaNf || null,
        endereco: input.endereco || null,
        telefone: input.telefone || null,
        estabelecimentoId: input.estabelecimentoId || null,
      }).where(eq(nfseHospitais.id, input.id));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseHospitais).set({ ativo: "nao" }).where(eq(nfseHospitais.id, input.id));
      return { success: true };
    }),
});

// ============================================================
// CONVÊNIOS NFS-e
// ============================================================

const conveniosRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    // Buscar da tabela principal de convênios do sistema
    return db.select().from(convenios).where(eq(convenios.ativo, "sim")).orderBy(convenios.nome);
  }),

  // Manter listagem da tabela NFS-e separada para compatibilidade
  listarNfse: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(nfseConvenios).where(eq(nfseConvenios.ativo, "sim")).orderBy(nfseConvenios.nome);
  }),

  criar: protectedProcedure
    .input(z.object({
      nome: z.string().min(1),
      codigo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(nfseConvenios).values({
        nome: input.nome,
        codigo: input.codigo || null,
      });
      return { id: result.insertId, success: true };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1),
      codigo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseConvenios).set({
        nome: input.nome,
        codigo: input.codigo || null,
      }).where(eq(nfseConvenios.id, input.id));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseConvenios).set({ ativo: "nao" }).where(eq(nfseConvenios.id, input.id));
      return { success: true };
    }),
});

// ============================================================
// NOTAS FISCAIS NFS-e
// ============================================================

const notasRouter = router({
  listar: protectedProcedure
    .input(z.object({
      hospitalId: z.number().optional(),
      convenioId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      nfEmitida: z.enum(["sim", "nao"]).optional(),
      busca: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [];

      // Filtrar por estabelecimento via JOIN com nfseHospitais
      if (input.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.hospitalId) conditions.push(eq(nfseNotas.hospitalId, input.hospitalId));
      if (input.convenioId) conditions.push(eq(nfseNotas.convenioId, input.convenioId));
      if (input.nfEmitida) conditions.push(eq(nfseNotas.nfEmitida, input.nfEmitida));
      if (input.dataInicio) {
        conditions.push(gte(nfseNotas.dataEmissao, new Date(input.dataInicio)));
      }
      if (input.dataFim) {
        conditions.push(lte(nfseNotas.dataEmissao, new Date(input.dataFim)));
      }
      if (input.busca) {
        conditions.push(like(nfseNotas.numeroNf, `%${input.busca}%`));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [notas, countResult] = await Promise.all([
        db.select({
          id: nfseNotas.id,
          hospitalId: nfseNotas.hospitalId,
          convenioId: nfseNotas.convenioId,
          numeroNf: nfseNotas.numeroNf,
          dataEmissao: nfseNotas.dataEmissao,
          dataFaturamento: nfseNotas.dataFaturamento,
          valorBruto: nfseNotas.valorBruto,
          valorLiquido: nfseNotas.valorLiquido,
          xmlDemonstrativoEmitido: nfseNotas.xmlDemonstrativoEmitido,
          nfEmitida: nfseNotas.nfEmitida,
          observacoes: nfseNotas.observacoes,
          pdfUrl: nfseNotas.pdfUrl,
          pdfKey: nfseNotas.pdfKey,
          createdAt: nfseNotas.createdAt,
          hospitalNome: nfseHospitais.nome,
          convenioNome: convenios.nome,
          demonstrativoBaixado: sql<boolean>`EXISTS (
            SELECT 1 FROM arquivos a
            WHERE a.direcao = 'retornado'
              AND a.convenioId = ${nfseNotas.convenioId}
              AND a.estabelecimentoId = ${nfseHospitais.estabelecimentoId}
              AND DATE_FORMAT(a.dataReferencia, '%Y-%m') = DATE_FORMAT(${nfseNotas.dataEmissao}, '%Y-%m')
          )`.as('demonstrativoBaixado'),
        })
          .from(nfseNotas)
          .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
          .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
          .where(whereClause)
          .orderBy(desc(nfseNotas.dataEmissao))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(nfseNotas)
          .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
          .where(whereClause),
      ]);

      return {
        notas,
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  buscarPorId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [nota] = await db.select({
        id: nfseNotas.id,
        hospitalId: nfseNotas.hospitalId,
        convenioId: nfseNotas.convenioId,
        numeroNf: nfseNotas.numeroNf,
        dataEmissao: nfseNotas.dataEmissao,
        dataFaturamento: nfseNotas.dataFaturamento,
        valorBruto: nfseNotas.valorBruto,
        valorLiquido: nfseNotas.valorLiquido,
        xmlDemonstrativoEmitido: nfseNotas.xmlDemonstrativoEmitido,
        nfEmitida: nfseNotas.nfEmitida,
        observacoes: nfseNotas.observacoes,
        pdfUrl: nfseNotas.pdfUrl,
        pdfKey: nfseNotas.pdfKey,
        createdAt: nfseNotas.createdAt,
        hospitalNome: nfseHospitais.nome,
        convenioNome: convenios.nome,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
        .where(eq(nfseNotas.id, input.id));
      if (!nota) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
      return nota;
    }),

  criar: protectedProcedure
    .input(z.object({
      hospitalId: z.number(),
      convenioId: z.number().optional(),
      numeroNf: z.string().min(1),
      dataEmissao: z.string(),
      dataFaturamento: z.string().optional(),
      valorBruto: z.number().default(0),
      valorLiquido: z.number().default(0),
      xmlDemonstrativoEmitido: z.enum(["sim", "nao"]).default("nao"),
      nfEmitida: z.enum(["sim", "nao"]).default("nao"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(nfseNotas).values({
        hospitalId: input.hospitalId,
        convenioId: input.convenioId || null,
        numeroNf: input.numeroNf,
        dataEmissao: new Date(input.dataEmissao),
        dataFaturamento: input.dataFaturamento ? new Date(input.dataFaturamento) : null,
        valorBruto: String(input.valorBruto),
        valorLiquido: String(input.valorLiquido),
        xmlDemonstrativoEmitido: input.xmlDemonstrativoEmitido,
        nfEmitida: input.nfEmitida,
        observacoes: input.observacoes || null,
        userId: ctx.user.id,
      });
      return { id: result.insertId, success: true };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      hospitalId: z.number(),
      convenioId: z.number().optional(),
      numeroNf: z.string().min(1),
      dataEmissao: z.string(),
      dataFaturamento: z.string().optional(),
      valorBruto: z.number().default(0),
      valorLiquido: z.number().default(0),
      xmlDemonstrativoEmitido: z.enum(["sim", "nao"]).default("nao"),
      nfEmitida: z.enum(["sim", "nao"]).default("nao"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseNotas).set({
        hospitalId: input.hospitalId,
        convenioId: input.convenioId || null,
        numeroNf: input.numeroNf,
        dataEmissao: new Date(input.dataEmissao),
        dataFaturamento: input.dataFaturamento ? new Date(input.dataFaturamento) : null,
        valorBruto: String(input.valorBruto),
        valorLiquido: String(input.valorLiquido),
        xmlDemonstrativoEmitido: input.xmlDemonstrativoEmitido,
        nfEmitida: input.nfEmitida,
        observacoes: input.observacoes || null,
      }).where(eq(nfseNotas.id, input.id));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(nfseNotas).where(eq(nfseNotas.id, input.id));
      return { success: true };
    }),

  // Toggle rápido para XML demonstrativo emitido
  toggleXml: protectedProcedure
    .input(z.object({ id: z.number(), valor: z.enum(["sim", "nao"]) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseNotas).set({ xmlDemonstrativoEmitido: input.valor }).where(eq(nfseNotas.id, input.id));
      return { success: true };
    }),

  // Toggle rápido para NF emitida
  toggleNfEmitida: protectedProcedure
    .input(z.object({ id: z.number(), valor: z.enum(["sim", "nao"]) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(nfseNotas).set({ nfEmitida: input.valor }).where(eq(nfseNotas.id, input.id));
      return { success: true };
    }),

  // Upload de PDF da nota fiscal
  uploadPdf: protectedProcedure
    .input(z.object({
      notaId: z.number(),
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string().default("application/pdf"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const suffix = nanoid(8);
      const fileKey = `nfse-pdfs/${input.notaId}-${suffix}-${input.fileName}`;
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const { url } = await storagePut(fileKey, fileBuffer, input.contentType);

      await db.update(nfseNotas).set({
        pdfUrl: url,
        pdfKey: fileKey,
      }).where(eq(nfseNotas.id, input.notaId));

      return { url, key: fileKey };
    }),

  // Dashboard / Resumo
  dashboard: protectedProcedure
    .input(z.object({
      hospitalId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [];
      if (input.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.hospitalId) conditions.push(eq(nfseNotas.hospitalId, input.hospitalId));
      if (input.dataInicio) {
        conditions.push(gte(nfseNotas.dataEmissao, new Date(input.dataInicio)));
      }
      if (input.dataFim) {
        conditions.push(lte(nfseNotas.dataEmissao, new Date(input.dataFim)));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // KPIs
      const [kpis] = await db.select({
        totalNotas: sql<number>`COUNT(*)`,
        totalBruto: sql<string>`COALESCE(SUM(${nfseNotas.valorBruto}), 0)`,
        totalLiquido: sql<string>`COALESCE(SUM(${nfseNotas.valorLiquido}), 0)`,
        totalEmitidas: sql<number>`SUM(CASE WHEN ${nfseNotas.nfEmitida} = 'sim' THEN 1 ELSE 0 END)`,
        totalPendentes: sql<number>`SUM(CASE WHEN ${nfseNotas.nfEmitida} = 'nao' THEN 1 ELSE 0 END)`,
        totalXmlPendentes: sql<number>`SUM(CASE WHEN ${nfseNotas.xmlDemonstrativoEmitido} = 'nao' THEN 1 ELSE 0 END)`,
      }).from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .where(whereClause);

      // Contadores (filtrar por estabelecimento se necessário)
      const hospitalConditions: any[] = [eq(nfseHospitais.ativo, "sim")];
      if (input.estabelecimentoId) hospitalConditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      const [hospitalCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(nfseHospitais).where(and(...hospitalConditions));
      const [convenioCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(convenios).where(eq(convenios.ativo, "sim"));

      // Últimas notas
      const ultimasNotas = await db.select({
        id: nfseNotas.id,
        numeroNf: nfseNotas.numeroNf,
        dataEmissao: nfseNotas.dataEmissao,
        valorBruto: nfseNotas.valorBruto,
        valorLiquido: nfseNotas.valorLiquido,
        nfEmitida: nfseNotas.nfEmitida,
        hospitalNome: nfseHospitais.nome,
        convenioNome: convenios.nome,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
        .where(whereClause)
        .orderBy(desc(nfseNotas.createdAt))
        .limit(10);

      // Resumo por hospital
      const resumoPorHospital = await db.select({
        hospitalId: nfseNotas.hospitalId,
        hospitalNome: nfseHospitais.nome,
        totalNotas: sql<number>`COUNT(*)`,
        totalBruto: sql<string>`COALESCE(SUM(${nfseNotas.valorBruto}), 0)`,
        totalLiquido: sql<string>`COALESCE(SUM(${nfseNotas.valorLiquido}), 0)`,
        pendentes: sql<number>`SUM(CASE WHEN ${nfseNotas.nfEmitida} = 'nao' THEN 1 ELSE 0 END)`,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .where(whereClause)
        .groupBy(nfseNotas.hospitalId, nfseHospitais.nome)
        .orderBy(desc(sql`SUM(${nfseNotas.valorBruto})`));

      return {
        kpis: {
          totalNotas: Number(kpis?.totalNotas ?? 0),
          totalBruto: Number(kpis?.totalBruto ?? 0),
          totalLiquido: Number(kpis?.totalLiquido ?? 0),
          diferenca: Number(kpis?.totalBruto ?? 0) - Number(kpis?.totalLiquido ?? 0),
          totalEmitidas: Number(kpis?.totalEmitidas ?? 0),
          totalPendentes: Number(kpis?.totalPendentes ?? 0),
          totalXmlPendentes: Number(kpis?.totalXmlPendentes ?? 0),
          totalHospitais: Number(hospitalCount?.count ?? 0),
          totalConvenios: Number(convenioCount?.count ?? 0),
        },
        ultimasNotas,
        resumoPorHospital,
      };
    }),

  // Pendentes com alertas de urgência
  pendentes: protectedProcedure
    .input(z.object({
      hospitalId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [eq(nfseNotas.nfEmitida, "nao")];
      if (input.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.hospitalId) conditions.push(eq(nfseNotas.hospitalId, input.hospitalId));

      const pendentes = await db.select({
        id: nfseNotas.id,
        hospitalId: nfseNotas.hospitalId,
        convenioId: nfseNotas.convenioId,
        numeroNf: nfseNotas.numeroNf,
        dataEmissao: nfseNotas.dataEmissao,
        dataFaturamento: nfseNotas.dataFaturamento,
        valorBruto: nfseNotas.valorBruto,
        valorLiquido: nfseNotas.valorLiquido,
        xmlDemonstrativoEmitido: nfseNotas.xmlDemonstrativoEmitido,
        nfEmitida: nfseNotas.nfEmitida,
        observacoes: nfseNotas.observacoes,
        createdAt: nfseNotas.createdAt,
        hospitalNome: nfseHospitais.nome,
        convenioNome: convenios.nome,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
        .where(and(...conditions))
        .orderBy(nfseNotas.dataEmissao);

      // Calcular urgência
      const now = new Date();
      const pendentesComUrgencia = pendentes.map((p) => {
        const dataEmissao = new Date(p.dataEmissao);
        const diasDesdeEmissao = Math.floor((now.getTime() - dataEmissao.getTime()) / (1000 * 60 * 60 * 24));
        let urgencia: "urgente" | "atencao" | "normal" = "normal";
        if (diasDesdeEmissao > 30) urgencia = "urgente";
        else if (diasDesdeEmissao > 15) urgencia = "atencao";
        return { ...p, diasDesdeEmissao, urgencia };
      });

      const urgentes = pendentesComUrgencia.filter(p => p.urgencia === "urgente").length;
      const atencao = pendentesComUrgencia.filter(p => p.urgencia === "atencao").length;
      const normais = pendentesComUrgencia.filter(p => p.urgencia === "normal").length;

      return {
        pendentes: pendentesComUrgencia,
        resumo: { urgentes, atencao, normais, total: pendentesComUrgencia.length },
      };
    }),

  // Acompanhamento de envios (visão mensal)
  acompanhamentoEnvios: protectedProcedure
    .input(z.object({
      hospitalId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      mes: z.number().min(1).max(12),
      ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const dataInicio = `${input.ano}-${String(input.mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(input.ano, input.mes, 0).getDate();
      const dataFim = `${input.ano}-${String(input.mes).padStart(2, "0")}-${ultimoDia}`;

      const conditions: any[] = [
        gte(nfseNotas.dataEmissao, new Date(dataInicio)),
        lte(nfseNotas.dataEmissao, new Date(dataFim)),
      ];
      if (input.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.hospitalId) conditions.push(eq(nfseNotas.hospitalId, input.hospitalId));

      // Resumo por hospital e convênio
      const envios = await db.select({
        hospitalId: nfseNotas.hospitalId,
        hospitalNome: nfseHospitais.nome,
        convenioId: nfseNotas.convenioId,
        convenioNome: convenios.nome,
        totalNotas: sql<number>`COUNT(*)`,
        totalBruto: sql<string>`COALESCE(SUM(${nfseNotas.valorBruto}), 0)`,
        totalLiquido: sql<string>`COALESCE(SUM(${nfseNotas.valorLiquido}), 0)`,
        emitidas: sql<number>`SUM(CASE WHEN ${nfseNotas.nfEmitida} = 'sim' THEN 1 ELSE 0 END)`,
        pendentes: sql<number>`SUM(CASE WHEN ${nfseNotas.nfEmitida} = 'nao' THEN 1 ELSE 0 END)`,
        xmlEmitidos: sql<number>`SUM(CASE WHEN ${nfseNotas.xmlDemonstrativoEmitido} = 'sim' THEN 1 ELSE 0 END)`,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
        .where(and(...conditions))
        .groupBy(nfseNotas.hospitalId, nfseHospitais.nome, nfseNotas.convenioId, convenios.nome)
        .orderBy(nfseHospitais.nome, convenios.nome);

      // Agrupar por hospital
      const porHospital = new Map<number, {
        hospitalId: number;
        hospitalNome: string;
        convenios: typeof envios;
        totalNotas: number;
        totalBruto: number;
        totalLiquido: number;
        emitidas: number;
        pendentes: number;
      }>();

      for (const e of envios) {
        const hId = e.hospitalId;
        if (!porHospital.has(hId)) {
          porHospital.set(hId, {
            hospitalId: hId,
            hospitalNome: e.hospitalNome || "Sem hospital",
            convenios: [],
            totalNotas: 0,
            totalBruto: 0,
            totalLiquido: 0,
            emitidas: 0,
            pendentes: 0,
          });
        }
        const h = porHospital.get(hId)!;
        h.convenios.push(e);
        h.totalNotas += Number(e.totalNotas);
        h.totalBruto += Number(e.totalBruto);
        h.totalLiquido += Number(e.totalLiquido);
        h.emitidas += Number(e.emitidas);
        h.pendentes += Number(e.pendentes);
      }

      return {
        envios: Array.from(porHospital.values()),
        mes: input.mes,
        ano: input.ano,
      };
    }),

  // Importação de PDF com IA (OCR)
  importarPdfComIA: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Upload do PDF para S3 primeiro
      const suffix = nanoid(8);
      const fileKey = `nfse-pdfs/temp-${suffix}-${input.fileName}`;
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const { url: pdfUrl } = await storagePut(fileKey, fileBuffer, "application/pdf");

      // Chamar LLM para extrair dados do PDF
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair informações de notas fiscais hospitalares brasileiras.
Analise este documento PDF e extraia as seguintes informações:
- numero_nf: número da nota fiscal
- data_emissao: data de emissão (formato YYYY-MM-DD)
- data_faturamento: data de faturamento se houver (formato YYYY-MM-DD)
- valor_bruto: valor bruto em número (apenas números, sem R$)
- valor_liquido: valor líquido em número (apenas números, sem R$)
- hospital_nome: nome do hospital/prestador
- convenio_nome: nome do convênio/tomador se houver
- observacoes: qualquer observação relevante

Retorne APENAS um JSON válido com os campos que conseguir identificar. Se não encontrar um campo, omita-o do JSON.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados desta nota fiscal:" },
              {
                type: "file_url",
                file_url: {
                  url: pdfUrl,
                  mime_type: "application/pdf",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "invoice_data",
            strict: true,
            schema: {
              type: "object",
              properties: {
                numero_nf: { type: "string", description: "Número da nota fiscal" },
                data_emissao: { type: "string", description: "Data de emissão no formato YYYY-MM-DD" },
                data_faturamento: { type: "string", description: "Data de faturamento no formato YYYY-MM-DD" },
                valor_bruto: { type: "number", description: "Valor bruto" },
                valor_liquido: { type: "number", description: "Valor líquido" },
                hospital_nome: { type: "string", description: "Nome do hospital/prestador" },
                convenio_nome: { type: "string", description: "Nome do convênio" },
                observacoes: { type: "string", description: "Observações" },
              },
              required: ["numero_nf"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      let extractedData: any = {};
      try {
        extractedData = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        extractedData = { numero_nf: "", observacoes: "Não foi possível extrair dados automaticamente" };
      }

      // Tentar encontrar hospital e convênio correspondentes
      const dbConn = (await getDb())!;
      let matchedHospitalId: number | null = null;
      let matchedConvenioId: number | null = null;

      if (extractedData.hospital_nome) {
        const [hospital] = await dbConn.select({ id: nfseHospitais.id })
          .from(nfseHospitais)
          .where(and(
            like(nfseHospitais.nome, `%${extractedData.hospital_nome.substring(0, 20)}%`),
            eq(nfseHospitais.ativo, "sim"),
          ))
          .limit(1);
        if (hospital) matchedHospitalId = hospital.id;
      }

      if (extractedData.convenio_nome) {
        const [convenio] = await dbConn.select({ id: convenios.id })
          .from(convenios)
          .where(and(
            like(convenios.nome, `%${extractedData.convenio_nome.substring(0, 20)}%`),
            eq(convenios.ativo, "sim"),
          ))
          .limit(1);
        if (convenio) matchedConvenioId = convenio.id;
      }

      return {
        extractedData,
        matchedHospitalId,
        matchedConvenioId,
        pdfUrl,
        pdfKey: fileKey,
      };
    }),

  // Exportar para Excel
  exportar: protectedProcedure
    .input(z.object({
      hospitalId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [];
      if (input.estabelecimentoId) {
        conditions.push(eq(nfseHospitais.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.hospitalId) conditions.push(eq(nfseNotas.hospitalId, input.hospitalId));
      if (input.dataInicio) {
        conditions.push(gte(nfseNotas.dataEmissao, new Date(input.dataInicio)));
      }
      if (input.dataFim) {
        conditions.push(lte(nfseNotas.dataEmissao, new Date(input.dataFim)));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return db.select({
        id: nfseNotas.id,
        numeroNf: nfseNotas.numeroNf,
        dataEmissao: nfseNotas.dataEmissao,
        dataFaturamento: nfseNotas.dataFaturamento,
        valorBruto: nfseNotas.valorBruto,
        valorLiquido: nfseNotas.valorLiquido,
        xmlDemonstrativoEmitido: nfseNotas.xmlDemonstrativoEmitido,
        nfEmitida: nfseNotas.nfEmitida,
        observacoes: nfseNotas.observacoes,
        hospitalNome: nfseHospitais.nome,
        convenioNome: convenios.nome,
      })
        .from(nfseNotas)
        .leftJoin(nfseHospitais, eq(nfseNotas.hospitalId, nfseHospitais.id))
        .leftJoin(convenios, eq(nfseNotas.convenioId, convenios.id))
        .where(whereClause)
        .orderBy(desc(nfseNotas.dataEmissao));
    }),
});

// ============================================================
// ROUTER PRINCIPAL NFS-e
// ============================================================

export const nfseRouter = router({
  hospitais: hospitaisRouter,
  convenios: conveniosRouter,
  notas: notasRouter,
});
