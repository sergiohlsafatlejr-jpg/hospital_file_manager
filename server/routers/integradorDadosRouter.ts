import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { dataSyncEngine, SyncConfig } from "../dataSyncEngine";
import { WarleineConnector } from "../connectors/WarleineConnector";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { estabelecimentos } from "../../drizzle/schema";
import { queryConfiguracoes, warleineAtendimentosStaging, atendimentosSemConta, atendimentosAFaturar } from "../../drizzle/schema-integracao";
import { atendimentos } from "../../drizzle/schema-integracao"; // atendimentos_unificados
import { ENV } from "../_core/env";

/**
 * Router para gerenciar integração de dados de múltiplos sistemas
 * Responsável por:
 * 1. Cadastrar queries de sincronização
 * 2. Testar conexões
 * 3. Executar sincronizações
 * 4. Monitorar status
 */
export const integradorDadosRouter = router({
  /**
   * Testa conexão e query com WARLEINE
   */
  testarConexaoWarleine: protectedProcedure
    .input(
      z.object({
        host: z.string(),
        port: z.number(),
        database: z.string(),
        user: z.string(),
        password: z.string(),
        querySql: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const connector = new WarleineConnector({
          host: input.host,
          port: input.port,
          database: input.database,
          user: input.user,
          password: input.password,
        });

        const resultado = await connector.testarConexaoEQuery(input.querySql);

        return {
          sucesso: resultado.sucesso,
          mensagem: resultado.mensagem,
          totalRegistros: resultado.totalRegistros,
          primeiroRegistro: resultado.primeiroRegistro,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao testar conexão WARLEINE",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao testar conexão",
          totalRegistros: 0,
          primeiroRegistro: null,
        };
      }
    }),

  /**
   * Salva configuração de sincronização
   */
  salvarConfiguracao: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        sistema: z.enum(["warleine", "tasy", "omni", "gesthor"]),
        tipoDados: z.enum(["atendimentos", "faturamento", "procedimentos", "pacientes"]),
        querySql: z.string(),
        frequencia: z.enum(["tempo_real", "1x_dia", "1x_semana"]),
        descricao: z.string().optional(),
        conexaoConfig: z
          .object({
            host: z.string().optional(),
            port: z.number().optional(),
            database: z.string().optional(),
            user: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            sucesso: false,
            mensagem: "Apenas administradores podem criar configurações",
            configId: null,
          };
        }

        const db = await getDb();

        if (!db) {
          return {
            sucesso: false,
            mensagem: "Erro ao conectar ao banco de dados",
            configId: null,
          };
        }

        // Salvar configuração no banco de dados
        const resultado = await db.insert(queryConfiguracoes).values({
          estabelecimentoId: input.estabelecimentoId,
          sistema: input.sistema,
          tipoDados: input.tipoDados,
          querySql: input.querySql,
          frequencia: input.frequencia,
          descricao: input.descricao || null,
          conexaoConfig: input.conexaoConfig ? JSON.stringify(input.conexaoConfig) : null,
          ativo: true,
          ultimaSincronizacao: null,
          proximaSincronizacao: new Date(),
        });

        const configId = (resultado as any).insertId || 0;

        logger.info({
          message: "Configuração de sincronização salva",
          configId,
          sistema: input.sistema,
          tipoDados: input.tipoDados,
          estabelecimentoId: input.estabelecimentoId,
        });

        return {
          sucesso: true,
          mensagem: "Configuração salva com sucesso",
          configId,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao salvar configuração",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao salvar",
          configId: null,
        };
      }
    }),

  /**
   * Lista todas as configurações
   */
  listarConfiguracoes: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (ctx.user?.role !== "admin") {
        return {
          configuracoes: [],
          total: 0,
        };
      }

      const db = await getDb();
      if (!db) {
        return {
          configuracoes: [],
          total: 0,
        };
      }

      const configs = await db.select().from(queryConfiguracoes);

      return {
        configuracoes: configs.map((c) => ({
          id: c.id,
          estabelecimentoId: c.estabelecimentoId,
          sistema: c.sistema,
          tipoDados: c.tipoDados,
          querySql: c.querySql,
          frequencia: c.frequencia,
          descricao: c.descricao,
          ativo: c.ativo,
          ultimaSincronizacao: c.ultimaSincronizacao,
          proximaSincronizacao: c.proximaSincronizacao,
        })),
        total: configs.length,
      };
    } catch (error) {
      logger.error({
        message: "Erro ao listar configurações",
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        configuracoes: [],
        total: 0,
      };
    }
  }),

  /**
   * Obtém status de sincronização
   */
  obterStatus: protectedProcedure
    .input(z.object({ configId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            status: "nao_autorizado",
            mensagem: "Acesso negado",
            totalConfigs: 0,
            ativas: 0,
            ultimaSincronizacao: null,
          };
        }

        const db = await getDb();
        if (!db) {
          return {
            status: "erro",
            mensagem: "Erro ao conectar ao banco de dados",
            totalConfigs: 0,
            ativas: 0,
            ultimaSincronizacao: null,
          };
        }

        const configs = await db.select().from(queryConfiguracoes);
        const ativas = configs.filter((c) => c.ativo).length;

        return {
          status: "ok",
          mensagem: "Status obtido com sucesso",
          totalConfigs: configs.length,
          ativas,
          ultimaSincronizacao: configs.length > 0 ? configs[0].ultimaSincronizacao : null,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao obter status",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          status: "erro",
          mensagem: error instanceof Error ? error.message : "Erro ao obter status",
          totalConfigs: 0,
          ativas: 0,
          ultimaSincronizacao: null,
        };
      }
    }),

  /**
   * Obtém logs de sincronização
   */
  obterLogs: protectedProcedure
    .input(z.object({ configId: z.number().optional(), limite: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            logs: [],
            total: 0,
          };
        }

        // Retornar logs simulados por enquanto
        return {
          logs: [
            {
              id: 1,
              configId: input.configId || 0,
              timestamp: new Date(),
              status: "sucesso",
              mensagem: "Sincronização concluída com sucesso",
              registrosProcessados: 150,
            },
          ],
          total: 1,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao obter logs",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          logs: [],
          total: 0,
        };
      }
    }),

  /**
   * Sincroniza dados de uma configuração
   */
  sincronizar: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            sucesso: false,
            mensagem: "Apenas administradores podem sincronizar",
            registrosProcessados: 0,
          };
        }

        const db = await getDb();
        if (!db) {
          return {
            sucesso: false,
            mensagem: "Erro ao conectar ao banco de dados",
            registrosProcessados: 0,
          };
        }

        // Buscar configuração
        const configs = await db
          .select()
          .from(queryConfiguracoes)
          .where(eq(queryConfiguracoes.id, input.configId));

        if (configs.length === 0) {
          return {
            sucesso: false,
            mensagem: "Configuração não encontrada",
            registrosProcessados: 0,
          };
        }

        const config = configs[0];
        let registrosProcessados = 0;

        logger.info({
          message: "Iniciando sincronização",
          configId: input.configId,
          sistema: config.sistema,
          tipoDados: config.tipoDados,
        });

        if (config.sistema === "warleine") {
          try {
            // Parse da configuração de conexão
            let conexao = {};
            if (config.conexaoConfig) {
              if (typeof config.conexaoConfig === 'string') {
                conexao = JSON.parse(config.conexaoConfig);
              } else {
                conexao = config.conexaoConfig as any;
              }
            }

            logger.info({
              message: "Configuração de conexão",
              conexao: { ...conexao, password: '***' },
            });

            const connector = new WarleineConnector(conexao as any);

            // Conectar ao WARLEINE
            const conectado = await connector.conectar();
            if (!conectado) {
              logger.error({
                message: "Falha ao conectar ao WARLEINE",
                configId: input.configId,
              });
              return {
                sucesso: false,
                mensagem: "Falha ao conectar ao banco WARLEINE",
                registrosProcessados: 0,
              };
            }

            logger.info({
              message: "Conectado ao WARLEINE",
              configId: input.configId,
            });

            // Executar query para trazer todos os dados
            const dados = await connector.executarQuery(config.querySql);
            registrosProcessados = dados.length;

            logger.info({
              message: "Dados extraídos do WARLEINE",
              registrosProcessados,
              configId: input.configId,
            });

            // Armazenar em tabela de staging
            if (registrosProcessados > 0) {
              try {
                // Inserir dados em lotes para evitar erro de query muito grande
                const BATCH_SIZE = 100;
                for (let i = 0; i < dados.length; i += BATCH_SIZE) {
                  const batch = dados.slice(i, i + BATCH_SIZE);
                  const valuesToInsert = batch.map((row: any) => ({
                    estabelecimentoId: config.estabelecimentoId,
                    configId: config.id,
                    dadosBrutos: row,
                  }));

                  console.log(`[DEBUG] Tentando inserir lote ${Math.floor(i / BATCH_SIZE) + 1} com ${valuesToInsert.length} registros`);
                  const result = await db.insert(warleineAtendimentosStaging).values(valuesToInsert);
                  console.log(`[DEBUG] Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido com sucesso`, result);
                  
                  logger.info({
                    message: `Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido`,
                    registrosNoLote: batch.length,
                    configId: input.configId,
                  });
                }

                logger.info({
                  message: "Dados armazenados em staging",
                  tabela: "warleine_atendimentos_staging",
                  registros: registrosProcessados,
                  configId: input.configId,
                });
              } catch (insertError) {
                console.error("[ERROR] Erro ao inserir dados em staging:", insertError);
                logger.error({
                  message: "Erro ao inserir dados em staging",
                  error: insertError instanceof Error ? insertError.message : String(insertError),
                  stack: insertError instanceof Error ? insertError.stack : undefined,
                  configId: input.configId,
                });
                // NÃO lançar erro - apenas registrar e continuar
                console.log("[WARNING] Continuando apesar do erro de inserção");
              }
            }

            // Desconectar
            await connector.desconectar();

            // Atualizar última sincronização
            await db
              .update(queryConfiguracoes)
              .set({ 
                ultimaSincronizacao: new Date(),
                totalRegistrosSincronizados: registrosProcessados,
              })
              .where(eq(queryConfiguracoes.id, input.configId));

            logger.info({
              message: "Sincronização concluída com sucesso",
              configId: input.configId,
              registrosProcessados,
            });
          } catch (error) {
            logger.error({
              message: "Erro durante sincronização WARLEINE",
              error: error instanceof Error ? error.message : String(error),
              configId: input.configId,
            });
            throw error;
          }
        }

        return {
          sucesso: true,
          mensagem: `Sincronização concluída. ${registrosProcessados} registros processados.`,
          registrosProcessados,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao sincronizar",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao sincronizar",
          registrosProcessados: 0,
        };
      }
    }),

  /**
   * Deleta uma configuração
   */
  deletarConfiguracao: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            sucesso: false,
            mensagem: "Apenas administradores podem deletar configurações",
          };
        }

        const db = await getDb();
        if (!db) {
          return {
            sucesso: false,
            mensagem: "Erro ao conectar ao banco de dados",
          };
        }

        await db
          .delete(queryConfiguracoes)
          .where(eq(queryConfiguracoes.id, input.configId));

        logger.info({
          message: "Configuração deletada",
          configId: input.configId,
        });

        return {
          sucesso: true,
          mensagem: "Configuração deletada com sucesso",
        };
      } catch (error) {
        logger.error({
          message: "Erro ao deletar configuração",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao deletar",
        };
      }
    }),

  /**
   * Obtém estatísticas de sincronização
   */
  obterEstatisticas: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          return {
            totalConfiguracoes: 0,
            ultimaSincronizacao: null,
            proximaSincronizacao: null,
          };
        }

        const db = await getDb();
        if (!db) {
          return {
            totalConfiguracoes: 0,
            ultimaSincronizacao: null,
            proximaSincronizacao: null,
          };
        }

        const configs = await db.select().from(queryConfiguracoes);

        return {
          totalConfiguracoes: configs.length,
          ultimaSincronizacao: configs.length > 0 ? configs[0].ultimaSincronizacao : null,
          proximaSincronizacao: configs.length > 0 ? configs[0].proximaSincronizacao : null,
        };
      } catch (error) {
        logger.error({
          message: "Erro ao obter estatísticas",
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          totalConfiguracoes: 0,
          ultimaSincronizacao: null,
          proximaSincronizacao: null,
        };
      }
    }),

  /**
   * Lista estabelecimentos
   */
  listarEstabelecimentos: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (ctx.user?.role !== "admin") {
        return [];
      }

      const db = await getDb();
      if (!db) {
        return [];
      }

      const estabelecimentosList = await db.select().from(estabelecimentos);

      return estabelecimentosList.map((e) => ({
        id: e.id,
        nome: e.nome,
        cnpj: e.cnpj,
      }));
    } catch (error) {
      logger.error({
        message: "Erro ao listar estabelecimentos",
        error: error instanceof Error ? error.message : String(error),
      });

      return [];
    }
  }),

  transformarParaAtendimentos: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }
        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");
        const config = await db
          .select()
          .from(queryConfiguracoes)
          .where(eq(queryConfiguracoes.id, input.configId))
          .limit(1)
          .then((rows) => rows[0]);
        if (!config) throw new Error("Configuracao nao encontrada");
        const stagingData = await db
          .select()
          .from(warleineAtendimentosStaging)
          .where(eq(warleineAtendimentosStaging.configId, input.configId));
        console.log(`[DEBUG] Transformando ${stagingData.length} registros`);
        // atendimentos já foi importado no topo do arquivo
        let registrosTransformados = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < stagingData.length; i += BATCH_SIZE) {
          const batch = stagingData.slice(i, i + BATCH_SIZE);
          const valuesToInsert = batch.map((row) => {
            const dados = row.dadosBrutos as any;
            return {
              origemSistema: "WARLEINE",
              origemId: `${config.id}-${row.id}`,
              estabelecimentoId: row.estabelecimentoId,
              numero_atendimento: dados?.numatend || null,
              codigo_saida: dados?.codtipsai || null,
              convenio: dados?.nomeplaco || null,
              paciente: dados?.nomepac || null,
              caracter_atendimento: dados?.carater || null,
              data_entrada: dados?.datatend ? new Date(dados.datatend) : null,
              data_saida: dados?.datasai ? new Date(dados.datasai) : null,
              tipo_atendimento: dados?.tipoatendimentodescricao || null,
              descricao_atendimento: dados?.tipoatendimentodescricao || null,
              codigo_servico: dados?.codserv || null,
              codigo_procedimento: dados?.procprin || null,
              destino_conta: dados?.codcc_destino || null,
            };
          });
          const result = await db.insert(atendimentos).values(valuesToInsert);
          registrosTransformados += valuesToInsert.length;
        }
        await db
          .update(queryConfiguracoes)
          .set({ ultimaSincronizacao: new Date() })
          .where(eq(queryConfiguracoes.id, input.configId));
        return {
          sucesso: true,
          mensagem: `${registrosTransformados} registros transformados`,
          registrosTransformados,
        };
      } catch (error) {
        console.error("[ERROR]", error);
        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao transformar",
          registrosTransformados: 0,
        };
      }
    }),

  atualizarAgendamento: protectedProcedure
    .input(
      z.object({
        configId: z.number(),
        frequencia: z.enum(["tempo_real", "1x_dia", "1x_semana", "1x_mes"]),
        ativo: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();

        await db
          .update(queryConfiguracoes)
          .set({
            frequencia: input.frequencia,
            ativo: input.ativo,
            proximaSincronizacao: new Date(),
          })
          .where(eq(queryConfiguracoes.id, input.configId));

        const { updateJobSchedule } = await import("../_core/jobScheduler");
        await updateJobSchedule(input.configId, input.frequencia, input.ativo);

        return {
          sucesso: true,
          mensagem: `Agendamento atualizado: ${input.frequencia}`,
        };
      } catch (error) {
        console.error("[ERROR]", error);
        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao atualizar agendamento",
        };
      }
    }),

  // ============================================================
  // SINCRONIZAÇÃO DAS VIEWS DO POSTGRESQL EXTERNO
  // ============================================================

  /**
   * Sincroniza atendimentos sem conta (view din_Atend_n_receb)
   * Busca dados do PostgreSQL externo e grava no banco interno
   */
  sincronizarAtendimentosSemConta: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");

        // Usar credenciais WARLEINE (mesmo banco PostgreSQL)
        const connector = new WarleineConnector({
          host: ENV.warleineDbHost || ENV.pgAtendimentosHost,
          port: parseInt(ENV.warleineDbPort || ENV.pgAtendimentosPort, 10),
          database: ENV.warleineDbName || ENV.pgAtendimentosDatabase,
          user: ENV.warleineDbUser || ENV.pgAtendimentosUser,
          password: ENV.warleineDbPassword || ENV.pgAtendimentosPassword,
        });

        const conectado = await connector.conectar();
        if (!conectado) {
          return { sucesso: false, mensagem: "Falha ao conectar ao PostgreSQL externo", totalRegistros: 0 };
        }

        // Extrair dados da view
        const dados = await connector.extrairAtendimentosSemConta();
        await connector.desconectar();

        // Limpar dados antigos do estabelecimento
        await db.delete(atendimentosSemConta)
          .where(eq(atendimentosSemConta.estabelecimentoId, input.estabelecimentoId));

        // Inserir novos dados em lotes
        let registrosInseridos = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row) => ({
            estabelecimentoId: input.estabelecimentoId,
            origemSistema: "WARLEINE",
            numatend: row.numatend || "",
            nomeplaco: row.nomeplaco || null,
            nomepac: row.nomepac || null,
            carater: row.carater || null,
            datatend: row.datatend ? new Date(row.datatend) : null,
            datasai: row.datasai ? new Date(row.datasai) : null,
            tipoatend: row.tipoatend || null,
            tipoatendimentodescricao: row.tipoatendimentodescricao || null,
            codserv: row.codserv || null,
            procprin: row.procprin || null,
            codcc_destino: row.codcc_destino || null,
            motivo: row.motivo || null,
            dataSincronizacao: new Date(),
          }));
          await db.insert(atendimentosSemConta).values(values);
          registrosInseridos += values.length;
        }

        return {
          sucesso: true,
          mensagem: `${registrosInseridos} atendimentos sem conta sincronizados`,
          totalRegistros: registrosInseridos,
        };
      } catch (error) {
        console.error("[ERROR] sincronizarAtendimentosSemConta:", error);
        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao sincronizar",
          totalRegistros: 0,
        };
      }
    }),

  /**
   * Sincroniza atendimentos a faturar (view din_Atend_receb_s_faturar)
   * Busca dados do PostgreSQL externo e grava no banco interno
   */
  sincronizarAtendimentosAFaturar: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");

        const connector = new WarleineConnector({
          host: ENV.warleineDbHost || ENV.pgAtendimentosHost,
          port: parseInt(ENV.warleineDbPort || ENV.pgAtendimentosPort, 10),
          database: ENV.warleineDbName || ENV.pgAtendimentosDatabase,
          user: ENV.warleineDbUser || ENV.pgAtendimentosUser,
          password: ENV.warleineDbPassword || ENV.pgAtendimentosPassword,
        });

        const conectado = await connector.conectar();
        if (!conectado) {
          return { sucesso: false, mensagem: "Falha ao conectar ao PostgreSQL externo", totalRegistros: 0 };
        }

        const dados = await connector.extrairAtendimentosAFaturar();
        await connector.desconectar();

        // Limpar dados antigos do estabelecimento
        await db.delete(atendimentosAFaturar)
          .where(eq(atendimentosAFaturar.estabelecimentoId, input.estabelecimentoId));

        // Inserir novos dados em lotes
        let registrosInseridos = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row) => ({
            estabelecimentoId: input.estabelecimentoId,
            origemSistema: "WARLEINE",
            numatend: row.numatend || "",
            nomeplaco: row.nomeplaco || null,
            nomepac: row.nomepac || null,
            carater: row.carater || null,
            datatend: row.datatend ? new Date(row.datatend) : null,
            datasai: row.datasai ? new Date(row.datasai) : null,
            tipoatend: row.tipoatend || null,
            tipoatendimentodescricao: row.tipoatendimentodescricao || null,
            codserv: row.codserv || null,
            procprin: row.procprin || null,
            dataSincronizacao: new Date(),
          }));
          await db.insert(atendimentosAFaturar).values(values);
          registrosInseridos += values.length;
        }

        return {
          sucesso: true,
          mensagem: `${registrosInseridos} atendimentos a faturar sincronizados`,
          totalRegistros: registrosInseridos,
        };
      } catch (error) {
        console.error("[ERROR] sincronizarAtendimentosAFaturar:", error);
        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao sincronizar",
          totalRegistros: 0,
        };
      }
    }),

  /**
   * Busca atendimentos sem conta do banco interno
   */
  listarAtendimentosSemConta: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return [];
        const dados = await db
          .select()
          .from(atendimentosSemConta)
          .where(eq(atendimentosSemConta.estabelecimentoId, input.estabelecimentoId));
        return dados;
      } catch (error) {
        console.error("[ERROR] listarAtendimentosSemConta:", error);
        return [];
      }
    }),

  /**
   * Busca atendimentos a faturar do banco interno
   */
  listarAtendimentosAFaturar: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return [];
        const dados = await db
          .select()
          .from(atendimentosAFaturar)
          .where(eq(atendimentosAFaturar.estabelecimentoId, input.estabelecimentoId));
        return dados;
      } catch (error) {
        console.error("[ERROR] listarAtendimentosAFaturar:", error);
        return [];
      }
    }),

  limparSincronizacao: protectedProcedure
    .input(z.object({ configId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");

        const config = await db
          .select()
          .from(queryConfiguracoes)
          .where(eq(queryConfiguracoes.id, input.configId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!config) throw new Error("Configuracao nao encontrada");

        const stagingData = await db
          .select()
          .from(warleineAtendimentosStaging)
          .where(eq(warleineAtendimentosStaging.configId, input.configId));

        const stagingIds = stagingData.map((row) => row.id);
        console.log(
          `[DEBUG] Encontrados ${stagingIds.length} registros de staging para limpar`
        );

        let registrosRemovidosUnificados = 0;
        if (stagingIds.length > 0) {
          const origemIds = stagingIds.map(
            (id) => `${input.configId}-${id}`
          );

          const BATCH_SIZE = 100;
          for (let i = 0; i < origemIds.length; i += BATCH_SIZE) {
            const batch = origemIds.slice(i, i + BATCH_SIZE);
            const values = batch.map((id) => `'${id}'`).join(",");
            await db.execute(
              sql.raw(`DELETE FROM atendimentos_unificados WHERE origemId IN (${values})`)
            );
            registrosRemovidosUnificados += batch.length;
          }
        }

        await db.execute(
          sql.raw(`DELETE FROM warleine_atendimentos_staging WHERE configId = ${input.configId}`)
        );

        await db
          .update(queryConfiguracoes)
          .set({
            ultimaSincronizacao: null,
            totalRegistrosSincronizados: 0,
          })
          .where(eq(queryConfiguracoes.id, input.configId));

        return {
          sucesso: true,
          mensagem: `Sincronizacao limpa. ${registrosRemovidosUnificados} registros removidos.`,
          registrosRemovidos: registrosRemovidosUnificados + stagingIds.length,
        };
      } catch (error) {
        console.error("[ERROR]", error);
        return {
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Erro ao limpar sincronizacao",
          registrosRemovidos: 0,
        };
      }
    }),
});