import * as XLSX from 'xlsx';
import type { InsertRecebimentoExcel } from '../drizzle/schema';

/**
 * Mapeamento de colunas do Excel para campos da tabela recebimentos_excel
 * Chave: Nome exato da coluna no Excel (case-sensitive)
 * Valor: Nome do campo na tabela (camelCase)
 */
const COLUMN_MAPPING: Record<string, keyof InsertRecebimentoExcel> = {
  // Demonstrativo e Data
  'Demonstrativo': 'processado', // Usado como referência
  'Data Pagto Processado': 'dataPagto',
  'Data Pagto': 'dataPagto',
  'Processado': 'processado',
  
  // Protocolo e Lote
  'Protocolo TISS': 'protocoloTiss',
  'Lote Prestador': 'lotePrestador',
  
  // Prestador Pagamento
  'Código Prestador Pagamento': 'codigoPrestadorPagamento',
  'Nome Prestador Pagamento': 'nomePrestadorPagamento',
  
  // Guia
  'Número Guia': 'numeroGuia',
  'GUIA': 'numeroGuia', // Formato Vivacom
  'Seq': 'seq',
  
  // Beneficiário
  'Beneficiário': 'beneficiario',
  // 'ASSOCIADO': 'beneficiario', // NÃO MAPEAR - ASSOCIADO é o nome do paciente, não a carteirinha
  'Nome Beneficiário': 'nomeBeneficiario',
  'ASSOCIADO': 'nomeBeneficiario', // Formato Vivacom - ASSOCIADO é o nome do paciente
  
  // Execução
  'Data Execução': 'dataExecucao',
  'DATA ATENDIMENTO': 'dataExecucao', // Formato Vivacom
  'Hora Execução': 'horaExecucao',
  
  // Item
  'Item': 'item',
  'CODIGO': 'item', // Formato Vivacom
  'Item Desc': 'itemDesc',
  'PROCEDIMENTO': 'itemDesc', // Formato Vivacom
  'Quantidade': 'quantidade',
  'Valor Pagamento': 'valorPagamento',
  'VALOR PAGO': 'valorPagamento', // Formato Vivacom
  'Pagamento': 'valorPagamento',
  
  // Tipo e Status - CAMPOS IMPORTANTES
  'Tipo Lançamento': 'tipoLancamento',
  'Tipo Lancamento': 'tipoLancamento',
  'Erro TISS': 'erroTiss',
  'COD. GLOSA': 'codigoGlosa', // Formato Vivacom - CORRIGIDO: era erroTiss
  'Situação Item': 'situacaoItem',
  'Situacao Item': 'situacaoItem',
  
  // Solicitante
  'Código Solicitante': 'codigoSolicitante',
  'Nome Solicitante': 'nomeSolicitante',
  'PROFISSIONAL EXECUTANTE': 'nomePrestador', // Formato Vivacom
  
  // Internação
  'Acomodação da Internação': 'acomodacaoInternacao',
  'Acomodacao da Internacao': 'acomodacaoInternacao',
  'Data Inicio Faturamento Internação': 'dataInicioFaturamentoInternacao',
  'Data Inicio Faturamento Internacao': 'dataInicioFaturamentoInternacao',
  'Data Fim Faturamento Internação': 'dataFimFaturamentoInternacao',
  'Data Fim Faturamento Internacao': 'dataFimFaturamentoInternacao',
  
  // Prestador
  'Código Prestador': 'codigoPrestador',
  'Nome Prestador': 'nomePrestador',
  'Prestador Executante': 'prestadorExecutante',
  'Nome Prestador Executante': 'nomePrestadorExecutante',
  
  // Valores Vivacom
  'VALOR PROCESSADO': 'processado', // Formato Vivacom
  'VALOR GLOSA': 'valorGlosa', // Formato Vivacom
  'VALOR INFORMADO': 'valorInformado', // Formato Vivacom
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

// Campos que são datas
const DATE_FIELDS: (keyof InsertRecebimentoExcel)[] = [
  'dataPagto',
  'dataExecucao',
  'dataInicioFaturamentoInternacao',
  'dataFimFaturamentoInternacao',
];

// Campos que são números decimais (armazenados como string)
const DECIMAL_FIELDS: (keyof InsertRecebimentoExcel)[] = [
  'processado',
  'valorPagamento',
  'valorGlosa',
  'valorInformado',
];

// Campos que são inteiros
const INTEGER_FIELDS: (keyof InsertRecebimentoExcel)[] = [
  'seq',
  'quantidade',
];

/**
 * Extrai um registro de recebimento de uma linha do Excel
 */
export function extractRecebimentoExcelFromRow(
  row: Record<string, unknown>,
  arquivoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date,
  estabelecimentoId?: number
): InsertRecebimentoExcel {
  const record: InsertRecebimentoExcel = {
    arquivoId,
    convenioId,
    dataReferencia,
    dataPagamentoUpload: dataPagamento,
    estabelecimentoId,
  };
  
  // Mapear cada coluna do Excel para o campo correspondente
  for (const [excelCol, dbField] of Object.entries(COLUMN_MAPPING)) {
    const value = row[excelCol];
    if (value === undefined || value === null || value === '') continue;
    
    // Converter valor baseado no tipo do campo
    if (DATE_FIELDS.includes(dbField)) {
      const dateValue = parseDate(value);
      if (dateValue) {
        (record as any)[dbField] = dateValue;
      }
    } else if (DECIMAL_FIELDS.includes(dbField)) {
      const numValue = parseNumber(value);
      if (numValue !== null) {
        (record as any)[dbField] = String(numValue);
      }
    } else if (INTEGER_FIELDS.includes(dbField)) {
      const intValue = parseInt2(value);
      if (intValue !== null) {
        (record as any)[dbField] = intValue;
      }
    } else {
      // Campos de texto
      const strValue = parseString(value);
      if (strValue) {
        (record as any)[dbField] = strValue;
      }
    }
  }
  
  // Log para debug dos campos importantes
  // console.log('[Parser] tipoLancamento:', record.tipoLancamento);
  // console.log('[Parser] erroTiss:', record.erroTiss);
  // console.log('[Parser] situacaoItem:', record.situacaoItem);
  
  // CORREÇÃO VIVACOM: Se situacaoItem não foi preenchido, calcular baseado em VALOR GLOSA
  if (!record.situacaoItem) {
    const valorGlosaNum = parseNumber(record.valorGlosa);
    const valorPagamentoNum = parseNumber(record.valorPagamento);
    
    // Se tem valor de glosa > 0, marcar como GLOSADO
    if (valorGlosaNum && valorGlosaNum > 0) {
      record.situacaoItem = 'GLOSADO';
    }
    // Se valor pago é 0 e não tem glosa, pode ser não pago
    else if (valorPagamentoNum === 0) {
      record.situacaoItem = 'NAO_PAGO';
    }
    // Caso contrário, marcar como PAGO
    else {
      record.situacaoItem = 'PAGO';
    }
  }
  
  // CORREÇÃO VIVACOM: Quando valor_informado = 0, considerar como GLOSADO
  const valorInformadoNum = parseNumber(record.valorInformado);
  if (valorInformadoNum === 0) {
    const valorPagamentoNum = parseNumber(record.valorPagamento);
    if (valorPagamentoNum && valorPagamentoNum > 0) {
      record.valorGlosa = record.valorPagamento;
      record.valorPagamento = '0.00';
      record.situacaoItem = 'GLOSADO';
    }
  }
  
  return record;
}

/**
 * Parseia um arquivo Excel e retorna os registros para inserção
 */
export function parseExcelRecebimentosExcel(
  buffer: Buffer,
  arquivoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date,
  estabelecimentoId?: number
): InsertRecebimentoExcel[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON com cabeçalhos - IMPORTANTE: raw: false para manter strings
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false,
  });
  
  // Log das colunas encontradas para debug
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    console.log('[Parser] Colunas encontradas no Excel:', cols.join(', '));
    
    // Verificar se os campos importantes estão presentes
    const hastipoLancamento = cols.some(c => c.includes('Tipo Lan'));
    const hasErroTiss = cols.some(c => c.includes('Erro TISS'));
    const hasSituacaoItem = cols.some(c => c.includes('Situa'));
    console.log('[Parser] Campos importantes - tipoLancamento:', hastipoLancamento, 'erroTiss:', hasErroTiss, 'situacaoItem:', hasSituacaoItem);
  }
  
  const records: InsertRecebimentoExcel[] = [];
  
  for (const row of rows) {
    // Verificar se a linha tem dados relevantes (pelo menos número da guia ou beneficiário)
    // Suportar múltiplos formatos: padrão e Vivacom
    const hasData = row['Número Guia'] || row['Beneficiário'] || row['Item'] || 
                    row['GUIA'] || row['ASSOCIADO'] || row['CODIGO'];
    if (!hasData) continue;
    
    const record = extractRecebimentoExcelFromRow(row, arquivoId, convenioId, dataReferencia, dataPagamento, estabelecimentoId);
    records.push(record);
  }
  
  // Log do primeiro registro para verificar campos
  if (records.length > 0) {
    console.log('[Parser] Primeiro registro - tipoLancamento:', records[0].tipoLancamento);
    console.log('[Parser] Primeiro registro - erroTiss:', records[0].erroTiss);
    console.log('[Parser] Primeiro registro - situacaoItem:', records[0].situacaoItem);
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
