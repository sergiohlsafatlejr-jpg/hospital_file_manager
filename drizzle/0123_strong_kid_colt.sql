CREATE TABLE `warleine_faturamento_snapshots_ativos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`competencia` varchar(7) NOT NULL,
	`loteId` int NOT NULL,
	`ativadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warleine_faturamento_snapshots_ativos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_warleine_snapshot_estab_comp` UNIQUE(`estabelecimentoId`,`competencia`)
);
--> statement-breakpoint
CREATE INDEX `idx_warleine_snapshot_lote` ON `warleine_faturamento_snapshots_ativos` (`loteId`);
--> statement-breakpoint
INSERT INTO `warleine_faturamento_snapshots_ativos` (`estabelecimentoId`,`competencia`,`loteId`)
SELECT `estabelecimentoId`,`competencia`,MAX(`loteId`)
FROM `warleine_faturamento_itens`
WHERE `ativoParaRelatorio`=1
GROUP BY `estabelecimentoId`,`competencia`
ON DUPLICATE KEY UPDATE `loteId`=VALUES(`loteId`),`ativadoEm`=NOW();
--> statement-breakpoint
CREATE OR REPLACE VIEW `warleine_faturamento_itens_ativos` AS
SELECT i.*
FROM `warleine_faturamento_itens` i
INNER JOIN `warleine_faturamento_snapshots_ativos` s
  ON s.`estabelecimentoId`=i.`estabelecimentoId`
 AND s.`competencia`=i.`competencia`
 AND s.`loteId`=i.`loteId`;
