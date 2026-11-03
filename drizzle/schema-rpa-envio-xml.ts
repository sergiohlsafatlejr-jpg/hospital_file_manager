import {
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const rpaStatusEsteiraEnum = [
  "IMPORTADO",
  "LIBERADO_ENVIO",
  "PROCESSANDO_ROBO",
  "SIMULADO_OK",
  "AGUARDANDO_PORTAL",
  "PROTOCOLADO",
  "ERRO_PORTAL",
  "ERRO_CREDENCIAL",
  "ERRO_ROBO",
] as const;

export type RpaStatusEsteira = (typeof rpaStatusEsteiraEnum)[number];

/**
 * Fila de Envio Automático de Lotes XML TISS para Portais de Convênios via Robô RPA
 */
export const filaEnvioXmlPortal = mysqlTable(
  "fila_envio_xml_portal",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    fabricaContaId: int("fabrica_conta_id"),
    arquivoId: int("arquivo_id"),
    usuarioUploadId: int("usuario_upload_id").notNull(),
    usuarioUploadNome: varchar("usuario_upload_nome", { length: 255 }),

    nomeArquivo: varchar("nome_arquivo", { length: 255 }).notNull(),
    numeroLote: varchar("numero_lote", { length: 80 }).notNull(),
    versaoTiss: varchar("versao_tiss", { length: 20 }),
    registroAns: varchar("registro_ans", { length: 20 }),
    codigoPrestadorXml: varchar("codigo_prestador_xml", { length: 80 }),
    cnpjPrestadorXml: varchar("cnpj_prestador_xml", { length: 20 }),

    qtdGuias: int("qtd_guias").default(0).notNull(),
    qtdItens: int("qtd_itens").default(0).notNull(),
    valorTotal: decimal("valor_total", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),

    hashXml: varchar("hash_xml", { length: 64 }).notNull(),
    caminhoArquivoXml: varchar("caminho_arquivo_xml", { length: 512 }).notNull(),
    resumoGuiasJson: json("resumo_guias_json"),

    statusEsteira: varchar("status_esteira", { length: 40 })
      .default("IMPORTADO")
      .notNull(),
    modoExecucao: varchar("modo_execucao", { length: 20 })
      .default("producao")
      .notNull(),

    protocoloRetorno: varchar("protocolo_retorno", { length: 120 }),
    idRecebimentoPortal: varchar("id_recebimento_portal", { length: 120 }),
    mensagemPortal: text("mensagem_portal"),
    comprovanteUrl: varchar("comprovante_url", { length: 512 }),
    screenshotBase64: longtext("screenshot_base64"),

    tentativas: int("tentativas").default(0).notNull(),
    enviadoEm: timestamp("enviado_em"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusEstabIdx: index("idx_fila_xml_status_estab").on(
      table.statusEsteira,
      table.estabelecimentoId,
      table.convenioId
    ),
    hashEstabIdx: index("idx_fila_xml_hash_estab").on(
      table.estabelecimentoId,
      table.convenioId,
      table.hashXml
    ),
    fabricaContaIdx: index("idx_fila_xml_fabrica_conta").on(
      table.fabricaContaId
    ),
  })
);

export type FilaEnvioXmlPortal = typeof filaEnvioXmlPortal.$inferSelect;
export type InsertFilaEnvioXmlPortal = typeof filaEnvioXmlPortal.$inferInsert;
