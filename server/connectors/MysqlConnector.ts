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

  private processarQueryEParams(query: string, params?: any[]): string {
    if (!params || params.length === 0) return query;
    let processedQuery = query;
    for (let index = params.length - 1; index >= 0; index--) {
      const param = params[index];
      const placeholder = `$${index + 1}`;
      if (processedQuery.includes(placeholder)) {
        const valorFormatado =
          param === null || param === undefined
            ? "NULL"
            : `'${String(param).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
        processedQuery = processedQuery.replace(
          new RegExp(`\\$${index + 1}\\b`, "g"),
          valorFormatado
        );
      }
    }
    return processedQuery;
  }

  async executarQuery(query: string, params?: any[]): Promise<any[]> {
    if (!this.connection) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      const processedQuery = this.processarQueryEParams(query, params);
      const [rows] = await this.connection.query(processedQuery);
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
