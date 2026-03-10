CREATE TABLE `relatorio_atendimentos_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`numatend` varchar(100) NOT NULL,
	`tipo_atendimento` varchar(100),
	`codserv` varchar(50),
	`servico` varchar(255),
	`codplaco` varchar(50),
	`plano_convenio` varchar(255),
	`codproven` varchar(50),
	`proveniente` varchar(255),
	`data_atendimento` timestamp,
	`data_saida` timestamp,
	`censo` varchar(100),
	`codcc` varchar(50),
	`centro_custo` varchar(255),
	`codprest` varchar(50),
	`prestador` varchar(255),
	`procprin` varchar(100),
	`procedimento_principal` varchar(500),
	`cidprin` varchar(20),
	`diagnostico_cid` varchar(500),
	`carater_atendimento` varchar(100),
	`codpac` varchar(50),
	`paciente` varchar(255),
	`data_sincronizacao` timestamp DEFAULT (now()),
	CONSTRAINT `relatorio_atendimentos_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relatorio_atendimentos_sync_meta` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pendente',
	`ultima_sincronizacao` timestamp,
	`data_inicio_sync` varchar(20),
	`data_fim_sync` varchar(20),
	`total_registros` int DEFAULT 0,
	`duracao_segundos` int DEFAULT 0,
	`mensagem_erro` text,
	`executado_por` int,
	`executado_por_nome` varchar(255),
	`criado_em` timestamp DEFAULT (now()),
	`atualizado_em` timestamp DEFAULT (now()),
	CONSTRAINT `relatorio_atendimentos_sync_meta_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_rel_sync_meta_estab` UNIQUE(`estabelecimentoId`)
);
--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_estab` ON `relatorio_atendimentos_cache` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_numatend` ON `relatorio_atendimentos_cache` (`numatend`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_data` ON `relatorio_atendimentos_cache` (`data_atendimento`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_codserv` ON `relatorio_atendimentos_cache` (`codserv`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_codplaco` ON `relatorio_atendimentos_cache` (`codplaco`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_codprest` ON `relatorio_atendimentos_cache` (`codprest`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_codcc` ON `relatorio_atendimentos_cache` (`codcc`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_tipo` ON `relatorio_atendimentos_cache` (`tipo_atendimento`);--> statement-breakpoint
CREATE INDEX `idx_rel_atend_cache_estab_data` ON `relatorio_atendimentos_cache` (`estabelecimentoId`,`data_atendimento`);