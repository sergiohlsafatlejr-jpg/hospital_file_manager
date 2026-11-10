import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { nanoid } from "nanoid";
import type { RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import { storageGet } from "./storage";
import { importWarleineFaturamentoFile } from "./warleineFaturamentoImportService";
import { decryptWarleineFile } from "./warleineFileVault";
import { downloadWarleineChunkFile } from "./warleineUploadChunks";

const WORK_DIR = "/tmp/portal-safatle-warleine-worker";
const POLL_MS = 30_000;
const LEASE_MINUTES = 20;
const JOB_TIMEOUT_MS = 15 * 60_000;
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_ENCRYPTED_BYTES = MAX_FILE_BYTES + 64 * 1024;
const CHUNKS_PREFIX = "warleine-chunks:v1:";
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let running = false;
let initialized = false;
let timer: NodeJS.Timeout | null = null;

export type WarleineJobScope = { loteId: number; estabelecimentoId: number };
export type WarleineDurableStatus = "enfileirado" | "reservado" | "processando" | "validado" | "publicado" | "erro";
export type WarleineJobResult = WarleineJobScope & {
  outcome: "published" | "busy" | "not_claimed" | "not_published" | "error";
  durableStatus: WarleineDurableStatus | null;
  published: boolean;
  errorCode?: "WARLEINE_JOB_FAILED" | "WARLEINE_STATUS_UNAVAILABLE";
};

/** The adapter reconstructs a durable chunk source; claim ownership remains in this worker. */
export type WarleineChunkDownloader = (input: WarleineJobScope & {
  storageKey: string;
  localPath: string;
  deadlineAtMs: number;
}) => Promise<void>;
export type WarleineProcessOptions = {
  /** Development/test opt-in only. Production rejects local sources unconditionally. */
  allowLocalSource?: boolean;
  downloadChunks?: WarleineChunkDownloader;
};

type WarleineJobRow = RowDataPacket & {
  id: number;
  estabelecimentoId: number;
  configId: number | null;
  arquivoNome: string;
  arquivoStorageKey: string;
  criadoPor: number;
  claimToken: string;
};

function assertScope(scope: WarleineJobScope): void {
  if (!Number.isSafeInteger(scope.loteId) || scope.loteId <= 0
    || !Number.isSafeInteger(scope.estabelecimentoId) || scope.estabelecimentoId <= 0) {
    throw new Error("Escopo de job Warleine inválido.");
  }
}

function assertDeadline(deadlineAtMs: number): void {
  if (Date.now() >= deadlineAtMs) throw new Error("Prazo do job Warleine excedido.");
}

async function claimWarleineJob(scope?: WarleineJobScope): Promise<WarleineJobRow | null> {
  if (scope) assertScope(scope);
  const pool = await getRawPool();
  if (!pool) throw new Error("Serviço de jobs Warleine indisponível.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<WarleineJobRow[]>(`
      SELECT id,estabelecimentoId,configId,arquivoNome,arquivoStorageKey,criadoPor
      FROM warleine_faturamento_lotes
      WHERE arquivoStorageKey IS NOT NULL
        AND origem!='upload-controle'
        AND arquivoStorageKey NOT LIKE 'warleine-upload:v1:%'
        ${scope ? "AND id=? AND estabelecimentoId=?" : ""}
        AND tentativas<3
        AND (
          status IN ('enfileirado','erro')
          OR (status IN ('reservado','processando','validado') AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW()))
        )
        AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW())
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `, scope ? [scope.loteId, scope.estabelecimentoId] : []);
    const candidate = rows[0];
    if (!candidate) {
      await connection.commit();
      return null;
    }
    if (scope && (Number(candidate.id) !== scope.loteId || Number(candidate.estabelecimentoId) !== scope.estabelecimentoId)) {
      throw new Error("Claim Warleine fora do escopo solicitado.");
    }
    const claimToken = randomUUID();
    const [result] = await connection.execute<any>(`
      UPDATE warleine_faturamento_lotes
      SET status='reservado', tentativas=tentativas+1, claimToken=?, claimedBy=?,
          leaseExpiresAt=DATE_ADD(NOW(), INTERVAL ${LEASE_MINUTES} MINUTE), erroResumo=NULL, atualizadoEm=NOW()
      WHERE id=? AND estabelecimentoId=? AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW())
    `, [claimToken, WORKER_ID, candidate.id, candidate.estabelecimentoId]);
    if (Number(result.affectedRows || 0) !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return { ...candidate, claimToken };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

/** Immediate callers must use this claim, never the global queue selector. */
export async function claimWarleineJobByScope(scope: WarleineJobScope): Promise<WarleineJobRow | null> {
  return claimWarleineJob(scope);
}

/** Global queue claim reserved for the pre-existing background consumer. */
export async function claimNextWarleineJob(): Promise<WarleineJobRow | null> {
  return claimWarleineJob();
}

/** Read only minimal durable metadata, never erroResumo or clinical/source contents. */
export async function getWarleineImportJobStatus(scope: WarleineJobScope): Promise<WarleineDurableStatus | null> {
  assertScope(scope);
  const pool = await getRawPool();
  if (!pool) throw new Error("Serviço de jobs Warleine indisponível.");
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id,estabelecimentoId,status FROM warleine_faturamento_lotes WHERE id=? AND estabelecimentoId=? LIMIT 1",
    [scope.loteId, scope.estabelecimentoId],
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.id) !== scope.loteId || Number(row.estabelecimentoId) !== scope.estabelecimentoId) {
    throw new Error("Estado Warleine fora do escopo solicitado.");
  }
  const status = String(row.status);
  return ["enfileirado", "reservado", "processando", "validado", "publicado", "erro"].includes(status)
    ? status as WarleineDurableStatus : null;
}

async function statusResult(scope: WarleineJobScope, outcome: WarleineJobResult["outcome"], errorCode?: WarleineJobResult["errorCode"]): Promise<WarleineJobResult> {
  try {
    const durableStatus = await getWarleineImportJobStatus(scope);
    return { ...scope, outcome, durableStatus, published: outcome === "published" && durableStatus === "publicado", ...(errorCode ? { errorCode } : {}) };
  } catch {
    return { ...scope, outcome: "error", durableStatus: null, published: false, errorCode: errorCode ?? "WARLEINE_STATUS_UNAVAILABLE" };
  }
}

/** Extensible storage wrapper; a chunk reference never falls through to legacy storage/local. */
export async function downloadJobFile(storageKey: string, localPath: string, scope: WarleineJobScope, deadlineAtMs: number, options: WarleineProcessOptions = {}): Promise<void> {
  assertScope(scope);
  assertDeadline(deadlineAtMs);
  if (storageKey.startsWith(CHUNKS_PREFIX)) {
    if (options.downloadChunks) {
      await options.downloadChunks({ ...scope, storageKey, localPath, deadlineAtMs });
    } else {
      await downloadWarleineChunkFile(storageKey, localPath, { estabelecimentoId: scope.estabelecimentoId },
        AbortSignal.timeout(Math.max(1, deadlineAtMs - Date.now())));
    }
    assertDeadline(deadlineAtMs);
    if ((await stat(localPath)).size > MAX_FILE_BYTES) throw new Error("Arquivo Warleine excede o limite do worker.");
    return;
  }
  if (storageKey.startsWith("warleine-upload:v1:")) throw new Error("Controle de upload não é fonte publicável.");
  let encrypted: Buffer;
  if (storageKey.startsWith("local:")) {
    if (process.env.NODE_ENV === "production" || options.allowLocalSource !== true) {
      throw new Error("Fonte local Warleine não permitida.");
    }
    const sourcePath = storageKey.slice("local:".length);
    if ((await stat(sourcePath)).size > MAX_ENCRYPTED_BYTES) throw new Error("Arquivo Warleine excede o limite do worker.");
    encrypted = await readFile(sourcePath);
  } else {
    const signal = AbortSignal.timeout(Math.max(1, deadlineAtMs - Date.now()));
    const { url } = await storageGet(storageKey, signal);
    assertDeadline(deadlineAtMs);
    const response = await fetch(url, { signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Falha ao recuperar arquivo durável Warleine.");
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_ENCRYPTED_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Arquivo Warleine excede o limite do worker.");
    }
    if (!response.body) throw new Error("Arquivo durável Warleine indisponível.");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        assertDeadline(deadlineAtMs);
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ENCRYPTED_BYTES) throw new Error("Arquivo Warleine excede o limite do worker.");
        parts.push(value);
      }
      encrypted = Buffer.concat(parts, bytes);
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  assertDeadline(deadlineAtMs);
  if (encrypted.length > MAX_ENCRYPTED_BYTES) throw new Error("Arquivo Warleine excede o limite do worker.");
  const decrypted = decryptWarleineFile(encrypted);
  if (decrypted.length > MAX_FILE_BYTES) throw new Error("Arquivo Warleine excede o limite do worker.");
  await writeFile(localPath, decrypted, { mode: 0o600, flag: "wx" });
  assertDeadline(deadlineAtMs);
}

async function executeClaimedJob(job: WarleineJobRow, options: WarleineProcessOptions): Promise<WarleineJobResult> {
  const scope = { loteId: Number(job.id), estabelecimentoId: Number(job.estabelecimentoId) };
  const deadlineAtMs = Date.now() + JOB_TIMEOUT_MS;
  let localPath: string | null = null;
  try {
    await mkdir(WORK_DIR, { recursive: true, mode: 0o700 });
    const ext = [".xlsx", ".csv", ".zip"].includes(extname(job.arquivoNome || "").toLowerCase()) ? extname(job.arquivoNome).toLowerCase() : ".xlsx";
    localPath = join(WORK_DIR, `${job.id}-${nanoid()}${ext}`);
    await downloadJobFile(job.arquivoStorageKey, localPath, scope, deadlineAtMs, options);
    const imported = await importWarleineFaturamentoFile({
      filePath: localPath,
      fileName: job.arquivoNome,
      loteId: scope.loteId,
      estabelecimentoId: scope.estabelecimentoId,
      userId: Number(job.criadoPor),
      configId: job.configId ? Number(job.configId) : null,
      publish: true,
      replaceCompetencies: true,
      claimToken: job.claimToken,
      deadlineAtMs,
      onProgress: (progress) => {
        if (progress.processedRows > 0 && progress.processedRows % 100_000 === 0) {
          const phase = ["hash", "staging", "publishing", "completed"].includes(progress.phase) ? progress.phase : "unknown";
          console.log(`[Warleine Worker] lote=${scope.loteId} fase=${phase} linhas=${Number(progress.processedRows)}`);
        }
      },
    });
    if (Number(imported.loteId) !== scope.loteId) throw new Error("Resultado Warleine fora do escopo solicitado.");
    // Neither phase=completed nor a count of rows proves a committed publication.
    const status = await getWarleineImportJobStatus(scope);
    const published = imported.status === "publicado" && status === "publicado";
    return { ...scope, outcome: published ? "published" : "not_published", durableStatus: status, published };
  } catch {
    // Never persist/log driver errors, SQL, paths or source/clinical contents.
    try {
      const pool = await getRawPool();
      await pool?.execute(`
        UPDATE warleine_faturamento_lotes
        SET status='erro', erroResumo=?, claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL, atualizadoEm=NOW()
        WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()
      `, ["WARLEINE_JOB_FAILED", scope.loteId, scope.estabelecimentoId, job.claimToken]);
    } catch {
      // Failure reporting must not mask the structured result or disclose the original error.
    }
    console.error(`[Warleine Worker] lote=${scope.loteId} estabelecimento=${scope.estabelecimentoId} codigo=WARLEINE_JOB_FAILED`);
    return statusResult(scope, "error", "WARLEINE_JOB_FAILED");
  } finally {
    if (localPath) await unlink(localPath).catch(() => undefined);
  }
}

/** Process only the reserved lot/hospital supplied by the immediate caller. Never drains the queue. */
export async function processWarleineImportJob(scope: WarleineJobScope, options: WarleineProcessOptions = {}): Promise<WarleineJobResult> {
  assertScope(scope);
  if (running) return statusResult(scope, "busy");
  running = true;
  try {
    const job = await claimWarleineJobByScope(scope);
    if (!job) {
      const result = await statusResult(scope, "not_claimed");
      if (result.durableStatus === "publicado") return { ...result, outcome: "published", published: true };
      return result;
    }
    return await executeClaimedJob(job, options);
  } catch {
    console.error(`[Warleine Worker] lote=${scope.loteId} estabelecimento=${scope.estabelecimentoId} codigo=WARLEINE_JOB_FAILED`);
    return statusResult(scope, "error", "WARLEINE_JOB_FAILED");
  } finally {
    running = false;
  }
}

/** Explicitly global background queue consumer; not an immediate operational command. */
export async function processNextGlobalWarleineImportJob(): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    const job = await claimNextWarleineJob();
    if (!job) return false;
    return (await executeClaimedJob(job, {})).published;
  } catch {
    console.error("[Warleine Worker] codigo=WARLEINE_JOB_FAILED");
    return false;
  } finally {
    running = false;
  }
}

/** Compatibility: supplying a scope always delegates to the specific job and returns its durable result. */
export function processNextWarleineImportJob(scope: WarleineJobScope, options?: WarleineProcessOptions): Promise<WarleineJobResult>;
/** @deprecated Without arguments this retains global background semantics; use the explicitly named global consumer. */
export function processNextWarleineImportJob(): Promise<boolean>;
export async function processNextWarleineImportJob(scope?: WarleineJobScope, options: WarleineProcessOptions = {}): Promise<WarleineJobResult | boolean> {
  if (scope !== undefined) return processWarleineImportJob(scope, options);
  return processNextGlobalWarleineImportJob();
}

async function drainAvailableJobs(): Promise<void> {
  for (let processed = 0; processed < 3; processed += 1) {
    if (!(await processNextGlobalWarleineImportJob())) break;
  }
}

export function initializeWarleineImportWorker(): void {
  if (initialized) return;
  initialized = true;
  void drainAvailableJobs();
  timer = setInterval(() => void drainAvailableJobs(), POLL_MS);
  timer.unref?.();
}

export function stopWarleineImportWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  initialized = false;
}
