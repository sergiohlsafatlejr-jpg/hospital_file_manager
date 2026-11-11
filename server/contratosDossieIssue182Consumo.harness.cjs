'use strict';
// Base: prova-consumer-justificativa.cjs (somente leitura). Não importa db/env/IA/storage reais.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = process.cwd();
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const orm = req('drizzle-orm');
const { MySqlDialect } = req('drizzle-orm/mysql-core');
const Decimal = req('decimal.js');
assert.equal(process.env.DATABASE_URL, '');
assert.match(process.version, /^v22\./);
assert.match(process.env.NODE_OPTIONS, /network-guard\.cjs/);

function isolated(source, filename, globals = {}) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require(name) {
      if (name.startsWith('node:')) return require(name);
      if (['typescript', 'drizzle-orm', 'drizzle-orm/mysql-core'].includes(name)) return req(name);
      throw new Error('IMPORT_BLOQUEADO:' + name);
    },
    process: { cwd: () => root }, console, structuredClone, Date, Promise, Map, Set,
    ...globals,
  }, { filename, timeout: 5000 });
  return module.exports;
}
const mockFile = path.join(root, 'server/contratosDossieIssue182Mock.ts');
const mock = isolated(fs.readFileSync(mockFile, 'utf8'), mockFile);
const { fresh, glosa, makeDb, service, loadSource, schema } = mock;
const helper = loadSource('server/contratosDossieIssue182Consumo.ts');
const dbFile = path.join(root, 'server/db.ts');
const dbSource = fs.readFileSync(dbFile, 'utf8');
const ast = ts.createSourceFile(dbFile, dbSource, ts.ScriptTarget.Latest, true);
const functionNode = name => {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return node;
};
const names = ['getRecursosAgrupadosPorConvenio', 'getRecursosDoConvenio',
  'getRecursosLoteParaExportacao', 'gerarXmlsRecursoGlosaPorProtocolo'];
const forbidden = () => { throw new Error('INTEGRACAO_REAL_BLOQUEADA'); };
const globals = { ...schema, ...orm, ...helper, DecimalRecurso: Decimal.clone({ precision: 40 }),
  fetch: forbidden, storageGet: forbidden, extrairRecursosDoXml: forbidden,
  extrairChaveXmlDaUrl: forbidden, resolverGlosaDicionario: () => undefined };
// Helpers reais existentes de lote: nenhuma reimplementação financeira e nenhum import de db.ts.
for (const name of ['decimalRecurso', 'textoMoedaRecurso', 'textoMoedaRecursoOuNulo',
  'numeroMoedaRecurso', 'somarMoedasRecurso', 'statusComAcatamento', 'itemPertenceAoLote',
  'normalizarItemFinanceiroRecurso', 'fromConciliadosDemonstrativoLote', 'escapeXml']) {
  globals[name] = isolated('export ' + functionNode(name).getText(ast), dbFile, globals)[name];
}

// Executa somente prefixo AST real do consumidor XML, antes de convênio/serviços/artefato.
// O retorno substitui apenas a continuação após obter/validar os itens reais.
const xmlNode = functionNode('gerarXmlsRecursoGlosaPorProtocolo');
const xmlStatements = [...xmlNode.body.statements];
const endXmlRead = xmlStatements.findIndex(n => ts.isVariableStatement(n) &&
  n.declarationList.declarations.some(d => d.name.getText(ast) === '[convenio]'));
assert.ok(endXmlRead > 0);
const xmlPrefix = xmlNode.getText(ast).slice(0, xmlNode.body.getStart(ast) - xmlNode.getStart(ast)) +
  '{\n' + xmlStatements.slice(0, endXmlRead).map(n => n.getText(ast)).join('\n') +
  '\nreturn recursosDoLote;\n}';

// Executa a normalização/truncamento REAL e só a expressão REAL da tag
// ans:justificativaItem, sem montar XML de item, guia, protocolo ou lote.
let justifyDecl, justifyLimit, tagExpression;
function visit(node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d =>
    d.name.getText(ast) === 'justificativa' && d.initializer?.getText(ast).includes('recurso.justificativaRecurso')))
    justifyDecl = node;
  if (ts.isIfStatement(node) && node.expression.getText(ast) === 'justificativa.length > 150')
    justifyLimit = node;
  if (ts.isTemplateExpression(node)) {
    let preceding = node.head.text;
    for (const span of node.templateSpans) {
      if (preceding.endsWith('<ans:justificativaItem>') && span.literal.text.startsWith('</ans:justificativaItem>'))
        tagExpression = span.expression;
      preceding = span.literal.text;
    }
  }
  ts.forEachChild(node, visit);
}
visit(xmlNode);
assert.ok(justifyDecl && justifyLimit && tagExpression, 'campo real ans:justificativaItem');
const xmlField = isolated('export function campo(recurso: any) {\n' +
  justifyDecl.getText(ast) + '\n' + justifyLimit.getText(ast) + '\nreturn ' +
  tagExpression.getText(ast) + ';\n}', dbFile, globals).campo;

const dialect = new MySqlDialect();
const lote = { id: 8, estabelecimentoId: 10, convenioId: 20, numeroLote: 'SYN-8',
  status: 'pendente_envio', valorTotalRecebido: '0.00', valorTotalRecuperado: '0.00' };
const conc = (id, extra = {}) => glosa(id, { numeroGuia: 'SYN-' + id,
  pacienteNome: 'Paciente sintético', codigoItem: '10101012', descricaoItem: 'Consulta sintética',
  quantidade: 1, dataExecucao: '2026-02-10', competenciaPagamento: '2026-02',
  valorPago: '90.00', codigoGlosa: '1813', ...extra });

function consumerDb(data, options = {}) {
  const queries = [];
  // Adaptador restrito: avalia SQL REAL emitida; não é engine SQL/TiDB.
  const db = {
    queries,
    select() {
      let table;
      const chain = {
        from(t) { table = orm.getTableName(t); return chain; },
        where() { return chain; }, orderBy() { return chain; },
        limit() { return Promise.resolve(table === 'lotesRecurso' ? [lote] :
          table === 'convenios' ? data.convenios : []); },
        then(resolve, reject) { return Promise.resolve(table === 'recursosGlosa' ? [] :
          table === 'convenios' ? data.convenios : []).then(resolve, reject); },
      };
      return chain;
    },
    async execute(input) {
      const q = dialect.sqlToQuery(input);
      queries.push(q);
      assert.match(q.sql.trim(), /^SELECT\b/i, 'consumidor somente SELECT');
      let p = 0;
      const text = q.sql.replace(/\?/g, () => {
        const value = q.params[p++];
        assert.equal(typeof value, 'number', 'parâmetro da prova sintético numérico');
        return String(value);
      });
      const scalar = text.match(/\(SELECT rj\.justificativa\s+FROM recursos_glosa_justificativas rj\s+WHERE ([\s\S]*?)\s+AND rj\.id = \(\s*SELECT MAX\(rjv\.id\)\s+FROM recursos_glosa_justificativas rjv\s+WHERE rjv\.conciliadoId = ca\.id\s*\)\)/i);
      if (!scalar) {
        assert.match(text, /FROM demonstrativo(?: d)?\b/);
        return [[...(options.demoRows || [])], []];
      }
      if (options.missingTable) throw new Error('TABELA_AUXILIAR_SINTETICA_AUSENTE');
      assert.doesNotMatch(text, /JOIN recursos_glosa_justificativas/);
      assert.match(scalar[1], /rj\.conciliadoId = ca\.id/);
      assert.doesNotMatch(scalar[1], /d\.|numeroGuia|codigoItem|recebimentoId/);
      assert.match(scalar[1], /ca\.estabelecimentoId = \d+/);
      assert.match(scalar[1], /ca\.convenioId IS NOT NULL/);
      const field = text.slice(scalar.index + scalar[0].length).match(/^\s+as\s+(justificativaRecurso|justificativa)/i)[1];
      const outer = text.replace(scalar[0], '(SCALAR)');
      const equals = (clause, column, row) => {
        const matches = [...clause.matchAll(new RegExp('ca\\.' + column + '\\s*=\\s*(\\d+)', 'g'))];
        return matches.every(m => Number(row[column]) === Number(m[1]));
      };
      let rows = data.conciliados_automatico.filter(row =>
        ['estabelecimentoId', 'convenioId', 'xmlRecursoLoteId'].every(c => equals(outer, c, row)));
      if (/ca\.statusRecursoItem = 'iniciado'/.test(outer)) rows = rows.filter(r => r.statusRecurso === 'iniciado');
      if (/ca\.xmlRecursoLoteId IS NULL/.test(outer)) rows = rows.filter(r => r.xmlRecursoLoteId == null);
      if (/ca\.valorGlosa > 0/.test(outer)) rows = rows.filter(r => Number(r.valorGlosa) > 0);
      if (/FROM recursos_glosa_itens rgi/.test(outer)) rows = rows.filter(r =>
        !data.recursos_glosa_itens.some(i => i.conciliadoId === r.id));
      const payment = outer.match(/ca\.competenciaPagamento = '([^']+)'/);
      if (payment) rows = rows.filter(r => r.competenciaPagamento === payment[1]);
      rows.sort((a, b) => a.numeroGuia.localeCompare(b.numeroGuia) || a.codigoItem.localeCompare(b.codigoItem));
      return [rows.map(row => {
        const scoped = equals(scalar[1], 'estabelecimentoId', row) &&
          equals(scalar[1], 'convenioId', row) && row.convenioId != null;
        const candidates = scoped ? data.recursos_glosa_justificativas
          .filter(j => j.conciliadoId === row.id).sort((a, b) => b.id - a.id) : [];
        return { id: row.id, estabelecimentoId: row.estabelecimentoId, convenioId: row.convenioId,
          guiaNumero: row.numeroGuia, pacienteNome: row.pacienteNome,
          codigoProcedimento: row.codigoItem, descricaoProcedimento: row.descricaoItem,
          valorGlosado: row.valorGlosa, valorCobrado: row.valorRecurso ?? row.valorGlosa,
          valorRecursado: row.valorRecurso ?? row.valorGlosa, valorPagoOriginal: row.valorPago,
          quantidade: row.quantidade, dataGlosa: row.dataExecucao, motivoGlosaConvenio: row.codigoGlosa,
          status: row.statusRecurso, fonte: 'conciliacao', [field]: candidates[0]?.justificativa ?? null };
      }), []];
    },
    insert: forbidden, update: forbidden, delete: forbidden, transaction: forbidden,
  };
  return db;
}
function consumers(db) {
  const context = { ...globals, getDb: async () => db };
  const result = {};
  for (const name of names.slice(0, 3)) result[name] = loadSource('server/db.ts', {}, name, context)[name];
  result.gerarXmlsRecursoGlosaPorProtocolo = isolated(xmlPrefix, dbFile, context).gerarXmlsRecursoGlosaPorProtocolo;
  return result;
}
const params = { estabelecimentoId: 10, convenioId: 20, dataPagamento: '2026-02' };
const tests = [];
async function test(name, fn) { await fn(); tests.push(name); console.log('PASS ' + name); }
function prepared(extra = {}) {
  return fresh({ conciliados_automatico: [conc(77, { statusRecurso: 'iniciado', valorRecurso: '10.00' })],
    recursos_glosa_justificativas: [{ id: 1, conciliadoId: 77, justificativa: 'Texto sintético persistido' }], ...extra });
}
async function everyConsumer(data, assertion, options = {}) {
  for (const name of names) {
    const db = consumerDb(data, options);
    const c = consumers(db)[name];
    await assertion(() => name === names[0] ? c(params) : name === names[1] ? c(params) : c(8), name, db);
  }
}
(async () => {
  await test('C01 fundamentação real persiste e chega às duas filas, itens de lote e expressão ans:justificativaItem', async () => {
    const data = fresh({ conciliados_automatico: [conc(77)] });
    const dbWrite = makeDb(data);
    const texto = 'Fundamento contratual sintético & item <77>\nLinha preservada';
    const applied = await service(dbWrite).aplicarFundamentacaoContratualGlosas({
      contratoId: 1, itens: [{ id: 77, origem: 'conciliacao', justificativa: texto, valorRecurso: 10 }],
    });
    assert.equal(applied.atualizados, 1);
    assert.equal(data.recursos_glosa_justificativas[0].justificativa, texto);
    assert.equal(data.conciliados_automatico[0].statusRecurso, 'iniciado');
    // O mock do pai não atribui AUTO_INCREMENT; adapta só metadado físico, não texto/estado.
    data.recursos_glosa_justificativas[0].id = 1;
    const db = consumerDb(data);
    const c = consumers(db);
    const grouped = await c.getRecursosAgrupadosPorConvenio(params);
    assert.equal(grouped[0].recursos[0].justificativa, texto);
    assert.equal(grouped[0].totalRecursos, 1);
    assert.equal(grouped[0].valorTotalCobrado, 10);
    assert.equal((await c.getRecursosDoConvenio(params))[0].justificativa, texto);
    data.conciliados_automatico[0].xmlRecursoLoteId = 8; // vínculo sintético, sem chamar criador de lote
    const exported = await c.getRecursosLoteParaExportacao(8);
    assert.equal(exported.recursos.length, 1);
    assert.equal(exported.recursos[0].descricaoRecurso, texto);
    assert.equal(exported.recursos[0].justificativaPagamento, texto);
    const xmlItems = await c.gerarXmlsRecursoGlosaPorProtocolo(8);
    assert.equal(xmlItems[0].justificativaRecurso, texto);
    assert.equal(xmlField(xmlItems[0]), 'Fundamento contratual sintético &amp; item &lt;77&gt; Linha preservada');
  });
  await test('C02 duplicatas: maior ID vence mesmo com timestamps empatados/desordenados, sem multiplicar itens/valores', async () => {
    const data = prepared({ recursos_glosa_justificativas: [
      { id: 99, conciliadoId: 77, justificativa: 'Versão mais recente por ID', atualizadoEm: '2026-01-01' },
      { id: 2, conciliadoId: 77, justificativa: 'Versão antiga', atualizadoEm: '2026-11-11' },
      { id: 10, conciliadoId: 77, justificativa: 'Versão intermediária', atualizadoEm: '2026-11-11' },
    ] });
    const c = consumers(consumerDb(data));
    const grouped = await c.getRecursosAgrupadosPorConvenio(params);
    assert.equal(grouped[0].totalRecursos, 1);
    assert.equal(grouped[0].valorTotalGlosado, 10);
    assert.equal(grouped[0].valorTotalCobrado, 10);
    assert.equal(grouped[0].recursos[0].justificativa, 'Versão mais recente por ID');
    assert.equal((await c.getRecursosDoConvenio(params)).length, 1);
    data.conciliados_automatico[0].xmlRecursoLoteId = 8;
    const exported = await c.getRecursosLoteParaExportacao(8);
    assert.equal(exported.totais.totalItens, 1);
    assert.equal(exported.totais.totalValorRecursado, 10);
    assert.equal(exported.recursos[0].descricaoRecurso, 'Versão mais recente por ID');
    const xmlItems = await c.gerarXmlsRecursoGlosaPorProtocolo(8);
    assert.equal(xmlItems.length, 1);
    assert.equal(xmlField(xmlItems[0]), 'Versão mais recente por ID');
  });
  await test('C03 isolamento hospital/convênio/origem e colisão de ID com demonstrativo', async () => {
    const data = prepared({ conciliados_automatico: [
      conc(77, { statusRecurso: 'iniciado' }),
      conc(177, { estabelecimentoId: 99, statusRecurso: 'iniciado' }),
      conc(277, { convenioId: 30, statusRecurso: 'iniciado' }),
    ], recursos_glosa_justificativas: [
      { id: 1, conciliadoId: 77, justificativa: 'Conciliação correta' },
      { id: 900, conciliadoId: 177, justificativa: 'OUTRA_UNIDADE' },
      { id: 901, conciliadoId: 277, justificativa: 'OUTRO_CONVENIO' },
    ] });
    const demo = { id: 77, estabelecimentoId: 10, convenioId: 20, fonte: 'demonstrativo',
      justificativa: 'Texto demonstrativo próprio', justificativaRecurso: 'Texto demonstrativo próprio',
      valorGlosado: '10.00', valorCobrado: '10.00', valorRecursado: '10.00' };
    const c = consumers(consumerDb(data, { demoRows: [demo] }));
    const items = await c.getRecursosDoConvenio(params);
    assert.equal(items.length, 2);
    assert.equal(items.find(i => i.fonte === 'demonstrativo').justificativa, demo.justificativa);
    assert.equal(items.find(i => i.fonte === 'conciliacao').justificativa, 'Conciliação correta');
    const groups = await c.getRecursosAgrupadosPorConvenio(params);
    assert.ok(!groups.some(g => g.recursos.some(r => r.id === 177)));
    assert.equal(groups.find(g => g.convenioId === 30).recursos[0].justificativa, 'OUTRO_CONVENIO');
    data.conciliados_automatico.forEach(r => { r.xmlRecursoLoteId = 8; });
    const exported = await c.getRecursosLoteParaExportacao(8);
    assert.equal(exported.recursos.length, 2);
    assert.equal(exported.recursos.find(i => i.fonte === 'conciliacao').descricaoRecurso, 'Conciliação correta');
    // Consumidor XML legado não filtra ownership externo: a projeção falha
    // fechada para um lote inconsistente em vez de selecionar texto alheio.
    await assert.rejects(() => c.gerarXmlsRecursoGlosaPorProtocolo(8), /Fundamentação persistida/);
    data.recursos_glosa_justificativas = data.recursos_glosa_justificativas.filter(r => r.conciliadoId !== 77);
    await assert.rejects(() => c.getRecursosLoteParaExportacao(8), /Fundamentação persistida/);
  });
  await test('C04 tabela auxiliar ausente falha fechada nos quatro consumidores sem fallback/storage/DDL', async () => {
    const data = prepared();
    await everyConsumer(data, async (run, name) => {
      data.conciliados_automatico[0].xmlRecursoLoteId = name === names[0] || name === names[1] ? null : 8;
      await assert.rejects(run, /TABELA_AUXILIAR_SINTETICA_AUSENTE/);
    }, { missingTable: true });
  });
  await test('C05 texto ausente/nulo/vazio e versão nova vazia não viram sucesso ou fallback antigo', async () => {
    for (const texto of [undefined, null, '', ' \n\t ']) {
      const data = prepared({ recursos_glosa_justificativas: texto === undefined ? [] : [
        { id: 1, conciliadoId: 77, justificativa: 'Texto antigo não deve ressuscitar' },
        { id: 2, conciliadoId: 77, justificativa: texto },
      ] });
      await everyConsumer(data, async (run, name) => {
        data.conciliados_automatico[0].xmlRecursoLoteId = name === names[0] || name === names[1] ? null : 8;
        await assert.rejects(run, /Fundamentação persistida/);
      });
    }
  });
  await test('C06 recorte de fila: status, vínculo, competência, IDs/itens legítimos e demonstrativo preservados', async () => {
    const data = prepared({ conciliados_automatico: [
      conc(77, { statusRecurso: 'iniciado' }), conc(78, { statusRecurso: 'enviado' }),
      conc(79, { statusRecurso: 'iniciado', xmlRecursoLoteId: 9 }),
      conc(80, { statusRecurso: 'iniciado' }),
      conc(81, { statusRecurso: 'iniciado', competenciaPagamento: '2026-03' }),
      conc(82, { statusRecurso: 'iniciado', valorGlosa: '0.00' }),
    ], recursos_glosa_itens: [{ conciliadoId: 80 }] });
    const c = consumers(consumerDb(data));
    assert.deepEqual(Array.from((await c.getRecursosDoConvenio(params)).map(i => i.id)), [77]);
    assert.deepEqual(Array.from((await c.getRecursosAgrupadosPorConvenio(params))[0].recursos.map(i => i.id)), [77]);
    assert.deepEqual(Array.from(await c.getRecursosDoConvenio({ convenioId: 20 })), []);
  });
  await test('C07 contratos de fonte: quatro projeções/guardas, helper sem DML/DDL e alteração só no campo XML', async () => {
    for (const name of names) {
      const source = functionNode(name).getText(ast);
      assert.match(source, /projetarJustificativaConciliacaoIssue182/);
      assert.match(source, /exigirJustificativasConciliacaoIssue182/);
      assert.doesNotMatch(source, /'' (?:AS|as) justificativa(?:Recurso)?/);
      assert.doesNotMatch(source, /garantirRecurso|ensureDDL|INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE/);
    }
    assert.throws(() => helper.projetarJustificativaConciliacaoIssue182(0, 20), /Escopo/);
    assert.throws(() => helper.projetarJustificativaConciliacaoIssue182(10, 0), /Escopo/);
    assert.equal(xmlField({ justificativaRecurso: 'a'.repeat(151) }), 'a'.repeat(147) + '...');
    assert.equal(xmlField({ justificativaRecurso: 'A\r\n  B & <C>' }), 'A B &amp; &lt;C&gt;');
  });
  console.log(JSON.stringify({ resultado: 'PASS', testes: tests.length, node: process.version,
    consumidores: names, limites: 'Fonte AST/VM, mock de gravação e adaptador SELECT restrito; sem engine SQL, banco, XML completo, rede ou integrações reais.' }));
})().catch(err => { console.error(err); process.exitCode = 1; });
