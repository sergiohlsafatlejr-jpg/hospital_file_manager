import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { arquivos } from "../drizzle/schema";
import {
  armazenamentoXmlImportacaoPronto,
  criarChaveStorageXmlImportacao,
  salvarXmlImportacaoProtegido,
  lerXmlImportacaoProtegido,
  XML_IMPORTACAO_MAX_FILE_BYTES,
} from "./xmlImportacaoLoteVault";

type BancoArquivos = Pick<NonNullable<Awaited<ReturnType<typeof import("./db").getDb>>>, "insert" | "update">;

export function decodificarXmlFabricaBase64(value: string): Buffer {
  const encoded = value.trim();
  if (!encoded || encoded.length > Math.ceil(XML_IMPORTACAO_MAX_FILE_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O XML enviado está vazio, inválido ou excede o limite permitido." });
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > XML_IMPORTACAO_MAX_FILE_BYTES || buffer.toString("base64") !== encoded) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O XML enviado está vazio, inválido ou excede o limite permitido." });
  }
  return buffer;
}

/** O chamador usa uma transação: falhas não deixam arquivo pendente ou conta parcialmente alterada. */
export async function criarArquivoXmlFabricaProtegido(db: BancoArquivos, input: {
  xml: Buffer;
  nome: string;
  fabricaContaId: number;
  estabelecimentoId: number;
  convenioId: number;
  usuarioId: number;
  dataReferencia: Date;
}): Promise<number> {
  if (!armazenamentoXmlImportacaoPronto()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O armazenamento protegido de XML ainda não está configurado." });
  }
  if (!Buffer.isBuffer(input.xml) || !input.xml.length || input.xml.length > XML_IMPORTACAO_MAX_FILE_BYTES
    || [input.fabricaContaId, input.estabelecimentoId, input.convenioId, input.usuarioId].some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dados inválidos para o armazenamento protegido do XML." });
  }
  const [result] = await db.insert(arquivos).values({
    nome: input.nome.slice(0, 255) || "documento.xml",
    tipoArquivo: "xml",
    direcao: "enviado",
    convenioId: input.convenioId,
    estabelecimentoId: input.estabelecimentoId,
    userId: input.usuarioId,
    s3Key: "",
    s3Url: "",
    tamanho: input.xml.length,
    status: "pendente",
    progresso: 0,
    totalItens: 0,
    itensProcessados: 0,
    dataReferencia: input.dataReferencia,
  });
  const arquivoId = Number(result.insertId);
  if (!Number.isSafeInteger(arquivoId) || arquivoId <= 0) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível reservar o arquivo para armazenamento protegido." });
  }
  // loteId é o namespace criptográfico da conta Fábrica, não um registro/claim do worker XML.
  // arquivoId global + unidade + convênio permanecem vinculados por AAD e HMAC do cofre existente.
  const scope = { loteId: input.fabricaContaId, estabelecimentoId: input.estabelecimentoId, convenioId: input.convenioId, arquivoId };
  const key = criarChaveStorageXmlImportacao(scope);
  try {
    await salvarXmlImportacaoProtegido(input.xml, scope, key);
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível armazenar o XML no cofre protegido. Nenhuma importação foi confirmada." });
  }
  await db.update(arquivos).set({
    s3Key: key,
    // Marcador interno de leitura cifrada; nunca representa um URL público do XML original.
    s3Url: `cofre-xml-fabrica://${input.fabricaContaId}/${arquivoId}`,
  }).where(and(eq(arquivos.id, arquivoId), eq(arquivos.estabelecimentoId, input.estabelecimentoId), eq(arquivos.convenioId, input.convenioId)));
  return arquivoId;
}

export async function confirmarArquivoXmlFabrica(db: BancoArquivos, arquivoId: number, estabelecimentoId: number, convenioId: number, totalItens: number): Promise<void> {
  await db.update(arquivos).set({ status: "processado", progresso: 100, totalItens, itensProcessados: totalItens })
    .where(and(eq(arquivos.id, arquivoId), eq(arquivos.estabelecimentoId, estabelecimentoId), eq(arquivos.convenioId, convenioId)));
}

/** Somente após a autorização do arquivo feita pelo repositório canônico. */
export async function lerXmlFabricaProtegido(arquivo: {
  id: number; estabelecimentoId: number; convenioId: number; s3Key: string; s3Url?: string | null;
}): Promise<Buffer> {
  try {
    const marker = new URL(arquivo.s3Url || "");
    if (marker.protocol !== "cofre-xml-fabrica:" || marker.username || marker.password || marker.search || marker.hash
      || !/^[1-9]\d*$/.test(marker.hostname) || marker.pathname !== `/${arquivo.id}`) throw new Error("invalid marker");
    const contaId = Number(marker.hostname);
    return await lerXmlImportacaoProtegido({ loteId: contaId, estabelecimentoId: arquivo.estabelecimentoId, convenioId: arquivo.convenioId, arquivoId: arquivo.id }, arquivo.s3Key);
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível abrir o XML médico no cofre protegido." });
  }
}
