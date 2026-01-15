CREATE TABLE `estabelecimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`endereco` text,
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estabelecimentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `arquivos` MODIFY COLUMN `tipoArquivo` enum('xml','excel','pdf','csv') NOT NULL;--> statement-breakpoint
ALTER TABLE `arquivos` ADD `estabelecimentoId` int;