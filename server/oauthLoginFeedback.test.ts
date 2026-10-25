import { describe, expect, it } from "vitest";
import { getOAuthLoginFeedback } from "../shared/oauthLoginFeedback";

describe("getOAuthLoginFeedback", () => {
  it("explica callback_failed legado sem depender de auth_stage", () => {
    expect(getOAuthLoginFeedback("?auth_error=callback_failed")).toEqual({
      title: "Não foi possível entrar",
      message: "Não foi possível concluir seu acesso. Tente novamente.",
    });
  });

  it.each([
    [
      "exchange",
      "Não foi possível concluir a comunicação com o provedor de login. Tente novamente.",
    ],
    [
      "identity",
      "Não foi possível confirmar sua identidade com o provedor de login. Tente novamente.",
    ],
    ["persist", "Não foi possível preparar seu acesso. Tente novamente."],
    ["session", "Não foi possível iniciar sua sessão. Tente novamente."],
  ])("usa a mensagem segura para o estágio %s", (stage, message) => {
    expect(
      getOAuthLoginFeedback(
        new URLSearchParams({
          auth_error: "callback_failed",
          auth_stage: stage,
        })
      )
    ).toMatchObject({ message });
  });

  it("mantém mensagens próprias para limite e estado inválido", () => {
    expect(getOAuthLoginFeedback("?auth_error=rate_limit")?.message).toContain(
      "Muitas tentativas"
    );
    expect(
      getOAuthLoginFeedback("?auth_error=invalid_state")?.message
    ).toContain("expirou");
  });

  it("não reflete código, estágio ou referência desconhecidos", () => {
    const untrustedCode = "database host db.internal.example";
    const untrustedStage = "SQL failed: relation users does not exist";
    const untrustedReference = "request-id=secret-token";
    const feedback = getOAuthLoginFeedback(
      new URLSearchParams({
        auth_error: untrustedCode,
        auth_stage: untrustedStage,
        auth_ref: untrustedReference,
      })
    );

    expect(feedback).toEqual({
      title: "Não foi possível entrar",
      message: "Não foi possível concluir seu acesso. Tente novamente.",
    });
    expect(JSON.stringify(feedback)).not.toContain(untrustedCode);
    expect(JSON.stringify(feedback)).not.toContain(untrustedStage);
    expect(JSON.stringify(feedback)).not.toContain(untrustedReference);
  });

  it("mostra a referência apenas quando ela é um UUID válido", () => {
    const reference = "C0A8012E-1F6E-4F37-8C34-9B5A3D6E7F80";
    expect(
      getOAuthLoginFeedback(`?auth_error=callback_failed&auth_ref=${reference}`)
    ).toMatchObject({ reference: reference.toLowerCase() });
  });

  it("não mostra a falha quando a sessão já está autenticada", () => {
    expect(
      getOAuthLoginFeedback("?auth_error=callback_failed", true)
    ).toBeNull();
  });
});
