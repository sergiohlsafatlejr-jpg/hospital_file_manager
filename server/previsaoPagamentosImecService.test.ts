import { describe, expect, it } from "vitest";
import { gerarPrevisaoPagamentosImec, IMEC_ESTABELECIMENTO_ID } from "./previsaoPagamentosImecService";

describe("previsão de pagamentos do Imec", () => {
  it("projeta os meses sem demonstrativo usando média ponderada e taxa histórica", () => {
    const resultado = gerarPrevisaoPagamentosImec([
      { convenioId: 1, convenio: "Unimed", dataPagamento: "2026-07-31", itens: 400, guias: 300, valorPago: 100, valorGlosa: 0, prazoMedioDias: 30 },
      { convenioId: 1, convenio: "Unimed", dataPagamento: "2026-08-31", itens: 400, guias: 320, valorPago: 120, valorGlosa: 10, prazoMedioDias: 31 },
    ], 3, new Date("2026-09-09T12:00:00Z"));

    expect(resultado.estabelecimento.id).toBe(IMEC_ESTABELECIMENTO_ID);
    expect(resultado.mesesHorizonte).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(resultado.cronograma).toHaveLength(3);
    expect(resultado.cronograma[0]).toMatchObject({
      convenio: "Unimed",
      dataPrevista: "2026-09-30",
      status: "estimado",
      confianca: "media",
    });
    expect(resultado.cronograma[0].valorBruto).toBe(120);
    expect(resultado.cronograma[0].valorPrevisto).toBe(114.78);
    expect(resultado.cronograma[0].glosaPrevista).toBe(5.22);
  });

  it("prioriza o demonstrativo futuro como pagamento programado", () => {
    const resultado = gerarPrevisaoPagamentosImec([
      { convenioId: 120006, convenio: "Senaprev - Iamesc ", dataPagamento: "2026-08-30", itens: 700, guias: 650, valorPago: 90000, valorGlosa: 2000, prazoMedioDias: 80 },
      { convenioId: 120006, convenio: "Senaprev - Iamesc ", dataPagamento: "2026-09-30", itens: 700, guias: 660, valorPago: 75000, valorGlosa: 12000, prazoMedioDias: 82 },
    ], 3, new Date("2026-09-09T12:00:00Z"));

    expect(resultado.cronograma[0]).toMatchObject({
      convenio: "Senaprev - Iamesc",
      dataPrevista: "2026-09-30",
      status: "programado",
      valorPrevisto: 75000,
      glosaPrevista: 12000,
      origem: "Demonstrativo importado",
    });
    expect(resultado.resumo.totalProgramado).toBe(75000);
  });

  it("marca previsão com pouco histórico como baixa confiança", () => {
    const resultado = gerarPrevisaoPagamentosImec([
      { convenioId: 150001, convenio: "Sulamerica", dataPagamento: "2026-08-24", itens: 20, guias: 20, valorPago: 2075.37, valorGlosa: 572.71, prazoMedioDias: 56 },
    ], 3, new Date("2026-09-09T12:00:00Z"));

    expect(resultado.porConvenio[0].confianca).toBe("baixa");
    expect(resultado.porConvenio[0].diaTipicoPagamento).toBe(24);
  });

  it("sinaliza atraso quando a data típica estimada do mês já passou", () => {
    const resultado = gerarPrevisaoPagamentosImec([
      { convenioId: 9, convenio: "Convênio Teste", dataPagamento: "2026-08-05", itens: 50, guias: 40, valorPago: 1000, valorGlosa: 100, prazoMedioDias: 35 },
    ], 3, new Date("2026-09-09T12:00:00Z"));

    expect(resultado.cronograma[0]).toMatchObject({
      dataPrevista: "2026-09-05",
      status: "atrasado",
    });
    expect(resultado.resumo.totalAtrasado).toBe(1000);
  });
});
