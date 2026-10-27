import { describe, expect, it } from "vitest";
import {
  compararComposicaoInformativa,
  type CompararComposicaoInformativaEntrada,
} from "./contaComposicaoInformativa";

function entradaBase(): CompararComposicaoInformativaEntrada {
  return {
    scope: { estabelecimentoId: 10, convenioId: 20 },
    procedimentosMedicos: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
    itensHospitalares: [
      { codigo: "TAXA-SINT", quantidade: "1", tipo: "outro" },
      { codigo: "MAT-SINT", quantidade: "0.1", tipo: "outro" },
      { codigo: "MAT-SINT", quantidade: "0.2", tipo: "outro" },
    ],
    gabaritos: [],
  };
}

describe("compararComposicaoInformativa", () => {
  it("exige unidade e convênio idênticos e todos os principais distintos reconhecidos", () => {
    const entrada = entradaBase();
    entrada.gabaritos = [
      {
        padraoId: 1,
        nome: "Completo sintético",
        estabelecimentoId: 10,
        convenioId: 20,
        principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }, { codigo: "PROC-SINT-A" }],
        itensAssociados: [{ codigo: "TAXA-SINT", descricao: "Taxa", frequencia: 100, quantidadeMedia: 1 }],
      },
      {
        padraoId: 2,
        nome: "Principal parcial sintético",
        estabelecimentoId: 10,
        convenioId: 20,
        principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-INEXISTENTE" }],
        itensAssociados: [],
      },
      {
        padraoId: 3,
        nome: "Outro escopo sintético",
        estabelecimentoId: 11,
        convenioId: 20,
        principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
        itensAssociados: [],
      },
    ];

    const [completo, parcial, outroEscopo] = compararComposicaoInformativa(entrada);

    expect(completo).toMatchObject({ elegivel: true, recomendacao: true, principaisTotal: 2, principaisEncontrados: 2 });
    expect(parcial).toMatchObject({ elegivel: false, recomendacao: false, principaisTotal: 2, principaisEncontrados: 1 });
    expect(parcial.motivos).toContain("Nem todos os procedimentos principais distintos foram reconhecidos");
    expect(outroEscopo).toMatchObject({ elegivel: false, recomendacao: false });
    expect(outroEscopo.motivos).toContain("Gabarito de outra unidade");
  });

  it("aceita principal somente se vier da fonte médica ou de linha hospitalar tipada como procedimento", () => {
    const entrada = entradaBase();
    entrada.procedimentosMedicos = [];
    entrada.itensHospitalares = [{ codigo: "PROC-SINT-A", quantidade: "1", tipo: "outro" }];
    entrada.gabaritos = [{
      padraoId: 4,
      nome: "Tipo não procedimento",
      estabelecimentoId: 10,
      convenioId: 20,
      principais: [{ codigo: "PROC-SINT-A" }],
      itensAssociados: [],
    }];
    expect(compararComposicaoInformativa(entrada)[0].elegivel).toBe(false);

    entrada.itensHospitalares = [{ codigo: "PROC-SINT-A", quantidade: "1", tipo: "procedimento" }];
    expect(compararComposicaoInformativa(entrada)[0]).toMatchObject({ elegivel: true, recomendacao: true });
  });

  it("preserva categorias e conta ausências opcionais sem alertá-las", () => {
    const entrada = entradaBase();
    entrada.gabaritos = [{
      padraoId: 5,
      nome: "Categorias sintéticas",
      estabelecimentoId: 10,
      convenioId: 20,
      principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
      itensAssociados: [
        { codigo: "TAXA-SINT", descricao: "Presente", frequencia: 100, quantidadeMedia: 1, categoria: "obrigatorio" },
        { codigo: "DIARIA-A", descricao: "Diária opcional A", frequencia: 100, quantidadeMedia: 1, categoria: "opcional" },
        { codigo: "DIARIA-B", descricao: "Diária opcional B", frequencia: 100, quantidadeMedia: 1, categoria: "opcional" },
        { codigo: "OBRIG-SINT", descricao: "Obrigatório", frequencia: 100, quantidadeMedia: 1, categoria: "obrigatorio" },
      ],
    }];

    const candidato = compararComposicaoInformativa(entrada)[0];
    // Confirmar aplicabilidade não significa aprovar cobrança nem apagar faltas.
    expect(candidato.elegivel).toBe(true);
    expect(candidato.recomendacao).toBe(true);
    expect(candidato.motivos).toContain("Composição hospitalar possui pendências");
    expect(candidato.composicao).toMatchObject({
      itensPresentes: 1,
      faltantesOpcionais: 2,
      faltantesObrigatorios: 1,
      pendencias: 1,
    });
    expect(candidato.composicao.itens.find(item => item.codigo === "DIARIA-A")).toMatchObject({
      categoria: "opcional",
      pendencia: false,
      presenca: "ausente",
    });
  });

  it("implementa OR opcional e obrigatório com uma única pendência de grupo e sem máximo implícito", () => {
    const entrada = entradaBase();
    entrada.gabaritos = [{
      padraoId: 6,
      nome: "OR sintético",
      estabelecimentoId: 10,
      convenioId: 20,
      principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
      itensAssociados: [
        { codigo: "OR-OPT-A", descricao: "OR opcional A", frequencia: 100, quantidadeMedia: 1, categoria: "opcional", grupoAlternativo: "diarias" },
        { codigo: "OR-OPT-B", descricao: "OR opcional B", frequencia: 100, quantidadeMedia: 1, categoria: "opcional", grupoAlternativo: "diarias" },
        { codigo: "OR-REQ-A", descricao: "OR obrigatório A", frequencia: 100, quantidadeMedia: 1, categoria: "opcional", grupoAlternativo: "kit", grupoObrigatorio: true },
        { codigo: "OR-REQ-B", descricao: "OR obrigatório B", frequencia: 100, quantidadeMedia: 1, categoria: "opcional", grupoAlternativo: "kit", grupoObrigatorio: true },
      ],
    }];

    let candidato = compararComposicaoInformativa(entrada)[0];
    expect(candidato.composicao).toMatchObject({
      gruposAlternativos: 2,
      gruposOpcionaisAusentes: 1,
      gruposObrigatoriosAusentes: 1,
      pendencias: 1,
    });
    expect(candidato.composicao.itens.filter(item => item.pendencia)).toHaveLength(1);

    entrada.itensHospitalares = [
      ...entrada.itensHospitalares,
      // Dois membros do mesmo OR podem coexistir; o grupo não impõe máximo de um.
      { codigo: "OR-OPT-A", quantidade: "1", tipo: "outro" },
      { codigo: "OR-OPT-B", quantidade: "1", tipo: "outro" },
      { codigo: "OR-REQ-B", quantidade: "1", tipo: "outro" },
    ];
    candidato = compararComposicaoInformativa(entrada)[0];
    expect(candidato).toMatchObject({ elegivel: true, recomendacao: true });
    expect(candidato.composicao).toMatchObject({ gruposObrigatoriosAusentes: 0, gruposOpcionaisAusentes: 0 });
    expect(candidato.composicao.itens.find(item => item.codigo === "OR-OPT-B")).toMatchObject({ presenca: "presente" });
  });

  it("agrega quantidades decimais por código antes de comparar com min/max", () => {
    const entrada = entradaBase();
    entrada.gabaritos = [{
      padraoId: 7,
      nome: "Decimal sintético",
      estabelecimentoId: 10,
      convenioId: 20,
      principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
      itensAssociados: [{
        codigo: "MAT-SINT",
        descricao: "Material decimal",
        frequencia: 100,
        quantidadeMedia: 0.3,
        quantidadeMin: 0.3,
        quantidadeMax: 0.3,
      }],
    }];

    const candidato = compararComposicaoInformativa(entrada)[0];
    expect(candidato).toMatchObject({ elegivel: true, recomendacao: true });
    expect(candidato.composicao.itens[0]).toMatchObject({
      quantidadeEncontrada: "0.3",
      situacaoQuantidade: "dentro",
      pendencia: false,
    });
  });

  it("recomenda somente o candidato elegível inequívoco e nunca confirma automaticamente", () => {
    const entrada = entradaBase();
    entrada.gabaritos = [8, 9].map(padraoId => ({
      padraoId,
      nome: `Elegível ${padraoId}`,
      estabelecimentoId: 10,
      convenioId: 20,
      principais: [{ codigo: "PROC-SINT-A" }, { codigo: "PROC-SINT-B" }],
      itensAssociados: [],
    }));
    const candidatos = compararComposicaoInformativa(entrada);
    expect(candidatos.map(candidato => candidato.elegivel)).toEqual([true, true]);
    expect(candidatos.map(candidato => candidato.recomendacao)).toEqual([false, false]);
  });
});
