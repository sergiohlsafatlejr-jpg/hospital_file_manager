import { describe, expect, it } from "vitest";
import { montarScopeContaContextoMedico } from "./contaContextoMedicoScope";

const base = {
  origem: "XML",
  arquivoId: 31,
  convenioId: 22,
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};

describe("escopo canônico de PDF de prontuário", () => {
  it("usa somente a chave XML completa da conta para habilitar o anexo", () => {
    const result = montarScopeContaContextoMedico({
      estabelecimentoId: 11,
      numeroConta: "CONTA-SINTETICA",
      items: [base, { ...base }],
    });
    expect(result).toEqual({
      ready: true,
      scope: {
        estabelecimentoId: 11,
        convenioId: 22,
        arquivoHospitalId: 31,
        numeroConta: "CONTA-SINTETICA",
        numeroLote: "LOTE-1",
        competencia: "2026/10",
      },
    });
  });

  it.each([
    [{ ...base, arquivoId: 32 }, "arquivo hospitalar"],
    [{ ...base, convenioId: 23 }, "convênio"],
    [{ ...base, numeroLote: "LOTE-2" }, "lote"],
    [{ ...base, competencia: "2026/11" }, "competência"],
  ])("recusa escopo ambíguo ou fora do XML: %o", (alternativo, motivo) => {
    const result = montarScopeContaContextoMedico({
      estabelecimentoId: 11,
      numeroConta: "CONTA-SINTETICA",
      items: [base, alternativo],
    });
    expect(result).toMatchObject({ ready: false, reason: expect.stringContaining(motivo) });
  });
});
