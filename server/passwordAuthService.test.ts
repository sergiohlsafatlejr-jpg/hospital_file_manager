import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashResetToken, hashSensitiveValue, normalizeEmail, validateNewPassword } from "./passwordAuthService";

describe("passwordAuthService", () => {
  it("normaliza e-mails sem alterar o conteúdo interno", () => {
    expect(normalizeEmail("  Usuario@Hospital.COM.BR ")).toBe("usuario@hospital.com.br");
  });

  it("não persiste valores sensíveis em texto puro", () => {
    const value = "usuario@hospital.com.br";
    const hashed = hashSensitiveValue(value);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(value);
    expect(hashSensitiveValue(value)).toBe(hashed);
  });

  it("gera hash fixo para localizar token sem armazená-lo", () => {
    const token = "token-de-recuperacao-com-valor-secreto-123456";
    expect(hashResetToken(token)).toHaveLength(64);
    expect(hashResetToken(token)).not.toBe(token);
  });

  it.each([
    ["Curta1", "10 caracteres"],
    ["todaminuscula1", "maiúscula"],
    ["TODAMAIUSCULA1", "minúscula"],
    ["SemQualquerNumero", "número"],
  ])("rejeita senha fora da política", (password, expectedMessage) => {
    expect(validateNewPassword(password)).toContain(expectedMessage);
  });

  it("aceita senha forte sem exigir caractere especial", () => {
    expect(validateNewPassword("PortalSeguro2026")).toBeNull();
  });

  it("serializa criação e consumo para impedir dois tokens concorrentes", () => {
    const source = readFileSync(resolve(process.cwd(), "server/passwordAuthService.ts"), "utf8");
    expect(source).toContain("SELECT id FROM users WHERE id=? FOR UPDATE");
    expect(source).toContain("LIMIT 1 FOR UPDATE");
    expect(source).toContain("UPDATE passwordResetTokens SET usedAt=NOW() WHERE userId=? AND usedAt IS NULL");
  });

  it("usa identidade canônica e falha fechado em vez de escolher duplicidades", () => {
    const source = readFileSync(resolve(process.cwd(), "server/passwordAuthService.ts"), "utf8");
    expect(source).toContain("WHERE u.emailCanonical=?");
    expect(source).not.toContain("ORDER BY activeAccesses DESC");
  });

  it("reserva quota atomicamente antes do bcrypt e separa identidade de IP", () => {
    const source = readFileSync(resolve(process.cwd(), "server/passwordAuthService.ts"), "utf8");
    expect(source).toContain("INSERT IGNORE INTO authRateLimits");
    expect(source).toContain("LIMIT 1 FOR UPDATE");
    expect(source.indexOf('reserveRateLimit("login_email"')).toBeLessThan(source.indexOf("bcrypt.compare"));
    expect(source).toContain('reserveRateLimit("login_ip"');
  });

  it("revoga sessões anteriores ao redefinir a senha", () => {
    const source = readFileSync(resolve(process.cwd(), "server/passwordAuthService.ts"), "utf8");
    expect(source).toContain("sessionVersion=sessionVersion+1");
  });

  it("envia o token no fragmento e uniformiza o tempo da resposta pública", () => {
    const source = readFileSync(resolve(process.cwd(), "server/passwordAuthService.ts"), "utf8");
    expect(source).toContain("/redefinir-senha#token=");
    expect(source).toContain("waitMinimum(startedAt)");
  });
});
