// Somente homologação local. Nunca importe este módulo no servidor do Portal.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
if (process.env.SAFATLE_AUTH_QA !== '1') throw new Error('Exige SAFATLE_AUTH_QA=1 e MariaDB local exclusivo na porta 3408');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const privateDir = '/home/ubuntu/private/auth-homologacao-runtime';
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const statePath = path.join(privateDir, 'sintetico.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {
  password: `Qa${randomBytes(18).toString('hex')}A1`, jwtSecret: randomBytes(32).toString('hex'),
};
writeFileSync(statePath, JSON.stringify(state) + '\n', { mode: 0o600 });
// O processo não herda credenciais, endpoints, proxies ou chaves de produção.
const kept = Object.fromEntries(['PATH','HOME','LANG','TMPDIR'].filter(k => process.env[k]).map(k => [k,process.env[k]!]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, kept, {
  NODE_ENV: 'development', DATABASE_URL: 'mysql://root@127.0.0.1:3408/safatle_auth_homologacao',
  APP_DATABASE_URL: 'mysql://root@127.0.0.1:3408/safatle_auth_homologacao',
  JWT_SECRET: state.jwtSecret, VITE_APP_ID: 'safatle-auth-qa', OWNER_OPEN_ID: 'qa_admin',
  OAUTH_SERVER_URL: 'http://127.0.0.1:3042', PUBLIC_APP_URL: 'https://127.0.0.1:3041',
  BUILT_IN_FORGE_API_URL: 'http://127.0.0.1:9', BUILT_IN_FORGE_API_KEY: '',
});
const allowedPorts = new Set([3408,3041,3042,3043]);
const originalConnect = net.Socket.prototype.connect;
(net.Socket.prototype as any).connect = function(...args:any[]) {
  let candidate:any = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof candidate === 'object' ? (candidate.host || 'localhost') : (typeof args[1] === 'string' ? args[1] : 'localhost');
  const port = Number(typeof candidate === 'object' ? candidate.port : candidate);
  if (!['127.0.0.1','localhost','::1'].includes(host) || !allowedPorts.has(port)) {
    throw new Error('QA_REDE_EXTERNA_BLOQUEADA');
  }
  return (originalConnect as any).apply(this,args);
};
const mysql = (await import('mysql2/promise')).default;
const bcrypt = (await import('bcryptjs')).default;
const {getTableConfig,MySqlDialect} = await import('drizzle-orm/mysql-core');
const {SQL} = await import('drizzle-orm');
const schema = await import('../../drizzle/schema');
const connection = await mysql.createConnection({host:'127.0.0.1',port:3408,user:'root',connectTimeout:5000});
await connection.query('CREATE DATABASE IF NOT EXISTS safatle_auth_homologacao CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
await connection.query('USE safatle_auth_homologacao');
const dialect = new MySqlDialect();
const tables = [schema.users,schema.estabelecimentos,schema.permissoesEstabelecimento,schema.authRateLimits,schema.authSecurityEvents,schema.passwordResetTokens];
for(const table of tables){
 const config=getTableConfig(table);
 const parts=config.columns.map((column:any)=>{
  let value=`\`${column.name}\` ${column.getSQLType()}`;
  if(column.notNull)value+=' NOT NULL';
  if(column.autoIncrement)value+=' AUTO_INCREMENT';
  if(column.primary)value+=' PRIMARY KEY';
  if(column.isUnique&&!column.primary)value+=' UNIQUE';
  if(column.default!==undefined){const def=column.default instanceof SQL?dialect.sqlToQuery(column.default).sql:mysql.escape(column.default);value+=` DEFAULT ${def}`;}
  if(column.hasOnUpdateNow)value+=' ON UPDATE CURRENT_TIMESTAMP';
  return value;
 });
 for(const index of config.indexes){const cfg:any=index.config;parts.push(`${cfg.unique?'UNIQUE ':''}KEY \`${cfg.name}\` (${cfg.columns.map((c:any)=>`\`${c.name}\``).join(',')})`);}
 await connection.query(`CREATE TABLE IF NOT EXISTS \`${config.name}\` (${parts.join(',')}) ENGINE=InnoDB`);
}
const [counts]:any=await connection.query('SELECT COUNT(*) AS n FROM users');
if(Number(counts[0].n)===0){
 const hash=await bcrypt.hash(state.password,12);
 for(const [id,openId,name,email,role] of [[1,'qa_user','Usuário Homologação','permitido@example.invalid','user'],[2,'qa_sem_acesso','Sem Acesso Homologação','semacesso@example.invalid','user'],[3,'qa_outro','Outra Unidade Homologação','outra@example.invalid','user'],[4,'qa_admin','Admin Homologação','admin@example.invalid','admin']]){
  await connection.execute('INSERT INTO users (id,openId,name,email,emailCanonical,role,passwordHash,sessionVersion) VALUES (?,?,?,?,?,?,?,0)',[id,openId,name,email,email,role,hash]);
 }
 await connection.query("INSERT INTO estabelecimentos (id,nome,endereco) VALUES (101,'Hospital Alfa — Homologação','Somente dados fictícios'),(102,'Hospital Beta — Homologação','Somente dados fictícios')");
 await connection.query("INSERT INTO permissoesEstabelecimento (userId,estabelecimentoId,podeVisualizar,acessoDashboard) VALUES (1,101,'sim','sim'),(3,102,'sim','sim')");
}else{
 const [unsafe]:any=await connection.query("SELECT COUNT(*) AS n FROM users WHERE openId NOT IN ('qa_user','qa_sem_acesso','qa_outro','qa_admin')");
 if(Number(unsafe[0].n)!==0)throw new Error('QA_CONTEM_IDENTIDADE_NAO_SINTETICA');
}
await connection.end();
const express=(await import('express')).default;
const {createExpressMiddleware}=await import('@trpc/server/adapters/express');
const {appRouter}=await import('../../server/routers');
const {router,publicProcedure,protectedProcedure}=await import('../../server/_core/trpc');
const {z}=await import('zod');
const {createContext}=await import('../../server/_core/context');
const {registerOAuthRoutes}=await import('../../server/_core/oauth');
const {passwordAuthRouter}=await import('../../server/routers/passwordAuthRouter');
const app=express();app.set('trust proxy','loopback');app.use(express.json());
// Provedor externo é o único componente de login substituído no fluxo OAuth.
app.post('/webdev.v1.WebDevAuthPublicService/ExchangeToken',(req,res)=>{
 const code=req.body?.code;
 if(code==='qa-falha')return res.status(503).json({message:'QA upstream unavailable'});
 if(code==='qa-rate')return res.status(429).json({message:'QA rate exceeded'});
 if(!['qa-ok','qa-identidade-falha'].includes(code))return res.status(400).json({message:'QA invalid code'});
 return res.json({accessToken:code,tokenType:'Bearer'});
});
app.post('/webdev.v1.WebDevAuthPublicService/GetUserInfo',(req,res)=>{
 if(req.body?.accessToken==='qa-identidade-falha')return res.status(503).json({message:'QA identity unavailable'});
 return res.json({openId:'qa_user',name:'Usuário Homologação',email:'permitido@example.invalid',platform:'email'});
});
app.post('/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt',(_req,res)=>res.status(403).json({message:'QA sync externo desabilitado'}));
app.get('/app-auth',(req,res)=>{
 const target=String(req.query.redirectUri||'');
 if(target!=='https://127.0.0.1:3041/api/oauth/callback')return res.status(400).send('Origem QA inválida');
 const stateValue=encodeURIComponent(String(req.query.state||''));
 res.type('html').send(`<html lang="pt-BR"><body><h1>Provedor OAuth simulado — Homologação</h1><p>Sem credenciais ou conexão externas.</p><a href="${target}?code=qa-ok&state=${stateValue}">Entrar com usuário fictício</a><br><a href="${target}?code=qa-falha&state=${stateValue}">Simular falha do provedor</a></body></html>`);
});
registerOAuthRoutes(app);
const record:any=appRouter._def.record;
const qaRouter=router({auth:record.auth,passwordAuth:passwordAuthRouter,permissoes:record.permissoes,estabelecimentos:record.estabelecimentos,noticias:router({listar:publicProcedure.query(()=>[])}),qaAcesso:router({ver:protectedProcedure.input(z.object({estabelecimentoId:z.number().int().positive()})).query(({input})=>({estabelecimentoId:input.estabelecimentoId,dados:'Exclusivamente fictícios'}))})});
app.use('/api/trpc',createExpressMiddleware({router:qaRouter,createContext}));
app.get('/qa/health',(_req,res)=>res.json({somenteHomologacao:true,bancoLocal:true,oauthSimulado:true,redeExternaBloqueada:true}));
app.post('/qa/revogar',async(_req,res)=>{const c=await mysql.createConnection(process.env.DATABASE_URL!);await c.query("UPDATE users SET sessionVersion=sessionVersion+1 WHERE openId='qa_user'");await c.end();res.json({revogado:true});});
app.post('/qa/restaurar',async(_req,res)=>{const c=await mysql.createConnection(process.env.DATABASE_URL!);await c.query('DELETE FROM authRateLimits');await c.end();res.json({restaurado:true});});
const server=app.listen(3042,'127.0.0.1',()=>console.log('QA_AUTH_PRONTO:3042; banco sintético; chamadas externas bloqueadas'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
