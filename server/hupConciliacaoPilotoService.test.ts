import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./db",()=>({getRawPool:vi.fn()}));
import {getRawPool} from "./db";
import {compararHupPiloto,guiasHupPiloto,opcoesHupPiloto,resolverConveniosPiloto,HUP_PILOTO_LIMITE} from "./hupConciliacaoPilotoService";
const input={estabelecimentoId:1260036,competencia:"2026/08",convenioId:1};
const raw={conta:"C1",guiaPrestador:"G1",guiaOperadora:"",codigoTuss:"000123",dataItem:"2026-08-25",tipoItem:"1",setor:"Sala",modalidade:"S",quantidade:"1",valorFaturado:"100.00",nomeConvenio:"Convênio teste",codigoConvenio:"001"};
const mapping={convenioId:1,nome:"Convênio teste",codigo:"001",nomeCanonico:"Convênio teste"};
const sqlOf=(x:string|{sql:string})=>typeof x==="string"?x:x.sql;
function setup({rows=[raw],events=[],present=true,cv=true,fail=false,maps=[mapping],timeout=false}: {rows?:any[];events?:any[];present?:boolean;cv?:boolean;fail?:boolean;maps?:any[];timeout?:boolean}={}){
 const query=vi.fn(async(arg:string|{sql:string})=>{
  const sql=sqlOf(arg);
  if(timeout)throw Object.assign(Error("timeout"),{code:"PROTOCOL_SEQUENCE_TIMEOUT"});
  if(fail)throw Error("driver secreto host password paciente");
  if(sql.startsWith("SET TRANSACTION"))return [];
  if(sql.includes("SELECT id,nome FROM convenios"))return [cv?[{id:1,nome:"Convênio teste"}]:[]];
  if(sql.includes("FROM convenio_mapeamento"))return [maps];
  if(sql.includes("SELECT i.numeroConta"))return [present?rows:[]];
  if(sql.includes("FROM demonstrativo"))return [events];
  if(sql.includes("SELECT DISTINCT i.competencia"))return [[{competencia:"2026/08"}]];
  if(sql.includes("SELECT DISTINCT i.convenioFaturadoNome"))return [[{nome:"Convênio teste",codigo:"001"}]];
  throw Error("query inesperada");
 });
 const c={query,beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn()};
 vi.mocked(getRawPool).mockResolvedValue({getConnection:vi.fn(async()=>c)} as any);
 return c;
}
describe("serviço HUP estritamente leitura",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("bloqueia outra unidade antes da conexão",async()=>{await expect(compararHupPiloto({...input,estabelecimentoId:2})).rejects.toMatchObject({code:"BAD_REQUEST"});await expect(opcoesHupPiloto(0)).rejects.toMatchObject({code:"BAD_REQUEST"});expect(getRawPool).not.toHaveBeenCalled();});
 it.each([{competencia:"2026/13"},{mesPagamento:"2026-13"},{page:0},{pageSize:101},{convenioId:0}])("valida entrada antes da conexão (%o)",async extra=>{await expect(compararHupPiloto({...input,...extra})).rejects.toMatchObject({code:"BAD_REQUEST"});expect(getRawPool).not.toHaveBeenCalled();});
 it("snapshot inexistente não aciona fallback nem pagamento",async()=>{const c=setup({present:false});expect(await compararHupPiloto(input)).toMatchObject({status:"sem_snapshot",total:0});expect(c.query.mock.calls.some(([s])=>sqlOf(s).includes("FROM demonstrativo"))).toBe(false);expect(c.rollback).toHaveBeenCalled();expect(c.release).toHaveBeenCalled();});
 it("sem mapeamento não chama outra fonte",async()=>{setup({maps:[]});expect(await compararHupPiloto(input)).toMatchObject({status:"sem_faturado",total:0});});
 it("recorte limitado não apresenta soma parcial",async()=>{setup({rows:Array.from({length:HUP_PILOTO_LIMITE+1},()=>raw)});expect(await compararHupPiloto(input)).toMatchObject({status:"limite_excedido",total:0,resumo:{totalItens:0}});});
 it("excesso de eventos também falha fechado",async()=>{setup({events:Array.from({length:HUP_PILOTO_LIMITE+1},()=>({}))});expect(await compararHupPiloto(input)).toMatchObject({status:"limite_excedido",resumo:{totalEventos:0}});});
 it("somente SELECTs e controle transacional; não acessa staging nem espelhos",async()=>{const c=setup();const r=await compararHupPiloto(input);expect(r.status).toBe("ok");for(const [arg]of c.query.mock.calls){const sql=sqlOf(arg);expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|REPLACE)\b/);expect(sql).not.toMatch(/stagion_|integ_faturado|faturamento_tiss|recebimentos_excel|valorTotalRecebido/);}const sql=c.query.mock.calls.map(x=>sqlOf(x[0])).join(" ");expect(sql).toContain("l.status='publicado'");expect(sql).toContain("m.metodo_match='manual'");expect(c.beginTransaction).toHaveBeenCalledOnce();expect(c.rollback).toHaveBeenCalledOnce();expect(c.release).toHaveBeenCalledOnce();});
 it("mês de pagamento não filtra competência do demonstrativo",async()=>{const c=setup();await compararHupPiloto({...input,mesPagamento:"2026-09"});const call=c.query.mock.calls.find(([s])=>sqlOf(s).includes("FROM demonstrativo"));const sql=call?sqlOf(call[0]):"";expect(sql).toContain("data_pagamento>=?");expect(sql).not.toContain("data_referencia");expect(sql).toContain("a.status='processado'");});
	 it("filtra após comparação global e pagina sem mudar resumo",async()=>{setup({rows:Array.from({length:3},(_,i)=>({...raw,conta:`C${i}`}))});const r=await compararHupPiloto({...input,pageSize:1,page:2,busca:"C"});expect(r).toMatchObject({total:3,resumo:{totalItens:3,valorFaturadoHospital:"300.00"}});expect(r.items).toHaveLength(1);expect(r.items[0].conta).toBe("C1");setup({rows:[raw]});const f=await compararHupPiloto({...input,status:"candidato"});expect(f.total).toBe(0);expect(f.resumo.totalItens).toBe(1);});
	 it("guias agrega a comparação inteira antes da página, filtro e resumo",async()=>{setup({rows:[
	  {...raw,conta:"0001",guiaPrestador:"G1",guiaOperadora:"O1",codigoTuss:"0001",valorFaturado:"10.00"},
	  {...raw,conta:"0001",guiaPrestador:"G1",guiaOperadora:"O1",codigoTuss:"0002",valorFaturado:"20.00"},
	  {...raw,conta:"0002",guiaPrestador:"G2",guiaOperadora:"O2",codigoTuss:"0003",valorFaturado:"30.00"},
	 ]});const r=await guiasHupPiloto({...input,page:2,pageSize:1,busca:""});expect(r).toMatchObject({status:"ok",total:2,resumo:{totalItens:3,totalGrupos:3,totalGuias:2,valorFaturadoHospital:"60.00"}});expect(r.items).toHaveLength(1);expect(r.items[0]).toMatchObject({conta:"0002",totalGrupos:1,totalItens:1,valorFaturado:"30.00"});setup({rows:[raw]});const f=await guiasHupPiloto({...input,status:"sem_candidato"});expect(f.total).toBe(1);expect(f.resumo).toMatchObject({totalItens:1,totalGuias:1});});
 it("sanitize erros e libera conexão mesmo após falha",async()=>{const c=setup({fail:true});await expect(compararHupPiloto(input)).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",message:"Não foi possível concluir a leitura do piloto. Nenhuma conciliação foi gravada."});expect(c.rollback).toHaveBeenCalled();expect(c.release).toHaveBeenCalled();});
 it("não reutiliza conexão quando rollback falha",async()=>{const c=setup({fail:true});c.rollback.mockRejectedValue(Error("falha"));await expect(compararHupPiloto(input)).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR"});expect(c.destroy).toHaveBeenCalled();expect(c.release).not.toHaveBeenCalled();});
 it("timeout destrói a conexão em vez de devolvê-la ao pool",async()=>{const c=setup({timeout:true});await expect(compararHupPiloto(input)).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR"});expect(c.destroy).toHaveBeenCalled();expect(c.release).not.toHaveBeenCalled();});
 it("convênio de outra unidade é rejeitado",async()=>{setup({cv:false});await expect(compararHupPiloto(input)).rejects.toMatchObject({code:"BAD_REQUEST"});});
 it("opções mantém de-para manual e lote publicado",async()=>{const c=setup();expect(await opcoesHupPiloto(input.estabelecimentoId)).toMatchObject({competencias:["2026/08"],somenteLeitura:true,convenios:[{id:1}]});const sql=c.query.mock.calls.map(x=>sqlOf(x[0])).join(" ");expect(sql).toContain("m.metodo_match='manual'");expect(sql).toContain("l.status='publicado'");expect(c.rollback).toHaveBeenCalled();});
 it("mapeamento código e nome em conflito é excluído com aviso",async()=>{setup({maps:[mapping,{...mapping,convenioId:2,codigo:"outro"}]});const r=await compararHupPiloto(input);expect(r.status).toBe("sem_faturado");expect(r.aviso).toContain("1 item(ns) excluído(s)");expect(r.total).toBe(0);});
 it("mesmo convênio em dois mapas não duplica itens",async()=>{setup({maps:[mapping,{...mapping,codigo:"outro"}]});expect((await compararHupPiloto(input)).resumo.totalItens).toBe(1);});
 it("código zero não associa todos os convênios sem código",()=>{expect(resolverConveniosPiloto("","0",[{...mapping,codigo:"0"}])).toEqual([]);});
 it("resolução por nome é literal normalizada sem fuzzy",()=>{expect(resolverConveniosPiloto("  CONVÊNIO TESTE  ","",[mapping])).toEqual([1]);expect(resolverConveniosPiloto("Teste","",[mapping])).toEqual([]);});
});
