import * as fs from 'fs';
import * as xml2js from 'xml2js';

const xmlPath = '/home/ubuntu/upload/00000000000130086213_1ec17e35f2dea04f79f8dec13b5cfadf.xml';
const content = fs.readFileSync(xmlPath, 'utf-8');

const parser = new xml2js.Parser({ 
  explicitArray: false, 
  ignoreAttrs: false,
  tagNameProcessors: [xml2js.processors.stripPrefix],
  attrNameProcessors: [xml2js.processors.stripPrefix]
});

parser.parseStringPromise(content).then(result => {
  // Navigate to first guia
  const loteGuias = result?.mensagemTISS?.prestadorParaOperadora?.loteGuias;
  const guiasTISS = loteGuias?.guiasTISS;
  
  // Check guiaResumoInternacao
  const guia = guiasTISS?.guiaResumoInternacao;
  console.log('=== Estrutura da guiaResumoInternacao ===');
  
  // Check procedimentosExecutados
  const procExec = guia?.procedimentosExecutados?.procedimentoExecutado;
  if (Array.isArray(procExec)) {
    console.log('Número de procedimentos:', procExec.length);
    const firstProc = procExec[0];
    console.log('\n=== Primeiro procedimento ===');
    console.log('identEquipe:', JSON.stringify(firstProc?.identEquipe, null, 2));
  } else if (procExec) {
    console.log('identEquipe:', JSON.stringify(procExec?.identEquipe, null, 2));
  }
}).catch(err => console.error(err));
