import { describe, expect, it } from "vitest";
import { agruparGuiasHup } from "./hupConciliacaoPilotoGuias";
import type { HupConciliacaoItem, HupConciliacaoStatus } from "./hupConciliacaoPilotoCompare";

function item(extra: Partial<HupConciliacaoItem> = {}): HupConciliacaoItem {
  return {
    chave: "grupo-1",
    conta: "00001",
    guiaPrestador: "000123",
    guiaOperadora: "OP123",
    codigoTuss: "000456",
    dataItem: "2026-08-25",
    tipoItem: "7",
    setor: "Sala",
    modalidade: "S",
    totalItens: 1,
    quantidade: "1",
    valorFaturado: "100.00",
    status: "sem_candidato",
    motivo: "teste",
    numeroCandidatos: 0,
    valorPagoCandidato: null,
    valorGlosaCandidata: null,
    diferencaEstimada: null,
    candidatos: [],
    ...extra,
  };
}

const statuses: HupConciliacaoStatus[] = ["candidato", "ambiguo", "sem_candidato", "medico_direto", "dados_incompletos"];

describe("agruparGuiasHup", () => {
  it("agrega grupos da mesma guia, sem remover zeros à esquerda", () => {
    const [guia] = agruparGuiasHup([
      item({ codigoTuss: "000111", valorFaturado: "1.01", totalItens: 2 }),
      item({ chave: "grupo-2", codigoTuss: "000222", valorFaturado: "2.02", totalItens: 3 }),
    ]);
    expect(guia).toMatchObject({
      conta: "00001",
      guiaPrestador: "000123",
      guiaOperadora: "OP123",
      totalItens: 5,
      totalGrupos: 2,
      valorFaturado: "3.03",
      valorFaturadoHospital: "3.03",
      valorFaturadoMedicoDireto: "0.00",
      status: "sem_candidato",
    });
    expect(guia.statusContagens).toEqual({ candidato: 0, ambiguo: 0, sem_candidato: 2, medico_direto: 0, dados_incompletos: 0 });
  });

  it("separa guias diferentes da mesma conta e contas diferentes da mesma guia", () => {
    const guias = agruparGuiasHup([
      item({ guiaPrestador: "G1", guiaOperadora: "O1" }),
      item({ chave: "grupo-2", guiaPrestador: "G2", guiaOperadora: "O2" }),
      item({ chave: "grupo-3", conta: "00002", guiaPrestador: "G1", guiaOperadora: "O1" }),
    ]);
    expect(guias).toHaveLength(3);
  });

  it("mantém grupos sem identificadores isolados em vez de mesclar campos vazios", () => {
    const guias = agruparGuiasHup([
      item({ conta: "", guiaPrestador: "", guiaOperadora: "", chave: "grupo-1" }),
      item({ conta: "", guiaPrestador: "", guiaOperadora: "", chave: "grupo-2" }),
      item({ conta: "C1", guiaPrestador: "0", guiaOperadora: "O1", chave: "grupo-3" }),
      item({ conta: "C1", guiaPrestador: "0", guiaOperadora: "O1", chave: "grupo-4" }),
    ]);
    expect(guias).toHaveLength(4);
    expect(new Set(guias.map(guia => guia.chave)).size).toBe(4);
    expect(guias.map(guia => guia.chave)).toEqual(["guia-1", "guia-2", "guia-3", "guia-4"]);
  });

  it("marca misto e conta todos os cinco status", () => {
    const guias = agruparGuiasHup(statuses.map((status, index) => item({ chave: `grupo-${index + 1}`, status })));
    expect(guias).toHaveLength(1);
    expect(guias[0]).toMatchObject({ status: "misto", totalGrupos: 5 });
    expect(Object.values(guias[0]!.statusContagens)).toEqual([1, 1, 1, 1, 1]);
  });

  it("soma somente valores conhecidos de grupos candidatos sem multiplicar ambiguidades", () => {
    const [guia] = agruparGuiasHup([
      item({ status: "candidato", valorPagoCandidato: "10.123", valorGlosaCandidata: "1.001" }),
      item({ chave: "grupo-2", status: "candidato", valorPagoCandidato: null, valorGlosaCandidata: "0" }),
      item({ chave: "grupo-3", status: "ambiguo", valorPagoCandidato: "999.99", valorGlosaCandidata: "999.99" }),
    ]);
    expect(guia).toMatchObject({
      valorPagoCandidato: "10.123",
      valorGlosaCandidata: "1.001",
      gruposComPago: 1,
      gruposComGlosa: 2,
      gruposCandidatos: 2,
    });
  });

  it("mantém null se nenhum valor candidato é conhecido e separa hospitalar/médico", () => {
    const [guia] = agruparGuiasHup([
      item({ status: "candidato", valorPagoCandidato: null, valorGlosaCandidata: null, valorFaturado: "10" }),
      item({ chave: "grupo-2", modalidade: "N", valorFaturado: "20" }),
    ]);
    expect(guia).toMatchObject({
      valorPagoCandidato: null,
      valorGlosaCandidata: null,
      gruposHospitalares: 1,
      valorFaturadoHospital: "10.00",
      valorFaturadoMedicoDireto: "20.00",
    });
  });

  it("calcula subtotal hospitalar somente para candidato único com data provada, sem compor médico direto", () => {
    const [guia] = agruparGuiasHup([
      item({
        status: "candidato", numeroCandidatos: 1, valorFaturado: "100.25", valorPagoCandidato: "90.00", valorGlosaCandidata: "5.25",
        candidatos: [{ guia: "OP123", codigoTuss: "000456", dataItem: "2026-08-25", dataPagamento: "2026-09-01", valorPago: "90.00", valorGlosa: "5.25" }],
      }),
      item({ chave: "grupo-2", modalidade: "N", valorFaturado: "999.00" }),
    ]);
    expect(guia).toMatchObject({
      gruposHospitalares: 1,
      gruposComparaveis: 1,
      valorFaturadoComparavel: "100.25",
      diferencaComparavel: "5.00",
      comparacaoCompleta: true,
      diferencaGuia: "5.00",
    });
  });

  it("não publica diferença de guia parcial quando qualquer grupo hospitalar não é comparável", () => {
    const [guia] = agruparGuiasHup([
      item({ status: "candidato", numeroCandidatos: 1, valorPagoCandidato: "90", valorGlosaCandidata: "5", candidatos: [{ guia: "OP123", codigoTuss: "000456", dataItem: "2026-08-25", dataPagamento: null, valorPago: "90", valorGlosa: "5" }] }),
      item({ chave: "grupo-2", codigoTuss: "002", status: "sem_candidato", valorFaturado: "20" }),
    ]);
    expect(guia).toMatchObject({ gruposComparaveis: 1, comparacaoCompleta: false, diferencaComparavel: "5.00", diferencaGuia: null });
  });

  it("guarda no máximo cem detalhes com flag mas nunca trunca totais", () => {
    const [guia] = agruparGuiasHup(Array.from({ length: 101 }, (_, index) => item({ chave: `grupo-${index + 1}`, totalItens: 2, valorFaturado: "1" })));
    expect(guia).toMatchObject({ totalItens: 202, totalGrupos: 101, valorFaturado: "101.00", detalhesLimitados: true });
    expect(guia!.itens).toHaveLength(100);
  });
});
