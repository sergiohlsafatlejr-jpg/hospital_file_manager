CREATE TABLE `historico_notificacoes_atendimento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`qtdAtendimentos` int NOT NULL,
	`observacao` text NOT NULL,
	`usuario` varchar(255),
	`atendimentosJson` json NOT NULL,
	`notificacoesJson` json NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historico_notificacoes_atendimento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_hist_notif_atend_estab` ON `historico_notificacoes_atendimento` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_hist_notif_atend_criado` ON `historico_notificacoes_atendimento` (`criadoEm`);
