import { mysqlTable, int, char, varchar, text, timestamp, decimal, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

// Preparação aditiva: nenhuma tabela legada é alterada; nada é carregado aqui.
export const bancoFaturadoLotes = mysqlTable("banco_faturado_lotes", {
  id: int().primaryKey().autoincrement(),
  estabelecimentoId: int().notNull(), convenioId: int().notNull(),
  competencia: varchar({ length: 7 }).notNull(), origem: varchar({ length: 32 }).notNull(),
  fonteFingerprint: char({ length: 64 }).notNull(), totalItens: int().notNull(),
  criadoPor: int().notNull(), criadoEm: timestamp().defaultNow().notNull(),
}, t => ({
  identidade: uniqueIndex("uq_banco_fat_lote_fonte").on(t.estabelecimentoId,t.convenioId,t.competencia,t.origem,t.fonteFingerprint),
  recorte: index("idx_banco_fat_lote_recorte").on(t.estabelecimentoId,t.convenioId,t.competencia),
}));

export const bancoFaturadoItens = mysqlTable("banco_faturado_itens", {
  id: int().primaryKey().autoincrement(), loteId: int().notNull(),
  estabelecimentoId: int().notNull(), convenioId: int().notNull(), competencia: varchar({ length: 7 }).notNull(),
  origemRegistroId: varchar({ length: 191 }).notNull(), fonteItemId: int().notNull(),
  conta: varchar({ length: 100 }).notNull(), guiaPrestador: varchar({ length: 100 }).notNull(),
  guiaOperadora: varchar({ length: 100 }), codigoTuss: varchar({ length: 100 }).notNull(),
  dataItem: char({ length: 10 }).notNull(), // Data civil YYYY-MM-DD.
  tipoItem: varchar({ length: 50 }), setor: varchar({ length: 255 }), receber: char({ length: 1 }).notNull(),
  descricaoItem: text(), pacienteNome: varchar({ length: 255 }),
  quantidade: decimal({ precision: 20, scale: 4 }).notNull(), valorFaturado: decimal({ precision: 20, scale: 4 }).notNull(),
  criadoEm: timestamp().defaultNow().notNull(),
}, t => ({
  identidade: uniqueIndex("uq_banco_fat_item_origem").on(t.loteId,t.origemRegistroId),
  lote: index("idx_banco_fat_item_lote").on(t.estabelecimentoId,t.convenioId,t.loteId),
}));

export const bancoConciliacaoVinculos = mysqlTable("banco_conciliacao_vinculos", {
  id: int().primaryKey().autoincrement(), estabelecimentoId: int().notNull(), convenioId: int().notNull(),
  loteFaturadoId: int().notNull(), grupoFingerprint: char({ length: 64 }).notNull(), totalItens: int().notNull(),
  quantidadeFaturada: decimal({ precision: 20, scale: 4 }).notNull(),
  valorFaturadoGrupo: decimal({ precision: 20, scale: 4 }).notNull(),
  demonstrativoId: int().notNull(), demonstrativoArquivoId: int().notNull(),
  eventoFingerprint: char({ length: 64 }).notNull(), codigoPrestador: varchar({ length: 100 }).notNull(),
  loteRetorno: varchar({ length: 100 }).notNull(), protocoloRetorno: varchar({ length: 100 }).notNull(),
  dataPagamento: char({ length: 10 }), valorPago: decimal({ precision: 20, scale: 4 }).notNull(),
  valorGlosa: decimal({ precision: 20, scale: 4 }).notNull(), codigoGlosa: varchar({ length: 20 }),
  diferenca: decimal({ precision: 20, scale: 4 }).notNull(), metodo: varchar({ length: 32 }).notNull(),
  confirmadoPor: int().notNull(), confirmadoEm: timestamp().defaultNow().notNull(),
}, t => ({
  grupo: uniqueIndex("uq_banco_vinculo_grupo").on(t.estabelecimentoId,t.loteFaturadoId,t.grupoFingerprint),
  evento: uniqueIndex("uq_banco_vinculo_evento").on(t.estabelecimentoId,t.demonstrativoId),
  recorte: index("idx_banco_vinculo_recorte").on(t.estabelecimentoId,t.convenioId),
}));

// Membros preservam os lançamentos por setor; pagamento só existe no vínculo.
export const bancoConciliacaoMembros = mysqlTable("banco_conciliacao_membros", {
  id: int().primaryKey().autoincrement(), estabelecimentoId: int().notNull(),
  convenioId: int().notNull(), vinculoId: int().notNull(), faturadoItemId: int().notNull(),
}, t => ({
  item: uniqueIndex("uq_banco_membro_item").on(t.estabelecimentoId,t.faturadoItemId),
  vinculo: index("idx_banco_membro_vinculo").on(t.estabelecimentoId,t.vinculoId),
}));

export const bancoXmlLotes = mysqlTable("banco_xml_lotes", {
  id: int().primaryKey().autoincrement(), estabelecimentoId: int().notNull(), convenioId: int().notNull(),
  codigoPrestador: varchar({ length: 100 }).notNull(), loteRetorno: varchar({ length: 100 }).notNull(),
  protocoloRetorno: varchar({ length: 100 }).notNull(), tipoTransacao: varchar({ length: 50 }).notNull(),
  versaoTiss: varchar({ length: 20 }).notNull(), vinculosIds: json().notNull(),
  totalGuias: int().notNull(), totalItens: int().notNull(), chavePrivadaArquivo: varchar({ length: 500 }).notNull(),
  conteudoFingerprint: char({ length: 64 }).notNull(), validadoXsdEm: timestamp().notNull(),
  geradoPor: int().notNull(), geradoEm: timestamp().defaultNow().notNull(),
}, t => ({ lote: index("idx_banco_xml_lote_recorte").on(t.estabelecimentoId,t.convenioId,t.protocoloRetorno) }));
