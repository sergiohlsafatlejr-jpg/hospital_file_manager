CREATE TABLE `prontuario_evolucoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numeroConta` varchar(100) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`dataEvolucao` timestamp,
	`profissional` varchar(255),
	`conselho` varchar(50),
	`tipoEvolucao` varchar(100),
	`descricao` text,
	`origem` varchar(50) DEFAULT 'INTEGRACAO',
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prontuario_evolucoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prontuario_prescricoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numeroConta` varchar(100) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`dataPrescricao` timestamp,
	`medico` varchar(255),
	`crm` varchar(50),
	`codigoItem` varchar(50),
	`descricaoItem` varchar(255),
	`quantidade` decimal(10,2),
	`viaAdministracao` varchar(100),
	`frequencia` varchar(100),
	`origem` varchar(50) DEFAULT 'INTEGRACAO',
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prontuario_prescricoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pe_numconta_estab` ON `prontuario_evolucoes` (`numeroConta`,`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_pp_numconta_estab` ON `prontuario_prescricoes` (`numeroConta`,`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_pp_codigo` ON `prontuario_prescricoes` (`codigoItem`);