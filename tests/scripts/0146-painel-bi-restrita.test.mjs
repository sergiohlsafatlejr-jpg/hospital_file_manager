import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

// Somente fixtures sintéticas: nenhum mysql, subprocesso, ambiente ou rede real.
const root = new URL('../../', import.meta.url);
const realRead = fs.readFile, realHash = crypto.createHash, realExec = childProcess.execFile;
const hash = value => realHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const revision = 'a'.repeat(40), legacyDigest = 'ddba1fe00d43958df2e585b43887c52b495736cce7a508279518b9dcd9bbb452';
const m144 = { hash: '8539b8ac532a578d39345403c5b2074f922957438be06ca53854162a759ba0b8', created_at: 1793303472606 };
const m145 = { hash: 'cde762c7cfdb9626ec948ba22ffd069790ff8e974b3fcc469d428a9022b215c1', created_at: 1793720945369 };
const earlier = [...Array.from({ length: 104 }, (_, i) => ({ id: i + 1, hash: i < 3 ? `synthetic-legacy-${i}` : hash(`synthetic-${i}`), created_at: i + 1 })), { id: 105, ...m144 }];
const fixtureBytes = JSON.stringify(stable(earlier));
const baseline = [...clone(earlier), { id: 106, ...m145 }];
let remapFixtureHash = true, gitState = {}, gitCalls = 0, fsCalls = 0;
// Remapeamento é exclusivo dos bytes fixos de UMA fixture. Nenhuma política é injetada ao executor.
crypto.createHash = (...args) => {
  const real = realHash(...args), chunks = [];
  return { update(value, encoding) { chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value, encoding)); real.update(value, encoding); return this; },
    digest(encoding) {
      const exactFixture = Buffer.concat(chunks).toString() === fixtureBytes;
      return remapFixtureHash && args[0] === 'sha256' && encoding === 'hex' && exactFixture ? legacyDigest : real.digest(encoding);
    } };
};
async function syntheticGit(command, args) {
  gitCalls++; assert.equal(command, 'git');
  if (gitState.fail) throw new Error('SECRET Git diagnostic');
  let stdout;
  if (args[0] === 'rev-parse') stdout = `${gitState.revision ?? revision}\n`;
  else if (args[0] === 'status') stdout = gitState.dirty ? '?? untracked-sensitive-file\n' : '';
  else if (args[0] === 'show') {
    const relative = args[1].slice(args[1].indexOf(':') + 1);
    stdout = await realRead(new URL(relative, root));
    if (gitState.changed === relative) stdout = Buffer.concat([stdout, Buffer.from('fixture-altered')]);
  } else throw new Error('unexpected Git command');
  return { stdout: Buffer.from(stdout), stderr: '' };
}
childProcess.execFile = Object.assign((command, args, options, callback) => {
  syntheticGit(command, args).then(r => callback(null, r.stdout, ''), e => callback(e));
}, { [promisify.custom]: syntheticGit });
fs.readFile = async (...args) => { fsCalls++; return realRead(...args); };
syncBuiltinESMExports();
const beforeImport = { gitCalls, fsCalls };
const api = await import('../../scripts/migrations/0146-painel-bi-restrita.mjs');
assert.deepEqual({ gitCalls, fsCalls }, beforeImport, 'import deve ser inerte, inclusive arquivo/Git');
test.after(() => { crypto.createHash = realHash; childProcess.execFile = realExec; fs.readFile = realRead; syncBuiltinESMExports(); });
const snapshot = JSON.parse(await realRead(new URL('drizzle/meta/0146_snapshot.json', root))).tables.estabelecimento_bi_personalizado;
const exactSql = await realRead(new URL('drizzle/0146_painel_bi_personalizado.sql', root), 'utf8');
// Certificado PÚBLICO de fixture já integrado; chave privada inexistente. Nenhuma rede.
const oldTests = await realRead(new URL('tests/scripts/0145-rpa-execucao-verificada.test.mjs', root), 'utf8');
const pem = oldTests.match(/const pem = `([\s\S]*?)`;/)[1];
const cert = new crypto.X509Certificate(pem), fingerprint = hash(cert.raw);
const table = 'estabelecimento_bi_personalizado';
function catalog(created) {
  if (!created) return { tables: [], columns: [], indexes: [], foreignKeys: [] };
  return {
    tables: [{ TABLE_NAME: table, TABLE_TYPE: 'BASE TABLE' }],
    columns: Object.values(snapshot.columns).map((c, i) => ({ TABLE_NAME: table, COLUMN_NAME: c.name,
      ORDINAL_POSITION: i + 1, COLUMN_TYPE: c.type, IS_NULLABLE: c.notNull ? 'NO' : 'YES', COLUMN_DEFAULT: c.default ?? null,
      EXTRA: [c.autoincrement ? 'auto_increment' : '', c.onUpdate ? 'on update CURRENT_TIMESTAMP' : ''].filter(Boolean).join(' ') })),
    indexes: [['PRIMARY', 'id'], ['uq_estab_bi_personalizado', 'estabelecimento_id']].map(([INDEX_NAME, COLUMN_NAME]) => ({
      TABLE_NAME: table, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX: 1, NON_UNIQUE: 0, SUB_PART: null, INDEX_TYPE: 'BTREE' })), foreignKeys: [],
  };
}
const layout = [
  { COLUMN_NAME: 'id', ORDINAL_POSITION: 1, COLUMN_TYPE: 'bigint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: 'auto_increment' },
  { COLUMN_NAME: 'hash', ORDINAL_POSITION: 2, COLUMN_TYPE: 'text', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: '' },
  { COLUMN_NAME: 'created_at', ORDINAL_POSITION: 3, COLUMN_TYPE: 'bigint', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null, EXTRA: '' },
];
let sequence = 0;
class Database {
  constructor(options, target) {
    this.options = options; this.target = target; this.created = Boolean(options.preexisting); this.ledger = clone(baseline);
    this.layout = clone(layout); this.events = []; this.sessions = []; this.lockOwner = null;
  }
  async connect() {
    if (this.options.reusedObject && this.sessions.length) return this.sessions[0];
    const db = this, id = this.sessions.length + 1;
    let closed = false, pending = null;
    const tls = this.options.sharedTls && this.sessions.length ? this.sessions[0].tls
      : Object.freeze({ verified: true, host: this.target.host, certificateFingerprint: fingerprint });
    const check = () => assert.equal(closed, false, 'sessão fechada não pode ser usada');
    const c = { tls,
      async getIdentity() {
        check(); return { ...db.target, tlsVerified: true, tls,
          connectionId: db.options.reusedSession ? 'same' : `session-${id}`, ...(db.options.identity?.(id, db.created) ?? {}) };
      },
      async query(sql, params = []) {
        check(); db.events.push({ op: 'read', id, sql, params: clone(params) });
        let value;
        const physical = catalog(db.created); db.options.catalog?.(physical, db.created, id);
        if (sql.includes('0146 tables')) { assert.deepEqual(params, [table]); value = physical.tables; }
        else if (sql.includes('0146 columns')) { assert.deepEqual(params, [table]); value = physical.columns; }
        else if (sql.includes('0146 indexes')) { assert.deepEqual(params, [table]); value = physical.indexes; }
        else if (sql.includes('0146 foreign keys')) { assert.deepEqual(params, [table, table]); value = physical.foreignKeys; }
        else if (sql.includes('ledger layout')) value = db.layout;
        else if (sql.includes('COUNT(*)')) { assert.equal(db.created, true); value = [{ row_count: db.options.count ?? 0 }]; }
        else if (sql.includes('FROM `__drizzle_migrations`')) {
          if (sql.endsWith('FOR UPDATE')) {
            assert.notEqual(pending, null, 'FOR UPDATE requer transação');
            assert.ok(db.lockOwner === null || db.lockOwner === id, 'lock físico exclusivo'); db.lockOwner = id;
            db.options.onLock?.(db, pending);
          }
          value = pending ?? db.ledger;
        } else throw new Error('query fora da allowlist');
        value = clone(value); db.options.rows?.(value, sql, id, db.created, pending !== null);
        return { rows: value };
      },
      async execute(sql, params = []) {
        check(); db.events.push({ op: 'execute', id, sql, params: clone(params) });
        if (sql.startsWith('CREATE')) {
          assert.equal(sql, exactSql); assert.deepEqual(params, []); assert.equal(db.created, false);
          db.created = true; db.options.afterCreate?.(db);
          if (db.options.createBarrier) await db.options.createBarrier;
          if (db.options.failCreate) throw new Error('SECRET CREATE sql password detail');
          return { affectedRows: 0 };
        }
        assert.equal(sql, 'INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)');
        assert.notEqual(pending, null); assert.equal(db.lockOwner, id);
        pending.push({ id: 107, hash: params[0], created_at: params[1] }); db.options.pending?.(pending);
        if (db.options.failInsert) throw new Error('SECRET insert detail');
        return { affectedRows: db.options.affectedRows ?? 1 };
      },
      async beginTransaction() {
        assert.equal(this, c); check(); assert.equal(pending, null); db.events.push({ op: 'begin', id });
        pending = clone(db.ledger);
        if (db.options.failBegin) throw new Error('SECRET begin failure');
      },
      async commit() {
        assert.equal(this, c); check(); assert.notEqual(pending, null); db.events.push({ op: 'commit', id });
        db.ledger = pending; pending = null; db.lockOwner = null; db.options.afterCommit?.(db);
        if (db.options.failCommit) throw new Error('SECRET ambiguous commit');
      },
      async rollback() { assert.equal(this, c); check(); db.events.push({ op: 'rollback', id }); pending = null; db.lockOwner = null; },
      async close() { assert.equal(closed, false); db.events.push({ op: 'close', id }); closed = true; },
    };
    if (db.options.missingMethod) delete c[db.options.missingMethod];
    db.sessions.push(c); return c;
  }
}
async function fixture(options = {}) {
  gitState = {}; remapFixtureHash = true;
  const canonicalTarget = { reference: 'synthetic-target', host: 'db.example.invalid', databaseName: `synthetic_${++sequence}`,
    serverProduct: 'tidb', serverVersion: '8.0.11-TiDB-v8.5.3-serverless', certificateFingerprint: fingerprint, certificatePem: pem };
  const publicTarget = Object.fromEntries(Object.entries(canonicalTarget).filter(([k]) => k !== 'certificatePem'));
  const db = new Database(options, publicTarget), attestation = await api.loadRestricted0146Attestation();
  assert.equal(attestation.ok, true, 'Git sintético não é atestação de produção');
  const context = { db, manifest: {
    approvedBy: 'Sergio', issue: 34, scope: [api.MIGRATION_TAG], approvalRevision: revision, reviewRevision: revision,
    gitRevision: revision, reviewReference: 'synthetic-review-only', exactSql: api.EXPECTED_SQL_SHA256, fileSha256: clone(attestation.fileSha256),
    canonicalTarget: publicTarget, physicalContract: { tables: 1, columns: 12, primaryKeys: 1, uniqueIndexes: 1, empty: true },
    authorization: { reference: 'synthetic-approval-only', operator: 'synthetic-operator', operation: 'applyRestricted0146', only0146: true },
    reservation: { reference: 'synthetic-reservation-only', issue: 34, status: 'MIGRAÇÃO RESERVADA', exclusive: true,
      migrationTag: api.MIGRATION_TAG, revision, operator: 'synthetic-operator' },
    backupExceptionOrProof: { kind: 'exception', approvedBy: 'Sergio', confirmed: true, migrationTag: api.MIGRATION_TAG,
      confirmationReference: 'synthetic-exception-only', riskReference: 'synthetic-risk-only', exceptionAuthorized: true,
      waivedRequirements: ['backup', 'recovery', 'homologation'] },
    window: { issuedAt: Date.now(), expiresAt: Date.now() + 290000 },
  } };
  context.options = { canonicalTarget, createConnection: db.connect.bind(db), readIssueApprovalManifest: async request => {
    assert.deepEqual(request, { issue: 34, migrationTag: api.MIGRATION_TAG, approvalRevision: revision }); return clone(context.manifest);
  } };
  return context;
}
async function run(c) {
  const preflight = await api.preflightRestricted0146(c.options); assert.equal(preflight.ok, true);
  return { preflight, result: await api.applyRestricted0146({ ...c.options, preflight }) };
}
const writes = db => db.events.filter(e => e.op === 'execute');
function noMarker(db) { assert.equal(writes(db).some(e => e.sql.startsWith('INSERT')), false); }
function sanitized(value) {
  const text = JSON.stringify(value); for (const bad of ['SECRET', 'db.example.invalid', 'synthetic_', fingerprint, exactSql, 'baselineLedger', 'session-']) assert.equal(text.includes(bad), false);
  assert.equal(value.noRetry, true); assert.equal(value.retryAllowed, false);
}
function closed(db) {
  db.sessions.forEach((_, i) => assert.equal(db.events.filter(e => e.op === 'close' && e.id === i + 1).length, 1));
}

test('import inerte, SQL/snapshot reais têm 12 colunas e hash exato', () => {
  assert.deepEqual({ gitCalls: beforeImport.gitCalls, fsCalls: beforeImport.fsCalls }, beforeImport);
  assert.equal(Object.keys(snapshot.columns).length, 12); assert.equal(hash(exactSql), api.EXPECTED_SQL_SHA256);
});
test('baseline sintética NÃO passa digest real nem política permissiva de options', async () => {
  const c = await fixture(); remapFixtureHash = false;
  try {
    assert.throws(() => api.assert0146LedgerBaseline(baseline), /fixed_baseline_digest_invalid/);
    c.options.baselinePolicy = { sha256: hash(fixtureBytes), rowCount: 105, allowAnyHash: true };
    const result = await api.preflightRestricted0146(c.options); assert.equal(result.ok, false); assert.equal(writes(c.db).length, 0);
  } finally { remapFixtureHash = true; }
});
test('caminho completo: CREATE integral único, nova prova física/COUNT antes marker, lock e nova sessão póscommit', async () => {
  const c = await fixture(), { preflight, result } = await run(c);
  assert.equal(result.ok, true); assert.equal(result.phase, 'complete'); assert.equal(result.ddlCount, 1);
  assert.equal(result.ddlVerifiedCount, 1); assert.equal(result.uncertain, false); assert.equal(result.columns, 12);
  const events = c.db.events, create = events.findIndex(e => e.op === 'execute' && e.sql.startsWith('CREATE'));
  const insert = events.findIndex(e => e.op === 'execute' && e.sql.startsWith('INSERT'));
  const writer = events[create].id, beforeMarker = events.slice(create + 1, insert).filter(e => e.op === 'read' && e.id !== writer);
  for (const text of ['0146 columns', '0146 indexes', '0146 foreign keys', 'COUNT(*)']) assert.ok(beforeMarker.some(e => e.sql.includes(text)));
  assert.ok(events.slice(create, insert).some(e => e.sql?.endsWith('FOR UPDATE')));
  assert.equal(writes(c.db).length, 2); assert.equal(writes(c.db)[0].sql, exactSql);
  assert.deepEqual(writes(c.db)[1].params, [api.EXPECTED_SQL_SHA256, 1794400248375]);
  const commit = events.findIndex(e => e.op === 'commit'), postReads = events.slice(commit + 1).filter(e => e.op === 'read');
  const postId = postReads[0].id; assert.notEqual(postId, writer); assert.ok(!events.slice(0, commit).some(e => e.id === postId));
  assert.ok(postReads.some(e => e.sql.includes('COUNT(*)'))); assert.ok(postReads.some(e => e.sql.includes('FROM `__drizzle_migrations`')));
  assert.deepEqual(c.db.ledger.slice(0, 106), baseline); assert.equal(c.db.ledger.length, 107);
  assert.equal((await api.applyRestricted0146({ ...c.options, preflight })).ok, false); assert.equal(writes(c.db).length, 2);
  sanitized(preflight); sanitized(result); closed(c.db);
});
for (const [name, change] of [
  ['missing approval', c => { delete c.options.readIssueApprovalManifest; }],
  ['aprovador inventado', c => { c.manifest.approvedBy = 'Manus'; }],
  ['sem backup/exceção', c => { delete c.manifest.backupExceptionOrProof; }],
  ['exceção0145', c => { c.manifest.backupExceptionOrProof.migrationTag = '0145_rpa_fila_envio_xml_portal'; }],
  ['exceção pendente', c => { c.manifest.backupExceptionOrProof.confirmed = false; }],
  ['sem revisão', c => { delete c.manifest.reviewReference; }],
  ['sem autorização', c => { delete c.manifest.authorization; }],
  ['reserva não exclusiva', c => { c.manifest.reservation.exclusive = false; }],
  ['hashSQL incorreto', c => { c.manifest.exactSql = 'b'.repeat(64); }],
  ['revisão inexata', c => { c.manifest.approvalRevision = 'b'.repeat(40); }],
  ['hasharquivo inexato', c => { c.manifest.fileSha256[api.REVIEWED_FILES[0]] = 'b'.repeat(64); }],
  ['13colunas inventadas', c => { c.manifest.physicalContract.columns = 13; }],
  ['alvo diferente', c => { c.manifest.canonicalTarget.host = 'wrong.invalid'; }],
  ['janela expirada', c => { c.manifest.window.issuedAt = Date.now() - 100000; c.manifest.window.expiresAt = Date.now() - 1; }],
  ['janela longa', c => { c.manifest.window.expiresAt = c.manifest.window.issuedAt + 300001; }],
]) test(`gate ${name} bloqueia antes de conexão`, async () => {
  const c = await fixture(); change(c); const r = await api.preflightRestricted0146(c.options);
  assert.equal(r.ok, false); assert.equal(c.db.sessions.length, 0); sanitized(r);
});
test('prova durável completa é alternativa à exceção; incompleta não é', async () => {
  const c = await fixture(); c.manifest.backupExceptionOrProof = { kind: 'proof', migrationTag: api.MIGRATION_TAG, approvedBy: 'Sergio',
    confirmed: true, confirmationReference: 'synthetic-confirmation', riskReference: 'synthetic-risk', durable: true, restorationVerified: true,
    proofReference: 'synthetic-proof', restorationReference: 'synthetic-restore', recoveryOwner: 'synthetic-owner', retentionReference: 'synthetic-retention' };
  assert.equal((await api.preflightRestricted0146(c.options)).ok, true); closed(c.db);
  delete c.manifest.backupExceptionOrProof.restorationReference;
  const sessions = c.db.sessions.length; assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(c.db.sessions.length, sessions);
});
for (const kind of ['reusedObject', 'reusedSession', 'sharedTls']) test(`sessão independente: ${kind} rejeitado`, async () => {
  const c = await fixture({ [kind]: true }); assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(writes(c.db).length, 0);
});
for (const method of ['query', 'execute', 'getIdentity', 'close', 'beginTransaction', 'commit', 'rollback']) test(`adapter sem ${method} não passa preflight`, async () => {
  const c = await fixture({ missingMethod: method }); assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(writes(c.db).length, 0);
});
for (const override of [{ tlsVerified: false }, { serverProduct: 'MariaDB' }, { databaseName: 'other' }, { host: 'other.invalid' },
  { serverVersion: 'TiDB-wrong' }, { certificateFingerprint: 'b'.repeat(64) }, { tls: { verified: false } }]) test(`handshake/alvo ${Object.keys(override)[0]} rejeitado`, async () => {
  const c = await fixture({ identity: () => override }); assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(writes(c.db).length, 0);
});
test('certificado de hostname diferente bloqueia antes de abrir sessão', async () => {
  const c = await fixture(); c.options.canonicalTarget.host = 'wrong.invalid'; assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(c.db.sessions.length, 0);
});
for (const [name, mutate] of [
  ['tipo', l => { l[1].COLUMN_TYPE = 'varchar(64)'; }], ['ordem', l => { l[1].ORDINAL_POSITION = 3; }],
  ['null', l => { l[2].IS_NULLABLE = 'NO'; }], ['default', l => { l[1].COLUMN_DEFAULT = ''; }], ['extra', l => { l[0].EXTRA = ''; }],
]) test(`layout ledger ${name} bloqueia`, async () => {
  const c = await fixture(); mutate(c.db.layout); assert.equal((await api.preflightRestricted0146(c.options)).ok, false); noMarker(c.db);
});
for (const [name, mutate] of [
  ['hash legado', l => { l[0].hash += '-changed'; }], ['hash normal', l => { l[10].hash = 'b'.repeat(64); }],
  ['id', l => { l[10].id = 999; }], ['timestamp', l => { l[10].created_at = 999; }],
  ['registro apagado', l => { l.splice(10, 1); }], ['quarta legacy', l => { l[10].hash = 'legacy-four'; }],
  ['NULL', l => { l[10].created_at = null; }], ['0145hash', l => { l[105].hash = 'b'.repeat(64); }],
  ['0145timestamp', l => { l[105].created_at += 1; }], ['0145 ausente', l => { l.pop(); }],
  ['campo extra', l => { l[0].extra = true; }], ['0146 antecipado', l => { l[0].created_at = api.MIGRATION_TIMESTAMP; }],
]) test(`baseline fixa recusa ${name}`, () => { const l = clone(baseline); mutate(l); assert.throws(() => api.assert0146LedgerBaseline(l)); });
test('tabela preexistente impede CREATE mesmo sem marker', async () => {
  const c = await fixture({ preexisting: true }); assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(writes(c.db).length, 0);
});
test('ledger diverge somente no segundo leitor independente', async () => {
  const c = await fixture({ rows: (r, sql, id) => { if (id === 2 && sql.includes('FROM `__drizzle_migrations`')) r[0].hash += '-changed'; } });
  assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(writes(c.db).length, 0);
});
test('token fabricado/clonado não permite abrir conexão ou escrever', async () => {
  const c = await fixture(); assert.equal((await api.applyRestricted0146({ ...c.options, preflight: { ok: true } })).ok, false); assert.equal(c.db.sessions.length, 0);
  const p = await api.preflightRestricted0146(c.options); assert.equal(p.ok, true);
  assert.equal((await api.applyRestricted0146({ ...c.options, preflight: clone(p) })).ok, false); assert.equal(writes(c.db).length, 0);
});
test('preflight expirado usa relógio real e é consumido na falha', async () => {
  const c = await fixture(), p = await api.preflightRestricted0146(c.options), now = Date.now();
  const clock = mock.method(Date, 'now', () => now + 300001);
  try { assert.equal((await api.applyRestricted0146({ ...c.options, preflight: p, now })).ok, false); }
  finally { clock.mock.restore(); }
  assert.equal((await api.applyRestricted0146({ ...c.options, preflight: p })).ok, false); assert.equal(writes(c.db).length, 0);
});
for (const state of [{ dirty: true }, { revision: 'b'.repeat(40) }, { changed: api.REVIEWED_FILES[0] },
  { changed: 'drizzle/0146_painel_bi_personalizado.sql' }, { fail: true }]) test(`artefatos/Git alterados bloqueiam: ${Object.keys(state)[0]}`, async () => {
  const c = await fixture(), p = await api.preflightRestricted0146(c.options); gitState = state;
  try { const r = await api.applyRestricted0146({ ...c.options, preflight: p }); assert.equal(r.ok, false); assert.equal(writes(c.db).length, 0); sanitized(r); }
  finally { gitState = {}; }
});
for (const [name, mutate] of [
  ['tipo', c => { c.columns[1].COLUMN_TYPE = 'varchar(40)'; }], ['ordem', c => { c.columns[1].ORDINAL_POSITION = 3; }],
  ['null', c => { c.columns[1].IS_NULLABLE = 'YES'; }], ['default', c => { c.columns[2].COLUMN_DEFAULT = 'WRONG'; }],
  ['extra', c => { c.columns.at(-1).EXTRA = ''; }], ['coluna13', c => { c.columns.push(clone(c.columns[0])); }],
  ['PK', c => { c.indexes[0].COLUMN_NAME = 'estabelecimento_id'; }], ['UNIQUE', c => { c.indexes[1].NON_UNIQUE = 1; }],
  ['prefix', c => { c.indexes[0].SUB_PART = 1; }], ['seq', c => { c.indexes[0].SEQ_IN_INDEX = 2; }],
  ['indexType', c => { c.indexes[0].INDEX_TYPE = 'HASH'; }], ['indexExtra', c => { c.indexes.push(clone(c.indexes[0])); }],
  ['FK', c => { c.foreignKeys.push({ TABLE_NAME: table, CONSTRAINT_NAME: 'synthetic-fk' }); }],
]) test(`verificação ${name} falha na conexão NOVA antes do marker`, async () => {
  const c = await fixture({ catalog: (cat, created, id) => { if (created && id !== 3) mutate(cat); } }), { result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.phase, 'verify-create'); assert.equal(result.ddlCount, 1);
  assert.equal(result.ddlVerifiedCount, 0); assert.equal(result.uncertain, true); noMarker(c.db); closed(c.db); sanitized(result);
});
test('representações catalogadas equivalentes TiDB aceitas sem relaxar semântica', async () => {
  const c = await fixture({ catalog: (cat, created) => { if (!created) return;
    cat.columns[0].COLUMN_TYPE = 'int(11)'; cat.columns.at(-2).COLUMN_DEFAULT = 'CURRENT_TIMESTAMP()';
    cat.columns.at(-2).EXTRA = 'DEFAULT_GENERATED'; cat.columns.at(-1).COLUMN_DEFAULT = 'CURRENT_TIMESTAMP';
    cat.columns.at(-1).EXTRA = 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP()';
  } }); assert.equal((await run(c)).result.ok, true);
});
test('tabela com uma linha bloqueia marker', async () => { const c = await fixture({ count: 1 }), { result } = await run(c); assert.equal(result.ok, false); noMarker(c.db); });
test('erro CREATE é incerto e não repete com token antigo ou novo', async () => {
  const c = await fixture({ failCreate: true }), { preflight, result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.phase, 'create'); assert.equal(result.ddlCount, 1); assert.equal(result.uncertain, true); noMarker(c.db); sanitized(result);
  assert.equal((await api.applyRestricted0146({ ...c.options, preflight })).ok, false);
  c.db.created = false; const another = await api.preflightRestricted0146(c.options); assert.equal(another.ok, true);
  assert.equal((await api.applyRestricted0146({ ...c.options, preflight: another })).ok, false); assert.equal(writes(c.db).length, 1);
});
test('ledger alterado depois CREATE permanece alterado, sem marker/reparo', async () => {
  const c = await fixture({ afterCreate: db => { db.ledger[0].hash += '-changed'; } }), { result } = await run(c);
  assert.equal(result.ok, false); noMarker(c.db); assert.ok(c.db.ledger[0].hash.endsWith('-changed'));
});
test('concorrência ledger alterada precisamente em FOR UPDATE impede marker', async () => {
  let changed = false;
  const c = await fixture({ onLock: (db, pending) => { if (!changed) { changed = true; pending[0].hash += '-concurrent'; db.ledger[0].hash += '-concurrent'; } } }), { result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.phase, 'marker'); assert.equal(result.ddlVerifiedCount, 1); noMarker(c.db);
  assert.ok(c.db.events.some(e => e.op === 'rollback')); assert.ok(c.db.ledger[0].hash.endsWith('-concurrent'));
});
for (const option of ['failBegin', 'failInsert']) test(`erro ${option}: para sem commit/retry`, async () => {
  const c = await fixture({ [option]: true }), { result } = await run(c); assert.equal(result.ok, false);
  assert.equal(c.db.events.some(e => e.op === 'commit'), false); assert.deepEqual(c.db.ledger, baseline); sanitized(result);
});
for (const mutate of [l => { l[0].hash += '-changed'; }, l => { l.pop(); }, l => { l.at(-1).created_at += 1; }]) test('marker/linhas alterados na transação impedem commit', async () => {
  const c = await fixture({ pending: mutate }), { result } = await run(c); assert.equal(result.ok, false);
  assert.equal(c.db.events.some(e => e.op === 'commit'), false); assert.deepEqual(c.db.ledger, baseline);
});
test('commit ambíguo não causa rollback nem repetição, marker fica incerto', async () => {
  const c = await fixture({ failCommit: true }), { preflight, result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.phase, 'commit'); assert.equal(result.journalOutcomeUncertain, true);
  assert.equal(c.db.events.filter(e => e.op === 'commit').length, 1); assert.equal(c.db.events.some(e => e.op === 'rollback'), false);
  assert.equal(c.db.ledger.length, 107); assert.equal((await api.applyRestricted0146({ ...c.options, preflight })).ok, false); sanitized(result);
});
for (const mutate of [db => { db.ledger[0].hash += '-changed'; }, db => { db.ledger.pop(); }, db => { db.options.count = 1; }]) test('póscommit independente detecta divergência e não repara', async () => {
  const c = await fixture({ afterCommit: mutate }), { result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.phase, 'verify-commit'); assert.equal(result.journalOutcomeUncertain, true);
  assert.equal(writes(c.db).length, 2); assert.equal(c.db.events.some(e => e.op === 'rollback'), false);
});
test('singleflight por alvo mesmo com factories diferentes e tokens válidos', async () => {
  let release; const barrier = new Promise(r => { release = r; });
  const c = await fixture({ createBarrier: barrier });
  const d = { ...c.options, createConnection: (...args) => c.options.createConnection(...args) };
  const p = await api.preflightRestricted0146(c.options), q = await api.preflightRestricted0146(d); assert.equal(p.ok && q.ok, true);
  const pendingApply = api.applyRestricted0146({ ...c.options, preflight: p });
  for (let i = 0; i < 500 && !writes(c.db).length; i++) await new Promise(r => setTimeout(r, 2));
  assert.equal(writes(c.db).length, 1);
  const other = await api.applyRestricted0146({ ...d, preflight: q }); assert.equal(other.ok, false);
  release(); assert.equal((await pendingApply).ok, true); assert.equal(writes(c.db).length, 2);
});

function rawFixture(overrides = {}) {
  const events = [], peer = { ...cert.toLegacyObject(), raw: cert.raw };
  const socket = { encrypted: true, authorized: true, getPeerCertificate: () => peer, ...overrides };
  const raw = { connection: { stream: socket }, async query(sql, params) {
    events.push({ op: 'query', sql, params });
    return sql.includes('adapter identity') ? [[{ database_name: 'synthetic_adapter', server_version: 'TiDB-v8.5.3', connection_id: 900 }]] : [{ affectedRows: 1 }];
  }, async commit() { events.push({ op: 'commit' }); }, async rollback() { events.push({ op: 'rollback' }); }, async end() { events.push({ op: 'end' }); } };
  const options = { host: 'db.example.invalid', database: 'synthetic_adapter', ssl: { ca: pem, rejectUnauthorized: true, verifyIdentity: true, servername: 'db.example.invalid' } };
  let callOptions;
  const mysql = { async createConnection(o) { callOptions = o; return raw; } };
  return { raw, events, options, mysql, get callOptions() { return callOptions; } };
}
test('adapter real injetado: construção sem I/O, handshake verificado e transação pessimista real', async () => {
  const f = rawFixture(), factory = api.createInjectedMysql2TlsFactory({ mysql: f.mysql, connectionOptions: f.options });
  assert.equal(f.callOptions, undefined);
  const c = await factory.createConnection(), a = await c.getIdentity(), b = await c.getIdentity();
  assert.equal(a.tls, b.tls); assert.equal(a.connectionId, 900); assert.equal(a.tlsVerified, true);
  assert.equal(f.callOptions.multipleStatements, false); assert.equal(f.callOptions.ssl.verifyIdentity, true);
  assert.equal(f.callOptions.supportBigNumbers, true); assert.equal(f.callOptions.bigNumberStrings, false);
  await c.beginTransaction(); await c.execute(exactSql, []); await c.commit(); await c.close();
  assert.ok(f.events.some(e => e.sql === 'BEGIN PESSIMISTIC')); assert.ok(f.events.some(e => e.sql === exactSql));
});
for (const override of [{ encrypted: false }, { authorized: false }, { authorizationError: 'insecure' }, { getPeerCertificate: () => ({}) }]) test('adapter recusa handshake inseguro sem consulta', async () => {
  const f = rawFixture(override), factory = api.createInjectedMysql2TlsFactory({ mysql: f.mysql, connectionOptions: f.options });
  await assert.rejects(factory.createConnection(), /injected_mysql2_connection_failed/); assert.equal(f.events.filter(e => e.op === 'query').length, 0);
});
for (const mutate of [o => { o.ssl.rejectUnauthorized = false; }, o => { o.ssl.verifyIdentity = false; }, o => { o.ssl.servername = 'wrong.invalid'; },
  o => { o.multipleStatements = true; }, o => { o.stream = {}; }, o => { o.debug = true; }]) test('options reais inválidos recusados antes de conexão', () => {
  const f = rawFixture(); mutate(f.options); assert.throws(() => api.createInjectedMysql2TlsFactory({ mysql: f.mysql, connectionOptions: f.options })); assert.equal(f.callOptions, undefined);
});
test('adapter detecta troca do socket durante sessão', async () => {
  const f = rawFixture(), c = await api.createInjectedMysql2TlsFactory({ mysql: f.mysql, connectionOptions: f.options }).createConnection();
  f.raw.connection.stream = {}; await assert.rejects(c.getIdentity(), /tls_handshake_invalid/); await c.close();
});

test('manifesto revogado entre preflight/apply para antes CREATE', async () => {
  const c = await fixture(), p = await api.preflightRestricted0146(c.options);
  c.manifest.reservation.exclusive = false;
  const r = await api.applyRestricted0146({ ...c.options, preflight: p });
  assert.equal(r.ok, false); assert.equal(writes(c.db).length, 0); sanitized(r);
});
test('manifesto revogado após CREATE impede marker sem repetir DDL', async () => {
  const c = await fixture(); c.db.options.afterCreate = () => { c.manifest.backupExceptionOrProof.confirmed = false; };
  const { result } = await run(c); assert.equal(result.ok, false); assert.equal(writes(c.db).length, 1); noMarker(c.db); sanitized(result);
});
test('expiração depois CREATE para antes marker com DDL já verificada', async () => {
  const c = await fixture(); const now = Date.now(); let clock;
  c.db.options.afterCreate = () => { clock = mock.method(Date, 'now', () => now + 300001); };
  try { const { result } = await run(c); assert.equal(result.ok, false); assert.equal(result.ddlCount, 1); noMarker(c.db); }
  finally { clock?.mock.restore(); }
});
test('troca de connectionId em sessão escritora após CREATE impede marker', async () => {
  const c = await fixture({ identity: (id, created) => id === 3 && created ? { connectionId: 'session-changed' } : {} });
  const { result } = await run(c); assert.equal(result.ok, false); assert.equal(writes(c.db).length, 1); noMarker(c.db);
});
test('INSERT affectedRows ambíguo interrompe com rollback best-effort e relato incerto', async () => {
  const c = await fixture({ affectedRows: 0 }), { result } = await run(c);
  assert.equal(result.ok, false); assert.equal(result.journalOutcomeUncertain, true);
  assert.equal(c.db.events.some(e => e.op === 'commit'), false); assert.deepEqual(c.db.ledger, baseline); sanitized(result);
});
test('préflight dirtyGit bloqueia mesmo manifesto preenchido, sem abrir sessões', async () => {
  const c = await fixture(); gitState = { dirty: true };
  try { assert.equal((await api.preflightRestricted0146(c.options)).ok, false); assert.equal(c.db.sessions.length, 0); }
  finally { gitState = {}; }
});
