import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import {
  decodeOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "../shared/oauthState";

const mocks = vi.hoisted(() => ({
  setData: vi.fn(),
  invalidate: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: { me: { setData: mocks.setData, invalidate: mocks.invalidate } },
    }),
    auth: {
      me: {
        useQuery: () => ({
          data: null,
          isLoading: true,
          error: null,
          refetch: mocks.refetch,
        }),
      },
      logout: {
        useMutation: () => ({
          isPending: false,
          error: null,
          mutateAsync: mocks.mutateAsync,
        }),
      },
    },
  },
}));

const ORIGINAL_WINDOW = globalThis.window;
const ORIGINAL_DOCUMENT = globalThis.document;
const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

describe("início do login OAuth no frontend", () => {
  const randomUUID = vi.fn();
  const assign = vi.fn();
  const assignedCookies: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://oauth.example.test");
    vi.stubEnv("VITE_APP_ID", "portal-safatle");
    vi.spyOn(Date, "now").mockReturnValue(1_735_689_600_000);
    assign.mockReset();
    randomUUID.mockReset();
    randomUUID.mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
    assignedCookies.length = 0;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { origin: "https://app.example.test", assign },
        crypto: { randomUUID },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        set cookie(value: string) {
          assignedCookies.push(value);
        },
      },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { setItem: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: ORIGINAL_WINDOW,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: ORIGINAL_DOCUMENT,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: ORIGINAL_LOCAL_STORAGE,
    });
  });

  it("cria nonce, estado codificado e cookie host-only seguro ao iniciar login", async () => {
    const { startLogin } = await import("../client/src/const");

    expect(startLogin()).toBe(true);
    const loginUrl = new URL(assign.mock.calls[0][0]);
    const state = loginUrl.searchParams.get("state");

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(loginUrl.origin).toBe("https://oauth.example.test");
    expect(loginUrl.pathname).toBe("/app-auth");
    expect(loginUrl.searchParams.get("appId")).toBe("portal-safatle");
    expect(loginUrl.searchParams.get("redirectUri")).toBe(
      "https://app.example.test/api/oauth/callback"
    );
    expect(loginUrl.searchParams.get("type")).toBe("signIn");
    expect(decodeOAuthState(state)).toEqual({
      redirectUri: "https://app.example.test/api/oauth/callback",
      nonce: "123e4567-e89b-42d3-a456-426614174000",
      issuedAt: 1_735_689_600_000,
    });
    expect(assignedCookies).toEqual([
      expect.stringContaining(`${OAUTH_STATE_COOKIE}=${state}`),
    ]);
    expect(assignedCookies[0]).toContain("; Path=/");
    expect(assignedCookies[0]).toContain(
      `; Max-Age=${OAUTH_STATE_TTL_SECONDS}`
    );
    expect(assignedCookies[0]).toContain("; Secure");
    expect(assignedCookies[0]).toContain("; SameSite=None");
    expect(assignedCookies[0]).not.toMatch(/;\s*Domain=/i);
  });

  it("queries e mutations não autenticadas no mesmo tick iniciam uma única navegação", async () => {
    const { redirectToLoginIfUnauthorized } = await import(
      "../client/src/lib/authRedirect"
    );
    const queryError = new TRPCClientError(UNAUTHED_ERR_MSG);
    const mutationError = new TRPCClientError(UNAUTHED_ERR_MSG);
    expect(redirectToLoginIfUnauthorized(queryError)).toBe(true);
    const cookie = assignedCookies[0];
    expect(redirectToLoginIfUnauthorized(mutationError)).toBe(false);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assignedCookies).toEqual([cookie]);
  });

  it("preserva a rota local personalizada sem gerar nonce ou cookie OAuth", async () => {
    const { startLogin } = await import("../client/src/const");
    expect(startLogin("/login")).toBe(true);
    expect(assign).toHaveBeenCalledWith("/login");
    expect(randomUUID).not.toHaveBeenCalled();
    expect(assignedCookies).toEqual([]);
  });

  it("não redireciona por um erro diferente de autenticação", async () => {
    const { redirectToLoginIfUnauthorized } = await import(
      "../client/src/lib/authRedirect"
    );
    expect(
      redirectToLoginIfUnauthorized(new TRPCClientError("Outro erro"))
    ).toBe(false);
    expect(redirectToLoginIfUnauthorized(new Error(UNAUTHED_ERR_MSG))).toBe(
      false
    );
    expect(assign).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("permite nova tentativa se a navegação anterior lançou um erro", async () => {
    const { startLogin } = await import("../client/src/const");
    assign.mockImplementationOnce(() => {
      throw new Error("QA_NAVIGATION_FAILED");
    });
    expect(() => startLogin()).toThrow("QA_NAVIGATION_FAILED");
    expect(startLogin()).toBe(true);
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it("não cria nonce durante a renderização de useAuth", async () => {
    const { useAuth } = await import("../client/src/_core/hooks/useAuth");

    function Probe() {
      useAuth({ redirectOnUnauthenticated: true });
      return null;
    }

    renderToStaticMarkup(createElement(Probe));

    expect(randomUUID).not.toHaveBeenCalled();
    expect(assignedCookies).toEqual([]);
  });
});
