import { describe, expect, it } from "vitest";
import { montarScopeContaContextoMedico } from "./contaContextoMedicoScope";

const itemXml = {
  origem: "XML",
  arquivoId: 101,
  convenioId: 22,
  numeroLote: "LOTE-01",
  competencia: "2026/10",
};

function montarScope(items: Array<Partial<typeof itemXml>>) {
  return montarScopeContaContextoMedico({
    estabelecimentoId: 7,
    numeroConta: "CONTA-123",
    items: items.map(item => ({ ...itemXml, ...item })),
  });
}

describe("montarScopeContaContextoMedico", () => {
  it("usa lote e competência dos itens XML quando o link não os informa", () => {
    const result = montarScope([itemXml, { numeroLote: "LOTE-01", competencia: "2026/10" }]);

    expect(result).toEqual({
      ready: true,
      scope: {
        estabelecimentoId: 7,
        numeroConta: "CONTA-123",
        arquivoHospitalId: 101,
        convenioId: 22,
        numeroLote: "LOTE-01",
        competencia: "2026/10",
      },
    });
  });

  it("bloqueia o contexto quando os itens XML têm mais de um lote ou competência", () => {
    const result = montarScope([
      itemXml,
      { numeroLote: "LOTE-02", competencia: "2026/11" },
    ]);

    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason).toContain("mais de um lote");
      expect(result.reason).toContain("mais de uma competência");
    }
  });

  it("normaliza lote e competência ausentes como strings vazias", () => {
    const result = montarScope([
      { numeroLote: null, competencia: undefined },
      { numeroLote: "   ", competencia: null },
    ]);

    expect(result).toMatchObject({
      ready: true,
      scope: {
        numeroLote: "",
        competencia: "",
      },
    });
  });
});
