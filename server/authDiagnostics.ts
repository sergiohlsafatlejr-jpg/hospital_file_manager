const ALLOWED_CODES = new Set([
  "ETIMEDOUT",
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ERR_BAD_REQUEST",
  "ERR_BAD_RESPONSE",
  "ER_DUP_ENTRY",
  "ER_BAD_FIELD_ERROR",
  "ER_NO_SUCH_TABLE",
  "PROTOCOL_CONNECTION_LOST",
  "ERR_JWT_EXPIRED",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "OAUTH_TOKEN_MISSING",
  "OAUTH_IDENTITY_INVALID",
  "OAUTH_USER_UNCONFIRMED",
  "OAUTH_SESSION_INVALID",
]);

export function describeAuthFailure(error: unknown): {
  code: string;
  httpStatus?: number;
} {
  try {
    const value =
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : {};
    const cause =
      value.cause && typeof value.cause === "object"
        ? (value.cause as Record<string, unknown>)
        : {};
    const response =
      value.response && typeof value.response === "object"
        ? (value.response as Record<string, unknown>)
        : {};
    const code = [value.code, cause.code].find(
      v => typeof v === "string" && ALLOWED_CODES.has(v)
    );
    const status = response.status;
    return {
      code: typeof code === "string" ? code : "UNCLASSIFIED",
      ...(typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? { httpStatus: status }
        : {}),
    };
  } catch {
    return { code: "UNCLASSIFIED" };
  }
}
