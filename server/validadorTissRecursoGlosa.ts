/**
 * Validador TISS para XML de Recurso de Glosa
 * Baseado no schema XSD TISS 4.01.00 (tissGuiasV4_01_00.xsd - ctm_recursoGlosa)
 * 
 * Valida estrutura, campos obrigatórios, tipos de dados e regras de negócio
 * conforme o padrão ANS.
 */

import { XMLParser } from "fast-xml-parser";

export interface ValidacaoResultado {
  valido: boolean;
  erros: ValidacaoErro[];
  avisos: ValidacaoErro[];
}

export interface ValidacaoErro {
  campo: string;
  mensagem: string;
  tipo: "obrigatorio" | "formato" | "tamanho" | "estrutura" | "valor" | "hash" | "schema" | "seguranca";
}

// Tipos TISS conforme XSD
const TISS_TIPOS = {
  st_registroANS: { maxLength: 6, pattern: /^\d{6}$/ },
  st_texto20: { maxLength: 20 },
  st_texto70: { maxLength: 70 },
  st_texto12: { maxLength: 12 },
  st_texto14: { maxLength: 14 },
  st_texto500: { maxLength: 500 },
  st_numerico4: { maxLength: 4, pattern: /^\d{1,4}$/ },
  st_numerico12: { maxLength: 12, pattern: /^\d{1,12}$/ },
  st_data: { pattern: /^\d{4}-\d{2}-\d{2}$/ },
  st_hora: { pattern: /^\d{2}:\d{2}:\d{2}$/ },
  st_decimal8_2: { pattern: /^\d{1,8}(\.\d{1,2})?$/ },
  st_decimal10_2: { pattern: /^\d{1,10}(\.\d{1,2})?$/ },
  dm_tipoGlosa: { pattern: /^\d{1,4}$/ },
  dm_versao: { values: ["4.01.00", "4.00.01", "4.00.00", "3.05.00", "3.04.01", "3.04.00", "3.03.03", "3.02.00", "3.01.02"] },
  dm_objetoRecurso: { values: ["1", "2"] }, // 1=Protocolo, 2=Guia
};

/**
 * Valida um XML de recurso de glosa contra o padrão TISS 4.01.00
 */
export function validarXmlRecursoGlosa(xmlContent: string): ValidacaoResultado {
  const erros: ValidacaoErro[] = [];
  const avisos: ValidacaoErro[] = [];

  // 1. Verificar header XML
  if (!xmlContent.startsWith('<?xml')) {
    erros.push({ campo: "header", mensagem: "XML deve começar com declaração <?xml ...?>", tipo: "estrutura" });
  }

  if (!xmlContent.includes('encoding="UTF-8"') && !xmlContent.includes("encoding='UTF-8'")) {
    avisos.push({ campo: "header", mensagem: "Encoding recomendado é UTF-8", tipo: "formato" });
  }

  // 2. Parsear o XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    parseTagValue: false,
    trimValues: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlContent);
  } catch {
    erros.push({ campo: "xml", mensagem: "XML malformado.", tipo: "estrutura" });
    return { valido: false, erros, avisos };
  }

  // 3. Verificar elemento raiz
  const mensagemTISS = parsed["ans:mensagemTISS"];
  if (!mensagemTISS) {
    erros.push({ campo: "ans:mensagemTISS", mensagem: "Elemento raiz ans:mensagemTISS não encontrado", tipo: "estrutura" });
    return { valido: false, erros, avisos };
  }

  // 4. Verificar namespace
  const xmlns = mensagemTISS["@_xmlns:ans"];
  if (xmlns !== "http://www.ans.gov.br/padroes/tiss/schemas") {
    erros.push({ campo: "xmlns:ans", mensagem: "Namespace ANS incorreto ou ausente", tipo: "estrutura" });
  }

  // 5. Validar cabecalho
  validarCabecalho(mensagemTISS["ans:cabecalho"], erros, avisos);

  // 6. Validar prestadorParaOperadora > recursoGlosa
  const prestador = mensagemTISS["ans:prestadorParaOperadora"];
  if (!prestador) {
    erros.push({ campo: "ans:prestadorParaOperadora", mensagem: "Elemento prestadorParaOperadora obrigatório", tipo: "obrigatorio" });
  } else {
    const recursoGlosa = prestador["ans:recursoGlosa"];
    if (!recursoGlosa) {
      erros.push({ campo: "ans:recursoGlosa", mensagem: "Elemento recursoGlosa obrigatório", tipo: "obrigatorio" });
    } else {
      const guiaRecurso = recursoGlosa["ans:guiaRecursoGlosa"];
      if (!guiaRecurso) {
        erros.push({ campo: "ans:guiaRecursoGlosa", mensagem: "Elemento guiaRecursoGlosa obrigatório", tipo: "obrigatorio" });
      } else {
        validarGuiaRecursoGlosa(guiaRecurso, erros, avisos);
      }
    }
  }

  // 7. Validar epílogo
  const epilogo = mensagemTISS["ans:epilogo"];
  if (!epilogo) {
    erros.push({ campo: "ans:epilogo", mensagem: "Elemento epilogo obrigatório", tipo: "obrigatorio" });
  } else {
    const hash = epilogo["ans:hash"];
    if (!hash) {
      erros.push({ campo: "ans:hash", mensagem: "Hash MD5 obrigatório no epílogo", tipo: "obrigatorio" });
    } else if (typeof hash === "string" && !/^[a-f0-9]{32}$/i.test(hash)) {
      erros.push({ campo: "ans:hash", mensagem: `Hash MD5 inválido: ${hash} (deve ter 32 caracteres hexadecimais)`, tipo: "hash" });
    }
  }

  return { valido: erros.length === 0, erros, avisos };
}

function validarCabecalho(cabecalho: any, erros: ValidacaoErro[], avisos: ValidacaoErro[]) {
  if (!cabecalho) {
    erros.push({ campo: "ans:cabecalho", mensagem: "Cabeçalho obrigatório", tipo: "obrigatorio" });
    return;
  }

  const identificacao = cabecalho["ans:identificacaoTransacao"];
  if (!identificacao) {
    erros.push({ campo: "ans:identificacaoTransacao", mensagem: "Identificação da transação obrigatória", tipo: "obrigatorio" });
  } else {
    validarCampoObrigatorio(identificacao, "ans:tipoTransacao", "Tipo de transação", erros);
    validarCampoObrigatorio(identificacao, "ans:sequencialTransacao", "Sequencial da transação", erros);
    validarCampoData(identificacao, "ans:dataRegistroTransacao", "Data de registro", erros);
    validarCampoHora(identificacao, "ans:horaRegistroTransacao", "Hora de registro", erros);

    // Verificar se tipoTransacao é RECURSO_GLOSA
    const tipo = identificacao["ans:tipoTransacao"];
    if (tipo && tipo !== "RECURSO_GLOSA") {
      erros.push({ campo: "ans:tipoTransacao", mensagem: `Tipo de transação deve ser RECURSO_GLOSA, encontrado: ${tipo}`, tipo: "valor" });
    }
  }

  // Origem
  const origem = cabecalho["ans:origem"];
  if (!origem) {
    erros.push({ campo: "ans:origem", mensagem: "Origem obrigatória no cabeçalho", tipo: "obrigatorio" });
  } else {
    const prestador = origem["ans:identificacaoPrestador"];
    if (!prestador) {
      erros.push({ campo: "ans:identificacaoPrestador", mensagem: "Identificação do prestador obrigatória na origem", tipo: "obrigatorio" });
    } else {
      // Pode ter codigoPrestadorNaOperadora ou CNPJ
      const codigo = prestador["ans:codigoPrestadorNaOperadora"];
      const cnpj = prestador["ans:CNPJ"];
      if (!codigo && !cnpj) {
        erros.push({ campo: "ans:identificacaoPrestador", mensagem: "Código do prestador ou CNPJ obrigatório", tipo: "obrigatorio" });
      }
    }
  }

  // Destino
  const destino = cabecalho["ans:destino"];
  if (!destino) {
    erros.push({ campo: "ans:destino", mensagem: "Destino obrigatório no cabeçalho", tipo: "obrigatorio" });
  } else {
    const registroANS = destino["ans:registroANS"];
    if (!registroANS) {
      erros.push({ campo: "ans:registroANS (destino)", mensagem: "Registro ANS da operadora obrigatório no destino", tipo: "obrigatorio" });
    } else {
      validarRegistroANS(String(registroANS), "ans:registroANS (destino)", erros);
    }
  }

  // Versão padrão (aceitar tanto ans:Padrao quanto ans:versaoPadrao para compatibilidade entre versões TISS)
  const versaoPadrao = cabecalho["ans:versaoPadrao"] || cabecalho["ans:Padrao"];
  if (!versaoPadrao) {
    erros.push({ campo: "ans:versaoPadrao", mensagem: "Versão do padrão TISS é obrigatório", tipo: "obrigatorio" });
  }
}

function validarGuiaRecursoGlosa(guia: any, erros: ValidacaoErro[], avisos: ValidacaoErro[]) {
  // Campos obrigatórios do ctm_recursoGlosa
  validarCampoObrigatorio(guia, "ans:registroANS", "Registro ANS da operadora", erros);
  if (guia["ans:registroANS"]) {
    validarRegistroANS(String(guia["ans:registroANS"]), "ans:registroANS", erros);
  }

  validarCampoObrigatorio(guia, "ans:numeroGuiaRecGlosaPrestador", "Número da guia de recurso do prestador", erros);
  validarCampoTexto(guia, "ans:numeroGuiaRecGlosaPrestador", 20, erros);

  validarCampoObrigatorio(guia, "ans:nomeOperadora", "Nome da operadora", erros);
  validarCampoTexto(guia, "ans:nomeOperadora", 70, erros);

  validarCampoObrigatorio(guia, "ans:objetoRecurso", "Objeto do recurso", erros);
  const objetoRecurso = guia["ans:objetoRecurso"];
  if (objetoRecurso && !["1", "2"].includes(String(objetoRecurso))) {
    erros.push({ campo: "ans:objetoRecurso", mensagem: `Objeto do recurso inválido: ${objetoRecurso} (deve ser 1=Protocolo ou 2=Guia)`, tipo: "valor" });
  }

  // dadosContratado (ct_contratadoDados: choice(codigoPrestadorNaOperadora|cpfContratado|cnpjContratado) + nomeContratado)
  const dadosContratado = guia["ans:dadosContratado"];
  if (!dadosContratado) {
    erros.push({ campo: "ans:dadosContratado", mensagem: "Dados do contratado obrigatórios", tipo: "obrigatorio" });
  } else {
    const codigo = dadosContratado["ans:codigoPrestadorNaOperadora"];
    const cnpj = dadosContratado["ans:cnpjContratado"] || dadosContratado["ans:CNPJ"];
    const cpf = dadosContratado["ans:cpfContratado"] || dadosContratado["ans:CPF"];
    if (!codigo && !cnpj && !cpf) {
      erros.push({ campo: "ans:dadosContratado", mensagem: "Código do prestador, CNPJ ou CPF obrigatório nos dados do contratado", tipo: "obrigatorio" });
    }
    // nomeContratado é obrigatório no ct_contratadoDados (TISS 3.02+)
    const nomeContratado = dadosContratado["ans:nomeContratado"];
    if (!nomeContratado) {
      avisos.push({ campo: "ans:nomeContratado", mensagem: "Nome do contratado recomendado nos dados do contratado (obrigatório no XSD)", tipo: "obrigatorio" });
    }
  }

  validarCampoObrigatorio(guia, "ans:numeroLote", "Número do lote", erros);
  validarCampoObrigatorio(guia, "ans:numeroProtocolo", "Número do protocolo", erros);

  // opcaoRecurso
  const opcaoRecurso = guia["ans:opcaoRecurso"];
  if (!opcaoRecurso) {
    erros.push({ campo: "ans:opcaoRecurso", mensagem: "Opção de recurso obrigatória", tipo: "obrigatorio" });
  } else {
    validarOpcaoRecurso(opcaoRecurso, erros, avisos);
  }

  // valorTotalRecursado
  validarCampoObrigatorio(guia, "ans:valorTotalRecursado", "Valor total recursado", erros);
  if (guia["ans:valorTotalRecursado"]) {
    const valor = String(guia["ans:valorTotalRecursado"]);
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(valor)) {
      erros.push({ campo: "ans:valorTotalRecursado", mensagem: `Formato inválido: ${valor} (deve ser decimal com até 10 dígitos e 2 casas)`, tipo: "formato" });
    }
  }

  // dataRecurso
  validarCampoData(guia, "ans:dataRecurso", "Data do recurso", erros);
}

function validarOpcaoRecurso(opcao: any, erros: ValidacaoErro[], avisos: ValidacaoErro[]) {
  const recursoGuia = opcao["ans:recursoGuia"];
  const recursoProtocolo = opcao["ans:recursoProtocolo"];

  if (!recursoGuia && !recursoProtocolo) {
    erros.push({ campo: "ans:opcaoRecurso", mensagem: "Deve conter recursoGuia ou recursoProtocolo", tipo: "obrigatorio" });
    return;
  }

  if (recursoGuia) {
    const guias = Array.isArray(recursoGuia) ? recursoGuia : [recursoGuia];
    
    if (guias.length > 100) {
      erros.push({ campo: "ans:recursoGuia", mensagem: `Máximo de 100 guias por recurso, encontradas: ${guias.length}`, tipo: "tamanho" });
    }

    guias.forEach((g: any, idx: number) => {
      const prefix = `ans:recursoGuia[${idx + 1}]`;
      
      validarCampoObrigatorio(g, "ans:numeroGuiaOrigem", `${prefix} - Número da guia de origem`, erros);
      validarCampoTexto(g, "ans:numeroGuiaOrigem", 20, erros);

      // senha é opcional
      // numeroGuiaOperadora é opcional

      const opcaoGuia = g["ans:opcaoRecursoGuia"];
      if (!opcaoGuia) {
        erros.push({ campo: `${prefix}.ans:opcaoRecursoGuia`, mensagem: "Opção de recurso da guia obrigatória", tipo: "obrigatorio" });
      } else {
        const itensGuia = opcaoGuia["ans:itensGuia"];
        const recursoCompleta = opcaoGuia["ans:recursoGuiaCompleta"];

        if (!itensGuia && !recursoCompleta) {
          erros.push({ campo: `${prefix}.ans:opcaoRecursoGuia`, mensagem: "Deve conter itensGuia ou recursoGuiaCompleta", tipo: "obrigatorio" });
        }

        if (itensGuia) {
          const itens = Array.isArray(itensGuia) ? itensGuia : [itensGuia];
          itens.forEach((item: any, itemIdx: number) => {
            validarItemGuia(item, `${prefix}.itensGuia[${itemIdx + 1}]`, erros, avisos);
          });
        }
      }
    });
  }
}

function validarItemGuia(item: any, prefix: string, erros: ValidacaoErro[], avisos: ValidacaoErro[]) {
  // sequencialItem - NÃO EXISTE no XSD TISS 3.02 (removido). Apenas validar se presente.
  if (item["ans:sequencialItem"]) {
    const seq = String(item["ans:sequencialItem"]);
    if (!/^\d{1,4}$/.test(seq)) {
      erros.push({ campo: `${prefix}.ans:sequencialItem`, mensagem: `Sequencial inválido: ${seq} (deve ser numérico com até 4 dígitos)`, tipo: "formato" });
    }
  }

  // dataInicio obrigatório
  validarCampoData(item, "ans:dataInicio", `${prefix} - Data de início`, erros);

  // procRecurso obrigatório (ct_procedimentoDados)
  const proc = item["ans:procRecurso"];
  if (!proc) {
    erros.push({ campo: `${prefix}.ans:procRecurso`, mensagem: "Dados do procedimento obrigatórios", tipo: "obrigatorio" });
  } else {
    validarCampoObrigatorio(proc, "ans:codigoTabela", `${prefix} - Código da tabela`, erros);
    validarCampoObrigatorio(proc, "ans:codigoProcedimento", `${prefix} - Código do procedimento`, erros);
    validarCampoObrigatorio(proc, "ans:descricaoProcedimento", `${prefix} - Descrição do procedimento`, erros);
  }

  // codGlosaItem obrigatório (dm_tipoGlosa - numérico)
  validarCampoObrigatorio(item, "ans:codGlosaItem", `${prefix} - Código de glosa do item`, erros);
  if (item["ans:codGlosaItem"]) {
    const cod = String(item["ans:codGlosaItem"]);
    if (!/^\d{1,4}$/.test(cod)) {
      erros.push({ campo: `${prefix}.ans:codGlosaItem`, mensagem: `Código de glosa inválido: ${cod} (deve ser numérico com até 4 dígitos conforme dm_tipoGlosa)`, tipo: "formato" });
    }
  }

  // valorRecursado obrigatório (st_decimal8-2)
  validarCampoObrigatorio(item, "ans:valorRecursado", `${prefix} - Valor recursado`, erros);
  if (item["ans:valorRecursado"]) {
    const valor = String(item["ans:valorRecursado"]);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(valor)) {
      erros.push({ campo: `${prefix}.ans:valorRecursado`, mensagem: `Formato inválido: ${valor} (deve ser decimal com até 8 dígitos e 2 casas)`, tipo: "formato" });
    }
  }

  // justificativaItem obrigatório (st_texto500)
  validarCampoObrigatorio(item, "ans:justificativaItem", `${prefix} - Justificativa do item`, erros);
  validarCampoTexto(item, "ans:justificativaItem", 500, erros);
}

// Funções auxiliares de validação
function validarCampoObrigatorio(obj: any, campo: string, descricao: string, erros: ValidacaoErro[]) {
  if (!obj || obj[campo] === undefined || obj[campo] === null || obj[campo] === "") {
    erros.push({ campo, mensagem: `${descricao} é obrigatório`, tipo: "obrigatorio" });
  }
}

function validarCampoTexto(obj: any, campo: string, maxLength: number, erros: ValidacaoErro[]) {
  if (obj && obj[campo]) {
    const valor = String(obj[campo]);
    if (valor.length > maxLength) {
      erros.push({ campo, mensagem: `Excede tamanho máximo de ${maxLength} caracteres (atual: ${valor.length})`, tipo: "tamanho" });
    }
  }
}

function validarCampoData(obj: any, campo: string, descricao: string, erros: ValidacaoErro[]) {
  validarCampoObrigatorio(obj, campo, descricao, erros);
  if (obj && obj[campo]) {
    const valor = String(obj[campo]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      erros.push({ campo, mensagem: `${descricao}: formato de data inválido: ${valor} (deve ser YYYY-MM-DD)`, tipo: "formato" });
    } else {
      const date = new Date(valor);
      if (isNaN(date.getTime())) {
        erros.push({ campo, mensagem: `${descricao}: data inválida: ${valor}`, tipo: "valor" });
      }
    }
  }
}

function validarCampoHora(obj: any, campo: string, descricao: string, erros: ValidacaoErro[]) {
  validarCampoObrigatorio(obj, campo, descricao, erros);
  if (obj && obj[campo]) {
    const valor = String(obj[campo]);
    if (!/^\d{2}:\d{2}:\d{2}$/.test(valor)) {
      erros.push({ campo, mensagem: `${descricao}: formato de hora inválido: ${valor} (deve ser HH:MM:SS)`, tipo: "formato" });
    }
  }
}

function validarRegistroANS(valor: string, campo: string, erros: ValidacaoErro[]) {
  if (!/^\d{6}$/.test(valor)) {
    erros.push({ campo, mensagem: `Registro ANS inválido: ${valor} (deve ter 6 dígitos)`, tipo: "formato" });
  }
}
