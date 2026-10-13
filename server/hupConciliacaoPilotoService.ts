import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { getRawPool } from "./db";
import { compararSnapshotHup, dataCivilPiloto, type HupConciliacaoStatus, type HupSnapshotItem, type HupDemonstrativoEvento } from "./hupConciliacaoPilotoCompare";

export const HUP_PILOTO_ESTABELECIMENTO = 1260036;
export const HUP_PILOTO_LIMITE = 50000;
const fonte = "Snapshot Hop publicado — somente faturado";
const recebimentosFonte = "Demonstrativos importados";
const SNAPSHOT = `FROM warleine_faturamento_itens_ativos i
 INNER JOIN warleine_faturamento_lotes l ON l.id=i.loteId AND l.estabelecimentoId=i.estabelecimentoId AND l.status='publicado'
 WHERE i.estabelecimentoId=? AND i.origemRegistroId LIKE 'hop_hup:%'`;
const MAPS = `SELECT m.convenioId,m.nome_origem nome,m.codigo_origem codigo,cv.nome nomeCanonico
 FROM convenio_mapeamento m LEFT JOIN convenios cv ON cv.id=m.convenioId AND cv.ativo='sim'
 AND (cv.estabelecimentoId IS NULL OR cv.estabelecimentoId=m.estabelecimentoId)
 WHERE m.estabelecimentoId=? AND m.ativo='sim' AND m.metodo_match='manual' ORDER BY m.id LIMIT 5001`;
const texto = (v: unknown) => String(v ?? "").trim();
const compValida = (value: string, separator: string) => new RegExp(`^(19|20|21|22)\\d{2}${separator}(0[1-9]|1[0-2])$`).test(value);

export function exigirHupPiloto(estabelecimentoId: number) {
  if (estabelecimentoId !== HUP_PILOTO_ESTABELECIMENTO) throw new TRPCError({code:"BAD_REQUEST",message:"Piloto disponível somente para Hospital Urológico."});
}
function bad(message: string): never { throw new TRPCError({code:"BAD_REQUEST",message}); }
async function select(c: PoolConnection, sql: string, values: (string|number)[]) {
  return c.query<RowDataPacket[]>({sql,timeout:20000},values);
}
async function leitura<T>(work: (c: PoolConnection) => Promise<T>): Promise<T> {
  let c: PoolConnection | undefined;
  try {
    const pool = await getRawPool();
    if (!pool) throw new Error("SEM_POOL");
    c = await pool.getConnection();
    await c.query({sql:"SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",timeout:20000});
    await c.beginTransaction();
    const result = await work(c);
    await c.rollback();
    return result;
  } catch (e) {
    if (c) {
      if ((e as {code?:string})?.code === "PROTOCOL_SEQUENCE_TIMEOUT") { c.destroy(); c=undefined; }
      else { try { await c.rollback(); } catch { c.destroy(); c=undefined; } }
    }
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Não foi possível concluir a leitura do piloto. Nenhuma conciliação foi gravada."});
  } finally { c?.release(); }
}

type Depara = {convenioId:number; nome:string; codigo:string; nomeCanonico:string};
export function resolverConveniosPiloto(nome: string, codigo: string, maps: readonly Depara[]): number[] {
  const n=nome.trim().toUpperCase(),cod=codigo.trim();
  const ids=maps.filter(m=>(!!cod && !/^0+$/.test(cod) && m.codigo===cod)
    || (!!n && m.nome.toUpperCase()===n)).map(m=>m.convenioId);
  return [...new Set(ids)];
}
async function lerMapas(c: PoolConnection, estabelecimentoId: number): Promise<Depara[]> {
  const [rows]=await select(c,MAPS,[estabelecimentoId]);
  if(rows.length>5000)bad("De-para excedeu o limite do piloto.");
  return rows.map(r=>({convenioId:Number(r.convenioId),nome:texto(r.nome),codigo:texto(r.codigo),nomeCanonico:texto(r.nomeCanonico)}));
}

export async function opcoesHupPiloto(estabelecimentoId: number) {
  exigirHupPiloto(estabelecimentoId);
  return leitura(async c => {
    const [cs] = await select(c,`SELECT DISTINCT i.competencia ${SNAPSHOT} ORDER BY i.competencia DESC LIMIT 241`,[estabelecimentoId]);
    const maps=await lerMapas(c,estabelecimentoId);
    const [origins]=await select(c,`SELECT DISTINCT i.convenioFaturadoNome nome,i.convenioFaturadoCodigo codigo ${SNAPSHOT} LIMIT 5001`,[estabelecimentoId]);
    if(cs.length>240 || origins.length>5000)bad("Recorte de opções excedeu o limite do piloto.");
    const ids=new Set<number>();
    for(const r of origins){const resolved=resolverConveniosPiloto(texto(r.nome),texto(r.codigo),maps);if(resolved.length===1)ids.add(resolved[0]);}
    const canonical=new Map<number,{id:number;nome:string}>();
    for(const m of maps)if(ids.has(m.convenioId)&&m.nomeCanonico)canonical.set(m.convenioId,{id:m.convenioId,nome:m.nomeCanonico});
    return {competencias:cs.map(r=>texto(r.competencia)).filter(v=>compValida(v,"/")),
      convenios:[...canonical.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")),fonte,recebimentosFonte,somenteLeitura:true as const};
  });
}

export type HupPilotoInput = { estabelecimentoId: number; competencia: string; convenioId: number; page?: number; pageSize?: number; status?: "todos" | HupConciliacaoStatus; busca?: string; mesPagamento?: string };
export async function compararHupPiloto(input: HupPilotoInput) {
  exigirHupPiloto(input.estabelecimentoId);
  if (!compValida(input.competencia,"/")) bad("Competência inválida.");
  if (input.mesPagamento && !compValida(input.mesPagamento,"-")) bad("Mês de pagamento inválido.");
  if (!Number.isSafeInteger(input.convenioId) || input.convenioId <= 0) bad("Convênio obrigatório.");
  const page=input.page ?? 1, pageSize=input.pageSize ?? 50;
  if (!Number.isSafeInteger(page) || page<1 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>100) bad("Paginação inválida.");
  return leitura(async c => {
    const [cv] = await select(c,`SELECT id,nome FROM convenios WHERE id=? AND ativo='sim' AND (estabelecimentoId IS NULL OR estabelecimentoId=?) LIMIT 1`,[input.convenioId,input.estabelecimentoId]);
    if (!cv.length) bad("Convênio não autorizado para esta unidade.");
    const base = {somenteLeitura:true as const,competencia:input.competencia,convenioNome:texto(cv[0].nome),geradoEm:new Date().toISOString(),fonte,recebimentosFonte,page,pageSize};
    const vazio = (status: "sem_snapshot" | "sem_faturado" | "limite_excedido", aviso: string) => ({...base,status,aviso,total:0,...compararSnapshotHup([],[])});
    const maps=await lerMapas(c,input.estabelecimentoId);
    const [rows] = await select(c,`SELECT i.numeroConta conta,i.guiaPrestador,i.guiaOperadora,i.codigoTuss,
      i.convenioFaturadoNome nomeConvenio,i.convenioFaturadoCodigo codigoConvenio,
      i.dataAberturaConta dataItem,i.codigoTipoServico tipoItem,i.setorNome setor,
      i.recebimentoViaHospital modalidade,CAST(i.quantidade AS CHAR) quantidade,CAST(i.valorFaturado AS CHAR) valorFaturado
      ${SNAPSHOT} AND i.competencia=? ORDER BY i.id LIMIT ?`,[input.estabelecimentoId,input.competencia,HUP_PILOTO_LIMITE+1]);
    if(!rows.length)return vazio("sem_snapshot","Não há snapshot Hop publicado para a competência selecionada.");
    if (rows.length > HUP_PILOTO_LIMITE) return vazio("limite_excedido","Mais de 50.000 itens na competência; totais parciais não serão apresentados.");
    let conflitos=0;
    const selected=rows.filter(r=>{const ids=resolverConveniosPiloto(texto(r.nomeConvenio),texto(r.codigoConvenio),maps);
      if(ids.includes(input.convenioId)&&ids.length>1)conflitos++;
      return ids.length===1&&ids[0]===input.convenioId;});
    if (!selected.length) return vazio("sem_faturado",`Sem faturado com de-para manual inequívoco no recorte. ${conflitos} item(ns) excluído(s) por conflito de convênio.`);
    const paymentClause = input.mesPagamento ? " AND d.data_pagamento>=? AND d.data_pagamento<DATE_ADD(?,INTERVAL 1 MONTH)" : "";
    const params: (string|number)[] = [input.estabelecimentoId,input.convenioId];
    if (input.mesPagamento) params.push(`${input.mesPagamento}-01`,`${input.mesPagamento}-01`);
    params.push(HUP_PILOTO_LIMITE+1);
    const [events] = await select(c,`SELECT d.id,d.arquivo_id arquivoId,d.numero_guia guia,d.codigo_item codigoTuss,
      DATE_FORMAT(d.data_execucao,'%Y-%m-%d') dataItem,DATE_FORMAT(d.data_pagamento,'%Y-%m-%d') dataPagamento,
      CAST(d.valor_pago AS CHAR) valorPago,CAST(d.valor_glosa AS CHAR) valorGlosa
      FROM demonstrativo d INNER JOIN arquivos a ON a.id=d.arquivo_id AND a.estabelecimentoId=d.estabelecimentoId
      AND a.convenioId=d.convenio_id AND a.status='processado'
      WHERE d.estabelecimentoId=? AND d.convenio_id=?${paymentClause} ORDER BY d.id LIMIT ?`,params);
    if (events.length>HUP_PILOTO_LIMITE) return vazio("limite_excedido","Mais de 50.000 eventos no recorte de pagamento; totais parciais não serão apresentados.");
    const snapshot: HupSnapshotItem[] = selected.map(r=>({conta:texto(r.conta),guiaPrestador:texto(r.guiaPrestador),guiaOperadora:texto(r.guiaOperadora),codigoTuss:texto(r.codigoTuss),dataItem:dataCivilPiloto(r.dataItem),tipoItem:texto(r.tipoItem),setor:texto(r.setor),modalidade:texto(r.modalidade).toUpperCase(),quantidade:texto(r.quantidade),valorFaturado:texto(r.valorFaturado)}));
    const pagamentos: HupDemonstrativoEvento[] = events.map(r=>({id:texto(r.id),arquivoId:texto(r.arquivoId),guia:texto(r.guia),codigoTuss:texto(r.codigoTuss),dataItem:dataCivilPiloto(r.dataItem),dataPagamento:dataCivilPiloto(r.dataPagamento),valorPago:r.valorPago==null?null:texto(r.valorPago),valorGlosa:r.valorGlosa==null?null:texto(r.valorGlosa)}));
    const compared=compararSnapshotHup(snapshot,pagamentos);
    const busca=texto(input.busca).toUpperCase();
    const filtered=compared.items.filter(r=>(!input.status || input.status==="todos" || r.status===input.status)
      && (!busca || [r.conta,r.guiaPrestador,r.guiaOperadora,r.codigoTuss].some(v=>v.toUpperCase().includes(busca))));
    return {...base,status:"ok" as const,aviso:`Comparação de leitura, sem vínculo confirmado. De-para manual inequívoco; ${conflitos} item(ns) excluído(s) por conflito de convênio. Totais de pagamento pertencem ao recorte dos demonstrativos, não à competência faturada.`,resumo:compared.resumo,total:filtered.length,items:filtered.slice((page-1)*pageSize,page*pageSize)};
  });
}
