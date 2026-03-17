import { describe, it, expect } from "vitest";

/**
 * Testes para a funcionalidade Custos por Setor
 * Valida a lógica de agrupamento, cálculo de margem e filtragem
 */

// Simula a lógica de agrupamento por setor (mesma lógica do backend)
interface LancamentoSetor {
  setor: string;
  codprod: string;
  descricao: string;
  tipoprod: string;
  quantidade: number;
  vlcusto: number;
  vlcobrado: number;
  unidade: string;
}

function agruparPorSetor(lancamentos: LancamentoSetor[]) {
  const setorMap = new Map<string, {
    setor: string;
    totalLancamentos: number;
    totalItens: number;
    totalContas: number;
    totalFaturado: number;
    totalCusto: number;
    margem: number;
    margemPercent: number;
    resultado: "lucro" | "prejuizo" | "empate";
    itens: Map<string, { descricao: string; quantidade: number; custoTotal: number; valorCobrado: number; margem: number }>;
  }>();

  for (const l of lancamentos) {
    const existing = setorMap.get(l.setor);
    if (existing) {
      existing.totalLancamentos++;
      existing.totalFaturado += l.vlcobrado;
      existing.totalCusto += l.vlcusto;

      const itemKey = l.codprod;
      const existingItem = existing.itens.get(itemKey);
      if (existingItem) {
        existingItem.quantidade += l.quantidade;
        existingItem.custoTotal += l.vlcusto;
        existingItem.valorCobrado += l.vlcobrado;
        existingItem.margem += (l.vlcobrado - l.vlcusto);
      } else {
        existing.itens.set(itemKey, {
          descricao: l.descricao,
          quantidade: l.quantidade,
          custoTotal: l.vlcusto,
          valorCobrado: l.vlcobrado,
          margem: l.vlcobrado - l.vlcusto,
        });
        existing.totalItens++;
      }
    } else {
      const itens = new Map();
      itens.set(l.codprod, {
        descricao: l.descricao,
        quantidade: l.quantidade,
        custoTotal: l.vlcusto,
        valorCobrado: l.vlcobrado,
        margem: l.vlcobrado - l.vlcusto,
      });
      setorMap.set(l.setor, {
        setor: l.setor,
        totalLancamentos: 1,
        totalItens: 1,
        totalContas: 0,
        totalFaturado: l.vlcobrado,
        totalCusto: l.vlcusto,
        margem: 0,
        margemPercent: 0,
        resultado: "empate",
        itens,
      });
    }
  }

  // Calcular margem e resultado
  for (const [, s] of setorMap) {
    s.margem = s.totalFaturado - s.totalCusto;
    s.margemPercent = s.totalFaturado > 0 ? ((s.margem / s.totalFaturado) * 100) : 0;
    s.resultado = s.margem > 0 ? "lucro" : s.margem < 0 ? "prejuizo" : "empate";
  }

  return Array.from(setorMap.values());
}

function calcularKpis(resumo: ReturnType<typeof agruparPorSetor>) {
  return {
    totalSetores: resumo.length,
    totalLancamentos: resumo.reduce((acc, s) => acc + s.totalLancamentos, 0),
    valorFaturadoTotal: resumo.reduce((acc, s) => acc + s.totalFaturado, 0),
    custoTotal: resumo.reduce((acc, s) => acc + s.totalCusto, 0),
    margemTotal: resumo.reduce((acc, s) => acc + s.margem, 0),
    setoresComLucro: resumo.filter((s) => s.resultado === "lucro").length,
    setoresComPrejuizo: resumo.filter((s) => s.resultado === "prejuizo").length,
  };
}

describe("Custos por Setor - Agrupamento", () => {
  const lancamentos: LancamentoSetor[] = [
    { setor: "UTI", codprod: "MED001", descricao: "Dipirona 500mg", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
    { setor: "UTI", codprod: "MED002", descricao: "Amoxicilina 500mg", tipoprod: "M", quantidade: 5, vlcusto: 100, vlcobrado: 70, unidade: "CP" },
    { setor: "Centro Cirúrgico", codprod: "TAX001", descricao: "Taxa de Sala", tipoprod: "T", quantidade: 1, vlcusto: 200, vlcobrado: 500, unidade: "UN" },
    { setor: "Centro Cirúrgico", codprod: "MED003", descricao: "Anestésico", tipoprod: "M", quantidade: 2, vlcusto: 300, vlcobrado: 400, unidade: "ML" },
    { setor: "Enfermaria", codprod: "MED001", descricao: "Dipirona 500mg", tipoprod: "M", quantidade: 20, vlcusto: 100, vlcobrado: 90, unidade: "CP" },
  ];

  it("deve agrupar lançamentos por setor corretamente", () => {
    const resultado = agruparPorSetor(lancamentos);
    expect(resultado).toHaveLength(3);

    const uti = resultado.find((s) => s.setor === "UTI");
    expect(uti).toBeDefined();
    expect(uti!.totalLancamentos).toBe(2);
    expect(uti!.totalItens).toBe(2);
  });

  it("deve calcular margem corretamente por setor", () => {
    const resultado = agruparPorSetor(lancamentos);

    const uti = resultado.find((s) => s.setor === "UTI")!;
    // UTI: faturado = 80+70 = 150, custo = 50+100 = 150, margem = 0
    expect(uti.totalFaturado).toBe(150);
    expect(uti.totalCusto).toBe(150);
    expect(uti.margem).toBe(0);
    expect(uti.resultado).toBe("empate");

    const cc = resultado.find((s) => s.setor === "Centro Cirúrgico")!;
    // CC: faturado = 500+400 = 900, custo = 200+300 = 500, margem = 400
    expect(cc.totalFaturado).toBe(900);
    expect(cc.totalCusto).toBe(500);
    expect(cc.margem).toBe(400);
    expect(cc.resultado).toBe("lucro");

    const enf = resultado.find((s) => s.setor === "Enfermaria")!;
    // Enfermaria: faturado = 90, custo = 100, margem = -10
    expect(enf.totalFaturado).toBe(90);
    expect(enf.totalCusto).toBe(100);
    expect(enf.margem).toBe(-10);
    expect(enf.resultado).toBe("prejuizo");
  });

  it("deve calcular margem percentual corretamente", () => {
    const resultado = agruparPorSetor(lancamentos);

    const cc = resultado.find((s) => s.setor === "Centro Cirúrgico")!;
    // margem% = (400/900)*100 = 44.44%
    expect(cc.margemPercent).toBeCloseTo(44.44, 1);

    const enf = resultado.find((s) => s.setor === "Enfermaria")!;
    // margem% = (-10/90)*100 = -11.11%
    expect(enf.margemPercent).toBeCloseTo(-11.11, 1);
  });
});

describe("Custos por Setor - KPIs", () => {
  const lancamentos: LancamentoSetor[] = [
    { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
    { setor: "Centro Cirúrgico", codprod: "TAX001", descricao: "Taxa Sala", tipoprod: "T", quantidade: 1, vlcusto: 200, vlcobrado: 500, unidade: "UN" },
    { setor: "Enfermaria", codprod: "MED002", descricao: "Amoxicilina", tipoprod: "M", quantidade: 5, vlcusto: 100, vlcobrado: 90, unidade: "CP" },
  ];

  it("deve calcular KPIs totais corretamente", () => {
    const resumo = agruparPorSetor(lancamentos);
    const kpis = calcularKpis(resumo);

    expect(kpis.totalSetores).toBe(3);
    expect(kpis.totalLancamentos).toBe(3);
    expect(kpis.valorFaturadoTotal).toBe(670); // 80+500+90
    expect(kpis.custoTotal).toBe(350); // 50+200+100
    expect(kpis.margemTotal).toBe(320); // 670-350
  });

  it("deve contar setores com lucro e prejuízo", () => {
    const resumo = agruparPorSetor(lancamentos);
    const kpis = calcularKpis(resumo);

    expect(kpis.setoresComLucro).toBe(2); // UTI (30>0) e CC (300>0)
    expect(kpis.setoresComPrejuizo).toBe(1); // Enfermaria (-10<0)
  });
});

describe("Custos por Setor - Top Itens por Setor", () => {
  it("deve agrupar itens dentro de cada setor", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 5, vlcusto: 25, vlcobrado: 40, unidade: "CP" },
      { setor: "UTI", codprod: "MED002", descricao: "Amoxicilina", tipoprod: "M", quantidade: 3, vlcusto: 60, vlcobrado: 90, unidade: "CP" },
    ];

    const resultado = agruparPorSetor(lancamentos);
    const uti = resultado.find((s) => s.setor === "UTI")!;

    // Deve ter 2 itens únicos (MED001 e MED002)
    expect(uti.totalItens).toBe(2);

    // MED001 deve ter quantidade acumulada
    const med001 = uti.itens.get("MED001")!;
    expect(med001.quantidade).toBe(15); // 10+5
    expect(med001.custoTotal).toBe(75); // 50+25
    expect(med001.valorCobrado).toBe(120); // 80+40
  });
});

describe("Custos por Setor - Filtros", () => {
  it("deve filtrar por setor específico", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
      { setor: "Centro Cirúrgico", codprod: "TAX001", descricao: "Taxa Sala", tipoprod: "T", quantidade: 1, vlcusto: 200, vlcobrado: 500, unidade: "UN" },
    ];

    const filtrado = lancamentos.filter((l) => l.setor === "UTI");
    const resultado = agruparPorSetor(filtrado);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].setor).toBe("UTI");
  });

  it("deve filtrar por busca de descrição", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona 500mg", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
      { setor: "UTI", codprod: "MED002", descricao: "Amoxicilina 500mg", tipoprod: "M", quantidade: 5, vlcusto: 100, vlcobrado: 70, unidade: "CP" },
    ];

    const busca = "dipirona";
    const filtrado = lancamentos.filter((l) => l.descricao.toLowerCase().includes(busca.toLowerCase()));
    const resultado = agruparPorSetor(filtrado);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].totalLancamentos).toBe(1);
  });
});

describe("Custos por Setor - Ranking", () => {
  it("deve ordenar top prejuízo corretamente (menor margem primeiro)", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 100, vlcobrado: 50, unidade: "CP" },
      { setor: "CC", codprod: "TAX001", descricao: "Taxa", tipoprod: "T", quantidade: 1, vlcusto: 500, vlcobrado: 200, unidade: "UN" },
      { setor: "Enf", codprod: "MED002", descricao: "Amox", tipoprod: "M", quantidade: 5, vlcusto: 80, vlcobrado: 90, unidade: "CP" },
    ];

    const resumo = agruparPorSetor(lancamentos);
    const topPrejuizo = resumo
      .filter((s) => s.resultado === "prejuizo")
      .sort((a, b) => a.margem - b.margem);

    expect(topPrejuizo).toHaveLength(2);
    expect(topPrejuizo[0].setor).toBe("CC"); // -300 < -50
    expect(topPrejuizo[1].setor).toBe("UTI"); // -50
  });

  it("deve ordenar top lucro corretamente (maior margem primeiro)", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 200, unidade: "CP" },
      { setor: "CC", codprod: "TAX001", descricao: "Taxa", tipoprod: "T", quantidade: 1, vlcusto: 100, vlcobrado: 500, unidade: "UN" },
    ];

    const resumo = agruparPorSetor(lancamentos);
    const topLucro = resumo
      .filter((s) => s.resultado === "lucro")
      .sort((a, b) => b.margem - a.margem);

    expect(topLucro).toHaveLength(2);
    expect(topLucro[0].setor).toBe("CC"); // 400 > 150
    expect(topLucro[1].setor).toBe("UTI"); // 150
  });
});

describe("Custos por Setor - Casos Especiais", () => {
  it("deve lidar com lista vazia", () => {
    const resultado = agruparPorSetor([]);
    expect(resultado).toHaveLength(0);

    const kpis = calcularKpis(resultado);
    expect(kpis.totalSetores).toBe(0);
    expect(kpis.totalLancamentos).toBe(0);
    expect(kpis.valorFaturadoTotal).toBe(0);
    expect(kpis.custoTotal).toBe(0);
    expect(kpis.margemTotal).toBe(0);
  });

  it("deve lidar com setor único", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 80, unidade: "CP" },
    ];

    const resultado = agruparPorSetor(lancamentos);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].setor).toBe("UTI");
    expect(resultado[0].totalLancamentos).toBe(1);
  });

  it("deve lidar com custo zero (margem = 100%)", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "SRV001", descricao: "Serviço", tipoprod: "S", quantidade: 1, vlcusto: 0, vlcobrado: 100, unidade: "UN" },
    ];

    const resultado = agruparPorSetor(lancamentos);
    expect(resultado[0].margem).toBe(100);
    expect(resultado[0].margemPercent).toBe(100);
    expect(resultado[0].resultado).toBe("lucro");
  });

  it("deve lidar com faturado zero (margem% = 0)", () => {
    const lancamentos: LancamentoSetor[] = [
      { setor: "UTI", codprod: "MED001", descricao: "Dipirona", tipoprod: "M", quantidade: 10, vlcusto: 50, vlcobrado: 0, unidade: "CP" },
    ];

    const resultado = agruparPorSetor(lancamentos);
    expect(resultado[0].margem).toBe(-50);
    expect(resultado[0].margemPercent).toBe(0); // faturado = 0, não divide por zero
    expect(resultado[0].resultado).toBe("prejuizo");
  });
});
