import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { mkdirSync, promises as fs } from "node:fs";
import { extname } from "node:path";
import { nanoid } from "nanoid";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import {
  confirmarPersistenciaLoteXml,
  criarIdempotencyKey,
  reservarLoteXmlImportacao,
} from "./xmlImportacaoLoteService";
import {
  armazenamentoXmlImportacaoPronto,
  classificarFalhaArmazenamentoXmlImportacao,
  salvarXmlImportacaoProtegido,
  XML_IMPORTACAO_MAX_FILE_BYTES,
} from "./xmlImportacaoLoteVault";

const router = Router();
const UPLOAD_DIR = "/tmp/portal-safatle-xml-importacao";
const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 160 * 1024 * 1024;
mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });

function nomeSeguro(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 200) || "arquivo.xml"
  );
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) =>
      callback(
        null,
        `${Date.now()}-${nanoid()}-${nomeSeguro(file.originalname)}`
      ),
  }),
  limits: {
    fileSize: XML_IMPORTACAO_MAX_FILE_BYTES,
    files: MAX_FILES,
    fields: 0,
  },
  fileFilter: (_req, file, callback) =>
    callback(null, extname(file.originalname).toLowerCase() === ".xml"),
});

type XmlUploadRequest = Request & {
  xmlImportacaoUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  xmlImportacaoEstabelecimentoId?: number;
  xmlImportacaoConvenioId?: number;
  xmlImportacaoIdempotencyKey?: string;
  xmlImportacaoDataReferencia?: Date | null;
  xmlImportacaoDataPagamento?: Date | null;
};

function headerInt(req: Request, name: string): number {
  const value = Number(req.header(name));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function headerDate(req: Request, name: string): Date | null | undefined {
  const raw = req.header(name)?.trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw
    ? undefined
    : date;
}

function pareceXml(documento: Buffer): boolean {
  const inicio = documento
    .subarray(0, 2048)
    .toString("utf8")
    .replace(/^\uFEFF?\s*/, "");
  return /^(?:<\?xml\s|<[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?(?:\s|>|\/))/.test(
    inicio
  );
}

async function authorizeUpload(
  req: XmlUploadRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!armazenamentoXmlImportacaoPronto()) {
      res.status(412).json({
        error:
          "A importação coordenada de XML ainda não está configurada pelo administrador.",
      });
      return;
    }
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || user.id <= 0) {
      res.status(403).json({ error: "Acesso negado." });
      return;
    }
    const estabelecimentoId = headerInt(req, "x-estabelecimento-id");
    const convenioId = headerInt(req, "x-convenio-id");
    const idempotencyKey = req.header("x-idempotency-key")?.trim() || "";
    const dataReferencia = headerDate(req, "x-data-referencia");
    const dataPagamento = headerDate(req, "x-data-pagamento");
    if (
      !estabelecimentoId ||
      !convenioId ||
      dataReferencia === undefined ||
      dataPagamento === undefined ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)
    ) {
      res
        .status(400)
        .json({ error: "Escopo ou chave de importação inválidos." });
      return;
    }
    const convenio = await db.getConvenioById(convenioId);
    if (
      !convenio ||
      (convenio.estabelecimentoId &&
        convenio.estabelecimentoId !== estabelecimentoId)
    ) {
      res.status(403).json({
        error:
          "O convênio informado não pertence ao estabelecimento selecionado.",
      });
      return;
    }
    const podeVisualizarUnidade =
      user.role === "admin" ||
      (await db.verificarPermissaoEstabelecimento(
        user.id,
        estabelecimentoId,
        "editar"
      )) ||
      (await db.verificarPermissaoEstabelecimento(
        user.id,
        estabelecimentoId,
        "visualizar"
      ));
    const temAcessoModuloUpload =
      user.role === "admin" ||
      (await db.verificarAcessoModulo(user.id, estabelecimentoId, "arquivos")) ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "contaConvenio"
      )) ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "faturamento"
      )) ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "recebimentosXml"
      ));
    const allowed =
      user.role === "admin" ||
      (podeVisualizarUnidade && temAcessoModuloUpload);
    if (!allowed) {
      res
        .status(403)
        .json({ error: "Sem permissão para importar XML nesta unidade." });
      return;
    }
    req.xmlImportacaoUser = user;
    req.xmlImportacaoEstabelecimentoId = estabelecimentoId;
    req.xmlImportacaoConvenioId = convenioId;
    req.xmlImportacaoIdempotencyKey = idempotencyKey;
    req.xmlImportacaoDataReferencia = dataReferencia;
    req.xmlImportacaoDataPagamento = dataPagamento;
    next();
  } catch {
    res.status(401).json({ error: "Não autenticado." });
  }
}

function multerError(error: unknown): string {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE")
    return "Cada XML deve ter no máximo 16 MB.";
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT")
    return "O lote pode conter no máximo 30 XMLs.";
  return "Formulário de upload inválido. Envie somente arquivos XML.";
}

router.post(
  "/api/xml-importacoes/lotes",
  authorizeUpload,
  (req, res, next) =>
    upload.array("files", MAX_FILES)(req, res, error =>
      error ? res.status(400).json({ error: multerError(error) }) : next()
    ),
  async (req: XmlUploadRequest, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    const cleanup = async () =>
      Promise.all(
        files.map(file => fs.unlink(file.path).catch(() => undefined))
      );
    try {
      const user = req.xmlImportacaoUser;
      const estabelecimentoId = req.xmlImportacaoEstabelecimentoId;
      const convenioId = req.xmlImportacaoConvenioId;
      const idempotencyKey = req.xmlImportacaoIdempotencyKey;
      const dataReferencia = req.xmlImportacaoDataReferencia;
      const dataPagamento = req.xmlImportacaoDataPagamento;
      if (
        !user ||
        !estabelecimentoId ||
        !convenioId ||
        !idempotencyKey ||
        !files.length
      ) {
        res.status(400).json({ error: "Selecione pelo menos um XML válido." });
        return;
      }
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        total > MAX_TOTAL_BYTES
      ) {
        res.status(400).json({
          error: "O lote ultrapassa o limite total permitido para importação.",
        });
        return;
      }
      const arquivos = await Promise.all(
        files.map(async (file, index) => {
          const bytes = await fs.readFile(file.path);
          if (!pareceXml(bytes)) throw new Error("XML_IMPORTACAO_XML_INVALID");
          return {
            ordem: index + 1,
            nomeArquivo: nomeSeguro(file.originalname),
            tamanhoBytes: file.size,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          };
        })
      );
      const reservation = await reservarLoteXmlImportacao({
        estabelecimentoId,
        convenioId,
        criadoPor: user.id,
        idempotencyKey,
        dataReferencia,
        dataPagamento,
        arquivos,
      });
      if (reservation.reutilizado) {
        res.status(202).json({ lote: reservation.lote, idempotencyKey });
        return;
      }
      const stored: number[] = [];
      const failed: number[] = [];
      const failedItems: Array<{
        itemId: number;
        codigo: ReturnType<typeof classificarFalhaArmazenamentoXmlImportacao>;
      }> = [];
      for (const [index, item] of reservation.itens.entries()) {
        const file = files[index];
        if (!file) {
          failed.push(item.itemId);
          failedItems.push({
            itemId: item.itemId,
            codigo: "STORAGE_WRITE_FAILED",
          });
          continue;
        }
        try {
          await salvarXmlImportacaoProtegido(
            await fs.readFile(file.path),
            item.escopo,
            item.storageKey
          );
          stored.push(item.itemId);
        } catch (error) {
          const codigo = classificarFalhaArmazenamentoXmlImportacao(error);
          console.warn("[xml-importacao] falha de armazenamento protegido", {
            loteId: reservation.lote.id,
            itemId: item.itemId,
            codigo,
          });
          failed.push(item.itemId);
          failedItems.push({ itemId: item.itemId, codigo });
        }
      }
      const lote = await confirmarPersistenciaLoteXml({
        loteId: reservation.lote.id,
        estabelecimentoId,
        convenioId,
        criadoPor: user.id,
        itemIdsProntos: stored,
        itemIdsFalhos: failed,
        itensFalhos: failedItems,
      });
      if (lote.estado === "enfileirado") {
        const { dispararProcessamentoLoteXml } = await import(
          "./xmlImportacaoLoteWorker"
        );
        dispararProcessamentoLoteXml();
      }
      res.status(202).json({ lote, idempotencyKey });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const status = code.startsWith("XML_IMPORTACAO_") ? 400 : 500;
      res.status(status).json({
        error:
          status === 400
            ? "Não foi possível preparar este lote XML."
            : "Não foi possível iniciar a importação de XML.",
      });
    } finally {
      await cleanup();
    }
  }
);

export { router as xmlImportacaoLoteUploadRouter, criarIdempotencyKey };
