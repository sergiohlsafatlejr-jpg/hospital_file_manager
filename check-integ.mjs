import { sql } from "drizzle-orm";

// Dynamic import of db
const { getDb } = await import("./server/db.ts");

const db = await getDb();

// Estrutura da tabela
const [cols] = await db.execute(sql.raw("DESCRIBE integ_faturado_x_recebido"));
console.log("=== COLUNAS integ_faturado_x_recebido ===");
for (const c of cols) {
  console.log(`  ${c.Field} (${c.Type}) ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${c.Key || ''}`);
}

// Contagem
const [countRes] = await db.execute(sql.raw("SELECT COUNT(*) as total FROM integ_faturado_x_recebido"));
console.log(`\n=== TOTAL REGISTROS: ${countRes[0].total} ===`);

// Sample
const [sample] = await db.execute(sql.raw("SELECT * FROM integ_faturado_x_recebido LIMIT 3"));
console.log("\n=== AMOSTRA (3 registros) ===");
for (const row of sample) {
  console.log(JSON.stringify(row, null, 2));
}

// Contagem faturamento_tiss
const [countTiss] = await db.execute(sql.raw("SELECT COUNT(*) as total FROM faturamento_tiss"));
console.log(`\n=== TOTAL faturamento_tiss: ${countTiss[0].total} ===`);

// Sample faturamento_tiss
const [sampleTiss] = await db.execute(sql.raw("SELECT * FROM faturamento_tiss LIMIT 2"));
console.log("\n=== AMOSTRA faturamento_tiss (2 registros) ===");
for (const row of sampleTiss) {
  console.log(JSON.stringify(row, null, 2));
}

// Contagem faturadoTasy
const [countTasy] = await db.execute(sql.raw("SELECT COUNT(*) as total FROM faturadoTasy"));
console.log(`\n=== TOTAL faturadoTasy: ${countTasy[0].total} ===`);

// Sample faturadoTasy
const [sampleTasy] = await db.execute(sql.raw("SELECT * FROM faturadoTasy LIMIT 2"));
console.log("\n=== AMOSTRA faturadoTasy (2 registros) ===");
for (const row of sampleTasy) {
  console.log(JSON.stringify(row, null, 2));
}

// Contagem faturamento_unificado
const [countUnif] = await db.execute(sql.raw("SELECT COUNT(*) as total FROM faturamento_unificado"));
console.log(`\n=== TOTAL faturamento_unificado: ${countUnif[0].total} ===`);

// Sample faturamento_unificado
const [sampleUnif] = await db.execute(sql.raw("SELECT * FROM faturamento_unificado LIMIT 2"));
console.log("\n=== AMOSTRA faturamento_unificado (2 registros) ===");
for (const row of sampleUnif) {
  console.log(JSON.stringify(row, null, 2));
}

process.exit(0);
