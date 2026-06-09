import { mysqlTable, int, varchar, text, timestamp, decimal, json, boolean, index, uniqueIndex } from "drizzle-orm/mysql-core";
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

  })
);

// WARLEINE - Faturamento (Staging)
export const warleineFaturamentoStaging = mysqlTable(
  "warleine_faturamento_staging",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int().notNull(),
    
    // Dados brutos em JSON (preserva estrutura original)
    dadosBrutos: json().notNull(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_warleine_fatur_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_warleine_fatur_config").on(table.configId),
  })
);

// Faturamento Geral (dados transformados do faturamento WARLEINE)
export const faturamentoGeral = mysqlTable(
  "faturamento_geral",
  {
    id: int().primaryKey().autoincrement(),
    
    // Rastreamento de origem
    origemSistema: varchar({ length: 50 }).notNull().default("WARLEINE"),
    estabelecimentoId: int().notNull(),
    configId: int(),
    
    // Campos do faturamento WARLEINE
    aihguia: varchar({ length: 100 }),
    codcc: varchar({ length: 50 }),
    codconv: varchar({ length: 50 }),
    codgrufi: varchar({ length: 50 }),
    codproprio: varchar({ length: 100 }),
    codrecur: varchar({ length: 100 }),
    codtiss: varchar({ length: 100 }),
    complrecur: text(),
    data: timestamp(),
    dataint: timestamp(),
    datasai: timestamp(),
    descmotivo: text(),
    descricao: text(),
    funcaotiss: varchar({ length: 50 }),
    gl_aceita: varchar({ length: 50 }),
    gl_analise: varchar({ length: 50 }),
    gl_recuperada: varchar({ length: 50 }),
    gl_recurso: varchar({ length: 50 }),
    guiacobra: varchar({ length: 100 }),
    matricula: varchar({ length: 100 }),
    mesprod: varchar({ length: 20 }),
    nomecc: varchar({ length: 255 }),
    nomeconv: varchar({ length: 255 }),
    nomeprest: varchar({ length: 255 }),
    numconta: varchar({ length: 100 }),
    numfatura: varchar({ length: 100 }),
    prestexe: varchar({ length: 255 }),
    procdisco: varchar({ length: 100 }),
    protocolo: varchar({ length: 100 }),
    quantidade: varchar({ length: 50 }),
    receber: varchar({ length: 50 }),
    tipoatend: varchar({ length: 50 }),
    tipoproc: varchar({ length: 100 }),
    vl_aberto: varchar({ length: 50 }),
    vl_faturado: varchar({ length: 50 }),
    vl_glosas: varchar({ length: 50 }),
    vl_receb_a_maior: varchar({ length: 50 }),
    vl_recebido: varchar({ length: 50 }),
    vl_total_recebido: varchar({ length: 50 }),
    vl_unitario: varchar({ length: 50 }),
    
    // Metadados
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_fatur_geral_estab").on(table.estabelecimentoId),
    numcontaIdx: index("idx_fatur_geral_numconta").on(table.numconta),
    nomeconvIdx: index("idx_fatur_geral_nomeconv").on(table.nomeconv),
    mesprodIdx: index("idx_fatur_geral_mesprod").on(table.mesprod),
    configIdx: index("idx_fatur_geral_config").on(table.configId),
  })
);

// TASY - Maternidade Ela - Atendimentos (Staging)
export const tasyMaternidadeElaAtendimentosStaging = mysqlTable(
  "Tasy_maternidadeela_atendimentos_stagion",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    numeroAtendimento: varchar({ length: 50 }),
    tipoSaida: varchar({ length: 100 }),
    local: varchar({ length: 255 }),
    paciente: varchar({ length: 255 }),
    carater: varchar({ length: 50 }),
    dataAdmissao: timestamp(),
    dataAlta: timestamp(),
    tipoAtendimento: varchar({ length: 100 }),
    servico: varchar({ length: 255 }),
    procedimentoPrincipal: varchar({ length: 255 }),
    centroCusto: varchar({ length: 100 }),
    dadosBrutos: json(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
    convenio: varchar({ length: 255 }),
    dsCategoria: varchar({ length: 255 }),
    dsPlano: varchar({ length: 255 }),
    competencia: varchar({ length: 20 }),
    referencia: varchar({ length: 20 }),
    protTasy: varchar({ length: 50 }),
    nomeProtocolo: varchar({ length: 255 }),
    protConv: varchar({ length: 100 }),
    dtEntrega: timestamp(),
    protStatus: varchar({ length: 50 }),
    titulo: varchar({ length: 100 }),
    dtTitulo: timestamp(),
    dataVencimento: timestamp(),
    dsSetorEntrada: varchar({ length: 255 }),
    dsSetorLeito: varchar({ length: 255 }),
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    dtEtapa: timestamp(),
    userEtapa: varchar({ length: 100 }),
    motivoDevolucao: text(),
    conta: varchar({ length: 50 }),
    autorizacao: varchar({ length: 100 }),
    matricula: varchar({ length: 100 }),
    sexo: varchar({ length: 10 }),
    idade: varchar({ length: 50 }),
    codServico: varchar({ length: 50 }),
    procedimentoPrincipal2: varchar({ length: 500 }),
    dataInicio: varchar({ length: 20 }),
    dataFim: varchar({ length: 20 }),
    dsMotivoAlta: varchar({ length: 255 }),
    medicoResp: varchar({ length: 255 }),
    crm: varchar({ length: 50 }),
    valorConta: decimal({ precision: 15, scale: 2 }),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_tasy_matela_estab").on(table.estabelecimentoId),
    configIdx: index("idx_tasy_matela_config").on(table.configId),
  })
);

// Alias para compatibilidade
export const tasyAtendimentosStaging = tasyMaternidadeElaAtendimentosStaging;

// TASY - Hemolabor - Atendimentos (Staging)
export const tasyHemolaborAtendimentosStaging = mysqlTable(
  "TASY_hemolabor_atendimentos_stagion",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    numeroAtendimento: varchar({ length: 50 }),
    tipoSaida: varchar({ length: 100 }),
    local: varchar({ length: 255 }),
    paciente: varchar({ length: 255 }),
    carater: varchar({ length: 50 }),
    dataAdmissao: timestamp(),
    dataAlta: timestamp(),
    tipoAtendimento: varchar({ length: 100 }),
    servico: varchar({ length: 255 }),
    procedimentoPrincipal: varchar({ length: 255 }),
    centroCusto: varchar({ length: 100 }),
    dadosBrutos: json(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
    convenio: varchar({ length: 255 }),
    dsCategoria: varchar({ length: 255 }),
    dsPlano: varchar({ length: 255 }),
    competencia: varchar({ length: 20 }),
    referencia: varchar({ length: 20 }),
    protTasy: varchar({ length: 50 }),
    nomeProtocolo: varchar({ length: 255 }),
    protConv: varchar({ length: 100 }),
    dtEntrega: timestamp(),
    protStatus: varchar({ length: 50 }),
    titulo: varchar({ length: 100 }),
    dtTitulo: timestamp(),
    dataVencimento: timestamp(),
    dsSetorEntrada: varchar({ length: 255 }),
    dsSetorLeito: varchar({ length: 255 }),
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    dtEtapa: timestamp(),
    userEtapa: varchar({ length: 100 }),
    motivoDevolucao: text(),
    conta: varchar({ length: 50 }),
    autorizacao: varchar({ length: 100 }),
    matricula: varchar({ length: 100 }),
    sexo: varchar({ length: 10 }),
    idade: varchar({ length: 50 }),
    codServico: varchar({ length: 50 }),
    procedimentoPrincipal2: varchar({ length: 500 }),
    dataInicio: varchar({ length: 20 }),
    dataFim: varchar({ length: 20 }),
    dsMotivoAlta: varchar({ length: 255 }),
    medicoResp: varchar({ length: 255 }),
    crm: varchar({ length: 50 }),
    valorConta: decimal({ precision: 15, scale: 2 }),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_tasy_hemolabor_estab").on(table.estabelecimentoId),
    configIdx: index("idx_tasy_hemolabor_config").on(table.configId),
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
    origemId: varchar({ length: 255 }).notNull(), // ID original no sistema
    estabelecimentoId: int().notNull(),
    
    // Campos específicos solicitados (DE-PARA WARLEINE)
    numero_atendimento: varchar({ length: 100 }), // numatend
    codigo_saida: varchar({ length: 50 }), // codtipsai
    convenio: varchar({ length: 255 }), // nomeplaco
    paciente: varchar({ length: 255 }), // nomepac
    caracter_atendimento: varchar({ length: 50 }), // carater
    data_entrada: timestamp(), // datatend
    data_saida: timestamp(), // datasai
    tipo_atendimento: varchar({ length: 50 }), // tipoatend
    descricao_atendimento: varchar({ length: 255 }), // tipoatendimentodescricao
    codigo_servico: varchar({ length: 100 }), // codserv
    codigo_procedimento: varchar({ length: 500 }), // procprin
    destino_conta: varchar({ length: 100 }), // codcc_destino
    
    // Dados de categoria/plano
    dsCategoria: varchar({ length: 255 }),
    dsPlano: varchar({ length: 255 }),
    
    // Dados de competência/referência
    competencia: varchar({ length: 20 }),
    referencia: varchar({ length: 20 }),
    
    // Dados de protocolo
    protTasy: varchar({ length: 50 }),
    nomeProtocolo: varchar({ length: 255 }),
    protConv: varchar({ length: 100 }),
    dtEntrega: timestamp(),
    protStatus: varchar({ length: 50 }),
    
    // Dados de título/vencimento
    titulo: varchar({ length: 100 }),
    dtTitulo: timestamp(),
    dataVencimento: timestamp(),
    
    // Dados de setor
    dsSetorEntrada: varchar({ length: 255 }),
    dsSetorLeito: varchar({ length: 255 }),
    
    // Dados de etapa
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    dtEtapa: timestamp(),
    userEtapa: varchar({ length: 100 }),
    motivoDevolucao: text(),
    
    // Dados financeiros
    conta: varchar({ length: 50 }),
    autorizacao: varchar({ length: 100 }),
    valorConta: decimal({ precision: 15, scale: 2 }),
    
    // Dados do paciente
    matricula: varchar({ length: 100 }),
    sexo: varchar({ length: 10 }),
    idade: varchar({ length: 50 }),
    
    // Dados médicos
    medicoResp: varchar({ length: 255 }),
    crm: varchar({ length: 50 }),
    dsMotivoAlta: varchar({ length: 255 }),
    
    // Dados de período
    dataInicio: varchar({ length: 20 }),
    dataFim: varchar({ length: 20 }),
    
    // Dados de serviço adicionais
    codServico: varchar({ length: 50 }),
    centroCusto: varchar({ length: 100 }),
    
    // Metadados
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    origemSistemaIdx: index("idx_atend_origem_sistema").on(table.origemSistema),
    origemIdIdx: index("idx_atend_origem_id").on(table.origemId),
    estabelecimentoIdx: index("idx_atend_estab").on(table.estabelecimentoId),
    dataEntradaIdx: index("idx_atend_data_entrada").on(table.data_entrada),
  })
);

export const faturamento = mysqlTable(
  "faturamento_unificado",
  {
    id: int().primaryKey().autoincrement(),
    
    // Origem do dado
    origemSistema: varchar({ length: 50 }).notNull(), // 'TASY' ou 'XML_TISS'
    origemId: varchar({ length: 100 }), // ID original na tabela de origem
    estabelecimentoId: int().notNull(),
    
    // Identificadores da conta/guia
    contaNumero: varchar({ length: 100 }), // Número da conta (Tasy) ou guia (XML)
    numeroGuia: varchar({ length: 50 }), // Número da guia do prestador
    numeroGuiaOperadora: varchar({ length: 50 }), // Número da guia da operadora
    senha: varchar({ length: 50 }), // Senha de autorização
    protocolo: varchar({ length: 100 }), // Protocolo TISS
    lotePrestador: varchar({ length: 50 }), // Número do lote
    atendimento: varchar({ length: 100 }), // Número do atendimento
    
    // Dados do paciente/beneficiário
    pacienteNome: varchar({ length: 255 }),
    carteiraBeneficiario: varchar({ length: 50 }),
    
    // Dados do convênio
    convenio: varchar({ length: 255 }),
    convenioId: int(),
    competencia: varchar({ length: 20 }), // Mês/Ano de referência (YYYY-MM)
    
    // Dados do profissional
    profissionalExecutante: varchar({ length: 255 }),
    setor: varchar({ length: 255 }),
    
    // Dados do item
    tipoItem: varchar({ length: 50 }), // PROC/TAXA, MAT/MED, PROCEDIMENTO, DESPESA
    codigoItem: varchar({ length: 50 }),
    codigoItemTuss: varchar({ length: 50 }),
    descricaoItem: text(),
    dataExecucao: timestamp(),
    quantidade: decimal({ precision: 12, scale: 4 }),
    
    // Valores financeiros
    valorUnitario: decimal({ precision: 12, scale: 4 }),
    valorFaturado: decimal({ precision: 12, scale: 4 }),
    valorPago: decimal({ precision: 12, scale: 4 }),
    valorGlosa: decimal({ precision: 12, scale: 4 }),
    
    // Motivo de glosa
    motivoGlosa: text(),
    codigoGlosa: varchar({ length: 50 }),
    
    // Dados de retorno/pagamento
    retorno: varchar({ length: 50 }),
    dataPagamento: timestamp(),
    
    // Código do prestador executante (codigoPrestadorNaOperadora do XML)
    codigoPrestadorExecutante: varchar({ length: 50 }),
    
    // Status da conciliação
    statusConciliacao: varchar({ length: 50 }).default('pendente'), // pendente, conciliado, divergente, nao_recebido
    recebimentoVinculadoId: int(), // ID do recebimento vinculado (recebimentos_excel ou recebimento_tiss)
    recebimentoOrigem: varchar({ length: 20 }), // 'excel' ou 'xml'
    
    // Timestamps
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    origemSistemaIdx: index("idx_fatur_origem_sistema").on(table.origemSistema),
    estabelecimentoIdx: index("idx_fatur_estab").on(table.estabelecimentoId),
    contaNumeroIdx: index("idx_fatur_conta").on(table.contaNumero),
    guiaIdx: index("idx_fatur_guia").on(table.numeroGuia),
    convenioIdx: index("idx_fatur_convenio").on(table.convenio),
    competenciaIdx: index("idx_fatur_competencia").on(table.competencia),
    codigoItemIdx: index("idx_fatur_codigo_item").on(table.codigoItem),
    statusConciliacaoIdx: index("idx_fatur_status_conciliacao").on(table.statusConciliacao),
    pacienteNomeIdx: index("idx_fatur_paciente").on(table.pacienteNome),
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
 * CAMADA 3B: DADOS DAS VIEWS DO POSTGRESQL EXTERNO
 * Tabelas que espelham as views do banco do Instituto do Rim
 * Sincronizadas periodicamente pelo Integrador de Dados
 */

// Atendimentos Sem Conta (espelho da view din_Atend_n_receb)
export const atendimentosSemConta = mysqlTable(
  "atendimentos_sem_conta",
  {
    id: int().primaryKey().autoincrement(),
    
    // Rastreamento
    estabelecimentoId: int().notNull(),
    origemSistema: varchar({ length: 50 }).notNull().default("EASYVISION"),
    
    // Campos da view din_Atend_n_receb
    numatend: varchar({ length: 100 }).notNull(),
    nomeplaco: varchar({ length: 255 }), // convênio/plano
    nomepac: varchar({ length: 255 }), // nome do paciente
    carater: varchar({ length: 50 }), // caráter do atendimento (EL, UR)
    datatend: timestamp(), // data do atendimento
    datasai: timestamp(), // data de saída
    tipoatend: varchar({ length: 10 }), // código tipo (I, E, A)
    tipoatendimentodescricao: varchar({ length: 100 }), // descrição (INTERNACAO, EXAME, AMBULATORIO)
    codserv: varchar({ length: 255 }), // código/nome do serviço
    procprin: varchar({ length: 100 }), // procedimento principal
    codcc_destino: varchar({ length: 100 }), // centro de custo destino
    motivo: text(), // motivo da última notificação
    
    // Metadados de sincronização
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_atend_sem_conta_estab").on(table.estabelecimentoId),
    numatendIdx: index("idx_atend_sem_conta_numatend").on(table.numatend),
    tipoatendIdx: index("idx_atend_sem_conta_tipo").on(table.tipoatend),
    datatendIdx: index("idx_atend_sem_conta_datatend").on(table.datatend),
  })
);

// Atendimentos a Faturar (espelho da view din_Atend_receb_s_faturar)
export const atendimentosAFaturar = mysqlTable(
  "atendimentos_a_faturar",
  {
    id: int().primaryKey().autoincrement(),
    
    // Rastreamento
    estabelecimentoId: int().notNull(),
    origemSistema: varchar({ length: 50 }).notNull().default("EASYVISION"),
    
    // Campos da view din_Atend_receb_s_faturar
    numatend: varchar({ length: 100 }).notNull(),
    nomeplaco: varchar({ length: 255 }), // convênio/plano
    nomepac: varchar({ length: 255 }), // nome do paciente
    carater: varchar({ length: 50 }), // caráter do atendimento (EL, UR)
    datatend: timestamp(), // data do atendimento
    datasai: timestamp(), // data de saída
    tipoatend: varchar({ length: 10 }), // código tipo (I, E, A)
    tipoatendimentodescricao: varchar({ length: 100 }), // descrição
    codserv: varchar({ length: 255 }), // código/nome do serviço
    procprin: varchar({ length: 100 }), // procedimento principal
    
    // Metadados de sincronização
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_atend_faturar_estab").on(table.estabelecimentoId),
    numatendIdx: index("idx_atend_faturar_numatend").on(table.numatend),
    tipoatendIdx: index("idx_atend_faturar_tipo").on(table.tipoatend),
    datatendIdx: index("idx_atend_faturar_datatend").on(table.datatend),
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

/**
 * INTEG_FATURADO - Dados de faturamento do hospital via banco Warleine
 * Tabela já existente no banco, sincronizada automaticamente.
 * Contém apenas dados de faturamento (sem recebimento/glosa).
 * Usada em conjunto com faturamento_tiss para popular faturamento_unificado.
 */
export const integFaturado = mysqlTable(
  "integ_faturado",
  {
    _id: int().primaryKey(),
    estabelecimento_id: int(),
    nomeconv: varchar({ length: 255 }),
    codconv: varchar({ length: 255 }),
    mesprod: varchar({ length: 255 }),
    numfatura: varchar({ length: 255 }),
    codrecur: varchar({ length: 500 }),
    tipoproc: varchar({ length: 255 }),
    protocolo: varchar({ length: 255 }),
    numconta: varchar({ length: 255 }),
    guiacobra: varchar({ length: 255 }),
    aihguia: varchar({ length: 255 }),
    descricao: varchar({ length: 255 }),
    matricula: varchar({ length: 255 }),
    data: timestamp(),
    dataint: timestamp(),
    datasai: varchar({ length: 500 }),
    procdisco: varchar({ length: 255 }),
    codproprio: varchar({ length: 255 }),
    codgrufi: varchar({ length: 255 }),
    funcaotiss: varchar({ length: 255 }),
    receber: varchar({ length: 255 }),
    codcc: varchar({ length: 255 }),
    nomecc: varchar({ length: 255 }),
    prestexe: varchar({ length: 255 }),
    nomeprest: varchar({ length: 255 }),
    medsolic: varchar({ length: 255 }),
    nomemedsolic: varchar({ length: 255 }),
    codtiss: varchar({ length: 500 }),
    descmotivo: varchar({ length: 500 }),
    complrecur: varchar({ length: 500 }),
    tipoatend: varchar({ length: 255 }),
    databaixa: varchar({ length: 500 }),
    codplaco: varchar({ length: 255 }),
    nomeplaco: varchar({ length: 255 }),
    vl_unitario: varchar({ length: 255 }),
    quantidade: varchar({ length: 255 }),
    vl_faturado: varchar({ length: 255 }),
    _sincronizado_em: timestamp(),
    _atualizado_em: timestamp(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_integ_fatur_estab").on(table.estabelecimento_id),
    guiacobraIdx: index("idx_integ_fatur_guia").on(table.guiacobra),
    procdiscoIdx: index("idx_integ_fatur_proc").on(table.procdisco),
    mesprodIdx: index("idx_integ_fatur_mesprod").on(table.mesprod),
    numcontaIdx: index("idx_integ_fatur_numconta").on(table.numconta),
    nomeconvIdx: index("idx_integ_fatur_nomeconv").on(table.nomeconv),
  })
);


/**
 * TABELA DE RESULTADOS DE CONCILIAÇÃO AUTOMÁTICA
 * Armazena os resultados da conciliação separados do faturamento_unificado.
 * Cada registro vincula um item do faturamento_unificado a um recebimento (ou marca como não recebido).
 */
export const conciliadosAutomatico = mysqlTable(
  "conciliados_automatico",
  {
    id: int().primaryKey().autoincrement(),
    
    // Referência ao faturamento
    faturamentoUnificadoId: int().notNull(),
    estabelecimentoId: int().notNull(),
    
    // Dados copiados do faturamento para consulta rápida
    contaNumero: varchar({ length: 100 }),
    numeroGuia: varchar({ length: 50 }),
    pacienteNome: varchar({ length: 255 }),
    convenio: varchar({ length: 255 }),
    convenioId: int(),
    competencia: varchar({ length: 20 }),
    codigoItem: varchar({ length: 50 }),
    codigoItemTuss: varchar({ length: 50 }),
    descricaoItem: text(),
    tipoItem: varchar({ length: 50 }), // MED, MAT, EXA, PROC, TAXA, etc.
    origemSistema: varchar({ length: 50 }), // WARLEINE ou XML_TISS
    dataExecucao: timestamp(), // Data de execução do item
    
    // Código do prestador executante (para separação próprio/terceiro)
    codigoPrestadorExecutante: varchar({ length: 50 }),
    
    // Campo receber do Warleine: 'S' = hospital recebe, 'N' = pagamento direto ao médico/terceiro
    receber: varchar({ length: 10 }),
    
    // Valores do faturamento
    valorFaturado: decimal({ precision: 12, scale: 4 }),
    quantidade: decimal({ precision: 12, scale: 4 }),
    
    // Referência ao recebimento vinculado
    recebimentoId: int(), // ID do recebimento_excel vinculado (null se não recebido)
    recebimentoOrigem: varchar({ length: 20 }), // 'excel' ou 'xml'
    
    // Valores do recebimento
    valorPago: decimal({ precision: 12, scale: 4 }).default('0'),
    valorGlosa: decimal({ precision: 12, scale: 4 }).default('0'),
    codigoGlosa: varchar({ length: 20 }), // Código de glosa TISS
    motivoGlosa: text(), // Descrição do motivo da glosa
    
    // Resultado da conciliação
    statusConciliacao: varchar({ length: 50 }).notNull(), // conciliado, divergente, nao_recebido
    metodoConciliacao: varchar({ length: 50 }), // guia_codigo, guia_codigo_tuss, vinculacao, paciente_codigo
    diferenca: decimal({ precision: 12, scale: 4 }), // valorFaturado - valorPago
    percentualDiferenca: decimal({ precision: 8, scale: 4 }), // % de diferença
    
    // Metadados da execução
    toleranciaUsada: decimal({ precision: 5, scale: 2 }), // tolerância percentual usada
    executadoPor: int(), // userId que executou
    criadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    faturamentoIdx: index("idx_conc_auto_faturamento").on(table.faturamentoUnificadoId),
    estabelecimentoIdx: index("idx_conc_auto_estab").on(table.estabelecimentoId),
    statusIdx: index("idx_conc_auto_status").on(table.statusConciliacao),
    competenciaIdx: index("idx_conc_auto_competencia").on(table.competencia),
    convenioIdx: index("idx_conc_auto_convenio").on(table.convenio),
    guiaIdx: index("idx_conc_auto_guia").on(table.numeroGuia),
    codigoItemIdx: index("idx_conc_auto_codigo").on(table.codigoItem),
    metodoIdx: index("idx_conc_auto_metodo").on(table.metodoConciliacao),
  })
);


/**
 * CACHE LOCAL: Relatório de Atendimentos
 * Armazena dados descritivos completos do relatório de atendimentos
 * sincronizados do Warleine (PostgreSQL) para consulta local rápida
 */
export const relatorioAtendimentosCache = mysqlTable(
  "relatorio_atendimentos_cache",
  {
    id: int().primaryKey().autoincrement(),
    origemSistema: varchar({ length: 50 }).notNull().default("WARLEINE"),
    estabelecimentoId: int().notNull(),

    // Identificador do atendimento
    numatend: varchar({ length: 100 }).notNull(),

    // Tipo de atendimento
    tipoAtendimento: varchar("tipoatend", { length: 10 }),
    tipoAtendimentoDescricao: varchar("tipoatend_descricao", { length: 100 }),

    // Serviço
    codserv: varchar({ length: 50 }),
    servico: varchar("nomeserv", { length: 255 }),

    // Plano/Convênio
    codplaco: varchar({ length: 50 }),
    planoConvenio: varchar("nomeplaco", { length: 255 }),

    // Proveniente
    codproven: varchar({ length: 50 }),
    proveniente: varchar("nomeproven", { length: 255 }),

    // Datas
    dataAtendimento: timestamp("data_atendimento"),
    dataSaida: timestamp("data_saida"),

    // Censo
    censo: varchar({ length: 100 }),

    // Centro de Custo
    codcc: varchar({ length: 50 }),
    centroCusto: varchar("nomecc", { length: 255 }),

    // Prestador
    codprest: varchar({ length: 50 }),
    prestador: varchar("nomeprest", { length: 255 }),

    // Procedimento Principal
    procprin: varchar({ length: 100 }),
    dsprocprin: varchar({ length: 500 }),

    // CID
    cidprin: varchar({ length: 20 }),
    diagnosticoCid: varchar("descrcid", { length: 500 }),

    // Caráter
    caraterAtendimento: varchar("carater", { length: 10 }),
    caraterDescricao: varchar("carater_descricao", { length: 100 }),

    // Paciente
    codpac: varchar({ length: 50 }),
    paciente: varchar("nomepac", { length: 255 }),

    // Metadados de sincronização
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),

    // Especialidade
    codesp: varchar({ length: 50 }),
    especialidade: varchar({ length: 255 }),

    // Operador Cadastro
    opecad: varchar({ length: 50 }),
    operadorCadastro: varchar("operador_cadastro", { length: 255 }),

    // CBO
    codcbo: varchar({ length: 50 }),
    descricaoCbo: varchar("descricao_cbo", { length: 500 }),

    // Dados do Paciente
    sexoPaciente: varchar("sexo_paciente", { length: 20 }),
    cepPaciente: varchar("cep_paciente", { length: 20 }),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_rel_atend_cache_estab").on(table.estabelecimentoId),
    numatendIdx: index("idx_rel_atend_cache_numatend").on(table.numatend),
    dataAtendIdx: index("idx_rel_atend_cache_data").on(table.dataAtendimento),
    codservIdx: index("idx_rel_atend_cache_codserv").on(table.codserv),
    codplacoIdx: index("idx_rel_atend_cache_codplaco").on(table.codplaco),
    codprestIdx: index("idx_rel_atend_cache_codprest").on(table.codprest),
    codccIdx: index("idx_rel_atend_cache_codcc").on(table.codcc),
    tipoAtendIdx: index("idx_rel_atend_cache_tipo").on(table.tipoAtendimento),
    estabDataIdx: index("idx_rel_atend_cache_estab_data").on(table.estabelecimentoId, table.dataAtendimento),
  })
);

/**
 * Metadados de sincronização do relatório de atendimentos
 */
export const relatorioAtendimentosSyncMeta = mysqlTable(
  "relatorio_atendimentos_sync_meta",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    ultimaSincronizacao: timestamp(),
    totalRegistros: int().default(0),
    duracaoSegundos: int().default(0),
    status: varchar({ length: 50 }).notNull().default("pendente"), // pendente, em_andamento, sucesso, erro
    mensagemErro: text(),
    dataInicioSync: varchar("dataInicioPeriodo", { length: 20 }),
    dataFimSync: varchar("dataFimPeriodo", { length: 20 }),
    executadoPor: int("usuarioId"),
    executadoPorNome: varchar("usuarioNome", { length: 255 }),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: uniqueIndex("idx_rel_sync_meta_estab").on(table.estabelecimentoId),
  })
);


/**
 * CACHE LOCAL: Custos de Produtos (TABPROD + TABMPROP do Warleine)
 * Armazena dados de custo de produtos/materiais/taxas por tabela de preço
 */
export const custosProtudosCache = mysqlTable(
  "custos_produtos_cache",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    
    // Dados do produto (TABPROD)
    codprod: varchar({ length: 50 }).notNull(),
    descricao: varchar({ length: 500 }),
    tipoprod: varchar({ length: 10 }), // M=Medicamento, T=Taxa, O=Outros
    capacidadeEstoque: decimal("capacidade_estoque", { precision: 18, scale: 6 }),
    multEstoque: decimal("mult_estoque", { precision: 18, scale: 6 }),
    unidadeEstoque: varchar("unidade_estoque", { length: 50 }),
    custoEstoque: decimal("custo_estoque", { precision: 18, scale: 6 }),
    
    // Dados do convênio/plano (CADPLACO + CADCONV)
    codplaco: varchar({ length: 50 }),
    nomeConvenio: varchar("nome_convenio", { length: 255 }),
    nomePlano: varchar("nome_plano", { length: 255 }),
    
    // Dados da tabela de preço (TABMPROP)
    codtbmm: varchar({ length: 20 }).notNull(), // tabela dinâmica via cadplaco.codtbmm
    multFaturas: decimal("mult_faturas", { precision: 18, scale: 6 }),
    unidadeFaturas: varchar("unidade_faturas", { length: 50 }),
    custoMultFat: decimal("custo_mult_fat", { precision: 18, scale: 6 }),
    valormm: decimal({ precision: 18, scale: 6 }),
    prevenbras: decimal({ precision: 18, scale: 6 }),
    prefabsimp: decimal({ precision: 18, scale: 6 }),
    
    // Rastreamento
    sincronizadoEm: timestamp("sincronizado_em").defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_custos_cache_estab").on(table.estabelecimentoId),
    codprodIdx: index("idx_custos_cache_codprod").on(table.codprod),
    tipoprodIdx: index("idx_custos_cache_tipoprod").on(table.tipoprod),
    codtbmmIdx: index("idx_custos_cache_codtbmm").on(table.codtbmm),
    codprodTbmmIdx: uniqueIndex("idx_custos_cache_codprod_tbmm").on(table.estabelecimentoId, table.codprod, table.codtbmm, table.codplaco),
    codplacoIdx: index("idx_custos_cache_codplaco").on(table.codplaco),
    nomeConvenioIdx: index("idx_custos_cache_nome_convenio").on(table.nomeConvenio),
  })
);

/**
 * Metadados de sincronização dos custos de produtos
 */
export const custosProdutosSyncMeta = mysqlTable(
  "custos_produtos_sync_meta",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    status: varchar({ length: 50 }).notNull().default("pendente"),
    ultimaSincronizacao: timestamp("ultima_sincronizacao"),
    totalRegistros: int("total_registros").default(0),
    duracaoSegundos: int("duracao_segundos").default(0),
    mensagemErro: text("mensagem_erro"),
    executadoPor: int("executado_por"),
    executadoPorNome: varchar("executado_por_nome", { length: 255 }),
    criadoEm: timestamp("criado_em").defaultNow(),
    atualizadoEm: timestamp("atualizado_em").defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: uniqueIndex("idx_custos_sync_meta_estab").on(table.estabelecimentoId),
  })
);


/**
 * CACHE DE GEOCODIFICAÇÃO
 * Armazena coordenadas lat/lng para CEPs já geocodificados
 * para evitar chamadas repetidas à API do Google Maps
 */
export const geocodingCache = mysqlTable(
  "geocoding_cache",
  {
    id: int().primaryKey().autoincrement(),
    cep: varchar({ length: 20 }).notNull(),
    latitude: decimal({ precision: 10, scale: 7 }).notNull(),
    longitude: decimal({ precision: 10, scale: 7 }).notNull(),
    enderecoFormatado: text("endereco_formatado"),
    bairro: varchar({ length: 255 }),
    cidade: varchar({ length: 255 }),
    estado: varchar({ length: 2 }),
    criadoEm: timestamp("criado_em").defaultNow(),
  },
  (table) => ({
    cepIdx: uniqueIndex("idx_geocoding_cache_cep").on(table.cep),
  })
);


/**
 * FATURAMENTO EXTERNO (importado via Excel)
 * Armazena dados de faturamento/recebimento de estabelecimentos que não possuem
 * integração direta com o banco de dados (ex: Hospital Urológico - SUS/FMS).
 * Esses dados são importados manualmente via planilha Excel e integrados
 * ao Relatório de Faturamento junto com os dados do integ_faturado (TASY).
 */
export const faturamentoExterno = mysqlTable(
  "faturamento_externo",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    
    // Dados do convênio
    convenio: varchar({ length: 255 }).notNull(),
    
    // Competência (mês/ano de referência)
    mesAno: varchar("mes_ano", { length: 10 }).notNull(), // formato: "YYYY/MM" (ex: "2025/01")
    
    // Valores financeiros
    valorFaturado: decimal("valor_faturado", { precision: 14, scale: 2 }).default("0"),
    valorRecebido: decimal("valor_recebido", { precision: 14, scale: 2 }).default("0"),
    
    // Metadados de importação
    arquivoOrigem: varchar("arquivo_origem", { length: 500 }),
    importadoPor: int("importado_por"),
    importadoPorNome: varchar("importado_por_nome", { length: 255 }),
    criadoEm: timestamp("criado_em").defaultNow(),
    atualizadoEm: timestamp("atualizado_em").defaultNow(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_fat_ext_estab").on(table.estabelecimentoId),
    convenioIdx: index("idx_fat_ext_convenio").on(table.convenio),
    mesAnoIdx: index("idx_fat_ext_mes_ano").on(table.mesAno),
    uniqueIdx: uniqueIndex("idx_fat_ext_unique").on(table.estabelecimentoId, table.convenio, table.mesAno),
  })
);
