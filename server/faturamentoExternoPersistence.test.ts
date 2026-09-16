import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getRawPool: vi.fn(async () => ({ execute })),
}));

import { salvarFaturamentoExternoManual } from "./faturamentoExterno";

describe("persistência do faturamento externo manual", () => {
  beforeEach(() => execute.mockReset());

  it("rejeita duplicidade por estabelecimento, convênio e competência", async () => {
    execute.mockResolvedValueOnce([[{ id: 99 }], []]);

    await expect(salvarFaturamentoExternoManual({
      estabelecimentoId: 3,
      convenio: "Ipasgo",
      mesAno: "2026/08",
      valorFaturado: 100,
      valorRecebido: 90,
      valorGlosado: 10,
    }, 1, "Auditor")).rejects.toThrow("Já existe um lançamento");

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
