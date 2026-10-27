import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  permissaoUnidade: vi.fn(),
  permissaoModulo: vi.fn(),
  listar: vi.fn(),
  inativar: vi.fn(),
}));

vi.mock("./db", () => ({
  verificarPermissaoEstabelecimento: mocks.permissaoUnidade,
  verificarAcessoModulo: mocks.permissaoModulo,
  getRawPool: vi.fn(async () => null),
}));
vi.mock("./prontuarioPdfService", () => ({
  prontuarioPdfListar: mocks.listar,
  prontuarioPdfInativar: mocks.inativar,
}));

import { appRouter } from "./routers";
import { prontuarioPdfRouter } from "./routers/prontuarioPdfRouter";

const userId = 41;
const scope = {
  estabelecimentoId: 7,
  convenioId: 8,
  arquivoHospitalId: 9,
  numeroConta: "CONTA-SINTETICA",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};

function context(role: "admin" | "user" | null = "user"): TrpcContext {
  return {
    user: role
      ? {
          id: userId,
          role,
          openId: "prontuario-router-test",
          name: "Usuário de teste",
        }
      : null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}
function caller(role: "admin" | "user" | null = "user") {
  return appRouter.createCaller(context(role));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissaoUnidade.mockResolvedValue(true);
  mocks.permissaoModulo.mockResolvedValue(true);
  mocks.listar.mockResolvedValue([]);
  mocks.inativar.mockResolvedValue({ id: 1, inativado: true });
});

describe("prontuarioPdfRouter", () => {
  it("encaminha somente listar/inativar validados e o usuário autenticado", async () => {
    const api = caller();
    const inativar = { ...scope, anexoId: 22, confirmar: true as const };

    await api.prontuarioPdf.listar(scope);
    await api.prontuarioPdf.inativar(inativar);

    expect(mocks.listar).toHaveBeenCalledWith(scope, userId);
    expect(mocks.inativar).toHaveBeenCalledWith(inativar, userId);
    expect(mocks.permissaoUnidade).toHaveBeenCalledWith(
      userId,
      scope.estabelecimentoId,
      "visualizar"
    );
    expect(mocks.permissaoModulo).toHaveBeenCalledWith(
      userId,
      scope.estabelecimentoId,
      "contaConvenio"
    );
  });

  it("não expõe mutation de upload no contrato tRPC", () => {
    expect((prontuarioPdfRouter as any)._def.procedures).not.toHaveProperty(
      "upload"
    );
    expect(
      Object.keys((prontuarioPdfRouter as any)._def.procedures).sort()
    ).toEqual(["inativar", "listar"]);
  });

  it("bloqueia sessão, unidade ou módulo antes de chegar ao serviço", async () => {
    await expect(
      caller(null).prontuarioPdf.listar(scope)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listar).not.toHaveBeenCalled();

    mocks.permissaoUnidade.mockResolvedValue(false);
    await expect(caller().prontuarioPdf.listar(scope)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.listar).not.toHaveBeenCalled();

    mocks.permissaoUnidade.mockResolvedValue(true);
    mocks.permissaoModulo.mockResolvedValue(false);
    await expect(caller().prontuarioPdf.listar(scope)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.listar).not.toHaveBeenCalled();
  });

  it("rejeita escopo incompleto, campos arbitrários e confirmação ausente", async () => {
    const api = caller();
    await expect(
      api.prontuarioPdf.listar({ ...scope, arquivoHospitalId: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      api.prontuarioPdf.listar({ ...scope, financeiro: "proibido" } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      api.prontuarioPdf.inativar({
        ...scope,
        anexoId: 22,
        confirmar: false,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.inativar).not.toHaveBeenCalled();
  });
});
