import { beforeEach, describe, expect, it, vi } from "vitest";

const { verificarAcessoModulo, verificarPermissaoEstabelecimento } = vi.hoisted(() => ({
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

vi.mock("./db", () => ({
  getApplicationDatabaseUrl: vi.fn(() => undefined),
  verificarAcessoModulo,
  verificarPermissaoEstabelecimento,
}));

import { faturadoRecebidoUnificadoRouter } from "./routers/faturadoRecebidoUnificadoRouter";

const contexto = {
  user: {
    id: 77,
    openId: "usuario-teste",
    email: "usuario@teste.invalid",
    emailCanonical: "usuario@teste.invalid",
    name: "Usuário Teste",
    loginMethod: "manus",
    role: "user",
    passwordHash: null,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

describe("autorização do período no Faturado x Recebido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verificarPermissaoEstabelecimento.mockResolvedValue(true);
  });

  it("nega a visão quando o módulo do relatório não está liberado", async () => {
    verificarAcessoModulo.mockResolvedValue(false);
    const caller = faturadoRecebidoUnificadoRouter.createCaller(contexto);

    await expect(caller.dados({ estabelecimentoId: 3, criterioPeriodo: "PAGAMENTO" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(77, 3, "relFaturadoRecebido");
  });

  it("nega a unidade sem permissão mesmo quando o módulo está liberado", async () => {
    verificarAcessoModulo.mockResolvedValue(true);
    verificarPermissaoEstabelecimento.mockResolvedValue(false);
    const caller = faturadoRecebidoUnificadoRouter.createCaller(contexto);

    await expect(caller.dados({ estabelecimentoId: 99, criterioPeriodo: "FATURAMENTO" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(77, 99, "visualizar");
  });
});
