CREATE TABLE `credenciais_portais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`convenioId` int NOT NULL,
	`estabelecimentoId` int,
	`login` varchar(255) NOT NULL,
	`senha` text NOT NULL,
	`urlLogin` varchar(255),
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`ultimoAcesso` timestamp,
	`statusAcesso` enum('sucesso','erro','pendente') DEFAULT 'pendente',
	`mensagemErro` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credenciais_portais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `credenciais_portais` ADD CONSTRAINT `credenciais_portais_convenioId_convenios_id_fk` FOREIGN KEY (`convenioId`) REFERENCES `convenios`(`id`) ON DELETE cascade ON UPDATE no action;