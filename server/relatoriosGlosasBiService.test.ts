import { describe, expect, it } from "vitest";
import { complementarRankingGlosa, montarResumoGlosas, percentualGlosa } from "./relatoriosGlosasBiService";

describe("relatoriosGlosasBiService", () => {
  it("calcula indicadores financeiros sem misturar bases", () => {
    expect(montarResumoGlosas({
      total_pago: "900",
      total_glosa: "100",
      total_itens_glosados: "4",
      total_guias_glosadas: "3",
      glosa_sem_recurso: "40",
      glosa_recursada: "60",
    })).toEqual({
      valorCobrado: 1000,
      valorPago: 900,
      valorGlosado: 100,
      totalItensGlosados: 4,
      totalGuiasGlosadas: 3,
      ticketMedio: 25,
      taxaGlosa: 10,
      glosaSemRecurso: 40,
      glosaRecursada: 60,
      percentualRecursado: 60,
    });
  });

  it("retorna percentuais zerados quando não há base financeira", () => {
    expect(percentualGlosa(10, 0)).toBe(0);
    expect(montarResumoGlosas({}).taxaGlosa).toBe(0);
  });

  it("complementa rankings com taxa, participação e situação do recurso", () => {
    const [item] = complementarRankingGlosa([{
      nome: "Procedimento A",
      valor_pago: "150",
      valor_glosado: "50",
      glosa_sem_recurso: "20",
      glosa_recursada: "30",
      qtd_itens: "2",
    }], 200);

    expect(item.valorCobrado).toBe(200);
    expect(item.percentualTotal).toBe(25);
    expect(item.taxaGlosa).toBe(25);
    expect(item.glosaSemRecurso).toBe(20);
    expect(item.glosaRecursada).toBe(30);
    expect(item.qtdItens).toBe(2);
  });
});
