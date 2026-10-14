import fs from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {finalizarCsvBradescoInvalido} from './bradescoCsvFinalizacao';

afterEach(()=>vi.restoreAllMocks());
const failures=[{status:false,progress:false},{status:true,progress:false},{status:false,progress:true},{status:true,progress:true}];
describe('Bradesco inválido: finalização terminal mesmo com indisponibilidade de estado',()=>{
 for(const fail of failures){
  it(`helper não propaga falha: status=${fail.status}, progresso=${fail.progress}`,async()=>{
   vi.spyOn(console,'warn').mockImplementation(()=>{});
   const marcarErro=vi.fn(async()=>{if(fail.status)throw new Error('FALHA SINTÉTICA');});
   const zerarProgresso=vi.fn(async()=>{if(fail.progress)throw new Error('FALHA SINTÉTICA');});
   await expect(finalizarCsvBradescoInvalido({marcarErro,zerarProgresso})).resolves.toEqual({statusAtualizado:!fail.status,progressoAtualizado:!fail.progress});
   expect(marcarErro).toHaveBeenCalledTimes(1);expect(zerarProgresso).toHaveBeenCalledTimes(1);
  });
  it(`guard extraído do upload não insere nem marca processado: status=${fail.status}, progresso=${fail.progress}`,async()=>{
   vi.spyOn(console,'warn').mockImplementation(()=>{});
   const s=fs.readFileSync(new URL('./routers.ts',import.meta.url),'utf8');
   const parseStart=s.indexOf('const result = parseBradescoCSV(csvContent');
   const start=s.indexOf('if (!result.success)',parseStart);
   const end=s.indexOf('records = result.items;',start);
   expect(parseStart).toBeGreaterThan(0);expect(start).toBeGreaterThan(parseStart);expect(end).toBeGreaterThan(start);
   const guard=s.slice(start,end);
   const db={
    updateArquivoStatus:vi.fn(async(_id:number,status:string)=>{if(status==='erro'&&fail.status)throw new Error('FALHA SINTÉTICA');}),
    updateArquivoProgresso:vi.fn(async()=>{if(fail.progress)throw new Error('FALHA SINTÉTICA');}),
    insertRecebimentosExcelBatch:vi.fn(async()=>{}),
   };
   // Executa o próprio guard da rota com mocks, inclusive o catch que suprime
   // falhas e a finalização processado; não importa a rota nem usa credenciais.
   const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
   const run=new AsyncFunction('result','arquivoId','db','finalizarCsvBradescoInvalido','console',
    `try { ${guard} } catch {}\n await db.insertRecebimentosExcelBatch([]); await db.updateArquivoStatus(arquivoId,'processado');`);
   await run({success:false},42,db,finalizarCsvBradescoInvalido,console);
   expect(db.updateArquivoStatus.mock.calls).toEqual([[42,'erro']]);
   expect(db.updateArquivoProgresso).toHaveBeenCalledWith(42,0,0,0);
   expect(db.insertRecebimentosExcelBatch).not.toHaveBeenCalled();
  });
 }
});
