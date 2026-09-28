import { describe, expect, it } from "vitest";
import { criarTooltipFinanceiro } from "../client/src/lib/faturadoRecebidoTooltip";

describe("criarTooltipFinanceiro", () => {
  it("monta o detalhamento completo de um mês", () => {
    const model = criarTooltipFinanceiro({
      competencia: "2026-08",
      totalFaturado: 1000,
      totalRecebido: 800,
      totalGlosado: 100,
      totalSaldo: 100,
      glosaARecursar: 25,
      glosaRecursada: 75,
      glosaEmRecurso: 50,
      glosaRecuperada: 20,
      glosaAceita: 25,
      percentualRecebido: 80,
      percentualGlosa: 10,
      percentualRecurso: 50,
    }, "mes", { monthLabel: () => "08/2026" });

    expect(model.title).toBe("08/2026");
    expect(model.metrics.find((item) => item.label === "% glosa")?.value).toBe(10);
    expect(model.resourceMetrics.find((item) => item.label === "Recursada")?.value).toBe(75);
    expect(model.resourceMetrics.find((item) => item.label === "Em recurso")?.value).toBe(50);
  });

  it("calcula média e participação para motivos e itens", () => {
    const model = criarTooltipFinanceiro({
      codigo: "9999",
      motivo: "Glosa não informada",
      valorGlosado: 250,
      quantidade: 5,
    }, "ranking", { totalGlosado: 1000 });

    expect(model.title).toBe("Glosa não informada");
    expect(model.metrics.find((item) => item.label === "Média por item")?.value).toBe(50);
    expect(model.metrics.find((item) => item.label === "Participação na glosa")?.value).toBe(25);
  });

  it("não produz percentuais inválidos quando a base é zero", () => {
    const model = criarTooltipFinanceiro({ valorGlosado: 0, quantidade: 0 }, "ranking", { totalGlosado: 0 });
    expect(model.metrics.every((item) => Number.isFinite(item.value))).toBe(true);
  });
});
