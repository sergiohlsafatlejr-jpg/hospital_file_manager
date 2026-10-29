import { describe, expect, it } from "vitest";
import { criarUrlReenvioIntegralXml } from "./xmlImportacaoReenvio";

describe("criarUrlReenvioIntegralXml", () => {
  it("mantém somente unidade, convênio e competências válidas", () => {
    const url = criarUrlReenvioIntegralXml({
      estabelecimentoId: 4,
      convenioId: "8",
      dataReferencia: "2026-10-01",
      dataPagamento: "2026-10-15",
      loteId: 99,
      storageKey: "nunca-deve-sair",
    });
    const params = new URL(url, "https://portal.exemplo").searchParams;
    expect(params.get("reenvioLote")).toBe("1");
    expect(params.get("estabelecimentoId")).toBe("4");
    expect(params.get("convenioId")).toBe("8");
    expect(params.get("dataReferencia")).toBe("2026-10-01");
    expect(params.get("dataPagamento")).toBe("2026-10-15");
    expect(params.get("loteId")).toBeNull();
    expect(params.get("storageKey")).toBeNull();
  });

  it("descarta IDs e datas inválidos", () => {
    const url = criarUrlReenvioIntegralXml({
      estabelecimentoId: 0,
      convenioId: "sem-id",
      dataReferencia: "invalida",
      dataPagamento: null,
    });
    const params = new URL(url, "https://portal.exemplo").searchParams;
    expect([...params.entries()]).toEqual([["reenvioLote", "1"]]);
  });
});
