import * as fs from 'fs';
import { parseXML } from './server/parsers.ts';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath);

parseXML(content).then(result => {
  console.log('Total procedimentos:', result.procedimentos.length);
  
  const comMedico = result.procedimentos.filter(p => p.nomeMedico);
  console.log('Com médico:', comMedico.length);
  
  for (const proc of comMedico) {
    console.log('\n--- Procedimento com médico ---');
    console.log('Código:', proc.codigo);
    console.log('Descrição:', proc.descricao);
    console.log('Nome Médico:', proc.nomeMedico);
    console.log('CRM:', proc.crmMedico);
  }
  
  // Mostrar alguns sem médico para comparar
  console.log('\n=== Alguns sem médico ===');
  const semMedico = result.procedimentos.filter(p => !p.nomeMedico).slice(0, 3);
  for (const proc of semMedico) {
    console.log('Código:', proc.codigo, '- Descrição:', proc.descricao?.substring(0, 30));
  }
}).catch(console.error);
