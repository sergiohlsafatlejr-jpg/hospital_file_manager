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

/**
 * Sanitize filename to remove special characters that can cause issues with S3/URLs
 * - Removes accents (normalizes to ASCII)
 * - Replaces + with underscore
 * - Replaces spaces with underscore
 * - Removes other special characters
 * - Ensures only alphanumeric, underscore, hyphen, and dot remain
 */
function sanitizeFilename(filename: string): string {
  // Remove file extension temporarily
  const lastDotIndex = filename.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0;
  const name = hasExtension ? filename.substring(0, lastDotIndex) : filename;
  const ext = hasExtension ? filename.substring(lastDotIndex) : '';
  
  // Normalize unicode characters (remove accents)
  let sanitized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Replace + and spaces with underscore
  sanitized = sanitized.replace(/[+\s]+/g, '_');
  
  // Remove any character that is not alphanumeric, underscore, hyphen, or dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-]/g, '');
  
  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  // Ensure we have a valid filename
  if (!sanitized) {
    sanitized = 'arquivo';
  }
  
  return sanitized + ext;
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    
    // Verificar se usuário tem senha definida
    hasPassword: protectedProcedure.query(async ({ ctx }) => {
      return db.hasUserPassword(ctx.user.id);
    }),
    
    // Alterar senha do usuário
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
        confirmPassword: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validar confirmação de senha
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "As senhas não conferem",
          });
        }
        
        // Verificar se usuário tem senha definida
        const hasPassword = await db.hasUserPassword(ctx.user.id);
        
        if (hasPassword && !input.currentPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe a senha atual",
          });
        }
        
        const result = await db.changeUserPassword(
          ctx.user.id,
          input.currentPassword || "",
          input.newPassword
        );
        
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.message,
          });
        }
        
        return { success: true, message: result.message };
      }),
      
    // Definir senha pela primeira vez (para usuários sem senha)
    setInitialPassword: protectedProcedure
      .input(z.object({
        newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
        confirmPassword: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validar confirmação de senha
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "As senhas não conferem",
          });
        }
        
        // Verificar se usuário já tem senha
        const hasPassword = await db.hasUserPassword(ctx.user.id);
        if (hasPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Você já possui uma senha definida. Use a opção de alterar senha.",
          });
        }
        
        await db.setUserPassword(ctx.user.id, input.newPassword);
        return { success: true, message: "Senha definida com sucesso" };
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
          prazoRecursoGlosa: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.createConvenio({
          nome: input.nome,
          codigo: input.codigo || null,
          prazoRecursoGlosa: input.prazoRecursoGlosa || 30,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().optional(),
          codigo: z.string().optional(),
          prazoRecursoGlosa: z.number().optional(),
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

  // ============ REGRAS DE CONCILIAÇÃO ============
  regrasConciliacao: router({
    list: protectedProcedure
      .query(async () => {
        return db.getRegrasConciliacao();
      }),

    get: protectedProcedure
      .input(z.object({ convenioId: z.number() }))
      .query(async ({ input }) => {
        return db.getRegraConciliacaoPorConvenio(input.convenioId);
      }),

    upsert: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          itensNaoEncontrados: z.enum(["glosado", "pago", "divergente"]).optional(),
          toleranciaValor: z.string().optional(),
          toleranciaPercentual: z.string().optional(),
          usarCodigo: z.enum(["sim", "nao"]).optional(),
          usarGuia: z.enum(["sim", "nao"]).optional(),
          usarData: z.enum(["sim", "nao"]).optional(),
          usarPaciente: z.enum(["sim", "nao"]).optional(),
          formatoRetorno: z.enum(["excel_completo", "excel_glosas", "xml_tiss", "csv", "pdf"]).optional(),
          prazoRecursoDias: z.number().optional(),
          observacoes: z.string().optional(),
          ativo: z.enum(["sim", "nao"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.upsertRegraConciliacao(input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteRegraConciliacao(input.id);
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
            estabelecimentoId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getArquivos({
          ...input,
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId,
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
          estabelecimentoId: z.number(), // Estabelecimento associado ao arquivo
          conteudo: z.string(), // Base64 encoded
          dataReferencia: z.string().optional(),
          dataPagamento: z.string().optional(), // Data de pagamento do convênio
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Decode base64 content
        const buffer = Buffer.from(input.conteudo, "base64");
        
        // Sanitize filename to remove special characters
        const sanitizedNome = sanitizeFilename(input.nome);
        
        // Generate unique S3 key with sanitized filename
        const ext = input.tipoArquivo === "excel" ? "xlsx" : input.tipoArquivo;
        const s3Key = `arquivos/${ctx.user.id}/${nanoid()}-${sanitizedNome}.${ext}`;
        
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
          estabelecimentoId: input.estabelecimentoId,
          userId: ctx.user.id,
          s3Key,
          s3Url: url,
          tamanho: buffer.length,
          status: "pendente",
          dataReferencia: input.dataReferencia ? new Date(input.dataReferencia) : null,
          dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : null,
        });
        
        // Parse file and extract procedimentos
        try {
          console.log('[Upload] Parsing file:', input.nome);
          
          // Set status to processing
          await db.updateArquivoStatus(arquivoId, "processando");
          
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
            
            // Update total items to process
            await db.updateArquivoProgresso(arquivoId, 0, 0, procedimentosToInsert.length);
            
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
            
            // Create procedimentos with progress callback
            await db.createProcedimentos(
              procedimentosToInsert,
              arquivoId,
              async (progresso, itensProcessados, totalItens) => {
                await db.updateArquivoProgresso(arquivoId, progresso, itensProcessados, totalItens);
              }
            );
            
            await db.updateArquivoStatus(arquivoId, "processado");
            await db.updateArquivoProgresso(arquivoId, 100, procedimentosToInsert.length, procedimentosToInsert.length);
            
            // Nota: A validação de regras e comparação com tabela de preços agora é feita sob demanda
            // pelo usuário na tela de Comparações, não mais automaticamente no upload
          } else if (!parseResult.success) {
            await db.updateArquivoStatus(arquivoId, "erro");
          } else {
            await db.updateArquivoStatus(arquivoId, "processado");
            await db.updateArquivoProgresso(arquivoId, 100, 0, 0);
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
            estabelecimentoId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getComparacoes({
          ...input,
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId,
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
            apenasRetornados: z.boolean().optional(),
            mesReferencia: z.number().min(1).max(12).optional(),
            anoReferencia: z.number().min(2000).max(2100).optional(),
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
          apenasRetornados: input?.apenasRetornados,
          mesReferencia: input?.mesReferencia,
          anoReferencia: input?.anoReferencia,
          page: input?.page || 1,
          pageSize: input?.pageSize || 20,
          userId: ctx.user.id,
        });
      }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    resumo: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const estabelecimentoId = input?.estabelecimentoId;
        const [arquivosStats, comparacoesStats] = await Promise.all([
          db.getArquivosStats(ctx.user.id, estabelecimentoId),
          db.getComparacoesStats(ctx.user.id, estabelecimentoId),
        ]);

        return {
          arquivos: arquivosStats,
          comparacoes: comparacoesStats,
        };
      }),

    ultimasComparacoes: protectedProcedure
      .input(z.object({ 
        limit: z.number().default(5),
        estabelecimentoId: z.number().optional() 
      }).optional())
      .query(async ({ input, ctx }) => {
        const comparacoes = await db.getComparacoes({ 
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId 
        });
        return comparacoes.slice(0, input?.limit || 5);
      }),

    ultimosArquivos: protectedProcedure
      .input(z.object({ 
        limit: z.number().default(10),
        estabelecimentoId: z.number().optional() 
      }).optional())
      .query(async ({ input, ctx }) => {
        const arquivos = await db.getArquivos({ 
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId 
        });
        return arquivos.slice(0, input?.limit || 10);
      }),
  }),

  // ============ FATURAMENTO ============
  faturamento: router({
    porConvenio: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getFaturamentoPorConvenio(ctx.user.id, input?.estabelecimentoId);
      }),

    porMes: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          meses: z.number().default(12),
          estabelecimentoId: z.number().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getFaturamentoPorMes(
          ctx.user.id,
          input?.convenioId,
          input?.meses || 12,
          input?.estabelecimentoId
        );
      }),

    resumoGeral: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getResumoGeral(ctx.user.id, input?.estabelecimentoId);
      }),
  }),

  // ============ ANÁLISE DE GLOSA ============
  glosa: router({
    porConvenio: protectedProcedure
      .input(z.object({ 
        convenioId: z.number().optional(),
        estabelecimentoId: z.number().optional() 
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getGlosaPorConvenio(ctx.user.id, input?.estabelecimentoId, input?.convenioId);
      }),

    porProcedimento: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          limit: z.number().default(20),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getGlosaPorProcedimento(
          ctx.user.id,
          input?.convenioId,
          input?.limit || 20,
          input?.estabelecimentoId
        );
      }),

    tendencia: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          meses: z.number().default(12),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciaGlosa(
          ctx.user.id,
          input?.convenioId,
          input?.meses || 12,
          input?.estabelecimentoId
        );
      }),

    resumo: protectedProcedure
      .input(z.object({ 
        convenioId: z.number().optional(),
        estabelecimentoId: z.number().optional() 
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getResumoGlosa(ctx.user.id, input?.estabelecimentoId, input?.convenioId);
      }),

    // Itens glosados com filtros avançados
    itensGlosados: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          dataReferenciaInicio: z.date().optional(),
          dataReferenciaFim: z.date().optional(),
          tipo: z.string().optional(),
          codigoGlosa: z.string().optional(),
          classificacao: z.enum(["todos", "pendente", "aceitar", "recursar"]).optional(),
          search: z.string().optional(),
          page: z.number().default(1),
          pageSize: z.number().default(50),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getItensGlosados({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          estabelecimentoId: input?.estabelecimentoId,
          dataReferenciaInicio: input?.dataReferenciaInicio,
          dataReferenciaFim: input?.dataReferenciaFim,
          tipo: input?.tipo,
          codigoGlosa: input?.codigoGlosa,
          classificacao: input?.classificacao,
          search: input?.search,
          page: input?.page || 1,
          pageSize: input?.pageSize || 50,
        });
      }),

    // Itens glosados aceitos (separados)
    itensGlosadosAceitos: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          dataReferenciaInicio: z.date().optional(),
          dataReferenciaFim: z.date().optional(),
          search: z.string().optional(),
          page: z.number().default(1),
          pageSize: z.number().default(50),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getItensGlosadosAceitos({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          estabelecimentoId: input?.estabelecimentoId,
          dataReferenciaInicio: input?.dataReferenciaInicio,
          dataReferenciaFim: input?.dataReferenciaFim,
          search: input?.search,
          page: input?.page || 1,
          pageSize: input?.pageSize || 50,
        });
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
        
        // Atualizar status dos procedimentos vinculados ao recurso para "enviado"
        await db.atualizarStatusProcedimentosPorRecurso(input.id, "recurso_enviado");
        
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
          
          // Atualizar status dos procedimentos vinculados ao recurso
          const novoStatusProcedimento = input.status === "deferido" || input.status === "deferido_parcial" 
            ? "recurso_deferido" 
            : "recurso_indeferido";
          
          await db.atualizarStatusProcedimentosPorRecurso(input.id, novoStatusProcedimento);
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

    // Criar recursos em lote
    createBatch: protectedProcedure
      .input(
        z.object({
          itens: z.array(
            z.object({
              procedimentoId: z.number().optional(), // ID do procedimento para marcar como "recurso criado"
              convenioId: z.number(),
              codigoProcedimento: z.string().optional(),
              descricaoProcedimento: z.string().optional(),
              guiaNumero: z.string().optional(),
              pacienteNome: z.string().optional(),
              valorCobrado: z.string().optional(),
              valorGlosado: z.string().optional(),
              motivoGlosaConvenio: z.string().optional(),
            })
          ),
          justificativaRecurso: z.string(),
          prioridade: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const resultados: { id: number; codigo: string; procedimentoId?: number }[] = [];
        const erros: { codigo: string; erro: string }[] = [];
        const procedimentosParaAtualizar: number[] = [];

        for (const item of input.itens) {
          try {
            // Verificar se já existe recurso para este procedimento
            if (item.procedimentoId) {
              const recursoExistente = await db.verificarRecursoExistente(item.procedimentoId);
              if (recursoExistente) {
                erros.push({ codigo: item.codigoProcedimento || "", erro: "Já existe recurso criado para este item" });
                continue;
              }
            }

            const id = await db.createRecursoGlosa({
              ...item,
              justificativaRecurso: input.justificativaRecurso,
              prioridade: input.prioridade,
              userId: ctx.user.id,
              status: "rascunho",
            });
            
            resultados.push({ id, codigo: item.codigoProcedimento || "", procedimentoId: item.procedimentoId });
            
            // Marcar procedimento como "recurso criado"
            if (item.procedimentoId) {
              procedimentosParaAtualizar.push(item.procedimentoId);
            }
          } catch (error: any) {
            erros.push({ codigo: item.codigoProcedimento || "", erro: error.message });
          }
        }

        // Atualizar status dos procedimentos em lote
        if (procedimentosParaAtualizar.length > 0) {
          await db.marcarProcedimentosComRecurso(procedimentosParaAtualizar);
        }

        return { 
          sucesso: resultados.length, 
          falhas: erros.length, 
          resultados, 
          erros 
        };
      }),
    // Classificar glosa (aceitar ou recursar)
    classificarGlosa: protectedProcedure
      .input(
        z.object({
          procedimentoId: z.number(),
          classificacao: z.enum(["aceitar", "recursar"]),
          motivo: z.string().optional(),
          motivoAceite: z.string().optional(), // Motivo informado pelo funcionário ao aceitar
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Registrar a decisão para aprendizado
        const proc = await db.getProcedimentoById(input.procedimentoId);
        if (!proc) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Procedimento não encontrado" });
        }

        const extras = (proc.dadosExtras || {}) as Record<string, unknown>;
        const motivoGlosa = (extras.motivoGlosa || extras['Erro TISS'] || extras.cod_glosa || extras['COD. GLOSA'] || "") as string;
        const codigoGlosa = motivoGlosa.match(/^(\d+)/)?.[1] || "";

        // Buscar arquivo para obter conveníoId
        const arquivo = await db.getArquivoById(proc.arquivoId);
        if (!arquivo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
        }

        // Registrar decisão
        await db.registrarDecisaoGlosa({
          convenioId: arquivo.convenioId,
          codigoGlosa: codigoGlosa || "0000",
          codigoProcedimento: proc.codigo,
          tipoProcedimento: null,
          decisao: input.classificacao,
          valorGlosado: proc.valorGlosado || undefined,
          motivoDecisao: input.motivo || null,
          procedimentoId: input.procedimentoId,
          userId: ctx.user.id,
        });

        // Atualizar classificação do procedimento (incluindo motivoAceite se for aceitar)
        await db.atualizarClassificacaoProcedimento(
          input.procedimentoId,
          input.classificacao,
          100,
          input.motivo || "Classificado manualmente pelo usuário",
          input.classificacao === "aceitar" ? input.motivoAceite : undefined
        );

        return { success: true };
      }),

    // Sugerir classificação com base no histórico
    sugerirClassificacao: protectedProcedure
      .input(
        z.object({
          codigoGlosa: z.string(),
          convenioId: z.number(),
          codigoProcedimento: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.sugerirClassificacaoGlosa(
          input.codigoGlosa,
          input.convenioId,
          input.codigoProcedimento
        );
      }),

    // Classificar glosas automaticamente
    classificarAutomaticamente: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          limiteConfianca: z.number().min(50).max(100).default(70),
        }).optional()
      )
      .mutation(async ({ input }) => {
        return db.classificarGlosasAutomaticamente(
          input?.convenioId,
          input?.limiteConfianca || 70
        );
      }),

    // Buscar histórico de decisões para um código de glosa
    historicoDecisoes: protectedProcedure
      .input(
        z.object({
          codigoGlosa: z.string(),
          convenioId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.buscarHistoricoDecisoes(input.codigoGlosa, input.convenioId);
      }),

    // ============ LOTES DE RECURSOS ============
    listarLotes: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number().optional(),
          convenioId: z.number().optional(),
          status: z.enum(["rascunho", "pendente_envio", "enviado", "em_analise", "respondido", "finalizado"]).optional(),
          search: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        }).optional()
      )
      .query(async ({ input }) => {
        return db.listarLotesRecurso({
          estabelecimentoId: input?.estabelecimentoId,
          convenioId: input?.convenioId,
          status: input?.status,
          search: input?.search,
          page: input?.page || 1,
          limit: input?.limit || 20,
        });
      }),

    resumoLotes: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return db.getResumoLotesRecurso(input?.estabelecimentoId);
      }),

    atualizarLote: protectedProcedure
      .input(
        z.object({
          loteId: z.number(),
          status: z.enum(["rascunho", "pendente_envio", "enviado", "em_analise", "respondido", "finalizado"]).optional(),
          protocoloEnvio: z.string().optional(),
          dataEnvio: z.date().optional(),
          dataPrazoPagamento: z.date().optional(),
          dataResposta: z.date().optional(),
          valorTotalRecuperado: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.atualizarLoteRecurso(input);
      }),

    detalhesLote: protectedProcedure
      .input(z.object({ loteId: z.number() }))
      .query(async ({ input }) => {
        return db.getDetalhesLoteRecurso(input.loteId);
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
          mesReferencia: z.number().min(1).max(12).optional(),
          anoReferencia: z.number().min(2000).max(2100).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getConciliacaoPorConvenio({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
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

  // ============ TABELAS DE PREÇOS ============
  tabelasPreco: router({
    // Listar tabelas de preços
    list: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          tipo: z.enum(["diarias", "mat_med", "taxas", "procedimentos"]).optional(),
          codigo: z.string().optional(),
          nome: z.string().optional(),
          apenasVigentes: z.boolean().optional().default(true),
          page: z.number().optional().default(1),
          limit: z.number().optional().default(50),
        }).optional()
      )
      .query(async ({ input }) => {
        return db.getTabelasPreco({
          convenioId: input?.convenioId,
          tipo: input?.tipo,
          codigo: input?.codigo,
          nome: input?.nome,
          apenasVigentes: input?.apenasVigentes,
          page: input?.page,
          limit: input?.limit,
        });
      }),

    // Buscar item por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getTabelaPrecoById(input.id);
      }),

    // Criar novo item
    create: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          tipo: z.enum(["diarias", "mat_med", "taxas", "procedimentos"]),
          codigo: z.string(),
          nome: z.string(),
          valor: z.string(),
          vigenciaInicio: z.string(),
          vigenciaFim: z.string().optional(),
          unidade: z.string().optional(),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await db.createTabelaPreco({
          convenioId: input.convenioId,
          tipo: input.tipo,
          codigo: input.codigo,
          nome: input.nome,
          valor: input.valor,
          vigenciaInicio: new Date(input.vigenciaInicio),
          vigenciaFim: input.vigenciaFim ? new Date(input.vigenciaFim) : undefined,
          unidade: input.unidade,
          observacao: input.observacao,
        });
        return { id };
      }),

    // Atualizar item
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          codigo: z.string().optional(),
          nome: z.string().optional(),
          valor: z.string().optional(),
          vigenciaInicio: z.string().optional(),
          vigenciaFim: z.string().optional(),
          unidade: z.string().optional(),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updateData: any = {};
        if (data.codigo) updateData.codigo = data.codigo;
        if (data.nome) updateData.nome = data.nome;
        if (data.valor) updateData.valor = data.valor;
        if (data.vigenciaInicio) updateData.vigenciaInicio = new Date(data.vigenciaInicio);
        if (data.vigenciaFim) updateData.vigenciaFim = new Date(data.vigenciaFim);
        if (data.unidade !== undefined) updateData.unidade = data.unidade;
        if (data.observacao !== undefined) updateData.observacao = data.observacao;
        
        const success = await db.updateTabelaPreco(id, updateData);
        return { success };
      }),

    // Excluir item (soft delete)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const success = await db.deleteTabelaPreco(input.id);
        return { success };
      }),

    // Contar itens por tipo
    contarPorTipo: protectedProcedure
      .input(z.object({ convenioId: z.number() }))
      .query(async ({ input }) => {
        return db.contarItensTabelaPreco(input.convenioId);
      }),

    // Importar tabela de preços (Excel, CSV, DBF)
    importar: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          tipo: z.enum(["diarias", "mat_med", "taxas", "procedimentos"]),
          nomeArquivo: z.string(),
          formatoArquivo: z.enum(["excel", "csv", "dbf"]),
          conteudo: z.string(), // Base64 encoded file content
          substituirExistentes: z.boolean().optional().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Registrar importação
        const importacaoId = await db.createImportacaoTabela({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          tipo: input.tipo,
          nomeArquivo: input.nomeArquivo,
          formatoArquivo: input.formatoArquivo,
          status: "processando",
        });

        if (!importacaoId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao registrar importação" });
        }

        try {
          // Decodificar conteúdo Base64
          const buffer = Buffer.from(input.conteudo, "base64");
          
          // Parsear arquivo baseado no formato
          let items: any[] = [];
          
          if (input.formatoArquivo === "excel") {
            const XLSX = await import("xlsx");
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawItems = XLSX.utils.sheet_to_json(sheet);
            // Normalizar nomes das colunas removendo espaços extras
            items = rawItems.map((row: any) => {
              const normalized: any = {};
              for (const [key, value] of Object.entries(row)) {
                // Remove espaços no início e fim, e substitui múltiplos espaços por um único
                const normalizedKey = key.trim().replace(/\s+/g, ' ');
                normalized[normalizedKey] = value;
              }
              return normalized;
            });
          } else if (input.formatoArquivo === "csv") {
            const content = buffer.toString("utf-8");
            const lines = content.split("\n").filter(l => l.trim());
            const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
            items = lines.slice(1).map(line => {
              const values = line.split(",");
              const obj: any = {};
              headers.forEach((h, i) => {
                obj[h] = values[i]?.trim();
              });
              return obj;
            });
          } else if (input.formatoArquivo === "dbf") {
            // Para DBF, usar biblioteca específica
            const DBFFile = await import("dbffile");
            const tempPath = `/tmp/import_${Date.now()}.dbf`;
            const fs = await import("fs/promises");
            await fs.writeFile(tempPath, buffer);
            const dbf = await DBFFile.DBFFile.open(tempPath);
            items = await dbf.readRecords();
            await fs.unlink(tempPath);
          }

          // Se substituir existentes, desativar itens anteriores
          if (input.substituirExistentes) {
            await db.desativarTabelasPreco(input.convenioId, input.tipo);
          }

          // Mapear e inserir itens
          const tabelaItems = items.map((item: any) => {
            // Normalizar nomes de campos (suportar vários formatos, incluindo nomes com espaços)
            // Função auxiliar para buscar valor com variações de nome
            const findValue = (keys: string[]): any => {
              for (const key of keys) {
                // Tentar chave exata
                if (item[key] !== undefined) return item[key];
                // Tentar com espaço no final (comum em arquivos Excel)
                if (item[key + " "] !== undefined) return item[key + " "];
                // Tentar com espaço no início
                if (item[" " + key] !== undefined) return item[" " + key];
              }
              return undefined;
            };

            const codigo = findValue(["codigo", "Codigo", "CODIGO", "cod", "Cod", "COD", "code", "Code", "CODE"]) || "";
            const nome = findValue(["nome", "Nome", "NOME", "descricao", "Descricao", "DESCRICAO", "name", "Name", "NAME", "desc", "Desc", "DESC"]) || "";
            const valorStr = String(findValue(["valor", "Valor", "VALOR", "preco", "Preco", "PRECO", "price", "Price", "PRICE", "vl", "Vl", "VL"]) || "0");
            const valor = valorStr.replace(/[^0-9.,]/g, "").replace(",", ".");
            
            // Função para parsear datas em vários formatos (DD/MM/AAAA, AAAA-MM-DD, etc.)
            const parseDate = (value: any): Date => {
              if (!value) return new Date();
              
              // Se já for uma Date válida
              if (value instanceof Date && !isNaN(value.getTime())) {
                return value;
              }
              
              const str = String(value).trim();
              
              // Formato DD/MM/AAAA ou DD-MM-AAAA (brasileiro)
              const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
              if (brMatch) {
                const [, day, month, year] = brMatch;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              }
              
              // Formato AAAA-MM-DD (ISO)
              const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
              if (isoMatch) {
                const [, year, month, day] = isoMatch;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              }
              
              // Número serial do Excel (dias desde 1900-01-01)
              const num = parseFloat(str);
              if (!isNaN(num) && num > 1 && num < 100000) {
                const excelEpoch = new Date(1899, 11, 30);
                return new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
              }
              
              // Tentar parse padrão
              const parsed = new Date(str);
              if (!isNaN(parsed.getTime())) {
                return parsed;
              }
              
              // Fallback: data atual
              return new Date();
            };

            // Vigência - suportar vários formatos de nome de coluna
            const vigenciaInicioRaw = findValue([
              "vigencia_inicio", "Vigencia_inicio", "VIGENCIA_INICIO",
              "inicio_vigencia", "Inicio_vigencia", "INICIO_VIGENCIA",
              "vigenciaInicio", "VigenciaInicio", "VIGENCIAINICIO",
              "data_inicio", "Data_inicio", "DATA_INICIO",
              "dataInicio", "DataInicio", "DATAINICIO",
              "inicio", "Inicio", "INICIO"
            ]);
            
            const vigenciaFimRaw = findValue([
              "vigencia_fim", "Vigencia_fim", "VIGENCIA_FIM",
              "final_vigencia", "Final_vigencia", "FINAL_VIGENCIA",
              "vigenciaFim", "VigenciaFim", "VIGENCIAFIM",
              "data_fim", "Data_fim", "DATA_FIM",
              "dataFim", "DataFim", "DATAFIM",
              "fim", "Fim", "FIM"
            ]);

            return {
              convenioId: input.convenioId,
              tipo: input.tipo,
              codigo: String(codigo).trim(),
              nome: String(nome).trim(),
              valor: valor || "0",
              vigenciaInicio: parseDate(vigenciaInicioRaw),
              vigenciaFim: vigenciaFimRaw ? parseDate(vigenciaFimRaw) : undefined,
              unidade: findValue(["unidade", "Unidade", "UNIDADE", "unit", "Unit", "UNIT"]),
              observacao: findValue(["observacao", "Observacao", "OBSERVACAO", "obs", "Obs", "OBS"]),
            };
          }).filter((item: any) => item.codigo && item.nome);

          // Inserir em lote
          const resultado = await db.createTabelasPrecoEmLote(tabelaItems);

          // Atualizar status da importação
          await db.updateImportacaoTabela(importacaoId, {
            status: "concluido",
            totalItens: items.length,
            itensImportados: resultado.inseridos,
            itensErro: resultado.erros,
          });

          return {
            success: true,
            importacaoId,
            totalItens: items.length,
            itensImportados: resultado.inseridos,
            itensErro: resultado.erros,
          };
        } catch (error: any) {
          // Atualizar status com erro
          await db.updateImportacaoTabela(importacaoId, {
            status: "erro",
            mensagemErro: error.message,
          });

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao processar arquivo: ${error.message}`,
          });
        }
      }),

    // Listar histórico de importações
    historicoImportacoes: protectedProcedure
      .input(z.object({ convenioId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return db.getImportacoesTabela(input?.convenioId);
      }),
  }),

  // ==================== REGRAS DE NEGÓCIO ====================
  regrasNegocio: router({
    // Listar regras
    list: protectedProcedure
      .input(z.object({
        convenioId: z.number().optional(),
        estabelecimentoId: z.number().optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRegrasNegocio(input || {});
      }),

    // Obter regra por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRegraNegocioById(input.id);
      }),

    // Criar regra
    create: protectedProcedure
      .input(z.object({
        convenioId: z.number().optional(),
        estabelecimentoId: z.number().optional(),
        nome: z.string().min(1),
        descricao: z.string().optional(),
        codigoProcedimentoPrincipal: z.string().min(1),
        descricaoProcedimentoPrincipal: z.string().optional(),
        tipoVerificacao: z.enum(["deve_conter", "nao_deve_conter", "pode_conter", "quantidade_minima", "quantidade_maxima"]),
        acaoInconsistencia: z.enum(["alerta", "bloquear", "sugerir_adicao", "sugerir_remocao"]),
        prioridade: z.number().optional(),
        itens: z.array(z.object({
          codigoItem: z.string().min(1),
          descricaoItem: z.string().optional(),
          tipoItem: z.enum(["procedimento", "taxa", "material", "medicamento", "diaria", "outros"]),
          quantidadeMinima: z.number().optional(),
          quantidadeMaxima: z.number().optional(),
          valorEsperado: z.string().optional(),
          toleranciaValor: z.string().optional(),
          obrigatorio: z.enum(["sim", "nao"]).optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { itens, ...regraData } = input;
        
        // Criar regra
        const regraId = await db.createRegraNegocio(regraData as any);
        if (!regraId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar regra" });
        }
        
        // Adicionar itens
        if (itens && itens.length > 0) {
          for (const item of itens) {
            await db.addItemRegraNegocio({
              regraId,
              ...item,
            } as any);
          }
        }
        
        return { id: regraId };
      }),

    // Atualizar regra
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        codigoProcedimentoPrincipal: z.string().optional(),
        descricaoProcedimentoPrincipal: z.string().optional(),
        tipoVerificacao: z.enum(["deve_conter", "nao_deve_conter", "pode_conter", "quantidade_minima", "quantidade_maxima"]).optional(),
        acaoInconsistencia: z.enum(["alerta", "bloquear", "sugerir_adicao", "sugerir_remocao"]).optional(),
        prioridade: z.number().optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updateRegraNegocio(id, data as any);
      }),

    // Excluir regra
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteRegraNegocio(input.id);
      }),

    // Adicionar item à regra
    addItem: protectedProcedure
      .input(z.object({
        regraId: z.number(),
        codigoItem: z.string().min(1),
        descricaoItem: z.string().optional(),
        tipoItem: z.enum(["procedimento", "taxa", "material", "medicamento", "diaria", "outros"]),
        quantidadeMinima: z.number().optional(),
        quantidadeMaxima: z.number().optional(),
        valorEsperado: z.string().optional(),
        toleranciaValor: z.string().optional(),
        obrigatorio: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ input }) => {
        return db.addItemRegraNegocio(input as any);
      }),

    // Remover item da regra
    removeItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.removeItemRegraNegocio(input.id);
      }),
  }),

  // ==================== ALERTAS DE DIVERGÊNCIA ====================
  alertas: router({
    // Listar alertas por arquivo
    byArquivo: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .query(async ({ input }) => {
        return db.getAlertasByArquivo(input.arquivoId);
      }),

    // Listar alertas pendentes
    pendentes: protectedProcedure
      .input(z.object({
        convenioId: z.number().optional(),
        tipoAlerta: z.string().optional(),
        severidade: z.string().optional(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAlertasPendentes(input || {});
      }),

    // Resumo de alertas por arquivo
    resumo: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .query(async ({ input }) => {
        return db.getResumoAlertasArquivo(input.arquivoId);
      }),

    // Atualizar status do alerta
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pendente", "analisando", "corrigido", "ignorado", "aceito"]),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.updateAlertaStatus(input.id, input.status, ctx.user.id, input.observacao);
      }),

    // Executar comparação com tabela de preços
    compararComTabela: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .mutation(async ({ input }) => {
        return db.compararComTabelaPrecos(input.arquivoId);
      }),

    // Verificar regras de negócio
    verificarRegras: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .mutation(async ({ input }) => {
        return db.verificarRegrasNegocio(input.arquivoId);
      }),

    // Sugerir itens faltantes (IA)
    sugerirItens: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .query(async ({ input }) => {
        return db.sugerirItensFaltantes(input.arquivoId);
      }),

    // Atualizar padrões de conta
    atualizarPadroes: protectedProcedure
      .input(z.object({
        convenioId: z.number(),
        estabelecimentoId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.atualizarPadroesContas(input.convenioId, input.estabelecimentoId);
        return { success: true };
      }),

    // Salvar validação no histórico
    salvarValidacao: protectedProcedure
      .input(z.object({
        arquivoId: z.number(),
        convenioId: z.number(),
        totalItens: z.number(),
        divergenciasPreco: z.number(),
        violacoesRegras: z.number(),
        sugestoesIA: z.number(),
        valorDiferenca: z.number(),
        detalhes: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.salvarHistoricoValidacao({
          ...input,
          userId: ctx.user.id,
        });
      }),

    // Listar histórico de validações
    historicoValidacoes: protectedProcedure
      .input(z.object({
        convenioId: z.number().optional(),
        arquivoId: z.number().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.listarHistoricoValidacoes(input || {});
      }),

    // Buscar validação por ID
    getValidacao: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getHistoricoValidacao(input.id);
      }),
  }),

  // ============ PERMISSÕES E DASHBOARD CONSOLIDADO ============
  permissoes: router({
    // Buscar permissões do usuário atual
    minhasPermissoes: protectedProcedure.query(async ({ ctx }) => {
      return db.getPermissoesUsuario(ctx.user.id);
    }),

    // Buscar estabelecimentos permitidos para o usuário
    estabelecimentosPermitidos: protectedProcedure.query(async ({ ctx }) => {
      // Admins têm acesso a todos
      if (ctx.user.role === "admin") {
        return db.getEstabelecimentos("sim");
      }
      const idsPermitidos = await db.getEstabelecimentosPermitidos(ctx.user.id);
      if (idsPermitidos.length === 0) {
        // Se não tem permissões, dar acesso a todos (comportamento padrão)
        return db.getEstabelecimentos("sim");
      }
      const todosEst = await db.getEstabelecimentos("sim");
      return todosEst.filter(e => idsPermitidos.includes(e.id));
    }),

    // Verificar se usuário é gestor
    verificarGestor: protectedProcedure.query(async ({ ctx }) => {
      return db.verificarSeGestor(ctx.user.id);
    }),

    // Verificar permissão específica para um estabelecimento
    verificarPermissao: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        tipoPermissao: z.enum(["visualizar", "editar", "excluir", "gerenciar"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return db.verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          input.tipoPermissao || "visualizar"
        );
      }),

    // Listar usuários de um estabelecimento (apenas gestores)
    usuariosEstabelecimento: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ ctx, input }) => {
        const podeGerenciar = await db.verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          "gerenciar"
        );
        if (!podeGerenciar && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para gerenciar este estabelecimento",
          });
        }
        return db.getUsuariosEstabelecimento(input.estabelecimentoId);
      }),

    // Criar ou atualizar permissão (apenas gestores/admin)
    upsertPermissao: protectedProcedure
      .input(z.object({
        userId: z.number(),
        estabelecimentoId: z.number(),
        grupoServico: z.enum(["administrador", "faturista", "recurso_glosa", "gestor", "visualizador"]).optional(),
        podeVisualizar: z.enum(["sim", "nao"]).optional(),
        podeEditar: z.enum(["sim", "nao"]).optional(),
        podeExcluir: z.enum(["sim", "nao"]).optional(),
        podeGerenciar: z.enum(["sim", "nao"]).optional(),
        acessoDashboard: z.enum(["sim", "nao"]).optional(),
        acessoArquivos: z.enum(["sim", "nao"]).optional(),
        acessoComparacoes: z.enum(["sim", "nao"]).optional(),
        acessoFaturamento: z.enum(["sim", "nao"]).optional(),
        acessoTabelasPreco: z.enum(["sim", "nao"]).optional(),
        acessoAnaliseGlosa: z.enum(["sim", "nao"]).optional(),
        acessoDicionarioGlosas: z.enum(["sim", "nao"]).optional(),
        acessoRecursosGlosa: z.enum(["sim", "nao"]).optional(),
        acessoConvenios: z.enum(["sim", "nao"]).optional(),
        acessoRegrasNegocio: z.enum(["sim", "nao"]).optional(),
        acessoProdutividade: z.enum(["sim", "nao"]).optional(),
        acessoEstabelecimentos: z.enum(["sim", "nao"]).optional(),
        acessoPermissoes: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const podeGerenciar = await db.verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          "gerenciar"
        );
        if (!podeGerenciar && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para gerenciar este estabelecimento",
          });
        }
        return db.upsertPermissaoEstabelecimento(input);
      }),

    // Obter módulos permitidos por grupo de serviço
    modulosPorGrupo: protectedProcedure
      .input(z.object({ grupoServico: z.string() }))
      .query(({ input }) => {
        return db.getModulosPermitidosPorGrupo(input.grupoServico);
      }),

    // Listar todos os usuários do sistema (para seleção)
    listarUsuarios: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        const isGestor = await db.verificarSeGestor(ctx.user.id);
        if (!isGestor) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas gestores podem listar usuários",
          });
        }
      }
      return db.listarTodosUsuarios();
    }),

    // Remover permissão (apenas gestores/admin)
    removerPermissao: protectedProcedure
      .input(z.object({
        userId: z.number(),
        estabelecimentoId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const podeGerenciar = await db.verificarPermissaoEstabelecimento(
          ctx.user.id,
          input.estabelecimentoId,
          "gerenciar"
        );
        if (!podeGerenciar && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para gerenciar este estabelecimento",
          });
        }
        await db.deletePermissaoEstabelecimento(input.userId, input.estabelecimentoId);
        return { success: true };
      }),

    // Criar novo usuário (apenas admin/gestor)
    criarUsuario: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(["admin", "user"]).optional(),
        grupoId: z.number().optional(),
        estabelecimentosIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          const isGestor = await db.verificarSeGestor(ctx.user.id);
          if (!isGestor) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores ou gestores podem criar usuários",
            });
          }
        }
        
        try {
          const userId = await db.criarUsuario(input);
          
          // Criar permissões para múltiplos estabelecimentos
          if (input.estabelecimentosIds && input.estabelecimentosIds.length > 0) {
            for (const estabelecimentoId of input.estabelecimentosIds) {
              await db.criarPermissaoEstabelecimento({
                usuarioId: userId,
                estabelecimentoId,
                grupoId: input.grupoId,
                podeVisualizar: true,
                podeEditar: false,
                podeExcluir: false,
                podeGerenciar: false,
              });
            }
          }
          
          // Registrar no log de auditoria
          const estabelecimentosNomes = input.estabelecimentosIds && input.estabelecimentosIds.length > 0
            ? ` com acesso a ${input.estabelecimentosIds.length} estabelecimento(s)`
            : "";
          await db.registrarLogAuditoria({
            usuarioId: ctx.user.id,
            usuarioNome: ctx.user.name,
            usuarioAfetadoId: userId,
            usuarioAfetadoNome: input.name,
            tipoAcao: "criar_usuario",
            descricao: `Usuário ${input.name} (${input.email}) criado${estabelecimentosNomes}`,
            valoresNovos: { 
              name: input.name, 
              email: input.email, 
              role: input.role || "user",
              estabelecimentosIds: input.estabelecimentosIds,
              grupoId: input.grupoId,
            },
          });
          
          return { success: true, userId };
        } catch (error: any) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message || "Erro ao criar usuário",
          });
        }
      }),

    // Listar grupos de serviço
    listarGrupos: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.listarGruposServico(input.estabelecimentoId);
      }),

    // Criar grupo de serviço personalizado
    criarGrupo: protectedProcedure
      .input(z.object({
        nome: z.string().min(2),
        descricao: z.string().optional(),
        cor: z.string().optional(),
        icone: z.string().optional(),
        permissoesPadrao: z.record(z.string(), z.string()).optional(),
        estabelecimentoId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem criar grupos",
          });
        }
        
        const grupoId = await db.criarGrupoServico({
          ...input,
          criadoPor: ctx.user.id,
        });
        
        // Registrar no log de auditoria
        await db.registrarLogAuditoria({
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name,
          usuarioAfetadoId: ctx.user.id,
          usuarioAfetadoNome: ctx.user.name,
          estabelecimentoId: input.estabelecimentoId,
          tipoAcao: "criar_grupo",
          descricao: `Grupo de serviço "${input.nome}" criado`,
          valoresNovos: input,
        });
        
        return { success: true, grupoId };
      }),

    // Atualizar grupo de serviço
    atualizarGrupo: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(2).optional(),
        descricao: z.string().optional(),
        cor: z.string().optional(),
        icone: z.string().optional(),
        permissoesPadrao: z.record(z.string(), z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem atualizar grupos",
          });
        }
        
        const grupoAnterior = await db.buscarGrupoServicoPorId(input.id);
        const { id, ...dados } = input;
        await db.atualizarGrupoServico(id, dados);
        
        // Registrar no log de auditoria
        await db.registrarLogAuditoria({
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name,
          usuarioAfetadoId: ctx.user.id,
          usuarioAfetadoNome: ctx.user.name,
          tipoAcao: "alterar_grupo",
          descricao: `Grupo de serviço "${grupoAnterior?.nome}" atualizado`,
          valoresAnteriores: grupoAnterior,
          valoresNovos: dados,
        });
        
        return { success: true };
      }),

    // Excluir grupo de serviço
    excluirGrupo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir grupos",
          });
        }
        
        const grupo = await db.buscarGrupoServicoPorId(input.id);
        await db.excluirGrupoServico(input.id);
        
        // Registrar no log de auditoria
        await db.registrarLogAuditoria({
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name,
          usuarioAfetadoId: ctx.user.id,
          usuarioAfetadoNome: ctx.user.name,
          tipoAcao: "excluir_grupo",
          descricao: `Grupo de serviço "${grupo?.nome}" excluído`,
          valoresAnteriores: grupo,
        });
        
        return { success: true };
      }),

    // Listar logs de auditoria
    logsAuditoria: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        usuarioId: z.number().optional(),
        usuarioAfetadoId: z.number().optional(),
        tipoAcao: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        limite: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          const isGestor = await db.verificarSeGestor(ctx.user.id);
          if (!isGestor) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores ou gestores podem ver logs de auditoria",
            });
          }
        }
        
        return db.listarLogsAuditoria({
          ...input,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        });
      }),

    // Listar estabelecimentos de um usuário específico
    listarEstabelecimentosUsuario: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          const isGestor = await db.verificarSeGestor(ctx.user.id);
          if (!isGestor) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores ou gestores podem ver estabelecimentos de usuários",
            });
          }
        }
        return db.getEstabelecimentosUsuario(input.userId);
      }),

    // Atualizar estabelecimentos de um usuário (adicionar/remover)
    atualizarEstabelecimentosUsuario: protectedProcedure
      .input(z.object({
        userId: z.number(),
        estabelecimentosIds: z.array(z.number()),
        grupoId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          const isGestor = await db.verificarSeGestor(ctx.user.id);
          if (!isGestor) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores ou gestores podem atualizar estabelecimentos de usuários",
            });
          }
        }

        // Buscar estabelecimentos atuais do usuário
        const estabelecimentosAtuais = await db.getEstabelecimentosUsuario(input.userId);
        const idsAtuais = estabelecimentosAtuais.map(e => e.id);
        
        // Identificar o que adicionar e remover
        const idsParaAdicionar = input.estabelecimentosIds.filter(id => !idsAtuais.includes(id));
        const idsParaRemover = idsAtuais.filter(id => !input.estabelecimentosIds.includes(id));
        
        // Remover permissões
        for (const estabelecimentoId of idsParaRemover) {
          await db.deletePermissaoEstabelecimento(input.userId, estabelecimentoId);
        }
        
        // Adicionar permissões
        for (const estabelecimentoId of idsParaAdicionar) {
          await db.criarPermissaoEstabelecimento({
            usuarioId: input.userId,
            estabelecimentoId,
            grupoId: input.grupoId,
            podeVisualizar: true,
            podeEditar: false,
            podeExcluir: false,
            podeGerenciar: false,
          });
        }
        
        // Buscar informações do usuário para o log
        const usuario = await db.getUserById(input.userId);
        
        // Registrar no log de auditoria
        await db.registrarLogAuditoria({
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name,
          usuarioAfetadoId: input.userId,
          usuarioAfetadoNome: usuario?.name || "Usuário",
          tipoAcao: "editar_estabelecimentos",
          descricao: `Estabelecimentos atualizados: ${idsParaAdicionar.length} adicionado(s), ${idsParaRemover.length} removido(s)`,
          valoresAnteriores: { estabelecimentosIds: idsAtuais },
          valoresNovos: { estabelecimentosIds: input.estabelecimentosIds },
        });
        
        return { 
          success: true, 
          adicionados: idsParaAdicionar.length, 
          removidos: idsParaRemover.length 
        };
      }),

    // Conceder acesso a todos os estabelecimentos (apenas admin)
    concederAcessoTotal: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissoes: z.object({
          podeVisualizar: z.enum(["sim", "nao"]).optional(),
          podeEditar: z.enum(["sim", "nao"]).optional(),
          podeExcluir: z.enum(["sim", "nao"]).optional(),
          podeGerenciar: z.enum(["sim", "nao"]).optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem conceder acesso total",
          });
        }
        await db.concederAcessoTodosEstabelecimentos(input.userId, input.permissoes);
        return { success: true };
      }),
  }),

  // ============ MÉTRICAS DE PRODUTIVIDADE ============
  produtividade: router({
    // Buscar métricas de produtividade de classificação de glosas
    metricas: protectedProcedure
      .input(z.object({
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getMetricasProdutividade({
          userId: ctx.user.id,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
        });
      }),

    // Buscar métricas de envio de XML
    metricasEnvioXML: protectedProcedure
      .input(z.object({
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        estabelecimentoId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getMetricasEnvioXML({
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
          estabelecimentoId: input?.estabelecimentoId,
        });
      }),
  }),

  // ============ DASHBOARD CONSOLIDADO ============
  dashboardConsolidado: router({
    // Buscar dados consolidados de todos os estabelecimentos
    dados: protectedProcedure.query(async ({ ctx }) => {
      const dados = await db.getDadosConsolidados(ctx.user.id);
      if (!dados) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem permissão para visualizar o dashboard consolidado",
        });
      }
      return dados;
    }),

    // Buscar comparativo de glosas entre estabelecimentos
    comparativoGlosas: protectedProcedure
      .input(z.object({
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        let periodo: { inicio: Date; fim: Date } | undefined;
        if (input?.dataInicio && input?.dataFim) {
          periodo = {
            inicio: new Date(input.dataInicio),
            fim: new Date(input.dataFim),
          };
        }
        const comparativo = await db.getComparativoGlosasEstabelecimentos(ctx.user.id, periodo);
        if (!comparativo) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para visualizar o comparativo",
          });
        }
        return comparativo;
      }),
  }),

  // ============ MOTIVOS DE GLOSA ============
  motivosGlosa: router({
    // Listar motivos de glosa
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        tipoOrigem: z.enum(["tiss", "personalizado"]).optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getMotivosGlosa(input || {});
      }),

    // Buscar motivo por código (combinado banco + TISS)
    porCodigo: protectedProcedure
      .input(z.object({
        codigo: z.string(),
        estabelecimentoId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getMotivoGlosaCombinado(input.codigo, input.estabelecimentoId);
      }),

    // Listar grupos disponíveis
    grupos: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getGruposMotivosGlosa(input?.estabelecimentoId);
      }),

    // Criar novo motivo de glosa
    criar: protectedProcedure
      .input(z.object({
        codigo: z.string().min(1, "Código é obrigatório"),
        grupo: z.string().min(1, "Grupo é obrigatório"),
        descricao: z.string().min(1, "Descrição é obrigatória"),
        descricaoSimplificada: z.string().min(1, "Descrição simplificada é obrigatória"),
        argumentoContestacao: z.string().optional(),
        acoesRecomendadas: z.array(z.string()).optional(),
        documentosSugeridos: z.array(z.string()).optional(),
        dificuldadeReversao: z.number().min(1).max(5).optional(),
        probabilidadeSucesso: z.number().min(0).max(100).optional(),
        estabelecimentoId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se já existe um motivo com esse código
        const existente = await db.getMotivoGlosaPorCodigo(input.codigo, input.estabelecimentoId);
        if (existente) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Já existe um motivo de glosa com o código ${input.codigo}`,
          });
        }
        
        await db.criarMotivoGlosa({
          ...input,
          tipoOrigem: "personalizado",
          criadoPor: ctx.user.id,
        });
        
        return { success: true };
      }),

    // Atualizar motivo de glosa
    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        codigo: z.string().optional(),
        grupo: z.string().optional(),
        descricao: z.string().optional(),
        descricaoSimplificada: z.string().optional(),
        argumentoContestacao: z.string().optional(),
        acoesRecomendadas: z.array(z.string()).optional(),
        documentosSugeridos: z.array(z.string()).optional(),
        dificuldadeReversao: z.number().min(1).max(5).optional(),
        probabilidadeSucesso: z.number().min(0).max(100).optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.atualizarMotivoGlosa(id, data);
        return { success: true };
      }),

    // Excluir motivo de glosa
    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.excluirMotivoGlosa(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
