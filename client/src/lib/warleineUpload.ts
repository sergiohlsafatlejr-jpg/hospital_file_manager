import {
  WARLEINE_UPLOAD_BASE_PATH,
  WARLEINE_UPLOAD_CHUNK_BYTES,
  WARLEINE_UPLOAD_MAX_FILE_BYTES,
} from "../../../shared/warleineUploadProtocol";

export interface WarleineAttempt {
  version: 1;
  idempotencyKey: string;
  sessionId?: string;
}
export interface WarleineUploadStatus {
  state: string;
  uploadedIndices: number[];
  totalChunks: number;
  byteLength: number;
  loteId?: number;
  jobStatus?: string;
}
export interface WarleineUploadReceipt {
  success: true;
  sessionId: string;
  estabelecimentoId: number;
  loteId: number;
  status: string;
}
export interface WarleineAttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const session = /^[1-9][0-9]*\.[a-f0-9]{48}$/;
const statuses = new Set(["enfileirado", "reservado", "processando", "validado", "publicado", "erro"]);
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
const keyFor = (userId: number, hospitalId: number) => {
  if (!positive(userId) || !positive(hospitalId)) throw new Error("Selecione uma unidade autorizada.");
  return `safatle:warleine-upload:v1:u${userId}:h${hospitalId}`;
};
function assertAttempt(value: unknown): asserts value is WarleineAttempt {
  if (!value || typeof value !== "object") throw new Error("Registro de tentativa inválido; verificação necessária.");
  const v = value as Partial<WarleineAttempt>;
  if (v.version !== 1 || typeof v.idempotencyKey !== "string" || !uuid.test(v.idempotencyKey)
    || (v.sessionId !== undefined && (typeof v.sessionId !== "string" || !session.test(v.sessionId)))
    || Object.keys(v).some(k => !["version", "idempotencyKey", "sessionId"].includes(k))) {
    throw new Error("Registro de tentativa inválido; verificação necessária.");
  }
}
export function readWarleineAttempt(storage: WarleineAttemptStorage, userId: number, hospitalId: number): WarleineAttempt | null {
  const text = storage.getItem(keyFor(userId, hospitalId));
  if (text === null) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Registro de tentativa inválido; verificação necessária."); }
  assertAttempt(value);
  return value;
}
export function persistWarleineAttempt(storage: WarleineAttemptStorage, userId: number, hospitalId: number, attempt: WarleineAttempt): void {
  assertAttempt(attempt);
  // Only identity/receipt metadata. Never file, filename, row, patient or hash.
  storage.setItem(keyFor(userId, hospitalId), JSON.stringify(attempt));
  const saved = readWarleineAttempt(storage, userId, hospitalId);
  if (saved?.idempotencyKey !== attempt.idempotencyKey || saved.sessionId !== attempt.sessionId) {
    throw new Error("Não foi possível preservar a tentativa. Nenhum novo envio foi iniciado.");
  }
}
export function clearWarleineAttempt(storage: WarleineAttemptStorage, userId: number, hospitalId: number): void {
  storage.removeItem(keyFor(userId, hospitalId));
}
export function statusWarleineMessage(status: string): string {
  if (status === "publicado") return "Lote publicado com sucesso.";
  if (status === "erro") return "O lote apresentou erro. A publicação não foi confirmada.";
  if (status === "validado") return "Lote validado; publicação ainda não confirmada.";
  if (status === "enfileirado") return "Arquivo durável recebido e enfileirado. A publicação ainda não ocorreu.";
  return "Lote em processamento; aguarde a confirmação de publicação.";
}
export function isWarleinePublished(status: unknown): boolean { return status === "publicado"; }
function httpError(status: number): Error {
  const message = status === 401 ? "Sua sessão expirou. Faça login para retomar a mesma tentativa."
    : status === 403 ? "Sem permissão para esta tentativa nesta unidade."
    : status === 409 ? "A tentativa mudou ou o arquivo diverge. Verifique o resultado antes de reenviar."
    : status === 410 ? "A sessão de upload expirou; verificação necessária."
    : status === 413 ? "O arquivo ou bloco excede o limite permitido."
    : status === 422 ? "O arquivo ou bloco não passou na verificação de integridade."
    : status === 412 ? "Armazenamento durável ou processamento indisponível. Nenhuma publicação foi confirmada."
    : "Não foi possível confirmar a operação. Retome/verifique esta mesma tentativa.";
  return new Error(message);
}
async function requestJson(transport: typeof fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  let response: Response;
  try { response = await transport(url, { ...init, signal }); }
  catch { signal.throwIfAborted(); throw new Error("Não foi possível confirmar a operação. Retome/verifique esta mesma tentativa."); }
  signal.throwIfAborted();
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw httpError(response.status);
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { signal.throwIfAborted(); throw new Error("Resposta de confirmação inválida. A mesma tentativa foi preservada."); }
  signal.throwIfAborted();
  return value;
}
export async function getWarleineUploadStatus(hospitalId: number, sessionId: string, signal: AbortSignal, transport: typeof fetch = fetch): Promise<WarleineUploadStatus> {
  if (!positive(hospitalId) || !session.test(sessionId)) throw new Error("Tentativa inválida.");
  const value = await requestJson(transport, `${WARLEINE_UPLOAD_BASE_PATH}/${sessionId}`, {
    headers: { "x-estabelecimento-id": String(hospitalId) },
  }, signal);
  if (!value || typeof value !== "object") throw new Error("Estado do upload não confirmado.");
  const v = value as Partial<WarleineUploadStatus>;
  if (!v.state || !["recebendo", "finalizando", "erro", "enfileirado", "expirado"].includes(v.state)
    || !positive(v.totalChunks) || !positive(v.byteLength) || v.byteLength > WARLEINE_UPLOAD_MAX_FILE_BYTES
    || !Array.isArray(v.uploadedIndices) || v.uploadedIndices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= Number(v.totalChunks))
    || (v.loteId !== undefined && !positive(v.loteId)) || (v.jobStatus !== undefined && !statuses.has(v.jobStatus))) {
    throw new Error("Estado do upload não confirmado.");
  }
  return v as WarleineUploadStatus;
}
function receiptFromStatus(hospitalId: number, sessionId: string, status: WarleineUploadStatus): WarleineUploadReceipt | null {
  if (status.state !== "enfileirado" || !positive(status.loteId) || !status.jobStatus || !statuses.has(status.jobStatus)) return null;
  return { success: true, sessionId, estabelecimentoId: hospitalId, loteId: status.loteId, status: status.jobStatus };
}
export async function uploadWarleineInParts(options: {
  file: File;
  userId: number;
  hospitalId: number;
  storage: WarleineAttemptStorage;
  signal: AbortSignal;
  onAttempt?: (attempt: WarleineAttempt) => void;
  onProgress?: (completedBytes: number, totalBytes: number) => void;
  transport?: typeof fetch;
  randomId?: () => string;
}): Promise<WarleineUploadReceipt> {
  const { file, userId, hospitalId, storage, signal } = options;
  if (!positive(file.size) || file.size > WARLEINE_UPLOAD_MAX_FILE_BYTES || !/\.(csv|zip|xlsx)$/i.test(file.name)) {
    throw new Error("Selecione CSV, ZIP ou XLSX válido de até 300 MiB.");
  }
  const transport = options.transport ?? fetch;
  let attempt = readWarleineAttempt(storage, userId, hospitalId);
  if (!attempt) {
    attempt = { version: 1, idempotencyKey: (options.randomId ?? (() => crypto.randomUUID()))() };
    // Persist before any network operation. A lost response/reload cannot create a second attempt.
    persistWarleineAttempt(storage, userId, hospitalId, attempt);
  }
  options.onAttempt?.(attempt);
  if (!attempt.sessionId) {
    const value = await requestJson(transport, WARLEINE_UPLOAD_BASE_PATH, {
      method: "POST", headers: { "content-type": "application/json", "x-estabelecimento-id": String(hospitalId) },
      body: JSON.stringify({ estabelecimentoId: hospitalId, filename: file.name, byteLength: file.size, idempotencyKey: attempt.idempotencyKey, confirmarSubstituicao: true }),
    }, signal);
    if (!value || typeof value !== "object" || !("sessionId" in value) || typeof value.sessionId !== "string" || !session.test(value.sessionId)
      || !("chunkSize" in value) || value.chunkSize !== WARLEINE_UPLOAD_CHUNK_BYTES) throw new Error("Reserva de upload não confirmada; retome a mesma tentativa.");
    attempt = { ...attempt, sessionId: value.sessionId };
    persistWarleineAttempt(storage, userId, hospitalId, attempt);
    options.onAttempt?.(attempt);
  }
  const sessionId = attempt.sessionId!;
  const status = await getWarleineUploadStatus(hospitalId, sessionId, signal, transport);
  const existingReceipt = receiptFromStatus(hospitalId, sessionId, status);
  if (existingReceipt) return existingReceipt;
  if (status.state !== "recebendo") throw new Error("A tentativa exige verificação do resultado antes de novo envio.");
  if (status.byteLength !== file.size || status.totalChunks !== Math.ceil(file.size / WARLEINE_UPLOAD_CHUNK_BYTES)) {
    throw new Error("Retome a tentativa com o mesmo arquivo original.");
  }
  for (let index = 0; index < status.totalChunks; index += 1) {
    signal.throwIfAborted();
    const start = index * WARLEINE_UPLOAD_CHUNK_BYTES;
    const part = file.slice(start, Math.min(file.size, start + WARLEINE_UPLOAD_CHUNK_BYTES));
    let digest: ArrayBuffer;
    try { digest = await crypto.subtle.digest("SHA-256", await part.arrayBuffer()); }
    catch { signal.throwIfAborted(); throw new Error("Não foi possível verificar o bloco local. A tentativa foi preservada."); }
    signal.throwIfAborted();
    const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
    // Resend already acknowledged parts too: the server's hash comparison also
    // validates the selected file after reload, without persisting PHI or hashes.
    await requestJson(transport, `${WARLEINE_UPLOAD_BASE_PATH}/${sessionId}/blocos/${index}`, {
      method: "PUT", headers: { "content-type": "application/octet-stream", "x-estabelecimento-id": String(hospitalId), "x-chunk-sha256": hash }, body: part,
    }, signal);
    options.onProgress?.(Math.min(file.size, start + part.size), file.size);
  }
  const value = await requestJson(transport, `${WARLEINE_UPLOAD_BASE_PATH}/${sessionId}/finalizar`, {
    method: "POST", headers: { "x-estabelecimento-id": String(hospitalId) },
  }, signal);
  if (!value || typeof value !== "object") throw new Error("Recebimento do lote não confirmado; consulte a mesma tentativa.");
  const v = value as Partial<WarleineUploadReceipt>;
  if (v.success !== true || v.sessionId !== sessionId || v.estabelecimentoId !== hospitalId || !positive(v.loteId) || !v.status || !statuses.has(v.status)) {
    throw new Error("Recebimento do lote não confirmado; consulte a mesma tentativa.");
  }
  return v as WarleineUploadReceipt;
}
