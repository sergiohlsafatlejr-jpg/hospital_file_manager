import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { executarAtendimentosHopDiarioPorTaskUid } from "./atendimentosHopDiarioService";

/**
 * Handler para POST /api/scheduled/atendimentos-hop-diario (registro pelo
 * coordenador). Não lê req.body: unidade, lote e task UID enviados pelo corpo
 * são forjáveis. A única chave de resolução é taskUid da identidade Heartbeat.
 */
export async function atendimentosHopDiarioCallback(req: Request, res: Response): Promise<void> {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ codigo: "CRON_ONLY" });
      return;
    }
    taskUid = user.taskUid;
    await executarAtendimentosHopDiarioPorTaskUid(taskUid);
    // Saídas operacionais são 2xx para impedir retry de publicação ambígua.
    // Nunca retornamos unidade, lote, contagens, fingerprint ou detalhes de SQL.
    res.status(200).json({});
  } catch {
    // Falha antes da reserva pode receber retry da plataforma; nenhum detalhe de
    // driver, token, dado clínico ou configuração sai na resposta.
    res.status(500).json({
      codigo: "SNAPSHOT_INDISPONIVEL",
      ...(taskUid ? { taskUid } : {}),
    });
  }
}
