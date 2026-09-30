import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { testarConexaoEasyLocal } from "../easyLocalConnection";

/**
 * Sonda GLOBAL de conectividade, exclusiva de administrador.
 * Não há mapeamento de hospitais ou estabelecimentos nesta fase.
 * Não aceita SQL, host, credenciais, unidade ou nome de tabela do navegador.
 */
export const easyLocalRouter = router({
  testarConexao: adminProcedure
    .input(z.object({}).strict())
    .mutation(() => testarConexaoEasyLocal()),
});
