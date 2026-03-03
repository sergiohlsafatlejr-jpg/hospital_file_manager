import { sql } from "drizzle-orm";
const { getDb } = await import("./server/db.ts");
const db = await getDb();

const [cols] = await db.execute(sql.raw("DESCRIBE integ_faturado"));
console.log("=== COLUNAS integ_faturado ===");
for (const c of cols) {
  console.log(`  ${c.Field} (${c.Type}) ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${c.Key || ''} ${c.Default !== null ? 'default=' + c.Default : ''}`);
}

const [countRes] = await db.execute(sql.raw("SELECT COUNT(*) as total FROM integ_faturado"));
console.log(`\nTOTAL REGISTROS: ${countRes[0].total}`);

const [sample] = await db.execute(sql.raw("SELECT * FROM integ_faturado LIMIT 2"));
console.log("\n=== AMOSTRA (2 registros) ===");
for (const row of sample) {
  console.log(JSON.stringify(row, null, 2));
}

const [byEstab] = await db.execute(sql.raw("SELECT estabelecimento_id, COUNT(*) as total FROM integ_faturado GROUP BY estabelecimento_id"));
console.log("\n=== POR ESTABELECIMENTO ===");
for (const r of byEstab) console.log(`  estab: ${r.estabelecimento_id} -> ${r.total} registros`);

const [byComp] = await db.execute(sql.raw("SELECT mesprod, COUNT(*) as total FROM integ_faturado GROUP BY mesprod ORDER BY mesprod DESC LIMIT 10"));
console.log("\n=== POR COMPETENCIA (top 10) ===");
for (const r of byComp) console.log(`  ${r.mesprod}: ${r.total} registros`);

process.exit(0);
