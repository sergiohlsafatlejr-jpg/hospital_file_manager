import { describe, it, expect } from "vitest";

/**
 * Testa a lógica de separação de prestadores próprios vs terceiros
 * baseada no codigoPrestadorExecutante e nos códigos cadastrados.
 */
describe("Cadastro automático de prestadores terceiros", () => {
  // Simula a lógica de identificação de prestadores não cadastrados
  function identificarPrestadoresNaoCadastrados(
    codigosPrestadores: string[],
    estabelecimentosEncontrados: { codigoPrestador: string; estabelecimentoId: number }[]
  ) {
    return codigosPrestadores.filter(
      (codigo) => !estabelecimentosEncontrados.find((e) => e.codigoPrestador === codigo)
    );
  }

  // Simula a lógica de determinar quais prestadores devem ser cadastrados como terceiros
  function determinarTerceirosCadastrar(
    prestadoresNaoCadastrados: string[],
    estabelecimentoSugerido: { estabelecimentoId: number; codigoPrestador: string } | null,
    convenioId: number | null
  ): string[] {
    if (prestadoresNaoCadastrados.length === 0 || !estabelecimentoSugerido || !convenioId) {
      return [];
    }
    // Todos os não cadastrados serão cadastrados como terceiros
    return prestadoresNaoCadastrados;
  }

  it("deve identificar prestadores não cadastrados corretamente", () => {
    const codigosPrestadores = ["00418954000119", "05046748622", "02357985178", "43342132191"];
    const estabelecimentosEncontrados = [
      { codigoPrestador: "00418954000119", estabelecimentoId: 6 },
    ];

    const naoCadastrados = identificarPrestadoresNaoCadastrados(
      codigosPrestadores,
      estabelecimentosEncontrados
    );

    expect(naoCadastrados).toEqual(["05046748622", "02357985178", "43342132191"]);
    expect(naoCadastrados).not.toContain("00418954000119");
  });

  it("deve retornar lista vazia quando todos os prestadores estão cadastrados", () => {
    const codigosPrestadores = ["00418954000119", "05046748622"];
    const estabelecimentosEncontrados = [
      { codigoPrestador: "00418954000119", estabelecimentoId: 6 },
      { codigoPrestador: "05046748622", estabelecimentoId: 6 },
    ];

    const naoCadastrados = identificarPrestadoresNaoCadastrados(
      codigosPrestadores,
      estabelecimentosEncontrados
    );

    expect(naoCadastrados).toEqual([]);
  });

  it("deve determinar terceiros para cadastro quando há prestador principal e convênio", () => {
    const prestadoresNaoCadastrados = ["05046748622", "02357985178"];
    const estabelecimentoSugerido = { estabelecimentoId: 6, codigoPrestador: "00418954000119" };
    const convenioId = 30001;

    const terceiros = determinarTerceirosCadastrar(
      prestadoresNaoCadastrados,
      estabelecimentoSugerido,
      convenioId
    );

    expect(terceiros).toEqual(["05046748622", "02357985178"]);
    expect(terceiros.length).toBe(2);
  });

  it("não deve cadastrar terceiros quando não há prestador principal detectado", () => {
    const prestadoresNaoCadastrados = ["05046748622", "02357985178"];
    const estabelecimentoSugerido = null;
    const convenioId = 30001;

    const terceiros = determinarTerceirosCadastrar(
      prestadoresNaoCadastrados,
      estabelecimentoSugerido,
      convenioId
    );

    expect(terceiros).toEqual([]);
  });

  it("não deve cadastrar terceiros quando não há convênio selecionado", () => {
    const prestadoresNaoCadastrados = ["05046748622"];
    const estabelecimentoSugerido = { estabelecimentoId: 6, codigoPrestador: "00418954000119" };
    const convenioId = null;

    const terceiros = determinarTerceirosCadastrar(
      prestadoresNaoCadastrados,
      estabelecimentoSugerido,
      convenioId
    );

    expect(terceiros).toEqual([]);
  });

  it("não deve cadastrar terceiros quando a lista de não cadastrados está vazia", () => {
    const prestadoresNaoCadastrados: string[] = [];
    const estabelecimentoSugerido = { estabelecimentoId: 6, codigoPrestador: "00418954000119" };
    const convenioId = 30001;

    const terceiros = determinarTerceirosCadastrar(
      prestadoresNaoCadastrados,
      estabelecimentoSugerido,
      convenioId
    );

    expect(terceiros).toEqual([]);
  });

  // Testa a lógica de separação próprio/terceiro na conciliação
  describe("Separação próprio/terceiro na conciliação", () => {
    function classificarItem(
      codigoPrestadorExecutante: string | null,
      codigosPrestadorEstab: string[]
    ): "proprio" | "terceiro" {
      if (!codigoPrestadorExecutante || codigoPrestadorExecutante === "") {
        return "proprio"; // Sem código = próprio (padrão)
      }
      if (codigosPrestadorEstab.length === 0) {
        return "proprio"; // Sem códigos cadastrados = todos próprios
      }
      return codigosPrestadorEstab.includes(codigoPrestadorExecutante) ? "proprio" : "terceiro";
    }

    it("deve classificar item com código do estabelecimento como próprio", () => {
      expect(classificarItem("00418954000119", ["00418954000119"])).toBe("proprio");
    });

    it("deve classificar item com código diferente como terceiro", () => {
      expect(classificarItem("05046748622", ["00418954000119"])).toBe("terceiro");
    });

    it("deve classificar item sem código como próprio (padrão)", () => {
      expect(classificarItem(null, ["00418954000119"])).toBe("proprio");
      expect(classificarItem("", ["00418954000119"])).toBe("proprio");
    });

    it("deve classificar todos como próprios quando não há códigos cadastrados", () => {
      expect(classificarItem("05046748622", [])).toBe("proprio");
      expect(classificarItem("00418954000119", [])).toBe("proprio");
    });
  });
});
