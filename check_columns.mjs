import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkColumns() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [columns] = await connection.execute('SHOW COLUMNS FROM demonstrativoItens');
  console.log('Colunas da tabela demonstrativoItens:');
  columns.forEach(col => console.log(`  - ${col.Field}: ${col.Type}`));
  
  await connection.end();
}

checkColumns().catch(console.error);
