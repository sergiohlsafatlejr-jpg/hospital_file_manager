import {
  bigint,
  date,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Ledger isolado de respostas CASSI de recursos. Estas tabelas não atualizam
 * demonstrativos, recursos ou lotes legados: somente os referenciam por leitura.
 */
export const recursosRetornosImportacoes = mysqlTable(
  "recursos_retornos_importacoes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    criadoPor: int("criado_por").notNull(),
    origemRecurso: mysqlEnum("origem_recurso", ["externo", "portal"]).notNull(),
    lotePortalId: int("lote_portal_id"),

    nomeArquivoXml: varchar("nome_arquivo_xml", { length: 255 }).notNull(),
    arquivoHash: varchar("arquivo_hash", { length: 64 }).notNull(),
    /** Chave privada do cofre; nunca é uma URL retornada pela API. */
    arquivoStorageKey: varchar("arquivo_storage_key", {
      length: 512,
    }).notNull(),
    /** Identidade lógica do documento (ANS/protocolo/lote/guia de recurso). */
    respostaHash: varchar("resposta_hash", { length: 64 }).notNull(),
    /** Hash da semântica do cabeçalho e das linhas, independente da formatação XML. */
    conteudoSemanticoHash: varchar("conteudo_semantico_hash", {
      length: 64,
    }).notNull(),

    formato: varchar("formato", { length: 80 }).notNull(),
    versaoTiss: varchar("versao_tiss", { length: 32 }).notNull(),
    registroAns: varchar("registro_ans", { length: 32 }).notNull(),
    codigoPrestador: varchar("codigo_prestador", { length: 80 }).notNull(),
    numeroLote: varchar("numero_lote", { length: 100 }).notNull(),
    protocoloRecurso: varchar("protocolo_recurso", { length: 150 }).notNull(),
    guiaRecursoPrestador: varchar("guia_recurso_prestador", {
      length: 100,
    }).notNull(),
    guiaRecursoOperadora: varchar("guia_recurso_operadora", {
      length: 100,
    }).notNull(),
    /** Data original do recurso, distinta da data do documento de resposta. */
    dataRecurso: date("data_recurso", { mode: "string" }).notNull(),
    dataResposta: date("data_resposta", { mode: "string" }).notNull(),

    totalRecursadoCabecalho: decimal("total_recursado_cabecalho", {
      precision: 14,
      scale: 2,
    }),
    totalAcatadoCabecalho: decimal("total_acatado_cabecalho", {
      precision: 14,
      scale: 2,
    }),
    totalRecursadoItens: decimal("total_recursado_itens", {
      precision: 14,
      scale: 2,
    }).notNull(),
    totalAcatadoItens: decimal("total_acatado_itens", {
      precision: 14,
      scale: 2,
    }).notNull(),
    cabecalhoDivergente: mysqlEnum("cabecalho_divergente", ["sim", "nao"])
      .default("nao")
      .notNull(),
    alertas: json("alertas"),

    nomeArquivoPdf: varchar("nome_arquivo_pdf", { length: 255 }),
    protocoloPdfHash: varchar("protocolo_pdf_hash", { length: 64 }),
    protocoloPdfStorageKey: varchar("protocolo_pdf_storage_key", {
      length: 512,
    }),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  table => ({
    arquivoUnico: uniqueIndex("uq_rec_ret_imp_est_conv_arquivo_hash").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHash
    ),
    respostaUnica: uniqueIndex("uq_rec_ret_imp_est_conv_resposta_hash").on(
      table.estabelecimentoId,
      table.convenioId,
      table.respostaHash
    ),
    escopoDataIdx: index("idx_rec_ret_imp_escopo_data").on(
      table.estabelecimentoId,
      table.convenioId,
      table.dataResposta
    ),
    lotePortalIdx: index("idx_rec_ret_imp_lote_portal").on(table.lotePortalId),
  })
);

/** Linhas imutáveis do XML; somente sugestões transitórias podem ser rebuscadas. */
export const recursosRetornosLinhas = mysqlTable(
  "recursos_retornos_linhas",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    importacaoId: bigint("importacao_id", { mode: "number" }).notNull(),
    posicao: int("posicao").notNull(),

    guiaPrestador: varchar("guia_prestador", { length: 100 }).notNull(),
    guiaOperadora: varchar("guia_operadora", { length: 100 }).notNull(),
    sequencialItem: varchar("sequencial_item", { length: 50 }),
    dataExecucao: date("data_execucao", { mode: "string" }),
    codigoTabela: varchar("codigo_tabela", { length: 20 }).notNull(),
    codigoItem: varchar("codigo_item", { length: 80 }).notNull(),
    codigoGlosa: varchar("codigo_glosa", { length: 80 }).notNull(),
    valorRecursado: decimal("valor_recursado", {
      precision: 14,
      scale: 2,
    }).notNull(),
    valorAcatado: decimal("valor_acatado", {
      precision: 14,
      scale: 2,
    }).notNull(),
    justificativaPrestador: varchar("justificativa_prestador", {
      length: 4000,
    }).notNull(),
    justificativaOperadora: varchar("justificativa_operadora", {
      length: 4000,
    }).notNull(),
    /** Referências normalizadas da fonte, sem dados de paciente do XML. */
    referenciasNormalizadas: json("referencias_normalizadas").notNull(),

    estadoSugestao: mysqlEnum("estado_sugestao", [
      "sugerido",
      "ambiguo",
      "sem_vinculo",
      "divergente",
    ]).notNull(),
    motivoSugestao: varchar("motivo_sugestao", { length: 2000 }).notNull(),
    candidatosSnapshot: json("candidatos_snapshot").notNull(),
    demonstrativoAtualId: int("demonstrativo_atual_id"),
    atualizadoEm: timestamp("atualizado_em")
      .defaultNow()
      .onUpdateNow()
      .notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  table => ({
    importacaoFk: foreignKey({
      name: "fk_rec_ret_linha_importacao",
      columns: [table.importacaoId],
      foreignColumns: [recursosRetornosImportacoes.id],
    }).onDelete("restrict"),
    posicaoUnica: uniqueIndex("uq_rec_ret_linha_importacao_posicao").on(
      table.importacaoId,
      table.posicao
    ),
    importacaoIdx: index("idx_rec_ret_linha_importacao").on(table.importacaoId),
    demonstrativoIdx: index("idx_rec_ret_linha_demo_atual").on(
      table.demonstrativoAtualId
    ),
  })
);

/** Eventos append-only: revisões manuais, rebuscas, conflitos e anexos. */
export const recursosRetornosRevisoes = mysqlTable(
  "recursos_retornos_revisoes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    importacaoId: bigint("importacao_id", { mode: "number" }).notNull(),
    linhaId: bigint("linha_id", { mode: "number" }),
    tipo: mysqlEnum("tipo", [
      "aprovacao",
      "rebusca",
      "conflito",
      "anexo_protocolo",
    ]).notNull(),
    aprovado: mysqlEnum("aprovado", ["sim", "nao"]),
    demonstrativoId: int("demonstrativo_id"),
    demonstrativoChave: varchar("demonstrativo_chave", { length: 255 }),
    arquivoFonteId: int("arquivo_fonte_id"),
    arquivoFonteHash: varchar("arquivo_fonte_hash", { length: 64 }),
    candidatosSnapshot: json("candidatos_snapshot"),
    justificativa: varchar("justificativa", { length: 2000 }).notNull(),
    conflitoHash: varchar("conflito_hash", { length: 64 }),
    revisadoPor: int("revisado_por").notNull(),
    revisadoEm: timestamp("revisado_em").defaultNow().notNull(),
  },
  table => ({
    importacaoFk: foreignKey({
      name: "fk_rec_ret_rev_importacao",
      columns: [table.importacaoId],
      foreignColumns: [recursosRetornosImportacoes.id],
    }).onDelete("restrict"),
    linhaFk: foreignKey({
      name: "fk_rec_ret_rev_linha",
      columns: [table.linhaId],
      foreignColumns: [recursosRetornosLinhas.id],
    }).onDelete("restrict"),
    importacaoIdx: index("idx_rec_ret_rev_importacao").on(
      table.importacaoId,
      table.id
    ),
    linhaIdx: index("idx_rec_ret_rev_linha").on(table.linhaId, table.id),
    // Chave de negócio inclui hospital/convênio e exclui valor e IDs transitórios.
    // Uma mesma glosa não cria saldo disponível em duas respostas diferentes.
    aprovacaoFonteUnica: uniqueIndex("uq_rec_ret_rev_tipo_demo").on(
      table.tipo,
      table.demonstrativoChave
    ),
    conflitoUnico: uniqueIndex("uq_rec_ret_rev_conflito").on(
      table.importacaoId,
      table.tipo,
      table.conflitoHash
    ),
  })
);

/** Ledger financeiro append-only: recebimentos e seus estornos compensatórios. */
export const recursosRetornosPagamentos = mysqlTable(
  "recursos_retornos_pagamentos",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    importacaoId: bigint("importacao_id", { mode: "number" }).notNull(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    tipo: mysqlEnum("tipo", ["recebimento", "estorno"]).notNull(),
    pagamentoOrigemId: bigint("pagamento_origem_id", { mode: "number" }),
    valor: decimal("valor", { precision: 14, scale: 2 }).notNull(),
    dataEvento: date("data_evento", { mode: "string" }).notNull(),
    referencia: varchar("referencia", { length: 150 }).notNull(),
    observacao: varchar("observacao", { length: 2000 }).notNull(),
    chaveOperacao: varchar("chave_operacao", { length: 36 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    registradoPor: int("registrado_por").notNull(),
    registradoEm: timestamp("registrado_em").defaultNow().notNull(),
  },
  table => ({
    importacaoFk: foreignKey({
      name: "fk_rec_ret_pag_importacao",
      columns: [table.importacaoId],
      foreignColumns: [recursosRetornosImportacoes.id],
    }).onDelete("restrict"),
    origemFk: foreignKey({
      name: "fk_rec_ret_pag_origem",
      columns: [table.pagamentoOrigemId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    chaveOperacaoUnica: uniqueIndex("uq_rec_ret_pag_escopo_operacao").on(
      table.estabelecimentoId,
      table.convenioId,
      table.chaveOperacao
    ),
    referenciaUnica: uniqueIndex(
      "uq_rec_ret_pag_importacao_tipo_referencia"
    ).on(table.importacaoId, table.tipo, table.referencia),
    estornoUnico: uniqueIndex("uq_rec_ret_pag_estorno_origem").on(
      table.pagamentoOrigemId
    ),
    importacaoIdx: index("idx_rec_ret_pag_importacao").on(
      table.importacaoId,
      table.id
    ),
  })
);

export type RecursoRetornoImportacao =
  typeof recursosRetornosImportacoes.$inferSelect;
export type InsertRecursoRetornoImportacao =
  typeof recursosRetornosImportacoes.$inferInsert;
export type RecursoRetornoLinha = typeof recursosRetornosLinhas.$inferSelect;
export type InsertRecursoRetornoLinha =
  typeof recursosRetornosLinhas.$inferInsert;
export type RecursoRetornoRevisao =
  typeof recursosRetornosRevisoes.$inferSelect;
export type InsertRecursoRetornoRevisao =
  typeof recursosRetornosRevisoes.$inferInsert;
export type RecursoRetornoPagamento =
  typeof recursosRetornosPagamentos.$inferSelect;
export type InsertRecursoRetornoPagamento =
  typeof recursosRetornosPagamentos.$inferInsert;
