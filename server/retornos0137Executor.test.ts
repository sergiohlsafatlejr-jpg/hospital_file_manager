import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIGRATION_TIMESTAMP,
  TARGET_TABLES,
  createInjectedMysql2TlsFactory,
  runRestricted0137,
} from "../scripts/migrations/0137-retornos-restrita.mjs";

type Column = {
  position: number;
  name: string;
  type: string;
  nullable: boolean;
  autoincrement: boolean;
  default: string | null;
  onUpdate: boolean;
};
type Index = {
  name: string;
  unique: boolean;
  columns: string[];
  primary: boolean;
};
type ForeignKey = {
  name: string;
  tableFrom: string;
  tableTo: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete: string;
  onUpdate: string;
};
type Contract = Record<
  string,
  { columns: Column[]; indexes: Index[]; foreignKeys: ForeignKey[] }
>;

type FakeOptions = {
  failStatement?: number;
  extraUnknownIndexAfterForeignKey?: boolean;
  schemaDeviationAfterAllDdl?: boolean;
  throwSecretOnPreflight?: boolean;
  commitAmbiguous?: boolean;
  wrongAffectedRows?: boolean;
  duplicateJournal?: boolean;
  raceBeforeJournal?: boolean;
  identityMismatchAfter?: number;
  identityMismatchPurpose?: string;
};

const root = path.resolve(import.meta.dirname, "..");
let tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function targetContract(): Promise<Contract> {
  const snapshot = JSON.parse(
    await readFile(path.join(root, "drizzle/meta/0137_snapshot.json"), "utf8")
  );
  return Object.fromEntries(
    TARGET_TABLES.map(name => {
      const table = snapshot.tables[name];
      const columns = Object.values(table.columns).map(
        (column: any, position) => ({
          position: position + 1,
          name: column.name,
          type: normalize(column.type),
          nullable: !column.notNull,
          autoincrement: Boolean(column.autoincrement),
          default:
            column.default === undefined ? null : normalize(column.default),
          onUpdate: Boolean(column.onUpdate),
        })
      );
      const indexes: Index[] = [
        ...Object.values(table.compositePrimaryKeys).map((primary: any) => ({
          name: "PRIMARY",
          unique: true,
          columns: primary.columns,
          primary: true,
        })),
        ...Object.values(table.indexes).map((index: any) => ({
          name: index.name,
          unique: Boolean(index.isUnique),
          columns: index.columns,
          primary: false,
        })),
      ];
      const foreignKeys: ForeignKey[] = Object.values(table.foreignKeys).map(
        (foreignKey: any) => ({
          name: foreignKey.name,
          tableFrom: foreignKey.tableFrom,
          tableTo: foreignKey.tableTo,
          columnsFrom: foreignKey.columnsFrom,
          columnsTo: foreignKey.columnsTo,
          onDelete: normalize(foreignKey.onDelete),
          onUpdate: normalize(foreignKey.onUpdate),
        })
      );
      return [name, { columns, indexes, foreignKeys }];
    })
  );
}

async function baselineLedger() {
  const hash0136 = createHash("sha256")
    .update(
      await readFile(path.join(root, "drizzle/0136_lame_dreadnoughts.sql"))
    )
    .digest("hex");
  return Array.from({ length: 97 }, (_, index) => ({
    id: index + 1,
    hash: index === 96 ? hash0136 : `synthetic-${index + 1}`,
    created_at:
      index === 96 ? MIGRATION_TIMESTAMP - 1043411666 : 1700000000000 + index,
  }));
}

class FakeDatabase {
  readonly contract: Contract;
  readonly options: FakeOptions;
  readonly ledger: Array<Record<string, unknown>>;
  readonly tables = new Set<string>();
  readonly indexes = new Map<string, Index>();
  readonly foreignKeys = new Map<string, ForeignKey>();
  readonly executed: string[] = [];
  readonly queried: string[] = [];
  readonly purposes: string[] = [];
  readonly identityReads: string[] = [];
  ddlCount = 0;

  constructor(
    contract: Contract,
    ledger: Array<Record<string, unknown>>,
    options: FakeOptions = {}
  ) {
    this.contract = contract;
    this.ledger = ledger;
    this.options = options;
  }

  async connect(purpose: string) {
    this.purposes.push(purpose);
    return new FakeConnection(this, purpose);
  }

  addTable(name: string) {
    this.tables.add(name);
    for (const index of this.contract[name].indexes.filter(
      item => item.primary || item.unique
    )) {
      this.indexes.set(`${name}:${index.name}`, index);
    }
  }

  addForeignKey(name: string) {
    const foreignKey = Object.values(this.contract)
      .flatMap(table => table.foreignKeys)
      .find(item => item.name === name);
    if (!foreignKey) throw new Error("unknown fake FK");
    this.foreignKeys.set(name, foreignKey);
    if (name === "fk_rec_ret_rev_linha") {
      this.indexes.set(`${foreignKey.tableFrom}:${name}`, {
        name,
        unique: false,
        columns: ["linha_id"],
        primary: false,
      });
    }
    if (this.options.extraUnknownIndexAfterForeignKey) {
      this.indexes.set(`${foreignKey.tableFrom}:unapproved_${name}`, {
        name: `unapproved_${name}`,
        unique: false,
        columns: foreignKey.columnsFrom,
        primary: false,
      });
    }
  }

  addIndex(name: string) {
    const found = Object.values(this.contract)
      .flatMap(table => table.indexes)
      .find(item => item.name === name);
    if (!found) throw new Error("unknown fake index");
    const table = Object.entries(this.contract).find(([, value]) =>
      value.indexes.some(item => item.name === name)
    )?.[0];
    if (!table) throw new Error("unknown fake index table");
    this.indexes.set(`${table}:${name}`, found);
  }

  columnsRows() {
    const rows: Record<string, unknown>[] = [];
    for (const table of TARGET_TABLES) {
      if (!this.tables.has(table)) continue;
      for (const column of this.contract[table].columns) {
        rows.push({
          TABLE_NAME: table,
          ORDINAL_POSITION: column.position,
          COLUMN_NAME: column.name,
          COLUMN_TYPE:
            this.options.schemaDeviationAfterAllDdl &&
            this.ddlCount === 16 &&
            column.name === "valor"
              ? "decimal(13,2)"
              : column.type,
          IS_NULLABLE: column.nullable ? "YES" : "NO",
          COLUMN_DEFAULT: column.default,
          EXTRA:
            `${column.autoincrement ? "auto_increment" : ""}${column.onUpdate ? " on update CURRENT_TIMESTAMP" : ""}`.trim(),
        });
      }
    }
    return rows;
  }

  indexRows() {
    const rows: Record<string, unknown>[] = [];
    for (const [key, index] of this.indexes) {
      const [table] = key.split(":");
      index.columns.forEach((column, offset) =>
        rows.push({
          TABLE_NAME: table,
          INDEX_NAME: index.name,
          NON_UNIQUE: index.unique ? 0 : 1,
          SEQ_IN_INDEX: offset + 1,
          COLUMN_NAME: column,
          SUB_PART: null,
        })
      );
    }
    return rows;
  }

  foreignKeyRows() {
    const rows: Record<string, unknown>[] = [];
    for (const foreignKey of this.foreignKeys.values()) {
      foreignKey.columnsFrom.forEach((column, offset) =>
        rows.push({
          CONSTRAINT_NAME: foreignKey.name,
          TABLE_NAME: foreignKey.tableFrom,
          ORDINAL_POSITION: offset + 1,
          COLUMN_NAME: column,
          REFERENCED_TABLE_NAME: foreignKey.tableTo,
          REFERENCED_COLUMN_NAME: foreignKey.columnsTo[offset],
          DELETE_RULE: foreignKey.onDelete,
          UPDATE_RULE: foreignKey.onUpdate,
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
  closed = false;

  constructor(database: FakeDatabase, purpose: string) {
    this.database = database;
    this.purpose = purpose;
  }

  async getIdentity() {
    this.database.identityReads.push(this.purpose);
    return {
      tlsVerified: true,
      serverProduct: "TiDB",
      databaseName: "synthetic_0137",
      serverVersion:
        this.database.options.identityMismatchPurpose === this.purpose ||
        (this.database.options.identityMismatchAfter &&
          this.database.purposes.length >=
            this.database.options.identityMismatchAfter)
          ? "8.0.11-TiDB-v8.5.4"
          : "8.0.11-TiDB-v8.5.3",
    };
  }

  async close() {
    this.closed = true;
  }

  async query(sql: string) {
    const database = this.database;
    database.queried.push(sql);
    if (
      database.options.throwSecretOnPreflight &&
      sql.includes("0137:fk-settings")
    ) {
      throw new Error(
        "mysql://operator:super-secret@remote.invalid/private-schema"
      );
    }
    if (sql.includes("0137:fk-settings")) {
      return {
        rows: [{ foreign_key_checks: "ON", tidb_enable_foreign_key: "ON" }],
      };
    }
    if (
      sql.includes("0137:ledger-baseline-lock") &&
      database.options.raceBeforeJournal
    ) {
      database.ledger.push({
        id: 98,
        hash: "synthetic-race",
        created_at: 1700000010000,
      });
      database.options.raceBeforeJournal = false;
    }
    if (
      sql.includes("0137:ledger-") ||
      sql.includes("0137:journal-reread-lock")
    )
      return { rows: [...database.ledger, ...this.pendingJournalRows] };
    if (sql.includes("0137:catalog-tables")) {
      return {
        rows: [
          { TABLE_NAME: "legacy_anchor", TABLE_TYPE: "BASE TABLE" },
          ...[...database.tables]
            .sort()
            .map(TABLE_NAME => ({ TABLE_NAME, TABLE_TYPE: "BASE TABLE" })),
        ],
      };
    }
    if (sql.includes("0137:catalog-columns"))
      return { rows: database.columnsRows() };
    if (sql.includes("0137:catalog-indexes"))
      return { rows: database.indexRows() };
    if (sql.includes("0137:catalog-fks"))
      return { rows: database.foreignKeyRows() };
    if (sql.includes("0137:collision-indexes"))
      return { rows: database.indexRows() };
    if (sql.includes("0137:collision-fks"))
      return { rows: database.foreignKeyRows() };
    if (sql.includes("0137:empty-table")) return { rows: [{ row_count: 0 }] };
    if (sql.includes("0137:ledger-anchor-lock")) return { rows: [{ id: 1 }] };
    return { rows: [] };
  }

  async execute(sql: string, params?: unknown[]) {
    const database = this.database;
    database.executed.push(sql);
    if (/^(CREATE TABLE|ALTER TABLE|CREATE INDEX)/.test(sql.trim())) {
      const next = database.ddlCount + 1;
      if (database.options.failStatement === next)
        throw new Error("synthetic statement failure");
      database.ddlCount = next;
      const table = sql.match(/CREATE TABLE `([^`]+)`/)?.[1];
      const foreignKey = sql.match(/ADD CONSTRAINT `([^`]+)`/)?.[1];
      const index = sql.match(/CREATE INDEX `([^`]+)`/)?.[1];
      if (table) database.addTable(table);
      else if (foreignKey) database.addForeignKey(foreignKey);
      else if (index) database.addIndex(index);
      return { rows: [] };
    }
    if (sql.includes("0137:journal-insert")) {
      if (database.options.wrongAffectedRows)
        return { rows: [], affectedRows: 0 };
      if (database.options.duplicateJournal) {
        this.pendingJournalRows.push({
          id: database.ledger.length + this.pendingJournalRows.length + 1,
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
    if (
      sql.includes("0137:journal-commit") &&
      database.options.commitAmbiguous
    ) {
      database.ledger.push(...this.pendingJournalRows);
      this.pendingJournalRows.splice(0);
      throw new Error("network failure after commit may have happened");
    }
    if (sql.includes("0137:journal-commit")) {
      database.ledger.push(...this.pendingJournalRows);
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    if (sql.includes("0137:journal-rollback")) {
      this.pendingJournalRows.splice(0);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

async function validGates(now: number) {
  const issuedAt = new Date(now - 1_000).toISOString();
  const expiresAt = new Date(now + 60_000).toISOString();
  const approvedExecutorDigest = createHash("sha256")
    .update(
      await readFile(
        path.join(root, "scripts/migrations/0137-retornos-restrita.mjs")
      )
    )
    .digest("hex");
  const evidence = {
    reference: "EV-0137-A",
    verifiedBy: "reviewer-0137",
    issuedAt,
    expiresAt,
  };
  return {
    backupDuravelRecuperacaoTiDb: evidence,
    homologacaoTiDb: { ...evidence, reference: "EV-0137-B" },
    revisorHumano: {
      ...evidence,
      reference: "EV-0137-C",
      approvedBy: "sergio",
      approvalRecordedBySergio: true,
      reviewScope: "executor-0137",
      approvedExecutorDigest,
      approvedArtifactsRevision: "98233a8",
    },
    autorizacaoSergio: {
      ...evidence,
      reference: "EV-0137-D",
      approvedBy: "sergio",
      approvalRecordedBySergio: true,
      reviewScope: "executor-0137",
      approvedExecutorDigest,
      approvedArtifactsRevision: "98233a8",
    },
    janelaExclusiva: { ...evidence, reference: "EV-0137-E" },
    contratoFisicoSergio: {
      ...evidence,
      reference: "EV-0137-F",
      approvedBy: "sergio",
      approvalRecordedBySergio: true,
      reviewScope: "executor-0137",
      approvedExecutorDigest,
      approvedArtifactsRevision: "98233a8",
      physicalContractOption: "known-residual-fk-index",
      knownResidualForeignKeyIndex:
        "recursos_retornos_revisoes.fk_rec_ret_rev_linha",
    },
  };
}

async function applyOptions(
  database: FakeDatabase,
  now = Date.UTC(2030, 0, 1)
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "retornos-0137-fake-")
  );
  tempDirectories.push(directory);
  return {
    mode: "apply" as const,
    connectionFactory: database,
    gates: await validGates(now),
    verifyExternalGates: async () => true,
    now,
    privateCaptureKey: randomBytes(32),
    privateCaptureFile: path.join(directory, "evidence.aes"),
    stateFile: path.join(directory, "state.json"),
  };
}

function journalWrites(database: FakeDatabase) {
  return database.executed.filter(sql => sql.includes("0137:journal-insert"));
}

function journalCommands(database: FakeDatabase, command: string) {
  return database.executed.filter(sql =>
    sql.includes(`0137:journal-${command}`)
  );
}

function ddl(database: FakeDatabase) {
  return database.executed.filter(sql =>
    /^(CREATE TABLE|ALTER TABLE|CREATE INDEX)/.test(sql.trim())
  );
}

describe("executor restrito 0137", () => {
  it("é somente leitura por padrão e não requer conexão, segredo ou ambiente", async () => {
    const result = await runRestricted0137({ root });
    expect(result).toEqual({
      ok: true,
      mode: "dry-run",
      phase: "local-identity-only",
      ddlCount: 0,
    });
  });

  it("falha fechado se faltam gates externos e não abre conexão nem executa DDL", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const result = await runRestricted0137({
      mode: "apply",
      root,
      connectionFactory: database,
    });
    expect(result).toMatchObject({
      ok: false,
      phase: "apply-gates",
      ddlCount: 0,
    });
    expect(database.purposes).toEqual([]);
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("rejeita backup ausente e verificador externo falso antes de abrir conexão", async () => {
    const missingBackup = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const missingBackupOptions = await applyOptions(missingBackup);
    delete (missingBackupOptions.gates as any).backupDuravelRecuperacaoTiDb;
    expect(
      await runRestricted0137({ root, ...missingBackupOptions })
    ).toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "external_gates_missing_or_unverified",
      ddlCount: 0,
    });
    expect(missingBackup.purposes).toEqual([]);

    const falseVerifier = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const falseVerifierOptions = await applyOptions(falseVerifier);
    falseVerifierOptions.verifyExternalGates = async () => false;
    expect(
      await runRestricted0137({ root, ...falseVerifierOptions })
    ).toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "external_gates_missing_or_unverified",
      ddlCount: 0,
    });
    expect(falseVerifier.purposes).toEqual([]);
  });

  it("requer gate físico explícito de Sergio antes de qualquer DDL", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const options = await applyOptions(database);
    delete (options.gates as any).contratoFisicoSergio;
    const result = await runRestricted0137({ root, ...options });
    expect(result).toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "external_gates_missing_or_unverified",
      ddlCount: 0,
    });
    expect(database.purposes).toEqual([]);
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("rejeita revisão humana sem aprovação registrada por Sergio para o executor exato", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const options = await applyOptions(database);
    options.gates.revisorHumano.approvedBy = "delegado-execucao";
    const result = await runRestricted0137({ root, ...options });
    expect(result).toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "external_gates_missing_or_unverified",
      ddlCount: 0,
    });
    expect(database.purposes).toEqual([]);
    expect(ddl(database)).toEqual([]);
  });

  it("rejeita factory TLS injetada sem verifyIdentity antes de chamar mysql", () => {
    const createConnection = vi.fn();
    const mysql = { createConnection };
    const baseOptions = {
      database: "synthetic_0137",
      ssl: { ca: "fake-ca", rejectUnauthorized: true },
    };

    expect(() =>
      createInjectedMysql2TlsFactory({ mysql, connectionOptions: baseOptions })
    ).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(() =>
      createInjectedMysql2TlsFactory({
        mysql,
        connectionOptions: {
          ...baseOptions,
          ssl: { ...baseOptions.ssl, verifyIdentity: false },
        },
      })
    ).toThrow("injected_mysql2_tls_configuration_invalid");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("percorre 16 declarações e grava um único journal somente em banco fake íntegro", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger()
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: true,
      mode: "apply",
      phase: "complete",
      ddlCount: 16,
    });
    expect(ddl(database)).toHaveLength(16);
    expect(journalWrites(database)).toHaveLength(1);
    expect(database.purposes).toEqual([
      "0137-preflight-a",
      "0137-preflight-b",
      "0137-ddl",
      "0137-post-ddl-independent",
      "0137-journal",
      "0137-final-independent",
    ]);
    expect(database.identityReads).toEqual([
      "0137-preflight-a",
      "0137-preflight-b",
      "0137-preflight-a",
      "0137-preflight-b",
      "0137-ddl",
      "0137-post-ddl-independent",
      "0137-journal",
      "0137-final-independent",
    ]);
  });

  it("rejeita índice extra desconhecido após FK, preserva o journal e para sem continuar", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { extraUnknownIndexAfterForeignKey: true }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "ddl-validation",
      reason: "statement_object_validation_failed",
      ddlCount: 5,
    });
    expect(ddl(database)).toHaveLength(5);
    expect(journalWrites(database)).toEqual([]);
  });

  it("recusa watermark posterior a 0136 mesmo com ledger de 97 linhas", async () => {
    const ledger = await baselineLedger();
    ledger[0].created_at = MIGRATION_TIMESTAMP - 1;
    const database = new FakeDatabase(await targetContract(), ledger);
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(database.ledger).toHaveLength(97);
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("recusa marcador hash de 0135 no ledger legado", async () => {
    const ledger = await baselineLedger();
    ledger[0].hash = createHash("sha256")
      .update(await readFile(path.join(root, "drizzle/0135_fuzzy_wolf_cub.sql")))
      .digest("hex");
    const database = new FakeDatabase(await targetContract(), ledger);
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_not_stable_or_not_safe",
      ddlCount: 0,
    });
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
  });

  it("não escreve journal quando o contrato físico diverge", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { schemaDeviationAfterAllDdl: true }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toMatchObject({
      ok: false,
      phase: "post-ddl",
      ddlCount: 16,
    });
    expect(journalWrites(database)).toEqual([]);
  });

  it("não repete declaração que falha e nunca alcança o journal", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { failStatement: 3 }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "ddl",
      reason: "statement_failed_no_retry",
      ddlCount: 2,
    });
    expect(ddl(database)).toHaveLength(3);
    expect(journalWrites(database)).toEqual([]);
  });

  it("interrompe escritor com identidade divergente antes de executar DDL", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { identityMismatchPurpose: "0137-ddl" }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "ddl",
      reason: "ddl_connection_or_validation_failed",
      ddlCount: 0,
    });
    expect(ddl(database)).toEqual([]);
    expect(journalWrites(database)).toEqual([]);
    expect(database.identityReads).toContain("0137-ddl");
  });

  it("faz rollback sem COMMIT quando insert de journal retorna affectedRows zero", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { wrongAffectedRows: true }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "journal",
      reason: "journal_guard_failed",
      ddlCount: 16,
    });
    expect(journalWrites(database)).toHaveLength(1);
    expect(journalCommands(database, "rollback")).toHaveLength(1);
    expect(journalCommands(database, "commit")).toEqual([]);
    expect(database.ledger).toHaveLength(97);
  });

  it("faz rollback sem COMMIT se releitura transacional vê journal duplicado", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { duplicateJournal: true }
    );
    const result = await runRestricted0137({
      root,
      ...(await applyOptions(database)),
    });
    expect(result).toEqual({
      ok: false,
      phase: "journal",
      reason: "journal_guard_failed",
      ddlCount: 16,
    });
    expect(journalWrites(database)).toHaveLength(1);
    expect(journalCommands(database, "rollback")).toHaveLength(1);
    expect(journalCommands(database, "commit")).toEqual([]);
    expect(database.ledger).toHaveLength(97);
  });

  it("mantém o state file e bloqueia reinício após ambiguidade de commit", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { commitAmbiguous: true }
    );
    const options = await applyOptions(database);
    const first = await runRestricted0137({ root, ...options });
    expect(first).toEqual({
      ok: false,
      phase: "journal",
      reason: "journal_commit_uncertain",
      ddlCount: 16,
    });
    expect(journalWrites(database)).toHaveLength(1);
    expect((await stat(options.stateFile)).mode & 0o777).toBe(0o600);
    expect((await stat(options.privateCaptureFile)).mode & 0o777).toBe(0o600);
    const privateCapture = await readFile(options.privateCaptureFile, "utf8");
    expect(privateCapture).not.toContain("legacy_anchor");
    expect(privateCapture).not.toContain("synthetic-1");

    const second = await runRestricted0137({ root, ...options });
    expect(second).toEqual({
      ok: false,
      phase: "apply-gates",
      reason: "state_file_exists",
      ddlCount: 0,
    });
    expect(journalWrites(database)).toHaveLength(1);
  });

  it("sanitiza falhas de conexão: resultado não expõe URL, segredo, SQL ou metadados", async () => {
    const database = new FakeDatabase(
      await targetContract(),
      await baselineLedger(),
      { throwSecretOnPreflight: true }
    );
    const result = await runRestricted0137({
      mode: "dry-run",
      root,
      connectionFactory: database,
    });
    const publicResult = JSON.stringify(result);
    expect(result).toEqual({
      ok: false,
      phase: "preflight",
      reason: "preflight_connection_or_metadata_failure",
      ddlCount: 0,
    });
    expect(publicResult).not.toContain("super-secret");
    expect(publicResult).not.toContain("remote.invalid");
    expect(publicResult).not.toContain("SELECT");
  });
});
