import * as fs from 'fs';
import { parseXML } from './server/parsers.ts';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath);

parseXML(content).then(result => {
  console.log('Total procedimentos:', result.procedimentos.length);
  
  // Mostrar procedimentos com médico
  const comMedico = result.procedimentos.filter(p => p.nomeMedico);
  console.log('Com médico:', comMedico.length);
  
  // Mostrar primeiros 5
  for (const proc of result.procedimentos.slice(0, 5)) {
    console.log('\n---');
    console.log('Código:', proc.codigo);
    console.log('Descrição:', proc.descricao);
    console.log('Médico:', proc.nomeMedico || 'N/A');
    console.log('CRM:', proc.crmMedico || 'N/A');
  }
}).catch(err => console.error(err));
