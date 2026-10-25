import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  decodeOAuthState,
  isOAuthStateFresh,
  OAUTH_STATE_COOKIE,
} from "@shared/oauthState";
import { parse as parseCookieHeader } from "cookie";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { describeAuthFailure } from "../authDiagnostics";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

type OAuthStage = "exchange" | "identity" | "persist" | "session";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function validateState(req: Request, rawState: string): boolean {
  try {
    const state = decodeOAuthState(rawState);
    const expected = parseCookieHeader(req.headers.cookie ?? "")[
      OAUTH_STATE_COOKIE
    ];
    const savedState = decodeOAuthState(expected);
    if (!state || !expected || !savedState || !isOAuthStateFresh(state))
      return false;
    // Origem, instante e nonce devem ser exatamente aqueles iniciados neste navegador.
    const left = Buffer.from(rawState);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function failure(code: string): Error {
  return Object.assign(new Error("Autenticação não concluída"), { code });
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    if (code.length > 4096 || !validateState(req, state)) {
      res.redirect(302, "/login?auth_error=invalid_state");
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });

    let stage: OAuthStage = "exchange";
    const reference = randomUUID();
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      if (
        !tokenResponse ||
        typeof tokenResponse.accessToken !== "string" ||
        !tokenResponse.accessToken.trim()
      ) {
        throw failure("OAUTH_TOKEN_MISSING");
      }
      stage = "identity";
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (
        !userInfo ||
        typeof userInfo.openId !== "string" ||
        !userInfo.openId.trim() ||
        userInfo.openId.startsWith("cron_")
      ) {
        throw failure("OAUTH_IDENTITY_INVALID");
      }

      stage = "persist";
      // Metadados ausentes no provedor não devem apagar os dados da conta existente.
      const providerName =
        typeof userInfo.name === "string" ? userInfo.name.trim() : "";
      const providerEmail =
        typeof userInfo.email === "string" && userInfo.email.trim()
          ? userInfo.email.trim()
          : undefined;
      const providerMethod =
        typeof userInfo.loginMethod === "string" && userInfo.loginMethod.trim()
          ? userInfo.loginMethod
          : typeof userInfo.platform === "string" && userInfo.platform.trim()
            ? userInfo.platform
            : undefined;
      await db.upsertUser({
        openId: userInfo.openId,
        ...(providerName ? { name: providerName } : {}),
        ...(providerEmail ? { email: providerEmail } : {}),
        ...(providerMethod ? { loginMethod: providerMethod } : {}),
        lastSignedIn: new Date(),
      });
      const persistedUser = await db.getUserByOpenId(userInfo.openId);
      if (
        !persistedUser ||
        persistedUser.openId !== userInfo.openId ||
        !Number.isSafeInteger(persistedUser.id) ||
        persistedUser.id <= 0
      ) {
        throw failure("OAUTH_USER_UNCONFIRMED");
      }

      stage = "session";
      const sessionVersion = Number(persistedUser.sessionVersion ?? 0);
      if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0)
        throw failure("OAUTH_SESSION_INVALID");
      const sessionName =
        providerName || persistedUser.name?.trim() || "Usuário do Portal";
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: sessionName,
        expiresInMs: ONE_YEAR_MS,
        sessionVersion,
      });
      const verified = await sdk.verifySession(sessionToken);
      if (
        !verified ||
        verified.openId !== persistedUser.openId ||
        verified.appId !== ENV.appId ||
        verified.sessionVersion !== sessionVersion
      ) {
        throw failure("OAUTH_SESSION_INVALID");
      }
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/selecionar-estabelecimento");
    } catch (error: unknown) {
      const details = describeAuthFailure(error);
      // Nunca imprimir objetos de erro: Axios/SQL podem conter credenciais ou dados pessoais.
      console.error("[OAuth] Callback failed", {
        reference,
        stage,
        ...details,
      });
      const errorType =
        details.httpStatus === 429 ? "rate_limit" : "callback_failed";
      const params = new URLSearchParams({
        auth_error: errorType,
        auth_stage: stage,
        auth_ref: reference,
      });
      // Rota pública fixa: a mensagem não é perdida no redirecionamento da home.
      res.redirect(302, `/login?${params.toString()}`);
    }
  });
}
