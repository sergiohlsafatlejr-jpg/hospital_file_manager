import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { storagePut, storageGet } from "./storage";
import { parseFile, toProcedimentoInsert } from "./parsers";
import { parseExcelRecebimentoTiss, parseXmlRecebimentoTiss } from "./recebimentoTissParser";
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
      .input(z.object({ 
        ativo: z.enum(["sim", "nao"]).optional(),
        estabelecimentoId: z.number().optional()
      }).optional())
      .query(async ({ input }) => {
        return db.getConvenios(input?.ativo, input?.estabelecimentoId);
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

    // Rotas de prestadores por convênio/estabelecimento
    listarPrestadores: protectedProcedure
      .input(z.object({ convenioId: z.number() }))
      .query(async ({ input }) => {
        return db.listarPrestadoresPorConvenio(input.convenioId);
      }),

    getPrestador: protectedProcedure
      .input(z.object({ 
        convenioId: z.number(),
        estabelecimentoId: z.number()
      }))
      .query(async ({ input }) => {
        return db.getPrestadorPorConvenioEstabelecimento(input.convenioId, input.estabelecimentoId);
      }),

    getPrestadorPorCodigo: protectedProcedure
      .input(z.object({ 
        codigoPrestador: z.string(),
        convenioId: z.number().optional()
      }))
      .query(async ({ input }) => {
        return db.getPrestadorPorCodigo(input.codigoPrestador, input.convenioId);
      }),

    upsertPrestador: protectedProcedure
      .input(z.object({
        convenioId: z.number(),
        estabelecimentoId: z.number(),
        codigoPrestador: z.string().min(1),
        nomePrestador: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        return db.upsertPrestadorConvenioEstabelecimento(input);
      }),

    excluirPrestador: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.excluirPrestadorConvenioEstabelecimento(input.id);
      }),

    listarTodosPrestadores: protectedProcedure
      .query(async () => {
        return db.listarTodosPrestadores();
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

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const result = await db.deleteEstabelecimento(input.id);
        if (!result.success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
        }
        return result;
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

    // Detectar prestadores de um XML antes da importação
    detectarPrestadores: protectedProcedure
      .input(z.object({
        conteudo: z.string(), // Base64 encoded XML
        convenioId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          // Decode base64 content
          const buffer = Buffer.from(input.conteudo, "base64");
          const xmlContent = buffer.toString("utf-8");
          
          // Extrair códigos de prestadores do XML
          const { extractPrestadoresFromXML } = await import("./parsers");
          const codigosPrestadores = await extractPrestadoresFromXML(xmlContent);
          
          // Buscar estabelecimentos associados a cada código
          const estabelecimentosEncontrados: Array<{
            codigoPrestador: string;
            estabelecimentoId: number;
            estabelecimentoNome: string;
            convenioNome: string;
          }> = [];
          
          for (const codigo of codigosPrestadores) {
            const prestador = await db.getPrestadorPorCodigo(codigo, input.convenioId);
            if (prestador) {
              estabelecimentosEncontrados.push({
                codigoPrestador: codigo,
                estabelecimentoId: prestador.estabelecimentoId,
                estabelecimentoNome: prestador.estabelecimentoNome,
                convenioNome: prestador.convenioNome,
              });
            }
          }
          
          // Determinar o estabelecimento sugerido (o mais frequente ou o primeiro)
          const estabelecimentoSugerido = estabelecimentosEncontrados.length > 0
            ? estabelecimentosEncontrados[0]
            : null;
          
          return {
            success: true,
            codigosPrestadores,
            estabelecimentosEncontrados,
            estabelecimentoSugerido,
            prestadoresNaoCadastrados: codigosPrestadores.filter(
              codigo => !estabelecimentosEncontrados.find(e => e.codigoPrestador === codigo)
            ),
          };
        } catch (error) {
          console.error("[detectarPrestadores] Erro:", error);
          return {
            success: false,
            codigosPrestadores: [],
            estabelecimentosEncontrados: [],
            estabelecimentoSugerido: null,
            prestadoresNaoCadastrados: [],
            error: error instanceof Error ? error.message : "Erro ao processar XML",
          };
        }
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
        
        // Verificar se já existe um arquivo com mesmo nome, convênio e estabelecimento
        const arquivoExistente = await db.findArquivoExistente({
          nome: input.nome,
          convenioId: input.convenioId,
          estabelecimentoId: input.estabelecimentoId,
          userId: ctx.user.id,
          direcao: input.direcao,
        });
        
        let arquivoId: number;
        let s3Key: string;
        let url: string;
        let isReimportacao = false;
        
        if (arquivoExistente) {
          // Reimportação: atualizar arquivo existente
          console.log('[Upload] Arquivo existente encontrado, atualizando:', arquivoExistente.id);
          isReimportacao = true;
          arquivoId = arquivoExistente.id;
          
          // Gerar nova chave S3 para o arquivo atualizado
          const ext = input.tipoArquivo === "excel" ? "xlsx" : input.tipoArquivo;
          s3Key = `arquivos/${ctx.user.id}/${nanoid()}-${sanitizedNome}.${ext}`;
          
          // Upload to S3
          const contentType =
            input.tipoArquivo === "xml"
              ? "application/xml"
              : input.tipoArquivo === "excel"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf";
          
          const uploadResult = await storagePut(s3Key, buffer, contentType);
          url = uploadResult.url;
          
          // Excluir procedimentos antigos
          await db.deleteProcedimentosByArquivoId(arquivoId);
          
          // Atualizar registro do arquivo
          await db.updateArquivo(arquivoId, {
            s3Key,
            s3Url: url,
            tamanho: buffer.length,
            status: "pendente",
            progresso: 0,
            itensProcessados: 0,
            totalItens: null,
            dataReferencia: input.dataReferencia ? new Date(input.dataReferencia) : null,
            dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : null,
          });
        } else {
          // Novo arquivo: criar registro
          const ext = input.tipoArquivo === "excel" ? "xlsx" : input.tipoArquivo;
          s3Key = `arquivos/${ctx.user.id}/${nanoid()}-${sanitizedNome}.${ext}`;
          
          // Upload to S3
          const contentType =
            input.tipoArquivo === "xml"
              ? "application/xml"
              : input.tipoArquivo === "excel"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf";
          
          const uploadResult = await storagePut(s3Key, buffer, contentType);
          url = uploadResult.url;
          
          // Create arquivo record
          const result = await db.createArquivo({
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
          arquivoId = result.id;
        }
        
        // Parse file and extract procedimentos in background
        // Return immediately to user while processing continues
        const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos de timeout para arquivos grandes
        
        const processInBackground = async () => {
          const startTime = Date.now();
          let timeoutId: NodeJS.Timeout | null = null;
          
          // Timeout para garantir que o status seja atualizado mesmo se o processamento travar
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Timeout: processamento excedeu ${TIMEOUT_MS / 1000 / 60} minutos`));
            }, TIMEOUT_MS);
          });
          
          try {
            console.log('[Upload] Starting background processing:', input.nome);
            
            // Set status to processing
            await db.updateArquivoStatus(arquivoId, "processando");
            
            const parseResult = await parseFile(buffer, input.nome);
            
            console.log('[Upload] Parse completed in', ((Date.now() - startTime) / 1000).toFixed(1), 's:', {
              success: parseResult.success,
              procedimentosCount: parseResult.procedimentos.length,
              comMedico: parseResult.procedimentos.filter(p => p.nomeMedico).length
            });
            
            if (parseResult.success && parseResult.procedimentos.length > 0) {
              // Agrupar procedimentos por código de prestador executante
              const procedimentosPorPrestador: Record<string, typeof parseResult.procedimentos> = {};
              
              for (const proc of parseResult.procedimentos) {
                const codigoPrestador = proc.codigoPrestadorExecutante || 'SEM_PRESTADOR';
                if (!procedimentosPorPrestador[codigoPrestador]) {
                  procedimentosPorPrestador[codigoPrestador] = [];
                }
                procedimentosPorPrestador[codigoPrestador].push(proc);
              }
              
              const prestadoresKeys = Object.keys(procedimentosPorPrestador);
              console.log('[Upload] Prestadores encontrados:', prestadoresKeys);
              console.log('[Upload] Distribuição por prestador:', 
                prestadoresKeys.map(k => `${k}: ${procedimentosPorPrestador[k].length} itens`)
              );
              
              // Verificar se há múltiplos prestadores e buscar estabelecimentos associados
              const prestadoresComEstabelecimento: Array<{
                codigoPrestador: string;
                estabelecimentoId: number;
                procedimentos: typeof parseResult.procedimentos;
              }> = [];
              
              for (const codigoPrestador of prestadoresKeys) {
                const procs = procedimentosPorPrestador[codigoPrestador];
                if (codigoPrestador === 'SEM_PRESTADOR') {
                  // Procedimentos sem prestador vão para o estabelecimento do arquivo
                  prestadoresComEstabelecimento.push({
                    codigoPrestador,
                    estabelecimentoId: input.estabelecimentoId,
                    procedimentos: procs,
                  });
                } else {
                  // Buscar estabelecimento associado ao prestador
                  const prestadorCadastrado = await db.getPrestadorPorCodigo(codigoPrestador, input.convenioId);
                  if (prestadorCadastrado) {
                    prestadoresComEstabelecimento.push({
                      codigoPrestador,
                      estabelecimentoId: prestadorCadastrado.estabelecimentoId,
                      procedimentos: procs,
                    });
                    console.log(`[Upload] Prestador ${codigoPrestador} associado ao estabelecimento ${prestadorCadastrado.estabelecimentoNome}`);
                  } else {
                    // Prestador não cadastrado - usar estabelecimento do arquivo
                    prestadoresComEstabelecimento.push({
                      codigoPrestador,
                      estabelecimentoId: input.estabelecimentoId,
                      procedimentos: procs,
                    });
                    console.log(`[Upload] Prestador ${codigoPrestador} não cadastrado - usando estabelecimento do arquivo`);
                  }
                }
              }
              
              // Converter todos os procedimentos para inserção
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
              
              // Salvar informações sobre prestadores encontrados no arquivo
              // Isso permite filtrar na tela de Contas
              if (prestadoresComEstabelecimento.length > 1) {
                console.log(`[Upload] Arquivo contém ${prestadoresComEstabelecimento.length} prestadores diferentes`);
              }
              
              await db.updateArquivoStatus(arquivoId, "processado");
              await db.updateArquivoProgresso(arquivoId, 100, procedimentosToInsert.length, procedimentosToInsert.length);
              
              const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(`[Upload] Background processing completed in ${totalTime}s:`, input.nome);
              
              // Gerar insights de IA automaticamente após processamento (apenas para arquivos enviados/XML)
              if (input.direcao === "enviado" && input.tipoArquivo === "xml") {
                try {
                  console.log('[Upload] Gerando insights de IA para arquivo:', arquivoId);
                  const resultadoIA = await db.processarInsightsAutomaticos({
                    arquivoId,
                    estabelecimentoId: input.estabelecimentoId,
                    convenioId: input.convenioId,
                    userId: ctx.user.id!,
                  });
                  console.log('[Upload] Insights gerados:', resultadoIA.insightsGerados, 'críticos:', resultadoIA.insightsCriticos);
                } catch (iaError) {
                  // Não falhar o upload se a geração de insights falhar
                  console.error('[Upload] Erro ao gerar insights de IA:', iaError);
                }
              }
              
              // Processar arquivos de retorno: Popular tabela DEMONSTRATIVO unificada
              if (input.direcao === "retornado") {
                try {
                  // Converter datas do input
                  const dataReferenciaUpload = input.dataReferencia ? new Date(input.dataReferencia) : undefined;
                  const dataPagamentoUpload = input.dataPagamento ? new Date(input.dataPagamento) : undefined;
                  
                  // Excluir dados antigos deste arquivo se for reimportação
                  if (isReimportacao) {
                    await db.deleteDemonstrativoByArquivo(arquivoId);
                    console.log('[Upload] Dados antigos de demonstrativo excluídos para reimportação');
                  }
                  
                  // Importar para tabela DEMONSTRATIVO unificada
                  if (input.tipoArquivo === "excel") {
                    console.log('[Upload] Processando arquivo Excel de retorno para demonstrativo:', arquivoId);
                    
                    try {
                      const { parseExcelToDemonstrativo } = await import('./demonstrativoParser');
                      const recordsDemo = parseExcelToDemonstrativo(
                        buffer,
                        arquivoId,
                        input.convenioId,
                        dataReferenciaUpload,
                        dataPagamentoUpload
                      );
                      if (recordsDemo.length > 0) {
                        const totalDemo = await db.insertDemonstrativoBatch(recordsDemo);
                        console.log('[Upload] Demonstrativo Excel importado:', totalDemo, 'itens');
                      } else {
                        console.log('[Upload] Nenhum item de demonstrativo encontrado no arquivo Excel');
                      }
                    } catch (excelError) {
                      console.error('[Upload] Erro ao importar demonstrativo Excel:', excelError);
                    }
                  } else if (input.tipoArquivo === "xml") {
                    console.log('[Upload] Processando arquivo XML de retorno para demonstrativo:', arquivoId);
                    
                    try {
                      const recebimentoResult = await parseXmlRecebimentoTiss(
                        buffer,
                        arquivoId,
                        input.estabelecimentoId,
                        input.convenioId,
                        dataReferenciaUpload,
                        dataPagamentoUpload
                      );
                      
                      if (recebimentoResult && recebimentoResult.success && recebimentoResult.items.length > 0) {
                        // Converter para formato demonstrativo
                        const { parseXmlToDemonstrativo } = await import('./demonstrativoParser');
                        const recordsDemo = parseXmlToDemonstrativo(
                          recebimentoResult.items,
                          arquivoId,
                          input.convenioId,
                          dataReferenciaUpload,
                          dataPagamentoUpload
                        );
                        const totalDemo = await db.insertDemonstrativoBatch(recordsDemo);
                        console.log('[Upload] Demonstrativo XML importado:', totalDemo, 'itens');
                      } else if (recebimentoResult && !recebimentoResult.success) {
                        console.error('[Upload] Erro ao processar demonstrativo XML:', recebimentoResult.error);
                      } else {
                        console.log('[Upload] Nenhum item de demonstrativo encontrado no arquivo XML');
                      }
                    } catch (xmlError) {
                      console.error('[Upload] Erro ao importar demonstrativo XML:', xmlError);
                    }
                  }
                } catch (recebimentoError) {
                  // Não falhar o upload se a importação de demonstrativo falhar
                  console.error('[Upload] Erro ao importar demonstrativo:', recebimentoError);
                }
              }
            } else if (!parseResult.success) {
              await db.updateArquivoStatus(arquivoId, "erro");
            } else {
              await db.updateArquivoStatus(arquivoId, "processado");
              await db.updateArquivoProgresso(arquivoId, 100, 0, 0);
            }
          } catch (error) {
            console.error("[Upload] Error in background processing:", error);
            try {
              await db.updateArquivoStatus(arquivoId, "erro");
            } catch (dbError) {
              console.error("[Upload] Failed to update status to erro:", dbError);
            }
          } finally {
            // Limpar timeout se ainda estiver ativo
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        };
        
        // Start background processing without awaiting
        // This allows the response to return immediately
        processInBackground().catch(async (err) => {
          console.error('[Upload] Unhandled error in background processing:', err);
          // Garantir que o status seja atualizado para erro em caso de falha não tratada
          try {
            await db.updateArquivoStatus(arquivoId, "erro");
          } catch (dbError) {
            console.error('[Upload] Failed to update status after unhandled error:', dbError);
          }
        });
        
        // Return immediately - user can check progress via status endpoint
        return { id: arquivoId, s3Url: url, reimportado: isReimportacao, processandoEmBackground: true };
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

    // Corrigir arquivos travados em processando
    corrigirTravados: protectedProcedure
      .input(z.object({ minutosTimeout: z.number().optional() }).optional())
      .mutation(async ({ input }) => {
        const minutosTimeout = input?.minutosTimeout || 10;
        return db.corrigirArquivosTravados(minutosTimeout);
      }),

    // Verificar arquivos em processamento
    processando: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return db.getArquivosProcessando(input?.estabelecimentoId);
      }),

    // Verificar status de um arquivo específico
    status: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const arquivo = await db.getArquivoById(input.id);
        if (!arquivo) return null;
        return {
          id: arquivo.id,
          nome: arquivo.nome,
          status: arquivo.status,
          progresso: arquivo.progresso || 0,
          itensProcessados: arquivo.itensProcessados || 0,
          totalItens: arquivo.totalItens || 0,
        };
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

  // ============ INSIGHTS DE IA ============
  insightsIA: router({
    // Gerar insights para um arquivo
    gerar: protectedProcedure
      .input(
        z.object({
          arquivoId: z.number(),
          estabelecimentoId: z.number(),
          convenioId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const insights = await db.gerarInsightsContaIA({
          arquivoId: input.arquivoId,
          estabelecimentoId: input.estabelecimentoId,
          convenioId: input.convenioId,
          userId: ctx.user.id!,
        });
        return insights;
      }),

    // Listar insights de um arquivo ou estabelecimento
    list: protectedProcedure
      .input(
        z.object({
          arquivoId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          convenioId: z.number().optional(),
          status: z.enum(["pendente", "aceito", "rejeitado", "ignorado"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getInsightsIA(input);
      }),

    // Atualizar status de um insight
    atualizarStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pendente", "aceito", "rejeitado", "ignorado"]),
          feedback: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const success = await db.atualizarStatusInsightIA(input.id, input.status, input.feedback);
        return { success };
      }),

    // Aprender padrões de um convênio/estabelecimento
    aprenderPadroes: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number(),
          convenioId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const resultado = await db.analisarPadroesCobranca({
          estabelecimentoId: input.estabelecimentoId,
          convenioId: input.convenioId,
        });
        return resultado;
      }),

    // Listar padrões aprendidos
    padroes: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number(),
          convenioId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getPadroesCobranca(input);
      }),

    // Métricas de acurácia dos insights
    metricas: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number().optional(),
          convenioId: z.number().optional(),
          dataInicio: z.date().optional(),
          dataFim: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getMetricasAcuraciaIA(input);
      }),

    // Verificar e notificar insights críticos
    verificarCriticos: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number(),
          limiarImpacto: z.number().optional(),
          limiarConfianca: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.verificarENotificarInsightsCriticos(input);
      }),

    // Processar insights automaticamente após importação
    processarAutomatico: protectedProcedure
      .input(
        z.object({
          arquivoId: z.number(),
          estabelecimentoId: z.number(),
          convenioId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return db.processarInsightsAutomaticos({
          ...input,
          userId: ctx.user.id!,
        });
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
            estabelecimentoId: z.number().optional(),
            search: z.string().optional(),
            nomeMedico: z.string().optional(),
            crmMedico: z.string().optional(),
            codigoPrestadorExecutante: z.string().optional(),
            statusGlosa: z.enum(["todos", "pago", "glosado", "parcial"]).optional(),
            apenasRetornados: z.boolean().optional(),
            direcaoArquivo: z.enum(["enviado", "retornado"]).optional(),
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
          estabelecimentoId: input?.estabelecimentoId,
          search: input?.search,
          nomeMedico: input?.nomeMedico,
          crmMedico: input?.crmMedico,
          codigoPrestadorExecutante: input?.codigoPrestadorExecutante,
          statusGlosa: input?.statusGlosa,
          apenasRetornados: input?.apenasRetornados,
          direcaoArquivo: input?.direcaoArquivo,
          mesReferencia: input?.mesReferencia,
          anoReferencia: input?.anoReferencia,
          page: input?.page || 1,
          pageSize: input?.pageSize || 20,
        });
      }),

    // Listar prestadores executantes únicos para filtro
    listarPrestadoresExecutantes: protectedProcedure
      .input(z.object({ 
        estabelecimentoId: z.number().optional(),
        convenioId: z.number().optional()
      }).optional())
      .query(async ({ input }) => {
        return db.listarPrestadoresExecutantes({
          estabelecimentoId: input?.estabelecimentoId,
          convenioId: input?.convenioId
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
          estabelecimentoId: input?.estabelecimentoId 
        });
        return arquivos.slice(0, input?.limit || 10);
      }),
  }),

  // ============ FATURAMENTO ============
  faturamento: router({
    porConvenio: protectedProcedure
      .input(z.object({ 
        estabelecimentoId: z.number().optional(),
        mesReferencia: z.number().optional(),
        anoReferencia: z.number().optional(),
        codigoPrestadorExecutante: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getFaturamentoPorConvenio(
          ctx.user.id, 
          input?.estabelecimentoId,
          input?.mesReferencia,
          input?.anoReferencia,
          input?.codigoPrestadorExecutante
        );
      }),

    porMes: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          meses: z.number().default(12),
          estabelecimentoId: z.number().optional(),
          anoReferencia: z.number().optional(),
          codigoPrestadorExecutante: z.string().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getFaturamentoPorMes(
          ctx.user.id,
          input?.convenioId,
          input?.meses || 12,
          input?.estabelecimentoId,
          input?.anoReferencia,
          input?.codigoPrestadorExecutante
        );
      }),

    resumoGeral: protectedProcedure
      .input(z.object({ 
        estabelecimentoId: z.number().optional(),
        mesReferencia: z.number().optional(),
        anoReferencia: z.number().optional(),
        codigoPrestadorExecutante: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getResumoGeral(
          ctx.user.id, 
          input?.estabelecimentoId,
          input?.mesReferencia,
          input?.anoReferencia,
          input?.codigoPrestadorExecutante
        );
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

    // Atualizar valor recebido e data de pagamento de um item de recurso
    atualizarPagamentoItem: protectedProcedure
      .input(
        z.object({
          recursoId: z.number(),
          valorRecebido: z.string().optional(),
          dataPagamento: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updateData: any = {};
        
        if (input.valorRecebido !== undefined) {
          updateData.valorRecebido = input.valorRecebido;
        }
        
        if (input.dataPagamento !== undefined && input.dataPagamento !== "") {
          updateData.dataPagamento = new Date(input.dataPagamento);
        } else if (input.dataPagamento === "") {
          updateData.dataPagamento = null;
        }
        
        await db.updateRecursoGlosa(
          input.recursoId,
          ctx.user.id,
          updateData,
          "Atualização de pagamento do recurso"
        );
        
        // Recalcular o total do lote após atualização do item
        const recurso = await db.getRecursoById(input.recursoId);
        if (recurso && recurso.loteId) {
          await db.recalcularTotalLote(recurso.loteId);
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
              estabelecimentoId: z.number().optional(), // ID do estabelecimento
              codigoProcedimento: z.string().optional(),
              descricaoProcedimento: z.string().optional(),
              guiaNumero: z.string().optional(),
              pacienteNome: z.string().optional(),
              pacienteCarteirinha: z.string().optional(),
              valorCobrado: z.string().optional(),
              valorGlosado: z.string().optional(),
              motivoGlosaConvenio: z.string().optional(),
            })
          ),
          estabelecimentoId: z.number().optional(), // ID do estabelecimento (para todos os itens)
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
              estabelecimentoId: item.estabelecimentoId || input.estabelecimentoId,
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

    // ============ RECURSOS AGRUPADOS POR CONVÊNIO ============
    agrupadosPorConvenio: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number().optional(),
          status: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return db.getRecursosAgrupadosPorConvenio({
          estabelecimentoId: input?.estabelecimentoId,
          status: input?.status,
        });
      }),

    recursosDoConvenio: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          estabelecimentoId: z.number().optional(),
          status: z.string().optional(),
          apenasNaoEnviados: z.boolean().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getRecursosDoConvenio({
          convenioId: input.convenioId,
          estabelecimentoId: input.estabelecimentoId,
          status: input.status,
          apenasNaoEnviados: input.apenasNaoEnviados,
        });
      }),

    criarLote: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          estabelecimentoId: z.number(),
          recursosIds: z.array(z.number()),
          descricao: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return db.criarLoteRecurso({
          convenioId: input.convenioId,
          estabelecimentoId: input.estabelecimentoId,
          userId: ctx.user.id,
          recursosIds: input.recursosIds,
          descricao: input.descricao,
        });
      }),

    enviarLote: protectedProcedure
      .input(
        z.object({
          loteId: z.number(),
          protocoloEnvio: z.string().optional(),
          dataPrazoPagamento: z.date().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.enviarLoteRecurso({
          loteId: input.loteId,
          protocoloEnvio: input.protocoloEnvio,
          dataPrazoPagamento: input.dataPrazoPagamento,
        });
      }),

    // ============ EXPORTAÇÃO DE RECURSOS ============
    exportar: protectedProcedure
      .input(
        z.object({
          formato: z.enum(["excel", "pdf"]),
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          status: z.string().optional(),
          dataInicio: z.date().optional(),
          dataFim: z.date().optional(),
          ids: z.array(z.number()).optional(), // IDs específicos para exportar
        })
      )
      .mutation(async ({ input, ctx }) => {
        const recursos = await db.getRecursosParaExportacao(ctx.user.id, {
          convenioId: input.convenioId,
          estabelecimentoId: input.estabelecimentoId,
          status: input.status,
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          ids: input.ids,
        });

        if (recursos.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum recurso encontrado para exportação" });
        }

        // Formatar dados para exportação
        const dadosExportacao = recursos.map((r, index) => ({
          numero: index + 1,
          convenio: r.convenioNome,
          estabelecimento: r.estabelecimentoNome,
          guia: r.guiaNumero || "N/A",
          paciente: r.pacienteNome || "N/A",
          codigoProcedimento: r.codigoProcedimento || "N/A",
          descricaoProcedimento: r.descricaoProcedimento || "N/A",
          valorCobrado: r.valorCobrado ? parseFloat(r.valorCobrado) : 0,
          valorGlosado: r.valorGlosado ? parseFloat(r.valorGlosado) : 0,
          valorRecuperado: r.valorRecuperado ? parseFloat(r.valorRecuperado) : 0,
          motivoGlosa: r.motivoGlosaConvenio || "N/A",
          justificativaRecurso: r.justificativaRecurso || "N/A",
          status: r.status,
          prioridade: r.prioridade,
          protocolo: r.protocoloRecurso || "N/A",
          dataGlosa: r.dataGlosa ? new Date(r.dataGlosa).toLocaleDateString("pt-BR") : "N/A",
          dataEnvio: r.dataEnvioRecurso ? new Date(r.dataEnvioRecurso).toLocaleDateString("pt-BR") : "N/A",
          dataResposta: r.dataResposta ? new Date(r.dataResposta).toLocaleDateString("pt-BR") : "N/A",
          respostaConvenio: r.respostaConvenio || "N/A",
          dataCriacao: new Date(r.createdAt).toLocaleDateString("pt-BR"),
        }));

        // Calcular totais
        const totais = {
          totalRecursos: recursos.length,
          totalValorCobrado: dadosExportacao.reduce((sum, r) => sum + r.valorCobrado, 0),
          totalValorGlosado: dadosExportacao.reduce((sum, r) => sum + r.valorGlosado, 0),
          totalValorRecuperado: dadosExportacao.reduce((sum, r) => sum + r.valorRecuperado, 0),
        };

        return {
          dados: dadosExportacao,
          totais,
          formato: input.formato,
          dataExportacao: new Date().toISOString(),
        };
      }),

    // Exportar recursos de um lote específico
    exportarLote: protectedProcedure
      .input(
        z.object({
          loteId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const dados = await db.getRecursosLoteParaExportacao(input.loteId);
        if (!dados) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado" });
        }
        return dados;
      }),

    // Anexar PDF de protocolo ao lote
    anexarProtocoloLote: protectedProcedure
      .input(
        z.object({
          loteId: z.number(),
          anexoUrl: z.string(),
          anexoKey: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const sucesso = await db.atualizarAnexoProtocoloLote(
          input.loteId,
          input.anexoUrl,
          input.anexoKey
        );
        if (!sucesso) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao anexar protocolo" });
        }
        return { sucesso: true };
      }),

    // Exportar XML ANS/TISS para recurso de glosa
    exportarXml: protectedProcedure
      .input(
        z.object({
          loteId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const xml = await db.gerarXmlRecursoGlosa(input.loteId);
        if (!xml) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado ou sem recursos" });
        }
        return { xml };
      }),
  }),

  // ============ CONCILIAÇÃO AUTOMÁTICA ============
  conciliacao: router({
    // Buscar dados para conciliação por convênio
    porConvenio: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          estabelecimentoId: z.number().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
          mesReferencia: z.number().min(1).max(12).optional(),
          anoReferencia: z.number().min(2000).max(2100).optional(),
          pagina: z.number().min(1).optional().default(1),
          itensPorPagina: z.number().min(10).max(500).optional().default(100),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getConciliacaoPorConvenio({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          estabelecimentoId: input.estabelecimentoId,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
          pagina: input.pagina,
          itensPorPagina: input.itensPorPagina,
        });
      }),

    // Resumo da conciliação por convênio
    resumo: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          mesReferencia: z.number().min(1).max(12).optional(),
          anoReferencia: z.number().min(2000).max(2100).optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getResumoConciliacao({
          convenioId: input?.convenioId,
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId,
        });
      }),

    // Buscar conciliação agrupada por conta
    agrupadaPorConta: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          estabelecimentoId: z.number().optional(),
          mesReferencia: z.number().min(1).max(12),
          anoReferencia: z.number().min(2000).max(2100),
          pagina: z.number().min(1).optional().default(1),
          itensPorPagina: z.number().min(10).max(200).optional().default(50),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getConciliacaoAgrupadaPorConta({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          estabelecimentoId: input.estabelecimentoId,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
          pagina: input.pagina,
          itensPorPagina: input.itensPorPagina,
        });
      }),

    // Buscar detalhes de uma conta específica
    detalhesConta: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          guiaNumero: z.string(),
          estabelecimentoId: z.number().optional(),
          mesReferencia: z.number().min(1).max(12).optional(),
          anoReferencia: z.number().min(2000).max(2100).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getDetalhesConta({
          convenioId: input.convenioId,
          guiaNumero: input.guiaNumero,
          userId: ctx.user.id,
          estabelecimentoId: input.estabelecimentoId,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
        });
      }),

    // Buscar itens não recebidos (pendentes de pagamento)
    naoRecebidos: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          mesReferencia: z.number().min(1).max(12).optional(),
          anoReferencia: z.number().min(2000).max(2100).optional(),
          pagina: z.number().min(1).optional().default(1),
          itensPorPagina: z.number().min(10).max(500).optional().default(50),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getItensNaoRecebidos({
          convenioId: input.convenioId,
          userId: ctx.user.id,
          estabelecimentoId: input.estabelecimentoId,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
          pagina: input.pagina,
          itensPorPagina: input.itensPorPagina,
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
          estabelecimentoId: z.number().optional(),
          meses: z.number().optional().default(6),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciasGlosa({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          estabelecimentoId: input?.estabelecimentoId,
          meses: input?.meses || 6,
        });
      }),

    // Tendência geral (todos os convênios)
    geral: protectedProcedure
      .input(
        z.object({
          estabelecimentoId: z.number().optional(),
          meses: z.number().optional().default(6),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getTendenciaGeral({
          userId: ctx.user.id,
          estabelecimentoId: input?.estabelecimentoId,
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
          estabelecimentoId: z.number().optional(),
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
          estabelecimentoId: input?.estabelecimentoId,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
          search: input?.search,
          page: input?.page || 1,
          pageSize: input?.pageSize || 50,
        });
      }),

    // Exportar todos os dados sem paginação
    exportAll: protectedProcedure
      .input(
        z.object({
          convenioId: z.number().optional(),
          estabelecimentoId: z.number().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
          search: z.string().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        return db.getRepasseData({
          userId: ctx.user.id,
          convenioId: input?.convenioId,
          estabelecimentoId: input?.estabelecimentoId,
          dataInicio: input?.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input?.dataFim ? new Date(input.dataFim) : undefined,
          search: input?.search,
          page: 1,
          pageSize: 100000, // Buscar todos os registros
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
          estabelecimentoId: z.number().optional(),
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
          estabelecimentoId: input?.estabelecimentoId,
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
          estabelecimentoId: z.number().optional(), // Estabelecimento específico ou null para global
          tipo: z.enum(["diarias", "mat_med", "taxas", "procedimentos"]),
          codigo: z.string(),
          nome: z.string(),
          valor: z.string(),
          vigenciaInicio: z.string(),
          unidade: z.string().optional(),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const vigenciaInicio = new Date(input.vigenciaInicio);
        
        const id = await db.createTabelaPreco({
          convenioId: input.convenioId,
          estabelecimentoId: input.estabelecimentoId || null,
          tipo: input.tipo,
          codigo: input.codigo,
          nome: input.nome,
          valor: input.valor,
          vigenciaInicio,
          unidade: input.unidade,
          observacao: input.observacao,
        });
        
        // Registrar histórico de criação
        if (id) {
          await db.registrarHistoricoPreco({
            tabelaPrecoId: id,
            userId: ctx.user.id,
            tipoAlteracao: "criacao",
            valorNovo: input.valor,
            vigenciaInicioNovo: vigenciaInicio,
            nomeNovo: input.nome,
            codigoNovo: input.codigo,
          });
        }
        
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
          unidade: z.string().optional(),
          observacao: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        
        // Buscar dados anteriores para o histórico
        const itemAnterior = await db.getTabelaPrecoById(id);
        
        const updateData: any = {};
        if (data.codigo) updateData.codigo = data.codigo;
        if (data.nome) updateData.nome = data.nome;
        if (data.valor) updateData.valor = data.valor;
        if (data.vigenciaInicio) updateData.vigenciaInicio = new Date(data.vigenciaInicio);
        if (data.unidade !== undefined) updateData.unidade = data.unidade;
        if (data.observacao !== undefined) updateData.observacao = data.observacao;
        
        const success = await db.updateTabelaPreco(id, updateData);
        
        // Registrar histórico de edição
        if (success && itemAnterior) {
          await db.registrarHistoricoPreco({
            tabelaPrecoId: id,
            userId: ctx.user.id,
            tipoAlteracao: "edicao",
            // Valores anteriores
            valorAnterior: itemAnterior.valor,
            vigenciaInicioAnterior: itemAnterior.vigenciaInicio,
            nomeAnterior: itemAnterior.nome,
            codigoAnterior: itemAnterior.codigo,
            // Valores novos
            valorNovo: data.valor || itemAnterior.valor,
            vigenciaInicioNovo: data.vigenciaInicio ? new Date(data.vigenciaInicio) : itemAnterior.vigenciaInicio,
            nomeNovo: data.nome || itemAnterior.nome,
            codigoNovo: data.codigo || itemAnterior.codigo,
          });
        }
        
        return { success };
      }),

    // Excluir item (soft delete)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Buscar dados anteriores para o histórico
        const itemAnterior = await db.getTabelaPrecoById(input.id);
        
        const success = await db.deleteTabelaPreco(input.id);
        
        // Registrar histórico de exclusão
        if (success && itemAnterior) {
          await db.registrarHistoricoPreco({
            tabelaPrecoId: input.id,
            userId: ctx.user.id,
            tipoAlteracao: "exclusao",
            valorAnterior: itemAnterior.valor,
            vigenciaInicioAnterior: itemAnterior.vigenciaInicio,
            nomeAnterior: itemAnterior.nome,
            codigoAnterior: itemAnterior.codigo,
          });
        }
        
        return { success };
      }),

    // Contar itens por tipo
    contarPorTipo: protectedProcedure
      .input(z.object({ convenioId: z.number(), estabelecimentoId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.contarItensTabelaPreco(input.convenioId, input.estabelecimentoId);
      }),

    // Buscar histórico de alterações de um item
    getHistorico: protectedProcedure
      .input(z.object({ tabelaPrecoId: z.number() }))
      .query(async ({ input }) => {
        return db.getHistoricoPreco(input.tabelaPrecoId);
      }),

    // Buscar histórico de alterações por convênio (relatório)
    getHistoricoConvenio: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          tipo: z.string().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
          userId: z.number().optional(),
          tipoAlteracao: z.enum(["criacao", "edicao", "exclusao", "importacao"]).optional(),
          page: z.number().optional().default(1),
          limit: z.number().optional().default(50),
        })
      )
      .query(async ({ input }) => {
        return db.getHistoricoPrecosPorConvenio(input.convenioId, {
          tipo: input.tipo,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          userId: input.userId,
          tipoAlteracao: input.tipoAlteracao,
          page: input.page,
          limit: input.limit,
        });
      }),

    // Importar tabela de preços (Excel, CSV, DBF)
    importar: protectedProcedure
      .input(
        z.object({
          convenioId: z.number(),
          estabelecimentoId: z.number().optional(), // Estabelecimento específico ou null para global
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
            
            // Campo vigenciaFim removido conforme solicitação do usuário

            return {
              convenioId: input.convenioId,
              estabelecimentoId: input.estabelecimentoId || null, // Estabelecimento específico ou null para global
              tipo: input.tipo,
              codigo: String(codigo).trim(),
              nome: String(nome).trim(),
              valor: valor || "0",
              vigenciaInicio: parseDate(vigenciaInicioRaw),
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
        role: z.enum(["admin", "user", "tasy_user"]).optional(),
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

    // Excluir usuário do sistema
    excluirUsuario: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir usuários",
          });
        }
        const result = await db.deleteUsuario(input.userId, ctx.user.id);
        if (!result.success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
        }
        return result;
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

  // ============ ANÁLISE INTELIGENTE DE CONTAS (IA) ============
  ia: router({
    // Obter estatísticas por código de procedimento
    estatisticasPorCodigo: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getEstatisticasPorCodigo(input.estabelecimentoId, input.convenioId);
      }),

    // Identificar contas com valores fora da média (outliers)
    contasOutliers: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        limiteDesvio: z.number().default(2),
      }))
      .query(async ({ input }) => {
        return db.getContasOutliers(input.estabelecimentoId, input.convenioId, input.limiteDesvio);
      }),

    // Detectar padrões de erro por funcionário
    padroesErroPorFuncionario: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.getPadroesErroPorFuncionario(input.estabelecimentoId);
      }),

    // Buscar motivos de glosa por funcionário
    motivosGlosaPorFuncionario: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        userId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.getMotivosGlosaPorFuncionario(input.estabelecimentoId, input.userId);
      }),

    // Calcular risco de glosa para contas
    riscoGlosa: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.calcularRiscoGlosa(input.estabelecimentoId, input.arquivoId);
      }),

    // Gerar alertas e recomendações da IA
    alertas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.gerarAlertasIA(input.estabelecimentoId);
      }),
  }),

  // ============ REGRAS DE IA ============
  regrasIA: router({
    // Listar todas as regras de IA
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRegrasIA(input?.estabelecimentoId);
      }),

    // Buscar regra por ID
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRegraIAById(input.id);
      }),

    // Buscar regra por código
    getPorCodigo: protectedProcedure
      .input(z.object({
        codigo: z.string(),
        estabelecimentoId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getRegraIAPorCodigo(input.codigo, input.estabelecimentoId);
      }),

    // Criar nova regra
    create: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        codigo: z.string().min(1),
        nome: z.string().min(1),
        descricao: z.string().optional(),
        categoria: z.enum(['outlier', 'padrao_erro', 'risco_glosa', 'tendencia', 'comparacao']),
        tipoAlerta: z.enum(['critico', 'alerta', 'info']).optional(),
        parametros: z.object({
          limiteDesvioAbaixo: z.number().optional(),
          limiteDesvioAcima: z.number().optional(),
          minimoContasHistorico: z.number().optional(),
          periodoAnalise: z.number().optional(),
          taxaGlosaMinima: z.number().optional(),
          minimoProcedimentos: z.number().optional(),
          periodoMeses: z.number().optional(),
          scoreRiscoMinimo: z.number().optional(),
          historicoMinimoContas: z.number().optional(),
          variacaoMinima: z.number().optional(),
          periodoComparacao: z.number().optional(),
          maxResultados: z.number().optional(),
        }).optional(),
        prioridade: z.number().optional(),
        ativo: z.enum(['sim', 'nao']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createRegraIA({
          ...input,
          criadoPor: ctx.user.id,
        });
      }),

    // Atualizar regra existente
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        tipoAlerta: z.enum(['critico', 'alerta', 'info']).optional(),
        parametros: z.object({
          limiteDesvioAbaixo: z.number().optional(),
          limiteDesvioAcima: z.number().optional(),
          minimoContasHistorico: z.number().optional(),
          periodoAnalise: z.number().optional(),
          taxaGlosaMinima: z.number().optional(),
          minimoProcedimentos: z.number().optional(),
          periodoMeses: z.number().optional(),
          scoreRiscoMinimo: z.number().optional(),
          historicoMinimoContas: z.number().optional(),
          variacaoMinima: z.number().optional(),
          periodoComparacao: z.number().optional(),
          maxResultados: z.number().optional(),
        }).optional(),
        prioridade: z.number().optional(),
        ativo: z.enum(['sim', 'nao']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        return db.updateRegraIA(id, {
          ...data,
          atualizadoPor: ctx.user.id,
        });
      }),

    // Excluir regra
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteRegraIA(input.id);
      }),

    // Ativar/desativar regra
    toggle: protectedProcedure
      .input(z.object({
        id: z.number(),
        ativo: z.enum(['sim', 'nao']),
      }))
      .mutation(async ({ input }) => {
        return db.toggleRegraIA(input.id, input.ativo);
      }),

    // Restaurar regra para valores padrão
    restaurarPadrao: protectedProcedure
      .input(z.object({
        codigo: z.string(),
        estabelecimentoId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.restaurarRegraPadrao(input.codigo, input.estabelecimentoId);
      }),
  }),

  // ============ IMPORTAÇÃO DE DADOS DO TASY ============
  importacaoTasy: router({
    // Criar nova importação (simples, sem upload)
    criar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        nomeArquivo: z.string(),
        tamanhoArquivo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const importacao = await db.createImportacaoTasy({
          estabelecimentoId: input.estabelecimentoId,
          userId: ctx.user.id,
          nomeArquivo: input.nomeArquivo,
          tamanhoArquivo: input.tamanhoArquivo,
          status: 'aguardando',
          progresso: 0,
        });
        return { id: importacao.id };
      }),

    // Criar nova importação (upload de arquivo SQLite)
    upload: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        nomeArquivo: z.string(),
        tamanhoArquivo: z.number().optional(),
        conteudoBase64: z.string(), // Arquivo SQLite em base64
      }))
      .mutation(async ({ input, ctx }) => {
        // Cria o registro de importação
        const importacao = await db.createImportacaoTasy({
          estabelecimentoId: input.estabelecimentoId,
          userId: ctx.user.id,
          nomeArquivo: input.nomeArquivo,
          tamanhoArquivo: input.tamanhoArquivo,
          status: 'aguardando',
          progresso: 0,
        });

        // Salva o arquivo no S3 para processamento posterior
        const s3Key = `tasy-imports/${input.estabelecimentoId}/${importacao.id}/${sanitizeFilename(input.nomeArquivo)}`;
        const fileBuffer = Buffer.from(input.conteudoBase64, 'base64');
        const { url } = await storagePut(s3Key, fileBuffer, 'application/x-sqlite3');

        // Atualiza com a URL do S3
        await db.updateImportacaoTasy(importacao.id, {
          s3Key,
          s3Url: url,
        });

        return { id: importacao.id, s3Key, s3Url: url };
      }),

    // Processar importação (lê o SQLite e insere os dados)
    processar: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
        dados: z.array(z.object({
          atendimento: z.string(),
          nrInternoConta: z.string().optional(),
          sequencia: z.string().optional(),
          dataFaturado: z.string().optional(),
          guia: z.string().optional(),
          convenio: z.string().optional(),
          paciente: z.string().optional(),
          dataConta: z.string().optional(),
          codigo: z.string().optional(),
          codigoConvenio: z.string().optional(),
          descricao: z.string().optional(),
          quantidade: z.number().optional(),
          unidade: z.string().optional(),
          valorUnitario: z.number().optional(),
          valorTotal: z.number().optional(),
          setor: z.string().optional(),
          protocolo: z.string().optional(),
          statusProtocolo: z.string().optional(),
          tipo: z.enum(['MATERIAL', 'HONORARIO']),
          medico: z.string().optional(),
          funcaoMedico: z.string().optional(),
          crm: z.string().optional(),
          valorMedico: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        // Atualiza status para processando
        await db.updateImportacaoTasy(input.importacaoId, {
          status: 'processando',
          totalRegistros: input.dados.length,
        });

        // Prepara os registros para inserção
        const registros = input.dados.map(d => ({
          estabelecimentoId: importacao.estabelecimentoId,
          importacaoId: input.importacaoId,
          atendimento: d.atendimento,
          nrInternoConta: d.nrInternoConta || null,
          sequencia: d.sequencia || null,
          dataFaturado: d.dataFaturado ? new Date(d.dataFaturado) : null,
          guia: d.guia || null,
          convenio: d.convenio || null,
          paciente: d.paciente || null,
          dataConta: d.dataConta ? new Date(d.dataConta) : null,
          codigo: d.codigo || null,
          codigoConvenio: d.codigoConvenio || null,
          descricao: d.descricao || null,
          quantidade: d.quantidade?.toString() || null,
          unidade: d.unidade || null,
          valorUnitario: d.valorUnitario?.toString() || null,
          valorTotal: d.valorTotal?.toString() || null,
          setor: d.setor || null,
          protocolo: d.protocolo || null,
          statusProtocolo: d.statusProtocolo || null,
          tipo: d.tipo,
          medico: d.medico || null,
          funcaoMedico: d.funcaoMedico || null,
          crm: d.crm || null,
          valorMedico: d.valorMedico?.toString() || null,
        }));

        // Insere em lotes
        const resultado = await db.insertDadosTasyBatch(
          registros as any,
          importacao.estabelecimentoId
        );

        // Conta por tipo
        const totalMateriais = input.dados.filter(d => d.tipo === 'MATERIAL').length;
        const totalHonorarios = input.dados.filter(d => d.tipo === 'HONORARIO').length;

        // Calcula datas
        const datas = input.dados
          .filter(d => d.dataFaturado)
          .map(d => new Date(d.dataFaturado!));
        const dataInicio = datas.length > 0 ? new Date(Math.min(...datas.map(d => d.getTime()))) : null;
        const dataFim = datas.length > 0 ? new Date(Math.max(...datas.map(d => d.getTime()))) : null;

        // Atualiza estatísticas
        const status = resultado.erros > 0 ? 'concluido_parcial' : 'concluido';
        await db.updateImportacaoTasy(input.importacaoId, {
          status,
          progresso: 100,
          registrosImportados: resultado.inseridos,
          registrosIgnorados: resultado.ignorados,
          registrosErro: resultado.erros,
          totalMateriais,
          totalHonorarios,
          dataInicio,
          dataFim,
        });

        return {
          success: true,
          inseridos: resultado.inseridos,
          ignorados: resultado.ignorados,
          erros: resultado.erros,
        };
      }),

    // Listar importações
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        limite: z.number().optional().default(50),
      }))
      .query(async ({ input }) => {
        return db.getImportacoesTasy(input.estabelecimentoId, input.limite);
      }),

    // Buscar importação por ID
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getImportacaoTasyById(input.id);
      }),

    // Excluir importação e seus dados
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteImportacaoTasy(input.id);
      }),

    // Buscar dados importados
    dados: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        tipo: z.enum(['MATERIAL', 'HONORARIO']).optional(),
        atendimento: z.string().optional(),
        guia: z.string().optional(),
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const filtros = {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          tipo: input.tipo,
          atendimento: input.atendimento,
          guia: input.guia,
          limite: input.limite,
          offset: input.offset,
        };
        return db.getDadosTasy(input.estabelecimentoId, filtros);
      }),

    // Contar dados importados
    count: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        tipo: z.enum(['MATERIAL', 'HONORARIO']).optional(),
      }))
      .query(async ({ input }) => {
        const filtros = {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          tipo: input.tipo,
        };
        return db.countDadosTasy(input.estabelecimentoId, filtros);
      }),

    // Estatísticas gerais
    estatisticas: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getEstatisticasTasy(input.estabelecimentoId);
      }),

    // Dados agrupados por convênio
    porConvenio: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getDadosTasyPorConvenio(input.estabelecimentoId);
      }),

    // Upload automático via API (para script Python)
    uploadAutomatico: publicProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        nomeArquivo: z.string(),
        tamanhoArquivo: z.number().optional(),
        apiKey: z.string(), // Chave de API para autenticação
        dados: z.array(z.object({
          atendimento: z.string(),
          nrInternoConta: z.string().optional(),
          sequencia: z.string().optional(),
          dataFaturado: z.string().optional(),
          guia: z.string().optional(),
          convenio: z.string().optional(),
          paciente: z.string().optional(),
          dataConta: z.string().optional(),
          codigo: z.string().optional(),
          codigoConvenio: z.string().optional(),
          descricao: z.string().optional(),
          quantidade: z.number().optional(),
          unidade: z.string().optional(),
          valorUnitario: z.number().optional(),
          valorTotal: z.number().optional(),
          setor: z.string().optional(),
          protocolo: z.string().optional(),
          statusProtocolo: z.string().optional(),
          tipo: z.enum(['MATERIAL', 'HONORARIO']),
          medico: z.string().optional(),
          funcaoMedico: z.string().optional(),
          crm: z.string().optional(),
          valorMedico: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        // Valida a chave de API
        const apiKeyValida = await db.validarApiKey(input.apiKey, input.estabelecimentoId);
        if (!apiKeyValida) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Chave de API inválida ou sem permissão para este estabelecimento',
          });
        }

        // Cria o registro de importação
        const importacao = await db.createImportacaoTasy({
          estabelecimentoId: input.estabelecimentoId,
          userId: apiKeyValida.userId,
          nomeArquivo: input.nomeArquivo,
          tamanhoArquivo: input.tamanhoArquivo,
          status: 'processando',
          progresso: 0,
          totalRegistros: input.dados.length,
        });

        // Prepara os registros para inserção
        const registros = input.dados.map(d => ({
          estabelecimentoId: input.estabelecimentoId,
          importacaoId: importacao.id,
          atendimento: d.atendimento,
          nrInternoConta: d.nrInternoConta || null,
          sequencia: d.sequencia || null,
          dataFaturado: d.dataFaturado ? new Date(d.dataFaturado) : null,
          guia: d.guia || null,
          convenio: d.convenio || null,
          paciente: d.paciente || null,
          dataConta: d.dataConta ? new Date(d.dataConta) : null,
          codigo: d.codigo || null,
          codigoConvenio: d.codigoConvenio || null,
          descricao: d.descricao || null,
          quantidade: d.quantidade?.toString() || null,
          unidade: d.unidade || null,
          valorUnitario: d.valorUnitario?.toString() || null,
          valorTotal: d.valorTotal?.toString() || null,
          setor: d.setor || null,
          protocolo: d.protocolo || null,
          statusProtocolo: d.statusProtocolo || null,
          tipo: d.tipo,
          medico: d.medico || null,
          funcaoMedico: d.funcaoMedico || null,
          crm: d.crm || null,
          valorMedico: d.valorMedico?.toString() || null,
        }));

        // Insere em lotes
        const resultado = await db.insertDadosTasyBatch(
          registros as any,
          input.estabelecimentoId
        );

        // Conta por tipo
        const totalMateriais = input.dados.filter(d => d.tipo === 'MATERIAL').length;
        const totalHonorarios = input.dados.filter(d => d.tipo === 'HONORARIO').length;

        // Calcula datas
        const datas = input.dados
          .filter(d => d.dataFaturado)
          .map(d => new Date(d.dataFaturado!));
        const dataInicio = datas.length > 0 ? new Date(Math.min(...datas.map(d => d.getTime()))) : null;
        const dataFim = datas.length > 0 ? new Date(Math.max(...datas.map(d => d.getTime()))) : null;

        // Atualiza estatísticas
        const status = resultado.erros > 0 ? 'concluido_parcial' : 'concluido';
        await db.updateImportacaoTasy(importacao.id, {
          status,
          progresso: 100,
          registrosImportados: resultado.inseridos,
          registrosIgnorados: resultado.ignorados,
          registrosErro: resultado.erros,
          totalMateriais,
          totalHonorarios,
          dataInicio,
          dataFim,
        });

        return {
          success: true,
          importacaoId: importacao.id,
          inseridos: resultado.inseridos,
          ignorados: resultado.ignorados,
          erros: resultado.erros,
        };
      }),

    // Conciliação Tasy x XML
    conciliar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return db.compararTasyComXML(input.estabelecimentoId, input.arquivoId);
      }),

    // Resumo de conciliação por convênio
    resumoConciliacao: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getResumoConciliacaoTasy(input.estabelecimentoId);
      }),

    // Buscar dados para conciliação
    dadosParaConciliacao: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        atendimento: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getDadosTasyParaConciliacao(input.estabelecimentoId, {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          guia: input.guia,
          atendimento: input.atendimento,
        });
      }),

    // Marcar dados como processados
    marcarProcessados: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        procedimentoId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return db.marcarDadosTasyProcessados(input.ids, input.procedimentoId);
      }),

    // Validar dados do Tasy com regras de negócio
    validarComRegras: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        atendimento: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.validarDadosTasyComRegras(input.estabelecimentoId, {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          atendimento: input.atendimento,
        });
      }),

    // Resumo de validação por convênio
    resumoValidacao: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getResumoValidacaoTasyPorConvenio(input.estabelecimentoId);
      }),

    // Comparativo entre dois períodos
    comparativo: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        periodo1Mes: z.number().min(1).max(12),
        periodo1Ano: z.number().min(2000).max(2100),
        periodo2Mes: z.number().min(1).max(12),
        periodo2Ano: z.number().min(2000).max(2100),
        agrupamento: z.enum(['convenio', 'setor', 'medico', 'tipo']).default('convenio'),
      }))
      .query(async ({ input }) => {
        return db.getDadosTasyComparativo(
          input.estabelecimentoId,
          { mes: input.periodo1Mes, ano: input.periodo1Ano },
          { mes: input.periodo2Mes, ano: input.periodo2Ano },
          input.agrupamento
        );
      }),

    // ============ CONTAS PAGAS E ITENS PAGOS ============
    
    // Processar contas pagas do SQLite
    processarContasPagas: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
        dados: z.array(z.object({
          dataRetorno: z.string().optional(),
          seqRetornoGeral: z.string().optional(),
          titulo: z.string().optional(),
          guia: z.string().optional(),
          nrSeqConta: z.string().optional(),
          nrConta: z.string().optional(),
          convenio: z.string().optional(),
          nrProtocolo: z.string().optional(),
          dataRecebimento: z.string().optional(),
          pagoConta: z.number().optional(),
          glosaConta: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        const registros = input.dados.map(d => ({
          estabelecimentoId: importacao.estabelecimentoId,
          importacaoId: input.importacaoId,
          dataRetorno: d.dataRetorno ? new Date(d.dataRetorno) : null,
          seqRetornoGeral: d.seqRetornoGeral || null,
          titulo: d.titulo || null,
          guia: d.guia || null,
          nrSeqConta: d.nrSeqConta || null,
          nrConta: d.nrConta || null,
          convenio: d.convenio || null,
          nrProtocolo: d.nrProtocolo || null,
          dataRecebimento: d.dataRecebimento ? new Date(d.dataRecebimento) : null,
          pagoConta: d.pagoConta?.toString() || null,
          glosaConta: d.glosaConta?.toString() || null,
        }));

        const resultado = await db.insertContasPagasTasyBatch(
          registros as any,
          importacao.estabelecimentoId
        );

        return {
          success: true,
          inseridos: resultado.inseridos,
          erros: resultado.erros,
        };
      }),

    // Processar itens pagos do SQLite
    processarItensPagos: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
        dados: z.array(z.object({
          titulo: z.string().optional(),
          guia: z.string().optional(),
          nrSeqConta: z.string().optional(),
          conta: z.string().optional(),
          nrProtocolo: z.string().optional(),
          dataRecebimento: z.string().optional(),
          glosaItem: z.number().optional(),
          qndGlosaItem: z.number().optional(),
          motivoGlosa: z.string().optional(),
          procedimento: z.string().optional(),
          material: z.string().optional(),
          setor: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        const registros = input.dados.map(d => ({
          estabelecimentoId: importacao.estabelecimentoId,
          importacaoId: input.importacaoId,
          titulo: d.titulo || null,
          guia: d.guia || null,
          nrSeqConta: d.nrSeqConta || null,
          conta: d.conta || null,
          nrProtocolo: d.nrProtocolo || null,
          dataRecebimento: d.dataRecebimento ? new Date(d.dataRecebimento) : null,
          glosaItem: d.glosaItem?.toString() || null,
          qndGlosaItem: d.qndGlosaItem?.toString() || null,
          motivoGlosa: d.motivoGlosa || null,
          procedimento: d.procedimento || null,
          material: d.material || null,
          setor: d.setor || null,
        }));

        const resultado = await db.insertItensPagosTasyBatch(
          registros as any,
          importacao.estabelecimentoId
        );

        return {
          success: true,
          inseridos: resultado.inseridos,
          erros: resultado.erros,
        };
      }),

    // Buscar contas pagas
    contasPagas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.getContasPagasTasy(input.estabelecimentoId, {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          guia: input.guia,
          limite: input.limite,
          offset: input.offset,
        });
      }),

    // Buscar itens pagos
    itensPagos: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        guia: z.string().optional(),
        conta: z.string().optional(),
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.getItensPagosTasy(input.estabelecimentoId, {
          guia: input.guia,
          conta: input.conta,
          limite: input.limite,
          offset: input.offset,
        });
      }),

    // Conciliação completa Tasy (faturado x pago x glosado)
    conciliacaoCompleta: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        atendimento: z.string().optional(),
        mesAno: z.string().optional(), // Formato: "2024-01" para filtrar por mês/ano
      }))
      .query(async ({ input }) => {
        return db.getConciliacaoTasyCompleta(input.estabelecimentoId, {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          convenio: input.convenio,
          guia: input.guia,
          atendimento: input.atendimento,
          mesAno: input.mesAno,
        });
      }),

    // Buscar meses/anos disponíveis para filtro (da tabela dadosTasy)
    mesesDisponiveis: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getMesesDisponiveisTasy(input.estabelecimentoId);
      }),

    // Buscar convênios das contas pagas
    conveniosContasPagas: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getConveniosContasPagasTasy(input.estabelecimentoId);
      }),

    // ============ NOVAS ROTAS PARA TABELAS SEPARADAS ============

    // Processar procedimentos do Tasy (tabela separada)
    processarProcedimentos: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
        dados: z.array(z.object({
          atendimento: z.string(),
          nrInternoConta: z.string().optional(),
          guia: z.string().optional(),
          sequencia: z.string().optional(),
          dataFaturado: z.string().optional(),
          convenio: z.string().optional(),
          paciente: z.string().optional(),
          dataConta: z.string().optional(),
          codigo: z.string().optional(),
          codigoConvenio: z.string().optional(),
          descricao: z.string().optional(),
          quantidade: z.number().optional(),
          unidade: z.string().optional(),
          valorUnitario: z.number().optional(),
          valorTotal: z.number().optional(),
          setor: z.string().optional(),
          protocolo: z.string().optional(),
          statusProtocolo: z.string().optional(),
          medico: z.string().optional(),
          funcaoMedico: z.string().optional(),
          crm: z.string().optional(),
          valorMedico: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        const registros = input.dados.map(d => ({
          estabelecimentoId: importacao.estabelecimentoId,
          importacaoId: input.importacaoId,
          atendimento: d.atendimento,
          nrInternoConta: d.nrInternoConta || null,
          guia: d.guia || null,
          sequencia: d.sequencia || null,
          dataFaturado: d.dataFaturado ? new Date(d.dataFaturado) : null,
          convenio: d.convenio || null,
          paciente: d.paciente || null,
          dataConta: d.dataConta ? new Date(d.dataConta) : null,
          codigo: d.codigo || null,
          codigoConvenio: d.codigoConvenio || null,
          descricao: d.descricao || null,
          quantidade: d.quantidade?.toString() || null,
          unidade: d.unidade || null,
          valorUnitario: d.valorUnitario?.toString() || null,
          valorTotal: d.valorTotal?.toString() || null,
          setor: d.setor || null,
          protocolo: d.protocolo || null,
          statusProtocolo: d.statusProtocolo || null,
          medico: d.medico || null,
          funcaoMedico: d.funcaoMedico || null,
          crm: d.crm || null,
          valorMedico: d.valorMedico?.toString() || null,
        }));

        const resultado = await db.insertProcedimentosTasyBatch(
          registros as any,
          importacao.estabelecimentoId
        );

        return {
          success: true,
          inseridos: resultado.inseridos,
          erros: resultado.erros,
        };
      }),

    // Processar materiais/medicamentos do Tasy (tabela separada)
    processarMatMed: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
        dados: z.array(z.object({
          atendimento: z.string(),
          nrInternoConta: z.string().optional(),
          guia: z.string().optional(),
          sequencia: z.string().optional(),
          dataFaturado: z.string().optional(),
          convenio: z.string().optional(),
          paciente: z.string().optional(),
          dataConta: z.string().optional(),
          codigo: z.string().optional(),
          codigoConvenio: z.string().optional(),
          descricao: z.string().optional(),
          quantidade: z.number().optional(),
          unidade: z.string().optional(),
          valorUnitario: z.number().optional(),
          valorTotal: z.number().optional(),
          setor: z.string().optional(),
          protocolo: z.string().optional(),
          statusProtocolo: z.string().optional(),
          tipoItem: z.enum(['material', 'medicamento']).optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        const registros = input.dados.map(d => ({
          estabelecimentoId: importacao.estabelecimentoId,
          importacaoId: input.importacaoId,
          atendimento: d.atendimento,
          nrInternoConta: d.nrInternoConta || null,
          guia: d.guia || null,
          sequencia: d.sequencia || null,
          dataFaturado: d.dataFaturado ? new Date(d.dataFaturado) : null,
          convenio: d.convenio || null,
          paciente: d.paciente || null,
          dataConta: d.dataConta ? new Date(d.dataConta) : null,
          codigo: d.codigo || null,
          codigoConvenio: d.codigoConvenio || null,
          descricao: d.descricao || null,
          quantidade: d.quantidade?.toString() || null,
          unidade: d.unidade || null,
          valorUnitario: d.valorUnitario?.toString() || null,
          valorTotal: d.valorTotal?.toString() || null,
          setor: d.setor || null,
          protocolo: d.protocolo || null,
          statusProtocolo: d.statusProtocolo || null,
          tipoItem: d.tipoItem || 'material',
        }));

        const resultado = await db.insertMatMedTasyBatch(
          registros as any,
          importacao.estabelecimentoId
        );

        return {
          success: true,
          inseridos: resultado.inseridos,
          erros: resultado.erros,
        };
      }),

    // Gerar tabela contas_tasy unificada (junção de procedimentos + mat_med)
    gerarContasUnificadas: protectedProcedure
      .input(z.object({
        importacaoId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const importacao = await db.getImportacaoTasyById(input.importacaoId);
        if (!importacao) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Importação não encontrada',
          });
        }

        const resultado = await db.gerarContasTasyUnificadas(
          importacao.estabelecimentoId,
          input.importacaoId
        );

        return {
          success: true,
          contasCriadas: resultado.contasCriadas,
          itensCriados: resultado.itensCriados,
        };
      }),

    // Buscar contas unificadas
    contasUnificadas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        nrInternoConta: z.string().optional(),
        status: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        mesReferencia: z.number().optional(), // 1-12
        anoReferencia: z.number().optional(), // Ex: 2025
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        console.log('[contasUnificadas] Input:', JSON.stringify(input));
        const result = await db.getContasTasy(input.estabelecimentoId, {
          convenio: input.convenio,
          guia: input.guia,
          nrInternoConta: input.nrInternoConta,
          status: input.status,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          mesReferencia: input.mesReferencia,
          anoReferencia: input.anoReferencia,
          limite: input.limite,
          offset: input.offset,
        });
        console.log('[contasUnificadas] Result count:', result?.length || 0);
        return result;
      }),

    // Buscar itens de uma conta unificada
    itensContaUnificada: protectedProcedure
      .input(z.object({ contaTasyId: z.number() }))
      .query(async ({ input }) => {
        return db.getItensContaTasy(input.contaTasyId);
      }),

    // Buscar procedimentos separados
    procedimentosSeparados: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        importacaoId: z.number().optional(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        atendimento: z.string().optional(),
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.getProcedimentosTasy(input.estabelecimentoId, {
          importacaoId: input.importacaoId,
          convenio: input.convenio,
          guia: input.guia,
          atendimento: input.atendimento,
          limite: input.limite,
          offset: input.offset,
        });
      }),

    // Buscar mat/med separados
    matMedSeparados: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        importacaoId: z.number().optional(),
        convenio: z.string().optional(),
        guia: z.string().optional(),
        atendimento: z.string().optional(),
        tipoItem: z.enum(['material', 'medicamento']).optional(),
        limite: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.getMatMedTasy(input.estabelecimentoId, {
          importacaoId: input.importacaoId,
          convenio: input.convenio,
          guia: input.guia,
          atendimento: input.atendimento,
          tipoItem: input.tipoItem,
          limite: input.limite,
          offset: input.offset,
        });
      }),

    // Limpar dados de uma importação (para reimportação)
    limparImportacao: protectedProcedure
      .input(z.object({ importacaoId: z.number() }))
      .mutation(async ({ input }) => {
        await db.limparDadosImportacaoTasy(input.importacaoId);
        return { success: true };
      }),
  }),

  // ============ DASHBOARDS SALVOS ============
  dashboards: router({
    // Listar dashboards salvos do usuário
    listar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.listarDashboardsSalvos(ctx.user.id, input.estabelecimentoId);
      }),

    // Buscar dashboard por ID
    buscar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getDashboardPorId(input.id, ctx.user.id);
      }),

    // Salvar novo dashboard
    salvar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        nome: z.string().min(1).max(255),
        descricao: z.string().optional(),
        configuracao: z.object({
          tipoGrafico: z.string(),
          agrupamento: z.string(),
          colunasSelecionadas: z.array(z.string()),
          filtros: z.object({
            mes: z.number().optional(),
            ano: z.number().optional(),
            convenio: z.string().optional(),
            tipo: z.string().optional(),
            setor: z.string().optional(),
          }),
        }),
        comparativoAtivo: z.boolean().optional(),
        periodo1Mes: z.number().optional(),
        periodo1Ano: z.number().optional(),
        periodo2Mes: z.number().optional(),
        periodo2Ano: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.salvarDashboard(ctx.user.id, input.estabelecimentoId, input);
      }),

    // Atualizar dashboard existente
    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).max(255).optional(),
        descricao: z.string().optional(),
        configuracao: z.object({
          tipoGrafico: z.string(),
          agrupamento: z.string(),
          colunasSelecionadas: z.array(z.string()),
          filtros: z.object({
            mes: z.number().optional(),
            ano: z.number().optional(),
            convenio: z.string().optional(),
            tipo: z.string().optional(),
            setor: z.string().optional(),
          }),
        }).optional(),
        comparativoAtivo: z.boolean().optional(),
        periodo1Mes: z.number().optional(),
        periodo1Ano: z.number().optional(),
        periodo2Mes: z.number().optional(),
        periodo2Ano: z.number().optional(),
        favorito: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...dados } = input;
        return db.atualizarDashboard(id, ctx.user.id, dados);
      }),

    // Excluir dashboard
    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return db.excluirDashboard(input.id, ctx.user.id);
      }),

    // Compartilhar dashboard com outro usuário
    compartilhar: protectedProcedure
      .input(z.object({
        dashboardId: z.number(),
        usuarioId: z.number(),
        permissao: z.enum(['visualizar', 'editar']).default('visualizar'),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.compartilharDashboard(
          input.dashboardId,
          ctx.user.id,
          input.usuarioId,
          input.permissao
        );
      }),

    // Listar dashboards compartilhados comigo
    compartilhadosComigo: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return db.listarDashboardsCompartilhadosComigo(ctx.user.id, input.estabelecimentoId);
      }),

    // Listar compartilhamentos de um dashboard
    listarCompartilhamentos: protectedProcedure
      .input(z.object({ dashboardId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.listarCompartilhamentosDashboard(input.dashboardId, ctx.user.id);
      }),

    // Remover compartilhamento
    removerCompartilhamento: protectedProcedure
      .input(z.object({ compartilhamentoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return db.removerCompartilhamentoDashboard(input.compartilhamentoId, ctx.user.id);
      }),

    // Listar usuários para compartilhamento
    usuariosParaCompartilhamento: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.listarUsuariosParaCompartilhamento(input.estabelecimentoId, ctx.user.id);
      }),
  }),

  // Router de Alertas de Variação
  alertasVariacao: router({
    // Criar alerta
    criar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        nome: z.string().min(1).max(255),
        tipoAlerta: z.enum(['queda', 'aumento', 'ambos']).default('queda'),
        percentualLimite: z.number().min(1).max(100).default(20),
        metrica: z.enum(['faturamento', 'quantidade', 'glosa']).default('faturamento'),
        agrupamento: z.string().default('convenio'),
        notificarEmail: z.enum(['sim', 'nao']).default('nao'),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.criarAlertaVariacao({
          ...input,
          userId: ctx.user.id,
        });
      }),

    // Listar alertas
    listar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return db.listarAlertasVariacao(ctx.user.id, input.estabelecimentoId);
      }),

    // Atualizar alerta
    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).max(255).optional(),
        tipoAlerta: z.enum(['queda', 'aumento', 'ambos']).optional(),
        percentualLimite: z.number().min(1).max(100).optional(),
        metrica: z.enum(['faturamento', 'quantidade', 'glosa']).optional(),
        agrupamento: z.string().optional(),
        ativo: z.enum(['sim', 'nao']).optional(),
        notificarEmail: z.enum(['sim', 'nao']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...dados } = input;
        return db.atualizarAlertaVariacao(id, ctx.user.id, dados);
      }),

    // Excluir alerta
    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return db.excluirAlertaVariacao(input.id, ctx.user.id);
      }),

    // Verificar alertas (executar manualmente)
    verificar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .mutation(async ({ input }) => {
        return db.verificarAlertasVariacao(input.estabelecimentoId);
      }),

    // Listar histórico de alertas disparados
    historico: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        limite: z.number().default(50),
        apenasNaoVisualizados: z.boolean().default(false),
      }))
      .query(async ({ input }) => {
        return db.listarHistoricoAlertasVariacao(
          input.estabelecimentoId,
          input.limite,
          input.apenasNaoVisualizados
        );
      }),

    // Marcar alerta como visualizado
    marcarVisualizado: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.marcarAlertaVisualizado(input.id);
      }),
  }),

  // ============ HISTÓRICO CONCILIAÇÃO TASY ============
  historicoConciliacao: router({
    // Salvar resultado da conciliação
    salvar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        mesReferencia: z.number().optional(),
        anoReferencia: z.number().optional(),
        totalContas: z.number(),
        contasOk: z.number(),
        contasComGlosa: z.number(),
        contasDivergentes: z.number(),
        contasNaoEncontradas: z.number(),
        valorTotalTasy: z.number(),
        valorTotalPago: z.number(),
        valorTotalGlosado: z.number(),
        valorDiferenca: z.number(),
        percentualGlosa: z.number(),
        percentualRecebido: z.number(),
        observacoes: z.string().optional(),
        itens: z.array(z.object({
          contaTasyId: z.number(),
          nrInternoConta: z.string(),
          guia: z.string(),
          paciente: z.string(),
          dataInternacao: z.string().optional(),
          valorTasy: z.number(),
          valorPago: z.number(),
          valorGlosado: z.number(),
          valorDiferenca: z.number(),
          statusConciliacao: z.enum(['ok', 'glosa', 'divergente', 'nao_encontrado']),
          totalProcedimentos: z.number(),
          totalMatMed: z.number(),
          demonstrativoItemId: z.number().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const { itens, ...dados } = input;
        
        // Função para converter data de forma segura
        const parseDate = (dateStr: string | undefined): Date | undefined => {
          if (!dateStr || dateStr === '-' || dateStr === '') return undefined;
          try {
            // Tentar converter formato DD/MM/YYYY para Date
            if (dateStr.includes('/')) {
              const [day, month, year] = dateStr.split('/');
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              if (!isNaN(date.getTime())) return date;
            }
            // Tentar converter ISO ou outros formatos
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) return date;
            return undefined;
          } catch {
            return undefined;
          }
        };
        
        const result = await db.salvarResultadoConciliacao(
          { ...dados, userId: ctx.user.id },
          itens.map(item => ({
            ...item,
            dataInternacao: parseDate(item.dataInternacao),
          })),
          new Map() // Detalhes vazios por enquanto
        );
        return result;
      }),

    // Listar histórico de conciliações
    listar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        mesReferencia: z.number().optional(),
        anoReferencia: z.number().optional(),
        limite: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.listarHistoricoConciliacoes(input.estabelecimentoId, input);
      }),

    // Buscar detalhes de uma conciliação
    detalhes: protectedProcedure
      .input(z.object({
        resultadoId: z.number(),
        statusConciliacao: z.string().optional(),
        busca: z.string().optional(),
        limite: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const { resultadoId, ...filtros } = input;
        return db.getDetalhesConciliacao(resultadoId, filtros);
      }),

    // Buscar detalhes dos itens de uma conta conciliada
    detalhesItem: protectedProcedure
      .input(z.object({ itemConciliacaoId: z.number() }))
      .query(async ({ input }) => {
        return db.getDetalhesItemConciliacao(input.itemConciliacaoId);
      }),

    // Excluir conciliação
    excluir: protectedProcedure
      .input(z.object({ resultadoId: z.number() }))
      .mutation(async ({ input }) => {
        const success = await db.excluirConciliacao(input.resultadoId);
        return { success };
      }),

    // Buscar evolução das conciliações
    evolucao: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        meses: z.number().optional().default(6),
      }))
      .query(async ({ input }) => {
        return db.getEvolucaoConciliacoes(input.estabelecimentoId, input.meses);
      }),
  }),

  // ============ FATURADO TASY ============
  faturadoTasy: router({
    // Listar registros com filtros
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
        tipoItem: z.enum(['PROC/TAXA', 'MAT/MED']).optional(),
        protocolo: z.string().optional(),
        atend: z.string().optional(),
        conta: z.string().optional(),
        cdItem: z.string().optional(),
        descricao: z.string().optional(),
        comGlosa: z.boolean().optional(),
        comPagamento: z.boolean().optional(),
        limite: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Contar registros
    count: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
        tipoItem: z.enum(['PROC/TAXA', 'MAT/MED']).optional(),
        comGlosa: z.boolean().optional(),
        comPagamento: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        return db.contarFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Buscar estatísticas
    estatisticas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getEstatisticasFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Listar competências disponíveis
    competencias: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.listarCompetenciasFaturadoTasy(input.estabelecimentoId);
      }),

    // Listar convênios disponíveis
    convenios: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.listarConveniosFaturadoTasy(input.estabelecimentoId);
      }),

    // Resumo por tipo de item
    resumoPorTipo: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getResumoPorTipoFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Itens glosados
    itensGlosados: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
        limite: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getItensGlosadosFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Dados para Relatório BI
    dadosBI: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
        tipoItem: z.enum(['PROC/TAXA', 'MAT/MED']).optional(),
      }))
      .query(async ({ input }) => {
        return db.getDadosBIFaturadoTasy(input.estabelecimentoId, input);
      }),

    // Importar dados do Excel ou SQLite
    importar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        dados: z.array(z.object({
          sequencia: z.string().optional(),
          convenio: z.string().optional(),
          competencia: z.string().optional(),
          protocolo: z.string().optional(),
          setor: z.string().optional(),
          atend: z.string().optional(),
          conta: z.string().optional(),
          profExec: z.string().optional(),
          cdMotivoExcConta: z.string().optional(),
          dsComplMotivoExcon: z.string().optional(),
          tipoItem: z.string().optional(), // Aceita qualquer string para SQLite
          cdItem: z.string().optional(),
          cdItemTuss: z.string().optional(),
          dtItem: z.string().optional(),
          descricao: z.string().optional(),
          qtd: z.number().optional(),
          vlFaturado: z.number().optional(),
          aReceber: z.number().optional(),
          vlPago: z.number().optional(),
          vlGlosa: z.number().optional(),
          motivoGlosa: z.string().optional(),
          retorno: z.string().optional(),
          dtPgto: z.string().optional(),
        })),
        importacaoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Busca o estabelecimentoId da importação
        let estabelecimentoId: number = input.estabelecimentoId || 0;
        
        // Sempre busca da importação para garantir consistência
        const importacoes = await db.getImportacoesTasy(0); // Busca todas
        const importacao = importacoes.find(i => i.id === input.importacaoId);
        if (importacao && importacao.estabelecimentoId) {
          estabelecimentoId = importacao.estabelecimentoId;
        }
        
        if (!estabelecimentoId || estabelecimentoId === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'EstabelecimentoId não encontrado na importação' });
        }
        
        // Função para normalizar tipoItem
        const normalizarTipoItem = (tipo: string | undefined): 'PROC/TAXA' | 'MAT/MED' => {
          if (!tipo) return 'PROC/TAXA';
          const tipoUpper = tipo.toUpperCase();
          // Verifica se é mat/med
          if (tipoUpper.includes('MAT') || tipoUpper.includes('MED') || 
              tipoUpper.includes('MATERIAL') || tipoUpper.includes('MEDICAMENTO')) {
            return 'MAT/MED';
          }
          // Caso contrário, é proc/taxa
          return 'PROC/TAXA';
        };
        
        const registros = input.dados.map(d => ({
          estabelecimentoId: estabelecimentoId,
          importacaoId: input.importacaoId,
          sequencia: d.sequencia || null,
          convenio: d.convenio || null,
          competencia: d.competencia || null,
          protocolo: d.protocolo || null,
          setor: d.setor || null,
          atend: d.atend || null,
          conta: d.conta || null,
          profExec: d.profExec || null,
          cdMotivoExcConta: d.cdMotivoExcConta || null,
          dsComplMotivoExcon: d.dsComplMotivoExcon || null,
          tipoItem: normalizarTipoItem(d.tipoItem),
          cdItem: d.cdItem || null,
          cdItemTuss: d.cdItemTuss || null,
          dtItem: d.dtItem ? new Date(d.dtItem) : null,
          descricao: d.descricao || null,
          qtd: d.qtd ? String(d.qtd) : null,
          vlFaturado: d.vlFaturado ? String(d.vlFaturado) : null,
          aReceber: d.aReceber ? String(d.aReceber) : null,
          vlPago: d.vlPago ? String(d.vlPago) : null,
          vlGlosa: d.vlGlosa ? String(d.vlGlosa) : null,
          motivoGlosa: d.motivoGlosa || null,
          retorno: d.retorno || null,
          dtPgto: d.dtPgto ? new Date(d.dtPgto) : null,
        }));

        const resultado = await db.insertFaturadoTasyBatch(registros as any, estabelecimentoId || 0);
        return resultado;
      }),

    // Excluir por importação
    excluirPorImportacao: protectedProcedure
      .input(z.object({ importacaoId: z.number() }))
      .mutation(async ({ input }) => {
        const count = await db.excluirFaturadoTasyPorImportacao(input.importacaoId);
        return { excluidos: count };
      }),

    // Dados para Relatório Tasy (formato compatível com importacaoTasy.dados)
    dadosRelatorio: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        competencia: z.string().optional(), // Competência específica (ex: "2025-12-01 00:00:00")
        convenio: z.string().optional(),
        tipo: z.enum(['MATERIAL', 'HONORARIO']).optional(),
        limite: z.number().optional().default(10000),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const filtros = {
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          competencia: input.competencia, // Competência específica
          convenio: input.convenio,
          tipo: input.tipo,
          limite: input.limite,
          offset: input.offset,
        };
        return db.getFaturadoTasyParaRelatorio(input.estabelecimentoId, filtros);
      }),

    // Conciliação de contas - agrupado por conta
    conciliacao: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
        conta: z.string().optional(),
        status: z.enum(['pago', 'parcial', 'glosado', 'pendente']).optional(),
        limite: z.number().optional().default(500),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return db.getConciliacaoFaturadoTasy(input.estabelecimentoId, {
          competencia: input.competencia,
          convenio: input.convenio,
          conta: input.conta,
          status: input.status,
          limite: input.limite,
          offset: input.offset,
        });
      }),

    // Itens de uma conta específica
    itensPorConta: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        conta: z.string(),
        competencia: z.string().optional(),
        convenio: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getItensFaturadoTasyPorConta(input.estabelecimentoId, input.conta, {
          competencia: input.competencia,
          convenio: input.convenio,
        });
      }),

    // Competências disponíveis para filtros
    competenciasDisponiveis: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getCompetenciasFaturadoTasy(input.estabelecimentoId);
      }),
  }),

  // ============ RELATÓRIOS BI ============
  relatoriosBI: router({
    // Buscar dados consolidados para BI
    dados: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        mesReferencia: z.number().optional(),
        anoReferencia: z.number().optional(),
        convenioId: z.number().optional(),
        tipo: z.string().optional(),
        setor: z.string().optional(),
        paciente: z.string().optional(),
        procedimento: z.string().optional(),
        codigoPrestadorExecutante: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getDadosBI(input);
      }),

    // Buscar opções de filtro
    opcoesFiltro: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return db.getOpcoesFiltroBi(input.estabelecimentoId);
      }),
  }),

  // ============ RECEBIMENTO TISS ============
  recebimentoTiss: router({
    // Importar dados de Excel para recebimento_tiss
    importarExcel: protectedProcedure
      .input(z.object({
        arquivoId: z.number(),
        estabelecimentoId: z.number(),
        conteudo: z.string(), // Base64 encoded
      }))
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.conteudo, "base64");
          
          const result = await parseExcelRecebimentoTiss(
            buffer,
            input.arquivoId,
            input.estabelecimentoId
          );
          
          if (!result.success) {
            return {
              success: false,
              error: result.error,
              totalImportados: 0,
            };
          }
          
          // Inserir itens no banco de dados
          const totalImportados = await db.insertRecebimentoTiss(result.items);
          
          return {
            success: true,
            totalImportados,
            totalLinhas: result.totalRows,
          };
        } catch (error) {
          console.error("[recebimentoTiss.importarExcel] Erro:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Erro ao importar arquivo",
            totalImportados: 0,
          };
        }
      }),
    
    // Listar itens de recebimento_tiss
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        arquivoId: z.number().optional(),
        convenioId: z.number().optional(),
        numeroProtocolo: z.string().optional(),
        numeroGuia: z.string().optional(),
        beneficiario: z.string().optional(),
        search: z.string().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        situacaoItem: z.string().optional(),
        statusGlosa: z.enum(["todos", "pago", "glosado", "parcial"]).optional(),
        codigoPrestadorExecutante: z.string().optional(),
        mesReferencia: z.number().min(1).max(12).optional(),
        anoReferencia: z.number().min(2000).max(2100).optional(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecebimentoTiss(input);
      }),
    
    // Estatísticas de recebimento
    stats: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        arquivoId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecebimentoTissStats(input);
      }),
    
    // Excluir itens por arquivo
    excluirPorArquivo: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .mutation(async ({ input }) => {
        const deleted = await db.deleteRecebimentoTissByArquivo(input.arquivoId);
        return { success: true, deleted };
      }),
  }),

  // ============ FATURAMENTO TISS ============
  faturamentoTiss: router({
    // Listar itens de faturamento_tiss com filtros e paginação
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        convenioId: z.number().optional(),
        arquivoId: z.number().optional(),
        search: z.string().optional(),
        mesReferencia: z.number().min(1).max(12).optional(),
        anoReferencia: z.number().min(2000).max(2100).optional(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getFaturamentoTiss(input || {});
      }),
    
    // Resumo de faturamento
    resumo: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        convenioId: z.number().optional(),
        mesReferencia: z.number().min(1).max(12).optional(),
        anoReferencia: z.number().min(2000).max(2100).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getFaturamentoTissResumo(input || {});
      }),
    
    // Excluir itens por arquivo
    excluirPorArquivo: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .mutation(async ({ input }) => {
        const deleted = await db.deleteFaturamentoTissByArquivo(input.arquivoId);
        return { success: true, deleted };
      }),
  }),

  // ============ RECEBIMENTOS EXCEL ============
  recebimentosExcel: router({
    // Importar dados de Excel para recebimentos_excel
    importarExcel: protectedProcedure
      .input(z.object({
        arquivoId: z.number(),
        estabelecimentoId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { parseExcelRecebimentosExcel } = await import('./recebimentosExcelParser');
        
        // Buscar arquivo
        const arquivo = await db.getArquivoById(input.arquivoId);
        if (!arquivo) {
          throw new Error('Arquivo não encontrado');
        }
        
        // Baixar conteúdo do S3
        const response = await fetch(arquivo.s3Url);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Parsear Excel
        const records = parseExcelRecebimentosExcel(buffer, input.arquivoId);
        
        if (records.length === 0) {
          return { success: false, message: 'Nenhum registro encontrado no arquivo', imported: 0 };
        }
        
        // Inserir no banco
        const imported = await db.insertRecebimentosExcelBatch(records);
        
        // Atualizar status do arquivo
        await db.updateArquivo(input.arquivoId, {
          status: 'processado',
          totalItens: records.length,
          itensProcessados: records.length,
          progresso: 100,
        });
        
        return { success: true, imported, total: records.length };
      }),
    
    // Listar itens com filtros e paginação
    list: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        convenioId: z.number().optional(),
        arquivoId: z.number().optional(),
        situacaoItem: z.string().optional(),
        search: z.string().optional(),
        mesReferencia: z.number().min(1).max(12).optional(),
        anoReferencia: z.number().min(2000).max(2100).optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecebimentosExcel(input || {});
      }),
    
    // Resumo de recebimentos
    resumo: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number().optional(),
        convenioId: z.number().optional(),
        mesReferencia: z.number().min(1).max(12).optional(),
        anoReferencia: z.number().min(2000).max(2100).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecebimentosExcelResumo(input || {});
      }),
    
    // Excluir itens por arquivo
    excluirPorArquivo: protectedProcedure
      .input(z.object({ arquivoId: z.number() }))
      .mutation(async ({ input }) => {
        const deleted = await db.deleteRecebimentosExcelByArquivo(input.arquivoId);
        return { success: true, deleted };
      }),
  }),
});

export type AppRouter = typeof appRouter;
