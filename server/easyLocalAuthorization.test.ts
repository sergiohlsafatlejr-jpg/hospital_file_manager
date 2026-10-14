import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./easyLocalConnection", () => ({
  testarConexaoEasyLocal: vi.fn(),
  readEasyLocalConfig: vi.fn(),
}));

import {
  readEasyLocalConfig,
  testarConexaoEasyLocal,
} from "./easyLocalConnection";
vi.mock("./easyLocalCadastroStore", () => ({
  resolverEasyLocalConfig: vi.fn(),
  obterEasyLocalCadastro: vi.fn(),
  salvarEasyLocalCadastro: vi.fn(),
  prepararEasyLocalRascunho: vi.fn(),
}));
import { resolverEasyLocalConfig } from "./easyLocalCadastroStore";
import { easyLocalRouter } from "./routers/easyLocalRouter";

function context(role: "admin" | "user" | null) {
  return {
    user: role
      ? { id: 91, role, openId: "easylocal-user", email: "test@example.org" }
      : null,
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

describe("autorização da sonda global EASYLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(testarConexaoEasyLocal).mockResolvedValue({
      status: "conectado",
    });
    vi.mocked(resolverEasyLocalConfig).mockResolvedValue(null);
  });

  it("nega acesso a usuário comum e sem sessão antes de conectar", async () => {
    await expect(
      easyLocalRouter.createCaller(context("user")).testarConexao({})
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      easyLocalRouter.createCaller(context(null)).testarConexao({})
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
      await expect(caller.testarConexao(input as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(testarConexaoEasyLocal).not.toHaveBeenCalled();
  });

  it("retorna apenas o estado sanitizado para o administrador", async () => {
    const response = await easyLocalRouter
      .createCaller(context("admin"))
      .testarConexao({});
    expect(response).toEqual({ status: "conectado" });
    expect(testarConexaoEasyLocal).toHaveBeenCalledOnce();
  });

  it("nega preparação a usuários comuns e não aciona a conexão ao abrir a tela", async () => {
    await expect(
      easyLocalRouter.createCaller(context("user")).obterPreparacao({})
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      easyLocalRouter.createCaller(context(null)).obterPreparacao({})
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const state = await easyLocalRouter
      .createCaller(context("admin"))
      .obterPreparacao({});
    expect(state).toEqual({
      configuracaoDisponivel: false,
      piloto: { estabelecimentoId: 1260036, nome: "Hospital Urológico" },
      ingestaoAtiva: false,
    });
    expect(testarConexaoEasyLocal).not.toHaveBeenCalled();
  });

  it("aceita apenas entrada vazia e nunca retorna segredo, host ou usuário", async () => {
    const caller = easyLocalRouter.createCaller(context("admin"));
    await expect(
      caller.obterPreparacao({ estabelecimentoId: 1 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.mocked(resolverEasyLocalConfig).mockResolvedValue({
      host: "example.invalid",
      port: 5432,
      database: "database",
      user: "role",
      password: "segredo",
    } as any);
    const state = await caller.obterPreparacao({});
    expect(state.configuracaoDisponivel).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(
      /example\.invalid|segredo|database|role/
    );
  });
});
