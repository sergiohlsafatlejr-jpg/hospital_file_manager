CREATE TABLE `contratos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int,
	`contratanteNome` varchar(255) NOT NULL,
	`contratanteCnpj` varchar(20),
	`contratadaNome` varchar(255),
	`contratadaCnpj` varchar(20),
	`servicos` json,
	`modelosCobranca` json,
	`valorMensal` decimal(15,2),
	`valorHora` decimal(15,2),
	`valorPercentualConvenio` decimal(5,2),
	`prazoContrato` int,
	`dataInicio` date,
	`dataFim` date,
	`status` enum('rascunho','ativo','suspenso','encerrado','renovacao') NOT NULL DEFAULT 'rascunho',
	`dadosCompletos` json,
	`docxUrl` text,
	`docxKey` varchar(512),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contratos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contratos_historico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contratoId` int NOT NULL,
	`tipo` enum('criacao','alteracao','reajuste','renovacao','suspensao','encerramento') NOT NULL,
	`descricao` text,
	`valorAnterior` decimal(15,2),
	`valorNovo` decimal(15,2),
	`indiceReajuste` varchar(50),
	`percentualReajuste` decimal(5,2),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contratos_historico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_bancos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cor` varchar(20) DEFAULT '#3b82f6',
	`saldoInicial` decimal(15,2) DEFAULT '0',
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_bancos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_categorias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_categorias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresaId` int,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`email` varchar(320),
	`telefone` varchar(20),
	`valorContrato` decimal(15,2),
	`cep` varchar(10),
	`endereco` text,
	`cidade` varchar(100),
	`uf` varchar(2),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_clientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_custos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoriaId` int,
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(15,2) NOT NULL DEFAULT '0',
	`tipo` enum('fixo','variavel') NOT NULL DEFAULT 'fixo',
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_custos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_empresas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_empresas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_extratos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bancoId` int NOT NULL,
	`data` date NOT NULL,
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(15,2) NOT NULL DEFAULT '0',
	`tipo` enum('credito','debito') NOT NULL,
	`conciliado` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`transacaoId` int,
	`recebivelId` int,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_extratos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_previsao_receita` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresaId` int,
	`dataPrevisao` date NOT NULL,
	`valorPrevisto` decimal(15,2) NOT NULL DEFAULT '0',
	`valorRealizado` decimal(15,2),
	`descricao` varchar(500),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_previsao_receita_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_recebiveis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresaId` int,
	`clienteId` int,
	`tipoId` int,
	`bancoId` int,
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(15,2) NOT NULL DEFAULT '0',
	`dataVencimento` date NOT NULL,
	`dataRecebimento` date,
	`recebido` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`observacoes` text,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_recebiveis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_tipos_pagamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`categoriaId` int,
	`custoId` int,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_tipos_pagamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_tipos_recebivel` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_tipos_recebivel_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_transacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`empresaId` int,
	`categoriaId` int,
	`tipoId` int,
	`custoId` int,
	`bancoId` int,
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(15,2) NOT NULL DEFAULT '0',
	`dataVencimento` date NOT NULL,
	`dataPagamento` date,
	`pago` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`observacoes` text,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_transacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposta_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propostaId` int NOT NULL,
	`codigo` varchar(50),
	`descricao` varchar(500) NOT NULL,
	`categoria` varchar(100),
	`unidade` varchar(50) DEFAULT 'Unidade',
	`quantidade` int NOT NULL DEFAULT 1,
	`precoUnitario` decimal(15,2) NOT NULL DEFAULT '0',
	`desconto` decimal(5,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposta_itens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `propostas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int,
	`numero` varchar(50) NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`cliente` varchar(255) NOT NULL,
	`tipoCliente` enum('hospital','clinica','laboratorio','plano_saude','governo') NOT NULL DEFAULT 'hospital',
	`responsavel` varchar(255),
	`status` enum('rascunho','aguardando','aprovada','recusada','negociando') NOT NULL DEFAULT 'rascunho',
	`valorTotal` decimal(15,2) NOT NULL DEFAULT '0',
	`condicoesPagamento` varchar(255),
	`validadeDias` int DEFAULT 30,
	`dataExpiracao` date,
	`observacoes` text,
	`contratoId` int,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `propostas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_contrato_estab` ON `contratos` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_contrato_status` ON `contratos` (`status`);--> statement-breakpoint
CREATE INDEX `idx_contrato_data_fim` ON `contratos` (`dataFim`);--> statement-breakpoint
CREATE INDEX `idx_contrato_hist_contrato` ON `contratos_historico` (`contratoId`);--> statement-breakpoint
CREATE INDEX `idx_fin_cliente_empresa` ON `fin_clientes` (`empresaId`);--> statement-breakpoint
CREATE INDEX `idx_fin_empresa_estab` ON `fin_empresas` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_fin_extrato_banco` ON `fin_extratos` (`bancoId`);--> statement-breakpoint
CREATE INDEX `idx_fin_extrato_data` ON `fin_extratos` (`data`);--> statement-breakpoint
CREATE INDEX `idx_fin_extrato_conciliado` ON `fin_extratos` (`conciliado`);--> statement-breakpoint
CREATE INDEX `idx_fin_previsao_empresa` ON `fin_previsao_receita` (`empresaId`);--> statement-breakpoint
CREATE INDEX `idx_fin_previsao_data` ON `fin_previsao_receita` (`dataPrevisao`);--> statement-breakpoint
CREATE INDEX `idx_fin_recebivel_empresa` ON `fin_recebiveis` (`empresaId`);--> statement-breakpoint
CREATE INDEX `idx_fin_recebivel_cliente` ON `fin_recebiveis` (`clienteId`);--> statement-breakpoint
CREATE INDEX `idx_fin_recebivel_vencimento` ON `fin_recebiveis` (`dataVencimento`);--> statement-breakpoint
CREATE INDEX `idx_fin_recebivel_recebido` ON `fin_recebiveis` (`recebido`);--> statement-breakpoint
CREATE INDEX `idx_fin_transacao_empresa` ON `fin_transacoes` (`empresaId`);--> statement-breakpoint
CREATE INDEX `idx_fin_transacao_categoria` ON `fin_transacoes` (`categoriaId`);--> statement-breakpoint
CREATE INDEX `idx_fin_transacao_vencimento` ON `fin_transacoes` (`dataVencimento`);--> statement-breakpoint
CREATE INDEX `idx_fin_transacao_pago` ON `fin_transacoes` (`pago`);--> statement-breakpoint
CREATE INDEX `idx_proposta_item_proposta` ON `proposta_itens` (`propostaId`);--> statement-breakpoint
CREATE INDEX `idx_proposta_estab` ON `propostas` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_proposta_status` ON `propostas` (`status`);--> statement-breakpoint
CREATE INDEX `idx_proposta_cliente` ON `propostas` (`cliente`);