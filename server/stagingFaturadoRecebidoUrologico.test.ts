import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { stagingFaturadoRecebidoUrologico } from '../drizzle/schema-integracao';

const sourceFields = [
  'nomeconv', 'codconv', 'mesprod', 'numfatura', 'codrecur', 'tipoproc', 'protocolo',
  'numconta', 'guiacobra', 'aihguia', 'descricao', 'matricula', 'data', 'dataint',
  'datasai', 'procdisco', 'codproprio', 'codgrufi', 'descricao_1', 'funcaotiss',
  'receber', 'codcc', 'nomecc', 'prestexe', 'nomeprest', 'codtiss', 'descmotivo',
  'codrecur_1', 'complrecur', 'tipoatend', 'quantidade', 'vl_faturado',
  'vl_recebido', 'vl_receb_a_maior', 'vl_total_recebido', 'vl_aberto', 'vl_glosas',
  'gl_recurso', 'gl_aceita', 'gl_analise', 'gl_recuperada', 'vl_unitario',
  'estabelecimentos_id',
] as const;

const money = [
  'vl_faturado', 'vl_recebido', 'vl_receb_a_maior', 'vl_total_recebido',
  'vl_aberto', 'vl_glosas', 'gl_recurso', 'gl_aceita', 'gl_analise',
  'gl_recuperada', 'vl_unitario',
];

const table = getTableConfig(stagingFaturadoRecebidoUrologico);
const columns = new Map(table.columns.map(column => [column.name, column]));
const migrationSql = readFileSync(new URL('../drizzle/0131_neat_johnny_storm.sql', import.meta.url), 'utf8');
const typeFixSql = readFileSync(new URL('../drizzle/0133_clammy_sebastian_shaw.sql', import.meta.url), 'utf8');

describe('staging física de faturado/recebido HUP', () => {
  it('expõe exatamente os 43 campos informados, sem fundir cabeçalhos repetidos', () => {
    expect(table.name).toBe('stagion_faturado_recebido_urologico');
    expect(sourceFields).toHaveLength(43);
    expect(new Set(sourceFields).size).toBe(43);
    expect(table.columns.map(column => column.name)).toEqual(['id', 'lote_ref', 'capturado_em', ...sourceFields]);
    expect(columns.has('descricao')).toBe(true);
    expect(columns.has('descricao_1')).toBe(true);
    expect(columns.has('codrecur')).toBe(true);
    expect(columns.has('codrecur_1')).toBe(true);
  });

  it('mantém os índices declarados, sem impor unicidade incorreta à conta', () => {
    expect(columns.get('estabelecimentos_id')?.notNull).toBe(false);
    expect(columns.get('estabelecimentos_id')?.columnType).toBe('MySqlVarChar');
    expect(columns.get('id')?.primary).toBe(true);
    expect(columns.get('capturado_em')?.notNull).toBe(true);
    expect(table.indexes.map(index => ({
      name: index.config.name,
      fields: index.config.columns.map(column => column.name),
      unique: index.config.unique,
    }))).toEqual([
      { name: 'idx_hup_fat_unidade_lote', fields: ['estabelecimentos_id', 'lote_ref'], unique: false },
      { name: 'idx_hup_fat_unidade_mes', fields: ['estabelecimentos_id', 'mesprod'], unique: false },
      { name: 'idx_hup_fat_unidade_conta', fields: ['estabelecimentos_id', 'numconta'], unique: false },
    ]);
    expect(table.uniqueConstraints).toHaveLength(0);
  });

  it('migração cria só a tabela e seus índices, sem DML ou ALTER/DROP', () => {
    const create = migrationSql.split('--> statement-breakpoint')[0];
    expect((migrationSql.match(/CREATE TABLE/g) ?? [])).toHaveLength(1);
    expect((migrationSql.match(/CREATE INDEX/g) ?? [])).toHaveLength(3);
    expect(migrationSql).not.toMatch(/\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b/i);
    expect([...create.matchAll(/^\s+`([^`]+)`\s/gm)].map(match => match[1]))
      .toEqual(['id', 'lote_ref', 'capturado_em', ...sourceFields]);
    expect(create).toMatch(/`estabelecimentos_id` int NOT NULL/);
    expect(create).toMatch(/`capturado_em` timestamp NOT NULL DEFAULT \(now\(\)\)/);
  });

  it('preserva precisão dos valores para validação antes de qualquer relatório', () => {
    for (const name of money) {
      expect(columns.get(name)?.columnType, name).toBe('MySqlDecimal');
      expect((columns.get(name) as { precision?: number })?.precision, name).toBe(15);
      expect((columns.get(name) as { scale?: number })?.scale, name).toBe(name === 'vl_unitario' ? 4 : 2);
    }
    expect((columns.get('quantidade') as { precision?: number })?.precision).toBe(15);
    expect((columns.get('quantidade') as { scale?: number })?.scale).toBe(4);
    expect((columns.get('aihguia') as { length?: number })?.length).toBe(50);
    expect((columns.get('estabelecimentos_id') as { length?: number })?.length).toBe(100);
    for (const name of ['data', 'dataint', 'datasai', 'mesprod']) {
      expect(columns.get(name)?.columnType, name).toBe('MySqlVarChar');
    }
  });

  it('0133 altera exatamente os 15 campos enviados, sem mudar outras tabelas ou registros', () => {
    const statements = typeFixSql.split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean);
    const changes = [...typeFixSql.matchAll(/ALTER TABLE `stagion_faturado_recebido_urologico` MODIFY COLUMN `([^`]+)` ([\w(),]+)/g)]
      .map(x => [x[1], x[2]] as const);
    const altered = changes.map(x => x[0]);
    expect(altered).toEqual([
      'aihguia', 'quantidade', 'vl_faturado', 'vl_recebido', 'vl_receb_a_maior',
      'vl_total_recebido', 'vl_aberto', 'vl_glosas', 'gl_recurso', 'gl_aceita',
      'gl_analise', 'gl_recuperada', 'vl_unitario', 'estabelecimentos_id', 'complrecur',
    ]);
    expect(statements).toHaveLength(15);
    const expectedTypes: Record<string, string> = {
      aihguia: 'varchar(50)', quantidade: 'decimal(15,4)',
      vl_unitario: 'decimal(15,4)', estabelecimentos_id: 'varchar(100)',
      complrecur: 'text',
    };
    for (const name of money.filter(x => x !== 'vl_unitario')) expectedTypes[name] = 'decimal(15,2)';
    expect(Object.fromEntries(changes)).toEqual(expectedTypes);
    expect(typeFixSql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE)\b\s+(?:TABLE|FROM|INTO|INDEX)/i);
  });
});
