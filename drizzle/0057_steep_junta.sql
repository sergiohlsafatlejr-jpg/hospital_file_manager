CREATE TABLE `atendimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(100) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`pacienteId` varchar(100),
	`pacienteNome` varchar(255),
	`numeroAtendimento` varchar(100),
	`dataAdmissao` timestamp,
	`dataAlta` timestamp,
	`dataAtendimento` timestamp,
	`tipoAtendimento` varchar(50),
	`tipoSaida` varchar(50),
	`local` varchar(100),
	`carater` varchar(100),
	`servico` varchar(100),
	`procedimentoPrincipal` varchar(255),
	`centroCusto` varchar(100),
	`dadosBrutos` json,
	`sincronizadoEm` timestamp NOT NULL DEFAULT (now()),
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tabela` varchar(100) NOT NULL,
	`registroId` int NOT NULL,
	`tipoAcao` varchar(20) NOT NULL,
	`usuarioId` int NOT NULL,
	`usuarioNome` varchar(255),
	`valoresAnteriores` json,
	`valoresNovos` json,
	`estabelecimentoId` int,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avisosInternos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`conteudo` text NOT NULL,
	`tipo` enum('informacao','alerta','urgente') NOT NULL DEFAULT 'informacao',
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`criadoPorId` int NOT NULL,
	`criadoPorNome` varchar(255),
	`expiraEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `avisosInternos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `convenio_mapeamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`nome_origem` varchar(255) NOT NULL,
	`codigo_origem` varchar(50),
	`convenioId` int NOT NULL,
	`fonte` enum('tasy','integracao','xml','excel','manual') NOT NULL DEFAULT 'manual',
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`criadoPor` int,
	`metodo_match` enum('automatico','manual') NOT NULL DEFAULT 'manual',
	`confianca` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `convenio_mapeamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demonstrativo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`arquivo_id` int NOT NULL,
	`origem_tipo` enum('xml','excel') NOT NULL,
	`convenio_id` int,
	`numero_guia` varchar(50),
	`protocolo` varchar(50),
	`lote_prestador` varchar(50),
	`data_pagamento` date,
	`carteira_beneficiario` varchar(50),
	`nome_beneficiario` varchar(255),
	`sequencial_item` int,
	`codigo_item` varchar(50),
	`descricao_item` text,
	`data_execucao` date,
	`quantidade` decimal(12,3),
	`valor_informado` decimal(12,2) DEFAULT '0.00',
	`valor_pago` decimal(12,2) DEFAULT '0.00',
	`valor_glosa` decimal(12,2) DEFAULT '0.00',
	`codigo_glosa` varchar(500),
	`situacao_item` varchar(100),
	`tipo_lancamento` varchar(100),
	`erro_tiss` varchar(255),
	`data_referencia` date,
	`estabelecimentoId` int,
	`classificacao_glosa` enum('pendente','aceitar','recursar','auto_aceitar','auto_recursar') DEFAULT 'pendente',
	`classificacao_confianca` int,
	`classificacao_motivo` text,
	`motivo_aceite` text,
	`data_aceite` timestamp,
	`recurso_status` enum('sem_recurso','recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido') DEFAULT 'sem_recurso',
	`recurso_id` int,
	`data_importacao_sistema` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `demonstrativo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historicoValidacaoXml` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`dataProcessamento` timestamp NOT NULL,
	`totalContas` int NOT NULL DEFAULT 0,
	`contasValidas` int NOT NULL DEFAULT 0,
	`contasInvalidas` int NOT NULL DEFAULT 0,
	`scoreConformidadeMedio` decimal(5,2) DEFAULT '0',
	`resultadoCompleto` json,
	`usuarioId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historicoValidacaoXml_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_colunas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tabelaId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`nomeExibicao` varchar(255) NOT NULL,
	`tipo` enum('varchar','int','bigint','decimal','text','date','datetime','boolean') NOT NULL,
	`tamanho` int,
	`precisao` int,
	`obrigatorio` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`chaveUnica` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`valorPadrao` varchar(255),
	`ordem` int NOT NULL DEFAULT 0,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integracao_colunas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_conexoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`tipo` enum('postgresql','mysql','sqlserver','oracle') NOT NULL,
	`host` varchar(255) NOT NULL,
	`porta` int NOT NULL,
	`banco` varchar(255) NOT NULL,
	`usuario` varchar(255) NOT NULL,
	`senhaEncriptada` text NOT NULL,
	`ssl` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`estabelecimentoId` int,
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`ultimoTesteConexao` timestamp,
	`statusConexao` enum('ok','erro','nao_testado') NOT NULL DEFAULT 'nao_testado',
	`erroConexao` text,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integracao_conexoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_mapeamento_campos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mapeamentoId` int NOT NULL,
	`colunaOrigemNome` varchar(255) NOT NULL,
	`colunaDestinoId` int NOT NULL,
	`transformacao` text,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integracao_mapeamento_campos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_mapeamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`conexaoOrigemId` int NOT NULL,
	`tabelaDestinoId` int NOT NULL,
	`queryOrigem` text NOT NULL,
	`campoChave` varchar(255),
	`frequencia` enum('manual','5min','15min','30min','1hora','6horas','12horas','diario') NOT NULL DEFAULT 'manual',
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`estabelecimentoId` int,
	`modoImportacao` enum('completa','incremental') NOT NULL DEFAULT 'completa',
	`colunaControle` varchar(255),
	`ultimoValorControle` text,
	`ultimaSincronizacao` timestamp,
	`totalRegistrosImportados` int NOT NULL DEFAULT 0,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integracao_mapeamentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_sincronizacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mapeamentoId` int NOT NULL,
	`status` enum('executando','sucesso','erro','cancelado') NOT NULL,
	`registrosLidos` int NOT NULL DEFAULT 0,
	`registrosInseridos` int NOT NULL DEFAULT 0,
	`registrosAtualizados` int NOT NULL DEFAULT 0,
	`registrosErro` int NOT NULL DEFAULT 0,
	`erroMensagem` text,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`finalizadoEm` timestamp,
	`duracaoMs` int,
	`executadoPor` varchar(255),
	CONSTRAINT `integracao_sincronizacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integracao_tabelas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`nomeExibicao` varchar(255) NOT NULL,
	`descricao` text,
	`estabelecimentoId` int,
	`criadaNoBanco` enum('sim','nao') NOT NULL DEFAULT 'nao',
	`totalRegistros` int NOT NULL DEFAULT 0,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integracao_tabelas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificacoes_atendimento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numatend` varchar(100) NOT NULL,
	`estabelecimentoId` int,
	`observacao` text NOT NULL DEFAULT (''),
	`usuario` varchar(255),
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificacoes_atendimento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificacoes_atendimento_item` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificacaoId` int NOT NULL,
	`motivo` varchar(255) NOT NULL,
	`setor` varchar(255) NOT NULL DEFAULT '',
	`medico` varchar(255) NOT NULL DEFAULT '',
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificacoes_atendimento_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recebimento_geral` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sincronizado` timestamp,
	`atualizado` timestamp,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int,
	`convenio` varchar(255),
	`mes_producao` varchar(20),
	`fatura` varchar(100),
	`codigo_recurso` varchar(100),
	`tipo_procedimento` varchar(255),
	`protocolo` varchar(100),
	`numero_conta` varchar(100),
	`guia_cobranca` varchar(100),
	`guia_operadora` varchar(100),
	`descricao_item` text,
	`carteirinha` varchar(100),
	`data_conta` varchar(20),
	`data_internacao` varchar(20),
	`data_saida` varchar(20),
	`codigo_convenio` varchar(50),
	`codigo_sistema` varchar(50),
	`tipo_descricao` varchar(255),
	`funcao_tiss` varchar(255),
	`receber_hospital` varchar(1),
	`codigo_setor` varchar(50),
	`nome_setor` varchar(255),
	`prestador_executante` varchar(255),
	`nome_prestador` varchar(255),
	`quantidade_item` decimal(15,4),
	`vl_unitario` decimal(15,2),
	`vl_faturado` decimal(15,2),
	`vl_recebido` decimal(15,2),
	`vl_receb_a_maior` decimal(15,2),
	`vl_total_recebido` decimal(15,2),
	`vl_aberto` decimal(15,2),
	`vl_glosas` decimal(15,2),
	`vl_recurso` decimal(15,2),
	`gl_aceita` decimal(15,2),
	`gl_analise` decimal(15,2),
	`gl_recuperado` decimal(15,2),
	`codigo_tiss` varchar(50),
	`descricao_motivo` text,
	`complemento_recurso` text,
	`tipo_atendimento` varchar(255),
	CONSTRAINT `recebimento_geral_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `retorno_tiss_unificado` (
	`id` int AUTO_INCREMENT NOT NULL,
	`arquivo_id` int NOT NULL,
	`numero_demonstrativo` varchar(50),
	`nome_operadora` varchar(150),
	`cnpj_operadora` varchar(20),
	`data_emissao` date,
	`numero_lote_prestador` varchar(50),
	`numero_protocolo` varchar(50),
	`situacao_protocolo` varchar(10),
	`numero_guia_prestador` varchar(50),
	`numero_guia_operadora` varchar(50),
	`senha` varchar(50),
	`numero_carteira` varchar(50),
	`nome_beneficiario` varchar(150),
	`situacao_guia` varchar(10),
	`sequencial_item` int,
	`data_realizacao` date,
	`codigo_tabela` varchar(10),
	`codigo_item` varchar(20),
	`descricao_item` varchar(255),
	`quantidade_executada` decimal(10,3),
	`valor_informado` decimal(12,2),
	`valor_processado` decimal(12,2),
	`valor_liberado` decimal(12,2),
	`codigo_glosa` varchar(20),
	`descricao_glosa` text,
	`origem_dado` enum('xml','excel') NOT NULL,
	`data_importacao` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retorno_tiss_unificado_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vinculacao_codigos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`convenioId` int,
	`codigoHospital` varchar(50) NOT NULL,
	`descricaoHospital` text,
	`codigoConvenio` varchar(50) NOT NULL,
	`descricaoConvenio` text,
	`tipoItem` enum('medicamento','material','procedimento','taxa','diaria','gas','outros') DEFAULT 'outros',
	`ativo` enum('sim','nao') NOT NULL DEFAULT 'sim',
	`criadoPor` int,
	`metodo_match` enum('automatico','manual') NOT NULL DEFAULT 'manual',
	`confianca` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vinculacao_codigos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_unificados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(255) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`numero_atendimento` varchar(100),
	`codigo_saida` varchar(50),
	`convenio` varchar(255),
	`paciente` varchar(255),
	`caracter_atendimento` varchar(50),
	`data_entrada` timestamp,
	`data_saida` timestamp,
	`tipo_atendimento` varchar(50),
	`descricao_atendimento` varchar(255),
	`codigo_servico` varchar(100),
	`codigo_procedimento` varchar(100),
	`destino_conta` varchar(100),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	`atualizadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `atendimentos_unificados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_a_faturar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`origemSistema` varchar(50) NOT NULL DEFAULT 'EASYVISION',
	`numatend` varchar(100) NOT NULL,
	`nomeplaco` varchar(255),
	`nomepac` varchar(255),
	`carater` varchar(50),
	`datatend` timestamp,
	`datasai` timestamp,
	`tipoatend` varchar(10),
	`tipoatendimentodescricao` varchar(100),
	`codserv` varchar(255),
	`procprin` varchar(100),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `atendimentos_a_faturar_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_historico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`atendimentoId` int NOT NULL,
	`campoAlterado` varchar(100) NOT NULL,
	`valorAnterior` text,
	`valorNovo` text,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `atendimentos_historico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos_sem_conta` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`origemSistema` varchar(50) NOT NULL DEFAULT 'EASYVISION',
	`numatend` varchar(100) NOT NULL,
	`nomeplaco` varchar(255),
	`nomepac` varchar(255),
	`carater` varchar(50),
	`datatend` timestamp,
	`datasai` timestamp,
	`tipoatend` varchar(10),
	`tipoatendimentodescricao` varchar(100),
	`codserv` varchar(255),
	`procprin` varchar(100),
	`codcc_destino` varchar(100),
	`motivo` text,
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `atendimentos_sem_conta_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `faturamento_unificado` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(100),
	`estabelecimentoId` int NOT NULL,
	`contaNumero` varchar(100),
	`numeroGuia` varchar(50),
	`numeroGuiaOperadora` varchar(50),
	`senha` varchar(50),
	`protocolo` varchar(100),
	`lotePrestador` varchar(50),
	`atendimento` varchar(100),
	`pacienteNome` varchar(255),
	`carteiraBeneficiario` varchar(50),
	`convenio` varchar(255),
	`convenioId` int,
	`competencia` varchar(20),
	`profissionalExecutante` varchar(255),
	`setor` varchar(255),
	`tipoItem` varchar(50),
	`codigoItem` varchar(50),
	`codigoItemTuss` varchar(50),
	`descricaoItem` text,
	`dataExecucao` timestamp,
	`quantidade` decimal(12,4),
	`valorUnitario` decimal(12,4),
	`valorFaturado` decimal(12,4),
	`valorPago` decimal(12,4),
	`valorGlosa` decimal(12,4),
	`motivoGlosa` text,
	`codigoGlosa` varchar(50),
	`retorno` varchar(50),
	`dataPagamento` timestamp,
	`statusConciliacao` varchar(50) DEFAULT 'pendente',
	`recebimentoVinculadoId` int,
	`recebimentoOrigem` varchar(20),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	`atualizadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `faturamento_unificado_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `faturamento_geral` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL DEFAULT 'WARLEINE',
	`estabelecimentoId` int NOT NULL,
	`configId` int,
	`aihguia` varchar(100),
	`codcc` varchar(50),
	`codconv` varchar(50),
	`codgrufi` varchar(50),
	`codproprio` varchar(100),
	`codrecur` varchar(100),
	`codtiss` varchar(100),
	`complrecur` text,
	`data` timestamp,
	`dataint` timestamp,
	`datasai` timestamp,
	`descmotivo` text,
	`descricao` text,
	`funcaotiss` varchar(50),
	`gl_aceita` varchar(50),
	`gl_analise` varchar(50),
	`gl_recuperada` varchar(50),
	`gl_recurso` varchar(50),
	`guiacobra` varchar(100),
	`matricula` varchar(100),
	`mesprod` varchar(20),
	`nomecc` varchar(255),
	`nomeconv` varchar(255),
	`nomeprest` varchar(255),
	`numconta` varchar(100),
	`numfatura` varchar(100),
	`prestexe` varchar(255),
	`procdisco` varchar(100),
	`protocolo` varchar(100),
	`quantidade` varchar(50),
	`receber` varchar(50),
	`tipoatend` varchar(50),
	`tipoproc` varchar(100),
	`vl_aberto` varchar(50),
	`vl_faturado` varchar(50),
	`vl_glosas` varchar(50),
	`vl_receb_a_maior` varchar(50),
	`vl_recebido` varchar(50),
	`vl_total_recebido` varchar(50),
	`vl_unitario` varchar(50),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `faturamento_geral_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gesthor_atendimentos_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configuracaoId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	`atendimentoId` varchar(100),
	`pacienteId` varchar(100),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`dataAtendimento` timestamp,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `gesthor_atendimentos_staging_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integ_faturado` (
	`_id` int NOT NULL,
	`estabelecimento_id` int,
	`nomeconv` varchar(255),
	`codconv` varchar(255),
	`mesprod` varchar(255),
	`numfatura` varchar(255),
	`codrecur` varchar(500),
	`tipoproc` varchar(255),
	`protocolo` varchar(255),
	`numconta` varchar(255),
	`guiacobra` varchar(255),
	`aihguia` varchar(255),
	`descricao` varchar(255),
	`matricula` varchar(255),
	`data` timestamp,
	`dataint` timestamp,
	`datasai` varchar(500),
	`procdisco` varchar(255),
	`codproprio` varchar(255),
	`codgrufi` varchar(255),
	`funcaotiss` varchar(255),
	`receber` varchar(255),
	`codcc` varchar(255),
	`nomecc` varchar(255),
	`prestexe` varchar(255),
	`nomeprest` varchar(255),
	`medsolic` varchar(255),
	`nomemedsolic` varchar(255),
	`codtiss` varchar(500),
	`descmotivo` varchar(500),
	`complrecur` varchar(500),
	`tipoatend` varchar(255),
	`databaixa` varchar(500),
	`codplaco` varchar(255),
	`nomeplaco` varchar(255),
	`vl_unitario` varchar(255),
	`quantidade` varchar(255),
	`vl_faturado` varchar(255),
	`_sincronizado_em` timestamp,
	`_atualizado_em` timestamp,
	CONSTRAINT `integ_faturado__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `omni_atendimentos_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configuracaoId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	`atendimentoId` varchar(100),
	`pacienteId` varchar(100),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`dataAtendimento` timestamp,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `omni_atendimentos_staging_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pacientes_unificados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(100) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`cpf` varchar(20),
	`nome` varchar(255),
	`dataNascimento` timestamp,
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `pacientes_unificados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procedimentos_unificados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origemSistema` varchar(50) NOT NULL,
	`origemId` varchar(100) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`codigo` varchar(100) NOT NULL,
	`descricao` text,
	`valor` varchar(20),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `procedimentos_unificados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `query_configuracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`sistema` varchar(50) NOT NULL,
	`tipoDados` varchar(50) NOT NULL,
	`querySql` text NOT NULL,
	`descricao` text,
	`conexaoConfig` json,
	`frequencia` varchar(50) NOT NULL DEFAULT 'tempo_real',
	`ativo` boolean NOT NULL DEFAULT true,
	`ultimaSincronizacao` timestamp,
	`proximaSincronizacao` timestamp,
	`totalRegistrosSincronizados` int DEFAULT 0,
	`ultimoErro` text,
	`ultimaTentativa` timestamp,
	`criadoEm` timestamp DEFAULT (now()),
	`atualizadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `query_configuracoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sincronizacao_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configuracaoId` int NOT NULL,
	`sistema` varchar(50) NOT NULL,
	`tipoDados` varchar(50) NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`status` varchar(50) NOT NULL,
	`registrosSincronizados` int DEFAULT 0,
	`registrosErro` int DEFAULT 0,
	`duracao` int,
	`mensagemErro` text,
	`stackTrace` text,
	`iniciadoEm` timestamp DEFAULT (now()),
	`finalizadoEm` timestamp,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `sincronizacao_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasy_atendimentos_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configuracaoId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	`atendimentoId` varchar(100),
	`pacienteId` varchar(100),
	`dataSincronizacao` timestamp DEFAULT (now()),
	`dataAtendimento` timestamp,
	`criadoEm` timestamp DEFAULT (now()),
	CONSTRAINT `tasy_atendimentos_staging_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warleine_atendimentos_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	CONSTRAINT `warleine_atendimentos_staging_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warleine_faturamento_staging` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estabelecimentoId` int NOT NULL,
	`configId` int NOT NULL,
	`dadosBrutos` json NOT NULL,
	CONSTRAINT `warleine_faturamento_staging_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conciliacao` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `resumoConciliacao` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` MODIFY COLUMN `grupoServico` enum('administrador','faturista','recurso_glosa','gestor','visualizador','usuario_tasy') NOT NULL DEFAULT 'visualizador';--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `arquivo_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_demonstrativo` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `data_emissao` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `data_pagamento` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_lote_prestador` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_protocolo` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `situacao_protocolo` varchar(10);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_prestador_pagamento` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `nome_prestador_pagamento` varchar(255);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_prestador_executante` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `nome_prestador_executante` varchar(255);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_guia_prestador` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_guia_operadora` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `senha` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `numero_carteira` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `situacao_guia` varchar(10);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `data_realizacao` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `hora_execucao` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_tabela` varchar(10);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_procedimento` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `qtd_executada` decimal(10,4);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_glosa` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `codigo_solicitante` varchar(50);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `nome_solicitante` varchar(255);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `data_inicio_internacao` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` MODIFY COLUMN `data_fim_internacao` date;--> statement-breakpoint
ALTER TABLE `conciliacao` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `resumoConciliacao` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `faturamento_tiss` ADD `valor_faturado` decimal(12,2);--> statement-breakpoint
ALTER TABLE `faturamento_tiss` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `faturamento_tiss` ADD `convenioId` int;--> statement-breakpoint
ALTER TABLE `faturamento_tiss` ADD `data_referencia` timestamp;--> statement-breakpoint
ALTER TABLE `itensRegraNegocio` ADD `tabelaPrecoCodigo` varchar(50);--> statement-breakpoint
ALTER TABLE `itensRegraNegocio` ADD `tolerancia_percentual` varchar(10);--> statement-breakpoint
ALTER TABLE `itensRegraNegocio` ADD `tolerancia_absoluta` decimal(12,2);--> statement-breakpoint
ALTER TABLE `itensRegraNegocio` ADD `ordem` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoImportacaoTasy` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoContasFaturadas` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelatoriosTasy` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRelatoriosBi` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoConciliacaoContasPagas` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRecebimentosXml` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRecebimentosExcel` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoDemonstrativo` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoContaConvenio` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoRecursos` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoAtendimentos` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD `acessoAtendimentosFaturar` enum('sim','nao') DEFAULT 'nao' NOT NULL;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `registro_ans` varchar(6);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `cnes` varchar(7);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `codigo_prestador_operadora` varchar(14);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `nome_contratado` varchar(70);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `data_protocolo` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_protocolo` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_glosa_protocolo` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `glosa_protocolo_codigo` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `glosa_protocolo_descricao` text;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_informado_protocolo` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_processado_protocolo` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_liberado_protocolo` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_glosa_protocolo_total` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `data_inicio_fat` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `data_fim_fat` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `motivo_glosa_guia_codigo` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `motivo_glosa_guia_descricao` text;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_informado_guia` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_processado_guia` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_liberado_guia` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_glosa_guia` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `codigo_item` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `descricao_item` varchar(255);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `grau_participacao` varchar(5);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `quantidade_executada` decimal(10,4);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_glosado` decimal(12,2) GENERATED ALWAYS AS (`valor_informado` - `valor_liberado`) VIRTUAL;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `forma_pagamento` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `banco` varchar(4);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `agencia` varchar(7);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_informado_geral` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_processado_geral` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_liberado_geral` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_glosa_geral` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `valor_final_receber` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `origem_dado` enum('xml','excel') NOT NULL;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `convenioId` int;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `data_referencia` date;--> statement-breakpoint
ALTER TABLE `recebimento_tiss` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `tipo_item` varchar(30);--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `valor_glosa` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `codigo_glosa` varchar(20);--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `valor_informado` decimal(12,2);--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `convenioId` int;--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `data_referencia` date;--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `data_pagamento` date;--> statement-breakpoint
ALTER TABLE `recebimentos_excel` ADD `estabelecimentoId` int;--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `tipoRegra` enum('validacao_geral','padrao_procedimento') DEFAULT 'validacao_geral';--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `codigoProcedimento` varchar(50);--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `nomeProcedimento` varchar(255);--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `tolerancia_percentual` varchar(10);--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `tolerancia_absoluta` decimal(12,2);--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `diaria_obrigatoria` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `diaria_esperada_por_dia` int;--> statement-breakpoint
ALTER TABLE `regrasNegocio` ADD `score_minimo_aceitavel` int DEFAULT 70;--> statement-breakpoint
ALTER TABLE `conciliacao` ADD `receberHospital` varchar(1);--> statement-breakpoint
ALTER TABLE `conciliacao` ADD `vinculacaoId` int;--> statement-breakpoint
ALTER TABLE `conciliacao` ADD `metodoMatch` enum('codigo_direto','vinculacao','manual') DEFAULT 'codigo_direto';--> statement-breakpoint
ALTER TABLE `conciliacao` ADD `arquivoDemoId` int;--> statement-breakpoint
ALTER TABLE `conciliacao` ADD `pendenteVinculacao` enum('sim','nao') DEFAULT 'nao';--> statement-breakpoint
CREATE INDEX `idx_atend_origem` ON `atendimentos` (`origemSistema`,`origemId`);--> statement-breakpoint
CREATE INDEX `idx_atend_paciente` ON `atendimentos` (`pacienteId`);--> statement-breakpoint
CREATE INDEX `idx_atend_estabelecimento` ON `atendimentos` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_data` ON `atendimentos` (`dataAtendimento`);--> statement-breakpoint
CREATE INDEX `idx_conv_map_estab` ON `convenio_mapeamento` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_conv_map_nome_origem` ON `convenio_mapeamento` (`nome_origem`);--> statement-breakpoint
CREATE INDEX `idx_conv_map_convenio_id` ON `convenio_mapeamento` (`convenioId`);--> statement-breakpoint
CREATE INDEX `idx_conv_map_unique` ON `convenio_mapeamento` (`estabelecimentoId`,`nome_origem`,`codigo_origem`);--> statement-breakpoint
CREATE INDEX `idx_integ_coluna_tabela` ON `integracao_colunas` (`tabelaId`);--> statement-breakpoint
CREATE INDEX `idx_integ_conexao_estab` ON `integracao_conexoes` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_mapcampo_map` ON `integracao_mapeamento_campos` (`mapeamentoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_map_conexao` ON `integracao_mapeamentos` (`conexaoOrigemId`);--> statement-breakpoint
CREATE INDEX `idx_integ_map_tabela` ON `integracao_mapeamentos` (`tabelaDestinoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_map_estab` ON `integracao_mapeamentos` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_sync_map` ON `integracao_sincronizacoes` (`mapeamentoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_sync_status` ON `integracao_sincronizacoes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_integ_sync_inicio` ON `integracao_sincronizacoes` (`iniciadoEm`);--> statement-breakpoint
CREATE INDEX `idx_integ_tabela_nome` ON `integracao_tabelas` (`nome`);--> statement-breakpoint
CREATE INDEX `idx_integ_tabela_estab` ON `integracao_tabelas` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_notif_atend_numatend` ON `notificacoes_atendimento` (`numatend`);--> statement-breakpoint
CREATE INDEX `idx_notif_atend_estab` ON `notificacoes_atendimento` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_notif_atend_criado` ON `notificacoes_atendimento` (`criadoEm`);--> statement-breakpoint
CREATE INDEX `idx_notif_item_notificacao` ON `notificacoes_atendimento_item` (`notificacaoId`);--> statement-breakpoint
CREATE INDEX `idx_notif_item_motivo` ON `notificacoes_atendimento_item` (`motivo`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_estab` ON `recebimento_geral` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_convenio` ON `recebimento_geral` (`convenio`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_mes` ON `recebimento_geral` (`mes_producao`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_protocolo` ON `recebimento_geral` (`protocolo`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_conta` ON `recebimento_geral` (`numero_conta`);--> statement-breakpoint
CREATE INDEX `idx_receb_geral_convenio_id` ON `recebimento_geral` (`convenioId`);--> statement-breakpoint
CREATE INDEX `idx_vinc_cod_estab` ON `vinculacao_codigos` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_vinc_cod_hospital` ON `vinculacao_codigos` (`codigoHospital`);--> statement-breakpoint
CREATE INDEX `idx_vinc_cod_convenio` ON `vinculacao_codigos` (`codigoConvenio`);--> statement-breakpoint
CREATE INDEX `idx_vinc_unique` ON `vinculacao_codigos` (`estabelecimentoId`,`convenioId`,`codigoHospital`,`codigoConvenio`);--> statement-breakpoint
CREATE INDEX `idx_atend_origem_sistema` ON `atendimentos_unificados` (`origemSistema`);--> statement-breakpoint
CREATE INDEX `idx_atend_origem_id` ON `atendimentos_unificados` (`origemId`);--> statement-breakpoint
CREATE INDEX `idx_atend_estab` ON `atendimentos_unificados` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_data_entrada` ON `atendimentos_unificados` (`data_entrada`);--> statement-breakpoint
CREATE INDEX `idx_atend_faturar_estab` ON `atendimentos_a_faturar` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_faturar_numatend` ON `atendimentos_a_faturar` (`numatend`);--> statement-breakpoint
CREATE INDEX `idx_atend_faturar_tipo` ON `atendimentos_a_faturar` (`tipoatend`);--> statement-breakpoint
CREATE INDEX `idx_atend_faturar_datatend` ON `atendimentos_a_faturar` (`datatend`);--> statement-breakpoint
CREATE INDEX `idx_atend_hist_atend` ON `atendimentos_historico` (`atendimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_sem_conta_estab` ON `atendimentos_sem_conta` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_atend_sem_conta_numatend` ON `atendimentos_sem_conta` (`numatend`);--> statement-breakpoint
CREATE INDEX `idx_atend_sem_conta_tipo` ON `atendimentos_sem_conta` (`tipoatend`);--> statement-breakpoint
CREATE INDEX `idx_atend_sem_conta_datatend` ON `atendimentos_sem_conta` (`datatend`);--> statement-breakpoint
CREATE INDEX `idx_fatur_origem_sistema` ON `faturamento_unificado` (`origemSistema`);--> statement-breakpoint
CREATE INDEX `idx_fatur_estab` ON `faturamento_unificado` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_fatur_conta` ON `faturamento_unificado` (`contaNumero`);--> statement-breakpoint
CREATE INDEX `idx_fatur_guia` ON `faturamento_unificado` (`numeroGuia`);--> statement-breakpoint
CREATE INDEX `idx_fatur_convenio` ON `faturamento_unificado` (`convenio`);--> statement-breakpoint
CREATE INDEX `idx_fatur_competencia` ON `faturamento_unificado` (`competencia`);--> statement-breakpoint
CREATE INDEX `idx_fatur_codigo_item` ON `faturamento_unificado` (`codigoItem`);--> statement-breakpoint
CREATE INDEX `idx_fatur_status_conciliacao` ON `faturamento_unificado` (`statusConciliacao`);--> statement-breakpoint
CREATE INDEX `idx_fatur_paciente` ON `faturamento_unificado` (`pacienteNome`);--> statement-breakpoint
CREATE INDEX `idx_fatur_geral_estab` ON `faturamento_geral` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_fatur_geral_numconta` ON `faturamento_geral` (`numconta`);--> statement-breakpoint
CREATE INDEX `idx_fatur_geral_nomeconv` ON `faturamento_geral` (`nomeconv`);--> statement-breakpoint
CREATE INDEX `idx_fatur_geral_mesprod` ON `faturamento_geral` (`mesprod`);--> statement-breakpoint
CREATE INDEX `idx_fatur_geral_config` ON `faturamento_geral` (`configId`);--> statement-breakpoint
CREATE INDEX `idx_gesthor_atend_estab` ON `gesthor_atendimentos_staging` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_gesthor_atend_config` ON `gesthor_atendimentos_staging` (`configuracaoId`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_estab` ON `integ_faturado` (`estabelecimento_id`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_guia` ON `integ_faturado` (`guiacobra`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_proc` ON `integ_faturado` (`procdisco`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_mesprod` ON `integ_faturado` (`mesprod`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_numconta` ON `integ_faturado` (`numconta`);--> statement-breakpoint
CREATE INDEX `idx_integ_fatur_nomeconv` ON `integ_faturado` (`nomeconv`);--> statement-breakpoint
CREATE INDEX `idx_omni_atend_estab` ON `omni_atendimentos_staging` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_omni_atend_config` ON `omni_atendimentos_staging` (`configuracaoId`);--> statement-breakpoint
CREATE INDEX `idx_pac_cpf` ON `pacientes_unificados` (`cpf`);--> statement-breakpoint
CREATE INDEX `idx_pac_origem_sistema` ON `pacientes_unificados` (`origemSistema`);--> statement-breakpoint
CREATE INDEX `idx_proc_codigo` ON `procedimentos_unificados` (`codigo`);--> statement-breakpoint
CREATE INDEX `idx_proc_origem_sistema` ON `procedimentos_unificados` (`origemSistema`);--> statement-breakpoint
CREATE INDEX `idx_query_config_estab_sistema` ON `query_configuracoes` (`estabelecimentoId`,`sistema`);--> statement-breakpoint
CREATE INDEX `idx_query_config_sistema` ON `query_configuracoes` (`sistema`);--> statement-breakpoint
CREATE INDEX `idx_query_config_ativo` ON `query_configuracoes` (`ativo`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_config` ON `sincronizacao_log` (`configuracaoId`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_sistema` ON `sincronizacao_log` (`sistema`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_status` ON `sincronizacao_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_data` ON `sincronizacao_log` (`criadoEm`);--> statement-breakpoint
CREATE INDEX `idx_tasy_atend_estab` ON `tasy_atendimentos_staging` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_tasy_atend_config` ON `tasy_atendimentos_staging` (`configuracaoId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_atend_estab` ON `warleine_atendimentos_staging` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_atend_config` ON `warleine_atendimentos_staging` (`configId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_fatur_estab` ON `warleine_faturamento_staging` (`estabelecimentoId`);--> statement-breakpoint
CREATE INDEX `idx_warleine_fatur_config` ON `warleine_faturamento_staging` (`configId`);