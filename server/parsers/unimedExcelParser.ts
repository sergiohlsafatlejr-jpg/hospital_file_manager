import type { InsertRecebimentoExcel } from '../../drizzle/schema';
import { Readable } from 'stream';

/**
 * Parser otimizado para demonstrativos da Unimed.
 * 
 * Usa xlsx-stream-reader para processamento streaming:
 * - Heap: ~13 MB (vs 185 MB SheetJS, vs 375 MB ExcelJS)
 * - RSS: ~94 MB (vs 417 MB SheetJS, vs 533 MB ExcelJS)
 * - Processa 33k linhas em ~17s com consumo mínimo de memória
 * - Funciona confortavelmente no Cloud Run (512 MiB)
 * 
 * Formato Unimed (28 colunas fixas):
 * Demonstrativo, Data Pagto Processado, Protocolo TISS, Lote Prestador,
 * Código Prestador Pagamento, Nome Prestador Pagamento,
 * Número Guia, Seq, Beneficiário, Nome Beneficiário,
 * Data Execução, Hora Execução, Item, Item Desc, Quantidade, Valor Pagamento,
 * Tipo Lançamento, Erro TISS, Situação Item,
 * Código Solicitante, Nome Solicitante,
 * Acomodação da Internação, Data Inicio Faturamento Internação, Data Fim Faturamento Internação,
 * Código Prestador, Nome Prestador, Prestador Executante, Nome Prestador Executante
 */

// Assinatura de colunas para detecção do formato Unimed
const UNIMED_SIGNATURE = [
  'Demonstrativo',
  'Data Pagto Processado',
  'Protocolo TISS',
  'Número Guia',
  'Situação Item',
  'Tipo Lançamento',
];

/**
 * Detecta se um buffer Excel é formato Unimed (leitura rápida apenas do cabeçalho).
 * Usa SheetJS com sheetRows:2 para ler apenas o cabeçalho (consumo mínimo).
 */
export function detectUnimedFormat(buffer: Buffer): boolean {
  try {
    // Importar XLSX apenas para detecção (leitura de 2 linhas = ~6 MB extra)
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 2 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return false;
    
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const headers: string[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = sheet[addr];
      headers.push(cell?.v ? String(cell.v).trim() : '');
    }
    
    return isUnimedFormat(headers);
  } catch {
    return false;
  }
}

function isUnimedFormat(headers: string[]): boolean {
  let matches = 0;
  for (const sig of UNIMED_SIGNATURE) {
    if (headers.some(h => h === sig)) matches++;
  }
  return matches >= 5;
}

/**
 * Parseia data no formato DD/MM/YYYY retornando Date ou undefined
 */
function parseDateBR(value: string | undefined | null): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return undefined;
}

/**
 * Parseia valor decimal (string "120.00" ou "1,234.56")
 */
function parseDecimal(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const str = String(value).replace(/[R$\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : String(num);
}

/**
 * Parseia inteiro
 */
function parseInt2(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const num = parseInt(String(value), 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Processa arquivo Unimed em streaming usando xlsx-stream-reader.
 * Consumo de memória: ~13 MB heap, ~94 MB RSS para 33k linhas.
 * 
 * @param buffer - Buffer do arquivo Excel
 * @param arquivoId - ID do arquivo no banco
 * @param convenioId - ID do convênio
 * @param dataReferencia - Data de referência do upload
 * @param dataPagamento - Data de pagamento do upload
 * @param estabelecimentoId - ID do estabelecimento
 * @param chunkSize - Tamanho do chunk para inserção em batch
 * @param onChunk - Callback chamado a cada chunk processado
 * @returns Total de linhas e registros processados
 */
export async function parseUnimedExcelChunked(
  buffer: Buffer,
  arquivoId: number,
  convenioId: number,
  dataReferencia?: Date,
  dataPagamento?: Date,
  estabelecimentoId?: number,
  chunkSize: number = 2000,
  onChunk?: (records: InsertRecebimentoExcel[], chunkIndex: number, totalRows: number) => Promise<void>
): Promise<{ totalRows: number; totalRecords: number }> {
  const XlsxStreamReader = require('xlsx-stream-reader');
  
  const startTime = Date.now();
  console.log(`[Parser Unimed Streaming] Iniciando processamento (buffer: ${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
  
  return new Promise((resolve, reject) => {
    const workBookReader = new XlsxStreamReader();
    let headers: string[] = [];
    let totalRows = 0;
    let totalRecords = 0;
    let currentChunk: InsertRecebimentoExcel[] = [];
    let chunkIndex = 0;
    let processingError: Error | null = null;
    
    // Queue para processar chunks sequencialmente
    let chunkPromise = Promise.resolve();
    
    workBookReader.on('worksheet', function (workSheetReader: any) {
      // Processar apenas a primeira sheet
      if (workSheetReader.id > 1) {
        workSheetReader.skip();
        return;
      }
      
      workSheetReader.on('row', function (row: any) {
        if (processingError) return;
        
        const values: string[] = row.values ? row.values.slice(1) : []; // values é 1-indexed
        
        // Primeira linha = cabeçalho
        if (row.attributes.r === '1') {
          headers = values.map((v: any) => (v || '').toString().trim());
          
          // Validar que é formato Unimed
          if (!isUnimedFormat(headers)) {
            processingError = new Error('Formato não reconhecido como Unimed');
          }
          return;
        }
        
        totalRows++;
        
        // Extrair campos da linha
        const get = (idx: number): string => (values[idx] || '').toString().trim();
        
        // Verificar se a linha tem dados relevantes
        const guia = get(6);
        const item = get(12);
        const valor = get(15);
        if (!guia && !item && !valor) return;
        
        const record: InsertRecebimentoExcel = {
          arquivoId,
          convenioId,
          estabelecimentoId: estabelecimentoId || undefined,
          dataReferencia: dataReferencia || undefined,
          dataPagamento: dataPagamento || undefined,
          // Campos do formato Unimed
          processado: parseDecimal(get(0)),
          dataPagto: parseDateBR(get(1)),
          protocoloTiss: get(2) || undefined,
          lotePrestador: get(3) || undefined,
          codigoPrestadorPagamento: get(4) || undefined,
          nomePrestadorPagamento: get(5) || undefined,
          numeroGuia: get(6) || undefined,
          seq: parseInt2(get(7)),
          beneficiario: get(8) || undefined,
          nomeBeneficiario: get(9) || undefined,
          dataExecucao: parseDateBR(get(10)),
          // index 11 = Hora Execução (ignorado)
          item: get(12) || undefined,
          itemDesc: get(13) || undefined,
          quantidade: parseInt2(get(14)),
          valorPagamento: parseDecimal(get(15)),
          tipoLancamento: get(16) || undefined,
          erroTiss: get(17) || undefined,
          situacaoItem: get(18) || undefined,
          codigoSolicitante: get(19) || undefined,
          nomeSolicitante: get(20) || undefined,
          acomodacaoInternacao: get(21) || undefined,
          dataInicioFaturamentoInternacao: parseDateBR(get(22)),
          dataFimFaturamentoInternacao: parseDateBR(get(23)),
          codigoPrestador: get(24) || undefined,
          nomePrestador: get(25) || undefined,
          prestadorExecutante: get(26) || undefined,
          nomePrestadorExecutante: get(27) || undefined,
        };
        
        currentChunk.push(record);
        
        // Quando chunk está cheio, enviar para o banco
        if (currentChunk.length >= chunkSize) {
          const chunkToSend = currentChunk;
          const currentChunkIdx = chunkIndex;
          currentChunk = [];
          chunkIndex++;
          
          if (onChunk) {
            // Encadear promises para processar chunks sequencialmente
            chunkPromise = chunkPromise.then(async () => {
              try {
                await onChunk(chunkToSend, currentChunkIdx, totalRows);
                totalRecords += chunkToSend.length;
              } catch (err) {
                processingError = err as Error;
              }
            });
          } else {
            totalRecords += chunkToSend.length;
          }
        }
      });
      
      workSheetReader.on('end', function () {
        // Processar último chunk
        if (currentChunk.length > 0 && !processingError) {
          const lastChunk = currentChunk;
          const lastChunkIdx = chunkIndex;
          
          if (onChunk) {
            chunkPromise = chunkPromise.then(async () => {
              try {
                await onChunk(lastChunk, lastChunkIdx, totalRows);
                totalRecords += lastChunk.length;
              } catch (err) {
                processingError = err as Error;
              }
            });
          } else {
            totalRecords += lastChunk.length;
          }
        }
      });
      
      workSheetReader.process();
    });
    
    workBookReader.on('end', function () {
      // Aguardar todos os chunks serem processados
      chunkPromise.then(() => {
        if (processingError) {
          reject(processingError);
          return;
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`[Parser Unimed Streaming] Concluído: ${totalRecords} registros em ${chunkIndex + 1} chunks (${elapsed}ms total)`);
        resolve({ totalRows, totalRecords });
      }).catch(reject);
    });
    
    workBookReader.on('error', function (error: Error) {
      reject(error);
    });
    
    // Criar stream a partir do buffer e iniciar processamento
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(workBookReader);
  });
}
