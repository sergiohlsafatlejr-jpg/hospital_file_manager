import { TRPCError } from "@trpc/server";
import { X509Certificate, randomUUID } from "node:crypto";
import type {
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";
import {
  easyLocalCadastroInput,
  type EasyLocalCadastroInput,
  type EasyLocalCadastroPublico,
} from "../shared/easyLocalCadastro";
import { getRawPool } from "./db";
import { readEasyLocalConfig } from "./easyLocalConnection";
import {
  EasyLocalVaultError,
  decryptEasyLocalPayload,
  easyLocalEncryptionKeyAvailable,
  encryptEasyLocalPayload,
} from "./easyLocalCadastroVault";

const ALIAS = "__EASYLOCAL_SERVER__";
const MARKER = "easylocal-cadastro-cifrado-v1";
const PLACEHOLDER_HOST = "configuracao-cifrada";
const PLACEHOLDER_DATABASE = "EASYLOCAL";
const PLACEHOLDER_USER = "servidor";

type EasyLocalConnectionConfig = NonNullable<
  ReturnType<typeof readEasyLocalConfig>
>;

type StoredPayload = {
  v: 1;
  nome: string;
  descricao: string;
  host: string;
  porta: number;
  banco: string;
  usuario: string;
  password: string;
  ca: string | null;
  rev: string;
  usuarioId: number;
  timestamp: string;
  audit: {
    acao: "salvar";
    usuarioId: number;
    timestamp: string;
  };
};

type GlobalRow = RowDataPacket & {
  id: number | string;
  nome: unknown;
  descricao: unknown;
  tipo: unknown;
  host: unknown;
  porta: unknown;
  banco: unknown;
  usuario: unknown;
  senhaEncriptada: unknown;
  ssl: unknown;
  estabelecimentoId: unknown;
  ativo: unknown;
};

type ExistingConfig = {
  config: EasyLocalConnectionConfig;
  payload: StoredPayload | null;
};

function fail(
  code: "BAD_REQUEST" | "CONFLICT" | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}

function parseInput(raw: EasyLocalCadastroInput): EasyLocalCadastroInput {
  try {
    return easyLocalCadastroInput.parse(raw);
  } catch {
    return fail("BAD_REQUEST", "Dados do cadastro EASYLocal são inválidos.");
  }
}

function requireUserId(usuarioId: number): void {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    fail("BAD_REQUEST", "Usuário responsável pelo cadastro é inválido.");
  }
}

async function acquireConnection(): Promise<PoolConnection> {
  try {
    const pool = await getRawPool();
    if (!pool) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "Cadastro EASYLocal indisponível no momento."
      );
    }
    return await pool.getConnection();
  } catch {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Cadastro EASYLocal indisponível no momento."
    );
  }
}

function releaseQuietly(connection: PoolConnection): void {
  try {
    connection.release();
  } catch {
    // O driver não pode alterar uma resposta sanitizada.
  }
}

async function startTransaction(connection: PoolConnection): Promise<void> {
  let rows: RowDataPacket[];
  try {
    [rows] = await connection.query<RowDataPacket[]>(
      "SELECT VERSION() AS versao"
    );
  } catch {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Modo transacional do cadastro EASYLocal não confirmado."
    );
  }
  if (rows.length !== 1 || typeof rows[0]?.versao !== "string") {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Modo transacional do cadastro EASYLocal não confirmado."
    );
  }
  try {
    if (/tidb/i.test(rows[0].versao))
      await connection.query("BEGIN PESSIMISTIC");
    else await connection.beginTransaction();
  } catch {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Modo transacional do cadastro EASYLocal não confirmado."
    );
  }
}

async function lockGlobalSerializationRow(
  connection: PoolConnection
): Promise<void> {
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM estabelecimentos ORDER BY id LIMIT 1 FOR UPDATE"
    );
    if (rows.length !== 1) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "Cadastro EASYLocal não pode ser serializado no momento."
      );
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Cadastro EASYLocal não pode ser serializado no momento."
    );
  }
}

async function loadGlobalRows(
  connection: PoolConnection,
  forUpdate = false
): Promise<GlobalRow[]> {
  try {
    const [rows] = await connection.execute<GlobalRow[]>(
      "SELECT id, nome, descricao, tipo, host, porta, banco, usuario, senhaEncriptada, `ssl`, estabelecimentoId, ativo FROM integracao_conexoes WHERE UPPER(TRIM(nome)) = ? AND estabelecimentoId IS NULL ORDER BY id LIMIT 2" +
        (forUpdate ? " FOR UPDATE" : ""),
      [ALIAS]
    );
    if (rows.length > 1) {
      return fail(
        "CONFLICT",
        "Há mais de um cadastro global EASYLocal. Corrija o catálogo antes de continuar."
      );
    }
    return rows;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Não foi possível consultar o cadastro EASYLocal."
    );
  }
}

function isValidGlobalMarker(row: GlobalRow): boolean {
  return (
    row.nome === ALIAS &&
    row.descricao === MARKER &&
    row.tipo === "postgresql" &&
    row.host === PLACEHOLDER_HOST &&
    Number(row.porta) === 5432 &&
    row.banco === PLACEHOLDER_DATABASE &&
    row.usuario === PLACEHOLDER_USER &&
    row.ssl === "sim" &&
    row.estabelecimentoId === null &&
    row.ativo === "nao" &&
    typeof row.senhaEncriptada === "string" &&
    row.senhaEncriptada.length > 0
  );
}

function validateCertificate(value: string): string {
  const certificate = value.trim();
  if (
    !certificate ||
    !certificate.includes("-----BEGIN CERTIFICATE-----") ||
    !certificate.includes("-----END CERTIFICATE-----")
  ) {
    return fail("BAD_REQUEST", "Certificado TLS customizado é inválido.");
  }
  try {
    const blocks =
      certificate.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
      ) ?? [];
    if (
      !blocks.length ||
      blocks.length > 10 ||
      certificate
        .replace(
          /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
          ""
        )
        .trim()
    )
      throw new Error();
    for (const block of blocks) new X509Certificate(block);
    return certificate;
  } catch {
    return fail("BAD_REQUEST", "Certificado TLS customizado é inválido.");
  }
}

function readStoredPayload(row: GlobalRow): StoredPayload {
  if (!isValidGlobalMarker(row)) {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "O cadastro global EASYLocal requer conferência administrativa."
    );
  }
  let raw: unknown;
  try {
    raw = decryptEasyLocalPayload<unknown>(String(row.senhaEncriptada));
  } catch (error) {
    if (
      error instanceof EasyLocalVaultError &&
      error.kind === "key_unavailable"
    ) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "A chave do cadastro EASYLocal não está disponível."
      );
    }
    return fail(
      "INTERNAL_SERVER_ERROR",
      "O cadastro global EASYLocal não passou na verificação de integridade."
    );
  }
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error();
    const value = raw as Record<string, unknown>;
    const expected = [
      "v",
      "nome",
      "descricao",
      "host",
      "porta",
      "banco",
      "usuario",
      "password",
      "ca",
      "rev",
      "usuarioId",
      "timestamp",
      "audit",
    ];
    if (
      Object.keys(value).some(key => !expected.includes(key)) ||
      value.v !== 1 ||
      typeof value.password !== "string" ||
      value.password.length === 0 ||
      typeof value.rev !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.rev
      ) ||
      !Number.isSafeInteger(value.usuarioId) ||
      (value.ca !== null && typeof value.ca !== "string") ||
      !value.audit ||
      typeof value.audit !== "object" ||
      Array.isArray(value.audit)
    ) {
      throw new Error();
    }
    const audit = value.audit as Record<string, unknown>;
    if (
      Object.keys(audit).length !== 3 ||
      audit.acao !== "salvar" ||
      audit.usuarioId !== value.usuarioId ||
      audit.timestamp !== value.timestamp ||
      typeof value.timestamp !== "string" ||
      Number.isNaN(Date.parse(value.timestamp))
    ) {
      throw new Error();
    }
    const parsed = easyLocalCadastroInput.parse({
      nome: value.nome,
      descricao: value.descricao,
      tipo: "postgresql",
      host: value.host,
      porta: value.porta,
      banco: value.banco,
      usuario: value.usuario,
      senha: value.password,
      tls: value.ca === null ? "system" : "custom",
      certificado: value.ca ?? undefined,
      revisao: value.rev,
      confirmarConexaoCentral: true,
    });
    const ca = value.ca === null ? undefined : validateCertificate(value.ca);
    return {
      v: 1,
      nome: parsed.nome,
      descricao: parsed.descricao,
      host: parsed.host,
      porta: parsed.porta,
      banco: parsed.banco,
      usuario: parsed.usuario,
      password: value.password,
      ca: ca ?? null,
      rev: value.rev,
      usuarioId: value.usuarioId as number,
      timestamp: value.timestamp,
      audit: {
        acao: "salvar",
        usuarioId: value.usuarioId as number,
        timestamp: value.timestamp,
      },
    };
  } catch {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "O cadastro global EASYLocal requer conferência administrativa."
    );
  }
}

function fromPayload(payload: StoredPayload): EasyLocalConnectionConfig {
  return {
    host: payload.host,
    port: payload.porta,
    database: payload.banco,
    user: payload.usuario,
    password: payload.password,
    ...(payload.ca ? { ca: payload.ca } : {}),
  };
}

function toPublic(
  origin: EasyLocalCadastroPublico["origem"],
  config: EasyLocalConnectionConfig,
  revision: string | null
): EasyLocalCadastroPublico {
  return {
    origem: origin,
    chaveDisponivel: easyLocalEncryptionKeyAvailable(),
    revisao: revision,
    configuracao: {
      nome: origin === "banco" ? "" : "Configuração do servidor",
      descricao: "",
      tipo: "postgresql",
      host: config.host,
      porta: config.port,
      banco: config.database,
      usuario: config.user,
      tls: config.ca ? "custom" : "system",
      senhaConfigurada: config.password.length > 0,
      certificadoConfigurado: Boolean(config.ca),
    },
  };
}

function payloadPublic(payload: StoredPayload): EasyLocalCadastroPublico {
  return {
    origem: "banco",
    chaveDisponivel: true,
    revisao: payload.rev,
    configuracao: {
      nome: payload.nome,
      descricao: payload.descricao,
      tipo: "postgresql",
      host: payload.host,
      porta: payload.porta,
      banco: payload.banco,
      usuario: payload.usuario,
      tls: payload.ca ? "custom" : "system",
      senhaConfigurada: payload.password.length > 0,
      certificadoConfigurado: Boolean(payload.ca),
    },
  };
}

function readServerFallback(): EasyLocalConnectionConfig | null {
  try {
    return readEasyLocalConfig();
  } catch {
    return null;
  }
}

function passwordWasOmitted(value: string | undefined): boolean {
  return value === undefined || value.length === 0;
}

function certificateWasOmitted(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function buildDraft(
  input: EasyLocalCadastroInput,
  existing: ExistingConfig | null
): EasyLocalConnectionConfig {
  const password = passwordWasOmitted(input.senha)
    ? existing?.config.password
    : input.senha;
  if (!password) {
    return fail("BAD_REQUEST", "Informe uma senha para o cadastro EASYLocal.");
  }

  let ca: string | undefined;
  if (input.tls === "custom") {
    if (certificateWasOmitted(input.certificado)) {
      ca = existing?.config.ca;
      if (!ca) {
        return fail(
          "BAD_REQUEST",
          "Informe um certificado TLS customizado válido para o cadastro EASYLocal."
        );
      }
      // A CA preservada também precisa continuar sendo um certificado X.509 válido.
      ca = validateCertificate(ca);
    } else {
      ca = validateCertificate(input.certificado!);
    }
  }

  return {
    host: input.host,
    port: input.porta,
    database: input.banco,
    user: input.usuario,
    password,
    ...(ca ? { ca } : {}),
  };
}

async function existingFromRow(
  row: GlobalRow | undefined
): Promise<ExistingConfig | null> {
  if (!row) {
    const server = readServerFallback();
    return server ? { config: server, payload: null } : null;
  }
  const payload = readStoredPayload(row);
  return { config: fromPayload(payload), payload };
}

/**
 * Returns an admin-safe representation. A stored record is always authenticated
 * before its non-secret fields are returned; no environment fallback is used for
 * corruption, key, duplicate, or database errors.
 */
export async function obterEasyLocalCadastro(): Promise<EasyLocalCadastroPublico> {
  const connection = await acquireConnection();
  try {
    const rows = await loadGlobalRows(connection);
    const row = rows[0];
    if (!row) {
      const server = readServerFallback();
      return server
        ? toPublic("servidor", server, null)
        : {
            origem: "ausente",
            chaveDisponivel: easyLocalEncryptionKeyAvailable(),
            revisao: null,
            configuracao: null,
          };
    }
    if (!isValidGlobalMarker(row)) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "O cadastro global EASYLocal requer conferência administrativa."
      );
    }
    // A leitura administrativa não revela nada enquanto a chave dedicada não está
    // disponível; em especial, ela não troca para variáveis de ambiente.
    if (!easyLocalEncryptionKeyAvailable()) {
      return {
        origem: "banco",
        chaveDisponivel: false,
        revisao: null,
        configuracao: null,
      };
    }
    return payloadPublic(readStoredPayload(row));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Não foi possível consultar o cadastro EASYLocal."
    );
  } finally {
    releaseQuietly(connection);
  }
}

/** Resolves server-only connection material; it never opens or probes PostgreSQL. */
export async function resolverEasyLocalConfig(): Promise<EasyLocalConnectionConfig | null> {
  const connection = await acquireConnection();
  try {
    const rows = await loadGlobalRows(connection);
    const row = rows[0];
    if (!row) return readServerFallback();
    return fromPayload(readStoredPayload(row));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Não foi possível resolver a configuração EASYLocal."
    );
  } finally {
    releaseQuietly(connection);
  }
}

/**
 * Builds a configuration without persisting it. Empty password and custom PEM
 * use the authenticated stored record, or the server configuration only when the
 * dedicated global row is absent.
 */
export async function prepararEasyLocalRascunho(
  raw: EasyLocalCadastroInput
): Promise<EasyLocalConnectionConfig> {
  const input = parseInput(raw);
  const connection = await acquireConnection();
  try {
    const rows = await loadGlobalRows(connection);
    return buildDraft(input, await existingFromRow(rows[0]));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return fail(
      "INTERNAL_SERVER_ERROR",
      "Não foi possível preparar o cadastro EASYLocal."
    );
  } finally {
    releaseQuietly(connection);
  }
}

/**
 * Persists exactly one inactive, TLS-marked global alias. The stable existing row
 * in estabelecimentos serializes creation without GET_LOCK or a target-table gap
 * lock, because the legacy metadata table has no suitable global unique key.
 */
export async function salvarEasyLocalCadastro(
  raw: EasyLocalCadastroInput,
  usuarioId: number
): Promise<{ sucesso: true }> {
  const input = parseInput(raw);
  requireUserId(usuarioId);
  if (!easyLocalEncryptionKeyAvailable()) {
    return fail(
      "INTERNAL_SERVER_ERROR",
      "A chave do cadastro EASYLocal não está disponível."
    );
  }

  const connection = await acquireConnection();
  let started = false;
  let commitAttempted = false;
  try {
    await startTransaction(connection);
    started = true;
    await lockGlobalSerializationRow(connection);
    const rows = await loadGlobalRows(connection, true);
    const row = rows[0];
    if (row && !isValidGlobalMarker(row)) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "O cadastro global EASYLocal requer conferência administrativa."
      );
    }

    const existing = await existingFromRow(row);
    const storedRevision = existing?.payload?.rev ?? null;
    if (storedRevision !== input.revisao) {
      return fail(
        "CONFLICT",
        "O cadastro EASYLocal foi alterado por outra sessão. Atualize antes de salvar."
      );
    }

    const draft = buildDraft(input, existing);
    const timestamp = new Date().toISOString();
    const payload: StoredPayload = {
      v: 1,
      nome: input.nome,
      descricao: input.descricao,
      host: draft.host,
      porta: draft.port,
      banco: draft.database,
      usuario: draft.user,
      password: draft.password,
      ca: draft.ca ?? null,
      rev: randomUUID(),
      usuarioId,
      timestamp,
      audit: { acao: "salvar", usuarioId, timestamp },
    };
    const envelope = encryptEasyLocalPayload(payload);

    if (row) {
      let result: { affectedRows?: number };
      try {
        [result] = await connection.execute<ResultSetHeader>(
          "UPDATE integracao_conexoes SET descricao = ?, tipo = 'postgresql', host = ?, porta = 5432, banco = ?, usuario = ?, senhaEncriptada = ?, `ssl` = 'sim', ativo = 'nao' WHERE id = ? AND nome = ? AND estabelecimentoId IS NULL",
          [
            MARKER,
            PLACEHOLDER_HOST,
            PLACEHOLDER_DATABASE,
            PLACEHOLDER_USER,
            envelope,
            row.id,
            ALIAS,
          ]
        );
      } catch {
        return fail(
          "INTERNAL_SERVER_ERROR",
          "O cadastro EASYLocal não foi confirmado."
        );
      }
      if (result.affectedRows !== 1) {
        return fail(
          "CONFLICT",
          "O cadastro EASYLocal foi alterado por outra sessão. Atualize antes de salvar."
        );
      }
    } else {
      try {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO integracao_conexoes (nome, descricao, tipo, host, porta, banco, usuario, senhaEncriptada, `ssl`, estabelecimentoId, ativo) VALUES (?, ?, 'postgresql', ?, 5432, ?, ?, ?, 'sim', NULL, 'nao')",
          [
            ALIAS,
            MARKER,
            PLACEHOLDER_HOST,
            PLACEHOLDER_DATABASE,
            PLACEHOLDER_USER,
            envelope,
          ]
        );
        if (
          !Number.isSafeInteger(Number(result.insertId)) ||
          Number(result.insertId) <= 0
        ) {
          return fail(
            "INTERNAL_SERVER_ERROR",
            "O cadastro EASYLocal não foi confirmado."
          );
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return fail(
          "INTERNAL_SERVER_ERROR",
          "O cadastro EASYLocal não foi confirmado."
        );
      }
    }

    commitAttempted = true;
    try {
      await connection.commit();
    } catch {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "Resultado do cadastro EASYLocal não confirmado. Confira antes de repetir."
      );
    }
    return { sucesso: true };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (commitAttempted) {
      return fail(
        "INTERNAL_SERVER_ERROR",
        "Resultado do cadastro EASYLocal não confirmado. Confira antes de repetir."
      );
    }
    return fail(
      "INTERNAL_SERVER_ERROR",
      "O cadastro EASYLocal não foi confirmado."
    );
  } finally {
    if (started) {
      try {
        await connection.rollback();
      } catch {
        // Nunca expor o driver, inclusive depois de commit incerto.
      }
    }
    releaseQuietly(connection);
  }
}
