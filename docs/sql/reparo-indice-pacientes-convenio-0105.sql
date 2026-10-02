-- REPARO OPERACIONAL PENDENTE DE REVISÃO: NÃO EXECUTAR COMO MIGRAÇÃO AUTOMÁTICA.
-- A 0105 já contém este CREATE INDEX e o schema atual já declara o índice;
-- este arquivo corrige somente a ausência física constatada no banco do Portal.
-- Usar somente após reserva MIGRAÇÃO RESERVADA na tarefa Collab, PR revisada,
-- ensaio/backup aplicável e janela de migração única. Não executar db:migrate.
-- Não executar o CREATE INDEX se a inspeção abaixo indicar outro índice
-- com a mesma primeira coluna ou se a definição física tiver mudado.

-- FASE 0 (somente leitura; deve existir exatamente a coluna convenio_id):
SELECT column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'pacientes'
  AND column_name = 'convenio_id';

-- FASE 0 (somente leitura; deve estar AUSENTE o índice esperado e equivalente):
SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_in_order
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'pacientes'
GROUP BY index_name
ORDER BY index_name;

-- FASE 0 (somente leitura; registrar contagem/último marco antes da janela):
SELECT COUNT(*) AS migrations_count, MAX(created_at) AS last_created_at
FROM __drizzle_migrations;

-- FASE 1: somente sob as pré-condições verificadas e revisão formal.
-- Esta instrução é a cópia literal do índice previsto em 0105.
CREATE INDEX `idx_pacientes_convenio` ON `pacientes` (`convenio_id`);

-- FASE 2 (somente leitura; exigir uma linha, seq_in_index=1,
-- column_name='convenio_id', non_unique=1):
SELECT index_name, seq_in_index, column_name, non_unique
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'pacientes'
  AND index_name = 'idx_pacientes_convenio';

-- FASE 2: confirmar que COUNT/MAX do journal não mudou; este arquivo
-- não insere registros em __drizzle_migrations e não marca 0105 aplicada.
SELECT COUNT(*) AS migrations_count, MAX(created_at) AS last_created_at
FROM __drizzle_migrations;
