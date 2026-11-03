import { createHash, randomBytes } from "node:crypto";
import { createReadStream, openAsBlob, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { and, eq, like, sql } from "drizzle-orm";
import type { Request, Response, Router } from "express";
import {
  CONTRATOS_UPLOAD_BASE_PATH, CONTRATOS_UPLOAD_CHUNK_BYTES,
  CONTRATOS_UPLOAD_MAX_FILE_BYTES, CONTRATOS_UPLOAD_MAX_BATCH_BYTES,
  CONTRATOS_UPLOAD_MAX_BATCH_FILES, CONTRATOS_UPLOAD_TTL_MS,
  CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS,
  type ContratosUploadInicio, type ContratosUploadInicioResposta,
  type ContratosUploadStatus, type ContratosUploadFinalizado,
} from "../shared/contratosUploadProtocol";
import type { ContratoConvenioPdfLeitura } from "./contratosConveniosPdfService";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const token = () => randomBytes(24).toString("hex");
const validHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positiveInt = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const safeFilename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);

export class ContratosUploadError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function fail(status: number, message: string): never { throw new ContratosUploadError(status, message); }
// Somente orçamento local de memória: a identidade/claim continua no CAS durável.
// /tmp também conta no limite do container; não montar PDFs distintos em paralelo.
let finalizacaoEmCurso = false;
async function comOrcamentoFinalizacao<T>(run: () => Promise<T>): Promise<T> {
  if (finalizacaoEmCurso) fail(429, "Outra finalização está em curso; retome/verifique esta sessão em instantes.");
  finalizacaoEmCurso = true;
  try { return await run(); } finally { finalizacaoEmCurso = false; }
}
export interface ContratosUploadActor { id: number; }
export interface ContratosUploadRecord {
  id: number; contratoId: number; estabelecimentoId: number; criadoPor: number;
  nomeArquivo: string; tamanhoBytes: number; sha256: string; storageKey: string;
  status: "processando" | "concluido" | "ocr_necessario" | "erro";
  paginas: number | null; pontosImportantes: unknown;
}
interface Part { index: number; byteLength: number; sha256: string; key: string; }
export interface ContratosUploadManifest {
  version: 1; sessionToken: string; actorId: number; estabelecimentoId: number;
  contratoId: number; filename: string; byteLength: number; sha256: string;
  batchHash: string; batchTotalBytes: number; createdAt: number; expiresAt: number;
  state: "recebendo" | "finalizando" | "erro" | "expirado" | "interrompido";
  finalizeStartedAt?: number; parts: Part[];
}
export interface ContratosUploadRepository {
  /** MUST lock the contract row in a transaction; check scope, duplicate hash,
   * batch byte/count quota and batchTotalBytes binding before inserting 0141.
   * The cloud manifest is already durable. No bytes in DB. */
  reserve(manifest: ContratosUploadManifest, manifestKey: string): Promise<ContratosUploadRecord>;
  get(id: number): Promise<ContratosUploadRecord | undefined>;
  /** Atomic distributed claim: WHERE id, actor, hospital, contract, hash,
   * expected storageKey AND processando (or erro for status transitions).
   * Do not replace this with a process-local mutex. */
  compareAndSwap(record: ContratosUploadRecord, key: string, status?: "processando" | "erro", result?: ContratoConvenioPdfLeitura): Promise<boolean>;
}
export interface ContratosUploadStorage {
  /** Adapters must honor signal and settle only after owned I/O closes.
   * Generic promises/iterables ignoring cancellation cannot be made safe by
   * racing them; production get returns a destroyable Node Readable. */
  put(key: string, bytes: Uint8Array, mime: string, options?: { signal?: AbortSignal }): Promise<void>;
  get(key: string, options?: { signal?: AbortSignal }): Promise<AsyncIterable<Uint8Array>>;
  /** File-backed multipart body: never fs.readFile/Buffer.concat on full PDF. */
  putFile(key: string, filePath: string, options?: { signal?: AbortSignal }): Promise<void>;
}
export interface ContratosUploadDependencies {
  repository: ContratosUploadRepository;
  storage: ContratosUploadStorage;
  authorize(actor: ContratosUploadActor, contratoId: number): Promise<{ estabelecimentoId: number }>;
  /** Must reject missing durable storage/processor before reserving/claiming. */
  ready(byteLength: number): Promise<void>;
  processPdfFile(filePath: string, byteLength: number, signal?: AbortSignal): Promise<ContratoConvenioPdfLeitura>;
  now?: () => number;
  /** Tests may shorten, never extend the production request deadline. */
  finalizationTimeoutMs?: number;
}
const root = (m: ContratosUploadManifest) => `contratos-upload/${m.contratoId}/${m.actorId}/${m.batchHash}/b${m.batchTotalBytes}/${m.sessionToken}`;
const manifestKey = (m: ContratosUploadManifest) => `${root(m)}/manifest/${token()}.json`;
const totalChunks = (m: { byteLength: number }) => Math.ceil(m.byteLength / CONTRATOS_UPLOAD_CHUNK_BYTES);
const expectedLength = (m: { byteLength: number }, index: number) => Math.min(CONTRATOS_UPLOAD_CHUNK_BYTES, m.byteLength - index * CONTRATOS_UPLOAD_CHUNK_BYTES);

// Shorter than the platform's 180 s request limit. The durable 15 minute
// lease is recovery evidence, not an extension of the HTTP request budget.
export const CONTRATOS_UPLOAD_REQUEST_TIMEOUT_MS = 150_000;
const ERROR_PERSIST_TIMEOUT_MS = 5_000;
function cancellationBudget(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(new ContratosUploadError(410, "Prazo de finalização esgotado ou requisição interrompida."));
  const timer = setTimeout(abort, ms);
  timer.unref();
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  return { signal: controller.signal, abort, dispose() { clearTimeout(timer); parent?.removeEventListener("abort", abort); } };
}
async function boundedBytes(stream: AsyncIterable<Uint8Array>, max: number, signal?: AbortSignal): Promise<Buffer> {
  // One bounded allocation; no concatenation/copies proportional to the PDF.
  const buffer = Buffer.allocUnsafe(max);
  let size = 0;
  const readable = stream instanceof Readable ? stream : undefined;
  const closed = readable && !readable.closed ? new Promise<void>(resolve => readable.once("close", resolve)) : Promise.resolve();
  const ignoreError = () => undefined;
  readable?.on("error", ignoreError);
  const abort = () => readable?.destroy(new Error("Leitura de armazenamento cancelada."));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    for await (const bytes of stream) {
      signal?.throwIfAborted();
      if (!(bytes instanceof Uint8Array) || size + bytes.byteLength > max) fail(400, "Bloco maior que o limite permitido.");
      buffer.set(bytes, size); size += bytes.byteLength;
    }
    signal?.throwIfAborted();
    return buffer.subarray(0, size);
  } finally {
    signal?.removeEventListener("abort", abort);
    // No Promise.race: never release the slot while a Node stream is live.
    readable?.destroy();
    await closed;
    readable?.removeListener("error", ignoreError);
  }
}
function parseInicio(input: unknown): ContratosUploadInicio {
  if (!input || typeof input !== "object") fail(400, "Sessão inválida.");
  const value = input as Partial<ContratosUploadInicio>;
  if (!positiveInt(value.contratoId) || !positiveInt(value.byteLength) || value.byteLength > CONTRATOS_UPLOAD_MAX_FILE_BYTES || !validHash(value.sha256) || typeof value.filename !== "string" || !value.filename.trim() || value.filename.length > 255 || !/\.pdf$/i.test(value.filename)) fail(400, "Informe contrato, nome PDF, tamanho (até 150 MiB) e SHA-256 válidos.");
  if ((value.batchId === undefined) !== (value.batchTotalBytes === undefined)) fail(400, "Informe identificador e tamanho total do lote juntos.");
  if (value.batchId !== undefined && (typeof value.batchId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.batchId))) fail(400, "Identificador de lote inválido.");
  const batchBytes = value.batchTotalBytes ?? value.byteLength;
  if (!positiveInt(batchBytes) || batchBytes < value.byteLength || batchBytes > CONTRATOS_UPLOAD_MAX_BATCH_BYTES) fail(400, "O lote deve ter no máximo 600 MiB.");
  return { contratoId: value.contratoId, filename: safeFilename(value.filename), byteLength: value.byteLength, sha256: value.sha256, batchId: value.batchId, batchTotalBytes: batchBytes };
}
function sessionParts(id: string): { documentId: number; sessionToken: string } {
  const match = /^([1-9][0-9]*)\.([a-f0-9]{48})$/.exec(id);
  if (!match || !positiveInt(Number(match[1]))) fail(404, "Sessão não encontrada.");
  return { documentId: Number(match[1]), sessionToken: match[2] };
}
function completeResult(record: ContratosUploadRecord): ContratosUploadFinalizado {
  if (record.status !== "concluido" && record.status !== "ocr_necessario") fail(409, "Documento ainda não foi processado.");
  return { success: true, contratoId: record.contratoId, total: 1, processados: 1, documentos: [{ id: record.id, nomeArquivo: record.nomeArquivo, status: record.status, paginas: record.paginas ?? 0, pontosImportantes: Array.isArray(record.pontosImportantes) ? record.pontosImportantes : [], reutilizado: true }] };
}

export function createContratosUploadHandlers(deps: ContratosUploadDependencies) {
  const now = deps.now ?? Date.now;
  const persist = async (manifest: ContratosUploadManifest, signal?: AbortSignal) => {
    const key = manifestKey(manifest);
    signal?.throwIfAborted();
    await deps.storage.put(key, Buffer.from(JSON.stringify(manifest)), "application/json", { signal });
    signal?.throwIfAborted();
    return key;
  };
  const load = async (actor: ContratosUploadActor, sessionId: string, signal?: AbortSignal) => {
    const parsed = sessionParts(sessionId);
    const record = await deps.repository.get(parsed.documentId);
    if (!record || record.criadoPor !== actor.id) fail(404, "Sessão não encontrada.");
    const scope = await deps.authorize(actor, record.contratoId);
    if (scope.estabelecimentoId !== record.estabelecimentoId) fail(403, "A unidade do contrato foi alterada.");
    // The token must remain bound even after the final PDF replaces the pointer.
    if (!record.storageKey.includes(`/${parsed.sessionToken}/`)) fail(404, "Sessão não encontrada.");
    if (record.status === "concluido" || record.status === "ocr_necessario") return { record, manifest: undefined };
    let manifest: ContratosUploadManifest;
    try {
      signal?.throwIfAborted();
      manifest = JSON.parse((await boundedBytes(await deps.storage.get(record.storageKey, { signal }), 64 * 1024, signal)).toString("utf8"));
    } catch { signal?.throwIfAborted(); fail(412, "Manifesto durável indisponível ou inválido."); }
    if (manifest.version !== 1 || manifest.sessionToken !== parsed.sessionToken || manifest.actorId !== actor.id || manifest.contratoId !== record.contratoId || manifest.estabelecimentoId !== scope.estabelecimentoId || manifest.byteLength !== record.tamanhoBytes || manifest.sha256 !== record.sha256 || manifest.filename !== record.nomeArquivo || !validHash(manifest.sha256) || !validHash(manifest.batchHash) || !positiveInt(manifest.byteLength) || manifest.byteLength > CONTRATOS_UPLOAD_MAX_FILE_BYTES || !positiveInt(manifest.batchTotalBytes) || manifest.batchTotalBytes > CONTRATOS_UPLOAD_MAX_BATCH_BYTES || manifest.batchTotalBytes < manifest.byteLength || !Number.isSafeInteger(manifest.expiresAt) || !Number.isSafeInteger(manifest.createdAt) || manifest.expiresAt !== manifest.createdAt + CONTRATOS_UPLOAD_TTL_MS || !["recebendo", "finalizando", "erro", "expirado", "interrompido"].includes(manifest.state) || !Array.isArray(manifest.parts) || manifest.parts.length > totalChunks(manifest)) fail(412, "Manifesto não corresponde à sessão.");
    const seen = new Set<number>();
    for (const part of manifest.parts) {
      if (!Number.isSafeInteger(part.index) || part.index < 0 || part.index >= totalChunks(manifest) || seen.has(part.index) || !validHash(part.sha256) || part.byteLength !== expectedLength(manifest, part.index) || typeof part.key !== "string" || !part.key.startsWith(`${root(manifest)}/parts/${part.index}/`)) fail(412, "Manifesto de blocos inválido.");
      seen.add(part.index);
    }
    if (record.storageKey.indexOf(`${root(manifest)}/manifest/`) !== 0) fail(412, "Referência do manifesto inválida.");
    return { record, manifest };
  };
  const transition = async (record: ContratosUploadRecord, manifest: ContratosUploadManifest, state: "expirado" | "interrompido") => {
    // TTL cleanup removes reachable part references; the built-in storage API
    // has no physical delete. Interrupted claims retain evidence for review.
    const key = await persist({ ...manifest, state, ...(state === "expirado" ? { parts: [] } : {}) });
    if (!await deps.repository.compareAndSwap(record, key, "erro")) fail(409, "A sessão mudou; consulte o status novamente.");
  };
  const mutable = (m: ContratosUploadManifest) => {
    if (now() >= m.expiresAt) fail(410, "Sessão expirada. Consulte o status; não haverá retomada automática.");
    if (m.state !== "recebendo") fail(409, "Sessão não aceita alterações; consulte o status.");
  };
  return {
    async iniciar(actor: ContratosUploadActor, body: unknown): Promise<ContratosUploadInicioResposta> {
      const input = parseInicio(body);
      const scope = await deps.authorize(actor, input.contratoId);
      await deps.ready(input.byteLength);
      const timestamp = now();
      const sessionToken = token();
      const manifest: ContratosUploadManifest = { version: 1, sessionToken, actorId: actor.id, estabelecimentoId: scope.estabelecimentoId, contratoId: input.contratoId, filename: input.filename, byteLength: input.byteLength, sha256: input.sha256, batchHash: digest(Buffer.from(input.batchId ?? sessionToken)), batchTotalBytes: input.batchTotalBytes ?? input.byteLength, createdAt: timestamp, expiresAt: timestamp + CONTRATOS_UPLOAD_TTL_MS, state: "recebendo", parts: [] };
      const key = await persist(manifest);
      const record = await deps.repository.reserve(manifest, key);
      return { sessionId: `${record.id}.${sessionToken}`, chunkSize: CONTRATOS_UPLOAD_CHUNK_BYTES, maxFileBytes: CONTRATOS_UPLOAD_MAX_FILE_BYTES, maxBatchBytes: CONTRATOS_UPLOAD_MAX_BATCH_BYTES };
    },
    async status(actor: ContratosUploadActor, sessionId: string): Promise<ContratosUploadStatus> {
      const { record, manifest } = await load(actor, sessionId);
      if (!manifest) return { uploadedIndices: Array.from({ length: totalChunks({ byteLength: record.tamanhoBytes }) }, (_, i) => i), totalChunks: totalChunks({ byteLength: record.tamanhoBytes }), state: "concluido" };
      let state = manifest.state;
      let parts = manifest.parts;
      if (state === "finalizando" && (!positiveInt(manifest.finalizeStartedAt) || now() - manifest.finalizeStartedAt >= CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS)) { await transition(record, manifest, "interrompido"); state = "interrompido"; }
      else if (state === "recebendo" && now() >= manifest.expiresAt) { await transition(record, manifest, "expirado"); state = "expirado"; parts = []; }
      return { uploadedIndices: parts.map(p => p.index).sort((a, b) => a - b), totalChunks: totalChunks(manifest), state, recoveryRequired: ["erro", "interrompido", "expirado"].includes(state) };
    },
    async bloco(actor: ContratosUploadActor, sessionId: string, index: number, stream: AsyncIterable<Uint8Array>, chunkSha256?: string) {
      const loaded = await load(actor, sessionId);
      if (!loaded.manifest) fail(409, "Sessão já finalizada.");
      mutable(loaded.manifest);
      if (!Number.isSafeInteger(index) || index < 0 || index >= totalChunks(loaded.manifest)) fail(400, "Índice de bloco inválido.");
      if (chunkSha256 !== undefined && !validHash(chunkSha256)) fail(400, "SHA-256 do bloco inválido.");
      const bytes = await boundedBytes(stream, expectedLength(loaded.manifest, index));
      if (bytes.length !== expectedLength(loaded.manifest, index)) fail(400, "Tamanho do bloco não corresponde ao manifesto.");
      const sha256 = digest(bytes);
      if (chunkSha256 !== undefined && sha256 !== chunkSha256) fail(422, "SHA-256 do bloco divergente.");
      const existing = loaded.manifest.parts.find(p => p.index === index);
      if (existing) {
        if (existing.sha256 !== sha256) fail(409, "Bloco duplicado com conteúdo divergente.");
        return { index, reutilizado: true };
      }
      const key = `${root(loaded.manifest)}/parts/${index}/${token()}`;
      await deps.storage.put(key, bytes, "application/octet-stream");
      // Re-read and CAS merges reordered/concurrent blocks without lost updates.
      for (let attempt = 0; attempt < 8; attempt++) {
        const { record, manifest } = await load(actor, sessionId);
        if (!manifest) fail(409, "Sessão já finalizada.");
        mutable(manifest);
        const duplicate = manifest.parts.find(p => p.index === index);
        if (duplicate) {
          if (duplicate.sha256 !== sha256) fail(409, "Bloco duplicado com conteúdo divergente.");
          return { index, reutilizado: true };
        }
        const next = { ...manifest, parts: [...manifest.parts, { index, byteLength: bytes.length, sha256, key }].sort((a, b) => a.index - b.index) };
        const pointer = await persist(next);
        if (await deps.repository.compareAndSwap(record, pointer)) return { index, reutilizado: false };
      }
      fail(409, "A sessão mudou durante o upload; reenvie este bloco.");
    },
    async finalizar(actor: ContratosUploadActor, sessionId: string, parentSignal?: AbortSignal): Promise<ContratosUploadFinalizado> {
      return comOrcamentoFinalizacao(async () => {
        const timeout = Math.min(CONTRATOS_UPLOAD_REQUEST_TIMEOUT_MS, CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS,
          positiveInt(deps.finalizationTimeoutMs) ? deps.finalizationTimeoutMs : CONTRATOS_UPLOAD_REQUEST_TIMEOUT_MS);
        const startedAt = now();
        const budget = cancellationBudget(timeout, parentSignal);
        let expiry: ReturnType<typeof setTimeout> | undefined;
        let claimed: ContratosUploadManifest | undefined;
        let claimRecord: ContratosUploadRecord | undefined;
        let tempDir: string | undefined;
        const check = () => {
          if (now() - startedAt >= timeout || (claimed && now() >= claimed.expiresAt)) budget.abort();
          budget.signal.throwIfAborted();
        };
        try {
          check();
          const { record, manifest } = await load(actor, sessionId, budget.signal);
          check();
          if (!manifest) return completeResult(record);
          mutable(manifest);
          // Expiry can shorten, never reset, the cumulative request budget.
          expiry = setTimeout(budget.abort, Math.max(0, manifest.expiresAt - now()));
          expiry.unref();
          if (manifest.parts.length !== totalChunks(manifest)) fail(409, "Upload incompleto; envie todos os blocos.");
          await deps.ready(manifest.byteLength);
          check();
          claimed = { ...manifest, state: "finalizando", finalizeStartedAt: startedAt };
          const claimKey = await persist(claimed, budget.signal);
          check();
          if (!await deps.repository.compareAndSwap(record, claimKey)) fail(409, "Finalização já iniciada ou sessão alterada.");
          claimRecord = { ...record, storageKey: claimKey };
          check();
          tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contratos-assemble-"));
          await fs.chmod(tempDir, 0o700);
          check();
          const filePath = path.join(tempDir, "contrato.pdf");
          const file = await fs.open(filePath, "wx", 0o600);
          const hash = createHash("sha256");
          let size = 0;
          try {
            for (const part of claimed.parts.slice().sort((a, b) => a.index - b.index)) {
              check();
              const bytes = await boundedBytes(await deps.storage.get(part.key, { signal: budget.signal }), part.byteLength, budget.signal);
              check();
              if (bytes.length !== part.byteLength || digest(bytes) !== part.sha256) fail(422, "Bloco persistido incompleto ou corrompido.");
              if (part.index === 0 && !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"))) fail(422, "Cabeçalho PDF inválido.");
              hash.update(bytes);
              let offset = 0;
              while (offset < bytes.length) {
                check();
                const write = await file.write(bytes, offset, bytes.length - offset, null);
                if (write.bytesWritten <= 0) fail(500, "Falha na montagem temporária.");
                offset += write.bytesWritten;
              }
              size += bytes.length;
            }
          } finally { await file.close(); }
          check();
          if (size !== manifest.byteLength || hash.digest("hex") !== manifest.sha256) fail(422, "Tamanho ou SHA-256 do PDF divergente.");
          const pdfKey = `${root(manifest)}/pdf/${token()}.pdf`;
          await deps.storage.putFile(pdfKey, filePath, { signal: budget.signal });
          check();
          // Processors must honor cancellation and settle only after their
          // children/streams close. We never race an uncancellable promise.
          const reading = await deps.processPdfFile(filePath, size, budget.signal);
          check();
          if (!["concluido", "ocr_necessario"].includes(reading.status)) fail(500, "Estado de processamento inválido.");
          const latestScope = await deps.authorize(actor, record.contratoId);
          check();
          if (latestScope.estabelecimentoId !== record.estabelecimentoId) fail(403, "A unidade do contrato foi alterada.");
          if (!await deps.repository.compareAndSwap(claimRecord, pdfKey, "processando", reading)) fail(409, "Finalização perdeu sua reserva; consulte o status.");
          const result = completeResult({ ...record, storageKey: pdfKey, status: reading.status, paginas: reading.paginas, pontosImportantes: reading.pontosImportantes });
          result.documentos[0].reutilizado = false;
          return result;
        } catch (error) {
          const aborted = budget.signal.aborted;
          budget.abort();
          if (claimed && claimRecord) {
            // Separate short cleanup budget; never reuse the aborted request
            // signal or retry publication as concluded. Failure leaves the
            // distributed claim fail-closed for a later status transition.
            const cleanup = cancellationBudget(ERROR_PERSIST_TIMEOUT_MS);
            try {
              const errorKey = await persist({ ...claimed, state: "erro" }, cleanup.signal);
              cleanup.signal.throwIfAborted();
              await deps.repository.compareAndSwap(claimRecord, errorKey, "erro");
            } catch { /* Keep the distributed claim fail-closed. */ }
            finally { cleanup.dispose(); }
          }
          if (aborted) throw budget.signal.reason;
          throw error;
        } finally {
          if (expiry) clearTimeout(expiry);
          budget.dispose();
          if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    },
  };
}

export interface ContratosUploadHttpDependencies extends ContratosUploadDependencies {
  authenticate(req: Request): Promise<ContratosUploadActor>;
}
/** Mount on the existing router, never starts an Express listener. */
export function registerContratosUploadRoutes(router: Router, deps: ContratosUploadHttpDependencies) {
  const handlers = createContratosUploadHandlers(deps);
  const route = (run: (actor: ContratosUploadActor, req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const actor = await deps.authenticate(req);
      if (!positiveInt(actor.id)) fail(403, "Acesso negado.");
      const result = await run(actor, req, res);
      if (!res.destroyed) res.status(200).json(result);
    } catch (error) {
      const known = error instanceof ContratosUploadError;
      if (!res.destroyed) res.status(known ? error.status : 500).json({ error: known ? error.message : "Não foi possível concluir o upload contratual." });
    }
  };
  router.post(CONTRATOS_UPLOAD_BASE_PATH, route((actor, req) => handlers.iniciar(actor, req.body)));
  router.get(`${CONTRATOS_UPLOAD_BASE_PATH}/:sessionId`, route((actor, req) => handlers.status(actor, req.params.sessionId)));
  // No raw/json parser here: auth/scope precede stream consumption and the
  // reader aborts above one block, including chunked bodies without length.
  router.put(`${CONTRATOS_UPLOAD_BASE_PATH}/:sessionId/blocos/:index`, route((actor, req) => {
    if (!/^\d+$/.test(req.params.index) || (req.header("content-type") ?? "").split(";")[0].toLowerCase() !== "application/octet-stream") fail(400, "Envie bloco binário com índice válido.");
    return handlers.bloco(actor, req.params.sessionId, Number(req.params.index), req, req.header("x-chunk-sha256"));
  }));
  router.post(`${CONTRATOS_UPLOAD_BASE_PATH}/:sessionId/finalizar`, route(async (actor, req, res) => {
    const client = new AbortController();
    const abort = () => client.abort();
    const close = () => { if (!res.writableEnded) abort(); };
    req.on("aborted", abort);
    res.on("close", close);
    if (req.aborted || (res.destroyed && !res.writableEnded)) abort();
    try { return await handlers.finalizar(actor, req.params.sessionId, client.signal); }
    finally { req.off("aborted", abort); res.off("close", close); }
  }));
}

/** Uses only the existing 0141 columns and unique contract/hash index. */
export function createContratosUploadRepository(getDatabase: () => Promise<Awaited<ReturnType<typeof import("./db").getDb>>>): ContratosUploadRepository {
  const table = async () => (await import("../drizzle/schema")).contratosConveniosDocumentos;
  const database = async () => { const db = await getDatabase(); if (!db) fail(412, "Banco indisponível para upload durável."); return db; };
  return {
    async get(id) {
      const db = await database(); const documents = await table();
      const [record] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      return record;
    },
    async reserve(manifest, key) {
      const db = await database();
      const { contratosConvenios: contracts, contratosConveniosDocumentos: documents } = await import("../drizzle/schema");
      return db.transaction(async tx => {
        // All reservations in a contract serialize their quota checks. No
        // select-then-insert race for batches, even across app replicas.
        const [contract] = await tx.select().from(contracts).where(eq(contracts.id, manifest.contratoId)).for("update");
        if (!contract || contract.estabelecimentoId !== manifest.estabelecimentoId) fail(403, "Contrato não pertence à unidade autorizada.");
        const [duplicate] = await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.contratoId, manifest.contratoId), eq(documents.sha256, manifest.sha256))).limit(1);
        if (duplicate) fail(409, "Este PDF já está reservado ou anexado ao contrato. Retome sua sessão original.");
        const prefix = `contratos-upload/${manifest.contratoId}/${manifest.actorId}/${manifest.batchHash}/`;
        const batch = await tx.select({ storageKey: documents.storageKey, tamanhoBytes: documents.tamanhoBytes }).from(documents).where(and(eq(documents.contratoId, manifest.contratoId), eq(documents.criadoPor, manifest.actorId), like(documents.storageKey, `${prefix}%`)));
        if (batch.some(row => !row.storageKey.startsWith(`${prefix}b${manifest.batchTotalBytes}/`))) fail(409, "Tamanho total do lote diverge da reserva original.");
        if (batch.length >= CONTRATOS_UPLOAD_MAX_BATCH_FILES || batch.reduce((sum, row) => sum + row.tamanhoBytes, manifest.byteLength) > manifest.batchTotalBytes || batch.reduce((sum, row) => sum + row.tamanhoBytes, manifest.byteLength) > CONTRATOS_UPLOAD_MAX_BATCH_BYTES) fail(413, "Cota de arquivos ou bytes do lote excedida.");
        const [inserted] = await tx.insert(documents).values({ contratoId: manifest.contratoId, estabelecimentoId: manifest.estabelecimentoId, nomeArquivo: manifest.filename, storageKey: key, tamanhoBytes: manifest.byteLength, sha256: manifest.sha256, status: "processando", mimeType: "application/pdf", criadoPor: manifest.actorId, pontosImportantes: [], textoExtraido: null, paginas: null }).$returningId();
        if (!inserted || !positiveInt(inserted.id)) fail(500, "Não foi possível confirmar a reserva do documento.");
        const [record] = await tx.select().from(documents).where(eq(documents.id, inserted.id)).limit(1);
        if (!record) fail(500, "Reserva do documento indisponível.");
        return record;
      });
    },
    async compareAndSwap(record, key, status = "processando", reading) {
      const db = await database(); const documents = await table();
      const result = await db.update(documents).set({ storageKey: key, status: reading?.status ?? status, ...(reading ? { paginas: reading.paginas, textoExtraido: reading.textoExtraido, pontosImportantes: reading.pontosImportantes, erroProcessamento: null } : status === "erro" ? { erroProcessamento: "Upload interrompido, expirado ou inválido; recuperação explícita necessária." } : {}) }).where(and(eq(documents.id, record.id), eq(documents.criadoPor, record.criadoPor), eq(documents.estabelecimentoId, record.estabelecimentoId), eq(documents.contratoId, record.contratoId), eq(documents.sha256, record.sha256), eq(documents.status, record.status), sql`BINARY ${documents.storageKey} = BINARY ${record.storageKey}`));
      const count: unknown = result[0];
      return typeof count === "object" && count !== null && "affectedRows" in count && count.affectedRows === 1;
    },
  };
}

/** Reuses built-in proxy contract for large uploads, but a file-backed Blob
 * avoids storagePut's full Buffer + Blob copy. No storage delete endpoint. */
export function createContratosUploadCloudStorage(options: {
  put: (key: string, bytes: Uint8Array, mime: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  get: (key: string, options?: { signal?: AbortSignal }) => Promise<{ url: string }>;
  configuration: () => { baseUrl: string; apiKey: string };
  transport?: typeof fetch;
}): ContratosUploadStorage {
  const transport = options.transport ?? fetch;
  const operationBudget = (signal?: AbortSignal) => signal ? { signal, dispose() {} } : cancellationBudget(CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS);
  return {
    async put(key, bytes, mime, optionsForCall) {
      const budget = operationBudget(optionsForCall?.signal);
      try {
        budget.signal.throwIfAborted();
        await options.put(key, bytes, mime, { signal: budget.signal });
        budget.signal.throwIfAborted();
      } finally { budget.dispose(); }
    },
    async get(key, optionsForCall) {
      const budget = operationBudget(optionsForCall?.signal);
      try {
        budget.signal.throwIfAborted();
        const reference = await options.get(key, { signal: budget.signal });
        budget.signal.throwIfAborted();
        const url = new URL(reference.url);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail(412, "Referência de armazenamento inválida.");
        const response = await transport(url, { signal: budget.signal });
        if (!response.ok || !response.body || budget.signal.aborted) {
          await response.body?.cancel().catch(() => undefined);
          budget.signal.throwIfAborted();
          fail(412, "Bloco ou manifesto indisponível no armazenamento durável.");
        }
        const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>, { signal: budget.signal });
        stream.once("close", budget.dispose);
        return stream;
      } catch (error) {
        budget.dispose();
        if (budget.signal.aborted) throw budget.signal.reason;
        if (error instanceof ContratosUploadError) throw error;
        fail(412, "Bloco ou manifesto indisponível no armazenamento durável.");
      }
    },
    async putFile(key, filePath, optionsForCall) {
      const budget = operationBudget(optionsForCall?.signal);
      try {
        budget.signal.throwIfAborted();
        const config = options.configuration();
        if (!config.baseUrl || !config.apiKey) fail(412, "Armazenamento durável indisponível.");
        const size = (await fs.stat(filePath)).size;
        if (!positiveInt(size) || size > CONTRATOS_UPLOAD_MAX_FILE_BYTES) fail(413, "PDF excede o limite permitido.");
        const url = new URL("v1/storage/upload", `${config.baseUrl.replace(/\/+$/, "")}/`);
        url.searchParams.set("path", key);
        const form = new FormData();
        form.append("file", await openAsBlob(filePath, { type: "application/pdf" }), "contrato.pdf");
        budget.signal.throwIfAborted();
        const response = await transport(url, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: budget.signal });
        // No signed URL/body is needed; cancel rather than drain a dripping body.
        await response.body?.cancel().catch(() => undefined);
        budget.signal.throwIfAborted();
        if (!response.ok) fail(412, "Não foi possível persistir o PDF na nuvem.");
      } catch (error) {
        if (budget.signal.aborted) throw budget.signal.reason;
        if (error instanceof ContratosUploadError) throw error;
        fail(412, "Não foi possível persistir o PDF na nuvem.");
      } finally { budget.dispose(); }
    },
  };
}

type PdfFileService = Omit<typeof import("./contratosConveniosPdfService"), "lerContratoPdfArquivo"> & {
  lerContratoPdfArquivo?: (filePath: string, signal?: AbortSignal) => Promise<ContratoConvenioPdfLeitura>;
};
export async function assertContratosUploadReady(byteLength: number): Promise<void> {
  if (!process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY) fail(412, "Armazenamento durável de PDFs não configurado.");
  const service: PdfFileService = await import("./contratosConveniosPdfService");
  if (byteLength > CONTRATOS_UPLOAD_CHUNK_BYTES && !service.lerContratoPdfArquivo) fail(412, "Processamento PDF por arquivo ainda não está disponível para este tamanho.");
}
export async function processContratosUploadPdfFile(filePath: string, byteLength: number, signal?: AbortSignal): Promise<ContratoConvenioPdfLeitura> {
  signal?.throwIfAborted();
  const service: PdfFileService = await import("./contratosConveniosPdfService");
  signal?.throwIfAborted();
  if (service.lerContratoPdfArquivo) return service.lerContratoPdfArquivo(filePath, signal);
  // Compatibility for small PDFs only. Never allocate a 150 MiB Buffer.
  if (byteLength > CONTRATOS_UPLOAD_CHUNK_BYTES || (await fs.stat(filePath)).size !== byteLength) fail(412, "Processamento PDF por arquivo indisponível.");
  signal?.throwIfAborted();
  return service.lerContratoPdf(await fs.readFile(filePath, { signal }));
}
export async function sha256ContratosUploadFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filePath, { highWaterMark: CONTRATOS_UPLOAD_CHUNK_BYTES })) hash.update(bytes);
  return hash.digest("hex");
}
export function createContratosUploadProductionDependencies(): ContratosUploadHttpDependencies {
  const configuration = () => ({ baseUrl: process.env.BUILT_IN_FORGE_API_URL ?? "", apiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "" });
  const cloud = createContratosUploadCloudStorage({
    async put(key, bytes, mime, options) { const { storagePut } = await import("./storage"); return storagePut(key, bytes, mime, options?.signal); },
    async get(key, options) { const { storageGet } = await import("./storage"); return storageGet(key, options?.signal); },
    configuration,
  });
  return {
    repository: createContratosUploadRepository(async () => (await import("./db")).getDb()),
    storage: cloud,
    ready: assertContratosUploadReady,
    processPdfFile: processContratosUploadPdfFile,
    async authenticate(req) {
      const { sdk } = await import("./_core/sdk");
      let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
      try { user = await sdk.authenticateRequest(req); } catch { fail(401, "Não autenticado."); }
      if (user.isCron || !positiveInt(user.id)) fail(403, "Acesso negado.");
      return { id: user.id };
    },
    async authorize(actor, contratoId) {
      if (!positiveInt(actor.id)) fail(403, "Acesso negado.");
      const db = await import("./db");
      const database = await db.getDb();
      if (!database) fail(412, "Banco indisponível para upload durável.");
      const { contratosConvenios } = await import("../drizzle/schema");
      const [contract] = await database.select({ estabelecimentoId: contratosConvenios.estabelecimentoId }).from(contratosConvenios).where(eq(contratosConvenios.id, contratoId)).limit(1);
      if (!contract) fail(404, "Contrato não encontrado.");
      // Match existing contracts guard; actor ownership still applies to admin.
      const user = await db.getUserById(actor.id);
      if (!user || (user.role !== "admin" && !await db.verificarPermissaoEstabelecimento(actor.id, contract.estabelecimentoId, "gerenciar"))) fail(403, "Sem permissão para importar documentos nesta unidade.");
      return contract;
    },
  };
}
