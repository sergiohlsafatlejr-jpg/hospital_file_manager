/**
 * Parser otimizado para demonstrativos Unimed (Excel/XLSX)
 * 
 * Usa yauzl.open (lê do disco, NÃO duplica na RAM) + sax (XML streaming).
 * O sheet1.xml (51.7 MB descompactado) NUNCA é acumulado na memória.
 * O sharedStrings.xml é parseado em streaming (não acumula XML bruto).
 * 
 * Consumo de memória: ~15-25 MB adicional sobre o baseline do servidor.
 * 
 * Estratégia:
 * 1. Salvar buffer em /tmp e abrir com yauzl.open (lê do disco)
 * 2. Parsear xl/sharedStrings.xml em streaming (SAX) → array de strings
 * 3. Para xl/worksheets/sheet1.xml: stream.pipe(saxParser) DIRETO
 * 4. SAX processa tag por tag, chama callback a cada chunk de N registros
 */
import yauzl from 'yauzl';
import sax from 'sax';
import { writeFileSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
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

// Parsear shared strings em STREAMING (não acumula XML bruto)
function parseSharedStringsStream(stream: Readable): Promise<string[]> {
  return new Promise((resolve, reject) => {
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
    parser.on('error', (err: Error) => {
      console.error('[UnimedParser] SharedStrings parse error:', err.message);
      resolve(strings); // Resolve with what we have
    });
    
    stream.pipe(parser);
  });
}

// Abrir XLSX do DISCO (não duplica na RAM) e processar entries sequencialmente
interface XlsxFileHandle {
  zipfile: any;
  tmpPath: string;
}

function openXlsxFromDisk(tmpPath: string): Promise<XlsxFileHandle> {
  return new Promise((resolve, reject) => {
    yauzl.open(tmpPath, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error('Failed to open ZIP'));
      resolve({ zipfile, tmpPath });
    });
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
  
  // Step 1: Salvar em arquivo temporário para usar yauzl.open (lê do disco)
  const tmpPath = `/tmp/xlsx-${randomBytes(8).toString('hex')}.xlsx`;
  writeFileSync(tmpPath, buffer);
  
  // LIBERAR o buffer da memória imediatamente
  // @ts-ignore - forçar GC do buffer
  buffer = null as any;
  
  try {
    const { zipfile } = await openXlsxFromDisk(tmpPath);
    
    // Step 2: Primeiro pass - encontrar e parsear sharedStrings em streaming
    // NOTA: No XLSX, sharedStrings pode vir DEPOIS do sheet1 na ordem do ZIP!
    // Por isso, percorremos TODAS as entries até encontrar sharedStrings.
    const sharedStrings = await new Promise<string[]>((resolve, reject) => {
      let found = false;
      zipfile.readEntry();
      zipfile.on('entry', (entry: any) => {
        if (entry.fileName === 'xl/sharedStrings.xml') {
          found = true;
          zipfile.openReadStream(entry, (err: Error | null, stream: Readable) => {
            if (err) return reject(err);
            parseSharedStringsStream(stream).then(strings => {
              resolve(strings);
            }).catch(reject);
          });
        } else {
          // Continuar lendo entries (inclusive sheet1) até encontrar sharedStrings
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => {
        if (!found) resolve([]);
      });
      zipfile.on('error', reject);
    });
    
    // Fechar o zipfile do primeiro pass
    zipfile.close();
    
    // Step 3: Segundo pass - processar sheet1 em streaming
    const { zipfile: zipfile2 } = await openXlsxFromDisk(tmpPath);
    
    const result = await new Promise<{ totalRecords: number }>((resolve, reject) => {
      zipfile2.readEntry();
      zipfile2.on('entry', (entry: any) => {
        if (entry.fileName === 'xl/worksheets/sheet1.xml') {
          zipfile2.openReadStream(entry, (err: Error | null, stream: Readable) => {
            if (err) return reject(err);
            
            processSheet1Stream(stream, sharedStrings, arquivoId, convenioId, 
              dataReferenciaUpload, dataPagamentoUpload, estabelecimentoId, 
              chunkSize, onChunk)
              .then(resolve)
              .catch(reject);
          });
        } else {
          zipfile2.readEntry();
        }
      });
      zipfile2.on('end', () => {
        // Se sheet1 não foi encontrado
      });
      zipfile2.on('error', reject);
    });
    
    zipfile2.close();
    return result;
    
  } finally {
    // Limpar arquivo temporário
    try { unlinkSync(tmpPath); } catch {}
  }
}

// Processar sheet1 stream com SAX
function processSheet1Stream(
  sheet1Stream: Readable,
  sharedStrings: string[],
  arquivoId: number,
  convenioId: number,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date,
  estabelecimentoId?: number,
  chunkSize: number = 500,
  onChunk?: (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => Promise<void>
): Promise<{ totalRecords: number }> {
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
    let estimatedTotalRows = 33000;
    
    // Queue para processar chunks sequencialmente com backpressure
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
                // Pause stream para backpressure durante INSERT
                if (!paused) {
                  sheet1Stream.pause();
                  paused = true;
                }
                processing = processing.then(async () => {
                  await onChunk(currentChunk, currentChunkIdx, estimatedTotalRows);
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
      estimatedTotalRows = rowCount - 1;
      
      if (chunk.length > 0 && onChunk) {
        const finalChunk = [...chunk];
        const finalIdx = chunkIdx;
        processing = processing.then(() => 
          onChunk(finalChunk, finalIdx, estimatedTotalRows)
        );
      }
      
      processing.then(() => {
        resolve({ totalRecords });
      }).catch(reject);
    });
    
    parser.on('error', (err: Error) => {
      console.error('[UnimedParser SAX] Error:', err.message);
      processing.then(() => {
        resolve({ totalRecords });
      }).catch(reject);
    });
    
    // PIPE DIRETO: stream do ZIP → SAX parser
    sheet1Stream.pipe(parser);
  });
}

/**
 * Converte uma linha do Excel (array de strings) para InsertRecebimentoExcel
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
    situacaoItem = 'GLOSADO';
  } else {
    situacaoItem = 'PAGO';
  }
  
  const record: InsertRecebimentoExcel = {
    arquivoId,
    convenioId,
    estabelecimentoId: estabelecimentoId || undefined,
    
    processado: valorProcessado ? String(valorProcessado.toFixed(2)) : getValue(0).replace('.0', ''),
    dataPagto: dataPagtoDate || undefined,
    protocoloTiss: getValue(2).replace(/\.0$/, '') || undefined,
    lotePrestador: getValue(3) || undefined,
    
    codigoPrestadorPagamento: getValue(4).replace('.0', '') || undefined,
    nomePrestadorPagamento: getValue(5) || undefined,
    codigoPrestador: getValue(6).replace('.0', '') || undefined,
    nomePrestador: getValue(7) || undefined,
    
    beneficiario: getValue(8) || undefined,
    nomeBeneficiario: getValue(9) || undefined,
    
    numeroGuia: getValue(12) || undefined,
    codigoSolicitante: getValue(13) || undefined,
    horaExecucao: getValue(14) || undefined,
    
    item: getValue(17) || undefined,
    itemDesc: getValue(18) || undefined,
    
    tipoItem: getValue(10) || undefined,
    tipoLancamento: getValue(11) || undefined,
    acomodacaoInternacao: getValue(19) || undefined,
    
    dataInicioFaturamentoInternacao: dataInicialDate || undefined,
    dataFimFaturamentoInternacao: dataFinalDate || undefined,
    
    valorInformado: valorInformado ? String(valorInformado.toFixed(2)) : undefined,
    valorPagamento: valorLiberado ? String(valorLiberado.toFixed(2)) : undefined,
    valorGlosa: valorGlosa ? String(valorGlosa.toFixed(2)) : undefined,
    
    codigoGlosa: getValue(24) || undefined,
    erroTiss: getValue(25) || undefined,
    situacaoItem,
    
    nomeSolicitante: getValue(26) || undefined,
    
    dataReferencia: dataRef || undefined,
    dataPagamentoUpload: dataPagamentoUpload || undefined,
  };
  
  return record;
}

// Detecção rápida de formato Unimed
export async function detectUnimedFormat(buffer: Buffer): Promise<boolean> {
  try {
    const tmpPath = `/tmp/xlsx-detect-${randomBytes(4).toString('hex')}.xlsx`;
    writeFileSync(tmpPath, buffer);
    
    const result = await new Promise<boolean>((resolve) => {
      yauzl.open(tmpPath, { lazyEntries: true }, (err: any, zipfile: any) => {
        if (err || !zipfile) { resolve(false); return; }
        
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
                    zipfile.close();
                  }
                  inRow = false;
                }
              });
              parser.on('end', () => { if (!resolved) { resolved = true; resolve(false); } });
              parser.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
              
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
    
    try { unlinkSync(tmpPath); } catch {}
    return result;
  } catch {
    return false;
  }
}
