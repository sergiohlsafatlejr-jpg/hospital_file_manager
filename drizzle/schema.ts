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
  status: mysqlEnum("status", ["pendente", "processado", "erro"]).default("pendente").notNull(),
  dataReferencia: timestamp("dataReferencia"),
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
  codigo: varchar("codigo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  quantidade: int("quantidade").default(1),
  valorUnitario: decimal("valorUnitario", { precision: 10, scale: 2 }),
  valorTotal: decimal("valorTotal", { precision: 10, scale: 2 }),
  dataExecucao: timestamp("dataExecucao"),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  pacienteCarteirinha: varchar("pacienteCarteirinha", { length: 100 }),
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  nomeMedico: varchar("nomeMedico", { length: 255 }),
  crmMedico: varchar("crmMedico", { length: 50 }),
  dadosExtras: json("dadosExtras"),
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
export const recursosGlosa = mysqlTable("recursosGlosa", {
  id: int("id").autoincrement().primaryKey(),
  divergenciaId: int("divergenciaId"),
  convenioId: int("convenioId").notNull(),
  userId: int("userId").notNull(),
  
  // Dados do procedimento contestado
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  descricaoProcedimento: text("descricaoProcedimento"),
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  
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
