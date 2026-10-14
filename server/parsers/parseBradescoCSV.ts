/**
 * Parser específico para Demonstrativo de Pagamento Bradesco (CSV)
 * 
 * Formato do CSV Bradesco:
 * - Linha 1: "Extrato de Pagamento"
 * - Linha 2: CNPJ/CPF e Código do prestador
 * - Seções separadas por "Liberado para crédito em DD/MM/AAAA" (data de pagamento do lote)
 * - Cada seção tem um cabeçalho de colunas
 * - Linhas de paciente: Data do Evento, Nome, (vazio), (vazio), (vazio), (vazio), Guia, Doc Original, Protocolo, Valor Total
 * - Linhas de procedimento: (vazio), (vazio), Código, Descrição, Qtd Solicitada, Qtd Liberada, (vazio), (vazio), (vazio), Valor, Justificativa
 * - Itens glosados têm Qtd Liberada = 0 e justificativa preenchida
 * 
 * Saída: registros compatíveis com InsertRecebimentoExcel (tabela recebimentos_excel)
 * para integrar no pipeline existente de syncDemonstrativo.
 */

import type { InsertRecebimentoExcel } from "../../drizzle/schema";

export interface BradescoCSVResult {
  success: boolean;
  items: InsertRecebimentoExcel[];
  cnpjPrestador: string;
  codigoPrestador: string;
  totalLotes: number;
  totalGuias: number;
  totalItens: number;
  error?: string;
}

interface LoteInfo {
  dataPagamento: Date; // Date object para compatibilidade com InsertRecebimentoExcel
  valorTotal: number;
}

interface GuiaAtual {
  dataEvento: Date;
  nomeBeneficiario: string;
  guiaOperadora: string;
  docOriginal: string;
  protocolo: string;
  valorTotalGuia: number;
}

function parseDataBR(dataStr: string): Date | null {
  // Formato: DD/MM/AAAA ou " DD/MM/AAAA"
  const trimmed = dataStr.trim();
  const match = trimmed.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
}

function parseValorBR(valorStr: string): number {
  // Formato: "152,46" ou "2.843,60"
  if (!valorStr) return 0;
  const cleaned = valorStr.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVLine(line: string, delimiter: ',' | ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function detectDelimiter(lines: string[]): ',' | ';' {
  // Cabeçalho sem valores financeiros; separadores dentro de aspas
  // não participam da detecção, preservando decimais e descrições.
  const header = lines.find(line => line.includes('Data do Evento')) || lines[0] || '';
  return parseCSVLine(header, ';').length > parseCSVLine(header, ',').length ? ';' : ',';
}

export function parseBradescoCSV(
  csvContent: string,
  arquivoId: number,
  convenioId: number | undefined,
  estabelecimentoId: number | undefined,
  dataReferenciaUpload?: Date,
  dataPagamentoUpload?: Date
): BradescoCSVResult {
  try {
    const lines = csvContent.split(/\r?\n/);
    
    if (lines.length < 4) {
      return { success: false, items: [], cnpjPrestador: '', codigoPrestador: '', totalLotes: 0, totalGuias: 0, totalItens: 0, error: 'Arquivo CSV muito curto' };
    }
    
    // Verificar se é um arquivo Bradesco
    const firstLine = lines[0].replace(/"/g, '').trim();
    if (!firstLine.includes('Extrato de Pagamento')) {
      return { success: false, items: [], cnpjPrestador: '', codigoPrestador: '', totalLotes: 0, totalGuias: 0, totalItens: 0, error: 'Arquivo não é um Extrato de Pagamento Bradesco' };
    }
    
    // Extrair CNPJ e código do prestador (linha 2)
    const delimiter = detectDelimiter(lines);
    const linha2 = parseCSVLine(lines[1], delimiter);
    let cnpjPrestador = '';
    let codigoPrestador = '';
    
    for (const campo of linha2) {
      const cnpjMatch = campo.match(/CNPJ\/CPF\s*-\s*([\d./-]+)/);
      if (cnpjMatch) cnpjPrestador = cnpjMatch[1].trim();
      
      const codMatch = campo.match(/C[oó]digo\s*-\s*(\w+)/);
      if (codMatch) codigoPrestador = codMatch[1].trim();
    }
    
    const items: InsertRecebimentoExcel[] = [];
    let loteAtual: LoteInfo | null = null;
    let guiaAtual: GuiaAtual | null = null;
    let totalLotes = 0;
    let totalGuias = 0;
    let sequencialItem = 0;
    
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const campos = parseCSVLine(line, delimiter);
      if (campos.length < 2) continue;
      
      const primeiroCampo = campos[0].trim();
      
      // Detectar início de lote: "Liberado para crédito em DD/MM/AAAA"
      if (primeiroCampo.includes('Liberado para cr') || primeiroCampo.includes('Liberado para Cr')) {
        const dataMatch = primeiroCampo.match(/(\d{2}\/\d{2}\/\d{4})/);
        
        // Buscar valor do lote (último campo numérico)
        let valorLote = 0;
        for (let j = campos.length - 1; j >= 5; j--) {
          const v = parseValorBR(campos[j]);
          if (v > 0) {
            valorLote = v;
            break;
          }
        }
        
        if (dataMatch) {
          const dataPag = parseDataBR(dataMatch[1]);
          if (dataPag) {
            loteAtual = { dataPagamento: dataPag, valorTotal: valorLote };
            totalLotes++;
          }
        }
        guiaAtual = null;
        continue;
      }
      
      // Pular linhas de cabeçalho
      if (primeiroCampo === 'Data do Evento' || primeiroCampo.includes('------')) {
        continue;
      }
      
      // Detectar linha de paciente/guia (tem data no primeiro campo)
      const dataEvento = parseDataBR(primeiroCampo);
      if (dataEvento && campos.length >= 10) {
        const nome = campos[1]?.trim() || '';
        const guiaOp = campos[6]?.trim() || '';
        const docOriginal = campos[7]?.trim() || '';
        const protocolo = campos[8]?.trim() || '';
        
        // Buscar valor total da guia
        let valorGuia = 0;
        for (let j = 9; j < campos.length; j++) {
          const v = parseValorBR(campos[j]);
          if (v > 0) {
            valorGuia = v;
            break;
          }
        }
        
        guiaAtual = {
          dataEvento,
          nomeBeneficiario: nome,
          guiaOperadora: guiaOp,
          docOriginal,
          protocolo,
          valorTotalGuia: valorGuia,
        };
        totalGuias++;
        sequencialItem = 0;
        continue;
      }
      
      // Detectar linha de procedimento (primeiro campo vazio, tem código no campo 2)
      if (!primeiroCampo && campos[1]?.trim() === '' && campos[2]?.trim() && guiaAtual) {
        const codigoProcedimento = campos[2]?.trim() || '';
        const descricao = campos[3]?.trim() || '';
        const qtdSolicitada = parseInt(campos[4]?.trim() || '0') || 0;
        const qtdLiberada = parseInt(campos[5]?.trim() || '0') || 0;
        
        // Buscar valor do item
        let valorItem = 0;
        for (let j = 9; j < campos.length; j++) {
          const v = parseValorBR(campos[j]);
          if (v >= 0 && campos[j]?.trim()) {
            valorItem = v;
            break;
          }
        }
        
        // Buscar justificativa (campo após o valor)
        let justificativa = '';
        for (let j = 10; j < campos.length; j++) {
          const jst = campos[j]?.trim();
          if (jst && jst.length > 3 && !jst.includes('---')) {
            justificativa = jst;
            break;
          }
        }
        
        sequencialItem++;
        
        // Determinar situação do item
        let situacaoItem = 'PAGO';
        let valorPago = valorItem;
        let valorGlosa = 0;
        
        if (qtdLiberada === 0 && qtdSolicitada > 0) {
          // Item totalmente glosado
          situacaoItem = 'GLOSADO';
          valorGlosa = valorItem;
          valorPago = 0;
        } else if (qtdLiberada < qtdSolicitada && qtdSolicitada > 0) {
          // Item parcialmente glosado
          situacaoItem = 'PARCIAL';
          const proporcaoGlosa = (qtdSolicitada - qtdLiberada) / qtdSolicitada;
          valorGlosa = Math.round(valorItem * proporcaoGlosa * 100) / 100;
          valorPago = valorItem - valorGlosa;
        }
        
        // Extrair código de glosa da justificativa (ex: "1407 SERVICO SOLICITADO...")
        let codigoGlosa: string | null = null;
        if (justificativa) {
          const codGlosaMatch = justificativa.match(/^(\d{3,4})\s/);
          if (codGlosaMatch) {
            codigoGlosa = codGlosaMatch[1];
          }
        }
        
        // Formatar data de referência como string YYYY-MM-DD
        const dataRefStr = dataReferenciaUpload 
          ? dataReferenciaUpload.toISOString().split('T')[0]
          : guiaAtual.dataEvento.toISOString().split('T')[0];
        
        const dataPagStr = loteAtual?.dataPagamento 
          ? loteAtual.dataPagamento.toISOString().split('T')[0]
          : dataPagamentoUpload?.toISOString().split('T')[0] || null;
        
        const item: InsertRecebimentoExcel = {
          arquivoId,
          convenioId: convenioId || null,
          estabelecimentoId: estabelecimentoId || null,
          dataReferencia: dataRefStr,
          dataPagamentoUpload: dataPagStr,
          
          // Dados do lote
          dataPagto: loteAtual?.dataPagamento || dataPagamentoUpload || null,
          protocoloTiss: guiaAtual.protocolo || null,
          
          // Guia
          numeroGuia: guiaAtual.guiaOperadora || null,
          seq: sequencialItem,
          
          // Beneficiário
          nomeBeneficiario: guiaAtual.nomeBeneficiario || null,
          
          // Execução
          dataExecucao: guiaAtual.dataEvento || null,
          
          // Item/Procedimento
          item: codigoProcedimento || null,
          itemDesc: descricao || null,
          quantidade: qtdLiberada || qtdSolicitada || null,
          
          // Valores
          valorPagamento: valorPago.toFixed(2),
          valorInformado: valorItem.toFixed(2),
          valorGlosa: valorGlosa > 0 ? valorGlosa.toFixed(2) : null,
          
          // Glosa
          codigoGlosa: codigoGlosa || null,
          erroTiss: justificativa || null,
          situacaoItem,
          
          // Doc Original como lotePrestador
          lotePrestador: guiaAtual.docOriginal || null,
          
          // Código prestador do arquivo
          codigoPrestadorPagamento: codigoPrestador || null,
        };
        
        items.push(item);
      }
    }
    
    if (items.length === 0) {
      return {
        success: false, items: [], cnpjPrestador, codigoPrestador,
        totalLotes, totalGuias, totalItens: 0,
        error: 'Extrato Bradesco sem itens reconhecidos. Confira o layout do arquivo.',
      };
    }

    return {
      success: true,
      items,
      cnpjPrestador,
      codigoPrestador,
      totalLotes,
      totalGuias,
      totalItens: items.length,
    };
  } catch (error: any) {
    return {
      success: false,
      items: [],
      cnpjPrestador: '',
      codigoPrestador: '',
      totalLotes: 0,
      totalGuias: 0,
      totalItens: 0,
      error: error.message || 'Erro ao processar CSV Bradesco',
    };
  }
}
