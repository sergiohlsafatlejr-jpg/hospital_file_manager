CREATE TABLE `guias_faturamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`paciente_id` int,
	`tipo_guia` enum('sadt','internacao') NOT NULL,
	`numero_guia_prestador` varchar(50),
	`numero_guia_operadora` varchar(50),
	`senha` varchar(50),
	`carteirinha` varchar(100),
	`nome_paciente` varchar(255) NOT NULL,
	`data_atendimento` varchar(10),
	`data_inicio` varchar(10),
	`data_fim` varchar(10),
	`nome_solicitante` varchar(255),
	`conselho_prof_solicitante` varchar(20),
	`numero_conselho_prof_solicitante` varchar(20),
	`uf_conselho_prof_solicitante` varchar(2),
	`cbos_conselho_prof_solicitante` varchar(10),
	`nome_executante` varchar(255),
	`conselho_prof_executante` varchar(20),
	`numero_conselho_prof_executante` varchar(20),
	`uf_conselho_prof_executante` varchar(2),
	`cbos_conselho_prof_executante` varchar(10),
	`carater_atendimento` enum('eletivo','urgencia') DEFAULT 'eletivo',
	`tipo_internacao` varchar(2),
	`regime_internacao` varchar(2),
	`cid10_principal` varchar(10),
	`cid10_secundario` varchar(10),
	`indicacao_clinica` text,
	`valor_total` decimal(12,2) DEFAULT '0',
	`status` enum('rascunho','finalizada','em_lote','enviada') NOT NULL DEFAULT 'rascunho',
	`lote_id` int,
	`observacoes` text,
	`tipo_servico` varchar(50),
	`criado_por` int,
	`criado_por_nome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guias_faturamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `itens_guia_faturamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`guia_id` int NOT NULL,
	`sequencial` int NOT NULL DEFAULT 1,
	`tipo_item` enum('procedimento','material','medicamento','taxa','diaria','opme','gases') NOT NULL,
	`codigo_tabela` varchar(5),
	`codigo_procedimento` varchar(20) NOT NULL,
	`descricao` varchar(500) NOT NULL,
	`data_execucao` varchar(10),
	`hora_inicio` varchar(5),
	`hora_fim` varchar(5),
	`quantidade` decimal(10,2) NOT NULL DEFAULT '1',
	`valor_unitario` decimal(12,4) NOT NULL DEFAULT '0',
	`valor_total` decimal(12,2) NOT NULL DEFAULT '0',
	`fator_reducao` decimal(5,2) DEFAULT '1',
	`via_acesso` varchar(5),
	`tecnica` varchar(5),
	`grau_participacao` varchar(5),
	`registro_anvisa` varchar(30),
	`codigo_ref_fabricante` varchar(50),
	`autorizacao_funcionamento` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `itens_guia_faturamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotes_faturamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`convenio_id` int NOT NULL,
	`numero_lote` varchar(50) NOT NULL,
	`tipo_atendimento` enum('consultas','exames','internacao') NOT NULL DEFAULT 'exames',
	`data_faturamento` varchar(10),
	`competencia` varchar(7),
	`nf` varchar(50),
	`protocolo_entrega` varchar(100),
	`valor_total` decimal(14,2) DEFAULT '0',
	`total_guias` int DEFAULT 0,
	`status` enum('aberto','fechado','enviado') NOT NULL DEFAULT 'aberto',
	`formato_exportacao` enum('xml_tiss','excel_unimed'),
	`xml_url` text,
	`xml_key` varchar(512),
	`excel_url` text,
	`excel_key` varchar(512),
	`data_envio` timestamp,
	`criado_por` int,
	`criado_por_nome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lotes_faturamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pacientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int,
	`nome` varchar(255) NOT NULL,
	`carteirinha` varchar(100),
	`cpf` varchar(14),
	`data_nascimento` varchar(10),
	`sexo` enum('M','F','I'),
	`convenio_id` int,
	`telefone` varchar(20),
	`email` varchar(255),
	`endereco` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pacientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_guias_fat_estab` ON `guias_faturamento` (`estabelecimento_id`);--> statement-breakpoint
CREATE INDEX `idx_guias_fat_convenio` ON `guias_faturamento` (`convenio_id`);--> statement-breakpoint
CREATE INDEX `idx_guias_fat_status` ON `guias_faturamento` (`status`);--> statement-breakpoint
CREATE INDEX `idx_guias_fat_paciente` ON `guias_faturamento` (`paciente_id`);--> statement-breakpoint
CREATE INDEX `idx_guias_fat_lote` ON `guias_faturamento` (`lote_id`);--> statement-breakpoint
CREATE INDEX `idx_itens_guia_fat_guia` ON `itens_guia_faturamento` (`guia_id`);--> statement-breakpoint
CREATE INDEX `idx_lotes_fat_estab` ON `lotes_faturamento` (`estabelecimento_id`);--> statement-breakpoint
CREATE INDEX `idx_lotes_fat_convenio` ON `lotes_faturamento` (`convenio_id`);--> statement-breakpoint
CREATE INDEX `idx_lotes_fat_status` ON `lotes_faturamento` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pacientes_nome` ON `pacientes` (`nome`);--> statement-breakpoint
CREATE INDEX `idx_pacientes_carteirinha` ON `pacientes` (`carteirinha`);--> statement-breakpoint
CREATE INDEX `idx_pacientes_convenio` ON `pacientes` (`convenio_id`);