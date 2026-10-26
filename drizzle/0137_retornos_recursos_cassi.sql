CREATE TABLE `recursos_retornos_importacoes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`criado_por` int NOT NULL,
	`origem_recurso` enum('externo','portal') NOT NULL,
	`lote_portal_id` int,
	`nome_arquivo_xml` varchar(255) NOT NULL,
	`arquivo_hash` varchar(64) NOT NULL,
	`arquivo_storage_key` varchar(512) NOT NULL,
	`resposta_hash` varchar(64) NOT NULL,
	`conteudo_semantico_hash` varchar(64) NOT NULL,
	`formato` varchar(80) NOT NULL,
	`versao_tiss` varchar(32) NOT NULL,
	`registro_ans` varchar(32) NOT NULL,
	`codigo_prestador` varchar(80) NOT NULL,
	`numero_lote` varchar(100) NOT NULL,
	`protocolo_recurso` varchar(150) NOT NULL,
	`guia_recurso_prestador` varchar(100) NOT NULL,
	`guia_recurso_operadora` varchar(100) NOT NULL,
	`data_recurso` date NOT NULL,
	`data_resposta` date NOT NULL,
	`total_recursado_cabecalho` decimal(14,2),
	`total_acatado_cabecalho` decimal(14,2),
	`total_recursado_itens` decimal(14,2) NOT NULL,
	`total_acatado_itens` decimal(14,2) NOT NULL,
	`cabecalho_divergente` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`alertas` json,
	`nome_arquivo_pdf` varchar(255),
	`protocolo_pdf_hash` varchar(64),
	`protocolo_pdf_storage_key` varchar(512),
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recursos_retornos_importacoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rec_ret_imp_est_conv_arquivo_hash` UNIQUE(`estabelecimento_id`,`convenio_id`,`arquivo_hash`),
	CONSTRAINT `uq_rec_ret_imp_est_conv_resposta_hash` UNIQUE(`estabelecimento_id`,`convenio_id`,`resposta_hash`)
);
--> statement-breakpoint
CREATE TABLE `recursos_retornos_linhas` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`importacao_id` bigint NOT NULL,
	`posicao` int NOT NULL,
	`guia_prestador` varchar(100) NOT NULL,
	`guia_operadora` varchar(100) NOT NULL,
	`sequencial_item` varchar(50),
	`data_execucao` date,
	`codigo_tabela` varchar(20) NOT NULL,
	`codigo_item` varchar(80) NOT NULL,
	`codigo_glosa` varchar(80) NOT NULL,
	`valor_recursado` decimal(14,2) NOT NULL,
	`valor_acatado` decimal(14,2) NOT NULL,
	`justificativa_prestador` varchar(4000) NOT NULL,
	`justificativa_operadora` varchar(4000) NOT NULL,
	`referencias_normalizadas` json NOT NULL,
	`estado_sugestao` enum('sugerido','ambiguo','sem_vinculo','divergente') NOT NULL,
	`motivo_sugestao` varchar(2000) NOT NULL,
	`candidatos_snapshot` json NOT NULL,
	`demonstrativo_atual_id` int,
	`atualizado_em` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`criado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recursos_retornos_linhas_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rec_ret_linha_importacao_posicao` UNIQUE(`importacao_id`,`posicao`)
);
--> statement-breakpoint
CREATE TABLE `recursos_retornos_pagamentos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`importacao_id` bigint NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`tipo` enum('recebimento','estorno') NOT NULL,
	`pagamento_origem_id` bigint,
	`valor` decimal(14,2) NOT NULL,
	`data_evento` date NOT NULL,
	`referencia` varchar(150) NOT NULL,
	`observacao` varchar(2000) NOT NULL,
	`chave_operacao` varchar(36) NOT NULL,
	`payload_hash` varchar(64) NOT NULL,
	`registrado_por` int NOT NULL,
	`registrado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recursos_retornos_pagamentos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rec_ret_pag_escopo_operacao` UNIQUE(`estabelecimento_id`,`convenio_id`,`chave_operacao`),
	CONSTRAINT `uq_rec_ret_pag_importacao_tipo_referencia` UNIQUE(`importacao_id`,`tipo`,`referencia`),
	CONSTRAINT `uq_rec_ret_pag_estorno_origem` UNIQUE(`pagamento_origem_id`)
);
--> statement-breakpoint
CREATE TABLE `recursos_retornos_revisoes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`importacao_id` bigint NOT NULL,
	`linha_id` bigint,
	`tipo` enum('aprovacao','rebusca','conflito','anexo_protocolo') NOT NULL,
	`aprovado` enum('sim','nao'),
	`demonstrativo_id` int,
	`demonstrativo_chave` varchar(255),
	`arquivo_fonte_id` int,
	`arquivo_fonte_hash` varchar(64),
	`candidatos_snapshot` json,
	`justificativa` varchar(2000) NOT NULL,
	`conflito_hash` varchar(64),
	`revisado_por` int NOT NULL,
	`revisado_em` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recursos_retornos_revisoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rec_ret_rev_tipo_demo` UNIQUE(`tipo`,`demonstrativo_chave`),
	CONSTRAINT `uq_rec_ret_rev_conflito` UNIQUE(`importacao_id`,`tipo`,`conflito_hash`)
);
--> statement-breakpoint
ALTER TABLE `recursos_retornos_linhas` ADD CONSTRAINT `fk_rec_ret_linha_importacao` FOREIGN KEY (`importacao_id`) REFERENCES `recursos_retornos_importacoes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recursos_retornos_pagamentos` ADD CONSTRAINT `fk_rec_ret_pag_importacao` FOREIGN KEY (`importacao_id`) REFERENCES `recursos_retornos_importacoes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recursos_retornos_pagamentos` ADD CONSTRAINT `fk_rec_ret_pag_origem` FOREIGN KEY (`pagamento_origem_id`) REFERENCES `recursos_retornos_pagamentos`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recursos_retornos_revisoes` ADD CONSTRAINT `fk_rec_ret_rev_importacao` FOREIGN KEY (`importacao_id`) REFERENCES `recursos_retornos_importacoes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recursos_retornos_revisoes` ADD CONSTRAINT `fk_rec_ret_rev_linha` FOREIGN KEY (`linha_id`) REFERENCES `recursos_retornos_linhas`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_rec_ret_imp_escopo_data` ON `recursos_retornos_importacoes` (`estabelecimento_id`,`convenio_id`,`data_resposta`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_imp_lote_portal` ON `recursos_retornos_importacoes` (`lote_portal_id`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_linha_importacao` ON `recursos_retornos_linhas` (`importacao_id`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_linha_demo_atual` ON `recursos_retornos_linhas` (`demonstrativo_atual_id`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_pag_importacao` ON `recursos_retornos_pagamentos` (`importacao_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_rev_importacao` ON `recursos_retornos_revisoes` (`importacao_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_rec_ret_rev_linha` ON `recursos_retornos_revisoes` (`linha_id`,`id`);