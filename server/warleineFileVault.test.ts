import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptWarleineFile, encryptWarleineFile } from "./warleineFileVault";

const originalSecret = process.env.JWT_SECRET;
const originalDedicatedKey = process.env.WARLEINE_FILE_ENCRYPTION_KEY;
const originalPreviousKeys = process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS;

describe("cofre de arquivo Warleine", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    delete process.env.WARLEINE_FILE_ENCRYPTION_KEY;
    delete process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS;
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalDedicatedKey === undefined) delete process.env.WARLEINE_FILE_ENCRYPTION_KEY;
    else process.env.WARLEINE_FILE_ENCRYPTION_KEY = originalDedicatedKey;
    if (originalPreviousKeys === undefined) delete process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS;
    else process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS = originalPreviousKeys;
  });

  it("criptografa e recupera o conteúdo sem gravar texto puro", () => {
    const plain = Buffer.from("conteudo hospitalar de teste");
    const encrypted = encryptWarleineFile(plain);
    expect(encrypted.equals(plain)).toBe(false);
    expect(encrypted.includes(plain)).toBe(false);
    expect(decryptWarleineFile(encrypted)).toEqual(plain);
  });

  it("rejeita adulteração do arquivo criptografado", () => {
    const encrypted = encryptWarleineFile(Buffer.from("conteudo"));
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptWarleineFile(encrypted)).toThrow();
  });

  it("recupera envelope após rotação quando a chave anterior permanece configurada", () => {
    process.env.WARLEINE_FILE_ENCRYPTION_KEY = "chave-dedicada-antiga-com-tamanho-seguro";
    const encrypted = encryptWarleineFile(Buffer.from("conteudo"));
    process.env.WARLEINE_FILE_ENCRYPTION_KEY = "chave-dedicada-nova-com-tamanho-seguro";
    process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS = "chave-dedicada-antiga-com-tamanho-seguro";
    expect(decryptWarleineFile(encrypted).toString("utf8")).toBe("conteudo");
  });
});
