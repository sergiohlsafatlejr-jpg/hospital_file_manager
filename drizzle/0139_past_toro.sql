CREATE TABLE `atendimentos_hop_controles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`criado_por` int NOT NULL,
	`estado` enum('pausado','preparando','ativo','erro','incerto') NOT NULL DEFAULT 'pausado',
	`task_uid` varchar(65),
	`cron_utc` varchar(100) NOT NULL DEFAULT '0 0 13 * * *',
	`fuso` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`operacao_token` varchar(64),
	`execucao_token` varchar(64),
	`lease_ate` datetime(3),
	`ultimo_slot` varchar(64),
	`ultima_execucao` datetime(3),
	`proxima_execucao` datetime(3),
	`producer_token_hash` varchar(64),
	`criado_em` datetime(3) NOT NULL,
	`atualizado_em` datetime(3) NOT NULL,
	CONSTRAINT `atendimentos_hop_controles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_athop_controle_unidade` UNIQUE(`estabelecimento_id`),
	CONSTRAINT `uq_athop_controle_task_uid` UNIQUE(`task_uid`),
	CONSTRAINT `uq_athop_controle_producer_hash` UNIQUE(`producer_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_hop_execucoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`controle_id` int NOT NULL,
	`lote_id` int,
	`slot` varchar(64) NOT NULL,
	`modo` enum('cron','manual') NOT NULL,
	`estado` enum('reservada','concluida','falhou','incerto') NOT NULL,
	`contagens` json,
	`codigo` varchar(64),
	`iniciado_em` datetime(3) NOT NULL,
	`terminado_em` datetime(3),
	`criado_em` datetime(3) NOT NULL,
	`atualizado_em` datetime(3) NOT NULL,
	CONSTRAINT `atendimentos_hop_execucoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_athop_execucao_controle_slot` UNIQUE(`controle_id`,`slot`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_hop_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`controle_id` int NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`lote_ref` varchar(36) NOT NULL,
	`estado` enum('carregando','completo','publicado','falhou','incerto') NOT NULL,
	`total_esperado` int,
	`total_observado` int,
	`fingerprint_privado` varchar(64),
	`iniciado_em` datetime(3) NOT NULL,
	`concluido_em` datetime(3),
	`publicado_em` datetime(3),
	`falhou_em` datetime(3),
	`codigo` varchar(64),
	`criado_em` datetime(3) NOT NULL,
	`atualizado_em` datetime(3) NOT NULL,
	CONSTRAINT `atendimentos_hop_lotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_athop_lote_unidade_ref` UNIQUE(`estabelecimento_id`,`lote_ref`)
);
--> statement-breakpoint
CREATE INDEX `idx_athop_controle_estado_lease` ON `atendimentos_hop_controles` (`estado`,`lease_ate`);--> statement-breakpoint
CREATE INDEX `idx_athop_execucao_controle_data` ON `atendimentos_hop_execucoes` (`controle_id`,`iniciado_em`);--> statement-breakpoint
CREATE INDEX `idx_athop_execucao_lote` ON `atendimentos_hop_execucoes` (`lote_id`);--> statement-breakpoint
CREATE INDEX `idx_athop_lote_controle_estado` ON `atendimentos_hop_lotes` (`controle_id`,`estado`);--> statement-breakpoint
CREATE INDEX `idx_athop_lote_unidade_data` ON `atendimentos_hop_lotes` (`estabelecimento_id`,`criado_em`);