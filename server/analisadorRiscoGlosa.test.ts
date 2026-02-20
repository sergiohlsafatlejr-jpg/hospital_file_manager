import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalisadorRiscoGlosa } from "./analisadorRiscoGlosa";

// Mock da função getDb
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("AnalisadorRiscoGlosa", () => {
  describe("analisarPadroesRecebimento", () => {
    it("deve retornar array vazio quando não há dados", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue({
        execute: vi.fn().mockResolvedValue([]),
      } as any);

      const resultado = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(1);
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBe(0);
    });

    it("deve processar dados brutos e calcular padrões", async () => {
      const { getDb } = await import("./db");
      
      // Mock de dados brutos
      const dadosBrutos = [
        {
          codigo_item: "001",
          descricao_item: "Consulta Médica",
          valor_faturado: 100,
          valor_liberado: 90,
          valor_glosado: 10,
        },
        {
          codigo_item: "001",
          descricao_item: "Consulta Médica",
          valor_faturado: 100,
          valor_liberado: 100,
          valor_glosado: 0,
        },
        {
          codigo_item: "002",
          descricao_item: "Exame",
          valor_faturado: 50,
          valor_liberado: 40,
          valor_glosado: 10,
        },
      ];

      vi.mocked(getDb).mockResolvedValue({
        execute: vi.fn()
          .mockResolvedValueOnce(dadosBrutos) // Primeira chamada retorna dados brutos
          .mockResolvedValueOnce([]) // Motivos de glosa (vazio)
          .mockResolvedValueOnce([]) // Motivos para segundo item
      ,
      } as any);

      const resultado = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(1, 1, 12);
      
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBeGreaterThan(0);
      
      // Verificar primeiro item
      const item001 = resultado.find(p => p.codigoItem === "001");
      expect(item001).toBeDefined();
      expect(item001?.totalFaturado).toBe(2);
      expect(item001?.totalRecebido).toBe(2);
      expect(item001?.totalGlosado).toBe(1);
      expect(item001?.taxaGlosa).toBe(50); // 1/2 = 50%
      expect(item001?.risco).toBe("critico"); // 50% está no range >= 30 = crítico = alto
    });

    it("deve classificar risco corretamente", async () => {
      const { getDb } = await import("./db");
      
      // Dados com diferentes taxas de glosa
      const dadosBrutos = [
        // Taxa baixa: 1/20 = 5%
        ...Array(19).fill(null).map((_, i) => ({
          codigo_item: "LOW",
          descricao_item: "Baixo Risco",
          valor_faturado: 100,
          valor_liberado: 100,
          valor_glosado: 0,
        })),
        {
          codigo_item: "LOW",
          descricao_item: "Baixo Risco",
          valor_faturado: 100,
          valor_liberado: 95,
          valor_glosado: 5,
        },
        // Taxa crítica: 5/5 = 100%
        ...Array(5).fill(null).map((_, i) => ({
          codigo_item: "CRIT",
          descricao_item: "Crítico",
          valor_faturado: 100,
          valor_liberado: 0,
          valor_glosado: 100,
        })),
      ];

      vi.mocked(getDb).mockResolvedValue({
        execute: vi.fn()
          .mockResolvedValueOnce(dadosBrutos)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
        ,
      } as any);

      const resultado = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(1, 1, 12);
      
      const baixoRisco = resultado.find(p => p.codigoItem === "LOW");
      const critico = resultado.find(p => p.codigoItem === "CRIT");
      
      expect(baixoRisco?.risco).toBe("medio"); // 5% está no range 5-15 = médio
      expect(critico?.risco).toBe("critico"); // 100% >= 30 = crítico
    });

    it("deve calcular valores médios corretamente", async () => {
      const { getDb } = await import("./db");
      
      const dadosBrutos = [
        {
          codigo_item: "001",
          descricao_item: "Item",
          valor_faturado: 100,
          valor_liberado: 90,
          valor_glosado: 10,
        },
        {
          codigo_item: "001",
          descricao_item: "Item",
          valor_faturado: 200,
          valor_liberado: 180,
          valor_glosado: 20,
        },
      ];

      vi.mocked(getDb).mockResolvedValue({
        execute: vi.fn()
          .mockResolvedValueOnce(dadosBrutos)
          .mockResolvedValueOnce([])
        ,
      } as any);

      const resultado = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(1, 1, 12);
      const item = resultado[0];
      
      // Média de faturado: (100 + 200) / 2 = 150
      expect(item.valorMedioFaturado).toBe(150);
      // Média de recebido: (90 + 180) / 2 = 135
      expect(item.valorMedioRecebido).toBe(135);
      // Média de glosado: (10 + 20) / 2 = 15
      expect(item.valorMedioGlosado).toBe(15);
    });

    it("deve ordenar por risco (crítico primeiro)", async () => {
      const { getDb } = await import("./db");
      
      const dadosBrutos = [
        // Risco baixo
        {
          codigo_item: "001",
          descricao_item: "Baixo",
          valor_faturado: 100,
          valor_liberado: 100,
          valor_glosado: 0,
        },
        // Risco crítico
        {
          codigo_item: "002",
          descricao_item: "Crítico",
          valor_faturado: 100,
          valor_liberado: 0,
          valor_glosado: 100,
        },
      ];

      vi.mocked(getDb).mockResolvedValue({
        execute: vi.fn()
          .mockResolvedValueOnce(dadosBrutos)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
        ,
      } as any);

      const resultado = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(1, 1, 12);
      
      // Crítico deve vir primeiro
      expect(resultado[0].risco).toBe("critico");
      expect(resultado[1].risco).toBe("baixo");
    });
  });
});
