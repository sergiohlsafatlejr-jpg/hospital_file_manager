CREATE TABLE `prontuario_pdf_anexo_eventos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`anexo_id` bigint NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`arquivo_hospital_id` int NOT NULL,
	`numero_conta` varchar(100) NOT NULL,
	`numero_lote` varchar(100) NOT NULL,
	`competencia` varchar(20) NOT NULL,
	`tipo` enum('upload','download','inativacao') NOT NULL,
	`usuario_id` int NOT NULL,
	`resultado` enum('sucesso','falha') NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prontuario_pdf_anexo_eventos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prontuario_pdf_anexos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`arquivo_hospital_id` int NOT NULL,
	`numero_conta` varchar(100) NOT NULL,
	`numero_lote` varchar(100) NOT NULL,
	`competencia` varchar(20) NOT NULL,
	`tipo` enum('prontuario_pdf') NOT NULL,
	`nome_arquivo` varchar(255) NOT NULL,
	`tamanho_bytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`criado_por` int NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	`inativado_por` int,
	`inativado_em` timestamp,
	CONSTRAINT `prontuario_pdf_anexos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pront_pdf_evento_anexo` ON `prontuario_pdf_anexo_eventos` (`anexo_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_pront_pdf_evento_escopo` ON `prontuario_pdf_anexo_eventos` (`estabelecimento_id`,`convenio_id`,`arquivo_hospital_id`,`numero_conta`,`numero_lote`,`competencia`,`id`);--> statement-breakpoint
CREATE INDEX `idx_pront_pdf_escopo_ativo` ON `prontuario_pdf_anexos` (`estabelecimento_id`,`convenio_id`,`arquivo_hospital_id`,`numero_conta`,`numero_lote`,`competencia`,`ativo`,`id`);--> statement-breakpoint
CREATE INDEX `idx_pront_pdf_arquivo_hospitalar` ON `prontuario_pdf_anexos` (`arquivo_hospital_id`);