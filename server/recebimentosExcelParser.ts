import * as XLSX from 'xlsx';
import type { InsertRecebimentoExcel } from '../drizzle/schema';

/**
 * Mapeamento de colunas do Excel para campos da tabela recebimentos_excel
 * Chave: Nome exato da coluna no Excel
 * Valor: Nome do campo na tabela
 */
const COLUMN_MAPPING: Record<string, keyof InsertRecebimentoExcel> = {
  // Data e valores
  'Data Pagto': 'dataPagto',
  'Processado': 'processado',
  
  // Protocolo e Lote
  'Protocolo TISS': 'protocoloTiss',
  'Lote Prestador': 'lotePrestador',
  
  // Prestador Pagamento
  'Código Prestador': 'codigoPrestadorPagamento',
  'Código Prestador Pagamento': 'codigoPrestadorPagamento',
  'Nome Prestador': 'nomePrestadorPagamento',
  'Nome Prestador Pagamento': 'nomePrestadorPagamento',
  'Pagamento': 'valorPagamento',
  
  // Guia
  'Número Guia': 'numeroGuia',
  'Seq': 'seq',
  
  // Beneficiário
  'Beneficiário': 'beneficiario',
  'Nome Beneficiário': 'nomeBeneficiario',
  
  // Execução
  'Data Execução': 'dataExecucao',
  'Hora Execução': 'horaExecucao',
  
  // Item
  'Item': 'item',
  'Item Desc': 'itemDesc',
  'Quantidade': 'quantidade',
  'Valor Pagamento': 'valorPagamento',
  
  // Tipo e Status
  'Tipo Lançamento': 'tipoLancamento',
  'Erro TISS': 'erroTiss',
  'Situação Item': 'situacaoItem',
  
  // Solicitante
  'Código Solicitante': 'codigoSolicitante',
  'Nome Solicitante': 'nomeSolicitante',
  
  // Internação
  'Acomodação da Internação': 'acomodacaoInternacao',
  'Data Inicio Faturamento Internação': 'dataInicioFaturamentoInternacao',
  'Data Fim Faturamento Internação': 'dataFimFaturamentoInternacao',
  
  // Prestador Executante
  'Código Prestador Executante': 'codigoPrestador',
  'Nome Prestador Executante': 'nomePrestadorExecutante',
  'Prestador Executante': 'prestadorExecutante',
};

/**
 * Converte valor do Excel para número
 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[R$\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Converte valor do Excel para data
 */
function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  
  // Se for número (serial date do Excel)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0);
    }
  }
  
  // Se for string
  if (typeof value === 'string') {
    // Formato DD/MM/YYYY
    const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));
    }
    
    // Formato YYYY-MM-DD
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }
    
    // Tentar parse genérico
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Se for Date
  if (value instanceof Date) {
    return value;
  }
  
  return null;
}

/**
 * Converte valor do Excel para string
 */
function parseString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
}

/**
 * Converte valor do Excel para inteiro
 */
function parseInt2(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Math.round(value);
  const num = parseInt(String(value), 10);
  return isNaN(num) ? null : num;
}

/**
 * Extrai um registro de recebimento de uma linha do Excel
 */
export function extractRecebimentoExcelFromRow(
  row: Record<string, unknown>,
  arquivoId: number
): InsertRecebimentoExcel {
  const record: InsertRecebimentoExcel = {
    arquivoId,
  };
  
  // Mapear cada coluna do Excel para o campo correspondente
  for (const [excelCol, dbField] of Object.entries(COLUMN_MAPPING)) {
    const value = row[excelCol];
    if (value === undefined || value === null || value === '') continue;
    
    // Converter valor baseado no tipo do campo
    switch (dbField) {
      // Campos de data
      case 'dataPagto':
      case 'dataExecucao':
      case 'dataInicioFaturamentoInternacao':
      case 'dataFimFaturamentoInternacao':
        const dateValue = parseDate(value);
        if (dateValue) {
          (record as any)[dbField] = dateValue;
        }
        break;
      
      // Campos numéricos decimais
      case 'processado':
      case 'valorPagamento':
        const numValue = parseNumber(value);
        if (numValue !== null) {
          (record as any)[dbField] = String(numValue);
        }
        break;
      
      // Campos inteiros
      case 'seq':
      case 'quantidade':
        const intValue = parseInt2(value);
        if (intValue !== null) {
          (record as any)[dbField] = intValue;
        }
        break;
      
      // Campos de texto
      default:
        const strValue = parseString(value);
        if (strValue) {
          (record as any)[dbField] = strValue;
        }
        break;
    }
  }
  
  return record;
}

/**
 * Parseia um arquivo Excel e retorna os registros para inserção
 */
export function parseExcelRecebimentosExcel(
  buffer: Buffer,
  arquivoId: number
): InsertRecebimentoExcel[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON com cabeçalhos
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false,
  });
  
  const records: InsertRecebimentoExcel[] = [];
  
  for (const row of rows) {
    // Verificar se a linha tem dados relevantes (pelo menos número da guia ou beneficiário)
    const hasData = row['Número Guia'] || row['Beneficiário'] || row['Item'];
    if (!hasData) continue;
    
    const record = extractRecebimentoExcelFromRow(row, arquivoId);
    records.push(record);
  }
  
  return records;
}

/**
 * Retorna as colunas encontradas no Excel
 */
export function getExcelColumns(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    range: 0,
  });
  
  if (rows.length === 0) return [];
  
  return Object.keys(rows[0]);
}
