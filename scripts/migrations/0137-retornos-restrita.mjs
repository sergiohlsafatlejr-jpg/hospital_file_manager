#!/usr/bin/env node
/**
 * Executor restrito da Drizzle 0137.
 *
 * Este arquivo não lê DATABASE_URL, .env, credenciais nem cria conexões. A única
 * forma de obter uma conexão é a injeção explícita de connectionFactory por um
 * chamador já autorizado. O CLI sem adaptador executa somente a conferência
 * local, em modo dry-run.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDirectory, "../..");

export const MIGRATION_TAG = "0137_retornos_recursos_cassi";
export const MIGRATION_TIMESTAMP = 1793047237100;
export const APPROVED_REVISIONS = ["8837a94", "98233a8"];
export const TARGET_TABLES = [
  "recursos_retornos_importacoes",
  "recursos_retornos_linhas",
  "recursos_retornos_pagamentos",
  "recursos_retornos_revisoes",
];

// Observado em fixture TiDB v8.5.3 local após as 16 declarações imutáveis.
// Esta não é uma permissão genérica para índices automáticos.
const KNOWN_RESIDUAL_FK_INDEX = {
  tableName: "recursos_retornos_revisoes",
  name: "fk_rec_ret_rev_linha",
  columns: ["linha_id"],
};
const PHYSICAL_CONTRACT_OPTION = "known-residual-fk-index";
const EXPECTED_HISTORICAL_ROWS = 97;

const ARTIFACT_PATHS = [
  "drizzle/0137_retornos_recursos_cassi.sql",
  "drizzle/schema-retornos-recursos.ts",
  "drizzle/meta/0137_snapshot.json",
  "drizzle/meta/_journal.json",
];

const EXPECTED_STATEMENT_KINDS = [
  "CREATE TABLE",
  "CREATE TABLE",
  "CREATE TABLE",
  "CREATE TABLE",
  "ALTER TABLE",
  "ALTER TABLE",
  "ALTER TABLE",
  "ALTER TABLE",
  "ALTER TABLE",
  "CREATE INDEX",
  "CREATE INDEX",
  "CREATE INDEX",
  "CREATE INDEX",
  "CREATE INDEX",
  "CREATE INDEX",
  "CREATE INDEX",
];

const FORBIDDEN_STATEMENT_START =
  /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|REPLACE|RENAME)\b/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

/** @typedef {{ rows?: Array<Record<string, unknown>>, affectedRows?: number }} QueryResult */
/** @typedef {{ query(sql: string, params?: unknown[]): Promise<QueryResult>, execute(sql: string, params?: unknown[]): Promise<QueryResult>, close?: () => Promise<void>, getIdentity?: () => Promise<Record<string, unknown>> }} RestrictedConnection */
/** @typedef {{ connect(purpose: string): Promise<RestrictedConnection> }} RestrictedConnectionFactory */

function stable(value) {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stable(value[key])])
    );
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function booleanOn(value) {
  return ["1", "on", "true"].includes(normalized(value));
}

function same(actual, expected) {
  return stableJson(actual) === stableJson(expected);
}

function emptyFailure(phase, reason, ddlCount = 0) {
  return { ok: false, phase, reason, ddlCount };
}

function safeErrorCode(error, fallback) {
  const code = String(
    error && typeof error === "object" ? (error.code ?? "") : ""
  );
  if (code === "EEXIST") return "state_or_capture_exists";
  if (code === "EACCES" || code === "EPERM") return "private_file_permissions";
  return fallback;
}

async function closeQuietly(connection) {
  if (!connection?.close) return;
  try {
    await connection.close();
  } catch {
    // Deliberately do not leak driver messages, addresses, SQL or credentials.
  }
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function query(connection, sql, params) {
  return rows(await connection.query(sql, params));
}

async function execute(connection, sql, params) {
  return connection.execute(sql, params);
}

function artifactFile(root, relativePath) {
  const result = path.resolve(root, relativePath);
  if (!result.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error("unsafe_artifact_path");
  }
  return result;
}

async function gitBlob(root, revision, relativePath) {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${revision}:${relativePath}`],
    { cwd: root, encoding: "buffer", maxBuffer: 12 * 1024 * 1024 }
  );
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

function parseStatements(sql) {
  return sql
    .split(/\s*-->\s*statement-breakpoint\s*/g)
    .map(statement => statement.trim())
    .filter(Boolean);
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  // Closed, documented TiDB v8.5.3 equivalence from the local fixture. Do not
  // lowercase literal defaults: enum values remain case-sensitive.
  if (
    /^\(?now\(\)\)?$/i.test(raw) ||
    /^current_timestamp(?:\(\))?$/i.test(raw)
  ) {
    return "CURRENT_TIMESTAMP";
  }
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}

function columnContract(snapshotTable) {
  return Object.values(snapshotTable.columns).map((column, position) => ({
    position: position + 1,
    name: column.name,
    type: normalized(column.type),
    nullable: !column.notNull,
    autoincrement: Boolean(column.autoincrement),
    default: normalizeDefault(column.default),
    onUpdate: Boolean(column.onUpdate),
  }));
}

function snapshotContract(snapshot) {
  const tables = {};
  for (const name of TARGET_TABLES) {
    const table = snapshot.tables?.[name];
    if (!table) throw new Error("snapshot_target_missing");

    const indexes = [];
    for (const primaryKey of Object.values(table.compositePrimaryKeys ?? {})) {
      indexes.push({
        name: "PRIMARY",
        unique: true,
        columns: primaryKey.columns,
        primary: true,
      });
    }
    for (const index of Object.values(table.indexes ?? {})) {
      indexes.push({
        name: index.name,
        unique: Boolean(index.isUnique),
        columns: index.columns,
        primary: false,
      });
    }

    tables[name] = {
      columns: columnContract(table),
      indexes,
      foreignKeys: Object.values(table.foreignKeys ?? {}).map(foreignKey => ({
        name: foreignKey.name,
        tableFrom: foreignKey.tableFrom,
        tableTo: foreignKey.tableTo,
        columnsFrom: foreignKey.columnsFrom,
        columnsTo: foreignKey.columnsTo,
        onDelete: normalized(foreignKey.onDelete),
        onUpdate: normalized(foreignKey.onUpdate),
      })),
    };
  }
  return tables;
}

function expectedNamedObjects(contract) {
  const indexNames = [];
  const foreignKeyNames = [];
  for (const table of Object.values(contract)) {
    for (const index of table.indexes) {
      if (index.name !== "PRIMARY") indexNames.push(index.name);
    }
    for (const foreignKey of table.foreignKeys)
      foreignKeyNames.push(foreignKey.name);
  }
  return {
    indexNames: [...new Set(indexNames)].sort(),
    foreignKeyNames: [...new Set(foreignKeyNames)].sort(),
  };
}

function expectedCounts(contract) {
  const values = Object.values(contract);
  return {
    tables: values.length,
    foreignKeys: values.reduce(
      (total, table) => total + table.foreignKeys.length,
      0
    ),
    explicitIndexes: values.reduce(
      (total, table) =>
        total +
        table.indexes.filter(index => !index.unique && index.name !== "PRIMARY")
          .length,
      0
    ),
    uniqueIndexes: values.reduce(
      (total, table) =>
        total +
        table.indexes.filter(index => index.unique && index.name !== "PRIMARY")
          .length,
      0
    ),
  };
}

async function readLedgerAnchors(root) {
  const journal = JSON.parse(
    await readFile(artifactFile(root, "drizzle/meta/_journal.json"), "utf8")
  );
  const entry0135 = journal.entries?.find(entry => entry.idx === 135);
  const entry0136 = journal.entries?.find(entry => entry.idx === 136);
  const entry0137 = journal.entries?.find(entry => entry.idx === 137);
  if (
    !entry0135?.tag ||
    !entry0136?.tag ||
    entry0137?.tag !== MIGRATION_TAG ||
    entry0137?.when !== MIGRATION_TIMESTAMP
  ) {
    throw new Error("journal_anchor_invalid");
  }
  const [sql0135, sql0136] = await Promise.all([
    readFile(artifactFile(root, `drizzle/${entry0135.tag}.sql`)),
    readFile(artifactFile(root, `drizzle/${entry0136.tag}.sql`)),
  ]);
  return {
    migration0135: {
      tag: entry0135.tag,
      when: entry0135.when,
      hash: sha256(sql0135),
    },
    migration0136: {
      tag: entry0136.tag,
      when: entry0136.when,
      hash: sha256(sql0136),
    },
    migration0137: { tag: entry0137.tag, when: entry0137.when },
  };
}

/**
 * Lê a SQL, schema, snapshot e journal versionados e os compara byte a byte com
 * as duas revisões aprovadas. Nenhum hash é retornado ou impresso.
 */
export async function loadApprovedArtifacts({ root = projectRoot } = {}) {
  const local = {};
  try {
    for (const relativePath of ARTIFACT_PATHS) {
      local[relativePath] = await readFile(artifactFile(root, relativePath));
    }
  } catch {
    return { ok: false, reason: "artifact_unavailable" };
  }

  try {
    for (const revision of APPROVED_REVISIONS) {
      for (const relativePath of ARTIFACT_PATHS) {
        const approved = await gitBlob(root, revision, relativePath);
        if (!approved.equals(local[relativePath])) {
          return { ok: false, reason: "artifact_identity_mismatch" };
        }
      }
    }
  } catch {
    return { ok: false, reason: "approved_revision_unavailable" };
  }

  try {
    const sql = local[ARTIFACT_PATHS[0]].toString("utf8");
    const snapshot = JSON.parse(local[ARTIFACT_PATHS[2]].toString("utf8"));
    const journal = JSON.parse(local[ARTIFACT_PATHS[3]].toString("utf8"));
    const statements = parseStatements(sql);
    const journalEntry = journal.entries?.find(entry => entry.idx === 137);
    const statementKinds = statements.map(
      statement =>
        statement
          .match(/^(CREATE TABLE|ALTER TABLE|CREATE INDEX)\b/i)?.[1]
          ?.toUpperCase() ?? ""
    );
    const contract = snapshotContract(snapshot);
    const count = expectedCounts(contract);
    const ledgerAnchors = await readLedgerAnchors(root);

    if (
      statements.length !== 16 ||
      !same(statementKinds, EXPECTED_STATEMENT_KINDS) ||
      count.tables !== 4 ||
      count.foreignKeys !== 5 ||
      count.explicitIndexes !== 7 ||
      count.uniqueIndexes !== 8 ||
      journalEntry?.tag !== MIGRATION_TAG ||
      journalEntry?.when !== MIGRATION_TIMESTAMP ||
      journalEntry?.breakpoints !== true ||
      statements.some(statement => FORBIDDEN_STATEMENT_START.test(statement))
    ) {
      return { ok: false, reason: "approved_artifact_contract_invalid" };
    }

    return {
      ok: true,
      sql,
      sqlHash: sha256(Buffer.from(sql, "utf8")),
      statements,
      contract,
      expectedNames: expectedNamedObjects(contract),
      counts: count,
      ledgerAnchors,
    };
  } catch {
    return { ok: false, reason: "approved_artifact_parse_failure" };
  }
}

function safeGate(gate, now) {
  if (!gate || typeof gate !== "object") return false;
  if (!SAFE_REFERENCE.test(String(gate.reference ?? ""))) return false;
  if (!SAFE_REFERENCE.test(String(gate.verifiedBy ?? ""))) return false;
  const expiresAt = Date.parse(String(gate.expiresAt ?? ""));
  const issuedAt = Date.parse(String(gate.issuedAt ?? ""));
  return (
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    issuedAt <= now &&
    expiresAt > now
  );
}

function isSergio(value) {
  return normalized(value) === "sergio";
}

function isExactSergioApproval(gate, executorDigest) {
  return (
    isSergio(gate?.approvedBy) &&
    gate?.approvalRecordedBySergio === true &&
    String(gate?.reviewScope ?? "") === "executor-0137" &&
    String(gate?.approvedExecutorDigest ?? "") === executorDigest &&
    APPROVED_REVISIONS.includes(String(gate?.approvedArtifactsRevision ?? ""))
  );
}

function isExactPhysicalContractApproval(gate, executorDigest) {
  return (
    isExactSergioApproval(gate, executorDigest) &&
    gate?.physicalContractOption === PHYSICAL_CONTRACT_OPTION &&
    gate?.knownResidualForeignKeyIndex ===
      `${KNOWN_RESIDUAL_FK_INDEX.tableName}.${KNOWN_RESIDUAL_FK_INDEX.name}`
  );
}

async function gatesAreCurrent(options, now, executorDigest) {
  const gates = options.gates;
  const required = [
    "backupDuravelRecuperacaoTiDb",
    "homologacaoTiDb",
    "revisorHumano",
    "autorizacaoSergio",
    "janelaExclusiva",
    "contratoFisicoSergio",
  ];
  if (!gates || !required.every(name => safeGate(gates[name], now)))
    return false;
  // Sergio is the permanent sole PR approver. An execution delegation is never
  // a substitute: both human review and execution authorization must name him,
  // bind to the exact local executor bytes, and bind an approved 0137 artifact revision.
  if (
    !isExactSergioApproval(gates.revisorHumano, executorDigest) ||
    !isExactSergioApproval(gates.autorizacaoSergio, executorDigest) ||
    !isExactPhysicalContractApproval(gates.contratoFisicoSergio, executorDigest)
  ) {
    return false;
  }
  if (
    gates.revisorHumano.approvedArtifactsRevision !==
    gates.autorizacaoSergio.approvedArtifactsRevision
  ) {
    return false;
  }
  if (typeof options.verifyExternalGates !== "function") return false;
  try {
    return (await options.verifyExternalGates(gates)) === true;
  } catch {
    return false;
  }
}

async function ensurePrivateParent(filePath) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await stat(directory);
  if ((info.mode & 0o077) !== 0) throw new Error("private_parent_permissions");
}

async function createExclusiveState(stateFile) {
  await ensurePrivateParent(stateFile);
  const handle = await open(stateFile, "wx", 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({
        kind: "restricted-0137",
        phase: "ddl-started",
        createdAt: new Date().toISOString(),
      }),
      "utf8"
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(stateFile, 0o600);
}

class PrivateCapture {
  constructor(filePath, key, handle) {
    this.filePath = filePath;
    this.key = key;
    this.handle = handle;
  }

  static async create(filePath, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new Error("capture_key_invalid");
    await ensurePrivateParent(filePath);
    const handle = await open(filePath, "wx", 0o600);
    try {
      await handle.writeFile("0137-private-aes256gcm-v1\n", "utf8");
      await handle.sync();
      await chmod(filePath, 0o600);
      return new PrivateCapture(filePath, Buffer.from(key), handle);
    } catch (error) {
      await handle.close();
      try {
        await unlink(filePath);
      } catch {}
      throw error;
    }
  }

  async append(label, rawMetadata) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(
      JSON.stringify({ label, metadata: rawMetadata }),
      "utf8"
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const line = JSON.stringify({
      v: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: ciphertext.toString("base64"),
    });
    await this.handle.writeFile(`${line}\n`, "utf8");
    await this.handle.sync();
  }

  async close() {
    try {
      await this.handle.close();
    } finally {
      this.key.fill(0);
    }
  }
}

async function readIdentity(connection) {
  if (typeof connection.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    if (
      identity?.tlsVerified !== true ||
      normalized(identity?.serverProduct) !== "tidb" ||
      !String(identity?.databaseName ?? "").trim() ||
      !String(identity?.serverVersion ?? "").trim()
    ) {
      return null;
    }
    return {
      tlsVerified: true,
      serverProduct: "tidb",
      databaseName: String(identity.databaseName),
      serverVersion: String(identity.serverVersion),
    };
  } catch {
    return null;
  }
}

/**
 * Adapta mysql2/promise recebido explicitamente pelo chamador autorizado. Não
 * importa .env, não resolve URL e não registra config/erros do driver.
 */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions }) {
  if (
    !mysql ||
    typeof mysql.createConnection !== "function" ||
    !connectionOptions ||
    typeof connectionOptions !== "object" ||
    !String(connectionOptions.database ?? "").trim() ||
    !connectionOptions.ssl ||
    connectionOptions.ssl.rejectUnauthorized !== true ||
    connectionOptions.ssl.verifyIdentity !== true ||
    !connectionOptions.ssl.ca
  ) {
    throw new Error("injected_mysql2_tls_configuration_invalid");
  }
  const options = {
    ...connectionOptions,
    multipleStatements: false,
    ssl: { ...connectionOptions.ssl, rejectUnauthorized: true, verifyIdentity: true },
  };
  return {
    async connect() {
      let raw;
      try {
        raw = await mysql.createConnection(options);
        const connection = {
          async query(sql, params) {
            const [result] = await raw.query(sql, params);
            return { rows: Array.isArray(result) ? result : [] };
          },
          async execute(sql, params) {
            const [result] = await raw.execute(sql, params);
            return {
              rows: Array.isArray(result) ? result : [],
              affectedRows: Number(result?.affectedRows ?? 0),
            };
          },
          async getIdentity() {
            const socket = raw.connection?.stream;
            const certificate = socket?.getPeerCertificate?.(true);
            if (
              socket?.encrypted !== true ||
              socket?.authorized !== true ||
              !certificate ||
              !Object.keys(certificate).length
            ) {
              return { tlsVerified: false };
            }
            const [identity] = await raw.query(
              "/* 0137:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`"
            );
            const row = identity?.[0] ?? {};
            const version = String(row.server_version ?? "");
            return {
              tlsVerified: true,
              serverProduct: /tidb/i.test(version) ? "tidb" : "other",
              databaseName: String(row.database_name ?? ""),
              serverVersion: version,
            };
          },
          async close() {
            await raw.end();
          },
        };
        return connection;
      } catch {
        try {
          await raw?.end();
        } catch {}
        throw new Error("injected_mysql2_connection_failed");
      }
    },
  };
}

/**
 * Exclusiva para QA local: torna explícitos loopback e nome sintético, mas
 * mantém a mesma verificação TLS do adaptador comum.
 */
export function createSyntheticLocalMysql2TlsFactory({
  mysql,
  connectionOptions,
}) {
  if (
    connectionOptions?.host !== "127.0.0.1" ||
    !String(connectionOptions?.database ?? "").startsWith("qa_0137_")
  ) {
    throw new Error("synthetic_local_target_invalid");
  }
  return createInjectedMysql2TlsFactory({ mysql, connectionOptions });
}

async function readLedger(connection) {
  return query(
    connection,
    "/* 0137:ledger-read */ SELECT `id`, `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `id`"
  );
}

function ledgerHas0137Marker(ledger, artifacts) {
  return ledger.some(
    entry =>
      String(entry.created_at) === String(artifacts.ledgerAnchors.migration0137.when) ||
      String(entry.hash) === artifacts.sqlHash
  );
}

function ledgerIsBaseline(ledger, artifacts) {
  const { migration0135, migration0136 } = artifacts.ledgerAnchors;
  const matching0135 = ledger.filter(
    entry =>
      String(entry.created_at) === String(migration0135.when) ||
      String(entry.hash) === migration0135.hash
  );
  const matching0136 = ledger.filter(
    entry =>
      String(entry.created_at) === String(migration0136.when) ||
      String(entry.hash) === migration0136.hash
  );
  const marker0135Absent = matching0135.length === 0;
  const marker0136Exact =
    matching0136.length === 1 &&
    String(matching0136[0].created_at) === String(migration0136.when) &&
    String(matching0136[0].hash) === migration0136.hash;
  const noWatermarkBeyond0136 = ledger.every(
    entry => Number(entry.created_at) <= Number(migration0136.when)
  );
  return (
    ledger.length === EXPECTED_HISTORICAL_ROWS &&
    marker0135Absent &&
    marker0136Exact &&
    !ledgerHas0137Marker(ledger, artifacts) &&
    noWatermarkBeyond0136
  );
}

function groupIndexes(indexRows) {
  const grouped = new Map();
  for (const row of indexRows) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? "");
    const name = String(row.INDEX_NAME ?? row.index_name ?? "");
    if (!table || !name) continue;
    const key = `${table}\u0000${name}`;
    const current = grouped.get(key) ?? {
      table,
      name,
      unique: String(row.NON_UNIQUE ?? row.non_unique ?? "1") === "0",
      columns: [],
    };
    current.columns.push({
      sequence: Number(row.SEQ_IN_INDEX ?? row.seq_in_index ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
      subPart: row.SUB_PART ?? row.sub_part ?? null,
    });
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(index => ({
      ...index,
      columns: index.columns.sort((a, b) => a.sequence - b.sequence),
    }))
    .sort((a, b) =>
      `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`)
    );
}

function normalizeColumns(columnRows) {
  return columnRows
    .map(row => ({
      table: String(row.TABLE_NAME ?? row.table_name ?? ""),
      position: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
      type: normalized(row.COLUMN_TYPE ?? row.column_type),
      nullable: normalized(row.IS_NULLABLE ?? row.is_nullable) === "yes",
      autoincrement: /auto_increment/.test(normalized(row.EXTRA ?? row.extra)),
      default: normalizeDefault(row.COLUMN_DEFAULT),
      onUpdate: /on update/.test(normalized(row.EXTRA ?? row.extra)),
    }))
    .sort((a, b) => a.table.localeCompare(b.table) || a.position - b.position);
}

function normalizeForeignKeys(foreignKeyRows) {
  const grouped = new Map();
  for (const row of foreignKeyRows) {
    const name = String(row.CONSTRAINT_NAME ?? row.constraint_name ?? "");
    if (!name) continue;
    const current = grouped.get(name) ?? {
      name,
      tableFrom: String(row.TABLE_NAME ?? row.table_name ?? ""),
      tableTo: String(
        row.REFERENCED_TABLE_NAME ?? row.referenced_table_name ?? ""
      ),
      columnsFrom: [],
      columnsTo: [],
      onDelete: normalized(row.DELETE_RULE ?? row.delete_rule),
      onUpdate: normalized(row.UPDATE_RULE ?? row.update_rule),
    };
    current.columnsFrom.push({
      sequence: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
    });
    current.columnsTo.push({
      sequence: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(
        row.REFERENCED_COLUMN_NAME ?? row.referenced_column_name ?? ""
      ),
    });
    grouped.set(name, current);
  }
  return [...grouped.values()]
    .map(foreignKey => ({
      ...foreignKey,
      columnsFrom: foreignKey.columnsFrom
        .sort((a, b) => a.sequence - b.sequence)
        .map(item => item.name),
      columnsTo: foreignKey.columnsTo
        .sort((a, b) => a.sequence - b.sequence)
        .map(item => item.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function readCatalog(connection, expectedNames) {
  const placeholdersIndexes =
    expectedNames.indexNames.map(() => "?").join(", ") || "''";
  const placeholdersForeignKeys =
    expectedNames.foreignKeyNames.map(() => "?").join(", ") || "''";

  const [
    allTables,
    targetColumns,
    targetIndexes,
    targetForeignKeys,
    namedIndexes,
    namedConstraints,
  ] = await Promise.all([
    query(
      connection,
      "/* 0137:catalog-tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`"
    ),
    query(
      connection,
      "/* 0137:catalog-columns */ SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`"
    ),
    query(
      connection,
      "/* 0137:catalog-indexes */ SELECT `TABLE_NAME`, `INDEX_NAME`, `NON_UNIQUE`, `SEQ_IN_INDEX`, `COLUMN_NAME`, `SUB_PART` FROM `information_schema`.`statistics` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`"
    ),
    query(
      connection,
      "/* 0137:catalog-fks */ SELECT `kcu`.`CONSTRAINT_NAME`, `kcu`.`TABLE_NAME`, `kcu`.`ORDINAL_POSITION`, `kcu`.`COLUMN_NAME`, `kcu`.`REFERENCED_TABLE_NAME`, `kcu`.`REFERENCED_COLUMN_NAME`, `rc`.`DELETE_RULE`, `rc`.`UPDATE_RULE` FROM `information_schema`.`KEY_COLUMN_USAGE` AS `kcu` JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `rc` ON `rc`.`CONSTRAINT_SCHEMA` = `kcu`.`CONSTRAINT_SCHEMA` AND `rc`.`CONSTRAINT_NAME` = `kcu`.`CONSTRAINT_NAME` WHERE `kcu`.`CONSTRAINT_SCHEMA` = DATABASE() AND `kcu`.`REFERENCED_TABLE_NAME` IS NOT NULL ORDER BY `kcu`.`CONSTRAINT_NAME`, `kcu`.`ORDINAL_POSITION`"
    ),
    query(
      connection,
      `/* 0137:collision-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`index_name\` IN (${placeholdersIndexes}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\``,
      expectedNames.indexNames
    ),
    query(
      connection,
      `/* 0137:collision-fks */ SELECT \`TABLE_NAME\`, \`CONSTRAINT_NAME\` FROM \`information_schema\`.\`KEY_COLUMN_USAGE\` WHERE \`CONSTRAINT_SCHEMA\` = DATABASE() AND \`CONSTRAINT_NAME\` IN (${placeholdersForeignKeys}) ORDER BY \`TABLE_NAME\`, \`CONSTRAINT_NAME\``,
      expectedNames.foreignKeyNames
    ),
  ]);

  return {
    allTables: allTables
      .map(row => ({
        name: String(row.TABLE_NAME ?? row.table_name ?? ""),
        type: String(row.TABLE_TYPE ?? row.table_type ?? ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    columns: normalizeColumns(targetColumns),
    indexes: groupIndexes(targetIndexes),
    foreignKeys: normalizeForeignKeys(targetForeignKeys),
    namedIndexes: namedIndexes
      .map(row => ({
        table: String(row.TABLE_NAME ?? row.table_name ?? ""),
        name: String(row.INDEX_NAME ?? row.index_name ?? ""),
      }))
      .sort((a, b) =>
        `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`)
      ),
    namedConstraints: namedConstraints
      .map(row => ({
        table: String(row.TABLE_NAME ?? row.table_name ?? ""),
        name: String(row.CONSTRAINT_NAME ?? row.constraint_name ?? ""),
      }))
      .sort((a, b) =>
        `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`)
      ),
  };
}

async function inspectPreflight(connection, artifacts) {
  const [identity, foreignKeyVariables, ledger, catalog] = await Promise.all([
    readIdentity(connection),
    query(
      connection,
      "/* 0137:fk-settings */ SELECT @@foreign_key_checks AS `foreign_key_checks`, @@tidb_enable_foreign_key AS `tidb_enable_foreign_key`"
    ),
    readLedger(connection),
    readCatalog(connection, artifacts.expectedNames),
  ]);
  const targetTablesPresent = catalog.allTables.filter(table =>
    TARGET_TABLES.includes(table.name)
  );
  return {
    identity,
    foreignKeyVariables,
    ledger,
    catalog,
    gates: {
      tidbTls: Boolean(identity),
      foreignKeysOn:
        foreignKeyVariables.length === 1 &&
        booleanOn(foreignKeyVariables[0].foreign_key_checks) &&
        booleanOn(foreignKeyVariables[0].tidb_enable_foreign_key),
      zeroTargets: targetTablesPresent.length === 0,
      zeroNamedObjects:
        catalog.namedIndexes.length === 0 &&
        catalog.namedConstraints.length === 0,
      zero0137Marker: !ledgerHas0137Marker(ledger, artifacts),
      ledgerBaseline: ledgerIsBaseline(ledger, artifacts),
    },
  };
}

function preflightIsSafe(preflight) {
  return Object.values(preflight.gates).every(Boolean);
}

function tableActualColumns(catalog, tableName) {
  return catalog.columns
    .filter(column => column.table === tableName)
    .map(({ table, ...column }) => column);
}

function tableActualIndexes(catalog, tableName) {
  return catalog.indexes
    .filter(index => index.table === tableName)
    .map(index => ({
      name: index.name,
      unique: index.unique,
      primary: index.name === "PRIMARY",
      columns: index.columns.map(column => column.name),
      prefixes: index.columns.map(column => column.subPart),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function tableExpectedIndexes(table, tableName, includeKnownResidual = false) {
  const expected = table.indexes
    .map(index => ({
      name: index.name,
      unique: index.unique,
      primary: index.primary,
      columns: index.columns,
      prefixes: index.columns.map(() => null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (includeKnownResidual && tableName === KNOWN_RESIDUAL_FK_INDEX.tableName) {
    expected.push({
      name: KNOWN_RESIDUAL_FK_INDEX.name,
      unique: false,
      primary: false,
      columns: KNOWN_RESIDUAL_FK_INDEX.columns,
      prefixes: KNOWN_RESIDUAL_FK_INDEX.columns.map(() => null),
    });
  }
  return expected.sort((a, b) => a.name.localeCompare(b.name));
}

function expectedPhysicalIndexes(contract, statementIndex) {
  const indexes = Object.entries(contract).flatMap(([tableName, table]) =>
    tableExpectedIndexes(table, tableName)
      .filter(index => index.primary || index.unique)
      .map(index => ({ tableName, ...index }))
  );
  const explicitOrder = [
    "idx_rec_ret_imp_escopo_data",
    "idx_rec_ret_imp_lote_portal",
    "idx_rec_ret_linha_importacao",
    "idx_rec_ret_linha_demo_atual",
    "idx_rec_ret_pag_importacao",
    "idx_rec_ret_rev_importacao",
    "idx_rec_ret_rev_linha",
  ];
  const explicitCount = Math.max(0, statementIndex - 8);
  for (const name of explicitOrder.slice(0, explicitCount)) {
    for (const [tableName, table] of Object.entries(contract)) {
      for (const index of tableExpectedIndexes(table, tableName)) {
        if (index.name === name) indexes.push({ tableName, ...index });
      }
    }
  }
  // TiDB v8.5.3 fixture: the first four FKs use existing primary/unique index
  // prefixes. Only statement 9 creates a support index, which remains after
  // statement 16. Positions are one-based SQL statement positions.
  const automaticStates = [
    [
      9,
      KNOWN_RESIDUAL_FK_INDEX.tableName,
      KNOWN_RESIDUAL_FK_INDEX.name,
      KNOWN_RESIDUAL_FK_INDEX.columns,
      Infinity,
    ],
  ];
  const position = statementIndex + 1;
  for (const [createdAt, tableName, name, columns, removedAt] of automaticStates) {
    if (position >= createdAt && position < removedAt) {
      indexes.push({
        tableName,
        name,
        unique: false,
        primary: false,
        columns,
        prefixes: columns.map(() => null),
      });
    }
  }
  return indexes.sort((a, b) =>
    `${a.tableName}:${a.name}`.localeCompare(`${b.tableName}:${b.name}`)
  );
}

function tableActualForeignKeys(catalog, tableName) {
  return catalog.foreignKeys
    .filter(foreignKey => foreignKey.tableFrom === tableName)
    .map(foreignKey => ({
      name: foreignKey.name,
      tableFrom: foreignKey.tableFrom,
      tableTo: foreignKey.tableTo,
      columnsFrom: foreignKey.columnsFrom,
      columnsTo: foreignKey.columnsTo,
      onDelete: foreignKey.onDelete,
      onUpdate: foreignKey.onUpdate,
    }));
}

function validateTargetContract(catalog, contract) {
  const tableNames = catalog.allTables
    .filter(table => TARGET_TABLES.includes(table.name))
    .map(table => table.name)
    .sort();
  if (!same(tableNames, [...TARGET_TABLES].sort())) return false;
  for (const [tableName, expected] of Object.entries(contract)) {
    if (!same(tableActualColumns(catalog, tableName), expected.columns))
      return false;
    if (
      !same(
        tableActualIndexes(catalog, tableName),
        tableExpectedIndexes(expected, tableName, true)
      )
    )
      return false;
    if (!same(tableActualForeignKeys(catalog, tableName), expected.foreignKeys))
      return false;
  }
  return true;
}

function catalogWithout0137(catalog) {
  const names = new Set(TARGET_TABLES);
  return {
    allTables: catalog.allTables.filter(table => !names.has(table.name)),
    columns: catalog.columns.filter(column => !names.has(column.table)),
    indexes: catalog.indexes.filter(index => !names.has(index.table)),
    foreignKeys: catalog.foreignKeys.filter(
      foreignKey => !names.has(foreignKey.tableFrom)
    ),
  };
}

async function validateObjectAfterStatement(
  connection,
  artifacts,
  statementIndex
) {
  const catalog = await readCatalog(connection, artifacts.expectedNames);
  if (statementIndex < 4) {
    const tableName = TARGET_TABLES[statementIndex];
    const expected = artifacts.contract[tableName];
    // At this moment a table must have exact columns, primary key and its business uniques only.
    const actualIndexes = tableActualIndexes(catalog, tableName);
    const expectedBaseIndexes = tableExpectedIndexes(expected).filter(
      index => index.unique || index.primary
    );
    return {
      ok:
        same(tableActualColumns(catalog, tableName), expected.columns) &&
        same(actualIndexes, expectedBaseIndexes) &&
        tableActualForeignKeys(catalog, tableName).length === 0,
      catalog,
    };
  }
  if (statementIndex < 9) {
    const expectedForeignKeys = Object.values(artifacts.contract).flatMap(
      table => table.foreignKeys
    );
    const actualForeignKeys = catalog.foreignKeys.filter(foreignKey =>
      TARGET_TABLES.includes(foreignKey.tableFrom)
    );
    const required = expectedForeignKeys
      .slice(0, statementIndex - 3)
      .sort((a, b) => a.name.localeCompare(b.name));
    const actualIndexes = catalog.indexes.filter(index =>
      TARGET_TABLES.includes(index.table)
    );
    const normalizedActualIndexes = actualIndexes
      .map(index => ({
        tableName: index.table,
        name: index.name,
        unique: index.unique,
        primary: index.name === "PRIMARY",
        columns: index.columns.map(column => column.name),
        prefixes: index.columns.map(column => column.subPart),
      }))
      .sort((a, b) =>
        `${a.tableName}:${a.name}`.localeCompare(`${b.tableName}:${b.name}`)
      );
    const normalizedExpectedIndexes = expectedPhysicalIndexes(
      artifacts.contract,
      statementIndex
    );
    return {
      ok:
        same(actualForeignKeys, required) &&
        same(normalizedActualIndexes, normalizedExpectedIndexes),
      catalog,
    };
  }
  const expectedUntilNow = expectedPhysicalIndexes(
    artifacts.contract,
    statementIndex
  );
  const actual = catalog.indexes
    .filter(index => TARGET_TABLES.includes(index.table))
    .map(index => ({
      tableName: index.table,
      name: index.name,
      unique: index.unique,
      primary: index.name === "PRIMARY",
      columns: index.columns.map(column => column.name),
      prefixes: index.columns.map(column => column.subPart),
    }))
    .sort((a, b) =>
      `${a.tableName}:${a.name}`.localeCompare(`${b.tableName}:${b.name}`)
    );
  return { ok: same(actual, expectedUntilNow), catalog };
}

async function tablesAreEmpty(connection) {
  for (const tableName of TARGET_TABLES) {
    const result = await query(
      connection,
      `/* 0137:empty-table */ SELECT COUNT(*) AS \`row_count\` FROM \`${tableName}\``
    );
    if (result.length !== 1 || Number(result[0].row_count) !== 0) return false;
  }
  return true;
}

async function validationAfterDdl(connection, artifacts, baseline) {
  const [catalog, ledger, empty] = await Promise.all([
    readCatalog(connection, artifacts.expectedNames),
    readLedger(connection),
    tablesAreEmpty(connection),
  ]);
  return {
    physicalOk:
      validateTargetContract(catalog, artifacts.contract) &&
      same(catalogWithout0137(catalog), catalogWithout0137(baseline.catalog)) &&
      empty,
    catalog,
    ledger,
  };
}

async function guardedJournalInsert(connection, artifacts, baseline) {
  let begun = false;
  let commitAttempted = false;
  try {
    await execute(connection, "/* 0137:journal-begin */ BEGIN PESSIMISTIC");
    begun = true;
    await query(
      connection,
      "/* 0137:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE"
    );
    const current = await query(
      connection,
      "/* 0137:ledger-baseline-lock */ SELECT `id`, `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `id` FOR UPDATE"
    );
    if (
      !same(current, baseline.ledger) ||
      !ledgerIsBaseline(current, artifacts)
    ) {
      throw new Error("ledger_changed_before_journal");
    }
    const existing = current.filter(
      entry =>
        String(entry.created_at) === String(MIGRATION_TIMESTAMP) ||
        String(entry.hash) === artifacts.sqlHash
    );
    if (existing.length !== 0) throw new Error("journal_marker_exists");

    const inserted = await execute(
      connection,
      "/* 0137:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [artifacts.sqlHash, MIGRATION_TIMESTAMP]
    );
    if (Number(inserted?.affectedRows) !== 1)
      throw new Error("journal_insert_affected_rows_invalid");
    const reread = await query(
      connection,
      "/* 0137:journal-reread-lock */ SELECT `id`, `hash`, `created_at` FROM `__drizzle_migrations` ORDER BY `id` FOR UPDATE"
    );
    const marker = reread.filter(
      entry =>
        String(entry.created_at) === String(MIGRATION_TIMESTAMP) &&
        String(entry.hash) === artifacts.sqlHash
    );
    if (
      marker.length !== 1 ||
      !same(
        reread.filter(entry => !marker.includes(entry)),
        baseline.ledger
      )
    ) {
      throw new Error("journal_reread_not_exact");
    }
    commitAttempted = true;
    await execute(connection, "/* 0137:journal-commit */ COMMIT");
    return { ok: true };
  } catch {
    if (commitAttempted)
      return { ok: false, reason: "journal_commit_uncertain" };
    if (begun) {
      try {
        await connection.execute("/* 0137:journal-rollback */ ROLLBACK");
      } catch {}
    }
    return { ok: false, reason: "journal_guard_failed" };
  }
}

async function finalValidation(connection, artifacts, baseline) {
  const result = await validationAfterDdl(connection, artifacts, baseline);
  if (!result.physicalOk) return { ok: false, capture: result };
  const entries = result.ledger.filter(
    entry =>
      String(entry.created_at) === String(MIGRATION_TIMESTAMP) &&
      String(entry.hash) === artifacts.sqlHash
  );
  const baselinePreserved = same(
    result.ledger.filter(entry => !entries.includes(entry)),
    baseline.ledger
  );
  return { ok: entries.length === 1 && baselinePreserved, capture: result };
}

/**
 * Run under an injected connection factory. Defaults to dry-run. apply needs
 * external gates verified by a caller, encrypted private capture, and exclusive
 * state path. No environment variable, remote URL, or credential is read here.
 */
export async function runRestricted0137(options = {}) {
  const mode = options.mode ?? "dry-run";
  const root = options.root ?? projectRoot;
  const artifacts = await loadApprovedArtifacts({ root });
  if (!artifacts.ok) return emptyFailure("identity", artifacts.reason);
  if (mode !== "apply" && mode !== "dry-run")
    return emptyFailure("mode", "invalid_mode");

  if (mode === "dry-run" && !options.connectionFactory) {
    return {
      ok: true,
      mode: "dry-run",
      phase: "local-identity-only",
      ddlCount: 0,
    };
  }

  if (
    !options.connectionFactory ||
    typeof options.connectionFactory.connect !== "function"
  ) {
    return emptyFailure("connection", "connection_factory_required");
  }

  if (mode === "apply") {
    if (
      !options.stateFile ||
      !options.privateCaptureFile ||
      !options.privateCaptureKey
    ) {
      return emptyFailure("apply-gates", "private_state_and_capture_required");
    }
    if (await exists(options.stateFile))
      return emptyFailure("apply-gates", "state_file_exists");
    let executorDigest;
    try {
      executorDigest = sha256(
        await readFile(
          artifactFile(root, "scripts/migrations/0137-retornos-restrita.mjs")
        )
      );
    } catch {
      return emptyFailure("apply-gates", "executor_identity_unavailable");
    }
    if (
      !(await gatesAreCurrent(
        options,
        options.now ?? Date.now(),
        executorDigest
      ))
    ) {
      return emptyFailure(
        "apply-gates",
        "external_gates_missing_or_unverified"
      );
    }
  }

  let first;
  let second;
  let capture;
  const usedConnections = new Set();
  let requiredIdentity;
  const connectIndependent = async purpose => {
    const connection = await options.connectionFactory.connect(purpose);
    if (!connection || usedConnections.has(connection))
      throw new Error("connection_not_independent");
    const identity = await readIdentity(connection);
    if (!identity || (requiredIdentity && !same(identity, requiredIdentity))) {
      await closeQuietly(connection);
      throw new Error("connection_identity_mismatch");
    }
    if (!requiredIdentity) requiredIdentity = identity;
    usedConnections.add(connection);
    return connection;
  };
  try {
    first = await connectIndependent("0137-preflight-a");
    second = await connectIndependent("0137-preflight-b");
    const [preflightA, preflightB] = await Promise.all([
      inspectPreflight(first, artifacts),
      inspectPreflight(second, artifacts),
    ]);
    if (
      !preflightIsSafe(preflightA) ||
      !preflightIsSafe(preflightB) ||
      !same(preflightA.ledger, preflightB.ledger) ||
      !same(preflightA.catalog, preflightB.catalog)
    ) {
      return emptyFailure("preflight", "preflight_not_stable_or_not_safe");
    }

    if (mode === "dry-run") {
      return {
        ok: true,
        mode: "dry-run",
        phase: "preflight-read-only",
        ddlCount: 0,
      };
    }

    try {
      capture = await PrivateCapture.create(
        options.privateCaptureFile,
        options.privateCaptureKey
      );
      await capture.append("preflight", {
        first: preflightA,
        second: preflightB,
      });
    } catch (error) {
      return emptyFailure(
        "capture",
        safeErrorCode(error, "private_capture_unavailable")
      );
    }

    try {
      await createExclusiveState(options.stateFile);
    } catch (error) {
      return emptyFailure(
        "state",
        safeErrorCode(error, "state_file_unavailable")
      );
    }

    let ddl;
    let ddlCount = 0;
    try {
      ddl = await connectIndependent("0137-ddl");
      for (const [index, statement] of artifacts.statements.entries()) {
        try {
          await ddl.execute(statement);
        } catch {
          try {
            await capture.append(`ddl-failure-${ddlCount + 1}`, {
              catalog: await readCatalog(ddl, artifacts.expectedNames),
            });
          } catch {}
          return emptyFailure("ddl", "statement_failed_no_retry", ddlCount);
        }
        ddlCount += 1;
        const step = await validateObjectAfterStatement(ddl, artifacts, index);
        await capture.append(`ddl-${ddlCount}`, step.catalog);
        if (!step.ok) {
          return emptyFailure(
            "ddl-validation",
            "statement_object_validation_failed",
            ddlCount
          );
        }
      }
    } catch {
      return emptyFailure(
        "ddl",
        "ddl_connection_or_validation_failed",
        ddlCount
      );
    } finally {
      await closeQuietly(ddl);
    }

    let afterDdl;
    try {
      afterDdl = await connectIndependent("0137-post-ddl-independent");
      const post = await validationAfterDdl(afterDdl, artifacts, preflightA);
      await capture.append("post-ddl", post);
      if (!post.physicalOk || !same(post.ledger, preflightA.ledger)) {
        return emptyFailure(
          "post-ddl",
          "physical_contract_or_ledger_deviation",
          ddlCount
        );
      }
    } catch {
      return emptyFailure(
        "post-ddl",
        "independent_validation_failed",
        ddlCount
      );
    } finally {
      await closeQuietly(afterDdl);
    }

    let journal;
    try {
      journal = await connectIndependent("0137-journal");
      const journalResult = await guardedJournalInsert(
        journal,
        artifacts,
        preflightA
      );
      if (!journalResult.ok)
        return emptyFailure("journal", journalResult.reason, ddlCount);
    } catch {
      return emptyFailure("journal", "journal_connection_failed", ddlCount);
    } finally {
      await closeQuietly(journal);
    }

    let finalConnection;
    try {
      finalConnection = await connectIndependent("0137-final-independent");
      const final = await finalValidation(
        finalConnection,
        artifacts,
        preflightA
      );
      await capture.append("final", final.capture);
      if (!final.ok)
        return emptyFailure(
          "final",
          "final_contract_or_journal_deviation",
          ddlCount
        );
    } catch {
      return emptyFailure(
        "final",
        "final_independent_validation_failed",
        ddlCount
      );
    } finally {
      await closeQuietly(finalConnection);
    }

    return { ok: true, mode: "apply", phase: "complete", ddlCount: 16 };
  } catch {
    return emptyFailure(
      "preflight",
      "preflight_connection_or_metadata_failure"
    );
  } finally {
    await closeQuietly(first);
    await closeQuietly(second);
    await capture?.close();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const requestedApply = args.has("--apply");
  // A direct CLI invocation never discovers a connector or reads secrets. It is
  // therefore always local identity-only dry-run and cannot apply DDL.
  const result = await runRestricted0137({
    mode: requestedApply ? "apply" : "dry-run",
  });
  process.stdout.write(
    `${JSON.stringify({ ok: result.ok, phase: result.phase, reason: result.reason, ddlCount: result.ddlCount ?? 0 })}\n`
  );
  process.exitCode = result.ok && !requestedApply ? 0 : result.ok ? 0 : 2;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stdout.write(
      '{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0}\n'
    );
    process.exitCode = 2;
  });
}
