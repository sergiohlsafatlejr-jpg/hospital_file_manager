import { describe, expect, it } from "vitest";
import { contasPagarImportSchema, parseContasPagarRows, parseDataCivil, parseValorConta } from "../shared/contasPagarImport";

const linha = (overrides: Record<string, unknown> = {}) => ({
  "Descrição": "Conta de teste",
  "Valor": 1200.5,
  "Vencimento": "30/09/2026",
  "Data Pagamento": "02/10/2026",
  "Status": "Pago",
  "Categoria": "Operacional",
  "Centro de Custo": "Administrativo",
  "Observações": "",
  ...overrides,
});

describe("importação de contas a pagar (layout do exportador)", () => {
  it("converte datas brasileiras, ISO e serial Excel sem inverter o mês", () => {
    expect(parseDataCivil("02/10/2026")).toBe("2026-10-02");
    expect(parseDataCivil("2026-09-30")).toBe("2026-09-30");
    expect(parseDataCivil("31/02/2026")).toBeUndefined();
    expect(parseDataCivil("09/30/2026")).toBeUndefined();
    expect(parseDataCivil(1)).toBe("1899-12-31");
    expect(parseDataCivil(1.95)).toBe("1899-12-31");
    expect(parseDataCivil(1, true)).toBe("1904-01-02");
  });

  it("normaliza moeda pt-BR sem converter 1.234,56 em 1.234 ou alterar zero", () => {
    expect(parseValorConta("R$ 1.234,56")).toBe("1234.56");
    expect(parseValorConta("1234,56")).toBe("1234.56");
    expect(parseValorConta(0)).toBe("0.00");
    expect(parseValorConta("-1,00")).toBeUndefined();
    expect(parseValorConta("1.2.3,45")).toBeUndefined();
  });

  it("preserva status, pagamento, referência e zero nas 500 linhas permitidas", () => {
    const rows = Array.from({ length: 500 }, (_, i) => linha({ "Descrição": `Conta sintética ${i + 1}`, ...(i === 0 ? { "Valor": 0 } : {}) }));
    const result = parseContasPagarRows(rows);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(500);
    expect(result.items[0]).toMatchObject({ linha: 2, valor: "0.00", pago: "sim", dataPagamento: "2026-10-02", dataVencimento: "2026-09-30", categoriaNome: "Operacional" });
    expect(contasPagarImportSchema.safeParse({ estabelecimentoId: 1, empresaId: 2, items: result.items }).success).toBe(true);
    expect(contasPagarImportSchema.safeParse({ estabelecimentoId: 1, empresaId: 2, items: [...result.items, result.items[0]] }).success).toBe(false);
  });

  it("bloqueia status conflitante e vencimento ausente sem substituir por hoje", () => {
    const parsed = parseContasPagarRows([
      linha({ "Data Pagamento": "", "Status": "Pendente" }),
      linha({ "Status": "Pendente" }),
      linha({ "Vencimento": "" }),
    ]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].dataPagamento).toBeUndefined();
    expect(parsed.issues).toEqual([{ linha: 3, campo: "Status/Data Pagamento" }, { linha: 4, campo: "Vencimento" }]);
  });

  it("aponta a linha duplicada antes de autorizar o envio", () => {
    const parsed = parseContasPagarRows([linha(), linha()]);
    expect(parsed.issues).toEqual([{ linha: 3, campo: "Duplicidade com linha 2" }]);
  });

  it("rejeita payload sem empresa ou estabelecimento e data inválida no servidor", () => {
    const item = parseContasPagarRows([linha()]).items[0];
    expect(contasPagarImportSchema.safeParse({ estabelecimentoId: 0, empresaId: 2, items: [item] }).success).toBe(false);
    expect(contasPagarImportSchema.safeParse({ estabelecimentoId: 1, items: [item] }).success).toBe(false);
    expect(contasPagarImportSchema.safeParse({ estabelecimentoId: 1, empresaId: 2, items: [{ ...item, dataVencimento: "2026-02-31" }] }).success).toBe(false);
  });
});
