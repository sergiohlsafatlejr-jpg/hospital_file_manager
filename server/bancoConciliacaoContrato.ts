import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { dataCivilPiloto } from "./hupConciliacaoPilotoCompare";

const Exato = Decimal.clone({ precision: 80 });
export const BANCO_HUP = 1260036;
export type BancoItemFaturado = {
  id: number; loteId: number; estabelecimentoId: number; convenioId: number;
  competencia: string; origemRegistroId: string; conta: string; guiaPrestador: string;
  guiaOperadora: string | null; codigoTuss: string; dataItem: string; receber: string;
  quantidade: string; valorFaturado: string;
};
export type BancoEventoRetorno = {
  id: number; arquivoId: number; estabelecimentoId: number; convenioId: number;
  arquivoProcessado: boolean; guia: string; codigoTuss: string; dataItem: string | null;
  codigoPrestador: string | null; loteRetorno: string | null; protocoloRetorno: string | null;
  dataPagamento: string | null; valorPago: string | null; valorGlosa: string | null;
  codigoGlosa: string | null;
};
export type BancoConfirmacao = {
  faturadoItemId: number; demonstrativoId: number; demonstrativoArquivoId: number;
  estabelecimentoId: number; convenioId: number; eventoFingerprint: string;
  codigoPrestador: string; loteRetorno: string; protocoloRetorno: string;
  dataPagamento: string | null; valorPago: string; valorGlosa: string;
  codigoGlosa: string | null; diferenca: string; metodo: "guia_tuss_data_revisado";
  confirmadoPor: number;
};
function exigir(condicao: unknown, codigo: string): asserts condicao {
  if (!condicao) throw new Error(codigo);
}
function id(value: number) { return Number.isSafeInteger(value) && value > 0; }
function identificador(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !/^0+$/.test(value);
}
function moeda(value: string | null, campo: string) {
  exigir(typeof value === "string" && /^\d+(?:\.\d{1,4})?$/.test(value), `VALOR_${campo}_NAO_INFORMADO_OU_INVALIDO`);
  const n = new Exato(value);
  exigir(n.isFinite() && n.lt("10000000000000000"), `VALOR_${campo}_FORA_DO_CONTRATO`);
  return n;
}
function assinaturaEvento(e: BancoEventoRetorno) {
  // Não elimina repetições: é guarda adicional contra pagamento duplicado entre arquivos.
  return JSON.stringify([e.estabelecimentoId,e.convenioId,e.guia,e.codigoTuss,e.dataItem,e.dataPagamento,
    e.codigoPrestador,e.loteRetorno,e.protocoloRetorno,
    e.valorPago == null ? null : moeda(e.valorPago,"PAGO").toFixed(4),
    e.valorGlosa == null ? null : moeda(e.valorGlosa,"GLOSA").toFixed(4), e.codigoGlosa]);
}
function combina(i: BancoItemFaturado, e: BancoEventoRetorno) {
  return i.estabelecimentoId === e.estabelecimentoId && i.convenioId === e.convenioId
    && (i.guiaPrestador === e.guia || (identificador(i.guiaOperadora) && i.guiaOperadora === e.guia))
    && i.codigoTuss === e.codigoTuss && i.dataItem === e.dataItem;
}
/** Apenas cálculo/validação. O chamador deve carregar o universo completo numa
 * transação, validar mapeamento/prestador, controlar concorrência e persistir.
 * Nunca usar a página visível como universo de itens/eventos.
 */
export function prepararConfirmacaoBanco(params: {
  item: BancoItemFaturado; evento: BancoEventoRetorno; itensDoRecorte: readonly BancoItemFaturado[];
  eventosDoRecorte: readonly BancoEventoRetorno[]; itensJaVinculados: readonly number[];
  eventosJaVinculados: readonly number[]; prestadoresAutorizados: readonly string[];
  confirmadoPor: number; revisado: boolean;
}): BancoConfirmacao {
  const { item:i, evento:e } = params;
  exigir(params.revisado === true && id(params.confirmadoPor),"REVISAO_EXPLICITA_OBRIGATORIA");
  exigir(i.estabelecimentoId === BANCO_HUP && e.estabelecimentoId === BANCO_HUP,"UNIDADE_FORA_DO_PILOTO");
  exigir(id(i.id) && id(i.loteId) && id(e.id) && id(e.arquivoId) && id(i.convenioId),"IDENTIDADE_INVALIDA");
  exigir(i.convenioId === e.convenioId,"CONVENIO_DIVERGENTE");
  exigir(/^\d{4}\/(0[1-9]|1[0-2])$/.test(i.competencia),"COMPETENCIA_INVALIDA");
  exigir(i.origemRegistroId.startsWith("hop_hup:") && i.receber === "S","ITEM_NAO_HOSPITALAR_OU_FONTE_INVALIDA");
  exigir(identificador(i.conta) && identificador(i.guiaPrestador) && identificador(i.codigoTuss),"ITEM_SEM_IDENTIFICADORES");
  exigir(dataCivilPiloto(i.dataItem) && dataCivilPiloto(e.dataItem),"DATA_ITEM_SEM_PROVA");
  exigir(e.arquivoProcessado === true,"ARQUIVO_NAO_PROCESSADO");
  exigir(combina(i,e),"ITEM_EVENTO_DIVERGENTES");
  exigir(identificador(e.codigoPrestador) && params.prestadoresAutorizados.includes(e.codigoPrestador),"PRESTADOR_NAO_AUTORIZADO");
  exigir(identificador(e.loteRetorno) && identificador(e.protocoloRetorno),"LOTE_PROTOCOLO_AUSENTES");
  exigir(e.dataPagamento === null || dataCivilPiloto(e.dataPagamento),"DATA_PAGAMENTO_INVALIDA");
  exigir(!params.itensJaVinculados.includes(i.id) && !params.eventosJaVinculados.includes(e.id),"VINCULO_JA_EXISTENTE");
  // A inclusão do próprio par no universo é obrigatória; dados não podem ser trocados.
  exigir(params.itensDoRecorte.filter(x=>x.id===i.id && JSON.stringify(x)===JSON.stringify(i)).length===1,"ITEM_FORA_DO_UNIVERSO");
  exigir(params.eventosDoRecorte.filter(x=>x.id===e.id && JSON.stringify(x)===JSON.stringify(e)).length===1,"EVENTO_FORA_DO_UNIVERSO");
  exigir(params.itensDoRecorte.filter(x=>combina(x,e)).length===1,"EVENTO_COMPARTILHADO");
  exigir(params.eventosDoRecorte.filter(x=>combina(i,x)).length===1,"MULTIPLOS_EVENTOS");
  const signature = assinaturaEvento(e);
  exigir(params.eventosDoRecorte.filter(x=>assinaturaEvento(x)===signature).length===1,"EVENTO_REPETIDO");
  const faturado=moeda(i.valorFaturado,"FATURADO"), pago=moeda(e.valorPago,"PAGO"), glosa=moeda(e.valorGlosa,"GLOSA");
  exigir(moeda(i.quantidade,"QUANTIDADE").gt(0),"QUANTIDADE_INVALIDA");
  exigir(!glosa.gt(0) || (typeof e.codigoGlosa === "string" && /^\d+$/.test(e.codigoGlosa) && !/^0+$/.test(e.codigoGlosa)),"CODIGO_GLOSA_OBRIGATORIO");
  return {
    faturadoItemId:i.id, demonstrativoId:e.id, demonstrativoArquivoId:e.arquivoId,
    estabelecimentoId:i.estabelecimentoId, convenioId:i.convenioId,
    eventoFingerprint:createHash("sha256").update(JSON.stringify(e)).digest("hex"),
    codigoPrestador:e.codigoPrestador, loteRetorno:e.loteRetorno, protocoloRetorno:e.protocoloRetorno,
    dataPagamento:e.dataPagamento, valorPago:pago.toFixed(4), valorGlosa:glosa.toFixed(4),
    codigoGlosa:glosa.gt(0)?e.codigoGlosa:null, diferenca:faturado.minus(pago).minus(glosa).toFixed(4),
    metodo:"guia_tuss_data_revisado", confirmadoPor:params.confirmadoPor,
  };
}

/** Prévia de lotes: separa unidade/convênio/prestador/lote/protocolo. Não gera XML. */
export function agruparLotesXmlBanco(vinculos: readonly BancoConfirmacao[]) {
  const ids = new Set<number>(); const eventos = new Set<number>();
  const grupos = new Map<string,BancoConfirmacao[]>();
  for (const v of vinculos) {
    exigir(v.estabelecimentoId===BANCO_HUP && id(v.convenioId),"UNIDADE_OU_CONVENIO_INVALIDOS");
    exigir(!ids.has(v.faturadoItemId) && !eventos.has(v.demonstrativoId),"VINCULO_DUPLICADO_NO_XML");
    exigir(id(v.confirmadoPor) && v.metodo==="guia_tuss_data_revisado","VINCULO_NAO_CONFIRMADO");
    exigir(identificador(v.codigoPrestador) && identificador(v.loteRetorno) && identificador(v.protocoloRetorno),"ESCOPO_XML_INCOMPLETO");
    ids.add(v.faturadoItemId); eventos.add(v.demonstrativoId);
    const chave=JSON.stringify([v.estabelecimentoId,v.convenioId,v.codigoPrestador,v.loteRetorno,v.protocoloRetorno]);
    const grupo=grupos.get(chave)??[];grupo.push(v);grupos.set(chave,grupo);
  }
  return [...grupos.values()].map(items=>({ estabelecimentoId:items[0].estabelecimentoId,
    convenioId:items[0].convenioId,codigoPrestador:items[0].codigoPrestador,loteRetorno:items[0].loteRetorno,
    protocoloRetorno:items[0].protocoloRetorno,totalItens:items.length,vinculos:items }));
}
