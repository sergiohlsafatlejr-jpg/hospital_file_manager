import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import {
  PRONTUARIO_PDF_MAX_BYTES,
  prontuarioPdfUploadMultipartSchema,
} from "../shared/prontuarioPdf";
import { sdk } from "./_core/sdk";
import { prontuarioPdfUpload } from "./prontuarioPdfService";

const uploadProntuarioPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRONTUARIO_PDF_MAX_BYTES,
    files: 1,
    fields: 8,
    fieldSize: 255,
  },
});

function erroHttp(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function statusErro(error: unknown): number {
  if (error instanceof multer.MulterError) return 400;
  switch ((error as any)?.code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "BAD_REQUEST":
      return 400;
    case "PRECONDITION_FAILED":
      return 412;
    default:
      return 500;
  }
}

type ProntuarioUploadRequest = Request & {
  prontuarioUploadUserId?: number;
};

/** Autentica antes de receber bytes na memória. */
async function autenticarUploadProntuario(
  req: ProntuarioUploadRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || user.id <= 0) {
      erroHttp(res, 403, "Acesso negado.");
      return;
    }
    req.prontuarioUploadUserId = user.id;
    next();
  } catch {
    erroHttp(res, 401, "Não autenticado.");
  }
}

/**
 * POST same-origin para PDF clínico. O conteúdo só transita como parte de
 * multipart/form-data, nunca por tRPC/JSON, Base64 ou DTO público.
 */
export function registrarUploadProntuarioPdf(app: Router): void {
  app.post(
    "/api/prontuario-pdf/upload",
    autenticarUploadProntuario,
    (req, res, next) =>
      uploadProntuarioPdf.single("file")(req, res, error => {
        if (error) {
          erroHttp(
            res,
            statusErro(error),
            error instanceof multer.MulterError &&
              error.code === "LIMIT_FILE_SIZE"
              ? "O PDF deve ter no máximo 5 MB."
              : "Formulário de upload inválido."
          );
          return;
        }
        next();
      }),
    async (req: ProntuarioUploadRequest, res: Response) => {
      try {
        if (!req.file) {
          erroHttp(res, 400, "Envie um arquivo PDF.");
          return;
        }
        const parsed = prontuarioPdfUploadMultipartSchema.safeParse(req.body);
        if (!parsed.success) {
          erroHttp(res, 400, "Metadados de upload inválidos.");
          return;
        }
        // O nome declarado é o metadado auditável; exige consistência com o arquivo.
        if (req.file.originalname !== parsed.data.nomeArquivo) {
          erroHttp(res, 400, "O nome do arquivo não confere com os metadados.");
          return;
        }
        const resultado = await prontuarioPdfUpload(
          { ...parsed.data, arquivo: req.file.buffer },
          req.prontuarioUploadUserId!
        );
        // Contrato propositalmente mínimo: sem URL, hash, storage key ou conteúdo.
        res.status(201).json({
          id: resultado.id,
          nomeArquivo: resultado.nomeArquivo,
          tamanhoBytes: resultado.tamanhoBytes,
        });
      } catch (error) {
        const status = statusErro(error);
        erroHttp(
          res,
          status,
          status === 500
            ? "Não foi possível anexar o PDF de prontuário."
            : String(
                (error as any)?.message ??
                  "Não foi possível anexar o PDF de prontuário."
              )
        );
      }
    }
  );
}
