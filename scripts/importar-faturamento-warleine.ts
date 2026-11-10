import "dotenv/config";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path, { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { storagePut } from "../server/storage";
import { encryptWarleineFile } from "../server/warleineFileVault";
import {
  hashWarleineFile,
  reserveWarleineImportJob,
} from "../server/warleineFaturamentoImportService";
import {
  getWarleineImportJobStatus,
  processWarleineImportJob,
  type WarleineJobResult,
} from "../server/warleineFaturamentoWorker";

const MAX_FILE_BYTES = 300 * 1024 * 1024;
const USAGE = "Uso: pnpm tsx scripts/importar-faturamento-warleine.ts --arquivo /caminho/arquivo.(xlsx|csv|zip) --estabelecimento ID [--usuario ID] [--config ID] --substituir-competencias [--processar-agora] [--permitir-arquivo-local (somente desenvolvimento)]";

export type WarleineCliOutput = {
  loteId: number | null;
  estabelecimentoId: number | null;
  status: string | null;
  published: boolean;
  processamento: "concluido" | "enfileirado" | "pendente" | "nao_publicado" | "erro";
  mensagem: string;
  reusedExistingLot?: boolean;
  fileHash?: string;
  armazenamento?: "duravel" | "local-nao-duravel";
  workerOutcome?: WarleineJobResult["outcome"];
  errorCode?: string;
};
export type WarleineCliResult = { exitCode: 0 | 1 | 2; output: WarleineCliOutput };

/** Exit 0: accepted async queue or confirmed publication; 2: immediate publication pending; 1: failure. */
export async function runWarleineImportCli(argv: string[] = process.argv.slice(2)): Promise<WarleineCliResult> {
  function arg(name: string): string | undefined {
    const index = argv.indexOf(name);
    const value = index >= 0 ? argv[index + 1] : undefined;
    return value && !value.startsWith("--") ? value : undefined;
  }
  const filePath = arg("--arquivo");
  const estabelecimentoId = Number(arg("--estabelecimento"));
  const userId = Number(arg("--usuario") || "1");
  const configIdRaw = arg("--config");
  const configId = configIdRaw ? Number(configIdRaw) : null;
  const processNow = argv.includes("--processar-agora");
  const allowLocalSource = argv.includes("--permitir-arquivo-local");
  const validEstablishment = Number.isSafeInteger(estabelecimentoId) && estabelecimentoId > 0;
  let output: WarleineCliOutput = {
    loteId: null,
    estabelecimentoId: validEstablishment ? estabelecimentoId : null,
    status: null,
    published: false,
    processamento: "erro",
    mensagem: "Importação Warleine não iniciada.",
  };
  if (!filePath || !validEstablishment || !Number.isSafeInteger(userId) || userId <= 0
    || (argv.includes("--config") && (!configId || !Number.isSafeInteger(configId) || configId <= 0))
    || ![".xlsx", ".csv", ".zip"].includes(extname(filePath).toLowerCase())) {
    return { exitCode: 1, output: { ...output, errorCode: "WARLEINE_INVALID_ARGUMENTS", mensagem: USAGE } };
  }
  if (!argv.includes("--substituir-competencias")) {
    return { exitCode: 1, output: { ...output, errorCode: "WARLEINE_CONFIRMATION_REQUIRED", mensagem: "Informe --substituir-competencias confirmando que o arquivo representa o snapshot completo das competências nele contidas." } };
  }
  let localVaultPath: string | null = null;
  let reserved = false;
  try {
    await access(filePath);
    const metadata = await stat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) throw new Error("Arquivo não admitido.");
    const fileHash = await hashWarleineFile(filePath);
    let storageKey = `warleine-faturamento/${estabelecimentoId}/${fileHash}.bin`;
    const encryptedFile = encryptWarleineFile(await readFile(filePath));
    let armazenamento: "duravel" | "local-nao-duravel" = "duravel";
    try {
      await storagePut(storageKey, encryptedFile, "application/octet-stream");
    } catch {
      // Fail closed in production even if storage configuration is absent or opt-in is supplied.
      if (process.env.NODE_ENV === "production" || !allowLocalSource) throw new Error("Storage durável indisponível.");
      const localDir = path.join(os.tmpdir(), "portal-safatle-warleine-vault", String(estabelecimentoId));
      await mkdir(localDir, { recursive: true, mode: 0o700 });
      // Unique source per command: failed reservations cannot remove a prior job's local source.
      localVaultPath = path.join(localDir, `${fileHash}-${randomUUID()}.bin`);
      await writeFile(localVaultPath, encryptedFile, { mode: 0o600, flag: "wx" });
      storageKey = `local:${localVaultPath}`;
      armazenamento = "local-nao-duravel";
    }
    const reservation = await reserveWarleineImportJob({
      estabelecimentoId,
      userId,
      configId,
      fileName: basename(filePath),
      fileHash,
      fileSize: metadata.size,
      storageKey,
    });
    if (!Number.isSafeInteger(reservation.loteId) || reservation.loteId <= 0) throw new Error("Reserva inválida.");
    reserved = true;
    const scope = { loteId: reservation.loteId, estabelecimentoId };
    output = { ...output, ...scope, reusedExistingLot: reservation.reusedExistingLot, fileHash, armazenamento };
    let processed: WarleineJobResult | null = null;
    if (processNow && reservation.status !== "publicado") {
      processed = await processWarleineImportJob(scope, { allowLocalSource });
    }
    // Fresh scoped state; reservation status, flags and phase=completed alone cannot prove publication.
    const status = await getWarleineImportJobStatus(scope);
    const validWorkerResult = processed && typeof processed === "object"
      && processed.loteId === scope.loteId && processed.estabelecimentoId === scope.estabelecimentoId;
    const confirmedPublication = status === "publicado" && (
      reservation.status === "publicado"
      || (validWorkerResult && processed.published === true && processed.outcome === "published" && processed.durableStatus === "publicado")
    );
    output = { ...output, status, published: Boolean(confirmedPublication), ...(validWorkerResult ? { workerOutcome: processed.outcome } : {}) };
    if (confirmedPublication) {
      return { exitCode: 0, output: { ...output, processamento: "concluido", mensagem: reservation.status === "publicado"
        ? "O lote existente está publicado; estado durável confirmado."
        : "Publicação do lote confirmado no estado durável." } };
    }
    if (status === "erro" || (validWorkerResult && processed.outcome === "error") || status === null) {
      return { exitCode: 1, output: { ...output, processamento: "erro", errorCode: "WARLEINE_NOT_PUBLISHED", mensagem: "Publicação não confirmada; consulte o estado do lote informado." } };
    }
    if (processNow) {
      return { exitCode: 2, output: { ...output, processamento: status === "validado" ? "nao_publicado" : "pendente", mensagem: "Processamento imediato não confirmou publicação. O lote permanece no estado informado." } };
    }
    return { exitCode: 0, output: { ...output, processamento: status === "enfileirado" ? "enfileirado" : "pendente", mensagem: armazenamento === "duravel"
      ? "Arquivo criptografado e persistido; lote aguardando processamento, sem publicação confirmada."
      : "Arquivo local de desenvolvimento, não durável; lote aguardando processamento, sem publicação confirmada." } };
  } catch {
    // Re-read durable state if a reservation exists; never relay SQL, source paths or clinical contents.
    if (reserved && output.loteId) {
      try {
        output.status = await getWarleineImportJobStatus({ loteId: output.loteId, estabelecimentoId });
      } catch {
        output.status = null;
      }
    }
    return { exitCode: 1, output: { ...output, published: false, processamento: "erro", errorCode: "WARLEINE_IMPORT_FAILED", mensagem: "Falha na importação Warleine; publicação não confirmada." } };
  } finally {
    if (localVaultPath && !reserved) await unlink(localVaultPath).catch(() => undefined);
  }
}

// Importable for focused fake-only tests; direct invocation emits a single sanitized JSON result.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runWarleineImportCli();
  console.log(JSON.stringify(result.output, null, 2));
  process.exit(result.exitCode);
}
