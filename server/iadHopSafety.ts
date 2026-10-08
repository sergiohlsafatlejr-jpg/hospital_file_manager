import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Tabelas físicas que o executor IAD precisa observar, sem abrir conexão por conta própria. */
export const IAD_HOP_SOURCE_TABLE = "stagion_atendimentos_parados_iad";
export const IAD_HOP_DESTINATION_TABLE = "atendimentos_unificados";
export const IAD_HOP_CADASTRO_TABLE = "estabelecimentos";
export const IAD_HOP_LEGACY_INTEGRATOR_TABLE = "query_configuracoes";
export const IAD_HOP_INTEGRATOR_TABLE = "integracao_mapeamentos";

/** Ordem intencional da leitura da staging. `codpac` nunca integra esta projeção. */
export const IAD_HOP_SOURCE_COLUMNS = [
  "numatend",
  "codtipsai",
  "nomeplaco",
  "nomepac",
  "carater",
  "datatend",
  "datasai",
  "tipoatend",
  "codserv",
  "procprin",
  "codcc_destino",
  "tipoatendimentodescricao",
  "Estabelecimentos_id",
] as const;

/** Campos que a publicação insere, sem impor que o destino legado não tenha outros. */
export const IAD_HOP_DESTINATION_COLUMNS = [
  "estabelecimentoId",
  "origemSistema",
  "origemId",
  "numero_atendimento",
  "codigo_saida",
  "convenio",
  "paciente",
  "caracter_atendimento",
  "data_entrada",
  "data_saida",
  "tipo_atendimento",
  "descricao_atendimento",
  "codigo_servico",
  "codigo_procedimento",
  "destino_conta",
  "ativoNaFonte",
] as const;

export type IadPhysicalColumnMetadata = {
  /** Alias de TABLE_NAME. */
  tabela: string;
  /** Alias de COLUMN_NAME. */
  coluna: string;
  /** Alias de COLUMN_TYPE, não apenas DATA_TYPE. */
  tipo: string;
  /** Alias de DATA_TYPE. */
  dataType: string;
  /** Alias de IS_NULLABLE (YES ou NO). */
  nulo: string;
  /** Alias de ORDINAL_POSITION. */
  pos: number;
  /** Alias de CHARACTER_SET_NAME; null para tipos sem charset. */
  charset: string | null;
  /** Alias de COLLATION_NAME; null para tipos sem collation. */
  collation: string | null;
};

export type IadEngineMetadata = {
  /** Alias de TABLE_NAME. */
  tabela: string;
  /** Alias de ENGINE. */
  engine: string;
};

export type IadIndexMetadata = {
  /** Alias de TABLE_NAME. */
  tabela: string;
  /** Alias de INDEX_NAME. */
  indice: string;
  /** Alias de COLUMN_NAME. */
  coluna: string;
  /** Alias de SEQ_IN_INDEX. */
  pos: number;
  /** Alias de NON_UNIQUE (0 para índice único). */
  nonUnique: number;
};

export type BuildIadPhysicalContractArgs = {
  /** Metadados de information_schema.COLUMNS somente da origem IAD e do destino. */
  columns: IadPhysicalColumnMetadata[];
  /** Mesmos campos de COLUMNS observados em uma staging HUP de referência. */
  hupColumns: IadPhysicalColumnMetadata[];
  /** Metadados de TABLES para as cinco tabelas observadas. */
  engines: IadEngineMetadata[];
  /** Metadados de STATISTICS para as tabelas observadas. */
  indexes: IadIndexMetadata[];
  /** Contagem já obtida pelo chamador de information_schema.TRIGGERS para as tabelas envolvidas. */
  triggerCount: number;
};

export type IadPhysicalContract = {
  sha256: string;
  /** Nomes de coluna seguros e fixos para a projeção SELECT da origem. */
  projection: string[];
  /** Serialização determinística que foi hasheada, útil para manifesto privado/auditoria local. */
  canonicalJson: string;
};

type CanonicalColumn = {
  tabela: string;
  coluna: string;
  tipo: string;
  dataType: string;
  nulo: "YES" | "NO";
  pos: number;
  charset: string | null;
  collation: string | null;
};

type CanonicalEngine = { tabela: string; engine: string };
type CanonicalIndex = {
  tabela: string;
  indice: string;
  coluna: string;
  pos: number;
  nonUnique: 0 | 1;
};

const REQUIRED_ENGINES = [
  IAD_HOP_SOURCE_TABLE,
  IAD_HOP_DESTINATION_TABLE,
  IAD_HOP_CADASTRO_TABLE,
  IAD_HOP_LEGACY_INTEGRATOR_TABLE,
  IAD_HOP_INTEGRATOR_TABLE,
] as const;

function safetyError(message: string): never {
  throw new Error(`IAD safety validation failed: ${message}`);
}

function normalizedName(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) safetyError(`${label} ausente.`);
  return value.trim().toLowerCase();
}

function normalizedNullable(value: string): "YES" | "NO" {
  const normalized = normalizedName(value, "nulo").toUpperCase();
  if (normalized !== "YES" && normalized !== "NO") safetyError("nulo deve ser YES ou NO.");
  return normalized;
}

function normalizedOptionalText(value: string | null, label: string): string | null {
  if (value === null) return null;
  return normalizedName(value, label);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) safetyError(`${label} deve ser inteiro positivo.`);
  return value;
}

function canonicalColumn(value: IadPhysicalColumnMetadata): CanonicalColumn {
  return {
    tabela: normalizedName(value.tabela, "tabela"),
    coluna: normalizedName(value.coluna, "coluna"),
    tipo: normalizedName(value.tipo, "COLUMN_TYPE"),
    dataType: normalizedName(value.dataType, "DATA_TYPE"),
    nulo: normalizedNullable(value.nulo),
    pos: positiveInteger(value.pos, "posição da coluna"),
    charset: normalizedOptionalText(value.charset, "charset"),
    collation: normalizedOptionalText(value.collation, "collation"),
  };
}

function canonicalEngine(value: IadEngineMetadata): CanonicalEngine {
  return {
    tabela: normalizedName(value.tabela, "tabela de engine"),
    engine: normalizedName(value.engine, "engine"),
  };
}

function canonicalIndex(value: IadIndexMetadata): CanonicalIndex {
  if (value.nonUnique !== 0 && value.nonUnique !== 1) {
    safetyError("NON_UNIQUE deve ser 0 ou 1.");
  }
  return {
    tabela: normalizedName(value.tabela, "tabela de índice"),
    indice: normalizedName(value.indice, "índice"),
    coluna: normalizedName(value.coluna, "coluna de índice"),
    pos: positiveInteger(value.pos, "posição de índice"),
    nonUnique: value.nonUnique,
  };
}

function sorted<T>(values: T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => {
    const a = key(left);
    const b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function uniqueColumns(columns: CanonicalColumn[], label: string): Map<string, CanonicalColumn> {
  const byName = new Map<string, CanonicalColumn>();
  for (const column of columns) {
    if (byName.has(column.coluna)) safetyError(`${label} contém coluna duplicada.`);
    byName.set(column.coluna, column);
  }
  return byName;
}

function requireColumnSet(
  columns: CanonicalColumn[],
  expected: readonly string[],
  label: string,
): Map<string, CanonicalColumn> {
  const byName = uniqueColumns(columns, label);
  for (const name of expected) {
    if (!byName.has(name.toLowerCase())) safetyError(`${label} não contém coluna obrigatória.`);
  }
  return byName;
}

function sameHupPhysicalType(source: CanonicalColumn, hup: CanonicalColumn): boolean {
  return source.tipo === hup.tipo
    && source.dataType === hup.dataType
    && source.nulo === hup.nulo
    && source.charset === hup.charset
    && source.collation === hup.collation;
}

function isPlainIntColumn(column: CanonicalColumn): boolean {
  return column.dataType === "int" && /^int(?:\(\d+\))?$/.test(column.tipo);
}

function groupedIndexes(indexes: CanonicalIndex[], table: string): Map<string, CanonicalIndex[]> {
  const groups = new Map<string, CanonicalIndex[]>();
  for (const index of indexes) {
    if (index.tabela !== table) continue;
    const current = groups.get(index.indice) ?? [];
    current.push(index);
    groups.set(index.indice, current);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < group.length; i += 1) {
      if (group[i]!.pos !== i + 1) safetyError("índice possui posições não contíguas.");
    }
  }
  return groups;
}

function hasLeadingColumn(indexes: CanonicalIndex[], table: string, column: string): boolean {
  return [...groupedIndexes(indexes, table).values()].some((group) => group[0]?.coluna === column);
}

function hasExactUniqueIndex(
  indexes: CanonicalIndex[],
  table: string,
  columns: readonly string[],
): boolean {
  return [...groupedIndexes(indexes, table).values()].some((group) =>
    group.length === columns.length
    && group.every((entry, index) => entry.nonUnique === 0 && entry.coluna === columns[index]!.toLowerCase()),
  );
}

/**
 * Valida metadados físicos já lidos pelo chamador e cria o digest canônico do contrato.
 * Não abre banco, não emite SQL e não tenta impor que o destino legado seja igual à migração 0134.
 */
export function buildIadPhysicalContract(args: BuildIadPhysicalContractArgs): IadPhysicalContract {
  if (!Number.isSafeInteger(args.triggerCount) || args.triggerCount < 0) {
    safetyError("contagem de triggers inválida.");
  }
  if (args.triggerCount > 0) safetyError("triggers nas tabelas da publicação não são permitidos.");

  const columns = args.columns.map(canonicalColumn);
  const allowedColumnTables = new Set([IAD_HOP_SOURCE_TABLE, IAD_HOP_DESTINATION_TABLE]);
  if (columns.some((column) => !allowedColumnTables.has(column.tabela))) {
    safetyError("columns deve conter somente origem IAD e destino.");
  }
  const source = columns.filter((column) => column.tabela === IAD_HOP_SOURCE_TABLE);
  const destination = columns.filter((column) => column.tabela === IAD_HOP_DESTINATION_TABLE);

  const sourceByName = requireColumnSet(source, IAD_HOP_SOURCE_COLUMNS, "origem IAD");
  const sourceNames = new Set(source.map((column) => column.coluna));
  const allowedSourceNames = new Set([...IAD_HOP_SOURCE_COLUMNS.map((column) => column.toLowerCase()), "codpac"]);
  if (source.length !== IAD_HOP_SOURCE_COLUMNS.length && source.length !== IAD_HOP_SOURCE_COLUMNS.length + 1) {
    safetyError("origem IAD deve ter exatamente 13 colunas ou as 13 mais codpac.");
  }
  if ([...sourceNames].some((name) => !allowedSourceNames.has(name))) {
    safetyError("origem IAD contém coluna fora do contrato de 13 campos e codpac opcional.");
  }
  if (sourceByName.has("codpac")) {
    const codpac = sourceByName.get("codpac")!;
    if (!isPlainIntColumn(codpac) || codpac.nulo !== "YES") {
      safetyError("codpac deve ser INT NULL quando existir.");
    }
  }

  const hup = args.hupColumns.map(canonicalColumn);
  const hupByName = requireColumnSet(hup, IAD_HOP_SOURCE_COLUMNS, "referência HUP");
  for (const name of IAD_HOP_SOURCE_COLUMNS) {
    if (!sameHupPhysicalType(sourceByName.get(name.toLowerCase())!, hupByName.get(name.toLowerCase())!)) {
      safetyError("tipo físico da origem IAD difere da referência HUP.");
    }
  }

  requireColumnSet(destination, IAD_HOP_DESTINATION_COLUMNS, "destino");
  for (const name of ["data_entrada", "data_saida"]) {
    const column = destination.find((candidate) => candidate.coluna === name)!;
    if (column.dataType !== "datetime") safetyError("datas do destino devem ser DATETIME.");
  }

  const engines = args.engines.map(canonicalEngine);
  const enginesByTable = new Map<string, CanonicalEngine>();
  for (const engine of engines) {
    if (enginesByTable.has(engine.tabela)) safetyError("metadata de engine duplicado.");
    enginesByTable.set(engine.tabela, engine);
  }
  for (const table of REQUIRED_ENGINES) {
    if (enginesByTable.get(table)?.engine !== "innodb") {
      safetyError("as cinco tabelas observadas devem usar InnoDB.");
    }
  }

  const indexes = args.indexes.map(canonicalIndex);
  if (!hasExactUniqueIndex(indexes, IAD_HOP_DESTINATION_TABLE, ["estabelecimentoid", "origemsistema", "origemid"])) {
    safetyError("destino exige índice único exato por estabelecimento, sistema e origem.");
  }
  for (const table of [IAD_HOP_DESTINATION_TABLE, IAD_HOP_LEGACY_INTEGRATOR_TABLE, IAD_HOP_INTEGRATOR_TABLE]) {
    if (!hasLeadingColumn(indexes, table, "estabelecimentoid")) {
      safetyError("destino e integradores exigem índice iniciado por estabelecimentoId.");
    }
  }
  if (!hasExactUniqueIndex(indexes, IAD_HOP_CADASTRO_TABLE, ["id"])) {
    safetyError("cadastro exige chave primária id.");
  }
  const cadastroPrimary = groupedIndexes(indexes, IAD_HOP_CADASTRO_TABLE).get("primary");
  if (!cadastroPrimary || cadastroPrimary.length !== 1 || cadastroPrimary[0]!.coluna !== "id" || cadastroPrimary[0]!.nonUnique !== 0) {
    safetyError("cadastro exige PRIMARY KEY (id).");
  }

  const canonical = {
    version: 1,
    triggerCount: args.triggerCount,
    columns: sorted(columns, (column) => `${column.tabela}\u0000${column.pos.toString().padStart(10, "0")}\u0000${column.coluna}`),
    hupColumns: sorted(hup, (column) => `${column.tabela}\u0000${column.pos.toString().padStart(10, "0")}\u0000${column.coluna}`),
    engines: sorted(engines, (engine) => engine.tabela),
    indexes: sorted(indexes, (index) => `${index.tabela}\u0000${index.indice}\u0000${index.pos.toString().padStart(10, "0")}\u0000${index.coluna}`),
  };
  const canonicalJson = JSON.stringify(canonical);
  return {
    sha256: createHash("sha256").update(canonicalJson).digest("hex"),
    projection: [...IAD_HOP_SOURCE_COLUMNS],
    canonicalJson,
  };
}

function privateError(message: string): never {
  throw new Error(`IAD private storage rejected: ${message}`);
}

function currentUid(): number {
  if (typeof process.getuid !== "function") privateError("UID do processo indisponível.");
  return process.getuid();
}

function permissionBits(stat: fs.Stats): number {
  return stat.mode & 0o777;
}

function assertPrivateDirectory(directory: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(directory);
  } catch {
    privateError("diretório privado inexistente.");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) privateError("diretório privado não pode ser link nem arquivo.");
  if (stat.uid !== currentUid()) privateError("diretório privado deve pertencer ao UID atual.");
  if (permissionBits(stat) !== 0o700) privateError("diretório privado deve ter permissão 0700.");
}

function inspectedPrivateRoot(root: string): string {
  if (typeof root !== "string" || !path.isAbsolute(root)) privateError("root deve ser absoluto.");
  const lexical = path.resolve(root);
  assertPrivateDirectory(lexical);
  let real: string;
  try {
    real = fs.realpathSync.native(lexical);
  } catch {
    privateError("root privado não pôde ser resolvido.");
  }
  if (real !== lexical) privateError("root privado não pode atravessar symlink.");
  return real;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolvePrivateFile(root: string, filePath: string): { root: string; target: string } {
  const safeRoot = inspectedPrivateRoot(root);
  if (typeof filePath !== "string" || !filePath.trim()) privateError("caminho privado ausente.");
  const target = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(safeRoot, filePath);
  if (!isInside(safeRoot, target)) privateError("caminho privado escapa do root aprovado.");

  const relativeParts = path.relative(safeRoot, target).split(path.sep);
  let current = safeRoot;
  for (const part of relativeParts.slice(0, -1)) {
    current = path.join(current, part);
    assertPrivateDirectory(current);
    const real = fs.realpathSync.native(current);
    if (!isInside(safeRoot, real)) privateError("subdiretório privado resolve fora do root.");
  }
  return { root: safeRoot, target };
}

function assertPrivateRegularFile(filePath: string): fs.Stats {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    privateError("arquivo privado inexistente.");
  }
  if (stat.isSymbolicLink() || !stat.isFile()) privateError("arquivo privado não pode ser link nem diretório.");
  if (stat.uid !== currentUid()) privateError("arquivo privado deve pertencer ao UID atual.");
  if (permissionBits(stat) !== 0o600) privateError("arquivo privado deve ter permissão 0600.");
  return stat;
}

function fsyncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function encodeJson(value: unknown): Buffer {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    privateError("valor não é serializável como JSON.");
  }
  if (typeof json !== "string") privateError("valor JSON indefinido não pode ser persistido.");
  return Buffer.from(`${json}\n`, "utf8");
}

/** Escrita exclusiva: final só aparece completo; arquivo e diretório são fsyncados. */
function writePrivateFileExclusive(root: string, filePath: string, data: Buffer): string {
  const location = resolvePrivateFile(root, filePath);
  try {
    fs.lstatSync(location.target);
    privateError("arquivo final já existe; escrita exclusiva recusada.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const directory = path.dirname(location.target);
  const base = path.basename(location.target);
  let temporary = "";
  let linked = false;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      temporary = path.join(directory, `.${base}.${randomBytes(18).toString("hex")}.tmp`);
      try {
        const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        try {
          fs.writeFileSync(descriptor, data);
          fs.fchmodSync(descriptor, 0o600);
          fs.fsyncSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 7) throw error;
      }
    }
    if (!temporary) privateError("não foi possível reservar arquivo temporário.");

    // link(2) cria o nome final somente se ainda não existir; rename poderia sobrescrevê-lo.
    fs.linkSync(temporary, location.target);
    linked = true;
    fsyncDirectory(directory);
    assertPrivateRegularFile(location.target);
    fs.unlinkSync(temporary);
    temporary = "";
    fsyncDirectory(directory);
    return location.target;
  } catch (error) {
    if (temporary) {
      try { fs.unlinkSync(temporary); } catch { /* limpeza de melhor esforço */ }
    }
    if (linked) {
      // O final já passou por fsync; não apagá-lo evita transformar uma falha de limpeza em perda de backup.
    }
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      privateError("arquivo final já existe; escrita exclusiva recusada.");
    }
    throw error;
  }
}

function readPrivateFile(root: string, filePath: string): Buffer {
  const location = resolvePrivateFile(root, filePath);
  assertPrivateRegularFile(location.target);
  const descriptor = fs.openSync(location.target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== currentUid() || permissionBits(stat) !== 0o600) {
      privateError("arquivo privado mudou ou perdeu as proteções exigidas.");
    }
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Lê JSON somente de um arquivo regular 0600 pertencente ao UID atual dentro de root 0700. */
export function readPrivateJson<T = unknown>(root: string, filePath: string): T {
  const contents = readPrivateFile(root, filePath);
  try {
    return JSON.parse(contents.toString("utf8")) as T;
  } catch {
    privateError("arquivo privado não contém JSON válido.");
  }
}

/** Persiste JSON sem sobrescrever, por arquivo temporário aleatório, link exclusivo e fsync de arquivo/diretório. */
export function writePrivateJsonExclusive(root: string, filePath: string, value: unknown): string {
  return writePrivateFileExclusive(root, filePath, encodeJson(value));
}

function removeNewPrivateFile(root: string, filePath: string): void {
  try {
    const location = resolvePrivateFile(root, filePath);
    assertPrivateRegularFile(location.target);
    fs.unlinkSync(location.target);
    fsyncDirectory(path.dirname(location.target));
  } catch {
    // Não remove links/arquivos que não satisfaçam as proteções; limpeza nunca deve ampliar escopo.
  }
}

type EncryptedBackupEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

function backupFileNames(cipherRoot: string, keyRoot: string): { ciphertextPath: string; keyPath: string } {
  const suffix = `${Date.now()}-${randomBytes(18).toString("hex")}`;
  return {
    ciphertextPath: path.join(inspectedPrivateRoot(cipherRoot), `iad-backup-${suffix}.enc.json`),
    keyPath: path.join(inspectedPrivateRoot(keyRoot), `iad-backup-${suffix}.key`),
  };
}

/**
 * Gera chave AES-256-GCM própria e grava chave e cifra em roots privados distintos.
 * O retorno contém somente caminhos; nem payload, chave ou ciphertext são logados.
 */
export function writeEncryptedBackupVerified(
  cipherRoot: string,
  keyRoot: string,
  payload: unknown,
): { ciphertextPath: string; keyPath: string } {
  const safeCipherRoot = inspectedPrivateRoot(cipherRoot);
  const safeKeyRoot = inspectedPrivateRoot(keyRoot);
  if (safeCipherRoot === safeKeyRoot || isInside(safeCipherRoot, safeKeyRoot) || isInside(safeKeyRoot, safeCipherRoot)) {
    privateError("roots de ciphertext e chave devem ser distintos e não aninhados.");
  }

  const plaintext = encodeJson(payload);
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedBackupEnvelope = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
  const names = backupFileNames(safeCipherRoot, safeKeyRoot);
  let keyWritten = false;
  let cipherWritten = false;
  try {
    writePrivateFileExclusive(safeKeyRoot, names.keyPath, key);
    keyWritten = true;
    writePrivateJsonExclusive(safeCipherRoot, names.ciphertextPath, envelope);
    cipherWritten = true;

    // Reabre os dois artefatos do disco antes de aceitar o backup.
    const savedKey = readPrivateFile(safeKeyRoot, names.keyPath);
    const savedEnvelope = readPrivateJson<EncryptedBackupEnvelope>(safeCipherRoot, names.ciphertextPath);
    if (savedKey.length !== 32 || savedEnvelope.version !== 1 || savedEnvelope.algorithm !== "aes-256-gcm"
      || typeof savedEnvelope.iv !== "string" || typeof savedEnvelope.tag !== "string" || typeof savedEnvelope.ciphertext !== "string") {
      privateError("backup relido não tem envelope AES-256-GCM válido.");
    }
    const verifier = createDecipheriv("aes-256-gcm", savedKey, Buffer.from(savedEnvelope.iv, "base64"));
    verifier.setAuthTag(Buffer.from(savedEnvelope.tag, "base64"));
    const recovered = Buffer.concat([
      verifier.update(Buffer.from(savedEnvelope.ciphertext, "base64")),
      verifier.final(),
    ]);
    if (!recovered.equals(plaintext)) privateError("round-trip do backup divergiu.");
    return names;
  } catch (error) {
    if (cipherWritten) removeNewPrivateFile(safeCipherRoot, names.ciphertextPath);
    if (keyWritten) removeNewPrivateFile(safeKeyRoot, names.keyPath);
    throw error;
  } finally {
    key.fill(0);
  }
}
