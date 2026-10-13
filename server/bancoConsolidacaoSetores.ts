import Decimal from "decimal.js";
import { dataCivilPiloto } from "./hupConciliacaoPilotoCompare";
const D=Decimal.clone({precision:80});
export type ItemSetorBanco={id:number;estabelecimentoId:number;convenioId:number;competencia:string;conta:string;guia:string;codigoTuss:string;dataItem:string;tipoItem:string;setor:string;receber:string;quantidade:string;valorFaturado:string};
export type EventoConsolidadoBanco={id:number;estabelecimentoId:number;convenioId:number;guia:string;codigoTuss:string;dataItem:string|null;quantidade:string|null;valorInformado:string|null;valorPago:string|null;valorGlosa:string|null};
function n(v:string|null){if(v==null||!/^\d+(?:\.\d{1,4})?$/.test(v))return null;const d=new D(v);return d.isFinite()?d:null;}
/** Somente prévia. Nunca atribui o pago integral do retorno a cada setor.
 * Data e quantidade devem ser informadas e coincidentes. Guias de contas,
 * competências ou tipos distintos são bloqueadas, não misturadas.
 */
export function avaliarConsolidacaoSetores(itens:readonly ItemSetorBanco[],eventos:readonly EventoConsolidadoBanco[]){
 const grupos=new Map<string,ItemSetorBanco[]>();
 for(const i of itens){const key=JSON.stringify([i.estabelecimentoId,i.convenioId,i.guia,i.codigoTuss,i.dataItem]);const g=grupos.get(key)??[];g.push(i);grupos.set(key,g);}
 const idDuplicado=new Set<number>();const vistos=new Set<number>();for(const i of itens){if(vistos.has(i.id))idDuplicado.add(i.id);vistos.add(i.id);}
 return [...grupos.values()].map(xs=>{
  const a=xs[0],es=eventos.filter(e=>e.estabelecimentoId===a.estabelecimentoId&&e.convenioId===a.convenioId&&e.guia===a.guia&&e.codigoTuss===a.codigoTuss&&e.dataItem===a.dataItem);
  const bloqueios:string[]=[];
  if(!dataCivilPiloto(a.dataItem)||!a.guia||/^0+$/.test(a.guia)||!a.codigoTuss||/^0+$/.test(a.codigoTuss))bloqueios.push("identificadores_ou_data_invalidos");
  if(xs.some(i=>i.receber!=="S"))bloqueios.push("modalidade_nao_hospitalar");
  if(new Set(xs.map(i=>i.conta)).size!==1||new Set(xs.map(i=>i.competencia)).size!==1||new Set(xs.map(i=>i.tipoItem)).size!==1)bloqueios.push("contas_competencias_ou_tipos_diferentes");
  if(xs.some(i=>idDuplicado.has(i.id)))bloqueios.push("item_duplicado");
  if(es.length!==1)bloqueios.push(es.length?"multiplos_retornos":"sem_retorno_exato");
  let q=new D(0),v=new D(0);for(const i of xs){const qi=n(i.quantidade),vi=n(i.valorFaturado);if(!qi||!qi.gt(0)||!vi)bloqueios.push("faturado_invalido");else{q=q.plus(qi);v=v.plus(vi);}}
  const e=es.length===1?es[0]:null,eq=e?n(e.quantidade):null,ev=e?n(e.valorInformado):null,ep=e?n(e.valorPago):null,eg=e?n(e.valorGlosa):null;
  if(e&&(!eq||!eq.eq(q)))bloqueios.push("quantidade_divergente_ou_ausente");
  if(e&&(!ev||!ev.eq(v)))bloqueios.push("faturado_informado_divergente_ou_ausente");
  if(e&&(ep==null||eg==null))bloqueios.push("pago_ou_glosa_ausentes");
  const elegivel=bloqueios.length===0;
  return {itemIds:xs.map(i=>i.id),totalItens:xs.length,setores:[...new Set(xs.map(i=>i.setor))],quantidade:q.toFixed(4),valorFaturado:v.toFixed(4),
   eventoId:e?.id??null,status:elegivel?"consolidado_para_revisao" as const:"bloqueado" as const,bloqueios:[...new Set(bloqueios)],
   valorPagoConsolidado:elegivel&&ep!=null?ep.toFixed(4):null,valorGlosaConsolidada:elegivel&&eg!=null?eg.toFixed(4):null,
   diferencaConsolidada:elegivel&&ep!=null&&eg!=null?v.minus(ep).minus(eg).toFixed(4):null,
   valoresPorSetor:xs.map(i=>({itemId:i.id,setor:i.setor,quantidade:i.quantidade,valorFaturado:i.valorFaturado})),
   somenteLeitura:true as const,rateioPagamento:null};
 });
}
