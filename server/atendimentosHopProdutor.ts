import { TRPCError } from "@trpc/server";
import { Router, type Request, type Response } from "express";
import {
  concluirLoteAtendimentosHopProdutor,
  falharLoteAtendimentosHopProdutor,
  iniciarLoteAtendimentosHopProdutor,
} from "./atendimentosHopDiarioService";

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? "");
  return match?.[1] ?? null;
}
function statusFor(error: unknown): number {
  if (!(error instanceof TRPCError)) return 500;
  if (error.code === "UNAUTHORIZED") return 401;
  if (error.code === "FORBIDDEN") return 403;
  if (error.code === "NOT_FOUND") return 404;
  if (["BAD_REQUEST", "PRECONDITION_FAILED"].includes(error.code)) return 400;
  if (error.code === "CONFLICT") return 409;
  return 500;
}
function publicCode(error: unknown): string {
  if (error instanceof TRPCError) {
    if (error.code === "UNAUTHORIZED") return "PRODUTOR_NAO_AUTORIZADO";
    if (error.code === "BAD_REQUEST") return "SINAL_INVALIDO";
    if (error.code === "NOT_FOUND") return "LOTE_NAO_ENCONTRADO";
    if (error.code === "CONFLICT") return "OPERACAO_REQUER_CONFERENCIA";
  }
  return "PRODUTOR_INDISPONIVEL";
}

/**
 * REST separado de cron e tRPC. O produtor só anuncia início/conclusão e nunca
 * escreve linhas na staging via API. Unidade e tabela são resolvidas da hash da
 * credencial de 256 bits, portanto body não pode escolher destino algum.
 */
export async function atendimentosHopProdutorIniciar(req: Request, res: Response): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ codigo: "PRODUTOR_NAO_AUTORIZADO" });
    return;
  }
  try {
    const result = await iniciarLoteAtendimentosHopProdutor(token, req.body);
    res.status(200).json({ estado: result.estado });
  } catch (error) {
    res.status(statusFor(error)).json({ codigo: publicCode(error) });
  }
}
export async function atendimentosHopProdutorConcluir(req: Request, res: Response): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ codigo: "PRODUTOR_NAO_AUTORIZADO" });
    return;
  }
  try {
    const result = await concluirLoteAtendimentosHopProdutor(token, req.body);
    res.status(200).json({ estado: result.estado });
  } catch (error) {
    res.status(statusFor(error)).json({ codigo: publicCode(error) });
  }
}
export async function atendimentosHopProdutorFalhar(req: Request, res: Response): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ codigo: "PRODUTOR_NAO_AUTORIZADO" });
    return;
  }
  try {
    const result = await falharLoteAtendimentosHopProdutor(token, req.body);
    res.status(200).json({ estado: result.estado });
  } catch (error) {
    res.status(statusFor(error)).json({ codigo: publicCode(error) });
  }
}

/** Montagem explícita, mas não registrada aqui para não alterar _core/index.ts. */
export const atendimentosHopProdutorRouter = Router();
atendimentosHopProdutorRouter.post("/iniciar", atendimentosHopProdutorIniciar);
atendimentosHopProdutorRouter.post("/concluir", atendimentosHopProdutorConcluir);
atendimentosHopProdutorRouter.post("/falhar", atendimentosHopProdutorFalhar);
