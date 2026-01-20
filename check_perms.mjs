import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Ver permissões do paulo
  const [pauloPerms] = await conn.execute('SELECT * FROM permissoesEstabelecimento WHERE userId = 840096');
  console.log('Paulo permissões:', pauloPerms);
  
  await conn.end();
}

check().catch(console.error);
