import {
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const fabricaSetorEnum = [
  "recepcao",
  "faturamento",
  "auditoria_interna",
  "auditoria_externa",
  "limpeza_prontuario",
  "enviado_convenio",
  "recursos",
  "finalizado",
] as const;

export type FabricaSetor = (typeof fabricaSetorEnum)[number];

export const fabricaStatusSetorEnum = [
  "fila",
  "em_andamento",
  "devolvido_erro",
  "aguardando_terceiro",
  "concluido",
] as const;

export type FabricaStatusSetor = (typeof fabricaStatusSetorEnum)[number];

export const fabricaTipoAtendimentoEnum = [
  "internacao",
  "pronto_socorro",
  "ambulatorio_sadt",
  "hospital_dia",
  "cirurgico",
] as const;

export type FabricaTipoAtendimento = (typeof fabricaTipoAtendimentoEnum)[number];

/**
 * Tabela central da Fábrica de Faturamento Safatle (Esteira em 6 Setores)
 */
export const fabricaContas = mysqlTable(
  "fabrica_contas",
  {
    id: int("id").autoincrement().primaryKey(),
    hospitalEstabelecimentoId: int("hospital_estabelecimento_id").notNull(),
    convenioId: int("convenio_id"),
    convenioNome: varchar("convenio_nome", { length: 255 }),
    numeroAtendimento: varchar("numero_atendimento", { length: 64 }),
    numeroContaHospital: varchar("numero_conta_hospital", { length: 64 }),
    numeroGuia: varchar("numero_guia", { length: 64 }),
    numeroLote: varchar("numero_lote", { length: 64 }),
    senhaAutorizacao: varchar("senha_autorizacao", { length: 64 }),
    nomePaciente: varchar("nome_paciente", { length: 255 }).notNull(),
    tipoAtendimento: mysqlEnum("tipo_atendimento", fabricaTipoAtendimentoEnum)
      .default("internacao")
      .notNull(),
    dataEntrada: date("data_entrada", { mode: "string" }).notNull(),
    dataAlta: date("data_alta", { mode: "string" }),
    dataRecebimentoSafatle: datetime("data_recebimento_safatle", {
      mode: "string",
    }).notNull(),

    setorAtual: mysqlEnum("setor_atual", fabricaSetorEnum)
      .default("recepcao")
      .notNull(),
    statusSetor: mysqlEnum("status_setor", fabricaStatusSetorEnum)
      .default("fila")
      .notNull(),
    entradaSetorAtualEm: timestamp("entrada_setor_atual_em")
      .defaultNow()
      .notNull(),

    recepcionadoPorId: int("recepcionado_por_id"),
    recepcionadoPorNome: varchar("recepcionado_por_nome", { length: 255 }),
    responsavelAtualId: int("responsavel_atual_id"),
    responsavelAtualNome: varchar("responsavel_atual_nome", { length: 255 }),
    faturistaId: int("faturista_id"),
    faturistaNome: varchar("faturista_nome", { length: 255 }),
    auditorInternoId: int("auditor_interno_id"),
    auditorInternoNome: varchar("auditor_interno_nome", { length: 255 }),
    auditorExternoNome: varchar("auditor_externo_nome", { length: 255 }),
    limpezaPorId: int("limpeza_por_id"),
    limpezaPorNome: varchar("limpeza_por_nome", { length: 255 }),

    valorFaturadoInicial: decimal("valor_faturado_inicial", {
      precision: 14,
      scale: 2,
    }).default("0.00"),
    valorFaturadoFinal: decimal("valor_faturado_final", {
      precision: 14,
      scale: 2,
    }).default("0.00"),
    totalItensXml: int("total_itens_xml").default(0),

    arquivoXmlFaturamentoId: int("arquivo_xml_faturamento_id"),
    arquivoXmlFinalId: int("arquivo_xml_final_id"),
    contaConvenioResumoId: int("conta_convenio_resumo_id"),

    statusAuditoriaRegras: mysqlEnum("status_auditoria_regras", [
      "pendente",
      "conforme",
      "divergente",
      "revisado",
    ]).default("pendente"),
    totalDivergenciasRegras: int("total_divergencias_regras").default(0),
    scoreRiscoAuditoria: int("score_risco_auditoria").default(0),

    protocoloEnvioConvenio: varchar("protocolo_envio_convenio", {
      length: 120,
    }),
    metodoEnvioConvenio: mysqlEnum("metodo_envio_convenio", [
      "manual",
      "rpa_portal",
      "webservice_tiss",
    ]),
    dataEnvioConvenio: datetime("data_envio_convenio", { mode: "string" }),

    qtdRetrabalhos: int("qtd_retrabalhos").default(0).notNull(),
    observacoes: text("observacoes"),
    ultimoMotivoRetorno: text("ultimo_motivo_retorno"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    hospIdx: index("idx_fab_contas_hosp").on(table.hospitalEstabelecimentoId),
    convIdx: index("idx_fab_contas_conv").on(table.convenioId),
    setorIdx: index("idx_fab_contas_setor").on(
      table.setorAtual,
      table.statusSetor
    ),
    pacienteIdx: index("idx_fab_contas_paciente").on(table.nomePaciente),
    guiaIdx: index("idx_fab_contas_guia").on(table.numeroGuia),
    atendIdx: index("idx_fab_contas_atend").on(table.numeroAtendimento),
    recebIdx: index("idx_fab_contas_receb").on(table.dataRecebimentoSafatle),
  })
);

export type FabricaConta = typeof fabricaContas.$inferSelect;
export type InsertFabricaConta = typeof fabricaContas.$inferInsert;

/**
 * Histórico de transições entre setores (SLA, tempo de permanência e produção por colaborador)
 */
export const fabricaHistoricoFluxo = mysqlTable(
  "fabrica_historico_fluxo",
  {
    id: int("id").autoincrement().primaryKey(),
    fabricaContaId: int("fabrica_conta_id").notNull(),
    hospitalEstabelecimentoId: int("hospital_estabelecimento_id").notNull(),
    setorOrigem: varchar("setor_origem", { length: 50 }),
    setorDestino: varchar("setor_destino", { length: 50 }).notNull(),
    acao: varchar("acao", { length: 64 }).notNull(), // recepcionado, encaminhado, assumido, xml_importado, devolvido_erro, aprovado, enviado_convenio
    usuarioId: int("usuario_id"),
    usuarioNome: varchar("usuario_nome", { length: 255 }),
    dataEntradaSetor: datetime("data_entrada_setor", { mode: "string" }),
    dataSaidaSetor: datetime("data_saida_setor", { mode: "string" }).notNull(),
    duracaoSegundos: int("duracao_segundos").default(0).notNull(),
    valorMovimentado: decimal("valor_movimentado", {
      precision: 14,
      scale: 2,
    }).default("0.00"),
    observacao: text("observacao"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    contaIdx: index("idx_fab_hist_conta").on(table.fabricaContaId),
    userIdx: index("idx_fab_hist_user").on(table.usuarioId, table.createdAt),
    setorIdx: index("idx_fab_hist_setor").on(
      table.setorOrigem,
      table.setorDestino
    ),
  })
);

export type FabricaHistoricoFluxo = typeof fabricaHistoricoFluxo.$inferSelect;
export type InsertFabricaHistoricoFluxo =
  typeof fabricaHistoricoFluxo.$inferInsert;

/**
 * Registro de Erros de Contas apontados na Auditoria Interna / Externa (Qualidade por Faturista)
 */
export const fabricaErrosConta = mysqlTable(
  "fabrica_erros_conta",
  {
    id: int("id").autoincrement().primaryKey(),
    fabricaContaId: int("fabrica_conta_id").notNull(),
    hospitalEstabelecimentoId: int("hospital_estabelecimento_id").notNull(),
    convenioId: int("convenio_id"),
    faturistaId: int("faturista_id"),
    faturistaNome: varchar("faturista_nome", { length: 255 }),
    auditorId: int("auditor_id"),
    auditorNome: varchar("auditor_nome", { length: 255 }),
    setorOrigemErro: mysqlEnum("setor_origem_erro", [
      "auditoria_interna",
      "auditoria_externa",
      "limpeza_prontuario",
    ])
      .default("auditoria_interna")
      .notNull(),
    tipoErro: mysqlEnum("tipo_erro", [
      "regra_gabarito",
      "item_faltante",
      "quantidade_divergente",
      "preco_divergente",
      "falha_prontuario",
      "dados_cadastrais",
      "autorizacao_senha",
      "outro",
    ])
      .default("regra_gabarito")
      .notNull(),
    codigoItem: varchar("codigo_item", { length: 64 }),
    descricaoErro: text("descricao_erro").notNull(),
    impactoFinanceiro: decimal("impacto_financeiro", {
      precision: 14,
      scale: 2,
    }).default("0.00"),
    corrigido: mysqlEnum("corrigido", ["sim", "nao"]).default("nao").notNull(),
    dataCorrecao: datetime("data_correcao", { mode: "string" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    contaIdx: index("idx_fab_erros_conta").on(table.fabricaContaId),
    fatIdx: index("idx_fab_erros_faturista").on(table.faturistaId),
    hospIdx: index("idx_fab_erros_hosp").on(table.hospitalEstabelecimentoId),
  })
);

export type FabricaErroConta = typeof fabricaErrosConta.$inferSelect;
export type InsertFabricaErroConta = typeof fabricaErrosConta.$inferInsert;

/**
 * Metas de Faturamento e Produção por Funcionário, Setor e Hospital
 */
export const fabricaMetas = mysqlTable(
  "fabrica_metas",
  {
    id: int("id").autoincrement().primaryKey(),
    competencia: varchar("competencia", { length: 7 }).notNull(), // YYYY-MM
    setor: mysqlEnum("setor", fabricaSetorEnum).default("faturamento").notNull(),
    usuarioId: int("usuario_id"),
    usuarioNome: varchar("usuario_nome", { length: 255 }),
    hospitalEstabelecimentoId: int("hospital_estabelecimento_id"),
    metaQuantidadeContas: int("meta_quantidade_contas").default(0).notNull(),
    metaValorFaturado: decimal("meta_valor_faturado", {
      precision: 14,
      scale: 2,
    }).default("0.00"),
    metaSlaHoras: int("meta_sla_horas").default(48),
    observacao: text("observacao"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    compIdx: index("idx_fab_metas_comp").on(table.competencia, table.setor),
    userIdx: index("idx_fab_metas_user").on(table.usuarioId),
  })
);

export type FabricaMeta = typeof fabricaMetas.$inferSelect;
export type InsertFabricaMeta = typeof fabricaMetas.$inferInsert;
