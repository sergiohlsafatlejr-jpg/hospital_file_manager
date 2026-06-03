/**
 * Parser Factory - Registry centralizado de parsers por convênio
 * 
 * Detecta automaticamente o formato do arquivo e seleciona o parser correto.
 * Suporta múltiplos formatos por convênio (Excel, CSV, PDF, XML).
 * 
 * Inspirado no med-compara: cada convênio tem um parser registrado que sabe
 * como extrair os dados do demonstrativo no formato específico daquele convênio.
 */

export interface ItemDemonstrativo {
  numero_guia: string;
  protocolo_tiss?: string;
  lote_prestador?: string;
  seq?: string;
  beneficiario?: string;
  Nome_benefeciario?: string;
  data_execucao?: string;
  item: string;
  item_desc?: string;
  quantidade?: number;
  valor_pagamento: number;
  valor_glosa?: number;
  tipo_lancamento?: string;
  erro_tiss?: string;
  situacao_item?: string;
  nome_prestador?: string;
  observacao?: string;
  codigo_glosa?: string;
  data_pagto?: string;
  acomodacao_internacao?: string;
  data_inicio_faturamento_internacao?: string;
  Guia_prestador?: string;
  codigo_prestador_pagamento?: string;
  nome_prestador_pagamento?: string;
}

export interface ParserConfig {
  convenioId: number;
  nomeConvenio: string;
  formatosSuportados: string[];
  mapeamentoColunas: Record<string, string>;
  logicaSituacao?: (row: Record<string, any>) => string;
  transformacoes?: Record<string, (value: any) => any>;
  detectarFormato?: (headers: string[]) => boolean;
}

export interface ParserResult {
  itens: ItemDemonstrativo[];
  totalLinhas: number;
  erros: string[];
  convenioDetectado?: string;
}

// Registry de parsers por convênio
const parserRegistry: Map<number, ParserConfig> = new Map();

/**
 * Registrar um parser para um convênio
 */
export function registrarParser(config: ParserConfig): void {
  parserRegistry.set(config.convenioId, config);
}

/**
 * Obter parser de um convênio
 */
export function obterParser(convenioId: number): ParserConfig | undefined {
  return parserRegistry.get(convenioId);
}

/**
 * Listar todos os parsers registrados
 */
export function listarParsers(): ParserConfig[] {
  return Array.from(parserRegistry.values());
}

/**
 * Detectar automaticamente o convênio baseado nos headers do arquivo
 */
export function detectarConvenio(headers: string[]): ParserConfig | null {
  const headersNorm = headers.map(h => h.toLowerCase().trim());
  
  const allParsers = Array.from(parserRegistry.values());
  for (const config of allParsers) {
    if (config.detectarFormato && config.detectarFormato(headersNorm)) {
      return config;
    }
  }
  
  // Fallback: tentar detectar por colunas conhecidas
  for (const config of allParsers) {
    const colunasConfig = Object.values(config.mapeamentoColunas).map((c: string) => c.toLowerCase().trim());
    const matchCount = colunasConfig.filter(c => headersNorm.includes(c)).length;
    const matchRatio = matchCount / colunasConfig.length;
    
    if (matchRatio >= 0.6) {
      return config;
    }
  }
  
  return null;
}

/**
 * Aplicar mapeamento de colunas e transformações para um convênio
 */
export function aplicarParser(config: ParserConfig, rows: Record<string, any>[]): ParserResult {
  const itens: ItemDemonstrativo[] = [];
  const erros: string[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const item: Partial<ItemDemonstrativo> = {};
      
      // Aplicar mapeamento de colunas
      for (const [campoDestino, colunaOrigem] of Object.entries(config.mapeamentoColunas)) {
        const valor = row[colunaOrigem] ?? row[colunaOrigem.toLowerCase()] ?? row[colunaOrigem.toUpperCase()];
        if (valor !== undefined && valor !== null && valor !== "") {
          // Aplicar transformação se existir
          if (config.transformacoes && config.transformacoes[campoDestino]) {
            (item as any)[campoDestino] = config.transformacoes[campoDestino](valor);
          } else {
            (item as any)[campoDestino] = valor;
          }
        }
      }
      
      // Aplicar lógica de situação
      if (config.logicaSituacao) {
        item.situacao_item = config.logicaSituacao(row);
      }
      
      // Validar campos obrigatórios
      if (!item.item && !item.numero_guia) {
        erros.push(`Linha ${i + 1}: item ou numero_guia não encontrado`);
        continue;
      }
      
      itens.push(item as ItemDemonstrativo);
    } catch (err: any) {
      erros.push(`Linha ${i + 1}: ${err.message}`);
    }
  }
  
  return {
    itens,
    totalLinhas: rows.length,
    erros,
    convenioDetectado: config.nomeConvenio,
  };
}

// ============================================================
// PARSERS REGISTRADOS
// ============================================================

// IPASGO
registrarParser({
  convenioId: 30001,
  nomeConvenio: "IPASGO",
  formatosSuportados: ["xlsx", "xls", "csv"],
  mapeamentoColunas: {
    numero_guia: "GUIA",
    Nome_benefeciario: "BENEFICIARIO",
    data_execucao: "DATA_ATENDIMENTO",
    item: "CODIGO",
    item_desc: "DESCRICAO",
    quantidade: "QUANTIDADE",
    valor_pagamento: "VALOR_PAGO",
    valor_glosa: "VALOR_GLOSA",
    erro_tiss: "COD_GLOSA",
    nome_prestador: "PROFISSIONAL",
    codigo_glosa: "MOTIVO_GLOSA",
  },
  logicaSituacao: (row) => {
    const vlPago = parseFloat(row.VALOR_PAGO || row.valor_pago || "0");
    const vlGlosa = parseFloat(row.VALOR_GLOSA || row.valor_glosa || "0");
    if (vlGlosa > 0 && vlPago === 0) return "glosado";
    if (vlGlosa > 0 && vlPago > 0) return "pago_parcial";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.some(h => h.includes("ipasgo")) || 
      (headers.includes("guia") && headers.includes("beneficiario") && headers.includes("cod_glosa"));
  },
});

// GEAP
registrarParser({
  convenioId: 120006,
  nomeConvenio: "GEAP",
  formatosSuportados: ["xlsx", "xls"],
  mapeamentoColunas: {
    data_pagto: "Data Entrega",
    protocolo_tiss: "Protocolo",
    lote_prestador: "Protocolo TMS/Lote",
    numero_guia: "Nªguia",
    seq: "Seq. Cliente",
    beneficiario: "N Carteira Cliente",
    Nome_benefeciario: "Cliente",
    data_execucao: "Data de Atendimento",
    item: "Nº Serviço",
    item_desc: "Serviço",
    quantidade: "Quantidade",
    valor_pagamento: "Valor Calculado Item",
    tipo_lancamento: "Descrição Tipo Guia",
    erro_tiss: "Justificativa Padrão",
    acomodacao_internacao: "tipo guia",
    data_inicio_faturamento_internacao: "Data Baixa",
    nome_prestador: "PROFISSIONAL EXECUTANTE",
    valor_glosa: "Valor Glosado Item",
    Guia_prestador: "Guia Contratado",
    codigo_glosa: "Justificativa",
  },
  logicaSituacao: (row) => {
    const existeGlosa = (row["Existe Glosa"] || "").toString().toLowerCase();
    if (existeGlosa === "verdadeiro" || existeGlosa === "true") return "glosado";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.includes("protocolo tms/lote") || 
      (headers.includes("nªguia") && headers.includes("seq. cliente"));
  },
});

// VIVACOM (Demonstrativo 12-2025)
registrarParser({
  convenioId: 210013,
  nomeConvenio: "VIVACOM",
  formatosSuportados: ["xlsx", "xls", "csv"],
  mapeamentoColunas: {
    numero_guia: "guia",
    Nome_benefeciario: "associado",
    data_execucao: "data atendimento",
    item: "CODIGO",
    item_desc: "PROCEDIMENTO",
    valor_pagamento: "VALOR PAGO",
    erro_tiss: "COD. GLOSA",
    nome_prestador: "PROFISSIONAL EXECUTANTE",
    valor_glosa: "VALOR GLOSA",
  },
  logicaSituacao: (row) => {
    const vlPago = parseFloat(row["VALOR PAGO"] || row["valor pago"] || "0");
    if (vlPago > 0) return "pago";
    return "glosado";
  },
  detectarFormato: (headers) => {
    return headers.includes("associado") && headers.includes("procedimento") && headers.includes("cod. glosa");
  },
});

// CASSI
registrarParser({
  convenioId: 180001,
  nomeConvenio: "CASSI",
  formatosSuportados: ["xlsx", "xls", "pdf"],
  mapeamentoColunas: {
    numero_guia: "GUIA",
    Nome_benefeciario: "NOME_BENEFICIARIO",
    data_execucao: "DATA_EXECUCAO",
    item: "CODIGO_PROCEDIMENTO",
    item_desc: "DESCRICAO_PROCEDIMENTO",
    quantidade: "QUANTIDADE",
    valor_pagamento: "VALOR_PAGO",
    valor_glosa: "VALOR_GLOSA",
    codigo_glosa: "CODIGO_GLOSA",
    erro_tiss: "MOTIVO_GLOSA",
    nome_prestador: "PROFISSIONAL",
  },
  logicaSituacao: (row) => {
    const vlGlosa = parseFloat(row.VALOR_GLOSA || row.valor_glosa || "0");
    const vlPago = parseFloat(row.VALOR_PAGO || row.valor_pago || "0");
    if (vlGlosa > 0 && vlPago === 0) return "glosado";
    if (vlGlosa > 0 && vlPago > 0) return "pago_parcial";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.some(h => h.includes("cassi")) || 
      (headers.includes("codigo_procedimento") && headers.includes("nome_beneficiario"));
  },
});

// UNIMED
registrarParser({
  convenioId: 10001,
  nomeConvenio: "UNIMED",
  formatosSuportados: ["xlsx", "xls", "xml"],
  mapeamentoColunas: {
    numero_guia: "NUMERO_GUIA",
    Nome_benefeciario: "NOME_BENEFICIARIO",
    data_execucao: "DATA_REALIZACAO",
    item: "CODIGO_TABELA",
    item_desc: "DESCRICAO_TABELA",
    quantidade: "QUANTIDADE_EXECUTADA",
    valor_pagamento: "VALOR_PROCESSADO",
    valor_glosa: "VALOR_GLOSA",
    codigo_glosa: "CODIGO_GLOSA",
    erro_tiss: "DESCRICAO_GLOSA",
    nome_prestador: "NOME_EXECUTANTE",
    protocolo_tiss: "NUMERO_PROTOCOLO",
  },
  logicaSituacao: (row) => {
    const vlGlosa = parseFloat(row.VALOR_GLOSA || "0");
    const vlPago = parseFloat(row.VALOR_PROCESSADO || "0");
    if (vlGlosa > 0 && vlPago === 0) return "glosado";
    if (vlGlosa > 0 && vlPago > 0) return "pago_parcial";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.some(h => h.includes("unimed")) || 
      (headers.includes("numero_guia") && headers.includes("valor_processado") && headers.includes("codigo_tabela"));
  },
});

// AMIL/HAPVIDA
registrarParser({
  convenioId: 50001,
  nomeConvenio: "AMIL/HAPVIDA",
  formatosSuportados: ["xlsx", "xls"],
  mapeamentoColunas: {
    numero_guia: "Nr Guia Prestador",
    Nome_benefeciario: "Nome Beneficiário",
    data_execucao: "Data Execução",
    item: "Código Procedimento",
    item_desc: "Descrição Procedimento",
    quantidade: "Qtde Executada",
    valor_pagamento: "Valor Pago",
    valor_glosa: "Valor Glosado",
    codigo_glosa: "Código Glosa",
    erro_tiss: "Descrição Glosa",
    nome_prestador: "Nome Executante",
    protocolo_tiss: "Nr Protocolo",
  },
  logicaSituacao: (row) => {
    const vlGlosa = parseFloat(row["Valor Glosado"] || "0");
    const vlPago = parseFloat(row["Valor Pago"] || "0");
    if (vlGlosa > 0 && vlPago === 0) return "glosado";
    if (vlGlosa > 0 && vlPago > 0) return "pago_parcial";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.includes("nr guia prestador") && headers.includes("nome beneficiário");
  },
});

// SUS / DATASUS
registrarParser({
  convenioId: 99999,
  nomeConvenio: "SUS",
  formatosSuportados: ["dbf", "csv", "txt"],
  mapeamentoColunas: {
    numero_guia: "AIH",
    Nome_benefeciario: "NOME_PACIENTE",
    data_execucao: "DT_INTERNACAO",
    item: "PROC_REALIZADO",
    item_desc: "DESC_PROCEDIMENTO",
    quantidade: "QTD_REALIZADA",
    valor_pagamento: "VAL_APROVADO",
    valor_glosa: "VAL_REJEITADO",
    codigo_glosa: "COD_REJEICAO",
  },
  logicaSituacao: (row) => {
    const vlRej = parseFloat(row.VAL_REJEITADO || "0");
    if (vlRej > 0) return "glosado";
    return "pago";
  },
  detectarFormato: (headers) => {
    return headers.includes("aih") && headers.includes("proc_realizado");
  },
});

/**
 * Processar arquivo usando o parser adequado
 * Se convenioId for fornecido, usa o parser específico.
 * Caso contrário, tenta detectar automaticamente.
 */
export function processarArquivo(params: {
  headers: string[];
  rows: Record<string, any>[];
  convenioId?: number;
}): ParserResult {
  const { headers, rows, convenioId } = params;
  
  let config: ParserConfig | null | undefined;
  
  if (convenioId) {
    config = obterParser(convenioId);
  }
  
  if (!config) {
    config = detectarConvenio(headers);
  }
  
  if (!config) {
    return {
      itens: [],
      totalLinhas: rows.length,
      erros: ["Não foi possível detectar o formato do arquivo. Nenhum parser compatível encontrado."],
    };
  }
  
  return aplicarParser(config, rows);
}

/**
 * Obter informações sobre parsers disponíveis para exibição na UI
 */
export function obterInfoParsers(): Array<{
  convenioId: number;
  nomeConvenio: string;
  formatosSuportados: string[];
  camposMapeados: string[];
}> {
  return listarParsers().map(p => ({
    convenioId: p.convenioId,
    nomeConvenio: p.nomeConvenio,
    formatosSuportados: p.formatosSuportados,
    camposMapeados: Object.keys(p.mapeamentoColunas),
  }));
}
