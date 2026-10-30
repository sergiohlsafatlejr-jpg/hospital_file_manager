import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { storageGet, storagePut } from "./storage";

const PREFIX = Buffer.from("SXI1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const OVERHEAD = PREFIX.length + IV_BYTES + TAG_BYTES;
const MAX_FILE_BYTES = 16 * 1024 * 1024;

export type XmlImportacaoVaultScope = {
  loteId: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoId: number;
};

export const XML_IMPORTACAO_STORAGE_FAILURE_CODES = [
  "STORAGE_KEY_UNAVAILABLE",
  "STORAGE_SCOPE_INVALID",
  "STORAGE_ACCESS_DENIED",
  "STORAGE_REQUEST_REJECTED",
  "STORAGE_UNAVAILABLE",
  "STORAGE_TRANSPORT",
  "STORAGE_RESPONSE_INVALID",
  "STORAGE_WRITE_FAILED",
] as const;

export type XmlImportacaoStorageFailureCode =
  (typeof XML_IMPORTACAO_STORAGE_FAILURE_CODES)[number];

export function codigoFalhaArmazenamentoXmlImportacaoValido(
  value: unknown
): value is XmlImportacaoStorageFailureCode {
  return (
    typeof value === "string" &&
    (XML_IMPORTACAO_STORAGE_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export class XmlImportacaoStorageError extends Error {
  constructor(readonly failureCode: XmlImportacaoStorageFailureCode) {
    super(failureCode);
    this.name = "XmlImportacaoStorageError";
  }
}

function key(): Buffer {
  const value = process.env.XML_IMPORTACAO_FILE_KEY ?? "";
  const decoded = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : /^[A-Za-z0-9+/]{43}=$/.test(value)
      ? Buffer.from(value, "base64")
      : Buffer.alloc(0);
  if (decoded.length !== 32) {
    throw new Error("XML_IMPORTACAO_STORAGE_NOT_READY");
  }
  return decoded;
}

export function armazenamentoXmlImportacaoPronto(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

function assertScope(scope: XmlImportacaoVaultScope): void {
  for (const value of [
    scope.loteId,
    scope.estabelecimentoId,
    scope.convenioId,
    scope.arquivoId,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("XML_IMPORTACAO_SCOPE_INVALID");
  }
}

function aad(scope: XmlImportacaoVaultScope): Buffer {
  assertScope(scope);
  return Buffer.from(
    JSON.stringify({
      v: 1,
      tipo: "xml-importacao-lote",
      loteId: scope.loteId,
      estabelecimentoId: scope.estabelecimentoId,
      convenioId: scope.convenioId,
      arquivoId: scope.arquivoId,
    }),
    "utf8"
  );
}

function assertSize(data: Buffer): void {
  if (!data.length || data.length > MAX_FILE_BYTES)
    throw new Error("XML_IMPORTACAO_FILE_SIZE_INVALID");
}

function scopePrefix(scope: XmlImportacaoVaultScope): string {
  const signature = createHmac("sha256", key())
    .update(aad(scope))
    .digest("hex")
    .slice(0, 32);
  return `xml-importacao-protegida/${scope.estabelecimentoId}/${scope.convenioId}/${scope.loteId}/${signature}/`;
}

function assertStorageKey(
  storageKey: string,
  scope: XmlImportacaoVaultScope
): void {
  const prefix = scopePrefix(scope);
  if (
    !storageKey.startsWith(prefix) ||
    !/^[a-f0-9]{48}\.enc$/.test(storageKey.slice(prefix.length))
  ) {
    throw new Error("XML_IMPORTACAO_STORAGE_SCOPE_INVALID");
  }
}

export function classificarFalhaArmazenamentoXmlImportacao(
  error: unknown
): XmlImportacaoStorageFailureCode {
  if (error instanceof XmlImportacaoStorageError) return error.failureCode;
  const message = error instanceof Error ? error.message : "";
  if (message === "XML_IMPORTACAO_STORAGE_NOT_READY") {
    return "STORAGE_KEY_UNAVAILABLE";
  }
  if (
    message === "XML_IMPORTACAO_STORAGE_SCOPE_INVALID" ||
    message === "XML_IMPORTACAO_SCOPE_INVALID"
  ) {
    return "STORAGE_SCOPE_INVALID";
  }
  const status = /^Storage upload failed \((\d{3})\b/.exec(message)?.[1];
  if (status === "401" || status === "403") return "STORAGE_ACCESS_DENIED";
  if (status && Number(status) >= 500) return "STORAGE_UNAVAILABLE";
  if (status) return "STORAGE_REQUEST_REJECTED";
  if (
    /(?:fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT|AbortError)/i.test(
      message
    )
  ) {
    return "STORAGE_TRANSPORT";
  }
  if (/JSON|unexpected end of input/i.test(message)) {
    return "STORAGE_RESPONSE_INVALID";
  }
  return "STORAGE_WRITE_FAILED";
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

async function assertPublicStorageUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (
    !url.hostname ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  ) {
    throw new Error("XML_IMPORTACAO_STORAGE_READ_FAILED");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("XML_IMPORTACAO_STORAGE_READ_FAILED");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(entry => isPrivateAddress(entry.address))
  ) {
    throw new Error("XML_IMPORTACAO_STORAGE_READ_FAILED");
  }
  return url;
}

export function criarChaveStorageXmlImportacao(
  scope: XmlImportacaoVaultScope
): string {
  return `${scopePrefix(scope)}${randomBytes(24).toString("hex")}.enc`;
}

function encrypt(plain: Buffer, scope: XmlImportacaoVaultScope): Buffer {
  assertSize(plain);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(scope));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([PREFIX, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(encrypted: Buffer, scope: XmlImportacaoVaultScope): Buffer {
  if (
    encrypted.length <= OVERHEAD ||
    encrypted.length > MAX_FILE_BYTES + OVERHEAD ||
    !encrypted.subarray(0, PREFIX.length).equals(PREFIX)
  ) {
    throw new Error("XML_IMPORTACAO_ENVELOPE_INVALID");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      encrypted.subarray(PREFIX.length, PREFIX.length + IV_BYTES)
    );
    decipher.setAAD(aad(scope));
    decipher.setAuthTag(encrypted.subarray(PREFIX.length + IV_BYTES, OVERHEAD));
    const plain = Buffer.concat([
      decipher.update(encrypted.subarray(OVERHEAD)),
      decipher.final(),
    ]);
    assertSize(plain);
    return plain;
  } catch {
    throw new Error("XML_IMPORTACAO_ENVELOPE_INVALID");
  }
}

export async function salvarXmlImportacaoProtegido(
  plain: Buffer,
  scope: XmlImportacaoVaultScope,
  storageKey: string
): Promise<void> {
  try {
    assertStorageKey(storageKey, scope);
    const result = await storagePut(
      storageKey,
      encrypt(plain, scope),
      "application/octet-stream"
    );
    if (result.key !== storageKey) {
      throw new Error("XML_IMPORTACAO_STORAGE_WRITE_FAILED");
    }
  } catch (error) {
    throw new XmlImportacaoStorageError(
      classificarFalhaArmazenamentoXmlImportacao(error)
    );
  }
}

export async function lerXmlImportacaoProtegido(
  scope: XmlImportacaoVaultScope,
  storageKey: string
): Promise<Buffer> {
  assertStorageKey(storageKey, scope);
  const result = await storageGet(storageKey);
  if (result.key !== storageKey)
    throw new Error("XML_IMPORTACAO_STORAGE_READ_FAILED");
  const url = await assertPublicStorageUrl(result.url);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error("XML_IMPORTACAO_STORAGE_READ_FAILED");
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES + OVERHEAD)
        throw new Error("XML_IMPORTACAO_STORAGE_FILE_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return decrypt(Buffer.concat(chunks), scope);
}

export { MAX_FILE_BYTES as XML_IMPORTACAO_MAX_FILE_BYTES };
