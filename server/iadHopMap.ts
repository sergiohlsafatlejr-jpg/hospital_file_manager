import { createHash } from 'node:crypto';
import { mapearHopUrologico, HUP_ESTABELECIMENTO_ID, type HopUrologicoRow } from './hopUrologicoMap';

export type HopIadRow = HopUrologicoRow;
export const IAD_HOP_SOURCE = 'stagion_atendimentos_parados_iad';
export const IAD_HOP_DEST = 'atendimentos_unificados';
export const IAD_HOP_ORIGEM = 'WARLEINE';

/** Reutiliza somente as regras puras do layout Hop, sem acessar o fluxo HUP. */
export function mapearHopIad(linha: HopIadRow, estabelecimentoId: number) {
  if (!Number.isSafeInteger(estabelecimentoId) || estabelecimentoId <= 0 ||
      estabelecimentoId === HUP_ESTABELECIMENTO_ID) {
    throw new Error('Estabelecimento IAD inválido; publicação suspensa.');
  }
  if (String(linha.Estabelecimentos_id ?? '').trim() !== String(estabelecimentoId)) {
    throw new Error('Linha fora do estabelecimento IAD explicitamente escolhido.');
  }
  // Os campos brutos têm o mesmo contrato físico; a guarda real da unidade ocorre acima.
  // O ID substituído aqui é exclusivamente um adaptador para o validador puro preexistente.
  const validado = mapearHopUrologico({
    ...linha,
    Estabelecimentos_id: String(HUP_ESTABELECIMENTO_ID),
  });
  if (validado.data_saida && validado.data_entrada && validado.data_saida < validado.data_entrada) {
    throw new Error('Saída IAD anterior à entrada; publicação suspensa.');
  }
  return { ...validado, estabelecimentoId, origemSistema: IAD_HOP_ORIGEM } as const;
}

export function validarSnapshotIad(linhas: HopIadRow[], estabelecimentoId: number) {
  if (!linhas.length || linhas.length > 100_000) {
    throw new Error('Snapshot IAD vazio ou acima do limite manual.');
  }
  const ids = new Set<string>();
  const digest = createHash('sha256');
  for (const linha of [...linhas].sort((a, b) => {
    const x = String(a.numatend ?? '').trim();
    const y = String(b.numatend ?? '').trim();
    return x.length === y.length ? x.localeCompare(y) : x.length - y.length;
  })) {
    const mapped = mapearHopIad(linha, estabelecimentoId);
    if (ids.has(mapped.origemId)) throw new Error('Atendimento IAD repetido na staging.');
    ids.add(mapped.origemId);
    digest.update(JSON.stringify(mapped));
    digest.update('\n');
  }
  return { total: ids.size, sha256: digest.digest('hex') };
}

export function validarPrimeiraPublicacaoIad(params: {
  estabelecimentoId: number;
  total: number;
  sha256: string;
  esperadoTotal: number;
  esperadoSha256: string;
  destinoExistente: number;
  integradoresAtivos: number;
}) {
  if (!Number.isSafeInteger(params.estabelecimentoId) || params.estabelecimentoId <= 0 ||
      params.estabelecimentoId === HUP_ESTABELECIMENTO_ID) {
    throw new Error('Estabelecimento IAD inválido.');
  }
  if (!Number.isSafeInteger(params.esperadoTotal) || params.esperadoTotal <= 0 ||
      !/^[a-f0-9]{64}$/.test(params.esperadoSha256) ||
      params.total !== params.esperadoTotal || params.sha256 !== params.esperadoSha256) {
    throw new Error('Manifesto IAD divergente; nada será publicado.');
  }
  if (params.destinoExistente !== 0) {
    throw new Error('Primeira publicação exige estabelecimento IAD vazio no destino.');
  }
  if (params.integradoresAtivos !== 0) {
    throw new Error('Integrador ativo no IAD; publicação suspensa.');
  }
}
