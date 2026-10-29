#!/usr/bin/env node
/**
 * Executor restrito da migração 0143 (Banco Inter seguro).
 *
 * Não lê DATABASE_URL, .env, certificados, credenciais ou linhas financeiras.
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
export const MIGRATION_TAG = "0143_banco_inter_seguranca";
export const MIGRATION_TIMESTAMP = 1793297372715;
export const EXPECTED_SQL_SHA256 = "0456b57a52a4f2c0d235321bfc5c89cbdb5dc7bd44e9eec8c4b9eeb0f324e2a1";
export const EXPECTED_ARTIFACT_HASHES = {
  "drizzle/0143_banco_inter_seguranca.sql": EXPECTED_SQL_SHA256,
  "drizzle/meta/0143_snapshot.json": "76b0073605b20924e2f446000116f8434ca58bc15a22046269fa470eea068041",
  "drizzle/0142_large_krista_starr.sql": "99d2ef60373ea435b3890ad1afffc81af26a3f9a94ffae58a5eee6cd909d1fa8",
  "drizzle/meta/0142_snapshot.json": "830725572836c9b3bc585c059479c34ec239f9f56810ad8a73251b785f2b7ade",
  "drizzle/meta/_journal.json": "e64721c33934cd5df0a15dafcf37f756728b1fb419cd7bd1b064c212e307f47c",
};
const SQL_ARTIFACT = "drizzle/0143_banco_inter_seguranca.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0143_snapshot.json";
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
const TARGET_TABLES = ["fin_bancos", "fin_recebiveis"];
const EXPECTED_ADDITIONS = {
  fin_bancos: {
    estabelecimentoId: { type: "int", nullable: true, defaultValue: null },
    interClientId: { type: "varchar(100)", nullable: true, defaultValue: null },
    interClientSecret: { type: "text", nullable: true, defaultValue: null },
    interCertPem: { type: "text", nullable: true, defaultValue: null },
    interKeyPem: { type: "text", nullable: true, defaultValue: null },
    interContaCorrente: { type: "text", nullable: true, defaultValue: null },
    interBaseUrl: { type: "varchar(255)", nullable: true, defaultValue: null },
  },
  fin_recebiveis: {
    boletoSolicitacaoId: { type: "varchar(100)", nullable: true, defaultValue: null },
    boletoLinhaDigitavel: { type: "varchar(100)", nullable: true, defaultValue: null },
    boletoPixCopiaCola: { type: "text", nullable: true, defaultValue: null },
    notaFiscalKey: { type: "varchar(255)", nullable: true, defaultValue: null },
    emailEnviado: { type: "enum('sim','nao')", nullable: false, defaultValue: "nao" },
  },
};
const EXPECTED_INDEX = { table: "fin_bancos", name: "idx_fin_bancos_estabelecimento", columns: ["estabelecimentoId"] };
const EXPECTED_STATEMENT_HASHES = [
  "126164b4d8f2c2f7802794ebde090fe343a555f01e02632f07ad7372f76297f0",
  "9103c9affa2aa874b5faebf66440218274bd8b176c954c8eefe6fa45986938a1",
  "4dc9f11b6168374a76189fd5e0c7b6ddd0d7a5d04b94ab9088e28245a1af37ca",
  "490c4de479bad3566e99176b8cd5a05906106cd64944cd17a0ced7c4dd9db0c3",
  "6defeaecd4432b88331028037a55a61cb10a157422b728cd67fa68d958a9e20c",
  "278472c611c3ca32917413ac1c034c3bd56f48890847e66df43fe3596bfb2747",
  "9744325e502df854317f024a67a57d23aedf5713d76c118210133c99cb4f1b52",
  "90cec33ca74460aefdbbcff47014ca11fbb06514fc48fb01b2403801ef3ae51f",
  "79ca08234cde4be43aec5d23d218a6dd1ac6e3254da88443cba41309b86463bd",
  "24dbc388d76de6b2f5fe5cddc7088576dba89c5d4e904f2ae4e785727f81c4b1",
  "4145e5178ca7022fdf461aa4db469a06e454102bd8807db791bd4e39d6cfe2d3",
  "5cbccd731564e8d0652a5b41997ee8d21fb435ef420776cd800ce904aca00240",
  "cc73413afbe797a162108b7714101171bdce6729b5da200cb6e95d1c7b180bc0",
];

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function normalized(value) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function rows(result) { return Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : []; }
function safeReport(ok, phase, reason, ddlCount = 0) { return { ok, phase, reason, ddlCount, tables: 2, addedColumns: 12, addedIndexes: 1 }; }
function pathAt(root, relative) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error("unsafe_artifact_path");
  return resolved;
}
function parseStatements(sql) { return sql.split(/\s*-->\s*statement-breakpoint\s*/g).map(item => item.trim()).filter(Boolean); }
function expectedMarker() { return { when: MIGRATION_TIMESTAMP, hash: EXPECTED_SQL_SHA256 }; }
function markerCount(ledger, marker) { return ledger.filter(item => String(item.created_at) === String(marker.when) || String(item.hash) === marker.hash).length; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }

export async function loadRestricted0143Artifacts({ root = projectRoot } = {}) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const gitRevision = String(stdout).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(gitRevision)) return { ok: false, reason: "git_revision_invalid" };
    await execFileAsync("git", ["diff", "--quiet", "HEAD", "--", ...VERIFIED_ARTIFACTS], { cwd: root });
    const files = Object.fromEntries(await Promise.all(VERIFIED_ARTIFACTS.map(async relative => {
      const [local, fromGit] = await Promise.all([
        readFile(pathAt(root, relative)),
        execFileAsync("git", ["show", `${gitRevision}:${relative}`], { cwd: root, encoding: "buffer" }).then(result => Buffer.from(result.stdout)),
      ]);
      if (!local.equals(fromGit) || sha256(local) !== EXPECTED_ARTIFACT_HASHES[relative]) throw new Error("artifact_identity_mismatch");
      return [relative, local];
    })));
    const statements = parseStatements(files[SQL_ARTIFACT].toString("utf8"));
    if (statements.length !== EXPECTED_STATEMENT_HASHES.length || statements.some((item, index) => sha256(item) !== EXPECTED_STATEMENT_HASHES[index])) {
      return { ok: false, reason: "approved_sql_contract_invalid" };
    }
    const snapshot = JSON.parse(files[SNAPSHOT_ARTIFACT].toString("utf8"));
    const journal = JSON.parse(files[JOURNAL_ARTIFACT].toString("utf8"));
    const journalEntry = journal.entries?.find(entry => entry.idx === 143 && entry.tag === MIGRATION_TAG && entry.when === MIGRATION_TIMESTAMP && entry.version === "5" && entry.breakpoints === true);
    if (!journalEntry || (journal.entries ?? []).filter(entry => entry.tag === MIGRATION_TAG).length !== 1) return { ok: false, reason: "journal_identity_invalid" };
    if (!snapshot.tables?.fin_bancos || !snapshot.tables?.fin_recebiveis || !snapshot.prevId) return { ok: false, reason: "snapshot_contract_invalid" };
    return { ok: true, statements, gitRevision, snapshot };
  } catch {
    return { ok: false, reason: "artifact_unavailable_or_dirty" };
  }
}

function normalizeColumns(raw) {
  return raw.map(row => ({
    table: String(row.TABLE_NAME ?? row.table_name ?? ""),
    position: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
    name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
    type: normalized(row.COLUMN_TYPE ?? row.column_type),
    nullable: normalized(row.IS_NULLABLE ?? row.is_nullable) === "yes",
    defaultValue: normalizeDefault(row.COLUMN_DEFAULT ?? row.column_default),
  })).sort((a, b) => a.table.localeCompare(b.table) || a.position - b.position);
}
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const quoted = text.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : text;
}
function normalizeIndexes(raw) {
  const byKey = new Map();
  for (const row of raw) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? "");
    const name = String(row.INDEX_NAME ?? row.index_name ?? "");
    const key = `${table}\0${name}`;
    if (!table || !name) continue;
    const record = byKey.get(key) ?? { table, name, columns: [] };
    record.columns.push({ position: Number(row.SEQ_IN_INDEX ?? row.seq_in_index ?? 0), name: String(row.COLUMN_NAME ?? row.column_name ?? "") });
    byKey.set(key, record);
  }
  return [...byKey.values()].map(item => ({ ...item, columns: item.columns.sort((a, b) => a.position - b.position) })).sort((a, b) => `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`));
}
async function query(connection, statement, params = []) { return rows(await connection.query(statement, params)); }
async function closeQuietly(connection) { try { await connection?.close?.(); } catch {} }

export async function read0143Catalog(connection) {
  const [tables, columns, indexes] = await Promise.all([
    query(connection, "/* 0143 catalog tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`", TARGET_TABLES),
    query(connection, "/* 0143 catalog columns */ SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`", TARGET_TABLES),
    query(connection, "/* 0143 catalog indexes */ SELECT `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`, `COLUMN_NAME` FROM `information_schema`.`statistics` WHERE `table_schema` = DATABASE() AND `table_name` IN (?, ?) ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`", TARGET_TABLES),
  ]);
  return {
    tables: tables.map(item => ({ table: String(item.TABLE_NAME ?? item.table_name ?? ""), type: normalized(item.TABLE_TYPE ?? item.table_type) })).sort((a, b) => a.table.localeCompare(b.table)),
    columns: normalizeColumns(columns),
    indexes: normalizeIndexes(indexes),
  };
}
async function readLedgerLayout(connection) {
  return query(connection, "/* 0143 ledger layout */ SELECT `COLUMN_NAME`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`");
}
async function readLedger(connection, locked = false) {
  return query(connection, `/* 0143 ledger read */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`);
}
function ledgerLayoutValid(layout) {
  const byName = new Map(layout.map(row => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row]));
  return byName.size === 3 && byName.has("id") && byName.has("hash") && byName.has("created_at");
}
function baselineCatalogValid(catalog) {
  const expectedAbsent = Object.entries(EXPECTED_ADDITIONS).flatMap(([table, columns]) => Object.keys(columns).map(name => `${table}\0${name}`));
  const observed = new Set(catalog.columns.map(item => `${item.table}\0${item.name}`));
  const tablesOk = catalog.tables.length === 2 && catalog.tables.every(item => TARGET_TABLES.includes(item.table) && item.type === "base table");
  return tablesOk && expectedAbsent.every(key => !observed.has(key)) && !catalog.indexes.some(item => item.table === EXPECTED_INDEX.table && item.name === EXPECTED_INDEX.name);
}
function finalCatalogValid(before, after) {
  const expectedKeys = new Set(Object.entries(EXPECTED_ADDITIONS).flatMap(([table, columns]) => Object.keys(columns).map(name => `${table}\0${name}`)));
  const beforeKeys = new Set(before.columns.map(item => `${item.table}\0${item.name}`));
  const afterByKey = new Map(after.columns.map(item => [`${item.table}\0${item.name}`, item]));
  if (!before.columns.every(item => same(item, afterByKey.get(`${item.table}\0${item.name}`)))) return false;
  for (const [table, columns] of Object.entries(EXPECTED_ADDITIONS)) {
    for (const [name, expected] of Object.entries(columns)) {
      const item = afterByKey.get(`${table}\0${name}`);
      if (!item || item.type !== expected.type || item.nullable !== expected.nullable || item.defaultValue !== expected.defaultValue) return false;
    }
  }
  const afterKeys = new Set(after.columns.map(item => `${item.table}\0${item.name}`));
  if (![...afterKeys].every(key => beforeKeys.has(key) || expectedKeys.has(key))) return false;
  const targetIndex = after.indexes.find(item => item.table === EXPECTED_INDEX.table && item.name === EXPECTED_INDEX.name);
  return Boolean(targetIndex && same(targetIndex.columns.map(item => item.name), EXPECTED_INDEX.columns));
}
function intermediateCatalogValid(before, after, statementCount) {
  if (statementCount === EXPECTED_STATEMENT_HASHES.length) return finalCatalogValid(before, after);
  const expectedAdded = Object.entries(EXPECTED_ADDITIONS).flatMap(([table, columns]) => Object.keys(columns).map(name => `${table}\0${name}`)).slice(0, statementCount);
  const beforeKeys = new Set(before.columns.map(item => `${item.table}\0${item.name}`));
  const afterKeys = new Set(after.columns.map(item => `${item.table}\0${item.name}`));
  return before.columns.every(item => same(item, after.columns.find(candidate => candidate.table === item.table && candidate.name === item.name)))
    && expectedAdded.every(key => afterKeys.has(key))
    && [...afterKeys].every(key => beforeKeys.has(key) || expectedAdded.includes(key));
}
function gatesValid(gates, artifacts) {
  if (!gates || typeof gates !== "object" || !REQUIRED_GATES.every(name => typeof gates[name] === "string" && gates[name].trim().length >= 3)) return false;
  return gates.artifactsRevision === MIGRATION_TAG && gates.gitRevision === artifacts.gitRevision;
}
async function identityOf(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    if (identity?.tlsVerified !== true || normalized(identity?.serverProduct) !== "tidb" || !String(identity?.databaseName ?? "").trim() || !/^[0-9a-f]{64}$/i.test(String(identity?.certificateFingerprint ?? ""))) return null;
    return { serverProduct: "tidb", databaseName: String(identity.databaseName), serverVersion: String(identity.serverVersion ?? ""), certificateFingerprint: String(identity.certificateFingerprint).toLowerCase() };
  } catch { return null; }
}

/** Preflight read-only. The factory must create a new independently TLS-verified connection each call. */
export async function preflightRestricted0143({ createConnection, canonicalTarget } = {}) {
  if (typeof createConnection !== "function" || typeof canonicalTarget !== "string" || canonicalTarget.length < 3) return safeReport(false, "preflight", "connection_factory_or_target_missing");
  const artifacts = await loadRestricted0143Artifacts();
  if (!artifacts.ok) return safeReport(false, "preflight", artifacts.reason);
  let first; let second;
  try {
    [first, second] = await Promise.all([createConnection(), createConnection()]);
    const [identityA, identityB, catalogA, catalogB, layoutA, layoutB, ledgerA, ledgerB] = await Promise.all([
      identityOf(first), identityOf(second), read0143Catalog(first), read0143Catalog(second), readLedgerLayout(first), readLedgerLayout(second), readLedger(first), readLedger(second),
    ]);
    if (!identityA || !identityB || !same(identityA, identityB)) return safeReport(false, "preflight", "tls_identity_invalid");
    if (!same(catalogA, catalogB) || !same(layoutA, layoutB) || !same(ledgerA, ledgerB)) return safeReport(false, "preflight", "independent_reads_diverged");
    if (!ledgerLayoutValid(layoutA) || markerCount(ledgerA, { when: 1793227973987, hash: EXPECTED_ARTIFACT_HASHES["drizzle/0142_large_krista_starr.sql"] }) !== 1 || markerCount(ledgerA, expectedMarker()) !== 0) return safeReport(false, "preflight", "ledger_baseline_invalid");
    if (!baselineCatalogValid(catalogA)) return safeReport(false, "preflight", "physical_baseline_invalid");
    return { ...safeReport(true, "preflight", "ready"), artifacts, baselineCatalog: clone(catalogA), baselineLedger: clone(ledgerA), identity: identityA, canonicalTarget };
  } catch {
    return safeReport(false, "preflight", "metadata_read_failed");
  } finally {
    await Promise.all([closeQuietly(first), closeQuietly(second)]);
  }
}

/**
 * Applies exactly the 13 approved DDL statements once each. Caller must execute a successful preflight immediately before this call.
 * No automatic retries, repair, compensation or general Drizzle execution are permitted.
 */
export async function applyRestricted0143({ createConnection, canonicalTarget, gates, preflight } = {}) {
  if (!preflight?.ok || preflight.phase !== "preflight" || preflight.canonicalTarget !== canonicalTarget) return safeReport(false, "apply", "fresh_preflight_required");
  const artifacts = await loadRestricted0143Artifacts();
  if (!artifacts.ok || !gatesValid(gates, artifacts)) return safeReport(false, "apply", "artifacts_or_gates_invalid");
  let connection;
  let ddlCount = 0;
  try {
    connection = await createConnection();
    const identity = await identityOf(connection);
    if (!identity || !same(identity, preflight.identity)) return safeReport(false, "apply", "tls_identity_changed");
    const [catalog, ledger] = await Promise.all([read0143Catalog(connection), readLedger(connection)]);
    if (!same(catalog, preflight.baselineCatalog) || !same(ledger, preflight.baselineLedger) || !baselineCatalogValid(catalog)) return safeReport(false, "apply", "baseline_changed", ddlCount);
    for (const statement of artifacts.statements) {
      await connection.execute(statement);
      ddlCount += 1;
      const observed = await read0143Catalog(connection);
      if (!intermediateCatalogValid(preflight.baselineCatalog, observed, ddlCount)) return safeReport(false, "apply", "physical_delta_invalid", ddlCount);
    }
    const verification = await createConnection();
    try {
      const [finalCatalog, finalLedger, finalIdentity] = await Promise.all([read0143Catalog(verification), readLedger(verification), identityOf(verification)]);
      if (!finalIdentity || !same(finalIdentity, identity) || !finalCatalogValid(preflight.baselineCatalog, finalCatalog) || !same(finalLedger, preflight.baselineLedger)) return safeReport(false, "apply", "post_ddl_validation_failed", ddlCount);
    } finally { await closeQuietly(verification); }
    await connection.beginTransaction();
    const lockedLedger = await readLedger(connection, true);
    if (!same(lockedLedger, preflight.baselineLedger) || markerCount(lockedLedger, expectedMarker()) !== 0) { await connection.rollback(); return safeReport(false, "apply", "ledger_changed", ddlCount); }
    await connection.execute("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [EXPECTED_SQL_SHA256, MIGRATION_TIMESTAMP]);
    const afterInsert = await readLedger(connection, true);
    if (markerCount(afterInsert, expectedMarker()) !== 1) { await connection.rollback(); return safeReport(false, "apply", "journal_insert_invalid", ddlCount); }
    await connection.commit();
    const finalConnection = await createConnection();
    try {
      const [finalCatalog, finalLedger] = await Promise.all([read0143Catalog(finalConnection), readLedger(finalConnection)]);
      if (!finalCatalogValid(preflight.baselineCatalog, finalCatalog) || markerCount(finalLedger, expectedMarker()) !== 1) return safeReport(false, "post_validation", "final_validation_failed", ddlCount);
    } finally { await closeQuietly(finalConnection); }
    return safeReport(true, "complete", "applied", ddlCount);
  } catch {
    try { await connection?.rollback?.(); } catch {}
    return safeReport(false, "apply", "ddl_or_journal_failed", ddlCount);
  } finally { await closeQuietly(connection); }
}
