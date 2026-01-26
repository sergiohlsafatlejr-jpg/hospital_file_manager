import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkGuia() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await connection.execute(`
    SELECT id, guiaNumero, dataExecucao, dataReferencia, pacienteNome, codigo, descricao 
    FROM demonstrativoItens 
    WHERE guiaNumero = '66436667' 
    LIMIT 5
  `);
  
  console.log('Dados da guia 66436667:');
  rows.forEach(row => {
    console.log('---');
    console.log('  ID:', row.id);
    console.log('  Guia:', row.guiaNumero);
    console.log('  Data Execução (raw):', row.dataExecucao);
    console.log('  Data Execução (tipo):', typeof row.dataExecucao);
    console.log('  Data Referência:', row.dataReferencia);
    console.log('  Paciente:', row.pacienteNome);
    console.log('  Código:', row.codigo);
    console.log('  Descrição:', row.descricao?.substring(0, 50));
  });
  
  await connection.end();
}

checkGuia().catch(console.error);
