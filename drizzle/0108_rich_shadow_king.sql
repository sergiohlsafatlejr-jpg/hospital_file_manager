ALTER TABLE `faturamento_externo` ADD `codigo_prestador` varchar(50);--> statement-breakpoint
ALTER TABLE `faturamento_externo` ADD `valor_glosado` decimal(14,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `faturamento_externo` ADD `origem` varchar(20) DEFAULT 'excel' NOT NULL;--> statement-breakpoint
ALTER TABLE `faturamento_externo` ADD `observacao` text;--> statement-breakpoint
ALTER TABLE `faturamento_externo` ADD `atualizado_por` int;--> statement-breakpoint
ALTER TABLE `faturamento_externo` ADD `atualizado_por_nome` varchar(255);
