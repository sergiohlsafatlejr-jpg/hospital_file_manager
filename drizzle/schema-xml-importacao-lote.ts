import {
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
 * Coordenação persistente de uma seleção de XMLs de envio. O lote não armazena
 * XML, valores extraídos, URLs ou dados clínicos: os documentos ficam no cofre
 * de arquivos e os resultados de execução são estritamente operacionais.
 */
export const xmlImportacaoLotes = mysqlTable(
  "xml_importacao_lotes",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    criadoPor: int("criado_por").notNull(),
    /** Idempotência do navegador dentro do mesmo escopo e ator. */
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    /** Hash canônico de datas e hashes dos XMLs; impede reuso silencioso da chave. */
    manifestHash: varchar("manifest_hash", { length: 64 }).notNull(),
    versaoFluxo: varchar("versao_fluxo", { length: 40 }).notNull().default("v1"),
    reimportacaoDeLoteId: int("reimportacao_de_lote_id"),
    estado: mysqlEnum("estado", [
      "recebendo",
      "enfileirado",
      "processando",
      "concluido",
      "concluido_com_erros",
      "falhou",
      "cancelado",
      "substituido",
    ])
      .notNull()
      .default("recebendo"),
    fase: mysqlEnum("fase", [
      "persistir_selecao",
      "classificar",
      "processar_hospitalares",
      "materializar_contas",
      "processar_honorarios",
      "finalizar",
    ])
      .notNull()
      .default("persistir_selecao"),
    tentativas: int("tentativas").notNull().default(0),
    proximaTentativaEm: timestamp("proxima_tentativa_em"),
    erroCodigo: varchar("erro_codigo", { length: 80 }),
    /** Diagnóstico operacional sanitizado; nunca XML, URL, hash, guia ou valor. */
    erroResumo: varchar("erro_resumo", { length: 1000 }),
    claimToken: varchar("claim_token", { length: 64 }),
    claimedBy: varchar("claimed_by", { length: 255 }),
    leaseExpiresAt: timestamp("lease_expires_at"),
    heartbeatEm: timestamp("heartbeat_em"),
    totalArquivos: int("total_arquivos").notNull().default(0),
    totalHospitalares: int("total_hospitalares").notNull().default(0),
    totalHonorarios: int("total_honorarios").notNull().default(0),
    totalBloqueados: int("total_bloqueados").notNull().default(0),
    totalErros: int("total_erros").notNull().default(0),
    iniciadoEm: timestamp("iniciado_em"),
    concluidoEm: timestamp("concluido_em"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    escopoIdempotenciaUq: uniqueIndex("uq_xml_imp_lote_escopo_idempotencia").on(
      table.estabelecimentoId,
      table.convenioId,
      table.criadoPor,
      table.idempotencyKey,
    ),
    escopoManifestUq: uniqueIndex("uq_xml_imp_lote_escopo_manifesto").on(
      table.estabelecimentoId,
      table.convenioId,
      table.criadoPor,
      table.manifestHash,
    ),
    claimIdx: index("idx_xml_imp_lote_claim").on(
      table.estado,
      table.proximaTentativaEm,
      table.leaseExpiresAt,
      table.id,
    ),
    escopoHistoricoIdx: index("idx_xml_imp_lote_escopo_historico").on(
      table.estabelecimentoId,
      table.convenioId,
      table.criadoPor,
      table.createdAt,
    ),
  }),
);

export type XmlImportacaoLote = typeof xmlImportacaoLotes.$inferSelect;
export type InsertXmlImportacaoLote = typeof xmlImportacaoLotes.$inferInsert;

/**
 * Um arquivo imutável participante do lote. O status não é compartilhado com
 * o de `arquivos`: ele representa exclusivamente a máquina de estados deste
 * lote e permite retomada precisa depois de timeout ou reinício do processo.
 */
export const xmlImportacaoItens = mysqlTable(
  "xml_importacao_itens",
  {
    id: int("id").autoincrement().primaryKey(),
    loteId: int("lote_id").notNull(),
    ordem: int("ordem").notNull(),
    arquivoId: int("arquivo_id").notNull(),
    nomeArquivo: varchar("nome_arquivo", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    tamanhoBytes: int("tamanho_bytes").notNull(),
    tipoClassificado: mysqlEnum("tipo_classificado", [
      "pendente",
      "hospitalar",
      "honorarios",
      "misto_ou_ambiguo",
      "invalido",
    ])
      .notNull()
      .default("pendente"),
    versaoClassificador: varchar("versao_classificador", { length: 40 }),
    classificadoEm: timestamp("classificado_em"),
    estado: mysqlEnum("estado", [
      "recebido",
      "classificado",
      "hospitalar_persistido",
      "conta_materializada",
      "honorario_indexado",
      "bloqueado",
      "erro",
      "concluido",
    ])
      .notNull()
      .default("recebido"),
    fase: mysqlEnum("fase", [
      "persistir_selecao",
      "classificar",
      "processar_hospitalares",
      "materializar_contas",
      "processar_honorarios",
      "finalizar",
    ])
      .notNull()
      .default("persistir_selecao"),
    tentativas: int("tentativas").notNull().default(0),
    erroCodigo: varchar("erro_codigo", { length: 80 }),
    erroResumo: varchar("erro_resumo", { length: 1000 }),
    totalItens: int("total_itens").notNull().default(0),
    totalGuias: int("total_guias").notNull().default(0),
    /** Contagens e códigos operacionais; nunca XML, URL, hash ou valores. */
    resultadoResumoJson: json("resultado_resumo_json"),
    processadoEm: timestamp("processado_em"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    loteOrdemUq: uniqueIndex("uq_xml_imp_item_lote_ordem").on(
      table.loteId,
      table.ordem,
    ),
    loteHashUq: uniqueIndex("uq_xml_imp_item_lote_hash").on(
      table.loteId,
      table.sha256,
    ),
    loteTipoEstadoIdx: index("idx_xml_imp_item_lote_tipo_estado").on(
      table.loteId,
      table.tipoClassificado,
      table.estado,
      table.ordem,
    ),
    arquivoIdx: index("idx_xml_imp_item_arquivo").on(table.arquivoId),
  }),
);

export type XmlImportacaoItem = typeof xmlImportacaoItens.$inferSelect;
export type InsertXmlImportacaoItem = typeof xmlImportacaoItens.$inferInsert;
