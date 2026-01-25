import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const BATCH_SIZE = 500;
const ESTABELECIMENTO_ID = 2; // Maternidade Ela

// Promisify sqlite3 methods
function openDb(filepath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filepath, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function allRows(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRow(db, sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function main() {
  console.log('Iniciando importação do Tasy...');
  
  // Conecta ao SQLite
  const sqliteDb = await openDb('/home/ubuntu/upload/tasy_unificado.db');
  console.log('Conectado ao SQLite');
  
  // Conecta ao MySQL
  const mysqlConn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('Conectado ao MySQL');
  
  // Conta registros
  const countProc = await getRow(sqliteDb, 'SELECT COUNT(*) as count FROM procedimentos');
  const countMat = await getRow(sqliteDb, 'SELECT COUNT(*) as count FROM mat_med');
  const countContasPagas = await getRow(sqliteDb, 'SELECT COUNT(*) as count FROM contas_pagas');
  const countItensPagos = await getRow(sqliteDb, 'SELECT COUNT(*) as count FROM itens_pagos');
  
  console.log(`\nRegistros encontrados:`);
  console.log(`  - Procedimentos: ${countProc.count}`);
  console.log(`  - Mat/Med: ${countMat.count}`);
  console.log(`  - Contas Pagas: ${countContasPagas.count}`);
  console.log(`  - Itens Pagos: ${countItensPagos.count}`);
  
  // ========== IMPORTA PROCEDIMENTOS ==========
  console.log('\n=== Importando Procedimentos ===');
  const procedimentos = await allRows(sqliteDb, 'SELECT * FROM procedimentos');
  
  let insertedProc = 0;
  for (let i = 0; i < procedimentos.length; i += BATCH_SIZE) {
    const batch = procedimentos.slice(i, i + BATCH_SIZE);
    
    for (const p of batch) {
      try {
        await mysqlConn.execute(`
          INSERT INTO procedimentos_tasy 
          (estabelecimento_id, atendimento, nr_interno_conta, guia, sequencia, data_faturado, convenio, paciente, data_conta, codigo, codigo_convenio, descricao, quantidade, unidade, valor_unitario, valor_total, setor, protocolo, status_protocolo, medico, funcao_medico, crm, valor_medico)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, [
          ESTABELECIMENTO_ID,
          p.atendimento?.toString() || '',
          p.conta?.toString() || null,
          p.guia || null,
          null, // sequencia
          p.data_faturado || null,
          p.convenio || null,
          p.paciente || null,
          p.data_procedimento || null,
          p.codigo_tasy || null,
          p.codigo_convenio || null,
          p.descricao || null,
          p.quantidade || 1,
          null, // unidade
          p.valor_procedimento || 0,
          (p.quantidade || 1) * (p.valor_procedimento || 0),
          p.setor || null,
          p.nr_protocolo || null,
          null, // statusProtocolo
          p.medico || null,
          p.funcao || null,
          p.crm || null,
          p.valor_medico || null,
        ]);
        insertedProc++;
      } catch (err) {
        // Ignora erros de duplicata
        if (!err.message.includes('Duplicate')) {
          console.error(`Erro ao inserir procedimento:`, err.message);
        }
      }
    }
    
    console.log(`  Procedimentos: ${insertedProc}/${procedimentos.length} (${Math.round(insertedProc/procedimentos.length*100)}%)`);
  }
  
  // ========== IMPORTA MAT/MED ==========
  console.log('\n=== Importando Mat/Med ===');
  const matMed = await allRows(sqliteDb, 'SELECT * FROM mat_med');
  
  let insertedMat = 0;
  for (let i = 0; i < matMed.length; i += BATCH_SIZE) {
    const batch = matMed.slice(i, i + BATCH_SIZE);
    
    for (const m of batch) {
      try {
        await mysqlConn.execute(`
          INSERT INTO mat_med_tasy 
          (estabelecimento_id, atendimento, nr_interno_conta, guia, sequencia, data_faturado, convenio, paciente, data_conta, codigo, codigo_convenio, descricao, quantidade, unidade, valor_unitario, valor_total, setor, protocolo, status_protocolo, tipo_item)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, [
          ESTABELECIMENTO_ID,
          m.atendimento?.toString() || '',
          m.conta?.toString() || null,
          m.guia || null,
          m.sequencia_item?.toString() || null,
          m.data_faturado || null,
          m.convenio || null,
          m.paciente || null,
          m.data_conta || null,
          m.cod_material || null,
          m.cod_mat_convenio || null,
          m.descricao || null,
          m.quantidade || 1,
          m.unidade || null,
          m.vl_unitario || 0,
          m.vl_total || 0,
          m.setor || null,
          m.protocolo_convenio || null,
          m.status_protocolo || null,
          'material',
        ]);
        insertedMat++;
      } catch (err) {
        if (!err.message.includes('Duplicate')) {
          console.error(`Erro ao inserir mat/med:`, err.message);
        }
      }
    }
    
    console.log(`  Mat/Med: ${insertedMat}/${matMed.length} (${Math.round(insertedMat/matMed.length*100)}%)`);
  }
  
  // ========== IMPORTA CONTAS PAGAS ==========
  console.log('\n=== Importando Contas Pagas ===');
  const contasPagas = await allRows(sqliteDb, 'SELECT * FROM contas_pagas');
  
  let insertedCP = 0;
  for (const c of contasPagas) {
    try {
      await mysqlConn.execute(`
        INSERT INTO contas_pagas_tasy 
        (estabelecimento_id, data_retorno, seq_retorno_geral, titulo, guia, nr_seq_conta, nr_conta, convenio, nr_protocolo, data_recebimento, pago_conta, glosa_conta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE updated_at = NOW()
      `, [
        ESTABELECIMENTO_ID,
        c.data_retorno || null,
        c.seq_retorno_geral?.toString() || null,
        c.titulo || null,
        c.guia || null,
        c.nr_seq_conta?.toString() || null,
        c.nr_conta?.toString() || null,
        c.convenio || null,
        c.nr_protocolo?.toString() || null,
        c.data_recebimento || null,
        c.pago_conta || 0,
        c.glosa_conta || 0,
      ]);
      insertedCP++;
    } catch (err) {
      if (!err.message.includes('Duplicate')) {
        console.error(`Erro ao inserir conta paga:`, err.message);
      }
    }
  }
  console.log(`  Contas Pagas: ${insertedCP}/${contasPagas.length}`);
  
  // ========== IMPORTA ITENS PAGOS ==========
  console.log('\n=== Importando Itens Pagos ===');
  const itensPagos = await allRows(sqliteDb, 'SELECT * FROM itens_pagos');
  
  let insertedIP = 0;
  for (let i = 0; i < itensPagos.length; i += BATCH_SIZE) {
    const batch = itensPagos.slice(i, i + BATCH_SIZE);
    
    for (const item of batch) {
      try {
        await mysqlConn.execute(`
          INSERT INTO itens_pagos_tasy 
          (estabelecimento_id, titulo, guia, nr_seq_conta, conta, nr_protocolo, data_recebimento, glosa_item, qnd_glosa_item, motivo_glosa, procedimento, material, setor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE updated_at = NOW()
        `, [
          ESTABELECIMENTO_ID,
          item.titulo || null,
          item.guia || null,
          item.nr_seq_conta?.toString() || null,
          item.conta?.toString() || null,
          item.nr_protocolo?.toString() || null,
          item.data_recebimento || null,
          item.glosa_item || 0,
          item.qnd_glosa_item || 0,
          item.motivo_glosa || null,
          item.procedimento || null,
          item.material || null,
          item.setor || null,
        ]);
        insertedIP++;
      } catch (err) {
        if (!err.message.includes('Duplicate')) {
          console.error(`Erro ao inserir item pago:`, err.message);
        }
      }
    }
    
    console.log(`  Itens Pagos: ${insertedIP}/${itensPagos.length} (${Math.round(insertedIP/itensPagos.length*100)}%)`);
  }
  
  console.log('\n=== Importação concluída ===');
  console.log(`Procedimentos: ${insertedProc}`);
  console.log(`Mat/Med: ${insertedMat}`);
  console.log(`Contas Pagas: ${insertedCP}`);
  console.log(`Itens Pagos: ${insertedIP}`);
  
  // Fecha conexões
  sqliteDb.close();
  await mysqlConn.end();
}

main().catch(console.error);
