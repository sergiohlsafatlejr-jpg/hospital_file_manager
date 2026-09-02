import { describe, expect, it } from "vitest";
import { calcularValoresRelatorioOxUti, sqlValoresRelatorioOxUti } from "./relatorioOxUtiValores";

describe("valores financeiros do Relatório Ox UTI", () => {
  it("mantém item pago como valor pago", () => {
    expect(calcularValoresRelatorioOxUti({ situacaoItem: "PAGO", valorPago: 100 })).toEqual({
      valorInformado: 100,
      valorPago: 100,
      valorGlosa: 0,
    });
  });

  it("classifica item parcial sem glosa separada como glosado, e não como pago", () => {
    expect(calcularValoresRelatorioOxUti({ situacaoItem: "PARCIAL", valorPago: 40.5 })).toEqual({
      valorInformado: 40.5,
      valorPago: 0,
      valorGlosa: 40.5,
    });
  });

  it("preserva a divisão quando o demonstrativo informa pago e glosa separadamente", () => {
    expect(calcularValoresRelatorioOxUti({
      situacaoItem: "PARCIAL",
      valorInformado: 100,
      valorPago: 80,
      valorGlosa: 20,
    })).toEqual({
      valorInformado: 100,
      valorPago: 80,
      valorGlosa: 20,
    });
  });

  it("não considera itens em análise como pagos", () => {
    expect(calcularValoresRelatorioOxUti({ situacaoItem: "EM ANÁLISE", valorInformado: 75, valorPago: 75 })).toEqual({
      valorInformado: 75,
      valorPago: 0,
      valorGlosa: 0,
    });
  });

  it("gera expressões SQL para os três valores financeiros", () => {
    const expressoes = sqlValoresRelatorioOxUti("d");
    expect(expressoes.valorPago).toContain("PARCIAL");
    expect(expressoes.valorGlosa).toContain("valor_glosa");
    expect(expressoes.valorInformado).toContain("valor_informado");
  });
});
