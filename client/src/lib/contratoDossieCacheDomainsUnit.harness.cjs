'use strict';
/* TSX/helper reais em VM; hooks/UI sintéticos, QueryClient/Observer e utils
 * tRPC reais. Simula eventos pós-render; não substitui a regressão DOM real. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
assert.equal(process.env.DATABASE_URL, '');
assert.equal(process.env.JWT_SECRET, 'synthetic-test-only-not-production-issue177-validation');
assert.equal(process.env.VITE_APP_ID, 'synthetic-validation-app');
assert.equal(process.env.OAUTH_SERVER_URL, 'https://auth.example.invalid');
assert.equal(process.env.TZ, 'America/Sao_Paulo');
require('./contratoDossieCacheDomainsDom.networkGuard.cjs');
assert.throws(() => require('node:net').connect({host:'127.0.0.1',port:1}), {code:'DOSSIE_DOM_NETWORK_FORBIDDEN'});
const file = path.join(process.cwd(), 'client/src/lib/contratoDossieIssue182.harness.cjs');
let prefix = fs.readFileSync(file, 'utf8').split("assert.equal(process.env.DATABASE_URL,'');")[0];
const originalUtils = "group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,name)=>({invalidate:arg=>{r.invalidations.push({route:g+'.'+name,arg});return Promise.resolve();}})})})";
assert(prefix.includes(originalUtils));
prefix = prefix.replace(originalUtils, "group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,name)=>({invalidate:arg=>{r.invalidations.push({route:g+'.'+name,arg});return r.realUtils[g][name].invalidate(arg);}})})})");
prefix = prefix.replace('const hooks={...React', "r.realUtils=req('@trpc/react-query').createTRPCQueryUtils({queryClient:r.qc,client:new (req('@trpc/client').TRPCUntypedClient)({links:[]})});\n  const hooks={...React");
assert(prefix.includes('r.cleanups[i]=fn();'));
prefix = prefix.replace('r.cleanups[i]=fn();', 'r.cleanups[i]=fn();if(fn.toString().includes("hashesBase"))r.unsubscribeCache=r.cleanups[i];');
const cases = String.raw`
function auto(r) { return find(r, 'Responder Recursos Automaticamente'); }
function cbs(r) { return nodes(r.tree, n=>n.type?.ui==='Checkbox'); }
async function done(r) { await tick(); await Promise.all(r.promises); await tick(); }
function cached(r, route, input) { return r.qc.getQueryCache().find({queryKey:key(route,input)}); }
function afterRenderOptions(r) {
 const events=[];
 const unsub=r.qc.getQueryCache().subscribe(e=>events.push({type:e.type,status:e.query.state.status}));
 for(const ob of r.observers.values()) {
  const previous=ob.options.queryFn;
  ob.setOptions({...ob.options,queryFn:context=>previous(context)});
 }
 unsub();
 assert(events.some(e=>e.type==='observerOptionsUpdated'), 'QueryObserver.setOptions real emitiu evento');
 return events;
}
async function xmlError(r) {
 r.functions[routes.xml]=async()=>{throw new Error('ERRO XML PERSISTENTE SINTETICO');};
 await r.observer(routes.xml,r.inputs.xml).refetch(); r.draw();r.flush();r.draw();
}
function noExport(r, handler=find(r,'Baixar Excel').props.onClick) {
 handler(); assert.equal(r.workbook,undefined,'XML não validado nunca gera workbook');
}

test('xml_erro_persistente_options_pos_render_selecao_manual_auto', async()=>{
 for(const mode of ['manual','auto']) {
  const r=setup(); await xmlError(r);
  assert(afterRenderOptions(r).some(e=>e.type==='observerOptionsUpdated'&&e.status==='error'));
  assert(!find(r,'Selecionar Contestáveis').props.disabled);assert(!auto(r).props.disabled);
  assert(find(r,'Baixar Excel').props.disabled);noExport(r);
  if(mode==='manual') { selection(r);afterRenderOptions(r);click(r,'Aplicar Fundamentação'); }
  else click(r,'Responder Recursos Automaticamente');
  assert.equal(r.toasts.length,0,'nenhuma confirmação antes do ack');
  await done(r);assert.equal(r.mutations.length,1);assert.equal(r.mutations[0].route,routes.aplicar);
  assert.equal(r.mutations[0].input.itens.length,1);assert.equal(r.toasts[0].type,'success');r.dispose();
 }
});

test('avisos_xml_independente_e_glosa_erro_bloqueada',async()=>{
 const r=setup();await xmlError(r);
 for(const role of ['alert','status']) {
  const message=nodes(r.tree,n=>n.props.role===role).map(text).join(' ');
  assert(message.includes('aplicação de fundamentação nas glosas disponível'));
  assert(/exportação completa bloqueada/i.test(message));
  assert(!/Aplicação e exportação bloqueadas|cache não estão autorizados/.test(message));
 }
 r.functions[routes.glosas]=async()=>{throw new Error('ERRO GLOSA SINTETICA');};
 await r.observer(routes.glosas,r.inputs.glosas).refetch();r.draw();afterRenderOptions(r);
 assert(auto(r).props.disabled);assert(find(r,'Selecionar Contestáveis').props.disabled);
 assert(nodes(r.tree,n=>n.props.role==='status').map(text).join(' ').includes('exportação completa bloqueadas'));
 auto(r).props.onClick();await done(r);assert.equal(r.mutations.length,0);r.dispose();
});

test('eventos_exclusivos_xml_preservam_selecao_e_handlers_glosas',async()=>{
 for(const how of ['fetch','invalidate','stale','remove','replace']) {
  const r=setup();selection(r);const oldApply=find(r,'Aplicar Fundamentação').props.onClick;
  const oldExcel=find(r,'Baixar Excel').props.onClick;let pending,p;
  if(how==='fetch') { p=deferred();r.functions[routes.xml]=()=>p.promise;pending=r.observer(routes.xml,r.inputs.xml).refetch(); }
  if(how==='invalidate') r.qc.invalidateQueries({queryKey:key(routes.xml,r.inputs.xml),refetchType:'none'});
  if(how==='stale') cached(r,routes.xml,r.inputs.xml).setState({dataUpdatedAt:Date.now()-61000});
  if(how==='remove') r.qc.removeQueries({queryKey:key(routes.xml,r.inputs.xml)});
  if(how==='replace') { const next=xml();next.itens[0].descricaoItem='XML NOVO SINTETICO';r.seed(routes.xml,r.inputs.xml,next); }
  noExport(r,oldExcel);oldApply();await done(r);
  assert.equal(r.mutations.length,1,'evento XML não revoga glosas frescas: '+how);
  if(p) {p.resolve(xml());await pending;}r.dispose();
 }
 const r=setup();selection(r);await xmlError(r);afterRenderOptions(r);
 assert(cbs(r).every(c=>c.props.checked),'erro XML não limpa seleção independente');r.dispose();
});

test('xml_muda_filtro_ou_refaz_somente_xml_nao_revoga_glosas',async()=>{
 for(const how of ['competencia','lote','refetch']) {
  const r=setup();selection(r);const apply=find(r,'Aplicar Fundamentação').props.onClick;
  const excel=find(r,'Baixar Excel').props.onClick;
  r.props.abaInicial='xml';r.draw();r.flush();r.draw();let pending;
  if(how==='refetch') { pending=deferred();r.functions[routes.xml]=()=>pending.promise;click(r,'Recalcular'); }
  else {
   const field=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.placeholder?.includes(how==='lote'?'Lote XML':'Competência'))[0];
   field.props.onChange({target:{value:how==='lote'?'LOTE-FICTICIO':'2026-02'}});
  }
  noExport(r,excel);apply();await done(r);assert.equal(r.mutations.length,1,how);
  if(pending) {pending.resolve(xml());await tick();}r.dispose();
 }
});

test('transicoes_base_completas_antes_render_revogam_handler_antigo',async()=>{
 for(const route of [routes.dossie,routes.glosas])for(const how of ['fetch','error','invalidate','stale','remove','replace']) {
  const r=setup();selection(r);const apply=find(r,'Aplicar Fundamentação').props.onClick;
  const automatic=auto(r).props.onClick;const excel=find(r,'Baixar Excel').props.onClick;
  const input=route===routes.dossie?r.inputs.dossie:r.inputs.glosas;
  const fresh=()=>route===routes.dossie?dossie():glosas();
  if(how==='fetch') {r.functions[route]=async()=>fresh();await r.observer(route,input).refetch();}
  if(how==='error') {r.functions[route]=async()=>{throw new Error('ERRO BASE SINTETICA');};await r.observer(route,input).refetch();r.seed(route,input,fresh());}
  if(how==='invalidate') {r.qc.invalidateQueries({queryKey:key(route,input),refetchType:'none'});r.seed(route,input,fresh());}
  if(how==='stale') {cached(r,route,input).setState({dataUpdatedAt:Date.now()-61000});r.seed(route,input,fresh());}
  if(how==='remove') {r.qc.removeQueries({queryKey:key(route,input)});r.seed(route,input,fresh());}
  if(how==='replace') {const next=fresh();next.convenioNome='BASE NOVA SINTETICA';r.seed(route,input,next);}
  apply();automatic();noExport(r,excel);await done(r);assert.equal(r.mutations.length,0,route+'/'+how);
  r.draw();r.flush();r.draw();assert(cbs(r).every(c=>!c.props.checked),'seleção anterior removida');r.dispose();
 }
});

test('eventos_sem_transicao_nao_revogam_glosas_frescas',async()=>{
 const r=setup();selection(r);const apply=find(r,'Aplicar Fundamentação').props.onClick;
 for(const [route,input] of [[routes.dossie,r.inputs.dossie],[routes.glosas,r.inputs.glosas]]) cached(r,route,input).setState({});
 afterRenderOptions(r);apply();await done(r);assert.equal(r.mutations.length,1);r.dispose();
});

test('cache_inline_bloqueia_hook_fresco_com_estado_error_fetch_invalidated_stale',async()=>{
 for(const route of [routes.dossie,routes.glosas,routes.xml])for(const how of ['error','fetch','invalidate','stale']) {
  const r=setup();selection(r);const apply=find(r,'Aplicar Fundamentação').props.onClick;
  const excel=find(r,'Baixar Excel').props.onClick;const input=route===routes.dossie?r.inputs.dossie:route===routes.glosas?r.inputs.glosas:r.inputs.xml;
  // Retira apenas a assinatura do componente: prova que o guard consulta cache no clique.
  assert.equal(typeof r.unsubscribeCache,'function');r.unsubscribeCache();
  const changes=how==='error'?{status:'error'}:how==='fetch'?{fetchStatus:'fetching'}:how==='invalidate'?{isInvalidated:true}:{dataUpdatedAt:Date.now()-61000};
  cached(r,route,input).setState(changes);
  noExport(r,excel);apply();await done(r);
  assert.equal(r.mutations.length,route===routes.xml?1:0,route+'/'+how);r.dispose();
 }
});

test('revalidar_agora_recupera_glosas_com_xml_erro_options_pos_render',async()=>{
 const r=setup();selection(r);r.functions[routes.glosas]=async()=>{throw new Error('ERRO GLOSA SINTETICA');};
 await r.observer(routes.glosas,r.inputs.glosas).refetch();r.draw();r.flush();r.draw();
 const old=auto(r).props.onClick;r.functions[routes.dossie]=async()=>dossie();r.functions[routes.glosas]=async()=>glosas();
 r.functions[routes.xml]=async()=>{throw new Error('XML AINDA INDISPONIVEL SINTETICO');};
 click(r,'Revalidar Agora');old();await tick();await tick();assert.equal(r.mutations.length,0);
 r.draw();r.flush();r.draw();afterRenderOptions(r);
 assert(cbs(r).every(c=>!c.props.checked));assert(!auto(r).props.disabled);noExport(r);
 click(r,'Responder Recursos Automaticamente');await done(r);assert.equal(r.mutations.length,1);r.dispose();
});

test('auto_preserva_filtros_teto200_e_payload_sem_ia',async()=>{
 for(const label of [null,'Pago Abaixo da Tabela','Glosas Totais Contestáveis','Já c/ Justificativa Salva']) {
  const r=setup('glosas',250);const data=glosas(101,250);
  const classes=['glosa_indevida_abaixo_contrato','glosa_total_contestavel','glosa_tecnica_contestavel','ajuste_contratual_legitimo'];
  data.itens.forEach((item,index)=>{item.classificacaoContrato=classes[index%4];item.valorRecursoSugerido=index%7===0?0:20+index;});
  r.seed(routes.glosas,r.inputs.glosas,data);r.draw();r.flush();r.draw();await xmlError(r);afterRenderOptions(r);
  if(label) {nodes(r.tree,n=>n.type==='div'&&n.props.onClick&&text(n).includes(label))[0].props.onClick();r.draw();r.flush();r.draw();}
  click(r,'Selecionar Contestáveis');r.draw();const count=cbs(r).filter(c=>c.props.checked).length;assert(count>0&&count<=200);
  const classification=label===null?null:classes[['Pago Abaixo da Tabela','Glosas Totais Contestáveis','Já c/ Justificativa Salva'].indexOf(label)];
  const expected=data.itens.filter(i=>(!classification||i.classificacaoContrato===classification)&&i.classificacaoContrato!=='ajuste_contratual_legitimo'&&i.valorRecursoSugerido>0).slice(0,200);
  click(r,'Responder Recursos Automaticamente');await done(r);
  assert.equal(r.mutations.length,1);const input=r.mutations[0].input;
  assert.deepEqual(Object.keys(input).sort(),['contratoId','itens']);assert.equal(input.contratoId,101);
  assert.equal(input.itens.length,count);assert(input.itens.every(i=>i.valorRecurso>0));
  assert.deepEqual(JSON.parse(JSON.stringify(input.itens)),expected.map(i=>({id:i.id,origem:i.origem,justificativa:i.justificativaContratualSugerida,valorRecurso:i.valorRecursoSugerido})));
  for(const item of input.itens)assert.deepEqual(Object.keys(item).sort(),['id','justificativa','origem','valorRecurso']);r.dispose();
 }
 const r=setup('glosas',250);await xmlError(r);afterRenderOptions(r);cbs(r)[249].props.onCheckedChange(true);r.draw();
 click(r,'Responder Recursos Automaticamente');await done(r);assert.equal(r.mutations[0].input.itens.length,200);
 assert.deepEqual(r.mutations[0].input.itens.map(i=>i.id),Array.from({length:200},(_,i)=>i+1));r.dispose();
});

test('ack_glosas_invalida_todas_competencias_so_contrato_originario',async()=>{
 const r=setup();const neighbor={contratoId:101,competencia:'2026-02',limit:200};const other={contratoId:202,competencia:'2026-02',limit:200};
 r.seed(routes.glosas,neighbor,glosas());r.seed(routes.glosas,other,glosas(202));await xmlError(r);afterRenderOptions(r);
 const p=deferred();r.functions[routes.aplicar]=()=>p.promise;click(r,'Responder Recursos Automaticamente');await tick();
 assert.equal(r.toasts.length,0);assert(!cached(r,routes.glosas,neighbor).state.isInvalidated);
 p.resolve({atualizados:0});await done(r);assert(cached(r,routes.glosas,neighbor).state.isInvalidated);
 assert(!cached(r,routes.glosas,other).state.isInvalidated);assert(r.toasts[0].msg.includes('0 item(ns)'));
 assert(!/enviado|envio|portal|com IA/i.test(r.toasts[0].msg));r.dispose();
});

(async()=>{
 let failed=0;
 for(const {name,fn} of scenarios) {
  try {await fn();reports.push({name,result:'PASS'});console.log('PASS '+name);}
  catch(error) {failed++;reports.push({name,result:'FAIL',error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}
 }
 console.log(JSON.stringify({scenarios:reports.length,failed,reports}));process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
`;
vm.runInThisContext('(function(require){'+prefix+'\n'+cases+'\n})', {filename:__filename})(require);
