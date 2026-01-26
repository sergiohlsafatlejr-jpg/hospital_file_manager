import * as xml2js from "xml2js";
import * as XLSX from "xlsx";
// pdf-parse will be dynamically imported due to ESM compatibility issues
import { InsertProcedimento } from "../drizzle/schema";
import { traduzirMotivoGlosa } from "../shared/glossaryGlosas";

export interface ParsedProcedimento {
  codigo: string;
  descricao?: string;
  quantidade?: number;
  valorUnitario?: number;
  valorTotal?: number;
  dataExecucao?: Date;
  pacienteNome?: string;
  pacienteCarteirinha?: string;
  guiaNumero?: string;
  senha?: string; // Senha da autorização
  nomeMedico?: string;
  crmMedico?: string;
  motivoGlosa?: string;
  valorGlosado?: number;
  codigoDespesa?: string; // Código de despesa ANS (1=gás, 2=medicamento, 3=material, 5=diária, 7=taxa)
  tipoDespesa?: 'gas' | 'medicamento' | 'material' | 'diaria' | 'taxa' | 'procedimento' | 'outros';
  dadosExtras?: Record<string, unknown>;
  // Chave composta para identificar faturamento único
  numeroLote?: string; // Número do lote do cabeçalho TISS
  sequencialTransacao?: string; // Sequencial da transação da guia
}

export interface ParseResult {
  success: boolean;
  procedimentos: ParsedProcedimento[];
  rawData?: unknown;
  error?: string;
}

/**
 * Get text value from XML node (handles both string and object with _ property)
 */
function getTextValue(node: unknown): string | undefined {
  if (node === null || node === undefined) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "_" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["_"]);
  }
  return undefined;
}

/**
 * Parse number from various formats
 */
function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const str = getTextValue(value);
  if (!str) return undefined;
  const num = parseFloat(str.replace(",", "."));
  return isNaN(num) ? undefined : num;
}

/**
 * Parse date from string
 * Supports Brazilian format DD/MM/YYYY and ISO format YYYY-MM-DD
 */
function parseDate(value: unknown): Date | undefined {
  const str = getTextValue(value);
  if (!str) return undefined;
  
  // Try to detect Brazilian format DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1; // Month is 0-indexed
    const year = parseInt(brMatch[3], 10);
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // Try to detect Brazilian format DD/MM/YYYY HH:MM:SS
  const brMatchTime = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (brMatchTime) {
    const day = parseInt(brMatchTime[1], 10);
    const month = parseInt(brMatchTime[2], 10) - 1;
    const year = parseInt(brMatchTime[3], 10);
    const hour = parseInt(brMatchTime[4], 10);
    const minute = parseInt(brMatchTime[5], 10);
    const second = brMatchTime[6] ? parseInt(brMatchTime[6], 10) : 0;
    const date = new Date(year, month, day, hour, minute, second);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // Fallback to standard Date parsing (ISO format, etc.)
  const date = new Date(str);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parse XML file content (TISS format commonly used in Brazil)
 * Supports both sent files (prestadorParaOperadora) and return files (operadoraParaPrestador)
 */
export async function parseXML(content: Buffer | string): Promise<ParseResult> {
  try {
    // Configure parser to strip namespace prefixes
    const parser = new xml2js.Parser({ 
      explicitArray: false, 
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix],
      attrNameProcessors: [xml2js.processors.stripPrefix]
    });
    
    const xmlString = typeof content === "string" ? content : content.toString("utf-8");
    const result = await parser.parseStringPromise(xmlString);
    
    const procedimentos: ParsedProcedimento[] = [];
    
    // Extrair número do lote do cabeçalho TISS
    const numeroLote = extractNumeroLote(result);
    if (numeroLote) {
      console.log('[Parser] Número do lote TISS:', numeroLote);
    }
    
    // Check if this is a GEAP Portal format (GuiaPortalXml)
    const guiasGEAP = findGuiasGEAP(result);
    if (guiasGEAP.length > 0) {
      console.log('[Parser] Detected GEAP Portal format, found', guiasGEAP.length, 'guias');
      for (const guiaPortal of guiasGEAP) {
        const procsGEAP = extractProcedimentosFromGEAP(guiaPortal);
        // Adicionar numeroLote aos procedimentos
        for (const proc of procsGEAP) {
          procedimentos.push({
            ...proc,
            numeroLote,
          });
        }
      }
    }
    // Check if this is a demonstrativo de retorno (operadoraParaPrestador)
    else {
      const demonstrativos = findDemonstrativosRetorno(result);
      if (demonstrativos.length > 0) {
        // Process demonstrativo de retorno
        for (const demonstrativo of demonstrativos) {
          const procsRetorno = extractProcedimentosFromDemonstrativo(demonstrativo);
          // Adicionar numeroLote aos procedimentos
          for (const proc of procsRetorno) {
            procedimentos.push({
              ...proc,
              numeroLote,
            });
          }
        }
      } else {
        // Process regular guias (prestadorParaOperadora) com guiasTISS
        const guiasComSequencial = findGuiasComSequencial(result);
        
        for (const { guia, sequencialTransacao } of guiasComSequencial) {
          const guiaNumero = extractGuiaNumero(guia);
          const pacienteCarteirinha = extractPacienteCarteirinha(guia);
          
          if (sequencialTransacao) {
            console.log(`[Parser] Guia ${guiaNumero} - Sequencial: ${sequencialTransacao}`);
          }
          
          // Extract procedimentos executados
          const procedimentosExecutados = extractProcedimentosExecutados(guia);
          for (const proc of procedimentosExecutados) {
            procedimentos.push({
              ...proc,
              guiaNumero: proc.guiaNumero || guiaNumero,
              pacienteCarteirinha: proc.pacienteCarteirinha || pacienteCarteirinha,
              numeroLote,
              sequencialTransacao,
            });
          }
          
          // Extract outras despesas (servicosExecutados)
          const outrasDespesas = extractOutrasDespesas(guia);
          for (const proc of outrasDespesas) {
            procedimentos.push({
              ...proc,
              guiaNumero: proc.guiaNumero || guiaNumero,
              pacienteCarteirinha: proc.pacienteCarteirinha || pacienteCarteirinha,
              numeroLote,
              sequencialTransacao,
            });
          }
        }
      }
    }
    
    return {
      success: true,
      procedimentos,
      rawData: result,
    };
  } catch (error) {
    return {
      success: false,
      procedimentos: [],
      error: error instanceof Error ? error.message : "Erro ao processar XML",
    };
  }
}

/**
 * Find demonstrativos de retorno in the XML structure
 * Path: mensagemTISS -> operadoraParaPrestador -> demonstrativosRetorno -> demonstrativoAnaliseConta
 */
function findDemonstrativosRetorno(obj: unknown): unknown[] {
  const demonstrativos: unknown[] = [];
  
  function search(node: unknown, depth: number = 0): void {
    if (!node || typeof node !== "object" || depth > 10) return;
    
    const record = node as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      
      // Skip attributes and simple values
      if (key === '$' || typeof value !== 'object' || value === null) continue;
      
      // Check for demonstrativoAnaliseConta
      if (lowerKey === 'demonstrativoanaliseconta') {
        if (Array.isArray(value)) {
          demonstrativos.push(...value);
        } else {
          demonstrativos.push(value);
        }
      } else {
        // Continue searching in nested objects
        search(value, depth + 1);
      }
    }
  }
  
  search(obj);
  return demonstrativos;
}

/**
 * Extract procedimentos from demonstrativo de retorno
 * Structure: dadosConta -> dadosProtocolo -> relacaoGuias -> detalhesGuia
 * Namespace TISS: http://www.ans.gov.br/padroes/tiss/schemas
 */
function extractProcedimentosFromDemonstrativo(demonstrativo: unknown): ParsedProcedimento[] {
  if (!demonstrativo || typeof demonstrativo !== "object") return [];
  
  const procedimentos: ParsedProcedimento[] = [];
  const record = demonstrativo as Record<string, unknown>;
  
  // Get dadosConta
  const dadosConta = record["dadosConta"] as Record<string, unknown> | undefined;
  if (!dadosConta) return [];
  
  // Get dadosProtocolo (can be array or single)
  let protocolos = dadosConta["dadosProtocolo"];
  if (!protocolos) return [];
  if (!Array.isArray(protocolos)) protocolos = [protocolos];
  
  for (const protocolo of protocolos as unknown[]) {
    if (!protocolo || typeof protocolo !== "object") continue;
    const protocoloRecord = protocolo as Record<string, unknown>;
    
    // Get relacaoGuias (can be array or single)
    let guias = protocoloRecord["relacaoGuias"];
    if (!guias) continue;
    if (!Array.isArray(guias)) guias = [guias];
    
    for (const guia of guias as unknown[]) {
      if (!guia || typeof guia !== "object") continue;
      const guiaRecord = guia as Record<string, unknown>;
      
      const guiaNumero = getTextValue(guiaRecord["numeroGuiaPrestador"]) || 
                         getTextValue(guiaRecord["numeroGuiaOperadora"]);
      const pacienteCarteirinha = getTextValue(guiaRecord["numeroCarteira"]);
      const pacienteNome = getTextValue(guiaRecord["nomeBeneficiario"]);
      const senha = getTextValue(guiaRecord["senha"]);
      const atendimento = getTextValue(guiaRecord["numeroAtendimento"]);
      
      // Get motivos de glosa da guia
      let motivosGlosaGuia: string[] = [];
      let motivoGlosaGuiaItems = guiaRecord["motivoGlosaGuia"];
      if (motivoGlosaGuiaItems) {
        if (!Array.isArray(motivoGlosaGuiaItems)) motivoGlosaGuiaItems = [motivoGlosaGuiaItems];
        for (const motivo of motivoGlosaGuiaItems as unknown[]) {
          if (motivo && typeof motivo === "object") {
            const motivoRecord = motivo as Record<string, unknown>;
            const descricao = getTextValue(motivoRecord["descricaoGlosa"]);
            const codigo = getTextValue(motivoRecord["codigoGlosa"]);
            if (codigo) {
              // Traduzir código de glosa para descrição legível
              motivosGlosaGuia.push(traduzirMotivoGlosa(codigo));
            } else if (descricao) {
              motivosGlosaGuia.push(descricao);
            }
          }
        }
      }
      
      // Get detalhesGuia (can be array or single)
      let detalhes = guiaRecord["detalhesGuia"];
      if (!detalhes) continue;
      if (!Array.isArray(detalhes)) detalhes = [detalhes];
      
      for (const detalhe of detalhes as unknown[]) {
        if (!detalhe || typeof detalhe !== "object") continue;
        const detalheRecord = detalhe as Record<string, unknown>;
        
        // Get procedimento info
        const procedimentoNode = detalheRecord["procedimento"] as Record<string, unknown> | undefined;
        const codigo = procedimentoNode ? 
          getTextValue(procedimentoNode["codigoProcedimento"]) : 
          getTextValue(detalheRecord["codigoProcedimento"]);
        const descricao = procedimentoNode ? 
          getTextValue(procedimentoNode["descricaoProcedimento"]) : 
          getTextValue(detalheRecord["descricaoProcedimento"]);
        
        if (!codigo) continue;
        
        const dataRealizacao = parseDate(detalheRecord["dataRealizacao"]);
        const valorInformado = parseNumber(detalheRecord["valorInformado"]);
        const valorProcessado = parseNumber(detalheRecord["valorProcessado"]);
        const valorLiberado = parseNumber(detalheRecord["valorLiberado"]);
        const quantidade = parseNumber(detalheRecord["qtdExecutada"]) || 1;
        
        // Get glosa info from relacaoGlosa
        let valorGlosado = 0;
        let motivoGlosa = "";
        const relacaoGlosa = detalheRecord["relacaoGlosa"] as Record<string, unknown> | undefined;
        if (relacaoGlosa) {
          valorGlosado = parseNumber(relacaoGlosa["valorGlosa"]) || 0;
          const tipoGlosa = getTextValue(relacaoGlosa["tipoGlosa"]);
          if (tipoGlosa) {
            // Traduzir código de glosa para descrição legível
            motivoGlosa = traduzirMotivoGlosa(tipoGlosa);
          }
        }
        
        // If no specific glosa but there are guia-level glosas, use those
        if (!motivoGlosa && motivosGlosaGuia.length > 0) {
          motivoGlosa = motivosGlosaGuia.join("; ");
        }
        
        // Calculate glosa from difference if not explicit
        if (valorGlosado === 0 && valorInformado && valorLiberado !== undefined) {
          valorGlosado = Math.max(0, valorInformado - valorLiberado);
        }
        
        // Extrair código de glosa do relacaoGlosa
        let codigoGlosa = '';
        let descricaoGlosa = '';
        if (relacaoGlosa) {
          codigoGlosa = getTextValue(relacaoGlosa["codigoGlosa"]) || getTextValue(relacaoGlosa["tipoGlosa"]) || '';
          descricaoGlosa = getTextValue(relacaoGlosa["descricaoGlosa"]) || '';
        }
        
        procedimentos.push({
          codigo,
          descricao,
          quantidade,
          valorUnitario: valorInformado ? valorInformado / quantidade : undefined,
          valorTotal: valorLiberado !== undefined ? valorLiberado : valorInformado,
          dataExecucao: dataRealizacao,
          guiaNumero,
          senha,
          pacienteNome,
          pacienteCarteirinha,
          motivoGlosa: motivoGlosa || undefined,
          valorGlosado: valorGlosado > 0 ? valorGlosado : undefined,
          dadosExtras: {
            valorInformado,
            valorProcessado,
            valorLiberado,
            valorGlosado: valorGlosado > 0 ? valorGlosado : undefined,
            motivoGlosa: motivoGlosa || undefined,
            codigoGlosa: codigoGlosa || undefined,
            descricaoGlosa: descricaoGlosa || undefined,
            atendimento: atendimento || undefined,
          },
        });
      }
    }
  }
  
  return procedimentos;
}

/**
 * Find all guias in the XML structure
 * Navigates through: mensagemTISS -> prestadorParaOperadora -> loteGuias -> guiasTISS -> guiaSP-SADT/guiaConsulta/etc
 */
function findGuias(obj: unknown): unknown[] {
  const guias: unknown[] = [];
  
  function search(node: unknown, depth: number = 0): void {
    if (!node || typeof node !== "object" || depth > 10) return;
    
    const record = node as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      
      // Skip attributes and simple values
      if (key === '$' || typeof value !== 'object' || value === null) continue;
      
      // Check if this is a guia node (guiaSP-SADT, guiaConsulta, etc.)
      // Must start with "guia" but not be "guias" or "guiasTISS"
      if (lowerKey.startsWith('guia') && lowerKey !== 'guiastiss' && !lowerKey.includes('numero')) {
        if (Array.isArray(value)) {
          guias.push(...value);
        } else {
          guias.push(value);
        }
      } else {
        // Continue searching in nested objects
        search(value, depth + 1);
      }
    }
  }
  
  search(obj);
  return guias;
}

/**
 * Extract número do lote from TISS header
 * Path: mensagemTISS -> cabecalho -> numeroLote
 */
function extractNumeroLote(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  
  function search(node: unknown, depth: number = 0): string | undefined {
    if (!node || typeof node !== "object" || depth > 10) return undefined;
    
    const record = node as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      
      // Skip attributes
      if (key === '$') continue;
      
      // Check for numeroLote in cabecalho
      if (lowerKey === 'numerolote') {
        const lote = getTextValue(value);
        if (lote) return lote;
      }
      
      // Continue searching in nested objects
      if (typeof value === 'object' && value !== null) {
        const found = search(value, depth + 1);
        if (found) return found;
      }
    }
    
    return undefined;
  }
  
  return search(obj);
}

/**
 * Find all guias with their sequencialTransacao
 * Structure: mensagemTISS -> prestadorParaOperadora -> loteGuias -> guiasTISS
 * Each guiasTISS contains sequencialTransacao and the actual guia (guiaSP-SADT, etc.)
 */
function findGuiasComSequencial(obj: unknown): Array<{ guia: unknown; sequencialTransacao?: string }> {
  const result: Array<{ guia: unknown; sequencialTransacao?: string }> = [];
  
  function searchGuiasTISS(node: unknown, depth: number = 0): void {
    if (!node || typeof node !== "object" || depth > 15) return;
    
    const record = node as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      
      // Skip attributes and simple values
      if (key === '$' || typeof value !== 'object' || value === null) continue;
      
      // Check if this is guiasTISS container
      if (lowerKey === 'guiastiss') {
        const guiasTISSItems = Array.isArray(value) ? value : [value];
        
        for (const guiasTISSItem of guiasTISSItems) {
          if (!guiasTISSItem || typeof guiasTISSItem !== 'object') continue;
          
          const guiasTISSRecord = guiasTISSItem as Record<string, unknown>;
          
          // Extract sequencialTransacao from this guiasTISS
          const sequencialTransacao = getTextValue(guiasTISSRecord['sequencialTransacao']);
          
          // Find the actual guia inside guiasTISS (guiaSP-SADT, guiaConsulta, guiaResumoInternacao, etc.)
          for (const [guiaKey, guiaValue] of Object.entries(guiasTISSRecord)) {
            const guiaKeyLower = guiaKey.toLowerCase();
            
            // Check if this is a guia node
            if (guiaKeyLower.startsWith('guia') && 
                guiaKeyLower !== 'guiastiss' && 
                !guiaKeyLower.includes('numero') &&
                typeof guiaValue === 'object' && 
                guiaValue !== null) {
              
              const guiaItems = Array.isArray(guiaValue) ? guiaValue : [guiaValue];
              for (const guiaItem of guiaItems) {
                result.push({
                  guia: guiaItem,
                  sequencialTransacao,
                });
              }
            }
          }
        }
      } else {
        // Continue searching in nested objects
        searchGuiasTISS(value, depth + 1);
      }
    }
  }
  
  searchGuiasTISS(obj);
  
  // Se não encontrou guias com sequencial, usar o método antigo (findGuias)
  if (result.length === 0) {
    const guias = findGuias(obj);
    for (const guia of guias) {
      result.push({ guia, sequencialTransacao: undefined });
    }
  }
  
  return result;
}

/**
 * Extract guia number from guia object
 */
function extractGuiaNumero(guia: unknown): string | undefined {
  if (!guia || typeof guia !== "object") return undefined;
  
  const record = guia as Record<string, unknown>;
  
  // Try cabecalhoGuia first
  const cabecalho = record["cabecalhoGuia"] as Record<string, unknown> | undefined;
  if (cabecalho) {
    const numero = getTextValue(cabecalho["numeroGuiaPrestador"]) || 
                   getTextValue(cabecalho["guiaPrincipal"]);
    if (numero) return numero;
  }
  
  // Try dadosAutorizacao
  const autorizacao = record["dadosAutorizacao"] as Record<string, unknown> | undefined;
  if (autorizacao) {
    const numero = getTextValue(autorizacao["numeroGuiaOperadora"]);
    if (numero) return numero;
  }
  
  return undefined;
}

/**
 * Extract paciente carteirinha from guia object
 */
function extractPacienteCarteirinha(guia: unknown): string | undefined {
  if (!guia || typeof guia !== "object") return undefined;
  
  const record = guia as Record<string, unknown>;
  const beneficiario = record["dadosBeneficiario"] as Record<string, unknown> | undefined;
  
  if (beneficiario) {
    return getTextValue(beneficiario["numeroCarteira"]);
  }
  
  return undefined;
}

/**
 * Extract procedimentos executados from guia
 */
function extractProcedimentosExecutados(guia: unknown): ParsedProcedimento[] {
  if (!guia || typeof guia !== "object") return [];
  
  const record = guia as Record<string, unknown>;
  const procedimentos: ParsedProcedimento[] = [];
  
  // Find procedimentosExecutados container
  const container = record["procedimentosExecutados"] as Record<string, unknown> | undefined;
  if (!container) return [];
  
  // Get procedimentoExecutado items
  let items = container["procedimentoExecutado"];
  if (!items) return [];
  
  // Ensure it's an array
  if (!Array.isArray(items)) {
    items = [items];
  }
  
  for (const item of items as unknown[]) {
    const proc = extractProcedimentoFromNode(item);
    if (proc) {
      procedimentos.push(proc);
    }
  }
  
  return procedimentos;
}

/**
 * Extract outras despesas (servicosExecutados) from guia
 */
function extractOutrasDespesas(guia: unknown): ParsedProcedimento[] {
  if (!guia || typeof guia !== "object") return [];
  
  const record = guia as Record<string, unknown>;
  const procedimentos: ParsedProcedimento[] = [];
  
  // Find outrasDespesas container
  const outrasDespesas = record["outrasDespesas"] as Record<string, unknown> | undefined;
  if (!outrasDespesas) return [];
  
  // Get despesa items
  let despesas = outrasDespesas["despesa"];
  if (!despesas) return [];
  
  // Ensure it's an array
  if (!Array.isArray(despesas)) {
    despesas = [despesas];
  }
  
  for (const despesa of despesas as unknown[]) {
    if (!despesa || typeof despesa !== "object") continue;
    
    const despesaRecord = despesa as Record<string, unknown>;
    
    // Get codigoDespesa from despesa node
    const codigoDespesa = getTextValue(despesaRecord["codigoDespesa"]);
    
    // Get servicosExecutados
    const servicos = despesaRecord["servicosExecutados"];
    if (!servicos) continue;
    
    const proc = extractServicoFromNode(servicos, codigoDespesa);
    if (proc) {
      procedimentos.push(proc);
    }
  }
  
  return procedimentos;
}

/**
 * Extract procedimento from procedimentoExecutado node
 */
function extractProcedimentoFromNode(node: unknown): ParsedProcedimento | null {
  if (!node || typeof node !== "object") return null;
  
  const record = node as Record<string, unknown>;
  
  // Get procedimento details (nested in "procedimento" object)
  const procedimentoNode = record["procedimento"] as Record<string, unknown> | undefined;
  
  let codigo: string | undefined;
  let descricao: string | undefined;
  
  let codigoTabela: string | undefined;
  
  if (procedimentoNode) {
    codigo = getTextValue(procedimentoNode["codigoProcedimento"]);
    descricao = getTextValue(procedimentoNode["descricaoProcedimento"]);
    codigoTabela = getTextValue(procedimentoNode["codigoTabela"]);
  }
  
  // Fallback to direct properties
  if (!codigo) {
    codigo = getTextValue(record["codigoProcedimento"]) || getTextValue(record["codigo"]);
  }
  if (!descricao) {
    descricao = getTextValue(record["descricaoProcedimento"]) || getTextValue(record["descricao"]);
  }
  if (!codigoTabela) {
    codigoTabela = getTextValue(record["codigoTabela"]);
  }
  
  // Use codigoProcedimento as main code, or codigoTabela as fallback
  if (!codigo && codigoTabela) {
    codigo = codigoTabela;
  }
  
  if (!codigo) return null;
  
  // Extract values
  const quantidade = parseNumber(record["quantidadeExecutada"]) || parseNumber(record["quantidade"]) || 1;
  const valorUnitario = parseNumber(record["valorUnitario"]);
  const valorTotal = parseNumber(record["valorTotal"]);
  const dataExecucao = parseDate(record["dataExecucao"]);
  
  // Extract medico from equipeSadt or identEquipe/identificacaoEquipe
  let nomeMedico: string | undefined;
  let crmMedico: string | undefined;
  
  // Try equipeSadt first (guiaSP-SADT)
  const equipeSadt = record["equipeSadt"] as Record<string, unknown> | undefined;
  if (equipeSadt) {
    nomeMedico = getTextValue(equipeSadt["nomeProf"]) || getTextValue(equipeSadt["nomeProfissional"]);
    crmMedico = getTextValue(equipeSadt["numeroConselhoProfissional"]);
  }
  
  // Try identEquipe (guiaResumoInternacao)
  if (!nomeMedico) {
    const identEquipe = record["identEquipe"] as Record<string, unknown> | undefined;
    if (identEquipe) {
      // identEquipe can contain identificacaoEquipe directly or as array
      let identificacaoEquipe = identEquipe["identificacaoEquipe"] as Record<string, unknown> | Record<string, unknown>[] | undefined;
      
      // If it's an array, take the first one
      if (Array.isArray(identificacaoEquipe)) {
        identificacaoEquipe = identificacaoEquipe[0] as Record<string, unknown>;
      }
      
      if (identificacaoEquipe) {
        nomeMedico = getTextValue(identificacaoEquipe["nomeProf"]) || getTextValue(identificacaoEquipe["nomeProfissional"]);
        crmMedico = getTextValue(identificacaoEquipe["numeroConselhoProfissional"]);
      }
    }
  }
  
  return {
    codigo,
    descricao,
    quantidade,
    valorUnitario,
    valorTotal,
    dataExecucao,
    nomeMedico,
    crmMedico,
    dadosExtras: record,
  };
}

/**
 * Converte código de despesa ANS para tipo de despesa
 * 1=gás, 2=medicamento, 3=material, 5=diária, 7=taxa
 */
function codigoDespesaParaTipo(codigoDespesa?: string): ParsedProcedimento['tipoDespesa'] {
  if (!codigoDespesa) return 'procedimento';
  
  const codigo = codigoDespesa.replace(/^0+/, ''); // Remove zeros à esquerda
  
  switch (codigo) {
    case '1': return 'gas';
    case '2': return 'medicamento';
    case '3': return 'material';
    case '5': return 'diaria';
    case '7': return 'taxa';
    default: return 'procedimento';
  }
}

/**
 * Extract procedimento from servicosExecutados node
 */
function extractServicoFromNode(node: unknown, codigoDespesa?: string): ParsedProcedimento | null {
  if (!node || typeof node !== "object") return null;
  
  const record = node as Record<string, unknown>;
  
  const codigo = getTextValue(record["codigoProcedimento"]) || getTextValue(record["codigo"]);
  if (!codigo) return null;
  
  const descricao = getTextValue(record["descricaoProcedimento"]) || getTextValue(record["descricao"]);
  const quantidade = parseNumber(record["quantidadeExecutada"]) || parseNumber(record["quantidade"]) || 1;
  const valorUnitario = parseNumber(record["valorUnitario"]);
  const valorTotal = parseNumber(record["valorTotal"]);
  const dataExecucao = parseDate(record["dataExecucao"]);
  
  // Extrair codigoDespesa do próprio nó se não foi passado
  const despesaCodigo = codigoDespesa || getTextValue(record["codigoDespesa"]);
  const tipoDespesa = codigoDespesaParaTipo(despesaCodigo);
  
  return {
    codigo,
    descricao,
    quantidade,
    valorUnitario,
    valorTotal,
    dataExecucao,
    codigoDespesa: despesaCodigo,
    tipoDespesa,
    dadosExtras: record,
  };
}

/**
 * Normaliza os nomes das colunas de uma linha do Excel
 * Remove espaços em branco extras no início, fim e múltiplos espaços consecutivos
 */
function normalizeColumnNames(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(row)) {
    // Remove espaços no início e fim, e substitui múltiplos espaços por um único
    const normalizedKey = key.trim().replace(/\s+/g, ' ');
    normalized[normalizedKey] = value;
  }
  
  return normalized;
}

/**
 * Parse Excel file content
 * Optimized for large files with streaming-like processing
 */
export async function parseExcel(content: Buffer): Promise<ParseResult> {
  try {
    const startTime = Date.now();
    console.log(`[Excel Parser] Starting parse, buffer size: ${(content.length / 1024).toFixed(1)} KB`);
    
    // Read workbook with maximum optimizations for large files
    const workbook = XLSX.read(content, { 
      type: "buffer",
      cellDates: true, // Parse dates automatically
      cellNF: false, // Skip number format parsing for speed
      cellStyles: false, // Skip style parsing for speed
      cellHTML: false, // Skip HTML parsing
      dense: false, // Use sparse array for memory efficiency
    });
    
    const procedimentos: ParsedProcedimento[] = [];
    let totalRows = 0;
    
    console.log(`[Excel Parser] Workbook loaded in ${((Date.now() - startTime) / 1000).toFixed(1)}s, sheets: ${workbook.SheetNames.length}`);
    
    for (const sheetName of workbook.SheetNames) {
      const sheetStart = Date.now();
      const sheet = workbook.Sheets[sheetName];
      
      // Use sheet_to_json with optimized options
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false, // Convert to strings for consistent processing
        defval: '', // Default empty values
        blankrows: false, // Skip blank rows
      });
      
      // Log colunas encontradas para debug (apenas primeira sheet)
      if (rawData.length > 0 && totalRows === 0) {
        const colunas = Object.keys(rawData[0]);
        console.log(`[Excel Parser] Sheet: ${sheetName}, Colunas: ${colunas.length}, Linhas: ${rawData.length}`);
        console.log(`[Excel Parser] Primeira linha:`, JSON.stringify(rawData[0]).substring(0, 300));
      }
      
      totalRows += rawData.length;
      
      // Process rows in larger chunks for better performance
      const CHUNK_SIZE = 10000;
      for (let i = 0; i < rawData.length; i += CHUNK_SIZE) {
        const chunk = rawData.slice(i, i + CHUNK_SIZE);
        
        // Process chunk with normalized column names
        for (const row of chunk) {
          const normalizedRow = normalizeColumnNames(row);
          const proc = extractProcedimentoFromRow(normalizedRow);
          if (proc) procedimentos.push(proc);
        }
        
        // Log progress for large files (less frequently)
        if (rawData.length > 20000 && i > 0 && i % 20000 === 0) {
          const elapsed = (Date.now() - sheetStart) / 1000;
          console.log(`[Excel Parser] Sheet ${sheetName}: ${i}/${rawData.length} rows (${elapsed.toFixed(1)}s)`);
        }
      }
      
      console.log(`[Excel Parser] Sheet ${sheetName}: ${rawData.length} rows processed in ${((Date.now() - sheetStart) / 1000).toFixed(1)}s`);
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[Excel Parser] Completed: ${procedimentos.length} procedimentos from ${totalRows} rows in ${elapsed.toFixed(1)}s`);
    
    return {
      success: true,
      procedimentos,
      // Don't include rawData for files with many rows to save memory
      rawData: totalRows > 10000 ? { totalRows, sheetsCount: workbook.SheetNames.length } : workbook.SheetNames.map(name => ({
        name,
        data: XLSX.utils.sheet_to_json(workbook.Sheets[name]),
      })),
    };
  } catch (error) {
    console.error(`[Excel Parser] Error:`, error);
    return {
      success: false,
      procedimentos: [],
      error: error instanceof Error ? error.message : "Erro ao processar Excel",
    };
  }
}

function extractProcedimentoFromRow(row: Record<string, unknown>): ParsedProcedimento | null {
  // Map common column names to our fields
  // Includes Unimed format: Item, Item Desc, Número Guia, Nome Beneficiário, Valor Pagamento, etc.
  const columnMappings: Record<string, string[]> = {
    // Ampliado para aceitar mais variações de nomes de colunas de código
    codigo: ["codigo", "cod", "código", "cod_proc", "codigo_procedimento", "item", "cod_item", "codigo_item", "codigodoprocedimento", "codigoprocedimento", "codprocedimento", "codproc", "codigoproc", "proc", "procedimento_cod", "cd_procedimento", "cdprocedimento", "codigotuss", "tuss", "codtuss", "codigotabela", "codtabela"],
    descricao: ["descricao", "descrição", "desc", "procedimento_nome", "item_desc", "itemdesc", "descricao_item", "descricaoitem", "descricaodoprocedimento", "descricaoprocedimento", "procedimento"],
    quantidade: ["quantidade", "qtd", "qtde", "quant", "quantidadesolicitada", "quantidadeliberada"],
    valorUnitario: ["valor_unitario", "vl_unitario", "vlunitario", "preco"],
    valorTotal: ["valor_total", "vl_total", "vltotal", "total", "valor_pagamento", "valorpagamento", "valor", "valorprocessado", "valorpago", "valorr"],
    // Adicionado "nomebeneficirio" (sem acento) para Unimed
    pacienteNome: ["paciente", "nome_paciente", "nome_beneficiario", "nomebeneficiario", "nomebeneficirio", "associado", "nome"],
    // Adicionado "beneficirio" (sem acento) para Unimed
    pacienteCarteirinha: ["carteirinha", "carteira", "numero_carteira", "matricula", "beneficiario", "beneficiário", "beneficirio"],
    // Adicionado "nmeroguia" (sem acento) para Unimed
    guiaNumero: ["guia", "numero_guia", "num_guia", "guia_numero", "numeroguia", "número_guia", "nmeroguia", "guiaoperadorasenha", "guiaoperadora", "docoriginal"],
    nomeMedico: ["medico", "nome_medico", "profissional", "executante", "nome_prestador_executante", "nomeprestadorexecutante", "profissionalexecutante"],
    crmMedico: ["crm", "crm_medico", "conselho", "prestador_executante", "prestadorexecutante"],
    // Adicionado "dataexecuo" (sem acento) para Unimed
    dataExecucao: ["data_execucao", "dataexecucao", "data_execução", "dt_execucao", "dtexecucao", "dataexecuo", "datadoevento", "dataatendimento", "dataevento"],
    // Adicionado "situaoitem" (sem acento) para Unimed
    situacaoItem: ["situacao_item", "situacaoitem", "situação_item", "situaoitem", "status", "situacao"],
    // Adicionado "erro_tiss" e "errotiss" para capturar motivo de glosa do demonstrativo Unimed
    motivoGlosa: ["motivo_glosa", "motivoglosa", "motivo", "glosa", "observacao", "observação", "obs", "justificativa", "descricao_glosa", "descricaoglosa", "codglosa", "erro_tiss", "errotiss"],
    valorGlosado: ["valor_glosado", "valorglosado", "vl_glosado", "glosa_valor", "valor_glosa", "valorglosa"],
  };
  
  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedRow: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(row)) {
    normalizedRow[normalizeKey(key)] = value;
  }
  
  const findValue = (mappings: string[]): unknown => {
    for (const mapping of mappings) {
      const normalized = normalizeKey(mapping);
      if (normalizedRow[normalized] !== undefined) {
        return normalizedRow[normalized];
      }
    }
    return undefined;
  };
  
  const codigo = findValue(columnMappings.codigo);
  
  // Se não encontrou código, tentar usar descrição como identificador (para arquivos sem coluna de código)
  const descricaoTemp = findValue(columnMappings.descricao);
  if (!codigo && !descricaoTemp) return null;
  
  // Se não tem código mas tem descrição, usar descrição como código temporário
  const codigoFinal = codigo || `DESC_${String(descricaoTemp).substring(0, 20)}`;
  
  // Parse data de execução (pode ser número serial do Excel ou string)
  let dataExecucao: Date | undefined;
  const dataExecucaoRaw = findValue(columnMappings.dataExecucao);
  if (dataExecucaoRaw !== undefined) {
    if (typeof dataExecucaoRaw === 'number') {
      // Excel serial date: days since 1900-01-01 (with Excel bug for 1900 leap year)
      // Excel serial 1 = 1900-01-01, but we need to adjust for the bug
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      dataExecucao = new Date(excelEpoch.getTime() + dataExecucaoRaw * 24 * 60 * 60 * 1000);
    } else {
      dataExecucao = parseDate(dataExecucaoRaw);
    }
  }
  
  // Get situacao for dadosExtras
  const situacaoItem = findValue(columnMappings.situacaoItem) as string | undefined;
  const motivoGlosaRaw = findValue(columnMappings.motivoGlosa) as string | undefined;
  // Traduzir código de glosa para descrição legível se for um código
  const motivoGlosa = motivoGlosaRaw ? traduzirMotivoGlosa(motivoGlosaRaw) : undefined;
  
  // Calcular valorGlosado: se existe coluna específica, usar; senão, se situação é GLOSADO, usar valorTotal
  let valorGlosado = parseNumber(findValue(columnMappings.valorGlosado));
  const valorTotal = parseNumber(findValue(columnMappings.valorTotal));
  
  // Se situação é GLOSADO e não tem valorGlosado específico, usar valorTotal como valorGlosado
  const situacaoUpper = situacaoItem?.toUpperCase() || '';
  if (!valorGlosado && situacaoUpper.includes('GLOS') && valorTotal) {
    valorGlosado = valorTotal;
  }
  
  return {
    codigo: String(codigoFinal),
    descricao: findValue(columnMappings.descricao) as string | undefined,
    quantidade: parseNumber(findValue(columnMappings.quantidade)) || 1,
    valorUnitario: parseNumber(findValue(columnMappings.valorUnitario)),
    valorTotal,
    dataExecucao,
    pacienteNome: (findValue(columnMappings.pacienteNome) || (row as Record<string, unknown>)["Nome Beneficiário"]) as string | undefined,
    pacienteCarteirinha: findValue(columnMappings.pacienteCarteirinha) as string | undefined,
    guiaNumero: findValue(columnMappings.guiaNumero) as string | undefined,
    nomeMedico: findValue(columnMappings.nomeMedico) as string | undefined,
    crmMedico: findValue(columnMappings.crmMedico) as string | undefined,
    motivoGlosa,
    valorGlosado,
    dadosExtras: { ...row, situacaoItem },
  };
}

/**
 * Parse PDF file content (extracts text and tries to find structured data)
 * Supports multiple formats including Saúde Caixa demonstrativos
 */
export async function parsePDF(content: Buffer): Promise<ParseResult> {
  try {
    // Use pdfjs-dist legacy build for Node.js compatibility
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    
    // Load the PDF document
    const uint8Array = new Uint8Array(content);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    // Extract text from all pages
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => (item as { str: string }).str)
        .join(" ");
      text += pageText + "\n";
    }
    
    // Try to extract procedures from text
    const procedimentos = extractProcedimentosFromText(text);
    
    return {
      success: true,
      procedimentos,
      rawData: { text, numPages: pdf.numPages },
    };
  } catch (error) {
    return {
      success: false,
      procedimentos: [],
      error: error instanceof Error ? error.message : "Erro ao processar PDF",
    };
  }
}

function extractProcedimentosFromText(text: string): ParsedProcedimento[] {
  const procedimentos: ParsedProcedimento[] = [];
  
  // Check if this is a Saúde Caixa demonstrativo (Benner system)
  if (text.includes('Sistema Benner-Saúde') || text.includes('DEMONSTRATIVO DE ANÁLISE DE CONTA')) {
    return extractSaudeCaixaProcedimentos(text);
  }
  
  // Try to find procedure codes (8 digits starting with specific patterns)
  const codePatterns = [
    /\b(\d{8})\b/g,  // 8 digit codes
    /\b(\d{2}\.\d{2}\.\d{2}\.\d{2})\b/g,  // XX.XX.XX.XX format
  ];
  
  for (const pattern of codePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const codigo = match[1].replace(/\./g, "");
      
      // Check if this looks like a valid procedure code
      if (codigo.length >= 8 && /^[0-9]+$/.test(codigo)) {
        // Try to find associated description (text after the code)
        const afterCode = text.substring(match.index! + match[0].length, match.index! + match[0].length + 100);
        const descMatch = afterCode.match(/^\s*[-:]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{5,50})/);
        
        procedimentos.push({
          codigo,
          descricao: descMatch ? descMatch[1].trim() : undefined,
          quantidade: 1,
          dadosExtras: { sourceText: match[0] },
        });
      }
    }
  }
  
  return procedimentos;
}

/**
 * Extract procedimentos from Saúde Caixa (Benner) PDF format
 * Format: Date | Table | Code (X.XX.XX.XXX) | Description | Values...
 * Note: PDF text extraction may produce line-by-line output, so we handle both formats
 */
function extractSaudeCaixaProcedimentos(text: string): ParsedProcedimento[] {
  const procedimentos: ParsedProcedimento[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentPaciente: string | undefined;
  let currentCarteirinha: string | undefined;
  let currentGuia: string | undefined;
  
  // Process the entire text joined with spaces for pattern matching
  const fullText = lines.join(' ');
  
  // Find all patient blocks in the document
  // Pattern: 8-digit guia, 9-digit senha, NAME IN CAPS, 16-digit carteirinha
  const patientBlockPattern = /(\d{8})\s+(\d{9})\s+([A-Z][A-Z\s]+[A-Z])\s+(\d{16})/g;
  let patientMatch;
  while ((patientMatch = patientBlockPattern.exec(fullText)) !== null) {
    currentGuia = patientMatch[1];
    currentPaciente = patientMatch[3].trim();
    currentCarteirinha = patientMatch[4];
  }
  
  // First try: Pattern for single-line format (all data in one line)
  // Example: 31/10/2025 22 4.03.04.370 Hemossedimentação, (VHS) - pesquisa 5,02 1 5,02 0,00 5,02 1702
  const procPatternSingleLine = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2})\s+(\d\.\d{2}\.\d{2}\.\d{3})\s+([^\d]+?)\s+(\d+[,.]\d{2})\s+(\d+)\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})(?:\s+(\d+))?/g;
  
  let match;
  while ((match = procPatternSingleLine.exec(fullText)) !== null) {
    const dataExecucao = parseDataBR(match[1]);
    const tabela = match[2];
    const codigo = match[3].replace(/\./g, '');
    const descricao = match[4].trim();
    const valorInformado = parseValorBR(match[5]) || 0;
    const quantidade = parseInt(match[6], 10) || 1;
    const valorProcessado = parseValorBR(match[7]) || 0;
    const valorLiberado = parseValorBR(match[8]) || 0;
    const valorGlosaCapturado = parseValorBR(match[9]) || 0;
    const codigoGlosa = match[10] || undefined;
    
    const valorGlosaCalculado = valorInformado - valorLiberado;
    const hasGlosa = codigoGlosa || valorGlosaCalculado > 0.01;
    const valorGlosa = hasGlosa ? (valorGlosaCalculado > 0 ? valorGlosaCalculado : valorInformado) : 0;
    const motivoGlosa = (hasGlosa && codigoGlosa) ? traduzirMotivoGlosa(codigoGlosa) : undefined;
    
    procedimentos.push({
      codigo,
      descricao,
      quantidade,
      valorUnitario: valorInformado / quantidade,
      valorTotal: valorInformado,
      dataExecucao,
      pacienteNome: currentPaciente,
      pacienteCarteirinha: currentCarteirinha,
      guiaNumero: currentGuia,
      motivoGlosa,
      valorGlosado: hasGlosa ? valorGlosa : undefined,
      dadosExtras: {
        tabela,
        valorInformado,
        valorProcessado,
        valorLiberado,
        valorGlosaCalculado,
        codigoGlosa,
        situacaoItem: hasGlosa ? 'GLOSADO' : 'PAGO',
        formato: 'saude_caixa_benner'
      },
    });
  }
  
  // Second try: Line-by-line format (each field on separate line)
  // This is common when pdftotext extracts text from columnar PDFs
  if (procedimentos.length === 0) {
    const datePattern = /^(\d{2}\/\d{2}\/\d{4})$/;
    const tablePattern = /^(\d{2})$/;
    const codePattern = /^(\d\.\d{2}\.\d{2}\.\d{3})$/;
    const valuePattern = /^(\d+[,.]\d{2})$/;
    const glosaCodePattern = /^(\d{4})$/;
    
    let i = 0;
    while (i < lines.length) {
      // Look for date line
      const dateMatch = lines[i].match(datePattern);
      if (!dateMatch) {
        i++;
        continue;
      }
      
      const dataStr = dateMatch[1];
      
      // Next should be table number (22)
      if (i + 1 >= lines.length || !tablePattern.test(lines[i + 1])) {
        i++;
        continue;
      }
      const tabela = lines[i + 1];
      
      // Next should be TUSS code
      if (i + 2 >= lines.length || !codePattern.test(lines[i + 2])) {
        i++;
        continue;
      }
      const codigoComPontos = lines[i + 2];
      const codigo = codigoComPontos.replace(/\./g, '');
      
      // Next should be description (text line)
      if (i + 3 >= lines.length) {
        i++;
        continue;
      }
      const descricao = lines[i + 3];
      
      // Collect values from subsequent lines
      // Format: valorInformado, quantidade, valorProcessado, valorLiberado (0,00), valorGlosa, [codigoGlosa]
      const valores: number[] = [];
      let codigoGlosa: string | undefined;
      let j = i + 4;
      
      while (j < lines.length && valores.length < 6) {
        const line = lines[j];
        
        // Check if it's a value (number with comma/dot)
        if (valuePattern.test(line)) {
          valores.push(parseValorBR(line) || 0);
          j++;
        }
        // Check if it's a quantity (single digit)
        else if (/^\d$/.test(line)) {
          valores.push(parseInt(line, 10));
          j++;
        }
        // If it's a new date or code, stop
        else if (datePattern.test(line) || codePattern.test(line)) {
          break;
        }
        // Check if it's a glosa code (4 digits) - comes AFTER the values
        else if (glosaCodePattern.test(line)) {
          codigoGlosa = line;
          j++;
          break;
        }
        else {
          // Skip other lines (like page headers)
          j++;
        }
      }
      
      // We need at least: valorInformado, quantidade, valorProcessado
      if (valores.length >= 3) {
        const valorInformado = valores[0];
        const quantidade = valores.length > 1 && valores[1] < 100 ? valores[1] : 1;
        const valorProcessado = valores.length > 2 ? valores[2] : valores[0];
        const valorLiberado = valores.length > 3 ? valores[3] : 0;
        const valorGlosaCapturado = valores.length > 4 ? valores[4] : 0;
        
        // Item é glosado se: tem código de glosa, OU valorLiberado = 0, OU valorGlosaCapturado > 0
        const hasGlosa = codigoGlosa || valorLiberado === 0 || valorGlosaCapturado > 0;
        // Valor da glosa é o valorGlosaCapturado se existir, senão é valorInformado (quando liberado = 0)
        const valorGlosa = hasGlosa ? (valorGlosaCapturado > 0 ? valorGlosaCapturado : valorInformado) : 0;
        const motivoGlosa = (hasGlosa && codigoGlosa) ? traduzirMotivoGlosa(codigoGlosa) : undefined;
        
        procedimentos.push({
          codigo,
          descricao,
          quantidade,
          valorUnitario: valorInformado / quantidade,
          valorTotal: valorInformado,
          dataExecucao: parseDataBR(dataStr),
          pacienteNome: currentPaciente,
          pacienteCarteirinha: currentCarteirinha,
          guiaNumero: currentGuia,
          motivoGlosa,
          valorGlosado: hasGlosa ? valorGlosa : undefined,
          dadosExtras: {
            tabela,
            valorInformado,
            valorProcessado,
            valorLiberado,
            valorGlosaCapturado,
            codigoGlosa,
            situacaoItem: hasGlosa ? 'GLOSADO' : 'PAGO',
            formato: 'saude_caixa_benner_lines'
          },
        });
      }
      
      i = j;
    }
  }
  
  // Third try: Simple TUSS code extraction (fallback)
  if (procedimentos.length === 0) {
    const tussPattern = /(\d\.\d{2}\.\d{2}\.\d{3})\s+([A-Za-zÀ-ÿ][^\d]{5,80})\s+(\d+[,.]\d{2})/g;
    
    while ((match = tussPattern.exec(fullText)) !== null) {
      const codigo = match[1].replace(/\./g, '');
      const descricao = match[2].trim();
      const valor = parseValorBR(match[3]);
      
      procedimentos.push({
        codigo,
        descricao,
        quantidade: 1,
        valorTotal: valor,
        pacienteNome: currentPaciente,
        pacienteCarteirinha: currentCarteirinha,
        guiaNumero: currentGuia,
        dadosExtras: { formato: 'saude_caixa_benner_alt' },
      });
    }
  }
  
  return procedimentos;
}

/**
 * Parse Brazilian date format (DD/MM/YYYY)
 */
function parseDataBR(dateStr: string): Date | undefined {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return undefined;
  const [day, month, year] = parts.map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Parse Brazilian number format (comma as decimal separator)
 */
function parseValorBR(valorStr: string): number {
  if (!valorStr) return 0;
  return parseFloat(valorStr.replace('.', '').replace(',', '.')) || 0;
}

/**
 * Convert ParsedProcedimento to InsertProcedimento for database
 */
export function toProcedimentoInsert(
  parsed: ParsedProcedimento,
  arquivoId: number
): InsertProcedimento {
  return {
    arquivoId,
    codigo: parsed.codigo,
    descricao: parsed.descricao,
    quantidade: parsed.quantidade || 1,
    valorUnitario: parsed.valorUnitario ? String(parsed.valorUnitario) : undefined,
    valorTotal: parsed.valorTotal ? String(parsed.valorTotal) : undefined,
    valorGlosado: parsed.valorGlosado ? String(parsed.valorGlosado) : undefined,
    motivoGlosa: parsed.motivoGlosa,
    dataExecucao: parsed.dataExecucao,
    pacienteNome: parsed.pacienteNome,
    pacienteCarteirinha: parsed.pacienteCarteirinha,
    guiaNumero: parsed.guiaNumero,
    senha: parsed.senha,
    nomeMedico: parsed.nomeMedico,
    crmMedico: parsed.crmMedico,
    codigoDespesa: parsed.codigoDespesa,
    tipoDespesa: parsed.tipoDespesa,
    dadosExtras: parsed.dadosExtras,
    // Chave composta para identificar faturamento único
    numeroLote: parsed.numeroLote,
    sequencialTransacao: parsed.sequencialTransacao,
  };
}

/**
 * Determine file type and parse accordingly
 */
export async function parseFile(content: Buffer, filename: string): Promise<ParseResult> {
  const extension = filename.toLowerCase().split(".").pop();
  
  switch (extension) {
    case "xml":
      return parseXML(content);
    case "xlsx":
    case "xls":
      return parseExcel(content);
    case "csv":
      return parseCSV(content);
    case "pdf":
      return parsePDF(content);
    default:
      return {
        success: false,
        procedimentos: [],
        error: `Tipo de arquivo não suportado: ${extension}`,
      };
  }
}

/**
 * Parse CSV file content
 */
export async function parseCSV(content: Buffer): Promise<ParseResult> {
  try {
    const text = content.toString("utf-8");
    const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      return {
        success: false,
        procedimentos: [],
        error: "Arquivo CSV vazio ou sem dados",
      };
    }
    
    // Detect separator (semicolon or comma)
    const separator = lines[0].includes(";") ? ";" : ",";
    
    // Find header row (look for row with column names like "Data do Evento", "Nome", "Código do Procedimento")
    let headerIndex = -1;
    const headerPatterns = ["data do evento", "codigo do procedimento", "descrição do procedimento", "quantidade", "valor"];
    
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lowerLine = lines[i].toLowerCase();
      const matchCount = headerPatterns.filter(p => lowerLine.includes(p)).length;
      if (matchCount >= 2) {
        headerIndex = i;
        break;
      }
    }
    
    // Check if this is a hierarchical format (Bradesco extrato)
    // Hierarchical format has header but data is split across multiple lines
    if (headerIndex !== -1) {
      // Check if lines after header have hierarchical structure
      // (some lines have date in first col, others have code in col 2/3)
      const testLines = lines.slice(headerIndex + 1, headerIndex + 10);
      const hasHierarchical = testLines.some(line => {
        const vals = line.split(separator);
        // Line with date in first column and empty code column
        return vals[0]?.match(/\d{2}\/\d{2}\/\d{4}/) && !vals[2]?.match(/^\d{5,}$/);
      });
      
      if (hasHierarchical) {
        return parseHierarchicalCSV(lines.slice(headerIndex + 1), separator);
      }
    }
    
    if (headerIndex === -1) {
      // No header found, try to parse as hierarchical format
      return parseHierarchicalCSV(lines, separator);
    }
    
    // Parse as standard CSV with headers
    const headers = lines[headerIndex].split(separator).map(h => h.trim().replace(/"/g, ""));
    const procedimentos: ParsedProcedimento[] = [];
    
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map(v => v.trim().replace(/"/g, ""));
      const row: Record<string, unknown> = {};
      
      for (let j = 0; j < headers.length; j++) {
        if (headers[j] && values[j]) {
          row[headers[j]] = values[j];
        }
      }
      
      const proc = extractProcedimentoFromRow(row);
      if (proc) procedimentos.push(proc);
    }
    
    return {
      success: true,
      procedimentos,
      rawData: { lines: lines.length, headers },
    };
  } catch (error) {
    return {
      success: false,
      procedimentos: [],
      error: error instanceof Error ? error.message : "Erro ao processar CSV",
    };
  }
}

/**
 * Parse hierarchical CSV format (like Bradesco extrato de pagamento)
 * Where patient info is on one line and procedures follow on subsequent lines
 */
function parseHierarchicalCSV(lines: string[], separator: string): ParseResult {
  const procedimentos: ParsedProcedimento[] = [];
  
  let currentPatient: string | undefined;
  let currentGuia: string | undefined;
  let currentDate: Date | undefined;
  let currentProtocolo: string | undefined;
  let currentValorTotal: number | undefined;
  
  for (const line of lines) {
    const values = line.split(separator).map(v => v.trim().replace(/"/g, ""));
    
    // Skip header/metadata lines
    if (values[0]?.toLowerCase().includes("extrato") || 
        values[0]?.toLowerCase().includes("cnpj") ||
        values[0]?.toLowerCase().includes("liberado") ||
        values[0]?.toLowerCase().includes("data do evento")) {
      continue;
    }
    
    // Check if this is a patient/guia header line (has date in first column)
    // Note: date may have leading space, so we trim first
    const dateMatch = values[0]?.trim().match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    if (dateMatch) {
      // Parse date (DD/MM/YYYY format)
      const [day, month, year] = dateMatch[1].split(/[\/\-]/).map(Number);
      currentDate = new Date(year, month - 1, day);
      currentPatient = values[1] || undefined;
      currentGuia = values[6] || values[7] || undefined; // Guia operadora/Senha or Doc Original
      currentProtocolo = values[8] || undefined;
      continue;
    }
    
    // Check if this is a procedure line (has code in column 2 or 3)
    const codeValue = values[2] || values[1];
    if (codeValue && /^\d{5,}$/.test(codeValue.replace(/\s/g, ""))) {
      const codigo = codeValue.replace(/\s/g, "");
      const descricao = values[3] || values[2];
      const qtdSolicitada = parseFloat(values[4]?.replace(",", ".") || "1") || 1;
      const qtdLiberada = parseFloat(values[5]?.replace(",", ".") || "1") || 1;
      const valorStr = values[9] || values[8] || values[7];
      const valor = valorStr ? parseFloat(valorStr.replace(",", ".")) : undefined;
      const justificativa = values[10] || values[9];
      
      procedimentos.push({
        codigo,
        descricao: descricao?.trim(),
        quantidade: qtdLiberada || qtdSolicitada,
        valorTotal: valor,
        dataExecucao: currentDate,
        pacienteNome: currentPatient,
        guiaNumero: currentGuia,
        motivoGlosa: justificativa?.trim() || undefined,
        dadosExtras: {
          protocolo: currentProtocolo,
          qtdSolicitada,
          qtdLiberada,
        },
      });
    }
  }
  
  return {
    success: true,
    procedimentos,
    rawData: { format: "hierarchical", lines: lines.length },
  };
}


// ============ GEAP PORTAL XML PARSER ============

/**
 * Find GuiaPortalXml elements in the XML structure (GEAP format)
 */
function findGuiasGEAP(obj: unknown): unknown[] {
  const guias: unknown[] = [];
  
  function search(node: unknown, depth: number = 0): void {
    if (!node || typeof node !== "object" || depth > 15) return;
    
    const record = node as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      // Skip attributes
      if (key === '$' || typeof value !== 'object' || value === null) continue;
      
      // Check for GuiaPortalXml
      if (key.toLowerCase() === 'guiaportalxml') {
        if (Array.isArray(value)) {
          guias.push(...value);
        } else {
          guias.push(value);
        }
      } else {
        // Continue searching in nested objects
        search(value, depth + 1);
      }
    }
  }
  
  search(obj);
  return guias;
}

/**
 * Extract procedimentos from GEAP Portal XML format
 * Structure: GuiaPortalXml -> Guia (header) + ItemGuias -> ItemGuiaPortal (items)
 */
function extractProcedimentosFromGEAP(guiaPortal: unknown): ParsedProcedimento[] {
  if (!guiaPortal || typeof guiaPortal !== "object") return [];
  
  const procedimentos: ParsedProcedimento[] = [];
  const record = guiaPortal as Record<string, unknown>;
  
  // Extract guia header info
  const guia = record.Guia as Record<string, unknown> | undefined;
  const guiaNumero = getTextValue(guia?.NroGsp) || getTextValue(guia?.NroGspContratado);
  const pacienteNome = getTextValue(guia?.NmeCliente);
  const nroInscricao = getTextValue(guia?.NroInscricao);
  const existeGlosas = getTextValue(guia?.ExisteGlosas) === 'true';
  const dtaQuitada = getTextValue(guia?.DtaQuitada);
  
  // Extract items
  const itemGuias = record.ItemGuias as Record<string, unknown> | undefined;
  if (!itemGuias) return procedimentos;
  
  let items: unknown[] = [];
  const itemGuiaPortal = itemGuias.ItemGuiaPortal;
  
  if (Array.isArray(itemGuiaPortal)) {
    items = itemGuiaPortal;
  } else if (itemGuiaPortal) {
    items = [itemGuiaPortal];
  }
  
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    
    const itemRecord = item as Record<string, unknown>;
    
    const codigo = getTextValue(itemRecord.NroServico);
    if (!codigo) continue;
    
    const descricao = getTextValue(itemRecord.NmeServico);
    const quantidade = parseNumber(itemRecord.QtdServico) || 1;
    const valorInformado = parseValorGEAP(itemRecord.VlrInformado);
    const valorCalculado = parseValorGEAP(itemRecord.VlrCalculado);
    const valorGlosado = parseValorGEAP(itemRecord.VlrGlosado);
    const ehGlosado = getTextValue(itemRecord.EhGlosado) === 'true';
    const nroJustificativa = getTextValue(itemRecord.NroJustificativa);
    const nroCarteira = getTextValue(itemRecord.NroCarteira);
    
    // Parse date in format DD/MM/YYYY or MM/DD/YYYY
    const dtaAtendimento = getTextValue(itemRecord.DtaAtendimento);
    let dataExecucao: Date | undefined;
    if (dtaAtendimento) {
      dataExecucao = parseDataGEAP(dtaAtendimento);
    }
    
    // Determine motivo de glosa
    let motivoGlosa: string | undefined;
    if (ehGlosado && nroJustificativa) {
      motivoGlosa = traduzirMotivoGlosa(nroJustificativa);
    } else if (valorGlosado > 0) {
      motivoGlosa = nroJustificativa ? traduzirMotivoGlosa(nroJustificativa) : 'Glosa sem justificativa';
    }
    
    procedimentos.push({
      codigo,
      descricao,
      quantidade,
      valorUnitario: valorInformado / quantidade,
      valorTotal: valorInformado,
      dataExecucao,
      pacienteNome,
      pacienteCarteirinha: nroCarteira || nroInscricao,
      guiaNumero,
      motivoGlosa,
      valorGlosado: valorGlosado > 0 ? valorGlosado : undefined,
      dadosExtras: {
        formato: 'geap_portal',
        valorInformado,
        valorCalculado,
        valorGlosado,
        ehGlosado,
        nroJustificativa,
        nroInscricao,
        existeGlosas,
        dtaQuitada,
      },
    });
  }
  
  return procedimentos;
}

/**
 * Parse GEAP value format (comma as decimal separator)
 */
function parseValorGEAP(value: unknown): number {
  const str = getTextValue(value);
  if (!str) return 0;
  // GEAP uses comma as decimal separator
  return parseFloat(str.replace('.', '').replace(',', '.')) || 0;
}

/**
 * Parse GEAP date format (DD/MM/YYYY or MM/DD/YYYY)
 */
function parseDataGEAP(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  
  // Try DD/MM/YYYY format first
  const parts = dateStr.split('/');
  if (parts.length !== 3) return undefined;
  
  const [part1, part2, year] = parts.map(Number);
  
  // If first part > 12, it's DD/MM/YYYY
  if (part1 > 12) {
    return new Date(year, part2 - 1, part1);
  }
  // If second part > 12, it's MM/DD/YYYY
  if (part2 > 12) {
    return new Date(year, part1 - 1, part2);
  }
  // Assume DD/MM/YYYY (Brazilian format)
  return new Date(year, part2 - 1, part1);
}
