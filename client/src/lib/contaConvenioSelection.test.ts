import { describe, expect, it } from "vitest";
import {
  montarPayloadComparacaoConta,
  obterHospitalOrigemConta,
} from "../pages/ContaConvenio";

describe("seleção de hospital de origem da Conta Convênio", () => {
  it("prioriza sourceHospital sobre a central SAFATLE ao abrir ou comparar a conta", () => {
    const conta = {
      numeroConta: "CONTA-IGUAL-EM-DOIS-HOSPITAIS",
      estabelecimentoId: 2160001,
      sourceHospital: { estabelecimentoId: 42 },
      origem: "BANCO_CLIENTE",
    };

    expect(obterHospitalOrigemConta(conta)).toBe(42);
    expect(montarPayloadComparacaoConta(conta)).toEqual({
      numeroConta: "CONTA-IGUAL-EM-DOIS-HOSPITAIS",
      estabelecimentoId: 42,
    });
  });

  it("mantém a versão XML e o hospital de origem no escopo médico", () => {
    const payload = montarPayloadComparacaoConta({
      numeroConta: "GUIA-100",
      estabelecimentoId: 2160001,
      sourceHospitalId: 77,
      origem: "XML",
      arquivoHospitalId: 2160001,
      convenioId: 12,
      numeroLote: "LOTE-9",
      competencia: "2026/10",
    });

    expect(payload).toEqual({
      numeroConta: "GUIA-100",
      estabelecimentoId: 77,
      contextoMedicoScope: {
        numeroConta: "GUIA-100",
        estabelecimentoId: 77,
        arquivoHospitalId: 2160001,
        convenioId: 12,
        numeroLote: "LOTE-9",
        competencia: "2026/10",
      },
    });
  });

  it("não monta mutação para uma conta sem hospital de origem além da central", () => {
    expect(
      montarPayloadComparacaoConta({
        numeroConta: "CONTA-SEM-ORIGEM",
        estabelecimentoId: 2160001,
        origem: "BANCO_CLIENTE",
      }),
    ).toBeNull();
  });
});
