import { describe, it, expect } from "vitest";
import {
  encryptEasyLocalPayload,
  decryptEasyLocalPayload,
  easyLocalEncryptionKeyAvailable,
} from "./easyLocalCadastroVault";
const env = { EASYLOCAL_CONNECTION_ENCRYPTION_KEY: "ab".repeat(32) };
describe("cofre dedicado EASYLocal", () => {
  it("cifra com nonce novo sem guardar segredo ou chave no envelope", () => {
    const payload = { password: "segredo-ficticio", host: "teste.invalid" };
    const a = encryptEasyLocalPayload(payload, env);
    const b = encryptEasyLocalPayload(payload, env);
    expect(a).not.toEqual(b);
    expect(a).not.toContain(payload.password);
    expect(a).not.toContain(payload.host);
    expect(a).not.toContain(env.EASYLOCAL_CONNECTION_ENCRYPTION_KEY);
    expect(decryptEasyLocalPayload(a, env)).toEqual(payload);
  });
  it("não aceita JWT ou chaves curtas como fallback", () => {
    expect(
      easyLocalEncryptionKeyAvailable({ JWT_SECRET: "ab".repeat(32) })
    ).toBe(false);
    expect(() => encryptEasyLocalPayload({}, {})).toThrow();
    expect(
      easyLocalEncryptionKeyAvailable({
        EASYLOCAL_CONNECTION_ENCRYPTION_KEY: "aa",
      })
    ).toBe(false);
  });
  it("rejeita chave errada, adulteração, propósito e envelope inválidos", () => {
    const a = encryptEasyLocalPayload({ password: "segredo-ficticio" }, env);
    expect(() =>
      decryptEasyLocalPayload(a, {
        EASYLOCAL_CONNECTION_ENCRYPTION_KEY: "cd".repeat(32),
      })
    ).toThrow();
    for (const campo of ["ciphertext", "nonce", "tag"]) {
      const envelope = JSON.parse(a);
      const bytes = Buffer.from(envelope[campo], "base64url");
      bytes[0] ^= 1;
      envelope[campo] = bytes.toString("base64url");
      expect(() =>
        decryptEasyLocalPayload(JSON.stringify(envelope), env)
      ).toThrow();
    }
    expect(() =>
      decryptEasyLocalPayload(a.replace("connection.v1", "outro.v1"), env)
    ).toThrow();
    expect(() => decryptEasyLocalPayload("base64-nao-e-cifra", env)).toThrow();
    expect(() => decryptEasyLocalPayload("null", env)).toThrow();
  });
});
