import { createHash } from "node:crypto";
import { avaliarConsolidacaoSetores, type ItemSetorBanco, type EventoConsolidadoBanco } from "./bancoConsolidacaoSetores";
import { prepararConfirmacaoBanco, type BancoItemFaturado, type BancoEventoRetorno } from "./bancoConciliacaoContrato";
export type GrupoConfirmadoBanco = {
  estabelecimentoId:number;convenioId:number;loteFaturadoId:number;grupoFingerprint:string;
  itemIds:number[];totalItens:number;quantidadeFaturada:string;valorFaturadoGrupo:string;
  demonstrativoId:number;demonstrativoArquivoId:number;eventoFingerprint:string;
  codigoPrestador:string;loteRetorno:string;protocoloRetorno:string;dataPagamento:string|null;
  valorPago:string;valorGlosa:string;codigoGlosa:string|null;diferenca:string;
  metodo:"grupo_guia_tuss_data_revisado";confirmadoPor:number;
};
export type ItemGrupoBanco = BancoItemFaturado & {tipoItem:string;setor:string};
export type EventoGrupoBanco = BancoEventoRetorno & {quantidade:string|null;valorInformado:string|null};
/** Contrato puro, não usa IDs visuais e não escreve. A transação futura deve
 * carregar todos os itens/eventos e proteger fonte, membros e vínculo.
 */
export function prepararGrupoBanco(p:{
  membros:readonly ItemGrupoBanco[];evento:EventoGrupoBanco;itensDoRecorte:readonly ItemGrupoBanco[];
  eventosDoRecorte:readonly EventoGrupoBanco[];itensJaVinculados:readonly number[];
  eventosJaVinculados:readonly number[];prestadoresAutorizados:readonly string[];
  confirmadoPor:number;revisado:boolean;
}):GrupoConfirmadoBanco{
 if(!p.membros.length)throw Error("GRUPO_VAZIO");
 const first=p.membros[0],e=p.evento;
 const toItem=(i:ItemGrupoBanco):ItemSetorBanco=>({...i,guia:i.guiaPrestador});
 const toEvent=(e:EventoGrupoBanco):EventoConsolidadoBanco=>({...e});
 if(new Set(p.membros.map(i=>i.loteId)).size!==1)throw Error("LOTES_FATURADO_DIFERENTES");
 if(new Set(p.membros.map(i=>i.id)).size!==p.membros.length)throw Error("MEMBRO_DUPLICADO");
 for(const i of p.membros){
  if(!Number.isSafeInteger(i.id)||i.id<=0||!Number.isSafeInteger(i.loteId)||i.loteId<=0
    ||!i.origemRegistroId.startsWith("hop_hup:")||i.receber!=="S")throw Error("MEMBRO_FONTE_OU_IDENTIDADE_INVALIDA");
  if(p.itensJaVinculados.includes(i.id))throw Error("MEMBRO_JA_VINCULADO");
  if(p.itensDoRecorte.filter(x=>x.id===i.id&&JSON.stringify(x)===JSON.stringify(i)).length!==1)throw Error("MEMBRO_FORA_DO_UNIVERSO");
 }
 const candidateItems=p.itensDoRecorte.filter(i=>i.estabelecimentoId===e.estabelecimentoId&&i.convenioId===e.convenioId
   && (i.guiaPrestador===e.guia||i.guiaOperadora===e.guia)&&i.codigoTuss===e.codigoTuss&&i.dataItem===e.dataItem);
 if(candidateItems.length!==p.membros.length||candidateItems.some(i=>!p.membros.some(m=>m.id===i.id)))throw Error("GRUPO_INCOMPLETO_OU_EVENTO_COMPARTILHADO");
 const r=avaliarConsolidacaoSetores(p.membros.map(toItem),p.eventosDoRecorte.map(toEvent));
 if(r.length!==1||r[0].status!=="consolidado_para_revisao"||r[0].eventoId!==e.id)throw Error("GRUPO_SEM_PROVA_DE_CONSOLIDACAO");
 const g=r[0];
 // Reaproveita as guardas de revisão, prestador, dados financeiros, glosa,
 // arquivo processado, identidade de evento e duplicidade de retorno.
 const aggregate:BancoItemFaturado={...first,quantidade:g.quantidade,valorFaturado:g.valorFaturado};
 const checked=prepararConfirmacaoBanco({item:aggregate,evento:e,itensDoRecorte:[aggregate],
  eventosDoRecorte:p.eventosDoRecorte,itensJaVinculados:p.itensJaVinculados,
  eventosJaVinculados:p.eventosJaVinculados,prestadoresAutorizados:p.prestadoresAutorizados,
  confirmadoPor:p.confirmadoPor,revisado:p.revisado});
 const memberIds=p.membros.map(i=>i.id).sort((a,b)=>a-b);
 const {faturadoItemId:_id,metodo:_metodo,...eventFields}=checked;
 return {...eventFields,loteFaturadoId:first.loteId,grupoFingerprint:createHash("sha256").update(JSON.stringify(memberIds)).digest("hex"),
   itemIds:memberIds,totalItens:memberIds.length,quantidadeFaturada:g.quantidade,valorFaturadoGrupo:g.valorFaturado,
   metodo:"grupo_guia_tuss_data_revisado"};
}
