import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
  storageGet: mocks.storageGet,
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import {
  classificarFalhaArmazenamentoXmlImportacao,
  codigoFalhaArmazenamentoXmlImportacaoValido,
  criarChaveStorageXmlImportacao,
  lerXmlImportacaoProtegido,
  salvarXmlImportacaoProtegido,
  armazenamentoXmlImportacaoPronto,
} from "./xmlImportacaoLoteVault";

const scope = {
  loteId: 91,
  estabelecimentoId: 7,
  convenioId: 8,
  arquivoId: 5,
};

function respostaBinaria(bytes: Buffer) {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/octet-stream" },
  });
}

describe("classificarFalhaArmazenamentoXmlImportacao", () => {
  it("converte respostas HTTP de storage em categorias sem texto bruto", () => {
    expect(
      classificarFalhaArmazenamentoXmlImportacao(
        new Error("Storage upload failed (403 Forbidden): resposta externa")
      )
    ).toBe("STORAGE_ACCESS_DENIED");
    expect(
      classificarFalhaArmazenamentoXmlImportacao(
        new Error(
          "Storage upload failed (503 Service Unavailable): resposta externa"
        )
      )
    ).toBe("STORAGE_UNAVAILABLE");
  });

  it("classifica transporte sem propagar o detalhe do provedor", () => {
    expect(
      classificarFalhaArmazenamentoXmlImportacao(
        new Error("fetch failed: conexão interrompida")
      )
    ).toBe("STORAGE_TRANSPORT");
  });

  it("aceita apenas categorias internas previstas", () => {
    expect(
      codigoFalhaArmazenamentoXmlImportacaoValido("STORAGE_UNAVAILABLE")
    ).toBe(true);
    expect(
      codigoFalhaArmazenamentoXmlImportacaoValido("mensagem do provedor")
    ).toBe(false);
  });
});

describe("cofre XML protegido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("XML_IMPORTACAO_FILE_KEY", "a".repeat(64));
    mocks.lookup.mockResolvedValue([{ address: "198.51.100.10", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("em produção sem chave dedicada recusa mesmo com JWT sintético e não tenta storage", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("XML_IMPORTACAO_FILE_KEY", "");
    vi.stubEnv("JWT_SECRET", "jwt-sintetico-nao-e-chave-de-cofre");
    vi.stubEnv("JWT_SECRET_KEY", "jwt-sintetica-nao-e-chave-de-cofre");
    const storageKey = "xml-importacao-protegida/7/8/91/nao-deve-ser-validada.enc";

    expect(armazenamentoXmlImportacaoPronto()).toBe(false);
    await expect(salvarXmlImportacaoProtegido(Buffer.from("xml-sintetico"), scope, storageKey))
      .rejects.toMatchObject({ failureCode: "STORAGE_KEY_UNAVAILABLE" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it("sem Forge/storage disponível falha sem sucesso local ou temporário", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const storageKey = criarChaveStorageXmlImportacao(scope);
    mocks.storagePut.mockRejectedValue(
      new Error("Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"),
    );

    await expect(salvarXmlImportacaoProtegido(Buffer.from("xml-sintetico"), scope, storageKey))
      .rejects.toMatchObject({ failureCode: "STORAGE_WRITE_FAILED" });
    expect(mocks.storagePut).toHaveBeenCalledOnce();
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it("conclui a cifra GCM antes de obter a tag, grava uma vez e recupera o mesmo conteúdo", async () => {
    const storageKey = criarChaveStorageXmlImportacao(scope);
    const plain = Buffer.from('<?xml version="1.0"?><sintetico>ok</sintetico>');
    let encrypted = Buffer.alloc(0);

    mocks.storagePut.mockImplementation(
      async (key: string, data: Buffer | Uint8Array | string) => {
        encrypted = Buffer.from(data);
        return { key, url: "https://storage.example.test/objeto" };
      }
    );

    await salvarXmlImportacaoProtegido(plain, scope, storageKey);

    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
    expect(encrypted.length).toBeGreaterThan(plain.length);
    expect(encrypted.includes(plain)).toBe(false);

    mocks.storageGet.mockResolvedValue({
      key: storageKey,
      url: "https://storage.example.test/objeto",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respostaBinaria(encrypted))
    );

    await expect(lerXmlImportacaoProtegido(scope, storageKey)).resolves.toEqual(
      plain
    );
  });

  it("recusa envelope alterado ou associado a outro escopo", async () => {
    const storageKey = criarChaveStorageXmlImportacao(scope);
    const plain = Buffer.from("conteudo-sintetico");
    let encrypted = Buffer.alloc(0);

    mocks.storagePut.mockImplementation(
      async (key: string, data: Buffer | Uint8Array | string) => {
        encrypted = Buffer.from(data);
        return { key, url: "https://storage.example.test/objeto" };
      }
    );
    await salvarXmlImportacaoProtegido(plain, scope, storageKey);

    const altered = Buffer.from(encrypted);
    altered[altered.length - 1] ^= 1;
    mocks.storageGet.mockResolvedValue({
      key: storageKey,
      url: "https://storage.example.test/objeto",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaBinaria(altered)));

    await expect(lerXmlImportacaoProtegido(scope, storageKey)).rejects.toThrow(
      "XML_IMPORTACAO_ENVELOPE_INVALID"
    );
  });
});
