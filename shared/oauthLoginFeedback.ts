export type OAuthLoginFeedback = {
  title: string;
  message: string;
  reference?: string;
};

const GENERIC_MESSAGE =
  "Não foi possível concluir seu acesso. Tente novamente.";

const STAGE_MESSAGES: Record<string, string> = {
  exchange:
    "Não foi possível concluir a comunicação com o provedor de login. Tente novamente.",
  identity:
    "Não foi possível confirmar sua identidade com o provedor de login. Tente novamente.",
  persist: "Não foi possível preparar seu acesso. Tente novamente.",
  session: "Não foi possível iniciar sua sessão. Tente novamente.",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === "string" ? new URLSearchParams(search) : search;
}

function getMessage(errorCode: string, stage: string | null): string {
  if (errorCode === "rate_limit") {
    return "Muitas tentativas de login foram realizadas. Aguarde alguns instantes e tente novamente.";
  }

  if (errorCode === "invalid_state") {
    return "A solicitação de login expirou ou não pôde ser validada. Inicie o login novamente.";
  }

  return (stage && STAGE_MESSAGES[stage]) || GENERIC_MESSAGE;
}

/**
 * Produz somente textos predefinidos para uma falha de OAuth. Parâmetros de
 * consulta não são refletidos na tela; a referência só é exibida se for UUID.
 */
export function getOAuthLoginFeedback(
  search: string | URLSearchParams,
  isAuthenticated = false
): OAuthLoginFeedback | null {
  if (isAuthenticated) return null;

  const params = toSearchParams(search);
  const errorCode = params.get("auth_error");
  if (!errorCode) return null;

  const reference = params.get("auth_ref");

  return {
    title: "Não foi possível entrar",
    message: getMessage(errorCode, params.get("auth_stage")),
    ...(reference && UUID_PATTERN.test(reference)
      ? { reference: reference.toLowerCase() }
      : {}),
  };
}
