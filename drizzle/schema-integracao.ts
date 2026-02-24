import { mysqlTable, int, varchar, text, boolean, timestamp, index, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * CAMADA 1: CONFIGURAÇÃO DE QUERIES
 * Armazena as configurações de queries para cada sistema/estabelecimento
 */
export const queryConfiguracoes = mysqlTable(
  "query_configuracoes",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    sistema: varchar({ length: 50 }).notNull(), // warleine, tasy, omni, gesthor
    tipoDados: varchar({ length: 50 }).notNull(), // atendimentos, faturamento, procedimentos, pacientes
    querySql: text().notNull(),
    descricao: text(),
    
    // Configuração de conexão (JSON com host, port, database, user, password)
    conexaoConfig: json(),
    
    // Frequência de sincronização
    frequencia: varchar({ length: 50 }).notNull().default("tempo_real"), // tempo_real, 1x_dia, 1x_semana
    
    // Status
    ativo: boolean().notNull().default(true),
    
    // Rastreamento
    ultimaSincronizacao: timestamp(),
    proximaSincronizacao: timestamp(),
    totalRegistrosSincronizados: int().default(0),
    ultimoErro: text(),
    ultimaTentativa: timestamp(),
    
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoSistemaIdx: index("idx_query_config_estab_sistema").on(table.estabelecimentoId, table.sistema),
    sistemaIdx: index("idx_query_config_sistema").on(table.sistema),
    ativoIdx: index("idx_query_config_ativo").on(table.ativo),
  })
);

/**
 * CAMADA 2: STAGING - DADOS BRUTOS DE CADA SISTEMA
 */

// WARLEINE - Atendimentos (Staging)
export const warleineAtendimentosStaging = mysqlTable(
  "warleine_atendimentos_staging",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int().notNull(),
    
    // Dados brutos em JSON (preserva estrutura original)
    dadosBrutos: json().notNull(),
    

  },
  (table) => ({
    estabelecimentoIdx: index("idx_warleine_atend_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_warleine_atend_config").on(table.configId),
    atendimentoIdIdx: index("idx_warleine_atend_id").on(table.atendimentoId),
  })
);

// TASY - Atendimentos (Staging)
export const tasyAtendimentosStaging = mysqlTable(
  "tasy_atendimentos_staging",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configuracaoId: int().notNull(),
    dadosBrutos: json().notNull(),
    atendimentoId: varchar({ length: 100 }),
    pacienteId: varchar({ length: 100 }),
    dataSincronizacao: timestamp().defaultNow(),
    dataAtendimento: timestamp(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_tasy_atend_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_tasy_atend_config").on(table.configuracaoId),
  })
);

// OMNI - Atendimentos (Staging)
export const omniAtendimentosStaging = mysqlTable(
  "omni_atendimentos_staging",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configuracaoId: int().notNull(),
    dadosBrutos: json().notNull(),
    atendimentoId: varchar({ length: 100 }),
    pacienteId: varchar({ length: 100 }),
    dataSincronizacao: timestamp().defaultNow(),
    dataAtendimento: timestamp(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_omni_atend_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_omni_atend_config").on(table.configuracaoId),
  })
);

// GESTHOR - Atendimentos (Staging)
export const gesthorAtendimentosStaging = mysqlTable(
  "gesthor_atendimentos_staging",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configuracaoId: int().notNull(),
    dadosBrutos: json().notNull(),
    atendimentoId: varchar({ length: 100 }),
    pacienteId: varchar({ length: 100 }),
    dataSincronizacao: timestamp().defaultNow(),
    dataAtendimento: timestamp(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_gesthor_atend_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_gesthor_atend_config").on(table.configuracaoId),
  })
);

/**
 * CAMADA 3: DADOS UNIFICADOS
 * Tabelas normalizadas com dados de todos os sistemas
 */

export const atendimentos = mysqlTable(
  "atendimentos_unificados",
  {
    id: int().primaryKey().autoincrement(),
    
    // Rastreamento de origem
    origemSistema: varchar({ length: 50 }).notNull(), // warleine, tasy, omni, gesthor
    origemId: varchar({ length: 100 }).notNull(), // ID original no sistema
    estabelecimentoId: int().notNull(),
    
    // Dados principais
    dataAtendimento: timestamp(),
    pacienteId: varchar({ length: 100 }),
    procedimentoCodigo: varchar({ length: 100 }),
    procedimentoDescricao: text(),
    medicoId: varchar({ length: 100 }),
    medicoNome: varchar({ length: 255 }),
    valor: varchar({ length: 20 }), // Armazenar como string para preservar precisão
    status: varchar({ length: 50 }),
    
    // Metadados
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    origemSistemaIdx: index("idx_atend_origem_sistema").on(table.origemSistema),
    origemIdIdx: index("idx_atend_origem_id").on(table.origemId),
    estabelecimentoIdx: index("idx_atend_estab").on(table.estabelecimentoId),
    dataAtendimentoIdx: index("idx_atend_data").on(table.dataAtendimento),
  })
);

export const faturamento = mysqlTable(
  "faturamento_unificado",
  {
    id: int().primaryKey().autoincrement(),
    origemSistema: varchar({ length: 50 }).notNull(),
    origemId: varchar({ length: 100 }).notNull(),
    estabelecimentoId: int().notNull(),
    
    dataFaturamento: timestamp(),
    contaNumero: varchar({ length: 100 }),
    pacienteId: varchar({ length: 100 }),
    valor: varchar({ length: 20 }),
    status: varchar({ length: 50 }),
    
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    origemSistemaIdx: index("idx_fatur_origem_sistema").on(table.origemSistema),
    estabelecimentoIdx: index("idx_fatur_estab").on(table.estabelecimentoId),
  })
);

export const procedimentos = mysqlTable(
  "procedimentos_unificados",
  {
    id: int().primaryKey().autoincrement(),
    origemSistema: varchar({ length: 50 }).notNull(),
    origemId: varchar({ length: 100 }).notNull(),
    estabelecimentoId: int().notNull(),
    
    codigo: varchar({ length: 100 }).notNull(),
    descricao: text(),
    valor: varchar({ length: 20 }),
    
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    codigoIdx: index("idx_proc_codigo").on(table.codigo),
    origemSistemaIdx: index("idx_proc_origem_sistema").on(table.origemSistema),
  })
);

export const pacientes = mysqlTable(
  "pacientes_unificados",
  {
    id: int().primaryKey().autoincrement(),
    origemSistema: varchar({ length: 50 }).notNull(),
    origemId: varchar({ length: 100 }).notNull(),
    estabelecimentoId: int().notNull(),
    
    cpf: varchar({ length: 20 }),
    nome: varchar({ length: 255 }),
    dataNascimento: timestamp(),
    
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    cpfIdx: index("idx_pac_cpf").on(table.cpf),
    origemSistemaIdx: index("idx_pac_origem_sistema").on(table.origemSistema),
  })
);

/**
 * CAMADA 4: AUDITORIA E HISTÓRICO
 */

export const sincronizacaoLog = mysqlTable(
  "sincronizacao_log",
  {
    id: int().primaryKey().autoincrement(),
    
    configuracaoId: int().notNull(),
    sistema: varchar({ length: 50 }).notNull(),
    tipoDados: varchar({ length: 50 }).notNull(),
    estabelecimentoId: int().notNull(),
    
    // Resultado da sincronização
    status: varchar({ length: 50 }).notNull(), // sucesso, erro, em_andamento
    registrosSincronizados: int().default(0),
    registrosErro: int().default(0),
    duracao: int(), // em milissegundos
    
    // Detalhes do erro
    mensagemErro: text(),
    stackTrace: text(),
    
    // Rastreamento
    iniciadoEm: timestamp().defaultNow(),
    finalizadoEm: timestamp(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    configuracaoIdx: index("idx_sync_log_config").on(table.configuracaoId),
    sistemaIdx: index("idx_sync_log_sistema").on(table.sistema),
    statusIdx: index("idx_sync_log_status").on(table.status),
    dataIdx: index("idx_sync_log_data").on(table.criadoEm),
  })
);

export const atendimentosHistorico = mysqlTable(
  "atendimentos_historico",
  {
    id: int().primaryKey().autoincrement(),
    
    atendimentoId: int().notNull(),
    campoAlterado: varchar({ length: 100 }).notNull(),
    valorAnterior: text(),
    valorNovo: text(),
    
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    atendimentoIdx: index("idx_atend_hist_atend").on(table.atendimentoId),
  })
);
