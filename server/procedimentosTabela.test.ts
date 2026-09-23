import { describe, expect, it } from "vitest";
import {
  detectarFonteProcedimentoPorNome,
  encontrarLinhaCabecalhoProcedimentos,
  normalizarCodigo,
  normalizarProcedimentos,
  parseValor,
} from "./procedimentosTabela";

describe("procedimentosTabela", () => {
  it("detecta a fonte pelo nome dos arquivos de atualização", () => {
    expect(detectarFonteProcedimentoPorNome("atualizacao_Porte_Anestesico.xlsx")).toBe("porte_anestesico");
    expect(detectarFonteProcedimentoPorNome("atualizacao_Preco_Porte.xlsx")).toBe("preco_portes");
    expect(detectarFonteProcedimentoPorNome("atualizacao_Dados_Completo.xlsx")).toBe("dados_completo");
    expect(detectarFonteProcedimentoPorNome("atualizacao_Tabela_Unimed_Site.xlsx")).toBe("site");
  });

  it("encontra o cabeçalho de Dados Completos depois de linhas introdutórias", () => {
    const rows = [
      ["Unimed Goiânia - Terminologia de Procedimentos"],
      [null, "LEGENDA"],
      ["codigo", "descricao", "porte", "numero_auxiliares", "valor", "tipo_de_beneficiario"],
      ["10101012", "Consulta", "", 0, 150, "REDE PADRAO"],
    ];

    expect(encontrarLinhaCabecalhoProcedimentos(rows, "dados_completo")).toBe(2);
  });

  it("normaliza cabeçalhos e códigos sem alterar a regra do importador legado", () => {
    expect(normalizarCodigo("000123", "site")).toBe("123");
    expect(normalizarCodigo("Porte 003", "porte_anestesico")).toBe("3");
  });

  it("interpreta valores brasileiros e valores com ponto decimal", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("12.50")).toBe(12.5);
    expect(parseValor("R$ 8,90")).toBe(8.9);
  });

  it("converte a tabela de dados completos e resolve porte simbólico", () => {
    const result = normalizarProcedimentos(
      [
        {
          CÓDIGO: "00042",
          DESCRIÇÃO: "Procedimento de teste",
          PORTE: "3C",
          NÚMERO_DE_AUXILIARES: "2",
          VALOR: "3C",
          TIPO_DE_BENEFICIÁRIO: "Plano A",
        },
      ],
      "dados_completo",
      new Map([["3C", 425.75]]),
    );

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        codigo: "42",
        nome: "Procedimento de teste",
        valor: "425.75",
        porte: "3C",
        numeroAuxiliares: 2,
        tipoBeneficiario: "Plano A",
      },
    ]);
  });

  it("rejeita porte simbólico sem preço de referência", () => {
    const result = normalizarProcedimentos(
      [{ codigo: "10", descricao: "Sem preço", porte: "9Z", numero_auxiliares: 0, tipo_de_beneficiario: "Plano A", valor: "9Z" }],
      "dados_completo",
    );

    expect(result.items).toHaveLength(0);
    expect(result.errors[0]).toContain("Porte 9Z não encontrado");
  });

  it("resolve a maior parte dos valores simbólicos com a tabela de portes", () => {
    const result = normalizarProcedimentos(
      [
        { codigo: "1", descricao: "A", porte: "3C", numero_auxiliares: 0, valor: "3C", tipo_de_beneficiario: "REDE PADRAO" },
        { codigo: "2", descricao: "B", porte: "4A", numero_auxiliares: 0, valor: "4A", tipo_de_beneficiario: "REDE PADRAO" },
      ],
      "dados_completo",
      new Map([["3C", 300], ["4A", 450]]),
    );

    expect(result.errors).toEqual([]);
    expect(result.items.map((item) => item.valor)).toEqual(["300.00", "450.00"]);
  });
});
