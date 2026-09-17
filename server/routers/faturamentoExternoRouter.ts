import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { reportProcedure, router } from "../_core/trpc";
import { verificarPermissaoEstabelecimento } from "../db";
import {
  buscarTotaisFaturamentoExterno,
  buscarTotaisPorConvenioExterno,
  excluirFaturamentoExterno,
  importarFaturamentoExterno,
  listarConveniosExternos,
  listarFaturamentoExterno,
  salvarFaturamentoExternoManual,
} from "../faturamentoExterno";

async function validarAcesso(
  ctx: any,
  estabelecimentoId: number,
  permissao: "visualizar" | "editar" | "excluir"
) {
  if (ctx.user?.role === "admin") return;
  const permitido = await verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, permissao);
  if (!permitido) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem permissão para este estabelecimento" });
  }
}

const lancamentoManualSchema = z.object({
  id: z.number().int().positive().optional(),
  estabelecimentoId: z.number().int().positive(),
  convenio: z.string().trim().min(1).max(255),
  mesAno: z.string().regex(/^\d{4}\/(0[1-9]|1[0-2])$/),
  codigoPrestador: z.string().trim().max(50).nullable().optional(),
  valorFaturado: z.number().positive("Informe um valor faturado maior que zero").max(999999999999.99),
  valorRecebido: z.number().min(0).max(999999999999.99),
  valorGlosado: z.number().min(0).max(999999999999.99),
  observacao: z.string().trim().max(2000).nullable().optional(),
});

const relatorioProcedure = reportProcedure("faturamentoExterno");

export const faturamentoExternoRouter = router({
  listar: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive(), ano: z.number().int().optional() }))
    .query(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "visualizar");
      return listarFaturamentoExterno(input.estabelecimentoId, input.ano);
    }),

  listarConvenios: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "visualizar");
      return listarConveniosExternos(input.estabelecimentoId);
    }),

  importar: relatorioProcedure
    .input(z.object({
      estabelecimentoId: z.number().int().positive(),
      dados: z.array(z.object({
        convenio: z.string().trim().min(1).max(255),
        mesAno: z.string().regex(/^\d{4}\/(0[1-9]|1[0-2])$/),
        valorFaturado: z.number().min(0),
        valorRecebido: z.number().min(0),
        valorGlosado: z.number().min(0).optional(),
      })),
      arquivoOrigem: z.string().max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "editar");
      return importarFaturamentoExterno(
        input.estabelecimentoId,
        input.dados,
        input.arquivoOrigem,
        ctx.user.id,
        ctx.user.name || "Sistema"
      );
    }),

  salvarManual: relatorioProcedure
    .input(lancamentoManualSchema)
    .mutation(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "editar");
      return salvarFaturamentoExternoManual(input, ctx.user.id, ctx.user.name || "Usuário");
    }),

  excluir: relatorioProcedure
    .input(z.object({ id: z.number().int().positive(), estabelecimentoId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "excluir");
      return excluirFaturamentoExterno(input.id, input.estabelecimentoId);
    }),

  totaisPorMes: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive(), ano: z.number().int() }))
    .query(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "visualizar");
      return buscarTotaisFaturamentoExterno(input.estabelecimentoId, input.ano);
    }),

  totaisPorConvenio: relatorioProcedure
    .input(z.object({ estabelecimentoId: z.number().int().positive(), ano: z.number().int() }))
    .query(async ({ input, ctx }) => {
      await validarAcesso(ctx, input.estabelecimentoId, "visualizar");
      return buscarTotaisPorConvenioExterno(input.estabelecimentoId, input.ano);
    }),
});
