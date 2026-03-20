import { describe, it, expect, vi } from "vitest";

/**
 * Testes para a lógica de separação próprio/terceiro
 * baseada no codigoPrestadorExecutante vs códigos cadastrados
 */

describe("Separação Próprio/Terceiro", () => {
  // Simular os códigos cadastrados do estabelecimento
  const codigosCadastrados = ["1101060", "05562645000131", "01545649000150"];

  function isTerceiro(codigoPrestadorExecutante: string | null | undefined, codigosCadastrados: string[]): boolean {
    if (!codigosCadastrados.length) return false; // Sem códigos cadastrados, não pode separar
    if (!codigoPrestadorExecutante) return false; // Sem código (null, undefined, ""), assume próprio (dados antigos)
    return !codigosCadastrados.includes(codigoPrestadorExecutante);
  }

  it("deve identificar item próprio quando código está na lista cadastrada", () => {
    expect(isTerceiro("1101060", codigosCadastrados)).toBe(false);
    expect(isTerceiro("05562645000131", codigosCadastrados)).toBe(false);
    expect(isTerceiro("01545649000150", codigosCadastrados)).toBe(false);
  });

  it("deve identificar item de terceiro quando código NÃO está na lista cadastrada", () => {
    expect(isTerceiro("9999999", codigosCadastrados)).toBe(true);
    expect(isTerceiro("00000000000000", codigosCadastrados)).toBe(true);
    expect(isTerceiro("OUTRO_CODIGO", codigosCadastrados)).toBe(true);
  });

  it("deve tratar item sem código como próprio (dados antigos)", () => {
    expect(isTerceiro(null, codigosCadastrados)).toBe(false);
    expect(isTerceiro(undefined, codigosCadastrados)).toBe(false);
    expect(isTerceiro("", codigosCadastrados)).toBe(false); // String vazia é tratada como sem código (dados antigos)
  });

  it("deve tratar todos como próprios quando não há códigos cadastrados", () => {
    expect(isTerceiro("1101060", [])).toBe(false);
    expect(isTerceiro("9999999", [])).toBe(false);
    expect(isTerceiro(null, [])).toBe(false);
  });

  it("deve filtrar guias corretamente por tipo", () => {
    const guias = [
      { guia: "001", codigoPrestadorExecutante: "1101060" },    // próprio
      { guia: "002", codigoPrestadorExecutante: "9999999" },    // terceiro
      { guia: "003", codigoPrestadorExecutante: null },          // próprio (sem código)
      { guia: "004", codigoPrestadorExecutante: "05562645000131" }, // próprio
      { guia: "005", codigoPrestadorExecutante: "TERCEIRO_123" },  // terceiro
    ];

    const proprias = guias.filter(g => !isTerceiro(g.codigoPrestadorExecutante, codigosCadastrados));
    const terceiros = guias.filter(g => isTerceiro(g.codigoPrestadorExecutante, codigosCadastrados));

    expect(proprias).toHaveLength(3);
    expect(proprias.map(g => g.guia)).toEqual(["001", "003", "004"]);

    expect(terceiros).toHaveLength(2);
    expect(terceiros.map(g => g.guia)).toEqual(["002", "005"]);
  });

  it("terceiros não devem ser selecionáveis para geração de XML", () => {
    const guias = [
      { guia: "001", codigoPrestadorExecutante: "1101060", xmlGerado: 0 },
      { guia: "002", codigoPrestadorExecutante: "9999999", xmlGerado: 0 },
      { guia: "003", codigoPrestadorExecutante: "05562645000131", xmlGerado: 1 },
    ];

    // Simular seleção de "todas pendentes" (excluindo terceiros)
    const selecionaveis = guias
      .filter(g => !Number(g.xmlGerado) && !isTerceiro(g.codigoPrestadorExecutante, codigosCadastrados))
      .map(g => g.guia);

    expect(selecionaveis).toEqual(["001"]);
    expect(selecionaveis).not.toContain("002"); // terceiro excluído
    expect(selecionaveis).not.toContain("003"); // já gerado excluído
  });
});
