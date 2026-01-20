CREATE TABLE `lotesRecurso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`convenioId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`userId` int NOT NULL,
	`numeroLote` varchar(50) NOT NULL,
	`descricao` text,
	`valorTotalGlosado` decimal(12,2) DEFAULT '0',
	`valorTotalRecursado` decimal(12,2) DEFAULT '0',
	`valorTotalRecuperado` decimal(12,2) DEFAULT '0',
	`quantidadeItens` int DEFAULT 0,
	`status` enum('rascunho','pendente_envio','enviado','em_analise','respondido','finalizado') NOT NULL DEFAULT 'rascunho',
	`dataEnvio` timestamp,
	`dataPrazoPagamento` timestamp,
	`dataResposta` timestamp,
	`protocoloEnvio` varchar(100),
	`anexoPdfUrl` text,
	`anexoPdfKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lotesRecurso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `recursosGlosa` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `recursosGlosa` ADD `loteId` int;