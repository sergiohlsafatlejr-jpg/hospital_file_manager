import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type {
  ContaContextoMedicoResultado,
  ScopeContaMedica,
} from "../shared/contaContextoMedico";
import { indexarHonorariosFabricaCanonicos } from "./fabricaContextoMedico";

const ARQUIVO_MEDICO_ID = 901;
const MENSAGEM_SANITIZADA =
  "Não foi possível confirmar a correlação do XML de honorários com esta conta e versão hospitalar. Nenhuma importação foi confirmada; confira guia, hospital, convênio e datas dos XMLs.";

const scope: ScopeContaMedica = {
  estabelecimentoId: 41,
  convenioId: 72,
  numeroConta: "CONTA-FICTICIA-0001",
  arquivoHospitalId: 84,
  numeroLote: "LOTE-FICTICIO-01",
  competencia: "2026-10",
};
const xmlFicticio = Buffer.from("<xml>somente-dados-ficticios</xml>");

type ServicoInjetado = Parameters<typeof indexarHonorariosFabricaCanonicos>[0];
type Indexacao = {
  indexadas: number;
  jaIndexadas: number;
  semCorrespondencia: number;
  ambiguas: number;
};

function fonte(arquivoId = ARQUIVO_MEDICO_ID, registros = 1) {
  return {
    arquivoId,
    registros,
    codigosDistintos: 1,
    procedimentos: [],
  };
}

function contextoValido(
  overrides: Partial<ContaContextoMedicoResultado> = {}
): ContaContextoMedicoResultado {
  return {
    configuracaoPendente: false,
    diagnosticoSnapshot: null,
    fontes: [fonte()],
    candidatos: [],
    contexto: null,
    itensHospitalares: 1,
    setorInformado: true,
    avisos: [],
    ...overrides,
  };
}

function correlacaoValida(
  overrides: Partial<Indexacao> = {}
): Indexacao {
  return {
    indexadas: 1,
    jaIndexadas: 0,
    semCorrespondencia: 0,
    ambiguas: 0,
    ...overrides,
  };
}

function servicoFicticio({
  indexacao = correlacaoValida(),
  contexto = contextoValido(),
}: {
  indexacao?: Indexacao;
  contexto?: ContaContextoMedicoResultado;
} = {}) {
  const indexarAutomaticamente = vi.fn(async () => indexacao);
  const consultar = vi.fn(async () => contexto);

  return {
    servico: {
      indexarAutomaticamente,
      consultar,
    } as unknown as ServicoInjetado,
    indexarAutomaticamente,
    consultar,
  };
}

async function indexarCom(servico: ServicoInjetado) {
  return indexarHonorariosFabricaCanonicos(servico, {
    arquivoMedicoId: ARQUIVO_MEDICO_ID,
    xml: xmlFicticio,
    scope,
  });
}

async function esperaPrecondicaoSanitizada(promessa: Promise<unknown>) {
  let erro: unknown;
  try {
    await promessa;
  } catch (capturado) {
    erro = capturado;
  }

  expect(erro).toBeInstanceOf(TRPCError);
  expect(erro).toMatchObject({
    code: "PRECONDITION_FAILED",
    message: MENSAGEM_SANITIZADA,
  });
}

describe("indexarHonorariosFabricaCanonicos", () => {
  it("confirma nova indexação e repassa a tupla hospitalar completa ao serviço injetado", async () => {
    const fake = servicoFicticio();
    const resultado = await indexarCom(fake.servico);

    expect(resultado).toEqual(contextoValido());
    expect(fake.indexarAutomaticamente).toHaveBeenCalledOnce();
    expect(fake.indexarAutomaticamente).toHaveBeenCalledWith({
      arquivo: {
        id: ARQUIVO_MEDICO_ID,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: 41,
        convenioId: 72,
      },
      xml: xmlFicticio,
      arquivoHospitalIdsPermitidos: [84],
      escoposHospitalaresPermitidos: [
        {
          estabelecimentoId: 41,
          convenioId: 72,
          numeroConta: "CONTA-FICTICIA-0001",
          arquivoHospitalId: 84,
          numeroLote: "LOTE-FICTICIO-01",
          competencia: "2026-10",
        },
      ],
    });
    expect(fake.consultar).toHaveBeenCalledWith({ scope });
  });

  it.each([
    [
      "uma guia sem correspondência canônica",
      correlacaoValida({ semCorrespondencia: 1 }),
    ],
    ["uma guia ambígua", correlacaoValida({ ambiguas: 1 })],
  ])(
    "bloqueia %s com erro sanitizado sem consultar nem realizar fallback",
    async (_descricao, indexacao) => {
      const fake = servicoFicticio({ indexacao });

      await esperaPrecondicaoSanitizada(indexarCom(fake.servico));

      expect(fake.indexarAutomaticamente).toHaveBeenCalledOnce();
      expect(fake.consultar).not.toHaveBeenCalled();
    }
  );

  it("bloqueia quando a indexação canônica não confirma nenhum registro", async () => {
    const fake = servicoFicticio({
      indexacao: correlacaoValida({ indexadas: 0, jaIndexadas: 0 }),
    });

    await esperaPrecondicaoSanitizada(indexarCom(fake.servico));

    expect(fake.consultar).not.toHaveBeenCalled();
  });

  it.each([
    [
      "não contém a fonte do arquivo médico enviado",
      () =>
        contextoValido({
          fontes: [fonte(ARQUIVO_MEDICO_ID + 1)],
        }),
    ],
    [
      "indica configuração pendente",
      () => contextoValido({ configuracaoPendente: true }),
    ],
    [
      "traz diagnóstico de snapshot pendente",
      () =>
        contextoValido({
          diagnosticoSnapshot: {
            etapas: [{ etapa: "arquivo_hospitalar", totalLinhas: 0 }],
          },
        }),
    ],
  ])("bloqueia quando a consulta %s", async (_descricao, criarContexto) => {
    const fake = servicoFicticio({ contexto: criarContexto() });

    await esperaPrecondicaoSanitizada(indexarCom(fake.servico));

    expect(fake.indexarAutomaticamente).toHaveBeenCalledOnce();
    expect(fake.consultar).toHaveBeenCalledWith({ scope });
  });

  it("confirma uma correlação idempotente quando somente jaIndexadas é positiva", async () => {
    const contexto = contextoValido();
    const fake = servicoFicticio({
      indexacao: correlacaoValida({ indexadas: 0, jaIndexadas: 1 }),
      contexto,
    });

    await expect(indexarCom(fake.servico)).resolves.toEqual(contexto);
    expect(fake.consultar).toHaveBeenCalledOnce();
  });
});
