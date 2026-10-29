import { createHash, randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import {
  codigoFalhaArmazenamentoXmlImportacaoValido,
  criarChaveStorageXmlImportacao,
  type XmlImportacaoVaultScope,
  type XmlImportacaoStorageFailureCode,
} from "./xmlImportacaoLoteVault";

const MAX_FILES = 30;

type SqlRow = RowDataPacket & Record<string, unknown>;

export type XmlImportacaoArquivoReserva = {
  ordem: number;
  nomeArquivo: string;
  tamanhoBytes: number;
  sha256: string;
};

export type XmlImportacaoItemReservado = {
  itemId: number;
  arquivoId: number;
  storageKey: string;
  escopo: XmlImportacaoVaultScope;
};

export type XmlImportacaoLoteResumo = {
  id: number;
  estado: string;
  fase: string;
  totalArquivos: number;
  totalHospitalares: number;
  totalHonorarios: number;
  totalBloqueados: number;
  totalErros: number;
};

export type XmlImportacaoItemFalho = {
  itemId: number;
  codigo: XmlImportacaoStorageFailureCode;
};

function asId(value: unknown): number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function sanitizeFileName(value: string): string {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 200);
  return safe || "arquivo.xml";
}

function ensureInput(input: {
  estabelecimentoId: number;
  convenioId: number;
  criadoPor: number;
  idempotencyKey: string;
  dataReferencia?: Date | null;
  dataPagamento?: Date | null;
  arquivos: readonly XmlImportacaoArquivoReserva[];
}): void {
  for (const id of [
    input.estabelecimentoId,
    input.convenioId,
    input.criadoPor,
  ]) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("XML_IMPORTACAO_SCOPE_INVALID");
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey)) {
    throw new Error("XML_IMPORTACAO_IDEMPOTENCY_INVALID");
  }
  if (!input.arquivos.length || input.arquivos.length > MAX_FILES) {
    throw new Error("XML_IMPORTACAO_FILE_COUNT_INVALID");
  }
  const hashes = new Set<string>();
  const ordens = new Set<number>();
  for (const arquivo of input.arquivos) {
    if (
      !Number.isSafeInteger(arquivo.ordem) ||
      arquivo.ordem <= 0 ||
      !arquivo.nomeArquivo ||
      arquivo.nomeArquivo.length > 255
    ) {
      throw new Error("XML_IMPORTACAO_FILE_INVALID");
    }
    if (
      !Number.isSafeInteger(arquivo.tamanhoBytes) ||
      arquivo.tamanhoBytes <= 0
    )
      throw new Error("XML_IMPORTACAO_FILE_INVALID");
    if (!/^[a-f0-9]{64}$/.test(arquivo.sha256) || hashes.has(arquivo.sha256)) {
      throw new Error("XML_IMPORTACAO_DUPLICATE_FILE");
    }
    if (ordens.has(arquivo.ordem))
      throw new Error("XML_IMPORTACAO_FILE_INVALID");
    hashes.add(arquivo.sha256);
    ordens.add(arquivo.ordem);
  }
}

export function hashManifestoXmlImportacao(input: {
  dataReferencia?: Date | null;
  dataPagamento?: Date | null;
  arquivos: readonly XmlImportacaoArquivoReserva[];
}): string {
  const iso = (value?: Date | null) =>
    value ? value.toISOString().slice(0, 10) : "";
  const canonical = JSON.stringify({
    referencia: iso(input.dataReferencia),
    pagamento: iso(input.dataPagamento),
    arquivos: [...input.arquivos]
      .sort((a, b) => a.ordem - b.ordem)
      .map(item => [item.ordem, item.tamanhoBytes, item.sha256]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function hashXmlImportacaoBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function reservarLoteXmlImportacao(input: {
  estabelecimentoId: number;
  convenioId: number;
  criadoPor: number;
  idempotencyKey: string;
  dataReferencia?: Date | null;
  dataPagamento?: Date | null;
  arquivos: readonly XmlImportacaoArquivoReserva[];
}): Promise<{
  lote: XmlImportacaoLoteResumo;
  itens: readonly XmlImportacaoItemReservado[];
  reutilizado: boolean;
}> {
  ensureInput(input);
  const manifestHash = hashManifestoXmlImportacao(input);
  const pool = await getRawPool();
  if (!pool) throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query<SqlRow[]>(
      `SELECT id,estado,fase,manifest_hash,total_arquivos,total_hospitalares,total_honorarios,total_bloqueados,total_erros
       FROM xml_importacao_lotes
       WHERE estabelecimento_id=? AND convenio_id=? AND criado_por=?
         AND (idempotency_key=? OR manifest_hash=?)
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [
        input.estabelecimentoId,
        input.convenioId,
        input.criadoPor,
        input.idempotencyKey,
        manifestHash,
      ]
    );
    const existing = existingRows[0];
    if (existing) {
      if (asText(existing.manifest_hash) !== manifestHash) {
        throw new Error("XML_IMPORTACAO_IDEMPOTENCY_CONFLICT");
      }
      const loteId = asId(existing.id);
      const [itemRows] = await connection.query<SqlRow[]>(
        `SELECT id,arquivo_id,storage_key FROM xml_importacao_itens WHERE lote_id=? ORDER BY ordem`,
        [loteId]
      );
      await connection.commit();
      return {
        lote: resumoLote(existing),
        itens: itemRows.map(row => {
          const arquivoId = asId(row.arquivo_id);
          return {
            itemId: asId(row.id),
            arquivoId,
            storageKey: asText(row.storage_key),
            escopo: {
              loteId,
              estabelecimentoId: input.estabelecimentoId,
              convenioId: input.convenioId,
              arquivoId,
            },
          };
        }),
        // Uma reserva interrompida volta pelo mesmo lote e pelas mesmas chaves.
        // Estados posteriores não recebem bytes novamente.
        reutilizado: asText(existing.estado) !== "recebendo",
      };
    }

    const [establishmentRows] = await connection.query<SqlRow[]>(
      "SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE",
      [input.estabelecimentoId]
    );
    if (!establishmentRows[0])
      throw new Error("XML_IMPORTACAO_ESTABELECIMENTO_INVALID");

    const [lotResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO xml_importacao_lotes
       (estabelecimento_id,convenio_id,criado_por,idempotency_key,manifest_hash,estado,fase,total_arquivos)
       VALUES (?,?,?,?,?, 'recebendo','persistir_selecao',?)`,
      [
        input.estabelecimentoId,
        input.convenioId,
        input.criadoPor,
        input.idempotencyKey,
        manifestHash,
        input.arquivos.length,
      ]
    );
    const loteId = asId(lotResult.insertId);
    if (!loteId) throw new Error("XML_IMPORTACAO_LOTE_CREATE_FAILED");

    const itens: XmlImportacaoItemReservado[] = [];
    for (const arquivo of [...input.arquivos].sort(
      (a, b) => a.ordem - b.ordem
    )) {
      const nomeArquivo = sanitizeFileName(arquivo.nomeArquivo);
      // O registro genérico recebe somente um marcador opaco. A chave real do
      // cofre existe exclusivamente no item do lote, nunca em uma API de Arquivos.
      const [arquivoResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO arquivos
         (nome,tipoArquivo,direcao,convenioId,estabelecimentoId,userId,s3Key,s3Url,tamanho,status,progresso,itensProcessados,dataReferencia,dataPagamento)
         VALUES (?,'xml','enviado',?,?,?,?,?,?,'pendente',0,0,?,?)`,
        [
          nomeArquivo,
          input.convenioId,
          input.estabelecimentoId,
          input.criadoPor,
          "xml-importacao-protegido",
          "",
          arquivo.tamanhoBytes,
          input.dataReferencia ?? null,
          input.dataPagamento ?? null,
        ]
      );
      const arquivoId = asId(arquivoResult.insertId);
      if (!arquivoId) throw new Error("XML_IMPORTACAO_ARQUIVO_CREATE_FAILED");
      const escopo: XmlImportacaoVaultScope = {
        loteId,
        estabelecimentoId: input.estabelecimentoId,
        convenioId: input.convenioId,
        arquivoId,
      };
      const storageKey = criarChaveStorageXmlImportacao(escopo);
      const [itemResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO xml_importacao_itens
         (lote_id,ordem,arquivo_id,nome_arquivo,storage_key,sha256,tamanho_bytes,estado,fase)
         VALUES (?,?,?,?,?,?,?,'recebido','persistir_selecao')`,
        [
          loteId,
          arquivo.ordem,
          arquivoId,
          nomeArquivo,
          storageKey,
          arquivo.sha256,
          arquivo.tamanhoBytes,
        ]
      );
      const itemId = asId(itemResult.insertId);
      if (!itemId) throw new Error("XML_IMPORTACAO_ITEM_CREATE_FAILED");
      itens.push({ itemId, arquivoId, storageKey, escopo });
    }
    await connection.commit();
    return {
      lote: {
        id: loteId,
        estado: "recebendo",
        fase: "persistir_selecao",
        totalArquivos: input.arquivos.length,
        totalHospitalares: 0,
        totalHonorarios: 0,
        totalBloqueados: 0,
        totalErros: 0,
      },
      itens,
      reutilizado: false,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function confirmarPersistenciaLoteXml(input: {
  loteId: number;
  estabelecimentoId: number;
  convenioId: number;
  criadoPor: number;
  itemIdsProntos: readonly number[];
  itemIdsFalhos: readonly number[];
  itensFalhos?: readonly XmlImportacaoItemFalho[];
}): Promise<XmlImportacaoLoteResumo> {
  const pool = await getRawPool();
  if (!pool || !asId(input.loteId) || !asId(input.criadoPor)) {
    throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lotes] = await connection.query<SqlRow[]>(
      `SELECT id,estado,fase,total_arquivos,total_hospitalares,total_honorarios,total_bloqueados,total_erros
       FROM xml_importacao_lotes
       WHERE id=? AND estabelecimento_id=? AND convenio_id=? AND criado_por=?
       FOR UPDATE`,
      [input.loteId, input.estabelecimentoId, input.convenioId, input.criadoPor]
    );
    const lote = lotes[0];
    if (!lote) throw new Error("XML_IMPORTACAO_LOTE_NOT_FOUND");
    if (asText(lote.estado) !== "recebendo") {
      // Outra requisição idêntica pode ter concluído a persistência entre a
      // reserva e esta confirmação. O resumo persistido é seguro e evita que
      // o navegador reporte erro enquanto o worker já foi enfileirado.
      await connection.commit();
      return resumoLote(lote);
    }

    const readyIds = [
      ...new Set(input.itemIdsProntos.map(asId).filter(Boolean)),
    ];
    const failedIds = [
      ...new Set(input.itemIdsFalhos.map(asId).filter(Boolean)),
    ];
    const falhasPorItem = new Map<number, XmlImportacaoStorageFailureCode>();
    for (const item of input.itensFalhos ?? []) {
      const itemId = asId(item.itemId);
      if (
        itemId &&
        failedIds.includes(itemId) &&
        codigoFalhaArmazenamentoXmlImportacaoValido(item.codigo)
      ) {
        falhasPorItem.set(itemId, item.codigo);
      }
    }
    const providedIds = new Set([...readyIds, ...failedIds]);
    if (providedIds.size !== readyIds.length + failedIds.length) {
      throw new Error("XML_IMPORTACAO_CONFIRMACAO_INVALIDA");
    }
    const [items] = await connection.query<SqlRow[]>(
      "SELECT id FROM xml_importacao_itens WHERE lote_id=? ORDER BY ordem FOR UPDATE",
      [input.loteId]
    );
    const expectedIds = items.map(item => asId(item.id)).filter(Boolean);
    if (
      !expectedIds.length ||
      expectedIds.length !== providedIds.size ||
      expectedIds.some(id => !providedIds.has(id))
    ) {
      throw new Error("XML_IMPORTACAO_CONFIRMACAO_INCOMPLETA");
    }

    if (readyIds.length) {
      const [result] = await connection.execute(
        `UPDATE xml_importacao_itens
         SET fase='classificar',estado='recebido',erro_codigo=NULL,erro_resumo=NULL
         WHERE lote_id=? AND id IN (${readyIds.map(() => "?").join(",")})`,
        [input.loteId, ...readyIds]
      );
      if (
        Number((result as ResultSetHeader).affectedRows) !== readyIds.length
      ) {
        throw new Error("XML_IMPORTACAO_CONFIRMACAO_INCOMPLETA");
      }
    }
    if (failedIds.length) {
      for (const itemId of failedIds) {
        const codigo = falhasPorItem.get(itemId) ?? "STORAGE_WRITE_FAILED";
        const [result] = await connection.execute(
          `UPDATE xml_importacao_itens
           SET estado='erro',erro_codigo=?,erro_resumo='Não foi possível armazenar o documento de forma protegida.'
           WHERE lote_id=? AND id=?`,
          [codigo, input.loteId, itemId]
        );
        if (Number((result as ResultSetHeader).affectedRows) !== 1) {
          throw new Error("XML_IMPORTACAO_CONFIRMACAO_INCOMPLETA");
        }
      }
    }

    const estado = failedIds.length ? "recebendo" : "enfileirado";
    const fase = failedIds.length ? "persistir_selecao" : "classificar";
    const [update] = await connection.execute(
      `UPDATE xml_importacao_lotes
       SET estado=?,fase=?,total_erros=?,erro_codigo=?,erro_resumo=?,proxima_tentativa_em=?,updated_at=NOW()
       WHERE id=? AND estabelecimento_id=? AND convenio_id=? AND criado_por=? AND estado='recebendo'`,
      [
        estado,
        fase,
        failedIds.length,
        failedIds.length ? "STORAGE_WRITE_RESEND_REQUIRED" : null,
        failedIds.length
          ? "A seleção completa precisa ser reenviada para armazenamento protegido."
          : null,
        null,
        input.loteId,
        input.estabelecimentoId,
        input.convenioId,
        input.criadoPor,
      ]
    );
    if (Number((update as ResultSetHeader).affectedRows) !== 1) {
      throw new Error("XML_IMPORTACAO_CONFIRMACAO_FORA_DE_ESTADO");
    }
    await connection.commit();
    return resumoLote({ ...lote, estado, fase, total_erros: failedIds.length });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function consultarLoteXmlImportacao(input: {
  loteId: number;
  estabelecimentoId: number;
  convenioId: number;
  criadoPor?: number;
}): Promise<XmlImportacaoLoteResumo | null> {
  const pool = await getRawPool();
  if (!pool) throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  const params: unknown[] = [
    input.loteId,
    input.estabelecimentoId,
    input.convenioId,
  ];
  const actorFilter = input.criadoPor ? " AND criado_por=?" : "";
  if (input.criadoPor) params.push(input.criadoPor);
  const [rows] = await pool.query<SqlRow[]>(
    `SELECT id,estado,fase,total_arquivos,total_hospitalares,total_honorarios,total_bloqueados,total_erros
     FROM xml_importacao_lotes WHERE id=? AND estabelecimento_id=? AND convenio_id=?${actorFilter} LIMIT 1`,
    params
  );
  return rows[0] ? resumoLote(rows[0]) : null;
}

function resumoLote(row: SqlRow): XmlImportacaoLoteResumo {
  return {
    id: asId(row.id),
    estado: asText(row.estado),
    fase: asText(row.fase),
    totalArquivos: Number(row.total_arquivos || 0),
    totalHospitalares: Number(row.total_hospitalares || 0),
    totalHonorarios: Number(row.total_honorarios || 0),
    totalBloqueados: Number(row.total_bloqueados || 0),
    totalErros: Number(row.total_erros || 0),
  };
}

export function criarIdempotencyKey(): string {
  return randomUUID().replace(/-/g, "");
}
