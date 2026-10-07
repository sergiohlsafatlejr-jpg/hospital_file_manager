import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HEMO_CSV_HEADERS, planHemoPendingUpdate, type HemoCsvRecord } from './hemolaborPendentesCsv';
import { civilHemoDate, HEMO_NOVAS_COLUNAS, mapHemoNewPending } from './hemolaborNovasCsv';

function row(overrides:Partial<HemoCsvRecord>={}):HemoCsvRecord {
 const out=Object.fromEntries(HEMO_CSV_HEADERS.map(k=>[k,''])) as HemoCsvRecord;
 return { ...out, ATENDIMENTO:'101',CONTA:'220',PACIENTE:'Pessoa Sintética',CONVENIO:'Plano Sintético',ENTRADA:'2026-10-07 18:12:34.000',CATEGORIA:'INTERNACAO',VALOR_CONTA:'123,45',...overrides};
}
describe('publicação INSERT-only Hemolabor',()=>{
 it('mapeia nova chave estável e valor decimal, mantendo pendência e unidade',()=>{
  const mapped=mapHemoNewPending(row());
  expect(mapped).toMatchObject({estabelecimentoId:6,origemSistema:'tasy',origemId:'101:220',titulo:null,ativoNaFonte:1,valorConta:'123.45',data_entrada:'2026-10-07 18:12:34',ultimoLoteId:null});
  expect(HEMO_NOVAS_COLUNAS).toHaveLength(Object.keys(mapped).length);
  expect(HEMO_NOVAS_COLUNAS.every(c=>c in mapped)).toBe(true);
 });
 it('não transforma título ou particular em pendência na tela',()=>{
  expect(()=>mapHemoNewPending(row({TITULO:'sim'}))).toThrow('NAO_E_PENDENTE');
  expect(()=>mapHemoNewPending(row({CONVENIO:'PARTICULAR'}))).toThrow('PARTICULAR_FORA_DA_TELA');
 });
 it('não fabrica competência e aceita dinheiro ausente em campo anulável',()=>{
  const mapped=mapHemoNewPending(row({COMPETENCIA:'',VALOR_CONTA:''}));
  expect(mapped.competencia).toBeNull();expect(mapped.referencia).toBeNull();expect(mapped.valorConta).toBeNull();
  expect(mapHemoNewPending(row({COMPETENCIA:'2026/09'})).competencia).toBe('2026/09');
 });
 it('preserva precisão monetária e recusa número ou calendário inválido',()=>{
  expect(mapHemoNewPending(row({VALOR_CONTA:'9999999999999,99'})).valorConta).toBe('9999999999999.99');
  expect(()=>mapHemoNewPending(row({VALOR_CONTA:'123,456'}))).toThrow('VALOR_FORA_DE_PRECISAO');
  expect(()=>mapHemoNewPending(row({ENTRADA:'2026-02-29 12:30:00.000'}))).toThrow('DATA_FORA_DO_CONTRATO');
  expect(()=>civilHemoDate('2026-10-07 18:12:34.123')).toThrow('DATA_FORA_DO_CONTRATO');
 });
 it('não atualiza contas existentes nem substitui snapshot',()=>{
  const text=readFileSync(new URL('../scripts/publicar-novas-pendentes-hemolabor.mts',import.meta.url),'utf8');
  expect(text).toMatch(/INSERT INTO atendimentos_unificados/);
  expect(text).not.toMatch(/ON DUPLICATE KEY UPDATE|UPDATE atendimentos_unificados|DELETE FROM atendimentos_unificados|TRUNCATE\s+atendimentos_unificados/i);
  expect(text).toMatch(/FOR UPDATE/);
  expect(text).toMatch(/MANIFESTO_DIVERGENTE/);
  expect(text).toMatch(/ocultasPeloFiltroAtual/);
  expect(text).toMatch(/row\.PROCEDIMENTO\.toUpperCase\(\)\.includes\('A_FATURAR'\)/);
  expect(text).toMatch(/COMMIT_INDETERMINADO_NAO_REEXECUTAR/);
  expect(text).toMatch(/lockedKeys/);
  expect(planHemoPendingUpdate(row(),{estabelecimentoId:7,origemSistema:'tasy',origemId:'101:220',ativoNaFonte:1,titulo:null})).toBeNull();
 });
});
