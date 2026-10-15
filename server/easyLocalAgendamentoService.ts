import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { COOKIE_NAME } from "@shared/const";
import { getRawPool } from "./db";
import * as importacao from "./easyLocalImportacaoService";
import {
  createHeartbeatJob,
  deleteHeartbeatJob,
  updateHeartbeatJob,
} from "./_core/heartbeat";
import {
  easyLocalAgendaAcaoInput,
  easyLocalAgendaAtivarInput,
  easyLocalAgendaPreviaInput,
  easyLocalAgendaUnidade,
  type EasyLocalAgendaAcaoInput,
  type EasyLocalAgendaAtivarInput,
  type EasyLocalAgendaPrevia,
  type EasyLocalAgendaPreviaInput,
  type EasyLocalAgendaResumo,
} from "../shared/easyLocalAgendamento";
import { easyLocalLeitura } from "../shared/easyLocalIntegrador";

/**
 * O único estado durável é integracao_easylocal_agendamentos (migração 0136).
 * Não há timer em processo: o disparo é exclusivamente Heartbeat.
 */
const TABLE = "integracao_easylocal_agendamentos";
const MARKER = "easylocal-direto-v1";
const CONNECTION_ALIAS = "__EASYLOCAL_SERVER__";
const PREVIEW_ISSUER = "safatle-easylocal-agendamento";
const PREVIEW_AUDIENCE = "safatle-easylocal-agendamento";
const PREVIEW_TTL_SECONDS = 15 * 60;
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const LEASE_MINUTES = 5;

type SqlRow = RowDataPacket & Record<string, unknown>;
type Estado = "preparando" | "ativo" | "pausado" | "erro" | "incerto";
type Frequencia = "15min" | "1hora" | "diario";
type Counts = {
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosInalterados: number;
};
type AgendaRow = {
  id: number;
  leituraId: number;
  estabelecimentoId: number;
  criadoPor: number;
  scheduleCronTaskUid: string | null;
  estado: Estado;
  frequencia: Frequencia;
  horarioBrasilia: string | null;
  fuso: string;
  cronUtc: string;
  revisaoAprovada: string;
  operacaoToken: string | null;
  execucaoToken: string | null;
  leaseAte: unknown;
  ultimoSlot: string | null;
  ultimaExecucao: unknown;
  proximaExecucao: unknown;
  ultimoResultado: unknown;
  leaseAtiva?: boolean;
  leaseExpirada?: boolean;
};
type PreviewClaims = {
  usuarioId: number;
  leituraId: number;
  estabelecimentoId: number;
  frequencia: Frequencia;
  horarioBrasilia: string | null;
  cronUtc: string;
  revisao: string;
};
type AgendadaImporter = {
  preverEasyLocalImportacaoAgendada: (
    input: { leituraId: number; estabelecimentoId: number },
    usuarioId: number
  ) => Promise<Counts & { revisao: string; limite: number }>;
  executarEasyLocalImportacaoAgendada: (
    input: { leituraId: number; estabelecimentoId: number },
    usuarioId: number,
    revisao: string
  ) => Promise<Counts & { sucesso: boolean }>;
};

type CallbackOutcome = {
  status: "executado" | "ignorado" | "bloqueado" | "incerto" | "erro";
  counts?: Counts;
};

class CommitUncertainError extends Error {
  constructor() {
    super("COMMIT_UNCERTAIN");
  }
}

function fail(
  code:
    | "BAD_REQUEST"
    | "CONFLICT"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "UNAUTHORIZED"
    | "PRECONDITION_FAILED"
    | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}

function logStatus(evento: string, status: string, counts?: Partial<Counts>): void {
  // Nunca registrar conteúdo da origem, tokens, SQL, stack ou credenciais.
  console.info("[EasyLocalAgendamento]", {
    evento,
    status,
    ...(counts
      ? {
          registrosLidos: counts.registrosLidos ?? 0,
          registrosInseridos: counts.registrosInseridos ?? 0,
          registrosAtualizados: counts.registrosAtualizados ?? 0,
          registrosInalterados: counts.registrosInalterados ?? 0,
        }
      : {}),
  });
}

function isMissingTable(error: unknown): boolean {
  const candidate = error as { code?: unknown; errno?: unknown; message?: unknown };
  return (
    candidate?.code === "ER_NO_SUCH_TABLE" ||
    candidate?.errno === 1146 ||
    (typeof candidate?.message === "string" &&
      /table .* doesn't exist|no such table/i.test(candidate.message))
  );
}

function sanitized(error: unknown, fallback: string): never {
  if (error instanceof TRPCError) throw error;
  if (isMissingTable(error)) {
    fail(
      "PRECONDITION_FAILED",
      "A implantação controlada da migração 0136 é necessária; não execute db:migrate geral."
    );
  }
  fail("INTERNAL_SERVER_ERROR", fallback);
}

function requireActor(usuarioId: number): void {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    fail("FORBIDDEN", "Usuário responsável pelo agendamento é inválido.");
  }
}

function requireSession(sessionToken: string): void {
  if (!sessionToken) {
    fail("UNAUTHORIZED", "Sessão do administrador não disponível para o agendamento.");
  }
}

function agendadaImporter(): AgendadaImporter {
  const api: AgendadaImporter = importacao;
  return api;
}

async function acquire(): Promise<PoolConnection> {
  try {
    const pool = await getRawPool();
    if (!pool) fail("INTERNAL_SERVER_ERROR", "Catálogo de agendamentos indisponível.");
    return await pool.getConnection();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("INTERNAL_SERVER_ERROR", "Catálogo de agendamentos indisponível.");
  }
}

async function beginPessimistic(connection: PoolConnection): Promise<void> {
  try {
    const [versionRows] = await connection.query<SqlRow[]>("SELECT VERSION() AS versao");
    if (versionRows.length !== 1 || typeof versionRows[0]?.versao !== "string") {
      fail("INTERNAL_SERVER_ERROR", "Modo transacional do agendamento não confirmado.");
    }
    if (/tidb/i.test(versionRows[0].versao)) await connection.query("BEGIN PESSIMISTIC");
    else await connection.beginTransaction();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("INTERNAL_SERVER_ERROR", "Modo transacional do agendamento não confirmado.");
  }
}

function release(connection: PoolConnection, healthy: boolean): void {
  try {
    if (healthy) connection.release();
    else connection.destroy();
  } catch {
    // A conexão não pode substituir uma resposta já sanitizada.
  }
}

async function rollback(connection: PoolConnection): Promise<boolean> {
  try {
    await connection.rollback();
    return true;
  } catch {
    return false;
  }
}

/** Para mudanças apenas locais. Commit cuja confirmação falha é sempre tratado
 * como incerto pelo chamador; não se tenta repetir efeitos externos. */
async function transaction<T>(
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await acquire();
  let begun = false;
  let commitStarted = false;
  let committed = false;
  let healthy = true;
  try {
    await beginPessimistic(connection);
    begun = true;
    const result = await work(connection);
    commitStarted = true;
    await connection.commit();
    committed = true;
    return result;
  } catch (error) {
    if (begun && !committed) {
      if (commitStarted) {
        healthy = false;
        throw new CommitUncertainError();
      }
      healthy = await rollback(connection);
    }
    throw error;
  } finally {
    release(connection, healthy);
  }
}

function utcMysql(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}

function utcIso(value: unknown): string | null {
  if (!value) return null;
  const source = value instanceof Date ? value : new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(source.getTime()) ? null : source.toISOString();
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseState(value: unknown): Estado {
  return ["preparando", "ativo", "pausado", "erro", "incerto"].includes(String(value))
    ? (value as Estado)
    : "incerto";
}

function parseFrequency(value: unknown): Frequencia {
  return ["15min", "1hora", "diario"].includes(String(value))
    ? (value as Frequencia)
    : "diario";
}

function asAgendaRow(row: SqlRow): AgendaRow {
  return {
    id: numberValue(row.id),
    leituraId: numberValue(row.leituraId),
    estabelecimentoId: numberValue(row.estabelecimentoId),
    criadoPor: numberValue(row.criadoPor),
    scheduleCronTaskUid: nullableText(row.scheduleCronTaskUid),
    estado: parseState(row.estado),
    frequencia: parseFrequency(row.frequencia),
    horarioBrasilia: nullableText(row.horarioBrasilia),
    fuso: nullableText(row.fuso) ?? BRAZIL_TIME_ZONE,
    cronUtc: nullableText(row.cronUtc) ?? "",
    revisaoAprovada: nullableText(row.revisaoAprovada) ?? "",
    operacaoToken: nullableText(row.operacaoToken),
    execucaoToken: nullableText(row.execucaoToken),
    leaseAte: row.leaseAte,
    ultimoSlot: nullableText(row.ultimoSlot),
    ultimaExecucao: row.ultimaExecucao,
    proximaExecucao: row.proximaExecucao,
    ultimoResultado: row.ultimoResultado,
    leaseAtiva: Number(row.leaseAtiva) === 1,
    leaseExpirada: Number(row.leaseExpirada) === 1,
  };
}

const agendaColumns = `
  id,
  leitura_id AS leituraId,
  estabelecimento_id AS estabelecimentoId,
  criado_por AS criadoPor,
  schedule_cron_task_uid AS scheduleCronTaskUid,
  estado,
  frequencia,
  horario_brasilia AS horarioBrasilia,
  fuso,
  cron_utc AS cronUtc,
  revisao_aprovada AS revisaoAprovada,
  operacao_token AS operacaoToken,
  execucao_token AS execucaoToken,
  lease_ate AS leaseAte,
  ultimo_slot AS ultimoSlot,
  ultima_execucao AS ultimaExecucao,
  proxima_execucao AS proximaExecucao,
  ultimo_resultado AS ultimoResultado`;

function safeResult(value: unknown): EasyLocalAgendaResumo["ultimoResultado"] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { codigo: "RESULTADO_REQUER_CONFERENCIA" };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  const result: NonNullable<EasyLocalAgendaResumo["ultimoResultado"]> = {};
  for (const key of [
    "registrosLidos",
    "registrosInseridos",
    "registrosAtualizados",
    "registrosInalterados",
  ] as const) {
    if (Number.isSafeInteger(Number(raw[key]))) result[key] = Number(raw[key]);
  }
  if (typeof raw.codigo === "string" && /^[A-Z0-9_]{1,64}$/.test(raw.codigo)) {
    result.codigo = raw.codigo;
  }
  return Object.keys(result).length ? result : null;
}

function resumo(row: AgendaRow, usuarioId: number): EasyLocalAgendaResumo {
  return {
    id: row.id,
    leituraId: row.leituraId,
    estabelecimentoId: row.estabelecimentoId,
    criadoPor: row.criadoPor,
    podeGerenciar: row.criadoPor === usuarioId,
    estado: row.estado,
    frequencia: row.frequencia,
    horarioBrasilia: row.horarioBrasilia,
    fuso: row.fuso,
    cronUtc: row.cronUtc,
    ultimaExecucao: utcIso(row.ultimaExecucao),
    proximaExecucao: utcIso(row.proximaExecucao),
    ultimoResultado: safeResult(row.ultimoResultado),
  };
}

async function lockUnit(connection: PoolConnection, estabelecimentoId: number): Promise<void> {
  const [rows] = await connection.execute<SqlRow[]>(
    "SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE",
    [estabelecimentoId]
  );
  if (rows.length !== 1) fail("NOT_FOUND", "Estabelecimento não encontrado.");
}

/** Confere o marcador e o escopo no próprio catálogo. A prévia do importador
 * repete e aprofunda esta validação (origem + tipos + snapshot). */
async function validateCatalog(
  connection: PoolConnection,
  leituraId: number,
  estabelecimentoId: number,
  lock = true
): Promise<void> {
  const suffix = lock ? " FOR UPDATE" : "";
  const [rows] = await connection.execute<SqlRow[]>(
    `SELECT m.id, m.tabelaDestinoId, m.descricao AS leituraDescricao, m.queryOrigem,
            m.ativo, m.frequencia AS frequenciaMapa, m.modoImportacao,
            t.nome AS tabelaNome, t.descricao AS tabelaDescricao, t.criadaNoBanco,
            c.nome AS conexaoNome, c.descricao AS conexaoDescricao, c.tipo AS conexaoTipo,
            c.ativo AS conexaoAtiva
       FROM integracao_mapeamentos m
       JOIN integracao_tabelas t
         ON t.id = m.tabelaDestinoId AND t.estabelecimentoId = m.estabelecimentoId
       JOIN integracao_conexoes c
         ON c.id = m.conexaoOrigemId AND c.estabelecimentoId = m.estabelecimentoId
      WHERE m.id = ? AND m.estabelecimentoId = ?${suffix}`,
    [leituraId, estabelecimentoId]
  );
  if (rows.length !== 1) {
    fail("NOT_FOUND", "Leitura EASYLocal não encontrada nesta unidade.");
  }
  const row = rows[0]!;
  let leitura: ReturnType<typeof easyLocalLeitura.parse>;
  let description: Record<string, unknown> | null = null;
  let tableDescription: Record<string, unknown> | null = null;
  try {
    leitura = easyLocalLeitura.parse(JSON.parse(String(row.queryOrigem)));
    const candidate = JSON.parse(String(row.leituraDescricao));
    const tableCandidate = JSON.parse(String(row.tabelaDescricao));
    description = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null;
    tableDescription = tableCandidate && typeof tableCandidate === "object" && !Array.isArray(tableCandidate)
      ? tableCandidate as Record<string, unknown>
      : null;
  } catch {
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  }
  if (
    description?.marker !== MARKER ||
    tableDescription?.marker !== MARKER ||
    !String(row.tabelaNome).startsWith(`el_${estabelecimentoId}_`) ||
    row.criadaNoBanco !== "sim" ||
    row.ativo !== "nao" ||
    row.frequenciaMapa !== "manual" ||
    row.modoImportacao !== "incremental" ||
    leitura.estabelecimentoId !== estabelecimentoId ||
    leitura.tabelaId !== Number(row.tabelaDestinoId) ||
    row.conexaoNome !== CONNECTION_ALIAS ||
    row.conexaoDescricao !== MARKER ||
    row.conexaoTipo !== "postgresql" ||
    row.conexaoAtiva !== "nao"
  ) {
    fail("CONFLICT", "A configuração de leitura requer conferência.");
  }
}

async function fetchAgendaLocked(
  connection: PoolConnection,
  id: number,
  estabelecimentoId: number
): Promise<AgendaRow> {
  const [rows] = await connection.execute<SqlRow[]>(
    `SELECT ${agendaColumns},
       (lease_ate IS NOT NULL AND lease_ate > UTC_TIMESTAMP(3)) AS leaseAtiva,
       (lease_ate IS NOT NULL AND lease_ate <= UTC_TIMESTAMP(3)) AS leaseExpirada
       FROM ${TABLE}
      WHERE id = ? AND estabelecimento_id = ? FOR UPDATE`,
    [id, estabelecimentoId]
  );
  if (rows.length !== 1) fail("NOT_FOUND", "Agendamento não encontrado nesta unidade.");
  return asAgendaRow(rows[0]!);
}

async function fetchByTaskUidLocked(
  connection: PoolConnection,
  taskUid: string
): Promise<AgendaRow | null> {
  const [rows] = await connection.execute<SqlRow[]>(
    `SELECT ${agendaColumns},
       (lease_ate IS NOT NULL AND lease_ate > UTC_TIMESTAMP(3)) AS leaseAtiva,
       (lease_ate IS NOT NULL AND lease_ate <= UTC_TIMESTAMP(3)) AS leaseExpirada
       FROM ${TABLE}
      WHERE schedule_cron_task_uid = ? FOR UPDATE`,
    [taskUid]
  );
  return rows.length === 1 ? asAgendaRow(rows[0]!) : null;
}

function assertCreator(row: AgendaRow, usuarioId: number): void {
  if (row.criadoPor !== usuarioId) {
    fail("FORBIDDEN", "Somente o administrador que criou este agendamento pode alterá-lo.");
  }
  if (!row.operacaoToken) {
    fail("CONFLICT", "O agendamento requer conferência antes de ser alterado.");
  }
}

function previewSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) fail("INTERNAL_SERVER_ERROR", "Assinatura da prévia indisponível.");
  return new TextEncoder().encode(secret);
}

async function signPreview(claims: PreviewClaims): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + PREVIEW_TTL_SECONDS;
  const token = await new SignJWT({
    leituraId: claims.leituraId,
    estabelecimentoId: claims.estabelecimentoId,
    frequencia: claims.frequencia,
    horarioBrasilia: claims.horarioBrasilia,
    cronUtc: claims.cronUtc,
    revisao: claims.revisao,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(PREVIEW_ISSUER)
    .setAudience(PREVIEW_AUDIENCE)
    .setSubject(String(claims.usuarioId))
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(previewSecret());
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

async function verifyPreview(
  token: string,
  input: EasyLocalAgendaAtivarInput,
  usuarioId: number
): Promise<PreviewClaims> {
  try {
    const verified = await jwtVerify(token, previewSecret(), {
      algorithms: ["HS256"],
      issuer: PREVIEW_ISSUER,
      audience: PREVIEW_AUDIENCE,
    });
    const payload = verified.payload;
    const claims: PreviewClaims = {
      usuarioId: Number(payload.sub),
      leituraId: Number(payload.leituraId),
      estabelecimentoId: Number(payload.estabelecimentoId),
      frequencia: parseFrequency(payload.frequencia),
      horarioBrasilia: typeof payload.horarioBrasilia === "string" ? payload.horarioBrasilia : null,
      cronUtc: typeof payload.cronUtc === "string" ? payload.cronUtc : "",
      revisao: typeof payload.revisao === "string" ? payload.revisao : "",
    };
    if (
      !Number.isSafeInteger(claims.usuarioId) ||
      claims.usuarioId !== usuarioId ||
      claims.leituraId !== input.leituraId ||
      claims.estabelecimentoId !== input.estabelecimentoId ||
      !["15min", "1hora", "diario"].includes(claims.frequencia) ||
      !claims.cronUtc ||
      !claims.revisao ||
      claims.revisao.length > 64 ||
      (claims.frequencia === "diario" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(claims.horarioBrasilia ?? "")) ||
      (claims.frequencia !== "diario" && claims.horarioBrasilia !== null)
    ) {
      fail("CONFLICT", "A prévia não corresponde a esta confirmação. Gere uma nova prévia.");
    }
    return claims;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("CONFLICT", "A prévia expirou ou não é válida. Gere uma nova prévia.");
  }
}

function partsInZone(date: Date, timeZone = BRAZIL_TIME_ZONE): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

function offsetMinutes(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    timeZoneName: "longOffset",
  });
  const name = formatter.formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? "";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return -180; // São Paulo sem DST atualmente; fallback fail-safe determinístico.
  const value = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? value : -value;
}

function localToUtcHour(year: number, month: number, day: number, hour: number, minute: number): number {
  const wallTime = Date.UTC(year, month, day, hour, minute, 0);
  let candidate = new Date(wallTime - offsetMinutes(new Date(wallTime)) * 60_000);
  // Uma segunda passagem trata corretamente uma mudança de offset planejada pelo IANA.
  candidate = new Date(wallTime - offsetMinutes(candidate) * 60_000);
  return candidate.getUTCHours();
}

/** Cron UTC de seis campos. Para horário diário, cobre todos os offsets que o
 * IANA conhece nos próximos cinco anos; o callback ainda confere a hora local,
 * evitando execução dupla caso Brasília volte a adotar horário de verão. */
export function cronUtcParaAgenda(input: Pick<EasyLocalAgendaPreviaInput, "frequencia" | "horarioBrasilia">): string {
  if (input.frequencia === "15min") return "0 */15 * * * *";
  if (input.frequencia === "1hora") return "0 0 * * * *";
  const schedule = input.horarioBrasilia;
  if (!schedule) fail("BAD_REQUEST", "Informe o horário diário de Brasília.");
  const [hour, minute] = schedule.split(":").map(Number);
  const start = new Date();
  const hours = new Set<number>();
  for (let year = start.getUTCFullYear(); year <= start.getUTCFullYear() + 5; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      hours.add(localToUtcHour(year, month, 15, hour!, minute!));
    }
  }
  return `0 ${minute} ${[...hours].sort((a, b) => a - b).join(",")} * * *`;
}

export function slotAgendamento(row: Pick<AgendaRow, "frequencia" | "horarioBrasilia">, now = new Date()): string | null {
  const iso = now.toISOString();
  if (row.frequencia === "15min") {
    const minute = Math.floor(now.getUTCMinutes() / 15) * 15;
    return `${iso.slice(0, 13)}:${String(minute).padStart(2, "0")}`;
  }
  if (row.frequencia === "1hora") return iso.slice(0, 13);
  const local = partsInZone(now);
  if (!row.horarioBrasilia || `${local.hour}:${local.minute}` !== row.horarioBrasilia) return null;
  return `${local.year}-${local.month}-${local.day}`;
}

function heartbeatName(id: number): string {
  return `easylocal-agendamento-${id}`;
}

function heartbeatDescription(row: Pick<AgendaRow, "id" | "frequencia">): string {
  return `EASYLocal agendamento ${row.id} (${row.frequencia})`;
}

function heartbeatPatch(row: Pick<AgendaRow, "cronUtc" | "id" | "frequencia">) {
  return {
    cron: row.cronUtc,
    path: "/api/scheduled/easylocal-importar",
    method: "POST" as const,
    payload: {},
    description: heartbeatDescription(row),
  };
}

async function updateByOperation(
  connection: PoolConnection,
  row: Pick<AgendaRow, "id" | "estabelecimentoId" | "operacaoToken">,
  setSql: string,
  params: unknown[]
): Promise<void> {
  if (!row.operacaoToken) fail("CONFLICT", "O agendamento requer conferência antes de ser alterado.");
  const [result] = await connection.execute<ResultSetHeader>(
    `UPDATE ${TABLE} SET ${setSql}, atualizado_em = UTC_TIMESTAMP(3)
      WHERE id = ? AND estabelecimento_id = ? AND operacao_token = ?`,
    [...params, row.id, row.estabelecimentoId, row.operacaoToken]
  );
  if (result.affectedRows !== 1) {
    fail("CONFLICT", "O agendamento mudou durante a operação. Confira antes de repetir.");
  }
}

async function insertReservation(
  connection: PoolConnection,
  input: { leituraId: number; estabelecimentoId: number },
  usuarioId: number,
  preview: PreviewClaims
): Promise<AgendaRow> {
  const operationToken = randomUUID();
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO ${TABLE}
      (leitura_id, estabelecimento_id, criado_por, estado, frequencia, horario_brasilia,
       fuso, cron_utc, revisao_aprovada, operacao_token, criado_em, atualizado_em)
     VALUES (?, ?, ?, 'preparando', ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [
      input.leituraId,
      input.estabelecimentoId,
      usuarioId,
      preview.frequencia,
      preview.horarioBrasilia,
      BRAZIL_TIME_ZONE,
      preview.cronUtc,
      preview.revisao,
      operationToken,
    ]
  );
  const id = Number(result.insertId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    fail("INTERNAL_SERVER_ERROR", "Reserva do agendamento não confirmada.");
  }
  return fetchAgendaLocked(connection, id, input.estabelecimentoId);
}

async function reserveActivation(
  input: EasyLocalAgendaAtivarInput,
  usuarioId: number,
  preview: PreviewClaims
): Promise<{ row: AgendaRow; existingUid: string | null; created: boolean }> {
  return transaction(async connection => {
    await lockUnit(connection, input.estabelecimentoId);
    await validateCatalog(connection, input.leituraId, input.estabelecimentoId, true);
    const [found] = await connection.execute<SqlRow[]>(
      `SELECT ${agendaColumns} FROM ${TABLE}
        WHERE leitura_id = ? AND estabelecimento_id = ? FOR UPDATE`,
      [input.leituraId, input.estabelecimentoId]
    );
    if (found.length === 0) {
      const row = await insertReservation(connection, input, usuarioId, preview);
      return { row, existingUid: null, created: true };
    }
    const current = asAgendaRow(found[0]!);
    assertCreator(current, usuarioId);
    if (current.estado === "ativo" || current.estado === "preparando") {
      fail("CONFLICT", "Pause o agendamento antes de alterar horário ou frequência.");
    }
    if (current.estado === "incerto") {
      fail("CONFLICT", "O agendamento está incerto e requer conferência antes de uma nova ativação.");
    }
    const newOperation = randomUUID();
    const [update] = await connection.execute<ResultSetHeader>(
      `UPDATE ${TABLE}
          SET estado = 'preparando', frequencia = ?, horario_brasilia = ?, fuso = ?,
              cron_utc = ?, revisao_aprovada = ?, operacao_token = ?,
              execucao_token = NULL, lease_ate = NULL, ultimo_resultado = NULL,
              atualizado_em = UTC_TIMESTAMP(3)
        WHERE id = ? AND estabelecimento_id = ? AND operacao_token = ?`,
      [
        preview.frequencia,
        preview.horarioBrasilia,
        BRAZIL_TIME_ZONE,
        preview.cronUtc,
        preview.revisao,
        newOperation,
        current.id,
        current.estabelecimentoId,
        current.operacaoToken,
      ]
    );
    if (update.affectedRows !== 1) fail("CONFLICT", "O agendamento mudou durante a operação.");
    const row = await fetchAgendaLocked(connection, current.id, input.estabelecimentoId);
    return { row, existingUid: current.scheduleCronTaskUid, created: false };
  });
}

async function markIncertoBestEffort(row: AgendaRow, codigo: string): Promise<void> {
  try {
    await transaction(async connection => {
      await lockUnit(connection, row.estabelecimentoId);
      const current = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
      if (!current.operacaoToken || current.operacaoToken !== row.operacaoToken) return;
      await updateByOperation(
        connection,
        current,
        "estado = 'incerto', execucao_token = NULL, lease_ate = NULL, ultimo_resultado = ?",
        [JSON.stringify({ codigo })]
      );
    });
  } catch {
    // A resposta original continua inconclusiva; nenhum detalhe sensível sai no log.
    logStatus("agendamento", "incerto_nao_persistido");
  }
}

/** Commit de reserva sem resposta é tratado como potencial execução: bloqueia o
 * UID autenticado para nunca permitir uma repetição automática posterior. */
async function markTaskIncertoBestEffort(taskUid: string, codigo: string): Promise<void> {
  try {
    await transaction(async connection => {
      const row = await fetchByTaskUidLocked(connection, taskUid);
      if (!row || row.estado !== "ativo" || !row.operacaoToken) return;
      await updateByOperation(
        connection,
        row,
        "estado = 'incerto', execucao_token = NULL, lease_ate = NULL, ultimo_resultado = ?",
        [JSON.stringify({ codigo })]
      );
    });
  } catch {
    logStatus("agendamento", "incerto_por_uid_nao_persistido");
  }
}

function isKnownHeartbeatFailure(error: unknown): boolean {
  // A SDK converte respostas HTTP conhecidas em TRPCError. Erros de rede ou de
  // confirmação da plataforma são deliberadamente tratados como inconclusivos.
  return error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR";
}

/** Lista em escopo de unidade; qualquer administrador pode ler, mas apenas o
 * criador positivo recebe podeGerenciar=true e pode mutar. */
export async function listarEasyLocalAgendamentos(
  raw: { estabelecimentoId: number },
  usuarioId: number
): Promise<EasyLocalAgendaResumo[]> {
  const input = easyLocalAgendaUnidade.parse(raw);
  requireActor(usuarioId);
  const connection = await acquire();
  try {
    const [unit] = await connection.execute<SqlRow[]>(
      "SELECT id FROM estabelecimentos WHERE id = ?",
      [input.estabelecimentoId]
    );
    if (unit.length !== 1) fail("NOT_FOUND", "Estabelecimento não encontrado.");
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${agendaColumns} FROM ${TABLE}
        WHERE estabelecimento_id = ? ORDER BY id DESC LIMIT 201`,
      [input.estabelecimentoId]
    );
    if (rows.length > 200) fail("BAD_REQUEST", "Mais de 200 agendamentos; revise a unidade.");
    return rows.map(row => resumo(asAgendaRow(row), usuarioId));
  } catch (error) {
    sanitized(error, "Não foi possível listar os agendamentos.");
  } finally {
    release(connection, true);
  }
}

/** Gera a prévia estática da frequência e repassa a prévia integral de origem
 * ao importador. A revisão, e não contadores/data, é a única evidência usada na
 * confirmação posterior. */
export async function preverEasyLocalAgendamento(
  raw: EasyLocalAgendaPreviaInput,
  usuarioId: number
): Promise<EasyLocalAgendaPrevia> {
  const input = easyLocalAgendaPreviaInput.parse(raw);
  requireActor(usuarioId);
  try {
    const cronUtc = cronUtcParaAgenda(input);
    // A prévia do importador valida unidade, marcador/origem e executa sua RR
    // read-only. Ela nunca retorna ou persiste dados da origem neste serviço.
    const preview = await agendadaImporter().preverEasyLocalImportacaoAgendada(
      { leituraId: input.leituraId, estabelecimentoId: input.estabelecimentoId },
      usuarioId
    );
    if (!/^[a-f0-9]{64}$/.test(preview.revisao)) {
      fail("CONFLICT", "A revisão da prévia requer conferência.");
    }
    const signed = await signPreview({
      usuarioId,
      leituraId: input.leituraId,
      estabelecimentoId: input.estabelecimentoId,
      frequencia: input.frequencia,
      horarioBrasilia: input.horarioBrasilia ?? null,
      cronUtc,
      revisao: preview.revisao,
    });
    return {
      tokenPrevia: signed.token,
      frequencia: input.frequencia,
      horarioBrasilia: input.horarioBrasilia ?? null,
      fuso: BRAZIL_TIME_ZONE,
      cronUtc,
      expiraEm: signed.expiresAt,
      registrosLidos: preview.registrosLidos,
      registrosInseridos: preview.registrosInseridos,
      registrosAtualizados: preview.registrosAtualizados,
      registrosInalterados: preview.registrosInalterados,
      limite: preview.limite,
    };
  } catch (error) {
    sanitized(error, "Prévia do agendamento não confirmada. Gere uma nova prévia.");
  }
}

/**
 * Ativa apenas depois da prévia JWT de 15 min e da mesma revisão estática.
 * Nova agenda: reserva DB -> cria Heartbeat -> persiste UID. Há uma janela em
 * que um callback de job recém-criado não encontra UID e devolve 2xx orphan,
 * intencionalmente; o ciclo seguinte executará normalmente.
 */
export async function ativarEasyLocalAgendamento(
  raw: EasyLocalAgendaAtivarInput,
  usuarioId: number,
  sessionToken: string
): Promise<EasyLocalAgendaResumo> {
  const input = easyLocalAgendaAtivarInput.parse(raw);
  requireActor(usuarioId);
  requireSession(sessionToken);
  const claims = await verifyPreview(input.tokenPrevia, input, usuarioId);
  try {
    // Não usa os contadores nem datas da prévia; só exige que o plano estático
    // recém-calculado seja exatamente a revisão aprovada no JWT.
    const fresh = await agendadaImporter().preverEasyLocalImportacaoAgendada(
      { leituraId: input.leituraId, estabelecimentoId: input.estabelecimentoId },
      usuarioId
    );
    if (fresh.revisao !== claims.revisao) {
      fail("CONFLICT", "A prévia ficou desatualizada. Gere uma nova prévia.");
    }

    const reservation = await reserveActivation(input, usuarioId, claims);
    const row = reservation.row;
    let nextExecutionAt: string | null | undefined;
    let createdTaskUid: string | null = null;
    try {
      if (reservation.existingUid) {
        // Nunca substituímos task UID: primeiro desabilitamos o job antigo,
        // depois atualizamos cron/configuração e o reabilitamos no mesmo UID.
        await updateHeartbeatJob(reservation.existingUid, { enable: false }, sessionToken);
        const updated = await updateHeartbeatJob(
          reservation.existingUid,
          { ...heartbeatPatch(row), enable: true },
          sessionToken
        );
        nextExecutionAt = updated.nextExecutionAt;
      } else {
        const created = await createHeartbeatJob(
          { name: heartbeatName(row.id), ...heartbeatPatch(row) },
          sessionToken
        );
        createdTaskUid = created.taskUid;
        nextExecutionAt = created.nextExecutionAt;
        await transaction(async connection => {
          const locked = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
          await updateByOperation(
            connection,
            locked,
            "schedule_cron_task_uid = ?",
            [created.taskUid]
          );
        });
      }
    } catch (error) {
      // Falha conhecida antes de um job novo existir permite apagar a reserva.
      // Depois de um UID existir, nunca deletamos/repetimos automaticamente.
      if (createdTaskUid && !(error instanceof CommitUncertainError)) {
        try {
          await deleteHeartbeatJob(createdTaskUid, sessionToken);
        } catch {
          await markIncertoBestEffort(row, "HEARTBEAT_REQUER_CONFERENCIA");
          throw error;
        }
      }
      if (!reservation.existingUid && !createdTaskUid && isKnownHeartbeatFailure(error)) {
        try {
          await transaction(async connection => {
            const locked = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
            if (!locked.scheduleCronTaskUid && locked.estado === "preparando") {
              await updateByOperation(connection, locked, "estado = 'erro', ultimo_resultado = ?", [
                JSON.stringify({ codigo: "HEARTBEAT_NAO_CRIADO" }),
              ]);
            }
          });
        } catch {
          // Mantém a reserva para conferência se não for possível confirmar limpeza.
        }
      } else {
        await markIncertoBestEffort(row, "HEARTBEAT_REQUER_CONFERENCIA");
      }
      throw error;
    }

    try {
      const activated = await transaction(async connection => {
        const locked = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
        await updateByOperation(
          connection,
          locked,
          "estado = 'ativo', proxima_execucao = ?, ultimo_resultado = NULL",
          [utcMysql(nextExecutionAt)]
        );
        return fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
      });
      logStatus("ativar", "ativo");
      return resumo(activated, usuarioId);
    } catch (error) {
      await markIncertoBestEffort(row, "ATIVACAO_REQUER_CONFERENCIA");
      throw error;
    }
  } catch (error) {
    sanitized(error, "Ativação não confirmada. Confira o agendamento antes de repetir.");
  }
}

/** Pausa lógica antes de chamar a plataforma. Assim, caso a plataforma falhe
 * depois, callback algum volta a executar e o administrador pode conferir o job. */
export async function pausarEasyLocalAgendamento(
  raw: EasyLocalAgendaAcaoInput,
  usuarioId: number,
  sessionToken: string
): Promise<EasyLocalAgendaResumo> {
  const input = easyLocalAgendaAcaoInput.parse(raw);
  requireActor(usuarioId);
  requireSession(sessionToken);
  let paused: AgendaRow;
  try {
    paused = await transaction(async connection => {
      await lockUnit(connection, input.estabelecimentoId);
      const row = await fetchAgendaLocked(connection, input.agendamentoId, input.estabelecimentoId);
      assertCreator(row, usuarioId);
      if (row.estado === "incerto") {
        fail("CONFLICT", "O agendamento incerto requer conferência e não pode ser pausado automaticamente.");
      }
      if (row.leaseAtiva) {
        fail("CONFLICT", "Há uma execução em andamento; aguarde a conclusão antes de pausar.");
      }
      if (!row.scheduleCronTaskUid) {
        fail("CONFLICT", "O job do agendamento requer conferência.");
      }
      if (row.estado !== "pausado") {
        await updateByOperation(connection, row, "estado = 'pausado', proxima_execucao = NULL", []);
      }
      return fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
    });
    await updateHeartbeatJob(paused.scheduleCronTaskUid!, { enable: false }, sessionToken);
    logStatus("pausar", "pausado");
    return resumo(paused, usuarioId);
  } catch (error) {
    sanitized(error, "Pausa não confirmada. Confira o agendamento antes de repetir.");
  }
}

/** Retoma apenas o mesmo cron previamente pausado, após recalcular a revisão.
 * Se a configuração/origem mudou, exige uma nova prévia e ativação explícita. */
export async function retomarEasyLocalAgendamento(
  raw: EasyLocalAgendaAcaoInput,
  usuarioId: number,
  sessionToken: string
): Promise<EasyLocalAgendaResumo> {
  const input = easyLocalAgendaAcaoInput.parse(raw);
  requireActor(usuarioId);
  requireSession(sessionToken);
  let current: AgendaRow;
  try {
    current = await transaction(async connection => {
      await lockUnit(connection, input.estabelecimentoId);
      const row = await fetchAgendaLocked(connection, input.agendamentoId, input.estabelecimentoId);
      assertCreator(row, usuarioId);
      if (row.estado === "incerto") {
        fail("CONFLICT", "O agendamento incerto requer conferência e não pode ser retomado.");
      }
      if (row.estado !== "pausado") fail("CONFLICT", "Somente agendamento pausado pode ser retomado.");
      if (row.leaseAtiva || !row.scheduleCronTaskUid) {
        fail("CONFLICT", "O agendamento requer conferência antes de retomar.");
      }
      await validateCatalog(connection, row.leituraId, row.estabelecimentoId, true);
      return row;
    });
    const latest = await agendadaImporter().preverEasyLocalImportacaoAgendada(
      { leituraId: current.leituraId, estabelecimentoId: current.estabelecimentoId },
      usuarioId
    );
    if (latest.revisao !== current.revisaoAprovada) {
      fail("CONFLICT", "A configuração mudou; gere uma nova prévia antes de ativar.");
    }
    // Uma falha de rede pode ocorrer depois de a plataforma já aceitar enable=true.
    // A partir desta tentativa não há repetição automática: o token da operação
    // precisa ser marcado incerto, inclusive se o commit local perder a confirmação.
    let enableAttempted = false;
    try {
      enableAttempted = true;
      const updated = await updateHeartbeatJob(
        current.scheduleCronTaskUid!,
        { ...heartbeatPatch(current), enable: true },
        sessionToken
      );
      const resumed = await transaction(async connection => {
        const locked = await fetchAgendaLocked(connection, current.id, current.estabelecimentoId);
        assertCreator(locked, usuarioId);
        if (locked.estado !== "pausado") fail("CONFLICT", "Estado do agendamento mudou durante a retomada.");
        await updateByOperation(connection, locked, "estado = 'ativo', proxima_execucao = ?", [
          utcMysql(updated.nextExecutionAt),
        ]);
        return fetchAgendaLocked(connection, locked.id, locked.estabelecimentoId);
      });
      logStatus("retomar", "ativo");
      return resumo(resumed, usuarioId);
    } catch (error) {
      if (enableAttempted) {
        await markIncertoBestEffort(current, "RETOMADA_REQUER_CONFERENCIA");
      }
      throw error;
    }
  } catch (error) {
    sanitized(error, "Retomada não confirmada. Confira o agendamento antes de repetir.");
  }
}

async function creatorAndUnitStillValid(
  connection: PoolConnection,
  row: AgendaRow
): Promise<boolean> {
  const [users] = await connection.execute<SqlRow[]>(
    "SELECT id, role FROM users WHERE id = ? FOR UPDATE",
    [row.criadoPor]
  );
  if (users.length !== 1 || users[0]!.role !== "admin") return false;
  const [units] = await connection.execute<SqlRow[]>(
    "SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE",
    [row.estabelecimentoId]
  );
  return units.length === 1;
}

async function logicalBlock(
  connection: PoolConnection,
  row: AgendaRow,
  code: string,
  state: "erro" | "incerto" = "erro"
): Promise<void> {
  if (!row.operacaoToken) return;
  await updateByOperation(
    connection,
    row,
    `estado = '${state}', execucao_token = NULL, lease_ate = NULL, ultimo_resultado = ?`,
    [JSON.stringify({ codigo: code })]
  );
}

async function logicalPause(
  connection: PoolConnection,
  row: AgendaRow,
  code: string
): Promise<void> {
  if (!row.operacaoToken) return;
  await updateByOperation(
    connection,
    row,
    "estado = 'pausado', execucao_token = NULL, lease_ate = NULL, proxima_execucao = NULL, ultimo_resultado = ?",
    [JSON.stringify({ codigo: code })]
  );
}

/** Reserva o lease e o slot em commit separado antes de chamar o importador.
 * Retentativas do Forge observam slot/lease e retornam 2xx sem repetir efeitos. */
async function reserveExecution(taskUid: string, now: Date): Promise<
  | { kind: "run"; row: AgendaRow; token: string }
  | { kind: "skip" | "blocked" | "uncertain" }
> {
  return transaction(async connection => {
    const row = await fetchByTaskUidLocked(connection, taskUid);
    if (!row) return { kind: "skip" };
    if (row.estado !== "ativo" || !row.operacaoToken) return { kind: "skip" };
    if (!(await creatorAndUnitStillValid(connection, row))) {
      await logicalPause(connection, row, "CRIADOR_OU_UNIDADE_REVOGADO");
      return { kind: "blocked" };
    }
    try {
      await validateCatalog(connection, row.leituraId, row.estabelecimentoId, true);
    } catch (error) {
      if (error instanceof TRPCError) {
        await logicalBlock(connection, row, "CONFIGURACAO_REVOGADA", "erro");
        return { kind: "blocked" };
      }
      throw error;
    }
    if (row.leaseExpirada && row.execucaoToken) {
      await logicalBlock(connection, row, "LEASE_EXPIRADO_REQUER_CONFERENCIA", "incerto");
      return { kind: "uncertain" };
    }
    if (row.leaseAtiva) return { kind: "skip" };
    const slot = slotAgendamento(row, now);
    if (!slot || row.ultimoSlot === slot) return { kind: "skip" };
    const token = randomUUID();
    await updateByOperation(
      connection,
      row,
      "execucao_token = ?, lease_ate = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE), ultimo_slot = ?",
      [token, slot]
    );
    return { kind: "run", row, token };
  });
}

async function finishExecution(
  row: AgendaRow,
  token: string,
  result: Counts
): Promise<void> {
  await transaction(async connection => {
    const locked = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
    if (locked.execucaoToken !== token || locked.estado !== "ativo") {
      fail("CONFLICT", "Finalização da execução requer conferência.");
    }
    await updateByOperation(
      connection,
      locked,
      "execucao_token = NULL, lease_ate = NULL, ultima_execucao = UTC_TIMESTAMP(3), ultimo_resultado = ?",
      [JSON.stringify(result)]
    );
  });
}

async function failExecutionKnown(row: AgendaRow, token: string): Promise<void> {
  await transaction(async connection => {
    const locked = await fetchAgendaLocked(connection, row.id, row.estabelecimentoId);
    if (locked.execucaoToken !== token) return;
    await logicalBlock(connection, locked, "EXECUCAO_FALHOU", "erro");
  });
}

/** Entrada exclusiva do callback; recebe somente o taskUid autenticado pela SDK.
 * Corpo HTTP, unidade, leitura e qualquer outro campo são deliberadamente ignorados. */
export async function executarEasyLocalAgendamentoPorTaskUid(
  taskUid: string,
  now = new Date()
): Promise<CallbackOutcome> {
  if (typeof taskUid !== "string" || taskUid.length < 1 || taskUid.length > 65) {
    return { status: "bloqueado" };
  }
  let reservation: Awaited<ReturnType<typeof reserveExecution>>;
  try {
    reservation = await reserveExecution(taskUid, now);
  } catch (error) {
    if (error instanceof CommitUncertainError) {
      await markTaskIncertoBestEffort(taskUid, "RESERVA_REQUER_CONFERENCIA");
      logStatus("callback", "reserva_incerta");
      return { status: "incerto" };
    }
    // Ainda não há lease/efeito de negócio: callback pode retornar 5xx e o
    // Forge pode repetir com segurança. O handler sanitiza o detalhe.
    throw error;
  }
  if (reservation.kind !== "run") {
    logStatus("callback", reservation.kind);
    return { status: reservation.kind === "blocked" ? "bloqueado" : reservation.kind === "uncertain" ? "incerto" : "ignorado" };
  }

  try {
    const result = await agendadaImporter().executarEasyLocalImportacaoAgendada(
      {
        leituraId: reservation.row.leituraId,
        estabelecimentoId: reservation.row.estabelecimentoId,
      },
      reservation.row.criadoPor,
      reservation.row.revisaoAprovada
    );
    const counts: Counts = {
      registrosLidos: result.registrosLidos,
      registrosInseridos: result.registrosInseridos,
      registrosAtualizados: result.registrosAtualizados,
      registrosInalterados: result.registrosInalterados,
    };
    await finishExecution(reservation.row, reservation.token, counts);
    logStatus("callback", "executado", counts);
    return { status: "executado", counts };
  } catch (error) {
    // Uma falha de importação sem confirmação de commit nunca é repetida. Erros
    // de validação/conflito conhecidos são bloqueados como erro operacional.
    if (error instanceof TRPCError && ["BAD_REQUEST", "CONFLICT", "NOT_FOUND", "FORBIDDEN"].includes(error.code)) {
      try {
        await failExecutionKnown(reservation.row, reservation.token);
      } catch {
        // A lease guard ainda impedirá repetição; expiração converterá em incerto.
      }
      logStatus("callback", "erro_conhecido");
      return { status: "erro" };
    }
    try {
      await transaction(async connection => {
        const locked = await fetchAgendaLocked(connection, reservation.row.id, reservation.row.estabelecimentoId);
        if (locked.execucaoToken === reservation.token) {
          await logicalBlock(connection, locked, "RESULTADO_REQUER_CONFERENCIA", "incerto");
        }
      });
    } catch {
      // Não propagar 5xx: a plataforma não deve repetir uma operação financeira
      // cujo resultado pode já ter sido confirmado no destino.
    }
    logStatus("callback", "incerto");
    return { status: "incerto" };
  }
}

/** Router extrai o valor decodificado pelo parser cookie padrão; exportado para
 * tornar explícito que a SDK recebe só app_session_id, nunca o header bruto. */
export function sessionTokenFromCookie(header: string | undefined): string {
  return parseCookie(header ?? "")[COOKIE_NAME] ?? "";
}

export const __easyLocalAgendamentoInternals = {
  cronUtcParaAgenda,
  slotAgendamento,
  safeResult,
};
