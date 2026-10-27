import {
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Controle exclusivo por unidade para o espelhamento Hop diário.
 *
 * Não há FKs deliberadamente: as tabelas legadas e os usuários têm ciclos de
 * implantação independentes. Este schema armazena somente metadados técnicos,
 * contagens e hashes; nunca linhas clínicas, financeiras ou PHI.
 */
export const atendimentosHopDiarioControles = mysqlTable(
  "atendimentos_hop_controles",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    criadoPor: int("criado_por").notNull(),
    estado: mysqlEnum("estado", ["pausado", "preparando", "ativo", "erro", "incerto"])
      .notNull()
      .default("pausado"),
    taskUid: varchar("task_uid", { length: 65 }),
    cronUtc: varchar("cron_utc", { length: 100 }).notNull().default("0 0 13 * * *"),
    fuso: varchar("fuso", { length: 64 }).notNull().default("America/Sao_Paulo"),
    /** Compare-and-swap de alterações administrativas ou produtoras. */
    operacaoToken: varchar("operacao_token", { length: 64 }),
    /** Reserva durável da execução de cron antes de qualquer efeito no destino. */
    execucaoToken: varchar("execucao_token", { length: 64 }),
    leaseAte: datetime("lease_ate", { mode: "string", fsp: 3 }),
    ultimoSlot: varchar("ultimo_slot", { length: 64 }),
    ultimaExecucao: datetime("ultima_execucao", { mode: "string", fsp: 3 }),
    proximaExecucao: datetime("proxima_execucao", { mode: "string", fsp: 3 }),
    /** SHA-256 da credencial aleatória de 256 bits; o segredo nunca é persistido. */
    producerTokenHash: varchar("producer_token_hash", { length: 64 }),
    criadoEm: datetime("criado_em", { mode: "string", fsp: 3 }).notNull(),
    atualizadoEm: datetime("atualizado_em", { mode: "string", fsp: 3 }).notNull(),
  },
  table => ({
    unidadeUq: uniqueIndex("uq_athop_controle_unidade").on(table.estabelecimentoId),
    taskUidUq: uniqueIndex("uq_athop_controle_task_uid").on(table.taskUid),
    producerTokenUq: uniqueIndex("uq_athop_controle_producer_hash").on(table.producerTokenHash),
    estadoLeaseIdx: index("idx_athop_controle_estado_lease").on(table.estado, table.leaseAte),
  }),
);

/** Lote cooperativo anunciado pelo produtor Hop, sem conteúdo da staging. */
export const atendimentosHopDiarioLotes = mysqlTable(
  "atendimentos_hop_lotes",
  {
    id: int("id").autoincrement().primaryKey(),
    controleId: int("controle_id").notNull(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    /** UUID técnico fornecido pelo produtor ou gerado para a captura administrativa inicial. */
    loteRef: varchar("lote_ref", { length: 36 }).notNull(),
    estado: mysqlEnum("estado", ["carregando", "completo", "publicado", "falhou", "incerto"])
      .notNull(),
    totalEsperado: int("total_esperado"),
    totalObservado: int("total_observado"),
    /** Digest privado do snapshot. Nunca integra DTO, log ou mensagem de erro. */
    fingerprintPrivado: varchar("fingerprint_privado", { length: 64 }),
    iniciadoEm: datetime("iniciado_em", { mode: "string", fsp: 3 }).notNull(),
    concluidoEm: datetime("concluido_em", { mode: "string", fsp: 3 }),
    publicadoEm: datetime("publicado_em", { mode: "string", fsp: 3 }),
    falhouEm: datetime("falhou_em", { mode: "string", fsp: 3 }),
    /** Código técnico agregado, sem texto de driver, PHI, SQL ou credenciais. */
    codigo: varchar("codigo", { length: 64 }),
    criadoEm: datetime("criado_em", { mode: "string", fsp: 3 }).notNull(),
    atualizadoEm: datetime("atualizado_em", { mode: "string", fsp: 3 }).notNull(),
  },
  table => ({
    loteUnidadeUq: uniqueIndex("uq_athop_lote_unidade_ref").on(table.estabelecimentoId, table.loteRef),
    controleEstadoIdx: index("idx_athop_lote_controle_estado").on(table.controleId, table.estado),
    unidadeDataIdx: index("idx_athop_lote_unidade_data").on(table.estabelecimentoId, table.criadoEm),
  }),
);

/** Histórico agregado do cron/manual, exclusivamente para a UI administrativa. */
export const atendimentosHopDiarioExecucoes = mysqlTable(
  "atendimentos_hop_execucoes",
  {
    id: int("id").autoincrement().primaryKey(),
    controleId: int("controle_id").notNull(),
    loteId: int("lote_id"),
    slot: varchar("slot", { length: 64 }).notNull(),
    modo: mysqlEnum("modo", ["cron", "manual"]).notNull(),
    estado: mysqlEnum("estado", ["reservada", "concluida", "falhou", "incerto"])
      .notNull(),
    /** JSON estritamente agregado: contagens e código, nunca linhas ou chaves clínicas. */
    contagens: json("contagens"),
    codigo: varchar("codigo", { length: 64 }),
    iniciadoEm: datetime("iniciado_em", { mode: "string", fsp: 3 }).notNull(),
    terminadoEm: datetime("terminado_em", { mode: "string", fsp: 3 }),
    criadoEm: datetime("criado_em", { mode: "string", fsp: 3 }).notNull(),
    atualizadoEm: datetime("atualizado_em", { mode: "string", fsp: 3 }).notNull(),
  },
  table => ({
    controleSlotUq: uniqueIndex("uq_athop_execucao_controle_slot").on(table.controleId, table.slot),
    controleDataIdx: index("idx_athop_execucao_controle_data").on(table.controleId, table.iniciadoEm),
    loteIdx: index("idx_athop_execucao_lote").on(table.loteId),
  }),
);
