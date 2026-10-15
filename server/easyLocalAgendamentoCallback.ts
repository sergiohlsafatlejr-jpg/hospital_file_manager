import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { executarEasyLocalAgendamentoPorTaskUid } from "./easyLocalAgendamentoService";

/**
 * Handler a ser montado pelo integrador em POST /api/scheduled/easylocal-importar.
 * Não lê req.body: unidade/leitura no payload são dados forjáveis e nunca entram
 * na resolução do agendamento. O taskUid vem exclusivamente da autenticação SDK.
 */
export async function easyLocalAgendamentoHandler(req: Request, res: Response): Promise<void> {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ codigo: "CRON_ONLY" });
      return;
    }
    taskUid = user.taskUid;
    const outcome = await executarEasyLocalAgendamentoPorTaskUid(taskUid);
    // 2xx para todas as saídas idempotentes/operacionais: Forge não deve tentar
    // novamente um import cujo resultado pode ser desconhecido. Nenhuma chave,
    // unidade, leitura, revisão ou estado interno é retornado publicamente.
    if (outcome.counts) {
      res.status(200).json(outcome.counts);
      return;
    }
    res.status(200).json({});
  } catch {
    // Falhas antes de adquirir lease são seguras para retry e recebem 5xx. Não
    // vazar stack, erro SQL, host, SQL ou dados da origem; taskUid é permitido
    // apenas para investigação autenticada da plataforma.
    res.status(500).json({
      codigo: "AGENDAMENTO_INDISPONIVEL",
      ...(taskUid ? { taskUid } : {}),
    });
  }
}
