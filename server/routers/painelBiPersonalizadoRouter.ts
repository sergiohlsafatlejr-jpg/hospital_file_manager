import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, reportProcedure, router } from "../_core/trpc";
import { verificarPermissaoEstabelecimento } from "../db";
import {
  biClientConfigSchema,
  biCriterioPeriodoXmlSchema,
  biDimensaoSetorSchema,
  biSubFonteBancoSchema,
} from "../../shared/biPersonalizadoConfig";
import {
  buscarDadosPainelBiExecutivo,
  obterConfiguracaoBiCliente,
  resetarConfiguracaoBiCliente,
  salvarConfiguracaoBiCliente,
} from "../painelBiPersonalizadoService";

const relatorioBiProcedure = reportProcedure("relFaturadoRecebido");

async function exigirPermissaoPersonalizar(user: { id: number; role: string }, estabelecimentoId: number) {
  if (user.role === "admin") return;
  const podeGerenciar = await verificarPermissaoEstabelecimento(user.id, estabelecimentoId, "gerenciar");
  if (podeGerenciar) return;
  const podeEditar = await verificarPermissaoEstabelecimento(user.id, estabelecimentoId, "editar");
  if (podeEditar) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Apenas gestores ou administradores podem personalizar o painel BI deste cliente.",
  });
}

export const painelBiPersonalizadoRouter = router({
  dados: relatorioBiProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        modoFonte: z.enum(["XML", "BANCO_CSV"]),
        competencias: z.array(z.string().trim().min(1).max(30)).max(60).optional(),
        convenios: z.array(z.string().trim().min(1).max(255)).max(150).optional(),
        setores: z.array(z.string().trim().min(1).max(255)).max(150).optional(),
        criterioPeriodoXml: biCriterioPeriodoXmlSchema.optional(),
        subFonteBanco: biSubFonteBancoSchema.optional(),
        dimensaoSetor: biDimensaoSetorSchema.optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await buscarDadosPainelBiExecutivo(input);
      } catch (err: any) {
        if (err?.message === "Estabelecimento não encontrado") {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err?.message || "Erro ao carregar dados do Painel BI Executivo.",
        });
      }
    }),

  obterConfiguracao: relatorioBiProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return obterConfiguracaoBiCliente(input.estabelecimentoId);
    }),

  salvarConfiguracao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        config: biClientConfigSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await exigirPermissaoPersonalizar(ctx.user, input.estabelecimentoId);
      const saved = await salvarConfiguracaoBiCliente({
        estabelecimentoId: input.estabelecimentoId,
        config: input.config,
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || null,
      });
      return { success: true, config: saved };
    }),

  resetarConfiguracao: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await exigirPermissaoPersonalizar(ctx.user, input.estabelecimentoId);
      const config = await resetarConfiguracaoBiCliente(input.estabelecimentoId);
      return { success: true, config };
    }),
});
