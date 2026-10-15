import { int, mysqlTable, varchar, datetime, json, index, uniqueIndex, mysqlEnum } from "drizzle-orm/mysql-core";

/** Controle de horários apenas para destinos gerenciados EASYLocal do Portal. */
export const easyLocalAgendamentos = mysqlTable("integracao_easylocal_agendamentos", {
  id: int("id").autoincrement().primaryKey(),
  leituraId: int("leitura_id").notNull(),
  estabelecimentoId: int("estabelecimento_id").notNull(),
  criadoPor: int("criado_por").notNull(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  estado: mysqlEnum("estado", ["preparando", "ativo", "pausado", "erro", "incerto"]).notNull().default("preparando"),
  frequencia: mysqlEnum("frequencia", ["15min", "1hora", "diario"]).notNull(),
  horarioBrasilia: varchar("horario_brasilia", { length: 5 }),
  fuso: varchar("fuso", { length: 64 }).notNull().default("America/Sao_Paulo"),
  cronUtc: varchar("cron_utc", { length: 100 }).notNull(),
  revisaoAprovada: varchar("revisao_aprovada", { length: 64 }).notNull(),
  operacaoToken: varchar("operacao_token", { length: 64 }),
  execucaoToken: varchar("execucao_token", { length: 64 }),
  leaseAte: datetime("lease_ate", { mode: "string", fsp: 3 }),
  ultimoSlot: varchar("ultimo_slot", { length: 32 }),
  ultimaExecucao: datetime("ultima_execucao", { mode: "string", fsp: 3 }),
  proximaExecucao: datetime("proxima_execucao", { mode: "string", fsp: 3 }),
  ultimoResultado: json("ultimo_resultado"),
  criadoEm: datetime("criado_em", { mode: "string", fsp: 3 }).notNull(),
  atualizadoEm: datetime("atualizado_em", { mode: "string", fsp: 3 }).notNull(),
}, table => ({
  leituraUnidadeUnique: uniqueIndex("uq_el_agenda_leitura_unidade").on(table.leituraId, table.estabelecimentoId),
  taskUidUnique: uniqueIndex("uq_el_agenda_task_uid").on(table.scheduleCronTaskUid),
  unidadeIdx: index("idx_el_agenda_unidade").on(table.estabelecimentoId),
  estadoLeaseIdx: index("idx_el_agenda_estado_lease").on(table.estado, table.leaseAte),
}));
