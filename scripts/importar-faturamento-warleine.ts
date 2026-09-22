import { access, readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { storagePut } from "../server/storage";
import { encryptWarleineFile } from "../server/warleineFileVault";
import {
  hashWarleineFile,
  reserveWarleineImportJob,
} from "../server/warleineFaturamentoImportService";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const filePath = arg("--arquivo");
const estabelecimentoId = Number(arg("--estabelecimento"));
const userId = Number(arg("--usuario") || "1");
const configIdRaw = arg("--config");
const replaceCompetencies = process.argv.includes("--substituir-competencias");

if (!filePath || !Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0 || !Number.isInteger(userId) || userId <= 0) {
  console.error("Uso: pnpm tsx scripts/importar-faturamento-warleine.ts --arquivo /caminho/arquivo.xlsx --estabelecimento ID [--usuario ID] [--config ID] --substituir-competencias");
  process.exit(1);
}
if (!replaceCompetencies) {
  console.error("Informe --substituir-competencias confirmando que o arquivo representa o snapshot completo das competências nele contidas.");
  process.exit(1);
}

await access(filePath);
const metadata = await stat(filePath);
const fileHash = await hashWarleineFile(filePath);
const storageKey = `warleine-faturamento/${estabelecimentoId}/${fileHash}.bin`;
const encryptedFile = encryptWarleineFile(await readFile(filePath));
await storagePut(storageKey, encryptedFile, "application/octet-stream");
const result = await reserveWarleineImportJob({
  estabelecimentoId,
  userId,
  configId: configIdRaw ? Number(configIdRaw) : null,
  fileName: basename(filePath),
  fileHash,
  fileSize: metadata.size,
  storageKey,
});

console.log(JSON.stringify({
  ...result,
  fileHash,
  processamento: result.status === "publicado" ? "concluido" : "enfileirado",
  mensagem: result.status === "publicado"
    ? "O arquivo já estava publicado; o lote existente foi reutilizado."
    : "Arquivo criptografado, persistido e enfileirado para o worker com lease.",
}, null, 2));
process.exit(0);
