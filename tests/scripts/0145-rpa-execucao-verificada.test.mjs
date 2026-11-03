import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, X509Certificate } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

// Git é SOMENTE simulado: nenhum commit, subprocesso, env, rede ou banco real.
// A revisão/manifesto a seguir são fixtures, NÃO evidência de aprovação de Sergio.
const root = new URL('../../', import.meta.url);
const revision = 'a'.repeat(40);
let gitState = {};
const actualExecFile = childProcess.execFile;
async function syntheticGit(command, args) {
  assert.equal(command, 'git');
  assert.ok(['rev-parse', 'diff', 'show'].includes(args[0]));
  if (gitState.error) throw new Error('synthetic sensitive Git detail');
  let stdout = '';
  if (args[0] === 'rev-parse') stdout = `${gitState.revision ?? revision}\n`;
  if (args[0] === 'show') {
    const relative = args[1].slice(args[1].indexOf(':') + 1);
    stdout = await readFile(new URL(relative, root));
    if (gitState.mismatch === relative) stdout = Buffer.concat([stdout, Buffer.from(' altered synthetic bytes')]);
  }
  return { stdout, stderr: '' };
}
childProcess.execFile = Object.assign((command, args, options, callback) => {
  syntheticGit(command, args).then(({ stdout, stderr }) => callback(null, stdout, stderr), error => callback(error, '', ''));
}, { [promisify.custom]: syntheticGit });
syncBuiltinESMExports();
const wrapper = await import('../../scripts/migrations/0145-rpa-execucao-verificada.mjs');
const original = await import('../../scripts/migrations/0145-rpa-fila-envio-xml-restrita.mjs');
const pure = await import('../../scripts/migrations/0145-rpa-verificacao-completa.mjs');
test.after(() => { childProcess.execFile = actualExecFile; syncBuiltinESMExports(); });
const contract = await pure.load0145VerificationContract();
const previous = JSON.parse(await readFile(new URL('drizzle/meta/0144_snapshot.json', root), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
// Certificado público local, chave privada descartada; domínio .invalid sintético.
const pem = `-----BEGIN CERTIFICATE-----
MIIDOjCCAiKgAwIBAgIUQ8fdUnozB8oSEsmxVmtpLcdBMxIwDQYJKoZIhvcNAQEL
BQAwHTEbMBkGA1UEAwwSZGIuZXhhbXBsZS5pbnZhbGlkMB4XDTI2MTEwMzE3MTAw
NloXDTM2MTAzMTE3MTAwNlowHTEbMBkGA1UEAwwSZGIuZXhhbXBsZS5pbnZhbGlk
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuMS8niH1CnuMLhGXzd0g
5fCyL8TRIjSA5Z+ItV0Nw3QYef617PWd8u+BrxfOy8pBRHDTlmBC8gL/KKDNYqJf
5Nxx6GQ8SKaZQS29gHMld7/DXmmwcbr4Xb3ZGPV16He6FekR0BGEnyHwRSm94wWd
+QDHAeaIliROWVjE9pzkRGeppxkaBRSBoM2pW5/g8RGgDp4rNauMGrG4h1UNMDkS
/eahWsk1GCFp3CytUd7m7R/efmdqsaPd3I6nMganxXYGSIaICTKxc31uAw30Wt08
UxGfUGj2Wjblq7Aq0KXm8p43t1vAZpdZoOlPk6Q4LmVnzGz8qW/yqjgTt4EiMsiT
FwIDAQABo3IwcDAdBgNVHQ4EFgQU9CbijCuorOHgRMtoAg9XgH5caSwwHwYDVR0j
BBgwFoAU9CbijCuorOHgRMtoAg9XgH5caSwwDwYDVR0TAQH/BAUwAwEB/zAdBgNV
HREEFjAUghJkYi5leGFtcGxlLmludmFsaWQwDQYJKoZIhvcNAQELBQADggEBAGMD
bVSWwubmAms4rJB/+SQQ3GQPF1a8vuf9+ccHMiwUmHDQGH6p5Yia+fmjL18JxZrJ
hbhhevv/YchrZp4rzx+DjbxW6Sf07Z8pp1iQ1np5v0nWekvQoqmQf0BpfyrtU2vf
x3jwJOcdT7/0kvqfWFzBQ+pnHxfbA+Ac3CGz+gDEK5tkxCPkK0sDaqy4TaXUawbG
xS5hGLQPUrohFz2AR52m7L0gEcpq5VLGgIz04WxWI4nj9do1oRlAlVUrP493KfUh
euXuaCqI8WYQsLQAUVmn2YbaSqeeoJDXHB6F96+UDUrHSPNozgkFMYB5+YU6rVv5
x68WzRpYnGZ5jYkvC4o=
-----END CERTIFICATE-----`;
const fingerprint = sha(new X509Certificate(pem).raw);
const canonicalTarget = {
  reference: 'synthetic-0145-target', serverProduct: 'tidb', databaseName: 'synthetic_0145',
  serverVersion: '8.0.11-TiDB-v8.5.0', host: 'db.example.invalid', certificatePem: pem,
  certificateFingerprint: fingerprint,
};
const publicTarget = Object.fromEntries(Object.entries(canonicalTarget).filter(([key]) => key !== 'certificatePem'));
function catalog(snapshot, names) {
  return {
    tables: names.map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: 'BASE TABLE' })),
    columns: names.flatMap(table => {
      const definitions = snapshot.tables[table].columns;
      const keys = table === 'credenciais_portais'
        ? [...Object.keys(previous.tables[table].columns), ...Object.keys(definitions).filter(name => !previous.tables[table].columns[name])]
        : Object.keys(definitions);
      return keys.map((key, position) => {
        const c = definitions[key];
        return { TABLE_NAME: table, ORDINAL_POSITION: position + 1, COLUMN_NAME: c.name, COLUMN_TYPE: c.type,
          IS_NULLABLE: c.notNull ? 'NO' : 'YES', COLUMN_DEFAULT: c.default ?? null,
          EXTRA: `${c.autoincrement ? 'auto_increment' : ''}${c.onUpdate ? ' on update CURRENT_TIMESTAMP' : ''}`.trim() };
      });
    }),
    indexes: names.flatMap(name => {
      const table = snapshot.tables[name];
      return [...Object.values(table.compositePrimaryKeys).map(index => ({ ...index, name: 'PRIMARY', isUnique: true })),
        ...Object.values(table.indexes)].flatMap(index => index.columns.map((COLUMN_NAME, seq) => ({
          TABLE_NAME: name, INDEX_NAME: index.name, SEQ_IN_INDEX: seq + 1, COLUMN_NAME,
          NON_UNIQUE: index.isUnique ? 0 : 1, SUB_PART: null, EXPRESSION: null, INDEX_TYPE: 'BTREE',
        })));
    }), foreignKeys: [],
  };
}
const stages = [catalog(previous, ['credenciais_portais']), catalog(contract.snapshot, ['credenciais_portais']),
  catalog(contract.snapshot, ['credenciais_portais', 'fila_envio_xml_portal'])];
const layout = [
  { COLUMN_NAME: 'id', ORDINAL_POSITION: 1, COLUMN_TYPE: 'bigint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: 'auto_increment' },
  { COLUMN_NAME: 'hash', ORDINAL_POSITION: 2, COLUMN_TYPE: 'text', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: '' },
  { COLUMN_NAME: 'created_at', ORDINAL_POSITION: 3, COLUMN_TYPE: 'bigint', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null, EXTRA: '' },
];
class SyntheticDatabase {
  constructor(options = {}) {
    this.options = options; this.stage = 0; this.ledger = [{ id: 144, ...contract.previousMarker }];
    this.layout = clone(layout); this.executions = []; this.events = []; this.connections = []; this.reads = [];
  }
  async createConnection() {
    if (this.options.sameObject && this.connections.length) return this.connections[0];
    const database = this, id = this.connections.length + 1;
    let closed = false, pending = null, tls = { verified: true, host: publicTarget.host, certificateFingerprint: fingerprint };
    if (database.options.sharedTls && database.connections.length) tls = database.connections[0].tls;
    const connection = {
      tls,
      async getIdentity() {
        assert.equal(closed, false, 'synthetic adapter used closed connection');
        return { ...publicTarget, tlsVerified: true, tls, connectionId: database.options.sameSession ? 'shared' : `session-${id}`,
          ...(database.options.identityOverride?.(id, database.stage) ?? {}) };
      },
      async query(sql, params = []) {
        assert.equal(closed, false); database.events.push({ operation: 'read', id, stage: database.stage, sql });
        const snapshot = clone(stages[database.stage]);
        database.options.mutateCatalog?.(snapshot, database.stage, id);
        let result;
        if (sql.includes('information_schema`.`tables')) result = snapshot.tables;
        else if (sql.includes('information_schema`.`columns') && sql.includes('__drizzle_migrations')) result = database.layout;
        else if (sql.includes('information_schema`.`columns')) result = snapshot.columns;
        else if (sql.includes('information_schema`.`statistics')) result = snapshot.indexes;
        else if (sql.includes('referential_constraints')) result = snapshot.foreignKeys;
        else if (sql.includes('FROM `__drizzle_migrations`')) result = pending ?? database.ledger;
        else throw new Error('unexpected synthetic query');
        result = clone(result);
        database.options.mutateRows?.(result, sql, id, database.stage, pending !== null);
        if (sql.includes('verified')) database.reads.push({ id, stage: database.stage, sql });
        return { rows: result };
      },
      async execute(sql, params = []) {
        assert.equal(closed, false); database.executions.push({ id, sql, params: clone(params) });
        database.events.push({ operation: 'execute', id, stage: database.stage, sql });
        if (sql === 'INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)') {
          assert.ok(pending, 'marker requires a real synthetic transaction');
          pending.push({ id: 145, hash: params[0], created_at: params[1] });
          database.options.mutateMarker?.(pending);
        } else {
          assert.deepEqual(params, []); database.stage += 1;
          database.options.afterDdl?.(database, database.stage);
          if (database.options.throwDdl === database.stage) throw new Error('SECRET_DB_HOST raw credential diagnostic');
        }
        return { affectedRows: 1 };
      },
      async beginTransaction() {
        assert.equal(this, connection, 'transaction method must remain bound');
        assert.equal(pending, null); pending = clone(database.ledger); database.events.push({ operation: 'begin', id });
        if (database.options.throwBegin) throw new Error('synthetic begin failure');
      },
      async commit() {
        assert.equal(this, connection); assert.ok(pending);
        database.events.push({ operation: 'commit', id }); database.ledger = pending; pending = null;
        database.options.afterCommit?.(database);
        if (database.options.throwCommit) throw new Error('synthetic uncertain commit');
      },
      async rollback() {
        assert.equal(this, connection); database.events.push({ operation: 'rollback', id }); pending = null;
      },
      async close() { database.events.push({ operation: 'close', id }); closed = true; },
    };
    if (database.options.missingMethod) delete connection[database.options.missingMethod];
    database.connections.push(connection); return connection;
  }
}
async function fixture(options = {}) {
  gitState = {};
  const database = new SyntheticDatabase(options), attestation = await wrapper.loadVerified0145Attestation();
  assert.equal(attestation.ok, true, 'synthetic Git only; never a production attestation');
  const gates = {
    approvedBy: 'Sergio', issue: 34, scope: [original.MIGRATION_TAG], approvalRevision: revision,
    reviewRevision: revision, gitRevision: revision, artifactsRevision: original.MIGRATION_TAG,
    exactSql: original.EXPECTED_SQL_SHA256, reviewedFileSha256: attestation.reviewedFileSha256,
    executorDigest: attestation.reviewedFileSha256[wrapper.REVIEWED_FILES[0]],
    wrapperDigest: attestation.reviewedFileSha256[wrapper.REVIEWED_FILES[1]],
    verifierDigest: attestation.reviewedFileSha256[wrapper.REVIEWED_FILES[2]],
    authorization: { reference: 'synthetic-approval-only', operator: 'synthetic-operator', operation: 'applyRestricted0145', only0145: true },
    reservation: { reference: 'synthetic-issue34-reserve', issue: 34, status: 'MIGRAÇÃO RESERVADA', exclusive: true,
      migrationTag: original.MIGRATION_TAG, revision, operator: 'synthetic-operator' },
    backupExceptionOrProof: { approvedBy: 'Sergio', migrationTag: original.MIGRATION_TAG, confirmed: true,
      withoutBackupRecoveryHomologation: true, confirmationReference: 'synthetic-specific-exception' },
    canonicalTarget: clone(publicTarget), window: { issuedAt: Date.now(), expiresAt: Date.now() + 240000 },
  };
  const context = { database, gates, manifest: clone(gates) };
  context.options = { createConnection: database.createConnection.bind(database), canonicalTarget: clone(canonicalTarget), gates,
    readIssueApprovalManifest: async request => {
      assert.equal(request.issue, 34); assert.equal(request.migrationTag, original.MIGRATION_TAG); return clone(context.manifest);
    } };
  return context;
}
async function run(context) {
  const preflight = await wrapper.preflightVerified0145(context.options);
  assert.equal(preflight.ok, true);
  const result = await wrapper.applyVerified0145({ ...context.options, preflight });
  return { preflight, result };
}
function sanitized(result) {
  const text = JSON.stringify(result);
  for (const forbidden of ['synthetic_0145', 'db.example.invalid', fingerprint, 'SECRET_DB_HOST', 'baselineLedger', 'baselineCatalog', 'identity', 'session-']) assert.ok(!text.includes(forbidden), forbidden);
}
function ddlOnly(database) { return database.executions.filter(item => !item.sql.startsWith('INSERT')); }
function noJournal(database) {
  assert.equal(database.executions.some(item => item.sql.startsWith('INSERT')), false);
  assert.deepEqual(database.ledger, [{ id: 144, ...contract.previousMarker }]);
}
function resourcesClosed(database) {
  for (const id of database.connections.map((_, index) => index + 1)) {
    assert.equal(database.events.filter(event => event.operation === 'close' && event.id === id).length, 1, `session ${id} closed exactly once`);
  }
}
function mutateBoth(context, change) { change(context.gates); context.manifest = clone(context.gates); }

test('atestação soma hashes INTEGRAIS reais e exige igualdade byte a byte com Git simulado', async () => {
  gitState = {};
  const result = await wrapper.loadVerified0145Attestation();
  assert.equal(result.ok, true);
  for (const relative of wrapper.REVIEWED_FILES) assert.equal(result.reviewedFileSha256[relative], sha(await readFile(new URL(relative, root))));
  for (const relative of wrapper.REVIEWED_FILES) {
    gitState = { mismatch: relative };
    assert.deepEqual(await wrapper.loadVerified0145Attestation(), { ok: false, reason: 'git_bytes_or_artifacts_unverified' });
  }
  gitState = {};
});

test('delegação original: somente as duas declarações exatas, provas independentes ANTES da próxima, marker e leitura POST commit', async () => {
  const context = await fixture(), { preflight, result } = await run(context);
  assert.equal(result.ok, true); assert.equal(result.phase, 'complete'); assert.equal(result.ddlCount, 2);
  assert.equal(result.ddlVerifiedCount, 2); assert.equal(result.ddlOutcomeUncertain, false); assert.equal(result.journalOutcomeUncertain, false);
  sanitized(preflight); sanitized(result);
  const artifacts = await original.loadRestricted0145Artifacts();
  assert.deepEqual(ddlOnly(context.database).map(item => item.sql), artifacts.statements);
  const events = context.database.events, writes = events.map((event, index) => ({ ...event, index })).filter(event => event.operation === 'execute');
  const first = writes[0], second = writes[1], marker = writes[2];
  for (const [from, to, stage] of [[first, second, 1], [second, marker, 2]]) {
    const independent = events.slice(from.index + 1, to.index).filter(event => event.operation === 'read' && event.id !== first.id && event.stage === stage);
    assert.ok(independent.some(event => event.sql.includes('verified columns')));
    assert.ok(independent.some(event => event.sql.includes('verified indexes')));
    assert.ok(independent.some(event => event.sql.includes('verified foreign keys')));
  }
  assert.deepEqual(context.database.executions[2].params, [original.EXPECTED_SQL_SHA256, original.MIGRATION_TIMESTAMP]);
  const commitIndex = events.findIndex(event => event.operation === 'commit');
  const freshReads = events.slice(commitIndex + 1).filter(event => event.operation === 'read');
  assert.ok(freshReads.some(event => event.sql.includes('FROM `__drizzle_migrations`')));
  const lastId = freshReads[0].id;
  assert.notEqual(lastId, first.id); assert.ok(!events.slice(0, commitIndex).some(event => event.id === lastId));
  const again = await wrapper.applyVerified0145({ ...context.options, preflight });
  assert.equal(again.ok, false); assert.equal(context.database.executions.length, 3);
  resourcesClosed(context.database);
});

for (const method of ['query', 'execute', 'getIdentity', 'close', 'beginTransaction', 'commit', 'rollback']) {
  test(`factory sem ${method} recusa antes da primeira DDL`, async () => {
    const context = await fixture({ missingMethod: method });
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); noJournal(context.database);
    assert.equal(context.database.executions.length, 0);
  });
}
for (const option of ['sameObject', 'sameSession', 'sharedTls']) {
  test(`factory ${option} não representa conexões TLS independentes`, async () => {
    const context = await fixture({ [option]: true });
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false);
    assert.equal(context.database.executions.length, 0);
  });
}
for (const override of [
  { tlsVerified: false }, { host: 'other.example.invalid' }, { databaseName: 'wrong_database' },
  { certificateFingerprint: 'b'.repeat(64) }, { serverVersion: 'different' }, { serverProduct: 'MariaDB' },
]) {
  test(`destino TLS divergente bloqueia: ${Object.keys(override)[0]}`, async () => {
    const context = await fixture({ identityOverride: () => override });
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); assert.equal(context.database.executions.length, 0);
  });
}
test('hostname canônico é conferido contra o certificado fornecido, não só entre conexões', async () => {
  const context = await fixture();
  context.options.canonicalTarget.host = 'other.example.invalid';
  mutateBoth(context, gates => { gates.canonicalTarget.host = 'other.example.invalid'; });
  assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); assert.equal(context.database.connections.length, 0);
});

for (const [name, mutate] of [
  ['três strings arbitrárias', g => { g.authorization = 'abc'; g.exactSql = 'abc'; g.executorDigest = 'abc'; }],
  ['hash SQL', g => { g.exactSql = 'b'.repeat(64); }],
  ['hash executor', g => { g.executorDigest = 'b'.repeat(64); }],
  ['hash wrapper', g => { g.wrapperDigest = 'b'.repeat(64); }],
  ['hash verificador', g => { g.verifierDigest = 'b'.repeat(64); }],
  ['mapa hashes', g => { g.reviewedFileSha256[wrapper.REVIEWED_FILES[1]] = 'b'.repeat(64); }],
  ['revisão do aceite operador', g => { delete g.approvalRevision; }],
  ['revisão aceite incorreta', g => { g.approvalRevision = 'b'.repeat(40); }],
  ['revisão revisada', g => { g.reviewRevision = 'b'.repeat(40); }],
  ['revisão Git', g => { g.gitRevision = 'b'.repeat(40); }],
  ['aprovador', g => { g.approvedBy = 'Manus'; }],
  ['escopo ampliado', g => { g.scope.push('0143'); }],
  ['Issue errada', g => { g.issue = 35; }],
  ['reserva não exclusiva', g => { g.reservation.exclusive = false; }],
  ['reserva outra revisão', g => { g.reservation.revision = 'b'.repeat(40); }],
  ['exceção não confirmada', g => { g.backupExceptionOrProof.confirmed = false; }],
  ['exceção outra migração', g => { g.backupExceptionOrProof.migrationTag = '0143'; }],
  ['stamp futuro', g => { g.window.issuedAt = Date.now() + 60000; }],
  ['aceite expirado', g => { g.window.issuedAt = Date.now() - 200000; g.window.expiresAt = Date.now() - 1; }],
  ['janela longa', g => { g.window.expiresAt = g.window.issuedAt + 300001; }],
]) {
  test(`gate ${name} não pode ser substituído por preenchimento arbitrário`, async () => {
    const context = await fixture(); mutateBoth(context, mutate);
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); assert.equal(context.database.connections.length, 0);
  });
}
test('manifesto confiável injetado é obrigatório; divergência entre payload e evidência bloqueia', async () => {
  const context = await fixture(); delete context.options.readIssueApprovalManifest;
  assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false);
  const another = await fixture(); another.manifest.authorization.reference = 'different-evidence';
  assert.equal((await wrapper.preflightVerified0145(another.options)).ok, false); assert.equal(another.database.connections.length, 0);
});

for (const [name, change] of [
  ['tipo', rows => { rows[1].COLUMN_TYPE = 'varchar(64)'; }],
  ['nulidade', rows => { rows[1].IS_NULLABLE = 'YES'; }],
  ['ordem', rows => { rows[1].ORDINAL_POSITION = 3; }],
  ['default', rows => { rows[2].COLUMN_DEFAULT = '0'; }],
  ['auto_increment', rows => { rows[0].EXTRA = ''; }],
  ['coluna extra', rows => { rows.push(clone(rows[2])); }],
]) {
  test(`layout do journal: ${name} bloqueia mesmo tendo os três nomes`, async () => {
    const context = await fixture(); change(context.database.layout);
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); assert.equal(context.database.executions.length, 0);
  });
}
for (const [name, change] of [
  ['0144 ausente', ledger => { ledger.length = 0; }],
  ['0144 hash incorreto', ledger => { ledger[0].hash = 'b'.repeat(64); }],
  ['0144 conflito timestamp', ledger => { ledger.push({ id: 143, created_at: contract.previousMarker.created_at, hash: 'b'.repeat(64) }); }],
  ['0145 histórico', ledger => { ledger.push({ id: 145, ...contract.marker }); }],
  ['0145 conflito hash', ledger => { ledger.push({ id: 145, hash: contract.marker.hash, created_at: 1 }); }],
  ['marcador posterior desconhecido', ledger => { ledger.push({ id: 145, hash: 'b'.repeat(64), created_at: contract.previousMarker.created_at + 1 }); }],
]) {
  test(`histórico ${name} não autoriza replay`, async () => {
    const context = await fixture(); change(context.database.ledger);
    assert.equal((await wrapper.preflightVerified0145(context.options)).ok, false); assert.equal(context.database.executions.length, 0);
  });
}
test('preflight fabricado/clonado não é comprovante emitido pelo wrapper', async () => {
  const context = await fixture();
  assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight: { ok: true, phase: 'preflight', issuedAt: Date.now() } })).ok, false);
  const preflight = await wrapper.preflightVerified0145(context.options);
  assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight: clone(preflight) })).ok, false);
  assert.equal(context.database.executions.length, 0);
});
test('preflight expira pelo relógio REAL; não aceita now arbitrário do chamador', async () => {
  const context = await fixture(), preflight = await wrapper.preflightVerified0145(context.options);
  const actualNow = Date.now.bind(Date);
  const clock = mock.method(Date, 'now', () => actualNow() + wrapper.MAX_PREFLIGHT_AGE_MS + 1);
  try {
    assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight, now: preflight.issuedAt })).ok, false);
    assert.equal(context.database.executions.length, 0);
  } finally { clock.mock.restore(); }
});
test('revisão Git alterada depois do preflight bloqueia antes de DDL', async () => {
  const context = await fixture(), preflight = await wrapper.preflightVerified0145(context.options);
  gitState = { revision: 'b'.repeat(40) };
  try { assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight })).ok, false); assert.equal(context.database.executions.length, 0); }
  finally { gitState = {}; }
});
test('factory sem transação na conexão de escrita é recusada antes de DDL', async () => {
  const context = await fixture(), preflight = await wrapper.preflightVerified0145(context.options);
  context.database.options.missingMethod = 'commit';
  assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight })).ok, false); assert.equal(context.database.executions.length, 0);
});

for (const [name, change] of [
  ['coluna credencial', catalog => { catalog.columns.find(c => c.COLUMN_NAME === 'registroAns').COLUMN_TYPE = 'varchar(99)'; }],
  ['posição preexistente', catalog => { catalog.columns[0].ORDINAL_POSITION = 99; }],
  ['unicidade índice preexistente', catalog => { catalog.indexes[0].NON_UNIQUE = 1 - catalog.indexes[0].NON_UNIQUE; }],
  ['FK preexistente alterada', catalog => { catalog.foreignKeys.push({ TABLE_NAME: 'credenciais_portais', CONSTRAINT_NAME: 'new_fk', ORDINAL_POSITION: 1, COLUMN_NAME: 'id', REFERENCED_TABLE_NAME: 'other', REFERENCED_COLUMN_NAME: 'id', UPDATE_RULE: 'CASCADE', DELETE_RULE: 'CASCADE' }); }],
]) {
  test(`primeira DDL: ${name} para antes da SEGUNDA e sem journal`, async () => {
    const context = await fixture({ mutateCatalog: (catalog, stage) => { if (stage === 1) change(catalog); } });
    const { result } = await run(context);
    assert.equal(result.ok, false); assert.equal(result.ddlCount, 1); assert.equal(ddlOnly(context.database).length, 1);
    assert.equal(result.ddlOutcomeUncertain, true); noJournal(context.database); sanitized(result);
  });
}
for (const [name, change] of [
  ['nome mantendo 30 campos', catalog => { catalog.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'convenio_id').COLUMN_NAME = 'wrong_id'; }],
  ['tipo mantendo 30 campos', catalog => { catalog.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'convenio_id').COLUMN_TYPE = 'varchar(30)'; }],
  ['default', catalog => { catalog.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'status_esteira').COLUMN_DEFAULT = 'WRONG'; }],
  ['on update', catalog => { catalog.columns.find(c => c.TABLE_NAME === 'fila_envio_xml_portal' && c.COLUMN_NAME === 'updated_at').EXTRA = ''; }],
  ['unicidade', catalog => { catalog.indexes.find(i => i.TABLE_NAME === 'fila_envio_xml_portal' && i.INDEX_NAME !== 'PRIMARY').NON_UNIQUE = 0; }],
  ['posição índice', catalog => { catalog.indexes.find(i => i.TABLE_NAME === 'fila_envio_xml_portal' && i.INDEX_NAME !== 'PRIMARY').SEQ_IN_INDEX = 99; }],
  ['prefixo índice', catalog => { catalog.indexes.find(i => i.TABLE_NAME === 'fila_envio_xml_portal').SUB_PART = 1; }],
  ['FK inesperada', catalog => { catalog.foreignKeys.push({ TABLE_NAME: 'fila_envio_xml_portal', CONSTRAINT_NAME: 'unexpected', ORDINAL_POSITION: 1, COLUMN_NAME: 'id', REFERENCED_TABLE_NAME: 'other', REFERENCED_COLUMN_NAME: 'id', UPDATE_RULE: 'CASCADE', DELETE_RULE: 'CASCADE' }); }],
]) {
  test(`segunda DDL: ${name} impede qualquer journal/commit`, async () => {
    const context = await fixture({ mutateCatalog: (catalog, stage) => { if (stage === 2) change(catalog); } });
    const { result } = await run(context);
    assert.equal(result.ok, false); assert.equal(result.ddlCount, 2); assert.equal(result.ddlVerifiedCount, 1);
    noJournal(context.database); assert.equal(context.database.events.some(event => event.operation === 'commit'), false);
  });
}
test('divergência SOMENTE na conexão independente após a primeira DDL impede continuar', async () => {
  const context = await fixture({ mutateCatalog: (catalog, stage, id) => {
    if (stage === 1 && id !== 5) catalog.columns.find(c => c.COLUMN_NAME === 'registroAns').COLUMN_TYPE = 'varchar(99)';
  } });
  const { result } = await run(context); assert.equal(result.ok, false); assert.equal(ddlOnly(context.database).length, 1); noJournal(context.database);
});
for (const count of [1, 2]) {
  test(`resultado DDL ${count} incerto preserva tentativas e NUNCA repete`, async () => {
    const context = await fixture({ throwDdl: count }), { preflight, result } = await run(context);
    assert.equal(result.ok, false); assert.equal(result.ddlCount, count); assert.equal(result.ddlOutcomeUncertain, true);
    assert.equal(ddlOnly(context.database).length, count); noJournal(context.database); sanitized(result);
    assert.equal((await wrapper.applyVerified0145({ ...context.options, preflight })).ok, false); assert.equal(ddlOnly(context.database).length, count);
  });
}
test('ledger alterado entre DDL impede marker sem reparar histórico', async () => {
  const context = await fixture({ afterDdl: (database, stage) => { if (stage === 1) database.ledger[0].hash = 'b'.repeat(64); } });
  const { result } = await run(context); assert.equal(result.ok, false); assert.equal(ddlOnly(context.database).length, 1);
  assert.equal(context.database.executions.some(item => item.sql.startsWith('INSERT')), false);
  assert.equal(context.database.ledger[0].hash, 'b'.repeat(64));
});
test('marker com par inexato é rollback, não sucesso por count', async () => {
  const context = await fixture({ mutateMarker: ledger => { ledger.at(-1).hash = 'b'.repeat(64); } });
  const { result } = await run(context); assert.equal(result.ok, false); assert.equal(result.ddlCount, 2);
  assert.equal(context.database.events.some(event => event.operation === 'rollback'), true);
  assert.equal(context.database.events.some(event => event.operation === 'commit'), false);
  assert.deepEqual(context.database.ledger, [{ id: 144, ...contract.previousMarker }]);
});
test('falha transacional depois da DDL não transforma em zero nem grava marker', async () => {
  const context = await fixture({ throwBegin: true }), { result } = await run(context);
  assert.equal(result.ok, false); assert.equal(result.ddlCount, 2); noJournal(context.database);
  assert.equal(context.database.events.some(event => event.operation === 'rollback'), true);
});
test('commit incerto não declara aplicado e não reexecuta', async () => {
  const context = await fixture({ throwCommit: true }), { result } = await run(context);
  assert.equal(result.ok, false); assert.equal(result.ddlCount, 2); assert.equal(result.journalOutcomeUncertain, true);
  assert.equal(context.database.events.some(event => event.operation === 'rollback'), false);
  assert.equal(context.database.executions.length, 3); sanitized(result);
  resourcesClosed(context.database);
});
for (const [name, afterCommit] of [
  ['marker ausente', db => { db.ledger.pop(); }],
  ['hash marker incorreto', db => { db.ledger.at(-1).hash = 'b'.repeat(64); }],
  ['histórico alterado', db => { db.ledger[0].hash = 'b'.repeat(64); }],
  ['marker duplicado', db => { db.ledger.push({ id: 146, ...contract.marker }); }],
  ['identidade pós commit diferente', db => { db.options.identityOverride = () => ({ host: 'changed.example.invalid' }); }],
]) {
  test(`POST commit ${name} não pode retornar complete`, async () => {
    const context = await fixture({ afterCommit }), { result } = await run(context);
    assert.equal(result.ok, false); assert.equal(result.ddlCount, 2); assert.equal(result.journalOutcomeUncertain, true);
    assert.equal(context.database.executions.length, 3); sanitized(result);
  });
}

test('posições novas da fila não podem ser trocadas mantendo tipos e contagens', async () => {
  const context = await fixture({ mutateCatalog: (catalog, stage) => {
    if (stage !== 2) return;
    const columns = catalog.columns.filter(column => column.TABLE_NAME === 'fila_envio_xml_portal');
    [columns[1].ORDINAL_POSITION, columns[2].ORDINAL_POSITION] = [columns[2].ORDINAL_POSITION, columns[1].ORDINAL_POSITION];
  } });
  const { result } = await run(context);
  assert.equal(result.ok, false); assert.equal(result.ddlCount, 2); noJournal(context.database); resourcesClosed(context.database);
});
test('posições das quatro colunas aditivas seguem a ordem exata da SQL', async () => {
  const context = await fixture({ mutateCatalog: (catalog, stage) => {
    if (stage !== 1) return;
    const a = catalog.columns.find(column => column.COLUMN_NAME === 'registroAns');
    const b = catalog.columns.find(column => column.COLUMN_NAME === 'codigoPrestadorOperadora');
    [a.ORDINAL_POSITION, b.ORDINAL_POSITION] = [b.ORDINAL_POSITION, a.ORDINAL_POSITION];
  } });
  const { result } = await run(context);
  assert.equal(result.ok, false); assert.equal(result.ddlCount, 1); noJournal(context.database); resourcesClosed(context.database);
});
test('aprovação revogada após primeira DDL é relida e impede a segunda', async () => {
  const context = await fixture();
  context.database.options.afterDdl = (_, stage) => { if (stage === 1) context.manifest.reservation.exclusive = false; };
  const { result } = await run(context);
  assert.equal(result.ok, false); assert.equal(result.ddlCount, 1); noJournal(context.database); resourcesClosed(context.database);
});
test('divergência da última leitura independente fecha todos os recursos sem journal', async () => {
  const context = await fixture({ mutateCatalog: (catalog, stage, id) => {
    if (stage === 2 && id !== 5) catalog.indexes.find(index => index.TABLE_NAME === 'fila_envio_xml_portal').NON_UNIQUE = 1;
  } });
  const { result } = await run(context);
  assert.equal(result.ok, false); noJournal(context.database); resourcesClosed(context.database);
});
test('janela expira DURANTE as leituras finais e não passa para a primeira DDL', async () => {
  const context = await fixture(), preflight = await wrapper.preflightVerified0145(context.options);
  const actualNow = Date.now.bind(Date);
  let advance = false;
  context.database.options.mutateRows = (_rows, sql, id) => {
    if (id === 5 && sql.includes('verified foreign keys')) advance = true;
  };
  const clock = mock.method(Date, 'now', () => actualNow() + (advance ? wrapper.MAX_PREFLIGHT_AGE_MS + 1 : 0));
  try {
    const result = await wrapper.applyVerified0145({ ...context.options, preflight });
    assert.equal(result.ok, false); assert.equal(result.ddlCount, 0); noJournal(context.database); resourcesClosed(context.database);
  } finally { clock.mock.restore(); }
});
