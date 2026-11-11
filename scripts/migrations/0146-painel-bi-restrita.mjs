import { createHash, X509Certificate } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, domainToASCII } from 'node:url';
import path from 'node:path';

// Import inerte: nenhum arquivo, Git, ambiente, conexão ou comando SQL é lido/executado.
// Não importa nem reaplica executores 0145. Não há CLI, descoberta de alvo ou retry.
export const MIGRATION_TAG = '0146_painel_bi_personalizado';
export const MIGRATION_TIMESTAMP = 1794400248375;
export const EXPECTED_SQL_SHA256 = '75532edc571deec6acd128f126a4a41b75d704d8de268d358249bd6a161dfc30';
export const MAX_PREFLIGHT_AGE_MS = 300000;
export const REVIEWED_FILES = Object.freeze([
  'scripts/migrations/0146-painel-bi-restrita.mjs',
  'tests/scripts/0146-painel-bi-restrita.test.mjs',
  'docs/migrations/0146-painel-bi-restrita.md',
]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = promisify(execFile);
const table = 'estabelecimento_bi_personalizado';
// Pins extraídos dos artefatos integrados em 4543b484a54be99de5a621c2a95cb29013fe1c91.
const pins = Object.freeze({
  'drizzle/0144_fabrica_faturamento_safatle.sql': '8539b8ac532a578d39345403c5b2074f922957438be06ca53854162a759ba0b8',
  'drizzle/0145_rpa_fila_envio_xml_portal.sql': 'cde762c7cfdb9626ec948ba22ffd069790ff8e974b3fcc469d428a9022b215c1',
  'drizzle/0146_painel_bi_personalizado.sql': EXPECTED_SQL_SHA256,
  'drizzle/meta/0144_snapshot.json': '0547cc08ff6a496ab9002e7a00d1567d0e8c0a15849ddc91dd1e9205c2e6b0ef',
  'drizzle/meta/0145_snapshot.json': 'f1e28098da86bf5cf152122330f0eb7038bafa43ab0504e28f71b653350fc7cf',
  'drizzle/meta/0146_snapshot.json': '5b1680148c9715694a1f5304f082acf285552cfea269836f43a7d10758d1645d',
  'drizzle/meta/_journal.json': 'b436eab13fe8d161f44b33b8e59e99429debf4748f813004491f43ceb331f00e',
  'drizzle/schema.ts': '88e52a1b4fce3cf03b3dbf293a5c81b1e6b9f2b24aa14ff127b158755b895542',
  'drizzle/schema-integracao.ts': '33bfa5020b35f326100f2ca479086537d8f5a834efef0abc7dc4fd5c37de7889',
  'scripts/migrations/0145-rpa-execucao-verificada.mjs': '28df3fe31eceedd2e5b1fc034a68e3a19b35b82cf63009d9bcc7a48674c8789e',
});
const legacyDigest = 'ddba1fe00d43958df2e585b43887c52b495736cce7a508279518b9dcd9bbb452';
const marker0144 = Object.freeze({ hash: pins['drizzle/0144_fabrica_faturamento_safatle.sql'], created_at: 1793303472606 });
const marker0145 = Object.freeze({ hash: pins['drizzle/0145_rpa_fila_envio_xml_portal.sql'], created_at: 1793720945369 });
const marker = Object.freeze({ hash: EXPECTED_SQL_SHA256, created_at: MIGRATION_TIMESTAMP });
const methods = ['query', 'execute', 'getIdentity', 'close', 'beginTransaction', 'commit', 'rollback'];
const preflights = new WeakMap();
const activeTargets = new Set();
const attemptedTargets = new Set();
let firstAttestation;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);
const stable = value => typeof value === 'bigint' ? String(value) : Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,159}$/.test(value);
function need(value, code) { if (!value) throw new Error(code); }
function rows(result) {
  const value = result?.rows ?? result;
  need(Array.isArray(value) && value.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'metadata_invalid');
  return copy(value);
}
function report(ok, phase, reason, state = {}) {
  const ddlUncertain = (state.ddlCount ?? 0) !== (state.ddlVerifiedCount ?? 0);
  const ledgerUncertain = Boolean(state.markerAttempted && !state.postCommitVerified);
  return Object.freeze({ ok, phase, reason, ddlCount: state.ddlCount ?? 0, ddlVerifiedCount: state.ddlVerifiedCount ?? 0,
    ddlOutcomeUncertain: ddlUncertain, journalOutcomeUncertain: ledgerUncertain,
    uncertain: ddlUncertain || ledgerUncertain, noRetry: true, retryAllowed: false,
    tables: 1, columns: 12, primaryKeys: 1, uniqueIndexes: 1 });
}
function hostOf(value) {
  need(typeof value === 'string' && value.length <= 253 && !/[\s/:@]/.test(value), 'target_invalid');
  const host = domainToASCII(value.toLowerCase().replace(/\.$/, ''));
  need(host && host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)), 'target_invalid');
  return host;
}
function targetOf(value) {
  need(value && ref(value.reference) && value.serverProduct === 'tidb'
    && typeof value.databaseName === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value.databaseName)
    && typeof value.serverVersion === 'string' && /tidb/i.test(value.serverVersion)
    && digest(value.certificateFingerprint) && typeof value.certificatePem === 'string', 'target_invalid');
  const host = hostOf(value.host), cert = new X509Certificate(value.certificatePem), now = Date.now();
  need(sha(cert.raw) === value.certificateFingerprint && cert.checkHost(host)
    && Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo), 'certificate_invalid');
  return { reference: value.reference, host, databaseName: value.databaseName, serverProduct: value.serverProduct,
    serverVersion: value.serverVersion, certificateFingerprint: value.certificateFingerprint };
}
async function attest() {
  const command = args => git('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  const revision = String((await command(['rev-parse', 'HEAD'])).stdout).trim();
  need(/^[a-f0-9]{40}$/.test(revision), 'revision_invalid');
  // Inclui untracked; novos scripts ainda não versionados impedem uso operacional.
  need(String((await command(['status', '--porcelain=v1', '--untracked-files=all'])).stdout).trim() === '', 'git_not_clean');
  const fileSha256 = {}, buffers = {};
  for (const relative of [...Object.keys(pins), ...REVIEWED_FILES]) {
    const bytes = await readFile(path.join(root, relative));
    const committed = (await command(['show', `${revision}:${relative}`])).stdout;
    need(bytes.equals(Buffer.from(committed)), 'artifact_not_in_revision');
    fileSha256[relative] = sha(bytes); buffers[relative] = bytes;
    need(!pins[relative] || fileSha256[relative] === pins[relative], 'immutable_artifact_changed');
  }
  need(String((await command(['rev-parse', 'HEAD'])).stdout).trim() === revision
    && String((await command(['status', '--porcelain=v1', '--untracked-files=all'])).stdout).trim() === '', 'git_changed');
  const journal = JSON.parse(buffers['drizzle/meta/_journal.json']);
  for (const [idx, tag, when, hash] of [[144, '0144_fabrica_faturamento_safatle', marker0144.created_at, marker0144.hash],
    [145, '0145_rpa_fila_envio_xml_portal', marker0145.created_at, marker0145.hash],
    [146, MIGRATION_TAG, MIGRATION_TIMESTAMP, EXPECTED_SQL_SHA256]]) {
    const entries = journal.entries.filter(e => e.idx === idx || e.tag === tag);
    need(entries.length === 1 && entries[0].idx === idx && entries[0].tag === tag && entries[0].when === when
      && fileSha256[`drizzle/${tag}.sql`] === hash, 'integrated_marker_invalid');
  }
  const snapshot = JSON.parse(buffers['drizzle/meta/0146_snapshot.json']);
  need(snapshot.prevId === JSON.parse(buffers['drizzle/meta/0145_snapshot.json']).id, 'snapshot_chain_invalid');
  const sql = buffers[`drizzle/${MIGRATION_TAG}.sql`].toString('utf8');
  need(/^CREATE TABLE `estabelecimento_bi_personalizado` \(/.test(sql)
    && (sql.match(/;/g) ?? []).length === 1 && /;\s*$/.test(sql), 'one_exact_create_required');
  const publicValue = { gitRevision: revision, exactSql: EXPECTED_SQL_SHA256, fileSha256 };
  // Fixa bytes na primeira atestação explícita desta instância, nunca no import.
  if (!firstAttestation) firstAttestation = copy(publicValue);
  need(same(firstAttestation, publicValue), 'process_artifacts_changed');
  return { publicValue, sql, snapshot: snapshot.tables[table] };
}
/** Somente leitura local/Git; não concede aprovação ou preflight. */
export async function loadRestricted0146Attestation() {
  try { return { ok: true, ...(await attest()).publicValue }; }
  catch { return { ok: false, reason: 'local_attestation_failed' }; }
}
async function approval(options, attestation, target) {
  need(typeof options.readIssueApprovalManifest === 'function', 'approval_reader_required');
  // A fonte deve ser confiável, independente e revisada pelo parent; NÃO um eco dos gates.
  const m = await options.readIssueApprovalManifest(Object.freeze({ issue: 34, migrationTag: MIGRATION_TAG,
    approvalRevision: attestation.gitRevision }));
  need(m && typeof m === 'object' && m.approvedBy === 'Sergio' && m.issue === 34
    && same(m.scope, [MIGRATION_TAG]) && m.approvalRevision === attestation.gitRevision
    && m.reviewRevision === attestation.gitRevision && ref(m.reviewReference)
    && m.gitRevision === attestation.gitRevision && m.exactSql === attestation.exactSql
    && same(m.fileSha256, attestation.fileSha256) && same(m.canonicalTarget, target), 'approval_scope_invalid');
  // SQL/snapshot têm 12 colunas. Nenhuma décima terceira pode ser inventada para satisfazer uma descrição inexata.
  need(same(m.physicalContract, { tables: 1, columns: 12, primaryKeys: 1, uniqueIndexes: 1, empty: true }), 'physical_scope_invalid');
  const a = m.authorization, r = m.reservation, b = m.backupExceptionOrProof, w = m.window, now = Date.now();
  need(a && ref(a.reference) && ref(a.operator) && a.operation === 'applyRestricted0146' && a.only0146 === true
    && r && ref(r.reference) && r.issue === 34 && r.status === 'MIGRAÇÃO RESERVADA' && r.exclusive === true
    && r.migrationTag === MIGRATION_TAG && r.revision === attestation.gitRevision && r.operator === a.operator, 'reservation_or_authorization_invalid');
  need(b && b.migrationTag === MIGRATION_TAG && b.approvedBy === 'Sergio' && b.confirmed === true
    && ref(b.confirmationReference) && ref(b.riskReference)
    && ((b.kind === 'proof' && b.durable === true && b.restorationVerified === true
      && ref(b.proofReference) && ref(b.restorationReference) && ref(b.recoveryOwner) && ref(b.retentionReference))
      || (b.kind === 'exception' && b.exceptionAuthorized === true && same(b.waivedRequirements, ['backup', 'recovery', 'homologation']))), 'backup_or_specific_exception_required');
  need(w && Number.isSafeInteger(w.issuedAt) && Number.isSafeInteger(w.expiresAt) && w.issuedAt <= now
    && now < w.expiresAt && w.expiresAt > w.issuedAt && w.expiresAt - w.issuedAt <= MAX_PREFLIGHT_AGE_MS, 'window_invalid');
  return copy(m);
}
const catalogQueries = Object.freeze({
  tables: '/* 0146 tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() AND `table_name` = ? ORDER BY `TABLE_NAME`',
  columns: '/* 0146 columns */ SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = ? ORDER BY `ORDINAL_POSITION`',
  indexes: '/* 0146 indexes */ SELECT `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`, `COLUMN_NAME`, `NON_UNIQUE`, `SUB_PART`, `INDEX_TYPE` FROM `information_schema`.`statistics` WHERE `table_schema` = DATABASE() AND `table_name` = ? ORDER BY `INDEX_NAME`, `SEQ_IN_INDEX`',
  foreignKeys: '/* 0146 foreign keys */ SELECT `TABLE_NAME`, `CONSTRAINT_NAME` FROM `information_schema`.`referential_constraints` WHERE `constraint_schema` = DATABASE() AND (`table_name` = ? OR `referenced_table_name` = ?) ORDER BY `TABLE_NAME`, `CONSTRAINT_NAME`',
});
const layoutSql = '/* 0146 ledger layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = \'__drizzle_migrations\' ORDER BY `ORDINAL_POSITION`';
const ledgerSql = '/* 0146 ledger */ SELECT `id`, `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `id`';
const countSql = 'SELECT COUNT(*) AS `row_count` FROM `estabelecimento_bi_personalizado`';
const insertSql = 'INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)';
const typeOf = value => norm(value).replace(/\b(int|bigint|smallint|tinyint|mediumint)\(\d+\)/g, '$1');
function defaultOf(value) {
  if (value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (/^'.*'$/.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  if (/^\(?current_timestamp(?:\(\))?\)?$/i.test(text) || /^\(now\(\)\)$/i.test(text)) return 'current_timestamp';
  return text;
}
function extraOf(value) {
  return norm(value).replace(/\bdefault_generated\b/g, '').replace(/current_timestamp\(\)/g, 'current_timestamp').trim();
}
function layoutValid(layout) {
  const specs = [['id', 'bigint unsigned', 'no', 'auto_increment'], ['hash', 'text', 'no', ''], ['created_at', 'bigint', 'yes', '']];
  need(layout.length === 3 && specs.every(([name, type, nullable, extra], i) => {
    const r = layout[i]; return r.COLUMN_NAME === name && Number(r.ORDINAL_POSITION) === i + 1
      && typeOf(r.COLUMN_TYPE) === type && norm(r.IS_NULLABLE) === nullable && r.COLUMN_DEFAULT === null && norm(r.EXTRA) === extra;
  }), 'ledger_layout_invalid');
}
function decimal(value) {
  return ['number', 'string', 'bigint'].includes(typeof value) && /^\d+$/.test(String(value))
    && (typeof value !== 'number' || Number.isSafeInteger(value));
}
function ledgerRowsValid(ledger) {
  need(ledger.every(r => same(Object.keys(r).sort(), ['created_at', 'hash', 'id']) && decimal(r.id) && BigInt(r.id) > 0n
    && typeof r.hash === 'string' && r.hash.length > 0 && decimal(r.created_at)
    && Number.isSafeInteger(Number(r.created_at)) && Number(r.created_at) > 0)
    && new Set(ledger.map(r => String(BigInt(r.id)))).size === ledger.length, 'ledger_rows_invalid');
}
function exactMarker(ledger, wanted) {
  const related = ledger.filter(r => r.hash === wanted.hash || String(r.created_at) === String(wanted.created_at));
  need(related.length === 1 && related[0].hash === wanted.hash
    && String(related[0].created_at) === String(wanted.created_at), 'marker_invalid');
  return related[0];
}
/** Puro; política NÃO injetável. Toda baseline operacional é sempre 106 pós-0145. */
export function assert0146LedgerBaseline(ledger) {
  need(Array.isArray(ledger) && ledger.length === 106, 'baseline_count_invalid');
  ledgerRowsValid(ledger);
  const last = exactMarker(ledger, marker0145), earlier = ledger.filter(r => r !== last);
  exactMarker(earlier, marker0144);
  need(!ledger.some(r => r.hash === marker.hash || String(r.created_at) === String(marker.created_at))
    && earlier.length === 105 && earlier.every(r => Number(r.created_at) <= marker0144.created_at)
    && earlier.filter(r => !digest(r.hash)).length === 3
    && earlier.every(r => BigInt(r.id) < BigInt(last.id)), 'historical_baseline_invalid');
  const ordered = [...earlier].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
  // Exatamente stable/ordem numérica da assinatura integrada 0145, sem recaptura permissiva.
  need(sha(JSON.stringify(stable(ordered))) === legacyDigest, 'fixed_baseline_digest_invalid');
}
export function assert0146CommittedLedger(baseline, observed) {
  assert0146LedgerBaseline(baseline); ledgerRowsValid(observed);
  const added = exactMarker(observed, marker);
  need(observed.length === 107 && same(observed.filter(r => r !== added), baseline)
    && baseline.every(r => BigInt(r.id) < BigInt(added.id)), 'committed_history_changed');
}
function absent(catalog) {
  need(Object.values(catalog).every(value => value.length === 0), 'target_already_exists');
}
function physical(catalog, expected) {
  need(catalog.tables.length === 1 && catalog.tables[0].TABLE_NAME === table
    && norm(catalog.tables[0].TABLE_TYPE) === 'base table' && catalog.foreignKeys.length === 0, 'table_or_fk_invalid');
  const columns = Object.values(expected.columns);
  need(columns.length === 12 && catalog.columns.length === 12 && columns.every((c, i) => {
    const r = catalog.columns[i];
    return r.TABLE_NAME === table && r.COLUMN_NAME === c.name && Number(r.ORDINAL_POSITION) === i + 1
      && typeOf(r.COLUMN_TYPE) === typeOf(c.type) && norm(r.IS_NULLABLE) === (c.notNull ? 'no' : 'yes')
      && defaultOf(r.COLUMN_DEFAULT) === defaultOf(c.default ?? null)
      && typeof r.EXTRA === 'string' && extraOf(r.EXTRA) === [c.autoincrement ? 'auto_increment' : '', c.onUpdate ? 'on update current_timestamp' : ''].filter(Boolean).join(' ');
  }), 'column_contract_invalid');
  const indexes = [
    { name: 'PRIMARY', column: 'id' }, { name: 'uq_estab_bi_personalizado', column: 'estabelecimento_id' },
  ];
  need(catalog.indexes.length === 2 && indexes.every(e => {
    const matches = catalog.indexes.filter(r => r.INDEX_NAME === e.name);
    const r = matches[0]; return matches.length === 1 && r.TABLE_NAME === table && r.COLUMN_NAME === e.column
      && [0, '0'].includes(r.NON_UNIQUE) && Number(r.SEQ_IN_INDEX) === 1 && r.SUB_PART === null && norm(r.INDEX_TYPE) === 'btree';
  }), 'index_contract_invalid');
}
function connections(factory, target) {
  const objects = new WeakSet(), tlsObjects = new WeakSet(), sessions = new Set(), ids = new WeakMap(), openSet = new Set();
  async function close(c) { if (!openSet.delete(c)) return; try { await c.close(); } catch {} }
  async function identity(c, initial = false) {
    const v = await c.getIdentity(), tls = v?.tls;
    need(v?.tlsVerified === true && v.serverProduct === 'tidb' && v.databaseName === target.databaseName
      && v.serverVersion === target.serverVersion && hostOf(v.host) === target.host && v.certificateFingerprint === target.certificateFingerprint
      && tls && typeof tls === 'object' && tls.verified === true && hostOf(tls.host) === target.host
      && tls.certificateFingerprint === target.certificateFingerprint && ['number', 'string'].includes(typeof v.connectionId)
      && String(v.connectionId).length > 0, 'tls_target_or_session_invalid');
    if (initial) {
      need(!sessions.has(String(v.connectionId)) && !tlsObjects.has(tls), 'connection_not_independent');
      sessions.add(String(v.connectionId)); tlsObjects.add(tls); ids.set(c, { session: String(v.connectionId), tls });
    } else need(ids.get(c)?.session === String(v.connectionId) && ids.get(c)?.tls === tls, 'session_changed');
  }
  return { identity, close,
    async open() {
      const c = await factory();
      need(c && typeof c === 'object' && !objects.has(c), 'connection_not_independent');
      objects.add(c); openSet.add(c);
      try { need(methods.every(m => typeof c[m] === 'function'), 'adapter_contract_invalid'); await identity(c, true); return c; }
      catch (e) { await close(c); throw e; }
    },
    async cleanup() { for (const c of [...openSet]) await close(c); },
  };
}
async function inspect(c, registry, expected, created) {
  await registry.identity(c);
  const catalog = {};
  // Sequencial: uma conexão mysql2 é uma sessão, não quatro leitores paralelos.
  for (const [key, sql] of Object.entries(catalogQueries)) catalog[key] = rows(await c.query(sql, key === 'foreignKeys' ? [table, table] : [table]));
  const layout = rows(await c.query(layoutSql, [])), ledger = rows(await c.query(ledgerSql, []));
  layoutValid(layout);
  if (created) {
    physical(catalog, expected);
    const count = rows(await c.query(countSql, []));
    need(count.length === 1 && decimal(count[0].row_count) && BigInt(count[0].row_count) === 0n, 'table_not_empty');
  } else absent(catalog);
  await registry.identity(c);
  return { catalog, layout, ledger };
}
/** Não abrir conexões enquanto manifesto/backup/revisão estiverem pendentes. */
export async function preflightRestricted0146(options = {}) {
  let registry;
  try {
    need(typeof options.createConnection === 'function', 'connection_factory_required');
    const target = targetOf(options.canonicalTarget), attested = await attest();
    const manifest = await approval(options, attested.publicValue, target), issuedAt = Date.now();
    registry = connections(options.createConnection, target);
    const a = await registry.open(), b = await registry.open();
    const baseline = await inspect(a, registry, attested.snapshot, false), other = await inspect(b, registry, attested.snapshot, false);
    assert0146LedgerBaseline(baseline.ledger); assert0146LedgerBaseline(other.ledger);
    need(same(baseline, other), 'independent_baselines_changed');
    await registry.cleanup();
    need(Date.now() >= issuedAt && Date.now() - issuedAt < MAX_PREFLIGHT_AGE_MS, 'preflight_expired');
    need(same(manifest, await approval(options, attested.publicValue, target)), 'approval_changed');
    need(same(attested.publicValue, (await attest()).publicValue), 'attestation_changed');
    const token = Object.freeze({ ...report(true, 'preflight', 'ready'), issuedAt });
    preflights.set(token, { options: { ...options, canonicalTarget: copy(options.canonicalTarget) }, target, attested, manifest,
      issuedAt, registry, baseline });
    return token;
  } catch { return report(false, 'preflight', 'preflight_controls_failed'); }
  finally { await registry?.cleanup(); }
}
/** Única escrita futura: bytes SQL integrais uma vez e marker tardio em transação. */
export async function applyRestricted0146(options = {}) {
  const state = options.preflight && preflights.get(options.preflight);
  if (!state) return report(false, 'apply', 'issued_single_use_preflight_required');
  preflights.delete(options.preflight);
  // Exclusão por alvo (não apenas factory). A exclusividade entre processos depende da reserva #34.
  const targetKey = `${state.target.host}/${state.target.databaseName}`;
  if (activeTargets.has(targetKey) || attemptedTargets.has(targetKey)) return report(false, 'apply', 'exclusive_execution_required');
  activeTargets.add(targetKey);
  let writer;
  const registry = state.registry;
  Object.assign(state, { ddlCount: 0, ddlVerifiedCount: 0, markerAttempted: false, postCommitVerified: false,
    transaction: false, commitAttempted: false, phase: 'controls' });
  const control = async () => {
    need(options.createConnection === state.options.createConnection
      && options.readIssueApprovalManifest === state.options.readIssueApprovalManifest
      && same(options.canonicalTarget, state.options.canonicalTarget), 'preflight_context_changed');
    need(Date.now() >= state.issuedAt && Date.now() - state.issuedAt < MAX_PREFLIGHT_AGE_MS, 'preflight_expired');
    need(same(targetOf(options.canonicalTarget), state.target), 'target_changed');
    need(same((await attest()).publicValue, state.attested.publicValue), 'artifacts_changed');
    need(same(await approval(options, state.attested.publicValue, state.target), state.manifest), 'approval_changed');
  };
  const check = async (c, created, committed = false) => {
    const observed = await inspect(c, registry, state.attested.snapshot, created);
    need(same(observed.layout, state.baseline.layout), 'ledger_layout_changed');
    if (committed) assert0146CommittedLedger(state.baseline.ledger, observed.ledger);
    else need(same(observed.ledger, state.baseline.ledger), 'ledger_history_changed');
    if (!created) need(same(observed, state.baseline), 'baseline_changed');
  };
  const independent = async (committed = false) => {
    const c = await registry.open(); try { await check(c, true, committed); } finally { await registry.close(c); }
  };
  try {
    await control(); writer = await registry.open(); await check(writer, false);
    await control(); await registry.identity(writer);
    attemptedTargets.add(targetKey); // Sem segunda CREATE neste processo, mesmo se o driver falhar antes da resposta.
    state.phase = 'create'; state.ddlCount = 1; // Conta a tentativa ANTES da chamada, inclusive timeout.
    await writer.execute(state.attested.sql, []);
    state.phase = 'verify-create';
    await independent(); await check(writer, true); state.ddlVerifiedCount = 1;
    await control();
    state.phase = 'marker'; state.transaction = true;
    await writer.beginTransaction(); // Contrato exige BEGIN PESSIMISTIC real no TiDB.
    await registry.identity(writer);
    need(same(rows(await writer.query(`${ledgerSql} FOR UPDATE`, [])), state.baseline.ledger), 'locked_ledger_changed');
    await independent(); await check(writer, true);
    await control(); await registry.identity(writer);
    need(same(rows(await writer.query(`${ledgerSql} FOR UPDATE`, [])), state.baseline.ledger), 'locked_ledger_changed');
    state.markerAttempted = true;
    const inserted = await writer.execute(insertSql, [EXPECTED_SQL_SHA256, MIGRATION_TIMESTAMP]);
    need(inserted?.affectedRows === 1, 'marker_insert_invalid');
    assert0146CommittedLedger(state.baseline.ledger, rows(await writer.query(`${ledgerSql} FOR UPDATE`, [])));
    await control(); await registry.identity(writer);
    assert0146CommittedLedger(state.baseline.ledger, rows(await writer.query(`${ledgerSql} FOR UPDATE`, [])));
    state.phase = 'commit'; state.commitAttempted = true;
    await writer.commit(); state.transaction = false;
    state.phase = 'verify-commit'; await independent(true); state.postCommitVerified = true;
    return report(true, 'complete', 'applied_and_independently_verified', state);
  } catch {
    // Nunca alegar que rollback desfaz CREATE nem tentar rollback de commit ambíguo.
    if (writer && state.transaction && !state.commitAttempted) { try { await writer.rollback(); } catch {} }
    return report(false, state.phase, 'stopped_no_retry', state);
  } finally { await registry.cleanup(); activeTargets.delete(targetKey); }
}

/** Factory opcional mysql2/promise; configuração injetada, não ambiente.
 * Definição real: 0144-fabrica-faturamento-restrita.mjs:459 e mysql2 typings/mysql/lib/Connection.d.ts.
 * mysql2 usa config.host para SNI/checkServerIdentity (ssl.servername é guarda de contrato legado).
 * Construir não conecta; connect/createConnection só será invocado após controles.
 */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions } = {}) {
  need(mysql && typeof mysql.createConnection === 'function' && connectionOptions && typeof connectionOptions === 'object'
    && typeof connectionOptions.database === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(connectionOptions.database)
    && connectionOptions.ssl?.ca && connectionOptions.ssl.rejectUnauthorized === true
    && connectionOptions.ssl.verifyIdentity === true && connectionOptions.ssl.servername === connectionOptions.host
    && !connectionOptions.stream && connectionOptions.debug !== true && connectionOptions.multipleStatements !== true, 'injected_mysql2_tls_configuration_invalid');
  const host = hostOf(connectionOptions.host);
  const options = { ...copy(connectionOptions), host, multipleStatements: false,
    supportBigNumbers: true, bigNumberStrings: false,
    ssl: { ...copy(connectionOptions.ssl), rejectUnauthorized: true, verifyIdentity: true } };
  return { async createConnection() {
    let raw;
    try {
      raw = await mysql.createConnection(copy(options));
      const socket = raw?.connection?.stream;
      const peer = () => {
        need(raw.connection.stream === socket && socket?.encrypted === true && socket?.authorized === true
          && !socket.authorizationError, 'tls_handshake_invalid');
        const cert = socket.getPeerCertificate(true);
        need(cert?.raw && !checkServerIdentity(host, cert), 'tls_hostname_invalid');
        return sha(cert.raw);
      };
      const fingerprint = peer(), tls = Object.freeze({ verified: true, host, certificateFingerprint: fingerprint });
      return {
        async getIdentity() {
          need(peer() === fingerprint, 'tls_peer_changed');
          const [values] = await raw.query('/* 0146 adapter identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`, CONNECTION_ID() AS `connection_id`');
          need(values?.length === 1, 'identity_invalid'); const r = values[0];
          return { tlsVerified: true, tls, host, certificateFingerprint: fingerprint, databaseName: r.database_name,
            serverVersion: r.server_version, serverProduct: /tidb/i.test(r.server_version) ? 'tidb' : 'other', connectionId: r.connection_id };
        },
        async query(sql, params = []) { peer(); const [values] = await raw.query(sql, params); return { rows: values }; },
        // raw.query envia a DDL exata (incluindo ;) pelo protocolo texto; não multi-statements.
        async execute(sql, params = []) { peer(); const [value] = await raw.query(sql, params); return { affectedRows: value?.affectedRows }; },
        async beginTransaction() { peer(); await raw.query('BEGIN PESSIMISTIC'); },
        async commit() { peer(); await raw.commit(); },
        async rollback() { peer(); await raw.rollback(); },
        async close() { await raw.end(); },
      };
    } catch { try { await raw?.end?.(); } catch {} throw new Error('injected_mysql2_connection_failed'); }
  } };
}
