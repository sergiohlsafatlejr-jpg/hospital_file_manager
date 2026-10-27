import { createHash, randomBytes } from "node:crypto";
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
  runRestricted0138,
} from "../scripts/migrations/0138-contexto-medico-restrita.mjs";

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
  remove0137?: boolean;
  historyCreatedAtNullable?: boolean;
};

const root = path.resolve(import.meta.dirname, "..");
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
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw)) {
    return "CURRENT_TIMESTAMP";
  }
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}

async function targetContract(): Promise<Contract> {
  const snapshot = JSON.parse(
    await readFile(path.join(root, "drizzle/meta/0138_snapshot.json"), "utf8")
  );
  return Object.fromEntries(
    TARGET_TABLES.map(tableName => {
      const table = snapshot.tables[tableName];
      const indexes: Index[] = [
        ...Object.values(table.compositePrimaryKeys).map((primary: any) => ({
          name: "PRIMARY",
          unique: true,
          columns: primary.columns,
          primary: true,
        })),
        ...Object.values(table.indexes).map((item: any) => ({
          name: item.name,
          unique: Boolean(item.isUnique),
          columns: item.columns,
          primary: false,
        })),
      ].sort((left, right) => left.name.localeCompare(right.name));
      const columns: Column[] = Object.values(table.columns).map((item: any) => ({
        name: item.name,
        type: normalized(item.type),
        nullable: !item.notNull,
        default: normalizeDefault(item.default),
        autoincrement: Boolean(item.autoincrement),
        onUpdate: Boolean(item.onUpdate),
      }));
      return [tableName, { columns, indexes }];
    })
  );
}

async function baselineLedger(options: FakeOptions = {}) {
  const hash0136 = createHash("sha256")
    .update(await readFile(path.join(root, "drizzle/0136_lame_dreadnoughts.sql")))
    .digest("hex");
  const hash0137 = createHash("sha256")
    .update(await readFile(path.join(root, "drizzle/0137_retornos_recursos_cassi.sql")))
    .digest("hex");
  const entries: Array<Record<string, unknown>> = [
    { id: 1, hash: "synthetic-prior-history", created_at: 1700000000000 },
    { id: 2, hash: hash0136, created_at: 1792003825434 },
  ];
  if (!options.remove0137) {
    entries.push({ id: 3, hash: hash0137, created_at: 1793047237100 });
  }
  return entries;
}

class FakeDatabase {
  readonly contract: Contract;
  readonly options: FakeOptions;
  readonly tables = new Set<string>();
  readonly indexes = new Map<string, Index>();
  readonly ledger: Array<Record<string, unknown>>;
  readonly executed: string[] = [];
  readonly queried: string[] = [];
  readonly purposes: string[] = [];
  ddlCount = 0;

  constructor(contract: Contract, ledger: Array<Record<string, unknown>>, options: FakeOptions = {}) {
    this.contract = contract;
    this.ledger = ledger;
    this.options = options;
  }

  async connect(purpose: string) {
    this.purposes.push(purpose);
    return new FakeConnection(this, purpose);
  }

  addTable(tableName: string) {
    this.tables.add(tableName);
    for (const item of this.contract[tableName].indexes.filter(
      index => index.primary || index.unique
    )) {
      this.indexes.set(`${tableName}:${item.name}`, item);
    }
  }

  addIndex(indexName: string) {
    for (const [tableName, table] of Object.entries(this.contract)) {
      const found = table.indexes.find(item => item.name === indexName);
      if (found) {
        this.indexes.set(`${tableName}:${indexName}`, found);
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
    const rows: Record<string, unknown>[] = [];
    for (const tableName of TARGET_TABLES) {
      if (!this.tables.has(tableName)) continue;
      for (const [offset, item] of this.contract[tableName].columns.entries()) {
        rows.push({
          TABLE_NAME: tableName,
          ORDINAL_POSITION: offset + 1,
          COLUMN_NAME: item.name,
          COLUMN_TYPE:
            this.options.schemaDeviationAfterAllDdl &&
            this.ddlCount === 7 &&
            tableName === TARGET_TABLES[0] &&
            item.name === "numero_conta"
              ? "varchar(101)"
              : item.type,
          IS_NULLABLE: item.nullable ? "YES" : "NO",
          COLUMN_DEFAULT: item.default,
          EXTRA: `${item.autoincrement ? "auto_increment" : ""}${
            item.onUpdate ? " on update CURRENT_TIMESTAMP" : ""
          }`.trim(),
        });
      }
    }
    return rows;
  }

  indexRows() {
    const rows: Record<string, unknown>[] = [];
    for (const [key, item] of this.indexes) {
      const [tableName] = key.split(":");
      item.columns.forEach((column, offset) =>
        rows.push({
          TABLE_NAME: tableName,
          INDEX_NAME: item.name,
          NON_UNIQUE: item.unique ? 0 : 1,
          SEQ_IN_INDEX: offset + 1,
          COLUMN_NAME: column,
          SUB_PART: null,
        })
      );
    }
    return rows;
  }
}

class FakeConnection {
  readonly database: FakeDatabase;
  readonly purpose: string;
  readonly pendingJournalRows: Array<Record<string, unknown>> = [];

  constructor(database: FakeDatabase, purpose: string) {
    this.database = database;
    this.purpose = purpose;
  }

  async getIdentity() {
    return {
      tlsVerified: true,
      serverProduct: "TiDB",
      databaseName: "qa_restricted_0138",
      serverVersion: "8.0.11-TiDB-v8.5.3",
    };
  }

  async close() {}

  async query(sql: string) {
    const database = this.database;
    database.queried.push(sql);
    if (sql.includes("0138:history-layout")) {
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
            IS_NULLABLE: database.options.historyCreatedAtNullable ? "YES" : "NO",
            EXTRA: "",
          },
        ],
      };
    }
    if (sql.includes("0138:ledger-")) {
      return { rows: [...database.ledger, ...this.pendingJournalRows] };
    }
    if (sql.includes("0138:ledger-anchor-lock")) return { rows: [{ id: 1 }] };
    if (sql.includes("0138:catalog-tables")) return { rows: database.tableRows() };
    if (sql.includes("0138:catalog-columns")) return { rows: database.columnRows() };
    if (sql.includes("0138:catalog-indexes")) return { rows: database.indexRows() };
    if (sql.includes("0138:catalog-fks")) return { rows: [] };
    if (sql.includes("0138:empty-table")) return { rows: [{ row_count: 0 }] };
    return { rows: [] };
  }

  async execute(sql: string, params?: unknown[]) {
    const database = this.database;
    database.executed.push(sql);
    if (/^(CREATE TABLE|CREATE INDEX)/.test(sql.trim())) {
      const next = database.ddlCount + 1;
      if (database.options.failStatement === next) throw new Error("synthetic ddl failure");
      database.ddlCount = next;
      const tableName = sql.match(/CREATE TABLE `([^`]+)`/)?.[1];
      const indexName = sql.match(/CREATE INDEX `([^`]+)`/)?.[1];
      if (tableName) database.addTable(tableName);
      else if (indexName) database.addIndex(indexName);
      return { rows: [] };
    }
    if (sql.includes("0138:journal-insert")) {
      if (database.options.wrongAffectedRows) return { rows: [], affectedRows: 0 };
      if (database.options.duplicateJournal) {
        this.pendingJournalRows.push({
          id: database.ledger.length + 1,
          hash: params?.[0],
          created_at: params?.[1],
        });
      }
      this.pendingJournalRows.push({
        id: database.ledger.length + this.pendingJournalRows.length + 1,
        hash: params?.[0],
        created_at: params?.[1],
      });
      return { rows: [], affectedRows: 1 };
    }
    if (sql.includes("0138:journal-commit")) {
      database.ledger.push(...this.pendingJournalRows);
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    if (sql.includes("0138:journal-rollback")) {
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function ddl(database: FakeDatabase) {
  return database.executed.filter(sql => /^(CREATE TABLE|CREATE INDEX)/.test(sql.trim()));
}

function journalWrites(database: FakeDatabase) {
  return database.executed.filter(sql => sql.includes("0138:journal-insert"));
}

async function validGates(now: number) {
  const executorDigest = createHash("sha256")
    .update(await readFile(path.join(root, "scripts/migrations/0138-contexto-medico-restrita.mjs")))
    .digest("hex");
  const evidence = {
    reference: "QA-0138-ATT",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  const exact = {
    ...evidence,
    approvedBy: "sergio",
    approvalRecordedBySergio: true,
    reviewScope: "executor-0138",
    approvedExecutorDigest: executorDigest,
    approvedSqlDigest: EXPECTED_SQL_SHA256,
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
    },
    authorization: { ...exact, reference: "QA-0138-AUTH" },
    review: { ...exact, reference: "QA-0138-REVIEW" },
    window: { ...evidence, reference: "QA-0138-WINDOW" },
    backup: {
      ...evidence,
      reference: "QA-0138-BACKUP-EXCEPTION",
      appliesTo: "0138_known_blink",
      kind: "exception",
      approvedBy: "sergio",
      exceptionAuthorized: true,
    },
  };
}

async function applyOptions(database: FakeDatabase, now = Date.UTC(2030, 0, 1)) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "conta-contexto-0138-"));
  temporaryDirectories.push(directory);
  const gates = await validGates(now);
  const executorDigest = createHash("sha256")
    .update(await readFile(path.join(root, "scripts/migrations/0138-contexto-medico-restrita.mjs")))
    .digest("hex");
  return {
    mode: "apply" as const,
    root,
    now,
    connectionFactory: database,
    gates,
    verifyExternalGates: async () => ({
      canonical: "restricted-0138-v1",
      authorization: true,
      review: true,
      window: true,
      backup: "exception",
      artifactsRevision: ARTIFACTS_REVISION,
      sqlDigest: EXPECTED_SQL_SHA256,
      executorDigest,
      migrationTag: "0138_known_blink",
    }),
    privateCaptureKey: randomBytes(32),
    privateCaptureFile: path.join(directory, "capture.aes"),
    stateFile: path.join(directory, "state.json"),
  };
}

describe("executor restrito 0138", () => {
  it("faz preflight por padrão somente por factory injetada, sem DDL ou ambiente", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger());
    const result = await runRestricted0138({ root, connectionFactory: database });

    expect(result).toMatchObject({
      ok: true,
      mode: "preflight",
      phase: "preflight-read-only",
      ddlCount: 0,
      tables: 3,
      columns: 45,
      primaryKeys: 3,
      uniqueIndexes: 3,
      nonUniqueIndexes: 4,
    });
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
    expect(database.purposes).toEqual(["0138-preflight-a", "0138-preflight-b"]);
  });

  it("aceita o layout real com data nullable quando todos os registros são válidos", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), {
      historyCreatedAtNullable: true,
    });
    const before = JSON.stringify(database.ledger);
    const result = await runRestricted0138({ root, connectionFactory: database });
    expect(result).toMatchObject({ ok: true, phase: "preflight-read-only", ddlCount: 0 });
    expect(JSON.stringify(database.ledger)).toBe(before);
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("aplica as mesmas sete DDLs no layout nullable sem editar histórico anterior", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), {
      historyCreatedAtNullable: true,
    });
    const before = JSON.stringify(database.ledger);
    const count = database.ledger.length;
    const result = await runRestricted0138(await applyOptions(database));
    expect(result).toMatchObject({ ok: true, ddlCount: 7 });
    expect(JSON.stringify(database.ledger.slice(0, count))).toBe(before);
    expect(database.ledger).toHaveLength(count + 1);
    expect(journalWrites(database)).toHaveLength(1);
  });

  it.each([null, undefined, "", " ", "invalid", "1.5", -1, 0, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "bloqueia histórico com data inválida %s mesmo em coluna nullable antes de qualquer DDL",
    async value => {
      const ledger = await baselineLedger();
      ledger[0].created_at = value;
      const database = new FakeDatabase(await targetContract(), ledger, {
        historyCreatedAtNullable: true,
      });
      const result = await runRestricted0138(await applyOptions(database));
      expect(result).toMatchObject({ ok: false, phase: "preflight", ddlCount: 0 });
      expect(ddl(database)).toEqual([]);
      expect(journalWrites(database)).toEqual([]);
    }
  );

  it("falha sem factory e nunca descobre conexão por DATABASE_URL ou ambiente", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://must-not-be-read.example/blocked";
    try {
      await expect(runRestricted0138({ root })).resolves.toEqual({
        ok: false,
        phase: "connection",
        reason: "connection_factory_required",
        ddlCount: 0,
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it("bloqueia apply sem aprovação canônica antes de abrir qualquer conexão", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger());
    const options = await applyOptions(database);
    options.verifyExternalGates = async () => true as any;

    await expect(runRestricted0138(options)).resolves.toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "external_gates_missing_or_unverified",
      ddlCount: 0,
    });
    expect(database.purposes).toEqual([]);
    expect(ddl(database)).toEqual([]);
  });

  it("rejeita adapter mysql2 sem verifyIdentity antes de chamar mysql", () => {
    const createConnection = vi.fn();
    expect(() =>
      createInjectedMysql2TlsFactory({
        mysql: { createConnection },
        connectionOptions: {
          database: "qa_restricted_0138",
          ssl: { ca: "synthetic-ca", rejectUnauthorized: true, verifyIdentity: false },
        },
      })
    ).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("aplica exatamente sete DDLs, valida cada passo e só então grava um journal", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger());
    const result = await runRestricted0138(await applyOptions(database));

    expect(result).toMatchObject({ ok: true, mode: "apply", phase: "complete", ddlCount: 7 });
    expect(ddl(database)).toHaveLength(7);
    expect(journalWrites(database)).toHaveLength(1);
    expect(database.purposes).toEqual([
      "0138-preflight-a",
      "0138-preflight-b",
      "0138-ddl",
      "0138-post-ddl-independent",
      "0138-journal",
      "0138-final-independent",
    ]);
  });

  it("para na falha parcial sem retry e nunca chega ao journal", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), {
      failStatement: 3,
    });
    const result = await runRestricted0138(await applyOptions(database));

    expect(result).toEqual({
      ok: false,
      phase: "ddl",
      reason: "statement_failed_no_retry",
      ddlCount: 2,
    });
    expect(ddl(database)).toHaveLength(3);
    expect(journalWrites(database)).toEqual([]);
  });

  it("não escreve journal se a verificação física independente diverge", async () => {
    const database = new FakeDatabase(await targetContract(), await baselineLedger(), {
      schemaDeviationAfterAllDdl: true,
    });
    const result = await runRestricted0138(await applyOptions(database));

    expect(result).toEqual({
      ok: false,
      phase: "ddl-validation",
      reason: "statement_object_validation_failed",
      ddlCount: 7,
    });
    expect(journalWrites(database)).toEqual([]);
  });

  it("exige o marcador 0137 intacto e rejeita baseline sem ele antes de DDL", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger({ remove0137: true })
    );
    const result = await runRestricted0138(await applyOptions(database));

    expect(result).toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("reverte journal duplicado e marca a segunda execução como não idempotente", async () => {
    const duplicate = new FakeDatabase(await targetContract(), await baselineLedger(), {
      duplicateJournal: true,
    });
    const duplicateResult = await runRestricted0138(await applyOptions(duplicate));
    expect(duplicateResult).toEqual({
      ok: false,
      phase: "journal",
      reason: "journal_guard_failed",
      ddlCount: 7,
    });
    expect(journalWrites(duplicate)).toHaveLength(1);
    expect(duplicate.ledger).toHaveLength(3);

    const successful = new FakeDatabase(await targetContract(), await baselineLedger());
    const firstOptions = await applyOptions(successful);
    expect((await runRestricted0138(firstOptions)).ok).toBe(true);
    const secondOptions = await applyOptions(successful);
    const second = await runRestricted0138(secondOptions);
    expect(second).toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(journalWrites(successful)).toHaveLength(1);
  });
});
