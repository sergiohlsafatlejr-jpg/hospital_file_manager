import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { stagionFaturadoUrologico } from '../drizzle/schema-integracao';

const requestedFields = [
  'id', 'importacaoId', 'estabelecimentoId', 'numeroConta', 'numeroGuia',
  'convenioNome', 'pacienteNome', 'codigoItem', 'descricaoItem', 'quantidade',
  'valorUnitario', 'valorTotal', 'dataExecucao', 'competencia', 'rawData',
  'processado', 'criadoEm',
];
const table = getTableConfig(stagionFaturadoUrologico);
const fields = new Map(table.columns.map(column => [column.name, column]));
const sql = readFileSync(new URL('../drizzle/0132_nostalgic_wendigo.sql', import.meta.url), 'utf8');

describe('staging de itens faturados Hop HUP', () => {
  it('segue os 17 campos e a ordem mostrada no modelo de itens faturados', () => {
    expect(table.name).toBe('stagion_faturado_urologico');
    expect(table.columns.map(column => column.name)).toEqual(requestedFields);
    expect(fields.get('id')?.primary).toBe(true);
    expect(fields.get('estabelecimentoId')?.notNull).toBe(true);
    expect(fields.get('dataExecucao')?.columnType).toBe('MySqlDateTime');
    expect(fields.get('rawData')?.columnType).toBe('MySqlJson');
  });

  it('usa DECIMAL e preserva múltiplos itens de uma mesma conta', () => {
    for (const name of ['quantidade', 'valorUnitario', 'valorTotal']) {
      const field = fields.get(name) as { columnType?: string; precision?: number; scale?: number } | undefined;
      expect(field?.columnType, name).toBe('MySqlDecimal');
      expect(field?.precision, name).toBe(12);
      expect(field?.scale, name).toBe(4);
    }
    expect(table.indexes.map(ix => ({ name: ix.config.name, fields: ix.config.columns.map(c => c.name), unique: ix.config.unique })))
      .toEqual([
        { name: 'idx_hup_faturado_estab_importacao', fields: ['estabelecimentoId', 'importacaoId'], unique: false },
        { name: 'idx_hup_faturado_estab_conta', fields: ['estabelecimentoId', 'numeroConta'], unique: false },
      ]);
    expect(table.uniqueConstraints).toHaveLength(0);
  });

  it('0132 só cria a nova tabela e dois índices, sem tocar a 0131 ou dados', () => {
    expect((sql.match(/^CREATE TABLE/gm) ?? [])).toHaveLength(1);
    expect((sql.match(/^CREATE INDEX/gm) ?? [])).toHaveLength(2);
    expect(sql).toContain('CREATE TABLE `stagion_faturado_urologico`');
    expect(sql).not.toContain('stagion_faturado_recebido_urologico');
    expect(sql).not.toMatch(/\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b/i);
    expect([...sql.matchAll(/^\s+`([^`]+)`\s/gm)].map(match => match[1])).toEqual(requestedFields);
  });
});
