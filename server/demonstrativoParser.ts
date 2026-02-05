import * as XLSX from 'xlsx';
import type { InsertDemonstrativo } from '../drizzle/schema';

/**
 * Mapeamento de colunas do Excel para campos da tabela demonstrativo
 */
const EXCEL_COLUMN_MAPPING: Record<string, keyof InsertDemonstrativo> = {
  // Identificação
  'Número Guia': 'numeroGuia',
  'Protocolo TISS': 'protocolo',
  'Lote Prestador': 'lotePrestador',
  'Data Pagto Processado': 'dataPagamento',
  'Data Pagto': 'dataPagamento',
  
  // Beneficiário
  'Beneficiário': 'carteiraBeneficiario',
  'Nome Beneficiário': 'nomeBeneficiario',
  
  // Detalhes do Item
  'Seq': 'sequencialItem',
  'Item': 'codigoItem',
  'Item Desc': 'descricaoItem',
  'Data Execução': 'dataExecucao',
  'Quantidade': 'quantidade',
  
  // Valores
  'Valor Pagamento': 'valorPago',
  'Pagamento': 'valorPago',
  
  // Status
  'Erro TISS': 'erroTiss',
  'Situação Item': 'situacaoItem',
  'Situacao Item': 'situacaoItem',
  'Tipo Lançamento': 'tipoLancamento',
  'Tipo Lancamento': 'tipoLancamento',
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
  
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d);
    }
  }
  
  if (typeof value === 'string') {
    const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));
    }
    
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }
    
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
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

// Campos de data
const DATE_FIELDS: (keyof InsertDemonstrativo)[] = [
  'dataPagamento',
  'dataExecucao',
];

// Campos decimais
const DECIMAL_FIELDS: (keyof InsertDemonstrativo)[] = [
  'valorInformado',
  'valorPago',
  'valorGlosa',
  'quantidade',
];

// Campos inteiros
const INTEGER_FIELDS: (keyof InsertDemonstrativo)[] = [
  'sequencialItem',
];

/**
 * Parseia um arquivo Excel e retorna registros para tabela demonstrativo
 */
export function parseExcelToDemonstrativo(
  buffer: Buffer,
  arquivoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date
): InsertDemonstrativo[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false,
  });
  
  if (rows.length > 0) {
    console.log('[DemonstrativoParser] Colunas encontradas:', Object.keys(rows[0]).join(', '));
  }
  
  const records: InsertDemonstrativo[] = [];
  
  for (const row of rows) {
    const hasData = row['Número Guia'] || row['Beneficiário'] || row['Item'];
    if (!hasData) continue;
    
    const record: InsertDemonstrativo = {
      arquivoId,
      origemTipo: 'excel',
      convenioId,
      dataReferencia,
    };
    
    // Mapear colunas
    for (const [excelCol, dbField] of Object.entries(EXCEL_COLUMN_MAPPING)) {
      const value = row[excelCol];
      if (value === undefined || value === null || value === '') continue;
      
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
        const strValue = parseString(value);
        if (strValue) {
          (record as any)[dbField] = strValue;
        }
      }
    }
    
    // Usar dataPagamento do upload se não veio do Excel
    if (!record.dataPagamento && dataPagamento) {
      record.dataPagamento = dataPagamento;
    }
    
    records.push(record);
  }
  
  console.log('[DemonstrativoParser] Total de registros:', records.length);
  if (records.length > 0) {
    console.log('[DemonstrativoParser] Primeiro registro:', JSON.stringify(records[0], null, 2));
  }
  
  return records;
}

/**
 * Parseia XML de retorno TISS e retorna registros para tabela demonstrativo
 */
export function parseXmlToDemonstrativo(
  items: any[],
  arquivoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date
): InsertDemonstrativo[] {
  const records: InsertDemonstrativo[] = [];
  
  for (const item of items) {
    const record: InsertDemonstrativo = {
      arquivoId,
      origemTipo: 'xml',
      convenioId,
      dataReferencia,
      dataPagamento,
      
      // Mapeamento de campos do XML
      numeroGuia: item.numeroGuiaPrestador || item.numero_guia_prestador,
      protocolo: item.numeroProtocolo || item.numero_protocolo,
      lotePrestador: item.numeroLotePrestador || item.numero_lote_prestador,
      
      carteiraBeneficiario: item.numeroCarteira || item.numero_carteira,
      nomeBeneficiario: item.nomeBeneficiario || item.nome_beneficiario,
      
      sequencialItem: item.sequencialItem ? parseInt(item.sequencialItem) : null,
      codigoItem: item.codigoItem || item.codigo_item,
      descricaoItem: item.descricaoItem || item.descricao_item,
      dataExecucao: item.dataRealizacao ? new Date(item.dataRealizacao) : null,
      quantidade: item.quantidadeExecutada || item.quantidade_executada,
      
      valorInformado: item.valorInformado || item.valor_informado,
      valorPago: item.valorLiberado || item.valor_liberado,
      valorGlosa: item.valorGlosado || item.valor_glosado,
      
      codigoGlosa: item.codigoGlosa || item.codigo_glosa,
      situacaoItem: item.situacaoGuia || item.situacao_guia,
    };
    
    records.push(record);
  }
  
  console.log('[DemonstrativoParser XML] Total de registros:', records.length);
  
  return records;
}
