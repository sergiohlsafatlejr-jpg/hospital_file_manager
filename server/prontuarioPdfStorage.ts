import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  PRONTUARIO_PDF_MAX_BYTES,
  PRONTUARIO_PDF_TIPO,
  type ProntuarioPdfEscopo,
} from "../shared/prontuarioPdf";
import { storageGet, storagePut } from "./storage";

const PREFIXO = Buffer.from("SPP1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const OVERHEAD = PREFIXO.length + IV_BYTES + TAG_BYTES;

function chave(): Buffer {
  const value = process.env.PRONTUARIO_PDF_FILE_KEY ?? "";
  const decoded = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : /^[A-Za-z0-9+/]{43}=$/.test(value)
      ? Buffer.from(value, "base64")
      : Buffer.alloc(0);
  if (decoded.length !== 32) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "O armazenamento protegido de PDFs de prontuário precisa ser configurado pelo administrador.",
    });
  }
  return decoded;
}

export function armazenamentoProntuarioPdfPronto(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
}

function validarEscopo(escopo: ProntuarioPdfEscopo): void {
  if (
    !Number.isSafeInteger(escopo.estabelecimentoId) ||
    escopo.estabelecimentoId <= 0 ||
    !Number.isSafeInteger(escopo.convenioId) ||
    escopo.convenioId <= 0 ||
    !Number.isSafeInteger(escopo.arquivoHospitalId) ||
    escopo.arquivoHospitalId <= 0 ||
    !escopo.numeroConta ||
    escopo.numeroConta.length > 100 ||
    escopo.numeroLote.length > 100 ||
    escopo.competencia.length > 20 ||
    [escopo.numeroConta, escopo.numeroLote, escopo.competencia].some(value =>
      /[\u0000-\u001f\u007f]/.test(value)
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Escopo de prontuário inválido.",
    });
  }
}

/** AAD serializado canonicamente; não deve ser alterado sem versão nova de envelope. */
function aad(escopo: ProntuarioPdfEscopo): Buffer {
  validarEscopo(escopo);
  return Buffer.from(
    JSON.stringify({
      v: 1,
      tipo: PRONTUARIO_PDF_TIPO,
      estabelecimentoId: escopo.estabelecimentoId,
      convenioId: escopo.convenioId,
      arquivoHospitalId: escopo.arquivoHospitalId,
      numeroConta: escopo.numeroConta,
      numeroLote: escopo.numeroLote,
      competencia: escopo.competencia,
    }),
    "utf8"
  );
}

function validarTamanho(buffer: Buffer): void {
  if (!buffer.length || buffer.length > PRONTUARIO_PDF_MAX_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O PDF deve ter entre 1 byte e 5 MB.",
    });
  }
}

export function cifrarPdfProntuario(
  buffer: Buffer,
  escopo: ProntuarioPdfEscopo
): Buffer {
  validarTamanho(buffer);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  cipher.setAAD(aad(escopo));
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([PREFIXO, iv, cipher.getAuthTag(), ciphertext]);
}

export function decifrarPdfProntuario(
  buffer: Buffer,
  escopo: ProntuarioPdfEscopo
): Buffer {
  if (
    buffer.length <= OVERHEAD ||
    buffer.length > PRONTUARIO_PDF_MAX_BYTES + OVERHEAD ||
    !buffer.subarray(0, PREFIXO.length).equals(PREFIXO)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Arquivo protegido de prontuário inválido.",
    });
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      chave(),
      buffer.subarray(PREFIXO.length, PREFIXO.length + IV_BYTES)
    );
    decipher.setAAD(aad(escopo));
    decipher.setAuthTag(buffer.subarray(PREFIXO.length + IV_BYTES, OVERHEAD));
    const plain = Buffer.concat([
      decipher.update(buffer.subarray(OVERHEAD)),
      decipher.final(),
    ]);
    validarTamanho(plain);
    return plain;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível validar a integridade do arquivo protegido de prontuário.",
    });
  }
}

function prefixoEscopo(escopo: ProntuarioPdfEscopo): string {
  validarEscopo(escopo);
  // A assinatura impede que um objeto de outra conta com a mesma unidade,
  // convênio e arquivo chegue ao storage antes da validação de escopo.
  const assinatura = createHmac("sha256", chave())
    .update(aad(escopo))
    .digest("hex")
    .slice(0, 32);
  return `prontuario-pdf-protegido/${escopo.estabelecimentoId}/${escopo.convenioId}/${escopo.arquivoHospitalId}/${assinatura}/`;
}

function validarStorageKey(key: string, escopo: ProntuarioPdfEscopo): void {
  const prefix = prefixoEscopo(escopo);
  if (
    !key.startsWith(prefix) ||
    !/^[a-f0-9]{48}\.enc$/.test(key.slice(prefix.length))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Arquivo fora do escopo autorizado.",
    });
  }
}

/**
 * Cria a chave privada do objeto antes de qualquer I/O. O serviço persiste esta
 * referência em uma reserva inativa antes da escrita, portanto falhas nunca
 * deixam objeto órfão. A chave nunca integra uma resposta ou evento público.
 */
export function criarChaveStoragePdfProntuario(
  escopo: ProntuarioPdfEscopo
): string {
  return `${prefixoEscopo(escopo)}${randomBytes(24).toString("hex")}.enc`;
}

/**
 * Armazena ciphertext usando exclusivamente uma chave previamente reservada.
 * Não há operação de remoção: em falhas a reserva inativa mantém a referência
 * do objeto para quarentena e investigação administrativa.
 */
export async function salvarPdfProntuario(
  buffer: Buffer,
  escopo: ProntuarioPdfEscopo,
  key: string
): Promise<void> {
  validarStorageKey(key, escopo);
  const encrypted = cifrarPdfProntuario(buffer, escopo);
  try {
    const result = await storagePut(key, encrypted, "application/octet-stream");
    if (result.key !== key) throw new Error("storage_key_mismatch");
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível salvar o PDF de prontuário protegido.",
    });
  }
}

/**
 * O objeto de storage é obtido apenas no servidor. O URL assinado temporário nunca
 * integra o contrato público e o PDF puro só existe em memória durante o download.
 */
export async function lerPdfProntuario(
  key: string,
  escopo: ProntuarioPdfEscopo
): Promise<Buffer> {
  validarStorageKey(key, escopo);
  try {
    const result = await storageGet(key);
    const url = new URL(result.url);
    if (result.key !== key || url.protocol !== "https:")
      throw new Error("invalid_storage_response");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new Error("storage_download_failed");
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > PRONTUARIO_PDF_MAX_BYTES + OVERHEAD
    ) {
      throw new Error("storage_file_too_large");
    }
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > PRONTUARIO_PDF_MAX_BYTES + OVERHEAD)
          throw new Error("storage_file_too_large");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return decifrarPdfProntuario(Buffer.concat(chunks), escopo);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível abrir o PDF de prontuário protegido.",
    });
  }
}
