import { describe, expect, it } from "vitest";
import { estadoRetentativaXml } from "./xmlImportacaoRetry";

describe("estadoRetentativaXml", () => {
  it("mantém uma seleção inteira reenviável depois de erro de armazenamento", () => {
    expect(estadoRetentativaXml(["error", "error"])).toEqual({
      pendentes: 0,
      comErro: 2,
      reenviaveis: 2,
      rotuloAcao: "Tentar novamente (2 XMLs)",
    });
  });

  it("preserva o rótulo normal quando ainda há arquivos pendentes", () => {
    expect(estadoRetentativaXml(["pending", "error", "success"])).toEqual({
      pendentes: 1,
      comErro: 1,
      reenviaveis: 2,
      rotuloAcao: "Enviar 2 Arquivos",
    });
  });
});
