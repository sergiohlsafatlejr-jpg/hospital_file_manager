import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  isResetTokenValid: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  validateNewPassword: vi.fn(),
  createSessionToken: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("./passwordAuthService", () => ({
  authenticateWithPassword: mocks.authenticateWithPassword,
  requestPasswordReset: mocks.requestPasswordReset,
  isResetTokenValid: mocks.isResetTokenValid,
  resetPasswordWithToken: mocks.resetPasswordWithToken,
  validateNewPassword: mocks.validateNewPassword,
}));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken } }));
vi.mock("./db", () => ({ getUserById: mocks.getUserById }));

import { passwordAuthRouter } from "./routers/passwordAuthRouter";

function createCaller() {
  const cookie = vi.fn();
  const caller = passwordAuthRouter.createCaller({
    user: null,
    req: {
      ip: "203.0.113.8",
      headers: { "x-forwarded-for": "203.0.113.8" },
      socket: { remoteAddress: "127.0.0.1" },
      protocol: "https",
      get: () => "portal.safatle.com.br",
    },
    res: { cookie },
  } as any);
  return { caller, cookie };
}

describe("passwordAuthRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateNewPassword.mockReturnValue(null);
  });

  it("cria cookie HttpOnly após login válido", async () => {
    mocks.authenticateWithPassword.mockResolvedValue({ success: true, user: { id: 7, openId: "manual_7", name: "Usuário", sessionVersion: 2 } });
    mocks.createSessionToken.mockResolvedValue("session-token");
    const { caller, cookie } = createCaller();
    await expect(caller.login({ email: "usuario@hospital.com.br", password: "PortalSeguro2026" })).resolves.toEqual({ success: true });
    expect(cookie).toHaveBeenCalledWith(expect.any(String), "session-token", expect.objectContaining({ httpOnly: true }));
    expect(mocks.createSessionToken).toHaveBeenCalledWith("manual_7", expect.objectContaining({ sessionVersion: 2 }));
  });

  it("não revela se o e-mail ou a senha está incorreto", async () => {
    mocks.authenticateWithPassword.mockResolvedValue({ success: false, rateLimited: false });
    const { caller } = createCaller();
    await expect(caller.login({ email: "desconhecido@hospital.com.br", password: "qualquer" })).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("responde de forma idêntica à solicitação de recuperação", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ accepted: true, rateLimited: false });
    const { caller } = createCaller();
    const result = await caller.requestReset({ email: "desconhecido@hospital.com.br" });
    expect(result.message).toBe("Se o e-mail estiver cadastrado, você receberá as instruções em alguns minutos.");
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("desconhecido@hospital.com.br", "203.0.113.8", "https://portal.safatle.com.br");
  });

  it("valida o token por mutation", async () => {
    mocks.isResetTokenValid.mockResolvedValue(true);
    const { caller } = createCaller();
    await expect(caller.validateResetToken({ token: "a".repeat(43) })).resolves.toEqual({ valid: true });
  });

  it("consome o token, cria a senha e autentica o usuário", async () => {
    mocks.resetPasswordWithToken.mockResolvedValue({ success: true, userId: 7, sessionVersion: 3 });
    mocks.getUserById.mockResolvedValue({ id: 7, openId: "manual_7", name: "Usuário" });
    mocks.createSessionToken.mockResolvedValue("new-session");
    const { caller, cookie } = createCaller();
    await expect(caller.resetPassword({ token: "b".repeat(43), newPassword: "PortalSeguro2026", confirmPassword: "PortalSeguro2026" })).resolves.toEqual({ success: true, message: "Senha criada com sucesso" });
    expect(cookie).toHaveBeenCalledWith(expect.any(String), "new-session", expect.objectContaining({ httpOnly: true }));
    expect(mocks.createSessionToken).toHaveBeenCalledWith("manual_7", expect.objectContaining({ sessionVersion: 3 }));
  });
});
