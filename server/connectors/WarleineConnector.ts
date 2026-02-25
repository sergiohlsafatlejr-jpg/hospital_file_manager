import { Pool, QueryResult } from "pg";
import { logger } from "../_core/logger";

export interface WarleineAtendimento {
  numatend: string;
  codtipsai?: string;
  nomeplaco?: string;
  nomepac?: string;
  carater?: string;
  datatend?: Date;
  datasai?: Date;
  tipoatend?: string;
  tipoatendimentodescricao?: string;
  codserv?: string;
  procprin?: string;
  codccDestino?: string;
}

export interface WarleineConnectorConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * Connector para sincronizar dados do WARLEINE (PostgreSQL)
 * Responsável por conectar ao banco e executar queries de extração
 */
export class WarleineConnector {
  private pool: Pool | null = null;
  private config: WarleineConnectorConfig;

  constructor(config: WarleineConnectorConfig) {
    this.config = config;
  }

  /**
   * Inicializa a conexão com o banco WARLEINE
   */
  async conectar(): Promise<boolean> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Testa a conexão
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();

      logger.info({
        message: "Conexão WARLEINE estabelecida com sucesso",
        host: this.config.host,
        database: this.config.database,
      });

      return true;
    } catch (error) {
      logger.error({
        message: "Erro ao conectar ao WARLEINE",
        error: error instanceof Error ? error.message : String(error),
        host: this.config.host,
      });
      return false;
    }
  }

  /**
   * Desconecta do banco WARLEINE
   */
  async desconectar(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info({ message: "Conexão WARLEINE fechada" });
    }
  }

  /**
   * Executa uma query customizada no WARLEINE
   */
  async executarQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error("Conexão não estabelecida. Chame conectar() primeiro.");
    }

    try {
      const resultado = await this.pool.query(query, params);
      return resultado.rows as T[];
    } catch (error) {
      logger.error({
        message: "Erro ao executar query no WARLEINE",
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Extrai atendimentos do WARLEINE usando a query configurada
   * Query padrão: INTERNAÇÃO, EXAME, AMBULATÓRIO dos últimos 60 dias
   */
  async extrairAtendimentos(querySql?: string): Promise<WarleineAtendimento[]> {
    const query = querySql || this.getQueryPadraoAtendimentos();

    try {
      logger.info({
        message: "Iniciando extração de atendimentos do WARLEINE",
        queryLength: query.length,
      });

      const atendimentos = await this.executarQuery<WarleineAtendimento>(query);

      logger.info({
        message: "Extração de atendimentos concluída",
        totalRegistros: atendimentos.length,
      });

      return atendimentos;
    } catch (error) {
      logger.error({
        message: "Erro ao extrair atendimentos do WARLEINE",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Query padrão para extrair atendimentos
   * Inclui: INTERNAÇÃO, EXAME, AMBULATÓRIO
   * Período: últimos 60 dias
   */
  private getQueryPadraoAtendimentos(): string {
    return `
-- INTERNAÇÃO 
SELECT 
a.numatend,
(SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend),
(SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco),
    (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac),
A.carater,
a.datatend,
A.datasai,
A.tipoatend,
'INTERNACAO' AS tipoatendimentodescricao,
(SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
a.procprin,
X.codcc_destino
FROM arqatend a
LEFT JOIN contas b ON 
a.numatend = b.numatend
AND b.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
LEFT JOIN XX_LOTE_ATEND L ON
L.numatend = A.numatend
AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend AND status <> 'E')
LEFT JOIN XX_LOTE X ON
X.lote = L.lote
WHERE 1 = 1
AND a.datatend BETWEEN CURRENT_DATE - '60 days'::interval AND CURRENT_DATE
AND A.censo = 'S'
AND a.tipoatend = 'I'
AND a.datasai IS NOT NULL
AND B.numconta IS NULL
AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
AND (L.status = 'R' OR L.status IS NULL)
AND (X.codcc_destino NOT in ('BN2028', '000022', 'BN100') OR X.codcc_destino IS NULL)
 
UNION 
--EXAMESE
SELECT 
   a.numatend,
(SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend),
(SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco),
    (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac),
A.carater,
a.datatend,
A.datasai,
A.tipoatend,
'EXAME' AS tipoatendimentodescricao,
(SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
a.procprin,
X.codcc_destino
FROM arqatend a
LEFT JOIN contas b ON 
a.numatend = b.numatend
AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
LEFT JOIN XX_LOTE_ATEND L ON
L.numatend = A.numatend
AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend AND status <> 'E')
LEFT JOIN XX_LOTE X ON
X.lote = L.lote
WHERE 1 = 1
AND a.datatend BETWEEN CURRENT_DATE - '60 days'::interval AND CURRENT_DATE
AND A.censo = 'S'
AND a.tipoatend = 'E'
AND B.numconta IS NULL
AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
    AND (L.status = 'R' OR L.status IS NULL)
AND (X.codcc_destino NOT in ('BN2028', '000022', 'BN100') OR X.codcc_destino IS NULL)
 
UNION 
--AMBULATORIAL SEM CONSULTA E SEM RETORNO
SELECT 
   a.numatend,
(SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend),
(SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco),
    (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac),
A.carater,
a.datatend,
A.datasai,
A.tipoatend,
'AMBULATORIO' AS tipoatendimentodescricao,
(SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
a.procprin,
X.codcc_destino
FROM arqatend a
LEFT JOIN contas b ON 
a.numatend = b.numatend
AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
LEFT JOIN XX_LOTE_ATEND L ON
L.numatend = A.numatend
AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend AND status <> 'E')
LEFT JOIN XX_LOTE X ON
X.lote = L.lote
WHERE 1 = 1
    AND a.datatend BETWEEN CURRENT_DATE - '60 days'::interval AND CURRENT_DATE
AND A.censo = 'S'
AND a.tipoatend = 'A'
AND a.codserv NOT IN ('CO','RE')
AND B.numconta IS NULL
AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','TECI')
    AND (L.status = 'R' OR L.status IS NULL)
AND (X.codcc_destino NOT in ('BN2028', '000022', 'BN100') OR X.codcc_destino IS NULL)
    `;
  }

  // ============================================================
  // MÉTODOS DE EXTRAÇÃO DAS VIEWS DO POSTGRESQL EXTERNO
  // ============================================================

  /**
   * Interface para dados da view din_Atend_n_receb (Atendimentos Sem Conta)
   */
  static AtendimentoSemContaInterface = {} as {
    numatend: string;
    nomeplaco: string;
    nomepac: string;
    carater: string;
    datatend: string;
    datasai: string;
    tipoatend: string;
    tipoatendimentodescricao: string;
    codserv: string;
    procprin: string;
    codcc_destino: string;
    motivo: string | null;
  };

  /**
   * Interface para dados da view din_Atend_receb_s_faturar (Atendimentos a Faturar)
   */
  static AtendimentoAFaturarInterface = {} as {
    numatend: string;
    nomeplaco: string;
    nomepac: string;
    carater: string;
    datatend: string;
    datasai: string | null;
    tipoatend: string;
    tipoatendimentodescricao: string;
    codserv: string;
    procprin: string;
  };

  /**
   * Extrai atendimentos sem conta da view din_Atend_n_receb
   * Esses são atendimentos parados que não tiveram conta aberta
   */
  async extrairAtendimentosSemConta(): Promise<Array<{
    numatend: string;
    nomeplaco: string;
    nomepac: string;
    carater: string;
    datatend: string;
    datasai: string;
    tipoatend: string;
    tipoatendimentodescricao: string;
    codserv: string;
    procprin: string;
    codcc_destino: string;
    motivo: string | null;
  }>> {
    try {
      logger.info({ message: "Iniciando extração de atendimentos sem conta (din_Atend_n_receb)" });

      const resultado = await this.executarQuery(`
        SELECT a.numatend::text,
               a.nomeplaco,
               a.nomepac,
               a.carater,
               a.datatend::text,
               COALESCE(a.datasai, a.datatend)::text AS datasai,
               a.tipoatend,
               a.tipoatendimentodescricao,
               a.codserv,
               a.procprin,
               a.codcc_destino,
               rni.motivo
        FROM c33581562000206.din_Atend_n_receb a
        LEFT JOIN (
          SELECT rn.numatend, MAX(rn.id) AS max_rn_id
          FROM c33581562000206.registro_notificacao rn
          GROUP BY rn.numatend
        ) rn_max ON rn_max.numatend::text = a.numatend
        LEFT JOIN c33581562000206.registro_notificacao_item rni
          ON rni.notificacao_id = rn_max.max_rn_id
      `);

      logger.info({
        message: "Extração de atendimentos sem conta concluída",
        totalRegistros: resultado.length,
      });

      return resultado;
    } catch (error) {
      logger.error({
        message: "Erro ao extrair atendimentos sem conta",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extrai atendimentos a faturar da view din_Atend_receb_s_faturar
   * Esses são atendimentos recebidos mas que ainda não foram faturados
   */
  async extrairAtendimentosAFaturar(): Promise<Array<{
    numatend: string;
    nomeplaco: string;
    nomepac: string;
    carater: string;
    datatend: string;
    datasai: string | null;
    tipoatend: string;
    tipoatendimentodescricao: string;
    codserv: string;
    procprin: string;
  }>> {
    try {
      logger.info({ message: "Iniciando extração de atendimentos a faturar (din_Atend_receb_s_faturar)" });

      const resultado = await this.executarQuery(`
        SELECT 
          a.numatend::text,
          a.nomeplaco,
          a.nomepac,
          a.carater,
          a.datatend::text,
          a.datasai::text,
          a.tipoatend,
          a.tipoatendimentodescricao,
          a.codserv,
          a.procprin
        FROM c33581562000206.din_Atend_receb_s_faturar a
      `);

      logger.info({
        message: "Extração de atendimentos a faturar concluída",
        totalRegistros: resultado.length,
      });

      return resultado;
    } catch (error) {
      logger.error({
        message: "Erro ao extrair atendimentos a faturar",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Testa a conexão e a query
   */
  async testarConexaoEQuery(querySql: string): Promise<{
    sucesso: boolean;
    mensagem: string;
    totalRegistros?: number;
    primeiroRegistro?: any;
  }> {
    try {
      // Testa conexão
      const conectado = await this.conectar();
      if (!conectado) {
        return {
          sucesso: false,
          mensagem: "Falha ao conectar ao banco WARLEINE",
        };
      }

      // Testa query (com LIMIT para não trazer muitos dados)
      // Limpar a query de espaços extras e quebras de linha
      const queryLimpa = querySql.trim().replace(/\s+/g, ' ');
      const queryComLimit = queryLimpa.toUpperCase().includes("LIMIT")
        ? queryLimpa
        : `${queryLimpa} LIMIT 1`;

      const resultado = await this.executarQuery(queryComLimit);

      await this.desconectar();

      return {
        sucesso: true,
        mensagem: `Conexão e query validadas com sucesso. ${resultado.length} registro(s) encontrado(s).`,
        totalRegistros: resultado.length,
        primeiroRegistro: resultado[0],
      };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: `Erro: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
