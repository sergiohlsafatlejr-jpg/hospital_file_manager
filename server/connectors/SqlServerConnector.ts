import sql from "mssql";
import { logger } from "../_core/logger";

export interface SqlServerConnectorConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

export class SqlServerConnector {
  private pool: sql.ConnectionPool | null = null;
  private config: SqlServerConnectorConfig;

  constructor(config: SqlServerConnectorConfig) {
    this.config = config;
  }

  async conectar(): Promise<boolean> {
    try {
      this.pool = new sql.ConnectionPool({
        user: this.config.user,
        password: this.config.password || "",
        database: this.config.database,
        server: this.config.host,
        port: this.config.port,
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        },
        options: {
          encrypt: this.config.ssl || false, // Use true para Azure SQL
          trustServerCertificate: true, // Para instâncias locais e de teste
          connectTimeout: 10000,
        }
      });

      await this.pool.connect();

      logger.info({
        message: `Conexão SQL Server estabelecida com sucesso`,
        host: this.config.host,
        database: this.config.database,
      });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        message: `Erro ao conectar ao SQL Server`,
        error: msg,
        host: this.config.host,
      });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async executarQuery(query: string): Promise<any[]> {
    if (!this.pool) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      const request = this.pool.request();
      const result = await request.query(query);
      return result.recordset || [];
    } catch (error) {
      logger.error({
        message: "Erro ao executar query no SQL Server",
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
          mensagem: "Falha ao conectar ao banco SQL Server. Verifique as credenciais.",
          totalRegistros: 0,
          primeiroRegistro: null,
        };
      }

      const dados = await this.executarQuery(query);
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
