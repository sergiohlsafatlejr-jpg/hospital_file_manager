import { db } from './server/db.ts';
import { arquivos, procedimentos } from './drizzle/schema.ts';
import { desc, sql } from 'drizzle-orm';

// Verificar últimos arquivos importados
const ultimosArquivos = await db.select({
  id: arquivos.id,
  nome: arquivos.nome,
  status: arquivos.status,
  totalItens: arquivos.totalItens,
  createdAt: arquivos.createdAt
}).from(arquivos).orderBy(desc(arquivos.createdAt)).limit(5);

console.log('=== Últimos 5 arquivos importados ===');
ultimosArquivos.forEach(a => {
  console.log(`ID: ${a.id} | Nome: ${a.nome} | Status: ${a.status} | Itens: ${a.totalItens} | Data: ${a.createdAt}`);
});

// Verificar total de procedimentos
const totalProcs = await db.select({ count: sql`COUNT(*)` }).from(procedimentos);
console.log(`\nTotal de procedimentos no banco: ${totalProcs[0].count}`);

process.exit(0);
