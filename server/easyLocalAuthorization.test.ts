import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./easyLocalConnection", () => ({ testarConexaoEasyLocal: vi.fn() }));

import { testarConexaoEasyLocal } from "./easyLocalConnection";
import { easyLocalRouter } from "./routers/easyLocalRouter";

function context(role: "admin" | "user" | null) {
  return {
    user: role ? { id: 91, role, openId: "easylocal-user", email: "test@example.org" } : null,
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

describe("autorização da sonda global EASYLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(testarConexaoEasyLocal).mockResolvedValue({ status: "conectado" });
  });

  it("nega acesso a usuário comum e sem sessão antes de conectar", async () => {
    await expect(easyLocalRouter.createCaller(context("user")).testarConexao({}))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(easyLocalRouter.createCaller(context(null)).testarConexao({}))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(testarConexaoEasyLocal).not.toHaveBeenCalled();
  });

  it("recusa SQL, host, segredo ou unidade enviada no request", async () => {
    const caller = easyLocalRouter.createCaller(context("admin"));
    for (const input of [
      { querySql: "SELECT * FROM pacientes" },
      { host: "attacker.example.org" },
      { password: "texto" },
      { estabelecimentoId: 4 },
    ]) {
      await expect(caller.testarConexao(input as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(testarConexaoEasyLocal).not.toHaveBeenCalled();
  });

  it("retorna apenas o estado sanitizado para o administrador", async () => {
    const response = await easyLocalRouter.createCaller(context("admin")).testarConexao({});
    expect(response).toEqual({ status: "conectado" });
    expect(testarConexaoEasyLocal).toHaveBeenCalledOnce();
  });
});
