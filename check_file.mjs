import { db } from './server/db.ts';
import { arquivos, procedimentos } from './drizzle/schema.ts';
import { eq, desc, sql } from 'drizzle-orm';

// Buscar o arquivo mais recente
const arquivo = await db.select().from(arquivos).where(eq(arquivos.estabelecimentoId, 60011)).orderBy(desc(arquivos.createdAt)).limit(1);
console.log('Arquivo:', arquivo[0]?.nome, '- Status:', arquivo[0]?.status);
console.log('ID:', arquivo[0]?.id);

// Contar procedimentos deste arquivo
if (arquivo[0]) {
  const count = await db.select({ count: sql`count(*)` }).from(procedimentos).where(eq(procedimentos.arquivoId, arquivo[0].id));
  console.log('Procedimentos importados:', count[0]?.count);
}

process.exit(0);
