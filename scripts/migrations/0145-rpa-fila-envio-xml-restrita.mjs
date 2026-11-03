#!/usr/bin/env node
/**
 * Executor restrito da migração 0145 (Cofre Multi-Hospital e Fila de Envio XML RPA).
 *
 * Não lê DATABASE_URL, .env, certificados, credenciais ou registros de negócio.
 * Não chama db:migrate/db:push e não é um CLI aplicável por conta própria.
 * O chamador precisa injetar conexões TLS independentes e gates aprovados.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDirectory, "../..");
export const MIGRATION_TAG = "0145_rpa_fila_envio_xml_portal";
export const MIGRATION_TIMESTAMP = 1793720945369;
export const EXPECTED_SQL_SHA256 =
  "cde762c7cfdb9626ec948ba22ffd069790ff8e974b3fcc469d428a9022b215c1";
export const EXPECTED_ARTIFACT_HASHES = {
  "drizzle/0145_rpa_fila_envio_xml_portal.sql": EXPECTED_SQL_SHA256,
  "drizzle/meta/0145_snapshot.json":
    "f1e28098da86bf5cf152122330f0eb7038bafa43ab0504e28f71b653350fc7cf",
  "drizzle/0144_fabrica_faturamento_safatle.sql":
    "8539b8ac532a578d39345403c5b2074f922957438be06ca53854162a759ba0b8",
  "drizzle/meta/0144_snapshot.json":
    "0547cc08ff6a496ab9002e7a00d1567d0e8c0a15849ddc91dd1e9205c2e6b0ef",
  "drizzle/meta/_journal.json":
    "4fcd202fc4609644ed3fc4be004d82da6162ab3e1e78fba2b368f09f1731b2ae",
};

const SQL_ARTIFACT = "drizzle/0145_rpa_fila_envio_xml_portal.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0145_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const VERIFIED_ARTIFACTS = Object.keys(EXPECTED_ARTIFACT_HASHES);
const REQUIRED_GATES = [
  "authorization",
  "review",
  "exactSql",
  "executorDigest",
  "artifactsRevision",
  "window",
  "backupExceptionOrProof",
  "canonicalTarget",
  "gitRevision",
];
const TARGET_TABLES = ["credenciais_portais", "fila_envio_xml_portal"];
const EXPECTED_ADDED_COLUMNS_CREDENCIAIS = {
  codigoPrestadorOperadora: { type: "varchar(80)", nullable: true, defaultValue: null },
  registroAns: { type: "varchar(20)", nullable: true, defaultValue: null },
  parametrosExtras: { type: "json", nullable: true, defaultValue: null },
  statusCredencial: { type: "varchar(40)", nullable: true, defaultValue: "ATIVA" },
};
const EXPECTED_STATEMENT_HASHES = [
  "5f0c83a2a1140b198a90a4005fae364ebfa3fac82099a7c00af3f5be6d5a8a0e",
  "da7adc514f366288f69637db25ead344af1f31a78e11a93f939d5b5d5b3a419a",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function normalized(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
function rows(result) {
  return Array.isArray(result?.rows)
    ? result.rows
    : Array.isArray(result)
      ? result
      : [];
}
function safeReport(ok, phase, reason, ddlCount = 0) {
  return {
    ok,
    phase,
    reason,
    ddlCount,
    tables: 2,
    addedColumns: 4,
    addedTables: 1,
    addedIndexes: 3,
  };
}
function pathAt(root, relative) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("unsafe_artifact_path");
  }
  return resolved;
}
function parseStatements(sql) {
  return sql
    .split(/;/g)
    .map((item) => item.replace(/^\s*--[^\n]*\n/gm, "").trim())
    .filter(Boolean);
}
function expectedMarker() {
  return { when: MIGRATION_TIMESTAMP, hash: EXPECTED_SQL_SHA256 };
}
function markerCount(ledger, marker) {
  return ledger.filter(
    (item) =>
      String(item.created_at) === String(marker.when) ||
      String(item.hash) === marker.hash
  ).length;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
}
function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export async function loadRestricted0145Artifacts({ root = projectRoot } = {}) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    const gitRevision = String(stdout).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(gitRevision)) {
      return { ok: false, reason: "git_revision_invalid" };
    }
    await execFileAsync(
      "git",
      ["diff", "--quiet", "HEAD", "--", ...VERIFIED_ARTIFACTS],
      { cwd: root }
    );
    const files = Object.fromEntries(
      await Promise.all(
        VERIFIED_ARTIFACTS.map(async (relative) => {
          const [local, fromGit] = await Promise.all([
            readFile(pathAt(root, relative)),
            execFileAsync("git", ["show", `${gitRevision}:${relative}`], {
              cwd: root,
              encoding: "buffer",
              maxBuffer: 16 * 1024 * 1024,
            }).then((result) => Buffer.from(result.stdout)),
          ]);
          if (
            !local.equals(fromGit) ||
            sha256(local) !== EXPECTED_ARTIFACT_HASHES[relative]
          ) {
            throw new Error("artifact_identity_mismatch");
          }
          return [relative, local];
        })
      )
    );
    const statements = parseStatements(files[SQL_ARTIFACT].toString("utf8"));
    if (
      statements.length !== EXPECTED_STATEMENT_HASHES.length ||
      statements.some(
        (item, index) => sha256(item) !== EXPECTED_STATEMENT_HASHES[index]
      )
    ) {
      return { ok: false, reason: "approved_sql_contract_invalid" };
    }
    const snapshot = JSON.parse(files[SNAPSHOT_ARTIFACT].toString("utf8"));
    const journal = JSON.parse(files[JOURNAL_ARTIFACT].toString("utf8"));
    const journalEntry = journal.entries?.find(
      (entry) =>
        entry.idx === 145 &&
        entry.tag === MIGRATION_TAG &&
        entry.when === MIGRATION_TIMESTAMP &&
        entry.version === "5" &&
        entry.breakpoints === true
    );
    if (
      !journalEntry ||
      (journal.entries ?? []).filter((entry) => entry.tag === MIGRATION_TAG)
        .length !== 1
    ) {
      return { ok: false, reason: "journal_identity_invalid" };
    }
    if (
      !snapshot.tables?.credenciais_portais ||
      !snapshot.tables?.fila_envio_xml_portal ||
      !snapshot.prevId
    ) {
      return { ok: false, reason: "snapshot_contract_invalid" };
    }
    return { ok: true, statements, gitRevision, snapshot };
  } catch {
    return { ok: false, reason: "artifact_unavailable_or_dirty" };
  }
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const quoted = text.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : text;
}
function normalizeColumns(raw) {
  return raw
    .map((row) => ({
      table: String(row.TABLE_NAME ?? row.table_name ?? ""),
      position: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
      type: normalized(row.COLUMN_TYPE ?? row.column_type),
      nullable: normalized(row.IS_NULLABLE ?? row.is_nullable) === "yes",
      defaultValue: normalizeDefault(row.COLUMN_DEFAULT ?? row.column_default),
    }))
    .sort((a, b) => a.table.localeCompare(b.table) || a.position - b.position);
}
function normalizeIndexes(raw) {
  const byKey = new Map();
  for (const row of raw) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? "");
    const name = String(row.INDEX_NAME ?? row.index_name ?? "");
    const key = `${table}\0${name}`;
    if (!table || !name) continue;
    const record = byKey.get(key) ?? { table, name, columns: [] };
    record.columns.push({
      position: Number(row.SEQ_IN_INDEX ?? row.seq_in_index ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
    });
    byKey.set(key, record);
  }
  return [...byKey.values()]
    .map((item) => ({
      ...item,
      columns: item.columns.sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) =>
      `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`)
    );
}
async function query(connection, statement, params = []) {
  return rows(await connection.query(statement, params));
}
async function closeQuietly(connection) {
  try {
    await connection?.close?.();
  } catch {}
}

export async function read0145Catalog(connection) {
  const [tables, columns, indexes] = await Promise.all([
    query(
      connection,
      "/* 0145 catalog tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`",
      TARGET_TABLES
    ),
    query(
      connection,
      "/* 0145 catalog columns */ SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`",
      TARGET_TABLES
    ),
    query(
      connection,
      "/* 0145 catalog indexes */ SELECT `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`, `COLUMN_NAME` FROM `information_schema`.`statistics` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`",
      TARGET_TABLES
    ),
  ]);
  return {
    tables: tables
      .map((item) => ({
        table: String(item.TABLE_NAME ?? item.table_name ?? ""),
        type: normalized(item.TABLE_TYPE ?? item.table_type),
      }))
      .sort((a, b) => a.table.localeCompare(b.table)),
    columns: normalizeColumns(columns),
    indexes: normalizeIndexes(indexes),
  };
}
async function readLedgerLayout(connection) {
  return query(
    connection,
    "/* 0145 ledger layout */ SELECT `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`"
  );
}
async function readLedger(connection, locked = false) {
  return query(
    connection,
    `/* 0145 ledger read */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`
  );
}
function ledgerLayoutValid(layout) {
  const byName = new Map(
    layout.map((row) => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row])
  );
  return (
    byName.size === 3 &&
    byName.has("id") &&
    byName.has("hash") &&
    byName.has("created_at")
  );
}
function baselineCatalogValid(catalog) {
  const credTableExists =
    catalog.tables.length === 1 &&
    catalog.tables[0].table === "credenciais_portais" &&
    catalog.tables[0].type === "base table";
  if (!credTableExists) return false;
  const observed = new Set(
    catalog.columns.map((item) => `${item.table}\0${item.name}`)
  );
  return Object.keys(EXPECTED_ADDED_COLUMNS_CREDENCIAIS).every(
    (col) => !observed.has(`credenciais_portais\0${col}`)
  );
}
function finalCatalogValid(before, after) {
  const tablesOk =
    after.tables.length === 2 &&
    after.tables.every(
      (item) => TARGET_TABLES.includes(item.table) && item.type === "base table"
    );
  if (!tablesOk) return false;
  const afterByKey = new Map(
    after.columns.map((item) => [`${item.table}\0${item.name}`, item])
  );
  if (
    !before.columns.every((item) =>
      same(item, afterByKey.get(`${item.table}\0${item.name}`))
    )
  ) {
    return false;
  }
  for (const [name, expected] of Object.entries(
    EXPECTED_ADDED_COLUMNS_CREDENCIAIS
  )) {
    const item = afterByKey.get(`credenciais_portais\0${name}`);
    if (
      !item ||
      item.type !== expected.type ||
      item.nullable !== expected.nullable ||
      item.defaultValue !== expected.defaultValue
    ) {
      return false;
    }
  }
  const filaCols = after.columns.filter(
    (item) => item.table === "fila_envio_xml_portal"
  );
  if (filaCols.length !== 30) return false;
  const screenshotCol = afterByKey.get(
    "fila_envio_xml_portal\0screenshot_base64"
  );
  if (!screenshotCol || screenshotCol.type !== "longtext") return false;
  return true;
}
function gatesValid(gates, artifacts) {
  if (
    !gates ||
    typeof gates !== "object" ||
    !REQUIRED_GATES.every(
      (name) => typeof gates[name] === "string" && gates[name].trim().length >= 3
    )
  ) {
    return false;
  }
  return (
    gates.artifactsRevision === MIGRATION_TAG &&
    gates.gitRevision === artifacts.gitRevision
  );
}
async function identityOf(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    if (
      identity?.tlsVerified !== true ||
      normalized(identity?.serverProduct) !== "tidb" ||
      !String(identity?.databaseName ?? "").trim() ||
      !/^[0-9a-f]{64}$/i.test(String(identity?.certificateFingerprint ?? ""))
    ) {
      return null;
    }
    return {
      serverProduct: "tidb",
      databaseName: String(identity.databaseName),
      serverVersion: String(identity.serverVersion ?? ""),
      certificateFingerprint: String(
        identity.certificateFingerprint
      ).toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function preflightRestricted0145({
  createConnection,
  canonicalTarget,
} = {}) {
  if (
    typeof createConnection !== "function" ||
    typeof canonicalTarget !== "string" ||
    canonicalTarget.length < 3
  ) {
    return safeReport(
      false,
      "preflight",
      "connection_factory_or_target_missing"
    );
  }
  const artifacts = await loadRestricted0145Artifacts();
  if (!artifacts.ok) return safeReport(false, "preflight", artifacts.reason);
  let first;
  let second;
  try {
    [first, second] = await Promise.all([
      createConnection(),
      createConnection(),
    ]);
    const [
      identityA,
      identityB,
      catalogA,
      catalogB,
      layoutA,
      layoutB,
      ledgerA,
      ledgerB,
    ] = await Promise.all([
      identityOf(first),
      identityOf(second),
      read0145Catalog(first),
      read0145Catalog(second),
      readLedgerLayout(first),
      readLedgerLayout(second),
      readLedger(first),
      readLedger(second),
    ]);
    if (!identityA || !identityB || !same(identityA, identityB)) {
      return safeReport(false, "preflight", "tls_identity_invalid");
    }
    if (
      !same(catalogA, catalogB) ||
      !same(layoutA, layoutB) ||
      !same(ledgerA, ledgerB)
    ) {
      return safeReport(false, "preflight", "independent_reads_diverged");
    }
    if (
      !ledgerLayoutValid(layoutA) ||
      markerCount(ledgerA, expectedMarker()) !== 0
    ) {
      return safeReport(false, "preflight", "ledger_baseline_invalid");
    }
    if (!baselineCatalogValid(catalogA)) {
      return safeReport(false, "preflight", "physical_baseline_invalid");
    }
    return {
      ...safeReport(true, "preflight", "ready"),
      artifacts,
      baselineCatalog: clone(catalogA),
      baselineLedger: clone(ledgerA),
      identity: identityA,
      canonicalTarget,
    };
  } catch {
    return safeReport(false, "preflight", "metadata_read_failed");
  } finally {
    await Promise.all([closeQuietly(first), closeQuietly(second)]);
  }
}

export async function applyRestricted0145({
  createConnection,
  canonicalTarget,
  gates,
  preflight,
} = {}) {
  if (
    !preflight?.ok ||
    preflight.phase !== "preflight" ||
    preflight.canonicalTarget !== canonicalTarget
  ) {
    return safeReport(false, "apply", "fresh_preflight_required");
  }
  const artifacts = await loadRestricted0145Artifacts();
  if (!artifacts.ok || !gatesValid(gates, artifacts)) {
    return safeReport(false, "apply", "artifacts_or_gates_invalid");
  }
  let connection;
  let ddlCount = 0;
  try {
    connection = await createConnection();
    const identity = await identityOf(connection);
    if (!identity || !same(identity, preflight.identity)) {
      return safeReport(false, "apply", "tls_identity_changed");
    }
    const [catalog, ledger] = await Promise.all([
      read0145Catalog(connection),
      readLedger(connection),
    ]);
    if (
      !same(catalog, preflight.baselineCatalog) ||
      !same(ledger, preflight.baselineLedger) ||
      !baselineCatalogValid(catalog)
    ) {
      return safeReport(false, "apply", "baseline_changed", ddlCount);
    }
    for (const statement of artifacts.statements) {
      await connection.execute(statement);
      ddlCount += 1;
    }
    const verification = await createConnection();
    try {
      const [finalCatalog, finalLedger, finalIdentity] = await Promise.all([
        read0145Catalog(verification),
        readLedger(verification),
        identityOf(verification),
      ]);
      if (
        !finalIdentity ||
        !same(finalIdentity, identity) ||
        !finalCatalogValid(preflight.baselineCatalog, finalCatalog) ||
        !same(finalLedger, preflight.baselineLedger)
      ) {
        return safeReport(
          false,
          "apply",
          "post_ddl_validation_failed",
          ddlCount
        );
      }
    } finally {
      await closeQuietly(verification);
    }
    await connection.beginTransaction();
    const lockedLedger = await readLedger(connection, true);
    if (
      !same(lockedLedger, preflight.baselineLedger) ||
      markerCount(lockedLedger, expectedMarker()) !== 0
    ) {
      await connection.rollback();
      return safeReport(false, "apply", "ledger_changed", ddlCount);
    }
    await connection.execute(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [EXPECTED_SQL_SHA256, MIGRATION_TIMESTAMP]
    );
    const afterInsert = await readLedger(connection, true);
    if (markerCount(afterInsert, expectedMarker()) !== 1) {
      await connection.rollback();
      return safeReport(false, "apply", "journal_insert_invalid", ddlCount);
    }
    await connection.commit();
    return safeReport(true, "complete", "applied", ddlCount);
  } catch {
    try {
      await connection?.rollback?.();
    } catch {}
    return safeReport(false, "apply", "ddl_or_journal_failed", ddlCount);
  } finally {
    await closeQuietly(connection);
  }
}
