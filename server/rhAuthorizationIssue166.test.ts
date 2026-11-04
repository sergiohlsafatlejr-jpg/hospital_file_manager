import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  exigirUnidadeFinanceira: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  verificarAcessoModulo: mocks.verificarAcessoModulo,
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));

vi.mock("./financeiroEscopo", () => ({
  exigirUnidadeFinanceira: mocks.exigirUnidadeFinanceira,
}));

import { rhRouter } from "./routers/rhRouter";

function createCaller(userId = 42, role: "user" | "admin" = "user") {
  return rhRouter.createCaller({
    user: {
      id: userId,
      openId: `user-${userId}`,
      name: "Operador RH",
      email: "rh@safatle.com.br",
      loginMethod: "password",
      role,
      passwordHash: null,
      sessionVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      emailCanonical: "rh@safatle.com.br",
    },
    req: { headers: {} } as any,
    res: {} as any,
  });
}

describe("Issue #166 — Guardas de autorização, ownership e separação leitura/escrita no RH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejeita consultas de leitura quando o usuário não possui o módulo recursosHumanos", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.verificarAcessoModulo.mockResolvedValue(false);

    const caller = createCaller(77, "user");

    await expect(caller.listFolha({ estabelecimentoId: 2160001 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(
      77,
      2160001,
      "visualizar"
    );
    expect(mocks.verificarAcessoModulo).toHaveBeenCalledWith(
      77,
      2160001,
      "recursosHumanos"
    );
    expect(mocks.getDb).not.toHaveBeenCalled();

    await expect(caller.competencias({ estabelecimentoId: 2160001 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.listColaboradores({ estabelecimentoId: 2160001 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.listCargosSalarios({ estabelecimentoId: 2160001 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejeita ausência de estabelecimento nas leituras para impedir consulta global", async () => {
    const caller = createCaller(77, "user");

    await expect((caller as any).listFolha({})).rejects.toThrow();
    await expect((caller as any).competencias({})).rejects.toThrow();
    await expect((caller as any).listColaboradores({})).rejects.toThrow();
    await expect((caller as any).listCargosSalarios({})).rejects.toThrow();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("listCargosSalarios executa apenas leitura e nunca cria cargos automaticamente", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.verificarAcessoModulo.mockResolvedValue(true);

    const insertSpy = vi.fn();
    const whereSpy = vi.fn().mockResolvedValue([
      { id: 1, estabelecimentoId: 2160001, cargo: "Faturista", salarioBase: "2500.00", tetoSalarial: "4000.00" },
    ]);
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: whereSpy,
        })),
      })),
      insert: insertSpy,
    });

    const caller = createCaller(77, "user");
    const result = await caller.listCargosSalarios({ estabelecimentoId: 2160001 });

    expect(result).toHaveLength(1);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("createColaborador exige permissão de editar e módulo recursosHumanos", async () => {
    mocks.verificarPermissaoEstabelecimento.mockImplementation(
      async (_userId: number, _estabId: number, acao: string) => acao === "visualizar"
    );
    mocks.verificarAcessoModulo.mockResolvedValue(true);

    const caller = createCaller(88, "user");
    await expect(
      caller.createColaborador({
        estabelecimentoId: 2160001,
        nome: "Colaborador Sintético",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(
      88,
      2160001,
      "editar"
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("updateCargoSalario resolve o estabelecimento proprietário pelo ID e bloqueia escrita cruzada ou sem edição", async () => {
    const updateWhereSpy = vi.fn().mockResolvedValue(undefined);
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 55, estabelecimentoId: 2160001 }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhereSpy,
        })),
      })),
    });

    const caller = createCaller(99, "user");

    // Tentativa de informar estabelecimento divergente do proprietário real do cargo
    await expect(
      caller.updateCargoSalario({
        id: 55,
        estabelecimentoId: 999999,
        salarioBase: 3000,
        tetoSalarial: 5000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateWhereSpy).not.toHaveBeenCalled();

    // Usuário apenas com visualizar (sem editar) no estabelecimento proprietário (2160001)
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    mocks.verificarAcessoModulo.mockResolvedValue(true);

    await expect(
      caller.updateCargoSalario({
        id: 55,
        salarioBase: 3000,
        tetoSalarial: 5000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(
      99,
      2160001,
      "editar"
    );
    expect(updateWhereSpy).not.toHaveBeenCalled();

    // Usuário com editar + módulo recursosHumanos no estabelecimento proprietário
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.verificarAcessoModulo.mockResolvedValue(true);

    await expect(
      caller.updateCargoSalario({
        id: 55,
        salarioBase: 3000,
        tetoSalarial: 5000,
      })
    ).resolves.toBe(true);
    expect(updateWhereSpy).toHaveBeenCalledTimes(1);
  });

  it("updateColaborador exige unidade proprietária + permissão editar e restringe o UPDATE ao estabelecimento", async () => {
    const updateWhereSpy = vi.fn().mockResolvedValue(undefined);
    mocks.getDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 101, estabelecimentoId: 2160001 }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhereSpy,
        })),
      })),
    });

    const caller = createCaller(61, "user");

    // Sem estabelecimentoId e sem id -> BAD_REQUEST
    await expect(
      caller.updateColaborador({
        originalCpf: "000.000.000-00",
        originalNome: "Teste",
        nome: "Teste Atualizado",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateWhereSpy).not.toHaveBeenCalled();

    // Com estabelecimentoId e permissão de editar + módulo RH -> atualiza restrito ao estabelecimento
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.verificarAcessoModulo.mockResolvedValue(true);

    await expect(
      caller.updateColaborador({
        estabelecimentoId: 2160001,
        originalCpf: "000.000.000-00",
        originalNome: "Teste",
        nome: "Teste Atualizado",
      })
    ).resolves.toBe(true);

    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(
      61,
      2160001,
      "editar"
    );
    expect(mocks.verificarAcessoModulo).toHaveBeenCalledWith(
      61,
      2160001,
      "recursosHumanos"
    );
    expect(updateWhereSpy).toHaveBeenCalledTimes(1);
  });
});
