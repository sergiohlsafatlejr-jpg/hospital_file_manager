#!/usr/bin/env node
/**
 * Executor restrito da migração 0138 de contexto médico informativo.
 *
 * Não descobre conexão, não lê ambiente/credenciais e não chama migradores
 * genéricos. DDL só pode ocorrer por uma factory TLS explicitamente injetada,
 * depois de gates externos canônicos e de um preflight estável.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { access, chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDirectory, "../..");

export const MIGRATION_TAG = "0138_known_blink";
export const MIGRATION_TIMESTAMP = 1793104873640;
export const ARTIFACTS_REVISION = "0138_known_blink";
export const EXPECTED_SQL_SHA256 =
  "3aa1d04b10172c1f35f838f2cdf6acd4a8f487b7b94f3ac5e5308e3c5c129ffa";
export const TARGET_TABLES = [
  "conta_contexto_medico_contextos",
  "conta_contexto_medico_eventos",
  "conta_contexto_medico_fontes",
];

const SQL_ARTIFACT = "drizzle/0138_known_blink.sql";
const SNAPSHOT_ARTIFACT = "drizzle/meta/0138_snapshot.json";
const JOURNAL_ARTIFACT = "drizzle/meta/_journal.json";
const EXECUTOR_ARTIFACT = "scripts/migrations/0138-contexto-medico-restrita.mjs";
const HISTORY_MARKERS = [
  { idx: 135, tag: "0135_fuzzy_wolf_cub", when: 1791922720742 },
  { idx: 136, tag: "0136_lame_dreadnoughts", when: 1792003825434 },
  { idx: 137, tag: "0137_retornos_recursos_cassi", when: 1793047237100 },
];
const REQUIRED_SIGNOFFS = [
  "authorization",
  "review",
  "exactSql",
  "executorDigest",
  "artifactsRevision",
  "window",
  "backupExceptionOrProof",
];
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function column(
  name,
  type,
  nullable = false,
  defaultValue = null,
  autoincrement = false,
  onUpdate = false
) {
  return { name, type, nullable, default: defaultValue, autoincrement, onUpdate };
}

function index(name, unique, columns, primary = false) {
  return { name, unique, columns, primary, prefixes: columns.map(() => null) };
}

// Este é o contrato físico normativo. O snapshot também é conferido contra ele;
// não se aceita inferir nomes de tabela, colunas ou índices a partir do banco.
const EXPECTED_CONTRACT = {
  conta_contexto_medico_contextos: {
    columns: [
      column("id", "int", false, null, true),
      column("estabelecimento_id", "int"),
      column("convenio_id", "int"),
      column("arquivo_hospital_id", "int"),
      column("numero_conta", "varchar(100)"),
      column("numero_lote", "varchar(100)", false, ""),
      column("competencia", "varchar(20)", false, ""),
      column("padrao_id", "int", true),
      column("nome_padrao", "varchar(255)", true),
      column(
        "status",
        "enum('confirmado','invalidado','revisao_necessaria')",
        false,
        "revisao_necessaria"
      ),
      column("revisao", "int", false, "0"),
      column("confirmado_em", "timestamp", true),
      column("confirmado_por", "int", true),
      column("justificativa", "varchar(1000)"),
      column("versao_padrao", "varchar(64)", true),
      column("fontes_versoes_json", "json"),
      column("versao_itens_hospitalares", "varchar(64)"),
      column("principais_snapshot_json", "json"),
      column(
        "abrangencia",
        "enum('conta_inteira_sem_setor','conta_inteira')"
      ),
      column("criado_em", "timestamp", false, "CURRENT_TIMESTAMP"),
      column("atualizado_em", "timestamp", false, "CURRENT_TIMESTAMP", false, true),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index(
        "uq_ccm_contexto_scope",
        true,
        [
          "estabelecimento_id",
          "convenio_id",
          "arquivo_hospital_id",
          "numero_conta",
          "numero_lote",
          "competencia",
        ]
      ),
      index("idx_ccm_contexto_padrao", false, ["padrao_id"]),
    ],
  },
  conta_contexto_medico_eventos: {
    columns: [
      column("id", "int", false, null, true),
      column("contexto_id", "int"),
      column("revisao", "int"),
      column(
        "tipo",
        "enum('confirmado','invalidado','revisao_necessaria')"
      ),
      column("usuario_id", "int", true),
      column("justificativa", "varchar(1000)"),
      column("padrao_id", "int", true),
      column("versao_padrao", "varchar(64)", true),
      column("evidencia_json", "json"),
      column("criado_em", "timestamp", false, "CURRENT_TIMESTAMP"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index("uq_ccm_evento_contexto_revisao", true, ["contexto_id", "revisao"]),
      index("idx_ccm_evento_contexto", false, ["contexto_id", "criado_em"]),
    ],
  },
  conta_contexto_medico_fontes: {
    columns: [
      column("id", "int", false, null, true),
      column("estabelecimento_id", "int"),
      column("convenio_id", "int"),
      column("arquivo_hospital_id", "int"),
      column("arquivo_medico_id", "int"),
      column("numero_conta", "varchar(100)"),
      column("numero_lote", "varchar(100)", false, ""),
      column("competencia", "varchar(20)", false, ""),
      column("guia_referencia", "varchar(100)"),
      column("versao_semantica", "varchar(64)"),
      column("registros", "int"),
      column("codigos_distintos", "int"),
      column("procedimentos_json", "json"),
      column("criado_em", "timestamp", false, "CURRENT_TIMESTAMP"),
    ],
    indexes: [
      index("PRIMARY", true, ["id"], true),
      index(
        "uq_ccm_fonte_scope_arquivo_guia_versao",
        true,
        [
          "estabelecimento_id",
          "convenio_id",
          "arquivo_hospital_id",
          "numero_conta",
          "numero_lote",
          "competencia",
          "arquivo_medico_id",
          "guia_referencia",
          "versao_semantica",
        ]
      ),
      index(
        "idx_ccm_fonte_scope",
        false,
        [
          "estabelecimento_id",
          "convenio_id",
          "arquivo_hospital_id",
          "numero_conta",
          "numero_lote",
          "competencia",
        ]
      ),
      index("idx_ccm_fonte_arquivo_medico", false, ["arquivo_medico_id"]),
    ],
  },
};

const EXPECTED_INDEX_CREATION_ORDER = [
  ["idx_ccm_contexto_padrao", "conta_contexto_medico_contextos"],
  ["idx_ccm_evento_contexto", "conta_contexto_medico_eventos"],
  ["idx_ccm_fonte_scope", "conta_contexto_medico_fontes"],
  ["idx_ccm_fonte_arquivo_medico", "conta_contexto_medico_fontes"],
];

function normalized(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (
    /^\(?now\(\)\)?$/i.test(raw) ||
    /^current_timestamp(?:\(\))?$/i.test(raw)
  ) {
    return "CURRENT_TIMESTAMP";
  }
  const quoted = raw.match(/^'((?:''|[^'])*)'$/);
  return quoted ? quoted[1].replace(/''/g, "'") : raw;
}

function failure(phase, reason, ddlCount = 0) {
  return { ok: false, phase, reason, ddlCount };
}

function report(mode, phase, ddlCount = 0) {
  return {
    ok: true,
    mode,
    phase,
    ddlCount,
    tables: 3,
    columns: 45,
    primaryKeys: 3,
    uniqueIndexes: 3,
    nonUniqueIndexes: 4,
  };
}

function safeErrorCode(error, fallback) {
  const code = String(error && typeof error === "object" ? error.code ?? "" : "");
  if (code === "EEXIST") return "state_or_capture_exists";
  if (code === "EACCES" || code === "EPERM") return "private_file_permissions";
  return fallback;
}

async function closeQuietly(connection) {
  if (!connection?.close) return;
  try {
    await connection.close();
  } catch {
    // Driver diagnostics can reveal network names or credentials; do not surface them.
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

function artifactPath(root, relativePath) {
  const base = path.resolve(root);
  const result = path.resolve(base, relativePath);
  if (!result.startsWith(`${base}${path.sep}`)) throw new Error("unsafe_artifact_path");
  return result;
}

async function query(connection, sql, params) {
  return rows(await connection.query(sql, params));
}

async function execute(connection, sql, params) {
  return connection.execute(sql, params);
}

function parseStatements(sql) {
  return sql
    .split(/\s*-->\s*statement-breakpoint\s*/g)
    .map(statement => statement.trim())
    .filter(Boolean);
}

function sqlHasOnlyApprovedCreates(statements) {
  if (statements.length !== 7) return false;
  // `ON UPDATE CURRENT_TIMESTAMP` é parte da única definição de coluna aprovada;
  // comandos UPDATE continuam impossíveis porque cada declaração também precisa
  // iniciar exatamente com CREATE TABLE/CREATE INDEX da allowlist abaixo.
  const forbidden = /\b(?:ALTER|DROP|TRUNCATE|DELETE|INSERT|REPLACE|RENAME|GRANT|REVOKE|REFERENCES|FOREIGN\s+KEY)\b/i;
  for (const [position, statement] of statements.entries()) {
    if (forbidden.test(statement)) return false;
    if (position < 3) {
      const expectedTable = TARGET_TABLES[position];
      const tableMatch = statement.match(/^CREATE\s+TABLE\s+`([^`]+)`\s*\(/i);
      if (!tableMatch || tableMatch[1] !== expectedTable) return false;
    } else {
      const [expectedIndex, expectedTable] = EXPECTED_INDEX_CREATION_ORDER[position - 3];
      const indexMatch = statement.match(
        /^CREATE\s+INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`\s*\(/i
      );
      if (
        !indexMatch ||
        indexMatch[1] !== expectedIndex ||
        indexMatch[2] !== expectedTable
      ) {
        return false;
      }
    }
  }
  return true;
}

function snapshotContract(snapshot) {
  const contract = {};
  for (const tableName of TARGET_TABLES) {
    const table = snapshot.tables?.[tableName];
    if (!table) throw new Error("snapshot_target_missing");
    const indexes = [];
    for (const primaryKey of Object.values(table.compositePrimaryKeys ?? {})) {
      indexes.push(index("PRIMARY", true, primaryKey.columns, true));
    }
    for (const item of Object.values(table.indexes ?? {})) {
      indexes.push(index(item.name, Boolean(item.isUnique), item.columns));
    }
    for (const item of Object.values(table.uniqueConstraints ?? {})) {
      indexes.push(index(item.name, true, item.columns));
    }
    contract[tableName] = {
      columns: Object.values(table.columns ?? {}).map(item =>
        column(
          item.name,
          normalized(item.type),
          !item.notNull,
          normalizeDefault(item.default),
          Boolean(item.autoincrement),
          Boolean(item.onUpdate)
        )
      ),
      indexes: indexes.sort((a, b) => a.name.localeCompare(b.name)),
      foreignKeys: Object.values(table.foreignKeys ?? {}).map(item => item.name),
    };
  }
  return contract;
}

function expectedSnapshotContract() {
  return Object.fromEntries(
    Object.entries(EXPECTED_CONTRACT).map(([name, table]) => [
      name,
      {
        columns: table.columns.map(item => ({ ...item, type: normalized(item.type) })),
        indexes: table.indexes.slice().sort((a, b) => a.name.localeCompare(b.name)),
        foreignKeys: [],
      },
    ])
  );
}

function expectedNamedObjects() {
  return EXPECTED_INDEX_CREATION_ORDER.map(([name]) => name).sort();
}

async function readHistoricalMarkers(root, journal) {
  const metadata = [];
  for (const expected of HISTORY_MARKERS) {
    const entries = (journal.entries ?? []).filter(entry => entry.idx === expected.idx);
    if (
      entries.length !== 1 ||
      entries[0].tag !== expected.tag ||
      entries[0].when !== expected.when
    ) {
      throw new Error("historical_journal_anchor_invalid");
    }
    const source = await readFile(artifactPath(root, `drizzle/${expected.tag}.sql`));
    metadata.push({ ...expected, hash: sha256(source) });
  }
  return metadata;
}

/**
 * Confere localmente SQL, snapshot e journal, sem expor a impressão criptográfica
 * em retorno ou stdout. O hash imutável é uma trava de identidade, não um dado de
 * operação a ser reportado.
 */
export async function loadRestricted0138Artifacts({ root = projectRoot } = {}) {
  try {
    const [sqlBytes, snapshotBytes, journalBytes] = await Promise.all([
      readFile(artifactPath(root, SQL_ARTIFACT)),
      readFile(artifactPath(root, SNAPSHOT_ARTIFACT)),
      readFile(artifactPath(root, JOURNAL_ARTIFACT)),
    ]);
    const sqlHash = sha256(sqlBytes);
    if (sqlHash !== EXPECTED_SQL_SHA256) {
      return { ok: false, reason: "artifact_identity_mismatch" };
    }
    const sql = sqlBytes.toString("utf8");
    const statements = parseStatements(sql);
    if (!sqlHasOnlyApprovedCreates(statements)) {
      return { ok: false, reason: "approved_sql_contract_invalid" };
    }
    const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
    if (!same(snapshotContract(snapshot), expectedSnapshotContract())) {
      return { ok: false, reason: "snapshot_contract_invalid" };
    }
    const journal = JSON.parse(journalBytes.toString("utf8"));
    const marker138 = (journal.entries ?? []).filter(entry => entry.idx === 138);
    if (
      marker138.length !== 1 ||
      marker138[0].tag !== MIGRATION_TAG ||
      marker138[0].when !== MIGRATION_TIMESTAMP ||
      marker138[0].version !== "5" ||
      marker138[0].breakpoints !== true ||
      (journal.entries ?? []).filter(entry => entry.tag === MIGRATION_TAG).length !== 1
    ) {
      return { ok: false, reason: "journal_0138_identity_invalid" };
    }
    const history = await readHistoricalMarkers(root, journal);
    return {
      ok: true,
      statements,
      sqlHash,
      history,
      expectedIndexNames: expectedNamedObjects(),
    };
  } catch {
    return { ok: false, reason: "artifact_unavailable_or_unreadable" };
  }
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
    .map(item => ({
      ...item,
      columns: item.columns.sort((left, right) => left.sequence - right.sequence),
    }))
    .sort((left, right) => `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`));
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
      default: normalizeDefault(row.COLUMN_DEFAULT ?? row.column_default),
      onUpdate: /on update/.test(normalized(row.EXTRA ?? row.extra)),
    }))
    .sort((left, right) => left.table.localeCompare(right.table) || left.position - right.position);
}

function normalizeForeignKeys(foreignKeyRows) {
  const grouped = new Map();
  for (const row of foreignKeyRows) {
    const name = String(row.CONSTRAINT_NAME ?? row.constraint_name ?? "");
    if (!name) continue;
    const key = `${String(row.TABLE_NAME ?? row.table_name ?? "")}\u0000${name}`;
    const current = grouped.get(key) ?? {
      name,
      tableFrom: String(row.TABLE_NAME ?? row.table_name ?? ""),
      tableTo: String(row.REFERENCED_TABLE_NAME ?? row.referenced_table_name ?? ""),
      columnsFrom: [],
      columnsTo: [],
    };
    current.columnsFrom.push({
      sequence: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(row.COLUMN_NAME ?? row.column_name ?? ""),
    });
    current.columnsTo.push({
      sequence: Number(row.ORDINAL_POSITION ?? row.ordinal_position ?? 0),
      name: String(row.REFERENCED_COLUMN_NAME ?? row.referenced_column_name ?? ""),
    });
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(item => ({
      ...item,
      columnsFrom: item.columnsFrom
        .sort((left, right) => left.sequence - right.sequence)
        .map(value => value.name),
      columnsTo: item.columnsTo
        .sort((left, right) => left.sequence - right.sequence)
        .map(value => value.name),
    }))
    .sort((left, right) => `${left.tableFrom}:${left.name}`.localeCompare(`${right.tableFrom}:${right.name}`));
}

async function readCatalog(connection) {
  const placeholders = TARGET_TABLES.map(() => "?").join(", ");
  const [allTables, columns, indexes, foreignKeys] = await Promise.all([
    query(
      connection,
      "/* 0138:catalog-tables */ SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`tables` WHERE `table_schema` = DATABASE() ORDER BY `TABLE_NAME`"
    ),
    query(
      connection,
      `/* 0138:catalog-columns */ SELECT \`TABLE_NAME\`, \`ORDINAL_POSITION\`, \`COLUMN_NAME\`, \`COLUMN_TYPE\`, \`IS_NULLABLE\`, \`COLUMN_DEFAULT\`, \`EXTRA\` FROM \`information_schema\`.\`columns\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`ORDINAL_POSITION\``,
      TARGET_TABLES
    ),
    query(
      connection,
      `/* 0138:catalog-indexes */ SELECT \`TABLE_NAME\`, \`INDEX_NAME\`, \`NON_UNIQUE\`, \`SEQ_IN_INDEX\`, \`COLUMN_NAME\`, \`SUB_PART\` FROM \`information_schema\`.\`statistics\` WHERE \`table_schema\` = DATABASE() AND \`table_name\` IN (${placeholders}) ORDER BY \`TABLE_NAME\`, \`INDEX_NAME\`, \`SEQ_IN_INDEX\``,
      TARGET_TABLES
    ),
    query(
      connection,
      "/* 0138:catalog-fks */ SELECT `kcu`.`CONSTRAINT_NAME`, `kcu`.`TABLE_NAME`, `kcu`.`ORDINAL_POSITION`, `kcu`.`COLUMN_NAME`, `kcu`.`REFERENCED_TABLE_NAME`, `kcu`.`REFERENCED_COLUMN_NAME` FROM `information_schema`.`KEY_COLUMN_USAGE` AS `kcu` WHERE `kcu`.`CONSTRAINT_SCHEMA` = DATABASE() AND `kcu`.`REFERENCED_TABLE_NAME` IS NOT NULL ORDER BY `kcu`.`TABLE_NAME`, `kcu`.`CONSTRAINT_NAME`, `kcu`.`ORDINAL_POSITION`"
    ),
  ]);
  return {
    allTables: allTables
      .map(row => ({
        name: String(row.TABLE_NAME ?? row.table_name ?? ""),
        type: String(row.TABLE_TYPE ?? row.table_type ?? ""),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    columns: normalizeColumns(columns),
    indexes: groupIndexes(indexes),
    foreignKeys: normalizeForeignKeys(foreignKeys),
  };
}

async function readHistoryLayout(connection) {
  return query(
    connection,
    "/* 0138:history-layout */ SELECT `COLUMN_NAME`, `ORDINAL_POSITION`, `COLUMN_TYPE`, `IS_NULLABLE`, `EXTRA` FROM `information_schema`.`columns` WHERE `table_schema` = DATABASE() AND `table_name` = '__drizzle_migrations' ORDER BY `ORDINAL_POSITION`"
  );
}

async function readLedger(connection, locked = false) {
  return query(
    connection,
    `/* 0138:ledger-read${locked ? "-lock" : ""} */ SELECT \`id\`, \`hash\`, \`created_at\` FROM \`__drizzle_migrations\` ORDER BY \`id\`${locked ? " FOR UPDATE" : ""}`
  );
}

function historyLayoutIsExpected(layoutRows) {
  const byName = new Map(
    layoutRows.map(row => [String(row.COLUMN_NAME ?? row.column_name ?? ""), row])
  );
  if (byName.size !== 3) return false;
  const id = byName.get("id");
  const hash = byName.get("hash");
  const createdAt = byName.get("created_at");
  return Boolean(
    id &&
      hash &&
      createdAt &&
      normalized(id.COLUMN_TYPE ?? id.column_type) === "bigint unsigned" &&
      normalized(id.IS_NULLABLE ?? id.is_nullable) === "no" &&
      /auto_increment/.test(normalized(id.EXTRA ?? id.extra)) &&
      normalized(hash.COLUMN_TYPE ?? hash.column_type) === "text" &&
      normalized(hash.IS_NULLABLE ?? hash.is_nullable) === "no" &&
      normalized(createdAt.COLUMN_TYPE ?? createdAt.column_type) === "bigint" &&
      // O histórico real permite NULL na definição; os valores são validados
      // integralmente em ledgerIs0138Baseline, sem alterar a tabela existente.
      ["yes", "no"].includes(normalized(createdAt.IS_NULLABLE ?? createdAt.is_nullable))
  );
}

function exactMarker(entries, marker) {
  const related = entries.filter(
    entry =>
      String(entry.created_at) === String(marker.when) ||
      String(entry.hash) === marker.hash
  );
  return (
    related.length === 1 &&
    String(related[0].created_at) === String(marker.when) &&
    String(related[0].hash) === marker.hash
  );
}

function noMarker(entries, marker) {
  return !entries.some(
    entry =>
      String(entry.created_at) === String(marker.when) ||
      String(entry.hash) === marker.hash
  );
}

function ledgerIs0138Baseline(ledger, artifacts) {
  const marker135 = artifacts.history.find(item => item.idx === 135);
  const marker136 = artifacts.history.find(item => item.idx === 136);
  const marker137 = artifacts.history.find(item => item.idx === 137);
  const marker138 = { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash };
  if (!marker135 || !marker136 || !marker137) return false;
  return (
    noMarker(ledger, marker135) &&
    exactMarker(ledger, marker136) &&
    exactMarker(ledger, marker137) &&
    noMarker(ledger, marker138) &&
    ledger.every(entry => {
      if (entry.created_at === null || entry.created_at === undefined) return false;
      const value = String(entry.created_at);
      const timestamp = Number(value);
      return /^\d+$/.test(value) && Number.isSafeInteger(timestamp) &&
        timestamp > 0 && timestamp <= MIGRATION_TIMESTAMP - 1;
    })
  );
}

function ledgerHas0138Marker(ledger, artifacts) {
  return !noMarker(ledger, { when: MIGRATION_TIMESTAMP, hash: artifacts.sqlHash });
}

async function readIdentity(connection) {
  if (typeof connection?.getIdentity !== "function") return null;
  try {
    const identity = await connection.getIdentity();
    const serverVersion = String(identity?.serverVersion ?? "");
    const databaseName = String(identity?.databaseName ?? "").trim();
    if (
      identity?.tlsVerified !== true ||
      normalized(identity?.serverProduct) !== "tidb" ||
      !databaseName ||
      !serverVersion
    ) {
      return null;
    }
    return {
      tlsVerified: true,
      serverProduct: "tidb",
      databaseName,
      serverVersion,
    };
  } catch {
    return null;
  }
}

/**
 * Adaptador opcional para mysql2/promise que o chamador já autorizado injetou.
 * Não importa mysql2 nem resolve DATABASE_URL. TLS com CA, hostname e certificado
 * autorizados é obrigatório; uma conexão cujo stream não esteja autorizado cai.
 */
export function createInjectedMysql2TlsFactory({ mysql, connectionOptions }) {
  if (
    !mysql ||
    typeof mysql.createConnection !== "function" ||
    !connectionOptions ||
    typeof connectionOptions !== "object" ||
    !String(connectionOptions.database ?? "").trim() ||
    !connectionOptions.ssl ||
    !connectionOptions.ssl.ca ||
    connectionOptions.ssl.rejectUnauthorized !== true ||
    connectionOptions.ssl.verifyIdentity !== true
  ) {
    throw new Error("injected_mysql2_tls_configuration_invalid");
  }
  const options = {
    ...connectionOptions,
    multipleStatements: false,
    ssl: {
      ...connectionOptions.ssl,
      rejectUnauthorized: true,
      verifyIdentity: true,
    },
  };
  return {
    async connect() {
      let raw;
      try {
        raw = await mysql.createConnection(options);
        const socket = raw?.connection?.stream;
        const certificate = socket?.getPeerCertificate?.(true);
        if (
          socket?.encrypted !== true ||
          socket?.authorized !== true ||
          !certificate ||
          Object.keys(certificate).length === 0
        ) {
          try {
            await raw?.end?.();
          } catch {}
          throw new Error("injected_mysql2_tls_peer_unverified");
        }
        return {
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
            const activeSocket = raw?.connection?.stream;
            const activeCertificate = activeSocket?.getPeerCertificate?.(true);
            if (
              activeSocket?.encrypted !== true ||
              activeSocket?.authorized !== true ||
              !activeCertificate ||
              Object.keys(activeCertificate).length === 0
            ) {
              return { tlsVerified: false };
            }
            const [result] = await raw.query(
              "/* 0138:adapter-identity */ SELECT DATABASE() AS `database_name`, VERSION() AS `server_version`"
            );
            const row = result?.[0] ?? {};
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
      } catch (error) {
        try {
          await raw?.end?.();
        } catch {}
        if (String(error?.message ?? "") === "injected_mysql2_tls_peer_unverified") {
          throw error;
        }
        throw new Error("injected_mysql2_connection_failed");
      }
    },
  };
}

function catalogWithoutTargets(catalog) {
  const targets = new Set(TARGET_TABLES);
  return {
    allTables: catalog.allTables.filter(item => !targets.has(item.name)),
    columns: catalog.columns.filter(item => !targets.has(item.table)),
    indexes: catalog.indexes.filter(item => !targets.has(item.table)),
    foreignKeys: catalog.foreignKeys.filter(
      item => !targets.has(item.tableFrom) && !targets.has(item.tableTo)
    ),
  };
}

function actualColumns(catalog, tableName) {
  return catalog.columns
    .filter(item => item.table === tableName)
    .map(({ table, position, ...item }) => item);
}

function actualIndexes(catalog, tableName) {
  return catalog.indexes
    .filter(item => item.table === tableName)
    .map(item => ({
      name: item.name,
      unique: item.unique,
      columns: item.columns.map(columnItem => columnItem.name),
      primary: item.name === "PRIMARY",
      prefixes: item.columns.map(columnItem => columnItem.subPart),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function expectedIndexesAtStep(tableName, statementCount) {
  const table = EXPECTED_CONTRACT[tableName];
  const explicitFinished = new Set(
    EXPECTED_INDEX_CREATION_ORDER.slice(0, Math.max(0, statementCount - 3)).map(
      ([name]) => name
    )
  );
  return table.indexes
    .filter(item => item.primary || item.unique || explicitFinished.has(item.name))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
}

function targetTableNames(catalog) {
  return catalog.allTables
    .filter(item => TARGET_TABLES.includes(item.name))
    .map(item => item.name)
    .sort();
}

function noForeignKeyTouchesTargets(catalog) {
  const targets = new Set(TARGET_TABLES);
  return !catalog.foreignKeys.some(
    item => targets.has(item.tableFrom) || targets.has(item.tableTo)
  );
}

function validateStatementState(catalog, baselineCatalog, statementCount) {
  const expectedPresent = TARGET_TABLES.slice(0, Math.min(statementCount, 3)).sort();
  if (!same(targetTableNames(catalog), expectedPresent)) return false;
  if (!same(catalogWithoutTargets(catalog), catalogWithoutTargets(baselineCatalog))) return false;
  if (!noForeignKeyTouchesTargets(catalog)) return false;
  for (const tableName of expectedPresent) {
    const expected = EXPECTED_CONTRACT[tableName];
    if (!same(actualColumns(catalog, tableName), expected.columns)) return false;
    if (!same(actualIndexes(catalog, tableName), expectedIndexesAtStep(tableName, statementCount))) {
      return false;
    }
  }
  return true;
}

async function targetTablesAreEmpty(connection) {
  for (const tableName of TARGET_TABLES) {
    const result = await query(
      connection,
      `/* 0138:empty-table */ SELECT COUNT(*) AS \`row_count\` FROM \`${tableName}\``
    );
    if (result.length !== 1 || Number(result[0].row_count) !== 0) return false;
  }
  return true;
}

function finalPhysicalContractIsExact(catalog, baselineCatalog) {
  if (!same(targetTableNames(catalog), TARGET_TABLES.slice().sort())) return false;
  if (!same(catalogWithoutTargets(catalog), catalogWithoutTargets(baselineCatalog))) return false;
  if (!noForeignKeyTouchesTargets(catalog)) return false;
  let columns = 0;
  let primaryKeys = 0;
  let uniqueIndexes = 0;
  let normalIndexes = 0;
  for (const tableName of TARGET_TABLES) {
    const expected = EXPECTED_CONTRACT[tableName];
    if (!same(actualColumns(catalog, tableName), expected.columns)) return false;
    if (!same(actualIndexes(catalog, tableName), expected.indexes.slice().sort((a, b) => a.name.localeCompare(b.name)))) {
      return false;
    }
    columns += expected.columns.length;
    for (const item of expected.indexes) {
      if (item.primary) primaryKeys += 1;
      else if (item.unique) uniqueIndexes += 1;
      else normalIndexes += 1;
    }
  }
  return columns === 45 && primaryKeys === 3 && uniqueIndexes === 3 && normalIndexes === 4;
}

async function inspectPreflight(connection, artifacts) {
  const [identity, historyLayout, ledger, catalog] = await Promise.all([
    readIdentity(connection),
    readHistoryLayout(connection),
    readLedger(connection),
    readCatalog(connection),
  ]);
  return {
    identity,
    historyLayout,
    ledger,
    catalog,
    safe:
      Boolean(identity) &&
      historyLayoutIsExpected(historyLayout) &&
      targetTableNames(catalog).length === 0 &&
      noForeignKeyTouchesTargets(catalog) &&
      ledgerIs0138Baseline(ledger, artifacts) &&
      !ledgerHas0138Marker(ledger, artifacts),
  };
}

async function inspectAfterDdl(connection, artifacts, baseline) {
  const [catalog, ledger, empty] = await Promise.all([
    readCatalog(connection),
    readLedger(connection),
    targetTablesAreEmpty(connection),
  ]);
  return {
    catalog,
    ledger,
    physicalOk: finalPhysicalContractIsExact(catalog, baseline.catalog) && empty,
    ledgerUnchanged: same(ledger, baseline.ledger) && ledgerIs0138Baseline(ledger, artifacts),
  };
}

function safeGate(gate, now) {
  if (!gate || typeof gate !== "object") return false;
  if (!SAFE_REFERENCE.test(String(gate.reference ?? ""))) return false;
  const issuedAt = Date.parse(String(gate.issuedAt ?? ""));
  const expiresAt = Date.parse(String(gate.expiresAt ?? ""));
  return Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now && expiresAt > now;
}

function isExactSergioApproval(gate, now, executorDigest, artifacts) {
  return (
    safeGate(gate, now) &&
    normalized(gate.approvedBy) === "sergio" &&
    gate.approvalRecordedBySergio === true &&
    String(gate.reviewScope ?? "") === "executor-0138" &&
    String(gate.approvedExecutorDigest ?? "") === executorDigest &&
    String(gate.approvedSqlDigest ?? "") === artifacts.sqlHash &&
    String(gate.artifactsRevision ?? "") === ARTIFACTS_REVISION
  );
}

function backupGateIsScoped(gate, now) {
  if (!safeGate(gate, now)) return false;
  if (String(gate.appliesTo ?? "") !== MIGRATION_TAG) return false;
  if (gate.kind === "exception") {
    return normalized(gate.approvedBy) === "sergio" && gate.exceptionAuthorized === true;
  }
  if (gate.kind === "proof") return gate.proofVerified === true;
  return false;
}

function hasAllSignoffs(signoffs) {
  return REQUIRED_SIGNOFFS.every(name => signoffs?.[name] === true);
}

async function gatesAreCurrent(options, now, executorDigest, artifacts) {
  const gates = options.gates;
  if (!gates || typeof options.verifyExternalGates !== "function") return false;
  if (
    !hasAllSignoffs(gates.signoffs) ||
    !isExactSergioApproval(gates.review, now, executorDigest, artifacts) ||
    !isExactSergioApproval(gates.authorization, now, executorDigest, artifacts) ||
    !safeGate(gates.window, now) ||
    !backupGateIsScoped(gates.backup, now)
  ) {
    return false;
  }
  try {
    const verified = await options.verifyExternalGates({
      migrationTag: MIGRATION_TAG,
      migrationTimestamp: MIGRATION_TIMESTAMP,
      artifactsRevision: ARTIFACTS_REVISION,
      sqlDigest: artifacts.sqlHash,
      executorDigest,
      gates,
    });
    // A boolean is intentionally insufficient: the wrapper has to return a
    // canonical attestation bound to the exact bytes and scope.
    return (
      verified &&
      typeof verified === "object" &&
      verified.canonical === "restricted-0138-v1" &&
      verified.authorization === true &&
      verified.review === true &&
      verified.window === true &&
      (verified.backup === "exception" || verified.backup === "proof") &&
      verified.artifactsRevision === ARTIFACTS_REVISION &&
      verified.sqlDigest === artifacts.sqlHash &&
      verified.executorDigest === executorDigest &&
      verified.migrationTag === MIGRATION_TAG
    );
  } catch {
    return false;
  }
}

async function ensurePrivateParent(filePath) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const information = await stat(directory);
  if ((information.mode & 0o077) !== 0) throw new Error("private_parent_permissions");
}

async function createExclusiveState(stateFile) {
  await ensurePrivateParent(stateFile);
  const handle = await open(stateFile, "wx", 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({ kind: "restricted-0138", phase: "ddl-started", createdAt: new Date().toISOString() }),
      "utf8"
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(stateFile, 0o600);
}

class PrivateCapture {
  constructor(key, handle) {
    this.key = key;
    this.handle = handle;
  }

  static async create(filePath, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("capture_key_invalid");
    await ensurePrivateParent(filePath);
    const handle = await open(filePath, "wx", 0o600);
    try {
      await handle.writeFile("0138-private-aes256gcm-v1\n", "utf8");
      await handle.sync();
      await chmod(filePath, 0o600);
      return new PrivateCapture(Buffer.from(key), handle);
    } catch (error) {
      try {
        await handle.close();
      } catch {}
      throw error;
    }
  }

  async append(label, metadata) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify({ label, metadata }), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    await this.handle.writeFile(
      `${JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") })}\n`,
      "utf8"
    );
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

async function guardedJournalInsert(connection, artifacts, baseline) {
  let begun = false;
  let commitAttempted = false;
  try {
    await execute(connection, "/* 0138:journal-begin */ BEGIN PESSIMISTIC");
    begun = true;
    await query(
      connection,
      "/* 0138:ledger-anchor-lock */ SELECT `id` FROM `__drizzle_migrations` ORDER BY `id` LIMIT 1 FOR UPDATE"
    );
    const current = await readLedger(connection, true);
    if (!same(current, baseline.ledger) || !ledgerIs0138Baseline(current, artifacts)) {
      throw new Error("ledger_changed_before_journal");
    }
    const inserted = await execute(
      connection,
      "/* 0138:journal-insert */ INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [artifacts.sqlHash, MIGRATION_TIMESTAMP]
    );
    if (Number(inserted?.affectedRows) !== 1) throw new Error("journal_insert_guard");
    const reread = await readLedger(connection, true);
    const marker = reread.filter(
      entry =>
        String(entry.created_at) === String(MIGRATION_TIMESTAMP) &&
        String(entry.hash) === artifacts.sqlHash
    );
    if (
      marker.length !== 1 ||
      !same(reread.filter(entry => !marker.includes(entry)), baseline.ledger)
    ) {
      throw new Error("journal_reread_guard");
    }
    commitAttempted = true;
    await execute(connection, "/* 0138:journal-commit */ COMMIT");
    return { ok: true };
  } catch {
    if (commitAttempted) return { ok: false, reason: "journal_commit_uncertain" };
    if (begun) {
      try {
        await execute(connection, "/* 0138:journal-rollback */ ROLLBACK");
      } catch {}
    }
    return { ok: false, reason: "journal_guard_failed" };
  }
}

async function finalValidation(connection, artifacts, baseline) {
  const post = await inspectAfterDdl(connection, artifacts, baseline);
  if (!post.physicalOk) return false;
  const marker = post.ledger.filter(
    entry =>
      String(entry.created_at) === String(MIGRATION_TIMESTAMP) &&
      String(entry.hash) === artifacts.sqlHash
  );
  return (
    marker.length === 1 &&
    same(post.ledger.filter(entry => !marker.includes(entry)), baseline.ledger)
  );
}

/**
 * API: mode preflight faz somente inspeção; mode apply exige gates canônicos,
 * factory injetada, captura AES-GCM e arquivo de estado exclusivo. Nenhum modo
 * lê env, abre conexão automaticamente, tenta DDL genérica ou faz retry.
 */
export async function runRestricted0138(options = {}) {
  const mode = options.mode ?? "preflight";
  const root = options.root ?? projectRoot;
  if (mode !== "preflight" && mode !== "apply") return failure("mode", "invalid_mode");

  const artifacts = await loadRestricted0138Artifacts({ root });
  if (!artifacts.ok) return failure("identity", artifacts.reason);
  if (!options.connectionFactory || typeof options.connectionFactory.connect !== "function") {
    return failure("connection", "connection_factory_required");
  }

  let executorDigest;
  if (mode === "apply") {
    if (!options.stateFile || !options.privateCaptureFile || !options.privateCaptureKey) {
      return failure("apply-gates", "private_state_and_capture_required");
    }
    if (await exists(options.stateFile) || (await exists(options.privateCaptureFile))) {
      return failure("apply-gates", "state_or_capture_exists");
    }
    try {
      executorDigest = sha256(await readFile(artifactPath(root, EXECUTOR_ARTIFACT)));
    } catch {
      return failure("apply-gates", "executor_identity_unavailable");
    }
    if (!(await gatesAreCurrent(options, options.now ?? Date.now(), executorDigest, artifacts))) {
      return failure("apply-gates", "external_gates_missing_or_unverified");
    }
  }

  const usedConnections = new Set();
  let requiredIdentity;
  let first;
  let second;
  let capture;
  const connectIndependent = async purpose => {
    const connection = await options.connectionFactory.connect(purpose);
    if (!connection || usedConnections.has(connection)) throw new Error("connection_not_independent");
    const identity = await readIdentity(connection);
    if (!identity || (requiredIdentity && !same(identity, requiredIdentity))) {
      await closeQuietly(connection);
      throw new Error("connection_identity_mismatch");
    }
    usedConnections.add(connection);
    requiredIdentity ??= identity;
    return connection;
  };

  try {
    first = await connectIndependent("0138-preflight-a");
    second = await connectIndependent("0138-preflight-b");
    const [preflightA, preflightB] = await Promise.all([
      inspectPreflight(first, artifacts),
      inspectPreflight(second, artifacts),
    ]);
    if (
      !preflightA.safe ||
      !preflightB.safe ||
      !same(preflightA.historyLayout, preflightB.historyLayout) ||
      !same(preflightA.ledger, preflightB.ledger) ||
      !same(preflightA.catalog, preflightB.catalog)
    ) {
      return failure("preflight", "preflight_not_stable_or_not_safe");
    }
    if (mode === "preflight") return report("preflight", "preflight-read-only");

    try {
      capture = await PrivateCapture.create(options.privateCaptureFile, options.privateCaptureKey);
      await capture.append("preflight", { first: preflightA, second: preflightB });
      await createExclusiveState(options.stateFile);
    } catch (error) {
      return failure("capture", safeErrorCode(error, "private_capture_or_state_unavailable"));
    }

    let ddl;
    let ddlCount = 0;
    try {
      ddl = await connectIndependent("0138-ddl");
      for (const [indexPosition, statement] of artifacts.statements.entries()) {
        try {
          await execute(ddl, statement);
        } catch {
          try {
            await capture.append(`ddl-failure-${ddlCount + 1}`, {
              catalog: await readCatalog(ddl),
            });
          } catch {}
          return failure("ddl", "statement_failed_no_retry", ddlCount);
        }
        ddlCount += 1;
        const catalog = await readCatalog(ddl);
        await capture.append(`ddl-${ddlCount}`, catalog);
        if (!validateStatementState(catalog, preflightA.catalog, indexPosition + 1)) {
          return failure("ddl-validation", "statement_object_validation_failed", ddlCount);
        }
      }
    } catch {
      return failure("ddl", "ddl_connection_or_validation_failed", ddlCount);
    } finally {
      await closeQuietly(ddl);
    }

    let afterDdl;
    try {
      afterDdl = await connectIndependent("0138-post-ddl-independent");
      const post = await inspectAfterDdl(afterDdl, artifacts, preflightA);
      await capture.append("post-ddl", post);
      if (!post.physicalOk || !post.ledgerUnchanged) {
        return failure("post-ddl", "physical_contract_or_ledger_deviation", ddlCount);
      }
    } catch {
      return failure("post-ddl", "independent_validation_failed", ddlCount);
    } finally {
      await closeQuietly(afterDdl);
    }

    let journal;
    try {
      journal = await connectIndependent("0138-journal");
      const freshPhysicalCheck = await inspectAfterDdl(journal, artifacts, preflightA);
      if (!freshPhysicalCheck.physicalOk || !freshPhysicalCheck.ledgerUnchanged) {
        return failure("journal", "fresh_physical_or_ledger_check_failed", ddlCount);
      }
      await capture.append("journal-precheck", freshPhysicalCheck);
      const result = await guardedJournalInsert(journal, artifacts, preflightA);
      if (!result.ok) return failure("journal", result.reason, ddlCount);
    } catch {
      return failure("journal", "journal_connection_failed", ddlCount);
    } finally {
      await closeQuietly(journal);
    }

    let finalConnection;
    try {
      finalConnection = await connectIndependent("0138-final-independent");
      const final = await finalValidation(finalConnection, artifacts, preflightA);
      if (!final) return failure("final", "final_contract_or_journal_deviation", ddlCount);
    } catch {
      return failure("final", "final_independent_validation_failed", ddlCount);
    } finally {
      await closeQuietly(finalConnection);
    }
    return report("apply", "complete", 7);
  } catch {
    return failure("preflight", "preflight_connection_or_metadata_failure");
  } finally {
    await closeQuietly(first);
    await closeQuietly(second);
    await capture?.close();
  }
}

function localIdentification() {
  return {
    ok: true,
    mode: "identification-only",
    phase: "no-database",
    ddlCount: 0,
    tables: 3,
    columns: 45,
    primaryKeys: 3,
    uniqueIndexes: 3,
    nonUniqueIndexes: 4,
  };
}

async function main() {
  const requestedApply = process.argv.slice(2).includes("--apply");
  // O CLI nunca constrói factory, gates ou conexão. Até --apply apenas informa
  // que uma integração autorizada deve chamar a API com dependências injetadas.
  const result = requestedApply
    ? { ...localIdentification(), ok: false, phase: "dependency_injection_required", reason: "cli_cannot_apply" }
    : localIdentification();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stdout.write('{"ok":false,"phase":"cli","reason":"sanitized_failure","ddlCount":0}\n');
    process.exitCode = 2;
  });
}
