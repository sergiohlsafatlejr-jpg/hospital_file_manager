import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { falhasProntuario, ajustesAuditoria, aprendizadoAuditoria, feedbackDivergencias, contasConvenioItens, contasConvenioResumo } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "../_core/logger";

// Categorias de falhas de prontuário com seus tipos comuns
const CATEGORIAS_FALHAS: Record<string, { label: string; falhas: string[] }> = {
  EVOLUCAO: {
    label: "Evolução Médica",
    falhas: [
      "Evolução médica ausente",
      "Evolução médica incompleta",
      "Evolução médica sem data/hora",
      "Evolução médica sem assinatura/carimbo",
      "Evolução não condiz com procedimento realizado",
    ],
  },
  PRESCRICAO: {
    label: "Prescrição Médica",
    falhas: [
      "Prescrição médica ausente",
      "Prescrição médica ilegível",
      "Prescrição sem data/hora",
      "Prescrição sem assinatura/carimbo",
      "Medicamento prescrito sem dose/via/frequência",
      "Prescrição divergente do que foi cobrado",
    ],
  },
  CHECAGEM: {
    label: "Checagem de Enfermagem",
    falhas: [
      "Checagem de enfermagem ausente",
      "Checagem incompleta",
      "Checagem sem horário",
      "Checagem sem identificação do profissional",
      "Medicamento checado mas não prescrito",
    ],
  },
  AUTORIZACAO: {
    label: "Autorização/Guia",
    falhas: [
      "Guia de autorização ausente",
      "Guia de autorização vencida",
      "Procedimento não autorizado na guia",
      "Quantidade autorizada divergente",
      "Guia sem assinatura do beneficiário",
    ],
  },
  DOCUMENTACAO: {
    label: "Documentação Geral",
    falhas: [
      "Laudo/relatório médico ausente",
      "Relatório cirúrgico ausente",
      "Ficha de anestesia ausente",
      "Boletim de sala ausente",
      "Folha de gastos ausente ou incompleta",
    ],
  },
  IDENTIFICACAO: {
    label: "Identificação do Paciente",
    falhas: [
      "Dados do paciente incompletos",
      "Carteirinha do convênio não confere",
      "Nome divergente entre documentos",
      "Data de nascimento divergente",
    ],
  },
  CONSENTIMENTO: {
    label: "Termo de Consentimento",
    falhas: [
      "Termo de consentimento ausente",
      "Termo de consentimento sem assinatura",
      "Termo de consentimento incompleto",
    ],
  },
  ALERGIA: {
    label: "Registro de Alergia",
    falhas: [
      "Registro de alergia ausente",
      "Alergia não sinalizada no prontuário",
    ],
  },
  ALTA: {
    label: "Alta/Sumário",
    falhas: [
      "Sumário de alta ausente",
      "Sumário de alta incompleto",
      "Alta sem orientações ao paciente",
      "Alta sem prescrição domiciliar",
    ],
  },
  OUTRO: {
    label: "Outros",
    falhas: [
      "Outro (especificar na observação)",
    ],
  },
};

/**
 * Motor de Aprendizado - Atualiza a base de conhecimento a partir das ações
 */
async function atualizarAprendizado(
  db: any,
  params: {
    estabelecimentoId: number;
    tipoAprendizado: "FALHA_PRONTUARIO" | "AJUSTE_QUANTIDADE" | "AJUSTE_VALOR" | "ITEM_FALTANTE" | "DECISAO_DIVERGENCIA";
    convenio?: string | null;
    tipoProcedimento?: string | null;
    codigoItem?: string | null;
    descricaoItem?: string | null;
    setor?: string | null;
    dadosAprendizado: any;
  }
) {
  try {
    const existentes = await db
      .select()
      .from(aprendizadoAuditoria)
      .where(and(
        eq(aprendizadoAuditoria.estabelecimentoId, params.estabelecimentoId),
        eq(aprendizadoAuditoria.tipoAprendizado, params.tipoAprendizado),
        params.codigoItem
          ? eq(aprendizadoAuditoria.codigoItem, params.codigoItem)
          : sql`${aprendizadoAuditoria.codigoItem} IS NULL`,
        params.convenio
          ? eq(aprendizadoAuditoria.convenio, params.convenio)
          : sql`${aprendizadoAuditoria.convenio} IS NULL`,
      ))
      .limit(1);

    if (existentes.length > 0) {
      const existente = existentes[0];
      const totalOcorrencias = (existente.totalOcorrencias || 0) + 1;
      const novaConfianca = Math.min(0.99, 0.50 + (totalOcorrencias * 0.05));
      const dadosExistentes = existente.dadosAprendizado || {};
      const dadosMerge = { ...dadosExistentes, ...params.dadosAprendizado, totalOcorrencias };

      await db.update(aprendizadoAuditoria)
        .set({
          totalOcorrencias,
          confianca: novaConfianca.toFixed(2),
          dadosAprendizado: dadosMerge,
          ultimaAtualizacao: new Date(),
        })
        .where(eq(aprendizadoAuditoria.id, existente.id));
    } else {
      await db.insert(aprendizadoAuditoria).values({
        estabelecimentoId: params.estabelecimentoId,
        tipoAprendizado: params.tipoAprendizado,
        convenio: params.convenio || null,
        tipoProcedimento: params.tipoProcedimento || null,
        codigoItem: params.codigoItem || null,
        descricaoItem: params.descricaoItem || null,
        setor: params.setor || null,
        dadosAprendizado: params.dadosAprendizado,
        totalOcorrencias: 1,
        confianca: "0.50",
        ativo: 1,
        minimoOcorrencias: 3,
        ultimaAtualizacao: new Date(),
      });
    }
  } catch (err) {
    logger.error({ message: "Erro ao atualizar aprendizado", error: err });
  }
}

export const auditoriaRouter = router({

  // ============================================================
  // CATEGORIAS DE FALHAS
  // ============================================================
  categoriasFalhas: protectedProcedure.query(() => CATEGORIAS_FALHAS),

  // ============================================================
  // FALHAS DE PRONTUÁRIO
  // ============================================================
  registrarFalha: protectedProcedure
    .input(z.object({
      numeroConta: z.string().min(1),
      estabelecimentoId: z.number(),
      tipoFalha: z.string().min(1),
      categoriaFalha: z.string().min(1),
      descricao: z.string().optional(),
      severidade: z.enum(["leve", "moderada", "grave", "critica"]).default("moderada"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      await db.insert(falhasProntuario).values({
        numeroConta: input.numeroConta,
        estabelecimentoId: input.estabelecimentoId,
        tipoFalha: input.tipoFalha,
        categoriaFalha: input.categoriaFalha,
        descricao: input.descricao || null,
        severidade: input.severidade,
        status: "aberta",
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "Desconhecido",
      });

      const [resumo] = await db.select().from(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.numeroConta, input.numeroConta),
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
        )
      ).limit(1);

      await atualizarAprendizado(db, {
        estabelecimentoId: input.estabelecimentoId,
        tipoAprendizado: "FALHA_PRONTUARIO",
        convenio: resumo?.convenio || null,
        dadosAprendizado: {
          tipoFalha: input.tipoFalha,
          categoriaFalha: input.categoriaFalha,
          severidade: input.severidade,
        },
      });

      return { sucesso: true };
    }),

  listarFalhas: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      return await db.select().from(falhasProntuario).where(
        and(
          eq(falhasProntuario.numeroConta, input.numeroConta),
          eq(falhasProntuario.estabelecimentoId, input.estabelecimentoId),
        )
      ).orderBy(desc(falhasProntuario.createdAt));
    }),

  atualizarStatusFalha: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["aberta", "corrigida", "justificada"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      await db.update(falhasProntuario)
        .set({ status: input.status })
        .where(eq(falhasProntuario.id, input.id));
      return { sucesso: true };
    }),

  removerFalha: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      await db.delete(falhasProntuario).where(eq(falhasProntuario.id, input.id));
      return { sucesso: true };
    }),

  // ============================================================
  // AJUSTES DE AUDITORIA
  // ============================================================
  registrarAjuste: protectedProcedure
    .input(z.object({
      numeroConta: z.string().min(1),
      estabelecimentoId: z.number(),
      tipoAjuste: z.enum(["ALTERAR_QUANTIDADE", "ALTERAR_VALOR", "ADICIONAR_ITEM", "REMOVER_ITEM", "ALTERAR_SETOR"]),
      itemId: z.number().optional(),
      codigoItem: z.string().optional(),
      descricaoItem: z.string().optional(),
      quantidadeOriginal: z.string().optional(),
      valorOriginal: z.string().optional(),
      quantidadeAjustada: z.string().optional(),
      valorAjustado: z.string().optional(),
      tipoItemAdicionado: z.string().optional(),
      setorOriginal: z.string().optional(),
      setorAjustado: z.string().optional(),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      await db.insert(ajustesAuditoria).values({
        numeroConta: input.numeroConta,
        estabelecimentoId: input.estabelecimentoId,
        tipoAjuste: input.tipoAjuste,
        itemId: input.itemId || null,
        codigoItem: input.codigoItem || null,
        descricaoItem: input.descricaoItem || null,
        quantidadeOriginal: input.quantidadeOriginal || null,
        valorOriginal: input.valorOriginal || null,
        quantidadeAjustada: input.quantidadeAjustada || null,
        valorAjustado: input.valorAjustado || null,
        tipoItemAdicionado: input.tipoItemAdicionado || null,
        setorOriginal: input.setorOriginal || null,
        setorAjustado: input.setorAjustado || null,
        justificativa: input.justificativa || null,
        status: "pendente",
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "Desconhecido",
      });

      // Aplicar ajuste no item
      if (input.itemId && (input.tipoAjuste === "ALTERAR_QUANTIDADE" || input.tipoAjuste === "ALTERAR_VALOR")) {
        const updateData: any = {};
        if (input.tipoAjuste === "ALTERAR_QUANTIDADE" && input.quantidadeAjustada) {
          updateData.quantidade = input.quantidadeAjustada;
          const [item] = await db.select().from(contasConvenioItens).where(eq(contasConvenioItens.id, input.itemId)).limit(1);
          if (item?.valorUnitario) {
            updateData.valorTotal = (parseFloat(input.quantidadeAjustada) * parseFloat(item.valorUnitario)).toFixed(2);
          }
        }
        if (input.tipoAjuste === "ALTERAR_VALOR" && input.valorAjustado) {
          updateData.valorUnitario = input.valorAjustado;
          const [item] = await db.select().from(contasConvenioItens).where(eq(contasConvenioItens.id, input.itemId)).limit(1);
          if (item?.quantidade) {
            updateData.valorTotal = (parseFloat(item.quantidade) * parseFloat(input.valorAjustado)).toFixed(2);
          }
        }
        if (Object.keys(updateData).length > 0) {
          updateData.statusAnalise = "revisado";
          await db.update(contasConvenioItens).set(updateData).where(eq(contasConvenioItens.id, input.itemId));
        }
        // Marcar como aplicado
        const [ajuste] = await db.select({ id: ajustesAuditoria.id }).from(ajustesAuditoria)
          .orderBy(desc(ajustesAuditoria.id)).limit(1);
        if (ajuste) {
          await db.update(ajustesAuditoria).set({ status: "aplicado" }).where(eq(ajustesAuditoria.id, ajuste.id));
        }
      }

      // Alterar setor
      if (input.tipoAjuste === "ALTERAR_SETOR" && input.itemId && input.setorAjustado) {
        await db.update(contasConvenioItens).set({
          setor: input.setorAjustado,
          statusAnalise: "revisado",
        }).where(eq(contasConvenioItens.id, input.itemId));
        // Marcar como aplicado
        const [ajuste] = await db.select({ id: ajustesAuditoria.id }).from(ajustesAuditoria)
          .orderBy(desc(ajustesAuditoria.id)).limit(1);
        if (ajuste) {
          await db.update(ajustesAuditoria).set({ status: "aplicado" }).where(eq(ajustesAuditoria.id, ajuste.id));
        }
      }

      // Adicionar novo item
      if (input.tipoAjuste === "ADICIONAR_ITEM") {
        const [resumo] = await db.select().from(contasConvenioResumo).where(
          and(
            eq(contasConvenioResumo.numeroConta, input.numeroConta),
            eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
          )
        ).limit(1);

        await db.insert(contasConvenioItens).values({
          origem: "BANCO_CLIENTE",
          numeroConta: input.numeroConta,
          estabelecimentoId: input.estabelecimentoId,
          convenio: resumo?.convenio || null,
          convenioId: resumo?.convenioId || null,
          tipoItem: input.tipoItemAdicionado || "PROCEDIMENTO",
          codigoItem: input.codigoItem || null,
          descricaoItem: input.descricaoItem || null,
          quantidade: input.quantidadeAjustada || "1",
          valorUnitario: input.valorAjustado || "0",
          valorTotal: input.quantidadeAjustada && input.valorAjustado
            ? (parseFloat(input.quantidadeAjustada) * parseFloat(input.valorAjustado)).toFixed(2)
            : "0",
          statusAnalise: "revisado",
        });

        if (resumo) {
          const valorAdicional = input.quantidadeAjustada && input.valorAjustado
            ? parseFloat(input.quantidadeAjustada) * parseFloat(input.valorAjustado) : 0;
          await db.update(contasConvenioResumo).set({
            totalItens: (resumo.totalItens || 0) + 1,
            valorTotal: ((parseFloat(resumo.valorTotal || "0")) + valorAdicional).toFixed(2),
          }).where(eq(contasConvenioResumo.id, resumo.id));
        }

        const [ajuste] = await db.select({ id: ajustesAuditoria.id }).from(ajustesAuditoria)
          .orderBy(desc(ajustesAuditoria.id)).limit(1);
        if (ajuste) {
          await db.update(ajustesAuditoria).set({ status: "aplicado" }).where(eq(ajustesAuditoria.id, ajuste.id));
        }
      }

      // Alimentar aprendizado
      const tipoAprendizado = input.tipoAjuste === "ADICIONAR_ITEM" ? "ITEM_FALTANTE" as const
        : input.tipoAjuste === "ALTERAR_QUANTIDADE" ? "AJUSTE_QUANTIDADE" as const
        : "AJUSTE_VALOR" as const;

      const [resumoConta] = await db.select().from(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.numeroConta, input.numeroConta),
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
        )
      ).limit(1);

      await atualizarAprendizado(db, {
        estabelecimentoId: input.estabelecimentoId,
        tipoAprendizado,
        convenio: resumoConta?.convenio || null,
        codigoItem: input.codigoItem || null,
        descricaoItem: input.descricaoItem || null,
        dadosAprendizado: {
          tipoAjuste: input.tipoAjuste,
          quantidadeOriginal: input.quantidadeOriginal,
          quantidadeAjustada: input.quantidadeAjustada,
          valorOriginal: input.valorOriginal,
          valorAjustado: input.valorAjustado,
          direcao: input.quantidadeAjustada && input.quantidadeOriginal
            ? parseFloat(input.quantidadeAjustada) > parseFloat(input.quantidadeOriginal) ? "aumentar" : "diminuir"
            : null,
        },
      });

      return { sucesso: true };
    }),

  listarAjustes: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      return await db.select().from(ajustesAuditoria).where(
        and(
          eq(ajustesAuditoria.numeroConta, input.numeroConta),
          eq(ajustesAuditoria.estabelecimentoId, input.estabelecimentoId),
        )
      ).orderBy(desc(ajustesAuditoria.createdAt));
    }),

  reverterAjuste: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      const [ajuste] = await db.select().from(ajustesAuditoria).where(eq(ajustesAuditoria.id, input.id)).limit(1);
      if (!ajuste) throw new TRPCError({ code: "NOT_FOUND", message: "Ajuste não encontrado" });

      if (ajuste.itemId && ajuste.status === "aplicado") {
        const updateData: any = { statusAnalise: "pendente" };
        if (ajuste.tipoAjuste === "ALTERAR_QUANTIDADE" && ajuste.quantidadeOriginal) {
          updateData.quantidade = ajuste.quantidadeOriginal;
          const [item] = await db.select().from(contasConvenioItens).where(eq(contasConvenioItens.id, ajuste.itemId)).limit(1);
          if (item?.valorUnitario) {
            updateData.valorTotal = (parseFloat(ajuste.quantidadeOriginal) * parseFloat(item.valorUnitario)).toFixed(2);
          }
        }
        if (ajuste.tipoAjuste === "ALTERAR_VALOR" && ajuste.valorOriginal) {
          updateData.valorUnitario = ajuste.valorOriginal;
          const [item] = await db.select().from(contasConvenioItens).where(eq(contasConvenioItens.id, ajuste.itemId)).limit(1);
          if (item?.quantidade) {
            updateData.valorTotal = (parseFloat(item.quantidade) * parseFloat(ajuste.valorOriginal)).toFixed(2);
          }
        }
        if (ajuste.tipoAjuste === "ALTERAR_SETOR" && ajuste.setorOriginal !== undefined) {
          updateData.setor = ajuste.setorOriginal;
        }
        await db.update(contasConvenioItens).set(updateData).where(eq(contasConvenioItens.id, ajuste.itemId));
      }

      await db.update(ajustesAuditoria).set({ status: "revertido" }).where(eq(ajustesAuditoria.id, input.id));
      return { sucesso: true };
    }),

  // ============================================================
  // SUGESTÕES INTELIGENTES
  // ============================================================
  sugestoesFalhas: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      convenio: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [
        eq(aprendizadoAuditoria.estabelecimentoId, input.estabelecimentoId),
        eq(aprendizadoAuditoria.tipoAprendizado, "FALHA_PRONTUARIO"),
        eq(aprendizadoAuditoria.ativo, 1),
      ];
      if (input.convenio) {
        conditions.push(eq(aprendizadoAuditoria.convenio, input.convenio));
      }

      const sugestoes = await db.select().from(aprendizadoAuditoria)
        .where(and(...conditions))
        .orderBy(desc(aprendizadoAuditoria.totalOcorrencias))
        .limit(10);

      return sugestoes.filter((s: any) => s.totalOcorrencias >= (s.minimoOcorrencias || 3));
    }),

  sugestoesAjustes: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      codigoItem: z.string().optional(),
      convenio: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [
        eq(aprendizadoAuditoria.estabelecimentoId, input.estabelecimentoId),
        eq(aprendizadoAuditoria.ativo, 1),
      ];
      if (input.codigoItem) {
        conditions.push(eq(aprendizadoAuditoria.codigoItem, input.codigoItem));
      }
      if (input.convenio) {
        conditions.push(eq(aprendizadoAuditoria.convenio, input.convenio));
      }

      const sugestoes = await db.select().from(aprendizadoAuditoria)
        .where(and(...conditions))
        .orderBy(desc(aprendizadoAuditoria.confianca))
        .limit(20);

      return sugestoes.filter((s: any) => s.totalOcorrencias >= (s.minimoOcorrencias || 3));
    }),

  // ============================================================
  // DASHBOARD CONSOLIDADO
  // ============================================================
  dashboardAuditoria: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      const dataInicio = input.dataInicio ? new Date(input.dataInicio) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dataFim = input.dataFim ? new Date(input.dataFim) : new Date();

      const [contasAuditadas] = await db.execute(sql`
        SELECT COUNT(DISTINCT numeroConta) as total
        FROM feedback_divergencias
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
      `) as any[];

      const feedbacksPorDecisao = await db.execute(sql`
        SELECT decisao, COUNT(*) as total
        FROM feedback_divergencias
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        GROUP BY decisao
      `) as any[];

      const [totalFalhas] = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM falhas_prontuario
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
      `) as any[];

      const falhasPorCategoria = await db.execute(sql`
        SELECT categoriaFalha, COUNT(*) as total
        FROM falhas_prontuario
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        GROUP BY categoriaFalha ORDER BY total DESC
      `) as any[];

      const [totalAjustes] = await db.execute(sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN tipoAjuste = 'ALTERAR_QUANTIDADE' THEN 1 ELSE 0 END) as alteracoesQtd,
          SUM(CASE WHEN tipoAjuste = 'ALTERAR_VALOR' THEN 1 ELSE 0 END) as alteracoesValor,
          SUM(CASE WHEN tipoAjuste = 'ADICIONAR_ITEM' THEN 1 ELSE 0 END) as itensAdicionados,
          SUM(CASE WHEN tipoAjuste = 'REMOVER_ITEM' THEN 1 ELSE 0 END) as itensRemovidos
        FROM ajustes_auditoria
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
      `) as any[];

      const auditoresAtivos = await db.execute(sql`
        SELECT usuarioNome, COUNT(*) as totalAcoes FROM (
          SELECT usuarioNome, createdAt FROM feedback_divergencias
          WHERE estabelecimentoId = ${input.estabelecimentoId}
            AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
          UNION ALL
          SELECT usuarioNome, createdAt FROM falhas_prontuario
          WHERE estabelecimentoId = ${input.estabelecimentoId}
            AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
          UNION ALL
          SELECT usuarioNome, createdAt FROM ajustes_auditoria
          WHERE estabelecimentoId = ${input.estabelecimentoId}
            AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        ) AS acoes GROUP BY usuarioNome ORDER BY totalAcoes DESC LIMIT 10
      `) as any[];

      const evolucaoDiaria = await db.execute(sql`
        SELECT DATE(createdAt) as data, COUNT(*) as total
        FROM feedback_divergencias
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        GROUP BY DATE(createdAt) ORDER BY data ASC
      `) as any[];

      const [totalAprendizados] = await db.execute(sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN totalOcorrencias >= minimoOcorrencias THEN 1 ELSE 0 END) as prontos
        FROM aprendizado_auditoria
        WHERE estabelecimentoId = ${input.estabelecimentoId} AND ativo = 1
      `) as any[];

      const topFalhas = await db.execute(sql`
        SELECT tipoFalha, categoriaFalha, COUNT(*) as total
        FROM falhas_prontuario
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        GROUP BY tipoFalha, categoriaFalha ORDER BY total DESC LIMIT 10
      `) as any[];

      const topAjustes = await db.execute(sql`
        SELECT codigoItem, descricaoItem, tipoAjuste, COUNT(*) as total
        FROM ajustes_auditoria
        WHERE estabelecimentoId = ${input.estabelecimentoId}
          AND createdAt >= ${dataInicio} AND createdAt <= ${dataFim}
        GROUP BY codigoItem, descricaoItem, tipoAjuste ORDER BY total DESC LIMIT 10
      `) as any[];

      return {
        contasAuditadas: Number((contasAuditadas as any)?.total || 0),
        feedbacks: {
          total: (feedbacksPorDecisao as any[]).reduce((sum: number, f: any) => sum + Number(f.total), 0),
          aceitar: Number((feedbacksPorDecisao as any[]).find((f: any) => f.decisao === "aceitar")?.total || 0),
          rejeitar: Number((feedbacksPorDecisao as any[]).find((f: any) => f.decisao === "rejeitar")?.total || 0),
          ignorar: Number((feedbacksPorDecisao as any[]).find((f: any) => f.decisao === "ignorar")?.total || 0),
        },
        falhas: { total: Number((totalFalhas as any)?.total || 0), porCategoria: falhasPorCategoria, topFalhas },
        ajustes: {
          total: Number((totalAjustes as any)?.total || 0),
          alteracoesQtd: Number((totalAjustes as any)?.alteracoesQtd || 0),
          alteracoesValor: Number((totalAjustes as any)?.alteracoesValor || 0),
          itensAdicionados: Number((totalAjustes as any)?.itensAdicionados || 0),
          itensRemovidos: Number((totalAjustes as any)?.itensRemovidos || 0),
          topAjustes,
        },
        auditoresAtivos,
        evolucaoDiaria,
        aprendizado: {
          totalPadroes: Number((totalAprendizados as any)?.total || 0),
          padroesAtivos: Number((totalAprendizados as any)?.prontos || 0),
        },
      };
    }),

  // ============================================================
  // GESTÃO DO APRENDIZADO
  // ============================================================
  listarAprendizados: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      tipo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [eq(aprendizadoAuditoria.estabelecimentoId, input.estabelecimentoId)];
      if (input.tipo) {
        conditions.push(eq(aprendizadoAuditoria.tipoAprendizado, input.tipo as any));
      }

      return await db.select().from(aprendizadoAuditoria)
        .where(and(...conditions))
        .orderBy(desc(aprendizadoAuditoria.totalOcorrencias))
        .limit(100);
    }),

  toggleAprendizado: protectedProcedure
    .input(z.object({ id: z.number(), ativo: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      await db.update(aprendizadoAuditoria)
        .set({ ativo: input.ativo ? 1 : 0 })
        .where(eq(aprendizadoAuditoria.id, input.id));
      return { sucesso: true };
    }),
});

export async function auditoriaFallback(procedure: string, input: any, ctx: any): Promise<any> {
  throw new Error(`Procedure ${procedure} não implementada em módulo auditoria`);
}
