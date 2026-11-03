import { createHash, X509Certificate } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { domainToASCII } from 'node:url';
import path from 'node:path';
import {
  projectRoot, MIGRATION_TAG, MIGRATION_TIMESTAMP, EXPECTED_SQL_SHA256,
  loadRestricted0145Artifacts, preflightRestricted0145, applyRestricted0145,
} from './0145-rpa-fila-envio-xml-restrita.mjs';
import {
  load0145VerificationContract, assert0145LedgerBaseline,
  assert0145PhysicalStage, assert0145CommittedLedger,
} from './0145-rpa-verificacao-completa.mjs';

/** Preparação versionável, sem CLI, descoberta de destino, env ou autorização própria.
 * O operador fornece conexões e um leitor SOMENTE LEITURA da evidência confiável
 * de Sergio/Issue #34. Comparar dois objetos não autentica uma aprovação humana:
 * a origem desse leitor deve ser confiável e revisada pelo operador.
 * Todas as conexões (inclusive somente leitura) precisam dos sete métodos abaixo.
 * getIdentity(): {tlsVerified, serverProduct, serverVersion, databaseName, host,
 * certificateFingerprint, connectionId, tls: {verified, host, certificateFingerprint}}.
 * connectionId identifica a sessão física; tls é um objeto independente e estável
 * por sessão. Adaptadores 0144 sem métodos transacionais são recusados antes da DDL.
 * NÃO invocar apply sem aprovação final específica. Importar não executa SQL/Git.
 */
export const MAX_PREFLIGHT_AGE_MS = 5 * 60 * 1000;
export const REVIEWED_FILES = Object.freeze([
  'scripts/migrations/0145-rpa-fila-envio-xml-restrita.mjs',
  'scripts/migrations/0145-rpa-execucao-verificada.mjs',
  'scripts/migrations/0145-rpa-verificacao-completa.mjs',
]);
const execFileAsync = promisify(execFile);
const methods = ['query', 'execute', 'getIdentity', 'close', 'beginTransaction', 'commit', 'rollback'];
const targetTables = ['credenciais_portais', 'fila_envio_xml_portal'];
const insertMarker = 'INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)';
const ledgerSql = '/* 0145 ledger read */ SELECT `id`, `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `id`';
const layoutSql = '/* 0145 verified ledger layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = \'__drizzle_migrations\' ORDER BY `ORDINAL_POSITION`';
const rawSql = Object.freeze({
  tables: '/* 0145 verified tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`',
  columns: '/* 0145 verified columns */ SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`',
  indexes: '/* 0145 verified indexes */ SELECT `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`, `COLUMN_NAME`, `NON_UNIQUE`, `SUB_PART`, `INDEX_TYPE` FROM `information_schema`.`statistics` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`',
  foreignKeys: '/* 0145 verified foreign keys */ SELECT k.`TABLE_NAME`, k.`CONSTRAINT_NAME`, k.`ORDINAL_POSITION`, k.`COLUMN_NAME`, k.`REFERENCED_TABLE_NAME`, k.`REFERENCED_COLUMN_NAME`, r.`UPDATE_RULE`, r.`DELETE_RULE` FROM `information_schema`.`key_column_usage` k JOIN `information_schema`.`referential_constraints` r ON r.`CONSTRAINT_SCHEMA` = k.`CONSTRAINT_SCHEMA` AND r.`TABLE_NAME` = k.`TABLE_NAME` AND r.`CONSTRAINT_NAME` = k.`CONSTRAINT_NAME` WHERE k.`TABLE_SCHEMA` = DATABASE() AND k.`TABLE_NAME` IN (?, ?) AND k.`REFERENCED_TABLE_NAME` IS NOT NULL ORDER BY k.`TABLE_NAME`, k.`CONSTRAINT_NAME`, k.`ORDINAL_POSITION`',
});
// Baseline agregada específica, não exportada/injetável por options, gates ou manifesto.
// Preservar divergência legada NÃO é reconciliar o histórico nem conceder autorização.
const LEGACY_LEDGER_BASELINE = Object.freeze({
  rowCount: 105,
  legacyHashCount: 3,
  sha256: 'ddba1fe00d43958df2e585b43887c52b495736cce7a508279518b9dcd9bbb452',
});
const preflights = new WeakMap();
const applying = new WeakSet();
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const stable = value => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const copy = value => structuredClone(value);
const reference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,159}$/.test(value);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
// Bytes locais carregados por esta instância; uma revisão posterior requer reimportar/reiniciar.
const loadedFileSha256 = Object.fromEntries(await Promise.all(REVIEWED_FILES.map(async relative =>
  [relative, sha(await readFile(path.join(projectRoot, relative)))])));
function requireThat(value, reason) { if (!value) throw new Error(reason); }
function rows(result) {
  const value = Array.isArray(result?.rows) ? result.rows : result;
  requireThat(Array.isArray(value) && value.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'metadata_result_invalid');
  return copy(value);
}
async function close(connection) { try { await connection?.close?.(); } catch {} }
function report(ok, phase, reason, state) {
  const attempted = state?.attempted ?? 0, verified = state?.verified ?? 0;
  return Object.freeze({ ok, phase, reason, ddlCount: attempted, ddlVerifiedCount: verified,
    ddlOutcomeUncertain: attempted !== verified, journalOutcomeUncertain: Boolean(state?.markerAttempted && !state?.postCommitVerified),
    retryAllowed: false, tables: 2, addedColumns: 4, addedTables: 1, addedIndexes: 3 });
}
function hostOf(value) {
  requireThat(typeof value === 'string' && value.length <= 253 && !/\s|[/:@]/.test(value), 'canonical_target_invalid');
  const host = domainToASCII(value.replace(/\.$/, '').toLowerCase());
  requireThat(host && host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)), 'canonical_target_invalid');
  return host;
}
function canonicalOf(target) {
  requireThat(target && typeof target === 'object' && reference(target.reference) && norm(target.serverProduct) === 'tidb'
    && typeof target.databaseName === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(target.databaseName)
    && typeof target.serverVersion === 'string' && target.serverVersion.trim().length > 0
    && digest(target.certificateFingerprint) && typeof target.certificatePem === 'string', 'canonical_target_invalid');
  const host = hostOf(target.host), certificate = new X509Certificate(target.certificatePem);
  const now = Date.now();
  requireThat(sha(certificate.raw) === target.certificateFingerprint && certificate.checkHost(host)
    && Date.parse(certificate.validFrom) <= now && now <= Date.parse(certificate.validTo), 'canonical_certificate_invalid');
  return { reference: target.reference, host, databaseName: target.databaseName,
    serverProduct: 'tidb', serverVersion: target.serverVersion, certificateFingerprint: target.certificateFingerprint };
}
async function attestation() {
  const artifacts = await loadRestricted0145Artifacts();
  requireThat(artifacts.ok, 'artifacts_unavailable_or_dirty');
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  const gitRevision = String(stdout).trim();
  requireThat(/^[0-9a-f]{40}$/.test(gitRevision) && gitRevision === artifacts.gitRevision, 'git_revision_changed');
  const fileSha256 = {};
  for (const relative of REVIEWED_FILES) {
    const [local, git] = await Promise.all([
      readFile(path.join(projectRoot, relative)),
      execFileAsync('git', ['show', `${gitRevision}:${relative}`], { cwd: projectRoot, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }),
    ]);
    requireThat(local.equals(Buffer.from(git.stdout)), 'reviewed_file_not_in_revision');
    fileSha256[relative] = sha(local); // Hash integral: nenhum hash autorreferente constante.
    requireThat(fileSha256[relative] === loadedFileSha256[relative], 'loaded_executor_bytes_changed');
  }
  const contract = await load0145VerificationContract();
  requireThat(same(contract.snapshot, artifacts.snapshot) && contract.marker.hash === EXPECTED_SQL_SHA256
    && contract.marker.created_at === MIGRATION_TIMESTAMP, 'verification_contract_changed');
  const finalRevision = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  requireThat(String(finalRevision.stdout).trim() === gitRevision, 'git_revision_changed');
  const publicAttestation = { gitRevision, exactSql: EXPECTED_SQL_SHA256, reviewedFileSha256: fileSha256 };
  return { artifacts, contract, publicAttestation };
}
/** Somente arquivos locais/Git. Falha enquanto wrapper/helper não estiverem na revisão. */
export async function loadVerified0145Attestation() {
  try { return { ok: true, ...(await attestation()).publicAttestation }; }
  catch { return { ok: false, reason: 'git_bytes_or_artifacts_unverified' }; }
}
function validatePayload(gates, manifest, expected, target, now) {
  requireThat(gates && manifest && same(gates, manifest), 'approval_manifest_mismatch');
  requireThat(gates.approvedBy === 'Sergio' && gates.issue === 34 && same(gates.scope, [MIGRATION_TAG])
    && gates.approvalRevision === expected.gitRevision && gates.reviewRevision === expected.gitRevision
    && gates.gitRevision === expected.gitRevision && gates.artifactsRevision === MIGRATION_TAG
    && gates.exactSql === expected.exactSql && same(gates.reviewedFileSha256, expected.reviewedFileSha256)
    && gates.executorDigest === expected.reviewedFileSha256[REVIEWED_FILES[0]]
    && gates.wrapperDigest === expected.reviewedFileSha256[REVIEWED_FILES[1]]
    && gates.verifierDigest === expected.reviewedFileSha256[REVIEWED_FILES[2]], 'approval_revision_or_digest_invalid');
  const a = gates.authorization, r = gates.reservation, exception = gates.backupExceptionOrProof;
  requireThat(a && reference(a.reference) && reference(a.operator) && a.operation === 'applyRestricted0145'
    && a.only0145 === true && r && reference(r.reference) && r.issue === 34
    && r.status === 'MIGRAÇÃO RESERVADA' && r.exclusive === true && r.migrationTag === MIGRATION_TAG
    && r.revision === expected.gitRevision && r.operator === a.operator, 'authorization_or_reservation_invalid');
  requireThat(exception && exception.approvedBy === 'Sergio' && exception.migrationTag === MIGRATION_TAG
    && exception.confirmed === true && exception.withoutBackupRecoveryHomologation === true
    && reference(exception.confirmationReference), '0145_specific_exception_required');
  requireThat(same(gates.canonicalTarget, target), 'approval_target_mismatch');
  const window = gates.window;
  requireThat(window && Number.isSafeInteger(window.issuedAt) && Number.isSafeInteger(window.expiresAt)
    && window.issuedAt <= now && now < window.expiresAt && window.expiresAt > window.issuedAt
    && window.expiresAt - window.issuedAt <= MAX_PREFLIGHT_AGE_MS, 'approval_window_invalid');
}
async function readApproval(options, attested, target) {
  requireThat(typeof options.readIssueApprovalManifest === 'function', 'trusted_readonly_approval_reader_required');
  const manifest = await options.readIssueApprovalManifest(Object.freeze({ issue: 34, migrationTag: MIGRATION_TAG,
    approvalRevision: options.gates?.approvalRevision }));
  validatePayload(options.gates, manifest, attested.publicAttestation, target, Date.now());
}
function layoutValid(layout) {
  // Ledger Drizzle legado confirmado somente por catálogo: created_at permite NULL
  // no schema; baselineValid continua rejeitando NULL nos registros do histórico.
  const definitions = [ ['id', 'bigint unsigned', 'auto_increment', 'no'], ['hash', 'text', '', 'no'], ['created_at', 'bigint', '', 'yes'] ];
  requireThat(layout.length === 3 && definitions.every(([name, type, extra, nullable], index) => {
    const row = layout[index];
    return row.COLUMN_NAME === name && Number(row.ORDINAL_POSITION) === index + 1
      && norm(row.COLUMN_TYPE).replace(/bigint\(\d+\)/g, 'bigint') === type
      && norm(row.IS_NULLABLE) === nullable && row.COLUMN_DEFAULT === null && norm(row.EXTRA) === extra;
  }), 'ledger_layout_invalid');
}
function rawValid(catalog) {
  const unique = (values, keys) => new Set(values.map(row => keys.map(key => row[key]).join('\0'))).size === values.length;
  requireThat(unique(catalog.tables, ['TABLE_NAME']) && unique(catalog.columns, ['TABLE_NAME', 'COLUMN_NAME'])
    && unique(catalog.columns, ['TABLE_NAME', 'ORDINAL_POSITION']) && unique(catalog.indexes, ['TABLE_NAME', 'INDEX_NAME', 'SEQ_IN_INDEX'])
    && catalog.tables.every(row => targetTables.includes(row.TABLE_NAME) && norm(row.TABLE_TYPE) === 'base table')
    && catalog.columns.every(row => targetTables.includes(row.TABLE_NAME) && typeof row.COLUMN_NAME === 'string'
      && Number.isInteger(Number(row.ORDINAL_POSITION)) && Number(row.ORDINAL_POSITION) > 0
      && typeof row.COLUMN_TYPE === 'string' && ['yes', 'no'].includes(norm(row.IS_NULLABLE))
      && Object.hasOwn(row, 'COLUMN_DEFAULT') && typeof row.EXTRA === 'string')
    && catalog.indexes.every(row => targetTables.includes(row.TABLE_NAME) && typeof row.INDEX_NAME === 'string'
      && typeof row.COLUMN_NAME === 'string' && [0, 1, '0', '1'].includes(row.NON_UNIQUE)
      && Number.isInteger(Number(row.SEQ_IN_INDEX)) && Number(row.SEQ_IN_INDEX) > 0
      && row.SUB_PART === null && norm(row.INDEX_TYPE) === 'btree')
    && catalog.foreignKeys.every(row => targetTables.includes(row.TABLE_NAME) && typeof row.CONSTRAINT_NAME === 'string'
      && typeof row.COLUMN_NAME === 'string' && typeof row.REFERENCED_TABLE_NAME === 'string'
      && typeof row.REFERENCED_COLUMN_NAME === 'string' && typeof row.UPDATE_RULE === 'string' && typeof row.DELETE_RULE === 'string'), 'raw_catalog_invalid');
  for (const table of catalog.tables) {
    const positions = catalog.columns.filter(row => row.TABLE_NAME === table.TABLE_NAME).map(row => Number(row.ORDINAL_POSITION)).sort((a, b) => a - b);
    requireThat(positions.length > 0 && positions.every((position, i) => position === i + 1), 'raw_column_positions_invalid');
  }
  for (const index of catalog.indexes) {
    const positions = catalog.indexes.filter(row => row.TABLE_NAME === index.TABLE_NAME && row.INDEX_NAME === index.INDEX_NAME)
      .map(row => Number(row.SEQ_IN_INDEX)).sort((a, b) => a - b);
    requireThat(positions.every((position, i) => position === i + 1), 'raw_index_positions_invalid');
  }
}
/** Helper puro: política explícita apenas para testes/validação, nunca autorização.
 * O wrapper chama com a constante privada acima. A assinatura cobre TODAS as linhas
 * e campos, com stable existente e ordenação numérica por id, sem modificar o ledger.
 */
export function assert0145HistoricalLedger(ledger, contract, legacyPolicy) {
  requireThat(Array.isArray(ledger) && ledger.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'historical_ledger_invalid');
  assert0145LedgerBaseline(ledger, contract);
  const prior = contract.previousMarker;
  const decimal = value => ['number', 'string', 'bigint'].includes(typeof value) && /^\d+$/.test(String(value))
    && (typeof value !== 'number' || Number.isSafeInteger(value));
  const related = ledger.filter(row => row.hash === prior.hash || String(row.created_at) === String(prior.created_at));
  requireThat(related.length === 1 && ledger.every(row => decimal(row.id) && BigInt(row.id) > 0n
    && typeof row.hash === 'string' && row.hash.length > 0
    && decimal(row.created_at) && Number.isSafeInteger(Number(row.created_at))
    && Number(row.created_at) > 0 && Number(row.created_at) <= prior.created_at), 'historical_ledger_invalid');
  requireThat(new Set(ledger.map(row => BigInt(row.id).toString())).size === ledger.length, 'historical_ledger_invalid');
  const legacyHashCount = ledger.filter(row => !digest(row.hash)).length;
  if (legacyHashCount > 0) {
    requireThat(legacyPolicy && Number.isSafeInteger(legacyPolicy.rowCount) && legacyPolicy.rowCount > 0
      && Number.isSafeInteger(legacyPolicy.legacyHashCount) && legacyPolicy.legacyHashCount > 0
      && legacyPolicy.legacyHashCount <= legacyPolicy.rowCount && digest(legacyPolicy.sha256)
      && ledger.length === legacyPolicy.rowCount && legacyHashCount === legacyPolicy.legacyHashCount, 'legacy_ledger_baseline_invalid');
    const ordered = [...ledger].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
    requireThat(sha(JSON.stringify(stable(ordered))) === legacyPolicy.sha256, 'legacy_ledger_baseline_invalid');
  }
}
function baselineValid(observed, contract) {
  layoutValid(observed.layout); rawValid(observed.catalog);
  assert0145HistoricalLedger(observed.ledger, contract, LEGACY_LEDGER_BASELINE);
  const added = ['codigoPrestadorOperadora', 'registroAns', 'parametrosExtras', 'statusCredencial'];
  requireThat(observed.catalog.tables.length === 1 && observed.catalog.tables[0].TABLE_NAME === 'credenciais_portais'
    && observed.catalog.columns.every(row => row.TABLE_NAME === 'credenciais_portais' && !added.includes(row.COLUMN_NAME))
    && observed.catalog.indexes.every(row => row.TABLE_NAME === 'credenciais_portais')
    && observed.catalog.foreignKeys.every(row => row.TABLE_NAME === 'credenciais_portais'), 'physical_baseline_invalid');
}
function registry(factory, target) {
  const objects = new WeakSet(), sessions = new Set(), tlsObjects = new WeakSet(), registered = new WeakMap();
  const active = new Set(), opening = new Set();
  async function release(connection) {
    if (!active.delete(connection)) return;
    await close(connection);
  }
  async function identity(connection, initial = false) {
    const value = await connection.getIdentity();
    const tls = value?.tls;
    requireThat(value?.tlsVerified === true && norm(value.serverProduct) === target.serverProduct
      && value.databaseName === target.databaseName && value.serverVersion === target.serverVersion
      && hostOf(value.host) === target.host && value.certificateFingerprint === target.certificateFingerprint
      && tls && typeof tls === 'object' && tls.verified === true && hostOf(tls.host) === target.host
      && tls.certificateFingerprint === target.certificateFingerprint
      && (typeof value.connectionId === 'string' || typeof value.connectionId === 'number')
      && String(value.connectionId).length > 0, 'tls_or_canonical_identity_invalid');
    if (initial) {
      requireThat(!sessions.has(String(value.connectionId)) && !tlsObjects.has(tls), 'connection_not_independent');
      sessions.add(String(value.connectionId)); tlsObjects.add(tls);
      registered.set(connection, { session: String(value.connectionId), tls });
    } else {
      const old = registered.get(connection);
      requireThat(old && old.session === String(value.connectionId) && old.tls === tls, 'connection_identity_changed');
    }
    return value;
  }
  async function open() {
    const pending = (async () => {
      const connection = await factory();
      // Nunca fechar uma sessão já utilizada: uma factory reutilizadora é inválida.
      requireThat(connection && typeof connection === 'object' && !objects.has(connection), 'connection_not_independent');
      objects.add(connection); active.add(connection);
      try {
        requireThat(methods.every(method => typeof connection[method] === 'function'), 'connection_method_contract_invalid');
        await identity(connection, true); return connection;
      } catch (error) { await release(connection); throw error; }
    })();
    opening.add(pending);
    try { return await pending; } finally { opening.delete(pending); }
  }
  return {
    identity, open, release,
    async cleanup() {
      await Promise.allSettled([...opening]);
      await Promise.allSettled([...active].map(release));
    },
  };
}
async function inspect(connection, connections) {
  await connections.identity(connection);
  const [tables, columns, indexes, foreignKeys, layout, ledger] = await Promise.all([
    ...Object.values(rawSql).map(sql => connection.query(sql, targetTables).then(rows)),
    connection.query(layoutSql, []).then(rows), connection.query(ledgerSql, []).then(rows),
  ]);
  await connections.identity(connection);
  const catalog = { tables, columns, indexes, foreignKeys };
  rawValid(catalog); layoutValid(layout);
  return { catalog, layout, ledger };
}
function stableBaseline(before, observed) {
  requireThat(same(before, observed), 'independent_baseline_changed');
}
function stageValid(state, observed, completed, committed = false) {
  rawValid(observed.catalog); layoutValid(observed.layout);
  requireThat(same(state.baseline.layout, observed.layout), 'ledger_layout_changed');
  assert0145PhysicalStage(state.baseline.catalog, observed.catalog, state.attested.contract, completed);
  const added = ['codigoPrestadorOperadora', 'registroAns', 'parametrosExtras', 'statusCredencial'];
  const oldCount = state.baseline.catalog.columns.filter(row => row.TABLE_NAME === 'credenciais_portais').length;
  const exactColumn = (table, name, position) => {
    const row = observed.catalog.columns.find(column => column.TABLE_NAME === table && column.COLUMN_NAME === name);
    const expected = state.attested.contract.snapshot.tables[table].columns[name];
    const expectedExtra = [expected.autoincrement ? 'auto_increment' : '', expected.onUpdate ? 'on update current_timestamp' : ''].filter(Boolean).join(' ');
    // DEFAULT_GENERATED e parênteses vazios são diferenças conhecidas de representação.
    const actualExtra = norm(row?.EXTRA).replace(/\bdefault_generated\b/g, '').replace(/current_timestamp\(\)/g, 'current_timestamp').trim();
    requireThat(Number(row?.ORDINAL_POSITION) === position && actualExtra === expectedExtra, 'new_column_position_or_extra_invalid');
  };
  added.forEach((name, index) => exactColumn('credenciais_portais', name, oldCount + index + 1));
  if (completed === 2) Object.keys(state.attested.contract.snapshot.tables.fila_envio_xml_portal.columns)
    .forEach((name, index) => exactColumn('fila_envio_xml_portal', name, index + 1));
  if (committed) assert0145CommittedLedger(state.baseline.ledger, observed.ledger, state.attested.contract);
  else requireThat(same(state.baseline.ledger, observed.ledger), 'ledger_history_changed');
}
function readOnly(connection, connections) {
  const disabled = async () => { throw new Error('readonly_connection_write_forbidden'); };
  return { query: connection.query.bind(connection), getIdentity: () => connections.identity(connection),
    close: () => connections.release(connection), execute: disabled, beginTransaction: disabled, commit: disabled, rollback: disabled };
}
/** Relatório opaco sanitizado, consumível somente uma vez e no mesmo processo. */
export async function preflightVerified0145(options = {}) {
  let first, second, connections;
  try {
    requireThat(typeof options.createConnection === 'function', 'connection_factory_required');
    const target = canonicalOf(options.canonicalTarget), attested = await attestation();
    await readApproval(options, attested, target);
    const issuedAt = Date.now(); connections = registry(options.createConnection, target);
    first = await connections.open(); second = await connections.open();
    const baseline = await inspect(first, connections), other = await inspect(second, connections);
    baselineValid(baseline, attested.contract); baselineValid(other, attested.contract); stableBaseline(baseline, other);
    await connections.release(first); first = null; await connections.release(second); second = null;
    const original = await preflightRestricted0145({ canonicalTarget: target.reference, createConnection: async () => {
      const connection = await connections.open();
      try { stableBaseline(baseline, await inspect(connection, connections)); return readOnly(connection, connections); }
      catch (error) { await connections.release(connection); throw error; }
    } });
    requireThat(original.ok && same(original.baselineLedger, baseline.ledger), 'original_preflight_failed');
    requireThat(Date.now() - issuedAt <= MAX_PREFLIGHT_AGE_MS, 'preflight_expired');
    await readApproval(options, attested, target);
    const publicReport = Object.freeze({ ...report(true, 'preflight', 'ready'), issuedAt });
    preflights.set(publicReport, { options: { ...options, gates: copy(options.gates), canonicalTarget: copy(options.canonicalTarget) },
      target, attested, baseline, original, connections, issuedAt });
    return publicReport;
  } catch { return report(false, 'preflight', 'preflight_controls_failed'); }
  finally { await connections?.cleanup(); }
}

/** Único caminho futuro de escrita. Delegação, não duplicação da SQL/orquestração. */
export async function applyVerified0145(options = {}) {
  const state = options.preflight && preflights.get(options.preflight);
  if (!state) return report(false, 'apply', 'fresh_issued_preflight_required');
  preflights.delete(options.preflight); // Consumido também em erro/expiração; sem reaplicação automática.
  if (applying.has(state.options.createConnection)) return report(false, 'apply', 'exclusive_execution_required');
  applying.add(state.options.createConnection);
  Object.assign(state, { attempted: 0, verified: 0, completed: 0, markerAttempted: false, postCommitVerified: false,
    transaction: false, insertVerified: false, commitAttempted: false, commitComplete: false });
  let writer;
  const control = async () => {
    requireThat(Date.now() >= state.issuedAt && Date.now() - state.issuedAt <= MAX_PREFLIGHT_AGE_MS
      && options.preflight.issuedAt === state.issuedAt, 'fresh_issued_preflight_required');
    requireThat(same(options.gates, state.options.gates) && same(options.canonicalTarget, state.options.canonicalTarget), 'preflight_context_changed');
    canonicalOf(options.canonicalTarget);
    const current = await attestation();
    requireThat(same(current.publicAttestation, state.attested.publicAttestation), 'reviewed_revision_changed');
    await readApproval(options, current, state.target);
  };
  const independent = async (committed = false) => {
    const connection = await state.connections.open();
    try { stageValid(state, await inspect(connection, state.connections), state.completed, committed); }
    finally { await state.connections.release(connection); }
  };
  try {
    requireThat(options.createConnection === state.options.createConnection
      && options.readIssueApprovalManifest === state.options.readIssueApprovalManifest
      && same(options.canonicalTarget, state.options.canonicalTarget) && same(options.gates, state.options.gates), 'preflight_context_changed');
    await control();
    const originalGates = {
      authorization: options.gates.authorization.reference, review: options.gates.reviewRevision,
      exactSql: options.gates.exactSql, executorDigest: options.gates.executorDigest,
      artifactsRevision: MIGRATION_TAG, window: `${options.gates.window.issuedAt}:${options.gates.window.expiresAt}`,
      backupExceptionOrProof: options.gates.backupExceptionOrProof.confirmationReference,
      canonicalTarget: state.target.reference, gitRevision: state.attested.publicAttestation.gitRevision,
    }; // Os gates de 3 strings são tradução POSTERIOR aos controles estritos, nunca prova própria.
    const result = await applyRestricted0145({ preflight: state.original, canonicalTarget: state.target.reference,
      gates: originalGates, createConnection: async () => {
        const connection = await state.connections.open();
        try {
          const observed = await inspect(connection, state.connections);
          if (!state.completed) stableBaseline(state.baseline, observed);
          else stageValid(state, observed, state.completed);
          if (writer) return readOnly(connection, state.connections);
          writer = connection;
          return {
            getIdentity: () => state.connections.identity(connection),
            close: () => state.connections.release(connection),
            query: async (sql, params = []) => {
              const value = await connection.query(sql, params);
              if (sql === ledgerSql || sql === `${ledgerSql} FOR UPDATE`) {
                const ledger = rows(value);
                if (state.markerAttempted) assert0145CommittedLedger(state.baseline.ledger, ledger, state.attested.contract);
                else requireThat(same(ledger, state.baseline.ledger), 'ledger_history_changed');
              }
              return value;
            },
            execute: async (sql, params = []) => {
              await control();
              await state.connections.identity(connection);
              if (state.completed < 2) {
                requireThat(!state.transaction && sql === state.attested.artifacts.statements[state.completed]
                  && same(params, []) && state.attempted === state.completed, 'statement_not_in_exact_allowlist');
                const observed = await inspect(connection, state.connections);
                if (!state.completed) stableBaseline(state.baseline, observed); else stageValid(state, observed, state.completed);
                await control();
                state.attempted += 1; // Conta ANTES da chamada: resultado incerto não vira zero.
                const value = await connection.execute(sql);
                state.completed += 1;
                await independent(); // BEFORE retornar ao executor e permitir a próxima declaração.
                stageValid(state, await inspect(connection, state.connections), state.completed);
                state.verified = state.completed;
                return value;
              }
              requireThat(state.verified === 2 && state.transaction && !state.markerAttempted && sql === insertMarker
                && same(params, [EXPECTED_SQL_SHA256, MIGRATION_TIMESTAMP]), 'marker_not_authorized');
              await independent();
              stageValid(state, await inspect(connection, state.connections), 2);
              requireThat(same(rows(await connection.query(`${ledgerSql} FOR UPDATE`, [])), state.baseline.ledger), 'locked_ledger_changed');
              await control();
              state.markerAttempted = true;
              const value = await connection.execute(sql, params);
              assert0145CommittedLedger(state.baseline.ledger, rows(await connection.query(`${ledgerSql} FOR UPDATE`, [])), state.attested.contract);
              state.insertVerified = true;
              return value;
            },
            beginTransaction: async () => {
              await control(); requireThat(state.verified === 2 && !state.transaction, 'transaction_not_ready');
              await independent(); stageValid(state, await inspect(connection, state.connections), 2);
              await control();
              state.transaction = true; await connection.beginTransaction();
            },
            commit: async () => {
              await control(); requireThat(state.transaction && state.insertVerified && !state.commitComplete, 'commit_not_ready');
              await state.connections.identity(connection);
              assert0145CommittedLedger(state.baseline.ledger, rows(await connection.query(`${ledgerSql} FOR UPDATE`, [])), state.attested.contract);
              await independent();
              await control();
              state.commitAttempted = true;
              await connection.commit(); state.commitComplete = true; state.transaction = false;
            },
            rollback: async () => { if (state.transaction && !state.commitAttempted) { await connection.rollback(); state.transaction = false; } },
          };
        } catch (error) { await state.connections.release(connection); throw error; }
      } });
    requireThat(result.ok && state.commitComplete && state.verified === 2, 'restricted_executor_stopped');
    await independent(true); // Sessão nova, diferente de writer e de TODAS as leituras anteriores; depois do commit.
    state.postCommitVerified = true;
    return report(true, 'complete', 'applied_and_independently_verified', state);
  } catch {
    if (writer && state.transaction && !state.commitAttempted) { try { await writer.rollback(); } catch {} }
    return report(false, 'apply', 'execution_stopped_no_retry', state);
  } finally { await state.connections.cleanup(); applying.delete(state.options.createConnection); }
}
