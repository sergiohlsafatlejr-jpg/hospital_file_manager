import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { TrpcContext } from "./context";
import { logger } from "./logger";
import { logAudit } from "./audit";
import { getDb } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ============ MIDDLEWARES GLOBAIS ============

/**
 * Middleware de Logging
 * Registra todas as operações (queries e mutations)
 */
const loggingMiddleware = t.middleware(async (opts) => {
  const { path, type, input, ctx, next } = opts;
  const inicio = Date.now();

  try {
    const resultado = await next();
    
    const duracao = Date.now() - inicio;
    logger.info({
      tipo: "operacao_sucesso",
      path,
      tipoOperacao: type,
      duracao,
      usuarioId: ctx.user?.id,
      estabelecimentoId: ctx.estabelecimentoId,
    });

    return resultado;
  } catch (error) {
    const duracao = Date.now() - inicio;
    logger.error({
      tipo: "operacao_erro",
      path,
      tipoOperacao: type,
      duracao,
      usuarioId: ctx.user?.id,
      erro: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * Middleware de Auditoria
 * Registra mudanças no banco (apenas mutations)
 */
const auditMiddleware = t.middleware(async (opts) => {
  const { path, type, input, ctx, next } = opts;

  // Só auditar mutations
  if (type !== "mutation") {
    return next();
  }

  try {
    const resultado = await next();

    // Determinar tipo de ação baseado no nome da procedure
    let tipoAcao: "INSERT" | "UPDATE" | "DELETE" = "UPDATE";
    if (path.includes("create") || path.includes("criar")) tipoAcao = "INSERT";
    if (path.includes("delete") || path.includes("deletar")) tipoAcao = "DELETE";

    // Registrar auditoria
    if (resultado && typeof resultado === "object") {
      const registroId = (resultado as any).id || (resultado as any).comparacaoId || 0;

      if (registroId > 0) {
        await logAudit({
          tabela: path.split(".")[0],
          registroId,
          tipoAcao,
          usuarioId: ctx.user?.id || 0,
          usuarioNome: ctx.user?.name || undefined,
          valoresNovos: resultado,
          estabelecimentoId: ctx.estabelecimentoId,
        });

        logger.info({
          tipo: "auditoria_registrada",
          tabela: path.split(".")[0],
          acao: tipoAcao,
          registroId,
          usuarioId: ctx.user?.id,
        });
      }
    }

    return resultado;
  } catch (error) {
    logger.error({
      tipo: "auditoria_erro",
      path,
      usuarioId: ctx.user?.id,
      erro: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * Middleware de Validação de Permissões
 * Valida se usuário tem acesso
 */
const permissaoMiddleware = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
    });
  }

  // Estabelecimento é opcional para algumas procedures
  // if (!ctx.estabelecimentoId) {
  //   throw new TRPCError({
  //     code: "FORBIDDEN",
  //     message: "Estabelecimento não configurado",
  //   });
  // }

  return next();
});

// ============ PROCEDURES COM MIDDLEWARES ============

/**
 * Procedure com logging, auditoria e permissões
 */
export const trackedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(auditMiddleware)
  .use(permissaoMiddleware);

/**
 * Procedure protegida com logging, auditoria e permissões
 */
export const trackedProtectedProcedure = t.procedure
  .use(requireUser)
  .use(loggingMiddleware)
  .use(auditMiddleware)
  .use(permissaoMiddleware);


// ============ ROUTER DE AUDITORIA ============

export const auditRouter = router({
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
        // Buscar logs do banco de dados
        const offset = (input.pagina - 1) * input.limite;
        
        // Construir query com filtros
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
        
        // Filtrar por estabelecimento do usuário
        if (ctx.estabelecimentoId) {
          query += ` AND estabelecimento_id = ?`;
          params.push(ctx.estabelecimentoId);
        }
        
        query += ` ORDER BY data_hora DESC LIMIT ? OFFSET ?`;
        params.push(input.limite, offset);
        
        // Executar query
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const logs = await db.execute(sql`${sql.raw(query)}`);
        
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
        
        const countResult = await db.execute(sql`${sql.raw(countQuery)}`);
        const total = Array.isArray(countResult) && countResult[0] ? (countResult[0] as any).total : 0;
        
        logger.info({
          tipo: "audit_list_logs",
          usuarioId: ctx.user?.id,
          total,
          filtros: { tipo: input.tipo, tabela: input.tabela },
        });
        
        return {
          logs: logs || [],
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar logs de auditoria",
        });
      }
    }),
});
