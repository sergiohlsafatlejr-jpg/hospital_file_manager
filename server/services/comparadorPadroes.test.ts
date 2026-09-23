import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import { compararItensComPadroes } from "./comparadorPadroes";

describe("compararItensComPadroes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as any);
  });

  it("aceita valores serializados da publicação Warleine sem depender de tabelas XML", async () => {
    const resultado = await compararItensComPadroes({
      numeroConta: "conta-teste",
      estabelecimentoId: 4,
      convenio: null,
      itens: [{
        codigoItem: "90008332",
        descricaoItem: "Item faturado",
        tipoItem: "MEDICAMENTO",
        quantidade: "2.0000",
        valorUnitario: "20.7600",
        valorTotal: "41.5200",
        setor: "CENTRO CIRÚRGICO",
      }],
    });

    expect(resultado.totalItensAnalisados).toBe(1);
    expect(resultado.setoresAnalisados).toEqual(["CENTRO CIRÚRGICO"]);
    expect(resultado.divergencias).toMatchObject([
      { tipo: "COMPOSICAO", severidade: "aviso" },
    ]);
    expect(resultado.statusGeral).toBe("conforme");
  });

  it("retorna resultado vazio determinístico para uma conta publicada sem itens", async () => {
    const resultado = await compararItensComPadroes({
      numeroConta: "conta-vazia",
      estabelecimentoId: 4,
      convenio: "OPERADORA",
      itens: [],
    });

    expect(resultado).toMatchObject({
      totalItensAnalisados: 0,
      totalDivergencias: 0,
      statusGeral: "conforme",
      setoresAnalisados: [],
    });
  });
});
