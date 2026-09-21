CREATE TABLE `tasy_atendimentos_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int,
	`linhaArquivo` int NOT NULL,
	`sequencia` varchar(100),
	`origemId` varchar(255),
	`origemAtualizadaEm` timestamp,
	`convenio` varchar(255),
	`categoria` varchar(255),
	`plano` varchar(255),
	`acomodacao` varchar(255),
	`entrada` timestamp,
	`saida` timestamp,
	`alta` timestamp,
	`dataDefinitivo` timestamp,
	`competencia` varchar(20),
	`setorEntrada` varchar(255),
	`dataEtapa` timestamp,
	`etapaConta` varchar(255),
	`setorEtapa` varchar(255),
	`usuarioEtapa` varchar(100),
	`motivoDevolucao` text,
	`statusConta` varchar(30),
	`protocolo` varchar(100),
	`nomeProtocolo` varchar(255),
	`titulo` varchar(100),
	`atendimento` varchar(100),
	`conta` varchar(100),
	`autorizacao` varchar(100),
	`matricula` varchar(100),
	`paciente` varchar(255),
	`tipoGuia` varchar(50),
	`codigoProcedimento` varchar(100),
	`procedimento` varchar(500),
	`medico` varchar(255),
	`valorConta` decimal(18,2),
	`statusValidacao` varchar(20) NOT NULL DEFAULT 'valido',
	`erroValidacao` text,
	`hashConteudo` varchar(64) NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tasy_atendimentos_staging_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tasy_stage_lote_linha` UNIQUE(`loteId`,`linhaArquivo`)
);
--> statement-breakpoint
CREATE TABLE `tasy_integracao_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int,
	`arquivoNome` varchar(255) NOT NULL,
	`arquivoHash` varchar(64) NOT NULL,
	`arquivoTamanho` int,
	`status` varchar(30) NOT NULL DEFAULT 'recebido',
	`totalLinhas` int NOT NULL DEFAULT 0,
	`totalValidas` int NOT NULL DEFAULT 0,
	`totalAvisos` int NOT NULL DEFAULT 0,
	`totalRejeitadas` int NOT NULL DEFAULT 0,
	`totalContas` int NOT NULL DEFAULT 0,
	`totalPublicadas` int NOT NULL DEFAULT 0,
	`valorConsolidado` decimal(18,2) NOT NULL DEFAULT '0',
	`erroResumo` text,
	`criadoPor` int NOT NULL,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`validadoEm` timestamp,
	`publicadoEm` timestamp,
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasy_integracao_lotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasy_integracao_quarentena` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`linhaArquivo` int NOT NULL,
	`codigoErro` varchar(80) NOT NULL,
	`detalhe` text,
	`referenciaHash` varchar(64) NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tasy_integracao_quarentena_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `configId` int;--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `ultimoLoteId` int;--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `origemAtualizadaEm` timestamp;--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `statusConta` varchar(30);--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `ativoNaFonte` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `hashConteudo` varchar(64);--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD `procedimentoDescricao` varchar(500);--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` DROP INDEX `unique_origem`;--> statement-breakpoint
ALTER TABLE `atendimentos_unificados` ADD CONSTRAINT `uq_atend_estab_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_stage_lote` ON `tasy_atendimentos_staging` (`loteId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_stage_estab_status` ON `tasy_atendimentos_staging` (`estabelecimentoId`,`statusValidacao`);--> statement-breakpoint
CREATE INDEX `idx_tasy_stage_origem` ON `tasy_atendimentos_staging` (`estabelecimentoId`,`origemId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_lote_estab` ON `tasy_integracao_lotes` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_lote_status` ON `tasy_integracao_lotes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasy_lote_hash` ON `tasy_integracao_lotes` (`arquivoHash`);--> statement-breakpoint
CREATE INDEX `idx_tasy_quarentena_lote` ON `tasy_integracao_quarentena` (`loteId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_quarentena_estab` ON `tasy_integracao_quarentena` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_estab_origem_ativo` ON `atendimentos_unificados` (`estabelecimentoId`,`origemSistema`,`ativoNaFonte`);--> statement-breakpoint
CREATE INDEX `idx_atend_estab_etapa` ON `atendimentos_unificados` (`estabelecimentoId`,`etapaConta`);
