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
    
    // Check if this is a demonstrativo de retorno (operadoraParaPrestador)
    const demonstrativos = findDemonstrativosRetorno(result);
    if (demonstrativos.length > 0) {
      // Process demonstrativo de retorno
      for (const demonstrativo of demonstrativos) {
        const procsRetorno = extractProcedimentosFromDemonstrativo(demonstrativo);
        procedimentos.push(...procsRetorno);
      }
    } else {
      // Process regular guias (prestadorParaOperadora)
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
        
        procedimentos.push({
          codigo,
          descricao,
          quantidade,
          valorUnitario: valorInformado ? valorInformado / quantidade : undefined,
          valorTotal: valorLiberado !== undefined ? valorLiberado : valorInformado,
          dataExecucao: dataRealizacao,
          guiaNumero,
          pacienteCarteirinha,
          motivoGlosa: motivoGlosa || undefined,
          valorGlosado: valorGlosado > 0 ? valorGlosado : undefined,
          dadosExtras: {
            valorInformado,
            valorProcessado,
            valorLiberado,
            valorGlosado: valorGlosado > 0 ? valorGlosado : undefined,
            motivoGlosa: motivoGlosa || undefined,
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
    codigo: ["codigo", "cod", "código", "cod_proc", "codigo_procedimento", "item", "cod_item", "codigo_item", "codigodoprocedimento", "codigoprocedimento"],
    descricao: ["descricao", "descrição", "desc", "procedimento_nome", "item_desc", "itemdesc", "descricao_item", "descricaoitem", "descricaodoprocedimento", "descricaoprocedimento", "procedimento"],
    quantidade: ["quantidade", "qtd", "qtde", "quant", "quantidadesolicitada", "quantidadeliberada"],
    valorUnitario: ["valor_unitario", "vl_unitario", "vlunitario", "preco"],
    valorTotal: ["valor_total", "vl_total", "vltotal", "total", "valor_pagamento", "valorpagamento", "valor", "valorprocessado", "valorpago", "valorr"],
    pacienteNome: ["paciente", "nome_paciente", "nome_beneficiario", "nomebeneficiario", "associado", "nome"],
    pacienteCarteirinha: ["carteirinha", "carteira", "numero_carteira", "matricula", "beneficiario", "beneficiário"],
    guiaNumero: ["guia", "numero_guia", "num_guia", "guia_numero", "numeroguia", "número_guia", "guiaoperadorasenha", "guiaoperadora", "docoriginal"],
    nomeMedico: ["medico", "nome_medico", "profissional", "executante", "nome_prestador_executante", "nomeprestadorexecutante", "profissionalexecutante"],
    crmMedico: ["crm", "crm_medico", "conselho", "prestador_executante", "prestadorexecutante"],
    dataExecucao: ["data_execucao", "dataexecucao", "data_execução", "dt_execucao", "dtexecucao", "datadoevento", "dataatendimento", "dataevento"],
    situacaoItem: ["situacao_item", "situacaoitem", "situação_item", "status", "situacao"],
    motivoGlosa: ["motivo_glosa", "motivoglosa", "motivo", "glosa", "observacao", "observação", "obs", "justificativa", "descricao_glosa", "descricaoglosa", "codglosa"],
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
  const motivoGlosaRaw = findValue(columnMappings.motivoGlosa) as string | undefined;
  // Traduzir código de glosa para descrição legível se for um código
  const motivoGlosa = motivoGlosaRaw ? traduzirMotivoGlosa(motivoGlosaRaw) : undefined;
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
