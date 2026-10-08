/* PRIMEIRA carga IAD manual. Sem cron, DDL, UPDATE/DELETE ou novas permissões.
 * TiDB não tem gap locks: exige janela operacional exclusiva de escritores IAD.
 * Prévia somente leitura; logs agregados, manifesto/backup em raízes privadas. */
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { IAD_HOP_SOURCE as SOURCE, IAD_HOP_DEST as DEST, IAD_HOP_ORIGEM as ORIGEM,
  mapearHopIad, validarSnapshotIad, validarPrimeiraPublicacaoIad, type HopIadRow } from '../server/iadHopMap';
import { buildIadPhysicalContract, readPrivateJson, writePrivateJsonExclusive,
  writeEncryptedBackupVerified } from '../server/iadHopSafety';

const E = 2550002;
const EXPECTED_TOTAL = 13439;
const PRIVATE_ROOT = '/home/ubuntu/private';
const KEY_ROOT = '/home/ubuntu/.local/share/safatle-backup-keys';
const HUP_SOURCE = 'stagion_atendimentos_parados_urologico';
const COLUNAS = ['estabelecimentoId','origemSistema','origemId','numero_atendimento','codigo_saida',
  'convenio','paciente','caracter_atendimento','data_entrada','data_saida','tipo_atendimento',
  'descricao_atendimento','codigo_servico','codigo_procedimento','destino_conta','ativoNaFonte'] as const;
let fase = 'CONFIGURACAO';
let commitAttempted = false;
let committed = false;

async function executar() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--apply');
  const manifestPath = process.env.SAFATLE_IAD_MANIFEST_PATH;
  if (!process.env.DATABASE_URL || !manifestPath) throw new Error('Configuração ausente.');
  if (Number(process.env.SAFATLE_IAD_ESTABELECIMENTO_ID) !== E) throw new Error('Intenção de unidade divergente.');
  if (aplicar && ['--confirm-hop-finished','--confirm-reviewed-pr','--confirm-first-load',
    '--confirm-exclusive-iad-window'].some(x=>!args.includes(x))) throw new Error('Confirmações ausentes.');
  const executorSha256 = crypto.createHash('sha256').update(
    [import.meta.url,new URL('../server/iadHopMap.ts',import.meta.url),
      new URL('../server/iadHopSafety.ts',import.meta.url),new URL('../server/hopUrologicoMap.ts',import.meta.url)]
      .map(x=>fs.readFileSync(new URL(x))).reduce((a,b)=>Buffer.concat([a,b]),Buffer.alloc(0))
  ).digest('hex');
  const connection = {uri:process.env.DATABASE_URL,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true};
  const db = await mysql.createConnection(connection);
  let observer: mysql.Connection | undefined;
  let iniciado = false;
  try {
    fase = 'CADASTRO';
    const [[database]] = await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() banco');
    const cadastro = async (c:mysql.Connection, lock=false) => {
      const [rows]=await c.execute<mysql.RowDataPacket[]>(`SELECT nome,ativo FROM estabelecimentos WHERE id=?${lock?' FOR UPDATE':''}`,[E]);
      if(rows.length!==1 || rows[0].ativo!=='sim') throw new Error('Cadastro inválido.');
      return String(rows[0].nome);
    };
    const nome = await cadastro(db);
    let m:any;
    if(aplicar){
      m=readPrivateJson(PRIVATE_ROOT,manifestPath);
      const age=Date.now()-Date.parse(m.criadoEm);
      if(!Number.isFinite(age)||age<0||age>24*60*60*1000||m.banco!==database.banco||
        m.estabelecimentoId!==E||m.nome!==nome||m.total!==EXPECTED_TOTAL||m.executorSha256!==executorSha256)
        throw new Error('Manifesto divergente ou desatualizado.');
    }
    const tables=[SOURCE,DEST,'estabelecimentos','query_configuracoes','integracao_mapeamentos'];
    const contract = async(c:mysql.Connection) => {
      const [columns]=await c.query<mysql.RowDataPacket[]>(
        'SELECT TABLE_NAME tabela,COLUMN_NAME coluna,COLUMN_TYPE tipo,DATA_TYPE dataType,IS_NULLABLE nulo,ORDINAL_POSITION pos,CHARACTER_SET_NAME charset,COLLATION_NAME collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?) ORDER BY TABLE_NAME,ORDINAL_POSITION',[SOURCE,DEST]);
      const [hupColumns]=await c.query<mysql.RowDataPacket[]>(
        'SELECT TABLE_NAME tabela,COLUMN_NAME coluna,COLUMN_TYPE tipo,DATA_TYPE dataType,IS_NULLABLE nulo,ORDINAL_POSITION pos,CHARACTER_SET_NAME charset,COLLATION_NAME collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[HUP_SOURCE]);
      const [engines]=await c.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME tabela,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(()=>'?').join(',')}) ORDER BY TABLE_NAME`,tables);
      const [indexes]=await c.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME tabela,INDEX_NAME indice,COLUMN_NAME coluna,SEQ_IN_INDEX pos,NON_UNIQUE nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(()=>'?').join(',')}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,tables);
      const [[tr]]=await c.query<mysql.RowDataPacket[]>('SELECT COUNT(*) n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE=?',[DEST]);
      return buildIadPhysicalContract({
        columns:columns.map(x=>({...x,pos:Number(x.pos)})) as any,
        engines:engines as any,
        indexes:indexes.map(x=>({...x,pos:Number(x.pos),nonUnique:Number(x.nonUnique)})) as any,
        hupColumns:hupColumns.map(x=>({...x,pos:Number(x.pos)})) as any,
        triggerCount:Number(tr.n),
      });
    };
    fase='CONTRATO_FISICO';
    const physical=await contract(db);
    if(aplicar && m.layoutSha256!==physical.sha256) throw new Error('Contrato mudou após prévia.');
    const projection=physical.projection.map(x=>'`'+x+'`').join(',');
    const sourceRead=async(c:mysql.Connection,lock=false)=>{
      const [rows]=await c.query<mysql.RowDataPacket[]>(`SELECT ${projection} FROM ${SOURCE} ORDER BY numatend${lock?' FOR UPDATE':''}`);
      return rows as HopIadRow[];
    };
    const destinationRead=async(c:mysql.Connection,lock=false)=>{
      const [rows]=await c.execute<mysql.RowDataPacket[]>(`SELECT id,origemSistema,origemId FROM ${DEST} WHERE estabelecimentoId=?${lock?' FOR UPDATE':''}`,[E]);
      return rows;
    };
    const integradores=async(c:mysql.Connection,lock=false)=>{
      const [legacy]=await c.execute<mysql.RowDataPacket[]>(`SELECT id,ativo FROM query_configuracoes WHERE estabelecimentoId=?${lock?' FOR UPDATE':''}`,[E]);
      const [modern]=await c.execute<mysql.RowDataPacket[]>(`SELECT id,ativo FROM integracao_mapeamentos WHERE estabelecimentoId=?${lock?' FOR UPDATE':''}`,[E]);
      return legacy.filter(x=>Number(x.ativo)===1).length+modern.filter(x=>x.ativo==='sim').length;
    };
    if(aplicar){
      fase='TRANSACAO';
      const [[version]]=await db.query<mysql.RowDataPacket[]>('SELECT VERSION() v');
      await db.query('SET SESSION innodb_lock_wait_timeout=10');
      await db.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      if(String(version.v).toLowerCase().includes('tidb')){
        await db.query('SET SESSION tidb_retry_limit=0');
        await db.query('BEGIN PESSIMISTIC');
      }else{await db.beginTransaction();}
      iniciado=true;
      if(await cadastro(db,true)!==nome) throw new Error('Cadastro mudou.');
      if((await contract(db)).sha256!==physical.sha256) throw new Error('Contrato mudou na transação.');
      observer=await mysql.createConnection(connection);
    }
    fase='FONTE_E_DESTINO';
    const fonte=await sourceRead(db,aplicar);
    const snapshot=validarSnapshotIad(fonte,E);
    if(snapshot.total!==EXPECTED_TOTAL) throw new Error('Lote difere da intenção aprovada.');
    const dest=await destinationRead(db,aplicar);
    const active=await integradores(db,aplicar);
    if(dest.length!==0||active!==0) throw new Error('Destino ocupado ou integrador ativo.');
    if(validarSnapshotIad(await sourceRead(observer??db),E).sha256!==snapshot.sha256) throw new Error('Fonte mudou.');
    if(!aplicar){
      writePrivateJsonExclusive(PRIVATE_ROOT,manifestPath,{criadoEm:new Date().toISOString(),banco:database.banco,
        estabelecimentoId:E,nome,total:snapshot.total,sha256:snapshot.sha256,layoutSha256:physical.sha256,executorSha256});
      console.log(JSON.stringify({modo:'PREVIA_SEM_ESCRITA',estabelecimentoId:E,totalFonte:snapshot.total,destino:0,
        integradoresAtivos:0,manifestoPrivadoGerado:true,janelaExclusivaObrigatoria:true}));
      return;
    }
    validarPrimeiraPublicacaoIad({estabelecimentoId:E,total:snapshot.total,sha256:snapshot.sha256,
      esperadoTotal:m.total,esperadoSha256:m.sha256,destinoExistente:dest.length,integradoresAtivos:active});
    fase='BACKUP_PRIVADO';
    writeEncryptedBackupVerified(PRIVATE_ROOT,KEY_ROOT,{estabelecimentoId:E,origem:ORIGEM,fonte,destinoVazio:true});
    fase='INSERT';
    const mapped=fonte.map(x=>mapearHopIad(x,E));
    for(let i=0;i<mapped.length;i+=200){
      const batch=mapped.slice(i,i+200);
      await db.query(`INSERT INTO ${DEST} (${COLUNAS.map(x=>'`'+x+'`').join(',')}) VALUES ${batch.map(()=> '('+COLUNAS.map(()=>'?').join(',')+')').join(',')}`,
        batch.flatMap(x=>COLUNAS.map(c=>x[c])));
    }
    fase='POS_CONDICOES';
    const finalRows=await destinationRead(db,true);
    if(finalRows.length!==EXPECTED_TOTAL||finalRows.some(x=>x.origemSistema!==ORIGEM)||
      new Set(finalRows.map(x=>String(x.origemId))).size!==EXPECTED_TOTAL||await integradores(db,true)!==0)
      throw new Error('Pós-condições na transação divergentes.');
    // Observador autocommit enxerga mudanças concorrentes; TiDB não oferece gap locks.
    if((await destinationRead(observer!)).length!==0||await integradores(observer!)!==0||
      validarSnapshotIad(await sourceRead(observer!),E).sha256!==snapshot.sha256||
      (await contract(observer!)).sha256!==physical.sha256||await cadastro(observer!)!==nome)
      throw new Error('Mudança externa detectada na janela.');
    fase='COMMIT';commitAttempted=true;
    await db.commit();committed=true;iniciado=false;
    console.log(JSON.stringify({resultado:'PRIMEIRA_CARGA_IAD_INSERIDA',estabelecimentoId:E,inseridos:EXPECTED_TOTAL,
      atualizados:0,excluidos:0,backupLocalVerificado:true}));
  }finally{
    if(iniciado&&!commitAttempted){try{await db.rollback();}catch{}}
    if(observer){try{await observer.end();}catch{}}
    try{await db.end();}catch{}
  }
}
executar().catch((error:unknown)=>{
  if(error instanceof Error && error.message.startsWith('IAD safety validation failed:')) {
    console.error(error.message);
  }
  if(commitAttempted&&!committed){console.error('RESULTADO_INCERTO_POS_COMMIT; NAO_REAPLICAR; RECONCILIAR_SOMENTE_LEITURA.');}
  else if(committed){console.error('COMMIT_CONFIRMADO; FALHA_APOS_CONFIRMACAO; NAO_REAPLICAR.');}
  else{console.error('PUBLICACAO_IAD_ABORTADA_ANTES_COMMIT; fase='+fase);}
  process.exitCode=1;
});
