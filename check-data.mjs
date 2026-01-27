import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const url = new URL(DATABASE_URL);
  
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1).split('?')[0],
    ssl: { rejectUnauthorized: false }
  });

  console.log('\n=== DADOS DA COMPETÊNCIA 2025-12 ===\n');
  
  const [rows] = await connection.execute(`
    SELECT 
      COUNT(*) as total_registros,
      SUM(CAST(vlFaturado AS DECIMAL(15,2))) as total_faturado,
      SUM(CAST(vlPago AS DECIMAL(15,2))) as total_pago,
      SUM(CAST(vlGlosa AS DECIMAL(15,2))) as total_glosado,
      SUM(CAST(vlFaturado AS DECIMAL(15,2))) - COALESCE(SUM(CAST(vlPago AS DECIMAL(15,2))), 0) - COALESCE(SUM(CAST(vlGlosa AS DECIMAL(15,2))), 0) as total_pendente
    FROM faturadoTasy 
    WHERE estabelecimentoId = 2 
    AND competencia LIKE '2025-12%'
  `);
  
  console.log('Competência: 2025-12');
  console.log('Total de Registros:', rows[0].total_registros);
  console.log('Total Faturado: R$', Number(rows[0].total_faturado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  console.log('Total Pago (Recebido): R$', Number(rows[0].total_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  console.log('Total Glosado: R$', Number(rows[0].total_glosado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  console.log('Total Pendente: R$', Number(rows[0].total_pendente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

  console.log('\n=== AMOSTRA DE 5 REGISTROS ===\n');
  
  const [sample] = await connection.execute(`
    SELECT id, competencia, convenio, conta, vlFaturado, vlPago, vlGlosa
    FROM faturadoTasy 
    WHERE estabelecimentoId = 2 
    AND competencia LIKE '2025-12%'
    LIMIT 5
  `);
  
  sample.forEach((row, i) => {
    console.log(`Registro ${i + 1}:`);
    console.log(`  ID: ${row.id}`);
    console.log(`  Competência: ${row.competencia}`);
    console.log(`  Convênio: ${row.convenio}`);
    console.log(`  Conta: ${row.conta}`);
    console.log(`  Valor Faturado: R$ ${Number(row.vlFaturado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`  Valor Pago: R$ ${Number(row.vlPago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`  Valor Glosa: R$ ${Number(row.vlGlosa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log('');
  });

  await connection.end();
}

main().catch(console.error);
