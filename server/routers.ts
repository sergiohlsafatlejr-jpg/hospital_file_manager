import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { storagePut, storageGet } from "./storage";
import { parseFile, toProcedimentoInsert } from "./parsers";
import { compararProcedimentos, toDivergenciaInsert, gerarResumoComparacao } from "./comparador";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ CONVENIOS ============
  convenios: router({
    list: protectedProcedure
      .input(z.object({ ativo: z.enum(["sim", "nao"]).optional() }).optional())
      .query(async ({ input }) => {
        return db.getConvenios(input?.ativo);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getConvenioById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          nome: z.string().min(1),
          codigo: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createConvenio({
          nome: input.nome,
          codigo: input.codigo || null,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().optional(),
          codigo: z.string().optional(),
          ativo: z.enum(["sim", "nao"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateConvenio(id, data);
        return { success: true };
      }),
  }),

  // ============ ESTABELECIMENTOS ============
  estabelecimentos: router({
    list: protectedProcedure
      .input(z.object({ ativo: z.enum(["sim", "nao"]).optional() }).optional())
      .query(async ({ input }) => {
        return db.getEstabelecimentos(input?.ativo);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getEstabelecimentoById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          nome: z.string().min(1),
          cnpj: z.string().optional(),
          endereco: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createEstabelecimento({
          nome: input.nome,
          cnpj: input.cnpj || null,
          endereco: input.endereco || null,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().optional(),
          cnpj: z.string().optional(),
          endereco: z.string().optional(),
          ativo: z.enum(["sim", "nao"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateEstabelecimento(id, data);
        return { success: true };
      }),
  }),

  // ============ ARQUIVOS ============
  arquivos: router({
    list: protectedProcedure
      .input(
        z
          .object({
            convenioId: z.number().optional(),
            direcao: z.enum(["enviado", "retornado"]).optional(),
            tipoArquivo: z.enum(["xml", "excel", "pdf"]).optional(),
            status: z.enum(["pendente", "processado", "erro"]).optional(),
            dataInicio: z.string().optional(),
            dataFim: z.string().optional(),
            busca: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getArquivos({
          ...input,
          userId: ctx.user.id,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getArquivoById(input.id);
      }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      return db.getArquivosStats(ctx.user.id);
    }),

    upload: protectedProcedure
      .input(
        z.object({
          nome: z.string(),
          tipoArquivo: z.enum(["xml", "excel", "pdf"]),
          direcao: z.enum(["enviado", "retornado"]),
          convenioId: z.number(),
          conteudo: z.string(), // Base64 encoded
          dataReferencia: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Decode base64 content
        const buffer = Buffer.from(input.conteudo, "base64");
        
        // Generate unique S3 key
        const ext = input.tipoArquivo === "excel" ? "xlsx" : input.tipoArquivo;
        const s3Key = `arquivos/${ctx.user.id}/${nanoid()}-${input.nome}.${ext}`;
        
        // Upload to S3
        const contentType =
          input.tipoArquivo === "xml"
            ? "application/xml"
            : input.tipoArquivo === "excel"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf";
        
        const { url } = await storagePut(s3Key, buffer, contentType);
        
        // Create arquivo record
        const { id: arquivoId } = await db.createArquivo({
          nome: input.nome,
          tipoArquivo: input.tipoArquivo,
          direcao: input.direcao,
          convenioId: input.convenioId,
          userId: ctx.user.id,
          s3Key,
          s3Url: url,
          tamanho: buffer.length,
          status: "pendente",
          dataReferencia: input.dataReferencia ? new Date(input.dataReferencia) : null,
        });
        
        // Parse file and extract procedimentos
        try {
          console.log('[Upload] Parsing file:', input.nome);
          const parseResult = await parseFile(buffer, input.nome);
          
          console.log('[Upload] Parse result:', {
            success: parseResult.success,
            procedimentosCount: parseResult.procedimentos.length,
            comMedico: parseResult.procedimentos.filter(p => p.nomeMedico).length
          });
          
          if (parseResult.success && parseResult.procedimentos.length > 0) {
            const procedimentosToInsert = parseResult.procedimentos.map((p) =>
              toProcedimentoInsert(p, arquivoId)
            );
            
            // Log procedimentos com médico
            const comMedico = procedimentosToInsert.filter(p => p.nomeMedico);
            console.log('[Upload] Procedimentos com médico a inserir:', comMedico.length);
            if (comMedico.length > 0) {
              console.log('[Upload] Primeiro com médico:', {
                codigo: comMedico[0].codigo,
                nomeMedico: comMedico[0].nomeMedico,
                crmMedico: comMedico[0].crmMedico
              });
            }
            
            await db.createProcedimentos(procedimentosToInsert);
            await db.updateArquivoStatus(arquivoId, "processado");
          } else if (!parseResult.success) {
            await db.updateArquivoStatus(arquivoId, "erro");
          } else {
            await db.updateArquivoStatus(arquivoId, "processado");
          }
        } catch (error) {
          console.error("Error parsing file:", error);
          await db.updateArquivoStatus(arquivoId, "erro");
        }
        
        return { id: arquivoId, s3Url: url };
      }),

    procedimentos: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .query(async ({ input }) => {
        return db.getProcedimentosByArquivoId(input.arquivoId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Verify the file belongs to the user
        const arquivo = await db.getArquivoById(input.id);
        if (!arquivo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
        }
        if (arquivo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para excluir este arquivo" });
        }
        
        // Delete associated procedimentos first
        await db.deleteProcedimentosByArquivoId(input.id);
        
        // Delete the arquivo record
        await db.deleteArquivo(input.id);
        
        return { success: true };
      }),

    reprocessar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Get the arquivo
        const arquivo = await db.getArquivoById(input.id);
        if (!arquivo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
        }
        if (arquivo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para reprocessar este arquivo" });
        }
        
        // Delete existing procedimentos
        await db.deleteProcedimentosByArquivoId(input.id);
        
        // Download file from S3
        const response = await fetch(arquivo.s3Url);
        if (!response.ok) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao baixar arquivo do S3" });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Parse file and extract procedimentos
        try {
          console.log('[Reprocessar] Parsing file:', arquivo.nome);
          const parseResult = await parseFile(buffer, arquivo.nome);
          
          console.log('[Reprocessar] Parse result:', {
            success: parseResult.success,
            procedimentosCount: parseResult.procedimentos.length,
          });
          
          if (parseResult.success && parseResult.procedimentos.length > 0) {
            const procedimentosToInsert = parseResult.procedimentos.map((p) =>
              toProcedimentoInsert(p, input.id)
            );
            
            await db.createProcedimentos(procedimentosToInsert);
            await db.updateArquivoStatus(input.id, "processado");
            
            return { 
              success: true, 
              procedimentosCount: procedimentosToInsert.length,
              message: `Arquivo reprocessado com sucesso. ${procedimentosToInsert.length} procedimentos extraídos.`
            };
          } else if (!parseResult.success) {
            await db.updateArquivoStatus(input.id, "erro");
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: parseResult.error || "Erro ao processar arquivo" });
          } else {
            await db.updateArquivoStatus(input.id, "processado");
            return { 
              success: true, 
              procedimentosCount: 0,
              message: "Arquivo processado, mas nenhum procedimento encontrado."
            };
          }
        } catch (error) {
          console.error("Error reprocessing file:", error);
          await db.updateArquivoStatus(input.id, "erro");
          throw error;
        }
      }),
  }),

  // ============ COMPARACOES ============
  comparacoes: router({
    list: protectedProcedure
      .input(
        z
          .object({
            convenioId: z.number().optional(),
            status: z.enum(["pendente", "concluida", "erro"]).optional(),
            dataInicio: z.string().optional(),
            dataFim: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getComparacoes({
          ...input,
          userId: ctx.user.id,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const comparacao = await db.getComparacaoById(input.id);
        if (!comparacao) return null;

        const divergencias = await db.getDivergenciasByComparacaoId(input.id);
        return { ...comparacao, divergencias };
      }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      return db.getComparacoesStats(ctx.user.id);
    }),

    criar: protectedProcedure
      .input(
        z.object({
          arquivoEnviadoId: z.number(),
          arquivoRetornadoId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Get arquivos
        const [arquivoEnviado, arquivoRetornado] = await Promise.all([
          db.getArquivoById(input.arquivoEnviadoId),
          db.getArquivoById(input.arquivoRetornadoId),
        ]);

        if (!arquivoEnviado || !arquivoRetornado) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Arquivo não encontrado",
          });
        }

        if (arquivoEnviado.convenioId !== arquivoRetornado.convenioId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Os arquivos devem ser do mesmo convênio",
          });
        }

        // Create comparacao record
        const { id: comparacaoId } = await db.createComparacao({
          arquivoEnviadoId: input.arquivoEnviadoId,
          arquivoRetornadoId: input.arquivoRetornadoId,
          convenioId: arquivoEnviado.convenioId,
          userId: ctx.user.id,
          status: "pendente",
        });

        // Get procedimentos
        const [procEnviados, procRetornados] = await Promise.all([
          db.getProcedimentosByArquivoId(input.arquivoEnviadoId),
          db.getProcedimentosByArquivoId(input.arquivoRetornadoId),
        ]);

        // Run comparison
        const resultado = compararProcedimentos(procEnviados, procRetornados);

        // Save divergencias
        if (resultado.divergencias.length > 0) {
          const divergenciasToInsert = resultado.divergencias.map((d) =>
            toDivergenciaInsert(d, comparacaoId)
          );
          await db.createDivergencias(divergenciasToInsert);
        }

        // Update comparacao with results
        await db.updateComparacao(comparacaoId, {
          status: "concluida",
          totalItensEnviados: resultado.totalItensEnviados,
          totalItensRetornados: resultado.totalItensRetornados,
          totalDivergencias: resultado.totalDivergencias,
          valorTotalEnviado: resultado.valorTotalEnviado.toString(),
          valorTotalRetornado: resultado.valorTotalRetornado.toString(),
          diferencaValor: resultado.diferencaValor.toString(),
        });

        return {
          id: comparacaoId,
          ...resultado,
          resumo: gerarResumoComparacao(resultado),
        };
      }),

    divergencias: protectedProcedure
      .input(z.object({ comparacaoId: z.number() }))
      .query(async ({ input }) => {
        return db.getDivergenciasByComparacaoId(input.comparacaoId);
      }),

    resolverDivergencia: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          resolvido: z.enum(["sim", "nao"]),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateDivergenciaResolvido(input.id, input.resolvido);
        return { success: true };
      }),
  }),

  // ============ CODIGOS PROCEDIMENTOS (ADMIN) ============
  codigosProcedimentos: router({
    list: protectedProcedure
      .input(z.object({ ativo: z.enum(["sim", "nao"]).optional() }).optional())
      .query(async ({ input }) => {
        return db.getCodigosProcedimentos(input?.ativo);
      }),

    create: protectedProcedure
      .input(
        z.object({
          codigo: z.string().min(1),
          descricao: z.string().min(1),
          valorReferencia: z.number().optional(),
          categoria: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createCodigoProcedimento({
          codigo: input.codigo,
          descricao: input.descricao,
          valorReferencia: input.valorReferencia?.toString() || null,
          categoria: input.categoria || null,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          codigo: z.string().optional(),
          descricao: z.string().optional(),
          valorReferencia: z.number().optional(),
          categoria: z.string().optional(),
          ativo: z.enum(["sim", "nao"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, valorReferencia, ...rest } = input;
        await db.updateCodigoProcedimento(id, {
          ...rest,
          valorReferencia: valorReferencia?.toString(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCodigoProcedimento(input.id);
        return { success: true };
      }),
  }),

  // ============ CAMPOS COMPARACAO (ADMIN) ============
  camposComparacao: router({
    list: protectedProcedure
      .input(z.object({ ativo: z.enum(["sim", "nao"]).optional() }).optional())
      .query(async ({ input }) => {
        return db.getCamposComparacao(input?.ativo);
      }),

    create: protectedProcedure
      .input(
        z.object({
          nome: z.string().min(1),
          campoOrigem: z.string().min(1),
          obrigatorio: z.enum(["sim", "nao"]).optional(),
          tolerancia: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createCampoComparacao({
          nome: input.nome,
          campoOrigem: input.campoOrigem,
          obrigatorio: input.obrigatorio || "nao",
          tolerancia: input.tolerancia?.toString() || null,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().optional(),
          campoOrigem: z.string().optional(),
          ativo: z.enum(["sim", "nao"]).optional(),
          obrigatorio: z.enum(["sim", "nao"]).optional(),
          tolerancia: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, tolerancia, ...rest } = input;
        await db.updateCampoComparacao(id, {
          ...rest,
          tolerancia: tolerancia?.toString(),
        });
        return { success: true };
      }),
  }),

  // ============ ITENS MANUAIS ============
  itensManuals: router({
    list: protectedProcedure
      .input(
        z
          .object({
            arquivoId: z.number().optional(),
            comparacaoId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getItensManuals({
          ...input,
          userId: ctx.user.id,
        });
      }),

    create: protectedProcedure
      .input(
        z.object({
          arquivoId: z.number().optional(),
          comparacaoId: z.number().optional(),
          codigo: z.string().min(1),
          descricao: z.string().optional(),
          quantidade: z.number().optional(),
          valorUnitario: z.number().optional(),
          valorTotal: z.number().optional(),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return db.createItemManual({
          arquivoId: input.arquivoId || null,
          comparacaoId: input.comparacaoId || null,
          userId: ctx.user.id,
          codigo: input.codigo,
          descricao: input.descricao || null,
          quantidade: input.quantidade || 1,
          valorUnitario: input.valorUnitario?.toString() || null,
          valorTotal: input.valorTotal?.toString() || null,
          observacao: input.observacao || null,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteItemManual(input.id);
        return { success: true };
      }),
  }),

  // ============ PROCEDIMENTOS ============
  procedimentos: router({
    list: protectedProcedure
      .input(
        z
          .object({
            arquivoId: z.number().optional(),
            convenioId: z.number().optional(),
            search: z.string().optional(),
            nomeMedico: z.string().optional(),
            crmMedico: z.string().optional(),
            statusGlosa: z.enum(["todos", "pago", "glosado", "parcial"]).optional(),
            page: z.number().default(1),
            pageSize: z.number().default(20),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getProcedimentosPaginated({
          arquivoId: input?.arquivoId,
          convenioId: input?.convenioId,
          search: input?.search,
          nomeMedico: input?.nomeMedico,
          crmMedico: input?.crmMedico,
          statusGlosa: input?.statusGlosa,
          page: input?.page || 1,
          pageSize: input?.pageSize || 20,
          userId: ctx.user.id,
        });
      }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    resumo: protectedProcedure.query(async ({ ctx }) => {
      const [arquivosStats, comparacoesStats] = await Promise.all([
        db.getArquivosStats(ctx.user.id),
        db.getComparacoesStats(ctx.user.id),
      ]);

      return {
        arquivos: arquivosStats,
        comparacoes: comparacoesStats,
      };
    }),

    ultimasComparacoes: protectedProcedure
      .input(z.object({ limit: z.number().default(5) }).optional())
      .query(async ({ input, ctx }) => {
        const comparacoes = await db.getComparacoes({ userId: ctx.user.id });
        return comparacoes.slice(0, input?.limit || 5);
      }),

    ultimosArquivos: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }).optional())
      .query(async ({ input, ctx }) => {
        const arquivos = await db.getArquivos({ userId: ctx.user.id });
        return arquivos.slice(0, input?.limit || 10);
      }),
  }),

  // ============ FATURAMENTO ============
  faturamento: router({
    porConvenio: protectedProcedure.query(async ({ ctx }) => {
      return db.getFaturamentoPorConvenio(ctx.user.id);
    }),

    porMes: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          meses: z.number().default(12),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getFaturamentoPorMes(
          ctx.user.id,
          input?.convenioId,
          input?.meses || 12
        );
      }),

    resumoGeral: protectedProcedure.query(async ({ ctx }) => {
      return db.getResumoGeral(ctx.user.id);
    }),
  }),

  // ============ ANÁLISE DE GLOSA ============
  glosa: router({
    porConvenio: protectedProcedure.query(async ({ ctx }) => {
      return db.getGlosaPorConvenio(ctx.user.id);
    }),

    porProcedimento: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          limit: z.number().default(20),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getGlosaPorProcedimento(
          ctx.user.id,
          input?.convenioId,
          input?.limit || 20
        );
      }),

    tendencia: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          meses: z.number().default(12),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciaGlosa(
          ctx.user.id,
          input?.convenioId,
          input?.meses || 12
        );
      }),

    resumo: protectedProcedure.query(async ({ ctx }) => {
      return db.getResumoGlosa(ctx.user.id);
    }),
  }),

  // ============ RECURSOS DE GLOSA ============
  recursos: router({
    list: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          status: z.string().optional(),
          prioridade: z.string().optional(),
          dataInicio: z.date().optional(),
          dataFim: z.date().optional(),
          busca: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getRecursosGlosa(
          ctx.user.id,
          {
            convenioId: input?.convenioId,
            status: input?.status,
            prioridade: input?.prioridade,
            dataInicio: input?.dataInicio,
            dataFim: input?.dataFim,
            busca: input?.busca,
          },
          input?.page || 1,
          input?.limit || 20
        );
      }),

    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecursoById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          divergenciaId: z.number().optional(),
          convenioId: z.number(),
          codigoProcedimento: z.string().optional(),
          descricaoProcedimento: z.string().optional(),
          guiaNumero: z.string().optional(),
          pacienteNome: z.string().optional(),
          valorCobrado: z.string().optional(),
          valorGlosado: z.string().optional(),
          motivoGlosaConvenio: z.string().optional(),
          justificativaRecurso: z.string(),
          prioridade: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
          dataGlosa: z.date().optional(),
          dataPrazoResposta: z.date().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await db.createRecursoGlosa({
          ...input,
          userId: ctx.user.id,
          status: "rascunho",
        });
        return { id };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            codigoProcedimento: z.string().optional(),
            descricaoProcedimento: z.string().optional(),
            guiaNumero: z.string().optional(),
            pacienteNome: z.string().optional(),
            valorCobrado: z.string().optional(),
            valorGlosado: z.string().optional(),
            valorRecuperado: z.string().optional(),
            motivoGlosaConvenio: z.string().optional(),
            justificativaRecurso: z.string().optional(),
            prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
            status: z.enum([
              "rascunho",
              "pendente_envio",
              "enviado",
              "em_analise",
              "deferido",
              "deferido_parcial",
              "indeferido",
              "cancelado"
            ]).optional(),
            dataGlosa: z.date().optional(),
            dataEnvioRecurso: z.date().optional(),
            dataPrazoResposta: z.date().optional(),
            dataResposta: z.date().optional(),
            protocoloRecurso: z.string().optional(),
            respostaConvenio: z.string().optional(),
          }),
          descricao: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.updateRecursoGlosa(
          input.id,
          ctx.user.id,
          input.data,
          input.descricao
        );
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRecursoGlosa(input.id);
        return { success: true };
      }),

    addHistorico: protectedProcedure
      .input(
        z.object({
          recursoId: z.number(),
          tipo: z.enum([
            "criacao",
            "edicao",
            "envio",
            "resposta_convenio",
            "anexo_adicionado",
            "status_alterado",
            "comentario",
            "lembrete"
          ]),
          descricao: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.addHistoricoRecurso({
          recursoId: input.recursoId,
          userId: ctx.user.id,
          tipo: input.tipo,
          descricao: input.descricao,
        });
        return { success: true };
      }),

    estatisticas: protectedProcedure.query(async ({ ctx }) => {
      return db.getEstatisticasRecursos(ctx.user.id);
    }),

    enviar: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          protocoloRecurso: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.updateRecursoGlosa(
          input.id,
          ctx.user.id,
          {
            status: "enviado",
            dataEnvioRecurso: new Date(),
            protocoloRecurso: input.protocoloRecurso,
          },
          "Recurso enviado ao convênio"
        );
        return { success: true };
      }),

    registrarResposta: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["deferido", "deferido_parcial", "indeferido"]),
          respostaConvenio: z.string(),
          valorRecuperado: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.updateRecursoGlosa(
          input.id,
          ctx.user.id,
          {
            status: input.status,
            dataResposta: new Date(),
            respostaConvenio: input.respostaConvenio,
            valorRecuperado: input.valorRecuperado,
          },
          `Resposta do convênio: ${input.status}`
        );
        
        // Registrar no histórico de contestações para aprendizado da IA
        const recurso = await db.getRecursoById(input.id);
        if (recurso) {
          await db.registrarHistoricoContestacao({
            recursoId: input.id,
            convenioId: recurso.convenioId,
            userId: ctx.user.id,
            codigoGlosa: recurso.motivoGlosaConvenio?.match(/\d{4}/)?.[0] || "0000",
            descricaoGlosa: recurso.motivoGlosaConvenio || "",
            codigoProcedimento: recurso.codigoProcedimento || undefined,
            descricaoProcedimento: recurso.descricaoProcedimento || undefined,
            valorGlosado: recurso.valorGlosado || undefined,
            valorRecuperado: input.valorRecuperado || undefined,
            argumentoUtilizado: recurso.justificativaRecurso,
            argumentoOrigem: "manual",
            resultado: input.status,
            argumentoEfetivo: input.status === "deferido" ? "sim" : input.status === "deferido_parcial" ? "parcial" : "nao",
          });
        }
        
        return { success: true };
      }),

    // Sugerir argumento com IA baseado no histórico
    sugerirArgumentoIA: protectedProcedure
      .input(
        z.object({
          codigoGlosa: z.string(),
          convenioId: z.number(),
          codigoProcedimento: z.string().optional(),
          valorGlosado: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return db.sugerirArgumentoComIA({
          codigoGlosa: input.codigoGlosa,
          convenioId: input.convenioId,
          codigoProcedimento: input.codigoProcedimento,
          valorGlosado: input.valorGlosado,
          userId: ctx.user.id,
        });
      }),

    // Listar histórico de contestações
    historicoContestacoes: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          codigoGlosa: z.string().optional(),
          resultado: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getHistoricoContestacoes({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          codigoGlosa: input?.codigoGlosa,
          resultado: input?.resultado,
          page: input?.page || 1,
          limit: input?.limit || 20,
        });
      }),

    // Obter estatísticas de contestações por código de glosa
    estatisticasPorCodigo: protectedProcedure
      .input(
        z.object({
          codigoGlosa: z.string(),
          convenioId: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getEstatisticasContestacaoPorCodigo({
          codigoGlosa: input.codigoGlosa,
          convenioId: input.convenioId,
          userId: ctx.user.id,
        });
      }),

    // Obter melhores argumentos para um código de glosa
    melhoresArgumentos: protectedProcedure
      .input(
        z.object({
          codigoGlosa: z.string(),
          convenioId: z.number().optional(),
          limit: z.number().default(5),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getMelhoresArgumentos({
          codigoGlosa: input.codigoGlosa,
          convenioId: input.convenioId,
          userId: ctx.user.id,
          limit: input.limit,
        });
      }),
  }),

  // ============ CONCILIAÇÃO AUTOMÁTICA ============
  conciliacao: router({
    // Buscar dados para conciliação por convênio
    porConvenio: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getConciliacaoPorConvenio({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        });
      }),

    // Resumo da conciliação por convênio
    resumo: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getResumoConciliacao({
          convenioId: input?.convenioId,
          userId: ctx.user.id,
        });
      }),
  }),

  // ============ TENDÊNCIAS DE GLOSA ============
  tendencias: router({
    // Tendências de glosa por convênio
    porConvenio: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          meses: z.number().optional().default(6),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciasGlosa({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          meses: input?.meses || 6,
        });
      }),

    // Tendência geral (todos os convênios)
    geral: protectedProcedure
      .input(
        z.object({
          meses: z.number().optional().default(6),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciaGeral({
          userId: ctx.user.id,
          meses: input?.meses || 6,
        });
      }),
  }),

  // ============ REPASSE MÉDICO ============
  repasse: router({
    list: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
          search: z.string().optional(),
          page: z.number().optional().default(1),
          pageSize: z.number().optional().default(50),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getRepasseData({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
          search: input?.search,
          page: input?.page || 1,
          pageSize: input?.pageSize || 50,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
