CREATE TABLE `atendimentos_parados_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(255) NOT NULL,
	`loteRef` varchar(50) NOT NULL,
	`hashConteudo` varchar(64),
	`statusValidacao` varchar(20) NOT NULL DEFAULT 'valido',
	`motivoRejeicao` text,
	`numeroAtendimento` varchar(100) NOT NULL,
	`paciente` varchar(255),
	`convenio` varchar(255),
	`matricula` varchar(100),
	`conta` varchar(50),
	`autorizacao` varchar(100),
	`dataEntrada` timestamp,
	`dataSaida` timestamp,
	`dataEtapa` timestamp,
	`tipoAtendimento` varchar(50),
	`descricaoAtendimento` varchar(255),
	`codigoServico` varchar(100),
	`codigoProcedimento` varchar(500),
	`setorEntrada` varchar(255),
	`etapaConta` varchar(255),
	`setorEtapa` varchar(255),
	`usuarioEtapa` varchar(100),
	`competencia` varchar(20),
	`protocolo` varchar(255),
	`titulo` varchar(100),
	`medicoResponsavel` varchar(255),
	`valorConta` decimal(15,2),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	`atualizadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `atendimentos_parados_staging_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_estab_origem_id` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);
--> statement-breakpoint
CREATE INDEX `idx_atend_parados_estab_origem` ON `atendimentos_parados_staging` (`estabelecimentoId`,`origemSistema`);--> statement-breakpoint
CREATE INDEX `idx_atend_parados_lote` ON `atendimentos_parados_staging` (`estabelecimentoId`,`origemSistema`,`loteRef`);--> statement-breakpoint
CREATE INDEX `idx_atend_parados_numatend` ON `atendimentos_parados_staging` (`numeroAtendimento`);--> statement-breakpoint
CREATE INDEX `idx_atend_parados_origem_id` ON `atendimentos_parados_staging` (`origemId`);--> statement-breakpoint
CREATE INDEX `idx_atend_parados_status` ON `atendimentos_parados_staging` (`statusValidacao`);