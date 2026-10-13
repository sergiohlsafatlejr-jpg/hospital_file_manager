CREATE TABLE `banco_conciliacao_membros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int NOT NULL,
	`vinculoId` int NOT NULL,
	`faturadoItemId` int NOT NULL,
	CONSTRAINT `banco_conciliacao_membros_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_banco_membro_item` UNIQUE(`estabelecimentoId`,`faturadoItemId`)
);
--> statement-breakpoint
CREATE TABLE `banco_conciliacao_vinculos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int NOT NULL,
	`loteFaturadoId` int NOT NULL,
	`grupoFingerprint` char(64) NOT NULL,
	`totalItens` int NOT NULL,
	`quantidadeFaturada` decimal(20,4) NOT NULL,
	`valorFaturadoGrupo` decimal(20,4) NOT NULL,
	`demonstrativoId` int NOT NULL,
	`demonstrativoArquivoId` int NOT NULL,
	`eventoFingerprint` char(64) NOT NULL,
	`codigoPrestador` varchar(100) NOT NULL,
	`loteRetorno` varchar(100) NOT NULL,
	`protocoloRetorno` varchar(100) NOT NULL,
	`dataPagamento` char(10),
	`valorPago` decimal(20,4) NOT NULL,
	`valorGlosa` decimal(20,4) NOT NULL,
	`codigoGlosa` varchar(20),
	`diferenca` decimal(20,4) NOT NULL,
	`metodo` varchar(32) NOT NULL,
	`confirmadoPor` int NOT NULL,
	`confirmadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banco_conciliacao_vinculos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_banco_vinculo_grupo` UNIQUE(`estabelecimentoId`,`loteFaturadoId`,`grupoFingerprint`),
	CONSTRAINT `uq_banco_vinculo_evento` UNIQUE(`estabelecimentoId`,`demonstrativoId`)
);
--> statement-breakpoint
CREATE TABLE `banco_faturado_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int NOT NULL,
	`competencia` varchar(7) NOT NULL,
	`origemRegistroId` varchar(191) NOT NULL,
	`fonteItemId` int NOT NULL,
	`conta` varchar(100) NOT NULL,
	`guiaPrestador` varchar(100) NOT NULL,
	`guiaOperadora` varchar(100),
	`codigoTuss` varchar(100) NOT NULL,
	`dataItem` char(10) NOT NULL,
	`tipoItem` varchar(50),
	`setor` varchar(255),
	`receber` char(1) NOT NULL,
	`descricaoItem` text,
	`pacienteNome` varchar(255),
	`quantidade` decimal(20,4) NOT NULL,
	`valorFaturado` decimal(20,4) NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banco_faturado_itens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_banco_fat_item_origem` UNIQUE(`loteId`,`origemRegistroId`)
);
--> statement-breakpoint
CREATE TABLE `banco_faturado_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int NOT NULL,
	`competencia` varchar(7) NOT NULL,
	`origem` varchar(32) NOT NULL,
	`fonteFingerprint` char(64) NOT NULL,
	`totalItens` int NOT NULL,
	`criadoPor` int NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banco_faturado_lotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_banco_fat_lote_fonte` UNIQUE(`estabelecimentoId`,`convenioId`,`competencia`,`origem`,`fonteFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `banco_xml_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int NOT NULL,
	`codigoPrestador` varchar(100) NOT NULL,
	`loteRetorno` varchar(100) NOT NULL,
	`protocoloRetorno` varchar(100) NOT NULL,
	`tipoTransacao` varchar(50) NOT NULL,
	`versaoTiss` varchar(20) NOT NULL,
	`vinculosIds` json NOT NULL,
	`totalGuias` int NOT NULL,
	`totalItens` int NOT NULL,
	`chavePrivadaArquivo` varchar(500) NOT NULL,
	`conteudoFingerprint` char(64) NOT NULL,
	`validadoXsdEm` timestamp NOT NULL,
	`geradoPor` int NOT NULL,
	`geradoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banco_xml_lotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_banco_membro_vinculo` ON `banco_conciliacao_membros` (`estabelecimentoId`,`vinculoId`);--> statement-breakpoint
CREATE INDEX `idx_banco_vinculo_recorte` ON `banco_conciliacao_vinculos` (`estabelecimentoId`,`convenioId`);--> statement-breakpoint
CREATE INDEX `idx_banco_fat_item_lote` ON `banco_faturado_itens` (`estabelecimentoId`,`convenioId`,`loteId`);--> statement-breakpoint
CREATE INDEX `idx_banco_fat_lote_recorte` ON `banco_faturado_lotes` (`estabelecimentoId`,`convenioId`,`competencia`);--> statement-breakpoint
CREATE INDEX `idx_banco_xml_lote_recorte` ON `banco_xml_lotes` (`estabelecimentoId`,`convenioId`,`protocoloRetorno`);