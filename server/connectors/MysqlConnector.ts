import mysql from "mysql2/promise";
import { logger } from "../_core/logger";
import { compilePositionalQuery, compileReadOnlyAccountQuery } from "./sqlQuerySafety";

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
        // Retain configured CA/client material, but never disable verification.
        ssl: this.config.ssl
          ? { ...(typeof this.config.ssl === "object" ? this.config.ssl : {}), rejectUnauthorized: true }
          : undefined,
        multipleStatements: false,
        connectTimeout: 10000,
      });
      logger.info({ message: "Conexão MySQL estabelecida com sucesso" });
      return true;
    } catch {
      // Driver messages can contain credentials, SQL or data. Do not forward them.
      logger.error({ message: "Erro ao conectar ao MySQL" });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      try {
        await connection.end();
      } catch {
        logger.error({ message: "Erro ao desconectar do MySQL" });
        throw new Error("Falha ao desconectar do MySQL.");
      }
    }
  }

  /** Use a dedicated connector, without a pre-existing legacy transaction. */
  async executarQuerySomenteLeitura(query: string, params: unknown[]): Promise<any[]> {
    const compiled = compileReadOnlyAccountQuery(query, params, "mysql");
    if (!this.connection) throw new Error("Conexão não estabelecida");
    const connection = this.connection;
    try {
      await connection.query("START TRANSACTION READ ONLY");
      const [rows] = await connection.execute(compiled.sql, compiled.values);
      return Array.isArray(rows) ? rows : [rows];
    } catch {
      logger.error({ message: "Falha na consulta MySQL somente leitura" });
      throw new Error("Falha ao executar consulta MySQL somente leitura.");
    } finally {
      try {
        await connection.rollback();
      } catch {
        this.connection = null;
        connection.destroy();
        logger.error({ message: "Falha ao encerrar transação MySQL somente leitura" });
        throw new Error("Falha ao encerrar consulta MySQL somente leitura.");
      }
    }
  }

  async executarQuery(query: string, params: unknown[] = []): Promise<any[]> {
    if (!this.connection) throw new Error("Conexão não estabelecida");
    // Validate before reaching the transport. A bind without a value fails closed.
    const compiled = compilePositionalQuery(query, params, "mysql");
    try {
      // Legacy parameterless consumers may issue statements unsupported by prepare.
      const [rows] = compiled.values.length
        ? await this.connection.execute(compiled.sql, compiled.values)
        : await this.connection.query(compiled.sql);
      return Array.isArray(rows) ? rows : [rows];
    } catch {
      logger.error({ message: "Erro ao executar query no MySQL" });
      throw new Error("Falha ao executar consulta no MySQL.");
    }
  }
}
