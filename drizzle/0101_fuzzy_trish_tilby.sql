CREATE TABLE `estabelecimento_fonte_relatorios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`fonteFaturamento` enum('integ_faturado','contas_convenio_itens','faturamento_tiss') NOT NULL,
	`origemPreferida` enum('XML','BANCO_CLIENTE','AMBOS') DEFAULT 'AMBOS',
	`sistemaOrigem` varchar(50),
	`mapeamentoCampos` json,
	`descricao` text,
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estabelecimento_fonte_relatorios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_fonte_rel_estab` ON `estabelecimento_fonte_relatorios` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_fonte_rel_fonte` ON `estabelecimento_fonte_relatorios` (`fonteFaturamento`);