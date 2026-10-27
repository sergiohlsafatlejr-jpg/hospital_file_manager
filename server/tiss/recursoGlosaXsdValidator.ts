import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { validateXML } from "xmllint-wasm";

export const TISS_RECURSO_GLOSA_SCHEMA_VERSION = "3.02.00";
export const TAMANHO_MAXIMO_XML_RECURSO_GLOSA = 1024 * 1024;
export const PROFUNDIDADE_MAXIMA_XML_RECURSO_GLOSA = 64;

export type TipoErroXsdRecursoGlosa =
  | "schema"
  | "seguranca"
  | "tamanho"
  | "estrutura";

export interface ErroXsdRecursoGlosa {
  campo: "xml" | "schema";
  mensagem: string;
  tipo: TipoErroXsdRecursoGlosa;
}

export interface ResultadoValidacaoXsdRecursoGlosa {
  valido: boolean;
  erros: ErroXsdRecursoGlosa[];
}

interface ManifestoSchema {
  entrypoint: string;
  files: Record<string, string>;
}

interface SchemaCarregado {
  principal: {
    fileName: string;
    contents: Uint8Array;
  };
  dependencias: Array<{
    fileName: string;
    contents: Uint8Array;
  }>;
}

const DIRETORIO_SCHEMAS_FONTE = new URL("./schemas/3.02.00/", import.meta.url);
const DIRETORIO_SCHEMAS_BUNDLE = new URL("./tiss/schemas/3.02.00/", import.meta.url);
const DIRETORIO_SCHEMAS = existsSync(DIRETORIO_SCHEMAS_FONTE)
  ? DIRETORIO_SCHEMAS_FONTE
  : DIRETORIO_SCHEMAS_BUNDLE;
const ARQUIVO_MANIFESTO = new URL("manifest.json", DIRETORIO_SCHEMAS);
const MAXIMO_ERROS_SCHEMA = 5;

let schemasCarregados: Promise<SchemaCarregado> | undefined;

function erro(
  tipo: TipoErroXsdRecursoGlosa,
  mensagem: string,
  campo: "xml" | "schema" = "xml",
): ResultadoValidacaoXsdRecursoGlosa {
  return {
    valido: false,
    erros: [{ campo, mensagem, tipo }],
  };
}

/**
 * Recusa declarações DTD/ENTITY antes que qualquer parser seja acionado.
 * A aplicação não aceita DTDs em XMLs de recurso do Portal.
 */
function contemDtdOuEntidade(xml: string): boolean {
  return /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml);
}

/**
 * Conta somente elementos de abertura XML. A leitura é propositalmente simples
 * e não resolve entidades, DTDs ou recursos externos.
 */
function excedeProfundidadeMaxima(xml: string): boolean {
  let cursor = 0;
  let profundidade = 0;

  while (cursor < xml.length) {
    const inicio = xml.indexOf("<", cursor);
    if (inicio < 0) return false;

    if (xml.startsWith("<!--", inicio)) {
      const fimComentario = xml.indexOf("-->", inicio + 4);
      if (fimComentario < 0) return false;
      cursor = fimComentario + 3;
      continue;
    }

    if (xml.startsWith("<![CDATA[", inicio)) {
      const fimCdata = xml.indexOf("]]>", inicio + 9);
      if (fimCdata < 0) return false;
      cursor = fimCdata + 3;
      continue;
    }

    if (xml.startsWith("<?", inicio)) {
      const fimInstrucao = xml.indexOf("?>", inicio + 2);
      if (fimInstrucao < 0) return false;
      cursor = fimInstrucao + 2;
      continue;
    }

    let aspas: "\"" | "'" | undefined;
    let fimTag = -1;
    for (let indice = inicio + 1; indice < xml.length; indice += 1) {
      const caractere = xml[indice];
      if (aspas) {
        if (caractere === aspas) aspas = undefined;
      } else if (caractere === "\"" || caractere === "'") {
        aspas = caractere;
      } else if (caractere === ">") {
        fimTag = indice;
        break;
      }
    }

    if (fimTag < 0) return false;

    const conteudoTag = xml.slice(inicio + 1, fimTag).trim();
    if (conteudoTag.startsWith("/")) {
      profundidade = Math.max(0, profundidade - 1);
    } else if (!conteudoTag.startsWith("!") && !conteudoTag.endsWith("/")) {
      profundidade += 1;
      if (profundidade > PROFUNDIDADE_MAXIMA_XML_RECURSO_GLOSA) {
        return true;
      }
    }

    cursor = fimTag + 1;
  }

  return false;
}

function validarLimitesESeguranca(xml: string): ResultadoValidacaoXsdRecursoGlosa | undefined {
  if (Buffer.byteLength(xml, "utf8") > TAMANHO_MAXIMO_XML_RECURSO_GLOSA) {
    return erro(
      "tamanho",
      "O XML excede o tamanho máximo permitido para validação.",
    );
  }

  if (contemDtdOuEntidade(xml)) {
    return erro(
      "seguranca",
      "DTD e entidades XML externas não são aceitas.",
    );
  }

  if (excedeProfundidadeMaxima(xml)) {
    return erro(
      "tamanho",
      "O XML excede a profundidade máxima permitida.",
    );
  }

  return undefined;
}

async function carregarSchemas(): Promise<SchemaCarregado> {
  const manifesto = JSON.parse(
    await readFile(ARQUIVO_MANIFESTO, "utf8"),
  ) as ManifestoSchema;

  const nomesArquivos = Object.keys(manifesto.files);
  if (!manifesto.entrypoint || !manifesto.files[manifesto.entrypoint]) {
    throw new Error("Manifesto de schemas TISS inválido.");
  }

  const arquivos = await Promise.all(
    nomesArquivos.map(async (fileName) => {
      const caminho = new URL(fileName, DIRETORIO_SCHEMAS);
      const contents = await readFile(caminho);
      const checksum = createHash("sha256").update(contents).digest("hex");
      if (checksum !== manifesto.files[fileName]) {
        throw new Error("A integridade dos schemas TISS não pôde ser confirmada.");
      }
      return { fileName, contents };
    }),
  );

  const principal = arquivos.find((arquivo) => arquivo.fileName === manifesto.entrypoint);
  if (!principal) {
    throw new Error("Schema principal TISS não localizado.");
  }

  return {
    principal,
    dependencias: arquivos.filter((arquivo) => arquivo.fileName !== manifesto.entrypoint),
  };
}

async function obterSchemas(): Promise<SchemaCarregado> {
  schemasCarregados ??= carregarSchemas();
  try {
    return await schemasCarregados;
  } catch (error) {
    schemasCarregados = undefined;
    throw error;
  }
}

/**
 * Valida exclusivamente a saída XML de recurso de glosa do Portal contra o
 * schema oficial ANS/TISS 3.02.00 versionado no repositório.
 *
 * O xmllint compilado para WASM recebe todos os XSDs por preload e é executado
 * com --nonet. Assim, a validação não carrega schemas, entidades ou recursos
 * remotos a partir do XML submetido.
 */
export async function validarXmlRecursoGlosaContraXsd(
  xml: string,
): Promise<ResultadoValidacaoXsdRecursoGlosa> {
  const limiteOuSeguranca = validarLimitesESeguranca(xml);
  if (limiteOuSeguranca) return limiteOuSeguranca;

  try {
    const schemas = await obterSchemas();
    const resultado = await validateXML({
      xml: [{ fileName: "recurso-glosa.xml", contents: xml }],
      schema: [schemas.principal],
      preload: schemas.dependencias,
      initialMemoryPages: 256,
      maxMemoryPages: 256,
      modifyArguments: (argumentos) => [...argumentos, "--nonet"],
    });

    if (resultado.valid) {
      return { valido: true, erros: [] };
    }

    const quantidadeErros = Math.max(
      1,
      Math.min(resultado.errors.length, MAXIMO_ERROS_SCHEMA),
    );
    return {
      valido: false,
      erros: Array.from({ length: quantidadeErros }, () => ({
        campo: "schema",
        tipo: "schema" as const,
        mensagem: `O XML não atende ao schema oficial ANS/TISS ${TISS_RECURSO_GLOSA_SCHEMA_VERSION}.`,
      })),
    };
  } catch {
    return erro(
      "estrutura",
      "Não foi possível validar o XML com o schema oficial ANS/TISS.",
      "schema",
    );
  }
}
