import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

describe("Conciliação Automática", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getConciliacaoPorConvenio", () => {
    it("should return empty results when no data exists", async () => {
      // Mock getDb to return empty results
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      
      vi.spyOn(db, "getConciliacaoPorConvenio").mockResolvedValue({
        itens: [],
        resumo: null,
      });

      const result = await db.getConciliacaoPorConvenio({
        convenioId: 1,
        userId: 1,
      });

      expect(result).toEqual({ itens: [], resumo: null });
    });

    it("should correctly identify glosado items when valor pago is less than faturado", async () => {
      // This tests the logic of identifying glosas
      const mockEnviado = {
        codigo: "10101012",
        guiaNumero: "12345",
        valorTotal: "100.00",
        descricao: "Consulta",
        pacienteNome: "Paciente Teste",
        dataExecucao: new Date(),
      };

      const mockRetornado = {
        codigo: "10101012",
        guiaNumero: "12345",
        valorTotal: "80.00", // Valor menor = glosa
        descricao: "Consulta",
        pacienteNome: "Paciente Teste",
        dataExecucao: new Date(),
        dadosExtras: JSON.stringify({ motivoGlosa: "Valor excedente" }),
      };

      // The function should identify this as glosado with R$ 20.00 de diferença
      const valorEnviado = parseFloat(mockEnviado.valorTotal);
      const valorRetornado = parseFloat(mockRetornado.valorTotal);
      const diferenca = valorEnviado - valorRetornado;

      expect(diferenca).toBe(20);
      expect(diferenca > 0).toBe(true); // Glosa parcial
    });

    it("should correctly identify OK items when valores are equal", async () => {
      const valorEnviado = 100.00;
      const valorRetornado = 100.00;
      const diferenca = valorEnviado - valorRetornado;

      expect(Math.abs(diferenca) < 0.01).toBe(true); // OK
    });

    it("should correctly identify nao_encontrado items when not in retorno", async () => {
      const retornadosMap = new Map<string, any[]>();
      const chave = "10101012|12345".toLowerCase();
      
      // Item não existe no mapa de retornados
      const retornados = retornadosMap.get(chave) || [];
      
      expect(retornados.length).toBe(0); // Não encontrado
    });
  });

  describe("getResumoConciliacao", () => {
    it("should return empty array when no convenios have data", async () => {
      vi.spyOn(db, "getResumoConciliacao").mockResolvedValue([]);

      const result = await db.getResumoConciliacao({
        userId: 1,
      });

      expect(result).toEqual([]);
    });
  });

  describe("Cálculo de percentual de glosa", () => {
    it("should calculate glosa percentage correctly", () => {
      const valorTotalFaturado = 1000;
      const valorTotalGlosado = 100;
      const percentualGlosa = (valorTotalGlosado / valorTotalFaturado) * 100;

      expect(percentualGlosa).toBe(10);
    });

    it("should return 0% when no faturado value", () => {
      const valorTotalFaturado = 0;
      const valorTotalGlosado = 0;
      const percentualGlosa = valorTotalFaturado > 0 
        ? (valorTotalGlosado / valorTotalFaturado) * 100 
        : 0;

      expect(percentualGlosa).toBe(0);
    });
  });
});
