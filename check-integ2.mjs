import { sql } from "drizzle-orm";
const { getDb } = await import("./server/db.ts");
const db = await getDb();

// Contagem integ_faturado_x_recebido por estabelecimento
const [r1] = await db.execute(sql.raw('SELECT estabelecimento_id, COUNT(*) as total FROM integ_faturado_x_recebido GROUP BY estabelecimento_id'));
console.log('=== integ_faturado_x_recebido por estabelecimento ===');
for (const r of r1) console.log('  estab:', r.estabelecimento_id, 'total:', r.total);

// Contagem faturamento_tiss por estabelecimento
const [r2] = await db.execute(sql.raw('SELECT COALESCE(estabelecimentoId, estabelecimento_id) as estab, COUNT(*) as total FROM faturamento_tiss GROUP BY estab'));
console.log('\n=== faturamento_tiss por estabelecimento ===');
for (const r of r2) console.log('  estab:', r.estab, 'total:', r.total);

// Campos-chave integ
const [r3] = await db.execute(sql.raw('SELECT guiacobra, procdisco, codproprio, numconta, mesprod, nomeconv, descricao, vl_faturado, vl_recebido, vl_glosas FROM integ_faturado_x_recebido WHERE guiacobra IS NOT NULL LIMIT 5'));
console.log('\n=== Campos-chave integ (5 registros com guia) ===');
for (const r of r3) console.log(JSON.stringify(r));

// Campos-chave faturamento_tiss
const [r4] = await db.execute(sql.raw('SELECT numero_guia_prestador, numero_guia_operadora, codigo_item, descricao_item, valor_faturado, convenioId, data_referencia FROM faturamento_tiss LIMIT 5'));
console.log('\n=== Campos-chave faturamento_tiss (5 registros) ===');
for (const r of r4) console.log(JSON.stringify(r));

// Overlap de guias
const [r5] = await db.execute(sql.raw(`
  SELECT 
    (SELECT COUNT(DISTINCT guiacobra) FROM integ_faturado_x_recebido WHERE guiacobra IS NOT NULL) as guias_integ,
    (SELECT COUNT(DISTINCT numero_guia_prestador) FROM faturamento_tiss WHERE numero_guia_prestador IS NOT NULL) as guias_tiss
`));
console.log('\n=== Contagem de guias distintas ===');
console.log(JSON.stringify(r5[0]));

// Overlap real
const [r5b] = await db.execute(sql.raw(`
  SELECT COUNT(*) as guias_comuns FROM (
    SELECT DISTINCT guiacobra FROM integ_faturado_x_recebido WHERE guiacobra IS NOT NULL
  ) i
  INNER JOIN (
    SELECT DISTINCT numero_guia_prestador FROM faturamento_tiss WHERE numero_guia_prestador IS NOT NULL
  ) f ON i.guiacobra = f.numero_guia_prestador
`));
console.log('Guias comuns:', JSON.stringify(r5b[0]));

// Overlap de codigos
const [r6] = await db.execute(sql.raw(`
  SELECT COUNT(*) as codigos_comuns FROM (
    SELECT DISTINCT procdisco FROM integ_faturado_x_recebido WHERE procdisco IS NOT NULL
  ) i
  INNER JOIN (
    SELECT DISTINCT codigo_item FROM faturamento_tiss WHERE codigo_item IS NOT NULL
  ) f ON i.procdisco = f.codigo_item
`));
console.log('\nCodigos comuns:', JSON.stringify(r6[0]));

// Schema faturamento_unificado
const [r7] = await db.execute(sql.raw('DESCRIBE faturamento_unificado'));
console.log('\n=== COLUNAS faturamento_unificado ===');
for (const c of r7) console.log('  ' + c.Field + ' (' + c.Type + ')');

// Convenios distintos em integ
const [r8] = await db.execute(sql.raw('SELECT DISTINCT nomeconv, codconv FROM integ_faturado_x_recebido WHERE nomeconv IS NOT NULL ORDER BY nomeconv LIMIT 20'));
console.log('\n=== Convenios em integ_faturado_x_recebido ===');
for (const r of r8) console.log('  ', r.codconv, '-', r.nomeconv);

// Competencias em integ
const [r9] = await db.execute(sql.raw('SELECT DISTINCT mesprod, COUNT(*) as total FROM integ_faturado_x_recebido GROUP BY mesprod ORDER BY mesprod DESC LIMIT 10'));
console.log('\n=== Competencias em integ_faturado_x_recebido ===');
for (const r of r9) console.log('  ', r.mesprod, ':', r.total, 'registros');

process.exit(0);
