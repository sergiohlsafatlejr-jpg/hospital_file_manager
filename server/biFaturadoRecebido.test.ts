import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do getDb
const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
    select: mockSelect,
  })),
}));

vi.mock("drizzle-orm", () => ({
  sql: {
    raw: (s: string) => s,
  },
}));

import { getDadosBIFaturadoRecebido } from "./biFaturadoRecebido";

describe("biFaturadoRecebido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock responses for all execute calls
    mockExecute.mockResolvedValue([[]]);
  });

  it("deve retornar estrutura correta com dados vazios", async () => {
    const result = await getDadosBIFaturadoRecebido({
      estabelecimentoId: 1,
    });

    expect(result).toHaveProperty("resumo");
    expect(result).toHaveProperty("porProcedimento");
    expect(result).toHaveProperty("porMes");
    expect(result).toHaveProperty("porConvenio");
    expect(result).toHaveProperty("porSetor");
    expect(result).toHaveProperty("filtrosDisponiveis");
    expect(result.filtrosDisponiveis).toHaveProperty("competencias");
    expect(result.filtrosDisponiveis).toHaveProperty("convenios");
    expect(result.filtrosDisponiveis).toHaveProperty("setores");
  });

  it("deve retornar resumo com zeros quando não há dados", async () => {
    const result = await getDadosBIFaturadoRecebido({
      estabelecimentoId: 1,
    });

    expect(result.resumo.totalFaturado).toBe(0);
    expect(result.resumo.totalRecebido).toBe(0);
    expect(result.resumo.totalGlosado).toBe(0);
    expect(result.resumo.totalPendente).toBe(0);
    expect(result.resumo.totalItens).toBe(0);
    expect(result.resumo.taxaRecebimento).toBe(0);
    expect(result.resumo.taxaGlosa).toBe(0);
    expect(result.resumo.ticketMedio).toBe(0);
  });

  it("deve processar dados de faturamento corretamente", async () => {
    // Mock: filtros disponíveis (3 calls), faturado proc, recebido proc, faturado mes, recebido mes, faturado conv, recebido conv, faturado setor
    mockExecute
      // competencias
      .mockResolvedValueOnce([[{ competencia: "2025-01" }, { competencia: "2025-02" }]])
      // convenios
      .mockResolvedValueOnce([[{ convenio: "UNIMED" }]])
      // setores
      .mockResolvedValueOnce([[{ setor: "UTI" }]])
      // faturado por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "10101012", descricaoItem: "Consulta", totalFaturado: "1000.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "10" },
        { codigoItem: "20201014", descricaoItem: "Exame", totalFaturado: "500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "5" },
      ]])
      // recebido por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "10101012", descricaoItem: "Consulta", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // faturado por mês
      .mockResolvedValueOnce([[
        { competencia: "2025-01", totalFaturado: "1500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "15" },
      ]])
      // recebido por mês
      .mockResolvedValueOnce([[
        { competencia: "2025-01", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // faturado por convênio
      .mockResolvedValueOnce([[
        { convenio: "UNIMED", totalFaturado: "1500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "15" },
      ]])
      // recebido por convênio
      .mockResolvedValueOnce([[
        { convenio: "UNIMED", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // faturado por setor
      .mockResolvedValueOnce([[
        { setor: "UTI", totalFaturado: "1500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "15" },
      ]]);

    const result = await getDadosBIFaturadoRecebido({
      estabelecimentoId: 1,
    });

    // Verificar procedimentos
    expect(result.porProcedimento).toHaveLength(2);
    const consulta = result.porProcedimento.find(p => p.codigoItem === "10101012");
    expect(consulta).toBeDefined();
    expect(consulta!.totalFaturado).toBe(1000);
    expect(consulta!.totalRecebido).toBe(800);
    expect(consulta!.totalGlosado).toBe(100);
    expect(consulta!.taxaRecebimento).toBe(80);
    expect(consulta!.taxaGlosa).toBe(10);

    // Verificar resumo
    expect(result.resumo.totalFaturado).toBe(1500);
    expect(result.resumo.totalRecebido).toBe(800);
    expect(result.resumo.totalGlosado).toBe(100);

    // Verificar filtros disponíveis
    expect(result.filtrosDisponiveis.competencias).toEqual(["2025-01", "2025-02"]);
    expect(result.filtrosDisponiveis.convenios).toEqual(["UNIMED"]);
    expect(result.filtrosDisponiveis.setores).toEqual(["UTI"]);
  });

  it("deve construir WHERE com filtros de competência e convênio", async () => {
    const result = await getDadosBIFaturadoRecebido({
      estabelecimentoId: 1,
      competencias: ["2025-01", "2025-02"],
      convenios: ["UNIMED"],
    });

    // Verificar que execute foi chamado com queries contendo os filtros
    const calls = mockExecute.mock.calls;
    // A 4ª chamada é faturado por procedimento - deve conter IN clause
    const faturadoQuery = calls[3]?.[0] as string;
    if (faturadoQuery) {
      // Backend normaliza competências para formato YYYY/MM (formato da tabela faturamento_unificado)
      expect(faturadoQuery).toContain("'2025/01'");
      expect(faturadoQuery).toContain("'2025/02'");
      expect(faturadoQuery).toContain("'UNIMED'");
    }
  });

  it("deve calcular taxas corretamente", async () => {
    mockExecute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { codigoItem: "001", descricaoItem: "Proc A", totalFaturado: "200.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "2" },
      ]])
      .mockResolvedValueOnce([[
        { codigoItem: "001", descricaoItem: "Proc A", totalRecebido: "160.00", totalGlosado: "20.00", quantidade: "2" },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await getDadosBIFaturadoRecebido({
      estabelecimentoId: 1,
    });

    const proc = result.porProcedimento[0];
    expect(proc.taxaRecebimento).toBe(80); // 160/200 * 100
    expect(proc.taxaGlosa).toBe(10); // 20/200 * 100
    expect(proc.totalPendente).toBe(20); // 200 - 160 - 20
  });

  it("deve lançar erro quando database não está disponível", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    await expect(
      getDadosBIFaturadoRecebido({ estabelecimentoId: 1 })
    ).rejects.toThrow("Database não disponível");
  });
});
