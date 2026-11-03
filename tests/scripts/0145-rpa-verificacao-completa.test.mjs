import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  load0145VerificationContract,
  assert0145LedgerBaseline,
  assert0145PhysicalStage,
  assert0145CommittedLedger,
} from '../../scripts/migrations/0145-rpa-verificacao-completa.mjs';

const contract = await load0145VerificationContract();
const previous = JSON.parse(await readFile(new URL('../../drizzle/meta/0144_snapshot.json', import.meta.url), 'utf8'));
function catalog(snapshot, tableNames) {
  const tables = tableNames.map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: 'BASE TABLE' }));
  const columns = tableNames.flatMap(table => {
    const definitions = snapshot.tables[table].columns;
    const names = table === 'credenciais_portais' ? [...Object.keys(previous.tables[table].columns), ...Object.keys(definitions).filter(name => !previous.tables[table].columns[name])] : Object.keys(definitions);
    return names.map((name, index) => {
      const c = definitions[name];
      return { TABLE_NAME: table, COLUMN_NAME: c.name, ORDINAL_POSITION: index + 1, COLUMN_TYPE: c.type,
        IS_NULLABLE: c.notNull ? 'NO' : 'YES', COLUMN_DEFAULT: c.default ?? null,
        EXTRA: `${c.autoincrement ? 'auto_increment' : ''}${c.onUpdate ? ' on update CURRENT_TIMESTAMP' : ''}`.trim() };
    });
  });
  const indexes = tableNames.flatMap(table => {
    const t = snapshot.tables[table];
    return [...Object.values(t.compositePrimaryKeys).map(i => ({ ...i, name: 'PRIMARY', isUnique: true })), ...Object.values(t.indexes)]
      .flatMap(i => i.columns.map((COLUMN_NAME, index) => ({ TABLE_NAME: table, INDEX_NAME: i.name, COLUMN_NAME, SEQ_IN_INDEX: index + 1, NON_UNIQUE: i.isUnique ? 0 : 1 })));
  });
  return { tables, columns, indexes, foreignKeys: [] };
}
const before = catalog(previous, ['credenciais_portais']);
const stageOne = catalog(contract.snapshot, ['credenciais_portais']);
const final = catalog(contract.snapshot, ['credenciais_portais', 'fila_envio_xml_portal']);
const ledger = [{ id: 144, ...contract.previousMarker }];

test('contrato encadeado e etapas completas são aceitos somente com metadados compatíveis', () => {
  assert0145LedgerBaseline(ledger, contract);
  assert.deepEqual(assert0145PhysicalStage(before, stageOne, contract, 1), { ok: true, completedStatements: 1 });
  assert.deepEqual(assert0145PhysicalStage(before, final, contract, 2), { ok: true, completedStatements: 2 });
});

test('ausência ou corrupção do marcador anterior bloqueia', () => {
  assert.throws(() => assert0145LedgerBaseline([], contract), /0144_exact_marker_required/);
  assert.throws(() => assert0145LedgerBaseline([{ id: 144, ...contract.previousMarker, hash: 'invalid' }], contract), /0144_exact_marker_required/);
});

test('marcador145 conflitante antes da aplicação bloqueia', () => {
  assert.throws(() => assert0145LedgerBaseline([...ledger, { id: 145, ...contract.marker, hash: 'invalid' }], contract), /already_present_or_conflicting/);
});

for (const [label, mutate] of [
  ['nome', c => { c.COLUMN_NAME = 'unexpected_column'; }],
  ['tipo', c => { c.COLUMN_TYPE = 'varchar(2)'; }],
  ['nulidade', c => { c.IS_NULLABLE = 'YES'; }],
  ['default', c => { c.COLUMN_DEFAULT = 'incorrect'; }],
  ['auto_increment', c => { c.EXTRA = ''; }],
]) {
  test(`divergência em ${label} da fila bloqueia mesmo preservando contagem`, () => {
    const broken = structuredClone(final);
    mutate(broken.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'id'));
    assert.throws(() => assert0145PhysicalStage(before, broken, contract, 2), /queue_column_invalid/);
  });
}

test('ausência de PK ou índices secundários bloqueia', () => {
  for (const name of ['PRIMARY', 'idx_fila_xml_status_estab', 'idx_fila_xml_hash_estab', 'idx_fila_xml_fabrica_conta']) {
    const broken = structuredClone(final);
    broken.indexes = broken.indexes.filter(i => i.TABLE_NAME !== 'fila_envio_xml_portal' || i.INDEX_NAME !== name);
    assert.throws(() => assert0145PhysicalStage(before, broken, contract, 2), /queue_index_contract_invalid/);
  }
});

test('mudança de unicidade ou ordem do índice bloqueia', () => {
  const broken = structuredClone(final);
  for (const i of broken.indexes.filter(i => i.TABLE_NAME === 'fila_envio_xml_portal' && i.INDEX_NAME === 'idx_fila_xml_hash_estab')) i.NON_UNIQUE = 0;
  assert.throws(() => assert0145PhysicalStage(before, broken, contract, 2), /queue_index_contract_invalid/);
});

test('coluna preexistente não pode mudar de posição ou contrato', () => {
  const broken = structuredClone(stageOne);
  broken.columns.find(c => c.TABLE_NAME === 'credenciais_portais' && !['codigoPrestadorOperadora', 'registroAns', 'parametrosExtras', 'statusCredencial'].includes(c.COLUMN_NAME)).ORDINAL_POSITION += 1;
  assert.throws(() => assert0145PhysicalStage(before, broken, contract, 1), /existing_column_changed/);
});

test('on update esperado é obrigatório', () => {
  const broken = structuredClone(final);
  broken.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'updated_at').EXTRA = '';
  assert.throws(() => assert0145PhysicalStage(before, broken, contract, 2), /queue_column_invalid/);
});

test('FK inesperada da fila bloqueia', () => {
  const broken = structuredClone(final);
  broken.foreignKeys.push({ TABLE_NAME: 'fila_envio_xml_portal', CONSTRAINT_NAME: 'unexpected' });
  assert.throws(() => assert0145PhysicalStage(before, broken, contract, 2), /unexpected_queue_foreign_key/);
});

test('marcador deve ser único, par exato e preservar histórico', () => {
  const correct = [...ledger, { id: 145, ...contract.marker }];
  assert.deepEqual(assert0145CommittedLedger(ledger, correct, contract), { ok: true, exactMarkerCount: 1 });
  assert.throws(() => assert0145CommittedLedger(ledger, [...ledger, { id: 145, ...contract.marker, hash: 'invalid' }], contract), /exact_marker_required/);
  assert.throws(() => assert0145CommittedLedger(ledger, [...correct, { id: 146, ...contract.marker }], contract), /ledger_history_changed/);
  assert.throws(() => assert0145CommittedLedger(ledger, [{ ...ledger[0], hash: 'changed' }, correct[1]], contract), /ledger_history_changed/);
});
