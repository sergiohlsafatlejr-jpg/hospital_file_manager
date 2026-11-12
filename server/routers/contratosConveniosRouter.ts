import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, verificarPermissaoEstabelecimento } from "../db";
import {
  contratosConvenios,
  contratosConveniosDocumentos,
  type ContratoConvenioDocumento,
} from "../../drizzle/schema";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  analisarClausulasContratuaisComIA,
  ensureContratosConveniosDocumentosTable,
  executarOcrDocumentoContrato,
  executarOcrDocumentosContrato,
  obterContextoContratualParaGlosa,
  obterUrlDownloadPdfContrato,
  type ContratoConvenioPonto,
} from "../contratosConveniosPdfService";
import {
  aplicarFundamentacaoContratualGlosas,
  auditarCobrancaXmlPorContrato,
  auditarGlosasPorContrato,
  gerarDossieContratualComIA,
  obterDossieContratual,
  sincronizarTabelaValoresDossie,
} from "../contratosConveniosDossieService";

import { operacaoDossieSegura } from "../contratosDossieIssue182Integridade";
function dbObrigatorio(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Banco de dados indisponível.",
    });
  return db;
}

async function contratoAutorizado(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string },
  contratoId: number,
  tipo: "visualizar" | "gerenciar" = "visualizar"
) {
  const [contrato] = await db
    .select()
    .from(contratosConvenios)
    .where(eq(contratosConvenios.id, contratoId))
    .limit(1);
  if (!contrato) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contrato não encontrado.",
    });
  }
  if (
    user.role !== "admin" &&
    !(await verificarPermissaoEstabelecimento(
      user.id,
      contrato.estabelecimentoId,
      tipo
    ))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sem permissão para acessar este contrato.",
    });
  }
  return contrato;
}

function publicarDocumento(documento: ContratoConvenioDocumento) {
  return {
    id: documento.id,
    contratoId: documento.contratoId,
    estabelecimentoId: documento.estabelecimentoId,
    nomeArquivo: documento.nomeArquivo,
    mimeType: documento.mimeType,
    tamanhoBytes: documento.tamanhoBytes,
    sha256: documento.sha256,
    paginas: documento.paginas,
    status: documento.status,
    pontosImportantes: (documento.pontosImportantes ??
      []) as ContratoConvenioPonto[],
    erroProcessamento: documento.erroProcessamento,
    criadoPor: documento.criadoPor,
    createdAt: documento.createdAt,
    updatedAt: documento.updatedAt,
  };
}

export const contratosConveniosRouter = router({
  listar: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = dbObrigatorio(await getDb());
      let query = db.select().from(contratosConvenios);
      if (input.estabelecimentoId) {
        query = query.where(
          eq(contratosConvenios.estabelecimentoId, input.estabelecimentoId)
        ) as any;
      }
      return query.orderBy(desc(contratosConvenios.createdAt));
    }),

  obterBase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = dbObrigatorio(await getDb());
      return contratoAutorizado(db, ctx.user, input.id);
    }),

  listarDocumentos: protectedProcedure
    .input(z.object({ contratoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      await contratoAutorizado(db, ctx.user, input.contratoId);
      const documentos = await db
        .select()
        .from(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.contratoId, input.contratoId))
        .orderBy(desc(contratosConveniosDocumentos.createdAt));
      return documentos.map(publicarDocumento);
    }),

  resumoDocumentos: protectedProcedure
    .input(
      z.object({ contratoIds: z.array(z.number().int().positive()).max(100) })
    )
    .query(async ({ ctx, input }) => {
      if (input.contratoIds.length === 0) return [];
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      const contratos = await db
        .select({
          id: contratosConvenios.id,
          estabelecimentoId: contratosConvenios.estabelecimentoId,
        })
        .from(contratosConvenios)
        .where(inArray(contratosConvenios.id, input.contratoIds));
      const autorizados: number[] = [];
      for (const contrato of contratos) {
        if (
          ctx.user.role === "admin" ||
          (await verificarPermissaoEstabelecimento(
            ctx.user.id,
            contrato.estabelecimentoId,
            "visualizar"
          ))
        ) {
          autorizados.push(contrato.id);
        }
      }
      if (!autorizados.length)
        return input.contratoIds.map(contratoId => ({
          contratoId,
          quantidade: 0,
        }));
      const rows = await db
        .select({
          contratoId: contratosConveniosDocumentos.contratoId,
          quantidade: count(contratosConveniosDocumentos.id),
        })
        .from(contratosConveniosDocumentos)
        .where(inArray(contratosConveniosDocumentos.contratoId, autorizados))
        .groupBy(contratosConveniosDocumentos.contratoId);
      const quantidades = new Map(
        rows.map(row => [row.contratoId, Number(row.quantidade)])
      );
      return input.contratoIds.map(contratoId => ({
        contratoId,
        quantidade: quantidades.get(contratoId) ?? 0,
      }));
    }),

  obterDocumento: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      const [documento] = await db
        .select()
        .from(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.id, input.id))
        .limit(1);
      if (!documento)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento não encontrado.",
        });
      await contratoAutorizado(db, ctx.user, documento.contratoId);
      const downloadUrl = await obterUrlDownloadPdfContrato(
        documento.storageKey,
        documento.id
      );
      return {
        ...publicarDocumento(documento),
        textoExtraido: documento.textoExtraido ?? "",
        downloadUrl,
      };
    }),

  excluirDocumento: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      const [documento] = await db
        .select()
        .from(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.id, input.id))
        .limit(1);
      if (!documento)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento não encontrado.",
        });
      await contratoAutorizado(db, ctx.user, documento.contratoId, "gerenciar");
      await db
        .delete(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.id, input.id));
      return { success: true };
    }),

  obterContextoGlosa: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        convenioId: z.number().int().positive().optional(),
        convenioNome: z.string().optional(),
        codigosProcedimento: z.array(z.string()).max(40).optional(),
        dataReferencia: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (
        ctx.user.role !== "admin" &&
        !(await verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          "visualizar"
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem permissão para consultar contratos desta unidade.",
        });
      }
      return obterContextoContratualParaGlosa(input);
    }),

  reanalisarDocumentoIA: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      const [documento] = await db
        .select()
        .from(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.id, input.id))
        .limit(1);
      if (!documento)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento não encontrado.",
        });
      await contratoAutorizado(db, ctx.user, documento.contratoId, "gerenciar");
      if (
        (documento.status === "ocr_necessario" ||
          (documento.textoExtraido ?? "").trim().length < 80) &&
        typeof executarOcrDocumentoContrato === "function"
      ) {
        const resultadoOcr = await executarOcrDocumentoContrato(documento);
        return {
          success: resultadoOcr.status === "concluido",
          status: resultadoOcr.status,
          textoExtraido: resultadoOcr.textoExtraido,
          pontosImportantes: resultadoOcr.pontosImportantes,
          ocrExecutado: resultadoOcr.ocrExecutado,
          motivo: resultadoOcr.motivo ?? null,
        };
      }
      const novosPontos = await analisarClausulasContratuaisComIA(
        documento.textoExtraido ?? ""
      );
      await db
        .update(contratosConveniosDocumentos)
        .set({ pontosImportantes: novosPontos })
        .where(eq(contratosConveniosDocumentos.id, input.id));
      return {
        success: true,
        status: documento.status,
        textoExtraido: documento.textoExtraido ?? "",
        pontosImportantes: novosPontos,
        ocrExecutado: false,
        motivo: null,
      };
    }),

  executarOcrContrato: protectedProcedure
    .input(z.object({ contratoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureContratosConveniosDocumentosTable();
      const db = dbObrigatorio(await getDb());
      const contrato = await contratoAutorizado(
        db,
        ctx.user,
        input.contratoId,
        "gerenciar"
      );
      return executarOcrDocumentosContrato({
        contratoId: contrato.id,
        estabelecimentoId: contrato.estabelecimentoId,
      });
    }),

  obterDossie: protectedProcedure
    .input(z.object({ contratoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "visualizar");
        return obterDossieContratual(input.contratoId);
      })
    ),

  obterDossiePorConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        convenioId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        if (
          ctx.user.role !== "admin" &&
          !(await verificarPermissaoEstabelecimento(
            ctx.user.id,
            input.estabelecimentoId,
            "visualizar"
          ))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sem permissão para consultar contratos desta unidade.",
          });
        }
        const db = dbObrigatorio(await getDb());
        const conds = [
          eq(contratosConvenios.estabelecimentoId, input.estabelecimentoId),
        ];
        if (input.convenioId) {
          conds.push(eq(contratosConvenios.convenioId, input.convenioId));
        }
        const contratos = await db
          .select()
          .from(contratosConvenios)
          .where(and(...conds))
          .orderBy(desc(contratosConvenios.createdAt))
          .limit(10);
        if (contratos.length === 0) return null;
        const escolhido =
          contratos.find(
            c =>
              c.status === "ativo" ||
              c.status === "vencendo" ||
              c.status === "renovado"
          ) ?? contratos[0];
        return obterDossieContratual(escolhido.id);
      })
    ),

  gerarDossieIA: protectedProcedure
    .input(z.object({ contratoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "gerenciar");
        if (typeof executarOcrDocumentosContrato === "function") {
          await executarOcrDocumentosContrato({
            contratoId: input.contratoId,
          }).catch(() => undefined);
        }
        return gerarDossieContratualComIA(input.contratoId);
      })
    ),

  sincronizarTabelaDossie: protectedProcedure
    .input(z.object({ contratoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "gerenciar");
        return sincronizarTabelaValoresDossie({ contratoId: input.contratoId });
      })
    ),

  auditarCobrancaXml: protectedProcedure
    .input(
      z.object({
        contratoId: z.number().int().positive(),
        competencia: z.string().optional(),
        loteXml: z.string().optional(),
        limit: z.number().int().min(10).max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "visualizar");
        return auditarCobrancaXmlPorContrato(input);
      })
    ),

  auditarGlosasContrato: protectedProcedure
    .input(
      z.object({
        contratoId: z.number().int().positive(),
        competencia: z.string().optional(),
        limit: z.number().int().min(10).max(400).optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "visualizar");
        return auditarGlosasPorContrato(input);
      })
    ),

  aplicarFundamentacaoGlosas: protectedProcedure
    .input(
      z.object({
        contratoId: z.number().int().positive(),
        itens: z
          .array(
            z.object({
              id: z.number().int().positive(),
              origem: z.enum(["demonstrativo", "conciliacao"]),
              justificativa: z.string().min(5),
              valorRecurso: z.number().min(0),
            })
          )
          .max(200),
      })
    )
    .mutation(async ({ ctx, input }) =>
      operacaoDossieSegura(async () => {
        const db = dbObrigatorio(await getDb());
        await contratoAutorizado(db, ctx.user, input.contratoId, "gerenciar");
        return aplicarFundamentacaoContratualGlosas(input);
      })
    ),

  criar: protectedProcedure
    .input(
      z.object({
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
        status: z
          .enum(["ativo", "vencendo", "vencido", "inativo", "renovado"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "admin" &&
        !(await verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          "gerenciar"
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem permissão para cadastrar contratos nesta unidade.",
        });
      }
      const db = dbObrigatorio(await getDb());
      const [insertResult] = await db.insert(contratosConvenios).values({
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
        dataEnvioProposta: input.dataEnvioProposta
          ? new Date(input.dataEnvioProposta)
          : null,
        status: input.status,
      });
      return {
        success: true,
        id: Number((insertResult as any)?.insertId ?? 0),
      };
    }),

  atualizar: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        numeroContrato: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        status: z
          .enum(["ativo", "vencendo", "vencido", "inativo", "renovado"])
          .optional(),
        observacoes: z.string().optional(),
        emailContato: z.string().optional(),
        reajusteProposto: z.coerce.number().optional(),
        modeloEmailProposta: z.string().optional(),
        dataEnvioProposta: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbObrigatorio(await getDb());
      const contrato = await contratoAutorizado(
        db,
        ctx.user,
        input.id,
        "gerenciar"
      );
      const updateData: any = {};
      if (input.numeroContrato !== undefined)
        updateData.numeroContrato = input.numeroContrato;
      if (input.dataInicio !== undefined)
        updateData.dataInicio = input.dataInicio
          ? new Date(input.dataInicio)
          : null;
      if (input.dataFim !== undefined)
        updateData.dataFim = input.dataFim ? new Date(input.dataFim) : null;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.observacoes !== undefined)
        updateData.observacoes = input.observacoes;
      if (input.emailContato !== undefined)
        updateData.emailContato = input.emailContato;
      if (input.reajusteProposto !== undefined)
        updateData.reajusteProposto = input.reajusteProposto.toString() as any;
      if (input.modeloEmailProposta !== undefined)
        updateData.modeloEmailProposta = input.modeloEmailProposta;
      if (input.dataEnvioProposta !== undefined)
        updateData.dataEnvioProposta = input.dataEnvioProposta
          ? new Date(input.dataEnvioProposta)
          : null;
      await db
        .update(contratosConvenios)
        .set(updateData)
        .where(
          and(
            eq(contratosConvenios.id, input.id),
            eq(contratosConvenios.estabelecimentoId, contrato.estabelecimentoId)
          )
        );
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = dbObrigatorio(await getDb());
      const contrato = await contratoAutorizado(
        db,
        ctx.user,
        input.id,
        "gerenciar"
      );
      await db
        .delete(contratosConvenios)
        .where(
          and(
            eq(contratosConvenios.id, input.id),
            eq(contratosConvenios.estabelecimentoId, contrato.estabelecimentoId)
          )
        );
      return { success: true };
    }),
});
