import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./easyLocalCadastroStore", () => ({
  obterEasyLocalCadastro: vi.fn(),
  salvarEasyLocalCadastro: vi.fn(),
  resolverEasyLocalConfig: vi.fn(),
  prepararEasyLocalRascunho: vi.fn(),
}));
vi.mock("./easyLocalConnection", () => ({
  testarConexaoEasyLocal: vi.fn(),
  testarConexaoComConfig: vi.fn(),
}));
import * as store from "./easyLocalCadastroStore";
import { testarConexaoComConfig } from "./easyLocalConnection";
import { easyLocalRouter } from "./routers/easyLocalRouter";
const input = {
  nome: "Central teste",
  descricao: "",
  tipo: "postgresql" as const,
  host: "central.example.org",
  porta: 5432,
  banco: "teste",
  usuario: "leitor",
  senha: "ficticia",
  tls: "system" as const,
  revisao: null,
  confirmarConexaoCentral: true as const,
};
const ctx = (role: "admin" | "user" | null) =>
  ({
    user: role ? { id: 7, role, openId: "teste" } : null,
    req: { protocol: "https", headers: {} },
    res: {},
  }) as any;
beforeEach(() => vi.clearAllMocks());
describe("autorização cadastro EASYLocal", () => {
  it.each(["user", null] as const)(
    "bloqueia todos os novos endpoints para %s antes de acessar dados",
    async role => {
      const caller = easyLocalRouter.createCaller(ctx(role));
      await expect(caller.obterCadastro({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.salvarCadastro(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.testarRascunho(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(store.obterEasyLocalCadastro).not.toHaveBeenCalled();
      expect(store.salvarEasyLocalCadastro).not.toHaveBeenCalled();
      expect(store.prepararEasyLocalRascunho).not.toHaveBeenCalled();
    }
  );
  it("preserva confirmação central e não aceita SQL, TLS desligado ou identidade enviada", async () => {
    const caller = easyLocalRouter.createCaller(ctx("admin"));
    for (const bad of [
      { ...input, confirmarConexaoCentral: false },
      { ...input, tls: "nao" },
      { ...input, querySql: "SELECT 1" },
      { ...input, usuarioId: 9 },
    ]) {
      await expect(caller.salvarCadastro(bad as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(store.salvarEasyLocalCadastro).not.toHaveBeenCalled();
  });
  it("usa identidade autenticada para auditoria e nunca retorna o input", async () => {
    vi.mocked(store.salvarEasyLocalCadastro).mockResolvedValue({
      sucesso: true,
    });
    expect(
      await easyLocalRouter.createCaller(ctx("admin")).salvarCadastro(input)
    ).toEqual({ sucesso: true });
    expect(store.salvarEasyLocalCadastro).toHaveBeenCalledWith(input, 7);
  });
  it("testa rascunho sem salvar nem trocar configuração", async () => {
    vi.mocked(store.prepararEasyLocalRascunho).mockResolvedValue({
      host: input.host,
      port: 5432,
      user: input.usuario,
      database: input.banco,
      password: input.senha,
    });
    vi.mocked(testarConexaoComConfig).mockResolvedValue({
      status: "conectado",
    });
    expect(
      await easyLocalRouter.createCaller(ctx("admin")).testarRascunho(input)
    ).toEqual({ status: "conectado" });
    expect(store.salvarEasyLocalCadastro).not.toHaveBeenCalled();
  });
});
