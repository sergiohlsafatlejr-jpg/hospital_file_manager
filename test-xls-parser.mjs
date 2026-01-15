import { parseExcel } from './server/parsers.ts';
import * as fs from 'fs';

const content = fs.readFileSync('/home/ubuntu/upload/analise_contas_medicas20260114110603.xls');
const result = await parseExcel(content);
console.log('Success:', result.success);
console.log('Total procedimentos:', result.procedimentos.length);
console.log('Primeiros 3:');
result.procedimentos.slice(0, 3).forEach((p, i) => {
  console.log(`${i + 1}:`, {
    codigo: p.codigo,
    descricao: p.descricao,
    paciente: p.pacienteNome,
    guia: p.guiaNumero,
    valorTotal: p.valorTotal,
    data: p.dataExecucao,
    glosa: p.motivoGlosa,
    valorGlosado: p.valorGlosado
  });
});
