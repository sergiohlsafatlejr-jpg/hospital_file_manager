import { router } from "../_core/trpc";
import { faturamentoRouter } from "./faturamentoRouter";
// import { glosaRouter } from "./glosaRouter"; // TODO: Implementar glosaRouter
import { comparacoesRouter } from "./comparacoesRouter";
import { tasyRouter } from "./tasyRouter";
import { relatoriosRouter } from "./relatoriosRouter";
// import { auditariaRouter } from "./auditariaRouter"; // TODO: Criar auditariaRouter

/**
 * Agregador de routers modulares
 * Cada módulo implementa Strangler Pattern com fallback para monolito
 */
export const modulesRouter = router({
  faturamento: faturamentoRouter,
  // glosa: glosaRouter, // TODO: Implementar glosaRouter
  comparacoes: comparacoesRouter,
  tasy: tasyRouter,
  relatorios: relatoriosRouter,
  // auditoria: auditariaRouter, // TODO: Implementar auditariaRouter
});

/**
 * Feature flags para rollout gradual
 */
export const MODULOS_ATIVOS = {
  faturamento: process.env.ENABLE_MODULO_FATURAMENTO === "true",
  glosa: process.env.ENABLE_MODULO_GLOSA === "true",
  comparacoes: process.env.ENABLE_MODULO_COMPARACOES === "true",
  tasy: process.env.ENABLE_MODULO_TASY === "true",
  relatorios: process.env.ENABLE_MODULO_RELATORIOS === "true",
  // auditoria: process.env.ENABLE_MODULO_AUDITORIA === "true", // TODO: Implementar
};

/**
 * Wrapper que usa módulo se ativo, senão fallback para monolito
 */
export async function executarComFallback(
  modulo: string,
  procedure: string,
  input: any,
  ctx: any
): Promise<any> {
  if (MODULOS_ATIVOS[modulo as keyof typeof MODULOS_ATIVOS]) {
    // Usar módulo novo
    const router = modulesRouter[modulo as keyof typeof modulesRouter];
    if (router && router[procedure as any]) {
      return await router[procedure as any](input, ctx);
    }
  }
  
  // Fallback para monolito
  console.warn(`Fallback para monolito: {{modulo}}.{{procedure}}`);
  // TODO: Chamar procedure do monolito
  throw new Error(`Procedure {{modulo}}.{{procedure}} não encontrada`);
}
