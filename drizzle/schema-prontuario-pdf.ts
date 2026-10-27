import {
  bigint,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Metadados de PDFs de prontuário vinculados ao escopo canônico de uma conta XML.
 * O conteúdo permanece somente cifrado no storage privado; esta tabela não armazena
 * URL, Base64, texto extraído, OCR nem campos financeiros.
 *
 * A migração é deliberadamente reservada para a entrega 0140.
 */
export const prontuarioPdfAnexos = mysqlTable(
  "prontuario_pdf_anexos",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    arquivoHospitalId: int("arquivo_hospital_id").notNull(),
    numeroConta: varchar("numero_conta", { length: 100 }).notNull(),
    numeroLote: varchar("numero_lote", { length: 100 }).notNull(),
    competencia: varchar("competencia", { length: 20 }).notNull(),
    tipo: mysqlEnum("tipo", ["prontuario_pdf"]).notNull(),

    nomeArquivo: varchar("nome_arquivo", { length: 255 }).notNull(),
    tamanhoBytes: int("tamanho_bytes").notNull(),
    /** SHA-256 do PDF puro, calculado antes de cifrar e nunca exposto ao cliente. */
    sha256: varchar("sha256", { length: 64 }).notNull(),
    /** Chave interna do objeto cifrado. Nunca é URL e nunca é retornada ao cliente. */
    storageKey: varchar("storage_key", { length: 512 }).notNull(),

    ativo: mysqlEnum("ativo", ["sim", "nao"]).default("sim").notNull(),
    criadoPor: int("criado_por").notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    inativadoPor: int("inativado_por"),
    inativadoEm: timestamp("inativado_em"),
  },
  table => ({
    escopoAtivoIdx: index("idx_pront_pdf_escopo_ativo").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHospitalId,
      table.numeroConta,
      table.numeroLote,
      table.competencia,
      table.ativo,
      table.id
    ),
    arquivoHospitalarIdx: index("idx_pront_pdf_arquivo_hospitalar").on(
      table.arquivoHospitalId
    ),
  })
);

export type ProntuarioPdfAnexo = typeof prontuarioPdfAnexos.$inferSelect;
export type InsertProntuarioPdfAnexo = typeof prontuarioPdfAnexos.$inferInsert;

/**
 * Trilha append-only das operações concluídas sobre anexos de prontuário.
 * Replica somente a chave de escopo e o resultado da operação: não armazena
 * conteúdo, URL, Base64, chave de storage, hash do PDF, valores ou paciente.
 */
export const prontuarioPdfAnexoEventos = mysqlTable(
  "prontuario_pdf_anexo_eventos",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    anexoId: bigint("anexo_id", { mode: "number" }).notNull(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    arquivoHospitalId: int("arquivo_hospital_id").notNull(),
    numeroConta: varchar("numero_conta", { length: 100 }).notNull(),
    numeroLote: varchar("numero_lote", { length: 100 }).notNull(),
    competencia: varchar("competencia", { length: 20 }).notNull(),
    tipo: mysqlEnum("tipo", ["upload", "download", "inativacao"]).notNull(),
    usuarioId: int("usuario_id").notNull(),
    resultado: mysqlEnum("resultado", ["sucesso", "falha"]).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  table => ({
    anexoIdx: index("idx_pront_pdf_evento_anexo").on(table.anexoId, table.id),
    escopoIdx: index("idx_pront_pdf_evento_escopo").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHospitalId,
      table.numeroConta,
      table.numeroLote,
      table.competencia,
      table.id
    ),
  })
);

export type ProntuarioPdfAnexoEvento =
  typeof prontuarioPdfAnexoEventos.$inferSelect;
export type InsertProntuarioPdfAnexoEvento =
  typeof prontuarioPdfAnexoEventos.$inferInsert;
