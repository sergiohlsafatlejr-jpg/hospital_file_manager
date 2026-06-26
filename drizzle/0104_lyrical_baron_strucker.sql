CREATE TABLE `glosas_aceite_automatico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo_glosa` varchar(20) NOT NULL,
	`descricao_glosa` text,
	`convenio_id` int,
	`estabelecimento_id` int,
	`motivo_aceite` text,
	`criado_por` int,
	`criado_por_nome` varchar(255),
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `glosas_aceite_automatico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_aceite_auto_codigo` ON `glosas_aceite_automatico` (`codigo_glosa`);--> statement-breakpoint
CREATE INDEX `idx_aceite_auto_convenio` ON `glosas_aceite_automatico` (`convenio_id`);--> statement-breakpoint
CREATE INDEX `idx_aceite_auto_estab` ON `glosas_aceite_automatico` (`estabelecimento_id`);