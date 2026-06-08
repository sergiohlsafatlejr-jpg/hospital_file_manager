/**
 * Parser otimizado para demonstrativos Unimed (Excel/XLSX)
 * 
 * Usa yauzl (unzip) + sax (XML streaming) com PIPE DIRETO.
 * O sheet1.xml (51.7 MB descompactado) NUNCA é acumulado na memória.
 * 
 * Consumo de memória: ~6 MB heap / ~66 MB RSS (testado com 33k linhas)
 * Funciona confortavelmente no Cloud Run com 512 MiB.
 * 
 * Estratégia:
 * 1. Abrir o XLSX (ZIP) com yauzl.fromBuffer
 * 2. Extrair xl/sharedStrings.xml em buffer (geralmente pequeno ~2-5 MB)
 * 3. Para xl/worksheets/sheet1.xml: stream.pipe(saxParser) DIRETO
 * 4. SAX processa tag por tag, chama callback a cada chunk de N registros
 */
import * as yauzl from 'yauzl';
import * as sax from 'sax';
import type { Readable } from 'stream';
import type { InsertRecebimentoExcel } from '../../drizzle/schema';

/**
 * Colunas do demonstrativo Unimed (na ordem em que aparecem no Excel):
 * 0: Demonstrativo
 * 1: Data Pagto Processado
 * 2: Protocolo TISS
 * 3: Lote Prestador
 * 4: Código Prestador Pagamento
 * 5: Nome Prestador Pagamento
 * 6: Código Prestador Original
 * 7: Nome Prestador Original
 * 8: Número Carteira (beneficiário)
 * 9: Nome Beneficiário
 * 10: Código Plano
 * 11: Descrição Plano
 * 12: Número Guia Prestador
 * 13: Número Guia Operadora
 * 14: Senha
 * 15: Data Inicial Faturamento
 * 16: Data Final Faturamento
 * 17: Código Procedimento
 * 18: Descrição Procedimento
 * 19: Grau Participação
 * 20: Valor Informado
 * 21: Valor Processado
 * 22: Valor Glosa
 * 23: Valor Liberado
 * 24: Código Glosa
 * 25: Descrição Glosa
 * 26: Recurso Glosa
 * 27: Valor Recurso
 */

// Converter serial number do Excel para Date
function excelSerialToDate(serial: number): Date | undefined {
  if (!serial || serial < 1) return undefined;
  const epoch = new Date(1899, 11, 30);
  epoch.setDate(epoch.getDate() + Math.floor(serial));
  return epoch;
}

// Extrair shared strings do XLSX (acumula em buffer - geralmente pequeno)
// e retornar um stream para o sheet1.xml (NÃO acumula)
interface XlsxStreams {
  sharedStrings: Buffer | null;
  sheet1Stream: Readable;
  zipfile: any;
}

function openXlsxStreaming(buffer: Buffer): Promise<XlsxStreams> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error('Failed to open ZIP'));
      
      let sharedStrings: Buffer | null = null;
      let foundSheet1 = false;
      
      zipfile.readEntry();
      zipfile.on('entry', (entry: any) => {
        if (entry.fileName === 'xl/sharedStrings.xml') {
          // SharedStrings é geralmente pequeno (2-5 MB), acumular em buffer
          zipfile.openReadStream(entry, (err: Error | null, stream: Readable) => {
            if (err) return reject(err);
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
              sharedStrings = Buffer.concat(chunks);
              zipfile.readEntry();
            });
            stream.on('error', reject);
          });
        } else if (entry.fileName === 'xl/worksheets/sheet1.xml') {
          // Sheet1 é GRANDE (51.7 MB) - retornar como stream, NÃO acumular
          foundSheet1 = true;
          zipfile.openReadStream(entry, (err: Error | null, stream: Readable) => {
            if (err) return reject(err);
            resolve({ sharedStrings, sheet1Stream: stream, zipfile });
          });
        } else {
          zipfile.readEntry();
        }
      });
      
      zipfile.on('end', () => {
        if (!foundSheet1) {
          reject(new Error('xl/worksheets/sheet1.xml not found in XLSX'));
        }
      });
      zipfile.on('error', reject);
    });
  });
}

// Parsear shared strings (se existir)
function parseSharedStrings(xmlBuffer: Buffer): Promise<string[]> {
  return new Promise((resolve) => {
    const strings: string[] = [];
    const parser = sax.createStream(true, { trim: false });
    let inT = false;
    let current = '';
    
    parser.on('opentag', (node: any) => {
      if (node.name === 't') { inT = true; current = ''; }
    });
    parser.on('text', (text: string) => {
      if (inT) current += text;
    });
    parser.on('closetag', (name: string) => {
      if (name === 't') { strings.push(current); inT = false; }
    });
    parser.on('end', () => resolve(strings));
    parser.on('error', () => resolve(strings));
    parser.end(xmlBuffer);
  });
}

// Parsear worksheet com SAX streaming PIPED diretamente do ZIP stream
export async function parseUnimedExcelChunked(
  buffer: Buffer,
  arquivoId: number,
  convenioId: number,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date,
  estabelecimentoId?: number,
  chunkSize: number = 500,
  onChunk?: (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => Promise<void>
): Promise<{ totalRecords: number }> {
  
  // Step 1: Open XLSX and get streaming access
  const { sharedStrings: ssBuffer, sheet1Stream } = await openXlsxStreaming(buffer);
  
  // Step 2: Parse shared strings (if any)
  let sharedStrings: string[] = [];
  if (ssBuffer && ssBuffer.length > 0) {
    sharedStrings = await parseSharedStrings(ssBuffer);
  }
  
  // Step 3: PIPE sheet1 stream directly to SAX parser (no buffer accumulation!)
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false });
    
    let inRow = false;
    let inCell = false;
    let inValue = false;
    let cellType = '';
    let cellValue = '';
    let currentRow: string[] = [];
    let rowCount = 0;
    
    let chunk: InsertRecebimentoExcel[] = [];
    let chunkIdx = 0;
    let totalRecords = 0;
    let estimatedTotalRows = 33000; // Estimativa inicial
    
    // Queue para processar chunks sequencialmente
    let processing = Promise.resolve();
    let paused = false;
    
    parser.on('opentag', (node: any) => {
      if (node.name === 'row') {
        inRow = true;
        currentRow = [];
      } else if (node.name === 'c' && inRow) {
        inCell = true;
        cellType = node.attributes.t || '';
        cellValue = '';
      } else if ((node.name === 'v' || node.name === 't') && inCell) {
        inValue = true;
        cellValue = '';
      }
    });
    
    parser.on('text', (text: string) => {
      if (inValue) cellValue += text;
    });
    
    parser.on('closetag', (name: string) => {
      if (name === 'v' || (name === 't' && inCell)) {
        inValue = false;
      } else if (name === 'c') {
        let value = cellValue;
        if (cellType === 's' && sharedStrings.length > 0) {
          const idx = parseInt(cellValue);
          value = sharedStrings[idx] || '';
        }
        currentRow.push(value);
        inCell = false;
      } else if (name === 'row') {
        rowCount++;
        
        if (rowCount === 1) {
          // Header row - skip
        } else {
          // Data row - converter para registro
          const record = convertRowToRecord(currentRow, arquivoId, convenioId, dataReferenciaUpload, dataPagamentoUpload, estabelecimentoId);
          if (record) {
            chunk.push(record);
            totalRecords++;
            
            if (chunk.length >= chunkSize) {
              const currentChunk = [...chunk];
              const currentChunkIdx = chunkIdx;
              chunk = [];
              chunkIdx++;
              
              if (onChunk) {
                // Pause stream to apply backpressure while inserting
                if (!paused) {
                  sheet1Stream.pause();
                  paused = true;
                }
                processing = processing.then(async () => {
                  await onChunk(currentChunk, currentChunkIdx, estimatedTotalRows);
                  // Resume stream after insert completes
                  if (paused) {
                    sheet1Stream.resume();
                    paused = false;
                  }
                });
              }
            }
          }
        }
        inRow = false;
      }
    });
    
    parser.on('end', () => {
      // Processar chunk final
      estimatedTotalRows = rowCount - 1; // Excluir header
      
      if (chunk.length > 0 && onChunk) {
        const finalChunk = [...chunk];
        const finalIdx = chunkIdx;
        processing = processing.then(() => 
          onChunk(finalChunk, finalIdx, estimatedTotalRows)
        );
      }
      
      // Aguardar todos os chunks serem processados
      processing.then(() => {
        resolve({ totalRecords });
      }).catch(reject);
    });
    
    parser.on('error', (err: Error) => {
      console.error('[UnimedParser SAX] Error:', err.message);
      // Tentar resolver com o que temos
      processing.then(() => {
        resolve({ totalRecords });
      }).catch(reject);
    });
    
    // PIPE DIRETO: stream do ZIP → SAX parser (sem Buffer intermediário!)
    sheet1Stream.pipe(parser);
  });
}

/**
 * Converte uma linha do Excel (array de strings) para InsertRecebimentoExcel
 * usando o mapeamento de colunas do demonstrativo Unimed.
 * 
 * Mapeamento para o schema recebimentos_excel:
 * - Col 0 (Demonstrativo) → processado (usado como referência do demonstrativo)
 * - Col 1 (Data Pagto Processado) → dataPagto
 * - Col 2 (Protocolo TISS) → protocoloTiss
 * - Col 3 (Lote Prestador) → lotePrestador
 * - Col 4 (Código Prestador Pagamento) → codigoPrestadorPagamento
 * - Col 5 (Nome Prestador Pagamento) → nomePrestadorPagamento
 * - Col 6 (Código Prestador Original) → codigoPrestador
 * - Col 7 (Nome Prestador Original) → nomePrestador
 * - Col 8 (Número Carteira) → beneficiario
 * - Col 9 (Nome Beneficiário) → nomeBeneficiario
 * - Col 10 (Código Plano) → tipoItem (usado para armazenar código do plano)
 * - Col 11 (Descrição Plano) → tipoLancamento (usado para armazenar descrição do plano)
 * - Col 12 (Número Guia Prestador) → numeroGuia
 * - Col 13 (Número Guia Operadora) → codigoSolicitante (armazena guia operadora)
 * - Col 14 (Senha) → horaExecucao (armazena senha como referência)
 * - Col 15 (Data Inicial Faturamento) → dataInicioFaturamentoInternacao
 * - Col 16 (Data Final Faturamento) → dataFimFaturamentoInternacao
 * - Col 17 (Código Procedimento) → item
 * - Col 18 (Descrição Procedimento) → itemDesc
 * - Col 19 (Grau Participação) → acomodacaoInternacao (armazena grau participação)
 * - Col 20 (Valor Informado) → valorInformado
 * - Col 21 (Valor Processado) → processado (decimal)
 * - Col 22 (Valor Glosa) → valorGlosa
 * - Col 23 (Valor Liberado) → valorPagamento
 * - Col 24 (Código Glosa) → codigoGlosa
 * - Col 25 (Descrição Glosa) → erroTiss
 * - Col 26 (Recurso Glosa) → nomeSolicitante (armazena recurso)
 * - Col 27 (Valor Recurso) → (não mapeado se 0)
 */
function convertRowToRecord(
  row: string[],
  arquivoId: number,
  convenioId: number,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date,
  estabelecimentoId?: number
): InsertRecebimentoExcel | null {
  if (row.length < 20) return null;
  
  const getValue = (idx: number): string => (row[idx] || '').trim();
  const getNumber = (idx: number): number => {
    const v = getValue(idx);
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  
  // Converter datas (serial numbers do Excel)
  const dataPagtoSerial = getNumber(1);
  const dataInicialSerial = getNumber(15);
  const dataFinalSerial = getNumber(16);
  
  const dataPagtoDate = dataPagamentoUpload || excelSerialToDate(dataPagtoSerial);
  const dataInicialDate = excelSerialToDate(dataInicialSerial);
  const dataFinalDate = excelSerialToDate(dataFinalSerial);
  
  // Calcular data de referência para o campo dataReferencia
  const dataRef = dataReferenciaUpload || dataPagtoDate;
  
  const valorInformado = getNumber(20);
  const valorProcessado = getNumber(21);
  const valorGlosa = getNumber(22);
  const valorLiberado = getNumber(23);
  
  // Determinar situação do item
  let situacaoItem: string | undefined;
  if (valorGlosa > 0 && valorLiberado === 0) {
    situacaoItem = 'GLOSADO';
  } else if (valorGlosa > 0 && valorLiberado > 0) {
    situacaoItem = 'GLOSADO'; // Glosa parcial
  } else {
    situacaoItem = 'PAGO';
  }
  
  const record: InsertRecebimentoExcel = {
    arquivoId,
    convenioId,
    estabelecimentoId: estabelecimentoId || undefined,
    
    // Dados do demonstrativo
    processado: valorProcessado ? String(valorProcessado.toFixed(2)) : getValue(0).replace('.0', ''), // Valor processado ou nº demonstrativo
    dataPagto: dataPagtoDate || undefined,
    protocoloTiss: getValue(2).replace(/\.0$/, '') || undefined,
    lotePrestador: getValue(3) || undefined,
    
    // Prestador
    codigoPrestadorPagamento: getValue(4).replace('.0', '') || undefined,
    nomePrestadorPagamento: getValue(5) || undefined,
    codigoPrestador: getValue(6).replace('.0', '') || undefined,
    nomePrestador: getValue(7) || undefined,
    
    // Beneficiário
    beneficiario: getValue(8) || undefined,
    nomeBeneficiario: getValue(9) || undefined,
    
    // Guia
    numeroGuia: getValue(12) || undefined,
    codigoSolicitante: getValue(13) || undefined, // Guia operadora
    horaExecucao: getValue(14) || undefined, // Senha
    
    // Procedimento
    item: getValue(17) || undefined,
    itemDesc: getValue(18) || undefined,
    
    // Plano e tipo
    tipoItem: getValue(10) || undefined, // Código plano
    tipoLancamento: getValue(11) || undefined, // Descrição plano
    acomodacaoInternacao: getValue(19) || undefined, // Grau participação
    
    // Datas de faturamento
    dataInicioFaturamentoInternacao: dataInicialDate || undefined,
    dataFimFaturamentoInternacao: dataFinalDate || undefined,
    
    // Valores
    valorInformado: valorInformado ? String(valorInformado.toFixed(2)) : undefined,
    valorPagamento: valorLiberado ? String(valorLiberado.toFixed(2)) : undefined,
    valorGlosa: valorGlosa ? String(valorGlosa.toFixed(2)) : undefined,
    
    // Glosa
    codigoGlosa: getValue(24) || undefined,
    erroTiss: getValue(25) || undefined,
    situacaoItem,
    
    // Recurso
    nomeSolicitante: getValue(26) || undefined,
    
    // Data de referência
    dataReferencia: dataRef || undefined,
    dataPagamentoUpload: dataPagamentoUpload || undefined,
  };
  
  return record;
}

// Detecção rápida de formato Unimed (usa yauzl + sax, apenas 1 linha)
export async function detectUnimedFormat(buffer: Buffer): Promise<boolean> {
  try {
    return new Promise((resolve) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return resolve(false);
        
        let resolved = false;
        zipfile.readEntry();
        zipfile.on('entry', (entry: any) => {
          if (resolved) return;
          if (entry.fileName === 'xl/worksheets/sheet1.xml') {
            zipfile.openReadStream(entry, (err: Error | null, stream: Readable) => {
              if (err) { resolve(false); return; }
              
              const parser = sax.createStream(true, { trim: false });
              let inRow = false;
              let inCell = false;
              let inValue = false;
              let cellValue = '';
              let currentRow: string[] = [];
              let rowCount = 0;
              
              parser.on('opentag', (node: any) => {
                if (resolved) return;
                if (node.name === 'row') { inRow = true; currentRow = []; }
                else if (node.name === 'c' && inRow) { inCell = true; cellValue = ''; }
                else if ((node.name === 'v' || node.name === 't') && inCell) { inValue = true; cellValue = ''; }
              });
              parser.on('text', (text: string) => { if (inValue && !resolved) cellValue += text; });
              parser.on('closetag', (name: string) => {
                if (resolved) return;
                if (name === 'v' || (name === 't' && inCell)) { inValue = false; }
                else if (name === 'c') { currentRow.push(cellValue); inCell = false; }
                else if (name === 'row') {
                  rowCount++;
                  if (rowCount === 1) {
                    const headerStr = currentRow.join(',').toLowerCase();
                    const isUnimed = headerStr.includes('demonstrativo') && 
                                   headerStr.includes('protocolo') && 
                                   headerStr.includes('beneficiario');
                    resolved = true;
                    resolve(isUnimed);
                    stream.destroy();
                  }
                  inRow = false;
                }
              });
              parser.on('end', () => { if (!resolved) { resolved = true; resolve(false); } });
              parser.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
              
              // Pipe directly - only reads until first row is found then destroys
              stream.pipe(parser);
            });
          } else {
            zipfile.readEntry();
          }
        });
        zipfile.on('end', () => { if (!resolved) { resolved = true; resolve(false); } });
        zipfile.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
      });
    });
  } catch {
    return false;
  }
}
