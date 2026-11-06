export type DestinoContaFabrica = {
  estabelecimentoId: number;
  arquivoId: number;
  numeroConta: string;
  numeroLote: string;
  competencia: string;
  fabricaContaId: number;
};

export function caminhoContaFabricaImportada(destino: DestinoContaFabrica): string {
  const params = new URLSearchParams({
    numeroConta: destino.numeroConta,
    origem: "XML",
    sourceHospitalId: String(destino.estabelecimentoId),
    estabelecimentoId: String(destino.estabelecimentoId),
    arquivoId: String(destino.arquivoId),
    numeroLote: destino.numeroLote,
    competencia: destino.competencia,
    fabricaContaId: String(destino.fabricaContaId),
  });
  return `/conta-convenio-detalhes?${params.toString()}`;
}

export function caminhoContaFabricaBancoCliente(destino: {
  estabelecimentoId: number;
  numeroConta: string;
  fabricaContaId: number;
  resumoId?: number | null;
}): string {
  const params = new URLSearchParams({
    numeroConta: destino.numeroConta,
    origem: "BANCO_CLIENTE",
    sourceHospitalId: String(destino.estabelecimentoId),
    estabelecimentoId: String(destino.estabelecimentoId),
    fabricaContaId: String(destino.fabricaContaId),
  });
  if (destino.resumoId && Number.isSafeInteger(destino.resumoId) && destino.resumoId > 0) {
    params.set("resumoId", String(destino.resumoId));
  }
  return `/conta-convenio-detalhes?${params.toString()}`;
}
