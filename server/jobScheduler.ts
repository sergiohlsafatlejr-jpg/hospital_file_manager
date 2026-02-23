import { CronJob } from "cron";
import { getDb } from "./db";
import { queryConfiguracoes } from "../drizzle/schema-integracao";
import { eq } from "drizzle-orm";
import { DataSyncEngine, SyncConfig } from "./dataSyncEngine";

/**
 * Job Scheduler para sincronizações automáticas de dados
 *
 * Suporta 3 frequências:
 * - tempo_real: Executa a cada 5 minutos
 * - 1x_dia: Executa uma vez ao dia (02:00 AM)
 * - 1x_semana: Executa uma vez por semana (segunda-feira às 02:00 AM)
 */

interface ScheduledJob {
  configId: number;
  job: CronJob;
  frequencia: "tempo_real" | "1x_dia" | "1x_semana";
}

class JobScheduler {
  private jobs: Map<number, ScheduledJob> = new Map();
  private isRunning = false;
  private syncEngine: DataSyncEngine;

  constructor() {
    this.syncEngine = new DataSyncEngine();
  }

  /**
   * Inicia o Job Scheduler
   * Carrega todas as configurações ativas e agenda as sincronizações
   */
  async start() {
    if (this.isRunning) {
      console.log("[JobScheduler] Scheduler já está rodando");
      return;
    }

    console.log("[JobScheduler] Iniciando Job Scheduler...");
    this.isRunning = true;

    try {
      // Carregar todas as configurações ativas
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const configs = await db
        .select()
        .from(queryConfiguracoes)
        .where(eq(queryConfiguracoes.ativo, true));

      console.log(`[JobScheduler] Encontradas ${configs.length} configurações ativas`);

      // Agendar cada configuração
      for (const config of configs) {
        await this.scheduleConfig(config as any);
      }

      console.log("[JobScheduler] Job Scheduler iniciado com sucesso");
    } catch (error) {
      console.error("[JobScheduler] Erro ao iniciar scheduler:", error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Para o Job Scheduler
   * Cancela todos os jobs agendados
   */
  async stop() {
    console.log("[JobScheduler] Parando Job Scheduler...");

    for (const [configId, { job }] of this.jobs) {
      job.stop();
      console.log(`[JobScheduler] Job ${configId} parado`);
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log("[JobScheduler] Job Scheduler parado");
  }

  /**
   * Agenda uma configuração de sincronização
   */
  private async scheduleConfig(config: any) {
    const configId = config.id;

    // Se já existe um job para esta configuração, cancela o anterior
    if (this.jobs.has(configId)) {
      const { job } = this.jobs.get(configId)!;
      job.stop();
      this.jobs.delete(configId);
    }

    try {
      let cronExpression: string;

      // Determinar expressão cron baseada na frequência
      switch (config.frequencia) {
        case "tempo_real":
          // A cada 5 minutos
          cronExpression = "*/5 * * * *";
          break;
        case "1x_dia":
          // Uma vez ao dia às 02:00 AM
          cronExpression = "0 2 * * *";
          break;
        case "1x_semana":
          // Uma vez por semana, segunda-feira às 02:00 AM
          cronExpression = "0 2 * * 1";
          break;
        default:
          console.warn(
            `[JobScheduler] Frequência desconhecida: ${config.frequencia}`
          );
          return;
      }

      // Criar e agendar o job
      const job = new CronJob(cronExpression, async () => {
        await this.executeSyncJob(config);
      });

      job.start();

      this.jobs.set(configId, {
        configId,
        job,
        frequencia: config.frequencia as "tempo_real" | "1x_dia" | "1x_semana",
      });

      console.log(
        `[JobScheduler] Configuração ${configId} (${config.sistema}/${config.tipoDados}) agendada com frequência: ${config.frequencia}`
      );
    } catch (error) {
      console.error(
        `[JobScheduler] Erro ao agendar configuração ${configId}:`,
        error
      );
    }
  }

  /**
   * Executa uma sincronização
   */
  private async executeSyncJob(config: any) {
    const startTime = Date.now();
    const configId = config.id;

    console.log(
      `[JobScheduler] Iniciando sincronização: ${config.sistema}/${config.tipoDados} (Config ID: ${configId})`
    );

    try {
      // Preparar configuração para o sync engine
      const syncConfig: SyncConfig = {
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        estabelecimentoId: config.estabelecimentoId,
        querySql: config.querySql,
        frequencia: config.frequencia,
        conexaoConfig: config.conexaoConfig ? JSON.parse(config.conexaoConfig) : undefined,
      };

      // Executar sincronização baseada no sistema
      let resultado: any;

      switch (config.sistema) {
        case "warleine":
          resultado = await this.syncEngine.sincronizarWarleine(syncConfig);
          break;
        case "tasy":
          console.log(
            `[JobScheduler] Sincronização TASY não implementada ainda`
          );
          return;
        case "omni":
          console.log(
            `[JobScheduler] Sincronização OMNI não implementada ainda`
          );
          return;
        case "gesthor":
          console.log(
            `[JobScheduler] Sincronização GESTHOR não implementada ainda`
          );
          return;
        default:
          throw new Error(`Sistema desconhecido: ${config.sistema}`);
      }

      const duration = Date.now() - startTime;

      // Registrar sucesso
      console.log(
        `[JobScheduler] Sincronização concluída com sucesso (${duration}ms): ${resultado.totalRegistrosSincronizados} registros`
      );

      // Atualizar timestamp de última sincronização
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(queryConfiguracoes)
        .set({
          ultimaSincronizacao: new Date(),
        } as any)
        .where(eq(queryConfiguracoes.id, configId));
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[JobScheduler] Erro na sincronização (${duration}ms):`,
        error
      );

      // Registrar erro no banco
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db
          .update(queryConfiguracoes)
          .set({
            ultimoErro: error instanceof Error ? error.message : String(error),
            ultimaTentativa: new Date(),
          } as any)
          .where(eq(queryConfiguracoes.id, configId));
      } catch (dbError) {
        console.error("[JobScheduler] Erro ao registrar erro no banco:", dbError);
      }
    }
  }

  /**
   * Recarrega as configurações e atualiza os jobs agendados
   * Útil quando novas configurações são criadas ou modificadas
   */
  async reloadConfigs() {
    console.log("[JobScheduler] Recarregando configurações...");

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const configs = await db
        .select()
        .from(queryConfiguracoes)
        .where(eq(queryConfiguracoes.ativo, true));

      // Obter IDs das configurações ativas
      const activeConfigIds = new Set(configs.map((c: any) => c.id));

      // Remover jobs de configurações que foram desativadas
      for (const [configId, { job }] of this.jobs) {
        if (!activeConfigIds.has(configId)) {
          job.stop();
          this.jobs.delete(configId);
          console.log(`[JobScheduler] Job ${configId} removido (configuração desativada)`);
        }
      }

      // Adicionar/atualizar jobs das configurações ativas
      for (const config of configs) {
        if (!this.jobs.has(config.id)) {
          await this.scheduleConfig(config as any);
        }
      }

      console.log("[JobScheduler] Configurações recarregadas com sucesso");
    } catch (error) {
      console.error("[JobScheduler] Erro ao recarregar configurações:", error);
    }
  }

  /**
   * Obtém o status do scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      jobs: Array.from(this.jobs.values()).map((j) => ({
        configId: j.configId,
        frequencia: j.frequencia,
        ativo: j.job.lastDate() !== null,
      })),
    };
  }

  /**
   * Executa uma sincronização manual imediatamente
   */
  async executeSyncManual(configId: number) {
    console.log(`[JobScheduler] Executando sincronização manual para config ${configId}`);

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const config = await db
        .select()
        .from(queryConfiguracoes)
        .where(eq(queryConfiguracoes.id, configId));

      if (!config || config.length === 0) {
        throw new Error(`Configuração ${configId} não encontrada`);
      }

      await this.executeSyncJob(config[0] as any);
    } catch (error) {
      console.error(`[JobScheduler] Erro ao executar sincronização manual:`, error);
      throw error;
    }
  }
}

// Singleton instance
let schedulerInstance: JobScheduler | null = null;

/**
 * Obtém a instância do Job Scheduler
 */
export function getJobScheduler(): JobScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new JobScheduler();
  }
  return schedulerInstance;
}

/**
 * Inicializa o Job Scheduler (deve ser chamado no startup da aplicação)
 */
export async function initializeJobScheduler() {
  const scheduler = getJobScheduler();
  await scheduler.start();
  return scheduler;
}

export { JobScheduler };
