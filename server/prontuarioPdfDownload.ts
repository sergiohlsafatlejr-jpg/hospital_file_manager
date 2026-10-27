import type { Express, Request, Response } from "express";
import { Readable } from "node:stream";
import { prontuarioPdfDownloadSchema } from "../shared/prontuarioPdf";
import { sdk } from "./_core/sdk";
import { prontuarioPdfBaixar } from "./prontuarioPdfService";

function inteiro(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function texto(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nomeDownloadSeguro(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .trim();
  return base && /\.pdf$/i.test(base) ? base : "prontuario.pdf";
}

function erroHttp(res: Response, status: number, message: string): void {
  res.status(status).type("text/plain; charset=utf-8").send(message);
}

/**
 * O storage só oferece URL assinada por objeto, portanto AES-GCM valida o objeto
 * inteiro (máximo de 5 MB) antes de expor bytes. Após a autenticação do envelope,
 * a resposta ao navegador é encaminhada por stream e sempre como attachment.
 */
export function registrarDownloadProntuarioPdf(app: Express): void {
  app.get(
    "/api/prontuario-pdf/download",
    async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (user.isCron || user.id <= 0)
          return erroHttp(res, 403, "Acesso negado.");
        const parsed = prontuarioPdfDownloadSchema.safeParse({
          estabelecimentoId: inteiro(req.query.estabelecimentoId),
          convenioId: inteiro(req.query.convenioId),
          arquivoHospitalId: inteiro(req.query.arquivoHospitalId),
          numeroConta: texto(req.query.numeroConta),
          numeroLote: texto(req.query.numeroLote) ?? "",
          competencia: texto(req.query.competencia) ?? "",
          anexoId: inteiro(req.query.anexoId),
        });
        if (!parsed.success)
          return erroHttp(res, 400, "Solicitação de download inválida.");
        const arquivo = await prontuarioPdfBaixar(parsed.data, user.id);
        const nome = nomeDownloadSeguro(arquivo.nomeArquivo).replace(/"/g, "_");
        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", String(arquivo.conteudo.length));
        res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
        res.setHeader("Cache-Control", "no-store, private, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        Readable.from([arquivo.conteudo]).pipe(res);
      } catch (error) {
        if (res.headersSent) {
          res.destroy(error instanceof Error ? error : undefined);
          return;
        }
        const code = (error as any)?.code;
        const status =
          code === "UNAUTHORIZED"
            ? 401
            : code === "FORBIDDEN"
              ? 403
              : code === "NOT_FOUND"
                ? 404
                : code === "BAD_REQUEST"
                  ? 400
                  : 500;
        erroHttp(
          res,
          status,
          status === 500
            ? "Não foi possível baixar o PDF de prontuário."
            : String((error as any)?.message ?? "Acesso negado.")
        );
      }
    }
  );
}
