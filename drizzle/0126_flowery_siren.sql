CREATE TABLE `warleine_faturamento_analises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`competencia` varchar(7) NOT NULL,
	`numeroConta` varchar(100) NOT NULL,
	`convenioChave` varchar(255) NOT NULL,
	`loteId` int NOT NULL,
	`statusAnalise` varchar(20) NOT NULL DEFAULT 'pendente',
	`totalItensAnalisados` int NOT NULL DEFAULT 0,
	`totalDivergencias` int NOT NULL DEFAULT 0,
	`totalAlertas` int NOT NULL DEFAULT 0,
	`totalCriticos` int NOT NULL DEFAULT 0,
	`scoreRisco` int NOT NULL DEFAULT 0,
	`resumoPorTipo` json,
	`detalhesRisco` json,
	`divergencias` json,
	`padroesDetalhados` json,
	`analisadoPor` int,
	`analisadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warleine_faturamento_analises_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_warleine_analise_conta_lote` UNIQUE(`estabelecimentoId`,`competencia`,`numeroConta`,`convenioChave`,`loteId`)
);
--> statement-breakpoint
CREATE INDEX `idx_warleine_analise_estab_status` ON `warleine_faturamento_analises` (`estabelecimentoId`,`statusAnalise`);