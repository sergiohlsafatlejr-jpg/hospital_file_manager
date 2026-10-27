import { describe, expect, it } from "vitest";
import {
  chaveRecursoLote,
  criarSnapshotDaSelecaoLote,
  criarSnapshotLote,
  validarSnapshotParaCriacaoLote,
} from "../client/src/lib/recursosLoteSelecao";

const contextoBase = {
  estabelecimentoId: 10,
  convenioId: 20,
  filtroDataPagamento: "2026-10-25",
};

describe("seleção de recursos para lote", () => {
  it("mantém distintos itens com mesmo id em fontes diferentes", () => {
    const demonstrativo = { id: 44, fonte: "demonstrativo" };
    const conciliacao = { id: 44, fonte: "conciliacao" };

    expect(chaveRecursoLote(demonstrativo)).toBe("demonstrativo:44");
    expect(chaveRecursoLote(conciliacao)).toBe("conciliacao:44");

    const resultado = criarSnapshotDaSelecaoLote({
      contexto: contextoBase,
      convenioNome: "COTEFI",
      itensDisponiveis: [demonstrativo, conciliacao],
      chavesSelecionadas: new Set(["demonstrativo:44", "conciliacao:44"]),
    });

    expect(resultado).toMatchObject({ valido: true });
    if (resultado.valido) {
      expect(resultado.snapshot.itens).toEqual([
        { id: 44, fonte: "demonstrativo", guiaNumero: null },
        { id: 44, fonte: "conciliacao", guiaNumero: null },
      ]);
    }
  });

  it("cria todos exclusivamente a partir do snapshot do grupo mesmo quando ele está recolhido", () => {
    const itensDoGrupoRecolhido = [
      { id: 1, fonte: "demonstrativo", guiaNumero: "G-1" },
      { id: 2, fonte: "conciliacao", guiaNumero: "G-2" },
    ];
    const listaAmplaDeOutroConvenio = [
      { id: 99, fonte: "demonstrativo", guiaNumero: "NÃO-PODE-ENTRAR" },
    ];

    const resultado = criarSnapshotLote({
      contexto: contextoBase,
      convenioNome: "COTEFI",
      itens: itensDoGrupoRecolhido,
    });

    expect(resultado).toMatchObject({ valido: true });
    if (resultado.valido) {
      expect(resultado.snapshot.itens.map(item => `${item.fonte}:${item.id}`)).toEqual([
        "demonstrativo:1",
        "conciliacao:2",
      ]);
      expect(resultado.snapshot.itens).not.toContainEqual(
        expect.objectContaining({ id: listaAmplaDeOutroConvenio[0].id }),
      );
    }
  });

  it("invalida o snapshot se trocar unidade ou filtro de pagamento", () => {
    const criado = criarSnapshotLote({
      contexto: contextoBase,
      convenioNome: "COTEFI",
      itens: [{ id: 1, fonte: "demonstrativo" }],
    });
    expect(criado).toMatchObject({ valido: true });
    if (!criado.valido) return;

    expect(
      validarSnapshotParaCriacaoLote(criado.snapshot, {
        ...contextoBase,
        estabelecimentoId: 11,
      }),
    ).toEqual({ valido: false, codigo: "CONTEXTO_ALTERADO" });
    expect(
      validarSnapshotParaCriacaoLote(criado.snapshot, {
        ...contextoBase,
        filtroDataPagamento: "2026-10-26",
      }),
    ).toEqual({ valido: false, codigo: "CONTEXTO_ALTERADO" });
  });

  it("bloqueia fonte ausente ou desconhecida, sem inferi-la como demonstrativo", () => {
    expect(
      criarSnapshotLote({
        contexto: contextoBase,
        convenioNome: "COTEFI",
        itens: [{ id: 1, fonte: undefined }],
      }),
    ).toEqual({ valido: false, codigo: "FONTE_DESCONHECIDA" });

    expect(
      criarSnapshotLote({
        contexto: contextoBase,
        convenioNome: "COTEFI",
        itens: [{ id: 1, fonte: "legado" }],
      }),
    ).toEqual({ valido: false, codigo: "FONTE_DESCONHECIDA" });
  });

  it("não recorre a lista ampla nem aceita chave selecionada fora da lista de origem", () => {
    const resultado = criarSnapshotDaSelecaoLote({
      contexto: contextoBase,
      convenioNome: "COTEFI",
      itensDisponiveis: [{ id: 1, fonte: "demonstrativo" }],
      chavesSelecionadas: new Set(["demonstrativo:1", "conciliacao:2"]),
    });

    expect(resultado).toEqual({ valido: false, codigo: "ITEM_FORA_DO_ESCOPO" });
    expect(
      criarSnapshotDaSelecaoLote({
        contexto: contextoBase,
        convenioNome: "COTEFI",
        itensDisponiveis: undefined,
        chavesSelecionadas: new Set(["demonstrativo:1"]),
      }),
    ).toEqual({ valido: false, codigo: "LISTA_DE_ORIGEM_INDISPONIVEL" });
  });
});
