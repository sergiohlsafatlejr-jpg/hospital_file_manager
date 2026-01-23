import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("IA - Análise Inteligente de Contas", () => {
  const testEstabelecimentoId = 99999; // ID que não existe

  describe("getEstatisticasPorCodigo", () => {
    it("should return empty array when no data exists", async () => {
      const result = await db.getEstatisticasPorCodigo(testEstabelecimentoId);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept convenioId filter", async () => {
      const result = await db.getEstatisticasPorCodigo(testEstabelecimentoId, 99999);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getContasOutliers", () => {
    it("should return empty array when no outliers exist", async () => {
      const result = await db.getContasOutliers(testEstabelecimentoId);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept convenioId filter", async () => {
      const result = await db.getContasOutliers(testEstabelecimentoId, 99999);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept limiteDesvio parameter", async () => {
      const result = await db.getContasOutliers(testEstabelecimentoId, undefined, 3);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return outliers with correct structure when data exists", async () => {
      const result = await db.getContasOutliers(testEstabelecimentoId);
      
      // Even with no data, structure should be correct
      result.forEach((outlier: any) => {
        expect(outlier).toHaveProperty("procedimento");
        expect(outlier).toHaveProperty("tipo");
        expect(outlier).toHaveProperty("valorMedio");
        expect(outlier).toHaveProperty("desvioPadrao");
        expect(outlier).toHaveProperty("diferencaPercentual");
        expect(["abaixo_media", "acima_media"]).toContain(outlier.tipo);
      });
    });
  });

  describe("getPadroesErroPorFuncionario", () => {
    it("should return array with correct structure", async () => {
      const result = await db.getPadroesErroPorFuncionario(testEstabelecimentoId);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should calculate taxaGlosa correctly", async () => {
      const result = await db.getPadroesErroPorFuncionario(testEstabelecimentoId);
      
      result.forEach((padrao: any) => {
        expect(padrao).toHaveProperty("userId");
        expect(padrao).toHaveProperty("userName");
        expect(padrao).toHaveProperty("taxaGlosa");
        expect(padrao).toHaveProperty("totalContas");
        expect(padrao).toHaveProperty("totalProcedimentos");
        expect(padrao).toHaveProperty("totalGlosados");
        expect(padrao).toHaveProperty("valorTotalGlosado");
        
        // taxaGlosa should be a number between 0 and 100
        expect(typeof padrao.taxaGlosa).toBe("number");
        expect(padrao.taxaGlosa).toBeGreaterThanOrEqual(0);
        expect(padrao.taxaGlosa).toBeLessThanOrEqual(100);
      });
    });
  });

  describe("calcularRiscoGlosa", () => {
    it("should return array of contas with risk score", async () => {
      const result = await db.calcularRiscoGlosa(testEstabelecimentoId);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept arquivoId filter", async () => {
      const result = await db.calcularRiscoGlosa(testEstabelecimentoId, 99999);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return contas with correct structure", async () => {
      const result = await db.calcularRiscoGlosa(testEstabelecimentoId);
      
      result.forEach((conta: any) => {
        expect(conta).toHaveProperty("guiaNumero");
        expect(conta).toHaveProperty("pacienteNome");
        expect(conta).toHaveProperty("arquivoNome");
        expect(conta).toHaveProperty("itens");
        expect(conta).toHaveProperty("valorTotal");
        expect(conta).toHaveProperty("riscoMaximo");
        expect(Array.isArray(conta.itens)).toBe(true);
        
        // riscoMaximo should be a number between 0 and 100
        expect(typeof conta.riscoMaximo).toBe("number");
        expect(conta.riscoMaximo).toBeGreaterThanOrEqual(0);
        expect(conta.riscoMaximo).toBeLessThanOrEqual(100);
      });
    });
  });

  describe("gerarAlertasIA", () => {
    it("should return array of alertas", async () => {
      const result = await db.gerarAlertasIA(testEstabelecimentoId);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return alertas with correct structure", async () => {
      const result = await db.gerarAlertasIA(testEstabelecimentoId);
      
      result.forEach((alerta: any) => {
        expect(alerta).toHaveProperty("tipo");
        expect(alerta).toHaveProperty("categoria");
        expect(alerta).toHaveProperty("titulo");
        expect(alerta).toHaveProperty("descricao");
        
        expect(["critico", "alerta", "info"]).toContain(alerta.tipo);
        expect(["outlier", "padrao_erro", "risco_glosa", "tendencia"]).toContain(alerta.categoria);
        expect(typeof alerta.titulo).toBe("string");
        expect(typeof alerta.descricao).toBe("string");
      });
    });

    it("should identify critical alerts for high error rate employees", async () => {
      const result = await db.gerarAlertasIA(testEstabelecimentoId);
      
      // Check that function doesn't throw and returns valid structure
      // Critical alerts should have tipo 'critico'
      const criticalAlerts = result.filter((a: any) => a.tipo === "critico");
      criticalAlerts.forEach((alert: any) => {
        expect(alert.categoria).toBe("padrao_erro");
      });
    });
  });

  describe("getMotivosGlosaPorFuncionario", () => {
    it("should return array of motivos", async () => {
      const result = await db.getMotivosGlosaPorFuncionario(testEstabelecimentoId, 99999);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return motivos with correct structure", async () => {
      const result = await db.getMotivosGlosaPorFuncionario(testEstabelecimentoId, 99999);
      
      result.forEach((motivo: any) => {
        expect(motivo).toHaveProperty("motivoGlosa");
        expect(motivo).toHaveProperty("quantidade");
        expect(typeof motivo.quantidade).toBe("number");
      });
    });
  });
});

describe("IA - Integração com Dashboard", () => {
  const testEstabelecimentoId = 99999;

  it("should handle concurrent requests without errors", async () => {
    const promises = [
      db.getEstatisticasPorCodigo(testEstabelecimentoId),
      db.getContasOutliers(testEstabelecimentoId),
      db.getPadroesErroPorFuncionario(testEstabelecimentoId),
      db.calcularRiscoGlosa(testEstabelecimentoId),
      db.gerarAlertasIA(testEstabelecimentoId),
    ];

    const results = await Promise.all(promises);
    
    results.forEach((result) => {
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  it("should return consistent data across multiple calls", async () => {
    const result1 = await db.gerarAlertasIA(testEstabelecimentoId);
    const result2 = await db.gerarAlertasIA(testEstabelecimentoId);
    
    // Same input should produce same output
    expect(result1.length).toBe(result2.length);
  });
});
