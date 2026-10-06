CREATE TABLE `stagion_faturado_urologico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importacaoId` int,
	`estabelecimentoId` int NOT NULL,
	`numeroConta` varchar(100),
	`numeroGuia` varchar(100),
	`convenioNome` varchar(255),
	`pacienteNome` varchar(255),
	`codigoItem` varchar(100),
	`descricaoItem` text,
	`quantidade` decimal(12,4),
	`valorUnitario` decimal(12,4),
	`valorTotal` decimal(12,4),
	`dataExecucao` datetime,
	`competencia` varchar(20),
	`rawData` json,
	`processado` boolean DEFAULT false,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `stagion_faturado_urologico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_hup_faturado_estab_importacao` ON `stagion_faturado_urologico` (`estabelecimentoId`,`importacaoId`);--> statement-breakpoint
CREATE INDEX `idx_hup_faturado_estab_conta` ON `stagion_faturado_urologico` (`estabelecimentoId`,`numeroConta`);