import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { nanoid } from "nanoid";
import type { RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import { storageGet } from "./storage";
import { importWarleineFaturamentoFile } from "./warleineFaturamentoImportService";
import { decryptWarleineFile } from "./warleineFileVault";

const WORK_DIR = "/tmp/portal-safatle-warleine-worker";
const POLL_MS = 30_000;
const LEASE_MINUTES = 20;
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let running = false;
let initialized = false;
let timer: NodeJS.Timeout | null = null;

type WarleineJobRow = RowDataPacket & {
  id: number;
  estabelecimentoId: number;
  configId: number | null;
  arquivoNome: string;
  arquivoStorageKey: string;
  criadoPor: number;
  claimToken: string;
};

export async function claimNextWarleineJob(): Promise<WarleineJobRow | null> {
  const pool = await getRawPool();
  if (!pool) return null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<WarleineJobRow[]>(`
      SELECT id,estabelecimentoId,configId,arquivoNome,arquivoStorageKey,criadoPor
      FROM warleine_faturamento_lotes
      WHERE arquivoStorageKey IS NOT NULL
        AND tentativas<3
        AND (
          status IN ('enfileirado','erro')
          OR (status IN ('reservado','processando','validado') AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW()))
        )
        AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW())
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `);
    const candidate = rows[0];
    if (!candidate) {
      await connection.commit();
      return null;
    }
    const claimToken = randomUUID();
    const [result] = await connection.execute<any>(`
      UPDATE warleine_faturamento_lotes
      SET status='reservado', tentativas=tentativas+1, claimToken=?, claimedBy=?,
          leaseExpiresAt=DATE_ADD(NOW(), INTERVAL ${LEASE_MINUTES} MINUTE), erroResumo=NULL, atualizadoEm=NOW()
      WHERE id=? AND (leaseExpiresAt IS NULL OR leaseExpiresAt<NOW())
    `, [claimToken, WORKER_ID, candidate.id]);
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

async function downloadJobFile(storageKey: string, localPath: string): Promise<void> {
  if (storageKey.startsWith("local:")) {
    const encryptedLocal = await readFile(storageKey.slice("local:".length));
    await writeFile(localPath, decryptWarleineFile(encryptedLocal));
    return;
  }
  const { url } = await storageGet(storageKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao recuperar arquivo durável (${response.status}).`);
  const encrypted = Buffer.from(await response.arrayBuffer());
  await writeFile(localPath, decryptWarleineFile(encrypted));
}

export async function processNextWarleineImportJob(): Promise<boolean> {
  if (running) return false;
  running = true;
  let localPath: string | null = null;
  let job: WarleineJobRow | null = null;
  try {
    job = await claimNextWarleineJob();
    if (!job) return false;
    await mkdir(WORK_DIR, { recursive: true, mode: 0o700 });
    const ext = [".xlsx", ".csv", ".zip"].includes(extname(job.arquivoNome || "").toLowerCase()) ? extname(job.arquivoNome).toLowerCase() : ".xlsx";
    localPath = join(WORK_DIR, `${job.id}-${nanoid()}${ext}`);
    await downloadJobFile(job.arquivoStorageKey, localPath);
    await importWarleineFaturamentoFile({
      filePath: localPath,
      fileName: job.arquivoNome,
      estabelecimentoId: Number(job.estabelecimentoId),
      userId: Number(job.criadoPor),
      configId: job.configId ? Number(job.configId) : null,
      publish: true,
      replaceCompetencies: true,
      claimToken: job.claimToken,
      onProgress: (progress) => {
        if (progress.processedRows > 0 && progress.processedRows % 100_000 === 0) {
          console.log(`[Warleine Worker] lote=${job?.id} fase=${progress.phase} linhas=${progress.processedRows}`);
        }
      },
    });
    return true;
  } catch (error) {
    if (job) {
      const pool = await getRawPool();
      await pool?.execute(`
        UPDATE warleine_faturamento_lotes
        SET status='erro', erroResumo=?, claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL, atualizadoEm=NOW()
        WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()
      `, [error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000), job.id, job.estabelecimentoId, job.claimToken]).catch(() => undefined);
    }
    console.error("[Warleine Worker] Falha ao processar lote:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    if (localPath) await unlink(localPath).catch(() => undefined);
    running = false;
  }
}

async function drainAvailableJobs(): Promise<void> {
  for (let processed = 0; processed < 3; processed += 1) {
    if (!(await processNextWarleineImportJob())) break;
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
