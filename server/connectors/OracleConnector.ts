import oracledb from "oracledb";
import * as fs from "fs";
import { logger } from "../_core/logger";

export interface OracleConnectorConfig {
  host: string;
  port: number;
  database: string; // Used as Service Name or SID
  user: string;
  password?: string;
}

export class OracleConnector {
  private connection: oracledb.Connection | null = null;
  private config: OracleConnectorConfig;

  constructor(config: OracleConnectorConfig) {
    this.config = config;
    // Opcional: configurar o oracledb para retornar resultados como objetos em vez de arrays puros
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  }

  async conectar(): Promise<boolean> {
    // Inicializar cliente Oracle (Thick mode) para suportar senhas legadas (NJS-116)
    if (!oracledb.oracleClientVersionString) {
      try {
        const clientDir = 'C:\\Oracle\\instantclient_23_0';
        if (fs.existsSync(clientDir)) {
          oracledb.initOracleClient({ libDir: clientDir });
          logger.info({ message: "Oracle client (Thick Mode) inicializado", clientDir });
        } else {
          // Fallback para PATH ou default client
          oracledb.initOracleClient();
          logger.info({ message: "Oracle client (Thick Mode) inicializado usando PATH do sistema" });
        }
      } catch (err: any) {
        // Ignorar erro se já inicializado (DPI-1044)
        if (!err.message.includes('DPI-1044')) {
          logger.warn({ message: "Erro ao inicializar Oracle Thick Mode", erro: err.message });
        }
      }
    }

    try {
      // Formato Easy Connect: host:port/service_name
      const connectString = `${this.config.host}:${this.config.port}/${this.config.database}`;
      
      this.connection = await oracledb.getConnection({
        user: this.config.user,
        password: this.config.password,
        connectString,
      });

      logger.info({
        message: `Conexão Oracle estabelecida com sucesso`,
        connectString,
      });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        message: `Erro ao conectar ao Oracle`,
        error: msg,
        host: this.config.host,
      });
      return false;
    }
  }

  async desconectar(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (e) {
        logger.warn("Erro ao fechar conexão Oracle: " + String(e));
      }
      this.connection = null;
    }
  }

  async executarQuery(query: string, params?: any[] | Record<string, any>): Promise<any[]> {
    if (!this.connection) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      oracledb.fetchAsString = [oracledb.DATE, oracledb.CLOB];
      
      const { oracleQuery, oracledbParams } = this.processarQueryEParams(query, params);

      console.log('DEBUG ORACLE BIND: ', { oracleQuery, oracledbParams });

      try {
          const result = await this.connection.execute(oracleQuery, oracledbParams, { maxRows: 0 });
          logger.info({ message: "DEBUG ORACLE RAW RESULT", query: oracleQuery, hasParams: !!params, rowCount: result.rows?.length });
          return (result.rows as any[]) || [];
      } catch (err: any) {
          throw err;
      }
    } catch (error) {
      logger.error({
        message: "Erro ao executar query no Oracle",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Executa uma query no Oracle usando Streaming (ResultSet)
   * Útil para grandes volumes de dados (100k+ registros)
   */
  async executarQueryStream(query: string, callback: (row: any) => Promise<void>, params?: any[] | Record<string, any>): Promise<number> {
    if (!this.connection) {
      throw new Error("Conexão não estabelecida");
    }

    try {
      oracledb.fetchAsString = [oracledb.DATE, oracledb.CLOB];
      const { oracleQuery, oracledbParams } = this.processarQueryEParams(query, params);

      const result = await this.connection.execute(oracleQuery, oracledbParams, { 
        resultSet: true,
        prefetchRows: 1000 
      });

      const rs = result.resultSet;
      if (!rs) return 0;

      let row;
      let count = 0;
      while ((row = await rs.getRow())) {
        await callback(row);
        count++;
        if (count % 1000 === 0) {
          logger.info({ message: "Oracle Stream Progress", count });
        }
      }

      await rs.close();
      return count;
    } catch (error) {
      logger.error({
        message: "Erro ao executar query stream no Oracle",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private processarQueryEParams(query: string, params?: any[] | Record<string, any>): { oracleQuery: string; oracledbParams: any } {
    let oracleQuery = query;
    let oracledbParams: any = Array.isArray(params) ? [] : { ...(params || {}) };

    // DEBUG: Gravar consulta para inspeção
    try {
      const fs = require('fs');
      fs.writeFileSync("oracle_debug_query.sql", `-- ${new Date().toISOString()}\n${oracleQuery}`);
    } catch(e) {}

    // Substituição ultra-agressiva: Varremos a string em busca de qualquer variação de :last_sync_date
    const replacement = (oracledbParams && oracledbParams.last_sync_date instanceof Date)
        ? `TIMESTAMP '${oracledbParams.last_sync_date.toISOString().slice(0, 19).replace('T', ' ')}'`
        : `TIMESTAMP '1900-01-01 00:00:00'`;
    
    let lowerQuery = oracleQuery.toLowerCase();
    let placeholder = ":last_sync_date";
    
    while (lowerQuery.includes(placeholder)) {
        const index = lowerQuery.indexOf(placeholder);
        oracleQuery = oracleQuery.substring(0, index) + replacement + oracleQuery.substring(index + placeholder.length);
        lowerQuery = oracleQuery.toLowerCase(); // Atualiza para a próxima iteração
    }

    // Removemos o parâmetro do objeto de bind para não confundir o Oracle
    if (oracledbParams && !Array.isArray(oracledbParams)) {
        delete oracledbParams.last_sync_date;
        delete oracledbParams.LAST_SYNC_DATE;
    }

    if (params && Array.isArray(params) && params.length > 0) {
      // ... restant ...
      let finalQuery = oracleQuery;
      for (let i = 0; i < params.length; i++) {
          const val = String(params[i]).replace(/'/g, "''");
          finalQuery = finalQuery.replace(new RegExp(`\\$${i + 1}`, 'g'), `'${val}'`);
      }
      oracleQuery = finalQuery;
      oracledbParams = {};
    } else if (params && !Array.isArray(params)) {
      oracledbParams = params;
    }

    return { oracleQuery, oracledbParams };
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
          mensagem: "Falha ao conectar ao banco Oracle. Verifique as credenciais e o Service Name.",
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
