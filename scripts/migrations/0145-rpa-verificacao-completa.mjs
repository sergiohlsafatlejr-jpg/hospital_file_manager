import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Verificação complementar pura. Não conecta, não executa DDL/DML e não concede autorização. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tag = '0145_rpa_fila_envio_xml_portal';
const credentialColumns = ['codigoPrestadorOperadora', 'registroAns', 'parametrosExtras', 'statusCredencial'];
const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
function defaultOf(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (/^'.*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  if (/^\(?current_timestamp(?:\(\))?\)?$/i.test(text) || /^\(now\(\)\)$/i.test(text)) return 'current_timestamp';
  return text;
}
function typeOf(value) { return norm(value).replace(/\b(int|bigint|smallint|tinyint|mediumint)\(\d+\)/g, '$1'); }
function columnsOf(rows) {
  return rows.map(row => ({
    table: row.TABLE_NAME, name: row.COLUMN_NAME, position: Number(row.ORDINAL_POSITION),
    type: typeOf(row.COLUMN_TYPE), nullable: norm(row.IS_NULLABLE) === 'yes', default: defaultOf(row.COLUMN_DEFAULT),
    extra: norm(row.EXTRA),
  })).sort((a, b) => `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`));
}
function indexesOf(rows) {
  const records = new Map();
  for (const row of rows) {
    const key = `${row.TABLE_NAME}:${row.INDEX_NAME}`;
    const record = records.get(key) ?? { table: row.TABLE_NAME, name: row.INDEX_NAME, unique: Number(row.NON_UNIQUE) === 0, columns: [] };
    if (record.unique !== (Number(row.NON_UNIQUE) === 0)) throw new Error('0145_index_metadata_invalid');
    record.columns.push({ name: row.COLUMN_NAME, seq: Number(row.SEQ_IN_INDEX) });
    records.set(key, record);
  }
  return [...records.values()].map(record => ({ ...record, columns: record.columns.sort((a, b) => a.seq - b.seq).map(x => x.name) }))
    .sort((a, b) => `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`));
}
function checkColumn(actual, expected) {
  return actual && actual.name === expected.name && actual.type === typeOf(expected.type)
    && actual.nullable === !expected.notNull && actual.default === defaultOf(expected.default)
    && (actual.extra.includes('auto_increment') === Boolean(expected.autoincrement))
    && (actual.extra.includes('on update') === Boolean(expected.onUpdate));
}
function requireTrue(value, reason) { if (!value) throw new Error(reason); }

export async function load0145VerificationContract() {
  const [snapshot, previous, journal, sql] = await Promise.all([
    readFile(path.join(root, 'drizzle/meta/0145_snapshot.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'drizzle/meta/0144_snapshot.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'drizzle/meta/_journal.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'drizzle/0145_rpa_fila_envio_xml_portal.sql')),
  ]);
  requireTrue(snapshot.prevId === previous.id, '0145_snapshot_chain_invalid');
  const entries = journal.entries.filter(entry => entry.idx === 145 || entry.tag === tag);
  requireTrue(entries.length === 1 && entries[0].idx === 145 && entries[0].tag === tag, '0145_journal_invalid');
  const previousEntry = journal.entries.find(entry => entry.idx === 144);
  requireTrue(Boolean(previousEntry), '0144_journal_missing');
  const previousSql = await readFile(path.join(root, `drizzle/${previousEntry.tag}.sql`));
  return {
    snapshot,
    marker: { created_at: entries[0].when, hash: createHash('sha256').update(sql).digest('hex') },
    previousMarker: { created_at: previousEntry.when, hash: createHash('sha256').update(previousSql).digest('hex') },
  };
}

export function assert0145LedgerBaseline(ledger, contract) {
  const exact = ledger.filter(row => String(row.created_at) === String(contract.previousMarker.created_at) && row.hash === contract.previousMarker.hash);
  requireTrue(exact.length === 1, '0144_exact_marker_required');
  requireTrue(!ledger.some(row => row.hash === contract.marker.hash || String(row.created_at) === String(contract.marker.created_at)), '0145_marker_already_present_or_conflicting');
}

/** raw catalog: {tables,columns,indexes,foreignKeys}; indexes MUST include NON_UNIQUE, columns MUST include EXTRA. */
export function assert0145PhysicalStage(before, observed, contract, completedStatements) {
  requireTrue(completedStatements === 1 || completedStatements === 2, '0145_stage_invalid');
  const expectedTables = completedStatements === 1 ? ['credenciais_portais'] : ['credenciais_portais', 'fila_envio_xml_portal'];
  const tables = observed.tables.map(row => row.TABLE_NAME).sort();
  requireTrue(same(tables, expectedTables) && observed.tables.every(row => norm(row.TABLE_TYPE) === 'base table'), '0145_table_contract_invalid');
  const initial = columnsOf(before.columns);
  const current = columnsOf(observed.columns);
  const byKey = new Map(current.map(column => [`${column.table}:${column.name}`, column]));
  for (const old of initial) requireTrue(same(old, byKey.get(`${old.table}:${old.name}`)), '0145_existing_column_changed');
  const credentials = contract.snapshot.tables.credenciais_portais;
  for (const name of credentialColumns) requireTrue(checkColumn(byKey.get(`credenciais_portais:${name}`), credentials.columns[name]), '0145_credential_column_invalid');
  requireTrue(current.filter(column => column.table === 'credenciais_portais').length === initial.filter(column => column.table === 'credenciais_portais').length + 4, '0145_credential_column_count_invalid');
  const priorIndexes = indexesOf(before.indexes).filter(index => index.table === 'credenciais_portais');
  requireTrue(same(priorIndexes, indexesOf(observed.indexes).filter(index => index.table === 'credenciais_portais')), '0145_existing_index_changed');
  requireTrue(same(before.foreignKeys ?? [], (observed.foreignKeys ?? []).filter(row => row.TABLE_NAME === 'credenciais_portais')), '0145_existing_foreign_key_changed');
  if (completedStatements === 2) {
    const table = contract.snapshot.tables.fila_envio_xml_portal;
    const actual = current.filter(column => column.table === 'fila_envio_xml_portal');
    requireTrue(actual.length === Object.keys(table.columns).length, '0145_queue_column_count_invalid');
    for (const column of Object.values(table.columns)) requireTrue(checkColumn(byKey.get(`fila_envio_xml_portal:${column.name}`), column), '0145_queue_column_invalid');
    const expectedIndexes = [
      ...Object.values(table.compositePrimaryKeys).map(index => ({ table: 'fila_envio_xml_portal', name: 'PRIMARY', unique: true, columns: index.columns })),
      ...Object.values(table.indexes).map(index => ({ table: 'fila_envio_xml_portal', name: index.name, unique: Boolean(index.isUnique), columns: index.columns })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    requireTrue(same(expectedIndexes, indexesOf(observed.indexes).filter(index => index.table === 'fila_envio_xml_portal')), '0145_queue_index_contract_invalid');
    requireTrue(!(observed.foreignKeys ?? []).some(row => row.TABLE_NAME === 'fila_envio_xml_portal'), '0145_unexpected_queue_foreign_key');
  }
  return { ok: true, completedStatements };
}

export function assert0145CommittedLedger(baseline, observed, contract) {
  const introduced = observed.filter(row => !baseline.some(old => same(old, row)));
  requireTrue(baseline.every(row => observed.some(current => same(current, row))) && observed.length === baseline.length + 1, '0145_ledger_history_changed');
  requireTrue(introduced.length === 1 && introduced[0].hash === contract.marker.hash && String(introduced[0].created_at) === String(contract.marker.created_at), '0145_exact_marker_required');
  return { ok: true, exactMarkerCount: 1 };
}
