import { classificarXmlHonorarios } from "./contaHonorariosClassificador";
import {
  type ArquivoMedicoAutomatico,
  type ContaContextoMedicoService,
} from "./contaContextoMedicoService";
import { criarServicoContaContextoMedicoParaUsuario } from "./contaContextoMedicoDrizzle";

export class ErroImportacaoXmlMedico extends Error {
  constructor() {
    super(
      "O XML enviado não pôde ser classificado com segurança para processamento."
    );
    this.name = "ErroImportacaoXmlMedico";
  }
}

export type ResultadoRoteamentoEnvioXml =
  | { destino: "financeiro" }
  | {
      destino: "contexto_informativo";
      indexadas: number;
      jaIndexadas: number;
      semCorrespondencia: number;
      ambiguas: number;
    };

export type DependenciasRoteamentoEnvioXml = {
  criarServico?: () => Pick<
    ContaContextoMedicoService,
    "indexarAutomaticamente"
  >;
};

export type OpcoesRoteamentoEnvioXml = {
  /** Allowlist interna do lote, não aceita do navegador nem exposta em resposta. */
  arquivoHospitalIdsPermitidos?: readonly number[];
  loteImportacaoId?: number;
  /** Fencing interno do worker; nunca vem de payload/DTO. */
  loteClaim?: { id: number; claimToken: string };
};

/**
 * Fronteira única antes do fluxo financeiro de um XML de envio.
 *
 * O classificador é fechado: honorários puros seguem apenas para a fonte
 * informativa já persistida; documento misto/ambíguo falha antes de qualquer
 * delete/insert financeiro; os demais XMLs mantêm o fluxo financeiro legado.
 * Nenhum detalhe de XML, storage, carteira ou valores é retornado ou registrado.
 */
export async function rotearEnvioXmlParaContextoMedico(
  arquivo: ArquivoMedicoAutomatico,
  xml: Buffer,
  deps: DependenciasRoteamentoEnvioXml = {},
  opcoes: OpcoesRoteamentoEnvioXml = {}
): Promise<ResultadoRoteamentoEnvioXml> {
  const classificacao = classificarXmlHonorarios(xml);
  if (classificacao.tipo === "nao_honorarios") return { destino: "financeiro" };
  if (classificacao.tipo === "misto_ou_ambiguo")
    throw new ErroImportacaoXmlMedico();

  const service =
    deps.criarServico?.() ?? criarServicoContaContextoMedicoParaUsuario(0);
  try {
    const resultado = await service.indexarAutomaticamente({
      arquivo,
      xml,
      arquivoHospitalIdsPermitidos: opcoes.arquivoHospitalIdsPermitidos,
      loteImportacaoId: opcoes.loteImportacaoId,
      loteClaim: opcoes.loteClaim,
    });
    return {
      destino: "contexto_informativo",
      indexadas: resultado.indexadas,
      jaIndexadas: resultado.jaIndexadas,
      semCorrespondencia: resultado.semCorrespondencia,
      ambiguas: resultado.ambiguas,
    };
  } catch (error) {
    // A operação automática não deve abrir fallback financeiro quando o contexto
    // não estiver configurado ou quando a correlação canônica não for forte.
    throw new ErroImportacaoXmlMedico();
  }
}
