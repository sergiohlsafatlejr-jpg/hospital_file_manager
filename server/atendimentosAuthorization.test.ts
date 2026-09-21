import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

import { reportProcedure, router } from "./_core/trpc";
import { verificarAcessoModulo, verificarPermissaoEstabelecimento } from "./db";

const testRouter = router({
  listar: reportProcedure("atendimentos")
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .query(({ input }) => ({ estabelecimentoId: input.estabelecimentoId })),
});

function createUserContext() {
  return {
    user: {
      id: 91,
      openId: "usuario-atendimentos",
      email: "usuario@example.com",
      name: "Usuário Teste",
      loginMethod: "password",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

describe("autorização de atendimentos por estabelecimento", () => {
  beforeEach(() => {
    vi.mocked(verificarPermissaoEstabelecimento).mockReset();
    vi.mocked(verificarAcessoModulo).mockReset();
  });

  it("nega usuário sem vínculo com a unidade informada", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = testRouter.createCaller(createUserContext());

    await expect(caller.listar({ estabelecimentoId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).not.toHaveBeenCalled();
  });

  it("nega usuário vinculado sem permissão no módulo de atendimentos", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(false);
    const caller = testRouter.createCaller(createUserContext());

    await expect(caller.listar({ estabelecimentoId: 6 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(91, 6, "atendimentos");
  });

  it("permite somente quando unidade e módulo estão autorizados", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = testRouter.createCaller(createUserContext());

    await expect(caller.listar({ estabelecimentoId: 6 })).resolves.toEqual({ estabelecimentoId: 6 });
  });

  it("rejeita entrada sem estabelecimento positivo mesmo para administrador", async () => {
    const ctx = createUserContext();
    ctx.user.role = "admin";
    const caller = testRouter.createCaller(ctx);

    await expect(caller.listar({ estabelecimentoId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
