ALTER TABLE `faturamento_tiss` ADD `codigo_prestador_executante` varchar(50);--> statement-breakpoint
ALTER TABLE `conciliados_automatico` ADD `dataExecucao` timestamp;--> statement-breakpoint
ALTER TABLE `conciliados_automatico` ADD `codigoPrestadorExecutante` varchar(50);--> statement-breakpoint
ALTER TABLE `faturamento_unificado` ADD `codigoPrestadorExecutante` varchar(50);