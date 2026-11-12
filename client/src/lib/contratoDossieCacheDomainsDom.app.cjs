'use strict';
// Código da montagem temporária, não uma alternativa ao produto. Só tRPC,
// toast e navegação são substituídos; componente/helper/UI/CSS vêm do repo.
module.exports = String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider, useQuery, useMutation, notifyManager} from '@tanstack/react-query';
import {getQueryKey} from '@trpc/react-query';
import {ContratoDossieModal} from '@/components/ContratoDossieModal';
import './dom.css';
const fixture:any={
 dossie:{contratoId:101,convenioId:1101,convenio:'CONVENIO FICTICIO 101',estabelecimentoNome:'HOSPITAL FICTICIO — OFFLINE',numeroContrato:'SINT-101',arquivo_saida:'sintetico.xlsx',dados_gerais:[['Hospital','FICTICIO']],pontos_atencao:[['RISCO','Risco sintético','RED'],['ATENCAO','XML sintético','YEL'],['OPORTUNIDADE','Cobrança sintética','GRN']],clausulas:[['Clausula','Cláusula fictícia']],remuneracao:[],reajustes:[],pendencias:['PENDENCIA FICTICIA'],documentos:[{id:501,data:'11/11/2026',arquivo:'sintetico.pdf',tipo:'Contrato',paginas:1,resumo:'FICTICIO',status:'Concluido',statusLeitura:'concluido'}],tabela_valores:{titulo:'Tabela sintética',colunas:['Código','Descrição','Valor','Fonte'],linhas:[['SINT','FICTICIO',20,'Fonte sintética']]},resumo_executivo:{totalDocumentos:1,totalAlertasRed:1,totalAlertasYel:1,totalOportunidadesGrn:1,prazoFaturamento:'30 dias sintéticos',prazoRecursoGlosa:'15 dias sintéticos'}},
 xml:{contratoId:101,convenioId:1101,convenioNome:'FICTICIO',resumo:{totalItensXml:1,totalGuiasXml:1,valorTotalCobradoXml:20,valorTotalDevidoContrato:20,valorPerdaSubfaturamento:0,valorRiscoGlosaAcimaTabela:0,qtdSubfaturados:0,qtdAcimaContrato:0,qtdConformes:1,qtdSemTabela:0,qtdGuiasSemSenha:0},resumoPorProcedimento:[],itens:[{id:1,numeroGuia:'GUIA-XML-SINT',codigoItem:'TUSS-SINT',descricaoItem:'FICTICIO',quantidade:1,valorTotalXml:20,valorTotalContrato:20,diferencaTotal:0,statusCobranca:'conforme',competencia:'2026-01'}]},
 glosas:{contratoId:101,convenioId:1101,convenioNome:'FICTICIO',prazoRecursoGlosa:'15 dias sintéticos',resumo:{totalItensGlosados:1,valorTotalGlosado:20,valorContestavelContrato:20,qtdGlosaIndevidaTabela:1,qtdGlosaTotal:0,qtdJaComJustificativa:0},itens:[]}
};
function item(id:number,classification='glosa_indevida_abaixo_contrato',value=20){return {id,origem:id%2?'demonstrativo':'conciliacao',numeroGuia:'GUIA-SINT-'+id,descricaoItem:'ITEM FICTICIO '+id,codigoItem:'SINT-'+id,quantidade:1,valorFaturado:30,valorPago:10,valorGlosa:20,valorContratadoTabela:30,valorRecursoSugerido:value,classificacaoContrato:classification,justificativaContratualSugerida:'JUSTIFICATIVA SINTETICA ITEM '+id+' CONTRATO 101',justificativaAtual:classification==='glosa_tecnica_contestavel'?'SALVA SINTETICA':null};}
fixture.glosas.itens=[item(1)];
const clone=(x:any)=>JSON.parse(JSON.stringify(x));
const qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity,staleTime:60000,refetchOnWindowFocus:false},mutations:{retry:false}}});
const calls:any[]=[],toasts:any[]=[],invalidations:any[]=[],events:any[]=[],queries:any[]=[];
let current:any=clone(fixture),queryMode:any={},pendingQueries:any={},pendingMutation=false,mutationMode='success',pendingResolve:any,pendingReject:any;
const routes:any={dossie:'contratosConvenios.obterDossie',xml:'contratosConvenios.auditarCobrancaXml',glosas:'contratosConvenios.auditarGlosasContrato'};
const key=(route:string,input:any)=>getQueryKey({_def:()=>({path:route.split('.')})} as any,input,'query');
const inputFor=(domain:string,id=101,competencia?:string)=>domain==='dossie'?{contratoId:id}:{contratoId:id,competencia,limit:domain==='xml'?300:200};
const query=(domain:string)=>qc.getQueryCache().find({queryKey:key(routes[domain],inputFor(domain)),exact:true})!;
function seed(id=101){for(const domain of Object.keys(routes)){const data=clone(current[domain]);data.contratoId=id;if(domain==='dossie'){data.convenio='CONVENIO FICTICIO '+id;data.numeroContrato='SINT-'+id;}qc.setQueryData(key(routes[domain],inputFor(domain,id)),data);}}
seed();
qc.getQueryCache().subscribe((event:any)=>{events.push({type:event.type,domain:Object.keys(routes).find(d=>JSON.stringify(event.query.queryKey[0])===JSON.stringify(routes[d].split('.'))),action:event.action?.type,status:event.query.state.status,fetchStatus:event.query.state.fetchStatus,isInvalidated:event.query.state.isInvalidated});});
export const toast=new Proxy({}, {get:(_,type)=>(msg:any)=>toasts.push({type,msg})});
export function useLocation(){return ['/',(to:any)=>calls.push({navigation:to})] as any;}
export const trpc:any=new Proxy({}, {get:(_,group)=>group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,method)=>({invalidate:(input:any)=>{const route=String(g)+'.'+String(method);invalidations.push({route,input});return qc.invalidateQueries({queryKey:key(route,input)});}})})}):new Proxy({}, {get:(_,method)=>{const route=String(group)+'.'+String(method);return {_def:()=>({path:route.split('.')}),useQuery:(input:any,opts:any)=>useQuery({queryKey:key(route,input),...opts,queryFn:()=>{const domain=Object.keys(routes).find(d=>routes[d]===route)!;queries.push({domain,input:clone(input),mode:queryMode[domain]??'ready'});if(queryMode[domain]==='error')throw new Error('FALHA '+domain+' SINTETICA');if(queryMode[domain]==='pending')return new Promise((resolve,reject)=>{pendingQueries[domain]={resolve,reject};});return {...current[domain],contratoId:input.contratoId};}}),useMutation:()=>useMutation({mutationFn:(input:any)=>{calls.push({route,input:clone(input)});if(pendingMutation)return new Promise((resolve,reject)=>{pendingResolve=resolve;pendingReject=reject;});if(mutationMode==='error')return Promise.reject(new Error('ACK REJEITADO SINTETICO'));return Promise.resolve({atualizados:input.itens?.length??0});}})};}})});
function App(){const [props,setProps]=React.useState({open:true,contratoId:101,escopo:'offline-ficticio',abaInicial:'glosas'});const [tick,setTick]=React.useState(0);(window as any).audit.rerender=()=>setTick(t=>t+1);(window as any).audit.setProps=(p:any)=>{if(p.contratoId&&p.contratoId!==props.contratoId)seed(p.contratoId);setProps(prev=>({...prev,...p}));};return <QueryClientProvider client={qc}><span hidden>{tick}</span><ContratoDossieModal {...props} onOpenChange={open=>setProps(prev=>({...prev,open}))}/></QueryClientProvider>;}
const audit:any={qc,calls,toasts,invalidations,events,queries,fixture,seed,item,
 snapshot(){return Object.fromEntries(Object.keys(routes).map(domain=>{const s=query(domain)?.state;return [domain,s?{status:s.status,fetchStatus:s.fetchStatus,isInvalidated:s.isInvalidated,dataUpdatedAt:s.dataUpdatedAt,hasData:!!s.data}:null];}));},
 async fail(domain:string){queryMode[domain]='error';await qc.refetchQueries({queryKey:query(domain).queryKey,exact:true});},
 async recover(domain:string){queryMode[domain]='ready';await qc.refetchQueries({queryKey:query(domain).queryKey,exact:true});},
 startPending(domain:string){queryMode[domain]='pending';void qc.refetchQueries({queryKey:query(domain).queryKey,exact:true});},
 finishPending(domain:string,error=false){queryMode[domain]=error?'error':'ready';if(error)pendingQueries[domain]?.reject(new Error('FALHA '+domain+' SINTETICA'));else pendingQueries[domain]?.resolve(current[domain]);},
 invalidate(domain:string){void qc.invalidateQueries({queryKey:query(domain).queryKey,exact:true,refetchType:'none'});},
 remove(domain:string){qc.removeQueries({queryKey:query(domain).queryKey,exact:true});},
 removeReadd(domain:string){const previous=query(domain);const data=previous.state.data;const dataUpdatedAt=previous.state.dataUpdatedAt;qc.removeQueries({queryKey:previous.queryKey,exact:true});qc.setQueryData(previous.queryKey,data,{updatedAt:dataUpdatedAt});},
 holdReact(){audit.scheduled=[];notifyManager.setScheduler(callback=>audit.scheduled.push(callback));},
 releaseReact(){notifyManager.setScheduler(callback=>setTimeout(callback,0));for(const callback of audit.scheduled??[])callback();audit.scheduled=[];},
 expire(domain:string){query(domain).setState({dataUpdatedAt:Date.now()-60001});},
 replace(domain:string){current[domain]=clone(current[domain]);if(domain==='glosas')current.glosas.itens=[item(88)];if(domain==='dossie')current.dossie.numeroContrato='SINT-101-REVISAO-FICTICIA';qc.setQueryData(query(domain).queryKey,clone(current[domain]));},
 mode(domain:string,mode:string){queryMode[domain]=mode;},
 pending(value=true){pendingMutation=value;},resolve(result:any){pendingResolve?.(result);pendingResolve=null;},reject(){pendingReject?.(new Error('ACK REJEITADO SINTETICO'));pendingReject=null;},
 mutationMode(mode:string){mutationMode=mode;},
 configure(kind:string){if(kind==='mixed')current.glosas.itens=[item(1),item(2,'glosa_total_contestavel',25),item(3,'glosa_tecnica_contestavel',30),item(4,'ajuste_contratual_legitimo',40),item(5,'glosa_total_contestavel',0),item(6,'glosa_tecnica_contestavel',-5)];if(kind==='large')current.glosas.itens=Array.from({length:250},(_,i)=>item(i+1));current.glosas.resumo.totalItensGlosados=current.glosas.itens.length;qc.setQueryData(query('glosas').queryKey,clone(current.glosas));},
 seedCompetencia(competencia:string){const data=clone(current.glosas);data.itens=[item(77)];qc.setQueryData(key(routes.glosas,inputFor('glosas',101,competencia)),data);},
 button(label:string){const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes(label));if(!b)throw new Error('BOTAO AUSENTE: '+label);return b;},
 capture(){const labels=['Selecionar Contestáveis','Responder Recursos Automaticamente','Aplicar Fundamentação','Baixar Excel'];audit.captured=labels.map(label=>{const b=audit.button(label);const props=(b as any)[Object.keys(b).find(k=>k.startsWith('__reactProps$'))!];if(typeof props?.onClick!=='function')throw new Error('HANDLER REACT REAL AUSENTE: '+label);return {label,handler:props.onClick};});},
 invokeCaptured(){for(const {handler} of audit.captured)handler({});},
};
(window as any).audit=audit;
createRoot(document.getElementById('root')!).render(<App/>);
`;
