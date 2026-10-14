import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import pg from "pg";
import { SignJWT, jwtVerify } from "jose";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getRawPool } from "./db";
import { resolverEasyLocalConfig } from "./easyLocalCadastroStore";
import {
  EASYLOCAL_IMPORTACAO_LIMITE,
  EASYLOCAL_PREVIA_TTL_SEGUNDOS,
  easyLocalImportacaoExecutarInput,
  easyLocalImportacaoPreviaInput,
  type EasyLocalImportacaoExecutarInput,
  type EasyLocalImportacaoPrevia,
  type EasyLocalImportacaoPreviaInput,
  type EasyLocalImportacaoResultado,
} from "../shared/easyLocalImportacao";
import {
  easyLocalColuna,
  easyLocalIdentifier,
  easyLocalLeitura,
  easyLocalNomeFisico,
  type EasyLocalColuna,
  type EasyLocalLeituraInput,
} from "../shared/easyLocalIntegrador";

const MARKER = "easylocal-direto-v1";
const CONNECTION_ALIAS = "__EASYLOCAL_SERVER__";
const TOKEN_ISSUER = "safatle-easylocal-importacao";
const TOKEN_AUDIENCE = "safatle-easylocal-importacao";
const CONNECTION_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 15000;

type SqlRow = RowDataPacket & Record<string, unknown>;
type SourceColumn = {
  nome: string;
  tipo: string;
  udt: string;
  nullable: boolean;
  tamanho: number | null;
  precisao: number | null;
  escala: number | null;
  precisaoDataHora: number | null;
  ordem: number;
};
type DestinationColumn = {
  nome: string;
  tipo: string;
  nullable: boolean;
  tamanho: number | null;
  precisao: number | null;
  escala: number | null;
  defaultValue: unknown;
  chave: string;
  extra: string;
  ordem: number;
};
type LockedConfiguration = {
  leituraId: number;
  tabelaId: number;
  nomeTabelaMeta: string;
  nomeTabelaFisica: string;
  leitura: EasyLocalLeituraInput;
  colunas: EasyLocalColuna[];
  mappingState: Record<string, unknown>;
  tableState: Record<string, unknown>;
  connectionState: Record<string, unknown>;
};
type SourceSnapshot = {
  configDigest: string;
  columns: SourceColumn[];
  primaryKey: string[];
  rows: Array<Record<string, unknown>>;
};
type ImportPlan = {
  configuration: LockedConfiguration;
  source: SourceSnapshot;
  destinationColumns: DestinationColumn[];
  destinationRows: Map<string, Record<string, unknown>>;
  fingerprint: string;
  counts: ImportCounts;
};
type ImportCounts = {
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosInalterados: number;
};
type TokenClaims = {
  usuarioId: number;
  leituraId: number;
  estabelecimentoId: number;
  fingerprint: string;
  expiraEm: string;
};

function fail(
  code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}

function requireActor(usuarioId: number): void {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    fail("BAD_REQUEST", "Usuário responsável pela importação é inválido.");
  }
}

function sanitize(error: unknown, message: string): never {
  if (error instanceof TRPCError) throw error;
  fail("INTERNAL_SERVER_ERROR", message);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function quotedMysql(identifier: string): string {
  return `\`${easyLocalIdentifier.parse(identifier)}\``;
}

function quotedPostgres(identifier: string): string {
  return `"${easyLocalIdentifier.parse(identifier)}"`;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function parseDescriptor(raw: unknown): EasyLocalColuna[] | null {
  try {
    const parsed = JSON.parse(
      typeof raw === "string" ? raw : "null"
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const record = parsed as Record<string, unknown>;
    if (record.marker !== MARKER || !Array.isArray(record.colunas)) return null;
    const columns = record.colunas.map(column => easyLocalColuna.parse(column));
    if (
      !columns.length ||
      new Set(columns.map(column => column.nome)).size !== columns.length
    )
      return null;
    return columns;
  } catch {
    return null;
  }
}

function expectedPhysicalName(
  metaName: unknown,
  estabelecimentoId: number
): string | null {
  if (typeof metaName !== "string") return null;
  const prefix = `el_${estabelecimentoId}_`;
  if (!metaName.startsWith(prefix)) return null;
  try {
    const suffix = easyLocalIdentifier
      .max(28)
      .parse(metaName.slice(prefix.length));
    return easyLocalNomeFisico(estabelecimentoId, suffix);
  } catch {
    return null;
  }
}

async function acquireDestination(): Promise<PoolConnection> {
  try {
    const pool = await getRawPool();
    if (!pool) fail("INTERNAL_SERVER_ERROR", "Destino do Portal indisponível.");
    return await pool.getConnection();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("INTERNAL_SERVER_ERROR", "Destino do Portal indisponível.");
  }
}

function releaseQuietly(connection: PoolConnection): void {
  try {
    connection.release();
  } catch {
    // Nunca substitui uma resposta sanitizada.
  }
}

function destroyQuietly(connection: PoolConnection): void {
  try {
    connection.destroy();
  } catch {
    // Nunca substitui uma resposta sanitizada.
  }
}

async function rollbackOrDestroy(connection: PoolConnection): Promise<boolean> {
  try {
    await connection.rollback();
    return true;
  } catch {
    // Uma conexão que não confirmou rollback pode continuar em transação no pool.
    destroyQuietly(connection);
    return false;
  }
}

async function startDestinationTransaction(
  connection: PoolConnection
): Promise<void> {
  try {
    const [rows] = await connection.query<SqlRow[]>(
      "SELECT VERSION() AS versao"
    );
    if (rows.length !== 1 || typeof rows[0]?.versao !== "string") {
      fail(
        "INTERNAL_SERVER_ERROR",
        "Modo transacional do destino não confirmado."
      );
    }
    if (/tidb/i.test(rows[0].versao))
      await connection.query("BEGIN PESSIMISTIC");
    else await connection.beginTransaction();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail(
      "INTERNAL_SERVER_ERROR",
      "Modo transacional do destino não confirmado."
    );
  }
}

async function lockAndLoadConfiguration(
  connection: PoolConnection,
  input: EasyLocalImportacaoPreviaInput
): Promise<LockedConfiguration> {
  const [units] = await connection.execute<SqlRow[]>(
    "SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE",
    [input.estabelecimentoId]
  );
  if (units.length !== 1) fail("NOT_FOUND", "Estabelecimento não encontrado.");

  const [maps] = await connection.execute<SqlRow[]>(
    "SELECT id, tabelaDestinoId, conexaoOrigemId, descricao, queryOrigem, campoChave, frequencia, ativo, estabelecimentoId, modoImportacao, colunaControle, ultimoValorControle, ultimaSincronizacao, totalRegistrosImportados FROM integracao_mapeamentos WHERE id = ? AND estabelecimentoId = ? FOR UPDATE",
    [input.leituraId, input.estabelecimentoId]
  );
  if (maps.length !== 1)
    fail("NOT_FOUND", "Leitura EASYLocal não encontrada nesta unidade.");
  const map = maps[0]!;

  const [tables] = await connection.execute<SqlRow[]>(
    "SELECT id, nome, descricao, estabelecimentoId, criadaNoBanco, totalRegistros, atualizadoEm FROM integracao_tabelas WHERE id = ? AND estabelecimentoId = ? FOR UPDATE",
    [map.tabelaDestinoId, input.estabelecimentoId]
  );
  if (tables.length !== 1)
    fail("NOT_FOUND", "Tabela gerenciada não encontrada nesta unidade.");
  const table = tables[0]!;

  const [connections] = await connection.execute<SqlRow[]>(
    "SELECT id, nome, descricao, tipo, host, porta, banco, usuario, `ssl`, estabelecimentoId, ativo FROM integracao_conexoes WHERE id = ? AND estabelecimentoId = ? FOR UPDATE",
    [map.conexaoOrigemId, input.estabelecimentoId]
  );
  if (connections.length !== 1)
    fail("CONFLICT", "A origem configurada requer conferência.");
  const sourceConnection = connections[0]!;

  const columns = parseDescriptor(table.descricao);
  const physicalName = expectedPhysicalName(
    table.nome,
    input.estabelecimentoId
  );
  let leitura: EasyLocalLeituraInput;
  let mapDescription: Record<string, unknown> | null = null;
  try {
    leitura = easyLocalLeitura.parse(JSON.parse(String(map.queryOrigem)));
    const parsed = JSON.parse(
      typeof map.descricao === "string" ? map.descricao : "null"
    ) as unknown;
    mapDescription =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  }

  if (
    !columns ||
    !physicalName ||
    table.criadaNoBanco !== "sim" ||
    mapDescription?.marker !== MARKER ||
    map.ativo !== "nao" ||
    map.frequencia !== "manual" ||
    map.modoImportacao !== "incremental" ||
    leitura.estabelecimentoId !== input.estabelecimentoId ||
    leitura.tabelaId !== Number(table.id) ||
    leitura.campoChave !== map.campoChave ||
    !columns.some(column => column.nome === leitura.campoChave) ||
    sourceConnection.nome !== CONNECTION_ALIAS ||
    sourceConnection.descricao !== MARKER ||
    sourceConnection.tipo !== "postgresql" ||
    sourceConnection.ativo !== "nao"
  ) {
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  }

  return {
    leituraId: Number(map.id),
    tabelaId: Number(table.id),
    nomeTabelaMeta: String(table.nome),
    nomeTabelaFisica: physicalName,
    leitura,
    colunas: columns,
    mappingState: {
      id: map.id,
      tabelaDestinoId: map.tabelaDestinoId,
      conexaoOrigemId: map.conexaoOrigemId,
      descricao: map.descricao,
      queryOrigem: map.queryOrigem,
      campoChave: map.campoChave,
      frequencia: map.frequencia,
      ativo: map.ativo,
      estabelecimentoId: map.estabelecimentoId,
      modoImportacao: map.modoImportacao,
      colunaControle: map.colunaControle,
      ultimoValorControle: map.ultimoValorControle,
      ultimaSincronizacao: dateFingerprint(map.ultimaSincronizacao),
      totalRegistrosImportados: map.totalRegistrosImportados,
    },
    tableState: {
      id: table.id,
      nome: table.nome,
      descricao: table.descricao,
      estabelecimentoId: table.estabelecimentoId,
      criadaNoBanco: table.criadaNoBanco,
      totalRegistros: table.totalRegistros,
      atualizadoEm: dateFingerprint(table.atualizadoEm),
    },
    connectionState: {
      id: sourceConnection.id,
      nome: sourceConnection.nome,
      descricao: sourceConnection.descricao,
      tipo: sourceConnection.tipo,
      host: sourceConnection.host,
      porta: sourceConnection.porta,
      banco: sourceConnection.banco,
      usuario: sourceConnection.usuario,
      ssl: sourceConnection.ssl,
      estabelecimentoId: sourceConnection.estabelecimentoId,
      ativo: sourceConnection.ativo,
    },
  };
}

function dateFingerprint(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function loadDestinationColumns(
  connection: PoolConnection,
  tableName: string,
  columns: EasyLocalColuna[],
  estabelecimentoId: number
): Promise<DestinationColumn[]> {
  const [rows] = await connection.execute<SqlRow[]>(
    "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, ORDINAL_POSITION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [tableName]
  );
  const destination = rows.map(row => ({
    nome: String(row.COLUMN_NAME ?? ""),
    tipo: String(row.DATA_TYPE ?? "").toLowerCase(),
    nullable: row.IS_NULLABLE === "YES",
    tamanho: nullableNumber(row.CHARACTER_MAXIMUM_LENGTH),
    precisao: nullableNumber(row.NUMERIC_PRECISION),
    escala: nullableNumber(row.NUMERIC_SCALE),
    defaultValue: row.COLUMN_DEFAULT,
    chave: String(row.COLUMN_KEY ?? ""),
    extra: String(row.EXTRA ?? "").toLowerCase(),
    ordem: nullableNumber(row.ORDINAL_POSITION) ?? 0,
  }));
  validateDestinationPhysical(destination, columns, estabelecimentoId);
  return destination;
}

function validateDestinationPhysical(
  physical: DestinationColumn[],
  columns: EasyLocalColuna[],
  estabelecimentoId: number
): void {
  if (physical.length !== columns.length + 3) {
    fail("CONFLICT", "A estrutura física do destino requer conferência.");
  }
  const id = physical[0];
  const unit = physical[1];
  const synced = physical.at(-1);
  if (
    !id ||
    id.nome !== "_id" ||
    id.tipo !== "bigint" ||
    id.nullable ||
    id.chave !== "PRI" ||
    !id.extra.includes("auto_increment") ||
    !unit ||
    unit.nome !== "estabelecimento_id" ||
    unit.tipo !== "int" ||
    unit.nullable ||
    Number(unit.defaultValue) !== estabelecimentoId ||
    !synced ||
    synced.nome !== "_sincronizado_em" ||
    synced.tipo !== "datetime" ||
    !synced.nullable
  ) {
    fail("CONFLICT", "A estrutura física do destino requer conferência.");
  }
  for (const [index, configured] of columns.entries()) {
    const column = physical[index + 2];
    const expectedType =
      configured.tipo === "boolean" ? "tinyint" : configured.tipo;
    if (
      !column ||
      column.nome !== configured.nome ||
      column.tipo !== expectedType ||
      column.nullable === configured.obrigatorio ||
      column.chave !== "" ||
      column.extra !== "" ||
      (configured.tipo === "varchar" &&
        column.tamanho !== (configured.tamanho ?? 255)) ||
      (configured.tipo === "decimal" &&
        (column.precisao !== (configured.tamanho ?? 18) ||
          column.escala !== (configured.escala ?? 2)))
    ) {
      fail("CONFLICT", "A estrutura física do destino requer conferência.");
    }
  }
}

function createPgClient(
  config: NonNullable<Awaited<ReturnType<typeof resolverEasyLocalConfig>>>
): pg.Client {
  const types = new pg.TypeOverrides(pg.types);
  // Valores que não podem passar por IEEE-754 permanecem texto no driver.
  types.setTypeParser(20, value => value);
  types.setTypeParser(1700, value => value);
  // Datas civis permanecem texto, sem conversão de fuso horário no cliente.
  types.setTypeParser(1082, value => value);
  types.setTypeParser(1114, value => value);
  return new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: {
      ...(config.ca ? { ca: config.ca } : {}),
      rejectUnauthorized: true,
      servername: config.host,
    },
    types,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    application_name: "safatle-easylocal-manual-import",
  });
}

async function closePgClient(client: pg.Client | undefined): Promise<void> {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // Cliente é descartável; nenhum detalhe do driver deve sair do serviço.
  }
}

async function sourceSnapshot(
  configuration: LockedConfiguration
): Promise<SourceSnapshot> {
  let client: pg.Client | undefined;
  let transactionStarted = false;
  try {
    const config = await resolverEasyLocalConfig();
    if (!config)
      fail("CONFLICT", "A configuração da origem EASYLocal está pendente.");
    client = createPgClient(config);
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    transactionStarted = true;

    const columns = await sourceColumns(client, configuration);
    const primaryKey = await sourcePrimaryKey(client, configuration.leitura);
    // A PK do catálogo é apenas uma evidência para a impressão da prévia. Views
    // e recortes com chave estável válida não precisam declarar uma PK física.
    validateSourceColumns(columns, configuration);

    const selectedNames = configuration.colunas.map(column => column.nome);
    const selectList = selectedNames.map(quotedPostgres).join(", ");
    const sql = `SELECT ${selectList} FROM ${quotedPostgres(configuration.leitura.origem.schema)}.${quotedPostgres(configuration.leitura.origem.tabela)} WHERE ${quotedPostgres(configuration.leitura.colunaEstabelecimento)} = $1 ORDER BY ${quotedPostgres(configuration.leitura.campoChave)} ASC LIMIT $2`;
    const response = await client.query<Record<string, unknown>>(sql, [
      configuration.leitura.valorEstabelecimento,
      EASYLOCAL_IMPORTACAO_LIMITE + 1,
    ]);
    if (response.rows.length > EASYLOCAL_IMPORTACAO_LIMITE) {
      fail(
        "BAD_REQUEST",
        `A origem excede o limite manual de ${EASYLOCAL_IMPORTACAO_LIMITE} registros. Refine a leitura antes de importar.`
      );
    }
    const rows = response.rows.map(row =>
      normalizeSourceRow(row, configuration.colunas)
    );
    const key = configuration.leitura.campoChave;
    const seen = new Set<string>();
    for (const row of rows) {
      const keyValue = row[key];
      if (keyValue === null || keyValue === undefined) {
        fail("BAD_REQUEST", "A chave da origem não pode ser nula.");
      }
      const signature = stable(keyValue);
      if (seen.has(signature)) {
        fail(
          "CONFLICT",
          "A origem possui chaves duplicadas; corrija antes de importar."
        );
      }
      seen.add(signature);
    }
    rows.sort((left, right) =>
      compareStable(stable(left[key]), stable(right[key]))
    );

    return {
      configDigest: digest({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ca: config.ca ?? null,
      }),
      columns,
      primaryKey,
      rows,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Não foi possível ler a origem EASYLocal com segurança."
    );
  } finally {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // A conexão será sempre fechada abaixo.
      }
    }
    await closePgClient(client);
  }
}

async function sourceColumns(
  client: pg.Client,
  configuration: LockedConfiguration
): Promise<SourceColumn[]> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT c.column_name AS nome,
            c.data_type AS tipo,
            c.udt_name AS udt,
            c.is_nullable AS nullable,
            c.character_maximum_length AS tamanho,
            c.numeric_precision AS precisao,
            c.numeric_scale AS escala,
            c.datetime_precision AS precisao_data_hora,
            c.ordinal_position AS ordem
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = $1
         AND c.table_name = $2
         AND t.table_type IN ('BASE TABLE', 'VIEW')
         AND has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'SELECT')
       ORDER BY c.ordinal_position`,
    [configuration.leitura.origem.schema, configuration.leitura.origem.tabela]
  );
  if (!result.rows.length)
    fail("NOT_FOUND", "A tabela de origem não está disponível para leitura.");
  const all = result.rows.map(row => ({
    nome: typeof row.nome === "string" ? row.nome : "",
    tipo: typeof row.tipo === "string" ? row.tipo.toLowerCase() : "",
    udt: typeof row.udt === "string" ? row.udt.toLowerCase() : "",
    nullable: row.nullable === "YES",
    tamanho: nullableNumber(row.tamanho),
    precisao: nullableNumber(row.precisao),
    escala: nullableNumber(row.escala),
    precisaoDataHora: nullableNumber(row.precisao_data_hora),
    ordem: nullableNumber(row.ordem) ?? 0,
  }));
  const required = new Set([
    ...configuration.colunas.map(column => column.nome),
    configuration.leitura.colunaEstabelecimento,
    configuration.leitura.campoChave,
  ]);
  if (all.some(column => !easyLocalIdentifier.safeParse(column.nome).success)) {
    fail("CONFLICT", "O catálogo físico da origem requer conferência.");
  }
  const selected = all.filter(column => required.has(column.nome));
  if (selected.length !== required.size) {
    fail("CONFLICT", "As colunas configuradas não existem na origem.");
  }
  return selected;
}

async function sourcePrimaryKey(
  client: pg.Client,
  leitura: EasyLocalLeituraInput
): Promise<string[]> {
  const result = await client.query<{ nome: unknown }>(
    `SELECT kcu.column_name AS nome
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_schema = kcu.constraint_schema
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
       WHERE tc.table_schema = $1
         AND tc.table_name = $2
         AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
    [leitura.origem.schema, leitura.origem.tabela]
  );
  return result.rows.flatMap(row =>
    typeof row.nome === "string" &&
    easyLocalIdentifier.safeParse(row.nome).success
      ? [row.nome]
      : []
  );
}

function validateSourceColumns(
  source: SourceColumn[],
  configuration: LockedConfiguration
): void {
  const byName = new Map(source.map(column => [column.nome, column]));
  const filterColumn = byName.get(configuration.leitura.colunaEstabelecimento);
  const keyColumn = byName.get(configuration.leitura.campoChave);
  if (!filterColumn || !keyColumn) {
    fail("CONFLICT", "A coluna de chave da origem requer conferência.");
  }
  for (const configured of configuration.colunas) {
    const actual = byName.get(configured.nome);
    if (!actual || !compatibleSourceType(actual, configured)) {
      fail("CONFLICT", "Os tipos físicos da origem requerem conferência.");
    }
    // Views podem expor a chave como nullable no catálogo embora o recorte lido
    // seja válido; nulos e duplicatas são sempre conferidos nas linhas reais.
    if (
      configured.obrigatorio &&
      actual.nullable &&
      configured.nome !== configuration.leitura.campoChave
    ) {
      fail(
        "CONFLICT",
        "A nulabilidade da origem não é compatível com o destino."
      );
    }
    if (
      configured.tipo === "varchar" &&
      (actual.tamanho === null || actual.tamanho > (configured.tamanho ?? 255))
    ) {
      fail("CONFLICT", "O tamanho físico da origem requer conferência.");
    }
    if (
      configured.tipo === "decimal" &&
      (actual.precisao !== (configured.tamanho ?? 18) ||
        actual.escala !== (configured.escala ?? 2))
    ) {
      fail("CONFLICT", "A precisão decimal da origem requer conferência.");
    }
    if (configured.tipo === "datetime" && actual.precisaoDataHora !== 0) {
      fail("CONFLICT", "A precisão civil da data e hora requer conferência.");
    }
  }
}

function compatibleSourceType(
  source: SourceColumn,
  destination: EasyLocalColuna
): boolean {
  switch (destination.tipo) {
    case "varchar":
      return source.tipo === "character varying" || source.tipo === "character";
    case "int":
      return source.tipo === "integer" && source.udt === "int4";
    case "bigint":
      return source.tipo === "bigint" && source.udt === "int8";
    case "decimal":
      return source.tipo === "numeric";
    case "text":
      return source.tipo === "text";
    case "date":
      return source.tipo === "date";
    case "datetime":
      return source.tipo === "timestamp without time zone";
    case "boolean":
      return source.tipo === "boolean";
  }
}

function normalizeSourceRow(
  row: Record<string, unknown>,
  columns: EasyLocalColuna[]
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const column of columns) {
    normalized[column.nome] = normalizeValue(
      row[column.nome],
      column,
      "origem"
    );
  }
  return normalized;
}

function normalizeDestinationRow(
  row: Record<string, unknown>,
  columns: EasyLocalColuna[]
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const column of columns) {
    normalized[column.nome] = normalizeValue(
      row[column.nome],
      column,
      "destino"
    );
  }
  return normalized;
}

function normalizeValue(
  value: unknown,
  column: EasyLocalColuna,
  side: "origem" | "destino"
): unknown {
  if (value === null || value === undefined) {
    if (column.obrigatorio) {
      fail("BAD_REQUEST", `Há valor obrigatório ausente na ${side}.`);
    }
    return null;
  }
  switch (column.tipo) {
    case "varchar":
    case "text": {
      if (typeof value !== "string")
        fail("CONFLICT", `Tipo textual inválido na ${side}.`);
      if (column.tipo === "varchar" && value.length > (column.tamanho ?? 255)) {
        fail("BAD_REQUEST", "Há texto maior que a coluna de destino.");
      }
      if (column.tipo === "text" && Buffer.byteLength(value, "utf8") > 65535) {
        fail("BAD_REQUEST", "Há texto maior que a coluna de destino.");
      }
      return value;
    }
    case "int": {
      const integer = typeof value === "number" ? value : Number(value);
      if (
        !Number.isSafeInteger(integer) ||
        integer < -2147483648 ||
        integer > 2147483647
      ) {
        fail("BAD_REQUEST", `Inteiro inválido na ${side}.`);
      }
      return integer;
    }
    case "bigint": {
      if (typeof value === "number" && !Number.isSafeInteger(value)) {
        fail("BAD_REQUEST", `Bigint inválido na ${side}.`);
      }
      if (
        typeof value !== "string" &&
        typeof value !== "bigint" &&
        typeof value !== "number"
      ) {
        fail("BAD_REQUEST", `Bigint inválido na ${side}.`);
      }
      const asText =
        typeof value === "bigint" ? value.toString() : String(value);
      if (!/^-?(?:0|[1-9][0-9]*)$/.test(asText))
        fail("BAD_REQUEST", `Bigint inválido na ${side}.`);
      try {
        const number = BigInt(asText);
        if (number < -9223372036854775808n || number > 9223372036854775807n)
          throw new Error();
      } catch {
        fail("BAD_REQUEST", `Bigint inválido na ${side}.`);
      }
      return asText;
    }
    case "decimal": {
      if (side === "origem" && typeof value !== "string") {
        fail("BAD_REQUEST", "Decimal da origem deve ser texto exato.");
      }
      const asText = String(value);
      if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(asText)) {
        fail("BAD_REQUEST", `Decimal inválido na ${side}.`);
      }
      validateDecimal(asText, column);
      return asText;
    }
    case "date": {
      const asText = String(value);
      if (!isValidCivilDate(asText))
        fail("BAD_REQUEST", `Data civil inválida na ${side}.`);
      return asText;
    }
    case "datetime": {
      const asText = String(value);
      const match =
        /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,6}))?$/.exec(
          asText
        );
      if (
        !match ||
        !isValidCivilDate(match[1]) ||
        Number(match[2]) > 23 ||
        Number(match[3]) > 59 ||
        Number(match[4]) > 59 ||
        (match[5] && /[1-9]/.test(match[5]))
      ) {
        fail("BAD_REQUEST", `Data e hora civil inválida na ${side}.`);
      }
      return `${match[1]} ${match[2]}:${match[3]}:${match[4]}`;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (
        side === "destino" &&
        (value === 0 || value === 1 || value === "0" || value === "1")
      ) {
        return value === 1 || value === "1";
      }
      fail("BAD_REQUEST", `Booleano inválido na ${side}.`);
    }
  }
}

function isValidCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1]!;
}

function validateDecimal(value: string, column: EasyLocalColuna): void {
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole.replace(/^0+/, "") || "0"}${fraction}`.replace(
    /^0+(?=\d)/,
    ""
  );
  const precision = column.tamanho ?? 18;
  const scale = column.escala ?? 2;
  if (
    fraction.length > scale ||
    digits.length > precision ||
    whole.replace(/^0+/, "").length > precision - scale
  ) {
    fail(
      "BAD_REQUEST",
      "Decimal não cabe na coluna de destino sem arredondamento."
    );
  }
}

function destinationSelectExpression(column: EasyLocalColuna): string {
  const name = quotedMysql(column.nome);
  if (["bigint", "decimal", "date", "datetime"].includes(column.tipo)) {
    return `CAST(${name} AS CHAR) AS ${name}`;
  }
  return name;
}

function destinationKeyExpression(column: EasyLocalColuna): string {
  const name = quotedMysql(column.nome);
  return column.tipo === "varchar" || column.tipo === "text"
    ? `BINARY ${name}`
    : name;
}

async function loadDestinationRows(
  connection: PoolConnection,
  configuration: LockedConfiguration,
  sourceRows: Array<Record<string, unknown>>
): Promise<Map<string, Record<string, unknown>>> {
  if (!sourceRows.length) return new Map();
  const key = configuration.leitura.campoChave;
  const keyColumn = configuration.colunas.find(column => column.nome === key);
  if (!keyColumn)
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  const keyExpression = destinationKeyExpression(keyColumn);
  const keys = sourceRows.map(row => row[key]);
  const unique = new Set(keys.map(stable));
  if (unique.size !== keys.length)
    fail(
      "CONFLICT",
      "A origem possui chaves duplicadas; corrija antes de importar."
    );
  const [duplicates] = await connection.execute<SqlRow[]>(
    `SELECT ${keyExpression} AS chave FROM ${quotedMysql(configuration.nomeTabelaFisica)} WHERE \`estabelecimento_id\` = ? GROUP BY ${keyExpression} HAVING COUNT(*) > 1 LIMIT 1`,
    [configuration.leitura.estabelecimentoId]
  );
  if (duplicates.length) {
    fail("CONFLICT", "O destino contém chaves duplicadas nesta unidade.");
  }
  const selected = configuration.colunas
    .map(destinationSelectExpression)
    .join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const [rows] = await connection.execute<SqlRow[]>(
    `SELECT ${selected} FROM ${quotedMysql(configuration.nomeTabelaFisica)} WHERE \`estabelecimento_id\` = ? AND ${keyExpression} IN (${placeholders})`,
    [configuration.leitura.estabelecimentoId, ...keys]
  );
  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of rows) {
    const row = normalizeDestinationRow(raw, configuration.colunas);
    const value = row[key];
    if (value === null || value === undefined) {
      fail("CONFLICT", "O destino contém uma chave inválida nesta unidade.");
    }
    const signature = stable(value);
    if (byKey.has(signature)) {
      fail("CONFLICT", "O destino contém chaves duplicadas nesta unidade.");
    }
    byKey.set(signature, row);
  }
  return byKey;
}

function countsFor(
  sourceRows: Array<Record<string, unknown>>,
  destinationRows: Map<string, Record<string, unknown>>,
  key: string,
  columns: EasyLocalColuna[]
): ImportCounts {
  const counts: ImportCounts = {
    registrosLidos: sourceRows.length,
    registrosInseridos: 0,
    registrosAtualizados: 0,
    registrosInalterados: 0,
  };
  for (const source of sourceRows) {
    const destination = destinationRows.get(stable(source[key]));
    if (!destination) {
      counts.registrosInseridos += 1;
    } else if (sameManagedValues(source, destination, columns)) {
      counts.registrosInalterados += 1;
    } else {
      counts.registrosAtualizados += 1;
    }
  }
  return counts;
}

function sameManagedValues(
  source: Record<string, unknown>,
  destination: Record<string, unknown>,
  columns: EasyLocalColuna[]
): boolean {
  return columns.every(
    column => stable(source[column.nome]) === stable(destination[column.nome])
  );
}

async function buildPlan(
  connection: PoolConnection,
  input: EasyLocalImportacaoPreviaInput
): Promise<ImportPlan> {
  const configuration = await lockAndLoadConfiguration(connection, input);
  const destinationColumns = await loadDestinationColumns(
    connection,
    configuration.nomeTabelaFisica,
    configuration.colunas,
    input.estabelecimentoId
  );
  const source = await sourceSnapshot(configuration);
  const destinationRows = await loadDestinationRows(
    connection,
    configuration,
    source.rows
  );
  const counts = countsFor(
    source.rows,
    destinationRows,
    configuration.leitura.campoChave,
    configuration.colunas
  );
  const fingerprint = digest({
    configuration: {
      leituraId: configuration.leituraId,
      tabelaId: configuration.tabelaId,
      nomeTabelaMeta: configuration.nomeTabelaMeta,
      nomeTabelaFisica: configuration.nomeTabelaFisica,
      leitura: configuration.leitura,
      colunas: configuration.colunas,
      mappingState: configuration.mappingState,
      tableState: configuration.tableState,
      connectionState: configuration.connectionState,
    },
    source: {
      configDigest: source.configDigest,
      columns: source.columns,
      primaryKey: source.primaryKey,
      rows: source.rows,
    },
    destinationColumns,
    destinationRows: [...destinationRows.entries()].sort(([a], [b]) =>
      compareStable(a, b)
    ),
  });
  return {
    configuration,
    source,
    destinationColumns,
    destinationRows,
    fingerprint,
    counts,
  };
}

function tokenSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value)
    fail("INTERNAL_SERVER_ERROR", "Assinatura da prévia indisponível.");
  return new TextEncoder().encode(value);
}

async function signPreview(
  claims: Omit<TokenClaims, "expiraEm">
): Promise<{ token: string; expiraEm: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + EASYLOCAL_PREVIA_TTL_SEGUNDOS;
  const expiraEm = new Date(exp * 1000).toISOString();
  const token = await new SignJWT({
    leituraId: claims.leituraId,
    estabelecimentoId: claims.estabelecimentoId,
    fingerprint: claims.fingerprint,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(String(claims.usuarioId))
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(tokenSecret());
  return { token, expiraEm };
}

async function verifyPreview(
  token: string,
  input: EasyLocalImportacaoExecutarInput,
  usuarioId: number
): Promise<TokenClaims> {
  try {
    const verified = await jwtVerify(token, tokenSecret(), {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    const payload = verified.payload;
    const subject = Number(payload.sub);
    const leituraId = payload.leituraId;
    const estabelecimentoId = payload.estabelecimentoId;
    const fingerprint = payload.fingerprint;
    if (
      !Number.isSafeInteger(subject) ||
      subject !== usuarioId ||
      leituraId !== input.leituraId ||
      estabelecimentoId !== input.estabelecimentoId ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      typeof payload.exp !== "number"
    ) {
      fail(
        "CONFLICT",
        "A prévia não corresponde a esta confirmação. Gere uma nova prévia."
      );
    }
    return {
      usuarioId: subject,
      leituraId,
      estabelecimentoId,
      fingerprint,
      expiraEm: new Date(payload.exp * 1000).toISOString(),
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("CONFLICT", "A prévia expirou ou não é válida. Gere uma nova prévia.");
  }
}

export async function preverEasyLocalImportacao(
  raw: EasyLocalImportacaoPreviaInput,
  usuarioId: number
): Promise<EasyLocalImportacaoPrevia> {
  let connection: PoolConnection | undefined;
  let started = false;
  let healthy = true;
  try {
    const input = easyLocalImportacaoPreviaInput.parse(raw);
    requireActor(usuarioId);
    connection = await acquireDestination();
    await startDestinationTransaction(connection);
    started = true;
    const plan = await buildPlan(connection, input);
    // Prévia é somente leitura em ambos os bancos; nunca cria log de sincronização.
    const rolledBack = await rollbackOrDestroy(connection);
    started = false;
    if (!rolledBack) {
      healthy = false;
      fail(
        "INTERNAL_SERVER_ERROR",
        "Prévia da importação não confirmada. Confira a configuração e o catálogo."
      );
    }
    const signed = await signPreview({
      usuarioId,
      leituraId: input.leituraId,
      estabelecimentoId: input.estabelecimentoId,
      fingerprint: plan.fingerprint,
    });
    return {
      tokenPrevia: signed.token,
      ...plan.counts,
      nomeTabela: plan.configuration.nomeTabelaFisica,
      limite: EASYLOCAL_IMPORTACAO_LIMITE,
      expiraEm: signed.expiraEm,
    };
  } catch (error) {
    return sanitize(
      error,
      "Prévia da importação não confirmada. Confira a configuração e o catálogo."
    );
  } finally {
    if (connection && started) {
      healthy = await rollbackOrDestroy(connection);
    }
    if (connection && healthy) releaseQuietly(connection);
  }
}

async function applyPlan(
  connection: PoolConnection,
  plan: ImportPlan,
  usuarioId: number
): Promise<void> {
  const { configuration, source, destinationRows, counts } = plan;
  const key = configuration.leitura.campoChave;
  const keyColumn = configuration.colunas.find(column => column.nome === key);
  if (!keyColumn)
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  const keyExpression = destinationKeyExpression(keyColumn);
  const columnNames = configuration.colunas.map(column => column.nome);
  const quotedColumns = columnNames.map(quotedMysql);
  for (const sourceRow of source.rows) {
    const previous = destinationRows.get(stable(sourceRow[key]));
    if (!previous) {
      await connection.execute(
        `INSERT INTO ${quotedMysql(configuration.nomeTabelaFisica)} (\`estabelecimento_id\`, ${quotedColumns.join(", ")}, \`_sincronizado_em\`) VALUES (?, ${columnNames.map(() => "?").join(", ")}, CURRENT_TIMESTAMP)`,
        [
          configuration.leitura.estabelecimentoId,
          ...columnNames.map(name => sourceRow[name]),
        ]
      );
      continue;
    }
    if (sameManagedValues(sourceRow, previous, configuration.colunas)) continue;
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE ${quotedMysql(configuration.nomeTabelaFisica)} SET ${quotedColumns.map(name => `${name} = ?`).join(", ")}, \`_sincronizado_em\` = CURRENT_TIMESTAMP WHERE \`estabelecimento_id\` = ? AND ${keyExpression} = ?`,
      [
        ...columnNames.map(name => sourceRow[name]),
        configuration.leitura.estabelecimentoId,
        sourceRow[key],
      ]
    );
    if (result.affectedRows !== 1) {
      fail(
        "CONFLICT",
        "O estado do destino mudou durante a importação. Gere nova prévia."
      );
    }
  }

  const [mappingUpdate] = await connection.execute<ResultSetHeader>(
    "UPDATE integracao_mapeamentos SET ultimaSincronizacao = CURRENT_TIMESTAMP, totalRegistrosImportados = totalRegistrosImportados + ? WHERE id = ? AND estabelecimentoId = ?",
    [
      counts.registrosLidos,
      configuration.leituraId,
      configuration.leitura.estabelecimentoId,
    ]
  );
  if (mappingUpdate.affectedRows !== 1) {
    fail(
      "CONFLICT",
      "A configuração mudou durante a importação. Gere nova prévia."
    );
  }

  await connection.execute(
    "INSERT INTO integracao_sincronizacoes (mapeamentoId, status, registrosLidos, registrosInseridos, registrosAtualizados, registrosErro, finalizadoEm, duracaoMs, executadoPor) VALUES (?, 'sucesso', ?, ?, ?, 0, CURRENT_TIMESTAMP, 0, ?)",
    [
      configuration.leituraId,
      counts.registrosLidos,
      counts.registrosInseridos,
      counts.registrosAtualizados,
      String(usuarioId),
    ]
  );
}

export async function executarEasyLocalImportacao(
  raw: EasyLocalImportacaoExecutarInput,
  usuarioId: number
): Promise<EasyLocalImportacaoResultado> {
  let connection: PoolConnection | undefined;
  let started = false;
  let commitAttempted = false;
  let healthy = true;
  try {
    const input = easyLocalImportacaoExecutarInput.parse(raw);
    requireActor(usuarioId);
    const token = await verifyPreview(input.tokenPrevia, input, usuarioId);
    connection = await acquireDestination();
    await startDestinationTransaction(connection);
    started = true;

    // A recomputação ocorre depois do lock de unidade/mapeamento. Qualquer mudança
    // física, configuração, origem, linhas ou estado do destino invalida a prévia.
    const plan = await buildPlan(connection, input);
    if (plan.fingerprint !== token.fingerprint) {
      fail("CONFLICT", "A prévia ficou desatualizada. Gere uma nova prévia.");
    }

    await applyPlan(connection, plan, usuarioId);
    commitAttempted = true;
    try {
      await connection.commit();
    } catch {
      fail(
        "INTERNAL_SERVER_ERROR",
        "Resultado da importação não confirmado. Confira o destino antes de repetir."
      );
    }
    started = false;
    return { sucesso: true, ...plan.counts };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (commitAttempted) {
      fail(
        "INTERNAL_SERVER_ERROR",
        "Resultado da importação não confirmado. Confira o destino antes de repetir."
      );
    }
    return sanitize(
      error,
      "Importação não confirmada. Confira o destino e gere nova prévia antes de repetir."
    );
  } finally {
    if (connection && started) {
      healthy = await rollbackOrDestroy(connection);
    }
    if (connection && healthy) releaseQuietly(connection);
  }
}
