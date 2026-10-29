ALTER TABLE `fin_bancos` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interClientId` varchar(100);--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interClientSecret` text;--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interCertPem` text;--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interKeyPem` text;--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interContaCorrente` text;--> statement-breakpoint
ALTER TABLE `fin_bancos` ADD `interBaseUrl` varchar(255);--> statement-breakpoint
ALTER TABLE `fin_recebiveis` ADD `boletoSolicitacaoId` varchar(100);--> statement-breakpoint
ALTER TABLE `fin_recebiveis` ADD `boletoLinhaDigitavel` varchar(100);--> statement-breakpoint
ALTER TABLE `fin_recebiveis` ADD `boletoPixCopiaCola` text;--> statement-breakpoint
ALTER TABLE `fin_recebiveis` ADD `notaFiscalKey` varchar(255);--> statement-breakpoint
ALTER TABLE `fin_recebiveis` ADD `emailEnviado` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_fin_bancos_estabelecimento` ON `fin_bancos` (`estabelecimentoId`);