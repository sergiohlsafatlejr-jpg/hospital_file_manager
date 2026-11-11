import { hashKey } from "@tanstack/react-query";
import type {
  BiClientConfig,
  BiCriterioPeriodoXml,
  BiDimensaoSetor,
  BiSubFonteBanco,
} from "@shared/biPersonalizadoConfig";

export interface BiExecutivoInput {
  estabelecimentoId: number;
  modoFonte: "XML" | "BANCO_CSV";
  setores?: string[];
  competencias?: string[];
  convenios?: string[];
  criterioPeriodoXml?: BiCriterioPeriodoXml;
  subFonteBanco?: BiSubFonteBanco;
  dimensaoSetor?: BiDimensaoSetor;
}

interface RespostaComEscopoBi {
  estabelecimento: { id: number };
  configCliente: BiClientConfig;
  fonteAtiva: {
    modoFonte: BiExecutivoInput["modoFonte"];
    subFonteResolvida: "XML_OFICIAL" | "WARLEINE" | "RECEBIMENTO_GERAL";
    criterioPeriodoXml: BiCriterioPeriodoXml;
    dimensaoSetorAtiva: BiDimensaoSetor;
  };
}

/** O select da consulta vincula também os filtros, não ecoados pelo contrato atual. */
export function vincularRespostaBi<T extends RespostaComEscopoBi>(
  input: BiExecutivoInput,
  resposta: T
) {
  return { escopo: hashKey([input]), resposta };
}

/** Nenhuma identidade/configuração/exportação consome dados fora desta guarda. */
export function obterRespostaBiAtual<T extends RespostaComEscopoBi>(
  input: BiExecutivoInput,
  vinculada: ReturnType<typeof vincularRespostaBi<T>> | undefined,
  estado: { isPlaceholderData: boolean; isError: boolean }
): T | undefined {
  if (
    input.estabelecimentoId <= 0 ||
    estado.isPlaceholderData ||
    estado.isError ||
    !vinculada ||
    vinculada.escopo !== hashKey([input])
  )
    return undefined;

  const { resposta } = vinculada;
  const { fonteAtiva: fonte, configCliente: config } = resposta;
  if (
    resposta.estabelecimento.id !== input.estabelecimentoId ||
    fonte.modoFonte !== input.modoFonte ||
    fonte.dimensaoSetorAtiva !==
      (input.dimensaoSetor ?? config.dimensaoPainelSetores)
  )
    return undefined;

  if (input.modoFonte === "XML") {
    if (
      fonte.subFonteResolvida !== "XML_OFICIAL" ||
      fonte.criterioPeriodoXml !==
        (input.criterioPeriodoXml ?? config.criterioPeriodoXmlPadrao)
    )
      return undefined;
  } else {
    const preferencia = input.subFonteBanco ?? config.subFonteBancoPadrao;
    if (
      fonte.subFonteResolvida === "XML_OFICIAL" ||
      (preferencia !== "AUTO" && fonte.subFonteResolvida !== preferencia)
    )
      return undefined;
  }
  return resposta;
}
