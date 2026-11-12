'use strict';
require('./contratoDossieCacheDomainsDom.networkGuard.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const req = createRequire(path.join(root, 'package.json'));
let browser, temporary;
const timeout = setTimeout(() => {
  console.error('FAIL DOM_TOTAL_TIMEOUT_180000');
  browser?.process()?.kill('SIGKILL');
  if(temporary)fs.rmSync(temporary,{recursive:true,force:true});
  process.exit(1);
}, 180000);
const productHashes = sourceRoot => Object.fromEntries(['client/src/components/ContratoDossieModal.tsx','client/src/lib/contratoDossieIssue182.ts','client/src/index.css'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,file))).digest('hex')]));

function executable(puppeteer) {
  const candidates = [];
  const explicit = process.env.DOSSIE_DOM_CHROMIUM;
  if (explicit) candidates.push(path.resolve(explicit));
  try { candidates.push(puppeteer.executablePath()); } catch {}
  for (const dir of (process.env.PATH || '').split(path.delimiter))
    for (const file of ['chromium', 'chromium-browser', 'google-chrome', 'chrome', 'chrome-headless-shell', 'headless_shell']) candidates.push(path.join(dir, file));
  // Cache padrão do Puppeteer, sem depender de uma revisão/binário fixos.
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  function walk(dir, depth) {
    if (!depth || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, depth - 1);
      else if (['chrome', 'chrome-headless-shell', 'headless_shell', 'chromium'].includes(entry.name)) candidates.push(file);
    }
  }
  walk(cache, 4);
  const found = candidates.find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } });
  if (!found || (explicit && found !== path.resolve(explicit))) throw new Error('CHROMIUM_EXECUTABLE_REQUIRED: instale Chromium/headless_shell ou defina DOSSIE_DOM_CHROMIUM executável; não há skip.');
  return found;
}

async function build(out, sourceRoot) {
  const {build} = await import(req.resolve('vite'));
  const {default:tailwind} = await import(req.resolve('@tailwindcss/vite'));
  fs.writeFileSync(path.join(out, 'dom-app.tsx'), require('./contratoDossieCacheDomainsDom.app.cjs'));
  fs.writeFileSync(path.join(out, 'dom.css'), '@import '+JSON.stringify(path.join(sourceRoot,'client/src/index.css'))+';\n@source '+JSON.stringify(path.join(sourceRoot,'client/src'))+';\n');
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste privado offline — dados fictícios</title></head><body><div id="root"></div><script type="module" src="/dom-app.tsx"></script></body></html>\n');
  // Montagem limpa: nenhuma transformação/instrumentação do componente/helper.
  await build({configFile:false,root:out,base:'./',esbuild:{jsx:'automatic'},plugins:[{
    name:'offline-trpc-toast-navigation',enforce:'pre',resolveId(source) {
      if (['@/lib/trpc',path.join(sourceRoot,'client/src/lib/trpc'),path.join(sourceRoot,'client/src/lib/trpc.ts'),'sonner','wouter'].includes(source)) return path.join(out, 'dom-app.tsx');
    }
  },tailwind()],resolve:{alias:[{find:'@',replacement:path.join(sourceRoot,'client/src')},{find:'@shared',replacement:path.join(sourceRoot,'shared')},...['react','react/jsx-runtime','react-dom','react-dom/client','@tanstack/react-query','@trpc/react-query'].map(p=>({find:new RegExp('^'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),replacement:req.resolve(p)}))],dedupe:['react','react-dom']},build:{outDir:path.join(out,'dist'),emptyOutDir:true,minify:false,sourcemap:false},logLevel:'warn'});
  const dist = path.join(out,'dist');
  let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  html=html.replace(/<script type="module" crossorigin src="\.\/([^\"]+)"><\/script>/g,(_,file)=>'<script type="module">'+fs.readFileSync(path.join(dist,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
  html=html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^\"]+)">/g,(_,file)=>'<style>'+fs.readFileSync(path.join(dist,file),'utf8')+'</style>');
  assert(!/<(?:script|link)[^>]+(?:src|href)="\.\//.test(html), 'Todos os assets devem ser inlined, sem servidor');
  fs.writeFileSync(path.join(out,'offline.html'),html);
}

(async () => {
  const {default:puppeteer}=await import(req.resolve('puppeteer'));
  const chromium=executable(puppeteer);
  assert.match(req('react/package.json').version,/^19\./,'React 19 real obrigatório');
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'contrato-dossie-dom-'));
  assert(!temporary.startsWith(root+path.sep),'Diretório temporário deve ficar fora do Git');
  const originalIndex=process.argv.indexOf('--original');
  let sourceRoot=root,revision='working-tree';
  if (originalIndex>=0) {
    const sha=process.argv[originalIndex+1];
    assert.match(sha || '',/^[0-9a-f]{40}$/,'SHA completo obrigatório');
    sourceRoot=path.join(temporary,'original');fs.mkdirSync(sourceRoot);
    const archive=execFileSync('git',['archive',sha,'package.json','client/src','shared'],{cwd:root,timeout:10000,maxBuffer:30000000});
    execFileSync('tar',['-x','-C',sourceRoot],{input:archive,timeout:10000});
    fs.symlinkSync(path.join(root,'node_modules'),path.join(sourceRoot,'node_modules'),'dir');
    revision=sha;
  }
  const out=path.join(temporary,'build');fs.mkdirSync(out);
  // Vite resolve em tmp deve usar somente dependências do próprio repo.
  fs.symlinkSync(path.join(root,'node_modules'),path.join(out,'node_modules'),'dir');
  const mountedProducts=productHashes(sourceRoot);
  await build(out,sourceRoot);
  assert.deepEqual(productHashes(sourceRoot),mountedProducts,'Produtos precisam estar estáveis durante build');
  console.log('PASS build_offline_componente_helper_css_reais');
  browser=await puppeteer.launch({executablePath:chromium,headless:true,pipe:true,userDataDir:path.join(temporary,'private-profile'),timeout:10000,protocolTimeout:10000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND','--disable-features=MediaRouter,OptimizationHints','--disable-extensions']});
  const context=await browser.createBrowserContext();
  const results=[],errors=[],warnings=[],requests=[],downloads=[];
  let page;
  const evidence=process.env.DOSSIE_DOM_EVIDENCE_DIR;
  if(evidence){assert(path.isAbsolute(evidence),'Evidências exigem caminho absoluto');assert(!path.resolve(evidence).startsWith(root+path.sep),'Evidências fora do Git');fs.mkdirSync(evidence,{recursive:true});}
  async function fresh(){
    if(page)await page.close();page=await context.newPage();
    page.setDefaultTimeout(3500);page.setDefaultNavigationTimeout(5000);
    await page.setRequestInterception(true);
    page.on('request',r=>{if(/^(file:|data:|about:)/.test(r.url()))void r.continue();else{requests.push(r.url());void r.abort('blockedbyclient');}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(['warn','warning','error'].includes(m.type()))warnings.push(m.text());});
    const session=await page.createCDPSession();
    await session.send('Page.setDownloadBehavior',{behavior:'deny'});
    session.on('Page.downloadWillBegin',event=>downloads.push(event.url));
    await page.evaluateOnNewDocument(()=>{
      const deny=()=>{throw new Error('OFFLINE_BROWSER_NETWORK_FORBIDDEN');};
      window.fetch=async()=>deny();window.WebSocket=deny;window.XMLHttpRequest=deny;window.EventSource=deny;navigator.sendBeacon=deny;
    });
    await page.setViewport({width:1440,height:1050});
    await page.goto(pathToFileURL(path.join(out,'offline.html')).href,{waitUntil:'load'});
    await page.waitForSelector('[role=dialog]');
    await page.waitForFunction(()=>window.audit&&document.querySelector('[role=tab][data-state=active]')?.textContent.includes('Recursos de Glosas'));
    await settle();
    const css=await page.evaluate(()=>({dialogPosition:getComputedStyle(document.querySelector('[role=dialog]')).position,buttonDisplay:getComputedStyle(window.audit.button('Responder Recursos Automaticamente')).display,buttonColor:getComputedStyle(window.audit.button('Responder Recursos Automaticamente')).backgroundColor}));
    assert.equal(css.dialogPosition,'fixed','Tailwind real deve posicionar DialogContent');
    assert.equal(css.buttonDisplay,'flex','Button inline-flex sofre blockification no contêiner flex real');
    assert.notEqual(css.buttonColor,'rgba(0, 0, 0, 0)','Botão automático usa CSS real, não DOM sem estilos');
  }
  async function settle(){await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,35)));}
  async function button(label){return page.evaluate(label=>{const b=window.audit.button(label);return {text:b.textContent,disabled:b.disabled};},label);}
  async function click(label){
    const buttons=await page.$$('button');let found;
    for(const b of buttons)if(await b.evaluate((el,label)=>el.textContent.includes(label),label)){found=b;break;}
    assert(found,'Botão DOM ausente: '+label);await found.click();await settle();
    for(const b of buttons)await b.dispose();
  }
  async function selected(){return page.evaluate(()=>[...document.querySelectorAll('[role=checkbox]')].filter(e=>e.getAttribute('data-state')==='checked').map(e=>e.closest('tr').querySelector('td:nth-child(3) .font-mono').textContent));}
  async function calls(){return page.evaluate(()=>window.audit.calls);}
  const payload=items=>({route:'contratosConvenios.aplicarFundamentacaoGlosas',input:{contratoId:101,itens:items.map(([id,valorRecurso=20])=>({id,origem:id%2?'demonstrativo':'conciliacao',justificativa:'JUSTIFICATIVA SINTETICA ITEM '+id+' CONTRATO 101',valorRecurso}))}});
  async function noSideEffects(){assert.deepEqual(await calls(),[]);assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[]);assert.deepEqual(await page.evaluate(()=>window.audit.invalidations),[]);assert.equal(downloads.length,0);}
  async function xmlBlocked(){assert.equal((await button('Baixar Excel')).disabled,true,'XML não pronto mantém Excel indisponível');const s=await page.evaluate(()=>window.audit.snapshot());assert.notEqual(s.xml.status+':'+s.xml.fetchStatus,'success:idle','XML não pode ser declarado válido no cenário de erro/fetch');}
  async function usable(){assert.equal((await button('Selecionar Contestáveis')).disabled,false);assert.equal((await button('Responder Recursos Automaticamente')).disabled,false);}
  async function test(name,fn){
    console.log('RUN '+name);
    try {await fresh();await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}
    catch(e){results.push({name,result:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message);if(evidence)fs.writeFileSync(path.join(evidence,name+'.failure.json'),JSON.stringify({error:e.message,audit:await page?.evaluate(()=>({state:window.audit?.snapshot(),calls:window.audit?.calls,toasts:window.audit?.toasts,events:window.audit?.events,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled})),notices:[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent)}))},null,2)+'\n');}
  }

  await test('xml_error_persistente_observerOptionsUpdated_selecao_mutacao_exatas',async()=>{
    await page.evaluate(()=>window.audit.fail('xml'));await settle();await usable();await xmlBlocked();
    const before=await page.evaluate(()=>window.audit.events.filter(e=>e.domain==='xml'&&e.type==='observerOptionsUpdated').length);
    for(let i=0;i<4;i++){await page.evaluate(()=>window.audit.rerender());await settle();}
    const after=await page.evaluate(()=>window.audit.events.filter(e=>e.domain==='xml'&&e.type==='observerOptionsUpdated'&&e.status==='error').length);
    assert(after>=4&&after>before,'useQuery real precisa emitir observerOptionsUpdated repetidos em XML em erro');
    await click('Selecionar Contestáveis');assert.deepEqual(await selected(),['SINT-1'],'Botão habilitado precisa selecionar realmente, nunca noop');
    for(let i=0;i<3;i++){await page.evaluate(()=>window.audit.rerender());await settle();}
    assert.deepEqual(await selected(),['SINT-1'],'Options atualizadas de XML não invalidam seleção glosa');
    await xmlBlocked();
    if(evidence)await page.screenshot({path:path.join(evidence,'xml-error-glosas-selected-offline.png'),fullPage:true});
    await page.evaluate(()=>window.audit.pending());await click('Responder Recursos Automaticamente');
    assert.deepEqual(await calls(),[payload([[1]])],'Automático deve emitir exatamente a fundamentação elegível com XML erro');
    assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[],'Sem sucesso antes do ack');
    await page.evaluate(()=>window.audit.resolve({atualizados:1}));await settle();
    assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[{type:'success',msg:'Fundamentação contratual aplicada em 1 item(ns) de glosa!'}]);
    assert.deepEqual(await page.evaluate(()=>window.audit.invalidations),[{route:'contratosConvenios.auditarGlosasContrato',input:{contratoId:101}}]);
    assert.equal((await page.evaluate(()=>window.audit.snapshot())).xml.status,'error');await xmlBlocked();
  });
  await test('xml_fetch_erro_recuperacao_nao_interfere_glosas',async()=>{
    await click('Selecionar Contestáveis');assert.deepEqual(await selected(),['SINT-1']);
    await page.evaluate(()=>window.audit.startPending('xml'));await settle();await usable();await xmlBlocked();assert.deepEqual(await selected(),['SINT-1']);
    await page.evaluate(()=>window.audit.finishPending('xml',true));await settle();await usable();await xmlBlocked();assert.deepEqual(await selected(),['SINT-1']);
    await click('Aplicar Fundamentação');assert.deepEqual(await calls(),[payload([[1]])]);
    await page.evaluate(()=>window.audit.recover('xml'));await settle();assert.equal((await button('Baixar Excel')).disabled,false,'Excel só recupera quando todas as bases estão frescas');
  });
  await test('aviso_por_dominio_xml_nao_afirma_glosas_bloqueadas',async()=>{
    await page.evaluate(()=>window.audit.fail('xml'));await settle();
    const notice=await page.evaluate(()=>[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent).join('\n'));
    assert.match(notice,/xml/i);assert.match(notice,/exporta|excel/i);assert.match(notice,/glosas/i);
    assert.match(notice,/dispon[ií]ve|liberad|permanece|autorizad/i,'Aviso deve explicar ações glosa frescas permitidas');
    assert.doesNotMatch(notice,/Aplicação e exportação bloqueadas até revalidação|Dados em cache não estão autorizados para aplicação ou exportação/i,'Sem aviso global contraditório');
    await usable();await xmlBlocked();
  });

  for(const domain of ['dossie','glosas']){
    for(const action of ['error','pending','invalidation','removal','removedReadded','expired','replacement','completedRefetch']){
      await test(domain+'_'+action+'_stale_handlers_bloqueados',async()=>{
        await click('Selecionar Contestáveis');assert.deepEqual(await selected(),['SINT-1']);
        await page.evaluate(()=>{window.audit.capture();window.audit.holdReact();});
        await page.evaluate(async({domain,action})=>{
          const a=window.audit;
          if(action==='error')await a.fail(domain);
          if(action==='pending')a.startPending(domain);
          if(action==='invalidation')a.invalidate(domain);
          if(action==='removal')a.remove(domain);
          if(action==='removedReadded')a.removeReadd(domain);
          if(action==='expired')a.expire(domain);
          if(action==='replacement')a.replace(domain);
          if(action==='completedRefetch'){
            const before=a.snapshot()[domain].dataUpdatedAt;
            await new Promise(r=>setTimeout(r,2));await a.recover(domain);
            if(a.snapshot()[domain].status!=='success'||a.snapshot()[domain].fetchStatus!=='idle')throw new Error('REFETCH REAL NÃO CONCLUIU');
            if(a.snapshot()[domain].dataUpdatedAt<=before)throw new Error('REFETCH NÃO REVALIDOU TIMESTAMP');
          }
          a.invokeCaptured();
        },{domain,action});
        await noSideEffects();
        const s=await page.evaluate(()=>window.audit.snapshot());
        if(action==='error'){assert.equal(s[domain].status,'error');assert.equal(s[domain].hasData,true);}
        if(action==='pending'){assert.equal(s[domain].fetchStatus,'fetching');assert.equal(s[domain].hasData,true);}
        if(action==='invalidation')assert.equal(s[domain].isInvalidated,true);
        if(action==='removal')assert.equal(s[domain],null);
        await page.evaluate(()=>window.audit.releaseReact());await settle();
        if(['error','pending','invalidation'].includes(action)){
          assert.equal((await button('Responder Recursos Automaticamente')).disabled,true);
          assert.deepEqual(await selected(),[],'Cache inseguro elimina seleção visível');
          assert.equal((await button('Baixar Excel')).disabled,true);
        }
      });
    }
    await test(domain+'_recuperacao_revalidar_agora_com_xml_error',async()=>{
      await page.evaluate(async domain=>{await window.audit.fail('xml');await window.audit.fail(domain);window.audit.mode(domain,'ready');},domain);await settle();
      assert.equal((await button('Responder Recursos Automaticamente')).disabled,true);
      const notice=await page.evaluate(()=>[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent).join('\n'));
      assert.match(notice,domain==='dossie'?/dossi[eê]/i:/glosas/i);assert.match(notice,/bloquead|indispon[ií]ve|revalid/i);
      await click('Revalidar Agora');await page.waitForFunction(()=>!window.audit.button('Responder Recursos Automaticamente').disabled);await settle();
      await usable();await xmlBlocked();assert.deepEqual(await selected(),[]);await click('Responder Recursos Automaticamente');assert.deepEqual(await calls(),[payload([[1]])]);
    });
  }
  await test('xml_cache_eventos_nao_reanimam_glosa_invalida',async()=>{
    await page.evaluate(()=>window.audit.invalidate('glosas'));await settle();
    await page.evaluate(async()=>{await window.audit.fail('xml');window.audit.rerender();});await settle();
    assert.equal((await button('Responder Recursos Automaticamente')).disabled,true);await click('Selecionar Contestáveis');await noSideEffects();assert.deepEqual(await selected(),[]);
  });
  await test('xml_ciclo_antes_react_preserva_handler_glosa_mas_bloqueia_excel',async()=>{
    await page.evaluate(()=>{window.audit.capture();window.audit.holdReact();window.audit.startPending('xml');});
    // Invoca só o exportador antigo: guard cache próprio deve impedir download.
    await page.evaluate(()=>window.audit.captured.find(h=>h.label==='Baixar Excel').handler({}));await noSideEffects();
    await page.evaluate(()=>window.audit.finishPending('xml',true));await settle();
    await page.evaluate(()=>window.audit.captured.find(h=>h.label==='Responder Recursos Automaticamente').handler({}));await settle();
    assert.deepEqual(await calls(),[payload([[1]])],'XML sozinho não invalida autorização de glosas frescas');
    await page.evaluate(()=>window.audit.releaseReact());
  });
  await test('antiduplo_clique_misto_ack_erro_unlock',async()=>{
    await click('Selecionar Contestáveis');await page.evaluate(()=>{const a=window.audit;a.pending();a.capture();a.captured.find(h=>h.label==='Responder Recursos Automaticamente').handler({});a.captured.find(h=>h.label==='Responder Recursos Automaticamente').handler({});a.captured.find(h=>h.label==='Aplicar Fundamentação').handler({});a.captured.find(h=>h.label==='Selecionar Contestáveis').handler({});});await settle();
    assert.deepEqual(await calls(),[payload([[1]])]);assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[]);assert.equal((await button('Responder Recursos Automaticamente')).disabled,true);
    await page.evaluate(()=>window.audit.reject());await settle();
    assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[{type:'error',msg:'ACK REJEITADO SINTETICO'}]);assert.equal((await button('Responder Recursos Automaticamente')).disabled,false);
    await page.evaluate(()=>window.audit.pending(false));await click('Responder Recursos Automaticamente');assert.deepEqual(await calls(),[payload([[1]]),payload([[1]])]);
  });
  await test('lock_fecha_reabre_ack_tardio_sem_toast',async()=>{
    await page.evaluate(()=>window.audit.pending());await click('Responder Recursos Automaticamente');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
    await page.evaluate(()=>window.audit.setProps({open:true}));await page.waitForSelector('[role=dialog]');await settle();assert.equal((await button('Responder Recursos Automaticamente')).disabled,true);
    await page.evaluate(()=>window.audit.resolve({atualizados:1}));await settle();assert.deepEqual(await calls(),[payload([[1]])]);assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[]);
    assert.deepEqual(await page.evaluate(()=>window.audit.invalidations),[{route:'contratosConvenios.auditarGlosasContrato',input:{contratoId:101}}]);
  });
  for(const transition of ['contract','filter','competencia'])await test('handler_anterior_'+transition+'_bloqueado',async()=>{
    await click('Selecionar Contestáveis');await page.evaluate(()=>window.audit.capture());
    if(transition==='contract')await page.evaluate(()=>window.audit.setProps({contratoId:202}));
    if(transition==='filter')await page.evaluate(()=>[...document.querySelectorAll('div.cursor-pointer')].find(e=>e.textContent.includes('Pago Abaixo da Tabela')).click());
    if(transition==='competencia')await page.evaluate(()=>{window.audit.seedCompetencia('2026-02');const el=document.querySelector('input[placeholder="Competência (ex: 2026-03)"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-02');el.dispatchEvent(new Event('input',{bubbles:true}));});
    await settle();await page.evaluate(()=>window.audit.invokeCaptured());await noSideEffects();assert.deepEqual(await selected(),[]);
  });
  for(const filter of ['TODOS','ABAIXO','TOTAL','TECNICA'])await test('contagem_filtro_selecao_auto_payload_'+filter,async()=>{
    await page.evaluate(()=>window.audit.configure('mixed'));await settle();
    const labels={ABAIXO:'Pago Abaixo da Tabela',TOTAL:'Glosas Totais Contestáveis',TECNICA:'Já c/ Justificativa Salva'};
    if(filter!=='TODOS')await page.evaluate(label=>[...document.querySelectorAll('div.cursor-pointer')].find(e=>e.textContent.includes(label)).click(),labels[filter]);await settle();
    const items={TODOS:[[1,20],[2,25],[3,30]],ABAIXO:[[1,20]],TOTAL:[[2,25]],TECNICA:[[3,30]]}[filter];
    assert.equal((await button('Responder Recursos Automaticamente')).text.trim(),'Responder Recursos Automaticamente ('+items.length+')');
    await click('Selecionar Contestáveis');assert.deepEqual(await selected(),items.map(([id])=>'SINT-'+id));
    await click('Responder Recursos Automaticamente');assert.deepEqual(await calls(),[payload(items)]);
    assert((await calls())[0].input.itens.every(i=>i.id!==4&&i.valorRecurso>0),'Exclui ajuste legítimo e não positivos');
  });
  await test('max200_contagem_selecao_auto_recorte_nao_check_manual',async()=>{
    await page.evaluate(()=>window.audit.configure('large'));await settle();
    assert.equal((await button('Responder Recursos Automaticamente')).text.trim(),'Responder Recursos Automaticamente (200)');
    await click('Selecionar Contestáveis');assert.deepEqual(await selected(),Array.from({length:200},(_,i)=>'SINT-'+(i+1)));
    // Limpa seleção pelo próprio botão em cada checkbox, depois marca só o 250.
    await page.evaluate(()=>{for(const b of document.querySelectorAll('[role=checkbox][data-state=checked]'))b.click();});await settle();
    await page.evaluate(()=>[...document.querySelectorAll('[role=checkbox]')].at(-1).click());await settle();assert.deepEqual(await selected(),['SINT-250']);
    await click('Responder Recursos Automaticamente');assert.deepEqual(await calls(),[payload(Array.from({length:200},(_,i)=>[i+1]))]);
    await page.evaluate(()=>window.audit.recover('glosas'));await settle();assert((await page.evaluate(()=>window.audit.queries)).filter(q=>q.domain==='glosas').every(q=>q.input.limit===200));
  });
  await test('limite_checkbox_manual_201_nao_adicionado',async()=>{
    await page.evaluate(()=>window.audit.configure('large'));await settle();await click('Selecionar Contestáveis');
    await page.evaluate(()=>[...document.querySelectorAll('[role=checkbox]')][200].click());await settle();assert.equal((await selected()).length,200);
    assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[{type:'warning',msg:'Selecione no máximo 200 glosas por aplicação.'}]);
  });
  await test('ack_zero_nao_afirma_envio_portal',async()=>{
    await page.evaluate(()=>window.audit.pending());await click('Responder Recursos Automaticamente');assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[]);
    await page.evaluate(()=>window.audit.resolve({atualizados:0}));await settle();assert.deepEqual(await page.evaluate(()=>window.audit.toasts),[{type:'success',msg:'Fundamentação contratual aplicada em 0 item(ns) de glosa!'}]);assert.deepEqual(await calls(),[payload([[1]])]);
  });
  assert.deepEqual(errors,[],'Erros JS no DOM real');assert.deepEqual(requests,[],'Nenhuma solicitação externa permitida');assert.deepEqual(downloads,[],'Nenhum download executado');
  assert.deepEqual(productHashes(sourceRoot),mountedProducts,'Produtos precisam continuar estáveis até finalizar DOM');
  const report={revision,mountedProducts,results,errors,warnings,requests,downloads,react:req('react/package.json').version,tanstack:req('@tanstack/react-query/package.json').version,chromium,realRadix:true,realCSS:true,productInstrumented:false,mocks:['trpc queries/mutations/backend sintetico','toast','navigation'],sharedBrowser:false,pipe:true,server:false,network:0,database:0};
  if(evidence)fs.writeFileSync(path.join(evidence,originalIndex>=0?'original.results.json':'corrective.results.json'),JSON.stringify(report,null,2)+'\n');
  console.log('DOM_RESULT '+JSON.stringify({revision,pass:results.filter(r=>r.result==='PASS').length,fail:results.filter(r=>r.result==='FAIL').length,network:requests.length}));
  assert.equal(results.filter(r=>r.result==='FAIL').length,0,'Regressões DOM precisam ser positivas; ver FAIL acima');
  console.log('PASS contratoDossieCacheDomainsDom');
})().catch(e=>{console.error(e.stack || e);process.exitCode=1;}).finally(async()=>{try{if(browser)await browser.close();}finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});clearTimeout(timeout);}});
