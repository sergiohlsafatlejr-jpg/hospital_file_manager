import { TRPCError } from "@trpc/server";
import { getRawPool } from "./db";

export const INTERNAL_FILE_PROCESSING_TIMEOUT_MS = 180_000;
export const INTERNAL_DISPATCH_REVIEW_MARKER = "internal-dispatch: reconciliation-required; automatic-retry-blocked";

type InternalProcessingEnv = {
  INTERNAL_PROCESSING_SECRET_KEY?: string;
  JWT_SECRET?: string;
  PORT?: string;
};

function currentInternalProcessingEnv(): InternalProcessingEnv {
  return {
    INTERNAL_PROCESSING_SECRET_KEY: process.env.INTERNAL_PROCESSING_SECRET_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    PORT: process.env.PORT,
  };
}

/** Uma chave dedicada configurada nunca pode ser contornada pelo JWT legado. */
export function resolveInternalProcessingSecret(
  env: InternalProcessingEnv = currentInternalProcessingEnv()
): string {
  const dedicated = env.INTERNAL_PROCESSING_SECRET_KEY;
  if (dedicated !== undefined) {
    if (/^[a-fA-F0-9]{64}$/.test(dedicated)) return dedicated;
  } else if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    return env.JWT_SECRET;
  }
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O processamento interno não está configurado." });
}

/** Verificar antes de qualquer upload, registro, progresso ou tentativa de retry. */
export function assertInternalProcessingReady(
  env: InternalProcessingEnv = currentInternalProcessingEnv()
): void {
  resolveInternalProcessingSecret(env);
}

export type InternalFileProcessingInput = {
  arquivoId: number;
  skipContaConvenioSync?: boolean;
  limparDadosAnteriores?: boolean;
};

type DispatchOptions = {
  env?: InternalProcessingEnv;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

/** Não afirmar erro/conclusão por falha de transporte: o worker pode ter commitado. */
export class InternalFileDispatchUncertainError extends Error {
  constructor() {
    super("Resposta do processamento não confirmada. Consulte o estado do arquivo antes de uma nova tentativa.");
    this.name = "InternalFileDispatchUncertainError";
  }
}

/**
 * O worker é o único dono do estado terminal. A marca em process_logs existente
 * precede o HTTP: mesmo se a resposta se perder ou o emissor cair, o watchdog não
 * repete o processamento financeiro. A marca não apaga logs nem muda o arquivo.
 * Sem identidade persistida de tentativa não há recuperação automática segura.
 * Callers em background contêm a rejeição, mas não a convertem em status erro.
 */
export async function dispatchInternalFileProcessing(
  input: InternalFileProcessingInput,
  options: DispatchOptions = {}
): Promise<void> {
  const env = options.env ?? currentInternalProcessingEnv();
  const secret = resolveInternalProcessingSecret(env);
  if (!Number.isSafeInteger(input.arquivoId) || input.arquivoId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido para processamento." });
  }
  try {
    const pool = await getRawPool();
    if (!pool) throw new Error("unavailable");
    await pool.execute(
      "INSERT INTO process_logs (arquivo_id, level, message) VALUES (?, 'info', ?)",
      [input.arquivoId, INTERNAL_DISPATCH_REVIEW_MARKER]
    );
  } catch {
    // Sem evidência durável não emitir HTTP nem autorizar retry implícito.
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível reservar a evidência do processamento. Consulte o estado do arquivo." });
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new InternalFileDispatchUncertainError());
      }, options.timeoutMs ?? INTERNAL_FILE_PROCESSING_TIMEOUT_MS);
    });
    const response = await Promise.race([
      (options.fetch ?? globalThis.fetch)(
        `http://localhost:${env.PORT || "3000"}/api/internal/process-file`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            arquivoId: input.arquivoId,
            secret,
            skipContaConvenioSync: input.skipContaConvenioSync,
            limparDadosAnteriores: input.limparDadosAnteriores,
          }),
          signal: controller.signal,
        }
      ),
      deadline,
    ]);
    // Não consumir body privado. HTTP 4xx/5xx não autoriza status por ID;
    // outra tentativa ou o worker original pode estar ativa/concluída.
    if (!response.ok) throw new InternalFileDispatchUncertainError();
    await response.body?.cancel();
  } catch {
    controller.abort();
    console.warn("[InternalFileDispatch] Resultado não confirmado; reconciliação explícita necessária, sem retry automático.");
    throw new InternalFileDispatchUncertainError();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
