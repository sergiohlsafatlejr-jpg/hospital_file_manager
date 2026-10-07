import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 HEMO_CSV_HEADERS,HEMO_ESTABELECIMENTO_ID,cleanHemo,parseHemoCsvRecord,
 hemoKey,hemoLatestOrder,planHemoPendingUpdate,
} from './hemolaborPendentesCsv';

function sample(overrides: Record<string,string>={}){
 const record=Object.fromEntries(HEMO_CSV_HEADERS.map(x=>[x,'']));
 return {...record,ATENDIMENTO:'101',CONTA:'202',SEQUENCIA:'3',
  ATUALIZACAO:'2026-10-07 11:22:33.000',DT_ETAPA:'2026-10-07 10:22:33.000',
  ETAPA_CONTA:'Pendente',VALOR_CONTA:'123,40',...overrides} as ReturnType<typeof parseHemoCsvRecord>;
}
function current(overrides:Record<string,unknown>={}){
 return {origemSistema:'tasy',origemId:'101:202',estabelecimentoId:HEMO_ESTABELECIMENTO_ID,
  ativoNaFonte:1,titulo:null,etapaConta:'Outra etapa',valorConta:'120.00',
  data_entrada:'2026-10-07 07:00:00',dtEtapa:'2026-10-07 07:00:00',...overrides};
}
describe('CSV de pendências Hemolabor — apenas contas TASY existentes',()=>{
 it('exige as 31 colunas e duas partes numéricas na chave',()=>{
  expect(hemoKey(sample())).toBe('101:202');
  expect(()=>parseHemoCsvRecord(['x'])).toThrow('COLUNAS_INVALIDAS');
  expect(()=>parseHemoCsvRecord([...HEMO_CSV_HEADERS.map(k=>sample()[k]),'campo a mais'])).toThrow('COLUNAS_INVALIDAS');
  expect(()=>parseHemoCsvRecord(HEMO_CSV_HEADERS.map(k=>k==='CONTA'?'':k==='ATENDIMENTO'?'101':''))).toThrow('CHAVE_INVALIDA');
 });
 it('escolhe a linha mais recente pelo carimbo do sistema e usa a linha como desempate',()=>{
  expect(hemoLatestOrder(sample({SEQUENCIA:'3'}),5)<hemoLatestOrder(sample({SEQUENCIA:'4'}),3)).toBe(true);
  expect(hemoLatestOrder(sample(),5)<hemoLatestOrder(sample(),6)).toBe(true);
  expect(()=>hemoLatestOrder(sample({ATUALIZACAO:'2026/10/07'}),1)).toThrow('DATA_ORDENACAO_INVALIDA');
  expect(()=>hemoLatestOrder(sample({ATUALIZACAO:'2026-02-30 11:22:33.000'}),1)).toThrow('DATA_ORDENACAO_INVALIDA');
  expect(()=>hemoLatestOrder(sample({ATUALIZACAO:'2026-10-07 25:22:33.000'}),1)).toThrow('DATA_ORDENACAO_INVALIDA');
 });
 it('atualiza somente campos informados e valor decimal, sem tocar datas, título ou chave',()=>{
  const changes=planHemoPendingUpdate(sample({PACIENTE:'Paciente Sintético',COMPETENCIA:'2026/10'}),current());
  expect(changes).toMatchObject({etapaConta:'Pendente',valorConta:'123.40',competencia:'2026/10'});
  expect(changes).not.toHaveProperty('paciente');expect(changes).not.toHaveProperty('matricula');
  expect(changes).not.toHaveProperty('titulo');expect(changes).not.toHaveProperty('data_entrada');
  expect(changes).not.toHaveProperty('dtEtapa');expect(changes).not.toHaveProperty('origemId');
 });
 it('recusa alteração de conta finalizada, inativa, outra unidade ou origem',()=>{
  expect(planHemoPendingUpdate(sample(),current({titulo:'Título já existente'}))).toBeNull();
  expect(planHemoPendingUpdate(sample(),current({ativoNaFonte:0}))).toBeNull();
  expect(planHemoPendingUpdate(sample(),current({estabelecimentoId:7}))).toBeNull();
  expect(planHemoPendingUpdate(sample(),current({origemSistema:'warleine'}))).toBeNull();
  expect(planHemoPendingUpdate(sample({TITULO:'Título novo'}),current())).toBeNull();
  expect(planHemoPendingUpdate(sample(),current({origemId:'101:203'}))).toBeNull();
 });
 it('preserva dados existentes quando arquivo omite valores ou traz competência inválida',()=>{
  const changes=planHemoPendingUpdate(sample({VALOR_CONTA:'',COMPETENCIA:'3026/01',PACIENTE:'',ETAPA_CONTA:''}),current({paciente:'Mantido',competencia:'2026/09',etapaConta:'Outra etapa'}));
  expect(changes?.valorConta).toBeUndefined();expect(changes?.competencia).toBeUndefined();
  expect(changes?.paciente).toBeUndefined();expect(changes?.etapaConta).toBeUndefined();
  expect(cleanHemo('NULL')).toBe('');
 });
 it('rejeita valores financeiros fora de DECIMAL(15,2), sem arredondamento',()=>{
  expect(planHemoPendingUpdate(sample({VALOR_CONTA:'-12,34'}),current())).toMatchObject({valorConta:'-12.34'});
  expect(()=>planHemoPendingUpdate(sample({VALOR_CONTA:'12,345'}),current())).toThrow('VALOR_FORA_DE_PRECISAO');
  expect(()=>planHemoPendingUpdate(sample({VALOR_CONTA:'99999999999999,00'}),current())).toThrow('VALOR_FORA_DE_PRECISAO');
 });
 it('mantém o comando restrito a UPDATE com guarda de unidade/chave e manifesto de prévia',()=>{
  const source=readFileSync(new URL('../scripts/atualizar-pendentes-hemolabor.mts',import.meta.url),'utf8');
  expect(source).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i);
  expect(source).toContain("origemId=? AND ativoNaFonte=1 AND (titulo IS NULL OR TRIM(titulo)='')");
  expect(source).toContain('estabelecimentoId=?');
  expect(source).toContain('manifesto.digest!==planDigest(plan)');
 });
});
