type MetadadosReenvioXml = {
  estabelecimentoId?: unknown;
  convenioId?: unknown;
  dataReferencia?: unknown;
  dataPagamento?: unknown;
};

function idSeguro(value: unknown): string | null {
  const numero = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(numero) && numero > 0 ? String(numero) : null;
}

function dataSegura(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const data = new Date(value);
    if (!Number.isNaN(data.getTime())) return data.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Monta somente o contexto de formulário para um reenvio integral.
 * Nunca inclui ID de lote, arquivo, hash, URL ou chave de armazenamento.
 */
export function criarUrlReenvioIntegralXml(
  metadados: MetadadosReenvioXml
): string {
  const params = new URLSearchParams({ reenvioLote: "1" });
  const estabelecimentoId = idSeguro(metadados.estabelecimentoId);
  const convenioId = idSeguro(metadados.convenioId);
  const dataReferencia = dataSegura(metadados.dataReferencia);
  const dataPagamento = dataSegura(metadados.dataPagamento);
  if (estabelecimentoId) params.set("estabelecimentoId", estabelecimentoId);
  if (convenioId) params.set("convenioId", convenioId);
  if (dataReferencia) params.set("dataReferencia", dataReferencia);
  if (dataPagamento) params.set("dataPagamento", dataPagamento);
  return `/upload?${params.toString()}`;
}
