import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkAny() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Buscar alguns registros para ver o formato das datas
  const [rows] = await connection.execute(`
    SELECT id, guiaNumero, dataExecucao, dataReferencia, pacienteNome 
    FROM demonstrativoItens 
    WHERE dataExecucao IS NOT NULL
    LIMIT 10
  `);
  
  console.log('Exemplos de datas no banco:');
  rows.forEach(row => {
    console.log('---');
    console.log('  ID:', row.id);
    console.log('  Guia:', row.guiaNumero);
    console.log('  Data Execução (raw):', row.dataExecucao);
    console.log('  Data Execução (ISO):', row.dataExecucao?.toISOString?.() || 'N/A');
    console.log('  Paciente:', row.pacienteNome);
  });
  
  await connection.end();
}

checkAny().catch(console.error);
