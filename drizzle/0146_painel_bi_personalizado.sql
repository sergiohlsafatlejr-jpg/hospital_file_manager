CREATE TABLE `estabelecimento_bi_personalizado` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimento_id` int NOT NULL,
	`tema_preset` varchar(40) NOT NULL DEFAULT 'ela_petroleo',
	`logo_url` longtext,
	`nome_exibicao` varchar(120),
	`titulo_relatorio` varchar(120) NOT NULL DEFAULT 'INDICADORES DE FATURAMENTO',
	`rodape_texto` varchar(180) NOT NULL DEFAULT 'CICLO DA RECEITA - FATURADO AO RECEBIMENTO',
	`configuracao_json` json NOT NULL,
	`atualizado_por_id` int,
	`atualizado_por_nome` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estabelecimento_bi_personalizado_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_estab_bi_personalizado` UNIQUE(`estabelecimento_id`)
);
