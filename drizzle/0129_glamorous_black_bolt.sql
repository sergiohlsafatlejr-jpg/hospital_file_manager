ALTER TABLE `importacoesTabela` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `importacoesTabela` ADD `loteId` varchar(32);--> statement-breakpoint
ALTER TABLE `importacoesTabela` ADD `loteHash` varchar(64);--> statement-breakpoint
ALTER TABLE `importacoesTabela` ADD `procedimentoFonte` varchar(32);--> statement-breakpoint
ALTER TABLE `importacoesTabela` ADD CONSTRAINT `uq_importacoes_tabela_lote_fonte` UNIQUE(`estabelecimentoId`,`convenioId`,`loteHash`,`procedimentoFonte`);--> statement-breakpoint
CREATE INDEX `idx_importacoes_tabela_estabelecimento` ON `importacoesTabela` (`estabelecimentoId`,`convenioId`,`createdAt`);