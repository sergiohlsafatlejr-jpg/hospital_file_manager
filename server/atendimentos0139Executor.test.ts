import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARTIFACTS_REVISION,
  EXPECTED_SQL_SHA256,
  MIGRATION_TIMESTAMP,
  TARGET_TABLES,
  createInjectedMysql2TlsFactory,
  runRestricted0139,
} from "../scripts/migrations/0139-atendimentos-restrita.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const target = {
  reference: "QA-0139-TARGET",
  serverProduct: "tidb",
  databaseName: "qa_restricted_0139",
  serverVersion: "8.0.11-TiDB-v8.5.3",
  certificateFingerprint: "a".repeat(64),
};

type Column = { name: string; type: string; nullable: boolean; default: string | null; autoincrement: boolean; onUpdate: boolean };
type Index = { name: string; unique: boolean; columns: string[]; primary: boolean };
type Contract = Record<string, { columns: Column[]; indexes: Index[] }>;
type FakeOptions = { failStatement?: number; schemaDeviationAfterAllDdl?: boolean; duplicateJournal?: boolean; wrongAffectedRows?: boolean; remove0138?: boolean; tlsVerified?: boolean; databaseName?: string };
let temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

function normalized(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function normalizeDefault(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw)) return "CURRENT_TIMESTAMP";
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}
async function targetContract(): Promise<Contract> {
  const snapshot = JSON.parse(await readFile(path.join(root, "drizzle/meta/0139_snapshot.json"), "utf8"));
  return Object.fromEntries(TARGET_TABLES.map(tableName => {
    const table = snapshot.tables[tableName];
    const indexes: Index[] = [
      ...Object.values(table.compositePrimaryKeys).map((entry: any) => ({ name: "PRIMARY", unique: true, columns: entry.columns, primary: true })),
      ...Object.values(table.indexes).map((entry: any) => ({ name: entry.name, unique: Boolean(entry.isUnique), columns: entry.columns, primary: false })),
      ...Object.values(table.uniqueConstraints).map((entry: any) => ({ name: entry.name, unique: true, columns: entry.columns, primary: false })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    return [tableName, { columns: Object.values(table.columns).map((entry: any) => ({ name: entry.name, type: normalized(entry.type), nullable: !entry.notNull, default: normalizeDefault(entry.default), autoincrement: Boolean(entry.autoincrement), onUpdate: Boolean(entry.onUpdate) })), indexes }];
  }));
}
async function baselineLedger(options: FakeOptions = {}) {
  const digest = async (name: string) => createHash("sha256").update(await readFile(path.join(root, `drizzle/${name}.sql`))).digest("hex");
  const [hash0136, hash0137, hash0138] = await Promise.all([digest("0136_lame_dreadnoughts"), digest("0137_retornos_recursos_cassi"), digest("0138_known_blink")]);
  const ledger = Array.from({ length: 99 }, (_, index) => ({ id: index + 1, hash: `synthetic-${index + 1}`, created_at: 1700000000000 + index }));
  ledger[96] = { id: 97, hash: hash0136, created_at: 1792003825434 };
  ledger[97] = { id: 98, hash: hash0137, created_at: 1793047237100 };
  if (!options.remove0138) ledger[98] = { id: 99, hash: hash0138, created_at: 1793104873640 };
  return ledger;
}

class FakeDatabase {
  readonly contract: Contract;
  readonly options: FakeOptions;
  readonly tables = new Set<string>();
  readonly indexes = new Map<string, Index>();
  readonly ledger: Array<Record<string, unknown>>;
  readonly executed: string[] = [];
  readonly purposes: string[] = [];
  ddlCount = 0;
  constructor(contract: Contract, ledger: Array<Record<string, unknown>>, options: FakeOptions = {}) { this.contract = contract; this.ledger = ledger; this.options = options; }
  async connect(purpose: string) { this.purposes.push(purpose); return new FakeConnection(this, purpose); }
  addTable(name: string) { this.tables.add(name); for (const item of this.contract[name].indexes.filter(item => item.primary || item.unique)) this.indexes.set(`${name}:${item.name}`, item); }
  addIndex(name: string) { for (const [table, contract] of Object.entries(this.contract)) { const found = contract.indexes.find(item => item.name === name); if (found) { this.indexes.set(`${table}:${name}`, found); return; } } throw new Error("unknown fake index"); }
  tableRows() { return [{ TABLE_NAME: "legacy_anchor", TABLE_TYPE: "BASE TABLE" }, ...[...this.tables].sort().map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: "BASE TABLE" }))]; }
  columnRows() {
    const rows: Record<string, unknown>[] = [];
    for (const name of TARGET_TABLES) if (this.tables.has(name)) for (const [offset, item] of this.contract[name].columns.entries()) rows.push({
      TABLE_NAME: name, ORDINAL_POSITION: offset + 1, COLUMN_NAME: item.name,
      COLUMN_TYPE: this.options.schemaDeviationAfterAllDdl && this.ddlCount === 8 && name === TARGET_TABLES[0] && item.name === "estado" ? "varchar(20)" : item.type,
      IS_NULLABLE: item.nullable ? "YES" : "NO", COLUMN_DEFAULT: item.default,
      EXTRA: `${item.autoincrement ? "auto_increment" : ""}${item.onUpdate ? " on update CURRENT_TIMESTAMP" : ""}`.trim(),
    });
    return rows;
  }
  indexRows() { return [...this.indexes].flatMap(([key, item]) => { const [table] = key.split(":"); return item.columns.map((column, offset) => ({ TABLE_NAME: table, INDEX_NAME: item.name, NON_UNIQUE: item.unique ? 0 : 1, SEQ_IN_INDEX: offset + 1, COLUMN_NAME: column, SUB_PART: null })); }); }
}
class FakeConnection {
  readonly pendingJournalRows: Array<Record<string, unknown>> = [];
  constructor(readonly database: FakeDatabase, readonly purpose: string) {}
  async close() {}
  async getIdentity() { return { tlsVerified: this.database.options.tlsVerified ?? true, serverProduct: "TiDB", databaseName: this.database.options.databaseName ?? target.databaseName, serverVersion: target.serverVersion, certificateFingerprint: target.certificateFingerprint }; }
  async query(sql: string) {
    const database = this.database;
    if (sql.includes("0139:history-layout")) return { rows: [
      { COLUMN_NAME: "id", ORDINAL_POSITION: 1, COLUMN_TYPE: "bigint unsigned", IS_NULLABLE: "NO", EXTRA: "auto_increment" },
      { COLUMN_NAME: "hash", ORDINAL_POSITION: 2, COLUMN_TYPE: "text", IS_NULLABLE: "NO", EXTRA: "" },
      { COLUMN_NAME: "created_at", ORDINAL_POSITION: 3, COLUMN_TYPE: "bigint", IS_NULLABLE: "NO", EXTRA: "" },
    ] };
    if (sql.includes("0139:ledger-")) return { rows: [...database.ledger, ...this.pendingJournalRows] };
    if (sql.includes("0139:catalog-tables")) return { rows: database.tableRows() };
    if (sql.includes("0139:catalog-columns")) return { rows: database.columnRows() };
    if (sql.includes("0139:catalog-indexes")) return { rows: database.indexRows() };
    if (sql.includes("0139:empty-table")) return { rows: [{ row_count: 0 }] };
    return { rows: [] };
  }
  async execute(sql: string, params?: unknown[]) {
    const database = this.database; database.executed.push(sql);
    if (/^(CREATE TABLE|CREATE INDEX)/.test(sql.trim())) {
      const next = database.ddlCount + 1; if (database.options.failStatement === next) throw new Error("synthetic ddl failure");
      database.ddlCount = next;
      const table = sql.match(/CREATE TABLE `([^`]+)`/)?.[1], index = sql.match(/CREATE INDEX `([^`]+)`/)?.[1];
      if (table) database.addTable(table); else if (index) database.addIndex(index);
      return { rows: [] };
    }
    if (sql.includes("0139:journal-insert")) {
      if (database.options.wrongAffectedRows) return { rows: [], affectedRows: 0 };
      if (database.options.duplicateJournal) this.pendingJournalRows.push({ id: database.ledger.length + 1, hash: params?.[0], created_at: params?.[1] });
      this.pendingJournalRows.push({ id: database.ledger.length + this.pendingJournalRows.length + 1, hash: params?.[0], created_at: params?.[1] });
      return { rows: [], affectedRows: 1 };
    }
    if (sql.includes("0139:journal-commit")) { database.ledger.push(...this.pendingJournalRows); this.pendingJournalRows.splice(0); return { rows: [] }; }
    if (sql.includes("0139:journal-rollback")) { this.pendingJournalRows.splice(0); return { rows: [] }; }
    return { rows: [] };
  }
}
function ddls(database: FakeDatabase) { return database.executed.filter(sql => /^(CREATE TABLE|CREATE INDEX)/.test(sql.trim())); }
function journalWrites(database: FakeDatabase) { return database.executed.filter(sql => sql.includes("0139:journal-insert")); }
async function currentRevision() { return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).stdout.trim(); }
async function validGates(now: number) {
  const executorDigest = createHash("sha256").update(await readFile(path.join(root, "scripts/migrations/0139-atendimentos-restrita.mjs"))).digest("hex");
  const exact = { reference: "QA-0139-EXACT", issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString(), approvedBy: "sergio", approvalRecordedBySergio: true, reviewScope: "executor-0139", approvedExecutorDigest: executorDigest, approvedSqlDigest: EXPECTED_SQL_SHA256, approvedGitRevision: await currentRevision(), artifactsRevision: ARTIFACTS_REVISION };
  return { signoffs: { authorization: true, review: true, exactSql: true, executorDigest: true, artifactsRevision: true, window: true, backupExceptionOrProof: true, canonicalTarget: true, gitRevision: true }, authorization: { ...exact, reference: "QA-0139-AUTH" }, review: { ...exact, reference: "QA-0139-REVIEW" }, window: { reference: "QA-0139-WINDOW", issuedAt: exact.issuedAt, expiresAt: exact.expiresAt }, target: { ...target, issuedAt: exact.issuedAt, expiresAt: exact.expiresAt }, backup: { reference: "QA-0139-BACKUP-EXCEPTION", issuedAt: exact.issuedAt, expiresAt: exact.expiresAt, appliesTo: "0139_past_toro", kind: "exception", approvedBy: "sergio", exceptionAuthorized: true } };
}
async function applyOptions(database: FakeDatabase, now = Date.UTC(2030, 0, 1)) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atendimentos-0139-")); temporaryDirectories.push(directory);
  const gates = await validGates(now), executorDigest = createHash("sha256").update(await readFile(path.join(root, "scripts/migrations/0139-atendimentos-restrita.mjs"))).digest("hex"), gitRevision = await currentRevision();
  return { mode: "apply" as const, root, now, connectionFactory: database, gates, verifyExternalGates: async () => ({ canonical: "restricted-0139-v1", authorization: true, review: true, window: true, backup: "exception", artifactsRevision: ARTIFACTS_REVISION, sqlDigest: EXPECTED_SQL_SHA256, gitRevision, executorDigest, migrationTag: "0139_past_toro", canonicalTarget: target }), privateCaptureKey: randomBytes(32), privateCaptureFile: path.join(directory, "capture.aes"), stateFile: path.join(directory, "state.json") };
}

describe("executor restrito 0139", () => {
  it("faz preflight somente leitura com factory e alvo canônico injetados", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger());
    await expect(runRestricted0139({ root, connectionFactory: database, canonicalTarget: target })).resolves.toMatchObject({ ok: true, mode: "preflight", phase: "preflight-read-only", ddlCount: 0, tables: 3, columns: 43, primaryKeys: 3, uniqueIndexes: 4, nonUniqueIndexes: 5 });
    expect(ddls(database)).toEqual([]); expect(journalWrites(database)).toEqual([]); expect(database.purposes).toEqual(["0139-preflight-a", "0139-preflight-b"]);
  });
  it("nunca descobre conexão por ambiente e requer factory e alvo canônico", async () => {
    const previous = process.env.DATABASE_URL; process.env.DATABASE_URL = "mysql://must-not-be-read.invalid/blocked";
    try {
      await expect(runRestricted0139({ root, canonicalTarget: target })).resolves.toEqual({ ok: false, phase: "connection", reason: "connection_factory_required", ddlCount: 0 });
      await expect(runRestricted0139({ root, connectionFactory: new FakeDatabase(await targetContract(), await baselineLedger()) })).resolves.toEqual({ ok: false, phase: "target", reason: "canonical_target_required", ddlCount: 0 });
    } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
  });
  it("rejeita TLS sem host, SNI idêntico e verifyIdentity antes de conectar", () => {
    const createConnection = vi.fn();
    expect(() => createInjectedMysql2TlsFactory({ mysql: { createConnection }, connectionOptions: { database: "synthetic", host: "tidb.qa", ssl: { ca: "synthetic-ca", rejectUnauthorized: true, verifyIdentity: false, servername: "tidb.qa" } } })).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(() => createInjectedMysql2TlsFactory({ mysql: { createConnection }, connectionOptions: { database: "synthetic", host: "tidb.qa", ssl: { ca: "synthetic-ca", rejectUnauthorized: true, verifyIdentity: true, servername: "other.qa" } } })).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("bloqueia gates que não retornam atestado externo canônico antes de conexão", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger()); const options = await applyOptions(database); options.verifyExternalGates = async () => true as any;
    await expect(runRestricted0139(options)).resolves.toEqual({ ok: false, phase: "apply-gates", reason: "external_gates_missing_or_unverified", ddlCount: 0 });
    expect(database.purposes).toEqual([]); expect(ddls(database)).toEqual([]);
  });
  it("exige baseline 0136–0138 e ausência 0135/0139 antes de DDL", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger({ remove0138: true }));
    await expect(runRestricted0139(await applyOptions(database))).resolves.toEqual({ ok: false, phase: "preflight", reason: "preflight_not_stable_or_not_safe", ddlCount: 0 });
    expect(ddls(database)).toEqual([]); expect(journalWrites(database)).toEqual([]);
  });
  it("executa exatamente as oito declarações na ordem, valida cada uma e grava journal uma única vez", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger());
    await expect(runRestricted0139(await applyOptions(database))).resolves.toMatchObject({ ok: true, mode: "apply", phase: "complete", ddlCount: 8 });
    expect(ddls(database)).toHaveLength(8); expect(journalWrites(database)).toHaveLength(1);
    expect(database.purposes).toEqual(["0139-preflight-a", "0139-preflight-b", "0139-ddl", "0139-post-ddl-independent", "0139-journal", "0139-final-independent"]);
    expect(database.ledger).toHaveLength(100); expect(database.ledger.at(-1)).toMatchObject({ created_at: MIGRATION_TIMESTAMP });
  });
  it("para na primeira falha parcial sem retry e sem journal", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), { failStatement: 4 });
    await expect(runRestricted0139(await applyOptions(database))).resolves.toEqual({ ok: false, phase: "ddl", reason: "statement_failed_no_retry", ddlCount: 3 });
    expect(ddls(database)).toHaveLength(4); expect(journalWrites(database)).toEqual([]);
  });
  it("não escreve journal quando prova física diverge e reverte tentativa de duplicidade", async () => {
    const divergent = new FakeDatabase(await targetContract(), await baselineLedger(), { schemaDeviationAfterAllDdl: true });
    await expect(runRestricted0139(await applyOptions(divergent))).resolves.toEqual({ ok: false, phase: "ddl-validation", reason: "statement_object_validation_failed", ddlCount: 8 });
    expect(journalWrites(divergent)).toEqual([]);
    const duplicate = new FakeDatabase(await targetContract(), await baselineLedger(), { duplicateJournal: true });
    await expect(runRestricted0139(await applyOptions(duplicate))).resolves.toEqual({ ok: false, phase: "journal", reason: "journal_guard_failed", ddlCount: 8 });
    expect(journalWrites(duplicate)).toHaveLength(1); expect(duplicate.ledger).toHaveLength(99);
  });
  it("rejeita identidade TLS/target que não corresponde ao alvo atestado", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), { tlsVerified: false });
    await expect(runRestricted0139({ root, connectionFactory: database, canonicalTarget: target })).resolves.toEqual({ ok: false, phase: "preflight", reason: "preflight_connection_or_metadata_failure", ddlCount: 0 });
    expect(ddls(database)).toEqual([]);
  });
});
