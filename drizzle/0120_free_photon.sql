ALTER TABLE `warleine_faturamento_lotes` ADD `arquivoStorageKey` varchar(500);--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `tentativas` int DEFAULT 0 NOT NULL;