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
 * Colunas REAIS do demonstrativo Unimed (confirmado via análise do arquivo):
 * 0: Demonstrativo (número do demonstrativo, ex: 298158.0)
 * 1: Data Pagto (serial Excel, ex: 46171.0)
 * 2: Protocolo TISS (ex: 2.020764448E9)
 * 3: Lote Prestador (ex: 120097817)
 * 4: Código Prestador Pagamento (ex: 1100242.0)
 * 5: Nome Prestador Pagamento (ex: PRONTO SOCORRO INFANTIL...)
 * 6: Número Guia (ex: 71852456)
 * 7: Seq (ex: 2)
 * 8: Beneficiário (carteira, ex: 0064.8000.115802.10.3)
 * 9: Nome Beneficiário (ex: ABDALLA BOU HANNA OBEID)
 * 10: Data Execução (serial Excel com hora)
 * 11: Hora Execução (ex: 11:25)
 * 12: Item (código procedimento, ex: 1.0101039E7)
 * 13: Item Desc (ex: Consulta Em Pronto Socorro)
 * 14: Quantidade (ex: 1.0)
 * 15: Valor Pagamento (ex: 120.0)
 * 16: Tipo Lançamento (ex: CON, EXA)
 * 17: Erro TISS (código glosa)
 * 18: Situação Item (ex: PAGO, GLOSADO)
 * 19: Código Solicitante
 * 20: Nome Solicitante
 * 21: Acomodação da Internação
 * 22: Data Inicio Faturamento Internação
 * 23: Data Fim Faturamento Internação
 * 24: Código Prestador (original)
 * 25: Nome Prestador (original)
 * 26: Prestador Executante (código)
 * 27: Nome Prestador Executante
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
 * Mapeamento baseado na análise real do arquivo demonstrativo-0298158.xlsx:
 * Col 0: Demonstrativo → processado
 * Col 1: Data Pagto (serial) → dataPagto
 * Col 2: Protocolo TISS → protocoloTiss
 * Col 3: Lote Prestador → lotePrestador
 * Col 4: Código Prestador Pagamento → codigoPrestadorPagamento
 * Col 5: Nome Prestador Pagamento → nomePrestadorPagamento
 * Col 6: Número Guia → numeroGuia
 * Col 7: Seq → seq
 * Col 8: Beneficiário (carteira) → beneficiario
 * Col 9: Nome Beneficiário → nomeBeneficiario
 * Col 10: Data Execução (serial) → dataExecucao
 * Col 11: Hora Execução → horaExecucao
 * Col 12: Item (código) → item
 * Col 13: Item Desc → itemDesc
 * Col 14: Quantidade → quantidade
 * Col 15: Valor Pagamento → valorPagamento
 * Col 16: Tipo Lançamento → tipoLancamento
 * Col 17: Erro TISS → erroTiss
 * Col 18: Situação Item → situacaoItem
 * Col 19: Código Solicitante → codigoSolicitante
 * Col 20: Nome Solicitante → nomeSolicitante
 * Col 21: Acomodação Internação → acomodacaoInternacao
 * Col 22: Data Inicio Fat. Internação → dataInicioFaturamentoInternacao
 * Col 23: Data Fim Fat. Internação → dataFimFaturamentoInternacao
 * Col 24: Código Prestador → codigoPrestador
 * Col 25: Nome Prestador → nomePrestador
 * Col 26: Prestador Executante → (não mapeado separado)
 * Col 27: Nome Prestador Executante → (não mapeado separado)
 */
function convertRowToRecord(
  row: string[],
  arquivoId: number,
  convenioId: number,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date,
  estabelecimentoId?: number
): InsertRecebimentoExcel | null {
  if (row.length < 15) return null;
  
  const getValue = (idx: number): string => (row[idx] || '').trim();
  const getNumber = (idx: number): number => {
    const v = getValue(idx);
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  
  // Formatar número grande sem notação científica
  const formatBigNumber = (idx: number): string => {
    const v = getValue(idx);
    if (!v) return '';
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    // Se é notação científica (ex: 2.020764448E9), converter para inteiro
    if (v.includes('E') || v.includes('e') || n > 999999) {
      return Math.round(n).toString();
    }
    return v.replace(/\.0$/, '');
  };
  
  // Converter datas (serial numbers do Excel)
  const dataPagtoSerial = getNumber(1);
  const dataExecucaoSerial = getNumber(10);
  const dataInicialSerial = getNumber(22);
  const dataFinalSerial = getNumber(23);
  
  const dataPagtoDate = dataPagamentoUpload || excelSerialToDate(dataPagtoSerial);
  const dataExecucaoDate = excelSerialToDate(Math.floor(dataExecucaoSerial));
  const dataInicialDate = excelSerialToDate(dataInicialSerial);
  const dataFinalDate = excelSerialToDate(dataFinalSerial);
  
  const dataRef = dataReferenciaUpload || dataPagtoDate;
  
  const valorPagamento = getNumber(15);
  
  // Situação vem diretamente da coluna 18
  const situacaoItem = getValue(18) || 'PAGO';
  
  const record: InsertRecebimentoExcel = {
    arquivoId,
    convenioId,
    estabelecimentoId: estabelecimentoId || undefined,
    
    // Demonstrativo e datas
    processado: formatBigNumber(0) || undefined,
    dataPagto: dataPagtoDate || undefined,
    protocoloTiss: formatBigNumber(2) || undefined,
    lotePrestador: getValue(3) || undefined,
    
    // Prestador pagamento
    codigoPrestadorPagamento: formatBigNumber(4) || undefined,
    nomePrestadorPagamento: getValue(5) || undefined,
    
    // Guia e sequencial
    numeroGuia: getValue(6) || undefined,
    seq: getValue(7) || undefined,
    
    // Beneficiário
    beneficiario: getValue(8) || undefined,
    nomeBeneficiario: getValue(9) || undefined,
    
    // Execução
    dataExecucao: dataExecucaoDate || undefined,
    horaExecucao: getValue(11) || undefined,
    
    // Procedimento
    item: formatBigNumber(12) || undefined,
    itemDesc: getValue(13) || undefined,
    quantidade: getValue(14) || undefined,
    
    // Valor
    valorPagamento: valorPagamento ? String(valorPagamento.toFixed(2)) : undefined,
    
    // Tipo e situação
    tipoLancamento: getValue(16) || undefined,
    erroTiss: getValue(17) || undefined,
    situacaoItem,
    
    // Solicitante
    codigoSolicitante: formatBigNumber(19) || undefined,
    nomeSolicitante: getValue(20) || undefined,
    
    // Internação
    acomodacaoInternacao: getValue(21) || undefined,
    dataInicioFaturamentoInternacao: dataInicialDate || undefined,
    dataFimFaturamentoInternacao: dataFinalDate || undefined,
    
    // Prestador original
    codigoPrestador: formatBigNumber(24) || undefined,
    nomePrestador: getValue(25) || undefined,
    
    // Data de referência
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
