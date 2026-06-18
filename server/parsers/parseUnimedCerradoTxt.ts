/**
 * Parser TXT para Demonstrativo de Análise da Conta Médica - Unimed Cerrado
 * 
 * Formato: arquivo texto separado por '#' (hash), encoding Latin-1 (ISO-8859-1)
 * 
 * Estrutura:
 * Linha 1: Título (DEMONSTRATIVO DE ANÁLISE DA CONTA MÉDICA - REF. MM/AAAA)
 * Linha 2: Cabeçalho do prestador
 * Linha 3: Dados do prestador
 * Linha 4: Cabeçalho dos itens (21 colunas)
 * Linhas 5+: Dados dos itens
 * 
 * Colunas (separadas por #):
 * 0: FATURA (vazio)
 * 1: LOTE
 * 2: DATA ENVIO LOTE
 * 3: NRO PROTOCOLO
 * 4: VALOR PROTOCOLO
 * 5: VALOR GLOSA PROTOCOLO
 * 6: COD GLOSA PROTOCOLO
 * 7: NRO GUIA/SENHA
 * 8: NRO BENEFICIÁRIO
 * 9: BENEFICIÁRIO
 * 10: DATA REALIZAÇÃO
 * 11: CODIGO TABELA (18=taxa, 19=material, 20=medicamento, 22=procedimento)
 * 12: CODIGO SERVIÇO
 * 13: DESCRIÇÃO
 * 14: GRAU PART.
 * 15: QTD EXECUTADA
 * 16: VALOR PROCESSADO
 * 17: VALOR LIBERADO
 * 18: VALOR GLOSA
 * 19: CODIGO GLOSA ITEM
 * 20: CODIGO GLOSA CONTA
 */

import type { InsertRecebimentoTiss } from "../../drizzle/schema";

export interface TxtParseResult {
  success: boolean;
  items: Partial<InsertRecebimentoTiss>[];
  totalRows: number;
  error?: string;
  cabecalho?: {
    referencia: string;
    registroANS: string;
    operadora: string;
    cnpjOperadora: string;
    numeroDemonstrativo: string;
    dataEmissao: string;
    codigoPrestador: string;
    nomePrestador: string;
    cnes: string;
  };
}

/**
 * Converte valor no formato brasileiro (vírgula decimal) para número
 * Exemplos: "11,55" -> 11.55, ",17" -> 0.17, "0" -> 0, "" -> null
 */
function parseValorBR(valor: string | undefined): number | null {
  if (!valor || valor.trim() === '') return null;
  const cleaned = valor.trim().replace('.', '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Converte data no formato DD/MM/YYYY para YYYY-MM-DD
 */
function parseDateBR(dateStr: string | undefined): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const match = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

/**
 * Mapeia código de tabela para tipo de lançamento legível
 */
function mapCodigoTabelaToTipo(codigoTabela: string): string | null {
  switch (codigoTabela) {
    case '18': return 'Taxa';
    case '19': return 'Material';
    case '20': return 'Medicamento';
    case '22': return 'Procedimento';
    case '00': return 'Outros';
    default: return null;
  }
}

/**
 * Parser principal para arquivos TXT da Unimed Cerrado
 */
export function parseUnimedCerradoTxt(
  buffer: Buffer,
  arquivoId: number,
  estabelecimentoId: number,
  convenioId: number,
  dataReferencia?: Date | null,
  dataPagamento?: Date | null
): TxtParseResult {
  try {
    // Decodificar como Latin-1 (ISO-8859-1)
    const content = buffer.toString('latin1');
    const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
    
    if (lines.length < 5) {
      return { success: false, items: [], totalRows: 0, error: 'Arquivo TXT muito curto (menos de 5 linhas)' };
    }
    
    // Linha 1: Título - extrair referência
    const tituloLine = lines[0] || '';
    const refMatch = tituloLine.match(/REF\.\s*(\d{2}\/\d{4})/);
    const referencia = refMatch ? refMatch[1]! : '';
    
    // Linha 3: Dados do prestador
    const prestadorFields = (lines[2] || '').split('#');
    const cabecalho = {
      referencia,
      registroANS: prestadorFields[0]?.trim() || '',
      operadora: prestadorFields[1]?.trim() || '',
      cnpjOperadora: prestadorFields[2]?.trim() || '',
      numeroDemonstrativo: prestadorFields[3]?.trim() || '',
      dataEmissao: prestadorFields[4]?.trim() || '',
      codigoPrestador: prestadorFields[5]?.trim() || '',
      nomePrestador: prestadorFields[6]?.trim() || '',
      cnes: prestadorFields[7]?.trim() || '',
    };
    
    // Processar linhas de dados (a partir da linha 5, índice 4)
    const items: Partial<InsertRecebimentoTiss>[] = [];
    const dataRefStr = dataReferencia ? dataReferencia.toISOString().split('T')[0] : null;
    const dataPagStr = dataPagamento ? dataPagamento.toISOString().split('T')[0] : null;
    
    for (let i = 4; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim() === '') continue;
      
      const fields = line.split('#');
      
      // Precisa ter pelo menos 19 campos (índice 0-18)
      if (fields.length < 19) continue;
      
      const lote = fields[1]?.trim() || '';
      const dataEnvioLote = fields[2]?.trim() || '';
      const nroProtocolo = fields[3]?.trim() || '';
      const valorProtocolo = fields[4]?.trim() || '';
      const valorGlosaProtocolo = fields[5]?.trim() || '';
      const codGlosaProtocolo = fields[6]?.trim() || '';
      const nroGuiaSenha = fields[7]?.trim() || '';
      const nroBeneficiario = fields[8]?.trim() || '';
      const beneficiario = fields[9]?.trim() || '';
      const dataRealizacao = fields[10]?.trim() || '';
      const codigoTabela = fields[11]?.trim() || '';
      const codigoServico = fields[12]?.trim() || '';
      const descricao = fields[13]?.trim() || '';
      const grauPart = fields[14]?.trim() || '';
      const qtdExecutada = fields[15]?.trim() || '';
      const valorProcessado = fields[16]?.trim() || '';
      const valorLiberado = fields[17]?.trim() || '';
      const valorGlosa = fields[18]?.trim() || '';
      const codigoGlosaItem = fields[19]?.trim() || '';
      const codigoGlosaConta = fields[20]?.trim() || '';
      
      // Pular linhas sem código de serviço (linhas inválidas)
      if (!codigoServico) continue;
      
      const item: Partial<InsertRecebimentoTiss> = {
        arquivoId,
        estabelecimentoId,
        convenioId,
        origemDado: 'txt',
        
        // Cabeçalho
        registroANS: cabecalho.registroANS || undefined,
        numeroDemonstrativo: cabecalho.numeroDemonstrativo || undefined,
        nomeOperadora: cabecalho.operadora || undefined,
        cnpjOperadora: cabecalho.cnpjOperadora || undefined,
        dataEmissao: parseDateBR(cabecalho.dataEmissao) || undefined,
        cnes: cabecalho.cnes || undefined,
        codigoPrestadorOperadora: cabecalho.codigoPrestador || undefined,
        nomeContratado: cabecalho.nomePrestador || undefined,
        
        // Protocolo/Lote
        numeroLotePrestador: lote || undefined,
        numeroProtocolo: nroProtocolo || undefined,
        dataProtocolo: parseDateBR(dataEnvioLote) || undefined,
        valorProtocolo: parseValorBR(valorProtocolo)?.toString() || undefined,
        valorGlosaProtocolo: parseValorBR(valorGlosaProtocolo)?.toString() || undefined,
        glosaProtocoloCodigo: codGlosaProtocolo || undefined,
        
        // Guia
        numeroGuiaPrestador: nroGuiaSenha || undefined,
        numeroCarteira: nroBeneficiario || undefined,
        nomeBeneficiario: beneficiario || undefined,
        
        // Item
        dataRealizacao: parseDateBR(dataRealizacao) || undefined,
        codigoTabela: codigoTabela || undefined,
        codigoItem: codigoServico || undefined,
        descricaoItem: descricao || undefined,
        grauParticipacao: grauPart || undefined,
        quantidadeExecutada: parseValorBR(qtdExecutada)?.toString() || undefined,
        valorInformado: parseValorBR(valorProcessado)?.toString() || undefined,
        valorProcessado: parseValorBR(valorProcessado)?.toString() || undefined,
        valorLiberado: parseValorBR(valorLiberado)?.toString() || undefined,
        // valorGlosado é virtual generated no banco, não inserir
        
        // Glosa
        codigoGlosa: codigoGlosaItem || codigoGlosaConta || undefined,
        
        // Tipo de lançamento baseado no código de tabela
        tipoLancamento: mapCodigoTabelaToTipo(codigoTabela) || undefined,
        
        // Datas de referência e pagamento (do upload)
        dataReferencia: dataRefStr || undefined,
        dataPagamento: dataPagStr || undefined,
      };
      
      items.push(item);
    }
    
    console.log(`[TXT Parser] Unimed Cerrado: ${items.length} itens extraídos de ${lines.length} linhas`);
    
    return {
      success: true,
      items,
      totalRows: lines.length - 4,
      cabecalho,
    };
  } catch (error: any) {
    console.error('[TXT Parser] Erro ao processar arquivo TXT:', error);
    return {
      success: false,
      items: [],
      totalRows: 0,
      error: error.message || 'Erro desconhecido ao processar arquivo TXT',
    };
  }
}

/**
 * Detecta se um buffer é um arquivo TXT da Unimed Cerrado
 * Verifica se a primeira linha contém "DEMONSTRATIVO DE ANÁLISE DA CONTA MÉDICA"
 */
export function detectUnimedCerradoTxt(buffer: Buffer): boolean {
  try {
    // Tentar decodificar como Latin-1
    const firstLine = buffer.toString('latin1').split('\n')[0] || '';
    return firstLine.includes('DEMONSTRATIVO DE AN') && firstLine.includes('LISE DA CONTA M');
  } catch {
    return false;
  }
}
