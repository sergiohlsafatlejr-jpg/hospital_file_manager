import * as xml2js from "xml2js";
import * as XLSX from "xlsx";
// pdf-parse will be dynamically imported due to ESM compatibility issues
import { InsertProcedimento } from "../drizzle/schema";

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
  nomeMedico?: string;
  crmMedico?: string;
  motivoGlosa?: string;
  valorGlosado?: number;
  dadosExtras?: Record<string, unknown>;
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
 */
function parseDate(value: unknown): Date | undefined {
  const str = getTextValue(value);
  if (!str) return undefined;
  const date = new Date(str);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parse XML file content (TISS format commonly used in Brazil)
 * Completely rewritten to properly handle TISS XML structure
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
    
    // Navigate to guias in TISS structure
    const guias = findGuias(result);
    
    for (const guia of guias) {
      const guiaNumero = extractGuiaNumero(guia);
      const pacienteCarteirinha = extractPacienteCarteirinha(guia);
      
      // Extract procedimentos executados
      const procedimentosExecutados = extractProcedimentosExecutados(guia);
      for (const proc of procedimentosExecutados) {
        procedimentos.push({
          ...proc,
          guiaNumero: proc.guiaNumero || guiaNumero,
          pacienteCarteirinha: proc.pacienteCarteirinha || pacienteCarteirinha,
        });
      }
      
      // Extract outras despesas (servicosExecutados)
      const outrasDespesas = extractOutrasDespesas(guia);
      for (const proc of outrasDespesas) {
        procedimentos.push({
          ...proc,
          guiaNumero: proc.guiaNumero || guiaNumero,
          pacienteCarteirinha: proc.pacienteCarteirinha || pacienteCarteirinha,
        });
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
    
    // Get servicosExecutados
    const servicos = despesaRecord["servicosExecutados"];
    if (!servicos) continue;
    
    const proc = extractServicoFromNode(servicos);
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
 * Extract procedimento from servicosExecutados node
 */
function extractServicoFromNode(node: unknown): ParsedProcedimento | null {
  if (!node || typeof node !== "object") return null;
  
  const record = node as Record<string, unknown>;
  
  const codigo = getTextValue(record["codigoProcedimento"]) || getTextValue(record["codigo"]);
  if (!codigo) return null;
  
  const descricao = getTextValue(record["descricaoProcedimento"]) || getTextValue(record["descricao"]);
  const quantidade = parseNumber(record["quantidadeExecutada"]) || parseNumber(record["quantidade"]) || 1;
  const valorUnitario = parseNumber(record["valorUnitario"]);
  const valorTotal = parseNumber(record["valorTotal"]);
  const dataExecucao = parseDate(record["dataExecucao"]);
  
  return {
    codigo,
    descricao,
    quantidade,
    valorUnitario,
    valorTotal,
    dataExecucao,
    dadosExtras: record,
  };
}

/**
 * Parse Excel file content
 */
export async function parseExcel(content: Buffer): Promise<ParseResult> {
  try {
    const workbook = XLSX.read(content, { type: "buffer" });
    const procedimentos: ParsedProcedimento[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      
      for (const row of data) {
        const proc = extractProcedimentoFromRow(row);
        if (proc) procedimentos.push(proc);
      }
    }
    
    return {
      success: true,
      procedimentos,
      rawData: workbook.SheetNames.map(name => ({
        name,
        data: XLSX.utils.sheet_to_json(workbook.Sheets[name]),
      })),
    };
  } catch (error) {
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
    codigo: ["codigo", "cod", "código", "cod_proc", "codigo_procedimento", "procedimento", "item", "cod_item", "codigo_item"],
    descricao: ["descricao", "descrição", "desc", "procedimento_nome", "item_desc", "itemdesc", "descricao_item", "descricaoitem"],
    quantidade: ["quantidade", "qtd", "qtde", "quant"],
    valorUnitario: ["valor_unitario", "vl_unitario", "vlunitario", "preco"],
    valorTotal: ["valor_total", "vl_total", "vltotal", "total", "valor_pagamento", "valorpagamento", "valor"],
    pacienteNome: ["paciente", "nome_paciente", "nome_beneficiario", "nomebeneficiario"],
    pacienteCarteirinha: ["carteirinha", "carteira", "numero_carteira", "matricula", "beneficiario", "beneficiário"],
    guiaNumero: ["guia", "numero_guia", "num_guia", "guia_numero", "numeroguia", "número_guia"],
    nomeMedico: ["medico", "nome_medico", "profissional", "executante", "nome_prestador_executante", "nomeprestadorexecutante"],
    crmMedico: ["crm", "crm_medico", "conselho", "prestador_executante", "prestadorexecutante"],
    dataExecucao: ["data_execucao", "dataexecucao", "data_execução", "dt_execucao", "dtexecucao"],
    situacaoItem: ["situacao_item", "situacaoitem", "situação_item", "status", "situacao"],
    motivoGlosa: ["motivo_glosa", "motivoglosa", "motivo", "glosa", "observacao", "observação", "obs", "justificativa", "descricao_glosa", "descricaoglosa"],
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
  if (!codigo) return null;
  
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
  const motivoGlosa = findValue(columnMappings.motivoGlosa) as string | undefined;
  const valorGlosado = parseNumber(findValue(columnMappings.valorGlosado));
  
  return {
    codigo: String(codigo),
    descricao: findValue(columnMappings.descricao) as string | undefined,
    quantidade: parseNumber(findValue(columnMappings.quantidade)) || 1,
    valorUnitario: parseNumber(findValue(columnMappings.valorUnitario)),
    valorTotal: parseNumber(findValue(columnMappings.valorTotal)),
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
 */
export async function parsePDF(content: Buffer): Promise<ParseResult> {
  try {
    // Use pdfjs-dist for PDF parsing
    const pdfjsLib = await import("pdfjs-dist");
    
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
      text += pageText + "\\n";
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
  
  // Try to find procedure codes (8 digits starting with specific patterns)
  const codePatterns = [
    /\\b(\\d{8})\\b/g,  // 8 digit codes
    /\\b(\\d{2}\\.\\d{2}\\.\\d{2}\\.\\d{2})\\b/g,  // XX.XX.XX.XX format
  ];
  
  for (const pattern of codePatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const codigo = match[1].replace(/\\./g, "");
      
      // Check if this looks like a valid procedure code
      if (codigo.length >= 8 && /^[0-9]+$/.test(codigo)) {
        // Try to find associated description (text after the code)
        const afterCode = text.substring(match.index! + match[0].length, match.index! + match[0].length + 100);
        const descMatch = afterCode.match(/^\\s*[-:]?\\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\\s]{5,50})/);
        
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
    dataExecucao: parsed.dataExecucao,
    pacienteNome: parsed.pacienteNome,
    pacienteCarteirinha: parsed.pacienteCarteirinha,
    guiaNumero: parsed.guiaNumero,
    nomeMedico: parsed.nomeMedico,
    crmMedico: parsed.crmMedico,
    dadosExtras: parsed.dadosExtras,
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
