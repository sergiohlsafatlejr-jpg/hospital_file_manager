#!/usr/bin/env node
/**
 * Executor restrito da migração Drizzle 0142 para a estrutura de importação XML.
 *
 * Não lê DATABASE_URL, .env ou credenciais; não descobre conexão; não chama
 * db:migrate/db:push. A aplicação exige factory TLS injetada, gates externos
 * canônicos e artefatos versionados idênticos à revisão Git atestada.
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

export const MIGRATION_TAG = "0142_large_krista_starr";
export const MIGRATION_TIMESTAMP = 1793227973987;
export const ARTIFACTS_REVISION = MIGRATION_TAG;
export const EXPECTED_SQL_SHA256 = "99d2ef60373ea435b3890ad1afffc81af26a3f9a94ffae58a5eee6cd909d1fa8";
export const TARGET_TABLES = ["xml_importacao_itens", "xml_importacao_lotes"];
export const BASELINE_TABLES = [
  "prontuario_pdf_anexo_eventos",
  "prontuario_pdf_anexos",
  "contratos_convenios_documentos",
  "contas_convenio_itens",
  "contas_convenio_resumo",
  "conta_contexto_medico_fontes",
];

const SQL_ARTIFACT = "drizzle/0142_large_krista_starr.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0142_snapshot.json";
const BASELINE_0140_SQL_ARTIFACT = "drizzle/0140_bumpy_quasimodo.sql";
const BASELINE_0140_SNAPSHOT_ARTIFACT = "drizzle/meta/0140_snapshot.json";
const BASELINE_0141_SQL_ARTIFACT = "drizzle/0141_woozy_union_jack.sql";
const BASELINE_0141_SNAPSHOT_ARTIFACT = "drizzle/meta/0141_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const EXECUTOR_ARTIFACT = "scripts/migrations/0142-xml-importacao-lote-restrita.mjs";
const HISTORY_MARKERS = [
  { idx: 135, tag: "0135_fuzzy_wolf_cub", when: 1791922720742, hash: "740e15104f3e635b64a43c5b1442ed911a1dfd449d9e17f1676ad0b36d4a5433" },
  { idx: 136, tag: "0136_lame_dreadnoughts", when: 1792003825434, hash: "fa04666153d17dfc9250a8a5e542dcf5733d914e07347679fdb8daacdc3ba3e9" },
  { idx: 137, tag: "0137_retornos_recursos_cassi", when: 1793047237100, hash: "21bc8ef9a027bb375358933e88141c80f4851844f4da2985c55a1492588147d5" },
  { idx: 138, tag: "0138_known_blink", when: 1793104873640, hash: "3aa1d04b10172c1f35f838f2cdf6acd4a8f487b7b94f3ac5e5308e3c5c129ffa" },
  { idx: 139, tag: "0139_past_toro", when: 1793119956230, hash: "57e8010fc1c95371bceb85da478fcb418b4785dd807bbd07498ea795059decc5" },
];
const FIXED_ARTIFACT_HASHES = {
  [SQL_ARTIFACT]: EXPECTED_SQL_SHA256,
  [SNAPSHOT_ARTIFACT]: "830725572836c9b3bc585c059479c34ec239f9f56810ad8a73251b785f2b7ade",
  [BASELINE_0140_SQL_ARTIFACT]: "0d6528324ee9e7e994614a7f481fb995d16c51515e52b15bfce5bdbea95702a0",
  [BASELINE_0140_SNAPSHOT_ARTIFACT]: "b67fed9dbd321cd2b3c851284c28e3645f36788bd42716a3067a11e6dbb1deb0",
  [BASELINE_0141_SQL_ARTIFACT]: "3365b6ab7df64244fbf42e0913cd020ab1998f4df02bfbee87fcae6cd2e2bf61",
  [BASELINE_0141_SNAPSHOT_ARTIFACT]: "530c5be59ea0ba342fa9c4e9a01550c7c91704e99b3f5bdf5a4fcf7f025b73a8",
  [JOURNAL_ARTIFACT]: "1e308bad7a4e3b37ea07208b2684c5efbc129a62e6d417d36ded892c5118e48b",
  ...Object.fromEntries(HISTORY_MARKERS.map(marker => [`drizzle/${marker.tag}.sql`, marker.hash])),
};
const VERIFIED_ARTIFACTS = Object.keys(FIXED_ARTIFACT_HASHES);
const EXPECTED_BASELINE_HISTORY_ROWS = 102;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
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

// Cada digest cobre uma declaração completa, inclusive formatação e ordem.
const APPROVED_STATEMENT_HASHES = [
  "209b3191dbed1e57a54ec339e2e9f41e68f0d5fb9087320feb0495dd8160df17",
  "7c2c5f9467c14a1816f628751fd3f3aa222abe12a8f9b2d6912a9508a3fa35bc",
  "b52a7948af7aed0cb12f3952f6673e365978bbb76c5c2f48cdb594a82a1c90ed",
  "5bcc451e602262610cd80abe4ef6dacc8110499ae98a6658c011eb911fac939a",
  "06ed710097d379fb75bfd2e0f662d34d008012a18e0960d484cc65fe80fa4a0c",
  "e82e1c481aa2fb8f363d90e5ace538caaa54f4733198641f2f2246f740c4080b",
  "8c8c9db982513e0488cbb58238d4af6259edffeaf6a6ca73724fb73618882107",
  "af6e1ce513cfc535c051577a3c3abb373dccf513ca61bf6cfb07c6a6da6416d3",
  "d753b259ce3bbb717a6cd608ec67f9f273cac8c9ebd1e700de6bf2656b0042bf",
  "4b48858fe4f5b453a7d52616195dcd3fb60fa6383424b9456f2fd2669e10ef72",
  "366fc8359bb1f140c57a6a2b102b43f6bec33d4d4858f0e337bd0b62a2ead95c",
  "1b3a6b5ce76984ae25ccb5b2e5ce43941b40f0fa73b14d31c159ab16a520b8b8",
  "dc5c5c4051f52f9ed64caa51fc306836ffd2590b9cd079cba723e6a5deb86755",
  "a8de6cda1b7374a8b5764b8472faca957ddf38cee7d9d72d1f63149b2bd4b761",
];
const APPROVED_STATEMENT_KINDS = [
  "CREATE TABLE", "CREATE TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE",
  "CREATE INDEX", "CREATE INDEX", "CREATE INDEX", "CREATE INDEX", "CREATE INDEX", "CREATE INDEX",
];
const COLUMN_ADDITIONS = [
  { step: 3, table: "contas_convenio_itens", column: "loteImportacaoId" },
  { step: 4, table: "contas_convenio_resumo", column: "arquivoHospitalId" },
  { step: 5, table: "contas_convenio_resumo", column: "loteImportacaoId" },
  { step: 6, table: "conta_contexto_medico_fontes", column: "lote_importacao_id" },
  { step: 7, table: "conta_contexto_medico_fontes", column: "versao_snapshot_hospitalar" },
];
const INDEX_ADDITIONS = [
  { step: 8, table: "contas_convenio_resumo", index: "uq_ccr_xml_snapshot_scope" },
  { step: 9, table: "xml_importacao_itens", index: "idx_xml_imp_item_lote_tipo_estado" },
  { step: 10, table: "xml_importacao_itens", index: "idx_xml_imp_item_arquivo" },
  { step: 11, table: "xml_importacao_lotes", index: "idx_xml_imp_lote_claim" },
  { step: 12, table: "xml_importacao_lotes", index: "idx_xml_imp_lote_escopo_historico" },
  { step: 13, table: "contas_convenio_itens", index: "idx_cci_xml_snapshot_scope" },
  { step: 14, table: "conta_contexto_medico_fontes", index: "idx_ccm_fonte_lote_importacao" },
];
const EXPECTED_NEW_TABLE_SHAPES = {
  xml_importacao_itens: { columns: 22, indexes: ["PRIMARY", "uq_xml_imp_item_lote_ordem", "uq_xml_imp_item_lote_hash", "idx_xml_imp_item_lote_tipo_estado", "idx_xml_imp_item_arquivo"] },
  xml_importacao_lotes: { columns: 27, indexes: ["PRIMARY", "uq_xml_imp_lote_escopo_idempotencia", "uq_xml_imp_lote_escopo_manifesto", "idx_xml_imp_lote_claim", "idx_xml_imp_lote_escopo_historico"] },
};

function normalized(value) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function stable(value) {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  if (typeof value === "bigint") return value.toString();
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function rows(result) { return Array.isArray(result?.rows) ? result.rows : []; }
function failure(phase, reason, ddlCount = 0) { return { ok: false, phase, reason, ddlCount }; }
function report(mode, phase, ddlCount = 0) {
  return { ok: true, mode, phase, ddlCount, tables: 2, alteredTables: 3, addedColumns: 5, primaryKeys: 2, uniqueIndexes: 5, nonUniqueIndexes: 6 };
}
function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (/^\(?now\(\)\)?$/i.test(raw) || /^current_timestamp(?:\(\))?$/i.test(raw)) return "CURRENT_TIMESTAMP";
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}
function column(name, type, nullable = false, defaultValue = null, autoincrement = false, onUpdate = false) {
  return { name, type: normalized(type), nullable, default: defaultValue, autoincrement, onUpdate };
}
function index(name, unique, columns, primary = false) {
  return { name, unique, columns, primary, prefixes: columns.map(() => null) };
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
function parseStatements(sql) { return sql.split(/\s*-->\s*statement-breakpoint\s*/g).map(item => item.trim()).filter(Boolean); }
function exactApprovedSql(statements) {
  if (statements.length !== APPROVED_STATEMENT_HASHES.length) return false;
  return statements.every((statement, position) => {
    const expectedKind = APPROVED_STATEMENT_KINDS[position];
    // O digest da declaração integral é a allowlist normativa: qualquer DML,
    // DROP, TRUNCATE ou alteração de texto necessariamente diverge do hash.
    return statement.startsWith(expectedKind) && sha256(Buffer.from(statement, "utf8")) === APPROVED_STATEMENT_HASHES[position];
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
      columns: Object.values(table.columns ?? {}).map(item => column(item.name, item.type, !item.notNull, normalizeDefault(item.default), Boolean(item.autoincrement), Boolean(item.onUpdate))),
      indexes,
      foreignKeys: Object.keys(table.foreignKeys ?? {}).sort(),
    };
  }
  return contract;
}
function tableIndex(contract, tableName, indexName) {
  const found = contract[tableName]?.indexes.find(item => item.name === indexName);
  if (!found) throw new Error("snapshot_index_missing");
  return clone(found);
}
function tableColumn(contract, tableName, columnName) {
  const found = contract[tableName]?.columns.find(item => item.name === columnName);
  if (!found) throw new Error("snapshot_column_missing");
  return clone(found);
}
function exactlyExpectedSnapshotDelta(baseline, target) {
  try {
    if (!TARGET_TABLES.every(name => target[name]?.foreignKeys.length === 0)) return false;
    for (const [name, shape] of Object.entries(EXPECTED_NEW_TABLE_SHAPES)) {
      if (!target[name] || target[name].columns.length !== shape.columns || !same(target[name].indexes.map(item => item.name).sort(), shape.indexes.slice().sort())) return false;
    }
    for (const addition of COLUMN_ADDITIONS) {
      const before = baseline[addition.table], after = target[addition.table];
      if (!before || !after || before.columns.some(item => item.name === addition.column)) return false;
      const added = tableColumn(target, addition.table, addition.column);
      if (!added.name || !added.type || added.foreignKeys) return false;
      if (!before.columns.every(item => same(item, tableColumn(target, addition.table, item.name)))) return false;
    }
    for (const addition of INDEX_ADDITIONS) {
      const before = baseline[addition.table], after = target[addition.table];
      if (!after || (before && before.indexes.some(item => item.name === addition.index))) return false;
      const added = tableIndex(target, addition.table, addition.index);
      if (!added.name || added.columns.length === 0) return false;
      if (before && !before.indexes.every(item => same(item, tableIndex(target, addition.table, item.name)))) return false;
    }
    return true;
  } catch { return false; }
}
function buildPhysicalContracts(snapshot0141, snapshot0142) {
  const baseline = snapshotContract(snapshot0141, BASELINE_TABLES);
  const target = snapshotContract(snapshot0142, [...BASELINE_TABLES, ...TARGET_TABLES]);
  if (!exactlyExpectedSnapshotDelta(baseline, target)) throw new Error("snapshot_delta_invalid");
  const final = clone(baseline);
  for (const table of TARGET_TABLES) {
    final[table] = { columns: clone(target[table].columns), indexes: clone(target[table].indexes.filter(item => item.primary || item.unique)), foreignKeys: [] };
  }
  for (const addition of COLUMN_ADDITIONS) final[addition.table].columns.push(tableColumn(target, addition.table, addition.column));
  for (const addition of INDEX_ADDITIONS) final[addition.table].indexes.push(tableIndex(target, addition.table, addition.index));
  for (const contract of Object.values(final)) contract.indexes.sort((left, right) => left.name.localeCompare(right.name));
  return { baseline, target, final };
}
function contractAtStep(contracts, statementCount) {
  const expected = clone(contracts.baseline);
  if (statementCount >= 1) expected[TARGET_TABLES[0]] = { columns: clone(contracts.target[TARGET_TABLES[0]].columns), indexes: clone(contracts.target[TARGET_TABLES[0]].indexes.filter(item => item.primary || item.unique)), foreignKeys: [] };
  if (statementCount >= 2) expected[TARGET_TABLES[1]] = { columns: clone(contracts.target[TARGET_TABLES[1]].columns), indexes: clone(contracts.target[TARGET_TABLES[1]].indexes.filter(item => item.primary || item.unique)), foreignKeys: [] };
  for (const addition of COLUMN_ADDITIONS.filter(item => item.step <= statementCount)) expected[addition.table].columns.push(tableColumn(contracts.target, addition.table, addition.column));
  for (const addition of INDEX_ADDITIONS.filter(item => item.step <= statementCount)) expected[addition.table].indexes.push(tableIndex(contracts.target, addition.table, addition.index));
  for (const contract of Object.values(expected)) contract.indexes.sort((left, right) => left.name.localeCompare(right.name));
  return expected;
}
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
function exactJournalEntry(journal, expected) {
  const entries = (journal.entries ?? []).filter(entry => entry.idx === expected.idx);
  return entries.length === 1 && entries[0].tag === expected.tag && entries[0].when === expected.when && entries[0].version === "5" && entries[0].breakpoints === true;
}
function journalIsExpected(journal) {
  return journal?.version === "7" && journal?.dialect === "mysql" &&
    HISTORY_MARKERS.every(marker => exactJournalEntry(journal, marker)) &&
    exactJournalEntry(journal, { idx: 140, tag: "0140_bumpy_quasimodo", when: 1793135284537 }) &&
    exactJournalEntry(journal, { idx: 141, tag: "0141_woozy_union_jack", when: 1793195385533 }) &&
    exactJournalEntry(journal, { idx: 142, tag: MIGRATION_TAG, when: MIGRATION_TIMESTAMP }) &&
    (journal.entries ?? []).filter(entry => entry.tag === MIGRATION_TAG).length === 1;
}

/** Confere artefatos locais sem imprimir checksum, revisão, nomes de alvo ou SQL. */
export async function loadRestricted0142Artifacts({ root = projectRoot } = {}) {
  try {
    const [gitRevision, ...bytes] = await Promise.all([readVerifiedGitRevision(root), ...VERIFIED_ARTIFACTS.map(item => readFile(artifactPath(root, item)))]);
    const files = Object.fromEntries(VERIFIED_ARTIFACTS.map((item, position) => [item, bytes[position]]));
    if (!VERIFIED_ARTIFACTS.every(item => sha256(files[item]) === FIXED_ARTIFACT_HASHES[item])) return { ok: false, reason: "artifact_identity_mismatch" };
    const statements = parseStatements(files[SQL_ARTIFACT].toString("utf8"));
    if (!exactApprovedSql(statements)) return { ok: false, reason: "approved_sql_contract_invalid" };
    const snapshot0140 = JSON.parse(files[BASELINE_0140_SNAPSHOT_ARTIFACT].toString("utf8"));
    const snapshot0141 = JSON.parse(files[BASELINE_0141_SNAPSHOT_ARTIFACT].toString("utf8"));
    const snapshot0142 = JSON.parse(files[SNAPSHOT_ARTIFACT].toString("utf8"));
    const contract0140 = snapshotContract(snapshot0140, BASELINE_TABLES.slice(0, 2));
    const contract0141 = snapshotContract(snapshot0141, BASELINE_TABLES.slice(0, 2));
    if (!same(contract0140, contract0141)) return { ok: false, reason: "baseline_0140_0141_contract_invalid" };
    const contracts = buildPhysicalContracts(snapshot0141, snapshot0142);
    const journal = JSON.parse(files[JOURNAL_ARTIFACT].toString("utf8"));
    if (!journalIsExpected(journal)) return { ok: false, reason: "journal_0142_identity_invalid" };
    return { ok: true, statements, sqlHash: EXPECTED_SQL_SHA256, gitRevision, history: HISTORY_MARKERS.map(item => ({ ...item })), contracts };
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
    query(connection, "/* 0142:catalog-tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`"),
    query(connection, `/* 0142:catalog-columns */ SELECT \`TABLE_NAME\`, \`ORDINAL_POSITION\`, \`COLUMN_NAME\`, \`COLUMN_TYPE\`, \`IS_NULLABLE\`, \`COLUMN_DEFAULT\`, \`EXTRA\` FROM \`information_schema\`.\`columns\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`ORDINAL_POSITION\``, catalogTables),
    query(connection, `/* 0142:catalog-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\`, \`NON_UNIQUE\`, \`SEQ_IN_INDEX\`, \`COLUMN_NAME\`, \`SUB_PART\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\`, \`SEQ_IN_INDEX\``, catalogTables),
  ]);
  return {
    allTables: allTables.map(row => ({ name: String(row.TABLE_NAME ?? row.table_name ?? ""), type: String(row.TABLE_TYPE ?? row.table_type ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    columns: normalizeColumns(columns), indexes: groupIndexes(indexes),
  };
}
async function readHistoryLayout(connection) {
  return query(connection, "/* 0142:history-layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`");
}
async function readLedger(connection, locked = false) {
  return query(connection, `/* 0142:ledger-read${locked ? "-lock" : ""} */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`);
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
function ledgerIs0142Baseline(ledger, artifacts) {
  const historical = artifacts.history;
  const m140 = { when: 1793135284537, hash: FIXED_ARTIFACT_HASHES[BASELINE_0140_SQL_ARTIFACT] };
  const m141 = { when: 1793195385533, hash: FIXED_ARTIFACT_HASHES[BASELINE_0141_SQL_ARTIFACT] };
  const m142 = { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash };
  return ledger.length === EXPECTED_BASELINE_HISTORY_ROWS && noMarker(ledger, historical[0]) && historical.slice(1).every(marker => exactMarker(ledger, marker)) && exactMarker(ledger, m140) && exactMarker(ledger, m141) && noMarker(ledger, m142) && ledger.every(entry => {
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
          const [result] = await raw.query("/* 0142:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`");
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
function actualColumns(catalog, table) { return catalog.columns.filter(item => item.table === table).map(({ table: ignored, position, ...item }) => item); }
function actualIndexes(catalog, table) { return catalog.indexes.filter(item => item.table === table).map(item => ({ name: item.name, unique: item.unique, columns: item.columns.map(columnItem => columnItem.name), primary: item.name === "PRIMARY", prefixes: item.columns.map(columnItem => columnItem.subPart) })).sort((a, b) => a.name.localeCompare(b.name)); }
function countNamed(items, name) { return items.filter(item => item.name === name).length; }
function hasExactlyOneBaseTable(catalog, table) { return catalog.allTables.filter(item => item.name === table && item.type === "BASE TABLE").length === 1; }
function baselineNamesArePresent(catalog, contracts) {
  return BASELINE_TABLES.every(table => {
    const expected = contracts.baseline[table];
    return hasExactlyOneBaseTable(catalog, table) &&
      expected.columns.every(item => countNamed(actualColumns(catalog, table), item.name) === 1) &&
      expected.indexes.every(item => countNamed(actualIndexes(catalog, table), item.name) === 1);
  });
}
function deltaIsAbsent(catalog) {
  return TARGET_TABLES.every(table => !catalog.allTables.some(item => item.name === table)) &&
    COLUMN_ADDITIONS.every(item => countNamed(actualColumns(catalog, item.table), item.column) === 0) &&
    INDEX_ADDITIONS.every(item => countNamed(actualIndexes(catalog, item.table), item.index) === 0);
}
function targetTableMatches(catalog, expected, table, created) {
  const actualTables = catalog.allTables.filter(item => item.name === table);
  if (!created) return actualTables.length === 0 && actualColumns(catalog, table).length === 0 && actualIndexes(catalog, table).length === 0;
  return actualTables.length === 1 && actualTables[0].type === "BASE TABLE" &&
    same(actualColumns(catalog, table), expected[table].columns) &&
    same(actualIndexes(catalog, table), expected[table].indexes);
}
function deltaMatchesStep(catalog, contracts, statementCount) {
  for (const addition of COLUMN_ADDITIONS) {
    const present = actualColumns(catalog, addition.table).filter(item => item.name === addition.column);
    if (addition.step > statementCount ? present.length !== 0 : present.length !== 1 || !same(present[0], tableColumn(contracts.target, addition.table, addition.column))) return false;
  }
  for (const addition of INDEX_ADDITIONS) {
    const present = actualIndexes(catalog, addition.table).filter(item => item.name === addition.index);
    if (addition.step > statementCount ? present.length !== 0 : present.length !== 1 || !same(present[0], tableIndex(contracts.target, addition.table, addition.index))) return false;
  }
  return true;
}
function preflightCatalogIsSafe(catalog, contracts) {
  // O baseline é histórico: exige os objetos e nomes atestados, sem equiparar
  // sua ordem, tipos/defaults ou metadados extras ao snapshot antigo.
  return baselineNamesArePresent(catalog, contracts) && deltaIsAbsent(catalog);
}
function catalogMatchesStep(catalog, baselineCatalog, contracts, statementCount) {
  const expected = contractAtStep(contracts, statementCount);
  const expectedAllTables = baselineCatalog.allTables.concat(
    statementCount >= 1 ? [{ name: TARGET_TABLES[0], type: "BASE TABLE" }] : [],
    statementCount >= 2 ? [{ name: TARGET_TABLES[1], type: "BASE TABLE" }] : [],
  ).sort((a, b) => a.name.localeCompare(b.name));
  if (!same(catalog.allTables, expectedAllTables) || !baselineNamesArePresent(catalog, contracts)) return false;
  return targetTableMatches(catalog, expected, TARGET_TABLES[0], statementCount >= 1) &&
    targetTableMatches(catalog, expected, TARGET_TABLES[1], statementCount >= 2) &&
    deltaMatchesStep(catalog, contracts, statementCount);
}
async function targetTablesAreEmpty(connection) {
  const results = await Promise.all(TARGET_TABLES.map((table, position) => query(connection, `/* 0142:empty-target-${position + 1} */ SELECT COUNT(*) AS \`row_count\` FROM \`${table}\``)));
  return results.every(result => result.length === 1 && Number(result[0].row_count) === 0);
}
async function inspectPreflight(connection, artifacts) {
  const [identity, historyLayout, ledger, catalog] = await Promise.all([readIdentity(connection), readHistoryLayout(connection), readLedger(connection), readCatalog(connection)]);
  return { identity, historyLayout, ledger, catalog, safe: Boolean(identity) && historyLayoutIsExpected(historyLayout) && ledgerIs0142Baseline(ledger, artifacts) && preflightCatalogIsSafe(catalog, artifacts.contracts) };
}
async function inspectAfterDdl(connection, artifacts, baseline) {
  const [catalog, ledger, empty] = await Promise.all([readCatalog(connection), readLedger(connection), targetTablesAreEmpty(connection)]);
  return { catalog, ledger, physicalOk: catalogMatchesStep(catalog, baseline.catalog, artifacts.contracts, 14) && empty, ledgerUnchanged: same(ledger, baseline.ledger) && ledgerIs0142Baseline(ledger, artifacts) };
}
function safeGate(gate, now) {
  const issuedAt = Date.parse(String(gate?.issuedAt ?? "")), expiresAt = Date.parse(String(gate?.expiresAt ?? ""));
  return Boolean(gate && typeof gate === "object" && SAFE_REFERENCE.test(String(gate.reference ?? "")) && Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now && expiresAt > now);
}
function canonicalTargetIsValid(target) { return Boolean(target && typeof target === "object" && SAFE_REFERENCE.test(String(target.reference ?? "")) && normalized(target.serverProduct) === "tidb" && String(target.databaseName ?? "").trim() && String(target.serverVersion ?? "").trim() && /^[0-9a-f]{64}$/.test(String(target.certificateFingerprint ?? "").trim().toLowerCase())); }
function sameCanonicalTarget(left, right) { return canonicalTargetIsValid(left) && canonicalTargetIsValid(right) && String(left.reference) === String(right.reference) && normalized(left.serverProduct) === normalized(right.serverProduct) && String(left.databaseName) === String(right.databaseName) && String(left.serverVersion) === String(right.serverVersion) && String(left.certificateFingerprint).toLowerCase() === String(right.certificateFingerprint).toLowerCase(); }
function identityMatchesCanonicalTarget(identity, target) { return Boolean(identity) && canonicalTargetIsValid(target) && normalized(identity.serverProduct) === normalized(target.serverProduct) && String(identity.databaseName) === String(target.databaseName) && String(identity.serverVersion) === String(target.serverVersion) && String(identity.certificateFingerprint).toLowerCase() === String(target.certificateFingerprint).toLowerCase(); }
function approvalIsExact(gate, now, executorDigest, artifacts) { return safeGate(gate, now) && normalized(gate.approvedBy) === "sergio" && gate.approvalRecordedBySergio === true && String(gate.reviewScope ?? "") === "executor-0142" && String(gate.approvedExecutorDigest ?? "") === executorDigest && String(gate.approvedSqlDigest ?? "") === artifacts.sqlHash && String(gate.approvedGitRevision ?? "") === artifacts.gitRevision && String(gate.artifactsRevision ?? "") === ARTIFACTS_REVISION; }
function backupExceptionIsScoped(gate, now) { return safeGate(gate, now) && String(gate.appliesTo ?? "") === MIGRATION_TAG && gate.kind === "exception" && normalized(gate.approvedBy) === "sergio" && gate.exceptionAuthorized === true; }
async function gatesAreCurrent(options, now, executorDigest, artifacts) {
  const gates = options.gates;
  if (!gates || typeof options.verifyExternalGates !== "function" || !REQUIRED_SIGNOFFS.every(name => gates.signoffs?.[name] === true) || !approvalIsExact(gates.review, now, executorDigest, artifacts) || !approvalIsExact(gates.authorization, now, executorDigest, artifacts) || !safeGate(gates.window, now) || !backupExceptionIsScoped(gates.backup, now) || !safeGate(gates.target, now) || !canonicalTargetIsValid(gates.target)) return false;
  try {
    const verified = await options.verifyExternalGates({ migrationTag: MIGRATION_TAG, migrationTimestamp: MIGRATION_TIMESTAMP, artifactsRevision: ARTIFACTS_REVISION, sqlDigest: artifacts.sqlHash, gitRevision: artifacts.gitRevision, executorDigest, canonicalTarget: gates.target, gates });
    return Boolean(verified && typeof verified === "object" && verified.canonical === "restricted-0142-v1" && verified.authorization === true && verified.review === true && verified.window === true && verified.backup === "exception" && verified.artifactsRevision === ARTIFACTS_REVISION && verified.sqlDigest === artifacts.sqlHash && verified.gitRevision === artifacts.gitRevision && verified.executorDigest === executorDigest && verified.migrationTag === MIGRATION_TAG && sameCanonicalTarget(verified.canonicalTarget, gates.target));
  } catch { return false; }
}
async function ensurePrivateParent(filePath) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (((await stat(directory)).mode & 0o077) !== 0) throw new Error("private_parent_permissions");
}
async function createExclusiveState(filePath) {
  await ensurePrivateParent(filePath);
  const handle = await open(filePath, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify({ kind: "restricted-0142", phase: "ddl-started", createdAt: new Date().toISOString() }), "utf8"); await handle.sync(); } finally { await handle.close(); }
  await chmod(filePath, 0o600);
}
class PrivateCapture {
  constructor(key, handle) { this.key = key; this.handle = handle; }
  static async create(filePath, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("capture_key_invalid");
    await ensurePrivateParent(filePath);
    const handle = await open(filePath, "wx", 0o600);
    try { await handle.writeFile("0142-private-aes256gcm-v1\n", "utf8"); await handle.sync(); await chmod(filePath, 0o600); return new PrivateCapture(Buffer.from(key), handle); } catch (error) { try { await handle.close(); } catch {} throw error; }
  }
  async append(label, metadata) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv), plaintext = Buffer.from(JSON.stringify({ label, metadata }), "utf8"), encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    await this.handle.writeFile(`${JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") })}\n`, "utf8");
    await this.handle.sync();
  }
  async close() { try { await this.handle.close(); } finally { this.key.fill(0); } }
}
function captureSummary(phase, extra = {}) { return { phase, ...extra }; }
async function guardedJournalInsert(connection, artifacts, baseline) {
  let begun = false, commitAttempted = false;
  try {
    await execute(connection, "/* 0142:journal-begin */ BEGIN PESSIMISTIC"); begun = true;
    await query(connection, "/* 0142:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE");
    const current = await readLedger(connection, true);
    if (!same(current, baseline.ledger) || !ledgerIs0142Baseline(current, artifacts)) throw new Error("ledger_changed_before_journal");
    const inserted = await execute(connection, "/* 0142:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [artifacts.sqlHash, MIGRATION_TIMESTAMP]);
    if (Number(inserted?.affectedRows) !== 1) throw new Error("journal_insert_guard");
    const reread = await readLedger(connection, true), marker = reread.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash);
    if (marker.length !== 1 || !same(reread.filter(entry => !marker.includes(entry)), baseline.ledger)) throw new Error("journal_reread_guard");
    commitAttempted = true;
    await execute(connection, "/* 0142:journal-commit */ COMMIT");
    return { ok: true };
  } catch {
    if (commitAttempted) return { ok: false, reason: "journal_commit_uncertain" };
    if (begun) try { await execute(connection, "/* 0142:journal-rollback */ ROLLBACK"); } catch {}
    return { ok: false, reason: "journal_guard_failed" };
  }
}
async function finalValidation(connection, artifacts, baseline) {
  const post = await inspectAfterDdl(connection, artifacts, baseline), marker = post.ledger.filter(entry => String(entry.created_at) === String(MIGRATION_TIMESTAMP) && String(entry.hash) === artifacts.sqlHash);
  return post.physicalOk && marker.length === 1 && same(post.ledger.filter(entry => !marker.includes(entry)), baseline.ledger);
}

/**
 * `preflight` somente lê. `apply` executa exclusivamente as catorze declarações
 * versionadas, em ordem, para na primeira falha e não tenta retomar/repetir DDL.
 */
export async function runRestricted0142(options = {}) {
  const mode = options.mode ?? "preflight", root = options.root ?? projectRoot;
  if (mode !== "preflight" && mode !== "apply") return failure("mode", "invalid_mode");
  const artifacts = await loadRestricted0142Artifacts({ root });
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
    usedConnections.add(connection); requiredIdentity ??= identity;
    return connection;
  };
  try {
    first = await connectIndependent("0142-preflight-a");
    second = await connectIndependent("0142-preflight-b");
    const [preflightA, preflightB] = await Promise.all([inspectPreflight(first, artifacts), inspectPreflight(second, artifacts)]);
    if (!preflightA.safe || !preflightB.safe || !same(preflightA.historyLayout, preflightB.historyLayout) || !same(preflightA.ledger, preflightB.ledger) || !same(preflightA.catalog, preflightB.catalog)) return failure("preflight", "preflight_not_stable_or_not_safe");
    if (mode === "preflight") return report("preflight", "preflight-read-only");
    try {
      capture = await PrivateCapture.create(options.privateCaptureFile, options.privateCaptureKey);
      await capture.append("preflight", captureSummary("preflight", { stable: true }));
      await createExclusiveState(options.stateFile);
    } catch { return failure("capture", "private_capture_or_state_unavailable"); }
    let ddl, ddlCount = 0;
    try {
      ddl = await connectIndependent("0142-ddl");
      for (const [position, statement] of artifacts.statements.entries()) {
        try { await execute(ddl, statement); } catch {
          try { await capture.append(`ddl-failure-${ddlCount + 1}`, captureSummary("ddl-failure", { attempted: ddlCount + 1 })); } catch {}
          return failure("ddl", "statement_failed_no_retry", ddlCount);
        }
        ddlCount += 1;
        const catalog = await readCatalog(ddl), valid = catalogMatchesStep(catalog, preflightA.catalog, artifacts.contracts, position + 1);
        await capture.append(`ddl-${ddlCount}`, captureSummary("ddl", { statement: ddlCount, stable: valid }));
        if (!valid) return failure("ddl-validation", "statement_object_validation_failed", ddlCount);
      }
    } catch { return failure("ddl", "ddl_connection_or_validation_failed", ddlCount); } finally { await closeQuietly(ddl); }
    let afterDdl;
    try {
      afterDdl = await connectIndependent("0142-post-ddl-independent");
      const post = await inspectAfterDdl(afterDdl, artifacts, preflightA);
      await capture.append("post-ddl", captureSummary("post-ddl", { physicalOk: post.physicalOk, ledgerUnchanged: post.ledgerUnchanged }));
      if (!post.physicalOk || !post.ledgerUnchanged) return failure("post-ddl", "physical_contract_or_ledger_deviation", ddlCount);
    } catch { return failure("post-ddl", "independent_validation_failed", ddlCount); } finally { await closeQuietly(afterDdl); }
    let journal;
    try {
      journal = await connectIndependent("0142-journal");
      const fresh = await inspectAfterDdl(journal, artifacts, preflightA);
      if (!fresh.physicalOk || !fresh.ledgerUnchanged) return failure("journal", "fresh_physical_or_ledger_check_failed", ddlCount);
      await capture.append("journal-precheck", captureSummary("journal-precheck", { physicalOk: fresh.physicalOk, ledgerUnchanged: fresh.ledgerUnchanged }));
      const result = await guardedJournalInsert(journal, artifacts, preflightA);
      if (!result.ok) return failure("journal", result.reason, ddlCount);
    } catch { return failure("journal", "journal_connection_failed", ddlCount); } finally { await closeQuietly(journal); }
    let finalConnection;
    try {
      finalConnection = await connectIndependent("0142-final-independent");
      if (!(await finalValidation(finalConnection, artifacts, preflightA))) return failure("final", "final_contract_or_journal_deviation", ddlCount);
    } catch { return failure("final", "final_independent_validation_failed", ddlCount); } finally { await closeQuietly(finalConnection); }
    return report("apply", "complete", APPROVED_STATEMENT_HASHES.length);
  } catch { return failure("preflight", "preflight_connection_or_metadata_failure"); } finally { await closeQuietly(first); await closeQuietly(second); await capture?.close(); }
}
function localIdentification() { return { ok: true, mode: "identification-only", phase: "no-database", ddlCount: 0, tables: 2, alteredTables: 3, addedColumns: 5, primaryKeys: 2, uniqueIndexes: 5, nonUniqueIndexes: 6 }; }
async function main() {
  const requestedApply = process.argv.slice(2).includes("--apply");
  const result = requestedApply ? { ...localIdentification(), ok: false, phase: "dependency_injection_required", reason: "cli_cannot_apply" } : localIdentification();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stdout.write('{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0}\n'); process.exitCode = 2; });
