import { describe, expect, it } from "vitest";
import { agruparResumosContaXml } from "./contasConvenioResumoUtils";

describe("agruparResumosContaXml", () => {
  it("não acumula a mesma conta entre competências diferentes", () => {
    const resumos = agruparResumosContaXml([
      {
        numero_guia_prestador: "74087824",
        numero_lote: "A",
        competencia_xml: "2026/08",
        valor_faturado: "37527.61",
        convenio_nome: "Unimed",
        convenioId: 1,
      },
      {
        numero_guia_prestador: "74087824",
        numero_lote: "A",
        competencia_xml: "2026/09",
        valor_faturado: "13126.15",
        convenio_nome: "Unimed",
        convenioId: 1,
      },
    ]);

    expect(resumos).toHaveLength(2);
    expect(resumos.find((item) => item.competencia === "2026/08")?.valorTotal).toBe(37527.61);
    expect(resumos.find((item) => item.competencia === "2026/09")?.valorTotal).toBe(13126.15);
  });

  it("consolida somente itens da mesma conta, lote e competência", () => {
    const resumos = agruparResumosContaXml([
      {
        numero_guia_prestador: "123",
        numero_lote: "L1",
        data_referencia: "2026-09-01",
        valor_faturado: "100.00",
      },
      {
        numero_guia_prestador: "123",
        numero_lote: "L1",
        data_referencia: "2026-09-15",
        valor_unitario: "20.00",
        quantidade: "2",
      },
      {
        numero_guia_prestador: "123",
        numero_lote: "L2",
        data_referencia: "2026-09-01",
        valor_faturado: "50.00",
      },
    ]);

    expect(resumos).toHaveLength(2);
    expect(resumos.find((item) => item.numeroLote === "L1")).toMatchObject({
      competencia: "2026/09",
      totalItens: 2,
      valorTotal: 140,
    });
  });
});
