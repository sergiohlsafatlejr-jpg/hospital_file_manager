import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do getDb
const mockExecute = vi.fn();
const mockSelect = vi.fn();

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

// Ordem das chamadas execute após a correção de filtros:
// 0: competencias FU (faturamento_unificado)
// 1: competencias RE (recebimentos_excel)
// 2: convenios FU
// 3: convenios RE
// 4: setores FU
// 5: faturado por procedimento
// 6: recebido por procedimento
// 7: faturado por mês
// 8: recebido por mês
// 9: faturado por convênio
// 10: recebido por convênio
// 11: faturado por setor

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
    // Ordem: compFU, compRE, convFU, convRE, setores, fatProc, recProc, fatMes, recMes, fatConv, recConv, fatSetor
    mockExecute
      // 0: competencias FU
      .mockResolvedValueOnce([[{ competencia: "2025/01" }, { competencia: "2025/02" }]])
      // 1: competencias RE
      .mockResolvedValueOnce([[]])
      // 2: convenios FU
      .mockResolvedValueOnce([[{ convenio: "UNIMED" }]])
      // 3: convenios RE
      .mockResolvedValueOnce([[]])
      // 4: setores
      .mockResolvedValueOnce([[{ setor: "UTI" }]])
      // 5: faturado por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "10101012", descricaoItem: "Consulta", totalFaturado: "1000.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "10" },
        { codigoItem: "20201014", descricaoItem: "Exame", totalFaturado: "500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "5" },
      ]])
      // 6: recebido por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "10101012", descricaoItem: "Consulta", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // 7: faturado por mês
      .mockResolvedValueOnce([[
        { competencia: "2025/01", totalFaturado: "1500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "15" },
      ]])
      // 8: recebido por mês
      .mockResolvedValueOnce([[
        { competencia: "2025/01", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // 9: faturado por convênio
      .mockResolvedValueOnce([[
        { convenio: "UNIMED", totalFaturado: "1500.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "15" },
      ]])
      // 10: recebido por convênio
      .mockResolvedValueOnce([[
        { convenio: "UNIMED", totalRecebido: "800.00", totalGlosado: "100.00", quantidade: "10" },
      ]])
      // 11: faturado por setor
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

    // Verificar filtros disponíveis (combinados de FU + RE)
    expect(result.filtrosDisponiveis.competencias).toEqual(["2025/02", "2025/01"]);
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
    // A 6ª chamada (índice 5) é faturado por procedimento - deve conter IN clause
    const faturadoQuery = calls[5]?.[0] as string;
    if (faturadoQuery) {
      // Backend normaliza competências para formato YYYY/MM (formato da tabela faturamento_unificado)
      expect(faturadoQuery).toContain("'2025/01'");
      expect(faturadoQuery).toContain("'2025/02'");
      expect(faturadoQuery).toContain("'UNIMED'");
    }
  });

  it("deve calcular taxas corretamente", async () => {
    mockExecute
      // 0: compFU
      .mockResolvedValueOnce([[]])
      // 1: compRE
      .mockResolvedValueOnce([[]])
      // 2: convFU
      .mockResolvedValueOnce([[]])
      // 3: convRE
      .mockResolvedValueOnce([[]])
      // 4: setores
      .mockResolvedValueOnce([[]])
      // 5: faturado por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "001", descricaoItem: "Proc A", totalFaturado: "200.00", totalRecebidoFU: "0", totalGlosadoFU: "0", quantidade: "2" },
      ]])
      // 6: recebido por procedimento
      .mockResolvedValueOnce([[
        { codigoItem: "001", descricaoItem: "Proc A", totalRecebido: "160.00", totalGlosado: "20.00", quantidade: "2" },
      ]])
      // 7-11: restantes vazios
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

  it("deve combinar competências de FU e RE sem duplicatas", async () => {
    mockExecute
      // 0: compFU - tem 2026/01
      .mockResolvedValueOnce([[{ competencia: "2026/01" }, { competencia: "2025/12" }]])
      // 1: compRE - tem 2026/03, 2026/02, 2026/01 (duplicado)
      .mockResolvedValueOnce([[
        { competencia: "2026/03" },
        { competencia: "2026/02" },
        { competencia: "2026/01" },
      ]])
      // restantes
      .mockResolvedValue([[]]);

    const result = await getDadosBIFaturadoRecebido({ estabelecimentoId: 1 });

    // Deve ter 4 competências únicas, ordenadas decrescente
    expect(result.filtrosDisponiveis.competencias).toEqual(["2026/03", "2026/02", "2026/01", "2025/12"]);
  });

  it("deve lançar erro quando database não está disponível", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    await expect(
      getDadosBIFaturadoRecebido({ estabelecimentoId: 1 })
    ).rejects.toThrow("Database não disponível");
  });
});
