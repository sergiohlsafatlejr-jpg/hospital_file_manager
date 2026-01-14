import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, codigo, nomeMedico, crmMedico FROM procedimentos WHERE nomeMedico IS NOT NULL AND nomeMedico != "" LIMIT 10');
console.log('Procedimentos com médico:', rows.length);
console.log(rows);
await conn.end();
