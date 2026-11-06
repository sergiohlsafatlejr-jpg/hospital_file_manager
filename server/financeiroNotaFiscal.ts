import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { bancoInterEncryptionKeyAvailable } from "./bancoInterVault";

export const NF_MAX_BYTES = 10 * 1024 * 1024;
export const NF_MAX_BASE64 = 4 * Math.ceil(NF_MAX_BYTES / 3);
export const NF_TIMEOUT_MS = 30_000;
const PURPOSE = "safatle.financeiro.nota-fiscal.v1";
const MAGIC = Buffer.from("SAFNF1\0", "ascii");
const OVERHEAD = MAGIC.length + 12 + 16;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const REF = new RegExp(`^fin-nf/v1/h([1-9][0-9]*)/e([1-9][0-9]*)/r([1-9][0-9]*)/(${UUID})/([a-f0-9]{64})\\.enc$`);
export type NotaFiscalScope = { estabelecimentoId: number; empresaId: number; recebivelId: number };
export type NotaFiscalIO = {
  put: (key: string, data: Buffer, mime: string, signal: AbortSignal) => Promise<{ key: string }>;
  get: (key: string, signal: AbortSignal) => Promise<{ url: string }>;
  fetch: typeof fetch;
  readLocal?: (fileName: string, signal: AbortSignal) => Promise<Buffer>;
};
function failure(message = "NF indisponível ou inválida. Anexe novamente um PDF válido antes da entrega."): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}
function validScope(scope: NotaFiscalScope) {
  if (Object.values(scope).some(v => !Number.isSafeInteger(v) || v <= 0)) failure();
}
/** Reutiliza somente a chave financeira explícita (32 bytes), com domínio HKDF próprio.
 * Não gera chave, não usa JWT e não escreve configurações. A rotação requer manter
 * a chave antiga recuperável até uma migração explicitamente autorizada. */
function key(env: NodeJS.ProcessEnv) {
  if (!bancoInterEncryptionKeyAvailable(env)) failure("Chave financeira explícita indisponível; NF não será gravada em claro.");
  return Buffer.from(hkdfSync("sha256", Buffer.from(env.BANCO_INTER_ENCRYPTION_KEY!, "hex"), Buffer.from("safatle.financeiro.hkdf.v1"), Buffer.from(PURPOSE), 32));
}
export function validarPdfNF(bytes: Buffer): void {
  if (bytes.length < 16 || bytes.length > NF_MAX_BYTES || !/^%PDF-[12]\.[0-9][\r\n ]/.test(bytes.subarray(0, 10).toString("ascii")) || !bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from("%%EOF"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Envie um PDF com cabeçalho e EOF válidos, de até 10 MiB." });
  }
}
export function decodificarPdfNF(base64: string): Buffer {
  if (base64.length > NF_MAX_BASE64 || !base64.length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PDF/base64 inválido ou acima de 10 MiB." });
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Base64 não canônico." });
  validarPdfNF(bytes);
  return bytes;
}
function parseReference(reference: string, scope: NotaFiscalScope) {
  validScope(scope);
  const match = REF.exec(reference);
  if (!match || reference.length > 255 || Number(match[1]) !== scope.estabelecimentoId || Number(match[2]) !== scope.empresaId || Number(match[3]) !== scope.recebivelId) failure();
  return { revision: match[4], digest: match[5] };
}
function aad(reference: string) { return Buffer.from(`${PURPOSE}\n${reference}`, "utf8"); }
export function cifrarNotaFiscal(scope: NotaFiscalScope, bytes: Buffer, env: NodeJS.ProcessEnv = process.env): { reference: string; envelope: Buffer } {
  validScope(scope);
  validarPdfNF(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const reference = `fin-nf/v1/h${scope.estabelecimentoId}/e${scope.empresaId}/r${scope.recebivelId}/${randomUUID()}/${digest}.enc`;
  parseReference(reference, scope);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), nonce);
  // AAD vincula hospital, empresa, recebível, UUID/revisão e digest (referência inteira).
  cipher.setAAD(aad(reference));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { reference, envelope: Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]) };
}
export function decifrarNotaFiscal(scope: NotaFiscalScope, reference: string, envelope: Buffer, env: NodeJS.ProcessEnv = process.env): Buffer {
  const { digest } = parseReference(reference, scope);
  if (envelope.length < OVERHEAD + 16 || envelope.length > NF_MAX_BYTES + OVERHEAD || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) failure();
  let bytes: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(env), envelope.subarray(MAGIC.length, MAGIC.length + 12));
    decipher.setAAD(aad(reference));
    decipher.setAuthTag(envelope.subarray(MAGIC.length + 12, OVERHEAD));
    bytes = Buffer.concat([decipher.update(envelope.subarray(OVERHEAD)), decipher.final()]);
  } catch { failure(); }
  if (!timingSafeEqual(createHash("sha256").update(bytes).digest(), Buffer.from(digest, "hex"))) failure();
  validarPdfNF(bytes);
  return bytes;
}
/** Download com streaming e teto; o MESMO sinal cobre proxy, fetch e leitura do corpo. */
export async function lerRespostaNF(response: Response, signal: AbortSignal, maxBytes: number): Promise<Buffer> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    failure();
  }
  const announced = response.headers.get("content-length");
  const reader = response.body.getReader();
  let cancelling: Promise<void> | undefined;
  const cancel = () => cancelling ??= reader.cancel().catch(() => undefined);
  const abort = () => { void cancel(); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    if (announced && (!/^\d+$/.test(announced) || Number(announced) > maxBytes)) failure();
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) failure();
      chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks, length);
  } finally {
    signal.removeEventListener("abort", abort);
    await cancel();
    reader.releaseLock();
  }
}
/** Legado estritamente local: nome exato com recebível, sem basename, symlink,
 * busca por candidatos ou recuperação de outro namespace. Nunca grava/copia NF. */
export async function lerNFLocalLegada(fileName: string, signal: AbortSignal): Promise<Buffer> {
  if (!/^nf_[1-9][0-9]*_[0-9]{10,17}\.pdf$/.test(fileName)) failure();
  signal.throwIfAborted();
  const handle = await open(path.join(process.cwd(), "uploads", fileName), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    signal.throwIfAborted();
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > NF_MAX_BYTES) failure();
    const chunks: Buffer[] = [];
    let length = 0;
    while (true) {
      signal.throwIfAborted();
      const chunk = Buffer.alloc(64 * 1024);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      length += bytesRead;
      if (length > NF_MAX_BYTES) failure();
      chunks.push(chunk.subarray(0, bytesRead));
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, length);
  } finally { await handle.close(); }
}
export async function salvarNotaFiscalDuravel(scope: NotaFiscalScope, bytes: Buffer, io: NotaFiscalIO, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { reference, envelope } = cifrarNotaFiscal(scope, bytes, env);
  try {
    const signal = AbortSignal.timeout(NF_TIMEOUT_MS);
    const result = await io.put(reference, envelope, "application/octet-stream", signal);
    signal.throwIfAborted();
    if (result.key !== reference) failure();
    return reference; // Somente após confirmação durável, nunca retorna URL.
  } catch { failure("Persistência durável da NF não confirmada. Nenhuma associação foi feita; tente anexar novamente."); }
}
export async function carregarNotaFiscalBase64(scope: NotaFiscalScope, reference: string, io: NotaFiscalIO, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  validScope(scope);
  const signal = AbortSignal.timeout(NF_TIMEOUT_MS);
  try {
    if (reference.startsWith("fin-nf/")) {
      parseReference(reference, scope); // Rejeita scope errado antes de acessar storage.
      const { url } = await io.get(reference, signal);
      signal.throwIfAborted();
      const response = await io.fetch(url, { signal, redirect: "error" });
      if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/octet-stream") {
        await response.body?.cancel().catch(() => undefined);
        failure();
      }
      const bytes = decifrarNotaFiscal(scope, reference, await lerRespostaNF(response, signal, NF_MAX_BYTES + OVERHEAD), env);
      return bytes.toString("base64");
    }
    const legacy = new RegExp(`^(nfs/)?nf_${scope.recebivelId}_[0-9]{10,17}\\.pdf$`).exec(reference);
    if (!legacy) failure();
    let bytes: Buffer;
    if (legacy[1]) {
      // Legado durável EM CLARO: não se afirma privado; baixa apenas no servidor
      // autorizado, pela referência exata. Sem cache/fallback para arquivo local.
      const { url } = await io.get(reference, signal);
      signal.throwIfAborted();
      const response = await io.fetch(url, { signal, redirect: "error" });
      if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/pdf") {
        await response.body?.cancel().catch(() => undefined);
        failure();
      }
      bytes = await lerRespostaNF(response, signal, NF_MAX_BYTES);
    } else {
      bytes = await (io.readLocal ?? lerNFLocalLegada)(reference, signal);
    }
    signal.throwIfAborted();
    validarPdfNF(bytes);
    return bytes.toString("base64");
  } catch { failure(); }
}
