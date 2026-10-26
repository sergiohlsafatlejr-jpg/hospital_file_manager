import sax, { type QualifiedTag } from "sax";
import {
  RETORNO_FORMATO,
  RETORNO_XML_MAX_BYTES,
  RETORNO_XML_MAX_ITENS,
  retornoDataCivilValida,
  type RetornoXmlDocumento,
  type RetornoXmlLinha,
} from "../shared/retornosRecursos";

const MAX_PROFUNDIDADE_XML = 32;
const MAX_TEXTO_CAMPO = 4_000;

/** Mensagens intencionalmente fixas: nunca incluem conteúdo do XML recebido. */
const ERRO_XML_INVALIDO = "XML de retorno de recurso inválido.";
const ERRO_XML_MUITO_GRANDE = "O arquivo XML excede o limite permitido.";
const ERRO_MULTIPLOS_RECIBOS = "O XML contém mais de um recibo e não pode ser importado.";

type Campos = Record<string, string>;
type NoAberto = { local: string; texto: string };

const CAMPOS_RECIBO = new Set([
  "registroANS",
  "codigoPrestador",
  "numeroLote",
  "numeroProtocolo",
  "numeroGuiaRecGlosaPrestador",
  "numeroGuiaRecGlosaOperadora",
  "nomeOperadora",
  "objetoRecurso",
  "dataRecurso",
  "valorTotalRecursado",
  "valorTotalAcatado",
]);

const CAMPOS_ITEM = new Set([
  "numeroGuiaPrestador",
  "numeroGuiaOperadora",
  "senha",
  "sequencialItem",
  "dataRealizacao",
  "codGlosa",
  "valorRecursado",
  "valorAcatadado",
  "justificativaPrestador",
  "justificativaOperadora",
]);

const CAMPOS_PROCEDIMENTO = new Set(["codigoTabela", "codigoProcedimento"]);

function falhar(): never {
  throw new Error(ERRO_XML_INVALIDO);
}

function textoObrigatorio(campos: Campos, campo: string): string {
  const valor = campos[campo];
  if (typeof valor !== "string" || valor.trim().length === 0) falhar();
  return valor.trim();
}

function textoOpcional(campos: Campos, campo: string): string | null {
  const valor = campos[campo];
  if (valor === undefined) return null;
  const normalizado = valor.trim();
  return normalizado.length > 0 ? normalizado : null;
}

function dataCivilObrigatoria(campos: Campos, campo: string): string {
  const valor = textoObrigatorio(campos, campo);
  if (!retornoDataCivilValida(valor)) falhar();
  return valor;
}

function dataCivilOpcional(campos: Campos, campo: string): string | null {
  const valor = textoOpcional(campos, campo);
  if (valor === null) return null;
  if (!retornoDataCivilValida(valor)) falhar();
  return valor;
}

/**
 * Converte um decimal TISS para centavos sem passar por Number/float.
 * Aceita no máximo doze algarismos na parte inteira e duas casas decimais.
 */
function decimalNaoNegativo(valor: string): { canonico: string; centavos: bigint } {
  const encontrado = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(valor);
  if (!encontrado) falhar();

  const inteiro = encontrado[1];
  const fracao = (encontrado[2] ?? "").padEnd(2, "0");
  const centavos = BigInt(inteiro) * 100n + BigInt(fracao);
  return { canonico: `${inteiro}.${fracao}`, centavos };
}

function valorOpcional(campos: Campos, campo: string): { canonico: string; centavos: bigint } | null {
  const valor = textoOpcional(campos, campo);
  return valor === null ? null : decimalNaoNegativo(valor);
}

function valorFormatado(centavos: bigint): string {
  const inteiro = centavos / 100n;
  const fracao = (centavos % 100n).toString().padStart(2, "0");
  return `${inteiro}.${fracao}`;
}

function validarIdentificador(valor: string): string {
  // Mantém zeros à esquerda e caracteres de negócio; apenas recusa controle e tamanho anômalo.
  if (valor.length > 100 || /[\x00-\x1f\x7f]/.test(valor)) falhar();
  return valor;
}

function validarSequencial(valor: string | null): string | null {
  if (valor === null) return null;
  if (!/^\d{1,12}$/.test(valor)) falhar();
  return valor;
}

function caminhoEh(caminho: string[], esperado: string[]): boolean {
  return caminho.length === esperado.length && caminho.every((parte, indice) => parte === esperado[indice]);
}

function definirCampo(destino: Campos, campo: string, valor: string): void {
  if (Object.prototype.hasOwnProperty.call(destino, campo)) falhar();
  if (valor.length > MAX_TEXTO_CAMPO) falhar();
  destino[campo] = valor;
}

function criarLinha(campos: Campos, posicao: number): RetornoXmlLinha {
  const valorRecursado = decimalNaoNegativo(textoObrigatorio(campos, "valorRecursado"));
  const valorAcatado = decimalNaoNegativo(textoObrigatorio(campos, "valorAcatadado"));
  if (valorAcatado.centavos > valorRecursado.centavos) falhar();

  return {
    posicao,
    guiaPrestador: validarIdentificador(textoObrigatorio(campos, "numeroGuiaPrestador")),
    guiaOperadora: validarIdentificador(textoObrigatorio(campos, "numeroGuiaOperadora")),
    sequencialItem: validarSequencial(textoOpcional(campos, "sequencialItem")),
    dataExecucao: dataCivilOpcional(campos, "dataRealizacao"),
    codigoTabela: validarIdentificador(textoObrigatorio(campos, "codigoTabela")),
    codigoItem: validarIdentificador(textoObrigatorio(campos, "codigoProcedimento")),
    codigoGlosa: validarIdentificador(textoObrigatorio(campos, "codGlosa")),
    valorRecursado: valorRecursado.canonico,
    valorAcatado: valorAcatado.canonico,
    justificativaPrestador: textoObrigatorio(campos, "justificativaPrestador"),
    justificativaOperadora: textoObrigatorio(campos, "justificativaOperadora"),
  };
}

/**
 * Faz o parse estrito do recibo de resposta de recurso de glosa CASSI/TISS 4.01.00.
 *
 * O contrato atual possui cabeçalho único. Por isso, um XML com mais de um recibo é
 * rejeitado em vez de achatar recibos diferentes e perder a chave de origem.
 */
export function parseRetornoCassiXml(buffer: Buffer): RetornoXmlDocumento {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) falhar();
  if (buffer.length > RETORNO_XML_MAX_BYTES) throw new Error(ERRO_XML_MUITO_GRANDE);

  // SAX não resolve entidades externas, mas a recusa anterior torna a política explícita.
  if (/<!DOCTYPE|<!ENTITY/i.test(buffer.toString("latin1"))) falhar();

  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    falhar();
  }

  const pilha: NoAberto[] = [];
  const camposCabecalho: Campos = {};
  let camposRecibo: Campos | null = null;
  let camposItem: Campos | null = null;
  const linhas: RetornoXmlLinha[] = [];
  let recibos = 0;
  let encontrouRaiz = false;
  let falhou = false;

  const parser = sax.parser(true, { trim: false, xmlns: true, position: true });
  parser.ENTITIES = Object.create(null) as Record<string, string>;

  const marcarFalha = () => {
    falhou = true;
  };

  parser.ondoctype = marcarFalha;
  parser.onsgmldeclaration = marcarFalha;
  parser.onprocessinginstruction = (instrucao) => {
    // A declaração XML é tratada internamente pelo sax. Nenhuma outra PI é aceita.
    if (instrucao.name.toLowerCase() !== "xml") marcarFalha();
  };
  parser.onerror = marcarFalha;
  parser.onopentag = (tag) => {
    const tagQualificada = tag as QualifiedTag;
    const partesNome = tag.name.split(":");
    const local = tagQualificada.local || partesNome[partesNome.length - 1] || "";
    pilha.push({ local, texto: "" });
    if (pilha.length > MAX_PROFUNDIDADE_XML) marcarFalha();

    if (pilha.length === 1) {
      if (local !== "mensagemTISS" || encontrouRaiz) marcarFalha();
      encontrouRaiz = true;
    }

    const caminho = pilha.map(no => no.local);
    if (caminhoEh(caminho, ["mensagemTISS", "operadoraParaPrestador", "respostaRecursoGlosa", "reciboGlosa"])) {
      recibos += 1;
      if (recibos > 1) marcarFalha();
      camposRecibo = {};
    }

    if (caminhoEh(caminho, ["mensagemTISS", "operadoraParaPrestador", "respostaRecursoGlosa", "reciboGlosa", "opcaoRecurso", "recursoGuia", "respostaGuiaItens"])) {
      if (!camposRecibo || camposItem) marcarFalha();
      if (linhas.length >= RETORNO_XML_MAX_ITENS) marcarFalha();
      camposItem = {};
    }
  };
  parser.ontext = (texto) => {
    const atual = pilha[pilha.length - 1];
    if (atual) atual.texto += texto;
  };
  parser.oncdata = (texto) => {
    const atual = pilha[pilha.length - 1];
    if (atual) atual.texto += texto;
  };
  parser.onclosetag = () => {
    const atual = pilha[pilha.length - 1];
    if (!atual) {
      marcarFalha();
      return;
    }

    const caminho = pilha.map(no => no.local);
    const valor = atual.texto.trim();
    const folha = atual.local;

    if (caminhoEh(caminho, ["mensagemTISS", "cabecalho", "Padrao"])) {
      definirCampo(camposCabecalho, "Padrao", valor);
    }
    if (caminhoEh(caminho, ["mensagemTISS", "cabecalho", "identificacaoTransacao", "tipoTransacao"])) {
      definirCampo(camposCabecalho, "tipoTransacao", valor);
    }
    if (caminhoEh(caminho, ["mensagemTISS", "cabecalho", "identificacaoTransacao", "dataRegistroTransacao"])) {
      definirCampo(camposCabecalho, "dataRegistroTransacao", valor);
    }

    const prefixoRecibo = ["mensagemTISS", "operadoraParaPrestador", "respostaRecursoGlosa", "reciboGlosa"];
    if (
      camposRecibo &&
      caminho.length === prefixoRecibo.length + 1 &&
      caminhoEh(caminho.slice(0, -1), prefixoRecibo) &&
      CAMPOS_RECIBO.has(folha)
    ) {
      definirCampo(camposRecibo, folha, valor);
    }

    const prefixoItem = [...prefixoRecibo, "opcaoRecurso", "recursoGuia", "respostaGuiaItens"];
    if (
      camposItem &&
      caminho.length === prefixoItem.length + 1 &&
      caminhoEh(caminho.slice(0, -1), prefixoItem) &&
      CAMPOS_ITEM.has(folha)
    ) {
      definirCampo(camposItem, folha, valor);
    }
    if (
      camposItem &&
      caminho.length === prefixoItem.length + 2 &&
      caminhoEh(caminho.slice(0, -2), prefixoItem) &&
      caminho[caminho.length - 2] === "procRecurso" &&
      CAMPOS_PROCEDIMENTO.has(folha)
    ) {
      definirCampo(camposItem, folha, valor);
    }

    if (caminhoEh(caminho, prefixoItem)) {
      if (!camposItem) marcarFalha();
      else {
        try {
          linhas.push(criarLinha(camposItem, linhas.length + 1));
        } catch {
          marcarFalha();
        }
      }
      camposItem = null;
    }

    pilha.pop();
  };

  try {
    parser.write(xml).close();
  } catch {
    marcarFalha();
  }

  if (recibos > 1) throw new Error(ERRO_MULTIPLOS_RECIBOS);
  if (falhou || pilha.length !== 0 || !encontrouRaiz || !camposRecibo) falhar();
  if (textoObrigatorio(camposCabecalho, "Padrao") !== "4.01.00") falhar();
  if (textoObrigatorio(camposCabecalho, "tipoTransacao") !== "RESPOSTA_RECURSO_GLOSA") falhar();
  if (linhas.length === 0 || linhas.length > RETORNO_XML_MAX_ITENS) falhar();

  const registroAns = textoObrigatorio(camposRecibo, "registroANS");
  // O parser confirma que o registro ANS está presente e no formato TISS. A
  // associação específica à CASSI é feita pelo backend a partir do convênio
  // já selecionado, sem acoplar este leitor a uma constante possivelmente
  // desatualizada da operadora.
  if (!/^\d{6}$/.test(registroAns)) falhar();
  // Embora nome e objeto não façam parte do DTO de persistência, são metadados
  // obrigatórios do recibo e não podem ser assumidos silenciosamente.
  textoObrigatorio(camposRecibo, "nomeOperadora");
  const objetoRecurso = textoObrigatorio(camposRecibo, "objetoRecurso");
  if (objetoRecurso !== "1" && objetoRecurso !== "2") falhar();

  const totalRecursadoCabecalho = valorOpcional(camposRecibo, "valorTotalRecursado");
  const totalAcatadoCabecalho = valorOpcional(camposRecibo, "valorTotalAcatado");
  const totalRecursadoItensCentavos = linhas.reduce((total, linha) => total + decimalNaoNegativo(linha.valorRecursado).centavos, 0n);
  const totalAcatadoItensCentavos = linhas.reduce((total, linha) => total + decimalNaoNegativo(linha.valorAcatado).centavos, 0n);
  const alertas: string[] = [];

  if (totalRecursadoCabecalho && totalRecursadoCabecalho.centavos !== totalRecursadoItensCentavos) {
    alertas.push("O total recursado do cabeçalho diverge da soma dos itens.");
  }
  if (totalAcatadoCabecalho && totalAcatadoCabecalho.centavos !== totalAcatadoItensCentavos) {
    alertas.push("O total acatado do cabeçalho diverge da soma dos itens.");
  }

  return {
    formato: RETORNO_FORMATO,
    versaoTiss: "4.01.00",
    registroAns,
    codigoPrestador: validarIdentificador(textoObrigatorio(camposRecibo, "codigoPrestador")),
    numeroLote: validarIdentificador(textoObrigatorio(camposRecibo, "numeroLote")),
    protocoloRecurso: validarIdentificador(textoObrigatorio(camposRecibo, "numeroProtocolo")),
    guiaRecursoPrestador: validarIdentificador(textoObrigatorio(camposRecibo, "numeroGuiaRecGlosaPrestador")),
    guiaRecursoOperadora: validarIdentificador(textoObrigatorio(camposRecibo, "numeroGuiaRecGlosaOperadora")),
    // dataRegistroTransacao é a data do documento de resposta; dataRecurso é
    // a data original do recurso e permanece armazenada sem ser reinterpretada.
    dataResposta: dataCivilObrigatoria(camposCabecalho, "dataRegistroTransacao"),
    dataRecurso: dataCivilObrigatoria(camposRecibo, "dataRecurso"),
    totalRecursadoCabecalho: totalRecursadoCabecalho?.canonico ?? null,
    totalAcatadoCabecalho: totalAcatadoCabecalho?.canonico ?? null,
    totalRecursadoItens: valorFormatado(totalRecursadoItensCentavos),
    totalAcatadoItens: valorFormatado(totalAcatadoItensCentavos),
    alertas,
    bloqueios: [],
    linhas,
  };
}
