import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getRawPool, verificarAcessoModulo, verificarPermissaoEstabelecimento } from "../db";
import { getTasyImportLot, listTasyImportLots, publishTasyLot } from "../tasyCsvImportService";

async function requireTasyAccess(user: { id: number; role: string }, estabelecimentoId: number, action: "visualizar" | "gerenciar") {
  if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um estabelecimento válido." });
  }
  if (user.role === "admin") return;
  const allowedEstablishment = await verificarPermissaoEstabelecimento(user.id, estabelecimentoId, action);
  if (!allowedEstablishment) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta unidade." });
  const allowedModule = await verificarAcessoModulo(
    user.id,
    estabelecimentoId,
    action === "gerenciar" ? "importacaoTasy" : "atendimentos",
  );
  if (!allowedModule) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para o módulo nesta unidade." });
}

export const tasyImportacaoRouter = router({
  listarLotes: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      await requireTasyAccess(ctx.user, input.estabelecimentoId, "visualizar");
      return listTasyImportLots(input.estabelecimentoId, input.limit);
    }),

  obterLote: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive(), loteId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireTasyAccess(ctx.user, input.estabelecimentoId, "visualizar");
      const lot = await getTasyImportLot(input.estabelecimentoId, input.loteId);
      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lote Tasy não encontrado nesta unidade." });
      return lot;
    }),

  resumo: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireTasyAccess(ctx.user, input.estabelecimentoId, "visualizar");
      const pool = await getRawPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [rows] = await pool.query<any[]>(`
        SELECT
          COUNT(*) AS totalContas,
          SUM(CASE WHEN titulo IS NOT NULL AND TRIM(titulo) != '' THEN 1 ELSE 0 END) AS finalizadas,
          SUM(CASE WHEN titulo IS NULL OR TRIM(titulo) = '' THEN 1 ELSE 0 END) AS pendentes,
          COALESCE(SUM(valorConta), 0) AS valorTotal,
          COALESCE(SUM(CASE WHEN titulo IS NULL OR TRIM(titulo) = '' THEN valorConta ELSE 0 END), 0) AS valorPendente,
          MAX(dataSincronizacao) AS ultimaSincronizacao
        FROM atendimentos_unificados
        WHERE estabelecimentoId = ?
          AND origemSistema IN ('tasy', 'tasy_hemolabor')
          AND ativoNaFonte = 1
          AND UPPER(TRIM(COALESCE(convenio, ''))) != 'PARTICULAR'
      `, [input.estabelecimentoId]);
      const [pendingStageRows] = await pool.query<any[]>(`
        SELECT
          COALESCE(NULLIF(TRIM(etapaConta), ''), 'Sem etapa') AS etapa,
          COUNT(*) AS contas,
          COALESCE(SUM(valorConta), 0) AS valorPendente
        FROM atendimentos_unificados
        WHERE estabelecimentoId = ?
          AND origemSistema IN ('tasy', 'tasy_hemolabor')
          AND ativoNaFonte = 1
          AND UPPER(TRIM(COALESCE(convenio, ''))) != 'PARTICULAR'
          AND (titulo IS NULL OR TRIM(titulo) = '')
        GROUP BY COALESCE(NULLIF(TRIM(etapaConta), ''), 'Sem etapa')
        ORDER BY valorPendente DESC, contas DESC, etapa ASC
      `, [input.estabelecimentoId]);
      const row = rows[0] || {};
      return {
        totalContas: Number(row.totalContas || 0),
        finalizadas: Number(row.finalizadas || 0),
        pendentes: Number(row.pendentes || 0),
        valorTotal: Number(row.valorTotal || 0),
        valorPendente: Number(row.valorPendente || 0),
        ultimaSincronizacao: row.ultimaSincronizacao || null,
        pendenciasPorEtapa: pendingStageRows.map((stage) => ({
          etapa: String(stage.etapa || "Sem etapa"),
          contas: Number(stage.contas || 0),
          valorPendente: Number(stage.valorPendente || 0),
        })),
      };
    }),

  publicarLote: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().int().positive(),
      loteId: z.number().int().positive(),
      substituirSnapshot: z.boolean().default(true),
      confirmarSubstituicao: z.literal(true).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireTasyAccess(ctx.user, input.estabelecimentoId, "gerenciar");
      if (input.substituirSnapshot && input.confirmarSubstituicao !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirme explicitamente que o lote representa o snapshot completo da unidade.",
        });
      }
      const lot = await getTasyImportLot(input.estabelecimentoId, input.loteId);
      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lote Tasy não encontrado nesta unidade." });
      if (!["validado", "publicado"].includes(String(lot.status))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Somente lotes validados podem ser publicados." });
      }
      const pool = await getRawPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const connection = await pool.getConnection();
      try {
        return await publishTasyLot(connection, input.loteId, input.estabelecimentoId, input.substituirSnapshot);
      } finally {
        connection.release();
      }
    }),
});
