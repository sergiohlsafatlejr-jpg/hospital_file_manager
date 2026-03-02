import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb - precisa retornar um objeto com execute
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
}));

// Import after mocking
import {
  popularDeTasy,
  popularDeXmlTiss,
  popularFaturamentoUnificado,
  listarFaturamentoUnificado,
  resumoFaturamentoPorConvenio,
  resumoFaturamentoPorGuia,
  itensPorGuia,
  competenciasDisponiveis,
  conveniosDisponiveis,
  atualizarStatusConciliacao,
  vincularGuiaManual,
  buscarRecebimentosCandidatos,
} from "./faturamentoUnificadoService";

describe("faturamentoUnificadoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: retorna resultado vazio
    mockExecute.mockResolvedValue([[]]);
  });

  describe("popularDeTasy", () => {
    it("deve chamar execute para popular dados do Tasy", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }]) // DELETE
        .mockResolvedValueOnce([{ affectedRows: 100 }]); // INSERT
      
      const result = await popularDeTasy(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("inseridos");
    });

    it("deve aceitar competência como filtro opcional", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 50 }]);
      
      const result = await popularDeTasy(1, "2025-12");
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("popularDeXmlTiss", () => {
    it("deve chamar execute para popular dados do XML TISS", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 200 }]);
      
      const result = await popularDeXmlTiss(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("inseridos");
    });
  });

  describe("popularFaturamentoUnificado", () => {
    it("deve chamar popularDeTasy e popularDeXmlTiss", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      
      const result = await popularFaturamentoUnificado(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("tasy");
      expect(result).toHaveProperty("xmlTiss");
    });
  });

  describe("resumoFaturamentoPorGuia", () => {
    it("deve retornar resumo com totais", async () => {
      // Primeiro execute retorna resumo, segundo retorna contagem, terceiro retorna contas
      mockExecute
        .mockResolvedValueOnce([[{
          totalItens: 500,
          totalContas: 50,
          totalFaturado: "150000.00",
          totalPago: "120000.00",
          totalGlosado: "30000.00",
          totalPendente: "0.00",
          itensConciliados: 300,
          itensDivergentes: 50,
          itensPendentes: 100,
          itensNaoRecebidos: 50,
        }]])
        .mockResolvedValueOnce([[{ total: 50 }]])
        .mockResolvedValueOnce([[]]);
      
      const result = await resumoFaturamentoPorGuia({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("deve aceitar filtros de competência e convênio", async () => {
      mockExecute
        .mockResolvedValueOnce([[{
          totalItens: 100,
          totalContas: 10,
          totalFaturado: "50000.00",
          totalPago: "40000.00",
          totalGlosado: "10000.00",
          totalPendente: "0.00",
          itensConciliados: 80,
          itensDivergentes: 10,
          itensPendentes: 5,
          itensNaoRecebidos: 5,
        }]])
        .mockResolvedValueOnce([[{ total: 10 }]])
        .mockResolvedValueOnce([[]]);
      
      const result = await resumoFaturamentoPorGuia({
        estabelecimentoId: 1,
        competencia: "2025-12",
        convenio: "IPASGO",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("itensPorGuia", () => {
    it("deve retornar itens de uma guia específica por contaNumero", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          descricaoItem: "Proteínas Totais",
          tipoItem: "PROC",
          quantidade: 1,
          valorFaturado: "4.13",
          valorPago: "4.13",
          valorGlosado: "0.00",
          statusConciliacao: "conciliado",
        },
      ]]);
      
      const result = await itensPorGuia({
        estabelecimentoId: 1,
        contaNumero: "12345",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve retornar itens por numeroGuia", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await itensPorGuia({
        estabelecimentoId: 1,
        numeroGuia: "G001",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("buscarRecebimentosCandidatos", () => {
    it("deve buscar recebimentos por nome do paciente", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          origem: "excel",
          numeroGuia: "18874660",
          nomeBeneficiario: "JOÃO SILVA",
          codigoItem: "40302385",
          descricaoItem: "Proteínas Totais",
          valorPago: "4.13",
          valorGlosa: "0.00",
        },
      ]]);
      
      const result = await buscarRecebimentosCandidatos({
        estabelecimentoId: 1,
        pacienteNome: "João",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("vincularGuiaManual", () => {
    it("deve atualizar os registros de faturamento com o recebimento vinculado", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 3 }]);
      
      const result = await vincularGuiaManual({
        faturamentoIds: [1, 2, 3],
        recebimentoId: 100,
        recebimentoOrigem: "excel",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("atualizados");
    });
  });

  describe("atualizarStatusConciliacao", () => {
    it("deve atualizar o status de conciliação de um item", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      
      await atualizarStatusConciliacao({
        id: 1,
        statusConciliacao: "conciliado",
      });
      
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe("competenciasDisponiveis", () => {
    it("deve retornar lista de competências disponíveis", async () => {
      mockExecute.mockResolvedValueOnce([[
        { competencia: "2025-12", origemSistema: "TASY", total: 500 },
        { competencia: "2025-11", origemSistema: "TASY", total: 300 },
      ]]);
      
      const result = await competenciasDisponiveis(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("conveniosDisponiveis", () => {
    it("deve retornar lista de convênios disponíveis", async () => {
      mockExecute.mockResolvedValueOnce([[
        { convenio: "IPASGO", total: 200 },
        { convenio: "UNIMED", total: 150 },
      ]]);
      
      const result = await conveniosDisponiveis({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve aceitar filtro de competência", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await conveniosDisponiveis({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("listarFaturamentoUnificado", () => {
    it("deve retornar lista paginada de itens", async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 100 }]])
        .mockResolvedValueOnce([[
          {
            id: 1,
            origemSistema: "TASY",
            contaNumero: "12345",
            pacienteNome: "João Silva",
            convenio: "IPASGO",
            competencia: "2025-12",
            codigoItem: "40302385",
            descricaoItem: "Proteínas Totais",
            valorFaturado: "4.13",
            valorPago: "4.13",
            valorGlosado: "0.00",
            statusConciliacao: "conciliado",
          },
        ]]);
      
      const result = await listarFaturamentoUnificado({
        estabelecimentoId: 1,
        limite: 50,
        offset: 0,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("resumoFaturamentoPorConvenio", () => {
    it("deve retornar resumo agrupado por convênio", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          convenio: "IPASGO",
          totalItens: 200,
          totalFaturado: "50000.00",
          totalPago: "40000.00",
          totalGlosado: "10000.00",
        },
      ]]);
      
      const result = await resumoFaturamentoPorConvenio({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
