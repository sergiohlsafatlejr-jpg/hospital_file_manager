import mysql from "mysql2/promise";
import { logger } from "../_core/logger";

export interface MysqlConnectorConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: any;
}

export class MysqlConnector {
  private connection: mysql.Connection | null = null;
  private config: MysqlConnectorConfig;

  constructor(config: MysqlConnectorConfig) {
    this.config = config;
  }

  async conectar(): Promise<boolean> {
    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
      });

      logger.info({
        message: `Conexão MySQL estabelecida com sucesso`,
        host: this.config.host,
        database: this.config.database,
      });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        message: `Erro ao conectar ao MySQL`,
        error: msg,
        host: this.config.host,
      });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async executarQuery(query: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      const [rows] = await this.connection.execute(query);
      return Array.isArray(rows) ? rows : [rows];
    } catch (error) {
      logger.error({
        message: "Erro ao executar query no MySQL",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
