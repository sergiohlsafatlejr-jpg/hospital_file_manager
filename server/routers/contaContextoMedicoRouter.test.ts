import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContaContextoMedicoService } from "../contaContextoMedicoService";

const mocks = vi.hoisted(() => ({
  criarServico: vi.fn(),
  exigirAcessoEstabelecimento: vi.fn(),
  exigirConvenioDoEstabelecimento: vi.fn(),
}));

vi.mock("../contaContextoMedicoDrizzle", () => ({
  criarServicoContaContextoMedicoParaUsuario: mocks.criarServico,
}));

vi.mock("../recursoGlosaPermissions", () => ({
  exigirAcessoEstabelecimento: mocks.exigirAcessoEstabelecimento,
  exigirConvenioDoEstabelecimento: mocks.exigirConvenioDoEstabelecimento,
}));

import {
  contaContextoMedicoRouter,
  criarContaContextoMedicoRouter,
} from "./contaContextoMedicoRouter";

const scope = {
  estabelecimentoId: 1,
  convenioId: 2,
  numeroConta: "CONTA-SINTETICA",
  arquivoHospitalId: 39,
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};

const adminContext = {
  user: {
    id: 7,
    openId: "admin-sintetico",
    name: "Admin sintético",
    email: null,
    emailCanonical: null,
    loginMethod: "test",
    role: "admin" as const,
    passwordHash: null,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as never,
  res: {} as never,
};

function resultadoConfigurado() {
  return {
    configuracaoPendente: false,
    fontes: [],
    candidatos: [],
    contexto: null,
    itensHospitalares: 0,
    setorInformado: false,
    avisos: [],
  };
}

function criarServicoFake(): ContaContextoMedicoService {
  return {
    consultar: vi.fn(async () => resultadoConfigurado()),
    listarArquivos: vi.fn(async () => ({
      configuracaoPendente: false,
      arquivos: [],
      page: 1,
      temProximaPagina: false,
    })),
    indexar: vi.fn(async () => ({ indexadas: 0, jaIndexadas: 0, avisos: [] })),
    confirmar: vi.fn(async () => ({
      padraoId: 5,
      nomePadrao: "Gabarito sintético",
      status: "confirmado" as const,
      revisao: 1,
      confirmadoEm: null,
      confirmadoPor: 7,
      justificativa: "Revisão sintética",
      abrangencia: "conta_inteira" as const,
    })),
    invalidar: vi.fn(async () => null),
  };
}

describe("contaContextoMedicoRouter", () => {
  beforeEach(() => {
    mocks.criarServico.mockReset();
    mocks.exigirAcessoEstabelecimento.mockReset();
    mocks.exigirConvenioDoEstabelecimento.mockReset();
  });

  it("resolve o adapter real padrão por usuário, em vez do serviço pendente", async () => {
    const service = criarServicoFake();
    mocks.criarServico.mockReturnValue(service);
    mocks.exigirAcessoEstabelecimento.mockResolvedValue(undefined);
    mocks.exigirConvenioDoEstabelecimento.mockResolvedValue({ id: scope.convenioId });

    const caller = contaContextoMedicoRouter.createCaller(adminContext);
    await expect(caller.consultar({ scope })).resolves.toMatchObject({
      configuracaoPendente: false,
      fontes: [],
      candidatos: [],
      contexto: null,
    });

    expect(mocks.criarServico).toHaveBeenCalledWith(adminContext.user.id);
    expect(service.consultar).toHaveBeenCalledWith({ scope });
    expect(mocks.exigirAcessoEstabelecimento).toHaveBeenCalledWith(7, 1, "visualizar");
    expect(mocks.exigirConvenioDoEstabelecimento).toHaveBeenCalledWith(7, 2, 1, "visualizar");
  });

  it("autoriza unidade e convênio antes de cada leitura e usa editar antes das mutações", async () => {
    const service = criarServicoFake();
    mocks.exigirAcessoEstabelecimento.mockResolvedValue(undefined);
    mocks.exigirConvenioDoEstabelecimento.mockResolvedValue({ id: scope.convenioId });
    const caller = criarContaContextoMedicoRouter(service).createCaller(adminContext);

    await caller.listarArquivos({ scope });
    await caller.indexar({ scope, arquivoMedicoId: 6 });
    await caller.confirmar({
      scope,
      padraoId: 5,
      justificativa: "Revisão humana sintética.",
      revisaoEsperada: 0,
    });
    await caller.invalidar({
      scope,
      justificativa: "Invalidação humana sintética.",
      revisaoEsperada: 1,
    });

    expect(mocks.exigirAcessoEstabelecimento).toHaveBeenCalledWith(7, 1, "visualizar");
    expect(mocks.exigirConvenioDoEstabelecimento).toHaveBeenCalledWith(7, 2, 1, "visualizar");
    expect(mocks.exigirAcessoEstabelecimento).toHaveBeenCalledWith(7, 1, "editar");
    expect(mocks.exigirConvenioDoEstabelecimento).toHaveBeenCalledWith(7, 2, 1, "editar");
    expect(service.indexar).toHaveBeenCalledTimes(1);
    expect(service.confirmar).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }));
    expect(service.invalidar).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }));
  });

  it("bloqueia escopo de outro estabelecimento antes de chamar o serviço ou carregar arquivo", async () => {
    const service = criarServicoFake();
    mocks.exigirAcessoEstabelecimento.mockRejectedValue(new TRPCError({
      code: "FORBIDDEN",
      message: "Unidade não autorizada",
    }));
    const caller = criarContaContextoMedicoRouter(service).createCaller(adminContext);

    await expect(caller.indexar({
      scope: { ...scope, estabelecimentoId: 99 },
      arquivoMedicoId: 6,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.exigirConvenioDoEstabelecimento).not.toHaveBeenCalled();
    expect(service.indexar).not.toHaveBeenCalled();
  });
});
