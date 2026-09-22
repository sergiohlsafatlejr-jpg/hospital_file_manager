UPDATE `warleine_faturamento_itens` i
INNER JOIN `warleine_faturamento_lotes` l ON l.id=i.loteId AND l.estabelecimentoId=i.estabelecimentoId
SET i.origemRegistroId=CONCAT(l.arquivoHash, ':', i.numeroLinha)
WHERE i.origemRegistroId IS NULL OR i.origemRegistroId='';--> statement-breakpoint
ALTER TABLE `warleine_faturamento_itens` MODIFY COLUMN `origemRegistroId` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `warleine_faturamento_itens` ADD CONSTRAINT `uq_warleine_item_estab_origem` UNIQUE(`estabelecimentoId`,`origemRegistroId`);
