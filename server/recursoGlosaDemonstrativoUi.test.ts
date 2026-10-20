import { describe, expect, it } from "vitest";
import {
  chaveMotivoGlosa,
  criarEscopoDemonstrativo,
  derivarOpcoesMotivoGlosa,
  escopoMudou,
  filtrarDetalhePorMotivos,
  idsRecebimentosVisiveis,
  reconciliarSelecao,
} from "../client/src/components/recurso-glosa/recursoGlosaDemonstrativo";

describe("helpers da UI do demonstrativo de recurso de glosa", () => {
  const detalhes = [
    { id: 0, codigoGlosa: "1714", motivoGlosa: "texto A" },
    { id: 2, codigoGlosa: "1714", motivoGlosa: "outro texto" },
    { id: 3, codigoGlosa: "1426", motivoGlosa: "texto B" },
    { id: 4, codigoGlosa: null, motivoGlosa: null },
  ];

  it("mantém [] como todas as opções ao recortar uma seleção", () => {
    expect(filtrarDetalhePorMotivos(detalhes, [])).toEqual(detalhes);
  });

  it("deriva motivos por combinação de código e texto, inclusive dados ausentes", () => {
    const opcoes = derivarOpcoesMotivoGlosa(detalhes);

    expect(opcoes).toHaveLength(4);
    expect(opcoes.map((opcao) => opcao.label)).toEqual([
      "1714 · texto A",
      "1714 · outro texto",
      "1426 · texto B",
      "— · —",
    ]);
    expect(new Set(opcoes.map((opcao) => opcao.value)).size).toBe(4);
  });

  it("filtra somente o detalhe do item pela combinação exata, sem ocultar texto ambíguo", () => {
    const apenasTextoA = chaveMotivoGlosa({ codigoGlosa: "1714", motivoGlosa: "texto A" });

    expect(filtrarDetalhePorMotivos(detalhes, [apenasTextoA]).map((detalhe) => detalhe.id)).toEqual([0]);
  });

  it("reconcilia filtros dependentes e detecta mudança de escopo para reset", () => {
    const escopoInicial = criarEscopoDemonstrativo({
      estabelecimentoId: 7,
      competencias: ["2026-02"],
      datasPagto: ["2026-03-04"],
      convenioId: 12,
    });
    const escopoComNovoConvenio = criarEscopoDemonstrativo({
      estabelecimentoId: 7,
      competencias: ["2026-02"],
      datasPagto: ["2026-03-04"],
      convenioId: 13,
    });

    expect(reconciliarSelecao(["2026-03-04", "invalida"], ["2026-03-04"])).toEqual(["2026-03-04"]);
    expect(escopoMudou(escopoInicial, escopoComNovoConvenio)).toBe(true);
    expect(escopoMudou(escopoInicial, escopoInicial)).toBe(false);
  });

  it("usa somente IDs visíveis nas ações e preserva ID zero", () => {
    expect(idsRecebimentosVisiveis([
      { id: 0 },
      { id: 2 },
      { id: 2 },
      { id: Number.NaN },
    ])).toEqual([0, 2]);
  });
});
