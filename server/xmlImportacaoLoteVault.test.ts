import { describe, expect, it } from "vitest";
import {
  classificarFalhaArmazenamentoXmlImportacao,
  codigoFalhaArmazenamentoXmlImportacaoValido,
} from "./xmlImportacaoLoteVault";

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
