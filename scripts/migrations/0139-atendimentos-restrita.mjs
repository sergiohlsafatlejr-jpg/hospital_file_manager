#!/usr/bin/env node
/**
 * Executor restrito da migração Drizzle 0139.
 *
 * Não lê DATABASE_URL, .env ou credenciais; não descobre conexão; não chama
 * db:migrate/db:push. Em apply, a única via é uma factory TLS injetada, gates
 * externos canônicos e uma revisão Git vinculada aos artefatos imutáveis.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDirectory, "../..");

export const MIGRATION_TAG = "0139_past_toro";
export const MIGRATION_TIMESTAMP = 1793119956230;
export const ARTIFACTS_REVISION = "0139_past_toro";
export const EXPECTED_SQL_SHA256 =
  "57e8010fc1c95371bceb85da478fcb418b4785dd807bbd07498ea795059decc5";
export const TARGET_TABLES = [
  "atendimentos_hop_controles",
  "atendimentos_hop_execucoes",
  "atendimentos_hop_lotes",
];

const SQL_ARTIFACT = "drizzle/0139_past_toro.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0139_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const EXECUTOR_ARTIFACT = "scripts/migrations/0139-atendimentos-restrita.mjs";
const HISTORY_MARKERS = [
  { idx: 135, tag: "0135_fuzzy_wolf_cub", when: 1791922720742 },
  { idx: 136, tag: "0136_lame_dreadnoughts", when: 1792003825434 },
  { idx: 137, tag: "0137_retornos_recursos_cassi", when: 1793047237100 },
  { idx: 138, tag: "0138_known_blink", when: 1793104873640 },
];
const EXPECTED_BASELINE_HISTORY_ROWS = 99;
const REQUIRED_SIGNOFFS = [
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
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function column(name, type, nullable = false, defaultValue = null, autoincrement = false, onUpdate = false) {
  return { name, type, nullable, default: defaultValue, autoincrement, onUpdate };
}
function index(name, unique, columns, primary = false) {
  return { name, unique, columns, primary, prefixes: columns.map(() => null) };
}

// Contrato físico normativo: não se infere objetos permitidos a partir do banco.
const EXPECTED_CONTRACT = {
  atendimentos_hop_controles: {
    columns: [
      column("id", "int", false, null, true),
      column("estabelecimento_id", "int"),
      column("criado_por", "int"),
      column("estado", "enum('pausado','preparando','ativo','erro','incerto')", false, "pausado"),
      column("task_uid", "varchar(65)", true),
      column("cron_utc", "varchar(100)", false, "0 0 13 * * *"),
      column("fuso", "varchar(64)", false, "America/Sao_Paulo"),
      column("operacao_token", "varchar(64)", true),
      column("execucao_token", "varchar(64)", true),
      column("lease_ate", "datetime(3)", true),
      column("ultimo_slot", "varchar(64)", true),
      column("ultima_execucao", "datetime(3)", true),
      column("proxima_execucao", "datetime(3)", true),
      column("producer_token_hash", "varchar(64)", true),
      column("criado_em", "datetime(3)"),
      column("atualizado_em", "datetime(3)"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("uq_athop_controle_unidade", true, ["estabelecimento_id"]),
      index("uq_athop_controle_task_uid", true, ["task_uid"]),
      index("uq_athop_controle_producer_hash", true, ["producer_token_hash"]),
      index("idx_athop_controle_estado_lease", false, ["estado", "lease_ate"]),
    ],
  },
  atendimentos_hop_execucoes: {
    columns: [
      column("id", "int", false, null, true),
      column("controle_id", "int"),
      column("lote_id", "int", true),
      column("slot", "varchar(64)"),
      column("modo", "enum('cron','manual')"),
      column("estado", "enum('reservada','concluida','falhou','incerto')"),
      column("contagens", "json", true),
      column("codigo", "varchar(64)", true),
      column("iniciado_em", "datetime(3)"),
      column("terminado_em", "datetime(3)", true),
      column("criado_em", "datetime(3)"),
      column("atualizado_em", "datetime(3)"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("uq_athop_execucao_controle_slot", true, ["controle_id", "slot"]),
      index("idx_athop_execucao_controle_data", false, ["controle_id", "iniciado_em"]),
      index("idx_athop_execucao_lote", false, ["lote_id"]),
    ],
  },
  atendimentos_hop_lotes: {
    columns: [
      column("id", "int", false, null, true),
      column("controle_id", "int"),
      column("estabelecimento_id", "int"),
      column("lote_ref", "varchar(36)"),
      column("estado", "enum('carregando','completo','publicado','falhou','incerto')"),
      column("total_esperado", "int", true),
      column("total_observado", "int", true),
      column("fingerprint_privado", "varchar(64)", true),
      column("iniciado_em", "datetime(3)"),
      column("concluido_em", "datetime(3)", true),
      column("publicado_em", "datetime(3)", true),
      column("falhou_em", "datetime(3)", true),
      column("codigo", "varchar(64)", true),
      column("criado_em", "datetime(3)"),
      column("atualizado_em", "datetime(3)"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("uq_athop_lote_unidade_ref", true, ["estabelecimento_id", "lote_ref"]),
      index("idx_athop_lote_controle_estado", false, ["controle_id", "estado"]),
      index("idx_athop_lote_unidade_data", false, ["estabelecimento_id", "criado_em"]),
    ],
  },
};
const EXPECTED_INDEX_CREATION_ORDER = [
  ["idx_athop_controle_estado_lease", "atendimentos_hop_controles"],
  ["idx_athop_execucao_controle_data", "atendimentos_hop_execucoes"],
  ["idx_athop_execucao_lote", "atendimentos_hop_execucoes"],
  ["idx_athop_lote_controle_estado", "atendimentos_hop_lotes"],
  ["idx_athop_lote_unidade_data", "atendimentos_hop_lotes"],
];

function normalized(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
function stable(value) {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function rows(result) { return Array.isArray(result?.rows) ? result.rows : []; }
function failure(phase, reason, ddlCount = 0) { return { ok: false, phase, reason, ddlCount }; }
function report(mode, phase, ddlCount = 0) {
  return { ok: true, mode, phase, ddlCount, tables: 3, columns: 43, primaryKeys: 3, uniqueIndexes: 4, nonUniqueIndexes: 5 };
}
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw)) return "CURRENT_TIMESTAMP";
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}
async function closeQuietly(connection) { try { await connection?.close?.(); } catch {} }
async function exists(filePath) { try { await access(filePath, fsConstants.F_OK); return true; } catch { return false; } }
async function query(connection, sql, params) { return rows(await connection.query(sql, params)); }
async function execute(connection, sql, params) { return connection.execute(sql, params); }
function artifactPath(root, relativePath) {
  const base = path.resolve(root);
  const result = path.resolve(base, relativePath);
  if (!result.startsWith(`${base}${path.sep}`)) throw new Error("unsafe_artifact_path");
  return result;
}
function parseStatements(sql) {
  return sql.split(/\s*-->\s*statement-breakpoint\s*/g).map(item => item.trim()).filter(Boolean);
}
function sqlHasOnlyApprovedCreates(statements) {
  if (statements.length !== 8) return false;
  const forbidden = /\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE|REPLACE|RENAME|GRANT|REVOKE|REFERENCES|FOREIGN\s+KEY)\b/i;
  return statements.every((statement, position) => {
    if (forbidden.test(statement)) return false;
    if (position < 3) {
      const match = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`\s*\(/i);
      return Boolean(match && match[1] === TARGET_TABLES[position]);
    }
    const [name, table] = EXPECTED_INDEX_CREATION_ORDER[position - 3];
    const match = statement.match(/^CREATE\s+INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`\s*\(/i);
    return Boolean(match && match[1] === name && match[2] === table);
  });
}
function snapshotContract(snapshot) {
  const contract = {};
  for (const tableName of TARGET_TABLES) {
    const table = snapshot.tables?.[tableName];
    if (!table) throw new Error("snapshot_target_missing");
    const indexes = [
      ...Object.values(table.compositePrimaryKeys ?? {}).map(item => index("PRIMARY", true, item.columns, true)),
      ...Object.values(table.indexes ?? {}).map(item => index(item.name, Boolean(item.isUnique), item.columns)),
      ...Object.values(table.uniqueConstraints ?? {}).map(item => index(item.name, true, item.columns)),
    ].sort((a, b) => a.name.localeCompare(b.name));
    contract[tableName] = {
      columns: Object.values(table.columns ?? {}).map(item => column(item.name, normalized(item.type), !item.notNull, normalizeDefault(item.default), Boolean(item.autoincrement), Boolean(item.onUpdate))),
      indexes,
      foreignKeys: Object.values(table.foreignKeys ?? {}).map(item => item.name),
    };
  }
  return contract;
}
function expectedSnapshotContract() {
  return Object.fromEntries(Object.entries(EXPECTED_CONTRACT).map(([name, table]) => [name, {
    columns: table.columns.map(item => ({ ...item, type: normalized(item.type) })),
    indexes: table.indexes.slice().sort((a, b) => a.name.localeCompare(b.name)),
    foreignKeys: [],
  }]));
}
async function readHistoricalMarkers(root, journal) {
  const markers = [];
  for (const expected of HISTORY_MARKERS) {
    const entries = (journal.entries ?? []).filter(entry => entry.idx === expected.idx);
    if (entries.length !== 1 || entries[0].tag !== expected.tag || entries[0].when !== expected.when) throw new Error("historical_journal_anchor_invalid");
    markers.push({ ...expected, hash: sha256(await readFile(artifactPath(root, `drizzle/${expected.tag}.sql`))) });
  }
  return markers;
}
async function readVerifiedGitRevision(root) {
  const tracked = [SQL_ARTIFACT, SNAPSHOT_ARTIFACT, JOURNAL_ARTIFACT];
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const revision = String(stdout).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("git_revision_invalid");
    await execFileAsync("git", ["diff", "--quiet", "HEAD", "--", ...tracked], { cwd: root });
    for (const artifact of tracked) {
      const [local, versioned] = await Promise.all([
        readFile(artifactPath(root, artifact)),
        execFileAsync("git", ["show", `${revision}:${artifact}`], { cwd: root, encoding: "buffer", maxBuffer: 4 * 1024 * 1024 })
          .then(result => Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)),
      ]);
      if (!local.equals(versioned)) throw new Error("git_artifact_mismatch");
    }
    return revision;
  } catch { throw new Error("git_revision_or_artifact_identity_invalid"); }
}

/** Confere artefatos locais sem imprimir checksum, revisão ou SQL. */
export async function loadRestricted0139Artifacts({ root = projectRoot } = {}) {
  try {
    const [gitRevision, sqlBytes, snapshotBytes, journalBytes] = await Promise.all([
      readVerifiedGitRevision(root),
      readFile(artifactPath(root, SQL_ARTIFACT)),
      readFile(artifactPath(root, SNAPSHOT_ARTIFACT)),
      readFile(artifactPath(root, JOURNAL_ARTIFACT)),
    ]);
    const sqlHash = sha256(sqlBytes);
    if (sqlHash !== EXPECTED_SQL_SHA256) return { ok: false, reason: "artifact_identity_mismatch" };
    const statements = parseStatements(sqlBytes.toString("utf8"));
    if (!sqlHasOnlyApprovedCreates(statements)) return { ok: false, reason: "approved_sql_contract_invalid" };
    const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
    if (!same(snapshotContract(snapshot), expectedSnapshotContract())) return { ok: false, reason: "snapshot_contract_invalid" };
    const journal = JSON.parse(journalBytes.toString("utf8"));
    const marker = (journal.entries ?? []).filter(entry => entry.idx === 139);
    if (marker.length !== 1 || marker[0].tag !== MIGRATION_TAG || marker[0].when !== MIGRATION_TIMESTAMP || marker[0].version !== "5" || marker[0].breakpoints !== true || (journal.entries ?? []).filter(entry => entry.tag === MIGRATION_TAG).length !== 1) {
      return { ok: false, reason: "journal_0139_identity_invalid" };
    }
    return { ok: true, statements, sqlHash, history: await readHistoricalMarkers(root, journal), gitRevision };
  } catch { return { ok: false, reason: "artifact_unavailable_or_unreadable" }; }
}

function groupIndexes(indexRows) {
  const grouped = new Map();
  for (const row of indexRows) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? "");
    const name = String(row.INDEX_NAME ?? row.index_name ?? "");
    if (!table || !name) continue;
    const key = `${table}\u0000${name}`;
    const entry = grouped.get(key) ?? { table, name, unique: String(row.NON_UNIQUE ?? row.non_unique ?? "1") === "0", columns: [] };
    entry.columns.push({ sequence: Number(row.SEQ_IN_INDEX ?? row.seq_in_index ?? 0), name: String(row.COLUMN_NAME ?? row.column_name ?? ""), subPart: row.SUB_PART ?? row.sub_part ?? null });
    grouped.set(key, entry);
  }
  return [...grouped.values()].map(item => ({ ...item, columns: item.columns.sort((a, b) => a.sequence - b.sequence) })).sort((a, b) => `${a.table}:${a.name}`.localeCompare(`${b.table}:${b.name}`));
}
function normalizeColumns(columnRows) {
  return columnRows.map(row => ({
    table: String(row.TABLE_NAME ?? row.table_name ?? ""), position: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
    name: String(row.COLUMN_NAME ?? row.column_name ?? ""), type: normalized(row.COLUMN_TYPE ?? row.column_type),
    nullable: normalized(row.IS_NULLABLE ?? row.is_nullable) === "yes", autoincrement: /auto_increment/.test(normalized(row.EXTRA ?? row.extra)),
    default: normalizeDefault(row.COLUMN_DEFAULT ?? row.column_default), onUpdate: /on update/.test(normalized(row.EXTRA ?? row.extra)),
  })).sort((a, b) => a.table.localeCompare(b.table) || a.position - b.position);
}
async function readCatalog(connection) {
  const placeholders = TARGET_TABLES.map(() => "?").join(", ");
  const [allTables, columns, indexes] = await Promise.all([
    query(connection, "/* 0139:catalog-tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`"),
    query(connection, `/* 0139:catalog-columns */ SELECT \`TABLE_NAME\`, \`ORDINAL_POSITION\`, \`COLUMN_NAME\`, \`COLUMN_TYPE\`, \`IS_NULLABLE\`, \`COLUMN_DEFAULT\`, \`EXTRA\` FROM \`information_schema\`.\`columns\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`ORDINAL_POSITION\``, TARGET_TABLES),
    query(connection, `/* 0139:catalog-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\`, \`NON_UNIQUE\`, \`SEQ_IN_INDEX\`, \`COLUMN_NAME\`, \`SUB_PART\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\`, \`SEQ_IN_INDEX\``, TARGET_TABLES),
  ]);
  return {
    allTables: allTables.map(row => ({ name: String(row.TABLE_NAME ?? row.table_name ?? ""), type: String(row.TABLE_TYPE ?? row.table_type ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    columns: normalizeColumns(columns), indexes: groupIndexes(indexes),
  };
}
async function readHistoryLayout(connection) {
  return query(connection, "/* 0139:history-layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`");
}
async function readLedger(connection, locked = false) {
  return query(connection, `/* 0139:ledger-read${locked ? "-lock" : ""} */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`);
}
function historyLayoutIsExpected(layout) {
  const columns = new Map(layout.map(row => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row]));
  const id = columns.get("id"), hash = columns.get("hash"), createdAt = columns.get("created_at");
  return columns.size === 3 && Boolean(id && hash && createdAt && normalized(id.COLUMN_TYPE ?? id.column_type) === "bigint unsigned" && normalized(id.IS_NULLABLE ?? id.is_nullable) === "no" && /auto_increment/.test(normalized(id.EXTRA ?? id.extra)) && normalized(hash.COLUMN_TYPE ?? hash.column_type) === "text" && normalized(hash.IS_NULLABLE ?? hash.is_nullable) === "no" && normalized(createdAt.COLUMN_TYPE ?? createdAt.column_type) === "bigint" && ["yes", "no"].includes(normalized(createdAt.IS_NULLABLE ?? createdAt.is_nullable)));
}
function exactMarker(entries, marker) {
  const related = entries.filter(entry => String(entry.created_at) === String(marker.when) || String(entry.hash) === marker.hash);
  return related.length === 1 && String(related[0].created_at) === String(marker.when) && String(related[0].hash) === marker.hash;
}
function noMarker(entries, marker) { return !entries.some(entry => String(entry.created_at) === String(marker.when) || String(entry.hash) === marker.hash); }
function ledgerIs0139Baseline(ledger, artifacts) {
  const [m135, m136, m137, m138] = [135, 136, 137, 138].map(idx => artifacts.history.find(item => item.idx === idx));
  const m139 = { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash };
  return Boolean(m135 && m136 && m137 && m138) && ledger.length === EXPECTED_BASELINE_HISTORY_ROWS && noMarker(ledger, m135) && exactMarker(ledger, m136) && exactMarker(ledger, m137) && exactMarker(ledger, m138) && noMarker(ledger, m139) && ledger.every(entry => {
    const value = String(entry.created_at ?? ""); const timestamp = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp < MIGRATION_TIMESTAMP;
  });
}
async function readIdentity(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    const databaseName = String(identity?.databaseName ?? "").trim();
    const serverVersion = String(identity?.serverVersion ?? "").trim();
    const certificateFingerprint = String(identity?.certificateFingerprint ?? "").trim().toLowerCase();
    if (identity?.tlsVerified !== true || normalized(identity?.serverProduct) !== "tidb" || !databaseName || !serverVersion || !/^[0-9a-f]{64}$/.test(certificateFingerprint)) return null;
    return { tlsVerified: true, serverProduct: "tidb", databaseName, serverVersion, certificateFingerprint };
  } catch { return null; }
}

/** Factory opcional para mysql2/promise explicitamente injetado. */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions }) {
  if (!mysql || typeof mysql.createConnection !== "function" || !connectionOptions || typeof connectionOptions !== "object" || !String(connectionOptions.database ?? "").trim() || !String(connectionOptions.host ?? "").trim() || !connectionOptions.ssl || !connectionOptions.ssl.ca || connectionOptions.ssl.rejectUnauthorized !== true || connectionOptions.ssl.verifyIdentity !== true || String(connectionOptions.ssl.servername ?? "").trim() !== String(connectionOptions.host).trim()) {
    throw new Error("injected_mysql2_tls_configuration_invalid");
  }
  const options = { ...connectionOptions, multipleStatements: false, ssl: { ...connectionOptions.ssl, rejectUnauthorized: true, verifyIdentity: true } };
  return { async connect() {
    let raw;
    try {
      raw = await mysql.createConnection(options);
      const socket = raw?.connection?.stream, certificate = socket?.getPeerCertificate?.(true);
      if (socket?.encrypted !== true || socket?.authorized !== true || !certificate || Object.keys(certificate).length === 0) throw new Error("injected_mysql2_tls_peer_unverified");
      return {
        async query(sql, params) { const [result] = await raw.query(sql, params); return { rows: Array.isArray(result) ? result : [] }; },
        async execute(sql, params) { const [result] = await raw.execute(sql, params); return { rows: Array.isArray(result) ? result : [], affectedRows: Number(result?.affectedRows ?? 0) }; },
        async getIdentity() {
          const active = raw?.connection?.stream, peer = active?.getPeerCertificate?.(true);
          if (active?.encrypted !== true || active?.authorized !== true || !peer || Object.keys(peer).length === 0) return { tlsVerified: false };
          const [result] = await raw.query("/* 0139:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`");
          const row = result?.[0] ?? {}, version = String(row.server_version ?? "");
          const certificateFingerprint = String(peer?.fingerprint256 ?? "").replace(/:/g, "").toLowerCase();
          return { tlsVerified: true, serverProduct: /tidb/i.test(version) ? "tidb" : "other", databaseName: String(row.database_name ?? ""), serverVersion: version, certificateFingerprint };
        },
        async close() { await raw.end(); },
      };
    } catch (error) {
      try { await raw?.end?.(); } catch {}
      if (String(error?.message ?? "") === "injected_mysql2_tls_peer_unverified") throw error;
      throw new Error("injected_mysql2_connection_failed");
    }
  } };
}
function catalogWithoutTargets(catalog) { return { allTables: catalog.allTables.filter(item => !TARGET_TABLES.includes(item.name)), columns: catalog.columns.filter(item => !TARGET_TABLES.includes(item.table)), indexes: catalog.indexes.filter(item => !TARGET_TABLES.includes(item.table)) }; }
function targetNames(catalog) { return catalog.allTables.filter(item => TARGET_TABLES.includes(item.name)).map(item => item.name).sort(); }
function actualColumns(catalog, table) { return catalog.columns.filter(item => item.table === table).map(({ table: ignored, position, ...item }) => item); }
function actualIndexes(catalog, table) { return catalog.indexes.filter(item => item.table === table).map(item => ({ name: item.name, unique: item.unique, columns: item.columns.map(columnItem => columnItem.name), primary: item.name === "PRIMARY", prefixes: item.columns.map(columnItem => columnItem.subPart) })).sort((a, b) => a.name.localeCompare(b.name)); }
function expectedIndexesAtStep(table, statementCount) {
  const explicit = new Set(EXPECTED_INDEX_CREATION_ORDER.slice(0, Math.max(0, statementCount - 3)).map(([name]) => name));
  return EXPECTED_CONTRACT[table].indexes.filter(item => item.primary || item.unique || explicit.has(item.name)).slice().sort((a, b) => a.name.localeCompare(b.name));
}
function validateStatementState(catalog, baseline, statementCount) {
  const present = TARGET_TABLES.slice(0, Math.min(statementCount, 3)).sort();
  if (!same(targetNames(catalog), present) || !same(catalogWithoutTargets(catalog), catalogWithoutTargets(baseline))) return false;
  return present.every(table => same(actualColumns(catalog, table), EXPECTED_CONTRACT[table].columns) && same(actualIndexes(catalog, table), expectedIndexesAtStep(table, statementCount)));
}
async function targetTablesAreEmpty(connection) {
  for (const table of TARGET_TABLES) { const result = await query(connection, `/* 0139:empty-table */ SELECT COUNT(*) AS \`row_count\` FROM \`${table}\``); if (result.length !== 1 || Number(result[0].row_count) !== 0) return false; }
  return true;
}
function finalPhysicalContractIsExact(catalog, baseline) {
  if (!same(targetNames(catalog), TARGET_TABLES.slice().sort()) || !same(catalogWithoutTargets(catalog), catalogWithoutTargets(baseline))) return false;
  return TARGET_TABLES.every(table => same(actualColumns(catalog, table), EXPECTED_CONTRACT[table].columns) && same(actualIndexes(catalog, table), EXPECTED_CONTRACT[table].indexes.slice().sort((a, b) => a.name.localeCompare(b.name))));
}
async function inspectPreflight(connection, artifacts) {
  const [identity, historyLayout, ledger, catalog] = await Promise.all([readIdentity(connection), readHistoryLayout(connection), readLedger(connection), readCatalog(connection)]);
  return { identity, historyLayout, ledger, catalog, safe: Boolean(identity) && historyLayoutIsExpected(historyLayout) && targetNames(catalog).length === 0 && ledgerIs0139Baseline(ledger, artifacts) };
}
async function inspectAfterDdl(connection, artifacts, baseline) {
  const [catalog, ledger, empty] = await Promise.all([readCatalog(connection), readLedger(connection), targetTablesAreEmpty(connection)]);
  return { catalog, ledger, physicalOk: finalPhysicalContractIsExact(catalog, baseline.catalog) && empty, ledgerUnchanged: same(ledger, baseline.ledger) && ledgerIs0139Baseline(ledger, artifacts) };
}
function safeGate(gate, now) { const issuedAt = Date.parse(String(gate?.issuedAt ?? "")), expiresAt = Date.parse(String(gate?.expiresAt ?? "")); return Boolean(gate && typeof gate === "object" && SAFE_REFERENCE.test(String(gate.reference ?? "")) && Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now && expiresAt > now); }
function canonicalTargetIsValid(target) { return Boolean(target && typeof target === "object" && SAFE_REFERENCE.test(String(target.reference ?? "")) && normalized(target.serverProduct) === "tidb" && String(target.databaseName ?? "").trim() && String(target.serverVersion ?? "").trim() && /^[0-9a-f]{64}$/.test(String(target.certificateFingerprint ?? "").trim().toLowerCase())); }
function sameCanonicalTarget(left, right) { return canonicalTargetIsValid(left) && canonicalTargetIsValid(right) && String(left.reference) === String(right.reference) && normalized(left.serverProduct) === normalized(right.serverProduct) && String(left.databaseName) === String(right.databaseName) && String(left.serverVersion) === String(right.serverVersion) && String(left.certificateFingerprint).toLowerCase() === String(right.certificateFingerprint).toLowerCase(); }
function identityMatchesCanonicalTarget(identity, target) { return Boolean(identity) && canonicalTargetIsValid(target) && normalized(identity.serverProduct) === normalized(target.serverProduct) && String(identity.databaseName) === String(target.databaseName) && String(identity.serverVersion) === String(target.serverVersion) && String(identity.certificateFingerprint).toLowerCase() === String(target.certificateFingerprint).toLowerCase(); }
function approvalIsExact(gate, now, executorDigest, artifacts) { return safeGate(gate, now) && normalized(gate.approvedBy) === "sergio" && gate.approvalRecordedBySergio === true && String(gate.reviewScope ?? "") === "executor-0139" && String(gate.approvedExecutorDigest ?? "") === executorDigest && String(gate.approvedSqlDigest ?? "") === artifacts.sqlHash && String(gate.approvedGitRevision ?? "") === artifacts.gitRevision && String(gate.artifactsRevision ?? "") === ARTIFACTS_REVISION; }
function backupGateIsScoped(gate, now) { return safeGate(gate, now) && String(gate.appliesTo ?? "") === MIGRATION_TAG && ((gate.kind === "exception" && normalized(gate.approvedBy) === "sergio" && gate.exceptionAuthorized === true) || (gate.kind === "proof" && gate.proofVerified === true)); }
async function gatesAreCurrent(options, now, executorDigest, artifacts) {
  const gates = options.gates;
  if (!gates || typeof options.verifyExternalGates !== "function" || !REQUIRED_SIGNOFFS.every(name => gates.signoffs?.[name] === true) || !approvalIsExact(gates.review, now, executorDigest, artifacts) || !approvalIsExact(gates.authorization, now, executorDigest, artifacts) || !safeGate(gates.window, now) || !backupGateIsScoped(gates.backup, now) || !safeGate(gates.target, now) || !canonicalTargetIsValid(gates.target)) return false;
  try {
    const verified = await options.verifyExternalGates({ migrationTag: MIGRATION_TAG, migrationTimestamp: MIGRATION_TIMESTAMP, artifactsRevision: ARTIFACTS_REVISION, sqlDigest: artifacts.sqlHash, gitRevision: artifacts.gitRevision, executorDigest, canonicalTarget: gates.target, gates });
    return Boolean(verified && typeof verified === "object" && verified.canonical === "restricted-0139-v1" && verified.authorization === true && verified.review === true && verified.window === true && (verified.backup === "exception" || verified.backup === "proof") && verified.artifactsRevision === ARTIFACTS_REVISION && verified.sqlDigest === artifacts.sqlHash && verified.gitRevision === artifacts.gitRevision && verified.executorDigest === executorDigest && verified.migrationTag === MIGRATION_TAG && sameCanonicalTarget(verified.canonicalTarget, gates.target));
  } catch { return false; }
}
async function ensurePrivateParent(filePath) { const directory = path.dirname(filePath); await mkdir(directory, { recursive: true, mode: 0o700 }); if (((await stat(directory)).mode & 0o077) !== 0) throw new Error("private_parent_permissions"); }
async function createExclusiveState(filePath) { await ensurePrivateParent(filePath); const handle = await open(filePath, "wx", 0o600); try { await handle.writeFile(JSON.stringify({ kind: "restricted-0139", phase: "ddl-started", createdAt: new Date().toISOString() }), "utf8"); await handle.sync(); } finally { await handle.close(); } await chmod(filePath, 0o600); }
class PrivateCapture {
  constructor(key, handle) { this.key = key; this.handle = handle; }
  static async create(filePath, key) { if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("capture_key_invalid"); await ensurePrivateParent(filePath); const handle = await open(filePath, "wx", 0o600); try { await handle.writeFile("0139-private-aes256gcm-v1\n", "utf8"); await handle.sync(); await chmod(filePath, 0o600); return new PrivateCapture(Buffer.from(key), handle); } catch (error) { try { await handle.close(); } catch {} throw error; } }
  async append(label, metadata) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv), plaintext = Buffer.from(JSON.stringify({ label, metadata }), "utf8"), encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]); await this.handle.writeFile(`${JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") })}\n`, "utf8"); await this.handle.sync(); }
  async close() { try { await this.handle.close(); } finally { this.key.fill(0); } }
}
async function guardedJournalInsert(connection, artifacts, baseline) {
  let begun = false, commitAttempted = false;
  try {
    await execute(connection, "/* 0139:journal-begin */ BEGIN PESSIMISTIC"); begun = true;
    await query(connection, "/* 0139:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE");
    const current = await readLedger(connection, true);
    if (!same(current, baseline.ledger) || !ledgerIs0139Baseline(current, artifacts)) throw new Error("ledger_changed_before_journal");
    const inserted = await execute(connection, "/* 0139:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [artifacts.sqlHash, MIGRATION_TIMESTAMP]);
    if (Number(inserted?.affectedRows) !== 1) throw new Error("journal_insert_guard");
    const reread = await readLedger(connection, true), marker = reread.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash);
    if (marker.length !== 1 || !same(reread.filter(entry => !marker.includes(entry)), baseline.ledger)) throw new Error("journal_reread_guard");
    commitAttempted = true; await execute(connection, "/* 0139:journal-commit */ COMMIT"); return { ok: true };
  } catch {
    if (commitAttempted) return { ok: false, reason: "journal_commit_uncertain" };
    if (begun) try { await execute(connection, "/* 0139:journal-rollback */ ROLLBACK"); } catch {}
    return { ok: false, reason: "journal_guard_failed" };
  }
}
async function finalValidation(connection, artifacts, baseline) { const post = await inspectAfterDdl(connection, artifacts, baseline); const marker = post.ledger.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash); return post.physicalOk && marker.length === 1 && same(post.ledger.filter(entry => !marker.includes(entry)), baseline.ledger); }

/**
 * `preflight` somente lê. `apply` executa exclusivamente as oito declarações
 * versionadas, em ordem, para na primeira falha e não tenta retomar/repetir DDL.
 */
export async function runRestricted0139(options = {}) {
  const mode = options.mode ?? "preflight", root = options.root ?? projectRoot;
  if (mode !== "preflight" && mode !== "apply") return failure("mode", "invalid_mode");
  const artifacts = await loadRestricted0139Artifacts({ root });
  if (!artifacts.ok) return failure("identity", artifacts.reason);
  const canonicalTarget = mode === "apply" ? options.gates?.target : options.canonicalTarget;
  if (!canonicalTargetIsValid(canonicalTarget)) return failure("target", "canonical_target_required");
  if (!options.connectionFactory || typeof options.connectionFactory.connect !== "function") return failure("connection", "connection_factory_required");
  let executorDigest;
  if (mode === "apply") {
    if (!options.stateFile || !options.privateCaptureFile || !options.privateCaptureKey) return failure("apply-gates", "private_state_and_capture_required");
    if (await exists(options.stateFile) || await exists(options.privateCaptureFile)) return failure("apply-gates", "state_or_capture_exists");
    try { executorDigest = sha256(await readFile(artifactPath(root, EXECUTOR_ARTIFACT))); } catch { return failure("apply-gates", "executor_identity_unavailable"); }
    if (!(await gatesAreCurrent(options, options.now ?? Date.now(), executorDigest, artifacts))) return failure("apply-gates", "external_gates_missing_or_unverified");
  }
  const usedConnections = new Set(); let requiredIdentity, first, second, capture;
  const connectIndependent = async purpose => {
    const connection = await options.connectionFactory.connect(purpose);
    if (!connection || usedConnections.has(connection)) throw new Error("connection_not_independent");
    const identity = await readIdentity(connection);
    if (!identity || !identityMatchesCanonicalTarget(identity, canonicalTarget) || (requiredIdentity && !same(identity, requiredIdentity))) { await closeQuietly(connection); throw new Error("connection_identity_mismatch"); }
    usedConnections.add(connection); requiredIdentity ??= identity; return connection;
  };
  try {
    first = await connectIndependent("0139-preflight-a"); second = await connectIndependent("0139-preflight-b");
    const [preflightA, preflightB] = await Promise.all([inspectPreflight(first, artifacts), inspectPreflight(second, artifacts)]);
    if (!preflightA.safe || !preflightB.safe || !same(preflightA.historyLayout, preflightB.historyLayout) || !same(preflightA.ledger, preflightB.ledger) || !same(preflightA.catalog, preflightB.catalog)) return failure("preflight", "preflight_not_stable_or_not_safe");
    if (mode === "preflight") return report("preflight", "preflight-read-only");
    try { capture = await PrivateCapture.create(options.privateCaptureFile, options.privateCaptureKey); await capture.append("preflight", { first: preflightA, second: preflightB }); await createExclusiveState(options.stateFile); } catch { return failure("capture", "private_capture_or_state_unavailable"); }
    let ddl, ddlCount = 0;
    try {
      ddl = await connectIndependent("0139-ddl");
      for (const [position, statement] of artifacts.statements.entries()) {
        try { await execute(ddl, statement); } catch { try { await capture.append(`ddl-failure-${ddlCount + 1}`, { catalog: await readCatalog(ddl) }); } catch {} return failure("ddl", "statement_failed_no_retry", ddlCount); }
        ddlCount += 1; const catalog = await readCatalog(ddl); await capture.append(`ddl-${ddlCount}`, catalog);
        if (!validateStatementState(catalog, preflightA.catalog, position + 1)) return failure("ddl-validation", "statement_object_validation_failed", ddlCount);
      }
    } catch { return failure("ddl", "ddl_connection_or_validation_failed", ddlCount); } finally { await closeQuietly(ddl); }
    let afterDdl;
    try { afterDdl = await connectIndependent("0139-post-ddl-independent"); const post = await inspectAfterDdl(afterDdl, artifacts, preflightA); await capture.append("post-ddl", post); if (!post.physicalOk || !post.ledgerUnchanged) return failure("post-ddl", "physical_contract_or_ledger_deviation", ddlCount); } catch { return failure("post-ddl", "independent_validation_failed", ddlCount); } finally { await closeQuietly(afterDdl); }
    let journal;
    try { journal = await connectIndependent("0139-journal"); const fresh = await inspectAfterDdl(journal, artifacts, preflightA); if (!fresh.physicalOk || !fresh.ledgerUnchanged) return failure("journal", "fresh_physical_or_ledger_check_failed", ddlCount); await capture.append("journal-precheck", fresh); const result = await guardedJournalInsert(journal, artifacts, preflightA); if (!result.ok) return failure("journal", result.reason, ddlCount); } catch { return failure("journal", "journal_connection_failed", ddlCount); } finally { await closeQuietly(journal); }
    let finalConnection;
    try { finalConnection = await connectIndependent("0139-final-independent"); if (!(await finalValidation(finalConnection, artifacts, preflightA))) return failure("final", "final_contract_or_journal_deviation", ddlCount); } catch { return failure("final", "final_independent_validation_failed", ddlCount); } finally { await closeQuietly(finalConnection); }
    return report("apply", "complete", 8);
  } catch { return failure("preflight", "preflight_connection_or_metadata_failure"); } finally { await closeQuietly(first); await closeQuietly(second); await capture?.close(); }
}
function localIdentification() { return { ok: true, mode: "identification-only", phase: "no-database", ddlCount: 0, tables: 3, columns: 43, primaryKeys: 3, uniqueIndexes: 4, nonUniqueIndexes: 5 }; }
async function main() { const requestedApply = process.argv.slice(2).includes("--apply"); const result = requestedApply ? { ...localIdentification(), ok: false, phase: "dependency_injection_required", reason: "cli_cannot_apply" } : localIdentification(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.ok ? 0 : 2; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stdout.write('{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0}\n'); process.exitCode = 2; });
