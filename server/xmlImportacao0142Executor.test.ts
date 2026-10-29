import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ARTIFACTS_REVISION,
  EXPECTED_SQL_SHA256,
  MIGRATION_TIMESTAMP,
  createInjectedMysql2TlsFactory,
  loadRestricted0142Artifacts,
  runRestricted0142,
} from "../scripts/migrations/0142-xml-importacao-lote-restrita.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const target = {
  reference: "QA-0142-TARGET",
  serverProduct: "tidb",
  databaseName: "qa_restricted_0142",
  serverVersion: "8.0.11-TiDB-v8.5.3",
  certificateFingerprint: "d".repeat(64),
};

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  autoincrement: boolean;
  onUpdate: boolean;
};
type Index = {
  name: string;
  unique: boolean;
  columns: string[];
  primary: boolean;
  prefixes: (string | null)[];
};
type Contract = Record<string, { columns: Column[]; indexes: Index[]; foreignKeys: string[] }>;
type Contracts = { baseline: Contract; target: Contract; final: Contract };
type FakeOptions = {
  failStatement?: number;
  schemaDeviationAfterAllDdl?: boolean;
  duplicateJournal?: boolean;
  wrongAffectedRows?: boolean;
  missingBaselineIndex?: boolean;
  tableNotEmpty?: boolean;
  tlsVerified?: boolean;
  databaseName?: string;
  preexisting0142Object?: boolean;
  legacyBaselineMetadataDrift?: boolean;
};

let temporaryDirectories: string[] = [];
let contracts: Contracts;
beforeAll(async () => {
  const artifacts = await loadRestricted0142Artifacts({ root });
  if (!artifacts.ok) throw new Error("synthetic_artifacts_unavailable");
  contracts = artifacts.contracts as Contracts;
});
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
async function baselineLedger() {
  const digest = async (name: string) => createHash("sha256").update(await readFile(path.join(root, `drizzle/${name}.sql`))).digest("hex");
  const [hash0136, hash0137, hash0138, hash0139, hash0140, hash0141] = await Promise.all([
    digest("0136_lame_dreadnoughts"),
    digest("0137_retornos_recursos_cassi"),
    digest("0138_known_blink"),
    digest("0139_past_toro"),
    digest("0140_bumpy_quasimodo"),
    digest("0141_woozy_union_jack"),
  ]);
  const ledger = Array.from({ length: 102 }, (_, index) => ({ id: index + 1, hash: `synthetic-${index + 1}`, created_at: 1700000000000 + index }));
  ledger[96] = { id: 97, hash: hash0136, created_at: 1792003825434 };
  ledger[97] = { id: 98, hash: hash0137, created_at: 1793047237100 };
  ledger[98] = { id: 99, hash: hash0138, created_at: 1793104873640 };
  ledger[99] = { id: 100, hash: hash0139, created_at: 1793119956230 };
  ledger[100] = { id: 101, hash: hash0140, created_at: 1793135284537 };
  ledger[101] = { id: 102, hash: hash0141, created_at: 1793195385533 };
  return ledger;
}

class FakeDatabase {
  readonly tables = new Set<string>();
  readonly columns = new Map<string, Column[]>();
  readonly indexes = new Map<string, Index>();
  readonly executed: string[] = [];
  readonly purposes: string[] = [];
  ddlCount = 0;
  constructor(readonly contract: Contracts, readonly ledger: Array<Record<string, unknown>>, readonly options: FakeOptions = {}) {
    for (const [table, definition] of Object.entries(contract.baseline)) {
      this.tables.add(table);
      this.columns.set(table, clone(definition.columns));
      for (const item of definition.indexes) {
        if (!options.missingBaselineIndex || item.name !== "idx_pront_pdf_arquivo_hospitalar") this.indexes.set(`${table}:${item.name}`, clone(item));
      }
    }
    if (options.legacyBaselineMetadataDrift) {
      const table = "prontuario_pdf_anexo_eventos";
      const columns = this.columns.get(table);
      if (!columns?.length) throw new Error("synthetic_baseline_missing");
      columns[0] = { ...columns[0], type: "legacy_incompatible_type", default: "legacy-default" };
      columns.reverse();
      this.indexes.set(`${table}:idx_legacy_baseline_metadata`, {
        name: "idx_legacy_baseline_metadata",
        unique: false,
        columns: [columns[0].name],
        primary: false,
        prefixes: [null],
      });
    }
    if (options.preexisting0142Object) this.addTable("xml_importacao_itens");
  }
  async connect(purpose: string) {
    this.purposes.push(purpose);
    return new FakeConnection(this, purpose);
  }
  addTable(table: string) {
    this.tables.add(table);
    this.columns.set(table, clone(this.contract.target[table].columns));
    for (const item of this.contract.target[table].indexes.filter(entry => entry.primary || entry.unique)) this.indexes.set(`${table}:${item.name}`, clone(item));
  }
  addColumn(table: string, column: string) {
    const found = this.contract.target[table].columns.find(item => item.name === column);
    if (!found) throw new Error("unknown_synthetic_column");
    this.columns.get(table)?.push(clone(found));
  }
  addIndex(table: string, index: string) {
    const found = this.contract.target[table].indexes.find(item => item.name === index);
    if (!found) throw new Error("unknown_synthetic_index");
    this.indexes.set(`${table}:${index}`, clone(found));
  }
  tableRows() {
    return [
      { TABLE_NAME: "legacy_anchor", TABLE_TYPE: "BASE TABLE" },
      ...[...this.tables].sort().map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: "BASE TABLE" })),
    ];
  }
  columnRows() {
    return [...this.columns.entries()].flatMap(([table, entries]) => entries.map((item, offset) => ({
      TABLE_NAME: table,
      ORDINAL_POSITION: offset + 1,
      COLUMN_NAME: item.name,
      COLUMN_TYPE: this.options.schemaDeviationAfterAllDdl && this.ddlCount === 14 && table === "xml_importacao_itens" && item.name === "estado" ? "varchar(20)" : item.type,
      IS_NULLABLE: item.nullable ? "YES" : "NO",
      COLUMN_DEFAULT: item.default,
      EXTRA: `${item.autoincrement ? "auto_increment" : ""}${item.onUpdate ? " on update CURRENT_TIMESTAMP" : ""}`.trim(),
    })));
  }
  indexRows() {
    return [...this.indexes].flatMap(([key, item]) => {
      const [table] = key.split(":");
      return item.columns.map((column, offset) => ({ TABLE_NAME: table, INDEX_NAME: item.name, NON_UNIQUE: item.unique ? 0 : 1, SEQ_IN_INDEX: offset + 1, COLUMN_NAME: column, SUB_PART: item.prefixes[offset] }));
    });
  }
}

class FakeConnection {
  readonly pendingJournalRows: Array<Record<string, unknown>> = [];
  constructor(readonly database: FakeDatabase, readonly purpose: string) {}
  async close() {}
  async getIdentity() {
    return {
      tlsVerified: this.database.options.tlsVerified ?? true,
      serverProduct: "TiDB",
      databaseName: this.database.options.databaseName ?? target.databaseName,
      serverVersion: target.serverVersion,
      certificateFingerprint: target.certificateFingerprint,
    };
  }
  async query(sql: string) {
    const database = this.database;
    if (sql.includes("0142:history-layout")) return { rows: [
      { COLUMN_NAME: "id", ORDINAL_POSITION: 1, COLUMN_TYPE: "bigint unsigned", IS_NULLABLE: "NO", EXTRA: "auto_increment" },
      { COLUMN_NAME: "hash", ORDINAL_POSITION: 2, COLUMN_TYPE: "text", IS_NULLABLE: "NO", EXTRA: "" },
      { COLUMN_NAME: "created_at", ORDINAL_POSITION: 3, COLUMN_TYPE: "bigint", IS_NULLABLE: "NO", EXTRA: "" },
    ] };
    if (sql.includes("0142:ledger-")) return { rows: [...database.ledger, ...this.pendingJournalRows] };
    if (sql.includes("0142:catalog-tables")) return { rows: database.tableRows() };
    if (sql.includes("0142:catalog-columns")) return { rows: database.columnRows() };
    if (sql.includes("0142:catalog-indexes")) return { rows: database.indexRows() };
    if (sql.includes("0142:empty-target-")) return { rows: [{ row_count: database.options.tableNotEmpty ? 1 : 0 }] };
    return { rows: [] };
  }
  async execute(sql: string, params?: unknown[]) {
    const database = this.database;
    database.executed.push(sql);
    if (/^(CREATE TABLE|ALTER TABLE|CREATE INDEX)/i.test(sql.trim())) {
      const next = database.ddlCount + 1;
      if (database.options.failStatement === next) throw new Error("synthetic ddl failure");
      database.ddlCount = next;
      const table = sql.match(/^CREATE TABLE `([^`]+)`/i)?.[1];
      const alter = sql.match(/^ALTER TABLE `([^`]+)` ADD `([^`]+)`/i);
      const constraint = sql.match(/^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/i);
      const index = sql.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)`/i);
      if (table) database.addTable(table);
      else if (alter) database.addColumn(alter[1], alter[2]);
      else if (constraint) database.addIndex(constraint[1], constraint[2]);
      else if (index) database.addIndex(index[2], index[1]);
      return { rows: [] };
    }
    if (sql.includes("0142:journal-insert")) {
      if (database.options.wrongAffectedRows) return { rows: [], affectedRows: 0 };
      const marker = { id: database.ledger.length + 1, hash: params?.[0], created_at: params?.[1] };
      if (database.options.duplicateJournal) this.pendingJournalRows.push({ ...marker });
      this.pendingJournalRows.push({ ...marker, id: marker.id + this.pendingJournalRows.length });
      return { rows: [], affectedRows: 1 };
    }
    if (sql.includes("0142:journal-commit")) {
      database.ledger.push(...this.pendingJournalRows);
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    if (sql.includes("0142:journal-rollback")) {
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function ddls(database: FakeDatabase) {
  return database.executed.filter(sql => /^(CREATE TABLE|ALTER TABLE|CREATE INDEX)/i.test(sql.trim()));
}
function journalWrites(database: FakeDatabase) {
  return database.executed.filter(sql => sql.includes("0142:journal-insert"));
}
async function currentRevision() {
  return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).stdout.trim();
}
async function validGates(now: number) {
  const executorDigest = createHash("sha256").update(await readFile(path.join(root, "scripts/migrations/0142-xml-importacao-lote-restrita.mjs"))).digest("hex");
  const exact = {
    reference: "QA-0142-EXACT",
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    approvedBy: "sergio",
    approvalRecordedBySergio: true,
    reviewScope: "executor-0142",
    approvedExecutorDigest: executorDigest,
    approvedSqlDigest: EXPECTED_SQL_SHA256,
    approvedGitRevision: await currentRevision(),
    artifactsRevision: ARTIFACTS_REVISION,
  };
  return {
    signoffs: { authorization: true, review: true, exactSql: true, executorDigest: true, artifactsRevision: true, window: true, backupExceptionOrProof: true, canonicalTarget: true, gitRevision: true },
    authorization: { ...exact, reference: "QA-0142-AUTH" },
    review: { ...exact, reference: "QA-0142-REVIEW" },
    window: { reference: "QA-0142-WINDOW", issuedAt: exact.issuedAt, expiresAt: exact.expiresAt },
    target: { ...target, issuedAt: exact.issuedAt, expiresAt: exact.expiresAt },
    backup: { reference: "QA-0142-BACKUP-EXCEPTION", issuedAt: exact.issuedAt, expiresAt: exact.expiresAt, appliesTo: "0142_large_krista_starr", kind: "exception", approvedBy: "sergio", exceptionAuthorized: true },
  };
}
async function applyOptions(database: FakeDatabase, now = Date.UTC(2030, 0, 1)) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xml-importacao-0142-"));
  temporaryDirectories.push(directory);
  const gates = await validGates(now);
  const executorDigest = createHash("sha256").update(await readFile(path.join(root, "scripts/migrations/0142-xml-importacao-lote-restrita.mjs"))).digest("hex");
  const gitRevision = await currentRevision();
  return {
    mode: "apply" as const,
    root,
    now,
    connectionFactory: database,
    gates,
    verifyExternalGates: async () => ({
      canonical: "restricted-0142-v1",
      authorization: true,
      review: true,
      window: true,
      backup: "exception",
      artifactsRevision: ARTIFACTS_REVISION,
      sqlDigest: EXPECTED_SQL_SHA256,
      gitRevision,
      executorDigest,
      migrationTag: "0142_large_krista_starr",
      canonicalTarget: target,
    }),
    privateCaptureKey: randomBytes(32),
    privateCaptureFile: path.join(directory, "capture.aes"),
    stateFile: path.join(directory, "state.json"),
  };
}

describe("executor restrito 0142", () => {
  it("faz preflight somente leitura em duas conexões independentes", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger());
    await expect(runRestricted0142({ root, connectionFactory: database, canonicalTarget: target })).resolves.toMatchObject({
      ok: true, mode: "preflight", phase: "preflight-read-only", ddlCount: 0, tables: 2, alteredTables: 3, addedColumns: 5, primaryKeys: 2, uniqueIndexes: 5, nonUniqueIndexes: 6,
    });
    expect(ddls(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
    expect(database.purposes).toEqual(["0142-preflight-a", "0142-preflight-b"]);
  });

  it("tolera apenas metadados legados divergentes do baseline no preflight", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger(), { legacyBaselineMetadataDrift: true });
    await expect(runRestricted0142({ root, connectionFactory: database, canonicalTarget: target })).resolves.toMatchObject({
      ok: true, mode: "preflight", phase: "preflight-read-only", ddlCount: 0,
    });
    expect(ddls(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
    expect(database.purposes).toEqual(["0142-preflight-a", "0142-preflight-b"]);
  });

  it("não descobre conexão pelo ambiente e exige factory, alvo e gates canônicos", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://must-not-be-read.invalid/blocked";
    try {
      await expect(runRestricted0142({ root, canonicalTarget: target })).resolves.toEqual({ ok: false, phase: "connection", reason: "connection_factory_required", ddlCount: 0 });
      await expect(runRestricted0142({ root, connectionFactory: new FakeDatabase(contracts, await baselineLedger()) })).resolves.toEqual({ ok: false, phase: "target", reason: "canonical_target_required", ddlCount: 0 });
      const database = new FakeDatabase(contracts, await baselineLedger());
      const options = await applyOptions(database);
      options.verifyExternalGates = async () => true as any;
      await expect(runRestricted0142(options)).resolves.toEqual({ ok: false, phase: "apply-gates", reason: "external_gates_missing_or_unverified", ddlCount: 0 });
      expect(database.purposes).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it("rejeita factory TLS sem verifyIdentity ou SNI idêntico antes de conectar", () => {
    const createConnection = vi.fn();
    expect(() => createInjectedMysql2TlsFactory({ mysql: { createConnection }, connectionOptions: { database: "synthetic", host: "tidb.qa", ssl: { ca: "synthetic-ca", rejectUnauthorized: true, verifyIdentity: false, servername: "tidb.qa" } } })).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(() => createInjectedMysql2TlsFactory({ mysql: { createConnection }, connectionOptions: { database: "synthetic", host: "tidb.qa", ssl: { ca: "synthetic-ca", rejectUnauthorized: true, verifyIdentity: true, servername: "other.qa" } } })).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("bloqueia objetos 0142 preexistentes antes de todo DDL", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger(), { preexisting0142Object: true });
    await expect(runRestricted0142(await applyOptions(database))).resolves.toEqual({ ok: false, phase: "preflight", reason: "preflight_not_stable_or_not_safe", ddlCount: 0 });
    expect(ddls(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("executa exatamente as catorze declarações versionadas em ordem e registra uma única entrada", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger());
    await expect(runRestricted0142(await applyOptions(database))).resolves.toMatchObject({ ok: true, mode: "apply", phase: "complete", ddlCount: 14 });
    expect(ddls(database)).toHaveLength(14);
    expect(journalWrites(database)).toHaveLength(1);
    expect(ddls(database).map(sql => sql.match(/^(?:CREATE TABLE|ALTER TABLE|CREATE INDEX) `([^`]+)/i)?.[1])).toEqual([
      "xml_importacao_itens", "xml_importacao_lotes", "contas_convenio_itens", "contas_convenio_resumo", "contas_convenio_resumo", "conta_contexto_medico_fontes", "conta_contexto_medico_fontes", "contas_convenio_resumo", "idx_xml_imp_item_lote_tipo_estado", "idx_xml_imp_item_arquivo", "idx_xml_imp_lote_claim", "idx_xml_imp_lote_escopo_historico", "idx_cci_xml_snapshot_scope", "idx_ccm_fonte_lote_importacao",
    ]);
    expect(database.purposes).toEqual(["0142-preflight-a", "0142-preflight-b", "0142-ddl", "0142-post-ddl-independent", "0142-journal", "0142-final-independent"]);
    expect(database.ledger).toHaveLength(103);
    expect(database.ledger.at(-1)).toMatchObject({ created_at: MIGRATION_TIMESTAMP });
  });

  it("para na primeira falha sem retry, rollback DDL ou journal", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger(), { failStatement: 8 });
    await expect(runRestricted0142(await applyOptions(database))).resolves.toEqual({ ok: false, phase: "ddl", reason: "statement_failed_no_retry", ddlCount: 7 });
    expect(ddls(database)).toHaveLength(8);
    expect(journalWrites(database)).toEqual([]);
  });

  it("bloqueia divergência física incremental antes do journal", async () => {
    const database = new FakeDatabase(contracts, await baselineLedger(), { schemaDeviationAfterAllDdl: true });
    await expect(runRestricted0142(await applyOptions(database))).resolves.toEqual({ ok: false, phase: "ddl-validation", reason: "statement_object_validation_failed", ddlCount: 14 });
    expect(journalWrites(database)).toEqual([]);
  });

  it("bloqueia journal duplicado e segunda execução com marcador 0142", async () => {
    const duplicate = new FakeDatabase(contracts, await baselineLedger(), { duplicateJournal: true });
    await expect(runRestricted0142(await applyOptions(duplicate))).resolves.toEqual({ ok: false, phase: "journal", reason: "journal_guard_failed", ddlCount: 14 });
    expect(journalWrites(duplicate)).toHaveLength(1);
    expect(duplicate.ledger).toHaveLength(102);
    const alreadyRegistered = await baselineLedger();
    alreadyRegistered.push({ id: 103, hash: EXPECTED_SQL_SHA256, created_at: MIGRATION_TIMESTAMP });
    const second = new FakeDatabase(contracts, alreadyRegistered);
    await expect(runRestricted0142(await applyOptions(second))).resolves.toEqual({ ok: false, phase: "preflight", reason: "preflight_not_stable_or_not_safe", ddlCount: 0 });
    expect(ddls(second)).toEqual([]);
    expect(journalWrites(second)).toEqual([]);
  });
});
