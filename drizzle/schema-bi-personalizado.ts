import { int, json, longtext, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Configuração personalizada de identidade visual, layout e indicadores
 * do Painel BI Executivo por Estabelecimento (Cliente/Hospital).
 */
export const estabelecimentoBiPersonalizado = mysqlTable(
  "estabelecimento_bi_personalizado",
  {
    id: int("id").autoincrement().primaryKey(),
    estabelecimentoId: int("estabelecimento_id").notNull(),
    temaPreset: varchar("tema_preset", { length: 40 }).default("ela_petroleo").notNull(),
    logoUrl: longtext("logo_url"),
    nomeExibicao: varchar("nome_exibicao", { length: 120 }),
    tituloRelatorio: varchar("titulo_relatorio", { length: 120 })
      .default("INDICADORES DE FATURAMENTO")
      .notNull(),
    rodapeTexto: varchar("rodape_texto", { length: 180 })
      .default("CICLO DA RECEITA - FATURADO AO RECEBIMENTO")
      .notNull(),
    configuracaoJson: json("configuracao_json").notNull(),
    atualizadoPorId: int("atualizado_por_id"),
    atualizadoPorNome: varchar("atualizado_por_nome", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    estabUniqueIdx: uniqueIndex("uq_estab_bi_personalizado").on(table.estabelecimentoId),
  }),
);

export type EstabelecimentoBiPersonalizado = typeof estabelecimentoBiPersonalizado.$inferSelect;
export type InsertEstabelecimentoBiPersonalizado = typeof estabelecimentoBiPersonalizado.$inferInsert;
