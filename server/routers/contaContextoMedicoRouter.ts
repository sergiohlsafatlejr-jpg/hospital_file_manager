import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ContaContextoMedicoService } from "../contaContextoMedicoService";
import {
  ContaContextoMedicoErro,
} from "../contaContextoMedicoService";
import { criarServicoContaContextoMedicoParaUsuario } from "../contaContextoMedicoDrizzle";
import { reportProcedure, router } from "../_core/trpc";
import {
  exigirAcessoEstabelecimento,
  exigirConvenioDoEstabelecimento,
} from "../recursoGlosaPermissions";

const scopeSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  convenioId: z.number().int().positive(),
  numeroConta: z.string().trim().min(1).max(100),
  arquivoHospitalId: z.number().int().positive(),
  numeroLote: z.string().trim().max(100).optional(),
  competencia: z.string().trim().max(20).optional(),
}).strict();

const CODIGOS_ERRO_CONTEXTO: Record<ContaContextoMedicoErro["codigo"], "PRECONDITION_FAILED" | "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT"> = {
  CONFIGURACAO_PENDENTE: "PRECONDITION_FAILED",
  ESCOPO_INVALIDO: "BAD_REQUEST",
  NAO_ENCONTRADO: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  PRECONDICAO: "PRECONDITION_FAILED",
  CONCORRENCIA: "CONFLICT",
};

function erroRouter(error: unknown): never {
  if (!(error instanceof ContaContextoMedicoErro)) throw error;
  const code = CODIGOS_ERRO_CONTEXTO[error.codigo];
  throw new TRPCError({ code, message: error.message });
}

async function autorizarScope(
  usuarioId: number,
  scope: z.infer<typeof scopeSchema>,
  permissao: "visualizar" | "editar",
) {
  // As duas verificações são intencionais. A autorização da unidade é explícita
  // em todas as rotas e o vínculo do convênio é revalidado antes de qualquer
  // consulta, mutação ou leitura de arquivo pelo serviço.
  await exigirAcessoEstabelecimento(usuarioId, scope.estabelecimentoId, permissao);
  await exigirConvenioDoEstabelecimento(usuarioId, scope.convenioId, scope.estabelecimentoId, permissao);
}

function resolverServico(service: ContaContextoMedicoService | undefined, usuarioId: number) {
  // A criação é leve e não abre conexão: o adapter só resolve DB/storage dentro
  // das chamadas do serviço. Isso evita o fallback pendente permanente.
  return service ?? criarServicoContaContextoMedicoParaUsuario(usuarioId);
}

/**
 * O serviço opcional mantém testes unitários injetáveis. Em produção, cada
 * chamada resolve o adapter real no usuário autenticado, sem I/O na importação.
 */
export function criarContaContextoMedicoRouter(
  service?: ContaContextoMedicoService,
) {
  return router({
    consultar: reportProcedure("contaConvenio")
      .input(z.object({ scope: scopeSchema }).strict())
      .query(async ({ input, ctx }) => {
        try {
          await autorizarScope(ctx.user.id, input.scope, "visualizar");
          return await resolverServico(service, ctx.user.id).consultar(input);
        } catch (error) {
          return erroRouter(error);
        }
      }),

    listarArquivos: reportProcedure("contaConvenio")
      .input(z.object({
        scope: scopeSchema,
        page: z.number().int().positive().max(10_000).optional(),
      }).strict())
      .query(async ({ input, ctx }) => {
        try {
          await autorizarScope(ctx.user.id, input.scope, "visualizar");
          return await resolverServico(service, ctx.user.id).listarArquivos(input);
        } catch (error) {
          return erroRouter(error);
        }
      }),

    indexar: reportProcedure("contaConvenio")
      .input(z.object({
        scope: scopeSchema,
        arquivoMedicoId: z.number().int().positive(),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        try {
          // Autoriza antes de o serviço localizar o arquivo e antes de qualquer
          // chamada ao storage.
          await autorizarScope(ctx.user.id, input.scope, "editar");
          return await resolverServico(service, ctx.user.id).indexar(input);
        } catch (error) {
          return erroRouter(error);
        }
      }),

    confirmar: reportProcedure("contaConvenio")
      .input(z.object({
        scope: scopeSchema,
        padraoId: z.number().int().positive(),
        justificativa: z.string().trim().min(1).max(1000),
        revisaoEsperada: z.number().int().min(0),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        try {
          await autorizarScope(ctx.user.id, input.scope, "editar");
          return await resolverServico(service, ctx.user.id).confirmar({ ...input, usuarioId: ctx.user.id });
        } catch (error) {
          return erroRouter(error);
        }
      }),

    invalidar: reportProcedure("contaConvenio")
      .input(z.object({
        scope: scopeSchema,
        justificativa: z.string().trim().min(1).max(1000),
        revisaoEsperada: z.number().int().min(0),
      }).strict())
      .mutation(async ({ input, ctx }) => {
        try {
          await autorizarScope(ctx.user.id, input.scope, "editar");
          return await resolverServico(service, ctx.user.id).invalidar({ ...input, usuarioId: ctx.user.id });
        } catch (error) {
          return erroRouter(error);
        }
      }),
  });
}

export const contaContextoMedicoRouter = criarContaContextoMedicoRouter();
