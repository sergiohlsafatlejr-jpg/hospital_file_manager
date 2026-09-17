ALTER TABLE `permissoesEstabelecimento` ADD `grupoId` int;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelatoriosGlosasBi` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
UPDATE `permissoesEstabelecimento`
SET `acessoRelatoriosGlosasBi` = 'sim'
WHERE `acessoRelatoriosBi` = 'sim';
