import { Client } from 'pg';
import { logger } from '../_core/logger';

export interface PostgresConnectorConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
}

export class PostgresConnector {
  private client: Client | null = null;
  private config: PostgresConnectorConfig;

  constructor(config: PostgresConnectorConfig) {
    this.config = config;
  }

  async conectar(): Promise<boolean> {
    try {
      this.client = new Client({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: false, // Ajuste para true se o servidor exigir SSL
      });

      await this.client.connect();

      logger.info({
        message: `Conexão Postgres estabelecida com sucesso`,
        host: this.config.host,
        database: this.config.database,
      });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        message: `Erro ao conectar ao Postgres`,
        error: msg,
        host: this.config.host,
      });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch (e) {
        logger.warn("Erro ao fechar conexão Postgres: " + String(e));
      }
      this.client = null;
    }
  }

  async executarQuery(query: string, limit?: number): Promise<any[]> {
    if (!this.client) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      const result = await this.client.query(query);
      const rows = result.rows || [];
      
      if (limit && limit > 0 && rows.length > limit) {
        return rows.slice(0, limit);
      }
      
      return rows;
    } catch (error) {
      logger.error({
        message: "Erro ao executar query no Postgres",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async testarConexaoEQuery(query: string): Promise<{
    sucesso: boolean;
    mensagem: string;
    totalRegistros: number;
    primeiroRegistro: any | null;
  }> {
    try {
      const ok = await this.conectar();
      if (!ok) {
        return {
          sucesso: false,
          mensagem: "Falha ao conectar ao banco Postgres. Verifique as credenciais e o host.",
          totalRegistros: 0,
          primeiroRegistro: null,
        };
      }

      const dados = await this.executarQuery(query, 50);
      await this.desconectar();

      return {
        sucesso: true,
        mensagem: `Conexão OK. Query retornou ${dados.length} registros`,
        totalRegistros: dados.length,
        primeiroRegistro: dados[0] || null,
      };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: error instanceof Error ? error.message : "Erro desconhecido",
        totalRegistros: 0,
        primeiroRegistro: null,
      };
    }
  }
}
