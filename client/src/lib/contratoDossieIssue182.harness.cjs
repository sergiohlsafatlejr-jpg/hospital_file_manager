/* Prova offline: TSX/helper reais transpilados em VM; hooks e UI sintéticos,
 * TanStack QueryClient/QueryObserver/MutationObserver, React SSR e XLSX reais.
 * Sem carregar backend, env, storage, integrações ou executores de IA. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const ts = req('typescript');
const React = req('react');
const SSR = req('react-dom/server');
const XLSX = req('xlsx');
const { QueryClient, QueryObserver, MutationObserver, hashKey } = req('@tanstack/react-query');
const { getQueryKey } = req('@trpc/react-query');
const reports = [];
const scenarios = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
function test(name, fn) { scenarios.push({name, fn}); }
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }
function dossie(id=101) { return { contratoId:id, convenioId:id+1000, convenio:'CONVENIO FICTICIO '+id, estabelecimentoNome:'HOSPITAL FICTICIO '+id, numeroContrato:'SINT-'+id, arquivo_saida:'sintetico.xlsx', dados_gerais:[['Hospital','FICTICIO']], pontos_atencao:[['RISCO','<img src=x onerror=alert(1)>','RED'],['ATENCAO','XML sintético','YEL'],['OPORTUNIDADE','Cobrança sintética','GRN']], clausulas:[['Clausula','<script>alert(1)</script>']], remuneracao:[], reajustes:[], pendencias:['=1+1'], documentos:[{id:501,data:'11/11/2026',arquivo:'sintetico.pdf',tipo:'Contrato',paginas:1,resumo:'<b>sintetico</b>',status:'Concluido',statusLeitura:'concluido'}], tabela_valores:{titulo:'Tabela sintética',colunas:['Código','Descrição','Valor','Fonte'],linhas:[['=1+1','<img src=x>',0,'Fonte sintética']]}, resumo_executivo:{totalDocumentos:1,totalAlertasRed:1,totalAlertasYel:1,totalOportunidadesGrn:1,prazoFaturamento:'30 dias sintéticos',prazoRecursoGlosa:'15 dias sintéticos'} }; }
function xml(id=101) { return {contratoId:id,convenioId:id+1000,convenioNome:'FICTICIO',resumo:{totalItensXml:1,totalGuiasXml:1,valorTotalCobradoXml:0,valorTotalDevidoContrato:0,valorPerdaSubfaturamento:0,valorRiscoGlosaAcimaTabela:0,qtdSubfaturados:0,qtdAcimaContrato:0,qtdConformes:1,qtdSemTabela:0,qtdGuiasSemSenha:0},resumoPorProcedimento:[],itens:[{id:1,numeroGuia:'GUIA-SINT',codigoItem:'TUSS-SINT',descricaoItem:'FICTICIO',quantidade:0,valorTotalXml:0,valorTotalContrato:0,diferencaTotal:0,statusCobranca:'conforme',competencia:'2026-01'}]}; }
function glosas(id=101,n=1) { return {contratoId:id,convenioId:id+1000,convenioNome:'FICTICIO',prazoRecursoGlosa:'15 dias sintéticos',resumo:{totalItensGlosados:n,valorTotalGlosado:20*n,valorContestavelContrato:20*n,qtdGlosaIndevidaTabela:n,qtdGlosaTotal:0,qtdJaComJustificativa:0},itens:Array.from({length:n},(_,i)=>({id:i+1,origem:'demonstrativo',numeroGuia:'GUIA-SINT-'+i,descricaoItem:'ITEM FICTICIO',codigoItem:'SINT-'+i,quantidade:0,valorFaturado:0,valorPago:0,valorGlosa:20,valorContratadoTabela:0,valorRecursoSugerido:20,classificacaoContrato:'glosa_indevida_abaixo_contrato',justificativaContratualSugerida:'JUSTIFICATIVA SINTETICA CONTRATO '+id,justificativaAtual:null}))}; }
const routes = {dossie:'contratosConvenios.obterDossie', xml:'contratosConvenios.auditarCobrancaXml', glosas:'contratosConvenios.auditarGlosasContrato', ia:'contratosConvenios.gerarDossieIA', tabela:'contratosConvenios.sincronizarTabelaDossie', aplicar:'contratosConvenios.aplicarFundamentacaoGlosas'};
function normalizedQueryKey(procedure,input,type) { return getQueryKey(procedure,JSON.parse(JSON.stringify(input)),type); }
function key(route,input) { return normalizedQueryKey({_def:()=>({path:route.split('.')})},input,'query'); }
function runtime() {
  const r={slots:[],index:0,effects:[],deps:[],cleanups:[],calls:[],mutations:[],invalidations:[],toasts:[],locations:[],state:{hospital:1},queries:{},functions:{},observers:new Map(),mutationObservers:new Map(),promises:[],modules:new Map()};
  r.qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});
  const hooks={...React,useState:init=>{const i=r.index++;if(!(i in r.slots))r.slots[i]=typeof init==='function'?init():init;return [r.slots[i],v=>r.slots[i]=typeof v==='function'?v(r.slots[i]):v];},useMemo:fn=>{r.index++;return fn();},useRef:init=>{const i=r.index++;if(!(i in r.slots))r.slots[i]={current:init};return r.slots[i];},useSyncExternalStore:(subscribe,snapshot)=>{r.index++;return snapshot();},useEffect:(fn,deps)=>{const i=r.index++;if(!r.deps[i]||!deps||deps.some((v,j)=>v!==r.deps[i][j])){r.deps[i]=deps;r.effects.push(()=>{r.cleanups[i]?.();r.cleanups[i]=fn();});}}};
  const toast=new Proxy({}, {get:(_,name)=>(msg)=>r.toasts.push({type:name,msg})});
  const trpc=new Proxy({}, {get:(_,group)=>group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,name)=>({invalidate:arg=>{r.invalidations.push({route:g+'.'+name,arg});return Promise.resolve();}})})}):new Proxy({}, {get:(_,method)=>{
    const route=group+'.'+method;
    return {_def:()=>({path:route.split('.')}),useQuery:(input,opts)=>{
      r.calls.push({route,input,opts});
      if(route===routes.dossie||route===routes.xml||route===routes.glosas){
        const queryKey=key(route,input), hash=hashKey(queryKey);
        let ob=r.observers.get(hash);
        if(!ob){ob=new QueryObserver(r.qc,{queryKey,queryFn:()=>r.functions[route]?.() ?? Promise.reject(new Error('QUERY SINTETICA SEM FIXTURE')),staleTime:opts.staleTime,enabled:opts.enabled,retry:false});r.observers.set(hash,ob);ob.unsub=ob.subscribe(()=>{});}
        return ob.getCurrentResult();
      }
      const q=r.queries[route];return (typeof q==='function'?q(input,opts):q)||{data:undefined,isLoading:false,isFetching:false,isError:false,isStale:false};
    },useMutation:()=>{
      let ob=r.mutationObservers.get(route);
      if(!ob){ob=new MutationObserver(r.qc,{mutationFn:input=>{r.mutations.push({route,input});return r.functions[route]?.(input) ?? Promise.resolve(route===routes.aplicar?{atualizados:1}:route===routes.tabela?{inseridos:0,atualizados:0}:{dossie:dossie(input.contratoId),geradoComIA:false,salvo:false,motivo:'sem_texto'});}});r.mutationObservers.set(route,ob);}
      return {isPending:ob.getCurrentResult().isPending,mutateAsync:input=>{const promise=ob.mutate(input);r.promises.push(promise.catch(()=>{}));return promise;}};
    }};
  }})});
  const ui=new Proxy({}, {get:(_,name)=>{const c=p=>React.createElement('div',{'data-ui':name},p.children);c.ui=name;return c;}});
  const generic=new Proxy({}, {get:(_,name)=>name==='__esModule'?false:(p)=>React.createElement('div',null,p?.children)});
  function load(file) {
    assert(file.startsWith(ROOT+'/client/')||file.startsWith(ROOT+'/shared/'),'Import fora do frontend/shared: '+file);
    if(r.modules.has(file))return r.modules.get(file).exports;
    const mod={exports:{}};r.modules.set(file,mod);
    const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
    assert.equal(js.diagnostics?.length,0,'TSX inválido: '+file);
    function imports(s){
      if(s==='react')return hooks;if(s==='react/jsx-runtime'||s==='zod')return req(s);
      if(s==='@tanstack/react-query')return {useQueryClient:()=>r.qc,hashKey};if(s==='@trpc/react-query')return {getQueryKey:normalizedQueryKey};
      if(s==='xlsx')return {...XLSX,writeFile:(wb,name)=>{r.workbook=wb;r.workbookName=name;}};
      if(s==='wouter')return {useLocation:()=>['/',v=>r.locations.push(v)]};if(s==='sonner')return {toast};if(s==='@/lib/trpc')return {trpc};
      if(s==='lucide-react'||s.startsWith('@/components/ui/'))return ui;
      if(s==='@/contexts/EstabelecimentoContext')return {useEstabelecimento:()=>({estabelecimentoAtual:{id:r.state.hospital},estabelecimentos:[{id:1},{id:2}],temAcessoModuloNoEstabelecimento:()=>true})};
      if(s==='@/_core/hooks/useAuth')return {useAuth:()=>({user:{id:1,role:'admin'}})};
      if(s==='@/components/ContratoDossieModal')return {ContratoDossieModal:Object.assign(()=>null,{ui:'ContratoDossieModal'})};
      if(s==='@/lib/contratoDossieIssue182'||s.startsWith('@shared/')||s==='@/components/recurso-glosa/recursoGlosaDemonstrativo'||s==='@/lib/dateUtils') {const p=s.startsWith('@shared/')?path.join(ROOT,'shared',s.slice(8)+'.ts'):path.join(ROOT,'client/src',s.slice(2)+'.ts');return load(p);}
      if(s.startsWith('@/components/')||s.startsWith('@/lib/contratosUpload'))return generic;
      throw new Error('Import não permitido no harness: '+s);
    }
    vm.runInNewContext('(function(require,module,exports){'+js.outputText+'\n})',{console,Date,Error,setTimeout,clearTimeout,URL,AbortController,Intl,window:{location:{search:''}},document:{},navigator:{}},{filename:file})(imports,mod,mod.exports);
    return mod.exports;
  }
  r.load=load;
  r.cleanup=()=>{r.cleanups.forEach(c=>c?.());r.cleanups=[];r.effects=[];};
  r.render=(component,props)=>{
    const wrapper=component(props);
    if(wrapper?.type?.name==='ContratoDossieConteudo'){
      if(r.renderKey!==wrapper.key){r.cleanup();r.slots=[];r.deps=[];r.renderKey=wrapper.key;}
      r.index=0;r.tree=wrapper.type(wrapper.props);
    }else {r.index=0;r.tree=component(props);}
    return r.tree;
  };
  // Páginas precisam iniciar índice antes da avaliação; o wrapper não tem hooks.
  r.page=(component)=>{r.index=0;r.tree=component();return r.tree;};
  r.flush=()=>{const q=r.effects.splice(0);q.forEach(f=>f());};
  r.dispose=()=>{r.cleanup();r.observers.forEach(ob=>ob.unsub?.());r.qc.clear();};
  r.seed=(route,input,data)=>r.qc.setQueryData(key(route,input),data);
  r.observer=(route,input)=>r.observers.get(hashKey(key(route,input)));
  return r;
}
function nodes(tree,pred=()=>true,active=null,out=[]) {if(Array.isArray(tree)){tree.forEach(t=>nodes(t,pred,active,out));return out;}if(!tree||typeof tree!=='object')return out;const name=tree.type?.ui;const next=name==='Tabs'?tree.props.value:active;if(name==='TabsContent'&&tree.props.value!==active)return out;if(pred(tree))out.push(tree);nodes(tree.props?.children,pred,next,out);return out;}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');if(tree==null||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return text(tree.props?.children);}
function find(r,label){const result=nodes(r.tree,n=>n.type?.ui==='Button'&&text(n).includes(label));assert(result.length,'Botão ausente: '+label);return result[0];}
function click(r,label){const n=find(r,label);assert(!n.props.disabled,'Botão bloqueado: '+label);n.props.onClick();return n;}
function html(tree,active=null){if(Array.isArray(tree))return tree.map(t=>html(t,active));if(!tree||typeof tree!=='object')return tree;const name=tree.type?.ui;const next=name==='Tabs'?tree.props.value:active;if(name==='TabsContent'&&tree.props.value!==active)return null;const tag=typeof tree.type==='string'?tree.type:tree.type===React.Fragment?React.Fragment:name==='Button'?'button':name==='Table'?'table':name==='TableRow'?'tr':name==='TableBody'?'tbody':name==='TableHeader'?'thead':name==='TableCell'?'td':name==='TableHead'?'th':'div';return React.createElement(tag,tag===React.Fragment?{}:{key:tree.key,className:tree.props.className,'data-ui':name,role:tree.props.role,title:tree.props.title,disabled:tree.props.disabled},html(tree.props.children,next));}
function setup(aba='glosas',n=1){
  const r=runtime();r.props={open:true,onOpenChange:()=>{},contratoId:101,abaInicial:aba,escopo:'hospital1'};
  r.inputs={dossie:{contratoId:101},xml:{contratoId:101,limit:300},glosas:{contratoId:101,limit:200}};
  r.seed(routes.dossie,r.inputs.dossie,dossie());r.seed(routes.xml,r.inputs.xml,xml());r.seed(routes.glosas,r.inputs.glosas,glosas(101,n));
  r.component=r.load(path.join(ROOT,'client/src/components/ContratoDossieModal.tsx')).ContratoDossieModal;
  r.draw=()=>r.render(r.component,r.props);r.draw();r.flush();r.draw();return r;
}
function selection(r){click(r,'Selecionar Contestáveis');r.draw();assert(nodes(r.tree,n=>n.type?.ui==='Checkbox')[0]?.props.checked);}

assert.equal(process.env.DATABASE_URL,'');
assert.equal(process.env.NODE_OPTIONS,'--require=/home/ubuntu/reports/issue168/network-guard.cjs');
assert(process.version.startsWith('v22.'));
test('layout_abas_semaforo_zero_excel_escape',()=>{
 const r=setup('resumo');const s=SSR.renderToStaticMarkup(html(r.tree));
 for(const fragment of ['CRÍTICO / RISCO FINANCEIRO','ATENÇÃO OPERACIONAL / XML','OPORTUNIDADE / COBRANÇA','R$ 0,00','w-[1440px]','grid-cols-6','&lt;img','&lt;script'])assert(s.includes(fragment),fragment);
 assert.equal(nodes(r.tree,n=>n.type?.ui==='TabsTrigger').length,6);
 click(r,'Baixar Excel');const b=XLSX.read(XLSX.write(r.workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.equal(b.SheetNames.length,5);assert.equal(b.Sheets['Tabela de Valores'].A4.t,'s');assert.equal(b.Sheets['Tabela de Valores'].A4.f,undefined);assert.equal(b.Sheets['Tabela de Valores'].C4.v,0);
 r.dispose();
});
test('erro_refetch_cache_bloqueia_e_exibe',async()=>{
 const r=setup();selection(r);const oldApply=find(r,'Aplicar Fundamentação').props.onClick,oldExcel=find(r,'Baixar Excel').props.onClick;
 r.functions[routes.glosas]=async()=>{throw new Error('ERRO SINTETICO COM CACHE');};
 await r.observer(routes.glosas,r.inputs.glosas).refetch();r.draw();
 const result=r.observer(routes.glosas,r.inputs.glosas).getCurrentResult();assert(result.isError&&result.data&&!result.isLoading);
 assert(text(r.tree).includes('ERRO SINTETICO COM CACHE'));assert(find(r,'Aplicar Fundamentação').props.disabled);assert(find(r,'Selecionar Contestáveis').props.disabled);assert(find(r,'Baixar Excel').props.disabled);
 oldApply();oldExcel();assert.equal(r.mutations.length,0);assert.equal(r.workbook,undefined);
 assert(!nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked);
 if(process.env.ISSUE182_PREVIEW_PATH){fs.writeFileSync(process.env.ISSUE182_PREVIEW_PATH,'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Issue182 — prévia sintética offline</title><body><p>Prévia sintética offline: JSX real, hosts UI sintéticos. Sem rede/backend/dados reais. Estado: erro de refetch com cache.</p>'+SSR.renderToStaticMarkup(html(r.tree))+'</body></html>\n');}
 r.dispose();
});
test('fetching_antes_render_guard_sincrono',async()=>{
 const r=setup();selection(r);const oldApply=find(r,'Aplicar Fundamentação').props.onClick,oldExcel=find(r,'Baixar Excel').props.onClick;
 const q=deferred();r.functions[routes.glosas]=()=>q.promise;const refetch=r.observer(routes.glosas,r.inputs.glosas).refetch();
 oldApply();oldExcel();assert.equal(r.mutations.length,0);assert(!r.workbook);r.draw();assert(find(r,'Aplicar Fundamentação').props.disabled);
 q.resolve(glosas());await refetch;r.draw();assert.equal(nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked,false);assert(!find(r,'Selecionar Contestáveis').props.disabled);r.dispose();
});
test('invalidacao_cache_antes_render_e_placeholder',()=>{
 const r=setup();selection(r);const apply=find(r,'Aplicar Fundamentação').props.onClick,exp=find(r,'Baixar Excel').props.onClick;
 r.qc.invalidateQueries({queryKey:key(routes.glosas,r.inputs.glosas),refetchType:'none'});apply();exp();assert.equal(r.mutations.length,0);assert(!r.workbook);r.draw();assert(find(r,'Baixar Excel').props.disabled);
 const h=r.load(path.join(ROOT,'client/src/lib/contratoDossieIssue182.ts'));assert(!h.consultaDossiePronta({data:{contratoId:101},isPlaceholderData:true},101));
 r.dispose();
});
test('cache_expirado_no_clique',()=>{
 const r=setup();selection(r);const exp=find(r,'Baixar Excel').props.onClick,apply=find(r,'Aplicar Fundamentação').props.onClick;
 const q=r.qc.getQueryCache().find({queryKey:key(routes.glosas,r.inputs.glosas)});q.setState({dataUpdatedAt:Date.now()-61000});exp();apply();assert(!r.workbook);assert.equal(r.mutations.length,0);r.dispose();
});
test('erro_xml_dossie_cache_exportacao',async()=>{
 for(const route of [routes.xml,routes.dossie]){const r=setup('resumo');const input=route===routes.xml?r.inputs.xml:r.inputs.dossie;r.functions[route]=async()=>{throw new Error('FALHA SINTETICA '+route);};await r.observer(route,input).refetch();r.draw();assert(text(r.tree).includes('FALHA SINTETICA '+route));assert(find(r,'Baixar Excel').props.disabled);find(r,'Baixar Excel').props.onClick();assert(!r.workbook);r.dispose();}
});
test('troca_contrato_hospital_fecha_reabre_limpa',()=>{
 const r=setup();selection(r);const oldApply=find(r,'Aplicar Fundamentação').props.onClick;
 r.props.contratoId=202;r.seed(routes.dossie,{contratoId:202},dossie(202));r.seed(routes.xml,{contratoId:202,limit:300},xml(202));r.seed(routes.glosas,{contratoId:202,limit:200},glosas(202));r.draw();oldApply();assert.equal(r.mutations.length,0);assert(!nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked);
 selection(r);r.props.escopo='hospital2';r.draw();assert(!nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked);
 r.props.open=false;r.draw();r.props.open=true;r.props.abaInicial='xml';r.draw();assert.equal(nodes(r.tree,n=>n.type?.ui==='Tabs')[0].props.value,'xml');r.dispose();
});
test('abaInicial_mudanca_e_reabertura',()=>{
 const r=setup('resumo');r.props.abaInicial='xml';r.draw();r.flush();r.draw();assert.equal(nodes(r.tree,n=>n.type?.ui==='Tabs')[0].props.value,'xml');r.props.open=false;r.draw();r.props.abaInicial='glosas';r.props.open=true;r.draw();assert.equal(nodes(r.tree,n=>n.type?.ui==='Tabs')[0].props.value,'glosas');r.dispose();
});
test('competencia_e_filtro_guard_antes_effect',()=>{
 const r=setup();selection(r);const oldApply=find(r,'Aplicar Fundamentação').props.onClick,oldExcel=find(r,'Baixar Excel').props.onClick;
 const field=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.placeholder?.includes('Competência'))[0];field.props.onChange({target:{value:'2026-02'}});oldApply();oldExcel();assert.equal(r.mutations.length,0);assert(!r.workbook);
 r.seed(routes.glosas,{contratoId:101,competencia:'2026-02',limit:200},glosas());r.draw();r.flush();r.draw();assert(!nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked);
 selection(r);const old=find(r,'Aplicar Fundamentação').props.onClick;const card=nodes(r.tree,n=>n.props.onClick&&text(n).includes('Pago Abaixo da Tabela')&&n.type==='div')[0];card.props.onClick();old();assert.equal(r.mutations.length,0);r.dispose();
});
test('teto200_payload_e_selecao_manual_sincrona',async()=>{
 const r=setup('glosas',250);selection(r);assert.equal(nodes(r.tree,n=>n.type?.ui==='Checkbox'&&n.props.checked).length,200);const request=r.calls.find(c=>c.route===routes.glosas);assert.equal(request.input.limit,200);
 click(r,'Aplicar Fundamentação');await tick();assert.equal(r.mutations[0].input.itens.length,200);await Promise.all(r.promises);await tick();r.dispose();
 const manual=setup('glosas',250);const cbs=nodes(manual.tree,n=>n.type?.ui==='Checkbox');cbs.forEach(c=>c.props.onCheckedChange(true));manual.draw();assert.equal(nodes(manual.tree,n=>n.type?.ui==='Checkbox'&&n.props.checked).length,200);manual.dispose();
});
test('double_submit_mesmo_tick_e_remount',async()=>{
 const r=setup();selection(r);const pending=deferred();r.functions[routes.aplicar]=()=>pending.promise;
 const b=find(r,'Aplicar Fundamentação');b.props.onClick();b.props.onClick();await tick();assert.equal(r.mutations.length,1);r.draw();assert(find(r,'Aplicar Fundamentação').props.disabled);assert(find(r,'Baixar Excel').props.disabled);
 r.props.open=false;r.draw();r.props.open=true;r.draw();assert(find(r,'Enriquecer').props.disabled);find(r,'Enriquecer').props.onClick();await tick();assert.equal(r.mutations.length,1);
 pending.resolve({atualizados:0});await Promise.all(r.promises);await tick();assert.equal(r.toasts.length,0,'remount não recebe toast antigo');r.dispose();
});
test('resultado_ia_seis_combinacoes_e_rejeicao',async()=>{
 for(const result of [{geradoComIA:true,salvo:true,motivo:null},{geradoComIA:true,salvo:false,motivo:null},{geradoComIA:false,salvo:false,motivo:'sem_texto'},{geradoComIA:false,salvo:false,motivo:'ia_indisponivel'},{geradoComIA:false,salvo:true,motivo:'sem_texto'},{geradoComIA:false,salvo:true,motivo:'ia_indisponivel'}]){
  const r=setup('resumo');r.functions[routes.ia]=async()=>({...result,dossie:dossie()});click(r,'Enriquecer');assert.equal(r.toasts.length,0);await tick();await Promise.all(r.promises);await tick();const toast=r.toasts[0];assert.equal(toast.type,result.geradoComIA&&result.salvo?'success':'warning');assert(toast.msg.includes(result.salvo?'Salvamento confirmado':'Não houve salvamento'));if(!result.geradoComIA)assert(toast.msg.includes('sem enriquecimento com IA'));assert.equal(r.invalidations.length,result.salvo?4:0);r.dispose();
 }
 const r=setup('resumo');r.functions[routes.ia]=async()=>{throw new Error('NEGADO SINTETICO');};click(r,'Enriquecer');await tick();await Promise.all(r.promises);await tick();assert.equal(r.toasts[0].type,'error');assert(r.toasts[0].msg.includes('NEGADO'));r.dispose();
});
test('mutacao_tardia_ia_fora_ordem_origem',async()=>{
 const r=setup('resumo');const a=deferred(),b=deferred();r.functions[routes.ia]=input=>input.contratoId===101?a.promise:b.promise;
 click(r,'Enriquecer');await tick();r.props.contratoId=202;r.seed(routes.dossie,{contratoId:202},dossie(202));r.seed(routes.xml,{contratoId:202,limit:300},xml(202));r.seed(routes.glosas,{contratoId:202,limit:200},glosas(202));r.draw();r.flush();click(r,'Enriquecer');await tick();
 b.resolve({dossie:dossie(202),geradoComIA:true,salvo:true,motivo:null});await tick();a.resolve({dossie:dossie(101),geradoComIA:true,salvo:true,motivo:null});await Promise.all(r.promises);await tick();
 assert.equal(r.toasts.length,1);assert.deepEqual(r.invalidations.filter(i=>i.route===routes.dossie).map(i=>i.arg.contratoId),[202,101]);assert.equal(r.qc.getQueryData(key(routes.dossie,{contratoId:202})).contratoId,202);r.dispose();
});
test('mutacao_tardia_mesmo_contrato_filtro_volta_sem_toast',async()=>{
 const r=setup();const pending=deferred();r.functions[routes.ia]=()=>pending.promise;click(r,'Enriquecer');await tick();
 const field=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.placeholder?.includes('Competência'))[0];field.props.onChange({target:{value:'2026-02'}});r.seed(routes.glosas,{contratoId:101,competencia:'2026-02',limit:200},glosas());r.draw();r.flush();
 const other=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.placeholder?.includes('Competência'))[0];other.props.onChange({target:{value:''}});r.draw();
 pending.resolve({dossie:dossie(),geradoComIA:true,salvo:true,motivo:null});await Promise.all(r.promises);await tick();assert.equal(r.toasts.length,0);assert(r.invalidations.every(i=>i.arg.contratoId===101));r.dispose();
});
test('mutacao_tardia_glosas_tabela_recorte_origem',async()=>{
 for(const tipo of ['glosas','tabela']){
 const r=setup(tipo==='glosas'?'glosas':'tabela');const p=deferred();r.functions[tipo==='glosas'?routes.aplicar:routes.tabela]=()=>p.promise;if(tipo==='glosas')selection(r);click(r,tipo==='glosas'?'Aplicar Fundamentação':'Sincronizar Preços');await tick();r.props.escopo='hospital2';r.props.contratoId=202;r.seed(routes.dossie,{contratoId:202},dossie(202));r.seed(routes.xml,{contratoId:202,limit:300},xml(202));r.seed(routes.glosas,{contratoId:202,limit:200},glosas(202));r.draw();r.flush();if(tipo==='glosas')selection(r);p.resolve(tipo==='glosas'?{atualizados:1}:{inseridos:1,atualizados:0});await Promise.all(r.promises);await tick();assert.equal(r.toasts.length,0);assert(r.invalidations.length);assert(r.invalidations.every(i=>i.arg.contratoId===101));if(tipo==='glosas'){r.draw();assert(nodes(r.tree,n=>n.type?.ui==='Checkbox')[0].props.checked);}r.dispose();
 }
});
test('query_resposta_fora_ordem_nao_troca_cache_atual',async()=>{
 const r=setup('resumo');const p=deferred();r.functions[routes.dossie]=()=>p.promise;const pending=r.observer(routes.dossie,r.inputs.dossie).refetch();r.props.contratoId=202;r.seed(routes.dossie,{contratoId:202},dossie(202));r.seed(routes.xml,{contratoId:202,limit:300},xml(202));r.seed(routes.glosas,{contratoId:202,limit:200},glosas(202));r.draw();p.resolve(dossie(101));await pending;r.draw();assert(text(r.tree).includes('CONVENIO FICTICIO 202'));assert(!text(r.tree).includes('CONVENIO FICTICIO 101'));r.dispose();
});
test('paginas_contexto_sem_hoje_sem_falsa_precisao',()=>{
 for(const page of ['RecursoGlosaConciliacao','RecursoGlosaDemonstrativo']){
 const r=runtime();r.queries['contratosConvenios.obterContextoGlosa']={data:{statusContexto:'indeterminado',dataReferencia:null,possuiContratoAtivo:false,contratos:[],documentos:[],regrasNegocio:[]}};
 const c=r.load(path.join(ROOT,'client/src/pages/'+page+'.tsx')).default;r.page(c);r.flush();r.page(c);
 const q=r.calls.filter(c=>c.route==='contratosConvenios.obterContextoGlosa').at(-1);assert.equal(q.input.dataReferencia,undefined);assert(!Object.hasOwn(q.input,'dataReferencia'));assert(text(r.tree).includes('data de execução única e autoritativa'));assert.equal(nodes(r.tree,n=>n.type?.ui==='ContratoDossieModal').length,0);r.dispose();
 }
});
test('paginas_modal_troca_hospital_guard_sincrono',()=>{
 for(const page of ['ContratosConvenios','RecursoGlosaConciliacao','RecursoGlosaDemonstrativo']){
 const r=runtime();r.queries['contratosConvenios.obterContextoGlosa']={data:{dataReferencia:'2026-01-07',possuiContratoAtivo:true,contratos:[{id:101,convenioNome:'FICTICIO'}],documentos:[],regrasNegocio:[]}};
 r.queries['contratosConvenios.listar']={data:[{id:101,convenioId:1001,status:'ativo'}]};r.queries['convenios.list']={data:[{id:1001,nome:'FICTICIO'}]};const c=r.load(path.join(ROOT,'client/src/pages/'+page+'.tsx')).default;r.page(c);r.flush();r.page(c);click(r,page==='ContratosConvenios'?'Cobrança XML':'Pontos de Atenção');r.page(c);assert.equal(nodes(r.tree,n=>n.type?.ui==='ContratoDossieModal')[0].props.contratoId,101);
 const filter=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.onChange)[0];assert(filter);filter.props.onChange({target:{value:'filtro-sintetico'}});r.page(c);assert.equal(nodes(r.tree,n=>n.type?.ui==='ContratoDossieModal').length,0,'filtro antes effects');r.flush();r.page(c);filter.props.onChange({target:{value:''}});r.page(c);r.flush();r.page(c);click(r,page==='ContratosConvenios'?'Cobrança XML':'Pontos de Atenção');r.page(c);r.state.hospital=2;r.page(c);assert.equal(nodes(r.tree,n=>n.type?.ui==='ContratoDossieModal').length,0,'antes effects');r.flush();r.page(c);assert.equal(nodes(r.tree,n=>n.type?.ui==='ContratoDossieModal').length,0);r.dispose();
 }
});
test('coluna_conciliacao_jsx_real_status_zero_recorte',()=>{
 const file=path.join(ROOT,'client/src/pages/ConciliacaoCruzada.tsx'),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let row,query;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='itensGuia.map')row=n.arguments[0].getText(ast);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='trpc.faturamentoUnificado.itensPorGuia.useQuery')query=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(row&&query);
 const js=ts.transpileModule('exports.row = '+row+'; exports.query = ()=> '+query+';',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};let called;
 vm.runInNewContext('(function(require,module,exports){'+js+'})',{formatarMoeda:n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),Badge:p=>React.createElement('span',null,p.children),formatDateBR:s=>s,getStatusBadge:()=>null,trpc:{faturamentoUnificado:{itensPorGuia:{useQuery:(input,options)=>called={input,options}}}},estabelecimentoId:1,guiaSelecionada:{contaNumero:'CONTA-SINT',numeroGuia:'GUIA-SINT'},fonteBanco:false})(req,m,m.exports);
 m.exports.query();assert.deepEqual(JSON.parse(JSON.stringify(called.input)),{estabelecimentoId:1,contaNumero:'CONTA-SINT',numeroGuia:'GUIA-SINT'});
 for(const item of [{statusAuditoriaContrato:'indisponivel',statusCobrancaContrato:'auditoria_indisponivel',valorContratadoTotal:null},{statusAuditoriaContrato:'indeterminado',statusCobrancaContrato:'indeterminado',valorContratadoTotal:null},{statusAuditoriaContrato:'disponivel',statusCobrancaContrato:'cobranca_menor_contrato',valorContratadoTotal:0}]){const s=SSR.renderToStaticMarkup(m.exports.row({...item,id:1,quantidade:0,valorFaturado:0,valorTotal:80,valorPago:0,valorGlosa:0},0));assert(s.includes('R$ 0,00'));assert(!s.includes('R$ 80,00'));if(item.statusAuditoriaContrato==='indisponivel')assert(s.includes('Auditoria indisponível')&&s.includes('Falha na auditoria'));if(item.statusAuditoriaContrato==='indeterminado')assert(s.includes('Base indeterminada')&&s.includes('Nenhum valor foi estimado'));if(item.statusAuditoriaContrato==='disponivel')assert(s.includes('Cobrado a Menor'));}
});
test('navegacao_rotas_preservadas',()=>{const r=setup();click(r,'Abrir Recurso (Demonstrativo)');click(r,'Abrir Recurso (Conciliação)');assert.deepEqual(r.locations,['/recurso-glosa-demonstrativo','/recurso-glosa-conciliacao']);r.dispose();});
(async()=>{for(const {name,fn} of scenarios){await fn();reports.push({name,result:'PASS'});console.log('PASS '+name);}console.log(JSON.stringify({node:process.version,scenarios:reports.length,backend:0,network:0,realMutations:0,reports}));})().catch(e=>{console.error(e);process.exitCode=1;});
