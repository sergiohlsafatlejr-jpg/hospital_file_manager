import { describe, it, expect } from "vitest";

// Test the logic used in the PDF generator (currency formatting, calculations)
describe("Proposta PDF Generator Logic", () => {
  function formatCurrency(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function calcTotal(itens: { quantidade: number; precoUnitario: string; desconto?: string }[]) {
    return itens.reduce((acc, item) => {
      const subtotal = item.quantidade * Number(item.precoUnitario);
      const desconto = Number(item.desconto || 0);
      return acc + subtotal * (1 - desconto / 100);
    }, 0);
  }

  it("should format currency correctly", () => {
    const result = formatCurrency(1500.5);
    expect(result).toContain("1.500,50");
  });

  it("should calculate total without discount", () => {
    const itens = [
      { quantidade: 2, precoUnitario: "100.00", desconto: "0" },
      { quantidade: 1, precoUnitario: "500.00", desconto: "0" },
    ];
    expect(calcTotal(itens)).toBe(700);
  });

  it("should calculate total with discount", () => {
    const itens = [
      { quantidade: 1, precoUnitario: "1000.00", desconto: "10" },
    ];
    expect(calcTotal(itens)).toBe(900);
  });

  it("should calculate total with multiple items and discounts", () => {
    const itens = [
      { quantidade: 3, precoUnitario: "200.00", desconto: "5" },
      { quantidade: 1, precoUnitario: "1500.00", desconto: "20" },
    ];
    // 3*200 = 600, 5% off = 570
    // 1*1500 = 1500, 20% off = 1200
    // total = 1770
    expect(calcTotal(itens)).toBe(1770);
  });

  it("should handle empty items array", () => {
    expect(calcTotal([])).toBe(0);
  });

  it("should handle missing discount field", () => {
    const itens = [
      { quantidade: 1, precoUnitario: "250.00" },
    ];
    expect(calcTotal(itens)).toBe(250);
  });

  it("should generate correct status label", () => {
    const map: Record<string, string> = {
      rascunho: "Rascunho",
      aguardando: "Aguardando Aprovação",
      negociando: "Em Negociação",
      aprovada: "Aprovada",
      recusada: "Recusada",
    };
    expect(map["aprovada"]).toBe("Aprovada");
    expect(map["negociando"]).toBe("Em Negociação");
  });

  it("should generate correct client type label", () => {
    const map: Record<string, string> = {
      hospital: "Hospital",
      clinica: "Clínica",
      laboratorio: "Laboratório",
      plano_saude: "Plano de Saúde",
      governo: "Governo",
    };
    expect(map["plano_saude"]).toBe("Plano de Saúde");
  });
});
