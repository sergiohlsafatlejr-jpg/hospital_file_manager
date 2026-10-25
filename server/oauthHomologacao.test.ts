import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockENV = vi.hoisted(() => ({ appId: "qa-auth-app" }));
const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  createSessionToken: vi.fn(),
  verifySession: vi.fn(),
  authenticateRequest: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./_core/env", () => ({ ENV: mockENV }));
vi.mock("./_core/sdk", () => ({
  sdk: {
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInfo: mocks.getUserInfo,
    createSessionToken: mocks.createSessionToken,
    verifySession: mocks.verifySession,
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
import { encodeOAuthState, OAUTH_STATE_COOKIE } from "../shared/oauthState";

type CallbackParams = {
  code?: string;
  state?: string;
  cookie?: string;
};

const callbackUri = "https://qa.example.invalid/api/oauth/callback";

function createCallbackState() {
  const nonce = randomUUID();
  return {
    nonce,
    state: encodeOAuthState({
      nonce,
      issuedAt: Date.now(),
      redirectUri: callbackUri,
    }),
  };
}

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
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function requestCallback(params: CallbackParams) {
  const { server, baseUrl } = await startOAuthApp();
  const query = new URLSearchParams();
  if (params.code !== undefined) query.set("code", params.code);
  if (params.state !== undefined) query.set("state", params.state);

  try {
    return await fetch(`${baseUrl}/api/oauth/callback?${query.toString()}`, {
      headers: {
        "x-forwarded-proto": "https",
        ...(params.cookie ? { cookie: params.cookie } : {}),
      },
      redirect: "manual",
    });
  } finally {
    await closeServer(server);
  }
}

function validCallbackParams(
  overrides: Partial<CallbackParams> = {}
): CallbackParams {
  const { state } = createCallbackState();
  return {
    code: "authorization-code",
    state,
    cookie: `${OAUTH_STATE_COOKIE}=${state}`,
    ...overrides,
  };
}

function expectFailureLocation(
  response: Response,
  stage: string,
  error = "callback_failed"
) {
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const url = new URL(location!, "https://qa.example.invalid");
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("auth_error")).toBe(error);
  expect(url.searchParams.get("auth_stage")).toBe(stage);
  expect(url.searchParams.get("auth_ref")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
}

describe("homologação local do callback OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForToken.mockResolvedValue({
      accessToken: "access-token-local",
    });
    mocks.getUserInfo.mockResolvedValue({
      openId: "oauth-user-local",
      name: "Usuário de Homologação",
      email: "usuario.homologacao@example.test",
      loginMethod: "email",
    });
    mocks.upsertUser.mockResolvedValue(undefined);
    mocks.getUserByOpenId.mockResolvedValue({
      id: 1,
      openId: "oauth-user-local",
      name: "Usuário de Homologação",
      sessionVersion: 3,
    });
    mocks.createSessionToken.mockResolvedValue("session-token-local");
    mocks.verifySession.mockResolvedValue({
      openId: "oauth-user-local",
      appId: "qa-auth-app",
      name: "Usuário de Homologação",
      sessionVersion: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persiste a identidade confirmada e emite cookie de sessão host-only seguro após callback válido", async () => {
    const response = await requestCallback(validCallbackParams());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/selecionar-estabelecimento"
    );
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${COOKIE_NAME}=session-token-local`);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*Secure/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(setCookie).toMatch(/;\s*Path=\//i);
    expect(setCookie).not.toMatch(/;\s*Domain=/i);
    expect(setCookie).toMatch(/;\s*Max-Age=31536000/i);

    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
      "authorization-code",
      expect.any(String)
    );
    expect(mocks.getUserInfo).toHaveBeenCalledWith("access-token-local");
    expect(mocks.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "oauth-user-local",
        name: "Usuário de Homologação",
        email: "usuario.homologacao@example.test",
        loginMethod: "email",
        lastSignedIn: expect.any(Date),
      })
    );
    expect(mocks.getUserByOpenId).toHaveBeenCalledWith("oauth-user-local");
    expect(mocks.createSessionToken).toHaveBeenCalledWith("oauth-user-local", {
      name: "Usuário de Homologação",
      expiresInMs: ONE_YEAR_MS,
      sessionVersion: 3,
    });
    expect(mocks.verifySession).toHaveBeenCalledWith("session-token-local");
  });

  it("rejeita callback sem code ou state antes de chamar SDK ou banco", async () => {
    const valid = validCallbackParams();
    const withoutCode = await requestCallback({
      state: valid.state,
      cookie: valid.cookie,
    });
    expect(withoutCode.status).toBe(400);
    await expect(withoutCode.json()).resolves.toEqual({
      error: "code and state are required",
    });

    const withoutState = await requestCallback({
      code: "authorization-code",
      cookie: valid.cookie,
    });
    expect(withoutState.status).toBe(400);
    await expect(withoutState.json()).resolves.toEqual({
      error: "code and state are required",
    });

    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(mocks.getUserInfo).not.toHaveBeenCalled();
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
    expect(mocks.verifySession).not.toHaveBeenCalled();
  });

  it("recusa uma resposta de identidade sem openId sem persistir ou emitir sessão", async () => {
    mocks.getUserInfo.mockResolvedValue({ name: "Identidade sem openId" });

    const response = await requestCallback(validCallbackParams());

    expectFailureLocation(response, "identity");
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
    expect(mocks.verifySession).not.toHaveBeenCalled();
  });

  it.each([
    ["troca do código", "exchangeCodeForToken", "exchange"],
    ["leitura da identidade", "getUserInfo", "identity"],
    ["persistência", "upsertUser", "persist"],
    ["emissão da sessão", "createSessionToken", "session"],
  ] as const)(
    "redireciona causas internas distintas (%s) para callback_failed com estágio e referência",
    async (_label, failingOperation, stage) => {
      const internalError = new Error(
        "detalhe interno não deve chegar ao cliente"
      );
      mocks[failingOperation].mockRejectedValueOnce(internalError);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await requestCallback(validCallbackParams());

      expectFailureLocation(response, stage);
      expect(consoleError).toHaveBeenCalledWith(
        "[OAuth] Callback failed",
        expect.objectContaining({
          reference: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          stage,
          code: "UNCLASSIFIED",
        })
      );
    }
  );

  it("classifica somente uma falha HTTP 429 do SDK como rate_limit", async () => {
    const rateLimitError = Object.assign(new Error("serviço indisponível"), {
      response: { status: 429 },
    });
    mocks.exchangeCodeForToken.mockRejectedValueOnce(rateLimitError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await requestCallback(validCallbackParams());

    expectFailureLocation(response, "exchange", "rate_limit");
    expect(consoleError).toHaveBeenCalledWith(
      "[OAuth] Callback failed",
      expect.objectContaining({
        stage: "exchange",
        code: "UNCLASSIFIED",
        httpStatus: 429,
      })
    );
  });
});

describe("createContext em falha de autenticação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mascara falha do SDK como usuário nulo e não atribui estabelecimento", async () => {
    mocks.authenticateRequest.mockRejectedValue(
      new Error("falha privada do provedor")
    );

    const context = await createContext({
      req: { headers: {} } as any,
      res: {} as any,
    });

    expect(context.user).toBeNull();
    expect(context.estabelecimentoId).toBeUndefined();
  });
});
