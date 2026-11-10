import "dotenv/config";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path, { basename } from "node:path";
import { storagePut } from "../server/storage";
import { encryptWarleineFile } from "../server/warleineFileVault";
import {
  hashWarleineFile,
  reserveWarleineImportJob,
} from "../server/warleineFaturamentoImportService";
import { processNextWarleineImportJob } from "../server/warleineFaturamentoWorker";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const filePath = arg("--arquivo");
const estabelecimentoId = Number(arg("--estabelecimento"));
const userId = Number(arg("--usuario") || "1");
const configIdRaw = arg("--config");
const replaceCompetencies = process.argv.includes("--substituir-competencias");
const processNow = process.argv.includes("--processar-agora");

if (!filePath || !Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0 || !Number.isInteger(userId) || userId <= 0) {
  console.error("Uso: pnpm tsx scripts/importar-faturamento-warleine.ts --arquivo /caminho/arquivo.(xlsx|csv|zip) --estabelecimento ID [--usuario ID] [--config ID] --substituir-competencias [--processar-agora]");
  process.exit(1);
}
if (!replaceCompetencies) {
  console.error("Informe --substituir-competencias confirmando que o arquivo representa o snapshot completo das competências nele contidas.");
  process.exit(1);
}

await access(filePath);
const metadata = await stat(filePath);
const fileHash = await hashWarleineFile(filePath);
let storageKey = `warleine-faturamento/${estabelecimentoId}/${fileHash}.bin`;
const encryptedFile = encryptWarleineFile(await readFile(filePath));
try {
  await storagePut(storageKey, encryptedFile, "application/octet-stream");
} catch (storageErr) {
  if (process.env.NODE_ENV === "production" && process.env.BUILT_IN_FORGE_API_URL) {
    throw storageErr;
  }
  const localDir = path.join(os.tmpdir(), "portal-safatle-warleine-vault", String(estabelecimentoId));
  await mkdir(localDir, { recursive: true });
  const localVaultPath = path.join(localDir, `${fileHash}.bin`);
  await writeFile(localVaultPath, encryptedFile);
  storageKey = `local:${localVaultPath}`;
}

const result = await reserveWarleineImportJob({
  estabelecimentoId,
  userId,
  configId: configIdRaw ? Number(configIdRaw) : null,
  fileName: basename(filePath),
  fileHash,
  fileSize: metadata.size,
  storageKey,
});

if (processNow && result.status !== "publicado") {
  await processNextWarleineImportJob();
}

console.log(JSON.stringify({
  ...result,
  fileHash,
  processamento: result.status === "publicado" || processNow ? "concluido" : "enfileirado",
  mensagem: result.status === "publicado"
    ? "O arquivo já estava publicado; o lote existente foi reutilizado."
    : processNow
      ? "Arquivo criptografado, processado e publicado com sucesso."
      : "Arquivo criptografado, persistido e enfileirado para o worker com lease.",
}, null, 2));
process.exit(0);
