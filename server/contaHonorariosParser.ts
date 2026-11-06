import sax from "sax";
import type { ProcedimentoMedicoInfo, ProfissionalMedicoInfo } from "../shared/contaContextoMedico";

/** Limites deliberadamente conservadores para o índice informativo. */
export const CONTA_HONORARIOS_XML_MAX_BYTES = 2 * 1024 * 1024;
export const CONTA_HONORARIOS_XML_MAX_DEPTH = 64;
export const CONTA_HONORARIOS_MAX_GUIAS = 200;
export const CONTA_HONORARIOS_MAX_PROCEDIMENTOS_POR_GUIA = 1_000;

interface CorrelacaoGuiaHonorarios {
  numeroGuiaPrestador: string | null;
  numeroGuiaOperadora: string | null;
  guiaSolicitacaoInternacao: string | null;
  numeroCarteira: string | null;
  dataAtendimento: string | null;
  dataEmissaoGuia: string | null;
  codigoPrestador: string | null;
}

/**
 * Estrutura exclusiva do servidor. `correlacao` é necessária à validação de
 * vínculo entre XMLs, mas nunca deve ser serializada como DTO público.
 */
export interface GuiaHonorariosParseada {
  procedimentos: ProcedimentoMedicoInfo[];
  correlacao: CorrelacaoGuiaHonorarios;
}

export interface ParseContaHonorariosResultado {
  guias: GuiaHonorariosParseada[];
  recognized: boolean;
}

type NoAberto = {
  local: string;
  texto: string;
};

type ProcedimentoEmLeitura = {
  codigo: string | null;
  descricao: string | null;
  dataExecucao: string | null;
  sequencial: string | null;
  profissionais: ProfissionalMedicoInfo[];
};

type ProfissionalEmLeitura = {
  nome: string | null;
  conselho: string | null;
  numeroConselho: string | null;
};

const CAMPOS_CORRELACAO: Record<string, keyof CorrelacaoGuiaHonorarios> = {
  numeroGuiaPrestador: "numeroGuiaPrestador",
  numeroGuiaOperadora: "numeroGuiaOperadora",
  guiaSolicitacaoInternacao: "guiaSolicitacaoInternacao",
  guiaSolicInternacao: "guiaSolicitacaoInternacao",
  numeroGuiaSolicitacaoInternacao: "guiaSolicitacaoInternacao",
  numeroCarteira: "numeroCarteira",
  dataAtendimento: "dataAtendimento",
  dataInicioFaturamento: "dataAtendimento",
  dataEmissaoGuia: "dataEmissaoGuia",
};

const CAMPOS_PRESTADOR = new Set([
  "codigoPrestadorNaOperadora",
  "codigoPrestador",
  "CNES",
  "cnpjContratado",
]);
const CAMPOS_CODIGO_PROCEDIMENTO = new Set([
  "codigoProcedimento",
  "codigo",
]);
const CAMPOS_DESCRICAO_PROCEDIMENTO = new Set([
  "descricaoProcedimento",
  "descricao",
]);
const CAMPOS_DATA_PROCEDIMENTO = new Set([
  "dataExecucao",
  "dataRealizacao",
  "dataAtendimento",
]);
const CAMPOS_SEQUENCIAL_PROCEDIMENTO = new Set([
  "sequencialItem",
  "sequencial",
  "sequencialProcedimento",
]);
const CAMPOS_NOME_PROFISSIONAL = new Set([
  "nomeProfissional",
  "nomeProfissionalExecutante",
  "nomeProf",
  "nomeContratado",
  "nome",
]);
const CAMPOS_CONSELHO_PROFISSIONAL = new Set([
  "conselhoProfissional",
  "siglaConselho",
  "conselho",
]);
const CAMPOS_NUMERO_CONSELHO_PROFISSIONAL = new Set([
  "numeroConselhoProfissional",
  "numeroConselho",
  "numeroRegistro",
]);
const TAGS_PROFISSIONAL = new Set([
  "profissionalExecutante",
  "dadosProfissional",
  "profissionais",
  "identificacaoEquipe",
  "equipeSadt",
]);

function textoSeguro(valor: string): string | null {
  const normalizado = valor.replace(/\s+/g, " ").trim();
  return normalizado.length > 0 ? normalizado.slice(0, 500) : null;
}

function vazioCorrelacao(): CorrelacaoGuiaHonorarios {
  return {
    numeroGuiaPrestador: null,
    numeroGuiaOperadora: null,
    guiaSolicitacaoInternacao: null,
    numeroCarteira: null,
    dataAtendimento: null,
    dataEmissaoGuia: null,
    codigoPrestador: null,
  };
}

function nomeLocal(nome: string): string {
  const partes = nome.split(":");
  return partes[partes.length - 1] || nome;
}

function noTemAncestral(pilha: NoAberto[], nome: string): boolean {
  return pilha.some(no => no.local === nome);
}

function adicionarProfissional(
  procedimento: ProcedimentoEmLeitura | null,
  profissional: ProfissionalEmLeitura | null
): void {
  if (!procedimento || !profissional) return;
  const nome = profissional.nome || "Não informado";
  const valor: ProfissionalMedicoInfo = {
    nome,
    conselho: profissional.conselho,
    numeroConselho: profissional.numeroConselho,
  };
  const repetido = procedimento.profissionais.some(existente =>
    existente.nome === valor.nome &&
    existente.conselho === valor.conselho &&
    existente.numeroConselho === valor.numeroConselho
  );
  if (!repetido) procedimento.profissionais.push(valor);
}

function finalizarProcedimento(
  guia: GuiaHonorariosParseada | null,
  procedimento: ProcedimentoEmLeitura | null
): void {
  if (!guia || !procedimento || !procedimento.codigo) return;
  if (guia.procedimentos.length >= CONTA_HONORARIOS_MAX_PROCEDIMENTOS_POR_GUIA) {
    throw new Error("XML de honorários excede o limite de procedimentos por guia");
  }
  guia.procedimentos.push({
    codigo: procedimento.codigo,
    descricao: procedimento.descricao || "Não informada",
    dataExecucao: procedimento.dataExecucao,
    profissionais: procedimento.profissionais,
    sequencial: procedimento.sequencial,
  });
}

/**
 * Lê somente `guiaHonorarios` da mensagem TISS. Nenhum campo de valor ou
 * quantidade é interpretado: diversos profissionais no mesmo registro nunca
 * multiplicam procedimento ou quantidade médica.
 *
 * A função é síncrona, sem banco, ambiente, rede ou efeitos colaterais. XML
 * inválido, DTD/ENTITY ou excedente de limite é rejeitado para que o chamador
 * bloqueie a indexação em vez de indexar informação incompleta.
 */
export function parseContaHonorarios(xml: string | Buffer): ParseContaHonorariosResultado {
  const buffer = typeof xml === "string" ? Buffer.from(xml, "utf8") : xml;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("XML de honorários vazio");
  }
  if (buffer.length > CONTA_HONORARIOS_XML_MAX_BYTES) {
    throw new Error("XML de honorários excede o tamanho máximo");
  }

  const texto = buffer.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) {
    throw new Error("DTD e entidades não são permitidos no XML de honorários");
  }

  const guias: GuiaHonorariosParseada[] = [];
  const pilha: NoAberto[] = [];
  let guiaAtual: GuiaHonorariosParseada | null = null;
  let procedimentoAtual: ProcedimentoEmLeitura | null = null;
  let profissionalAtual: ProfissionalEmLeitura | null = null;
  let reconheceuGuia = false;
  let falha: Error | null = null;

  const parser = sax.parser(true, { trim: false, normalize: false, xmlns: true, position: true });
  parser.ENTITIES = Object.create(null) as Record<string, string>;
  parser.ondoctype = () => { falha = new Error("DTD não é permitido no XML de honorários"); };
  parser.onsgmldeclaration = () => { falha = new Error("Declaração SGML não permitida no XML de honorários"); };
  parser.onprocessinginstruction = instrucao => {
    if (instrucao.name.toLowerCase() !== "xml") {
      falha = new Error("Instrução de processamento não permitida no XML de honorários");
    }
  };
  parser.onerror = () => { falha = new Error("XML de honorários inválido"); };

  parser.onopentag = tag => {
    if (falha) return;
    const local = (tag as sax.QualifiedTag).local || nomeLocal(tag.name);
    pilha.push({ local, texto: "" });
    if (pilha.length > CONTA_HONORARIOS_XML_MAX_DEPTH) {
      falha = new Error("XML de honorários excede a profundidade máxima");
      return;
    }

    if (local === "guiaHonorarios") {
      reconheceuGuia = true;
      if (guias.length >= CONTA_HONORARIOS_MAX_GUIAS) {
        falha = new Error("XML de honorários excede o limite de guias");
        return;
      }
      guiaAtual = { procedimentos: [], correlacao: vazioCorrelacao() };
      guias.push(guiaAtual);
    }
    if (!guiaAtual) return;

    if (local === "procedimentoRealizado" && noTemAncestral(pilha, "procedimentosRealizados")) {
      procedimentoAtual = {
        codigo: null,
        descricao: null,
        dataExecucao: null,
        sequencial: null,
        profissionais: [],
      };
    }
    if (procedimentoAtual && TAGS_PROFISSIONAL.has(local)) {
      profissionalAtual = { nome: null, conselho: null, numeroConselho: null };
    }
  };

  const receberTexto = (trecho: string) => {
    const ultimo = pilha[pilha.length - 1];
    if (ultimo) ultimo.texto += trecho;
  };
  parser.ontext = receberTexto;
  parser.oncdata = receberTexto;

  parser.onclosetag = nome => {
    if (falha) return;
    const no = pilha.pop();
    if (!no) {
      falha = new Error("XML de honorários inválido");
      return;
    }
    const local = typeof nome === "string" ? nomeLocal(nome) : no.local;
    if (local !== no.local) {
      falha = new Error("XML de honorários inválido");
      return;
    }
    const valor = textoSeguro(no.texto);
    if (guiaAtual && valor) {
      const campoCorrelacao = CAMPOS_CORRELACAO[local];
      if (campoCorrelacao && !procedimentoAtual) guiaAtual.correlacao[campoCorrelacao] = valor;
      if (CAMPOS_PRESTADOR.has(local) && !procedimentoAtual && noTemAncestral([...pilha, no], "dadosPrestador")) {
        guiaAtual.correlacao.codigoPrestador = valor;
      }
    }

    if (procedimentoAtual && valor) {
      if (CAMPOS_CODIGO_PROCEDIMENTO.has(local)) {
        procedimentoAtual.codigo ||= valor;
      } else if (CAMPOS_DESCRICAO_PROCEDIMENTO.has(local)) {
        procedimentoAtual.descricao ||= valor;
      } else if (CAMPOS_DATA_PROCEDIMENTO.has(local)) {
        procedimentoAtual.dataExecucao ||= valor;
      } else if (CAMPOS_SEQUENCIAL_PROCEDIMENTO.has(local)) {
        procedimentoAtual.sequencial ||= valor;
      }

      if (profissionalAtual) {
        if (CAMPOS_NOME_PROFISSIONAL.has(local)) profissionalAtual.nome ||= valor;
        else if (CAMPOS_CONSELHO_PROFISSIONAL.has(local)) profissionalAtual.conselho ||= valor;
        else if (CAMPOS_NUMERO_CONSELHO_PROFISSIONAL.has(local)) profissionalAtual.numeroConselho ||= valor;
      }
    }

    if (TAGS_PROFISSIONAL.has(local) && profissionalAtual) {
      if (
        local !== "profissionais" ||
        profissionalAtual.nome ||
        profissionalAtual.conselho ||
        profissionalAtual.numeroConselho
      ) {
        adicionarProfissional(procedimentoAtual, profissionalAtual);
      }
      profissionalAtual = null;
    }
    if (local === "procedimentoRealizado") {
      finalizarProcedimento(guiaAtual, procedimentoAtual);
      procedimentoAtual = null;
      profissionalAtual = null;
    }
    if (local === "guiaHonorarios") {
      guiaAtual = null;
      procedimentoAtual = null;
      profissionalAtual = null;
    }
  };

  try {
    parser.write(texto).close();
  } catch {
    throw falha || new Error("XML de honorários inválido");
  }
  if (falha) throw falha;
  return { guias, recognized: reconheceuGuia };
}
