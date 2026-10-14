import { beforeEach, describe, expect, it, vi } from "vitest";
const fns = vi.hoisted(() => ({ prever: vi.fn(), executar: vi.fn() }));
vi.mock("./easyLocalImportacaoService", () => ({
  preverEasyLocalImportacao: fns.prever,
  executarEasyLocalImportacao: fns.executar,
}));
vi.mock("./easyLocalIntegradorService", () => ({
  criarEasyLocalTabela: vi.fn(),
  listarEasyLocalTabelas: vi.fn(),
  listarEasyLocalLeituras: vi.fn(),
  salvarEasyLocalLeitura: vi.fn(),
}));
vi.mock("./easyLocalMetadata", () => ({
  listarEasyLocalOrigens: vi.fn(),
  detectarEasyLocalCampos: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: vi.fn() }));
import { easyLocalIntegradorRouter } from "./routers/easyLocalIntegradorRouter";
function ctx(role: "admin" | "user" | null): any {
  return {
    user: role ? { id: 7, role, openId: "sintetico" } : null,
    req: { headers: {} },
    res: {},
  };
}
const alvo = { estabelecimentoId: 12, leituraId: 4 };
const executar = {
  ...alvo,
  tokenPrevia: "token-sintetico",
  confirmarImportacao: true as const,
};
describe("autorização de importação EASYLocal → Portal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fns.prever.mockResolvedValue({ registrosLidos: 0 });
    fns.executar.mockResolvedValue({ sucesso: true });
  });
  it.each(["user", null] as const)(
    "nega %s antes de acessar origem ou destino",
    async role => {
      const caller = easyLocalIntegradorRouter.createCaller(ctx(role));
      await expect(caller.preverImportacao(alvo)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.executarImportacao(executar)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(fns.prever).not.toHaveBeenCalled();
      expect(fns.executar).not.toHaveBeenCalled();
    }
  );
  it("propaga exclusivamente a identidade administrativa do servidor", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    await caller.preverImportacao(alvo);
    await caller.executarImportacao(executar);
    expect(fns.prever).toHaveBeenCalledWith(alvo, 7);
    expect(fns.executar).toHaveBeenCalledWith(executar, 7);
  });
  it("rejeita alvo livre, usuário impostado, SQL e credenciais", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    for (const extra of [
      { nomeTabela: "atendimentos_unificados" },
      { usuarioId: 9 },
      { querySql: "SELECT livre" },
      { password: "sintetico" },
    ]) {
      await expect(
        caller.preverImportacao({ ...alvo, ...extra } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.executarImportacao({ ...executar, ...extra } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(fns.prever).not.toHaveBeenCalled();
    expect(fns.executar).not.toHaveBeenCalled();
  });
  it("exige unidade, identificador e confirmação verdadeiros", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    for (const input of [
      { ...executar, estabelecimentoId: 0 },
      { ...executar, leituraId: -1 },
      { ...executar, confirmarImportacao: false },
      { ...alvo, confirmarImportacao: true },
      { ...executar, tokenPrevia: "" },
    ]) {
      await expect(
        caller.executarImportacao(input as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(fns.executar).not.toHaveBeenCalled();
  });
  it("sanitiza falhas desconhecidas sem retornar dados do driver", async () => {
    fns.prever.mockRejectedValue(
      new Error("erro_privado paciente_exemplo senha_exemplo")
    );
    await expect(
      easyLocalIntegradorRouter
        .createCaller(ctx("admin"))
        .preverImportacao(alvo)
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringMatching(
        /erro_privado|paciente_exemplo|senha_exemplo/
      ),
    });
  });
});
