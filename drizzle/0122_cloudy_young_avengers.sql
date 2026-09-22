ALTER TABLE `warleine_faturamento_lotes` ADD `claimToken` varchar(64);--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `claimedBy` varchar(100);--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `leaseExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `reducaoAprovadaEm` timestamp;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `reducaoAprovadaPor` int;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_lotes` ADD `reducaoAprovacaoMotivo` text;--> statement-breakpoint
CREATE INDEX `idx_warleine_fat_lote_lease` ON `warleine_faturamento_lotes` (`status`,`leaseExpiresAt`);