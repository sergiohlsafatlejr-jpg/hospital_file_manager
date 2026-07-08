ALTER TABLE `itens_guia_faturamento` MODIFY COLUMN `hora_inicio` varchar(8);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` MODIFY COLUMN `hora_fim` varchar(8);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` MODIFY COLUMN `quantidade` decimal(10,4) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `convenios` ADD `registro_ans` varchar(10);--> statement-breakpoint
ALTER TABLE `estabelecimentos` ADD `cnes` varchar(7);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `numero_guia_solicitacao_internacao` varchar(50);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `atendimento_rn` enum('S','N') DEFAULT 'N';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `tipo_faturamento` varchar(2);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `hora_inicio_faturamento` varchar(8);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `hora_final_faturamento` varchar(8);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `indicador_acidente` varchar(2);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `motivo_encerramento` varchar(2);--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_procedimentos` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_diarias` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_taxas_alugueis` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_materiais` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_medicamentos` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_opme` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `guias_faturamento` ADD `valor_gases_medicinais` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `tipo_lancamento` enum('procedimento','despesa') DEFAULT 'despesa';--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `codigo_despesa` varchar(2);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `unidade_medida` varchar(3);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `codigo_profissional_operadora` varchar(50);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `nome_profissional` varchar(255);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `conselho_profissional` varchar(5);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `numero_conselho_profissional` varchar(20);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `uf_profissional` varchar(2);--> statement-breakpoint
ALTER TABLE `itens_guia_faturamento` ADD `cbos_profissional` varchar(10);