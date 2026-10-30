import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { caminhoContaFabricaImportada } from "./fabricaContaDestino";

describe("Fábrica: abrir a conta importada no snapshot confirmado", () => {
  it("preserva origem, hospital, arquivo, lote, competência e conta da Fábrica", () => {
    const caminho = caminhoContaFabricaImportada({ estabelecimentoId: 20, arquivoId: 101, numeroConta: "CONTA-SINTETICA & 1", numeroLote: "LOTE/SINTETICO", competencia: "2026/10", fabricaContaId: 9 });
    const url = new URL(caminho, "https://exemplo.test");
    expect(url.pathname).toBe("/conta-convenio-detalhes");
    expect(Object.fromEntries(url.searchParams)).toEqual({ numeroConta: "CONTA-SINTETICA & 1", origem: "XML", sourceHospitalId: "20", estabelecimentoId: "20", arquivoId: "101", numeroLote: "LOTE/SINTETICO", competencia: "2026/10", fabricaContaId: "9" });
    expect(caminho).not.toMatch(/s3Key|s3Url|storage|cofre/);
  });
  it("a tela usa o destino retornado pela API apenas no sucesso", () => {
    const src = readFileSync(new URL("../pages/FabricaFaturamento.tsx", import.meta.url), "utf8");
    const inicio = src.indexOf("const importarXmlMutation =");
    const fim = src.indexOf("const vincularLoteMutation", inicio);
    const mutation = src.slice(inicio, fim);
    expect(mutation).toContain("setLocation(caminhoContaFabricaImportada(res.destinoContaConvenio))");
    expect(mutation.slice(mutation.indexOf("onError:"))).not.toContain("setLocation");
  });
});
