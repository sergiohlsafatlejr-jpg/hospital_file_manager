-- Custom SQL migration file, put your code below! --
-- Sync Drizzle schema with existing database tables
-- integ_faturado table already exists (created by Warleine sync)
-- Legacy columns added to faturamento_tiss and recebimento_tiss schemas to match DB
-- No DDL needed - this migration just marks the schema as synced
SELECT 1;