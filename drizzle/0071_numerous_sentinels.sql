ALTER TABLE `ajustes_auditoria` MODIFY COLUMN `tipoAjuste` enum('ALTERAR_QUANTIDADE','ALTERAR_VALOR','ADICIONAR_ITEM','REMOVER_ITEM','ALTERAR_SETOR') NOT NULL;--> statement-breakpoint
ALTER TABLE `ajustes_auditoria` ADD `setorOriginal` varchar(255);--> statement-breakpoint
ALTER TABLE `ajustes_auditoria` ADD `setorAjustado` varchar(255);