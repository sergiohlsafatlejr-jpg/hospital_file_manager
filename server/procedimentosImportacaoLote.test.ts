import { describe, expect, it } from "vitest";
import { consolidarProcedimentosUnimed } from "./procedimentosImportacaoLote";

describe("consolidarProcedimentosUnimed", () => {
  it("usa as tabelas auxiliares apenas como lookup e prioriza Dados Completos sobre Site", () => {
    const resultado = consolidarProcedimentosUnimed({
      preco_portes: [
        { codigo: "11A", valor: 1533.7, tipo_de_beneficiario: "REDE PADRAO" },
      ],
      porte_anestesico: [
        { codigo: "AN5", valor: 806.41, tipo_de_beneficiario: "REDE PADRAO" },
      ],
      dados_completo: [
        {
          codigo: "31102360",
          descricao: "Ureterorrenolitotripsia flexível a laser unilateral",
          porte: 5,
          numero_auxiliares: 1,
          valor: "11A",
          tipo_de_beneficiario: "REDE PADRAO",
        },
      ],
      site: [
        {
          codigo: "31102360",
          descricao: "Descrição do Site que deve ser descartada",
          valor: 9999,
          tipo_de_beneficiario: "REDE PADRAO",
        },
        {
          codigo: "10101012",
          descricao: "Consulta exclusiva do Site",
          valor: 150,
          tipo_de_beneficiario: "REDE PADRAO",
        },
      ],
    });

    expect(resultado.totalDuplicadosSite).toBe(1);
    expect(resultado.items).toHaveLength(2);
    expect(resultado.items.map((item) => item.procedimentoFonte)).toEqual(["dados_completo", "site"]);
    expect(resultado.items[0]).toMatchObject({
      codigo: "31102360",
      valor: "1533.70",
      valorPorteAnestesico: "806.41",
      procedimentoFonte: "dados_completo",
    });
    expect(resultado.items.some((item) => item.procedimentoFonte === "preco_portes")).toBe(false);
    expect(resultado.items.some((item) => item.procedimentoFonte === "porte_anestesico")).toBe(false);
  });

  it("mantém o mesmo código quando o tipo de beneficiário é diferente", () => {
    const resultado = consolidarProcedimentosUnimed({
      preco_portes: [{ codigo: "1A", valor: 10, tipo_de_beneficiario: "REDE PADRAO" }],
      porte_anestesico: [{ codigo: "AN0", valor: 0, tipo_de_beneficiario: "REDE PADRAO" }],
      dados_completo: [{
        codigo: "20",
        descricao: "Procedimento de Dados Completos",
        porte: "",
        numero_auxiliares: 0,
        valor: 20,
        tipo_de_beneficiario: "REDE PADRAO",
      }],
      site: [
        { codigo: "10", descricao: "Rede padrão", valor: 10, tipo_de_beneficiario: "REDE PADRAO" },
        { codigo: "10", descricao: "Outra rede", valor: 12, tipo_de_beneficiario: "REDE ESPECIAL" },
      ],
    });

    expect(resultado.items).toHaveLength(3);
  });
});
