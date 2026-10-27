import {
  type ValidacaoErro,
  type ValidacaoResultado,
  validarXmlRecursoGlosa,
} from "../validadorTissRecursoGlosa";
import {
  TISS_RECURSO_GLOSA_SCHEMA_VERSION,
  validarXmlRecursoGlosaContraXsd,
} from "./recursoGlosaXsdValidator";

export interface ResultadoValidacaoRecursoGlosaPortal extends ValidacaoResultado {
  schema: {
    versao: string;
    valido: boolean;
  };
}

/**
 * Valida a saída XML de recurso de glosa produzida pelo Portal.
 *
 * A validação XSD ANS/TISS 3.02.00 é obrigatória. As regras TISS existentes continuam
 * como uma camada complementar para checagens de negócio e compatibilidade.
 */
export async function validarXmlRecursoGlosaDoPortal(
  xml: string,
): Promise<ResultadoValidacaoRecursoGlosaPortal> {
  const validacaoXsd = await validarXmlRecursoGlosaContraXsd(xml);

  // DTD/XXE, tamanho e profundidade são barrados antes do parser de regras.
  if (
    validacaoXsd.erros.some(
      (item) => item.tipo === "seguranca" || item.tipo === "tamanho",
    )
  ) {
    return {
      valido: false,
      erros: validacaoXsd.erros,
      avisos: [],
      schema: {
        versao: TISS_RECURSO_GLOSA_SCHEMA_VERSION,
        valido: false,
      },
    };
  }

  const validacaoRegras = validarXmlRecursoGlosa(xml);
  const errosXsd: ValidacaoErro[] = validacaoXsd.erros.map((item) => ({
    campo: item.campo,
    mensagem: item.mensagem,
    tipo: item.tipo,
  }));

  return {
    valido: validacaoXsd.valido && validacaoRegras.valido,
    erros: [...errosXsd, ...validacaoRegras.erros],
    avisos: validacaoRegras.avisos,
    schema: {
      versao: TISS_RECURSO_GLOSA_SCHEMA_VERSION,
      valido: validacaoXsd.valido,
    },
  };
}
