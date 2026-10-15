CREATE TABLE `integracao_easylocal_agendamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leitura_id` int NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`criado_por` int NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`estado` enum('preparando','ativo','pausado','erro','incerto') NOT NULL DEFAULT 'preparando',
	`frequencia` enum('15min','1hora','diario') NOT NULL,
	`horario_brasilia` varchar(5),
	`fuso` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`cron_utc` varchar(100) NOT NULL,
	`revisao_aprovada` varchar(64) NOT NULL,
	`operacao_token` varchar(64),
	`execucao_token` varchar(64),
	`lease_ate` datetime(3),
	`ultimo_slot` varchar(32),
	`ultima_execucao` datetime(3),
	`proxima_execucao` datetime(3),
	`ultimo_resultado` json,
	`criado_em` datetime(3) NOT NULL,
	`atualizado_em` datetime(3) NOT NULL,
		CONSTRAINT `integracao_easylocal_agendamentos_id` PRIMARY KEY(`id`),
		CONSTRAINT `uq_el_agenda_leitura_unidade` UNIQUE(`leitura_id`,`estabelecimento_id`),
		CONSTRAINT `uq_el_agenda_task_uid` UNIQUE(`schedule_cron_task_uid`)
	) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
--> statement-breakpoint
CREATE INDEX `idx_el_agenda_unidade` ON `integracao_easylocal_agendamentos` (`estabelecimento_id`);--> statement-breakpoint
CREATE INDEX `idx_el_agenda_estado_lease` ON `integracao_easylocal_agendamentos` (`estado`,`lease_ate`);
