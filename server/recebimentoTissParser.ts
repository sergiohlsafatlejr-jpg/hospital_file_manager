/**
 * Parser para importar dados de Excel e XML para a tabela recebimento_tiss (estrutura unificada)
 * Mapeia as colunas do Excel da Unimed e XML TISS para os campos da tabela
 * Alinhado com o padrão TISS ANS (XSD v3.00.01) - demonstrativoAnaliseConta e demonstrativoPagamento
 */

import * as XLSX from "xlsx";
import { InsertRecebimentoTiss } from "../drizzle/schema";

// Mapeamento de colunas do Excel para campos da tabela recebimento_tiss (estrutura unificada)
const COLUMN_MAPPINGS: Record<keyof Omit<InsertRecebimentoTiss, 'id' | 'dataImportacao'>, string[]> = {
  // Referência ao arquivo de origem (preenchido externamente)
  arquivoId: [],
  
  // ========== CABEÇALHO DO DEMONSTRATIVO ==========
  registroANS: ["registro_ans", "registroans", "ans"],
  numeroDemonstrativo: ["numero_demonstrativo", "demonstrativo"],
  nomeOperadora: ["Nome Prestador", "nome_operadora", "operadora"],
  cnpjOperadora: ["cnpj_operadora", "cnpj"],
  dataEmissao: ["Data Pagto", "data_emissao", "emissao", "data_pagto"],
  
  // ========== DADOS DO PRESTADOR ==========
  cnes: ["cnes", "CNES"],
  codigoPrestadorOperadora: ["codigo_prestador_operadora", "cod_prestador", "Código Prestador Pagamento"],
  nomeContratado: ["nome_contratado", "nomecontratado"],
  
  // ========== DADOS DO PROTOCOLO/LOTE ==========
  numeroLotePrestador: ["Lote Prestador", "lote_prestador", "loteprestador", "lote", "numero_lote"],
  numeroProtocolo: ["Protocolo TISS", "protocolo_tiss", "protocolotiss", "protocolo", "numero_protocolo"],
  dataProtocolo: ["data_protocolo", "dataprotocolo"],
  valorProtocolo: ["valor_protocolo", "valorprotocolo"],
  valorGlosaProtocolo: ["valor_glosa_protocolo"],
  glosaProtocoloCodigo: ["glosa_protocolo_codigo"],
  glosaProtocoloDescricao: ["glosa_protocolo_descricao"],
  situacaoProtocolo: ["situacao_protocolo", "situacaoprotocolo"],
  valorInformadoProtocolo: ["valor_informado_protocolo"],
  valorProcessadoProtocolo: ["valor_processado_protocolo"],
  valorLiberadoProtocolo: ["valor_liberado_protocolo"],
  valorGlosaProtocoloTotal: ["valor_glosa_protocolo_total"],
  
  // ========== DADOS DA GUIA ==========
  numeroGuiaPrestador: ["Número Guia", "Numero Guia", "numero_guia", "numeroguia", "guia", "num_guia"],
  numeroGuiaOperadora: ["guia_operadora", "guiaoperadora"],
  senha: ["senha", "autorizacao"],
  numeroCarteira: ["Beneficiário", "Beneficiario", "beneficiario", "beneficiário", "carteira", "numero_carteira"],
  nomeBeneficiario: ["Nome Beneficiário", "Nome Beneficiario", "nome_beneficiario", "nomebeneficiario", "paciente"],
  dataInicioFat: ["data_inicio_fat", "datainiciofat", "Data Inicio Faturamento Internação"],
  dataFimFat: ["data_fim_fat", "datafimfat", "Data Fim Faturamento Internação"],
  situacaoGuia: ["situacao_guia", "situacaoguia"],
  motivoGlosaGuiaCodigo: ["motivo_glosa_guia_codigo"],
  motivoGlosaGuiaDescricao: ["motivo_glosa_guia_descricao"],
  valorInformadoGuia: ["valor_informado_guia"],
  valorProcessadoGuia: ["valor_processado_guia"],
  valorLiberadoGuia: ["valor_liberado_guia"],
  valorGlosaGuia: ["valor_glosa_guia"],
  
  // ========== DETALHES DO ITEM ==========
  sequencialItem: ["seq", "sequencial", "sequencial_item", "sequencialitem"],
  dataRealizacao: ["Data Execução", "Data Execucao", "data_execucao", "dataexecucao", "data_realizacao"],
  codigoTabela: ["codigo_tabela", "codigotabela", "tabela"],
  codigoItem: ["Item", "item", "codigo", "cod", "codigo_procedimento", "codigo_item"],
  descricaoItem: ["Item Desc", "item_desc", "itemdesc", "descricao", "descrição", "descricao_item"],
  grauParticipacao: ["grau_participacao", "grauparticipacao"],
  
  // ========== VALORES DO ITEM ==========
  quantidadeExecutada: ["Quantidade", "quantidade", "qtd", "qtde", "quant"],
  valorInformado: ["valor_informado", "valorinformado", "vl_informado"],
  valorProcessado: ["processado", "valor_processado", "valorprocessado", "vl_processado"],
  valorLiberado: ["Valor Pagamento", "valor_pagamento", "valorpagamento", "valor_pago", "valor_liberado"],
  // valorGlosado removido - é VIRTUAL GENERATED no banco (= valor_informado - valor_liberado)
  
  // ========== GLOSA DO ITEM ==========
  codigoGlosa: ["Erro TISS", "erro_tiss", "errotiss", "codigo_glosa", "codigoglosa", "cod_glosa"],
  descricaoGlosa: ["descricao_glosa", "descricaoglosa", "motivo_glosa", "motivoglosa"],
  
  // ========== DADOS DE PAGAMENTO ==========
  dataPagamento: ["data_pagamento", "datapagamento"],
  formaPagamento: ["forma_pagamento", "formapagamento"],
  banco: ["banco"],
  agencia: ["agencia"],
  
  // ========== TOTAIS GERAIS ==========
  valorInformadoGeral: ["valor_informado_geral"],
  valorProcessadoGeral: ["valor_processado_geral"],
  valorLiberadoGeral: ["valor_liberado_geral"],
  valorGlosaGeral: ["valor_glosa_geral"],
  valorFinalReceber: ["valor_final_receber"],
  
  // ========== METADADOS ==========
  origemDado: [], // Preenchido programaticamente
  
  // Campos do upload (preenchidos externamente)
  convenioId: [],
  dataReferencia: [],
  estabelecimentoId: [],

  // Colunas legadas (existem no banco, não mapeadas no parser)
  estabelecimento_id_legacy: [],
  codigoPrestadorPagamento: ["Código Prestador Pagamento", "codigo_prestador_pagamento"],
  nomePrestadorPagamento: ["Nome Prestador Pagamento", "nome_prestador_pagamento"],
  codigoPrestadorExecutante: ["Código Prestador Executante", "codigo_prestador_executante"],
  nomePrestadorExecutante: ["Nome Prestador Executante", "nome_prestador_executante"],
  horaExecucao: ["Hora Execução", "hora_execucao"],
  codigoProcedimento: ["Código Procedimento", "codigo_procedimento_receb"],
  descricaoProcedimento: ["Descrição Procedimento", "descricao_procedimento_receb"],
  tipoLancamento: ["Tipo Lançamento", "tipo_lancamento", "tipolancamento"],
  qtdExecutada: ["Qtd Executada", "qtd_executada"],
  situacaoItem: ["Situação Item", "situacao_item", "situacaoitem", "Situação"],
  codigoSolicitante: ["Código Solicitante", "codigo_solicitante"],
  nomeSolicitante: ["Nome Solicitante", "nome_solicitante"],
  acomodacaoInternacao: ["Acomodação Internação", "acomodacao_internacao"],
  dataInicioInternacao: ["Data Início Internação", "data_inicio_internacao"],
  dataFimInternacao: ["Data Fim Internação", "data_fim_internacao"],
};

/**
 * Normaliza uma string para comparação (remove acentos, espaços, caracteres especiais)
 */
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parse de data (suporta formato brasileiro DD/MM/YYYY e ISO)
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  
  // Se já é uma Date
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value;
  }
  
  // Se é um número (serial do Excel)
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    if (isNaN(date.getTime())) return null;
    return date;
  }
  
  const str = String(value).trim();
  if (!str) return null;
  
  // Formato brasileiro DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (isNaN(date.getTime())) return null;
    return date;
  }
  
  // Formato ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (isNaN(date.getTime())) return null;
    return date;
  }
  
  return null;
}

/**
 * Parse de número
 */
function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  
  if (typeof value === 'number') return value;
  
  const str = String(value)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  
  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
}

export interface RecebimentoTissParseResult {
  success: boolean;
  items: Partial<InsertRecebimentoTiss>[];
  totalRows: number;
  error?: string;
}

/**
 * Parse de arquivo Excel para recebimento_tiss (estrutura unificada)
 */
export async function parseExcelRecebimentoTiss(
  content: Buffer,
  arquivoId: number,
  _estabelecimentoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date
): Promise<RecebimentoTissParseResult> {
  try {
    console.log(`[RecebimentoTiss Excel Parser] Starting parse, buffer size: ${(content.length / 1024).toFixed(1)} KB`);
    
    const workbook = XLSX.read(content, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    console.log(`[RecebimentoTiss Excel Parser] Found ${rows.length} rows`);
    
    if (rows.length === 0) {
      return { success: true, items: [], totalRows: 0 };
    }
    
    // Mapear colunas do Excel para campos da tabela
    const headers = Object.keys(rows[0]);
    const columnMap = new Map<string, string>();
    
    for (const header of headers) {
      const normalizedHeader = normalizeKey(header);
      
      for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
        if (aliases.length === 0) continue;
        
        for (const alias of aliases) {
          if (normalizeKey(alias) === normalizedHeader || header === alias) {
            columnMap.set(field, header);
            break;
          }
        }
      }
    }
    
    console.log(`[RecebimentoTiss Excel Parser] Column mappings:`, Object.fromEntries(columnMap));
    
    const items: Partial<InsertRecebimentoTiss>[] = [];
    
    for (const row of rows) {
      const findValue = (field: string): unknown => {
        const excelColumn = columnMap.get(field);
        return excelColumn ? row[excelColumn] : undefined;
      };
      
      const codigo = findValue('codigoItem');
      const descricao = findValue('descricaoItem');
      
      // Pular linhas sem código ou descrição
      if (!codigo && !descricao) continue;
      
      const item: Partial<InsertRecebimentoTiss> = {
        arquivoId,
        
        // Cabeçalho do Demonstrativo
        registroANS: findValue('registroANS') as string | undefined,
        numeroDemonstrativo: findValue('numeroDemonstrativo') as string | undefined,
        nomeOperadora: findValue('nomeOperadora') as string | undefined,
        cnpjOperadora: findValue('cnpjOperadora') as string | undefined,
        dataEmissao: parseDate(findValue('dataEmissao')),
        
        // Dados do Prestador
        cnes: findValue('cnes') as string | undefined,
        codigoPrestadorOperadora: findValue('codigoPrestadorOperadora') as string | undefined,
        nomeContratado: findValue('nomeContratado') as string | undefined,
        
        // Dados do Protocolo/Lote
        numeroLotePrestador: findValue('numeroLotePrestador') as string | undefined,
        numeroProtocolo: findValue('numeroProtocolo') as string | undefined,
        situacaoProtocolo: findValue('situacaoProtocolo') as string | undefined,
        
        // Dados da Guia e Beneficiário
        numeroGuiaPrestador: findValue('numeroGuiaPrestador') as string | undefined,
        numeroGuiaOperadora: findValue('numeroGuiaOperadora') as string | undefined,
        senha: findValue('senha') as string | undefined,
        numeroCarteira: findValue('numeroCarteira') as string | undefined,
        nomeBeneficiario: findValue('nomeBeneficiario') as string | undefined,
        dataInicioFat: parseDate(findValue('dataInicioFat')),
        dataFimFat: parseDate(findValue('dataFimFat')),
        situacaoGuia: findValue('situacaoGuia') as string | undefined,
        
        // Detalhes do Item
        sequencialItem: parseNumber(findValue('sequencialItem')) as number | undefined,
        dataRealizacao: parseDate(findValue('dataRealizacao')),
        codigoTabela: findValue('codigoTabela') as string | undefined,
        codigoItem: codigo as string | undefined,
        descricaoItem: descricao as string | undefined,
        
        // Valores de Conciliação
        quantidadeExecutada: parseNumber(findValue('quantidadeExecutada'))?.toString(),
        valorInformado: parseNumber(findValue('valorInformado'))?.toString(),
        valorProcessado: parseNumber(findValue('valorProcessado'))?.toString(),
        valorLiberado: parseNumber(findValue('valorLiberado'))?.toString(),
        // valorGlosado é VIRTUAL GENERATED no banco (= valor_informado - valor_liberado), não inserir
        
        // Motivos de Glosa
        codigoGlosa: findValue('codigoGlosa') as string | undefined,
        descricaoGlosa: findValue('descricaoGlosa') as string | undefined,
        
        // Metadados
        origemDado: 'excel',
        
        // Campos do upload
        convenioId,
        dataReferencia,
        dataPagamento,
        estabelecimentoId: _estabelecimentoId,
      };
      
      items.push(item);
    }
    
    console.log(`[RecebimentoTiss Excel Parser] Parsed ${items.length} items from ${rows.length} rows`);
    
    return {
      success: true,
      items,
      totalRows: rows.length,
    };
  } catch (error) {
    console.error('[RecebimentoTiss Excel Parser] Error:', error);
    return {
      success: false,
      items: [],
      totalRows: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse de arquivo XML de demonstrativo TISS para recebimento_tiss (estrutura unificada)
 * Suporta demonstrativoAnaliseConta e demonstrativoPagamento conforme XSD TISS v3.00.01
 */
export async function parseXmlRecebimentoTiss(
  content: Buffer,
  arquivoId: number,
  estabelecimentoId: number,
  convenioId?: number,
  dataReferencia?: Date,
  dataPagamento?: Date
): Promise<RecebimentoTissParseResult> {
  try {
    console.log(`[RecebimentoTiss XML Parser] Starting parse, buffer size: ${(content.length / 1024).toFixed(1)} KB`);
    
    const xmlString = content.toString('utf-8');
    const items: Partial<InsertRecebimentoTiss>[] = [];
    
    // ========== CABEÇALHO DO DEMONSTRATIVO (ct_demonstrativoCabecalho) ==========
    const registroANS = xmlString.match(/<(?:ans:)?registroANS>([^<]+)<\/(?:ans:)?registroANS>/)?.[1];
    const numeroDemonstrativo = xmlString.match(/<(?:ans:)?numeroDemonstrativo>([^<]+)<\/(?:ans:)?numeroDemonstrativo>/)?.[1];
    const nomeOperadora = xmlString.match(/<(?:ans:)?nomeOperadora>([^<]+)<\/(?:ans:)?nomeOperadora>/)?.[1];
    let cnpjOperadora = xmlString.match(/<(?:ans:)?CNPJ>([^<]+)<\/(?:ans:)?CNPJ>/)?.[1];
    if (!cnpjOperadora) {
      cnpjOperadora = xmlString.match(/<(?:ans:)?numeroCNPJ>([^<]+)<\/(?:ans:)?numeroCNPJ>/)?.[1];
    }
    const dataEmissaoStr = xmlString.match(/<(?:ans:)?dataEmissao>([^<]+)<\/(?:ans:)?dataEmissao>/)?.[1];
    const dataEmissao = dataEmissaoStr ? parseDate(dataEmissaoStr) : null;
    
    // ========== DADOS DO PRESTADOR ==========
    const cnes = xmlString.match(/<(?:ans:)?CNES>([^<]+)<\/(?:ans:)?CNES>/)?.[1];
    const codigoPrestadorOperadora = xmlString.match(/<(?:ans:)?codigoPrestadorNaOperadora>([^<]+)<\/(?:ans:)?codigoPrestadorNaOperadora>/)?.[1];
    const nomeContratado = xmlString.match(/<(?:ans:)?nomeContratado>([^<]+)<\/(?:ans:)?nomeContratado>/)?.[1];
    
    // ========== DADOS DE PAGAMENTO (demonstrativoPagamento) ==========
    const dataPagamentoXmlStr = xmlString.match(/<(?:ans:)?dataPagamento>([^<]+)<\/(?:ans:)?dataPagamento>/)?.[1];
    const dataPagamentoXml = dataPagamentoXmlStr ? parseDate(dataPagamentoXmlStr) : dataPagamento;
    const formaPagamento = xmlString.match(/<(?:ans:)?formaPagamento>([^<]+)<\/(?:ans:)?formaPagamento>/)?.[1];
    const banco = xmlString.match(/<(?:ans:)?banco>([^<]+)<\/(?:ans:)?banco>/)?.[1];
    const agencia = xmlString.match(/<(?:ans:)?agencia>([^<]+)<\/(?:ans:)?agencia>/)?.[1];
    
    // ========== TOTAIS GERAIS DO DEMONSTRATIVO ==========
    // Buscar os totais gerais (podem estar em diferentes tags)
    const valorInformadoGeral = xmlString.match(/<(?:ans:)?valorInformadoGeral>([^<]+)<\/(?:ans:)?valorInformadoGeral>/)?.[1]
      || xmlString.match(/<(?:ans:)?valorInformadoBruto>([^<]+)<\/(?:ans:)?valorInformadoBruto>/)?.[1];
    const valorProcessadoGeral = xmlString.match(/<(?:ans:)?valorProcessadoGeral>([^<]+)<\/(?:ans:)?valorProcessadoGeral>/)?.[1]
      || xmlString.match(/<(?:ans:)?valorProcessadoBruto>([^<]+)<\/(?:ans:)?valorProcessadoBruto>/)?.[1];
    const valorLiberadoGeral = xmlString.match(/<(?:ans:)?valorLiberadoGeral>([^<]+)<\/(?:ans:)?valorLiberadoGeral>/)?.[1]
      || xmlString.match(/<(?:ans:)?valorLiberadoBruto>([^<]+)<\/(?:ans:)?valorLiberadoBruto>/)?.[1];
    const valorGlosaGeral = xmlString.match(/<(?:ans:)?valorGlosaGeral>([^<]+)<\/(?:ans:)?valorGlosaGeral>/)?.[1]
      || xmlString.match(/<(?:ans:)?valorGlosaBruto>([^<]+)<\/(?:ans:)?valorGlosaBruto>/)?.[1];
    const valorFinalReceber = xmlString.match(/<(?:ans:)?valorFinalReceber>([^<]+)<\/(?:ans:)?valorFinalReceber>/)?.[1];
    
    // ========== PROCESSAR PROTOCOLOS (ct_contaMedicaResumo) ==========
    const protocoloRegex = /<(?:ans:)?dadosProtocolo>([\s\S]*?)<\/(?:ans:)?dadosProtocolo>/g;
    let protocoloMatch;
    
    while ((protocoloMatch = protocoloRegex.exec(xmlString)) !== null) {
      const protocoloXml = protocoloMatch[1];
      
      // Dados do protocolo
      let numeroLotePrestador = protocoloXml.match(/<(?:ans:)?numeroLote>([^<]+)<\/(?:ans:)?numeroLote>/)?.[1];
      if (!numeroLotePrestador) {
        numeroLotePrestador = protocoloXml.match(/<(?:ans:)?numeroLotePrestador>([^<]+)<\/(?:ans:)?numeroLotePrestador>/)?.[1];
      }
      const numeroProtocolo = protocoloXml.match(/<(?:ans:)?numeroProtocolo>([^<]+)<\/(?:ans:)?numeroProtocolo>/)?.[1];
      const dataProtocoloStr = protocoloXml.match(/<(?:ans:)?dataProtocolo>([^<]+)<\/(?:ans:)?dataProtocolo>/)?.[1];
      const dataProtocolo = dataProtocoloStr ? parseDate(dataProtocoloStr) : null;
      const valorProtocolo = protocoloXml.match(/<(?:ans:)?valorProtocolo>([^<]+)<\/(?:ans:)?valorProtocolo>/)?.[1];
      const situacaoProtocolo = protocoloXml.match(/<(?:ans:)?situacaoProtocolo>([^<]+)<\/(?:ans:)?situacaoProtocolo>/)?.[1];
      
      // Glosa do protocolo
      const valorGlosaProtocolo = protocoloXml.match(/<(?:ans:)?valorGlosaProtocolo>([^<]+)<\/(?:ans:)?valorGlosaProtocolo>/)?.[1];
      let glosaProtocoloCodigo: string | undefined;
      let glosaProtocoloDescricao: string | undefined;
      const glosaProtocoloMatch = protocoloXml.match(/<(?:ans:)?GlosaProtocolo>([\s\S]*?)<\/(?:ans:)?GlosaProtocolo>/);
      if (glosaProtocoloMatch) {
        glosaProtocoloCodigo = glosaProtocoloMatch[1].match(/<(?:ans:)?codigoGlosa>([^<]+)<\/(?:ans:)?codigoGlosa>/)?.[1];
        glosaProtocoloDescricao = glosaProtocoloMatch[1].match(/<(?:ans:)?descricaoGlosa>([^<]+)<\/(?:ans:)?descricaoGlosa>/)?.[1];
      }
      
      // Totais do protocolo
      const valorInformadoProtocolo = protocoloXml.match(/<(?:ans:)?valorInformadoProtocolo>([^<]+)<\/(?:ans:)?valorInformadoProtocolo>/)?.[1];
      const valorProcessadoProtocolo = protocoloXml.match(/<(?:ans:)?valorProcessadoProtocolo>([^<]+)<\/(?:ans:)?valorProcessadoProtocolo>/)?.[1];
      const valorLiberadoProtocolo = protocoloXml.match(/<(?:ans:)?valorLiberadoProtocolo>([^<]+)<\/(?:ans:)?valorLiberadoProtocolo>/)?.[1];
      const valorGlosaProtocoloTotal = protocoloXml.match(/<(?:ans:)?valorGlosaProtocoloTotal>([^<]+)<\/(?:ans:)?valorGlosaProtocoloTotal>/)?.[1];
      
      // ========== PROCESSAR GUIAS (relacaoGuias) ==========
      const guiaRegex = /<(?:ans:)?(?:dadosGuia|relacaoGuias)>([\s\S]*?)<\/(?:ans:)?(?:dadosGuia|relacaoGuias)>/g;
      let guiaMatch;
      
      while ((guiaMatch = guiaRegex.exec(protocoloXml)) !== null) {
        const guiaXml = guiaMatch[1];
        
        // Dados da guia
        const numeroGuiaPrestador = guiaXml.match(/<(?:ans:)?numeroGuiaPrestador>([^<]+)<\/(?:ans:)?numeroGuiaPrestador>/)?.[1];
        const numeroGuiaOperadora = guiaXml.match(/<(?:ans:)?numeroGuiaOperadora>([^<]+)<\/(?:ans:)?numeroGuiaOperadora>/)?.[1];
        const senha = guiaXml.match(/<(?:ans:)?senha>([^<]+)<\/(?:ans:)?senha>/)?.[1];
        const numeroCarteira = guiaXml.match(/<(?:ans:)?numeroCarteira>([^<]+)<\/(?:ans:)?numeroCarteira>/)?.[1];
        const nomeBeneficiario = guiaXml.match(/<(?:ans:)?nomeBeneficiario>([^<]+)<\/(?:ans:)?nomeBeneficiario>/)?.[1];
        const situacaoGuia = guiaXml.match(/<(?:ans:)?situacaoGuia>([^<]+)<\/(?:ans:)?situacaoGuia>/)?.[1];
        
        // Datas de faturamento
        const dataInicioFatStr = guiaXml.match(/<(?:ans:)?dataInicioFat>([^<]+)<\/(?:ans:)?dataInicioFat>/)?.[1];
        const dataInicioFat = dataInicioFatStr ? parseDate(dataInicioFatStr) : null;
        const dataFimFatStr = guiaXml.match(/<(?:ans:)?dataFimFat>([^<]+)<\/(?:ans:)?dataFimFat>/)?.[1];
        const dataFimFat = dataFimFatStr ? parseDate(dataFimFatStr) : null;
        
        // Glosa da guia (pode ter múltiplas, pegamos a primeira)
        let motivoGlosaGuiaCodigo: string | undefined;
        let motivoGlosaGuiaDescricao: string | undefined;
        const glosaGuiaMatch = guiaXml.match(/<(?:ans:)?motivoGlosaGuia>([\s\S]*?)<\/(?:ans:)?motivoGlosaGuia>/);
        if (glosaGuiaMatch) {
          motivoGlosaGuiaCodigo = glosaGuiaMatch[1].match(/<(?:ans:)?codigoGlosa>([^<]+)<\/(?:ans:)?codigoGlosa>/)?.[1];
          motivoGlosaGuiaDescricao = glosaGuiaMatch[1].match(/<(?:ans:)?descricaoGlosa>([^<]+)<\/(?:ans:)?descricaoGlosa>/)?.[1];
        }
        
        // Totais da guia
        const valorInformadoGuia = guiaXml.match(/<(?:ans:)?valorInformadoGuia>([^<]+)<\/(?:ans:)?valorInformadoGuia>/)?.[1];
        const valorProcessadoGuia = guiaXml.match(/<(?:ans:)?valorProcessadoGuia>([^<]+)<\/(?:ans:)?valorProcessadoGuia>/)?.[1];
        const valorLiberadoGuia = guiaXml.match(/<(?:ans:)?valorLiberadoGuia>([^<]+)<\/(?:ans:)?valorLiberadoGuia>/)?.[1];
        const valorGlosaGuia = guiaXml.match(/<(?:ans:)?valorGlosaGuia>([^<]+)<\/(?:ans:)?valorGlosaGuia>/)?.[1];
        
        // ========== PROCESSAR ITENS (detalhesGuia) ==========
        const itemRegex = /<(?:ans:)?(?:dadosPagamento|detalhesGuia)>([\s\S]*?)<\/(?:ans:)?(?:dadosPagamento|detalhesGuia)>/g;
        let itemMatch;
        
        while ((itemMatch = itemRegex.exec(guiaXml)) !== null) {
          const itemXml = itemMatch[1];
          
          const sequencialItem = itemXml.match(/<(?:ans:)?sequencialItem>([^<]+)<\/(?:ans:)?sequencialItem>/)?.[1];
          const dataRealizacaoStr = itemXml.match(/<(?:ans:)?dataRealizacao>([^<]+)<\/(?:ans:)?dataRealizacao>/)?.[1];
          const dataRealizacao = dataRealizacaoStr ? parseDate(dataRealizacaoStr) : null;
          const codigoTabela = itemXml.match(/<(?:ans:)?codigoTabela>([^<]+)<\/(?:ans:)?codigoTabela>/)?.[1];
          const codigoItem = itemXml.match(/<(?:ans:)?codigoProcedimento>([^<]+)<\/(?:ans:)?codigoProcedimento>/)?.[1];
          const descricaoItem = itemXml.match(/<(?:ans:)?descricaoProcedimento>([^<]+)<\/(?:ans:)?descricaoProcedimento>/)?.[1];
          const grauParticipacao = itemXml.match(/<(?:ans:)?grauParticipacao>([^<]+)<\/(?:ans:)?grauParticipacao>/)?.[1];
          
          const quantidadeExecutada = itemXml.match(/<(?:ans:)?quantidadeExecutada>([^<]+)<\/(?:ans:)?quantidadeExecutada>/)?.[1]
            || itemXml.match(/<(?:ans:)?qtdExecutada>([^<]+)<\/(?:ans:)?qtdExecutada>/)?.[1];
          const valorInformado = itemXml.match(/<(?:ans:)?valorInformado>([^<]+)<\/(?:ans:)?valorInformado>/)?.[1];
          const valorProcessado = itemXml.match(/<(?:ans:)?valorProcessado>([^<]+)<\/(?:ans:)?valorProcessado>/)?.[1];
          const valorLiberado = itemXml.match(/<(?:ans:)?valorLiberado>([^<]+)<\/(?:ans:)?valorLiberado>/)?.[1];
          
          // NOTA: valor_glosado é coluna VIRTUAL GENERATED no banco (= valor_informado - valor_liberado)
          // NÃO devemos inserir valores nela - o banco calcula automaticamente
          // Extraímos apenas o código e descrição da glosa para referência
          
          // Glosa do item (relacaoGlosa)
          let codigoGlosa = itemXml.match(/<(?:ans:)?codigoGlosa>([^<]+)<\/(?:ans:)?codigoGlosa>/)?.[1];
          if (!codigoGlosa) {
            codigoGlosa = itemXml.match(/<(?:ans:)?tipoGlosa>([^<]+)<\/(?:ans:)?tipoGlosa>/)?.[1];
          }
          const descricaoGlosa = itemXml.match(/<(?:ans:)?descricaoGlosa>([^<]+)<\/(?:ans:)?descricaoGlosa>/)?.[1];
          
          items.push({
            arquivoId,
            
            // Cabeçalho
            registroANS,
            numeroDemonstrativo,
            nomeOperadora,
            cnpjOperadora,
            dataEmissao,
            
            // Prestador
            cnes,
            codigoPrestadorOperadora,
            nomeContratado,
            
            // Protocolo
            numeroLotePrestador,
            numeroProtocolo,
            dataProtocolo,
            valorProtocolo,
            valorGlosaProtocolo,
            glosaProtocoloCodigo,
            glosaProtocoloDescricao,
            situacaoProtocolo,
            valorInformadoProtocolo,
            valorProcessadoProtocolo,
            valorLiberadoProtocolo,
            valorGlosaProtocoloTotal,
            
            // Guia
            numeroGuiaPrestador,
            numeroGuiaOperadora,
            senha,
            numeroCarteira,
            nomeBeneficiario,
            dataInicioFat,
            dataFimFat,
            situacaoGuia,
            motivoGlosaGuiaCodigo,
            motivoGlosaGuiaDescricao,
            valorInformadoGuia,
            valorProcessadoGuia,
            valorLiberadoGuia,
            valorGlosaGuia,
            
            // Item
            sequencialItem: sequencialItem ? parseInt(sequencialItem) : undefined,
            dataRealizacao,
            codigoTabela,
            codigoItem,
            descricaoItem,
            grauParticipacao,
            quantidadeExecutada,
            valorInformado,
            valorProcessado,
            valorLiberado,
            // valorGlosado é VIRTUAL GENERATED (= valor_informado - valor_liberado), não inserir
            codigoGlosa,
            descricaoGlosa,
            
            // Pagamento
            dataPagamento: dataPagamentoXml,
            formaPagamento,
            banco,
            agencia,
            
            // Totais gerais
            valorInformadoGeral,
            valorProcessadoGeral,
            valorLiberadoGeral,
            valorGlosaGeral,
            valorFinalReceber,
            
            // Metadados
            origemDado: 'xml',
            convenioId,
            dataReferencia,
            estabelecimentoId,
          });
        }
      }
    }
    
    // Se não encontrou protocolos (pode ser demonstrativoPagamento com resumo)
    // Tentar extrair dados de relacaoProtocolos (ct_dadosResumoDemonstrativo)
    if (items.length === 0) {
      const resumoRegex = /<(?:ans:)?relacaoProtocolos>([\s\S]*?)<\/(?:ans:)?relacaoProtocolos>/g;
      let resumoMatch;
      
      while ((resumoMatch = resumoRegex.exec(xmlString)) !== null) {
        const resumoXml = resumoMatch[1];
        
        const dataProtocoloStr = resumoXml.match(/<(?:ans:)?dataProtocolo>([^<]+)<\/(?:ans:)?dataProtocolo>/)?.[1];
        const dataProtocolo = dataProtocoloStr ? parseDate(dataProtocoloStr) : null;
        const numeroProtocolo = resumoXml.match(/<(?:ans:)?numeroProtocolo>([^<]+)<\/(?:ans:)?numeroProtocolo>/)?.[1];
        const numeroLote = resumoXml.match(/<(?:ans:)?numeroLote>([^<]+)<\/(?:ans:)?numeroLote>/)?.[1];
        const valorInformado = resumoXml.match(/<(?:ans:)?valorInformado>([^<]+)<\/(?:ans:)?valorInformado>/)?.[1];
        const valorProcessado = resumoXml.match(/<(?:ans:)?valorProcessado>([^<]+)<\/(?:ans:)?valorProcessado>/)?.[1];
        const valorLiberado = resumoXml.match(/<(?:ans:)?valorLiberado>([^<]+)<\/(?:ans:)?valorLiberado>/)?.[1];
        const valorGlosa = resumoXml.match(/<(?:ans:)?valorGlosa>([^<]+)<\/(?:ans:)?valorGlosa>/)?.[1];
        
        items.push({
          arquivoId,
          registroANS,
          numeroDemonstrativo,
          nomeOperadora,
          cnpjOperadora,
          dataEmissao,
          cnes,
          codigoPrestadorOperadora,
          nomeContratado,
          numeroLotePrestador: numeroLote,
          numeroProtocolo,
          dataProtocolo,
          valorInformadoProtocolo: valorInformado,
          valorProcessadoProtocolo: valorProcessado,
          valorLiberadoProtocolo: valorLiberado,
          valorGlosaProtocoloTotal: valorGlosa,
          dataPagamento: dataPagamentoXml,
          formaPagamento,
          banco,
          agencia,
          valorInformadoGeral,
          valorProcessadoGeral,
          valorLiberadoGeral,
          valorGlosaGeral,
          valorFinalReceber,
          origemDado: 'xml',
          convenioId,
          dataReferencia,
          estabelecimentoId,
        });
      }
    }
    
    console.log(`[RecebimentoTiss XML Parser] Parsed ${items.length} items`);
    
    return {
      success: true,
      items,
      totalRows: items.length,
    };
  } catch (error) {
    console.error('[RecebimentoTiss XML Parser] Error:', error);
    return {
      success: false,
      items: [],
      totalRows: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
