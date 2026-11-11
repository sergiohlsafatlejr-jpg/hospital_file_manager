const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ROOT = process.cwd();
assert.equal(process.env.DATABASE_URL, '');
assert.equal(process.env.NODE_OPTIONS, '--require=/home/ubuntu/reports/issue168/network-guard.cjs');
const file = path.join(ROOT, 'client/src/lib/contratoDossieIssue182.harness.cjs');
let source = fs.readFileSync(file, 'utf8').split("assert.equal(process.env.DATABASE_URL,'');")[0];
const old = "group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,name)=>({invalidate:arg=>{r.invalidations.push({route:g+'.'+name,arg});return Promise.resolve();}})})})";
assert(source.includes(old));
source = source.replace(old, "group==='useUtils'?()=>new Proxy({}, {get:(_,g)=>new Proxy({}, {get:(_,name)=>({invalidate:arg=>{r.invalidations.push({route:g+'.'+name,arg});return r.realUtils[g][name].invalidate(arg);}})})})");
source = source.replace('const hooks={...React', "r.realUtils=req('@trpc/react-query').createTRPCQueryUtils({queryClient:r.qc,client:new (req('@trpc/client').TRPCUntypedClient)({links:[]})});\n  const hooks={...React");
// O shim normaliza chaves entre realms VM; utilitários de invalidação são reais.
source += `
(async () => {
 for (const tipo of ['tabela', 'ia']) {
  const r = setup(tipo === 'tabela' ? 'tabela' : 'resumo');
  const neighbor = {contratoId:101,competencia:'2026-02',limit:200};
  const other = {contratoId:202,competencia:'2026-02',limit:200};
  const xmlNeighbor = {contratoId:101,competencia:'2026-02',loteXml:'LOTE-SINTETICO',limit:300};
  const anterior = glosas(); anterior.itens[0].valorRecursoSugerido=20; anterior.itens[0].justificativaContratualSugerida='BASE ANTERIOR SINTETICA';
  r.seed(routes.glosas,neighbor,anterior); r.seed(routes.xml,xmlNeighbor,xml()); r.seed(routes.glosas,other,glosas(202));
  const beforeOther = r.qc.getQueryState(key(routes.glosas,other));
  r.functions[routes.tabela]=async()=>({inseridos:1,atualizados:0});
  r.functions[routes.ia]=async()=>({dossie:dossie(),geradoComIA:true,salvo:true,motivo:null});
  r.functions[routes.dossie]=async()=>dossie(); r.functions[routes.xml]=async()=>xml();
  r.functions[routes.glosas]=async()=>{const nova=glosas();nova.itens[0].valorRecursoSugerido=99;nova.itens[0].justificativaContratualSugerida='BASE NOVA SINTETICA';return nova;};
  click(r,tipo==='tabela'?'Sincronizar Preços':'Enriquecer'); await tick(); await Promise.all(r.promises); await tick(); r.draw();r.flush();r.draw();
  assert.equal(r.qc.getQueryState(key(routes.glosas,neighbor)).isInvalidated,true,'competência vizinha de glosas invalidada');
  assert.equal(r.qc.getQueryState(key(routes.xml,xmlNeighbor)).isInvalidated,true,'competência/lote XML vizinho invalidado');
  assert.equal(r.qc.getQueryState(key(routes.glosas,other)).isInvalidated,false,'outro contrato não é invalidado');
  assert.equal(r.qc.getQueryState(key(routes.glosas,other)).dataUpdatedAt,beforeOther.dataUpdatedAt);
  r.props.abaInicial='glosas';r.draw();r.flush();r.draw();
  const field=nodes(r.tree,n=>n.type?.ui==='Input'&&n.props.placeholder?.includes('Competência'))[0];
  field.props.onChange({target:{value:'2026-02'}});r.draw();r.flush();r.draw();
  const selecionar=find(r,'Selecionar Contestáveis');
  if (selecionar.props.disabled) {
    assert(find(r,'Aplicar Fundamentação').props.disabled,'aplicação bloqueada enquanto revalida');
    selecionar.props.onClick(); find(r,'Aplicar Fundamentação').props.onClick();
  } else {
    selection(r); click(r,'Aplicar Fundamentação');
  }
  await tick();
  const emitidos=r.mutations.filter(m=>m.route===routes.aplicar);
  assert(emitidos.every(m=>m.input.itens.every(i=>i.valorRecurso!==20 && i.justificativa!=='BASE ANTERIOR SINTETICA')),'base anterior nunca emitida');
  await Promise.all(r.promises);await tick();r.draw();r.flush();r.draw();
  assert.equal(r.observer(routes.glosas,neighbor).getCurrentResult().data.itens[0].valorRecursoSugerido,99);
  r.dispose();console.log('PASS cache_competencia_lote_vizinhos_'+tipo);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
`;
vm.runInThisContext('(function(require){'+source+'\n})', {filename:file+'-positive-cache-regression'})(require);
