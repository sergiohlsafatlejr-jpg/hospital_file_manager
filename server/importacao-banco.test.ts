import { describe, it, expect } from "vitest";

describe("Métricas de Importação via Banco - Produtividade", () => {
  it("deve ter a procedure metricasImportacaoBanco registrada no router de produtividade", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("produtividade.metricasImportacaoBanco");
  });

  it("deve ter a função getMetricasImportacaoBanco exportada do db", async () => {
    const db = await import("./db");
    expect(typeof db.getMetricasImportacaoBanco).toBe("function");
  });

  it("getMetricasImportacaoBanco deve retornar estrutura correta sem dados", async () => {
    const { getMetricasImportacaoBanco } = await import("./db");
    const result = await getMetricasImportacaoBanco({});
    
    // Verificar estrutura do resumo
    expect(result).toHaveProperty("resumo");
    expect(result.resumo).toHaveProperty("totalContas");
    expect(result.resumo).toHaveProperty("totalItens");
    expect(result.resumo).toHaveProperty("valorTotal");
    expect(result.resumo).toHaveProperty("contasHoje");
    expect(result.resumo).toHaveProperty("valorHoje");
    expect(result.resumo).toHaveProperty("mediaItensPorConta");
    expect(result.resumo).toHaveProperty("mediaValorPorConta");
    
    // Verificar arrays
    expect(result).toHaveProperty("porDia");
    expect(result).toHaveProperty("porUsuario");
    expect(result).toHaveProperty("porConvenio");
    expect(result).toHaveProperty("ultimasImportacoes");
    expect(Array.isArray(result.porDia)).toBe(true);
    expect(Array.isArray(result.porUsuario)).toBe(true);
    expect(Array.isArray(result.porConvenio)).toBe(true);
    expect(Array.isArray(result.ultimasImportacoes)).toBe(true);
  });

  it("getMetricasImportacaoBanco deve aceitar filtros de data e estabelecimento", async () => {
    const { getMetricasImportacaoBanco } = await import("./db");
    
    // Com filtros de data
    const result = await getMetricasImportacaoBanco({
      dataInicio: new Date("2025-01-01"),
      dataFim: new Date("2025-12-31"),
      estabelecimentoId: 1,
    });
    
    expect(result).toHaveProperty("resumo");
    expect(typeof result.resumo.totalContas).toBe("number");
    expect(typeof result.resumo.valorTotal).toBe("number");
  });

  it("valores numéricos do resumo devem ser não-negativos", async () => {
    const { getMetricasImportacaoBanco } = await import("./db");
    const result = await getMetricasImportacaoBanco({});
    
    expect(result.resumo.totalContas).toBeGreaterThanOrEqual(0);
    expect(result.resumo.totalItens).toBeGreaterThanOrEqual(0);
    expect(result.resumo.valorTotal).toBeGreaterThanOrEqual(0);
    expect(result.resumo.contasHoje).toBeGreaterThanOrEqual(0);
    expect(result.resumo.valorHoje).toBeGreaterThanOrEqual(0);
    expect(result.resumo.mediaItensPorConta).toBeGreaterThanOrEqual(0);
    expect(result.resumo.mediaValorPorConta).toBeGreaterThanOrEqual(0);
  });
});
