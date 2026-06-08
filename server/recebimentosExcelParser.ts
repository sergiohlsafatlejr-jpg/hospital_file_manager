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
  'Guia operadora/Senha': 'numeroGuia', // Bradesco
  'Seq': 'seq',
  'Doc Original': 'seq', // Bradesco
  
  
  // Beneficiário
  'Beneficiário': 'beneficiario',
  // 'ASSOCIADO': 'beneficiario', // NÃO MAPEAR - ASSOCIADO é o nome do paciente, não a carteirinha
  'Nome Beneficiário': 'nomeBeneficiario',
  'ASSOCIADO': 'nomeBeneficiario', // Formato Vivacom - ASSOCIADO é o nome do paciente
  'Nome': 'nomeBeneficiario', // Bradesco
  
  // Execução
  'Data Execução': 'dataExecucao',
  'DATA ATENDIMENTO': 'dataExecucao', // Formato Vivacom
  'Hora Execução': 'horaExecucao',
  'Data do Evento': 'dataExecucao', // Bradesco
  
  // Item
  'Item': 'item',
  'CODIGO': 'item', // Formato Vivacom
  'Item Desc': 'itemDesc',
  'PROCEDIMENTO': 'itemDesc', // Formato Vivacom
  'Código do Procedimento': 'item', // Bradesco
  'CÃ³digo do Procedimento': 'item', // Bradesco (erro de encoding)
  'Descrição do Procedimento': 'itemDesc', // Bradesco
  'DescriÃ§Ã£o do Procedimento': 'itemDesc', // Bradesco (erro de encoding)
  'Quantidade': 'quantidade',
  'Valor Pagamento': 'valorPagamento',
  'VALOR PAGO': 'valorPagamento', // Formato Vivacom
  'Pagamento': 'valorPagamento',
  'Valor (R$)': 'valorPagamento', // Bradesco
  'Quantidade Liberada': 'quantidade', // Bradesco
  
  // Tipo e Status - CAMPOS IMPORTANTES
  'Tipo Lançamento': 'tipoLancamento',
  'Tipo Lancamento': 'tipoLancamento',
  'Erro TISS': 'erroTiss',
  'COD. GLOSA': 'codigoGlosa', // Formato Vivacom - CORRIGIDO: era erroTiss
  'Situação Item': 'situacaoItem',
  'Situacao Item': 'situacaoItem',
  'Justificativa': 'erroTiss', // Bradesco
  
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
  
  // Formato IPASGO
  'FATURA': 'protocoloTiss', // IPASGO
  'PAGAMENTO': 'dataPagto', // IPASGO
  'CODIGO_PRESTADOR_PAGAMENTO': 'codigoPrestadorPagamento', // IPASGO
  'NOME_PRESTADOR_PAGAMENTO': 'nomePrestadorPagamento', // IPASGO
  // COMPETENCIA: data de referência (preenchida no upload, não mapeada aqui)
  'ENTREGA': 'dataInicioFaturamentoInternacao', // IPASGO - data de entrega
  'PROTOCOLO': 'protocoloTiss', // IPASGO/GEAP
  'LOTE': 'lotePrestador', // IPASGO
  // CODIGO_PRESTADOR_XML: mesmo que CODIGO_PRESTADOR_EXECUTANTE, não duplicar
  // NOME_PRESTADOR_XML: mesmo que NOME_PRESTADOR_EXECUTANTE, não duplicar
  'NUMERO_GUIA_OPERADORA': 'numeroGuia', // IPASGO
  'SENHA': 'horaExecucao', // IPASGO - senha da guia (armazena no campo horaExecucao como referência)
  'CARTEIRA_BENEFICIARIO': 'beneficiario', // IPASGO
  'NOME_BENEFICIARIO': 'nomeBeneficiario', // IPASGO
  'REALIZACAO': 'dataExecucao', // IPASGO
  'CODIGO_PROCEDIMENTO': 'item', // IPASGO
  'DESCRICAO_PROCEDIMENTO': 'itemDesc', // IPASGO
  // GRAU_PARTICIPACAO: não mapeado (campo específico IPASGO sem correspondência direta)
  'TIPO_GUIA': 'acomodacaoInternacao', // IPASGO - tipo de guia (SP/SADT, Internação, etc.)
  'QUANTIDADE': 'quantidade', // IPASGO (já mapeado por nome idêntico)
  'VALOR_UNITARIO': 'valorInformado', // IPASGO - valor unitário cobrado
  'VALOR_GLOSADO': 'valorGlosa', // IPASGO
  'VALOR_TOTAL_PAGAMENTO': 'valorPagamento', // IPASGO
  'JUSTIFICATIVA_GLOSA': 'codigoGlosa', // IPASGO
  'OBSERVACAO_GLOSA': 'erroTiss', // IPASGO
  'SITUACAO': 'situacaoItem', // IPASGO (PAGO/GLOSADO)
  'CODIGO_PROFISSIONAL_SOLICITANTE': 'codigoSolicitante', // IPASGO
  'NOME_PROFISSIONAL_SOLICITANTE': 'nomeSolicitante', // IPASGO
  'CODIGO_LOCAL_REALIZACAO': 'prestadorExecutante', // IPASGO
  'NOME_LOCAL_REALIZACAO': 'nomePrestadorExecutante', // IPASGO
  'CODIGO_PRESTADOR_EXECUTANTE': 'codigoPrestador', // IPASGO
  'NOME_PRESTADOR_EXECUTANTE': 'nomePrestadorExecutante', // IPASGO
  'COD_FAT': 'processado', // IPASGO - código da fatura
  'TIPO_LANCAMENTO': 'tipoLancamento', // IPASGO (CRÉDITO/DÉBITO)

  // Formato GEAP
  'Data Entrega': 'dataPagto', // GEAP
  'Protocolo': 'protocoloTiss', // GEAP
  'Protocolo TMS/Lote': 'lotePrestador', // GEAP
  'Nªguia': 'numeroGuia', // GEAP
  'Nº Guia': 'numeroGuia', // GEAP
  'Seq. Cliente': 'seq', // GEAP
  'N Carteira Cliente': 'beneficiario', // GEAP
  'Cliente': 'nomeBeneficiario', // GEAP
  'Data de Atendimento': 'dataExecucao', // GEAP
  'Nº Serviço': 'item', // GEAP
  'Serviço': 'itemDesc', // GEAP
  'Valor Calculado Item': 'valorPagamento', // GEAP
  'Descrição Tipo Guia': 'tipoLancamento', // GEAP
  'Justificativa Padrão': 'erroTiss', // GEAP
  'Existe Glosa': 'situacaoItem', // GEAP - será convertido de boolean para string
  'Tipo Guia': 'acomodacaoInternacao', // GEAP
  'Data Baixa': 'dataInicioFaturamentoInternacao', // GEAP
  'Guia Contratado': 'codigoPrestador', // GEAP - armazenar no campo codigoPrestador
  'Valor Glosado Item': 'valorGlosa', // GEAP
  // 'Justificativa': 'codigoGlosa', // GEAP (Removido pois já está mapeado para erroTiss acima)
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

// Campos que são booleanos (GEAP)
const BOOLEAN_FIELDS: (keyof InsertRecebimentoExcel)[] = [
  'situacaoItem', // GEAP usa boolean para "Existe Glosa"
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
    } else if (BOOLEAN_FIELDS.includes(dbField)) {
      // Campos booleanos (GEAP)
      if (typeof value === 'boolean') {
        // GEAP: "Existe Glosa" = false significa PAGO, true significa GLOSADO
        (record as any)[dbField] = value ? 'GLOSADO' : 'PAGO';
      } else if (typeof value === 'string') {
        // Se for string, converter para boolean
        const boolValue = value.toLowerCase() === 'true' || value === '1';
        (record as any)[dbField] = boolValue ? 'GLOSADO' : 'PAGO';
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
  
  // CORREÇÃO GERAL: Quando situacaoItem = "PAGO" (ou vazio) mas erroTiss está preenchido,
  // significa que o convênio glosou o item (total ou parcialmente).
  if (record.erroTiss && record.erroTiss.trim() !== '' && 
      (!record.situacaoItem || record.situacaoItem === 'PAGO' || record.situacaoItem === 'NAO_PAGO')) {
    const valorPagoNum = parseNumber(record.valorPagamento);
    
    // Extrair código de glosa do campo erroTiss (ex: "1702-COBRANÇA DE..." ou "1407 SERVICO..." -> "1702" ou "1407")
    if (!record.codigoGlosa) {
      const codigoMatch = record.erroTiss.match(/^(\d{3,4})/);
      if (codigoMatch) {
        record.codigoGlosa = codigoMatch[1];
      }
    }
    
    if (valorPagoNum === 0 || valorPagoNum === null) {
      // Glosa total: valor pago = 0
      record.situacaoItem = 'GLOSADO';
    } else {
      // Glosa parcial: convênio pagou algo, mas houve glosa
      record.situacaoItem = 'GLOSADO';
    }
  }
  
  // CORREÇÃO IPASGO: Calcular valorInformado como VALOR_UNITARIO × QUANTIDADE
  // O IPASGO mapeia VALOR_UNITARIO para valorInformado, mas o valor cobrado real
  // é VALOR_UNITARIO × QUANTIDADE. Corrigir quando quantidade > 1.
  if (record.quantidade && record.quantidade > 1) {
    const valorUnitarioNum = parseNumber(record.valorInformado);
    if (valorUnitarioNum !== null && valorUnitarioNum > 0) {
      const valorTotal = valorUnitarioNum * record.quantidade;
      record.valorInformado = String(valorTotal);
    }
  }
  
  // CORREÇÃO IPASGO: Quando SITUACAO = "PAGO" mas VALOR_GLOSADO > 0,
  // o item foi glosado (total ou parcialmente). O IPASGO marca tudo como "PAGO"
  // mesmo quando há glosa. A situação real deve ser determinada pelo valor de glosa.
  if (record.situacaoItem === 'PAGO') {
    const valorGlosaNum = parseNumber(record.valorGlosa);
    const valorPagoNum = parseNumber(record.valorPagamento);
    
    if (valorGlosaNum && valorGlosaNum > 0) {
      if (valorPagoNum === 0 || valorPagoNum === null) {
        // Glosa total: valor pago = 0, valor glosa > 0
        record.situacaoItem = 'GLOSADO';
      } else {
        // Glosa parcial: valor pago > 0 e valor glosa > 0
        record.situacaoItem = 'GLOSADO';
      }
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
  
  let headerRowIdx = 0;
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Detecção dinâmica de cabeçalho: procurar linha com mais colunas mapeadas
  for (let r = 0; r < Math.min(15, range.e.r + 1); r++) {
    let matches = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const val = worksheet[cellRef]?.v;
      if (val && typeof val === 'string') {
        const trimmed = val.trim();
        if (COLUMN_MAPPING[trimmed] || trimmed === 'Data do Evento' || trimmed === 'Item') {
          matches++;
        }
      }
    }
    // Se achou pelo menos 3 colunas válidas, assume que é o cabeçalho
    if (matches >= 3) {
      headerRowIdx = r;
      break;
    }
  }
  
  console.log('[Parser] Cabeçalho detectado na linha:', headerRowIdx + 1);
  
  const headers: string[] = [];
  // Extrair cabeçalhos da linha detectada
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: col });
    const cell = worksheet[cellRef];
    headers.push(cell?.v ? String(cell.v).trim() : `__EMPTY_${col}`);
  }
  
  let rows: Record<string, unknown>[] = [];
  
  // Extrair dados a partir da linha seguinte ao cabeçalho
  for (let row = headerRowIdx + 1; row <= range.e.r; row++) {
    const rowData: Record<string, unknown> = {};
    let hasData = false;
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellRef];
      const value = cell?.w || cell?.v || null;
      rowData[headers[col]] = value;
      if (value) hasData = true;
    }
    
    if (hasData) rows.push(rowData);
  }
  
  // Log das colunas encontradas para debug
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    console.log('[Parser] Colunas encontradas no Excel:', cols.join(', '));
    
    // Verificar se os campos importantes estão presentes
    const hastipoLancamento = cols.some(c => c.includes('Tipo Lan'));
    const hasErroTiss = cols.some(c => c.includes('Erro TISS') || c.includes('Justificativa'));
    const hasSituacaoItem = cols.some(c => c.includes('Situa') || c.includes('Existe'));
    console.log('[Parser] Campos importantes - tipoLancamento:', hastipoLancamento, 'erroTiss:', hasErroTiss, 'situacaoItem:', hasSituacaoItem);
  }
  
  const records: InsertRecebimentoExcel[] = [];
  
  let lastNomeBeneficiario: string | null = null;
  let lastDataExecucao: Date | null = null;
  let lastNumeroGuia: string | null = null;
  let lastProtocoloTiss: string | null = null;
  let lastSeq: number | null = null;
  
  for (const row of rows) {
    // Verificar se a linha tem dados relevantes
    const hasData = row['Número Guia'] || row['Beneficiário'] || row['Item'] || 
                    row['GUIA'] || row['ASSOCIADO'] || row['CODIGO'] ||
                    row['Nº Guia'] || row['Cliente'] || row['Nº Serviço'] ||
                    row['NUMERO_GUIA_OPERADORA'] || row['NOME_BENEFICIARIO'] || row['CODIGO_PROCEDIMENTO'] ||
                    row['Nome'] || row['Código do Procedimento'] || row['CÃ³digo do Procedimento'] || 
                    row['Guia operadora/Senha'] || row['Valor (R$)'];
    if (!hasData) continue;
    
    const record = extractRecebimentoExcelFromRow(row, arquivoId, convenioId, dataReferencia, dataPagamento, estabelecimentoId);
    
    // Carry-over logic
    if (record.nomeBeneficiario) lastNomeBeneficiario = record.nomeBeneficiario;
    else if (lastNomeBeneficiario && record.item) record.nomeBeneficiario = lastNomeBeneficiario;
    
    if (record.dataExecucao) lastDataExecucao = record.dataExecucao;
    else if (lastDataExecucao && record.item) record.dataExecucao = lastDataExecucao;
    
    if (record.numeroGuia) lastNumeroGuia = record.numeroGuia;
    else if (lastNumeroGuia && record.item) record.numeroGuia = lastNumeroGuia;
    
    if (record.protocoloTiss) lastProtocoloTiss = record.protocoloTiss;
    else if (lastProtocoloTiss && record.item) record.protocoloTiss = lastProtocoloTiss;
    
    if (record.seq) lastSeq = record.seq;
    else if (lastSeq && record.item) record.seq = lastSeq;
    
    if (record.item || record.valorPagamento) {
      records.push(record);
    }
  }
  
  // Log do primeiro registro para verificar campos
  if (records.length > 0) {
    console.log('[Parser] Primeiro registro - tipoLancamento:', records[0].tipoLancamento);
    console.log('[Parser] Primeiro registro - erroTiss:', records[0].erroTiss);
    console.log('[Parser] Primeiro registro - situacaoItem:', records[0].situacaoItem);
    console.log('[Parser] Primeiro registro - valorGlosa:', records[0].valorGlosa);
  }
  
  return records;
}

/**
 * Parseia um arquivo Excel GRANDE usando exceljs streaming para reduzir consumo de memória.
 * Processa linha por linha sem carregar o workbook inteiro na memória.
 */
export async function parseExcelRecebimentosExcelChunked(
  buffer: Buffer,
  arquivoId: number,
  convenioId: number | undefined,
  dataReferencia: Date | undefined,
  dataPagamento: Date | undefined,
  estabelecimentoId: number | undefined,
  chunkSize: number,
  onChunk: (records: InsertRecebimentoExcel[], chunkIndex: number, totalRows: number) => Promise<void>
): Promise<{ totalRows: number; totalRecords: number }> {
  const ExcelJS = await import('exceljs');
  const { Readable } = await import('stream');
  
  // Usar workbook streaming do exceljs para baixo consumo de memória
  const workbook = new ExcelJS.default.Workbook();
  
  // Converter buffer para stream para leitura
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  
  console.log(`[Parser Chunked ExcelJS] Iniciando leitura streaming do arquivo (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
  
  await workbook.xlsx.read(stream);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    console.error('[Parser Chunked ExcelJS] Nenhuma planilha encontrada');
    return { totalRows: 0, totalRecords: 0 };
  }
  
  const totalRowCount = worksheet.rowCount;
  console.log(`[Parser Chunked ExcelJS] Planilha: ${worksheet.name}, ${totalRowCount} linhas`);
  
  // Detecção dinâmica de cabeçalho (primeiras 15 linhas)
  let headerRowIdx = 0;
  const headers: string[] = [];
  
  for (let r = 1; r <= Math.min(15, totalRowCount); r++) {
    const row = worksheet.getRow(r);
    let matches = 0;
    
    row.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.text?.trim();
      if (val && (COLUMN_MAPPING[val] || val === 'Data do Evento' || val === 'Item')) {
        matches++;
      }
    });
    
    if (matches >= 3) {
      headerRowIdx = r;
      // Extrair cabeçalhos desta linha
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (headers.length < colNumber - 1) headers.push(`__EMPTY_${headers.length}`);
        headers.push(cell.text?.trim() || `__EMPTY_${colNumber}`);
      });
      break;
    }
  }
  
  if (headerRowIdx === 0) {
    // Fallback: usar primeira linha como cabeçalho
    headerRowIdx = 1;
    const row = worksheet.getRow(1);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (headers.length < colNumber - 1) headers.push(`__EMPTY_${headers.length}`);
      headers.push(cell.text?.trim() || `__EMPTY_${colNumber}`);
    });
  }
  
  const totalRows = totalRowCount - headerRowIdx;
  const dataStartRow = headerRowIdx + 1;
  
  console.log(`[Parser Chunked ExcelJS] Cabeçalho na linha ${headerRowIdx}, ${totalRows} linhas de dados, chunks de ${chunkSize}`);
  console.log('[Parser Chunked ExcelJS] Colunas:', headers.slice(0, 20).join(', '));
  
  let lastNomeBeneficiario: string | null = null;
  let lastDataExecucao: Date | null = null;
  let lastNumeroGuia: string | null = null;
  let lastProtocoloTiss: string | null = null;
  let lastSeq: number | null = null;
  
  let totalRecords = 0;
  let chunkIndex = 0;
  let currentChunk: InsertRecebimentoExcel[] = [];
  
  // Processar linhas de dados
  for (let rowNum = dataStartRow; rowNum <= totalRowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const rowData: Record<string, unknown> = {};
    let hasData = false;
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colIdx = colNumber - 1;
      if (colIdx < headers.length) {
        // Extrair valor: preferir texto formatado, senão valor raw
        let value: unknown = null;
        if (cell.type === ExcelJS.default.ValueType.Date) {
          value = cell.value; // Manter como Date
        } else if (cell.type === ExcelJS.default.ValueType.Number) {
          value = cell.value;
        } else if (cell.text && cell.text.trim() !== '') {
          value = cell.text.trim();
        } else if (cell.value !== null && cell.value !== undefined) {
          value = cell.value;
        }
        
        if (value !== null && value !== undefined) {
          rowData[headers[colIdx]] = value;
          hasData = true;
        }
      }
    });
    
    if (hasData) {
      const hasValidData = rowData['Número Guia'] || rowData['Beneficiário'] || rowData['Item'] || 
                           rowData['GUIA'] || rowData['ASSOCIADO'] || rowData['CODIGO'] ||
                           rowData['Nº Guia'] || rowData['Cliente'] || rowData['Nº Serviço'] ||
                           rowData['NUMERO_GUIA_OPERADORA'] || rowData['NOME_BENEFICIARIO'] || rowData['CODIGO_PROCEDIMENTO'] ||
                           rowData['Nome'] || rowData['Código do Procedimento'] || rowData['CÃ³digo do Procedimento'] || 
                           rowData['Guia operadora/Senha'] || rowData['Valor (R$)'] ||
                           rowData['Matrícula'] || rowData['Beneficiário/Associado'];
      
      if (hasValidData) {
        const record = extractRecebimentoExcelFromRow(rowData, arquivoId, convenioId, dataReferencia, dataPagamento, estabelecimentoId);
        
        // Carry-over logic
        if (record.nomeBeneficiario) lastNomeBeneficiario = record.nomeBeneficiario;
        else if (lastNomeBeneficiario && record.item) record.nomeBeneficiario = lastNomeBeneficiario;
        
        if (record.dataExecucao) lastDataExecucao = record.dataExecucao;
        else if (lastDataExecucao && record.item) record.dataExecucao = lastDataExecucao;
        
        if (record.numeroGuia) lastNumeroGuia = record.numeroGuia;
        else if (lastNumeroGuia && record.item) record.numeroGuia = lastNumeroGuia;
        
        if (record.protocoloTiss) lastProtocoloTiss = record.protocoloTiss;
        else if (lastProtocoloTiss && record.item) record.protocoloTiss = lastProtocoloTiss;
        
        if (record.seq) lastSeq = record.seq;
        else if (lastSeq && record.item) record.seq = lastSeq;
        
        if (record.item || record.valorPagamento) {
          currentChunk.push(record);
        }
      }
    }
    
    // Enviar chunk quando atingir o tamanho
    if (currentChunk.length >= chunkSize) {
      await onChunk(currentChunk, chunkIndex, totalRows);
      totalRecords += currentChunk.length;
      chunkIndex++;
      currentChunk = [];
      
      // Log de progresso a cada 5 chunks
      if (chunkIndex % 5 === 0) {
        console.log(`[Parser Chunked ExcelJS] Progresso: ${totalRecords} registros processados (linha ${rowNum}/${totalRowCount})`);
      }
    }
  }
  
  // Processar último chunk
  if (currentChunk.length > 0) {
    await onChunk(currentChunk, chunkIndex, totalRows);
    totalRecords += currentChunk.length;
  }
  
  console.log(`[Parser Chunked ExcelJS] Concluído: ${totalRecords} registros em ${chunkIndex + 1} chunks`);
  
  return { totalRows, totalRecords };
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
