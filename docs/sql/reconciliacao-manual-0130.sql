-- EXCEÇÃO OPERACIONAL PARA REVISÃO - NÃO EXECUTAR AUTOMATICAMENTE.
-- Versão de referência: main 6cf2033; migração integrada: drizzle/0130_dapper_moon_knight.sql.
-- SQL 0130 SHA-256 ORIGINAL (não deste runbook): ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10
-- Created_at exato no journal da 0130: 1790874573874.
-- IMPORTANTE: registrar somente 0130 fará Drizzle ignorar 0105-0129 no futuro.
-- NÃO significa que as migrações 0105-0128 tenham sido integralmente executadas.
-- 0129 foi dispensada por Sergio; NÃO criamos atendimentos_parados_staging.
-- Exige janela exclusiva, revisão independente, ensaio em homologação restaurada,
-- backup externo recente e verificação de banco/commit/estrutura pelo executor.
-- A PR #32 foi mesclada sem revisão independente registrada. Revisão do SQL
-- completo deve ser documentada na Issue privada #34 antes da execução.
-- DDL no TiDB não é transacional em conjunto: após falha, parar e analisar estado parcial.
-- Execute as FASES separadamente; NÃO selecione "executar tudo" no cliente SQL.

-- FASE 0: conferência. Esperado: banco-alvo confirmado PELO EXECUTOR,
-- journal 91 linhas, watermark 1782841349000, id 3153269,
-- último hash histórico '0105_simple_lady_deathstrike', 0 tabelas alvo, 0 tabela 0129.
SELECT DATABASE() AS banco_alvo_para_conferencia_manual;
SELECT COUNT(*) AS total_journal, MAX(created_at) AS watermark_atual
FROM __drizzle_migrations;
SELECT id, hash, created_at AS watermark_final
FROM __drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1;
SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND table_type='BASE TABLE') AS tabelas_0130_existentes, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='atendimentos_parados_staging') AS tabela_0129_existente;
-- SE QUALQUER RESULTADO DIVERGIR: PARE. Não rode FASE 1.

-- FASE 1: DDL ORIGINAL 0130 (retirados apenas marcadores de statement-breakpoint).
-- Somente com a FASE 0 aprovada. No caso de erro, NÃO execute a FASE 3.
CREATE TABLE `stagion_atendimentos_parados_hemolabor` (
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
	CONSTRAINT `stagion_atendimentos_parados_hemolabor_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_hemolabor_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);

CREATE TABLE `stagion_atendimentos_parados_iad` (
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
	CONSTRAINT `stagion_atendimentos_parados_iad_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_iad_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);

CREATE TABLE `stagion_atendimentos_parados_irg` (
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
	CONSTRAINT `stagion_atendimentos_parados_irg_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_irg_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);

CREATE TABLE `stagion_atendimentos_parados_materniadeela` (
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
	CONSTRAINT `stagion_atendimentos_parados_materniadeela_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_materniadeela_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);

CREATE TABLE `stagion_atendimentos_parados_urologico` (
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
	CONSTRAINT `stagion_atendimentos_parados_urologico_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_atend_parados_urologico_origem` UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)
);

CREATE INDEX `idx_atend_parados_hemolabor_estab_origem` ON `stagion_atendimentos_parados_hemolabor` (`estabelecimentoId`,`origemSistema`);
CREATE INDEX `idx_atend_parados_hemolabor_lote` ON `stagion_atendimentos_parados_hemolabor` (`loteRef`);
CREATE INDEX `idx_atend_parados_hemolabor_numatend` ON `stagion_atendimentos_parados_hemolabor` (`numeroAtendimento`);
CREATE INDEX `idx_atend_parados_hemolabor_status` ON `stagion_atendimentos_parados_hemolabor` (`statusValidacao`);
CREATE INDEX `idx_atend_parados_iad_estab_origem` ON `stagion_atendimentos_parados_iad` (`estabelecimentoId`,`origemSistema`);
CREATE INDEX `idx_atend_parados_iad_lote` ON `stagion_atendimentos_parados_iad` (`loteRef`);
CREATE INDEX `idx_atend_parados_iad_numatend` ON `stagion_atendimentos_parados_iad` (`numeroAtendimento`);
CREATE INDEX `idx_atend_parados_iad_status` ON `stagion_atendimentos_parados_iad` (`statusValidacao`);
CREATE INDEX `idx_atend_parados_irg_estab_origem` ON `stagion_atendimentos_parados_irg` (`estabelecimentoId`,`origemSistema`);
CREATE INDEX `idx_atend_parados_irg_lote` ON `stagion_atendimentos_parados_irg` (`loteRef`);
CREATE INDEX `idx_atend_parados_irg_numatend` ON `stagion_atendimentos_parados_irg` (`numeroAtendimento`);
CREATE INDEX `idx_atend_parados_irg_status` ON `stagion_atendimentos_parados_irg` (`statusValidacao`);
CREATE INDEX `idx_atend_parados_materniadeela_estab_origem` ON `stagion_atendimentos_parados_materniadeela` (`estabelecimentoId`,`origemSistema`);
CREATE INDEX `idx_atend_parados_materniadeela_lote` ON `stagion_atendimentos_parados_materniadeela` (`loteRef`);
CREATE INDEX `idx_atend_parados_materniadeela_numatend` ON `stagion_atendimentos_parados_materniadeela` (`numeroAtendimento`);
CREATE INDEX `idx_atend_parados_materniadeela_status` ON `stagion_atendimentos_parados_materniadeela` (`statusValidacao`);
CREATE INDEX `idx_atend_parados_urologico_estab_origem` ON `stagion_atendimentos_parados_urologico` (`estabelecimentoId`,`origemSistema`);
CREATE INDEX `idx_atend_parados_urologico_lote` ON `stagion_atendimentos_parados_urologico` (`loteRef`);
CREATE INDEX `idx_atend_parados_urologico_numatend` ON `stagion_atendimentos_parados_urologico` (`numeroAtendimento`);
CREATE INDEX `idx_atend_parados_urologico_status` ON `stagion_atendimentos_parados_urologico` (`statusValidacao`);

-- FASE 2: pós-verificação. Esperado: 5 tabelas, 20 índices secundários,
-- 5 UNIQUE por origem e 5 PRIMARY KEY; tabela descartada 0129 ausente.
-- Também revisar SHOW CREATE TABLE de cada tabela contra o SQL 0130 original:
SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND table_type='BASE TABLE') AS tabelas,
       (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND CONCAT(table_name,'.',index_name) IN ('stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_estab_origem', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_lote', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_numatend', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_status', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_estab_origem', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_lote', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_numatend', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_status', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_estab_origem', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_lote', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_numatend', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_status', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_estab_origem', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_lote', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_numatend', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_status', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_estab_origem', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_lote', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_numatend', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_status') AND non_unique=1) secondary_indexes) AS indices_secundarios,
       (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND CONCAT(table_name,'.',index_name) IN ('stagion_atendimentos_parados_hemolabor.uq_atend_parados_hemolabor_origem', 'stagion_atendimentos_parados_iad.uq_atend_parados_iad_origem', 'stagion_atendimentos_parados_irg.uq_atend_parados_irg_origem', 'stagion_atendimentos_parados_materniadeela.uq_atend_parados_materniadeela_origem', 'stagion_atendimentos_parados_urologico.uq_atend_parados_urologico_origem') AND non_unique=0) unique_indexes) AS chaves_unicas,
       (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND index_name='PRIMARY' AND column_name='id' AND seq_in_index=1 AND non_unique=0) primary_indexes) AS chaves_primarias,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='atendimentos_parados_staging') AS tabela_0129_que_deve_permanecer_ausente;
-- Se alguma contagem divergir ou a estrutura não corresponder: PARE. Não rode a FASE 3.

-- FASE 3: REGISTRO EXCEPCIONAL NO DRIZZLE, SOMENTE APÓS FASE 2 E APROVAÇÃO FORMAL.
-- Isto não executa nem certifica 0105-0129; o salto no watermark fica documentado
-- externamente como baseline dispensado/auditoria pendente. Não use em produção
-- enquanto houver bloqueios de revisão, validação do backup e reserva na Issue #34.
-- Proteger contra reexecução e alteração concorrente do watermark.
-- Na MESMA sessão, após comparar a estrutura completa e arquivar a aprovação
-- independente, o executor deve digitar separadamente (NÃO incluído no SQL):
-- SET @safatle_0130_revisao = 'ESTRUTURA_0130_CONFERIDA';
-- Sem essa ação consciente, o INSERT afetará 0 linhas.
INSERT INTO __drizzle_migrations (`hash`, `created_at`)
SELECT 'ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10', 1790874573874
WHERE @safatle_0130_revisao = 'ESTRUTURA_0130_CONFERIDA'
  AND (SELECT COUNT(*) FROM __drizzle_migrations) = 91
  AND (SELECT MAX(created_at) FROM __drizzle_migrations) = 1782841349000
  AND (SELECT COUNT(*) FROM __drizzle_migrations
       WHERE id=3153269 AND hash='0105_simple_lady_deathstrike'
         AND created_at=1782841349000) = 1
  AND NOT EXISTS (SELECT 1 FROM __drizzle_migrations
                  WHERE created_at = 1790874573874 OR hash = 'ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10')
  AND (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND table_type='BASE TABLE') = 5
  AND (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND CONCAT(table_name,'.',index_name) IN ('stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_estab_origem', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_lote', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_numatend', 'stagion_atendimentos_parados_hemolabor.idx_atend_parados_hemolabor_status', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_estab_origem', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_lote', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_numatend', 'stagion_atendimentos_parados_iad.idx_atend_parados_iad_status', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_estab_origem', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_lote', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_numatend', 'stagion_atendimentos_parados_irg.idx_atend_parados_irg_status', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_estab_origem', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_lote', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_numatend', 'stagion_atendimentos_parados_materniadeela.idx_atend_parados_materniadeela_status', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_estab_origem', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_lote', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_numatend', 'stagion_atendimentos_parados_urologico.idx_atend_parados_urologico_status') AND non_unique=1) secondary_indexes) = 20
  AND (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND CONCAT(table_name,'.',index_name) IN ('stagion_atendimentos_parados_hemolabor.uq_atend_parados_hemolabor_origem', 'stagion_atendimentos_parados_iad.uq_atend_parados_iad_origem', 'stagion_atendimentos_parados_irg.uq_atend_parados_irg_origem', 'stagion_atendimentos_parados_materniadeela.uq_atend_parados_materniadeela_origem', 'stagion_atendimentos_parados_urologico.uq_atend_parados_urologico_origem') AND non_unique=0) unique_indexes) = 5
  AND (SELECT COUNT(*) FROM (SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('stagion_atendimentos_parados_hemolabor', 'stagion_atendimentos_parados_iad', 'stagion_atendimentos_parados_irg', 'stagion_atendimentos_parados_materniadeela', 'stagion_atendimentos_parados_urologico') AND index_name='PRIMARY' AND column_name='id' AND seq_in_index=1 AND non_unique=0) primary_indexes) = 5
  AND (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='atendimentos_parados_staging') = 0;
-- ESPERADO: ROW_COUNT() = 1; se 0, PARE e investigue, não force o INSERT.
SELECT ROW_COUNT() AS registros_0130_inseridos;
SELECT COUNT(*) AS total_journal_apos, MAX(created_at) AS watermark_apos
FROM __drizzle_migrations;
SELECT COUNT(*) AS registro_0130_exato
FROM __drizzle_migrations WHERE created_at=1790874573874 AND hash='ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10';
-- ESPERADO: total 92, watermark 1790874573874, registro_0130_exato 1.
-- Não executar db:migrate nem preencher 0105-0129 em seguida: rever plano de dívida histórica.
