import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  WARLEINE_UPLOAD_BASE_PATH, WARLEINE_UPLOAD_CHUNK_BYTES,
  WARLEINE_UPLOAD_MAX_FILE_BYTES, WARLEINE_UPLOAD_REQUEST_BUDGET_MS,
  type WarleineUploadStart, type WarleineUploadStatus, type WarleineUploadState,
  type WarleineUploadReceipt,
} from "../shared/warleineUploadProtocol";
import { encryptWarleineFile, decryptWarleineFile } from "./warleineFileVault";
import { storageGet, storagePut } from "./storage";

const CONTROL_PREFIX = "warleine-upload:v1:";
const FILE_PREFIX = "warleine-chunks:v1:";
const OBJECT_PREFIX = "warleine-upload-data/v1/";
const MANIFEST_LIMIT = 64 * 1024;
const ENVELOPE_BYTES = 51;
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRIES = 8;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OBJECT_KEY = /^warleine-upload-data\/v1\/[a-f0-9]{48}$/;
const STATES = new Set(["recebendo", "finalizando", "erro", "enfileirado"]);

export class WarleineUploadError extends Error {
  constructor(public readonly status: number) { super("Não foi possível concluir o upload Warleine com segurança."); }
}
function fail(status = 400): never { throw new WarleineUploadError(status); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function sha(bytes: Buffer | string): string { return createHash("sha256").update(bytes).digest("hex"); }
function controlHash(actor: number, hosp: number, key: string): string { return sha(`warleine-upload:${actor}:${hosp}:${key.toLowerCase()}`); }
function objectKey(): string { return `${OBJECT_PREFIX}${randomBytes(24).toString("hex")}`; }
function expectedLength(bytes: number, index: number): number { return Math.min(WARLEINE_UPLOAD_CHUNK_BYTES, bytes - index * WARLEINE_UPLOAD_CHUNK_BYTES); }
function validFilename(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\x00-\x1f\x7f/\\]/.test(value) && /\.(csv|zip|xlsx)$/i.test(value);
}
function normalizeStart(input: WarleineUploadStart): WarleineUploadStart {
  if (!input || !integer(input.estabelecimentoId) || !integer(input.byteLength)
    || input.byteLength > WARLEINE_UPLOAD_MAX_FILE_BYTES || !validFilename(input.filename)
    || typeof input.idempotencyKey !== "string" || !UUID.test(input.idempotencyKey)
    || input.confirmarSubstituicao !== true) fail();
  return { ...input, idempotencyKey: input.idempotencyKey.toLowerCase() };
}
function sessionRowId(session: string): number {
  if (!/^[1-9][0-9]{0,14}\.[a-f0-9]{48}$/.test(session)) fail(404);
  const id = Number(session.split(".")[0]);
  if (!integer(id)) fail(404);
  return id;
}
function checkToken(session: string, token: string): void {
  const actual = Buffer.from(session.split(".")[1] ?? "");
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail(404);
}

export type WarleineUploadActor = { id: number; role: string; isCron?: boolean };
export type WarleineUploadPart = { index: number; byteLength: number; sha256: string; key: string };
export type WarleineUploadManifest = {
  version: 1; kind: "controle" | "selado"; token: string; userId: number;
  estabelecimentoId: number; idempotencyKey: string; filename: string;
  byteLength: number; chunkSize: number; totalChunks: number; expiresAt: number;
  state: WarleineUploadState; parts: WarleineUploadPart[];
  finalizeDeadlineAt?: number;
  fullSha256?: string; loteId?: number; jobStatus?: string;
};
export type WarleineUploadControl = {
  id: number; estabelecimentoId: number; criadoPor: number; arquivoHash: string;
  arquivoNome: string; arquivoTamanho: number; arquivoStorageKey: string; status: WarleineUploadState;
};
export type WarleineUploadJob = { loteId: number; status: string; created: boolean };
export interface WarleineUploadCloud {
  ready(): void;
  put(key: string, bytes: Buffer, signal: AbortSignal): Promise<void>;
  get(key: string, maxBytes: number, signal: AbortSignal): Promise<Buffer>;
}
export interface WarleineUploadRepository {
  reserve(actor: number, input: WarleineUploadStart, pointer: string, signal: AbortSignal): Promise<WarleineUploadControl>;
  get(id: number, actor: number, hosp: number, signal: AbortSignal): Promise<WarleineUploadControl>;
  cas(expected: WarleineUploadControl, pointer: string, state: WarleineUploadState, signal: AbortSignal): Promise<boolean>;
  publish(expected: WarleineUploadControl, manifest: WarleineUploadManifest, source: string,
    receipt: (job: WarleineUploadJob) => Promise<string>, signal: AbortSignal,
    beforeCommit?: () => Promise<void>): Promise<WarleineUploadJob>;
  jobStatus(loteId: number, hosp: number, signal: AbortSignal): Promise<string>;
}
export type WarleineUploadDependencies = {
  cloud: WarleineUploadCloud; repository: WarleineUploadRepository;
  authenticate(req: Request): Promise<WarleineUploadActor>;
  authorize(actor: WarleineUploadActor, hosp: number): Promise<boolean>;
  dispatch(scope: { loteId: number; estabelecimentoId: number }): Promise<unknown>;
  now?: () => number;
};

function validateManifest(value: unknown): WarleineUploadManifest {
  if (!value || typeof value !== "object") fail(409);
  const m = value as WarleineUploadManifest;
  if (m.version !== 1 || !["controle", "selado"].includes(m.kind) || !/^[a-f0-9]{48}$/.test(m.token)
    || !integer(m.userId) || !integer(m.estabelecimentoId) || !UUID.test(m.idempotencyKey)
    || !validFilename(m.filename) || !integer(m.byteLength) || m.byteLength > WARLEINE_UPLOAD_MAX_FILE_BYTES
    || m.chunkSize !== WARLEINE_UPLOAD_CHUNK_BYTES || m.totalChunks !== Math.ceil(m.byteLength / m.chunkSize)
    || !Number.isSafeInteger(m.expiresAt) || !STATES.has(m.state) || !Array.isArray(m.parts) || m.parts.length > m.totalChunks) fail(409);
  const seen = new Set<number>();
  for (const part of m.parts) {
    if (!part || !Number.isSafeInteger(part.index) || part.index < 0 || part.index >= m.totalChunks
    || seen.has(part.index) || part.byteLength !== expectedLength(m.byteLength, part.index)
      || !SHA.test(part.sha256) || !OBJECT_KEY.test(part.key)) fail(409);
    seen.add(part.index);
  }
  if (m.state === "finalizando" && (!Number.isSafeInteger(m.finalizeDeadlineAt) || m.finalizeDeadlineAt! <= 0)) fail(409);
  if (m.kind === "selado" && (m.parts.length !== m.totalChunks || !SHA.test(m.fullSha256 ?? ""))) fail(409);
  if (m.state === "enfileirado" && (!integer(m.loteId) || typeof m.jobStatus !== "string")) fail(409);
  return m;
}
async function saveManifest(cloud: WarleineUploadCloud, manifest: WarleineUploadManifest, prefix: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const bytes = Buffer.from(JSON.stringify(validateManifest(manifest)));
  if (bytes.length > MANIFEST_LIMIT) fail(409);
  const key = objectKey();
  await cloud.put(key, encryptWarleineFile(bytes), signal);
  signal.throwIfAborted();
  return `${prefix}${key}`;
}
async function readManifest(cloud: WarleineUploadCloud, pointer: string, prefix: string, signal: AbortSignal): Promise<WarleineUploadManifest> {
  if (!pointer.startsWith(prefix) || !OBJECT_KEY.test(pointer.slice(prefix.length))) fail(409);
  const encrypted = await cloud.get(pointer.slice(prefix.length), MANIFEST_LIMIT + ENVELOPE_BYTES, signal);
  if (encrypted.length > MANIFEST_LIMIT + ENVELOPE_BYTES) fail(409);
  let value: unknown;
  try { value = JSON.parse(decryptWarleineFile(encrypted).toString("utf8")); } catch { fail(409); }
  return validateManifest(value);
}
async function readPart(cloud: WarleineUploadCloud, part: WarleineUploadPart, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted();
  const encrypted = await cloud.get(part.key, part.byteLength + ENVELOPE_BYTES, signal);
  if (encrypted.length > part.byteLength + ENVELOPE_BYTES) fail(409);
  let bytes: Buffer;
  try { bytes = decryptWarleineFile(encrypted); } catch { fail(409); }
  if (bytes.length !== part.byteLength || sha(bytes) !== part.sha256) fail(409);
  signal.throwIfAborted();
  return bytes;
}

export function createWarleineUploadService(deps: WarleineUploadDependencies) {
  const now = deps.now ?? Date.now;
  async function load(actor: number, hosp: number, sessionId: string, signal: AbortSignal) {
    const row = await deps.repository.get(sessionRowId(sessionId), actor, hosp, signal);
    const manifest = await readManifest(deps.cloud, row.arquivoStorageKey, CONTROL_PREFIX, signal);
    checkToken(sessionId, manifest.token);
    if (manifest.kind !== "controle" || manifest.userId !== actor || manifest.estabelecimentoId !== hosp
      || row.criadoPor !== actor || row.estabelecimentoId !== hosp || manifest.byteLength !== row.arquivoTamanho
      || manifest.filename !== row.arquivoNome || controlHash(actor, hosp, manifest.idempotencyKey) !== row.arquivoHash
      || manifest.state !== row.status) fail(409);
    return { row, manifest };
  }
  function ready() {
    deps.cloud.ready();
    // Production must use its dedicated key, not the legacy JWT fallback.
    if (process.env.NODE_ENV === "production" && (process.env.WARLEINE_FILE_ENCRYPTION_KEY?.length ?? 0) < 32) fail(503);
    const probe = Buffer.from("warleine-upload-ready-v1");
    if (!decryptWarleineFile(encryptWarleineFile(probe)).equals(probe)) fail(503);
  }
  function receiving(m: WarleineUploadManifest) {
    if (m.state !== "recebendo" || now() >= m.expiresAt) fail(409);
  }
  async function start(actor: number, input: WarleineUploadStart, signal: AbortSignal) {
    if (!integer(actor)) fail(403);
    input = normalizeStart(input);
    ready(); // Never reserve a control until durable storage and encryption are ready.
    const manifest: WarleineUploadManifest = {
      version: 1, kind: "controle", token: randomBytes(24).toString("hex"), userId: actor,
      estabelecimentoId: input.estabelecimentoId, idempotencyKey: input.idempotencyKey,
      filename: input.filename, byteLength: input.byteLength, chunkSize: WARLEINE_UPLOAD_CHUNK_BYTES,
      totalChunks: Math.ceil(input.byteLength / WARLEINE_UPLOAD_CHUNK_BYTES), expiresAt: now() + TTL_MS,
      state: "recebendo", parts: [],
    };
    const pointer = await saveManifest(deps.cloud, manifest, CONTROL_PREFIX, signal);
    const row = await deps.repository.reserve(actor, input, pointer, signal);
    const stored = await readManifest(deps.cloud, row.arquivoStorageKey, CONTROL_PREFIX, signal);
    if (stored.userId !== actor || stored.estabelecimentoId !== input.estabelecimentoId
      || stored.filename !== input.filename || stored.byteLength !== input.byteLength
      || stored.idempotencyKey !== input.idempotencyKey || stored.state !== row.status) fail(409);
    // Receipt sessions remain reconcilable beyond the receiving TTL.
    if (stored.state !== "enfileirado" && now() >= stored.expiresAt) fail(409);
    return { sessionId: `${row.id}.${stored.token}`, chunkSize: WARLEINE_UPLOAD_CHUNK_BYTES, maxFileBytes: WARLEINE_UPLOAD_MAX_FILE_BYTES };
  }
  async function status(actor: number, hosp: number, session: string, signal: AbortSignal): Promise<WarleineUploadStatus> {
    let { row, manifest } = await load(actor, hosp, session, signal);
    if (["recebendo", "finalizando"].includes(manifest.state) && (now() >= manifest.expiresAt
      || (manifest.state === "finalizando" && now() >= manifest.finalizeDeadlineAt!))) {
      // A final publication also fences its control. If it committed or currently
      // holds the control lock, this CAS cannot blindly undo its durable receipt.
      const pointer = await saveManifest(deps.cloud, { ...manifest, state: "erro" }, CONTROL_PREFIX, signal);
      await deps.repository.cas(row, pointer, "erro", signal);
      ({ row, manifest } = await load(actor, hosp, session, signal));
    }
    const state = manifest.state !== "enfileirado" && now() >= manifest.expiresAt ? "erro" : manifest.state;
    return {
      state, uploadedIndices: manifest.parts.map(part => part.index).sort((a, b) => a - b),
      totalChunks: manifest.totalChunks, byteLength: manifest.byteLength,
      ...(state === "erro" ? { recoveryRequired: true } : {}),
      ...(state === "enfileirado" ? { loteId: manifest.loteId, jobStatus: await deps.repository.jobStatus(manifest.loteId!, hosp, signal) } : {}),
    };
  }
  async function put(actor: number, hosp: number, session: string, index: number, bytes: Buffer, claimedSha: string, signal: AbortSignal) {
    if (!Buffer.isBuffer(bytes) || bytes.length > WARLEINE_UPLOAD_CHUNK_BYTES || !SHA.test(claimedSha)
      || !Number.isSafeInteger(index) || index < 0 || sha(bytes) !== claimedSha) fail();
    let uploaded: WarleineUploadPart | undefined;
    for (let retry = 0; retry < RETRIES; retry++) {
      signal.throwIfAborted();
      const { row, manifest } = await load(actor, hosp, session, signal);
      if (index >= manifest.totalChunks || bytes.length !== expectedLength(manifest.byteLength, index)) fail();
      const existing = manifest.parts.find(part => part.index === index);
      if (existing) {
        if (existing.sha256 !== claimedSha || existing.byteLength !== bytes.length) fail(409);
        return { success: true as const, index }; // Dedup even after finalization; a wrong file still conflicts.
      }
      receiving(manifest);
      if (!uploaded) {
        uploaded = { index, byteLength: bytes.length, sha256: claimedSha, key: objectKey() };
        await deps.cloud.put(uploaded.key, encryptWarleineFile(bytes), signal);
      }
      const next = { ...manifest, parts: [...manifest.parts, uploaded].sort((a, b) => a.index - b.index) };
      const pointer = await saveManifest(deps.cloud, next, CONTROL_PREFIX, signal);
      if (await deps.repository.cas(row, pointer, "recebendo", signal)) return { success: true as const, index };
    }
    fail(409);
  }
  async function finalize(actor: number, hosp: number, session: string, signal: AbortSignal,
    authorizeAgain?: () => Promise<void>): Promise<WarleineUploadReceipt> {
    ready();
    let { row, manifest } = await load(actor, hosp, session, signal);
    if (manifest.state === "enfileirado") return {
      success: true, sessionId: session, estabelecimentoId: hosp, loteId: manifest.loteId!,
      status: await deps.repository.jobStatus(manifest.loteId!, hosp, signal),
    };
    receiving(manifest);
    if (manifest.parts.length !== manifest.totalChunks) fail(409);
    const next = { ...manifest, state: "finalizando" as const, finalizeDeadlineAt: now() + WARLEINE_UPLOAD_REQUEST_BUDGET_MS };
    const pointer = await saveManifest(deps.cloud, next, CONTROL_PREFIX, signal);
    if (!(await deps.repository.cas(row, pointer, "finalizando", signal))) fail(409);
    row = { ...row, arquivoStorageKey: pointer, status: "finalizando" };
    manifest = next;
    try {
      const whole = createHash("sha256");
      let length = 0;
      for (const part of manifest.parts.slice().sort((a, b) => a.index - b.index)) {
        const bytes = await readPart(deps.cloud, part, signal);
        length += bytes.length;
        if (length > WARLEINE_UPLOAD_MAX_FILE_BYTES) fail(409);
        whole.update(bytes);
      }
      if (length !== manifest.byteLength) fail(409);
      const sealed: WarleineUploadManifest = { ...manifest, kind: "selado", fullSha256: whole.digest("hex") };
      const source = await saveManifest(deps.cloud, sealed, FILE_PREFIX, signal);
      const beforeCommit = async () => {
        signal.throwIfAborted();
        if (now() >= manifest.finalizeDeadlineAt!) fail(408);
        await authorizeAgain?.();
        signal.throwIfAborted();
        if (now() >= manifest.finalizeDeadlineAt!) fail(408);
      };
      await beforeCommit();
      const job = await deps.repository.publish(row, sealed, source, async actual => {
        const receipt = { ...manifest, state: "enfileirado" as const, loteId: actual.loteId, jobStatus: actual.status };
        return saveManifest(deps.cloud, receipt, CONTROL_PREFIX, signal);
      }, signal, beforeCommit);
      // No global drain, no re-emission for existing queued/active/published jobs.
      if (job.created) void deps.dispatch({ loteId: job.loteId, estabelecimentoId: hosp }).catch(() => undefined);
      return { success: true, sessionId: session, estabelecimentoId: hosp, loteId: job.loteId, status: job.status };
    } catch {
      // A commit may have succeeded. CAS guards the old pointer, so a durable receipt
      // cannot be turned into an error or re-published after an uncertain response.
      if (!signal.aborted) {
        try {
          const failed = await saveManifest(deps.cloud, { ...manifest, state: "erro" }, CONTROL_PREFIX, signal);
          await deps.repository.cas(row, failed, "erro", signal);
        } catch { /* Preserve finalizando on uncertain cleanup; status is authoritative. */ }
      }
      fail(signal.aborted ? 408 : 409);
    }
  }
  return { start, status, put, finalize };
}

export function createWarleineUploadCloudStorage(): WarleineUploadCloud {
  return {
    ready() {
      const url = process.env.BUILT_IN_FORGE_API_URL;
      if (!url || !process.env.BUILT_IN_FORGE_API_KEY) fail(503);
      try { if (!["http:", "https:"].includes(new URL(url).protocol)) fail(503); } catch { fail(503); }
    },
    async put(key, bytes, signal) {
      if (!OBJECT_KEY.test(key) || bytes.length > WARLEINE_UPLOAD_CHUNK_BYTES + ENVELOPE_BYTES) fail(409);
      signal.throwIfAborted();
      const result = await storagePut(key, bytes, "application/octet-stream", signal);
      if (result.key !== key) fail(503);
    },
    async get(key, maxBytes, signal) {
      if (!OBJECT_KEY.test(key) || maxBytes > WARLEINE_UPLOAD_CHUNK_BYTES + ENVELOPE_BYTES) fail(409);
      signal.throwIfAborted();
      const { url } = await storageGet(key, signal);
      let validated: URL;
      try { validated = new URL(url); } catch { fail(503); }
      if (!["http:", "https:"].includes(validated.protocol) || validated.username || validated.password) fail(503);
      const response = await fetch(validated.href, { signal });
      if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); fail(503); }
      const reader = response.body.getReader();
      let cancellation: Promise<void> | undefined;
      const cancel = () => cancellation ??= reader.cancel().catch(() => undefined);
      const abort = () => { void cancel(); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          signal.throwIfAborted();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > maxBytes) fail(409);
          chunks.push(next.value);
        }
        return Buffer.concat(chunks, size);
      } finally { signal.removeEventListener("abort", abort); await cancel(); reader.releaseLock(); }
    },
  };
}

// The adapter needs only existing SQL0119/0120/0122 columns. It executes no DDL.
export type WarleineUploadSqlConnection = {
  query(sql: string, values?: unknown[]): Promise<any>;
  execute(sql: string, values?: unknown[]): Promise<any>;
  beginTransaction(): Promise<void>; commit(): Promise<void>; rollback(): Promise<void>;
  release(): void; destroy(): void;
};
export type WarleineUploadSqlPool = { getConnection(): Promise<WarleineUploadSqlConnection> };
export function createWarleineUploadSqlRepository(getPool: () => Promise<WarleineUploadSqlPool | null>): WarleineUploadRepository {
  async function use<T>(signal: AbortSignal, transaction: boolean, run: (c: WarleineUploadSqlConnection) => Promise<T>, beforeCommit?: () => Promise<void>): Promise<T> {
    signal.throwIfAborted();
    const pool = await getPool();
    if (!pool) fail(503);
    signal.throwIfAborted();
    const connection = await new Promise<WarleineUploadSqlConnection>((resolve, reject) => {
      let settled = false;
      const abort = () => { settled = true; reject(new WarleineUploadError(408)); };
      signal.addEventListener("abort", abort, { once: true });
      pool.getConnection().then(c => {
        signal.removeEventListener("abort", abort);
        if (settled || signal.aborted) { c.release(); if (!settled) reject(new WarleineUploadError(408)); }
        else { settled = true; resolve(c); }
      }, () => { signal.removeEventListener("abort", abort); settled = true; reject(new WarleineUploadError(503)); });
    });
    const abort = () => connection.destroy();
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      if (transaction) await connection.beginTransaction();
      const value = await run(connection);
      signal.throwIfAborted();
      await beforeCommit?.();
      signal.throwIfAborted();
      if (transaction) await connection.commit();
      signal.throwIfAborted();
      return value;
    } catch (error) {
      if (transaction && !signal.aborted) await connection.rollback().catch(() => undefined);
      throw error instanceof WarleineUploadError ? error : new WarleineUploadError(signal.aborted ? 408 : 503);
    } finally { signal.removeEventListener("abort", abort); connection.release(); }
  }
  async function establishment(c: WarleineUploadSqlConnection, hosp: number) {
    const [rows] = await c.query("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE", [hosp]);
    if (!rows[0]) fail(404);
  }
  const scope = (row: WarleineUploadControl) => [row.id, row.criadoPor, row.estabelecimentoId, row.arquivoHash, row.arquivoStorageKey, row.status];
  const predicate = "id=? AND criadoPor=? AND estabelecimentoId=? AND arquivoHash=? AND BINARY arquivoStorageKey=BINARY ? AND BINARY status=BINARY ? AND origem='upload-controle'";
  return {
    async reserve(actor, input, pointer, signal) {
      return use(signal, true, async c => {
        await establishment(c, input.estabelecimentoId);
        const hash = controlHash(actor, input.estabelecimentoId, input.idempotencyKey);
        const [rows] = await c.query("SELECT * FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND arquivoHash=? LIMIT 1 FOR UPDATE", [input.estabelecimentoId, hash]);
        if (rows[0]) {
          const row = rows[0];
          if (row.origem !== "upload-controle" || Number(row.criadoPor) !== actor || row.arquivoNome !== input.filename || Number(row.arquivoTamanho) !== input.byteLength) fail(409);
          return row;
        }
        const [result] = await c.execute("INSERT INTO warleine_faturamento_lotes (estabelecimentoId,origem,arquivoNome,arquivoHash,arquivoTamanho,arquivoStorageKey,status,tentativas,criadoPor) VALUES (?,'upload-controle',?,?,?,?,'recebendo',0,?)", [input.estabelecimentoId, input.filename, hash, input.byteLength, pointer, actor]);
        const id = Number(result.insertId);
        if (!integer(id)) fail(503);
        return { id, estabelecimentoId: input.estabelecimentoId, criadoPor: actor, arquivoHash: hash, arquivoNome: input.filename, arquivoTamanho: input.byteLength, arquivoStorageKey: pointer, status: "recebendo" as const };
      });
    },
    async get(id, actor, hosp, signal) {
      return use(signal, false, async c => {
        const [rows] = await c.query("SELECT * FROM warleine_faturamento_lotes WHERE id=? AND criadoPor=? AND estabelecimentoId=? AND origem='upload-controle' LIMIT 1", [id, actor, hosp]);
        if (!rows[0]) fail(404);
        return rows[0];
      });
    },
    async cas(row, pointer, state, signal) {
      return use(signal, false, async c => {
        const [result] = await c.execute(`UPDATE warleine_faturamento_lotes SET arquivoStorageKey=?,status=?,atualizadoEm=NOW() WHERE ${predicate}`, [pointer, state, ...scope(row)]);
        return Number(result.affectedRows) === 1;
      });
    },
    async publish(row, manifest, source, receipt, signal, beforeCommit) {
      return use(signal, true, async c => {
        await establishment(c, row.estabelecimentoId);
        const [controls] = await c.query(`SELECT id FROM warleine_faturamento_lotes WHERE ${predicate} FOR UPDATE`, scope(row));
        if (!controls[0] || row.status !== "finalizando" || manifest.kind !== "selado" || !SHA.test(manifest.fullSha256 ?? "") || !source.startsWith(FILE_PREFIX)) fail(409);
        const [rows] = await c.query("SELECT id,status,origem FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND arquivoHash=? LIMIT 1 FOR UPDATE", [row.estabelecimentoId, manifest.fullSha256]);
        let job: WarleineUploadJob;
        if (rows[0]) {
          if (rows[0].origem === "upload-controle") fail(409);
          // Even failed existing jobs retain their original source; retry is a separate, authorized workflow.
          job = { loteId: Number(rows[0].id), status: String(rows[0].status), created: false };
        } else {
          const [result] = await c.execute("INSERT INTO warleine_faturamento_lotes (estabelecimentoId,origem,arquivoNome,arquivoHash,arquivoTamanho,arquivoStorageKey,status,tentativas,criadoPor) VALUES (?,'arquivo',?,?,?,?,'enfileirado',0,?)", [row.estabelecimentoId, manifest.filename, manifest.fullSha256, manifest.byteLength, source, row.criadoPor]);
          job = { loteId: Number(result.insertId), status: "enfileirado", created: true };
        }
        if (!integer(job.loteId)) fail(503);
        const receiptPointer = await receipt(job);
        signal.throwIfAborted();
        const [result] = await c.execute(`UPDATE warleine_faturamento_lotes SET arquivoStorageKey=?,status='enfileirado',atualizadoEm=NOW() WHERE ${predicate}`, [receiptPointer, ...scope(row)]);
        if (Number(result.affectedRows) !== 1) fail(409);
        return job;
      }, beforeCommit);
    },
    async jobStatus(loteId, hosp, signal) {
      return use(signal, false, async c => {
        const [rows] = await c.query("SELECT status FROM warleine_faturamento_lotes WHERE id=? AND estabelecimentoId=? AND origem<>'upload-controle' LIMIT 1", [loteId, hosp]);
        if (!rows[0]) fail(404);
        return String(rows[0].status);
      });
    },
  };
}

export function createWarleineUploadProductionDependencies(): WarleineUploadDependencies {
  return {
    cloud: createWarleineUploadCloudStorage(),
    repository: createWarleineUploadSqlRepository(async () => {
      const { getRawPool } = await import("./db");
      return await getRawPool() as unknown as WarleineUploadSqlPool | null;
    }),
    async authenticate(req) { const { sdk } = await import("./_core/sdk"); return sdk.authenticateRequest(req); },
    async authorize(actor, hosp) {
      if (actor.isCron || !integer(actor.id) || !integer(hosp)) return false;
      if (actor.role === "admin") return true;
      const db = await import("./db");
      return await db.verificarPermissaoEstabelecimento(actor.id, hosp, "gerenciar")
        && (await db.verificarAcessoModulo(actor.id, hosp, "contaConvenio") || await db.verificarAcessoModulo(actor.id, hosp, "relFaturadoRecebido"));
    },
    async dispatch(scope) { const { processNextWarleineImportJob } = await import("./warleineFaturamentoWorker"); return processNextWarleineImportJob(scope); },
  };
}

async function rawRequest(req: Request, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") fail();
  const chunks: Buffer[] = [];
  let bytes = 0;
  const abort = () => req.destroy();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    for await (const chunk of req) {
      signal.throwIfAborted();
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) fail(413);
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, bytes);
  } finally { signal.removeEventListener("abort", abort); }
}
export function registerWarleineUploadRoutes(router: Router, deps: WarleineUploadDependencies): void {
  const service = createWarleineUploadService(deps);
  const route = (operation: "start" | "status" | "put" | "finalize") => async (req: Request, res: Response) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WARLEINE_UPLOAD_REQUEST_BUDGET_MS);
    timer.unref();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort); res.on("close", abort);
    req.setTimeout(WARLEINE_UPLOAD_REQUEST_BUDGET_MS, abort);
    res.setTimeout(WARLEINE_UPLOAD_REQUEST_BUDGET_MS, abort);
    res.setHeader("Cache-Control", "no-store");
    try {
      let actor: WarleineUploadActor;
      try { actor = await deps.authenticate(req); } catch { fail(401); }
      controller.signal.throwIfAborted();
      const hosp = operation === "start" ? req.body?.estabelecimentoId : Number(req.header("x-estabelecimento-id"));
      if (!integer(hosp)) fail();
      if (actor.isCron || !integer(actor.id) || !(await deps.authorize(actor, hosp))) fail(403);
      controller.signal.throwIfAborted();
      let result: unknown;
      if (operation === "start") result = await service.start(actor.id, req.body, controller.signal);
      else if (operation === "status") result = await service.status(actor.id, hosp, req.params.sessionId, controller.signal);
      else if (operation === "finalize") result = await service.finalize(actor.id, hosp, req.params.sessionId, controller.signal, async () => {
        const current = await deps.authenticate(req);
        if (current.id !== actor.id || current.isCron || !(await deps.authorize(current, hosp))) fail(403);
      });
      else {
        if (!/^(0|[1-9][0-9]*)$/.test(req.params.index) || !/application\/octet-stream(?:;|$)/i.test(req.header("content-type") ?? "")) fail();
        const claimed = req.header("x-chunk-sha256") ?? "";
        if (!SHA.test(claimed)) fail();
        // Validate actor/session/token and bounds before consuming raw hospital bytes.
        const state = await service.status(actor.id, hosp, req.params.sessionId, controller.signal);
        const index = Number(req.params.index);
        if (!Number.isSafeInteger(index) || index >= state.totalChunks) fail();
        const length = expectedLength(state.byteLength, index);
        const headerLength = req.header("content-length");
        if (headerLength !== undefined && (!/^[0-9]+$/.test(headerLength) || Number(headerLength) !== length)) fail();
        const bytes = await rawRequest(req, length, controller.signal);
        result = await service.put(actor.id, hosp, req.params.sessionId, index, bytes, claimed, controller.signal);
      }
      controller.signal.throwIfAborted();
      if (!res.destroyed) res.status(200).json(result);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(controller.signal.aborted ? 408 : error instanceof WarleineUploadError ? error.status : 503)
        .json({ error: "Não foi possível concluir o upload Warleine com segurança. Consulte o status antes de tentar novamente." });
    } finally { clearTimeout(timer); req.removeListener("aborted", abort); res.removeListener("close", abort); }
  };
  router.post(WARLEINE_UPLOAD_BASE_PATH, route("start"));
  router.get(`${WARLEINE_UPLOAD_BASE_PATH}/:sessionId`, route("status"));
  router.put(`${WARLEINE_UPLOAD_BASE_PATH}/:sessionId/blocos/:index`, route("put"));
  router.post(`${WARLEINE_UPLOAD_BASE_PATH}/:sessionId/finalizar`, route("finalize"));
}

export async function downloadWarleineChunkFileWithCloud(cloud: WarleineUploadCloud, storageKey: string, localPath: string,
  expected: { estabelecimentoId: number; userId?: number }, signal?: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const budget = signal ?? controller.signal;
  const timer = signal ? undefined : setTimeout(() => controller.abort(), WARLEINE_UPLOAD_REQUEST_BUDGET_MS);
  timer?.unref();
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false;
  try {
    cloud.ready();
    budget.throwIfAborted();
    if (!integer(expected.estabelecimentoId) || (expected.userId !== undefined && !integer(expected.userId))) fail(403);
    const manifest = await readManifest(cloud, storageKey, FILE_PREFIX, budget);
    if (manifest.kind !== "selado" || manifest.state !== "finalizando" || manifest.estabelecimentoId !== expected.estabelecimentoId
      || (expected.userId !== undefined && manifest.userId !== expected.userId)) fail(403);
    handle = await fs.open(localPath, "wx", 0o600);
    created = true;
    const whole = createHash("sha256");
    let length = 0;
    for (const part of manifest.parts.slice().sort((a, b) => a.index - b.index)) {
      const bytes = await readPart(cloud, part, budget);
      length += bytes.length;
      if (length > manifest.byteLength || length > WARLEINE_UPLOAD_MAX_FILE_BYTES) fail(409);
      whole.update(bytes);
      let offset = 0;
      while (offset < bytes.length) {
        budget.throwIfAborted();
        const result = await handle.write(bytes, offset, bytes.length - offset);
        if (result.bytesWritten <= 0) fail(503);
        offset += result.bytesWritten;
      }
    }
    if (length !== manifest.byteLength || whole.digest("hex") !== manifest.fullSha256) fail(409);
    budget.throwIfAborted();
    await handle.sync();
    budget.throwIfAborted();
    await handle.close(); handle = undefined;
  } catch {
    await handle?.close().catch(() => undefined);
    if (created) await fs.unlink(localPath).catch(() => undefined);
    throw new WarleineUploadError(budget.aborted ? 408 : 409);
  } finally { if (timer) clearTimeout(timer); }
}
export async function downloadWarleineChunkFile(storageKey: string, localPath: string,
  expected: { estabelecimentoId: number; userId?: number }, signal?: AbortSignal): Promise<void> {
  return downloadWarleineChunkFileWithCloud(createWarleineUploadCloudStorage(), storageKey, localPath, expected, signal);
}
