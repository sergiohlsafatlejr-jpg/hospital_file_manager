import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {Request} from 'express';
const db=vi.hoisted(()=>({getUserByOpenId:vi.fn(),upsertUser:vi.fn()}));
vi.mock('./db',()=>db);
import {sdk} from './_core/sdk';
import {COOKIE_NAME} from '../shared/const';
const request={headers:{cookie:`${COOKIE_NAME}=token-ficticio-nao-valido`}} as Request;
describe('SDK: identidade exclusiva de agendamento',()=>{
 beforeEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();vi.spyOn(sdk,'verifySession').mockResolvedValue({openId:'cron_ficticio',appId:'app_ficticio',name:'Tarefa fictícia'});});
 it('usa o UID recebido do serviço autenticado sem consultar ou cadastrar usuário cron',async()=>{
  vi.spyOn(sdk,'getUserInfoWithJwt').mockResolvedValue({openId:'cron_ficticio',projectId:'projeto_ficticio',name:'Tarefa fictícia',taskUid:'uid_autenticado_ficticio'});
  const user=await sdk.authenticateRequest(request);expect(user).toMatchObject({id:-1,isCron:true,role:'user',taskUid:'uid_autenticado_ficticio'});expect(db.getUserByOpenId).not.toHaveBeenCalled();expect(db.upsertUser).not.toHaveBeenCalled();
 });
 it('rejeita identidade cron sem UID verificado',async()=>{
  vi.spyOn(sdk,'getUserInfoWithJwt').mockResolvedValue({openId:'cron_ficticio',projectId:'projeto_ficticio',name:'Tarefa fictícia'});
  await expect(sdk.authenticateRequest(request)).rejects.toThrow('Cron session missing task_uid');expect(db.getUserByOpenId).not.toHaveBeenCalled();expect(db.upsertUser).not.toHaveBeenCalled();
 });
 it('rejeita cookie inválido antes de consultar plataforma ou cadastro',async()=>{
  vi.mocked(sdk.verifySession).mockResolvedValue(null);const lookup=vi.spyOn(sdk,'getUserInfoWithJwt');await expect(sdk.authenticateRequest(request)).rejects.toThrow('Invalid session cookie');expect(lookup).not.toHaveBeenCalled();expect(db.getUserByOpenId).not.toHaveBeenCalled();
 });
});
