import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkCount() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await connection.execute('SELECT COUNT(*) as total FROM demonstrativoItens');
  console.log('Total de itens no demonstrativo:', rows[0].total);
  
  // Buscar qualquer registro
  const [samples] = await connection.execute('SELECT * FROM demonstrativoItens LIMIT 3');
  console.log('\nExemplos de registros:');
  samples.forEach(row => {
    console.log('---');
    console.log(JSON.stringify(row, null, 2));
  });
  
  await connection.end();
}

checkCount().catch(console.error);
