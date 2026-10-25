export const OAUTH_STATE_COOKIE = "__Host-oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 600;
const MAX_STATE_LENGTH = 4096;

export type OAuthState = {
  redirectUri: string;
  nonce: string;
  issuedAt: number;
};

export const isOAuthNonce = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value
  );

function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || localHttp) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/api/oauth/callback" &&
      url.href === value
    );
  } catch {
    return false;
  }
}

export function decodeOAuthState(state: unknown): OAuthState | null {
  if (typeof state !== "string" || !state || state.length > MAX_STATE_LENGTH)
    return null;
  try {
    const parsed: unknown = JSON.parse(atob(state));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const fields = parsed as Record<string, unknown>;
    if (Object.keys(fields).sort().join(",") !== "issuedAt,nonce,redirectUri")
      return null;
    if (
      !validRedirect(fields.redirectUri) ||
      !isOAuthNonce(fields.nonce) ||
      typeof fields.issuedAt !== "number" ||
      !Number.isSafeInteger(fields.issuedAt) ||
      fields.issuedAt <= 0
    )
      return null;
    return {
      redirectUri: fields.redirectUri,
      nonce: fields.nonce,
      issuedAt: fields.issuedAt,
    };
  } catch {
    return null;
  }
}

export function encodeOAuthState(state: OAuthState): string {
  const encoded = btoa(JSON.stringify(state));
  if (!decodeOAuthState(encoded))
    throw new Error("Estado de autenticação inválido");
  return encoded;
}

export function isOAuthStateFresh(
  state: OAuthState,
  now = Date.now()
): boolean {
  const age = now - state.issuedAt;
  return age >= -30_000 && age <= OAUTH_STATE_TTL_SECONDS * 1000;
}
