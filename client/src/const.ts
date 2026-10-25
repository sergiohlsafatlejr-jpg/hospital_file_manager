import {
  encodeOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "@shared/oauthState";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Privado: só a ação startLogin pode criar o estado no momento de navegar.
const buildLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = encodeOAuthState({
    redirectUri,
    nonce: window.crypto.randomUUID(),
    issuedAt: Date.now(),
  });
  // Sem Domain: o cookie __Host- permanece restrito ao host atual.
  document.cookie = [
    `${OAUTH_STATE_COOKIE}=${state}`,
    "Path=/",
    `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
    "Secure",
    "SameSite=None",
  ].join("; ");
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};

let loginNavigationStarted = false;

// Queries, mutations, hooks e cliques compartilham a mesma guarda síncrona.
export const startLogin = (redirectPath?: string): boolean => {
  if (typeof window === "undefined" || loginNavigationStarted) return false;
  loginNavigationStarted = true;
  try {
    window.location.assign(redirectPath ?? buildLoginUrl());
    return true;
  } catch (error) {
    // Uma navegação que falhou pode ser iniciada novamente por ação explícita.
    loginNavigationStarted = false;
    throw error;
  }
};
