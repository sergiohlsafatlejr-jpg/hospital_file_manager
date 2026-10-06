import { mapearHopUrologico, validarSnapshotHop, type HopUrologicoRow } from './hopUrologicoMap';

/** Somente novos. Os existentes, mesmo alterados, e os ausentes não são modificados. */
export function classificarNovosHop(
  fonte: HopUrologicoRow[],
  idsDestino: readonly string[],
) {
  const { total, sha256 } = validarSnapshotHop(fonte);
  const existentes = new Set(idsDestino);
  if (existentes.size !== idsDestino.length) {
    throw new Error('Chaves duplicadas no destino HUP; publicação suspensa.');
  }
  const novas = fonte.map(mapearHopUrologico).filter(r => !existentes.has(r.origemId));
  const idsFonte = new Set(fonte.map(r => String(r.numatend).trim()));
  return {
    total,
    sha256,
    novos: novas,
    jaExistentes: total - novas.length,
    antigosAusentesNaFonte: idsDestino.filter(id => !idsFonte.has(id)).length,
  };
}

export function conferirManifestoIncremental(params: {
  total: number;
  sha256: string;
  novos: number;
  esperadoTotal: number;
  esperadoSha256: string;
  esperadoNovos: number;
  jobsLegadosAtivos: number;
}) {
  if (params.total !== params.esperadoTotal || params.sha256 !== params.esperadoSha256 ||
      params.novos !== params.esperadoNovos) {
    throw new Error('Snapshot ou total de novos diverge do manifesto; nada será inserido.');
  }
  if (params.jobsLegadosAtivos !== 0) {
    throw new Error('Job Warleine ativo no Urológico; nada será inserido.');
  }
}
