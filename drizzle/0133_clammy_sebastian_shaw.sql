ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `aihguia` varchar(50);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `quantidade` decimal(15,4);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_faturado` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_recebido` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_receb_a_maior` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_total_recebido` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_aberto` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_glosas` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `gl_recurso` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `gl_aceita` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `gl_analise` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `gl_recuperada` decimal(15,2);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `vl_unitario` decimal(15,4);--> statement-breakpoint
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `estabelecimentos_id` varchar(100);--> statement-breakpoint
-- A 0131 já declarava TEXT, mas a tabela foi recriada pelo Hop como LONGTEXT.
-- Regularização física do campo solicitado; não altera o schema Drizzle.
ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `complrecur` text;
