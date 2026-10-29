import { describe, expect, it } from "vitest";
import {
  bancoInterEncryptionKeyAvailable,
  decryptBancoInterField,
  encryptBancoInterField,
} from "./bancoInterVault";

const env = { BANCO_INTER_ENCRYPTION_KEY: "ab".repeat(32) };

describe("cofre dedicado Banco Inter", () => {
  it("cifra com nonce novo e recupera somente o mesmo banco e campo", () => {
    const value = "segredo-ficticio-apenas-teste";
    const a = encryptBancoInterField(7, "clientSecret", value, env);
    const b = encryptBancoInterField(7, "clientSecret", value, env);

    expect(a).not.toEqual(b);
    expect(a).not.toContain(value);
    expect(a).not.toContain(env.BANCO_INTER_ENCRYPTION_KEY);
    expect(decryptBancoInterField(7, "clientSecret", a, env)).toBe(value);
    expect(() => decryptBancoInterField(8, "clientSecret", a, env)).toThrow();
    expect(() => decryptBancoInterField(7, "keyPem", a, env)).toThrow();
  });

  it("falha fechada sem a chave exclusiva, sem aceitar JWT como fallback", () => {
    expect(bancoInterEncryptionKeyAvailable({ JWT_SECRET: "ab".repeat(32) })).toBe(false);
    expect(bancoInterEncryptionKeyAvailable({ BANCO_INTER_ENCRYPTION_KEY: "invalida" })).toBe(false);
    expect(() => encryptBancoInterField(7, "certPem", "conteudo-ficticio", {})).toThrow();
  });

  it("rejeita envelope adulterado, inválido ou cifrado com chave diferente", () => {
    const envelope = encryptBancoInterField(7, "keyPem", "chave-privada-ficticia", env);
    const altered = JSON.parse(envelope);
    const bytes = Buffer.from(altered.ciphertext, "base64url");
    bytes[0] ^= 1;
    altered.ciphertext = bytes.toString("base64url");

    expect(() => decryptBancoInterField(7, "keyPem", JSON.stringify(altered), env)).toThrow();
    expect(() => decryptBancoInterField(7, "keyPem", envelope, { BANCO_INTER_ENCRYPTION_KEY: "cd".repeat(32) })).toThrow();
    expect(() => decryptBancoInterField(7, "keyPem", "nao-e-envelope", env)).toThrow();
  });
});
