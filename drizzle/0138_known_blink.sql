CREATE TABLE `conta_contexto_medico_contextos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`arquivo_hospital_id` int NOT NULL,
	`numero_conta` varchar(100) NOT NULL,
	`numero_lote` varchar(100) NOT NULL DEFAULT '',
	`competencia` varchar(20) NOT NULL DEFAULT '',
	`padrao_id` int,
	`nome_padrao` varchar(255),
	`status` enum('confirmado','invalidado','revisao_necessaria') NOT NULL DEFAULT 'revisao_necessaria',
	`revisao` int NOT NULL DEFAULT 0,
	`confirmado_em` timestamp,
	`confirmado_por` int,
	`justificativa` varchar(1000) NOT NULL,
	`versao_padrao` varchar(64),
	`fontes_versoes_json` json NOT NULL,
	`versao_itens_hospitalares` varchar(64) NOT NULL,
	`principais_snapshot_json` json NOT NULL,
	`abrangencia` enum('conta_inteira_sem_setor','conta_inteira') NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	`atualizado_em` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conta_contexto_medico_contextos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ccm_contexto_scope` UNIQUE(`estabelecimento_id`,`convenio_id`,`arquivo_hospital_id`,`numero_conta`,`numero_lote`,`competencia`)
);
--> statement-breakpoint
CREATE TABLE `conta_contexto_medico_eventos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contexto_id` int NOT NULL,
	`revisao` int NOT NULL,
	`tipo` enum('confirmado','invalidado','revisao_necessaria') NOT NULL,
	`usuario_id` int,
	`justificativa` varchar(1000) NOT NULL,
	`padrao_id` int,
	`versao_padrao` varchar(64),
	`evidencia_json` json NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conta_contexto_medico_eventos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ccm_evento_contexto_revisao` UNIQUE(`contexto_id`,`revisao`)
);
--> statement-breakpoint
CREATE TABLE `conta_contexto_medico_fontes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`arquivo_hospital_id` int NOT NULL,
	`arquivo_medico_id` int NOT NULL,
	`numero_conta` varchar(100) NOT NULL,
	`numero_lote` varchar(100) NOT NULL DEFAULT '',
	`competencia` varchar(20) NOT NULL DEFAULT '',
	`guia_referencia` varchar(100) NOT NULL,
	`versao_semantica` varchar(64) NOT NULL,
	`registros` int NOT NULL,
	`codigos_distintos` int NOT NULL,
	`procedimentos_json` json NOT NULL,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conta_contexto_medico_fontes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ccm_fonte_scope_arquivo_guia_versao` UNIQUE(`estabelecimento_id`,`convenio_id`,`arquivo_hospital_id`,`numero_conta`,`numero_lote`,`competencia`,`arquivo_medico_id`,`guia_referencia`,`versao_semantica`)
);
--> statement-breakpoint
CREATE INDEX `idx_ccm_contexto_padrao` ON `conta_contexto_medico_contextos` (`padrao_id`);--> statement-breakpoint
CREATE INDEX `idx_ccm_evento_contexto` ON `conta_contexto_medico_eventos` (`contexto_id`,`criado_em`);--> statement-breakpoint
CREATE INDEX `idx_ccm_fonte_scope` ON `conta_contexto_medico_fontes` (`estabelecimento_id`,`convenio_id`,`arquivo_hospital_id`,`numero_conta`,`numero_lote`,`competencia`);--> statement-breakpoint
CREATE INDEX `idx_ccm_fonte_arquivo_medico` ON `conta_contexto_medico_fontes` (`arquivo_medico_id`);