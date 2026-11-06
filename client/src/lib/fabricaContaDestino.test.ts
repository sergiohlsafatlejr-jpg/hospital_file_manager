import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { caminhoContaFabricaBancoCliente, caminhoContaFabricaImportada } from "./fabricaContaDestino";

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

describe("Issue168: destino bancário com referência exata da coleção", () => {
  const destino = { estabelecimentoId: 20, numeroConta: "CONTA-SINTETICA & 1", fabricaContaId: 9 };

  it("preserva identidade, origem e resumo ativo sem carregar dados individuais na URL", () => {
    const caminho = caminhoContaFabricaBancoCliente({ ...destino, resumoId: 123 });
    const url = new URL(caminho, "https://exemplo.test");
    expect(url.pathname).toBe("/conta-convenio-detalhes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      numeroConta: destino.numeroConta,
      origem: "BANCO_CLIENTE",
      sourceHospitalId: "20",
      estabelecimentoId: "20",
      fabricaContaId: "9",
      resumoId: "123",
    });
    expect(caminho).not.toMatch(/paciente|carteira|valor|storage|s3Key|s3Url|senha/);
    expect(url.searchParams.has("arquivoId")).toBe(false);
  });

  it("permite navegar no snapshot vazio pela sua referência, sem depender da quantidade de itens", () => {
    const url = new URL(caminhoContaFabricaBancoCliente({ ...destino, resumoId: 124 }), "https://exemplo.test");
    expect(url.searchParams.get("resumoId")).toBe("124");
    expect(url.searchParams.get("fabricaContaId")).toBe("9");
  });

  it("o atalho de coleção vazia é só leitura e não libera o fluxo de envio para auditoria", () => {
    const src = readFileSync(new URL("../pages/FabricaFaturamento.tsx", import.meta.url), "utf8");
    const inicio = src.indexOf("{conta.totalItensXml === 0 && conta.contaConvenioResumoId > 0");
    const fim = src.indexOf("{conta.totalItensXml > 0 &&", inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    const vazio = src.slice(inicio, fim);
    expect(vazio).toContain("!(conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId)");
    expect(vazio).toContain("Ver snapshot vazio");
    expect(vazio).toContain("resumoId: conta.contaConvenioResumoId");
    expect(vazio).toContain("setLocation(caminhoContaFabricaBancoCliente");
    expect(vazio).not.toMatch(/\.mutate\(|avancarParaAuditoriaInterna|setorDestino/);
  });

  it.each([undefined, null, 0, -1, 1.5, NaN, Infinity])("não transmite uma referência inválida %s", (resumoId) => {
    const url = new URL(caminhoContaFabricaBancoCliente({ ...destino, resumoId }), "https://exemplo.test");
    expect(url.searchParams.has("resumoId")).toBe(false);
    expect(url.searchParams.get("fabricaContaId")).toBe("9");
    expect(url.searchParams.get("sourceHospitalId")).toBe("20");
  });
});
