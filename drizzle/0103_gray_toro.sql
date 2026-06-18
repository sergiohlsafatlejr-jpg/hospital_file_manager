ALTER TABLE `arquivos` MODIFY COLUMN `tipoArquivo` enum('xml','excel','pdf','csv','txt') NOT NULL;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `origem_dado` enum('xml','excel','txt') NOT NULL;--> statement-breakpoint
ALTER TABLE `retorno_tiss_unificado` MODIFY COLUMN `origem_dado` enum('xml','excel','txt') NOT NULL;