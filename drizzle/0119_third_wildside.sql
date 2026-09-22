CREATE TABLE IF NOT EXISTS `warleine_faturamento_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	CONSTRAINT `warleine_faturamento_staging_id` PRIMARY KEY(`id`),
	INDEX `idx_warleine_fatur_estab` (`estabelecimentoId`),
	INDEX `idx_warleine_fatur_config` (`configId`)
);
--> statement-breakpoint
CREATE TABLE `warleine_faturamento_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`numeroLinha` int NOT NULL,
	`origemRegistroId` varchar(191),
	`origemAtualizadoEm` varchar(30),
	`chaveNegocioHash` varchar(64) NOT NULL,
	`linhaHash` varchar(64) NOT NULL,
	`ativoParaRelatorio` boolean NOT NULL DEFAULT false,
	`convenioFaturadoNome` varchar(255),
	`convenioFaturadoCodigo` varchar(100),
	`competencia` varchar(7) NOT NULL,
	`remessaFaturamento` varchar(100),
	`codigoRecursoOrigem1` varchar(100),
	`tipoItem` varchar(50),
	`protocoloConvenio` varchar(100),
	`numeroConta` varchar(100) NOT NULL,
	`guiaOperadora` varchar(100),
	`guiaPrestador` varchar(100),
	`pacienteNome` varchar(255),
	`carteiraBeneficiario` varchar(100),
	`dataAberturaConta` varchar(10),
	`dataEntrada` varchar(10),
	`dataAlta` varchar(10),
	`codigoTuss` varchar(100),
	`codigoItemInterno` varchar(100),
	`codigoTipoServico` varchar(50),
	`servicoNome` text,
	`funcaoTiss` varchar(50),
	`recebimentoViaHospital` varchar(1),
	`setorCodigo` varchar(50),
	`setorNome` varchar(255),
	`prestadorExecutanteCodigo` varchar(100),
	`prestadorExecutanteNome` varchar(255),
	`quantidade` decimal(18,4) NOT NULL DEFAULT '0',
	`valorFaturado` decimal(20,4) NOT NULL DEFAULT '0',
	`valorRecebido` decimal(20,4) NOT NULL DEFAULT '0',
	`valorRecebidoMaior` decimal(20,4) NOT NULL DEFAULT '0',
	`valorTotalRecebido` decimal(20,4) NOT NULL DEFAULT '0',
	`valorAberto` decimal(20,4) NOT NULL DEFAULT '0',
	`valorGlosa` decimal(20,4) NOT NULL DEFAULT '0',
	`valorRecursado` decimal(20,4) NOT NULL DEFAULT '0',
	`valorGlosaAceita` decimal(20,4) NOT NULL DEFAULT '0',
	`valorGlosaAnalise` decimal(20,4) NOT NULL DEFAULT '0',
	`valorGlosaRecuperada` decimal(20,4) NOT NULL DEFAULT '0',
	`codigoGlosa` varchar(100),
	`motivoGlosa` text,
	`codigoMotivoInterno` varchar(100),
	`observacaoGlosa` text,
	`tipoAtendimento` varchar(100),
	`operadorCodigo` varchar(100),
	`operadorNome` varchar(255),
	`dataFechamentoRemessa` varchar(10),
	`dataPagamento` varchar(10),
	`dataAssociacaoWarleine` varchar(10),
	`convenioPagadorNome` varchar(255),
	`valorUnitario` decimal(20,4) NOT NULL DEFAULT '0',
	`publicadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warleine_faturamento_itens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_warleine_item_lote_linha` UNIQUE(`loteId`,`numeroLinha`)
);
--> statement-breakpoint
CREATE TABLE `warleine_faturamento_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int,
	`origem` varchar(20) NOT NULL DEFAULT 'arquivo',
	`arquivoNome` varchar(255) NOT NULL,
	`arquivoHash` varchar(64) NOT NULL,
	`arquivoTamanho` int,
	`status` varchar(30) NOT NULL DEFAULT 'recebido',
	`totalLinhas` int NOT NULL DEFAULT 0,
	`totalValidas` int NOT NULL DEFAULT 0,
	`totalAvisos` int NOT NULL DEFAULT 0,
	`totalRejeitadas` int NOT NULL DEFAULT 0,
	`totalPublicadas` int NOT NULL DEFAULT 0,
	`valorFaturado` decimal(20,4) NOT NULL DEFAULT '0',
	`valorRecebido` decimal(20,4) NOT NULL DEFAULT '0',
	`valorTotalRecebido` decimal(20,4) NOT NULL DEFAULT '0',
	`valorAberto` decimal(20,4) NOT NULL DEFAULT '0',
	`valorGlosa` decimal(20,4) NOT NULL DEFAULT '0',
	`competencias` json,
	`erroResumo` text,
	`criadoPor` int NOT NULL,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`validadoEm` timestamp,
	`publicadoEm` timestamp,
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warleine_faturamento_lotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_warleine_fat_lote_estab_hash` UNIQUE(`estabelecimentoId`,`arquivoHash`)
);
--> statement-breakpoint
CREATE TABLE `warleine_faturamento_quarentena` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`numeroLinha` int NOT NULL,
	`erroCodigo` varchar(100) NOT NULL,
	`erroDetalhe` text,
	`dadosBrutos` json,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warleine_faturamento_quarentena_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_warleine_quarentena_lote_linha` UNIQUE(`loteId`,`numeroLinha`)
);
--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` MODIFY COLUMN `configId` int;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` ADD `loteId` int;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` ADD `numeroLinha` int;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` ADD `status` varchar(20) DEFAULT 'valido' NOT NULL;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` ADD `avisoCodigo` varchar(100);--> statement-breakpoint
ALTER TABLE `warleine_faturamento_staging` ADD CONSTRAINT `uq_warleine_fatur_lote_linha` UNIQUE(`loteId`,`numeroLinha`);--> statement-breakpoint
CREATE INDEX `idx_warleine_item_estab_comp` ON `warleine_faturamento_itens` (`estabelecimentoId`,`ativoParaRelatorio`,`competencia`);--> statement-breakpoint
CREATE INDEX `idx_warleine_item_estab_conta` ON `warleine_faturamento_itens` (`estabelecimentoId`,`ativoParaRelatorio`,`numeroConta`);--> statement-breakpoint
CREATE INDEX `idx_warleine_item_estab_convenio` ON `warleine_faturamento_itens` (`estabelecimentoId`,`ativoParaRelatorio`,`convenioFaturadoCodigo`);--> statement-breakpoint
CREATE INDEX `idx_warleine_item_lote` ON `warleine_faturamento_itens` (`loteId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_item_negocio_hash` ON `warleine_faturamento_itens` (`chaveNegocioHash`);--> statement-breakpoint
CREATE INDEX `idx_warleine_fat_lote_estab_status` ON `warleine_faturamento_lotes` (`estabelecimentoId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_warleine_quarentena_estab` ON `warleine_faturamento_quarentena` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_fatur_lote_status` ON `warleine_faturamento_staging` (`loteId`,`status`);
