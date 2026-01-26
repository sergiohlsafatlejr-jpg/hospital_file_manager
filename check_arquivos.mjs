import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkArquivos() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar arquivos de retorno
  const [arquivos] = await connection.execute(`
    SELECT id, nome, tipo, tipoArquivo, status 
    FROM arquivos 
    WHERE tipoArquivo = 'retornado' 
    LIMIT 5
  `);
  console.log('Arquivos de retorno:');
  arquivos.forEach(a => console.log(`  - ID ${a.id}: ${a.nome} (${a.tipo}, ${a.status})`));
  
  // Verificar se há dados em procedimentos
  const [procs] = await connection.execute('SELECT COUNT(*) as total FROM procedimentos');
  console.log('\nTotal de procedimentos:', procs[0].total);
  
  // Verificar contasTasy
  const [contas] = await connection.execute('SELECT COUNT(*) as total FROM contasTasy');
  console.log('Total de contasTasy:', contas[0].total);
  
  // Verificar se há dados em conciliacaoTasy
  const [conciliacao] = await connection.execute('SELECT COUNT(*) as total FROM conciliacaoTasy');
  console.log('Total de conciliacaoTasy:', conciliacao[0].total);
  
  await connection.end();
}

checkArquivos().catch(console.error);
