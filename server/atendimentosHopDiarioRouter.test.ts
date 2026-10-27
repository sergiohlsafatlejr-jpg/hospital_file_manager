import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  resumo: vi.fn(), confirmar: vi.fn(), credencial: vi.fn(), prever: vi.fn(), publicar: vi.fn(), ativar: vi.fn(), pausar: vi.fn(), cookie: vi.fn(() => "sessao"),
}));
vi.mock("./atendimentosHopDiarioService", () => ({
  resumoAtendimentosHopDiario: fns.resumo,
  confirmarCargaAtendimentosHopDiario: fns.confirmar,
  gerarCredencialAtendimentosHopDiario: fns.credencial,
  preverAtendimentosHopDiario: fns.prever,
  publicarAtendimentosHopDiario: fns.publicar,
  ativarAtendimentosHopDiario: fns.ativar,
  pausarAtendimentosHopDiario: fns.pausar,
  sessionTokenFromCookie: fns.cookie,
}));
import { atendimentosHopDiarioRouter } from "./routers/atendimentosHopDiarioRouter";

const unit = { estabelecimentoId: 1260036 };
const confirmation = { ...unit, tokenPrevia: "token-sintetico", confirmarEspelhamento: true as const };
function context(role: "admin" | "user" | null, extra: Record<string, unknown> = {}): any {
  return { user: role ? { id: 19, role, openId: "synthetic", ...extra } : null, req: { headers: { cookie: "app_session_id=session" } }, res: {} };
}
describe("atendimentosHopDiarioRouter", () => {
  beforeEach(() => { vi.resetAllMocks(); for (const fn of Object.values(fns)) if (typeof fn === "function") (fn as any).mockResolvedValue?.({}); fns.cookie.mockReturnValue("sessao"); });
  it.each(["user", null] as const)("recusa %s antes de chamar o serviço", async role => {
    const caller = atendimentosHopDiarioRouter.createCaller(context(role));
    await expect(caller.resumo(unit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.prever(unit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fns.resumo).not.toHaveBeenCalled(); expect(fns.prever).not.toHaveBeenCalled();
  });
  it("recusa cron em todas as rotas administrativas", async () => {
    const caller = atendimentosHopDiarioRouter.createCaller(context("admin", { id: -1, isCron: true, taskUid: "private" }));
    await expect(caller.gerarCredencial(unit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fns.credencial).not.toHaveBeenCalled();
  });
  it("encaminha somente identidade administrativa e sessão decodificada", async () => {
    const caller = atendimentosHopDiarioRouter.createCaller(context("admin"));
    await caller.resumo(unit); await caller.confirmarCarga({ ...unit, confirmarCargaCompleta: true, confirmarHopParado: true });
    await caller.gerarCredencial(unit); await caller.prever(unit); await caller.publicar(confirmation); await caller.ativar(confirmation); await caller.pausar(unit);
    expect(fns.resumo).toHaveBeenCalledWith(unit, 19);
    expect(fns.confirmar).toHaveBeenCalledWith(expect.objectContaining(unit), 19);
    expect(fns.credencial).toHaveBeenCalledWith(unit, 19);
    expect(fns.prever).toHaveBeenCalledWith(unit, 19);
    expect(fns.publicar).toHaveBeenCalledWith(confirmation, 19);
    expect(fns.ativar).toHaveBeenCalledWith(confirmation, 19, "sessao");
    expect(fns.pausar).toHaveBeenCalledWith(unit, 19, "sessao");
  });
  it("rejeita destino, SQL, token de produtor e confirmações forjadas", async () => {
    const caller = atendimentosHopDiarioRouter.createCaller(context("admin"));
    for (const invalid of [
      { ...unit, tabela: "atendimentos_unificados" }, { ...unit, querySql: "SELECT segredo" }, { ...unit, producerToken: "segredo" },
      { ...unit, confirmarCargaCompleta: true, confirmarHopParado: false }, { ...confirmation, confirmarEspelhamento: false }, { estabelecimentoId: 999 },
    ]) {
      const method = "confirmarCargaCompleta" in invalid ? "confirmarCarga" : "tokenPrevia" in invalid ? "publicar" : "resumo";
      await expect((caller as any)[method](invalid)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(fns.resumo).not.toHaveBeenCalled(); expect(fns.publicar).not.toHaveBeenCalled();
  });
});
