export const HUP_HOP_ESTABELECIMENTO_ID = 1260036;

/** O scheduler legado escreve atendimentos independentemente de sistema/tipoDados.
 * Durante o piloto, nenhum disparo desse integrador deve atuar no Urológico.
 */
export function ehIntegracaoLegadaHup(config: { estabelecimentoId: number }): boolean {
  return config.estabelecimentoId === HUP_HOP_ESTABELECIMENTO_ID;
}
