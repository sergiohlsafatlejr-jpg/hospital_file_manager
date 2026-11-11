import {
  CONTRATOS_UPLOAD_CHUNK_BYTES, CONTRATOS_UPLOAD_MAX_FILE_BYTES,
  CONTRATOS_UPLOAD_MAX_BATCH_BYTES, CONTRATOS_UPLOAD_MAX_BATCH_FILES,
  CONTRATOS_UPLOAD_BASE_PATH, type ContratosUploadInicio,
  type ContratosUploadInicioResposta, type ContratosUploadStatus,
} from "../../../shared/contratosUploadProtocol";

// This client only talks to actor-authorized application routes, never storage URLs.
export const CONTRATOS_PDF_MAX_FILE_BYTES = CONTRATOS_UPLOAD_MAX_FILE_BYTES;
export const CONTRATOS_PDF_MAX_BATCH_BYTES = CONTRATOS_UPLOAD_MAX_BATCH_BYTES;
export const CONTRATOS_PDF_MAX_FILES = CONTRATOS_UPLOAD_MAX_BATCH_FILES;
export const CONTRATOS_PDF_CHUNK_BYTES = CONTRATOS_UPLOAD_CHUNK_BYTES;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const BASE = CONTRATOS_UPLOAD_BASE_PATH;
const STORAGE_PREFIX = "contratos-upload:v1:";
const SESSION_ID = /^(?=.{1,160}$)[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/;

export type PdfMetadata = Pick<File, "name" | "size" | "type" | "lastModified">;
export type PdfUploadFile = Blob & Pick<File, "name" | "lastModified">;
export type UploadProgress = {
  phase: "hashing" | "uploading" | "received" | "processing" | "done";
  hashedBytes: number;
  receivedBytes: number;
  totalBytes: number;
};
export type UploadDocument = {
  nomeArquivo: string;
  status: string;
  reutilizado?: boolean;
  erro?: string;
};
export type UploadResult = { processados: number; documentos: UploadDocument[] };
export type UploadSessionStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;
export type UploadOptions = {
  contratoId: number;
  batchId?: string;
  batchTotalBytes?: number;
  signal: AbortSignal;
  storage?: UploadSessionStorage;
  transport?: typeof fetch;
  onProgress?: (progress: UploadProgress) => void;
};

type SessionMetadata = { sessionId: string | null; fingerprint: string; contratoId: number };
type SessionInfo = ContratosUploadInicioResposta;
type SessionStatus = ContratosUploadStatus & { chunkSize?: number };

export function validarLoteContratosPdf(files: readonly PdfMetadata[]): number {
  if (!files.length || files.length > CONTRATOS_PDF_MAX_FILES) {
    throw new Error("Selecione de 1 a 30 PDFs por lote.");
  }
  let total = 0;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type.toLowerCase() !== "application/pdf") {
      throw new Error("Envie apenas arquivos PDF.");
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > CONTRATOS_PDF_MAX_FILE_BYTES) {
      throw new Error("O limite por PDF é de 150 MiB; arquivos vazios não são aceitos.");
    }
    total += file.size;
  }
  if (total > CONTRATOS_PDF_MAX_BATCH_BYTES) throw new Error("O limite total do lote é de 600 MiB.");
  return total;
}

export function chaveArquivoContrato(file: PdfMetadata): string {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}

export function adicionarPdfsAoLote<T extends PdfMetadata>(current: readonly T[], candidates: readonly T[]) {
  const files = [...current];
  const keys = new Set(files.map(chaveArquivoContrato));
  const rejected: string[] = [];
  for (const file of candidates) {
    const key = chaveArquivoContrato(file);
    if (keys.has(key)) continue;
    try {
      validarLoteContratosPdf([...files, file]);
      files.push(file);
      keys.add(key);
    } catch (error) {
      rejected.push(error instanceof Error ? error.message : "PDF inválido.");
    }
  }
  return { files, rejected: [...new Set(rejected)] };
}

// No direct SHA library is declared in this project. Keep the incremental state
// bounded to one 64-byte block; input is read in slices, not File.arrayBuffer().
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
class IncrementalSha256 {
  private state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private block = new Uint8Array(64);
  private words = new Uint32Array(64);
  private used = 0;
  private byteLength = 0;

  update(bytes: Uint8Array) {
    this.byteLength += bytes.length;
    let offset = 0;
    if (this.used) {
      const count = Math.min(64 - this.used, bytes.length);
      this.block.set(bytes.subarray(0, count), this.used);
      this.used += count;
      offset = count;
      if (this.used === 64) { this.compress(this.block, 0); this.used = 0; }
    }
    while (offset + 64 <= bytes.length) { this.compress(bytes, offset); offset += 64; }
    if (offset < bytes.length) {
      this.block.set(bytes.subarray(offset), 0);
      this.used = bytes.length - offset;
    }
  }

  private compress(bytes: Uint8Array, offset: number) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[i - 16]
        + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10)) + w[i - 7];
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) >>> 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const working = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) this.state[i] += working[i];
  }

  hex(): string {
    const length = this.byteLength;
    this.block[this.used++] = 0x80;
    if (this.used > 56) {
      this.block.fill(0, this.used);
      this.compress(this.block, 0);
      this.used = 0;
    }
    this.block.fill(0, this.used, 56);
    const view = new DataView(this.block.buffer);
    view.setUint32(56, Math.floor(length / 0x20000000), false);
    view.setUint32(60, (length * 8) >>> 0, false);
    this.compress(this.block, 0);
    return Array.from(this.state, word => word.toString(16).padStart(8, "0")).join("");
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Envio pausado; a sessão remota foi preservada.", "AbortError");
}

export async function sha256ContratoBlob(blob: Blob, signal?: AbortSignal, onBytes?: (bytes: number) => void): Promise<string> {
  const hash = new IncrementalSha256();
  for (let offset = 0; offset < blob.size; offset += CONTRATOS_PDF_CHUNK_BYTES) {
    assertNotAborted(signal);
    const slice = blob.slice(offset, Math.min(offset + CONTRATOS_PDF_CHUNK_BYTES, blob.size));
    const bytes = new Uint8Array(await slice.arrayBuffer());
    assertNotAborted(signal);
    hash.update(bytes);
    onBytes?.(Math.min(offset + bytes.length, blob.size));
  }
  assertNotAborted(signal);
  return hash.hex();
}

export function batchIdContratosPdf(contratoId: number, files: readonly PdfMetadata[]): string {
  const hash = new IncrementalSha256();
  hash.update(new TextEncoder().encode(JSON.stringify([contratoId, files.map(chaveArquivoContrato).sort()])));
  return hash.hex();
}

export function exigirIdNovoContrato(result: unknown): number {
  const id = isRecord(result) ? result.id : undefined;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("A criação não retornou o ID exato do novo contrato. Selecione o contrato existente; nenhum PDF foi enviado.");
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
class HttpUploadError extends Error {
  constructor(readonly status: number) { super(`Não foi possível concluir o envio (HTTP ${status}).`); }
}
function retryable(error: unknown) {
  return !(error instanceof HttpUploadError) || error.status === 408 || error.status === 409 || error.status === 425 || error.status === 429 || error.status >= 500;
}
function parseInfo(value: unknown): SessionInfo {
  if (!isRecord(value) || typeof value.sessionId !== "string" || !SESSION_ID.test(value.sessionId)
    || !positiveInteger(value.chunkSize) || value.chunkSize > MAX_CHUNK_BYTES
    || !positiveInteger(value.maxFileBytes) || !positiveInteger(value.maxBatchBytes)) {
    throw new Error("Parâmetros da sessão de upload inválidos ou blocos acima de 8 MiB.");
  }
  return { sessionId: value.sessionId, chunkSize: value.chunkSize, maxFileBytes: value.maxFileBytes, maxBatchBytes: value.maxBatchBytes };
}
function parseStatus(value: unknown): SessionStatus {
  if (!isRecord(value) || !Array.isArray(value.uploadedIndices) || !positiveInteger(value.totalChunks)
    || typeof value.state !== "string" || !["recebendo", "finalizando", "concluido", "erro", "expirado", "interrompido"].includes(value.state)
    || !value.uploadedIndices.every(i => typeof i === "number" && Number.isSafeInteger(i) && i >= 0 && i < Number(value.totalChunks))
    || new Set(value.uploadedIndices).size !== value.uploadedIndices.length
    || (value.recoveryRequired !== undefined && typeof value.recoveryRequired !== "boolean")
    || (value.chunkSize !== undefined && (!positiveInteger(value.chunkSize) || value.chunkSize > MAX_CHUNK_BYTES))) {
    throw new Error("Status de upload inválido; a retomada foi interrompida por segurança.");
  }
  return { uploadedIndices: value.uploadedIndices, totalChunks: value.totalChunks, state: value.state as ContratosUploadStatus["state"], chunkSize: value.chunkSize, recoveryRequired: value.recoveryRequired };
}
function parseResult(value: unknown): UploadResult {
  if (!isRecord(value) || typeof value.processados !== "number" || !Number.isSafeInteger(value.processados) || value.processados < 0 || !Array.isArray(value.documentos)) {
    throw new Error("Resultado da finalização inválido. A sessão foi preservada para conferência.");
  }
  const documentos = value.documentos.map((item: unknown) => {
    if (!isRecord(item) || typeof item.nomeArquivo !== "string" || typeof item.status !== "string") {
      throw new Error("Resultado do documento inválido.");
    }
    // Deliberately do not propagate keys, signed URLs, or any other storage fields.
    return { nomeArquivo: item.nomeArquivo, status: item.status, reutilizado: item.reutilizado === true, erro: typeof item.erro === "string" ? item.erro : undefined };
  });
  return { processados: value.processados, documentos };
}

export async function uploadContratoPdf(file: PdfUploadFile, options: UploadOptions): Promise<UploadResult> {
  validarLoteContratosPdf([file]);
  if (!positiveInteger(options.contratoId)) throw new Error("Contrato de destino inválido.");
  const batchBytes = options.batchTotalBytes ?? file.size;
  if (!positiveInteger(batchBytes) || batchBytes < file.size || batchBytes > CONTRATOS_PDF_MAX_BATCH_BYTES) throw new Error("Tamanho total do lote inválido (máximo 600 MiB).");
  const batchId = options.batchId ?? batchIdContratosPdf(options.contratoId, [file]);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId)) throw new Error("Identificador de lote inválido.");
  const { signal, onProgress } = options;
  const transport = options.transport ?? fetch;
  let hashedBytes = 0, receivedBytes = 0;
  const report = (phase: UploadProgress["phase"]) => {
    assertNotAborted(signal);
    onProgress?.({ phase, hashedBytes, receivedBytes, totalBytes: file.size });
  };
  report("hashing");
  const sha256 = await sha256ContratoBlob(file, signal, bytes => { hashedBytes = bytes; report("hashing"); });
  const fingerprint = JSON.stringify([file.name, file.size, file.lastModified, sha256]);
  const storageKey = `${STORAGE_PREFIX}${options.contratoId}:${batchIdContratosPdf(options.contratoId, [file])}`;
  let saved: SessionMetadata | undefined;
  if (options.storage) {
    const raw = options.storage.getItem(storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.fingerprint !== fingerprint || parsed.contratoId !== options.contratoId
        || (parsed.sessionId !== null && (typeof parsed.sessionId !== "string" || !SESSION_ID.test(parsed.sessionId)))) {
        throw new Error("Metadados da sessão não correspondem ao arquivo/contrato. Nenhum bloco foi enviado.");
      }
      saved = { sessionId: parsed.sessionId, fingerprint, contratoId: options.contratoId };
    }
  }
  const save = (sessionId: string | null) => {
    options.storage?.setItem(storageKey, JSON.stringify({ sessionId, fingerprint, contratoId: options.contratoId } satisfies SessionMetadata));
  };
  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    assertNotAborted(signal);
    const response = await transport(path, { ...init, credentials: "same-origin", signal });
    assertNotAborted(signal);
    if (!response.ok) throw new HttpUploadError(response.status);
    return response.status === 204 ? undefined : response.json();
  };
  const jsonPost = (body?: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let sessionId!: string;
  let chunkSize!: number;
  const statusFor = async (id: string): Promise<SessionStatus> => {
    for (let attempt = 0; ; attempt++) {
      try { return parseStatus(await request(`${BASE}/${encodeURIComponent(id)}`)); }
      catch (error) {
        assertNotAborted(signal);
        if (!retryable(error) || attempt >= 2) throw error;
      }
    }
  };
  let status!: SessionStatus;
  if (saved) {
    if (!saved.sessionId) throw new Error("Resposta da criação da sessão incerta. Não criaremos outra sessão às cegas; confira a sessão com o suporte.");
    sessionId = saved.sessionId;
    try {
    status = await statusFor(sessionId);
    } catch (error) {
      if (error instanceof HttpUploadError && [404, 409, 410, 412].includes(error.status)) {
        saved = undefined;
      } else {
        throw error;
      }
    }
    // GET must echo the negotiated chunkSize to resume non-default chunk sizes.
    if (saved && (status.recoveryRequired || ["erro", "expirado", "interrompido"].includes(status.state))) {
      saved = undefined;
    } else if (saved) {
      chunkSize = status.chunkSize ?? CONTRATOS_PDF_CHUNK_BYTES;
    }
  }
  if (!saved) {
    // Persist the uncertain-create guard BEFORE POST; a lost response is not safe to replay.
    save(null);
    const info = parseInfo(await request(BASE, jsonPost({
      contratoId: options.contratoId, filename: file.name, byteLength: file.size, sha256,
      batchId, batchTotalBytes: batchBytes,
    } satisfies ContratosUploadInicio)));
    sessionId = info.sessionId;
    save(sessionId);
    if (file.size > info.maxFileBytes || batchBytes > info.maxBatchBytes) throw new Error("Arquivo/lote excede os limites negociados pelo servidor.");
    chunkSize = info.chunkSize;
    status = await statusFor(sessionId);
  }
  const totalChunks = Math.ceil(file.size / chunkSize);
  const verifyStatus = (next: SessionStatus) => {
    if (next.totalChunks !== totalChunks || (next.chunkSize !== undefined && next.chunkSize !== chunkSize)) {
      throw new Error("A geometria dos blocos diverge da sessão; nenhum bloco será reenviado.");
    }
    if (next.recoveryRequired || ["erro", "expirado", "interrompido"].includes(next.state)) {
      options.storage?.removeItem?.(storageKey);
      throw new Error("A sessão exige recuperação controlada; não será retomada automaticamente.");
    }
    if (next.state !== "recebendo" && next.uploadedIndices.length !== totalChunks) throw new Error("Estado da sessão diverge dos blocos recebidos.");
    return next;
  };
  status = verifyStatus(status);
  const updateReceived = () => {
    receivedBytes = status.uploadedIndices.reduce((total, index) => total + Math.min(chunkSize, file.size - index * chunkSize), 0);
    report(receivedBytes === file.size ? "received" : "uploading");
  };
  updateReceived();
  for (let index = 0; index < totalChunks; index++) {
    assertNotAborted(signal);
    if (status.uploadedIndices.includes(index)) continue;
    const chunk = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
    const chunkSha256 = await sha256ContratoBlob(chunk, signal);
    for (let attempt = 0; ; attempt++) {
      try {
        await request(`${BASE}/${encodeURIComponent(sessionId)}/blocos/${index}`, {
          method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Chunk-SHA256": chunkSha256 }, body: chunk,
        });
        status = { ...status, uploadedIndices: [...status.uploadedIndices, index] };
        break;
      } catch (error) {
        assertNotAborted(signal);
        if (!retryable(error)) throw error;
        // A PUT may have arrived despite a lost response. Verify before resending.
        status = verifyStatus(await statusFor(sessionId));
        if (status.uploadedIndices.includes(index)) break;
        if (attempt >= 2) throw error;
      }
    }
    updateReceived();
  }
  status = verifyStatus(await statusFor(sessionId));
  updateReceived();
  if (status.uploadedIndices.length !== totalChunks) throw new Error("O servidor ainda não confirmou todos os blocos. Tente retomar o envio.");
  report("processing");
  for (let attempt = 0; ; attempt++) {
    if (status.state === "finalizando") throw new Error("O PDF foi recebido e a leitura ainda está em andamento. Retome/verifique a mesma sessão mais tarde; não iniciaremos outra finalização.");
    try {
      const result = parseResult(await request(`${BASE}/${encodeURIComponent(sessionId)}/finalizar`, jsonPost()));
      report("done");
      return result;
    } catch (error) {
      assertNotAborted(signal);
      if (!retryable(error)) throw error;
      // Finalization is idempotent; always observe its current state before replay.
      status = verifyStatus(await statusFor(sessionId));
      if (status.uploadedIndices.length !== totalChunks || attempt >= 2) throw error;
    }
  }
}
