import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { estabelecimentoFonteRelatorios } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  buscarRelatorioUnificado,
  listarConveniosUnificado,
  buscarTabelaPorConvenioUnificado,
  obterConfiguracaoFonte,
} from "../fonteRelatoriosService";

export const fonteRelatoriosRouter = router({
  // Listar todas as configurações de fonte
  listarConfiguracoes: protectedProcedure
    .query(async () => {
      const db = (await getDb())!;
      const configs = await db.select().from(estabelecimentoFonteRelatorios);
      return configs;
    }),

  // Obter configuração de um estabelecimento específico
  obterConfiguracao: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      return obterConfiguracaoFonte(input.estabelecimentoId);
    }),

  // Criar/atualizar configuração de fonte
  salvarConfiguracao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        fonteFaturamento: z.enum(["integ_faturado", "contas_convenio_itens", "faturamento_tiss"]),
        origemPreferida: z.enum(["XML", "BANCO_CLIENTE", "AMBOS"]).optional(),
        sistemaOrigem: z.string().optional(),
        descricao: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Verificar se já existe configuração para este estabelecimento
      const [existing] = await db
        .select()
        .from(estabelecimentoFonteRelatorios)
        .where(eq(estabelecimentoFonteRelatorios.estabelecimentoId, input.estabelecimentoId))
        .limit(1);

      if (existing) {
        // Atualizar
        await db
          .update(estabelecimentoFonteRelatorios)
          .set({
            fonteFaturamento: input.fonteFaturamento,
            origemPreferida: input.origemPreferida || "AMBOS",
            sistemaOrigem: input.sistemaOrigem || null,
            descricao: input.descricao || null,
          })
          .where(eq(estabelecimentoFonteRelatorios.id, existing.id));
        return { success: true, action: "updated" };
      } else {
        // Criar
        await db.insert(estabelecimentoFonteRelatorios).values({
          estabelecimentoId: input.estabelecimentoId,
          fonteFaturamento: input.fonteFaturamento,
          origemPreferida: input.origemPreferida || "AMBOS",
          sistemaOrigem: input.sistemaOrigem || null,
          descricao: input.descricao || null,
          ativo: "sim",
        });
        return { success: true, action: "created" };
      }
    }),

  // ============================================================
  // RELATÓRIO UNIFICADO (usa a fonte configurada por estabelecimento)
  // ============================================================

  buscarRelatorio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number().optional(),
        anoAnterior: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return buscarRelatorioUnificado(input);
    }),

  listarConvenios: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      return listarConveniosUnificado(input.estabelecimentoId);
    }),

  buscarPorConvenio: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        anoAtual: z.number(),
        anoAnterior: z.number(),
        convenio: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return buscarTabelaPorConvenioUnificado(input);
    }),
});
