import { getDb } from "./server/db.ts";
import { warleineAtendimentosStaging } from "./drizzle/schema-integracao.ts";

const db = await getDb();
const data = await db.select().from(warleineAtendimentosStaging).limit(1);

if (data.length > 0) {
  console.log("=== ESTRUTURA DO JSON ===");
  console.log(JSON.stringify(data[0].dadosBrutos, null, 2));
  console.log("\n=== CHAVES DISPONÍVEIS ===");
  console.log(Object.keys(data[0].dadosBrutos || {}));
}
