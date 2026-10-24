import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeOAuthState,
  encodeOAuthState,
  isOAuthStateFresh,
  OAUTH_STATE_TTL_SECONDS,
} from "../shared/oauthState";
import { describeAuthFailure } from "./authDiagnostics";

const oauthHttp = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => oauthHttp } }));
vi.mock("./db", () => ({ getUserByOpenId: vi.fn(), upsertUser: vi.fn() }));
vi.mock("./_core/env", () => ({
  ENV: {
    appId: "qa-auth-app",
    cookieSecret: "qa-only-secret-never-used-in-production",
    oAuthServerUrl: "https://provider.example.invalid",
  },
}));
import { sdk } from "./_core/sdk";

const state = {
  redirectUri: "https://qa.example.invalid/api/oauth/callback",
  nonce: "7c10e8d5-50fd-4018-90e4-e6c74d0b2b84",
  issuedAt: 1_792_835_800_000,
};

describe("contrato seguro do estado OAuth", () => {
  it("faz roundtrip apenas do endereço, nonce e instante de início", () => {
    expect(decodeOAuthState(encodeOAuthState(state))).toEqual(state);
  });
  it.each([
    undefined,
    null,
    "",
    "%%%",
    "YQ==",
    "a".repeat(5000),
    btoa("null"),
    btoa("[]"),
    btoa(JSON.stringify("https://qa.example.invalid/api/oauth/callback")),
  ])("malformado falha fechado sem lançar (%s)", invalid => {
    expect(() => decodeOAuthState(invalid)).not.toThrow();
    expect(decodeOAuthState(invalid)).toBeNull();
  });
  it.each([
    { ...state, nonce: "texto-arbitrario" },
    { ...state, issuedAt: 0 },
    { ...state, issuedAt: "hoje" },
    { ...state, issuedAt: 2.5 },
    { ...state, redirectUri: "javascript:alert(1)" },
    { ...state, redirectUri: "http://qa.example.invalid/api/oauth/callback" },
    {
      ...state,
      redirectUri:
        "https://user:password@qa.example.invalid/api/oauth/callback",
    },
    {
      ...state,
      redirectUri:
        "https://qa.example.invalid/api/oauth/callback?destino=externo",
    },
    {
      ...state,
      redirectUri: "https://qa.example.invalid/api/oauth/callback#fragment",
    },
    { ...state, redirectUri: "https://qa.example.invalid/outra-rota" },
    { ...state, extra: "não permitido" },
  ])("rejeita estrutura ou endereço inválido", invalid => {
    expect(decodeOAuthState(btoa(JSON.stringify(invalid)))).toBeNull();
  });
  it("valida o limite de dez minutos e tolera somente pequena diferença de relógio", () => {
    expect(isOAuthStateFresh(state, state.issuedAt)).toBe(true);
    expect(
      isOAuthStateFresh(state, state.issuedAt + OAUTH_STATE_TTL_SECONDS * 1000)
    ).toBe(true);
    expect(
      isOAuthStateFresh(
        state,
        state.issuedAt + OAUTH_STATE_TTL_SECONDS * 1000 + 1
      )
    ).toBe(false);
    expect(isOAuthStateFresh(state, state.issuedAt - 30_001)).toBe(false);
  });
});

describe("SDK real: estado e assinatura", () => {
  beforeEach(() => oauthHttp.post.mockReset());
  it("troca código com o endereço validado, sem enviar JSON/state como redirectUri", async () => {
    oauthHttp.post.mockResolvedValue({ data: { accessToken: "qa-token" } });
    const encoded = encodeOAuthState(state);
    await sdk.exchangeCodeForToken("qa-code", encoded);
    expect(oauthHttp.post).toHaveBeenCalledWith(expect.any(String), {
      clientId: "qa-auth-app",
      grantType: "authorization_code",
      code: "qa-code",
      redirectUri: state.redirectUri,
    });
  });
  it("estado inválido não chama o provedor", async () => {
    await expect(sdk.exchangeCodeForToken("qa-code", "%%%")).rejects.toThrow(
      "Estado de autenticação inválido"
    );
    expect(oauthHttp.post).not.toHaveBeenCalled();
  });
  it("nome de apresentação seguro gera uma sessão que o verificador real aceita", async () => {
    const token = await sdk.createSessionToken("qa-user", {
      name: "Usuário do Portal",
      sessionVersion: 3,
    });
    await expect(sdk.verifySession(token)).resolves.toMatchObject({
      openId: "qa-user",
      appId: "qa-auth-app",
      name: "Usuário do Portal",
      sessionVersion: 3,
    });
  });
  it("continua rejeitando token inválido e nome vazio, sem relaxar a autenticação", async () => {
    const token = await sdk.createSessionToken("qa-user", { name: "" });
    await expect(sdk.verifySession(token)).resolves.toBeNull();
    await expect(sdk.verifySession("not-a-token")).resolves.toBeNull();
  });
});

describe("diagnóstico sem dados pessoais", () => {
  it("extrai somente código allowlisted e HTTP do erro ou causa Drizzle", () => {
    const error = {
      message: "sql senha paciente",
      config: { secret: "credencial" },
      response: { status: 503, data: { token: "privado" } },
      cause: { code: "ER_BAD_FIELD_ERROR", sql: "sql-sensivel" },
    };
    expect(describeAuthFailure(error)).toEqual({
      code: "ER_BAD_FIELD_ERROR",
      httpStatus: 503,
    });
  });
  it("não retorna códigos livres, mensagens, strings ou status malformados", () => {
    expect(
      describeAuthFailure({
        code: "PACIENTE_OU_TOKEN",
        response: { status: "429" },
        message: "rate exceeded",
      })
    ).toEqual({ code: "UNCLASSIFIED" });
    expect(describeAuthFailure("token privado")).toEqual({
      code: "UNCLASSIFIED",
    });
    expect(describeAuthFailure(null)).toEqual({ code: "UNCLASSIFIED" });
  });
});
