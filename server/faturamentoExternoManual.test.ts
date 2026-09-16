import { describe, expect, it } from "vitest";
import { normalizarLancamentoManual } from "./faturamentoExterno";

describe("faturamento externo manual", () => {
  it("normaliza convênio, prestador, observação e valores monetários", () => {
    const item = normalizarLancamentoManual({
      estabelecimentoId: 3,
      convenio: "  Saúde   Caixa  ",
      mesAno: " 2026/08 ",
      codigoPrestador: "  12345  ",
      valorFaturado: 100.129,
      valorRecebido: 80.125,
      valorGlosado: 19.999,
      observacao: "  Fechamento conferido  ",
    });

    expect(item).toMatchObject({
      estabelecimentoId: 3,
      convenio: "Saúde Caixa",
      mesAno: "2026/08",
      codigoPrestador: "12345",
      valorFaturado: 100.13,
      valorRecebido: 80.13,
      valorGlosado: 20,
      observacao: "Fechamento conferido",
    });
  });

  it("converte campos opcionais vazios para nulo sem inventar valores", () => {
    const item = normalizarLancamentoManual({
      estabelecimentoId: 1,
      convenio: "Cassi",
      mesAno: "2026/07",
      codigoPrestador: " ",
      valorFaturado: 0,
      valorRecebido: 50,
      valorGlosado: 0,
      observacao: "",
    });

    expect(item.codigoPrestador).toBeNull();
    expect(item.observacao).toBeNull();
    expect(item.valorFaturado).toBe(0);
    expect(item.valorRecebido).toBe(50);
    expect(item.valorGlosado).toBe(0);
  });
});
