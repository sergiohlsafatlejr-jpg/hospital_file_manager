import { logger } from "./_core/logger";
import { WarleineConnector, WarleineAtendimento } from "./connectors/WarleineConnector";

export interface SyncConfig {
  sistema: string;
  tipoDados: string;
  estabelecimentoId: number;
  querySql: string;
  frequencia: "tempo_real" | "1x_dia" | "1x_semana";
  conexaoConfig?: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
}

export interface SyncResult {
  sucesso: boolean;
  sistema: string;
  tipoDados: string;
  totalRegistrosSincronizados: number;
  totalErros: number;
  mensagem: string;
  duracao: number; // em segundos
  timestamp: Date;
  erros?: string[];
}

/**
 * Data Sync Engine
 * Orquestra a sincronização de dados de múltiplos sistemas
 * Responsável por:
 * 1. Conectar aos sistemas externos
 * 2. Executar queries de extração
 * 3. Armazenar dados em staging
 * 4. Transformar e unificar dados
 * 5. Registrar logs de sincronização
 */
export class DataSyncEngine {
  private syncConfigs: Map<string, SyncConfig> = new Map();
  private isRunning: boolean = false;

  /**
   * Registra uma configuração de sincronização
   */
  registrarConfig(config: SyncConfig): void {
    const chave = `${config.sistema}_${config.tipoDados}_${config.estabelecimentoId}`;
    this.syncConfigs.set(chave, config);

    logger.info({
      message: "Configuração de sincronização registrada",
      sistema: config.sistema,
      tipoDados: config.tipoDados,
      estabelecimentoId: config.estabelecimentoId,
    });
  }

  /**
   * Sincroniza dados do WARLEINE
   */
  async sincronizarWarleine(config: SyncConfig): Promise<SyncResult> {
    const inicioSync = Date.now();

    try {
      logger.info({
        message: "Iniciando sincronização WARLEINE",
        tipoDados: config.tipoDados,
        estabelecimentoId: config.estabelecimentoId,
      });

      // Cria connector
      const connector = new WarleineConnector({
        host: config.conexaoConfig?.host || process.env.WARLEINE_DB_HOST!,
        port: config.conexaoConfig?.port || parseInt(process.env.WARLEINE_DB_PORT!),
        database: config.conexaoConfig?.database || process.env.WARLEINE_DB_NAME!,
        user: config.conexaoConfig?.user || process.env.WARLEINE_DB_USER!,
        password: config.conexaoConfig?.password || process.env.WARLEINE_DB_PASSWORD!,
      });

      // Conecta
      const conectado = await connector.conectar();
      if (!conectado) {
        throw new Error("Falha ao conectar ao banco WARLEINE");
      }

      // Extrai dados
      let atendimentos: WarleineAtendimento[] = [];

      if (config.tipoDados === "atendimentos") {
        atendimentos = await connector.extrairAtendimentos(config.querySql);
      }

      // Desconecta
      await connector.desconectar();

      // Calcula duração
      const duracao = Math.round((Date.now() - inicioSync) / 1000);

      logger.info({
        message: "Sincronização WARLEINE concluída com sucesso",
        tipoDados: config.tipoDados,
        totalRegistros: atendimentos.length,
        duracao,
      });

      return {
        sucesso: true,
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        totalRegistrosSincronizados: atendimentos.length,
        totalErros: 0,
        mensagem: `${atendimentos.length} registros sincronizados com sucesso`,
        duracao,
        timestamp: new Date(),
      };
    } catch (error) {
      const duracao = Math.round((Date.now() - inicioSync) / 1000);

      logger.error({
        message: "Erro na sincronização WARLEINE",
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        error: error instanceof Error ? error.message : String(error),
        duracao,
      });

      return {
        sucesso: false,
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        totalRegistrosSincronizados: 0,
        totalErros: 1,
        mensagem: error instanceof Error ? error.message : "Erro desconhecido",
        duracao,
        timestamp: new Date(),
        erros: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Sincroniza dados de um sistema específico
   */
  async sincronizar(config: SyncConfig): Promise<SyncResult> {
    if (this.isRunning) {
      logger.warn({
        message: "Sincronização já em andamento",
        sistema: config.sistema,
      });

      return {
        sucesso: false,
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        totalRegistrosSincronizados: 0,
        totalErros: 1,
        mensagem: "Sincronização já em andamento",
        duracao: 0,
        timestamp: new Date(),
      };
    }

    this.isRunning = true;

    try {
      switch (config.sistema) {
        case "warleine":
          return await this.sincronizarWarleine(config);

        case "tasy":
          // TODO: Implementar sincronização TASY (Oracle + OpenVPN)
          return {
            sucesso: false,
            sistema: config.sistema,
            tipoDados: config.tipoDados,
            totalRegistrosSincronizados: 0,
            totalErros: 1,
            mensagem: "Sincronização TASY não implementada ainda",
            duracao: 0,
            timestamp: new Date(),
          };

        case "omni":
          // TODO: Implementar sincronização OMNI (Firebird + OpenVPN)
          return {
            sucesso: false,
            sistema: config.sistema,
            tipoDados: config.tipoDados,
            totalRegistrosSincronizados: 0,
            totalErros: 1,
            mensagem: "Sincronização OMNI não implementada ainda",
            duracao: 0,
            timestamp: new Date(),
          };

        case "gesthor":
          // TODO: Implementar sincronização GESTHOR (Firebird + OpenVPN)
          return {
            sucesso: false,
            sistema: config.sistema,
            tipoDados: config.tipoDados,
            totalRegistrosSincronizados: 0,
            totalErros: 1,
            mensagem: "Sincronização GESTHOR não implementada ainda",
            duracao: 0,
            timestamp: new Date(),
          };

        default:
          return {
            sucesso: false,
            sistema: config.sistema,
            tipoDados: config.tipoDados,
            totalRegistrosSincronizados: 0,
            totalErros: 1,
            mensagem: `Sistema desconhecido: ${config.sistema}`,
            duracao: 0,
            timestamp: new Date(),
          };
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sincroniza todos os sistemas registrados
   */
  async sincronizarTodos(): Promise<SyncResult[]> {
    const resultados: SyncResult[] = [];

    for (const [, config] of this.syncConfigs) {
      const resultado = await this.sincronizar(config);
      resultados.push(resultado);
    }

    return resultados;
  }

  /**
   * Obtém status da sincronização
   */
  getStatus(): {
    isRunning: boolean;
    totalConfigs: number;
    configs: Array<{
      chave: string;
      sistema: string;
      tipoDados: string;
      estabelecimentoId: number;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      totalConfigs: this.syncConfigs.size,
      configs: Array.from(this.syncConfigs.entries()).map(([chave, config]) => ({
        chave,
        sistema: config.sistema,
        tipoDados: config.tipoDados,
        estabelecimentoId: config.estabelecimentoId,
      })),
    };
  }
}

// Instância global do Data Sync Engine
export const dataSyncEngine = new DataSyncEngine();
