import sql from "mssql";
import { logger } from "../_core/logger";
import { assertReadOnlyAccountQuery, compilePositionalQuery } from "./sqlQuerySafety";

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
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
        options: {
          encrypt: this.config.ssl || false,
          trustServerCertificate: false,
          connectTimeout: 10000,
        },
      });
      await this.pool.connect();
      logger.info({ message: "Conexão SQL Server estabelecida com sucesso" });
      return true;
    } catch {
      logger.error({ message: "Erro ao conectar ao SQL Server" });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    if (pool) {
      try {
        await pool.close();
      } catch {
        logger.error({ message: "Erro ao desconectar do SQL Server" });
        throw new Error("Falha ao desconectar do SQL Server.");
      }
    }
  }

  /** SQL Server has no equivalent session READ ONLY flag: restricted DB grants remain mandatory. */
  async executarQuerySomenteLeitura(query: string, params: unknown[]): Promise<any[]> {
    assertReadOnlyAccountQuery(query, params);
    return this.executarQuery(query, params);
  }

  async executarQuery(query: string, params: unknown[] = []): Promise<any[]> {
    if (!this.pool) throw new Error("Conexão não estabelecida");
    const compiled = compilePositionalQuery(query, params, "sqlserver");
    try {
      const request = this.pool.request();
      compiled.names.forEach((name, index) => {
        const value = compiled.values[index];
        // Explicit types avoid implicit varchar/non-Unicode strings, 32-bit Int
        // overflow for JS integers, and lower-precision DateTime conversion.
        const type = typeof value === "number" ? sql.Float
          : typeof value === "boolean" ? sql.Bit
          : value instanceof Date ? sql.DateTime2
          : Buffer.isBuffer(value) ? sql.VarBinary(sql.MAX)
          : sql.NVarChar(sql.MAX); // includes a typed SQL NULL
        request.input(name, type, value);
      });
      const result = await request.query(compiled.sql);
      return result.recordset || [];
    } catch {
      logger.error({ message: "Erro ao executar query no SQL Server" });
      throw new Error("Falha ao executar consulta no SQL Server.");
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
      return {
        sucesso: true,
        mensagem: `Conexão OK. Query retornou ${dados.length} registros`,
        totalRegistros: dados.length,
        primeiroRegistro: dados[0] || null,
      };
    } catch {
      return {
        sucesso: false,
        mensagem: "Falha ao testar consulta no SQL Server.",
        totalRegistros: 0,
        primeiroRegistro: null,
      };
    } finally {
      // Also release a pool after a query failure; do not mask the safe result.
      try { await this.desconectar(); } catch { /* already logged safely */ }
    }
  }
}
