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
  'Justificativa': 'codigoGlosa', // GEAP
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
  
  // CORREÇÃO UNIMED: Quando situacaoItem = "PAGO" mas erroTiss está preenchido,
  // significa que o convênio glosou o item (total ou parcialmente).
  // No formato Unimed, o "Valor Pagamento" é o valor efetivamente pago pelo convênio.
  // A glosa real é a diferença entre o valor apresentado (faturado) e o valor pago,
  // mas como o Excel Unimed não traz o "Valor Informado", marcamos como "GLOSADO"
  // para que a conciliação com o faturamento calcule a diferença.
  // Se o valor pago = 0, é glosa total. Se > 0, é glosa parcial.
  if (record.erroTiss && record.erroTiss.trim() !== '' && 
      (!record.situacaoItem || record.situacaoItem === 'PAGO')) {
    const valorPagoNum = parseNumber(record.valorPagamento);
    
    // Extrair código de glosa do campo erroTiss (ex: "1702-COBRANÇA DE..." -> "1702")
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
      // O valor da glosa será calculado na conciliação com o faturamento
      record.situacaoItem = 'GLOSADO';
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
  
  // Detectar se é arquivo GEAP (cabeçalho na linha 2)
  const row2Cell = worksheet['A2'];
  const isGEAP = row2Cell && String(row2Cell.v || row2Cell.t || '').includes('Guia');
  
  let rows: Record<string, unknown>[] = [];
  
  if (isGEAP) {
    // Para GEAP, ler manualmente linha 2 como cabeçalho
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers: string[] = [];
    
    // Extrair cabeçalhos da linha 2 (índice 1)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 1, c: col });
      const cell = worksheet[cellRef];
      headers.push(cell?.v ? String(cell.v).trim() : `__EMPTY_${col}`);
    }
    
    console.log('[Parser GEAP] Cabeçalhos encontrados:', headers.join(', '));
    
    // Extrair dados a partir da linha 3 (índice 2)
    for (let row = 2; row <= range.e.r; row++) {
      const rowData: Record<string, unknown> = {};
      let hasData = false;
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellRef];
        const value = cell?.v || null;
        rowData[headers[col]] = value;
        if (value) hasData = true;
      }
      
      if (hasData) rows.push(rowData);
    }
  } else {
    // Para outros formatos, usar leitura padrão
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });
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
  
  for (const row of rows) {
    // Verificar se a linha tem dados relevantes (pelo menos número da guia ou beneficiário)
    // Suportar múltiplos formatos: padrão, Vivacom e GEAP
    const hasData = row['Número Guia'] || row['Beneficiário'] || row['Item'] || 
                    row['GUIA'] || row['ASSOCIADO'] || row['CODIGO'] ||
                    row['Nº Guia'] || row['Cliente'] || row['Nº Serviço'] ||
                    row['NUMERO_GUIA_OPERADORA'] || row['NOME_BENEFICIARIO'] || row['CODIGO_PROCEDIMENTO'];
    if (!hasData) continue;
    
    const record = extractRecebimentoExcelFromRow(row, arquivoId, convenioId, dataReferencia, dataPagamento, estabelecimentoId);
    records.push(record);
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
 * Parseia um arquivo Excel GRANDE em chunks para reduzir consumo de memória.
 * Em vez de carregar todas as linhas na memória, processa em blocos e chama o callback para cada bloco.
 */
export function parseExcelRecebimentosExcelChunked(
  buffer: Buffer,
  arquivoId: number,
  convenioId: number | undefined,
  dataReferencia: Date | undefined,
  dataPagamento: Date | undefined,
  estabelecimentoId: number | undefined,
  chunkSize: number,
  onChunk: (records: InsertRecebimentoExcel[], chunkIndex: number, totalRows: number) => Promise<void>
): Promise<{ totalRows: number; totalRecords: number }> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Detectar se é arquivo GEAP (cabeçalho na linha 2)
  const row2Cell = worksheet['A2'];
  const isGEAP = row2Cell && String(row2Cell.v || row2Cell.t || '').includes('Guia');
  
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const totalRows = range.e.r - (isGEAP ? 2 : 1) + 1; // excluir cabeçalho(s)
  
  // Extrair cabeçalhos
  const headerRow = isGEAP ? 1 : 0;
  const dataStartRow = isGEAP ? 2 : 1;
  const headers: string[] = [];
  
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRow, c: col });
    const cell = worksheet[cellRef];
    headers.push(cell?.v ? String(cell.v).trim() : `__EMPTY_${col}`);
  }
  
  console.log(`[Parser Chunked] ${totalRows} linhas, ${headers.length} colunas, chunks de ${chunkSize}`);
  console.log('[Parser Chunked] Colunas:', headers.join(', '));
  
  // Processar em chunks
  let totalRecords = 0;
  let chunkIndex = 0;
  
  const processChunks = async () => {
    let currentChunk: InsertRecebimentoExcel[] = [];
    
    for (let row = dataStartRow; row <= range.e.r; row++) {
      const rowData: Record<string, unknown> = {};
      let hasData = false;
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellRef];
        // Usar valor formatado (w) se disponível, senão valor raw (v)
        const value = cell?.w || cell?.v || null;
        rowData[headers[col]] = value;
        if (value) hasData = true;
      }
      
      if (!hasData) continue;
      
      // Verificar hasData com campos conhecidos
      const hasRelevantData = rowData['Número Guia'] || rowData['Beneficiário'] || rowData['Item'] || 
                              rowData['GUIA'] || rowData['ASSOCIADO'] || rowData['CODIGO'] ||
                              rowData['Nº Guia'] || rowData['Cliente'] || rowData['Nº Serviço'] ||
                              rowData['NUMERO_GUIA_OPERADORA'] || rowData['NOME_BENEFICIARIO'] || rowData['CODIGO_PROCEDIMENTO'];
      if (!hasRelevantData) continue;
      
      const record = extractRecebimentoExcelFromRow(rowData, arquivoId, convenioId, dataReferencia, dataPagamento, estabelecimentoId);
      currentChunk.push(record);
      
      if (currentChunk.length >= chunkSize) {
        await onChunk(currentChunk, chunkIndex, totalRows);
        totalRecords += currentChunk.length;
        chunkIndex++;
        currentChunk = []; // Liberar memória do chunk anterior
      }
    }
    
    // Processar último chunk
    if (currentChunk.length > 0) {
      await onChunk(currentChunk, chunkIndex, totalRows);
      totalRecords += currentChunk.length;
    }
  };
  
  // Retornar promise
  return processChunks().then(() => ({ totalRows, totalRecords }));
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
