import sax from "sax";

/**
 * O classificador só decide se o documento pode entrar no fluxo informativo.
 * Não extrai nem registra conteúdo clínico, financeiro ou identificadores.
 */
export const CONTA_HONORARIOS_CLASSIFICADOR_MAX_BYTES = 2 * 1024 * 1024;

export type ClassificacaoXmlHonorarios =
  | { tipo: "honorarios_puro" }
  | { tipo: "nao_honorarios" }
  | { tipo: "misto_ou_ambiguo" };

function nomeLocal(nome: string): string {
  const partes = nome.split(":");
  return partes[partes.length - 1] || nome;
}

/**
 * Classificação deliberadamente conservadora para o upload automático:
 *
 * - XML sem guia de honorários continua no fluxo normal de envio;
 * - somente `guiaHonorarios`, sem outra guia de faturamento, pode ser indexado;
 * - DTD/ENTITY, XML inválido, tamanho excessivo ou estrutura de guia desconhecida
 *   tornam o arquivo ambíguo e bloqueiam toda escrita financeira.
 *
 * A função não retorna detalhes da estrutura de entrada, evitando que conteúdo do
 * XML seja levado a DTOs ou logs.
 */
export function classificarXmlHonorarios(
  xml: Buffer
): ClassificacaoXmlHonorarios {
  if (
    !Buffer.isBuffer(xml) ||
    xml.length === 0 ||
    xml.length > CONTA_HONORARIOS_CLASSIFICADOR_MAX_BYTES
  ) {
    return { tipo: "misto_ou_ambiguo" };
  }

  const texto = xml.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) return { tipo: "misto_ou_ambiguo" };

  let encontrouHonorarios = false;
  let encontrouOutraGuia = false;
  let invalido = false;
  const pilha: string[] = [];
  const parser = sax.parser(true, {
    trim: false,
    normalize: false,
    xmlns: true,
  });
  parser.ENTITIES = Object.create(null) as Record<string, string>;
  parser.ondoctype = () => {
    invalido = true;
  };
  parser.onsgmldeclaration = () => {
    invalido = true;
  };
  parser.onprocessinginstruction = instrucao => {
    if (instrucao.name.toLowerCase() !== "xml") invalido = true;
  };
  parser.onerror = () => {
    invalido = true;
  };

  parser.onopentag = tag => {
    if (invalido) return;
    const local = (tag as sax.QualifiedTag).local || nomeLocal(tag.name);
    const pai = pilha[pilha.length - 1] || "";
    pilha.push(local);

    if (local === "guiaHonorarios") {
      if (pai !== "guiasTISS") {
        encontrouOutraGuia = true;
        return;
      }
      encontrouHonorarios = true;
      return;
    }

    // Guias TISS são irmãs em `guiasTISS`. Qualquer irmã desconhecida é
    // considerada ambígua em vez de se arriscar a tratá-la como honorários.
    if (pai === "guiasTISS" && local.startsWith("guia")) {
      encontrouOutraGuia = true;
      return;
    }
  };
  parser.onclosetag = () => {
    if (!pilha.pop()) invalido = true;
  };

  try {
    parser.write(texto).close();
  } catch {
    invalido = true;
  }

  if (invalido || encontrouOutraGuia) return { tipo: "misto_ou_ambiguo" };
  if (!encontrouHonorarios) return { tipo: "nao_honorarios" };
  return { tipo: "honorarios_puro" };
}
