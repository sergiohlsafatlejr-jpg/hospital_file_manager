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

parser.parseStringPromise(content).then((result: any) => {
  // Navigate to first guia
  const mensagem = result.mensagemTISS;
  const prestador = mensagem?.prestadorParaOperadora;
  const lote = prestador?.loteGuias;
  const guiasTISS = lote?.guiasTISS;
  
  // Get guias
  const guiaResumo = guiasTISS?.guiaResumoInternacao;
  const guias = Array.isArray(guiaResumo) ? guiaResumo : [guiaResumo];
  
  console.log('Total guias:', guias.length);
  
  // Check first guia
  const guia = guias[0];
  const procExec = guia?.procedimentosExecutados?.procedimentoExecutado;
  const procs = Array.isArray(procExec) ? procExec : [procExec];
  
  console.log('Procedimentos na primeira guia:', procs.length);
  
  // Find one with identEquipe
  for (const proc of procs) {
    if (proc.identEquipe) {
      console.log('\n=== Procedimento com identEquipe ===');
      console.log('Codigo:', proc.procedimento?.codigoProcedimento);
      console.log('identEquipe keys:', Object.keys(proc.identEquipe));
      console.log('identEquipe:', JSON.stringify(proc.identEquipe, null, 2));
      break;
    }
  }
}).catch(console.error);
