-- PLANO PARA REVISÃO; NÃO EXECUTAR SEM PARECER INDEPENDENTE OU EXCEÇÃO FORMAL DE SERGIO E JANELA AUTORIZADA.
-- Base GitHub main bb9bf91; SQL gerado: drizzle/0131_neat_johnny_storm.sql.
-- SHA-256 do SQL ORIGINAL da 0131: 802ec518dcb031eaa3fd626463a89117fc7ef4e474af9f25d246769e4c61d98d.
-- created_at exato da entrada 0131 no journal: 1791224176523.
-- 06/10/2026: Sergio dispensou somente a revisão de outra pessoa da PR #49/0131.
-- A exceção NÃO dispensa preflight, backup restaurável, homologação ou janela única.
-- Banco de produção: confirmar alvo pelo executor; não rodar pnpm db:migrate geral.
-- Fases separadas: TiDB DDL pode confirmar parcialmente, e não há rollback global.
-- PR #46 prepara schema, não autoriza aplicação sozinha; coordenação pela Issue #34.
-- JANELA EXCLUSIVA: um único executor designado; suspender todos os jobs/usuários
-- capazes de executar migração, db:push ou DDL nesse banco até o fim da fase 3.
-- O INSERT condicional NÃO é mutex; não começar sem exclusividade confirmada na
-- Issue #34. Sem esse controle, o runbook está BLOQUEADO PARA EXECUÇÃO.
-- Conferir identidade esperada de host/tenant/schema via canal privado, versão
-- TiDB, SQL mode, charset/collation e backup restaurável em homologação isolada.
-- A reconciliação histórica 0105-0129 continua excepcional; confrontar evidência
-- privada da linhagem dos 92 marcadores, não apenas o MAX(created_at) abaixo.

-- FASE 0 (somente leitura): esperado 92 marcadores, watermark 0130, 0131 ausente.
SELECT DATABASE() AS banco_para_conferencia_do_executor;
SHOW CREATE TABLE __drizzle_migrations;
SELECT COUNT(*) AS total_journal, MAX(created_at) AS watermark
FROM __drizzle_migrations;
SELECT COUNT(*) AS marcador_0130_exato
FROM __drizzle_migrations
WHERE hash='ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10'
  AND created_at=1790874573874;
SELECT COUNT(*) AS marcador_0131_existente
FROM __drizzle_migrations
WHERE hash='802ec518dcb031eaa3fd626463a89117fc7ef4e474af9f25d246769e4c61d98d'
   OR created_at=1791224176523;
SELECT COUNT(*) AS tabela_0131_existente
FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_type='BASE TABLE'
  AND table_name='stagion_faturado_recebido_urologico';
-- PARE se qualquer valor divergir de 92 / 1790874573874 / 1 / 0 / 0.
-- Confirmar migração reservada, revisão ou exceção registrada, homologação, backup e janela.
-- Se o journal físico não oferecer unicidade de (hash,created_at), depende-se
-- integralmente do congelamento operacional e de uma sessão única. PARE se houver
-- outro executor ou serviço com permissão de DDL ativo durante a janela.

-- FASE 1 (DDL): texto funcional idêntico ao SQL gerado 0131; NÃO executar se fase 0 falhar.
CREATE TABLE `stagion_faturado_recebido_urologico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lote_ref` varchar(64),
	`capturado_em` timestamp NOT NULL DEFAULT (now()),
	`nomeconv` varchar(255),
	`codconv` varchar(100),
	`mesprod` varchar(20),
	`numfatura` varchar(100),
	`codrecur` varchar(100),
	`tipoproc` varchar(50),
	`protocolo` varchar(100),
	`numconta` varchar(100),
	`guiacobra` varchar(100),
	`aihguia` varchar(100),
	`descricao` varchar(255),
	`matricula` varchar(100),
	`data` varchar(40),
	`dataint` varchar(40),
	`datasai` varchar(40),
	`procdisco` varchar(100),
	`codproprio` varchar(100),
	`codgrufi` varchar(50),
	`descricao_1` text,
	`funcaotiss` varchar(50),
	`receber` varchar(20),
	`codcc` varchar(50),
	`nomecc` varchar(255),
	`prestexe` varchar(100),
	`nomeprest` varchar(255),
	`codtiss` varchar(100),
	`descmotivo` text,
	`codrecur_1` varchar(100),
	`complrecur` text,
	`tipoatend` varchar(100),
	`quantidade` decimal(18,4),
	`vl_faturado` decimal(20,4),
	`vl_recebido` decimal(20,4),
	`vl_receb_a_maior` decimal(20,4),
	`vl_total_recebido` decimal(20,4),
	`vl_aberto` decimal(20,4),
	`vl_glosas` decimal(20,4),
	`gl_recurso` decimal(20,4),
	`gl_aceita` decimal(20,4),
	`gl_analise` decimal(20,4),
	`gl_recuperada` decimal(20,4),
	`vl_unitario` decimal(20,4),
	`estabelecimentos_id` int NOT NULL,
	CONSTRAINT `stagion_faturado_recebido_urologico_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_hup_fat_unidade_lote` ON `stagion_faturado_recebido_urologico` (`estabelecimentos_id`,`lote_ref`);
CREATE INDEX `idx_hup_fat_unidade_mes` ON `stagion_faturado_recebido_urologico` (`estabelecimentos_id`,`mesprod`);
CREATE INDEX `idx_hup_fat_unidade_conta` ON `stagion_faturado_recebido_urologico` (`estabelecimentos_id`,`numconta`);
-- Se qualquer CREATE falhar, PARE e diagnostique estado físico parcial. NÃO executar a fase 3.
-- Matriz de recuperação: nenhum objeto criado = encerrar janela sem marker;
-- tabela sem todos os índices = preservar objeto, bloquear carga, abrir correção
-- versionada/revisada; tabela+índices íntegros e journal ausente = revalidar
-- identidade física em nova janela e obter parecer específico antes de registrar;
-- journal presente mas estrutura divergente = suspender deploy/carga e investigar.
-- Não fazer DROP, não repetir CREATE automaticamente e não usar IF NOT EXISTS.

-- FASE 2 (somente leitura): comparar TODAS as 46 colunas e os índices à 0131 gerada.
SHOW CREATE TABLE `stagion_faturado_recebido_urologico`;
SELECT COUNT(*) AS colunas
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='stagion_faturado_recebido_urologico';
SELECT index_name, non_unique, seq_in_index, column_name
FROM information_schema.statistics
WHERE table_schema=DATABASE() AND table_name='stagion_faturado_recebido_urologico'
ORDER BY index_name, seq_in_index;
SELECT COUNT(*) AS linhas_apos_criacao FROM `stagion_faturado_recebido_urologico`;
-- Esperado: 46 colunas, PK(id), três índices de duas colunas na ordem original,
-- quantidades DECIMAL(18,4), valores DECIMAL(20,4), unidade NOT NULL e ZERO linhas.
-- Nenhum dado financeiro deve ser importado nesta janela.
-- O gate da fase 3 por contagens é NECESSÁRIO, não SUFICIENTE: revisor e executor
-- deve-se conferir nomes, ordem, tipos, nulabilidade, defaults, PK e todos os índices
-- versus o SQL original, registrar o aceite estrutural na Issue #34 e confirmar
-- uma última vez exclusividade da janela e banco correto imediatamente antes do SET.

-- FASE 3: SOMENTE após FASE 2 integralmente conferida e revisão ou exceção formal registrada.
-- Em sessão única, após registro da aprovação na Issue #34, o executor informa:
-- SET @safatle_0131_revisao = 'ESTRUTURA_0131_CONFERIDA';
-- Sem esse ato explícito, o INSERT afeta zero linhas. Nunca forçar caso falhe.
INSERT INTO __drizzle_migrations (`hash`, `created_at`)
SELECT '802ec518dcb031eaa3fd626463a89117fc7ef4e474af9f25d246769e4c61d98d',1791224176523
WHERE @safatle_0131_revisao = 'ESTRUTURA_0131_CONFERIDA'
  AND (SELECT COUNT(*) FROM __drizzle_migrations)=92
  AND (SELECT MAX(created_at) FROM __drizzle_migrations)=1790874573874
  AND (SELECT COUNT(*) FROM __drizzle_migrations
       WHERE hash='ebcb2733bab4484ec79177c27c151f422d6df852d15722f5a92bbb21ee6afb10'
         AND created_at=1790874573874)=1
  AND NOT EXISTS (SELECT 1 FROM __drizzle_migrations
                  WHERE created_at=1791224176523
                     OR hash='802ec518dcb031eaa3fd626463a89117fc7ef4e474af9f25d246769e4c61d98d')
  AND (SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name='stagion_faturado_recebido_urologico'
         AND table_type='BASE TABLE')=1
  AND (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name='stagion_faturado_recebido_urologico')=46
  AND (SELECT COUNT(*) FROM information_schema.statistics
       WHERE table_schema=DATABASE() AND table_name='stagion_faturado_recebido_urologico')=7
  AND (SELECT COUNT(*) FROM `stagion_faturado_recebido_urologico`)=0;
-- Esperado: ROW_COUNT() = 1; se zero, PARE, sem nova tentativa às cegas.
SELECT ROW_COUNT() AS marcadores_0131_inseridos;
SELECT COUNT(*) AS journal_apos, MAX(created_at) AS watermark_apos
FROM __drizzle_migrations;
SELECT COUNT(*) AS marcador_0131_exato
FROM __drizzle_migrations
WHERE hash='802ec518dcb031eaa3fd626463a89117fc7ef4e474af9f25d246769e4c61d98d'
  AND created_at=1791224176523;
-- Esperado: 93 / 1791224176523 / 1. Registrar MIGRAÇÃO LIBERADA na Issue #34.
-- Isto NÃO certifica a execução histórica de 0105–0129 nem autoriza carga Hop.
