import { TRPCError } from "@trpc/server";
import type { ScopeContaMedica, ContaContextoMedicoResultado } from "../shared/contaContextoMedico";
import type { criarServicoContaContextoMedicoParaUsuario } from "./contaContextoMedicoDrizzle";

type ServicoMedico = Pick<ReturnType<typeof criarServicoContaContextoMedicoParaUsuario>, "indexarAutomaticamente" | "consultar">;

/** Nenhuma fonte é inserida diretamente aqui: a correlação pertence ao serviço canônico. */
export async function indexarHonorariosFabricaCanonicos(servico: ServicoMedico, input: {
  arquivoMedicoId: number;
  xml: Buffer;
  scope: ScopeContaMedica;
}): Promise<ContaContextoMedicoResultado> {
  try {
    const result = await servico.indexarAutomaticamente({
      arquivo: {
        id: input.arquivoMedicoId,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: input.scope.estabelecimentoId,
        convenioId: input.scope.convenioId,
      },
      xml: input.xml,
      arquivoHospitalIdsPermitidos: [input.scope.arquivoHospitalId],
      escoposHospitalaresPermitidos: [input.scope],
    });
    if (result.semCorrespondencia || result.ambiguas || result.indexadas + result.jaIndexadas <= 0) throw new Error("correlation failed");
    const contexto = await servico.consultar({ scope: input.scope });
    if (contexto.configuracaoPendente || contexto.diagnosticoSnapshot
      || !contexto.fontes.some(fonte => fonte.arquivoId === input.arquivoMedicoId && fonte.registros > 0)) {
      throw new Error("source unavailable");
    }
    return contexto;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Não foi possível confirmar a correlação do XML de honorários com esta conta e versão hospitalar. Nenhuma importação foi confirmada; confira guia, hospital, convênio e datas dos XMLs.",
    });
  }
}
