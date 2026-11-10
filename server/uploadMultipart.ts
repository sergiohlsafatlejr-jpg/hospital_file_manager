/**
 * Endpoint de upload multipart para arquivos grandes (>16MB).
 * Evita a limitação do tRPC/JSON com base64 que estoura o limite de 32MB do Cloud Run.
 * 
 * POST /api/upload-file
 * - Recebe o arquivo via multipart/form-data
 * - Faz upload direto para S3
 * - Cria/atualiza registro no banco
 * - Dispara processamento em background
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { mkdirSync, promises as fs } from "node:fs";
import os from "node:os";
import path, { extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import * as db from "./db";
import { storagePut, storageGet } from "./storage";
import { sdk } from "./_core/sdk";
import {
  contratosConvenios,
  contratosConveniosDocumentos,
} from "../drizzle/schema";
import {
  CONTRATOS_PDF_MAX_BYTES,
  CONTRATOS_PDF_MAX_TOTAL_BYTES,
  ensureContratosConveniosDocumentosTable,
  sanitizarNomePdf,
} from "./contratosConveniosPdfService";
import { importTasyCsvFile } from "./tasyCsvImportService";
import {
  hashWarleineFile,
  reserveWarleineImportJob,
} from "./warleineFaturamentoImportService";
import { encryptWarleineFile } from "./warleineFileVault";
import { processNextWarleineImportJob } from "./warleineFaturamentoWorker";
import {
  assertInternalProcessingReady,
  dispatchInternalFileProcessing,
} from "./internalFileDispatch";
import {
  assertContratosUploadReady,
  createContratosUploadCloudStorage,
  createContratosUploadProductionDependencies,
  processContratosUploadPdfFile,
  registerContratosUploadRoutes,
  sha256ContratosUploadFile,
} from "./contratosUploadChunks";

const router = Router();
registerContratosUploadRoutes(router, createContratosUploadProductionDependencies());

// Configurar multer para armazenar em memória (buffer)
// Limite de 100MB para cobrir qualquer arquivo hospitalar
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const tasyUploadDir = "/tmp/portal-safatle-tasy";
mkdirSync(tasyUploadDir, { recursive: true });
const uploadTasyCsv = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tasyUploadDir),
    filename: (_req, file, callback) =>
      callback(
        null,
        `${Date.now()}-${nanoid()}-${sanitizeFilename(file.originalname)}`
      ),
  }),
  limits: { fileSize: 512 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(null, extname(file.originalname).toLowerCase() === ".csv"),
});

const warleineUploadDir = "/tmp/portal-safatle-warleine";
mkdirSync(warleineUploadDir, { recursive: true });
const uploadWarleineXlsx = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, warleineUploadDir),
    filename: (_req, file, callback) =>
      callback(
        null,
        `${Date.now()}-${nanoid()}-${sanitizeFilename(file.originalname)}`
      ),
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(null, [".xlsx", ".csv", ".zip"].includes(extname(file.originalname).toLowerCase())),
});

const contratosPdfUploadDir = path.join(os.tmpdir(), "portal-safatle-contratos-pdf");
mkdirSync(contratosPdfUploadDir, { recursive: true });
const uploadContratosPdfs = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) =>
      callback(null, contratosPdfUploadDir),
    filename: (_req, file, callback) =>
      callback(
        null,
        `${Date.now()}-${nanoid()}-${sanitizarNomePdf(file.originalname)}`
      ),
  }),
  limits: {
    fileSize: CONTRATOS_PDF_MAX_BYTES,
    files: 30,
    fields: 10,
    fieldSize: 1024,
  },
  fileFilter: (_req, file, callback) => {
    const ehExtensaoPdf = extname(file.originalname).toLowerCase() === ".pdf";
    const ehMimePdf = (file.mimetype || "").toLowerCase().includes("pdf");
    callback(null, ehExtensaoPdf || ehMimePdf);
  },
});

type TasyUploadRequest = Request & {
  tasyUploadUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  tasyEstabelecimentoId?: number;
  tasyDeadlineAtMs?: number;
};

type WarleineUploadRequest = Request & {
  warleineUploadUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  warleineEstabelecimentoId?: number;
  warleineDeadlineAtMs?: number;
};

type ContratosPdfUploadRequest = Request & {
  contratosPdfUploadUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
};

async function authorizeWarleineUpload(
  req: WarleineUploadRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const estabelecimentoId = Number(req.header("x-estabelecimento-id"));
    if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
      res
        .status(400)
        .json({ error: "Informe um estabelecimento válido antes do upload." });
      return;
    }
    const allowedEstablishment =
      user.role === "admin" ||
      (await db.verificarPermissaoEstabelecimento(
        user.id,
        estabelecimentoId,
        "gerenciar"
      ));
    const allowedModule =
      user.role === "admin" ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "contaConvenio"
      )) ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "relFaturadoRecebido"
      ));
    if (!allowedEstablishment || !allowedModule) {
      res
        .status(403)
        .json({
          error:
            "Sem permissão para importar faturamento Warleine nesta unidade.",
        });
      return;
    }
    req.warleineUploadUser = user;
    req.warleineEstabelecimentoId = estabelecimentoId;
    req.warleineDeadlineAtMs = Date.now() + 13 * 60 * 1000;
    next();
  } catch (error) {
    console.error("[Warleine XLSX] Erro ao autorizar upload:", error);
    res
      .status(500)
      .json({ error: "Não foi possível autorizar o upload Warleine." });
  }
}

async function authorizeTasyUpload(
  req: TasyUploadRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    const estabelecimentoId = Number(req.header("x-estabelecimento-id"));
    if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
      res
        .status(400)
        .json({ error: "Informe um estabelecimento válido antes do upload." });
      return;
    }

    const allowedEstablishment =
      user.role === "admin" ||
      (await db.verificarPermissaoEstabelecimento(
        user.id,
        estabelecimentoId,
        "gerenciar"
      ));
    if (!allowedEstablishment) {
      res
        .status(403)
        .json({ error: "Sem permissão para importar dados nesta unidade." });
      return;
    }
    const allowedModule =
      user.role === "admin" ||
      (await db.verificarAcessoModulo(
        user.id,
        estabelecimentoId,
        "importacaoTasy"
      ));
    if (!allowedModule) {
      res
        .status(403)
        .json({
          error: "Sem permissão para usar a importação Tasy nesta unidade.",
        });
      return;
    }

    req.tasyUploadUser = user;
    req.tasyEstabelecimentoId = estabelecimentoId;
    req.tasyDeadlineAtMs = Date.now() + 13 * 60 * 1000;
    next();
  } catch (error) {
    console.error("[Tasy CSV] Erro ao autorizar upload:", error);
    res
      .status(500)
      .json({ error: "Não foi possível autorizar o upload Tasy." });
  }
}

async function authorizeContratosPdfUpload(
  req: ContratosPdfUploadRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || user.id <= 0) {
      res.status(403).json({ error: "Acesso negado." });
      return;
    }
    req.contratosPdfUploadUser = user;
    next();
  } catch {
    res.status(401).json({ error: "Não autenticado." });
  }
}

// Sanitizar nome do arquivo
function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 200);
}

router.post(
  "/api/contratos-convenios/importar-pdfs",
  authorizeContratosPdfUpload,
  (req, res, next) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    uploadContratosPdfs.array("files", 30)(req, res, error => {
      if (error) {
        const message =
          error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "Cada PDF deve ter no máximo 150 MB."
            : error instanceof multer.MulterError &&
                error.code === "LIMIT_FILE_COUNT"
              ? "O lote pode conter no máximo 30 PDFs."
              : "Formulário de upload inválido. Envie somente arquivos PDF (até 150 MB cada).";
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
  async (req: ContratosPdfUploadRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const limparArquivos = async () => {
      await Promise.all(
        files.map(file => fs.unlink(file.path).catch(() => undefined))
      );
    };
    try {
      const user = req.contratosPdfUploadUser;
      const contratoId = Number(req.body.contratoId);
      if (!user) {
        await limparArquivos();
        return res
          .status(401)
          .json({ error: "Autorização do upload não encontrada." });
      }
      if (!Number.isInteger(contratoId) || contratoId <= 0) {
        await limparArquivos();
        return res.status(400).json({ error: "Informe um contrato válido." });
      }
      if (!files.length) {
        return res.status(400).json({ error: "Selecione ao menos um PDF." });
      }
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      if (totalBytes > CONTRATOS_PDF_MAX_TOTAL_BYTES) {
        await limparArquivos();
        return res
          .status(400)
          .json({ error: "O lote de PDFs deve ter no máximo 600 MB." });
      }

      await ensureContratosConveniosDocumentosTable();
      const database = await db.getDb();
      if (!database) {
        await limparArquivos();
        return res
          .status(412)
          .json({
            error: "Banco de dados indisponível para importar documentos.",
          });
      }
      const [contrato] = await database
        .select({
          id: contratosConvenios.id,
          estabelecimentoId: contratosConvenios.estabelecimentoId,
        })
        .from(contratosConvenios)
        .where(eq(contratosConvenios.id, contratoId))
        .limit(1);
      if (!contrato) {
        await limparArquivos();
        return res.status(404).json({ error: "Contrato não encontrado." });
      }
      if (
        user.role !== "admin" &&
        !(await db.verificarPermissaoEstabelecimento(
          user.id,
          contrato.estabelecimentoId,
          "gerenciar"
        ))
      ) {
        await limparArquivos();
        return res
          .status(403)
          .json({ error: "Sem permissão para importar documentos nesta unidade." });
      }

      const documentos: Array<Record<string, unknown>> = [];
      for (const file of files) {
        try {
          await assertContratosUploadReady(file.size);
          const sha256 = await sha256ContratosUploadFile(file.path);
          const [existente] = await database
            .select()
            .from(contratosConveniosDocumentos)
            .where(
              and(
                eq(contratosConveniosDocumentos.contratoId, contratoId),
                eq(contratosConveniosDocumentos.sha256, sha256)
              )
            )
            .limit(1);
          if (existente) {
            if (existente.status !== "concluido" && existente.status !== "ocr_necessario") {
              throw new Error("Este PDF possui upload pendente ou interrompido; retome a sessão original.");
            }
            documentos.push({
              id: existente.id,
              nomeArquivo: existente.nomeArquivo,
              status: existente.status,
              paginas: existente.paginas,
              pontosImportantes: existente.pontosImportantes ?? [],
              reutilizado: true,
            });
            continue;
          }

          const leitura = await processContratosUploadPdfFile(file.path, file.size);
          const nomeArquivo = sanitizarNomePdf(file.originalname);
          const storageKey = `contratos-convenios/${contrato.estabelecimentoId}/${contratoId}/${nanoid(32)}.pdf`;
          const cloud = createContratosUploadCloudStorage({
            put: (key, bytes, mime, options) => storagePut(key, bytes, mime, options?.signal),
            get: (key, options) => storageGet(key, options?.signal),
            configuration: () => ({
              baseUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
              apiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
            }),
          });
          await cloud.putFile(storageKey, file.path);
          const [insertResult] = await database
            .insert(contratosConveniosDocumentos)
            .values({
              contratoId,
              estabelecimentoId: contrato.estabelecimentoId,
              nomeArquivo,
              storageKey,
              mimeType: "application/pdf",
              tamanhoBytes: file.size,
              sha256,
              paginas: leitura.paginas,
              status: leitura.status,
              textoExtraido: leitura.textoExtraido,
              pontosImportantes: leitura.pontosImportantes,
              erroProcessamento: null,
              criadoPor: user.id,
            });
          const id = Number((insertResult as any)?.insertId ?? 0);
          documentos.push({
            id,
            nomeArquivo,
            status: leitura.status,
            paginas: leitura.paginas,
            pontosImportantes: leitura.pontosImportantes,
            reutilizado: false,
          });
        } catch (error: any) {
          documentos.push({
            nomeArquivo: sanitizarNomePdf(file.originalname),
            status: "erro",
            erro: error?.message || "Não foi possível processar o PDF.",
          });
        } finally {
          await fs.unlink(file.path).catch(() => undefined);
        }
      }

      const processados = documentos.filter(
        documento => documento.status !== "erro"
      ).length;
      return res.status(200).json({
        success: processados > 0,
        contratoId,
        total: documentos.length,
        processados,
        documentos,
      });
    } catch (error: any) {
      await limparArquivos();
      console.error(
        "[Contratos PDF] Erro ao importar documentos:",
        error?.message || error
      );
      return res
        .status(500)
        .json({ error: "Não foi possível concluir a importação dos PDFs." });
    }
  }
);

router.get(
  "/api/contratos-convenios/documentos/:id/download",
  authorizeContratosPdfUpload,
  async (req: ContratosPdfUploadRequest, res: Response) => {
    try {
      const user = req.contratosPdfUploadUser;
      const docId = Number(req.params.id);
      if (!user || !Number.isInteger(docId) || docId <= 0) {
        return res.status(400).json({ error: "Documento inválido." });
      }
      await ensureContratosConveniosDocumentosTable();
      const database = await db.getDb();
      if (!database) {
        return res.status(412).json({ error: "Banco de dados indisponível." });
      }
      const [documento] = await database
        .select()
        .from(contratosConveniosDocumentos)
        .where(eq(contratosConveniosDocumentos.id, docId))
        .limit(1);
      if (!documento) {
        return res.status(404).json({ error: "Documento não encontrado." });
      }
      if (
        user.role !== "admin" &&
        !(await db.verificarPermissaoEstabelecimento(
          user.id,
          documento.estabelecimentoId,
          "visualizar"
        ))
      ) {
        return res.status(403).json({ error: "Sem permissão para visualizar este documento." });
      }

      if (documento.status !== "concluido" && documento.status !== "ocr_necessario") {
        return res.status(409).json({ error: "O PDF ainda não está disponível para download." });
      }
      if (
        process.env.BUILT_IN_FORGE_API_URL &&
        process.env.BUILT_IN_FORGE_API_KEY
      ) {
        const cloud = await storageGet(documento.storageKey);
        if (cloud?.url) {
          const upstream = await fetch(cloud.url);
          if (upstream.ok && upstream.body) {
            res.setHeader("Content-Type", documento.mimeType || "application/pdf");
            res.setHeader(
              "Content-Disposition",
              `inline; filename="${sanitizarNomePdf(documento.nomeArquivo)}"`
            );
            res.status(200);
            await pipeline(
              Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream<Uint8Array>),
              res
            );
            return;
          }
        }
      }

      return res
        .status(404)
        .json({ error: "Arquivo PDF não encontrado no armazenamento." });
    } catch (error: any) {
      console.error("[Contratos PDF] Falha ao transmitir documento autorizado.");
      if (res.headersSent) {
        res.destroy();
        return;
      }
      return res
        .status(500)
        .json({ error: "Não foi possível abrir o PDF." });
    }
  }
);

async function autenticarAntesDoUpload(req: Request, res: Response, next: () => void) {
  try {
    res.locals.uploadUser = await sdk.authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: "Não autenticado" });
  }
}

router.post(
  "/api/upload-file",
  autenticarAntesDoUpload,
  upload.single("file"),
  async (req: Request, res: Response) => {
  try {
    const user = res.locals.uploadUser;
    if (!user) return res.status(401).json({ error: "Não autenticado" });
    const userId = user.id;

    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    // Extrair metadados do body
    const {
      nome,
      tipoArquivo,
      direcao,
      convenioId,
      estabelecimentoId,
      dataReferencia,
      dataPagamento,
    } = req.body;

    if (!nome || !tipoArquivo || !direcao || !convenioId) {
        return res
          .status(400)
          .json({
            error:
              "Campos obrigatórios: nome, tipoArquivo, direcao, convenioId",
          });
    }

    if (tipoArquivo === "xml" && direcao === "enviado") {
      return res.status(400).json({
        error: "Envie XMLs de guias pelo lote protegido na tela de Upload.",
      });
    }

    const buffer = file.buffer;
    const sanitizedNome = sanitizeFilename(nome);
      const convId = Number(convenioId);
      const estabId = Number(estabelecimentoId);
      if (
        !Number.isSafeInteger(convId) ||
        convId <= 0 ||
        !Number.isSafeInteger(estabId) ||
        estabId <= 0
      ) {
        return res
          .status(400)
          .json({ error: "Informe convênio e estabelecimento válidos." });
      }
      const convenio = await db.getConvenioById(convId);
      if (!convenio) {
        return res.status(404).json({ error: "Convênio não encontrado." });
      }
      if (
        convenio.estabelecimentoId &&
        convenio.estabelecimentoId !== estabId
      ) {
        return res
          .status(403)
          .json({
            error:
              "O convênio informado não pertence ao estabelecimento selecionado.",
          });
      }
      if (user.role !== "admin") {
        const permitido = await db.verificarPermissaoEstabelecimento(
          user.id,
          estabId,
          "editar"
        );
        if (!permitido) {
          return res
            .status(403)
            .json({
              error:
                "Sem permissão para importar arquivos neste estabelecimento.",
            });
        }
      }

      const precisaWorker = direcao === "enviado" ||
        (direcao === "retornado" && ["excel", "csv", "txt", "xml"].includes(tipoArquivo));
      if (precisaWorker) {
        try { assertInternalProcessingReady(); }
        catch { return res.status(412).json({ error: "O processamento interno não está configurado." }); }
      }
      console.log(
        `[UploadMultipart] Recebido: ${(buffer.length / 1024 / 1024).toFixed(1)}MB tipo=${tipoArquivo} direcao=${direcao}`
      );

    // Verificar se já existe um arquivo com mesmo nome, convênio e estabelecimento
    const arquivoExistente = await db.findArquivoExistente({
      nome,
      convenioId: convId,
        estabelecimentoId: estabId,
      userId,
      direcao,
    });

    let arquivoId: number;
    let s3Url: string;
    let isReimportacao = false;

      const ext =
        tipoArquivo === "excel"
          ? "xlsx"
          : tipoArquivo === "csv"
            ? "csv"
            : tipoArquivo;
    const s3Key = `arquivos/${userId}/${nanoid()}-${sanitizedNome}.${ext}`;
    const contentType =
        tipoArquivo === "xml"
          ? "application/xml"
          : tipoArquivo === "excel"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : tipoArquivo === "csv"
              ? "text/csv"
              : tipoArquivo === "txt"
                ? "text/plain"
        : "application/pdf";

    // Upload to S3
    const uploadResult = await storagePut(s3Key, buffer, contentType);
    s3Url = uploadResult.url;

    if (arquivoExistente) {
      // Reimportação
      isReimportacao = true;
      arquivoId = arquivoExistente.id;
        await db.updateArquivo(arquivoId, {
          s3Url,
          s3Key,
          tamanho: buffer.length,
          status: "pendente",
          progresso: 0,
          itensProcessados: 0,
          totalItens: null,
          dataReferencia: dataReferencia ? new Date(dataReferencia) : null,
          dataPagamento: dataPagamento ? new Date(dataPagamento) : null,
        });
      console.log(`[UploadMultipart] Reimportação do arquivo ${arquivoId}`);
    } else {
      // Novo arquivo
      const dataRef = dataReferencia ? new Date(dataReferencia) : undefined;
      const dataPag = dataPagamento ? new Date(dataPagamento) : undefined;
      const result = await db.createArquivo({
        nome,
        tipoArquivo,
        direcao,
        convenioId: convId,
          estabelecimentoId: estabId,
        userId,
        s3Url,
        s3Key,
        dataReferencia: dataRef,
        dataPagamento: dataPag,
      });
      arquivoId = result.id;
      console.log(`[UploadMultipart] Novo arquivo criado: ${arquivoId}`);
    }

    if (precisaWorker) {
      await db.updateArquivoStatus(arquivoId, "processando");
      await db.updateArquivoProgresso(arquivoId, 5, 0);
      const planilhaRetorno = direcao === "retornado" &&
        ["excel", "csv", "txt"].includes(tipoArquivo);
      // PR156: apenas um Excel NOVO pode dispensar a limpeza. CSV/TXT e
      // reimportações preservam a limpeza; XML/envio usam o default do worker.
      void dispatchInternalFileProcessing({
        arquivoId,
        ...(planilhaRetorno ? {
          limparDadosAnteriores: isReimportacao || tipoArquivo !== "excel",
        } : {}),
      }).catch(() => undefined);
    }

      // Não retornar URL/chave de storage: o acompanhamento usa somente o ID.
    res.json({
      success: true,
      id: arquivoId,
      reimportado: isReimportacao,
      processandoEmBackground: true,
    });
    } catch {
      // A resposta não deve carregar detalhes internos de XML, storage ou banco.
      console.error("[UploadMultipart] Falha interna ao receber upload");
      res.status(500).json({ error: "Erro interno no upload" });
  }
  }
);

router.post(
  "/api/tasy/importar-csv",
  (req, res, next) => {
    // O lote piloto de 272 MB concluiu em cerca de quatro minutos; o limite da
    // hospedagem é de 15 minutos. O timeout precisa ser aplicado antes do multer.
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
  },
  authorizeTasyUpload,
  uploadTasyCsv.single("file"),
  async (req: TasyUploadRequest, res: Response) => {
  let tempPath = req.file?.path;
  try {
    const user = req.tasyUploadUser;
    const estabelecimentoId = req.tasyEstabelecimentoId;
    const configId = req.body.configId ? Number(req.body.configId) : null;
      const validConfigId =
        typeof configId === "number" &&
        Number.isInteger(configId) &&
        configId > 0
          ? configId
          : null;
      const substituirSnapshot = req.body.substituirSnapshot === "true";
      const confirmarSubstituicao = req.body.confirmarSubstituicao === "true";
      if (!req.file || !tempPath)
        return res.status(400).json({ error: "Selecione um arquivo CSV." });
    if (!user || !estabelecimentoId) {
      await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(401)
          .json({ error: "Autorização do upload não encontrada." });
    }
    if (Number(req.body.estabelecimentoId) !== estabelecimentoId) {
      await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(400)
          .json({
            error: "A unidade do formulário diverge da autorização do upload.",
          });
    }
    if (substituirSnapshot && !confirmarSubstituicao) {
      await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(400)
          .json({
            error:
              "Confirme explicitamente que o arquivo representa o snapshot completo da unidade.",
          });
    }

    const originalName = req.file.originalname;
    const processingPath = tempPath;
    tempPath = undefined;
    try {
      const result = await importTasyCsvFile({
        filePath: processingPath,
        fileName: originalName,
        estabelecimentoId,
        userId: user.id,
        configId: validConfigId,
        publish: true,
        replaceSnapshot: substituirSnapshot,
        deadlineAtMs: req.tasyDeadlineAtMs,
          onProgress: progress => {
            if (
              progress.processedRows > 0 &&
              progress.processedRows % 100_000 === 0
            ) {
              console.log(
                `[Tasy CSV] estabelecimento=${estabelecimentoId} fase=${progress.phase} linhas=${progress.processedRows}`
              );
          }
        },
      });
      return res.status(200).json({
        success: true,
        processandoEmBackground: false,
        loteId: result.loteId,
        reutilizado: result.reusedExistingLot,
        totalContas: result.totalAccounts,
        totalPublicadas: result.publishedAccounts,
        message: result.reusedExistingLot
            ? "Este arquivo já havia sido processado; o lote existente foi reutilizado."
            : "CSV validado e publicado com sucesso.",
      });
    } finally {
      await fs.unlink(processingPath).catch(() => undefined);
    }
  } catch (error: any) {
    if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
      console.error(
        "[Tasy CSV] Erro ao receber arquivo:",
        error?.message || error
      );
      return res
        .status(500)
        .json({ error: error?.message || "Erro interno no upload Tasy." });
  }
  }
);

router.post(
  "/api/warleine/importar-faturamento",
  (req, res, next) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
  },
  authorizeWarleineUpload,
  uploadWarleineXlsx.single('file'),
  async (req: WarleineUploadRequest, res: Response) => {
    let tempPath = req.file?.path;
    try {
      const user = req.warleineUploadUser;
      const estabelecimentoId = req.warleineEstabelecimentoId;
      if (!req.file || !tempPath)
        return res
          .status(400)
          .json({ error: "Selecione um arquivo CSV, ZIP ou XLSX do Warleine." });
      if (!user || !estabelecimentoId) {
        await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(401)
          .json({ error: "Autorização do upload não encontrada." });
      }
      if (Number(req.body.estabelecimentoId) !== estabelecimentoId) {
        await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(400)
          .json({
            error: "A unidade do formulário diverge da autorização do upload.",
          });
      }
      if (req.body.confirmarSubstituicao !== 'true') {
        await fs.unlink(tempPath).catch(() => undefined);
        return res
          .status(400)
          .json({
            error:
              "Confirme que o arquivo substitui as competências nele contidas.",
          });
      }

      const processingPath = tempPath;
      const fileHash = await hashWarleineFile(processingPath);
      let storageKey = `warleine-faturamento/${estabelecimentoId}/${fileHash}.bin`;
      const encryptedFile = encryptWarleineFile(
        await fs.readFile(processingPath)
      );
      try {
        await storagePut(storageKey, encryptedFile, "application/octet-stream");
      } catch (storageErr) {
        if (process.env.NODE_ENV === "production" && process.env.BUILT_IN_FORGE_API_URL) {
          throw storageErr;
        }
        const localDir = path.join(os.tmpdir(), "portal-safatle-warleine-vault", String(estabelecimentoId));
        await fs.mkdir(localDir, { recursive: true });
        const localVaultPath = path.join(localDir, `${fileHash}.bin`);
        await fs.writeFile(localVaultPath, encryptedFile);
        storageKey = `local:${localVaultPath}`;
      }
      const job = await reserveWarleineImportJob({
        estabelecimentoId,
        userId: user.id,
        fileName: req.file.originalname,
        fileHash,
        fileSize: req.file.size,
        storageKey,
      });
      await fs.unlink(processingPath).catch(() => undefined);
      tempPath = undefined;
      if (job.status !== "publicado") {
        void processNextWarleineImportJob().catch(() => undefined);
      }
      return res.status(job.status === "publicado" ? 200 : 202).json({
        success: true,
        processandoEmBackground: job.status !== "publicado",
        loteId: job.loteId,
        reutilizado: job.reusedExistingLot,
        status: job.status,
        message:
          job.status === "publicado"
            ? "Este arquivo já havia sido publicado; o lote existente foi reutilizado."
            : "Arquivo recebido com segurança e enfileirado para validação e publicação.",
      });
    } catch (error: any) {
      if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
      console.error(
        "[Warleine XLSX] Erro ao receber arquivo:",
        error?.message || error
      );
      return res
        .status(500)
        .json({ error: error?.message || "Erro interno no upload Warleine." });
    }
    }
);

export { router as uploadMultipartRouter };
