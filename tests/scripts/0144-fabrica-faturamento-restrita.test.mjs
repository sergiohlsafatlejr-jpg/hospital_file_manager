import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
const executor = await import("../../scripts/migrations/0144-fabrica-faturamento-restrita.mjs");

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const FIXTURE_REVISION = "a".repeat(40);
const fingerprint = "b".repeat(64);
const now = Date.parse("2026-10-29T20:00:00.000Z");
const canonicalTarget = Object.freeze({
  reference: "tidb-prod-0144",
  serverProduct: "tidb",
  databaseName: "safe_fixture",
  serverVersion: "8.0.11-TiDB-v8.5.0",
  certificateFingerprint: fingerprint,
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "restricted-0144-"));
  for (const relative of [
    "drizzle/0144_fabrica_faturamento_safatle.sql",
    "drizzle/meta/0143_snapshot.json",
    "drizzle/meta/0144_snapshot.json",
    "drizzle/meta/_journal.json",
  ]) {
    await cp(path.join(REPOSITORY_ROOT, relative), path.join(root, relative), { force: true });
  }
  return root;
}

function identity(overrides = {}) {
  return { tlsVerified: true, serverProduct: "TiDB", databaseName: canonicalTarget.databaseName, serverVersion: canonicalTarget.serverVersion, certificateFingerprint: fingerprint, ...overrides };
}
function ledgerLayout() {
  return [
    { COLUMN_NAME: "id", ORDINAL_POSITION: 1, COLUMN_TYPE: "bigint unsigned", IS_NULLABLE: "NO", EXTRA: "auto_increment" },
    { COLUMN_NAME: "hash", ORDINAL_POSITION: 2, COLUMN_TYPE: "text", IS_NULLABLE: "NO", EXTRA: "" },
    { COLUMN_NAME: "created_at", ORDINAL_POSITION: 3, COLUMN_TYPE: "bigint", IS_NULLABLE: "NO", EXTRA: "" },
  ];
}
function baselineLedger() { return [{ id: 143, hash: executor.BASELINE_0143_SQL_SHA256, created_at: 1793297372715 }]; }
function normaliseColumn(contractColumn, table, position) {
  return {
    TABLE_NAME: table, ORDINAL_POSITION: position + 1, COLUMN_NAME: contractColumn.name,
    COLUMN_TYPE: contractColumn.type, IS_NULLABLE: contractColumn.nullable ? "YES" : "NO",
    COLUMN_DEFAULT: contractColumn.default === "CURRENT_TIMESTAMP" ? "CURRENT_TIMESTAMP" : contractColumn.default,
    EXTRA: `${contractColumn.autoincrement ? "auto_increment" : ""}${contractColumn.onUpdate ? " on update CURRENT_TIMESTAMP" : ""}`.trim(),
  };
}
function normaliseIndex(contractIndex, table) {
  return contractIndex.columns.map((name, position) => ({
    TABLE_NAME: table, INDEX_NAME: contractIndex.name, NON_UNIQUE: contractIndex.unique ? 0 : 1,
    SEQ_IN_INDEX: position + 1, COLUMN_NAME: name, SUB_PART: contractIndex.prefixes[position],
  }));
}

class FakeDatabase {
  constructor(contracts, options = {}) {
    this.contracts = contracts;
    this.options = options;
    this.created = new Set(options.partialTargets ?? []);
    this.ledger = options.ledger ? options.ledger.map(row => ({ ...row })) : baselineLedger();
    this.ddlExecutions = 0;
    this.connectionCount = 0;
    this.queries = [];
  }
  catalogTables() { return [...this.created].sort().map(name => ({ TABLE_NAME: name, TABLE_TYPE: "BASE TABLE" })); }
  catalogColumns() { return [...this.created].flatMap(name => this.contracts[name].columns.map((column, position) => normaliseColumn(column, name, position))); }
  catalogIndexes() { return [...this.created].flatMap(name => this.contracts[name].indexes.flatMap(index => normaliseIndex(index, name))); }
  connection(connectionNumber) {
    const database = this;
    return {
      async getIdentity() {
        if (database.options.tlsMismatchOnConnection === connectionNumber) return identity({ certificateFingerprint: "c".repeat(64) });
        return identity();
      },
      async query(sql) {
        database.queries.push(sql);
        if (sql.includes("information_schema`.`tables")) return { rows: database.catalogTables() };
        if (sql.includes("information_schema`.`columns") && sql.includes("__drizzle_migrations")) return { rows: ledgerLayout() };
        if (sql.includes("information_schema`.`columns")) return { rows: database.catalogColumns() };
        if (sql.includes("information_schema`.`statistics")) return { rows: database.catalogIndexes() };
        if (sql.includes("referential_constraints")) return { rows: [] };
        if (sql.includes("FROM `__drizzle_migrations`")) return { rows: database.ledger.map(row => ({ ...row })) };
        if (sql.includes("ledger-anchor-lock")) return { rows: database.ledger.length ? [{ id: database.ledger[0].id }] : [] };
        throw new Error(`unexpected synthetic query: ${sql}`);
      },
      async execute(sql, params = []) {
        if (/^CREATE TABLE/i.test(sql)) {
          database.ddlExecutions += 1;
          if (database.options.failDdlAt === database.ddlExecutions) throw new Error("synthetic ddl failure");
          const match = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`([^`]+)`/i);
          assert.ok(match, "DDL must be a target CREATE TABLE");
          database.created.add(match[1]);
          if (database.options.divergeAfterDdlAt === database.ddlExecutions) database.created.add("fabrica_metas");
          return { rows: [], affectedRows: 0 };
        }
        if (sql.includes("journal-insert")) {
          database.ledger.push({ id: database.ledger.length + 1, hash: params[0], created_at: params[1] });
          return { rows: [], affectedRows: 1 };
        }
        if (/journal-(?:begin|commit|rollback)/.test(sql)) return { rows: [], affectedRows: 0 };
        throw new Error(`unexpected synthetic execute: ${sql}`);
      },
      async close() {},
    };
  }
  factory() {
    const database = this;
    return {
      async connect() {
        database.connectionCount += 1;
        if (database.options.addLateLedgerOnConnection === database.connectionCount) {
          database.ledger.push({ id: 999, hash: "f".repeat(64), created_at: 1793300000000 });
        }
        return database.connection(database.connectionCount);
      },
    };
  }
}

function gates(artifacts) {
  const issuedAt = new Date(now - 60_000).toISOString(), expiresAt = new Date(now + 60_000).toISOString();
  const approval = { reference: "approval-0144", issuedAt, expiresAt, approvedExecutorDigest: executor.EXPECTED_EXECUTOR_FUNCTION_SHA256, approvedSqlDigest: executor.EXPECTED_SQL_SHA256, approvedGitRevision: artifacts.gitRevision, artifactsRevision: executor.ARTIFACTS_REVISION };
  return {
    signoffs: Object.fromEntries(["authorization", "review", "exactSql", "executorDigest", "artifactsRevision", "window", "backupExceptionOrProof", "canonicalTarget", "gitRevision"].map(name => [name, true])),
    authorization: { ...approval }, review: { ...approval, reference: "review-0144" },
    window: { reference: "window-0144", issuedAt, expiresAt },
    backupExceptionOrProof: { reference: "backup-0144", issuedAt, expiresAt, appliesTo: executor.MIGRATION_TAG, kind: "exception", exceptionAuthorized: true },
    target: { ...canonicalTarget, issuedAt, expiresAt },
  };
}
async function verifiedGates(payload) {
  return {
    canonical: "restricted-0144-v1", authorization: true, review: true, window: true, backup: "exception",
    migrationTag: payload.migrationTag, artifactsRevision: payload.artifactsRevision, sqlDigest: payload.sqlDigest,
    gitRevision: payload.gitRevision, executorDigest: payload.executorDigest, canonicalTarget: payload.canonicalTarget,
  };
}
function fixtureOptions(root, database, extra = {}) {
  return {
    root, now, connectionFactory: database.factory(), canonicalTarget,
    approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true, ...extra,
  };
}

test("loader aceita fixture somente com injeção explícita de revisão em NODE_ENV=test e rejeita SQL adulterado", async () => {
  const root = await fixtureRoot();
  try {
    const loaded = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.statements.length, 4);
    await cp(path.join(root, "drizzle/0144_fabrica_faturamento_safatle.sql"), path.join(root, "drizzle/0144_fabrica_faturamento_safatle.sql.bak"));
    const { appendFile } = await import("node:fs/promises");
    await appendFile(path.join(root, "drizzle/0144_fabrica_faturamento_safatle.sql"), "\n-- dirty\n");
    const dirty = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    assert.equal(dirty.ok, false);
    assert.equal(dirty.reason, "artifact_identity_mismatch");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preflight rejeita TLS divergente, tabela parcial e marker 0144 pré-existente sem DDL", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    for (const options of [
      { tlsMismatchOnConnection: 2 },
      { partialTargets: ["fabrica_contas"] },
      { ledger: [{ id: 142, hash: "e".repeat(64), created_at: 1793227973987 }] },
      { ledger: [...baselineLedger(), { id: 144, hash: executor.EXPECTED_SQL_SHA256, created_at: executor.MIGRATION_TIMESTAMP }] },
    ]) {
      const database = new FakeDatabase(artifacts.contracts, options);
      const result = await executor.preflightRestricted0144(fixtureOptions(root, database));
      assert.equal(result.ok, false);
      assert.equal(database.ddlExecutions, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apply exige gates e preflight recente antes de escrever", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts);
    const result = await executor.runRestricted0144({ ...fixtureOptions(root, database), mode: "apply" });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "preflight");
    assert.equal(database.ddlExecutions, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apply separado rejeita gates ausentes mesmo após um preflight pronto", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts);
    const preflight = await executor.preflightRestricted0144(fixtureOptions(root, database));
    assert.equal(preflight.ok, true);
    const result = await executor.applyRestricted0144({ ...fixtureOptions(root, database), preflight, gates: { target: canonicalTarget }, verifyExternalGates: verifiedGates });
    assert.deepEqual(result, { ok: false, phase: "apply-gates", reason: "external_gates_missing_or_unverified", ddlCount: 0, tables: 4 });
    assert.equal(database.ddlExecutions, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ledger historicamente válido mas diferente do preflight bloqueia antes da primeira DDL", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts);
    const preflight = await executor.preflightRestricted0144(fixtureOptions(root, database));
    assert.equal(preflight.ok, true);
    database.ledger.push({ id: 999, hash: "d".repeat(64), created_at: 1 });
    const result = await executor.applyRestricted0144({ ...fixtureOptions(root, database), preflight, gates: gates(artifacts), verifyExternalGates: verifiedGates });
    assert.equal(result.reason, "baseline_changed_before_ddl");
    assert.equal(result.ddlCount, 0);
    assert.equal(database.ddlExecutions, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("para na primeira DDL que falha e nunca tenta retry", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts, { failDdlAt: 1 });
    const result = await executor.runRestricted0144({ ...fixtureOptions(root, database), mode: "apply", gates: gates(artifacts), verifyExternalGates: verifiedGates });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "statement_failed_no_retry");
    assert.equal(result.ddlCount, 0);
    assert.equal(database.ddlExecutions, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("para na divergência após DDL intermediária e preserva as DDL já realizadas", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts, { divergeAfterDdlAt: 1 });
    const result = await executor.runRestricted0144({ ...fixtureOptions(root, database), mode: "apply", gates: gates(artifacts), verifyExternalGates: verifiedGates });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "ddl-validation");
    assert.equal(result.ddlCount, 1);
    assert.equal(database.ddlExecutions, 1);
    assert.equal(database.created.has("fabrica_contas"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recusa ledger que muda após as quatro DDL, antes do marker", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    // Conexões: A, B, DDL, verificação independente, journal. A quinta introduz a corrida.
    const database = new FakeDatabase(artifacts.contracts, { addLateLedgerOnConnection: 5 });
    const result = await executor.runRestricted0144({ ...fixtureOptions(root, database), mode: "apply", gates: gates(artifacts), verifyExternalGates: verifiedGates });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "journal");
    assert.equal(result.ddlCount, 4);
    assert.equal(database.ledger.some(row => row.hash === executor.EXPECTED_SQL_SHA256 && row.created_at === executor.MIGRATION_TIMESTAMP), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("caminho aprovado executa quatro DDL, registra um único marker e retorna apenas resultado sanitizado", async () => {
  const root = await fixtureRoot();
  try {
    const artifacts = await executor.loadRestricted0144Artifacts({ root, approvedRevision: FIXTURE_REVISION, allowTestRevisionInjection: true });
    const database = new FakeDatabase(artifacts.contracts);
    const result = await executor.runRestricted0144({ ...fixtureOptions(root, database), mode: "apply", gates: gates(artifacts), verifyExternalGates: verifiedGates });
    assert.deepEqual(result, { ok: true, phase: "complete", reason: "applied", ddlCount: 4, tables: 4 });
    assert.equal(database.ddlExecutions, 4);
    assert.deepEqual([...database.created].sort(), executor.TARGET_TABLES.slice().sort());
    assert.equal(database.ledger.filter(row => row.hash === executor.EXPECTED_SQL_SHA256 && row.created_at === executor.MIGRATION_TIMESTAMP).length, 1);
    assert.equal(JSON.stringify(result).includes(canonicalTarget.databaseName), false);
    assert.equal(JSON.stringify(result).includes(fingerprint), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
