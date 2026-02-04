const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar arquivos recentes
  const [arquivos] = await conn.query(`
    SELECT id, nome, direcao, tipoArquivo, status, progresso, itensProcessados, totalItens,
           DATE_FORMAT(createdAt, '%d/%m/%Y %H:%i') as data
    FROM arquivos 
    WHERE nome LIKE '%0284932%' OR nome LIKE '%demonstrativo%'
    ORDER BY id DESC
    LIMIT 10
  `);
  
  console.log('Arquivos encontrados:');
  arquivos.forEach(a => {
    console.log(`  ID: ${a.id} | ${a.nome.substring(0,30)} | ${a.direcao} | ${a.tipoArquivo} | Status: ${a.status} | Progresso: ${a.progresso}% | Itens: ${a.itensProcessados}/${a.totalItens} | ${a.data}`);
  });
  
  // Verificar recebimento_tiss
  const [count] = await conn.query('SELECT COUNT(*) as total FROM recebimento_tiss');
  console.log('\nTotal em recebimento_tiss:', count[0].total);
  
  if (count[0].total > 0) {
    const [sample] = await conn.query(`
      SELECT numero_guia_prestador, numero_protocolo, nome_beneficiario, 
             codigo_procedimento, valor_liberado
      FROM recebimento_tiss 
      ORDER BY id DESC
      LIMIT 5
    `);
    console.log('\nAmostra dos últimos registros:');
    sample.forEach(s => console.log(`  Guia: ${s.numero_guia_prestador || 'N/A'} | Benef: ${(s.nome_beneficiario || 'N/A').substring(0,20)} | Proc: ${s.codigo_procedimento || 'N/A'} | R$ ${s.valor_liberado || '0'}`));
  }
  
  await conn.end();
}
main().catch(console.error);
