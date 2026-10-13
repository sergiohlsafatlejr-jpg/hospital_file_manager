import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('./db',()=>({getRawPool:vi.fn()}));
import {getRawPool} from './db';
import {guiasHupPiloto,itensGuiaHupPiloto} from './hupConciliacaoPilotoService';
const input={estabelecimentoId:1260036,competencia:'2026/08',convenioId:1,pageSize:1};
const row={conta:'C1',guiaPrestador:'G1',guiaOperadora:'O1',codigoTuss:'123',dataItem:'2026-08-01',tipoItem:'MAT',setor:'A',modalidade:'S',quantidade:'1',valorFaturado:'10',nomeConvenio:'UNIMED',codigoConvenio:'001',descricaoItem:'Nome fictício'};
function setup(nome='Unimed',conflito=false){
 const query=vi.fn(async (o:{sql:string}|string)=>{const sql=typeof o==='string'?o:o.sql;
  if(sql.startsWith('SET TRANSACTION'))return [];
  if(sql.includes('SELECT id,nome FROM convenios'))return [[{id:1,nome}]];
  if(sql.includes('FROM convenio_mapeamento'))return [[{convenioId:1,nome:'UNIMED',codigo:'001',nomeCanonico:nome},...(conflito?[{convenioId:2,nome:'UNIMED',codigo:'002',nomeCanonico:'Outro'}]:[])]];
  if(sql.includes('SELECT i.numeroConta'))return [[row,{...row,setor:'B',quantidade:'2',valorFaturado:'20'}]];
  if(sql.includes('FROM demonstrativo'))return [[{id:'1',arquivoId:'1',guia:'G1',codigoTuss:'123',dataItem:'2026-08-01',dataPagamento:'2026-09-01',quantidade:'3',valorPago:'25',valorGlosa:'5'}]];
  throw Error('CONSULTA_NAO_PREVISTA');
 });
 const c={query,beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn()};vi.mocked(getRawPool).mockResolvedValue({getConnection:vi.fn(async()=>c)} as any);return c;
}
beforeEach(()=>vi.clearAllMocks());
it('Unimed canônica com de-para manual une setores na mesma guia e detalhes',async()=>{const c=setup();const a=await guiasHupPiloto(input);expect(a.resumo).toMatchObject({totalItens:2,totalGrupos:1,gruposCandidatos:1,gruposAmbiguos:0});expect(a.items[0].itens[0]).toMatchObject({consolidadoPorSetor:true,valorFaturado:'30.00',valorPagoCandidato:'25.00'});const b=await itensGuiaHupPiloto({...input,guiaChave:'guia-1',conta:'C1',guiaPrestador:'G1',guiaOperadora:'O1'});expect(b.total).toBe(1);expect(b.items[0].composicaoSetores).toHaveLength(2);expect(c.rollback).toHaveBeenCalledTimes(2);});
it('não ativa a política para outra operadora',async()=>{setup('Ipasgo');const r=await guiasHupPiloto(input);expect(r.resumo).toMatchObject({totalGrupos:2,gruposAmbiguos:2,gruposCandidatos:0});});
it('conflito de de-para não ganha match pela consolidação',async()=>{setup('Unimed',true);const r=await guiasHupPiloto(input);expect(r.status).toBe('sem_faturado');expect(r.items).toEqual([]);});
it('consulta quantidade sem recorrer a staging pagamento Hop ou comandos legados',async()=>{const c=setup();await guiasHupPiloto(input);const queries=c.query.mock.calls.map(([o])=>typeof o==='string'?o:o.sql).join(' ');expect(queries).toContain('CAST(d.quantidade AS CHAR) quantidade');expect(queries).toContain("a.status='processado'");expect(queries).toContain("m.metodo_match='manual'");expect(queries).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE|REPLACE|DROP)\b|stagion_|valorTotalRecebido|recebimentos_excel/i);});
