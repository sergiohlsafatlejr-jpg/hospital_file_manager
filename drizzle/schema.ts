import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, date, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "tasy_user"]).default("user").notNull(),
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
 * Relação Convênio-Estabelecimento-Prestador
 * Permite associar códigos de prestador específicos para cada combinação de convênio e estabelecimento
 */
export const convenioEstabelecimentoPrestador = mysqlTable("convenioEstabelecimentoPrestador", {
  id: int("id").autoincrement().primaryKey(),
  convenioId: int("convenioId").notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  codigoPrestador: varchar("codigoPrestador", { length: 50 }).notNull(), // Código do prestador na operadora (CNPJ ou código interno)
  nomePrestador: varchar("nomePrestador", { length: 255 }), // Nome amigável do prestador (opcional)
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConvenioEstabelecimentoPrestador = typeof convenioEstabelecimentoPrestador.$inferSelect;
export type InsertConvenioEstabelecimentoPrestador = typeof convenioEstabelecimentoPrestador.$inferInsert;

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

// Tabela procedimentos REMOVIDA - dados agora são armazenados em faturamentoTiss (envios) e demonstrativo (retornos)

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
  valorTotalRecebido: decimal("valorTotalRecebido", { precision: 12, scale: 2 }).default("0"),
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
  
  // XML gerado
  xmlUrl: text("xmlUrl"), // URL do XML TISS gerado no S3
  xmlKey: varchar("xmlKey", { length: 512 }), // Chave do XML no S3
  xmlGeradoEm: timestamp("xmlGeradoEm"), // Data/hora da geração do XML
  
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
  
  // Campos de pagamento do recurso
  valorRecebido: decimal("valorRecebido", { precision: 10, scale: 2 }),
  dataPagamento: timestamp("dataPagamento"),
  observacoesPagamento: text("observacoesPagamento"),
  
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
  
  // Campos para Padrões de Procedimentos (FASE 1.5A)
  tipoRegra: mysqlEnum("tipoRegra", ["validacao_geral", "padrao_procedimento"]).default("validacao_geral"),
  codigoProcedimento: varchar("codigoProcedimento", { length: 50 }),
  nomeProcedimento: varchar("nomeProcedimento", { length: 255 }),
  tolerancia_percentual: varchar("tolerancia_percentual", { length: 10 }),
  tolerancia_absoluta: decimal("tolerancia_absoluta", { precision: 12, scale: 2 }),
  diaria_obrigatoria: int("diaria_obrigatoria").default(0),
  diaria_esperada_por_dia: int("diaria_esperada_por_dia"),
  score_minimo_aceitavel: int("score_minimo_aceitavel").default(70),
  
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
  
  // Campos para Padrões de Procedimentos (FASE 1.5A)
  tabelaPrecoCodigo: varchar("tabelaPrecoCodigo", { length: 50 }),
  tolerancia_percentual: varchar("tolerancia_percentual", { length: 10 }),
  tolerancia_absoluta: decimal("tolerancia_absoluta", { precision: 12, scale: 2 }),
  ordem: int("ordem").default(0),
  
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
    "visualizador",   // Acesso apenas para visualização (somente leitura)
    "usuario_tasy"    // Acesso a: Importação Tasy, Contas Faturadas, Relatórios Tasy, Relatórios BI, Conciliação
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
  
  // Módulos Tasy
  acessoImportacaoTasy: mysqlEnum("acessoImportacaoTasy", ["sim", "nao"]).default("nao").notNull(),
  acessoContasFaturadas: mysqlEnum("acessoContasFaturadas", ["sim", "nao"]).default("nao").notNull(),
  acessoRelatoriosTasy: mysqlEnum("acessoRelatoriosTasy", ["sim", "nao"]).default("nao").notNull(),
  acessoRelatoriosBi: mysqlEnum("acessoRelatoriosBi", ["sim", "nao"]).default("nao").notNull(),
  acessoConciliacaoContasPagas: mysqlEnum("acessoConciliacaoContasPagas", ["sim", "nao"]).default("nao").notNull(),
  
  // Módulos de Recebimento e Demonstrativo
  acessoRecebimentosXml: mysqlEnum("acessoRecebimentosXml", ["sim", "nao"]).default("nao").notNull(),
  acessoRecebimentosExcel: mysqlEnum("acessoRecebimentosExcel", ["sim", "nao"]).default("nao").notNull(),
  acessoDemonstrativo: mysqlEnum("acessoDemonstrativo", ["sim", "nao"]).default("nao").notNull(),
  acessoContaConvenio: mysqlEnum("acessoContaConvenio", ["sim", "nao"]).default("nao").notNull(),
  acessoRecursos: mysqlEnum("acessoRecursos", ["sim", "nao"]).default("nao").notNull(),
  acessoAtendimentos: mysqlEnum("acessoAtendimentos", ["sim", "nao"]).default("nao").notNull(),
  acessoAtendimentosFaturar: mysqlEnum("acessoAtendimentosFaturar", ["sim", "nao"]).default("nao").notNull(),
  
  // Permissões granulares por relatório individual (dentro de Relatórios BI)
  acessoRelFaturadoRecebido: mysqlEnum("acessoRelFaturadoRecebido", ["sim", "nao"]).default("nao").notNull(),
  acessoRelRecebimentoGeral: mysqlEnum("acessoRelRecebimentoGeral", ["sim", "nao"]).default("nao").notNull(),
  acessoRelFaturamento: mysqlEnum("acessoRelFaturamento", ["sim", "nao"]).default("nao").notNull(),
  acessoRelAtendimentos: mysqlEnum("acessoRelAtendimentos", ["sim", "nao"]).default("nao").notNull(),
  acessoRelCustos: mysqlEnum("acessoRelCustos", ["sim", "nao"]).default("nao").notNull(),
  acessoRelNaoRecebidos: mysqlEnum("acessoRelNaoRecebidos", ["sim", "nao"]).default("nao").notNull(),
  acessoRelPrevisaoGlosa: mysqlEnum("acessoRelPrevisaoGlosa", ["sim", "nao"]).default("nao").notNull(),
  
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
  setor: varchar("setor", { length: 255 }), // Setor de atendimento (ex: CENTRO CIRURGICO, POSTO I)
  profissionalExecutante: varchar("profissionalExecutante", { length: 255 }), // Profissional executante (médico)
  
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
  
  // Gabarito manual (não é sobrescrito na regeneração)
  isGabarito: int("isGabarito").default(0).notNull(),
  
  // Validação manual
  validadoPor: int("validadoPor"),
  dataValidacao: timestamp("dataValidacao"),
  observacoesValidacao: text("observacoesValidacao"),
  
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


/**
 * Regras de IA configuráveis para geração de alertas
 */
export const regrasIA = mysqlTable("regrasIA", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId"), // Null = regra global para todos os estabelecimentos
  
  // Identificador único da regra
  codigo: varchar("codigo", { length: 50 }).notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  
  // Categoria da regra
  categoria: mysqlEnum("categoria", [
    "outlier",           // Detecção de valores fora da média
    "padrao_erro",       // Padrões de erro por funcionário
    "risco_glosa",       // Score de risco de glosa
    "tendencia",         // Análise de tendências
    "comparacao"         // Comparação entre contas similares
  ]).notNull(),
  
  // Tipo de alerta gerado
  tipoAlerta: mysqlEnum("tipoAlerta", [
    "critico",    // Vermelho - requer ação imediata
    "alerta",     // Amarelo - atenção necessária
    "info"        // Azul - informativo
  ]).default("alerta").notNull(),
  
  // Parâmetros configuráveis (JSON)
  parametros: json("parametros").$type<{
    // Para outliers
    limiteDesvioAbaixo?: number;     // Desvio padrão para valores abaixo da média (ex: 2)
    limiteDesvioAcima?: number;      // Desvio padrão para valores acima da média (ex: 2)
    minimoContasHistorico?: number;  // Mínimo de contas para ter estatísticas (ex: 3)
    periodoAnalise?: number;         // Dias para análise (ex: 90)
    
    // Para padrões de erro
    taxaGlosaMinima?: number;        // Taxa mínima de glosa para alerta (ex: 20)
    minimoProcedimentos?: number;    // Mínimo de procedimentos para análise (ex: 50)
    periodoMeses?: number;           // Período em meses (ex: 6)
    
    // Para risco de glosa
    scoreRiscoMinimo?: number;       // Score mínimo para alerta (ex: 30)
    historicoMinimoContas?: number;  // Mínimo de contas no histórico (ex: 5)
    
    // Para tendências
    variacaoMinima?: number;         // Variação mínima percentual para alerta (ex: 10)
    periodoComparacao?: number;      // Meses para comparação (ex: 3)
    
    // Configurações gerais
    maxResultados?: number;          // Máximo de resultados a exibir (ex: 10)
  }>(),
  
  // Prioridade para ordenação (menor = mais importante)
  prioridade: int("prioridade").default(100),
  
  // Status da regra
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  // Auditoria
  criadoPor: int("criadoPor"),
  atualizadoPor: int("atualizadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RegraIA = typeof regrasIA.$inferSelect;
export type InsertRegraIA = typeof regrasIA.$inferInsert;


/**
 * Faturado Tasy - Tabela unificada de faturamento do Tasy
 * Armazena todos os itens faturados (procedimentos, taxas, mat/med) do sistema Tasy
 */
export const faturadoTasy = mysqlTable("faturadoTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(), // Referência à importação que trouxe este registro
  
  // Identificadores
  sequencia: varchar("sequencia", { length: 50 }), // Número de sequência
  convenio: varchar("convenio", { length: 255 }), // Nome do convênio
  competencia: varchar("competencia", { length: 20 }), // Data de competência (mês/ano referência)
  protocolo: varchar("protocolo", { length: 100 }), // Número do protocolo
  setor: varchar("setor", { length: 255 }), // Setor de atendimento
  atend: varchar("atend", { length: 50 }), // Número do atendimento
  conta: varchar("conta", { length: 50 }), // Número da conta
  profExec: varchar("profExec", { length: 255 }), // Profissional executor
  
  // Motivo de exclusão
  cdMotivoExcConta: varchar("cdMotivoExcConta", { length: 50 }), // Código motivo exclusão conta
  dsComplMotivoExcon: text("dsComplMotivoExcon"), // Descrição complementar motivo
  
  // Dados do item
  tipoItem: mysqlEnum("tipoItem", ["PROC/TAXA", "MAT/MED"]).notNull(), // Tipo do item
  cdItem: varchar("cdItem", { length: 50 }), // Código do item
  cdItemTuss: varchar("cdItemTuss", { length: 50 }), // Código TUSS do item
  dtItem: timestamp("dtItem"), // Data do item
  descricao: text("descricao"), // Descrição do item
  qtd: decimal("qtd", { precision: 10, scale: 4 }), // Quantidade
  
  // Valores
  vlFaturado: decimal("vlFaturado", { precision: 12, scale: 4 }), // Valor faturado
  aReceber: decimal("aReceber", { precision: 12, scale: 4 }), // Valor a receber
  vlPago: decimal("vlPago", { precision: 12, scale: 4 }), // Valor pago
  vlGlosa: decimal("vlGlosa", { precision: 12, scale: 4 }), // Valor da glosa
  motivoGlosa: text("motivoGlosa"), // Descrição do motivo da glosa
  
  // Dados de retorno/pagamento
  retorno: varchar("retorno", { length: 50 }), // Número do retorno
  dtPgto: timestamp("dtPgto"), // Data do pagamento
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FaturadoTasy = typeof faturadoTasy.$inferSelect;
export type InsertFaturadoTasy = typeof faturadoTasy.$inferInsert;

/**
 * Dados do Tasy (LEGADO - mantido para compatibilidade)
 * Armazena os dados exportados do sistema Tasy para integração com o Safatle
 */
export const dadosTasy = mysqlTable("dadosTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  atendimento: varchar("atendimento", { length: 50 }).notNull(),
  nrInternoConta: varchar("nrInternoConta", { length: 50 }),
  sequencia: varchar("sequencia", { length: 50 }),
  dataFaturado: timestamp("dataFaturado"),
  guia: varchar("guia", { length: 100 }),
  convenio: varchar("convenio", { length: 255 }),
  paciente: varchar("paciente", { length: 255 }),
  dataConta: timestamp("dataConta"),
  codigo: varchar("codigo", { length: 50 }),
  codigoConvenio: varchar("codigoConvenio", { length: 50 }),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 10, scale: 4 }),
  unidade: varchar("unidade", { length: 20 }),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
  setor: varchar("setor", { length: 255 }),
  protocolo: varchar("protocolo", { length: 100 }),
  statusProtocolo: varchar("statusProtocolo", { length: 50 }),
  tipo: mysqlEnum("tipo", ["MATERIAL", "HONORARIO"]).notNull(),
  medico: varchar("medico", { length: 255 }),
  funcaoMedico: varchar("funcaoMedico", { length: 100 }),
  crm: varchar("crm", { length: 50 }),
  valorMedico: decimal("valorMedico", { precision: 12, scale: 4 }),
  processado: mysqlEnum("processado", ["sim", "nao"]).default("nao").notNull(),
  procedimentoId: int("procedimentoId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DadoTasy = typeof dadosTasy.$inferSelect;
export type InsertDadoTasy = typeof dadosTasy.$inferInsert;

/**
 * Histórico de Importações do Tasy
 * Registra cada importação de arquivo SQLite do Tasy
 */
export const importacoesTasy = mysqlTable("importacoesTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  userId: int("userId").notNull(),
  
  // Informações do arquivo
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  tamanhoArquivo: int("tamanhoArquivo"), // Em bytes
  
  // Estatísticas da importação
  totalRegistros: int("totalRegistros").default(0),
  registrosImportados: int("registrosImportados").default(0),
  registrosIgnorados: int("registrosIgnorados").default(0), // Já existiam no banco
  registrosErro: int("registrosErro").default(0),
  
  // Detalhes por tipo
  totalMateriais: int("totalMateriais").default(0),
  totalHonorarios: int("totalHonorarios").default(0),
  
  // Período dos dados
  dataInicio: timestamp("dataInicio"), // Menor data de faturamento
  dataFim: timestamp("dataFim"), // Maior data de faturamento
  
  // Status da importação
  status: mysqlEnum("status", [
    "aguardando",    // Arquivo recebido, aguardando processamento
    "processando",   // Em processamento
    "concluido",     // Importação concluída com sucesso
    "concluido_parcial", // Concluído com alguns erros
    "erro"           // Falha na importação
  ]).default("aguardando").notNull(),
  
  // Progresso (para importações grandes)
  progresso: int("progresso").default(0), // 0-100
  
  // Mensagens de erro/log
  mensagemErro: text("mensagemErro"),
  logProcessamento: json("logProcessamento"), // Array de mensagens de log
  
  // S3 (se o arquivo for armazenado)
  s3Key: varchar("s3Key", { length: 512 }),
  s3Url: text("s3Url"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImportacaoTasy = typeof importacoesTasy.$inferSelect;
export type InsertImportacaoTasy = typeof importacoesTasy.$inferInsert;


/**
 * Chaves de API para acesso externo
 * Permite que scripts externos (como o de exportação do Tasy) acessem a API
 */
export const apiKeys = mysqlTable("apiKeys", {
  id: int("id").autoincrement().primaryKey(),
  
  // Usuário dono da chave
  userId: int("userId").notNull(),
  
  // Nome/descrição da chave
  nome: varchar("nome", { length: 255 }).notNull(),
  
  // Chave de API (hash)
  keyHash: varchar("keyHash", { length: 255 }).notNull(),
  
  // Prefixo da chave (para identificação, ex: "sk_live_abc...")
  keyPrefix: varchar("keyPrefix", { length: 20 }).notNull(),
  
  // Estabelecimentos permitidos (JSON array de IDs, null = todos)
  estabelecimentosPermitidos: json("estabelecimentosPermitidos"),
  
  // Permissões (JSON array de strings)
  permissoes: json("permissoes"),
  
  // Último uso
  ultimoUso: timestamp("ultimoUso"),
  
  // Contador de uso
  totalUsos: int("totalUsos").default(0),
  
  // Data de expiração (null = não expira)
  expiraEm: timestamp("expiraEm"),
  
  // Status
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;


/**
 * Dashboards Salvos - Configurações de relatórios personalizados
 */
export const dashboardsSalvos = mysqlTable("dashboardsSalvos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  // Configurações do dashboard em JSON
  configuracao: text("configuracao").notNull(), // JSON com: tipoGrafico, agrupamento, colunasSelecionadas, filtros
  // Configurações de comparativo
  comparativoAtivo: mysqlEnum("comparativoAtivo", ["sim", "nao"]).default("nao").notNull(),
  periodo1Mes: int("periodo1Mes"),
  periodo1Ano: int("periodo1Ano"),
  periodo2Mes: int("periodo2Mes"),
  periodo2Ano: int("periodo2Ano"),
  // Metadados
  favorito: mysqlEnum("favorito", ["sim", "nao"]).default("nao").notNull(),
  ultimoAcesso: timestamp("ultimoAcesso"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DashboardSalvo = typeof dashboardsSalvos.$inferSelect;
export type InsertDashboardSalvo = typeof dashboardsSalvos.$inferInsert;


/**
 * Alertas de Variação - Configuração de alertas automáticos quando variação entre períodos ultrapassar percentual
 */
export const alertasVariacao = mysqlTable("alertasVariacao", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  userId: int("userId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipoAlerta: mysqlEnum("tipoAlerta", ["queda", "aumento", "ambos"]).default("queda").notNull(),
  percentualLimite: int("percentualLimite").default(20).notNull(), // Ex: 20 = 20%
  metrica: mysqlEnum("metrica", ["faturamento", "quantidade", "glosa"]).default("faturamento").notNull(),
  agrupamento: varchar("agrupamento", { length: 50 }).default("convenio"), // convenio, setor, medico, tipo
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  notificarEmail: mysqlEnum("notificarEmail", ["sim", "nao"]).default("nao"),
  ultimaVerificacao: timestamp("ultimaVerificacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertaVariacao = typeof alertasVariacao.$inferSelect;
export type InsertAlertaVariacao = typeof alertasVariacao.$inferInsert;

/**
 * Histórico de Alertas Disparados
 */
export const historicoAlertasVariacao = mysqlTable("historicoAlertasVariacao", {
  id: int("id").autoincrement().primaryKey(),
  alertaId: int("alertaId").notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  periodoAnterior: varchar("periodoAnterior", { length: 20 }).notNull(), // Ex: "2025-01"
  periodoAtual: varchar("periodoAtual", { length: 20 }).notNull(), // Ex: "2025-02"
  valorAnterior: decimal("valorAnterior", { precision: 15, scale: 2 }).notNull(),
  valorAtual: decimal("valorAtual", { precision: 15, scale: 2 }).notNull(),
  percentualVariacao: decimal("percentualVariacao", { precision: 10, scale: 2 }).notNull(),
  detalhes: text("detalhes"), // JSON com detalhes do alerta
  visualizado: mysqlEnum("visualizado", ["sim", "nao"]).default("nao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoAlertaVariacao = typeof historicoAlertasVariacao.$inferSelect;
export type InsertHistoricoAlertaVariacao = typeof historicoAlertasVariacao.$inferInsert;

/**
 * Compartilhamento de Dashboards
 */
export const compartilhamentosDashboard = mysqlTable("compartilhamentosDashboard", {
  id: int("id").autoincrement().primaryKey(),
  dashboardId: int("dashboardId").notNull(),
  compartilhadoPorId: int("compartilhadoPorId").notNull(), // userId que compartilhou
  compartilhadoComId: int("compartilhadoComId").notNull(), // userId que recebeu
  permissao: mysqlEnum("permissao", ["visualizar", "editar"]).default("visualizar").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CompartilhamentoDashboard = typeof compartilhamentosDashboard.$inferSelect;
export type InsertCompartilhamentoDashboard = typeof compartilhamentosDashboard.$inferInsert;


/**
 * Contas Pagas do Tasy - Dados de retorno/pagamento de contas
 * Armazena os dados de contas pagas/glosadas importados do Tasy
 */
export const contasPagasTasy = mysqlTable("contasPagasTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  
  // Dados do retorno
  dataRetorno: timestamp("dataRetorno"), // DATA_RETORNO
  seqRetornoGeral: varchar("seqRetornoGeral", { length: 50 }), // SEQ_RETORNO_GERAL
  titulo: varchar("titulo", { length: 255 }), // TITULO
  
  // Identificadores da conta
  guia: varchar("guia", { length: 100 }), // GUIA
  nrSeqConta: varchar("nrSeqConta", { length: 50 }), // NR_SEQ_CONTA
  nrConta: varchar("nrConta", { length: 50 }), // NR_CONTA
  
  // Dados do convênio
  convenio: varchar("convenio", { length: 255 }), // CONVENIO
  nrProtocolo: varchar("nrProtocolo", { length: 100 }), // NR_PROTOCOLO
  
  // Dados de pagamento
  dataRecebimento: timestamp("dataRecebimento"), // DATA_RECEBIMENTO
  pagoConta: decimal("pagoConta", { precision: 12, scale: 4 }), // PAGO_CONTA
  glosaConta: decimal("glosaConta", { precision: 12, scale: 4 }), // GLOSA_CONTA
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContaPagaTasy = typeof contasPagasTasy.$inferSelect;
export type InsertContaPagaTasy = typeof contasPagasTasy.$inferInsert;

/**
 * Itens Pagos do Tasy - Dados de itens pagos/glosados por conta
 * Armazena os detalhes de cada item pago ou glosado
 */
export const itensPagosTasy = mysqlTable("itensPagosTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  
  // Identificadores da conta
  titulo: varchar("titulo", { length: 255 }), // TITULO
  guia: varchar("guia", { length: 100 }), // GUIA
  nrSeqConta: varchar("nrSeqConta", { length: 50 }), // NR_SEQ_CONTA
  conta: varchar("conta", { length: 50 }), // CONTA
  nrProtocolo: varchar("nrProtocolo", { length: 100 }), // NR_PROTOCOLO
  
  // Dados de pagamento
  dataRecebimento: timestamp("dataRecebimento"), // DATA_RECEBIMENTO
  glosaItem: decimal("glosaItem", { precision: 12, scale: 4 }), // GLOSA_ITEM
  qndGlosaItem: decimal("qndGlosaItem", { precision: 10, scale: 4 }), // QND_GLOSA_ITEM
  motivoGlosa: text("motivoGlosa"), // MOTIVO_GLOSA
  
  // Dados do item
  procedimento: varchar("procedimento", { length: 255 }), // PROCEDIMENTO
  material: varchar("material", { length: 255 }), // MATERIAL
  setor: varchar("setor", { length: 255 }), // SETOR
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItemPagoTasy = typeof itensPagosTasy.$inferSelect;
export type InsertItemPagoTasy = typeof itensPagosTasy.$inferInsert;


/**
 * Itens do Demonstrativo de Retorno
 * Armazena os itens extraídos dos arquivos de demonstrativo de pagamento dos convênios
 */
export const demonstrativoItens = mysqlTable("demonstrativoItens", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  arquivoId: int("arquivoId").notNull(), // Referência ao arquivo de demonstrativo
  convenioId: int("convenioId").notNull(),
  
  // Dados do item
  codigo: varchar("codigo", { length: 50 }),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 10, scale: 4 }).default("1"),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
  
  // Dados de pagamento
  valorPago: decimal("valorPago", { precision: 12, scale: 4 }),
  valorGlosado: decimal("valorGlosado", { precision: 12, scale: 4 }),
  motivoGlosa: text("motivoGlosa"),
  codigoGlosa: varchar("codigoGlosa", { length: 20 }),
  
  // Status do item
  status: mysqlEnum("status", ["pago", "glosado", "pago_parcial"]).default("pago").notNull(),
  
  // Dados da guia/atendimento
  guiaNumero: varchar("guiaNumero", { length: 100 }),
  dataExecucao: timestamp("dataExecucao"),
  dataReferencia: timestamp("dataReferencia"), // Mês/ano de referência
  
  // Dados do paciente
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  pacienteCarteirinha: varchar("pacienteCarteirinha", { length: 100 }),
  
  // Dados do profissional
  nomeMedico: varchar("nomeMedico", { length: 255 }),
  crmMedico: varchar("crmMedico", { length: 50 }),
  
  // Tipo do item
  tipoDespesa: mysqlEnum("tipoDespesa", [
    "gas",
    "medicamento",
    "material",
    "diaria",
    "taxa",
    "procedimento",
    "outros"
  ]).default("procedimento"),
  
  // Dados extras em JSON
  dadosExtras: json("dadosExtras"),
  
  // Referência ao procedimento original (se houver match)
  procedimentoOrigemId: int("procedimentoOrigemId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DemonstrativoItem = typeof demonstrativoItens.$inferSelect;
export type InsertDemonstrativoItem = typeof demonstrativoItens.$inferInsert;


/**
 * Conciliação Tasy - Resultado da conciliação entre dados do Tasy e demonstrativos
 * Armazena o resultado da comparação entre o que foi faturado (Tasy) e o que foi pago (demonstrativo)
 */
export const conciliacao = mysqlTable("conciliacao", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Período da conciliação
  mesReferencia: int("mesReferencia").notNull(), // 1-12
  anoReferencia: int("anoReferencia").notNull(), // Ex: 2025
  convenioId: int("convenioId"),
  
  // Referências aos dados originais
  dadoTasyId: int("dadoTasyId"), // Referência ao registro do Tasy (se houver)
  demonstrativoItemId: int("demonstrativoItemId"), // Referência ao item do demonstrativo (se houver)
  
  // Dados do item faturado (Tasy)
  guiaTasy: varchar("guiaTasy", { length: 100 }),
  atendimentoTasy: varchar("atendimentoTasy", { length: 50 }),
  codigoTasy: varchar("codigoTasy", { length: 50 }),
  descricaoTasy: text("descricaoTasy"),
  quantidadeTasy: decimal("quantidadeTasy", { precision: 10, scale: 4 }),
  valorTasy: decimal("valorTasy", { precision: 12, scale: 4 }),
  dataTasy: timestamp("dataTasy"),
  pacienteTasy: varchar("pacienteTasy", { length: 255 }),
  
  // Dados do item pago (Demonstrativo)
  guiaDemo: varchar("guiaDemo", { length: 100 }),
  codigoDemo: varchar("codigoDemo", { length: 50 }),
  descricaoDemo: text("descricaoDemo"),
  quantidadeDemo: decimal("quantidadeDemo", { precision: 10, scale: 4 }),
  valorPagoDemo: decimal("valorPagoDemo", { precision: 12, scale: 4 }),
  valorGlosadoDemo: decimal("valorGlosadoDemo", { precision: 12, scale: 4 }),
  motivoGlosaDemo: text("motivoGlosaDemo"),
  dataDemo: timestamp("dataDemo"),
  pacienteDemo: varchar("pacienteDemo", { length: 255 }),
  
  // Resultado da conciliação
  statusConciliacao: mysqlEnum("statusConciliacao", [
    "conciliado",           // Item encontrado e valores batem
    "divergencia_valor",    // Item encontrado mas valores diferentes
    "divergencia_quantidade", // Item encontrado mas quantidade diferente
    "nao_encontrado_demo",  // Item faturado mas não encontrado no demonstrativo
    "nao_encontrado_tasy",  // Item no demonstrativo mas não encontrado no Tasy
    "glosado",              // Item glosado pelo convênio
    "pago_parcial"          // Item pago parcialmente
  ]).default("conciliado").notNull(),
  
  // Valores calculados
  diferencaValor: decimal("diferencaValor", { precision: 12, scale: 4 }),
  diferencaQuantidade: decimal("diferencaQuantidade", { precision: 10, scale: 4 }),
  
  // Observações
  observacao: text("observacao"),
  
  // Receber Hospital (S = hospital recebe, N = terceiros/médicos)
  receberHospital: varchar("receberHospital", { length: 1 }),
  
  // Vinculação de códigos (de-para)
  vinculacaoId: int("vinculacaoId"), // FK para vinculacao_codigos se match foi por de-para
  metodoMatch: mysqlEnum("metodoMatch", ["codigo_direto", "vinculacao", "manual"]).default("codigo_direto"),
  
  // Referência ao arquivo do demonstrativo
  arquivoDemoId: int("arquivoDemoId"),
  
  // Status de vinculação pendente
  pendenteVinculacao: mysqlEnum("pendenteVinculacao", ["sim", "nao"]).default("nao"),
  
  // Controle
  processadoPor: int("processadoPor"), // userId que executou a conciliação
  dataProcessamento: timestamp("dataProcessamento"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConciliacaoRecord = typeof conciliacao.$inferSelect;
export type InsertConciliacao = typeof conciliacao.$inferInsert;


/**
 * Resumo da Conciliação Tasy - Totais por período/convênio
 * Armazena os totais consolidados da conciliação para relatórios
 */
export const resumoConciliacao = mysqlTable("resumoConciliacao", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Período
  mesReferencia: int("mesReferencia").notNull(),
  anoReferencia: int("anoReferencia").notNull(),
  convenioId: int("convenioId"),
  
  // Totais do Tasy (faturado)
  totalItensTasy: int("totalItensTasy").default(0),
  valorTotalTasy: decimal("valorTotalTasy", { precision: 15, scale: 2 }),
  
  // Totais do Demonstrativo (pago)
  totalItensDemo: int("totalItensDemo").default(0),
  valorTotalPago: decimal("valorTotalPago", { precision: 15, scale: 2 }),
  valorTotalGlosado: decimal("valorTotalGlosado", { precision: 15, scale: 2 }),
  
  // Resultado da conciliação
  itensConciliados: int("itensConciliados").default(0),
  itensDivergentes: int("itensDivergentes").default(0),
  itensNaoEncontradosDemo: int("itensNaoEncontradosDemo").default(0),
  itensNaoEncontradosTasy: int("itensNaoEncontradosTasy").default(0),
  itensGlosados: int("itensGlosados").default(0),
  
  // Valores
  valorDiferenca: decimal("valorDiferenca", { precision: 15, scale: 2 }),
  percentualRecebido: decimal("percentualRecebido", { precision: 5, scale: 2 }), // % do faturado que foi recebido
  percentualGlosado: decimal("percentualGlosado", { precision: 5, scale: 2 }), // % de glosa
  
  // Controle
  dataProcessamento: timestamp("dataProcessamento"),
  processadoPor: int("processadoPor"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResumoConciliacaoRecord = typeof resumoConciliacao.$inferSelect;
export type InsertResumoConciliacao = typeof resumoConciliacao.$inferInsert;


/**
 * Procedimentos do Tasy - Honorários médicos e procedimentos
 * Armazena os procedimentos/honorários exportados do Tasy
 */
export const procedimentosTasy = mysqlTable("procedimentosTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  
  // Identificadores únicos do Tasy (chaves para junção)
  atendimento: varchar("atendimento", { length: 50 }).notNull(),
  nrInternoConta: varchar("nrInternoConta", { length: 50 }),
  guia: varchar("guia", { length: 100 }),
  sequencia: varchar("sequencia", { length: 50 }),
  
  // Dados do faturamento
  dataFaturado: timestamp("dataFaturado"),
  convenio: varchar("convenio", { length: 255 }),
  
  // Dados do paciente
  paciente: varchar("paciente", { length: 255 }),
  dataConta: timestamp("dataConta"),
  
  // Dados do procedimento
  codigo: varchar("codigo", { length: 50 }),
  codigoConvenio: varchar("codigoConvenio", { length: 50 }),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 10, scale: 4 }),
  unidade: varchar("unidade", { length: 20 }),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
  
  // Dados adicionais
  setor: varchar("setor", { length: 255 }),
  protocolo: varchar("protocolo", { length: 100 }),
  statusProtocolo: varchar("statusProtocolo", { length: 50 }),
  
  // Dados do médico
  medico: varchar("medico", { length: 255 }),
  funcaoMedico: varchar("funcaoMedico", { length: 100 }),
  crm: varchar("crm", { length: 50 }),
  valorMedico: decimal("valorMedico", { precision: 12, scale: 4 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProcedimentoTasy = typeof procedimentosTasy.$inferSelect;
export type InsertProcedimentoTasy = typeof procedimentosTasy.$inferInsert;

/**
 * Materiais e Medicamentos do Tasy
 * Armazena os materiais e medicamentos exportados do Tasy
 */
export const matMedTasy = mysqlTable("matMedTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  
  // Identificadores únicos do Tasy (chaves para junção)
  atendimento: varchar("atendimento", { length: 50 }).notNull(),
  nrInternoConta: varchar("nrInternoConta", { length: 50 }),
  guia: varchar("guia", { length: 100 }),
  sequencia: varchar("sequencia", { length: 50 }),
  
  // Dados do faturamento
  dataFaturado: timestamp("dataFaturado"),
  convenio: varchar("convenio", { length: 255 }),
  
  // Dados do paciente
  paciente: varchar("paciente", { length: 255 }),
  dataConta: timestamp("dataConta"),
  
  // Dados do material/medicamento
  codigo: varchar("codigo", { length: 50 }),
  codigoConvenio: varchar("codigoConvenio", { length: 50 }),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 10, scale: 4 }),
  unidade: varchar("unidade", { length: 20 }),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
  
  // Dados adicionais
  setor: varchar("setor", { length: 255 }),
  protocolo: varchar("protocolo", { length: 100 }),
  statusProtocolo: varchar("statusProtocolo", { length: 50 }),
  
  // Tipo específico (material ou medicamento)
  tipoItem: mysqlEnum("tipoItem", ["material", "medicamento"]).default("material"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MatMedTasy = typeof matMedTasy.$inferSelect;
export type InsertMatMedTasy = typeof matMedTasy.$inferInsert;

/**
 * Contas Tasy - Tabela unificada (junção de procedimentos + mat_med)
 * Agrupa todos os itens de uma conta usando nrInternoConta e Guia como chaves
 */
export const contasTasy = mysqlTable("contasTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  importacaoId: int("importacaoId").notNull(),
  
  // Chaves de identificação da conta
  nrInternoConta: varchar("nrInternoConta", { length: 50 }).notNull(),
  guia: varchar("guia", { length: 100 }),
  atendimento: varchar("atendimento", { length: 50 }),
  
  // Dados do faturamento
  dataFaturado: timestamp("dataFaturado"),
  convenio: varchar("convenio", { length: 255 }),
  
  // Dados do paciente
  paciente: varchar("paciente", { length: 255 }),
  dataConta: timestamp("dataConta"),
  
  // Dados adicionais
  setor: varchar("setor", { length: 255 }),
  protocolo: varchar("protocolo", { length: 100 }),
  statusProtocolo: varchar("statusProtocolo", { length: 50 }),
  
  // Totais da conta
  totalProcedimentos: int("totalProcedimentos").default(0),
  valorTotalProcedimentos: decimal("valorTotalProcedimentos", { precision: 15, scale: 4 }),
  totalMatMed: int("totalMatMed").default(0),
  valorTotalMatMed: decimal("valorTotalMatMed", { precision: 15, scale: 4 }),
  valorTotalConta: decimal("valorTotalConta", { precision: 15, scale: 4 }),
  
  // Status da conta
  status: mysqlEnum("status", ["aberta", "faturada", "paga", "glosada", "parcial"]).default("faturada"),
  
  // Dados de pagamento (preenchidos após conciliação)
  valorPago: decimal("valorPago", { precision: 15, scale: 4 }),
  valorGlosado: decimal("valorGlosado", { precision: 15, scale: 4 }),
  dataPagamento: timestamp("dataPagamento"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContaTasy = typeof contasTasy.$inferSelect;
export type InsertContaTasy = typeof contasTasy.$inferInsert;

/**
 * Itens da Conta Tasy - Detalhes de cada item na conta unificada
 * Referencia os itens originais de procedimentos e mat_med
 */
export const itensContaTasy = mysqlTable("itensContaTasy", {
  id: int("id").autoincrement().primaryKey(),
  contaTasyId: int("contaTasyId").notNull(), // Referência à conta unificada
  
  // Tipo e referência ao item original
  tipoItem: mysqlEnum("tipoItem", ["procedimento", "material", "medicamento"]).notNull(),
  itemOriginalId: int("itemOriginalId").notNull(), // ID na tabela procedimentosTasy ou matMedTasy
  
  // Dados do item (desnormalizados para facilitar consultas)
  codigo: varchar("codigo", { length: 50 }),
  descricao: text("descricao"),
  quantidade: decimal("quantidade", { precision: 10, scale: 4 }),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 4 }),
  
  // Dados do médico (apenas para procedimentos)
  medico: varchar("medico", { length: 255 }),
  crm: varchar("crm", { length: 50 }),
  
  // Status de pagamento (preenchido após conciliação)
  statusPagamento: mysqlEnum("statusPagamento", ["pendente", "pago", "glosado", "parcial"]).default("pendente"),
  valorPago: decimal("valorPago", { precision: 12, scale: 4 }),
  valorGlosado: decimal("valorGlosado", { precision: 12, scale: 4 }),
  motivoGlosa: text("motivoGlosa"),
  codigoGlosa: varchar("codigoGlosa", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItemContaTasy = typeof itensContaTasy.$inferSelect;
export type InsertItemContaTasy = typeof itensContaTasy.$inferInsert;

/**
 * Resultados da Conciliação Tasy - Histórico de conciliações realizadas
 * Armazena os resultados consolidados de cada execução de conciliação
 */
export const resultadosConciliacaoTasy = mysqlTable("resultadosConciliacaoTasy", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Filtros utilizados na conciliação
  convenioId: int("convenioId"), // Null = todos os convênios
  mesReferencia: int("mesReferencia"), // 1-12
  anoReferencia: int("anoReferencia"), // Ex: 2026
  
  // Totais de contas
  totalContas: int("totalContas").default(0),
  contasOk: int("contasOk").default(0),
  contasComGlosa: int("contasComGlosa").default(0),
  contasDivergentes: int("contasDivergentes").default(0),
  contasNaoEncontradas: int("contasNaoEncontradas").default(0),
  
  // Valores consolidados
  valorTotalTasy: decimal("valorTotalTasy", { precision: 15, scale: 2 }),
  valorTotalPago: decimal("valorTotalPago", { precision: 15, scale: 2 }),
  valorTotalGlosado: decimal("valorTotalGlosado", { precision: 15, scale: 2 }),
  valorDiferenca: decimal("valorDiferenca", { precision: 15, scale: 2 }),
  
  // Percentuais
  percentualGlosa: decimal("percentualGlosa", { precision: 5, scale: 2 }),
  percentualRecebido: decimal("percentualRecebido", { precision: 5, scale: 2 }),
  
  // Metadados
  userId: int("userId").notNull(), // Usuário que executou a conciliação
  observacoes: text("observacoes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResultadoConciliacaoTasy = typeof resultadosConciliacaoTasy.$inferSelect;
export type InsertResultadoConciliacaoTasy = typeof resultadosConciliacaoTasy.$inferInsert;

/**
 * Itens da Conciliação Tasy - Detalhes de cada conta conciliada
 * Armazena o resultado individual de cada conta na conciliação
 */
export const itensConciliacaoTasy = mysqlTable("itensConciliacaoTasy", {
  id: int("id").autoincrement().primaryKey(),
  resultadoConciliacaoId: int("resultadoConciliacaoId").notNull(), // Referência ao resultado
  contaTasyId: int("contaTasyId").notNull(), // Referência à conta Tasy
  
  // Dados da conta (desnormalizados para histórico)
  nrInternoConta: varchar("nrInternoConta", { length: 50 }),
  guia: varchar("guia", { length: 50 }),
  paciente: varchar("paciente", { length: 255 }),
  dataInternacao: timestamp("dataInternacao"),
  
  // Valores
  valorTasy: decimal("valorTasy", { precision: 15, scale: 2 }),
  valorPago: decimal("valorPago", { precision: 15, scale: 2 }),
  valorGlosado: decimal("valorGlosado", { precision: 15, scale: 2 }),
  valorDiferenca: decimal("valorDiferenca", { precision: 15, scale: 2 }),
  
  // Status da conciliação
  statusConciliacao: mysqlEnum("statusConciliacao", [
    "ok",           // Valores conferem
    "glosa",        // Conta com glosa
    "divergente",   // Valores divergentes
    "nao_encontrado" // Não encontrado no demonstrativo
  ]).notNull(),
  
  // Totais de itens
  totalProcedimentos: int("totalProcedimentos").default(0),
  totalMatMed: int("totalMatMed").default(0),
  
  // Detalhes do demonstrativo vinculado (se encontrado)
  demonstrativoItemId: int("demonstrativoItemId"), // ID do item no demonstrativo
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItemConciliacaoTasy = typeof itensConciliacaoTasy.$inferSelect;
export type InsertItemConciliacaoTasy = typeof itensConciliacaoTasy.$inferInsert;

/**
 * Detalhes dos Itens Conciliados - Procedimentos e Mat/Med individuais
 * Armazena o status de cada item dentro de uma conta conciliada
 */
export const detalhesItensConciliacaoTasy = mysqlTable("detalhesItensConciliacaoTasy", {
  id: int("id").autoincrement().primaryKey(),
  itemConciliacaoId: int("itemConciliacaoId").notNull(), // Referência ao item da conciliação
  
  // Tipo e identificação do item
  tipoItem: mysqlEnum("tipoItem", ["procedimento", "material", "medicamento"]).notNull(),
  codigo: varchar("codigo", { length: 50 }),
  descricao: text("descricao"),
  
  // Valores do Tasy
  quantidadeTasy: decimal("quantidadeTasy", { precision: 10, scale: 4 }),
  valorUnitarioTasy: decimal("valorUnitarioTasy", { precision: 12, scale: 4 }),
  valorTotalTasy: decimal("valorTotalTasy", { precision: 12, scale: 4 }),
  
  // Valores do Demonstrativo
  quantidadePaga: decimal("quantidadePaga", { precision: 10, scale: 4 }),
  valorUnitarioPago: decimal("valorUnitarioPago", { precision: 12, scale: 4 }),
  valorTotalPago: decimal("valorTotalPago", { precision: 12, scale: 4 }),
  valorGlosado: decimal("valorGlosado", { precision: 12, scale: 4 }),
  
  // Glosa
  codigoGlosa: varchar("codigoGlosa", { length: 50 }),
  motivoGlosa: text("motivoGlosa"),
  
  // Status
  statusItem: mysqlEnum("statusItem", ["ok", "pago", "glosado", "parcial", "nao_encontrado"]).default("nao_encontrado"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DetalheItemConciliacaoTasy = typeof detalhesItensConciliacaoTasy.$inferSelect;
export type InsertDetalheItemConciliacaoTasy = typeof detalhesItensConciliacaoTasy.$inferInsert;


/**
 * Faturamento TISS - Dados extraídos dos arquivos XML TISS para faturamento
 * Armazena informações detalhadas de cada item (procedimento ou despesa) para análise e conciliação
 */
export const faturamentoTiss = mysqlTable("faturamento_tiss", {
  id: int("id").autoincrement().primaryKey(),
  
  // Dados do Cabeçalho e Lote
  numeroLote: varchar("numero_lote", { length: 20 }),
  sequencialTransacao: varchar("sequencial_transacao", { length: 20 }),
  dataRegistro: timestamp("data_registro"),
  registroAns: varchar("registro_ans", { length: 10 }),
  
  // Dados da Guia e Beneficiário
  numeroGuiaPrestador: varchar("numero_guia_prestador", { length: 20 }),
  numeroGuiaOperadora: varchar("numero_guia_operadora", { length: 20 }),
  senha: varchar("senha", { length: 20 }),
  carteiraBeneficiario: varchar("carteira_beneficiario", { length: 20 }),
  
  // Dados do Item (Pode ser Procedimento ou Despesa)
  tipoItem: varchar("tipo_item", { length: 20 }), // 'PROCEDIMENTO' ou 'DESPESA'
  sequencialItem: int("sequencial_item"),
  dataExecucao: timestamp("data_execucao"),
  codigoTabela: varchar("codigo_tabela", { length: 5 }),
  codigoItem: varchar("codigo_item", { length: 20 }),
  descricaoItem: varchar("descricao_item", { length: 255 }),
  quantidade: decimal("quantidade", { precision: 10, scale: 3 }),
  valorUnitario: decimal("valor_unitario", { precision: 12, scale: 2 }),
  valorFaturado: decimal("valor_faturado", { precision: 12, scale: 2 }),
  
  // Dados do Profissional (se houver)
  nomeProf: varchar("nome_prof", { length: 150 }),
  conselhoProf: varchar("conselho_prof", { length: 20 }),
  
  // Totais da Guia (para conferência)
  valorTotalGeralGuia: decimal("valor_total_geral_guia", { precision: 12, scale: 2 }),
  
  // Chave de estabelecimento para segregação de dados
  estabelecimentoId: int("estabelecimentoId"),
  
  // Referência ao arquivo de origem
  arquivoId: int("arquivo_id"),
  
  // Convênio e Data de Referência (informados no upload)
  convenioId: int("convenioId"),
  dataReferencia: timestamp("data_referencia"),
  
  // Data de importação
  dataImportacao: timestamp("data_importacao").defaultNow().notNull(),

  // Colunas legadas (existem no banco, mantidas para compatibilidade)
  valorTotalItem: decimal("valor_total_item", { precision: 12, scale: 2 }),
  estabelecimento_id_legacy: int("estabelecimento_id"),
});

export type FaturamentoTiss = typeof faturamentoTiss.$inferSelect;
export type InsertFaturamentoTiss = typeof faturamentoTiss.$inferInsert;


/**
 * Tabela de Recebimento TISS Unificada
 * Armazena dados dos arquivos de retorno das operadoras (demonstrativos de pagamento - XML ou Excel)
 * Estrutura unificada para facilitar conciliação e relatórios
 */
export const recebimentoTiss = mysqlTable("recebimento_tiss", {
  id: int("id").autoincrement().primaryKey(),
  
  // Vínculo com a tabela 'arquivos'
  arquivoId: int("arquivo_id").notNull(),
  
  // ========== CABEÇALHO DO DEMONSTRATIVO (ct_demonstrativoCabecalho) ==========
  registroANS: varchar("registro_ans", { length: 6 }),
  numeroDemonstrativo: varchar("numero_demonstrativo", { length: 50 }),
  nomeOperadora: varchar("nome_operadora", { length: 150 }),
  cnpjOperadora: varchar("cnpj_operadora", { length: 20 }),
  dataEmissao: date("data_emissao"),
  
  // ========== DADOS DO PRESTADOR ==========
  cnes: varchar("cnes", { length: 7 }),
  codigoPrestadorOperadora: varchar("codigo_prestador_operadora", { length: 14 }),
  nomeContratado: varchar("nome_contratado", { length: 70 }),
  
  // ========== DADOS DO PROTOCOLO/LOTE (ct_contaMedicaResumo) ==========
  numeroLotePrestador: varchar("numero_lote_prestador", { length: 50 }),
  numeroProtocolo: varchar("numero_protocolo", { length: 50 }),
  dataProtocolo: date("data_protocolo"),
  valorProtocolo: decimal("valor_protocolo", { precision: 12, scale: 2 }),
  valorGlosaProtocolo: decimal("valor_glosa_protocolo", { precision: 12, scale: 2 }),
  glosaProtocoloCodigo: varchar("glosa_protocolo_codigo", { length: 20 }),
  glosaProtocoloDescricao: text("glosa_protocolo_descricao"),
  situacaoProtocolo: varchar("situacao_protocolo", { length: 10 }),
  
  // Totais do Protocolo
  valorInformadoProtocolo: decimal("valor_informado_protocolo", { precision: 12, scale: 2 }),
  valorProcessadoProtocolo: decimal("valor_processado_protocolo", { precision: 12, scale: 2 }),
  valorLiberadoProtocolo: decimal("valor_liberado_protocolo", { precision: 12, scale: 2 }),
  valorGlosaProtocoloTotal: decimal("valor_glosa_protocolo_total", { precision: 12, scale: 2 }),
  
  // ========== DADOS DA GUIA (relacaoGuias) ==========
  numeroGuiaPrestador: varchar("numero_guia_prestador", { length: 50 }),
  numeroGuiaOperadora: varchar("numero_guia_operadora", { length: 50 }),
  senha: varchar("senha", { length: 50 }),
  numeroCarteira: varchar("numero_carteira", { length: 50 }),
  nomeBeneficiario: varchar("nome_beneficiario", { length: 150 }),
  dataInicioFat: date("data_inicio_fat"),
  dataFimFat: date("data_fim_fat"),
  situacaoGuia: varchar("situacao_guia", { length: 10 }),
  
  // Glosa da Guia
  motivoGlosaGuiaCodigo: varchar("motivo_glosa_guia_codigo", { length: 20 }),
  motivoGlosaGuiaDescricao: text("motivo_glosa_guia_descricao"),
  
  // Totais da Guia
  valorInformadoGuia: decimal("valor_informado_guia", { precision: 12, scale: 2 }),
  valorProcessadoGuia: decimal("valor_processado_guia", { precision: 12, scale: 2 }),
  valorLiberadoGuia: decimal("valor_liberado_guia", { precision: 12, scale: 2 }),
  valorGlosaGuia: decimal("valor_glosa_guia", { precision: 12, scale: 2 }),
  
  // ========== DETALHES DO ITEM (detalhesGuia) ==========
  sequencialItem: int("sequencial_item"),
  dataRealizacao: date("data_realizacao"),
  codigoTabela: varchar("codigo_tabela", { length: 10 }),
  codigoItem: varchar("codigo_item", { length: 20 }),
  descricaoItem: varchar("descricao_item", { length: 255 }),
  grauParticipacao: varchar("grau_participacao", { length: 5 }),
  
  // Valores do Item (Conciliação)
  quantidadeExecutada: decimal("quantidade_executada", { precision: 10, scale: 4 }),
  valorInformado: decimal("valor_informado", { precision: 12, scale: 2 }),
  valorProcessado: decimal("valor_processado", { precision: 12, scale: 2 }),
  valorLiberado: decimal("valor_liberado", { precision: 12, scale: 2 }),
  // valor_glosado é VIRTUAL GENERATED no banco (= valor_informado - valor_liberado)
  // Marcado como generatedAlwaysAs para que Drizzle não tente inserir valores nela
  valorGlosado: decimal("valor_glosado", { precision: 12, scale: 2 }).generatedAlwaysAs(sql`\`valor_informado\` - \`valor_liberado\``, { mode: 'virtual' }),
  
  // Motivos de Glosa do Item (relacaoGlosa)
  codigoGlosa: varchar("codigo_glosa", { length: 20 }),
  descricaoGlosa: text("descricao_glosa"),
  
  // ========== DADOS DE PAGAMENTO (ctm_demonstrativoPagamento) ==========
  dataPagamento: date("data_pagamento"),
  formaPagamento: varchar("forma_pagamento", { length: 20 }),
  banco: varchar("banco", { length: 4 }),
  agencia: varchar("agencia", { length: 7 }),
  
  // Totais Gerais do Demonstrativo
  valorInformadoGeral: decimal("valor_informado_geral", { precision: 12, scale: 2 }),
  valorProcessadoGeral: decimal("valor_processado_geral", { precision: 12, scale: 2 }),
  valorLiberadoGeral: decimal("valor_liberado_geral", { precision: 12, scale: 2 }),
  valorGlosaGeral: decimal("valor_glosa_geral", { precision: 12, scale: 2 }),
  valorFinalReceber: decimal("valor_final_receber", { precision: 12, scale: 2 }),
  
  // ========== METADADOS ==========
  origemDado: mysqlEnum("origem_dado", ["xml", "excel"]).notNull(),
  dataImportacao: timestamp("data_importacao").defaultNow().notNull(),
  
  // Convênio e Data de Referência (informados no upload)
  convenioId: int("convenioId"),
  dataReferencia: date("data_referencia"),
  
  // Estabelecimento
  estabelecimentoId: int("estabelecimentoId"),

  // Colunas legadas (existem no banco, mantidas para compatibilidade)
  estabelecimento_id_legacy: int("estabelecimento_id"),
  codigoPrestadorPagamento: varchar("codigo_prestador_pagamento", { length: 50 }),
  nomePrestadorPagamento: varchar("nome_prestador_pagamento", { length: 255 }),
  codigoPrestadorExecutante: varchar("codigo_prestador_executante", { length: 50 }),
  nomePrestadorExecutante: varchar("nome_prestador_executante", { length: 255 }),
  horaExecucao: varchar("hora_execucao", { length: 20 }),
  codigoProcedimento: varchar("codigo_procedimento", { length: 20 }),
  descricaoProcedimento: varchar("descricao_procedimento", { length: 255 }),
  tipoLancamento: varchar("tipo_lancamento", { length: 50 }),
  qtdExecutada: decimal("qtd_executada", { precision: 10, scale: 4 }),
  situacaoItem: varchar("situacao_item", { length: 20 }),
  codigoSolicitante: varchar("codigo_solicitante", { length: 50 }),
  nomeSolicitante: varchar("nome_solicitante", { length: 255 }),
  acomodacaoInternacao: varchar("acomodacao_internacao", { length: 50 }),
  dataInicioInternacao: date("data_inicio_internacao"),
  dataFimInternacao: date("data_fim_internacao"),
});

export type RecebimentoTiss = typeof recebimentoTiss.$inferSelect;
export type InsertRecebimentoTiss = typeof recebimentoTiss.$inferInsert;


/**
 * Recebimentos Excel - Tabela para importação de Excel de retorno dos convênios
 * Campos mapeados exatamente como no Excel da Unimed
 */
export const recebimentosExcel = mysqlTable("recebimentos_excel", {
  id: int("id").autoincrement().primaryKey(),
  arquivoId: int("arquivo_id"), // Referência ao arquivo de origem
  
  // Data Pagto
  dataPagto: timestamp("data_pagto"),
  
  // Processado (valor)
  processado: decimal("processado", { precision: 12, scale: 2 }),
  
  // Protocolo TISS
  protocoloTiss: varchar("protocolo_tiss", { length: 50 }),
  
  // Lote Prestador
  lotePrestador: varchar("lote_prestador", { length: 50 }),
  
  // Código Prestador Pagamento
  codigoPrestadorPagamento: varchar("codigo_prestador_pagamento", { length: 50 }),
  
  // Nome Prestador Pagamento
  nomePrestadorPagamento: varchar("nome_prestador_pagamento", { length: 255 }),
  
  // Número Guia
  numeroGuia: varchar("numero_guia", { length: 50 }),
  
  // Seq (sequencial do item)
  seq: int("seq"),
  
  // Beneficiário (número carteira)
  beneficiario: varchar("beneficiario", { length: 50 }),
  
  // Nome Beneficiário
  nomeBeneficiario: varchar("nome_beneficiario", { length: 255 }),
  
  // Data Execução
  dataExecucao: timestamp("data_execucao"),
  
  // Hora Execução
  horaExecucao: varchar("hora_execucao", { length: 20 }),
  
  // Item (código do procedimento)
  item: varchar("item", { length: 50 }),
  
  // Item Desc (descrição do procedimento)
  itemDesc: varchar("item_desc", { length: 500 }),
  
  // Quantidade
  quantidade: int("quantidade"),
  
  // Valor Pagamento
  valorPagamento: decimal("valor_pagamento", { precision: 12, scale: 2 }),
  
  // Tipo Lançamento
  tipoLancamento: varchar("tipo_lancamento", { length: 100 }),
  
  // Erro TISS (código de glosa / observação de glosa)
  erroTiss: varchar("erro_tiss", { length: 500 }),
  
  // Situação Item (PAGO/GLOSADO/etc)
  situacaoItem: varchar("situacao_item", { length: 50 }),
  
  // Tipo de Item (PROCEDIMENTO, MEDICAMENTO, MATERIAL, DIÁRIA, TAXA, GÁS MEDICINAL)
  tipoItem: varchar("tipo_item", { length: 30 }),
  
  // Valor Glosa (específico)
  valorGlosa: decimal("valor_glosa", { precision: 12, scale: 2 }),
  
  // Código Glosa TISS (ampliado para suportar justificativas longas do IPASGO)
  codigoGlosa: varchar("codigo_glosa", { length: 500 }),
  
  // Valor Informado (valor cobrado original)
  valorInformado: decimal("valor_informado", { precision: 12, scale: 2 }),
  
  // Código Solicitante
  codigoSolicitante: varchar("codigo_solicitante", { length: 50 }),
  
  // Nome Solicitante
  nomeSolicitante: varchar("nome_solicitante", { length: 255 }),
  
  // Acomodação da Internação
  acomodacaoInternacao: varchar("acomodacao_internacao", { length: 100 }),
  
  // Data Inicio Faturamento Internação
  dataInicioFaturamentoInternacao: timestamp("data_inicio_faturamento_internacao"),
  
  // Data Fim Faturamento Internação
  dataFimFaturamentoInternacao: timestamp("data_fim_faturamento_internacao"),
  
  // Código Prestador (executante)
  codigoPrestador: varchar("codigo_prestador", { length: 50 }),
  
  // Nome Prestador (executante)
  nomePrestador: varchar("nome_prestador", { length: 255 }),
  
  // Prestador Executante (código)
  prestadorExecutante: varchar("prestador_executante", { length: 50 }),
  
  // Nome Prestador Executante
  nomePrestadorExecutante: varchar("nome_prestador_executante", { length: 255 }),
  
  // Convênio, Data de Referência e Data de Pagamento (informados no upload)
  convenioId: int("convenioId"),
  dataReferencia: date("data_referencia"),
  dataPagamentoUpload: date("data_pagamento"),
  
  // Estabelecimento
  estabelecimentoId: int("estabelecimentoId"),
  
  // Data de importação
  dataImportacao: timestamp("data_importacao").defaultNow().notNull(),
});

export type RecebimentoExcel = typeof recebimentosExcel.$inferSelect;
export type InsertRecebimentoExcel = typeof recebimentosExcel.$inferInsert;


/**
 * Retorno TISS Unificado - Tabela unificada para dados de retorno de XML e Excel
 */
export const retornoTissUnificado = mysqlTable("retorno_tiss_unificado", {
  id: int("id").autoincrement().primaryKey(),
  
  // Vínculo com a tabela 'arquivos'
  arquivoId: int("arquivo_id").notNull(),
  
  // Identificação da Operadora/Demonstrativo
  numeroDemonstrativo: varchar("numero_demonstrativo", { length: 50 }),
  nomeOperadora: varchar("nome_operadora", { length: 150 }),
  cnpjOperadora: varchar("cnpj_operadora", { length: 20 }),
  dataEmissao: date("data_emissao"),
  
  // Dados do Protocolo/Lote
  numeroLotePrestador: varchar("numero_lote_prestador", { length: 50 }),
  numeroProtocolo: varchar("numero_protocolo", { length: 50 }),
  situacaoProtocolo: varchar("situacao_protocolo", { length: 10 }),
  
  // Dados da Guia e Beneficiário
  numeroGuiaPrestador: varchar("numero_guia_prestador", { length: 50 }),
  numeroGuiaOperadora: varchar("numero_guia_operadora", { length: 50 }),
  senha: varchar("senha", { length: 50 }),
  numeroCarteira: varchar("numero_carteira", { length: 50 }),
  nomeBeneficiario: varchar("nome_beneficiario", { length: 150 }),
  situacaoGuia: varchar("situacao_guia", { length: 10 }),
  
  // Detalhes do Item (Procedimento/Insumo)
  sequencialItem: int("sequencial_item"),
  dataRealizacao: date("data_realizacao"),
  codigoTabela: varchar("codigo_tabela", { length: 10 }),
  codigoItem: varchar("codigo_item", { length: 20 }),
  descricaoItem: varchar("descricao_item", { length: 255 }),
  
  // Valores de Conciliação
  quantidadeExecutada: decimal("quantidade_executada", { precision: 10, scale: 3 }),
  valorInformado: decimal("valor_informado", { precision: 12, scale: 2 }),
  valorProcessado: decimal("valor_processado", { precision: 12, scale: 2 }),
  valorLiberado: decimal("valor_liberado", { precision: 12, scale: 2 }),
  // valor_glosado é calculado automaticamente pelo banco (GENERATED ALWAYS AS)
  
  // Motivos de Glosa
  codigoGlosa: varchar("codigo_glosa", { length: 20 }),
  descricaoGlosa: text("descricao_glosa"),
  
  // Metadados
  origemDado: mysqlEnum("origem_dado", ["xml", "excel"]).notNull(),
  dataImportacao: timestamp("data_importacao").defaultNow().notNull(),
});

export type RetornoTissUnificado = typeof retornoTissUnificado.$inferSelect;
export type InsertRetornoTissUnificado = typeof retornoTissUnificado.$inferInsert;


// ============================================
// TABELA DEMONSTRATIVO - Unificada para XML e Excel de Retorno
// ============================================

export const demonstrativo = mysqlTable("demonstrativo", {
  id: int("id").primaryKey().autoincrement(),
  arquivoId: int("arquivo_id").notNull(),
  origemTipo: mysqlEnum("origem_tipo", ["xml", "excel"]).notNull(),
  convenioId: int("convenio_id"),
  
  // Identificação Principal
  numeroGuia: varchar("numero_guia", { length: 50 }),
  protocolo: varchar("protocolo", { length: 50 }),
  lotePrestador: varchar("lote_prestador", { length: 50 }),
  dataPagamento: date("data_pagamento"),
  
  // Beneficiário
  carteiraBeneficiario: varchar("carteira_beneficiario", { length: 50 }),
  nomeBeneficiario: varchar("nome_beneficiario", { length: 255 }),
  
  // Detalhes do Procedimento/Item
  sequencialItem: int("sequencial_item"),
  codigoItem: varchar("codigo_item", { length: 50 }),
  descricaoItem: text("descricao_item"),
  dataExecucao: date("data_execucao"),
  quantidade: decimal("quantidade", { precision: 12, scale: 3 }),
  
  // Valores Financeiros
  valorInformado: decimal("valor_informado", { precision: 12, scale: 2 }).default("0.00"),
  valorPago: decimal("valor_pago", { precision: 12, scale: 2 }).default("0.00"),
  valorGlosa: decimal("valor_glosa", { precision: 12, scale: 2 }).default("0.00"),
  
  // Status e Motivos
  codigoGlosa: varchar("codigo_glosa", { length: 500 }),
  situacaoItem: varchar("situacao_item", { length: 100 }),
  
  // Campos extras do Excel
  tipoLancamento: varchar("tipo_lancamento", { length: 100 }),
  erroTiss: varchar("erro_tiss", { length: 255 }),
  
  // Data de referência do arquivo
  dataReferencia: date("data_referencia"),
  
  // Estabelecimento
  estabelecimentoId: int("estabelecimentoId"),
  
  // Classificação de Glosa
  classificacaoGlosa: mysqlEnum("classificacao_glosa", [
    "pendente",
    "aceitar",
    "recursar",
    "auto_aceitar",
    "auto_recursar"
  ]).default("pendente"),
  classificacaoConfianca: int("classificacao_confianca"),
  classificacaoMotivo: text("classificacao_motivo"),
  motivoAceite: text("motivo_aceite"),
  dataAceite: timestamp("data_aceite"),
  recursoStatus: mysqlEnum("recurso_status", [
    "sem_recurso",
    "recurso_criado",
    "recurso_enviado",
    "recurso_deferido",
    "recurso_indeferido"
  ]).default("sem_recurso"),
  recursoId: int("recurso_id"),
  
  // Auditoria
  dataImportacaoSistema: timestamp("data_importacao_sistema").defaultNow().notNull(),
});

export type Demonstrativo = typeof demonstrativo.$inferSelect;
export type InsertDemonstrativo = typeof demonstrativo.$inferInsert;


/**
 * Avisos Internos (Banners de comunicados da empresa)
 * Gerenciados pelo administrador, exibidos na tela inicial após login
 */
export const avisosInternos = mysqlTable("avisosInternos", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  conteudo: text("conteudo").notNull(),
  tipo: mysqlEnum("tipo", ["informacao", "alerta", "urgente"]).default("informacao").notNull(),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  criadoPorId: int("criadoPorId").notNull(),
  criadoPorNome: varchar("criadoPorNome", { length: 255 }),
  expiraEm: timestamp("expiraEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AvisoInterno = typeof avisosInternos.$inferSelect;
export type InsertAvisoInterno = typeof avisosInternos.$inferInsert;


/**
 * Histórico de Validações de Arquivos XML
 * Persistência de resultados de validação de arquivos XML para análise de tendências
 */
export const historicoValidacaoXml = mysqlTable("historicoValidacaoXml", {
  id: int("id").autoincrement().primaryKey(),
  
  // Estabelecimento que realizou a validação
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Nome do arquivo XML validado
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  
  // Data de processamento do arquivo
  dataProcessamento: timestamp("dataProcessamento").notNull(),
  
  // Estatísticas de contas processadas
  totalContas: int("totalContas").default(0).notNull(),
  contasValidas: int("contasValidas").default(0).notNull(),
  contasInvalidas: int("contasInvalidas").default(0).notNull(),
  
  // Score de conformidade médio (0-100)
  scoreConformidadeMedio: decimal("scoreConformidadeMedio", { precision: 5, scale: 2 }).default("0"),
  
  // Resultado completo em JSON (divergências, violações, etc.)
  resultadoCompleto: json("resultadoCompleto"),
  
  // Usuário que realizou a validação
  usuarioId: int("usuarioId").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoValidacaoXml = typeof historicoValidacaoXml.$inferSelect;
export type InsertHistoricoValidacaoXml = typeof historicoValidacaoXml.$inferInsert;

// Tabela de auditoria
export const auditLog = mysqlTable('auditLog', {
  id: int('id').primaryKey().autoincrement(),
  tabela: varchar('tabela', { length: 100 }).notNull(),
  registroId: int('registroId').notNull(),
  tipoAcao: varchar('tipoAcao', { length: 20 }).notNull(),
  usuarioId: int('usuarioId').notNull(),
  usuarioNome: varchar('usuarioNome', { length: 255 }),
  valoresAnteriores: json('valoresAnteriores'),
  valoresNovos: json('valoresNovos'),
  estabelecimentoId: int('estabelecimentoId'),
  criadoEm: timestamp('criadoEm').defaultNow(),
});


/**
 * Atendimentos Consolidados
 * Tabela unificada para armazenar atendimentos de múltiplos sistemas (WARLEINE, TASY, etc)
 * com rastreabilidade de origem
 */
export const atendimentos = mysqlTable("atendimentos", {
  id: int("id").autoincrement().primaryKey(),
  
  // Rastreabilidade de origem
  origemSistema: varchar("origemSistema", { length: 50 }).notNull(), // 'WARLEINE', 'TASY', etc
  origemId: varchar("origemId", { length: 100 }).notNull(), // ID único no sistema de origem
  
  // Dados do atendimento
  estabelecimentoId: int("estabelecimentoId").notNull(),
  pacienteId: varchar("pacienteId", { length: 100 }),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  numeroAtendimento: varchar("numeroAtendimento", { length: 100 }),
  
  // Datas importantes
  dataAdmissao: timestamp("dataAdmissao"),
  dataAlta: timestamp("dataAlta"),
  dataAtendimento: timestamp("dataAtendimento"),
  
  // Informações clínicas
  tipoAtendimento: varchar("tipoAtendimento", { length: 50 }), // 'Internação', 'Ambulatório', 'Emergência'
  tipoSaida: varchar("tipoSaida", { length: 50 }), // 'Alta', 'Óbito', 'Transferência'
  
  // Localização
  local: varchar("local", { length: 100 }), // Setor, ala, leito
  
  // Profissionais
  carater: varchar("carater", { length: 100 }), // Caráter do atendimento
  servico: varchar("servico", { length: 100 }),
  
  // Procedimentos e custos
  procedimentoPrincipal: varchar("procedimentoPrincipal", { length: 255 }),
  centroCusto: varchar("centroCusto", { length: 100 }),
  
  // Dados brutos originais (para auditoria)
  dadosBrutos: json("dadosBrutos"),
  
  // Rastreamento
  sincronizadoEm: timestamp("sincronizadoEm").defaultNow().notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  origemIdx: index("idx_atend_origem").on(table.origemSistema, table.origemId),
  pacienteIdx: index("idx_atend_paciente").on(table.pacienteId),
  estabelecimentoIdx: index("idx_atend_estabelecimento").on(table.estabelecimentoId),
  dataAtendimentoIdx: index("idx_atend_data").on(table.dataAtendimento),
}));

export type Atendimento = typeof atendimentos.$inferSelect;
export type InsertAtendimento = typeof atendimentos.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

/**
 * NOTIFICAÇÕES DE ATENDIMENTOS
 * Armazena as notificações registradas para cada atendimento (banco interno MySQL)
 */

export const notificacoesAtendimento = mysqlTable("notificacoes_atendimento", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência ao atendimento
  numatend: varchar("numatend", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  
  // Dados da notificação
  observacao: text("observacao").notNull().default(""),
  usuario: varchar("usuario", { length: 255 }),
  
  // Metadados
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  numatendIdx: index("idx_notif_atend_numatend").on(table.numatend),
  estabelecimentoIdx: index("idx_notif_atend_estab").on(table.estabelecimentoId),
  criadoEmIdx: index("idx_notif_atend_criado").on(table.criadoEm),
}));

export const notificacoesAtendimentoItem = mysqlTable("notificacoes_atendimento_item", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência à notificação pai
  notificacaoId: int("notificacaoId").notNull(),
  
  // Dados do item
  motivo: varchar("motivo", { length: 255 }).notNull(),
  setor: varchar("setor", { length: 255 }).notNull().default(""),
  medico: varchar("medico", { length: 255 }).notNull().default(""),
  
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  notificacaoIdx: index("idx_notif_item_notificacao").on(table.notificacaoId),
  motivoIdx: index("idx_notif_item_motivo").on(table.motivo),
}));

export type NotificacaoAtendimento = typeof notificacoesAtendimento.$inferSelect;
export type InsertNotificacaoAtendimento = typeof notificacoesAtendimento.$inferInsert;
export type NotificacaoAtendimentoItem = typeof notificacoesAtendimentoItem.$inferSelect;
export type InsertNotificacaoAtendimentoItem = typeof notificacoesAtendimentoItem.$inferInsert;


// =====================================================
// INTEGRADOR DE DADOS - Metadados de Configuração
// =====================================================

/**
 * Conexões de banco de dados externas configuradas pelo admin
 */
export const integracaoConexoes = mysqlTable("integracao_conexoes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipo", ["postgresql", "mysql", "sqlserver", "oracle"]).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  porta: int("porta").notNull(),
  banco: varchar("banco", { length: 255 }).notNull(),
  usuario: varchar("usuario", { length: 255 }).notNull(),
  senhaEncriptada: text("senhaEncriptada").notNull(),
  ssl: mysqlEnum("ssl", ["sim", "nao"]).default("nao").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  ultimoTesteConexao: timestamp("ultimoTesteConexao"),
  statusConexao: mysqlEnum("statusConexao", ["ok", "erro", "nao_testado"]).default("nao_testado").notNull(),
  erroConexao: text("erroConexao"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabIdx: index("idx_integ_conexao_estab").on(table.estabelecimentoId),
}));

export type IntegracaoConexao = typeof integracaoConexoes.$inferSelect;
export type InsertIntegracaoConexao = typeof integracaoConexoes.$inferInsert;

/**
 * Tabelas criadas dinamicamente pelo integrador
 */
export const integracaoTabelas = mysqlTable("integracao_tabelas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  nomeExibicao: varchar("nomeExibicao", { length: 255 }).notNull(),
  descricao: text("descricao"),
  estabelecimentoId: int("estabelecimentoId"),
  criadaNoBanco: mysqlEnum("criadaNoBanco", ["sim", "nao"]).default("nao").notNull(),
  totalRegistros: int("totalRegistros").default(0).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nomeIdx: index("idx_integ_tabela_nome").on(table.nome),
  estabIdx: index("idx_integ_tabela_estab").on(table.estabelecimentoId),
}));

export type IntegracaoTabela = typeof integracaoTabelas.$inferSelect;
export type InsertIntegracaoTabela = typeof integracaoTabelas.$inferInsert;

/**
 * Colunas das tabelas criadas pelo integrador
 */
export const integracaoColunas = mysqlTable("integracao_colunas", {
  id: int("id").autoincrement().primaryKey(),
  tabelaId: int("tabelaId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  nomeExibicao: varchar("nomeExibicao", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", ["varchar", "int", "bigint", "decimal", "text", "date", "datetime", "boolean"]).notNull(),
  tamanho: int("tamanho"), // Para varchar
  precisao: int("precisao"), // Para decimal
  obrigatorio: mysqlEnum("obrigatorio", ["sim", "nao"]).default("nao").notNull(),
  chaveUnica: mysqlEnum("chaveUnica", ["sim", "nao"]).default("nao").notNull(),
  valorPadrao: varchar("valorPadrao", { length: 255 }),
  ordem: int("ordem").default(0).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  tabelaIdx: index("idx_integ_coluna_tabela").on(table.tabelaId),
}));

export type IntegracaoColuna = typeof integracaoColunas.$inferSelect;
export type InsertIntegracaoColuna = typeof integracaoColunas.$inferInsert;

/**
 * Mapeamentos de campos (origem → destino) para sincronização
 */
export const integracaoMapeamentos = mysqlTable("integracao_mapeamentos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  conexaoOrigemId: int("conexaoOrigemId").notNull(),
  tabelaDestinoId: int("tabelaDestinoId").notNull(),
  queryOrigem: text("queryOrigem").notNull(), // SQL para buscar dados na origem
  campoChave: varchar("campoChave", { length: 255 }), // Campo usado como chave para upsert
  frequencia: mysqlEnum("frequencia", ["manual", "5min", "15min", "30min", "1hora", "6horas", "12horas", "diario"]).default("manual").notNull(),
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  estabelecimentoId: int("estabelecimentoId"),
  // Importação incremental
  modoImportacao: mysqlEnum("modoImportacao", ["completa", "incremental"]).default("completa").notNull(),
  colunaControle: varchar("colunaControle", { length: 255 }), // Coluna usada para controle incremental (ex: id, updated_at)
  ultimoValorControle: text("ultimoValorControle"), // Último valor importado da coluna de controle
  ultimaSincronizacao: timestamp("ultimaSincronizacao"), // Data/hora da última sincronização bem-sucedida
  totalRegistrosImportados: int("totalRegistrosImportados").default(0).notNull(), // Total acumulado de registros importados
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conexaoIdx: index("idx_integ_map_conexao").on(table.conexaoOrigemId),
  tabelaIdx: index("idx_integ_map_tabela").on(table.tabelaDestinoId),
  estabIdx: index("idx_integ_map_estab").on(table.estabelecimentoId),
}));

export type IntegracaoMapeamento = typeof integracaoMapeamentos.$inferSelect;
export type InsertIntegracaoMapeamento = typeof integracaoMapeamentos.$inferInsert;

/**
 * Mapeamento de campos individuais (coluna origem → coluna destino)
 */
export const integracaoMapeamentoCampos = mysqlTable("integracao_mapeamento_campos", {
  id: int("id").autoincrement().primaryKey(),
  mapeamentoId: int("mapeamentoId").notNull(),
  colunaOrigemNome: varchar("colunaOrigemNome", { length: 255 }).notNull(),
  colunaDestinoId: int("colunaDestinoId").notNull(),
  transformacao: text("transformacao"), // Expressão de transformação opcional (ex: UPPER, TRIM, etc.)
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  mapIdx: index("idx_integ_mapcampo_map").on(table.mapeamentoId),
}));

export type IntegracaoMapeamentoCampo = typeof integracaoMapeamentoCampos.$inferSelect;
export type InsertIntegracaoMapeamentoCampo = typeof integracaoMapeamentoCampos.$inferInsert;

/**
 * Log de sincronizações executadas
 */
export const integracaoSincronizacoes = mysqlTable("integracao_sincronizacoes", {
  id: int("id").autoincrement().primaryKey(),
  mapeamentoId: int("mapeamentoId").notNull(),
  status: mysqlEnum("status", ["executando", "sucesso", "erro", "cancelado"]).notNull(),
  registrosLidos: int("registrosLidos").default(0).notNull(),
  registrosInseridos: int("registrosInseridos").default(0).notNull(),
  registrosAtualizados: int("registrosAtualizados").default(0).notNull(),
  registrosErro: int("registrosErro").default(0).notNull(),
  erroMensagem: text("erroMensagem"),
  iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
  finalizadoEm: timestamp("finalizadoEm"),
  duracaoMs: int("duracaoMs"),
  executadoPor: varchar("executadoPor", { length: 255 }),
}, (table) => ({
  mapIdx: index("idx_integ_sync_map").on(table.mapeamentoId),
  statusIdx: index("idx_integ_sync_status").on(table.status),
  inicioIdx: index("idx_integ_sync_inicio").on(table.iniciadoEm),
}));

export type IntegracaoSincronizacao = typeof integracaoSincronizacoes.$inferSelect;
export type InsertIntegracaoSincronizacao = typeof integracaoSincronizacoes.$inferInsert;

/**
 * Tabela de Recebimento Geral
 * Consolida dados de recebimento de todos os convênios e estabelecimentos
 */
export const recebimentoGeral = mysqlTable("recebimento_geral", {
  id: int("id").autoincrement().primaryKey(),
  sincronizado: timestamp("sincronizado"),
  atualizado: timestamp("atualizado"),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  convenioId: int("convenioId"),
  convenio: varchar("convenio", { length: 255 }),
  mesProducao: varchar("mes_producao", { length: 20 }),
  fatura: varchar("fatura", { length: 100 }),
  codigoRecurso: varchar("codigo_recurso", { length: 100 }),
  tipoProcedimento: varchar("tipo_procedimento", { length: 255 }),
  protocolo: varchar("protocolo", { length: 100 }),
  numeroConta: varchar("numero_conta", { length: 100 }),
  guiaCobranca: varchar("guia_cobranca", { length: 100 }),
  guiaOperadora: varchar("guia_operadora", { length: 100 }),
  descricaoItem: text("descricao_item"),
  carteirinha: varchar("carteirinha", { length: 100 }),
  dataConta: varchar("data_conta", { length: 20 }),
  dataInternacao: varchar("data_internacao", { length: 20 }),
  dataSaida: varchar("data_saida", { length: 20 }),
  codigoConvenio: varchar("codigo_convenio", { length: 50 }),
  codigoSistema: varchar("codigo_sistema", { length: 50 }),
  tipoDescricao: varchar("tipo_descricao", { length: 255 }),
  funcaoTiss: varchar("funcao_tiss", { length: 255 }),
  receberHospital: varchar("receber_hospital", { length: 1 }),
  codigoSetor: varchar("codigo_setor", { length: 50 }),
  nomeSetor: varchar("nome_setor", { length: 255 }),
  prestadorExecutante: varchar("prestador_executante", { length: 255 }),
  nomePrestador: varchar("nome_prestador", { length: 255 }),
  quantidadeItem: decimal("quantidade_item", { precision: 15, scale: 4 }),
  vlUnitario: decimal("vl_unitario", { precision: 15, scale: 2 }),
  vlFaturado: decimal("vl_faturado", { precision: 15, scale: 2 }),
  vlRecebido: decimal("vl_recebido", { precision: 15, scale: 2 }),
  vlRecebAMaior: decimal("vl_receb_a_maior", { precision: 15, scale: 2 }),
  vlTotalRecebido: decimal("vl_total_recebido", { precision: 15, scale: 2 }),
  vlAberto: decimal("vl_aberto", { precision: 15, scale: 2 }),
  vlGlosas: decimal("vl_glosas", { precision: 15, scale: 2 }),
  vlRecurso: decimal("vl_recurso", { precision: 15, scale: 2 }),
  glAceita: decimal("gl_aceita", { precision: 15, scale: 2 }),
  glAnalise: decimal("gl_analise", { precision: 15, scale: 2 }),
  glRecuperado: decimal("gl_recuperado", { precision: 15, scale: 2 }),
  codigoTiss: varchar("codigo_tiss", { length: 50 }),
  descricaoMotivo: text("descricao_motivo"),
  complementoRecurso: text("complemento_recurso"),
  tipoAtendimento: varchar("tipo_atendimento", { length: 255 }),
}, (table) => ({
  estabIdx: index("idx_receb_geral_estab").on(table.estabelecimentoId),
  convenioIdx: index("idx_receb_geral_convenio").on(table.convenio),
  mesIdx: index("idx_receb_geral_mes").on(table.mesProducao),
  protocoloIdx: index("idx_receb_geral_protocolo").on(table.protocolo),
  contaIdx: index("idx_receb_geral_conta").on(table.numeroConta),
  convenioIdIdx: index("idx_receb_geral_convenio_id").on(table.convenioId),
}));

export type RecebimentoGeral = typeof recebimentoGeral.$inferSelect;
export type InsertRecebimentoGeral = typeof recebimentoGeral.$inferInsert;


/**
 * Mapeamento de Convênios (De-Para)
 * Associa nomes/códigos de convênios vindos do hospital (Tasy/integração)
 * aos IDs dos convênios cadastrados no Safatle.
 * Permite que cada estabelecimento tenha seu próprio mapeamento.
 */
export const convenioMapeamento = mysqlTable("convenio_mapeamento", {
  id: int("id").autoincrement().primaryKey(),
  
  // Estabelecimento (cada hospital pode ter nomes diferentes para o mesmo convênio)
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Dados de origem (como vem do hospital)
  nomeOrigem: varchar("nome_origem", { length: 255 }).notNull(), // Nome do convênio como vem do hospital (ex: "BRADESCO SAUDE")
  codigoOrigem: varchar("codigo_origem", { length: 50 }), // Código do convênio no hospital (ex: "0016")
  
  // Referência ao convênio no Safatle
  convenioId: int("convenioId").notNull(), // FK para tabela convenios
  
  // Fonte dos dados (de qual sistema/tabela veio)
  fonte: mysqlEnum("fonte", ["tasy", "integracao", "xml", "excel", "manual"]).default("manual").notNull(),
  
  // Status
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  
  // Quem criou o mapeamento
  criadoPor: int("criadoPor"), // userId
  metodoMatch: mysqlEnum("metodo_match", ["automatico", "manual"]).default("manual").notNull(),
  confianca: decimal("confianca", { precision: 5, scale: 2 }), // Score de confiança do match automático (0-100)
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabIdx: index("idx_conv_map_estab").on(table.estabelecimentoId),
  nomeOrigemIdx: index("idx_conv_map_nome_origem").on(table.nomeOrigem),
  convenioIdIdx: index("idx_conv_map_convenio_id").on(table.convenioId),
  uniqueMapping: index("idx_conv_map_unique").on(table.estabelecimentoId, table.nomeOrigem, table.codigoOrigem),
}));

export type ConvenioMapeamento = typeof convenioMapeamento.$inferSelect;
export type InsertConvenioMapeamento = typeof convenioMapeamento.$inferInsert;


/**
 * Vinculação de Códigos - De-Para entre códigos do hospital e do convênio
 * Quando o hospital envia um item com código X e o convênio devolve com código Y,
 * essa tabela armazena a vinculação para cruzamentos futuros automáticos.
 */
export const vinculacaoCodigos = mysqlTable("vinculacao_codigos", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  convenioId: int("convenioId"), // Pode variar por convênio
  
  // Código do hospital (enviado no faturamento)
  codigoHospital: varchar("codigoHospital", { length: 50 }).notNull(),
  descricaoHospital: text("descricaoHospital"),
  
  // Código do convênio (recebido no demonstrativo)
  codigoConvenio: varchar("codigoConvenio", { length: 50 }).notNull(),
  descricaoConvenio: text("descricaoConvenio"),
  
  // Classificação
  tipoItem: mysqlEnum("tipoItem", ["medicamento", "material", "procedimento", "taxa", "diaria", "gas", "outros"]).default("outros"),
  
  // Controle
  ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
  criadoPor: int("criadoPor"), // userId que criou a vinculação
  metodoMatch: mysqlEnum("metodo_match", ["automatico", "manual"]).default("manual").notNull(),
  confianca: decimal("confianca", { precision: 5, scale: 2 }), // Score de confiança (0-100)
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabIdx: index("idx_vinc_cod_estab").on(table.estabelecimentoId),
  codHospIdx: index("idx_vinc_cod_hospital").on(table.codigoHospital),
  codConvIdx: index("idx_vinc_cod_convenio").on(table.codigoConvenio),
  uniqueVinc: index("idx_vinc_unique").on(table.estabelecimentoId, table.convenioId, table.codigoHospital, table.codigoConvenio),
}));

export type VinculacaoCodigo = typeof vinculacaoCodigos.$inferSelect;
export type InsertVinculacaoCodigo = typeof vinculacaoCodigos.$inferInsert;


/**
 * Padrão de Preço por Procedimento/Convênio
 * Armazena estatísticas de preço para cada combinação item+convênio
 */
export const padraoPrecoConvenio = mysqlTable("padraoPrecoConvenio", {
  id: int("id").autoincrement().primaryKey(),
  
  estabelecimentoId: int("estabelecimentoId").notNull(),
  convenio: varchar("convenio", { length: 255 }).notNull(),
  setor: varchar("setor", { length: 255 }), // Setor de atendimento (ex: CENTRO CIRURGICO, POSTO I)
  
  codigoItem: varchar("codigoItem", { length: 50 }).notNull(),
  descricaoItem: varchar("descricaoItem", { length: 500 }),
  tipoItem: varchar("tipoItem", { length: 50 }),
  
  // Estatísticas de preço unitário
  mediaUnitario: decimal("mediaUnitario", { precision: 12, scale: 4 }),
  minUnitario: decimal("minUnitario", { precision: 12, scale: 4 }),
  maxUnitario: decimal("maxUnitario", { precision: 12, scale: 4 }),
  desvioUnitario: decimal("desvioUnitario", { precision: 12, scale: 4 }),
  
  // Estatísticas de valor faturado
  mediaFaturado: decimal("mediaFaturado", { precision: 12, scale: 4 }),
  minFaturado: decimal("minFaturado", { precision: 12, scale: 4 }),
  maxFaturado: decimal("maxFaturado", { precision: 12, scale: 4 }),
  desvioFaturado: decimal("desvioFaturado", { precision: 12, scale: 4 }),
  
  // Volume
  totalOcorrencias: int("totalOcorrencias").default(0).notNull(),
  totalContas: int("totalContas").default(0).notNull(),
  
  // Confiança (0-100) - baseada no volume de dados
  confianca: int("confianca").default(0).notNull(),
  
  // Período analisado
  competenciaInicio: varchar("competenciaInicio", { length: 7 }),
  competenciaFim: varchar("competenciaFim", { length: 7 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabConvItemIdx: index("idx_ppc_estab_conv_item").on(table.estabelecimentoId, table.convenio, table.codigoItem),
  convenioIdx: index("idx_ppc_convenio").on(table.convenio),
  setorIdx: index("idx_ppc_setor").on(table.setor),
}));
export type PadraoPrecoConvenio = typeof padraoPrecoConvenio.$inferSelect;
export type InsertPadraoPrecoConvenio = typeof padraoPrecoConvenio.$inferInsert;

/**
 * Padrão de Glosa por Convênio
 * Armazena taxa de glosa histórica por item e convênio
 */
export const padraoGlosaConvenio = mysqlTable("padraoGlosaConvenio", {
  id: int("id").autoincrement().primaryKey(),
  
  estabelecimentoId: int("estabelecimentoId").notNull(),
  convenio: varchar("convenio", { length: 255 }).notNull(),
  
  codigoItem: varchar("codigoItem", { length: 50 }).notNull(),
  descricaoItem: varchar("descricaoItem", { length: 500 }),
  tipoItem: varchar("tipoItem", { length: 50 }),
  
  // Estatísticas de glosa
  totalFaturado: int("totalFaturado").default(0).notNull(), // Vezes que o item foi faturado
  totalGlosado: int("totalGlosado").default(0).notNull(), // Vezes que foi glosado
  taxaGlosa: decimal("taxaGlosa", { precision: 5, scale: 2 }).default("0"), // % de glosa
  
  valorTotalFaturado: decimal("valorTotalFaturado", { precision: 14, scale: 2 }).default("0"),
  valorTotalGlosado: decimal("valorTotalGlosado", { precision: 14, scale: 2 }).default("0"),
  valorTotalPago: decimal("valorTotalPago", { precision: 14, scale: 2 }).default("0"),
  
  // Códigos de glosa mais frequentes (JSON array)
  // [{codigoGlosa, descricao, frequencia}]
  codigosGlosaFrequentes: json("codigosGlosaFrequentes"),
  
  // Risco (calculado)
  nivelRisco: mysqlEnum("nivelRisco", ["baixo", "medio", "alto", "critico"]).default("baixo").notNull(),
  
  // Período analisado
  competenciaInicio: varchar("competenciaInicio", { length: 7 }),
  competenciaFim: varchar("competenciaFim", { length: 7 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabConvItemIdx: index("idx_pgc_estab_conv_item").on(table.estabelecimentoId, table.convenio, table.codigoItem),
  convenioIdx: index("idx_pgc_convenio").on(table.convenio),
  riscoIdx: index("idx_pgc_risco").on(table.nivelRisco),
}));
export type PadraoGlosaConvenio = typeof padraoGlosaConvenio.$inferSelect;
export type InsertPadraoGlosaConvenio = typeof padraoGlosaConvenio.$inferInsert;

/**
 * Padrão de Quantidade por Item
 * Armazena estatísticas de quantidade utilizada por item e convênio
 */
export const padraoQuantidadeItem = mysqlTable("padraoQuantidadeItem", {
  id: int("id").autoincrement().primaryKey(),
  
  estabelecimentoId: int("estabelecimentoId").notNull(),
  convenio: varchar("convenio", { length: 255 }),
  setor: varchar("setor", { length: 255 }),
  
  codigoItem: varchar("codigoItem", { length: 50 }).notNull(),
  descricaoItem: varchar("descricaoItem", { length: 500 }),
  tipoItem: varchar("tipoItem", { length: 50 }),
  
  // Estatísticas de quantidade por atendimento/conta
  mediaQuantidade: decimal("mediaQuantidade", { precision: 10, scale: 4 }),
  minQuantidade: decimal("minQuantidade", { precision: 10, scale: 4 }),
  maxQuantidade: decimal("maxQuantidade", { precision: 10, scale: 4 }),
  desvioQuantidade: decimal("desvioQuantidade", { precision: 10, scale: 4 }),
  medianaQuantidade: decimal("medianaQuantidade", { precision: 10, scale: 4 }),
  
  // Volume
  totalOcorrencias: int("totalOcorrencias").default(0).notNull(),
  totalContas: int("totalContas").default(0).notNull(),
  
  // Limites sugeridos para alertas
  limiteInferior: decimal("limiteInferior", { precision: 10, scale: 4 }),
  limiteSuperior: decimal("limiteSuperior", { precision: 10, scale: 4 }),
  
  // Confiança (0-100)
  confianca: int("confianca").default(0).notNull(),
  
  // Período analisado
  competenciaInicio: varchar("competenciaInicio", { length: 7 }),
  competenciaFim: varchar("competenciaFim", { length: 7 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabConvItemIdx: index("idx_pqi_estab_conv_item").on(table.estabelecimentoId, table.convenio, table.codigoItem),
  setorIdx: index("idx_pqi_setor").on(table.setor),
}));
export type PadraoQuantidadeItem = typeof padraoQuantidadeItem.$inferSelect;
export type InsertPadraoQuantidadeItem = typeof padraoQuantidadeItem.$inferInsert;


// ============================================================
// CONTAS CONVÊNIO - Tabela Operacional Unificada
// ============================================================

/**
 * Tabela operacional para gestão de contas de convênio.
 * Alimentada por DUAS fontes:
 *   1. XML imports (TISS) - parseados e salvos
 *   2. Busca em tempo real no banco do cliente (Warleine) por número de conta
 * 
 * Separada das tabelas de bulk sync (integ_faturado, faturamento_tiss, faturamento_unificado)
 * que servem para análise e geração de padrões.
 */
export const contasConvenioItens = mysqlTable("contas_convenio_itens", {
  id: int("id").autoincrement().primaryKey(),
  
  // Origem do dado
  origem: mysqlEnum("origem", ["XML", "BANCO_CLIENTE"]).notNull(),
  
  // Identificação da conta
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  numeroGuia: varchar("numeroGuia", { length: 100 }),
  numeroGuiaOperadora: varchar("numeroGuiaOperadora", { length: 100 }),
  numeroLote: varchar("numeroLote", { length: 50 }),
  senha: varchar("senha", { length: 50 }),
  protocolo: varchar("protocolo", { length: 100 }),
  
  // Paciente
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  carteiraBeneficiario: varchar("carteiraBeneficiario", { length: 100 }),
  
  // Convênio
  convenio: varchar("convenio", { length: 255 }),
  convenioId: int("convenioId"),
  
  // Estabelecimento
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Item
  tipoItem: varchar("tipoItem", { length: 50 }), // PROCEDIMENTO, DIARIA, MAT_MED, TAXA, GASES, etc.
  codigoItem: varchar("codigoItem", { length: 50 }),
  codigoItemTuss: varchar("codigoItemTuss", { length: 50 }),
  descricaoItem: text("descricaoItem"),
  codigoTabela: varchar("codigoTabela", { length: 10 }),
  
  // Valores
  quantidade: decimal("quantidade", { precision: 12, scale: 4 }),
  valorUnitario: decimal("valorUnitario", { precision: 12, scale: 4 }),
  valorTotal: decimal("valorTotal", { precision: 14, scale: 2 }),
  
  // Datas
  dataExecucao: timestamp("dataExecucao"),
  dataReferencia: timestamp("dataReferencia"),
  competencia: varchar("competencia", { length: 20 }),
  
  // Profissional
  profissionalExecutante: varchar("profissionalExecutante", { length: 255 }),
  setor: varchar("setor", { length: 255 }),
  
  // Referência ao arquivo de origem (se veio de XML)
  arquivoId: int("arquivoId"),
  
  // Status da análise de padrões
  statusAnalise: mysqlEnum("statusAnalise", [
    "pendente",     // Ainda não analisado contra padrões
    "conforme",     // Dentro dos padrões
    "divergente",   // Fora dos padrões (tem alertas)
    "revisado",     // Revisado manualmente
  ]).default("pendente").notNull(),
  
  // Divergências encontradas (JSON array de alertas)
  // [{tipo, severidade, mensagem, valorEsperado, valorEncontrado, padraoId}]
  divergencias: json("divergencias"),
  
  // Metadados
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  numContaIdx: index("idx_cci_numconta").on(table.numeroConta),
  convenioIdx: index("idx_cci_convenio").on(table.convenio),
  estabIdx: index("idx_cci_estab").on(table.estabelecimentoId),
  origemIdx: index("idx_cci_origem").on(table.origem),
  statusIdx: index("idx_cci_status").on(table.statusAnalise),
  competenciaIdx: index("idx_cci_competencia").on(table.competencia),
  codigoItemIdx: index("idx_cci_codigo_item").on(table.codigoItem),
  guiaIdx: index("idx_cci_guia").on(table.numeroGuia),
}));

export type ContaConvenioItem = typeof contasConvenioItens.$inferSelect;
export type InsertContaConvenioItem = typeof contasConvenioItens.$inferInsert;

/**
 * Tabela de resumo de contas convênio (cabeçalho da conta)
 * Armazena metadados da conta como um todo, não dos itens individuais
 */
export const contasConvenioResumo = mysqlTable("contas_convenio_resumo", {
  id: int("id").autoincrement().primaryKey(),
  
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Origem
  origem: mysqlEnum("origem", ["XML", "BANCO_CLIENTE"]).notNull(),
  
  // Dados da conta
  convenio: varchar("convenio", { length: 255 }),
  convenioId: int("convenioId"),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  carteiraBeneficiario: varchar("carteiraBeneficiario", { length: 100 }),
  
  // Totais
  totalItens: int("totalItens").default(0).notNull(),
  valorTotal: decimal("valorTotal", { precision: 14, scale: 2 }).default("0"),
  
  // Datas
  dataInternacao: timestamp("dataInternacao"),
  dataAlta: timestamp("dataAlta"),
  competencia: varchar("competencia", { length: 20 }),
  
  // Status geral da análise
  statusAnalise: mysqlEnum("statusAnaliseResumo", [
    "pendente",
    "conforme",
    "divergente",
    "revisado",
  ]).default("pendente").notNull(),
  
  // Resumo de divergências
  totalDivergencias: int("totalDivergencias").default(0),
  totalAlertas: int("totalAlertas").default(0),
  
  // Score de Risco (0-100)
  scoreRisco: int("scoreRisco"),
  detalhesRisco: json("detalhesRisco"), // {score, composicao, preco, quantidade, glosa, detalhes[]}
  isOutlierValor: int("isOutlierValor").default(0), // 1 = outlier de valor
  
  // Divergências que não pertencem a nenhum item específico (ITEM_FALTANTE, etc.)
  divergenciasGerais: json("divergenciasGerais"), // Array de divergências órfãs (sem item correspondente na conta)
  
  // Metadados
  dataBusca: timestamp("dataBusca").defaultNow().notNull(),
  buscadoPor: int("buscadoPor"), // userId
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  numContaEstabIdx: index("idx_ccr_numconta_estab").on(table.numeroConta, table.estabelecimentoId),
  convenioIdx: index("idx_ccr_convenio").on(table.convenio),
  statusIdx: index("idx_ccr_status").on(table.statusAnalise),
}));

export type ContaConvenioResumo = typeof contasConvenioResumo.$inferSelect;
export type InsertContaConvenioResumo = typeof contasConvenioResumo.$inferInsert;

/**
 * Feedback de Divergências - Registra decisões do auditor sobre divergências encontradas
 * Alimenta o feedback loop para refinar os padrões de cobrança
 */
export const feedbackDivergencias = mysqlTable("feedback_divergencias", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência à conta e item
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  codigoItem: varchar("codigoItem", { length: 50 }),
  
  // Referência ao padrão
  padraoId: int("padraoId"),
  
  // Tipo da divergência original
  tipoDivergencia: varchar("tipoDivergencia", { length: 50 }).notNull(), // PRECO, QUANTIDADE, ITEM_FALTANTE, ITEM_EXTRA, COMPOSICAO, GLOSA_RISCO
  
  // Decisão do auditor
  decisao: mysqlEnum("decisao", [
    "aceitar",       // Divergência é válida, padrão deve ser ajustado
    "rejeitar",      // Divergência é falso positivo, conta está correta
    "ignorar",       // Não relevante para este caso
  ]).notNull(),
  
  // Justificativa do auditor
  justificativa: text("justificativa"),
  
  // Dados da divergência original (snapshot)
  dadosDivergencia: json("dadosDivergencia"),
  
  // Usuário que deu o feedback
  usuarioId: int("usuarioId").notNull(),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  padraoIdx: index("idx_fd_padrao").on(table.padraoId),
  estabIdx: index("idx_fd_estab").on(table.estabelecimentoId),
  decisaoIdx: index("idx_fd_decisao").on(table.decisao),
}));

export type FeedbackDivergencia = typeof feedbackDivergencias.$inferSelect;
export type InsertFeedbackDivergencia = typeof feedbackDivergencias.$inferInsert;


/**
 * Tabela CBHPM - Classificação Brasileira Hierarquizada de Procedimentos Médicos
 * Base de referência para porte anestésico e compatibilidade de taxas
 */
export const tabelaCbhpm = mysqlTable("tabelaCbhpm", {
  id: int("id").autoincrement().primaryKey(),
  
  codigoProcedimento: varchar("codigoProcedimento", { length: 20 }).notNull(),
  descricaoProcedimento: varchar("descricaoProcedimento", { length: 500 }),
  
  // Porte do procedimento (1 a 8, ou especial)
  porte: varchar("porte", { length: 10 }),
  
  // Porte anestésico esperado (1 a 8)
  porteAnestesico: varchar("porteAnestesico", { length: 10 }),
  
  // Custo operacional (CO)
  custoOperacional: decimal("custoOperacional", { precision: 14, scale: 2 }),
  
  // Número de auxiliares
  numAuxiliares: int("numAuxiliares").default(0),
  
  // Incidência (percentual do porte para anestesia)
  incidencia: decimal("incidencia", { precision: 5, scale: 2 }),
  
  // Filme radiológico (quantidade padrão)
  filmeRadiologico: int("filmeRadiologico").default(0),
  
  // Grupo/Subgrupo do procedimento
  grupo: varchar("grupo", { length: 100 }),
  subgrupo: varchar("subgrupo", { length: 100 }),
  
  // Versão da tabela CBHPM
  versao: varchar("versao", { length: 20 }).default("6a"),
  
  // Observações
  observacoes: text("observacoes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  codigoIdx: index("idx_cbhpm_codigo").on(table.codigoProcedimento),
  porteIdx: index("idx_cbhpm_porte").on(table.porte),
  porteAnestIdx: index("idx_cbhpm_porte_anest").on(table.porteAnestesico),
}));

export type TabelaCbhpm = typeof tabelaCbhpm.$inferSelect;
export type InsertTabelaCbhpm = typeof tabelaCbhpm.$inferInsert;

/**
 * Tabela de Porte por Convênio
 * Regras específicas de cada convênio para porte de sala e anestesia
 * Sobrescreve a CBHPM quando o convênio tem tabela própria (ex: Unimed, Ipasgo)
 */
export const tabelaPorteConvenio = mysqlTable("tabelaPorteConvenio", {
  id: int("id").autoincrement().primaryKey(),
  
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Convênio que possui tabela própria
  convenio: varchar("convenio", { length: 255 }).notNull(),
  
  // Código do procedimento
  codigoProcedimento: varchar("codigoProcedimento", { length: 20 }).notNull(),
  descricaoProcedimento: varchar("descricaoProcedimento", { length: 500 }),
  
  // Porte específico do convênio (pode diferir da CBHPM)
  porte: varchar("porte", { length: 10 }),
  porteAnestesico: varchar("porteAnestesico", { length: 10 }),
  
  // Valor da taxa de sala esperado para este porte
  valorTaxaSala: decimal("valorTaxaSala", { precision: 14, scale: 2 }),
  
  // Valor do honorário anestésico esperado
  valorHonorarioAnestesico: decimal("valorHonorarioAnestesico", { precision: 14, scale: 2 }),
  
  // Custo operacional específico do convênio
  custoOperacional: decimal("custoOperacional", { precision: 14, scale: 2 }),
  
  // Vigência
  vigenciaInicio: timestamp("vigenciaInicio"),
  vigenciaFim: timestamp("vigenciaFim"),
  
  // Origem da informação (manual, importação, contrato)
  origem: varchar("origem", { length: 50 }).default("manual"),
  
  // Observações
  observacoes: text("observacoes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabConvIdx: index("idx_porte_conv_estab").on(table.estabelecimentoId, table.convenio),
  codigoIdx: index("idx_porte_conv_codigo").on(table.codigoProcedimento),
  convCodigoIdx: index("idx_porte_conv_conv_codigo").on(table.convenio, table.codigoProcedimento),
}));

export type TabelaPorteConvenio = typeof tabelaPorteConvenio.$inferSelect;
export type InsertTabelaPorteConvenio = typeof tabelaPorteConvenio.$inferInsert;


/**
 * Falhas de Prontuário - Registra falhas encontradas pela auditora no prontuário do paciente
 * Cada registro é um checkbox marcado + observação
 */
export const falhasProntuario = mysqlTable("falhas_prontuario", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência à conta
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Tipo da falha (checkbox marcado)
  tipoFalha: varchar("tipoFalha", { length: 100 }).notNull(),
  // Categorias: EVOLUCAO, PRESCRICAO, CHECAGEM, AUTORIZACAO, DOCUMENTACAO, IDENTIFICACAO, CONSENTIMENTO, ALERGIA, ALTA, OUTRO
  categoriaFalha: varchar("categoriaFalha", { length: 50 }).notNull(),
  
  // Descrição/observação da auditora
  descricao: text("descricao"),
  
  // Severidade
  severidade: mysqlEnum("severidade", ["leve", "moderada", "grave", "critica"]).default("moderada").notNull(),
  
  // Status
  status: mysqlEnum("statusFalha", ["aberta", "corrigida", "justificada"]).default("aberta").notNull(),
  
  // Quem registrou
  usuarioId: int("usuarioId").notNull(),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  contaIdx: index("idx_fp_conta").on(table.numeroConta, table.estabelecimentoId),
  categoriaIdx: index("idx_fp_categoria").on(table.categoriaFalha),
  statusIdx: index("idx_fp_status").on(table.status),
}));

export type FalhaProntuario = typeof falhasProntuario.$inferSelect;
export type InsertFalhaProntuario = typeof falhasProntuario.$inferInsert;

/**
 * Ajustes de Auditoria - Registra alterações feitas pela auditora nos itens da conta
 * (alterar quantidade, valor, ou adicionar itens faltantes)
 */
export const ajustesAuditoria = mysqlTable("ajustes_auditoria", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência à conta
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Tipo do ajuste
  tipoAjuste: mysqlEnum("tipoAjuste", [
    "ALTERAR_QUANTIDADE",
    "ALTERAR_VALOR",
    "ADICIONAR_ITEM",
    "REMOVER_ITEM",
    "ALTERAR_SETOR",
  ]).notNull(),
  
  // Item afetado (null se for adição de novo item)
  itemId: int("itemId"),
  codigoItem: varchar("codigoItem", { length: 50 }),
  descricaoItem: text("descricaoItem"),
  
  // Valores originais (antes do ajuste)
  quantidadeOriginal: decimal("quantidadeOriginal", { precision: 12, scale: 4 }),
  valorOriginal: decimal("valorOriginal", { precision: 14, scale: 2 }),
  
  // Valores ajustados (depois do ajuste)
  quantidadeAjustada: decimal("quantidadeAjustada", { precision: 12, scale: 4 }),
  valorAjustado: decimal("valorAjustado", { precision: 14, scale: 2 }),
  
  // Para itens adicionados
  tipoItemAdicionado: varchar("tipoItemAdicionado", { length: 50 }),
  
  // Para alteração de setor
  setorOriginal: varchar("setorOriginal", { length: 255 }),
  setorAjustado: varchar("setorAjustado", { length: 255 }),
  
  // Justificativa do ajuste
  justificativa: text("justificativa"),
  
  // Status do ajuste
  status: mysqlEnum("statusAjuste", ["pendente", "aplicado", "revertido"]).default("pendente").notNull(),
  
  // Quem fez o ajuste
  usuarioId: int("usuarioId").notNull(),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  contaIdx: index("idx_aa_conta").on(table.numeroConta, table.estabelecimentoId),
  tipoIdx: index("idx_aa_tipo").on(table.tipoAjuste),
  itemIdx: index("idx_aa_item").on(table.codigoItem),
  statusIdx: index("idx_aa_status").on(table.status),
}));

export type AjusteAuditoria = typeof ajustesAuditoria.$inferSelect;
export type InsertAjusteAuditoria = typeof ajustesAuditoria.$inferInsert;

/**
 * Aprendizado de Auditoria - Base de conhecimento construída a partir das ações das auditoras
 * Cada registro é um padrão aprendido que pode gerar sugestões automáticas
 */
export const aprendizadoAuditoria = mysqlTable("aprendizado_auditoria", {
  id: int("id").autoincrement().primaryKey(),
  
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Tipo de aprendizado
  tipoAprendizado: mysqlEnum("tipoAprendizado", [
    "FALHA_PRONTUARIO",       // Falhas recorrentes por tipo de procedimento
    "AJUSTE_QUANTIDADE",      // Ajustes de quantidade recorrentes
    "AJUSTE_VALOR",           // Ajustes de valor recorrentes
    "ITEM_FALTANTE",          // Itens frequentemente adicionados
    "DECISAO_DIVERGENCIA",    // Padrão de decisão em divergências
  ]).notNull(),
  
  // Contexto do aprendizado (chave de agrupamento)
  convenio: varchar("convenio", { length: 255 }),
  tipoProcedimento: varchar("tipoProcedimento", { length: 100 }),
  codigoItem: varchar("codigoItem", { length: 50 }),
  descricaoItem: varchar("descricaoItem", { length: 500 }),
  setor: varchar("setor", { length: 255 }),
  
  // O que foi aprendido (JSON flexível)
  // Para FALHA_PRONTUARIO: {tipoFalha, categoriaFalha, frequencia, percentual}
  // Para AJUSTE_QUANTIDADE: {quantidadeMedia, quantidadeModa, direcao: "aumentar"|"diminuir"}
  // Para AJUSTE_VALOR: {valorMedio, valorModa, direcao}
  // Para ITEM_FALTANTE: {codigoItem, descricao, quantidadeMedia, frequencia}
  // Para DECISAO_DIVERGENCIA: {tipoDivergencia, decisaoMaisComum, percentualAceitar, percentualRejeitar}
  dadosAprendizado: json("dadosAprendizado").notNull(),
  
  // Métricas de confiança
  totalOcorrencias: int("totalOcorrencias").default(1).notNull(),
  confianca: decimal("confianca", { precision: 5, scale: 2 }).default("0.50"), // 0.00 a 1.00
  
  // Controle de ativação
  ativo: int("ativo").default(1).notNull(), // 1 = ativo, 0 = desativado
  minimoOcorrencias: int("minimoOcorrencias").default(3), // Mínimo para sugerir
  
  // Última atualização do aprendizado
  ultimaAtualizacao: timestamp("ultimaAtualizacao").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  estabTipoIdx: index("idx_aprd_estab_tipo").on(table.estabelecimentoId, table.tipoAprendizado),
  convenioIdx: index("idx_aprd_convenio").on(table.convenio),
  codigoIdx: index("idx_aprd_codigo").on(table.codigoItem),
  confiancaIdx: index("idx_aprd_confianca").on(table.confianca),
  ativoIdx: index("idx_aprd_ativo").on(table.ativo),
}));

export type AprendizadoAuditoria = typeof aprendizadoAuditoria.$inferSelect;
export type InsertAprendizadoAuditoria = typeof aprendizadoAuditoria.$inferInsert;


/**
 * Snapshot de Auditoria - Salva o estado dos itens da conta no momento em que a auditoria é finalizada
 * Permite comparar com a reimportação para verificar se o faturista corrigiu os problemas
 */
export const snapshotAuditoria = mysqlTable("snapshot_auditoria", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência à conta
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Convênio
  convenio: varchar("convenio", { length: 255 }),
  convenioId: int("convenioId"),
  pacienteNome: varchar("pacienteNome", { length: 255 }),
  
  // Snapshot dos itens da conta (JSON array com todos os itens no momento da auditoria)
  // [{codigoItem, descricaoItem, tipoItem, quantidade, valorUnitario, valorTotal, statusAnalise, divergencias}]
  itensSnapshot: json("itensSnapshot").notNull(),
  
  // Snapshot das divergências aceitas pela auditoria (itens que o faturista PRECISA corrigir)
  // [{codigoItem, tipoDivergencia, decisao, justificativa, dadosDivergencia}]
  divergenciasAceitas: json("divergenciasAceitas"),
  
  // Snapshot das falhas de prontuário abertas
  // [{tipoFalha, categoriaFalha, descricao, severidade}]
  falhasAbertas: json("falhasAbertas"),
  
  // Snapshot dos ajustes aplicados pela auditoria
  // [{tipoAjuste, codigoItem, descricaoItem, quantidadeOriginal, valorOriginal, quantidadeAjustada, valorAjustado}]
  ajustesAplicados: json("ajustesAplicados"),
  
  // Totais no momento do snapshot
  totalItens: int("totalItens").default(0),
  valorTotal: decimal("valorTotal", { precision: 14, scale: 2 }),
  totalDivergenciasAceitas: int("totalDivergenciasAceitas").default(0),
  totalFalhasAbertas: int("totalFalhasAbertas").default(0),
  totalAjustes: int("totalAjustes").default(0),
  
  // Quem finalizou a auditoria (gerou o snapshot)
  auditorId: int("auditorId").notNull(),
  auditorNome: varchar("auditorNome", { length: 255 }),
  
  // Status do snapshot
  status: mysqlEnum("statusSnapshot", [
    "aguardando_correcao",   // Faturista ainda não reimportou
    "reimportado",           // Conta foi reimportada, comparação disponível
    "conferido",             // Conferência foi revisada manualmente
    "aprovado",              // Todas as correções foram feitas
    "reprovado",             // Correções insuficientes, precisa refazer
  ]).default("aguardando_correcao").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  contaEstabIdx: index("idx_sa_conta_estab").on(table.numeroConta, table.estabelecimentoId),
  statusIdx: index("idx_sa_status").on(table.status),
  auditorIdx: index("idx_sa_auditor").on(table.auditorId),
}));

export type SnapshotAuditoria = typeof snapshotAuditoria.$inferSelect;
export type InsertSnapshotAuditoria = typeof snapshotAuditoria.$inferInsert;

/**
 * Conferência Pós-Correção - Resultado da comparação entre snapshot e reimportação
 * Cada registro é um item comparado com seu status de correção
 */
export const conferenciaCorrecao = mysqlTable("conferencia_correcao", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência ao snapshot
  snapshotId: int("snapshotId").notNull(),
  
  // Referência à conta
  numeroConta: varchar("numeroConta", { length: 100 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Item comparado
  codigoItem: varchar("codigoItem", { length: 50 }),
  descricaoItem: text("descricaoItem"),
  tipoItem: varchar("tipoItem", { length: 50 }),
  
  // Tipo do apontamento original
  tipoApontamento: mysqlEnum("tipoApontamento", [
    "divergencia_aceita",   // Divergência aceita pela auditoria
    "falha_prontuario",     // Falha de prontuário aberta
    "ajuste_auditoria",     // Ajuste feito pela auditoria
  ]).notNull(),
  
  // Dados ANTES (do snapshot)
  valorAntes: decimal("valorAntes", { precision: 14, scale: 2 }),
  quantidadeAntes: decimal("quantidadeAntes", { precision: 12, scale: 4 }),
  detalhesAntes: json("detalhesAntes"), // dados completos do apontamento original
  
  // Dados DEPOIS (da reimportação)
  valorDepois: decimal("valorDepois", { precision: 14, scale: 2 }),
  quantidadeDepois: decimal("quantidadeDepois", { precision: 12, scale: 4 }),
  detalhesDepois: json("detalhesDepois"), // dados do item reimportado
  
  // Resultado da comparação
  statusCorrecao: mysqlEnum("statusCorrecao", [
    "corrigido",              // Item foi alterado conforme apontado
    "parcialmente_corrigido", // Mudou mas não exatamente como esperado
    "nao_corrigido",          // Permanece igual ao anterior
    "novo_problema",          // Item que não tinha divergência agora tem
    "item_removido",          // Item foi removido na reimportação
    "item_adicionado",        // Novo item adicionado na reimportação
  ]).notNull(),
  
  // Descrição da mudança detectada
  descricaoMudanca: text("descricaoMudanca"),
  
  // Impacto financeiro da correção (diferença de valor)
  impactoFinanceiro: decimal("impactoFinanceiro", { precision: 14, scale: 2 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  snapshotIdx: index("idx_cc_snapshot").on(table.snapshotId),
  contaEstabIdx: index("idx_cc_conta_estab").on(table.numeroConta, table.estabelecimentoId),
  statusIdx: index("idx_cc_status").on(table.statusCorrecao),
}));

export type ConferenciaCorrecao = typeof conferenciaCorrecao.$inferSelect;
export type InsertConferenciaCorrecao = typeof conferenciaCorrecao.$inferInsert;

/**
 * Log de Análise de Comparação
 * Registra qual gabarito/padrão foi usado em cada análise de conta,
 * para rastreabilidade e auditoria
 */
export const logAnaliseComparacao = mysqlTable("log_analise_comparacao", {
  id: int("id").autoincrement().primaryKey(),
  numeroConta: varchar("numeroConta", { length: 50 }).notNull(),
  estabelecimentoId: int("estabelecimentoId").notNull(),
  
  // Info do padrão/gabarito usado
  padraoId: int("padraoId"),
  padraoNome: varchar("padraoNome", { length: 500 }),
  padraoTipo: varchar("padraoTipo", { length: 50 }), // 'gabarito_manual', 'padrao_aprendido'
  isGabarito: int("isGabarito").default(0),
  convenioNome: varchar("convenioNome", { length: 255 }),
  setorPadrao: varchar("setorPadrao", { length: 255 }),
  
  // Procedimentos da conta
  procedimentosConta: text("procedimentosConta"),
  
  // Resultados da análise
  totalItensAnalisados: int("totalItensAnalisados").default(0),
  totalDivergencias: int("totalDivergencias").default(0),
  divergenciasCritico: int("divergenciasCritico").default(0),
  divergenciasAlerta: int("divergenciasAlerta").default(0),
  divergenciasAviso: int("divergenciasAviso").default(0),
  divergenciasInfo: int("divergenciasInfo").default(0),
  
  // Score de confiança do match
  scoreMatch: int("scoreMatch").default(0),
  motivoSelecao: text("motivoSelecao"), // Explicação de por que este padrão foi selecionado
  
  // Metadados
  statusGeral: varchar("statusGeral", { length: 30 }),
  duracaoMs: int("duracaoMs"), // Tempo de execução em ms
  usuarioId: int("usuarioId"),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (table) => ({
  contaIdx: index("idx_lac_conta").on(table.numeroConta, table.estabelecimentoId),
  padraoIdx: index("idx_lac_padrao").on(table.padraoId),
  criadoEmIdx: index("idx_lac_criado").on(table.criadoEm),
}));

export type LogAnaliseComparacao = typeof logAnaliseComparacao.$inferSelect;
export type InsertLogAnaliseComparacao = typeof logAnaliseComparacao.$inferInsert;
