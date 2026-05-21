import { router, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { RoboSaudeCaixa } from "../rpa/robos/RoboSaudeCaixa";
import { RoboUnimed } from "../rpa/robos/RoboUnimed";
import { RoboIpasgo } from "../rpa/robos/RoboIpasgo";
import { RoboCassi } from "../rpa/robos/RoboCassi";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { credenciaisPortais, convenios } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const rpaRouter = router({
  /**
   * Executa um robô RPA específico para buscar demonstrativos
   */
  executarRoboBuscaDemonstrativo: adminProcedure
    .input(
      z.object({
        convenioNome: z.enum(["UNIMED", "SAUDE_CAIXA", "IPASGO", "CASSI"]),
        url: z.string().url("URL inválida"),
        login: z.string().optional(),
        senha: z.string().optional(),
        competencia: z.string().optional() // Ex: '202505'
      })
    )
    .mutation(async ({ input }) => {
      try {
        let robo;
        
        switch (input.convenioNome) {
          case "SAUDE_CAIXA":
            robo = new RoboSaudeCaixa();
            break;
          case "UNIMED":
            robo = new RoboUnimed();
            break;
          case "IPASGO":
            robo = new RoboIpasgo();
            break;
          case "CASSI":
            robo = new RoboCassi();
            break;
          default:
            throw new Error(`Robô para o convênio ${input.convenioNome} não implementado.`);
        }

        let finalUrl = input.url;
        let finalLogin = input.login;
        let finalSenha = input.senha;
        let finalEstabelecimentoId: number | null = null;

        // Se não forneceu login/senha manualmente, busca do Cofre de Senhas
        if (!finalLogin || !finalSenha) {
          const db = await getDb();
          if (db) {
            // Busca o id do convênio com base no nome
            let searchNome = input.convenioNome;
            if (input.convenioNome === "UNIMED") searchNome = "Unimed Goiânia";
            else if (input.convenioNome === "SAUDE_CAIXA") searchNome = "Saúde Caixa";
            else if (input.convenioNome === "IPASGO") searchNome = "IPASGO";
            else if (input.convenioNome === "CASSI") searchNome = "CASSI";

            const conveniosDb = await db.select().from(convenios).where(eq(convenios.nome, searchNome));
            
            if (conveniosDb.length === 0 && input.convenioNome === "UNIMED") {
              const conveniosDb2 = await db.select().from(convenios).where(eq(convenios.nome, "Unimed"));
              if (conveniosDb2.length > 0) conveniosDb.push(conveniosDb2[0]);
            }
            
            if (conveniosDb.length > 0) {
              const cred = await db.select().from(credenciaisPortais).where(eq(credenciaisPortais.convenioId, conveniosDb[0].id));
              if (cred.length > 0) {
                const c = cred[0];
                if (!finalLogin) finalLogin = c.login;
                if (!finalSenha) finalSenha = c.senha;
                finalEstabelecimentoId = c.estabelecimentoId;
                if (c.urlLogin && input.url === "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed") {
                   // Usa a URL do banco apenas se a URL da requisição for a default
                   finalUrl = c.urlLogin;
                }
              }
            }
          }
        }

        if (!finalLogin || !finalSenha) {
          throw new Error("Credenciais não fornecidas e não encontradas no Cofre de Senhas para este convênio.");
        }

        logger.info({ message: `Iniciando execução manual do robô ${input.convenioNome}` });

        const resultado = await robo.executar({
          url: finalUrl,
          login: finalLogin,
          senha: finalSenha,
          estabelecimentoId: finalEstabelecimentoId
        }, {
          competencia: input.competencia || ""
        });

        // Se deu certo, atualiza o ultimoAcesso na credencial
        try {
          const db = await getDb();
          if (db && finalLogin) {
             await db.execute(`UPDATE credenciais_portais SET ultimoAcesso = NOW(), statusAcesso = 'sucesso' WHERE login = '${finalLogin}'`);
          }
        } catch(e) {}

        return {
          sucesso: true,
          resultado
        };
        
      } catch (error: any) {
        logger.error({ 
          message: `Falha na execução do robô RPA ${input.convenioNome}`,
          error: error.message 
        });
        throw error;
      }
    }),

  /**
   * Lista as credenciais de acesso aos portais dos convênios
   */
  listarCredenciais: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      
      const result = await db
        .select({
          id: credenciaisPortais.id,
          convenioId: credenciaisPortais.convenioId,
          convenioNome: convenios.nome,
          login: credenciaisPortais.login,
          urlLogin: credenciaisPortais.urlLogin,
          ativo: credenciaisPortais.ativo,
          ultimoAcesso: credenciaisPortais.ultimoAcesso,
          statusAcesso: credenciaisPortais.statusAcesso,
        })
        .from(credenciaisPortais)
        .leftJoin(convenios, eq(credenciaisPortais.convenioId, convenios.id));
        
      return result;
    }),

  /**
   * Lista todos os convênios disponíveis para o dropdown
   */
  listarConvenios: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      
      const result = await db
        .select({
          id: convenios.id,
          nome: convenios.nome,
          codigo: convenios.codigo,
        })
        .from(convenios)
        .where(eq(convenios.ativo, "sim"))
        .orderBy(convenios.nome);
        
      return result;
    }),

  /**
   * Salva ou atualiza uma credencial de acesso
   */
  salvarCredencial: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      convenioId: z.number(),
      login: z.string(),
      senha: z.string(),
      urlLogin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      
      if (input.id) {
        await db.update(credenciaisPortais)
          .set({
            login: input.login,
            senha: input.senha,
            urlLogin: input.urlLogin,
            updatedAt: new Date()
          })
          .where(eq(credenciaisPortais.id, input.id));
        return { sucesso: true, id: input.id };
      } else {
        const [result] = await db.insert(credenciaisPortais).values({
          convenioId: input.convenioId,
          login: input.login,
          senha: input.senha,
          urlLogin: input.urlLogin,
        });
        return { sucesso: true, id: result.insertId };
      }
    }),
});
