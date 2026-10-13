import { describe, expect, it } from "vitest";
import { avaliarComparativoItem, type HupComparativoItemEstrutural } from "../shared/hupComparativoPresentation";

function item(extra: Partial<HupComparativoItemEstrutural> = {}): HupComparativoItemEstrutural {
  return {
    modalidade: "S",
    status: "candidato",
    numeroCandidatos: 1,
    dataItem: "2026-08-25",
    valorFaturado: "100.00",
    valorPagoCandidato: "80.00",
    valorGlosaCandidata: "20.00",
    candidatos: [{ dataItem: "2026-08-25" }],
    ...extra,
  };
}

describe("avaliarComparativoItem", () => {
  it("calcula apenas o candidato hospitalar único com data provada, inclusive valores zero", () => {
    expect(avaliarComparativoItem(item({ valorFaturado: "0", valorPagoCandidato: "0", valorGlosaCandidata: "0" })))
      .toEqual({ comparavel: true, diferenca: "0.00", motivo: "comparavel" });
  });

  it("não prova diferença quando a data de qualquer fonte falta ou diverge", () => {
    expect(avaliarComparativoItem(item({ dataItem: null }))).toEqual({ comparavel: false, diferenca: null, motivo: "sem_prova_data" });
    expect(avaliarComparativoItem(item({ candidatos: [{ dataItem: "2026-08-26" }] }))).toEqual({ comparavel: false, diferenca: null, motivo: "sem_prova_data" });
  });

  it("preserva ausência de valores, ambiguidade e médico direto sem ratear", () => {
    expect(avaliarComparativoItem(item({ valorPagoCandidato: null }))).toEqual({ comparavel: false, diferenca: null, motivo: "valores_nao_informados" });
    expect(avaliarComparativoItem(item({ status: "ambiguo", numeroCandidatos: 2, candidatos: [{ dataItem: "2026-08-25" }, { dataItem: "2026-08-25" }] })))
      .toEqual({ comparavel: false, diferenca: null, motivo: "ambiguo" });
    expect(avaliarComparativoItem(item({ modalidade: "N" }))).toEqual({ comparavel: false, diferenca: null, motivo: "medico_direto" });
    expect(avaliarComparativoItem(item({ modalidade: "" }))).toEqual({ comparavel: false, diferenca: null, motivo: "dados_incompletos" });
  });

  it("mantém aritmética decimal de alta precisão sem Number", () => {
    expect(avaliarComparativoItem(item({
      valorFaturado: "100000000000000000000000000000000000000000000000000000000000000000000.00000000000000000001",
      valorPagoCandidato: "100000000000000000000000000000000000000000000000000000000000000000000",
      valorGlosaCandidata: "0",
    }))).toEqual({ comparavel: true, diferenca: "0.00000000000000000001", motivo: "comparavel" });
  });
});
