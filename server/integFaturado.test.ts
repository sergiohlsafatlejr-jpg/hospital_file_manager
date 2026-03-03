import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
}));

import {
  popularDeIntegFaturado,
  popularDeXmlTiss,
  popularFaturamentoUnificado,
} from "./faturamentoUnificadoService";

describe("integFaturado - junção com faturamento_tiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([[]]);
  });

  describe("popularDeIntegFaturado", () => {
    it("deve deletar registros WARLEINE existentes antes de inserir", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 50 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 50 }]]);

      const result = await popularDeIntegFaturado(1);

      expect(result.total).toBe(50);
      expect(mockExecute).toHaveBeenCalledTimes(3);

      // Verificar que a primeira query é DELETE com origemSistema = 'WARLEINE'
      const deleteCall = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(deleteCall).toContain("DELETE");
      expect(deleteCall).toContain("WARLEINE");
    });

    it("deve inserir dados do integ_faturado com mapeamento correto", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 100 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 100 }]]);

      const result = await popularDeIntegFaturado(1);

      expect(result.inseridos).toBe(100);
      expect(result.total).toBe(100);

      // Verificar que a query INSERT SELECT mapeia os campos corretos
      const insertCall = JSON.stringify(mockExecute.mock.calls[1][0]);
      expect(insertCall).toContain("WARLEINE");
      expect(insertCall).toContain("integ_faturado");
      expect(insertCall).toContain("ig.guiacobra");
      expect(insertCall).toContain("ig.procdisco");
      expect(insertCall).toContain("ig.numconta");
      expect(insertCall).toContain("ig.nomeconv");
      expect(insertCall).toContain("ig.vl_faturado");
      expect(insertCall).toContain("ig.mesprod");
    });

    it("deve filtrar por competencia convertendo formato (2025-01 -> 2025/01)", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 30 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 30 }]]);

      const result = await popularDeIntegFaturado(1, "2025-01");

      expect(result.total).toBe(30);

      // Verificar que a query usa o formato 2025/01 para filtrar mesprod
      const insertCall = JSON.stringify(mockExecute.mock.calls[1][0]);
      expect(insertCall).toContain("2025/01");
    });

    it("deve retornar 0 quando nao ha dados no integ_faturado", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT (nenhum registro)
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);

      const result = await popularDeIntegFaturado(1);

      expect(result.inseridos).toBe(0);
      expect(result.total).toBe(0);
    });

    it("deve filtrar por estabelecimentoId correto", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 10 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 10 }]]);

      await popularDeIntegFaturado(42);

      // Verificar que o estabelecimentoId é usado nas queries
      const deleteCall = JSON.stringify(mockExecute.mock.calls[0][0]);
      expect(deleteCall).toContain("42");

      const insertCall = JSON.stringify(mockExecute.mock.calls[1][0]);
      expect(insertCall).toContain("estabelecimento_id = 42");
    });
  });

  describe("popularFaturamentoUnificado (junção)", () => {
    it("deve popular de ambas as fontes: WARLEINE + XML_TISS", async () => {
      // popularDeIntegFaturado: DELETE + INSERT + COUNT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]); // delete WARLEINE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 100 }]); // insert WARLEINE
      mockExecute.mockResolvedValueOnce([[{ total: 100 }]]); // count WARLEINE

      // popularDeXmlTiss: DELETE + INSERT + COUNT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]); // delete XML_TISS
      mockExecute.mockResolvedValueOnce([{ affectedRows: 50 }]); // insert XML_TISS
      mockExecute.mockResolvedValueOnce([[{ total: 50 }]]); // count XML_TISS

      const result = await popularFaturamentoUnificado(1);

      expect(result.warleine.total).toBe(100);
      expect(result.xmlTiss.total).toBe(50);
      expect(result.totalGeral).toBe(150);
    });

    it("deve funcionar quando uma fonte nao tem dados", async () => {
      // WARLEINE: sem dados
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);

      // XML_TISS: com dados
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 80 }]);
      mockExecute.mockResolvedValueOnce([[{ total: 80 }]]);

      const result = await popularFaturamentoUnificado(1);

      expect(result.warleine.total).toBe(0);
      expect(result.xmlTiss.total).toBe(80);
      expect(result.totalGeral).toBe(80);
    });

    it("deve passar competencia para ambas as fontes", async () => {
      // WARLEINE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 20 }]);
      mockExecute.mockResolvedValueOnce([[{ total: 20 }]]);

      // XML_TISS
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([{ affectedRows: 10 }]);
      mockExecute.mockResolvedValueOnce([[{ total: 10 }]]);

      const result = await popularFaturamentoUnificado(1, "2025-01");

      expect(result.totalGeral).toBe(30);

      // Verificar que competencia foi passada para WARLEINE (convertida para 2025/01)
      const warleineInsert = JSON.stringify(mockExecute.mock.calls[1][0]);
      expect(warleineInsert).toContain("2025/01");

      // Verificar que competencia foi passada para XML_TISS
      const xmlInsert = JSON.stringify(mockExecute.mock.calls[4][0]);
      expect(xmlInsert).toContain("2025-01");
    });
  });

  describe("popularDeXmlTiss", () => {
    it("deve inserir dados do faturamento_tiss com origemSistema XML_TISS", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // INSERT SELECT
      mockExecute.mockResolvedValueOnce([{ affectedRows: 87 }]);
      // COUNT
      mockExecute.mockResolvedValueOnce([[{ total: 87 }]]);

      const result = await popularDeXmlTiss(1);

      expect(result.total).toBe(87);

      const insertCall = JSON.stringify(mockExecute.mock.calls[1][0]);
      expect(insertCall).toContain("XML_TISS");
      expect(insertCall).toContain("faturamento_tiss");
    });
  });
});
