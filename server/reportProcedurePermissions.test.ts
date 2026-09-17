import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarAcessoModulo: mocks.verificarAcessoModulo,
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));

import { reportProcedure, router } from "./_core/trpc";

const testRouter = router({
  dados: reportProcedure("relLaboratorio")
    .input(z.object({ estabelecimentoId: z.number().int() }))
    .query(({ input }) => ({ estabelecimentoId: input.estabelecimentoId })),
});

function caller(role: "admin" | "user" = "user") {
  return testRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: { id: 731, role } as any,
  });
}

describe("reportProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  });

  it("libera somente quando o usuário possui a permissão específica na unidade", async () => {
    mocks.verificarAcessoModulo.mockResolvedValue(true);
    await expect(caller().dados({ estabelecimentoId: 2550001 })).resolves.toEqual({ estabelecimentoId: 2550001 });
    expect(mocks.verificarAcessoModulo).toHaveBeenCalledWith(731, 2550001, "relLaboratorio");
  });

  it("bloqueia o relatório quando a permissão específica está desativada", async () => {
    mocks.verificarAcessoModulo.mockResolvedValue(false);
    await expect(caller().dados({ estabelecimentoId: 2550001 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("falha fechado sem estabelecimento positivo", async () => {
    await expect(caller().dados({ estabelecimentoId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.verificarAcessoModulo).not.toHaveBeenCalled();
  });

  it("mantém o administrador do sistema com acesso total", async () => {
    await expect(caller("admin").dados({ estabelecimentoId: 2550001 })).resolves.toEqual({ estabelecimentoId: 2550001 });
    expect(mocks.verificarAcessoModulo).not.toHaveBeenCalled();
  });

  it("também exige unidade positiva do administrador", async () => {
    await expect(caller("admin").dados({ estabelecimentoId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
