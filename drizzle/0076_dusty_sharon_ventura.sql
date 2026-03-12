ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelFaturadoRecebido` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelRecebimentoGeral` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelFaturamento` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelAtendimentos` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelCustos` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelNaoRecebidos` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelPrevisaoGlosa` enum('sim','nao') DEFAULT 'nao' NOT NULL;