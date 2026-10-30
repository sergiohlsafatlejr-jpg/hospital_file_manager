import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do getDb
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock do drizzle-orm
vi.mock("drizzle-orm", () => ({
  sql: { raw: (str: string) => str },
  eq: (a: any, b: any) => ({ field: a, value: b }),
}));

// Mock do schema
vi.mock("../drizzle/schema", () => ({
  estabelecimentoFonteRelatorios: {
    estabelecimentoId: "estabelecimentoId",
    id: "id",
  },
}));

import { getDb } from "./db";
import {
  obterConfiguracaoFonte,
  buscarRelatorioUnificado,
  listarConveniosUnificado,
  buscarTabelaPorConvenioUnificado,
} from "./fonteRelatoriosService";

const mockGetDb = getDb as unknown as ReturnType<typeof vi.fn>;

describe("fonteRelatoriosService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("obterConfiguracaoFonte", () => {
    it("deve retornar configuração padrão (integ_faturado) quando não há config no banco", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const config = await obterConfiguracaoFonte(999);

      expect(config.fonteFaturamento).toBe("integ_faturado");
      expect(config.origemPreferida).toBe("AMBOS");
      expect(config.estabelecimentoId).toBe(999);
    });

    it("deve retornar configuração do banco quando existe", async () => {
      const mockConfig = {
        id: 1,
        estabelecimentoId: 1260036,
        fonteFaturamento: "integ_faturado",
        origemPreferida: "AMBOS",
        sistemaOrigem: "Warleine",
        mapeamentoCampos: null,
      };
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockConfig]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const config = await obterConfiguracaoFonte(1260036);

      expect(config.fonteFaturamento).toBe("integ_faturado");
      expect(config.sistemaOrigem).toBe("Warleine");
      expect(config.estabelecimentoId).toBe(1260036);
    });

    it("deve lançar erro quando database não está disponível", async () => {
      mockGetDb.mockResolvedValue(null);

      await expect(obterConfiguracaoFonte(1)).rejects.toThrow("Database não disponível");
    });
  });

  describe("buscarRelatorioUnificado", () => {
    it("deve usar integ_faturado para estabelecimentos com essa configuração", async () => {
      // Mock config lookup
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          estabelecimentoId: 1260036,
          fonteFaturamento: "integ_faturado",
          origemPreferida: "AMBOS",
          sistemaOrigem: "Warleine",
          mapeamentoCampos: null,
        }]),
        execute: vi.fn().mockResolvedValue([[{
          total_faturado: "1000.00",
          qtd_contas: 5,
          qtd_itens: 50,
        }]]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const resultado = await buscarRelatorioUnificado({
        estabelecimentoId: 1260036,
        anoAtual: 2026,
        anoAnterior: 2025,
      });

      expect(resultado.fonte).toBe("integ_faturado");
      expect(resultado.sistemaOrigem).toBe("Warleine");
      expect(resultado.acumulado.anoAtual).toBe(2026);
      expect(resultado.acumulado.anoAnterior).toBe(2025);
    });

    it("deve usar contas_convenio_itens para estabelecimentos XML", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 2,
          estabelecimentoId: 100,
          fonteFaturamento: "contas_convenio_itens",
          origemPreferida: "XML",
          sistemaOrigem: null,
          mapeamentoCampos: null,
        }]),
        execute: vi.fn().mockResolvedValue([[{
          total_faturado: "500.00",
          qtd_contas: 3,
          qtd_itens: 20,
        }]]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const resultado = await buscarRelatorioUnificado({
        estabelecimentoId: 100,
        anoAtual: 2026,
        anoAnterior: 2025,
      });

      expect(resultado.fonte).toBe("contas_convenio_itens");
    });

    it("deve fazer fallback automático para contas_convenio_itens quando integ_faturado retorna 0 contas", async () => {
      const executeMock = vi.fn()
        // 7 chamadas iniciais de integ_faturado vazias
        .mockResolvedValueOnce([[{ total_faturado: "0.00", qtd_contas: 0, qtd_itens: 0 }]])
        .mockResolvedValueOnce([[{ total_faturado: "0.00", qtd_contas: 0, qtd_itens: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        // Fallback para contas_convenio_itens com dados do XML importado na Fábrica
        .mockResolvedValue([[{
          total_faturado: "2450.00",
          qtd_contas: 2,
          qtd_itens: 14,
        }]]);

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // sem config cadastrada => padrão integ_faturado
        execute: executeMock,
      };
      mockGetDb.mockResolvedValue(mockDb);

      const resultado = await buscarRelatorioUnificado({
        estabelecimentoId: 3,
        anoAtual: 2026,
        anoAnterior: 2025,
      });

      expect(resultado.acumulado.totalFaturadoAtual).toBe(2450);
      expect(resultado.acumulado.qtdContasAtual).toBe(2);
    });
  });

  describe("listarConveniosUnificado", () => {
    it("deve retornar lista de convênios da fonte correta", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          estabelecimentoId: 1260036,
          fonteFaturamento: "integ_faturado",
          origemPreferida: "AMBOS",
          sistemaOrigem: "Warleine",
          mapeamentoCampos: null,
        }]),
        execute: vi.fn().mockResolvedValue([[
          { convenio: "UNIMED" },
          { convenio: "BRADESCO" },
          { convenio: "AMIL" },
        ]]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const convenios = await listarConveniosUnificado(1260036);

      expect(convenios).toContain("UNIMED");
      expect(convenios).toContain("BRADESCO");
      expect(convenios).toContain("AMIL");
    });
  });

  describe("buscarTabelaPorConvenioUnificado", () => {
    it("deve retornar tabela comparativa de 12 meses", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          estabelecimentoId: 1260036,
          fonteFaturamento: "integ_faturado",
          origemPreferida: "AMBOS",
          sistemaOrigem: "Warleine",
          mapeamentoCampos: null,
        }]),
        execute: vi.fn().mockResolvedValue([[
          { mes_num: "01", total_faturado: "1000.00", qtd_contas: 5 },
          { mes_num: "02", total_faturado: "1500.00", qtd_contas: 8 },
        ]]),
      };
      mockGetDb.mockResolvedValue(mockDb);

      const tabela = await buscarTabelaPorConvenioUnificado({
        estabelecimentoId: 1260036,
        anoAtual: 2026,
        anoAnterior: 2025,
        convenio: "UNIMED",
      });

      expect(tabela).toHaveLength(12);
      expect(tabela[0].mes).toBe("01");
      expect(tabela[0].mesNome).toBe("Janeiro");
      expect(tabela[11].mes).toBe("12");
      expect(tabela[11].mesNome).toBe("Dezembro");
    });
  });
});
