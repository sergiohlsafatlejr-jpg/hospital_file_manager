import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { getTableName } from 'drizzle-orm';
import { stagingAtendimentosParadosIadHop, stagingAtendimentosParadosIad, stagingFaturadoRecebidoIad } from '../drizzle/schema-integracao';
import { resolverTabelaStaging } from './atendimentosParadosService';

const sql = readFileSync(new URL('../drizzle/0134_curly_saracen.sql', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../drizzle/meta/0134_snapshot.json', import.meta.url), 'utf8'));
const before = JSON.parse(readFileSync(new URL('../drizzle/meta/0133_snapshot.json', import.meta.url), 'utf8'));
const atendimento = getTableConfig(stagingAtendimentosParadosIadHop);
const financeiro = getTableConfig(stagingFaturadoRecebidoIad);
const names = [
  'nomeconv', 'codconv', 'mesprod', 'numfatura', 'codrecur', 'tipoproc', 'protocolo',
  'numconta', 'guiacobra', 'aihguia', 'descricao', 'matricula', 'data', 'dataint', 'datasai',
  'procdisco', 'codproprio', 'codgrufi', 'descricao_1', 'funcaotiss', 'receber', 'codcc',
  'nomecc', 'prestexe', 'nomeprest', 'quantidade', 'vl_faturado', 'vl_recebido', 'vl_receb_a_maior', 'vl_total_recebido',
  'vl_aberto', 'vl_glosas', 'gl_recurso', 'gl_aceita', 'gl_analise', 'gl_recuperada',
  'codtiss', 'descmotivo', 'codrecur_1', 'complrecur', 'tipoatend', 'vl_unitario', 'estabelecimentos_id',
];
function columnsInDdl(name: string) {
  const body = sql.match(new RegExp('CREATE TABLE `' + name + '` \\(([\\s\\S]*?)\\n\\);'))?.[1];
  if (!body) throw new Error('DDL ausente');
  return Object.fromEntries([...body.matchAll(/`([^`]+)`\s+([a-z]+(?:\(\d+(?:,\d+)?\))?)/g)].map(m => [m[1], m[2]]));
}

describe('0134: estruturas brutas IAD preservando normalizada', () => {
  it('cria atendimento com as 13 colunas físicas Hop, datas civis e unidade explícita', () => {
    expect(atendimento.name).toBe('stagion_atendimentos_parados_iad');
    expect(columnsInDdl(atendimento.name)).toEqual({
      numatend: 'int', codtipsai: 'varchar(2)', nomeplaco: 'varchar(30)', nomepac: 'varchar(50)',
      carater: 'varchar(2)', datatend: 'datetime', datasai: 'datetime', tipoatend: 'char(1)',
      codserv: 'varchar(30)', procprin: 'varchar(10)', codcc_destino: 'varchar(6)',
      tipoatendimentodescricao: 'longtext', Estabelecimentos_id: 'tinytext',
    });
    expect(atendimento.columns).toHaveLength(13);
    for (const name of ['datatend', 'datasai']) {
      const column = atendimento.columns.find(c => c.name === name);
      expect(column?.columnType).toBe('MySqlDateTimeString');
      expect(column?.dataType).toBe('string');
    }
  });
  it('cria exatamente os 43 campos físicos financeiros com precisões solicitadas na 0133', () => {
    expect(financeiro.name).toBe('stagion_faturado_recebido_iad');
    expect(financeiro.columns.map(c => c.name)).toEqual(names);
    const types = columnsInDdl(financeiro.name);
    for (const name of ['quantidade', 'vl_unitario']) expect(types[name]).toBe('decimal(15,4)');
    for (const name of names.filter(x => x.startsWith('vl_') && x !== 'vl_unitario' || x.startsWith('gl_'))) {
      expect(types[name], name).toBe('decimal(15,2)');
    }
    expect(types.aihguia).toBe('varchar(50)');
    expect(types.complrecur).toBe('text');
    expect(types.estabelecimentos_id).toBe('varchar(100)');
    expect(financeiro.indexes).toHaveLength(0);
    expect(financeiro.columns.every(c => !c.notNull && !c.primary)).toBe(true);
  });
  it('preserva a tabela antiga e seu pipeline normalizado, sem apontar para o pouso bruto', () => {
    expect(getTableName(stagingAtendimentosParadosIad)).toBe('stagion_atendimentos_parados_iad_normalizada');
    expect(getTableName(resolverTabelaStaging('iad'))).toBe('stagion_atendimentos_parados_iad_normalizada');
    expect(sql).toContain('RENAME TABLE `stagion_atendimentos_parados_iad` TO `stagion_atendimentos_parados_iad_normalizada`;');
    const old = before.tables.stagion_atendimentos_parados_iad;
    const preserved = snapshot.tables.stagion_atendimentos_parados_iad_normalizada;
    // A PK física MySQL continua PRIMARY; o snapshot nomeia a PK pelo nome lógico da tabela.
    expect(preserved).toEqual({ ...old, name: 'stagion_atendimentos_parados_iad_normalizada', compositePrimaryKeys: preserved.compositePrimaryKeys });
    expect(Object.values(preserved.compositePrimaryKeys).map((pk: any) => pk.columns))
      .toEqual(Object.values(old.compositePrimaryKeys).map((pk: any) => pk.columns));
  });
  it('tem somente rename e duas criações, sem exclusão, conversão, publicação ou outra unidade', () => {
    const commands = sql.replace(/^--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean);
    expect(commands).toHaveLength(3);
    expect(commands[0]).toMatch(/^RENAME TABLE/);
    expect(commands.slice(1).every(x => x.startsWith('CREATE TABLE'))).toBe(true);
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE|INSERT|UPDATE|MODIFY)\b/i);
    expect(sql).not.toContain('atendimentos_unificados');
    for (const [name, table] of Object.entries(before.tables)) {
      if (name !== 'stagion_atendimentos_parados_iad') expect(snapshot.tables[name], name).toEqual(table);
    }
  });
  it('SQL e snapshot final concordam nos nomes e tipos das novas tabelas', () => {
    for (const table of [atendimento, financeiro]) {
      expect(columnsInDdl(table.name)).toEqual(Object.fromEntries(Object.entries(snapshot.tables[table.name].columns).map(([name, c]) => [name, (c as { type: string }).type])));
    }
  });
});
