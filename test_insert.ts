import * as fs from 'fs';
import { parseXML, toProcedimentoInsert } from './server/parsers.ts';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath);

parseXML(content).then(result => {
  const comMedico = result.procedimentos.filter(p => p.nomeMedico);
  
  console.log('Procedimentos com médico:', comMedico.length);
  
  for (const proc of comMedico) {
    console.log('\n=== ParsedProcedimento ===');
    console.log('nomeMedico:', proc.nomeMedico);
    console.log('crmMedico:', proc.crmMedico);
    
    const insert = toProcedimentoInsert(proc, 1);
    console.log('\n=== InsertProcedimento ===');
    console.log('nomeMedico:', insert.nomeMedico);
    console.log('crmMedico:', insert.crmMedico);
  }
}).catch(console.error);
