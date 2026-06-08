import XLSX from 'xlsx';
import type { InsertRecebimentoExcel } from '../../drizzle/schema';

/**
 * Parser otimizado para demonstrativos da Unimed.
 * 
 * Estratégia de baixo consumo de memória:
 * 1. Usa SheetJS com cellDates:false (165MB heap para 33k linhas vs 375MB do ExcelJS)
 * 2. Acesso direto às células (encode_cell) em vez de sheet_to_json
 * 3. Processa em chunks de N registros, enviando para o banco incrementalmente
 * 4. Não cria objetos intermediários desnecessários
 * 
 * Formato Unimed (colunas fixas):
 * - Demonstrativo, Data Pagto Processado, Protocolo TISS, Lote Prestador
 * - Código Prestador Pagamento, Nome Prestador Pagamento
 * - Número Guia, Seq, Beneficiário, Nome Beneficiário
 * - Data Execução, Hora Execução, Item, Item Desc, Quantidade, Valor Pagamento
 * - Tipo Lançamento, Erro TISS, Situação Item
 * - Código Solicitante, Nome Solicitante
 * - Acomodação da Internação, Data Inicio/Fim Faturamento Internação
 * - Código Prestador, Nome Prestador, Prestador Executante, Nome Prestador Executante
 */

// Mapeamento de índice de coluna Unimed → campo do banco
const UNIMED_COLUMNS: { index: number; field: keyof InsertRecebimentoExcel; type: 'string' | 'number' | 'date' | 'decimal' | 'int' }[] = [
  { index: 0, field: 'processado', type: 'decimal' },          // Demonstrativo
  { index: 1, field: 'dataPagto', type: 'date' },              // Data Pagto Processado
  { index: 2, field: 'protocoloTiss', type: 'string' },        // Protocolo TISS
  { index: 3, field: 'lotePrestador', type: 'string' },        // Lote Prestador
  { index: 4, field: 'codigoPrestadorPagamento', type: 'string' }, // Código Prestador Pagamento
  { index: 5, field: 'nomePrestadorPagamento', type: 'string' }, // Nome Prestador Pagamento
  { index: 6, field: 'numeroGuia', type: 'string' },           // Número Guia
  { index: 7, field: 'seq', type: 'int' },                     // Seq
  { index: 8, field: 'beneficiario', type: 'string' },         // Beneficiário
  { index: 9, field: 'nomeBeneficiario', type: 'string' },     // Nome Beneficiário
  { index: 10, field: 'dataExecucao', type: 'date' },          // Data Execução
  // index: 11 = Hora Execução (ignorado, info já está na data)
  { index: 12, field: 'item', type: 'string' },                // Item
  { index: 13, field: 'itemDesc', type: 'string' },            // Item Desc
  { index: 14, field: 'quantidade', type: 'int' },             // Quantidade
  { index: 15, field: 'valorPagamento', type: 'decimal' },     // Valor Pagamento
  { index: 16, field: 'tipoLancamento', type: 'string' },      // Tipo Lançamento
  { index: 17, field: 'erroTiss', type: 'string' },            // Erro TISS
  { index: 18, field: 'situacaoItem', type: 'string' },        // Situação Item
  { index: 19, field: 'codigoSolicitante', type: 'string' },   // Código Solicitante
  { index: 20, field: 'nomeSolicitante', type: 'string' },     // Nome Solicitante
  { index: 21, field: 'acomodacaoInternacao', type: 'string' }, // Acomodação da Internação
  { index: 22, field: 'dataInicioFaturamentoInternacao', type: 'date' }, // Data Inicio Faturamento
  { index: 23, field: 'dataFimFaturamentoInternacao', type: 'date' },   // Data Fim Faturamento
  { index: 24, field: 'codigoPrestador', type: 'string' },     // Código Prestador
  { index: 25, field: 'nomePrestador', type: 'string' },       // Nome Prestador
  // index: 26 = Prestador Executante (código, redundante com codigoPrestador)
  // index: 27 = Nome Prestador Executante (redundante com nomePrestador)
];

/**
 * Detecta se o arquivo é um demonstrativo Unimed pelo cabeçalho
 */
export function isUnimedFormat(headers: string[]): boolean {
  // Verificar se tem as colunas específicas da Unimed
  const unimedSignature = [
    'Demonstrativo',
    'Data Pagto Processado',
    'Protocolo TISS',
    'Número Guia',
    'Situação Item',
    'Tipo Lançamento',
  ];
  
  let matches = 0;
  for (const sig of unimedSignature) {
    if (headers.includes(sig)) matches++;
  }
  
  // Se 5+ das 6 colunas-chave estão presentes, é Unimed
  return matches >= 5;
}

/**
 * Converte serial date do Excel para Date
 */
function excelSerialToDate(serial: number): Date | null {
  if (!serial || serial < 1) return null;
  // Excel serial date: dias desde 1900-01-01 (com bug do 29/02/1900)
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (parsed) {
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }
  return null;
}

/**
 * Extrai valor de uma célula do SheetJS
 */
function getCellValue(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return null;
  
  // Retornar valor raw (v) para processamento posterior
  return cell.v !== undefined ? cell.v : null;
}

/**
 * Parser otimizado para Unimed - processa em chunks com acesso direto às células.
 * Usa ~165MB de heap para 33k linhas (vs 375MB do ExcelJS).
 */
export async function parseUnimedExcelChunked(
  buffer: Buffer,
  arquivoId: number,
  convenioId: number | undefined,
  dataReferencia: Date | undefined,
  dataPagamento: Date | undefined,
  estabelecimentoId: number | undefined,
  chunkSize: number,
  onChunk: (records: InsertRecebimentoExcel[], chunkIndex: number, totalRows: number) => Promise<void>
): Promise<{ totalRows: number; totalRecords: number }> {
  
  console.log(`[Parser Unimed] Iniciando leitura otimizada (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
  const startTime = Date.now();
  
  // Ler com cellDates:false para menor consumo de memória
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error('[Parser Unimed] Nenhuma planilha encontrada');
    return { totalRows: 0, totalRecords: 0 };
  }
  
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const totalRowCount = range.e.r; // Excluindo cabeçalho (linha 0)
  
  console.log(`[Parser Unimed] Planilha: ${sheetName}, ${totalRowCount} linhas de dados, ${range.e.c + 1} colunas`);
  console.log(`[Parser Unimed] Leitura do arquivo: ${Date.now() - startTime}ms`);
  
  // Verificar cabeçalho (linha 0)
  const headers: string[] = [];
  for (let c = 0; c <= range.e.c; c++) {
    const val = getCellValue(sheet, 0, c);
    headers.push(val ? String(val).trim() : '');
  }
  
  // Validar que é formato Unimed
  if (!isUnimedFormat(headers)) {
    console.warn('[Parser Unimed] Formato não reconhecido como Unimed, headers:', headers.slice(0, 10).join(', '));
    // Fallback: retornar indicação para usar parser genérico
    return { totalRows: 0, totalRecords: -1 }; // -1 indica fallback necessário
  }
  
  // Detectar offset de colunas (caso haja colunas extras no início)
  let colOffset = 0;
  if (headers[0] !== 'Demonstrativo') {
    // Procurar onde começa "Demonstrativo"
    const demoIdx = headers.indexOf('Demonstrativo');
    if (demoIdx >= 0) colOffset = demoIdx;
  }
  
  console.log(`[Parser Unimed] Formato Unimed confirmado, offset: ${colOffset}, processando em chunks de ${chunkSize}`);
  
  let totalRecords = 0;
  let chunkIndex = 0;
  let currentChunk: InsertRecebimentoExcel[] = [];
  const totalRows = totalRowCount;
  
  // Processar linhas de dados (começando na linha 1, após cabeçalho)
  for (let rowNum = 1; rowNum <= range.e.r; rowNum++) {
    // Verificar se a linha tem dados (checar coluna Item ou Número Guia)
    const guiaVal = getCellValue(sheet, rowNum, 6 + colOffset);
    const itemVal = getCellValue(sheet, rowNum, 12 + colOffset);
    const valorVal = getCellValue(sheet, rowNum, 15 + colOffset);
    
    if (!guiaVal && !itemVal && !valorVal) continue; // Linha vazia
    
    // Construir registro diretamente sem objetos intermediários
    const record: InsertRecebimentoExcel = {
      arquivoId,
      convenioId,
      dataReferencia,
      dataPagamentoUpload: dataPagamento,
      estabelecimentoId,
    };
    
    // Extrair cada campo usando acesso direto
    for (const col of UNIMED_COLUMNS) {
      const value = getCellValue(sheet, rowNum, col.index + colOffset);
      if (value === null || value === undefined || value === '') continue;
      
      switch (col.type) {
        case 'date': {
          if (typeof value === 'number') {
            const date = excelSerialToDate(value);
            if (date) (record as any)[col.field] = date;
          } else if (typeof value === 'string') {
            // Tentar parse de string de data
            const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (brMatch) {
              (record as any)[col.field] = new Date(
                parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1])
              );
            }
          }
          break;
        }
        case 'decimal': {
          if (typeof value === 'number') {
            (record as any)[col.field] = String(value);
          } else {
            const str = String(value).replace(/[R$\s]/g, '').replace(',', '.');
            const num = parseFloat(str);
            if (!isNaN(num)) (record as any)[col.field] = String(num);
          }
          break;
        }
        case 'int': {
          if (typeof value === 'number') {
            (record as any)[col.field] = Math.round(value);
          } else {
            const num = parseInt(String(value), 10);
            if (!isNaN(num)) (record as any)[col.field] = num;
          }
          break;
        }
        case 'string':
        default: {
          const str = String(value).trim();
          if (str) (record as any)[col.field] = str;
          break;
        }
      }
    }
    
    // Só adicionar se tem item ou valor
    if (record.item || record.valorPagamento) {
      currentChunk.push(record);
    }
    
    // Enviar chunk quando atingir o tamanho
    if (currentChunk.length >= chunkSize) {
      await onChunk(currentChunk, chunkIndex, totalRows);
      totalRecords += currentChunk.length;
      chunkIndex++;
      currentChunk = [];
      
      // Log de progresso a cada 5 chunks
      if (chunkIndex % 5 === 0) {
        const elapsed = Date.now() - startTime;
        const percent = Math.round((rowNum / range.e.r) * 100);
        console.log(`[Parser Unimed] ${percent}% - ${totalRecords} registros em ${elapsed}ms (linha ${rowNum}/${range.e.r})`);
      }
    }
  }
  
  // Processar último chunk
  if (currentChunk.length > 0) {
    await onChunk(currentChunk, chunkIndex, totalRows);
    totalRecords += currentChunk.length;
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`[Parser Unimed] Concluído: ${totalRecords} registros em ${chunkIndex + 1} chunks (${elapsed}ms total)`);
  
  return { totalRows, totalRecords };
}

/**
 * Detecta se um buffer Excel é formato Unimed (leitura rápida apenas do cabeçalho)
 */
export function detectUnimedFormat(buffer: Buffer): boolean {
  try {
    // Ler apenas a primeira sheet com range limitado (apenas cabeçalho)
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
