import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  createSessionToken: vi.fn(),
  authenticateRequest: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInfo: mocks.getUserInfo,
    createSessionToken: mocks.createSessionToken,
    authenticateRequest: mocks.authenticateRequest,
  },
}));

vi.mock("./db", () => ({
  upsertUser: mocks.upsertUser,
  getUserByOpenId: mocks.getUserByOpenId,
}));

import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";

type CallbackParams = {
  code?: string;
  state?: string;
};

async function startOAuthApp(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.set("trust proxy", 1);
  registerOAuthRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Local OAuth test server did not expose a TCP port");
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestCallback(params: CallbackParams) {
  const { server, baseUrl } = await startOAuthApp();
  const query = new URLSearchParams();
  if (params.code !== undefined) query.set("code", params.code);
  if (params.state !== undefined) query.set("state", params.state);

  try {
    return await fetch(`${baseUrl}/api/oauth/callback?${query.toString()}`, {
      headers: { "x-forwarded-proto": "https" },
      redirect: "manual",
    });
  } finally {
    await closeServer(server);
  }
}

describe("homologação local do callback OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForToken.mockResolvedValue({ accessToken: "access-token-local" });
    mocks.getUserInfo.mockResolvedValue({
      openId: "oauth-user-local",
      name: "Usuário de Homologação",
      email: "usuario.homologacao@example.test",
      loginMethod: "email",
    });
    mocks.upsertUser.mockResolvedValue(undefined);
    mocks.getUserByOpenId.mockResolvedValue({ sessionVersion: 3 });
    mocks.createSessionToken.mockResolvedValue("session-token-local");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persiste a identidade e emite cookie de sessão host-only seguro após callback válido", async () => {
    const response = await requestCallback({ code: "authorization-code", state: "state-value" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${COOKIE_NAME}=session-token-local`);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*Secure/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(setCookie).toMatch(/;\s*Path=\//i);
    expect(setCookie).not.toMatch(/;\s*Domain=/i);
    expect(setCookie).toMatch(/;\s*Max-Age=31536000/i);

    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith("authorization-code", "state-value");
    expect(mocks.getUserInfo).toHaveBeenCalledWith("access-token-local");
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: "oauth-user-local",
      name: "Usuário de Homologação",
      email: "usuario.homologacao@example.test",
      loginMethod: "email",
      lastSignedIn: expect.any(Date),
    }));
    expect(mocks.createSessionToken).toHaveBeenCalledWith("oauth-user-local", {
      name: "Usuário de Homologação",
      expiresInMs: ONE_YEAR_MS,
      sessionVersion: 3,
    });
  });

  it("rejeita callback sem code ou state antes de chamar SDK ou banco", async () => {
    const withoutCode = await requestCallback({ state: "state-value" });
    expect(withoutCode.status).toBe(400);
    await expect(withoutCode.json()).resolves.toEqual({ error: "code and state are required" });

    const withoutState = await requestCallback({ code: "authorization-code" });
    expect(withoutState.status).toBe(400);
    await expect(withoutState.json()).resolves.toEqual({ error: "code and state are required" });

    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(mocks.upsertUser).not.toHaveBeenCalled();
  });

  it("recusa uma resposta de identidade sem openId sem persistir ou emitir sessão", async () => {
    mocks.getUserInfo.mockResolvedValue({ name: "Identidade sem openId" });

    const response = await requestCallback({ code: "authorization-code", state: "state-value" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "openId missing from user info" });
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it.each([
    ["troca do código", "exchangeCodeForToken"],
    ["leitura da identidade", "getUserInfo"],
    ["persistência", "upsertUser"],
    ["emissão da sessão", "createSessionToken"],
  ] as const)("redireciona causas internas distintas (%s) para callback_failed", async (_label, failingOperation) => {
    const internalError = new Error("detalhe interno não deve chegar ao cliente");
    mocks[failingOperation].mockRejectedValueOnce(internalError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestCallback({ code: "authorization-code", state: "state-value" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?auth_error=callback_failed");
    expect(consoleError).toHaveBeenCalledWith("[OAuth] Callback failed", internalError);
  });

  it("classifica somente uma falha 429 do SDK como rate_limit", async () => {
    const rateLimitError = Object.assign(new Error("serviço indisponível"), {
      response: { status: 429 },
    });
    mocks.exchangeCodeForToken.mockRejectedValueOnce(rateLimitError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestCallback({ code: "authorization-code", state: "state-value" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?auth_error=rate_limit");
    expect(consoleError).toHaveBeenCalledWith("[OAuth] Callback failed", rateLimitError);
  });
});

describe("createContext em falha de autenticação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mascara falha do SDK como usuário nulo e não atribui estabelecimento", async () => {
    mocks.authenticateRequest.mockRejectedValue(new Error("falha privada do provedor"));

    const context = await createContext({
      req: { headers: {} } as any,
      res: {} as any,
    });

    expect(context.user).toBeNull();
    expect(context.estabelecimentoId).toBeUndefined();
  });
});
