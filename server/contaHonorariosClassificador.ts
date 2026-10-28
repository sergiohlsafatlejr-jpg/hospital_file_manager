import { StringDecoder } from "node:string_decoder";
import sax from "sax";

/**
 * O classificador só decide se o documento pode entrar no fluxo informativo.
 * Não extrai nem registra conteúdo clínico, financeiro ou identificadores.
 */
export const CONTA_HONORARIOS_CLASSIFICADOR_CHUNK_BYTES = 64 * 1024;

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
 * - XML sem guia de honorários continua no fluxo financeiro normal, inclusive
 *   quando possui uma guia hospitalar sob `guiasTISS`;
 * - somente `guiaHonorarios`, sem guia hospitalar, pode ser indexado como
 *   contexto médico informativo;
 * - a coexistência de guia hospitalar e de honorários no mesmo documento,
 *   DTD/ENTITY ou XML inválido bloqueia toda escrita financeira.
 *
 * O documento é lido em blocos para não transformar o tamanho total de um XML
 * hospitalar comum em motivo de bloqueio. A função não retorna detalhes da
 * estrutura de entrada, evitando que conteúdo seja levado a DTOs ou logs.
 */
export function classificarXmlHonorarios(
  xml: Buffer
): ClassificacaoXmlHonorarios {
  if (!Buffer.isBuffer(xml) || xml.length === 0) {
    return { tipo: "misto_ou_ambiguo" };
  }

  let encontrouHonorarios = false;
  let encontrouGuiaHospitalar = false;
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
        invalido = true;
        return;
      }
      encontrouHonorarios = true;
      return;
    }

    // Guias hospitalares são válidas no mesmo nível de `guiaHonorarios`.
    // Só existe ambiguidade quando elas coexistem no mesmo XML com honorários.
    if (pai === "guiasTISS" && local.startsWith("guia")) {
      encontrouGuiaHospitalar = true;
    }
  };
  parser.onclosetag = () => {
    if (!pilha.pop()) invalido = true;
  };

  try {
    const decoder = new StringDecoder("utf8");
    for (
      let inicio = 0;
      inicio < xml.length;
      inicio += CONTA_HONORARIOS_CLASSIFICADOR_CHUNK_BYTES
    ) {
      if (invalido) break;
      parser.write(
        decoder.write(
          xml.subarray(
            inicio,
            Math.min(
              inicio + CONTA_HONORARIOS_CLASSIFICADOR_CHUNK_BYTES,
              xml.length
            )
          )
        )
      );
    }
    if (!invalido) parser.write(decoder.end()).close();
  } catch {
    invalido = true;
  }

  if (invalido || (encontrouHonorarios && encontrouGuiaHospitalar)) {
    return { tipo: "misto_ou_ambiguo" };
  }
  if (!encontrouHonorarios) return { tipo: "nao_honorarios" };
  return { tipo: "honorarios_puro" };
}
