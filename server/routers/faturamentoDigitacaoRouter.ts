import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { guiasFaturamento, itensGuiaFaturamento, lotesFaturamento, pacientes } from "../../drizzle/schema";
import { eq, and, sql, desc, like, or } from "drizzle-orm";

export const faturamentoDigitacaoRouter = router({
  // ========== PACIENTES ==========
  buscarPacientes: protectedProcedure
    .input(z.object({
      busca: z.string().optional(),
      estabelecimentoId: z.number().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const conditions: any[] = [];
      if (input.estabelecimentoId) {
        conditions.push(eq(pacientes.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.busca && input.busca.trim()) {
        conditions.push(
          or(
            like(pacientes.nome, `%${input.busca}%`),
            like(pacientes.carteirinha, `%${input.busca}%`),
            like(pacientes.cpf, `%${input.busca}%`)
          )
        );
      }
      const result = await db.select().from(pacientes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pacientes.updatedAt))
        .limit(input.limit);
      return result;
    }),

  criarPaciente: protectedProcedure
    .input(z.object({
      nome: z.string().min(1),
      carteirinha: z.string().optional(),
      cpf: z.string().optional(),
      dataNascimento: z.string().optional(),
      sexo: z.enum(["M", "F", "I"]).optional(),
      convenioId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(pacientes).values({
        nome: input.nome,
        carteirinha: input.carteirinha || null,
        cpf: input.cpf || null,
        dataNascimento: input.dataNascimento || null,
        sexo: input.sexo || null,
        convenioId: input.convenioId || null,
        estabelecimentoId: input.estabelecimentoId || null,
        telefone: input.telefone || null,
        email: input.email || null,
      });
      return { id: result.insertId };
    }),

  // ========== GUIAS ==========
  listarGuias: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      convenioId: z.number().optional(),
      tipoGuia: z.enum(["sadt", "internacao"]).optional(),
      status: z.enum(["rascunho", "finalizada", "em_lote", "enviada"]).optional(),
      busca: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [];
      
      if (input.estabelecimentoId) conditions.push(eq(guiasFaturamento.estabelecimentoId, input.estabelecimentoId));
      if (input.convenioId) conditions.push(eq(guiasFaturamento.convenioId, input.convenioId));
      if (input.tipoGuia) conditions.push(eq(guiasFaturamento.tipoGuia, input.tipoGuia));
      if (input.status) conditions.push(eq(guiasFaturamento.status, input.status));
      if (input.busca && input.busca.trim()) {
        conditions.push(
          or(
            like(guiasFaturamento.nomePaciente, `%${input.busca}%`),
            like(guiasFaturamento.carteirinha, `%${input.busca}%`),
            like(guiasFaturamento.numeroGuiaPrestador, `%${input.busca}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [guias, countResult] = await Promise.all([
        db.select().from(guiasFaturamento)
          .where(whereClause)
          .orderBy(desc(guiasFaturamento.updatedAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(guiasFaturamento).where(whereClause),
      ]);

      return {
        guias,
        total: Number(countResult[0]?.count || 0),
        page: input.page,
        totalPages: Math.ceil(Number(countResult[0]?.count || 0) / input.limit),
      };
    }),

  obterGuia: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [guia] = await db.select().from(guiasFaturamento).where(eq(guiasFaturamento.id, input.id));
      if (!guia) throw new Error("Guia não encontrada");
      
      const itens = await db.select().from(itensGuiaFaturamento)
        .where(eq(itensGuiaFaturamento.guiaId, input.id))
        .orderBy(itensGuiaFaturamento.sequencial);
      
      return { ...guia, itens };
    }),

  criarGuia: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number(),
      tipoGuia: z.enum(["sadt", "internacao"]),
      nomePaciente: z.string().min(1),
      carteirinha: z.string().optional(),
      dataAtendimento: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      numeroGuiaPrestador: z.string().optional(),
      numeroGuiaOperadora: z.string().optional(),
      senha: z.string().optional(),
      nomeSolicitante: z.string().optional(),
      conselhoProfSolicitante: z.string().optional(),
      numeroConselhoProfSolicitante: z.string().optional(),
      ufConselhoProfSolicitante: z.string().optional(),
      cbosConselhoProfSolicitante: z.string().optional(),
      nomeExecutante: z.string().optional(),
      conselhoProfExecutante: z.string().optional(),
      numeroConselhoProfExecutante: z.string().optional(),
      ufConselhoProfExecutante: z.string().optional(),
      cbosConselhoProfExecutante: z.string().optional(),
      caraterAtendimento: z.enum(["eletivo", "urgencia"]).optional(),
      tipoInternacao: z.string().optional(),
      regimeInternacao: z.string().optional(),
      cid10Principal: z.string().optional(),
      cid10Secundario: z.string().optional(),
      indicacaoClinica: z.string().optional(),
      observacoes: z.string().optional(),
      tipoServico: z.string().optional(),
      status: z.enum(["rascunho", "finalizada"]).default("rascunho"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Cadastro automático de paciente
      let pacienteId: number | null = null;
      if (input.carteirinha) {
        const [existente] = await db.select().from(pacientes)
          .where(and(
            eq(pacientes.carteirinha, input.carteirinha),
            eq(pacientes.convenioId, input.convenioId)
          ));
        if (existente) {
          pacienteId = existente.id;
        } else {
          const [novo] = await db.insert(pacientes).values({
            nome: input.nomePaciente,
            carteirinha: input.carteirinha,
            convenioId: input.convenioId,
            estabelecimentoId: input.estabelecimentoId,
          });
          pacienteId = novo.insertId;
        }
      }

      const [result] = await db.insert(guiasFaturamento).values({
        estabelecimentoId: input.estabelecimentoId,
        convenioId: input.convenioId,
        pacienteId,
        tipoGuia: input.tipoGuia,
        nomePaciente: input.nomePaciente,
        carteirinha: input.carteirinha || null,
        dataAtendimento: input.dataAtendimento || null,
        dataInicio: input.dataInicio || null,
        dataFim: input.dataFim || null,
        numeroGuiaPrestador: input.numeroGuiaPrestador || null,
        numeroGuiaOperadora: input.numeroGuiaOperadora || null,
        senha: input.senha || null,
        nomeSolicitante: input.nomeSolicitante || null,
        conselhoProfSolicitante: input.conselhoProfSolicitante || null,
        numeroConselhoProfSolicitante: input.numeroConselhoProfSolicitante || null,
        ufConselhoProfSolicitante: input.ufConselhoProfSolicitante || null,
        cbosConselhoProfSolicitante: input.cbosConselhoProfSolicitante || null,
        nomeExecutante: input.nomeExecutante || null,
        conselhoProfExecutante: input.conselhoProfExecutante || null,
        numeroConselhoProfExecutante: input.numeroConselhoProfExecutante || null,
        ufConselhoProfExecutante: input.ufConselhoProfExecutante || null,
        cbosConselhoProfExecutante: input.cbosConselhoProfExecutante || null,
        caraterAtendimento: input.caraterAtendimento || "eletivo",
        tipoInternacao: input.tipoInternacao || null,
        regimeInternacao: input.regimeInternacao || null,
        cid10Principal: input.cid10Principal || null,
        cid10Secundario: input.cid10Secundario || null,
        indicacaoClinica: input.indicacaoClinica || null,
        observacoes: input.observacoes || null,
        tipoServico: input.tipoServico || null,
        status: input.status,
        criadoPor: ctx.user.id,
        criadoPorNome: ctx.user.name || "Sistema",
      });

      return { id: result.insertId };
    }),

  atualizarGuia: protectedProcedure
    .input(z.object({
      id: z.number(),
      nomePaciente: z.string().optional(),
      carteirinha: z.string().optional(),
      dataAtendimento: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      numeroGuiaPrestador: z.string().optional(),
      numeroGuiaOperadora: z.string().optional(),
      senha: z.string().optional(),
      nomeSolicitante: z.string().optional(),
      conselhoProfSolicitante: z.string().optional(),
      numeroConselhoProfSolicitante: z.string().optional(),
      ufConselhoProfSolicitante: z.string().optional(),
      cbosConselhoProfSolicitante: z.string().optional(),
      nomeExecutante: z.string().optional(),
      conselhoProfExecutante: z.string().optional(),
      numeroConselhoProfExecutante: z.string().optional(),
      ufConselhoProfExecutante: z.string().optional(),
      cbosConselhoProfExecutante: z.string().optional(),
      caraterAtendimento: z.enum(["eletivo", "urgencia"]).optional(),
      tipoInternacao: z.string().optional(),
      regimeInternacao: z.string().optional(),
      cid10Principal: z.string().optional(),
      cid10Secundario: z.string().optional(),
      indicacaoClinica: z.string().optional(),
      observacoes: z.string().optional(),
      tipoServico: z.string().optional(),
      status: z.enum(["rascunho", "finalizada"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, ...data } = input;
      const updateData: any = {};
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) updateData[key] = value;
      });
      
      await db.update(guiasFaturamento).set(updateData).where(eq(guiasFaturamento.id, id));
      return { success: true };
    }),

  excluirGuia: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(itensGuiaFaturamento).where(eq(itensGuiaFaturamento.guiaId, input.id));
      await db.delete(guiasFaturamento).where(eq(guiasFaturamento.id, input.id));
      return { success: true };
    }),

  // ========== ITENS DA GUIA ==========
  adicionarItem: protectedProcedure
    .input(z.object({
      guiaId: z.number(),
      tipoItem: z.enum(["procedimento", "material", "medicamento", "taxa", "diaria", "opme", "gases"]),
      codigoTabela: z.string().optional(),
      codigoProcedimento: z.string().min(1),
      descricao: z.string().min(1),
      dataExecucao: z.string().optional(),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      quantidade: z.string().default("1"),
      valorUnitario: z.string().default("0"),
      valorTotal: z.string().default("0"),
      fatorReducao: z.string().optional(),
      viaAcesso: z.string().optional(),
      tecnica: z.string().optional(),
      grauParticipacao: z.string().optional(),
      registroAnvisa: z.string().optional(),
      codigoRefFabricante: z.string().optional(),
      autorizacaoFuncionamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Get next sequencial
      const [maxSeq] = await db.select({ max: sql<number>`COALESCE(MAX(sequencial), 0)` })
        .from(itensGuiaFaturamento)
        .where(eq(itensGuiaFaturamento.guiaId, input.guiaId));
      const sequencial = (Number(maxSeq?.max) || 0) + 1;

      const [result] = await db.insert(itensGuiaFaturamento).values({
        guiaId: input.guiaId,
        sequencial,
        tipoItem: input.tipoItem,
        codigoTabela: input.codigoTabela || null,
        codigoProcedimento: input.codigoProcedimento,
        descricao: input.descricao,
        dataExecucao: input.dataExecucao || null,
        horaInicio: input.horaInicio || null,
        horaFim: input.horaFim || null,
        quantidade: input.quantidade,
        valorUnitario: input.valorUnitario,
        valorTotal: input.valorTotal,
        fatorReducao: input.fatorReducao || "1",
        viaAcesso: input.viaAcesso || null,
        tecnica: input.tecnica || null,
        grauParticipacao: input.grauParticipacao || null,
        registroAnvisa: input.registroAnvisa || null,
        codigoRefFabricante: input.codigoRefFabricante || null,
        autorizacaoFuncionamento: input.autorizacaoFuncionamento || null,
      });

      // Atualizar valor total da guia
      await db.execute(sql`
        UPDATE guias_faturamento 
        SET valor_total = (SELECT COALESCE(SUM(valor_total), 0) FROM itens_guia_faturamento WHERE guia_id = ${input.guiaId})
        WHERE id = ${input.guiaId}
      `);

      return { id: result.insertId, sequencial };
    }),

  removerItem: protectedProcedure
    .input(z.object({ id: z.number(), guiaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(itensGuiaFaturamento).where(eq(itensGuiaFaturamento.id, input.id));
      
      // Atualizar valor total da guia
      await db.execute(sql`
        UPDATE guias_faturamento 
        SET valor_total = (SELECT COALESCE(SUM(valor_total), 0) FROM itens_guia_faturamento WHERE guia_id = ${input.guiaId})
        WHERE id = ${input.guiaId}
      `);

      return { success: true };
    }),

  atualizarItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      guiaId: z.number(),
      codigoTabela: z.string().optional(),
      codigoProcedimento: z.string().optional(),
      descricao: z.string().optional(),
      dataExecucao: z.string().optional(),
      horaInicio: z.string().optional(),
      horaFim: z.string().optional(),
      quantidade: z.string().optional(),
      valorUnitario: z.string().optional(),
      valorTotal: z.string().optional(),
      fatorReducao: z.string().optional(),
      viaAcesso: z.string().optional(),
      tecnica: z.string().optional(),
      grauParticipacao: z.string().optional(),
      registroAnvisa: z.string().optional(),
      codigoRefFabricante: z.string().optional(),
      autorizacaoFuncionamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, guiaId, ...data } = input;
      const updateData: any = {};
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) updateData[key] = value;
      });
      
      await db.update(itensGuiaFaturamento).set(updateData).where(eq(itensGuiaFaturamento.id, id));
      
      // Atualizar valor total da guia
      await db.execute(sql`
        UPDATE guias_faturamento 
        SET valor_total = (SELECT COALESCE(SUM(valor_total), 0) FROM itens_guia_faturamento WHERE guia_id = ${guiaId})
        WHERE id = ${guiaId}
      `);

      return { success: true };
    }),

  // ========== LOTES ==========
  listarLotes: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      convenioId: z.number().optional(),
      status: z.enum(["aberto", "fechado", "enviado"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const conditions: any[] = [];
      if (input.estabelecimentoId) conditions.push(eq(lotesFaturamento.estabelecimentoId, input.estabelecimentoId));
      if (input.convenioId) conditions.push(eq(lotesFaturamento.convenioId, input.convenioId));
      if (input.status) conditions.push(eq(lotesFaturamento.status, input.status));

      return db.select().from(lotesFaturamento)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(lotesFaturamento.createdAt));
    }),

  criarLote: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenioId: z.number(),
      competencia: z.string().optional(),
      formatoExportacao: z.enum(["xml_tiss", "excel_unimed"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const numero = `LF${Date.now()}`;
      
      const [result] = await db.insert(lotesFaturamento).values({
        estabelecimentoId: input.estabelecimentoId,
        convenioId: input.convenioId,
        numeroLote: numero,
        competencia: input.competencia || null,
        formatoExportacao: input.formatoExportacao || null,
        status: "aberto",
        criadoPor: ctx.user.id,
        criadoPorNome: ctx.user.name || "Sistema",
      });

      return { id: result.insertId, numero };
    }),

  adicionarGuiasAoLote: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      guiaIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      for (const guiaId of input.guiaIds) {
        await db.update(guiasFaturamento)
          .set({ loteId: input.loteId, status: "em_lote" })
          .where(eq(guiasFaturamento.id, guiaId));
      }

      // Atualizar totais do lote
      const [totais] = await db.select({
        totalGuias: sql<number>`COUNT(*)`,
        valorTotal: sql<string>`COALESCE(SUM(valor_total), 0)`,
      }).from(guiasFaturamento).where(eq(guiasFaturamento.loteId, input.loteId));

      await db.update(lotesFaturamento).set({
        totalGuias: Number(totais?.totalGuias || 0),
        valorTotal: totais?.valorTotal || "0",
      }).where(eq(lotesFaturamento.id, input.loteId));

      return { success: true };
    }),

  removerGuiaDoLote: protectedProcedure
    .input(z.object({ guiaId: z.number(), loteId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(guiasFaturamento)
        .set({ loteId: null, status: "finalizada" })
        .where(eq(guiasFaturamento.id, input.guiaId));

      // Atualizar totais do lote
      const [totais] = await db.select({
        totalGuias: sql<number>`COUNT(*)`,
        valorTotal: sql<string>`COALESCE(SUM(valor_total), 0)`,
      }).from(guiasFaturamento).where(eq(guiasFaturamento.loteId, input.loteId));

      await db.update(lotesFaturamento).set({
        totalGuias: Number(totais?.totalGuias || 0),
        valorTotal: totais?.valorTotal || "0",
      }).where(eq(lotesFaturamento.id, input.loteId));

      return { success: true };
    }),

  // ========== BUSCA TUSS ==========
  buscarProcedimentoTuss: protectedProcedure
    .input(z.object({ busca: z.string().min(2) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const results = await db.execute(sql`
        SELECT codigo, descricao, valorReferencia as valor_referencia, categoria
        FROM codigosProcedimentos
        WHERE (LOWER(codigo) LIKE ${`%${input.busca.toLowerCase()}%`} OR LOWER(descricao) LIKE ${`%${input.busca.toLowerCase()}%`})
        AND ativo = 'sim'
        LIMIT 20
      `);
      return (results as any)[0] || [];
    }),

  // ========== EXPORTAÇÃO ==========
  gerarXmlTiss: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .mutation(async ({ input }) => {
      const { gerarXmlTissLote } = await import("../faturamentoExportService");
      return gerarXmlTissLote(input.loteId);
    }),

  gerarExcelUnimed: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .mutation(async ({ input }) => {
      const { gerarExcelUnimedForm3061 } = await import("../faturamentoExportService");
      return gerarExcelUnimedForm3061(input.loteId);
    }),

  // ========== BUSCA TABELAS DE PREÇO ==========
  buscarItemTabelaPreco: protectedProcedure
    .input(z.object({
      convenioId: z.number(),
      estabelecimentoId: z.number().optional(),
      tipo: z.enum(["procedimentos", "mat_med", "taxas", "diarias"]).optional(),
      busca: z.string().min(2),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const conditions = [
        sql`convenioId = ${input.convenioId}`,
        sql`ativo = 'sim'`,
        sql`vigenciaInicio <= NOW()`,
        sql`(LOWER(codigo) LIKE ${`%${input.busca.toLowerCase()}%`} OR LOWER(nome) LIKE ${`%${input.busca.toLowerCase()}%`})`,
      ];
      
      if (input.estabelecimentoId) {
        conditions.push(sql`(estabelecimentoId = ${input.estabelecimentoId} OR estabelecimentoId IS NULL)`);
      }
      
      if (input.tipo) {
        conditions.push(sql`tipo = ${input.tipo}`);
      }
      
      const whereClause = sql.join(conditions, sql` AND `);
      
      const results = await db.execute(sql`
        SELECT id, codigo, nome, valor, tipo, unidade
        FROM tabelasPreco
        WHERE ${whereClause}
        ORDER BY nome ASC
        LIMIT ${input.limit}
      `);
      
      return (results as any)[0] || [];
    }),

  obterPrecoItem: protectedProcedure
    .input(z.object({
      convenioId: z.number(),
      codigo: z.string(),
      tipo: z.enum(["procedimentos", "mat_med", "taxas", "diarias"]).optional(),
    }))
    .query(async ({ input }) => {
      const { getPrecoItem } = await import("../db");
      const valor = await getPrecoItem(input.convenioId, input.codigo, input.tipo);
      return { valor };
    }),
});
