import type { ScopeContaMedica } from "@shared/contaContextoMedico";

export type ItemXmlParaContextoMedico = {
  origem: string | null | undefined;
  arquivoId: number | null | undefined;
  convenioId: number | null | undefined;
  numeroLote: string | null | undefined;
  competencia: string | null | undefined;
};

export type ScopeContaContextoMedicoState =
  | { ready: true; scope: ScopeContaMedica }
  | { ready: false; reason: string };

function normalizarTextoCanonico(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function valoresCanonicos(items: ItemXmlParaContextoMedico[], field: "numeroLote" | "competencia") {
  return new Set(items.map(item => normalizarTextoCanonico(item[field])));
}

/**
 * Monta o escopo médico exclusivamente a partir dos itens XML já carregados.
 *
 * Lote e competência ausentes fazem parte da chave canônica como string vazia;
 * assim, uma mistura de valor informado e ausente é tratada como ambígua.
 */
export function montarScopeContaContextoMedico({
  estabelecimentoId,
  numeroConta,
  items,
}: {
  estabelecimentoId: number;
  numeroConta: string;
  items: ItemXmlParaContextoMedico[];
}): ScopeContaContextoMedicoState {
  const itensXml = items.filter(item => item.origem === "XML");

  if (itensXml.length === 0) {
    return {
      ready: false,
      reason: "O contexto médico está disponível apenas para uma conta proveniente de XML hospitalar.",
    };
  }

  const arquivoHospitalIds = new Set<number>();
  const convenioIds = new Set<number>();
  let arquivoHospitalAusente = false;
  let convenioAusente = false;

  for (const item of itensXml) {
    if (typeof item.arquivoId === "number" && Number.isFinite(item.arquivoId)) {
      arquivoHospitalIds.add(item.arquivoId);
    } else {
      arquivoHospitalAusente = true;
    }

    if (typeof item.convenioId === "number" && Number.isFinite(item.convenioId)) {
      convenioIds.add(item.convenioId);
    } else {
      convenioAusente = true;
    }
  }

  const numerosLote = valoresCanonicos(itensXml, "numeroLote");
  const competencias = valoresCanonicos(itensXml, "competencia");
  const problemas: string[] = [];

  if (arquivoHospitalAusente || arquivoHospitalIds.size !== 1) {
    problemas.push(
      arquivoHospitalIds.size > 1
        ? "há mais de um arquivo hospitalar nos itens XML"
        : "o arquivo hospitalar não está informado de forma única nos itens XML"
    );
  }

  if (convenioAusente || convenioIds.size !== 1) {
    problemas.push(
      convenioIds.size > 1
        ? "há mais de um convênio nos itens XML"
        : "o convênio não está informado de forma única nos itens XML"
    );
  }

  if (numerosLote.size !== 1) {
    problemas.push("há mais de um lote nos itens XML");
  }

  if (competencias.size !== 1) {
    problemas.push("há mais de uma competência nos itens XML");
  }

  if (problemas.length > 0) {
    return {
      ready: false,
      reason: `Não foi possível determinar um escopo canônico para o contexto médico: ${problemas.join("; ")}.`,
    };
  }

  const arquivoHospitalId = Array.from(arquivoHospitalIds)[0];
  const convenioId = Array.from(convenioIds)[0];
  const numeroLote = Array.from(numerosLote)[0];
  const competencia = Array.from(competencias)[0];

  if (
    arquivoHospitalId === undefined ||
    convenioId === undefined ||
    numeroLote === undefined ||
    competencia === undefined
  ) {
    return {
      ready: false,
      reason: "Os itens XML não possuem os identificadores necessários para o contexto médico.",
    };
  }

  return {
    ready: true,
    scope: {
      estabelecimentoId,
      convenioId,
      numeroConta,
      arquivoHospitalId,
      numeroLote,
      competencia,
    },
  };
}
