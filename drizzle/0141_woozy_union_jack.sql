CREATE TABLE `contratos_convenios_documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contratoId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(100) NOT NULL DEFAULT 'application/pdf',
	`tamanhoBytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`paginas` int,
	`status` enum('processando','concluido','ocr_necessario','erro') NOT NULL DEFAULT 'processando',
	`textoExtraido` longtext,
	`pontosImportantes` json,
	`erroProcessamento` text,
	`criadoPor` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contratos_convenios_documentos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_contratos_conv_doc_contrato_hash` UNIQUE(`contratoId`,`sha256`)
);
--> statement-breakpoint
CREATE INDEX `idx_contratos_conv_doc_contrato` ON `contratos_convenios_documentos` (`contratoId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_contratos_conv_doc_estabelecimento` ON `contratos_convenios_documentos` (`estabelecimentoId`,`createdAt`);