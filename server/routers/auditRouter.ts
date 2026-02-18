import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { logger } from "../_core/logger";
import { TRPCError } from "@trpc/server";

/**
 * Router de Auditoria
 * Procedures para listar e filtrar logs de auditoria
 */

export const auditRouter = router({
  /**
   * Lista logs de auditoria com filtros
   */
  listLogs: protectedProcedure
    .input(
      z.object({
        tipo: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
        tabela: z.string().optional(),
        usuarioId: z.number().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
        limite: z.number().default(50),
        pagina: z.number().default(1),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        // Validar que usuário tem permissão para ver auditoria
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem acessar logs de auditoria",
          });
        }

        // Construir query com filtros
        const offset = (input.pagina - 1) * input.limite;
        
        let query = `
          SELECT 
            id,
            tabela,
            tipo_acao as tipoAcao,
            usuario_id as usuarioId,
            usuario_nome as usuarioNome,
            valores_novos as valoresNovos,
            data_hora as dataHora,
            estabelecimento_id as estabelecimentoId
          FROM auditLog
          WHERE 1=1
        `;
        
        const params: any[] = [];
        
        if (input.tipo) {
          query += ` AND tipo_acao = ?`;
          params.push(input.tipo);
        }
        
        if (input.tabela) {
          query += ` AND tabela = ?`;
          params.push(input.tabela);
        }
        
        if (input.usuarioId) {
          query += ` AND usuario_id = ?`;
          params.push(input.usuarioId);
        }
        
        if (input.dataInicio) {
          query += ` AND data_hora >= ?`;
          params.push(input.dataInicio.toISOString());
        }
        
        if (input.dataFim) {
          query += ` AND data_hora <= ?`;
          params.push(input.dataFim.toISOString());
        }
        
        // Filtrar por estabelecimento do usuário se não for admin global
        if (ctx.estabelecimentoId) {
          query += ` AND estabelecimento_id = ?`;
          params.push(ctx.estabelecimentoId);
        }
        
        query += ` ORDER BY data_hora DESC LIMIT ? OFFSET ?`;
        params.push(input.limite, offset);
        
        // Executar query (usando raw SQL)
        // TODO: Implementar quando tabela auditLog existir no banco
        const logs: any[] = [];
        
        // Contar total
        let countQuery = `SELECT COUNT(*) as total FROM auditLog WHERE 1=1`;
        const countParams: any[] = [];
        
        if (input.tipo) {
          countQuery += ` AND tipo_acao = ?`;
          countParams.push(input.tipo);
        }
        if (input.tabela) {
          countQuery += ` AND tabela = ?`;
          countParams.push(input.tabela);
        }
        if (input.usuarioId) {
          countQuery += ` AND usuario_id = ?`;
          countParams.push(input.usuarioId);
        }
        if (input.dataInicio) {
          countQuery += ` AND data_hora >= ?`;
          countParams.push(input.dataInicio.toISOString());
        }
        if (input.dataFim) {
          countQuery += ` AND data_hora <= ?`;
          countParams.push(input.dataFim.toISOString());
        }
        if (ctx.estabelecimentoId) {
          countQuery += ` AND estabelecimento_id = ?`;
          countParams.push(ctx.estabelecimentoId);
        }
        
        // TODO: Executar count query quando tabela existir
        const total = 0;
        
        logger.info({
          tipo: "audit_list_logs",
          usuarioId: ctx.user?.id,
          total,
          filtros: { tipo: input.tipo, tabela: input.tabela },
        });
        
        return {
          logs,
          total,
          pagina: input.pagina,
          limite: input.limite,
          totalPaginas: Math.ceil(total / input.limite),
        };
      } catch (error) {
        logger.error({
          tipo: "audit_list_logs_erro",
          usuarioId: ctx.user?.id,
          erro: error instanceof Error ? error.message : String(error),
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar logs de auditoria",
        });
      }
    }),

  /**
   * Obtém estatísticas de auditoria
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem acessar estatísticas",
        });
      }

      // Retornar estatísticas simuladas por enquanto
      return {
        totalOperacoes: 0,
        operacoesHoje: 0,
        operacoesUltimos7Dias: 0,
        tiposOperacoes: {
          INSERT: 0,
          UPDATE: 0,
          DELETE: 0,
        },
        usuariosAtivos: 0,
        tabelasModificadas: [],
      };
    } catch (error) {
      logger.error({
        tipo: "audit_stats_erro",
        usuarioId: ctx.user?.id,
        erro: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }),

  /**
   * Obtém detalhes de um log específico
   */
  getDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem acessar detalhes",
          });
        }

        // TODO: Buscar log específico quando tabela existir
        return {
          id: input.id,
          tabela: "",
          tipoAcao: "UPDATE",
          usuarioId: 0,
          usuarioNome: "",
          valoresAntigos: {},
          valoresNovos: {},
          dataHora: new Date(),
        };
      } catch (error) {
        logger.error({
          tipo: "audit_detail_erro",
          usuarioId: ctx.user?.id,
          erro: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  /**
   * Exporta logs em CSV
   */
  exportCSV: protectedProcedure
    .input(
      z.object({
        tipo: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
        tabela: z.string().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem exportar logs",
          });
        }

        // TODO: Gerar CSV quando tabela existir
        const csv = "id,tabela,tipo_acao,usuario_id,usuario_nome,data_hora\n";

        logger.info({
          tipo: "audit_export_csv",
          usuarioId: ctx.user?.id,
        });

        return {
          csv,
          filename: `audit-export-${new Date().toISOString()}.csv`,
        };
      } catch (error) {
        logger.error({
          tipo: "audit_export_erro",
          usuarioId: ctx.user?.id,
          erro: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),
});
