import { describe, expect, it } from "vitest";
import { avaliarContextoMedicoInformativo } from "./comparadorContextoMedicoInformativo";

function contextoBase() {
  return {
    configuracaoPendente: false,
    diagnosticoSnapshot: null,
    fontes: [
      { arquivoId: 1, registros: 1, codigosDistintos: 1, procedimentos: [] },
    ],
    candidatos: [
      {
        padraoId: 9,
        nome: "Gabarito sintético",
        elegivel: true,
        recomendacao: true,
        motivos: [],
        principaisTotal: 1,
        principaisEncontrados: 1,
        composicao: {
          itens: [],
          itensEsperados: 0,
          itensPresentes: 0,
          faltantesObrigatorios: 0,
          faltantesOpcionais: 0,
          faltantesCondicionais: 0,
          gruposAlternativos: 0,
          gruposObrigatoriosAusentes: 0,
          gruposOpcionaisAusentes: 0,
          quantidadesAbaixo: 0,
          quantidadesAcima: 0,
          pendencias: 0,
        },
      },
    ],
  } as const;
}

describe("avaliarContextoMedicoInformativo", () => {
  it("não altera comparações legadas quando o contexto não foi solicitado", () => {
    expect(avaliarContextoMedicoInformativo()).toMatchObject({
      estado: "nao_solicitado",
      divergencias: [],
      fontes: 0,
    });
  });

  it("bloqueia conclusão conforme quando não há fonte no mesmo snapshot", () => {
    const contexto = contextoBase();
    const resultado = avaliarContextoMedicoInformativo({
      ...contexto,
      fontes: [],
    });

    expect(resultado).toMatchObject({
      estado: "incompleto",
      fontes: 0,
      divergencias: [],
    });
    expect(resultado.mensagem).toContain("mesmo snapshot hospitalar");
  });

  it("bloqueia conclusão quando mais de um gabarito é elegível", () => {
    const contexto = contextoBase();
    const candidatos = [
      ...contexto.candidatos,
      {
        ...contexto.candidatos[0],
        padraoId: 10,
        nome: "Segundo gabarito",
        recomendacao: false,
      },
    ];
    const resultado = avaliarContextoMedicoInformativo({
      ...contexto,
      candidatos,
    });

    expect(resultado).toMatchObject({
      estado: "incompleto",
      gabaritosElegiveis: 2,
    });
    expect(resultado.mensagem).toContain("mais de um gabarito");
  });

  it("gera alertas somente para itens obrigatórios ou condicionais pendentes", () => {
    const contexto = contextoBase();
    const resultado = avaliarContextoMedicoInformativo({
      ...contexto,
      candidatos: [
        {
          ...contexto.candidatos[0],
          composicao: {
            ...contexto.candidatos[0].composicao,
            itens: [
              {
                codigo: "OBRIG-SINT",
                descricao: "Obrigatório sintético",
                categoria: "obrigatorio",
                grupo: null,
                presenca: "ausente",
                pendencia: true,
                frequencia: 100,
              },
              {
                codigo: "COND-SINT",
                descricao: "Condicional sintético",
                categoria: "condicional",
                grupo: "grupo-sint",
                presenca: "ausente",
                pendencia: true,
                frequencia: 100,
              },
              {
                codigo: "OPC-SINT",
                descricao: "Opcional sintético",
                categoria: "opcional",
                grupo: null,
                presenca: "ausente",
                pendencia: false,
                frequencia: 100,
              },
            ],
          },
        },
      ],
    });

    expect(resultado).toMatchObject({ estado: "aplicado", itensFaltantes: 2 });
    expect(
      resultado.divergencias.map(divergencia => divergencia.codigoItem)
    ).toEqual(["OBRIG-SINT", "COND-SINT"]);
    expect(
      resultado.divergencias.map(divergencia => divergencia.severidade)
    ).toEqual(["critico", "alerta"]);
    expect(
      resultado.divergencias.every(
        divergencia =>
          divergencia.detalhes.origem === "contexto_medico_informativo"
      )
    ).toBe(true);
  });
});
