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
 * Fonte exclusivamente informativa extraída de uma guia de honorários.
 *
 * Não há FK deliberadamente: arquivos e itens de faturamento pertencem a ciclos de
 * importação independentes. A integridade de escopo é validada no serviço antes de
 * qualquer escrita. `procedimentosJson` jamais pode conter valores, quantidades
 * financeiras, carteirinha, URL ou XML bruto.
 */
export const contaContextoMedicoFontes = mysqlTable(
  "conta_contexto_medico_fontes",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    arquivoHospitalId: int("arquivo_hospital_id").notNull(),
    arquivoMedicoId: int("arquivo_medico_id").notNull(),
    loteImportacaoId: int("lote_importacao_id"),
    numeroConta: varchar("numero_conta", { length: 100 }).notNull(),
    /** Normalizado para string vazia quando não informado, para unicidade exata. */
    numeroLote: varchar("numero_lote", { length: 100 }).notNull().default(""),
    /** Normalizado para string vazia quando não informado, para unicidade exata. */
    competencia: varchar("competencia", { length: 20 }).notNull().default(""),
    /** Guia prestador, ou guia operadora quando esta é a referência explícita. */
    guiaReferencia: varchar("guia_referencia", { length: 100 }).notNull(),
    /** Hash do conteúdo semântico; privado e nunca parte de DTO público. */
    versaoSemantica: varchar("versao_semantica", { length: 64 }).notNull(),
    /** Versão privada do snapshot hospitalar não financeiro associado. */
    versaoSnapshotHospitalar: varchar("versao_snapshot_hospitalar", { length: 64 })
      .notNull()
      .default(""),
    registros: int("registros").notNull(),
    codigosDistintos: int("codigos_distintos").notNull(),
    /** Procedimentos e profissionais sanitizados, sem qualquer campo financeiro. */
    procedimentosJson: json("procedimentos_json").notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    fonteScopeVersaoUq: uniqueIndex("uq_ccm_fonte_scope_arquivo_guia_versao").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHospitalId,
      table.numeroConta,
      table.numeroLote,
      table.competencia,
      table.arquivoMedicoId,
      table.guiaReferencia,
      table.versaoSemantica,
    ),
    scopeIdx: index("idx_ccm_fonte_scope").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHospitalId,
      table.numeroConta,
      table.numeroLote,
      table.competencia,
    ),
    arquivoMedicoIdx: index("idx_ccm_fonte_arquivo_medico").on(table.arquivoMedicoId),
    loteImportacaoIdx: index("idx_ccm_fonte_lote_importacao").on(table.loteImportacaoId),
  }),
);

export type ContaContextoMedicoFonte = typeof contaContextoMedicoFontes.$inferSelect;
export type InsertContaContextoMedicoFonte = typeof contaContextoMedicoFontes.$inferInsert;

/**
 * Estado vigente do contexto informativo, identificado pela chave completa da conta.
 * Revisão é atualizada por compare-and-swap pelo serviço; evidências e decisões
 * anteriores são preservadas em `contaContextoMedicoEventos`.
 */
export const contaContextoMedicoContextos = mysqlTable(
  "conta_contexto_medico_contextos",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    convenioId: int("convenio_id").notNull(),
    arquivoHospitalId: int("arquivo_hospital_id").notNull(),
    numeroConta: varchar("numero_conta", { length: 100 }).notNull(),
    numeroLote: varchar("numero_lote", { length: 100 }).notNull().default(""),
    competencia: varchar("competencia", { length: 20 }).notNull().default(""),
    padraoId: int("padrao_id"),
    nomePadrao: varchar("nome_padrao", { length: 255 }),
    status: mysqlEnum("status", ["confirmado", "invalidado", "revisao_necessaria"])
      .notNull()
      .default("revisao_necessaria"),
    revisao: int("revisao").notNull().default(0),
    confirmadoEm: timestamp("confirmado_em"),
    confirmadoPor: int("confirmado_por"),
    justificativa: varchar("justificativa", { length: 1000 }).notNull(),
    /** Hash privado do gabarito informativo normalizado. */
    versaoPadrao: varchar("versao_padrao", { length: 64 }),
    /** Lista privada de { fonteId, guiaReferencia, versaoSemantica }, sem XML. */
    fontesVersoesJson: json("fontes_versoes_json").notNull(),
    /** Hash privado de código/tipo/quantidade dos itens hospitalares, sem valores. */
    versaoItensHospitalares: varchar("versao_itens_hospitalares", { length: 64 }).notNull(),
    /** Principais correlacionados que fundamentaram a decisão, sem valores. */
    principaisSnapshotJson: json("principais_snapshot_json").notNull(),
    abrangencia: mysqlEnum("abrangencia", ["conta_inteira_sem_setor", "conta_inteira"])
      .notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    scopeUq: uniqueIndex("uq_ccm_contexto_scope").on(
      table.estabelecimentoId,
      table.convenioId,
      table.arquivoHospitalId,
      table.numeroConta,
      table.numeroLote,
      table.competencia,
    ),
    padraoIdx: index("idx_ccm_contexto_padrao").on(table.padraoId),
  }),
);

export type ContaContextoMedicoContexto = typeof contaContextoMedicoContextos.$inferSelect;
export type InsertContaContextoMedicoContexto = typeof contaContextoMedicoContextos.$inferInsert;

/**
 * Trilha imutável de confirmação, invalidação e revisão necessária. Não é apagada
 * nem atualizada pelo serviço, inclusive após reimportação da fonte.
 */
export const contaContextoMedicoEventos = mysqlTable(
  "conta_contexto_medico_eventos",
  {
    id: int("id").autoincrement().primaryKey(),
    contextoId: int("contexto_id").notNull(),
    revisao: int("revisao").notNull(),
    tipo: mysqlEnum("tipo", ["confirmado", "invalidado", "revisao_necessaria"]).notNull(),
    usuarioId: int("usuario_id"),
    justificativa: varchar("justificativa", { length: 1000 }).notNull(),
    padraoId: int("padrao_id"),
    versaoPadrao: varchar("versao_padrao", { length: 64 }),
    /** Evidência privada: versões de fonte e principais; sem XML nem dados financeiros. */
    evidenciaJson: json("evidencia_json").notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    contextoRevisaoUq: uniqueIndex("uq_ccm_evento_contexto_revisao").on(
      table.contextoId,
      table.revisao,
    ),
    contextoIdx: index("idx_ccm_evento_contexto").on(table.contextoId, table.criadoEm),
  }),
);

export type ContaContextoMedicoEvento = typeof contaContextoMedicoEventos.$inferSelect;
export type InsertContaContextoMedicoEvento = typeof contaContextoMedicoEventos.$inferInsert;
