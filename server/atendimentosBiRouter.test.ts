import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

vi.mock("./atendimentosBiService", () => ({
  getAtendimentosBiDashboard: vi.fn(),
}));

import { verificarAcessoModulo, verificarPermissaoEstabelecimento } from "./db";
import { getAtendimentosBiDashboard } from "./atendimentosBiService";
import { atendimentosBiRouter } from "./routers/atendimentosBiRouter";

function context() {
  return {
    user: {
      id: 91, openId: "usuario-bi", email: "usuario@example.com", name: "Usuário BI", loginMethod: "password",
      role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} }, res: {},
  } as any;
}

describe("BI de atendimentos: autorização e privacidade", () => {
  beforeEach(() => {
    vi.mocked(verificarPermissaoEstabelecimento).mockReset();
    vi.mocked(verificarAcessoModulo).mockReset();
    vi.mocked(getAtendimentosBiDashboard).mockReset();
  });

  it("nega unidade não vinculada antes de consultar agregados", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    const caller = atendimentosBiRouter.createCaller(context());
    await expect(caller.painel({ estabelecimentoId: 6 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getAtendimentosBiDashboard).not.toHaveBeenCalled();
  });

  it("exige a permissão individual relAtendimentos", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(false);
    const caller = atendimentosBiRouter.createCaller(context());
    await expect(caller.painel({ estabelecimentoId: 6 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(91, 6, "relAtendimentos");
  });

  it("consulta somente após unidade e relatório autorizados", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    vi.mocked(getAtendimentosBiDashboard).mockResolvedValue({ resumo: { quantidade: 1 } } as any);
    const caller = atendimentosBiRouter.createCaller(context());
    await expect(caller.painel({ estabelecimentoId: 6 })).resolves.toEqual({ resumo: { quantidade: 1 } });
    expect(getAtendimentosBiDashboard).toHaveBeenCalledWith(expect.objectContaining({ estabelecimentoId: 6 }));
  });

  it("descarta qualquer tentativa de solicitar contas com título", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    vi.mocked(getAtendimentosBiDashboard).mockResolvedValue({ resumo: { quantidade: 1 } } as any);
    const caller = atendimentosBiRouter.createCaller(context());

    await caller.painel({ estabelecimentoId: 6, situacao: "finalizadas" } as any);
    expect(getAtendimentosBiDashboard).toHaveBeenCalledWith(
      expect.not.objectContaining({ situacao: expect.anything() }),
    );
  });

  it("rejeita mês inexistente antes de consultar o banco", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = atendimentosBiRouter.createCaller(context());

    await expect(caller.painel({ estabelecimentoId: 6, mesEntrada: "2026-99" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getAtendimentosBiDashboard).not.toHaveBeenCalled();
  });
});
