CREATE TABLE `xml_importacao_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lote_id` int NOT NULL,
	`ordem` int NOT NULL,
	`arquivo_id` int NOT NULL,
	`nome_arquivo` varchar(255) NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`tamanho_bytes` int NOT NULL,
	`tipo_classificado` enum('pendente','hospitalar','honorarios','misto_ou_ambiguo','invalido') NOT NULL DEFAULT 'pendente',
	`versao_classificador` varchar(40),
	`classificado_em` timestamp,
	`estado` enum('recebido','classificado','hospitalar_persistido','conta_materializada','honorario_indexado','bloqueado','erro','concluido') NOT NULL DEFAULT 'recebido',
	`fase` enum('persistir_selecao','classificar','processar_hospitalares','materializar_contas','processar_honorarios','finalizar') NOT NULL DEFAULT 'persistir_selecao',
	`tentativas` int NOT NULL DEFAULT 0,
	`erro_codigo` varchar(80),
	`erro_resumo` varchar(1000),
	`total_itens` int NOT NULL DEFAULT 0,
	`total_guias` int NOT NULL DEFAULT 0,
	`resultado_resumo_json` json,
	`processado_em` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `xml_importacao_itens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_xml_imp_item_lote_ordem` UNIQUE(`lote_id`,`ordem`),
	CONSTRAINT `uq_xml_imp_item_lote_hash` UNIQUE(`lote_id`,`sha256`)
);
--> statement-breakpoint
CREATE TABLE `xml_importacao_lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`criado_por` int NOT NULL,
	`idempotency_key` varchar(64) NOT NULL,
	`manifest_hash` varchar(64) NOT NULL,
	`versao_fluxo` varchar(40) NOT NULL DEFAULT 'v1',
	`reimportacao_de_lote_id` int,
	`estado` enum('recebendo','enfileirado','processando','concluido','concluido_com_erros','falhou','cancelado','substituido') NOT NULL DEFAULT 'recebendo',
	`fase` enum('persistir_selecao','classificar','processar_hospitalares','materializar_contas','processar_honorarios','finalizar') NOT NULL DEFAULT 'persistir_selecao',
	`tentativas` int NOT NULL DEFAULT 0,
	`proxima_tentativa_em` timestamp,
	`erro_codigo` varchar(80),
	`erro_resumo` varchar(1000),
	`claim_token` varchar(64),
	`claimed_by` varchar(255),
	`lease_expires_at` timestamp,
	`heartbeat_em` timestamp,
	`total_arquivos` int NOT NULL DEFAULT 0,
	`total_hospitalares` int NOT NULL DEFAULT 0,
	`total_honorarios` int NOT NULL DEFAULT 0,
	`total_bloqueados` int NOT NULL DEFAULT 0,
	`total_erros` int NOT NULL DEFAULT 0,
	`iniciado_em` timestamp,
	`concluido_em` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `xml_importacao_lotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_xml_imp_lote_escopo_idempotencia` UNIQUE(`estabelecimento_id`,`convenio_id`,`criado_por`,`idempotency_key`),
	CONSTRAINT `uq_xml_imp_lote_escopo_manifesto` UNIQUE(`estabelecimento_id`,`convenio_id`,`criado_por`,`manifest_hash`)
);
--> statement-breakpoint
ALTER TABLE `contas_convenio_itens` ADD `loteImportacaoId` int;--> statement-breakpoint
ALTER TABLE `contas_convenio_resumo` ADD `arquivoHospitalId` int;--> statement-breakpoint
ALTER TABLE `contas_convenio_resumo` ADD `loteImportacaoId` int;--> statement-breakpoint
ALTER TABLE `conta_contexto_medico_fontes` ADD `lote_importacao_id` int;--> statement-breakpoint
ALTER TABLE `conta_contexto_medico_fontes` ADD `versao_snapshot_hospitalar` varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `contas_convenio_resumo` ADD CONSTRAINT `uq_ccr_xml_snapshot_scope` UNIQUE(`origem`,`estabelecimentoId`,`convenioId`,`arquivoHospitalId`,`numeroConta`,`numeroLote`,`competencia`);--> statement-breakpoint
CREATE INDEX `idx_xml_imp_item_lote_tipo_estado` ON `xml_importacao_itens` (`lote_id`,`tipo_classificado`,`estado`,`ordem`);--> statement-breakpoint
CREATE INDEX `idx_xml_imp_item_arquivo` ON `xml_importacao_itens` (`arquivo_id`);--> statement-breakpoint
CREATE INDEX `idx_xml_imp_lote_claim` ON `xml_importacao_lotes` (`estado`,`proxima_tentativa_em`,`lease_expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_xml_imp_lote_escopo_historico` ON `xml_importacao_lotes` (`estabelecimento_id`,`convenio_id`,`criado_por`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_cci_xml_snapshot_scope` ON `contas_convenio_itens` (`origem`,`estabelecimentoId`,`convenioId`,`arquivoId`,`numeroConta`,`numeroLote`,`competencia`);--> statement-breakpoint
CREATE INDEX `idx_ccm_fonte_lote_importacao` ON `conta_contexto_medico_fontes` (`lote_importacao_id`);