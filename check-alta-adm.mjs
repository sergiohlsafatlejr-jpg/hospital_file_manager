import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar guias com múltiplos lotes no Ox UTI (estabelecimento 3)
const [rows] = await connection.execute(`
  SELECT 
    numero_guia,
    COUNT(DISTINCT lote_prestador) as total_lotes,
    GROUP_CONCAT(DISTINCT lote_prestador) as lotes
  FROM demonstrativo
  WHERE estabelecimento_id = 3
  GROUP BY numero_guia
  HAVING COUNT(DISTINCT lote_prestador) > 1
  LIMIT 10
`);

console.log('Guias com múltiplos lotes no Ox UTI (Altas Administrativas):');
if (rows.length === 0) {
  console.log('Nenhuma guia com múltiplos lotes encontrada');
} else {
  rows.forEach(row => {
    console.log(`Guia: ${row.numero_guia} - ${row.total_lotes} lotes: ${row.lotes}`);
  });
}

// Verificar total de guias e lotes no Ox UTI
const [stats] = await connection.execute(`
  SELECT 
    COUNT(DISTINCT numero_guia) as total_guias,
    COUNT(DISTINCT lote_prestador) as total_lotes_distintos
  FROM demonstrativo
  WHERE estabelecimento_id = 3
`);
console.log('\nEstatísticas Ox UTI:', stats[0]);

await connection.end();
