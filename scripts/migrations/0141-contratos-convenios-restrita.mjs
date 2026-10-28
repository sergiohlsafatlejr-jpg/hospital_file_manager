#!/usr/bin/env node
/**
 * Executor restrito da migração Drizzle 0141 de documentos de contratos e convênios.
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

export const MIGRATION_TAG = "0141_woozy_union_jack";
export const MIGRATION_TIMESTAMP = 1793195385533;
export const ARTIFACTS_REVISION = MIGRATION_TAG;
export const EXPECTED_SQL_SHA256 =
  "3365b6ab7df64244fbf42e0913cd020ab1998f4df02bfbee87fcae6cd2e2bf61";
export const TARGET_TABLES = ["contratos_convenios_documentos"];
export const BASELINE_TABLES = ["prontuario_pdf_anexo_eventos", "prontuario_pdf_anexos"];

const SQL_ARTIFACT = "drizzle/0141_woozy_union_jack.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0141_snapshot.json";
const BASELINE_SQL_ARTIFACT = "drizzle/0140_bumpy_quasimodo.sql";
const BASELINE_SNAPSHOT_ARTIFACT = "drizzle/meta/0140_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const EXECUTOR_ARTIFACT = "scripts/migrations/0141-contratos-convenios-restrita.mjs";
const BASELINE_SQL_SHA256 = "0d6528324ee9e7e994614a7f481fb995d16c51515e52b15bfce5bdbea95702a0";
const HISTORY_MARKERS = [
  { idx: 135, tag: "0135_fuzzy_wolf_cub", when: 1791922720742 },
  { idx: 136, tag: "0136_lame_dreadnoughts", when: 1792003825434 },
  { idx: 137, tag: "0137_retornos_recursos_cassi", when: 1793047237100 },
  { idx: 138, tag: "0138_known_blink", when: 1793104873640 },
  { idx: 139, tag: "0139_past_toro", when: 1793119956230 },
];
const EXPECTED_BASELINE_HISTORY_ROWS = 101;
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

// Contrato físico normativo: objetos permitidos não são inferidos do banco.
const EXPECTED_CONTRACT = {
  prontuario_pdf_anexo_eventos: {
    columns: [
      column("id", "bigint", false, null, true),
      column("anexo_id", "bigint"),
      column("estabelecimento_id", "int"),
      column("convenio_id", "int"),
      column("arquivo_hospital_id", "int"),
      column("numero_conta", "varchar(100)"),
      column("numero_lote", "varchar(100)"),
      column("competencia", "varchar(20)"),
      column("tipo", "enum('upload','download','inativacao')"),
      column("usuario_id", "int"),
      column("resultado", "enum('sucesso','falha')"),
      column("criado_em", "timestamp", false, "CURRENT_TIMESTAMP"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("idx_pront_pdf_evento_anexo", false, ["anexo_id", "id"]),
      index("idx_pront_pdf_evento_escopo", false, ["estabelecimento_id", "convenio_id", "arquivo_hospital_id", "numero_conta", "numero_lote", "competencia", "id"]),
    ],
  },
  prontuario_pdf_anexos: {
    columns: [
      column("id", "bigint", false, null, true),
      column("estabelecimento_id", "int"),
      column("convenio_id", "int"),
      column("arquivo_hospital_id", "int"),
      column("numero_conta", "varchar(100)"),
      column("numero_lote", "varchar(100)"),
      column("competencia", "varchar(20)"),
      column("tipo", "enum('prontuario_pdf')"),
      column("nome_arquivo", "varchar(255)"),
      column("tamanho_bytes", "int"),
      column("sha256", "varchar(64)"),
      column("storage_key", "varchar(512)"),
      column("ativo", "enum('sim','nao')", false, "sim"),
      column("criado_por", "int"),
      column("criado_em", "timestamp", false, "CURRENT_TIMESTAMP"),
      column("inativado_por", "int", true),
      column("inativado_em", "timestamp", true),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("idx_pront_pdf_escopo_ativo", false, ["estabelecimento_id", "convenio_id", "arquivo_hospital_id", "numero_conta", "numero_lote", "competencia", "ativo", "id"]),
      index("idx_pront_pdf_arquivo_hospitalar", false, ["arquivo_hospital_id"]),
    ],
  },
  contratos_convenios_documentos: {
    columns: [
      column("id", "int", false, null, true),
      column("contratoId", "int"),
      column("estabelecimentoId", "int"),
      column("nomeArquivo", "varchar(255)"),
      column("storageKey", "varchar(512)"),
      column("mimeType", "varchar(100)", false, "application/pdf"),
      column("tamanhoBytes", "int"),
      column("sha256", "varchar(64)"),
      column("paginas", "int", true),
      column("status", "enum('processando','concluido','ocr_necessario','erro')", false, "processando"),
      column("textoExtraido", "longtext", true),
      column("pontosImportantes", "json", true),
      column("erroProcessamento", "text", true),
      column("criadoPor", "int"),
      column("createdAt", "timestamp", false, "CURRENT_TIMESTAMP"),
      column("updatedAt", "timestamp", false, "CURRENT_TIMESTAMP", false, true),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("uq_contratos_conv_doc_contrato_hash", true, ["contratoId", "sha256"]),
      index("idx_contratos_conv_doc_contrato", false, ["contratoId", "createdAt"]),
      index("idx_contratos_conv_doc_estabelecimento", false, ["estabelecimentoId", "createdAt"]),
    ],
  },
};
const EXPECTED_INDEX_CREATION_ORDER = [
  ["idx_contratos_conv_doc_contrato", "contratos_convenios_documentos"],
  ["idx_contratos_conv_doc_estabelecimento", "contratos_convenios_documentos"],
];

function normalized(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
function stable(value) {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  if (typeof value === "bigint") return value.toString();
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function rows(result) { return Array.isArray(result?.rows) ? result.rows : []; }
function failure(phase, reason, ddlCount = 0) { return { ok: false, phase, reason, ddlCount }; }
function report(mode, phase, ddlCount = 0) {
  return { ok: true, mode, phase, ddlCount, tables: 1, columns: 16, primaryKeys: 1, uniqueIndexes: 1, nonUniqueIndexes: 2 };
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
  const base = path.resolve(root), result = path.resolve(base, relativePath);
  if (!result.startsWith(`${base}${path.sep}`)) throw new Error("unsafe_artifact_path");
  return result;
}
function parseStatements(sql) {
  return sql.split(/\s*-->\s*statement-breakpoint\s*/g).map(item => item.trim()).filter(Boolean);
}
function sqlHasOnlyApprovedCreates(statements) {
  if (statements.length !== 3) return false;
  const forbidden = /\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE(?!\s+CURRENT_TIMESTAMP\b)|REPLACE|RENAME|GRANT|REVOKE|REFERENCES|FOREIGN\s+KEY)\b/i;
  return statements.every((statement, position) => {
    if (forbidden.test(statement)) return false;
    if (position === 0) {
      const match = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`\s*\(/i);
      return Boolean(match && match[1] === TARGET_TABLES[0]);
    }
    const [name, table] = EXPECTED_INDEX_CREATION_ORDER[position - 1];
    const match = statement.match(/^CREATE\s+INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`\s*\(/i);
    return Boolean(match && match[1] === name && match[2] === table);
  });
}
function snapshotContract(snapshot, tableNames) {
  const contract = {};
  for (const tableName of tableNames) {
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
function expectedSnapshotContract(tableNames) {
  return Object.fromEntries(tableNames.map(name => [name, {
    columns: EXPECTED_CONTRACT[name].columns.map(item => ({ ...item, type: normalized(item.type) })),
    indexes: EXPECTED_CONTRACT[name].indexes.slice().sort((a, b) => a.name.localeCompare(b.name)),
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
const VERIFIED_ARTIFACTS = [
  SQL_ARTIFACT,
  SNAPSHOT_ARTIFACT,
  BASELINE_SQL_ARTIFACT,
  BASELINE_SNAPSHOT_ARTIFACT,
  JOURNAL_ARTIFACT,
  ...HISTORY_MARKERS.map(item => `drizzle/${item.tag}.sql`),
];
async function readVerifiedGitRevision(root) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const revision = String(stdout).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("git_revision_invalid");
    await execFileAsync("git", ["diff", "--quiet", "HEAD", "--", ...VERIFIED_ARTIFACTS], { cwd: root });
    for (const artifact of VERIFIED_ARTIFACTS) {
      const [local, versioned] = await Promise.all([
        readFile(artifactPath(root, artifact)),
        execFileAsync("git", ["show", `${revision}:${artifact}`], { cwd: root, encoding: "buffer", maxBuffer: 8 * 1024 * 1024 })
          .then(result => Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)),
      ]);
      if (!local.equals(versioned)) throw new Error("git_artifact_mismatch");
    }
    return revision;
  } catch { throw new Error("git_revision_or_artifact_identity_invalid"); }
}

/** Confere artefatos locais sem imprimir checksum, revisão ou SQL. */
export async function loadRestricted0141Artifacts({ root = projectRoot } = {}) {
  try {
    const [gitRevision, sqlBytes, snapshotBytes, baselineSqlBytes, baselineSnapshotBytes, journalBytes] = await Promise.all([
      readVerifiedGitRevision(root),
      readFile(artifactPath(root, SQL_ARTIFACT)),
      readFile(artifactPath(root, SNAPSHOT_ARTIFACT)),
      readFile(artifactPath(root, BASELINE_SQL_ARTIFACT)),
      readFile(artifactPath(root, BASELINE_SNAPSHOT_ARTIFACT)),
      readFile(artifactPath(root, JOURNAL_ARTIFACT)),
    ]);
    const sqlHash = sha256(sqlBytes);
    if (sqlHash !== EXPECTED_SQL_SHA256 || sha256(baselineSqlBytes) !== BASELINE_SQL_SHA256) return { ok: false, reason: "artifact_identity_mismatch" };
    const statements = parseStatements(sqlBytes.toString("utf8"));
    if (!sqlHasOnlyApprovedCreates(statements)) return { ok: false, reason: "approved_sql_contract_invalid" };
    const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
    if (!same(snapshotContract(snapshot, TARGET_TABLES), expectedSnapshotContract(TARGET_TABLES))) return { ok: false, reason: "snapshot_contract_invalid" };
    const baselineSnapshot = JSON.parse(baselineSnapshotBytes.toString("utf8"));
    if (!same(snapshotContract(baselineSnapshot, BASELINE_TABLES), expectedSnapshotContract(BASELINE_TABLES))) return { ok: false, reason: "baseline_snapshot_contract_invalid" };
    const journal = JSON.parse(journalBytes.toString("utf8"));
    const m140 = (journal.entries ?? []).filter(entry => entry.idx === 140);
    const m141 = (journal.entries ?? []).filter(entry => entry.idx === 141);
    if (m140.length !== 1 || m140[0].tag !== "0140_bumpy_quasimodo" || m140[0].when !== 1793135284537 || m140[0].version !== "5" || m140[0].breakpoints !== true || m141.length !== 1 || m141[0].tag !== MIGRATION_TAG || m141[0].when !== MIGRATION_TIMESTAMP || m141[0].version !== "5" || m141[0].breakpoints !== true || (journal.entries ?? []).filter(entry => entry.tag === MIGRATION_TAG).length !== 1) {
      return { ok: false, reason: "journal_0141_identity_invalid" };
    }
    return { ok: true, statements, sqlHash, history: await readHistoricalMarkers(root, journal), baselineSqlHash: BASELINE_SQL_SHA256, gitRevision };
  } catch { return { ok: false, reason: "artifact_unavailable_or_unreadable" }; }
}

function groupIndexes(indexRows) {
  const grouped = new Map();
  for (const row of indexRows) {
    const table = String(row.TABLE_NAME ?? row.table_name ?? ""), name = String(row.INDEX_NAME ?? row.index_name ?? "");
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
  const catalogTables = [...BASELINE_TABLES, ...TARGET_TABLES], placeholders = catalogTables.map(() => "?").join(", ");
  const [allTables, columns, indexes] = await Promise.all([
    query(connection, "/* 0141:catalog-tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`"),
    query(connection, `/* 0141:catalog-columns */ SELECT \`TABLE_NAME\`, \`ORDINAL_POSITION\`, \`COLUMN_NAME\`, \`COLUMN_TYPE\`, \`IS_NULLABLE\`, \`COLUMN_DEFAULT\`, \`EXTRA\` FROM \`information_schema\`.\`columns\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`ORDINAL_POSITION\``, catalogTables),
    query(connection, `/* 0141:catalog-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\`, \`NON_UNIQUE\`, \`SEQ_IN_INDEX\`, \`COLUMN_NAME\`, \`SUB_PART\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\`, \`SEQ_IN_INDEX\``, catalogTables),
  ]);
  return {
    allTables: allTables.map(row => ({ name: String(row.TABLE_NAME ?? row.table_name ?? ""), type: String(row.TABLE_TYPE ?? row.table_type ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    columns: normalizeColumns(columns), indexes: groupIndexes(indexes),
  };
}
async function readHistoryLayout(connection) {
  return query(connection, "/* 0141:history-layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`");
}
async function readLedger(connection, locked = false) {
  return query(connection, `/* 0141:ledger-read${locked ? "-lock" : ""} */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`);
}
function historyLayoutIsExpected(layout) {
  const columns = new Map(layout.map(row => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row]));
  const id = columns.get("id"), hash = columns.get("hash"), createdAt = columns.get("created_at");
  return columns.size === 3 && Boolean(id && hash && createdAt) && normalized(id.COLUMN_TYPE ?? id.column_type) === "bigint unsigned" && normalized(id.IS_NULLABLE ?? id.is_nullable) === "no" && /auto_increment/.test(normalized(id.EXTRA ?? id.extra)) && normalized(hash.COLUMN_TYPE ?? hash.column_type) === "text" && normalized(hash.IS_NULLABLE ?? hash.is_nullable) === "no" && normalized(createdAt.COLUMN_TYPE ?? createdAt.column_type) === "bigint" && ["yes", "no"].includes(normalized(createdAt.IS_NULLABLE ?? createdAt.is_nullable));
}
function exactMarker(entries, marker) {
  const related = entries.filter(entry => String(entry.created_at) === String(marker.when) || String(entry.hash) === marker.hash);
  return related.length === 1 && String(related[0].created_at) === String(marker.when) && String(related[0].hash) === marker.hash;
}
function noMarker(entries, marker) { return !entries.some(entry => String(entry.created_at) === String(marker.when) || String(entry.hash) === marker.hash); }
function ledgerIs0141Baseline(ledger, artifacts) {
  const markers = [135, 136, 137, 138, 139].map(idx => artifacts.history.find(item => item.idx === idx));
  const m140 = { when: 1793135284537, hash: artifacts.baselineSqlHash }, m141 = { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash };
  return markers.every(Boolean) && ledger.length === EXPECTED_BASELINE_HISTORY_ROWS && noMarker(ledger, markers[0]) && markers.slice(1).every(marker => exactMarker(ledger, marker)) && exactMarker(ledger, m140) && noMarker(ledger, m141) && ledger.every(entry => {
    const value = String(entry.created_at ?? ""), timestamp = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp < MIGRATION_TIMESTAMP;
  });
}
async function readIdentity(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    const databaseName = String(identity?.databaseName ?? "").trim(), serverVersion = String(identity?.serverVersion ?? "").trim(), certificateFingerprint = String(identity?.certificateFingerprint ?? "").trim().toLowerCase();
    if (identity?.tlsVerified !== true || normalized(identity?.serverProduct) !== "tidb" || !databaseName || !serverVersion || !/^[0-9a-f]{64}$/.test(certificateFingerprint)) return null;
    return { tlsVerified: true, serverProduct: "tidb", databaseName, serverVersion, certificateFingerprint };
  } catch { return null; }
}

/** Factory opcional para mysql2/promise explicitamente injetado. */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions }) {
  if (!mysql || typeof mysql.createConnection !== "function" || !connectionOptions || typeof connectionOptions !== "object" || !String(connectionOptions.database ?? "").trim() || !String(connectionOptions.host ?? "").trim() || !connectionOptions.ssl || !connectionOptions.ssl.ca || connectionOptions.ssl.rejectUnauthorized !== true || connectionOptions.ssl.verifyIdentity !== true || String(connectionOptions.ssl.servername ?? "").trim() !== String(connectionOptions.host).trim()) throw new Error("injected_mysql2_tls_configuration_invalid");
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
          const [result] = await raw.query("/* 0141:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`");
          const row = result?.[0] ?? {}, version = String(row.server_version ?? ""), certificateFingerprint = String(peer?.fingerprint256 ?? "").replace(/:/g, "").toLowerCase();
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
function baselineNames(catalog) { return catalog.allTables.filter(item => BASELINE_TABLES.includes(item.name)).map(item => item.name).sort(); }
function actualColumns(catalog, table) { return catalog.columns.filter(item => item.table === table).map(({ table: ignored, position, ...item }) => item); }
function actualIndexes(catalog, table) { return catalog.indexes.filter(item => item.table === table).map(item => ({ name: item.name, unique: item.unique, columns: item.columns.map(columnItem => columnItem.name), primary: item.name === "PRIMARY", prefixes: item.columns.map(columnItem => columnItem.subPart) })).sort((a, b) => a.name.localeCompare(b.name)); }
function expectedIndexesAtStep(statementCount) {
  const explicit = new Set(EXPECTED_INDEX_CREATION_ORDER.slice(0, Math.max(0, statementCount - 1)).map(([name]) => name));
  return EXPECTED_CONTRACT[TARGET_TABLES[0]].indexes.filter(item => item.primary || item.unique || explicit.has(item.name)).slice().sort((a, b) => a.name.localeCompare(b.name));
}
function baselinePhysicalContractIsExact(catalog) {
  if (!same(baselineNames(catalog), BASELINE_TABLES.slice().sort())) return false;
  return BASELINE_TABLES.every(table => same(actualColumns(catalog, table), EXPECTED_CONTRACT[table].columns) && same(actualIndexes(catalog, table), EXPECTED_CONTRACT[table].indexes.slice().sort((a, b) => a.name.localeCompare(b.name))));
}
function targetObjectsAbsent(catalog) { return targetNames(catalog).length === 0 && catalog.columns.every(item => !TARGET_TABLES.includes(item.table)) && catalog.indexes.every(item => !TARGET_TABLES.includes(item.table)); }
function validateStatementState(catalog, baseline, statementCount) {
  if (!same(targetNames(catalog), TARGET_TABLES.slice().sort()) || !same(catalogWithoutTargets(catalog), catalogWithoutTargets(baseline)) || !baselinePhysicalContractIsExact(catalog)) return false;
  const table = TARGET_TABLES[0];
  return same(actualColumns(catalog, table), EXPECTED_CONTRACT[table].columns) && same(actualIndexes(catalog, table), expectedIndexesAtStep(statementCount));
}
async function targetTableIsEmpty(connection) {
  const result = await query(connection, `/* 0141:empty-table */ SELECT COUNT(*) AS \`row_count\` FROM \`${TARGET_TABLES[0]}\``);
  return result.length === 1 && Number(result[0].row_count) === 0;
}
function finalPhysicalContractIsExact(catalog, baseline) {
  if (!same(targetNames(catalog), TARGET_TABLES.slice().sort()) || !same(catalogWithoutTargets(catalog), catalogWithoutTargets(baseline)) || !baselinePhysicalContractIsExact(catalog)) return false;
  const table = TARGET_TABLES[0];
  return same(actualColumns(catalog, table), EXPECTED_CONTRACT[table].columns) && same(actualIndexes(catalog, table), EXPECTED_CONTRACT[table].indexes.slice().sort((a, b) => a.name.localeCompare(b.name)));
}
async function inspectPreflight(connection, artifacts) {
  const [identity, historyLayout, ledger, catalog] = await Promise.all([readIdentity(connection), readHistoryLayout(connection), readLedger(connection), readCatalog(connection)]);
  return { identity, historyLayout, ledger, catalog, safe: Boolean(identity) && historyLayoutIsExpected(historyLayout) && targetObjectsAbsent(catalog) && baselinePhysicalContractIsExact(catalog) && ledgerIs0141Baseline(ledger, artifacts) };
}
async function inspectAfterDdl(connection, artifacts, baseline) {
  const [catalog, ledger, empty] = await Promise.all([readCatalog(connection), readLedger(connection), targetTableIsEmpty(connection)]);
  return { catalog, ledger, physicalOk: finalPhysicalContractIsExact(catalog, baseline.catalog) && empty, ledgerUnchanged: same(ledger, baseline.ledger) && ledgerIs0141Baseline(ledger, artifacts) };
}
function safeGate(gate, now) { const issuedAt = Date.parse(String(gate?.issuedAt ?? "")), expiresAt = Date.parse(String(gate?.expiresAt ?? "")); return Boolean(gate && typeof gate === "object" && SAFE_REFERENCE.test(String(gate.reference ?? "")) && Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now && expiresAt > now); }
function canonicalTargetIsValid(target) { return Boolean(target && typeof target === "object" && SAFE_REFERENCE.test(String(target.reference ?? "")) && normalized(target.serverProduct) === "tidb" && String(target.databaseName ?? "").trim() && String(target.serverVersion ?? "").trim() && /^[0-9a-f]{64}$/.test(String(target.certificateFingerprint ?? "").trim().toLowerCase())); }
function sameCanonicalTarget(left, right) { return canonicalTargetIsValid(left) && canonicalTargetIsValid(right) && String(left.reference) === String(right.reference) && normalized(left.serverProduct) === normalized(right.serverProduct) && String(left.databaseName) === String(right.databaseName) && String(left.serverVersion) === String(right.serverVersion) && String(left.certificateFingerprint).toLowerCase() === String(right.certificateFingerprint).toLowerCase(); }
function identityMatchesCanonicalTarget(identity, target) { return Boolean(identity) && canonicalTargetIsValid(target) && normalized(identity.serverProduct) === normalized(target.serverProduct) && String(identity.databaseName) === String(target.databaseName) && String(identity.serverVersion) === String(target.serverVersion) && String(identity.certificateFingerprint).toLowerCase() === String(target.certificateFingerprint).toLowerCase(); }
function approvalIsExact(gate, now, executorDigest, artifacts) { return safeGate(gate, now) && normalized(gate.approvedBy) === "sergio" && gate.approvalRecordedBySergio === true && String(gate.reviewScope ?? "") === "executor-0141" && String(gate.approvedExecutorDigest ?? "") === executorDigest && String(gate.approvedSqlDigest ?? "") === artifacts.sqlHash && String(gate.approvedGitRevision ?? "") === artifacts.gitRevision && String(gate.artifactsRevision ?? "") === ARTIFACTS_REVISION; }
function backupGateIsScoped(gate, now) { return safeGate(gate, now) && String(gate.appliesTo ?? "") === MIGRATION_TAG && ((gate.kind === "exception" && normalized(gate.approvedBy) === "sergio" && gate.exceptionAuthorized === true) || (gate.kind === "proof" && gate.proofVerified === true)); }
async function gatesAreCurrent(options, now, executorDigest, artifacts) {
  const gates = options.gates;
  if (!gates || typeof options.verifyExternalGates !== "function" || !REQUIRED_SIGNOFFS.every(name => gates.signoffs?.[name] === true) || !approvalIsExact(gates.review, now, executorDigest, artifacts) || !approvalIsExact(gates.authorization, now, executorDigest, artifacts) || !safeGate(gates.window, now) || !backupGateIsScoped(gates.backup, now) || !safeGate(gates.target, now) || !canonicalTargetIsValid(gates.target)) return false;
  try {
    const verified = await options.verifyExternalGates({ migrationTag: MIGRATION_TAG, migrationTimestamp: MIGRATION_TIMESTAMP, artifactsRevision: ARTIFACTS_REVISION, sqlDigest: artifacts.sqlHash, gitRevision: artifacts.gitRevision, executorDigest, canonicalTarget: gates.target, gates });
    return Boolean(verified && typeof verified === "object" && verified.canonical === "restricted-0141-v1" && verified.authorization === true && verified.review === true && verified.window === true && (verified.backup === "exception" || verified.backup === "proof") && verified.artifactsRevision === ARTIFACTS_REVISION && verified.sqlDigest === artifacts.sqlHash && verified.gitRevision === artifacts.gitRevision && verified.executorDigest === executorDigest && verified.migrationTag === MIGRATION_TAG && sameCanonicalTarget(verified.canonicalTarget, gates.target));
  } catch { return false; }
}
async function ensurePrivateParent(filePath) { const directory = path.dirname(filePath); await mkdir(directory, { recursive: true, mode: 0o700 }); if (((await stat(directory)).mode & 0o077) !== 0) throw new Error("private_parent_permissions"); }
async function createExclusiveState(filePath) { await ensurePrivateParent(filePath); const handle = await open(filePath, "wx", 0o600); try { await handle.writeFile(JSON.stringify({ kind: "restricted-0141", phase: "ddl-started", createdAt: new Date().toISOString() }), "utf8"); await handle.sync(); } finally { await handle.close(); } await chmod(filePath, 0o600); }
class PrivateCapture {
  constructor(key, handle) { this.key = key; this.handle = handle; }
  static async create(filePath, key) { if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("capture_key_invalid"); await ensurePrivateParent(filePath); const handle = await open(filePath, "wx", 0o600); try { await handle.writeFile("0141-private-aes256gcm-v1\n", "utf8"); await handle.sync(); await chmod(filePath, 0o600); return new PrivateCapture(Buffer.from(key), handle); } catch (error) { try { await handle.close(); } catch {} throw error; } }
  async append(label, metadata) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv), plaintext = Buffer.from(JSON.stringify({ label, metadata }), "utf8"), encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]); await this.handle.writeFile(`${JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") })}\n`, "utf8"); await this.handle.sync(); }
  async close() { try { await this.handle.close(); } finally { this.key.fill(0); } }
}
function captureSummary(phase, extra = {}) { return { phase, ...extra }; }
async function guardedJournalInsert(connection, artifacts, baseline) {
  let begun = false, commitAttempted = false;
  try {
    await execute(connection, "/* 0141:journal-begin */ BEGIN PESSIMISTIC"); begun = true;
    await query(connection, "/* 0141:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE");
    const current = await readLedger(connection, true);
    if (!same(current, baseline.ledger) || !ledgerIs0141Baseline(current, artifacts)) throw new Error("ledger_changed_before_journal");
    const inserted = await execute(connection, "/* 0141:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [artifacts.sqlHash, MIGRATION_TIMESTAMP]);
    if (Number(inserted?.affectedRows) !== 1) throw new Error("journal_insert_guard");
    const reread = await readLedger(connection, true), marker = reread.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash);
    if (marker.length !== 1 || !same(reread.filter(entry => !marker.includes(entry)), baseline.ledger)) throw new Error("journal_reread_guard");
    commitAttempted = true; await execute(connection, "/* 0141:journal-commit */ COMMIT"); return { ok: true };
  } catch {
    if (commitAttempted) return { ok: false, reason: "journal_commit_uncertain" };
    if (begun) try { await execute(connection, "/* 0141:journal-rollback */ ROLLBACK"); } catch {}
    return { ok: false, reason: "journal_guard_failed" };
  }
}
async function finalValidation(connection, artifacts, baseline) {
  const post = await inspectAfterDdl(connection, artifacts, baseline), marker = post.ledger.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash);
  return post.physicalOk && marker.length === 1 && same(post.ledger.filter(entry => !marker.includes(entry)), baseline.ledger);
}

/**
 * `preflight` somente lê. `apply` executa exclusivamente as três declarações
 * versionadas, em ordem, para na primeira falha e não tenta retomar/repetir DDL.
 */
export async function runRestricted0141(options = {}) {
  const mode = options.mode ?? "preflight", root = options.root ?? projectRoot;
  if (mode !== "preflight" && mode !== "apply") return failure("mode", "invalid_mode");
  const artifacts = await loadRestricted0141Artifacts({ root });
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
    first = await connectIndependent("0141-preflight-a"); second = await connectIndependent("0141-preflight-b");
    const [preflightA, preflightB] = await Promise.all([inspectPreflight(first, artifacts), inspectPreflight(second, artifacts)]);
    if (!preflightA.safe || !preflightB.safe || !same(preflightA.historyLayout, preflightB.historyLayout) || !same(preflightA.ledger, preflightB.ledger) || !same(preflightA.catalog, preflightB.catalog)) return failure("preflight", "preflight_not_stable_or_not_safe");
    if (mode === "preflight") return report("preflight", "preflight-read-only");
    try { capture = await PrivateCapture.create(options.privateCaptureFile, options.privateCaptureKey); await capture.append("preflight", captureSummary("preflight", { stable: true })); await createExclusiveState(options.stateFile); } catch { return failure("capture", "private_capture_or_state_unavailable"); }
    let ddl, ddlCount = 0;
    try {
      ddl = await connectIndependent("0141-ddl");
      for (const [position, statement] of artifacts.statements.entries()) {
        try { await execute(ddl, statement); } catch { try { await capture.append(`ddl-failure-${ddlCount + 1}`, captureSummary("ddl-failure", { attempted: ddlCount + 1 })); } catch {} return failure("ddl", "statement_failed_no_retry", ddlCount); }
        ddlCount += 1;
        const catalog = await readCatalog(ddl);
        await capture.append(`ddl-${ddlCount}`, captureSummary("ddl", { statement: ddlCount, stable: validateStatementState(catalog, preflightA.catalog, position + 1) }));
        if (!validateStatementState(catalog, preflightA.catalog, position + 1)) return failure("ddl-validation", "statement_object_validation_failed", ddlCount);
      }
    } catch { return failure("ddl", "ddl_connection_or_validation_failed", ddlCount); } finally { await closeQuietly(ddl); }
    let afterDdl;
    try { afterDdl = await connectIndependent("0141-post-ddl-independent"); const post = await inspectAfterDdl(afterDdl, artifacts, preflightA); await capture.append("post-ddl", captureSummary("post-ddl", { physicalOk: post.physicalOk, ledgerUnchanged: post.ledgerUnchanged })); if (!post.physicalOk || !post.ledgerUnchanged) return failure("post-ddl", "physical_contract_or_ledger_deviation", ddlCount); } catch { return failure("post-ddl", "independent_validation_failed", ddlCount); } finally { await closeQuietly(afterDdl); }
    let journal;
    try { journal = await connectIndependent("0141-journal"); const fresh = await inspectAfterDdl(journal, artifacts, preflightA); if (!fresh.physicalOk || !fresh.ledgerUnchanged) return failure("journal", "fresh_physical_or_ledger_check_failed", ddlCount); await capture.append("journal-precheck", captureSummary("journal-precheck", { physicalOk: fresh.physicalOk, ledgerUnchanged: fresh.ledgerUnchanged })); const result = await guardedJournalInsert(journal, artifacts, preflightA); if (!result.ok) return failure("journal", result.reason, ddlCount); } catch { return failure("journal", "journal_connection_failed", ddlCount); } finally { await closeQuietly(journal); }
    let finalConnection;
    try { finalConnection = await connectIndependent("0141-final-independent"); if (!(await finalValidation(finalConnection, artifacts, preflightA))) return failure("final", "final_contract_or_journal_deviation", ddlCount); } catch { return failure("final", "final_independent_validation_failed", ddlCount); } finally { await closeQuietly(finalConnection); }
    return report("apply", "complete", 3);
  } catch { return failure("preflight", "preflight_connection_or_metadata_failure"); } finally { await closeQuietly(first); await closeQuietly(second); await capture?.close(); }
}
function localIdentification() { return { ok: true, mode: "identification-only", phase: "no-database", ddlCount: 0, tables: 1, columns: 16, primaryKeys: 1, uniqueIndexes: 1, nonUniqueIndexes: 2 }; }
async function main() { const requestedApply = process.argv.slice(2).includes("--apply"); const result = requestedApply ? { ...localIdentification(), ok: false, phase: "dependency_injection_required", reason: "cli_cannot_apply" } : localIdentification(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.ok ? 0 : 2; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stdout.write('{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0}\n'); process.exitCode = 2; });
