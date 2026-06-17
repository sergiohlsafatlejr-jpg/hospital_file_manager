/**
 * Parser específico para Demonstrativo de Pagamento IPASGO (CSV)
 * 
 * Formato do CSV IPASGO:
 * - Encoding: UTF-16LE (precisa converter para UTF-8)
 * - Separador: ponto-e-vírgula (;)
 * - Linha 1: Cabeçalho com 34 colunas
 * - Linhas seguintes: dados dos itens (um item por linha)
 * 
 * Colunas:
 * 1.  FATURA
 * 2.  PAGAMENTO (data DD/MM/AAAA)
 * 3.  CODIGO_PRESTADOR_PAGAMENTO
 * 4.  NOME_PRESTADOR_PAGAMENTO
 * 5.  COMPETENCIA (MM/AAAA)
 * 6.  ENTREGA (data DD/MM/AAAA)
 * 7.  PROTOCOLO
 * 8.  LOTE
 * 9.  CODIGO_PRESTADOR_XML
 * 10. NOME_PRESTADOR_XML
 * 11. NUMERO_GUIA_OPERADORA
 * 12. SENHA
 * 13. CARTEIRA_BENEFICIARIO
 * 14. NOME_BENEFICIARIO
 * 15. REALIZACAO (data DD/MM/AAAA)
 * 16. CODIGO_PROCEDIMENTO
 * 17. DESCRICAO_PROCEDIMENTO
 * 18. GRAU_PARTICIPACAO
 * 19. TIPO_GUIA (HONORARIO, SP/SADT, RESUMO INTERNACAO)
 * 20. QUANTIDADE
 * 21. VALOR_UNITARIO (formato BR: 1.234,56)
 * 22. VALOR_GLOSADO (formato BR)
 * 23. VALOR_TOTAL_PAGAMENTO (formato BR)
 * 24. JUSTIFICATIVA_GLOSA
 * 25. OBSERVACAO_GLOSA
 * 26. SITUACAO (PAGO, GLOSADO, etc.)
 * 27. CODIGO_PROFISSIONAL_SOLICITANTE
 * 28. NOME_PROFISSIONAL_SOLICITANTE
 * 29. CODIGO_LOCAL_REALIZACAO
 * 30. NOME_LOCAL_REALIZACAO
 * 31. CODIGO_PRESTADOR_EXECUTANTE
 * 32. NOME_PRESTADOR_EXECUTANTE
 * 33. COD_FAT
 * 34. TIPO_LANCAMENTO (CRÉDITO, DÉBITO)
 * 
 * Saída: registros compatíveis com InsertRecebimentoExcel (tabela recebimentos_excel)
 */

import type { InsertRecebimentoExcel } from "../../drizzle/schema";

export interface IpasgoCSVResult {
  success: boolean;
  items: InsertRecebimentoExcel[];
  codigoPrestador: string;
  nomePrestador: string;
  totalLotes: number;
  totalGuias: number;
  totalItens: number;
  error?: string;
}

function parseDataBR(dataStr: string): Date | null {
  const trimmed = dataStr.trim();
  const match = trimmed.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
}

function parseValorBR(valorStr: string): number {
  if (!valorStr) return 0;
  const cleaned = valorStr.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Detecta se o conteúdo é um CSV IPASGO
 * Verifica se o cabeçalho contém colunas típicas do IPASGO
 */
export function detectIpasgoFormat(content: string): boolean {
  const firstLine = content.split(/\r?\n/)[0] || '';
  return (
    firstLine.includes('FATURA') &&
    firstLine.includes('COMPETENCIA') &&
    firstLine.includes('NUMERO_GUIA_OPERADORA') &&
    firstLine.includes('CODIGO_PRESTADOR_PAGAMENTO')
  );
}

/**
 * Converte buffer que pode ser UTF-16LE para string UTF-8
 */
export function decodeIpasgoBuffer(buffer: Buffer): string {
  // Verificar se é UTF-16LE (bytes alternados com 0x00)
  if (buffer.length >= 4) {
    // UTF-16LE sem BOM: segundo byte geralmente é 0x00 para ASCII
    const isUtf16LE = buffer[1] === 0x00 && buffer[3] === 0x00;
    // UTF-16LE com BOM (FF FE)
    const hasBOM = buffer[0] === 0xFF && buffer[1] === 0xFE;
    
    if (isUtf16LE || hasBOM) {
      const startOffset = hasBOM ? 2 : 0;
      return buffer.slice(startOffset).toString('utf16le');
    }
  }
  
  // Tentar UTF-8
  return buffer.toString('utf-8');
}

export function parseIpasgoCSV(
  csvContent: string,
  arquivoId: number,
  convenioId: number | undefined,
  estabelecimentoId: number | undefined,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date
): IpasgoCSVResult {
  try {
    const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
      return { success: false, items: [], codigoPrestador: '', nomePrestador: '', totalLotes: 0, totalGuias: 0, totalItens: 0, error: 'Arquivo CSV muito curto' };
    }
    
    // Verificar cabeçalho
    const header = lines[0];
    if (!detectIpasgoFormat(header)) {
      return { success: false, items: [], codigoPrestador: '', nomePrestador: '', totalLotes: 0, totalGuias: 0, totalItens: 0, error: 'Arquivo não é um CSV IPASGO válido' };
    }
    
    // Mapear colunas pelo cabeçalho
    const colunas = header.split(';').map(c => c.trim());
    const colIndex: Record<string, number> = {};
    colunas.forEach((col, idx) => { colIndex[col] = idx; });
    
    const items: InsertRecebimentoExcel[] = [];
    const lotesSet = new Set<string>();
    const guiasSet = new Set<string>();
    let codigoPrestador = '';
    let nomePrestador = '';
    let sequencialPorGuia: Record<string, number> = {};
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const campos = line.split(';');
      if (campos.length < 20) continue;
      
      const get = (colName: string): string => {
        const idx = colIndex[colName];
        if (idx === undefined) return '';
        return (campos[idx] || '').trim();
      };
      
      // Extrair dados
      const fatura = get('FATURA');
      const pagamento = get('PAGAMENTO');
      const codPrestadorPag = get('CODIGO_PRESTADOR_PAGAMENTO');
      const nomePrestadorPag = get('NOME_PRESTADOR_PAGAMENTO');
      const competencia = get('COMPETENCIA');
      const entrega = get('ENTREGA');
      const protocolo = get('PROTOCOLO');
      const lote = get('LOTE');
      const codPrestadorXml = get('CODIGO_PRESTADOR_XML');
      const guiaOperadora = get('NUMERO_GUIA_OPERADORA');
      const senha = get('SENHA');
      const carteiraBeneficiario = get('CARTEIRA_BENEFICIARIO');
      const nomeBeneficiario = get('NOME_BENEFICIARIO');
      const realizacao = get('REALIZACAO');
      const codigoProcedimento = get('CODIGO_PROCEDIMENTO');
      const descricaoProcedimento = get('DESCRICAO_PROCEDIMENTO');
      const grauParticipacao = get('GRAU_PARTICIPACAO');
      const tipoGuia = get('TIPO_GUIA');
      const quantidade = get('QUANTIDADE');
      const valorUnitario = get('VALOR_UNITARIO');
      const valorGlosado = get('VALOR_GLOSADO');
      const valorTotalPagamento = get('VALOR_TOTAL_PAGAMENTO');
      const justificativaGlosa = get('JUSTIFICATIVA_GLOSA');
      const observacaoGlosa = get('OBSERVACAO_GLOSA');
      const situacao = get('SITUACAO');
      const codProfSolicitante = get('CODIGO_PROFISSIONAL_SOLICITANTE');
      const nomeProfSolicitante = get('NOME_PROFISSIONAL_SOLICITANTE');
      const codPrestadorExecutante = get('CODIGO_PRESTADOR_EXECUTANTE');
      const nomePrestadorExecutante = get('NOME_PRESTADOR_EXECUTANTE');
      const tipoLancamento = get('TIPO_LANCAMENTO');
      
      // Guardar info do prestador
      if (!codigoPrestador && codPrestadorPag) codigoPrestador = codPrestadorPag;
      if (!nomePrestador && nomePrestadorPag) nomePrestador = nomePrestadorPag;
      
      // Rastrear lotes e guias
      if (lote) lotesSet.add(lote);
      if (guiaOperadora) guiasSet.add(guiaOperadora);
      
      // Sequencial por guia
      const guiaKey = guiaOperadora || `line_${i}`;
      sequencialPorGuia[guiaKey] = (sequencialPorGuia[guiaKey] || 0) + 1;
      const seq = sequencialPorGuia[guiaKey];
      
      // Parsear valores
      const vlrUnitario = parseValorBR(valorUnitario);
      const vlrGlosa = parseValorBR(valorGlosado);
      const vlrPagamento = parseValorBR(valorTotalPagamento);
      const qtd = parseInt(quantidade) || 1;
      
      // Valor informado = unitário * quantidade
      const vlrInformado = vlrUnitario * qtd;
      
      // Determinar situação do item
      let situacaoItem = 'PAGO';
      if (situacao === 'GLOSADO' || (vlrGlosa > 0 && vlrPagamento === 0)) {
        situacaoItem = 'GLOSADO';
      } else if (vlrGlosa > 0 && vlrPagamento > 0) {
        situacaoItem = 'PARCIAL';
      } else if (situacao) {
        situacaoItem = situacao;
      }
      
      // Data de referência
      const dataRealizacao = parseDataBR(realizacao);
      const dataPag = parseDataBR(pagamento);
      
      // Competência como data de referência (formato MM/AAAA -> YYYY-MM-01)
      let dataRefStr: string | null = null;
      if (dataReferenciaUpload) {
        dataRefStr = dataReferenciaUpload.toISOString().split('T')[0];
      } else if (competencia) {
        const compMatch = competencia.match(/(\d{2})\/(\d{4})/);
        if (compMatch) {
          dataRefStr = `${compMatch[2]}-${compMatch[1]}-01`;
        }
      }
      
      const dataPagStr = dataPag 
        ? dataPag.toISOString().split('T')[0]
        : dataPagamentoUpload?.toISOString().split('T')[0] || null;
      
      // Extrair código de glosa da justificativa
      let codigoGlosa: string | null = null;
      if (justificativaGlosa) {
        const codGlosaMatch = justificativaGlosa.match(/^(\d{3,4})\s/);
        if (codGlosaMatch) {
          codigoGlosa = codGlosaMatch[1];
        }
      }
      
      const item: InsertRecebimentoExcel = {
        arquivoId,
        convenioId: convenioId || null,
        estabelecimentoId: estabelecimentoId || null,
        dataReferencia: dataRefStr,
        dataPagamentoUpload: dataPagStr,
        
        // Dados do lote/protocolo
        dataPagto: dataPag || dataPagamentoUpload || null,
        protocoloTiss: protocolo || null,
        lotePrestador: lote || null,
        
        // Guia
        numeroGuia: guiaOperadora || null,
        seq,
        
        // Beneficiário
        nomeBeneficiario: nomeBeneficiario || null,
        
        // Execução
        dataExecucao: dataRealizacao || null,
        
        // Item/Procedimento
        item: codigoProcedimento || null,
        itemDesc: descricaoProcedimento || null,
        quantidade: qtd,
        
        // Valores
        valorPagamento: vlrPagamento.toFixed(2),
        valorInformado: vlrInformado.toFixed(2),
        valorGlosa: vlrGlosa > 0 ? vlrGlosa.toFixed(2) : null,
        
        // Glosa
        codigoGlosa: codigoGlosa || null,
        erroTiss: justificativaGlosa || observacaoGlosa || null,
        situacaoItem,
        
        // Código prestador
        codigoPrestadorPagamento: codPrestadorPag || null,
      };
      
      items.push(item);
    }
    
    return {
      success: true,
      items,
      codigoPrestador,
      nomePrestador,
      totalLotes: lotesSet.size,
      totalGuias: guiasSet.size,
      totalItens: items.length,
    };
  } catch (error: any) {
    return {
      success: false,
      items: [],
      codigoPrestador: '',
      nomePrestador: '',
      totalLotes: 0,
      totalGuias: 0,
      totalItens: 0,
      error: error.message || 'Erro ao processar CSV IPASGO',
    };
  }
}
