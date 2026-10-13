import { mysqlTable, int, bigint, char, varchar, text, longtext, tinytext, timestamp, datetime, decimal, json, boolean, index, uniqueIndex } from "drizzle-orm/mysql-core";
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

// WARLEINE - Lotes de faturamento por estabelecimento e fonte
export const warleineFaturamentoLotes = mysqlTable(
  "warleine_faturamento_lotes",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    origem: varchar({ length: 20 }).notNull().default("arquivo"),
    arquivoNome: varchar({ length: 255 }).notNull(),
    arquivoHash: varchar({ length: 64 }).notNull(),
    arquivoTamanho: int(),
    arquivoStorageKey: varchar({ length: 500 }),
    status: varchar({ length: 30 }).notNull().default("recebido"),
    tentativas: int().notNull().default(0),
    claimToken: varchar({ length: 64 }),
    claimedBy: varchar({ length: 100 }),
    leaseExpiresAt: timestamp(),
    totalLinhas: int().notNull().default(0),
    totalValidas: int().notNull().default(0),
    totalAvisos: int().notNull().default(0),
    totalRejeitadas: int().notNull().default(0),
    totalPublicadas: int().notNull().default(0),
    valorFaturado: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorRecebido: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorTotalRecebido: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorAberto: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorGlosa: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    competencias: json(),
    erroResumo: text(),
    reducaoAprovadaEm: timestamp(),
    reducaoAprovadaPor: int(),
    reducaoAprovacaoMotivo: text(),
    criadoPor: int().notNull(),
    iniciadoEm: timestamp().defaultNow().notNull(),
    validadoEm: timestamp(),
    publicadoEm: timestamp(),
    atualizadoEm: timestamp().defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    estabelecimentoHashUnique: uniqueIndex("uq_warleine_fat_lote_estab_hash").on(table.estabelecimentoId, table.arquivoHash),
    estabelecimentoStatusIdx: index("idx_warleine_fat_lote_estab_status").on(table.estabelecimentoId, table.status),
    leaseIdx: index("idx_warleine_fat_lote_lease").on(table.status, table.leaseExpiresAt),
  }),
);

// WARLEINE - Faturamento (única staging compartilhada)
export const warleineFaturamentoStaging = mysqlTable(
  "warleine_faturamento_staging",
  {
    id: int().primaryKey().autoincrement(),
    loteId: int(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    numeroLinha: int(),
    status: varchar({ length: 20 }).notNull().default("valido"),
    avisoCodigo: varchar({ length: 100 }),
    
    // Dados canônicos em JSON. Chaves repetidas do arquivo são preservadas
    // com nomes distintos pelo importador posicional.
    dadosBrutos: json().notNull(),
  },
  (table) => ({
    estabelecimentoIdx: index("idx_warleine_fatur_estab").on(table.estabelecimentoId),
    configuracaoIdx: index("idx_warleine_fatur_config").on(table.configId),
    loteLinhaUnique: uniqueIndex("uq_warleine_fatur_lote_linha").on(table.loteId, table.numeroLinha),
    loteStatusIdx: index("idx_warleine_fatur_lote_status").on(table.loteId, table.status),
    loteEstabelecimentoIdIdx: index("idx_warleine_staging_lote_estab_id").on(table.loteId, table.estabelecimentoId, table.id),
  })
);

/** Pouso bruto do Hop para faturado/recebido do Urológico.
 * Não alimenta relatórios nem substitui o pipeline Warleine existente.
 * A rotina de publicação deverá validar lote completo e unidade 1260036.
 * Datas e competência são texto nesta camada para preservar a representação
 * civil da fonte; valores monetários são DECIMAL, nunca ponto flutuante.
 */
export const stagingFaturadoRecebidoUrologico = mysqlTable(
  "stagion_faturado_recebido_urologico",
  {
    id: int().primaryKey().autoincrement(),
    lote_ref: varchar({ length: 64 }),
    capturado_em: timestamp().defaultNow().notNull(),

    nomeconv: varchar({ length: 255 }),
    codconv: varchar({ length: 100 }),
    mesprod: varchar({ length: 20 }),
    numfatura: varchar({ length: 100 }),
    codrecur: varchar({ length: 100 }),
    tipoproc: varchar({ length: 50 }),
    protocolo: varchar({ length: 100 }),
    numconta: varchar({ length: 100 }),
    guiacobra: varchar({ length: 100 }),
    aihguia: varchar({ length: 50 }),
    descricao: varchar({ length: 255 }),
    matricula: varchar({ length: 100 }),
    data: varchar({ length: 40 }),
    dataint: varchar({ length: 40 }),
    datasai: varchar({ length: 40 }),
    procdisco: varchar({ length: 100 }),
    codproprio: varchar({ length: 100 }),
    codgrufi: varchar({ length: 50 }),
    descricao_1: text(),
    funcaotiss: varchar({ length: 50 }),
    receber: varchar({ length: 20 }),
    codcc: varchar({ length: 50 }),
    nomecc: varchar({ length: 255 }),
    prestexe: varchar({ length: 100 }),
    nomeprest: varchar({ length: 255 }),
    codtiss: varchar({ length: 100 }),
    descmotivo: text(),
    codrecur_1: varchar({ length: 100 }),
    complrecur: text(),
    tipoatend: varchar({ length: 100 }),
    quantidade: decimal({ precision: 15, scale: 4 }),
    vl_faturado: decimal({ precision: 15, scale: 2 }),
    vl_recebido: decimal({ precision: 15, scale: 2 }),
    vl_receb_a_maior: decimal({ precision: 15, scale: 2 }),
    vl_total_recebido: decimal({ precision: 15, scale: 2 }),
    vl_aberto: decimal({ precision: 15, scale: 2 }),
    vl_glosas: decimal({ precision: 15, scale: 2 }),
    gl_recurso: decimal({ precision: 15, scale: 2 }),
    gl_aceita: decimal({ precision: 15, scale: 2 }),
    gl_analise: decimal({ precision: 15, scale: 2 }),
    gl_recuperada: decimal({ precision: 15, scale: 2 }),
    vl_unitario: decimal({ precision: 15, scale: 4 }),
    estabelecimentos_id: varchar({ length: 100 }),
  },
  (table) => ({
    unidadeLoteIdx: index("idx_hup_fat_unidade_lote").on(table.estabelecimentos_id, table.lote_ref),
    unidadeCompetenciaIdx: index("idx_hup_fat_unidade_mes").on(table.estabelecimentos_id, table.mesprod),
    unidadeContaIdx: index("idx_hup_fat_unidade_conta").on(table.estabelecimentos_id, table.numconta),
  }),
);

/** Pouso de itens faturados do Hop para o Urológico, conforme o layout
 * de staging_faturamento_warleine. Não publica nem concilia pagamentos;
 * importacaoId deverá identificar um lote fechado antes da futura promoção.
 * O mesmo número de conta pode conter diversos itens: não deduplicar por conta.
 */
export const stagionFaturadoUrologico = mysqlTable(
  "stagion_faturado_urologico",
  {
    id: int("id").primaryKey().autoincrement(),
    importacaoId: int("importacaoId"),
    estabelecimentoId: int("estabelecimentoId").notNull(),
    numeroConta: varchar("numeroConta", { length: 100 }),
    numeroGuia: varchar("numeroGuia", { length: 100 }),
    convenioNome: varchar("convenioNome", { length: 255 }),
    pacienteNome: varchar("pacienteNome", { length: 255 }),
    codigoItem: varchar("codigoItem", { length: 100 }),
    descricaoItem: text("descricaoItem"),
    quantidade: decimal("quantidade", { precision: 12, scale: 4 }),
    valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
    valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
    dataExecucao: datetime("dataExecucao"),
    competencia: varchar("competencia", { length: 20 }),
    rawData: json("rawData"),
    processado: boolean("processado").default(false),
    criadoEm: timestamp("criadoEm").defaultNow(),
  },
  (table) => ({
    unidadeImportacaoIdx: index("idx_hup_faturado_estab_importacao").on(table.estabelecimentoId, table.importacaoId),
    unidadeContaIdx: index("idx_hup_faturado_estab_conta").on(table.estabelecimentoId, table.numeroConta),
  }),
);

export const warleineFaturamentoQuarentena = mysqlTable(
  "warleine_faturamento_quarentena",
  {
    id: int().primaryKey().autoincrement(),
    loteId: int().notNull(),
    estabelecimentoId: int().notNull(),
    numeroLinha: int().notNull(),
    erroCodigo: varchar({ length: 100 }).notNull(),
    erroDetalhe: text(),
    dadosBrutos: json(),
    criadoEm: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    loteLinhaUnique: uniqueIndex("uq_warleine_quarentena_lote_linha").on(table.loteId, table.numeroLinha),
    estabelecimentoIdx: index("idx_warleine_quarentena_estab").on(table.estabelecimentoId),
  }),
);

export const warleineFaturamentoItens = mysqlTable(
  "warleine_faturamento_itens",
  {
    id: int().primaryKey().autoincrement(),
    loteId: int().notNull(),
    estabelecimentoId: int().notNull(),
    numeroLinha: int().notNull(),
    origemRegistroId: varchar({ length: 191 }).notNull(),
    origemAtualizadoEm: varchar({ length: 30 }),
    chaveNegocioHash: varchar({ length: 64 }).notNull(),
    linhaHash: varchar({ length: 64 }).notNull(),
    ativoParaRelatorio: boolean().notNull().default(false),

    convenioFaturadoNome: varchar({ length: 255 }),
    convenioFaturadoCodigo: varchar({ length: 100 }),
    competencia: varchar({ length: 7 }).notNull(),
    remessaFaturamento: varchar({ length: 100 }),
    codigoRecursoOrigem1: varchar({ length: 100 }),
    tipoItem: varchar({ length: 50 }),
    protocoloConvenio: varchar({ length: 100 }),
    numeroConta: varchar({ length: 100 }).notNull(),
    guiaOperadora: varchar({ length: 100 }),
    guiaPrestador: varchar({ length: 100 }),
    pacienteNome: varchar({ length: 255 }),
    carteiraBeneficiario: varchar({ length: 100 }),
    dataAberturaConta: varchar({ length: 10 }),
    dataEntrada: varchar({ length: 10 }),
    dataAlta: varchar({ length: 10 }),
    codigoTuss: varchar({ length: 100 }),
    codigoItemInterno: varchar({ length: 100 }),
    codigoTipoServico: varchar({ length: 50 }),
    servicoNome: text(),
    funcaoTiss: varchar({ length: 50 }),
    recebimentoViaHospital: varchar({ length: 1 }),
    setorCodigo: varchar({ length: 50 }),
    setorNome: varchar({ length: 255 }),
    prestadorExecutanteCodigo: varchar({ length: 100 }),
    prestadorExecutanteNome: varchar({ length: 255 }),
    quantidade: decimal({ precision: 18, scale: 4 }).notNull().default("0"),
    valorFaturado: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorRecebido: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorRecebidoMaior: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorTotalRecebido: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorAberto: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorGlosa: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorRecursado: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorGlosaAceita: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorGlosaAnalise: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    valorGlosaRecuperada: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    codigoGlosa: varchar({ length: 100 }),
    motivoGlosa: text(),
    codigoMotivoInterno: varchar({ length: 100 }),
    observacaoGlosa: text(),
    tipoAtendimento: varchar({ length: 100 }),
    operadorCodigo: varchar({ length: 100 }),
    operadorNome: varchar({ length: 255 }),
    dataFechamentoRemessa: varchar({ length: 10 }),
    dataPagamento: varchar({ length: 10 }),
    dataAssociacaoWarleine: varchar({ length: 10 }),
    convenioPagadorNome: varchar({ length: 255 }),
    valorUnitario: decimal({ precision: 20, scale: 4 }).notNull().default("0"),
    publicadoEm: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    loteLinhaUnique: uniqueIndex("uq_warleine_item_lote_linha").on(table.loteId, table.numeroLinha),
    estabelecimentoOrigemUnique: uniqueIndex("uq_warleine_item_estab_origem").on(table.estabelecimentoId, table.origemRegistroId),
    estabelecimentoCompetenciaIdx: index("idx_warleine_item_estab_comp").on(table.estabelecimentoId, table.ativoParaRelatorio, table.competencia),
    estabelecimentoContaIdx: index("idx_warleine_item_estab_conta").on(table.estabelecimentoId, table.ativoParaRelatorio, table.numeroConta),
    estabelecimentoConvenioIdx: index("idx_warleine_item_estab_convenio").on(table.estabelecimentoId, table.ativoParaRelatorio, table.convenioFaturadoCodigo),
    loteIdx: index("idx_warleine_item_lote").on(table.loteId),
    loteEstabelecimentoCompetenciaIdx: index("idx_warleine_item_lote_estab_comp").on(table.loteId, table.estabelecimentoId, table.competencia),
    negocioHashIdx: index("idx_warleine_item_negocio_hash").on(table.chaveNegocioHash),
  }),
);

export const warleineFaturamentoSnapshotsAtivos = mysqlTable(
  "warleine_faturamento_snapshots_ativos",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    competencia: varchar({ length: 7 }).notNull(),
    loteId: int().notNull(),
    ativadoEm: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    estabelecimentoCompetenciaUnique: uniqueIndex("uq_warleine_snapshot_estab_comp").on(table.estabelecimentoId, table.competencia),
    loteIdx: index("idx_warleine_snapshot_lote").on(table.loteId),
  }),
);

// WARLEINE - Resultado do motor de regras por conta e versão ativa do snapshot.
// A análise não replica os itens faturados: aponta para o lote ativo da competência.
export const warleineFaturamentoAnalises = mysqlTable(
  "warleine_faturamento_analises",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    competencia: varchar({ length: 7 }).notNull(),
    numeroConta: varchar({ length: 100 }).notNull(),
    convenioChave: varchar({ length: 255 }).notNull(),
    loteId: int().notNull(),
    statusAnalise: varchar({ length: 20 }).notNull().default("pendente"),
    totalItensAnalisados: int().notNull().default(0),
    totalDivergencias: int().notNull().default(0),
    totalAlertas: int().notNull().default(0),
    totalCriticos: int().notNull().default(0),
    scoreRisco: int().notNull().default(0),
    resumoPorTipo: json(),
    detalhesRisco: json(),
    divergencias: json(),
    padroesDetalhados: json(),
    analisadoPor: int(),
    analisadoEm: timestamp().defaultNow().notNull(),
    atualizadoEm: timestamp().defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    contaLoteUnique: uniqueIndex("uq_warleine_analise_conta_lote").on(
      table.estabelecimentoId,
      table.competencia,
      table.numeroConta,
      table.convenioChave,
      table.loteId,
    ),
    estabelecimentoStatusIdx: index("idx_warleine_analise_estab_status").on(
      table.estabelecimentoId,
      table.statusAnalise,
    ),
  }),
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

// TASY - Lotes de importação compartilhados por estabelecimento
export const tasyIntegracaoLotes = mysqlTable(
  "tasy_integracao_lotes",
  {
    id: int().primaryKey().autoincrement(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    arquivoNome: varchar({ length: 255 }).notNull(),
    arquivoHash: varchar({ length: 64 }).notNull(),
    arquivoTamanho: int(),
    status: varchar({ length: 30 }).notNull().default("recebido"),
    totalLinhas: int().notNull().default(0),
    totalValidas: int().notNull().default(0),
    totalAvisos: int().notNull().default(0),
    totalRejeitadas: int().notNull().default(0),
    totalContas: int().notNull().default(0),
    totalPublicadas: int().notNull().default(0),
    valorConsolidado: decimal({ precision: 18, scale: 2 }).notNull().default("0"),
    erroResumo: text(),
    criadoPor: int().notNull(),
    iniciadoEm: timestamp().defaultNow().notNull(),
    validadoEm: timestamp(),
    publicadoEm: timestamp(),
    atualizadoEm: timestamp().defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    estabelecimentoHashUnique: uniqueIndex("uq_tasy_lote_estab_hash").on(table.estabelecimentoId, table.arquivoHash),
    estabelecimentoIdx: index("idx_tasy_lote_estab").on(table.estabelecimentoId),
    statusIdx: index("idx_tasy_lote_status").on(table.status),
    arquivoHashIdx: index("idx_tasy_lote_hash").on(table.arquivoHash),
  })
);

// TASY - Staging única para todos os estabelecimentos
export const tasyAtendimentosStaging = mysqlTable(
  "tasy_atendimentos_staging",
  {
    id: int().primaryKey().autoincrement(),
    loteId: int().notNull(),
    estabelecimentoId: int().notNull(),
    configId: int(),
    linhaArquivo: int().notNull(),
    sequencia: varchar({ length: 100 }),
    origemId: varchar({ length: 255 }),
    origemAtualizadaEm: timestamp(),
    convenio: varchar({ length: 255 }),
    categoria: varchar({ length: 255 }),
    plano: varchar({ length: 255 }),
    acomodacao: varchar({ length: 255 }),
    entrada: timestamp(),
    saida: timestamp(),
    alta: timestamp(),
    dataDefinitivo: timestamp(),
    competencia: varchar({ length: 20 }),
    setorEntrada: varchar({ length: 255 }),
    dataEtapa: timestamp(),
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    usuarioEtapa: varchar({ length: 100 }),
    motivoDevolucao: text(),
    statusConta: varchar({ length: 30 }),
    protocolo: varchar({ length: 100 }),
    nomeProtocolo: varchar({ length: 255 }),
    titulo: varchar({ length: 100 }),
    atendimento: varchar({ length: 100 }),
    conta: varchar({ length: 100 }),
    autorizacao: varchar({ length: 100 }),
    matricula: varchar({ length: 100 }),
    paciente: varchar({ length: 255 }),
    tipoGuia: varchar({ length: 50 }),
    codigoProcedimento: varchar({ length: 100 }),
    procedimento: varchar({ length: 500 }),
    medico: varchar({ length: 255 }),
    valorConta: decimal({ precision: 18, scale: 2 }),
    statusValidacao: varchar({ length: 20 }).notNull().default("valido"),
    erroValidacao: text(),
    hashConteudo: varchar({ length: 64 }).notNull(),
    criadoEm: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    loteLinhaUnique: uniqueIndex("uq_tasy_stage_lote_linha").on(table.loteId, table.linhaArquivo),
    loteIdx: index("idx_tasy_stage_lote").on(table.loteId),
    estabelecimentoStatusIdx: index("idx_tasy_stage_estab_status").on(table.estabelecimentoId, table.statusValidacao),
    origemIdx: index("idx_tasy_stage_origem").on(table.estabelecimentoId, table.origemId),
  })
);

// TASY - Registros rejeitados sem exposição de dados clínicos
export const tasyIntegracaoQuarentena = mysqlTable(
  "tasy_integracao_quarentena",
  {
    id: int().primaryKey().autoincrement(),
    loteId: int().notNull(),
    estabelecimentoId: int().notNull(),
    linhaArquivo: int().notNull(),
    codigoErro: varchar({ length: 80 }).notNull(),
    detalhe: text(),
    referenciaHash: varchar({ length: 64 }).notNull(),
    criadoEm: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    loteIdx: index("idx_tasy_quarentena_lote").on(table.loteId),
    estabelecimentoIdx: index("idx_tasy_quarentena_estab").on(table.estabelecimentoId),
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
    configId: int(),
    ultimoLoteId: int(),
    origemAtualizadaEm: timestamp(),
    statusConta: varchar({ length: 30 }),
    ativoNaFonte: boolean().notNull().default(true),
    hashConteudo: varchar({ length: 64 }),
    
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
    procedimentoDescricao: varchar({ length: 500 }),
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
    estabelecimentoOrigemUnique: uniqueIndex("uq_atend_estab_origem").on(table.estabelecimentoId, table.origemSistema, table.origemId),
    origemSistemaIdx: index("idx_atend_origem_sistema").on(table.origemSistema),
    origemIdIdx: index("idx_atend_origem_id").on(table.origemId),
    estabelecimentoIdx: index("idx_atend_estab").on(table.estabelecimentoId),
    dataEntradaIdx: index("idx_atend_data_entrada").on(table.data_entrada),
    estabelecimentoOrigemAtivoIdx: index("idx_atend_estab_origem_ativo").on(table.estabelecimentoId, table.origemSistema, table.ativoNaFonte),
    estabelecimentoEtapaIdx: index("idx_atend_estab_etapa").on(table.estabelecimentoId, table.etapaConta),
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
 * CAMADA 3: STAGING GENÉRICO - ATENDIMENTOS PARADOS
 *
 * Zona de pouso normalizada para atendimentos parados de QUALQUER sistema de origem
 * (tasy, tasy_hemolabor, WARLEINE, EASYVISION, ...), por estabelecimento.
 *
 * Substitui os caminhos de transformação bespoke, um por origem, que geravam `origemId`
 * instável e obrigavam a limpar a tabela antes de cada carga. Aqui:
 *
 *   - `origemId` é a chave estável na origem e NUNCA deriva de `id` de staging;
 *   - o índice único torna a carga idempotente: recarregar o mesmo lote não duplica;
 *   - `loteRef` identifica a carga, permitindo publicar sem apagar staging;
 *   - `statusValidacao` permite reter a linha na staging sem publicá-la.
 *
 * A publicação (`server/atendimentosParadosService.ts`) faz upsert em
 * `atendimentos_unificados` pelo índice único `uq_atend_estab_origem` e desativa
 * (`ativoNaFonte = 0`) o que não veio no lote atual — sem DELETE e sem TRUNCATE.
 *
 * Nenhuma coluna de `atendimentos_unificados` é alterada por esta camada.
 */
export const atendimentosParadosStaging = mysqlTable(
  "atendimentos_parados_staging",
  {
    id: int().primaryKey().autoincrement(),

    // ===== Rastreamento da origem =====
    estabelecimentoId: int().notNull(),
    origemSistema: varchar({ length: 50 }).notNull(), // gravar em minúsculo para tasy/tasy_hemolabor
    origemId: varchar({ length: 255 }).notNull(), // CHAVE ESTÁVEL na origem (não usar id de staging)
    loteRef: varchar({ length: 50 }).notNull(), // referência do lote/carga que trouxe esta linha
    hashConteudo: varchar({ length: 64 }), // SHA-256 do conteúdo, para detectar linha inalterada
    statusValidacao: varchar({ length: 20 }).notNull().default("valido"), // valido | aviso | rejeitado
    motivoRejeicao: text(), // motivo quando statusValidacao = rejeitado

    // ===== Identificação do atendimento =====
    numeroAtendimento: varchar({ length: 100 }).notNull(),
    paciente: varchar({ length: 255 }),
    convenio: varchar({ length: 255 }),
    matricula: varchar({ length: 100 }),
    conta: varchar({ length: 50 }),
    autorizacao: varchar({ length: 100 }),

    // ===== Datas =====
    dataEntrada: timestamp(),
    dataSaida: timestamp(),
    dataEtapa: timestamp(),

    // ===== Classificação =====
    tipoAtendimento: varchar({ length: 50 }),
    descricaoAtendimento: varchar({ length: 255 }),
    codigoServico: varchar({ length: 100 }),
    codigoProcedimento: varchar({ length: 500 }),
    setorEntrada: varchar({ length: 255 }),

    // ===== Situação da conta =====
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    usuarioEtapa: varchar({ length: 100 }),
    competencia: varchar({ length: 20 }),
    protocolo: varchar({ length: 255 }),
    titulo: varchar({ length: 100 }),

    // ===== Dados clínicos / financeiros =====
    medicoResponsavel: varchar({ length: 255 }),
    valorConta: decimal({ precision: 15, scale: 2 }),

    // ===== Metadados =====
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  },
  (table) => ({
    estabelecimentoOrigemIdx: index("idx_atend_parados_estab_origem").on(table.estabelecimentoId, table.origemSistema),
    loteIdx: index("idx_atend_parados_lote").on(table.estabelecimentoId, table.origemSistema, table.loteRef),
    numeroAtendimentoIdx: index("idx_atend_parados_numatend").on(table.numeroAtendimento),
    origemIdIdx: index("idx_atend_parados_origem_id").on(table.origemId),
    statusValidacaoIdx: index("idx_atend_parados_status").on(table.statusValidacao),
    // Torna a carga idempotente: recarregar o mesmo atendimento atualiza, não duplica.
    origemUnica: uniqueIndex("uq_atend_parados_estab_origem_id").on(
      table.estabelecimentoId,
      table.origemSistema,
      table.origemId,
    ),
  })
);

export type AtendimentoParadoStaging = typeof atendimentosParadosStaging.$inferSelect;
export type InsertAtendimentoParadoStaging = typeof atendimentosParadosStaging.$inferInsert;

/**
 * CAMADA 3 (v2): STAGING DE ATENDIMENTOS PARADOS - UMA TABELA POR UNIDADE
 *
 * Decisão de desenho: cada unidade passa a ter a sua própria tabela de pouso, em vez de uma
 * tabela única com coluna de estabelecimento. Cada unidade tem a sua rotina de extração, e
 * assim a recarga de uma unidade nunca alcança o dado de outra.
 *
 * Custo aceito: unidade nova significa tabela nova + migração nova.
 *
 * Todas as tabelas compartilham exatamente as mesmas colunas, geradas pela mesma fábrica.
 * O nome físico é o informado pela equipe e é preservado literalmente.
 *
 * A publicação (`server/atendimentosParadosService.ts`) faz upsert em
 * `atendimentos_unificados` pelo índice único `uq_atend_estab_origem` e desativa
 * (`ativoNaFonte = 0`) o que não veio no lote atual — sem DELETE e sem TRUNCATE.
 */
function colunasStagingAtendimentosParados() {
  return {
    id: int().primaryKey().autoincrement(),

    // ===== Rastreamento da origem =====
    estabelecimentoId: int().notNull(),
    origemSistema: varchar({ length: 50 }).notNull(), // tasy/tasy_hemolabor em minúsculo
    origemId: varchar({ length: 255 }).notNull(), // CHAVE ESTÁVEL na origem
    loteRef: varchar({ length: 50 }).notNull(), // carga que trouxe esta linha
    hashConteudo: varchar({ length: 64 }), // SHA-256 do conteúdo, para detectar linha inalterada
    statusValidacao: varchar({ length: 20 }).notNull().default("valido"), // valido | aviso | rejeitado
    motivoRejeicao: text(),

    // ===== Identificação do atendimento =====
    numeroAtendimento: varchar({ length: 100 }).notNull(),
    paciente: varchar({ length: 255 }),
    convenio: varchar({ length: 255 }),
    matricula: varchar({ length: 100 }),
    conta: varchar({ length: 50 }),
    autorizacao: varchar({ length: 100 }),

    // ===== Datas =====
    dataEntrada: timestamp(),
    dataSaida: timestamp(),
    dataEtapa: timestamp(),

    // ===== Classificação =====
    tipoAtendimento: varchar({ length: 50 }),
    descricaoAtendimento: varchar({ length: 255 }),
    codigoServico: varchar({ length: 100 }),
    codigoProcedimento: varchar({ length: 500 }),
    setorEntrada: varchar({ length: 255 }),

    // ===== Situação da conta =====
    etapaConta: varchar({ length: 255 }),
    setorEtapa: varchar({ length: 255 }),
    usuarioEtapa: varchar({ length: 100 }),
    competencia: varchar({ length: 20 }),
    protocolo: varchar({ length: 255 }),
    titulo: varchar({ length: 100 }),

    // ===== Dados clínicos / financeiros =====
    medicoResponsavel: varchar({ length: 255 }),
    valorConta: decimal({ precision: 15, scale: 2 }),

    // ===== Metadados =====
    dataSincronizacao: timestamp().defaultNow(),
    criadoEm: timestamp().defaultNow(),
    atualizadoEm: timestamp().defaultNow(),
  };
}

/**
 * Cria uma tabela de staging de atendimentos parados.
 * `nomeFisico` é o nome da tabela no banco; `sufixoIndice` compõe nomes de índice únicos,
 * exigência do MySQL, que exige nome de índice único por base.
 */
function criarTabelaStagingAtendimentosParados(nomeFisico: string, sufixoIndice: string) {
  return mysqlTable(nomeFisico, colunasStagingAtendimentosParados(), (table) => ({
    estabelecimentoOrigemIdx: index(`idx_${sufixoIndice}_estab_origem`).on(table.estabelecimentoId, table.origemSistema),
    loteIdx: index(`idx_${sufixoIndice}_lote`).on(table.loteRef),
    numeroAtendimentoIdx: index(`idx_${sufixoIndice}_numatend`).on(table.numeroAtendimento),
    statusIdx: index(`idx_${sufixoIndice}_status`).on(table.statusValidacao),
    // Torna a carga idempotente: recarregar o mesmo atendimento atualiza, não duplica.
    origemUnica: uniqueIndex(`uq_${sufixoIndice}_origem`).on(
      table.estabelecimentoId,
      table.origemSistema,
      table.origemId,
    ),
  }));
}

/** Staging de atendimentos parados — UROLÓGICO. */
export const stagingAtendimentosParadosUrologico = criarTabelaStagingAtendimentosParados(
  "stagion_atendimentos_parados_urologico",
  "atend_parados_urologico",
);

/** Staging normalizada IAD preservada pela 0134; o Hop usa a tabela bruta abaixo. */
export const stagingAtendimentosParadosIad = criarTabelaStagingAtendimentosParados(
  "stagion_atendimentos_parados_iad_normalizada",
  "atend_parados_iad",
);

/** Staging de atendimentos parados — IRG. */
export const stagingAtendimentosParadosIrg = criarTabelaStagingAtendimentosParados(
  "stagion_atendimentos_parados_irg",
  "atend_parados_irg",
);

/** Staging de atendimentos parados — HEMOLABOR. */
export const stagingAtendimentosParadosHemolabor = criarTabelaStagingAtendimentosParados(
  "stagion_atendimentos_parados_hemolabor",
  "atend_parados_hemolabor",
);

/** Staging de atendimentos parados — MATERNIDADE. */
export const stagingAtendimentosParadosMaternidade = criarTabelaStagingAtendimentosParados(
  "stagion_atendimentos_parados_materniadeela",
  "atend_parados_materniadeela",
);

/** Tipo comum às tabelas de staging por unidade (todas têm as mesmas colunas). */
export type TabelaStagingAtendimentosParados = ReturnType<typeof criarTabelaStagingAtendimentosParados>;

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
    codigoPrestador: varchar("codigo_prestador", { length: 50 }),
    
    // Competência (mês/ano de referência)
    mesAno: varchar("mes_ano", { length: 10 }).notNull(), // formato: "YYYY/MM" (ex: "2025/01")
    
    // Valores financeiros
    valorFaturado: decimal("valor_faturado", { precision: 14, scale: 2 }).default("0"),
    valorRecebido: decimal("valor_recebido", { precision: 14, scale: 2 }).default("0"),
    valorGlosado: decimal("valor_glosado", { precision: 14, scale: 2 }).default("0"),
    
    // Metadados de importação
    arquivoOrigem: varchar("arquivo_origem", { length: 500 }),
    origem: varchar({ length: 20 }).default("excel").notNull(),
    observacao: text(),
    importadoPor: int("importado_por"),
    importadoPorNome: varchar("importado_por_nome", { length: 255 }),
    atualizadoPor: int("atualizado_por"),
    atualizadoPorNome: varchar("atualizado_por_nome", { length: 255 }),
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

/** Pouso bruto Hop IAD: mesmas 13 colunas físicas do Urológico. Não usa o publicador normalizado.
 * ID da unidade deve vir do cadastro IAD, nunca copiar o valor da unidade Urológico.
 * O layout bruto preserva linhas repetidas e não prova conclusão do lote.
 */
export const stagingAtendimentosParadosIadHop = mysqlTable(
  "stagion_atendimentos_parados_iad",
  {
    numatend: int("numatend"),
    codtipsai: varchar("codtipsai", { length: 2 }),
    nomeplaco: varchar("nomeplaco", { length: 30 }),
    nomepac: varchar("nomepac", { length: 50 }),
    carater: varchar("carater", { length: 2 }),
    datatend: datetime("datatend", { mode: "string" }),
    datasai: datetime("datasai", { mode: "string" }),
    tipoatend: char("tipoatend", { length: 1 }),
    codserv: varchar("codserv", { length: 30 }),
    procprin: varchar("procprin", { length: 10 }),
    codcc_destino: varchar("codcc_destino", { length: 6 }),
    tipoatendimentodescricao: longtext("tipoatendimentodescricao"),
    Estabelecimentos_id: tinytext("Estabelecimentos_id"),
  },
);

/** Pouso financeiro Hop IAD: mesmas 43 colunas físicas do Urológico após 0133. Sem publicação automática.
 * ID da unidade deve vir do cadastro IAD, nunca copiar o valor da unidade Urológico.
 * O layout bruto preserva linhas repetidas e não prova conclusão do lote.
 */
export const stagingFaturadoRecebidoIad = mysqlTable(
  "stagion_faturado_recebido_iad",
  {
    nomeconv: varchar("nomeconv", { length: 30 }),
    codconv: varchar("codconv", { length: 4 }),
    mesprod: varchar("mesprod", { length: 7 }),
    numfatura: int("numfatura"),
    codrecur: varchar("codrecur", { length: 3 }),
    tipoproc: char("tipoproc", { length: 1 }),
    protocolo: varchar("protocolo", { length: 20 }),
    numconta: bigint("numconta", { mode: "bigint" }),
    guiacobra: varchar("guiacobra", { length: 20 }),
    aihguia: varchar("aihguia", { length: 50 }),
    descricao: varchar("descricao", { length: 60 }),
    matricula: varchar("matricula", { length: 35 }),
    data: datetime("data", { mode: "string" }),
    dataint: datetime("dataint", { mode: "string" }),
    datasai: datetime("datasai", { mode: "string" }),
    procdisco: varchar("procdisco", { length: 10 }),
    codproprio: varchar("codproprio", { length: 10 }),
    codgrufi: varchar("codgrufi", { length: 3 }),
    descricao_1: varchar("descricao_1", { length: 65 }),
    funcaotiss: varchar("funcaotiss", { length: 2 }),
    receber: char("receber", { length: 1 }),
    codcc: varchar("codcc", { length: 6 }),
    nomecc: varchar("nomecc", { length: 45 }),
    prestexe: varchar("prestexe", { length: 6 }),
    nomeprest: varchar("nomeprest", { length: 250 }),
    quantidade: decimal("quantidade", { precision: 15, scale: 4 }),
    vl_faturado: decimal("vl_faturado", { precision: 15, scale: 2 }),
    vl_recebido: decimal("vl_recebido", { precision: 15, scale: 2 }),
    vl_receb_a_maior: decimal("vl_receb_a_maior", { precision: 15, scale: 2 }),
    vl_total_recebido: decimal("vl_total_recebido", { precision: 15, scale: 2 }),
    vl_aberto: decimal("vl_aberto", { precision: 15, scale: 2 }),
    vl_glosas: decimal("vl_glosas", { precision: 15, scale: 2 }),
    gl_recurso: decimal("gl_recurso", { precision: 15, scale: 2 }),
    gl_aceita: decimal("gl_aceita", { precision: 15, scale: 2 }),
    gl_analise: decimal("gl_analise", { precision: 15, scale: 2 }),
    gl_recuperada: decimal("gl_recuperada", { precision: 15, scale: 2 }),
    codtiss: varchar("codtiss", { length: 4 }),
    descmotivo: varchar("descmotivo", { length: 100 }),
    codrecur_1: varchar("codrecur_1", { length: 3 }),
    complrecur: text("complrecur"),
    tipoatend: char("tipoatend", { length: 1 }),
    vl_unitario: decimal("vl_unitario", { precision: 15, scale: 4 }),
    estabelecimentos_id: varchar("estabelecimentos_id", { length: 100 }),
  },
);

export * from "./schema-banco";
