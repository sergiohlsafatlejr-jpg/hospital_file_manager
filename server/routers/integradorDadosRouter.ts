import { z } from "zod";
import { eq, sql, and } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { dataSyncEngine, SyncConfig } from "../dataSyncEngine";
import { WarleineConnector } from "../connectors/WarleineConnector";
import { EasyVisionConnector } from "../connectors/EasyVisionConnector";
import { logger } from "../_core/logger";
import * as dbIntegrador from "../db-integrador";
import { getDb, verificarPermissaoEstabelecimento } from "../db";
import { permissoesEstabelecimento, estabelecimentos } from "../../drizzle/schema";
import { queryConfiguracoes, warleineAtendimentosStaging, warleineFaturamentoStaging, faturamentoGeral, atendimentosSemConta, atendimentosAFaturar } from "../../drizzle/schema-integracao";
import { atendimentos } from "../../drizzle/schema-integracao";
import { ENV } from "../_core/env";

/**
 * Verifica se o usuário é admin global OU administrador do estabelecimento
 * Usado para controle de acesso no Integrador de Dados
 */
async function isAdminOrEstabAdmin(ctx: { user?: { id: number; role: string } | null }, estabelecimentoId?: number): Promise<boolean> {
  if (!ctx.user) return false;
  // Admin global sempre tem acesso
  if (ctx.user.role === "admin") return true;
  // Se tem estabelecimentoId, verificar permissão de gerenciar nesse estabelecimento
  if (estabelecimentoId) {
    return verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, "gerenciar");
  }
  // Se não tem estabelecimentoId, verificar se é admin em algum estabelecimento
  const db = await getDb();
  if (!db) return false;
  const perms = await db.select().from(permissoesEstabelecimento).where(
    and(
      eq(permissoesEstabelecimento.userId, ctx.user.id),
      eq(permissoesEstabelecimento.podeGerenciar, "sim")
    )
  ).limit(1);
  return perms.length > 0;
}


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
        tipoDados: z.enum(["atendimentos", "faturamento", "procedimentos", "pacientes", "busca_conta"]),
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
        if (!(await isAdminOrEstabAdmin(ctx, input.estabelecimentoId))) {
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
  listarConfiguracoes: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    try {
      if (!(await isAdminOrEstabAdmin(ctx, input?.estabelecimentoId))) {
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

      const estabId = input?.estabelecimentoId;
      const configs = estabId
        ? await db.select().from(queryConfiguracoes).where(eq(queryConfiguracoes.estabelecimentoId, estabId))
        : await db.select().from(queryConfiguracoes);

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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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

            // Determinar tabela de staging com base no tipoDados
            const isFaturamento = config.tipoDados?.toLowerCase().includes('faturamento');
            const stagingTable = isFaturamento ? warleineFaturamentoStaging : warleineAtendimentosStaging;
            const stagingTableName = isFaturamento ? 'warleine_faturamento_staging' : 'warleine_atendimentos_staging';

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

                  console.log(`[DEBUG] Tentando inserir lote ${Math.floor(i / BATCH_SIZE) + 1} com ${valuesToInsert.length} registros na ${stagingTableName}`);
                  const result = await db.insert(stagingTable).values(valuesToInsert);
                  console.log(`[DEBUG] Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido com sucesso`, result);
                  
                  logger.info({
                    message: `Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido`,
                    registrosNoLote: batch.length,
                    configId: input.configId,
                  });
                }

                logger.info({
                  message: "Dados armazenados em staging",
                  tabela: stagingTableName,
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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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
        if (!(await isAdminOrEstabAdmin(ctx, input.estabelecimentoId))) {
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
      if (!ctx.user) return [];

      const db = await getDb();
      if (!db) {
        return [];
      }

      // Admin global vê todos os estabelecimentos
      if (ctx.user.role === "admin") {
        const estabelecimentosList = await db.select().from(estabelecimentos);
        return estabelecimentosList.map((e) => ({
          id: e.id,
          nome: e.nome,
          cnpj: e.cnpj,
        }));
      }

      // Usuários não-admin: retornar apenas estabelecimentos onde têm permissão de gerenciar
      const permsComEstab = await db
        .select({
          id: estabelecimentos.id,
          nome: estabelecimentos.nome,
          cnpj: estabelecimentos.cnpj,
        })
        .from(permissoesEstabelecimento)
        .innerJoin(estabelecimentos, eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentos.id))
        .where(and(
          eq(permissoesEstabelecimento.userId, ctx.user.id),
          eq(permissoesEstabelecimento.podeGerenciar, "sim")
        ));

      return permsComEstab;
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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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

        // Verificar o tipoDados para direcionar para a tabela correta
        const isFaturamento = config.tipoDados?.toLowerCase().includes('faturamento');

        if (isFaturamento) {
          // FATURAMENTO: transformar de warleine_faturamento_staging para faturamento_geral
          const stagingData = await db
            .select()
            .from(warleineFaturamentoStaging)
            .where(eq(warleineFaturamentoStaging.configId, input.configId));
          console.log(`[DEBUG] Transformando ${stagingData.length} registros de FATURAMENTO`);
          let registrosTransformados = 0;
          const BATCH_SIZE = 100;
          for (let i = 0; i < stagingData.length; i += BATCH_SIZE) {
            const batch = stagingData.slice(i, i + BATCH_SIZE);
            const valuesToInsert = batch.map((row) => {
              const dados = row.dadosBrutos as any;
              return {
                origemSistema: "WARLEINE",
                estabelecimentoId: row.estabelecimentoId,
                configId: config.id,
                aihguia: dados?.aihguia || null,
                codcc: dados?.codcc || null,
                codconv: dados?.codconv || null,
                codgrufi: dados?.codgrufi || null,
                codproprio: dados?.codproprio || null,
                codrecur: dados?.codrecur || null,
                codtiss: dados?.codtiss || null,
                complrecur: dados?.complrecur || null,
                data: dados?.data ? new Date(dados.data) : null,
                dataint: dados?.dataint ? new Date(dados.dataint) : null,
                datasai: dados?.datasai ? new Date(dados.datasai) : null,
                descmotivo: dados?.descmotivo || null,
                descricao: dados?.descricao || null,
                funcaotiss: dados?.funcaotiss || null,
                gl_aceita: dados?.gl_aceita || null,
                gl_analise: dados?.gl_analise || null,
                gl_recuperada: dados?.gl_recuperada || null,
                gl_recurso: dados?.gl_recurso || null,
                guiacobra: dados?.guiacobra || null,
                matricula: dados?.matricula || null,
                mesprod: dados?.mesprod || null,
                nomecc: dados?.nomecc || null,
                nomeconv: dados?.nomeconv || null,
                nomeprest: dados?.nomeprest || null,
                numconta: dados?.numconta || null,
                numfatura: dados?.numfatura || null,
                prestexe: dados?.prestexe || null,
                procdisco: dados?.procdisco || null,
                protocolo: dados?.protocolo || null,
                quantidade: dados?.quantidade || null,
                receber: dados?.receber || null,
                tipoatend: dados?.tipoatend || null,
                tipoproc: dados?.tipoproc || null,
                vl_aberto: dados?.vl_aberto || null,
                vl_faturado: dados?.vl_faturado || null,
                vl_glosas: dados?.vl_glosas || null,
                vl_receb_a_maior: dados?.vl_receb_a_maior || null,
                vl_recebido: dados?.vl_recebido || null,
                vl_total_recebido: dados?.vl_total_recebido || null,
                vl_unitario: dados?.vl_unitario || null,
              };
            });
            await db.insert(faturamentoGeral).values(valuesToInsert);
            registrosTransformados += valuesToInsert.length;
          }
          await db
            .update(queryConfiguracoes)
            .set({ ultimaSincronizacao: new Date() })
            .where(eq(queryConfiguracoes.id, input.configId));
          return {
            sucesso: true,
            mensagem: `${registrosTransformados} registros de faturamento transformados`,
            registrosTransformados,
          };
        } else {
          // ATENDIMENTOS: transformar de warleine_atendimentos_staging para atendimentos_unificados
          const stagingData = await db
            .select()
            .from(warleineAtendimentosStaging)
            .where(eq(warleineAtendimentosStaging.configId, input.configId));
          console.log(`[DEBUG] Transformando ${stagingData.length} registros de ATENDIMENTOS`);
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
            await db.insert(atendimentos).values(valuesToInsert);
            registrosTransformados += valuesToInsert.length;
          }
          await db
            .update(queryConfiguracoes)
            .set({ ultimaSincronizacao: new Date() })
            .where(eq(queryConfiguracoes.id, input.configId));
          return {
            sucesso: true,
            mensagem: `${registrosTransformados} registros de atendimentos transformados`,
            registrosTransformados,
          };
        }
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
        if (!db) throw new Error("Database not available");

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
  // SINCRONIZAÇÃO EASYVISION (Views PostgreSQL Externo)
  // Fluxo: EASYVISION -> staging (atendimentos_sem_conta / atendimentos_a_faturar) -> atendimentos_unificados
  // ============================================================

  /**
   * Sincroniza atendimentos sem conta (view din_Atend_n_receb) do EASYVISION
   * 1. Busca dados do PostgreSQL externo (EASYVISION)
   * 2. Grava na tabela staging (atendimentos_sem_conta)
   * 3. Popula a tabela atendimentos_unificados
   */
  sincronizarAtendimentosSemConta: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (!(await isAdminOrEstabAdmin(ctx))) {
          throw new Error("Acesso negado");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");

        // Conectar ao EASYVISION (PG_ATENDIMENTOS)
        const connector = new EasyVisionConnector({
          host: ENV.pgAtendimentosHost,
          port: parseInt(ENV.pgAtendimentosPort, 10),
          database: ENV.pgAtendimentosDatabase,
          user: ENV.pgAtendimentosUser,
          password: ENV.pgAtendimentosPassword,
        });

        const conectado = await connector.conectar();
        if (!conectado) {
          return { sucesso: false, mensagem: "Falha ao conectar ao EASYVISION (PG_ATENDIMENTOS)", totalRegistros: 0 };
        }

        // PASSO 1: Extrair dados da view
        const dados = await connector.extrairAtendimentosSemConta();
        await connector.desconectar();

        // PASSO 2: Limpar dados antigos do estabelecimento na staging
        await db.delete(atendimentosSemConta)
          .where(eq(atendimentosSemConta.estabelecimentoId, input.estabelecimentoId));

        // PASSO 2b: Inserir novos dados na staging em lotes
        let registrosInseridos = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row) => ({
            estabelecimentoId: input.estabelecimentoId,
            origemSistema: "EASYVISION",
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

        // PASSO 3: Popular atendimentos_unificados a partir da staging
        // Limpar registros EASYVISION antigos deste estabelecimento
        await db.execute(
          sql.raw(`DELETE FROM atendimentos_unificados WHERE origemSistema = 'EASYVISION' AND estabelecimentoId = ${input.estabelecimentoId} AND descricao_atendimento LIKE '%SEM_CONTA%'`)
        );

        // Transformar staging -> unificados
        let registrosUnificados = 0;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const unificados = batch.map((row) => ({
            origemSistema: "EASYVISION",
            origemId: `easyvision-sem-conta-${row.numatend}`,
            estabelecimentoId: input.estabelecimentoId,
            numero_atendimento: row.numatend || null,
            codigo_saida: null,
            convenio: row.nomeplaco || null,
            paciente: row.nomepac || null,
            caracter_atendimento: row.carater || null,
            data_entrada: row.datatend ? new Date(row.datatend) : null,
            data_saida: row.datasai ? new Date(row.datasai) : null,
            tipo_atendimento: row.tipoatend || null,
            descricao_atendimento: row.tipoatendimentodescricao ? `${row.tipoatendimentodescricao} - SEM_CONTA` : "SEM_CONTA",
            codigo_servico: row.codserv || null,
            codigo_procedimento: row.procprin || null,
            destino_conta: row.codcc_destino || null,
          }));
          await db.insert(atendimentos).values(unificados);
          registrosUnificados += unificados.length;
        }

        return {
          sucesso: true,
          mensagem: `EASYVISION: ${registrosInseridos} atendimentos sem conta sincronizados (staging) e ${registrosUnificados} populados (unificados)`,
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
   * Sincroniza atendimentos a faturar (view din_Atend_receb_s_faturar) do EASYVISION
   * 1. Busca dados do PostgreSQL externo (EASYVISION)
   * 2. Grava na tabela staging (atendimentos_a_faturar)
   * 3. Popula a tabela atendimentos_unificados
   */
  sincronizarAtendimentosAFaturar: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (!(await isAdminOrEstabAdmin(ctx))) {
          throw new Error("Acesso negado");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados nao disponivel");

        // Conectar ao EASYVISION (PG_ATENDIMENTOS)
        const connector = new EasyVisionConnector({
          host: ENV.pgAtendimentosHost,
          port: parseInt(ENV.pgAtendimentosPort, 10),
          database: ENV.pgAtendimentosDatabase,
          user: ENV.pgAtendimentosUser,
          password: ENV.pgAtendimentosPassword,
        });

        const conectado = await connector.conectar();
        if (!conectado) {
          return { sucesso: false, mensagem: "Falha ao conectar ao EASYVISION (PG_ATENDIMENTOS)", totalRegistros: 0 };
        }

        // PASSO 1: Extrair dados da view
        const dados = await connector.extrairAtendimentosAFaturar();
        await connector.desconectar();

        // PASSO 2: Limpar dados antigos do estabelecimento na staging
        await db.delete(atendimentosAFaturar)
          .where(eq(atendimentosAFaturar.estabelecimentoId, input.estabelecimentoId));

        // PASSO 2b: Inserir novos dados na staging em lotes
        let registrosInseridos = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row) => ({
            estabelecimentoId: input.estabelecimentoId,
            origemSistema: "EASYVISION",
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
          mensagem: `EASYVISION: ${registrosInseridos} atendimentos a faturar sincronizados na tabela atendimentos_a_faturar`,
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
        if (!(await isAdminOrEstabAdmin(ctx))) {
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

        const isFaturamento = config.tipoDados?.toLowerCase().includes('faturamento');

        let registrosRemovidosUnificados = 0;

        if (isFaturamento) {
          // Limpar faturamento_geral
          await db.execute(
            sql.raw(`DELETE FROM faturamento_geral WHERE configId = ${input.configId}`)
          );
          const [countResult] = await db.execute(
            sql.raw(`SELECT ROW_COUNT() as cnt`)
          );
          registrosRemovidosUnificados = (countResult as any)?.cnt || 0;

          // Limpar staging de faturamento
          await db.execute(
            sql.raw(`DELETE FROM warleine_faturamento_staging WHERE configId = ${input.configId}`)
          );
        } else {
          // Limpar atendimentos_unificados
          const stagingData = await db
            .select()
            .from(warleineAtendimentosStaging)
            .where(eq(warleineAtendimentosStaging.configId, input.configId));

          const stagingIds = stagingData.map((row) => row.id);
          console.log(
            `[DEBUG] Encontrados ${stagingIds.length} registros de staging para limpar`
          );

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

          // Limpar staging de atendimentos
          await db.execute(
            sql.raw(`DELETE FROM warleine_atendimentos_staging WHERE configId = ${input.configId}`)
          );
        }

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
          registrosRemovidos: registrosRemovidosUnificados,
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

  // ============================================================
  // GERENCIAMENTO DE CONEXÕES (Novo Integrador)
  // ============================================================

  conexoes: router({
    listar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return [];
        return dbIntegrador.listarConexoes(input?.estabelecimentoId);
      }),

    obter: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return null;
        return dbIntegrador.obterConexao(input.id);
      }),

    criar: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        tipo: z.enum(["postgresql", "mysql", "sqlserver", "oracle"]),
        host: z.string().min(1),
        porta: z.number(),
        banco: z.string().min(1),
        usuario: z.string().min(1),
        senha: z.string().min(1),
        ssl: z.enum(["sim", "nao"]).default("nao"),
        estabelecimentoId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const id = await dbIntegrador.criarConexao({
          nome: input.nome,
          descricao: input.descricao || null,
          tipo: input.tipo,
          host: input.host,
          porta: input.porta,
          banco: input.banco,
          usuario: input.usuario,
          senhaEncriptada: Buffer.from(input.senha).toString("base64"),
          ssl: input.ssl,
          estabelecimentoId: input.estabelecimentoId || null,
        });
        return { sucesso: true, id };
      }),

    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        tipo: z.enum(["postgresql", "mysql", "sqlserver", "oracle"]).optional(),
        host: z.string().optional(),
        porta: z.number().optional(),
        banco: z.string().optional(),
        usuario: z.string().optional(),
        senha: z.string().optional(),
        ssl: z.enum(["sim", "nao"]).optional(),
        estabelecimentoId: z.number().nullable().optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const { id, senha, ...rest } = input;
        const dados: any = { ...rest };
        if (senha) dados.senhaEncriptada = Buffer.from(senha).toString("base64");
        await dbIntegrador.atualizarConexao(id, dados);
        return { sucesso: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        await dbIntegrador.excluirConexao(input.id);
        return { sucesso: true };
      }),

    testar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const conexao = await dbIntegrador.obterConexao(input.id);
        if (!conexao) throw new Error("Conexão não encontrada");
        try {
          const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
          if (conexao.tipo === "postgresql") {
            const connector = new EasyVisionConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            const ok = await connector.conectar();
            if (ok) {
              await connector.desconectar();
              await dbIntegrador.atualizarStatusConexao(input.id, "ok");
              return { sucesso: true, mensagem: "Conexão estabelecida com sucesso" };
            }
            throw new Error("Falha ao conectar");
          } else {
            // Para outros tipos, tentar via WarleineConnector (MySQL/SQL Server)
            const connector = new WarleineConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            const ok = await connector.conectar();
            if (ok) {
              await connector.desconectar();
              await dbIntegrador.atualizarStatusConexao(input.id, "ok");
              return { sucesso: true, mensagem: "Conexão estabelecida com sucesso" };
            }
            throw new Error("Falha ao conectar");
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Erro desconhecido";
          await dbIntegrador.atualizarStatusConexao(input.id, "erro", msg);
          return { sucesso: false, mensagem: msg };
        }
      }),

    executarQuery: protectedProcedure
      .input(z.object({
        id: z.number(),
        querySql: z.string().min(1),
        limite: z.number().default(5),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const conexao = await dbIntegrador.obterConexao(input.id);
        if (!conexao) throw new Error("Conexão não encontrada");
        try {
          const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
          let rows: Record<string, any>[] = [];
          
          if (conexao.tipo === "postgresql") {
            const connector = new EasyVisionConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            // Adicionar LIMIT à query se não tiver
            let queryLimitada = input.querySql.trim().replace(/;$/, "");
            if (!/\bLIMIT\b/i.test(queryLimitada)) {
              queryLimitada += ` LIMIT ${input.limite}`;
            }
            const resultado = await connector.executarQuery(queryLimitada);
            rows = resultado || [];
            await connector.desconectar();
          } else {
            const connector = new WarleineConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            let queryLimitada = input.querySql.trim().replace(/;$/, "");
            if (!/\bLIMIT\b/i.test(queryLimitada)) {
              queryLimitada += ` LIMIT ${input.limite}`;
            }
            const resultado = await connector.executarQuery(queryLimitada);
            rows = resultado || [];
            await connector.desconectar();
          }

          if (!rows || rows.length === 0) {
            return {
              sucesso: true,
              mensagem: "Query executada mas não retornou registros",
              campos: [] as Array<{ nome: string; tipo: string; exemplo: string | null }>,
              amostra: [] as Record<string, any>[],
              totalCampos: 0,
            };
          }

          // Detectar campos e tipos a partir dos dados retornados
          const primeiroRegistro = rows[0];
          const campos = Object.keys(primeiroRegistro).map(campo => {
            const valor = primeiroRegistro[campo];
            let tipoDetectado = "varchar";
            if (valor === null || valor === undefined) {
              tipoDetectado = "varchar";
            } else if (typeof valor === "number") {
              tipoDetectado = Number.isInteger(valor) ? "int" : "decimal";
            } else if (typeof valor === "boolean") {
              tipoDetectado = "boolean";
            } else if (valor instanceof Date) {
              tipoDetectado = "datetime";
            } else if (typeof valor === "string") {
              // Tentar detectar datas
              if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
                tipoDetectado = "date";
              } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(valor)) {
                tipoDetectado = "datetime";
              } else if (valor.length > 500) {
                tipoDetectado = "text";
              } else {
                tipoDetectado = "varchar";
              }
            }
            return {
              nome: campo,
              tipo: tipoDetectado,
              exemplo: valor !== null && valor !== undefined ? String(valor).substring(0, 200) : null,
            };
          });

          return {
            sucesso: true,
            mensagem: `Query retornou ${rows.length} registro(s) com ${campos.length} campo(s)`,
            campos,
            amostra: rows.slice(0, 3),
            totalCampos: campos.length,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Erro desconhecido";
          return { sucesso: false, mensagem: msg, campos: [], amostra: [], totalCampos: 0 };
        }
      }),
  }),

  // ============================================================
  // GERENCIAMENTO DE TABELAS DINÂMICAS
  // ============================================================

  tabelas: router({
    listar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return [];
        const tabelas = await dbIntegrador.listarTabelas(input?.estabelecimentoId);
        // Enriquecer com contagem de colunas para cada tabela
        const tabelasComContagem = await Promise.all(
          tabelas.map(async (tab) => {
            const colunas = await dbIntegrador.listarColunas(tab.id);
            return {
              ...tab,
              totalColunas: colunas.length,
            };
          })
        );
        return tabelasComContagem;
      }),

    obter: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return null;
        const tabela = await dbIntegrador.obterTabela(input.id);
        if (!tabela) return null;
        const colunas = await dbIntegrador.listarColunas(input.id);
        return { ...tabela, colunas };
      }),

    criar: protectedProcedure
      .input(z.object({
        nome: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome deve conter apenas letras, números e underscore"),
        nomeExibicao: z.string().min(1),
        descricao: z.string().optional(),
        estabelecimentoId: z.number().optional(),
        colunas: z.array(z.object({
          nome: z.string().min(1),
          nomeExibicao: z.string().min(1),
          tipo: z.enum(["varchar", "int", "bigint", "decimal", "text", "date", "datetime", "boolean"]),
          tamanho: z.number().optional(),
          precisao: z.number().optional(),
          obrigatorio: z.enum(["sim", "nao"]).default("nao"),
          chaveUnica: z.enum(["sim", "nao"]).default("nao"),
          valorPadrao: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        
        // 1. Criar registro na tabela de metadados
        const tabelaId = await dbIntegrador.criarTabela({
          nome: input.nome,
          nomeExibicao: input.nomeExibicao,
          descricao: input.descricao || null,
          estabelecimentoId: input.estabelecimentoId || null,
          criadaNoBanco: "nao",
        });

        // 2. Salvar colunas
        await dbIntegrador.criarColunasEmLote(
          input.colunas.map((col, idx) => ({
            tabelaId,
            nome: col.nome,
            nomeExibicao: col.nomeExibicao,
            tipo: col.tipo,
            tamanho: col.tamanho || null,
            precisao: col.precisao || null,
            obrigatorio: col.obrigatorio,
            chaveUnica: col.chaveUnica,
            valorPadrao: col.valorPadrao || null,
            ordem: idx,
          }))
        );

        // 3. Criar tabela real no MySQL
        try {
          await dbIntegrador.executarDDLCriarTabela(input.nome, input.colunas.map(col => ({
            nome: col.nome,
            tipo: col.tipo,
            tamanho: col.tamanho || null,
            precisao: col.precisao || null,
            obrigatorio: col.obrigatorio,
            chaveUnica: col.chaveUnica,
            valorPadrao: col.valorPadrao || null,
          })));
          await dbIntegrador.atualizarTabela(tabelaId, { criadaNoBanco: "sim" });
        } catch (error) {
          logger.error({ message: "Erro ao criar tabela no MySQL", error: error instanceof Error ? error.message : String(error) });
          // Não falhar - a tabela de metadados foi criada
        }

        return { sucesso: true, id: tabelaId };
      }),

    criarAPartirDeQuery: protectedProcedure
      .input(z.object({
        conexaoId: z.number(),
        querySql: z.string().min(1),
        nomeTabela: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Nome deve conter apenas letras, números e underscore"),
        nomeExibicao: z.string().min(1),
        descricao: z.string().optional(),
        estabelecimentoId: z.number().optional(),
        modoImportacao: z.enum(["completa", "incremental"]).default("incremental"),
        colunaControle: z.string().optional(),
        campoChave: z.string().optional(),
        frequencia: z.enum(["manual", "5min", "15min", "30min", "1hora", "6horas", "12horas", "diario"]).default("manual"),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        
        // 1. Executar a query para detectar campos
        const conexao = await dbIntegrador.obterConexao(input.conexaoId);
        if (!conexao) throw new Error("Conexão não encontrada");
        
        const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
        let rows: Record<string, any>[] = [];
        
        try {
          if (conexao.tipo === "postgresql") {
            const connector = new EasyVisionConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            let queryLimitada = input.querySql.trim().replace(/;$/, "");
            if (!/\bLIMIT\b/i.test(queryLimitada)) {
              queryLimitada += " LIMIT 10";
            }
            rows = (await connector.executarQuery(queryLimitada)) || [];
            await connector.desconectar();
          } else {
            const connector = new WarleineConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            let queryLimitada = input.querySql.trim().replace(/;$/, "");
            if (!/\bLIMIT\b/i.test(queryLimitada)) {
              queryLimitada += " LIMIT 10";
            }
            rows = (await connector.executarQuery(queryLimitada)) || [];
            await connector.desconectar();
          }
        } catch (error) {
          throw new Error(`Erro ao executar query: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        if (!rows || rows.length === 0) {
          throw new Error("A query não retornou registros. Verifique a query e tente novamente.");
        }
        
        // 2. Detectar campos e tipos automaticamente
        const primeiroRegistro = rows[0];
        const camposDetectados = Object.keys(primeiroRegistro).map((campo, idx) => {
          const valor = primeiroRegistro[campo];
          let tipoDetectado = "varchar";
          let tamanho: number | null = 255;
          let precisao: number | null = null;
          
          if (valor === null || valor === undefined) {
            tipoDetectado = "varchar";
            tamanho = 500;
          } else if (typeof valor === "number") {
            if (Number.isInteger(valor)) {
              if (valor > 2147483647 || valor < -2147483648) {
                tipoDetectado = "bigint";
                tamanho = null;
              } else {
                tipoDetectado = "int";
                tamanho = null;
              }
            } else {
              tipoDetectado = "decimal";
              tamanho = 18;
              precisao = 4;
            }
          } else if (typeof valor === "boolean") {
            tipoDetectado = "boolean";
            tamanho = null;
          } else if (valor instanceof Date) {
            tipoDetectado = "datetime";
            tamanho = null;
          } else if (typeof valor === "string") {
            if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
              tipoDetectado = "date";
              tamanho = null;
            } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(valor)) {
              tipoDetectado = "datetime";
              tamanho = null;
            } else if (valor.length > 500) {
              tipoDetectado = "text";
              tamanho = null;
            } else {
              tipoDetectado = "varchar";
              // Estimar tamanho baseado nos dados da amostra
              const maxLen = Math.max(...rows.map(r => {
                const v = r[campo];
                return v ? String(v).length : 0;
              }));
              tamanho = Math.max(255, Math.ceil(maxLen * 1.5));
            }
          }
          
          // Converter nome do campo para snake_case seguro
          const nomeSafe = campo.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
          
          return {
            nome: nomeSafe || `campo_${idx}`,
            nomeExibicao: campo,
            tipo: tipoDetectado as "varchar" | "int" | "bigint" | "decimal" | "text" | "date" | "datetime" | "boolean",
            tamanho,
            precisao,
            obrigatorio: "nao" as const,
            chaveUnica: "nao" as const,
            valorPadrao: null,
          };
        });
        
        // 3. Criar registro na tabela de metadados
        const tabelaId = await dbIntegrador.criarTabela({
          nome: input.nomeTabela,
          nomeExibicao: input.nomeExibicao,
          descricao: input.descricao || `Tabela criada automaticamente a partir de query com ${camposDetectados.length} campos`,
          estabelecimentoId: input.estabelecimentoId || null,
          criadaNoBanco: "nao",
        });
        
        // 4. Salvar colunas nos metadados
        await dbIntegrador.criarColunasEmLote(
          camposDetectados.map((col, idx) => ({
            tabelaId,
            nome: col.nome,
            nomeExibicao: col.nomeExibicao,
            tipo: col.tipo,
            tamanho: col.tamanho,
            precisao: col.precisao,
            obrigatorio: col.obrigatorio,
            chaveUnica: col.chaveUnica,
            valorPadrao: col.valorPadrao,
            ordem: idx,
          }))
        );
        
        // 5. Criar tabela física no MySQL
        try {
          await dbIntegrador.executarDDLCriarTabela(input.nomeTabela, camposDetectados.map(col => ({
            nome: col.nome,
            tipo: col.tipo,
            tamanho: col.tamanho,
            precisao: col.precisao,
            obrigatorio: col.obrigatorio,
            chaveUnica: col.chaveUnica,
            valorPadrao: col.valorPadrao,
          })));
          await dbIntegrador.atualizarTabela(tabelaId, { criadaNoBanco: "sim" });
        } catch (error) {
          logger.error({ message: "Erro ao criar tabela física no MySQL", error: error instanceof Error ? error.message : String(error) });
        }
        
        // 6. Criar mapeamento automático vinculado à tabela para re-execução
        let mapeamentoId: number | null = null;
        try {
          mapeamentoId = await dbIntegrador.criarMapeamento({
            nome: `Sync: ${input.nomeExibicao}`,
            descricao: `Mapeamento criado automaticamente ao criar tabela "${input.nomeExibicao}" a partir de query`,
            conexaoOrigemId: input.conexaoId,
            tabelaDestinoId: tabelaId,
            queryOrigem: input.querySql,
            campoChave: input.campoChave || null,
            frequencia: input.frequencia,
            estabelecimentoId: input.estabelecimentoId || null,
            modoImportacao: input.modoImportacao,
            colunaControle: input.colunaControle || null,
          });

          // Salvar mapeamento de campos automaticamente (1:1 com nomes iguais)
          const colunasTabela = await dbIntegrador.listarColunas(tabelaId);
          if (colunasTabela.length > 0) {
            const camposMapeamento = colunasTabela.map((col: any) => ({
              colunaOrigemNome: col.nomeExibicao || col.nome,
              colunaDestinoId: col.id,
              transformacao: null,
            }));
            await dbIntegrador.salvarCamposMapeamento(mapeamentoId, camposMapeamento);
          }

          logger.info({ message: `Mapeamento automático criado: ID ${mapeamentoId} para tabela ${input.nomeExibicao}` });
        } catch (error) {
          logger.error({ message: "Erro ao criar mapeamento automático", error: error instanceof Error ? error.message : String(error) });
        }
        
        return {
          sucesso: true,
          id: tabelaId,
          mapeamentoId,
          camposDetectados: camposDetectados.length,
          campos: camposDetectados.map(c => ({ nome: c.nome, nomeExibicao: c.nomeExibicao, tipo: c.tipo })),
        };
      }),

    adicionarColuna: protectedProcedure
      .input(z.object({
        tabelaId: z.number(),
        nome: z.string().min(1),
        nomeExibicao: z.string().min(1),
        tipo: z.enum(["varchar", "int", "bigint", "decimal", "text", "date", "datetime", "boolean"]),
        tamanho: z.number().optional(),
        precisao: z.number().optional(),
        obrigatorio: z.enum(["sim", "nao"]).default("nao"),
        valorPadrao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const tabela = await dbIntegrador.obterTabela(input.tabelaId);
        if (!tabela) throw new Error("Tabela não encontrada");

        // Adicionar coluna nos metadados
        const colunas = await dbIntegrador.listarColunas(input.tabelaId);
        await dbIntegrador.criarColuna({
          tabelaId: input.tabelaId,
          nome: input.nome,
          nomeExibicao: input.nomeExibicao,
          tipo: input.tipo,
          tamanho: input.tamanho || null,
          precisao: input.precisao || null,
          obrigatorio: input.obrigatorio,
          chaveUnica: "nao",
          valorPadrao: input.valorPadrao || null,
          ordem: colunas.length,
        });

        // Adicionar coluna na tabela real
        if (tabela.criadaNoBanco === "sim") {
          try {
            await dbIntegrador.executarDDLAdicionarColuna(`integ_${tabela.nome}`, {
              nome: input.nome,
              tipo: input.tipo,
              tamanho: input.tamanho || null,
              precisao: input.precisao || null,
              obrigatorio: input.obrigatorio,
              valorPadrao: input.valorPadrao || null,
            });
          } catch (error) {
            logger.error({ message: "Erro ao adicionar coluna", error: error instanceof Error ? error.message : String(error) });
          }
        }

        return { sucesso: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const tabela = await dbIntegrador.obterTabela(input.id);
        if (!tabela) throw new Error("Tabela não encontrada");

        // Remover tabela real se existir
        if (tabela.criadaNoBanco === "sim") {
          try {
            await dbIntegrador.executarDDLRemoverTabela(`integ_${tabela.nome}`);
          } catch (error) {
            logger.error({ message: "Erro ao remover tabela", error: error instanceof Error ? error.message : String(error) });
          }
        }

        // Remover metadados
        await dbIntegrador.excluirTabela(input.id);
        return { sucesso: true };
      }),

    obterMapeamentoVinculado: protectedProcedure
      .input(z.object({ tabelaId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return null;
        return dbIntegrador.buscarMapeamentoPorTabela(input.tabelaId);
      }),

    sincronizarTabela: protectedProcedure
      .input(z.object({
        tabelaId: z.number(),
        forcarCompleta: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        
        // Buscar mapeamento vinculado à tabela
        const mapeamento = await dbIntegrador.buscarMapeamentoPorTabela(input.tabelaId);
        if (!mapeamento) {
          throw new Error("Nenhum mapeamento de sincronização encontrado para esta tabela. Crie um mapeamento na aba Mapeamentos.");
        }

        // Delegar para a procedure executar do mapeamento
        const tabela = await dbIntegrador.obterTabela(input.tabelaId);
        if (!tabela || tabela.criadaNoBanco !== "sim") {
          throw new Error("Tabela não encontrada ou não criada no banco");
        }

        const conexao = await dbIntegrador.obterConexao(mapeamento.conexaoOrigemId);
        if (!conexao) throw new Error("Conexão de origem não encontrada");

        const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
        const nomeReal = `integ_${tabela.nome}`;

        // Determinar modo de importação
        const modoEfetivo = input.forcarCompleta ? "completa" : (mapeamento.modoImportacao || "completa");

        // Construir query com filtro incremental se aplicável
        let queryFinal = mapeamento.queryOrigem.trim().replace(/;$/, "");
        if (modoEfetivo === "incremental" && mapeamento.colunaControle && mapeamento.ultimoValorControle && !input.forcarCompleta) {
          const valorEscapado = mapeamento.ultimoValorControle.replace(/'/g, "''");
          if (/\bWHERE\b/i.test(queryFinal)) {
            queryFinal = queryFinal.replace(/(WHERE)/i, `$1 ${mapeamento.colunaControle} > '${valorEscapado}' AND`);
          } else {
            queryFinal += ` WHERE ${mapeamento.colunaControle} > '${valorEscapado}'`;
          }
        }

        // Criar registro de sincronização
        const syncId = await dbIntegrador.criarSincronizacao({
          mapeamentoId: mapeamento.id,
          status: "executando",
          executadoPor: ctx.user?.name || "sistema",
        });

        const inicio = Date.now();
        const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de timeout

        const executarSync = async () => {
          let rows: Record<string, any>[] = [];

          if (conexao.tipo === "postgresql") {
            const connector = new EasyVisionConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            rows = (await connector.executarQuery(queryFinal)) || [];
            await connector.desconectar();
          } else {
            const connector = new WarleineConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            await connector.conectar();
            rows = (await connector.executarQuery(queryFinal)) || [];
            await connector.desconectar();
          }

          // Se importação completa, limpar tabela antes
          if (modoEfetivo === "completa") {
            await dbIntegrador.limparDadosTabela(nomeReal);
          }

          // Buscar campos do mapeamento
          const camposMapeamento = await dbIntegrador.listarCamposMapeamento(mapeamento.id);
          const colunasTabela = await dbIntegrador.listarColunas(input.tabelaId);

          // Mapear colunas
          const colunaMap = new Map<number, string>();
          colunasTabela.forEach((col: any) => { colunaMap.set(col.id, col.nome); });

          // Inserir dados
          let registrosInseridos = 0;
          const BATCH_SIZE = 500;

          const estabIdSync = mapeamento.estabelecimentoId || tabela.estabelecimentoId;
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const dadosMapeados = batch.map((row: any) => {
              const registro: Record<string, any> = {};
              // Incluir estabelecimento_id automaticamente
              if (estabIdSync) {
                registro.estabelecimento_id = estabIdSync;
              }
              if (camposMapeamento.length > 0) {
                camposMapeamento.forEach((campo: any) => {
                  const nomeDestino = colunaMap.get(campo.colunaDestinoId);
                  if (nomeDestino && campo.colunaOrigemNome in row) {
                    let valor = row[campo.colunaOrigemNome];
                    if (campo.transformacao === "UPPER" && typeof valor === "string") valor = valor.toUpperCase();
                    if (campo.transformacao === "LOWER" && typeof valor === "string") valor = valor.toLowerCase();
                    if (campo.transformacao === "TRIM" && typeof valor === "string") valor = valor.trim();
                    registro[nomeDestino] = valor;
                  }
                });
              } else {
                // Sem mapeamento de campos: inserir diretamente
                Object.entries(row).forEach(([key, val]) => {
                  const nomeSafe = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                  registro[nomeSafe] = val;
                });
              }
              return registro;
            });

            const resultado = await dbIntegrador.inserirDadosTabela(nomeReal, dadosMapeados, mapeamento.campoChave || undefined);
            registrosInseridos += resultado.inseridos;
          }

          // Atualizar último valor de controle
          let novoUltimoValor = mapeamento.ultimoValorControle;
          if (modoEfetivo === "incremental" && mapeamento.colunaControle && rows.length > 0) {
            const ultimoRegistro = rows[rows.length - 1];
            const valorControle = ultimoRegistro[mapeamento.colunaControle];
            if (valorControle !== undefined && valorControle !== null) {
              novoUltimoValor = String(valorControle);
            }
          }

          const duracaoMs = Date.now() - inicio;

          // Atualizar mapeamento
          const updateData: any = {
            ultimaSincronizacao: new Date(),
          };
          if (novoUltimoValor !== mapeamento.ultimoValorControle) {
            updateData.ultimoValorControle = novoUltimoValor;
          }
          if (modoEfetivo === "incremental") {
            updateData.totalRegistrosImportados = (mapeamento.totalRegistrosImportados || 0) + registrosInseridos;
          } else {
            updateData.totalRegistrosImportados = registrosInseridos;
          }
          await dbIntegrador.atualizarMapeamento(mapeamento.id, updateData);

          // Atualizar contagem na tabela
          const totalAtual = await dbIntegrador.contarRegistrosTabela(nomeReal);
          await dbIntegrador.atualizarTabela(input.tabelaId, { totalRegistros: totalAtual });

          // Atualizar sincronização
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: "sucesso",
            finalizadoEm: new Date(),
            registrosLidos: rows.length,
            registrosInseridos,
            duracaoMs,
          });

          return {
            sucesso: true,
            mensagem: `${registrosInseridos} registros ${modoEfetivo === "incremental" ? "incrementais" : ""} importados em ${(duracaoMs / 1000).toFixed(1)}s`,
            registrosLidos: rows.length,
            registrosInseridos,
            duracaoMs,
            modoEfetivo,
          };
        }; // fim executarSync

        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout: sincronização excedeu ${SYNC_TIMEOUT_MS / 1000}s`)), SYNC_TIMEOUT_MS);
          });
          return await Promise.race([executarSync(), timeoutPromise]);
        } catch (error) {
          const duracaoMs = Date.now() - inicio;
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: "erro",
            finalizadoEm: new Date(),
            erroMensagem: error instanceof Error ? error.message : String(error),
            duracaoMs,
          });
          throw new Error(`Erro na sincronização: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),

    consultarDados: protectedProcedure
      .input(z.object({
        id: z.number(),
        limite: z.number().default(100),
        offset: z.number().default(0),
      }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return { dados: [], total: 0 };
        const tabela = await dbIntegrador.obterTabela(input.id);
        if (!tabela || tabela.criadaNoBanco !== "sim") return { dados: [], total: 0 };

        const nomeReal = `integ_${tabela.nome}`;
        const [dados, total] = await Promise.all([
          dbIntegrador.consultarDadosTabela(nomeReal, input.limite, input.offset),
          dbIntegrador.contarRegistrosTabela(nomeReal),
        ]);
        return { dados, total };
      }),
  }),

  // ============================================================
  // GERENCIAMENTO DE MAPEAMENTOS
  // ============================================================

  mapeamentos: router({
    listar: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return [];
        return dbIntegrador.listarMapeamentos(input?.estabelecimentoId);
      }),

    obter: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return null;
        const mapeamento = await dbIntegrador.obterMapeamento(input.id);
        if (!mapeamento) return null;
        const campos = await dbIntegrador.listarCamposMapeamento(input.id);
        return { ...mapeamento, campos };
      }),

    criar: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        conexaoOrigemId: z.number(),
        tabelaDestinoId: z.number(),
        queryOrigem: z.string().min(1),
        campoChave: z.string().optional(),
        frequencia: z.enum(["manual", "5min", "15min", "30min", "1hora", "6horas", "12horas", "diario"]).default("manual"),
        estabelecimentoId: z.number().optional(),
        modoImportacao: z.enum(["completa", "incremental"]).default("completa"),
        colunaControle: z.string().optional(),
        campos: z.array(z.object({
          colunaOrigemNome: z.string(),
          colunaDestinoId: z.number(),
          transformacao: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const id = await dbIntegrador.criarMapeamento({
          nome: input.nome,
          descricao: input.descricao || null,
          conexaoOrigemId: input.conexaoOrigemId,
          tabelaDestinoId: input.tabelaDestinoId,
          queryOrigem: input.queryOrigem,
          campoChave: input.campoChave || null,
          frequencia: input.frequencia,
          estabelecimentoId: input.estabelecimentoId || null,
          modoImportacao: input.modoImportacao,
          colunaControle: input.colunaControle || null,
        });

        // Salvar campos se fornecidos
        if (input.campos && input.campos.length > 0) {
          await dbIntegrador.salvarCamposMapeamento(id, input.campos.map(c => ({
            colunaOrigemNome: c.colunaOrigemNome,
            colunaDestinoId: c.colunaDestinoId,
            transformacao: c.transformacao || null,
          })));
        }

        return { sucesso: true, id };
      }),

    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        queryOrigem: z.string().optional(),
        campoChave: z.string().optional(),
        frequencia: z.enum(["manual", "5min", "15min", "30min", "1hora", "6horas", "12horas", "diario"]).optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
        modoImportacao: z.enum(["completa", "incremental"]).optional(),
        colunaControle: z.string().nullable().optional(),
        ultimoValorControle: z.string().nullable().optional(),
        campos: z.array(z.object({
          colunaOrigemNome: z.string(),
          colunaDestinoId: z.number(),
          transformacao: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const { id, campos, ...rest } = input;
        await dbIntegrador.atualizarMapeamento(id, rest as any);
        if (campos) {
          await dbIntegrador.salvarCamposMapeamento(id, campos.map(c => ({
            colunaOrigemNome: c.colunaOrigemNome,
            colunaDestinoId: c.colunaDestinoId,
            transformacao: c.transformacao || null,
          })));
        }
        return { sucesso: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        await dbIntegrador.excluirMapeamento(input.id);
        return { sucesso: true };
      }),

    resetarIncremental: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        await dbIntegrador.atualizarMapeamento(input.id, {
          ultimoValorControle: null,
          totalRegistrosImportados: 0,
        } as any);
        return { sucesso: true, mensagem: "Controle incremental resetado. A próxima execução importará todos os registros." };
      }),

    executar: protectedProcedure
      .input(z.object({ id: z.number(), forcarCompleta: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const mapeamento = await dbIntegrador.obterMapeamento(input.id);
        if (!mapeamento) throw new Error("Mapeamento não encontrado");

        const conexao = await dbIntegrador.obterConexao(mapeamento.conexaoOrigemId);
        if (!conexao) throw new Error("Conexão de origem não encontrada");

        const tabela = await dbIntegrador.obterTabela(mapeamento.tabelaDestinoId);
        if (!tabela) throw new Error("Tabela de destino não encontrada");

        const campos = await dbIntegrador.listarCamposMapeamento(input.id);
        const colunasDestino = await dbIntegrador.listarColunas(tabela.id);

        // Determinar se é importação incremental
        const isIncremental = mapeamento.modoImportacao === "incremental" 
          && mapeamento.colunaControle 
          && mapeamento.ultimoValorControle
          && !input.forcarCompleta;

        // Criar log de sincronização
        const syncId = await dbIntegrador.criarSincronizacao({
          mapeamentoId: input.id,
          status: "executando",
          executadoPor: ctx.user?.name || "admin",
        });

        const inicio = Date.now();
        const FATIA_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos de timeout POR FATIA

        // Helper: mapear dados da origem para o formato destino
        const colunasMap = new Map(colunasDestino.map(c => [c.id, c.nome]));
        const estabelecimentoIdMapeamento = mapeamento.estabelecimentoId || tabela.estabelecimentoId;
        const mapearDados = (dadosOrigem: any[]) => {
          return dadosOrigem.map(row => {
            const registro: Record<string, any> = {};
            if (estabelecimentoIdMapeamento) {
              registro.estabelecimento_id = estabelecimentoIdMapeamento;
            }
            for (const campo of campos) {
              const nomeDestino = colunasMap.get(campo.colunaDestinoId);
              if (nomeDestino) {
                let valor = row[campo.colunaOrigemNome];
                if (campo.transformacao) {
                  try {
                    if (campo.transformacao === "UPPER") valor = String(valor || "").toUpperCase();
                    else if (campo.transformacao === "LOWER") valor = String(valor || "").toLowerCase();
                    else if (campo.transformacao === "TRIM") valor = String(valor || "").trim();
                  } catch { /* ignorar erro de transformação */ }
                }
                registro[nomeDestino] = valor;
              }
            }
            return registro;
          });
        };

        // Helper: conectar e executar query na origem
        const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
        const executarQueryOrigem = async (query: string): Promise<any[]> => {
          if (conexao.tipo === "postgresql") {
            const connector = new EasyVisionConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            const ok = await connector.conectar();
            if (!ok) throw new Error("Falha ao conectar à origem");
            const dados = await connector.executarQuery(query);
            await connector.desconectar();
            return dados;
          } else {
            const connector = new WarleineConnector({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: senha,
            });
            const ok = await connector.conectar();
            if (!ok) throw new Error("Falha ao conectar à origem");
            const dados = await connector.executarQuery(query);
            await connector.desconectar();
            return dados;
          }
        };

        // Helper: executar query com timeout por fatia - usa conexão dedicada que é destruída no timeout
        const executarComTimeout = async (query: string, label: string): Promise<any[]> => {
          if (conexao.tipo === "postgresql") {
            const pgLib = await import("pg");
            const client = new pgLib.default.Client({
              host: conexao.host,
              port: conexao.porta,
              database: conexao.banco,
              user: conexao.usuario,
              password: Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8"),
              ssl: conexao.ssl ? { rejectUnauthorized: false } : false,
              connectionTimeoutMillis: 10000,
              statement_timeout: FATIA_TIMEOUT_MS,
              query_timeout: FATIA_TIMEOUT_MS,
            });

            let timedOut = false;
            const timer = setTimeout(() => {
              timedOut = true;
              logger.warn({ message: `Timeout na fatia ${label}: forçando desconexão após ${FATIA_TIMEOUT_MS / 1000}s` });
              try { client.end().catch(() => {}); } catch {}
            }, FATIA_TIMEOUT_MS);

            try {
              await client.connect();
              await client.query(`SET statement_timeout = ${FATIA_TIMEOUT_MS}`);
              const result = await client.query(query);
              clearTimeout(timer);
              await client.end().catch(() => {});
              return result.rows;
            } catch (err) {
              clearTimeout(timer);
              try { await client.end().catch(() => {}); } catch {}
              if (timedOut) {
                throw new Error(`Timeout na fatia ${label}: excedeu ${FATIA_TIMEOUT_MS / 1000}s`);
              }
              throw err;
            }
          } else {
            // Para outros tipos de conexão, manter o Promise.race
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Timeout na fatia ${label}: excedeu ${FATIA_TIMEOUT_MS / 1000}s`)), FATIA_TIMEOUT_MS);
            });
            return await Promise.race([executarQueryOrigem(query), timeoutPromise]);
          }
        };

        const nomeReal = `integ_${tabela.nome}`;

        try {
          // ====== MODO INCREMENTAL ======
          if (isIncremental) {
            let queryFinal = mapeamento.queryOrigem.trim().replace(/;\s*$/, "");
            const colunaCtrl = mapeamento.colunaControle!;
            const ultimoValor = mapeamento.ultimoValorControle!;

            if (conexao.tipo === "postgresql") {
              queryFinal = `SELECT * FROM (${queryFinal}) AS _subq WHERE _subq."${colunaCtrl}" > '${ultimoValor.replace(/'/g, "''")}' ORDER BY _subq."${colunaCtrl}" ASC`;
            } else {
              queryFinal = `SELECT * FROM (${queryFinal}) AS _subq WHERE _subq.\`${colunaCtrl}\` > '${ultimoValor.replace(/'/g, "''")}' ORDER BY _subq.\`${colunaCtrl}\` ASC`;
            }

            logger.info({ message: "Importação INCREMENTAL", colunaControle: colunaCtrl, ultimoValor, mapeamentoId: input.id });

            const dadosOrigem = await executarComTimeout(queryFinal, "incremental");

            if (dadosOrigem.length === 0) {
              const duracao = Date.now() - inicio;
              await dbIntegrador.atualizarSincronizacao(syncId, { status: "sucesso", registrosLidos: 0, registrosInseridos: 0, finalizadoEm: new Date(), duracaoMs: duracao });
              await dbIntegrador.atualizarMapeamento(input.id, { ultimaSincronizacao: new Date() } as any);
              return { sucesso: true, mensagem: `Importação incremental: nenhum registro novo desde ${ultimoValor}`, registrosLidos: 0, registrosInseridos: 0, modoUsado: "incremental" };
            }

            const registrosMapeados = mapearDados(dadosOrigem);
            const resultado = await dbIntegrador.inserirDadosTabela(nomeReal, registrosMapeados);

            // Atualizar controle incremental
            let novoUltimoValor = ultimoValor;
            const ultimoRegistro = dadosOrigem[dadosOrigem.length - 1];
            const valorControle = ultimoRegistro[colunaCtrl];
            if (valorControle !== null && valorControle !== undefined) {
              novoUltimoValor = valorControle instanceof Date ? valorControle.toISOString() : String(valorControle);
            }

            const totalRegistros = await dbIntegrador.contarRegistrosTabela(nomeReal);
            await dbIntegrador.atualizarTabela(tabela.id, { totalRegistros });
            const totalAcumulado = (mapeamento.totalRegistrosImportados || 0) + resultado.inseridos;
            await dbIntegrador.atualizarMapeamento(input.id, { ultimaSincronizacao: new Date(), ultimoValorControle: novoUltimoValor, totalRegistrosImportados: totalAcumulado } as any);

            const duracao = Date.now() - inicio;
            await dbIntegrador.atualizarSincronizacao(syncId, { status: "sucesso", registrosLidos: dadosOrigem.length, registrosInseridos: resultado.inseridos, finalizadoEm: new Date(), duracaoMs: duracao });

            return { sucesso: true, mensagem: `Importação incremental concluída: ${resultado.inseridos} registros em ${(duracao / 1000).toFixed(1)}s`, registrosLidos: dadosOrigem.length, registrosInseridos: resultado.inseridos, modoUsado: "incremental", ultimoValorControle: novoUltimoValor };
          }

          // ====== MODO COMPLETA - PARTICIONADO POR MÊS ======
          logger.info({ message: "Importação COMPLETA PARTICIONADA por mês", mapeamentoId: input.id });

          // Gerar lista de meses: de jan/2024 até o mês atual + 1
          const agora = new Date();
          const anoInicio = 2024;
          const mesInicio = 1;
          const anoFim = agora.getFullYear();
          const mesFim = agora.getMonth() + 1; // 1-12
          const meses: { ano: number; mes: number; label: string }[] = [];
          for (let a = anoInicio; a <= anoFim; a++) {
            const mStart = a === anoInicio ? mesInicio : 1;
            const mEnd = a === anoFim ? mesFim : 12;
            for (let m = mStart; m <= mEnd; m++) {
              const label = `${a}/${String(m).padStart(2, "0")}`;
              meses.push({ ano: a, mes: m, label });
            }
          }

          // Limpar tabela destino antes da primeira fatia
          try {
            await dbIntegrador.limparDadosTabela(nomeReal);
            logger.info({ message: "Tabela limpa para importação completa particionada", tabela: nomeReal });
          } catch (e) {
            logger.warn({ message: "Erro ao limpar tabela", error: String(e) });
          }

          let totalLidos = 0;
          let totalInseridos = 0;
          const queryBase = mapeamento.queryOrigem.trim().replace(/;\s*$/, "");

          for (let i = 0; i < meses.length; i++) {
            const { ano, mes, label } = meses[i];
            const mesProximo = mes === 12 ? 1 : mes + 1;
            const anoProximo = mes === 12 ? ano + 1 : ano;
            const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
            const dataFim = `${anoProximo}-${String(mesProximo).padStart(2, "0")}-01`;

            // Envolver a query original em subquery e filtrar por mesprod do mês
            // A query original já tem WHERE com data >= 2024, então usamos subquery
            let queryFatia: string;
            if (conexao.tipo === "postgresql") {
              queryFatia = `SELECT * FROM (${queryBase}) AS _subq WHERE _subq."mesprod" = '${label}'`;
            } else {
              queryFatia = `SELECT * FROM (${queryBase}) AS _subq WHERE _subq.\`mesprod\` = '${label}'`;
            }

            logger.info({ message: `Importando fatia ${i + 1}/${meses.length}: ${label}`, mapeamentoId: input.id });

            // Atualizar progresso no log de sincronização
            await dbIntegrador.atualizarSincronizacao(syncId, {
              erroMensagem: `Importando mês ${label} (${i + 1}/${meses.length})...`,
              registrosLidos: totalLidos,
              registrosInseridos: totalInseridos,
            } as any);

            try {
              const dadosFatia = await executarComTimeout(queryFatia, label);

              if (dadosFatia.length === 0) {
                logger.info({ message: `Fatia ${label}: 0 registros, pulando` });
                continue;
              }

              const registrosMapeados = mapearDados(dadosFatia);
              const resultado = await dbIntegrador.inserirDadosTabela(nomeReal, registrosMapeados);

              totalLidos += dadosFatia.length;
              totalInseridos += resultado.inseridos;

              logger.info({ message: `Fatia ${label} concluída: ${resultado.inseridos} registros inseridos`, totalAcumulado: totalInseridos });
            } catch (fatiaError) {
              const msg = fatiaError instanceof Error ? fatiaError.message : String(fatiaError);
              logger.warn({ message: `Erro na fatia ${label}: ${msg}. Continuando com próximas fatias...` });
              // Continuar com as próximas fatias em vez de abortar tudo
            }
          }

          // Atualizar contagem final
          const totalRegistros = await dbIntegrador.contarRegistrosTabela(nomeReal);
          await dbIntegrador.atualizarTabela(tabela.id, { totalRegistros });

          // Atualizar mapeamento
          await dbIntegrador.atualizarMapeamento(input.id, {
            ultimaSincronizacao: new Date(),
            totalRegistrosImportados: totalInseridos,
          } as any);

          // Finalizar log
          const duracao = Date.now() - inicio;
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: totalInseridos > 0 ? "sucesso" : "erro",
            registrosLidos: totalLidos,
            registrosInseridos: totalInseridos,
            finalizadoEm: new Date(),
            duracaoMs: duracao,
            erroMensagem: totalInseridos > 0 ? null : "Nenhum registro importado em nenhuma fatia",
          } as any);

          return {
            sucesso: totalInseridos > 0,
            mensagem: `Importação completa particionada: ${totalInseridos} registros inseridos de ${meses.length} meses em ${(duracao / 1000).toFixed(1)}s`,
            registrosLidos: totalLidos,
            registrosInseridos: totalInseridos,
            modoUsado: "completa (particionada)",
          };
        } catch (error) {
          const duracao = Date.now() - inicio;
          const msg = error instanceof Error ? error.message : "Erro desconhecido";
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: "erro",
            erroMensagem: msg,
            finalizadoEm: new Date(),
            duracaoMs: duracao,
          });
          return { sucesso: false, mensagem: msg, registrosLidos: 0, registrosInseridos: 0, modoUsado: "erro" };
        }
      }),
  }),

  // ============================================================
  // SINCRONIZAÇÕES (LOG)
  // ============================================================

  sincronizacoesLog: router({
    listar: protectedProcedure
      .input(z.object({ mapeamentoId: z.number().optional(), limite: z.number().default(50) }).optional())
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) return [];
        return dbIntegrador.listarSincronizacoes(input?.mapeamentoId, input?.limite);
      }),
  }),

  // ============================================================
  // ENDPOINT PARA AGENTE LOCAL
  // ============================================================

  agenteLocal: router({
    enviarDados: protectedProcedure
      .input(z.object({
        mapeamentoId: z.number(),
        registros: z.array(z.record(z.string(), z.any())),
        ultimoValorControle: z.string().optional(), // Para importação incremental do agente local
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const mapeamento = await dbIntegrador.obterMapeamento(input.mapeamentoId);
        if (!mapeamento) throw new Error("Mapeamento não encontrado");

        const tabela = await dbIntegrador.obterTabela(mapeamento.tabelaDestinoId);
        if (!tabela) throw new Error("Tabela de destino não encontrada");

        const campos = await dbIntegrador.listarCamposMapeamento(input.mapeamentoId);
        const colunasDestino = await dbIntegrador.listarColunas(tabela.id);
        const colunasMap = new Map(colunasDestino.map(c => [c.id, c.nome]));

        // Criar log
        const syncId = await dbIntegrador.criarSincronizacao({
          mapeamentoId: input.mapeamentoId,
          status: "executando",
          executadoPor: "agente-local",
        });

        const inicio = Date.now();

        try {
          // Mapear campos
          const estabIdAgente = mapeamento.estabelecimentoId || tabela.estabelecimentoId;
          const registrosMapeados = input.registros.map(row => {
            const registro: Record<string, any> = {};
            // Incluir estabelecimento_id automaticamente
            if (estabIdAgente) {
              registro.estabelecimento_id = estabIdAgente;
            }
            for (const campo of campos) {
              const nomeDestino = colunasMap.get(campo.colunaDestinoId);
              if (nomeDestino) {
                registro[nomeDestino] = row[campo.colunaOrigemNome];
              }
            }
            return registro;
          });

          const nomeReal = `integ_${tabela.nome}`;
          const resultado = await dbIntegrador.inserirDadosTabela(nomeReal, registrosMapeados);

          const totalRegistros = await dbIntegrador.contarRegistrosTabela(nomeReal);
          await dbIntegrador.atualizarTabela(tabela.id, { totalRegistros });

          // Atualizar controle incremental se fornecido
          if (input.ultimoValorControle) {
            const totalAcumulado = (mapeamento.totalRegistrosImportados || 0) + resultado.inseridos;
            await dbIntegrador.atualizarMapeamento(input.mapeamentoId, {
              ultimoValorControle: input.ultimoValorControle,
              ultimaSincronizacao: new Date(),
              totalRegistrosImportados: totalAcumulado,
            } as any);
          } else {
            await dbIntegrador.atualizarMapeamento(input.mapeamentoId, {
              ultimaSincronizacao: new Date(),
            } as any);
          }

          const duracao = Date.now() - inicio;
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: "sucesso",
            registrosLidos: input.registros.length,
            registrosInseridos: resultado.inseridos,
            finalizadoEm: new Date(),
            duracaoMs: duracao,
          });

          return { sucesso: true, registrosInseridos: resultado.inseridos };
        } catch (error) {
          const duracao = Date.now() - inicio;
          const msg = error instanceof Error ? error.message : "Erro desconhecido";
          await dbIntegrador.atualizarSincronizacao(syncId, {
            status: "erro",
            erroMensagem: msg,
            finalizadoEm: new Date(),
            duracaoMs: duracao,
          });
          return { sucesso: false, mensagem: msg, registrosInseridos: 0 };
        }
      }),

    // Obter info de controle incremental para o agente local saber de onde continuar
    obterControleIncremental: protectedProcedure
      .input(z.object({ mapeamentoId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!(await isAdminOrEstabAdmin(ctx))) throw new Error("Acesso negado");
        const mapeamento = await dbIntegrador.obterMapeamento(input.mapeamentoId);
        if (!mapeamento) throw new Error("Mapeamento não encontrado");
        return {
          modoImportacao: mapeamento.modoImportacao,
          colunaControle: mapeamento.colunaControle,
          ultimoValorControle: mapeamento.ultimoValorControle,
          ultimaSincronizacao: mapeamento.ultimaSincronizacao,
          totalRegistrosImportados: mapeamento.totalRegistrosImportados,
          queryOrigem: mapeamento.queryOrigem,
        };
      }),
  }),
});