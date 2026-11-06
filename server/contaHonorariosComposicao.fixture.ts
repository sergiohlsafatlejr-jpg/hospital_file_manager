import {
  criarContaContextoMedicoService,
  type FonteMedicaPersistida,
  type SnapshotHospitalarAutorizado,
  type ContaContextoMedicoRepositorio,
  type ContextoMedicoPersistido,
  type ContextoMedicoTransacao,
} from "./contaContextoMedicoService";
import { criarContaContextoMedicoRepositorioDrizzle } from "./contaContextoMedicoDrizzle";
import type {
  GuiaHonorariosParseada,
  ParseContaHonorariosResultado,
} from "./contaHonorariosParser";
import type { ProcedimentoMedicoInfo } from "../shared/contaContextoMedico";

// Todos os dados são inventados. getDb, XML reader e persistência são mocks em memória.
export const scopeHonorarios = {
  estabelecimentoId: 901,
  convenioId: 902,
  arquivoHospitalId: 903,
  numeroConta: "GP-FICTICIA",
  numeroLote: "LOTE-FICTICIO",
  competencia: "2026/10",
};
export const profissionalHonorarios = (nome: string) => ({
  nome,
  conselho: "CRM",
  numeroConselho: "FICTICIO",
});
export const procedimentoHonorarios = (
  codigo = "PROC-FICTICIO",
  profissionais: ProcedimentoMedicoInfo["profissionais"] = [],
  sequencial: string | null = "1"
): ProcedimentoMedicoInfo => ({
  codigo,
  descricao: "Procedimento ficticio",
  dataExecucao: "2026-10-27",
  sequencial,
  profissionais,
});
export const referenciaHonorarios = (
  numeroGuiaOperadora = "GO-A",
  beneficiario = "BEN-A",
  data = "2026-10-27"
) => ({
  numeroGuiaPrestador: scopeHonorarios.numeroConta,
  numeroGuiaOperadora,
  beneficiario,
  datasExecucao: [data],
});
export const guiaHonorarios = (
  codigo = "PROC-FICTICIO",
  beneficiario = "BEN-A",
  numeroGuiaOperadora = "GO-A",
  data = "2026-10-27"
): GuiaHonorariosParseada => ({
  correlacao: {
    numeroGuiaPrestador: scopeHonorarios.numeroConta,
    numeroGuiaOperadora,
    guiaSolicitacaoInternacao: null,
    numeroCarteira: beneficiario,
    dataAtendimento: data,
    dataEmissaoGuia: null,
    codigoPrestador: null,
  },
  procedimentos: [{ ...procedimentoHonorarios(codigo), dataExecucao: data }],
});
export const hospitalHonorarios = (
  refs = [referenciaHonorarios()]
): SnapshotHospitalarAutorizado => ({
  scope: scopeHonorarios,
  referenciasGuias: refs,
  itensHospitalares: [],
  setorInformado: false,
});
export function linhaHonorarios(
  id: number,
  procedimentos: readonly ProcedimentoMedicoInfo[],
  loteImportacaoId: number | null = null,
  snap = "SNAP-FICTICIO"
) {
  return {
    ...scopeHonorarios,
    id,
    arquivoMedicoId: 906,
    loteImportacaoId,
    guiaReferencia: scopeHonorarios.numeroConta,
    versaoSemantica: `HASH-FICTICIO-${id}`,
    versaoSnapshotHospitalar: snap,
    registros: procedimentos.length,
    codigosDistintos: new Set(procedimentos.map(p => p.codigo)).size,
    procedimentosJson: procedimentos,
    criadoEm: new Date(`2026-10-30T12:00:${String(id).padStart(2, "0")}.000Z`),
  };
}
export function linhaFonteHonorarios(fonte: FonteMedicaPersistida) {
  return {
    ...fonte.scope,
    ...linhaHonorarios(fonte.id, fonte.procedimentos),
    ...fonte,
    criadoEm: new Date(1793361600000 + fonte.id * 1000),
    procedimentosJson: fonte.composicao
      ? { procedimentos: fonte.procedimentos, composicao: fonte.composicao }
      : fonte.procedimentos,
  };
}
export async function lerFontesHonorarios(rows: unknown[]) {
  return criarContaContextoMedicoRepositorioDrizzle({
    getDb: async () =>
      ({
        select: () => ({
          from: () => ({ where: () => ({ orderBy: async () => rows }) }),
        }),
      }) as never,
  }).listarFontes(scopeHonorarios);
}
export function harnessHonorarios(
  guias = [guiaHonorarios()],
  hospital = hospitalHonorarios()
) {
  const fontes: FonteMedicaPersistida[] = [];
  const eventos: unknown[] = [];
  let contexto: ContextoMedicoPersistido | null = null;
  const parsed: ParseContaHonorariosResultado = { recognized: true, guias };
  const gabarito = {
    padraoId: 950,
    nome: "Gabarito ficticio",
    estabelecimentoId: 901,
    convenioId: 902,
    isGabarito: true,
    status: "ativo" as const,
    principais: [
      { codigo: guias[0]?.procedimentos[0]?.codigo ?? "PROC-FICTICIO" },
    ],
    itensAssociados: [],
  };
  const tx: ContextoMedicoTransacao = {
    obterContextoParaAtualizacao: async () => contexto,
    inserirContextoInicial: async novo => {
      contexto = { id: 951, ...novo };
      return contexto;
    },
    atualizarContextoComCas: async (id, rev, novo) => {
      if (!contexto || contexto.revisao !== rev) return null;
      contexto = { id, ...novo };
      return contexto;
    },
    anexarEvento: async evento => {
      eventos.push(structuredClone(evento));
    },
  };
  const repo: ContaContextoMedicoRepositorio = {
    configurado: async () => true,
    resolverSnapshotHospitalar: async () => hospital,
    listarEscoposHospitalaresCandidatos: async () => [scopeHonorarios],
    diagnosticarSnapshotHospitalar: async () => ({ etapas: [] }),
    obterArquivoMedicoAutorizado: async () => ({
      id: 906,
      nome: "ficticio.xml",
      tamanho: null,
      dataReferencia: null,
      s3Key: "arquivos/ficticio.xml",
      tipoArquivo: "xml",
      direcao: "enviado",
      estabelecimentoId: 901,
      convenioId: 902,
    }),
    lerXmlMedicoAutorizado: async () => Buffer.from("<xml-ficticio/>"),
    listarArquivosMedicos: async () => ({
      arquivos: [],
      temProximaPagina: false,
    }),
    listarFontes: async () =>
      lerFontesHonorarios(fontes.map(linhaFonteHonorarios)),
    inserirFonteSeAusente: async nova => {
      const existente = fontes.find(
        f =>
          f.versaoSemantica === nova.versaoSemantica &&
          f.guiaReferencia === nova.guiaReferencia
      );
      if (existente) return { fonte: existente, criada: false };
      const fonte = { ...nova, id: fontes.length + 1 };
      fontes.push(fonte);
      return { fonte, criada: true };
    },
    listarGabaritosManuais: async () => [gabarito],
    obterGabaritoManual: async () => gabarito,
    obterContexto: async () => contexto,
    transacionar: async callback => callback(tx),
  };
  const service = criarContaContextoMedicoService({
    repositorio: repo,
    parse: () => parsed,
  });
  return {
    fontes,
    eventos,
    parsed,
    hospital,
    repo,
    service,
    get contexto() {
      return contexto;
    },
    indexar: () =>
      service.indexar({ scope: scopeHonorarios, arquivoMedicoId: 906 }),
    automatico: () =>
      service.indexarAutomaticamente({
        arquivo: {
          id: 906,
          tipoArquivo: "xml",
          direcao: "enviado",
          estabelecimentoId: 901,
          convenioId: 902,
        },
        xml: Buffer.from("<xml-ficticio/>"),
        escoposHospitalaresPermitidos: [scopeHonorarios],
      }),
    confirmar: () =>
      service.confirmar({
        scope: scopeHonorarios,
        padraoId: 950,
        justificativa: "Conferência fictícia.",
        revisaoEsperada: 0,
        usuarioId: 952,
      }),
    consultar: () => service.consultar({ scope: scopeHonorarios }),
  };
}
