import { basename, resolve } from "node:path";
import { importTasyCsvFile } from "../server/tasyCsvImportService";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const file = argument("--arquivo");
  const estabelecimentoId = Number(argument("--estabelecimento"));
  const userId = Number(argument("--usuario"));
  const configRaw = argument("--config");
  const publish = process.argv.includes("--publicar");
  const replaceSnapshot = process.argv.includes("--substituir-snapshot");
  const allowLargeSnapshotReduction = process.argv.includes("--forcar-reducao");
  const forceReprocess = process.argv.includes("--forcar-reprocessamento");

  if (!file || !Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0 || !Number.isInteger(userId) || userId <= 0) {
    throw new Error(
      "Uso: pnpm exec tsx scripts/importar-atendimentos-tasy-csv.ts --arquivo <csv> --estabelecimento <id> --usuario <id> [--config <id>] [--publicar] [--substituir-snapshot] [--forcar-reducao] [--forcar-reprocessamento]",
    );
  }

  const filePath = resolve(file);
  const result = await importTasyCsvFile({
    filePath,
    fileName: basename(filePath),
    estabelecimentoId,
    userId,
    configId: configRaw ? Number(configRaw) : null,
    publish,
    replaceSnapshot,
    allowLargeSnapshotReduction,
    forceReprocess,
    onProgress: (progress) => {
      console.error(
        `[Tasy CSV] fase=${progress.phase} processadas=${progress.processedRows} válidas=${progress.validRows} avisos=${progress.warningRows} rejeitadas=${progress.rejectedRows}`,
      );
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
