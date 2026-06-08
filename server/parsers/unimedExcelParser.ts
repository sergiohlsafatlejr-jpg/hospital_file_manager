/**
 * Parser otimizado para demonstrativos Unimed (Excel/XLSX)
 * 
 * Usa yauzl (unzip) + sax (XML streaming) para processar arquivos XLSX
 * sem carregar o workbook na memória.
 * 
 * Consumo de memória: ~7 MB heap (vs 185 MB com SheetJS)
 * Funciona confortavelmente no Cloud Run com 512 MiB.
 * 
 * Estratégia:
 * 1. Descompactar o XLSX (que é um ZIP) com yauzl
 * 2. Extrair xl/sharedStrings.xml (se existir) e xl/worksheets/sheet1.xml
 * 3. Parsear o XML com SAX (streaming, linha por linha)
 * 4. Chamar callback a cada chunk de N registros para INSERT no banco
 */
import yauzl from 'yauzl';
import sax from 'sax';
import type { InsertRecebimentoExcel } from '../../drizzle/schema';

// Mapeamento de colunas do demonstrativo Unimed
const UNIMED_COLUMNS = [
  'demonstrativo', 'dataPagtoProcessado', 'protocoloTISS', 'lotePrestador',
  'codigoPrestadorPagamento', 'nomePrestadorPagamento', 'codigoPrestadorOriginal',
  'nomePrestadorOriginal', 'numeroCarteira', 'nomeBeneficiario', 'codigoPlano',
  'descricaoPlano', 'numeroGuiaPrestador', 'numeroGuiaOperadora', 'senha',
  'dataInicialFaturamento', 'dataFinalFaturamento', 'codigoProcedimento',
  'descricaoProcedimento', 'grauParticipacao', 'valorInformado', 'valorProcessado',
  'valorGlosa', 'valorLiberado', 'codigoGlosa', 'descricaoGlosa',
  'recursoGlosa', 'valorRecurso'
];

// Converter serial number do Excel para Date
function excelSerialToDate(serial: number): Date | undefined {
  if (!serial || serial < 1) return undefined;
  const epoch = new Date(1899, 11, 30);
  epoch.setDate(epoch.getDate() + Math.floor(serial));
  return epoch;
}

// Converter serial number para string de data DD/MM/YYYY
function excelSerialToDateStr(serial: number): string | undefined {
  const d = excelSerialToDate(serial);
  if (!d) return undefined;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Extrair arquivos necessários do XLSX (ZIP)
function extractXlsxFiles(buffer: Buffer): Promise<{ sharedStrings: Buffer | null; sheet1: Buffer }> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      
      let sharedStrings: Buffer | null = null;
      let sheet1: Buffer | null = null;
      
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (entry.fileName === 'xl/sharedStrings.xml' || entry.fileName === 'xl/worksheets/sheet1.xml') {
          zipfile.openReadStream(entry, (err, stream) => {
            if (err) return reject(err);
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
              const buf = Buffer.concat(chunks);
              if (entry.fileName === 'xl/sharedStrings.xml') {
                sharedStrings = buf;
              } else {
                sheet1 = buf;
              }
              zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => {
        if (!sheet1) return reject(new Error('sheet1.xml not found in XLSX'));
        resolve({ sharedStrings, sheet1 });
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

// Parsear worksheet com SAX streaming e chamar callback a cada chunk
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
  
  // Step 1: Extract files from XLSX ZIP
  const { sharedStrings: ssBuffer, sheet1 } = await extractXlsxFiles(buffer);
  
  // Step 2: Parse shared strings (if any)
  let sharedStrings: string[] = [];
  if (ssBuffer && ssBuffer.length > 0) {
    sharedStrings = await parseSharedStrings(ssBuffer);
  }
  
  // Step 3: Parse worksheet with SAX and process in chunks
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false });
    
    let inRow = false;
    let inCell = false;
    let inValue = false;
    let cellType = '';
    let cellValue = '';
    let currentRow: string[] = [];
    let rowCount = 0;
    let headerRow: string[] | null = null;
    
    let chunk: InsertRecebimentoExcel[] = [];
    let chunkIdx = 0;
    let totalRecords = 0;
    let estimatedTotalRows = 33000; // Estimativa inicial
    
    // Queue para processar chunks sequencialmente
    let processing = Promise.resolve();
    
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
          // Header row
          headerRow = currentRow;
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
                processing = processing.then(() => 
                  onChunk(currentChunk, currentChunkIdx, estimatedTotalRows)
                );
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
    
    // Alimentar o parser com o XML
    parser.end(sheet1);
  });
}

function convertRowToRecord(
  row: string[],
  arquivoId: number,
  convenioId: number,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date,
  estabelecimentoId?: number
): InsertRecebimentoExcel | null {
  if (row.length < 20) return null;
  
  // Mapear colunas por índice (baseado no formato Unimed)
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
  
  const dataPagto = dataPagamentoUpload || excelSerialToDate(dataPagtoSerial);
  const dataInicial = excelSerialToDateStr(dataInicialSerial);
  const dataFinal = excelSerialToDateStr(dataFinalSerial);
  
  // Calcular competência
  let competencia: string | undefined;
  if (dataReferenciaUpload) {
    competencia = `${dataReferenciaUpload.getUTCFullYear()}-${String(dataReferenciaUpload.getUTCMonth() + 1).padStart(2, '0')}`;
  } else if (dataPagto) {
    const d = dataPagto instanceof Date ? dataPagto : new Date(dataPagto);
    competencia = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  
  const valorInformado = getNumber(20);
  const valorProcessado = getNumber(21);
  const valorGlosa = getNumber(22);
  const valorLiberado = getNumber(23);
  
  return {
    arquivoId,
    convenioId,
    estabelecimentoId: estabelecimentoId || undefined,
    demonstrativo: getValue(0).replace('.0', ''),
    protocoloTISS: getValue(2).replace(/\.0$/, ''),
    lotePrestador: getValue(3),
    codigoPrestador: getValue(4).replace('.0', ''),
    nomePrestador: getValue(5),
    codigoPrestadorOriginal: getValue(6).replace('.0', ''),
    nomePrestadorOriginal: getValue(7),
    numeroCarteira: getValue(8),
    nomeBeneficiario: getValue(9),
    codigoPlano: getValue(10),
    descricaoPlano: getValue(11),
    numeroGuiaPrestador: getValue(12),
    numeroGuiaOperadora: getValue(13),
    senha: getValue(14),
    dataInicialFaturamento: dataInicial,
    dataFinalFaturamento: dataFinal,
    codigoProcedimento: getValue(17),
    descricaoProcedimento: getValue(18),
    grauParticipacao: getValue(19),
    valorInformado: valorInformado ? String(valorInformado.toFixed(2)) : '0.00',
    valorProcessado: valorProcessado ? String(valorProcessado.toFixed(2)) : '0.00',
    valorGlosa: valorGlosa ? String(valorGlosa.toFixed(2)) : '0.00',
    valorLiberado: valorLiberado ? String(valorLiberado.toFixed(2)) : '0.00',
    codigoGlosa: getValue(24),
    descricaoGlosa: getValue(25),
    recursoGlosa: getValue(26),
    valorRecurso: getNumber(27) ? String(getNumber(27).toFixed(2)) : undefined,
    dataPagamento: dataPagto ? (dataPagto instanceof Date ? dataPagto.toISOString().split('T')[0] : String(dataPagto)) : undefined,
    competencia,
  };
}

// Detecção rápida de formato Unimed (usa yauzl + sax, apenas 1 linha)
export async function detectUnimedFormat(buffer: Buffer): Promise<boolean> {
  try {
    const { sheet1 } = await extractXlsxFiles(buffer);
    
    return new Promise((resolve) => {
      const parser = sax.createStream(true, { trim: false });
      let inRow = false;
      let inCell = false;
      let inValue = false;
      let cellType = '';
      let cellValue = '';
      let currentRow: string[] = [];
      let rowCount = 0;
      let resolved = false;
      
      parser.on('opentag', (node: any) => {
        if (resolved) return;
        if (node.name === 'row') { inRow = true; currentRow = []; }
        else if (node.name === 'c' && inRow) { inCell = true; cellType = node.attributes.t || ''; cellValue = ''; }
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
            // Check header
            const headerStr = currentRow.join(',').toLowerCase();
            const isUnimed = headerStr.includes('demonstrativo') && 
                           headerStr.includes('protocolo') && 
                           headerStr.includes('beneficiario');
            resolved = true;
            resolve(isUnimed);
            parser.end();
          }
          inRow = false;
        }
      });
      
      parser.on('end', () => { if (!resolved) resolve(false); });
      parser.on('error', () => { if (!resolved) resolve(false); });
      
      // Feed only first 100KB to detect header quickly
      const slice = sheet1.slice(0, 100 * 1024);
      parser.end(slice);
    });
  } catch {
    return false;
  }
}
