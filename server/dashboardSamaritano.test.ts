import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
}));

import { buscarDashboardSamaritano } from "./dashboardSamaritano";

describe("dashboardSamaritano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar estrutura completa do dashboard com campos recebido e glosado", async () => {
    // Mock KPIs (agora com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[{
      total_registros: "118703",
      total_convenios: "19",
      total_setores: "9",
      total_contas: "8049",
      total_itens_unicos: "1200",
      total_faturado: "2735950.21",
      total_custo: "1227504.25",
      total_vlcusto: "0",
      total_recebido: "2200000.00",
      total_glosado: "135950.21",
      margem: "1508445.96",
    }], []]);

    // Mock evolução mensal (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { competencia: "2025/12", total_registros: "11729", total_contas: "851", faturado: "407867.43", custo: "152885.81", vlcusto: "0", recebido: "350000.00", glosado: "17867.43", margem: "254981.62" },
      { competencia: "2026/01", total_registros: "43790", total_contas: "2797", faturado: "1169578.89", custo: "537248.26", vlcusto: "0", recebido: "1000000.00", glosado: "69578.89", margem: "632330.63" },
    ], []]);

    // Mock top convênios (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { convenio: "IPASGO NOVO", codplaco: "IPN", total_contas: "5000", faturado: "1678130.67", custo: "884572.21", vlcusto: "0", recebido: "1400000.00", glosado: "78130.67" },
      { convenio: "UNIMED GOIANIA", codplaco: "UNI", total_contas: "1500", faturado: "404845.83", custo: "164716.07", vlcusto: "0", recebido: "350000.00", glosado: "14845.83" },
    ], []]);

    // Mock evolução por convênio (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { competencia: "2025/12", convenio: "IPASGO NOVO", codplaco: "IPN", faturado: "260483.24", custo: "115544.94", recebido: "220000.00", glosado: "10483.24" },
      { competencia: "2026/01", convenio: "IPASGO NOVO", codplaco: "IPN", faturado: "783379.41", custo: "419564.69", recebido: "700000.00", glosado: "33379.41" },
    ], []]);

    // Mock top setores (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { setor: "Internação Cirúrgica", total_contas: "2000", total_itens: "500", faturado: "1200000.00", custo: "600000.00", vlcusto: "0", recebido: "1000000.00", glosado: "50000.00" },
      { setor: "Internação Clínica", total_contas: "1500", total_itens: "400", faturado: "800000.00", custo: "400000.00", vlcusto: "0", recebido: "700000.00", glosado: "30000.00" },
    ], []]);

    // Mock evolução por setor (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { competencia: "2025/12", setor: "Internação Cirúrgica", faturado: "300000.00", custo: "150000.00", recebido: "250000.00", glosado: "15000.00" },
    ], []]);

    // Mock distribuição tipo item (com recebido e glosado)
    mockExecute.mockResolvedValueOnce([[
      { tipo: "IC", faturado: "800000.00", custo: "400000.00", recebido: "700000.00", glosado: "30000.00", total_registros: "40000" },
      { tipo: "IG", faturado: "600000.00", custo: "300000.00", recebido: "500000.00", glosado: "25000.00", total_registros: "30000" },
    ], []]);

    // Mock distribuição tipo atendimento
    mockExecute.mockResolvedValueOnce([[
      { tipoatend: "I", total_contas: "5000", faturado: "1500000.00", custo: "700000.00", recebido: "1200000.00", glosado: "80000.00" },
      { tipoatend: "A", total_contas: "2000", faturado: "800000.00", custo: "350000.00", recebido: "650000.00", glosado: "35000.00" },
      { tipoatend: "E", total_contas: "1049", faturado: "435950.21", custo: "177504.25", recebido: "350000.00", glosado: "20950.21" },
    ], []]);

    // Mock glosa por convênio
    mockExecute.mockResolvedValueOnce([[
      { convenio: "IPASGO NOVO", codplaco: "IPN", faturado: "1678130.67", recebido: "1400000.00", glosado: "78130.67", total_contas: "5000" },
    ], []]);

    // Mock competências disponíveis
    mockExecute.mockResolvedValueOnce([[
      { competencia: "2026/03" },
      { competencia: "2026/02" },
      { competencia: "2026/01" },
      { competencia: "2025/12" },
    ], []]);

    // Mock convênios disponíveis
    mockExecute.mockResolvedValueOnce([[
      { convenio: "IPASGO NOVO", codplaco: "IPN" },
      { convenio: "UNIMED GOIANIA", codplaco: "UNI" },
    ], []]);

    // Mock setores disponíveis
    mockExecute.mockResolvedValueOnce([[
      { setor: "Internação Cirúrgica" },
      { setor: "Internação Clínica" },
    ], []]);

    // Mock tipos atendimento disponíveis
    mockExecute.mockResolvedValueOnce([[
      { tipoatend: "I" },
      { tipoatend: "A" },
      { tipoatend: "E" },
    ], []]);

    const result = await buscarDashboardSamaritano(2280016, {});

    // Verificar estrutura completa
    expect(result).toHaveProperty("kpis");
    expect(result).toHaveProperty("evolucaoMensal");
    expect(result).toHaveProperty("topConvenios");
    expect(result).toHaveProperty("topSetores");
    expect(result).toHaveProperty("evolucaoPorConvenio");
    expect(result).toHaveProperty("evolucaoPorSetor");
    expect(result).toHaveProperty("distribuicaoTipoItem");
    expect(result).toHaveProperty("distribuicaoTipoAtend");
    expect(result).toHaveProperty("glosasPorConvenio");
    expect(result).toHaveProperty("competenciasDisponiveis");
    expect(result).toHaveProperty("conveniosDisponiveis");
    expect(result).toHaveProperty("setoresDisponiveis");
    expect(result).toHaveProperty("tiposAtendDisponiveis");
    expect(result.fonte).toBe("samaritano_custo_staging");

    // Verificar KPIs com novos campos
    expect(result.kpis.totalRegistros).toBe(118703);
    expect(result.kpis.totalConvenios).toBe(19);
    expect(result.kpis.totalSetores).toBe(9);
    expect(result.kpis.totalFaturado).toBeGreaterThan(0);
    expect(result.kpis.totalCusto).toBeGreaterThan(0);
    expect(result.kpis.totalRecebido).toBe(2200000);
    expect(result.kpis.totalGlosado).toBe(135950.21);
    expect(result.kpis.margem).toBeGreaterThan(0);
    expect(result.kpis.margemPercent).toBeGreaterThan(0);
    expect(result.kpis.ticketMedio).toBeGreaterThan(0);
    expect(result.kpis.taxaRecebimento).toBeGreaterThan(0);
    expect(result.kpis.taxaGlosa).toBeGreaterThan(0);
    expect(result.kpis.perdaLiquida).toBeGreaterThan(0);

    // Verificar evolução mensal com novos campos
    expect(result.evolucaoMensal).toHaveLength(2);
    expect(result.evolucaoMensal[0].competencia).toBe("2025/12");
    expect(result.evolucaoMensal[0]).toHaveProperty("recebido");
    expect(result.evolucaoMensal[0]).toHaveProperty("glosado");
    expect(result.evolucaoMensal[0]).toHaveProperty("taxaRecebimento");
    expect(result.evolucaoMensal[0]).toHaveProperty("taxaGlosa");

    // Verificar top convênios com novos campos
    expect(result.topConvenios).toHaveLength(2);
    expect(result.topConvenios[0].convenio).toBe("IPASGO NOVO");
    expect(result.topConvenios[0]).toHaveProperty("recebido");
    expect(result.topConvenios[0]).toHaveProperty("glosado");
    expect(result.topConvenios[0]).toHaveProperty("taxaRecebimento");
    expect(result.topConvenios[0]).toHaveProperty("taxaGlosa");

    // Verificar top setores com novos campos
    expect(result.topSetores).toHaveLength(2);
    expect(result.topSetores[0].setor).toBe("Internação Cirúrgica");
    expect(result.topSetores[0]).toHaveProperty("recebido");
    expect(result.topSetores[0]).toHaveProperty("glosado");
    expect(result.topSetores[0]).toHaveProperty("taxaGlosa");

    // Verificar distribuição tipo atendimento
    expect(result.distribuicaoTipoAtend).toHaveLength(3);
    expect(result.distribuicaoTipoAtend[0].tipoLabel).toBe("Internação");
    expect(result.distribuicaoTipoAtend[0]).toHaveProperty("recebido");
    expect(result.distribuicaoTipoAtend[0]).toHaveProperty("glosado");

    // Verificar glosas por convênio
    expect(result.glosasPorConvenio).toHaveLength(1);
    expect(result.glosasPorConvenio[0]).toHaveProperty("glosado");
    expect(result.glosasPorConvenio[0]).toHaveProperty("taxaGlosa");

    // Verificar filtros disponíveis
    expect(result.competenciasDisponiveis).toHaveLength(4);
    expect(result.conveniosDisponiveis).toHaveLength(2);
    expect(result.setoresDisponiveis).toHaveLength(2);
    expect(result.tiposAtendDisponiveis).toHaveLength(3);
  });

  it("deve aplicar filtro de competência nas queries", async () => {
    // Todos os mocks retornam arrays vazios (13 queries agora)
    for (let i = 0; i < 13; i++) {
      mockExecute.mockResolvedValueOnce([[], []]);
    }

    await buscarDashboardSamaritano(2280016, { competencia: "2026/01" });

    expect(mockExecute).toHaveBeenCalled();
    const firstCallArg = mockExecute.mock.calls[0][0];
    const sqlStr = JSON.stringify(firstCallArg);
    expect(sqlStr).toContain("2026/01");
  });

  it("deve aplicar filtro de convênio nas queries", async () => {
    for (let i = 0; i < 13; i++) {
      mockExecute.mockResolvedValueOnce([[], []]);
    }

    await buscarDashboardSamaritano(2280016, { convenio: "IPN" });

    expect(mockExecute).toHaveBeenCalled();
    const firstCallArg = mockExecute.mock.calls[0][0];
    const sqlStr = JSON.stringify(firstCallArg);
    expect(sqlStr).toContain("IPN");
  });

  it("deve aplicar filtro de tipo de atendimento", async () => {
    for (let i = 0; i < 13; i++) {
      mockExecute.mockResolvedValueOnce([[], []]);
    }

    await buscarDashboardSamaritano(2280016, { tipoAtend: "I" });

    expect(mockExecute).toHaveBeenCalled();
    const firstCallArg = mockExecute.mock.calls[0][0];
    const sqlStr = JSON.stringify(firstCallArg);
    expect(sqlStr).toContain("tipoatend = 'I'");
  });

  it("deve aplicar filtro de setor", async () => {
    for (let i = 0; i < 13; i++) {
      mockExecute.mockResolvedValueOnce([[], []]);
    }

    await buscarDashboardSamaritano(2280016, { setor: "Internação Cirúrgica" });

    expect(mockExecute).toHaveBeenCalled();
    const firstCallArg = mockExecute.mock.calls[0][0];
    const sqlStr = JSON.stringify(firstCallArg);
    expect(sqlStr).toContain("Internação Cirúrgica");
  });

  it("deve calcular margem percentual e taxas corretamente", async () => {
    mockExecute.mockResolvedValueOnce([[{
      total_registros: "100",
      total_convenios: "2",
      total_setores: "1",
      total_contas: "10",
      total_itens_unicos: "50",
      total_faturado: "1000.00",
      total_custo: "800.00",
      total_vlcusto: "0",
      total_recebido: "900.00",
      total_glosado: "100.00",
      margem: "200.00",
    }], []]);

    // Restantes mocks vazios
    for (let i = 0; i < 12; i++) {
      mockExecute.mockResolvedValueOnce([[], []]);
    }

    const result = await buscarDashboardSamaritano(2280016, {});

    expect(result.kpis.totalFaturado).toBe(1000);
    expect(result.kpis.totalCusto).toBe(800);
    expect(result.kpis.margem).toBe(200);
    // Margem % = (200 / 800) * 100 = 25%
    expect(result.kpis.margemPercent).toBe(25);
    // Ticket médio = 1000 / 10 = 100
    expect(result.kpis.ticketMedio).toBe(100);
    // Taxa recebimento = (900 / 1000) * 100 = 90%
    expect(result.kpis.taxaRecebimento).toBe(90);
    // Taxa glosa = (100 / 1000) * 100 = 10%
    expect(result.kpis.taxaGlosa).toBe(10);
    // Perda líquida = 1000 - 900 = 100
    expect(result.kpis.perdaLiquida).toBe(100);
    // Recebido
    expect(result.kpis.totalRecebido).toBe(900);
    // Glosado
    expect(result.kpis.totalGlosado).toBe(100);
  });

  it("deve lançar erro quando banco indisponível", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    await expect(buscarDashboardSamaritano(2280016, {})).rejects.toThrow("Banco de dados indisponível");
  });
});
