/*
 * CSV Hemolabor: atualização conservadora de campos informados das contas TASY
 * existentes que continuam sem título. Prévia padrão; não inclui novas contas,
 * não finaliza, não altera datas, não desativa registros ou outras unidades.
 * Nenhum dado pessoal, fingerprint ou texto do driver é escrito no stdout.
 */
import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'csv-parse';
import mysql from 'mysql2/promise';
import {
  HEMO_ESTABELECIMENTO_ID as E, HEMO_CSV_HEADERS, HEMO_FIELD_MAP,
  cleanHemo, hemoKey, hemoLatestOrder, parseHemoCsvRecord,
  planHemoPendingUpdate, type HemoCsvRecord, type HemoExisting,
} from '../server/hemolaborPendentesCsv';

const BASE_COLUMNS=[...new Set(HEMO_FIELD_MAP.map(([,col])=>col)),'competencia','referencia','valorConta'] as const;
const OLD_COLUMNS=['id','origemSistema','origemId','estabelecimentoId','ativoNaFonte','titulo','atualizadoEm','hashConteudo','dataSincronizacao',...BASE_COLUMNS] as const;
const ALLOWED_COLUMNS=new Set<string>(BASE_COLUMNS);
const identifier=(x: string) => {if(!/^[a-zA-Z_][\w]*$/.test(x))throw Error('COLUNA_INVALIDA');return `\`${x}\``};
async function hashFile(file:FileHandle){const h=createHash('sha256');for await(const chunk of file.createReadStream({start:0,autoClose:false}))h.update(chunk as Buffer);return h.digest('hex')}
const MAX_ROWS=800_000, MAX_KEYS=180_000, MAX_CHANGES=20_000;
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const filename=args.find(a=>a.startsWith('--file='))?.slice('--file='.length);
const manifestPath=args.find(a=>a.startsWith('--manifest='))?.slice('--manifest='.length);
if(!filename)throw Error('Informe --file=<caminho privado>');
if(apply && (!manifestPath || !args.includes('--confirm-pending-only') || !args.includes('--confirm-reviewed-pr') || !args.includes('--confirm-production-update')))throw Error('CONFIRMACOES_AUSENTES');

async function privatePath(path:string){
 const full=resolve(path), parent=await fs.realpath(dirname(full));
 if(parent!=='/home/ubuntu/private' && !parent.startsWith('/home/ubuntu/private/'))throw Error('CAMINHO_MANIFESTO_INSEGURO');
 if(parent!==resolve(dirname(full)))throw Error('CAMINHO_MANIFESTO_INSEGURO');
 if(!full.startsWith(parent+'/'))throw Error('CAMINHO_MANIFESTO_INSEGURO');
 return full;
}
function planDigest(plan:{old:mysql.RowDataPacket;updates:Record<string,string>}[]){
 const h=createHash('sha256');
 for(const {old,updates} of [...plan].sort((a,b)=>Number(a.old.id)-Number(b.old.id))){
  const changes=Object.entries(updates).sort(([a],[b])=>a.localeCompare(b)).map(([col,val])=>[col,String(old[col]??''),val]);
  h.update(JSON.stringify([old.id,old.origemId,old.origemSistema,old.atualizadoEm,old.hashConteudo,changes]));h.update('\n');
 }
 return h.digest('hex');
}

async function run(){
 const input=resolve(filename!);
 const inputParent=await fs.realpath(dirname(input));
 if(!['/home/ubuntu/upload','/home/ubuntu/private'].includes(inputParent) ||
    inputParent!==resolve(dirname(input)))throw Error('ARQUIVO_INVALIDO');
 const file=await fs.open(input,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
 try{
 const stat=await file.stat();if(!stat.isFile()||stat.size<10||stat.size>350*1024*1024)throw Error('ARQUIVO_INVALIDO');
 const beforeHash=await hashFile(file);
 let first=true,total=0;const latest=new Map<string,{row:HemoCsvRecord;order:string}>();
 const stream=file.createReadStream({start:0,autoClose:false}).pipe(parse({bom:true,delimiter:',',quote:'"',skip_empty_lines:true,max_record_size:65536}));
 for await (const raw of stream){
  const record=raw as string[];
  if(first){first=false;if(record.length!==HEMO_CSV_HEADERS.length||record.some((v,i)=>cleanHemo(v).toUpperCase()!==HEMO_CSV_HEADERS[i]))throw Error('CABECALHO_DIVERGENTE');continue}
  total++;if(total>MAX_ROWS)throw Error('LIMITE_OPERACIONAL');
  const row=parseHemoCsvRecord(record),key=hemoKey(row),order=hemoLatestOrder(row,total+1);
  const old=latest.get(key);if(!old||order>old.order)latest.set(key,{row,order});
  if(latest.size>MAX_KEYS)throw Error('LIMITE_OPERACIONAL');
  if(total%100000===0)console.log('LIDAS=',total);
 }
 if(first||total===0||latest.size<1)throw Error('SNAPSHOT_INVALIDO');
 if((await hashFile(file))!==beforeHash)throw Error('ARQUIVO_MUDOU');
 if(!process.env.DATABASE_URL)throw Error('BANCO_INDISPONIVEL');
 const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
 let inTransaction=false;
 try{
  const [[banco]]=await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() n');
  const [physical]=await db.query<mysql.RowDataPacket[]>("SELECT column_name n,data_type t,numeric_precision p,numeric_scale s,character_maximum_length maxlen FROM information_schema.columns WHERE table_schema=database() AND table_name='atendimentos_unificados'");
  const metadata=new Map(physical.map(x=>[String(x.n),x]));
  const lengths=new Map(physical.map(x=>[String(x.n),Number(x.maxlen||0)]));
  for(const column of OLD_COLUMNS){if(!lengths.has(column))throw Error('SCHEMA_DESTINO_INCOMPATIVEL')}
  for(const column of BASE_COLUMNS.filter(c=>c!=='valorConta')){
    if(!['varchar','text','mediumtext','longtext','char'].includes(String(metadata.get(column)?.t)))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
  }
  const amount=metadata.get('valorConta');
  if(amount?.t!=='decimal'||Number(amount.p)!==15||Number(amount.s)!==2||
     !['datetime','timestamp'].includes(String(metadata.get('atualizadoEm')?.t))||
     !['datetime','timestamp'].includes(String(metadata.get('dataSincronizacao')?.t)))throw Error('SCHEMA_DESTINO_INCOMPATIVEL');
  const [indices]=await db.query<mysql.RowDataPacket[]>("SELECT group_concat(column_name ORDER BY seq_in_index) cols FROM information_schema.statistics WHERE table_schema=database() AND table_name='atendimentos_unificados' AND non_unique=0 GROUP BY index_name");
  if(!indices.some(x=>x.cols==='estabelecimentoId,origemSistema,origemId'))throw Error('INDICE_UNICO_AUSENTE');
  const [current]=await db.query<mysql.RowDataPacket[]>(`SELECT ${OLD_COLUMNS.map(identifier).join(',')} FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor')`,[E]);
  if(current.length>MAX_KEYS)throw Error('LIMITE_OPERACIONAL');
  const ids=new Set<string>();for(const old of current){if(ids.has(String(old.origemId)))throw Error('ORIGEM_AMBIGUA');ids.add(String(old.origemId))}
  const sourceKeys=latest.size;
  const plan:{old:mysql.RowDataPacket;updates:Record<string,string>}[]=[];
  let present=0,finalized=0,nowTitle=0,eligible=0,unchanged=0,pendingMissing=0;
  for(const old of current){
   const entry=latest.get(String(old.origemId));
   if(!entry){if(Number(old.ativoNaFonte)===1&&!cleanHemo(old.titulo))pendingMissing++;continue}
   present++;latest.delete(String(old.origemId));
   if(Number(old.ativoNaFonte)!==1||cleanHemo(old.titulo)){finalized++;continue}
   if(entry.row.TITULO){nowTitle++;continue}
   eligible++;
   const updates=planHemoPendingUpdate(entry.row,old as HemoExisting);
   if(!updates){unchanged++;continue}
   for(const [column,text] of Object.entries(updates)){
    if(!ALLOWED_COLUMNS.has(column)|| (lengths.get(column)!>0 && text.length>lengths.get(column)!))throw Error('CONTEUDO_FORA_DO_CONTRATO');
   }
   plan.push({old,updates});
   if(plan.length>MAX_CHANGES)throw Error('LIMITE_OPERACIONAL');
  }
  let newPending=0,newTitled=0;
  for(const {row} of latest.values())row.TITULO?newTitled++:newPending++;
  const aggregate={modo:apply?'APLICAR':'PREVIA_SEM_ESCRITA',linhasArquivo:total,chavesArquivo:sourceKeys,existentes:present,pendentesElegiveis:eligible,alteracoesPlanejadas:plan.length,semAlteracao:unchanged,finalizadasOuInativasPreservadas:finalized,arquivoComTituloPreservado:nowTitle,novasPendentesNaoIncluidas:newPending,novasComTituloNaoIncluidas:newTitled,pendentesAntigasAusentesPreservadas:pendingMissing,datasDeNegocioAlteradas:0,titulosAlterados:0,metadadosDeSincronizacaoPlanejados:plan.length};
  console.log('RESUMO=',JSON.stringify(aggregate));
  if(!apply){
    const output=process.env.HEMO_PREVIEW_MANIFEST_PATH;
    if(output){
      const safe=await privatePath(output);const temp=`${safe}.${process.pid}.tmp`;
      const file=await fs.open(temp,'wx',0o600);
      try{await file.writeFile(JSON.stringify({versao:1,sha256:beforeHash,bancoEsperado:banco.n,
        linhas:total,chaves:sourceKeys,destino:current.length,pendentes:eligible,alteracoes:plan.length,
        digest:planDigest(plan)})+'\n');await file.sync()}finally{await file.close()}
      try{await fs.link(temp,safe)}finally{await fs.unlink(temp)}
    }
    return;
  }
  const safe=await privatePath(manifestPath!);const info=await fs.lstat(safe);
  if(!info.isFile() || (info.mode&0o077)!==0)throw Error('MANIFESTO_INCOMPATIVEL');
  const manifesto=JSON.parse(await fs.readFile(safe,'utf8'));
  if(manifesto.versao!==1||manifesto.bancoEsperado!==banco.n||manifesto.sha256!==beforeHash||
    manifesto.linhas!==total||manifesto.chaves!==sourceKeys||manifesto.destino!==current.length||
    manifesto.pendentes!==eligible||manifesto.alteracoes!==plan.length||
    manifesto.digest!==planDigest(plan)||plan.length===0)throw Error('MANIFESTO_INCOMPATIVEL');
  await db.beginTransaction();inTransaction=true;
  const [lock]=await db.query<mysql.RowDataPacket[]>('SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE',[E]);if(lock.length!==1)throw Error('UNIDADE_INDISPONIVEL');
  const [[currentCount]]=await db.query<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM atendimentos_unificados WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor')",[E]);
  if(Number(currentCount.n)!==current.length)throw Error('BASE_MUDOU');
  if((await hashFile(file))!==beforeHash)throw Error('ARQUIVO_MUDOU');
  let updated=0;
  for(const {old,updates} of plan){
    const columns=Object.keys(updates);
    const assignments=columns.map(c=>`${identifier(c)}=?`).join(',');
    const unchanged=columns.map(c=>`${identifier(c)} <=> ?`).join(' AND ');
    const [r]=await db.execute<mysql.ResultSetHeader>(`UPDATE atendimentos_unificados SET ${assignments}, atualizadoEm=NOW(),dataSincronizacao=NOW() WHERE id=? AND estabelecimentoId=? AND origemSistema=? AND origemId=? AND ativoNaFonte=1 AND (titulo IS NULL OR TRIM(titulo)='') AND atualizadoEm <=> ? AND hashConteudo <=> ? AND ${unchanged}`,
      [...Object.values(updates),old.id,E,old.origemSistema,old.origemId,old.atualizadoEm,old.hashConteudo,...columns.map(c=>old[c])]);
    if(r.affectedRows!==1)throw Error('CONCORRENCIA_DETECTADA');
    updated++;if(updated%1000===0)console.log('ATUALIZADAS=',updated);
  }
  if(updated!==plan.length)throw Error('POS_CONDICAO_FALHOU');
  // O índice único impede duplicatas; a cláusula WHERE garante a unidade e a pendência.
  await db.commit();inTransaction=false;
  console.log('RESULTADO=',JSON.stringify({contasExistentesAlteradas:updated,novasContasInseridas:0,contasFinalizadasAlteradas:0,datasDeNegocioAlteradas:0,metadadosDeSincronizacaoAlterados:updated}));
 }finally{if(inTransaction)await db.rollback();await db.end()}
 }finally{await file.close()}
}
const safeFailures=new Set(['COLUNAS_INVALIDAS','CHAVE_INVALIDA','DATA_ORDENACAO_INVALIDA',
  'SEQUENCIA_INVALIDA','VALOR_FORA_DE_PRECISAO','VALOR_INVALIDO','CONTEUDO_FORA_DO_CONTRATO',
  'SCHEMA_DESTINO_INCOMPATIVEL','INDICE_UNICO_AUSENTE','MANIFESTO_INCOMPATIVEL',
  'ARQUIVO_MUDOU','BASE_MUDOU','CONCORRENCIA_DETECTADA']);
safeFailures.add('ORIGEM_AMBIGUA');safeFailures.add('LIMITE_OPERACIONAL');
run().catch(error=>{console.error('ATUALIZACAO_CANCELADA:',safeFailures.has(error?.message)?error.message:'FALHA_DE_VALIDACAO');process.exitCode=1});
