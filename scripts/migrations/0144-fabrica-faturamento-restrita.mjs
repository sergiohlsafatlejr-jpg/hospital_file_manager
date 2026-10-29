#!/usr/bin/env node
/**
 * Executor restrito da migração 0144 da fábrica de faturamento.
 *
 * Não lê DATABASE_URL, .env, credenciais ou dados de negócio. Não descobre
 * destinos e não invoca db:migrate/db:push. O único caminho de escrita é a
 * execução, uma vez e em ordem, das quatro DDL atestadas e o marker Drizzle.
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

export const MIGRATION_TAG = "0144_fabrica_faturamento_safatle";
export const MIGRATION_TIMESTAMP = 1793303472606;
export const ARTIFACTS_REVISION = MIGRATION_TAG;
export const EXPECTED_SQL_SHA256 = "8539b8ac532a578d39345403c5b2074f922957438be06ca53854162a759ba0b8";
export const BASELINE_0143_SQL_SHA256 = "0456b57a52a4f2c0d235321bfc5c89cbdb5dc7bd44e9eec8c4b9eeb0f324e2a1";
export const TARGET_TABLES = ["fabrica_contas", "fabrica_historico_fluxo", "fabrica_erros_conta", "fabrica_metas"];
export const MAX_PREFLIGHT_AGE_MS = 5 * 60 * 1000;
export const MAX_GATE_WINDOW_MS = 5 * 60 * 1000;

const SQL_ARTIFACT = "drizzle/0144_fabrica_faturamento_safatle.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0144_snapshot.json";
const BASELINE_SNAPSHOT_ARTIFACT = "drizzle/meta/0143_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const EXECUTOR_ARTIFACT = "scripts/migrations/0144-fabrica-faturamento-restrita.mjs";
const FIXED_ARTIFACT_HASHES = Object.freeze({
  [SQL_ARTIFACT]: EXPECTED_SQL_SHA256,
  [SNAPSHOT_ARTIFACT]: "0547cc08ff6a496ab9002e7a00d1567d0e8c0a15849ddc91dd1e9205c2e6b0ef",
  [BASELINE_SNAPSHOT_ARTIFACT]: "76b0073605b20924e2f446000116f8434ca58bc15a22046269fa470eea068041",
  [JOURNAL_ARTIFACT]: "a0358cb2427c8d64a861ce410135398badb6bc12db51b61c7b01ef2216424dd0",
});
const VERIFIED_ARTIFACTS = Object.freeze(Object.keys(FIXED_ARTIFACT_HASHES));
const APPROVED_STATEMENT_HASHES = Object.freeze([
  "c5a413b05a5156f2a8918d845f1b3d1318e4b60ef38860ea5008359f97ec5259",
  "a516dd2cad566107f140d7404d4e09660db600e461b108c772893b9e255526b4",
  "76597ed3640af12d5a68931b233d787e269243dd0d4e50e651abe7466a842fe7",
  "e3c3439e394df4f86a89f3c60ccd380e8710c6ddc5cedca693861f67711ea1da",
]);
// Atualizado junto à função de execução; é validado antes de consultar o banco.
export const EXPECTED_EXECUTOR_FUNCTION_SHA256 = "7d45d6ddb980f379b32ca76bede76ac1a5272a799106b7bb6cb864143b54838b";
const REQUIRED_SIGNOFFS = Object.freeze([
  "authorization", "review", "exactSql", "executorDigest", "artifactsRevision",
  "window", "backupExceptionOrProof", "canonicalTarget", "gitRevision",
]);
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function normalized(value) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  if (typeof value === "bigint") return value.toString();
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function rows(result) { return Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : []; }
function failure(phase, reason, ddlCount = 0) { return { ok: false, phase, reason, ddlCount, tables: 4 }; }
function success(phase, ddlCount = 0) { return { ok: true, phase, reason: phase === "complete" ? "applied" : "ready", ddlCount, tables: 4 }; }
function artifactPath(root, relativePath) {
  const base = path.resolve(root), resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error("unsafe_artifact_path");
  return resolved;
}
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw)) return "CURRENT_TIMESTAMP";
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}
function column(name, type, nullable, defaultValue, autoincrement, onUpdate) {
  return { name, type: normalized(type), nullable: Boolean(nullable), default: defaultValue, autoincrement: Boolean(autoincrement), onUpdate: Boolean(onUpdate) };
}
function index(name, unique, columns, primary = false, prefixes = columns.map(() => null)) {
  return { name, unique: Boolean(unique), columns, primary: Boolean(primary), prefixes };
}
function splitSqlStatements(sql) {
  const output = [], current = [];
  let quote = null, lineComment = false, blockComment = false;
  for (let position = 0; position < sql.length; position += 1) {
    const char = sql[position], next = sql[position + 1];
    if (lineComment) { current.push(char); if (char === "\n") lineComment = false; continue; }
    if (blockComment) { current.push(char); if (char === "*" && next === "/") { current.push(next); position += 1; blockComment = false; } continue; }
    if (!quote && char === "-" && next === "-" && /\s/.test(sql[position + 2] ?? "")) { current.push(char, next); position += 1; lineComment = true; continue; }
    if (!quote && char === "/" && next === "*") { current.push(char, next); position += 1; blockComment = true; continue; }
    if (quote) {
      current.push(char);
      if (char === "\\") { if (next !== undefined) { current.push(next); position += 1; } continue; }
      if (char === quote) {
        if (next === quote && quote !== "`") { current.push(next); position += 1; } else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; current.push(char); continue; }
    if (char === ";") { const statement = current.join("").trim(); if (statement) output.push(statement); current.length = 0; continue; }
    current.push(char);
  }
  const tail = current.join("").trim(); if (tail) output.push(tail);
  return output.map(statement => statement.replace(/^(?:\s*--[^\n]*(?:\n|$)|\s*\/\*[\s\S]*?\*\/\s*)+/, "").trim()).filter(Boolean);
}
function approvedSql(statements) {
  const forbidden = /\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE(?!\s+CURRENT_TIMESTAMP\b)|REPLACE|RENAME|GRANT|REVOKE|FOREIGN\s+KEY|REFERENCES)\b/i;
  return statements.length === TARGET_TABLES.length && statements.every((statement, position) => {
    const name = TARGET_TABLES[position];
    return !forbidden.test(statement) && new RegExp("^CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+`" + name + "`\\s*\\(", "i").test(statement) && sha256(Buffer.from(statement, "utf8")) === APPROVED_STATEMENT_HASHES[position];
  });
}
function snapshotContract(snapshot, tableNames) {
  const result = {};
  for (const tableName of tableNames) {
    const table = snapshot?.tables?.[tableName];
    if (!table) throw new Error("snapshot_target_missing");
    result[tableName] = {
      columns: Object.values(table.columns ?? {}).map(item => column(item.name, item.type, !item.notNull, normalizeDefault(item.default), item.autoincrement, item.onUpdate)),
      indexes: [
        ...Object.values(table.compositePrimaryKeys ?? {}).map(item => index("PRIMARY", true, item.columns, true)),
        ...Object.values(table.indexes ?? {}).map(item => index(item.name, item.isUnique, item.columns)),
        ...Object.values(table.uniqueConstraints ?? {}).map(item => index(item.name, true, item.columns)),
      ].sort((left, right) => left.name.localeCompare(right.name)),
      foreignKeys: Object.keys(table.foreignKeys ?? {}).sort(),
    };
  }
  return result;
}
function snapshotAppendOnly(snapshot143, snapshot144) {
  if (!snapshot143?.id || snapshot144?.prevId !== snapshot143.id || snapshot143?.dialect !== "mysql" || snapshot144?.dialect !== "mysql") return false;
  if (!TARGET_TABLES.every(table => !snapshot143.tables?.[table] && snapshot144.tables?.[table])) return false;
  const oldNames = Object.keys(snapshot143.tables ?? {}).sort();
  const targetNames = Object.keys(snapshot144.tables ?? {}).filter(name => !TARGET_TABLES.includes(name)).sort();
  return same(oldNames, targetNames) && oldNames.every(name => same(snapshot143.tables[name], snapshot144.tables[name]));
}
function journalIsPinned(journal) {
  const entries = journal?.entries ?? [];
  const current = entries.filter(entry => entry.idx === 144);
  const prior = entries.filter(entry => entry.idx === 143);
  return journal?.version === "7" && journal?.dialect === "mysql" &&
    current.length === 1 && current[0].tag === MIGRATION_TAG && current[0].when === MIGRATION_TIMESTAMP && current[0].version === "5" && current[0].breakpoints === true &&
    prior.length === 1 && prior[0].tag === "0143_banco_inter_seguranca" && prior[0].when === 1793297372715 && prior[0].version === "5" && prior[0].breakpoints === true &&
    entries.filter(entry => entry.tag === MIGRATION_TAG).length === 1;
}
async function readProductionRevision(root) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const revision = String(stdout).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("git_revision_invalid");
  await execFileAsync("git", ["diff", "--quiet", "HEAD", "--", ...VERIFIED_ARTIFACTS, EXECUTOR_ARTIFACT], { cwd: root });
  return revision;
}
async function verifyArtifactsAtRevision(root, revision) {
  for (const relative of [...VERIFIED_ARTIFACTS, EXECUTOR_ARTIFACT]) {
    const [local, versioned] = await Promise.all([
      readFile(artifactPath(root, relative)),
      execFileAsync("git", ["show", `${revision}:${relative}`], { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }).then(result => Buffer.from(result.stdout)),
    ]);
    if (!local.equals(versioned)) throw new Error("git_artifact_mismatch");
  }
}
function isExplicitTestRevision(options, root) {
  return process.env.NODE_ENV === "test" && options?.allowTestRevisionInjection === true && root !== projectRoot && /^[0-9a-f]{40}$/i.test(String(options?.approvedRevision ?? ""));
}

/**
 * Carrega apenas os quatro artefatos atestados. A injeção de revisão existe
 * exclusivamente para fixtures NODE_ENV=test; o fluxo de produção exige HEAD
 * e identidade byte a byte com a revisão Git.
 */
export async function loadRestricted0144Artifacts(options = {}) {
  const root = options.root ?? projectRoot;
  try {
    const testRevision = isExplicitTestRevision(options, root);
    const gitRevision = testRevision ? String(options.approvedRevision).toLowerCase() : await readProductionRevision(root);
    if (!testRevision) await verifyArtifactsAtRevision(root, gitRevision);
    const bytes = await Promise.all(VERIFIED_ARTIFACTS.map(relative => readFile(artifactPath(root, relative))));
    const files = Object.fromEntries(VERIFIED_ARTIFACTS.map((relative, position) => [relative, bytes[position]]));
    if (!VERIFIED_ARTIFACTS.every(relative => sha256(files[relative]) === FIXED_ARTIFACT_HASHES[relative])) return { ok: false, reason: "artifact_identity_mismatch" };
    const statements = splitSqlStatements(files[SQL_ARTIFACT].toString("utf8"));
    if (!approvedSql(statements)) return { ok: false, reason: "approved_sql_contract_invalid" };
    const snapshot143 = JSON.parse(files[BASELINE_SNAPSHOT_ARTIFACT].toString("utf8"));
    const snapshot144 = JSON.parse(files[SNAPSHOT_ARTIFACT].toString("utf8"));
    if (!snapshotAppendOnly(snapshot143, snapshot144)) return { ok: false, reason: "snapshot_chain_not_append_only" };
    const contracts = snapshotContract(snapshot144, TARGET_TABLES);
    if (!TARGET_TABLES.every(table => contracts[table].foreignKeys.length === 0 && contracts[table].columns.length > 0 && contracts[table].indexes.some(item => item.primary))) return { ok: false, reason: "snapshot_contract_invalid" };
    const journal = JSON.parse(files[JOURNAL_ARTIFACT].toString("utf8"));
    if (!journalIsPinned(journal)) return { ok: false, reason: "journal_identity_invalid" };
    return { ok: true, gitRevision, sqlHash: EXPECTED_SQL_SHA256, statements, contracts, fixtureRevisionInjected: testRevision };
  } catch { return { ok: false, reason: "artifact_unavailable_or_dirty" }; }
}

function normalizeColumns(raw) {
  return raw.map(row => ({
    table: String(row.TABLE_NAME ?? row.table_name ?? ""), position: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
    name: String(row.COLUMN_NAME ?? row.column_name ?? ""), type: normalized(row.COLUMN_TYPE ?? row.column_type),
    nullable: normalized(row.IS_NULLABLE ?? row.is_nullable) === "yes", default: normalizeDefault(row.COLUMN_DEFAULT ?? row.column_default),
    autoincrement: /auto_increment/.test(normalized(row.EXTRA ?? row.extra)), onUpdate: /on update/.test(normalized(row.EXTRA ?? row.extra)),
  })).sort((left, right) => left.table.localeCompare(right.table) || left.position - right.position);
}
function normalizeIndexes(raw) {
  const grouped = new Map();
  for (const row of raw) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? ""), name = String(row.INDEX_NAME ?? row.index_name ?? "");
    if (!table || !name) continue;
    const key = `${table}\0${name}`;
    const record = grouped.get(key) ?? { table, name, unique: String(row.NON_UNIQUE ?? row.non_unique ?? "1") === "0", columns: [] };
    record.columns.push({ position: Number(row.SEQ_IN_INDEX ?? row.seq_in_index ?? 0), name: String(row.COLUMN_NAME ?? row.column_name ?? ""), prefix: row.SUB_PART ?? row.sub_part ?? null });
    grouped.set(key, record);
  }
  return [...grouped.values()].map(item => ({ ...item, primary: item.name === "PRIMARY", columns: item.columns.sort((left, right) => left.position - right.position) })).sort((left, right) => `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`));
}
async function query(connection, sql, params = []) { return rows(await connection.query(sql, params)); }
async function execute(connection, sql, params = []) { return connection.execute(sql, params); }
async function closeQuietly(connection) { try { await connection?.close?.(); } catch {} }

/** Lê somente catálogo dos quatro alvos e o ledger Drizzle; não lê tabelas de negócio. */
export async function read0144Catalog(connection) {
  const placeholders = TARGET_TABLES.map(() => "?").join(", ");
  const [tables, columns, indexes, foreignKeys] = await Promise.all([
    query(connection, `/* 0144:catalog-tables */ SELECT \`TABLE_NAME\`, \`TABLE_TYPE\` FROM \`information_schema\`.\`tables\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\``, TARGET_TABLES),
    query(connection, `/* 0144:catalog-columns */ SELECT \`TABLE_NAME\`, \`ORDINAL_POSITION\`, \`COLUMN_NAME\`, \`COLUMN_TYPE\`, \`IS_NULLABLE\`, \`COLUMN_DEFAULT\`, \`EXTRA\` FROM \`information_schema\`.\`columns\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`ORDINAL_POSITION\``, TARGET_TABLES),
    query(connection, `/* 0144:catalog-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\`, \`NON_UNIQUE\`, \`SEQ_IN_INDEX\`, \`COLUMN_NAME\`, \`SUB_PART\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\`, \`SEQ_IN_INDEX\``, TARGET_TABLES),
    query(connection, `/* 0144:catalog-foreign-keys */ SELECT \`TABLE_NAME\`, \`CONSTRAINT_NAME\` FROM \`information_schema\`.\`referential_constraints\` WHERE \`constraint_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`CONSTRAINT_NAME\``, TARGET_TABLES),
  ]);
  return {
    tables: tables.map(row => ({ name: String(row.TABLE_NAME ?? row.table_name ?? ""), type: normalized(row.TABLE_TYPE ?? row.table_type) })).sort((left, right) => left.name.localeCompare(right.name)),
    columns: normalizeColumns(columns), indexes: normalizeIndexes(indexes),
    foreignKeys: foreignKeys.map(row => ({ table: String(row.TABLE_NAME ?? row.table_name ?? ""), name: String(row.CONSTRAINT_NAME ?? row.constraint_name ?? "") })).sort((left, right) => `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`)),
  };
}
async function readLedgerLayout(connection) {
  return query(connection, "/* 0144:ledger-layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`");
}
async function readLedger(connection, locked = false) {
  return query(connection, `/* 0144:ledger-read${locked ? "-lock" : ""} */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`);
}
function ledgerLayoutValid(layout) {
  const byName = new Map(layout.map(row => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row]));
  const id = byName.get("id"), hash = byName.get("hash"), createdAt = byName.get("created_at");
  return byName.size === 3 && Boolean(id && hash && createdAt) && normalized(id.COLUMN_TYPE ?? id.column_type) === "bigint unsigned" && /auto_increment/.test(normalized(id.EXTRA ?? id.extra)) && normalized(hash.COLUMN_TYPE ?? hash.column_type) === "text" && normalized(createdAt.COLUMN_TYPE ?? createdAt.column_type) === "bigint";
}
function exactMarker(ledger, marker) {
  const related = ledger.filter(row => String(row.created_at) === String(marker.when) || String(row.hash) === marker.hash);
  return related.length === 1 && String(related[0].created_at) === String(marker.when) && String(related[0].hash) === marker.hash;
}
function absentMarker(ledger, marker) { return !ledger.some(row => String(row.created_at) === String(marker.when) || String(row.hash) === marker.hash); }
function ledgerBaselineValid(ledger) {
  const baseline = { when: 1793297372715, hash: BASELINE_0143_SQL_SHA256 };
  const current = { when: MIGRATION_TIMESTAMP, hash: EXPECTED_SQL_SHA256 };
  return exactMarker(ledger, baseline) && absentMarker(ledger, current) && ledger.every(row => {
    const value = String(row.created_at ?? ""), timestamp = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= baseline.when;
  }) && Math.max(...ledger.map(row => Number(row.created_at))) === baseline.when;
}
function targetTablesAbsent(catalog) {
  return catalog.tables.length === 0 && catalog.columns.length === 0 && catalog.indexes.length === 0 && catalog.foreignKeys.length === 0;
}
function actualColumns(catalog, table) { return catalog.columns.filter(item => item.table === table).map(({ table: ignored, position, ...item }) => item); }
function actualIndexes(catalog, table) {
  return catalog.indexes.filter(item => item.table === table).map(item => index(item.name, item.unique, item.columns.map(columnItem => columnItem.name), item.primary, item.columns.map(columnItem => columnItem.prefix))).sort((left, right) => left.name.localeCompare(right.name));
}
function expectedTableContract(contract) {
  return { columns: contract.columns, indexes: contract.indexes, foreignKeys: [] };
}
function tableMatches(catalog, contracts, table) {
  const actualTable = catalog.tables.filter(item => item.name === table);
  return actualTable.length === 1 && actualTable[0].type === "base table" &&
    catalog.foreignKeys.filter(item => item.table === table).length === 0 &&
    same(actualColumns(catalog, table), expectedTableContract(contracts[table]).columns) &&
    same(actualIndexes(catalog, table), expectedTableContract(contracts[table]).indexes);
}
function validateStepCatalog(catalog, contracts, ddlCount) {
  if (catalog.foreignKeys.length !== 0) return false;
  return TARGET_TABLES.every((table, position) => {
    if (position < ddlCount) return tableMatches(catalog, contracts, table);
    return !catalog.tables.some(item => item.name === table) && !catalog.columns.some(item => item.table === table) && !catalog.indexes.some(item => item.table === table);
  });
}
function canonicalTargetIsValid(target) {
  return Boolean(target && typeof target === "object" && SAFE_REFERENCE.test(String(target.reference ?? "")) && normalized(target.serverProduct) === "tidb" && String(target.databaseName ?? "").trim() && String(target.serverVersion ?? "").trim() && /^[0-9a-f]{64}$/i.test(String(target.certificateFingerprint ?? "").trim()));
}
function sameCanonicalTarget(left, right) {
  return canonicalTargetIsValid(left) && canonicalTargetIsValid(right) && String(left.reference) === String(right.reference) && normalized(left.serverProduct) === normalized(right.serverProduct) && String(left.databaseName) === String(right.databaseName) && String(left.serverVersion) === String(right.serverVersion) && normalized(left.certificateFingerprint) === normalized(right.certificateFingerprint);
}
async function readIdentity(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    const result = {
      tlsVerified: identity?.tlsVerified === true,
      serverProduct: normalized(identity?.serverProduct),
      databaseName: String(identity?.databaseName ?? "").trim(),
      serverVersion: String(identity?.serverVersion ?? "").trim(),
      certificateFingerprint: normalized(identity?.certificateFingerprint),
    };
    return result.tlsVerified && result.serverProduct === "tidb" && result.databaseName && result.serverVersion && /^[0-9a-f]{64}$/.test(result.certificateFingerprint) ? result : null;
  } catch { return null; }
}
function identityMatchesTarget(identity, target) {
  return Boolean(identity) && canonicalTargetIsValid(target) && identity.serverProduct === normalized(target.serverProduct) && identity.databaseName === String(target.databaseName) && identity.serverVersion === String(target.serverVersion) && identity.certificateFingerprint === normalized(target.certificateFingerprint);
}
async function inspectBaseline(connection) {
  const [identity, catalog, ledgerLayout, ledger] = await Promise.all([readIdentity(connection), read0144Catalog(connection), readLedgerLayout(connection), readLedger(connection)]);
  return { identity, catalog, ledgerLayout, ledger, safe: ledgerLayoutValid(ledgerLayout) && targetTablesAbsent(catalog) && ledgerBaselineValid(ledger) };
}
function sanitizedPreflight(preflight, canonicalTarget, now) {
  return { ...success("preflight"), observedAt: now, canonicalTargetReference: canonicalTarget.reference, ledgerAttestation: sha256(JSON.stringify(stable(preflight.ledger))), attestation: sha256(JSON.stringify(stable({ identity: preflight.identity, catalog: preflight.catalog, ledger: preflight.ledger }))) };
}

/** Preflight somente leitura em duas conexões TLS independentes. */
export async function preflightRestricted0144(options = {}) {
  const root = options.root ?? projectRoot, now = options.now ?? Date.now();
  if (!canonicalTargetIsValid(options.canonicalTarget)) return failure("preflight", "canonical_target_required");
  if (!options.connectionFactory || typeof options.connectionFactory.connect !== "function") return failure("preflight", "connection_factory_required");
  const artifacts = await loadRestricted0144Artifacts({ root, approvedRevision: options.approvedRevision, allowTestRevisionInjection: options.allowTestRevisionInjection });
  if (!artifacts.ok) return failure("identity", artifacts.reason);
  let first; let second;
  try {
    [first, second] = await Promise.all([options.connectionFactory.connect("0144-preflight-a"), options.connectionFactory.connect("0144-preflight-b")]);
    if (!first || !second || first === second) return failure("preflight", "connections_not_independent");
    const [left, right] = await Promise.all([inspectBaseline(first), inspectBaseline(second)]);
    if (!left.identity || !right.identity || !identityMatchesTarget(left.identity, options.canonicalTarget) || !identityMatchesTarget(right.identity, options.canonicalTarget) || !same(left.identity, right.identity)) return failure("preflight", "tls_identity_invalid");
    if (!left.safe || !right.safe || !same(left.catalog, right.catalog) || !same(left.ledgerLayout, right.ledgerLayout) || !same(left.ledger, right.ledger)) return failure("preflight", "independent_reads_diverged_or_unsafe");
    return sanitizedPreflight(left, options.canonicalTarget, now);
  } catch { return failure("preflight", "metadata_read_failed"); } finally { await Promise.all([closeQuietly(first), closeQuietly(second)]); }
}

function safeGate(gate, now) {
  const issuedAt = Date.parse(String(gate?.issuedAt ?? "")), expiresAt = Date.parse(String(gate?.expiresAt ?? ""));
  return Boolean(gate && typeof gate === "object" && SAFE_REFERENCE.test(String(gate.reference ?? "")) && Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now && expiresAt > now && expiresAt <= now + MAX_GATE_WINDOW_MS && expiresAt - issuedAt <= MAX_GATE_WINDOW_MS);
}
function approvalHasPinnedHashes(gate, now, executorDigest, artifacts) {
  return safeGate(gate, now) && String(gate.approvedExecutorDigest ?? "") === executorDigest && String(gate.approvedSqlDigest ?? "") === artifacts.sqlHash && String(gate.approvedGitRevision ?? "") === artifacts.gitRevision && String(gate.artifactsRevision ?? "") === ARTIFACTS_REVISION;
}
function backupGateValid(gate, now) {
  return safeGate(gate, now) && String(gate.appliesTo ?? "") === MIGRATION_TAG && ((gate.kind === "exception" && gate.exceptionAuthorized === true) || (gate.kind === "proof" && gate.proofVerified === true));
}
async function gatesAreCurrent(options, now, executorDigest, artifacts) {
  const gates = options.gates;
  if (!gates || typeof options.verifyExternalGates !== "function" || !REQUIRED_SIGNOFFS.every(name => gates.signoffs?.[name] === true) || !approvalHasPinnedHashes(gates.authorization, now, executorDigest, artifacts) || !approvalHasPinnedHashes(gates.review, now, executorDigest, artifacts) || !safeGate(gates.window, now) || !backupGateValid(gates.backupExceptionOrProof, now) || !safeGate(gates.target, now) || !canonicalTargetIsValid(gates.target)) return false;
  try {
    const verified = await options.verifyExternalGates({ migrationTag: MIGRATION_TAG, migrationTimestamp: MIGRATION_TIMESTAMP, artifactsRevision: ARTIFACTS_REVISION, sqlDigest: artifacts.sqlHash, gitRevision: artifacts.gitRevision, executorDigest, canonicalTarget: gates.target, gates });
    return Boolean(verified && verified.canonical === "restricted-0144-v1" && verified.authorization === true && verified.review === true && verified.window === true && (verified.backup === "exception" || verified.backup === "proof") && verified.migrationTag === MIGRATION_TAG && verified.artifactsRevision === ARTIFACTS_REVISION && verified.sqlDigest === artifacts.sqlHash && verified.gitRevision === artifacts.gitRevision && verified.executorDigest === executorDigest && sameCanonicalTarget(verified.canonicalTarget, gates.target));
  } catch { return false; }
}
function preflightFresh(preflight, now) {
  return Boolean(preflight?.ok === true && preflight.phase === "preflight" && Number.isFinite(Number(preflight.observedAt)) && now >= Number(preflight.observedAt) && now - Number(preflight.observedAt) <= MAX_PREFLIGHT_AGE_MS);
}
async function guardedJournalInsert(connection, artifacts, ledgerAttestation) {
  let began = false, commitAttempted = false;
  try {
    // DDL em TiDB pode ser autocommit; esta transação contém apenas o marker.
    await execute(connection, "/* 0144:journal-begin */ BEGIN PESSIMISTIC"); began = true;
    await query(connection, "/* 0144:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE");
    const locked = await readLedger(connection, true);
    if (!ledgerBaselineValid(locked) || sha256(JSON.stringify(stable(locked))) !== ledgerAttestation) throw new Error("ledger_changed_before_insert");
    const inserted = await execute(connection, "/* 0144:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [artifacts.sqlHash, MIGRATION_TIMESTAMP]);
    if (Number(inserted?.affectedRows) !== 1) throw new Error("ledger_insert_guard");
    const after = await readLedger(connection, true);
    if (!exactMarker(after, { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash }) || !same(after.filter(row => String(row.created_at) !== String(MIGRATION_TIMESTAMP) && String(row.hash) !== artifacts.sqlHash), locked)) throw new Error("ledger_marker_guard");
    commitAttempted = true;
    await execute(connection, "/* 0144:journal-commit */ COMMIT");
    return true;
  } catch {
    if (!commitAttempted && began) try { await execute(connection, "/* 0144:journal-rollback */ ROLLBACK"); } catch {}
    return false;
  }
}
async function freshBaselineBeforeDdl(connection, canonicalTarget, artifacts, preflight) {
  const inspected = await inspectBaseline(connection);
  const attestation = sha256(JSON.stringify(stable({ identity: inspected.identity, catalog: inspected.catalog, ledger: inspected.ledger })));
  return Boolean(inspected.identity && identityMatchesTarget(inspected.identity, canonicalTarget) && inspected.safe && artifacts.contracts && attestation === preflight.attestation);
}
async function independentFinalValid(connection, canonicalTarget, artifacts, marked, ledgerAttestation) {
  const [identity, catalog, ledger] = await Promise.all([readIdentity(connection), read0144Catalog(connection), readLedger(connection)]);
  const marker = { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash };
  const baselineRows = ledger.filter(row => String(row.created_at) !== String(marker.when) && String(row.hash) !== marker.hash);
  return Boolean(identity && identityMatchesTarget(identity, canonicalTarget) && validateStepCatalog(catalog, artifacts.contracts, TARGET_TABLES.length) && sha256(JSON.stringify(stable(baselineRows))) === ledgerAttestation && (marked ? exactMarker(ledger, marker) && ledgerBaselineValid(baselineRows) : ledgerBaselineValid(ledger)));
}

/**
 * Aplica as quatro DDL exatamente uma vez. Uma prévia bem-sucedida e recente
 * é obrigatória, mas o baseline também é relido antes da primeira DDL.
 */
export async function applyRestricted0144(options = {}) {
  const root = options.root ?? projectRoot, now = options.now ?? Date.now(), canonicalTarget = options.gates?.target;
  if (!preflightFresh(options.preflight, now)) return failure("apply", "fresh_preflight_required");
  if (!canonicalTargetIsValid(canonicalTarget)) return failure("apply", "canonical_target_required");
  if (options.preflight.canonicalTargetReference !== canonicalTarget.reference) return failure("apply", "preflight_target_changed");
  if (!options.connectionFactory || typeof options.connectionFactory.connect !== "function") return failure("apply", "connection_factory_required");
  const artifacts = await loadRestricted0144Artifacts({ root, approvedRevision: options.approvedRevision, allowTestRevisionInjection: options.allowTestRevisionInjection });
  if (!artifacts.ok) return failure("identity", artifacts.reason);
  const executorDigest = getRestricted0144ExecutorDigest();
  if (executorDigest !== EXPECTED_EXECUTOR_FUNCTION_SHA256 || !(await gatesAreCurrent(options, now, executorDigest, artifacts))) return failure("apply-gates", "external_gates_missing_or_unverified");
  const usedConnections = new Set();
  const connect = async purpose => {
    const connection = await options.connectionFactory.connect(purpose);
    if (!connection || usedConnections.has(connection)) throw new Error("connection_not_independent");
    usedConnections.add(connection);
    return connection;
  };
  let ddl; let ddlCount = 0;
  try {
    ddl = await connect("0144-ddl");
    if (!(await freshBaselineBeforeDdl(ddl, canonicalTarget, artifacts, options.preflight))) return failure("apply", "baseline_changed_before_ddl");
    for (const [position, statement] of artifacts.statements.entries()) {
      try { await execute(ddl, statement); } catch { return failure("ddl", "statement_failed_no_retry", ddlCount); }
      ddlCount += 1;
      const [catalog, ledger] = await Promise.all([read0144Catalog(ddl), readLedger(ddl)]);
      if (!validateStepCatalog(catalog, artifacts.contracts, position + 1) || !ledgerBaselineValid(ledger) || sha256(JSON.stringify(stable(ledger))) !== options.preflight.ledgerAttestation) return failure("ddl-validation", "intermediate_divergence", ddlCount);
    }
  } catch { return failure("ddl", "ddl_connection_or_validation_failed", ddlCount); } finally { await closeQuietly(ddl); }
  let independent;
  try {
    independent = await connect("0144-post-ddl-independent");
    if (!(await independentFinalValid(independent, canonicalTarget, artifacts, false, options.preflight.ledgerAttestation))) return failure("post-ddl", "independent_ddl_or_ledger_validation_failed", ddlCount);
  } catch { return failure("post-ddl", "independent_validation_failed", ddlCount); } finally { await closeQuietly(independent); }
  let journal;
  try {
    journal = await connect("0144-journal");
    if (!(await independentFinalValid(journal, canonicalTarget, artifacts, false, options.preflight.ledgerAttestation))) return failure("journal", "ledger_not_stable_before_marker", ddlCount);
    if (!(await guardedJournalInsert(journal, artifacts, options.preflight.ledgerAttestation))) return failure("journal", "journal_guard_failed", ddlCount);
  } catch { return failure("journal", "journal_connection_failed", ddlCount); } finally { await closeQuietly(journal); }
  let finalConnection;
  try {
    finalConnection = await connect("0144-final-independent");
    if (!(await independentFinalValid(finalConnection, canonicalTarget, artifacts, true, options.preflight.ledgerAttestation))) return failure("final", "final_contract_or_marker_invalid", ddlCount);
  } catch { return failure("final", "final_independent_validation_failed", ddlCount); } finally { await closeQuietly(finalConnection); }
  return success("complete", ddlCount);
}

/** Executa preflight, ou preflight seguido do apply em uma única chamada. */
export async function runRestricted0144(options = {}) {
  const mode = options.mode ?? "preflight", root = options.root ?? projectRoot;
  if (mode !== "preflight" && mode !== "apply") return failure("mode", "invalid_mode");
  const canonicalTarget = mode === "apply" ? options.gates?.target : options.canonicalTarget;
  const preflight = await preflightRestricted0144({ ...options, root, canonicalTarget });
  if (!preflight.ok || mode === "preflight") return preflight;
  return applyRestricted0144({ ...options, root, preflight });
}

/** Digest pinado das funções que controlam leitura, DDL, gates e ledger. */
export function getRestricted0144ExecutorDigest() {
  return sha256([
    runRestricted0144.toString(), applyRestricted0144.toString(), preflightRestricted0144.toString(),
    guardedJournalInsert.toString(), validateStepCatalog.toString(), gatesAreCurrent.toString(),
    safeGate.toString(), approvalHasPinnedHashes.toString(), backupGateValid.toString(),
    ledgerBaselineValid.toString(), independentFinalValid.toString(), approvedSql.toString(),
  ].join("\n"));
}

/** Adaptador opcional: recebe configuração TLS pronta; não lê ambiente. */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions } = {}) {
  if (!mysql || typeof mysql.createConnection !== "function" || !connectionOptions || typeof connectionOptions !== "object" || !String(connectionOptions.host ?? "").trim() || !String(connectionOptions.database ?? "").trim() || !connectionOptions.ssl?.ca || connectionOptions.ssl.rejectUnauthorized !== true || connectionOptions.ssl.verifyIdentity !== true || String(connectionOptions.ssl.servername ?? "") !== String(connectionOptions.host ?? "")) throw new Error("injected_mysql2_tls_configuration_invalid");
  const options = { ...connectionOptions, multipleStatements: false, ssl: { ...connectionOptions.ssl, rejectUnauthorized: true, verifyIdentity: true } };
  return { async connect() {
    let raw;
    try {
      raw = await mysql.createConnection(options);
      const socket = raw?.connection?.stream, peer = socket?.getPeerCertificate?.(true);
      if (socket?.encrypted !== true || socket?.authorized !== true || !peer || Object.keys(peer).length === 0) throw new Error("injected_mysql2_tls_peer_unverified");
      return {
        async query(sql, params) { const [result] = await raw.query(sql, params); return { rows: Array.isArray(result) ? result : [] }; },
        async execute(sql, params) { const [result] = await raw.execute(sql, params); return { rows: Array.isArray(result) ? result : [], affectedRows: Number(result?.affectedRows ?? 0) }; },
        async getIdentity() {
          const active = raw?.connection?.stream, certificate = active?.getPeerCertificate?.(true);
          if (active?.encrypted !== true || active?.authorized !== true || !certificate || Object.keys(certificate).length === 0) return { tlsVerified: false };
          const [result] = await raw.query("/* 0144:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`");
          const row = result?.[0] ?? {};
          return { tlsVerified: true, serverProduct: /tidb/i.test(String(row.server_version ?? "")) ? "tidb" : "other", databaseName: String(row.database_name ?? ""), serverVersion: String(row.server_version ?? ""), certificateFingerprint: String(certificate.fingerprint256 ?? "").replace(/:/g, "").toLowerCase() };
        },
        async close() { await raw.end(); },
      };
    } catch (error) { try { await raw?.end?.(); } catch {} if (String(error?.message ?? "") === "injected_mysql2_tls_peer_unverified") throw error; throw new Error("injected_mysql2_connection_failed"); }
  } };
}

function localIdentification() { return { ...success("identification-only"), mode: "identification-only", ddlCount: 0 }; }
async function main() {
  const result = process.argv.slice(2).includes("--apply") ? { ...failure("dependency_injection_required", "cli_cannot_apply"), mode: "identification-only" } : localIdentification();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stdout.write('{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0,"tables":4}\n'); process.exitCode = 2; });
