import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath, 'utf-8');

// Remove namespace prefixes
const cleanXml = content.replace(/<(\/?)([\w]+:)/g, '<$1');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  trimValues: true,
});

const result = parser.parse(cleanXml);

// Navigate to guias
const mensagem = result.mensagemTISS;
const prestador = mensagem?.prestadorParaOperadora;
const lote = prestador?.loteGuias;
const guias = lote?.guiasTISS;

if (guias) {
  // Get first guia
  let guiaList = guias.guiaResumoInternacao || guias.guiaSPSADT;
  if (!Array.isArray(guiaList)) guiaList = [guiaList];
  
  const guia = guiaList[0];
  console.log('=== Primeira Guia ===');
  console.log('Tipo:', guias.guiaResumoInternacao ? 'guiaResumoInternacao' : 'guiaSPSADT');
  
  // Check procedimentosExecutados
  const procExec = guia?.procedimentosExecutados?.procedimentoExecutado;
  if (procExec) {
    const procs = Array.isArray(procExec) ? procExec : [procExec];
    console.log('\nProcedimentos executados:', procs.length);
    
    // Check first procedimento
    const firstProc = procs[0];
    console.log('\n=== Primeiro Procedimento ===');
    console.log('Keys:', Object.keys(firstProc));
    
    // Check identEquipe
    if (firstProc.identEquipe) {
      console.log('\nidentEquipe encontrado:');
      console.log(JSON.stringify(firstProc.identEquipe, null, 2));
    }
    
    // Check equipeSadt
    if (firstProc.equipeSadt) {
      console.log('\nequipeSadt encontrado:');
      console.log(JSON.stringify(firstProc.equipeSadt, null, 2));
    }
  }
}
