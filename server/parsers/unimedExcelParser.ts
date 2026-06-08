import type { InsertRecebimentoExcel } from '../../drizzle/schema';

/**
 * Parser otimizado para demonstrativos da Unimed.
 * 
 * Usa SheetJS com acesso direto às células para processamento em chunks.
 * Estratégia: ler workbook uma vez, extrair dados linha a linha sem criar
 * objetos intermediários (sheet_to_json), e liberar memória após extração.
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
 * Parseia data no formato DD/MM/YYYY retornando Date ou undefined.
 * Também trata serial numbers do Excel.
 */
function parseDateBR(value: any): Date | undefined {
  if (!value) return undefined;
  
  // Se for número (serial date do Excel)
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400000);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  const str = String(value).trim();
  if (!str) return undefined;
  
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return undefined;
}

/**
 * Parseia valor decimal
 */
function parseDecimal(value: any): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return String(value);
  const str = String(value).replace(/[R$\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : String(num);
}

/**
 * Parseia inteiro
 */
function parseInt2(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = parseInt(String(value), 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Processa arquivo Unimed usando SheetJS com acesso direto às células.
 * 
 * Estratégia de memória:
 * 1. Ler workbook inteiro (185 MB heap para 33k linhas)
 * 2. Extrair dados linha a linha diretamente das células
 * 3. Processar em chunks e inserir no banco
 * 4. Liberar referências após cada chunk
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
  chunkSize: number = 500,
  onChunk?: (records: InsertRecebimentoExcel[], chunkIndex: number, totalRows: number) => Promise<void>
): Promise<{ totalRows: number; totalRecords: number }> {
  const XLSX = require('xlsx');
  
  const startTime = Date.now();
  console.log(`[Parser Unimed SheetJS] Iniciando processamento (buffer: ${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
  
  // Ler workbook inteiro (185 MB heap para 33k linhas)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  if (!sheet || !sheet['!ref']) {
    throw new Error('Planilha vazia ou inválida');
  }
  
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const totalDataRows = range.e.r; // Total de linhas de dados (excluindo cabeçalho)
  
  console.log(`[Parser Unimed SheetJS] Workbook lido: ${totalDataRows} linhas, ${range.e.c + 1} colunas`);
  
  // Ler cabeçalho (linha 0)
  const headers: string[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = sheet[addr];
    headers.push(cell?.v ? String(cell.v).trim() : '');
  }
  
  // Validar formato
  if (!isUnimedFormat(headers)) {
    throw new Error('Formato não reconhecido como Unimed');
  }
  
  // Helper para ler valor de célula
  const getCell = (r: number, c: number): any => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[addr];
    return cell?.v !== undefined ? cell.v : '';
  };
  
  let totalRows = 0;
  let totalRecords = 0;
  let currentChunk: InsertRecebimentoExcel[] = [];
  let chunkIndex = 0;
  
  // Processar linha a linha
  for (let row = 1; row <= range.e.r; row++) {
    totalRows++;
    
    // Ler campos relevantes para verificação
    const guia = getCell(row, 6);
    const item = getCell(row, 12);
    const valor = getCell(row, 15);
    
    // Pular linhas vazias
    if (!guia && !item && !valor) continue;
    
    const record: InsertRecebimentoExcel = {
      arquivoId,
      convenioId,
      estabelecimentoId: estabelecimentoId || undefined,
      dataReferencia: dataReferencia || undefined,
      dataPagamento: dataPagamento || undefined,
      // Campos do formato Unimed
      processado: parseDecimal(getCell(row, 0)),
      dataPagto: parseDateBR(getCell(row, 1)),
      protocoloTiss: String(getCell(row, 2) || '') || undefined,
      lotePrestador: String(getCell(row, 3) || '') || undefined,
      codigoPrestadorPagamento: String(getCell(row, 4) || '') || undefined,
      nomePrestadorPagamento: String(getCell(row, 5) || '') || undefined,
      numeroGuia: String(getCell(row, 6) || '') || undefined,
      seq: parseInt2(getCell(row, 7)),
      beneficiario: String(getCell(row, 8) || '') || undefined,
      nomeBeneficiario: String(getCell(row, 9) || '') || undefined,
      dataExecucao: parseDateBR(getCell(row, 10)),
      // index 11 = Hora Execução (ignorado)
      item: String(getCell(row, 12) || '') || undefined,
      itemDesc: String(getCell(row, 13) || '') || undefined,
      quantidade: parseInt2(getCell(row, 14)),
      valorPagamento: parseDecimal(getCell(row, 15)),
      tipoLancamento: String(getCell(row, 16) || '') || undefined,
      erroTiss: String(getCell(row, 17) || '') || undefined,
      situacaoItem: String(getCell(row, 18) || '') || undefined,
      codigoSolicitante: String(getCell(row, 19) || '') || undefined,
      nomeSolicitante: String(getCell(row, 20) || '') || undefined,
      acomodacaoInternacao: String(getCell(row, 21) || '') || undefined,
      dataInicioFaturamentoInternacao: parseDateBR(getCell(row, 22)),
      dataFimFaturamentoInternacao: parseDateBR(getCell(row, 23)),
      codigoPrestador: String(getCell(row, 24) || '') || undefined,
      nomePrestador: String(getCell(row, 25) || '') || undefined,
      prestadorExecutante: String(getCell(row, 26) || '') || undefined,
      nomePrestadorExecutante: String(getCell(row, 27) || '') || undefined,
    };
    
    currentChunk.push(record);
    
    // Quando chunk está cheio, enviar para o banco
    if (currentChunk.length >= chunkSize) {
      if (onChunk) {
        await onChunk(currentChunk, chunkIndex, totalRows);
      }
      totalRecords += currentChunk.length;
      currentChunk = [];
      chunkIndex++;
    }
  }
  
  // Processar último chunk
  if (currentChunk.length > 0) {
    if (onChunk) {
      await onChunk(currentChunk, chunkIndex, totalRows);
    }
    totalRecords += currentChunk.length;
    chunkIndex++;
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`[Parser Unimed SheetJS] Concluído: ${totalRecords} registros em ${chunkIndex} chunks (${elapsed}ms total)`);
  
  return { totalRows, totalRecords };
}
