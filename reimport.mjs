import * as fs from 'fs';
import { parseXML, toProcedimentoInsert } from './server/parsers.ts';
import * as db from './server/db.ts';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath);
const filename = '00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';

async function main() {
  // Buscar convênio Unimed
  const convenios = await db.getConvenios();
  const unimed = convenios.find(c => c.nome.toLowerCase().includes('unimed'));
  
  if (!unimed) {
    console.log('Convênio Unimed não encontrado');
    return;
  }
  
  console.log('Convênio:', unimed.nome, 'ID:', unimed.id);
  
  // Criar arquivo
  const arquivo = await db.createArquivo({
    nome: filename,
    convenioId: unimed.id,
    direcao: 'enviado',
    tipoArquivo: 'xml',
    status: 'pendente',
    url: 'local://' + xmlPath,
    tamanho: content.length,
  });
  
  console.log('Arquivo criado, ID:', arquivo.id);
  
  // Parsear
  const result = await parseXML(content);
  console.log('Procedimentos parseados:', result.procedimentos.length);
  console.log('Com médico:', result.procedimentos.filter(p => p.nomeMedico).length);
  
  // Inserir procedimentos
  const procedimentosToInsert = result.procedimentos.map(p => toProcedimentoInsert(p, arquivo.id));
  await db.createProcedimentos(procedimentosToInsert);
  
  // Atualizar status
  await db.updateArquivoStatus(arquivo.id, 'processado');
  
  console.log('Importação concluída!');
  
  // Verificar
  const procs = await db.getProcedimentosByArquivoId(arquivo.id);
  const comMedico = procs.filter(p => p.nomeMedico);
  console.log('Procedimentos salvos:', procs.length);
  console.log('Com médico no banco:', comMedico.length);
  if (comMedico.length > 0) {
    console.log('Exemplo:', comMedico[0].nomeMedico, comMedico[0].crmMedico);
  }
}

main().catch(console.error);
