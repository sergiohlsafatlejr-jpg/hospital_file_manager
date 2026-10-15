import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  listar: vi.fn(),
  prever: vi.fn(),
  ativar: vi.fn(),
  pausar: vi.fn(),
  retomar: vi.fn(),
  cookie: vi.fn((value: string | undefined) =>
    value?.match(/app_session_id=([^;]+)/)?.[1] ? decodeURIComponent(value.match(/app_session_id=([^;]+)/)![1]) : ""
  ),
}));

vi.mock("./easyLocalAgendamentoService", () => ({
  listarEasyLocalAgendamentos: fns.listar,
  preverEasyLocalAgendamento: fns.prever,
  ativarEasyLocalAgendamento: fns.ativar,
  pausarEasyLocalAgendamento: fns.pausar,
  retomarEasyLocalAgendamento: fns.retomar,
  sessionTokenFromCookie: fns.cookie,
}));

import { easyLocalAgendamentoRouter } from "./routers/easyLocalAgendamentoRouter";

function context(role: "admin" | "user" | null, extra: Record<string, unknown> = {}): any {
  return {
    user: role ? { id: 41, role, openId: "synthetic", ...extra } : null,
    req: { headers: { cookie: "app_session_id=jwt%2Edecoded; other=value" } },
    res: {},
  };
}

const unit = { estabelecimentoId: 12 };
const preview = { ...unit, leituraId: 7, frequencia: "15min" as const };
const activate = { ...unit, leituraId: 7, tokenPrevia: "signed-preview", confirmarAgendamento: true as const };
const action = { ...unit, agendamentoId: 99 };

describe("easyLocalAgendamentoRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fns.cookie.mockImplementation((value: string | undefined) =>
      value?.match(/app_session_id=([^;]+)/)?.[1]
        ? decodeURIComponent(value.match(/app_session_id=([^;]+)/)![1])
        : ""
    );
    fns.listar.mockResolvedValue([]);
    fns.prever.mockResolvedValue({});
    fns.ativar.mockResolvedValue({});
    fns.pausar.mockResolvedValue({});
    fns.retomar.mockResolvedValue({});
  });

  it.each(["user", null] as const)("nega %s antes de tocar no serviço", async role => {
    const caller = easyLocalAgendamentoRouter.createCaller(context(role));
    await expect(caller.listar(unit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.prever(preview)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.ativar(activate)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fns.listar).not.toHaveBeenCalled();
    expect(fns.prever).not.toHaveBeenCalled();
    expect(fns.ativar).not.toHaveBeenCalled();
  });

  it("nega a identidade cron mesmo que algum contexto a marque como admin", async () => {
    const caller = easyLocalAgendamentoRouter.createCaller(
      context("admin", { id: -1, isCron: true, taskUid: "cron-private" })
    );
    await expect(caller.listar(unit)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fns.listar).not.toHaveBeenCalled();
  });

  it("encaminha somente a identidade administrativa e o cookie decodificado", async () => {
    const caller = easyLocalAgendamentoRouter.createCaller(context("admin"));
    await caller.listar(unit);
    await caller.prever(preview);
    await caller.ativar(activate);
    await caller.pausar(action);
    await caller.retomar(action);
    expect(fns.listar).toHaveBeenCalledWith(unit, 41);
    expect(fns.prever).toHaveBeenCalledWith(preview, 41);
    expect(fns.cookie).toHaveBeenCalledWith("app_session_id=jwt%2Edecoded; other=value");
    expect(fns.ativar).toHaveBeenCalledWith(activate, 41, "jwt.decoded");
    expect(fns.pausar).toHaveBeenCalledWith(action, 41, "jwt.decoded");
    expect(fns.retomar).toHaveBeenCalledWith(action, 41, "jwt.decoded");
  });

  it("rejeita dados livres, ids inválidos e confirmações falsas antes do serviço", async () => {
    const caller = easyLocalAgendamentoRouter.createCaller(context("admin"));
    for (const invalid of [
      { ...preview, querySql: "SELECT * FROM users" },
      { ...preview, usuarioId: 1 },
      { ...activate, confirmarAgendamento: false },
      { ...activate, leituraId: 0 },
      { ...action, agendamentoId: -2 },
    ]) {
      const method = "tokenPrevia" in invalid ? "ativar" : "frequencia" in invalid ? "prever" : "pausar";
      await expect((caller as any)[method](invalid)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(fns.prever).not.toHaveBeenCalled();
    expect(fns.ativar).not.toHaveBeenCalled();
    expect(fns.pausar).not.toHaveBeenCalled();
  });
});
