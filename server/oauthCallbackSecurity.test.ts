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
  },
}));
vi.mock("./db", () => ({
  upsertUser: mocks.upsertUser,
  getUserByOpenId: mocks.getUserByOpenId,
}));

import { registerOAuthRoutes } from "./_core/oauth";
import { COOKIE_NAME } from "../shared/const";
import {
  encodeOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "../shared/oauthState";

const callbackUri = "https://qa.example.invalid/api/oauth/callback";
const openId = "oauth-user-security";
const sessionToken = "session-token-security";

type CallbackRequest = {
  code?: string;
  state?: string;
  nonceCookie?: string;
};

function makeState(
  overrides: Partial<{
    nonce: string;
    issuedAt: number;
    redirectUri: string;
  }> = {}
) {
  const nonce = overrides.nonce ?? randomUUID();
  return {
    nonce,
    state: encodeOAuthState({
      nonce,
      issuedAt: overrides.issuedAt ?? Date.now(),
      redirectUri: overrides.redirectUri ?? callbackUri,
    }),
  };
}

function encodeUncheckedState(value: unknown) {
  return btoa(JSON.stringify(value));
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
  if (!address || typeof address === "string")
    throw new Error("OAuth test server did not expose a TCP port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function callback(request: CallbackRequest = {}) {
  const { server, baseUrl } = await startOAuthApp();
  const query = new URLSearchParams();
  if (request.code !== undefined) query.set("code", request.code);
  if (request.state !== undefined) query.set("state", request.state);

  try {
    return await fetch(`${baseUrl}/api/oauth/callback?${query.toString()}`, {
      headers: {
        "x-forwarded-proto": "https",
        ...(request.nonceCookie === undefined
          ? {}
          : { cookie: `${OAUTH_STATE_COOKIE}=${request.nonceCookie}` }),
      },
      redirect: "manual",
    });
  } finally {
    await closeServer(server);
  }
}

function validRequest(
  overrides: Partial<CallbackRequest> = {}
): CallbackRequest {
  const { state } = makeState();
  return {
    code: "authorization-code-security",
    state,
    nonceCookie: state,
    ...overrides,
  };
}

function expectInvalidState(response: Response) {
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "/login?auth_error=invalid_state"
  );
}

function expectCallbackFailure(
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

function expectNoProviderOrDatabaseCalls() {
  expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  expect(mocks.getUserInfo).not.toHaveBeenCalled();
  expect(mocks.upsertUser).not.toHaveBeenCalled();
  expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
  expect(mocks.createSessionToken).not.toHaveBeenCalled();
  expect(mocks.verifySession).not.toHaveBeenCalled();
}

function expectNoSessionCookie(response: Response) {
  expect(response.headers.get("set-cookie") ?? "").not.toContain(
    `${COOKIE_NAME}=`
  );
}

describe("segurança do callback OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForToken.mockResolvedValue({
      accessToken: "access-token-security",
    });
    mocks.getUserInfo.mockResolvedValue({
      openId,
      name: "Usuária Segura",
      email: "segura@example.test",
      loginMethod: "email",
      role: "admin",
    });
    mocks.upsertUser.mockResolvedValue(undefined);
    mocks.getUserByOpenId.mockResolvedValue({
      id: 1,
      openId,
      name: "Usuária Segura",
      email: "segura@example.test",
      loginMethod: "email",
      role: "user",
      sessionVersion: 3,
    });
    mocks.createSessionToken.mockResolvedValue(sessionToken);
    mocks.verifySession.mockResolvedValue({
      openId,
      appId: "qa-auth-app",
      name: "Usuária Segura",
      sessionVersion: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "nonce ausente no cookie",
      () => {
        const { state } = makeState();
        return { code: "authorization-code-security", state };
      },
    ],
    [
      "nonce diferente do estado",
      () => {
        const { state } = makeState();
        return {
          code: "authorization-code-security",
          state,
          nonceCookie: makeState().state,
        };
      },
    ],
    [
      "state base64 malformado",
      () => ({
        code: "authorization-code-security",
        state: "%%%not-base64%%%",
        nonceCookie: randomUUID(),
      }),
    ],
    [
      "state JSON malformado",
      () => ({
        code: "authorization-code-security",
        state: "bmFvLWUtanNvbg==",
        nonceCookie: randomUUID(),
      }),
    ],
    [
      "state expirado",
      () => {
        const value = makeState({
          issuedAt: Date.now() - OAUTH_STATE_TTL_SECONDS * 1000 - 1,
        });
        return {
          code: "authorization-code-security",
          state: value.state,
          nonceCookie: value.state,
        };
      },
    ],
    [
      "state muito no futuro",
      () => {
        const value = makeState({
          issuedAt: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000 + 1,
        });
        return {
          code: "authorization-code-security",
          state: value.state,
          nonceCookie: value.state,
        };
      },
    ],
  ])(
    "redireciona %s para invalid_state antes de SDK e banco",
    async (_case, requestFactory) => {
      const response = await callback(requestFactory());

      expectInvalidState(response);
      expectNoProviderOrDatabaseCalls();
    }
  );

  it.each([
    [
      "origem externa",
      { redirectUri: "https://evil.example/api/oauth/callback" },
    ],
    [
      "caminho diferente",
      { redirectUri: "https://qa.example.invalid/not-oauth" },
    ],
    [
      "query string",
      {
        redirectUri:
          "https://qa.example.invalid/api/oauth/callback?next=%2Fadmin",
      },
    ],
    [
      "credenciais na URL",
      {
        redirectUri:
          "https://user:secret@qa.example.invalid/api/oauth/callback",
      },
    ],
    ["formato legado", { redirectUri: "https://qa.example.invalid/" }],
  ])("rejeita state com redirect URI inválido: %s", async (_case, payload) => {
    const nonce = randomUUID();
    const issuedAt = Date.now();
    const originalState = encodeUncheckedState({
      nonce,
      issuedAt,
      redirectUri: callbackUri,
    });
    const state = encodeUncheckedState({ nonce, issuedAt, ...payload });

    const response = await callback({
      code: "authorization-code-security",
      state,
      nonceCookie: originalState,
    });

    expectInvalidState(response);
    expectNoProviderOrDatabaseCalls();
  });

  it("não aceita alterar o instante mantendo o nonce e o cookie da tentativa original", async () => {
    const nonce = randomUUID();
    const issuedAt = Date.now();
    const originalState = encodeOAuthState({
      nonce,
      issuedAt,
      redirectUri: callbackUri,
    });
    const altered = encodeOAuthState({
      nonce,
      issuedAt: issuedAt + 1,
      redirectUri: callbackUri,
    });
    const response = await callback({
      code: "authorization-code-security",
      state: altered,
      nonceCookie: originalState,
    });
    expectInvalidState(response);
    expectNoProviderOrDatabaseCalls();
  });

  it("não começa operações para código excessivamente longo, ainda que o state e cookie sejam válidos", async () => {
    const response = await callback(validRequest({ code: "c".repeat(4097) }));

    expectInvalidState(response);
    expectNoProviderOrDatabaseCalls();
  });

  it("no sucesso confirma a identidade persistida, verifica a sessão e emite somente cookie seguro host-only", async () => {
    const response = await callback(validRequest());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/selecionar-estabelecimento"
    );
    expect(mocks.getUserByOpenId).toHaveBeenCalledWith(openId);
    expect(mocks.createSessionToken).toHaveBeenCalledWith(
      openId,
      expect.objectContaining({ sessionVersion: 3 })
    );
    expect(mocks.verifySession).toHaveBeenCalledWith(sessionToken);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=${sessionToken}`);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*Secure/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(setCookie).toMatch(/;\s*Path=\//i);
    expect(setCookie).not.toMatch(/;\s*Domain=/i);
  });

  it.each([
    ["id ausente", { openId, name: "Usuária Segura", sessionVersion: 3 }],
    [
      "id não positivo",
      { id: 0, openId, name: "Usuária Segura", sessionVersion: 3 },
    ],
    [
      "openId persistido diferente",
      {
        id: 1,
        openId: "other-open-id",
        name: "Usuária Segura",
        sessionVersion: 3,
      },
    ],
  ])(
    "falha no estágio persist quando a confirmação do usuário tem %s, sem emitir cookie de sessão",
    async (_case, persistedUser) => {
      mocks.getUserByOpenId.mockResolvedValueOnce(persistedUser);

      const response = await callback(validRequest());

      expectCallbackFailure(response, "persist");
      expect(mocks.createSessionToken).not.toHaveBeenCalled();
      expect(mocks.verifySession).not.toHaveBeenCalled();
      expectNoSessionCookie(response);
    }
  );

  it.each([
    ["sessão SDK nula", null],
    [
      "appId diferente",
      {
        openId,
        appId: "another-app",
        name: "Usuária Segura",
        sessionVersion: 3,
      },
    ],
    [
      "sessionVersion diferente",
      {
        openId,
        appId: "qa-auth-app",
        name: "Usuária Segura",
        sessionVersion: 4,
      },
    ],
    [
      "openId diferente",
      {
        openId: "other-open-id",
        appId: "qa-auth-app",
        name: "Usuária Segura",
        sessionVersion: 3,
      },
    ],
  ])(
    "não emite cookie se a verificação da nova sessão retorna %s",
    async (_case, verifiedSession) => {
      mocks.verifySession.mockResolvedValueOnce(verifiedSession);

      const response = await callback(validRequest());

      expectCallbackFailure(response, "session");
      expectNoSessionCookie(response);
    }
  );

  it.each([
    ["vazio", ""],
    ["apenas espaços", "   "],
  ])(
    "trata token de acesso %s como falha de exchange antes de buscar identidade",
    async (_case, accessToken) => {
      mocks.exchangeCodeForToken.mockResolvedValueOnce({ accessToken });

      const response = await callback(validRequest());

      expectCallbackFailure(response, "exchange");
      expect(mocks.getUserInfo).not.toHaveBeenCalled();
      expect(mocks.upsertUser).not.toHaveBeenCalled();
      expectNoSessionCookie(response);
    }
  );

  it.each([
    ["openId ausente", { name: "Sem identidade" }],
    ["identidade cron", { openId: "cron_automated", name: "Tarefa" }],
  ])(
    "bloqueia %s no estágio identity antes de persistir ou emitir sessão",
    async (_case, userInfo) => {
      mocks.getUserInfo.mockResolvedValueOnce(userInfo);

      const response = await callback(validRequest());

      expectCallbackFailure(response, "identity");
      expect(mocks.upsertUser).not.toHaveBeenCalled();
      expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
      expect(mocks.createSessionToken).not.toHaveBeenCalled();
      expectNoSessionCookie(response);
    }
  );

  it("usa o nome persistido quando o provedor não fornece nome e preserva email e loginMethod ausentes", async () => {
    mocks.getUserInfo.mockResolvedValueOnce({
      openId,
      name: "  ",
      role: "admin",
    });
    mocks.getUserByOpenId.mockResolvedValueOnce({
      id: 1,
      openId,
      name: "Nome Persistido",
      email: "preservar@example.test",
      loginMethod: "google",
      role: "user",
      sessionVersion: 3,
    });

    const response = await callback(validRequest());

    expect(response.status).toBe(302);
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      openId,
      lastSignedIn: expect.any(Date),
    });
    expect(mocks.createSessionToken).toHaveBeenCalledWith(
      openId,
      expect.objectContaining({
        name: "Nome Persistido",
        sessionVersion: 3,
      })
    );
    expect(mocks.upsertUser.mock.calls[0][0]).not.toHaveProperty("role");
  });

  it("usa Usuário do Portal se nome do provedor e nome persistido estiverem vazios, sem afrouxar a verificação da sessão", async () => {
    mocks.getUserInfo.mockResolvedValueOnce({ openId, name: "" });
    mocks.getUserByOpenId.mockResolvedValueOnce({
      id: 1,
      openId,
      name: "   ",
      sessionVersion: 3,
    });
    mocks.verifySession.mockResolvedValueOnce({
      openId,
      appId: "qa-auth-app",
      name: "Usuário do Portal",
      sessionVersion: 3,
    });

    const response = await callback(validRequest());

    expect(response.status).toBe(302);
    expect(mocks.createSessionToken).toHaveBeenCalledWith(
      openId,
      expect.objectContaining({ name: "Usuário do Portal" })
    );
    expect(mocks.verifySession).toHaveBeenCalledWith(sessionToken);
  });

  it.each([
    ["exchange", "exchangeCodeForToken"],
    ["identity", "getUserInfo"],
    ["persist", "upsertUser"],
    ["session", "createSessionToken"],
  ] as const)(
    "redireciona falha de %s com log estritamente allowlisted",
    async (stage, failingMock) => {
      const secret =
        "token=very-secret email=private@example.test SELECT * FROM users state=raw-state";
      mocks[failingMock].mockRejectedValueOnce(
        Object.assign(new Error(secret), {
          code: "ERR_BAD_RESPONSE",
          token: "very-secret-token",
          sql: "SELECT email FROM users",
          email: "private@example.test",
          state: "raw-state",
        })
      );
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await callback(validRequest());

      expectCallbackFailure(response, stage);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        "[OAuth] Callback failed",
        expect.any(Object)
      );
      const details = log.mock.calls[0][1] as Record<string, unknown>;
      expect(Object.keys(details).sort()).toEqual([
        "code",
        "reference",
        "stage",
      ]);
      expect(details).toEqual({
        reference: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        stage,
        code: "ERR_BAD_RESPONSE",
      });
      expect(JSON.stringify(details)).not.toContain("very-secret");
      expect(JSON.stringify(details)).not.toContain("private@example.test");
      expect(JSON.stringify(details)).not.toContain("SELECT");
      expect(JSON.stringify(details)).not.toContain("raw-state");
    }
  );

  it("classifica rate_limit somente por httpStatus 429, nunca por palavras na mensagem", async () => {
    mocks.exchangeCodeForToken.mockRejectedValueOnce(
      new Error("rate limit exceeded, but no HTTP status")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const wordOnly = await callback(validRequest());
    expectCallbackFailure(wordOnly, "exchange", "callback_failed");
    expect(log.mock.calls[0][1]).toEqual(
      expect.objectContaining({ code: "UNCLASSIFIED", stage: "exchange" })
    );

    mocks.exchangeCodeForToken.mockRejectedValueOnce(
      Object.assign(new Error("sem palavras especiais"), {
        response: { status: 429 },
      })
    );
    const status429 = await callback(validRequest());
    expectCallbackFailure(status429, "exchange", "rate_limit");
    expect(log.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        code: "UNCLASSIFIED",
        stage: "exchange",
        httpStatus: 429,
      })
    );
  });
});
