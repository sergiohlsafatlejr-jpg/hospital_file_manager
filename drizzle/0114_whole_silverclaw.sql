ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelPrevisaoPagamentosImec` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelLaboratorio` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelUltrassom` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelVisitaHospitalar` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelVisitasFaturadasXml` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelOxUti` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelOxUtiFaturado` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelResumoPacienteOxUti` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelFisioterapia` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelComparativoMesAMes` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
UPDATE `permissoesEstabelecimento`
SET
  `acessoRelPrevisaoPagamentosImec` = `acessoRelFaturadoRecebido`,
  `acessoRelLaboratorio` = `acessoRelFaturadoRecebido`,
  `acessoRelUltrassom` = `acessoRelFaturadoRecebido`,
  `acessoRelVisitaHospitalar` = `acessoRelFaturadoRecebido`,
  `acessoRelVisitasFaturadasXml` = `acessoRelFaturadoRecebido`,
  `acessoRelOxUti` = `acessoRelFaturadoRecebido`,
  `acessoRelOxUtiFaturado` = `acessoRelFaturadoRecebido`,
  `acessoRelResumoPacienteOxUti` = `acessoRelFaturadoRecebido`,
  `acessoRelFisioterapia` = `acessoRelFaturadoRecebido`,
  `acessoRelComparativoMesAMes` = `acessoRelFaturadoRecebido`;--> statement-breakpoint
UPDATE `permissoesEstabelecimento`
SET `acessoRelatoriosBi` = 'sim'
WHERE `acessoRelFaturadoRecebido` = 'sim'
   OR `acessoRelPrevisaoPagamentosImec` = 'sim'
   OR `acessoRelLaboratorio` = 'sim'
   OR `acessoRelUltrassom` = 'sim'
   OR `acessoRelVisitaHospitalar` = 'sim'
   OR `acessoRelVisitasFaturadasXml` = 'sim'
   OR `acessoRelOxUti` = 'sim'
   OR `acessoRelOxUtiFaturado` = 'sim'
   OR `acessoRelResumoPacienteOxUti` = 'sim'
   OR `acessoRelFisioterapia` = 'sim'
   OR `acessoRelComparativoMesAMes` = 'sim';
