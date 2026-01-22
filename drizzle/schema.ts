import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }), // Senha criptografada com bcrypt
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Estabelecimentos (Hospitals/Clinics)
 */
export const estabelecimentos = mysqlTable("estabelecimentos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }),
  endereco: text("endereco"),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Estabelecimento = typeof estabelecimentos.$inferSelect;
export type InsertEstabelecimento = typeof estabelecimentos.$inferInsert;

/**
 * Convênios (Insurance/Health Plans)
 */
export const convenios = mysqlTable("convenios", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  codigo: varchar("codigo", { length: 50 }),
  estabelecimentoId: int("estabelecimentoId"), // Null = convênio disponível para todos os estabelecimentos
  prazoRecursoGlosa: int("prazoRecursoGlosa").default(30), // Prazo em dias para recurso de glosa
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Convenio = typeof convenios.$inferSelect;
export type InsertConvenio = typeof convenios.$inferInsert;

/**
 * Arquivos enviados e recebidos
 */
export const arquivos = mysqlTable("arquivos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipoArquivo: mysqlEnum("tipoArquivo", ["xml", "excel", "pdf", "csv"]).notNull(),
  direcao: mysqlEnum("direcao", ["enviado", "retornado"]).notNull(),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  userId: int("userId").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: text("s3Url").notNull(),
  tamanho: int("tamanho"),
  status: mysqlEnum("status", ["pendente", "processado", "erro", "processando"]).default("pendente").notNull(),
  progresso: int("progresso").default(0), // Percentual de progresso (0-100)
  totalItens: int("totalItens"), // Total de itens a processar
  itensProcessados: int("itensProcessados").default(0), // Itens já processados
  dataReferencia: timestamp("dataReferencia"),
  dataPagamento: timestamp("dataPagamento"), // Data de pagamento do convênio (opcional, para calcular prazo de recurso)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Arquivo = typeof arquivos.$inferSelect;
export type InsertArquivo = typeof arquivos.$inferInsert;

/**
 * Procedimentos extraídos dos arquivos
 */
export const procedimentos = mysqlTable("procedimentos", {
  id: int("id").autoincrement().primaryKey(),
  arquivoId: int("arquivoId").notNull(),
  // Chave composta para identificar faturamento único (evita duplicação)
  numeroLote: varchar("numeroLote", { length: 50 }), // Número do lote do cabeçalho TISS
  sequencialTransacao: varchar("sequencialTransacao", { length: 50 }), // Sequencial da transação da guia
  codigo: varchar("codigo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  quantidade: int("quantidade").default(1),
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }),
  valorGlosado: decimal("valorGlosado", { precision: 10, scale: 2 }),
  motivoGlosa: text("motivoGlosa"),
  dataExecucao: timestamp("dataExecucao"),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  pacienteCarteirinha: varchar("pacienteCarteirinha", { length: 100 }),
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  senha: varchar("senha", { length: 100 }), // Senha da autorização
  nomeMedico: varchar("nomeMedico", { length: 255 }),
  crmMedico: varchar("crmMedico", { length: 50 }),
  // Código de despesa ANS (define o tipo do item)
  codigoDespesa: varchar("codigoDespesa", { length: 10 }),
  // Tipo de despesa derivado do codigoDespesa (1=gás, 2=medicamento, 3=material, 5=diária, 7=taxa, outros=procedimento)
  tipoDespesa: mysqlEnum("tipoDespesa", [
    "gas",
    "medicamento",
    "material",
    "diaria",
    "taxa",
    "procedimento",
    "outros"
  ]).default("procedimento"),
  dadosExtras: json("dadosExtras"),
  // Status de recurso de glosa
  recursoStatus: mysqlEnum("recursoStatus", [
    "sem_recurso",      // Nenhum recurso criado
    "recurso_criado",   // Recurso criado (rascunho ou pendente)
    "recurso_enviado",  // Recurso enviado ao convênio
    "recurso_deferido", // Recurso deferido
    "recurso_indeferido" // Recurso indeferido
  ]).default("sem_recurso"),
  recursoId: int("recursoId"), // ID do recurso associado
  // Classificação da glosa (aceita ou recursar)
  classificacaoGlosa: mysqlEnum("classificacaoGlosa", [
    "pendente",        // Ainda não classificada
    "aceitar",         // Glosa aceita (sem recurso)
    "recursar",        // Glosa deve ser recursada
    "auto_aceitar",    // Aceita automaticamente pelo sistema (aprendizado)
    "auto_recursar"    // Recursada automaticamente pelo sistema (aprendizado)
  ]).default("pendente"),
  classificacaoConfianca: int("classificacaoConfianca"), // Percentual de confiança (0-100) para classificações automáticas
  classificacaoMotivo: text("classificacaoMotivo"), // Motivo da classificação (manual ou automática)
  motivoAceite: text("motivoAceite"), // Motivo informado pelo funcionário ao aceitar a glosa
  dataAceite: timestamp("dataAceite"), // Data em que a glosa foi aceita
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Procedimento = typeof procedimentos.$inferSelect;
export type InsertProcedimento = typeof procedimentos.$inferInsert;

/**
 * Comparações entre arquivos enviados e retornados
 */
export const comparacoes = mysqlTable("comparacoes", {
  id: int("id").autoincrement().primaryKey(),
  arquivoEnviadoId: int("arquivoEnviadoId").notNull(),
  arquivoRetornadoId: int("arquivoRetornadoId").notNull(),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pendente", "concluida", "erro"]).default("pendente").notNull(),
  totalItensEnviados: int("totalItensEnviados").default(0),
  totalItensRetornados: int("totalItensRetornados").default(0),
  totalDivergencias: int("totalDivergencias").default(0),
  valorTotalEnviado: decimal("valorTotalEnviado", { precision: 12, scale: 2 }),
  valorTotalRetornado: decimal("valorTotalRetornado", { precision: 12, scale: 2 }),
  diferencaValor: decimal("diferencaValor", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comparacao = typeof comparacoes.$inferSelect;
export type InsertComparacao = typeof comparacoes.$inferInsert;

/**
 * Divergências encontradas nas comparações
 */
export const divergencias = mysqlTable("divergencias", {
  id: int("id").autoincrement().primaryKey(),
  comparacaoId: int("comparacaoId").notNull(),
  tipo: mysqlEnum("tipo", ["valor", "quantidade", "ausente_retorno", "ausente_envio", "dados"]).notNull(),
  procedimentoEnviadoId: int("procedimentoEnviadoId"),
  procedimentoRetornadoId: int("procedimentoRetornadoId"),
  campo: varchar("campo", { length: 100 }),
  valorEnviado: text("valorEnviado"),
  valorRetornado: text("valorRetornado"),
  diferenca: decimal("diferenca", { precision: 10, scale: 2 }),
  descricao: text("descricao"),
  motivoGlosa: varchar("motivoGlosa", { length: 255 }),
  categoriaGlosa: mysqlEnum("categoriaGlosa", [
    "valor_divergente",
    "procedimento_nao_autorizado",
    "documentacao_incompleta",
    "prazo_excedido",
    "duplicidade",
    "codigo_invalido",
    "quantidade_excedente",
    "paciente_nao_elegivel",
    "outros"
  ]),
  resolvido: mysqlEnum("resolvido", ["sim", "nao"]).default("nao").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Divergencia = typeof divergencias.$inferSelect;
export type InsertDivergencia = typeof divergencias.$inferInsert;

/**
 * Códigos de procedimentos configuráveis (tabela de referência)
 */
export const codigosProcedimentos = mysqlTable("codigosProcedimentos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 50 }).notNull().unique(),
  descricao: text("descricao").notNull(),
  valorReferencia: decimal("valorReferencia", { precision: 10, scale: 2 }),
  categoria: varchar("categoria", { length: 100 }),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CodigoProcedimento = typeof codigosProcedimentos.$inferSelect;
export type InsertCodigoProcedimento = typeof codigosProcedimentos.$inferInsert;

/**
 * Campos de comparação configuráveis
 */
export const camposComparacao = mysqlTable("camposComparacao", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  campoOrigem: varchar("campoOrigem", { length: 100 }).notNull(),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  obrigatorio: mysqlEnum("obrigatorio", ["sim", "nao"]).default("nao").notNull(),
  tolerancia: decimal("tolerancia", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampoComparacao = typeof camposComparacao.$inferSelect;
export type InsertCampoComparacao = typeof camposComparacao.$inferInsert;

/**
 * Itens manuais adicionados pelo usuário
 */
export const itensManuals = mysqlTable("itensManuals", {
  id: int("id").autoincrement().primaryKey(),
  arquivoId: int("arquivoId"),
  comparacaoId: int("comparacaoId"),
  userId: int("userId").notNull(),
  codigo: varchar("codigo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  quantidade: int("quantidade").default(1),
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }),
  observacao: text("observacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItemManual = typeof itensManuals.$inferSelect;
export type InsertItemManual = typeof itensManuals.$inferInsert;

/**
 * Recursos de Glosa - Contestações enviadas aos convênios
 */
/**
 * Lotes de Recursos de Glosa - Agrupamento de recursos enviados juntos
 */
export const lotesRecurso = mysqlTable("lotesRecurso", {
  id: int("id").autoincrement().primaryKey(),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  userId: int("userId").notNull(),
  
  // Identificação do lote
  numeroLote: varchar("numeroLote", { length: 50 }).notNull(),
  descricao: text("descricao"),
  
  // Valores totalizados
  valorTotalGlosado: decimal("valorTotalGlosado", { precision: 12, scale: 2 }).default("0"),
  valorTotalRecursado: decimal("valorTotalRecursado", { precision: 12, scale: 2 }).default("0"),
  valorTotalRecuperado: decimal("valorTotalRecuperado", { precision: 12, scale: 2 }).default("0"),
  quantidadeItens: int("quantidadeItens").default(0),
  
  // Status e datas
  status: mysqlEnum("status", [
    "rascunho",
    "pendente_envio",
    "enviado",
    "em_analise",
    "respondido",
    "finalizado"
  ]).default("rascunho").notNull(),
  
  dataEnvio: timestamp("dataEnvio"),
  dataPrazoPagamento: timestamp("dataPrazoPagamento"),
  dataPrazoResposta: timestamp("dataPrazoResposta"), // Prazo para resposta do convênio
  dataResposta: timestamp("dataResposta"),
  
  // Protocolo e anexos
  protocoloEnvio: varchar("protocoloEnvio", { length: 100 }),
  anexoPdfUrl: text("anexoPdfUrl"), // URL do PDF de envio do recurso
  anexoPdfKey: varchar("anexoPdfKey", { length: 512 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LoteRecurso = typeof lotesRecurso.$inferSelect;
export type InsertLoteRecurso = typeof lotesRecurso.$inferInsert;

export const recursosGlosa = mysqlTable("recursosGlosa", {
  id: int("id").autoincrement().primaryKey(),
  divergenciaId: int("divergenciaId"),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  loteId: int("loteId"), // Referência ao lote de envio
  userId: int("userId").notNull(),
  
  // Dados do procedimento contestado
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  descricaoProcedimento: text("descricaoProcedimento"),
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  pacienteCarteirinha: varchar("pacienteCarteirinha", { length: 100 }),
  
  // Valores
  valorCobrado: decimal("valorCobrado", { precision: 10, scale: 2 }),
  valorGlosado: decimal("valorGlosado", { precision: 10, scale: 2 }),
  valorRecuperado: decimal("valorRecuperado", { precision: 10, scale: 2 }),
  
  // Justificativa e recurso
  motivoGlosaConvenio: text("motivoGlosaConvenio"),
  justificativaRecurso: text("justificativaRecurso").notNull(),
  documentosAnexos: json("documentosAnexos"),
  
  // Status e datas
  status: mysqlEnum("status", [
    "rascunho",
    "pendente_envio",
    "enviado",
    "em_analise",
    "deferido",
    "deferido_parcial",
    "indeferido",
    "cancelado"
  ]).default("rascunho").notNull(),
  
  prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta", "urgente"]).default("media").notNull(),
  
  dataGlosa: timestamp("dataGlosa"),
  dataEnvioRecurso: timestamp("dataEnvioRecurso"),
  dataPrazoResposta: timestamp("dataPrazoResposta"),
  dataResposta: timestamp("dataResposta"),
  
  protocoloRecurso: varchar("protocoloRecurso", { length: 100 }),
  respostaConvenio: text("respostaConvenio"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecursoGlosa = typeof recursosGlosa.$inferSelect;
export type InsertRecursoGlosa = typeof recursosGlosa.$inferInsert;

/**
 * Histórico de interações dos recursos de glosa
 */
export const historicoRecursos = mysqlTable("historicoRecursos", {
  id: int("id").autoincrement().primaryKey(),
  recursoId: int("recursoId").notNull(),
  userId: int("userId").notNull(),
  
  tipo: mysqlEnum("tipo", [
    "criacao",
    "edicao",
    "envio",
    "resposta_convenio",
    "anexo_adicionado",
    "status_alterado",
    "comentario",
    "lembrete"
  ]).notNull(),
  
  statusAnterior: varchar("statusAnterior", { length: 50 }),
  statusNovo: varchar("statusNovo", { length: 50 }),
  
  descricao: text("descricao").notNull(),
  dadosExtras: json("dadosExtras"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoRecurso = typeof historicoRecursos.$inferSelect;
export type InsertHistoricoRecurso = typeof historicoRecursos.$inferInsert;

/**
 * Histórico de Contestações de Glosa - Registra argumentos usados e resultados
 * para aprendizado de IA e sugestões automáticas
 */
export const historicoContestacoes = mysqlTable("historicoContestacoes", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referências
  recursoId: int("recursoId"),
  convenioId: int("convenioId").notNull(),
  userId: int("userId").notNull(),
  
  // Código de glosa TISS
  codigoGlosa: varchar("codigoGlosa", { length: 20 }).notNull(),
  descricaoGlosa: text("descricaoGlosa"),
  
  // Dados do procedimento
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  descricaoProcedimento: text("descricaoProcedimento"),
  
  // Valores envolvidos
  valorGlosado: decimal("valorGlosado", { precision: 10, scale: 2 }),
  valorRecuperado: decimal("valorRecuperado", { precision: 10, scale: 2 }),
  
  // Argumento utilizado
  argumentoUtilizado: text("argumentoUtilizado").notNull(),
  argumentoOrigem: mysqlEnum("argumentoOrigem", [
    "dicionario",      // Veio do dicionário padrão
    "ia_sugestao",     // Sugerido pela IA
    "manual",          // Digitado manualmente
    "historico"        // Copiado de outro recurso
  ]).default("manual").notNull(),
  
  // Documentos anexados
  documentosAnexados: json("documentosAnexados"),
  
  // Resultado da contestação
  resultado: mysqlEnum("resultado", [
    "pendente",
    "deferido",
    "deferido_parcial",
    "indeferido"
  ]).default("pendente").notNull(),
  
  // Feedback para aprendizado
  argumentoEfetivo: mysqlEnum("argumentoEfetivo", ["sim", "nao", "parcial"]),
  feedbackUsuario: text("feedbackUsuario"),
  
  // Métricas para IA
  taxaSucessoCalculada: decimal("taxaSucessoCalculada", { precision: 5, scale: 2 }),
  
  dataContestacao: timestamp("dataContestacao").defaultNow().notNull(),
  dataResultado: timestamp("dataResultado"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HistoricoContestacao = typeof historicoContestacoes.$inferSelect;
export type InsertHistoricoContestacao = typeof historicoContestacoes.$inferInsert;

/**
 * Argumentos personalizados por convênio - Argumentos que funcionaram melhor para cada convênio
 */
export const argumentosConvenio = mysqlTable("argumentosConvenio", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId").notNull(),
  codigoGlosa: varchar("codigoGlosa", { length: 20 }).notNull(),
  
  // Argumento customizado para este convênio
  argumentoCustomizado: text("argumentoCustomizado").notNull(),
  
  // Estatísticas
  vezesUtilizado: int("vezesUtilizado").default(0),
  vezesDeferido: int("vezesDeferido").default(0),
  vezesIndeferido: int("vezesIndeferido").default(0),
  taxaSucesso: decimal("taxaSucesso", { precision: 5, scale: 2 }),
  
  // Ativo
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ArgumentoConvenio = typeof argumentosConvenio.$inferSelect;
export type InsertArgumentoConvenio = typeof argumentosConvenio.$inferInsert;

/**
 * Regras de Conciliação por Convênio - Configurações específicas para cada convênio
 */
export const regrasConciliacao = mysqlTable("regrasConciliacao", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId").notNull().unique(),
  
  // Comportamento para itens não encontrados no retorno
  itensNaoEncontrados: mysqlEnum("itensNaoEncontrados", [
    "glosado",      // Considerar como glosado (padrão)
    "pago",         // Considerar como pago (ex: Bradesco)
    "divergente"    // Marcar como divergente para análise manual
  ]).default("glosado").notNull(),
  
  // Tolerância de diferença de valores (em reais)
  toleranciaValor: decimal("toleranciaValor", { precision: 10, scale: 2 }).default("0.00"),
  
  // Tolerância percentual de diferença
  toleranciaPercentual: decimal("toleranciaPercentual", { precision: 5, scale: 2 }).default("0.00"),
  
  // Campos para comparação (quais campos usar para match)
  usarCodigo: mysqlEnum("usarCodigo", ["sim", "nao"]).default("sim").notNull(),
  usarGuia: mysqlEnum("usarGuia", ["sim", "nao"]).default("sim").notNull(),
  usarData: mysqlEnum("usarData", ["sim", "nao"]).default("nao").notNull(),
  usarPaciente: mysqlEnum("usarPaciente", ["sim", "nao"]).default("nao").notNull(),
  
  // Formato do arquivo de retorno esperado
  formatoRetorno: mysqlEnum("formatoRetorno", [
    "excel_completo",    // Excel com todos os itens (pagos e glosados)
    "excel_glosas",      // Excel só com glosas (ex: Bradesco)
    "xml_tiss",          // XML padrão TISS
    "csv",               // CSV
    "pdf"                // PDF
  ]).default("excel_completo").notNull(),
  
  // Prazo padrão para recurso (em dias)
  prazoRecursoDias: int("prazoRecursoDias").default(30),
  
  // Observações
  observacoes: text("observacoes"),
  
  // Ativo
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RegraConciliacao = typeof regrasConciliacao.$inferSelect;
export type InsertRegraConciliacao = typeof regrasConciliacao.$inferInsert;

/**
 * Decisões de Glosa - Histórico de decisões (aceitar/recursar) para aprendizado automático
 */
export const decisoesGlosa = mysqlTable("decisoesGlosa", {
  id: int("id").autoincrement().primaryKey(),
  
  // Identificadores da glosa
  convenioId: int("convenioId").notNull(),
  codigoGlosa: varchar("codigoGlosa", { length: 20 }).notNull(),
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  tipoProcedimento: varchar("tipoProcedimento", { length: 50 }), // mat_med, exames, procedimentos, outros
  
  // Decisão tomada
  decisao: mysqlEnum("decisao", ["aceitar", "recursar"]).notNull(),
  
  // Resultado (se foi recursado)
  resultadoRecurso: mysqlEnum("resultadoRecurso", [
    "pendente",
    "deferido",
    "deferido_parcial",
    "indeferido"
  ]),
  
  // Valores
  valorGlosado: decimal("valorGlosado", { precision: 10, scale: 2 }),
  valorRecuperado: decimal("valorRecuperado", { precision: 10, scale: 2 }),
  
  // Motivo da decisão (para aprendizado)
  motivoDecisao: text("motivoDecisao"),
  
  // Referência ao procedimento original
  procedimentoId: int("procedimentoId"),
  recursoId: int("recursoId"),
  
  // Usuário que tomou a decisão
  userId: int("userId").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DecisaoGlosa = typeof decisoesGlosa.$inferSelect;
export type InsertDecisaoGlosa = typeof decisoesGlosa.$inferInsert;


/**
 * Tabelas de Preços por Convênio - Diárias, Mat-Med, Taxas, Procedimentos
 */
export const tabelasPreco = mysqlTable("tabelasPreco", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId"), // Null = tabela disponível para todos os estabelecimentos
  
  // Tipo da tabela
  tipo: mysqlEnum("tipo", [
    "diarias",       // Diárias de apartamento, UTI, etc.
    "mat_med",       // Materiais e medicamentos
    "taxas",         // Taxas diversas
    "procedimentos"  // Procedimentos médicos
  ]).notNull(),
  
  // Dados do item
  codigo: varchar("codigo", { length: 50 }).notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  
  // Vigência
  vigenciaInicio: timestamp("vigenciaInicio").notNull(),
  // Campo vigenciaFim removido conforme solicitação do usuário
  
  // Dados adicionais
  unidade: varchar("unidade", { length: 50 }), // UN, ML, MG, etc.
  observacao: text("observacao"),
  
  // Controle
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TabelaPreco = typeof tabelasPreco.$inferSelect;
export type InsertTabelaPreco = typeof tabelasPreco.$inferInsert;

/**
 * Importações de Tabelas de Preços - Histórico de importações
 */
export const importacoesTabela = mysqlTable("importacoesTabela", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId").notNull(),
  userId: int("userId").notNull(),
  
  // Tipo da tabela importada
  tipo: mysqlEnum("tipo", [
    "diarias",
    "mat_med",
    "taxas",
    "procedimentos"
  ]).notNull(),
  
  // Arquivo importado
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  formatoArquivo: mysqlEnum("formatoArquivo", ["excel", "csv", "dbf"]).notNull(),
  
  // Resultado da importação
  totalItens: int("totalItens").default(0),
  itensImportados: int("itensImportados").default(0),
  itensAtualizados: int("itensAtualizados").default(0),
  itensErro: int("itensErro").default(0),
  
  // Status
  status: mysqlEnum("status", ["processando", "concluido", "erro"]).default("processando").notNull(),
  mensagemErro: text("mensagemErro"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportacaoTabela = typeof importacoesTabela.$inferSelect;
export type InsertImportacaoTabela = typeof importacoesTabela.$inferInsert;

/**
 * Histórico de Alterações de Preços - Rastreia todas as modificações em itens de tabelas de preço
 */
export const historicoPrecos = mysqlTable("historicoPrecos", {
  id: int("id").autoincrement().primaryKey(),
  
  tabelaPrecoId: int("tabelaPrecoId").notNull(),
  userId: int("userId").notNull(),
  
  // Tipo de alteração
  tipoAlteracao: mysqlEnum("tipoAlteracao", [
    "criacao",      // Item criado
    "edicao",       // Item editado
    "exclusao",     // Item excluído
    "importacao"    // Item importado via planilha
  ]).notNull(),
  
  // Valores anteriores (para edição/exclusão)
  valorAnterior: decimal("valorAnterior", { precision: 12, scale: 2 }),
  vigenciaInicioAnterior: timestamp("vigenciaInicioAnterior"),
  nomeAnterior: varchar("nomeAnterior", { length: 255 }),
  codigoAnterior: varchar("codigoAnterior", { length: 50 }),
  
  // Valores novos (para criação/edição)
  valorNovo: decimal("valorNovo", { precision: 12, scale: 2 }),
  vigenciaInicioNovo: timestamp("vigenciaInicioNovo"),
  nomeNovo: varchar("nomeNovo", { length: 255 }),
  codigoNovo: varchar("codigoNovo", { length: 50 }),
  
  // Observação/motivo da alteração
  observacao: text("observacao"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoPreco = typeof historicoPrecos.$inferSelect;
export type InsertHistoricoPreco = typeof historicoPrecos.$inferInsert;

/**
 * Regras de Negócio - Composição de contas
 * Ex: Procedimento X deve ter Taxa de Sala Y, Oxigênio Z, Taxa de Vídeo W
 */
export const regrasNegocio = mysqlTable("regrasNegocio", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId"), // Null = regra geral para todos os convênios
  estabelecimentoId: int("estabelecimentoId"), // Null = regra geral para todos os estabelecimentos
  
  // Nome da regra para identificação
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  
  // Procedimento principal que dispara a regra
  codigoProcedimentoPrincipal: varchar("codigoProcedimentoPrincipal", { length: 50 }).notNull(),
  descricaoProcedimentoPrincipal: varchar("descricaoProcedimentoPrincipal", { length: 255 }),
  
  // Tipo de verificação
  tipoVerificacao: mysqlEnum("tipoVerificacao", [
    "deve_conter",       // A conta DEVE conter os itens obrigatórios
    "nao_deve_conter",   // A conta NÃO deve conter os itens
    "pode_conter",       // A conta PODE conter (opcional, mas validar valor)
    "quantidade_minima", // Deve ter quantidade mínima do item
    "quantidade_maxima"  // Não pode exceder quantidade máxima
  ]).default("deve_conter").notNull(),
  
  // Ação quando a regra não for atendida
  acaoInconsistencia: mysqlEnum("acaoInconsistencia", [
    "alerta",            // Apenas alertar
    "bloquear",          // Bloquear envio até correção
    "sugerir_adicao",    // Sugerir adição do item faltante
    "sugerir_remocao"    // Sugerir remoção do item
  ]).default("alerta").notNull(),
  
  // Prioridade (1 = mais alta)
  prioridade: int("prioridade").default(5),
  
  // Controle
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RegraNegocio = typeof regrasNegocio.$inferSelect;
export type InsertRegraNegocio = typeof regrasNegocio.$inferInsert;

/**
 * Itens das Regras de Negócio - Itens obrigatórios/proibidos para cada regra
 */
export const itensRegraNegocio = mysqlTable("itensRegraNegocio", {
  id: int("id").autoincrement().primaryKey(),
  
  regraId: int("regraId").notNull(),
  
  // Item obrigatório/proibido
  codigoItem: varchar("codigoItem", { length: 50 }).notNull(),
  descricaoItem: varchar("descricaoItem", { length: 255 }),
  
  // Tipo do item
  tipoItem: mysqlEnum("tipoItem", [
    "procedimento",
    "taxa",
    "material",
    "medicamento",
    "diaria",
    "outros"
  ]).notNull(),
  
  // Quantidade esperada (para regras de quantidade)
  quantidadeMinima: int("quantidadeMinima").default(1),
  quantidadeMaxima: int("quantidadeMaxima"),
  
  // Valor esperado (para validação de preço)
  valorEsperado: decimal("valorEsperado", { precision: 12, scale: 2 }),
  toleranciaValor: decimal("toleranciaValor", { precision: 10, scale: 2 }).default("0.00"),
  
  // Obrigatoriedade
  obrigatorio: mysqlEnum("obrigatorio", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItemRegraNegocio = typeof itensRegraNegocio.$inferSelect;
export type InsertItemRegraNegocio = typeof itensRegraNegocio.$inferInsert;

/**
 * Alertas de Divergência - Divergências encontradas nas contas
 */
export const alertasDivergencia = mysqlTable("alertasDivergencia", {
  id: int("id").autoincrement().primaryKey(),
  
  arquivoId: int("arquivoId").notNull(),
  procedimentoId: int("procedimentoId"), // Procedimento que gerou o alerta
  regraId: int("regraId"), // Regra de negócio violada (se aplicável)
  
  // Tipo de alerta
  tipoAlerta: mysqlEnum("tipoAlerta", [
    "valor_divergente",      // Valor cobrado diferente da tabela
    "item_faltante",         // Item obrigatório não encontrado
    "item_nao_permitido",    // Item que não deveria estar na conta
    "quantidade_incorreta",  // Quantidade fora do esperado
    "codigo_invalido",       // Código não encontrado na tabela
    "regra_negocio",         // Violação de regra de negócio
    "sugestao_ia"            // Sugestão da IA
  ]).notNull(),
  
  // Severidade
  severidade: mysqlEnum("severidade", [
    "baixa",
    "media",
    "alta",
    "critica"
  ]).default("media").notNull(),
  
  // Detalhes do alerta
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao").notNull(),
  
  // Valores para divergência de preço
  valorCobrado: decimal("valorCobrado", { precision: 12, scale: 2 }),
  valorEsperado: decimal("valorEsperado", { precision: 12, scale: 2 }),
  diferenca: decimal("diferenca", { precision: 12, scale: 2 }),
  
  // Código e descrição do item relacionado
  codigoItem: varchar("codigoItem", { length: 50 }),
  descricaoItem: varchar("descricaoItem", { length: 255 }),
  
  // Guia relacionada
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  
  // Sugestão de correção
  sugestaoCorrecao: text("sugestaoCorrecao"),
  
  // Status do alerta
  status: mysqlEnum("status", [
    "pendente",      // Aguardando análise
    "analisando",    // Em análise
    "corrigido",     // Corrigido pelo usuário
    "ignorado",      // Ignorado (não é problema)
    "aceito"         // Aceito como está
  ]).default("pendente").notNull(),
  
  // Resolução
  resolvidoPor: int("resolvidoPor"),
  dataResolucao: timestamp("dataResolucao"),
  observacaoResolucao: text("observacaoResolucao"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertaDivergencia = typeof alertasDivergencia.$inferSelect;
export type InsertAlertaDivergencia = typeof alertasDivergencia.$inferInsert;

/**
 * Padrões de Conta - Aprendizado de padrões para sugestões da IA
 */
export const padroesContas = mysqlTable("padroesContas", {
  id: int("id").autoincrement().primaryKey(),
  
  convenioId: int("convenioId"),
  estabelecimentoId: int("estabelecimentoId"),
  
  // Procedimento principal
  codigoProcedimentoPrincipal: varchar("codigoProcedimentoPrincipal", { length: 50 }).notNull(),
  descricaoProcedimentoPrincipal: varchar("descricaoProcedimentoPrincipal", { length: 255 }),
  
  // Itens frequentemente associados (JSON array)
  itensAssociados: json("itensAssociados"), // [{codigo, descricao, frequencia, valorMedio}]
  
  // Estatísticas
  totalOcorrencias: int("totalOcorrencias").default(0),
  valorMedioConta: decimal("valorMedioConta", { precision: 12, scale: 2 }),
  
  // Última atualização do padrão
  ultimaAtualizacao: timestamp("ultimaAtualizacao").defaultNow().notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PadraoConta = typeof padroesContas.$inferSelect;
export type InsertPadraoConta = typeof padroesContas.$inferInsert;


/**
 * Histórico de Validações de XML
 * Armazena os resultados das validações executadas sob demanda
 */
export const historicoValidacoes = mysqlTable("historicoValidacoes", {
  id: int("id").autoincrement().primaryKey(),
  
  // Arquivo validado
  arquivoId: int("arquivoId").notNull(),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  
  // Usuário que executou a validação
  userId: int("userId").notNull(),
  
  // Resumo da validação
  totalItens: int("totalItens").default(0),
  divergenciasPreco: int("divergenciasPreco").default(0),
  violacoesRegras: int("violacoesRegras").default(0),
  sugestoesIA: int("sugestoesIA").default(0),
  valorDiferenca: decimal("valorDiferenca", { precision: 12, scale: 2 }),
  
  // Status
  status: mysqlEnum("status", ["concluida", "erro"]).default("concluida").notNull(),
  
  // Detalhes em JSON (alertas, sugestões, etc.)
  detalhes: json("detalhes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoValidacao = typeof historicoValidacoes.$inferSelect;
export type InsertHistoricoValidacao = typeof historicoValidacoes.$inferInsert;


/**
 * Permissões de usuário por estabelecimento
 * Define quais estabelecimentos cada usuário pode acessar
 */
export const permissoesEstabelecimento = mysqlTable("permissoesEstabelecimento", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Grupo de serviço do usuário neste estabelecimento
  grupoServico: mysqlEnum("grupoServico", [
    "administrador",  // Acesso total a todas as funcionalidades
    "faturista",      // Acesso a: Dashboard, Arquivos, Comparações, Faturamento, Tabelas de Preço
    "recurso_glosa",  // Acesso a: Análise de Glosa, Dicionário de Glosas, Recursos de Glosa
    "gestor",         // Acesso a: Dashboard Consolidado, Relatórios, Produtividade
    "visualizador"    // Acesso apenas para visualização (somente leitura)
  ]).default("visualizador").notNull(),
  
  // Permissões específicas (mantém para compatibilidade e controle granular)
  podeVisualizar: mysqlEnum("podeVisualizar", ["sim", "nao"]).default("sim").notNull(),
  podeEditar: mysqlEnum("podeEditar", ["sim", "nao"]).default("nao").notNull(),
  podeExcluir: mysqlEnum("podeExcluir", ["sim", "nao"]).default("nao").notNull(),
  podeGerenciar: mysqlEnum("podeGerenciar", ["sim", "nao"]).default("nao").notNull(), // Gerenciar usuários e permissões
  
  // Permissões por módulo (controle granular por funcionalidade)
  acessoDashboard: mysqlEnum("acessoDashboard", ["sim", "nao"]).default("sim").notNull(),
  acessoArquivos: mysqlEnum("acessoArquivos", ["sim", "nao"]).default("nao").notNull(),
  acessoComparacoes: mysqlEnum("acessoComparacoes", ["sim", "nao"]).default("nao").notNull(),
  acessoFaturamento: mysqlEnum("acessoFaturamento", ["sim", "nao"]).default("nao").notNull(),
  acessoTabelasPreco: mysqlEnum("acessoTabelasPreco", ["sim", "nao"]).default("nao").notNull(),
  acessoAnaliseGlosa: mysqlEnum("acessoAnaliseGlosa", ["sim", "nao"]).default("nao").notNull(),
  acessoDicionarioGlosas: mysqlEnum("acessoDicionarioGlosas", ["sim", "nao"]).default("nao").notNull(),
  acessoRecursosGlosa: mysqlEnum("acessoRecursosGlosa", ["sim", "nao"]).default("nao").notNull(),
  acessoConvenios: mysqlEnum("acessoConvenios", ["sim", "nao"]).default("nao").notNull(),
  acessoRegrasNegocio: mysqlEnum("acessoRegrasNegocio", ["sim", "nao"]).default("nao").notNull(),
  acessoProdutividade: mysqlEnum("acessoProdutividade", ["sim", "nao"]).default("nao").notNull(),
  acessoEstabelecimentos: mysqlEnum("acessoEstabelecimentos", ["sim", "nao"]).default("nao").notNull(),
  acessoPermissoes: mysqlEnum("acessoPermissoes", ["sim", "nao"]).default("nao").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PermissaoEstabelecimento = typeof permissoesEstabelecimento.$inferSelect;
export type InsertPermissaoEstabelecimento = typeof permissoesEstabelecimento.$inferInsert;


/**
 * Motivos de Glosa Personalizados
 * Permite cadastrar novos códigos de glosa além dos padrões TISS
 */
export const motivosGlosa = mysqlTable("motivosGlosa", {
  id: int("id").autoincrement().primaryKey(),
  
  // Código único do motivo (pode ser personalizado ou seguir padrão TISS)
  codigo: varchar("codigo", { length: 20 }).notNull(),
  
  // Grupo/categoria do motivo
  grupo: varchar("grupo", { length: 100 }).notNull(),
  
  // Descrição completa
  descricao: text("descricao").notNull(),
  
  // Descrição simplificada para exibição rápida
  descricaoSimplificada: varchar("descricaoSimplificada", { length: 255 }).notNull(),
  
  // Sugestão de argumento para contestação
  argumentoContestacao: text("argumentoContestacao"),
  
  // Ações recomendadas (JSON array)
  acoesRecomendadas: json("acoesRecomendadas"),
  
  // Documentos sugeridos (JSON array)
  documentosSugeridos: json("documentosSugeridos"),
  
  // Nível de dificuldade para reverter (1-5)
  dificuldadeReversao: int("dificuldadeReversao").default(3),
  
  // Probabilidade estimada de sucesso (0-100%)
  probabilidadeSucesso: int("probabilidadeSucesso").default(50),
  
  // Se é um código padrão TISS ou personalizado
  tipoOrigem: mysqlEnum("tipoOrigem", ["tiss", "personalizado"]).default("personalizado").notNull(),
  
  // Estabelecimento (null = disponível para todos)
  estabelecimentoId: int("estabelecimentoId"),
  
  // Ativo
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  // Usuário que criou
  criadoPor: int("criadoPor"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MotivoGlosa = typeof motivosGlosa.$inferSelect;
export type InsertMotivoGlosa = typeof motivosGlosa.$inferInsert;


/**
 * Grupos de Serviço Personalizados
 * Permite criar novos grupos além dos pré-definidos
 */
export const gruposServico = mysqlTable("gruposServico", {
  id: int("id").autoincrement().primaryKey(),
  
  // Nome do grupo
  nome: varchar("nome", { length: 100 }).notNull(),
  
  // Descrição do grupo
  descricao: text("descricao"),
  
  // Cor do grupo (para exibição visual)
  cor: varchar("cor", { length: 20 }).default("bg-gray-500"),
  
  // Ícone do grupo (nome do ícone Lucide)
  icone: varchar("icone", { length: 50 }).default("Users"),
  
  // Permissões padrão do grupo (JSON)
  permissoesPadrao: json("permissoesPadrao"),
  
  // Estabelecimento (null = disponível para todos)
  estabelecimentoId: int("estabelecimentoId"),
  
  // Se é um grupo do sistema (não pode ser excluído)
  sistemaGrupo: mysqlEnum("sistemaGrupo", ["sim", "nao"]).default("nao").notNull(),
  
  // Ativo
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  // Usuário que criou
  criadoPor: int("criadoPor"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrupoServico = typeof gruposServico.$inferSelect;
export type InsertGrupoServico = typeof gruposServico.$inferInsert;

/**
 * Log de Auditoria de Permissões
 * Registra todas as alterações de permissões
 */
export const logAuditoriaPermissoes = mysqlTable("logAuditoriaPermissoes", {
  id: int("id").autoincrement().primaryKey(),
  
  // Usuário que fez a alteração
  usuarioId: int("usuarioId").notNull(),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  
  // Usuário afetado pela alteração
  usuarioAfetadoId: int("usuarioAfetadoId").notNull(),
  usuarioAfetadoNome: varchar("usuarioAfetadoNome", { length: 255 }),
  
  // Estabelecimento
  estabelecimentoId: int("estabelecimentoId"),
  estabelecimentoNome: varchar("estabelecimentoNome", { length: 255 }),
  
  // Tipo de ação
  tipoAcao: mysqlEnum("tipoAcao", [
    "criar_permissao",
    "alterar_permissao", 
    "remover_permissao",
    "criar_usuario",
    "alterar_grupo",
    "criar_grupo",
    "excluir_grupo",
    "editar_estabelecimentos"
  ]).notNull(),
  
  // Descrição da alteração
  descricao: text("descricao"),
  
  // Valores anteriores (JSON)
  valoresAnteriores: json("valoresAnteriores"),
  
  // Valores novos (JSON)
  valoresNovos: json("valoresNovos"),
  
  // IP do usuário
  ipUsuario: varchar("ipUsuario", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LogAuditoriaPermissoes = typeof logAuditoriaPermissoes.$inferSelect;
export type InsertLogAuditoriaPermissoes = typeof logAuditoriaPermissoes.$inferInsert;

/**
 * Padrões de Cobrança Aprendidos - IA aprende com os XMLs importados
 * Identifica padrões de itens que normalmente aparecem juntos
 */
export const padroesCobranca = mysqlTable("padroesCobranca", {
  id: int("id").autoincrement().primaryKey(),
  
  // Escopo do padrão
  convenioId: int("convenioId"),
  estabelecimentoId: int("estabelecimentoId"),
  
  // Procedimento principal que dispara o padrão
  codigoProcedimentoPrincipal: varchar("codigoProcedimentoPrincipal", { length: 50 }).notNull(),
  descricaoProcedimentoPrincipal: varchar("descricaoProcedimentoPrincipal", { length: 255 }),
  tipoProcedimentoPrincipal: varchar("tipoProcedimentoPrincipal", { length: 50 }), // procedimento, diaria, mat_med, etc.
  
  // Itens associados aprendidos (JSON array)
  // [{codigo, descricao, tipo, frequencia, quantidadeMedia, quantidadeMin, quantidadeMax, valorMedio}]
  itensAssociados: json("itensAssociados").notNull(),
  
  // Estatísticas do padrão
  totalOcorrencias: int("totalOcorrencias").default(1).notNull(),
  valorMedioConta: decimal("valorMedioConta", { precision: 12, scale: 2 }),
  valorMinConta: decimal("valorMinConta", { precision: 12, scale: 2 }),
  valorMaxConta: decimal("valorMaxConta", { precision: 12, scale: 2 }),
  
  // Confiança do padrão (0-100)
  confianca: int("confianca").default(50),
  
  // Status do padrão
  status: mysqlEnum("status", [
    "aprendendo",    // Ainda coletando dados
    "ativo",         // Padrão confirmado e ativo
    "revisao",       // Precisa de revisão manual
    "inativo"        // Desativado
  ]).default("aprendendo").notNull(),
  
  // Validação manual
  validadoPor: int("validadoPor"),
  dataValidacao: timestamp("dataValidacao"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PadraoCobranca = typeof padroesCobranca.$inferSelect;
export type InsertPadraoCobranca = typeof padroesCobranca.$inferInsert;

/**
 * Insights de IA - Sugestões geradas pela análise de padrões
 */
export const insightsIA = mysqlTable("insightsIA", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência
  arquivoId: int("arquivoId").notNull(),
  comparacaoId: int("comparacaoId"),
  estabelecimentoId: int("estabelecimentoId"),
  convenioId: int("convenioId"),
  
  // Tipo de insight
  tipoInsight: mysqlEnum("tipoInsight", [
    "item_faltante",           // Item que deveria estar na conta
    "quantidade_baixa",        // Quantidade abaixo do esperado
    "quantidade_alta",         // Quantidade acima do esperado
    "valor_divergente",        // Valor diferente do padrão
    "item_incomum",            // Item que não costuma aparecer
    "padrao_incompleto",       // Padrão de cobrança incompleto
    "oportunidade_cobranca"    // Possível item não cobrado
  ]).notNull(),
  
  // Severidade
  severidade: mysqlEnum("severidade", ["baixa", "media", "alta"]).default("media").notNull(),
  
  // Detalhes do insight
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao").notNull(),
  
  // Procedimento/guia relacionado
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  descricaoProcedimento: varchar("descricaoProcedimento", { length: 255 }),
  
  // Item sugerido (se aplicável)
  codigoItemSugerido: varchar("codigoItemSugerido", { length: 50 }),
  descricaoItemSugerido: varchar("descricaoItemSugerido", { length: 255 }),
  quantidadeSugerida: decimal("quantidadeSugerida", { precision: 10, scale: 2 }),
  valorEstimado: decimal("valorEstimado", { precision: 12, scale: 2 }),
  
  // Valores atuais vs esperados
  quantidadeAtual: decimal("quantidadeAtual", { precision: 10, scale: 2 }),
  quantidadeEsperada: decimal("quantidadeEsperada", { precision: 10, scale: 2 }),
  valorAtual: decimal("valorAtual", { precision: 12, scale: 2 }),
  valorEsperado: decimal("valorEsperado", { precision: 12, scale: 2 }),
  
  // Confiança da sugestão (0-100)
  confianca: int("confianca").default(50),
  
  // Padrão que gerou o insight
  padraoId: int("padraoId"),
  
  // Status do insight
  status: mysqlEnum("status", [
    "pendente",      // Aguardando análise
    "aceito",        // Usuário aceitou a sugestão
    "rejeitado",     // Usuário rejeitou
    "ignorado"       // Usuário ignorou
  ]).default("pendente").notNull(),
  
  // Feedback do usuário
  feedbackUsuario: text("feedbackUsuario"),
  processadoPor: int("processadoPor"),
  dataProcessamento: timestamp("dataProcessamento"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InsightIA = typeof insightsIA.$inferSelect;
export type InsertInsightIA = typeof insightsIA.$inferInsert;
