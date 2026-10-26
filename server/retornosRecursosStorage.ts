import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { RetornoEscopo } from "../shared/retornosRecursos";
import { RETORNO_PDF_MAX_BYTES, RETORNO_XML_MAX_BYTES } from "../shared/retornosRecursos";
import { storageGet, storagePut } from "./storage";

type Tipo = "xml" | "pdf";
const PREFIXO = Buffer.from("SRR1");
const OVERHEAD = 4 + 12 + 16;
function chave(): Buffer {
  const value = process.env.RETORNOS_RECURSOS_FILE_KEY ?? "";
  const decoded = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : /^[A-Za-z0-9+/]{43}=$/.test(value) ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (decoded.length !== 32) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O armazenamento protegido dos retornos precisa ser configurado pelo administrador." });
  return decoded;
}
export function armazenamentoRetornosPronto(): boolean {
  try { chave(); return true; } catch { return false; }
}
function validarEscopo(escopo: RetornoEscopo) {
  if (![escopo.estabelecimentoId, escopo.convenioId].every(v => Number.isSafeInteger(v) && v > 0)) throw new TRPCError({ code: "FORBIDDEN", message: "Escopo inválido" });
}
function aad(escopo: RetornoEscopo, tipo: Tipo) {
  validarEscopo(escopo);
  return Buffer.from(`retornos-recursos:v1:${escopo.estabelecimentoId}:${escopo.convenioId}:${tipo}`);
}
function limite(tipo: Tipo) { return tipo === "xml" ? RETORNO_XML_MAX_BYTES : RETORNO_PDF_MAX_BYTES; }
export function cifrarArquivoRetorno(buffer: Buffer, escopo: RetornoEscopo, tipo: Tipo): Buffer {
  if (!buffer.length || buffer.length > limite(tipo)) throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo ultrapassa o limite permitido." });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  cipher.setAAD(aad(escopo, tipo));
  const conteudo = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([PREFIXO, iv, cipher.getAuthTag(), conteudo]);
}
export function decifrarArquivoRetorno(buffer: Buffer, escopo: RetornoEscopo, tipo: Tipo): Buffer {
  if (buffer.length <= OVERHEAD || buffer.length > limite(tipo) + OVERHEAD || !buffer.subarray(0, 4).equals(PREFIXO)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Arquivo protegido inválido." });
  const key = chave();
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(4, 16));
    cipher.setAAD(aad(escopo, tipo));
    cipher.setAuthTag(buffer.subarray(16, 32));
    return Buffer.concat([cipher.update(buffer.subarray(32)), cipher.final()]);
  } catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível validar a integridade do arquivo protegido." }); }
}
export async function salvarArquivoRetorno(buffer: Buffer, escopo: RetornoEscopo, tipo: Tipo): Promise<{ key: string }> {
  const conteudo = cifrarArquivoRetorno(buffer, escopo, tipo);
  const key = `retornos-recursos-protegidos/${escopo.estabelecimentoId}/${escopo.convenioId}/${tipo}/${randomBytes(24).toString("hex")}.enc`;
  try {
    const result = await storagePut(key, conteudo, "application/octet-stream");
    if (result.key !== key) throw new Error("storage_key_mismatch");
    return { key };
  } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o arquivo protegido. Nenhuma confirmação foi concluída." }); }
}
export async function lerArquivoRetorno(key: string, escopo: RetornoEscopo, tipo: Tipo): Promise<Buffer> {
  validarEscopo(escopo);
  const prefix = `retornos-recursos-protegidos/${escopo.estabelecimentoId}/${escopo.convenioId}/${tipo}/`;
  if (!key.startsWith(prefix) || !/^[a-f0-9]{48}\.enc$/.test(key.slice(prefix.length))) throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo fora do escopo autorizado." });
  try {
    const result = await storageGet(key);
    const url = new URL(result.url);
    if (result.key !== key || url.protocol !== "https:") throw new Error("invalid_storage_response");
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "error" });
    if (!response.ok || !response.body) throw new Error("storage_download_failed");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limite(tipo) + OVERHEAD) throw new Error("storage_file_too_large");
    const chunks: Buffer[] = [];
    let bytes = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limite(tipo) + OVERHEAD) throw new Error("storage_file_too_large");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return decifrarArquivoRetorno(Buffer.concat(chunks), escopo, tipo);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível abrir o arquivo protegido. Tente novamente." });
  }
}
