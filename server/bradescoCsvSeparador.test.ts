import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import {parseBradescoCSV} from './parsers/parseBradescoCSV';
import {filtroNumericoOpcional} from '../client/src/lib/recebimentosExcelFilters';

const headers=['Data do Evento','Nome','Código do Procedimento','Descrição do Procedimento','Quantidade Solicitada','Quantidade Liberada','Guia operadora/Senha','Doc Original','Protocolo','Valor (R$)','Justificativa'];
const rows=[
 ['Extrato de Pagamento ','','','','','','','','','',''],
 ['','CNPJ/CPF - 00.000.000/0001-00','Código - 000001','','','','','','','',''],
 ['Liberado para crédito em 15/09/2026','---','---','---','---','---','2.123,45','','','',''],
 headers,
 ['01/08/2026','BENEFICIÁRIO FICTÍCIO A','','','','','000001','000007','000009','2.123,45',''],
 ['','','00000001','ITEM "A", FICTÍCIO; TESTE','2','2','','','','2.000,00',''],
 ['','','00000002','ITEM FICTÍCIO GLOSA','1','0','','','','123,45','1407 JUSTIFICATIVA FICTÍCIA'],
 ['Liberado para crédito em 20/09/2026','---','---','---','---','---','0,00','','','',''],
 headers,
 ['02/08/2026','BENEFICIÁRIO FICTÍCIO B','','','','','000002','000008','000010','0,00',''],
 ['','','00000003','ITEM FICTÍCIO ZERO','1','1','','','','0,00',''],
];
function csv(delimiter:','|';',quoted=true,newline='\r\n'){
 return rows.map(r=>r.map(v=>quoted?'"'+v.replace(/"/g,'""')+'"':(/["\n\r]/.test(v)||v.includes(delimiter)?'"'+v.replace(/"/g,'""')+'"':v)).join(delimiter)).join(newline);
}

describe('CSV Bradesco: delimitador e preservação de campos',()=>{
 for(const delimiter of [',',';'] as const){
  for(const quoted of [true,false]){
   it(`lê ${delimiter} com quoted=${quoted}, mantendo pagamentos e glosas`,()=>{
    const r=parseBradescoCSV(csv(delimiter,quoted),99,10,20);
    expect(r.success).toBe(true);
    expect([r.totalLotes,r.totalGuias,r.totalItens]).toEqual([2,2,3]);
    expect(r.items[0]).toMatchObject({arquivoId:99,convenioId:10,estabelecimentoId:20,numeroGuia:'000001',protocoloTiss:'000009',lotePrestador:'000007',item:'00000001',itemDesc:'ITEM "A", FICTÍCIO; TESTE',valorPagamento:'2000.00',valorInformado:'2000.00',quantidade:2,seq:1,situacaoItem:'PAGO'});
    expect(r.items[1]).toMatchObject({valorPagamento:'0.00',valorInformado:'123.45',valorGlosa:'123.45',codigoGlosa:'1407',situacaoItem:'GLOSADO',seq:2});
    expect(r.items[2]).toMatchObject({numeroGuia:'000002',protocoloTiss:'000010',lotePrestador:'000008',seq:1,valorPagamento:'0.00',situacaoItem:'PAGO'});
    expect(r.items[0].dataExecucao).toBeInstanceOf(Date);
    expect((r.items[0].dataExecucao as Date).getDate()).toBe(1);
    expect((r.items[0].dataPagto as Date).getDate()).toBe(15);
    expect((r.items[2].dataPagto as Date).getDate()).toBe(20);
   });
  }
 }
 it('mantém o mesmo contrato em vírgula e ponto e vírgula',()=>{
  expect(parseBradescoCSV(csv(';'),99,10,20)).toEqual(parseBradescoCSV(csv(','),99,10,20));
 });
 it('aceita UTF-8 BOM e LF com cabeçalhos repetidos',()=>{
  const r=parseBradescoCSV('\ufeff'+csv(';',true,'\n'),99,10,20);
  expect(r.success).toBe(true);expect(r.totalItens).toBe(3);
  expect(r.items[0].nomeBeneficiario).toBe('BENEFICIÁRIO FICTÍCIO A');
 });
 it('não declara sucesso para extrato sem itens',()=>{
  const r=parseBradescoCSV(rows.slice(0,4).map(r=>r.join(';')).join('\n'),99,10,20);
  expect(r.success).toBe(false);expect(r.items).toHaveLength(0);
  expect(r.error).toContain('sem itens reconhecidos');
 });
 it('preserva referência e unidade explicitamente recebidas no upload',()=>{
  const r=parseBradescoCSV(csv(';'),99,10,20,new Date('2026-07-01T12:00:00Z'));
  expect(r.items.every(i=>i.dataReferencia==='2026-07-01'&&i.estabelecimentoId===20&&i.convenioId===10)).toBe(true);
 });
 it('interrompe o upload inválido antes de inserir ou marcar processado',()=>{
  const s=fs.readFileSync(new URL('./routers.ts',import.meta.url),'utf8');
  const block=s.slice(s.indexOf('const result = parseBradescoCSV(csvContent'),s.indexOf('// Aplicar aceite automático',s.indexOf('const result = parseBradescoCSV(csvContent')));
  expect(block).toMatch(/if \(!result\.success\)[\s\S]*finalizarCsvBradescoInvalido\([\s\S]*updateArquivoStatus\(arquivoId, 'erro'\)[\s\S]*return;/);
  expect(block.indexOf("updateArquivoStatus(arquivoId, 'erro')")).toBeLessThan(block.indexOf('insertRecebimentosExcelBatch'));
 });
});

describe('Recebimentos Excel: filtros opcionais',()=>{
 for(const value of ['','all','inválido','NaN','0','-1','1.5']){
  it(`não envia número inválido para ${JSON.stringify(value)}`,()=>expect(filtroNumericoOpcional(value)).toBeUndefined());
 }
 it('preserva convênio, mês e ano selecionados',()=>{
  expect(['10','9','2026'].map(filtroNumericoOpcional)).toEqual([10,9,2026]);
 });
 it('aplica a mesma normalização na lista e no resumo, sem alterar limites de upload',()=>{
  const s=fs.readFileSync(new URL('../client/src/pages/RecebimentosExcel.tsx',import.meta.url),'utf8');
  expect(s.match(/convenioId: filtroNumericoOpcional\(filtroConvenio\)/g)).toHaveLength(2);
  expect(s).toContain('const mesReferencia = filtroNumericoOpcional(mesRef)');
  expect(s).toContain('const anoReferencia = filtroNumericoOpcional(anoRef)');
  expect(s).toContain('const MAX_FILES = 30');
  expect(s).toContain('onDrop={handleDrop}');
 });
});
