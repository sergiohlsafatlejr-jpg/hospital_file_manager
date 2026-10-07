/*
 * Publicação administrativa de contas pendentes inéditas do CSV Hemolabor.
 * Prévia padrão; somente --apply + manifesto privado aprovado inicia INSERT.
 * Não substitui snapshot TASY, não atualiza/reativa contas existentes, não altera outras unidades.
 * Nunca imprime identificadores, nomes, valores, hashes nem erros brutos do driver.
 */
import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'csv-parse';
import mysql from 'mysql2/promise';
import { HEMO_CSV_HEADERS, HEMO_ESTABELECIMENTO_ID as E, cleanHemo, hemoKey, hemoLatestOrder, parseHemoCsvRecord, type HemoCsvRecord } from '../server/hemolaborPendentesCsv';
import { HEMO_NOVAS_COLUNAS, mapHemoNewPending } from '../server/hemolaborNovasCsv';

const args=process.argv.slice(2),apply=args.includes('--apply');
const filename=args.find(a=>a.startsWith('--file='))?.slice(7);
const manifestPath=args.find(a=>a.startsWith('--manifest='))?.slice(11);
if(!filename)throw Error('ARQUIVO_AUSENTE');
if(apply&&(!manifestPath||!args.includes('--confirm-new-only')||!args.includes('--confirm-reviewed-pr')||!args.includes('--confirm-production-insert')))throw Error('CONFIRMACOES_AUSENTES');
const MAX_ROWS=800_000,MAX_KEYS=180_000,MAX_INSERTS=12_000;
const DATA_COLUMNS=HEMO_NOVAS_COLUNAS.filter(c=>!['dataSincronizacao','criadoEm','atualizadoEm'].includes(c));
const identifier=(s:string)=>{if(!/^[A-Za-z_][\w]*$/.test(s))throw Error('COLUNA_INVALIDA');return `\`${s}\``};
const hashFile=async(file:FileHandle)=>{const h=createHash('sha256');for await(const chunk of file.createReadStream({start:0,autoClose:false}))h.update(chunk as Buffer);return h.digest('hex')};
async function safeManifest(path:string){const full=resolve(path),parent=await fs.realpath(dirname(full));if(parent!==resolve(dirname(full))||(parent!=='/home/ubuntu/private'&&!parent.startsWith('/home/ubuntu/private/'))||!full.startsWith(parent+'/'))throw Error('CAMINHO_INSEGURO');return full}
function digest(rows:Record<string,string|number|null>[]){const h=createHash('sha256');for(const row of rows){h.update(JSON.stringify(DATA_COLUMNS.map(c=>row[c]??null)));h.update('\n')}return h.digest('hex')}
function keyDigest(keys:Set<string>){const h=createHash('sha256');for(const key of [...keys].sort())h.update(key+'\n');return h.digest('hex')}
async function run(){
 const input=resolve(filename!),parent=await fs.realpath(dirname(input));
 if(!['/home/ubuntu/upload','/home/ubuntu/private'].includes(parent)||parent!==resolve(dirname(input)))throw Error('ARQUIVO_INVALIDO');
 const file=await fs.open(input,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.size<10||stat.size>350*1024*1024)throw Error('ARQUIVO_INVALIDO');
  const inputHash=await hashFile(file);
  let first=true,total=0;const latest=new Map<string,{row:HemoCsvRecord;order:string}>();
  for await (const fields of file.createReadStream({start:0,autoClose:false}).pipe(parse({bom:true,delimiter:',',quote:'"',skip_empty_lines:true,max_record_size:65536}))){
   const record=fields as string[];
   if(first){first=false;if(record.length!==HEMO_CSV_HEADERS.length||record.some((s,i)=>cleanHemo(s).toUpperCase()!==HEMO_CSV_HEADERS[i]))throw Error('CABECALHO_INVALIDO');continue}
   total++;if(total>MAX_ROWS)throw Error('LIMITE_OPERACIONAL');
   const row=parseHemoCsvRecord(record),key=hemoKey(row),order=hemoLatestOrder(row,total+1);
   const prev=latest.get(key);if(!prev||order>prev.order)latest.set(key,{row,order});
   if(latest.size>MAX_KEYS)throw Error('LIMITE_OPERACIONAL');
   if(total%100000===0)console.log('LIDAS=',total);
  }
  if(first||total<1||latest.size<1||(await hashFile(file))!==inputHash)throw Error('ARQUIVO_INVALIDO');
  const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  let inTransaction=false;
  try{
   await db.query("SET time_zone = '+00:00'");
   const [[database]]=await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() n');
   const [schema]=await db.query<mysql.RowDataPacket[]>("SELECT column_name n,data_type t,is_nullable nullable,character_maximum_length len,numeric_precision p,numeric_scale s FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='atendimentos_unificados'");
   const cols=new Map(schema.map(r=>[String(r.n),r]));
   for(const col of HEMO_NOVAS_COLUNAS)if(!cols.has(col))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
   if(cols.get('valorConta')?.t!=='decimal'||Number(cols.get('valorConta')?.p)!==15||Number(cols.get('valorConta')?.s)!==2)throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
   for(const date of ['origemAtualizadaEm','data_entrada','data_saida','dtEntrega','dtEtapa','dtTitulo','dataSincronizacao','criadoEm','atualizadoEm'])if(!['datetime','timestamp'].includes(String(cols.get(date)?.t)))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
   for(const numeric of ['estabelecimentoId','configId','ultimoLoteId','ativoNaFonte'])if(!['int','tinyint'].includes(String(cols.get(numeric)?.t)))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
   for(const col of DATA_COLUMNS.filter(c=>!['origemAtualizadaEm','data_entrada','data_saida','dtEntrega','dtEtapa','dtTitulo','estabelecimentoId','configId','ultimoLoteId','ativoNaFonte','valorConta'].includes(c))){
    if(!['varchar','char','text','mediumtext','longtext'].includes(String(cols.get(col)?.t)))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
   }
   const [indices]=await db.query<mysql.RowDataPacket[]>("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) cols FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='atendimentos_unificados' AND non_unique=0 GROUP BY index_name");
   if(!indices.some(r=>r.cols==='estabelecimentoId,origemSistema,origemId'))throw Error('INDICE_UNICO_AUSENTE');
   const [current]=await db.query<mysql.RowDataPacket[]>("SELECT origemId FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor')",[E]);
   if(current.length>MAX_KEYS)throw Error('LIMITE_OPERACIONAL');
   const known=new Set<string>();for(const r of current){if(known.has(String(r.origemId)))throw Error('ORIGEM_AMBIGUA');known.add(String(r.origemId))}
   const initialKeysDigest=keyDigest(known),keysBefore=latest.size;let existing=0;
   for(const key of known)if(latest.delete(key))existing++;
   let pending=0,titled=0,particular=0,hidden=0,noCompetence=0;const candidates:Record<string,string|number|null>[]=[];
   for(const {row} of latest.values()){
    if(row.TITULO){titled++;continue}
    pending++;
    if(row.CONVENIO.toUpperCase()==='PARTICULAR'){particular++;continue}
    // A tela paginada exclui descrição nula e A_FATURAR; não gravar como "visível" algo que ela esconderá.
    if(!row.PROCEDIMENTO||row.PROCEDIMENTO.toUpperCase().includes('A_FATURAR')){hidden++;continue}
    const mapped=mapHemoNewPending(row);
    if(mapped.competencia===null)noCompetence++;
    for(const col of DATA_COLUMNS){const value=mapped[col],meta=cols.get(col),max=Number(meta?.len||0);
     if(value===null&&meta?.nullable!=='YES'||typeof value==='string'&&max>0&&value.length>max)throw Error('CONTEUDO_FORA_DO_CONTRATO')}
    candidates.push(mapped);if(candidates.length>MAX_INSERTS)throw Error('LIMITE_OPERACIONAL');
   }
   candidates.sort((a,b)=>String(a.origemId).localeCompare(String(b.origemId)));
   const [[limits]]=await db.query<mysql.RowDataPacket[]>('SELECT @@max_allowed_packet AS bytes');
   if(Number(limits.bytes)<8*1024*1024)throw Error('PACOTE_SQL_INSUFICIENTE');
   // Evita statement maior que 4 MiB mesmo com campos TEXT próximos do limite do parser.
   const BATCH_ROWS=50,MAX_BATCH_BYTES=4*1024*1024;
   const batches:typeof candidates=[];
   const chunks:(typeof candidates)[]=[];let batchBytes=0;
   for(const row of candidates){
    const bytes=Buffer.byteLength(JSON.stringify(DATA_COLUMNS.map(c=>row[c]??null)),'utf8')+2048;
    if(bytes>MAX_BATCH_BYTES)throw Error('LIMITE_OPERACIONAL');
    if(batches.length&&(batches.length>=BATCH_ROWS||batchBytes+bytes>MAX_BATCH_BYTES)){
     chunks.push(batches.splice(0));batchBytes=0;
    }
    batches.push(row);batchBytes+=bytes;
   }
   if(batches.length)chunks.push(batches);
   const totalBefore=current.length;
   const summary={modo:apply?'APLICAR':'PREVIA_SEM_ESCRITA',linhasArquivo:total,chavesArquivo:keysBefore,chavesExistentes:existing,pendentesNovas:pending,particularesForaDaTela:particular,ocultasPeloFiltroAtual: hidden,competenciasAusentesNasCandidatas:noCompetence,novasComTituloIgnoradas:titled,insercoesPlanejadas:candidates.length,contasExistentesAlteradas:0};
   console.log('RESUMO=',JSON.stringify(summary));
   const fingerprint=digest(candidates);
   if(!apply){
    const output=process.env.HEMO_NOVAS_MANIFEST_PATH;
    if(output){const path=await safeManifest(output),temp=`${path}.${process.pid}.tmp`,f=await fs.open(temp,'wx',0o600);
     try{await f.writeFile(JSON.stringify({versao:1,sha256:inputHash,banco:database.n,linhas:total,chaves:keysBefore,destino:totalBefore,candidatas:candidates.length,particulares:particular,ocultas:hidden,semCompetencia:noCompetence,digest:fingerprint})+'\n');await f.sync()}finally{await f.close()}
     try{await fs.link(temp,path)}finally{await fs.unlink(temp)}
    }
    return;
   }
   const path=await safeManifest(manifestPath!),mstat=await fs.lstat(path);
   if(!mstat.isFile()||(mstat.mode&0o077)!==0)throw Error('MANIFESTO_DIVERGENTE');
   const m=JSON.parse(await fs.readFile(path,'utf8'));
   if(m.versao!==1||m.sha256!==inputHash||m.banco!==database.n||m.linhas!==total||m.chaves!==keysBefore||m.destino!==totalBefore||m.candidatas!==candidates.length||m.particulares!==particular||m.ocultas!==hidden||m.semCompetencia!==noCompetence||m.digest!==fingerprint||!candidates.length)throw Error('MANIFESTO_DIVERGENTE');
   await db.beginTransaction();inTransaction=true;
   const [locked]=await db.query<mysql.RowDataPacket[]>('SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE',[E]);if(locked.length!==1)throw Error('UNIDADE_INDISPONIVEL');
   const [lockedKeys]=await db.query<mysql.RowDataPacket[]>("SELECT origemId FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor')",[E]);
   if(lockedKeys.length!==totalBefore||keyDigest(new Set(lockedKeys.map(r=>String(r.origemId))))!==initialKeysDigest||(await hashFile(file))!==inputHash)throw Error('BASE_MUDOU');
   let inserted=0;
   for(const group of chunks){
    const one=`(${DATA_COLUMNS.map(()=>'?').join(',')},NOW(),NOW(),NOW())`;
    const sql=`INSERT INTO atendimentos_unificados (${HEMO_NOVAS_COLUNAS.map(identifier).join(',')}) VALUES ${group.map(()=>one).join(',')}`;
    const params=group.flatMap(row=>DATA_COLUMNS.map(col=>row[col]));
    const [res]=await db.execute<mysql.ResultSetHeader>(sql,params);
    if(res.affectedRows!==group.length)throw Error('CONTAGEM_INSERT_DIVERGENTE');
    inserted+=res.affectedRows;if(inserted%1000===0)console.log('INSERIDAS=',inserted);
   }
   const [[after]]=await db.query<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor')",[E]);
   if(inserted!==candidates.length||Number(after.n)!==totalBefore+inserted)throw Error('POS_CONDICAO_FALHOU');
   try{await db.commit();inTransaction=false}
   catch{
    // TiDB pode confirmar a transação e a resposta de rede se perder: nunca assumir rollback.
    let persisted=0;
    try{
     const verify=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true});
     try{
      for(let i=0;i<candidates.length;i+=200){
       const group=candidates.slice(i,i+200),expected=new Map(group.map(r=>[String(r.origemId),String(r.hashConteudo)]));
       const [found]=await verify.query<mysql.RowDataPacket[]>(`SELECT origemId,hashConteudo FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema='tasy' AND origemId IN (${group.map(()=>'?').join(',')})`,[E,...expected.keys()]);
       for(const row of found)if(expected.get(String(row.origemId))===String(row.hashConteudo))persisted++;
      }
     }finally{await verify.end()}
    }catch{/* Não informar cancelamento se o resultado do COMMIT não foi provado. */}
    if(persisted===candidates.length){inTransaction=false;console.log('COMMIT_CONFIRMADO_EM_NOVA_CONEXAO=',persisted)}
    else throw Error('COMMIT_INDETERMINADO_NAO_REEXECUTAR');
   }
   console.log('RESULTADO=',JSON.stringify({novasContasInseridas:inserted,contasExistentesAlteradas:0,outrasUnidadesAlteradas:0,particularesIgnorados:particular}));
  }finally{if(inTransaction)try{await db.rollback()}catch{/* O estado do COMMIT já será reportado como indeterminado. */}await db.end()}
 }finally{await file.close()}
}
const safe=new Set(['COLUNAS_INVALIDAS','CHAVE_INVALIDA','DATA_ORDENACAO_INVALIDA','SEQUENCIA_INVALIDA','VALOR_FORA_DE_PRECISAO','VALOR_INVALIDO','DATA_FORA_DO_CONTRATO','DADO_ESSENCIAL_AUSENTE','COMPETENCIA_INVALIDA','SCHEMA_DESTINO_INCOMPATIVEL','INDICE_UNICO_AUSENTE','ORIGEM_AMBIGUA','CONTEUDO_FORA_DO_CONTRATO','MANIFESTO_DIVERGENTE','BASE_MUDOU','CONTAGEM_INSERT_DIVERGENTE','POS_CONDICAO_FALHOU','LIMITE_OPERACIONAL']);
safe.add('COMMIT_INDETERMINADO_NAO_REEXECUTAR');safe.add('PACOTE_SQL_INSUFICIENTE');
run().catch(e=>{console.error('PUBLICACAO_CANCELADA:',safe.has(e?.message)?e.message:'FALHA_DE_VALIDACAO');process.exitCode=1});
