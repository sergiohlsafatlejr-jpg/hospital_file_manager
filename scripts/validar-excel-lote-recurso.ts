import { getRecursosLoteParaExportacao } from "../server/db";

const loteId = Number(process.argv[2]);

if (!Number.isInteger(loteId) || loteId <= 0) {
  console.error("Uso: pnpm tsx scripts/validar-excel-lote-recurso.ts <loteId>");
  process.exit(1);
}

try {
  const resultado = await getRecursosLoteParaExportacao(loteId);
  if (!resultado) {
    console.error(`Lote ${loteId} não encontrado.`);
    process.exit(2);
  }

  console.log(JSON.stringify({
    loteId: resultado.lote.id,
    numeroLote: resultado.lote.numeroLote,
    convenio: resultado.lote.convenioNome,
    totalItens: resultado.totais.totalItens,
    totalValorRecursado: resultado.totais.totalValorRecursado,
    primeiraGuia: resultado.recursos[0]?.guia || null,
    primeiroCodigo: resultado.recursos[0]?.codigoServico || null,
  }, null, 2));
} catch (error) {
  console.error("Falha ao validar a planilha do lote:", error);
  process.exitCode = 1;
} finally {
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}
