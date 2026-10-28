import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARTIFACTS_REVISION,
  BASELINE_TABLES,
  EXPECTED_SQL_SHA256,
  MIGRATION_TIMESTAMP,
  TARGET_TABLES,
  createInjectedMysql2TlsFactory,
  runRestricted0141,
} from "../scripts/migrations/0141-contratos-convenios-restrita.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const target = {
  reference: "QA-0141-TARGET",
  serverProduct: "tidb",
  databaseName: "qa_restricted_0141",
  serverVersion: "8.0.11-TiDB-v8.5.3",
  certificateFingerprint: "c".repeat(64),
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
};
type Contract = Record<string, { columns: Column[]; indexes: Index[] }>;
type FakeOptions = {
  failStatement?: number;
  schemaDeviationAfterAllDdl?: boolean;
  duplicateJournal?: boolean;
  wrongAffectedRows?: boolean;
  missingBaselineIndex?: boolean;
  tableNotEmpty?: boolean;
  tlsVerified?: boolean;
  databaseName?: string;
};
let temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

function normalized(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function normalizeDefault(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw))
    return "CURRENT_TIMESTAMP";
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}
async function contracts(): Promise<Contract> {
  const [baselineSnapshot, targetSnapshot] = await Promise.all([
    readFile(path.join(root, "drizzle/meta/0140_snapshot.json"), "utf8").then(
      JSON.parse
    ),
    readFile(path.join(root, "drizzle/meta/0141_snapshot.json"), "utf8").then(
      JSON.parse
    ),
  ]);
  const snapshots = [baselineSnapshot, targetSnapshot];
  const result: Contract = {};
  for (const [snapshot, names] of snapshots.map(
    (snapshot, index) =>
      [snapshot, index === 0 ? BASELINE_TABLES : TARGET_TABLES] as const
  )) {
    for (const tableName of names) {
      const table = snapshot.tables[tableName];
      const indexes: Index[] = [
        ...Object.values(table.compositePrimaryKeys).map((entry: any) => ({
          name: "PRIMARY",
          unique: true,
          columns: entry.columns,
          primary: true,
        })),
        ...Object.values(table.indexes).map((entry: any) => ({
          name: entry.name,
          unique: Boolean(entry.isUnique),
          columns: entry.columns,
          primary: false,
        })),
        ...Object.values(table.uniqueConstraints).map((entry: any) => ({
          name: entry.name,
          unique: true,
          columns: entry.columns,
          primary: false,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));
      result[tableName] = {
        columns: Object.values(table.columns).map((entry: any) => ({
          name: entry.name,
          type: normalized(entry.type),
          nullable: !entry.notNull,
          default: normalizeDefault(entry.default),
          autoincrement: Boolean(entry.autoincrement),
          onUpdate: Boolean(entry.onUpdate),
        })),
        indexes,
      };
    }
  }
  return result;
}

async function baselineLedger() {
  const digest = async (name: string) =>
    createHash("sha256")
      .update(await readFile(path.join(root, `drizzle/${name}.sql`)))
      .digest("hex");
  const [hash0136, hash0137, hash0138, hash0139, hash0140] = await Promise.all([
    digest("0136_lame_dreadnoughts"),
    digest("0137_retornos_recursos_cassi"),
    digest("0138_known_blink"),
    digest("0139_past_toro"),
    digest("0140_bumpy_quasimodo"),
  ]);
  const ledger = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1,
    hash: `synthetic-${index + 1}`,
    created_at: 1700000000000 + index,
  }));
  ledger[96] = { id: 97, hash: hash0136, created_at: 1792003825434 };
  ledger[97] = { id: 98, hash: hash0137, created_at: 1793047237100 };
  ledger[98] = { id: 99, hash: hash0138, created_at: 1793104873640 };
  ledger[99] = { id: 100, hash: hash0139, created_at: 1793119956230 };
  ledger[100] = { id: 101, hash: hash0140, created_at: 1793135284537 };
  return ledger;
}

class FakeDatabase {
  readonly tables = new Set<string>();
  readonly indexes = new Map<string, Index>();
  readonly executed: string[] = [];
  readonly purposes: string[] = [];
  ddlCount = 0;
  constructor(
    readonly contract: Contract,
    readonly ledger: Array<Record<string, unknown>>,
    readonly options: FakeOptions = {}
  ) {
    for (const table of BASELINE_TABLES) {
      this.tables.add(table);
      for (const item of contract[table].indexes)
        if (
          !options.missingBaselineIndex ||
          item.name !== "idx_pront_pdf_arquivo_hospitalar"
        )
          this.indexes.set(`${table}:${item.name}`, item);
    }
  }
  async connect(purpose: string) {
    this.purposes.push(purpose);
    return new FakeConnection(this, purpose);
  }
  addTable(name: string) {
    this.tables.add(name);
    for (const item of this.contract[name].indexes.filter(
      item => item.primary || item.unique
    ))
      this.indexes.set(`${name}:${item.name}`, item);
  }
  addIndex(name: string) {
    for (const [table, contract] of Object.entries(this.contract)) {
      const found = contract.indexes.find(item => item.name === name);
      if (found) {
        this.indexes.set(`${table}:${name}`, found);
        return;
      }
    }
    throw new Error("unknown fake index");
  }
  tableRows() {
    return [
      { TABLE_NAME: "legacy_anchor", TABLE_TYPE: "BASE TABLE" },
      ...[...this.tables]
        .sort()
        .map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: "BASE TABLE" })),
    ];
  }
  columnRows() {
    const result: Record<string, unknown>[] = [];
    for (const name of [...BASELINE_TABLES, ...TARGET_TABLES])
      if (this.tables.has(name))
        for (const [offset, item] of this.contract[name].columns.entries())
          result.push({
            TABLE_NAME: name,
            ORDINAL_POSITION: offset + 1,
            COLUMN_NAME: item.name,
            COLUMN_TYPE:
              this.options.schemaDeviationAfterAllDdl &&
              this.ddlCount === 3 &&
              name === TARGET_TABLES[0] &&
              item.name === "status"
                ? "varchar(20)"
                : item.type,
            IS_NULLABLE: item.nullable ? "YES" : "NO",
            COLUMN_DEFAULT: item.default,
            EXTRA:
              `${item.autoincrement ? "auto_increment" : ""}${item.onUpdate ? " on update CURRENT_TIMESTAMP" : ""}`.trim(),
          });
    return result;
  }
  indexRows() {
    return [...this.indexes].flatMap(([key, item]) => {
      const [table] = key.split(":");
      return item.columns.map((column, offset) => ({
        TABLE_NAME: table,
        INDEX_NAME: item.name,
        NON_UNIQUE: item.unique ? 0 : 1,
        SEQ_IN_INDEX: offset + 1,
        COLUMN_NAME: column,
        SUB_PART: null,
      }));
    });
  }
}

class FakeConnection {
  readonly pendingJournalRows: Array<Record<string, unknown>> = [];
  constructor(
    readonly database: FakeDatabase,
    readonly purpose: string
  ) {}
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
    if (sql.includes("0141:history-layout"))
      return {
        rows: [
          {
            COLUMN_NAME: "id",
            ORDINAL_POSITION: 1,
            COLUMN_TYPE: "bigint unsigned",
            IS_NULLABLE: "NO",
            EXTRA: "auto_increment",
          },
          {
            COLUMN_NAME: "hash",
            ORDINAL_POSITION: 2,
            COLUMN_TYPE: "text",
            IS_NULLABLE: "NO",
            EXTRA: "",
          },
          {
            COLUMN_NAME: "created_at",
            ORDINAL_POSITION: 3,
            COLUMN_TYPE: "bigint",
            IS_NULLABLE: "NO",
            EXTRA: "",
          },
        ],
      };
    if (sql.includes("0141:ledger-"))
      return { rows: [...database.ledger, ...this.pendingJournalRows] };
    if (sql.includes("0141:catalog-tables"))
      return { rows: database.tableRows() };
    if (sql.includes("0141:catalog-columns"))
      return { rows: database.columnRows() };
    if (sql.includes("0141:catalog-indexes"))
      return { rows: database.indexRows() };
    if (sql.includes("0141:empty-table"))
      return { rows: [{ row_count: database.options.tableNotEmpty ? 1 : 0 }] };
    return { rows: [] };
  }
  async execute(sql: string, params?: unknown[]) {
    const database = this.database;
    database.executed.push(sql);
    if (/^(CREATE TABLE|CREATE INDEX)/i.test(sql.trim())) {
      const next = database.ddlCount + 1;
      if (database.options.failStatement === next)
        throw new Error("synthetic ddl failure");
      database.ddlCount = next;
      const table = sql.match(/CREATE TABLE `([^`]+)`/i)?.[1],
        index = sql.match(/CREATE INDEX `([^`]+)`/i)?.[1];
      if (table) database.addTable(table);
      else if (index) database.addIndex(index);
      return { rows: [] };
    }
    if (sql.includes("0141:journal-insert")) {
      if (database.options.wrongAffectedRows)
        return { rows: [], affectedRows: 0 };
      const marker = {
        id: database.ledger.length + 1,
        hash: params?.[0],
        created_at: params?.[1],
      };
      if (database.options.duplicateJournal)
        this.pendingJournalRows.push({ ...marker });
      this.pendingJournalRows.push({
        ...marker,
        id: marker.id + this.pendingJournalRows.length,
      });
      return { rows: [], affectedRows: 1 };
    }
    if (sql.includes("0141:journal-commit")) {
      database.ledger.push(...this.pendingJournalRows);
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    if (sql.includes("0141:journal-rollback")) {
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function ddls(database: FakeDatabase) {
  return database.executed.filter(sql =>
    /^(CREATE TABLE|CREATE INDEX)/i.test(sql.trim())
  );
}
function journalWrites(database: FakeDatabase) {
  return database.executed.filter(sql => sql.includes("0141:journal-insert"));
}
async function currentRevision() {
  return (
    await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    })
  ).stdout.trim();
}
async function validGates(now: number) {
  const executorDigest = createHash("sha256")
    .update(
      await readFile(
        path.join(
          root,
          "scripts/migrations/0141-contratos-convenios-restrita.mjs"
        )
      )
    )
    .digest("hex");
  const exact = {
    reference: "QA-0141-EXACT",
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    approvedBy: "sergio",
    approvalRecordedBySergio: true,
    reviewScope: "executor-0141",
    approvedExecutorDigest: executorDigest,
    approvedSqlDigest: EXPECTED_SQL_SHA256,
    approvedGitRevision: await currentRevision(),
    artifactsRevision: ARTIFACTS_REVISION,
  };
  return {
    signoffs: {
      authorization: true,
      review: true,
      exactSql: true,
      executorDigest: true,
      artifactsRevision: true,
      window: true,
      backupExceptionOrProof: true,
      canonicalTarget: true,
      gitRevision: true,
    },
    authorization: { ...exact, reference: "QA-0141-AUTH" },
    review: { ...exact, reference: "QA-0141-REVIEW" },
    window: {
      reference: "QA-0141-WINDOW",
      issuedAt: exact.issuedAt,
      expiresAt: exact.expiresAt,
    },
    target: { ...target, issuedAt: exact.issuedAt, expiresAt: exact.expiresAt },
    backup: {
      reference: "QA-0141-BACKUP-EXCEPTION",
      issuedAt: exact.issuedAt,
      expiresAt: exact.expiresAt,
      appliesTo: "0141_woozy_union_jack",
      kind: "exception",
      approvedBy: "sergio",
      exceptionAuthorized: true,
    },
  };
}
async function applyOptions(
  database: FakeDatabase,
  now = Date.UTC(2030, 0, 1)
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "contratos-convenios-0141-")
  );
  temporaryDirectories.push(directory);
  const gates = await validGates(now),
    executorDigest = createHash("sha256")
      .update(
        await readFile(
          path.join(
            root,
            "scripts/migrations/0141-contratos-convenios-restrita.mjs"
          )
        )
      )
      .digest("hex"),
    gitRevision = await currentRevision();
  return {
    mode: "apply" as const,
    root,
    now,
    connectionFactory: database,
    gates,
    verifyExternalGates: async () => ({
      canonical: "restricted-0141-v1",
      authorization: true,
      review: true,
      window: true,
      backup: "exception",
      artifactsRevision: ARTIFACTS_REVISION,
      sqlDigest: EXPECTED_SQL_SHA256,
      gitRevision,
      executorDigest,
      migrationTag: "0141_woozy_union_jack",
      canonicalTarget: target,
    }),
    privateCaptureKey: randomBytes(32),
    privateCaptureFile: path.join(directory, "capture.aes"),
    stateFile: path.join(directory, "state.json"),
  };
}

describe("executor restrito 0141", () => {
  it("faz preflight somente leitura com baseline pós-0140 e alvo canônico injetados", async () => {
    const database = new FakeDatabase(
      await contracts(),
      await baselineLedger()
    );
    await expect(
      runRestricted0141({
        root,
        connectionFactory: database,
        canonicalTarget: target,
      })
    ).resolves.toMatchObject({
      ok: true,
      mode: "preflight",
      phase: "preflight-read-only",
      ddlCount: 0,
      tables: 1,
      columns: 16,
      primaryKeys: 1,
      uniqueIndexes: 1,
      nonUniqueIndexes: 2,
    });
    expect(ddls(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
    expect(database.purposes).toEqual(["0141-preflight-a", "0141-preflight-b"]);
  });
  it("não descobre conexão por ambiente e requer factory, alvo e gates", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://must-not-be-read.invalid/blocked";
    try {
      await expect(
        runRestricted0141({ root, canonicalTarget: target })
      ).resolves.toEqual({
        ok: false,
        phase: "connection",
        reason: "connection_factory_required",
        ddlCount: 0,
      });
      await expect(
        runRestricted0141({
          root,
          connectionFactory: new FakeDatabase(
            await contracts(),
            await baselineLedger()
          ),
        })
      ).resolves.toEqual({
        ok: false,
        phase: "target",
        reason: "canonical_target_required",
        ddlCount: 0,
      });
      const database = new FakeDatabase(
          await contracts(),
          await baselineLedger()
        ),
        options = await applyOptions(database);
      options.verifyExternalGates = async () => true as any;
      await expect(runRestricted0141(options)).resolves.toEqual({
        ok: false,
        phase: "apply-gates",
        reason: "external_gates_missing_or_unverified",
        ddlCount: 0,
      });
      expect(database.purposes).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
  it("rejeita TLS sem CA, verifyIdentity ou SNI idêntico antes de conectar", () => {
    const createConnection = vi.fn();
    expect(() =>
      createInjectedMysql2TlsFactory({
        mysql: { createConnection },
        connectionOptions: {
          database: "synthetic",
          host: "tidb.qa",
          ssl: {
            ca: "synthetic-ca",
            rejectUnauthorized: true,
            verifyIdentity: false,
            servername: "tidb.qa",
          },
        },
      })
    ).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(() =>
      createInjectedMysql2TlsFactory({
        mysql: { createConnection },
        connectionOptions: {
          database: "synthetic",
          host: "tidb.qa",
          ssl: {
            ca: "synthetic-ca",
            rejectUnauthorized: true,
            verifyIdentity: true,
            servername: "other.qa",
          },
        },
      })
    ).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("bloqueia baseline que não contém os contratos físicos exatos pós-0140", async () => {
    const database = new FakeDatabase(
      await contracts(),
      await baselineLedger(),
      { missingBaselineIndex: true }
    );
    await expect(
      runRestricted0141(await applyOptions(database))
    ).resolves.toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(ddls(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });
  it("executa exatamente três DDLs na ordem e grava uma entrada 0141", async () => {
    const database = new FakeDatabase(
      await contracts(),
      await baselineLedger()
    );
    await expect(
      runRestricted0141(await applyOptions(database))
    ).resolves.toMatchObject({
      ok: true,
      mode: "apply",
      phase: "complete",
      ddlCount: 3,
    });
    expect(ddls(database)).toHaveLength(3);
    expect(journalWrites(database)).toHaveLength(1);
    expect(
      ddls(database).map(
        sql => sql.match(/^CREATE (?:TABLE|INDEX) `([^`]+)/i)?.[1]
      )
    ).toEqual([
      TARGET_TABLES[0],
      "idx_contratos_conv_doc_contrato",
      "idx_contratos_conv_doc_estabelecimento",
    ]);
    expect(database.purposes).toEqual([
      "0141-preflight-a",
      "0141-preflight-b",
      "0141-ddl",
      "0141-post-ddl-independent",
      "0141-journal",
      "0141-final-independent",
    ]);
    expect(database.ledger).toHaveLength(102);
    expect(database.ledger.at(-1)).toMatchObject({
      created_at: MIGRATION_TIMESTAMP,
    });
  });
  it("para na primeira falha sem retry e sem journal", async () => {
    const database = new FakeDatabase(
      await contracts(),
      await baselineLedger(),
      { failStatement: 2 }
    );
    await expect(
      runRestricted0141(await applyOptions(database))
    ).resolves.toEqual({
      ok: false,
      phase: "ddl",
      reason: "statement_failed_no_retry",
      ddlCount: 1,
    });
    expect(ddls(database)).toHaveLength(2);
    expect(journalWrites(database)).toEqual([]);
  });
  it("bloqueia divergência de catálogo antes do journal", async () => {
    const database = new FakeDatabase(
      await contracts(),
      await baselineLedger(),
      { schemaDeviationAfterAllDdl: true }
    );
    await expect(
      runRestricted0141(await applyOptions(database))
    ).resolves.toEqual({
      ok: false,
      phase: "ddl-validation",
      reason: "statement_object_validation_failed",
      ddlCount: 3,
    });
    expect(journalWrites(database)).toEqual([]);
  });
  it("bloqueia journal duplicado e nunca conclui uma segunda execução", async () => {
    const duplicate = new FakeDatabase(
      await contracts(),
      await baselineLedger(),
      { duplicateJournal: true }
    );
    await expect(
      runRestricted0141(await applyOptions(duplicate))
    ).resolves.toEqual({
      ok: false,
      phase: "journal",
      reason: "journal_guard_failed",
      ddlCount: 3,
    });
    expect(journalWrites(duplicate)).toHaveLength(1);
    expect(duplicate.ledger).toHaveLength(101);
    const alreadyRegistered = await baselineLedger();
    alreadyRegistered.push({
      id: 102,
      hash: EXPECTED_SQL_SHA256,
      created_at: MIGRATION_TIMESTAMP,
    });
    const second = new FakeDatabase(await contracts(), alreadyRegistered);
    await expect(
      runRestricted0141(await applyOptions(second))
    ).resolves.toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(ddls(second)).toEqual([]);
    expect(journalWrites(second)).toEqual([]);
  });
});
