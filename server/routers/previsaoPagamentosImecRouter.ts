import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getApplicationDatabaseUrl, verificarPermissaoEstabelecimento } from "../db";
import {
  gerarPrevisaoPagamentosImec,
  IMEC_ESTABELECIMENTO_ID,
  type PagamentoHistoricoImec,
} from "../previsaoPagamentosImecService";

const inputSchema = z.object({
  estabelecimentoId: z.literal(IMEC_ESTABELECIMENTO_ID),
  horizonteMeses: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(6),
  convenioId: z.number().int().positive().optional(),
});

export const previsaoPagamentosImecRouter = router({
  dados: protectedProcedure
    .input(inputSchema)
    .query(async ({ input, ctx }) => {
      const podeVisualizar = ctx.user.role === "admin"
        || await verificarPermissaoEstabelecimento(ctx.user.id, IMEC_ESTABELECIMENTO_ID, "visualizar");
      if (!podeVisualizar) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Usuário sem permissão para visualizar o Imec Senador Canedo",
        });
      }

      const databaseUrl = getApplicationDatabaseUrl();
      if (!databaseUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Conexão com o banco não configurada" });
      }

      const conn = await mysql.createConnection(databaseUrl);
      try {
        const params: Array<number> = [IMEC_ESTABELECIMENTO_ID];
        const convenioFilter = input.convenioId ? " AND d.convenio_id = ?" : "";
        if (input.convenioId) params.push(input.convenioId);

        const [rows] = await conn.execute(
          `SELECT
             d.convenio_id AS convenio_id,
             TRIM(COALESCE(c.nome, CONCAT('Convênio ', d.convenio_id))) AS convenio,
             DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') AS data_pagamento,
             COUNT(*) AS itens,
             COUNT(DISTINCT d.numero_guia) AS guias,
             COALESCE(SUM(d.valor_pago), 0) AS valor_pago,
             COALESCE(SUM(d.valor_glosa), 0) AS valor_glosa,
             AVG(CASE
               WHEN d.data_execucao IS NOT NULL AND d.data_pagamento IS NOT NULL
               THEN DATEDIFF(d.data_pagamento, d.data_execucao)
               ELSE NULL
             END) AS prazo_medio_dias
           FROM demonstrativo d
           LEFT JOIN convenios c ON c.id = d.convenio_id
           WHERE d.estabelecimentoId = ?
             AND d.data_pagamento IS NOT NULL${convenioFilter}
           GROUP BY d.convenio_id, c.nome, DATE_FORMAT(d.data_pagamento, '%Y-%m-%d')
           ORDER BY data_pagamento, convenio`,
          params,
        );

        const historico = (rows as any[]).map<PagamentoHistoricoImec>(row => ({
          convenioId: Number(row.convenio_id),
          convenio: String(row.convenio ?? `Convênio ${row.convenio_id}`).trim(),
          dataPagamento: String(row.data_pagamento),
          itens: Number(row.itens ?? 0),
          guias: Number(row.guias ?? 0),
          valorPago: Number(row.valor_pago ?? 0),
          valorGlosa: Number(row.valor_glosa ?? 0),
          prazoMedioDias: row.prazo_medio_dias === null ? null : Number(row.prazo_medio_dias),
        }));

        if (historico.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Ainda não há histórico de pagamentos importado para o Imec Senador Canedo",
          });
        }

        return gerarPrevisaoPagamentosImec(historico, input.horizonteMeses);
      } finally {
        await conn.end();
      }
    }),
});
