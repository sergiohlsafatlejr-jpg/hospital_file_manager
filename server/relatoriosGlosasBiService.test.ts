import { describe, expect, it } from "vitest";
import { complementarRankingGlosa, construirFiltroPainelGlosas, montarResumoGlosas, percentualGlosa } from "./relatoriosGlosasBiService";

describe("relatoriosGlosasBiService", () => {
  it("calcula indicadores financeiros sem misturar bases", () => {
    expect(montarResumoGlosas({
      total_processado: "1000",
      total_pago: "900",
      total_glosa: "100",
      total_itens_glosados: "4",
      total_guias_glosadas: "3",
      glosa_sem_recurso: "40",
      glosa_aceita: "15",
      glosa_recursada: "60",
      glosa_pendente: "25",
    })).toEqual({
      valorCobrado: 1000,
      valorProcessado: 1000,
      valorPago: 900,
      valorGlosado: 100,
      totalItensGlosados: 4,
      totalGuiasGlosadas: 3,
      ticketMedio: 25,
      taxaGlosa: 10,
      glosaSemRecurso: 40,
      glosaAceita: 15,
      glosaRecursada: 60,
      glosaPendente: 25,
      valorAnalisado: 75,
      percentualAceito: 15,
      percentualRecursado: 60,
      percentualAnalisado: 75,
    });
  });

  it("retorna percentuais zerados quando não há base financeira", () => {
    expect(percentualGlosa(10, 0)).toBe(0);
    expect(montarResumoGlosas({}).taxaGlosa).toBe(0);
  });

  it("complementa rankings com taxa, participação e situação do recurso", () => {
    const [item] = complementarRankingGlosa([{
      nome: "Procedimento A",
      valor_pago: "150",
      valor_glosado: "50",
      glosa_sem_recurso: "20",
      glosa_aceita: "10",
      glosa_recursada: "30",
      glosa_pendente: "10",
      qtd_itens: "2",
    }], 200);

    expect(item.valorCobrado).toBe(200);
    expect(item.percentualTotal).toBe(25);
    expect(item.taxaGlosa).toBe(25);
    expect(item.glosaSemRecurso).toBe(20);
    expect(item.glosaAceita).toBe(10);
    expect(item.glosaRecursada).toBe(30);
    expect(item.glosaPendente).toBe(10);
    expect(item.qtdItens).toBe(2);
  });

  it("monta filtros cruzados combinados para recalcular todo o painel", () => {
    const filtro = construirFiltroPainelGlosas({
      estabelecimentoId: 1,
      convenioId: 12,
      mesPagamento: "2026/06",
      itemDescricao: "SESSÃO DE PSICOLOGIA",
      procedimentoCodigo: "50000470",
      motivoCodigo: "1613",
    });

    expect(filtro.where).toContain("d.estabelecimentoId = ?");
    expect(filtro.where).not.toContain("d.valor_glosa > 0");
    expect(filtro.where).toContain("d.convenio_id = ?");
    expect(filtro.where).toContain("DATE_FORMAT(d.data_pagamento, '%Y/%m') = ?");
    expect(filtro.where).toContain("TRIM(d.descricao_item) = ?");
    expect(filtro.where).toContain("TRIM(d.codigo_item) = ?");
    expect(filtro.where).toContain("TRIM(d.codigo_glosa) = ?");
    expect(filtro.params).toEqual([1, 12, "2026/06", "SESSÃO DE PSICOLOGIA", "50000470", "1613"]);
  });

  it("exclui a própria dimensão para manter o ranking navegável e trata códigos ausentes", () => {
    const filtroItem = construirFiltroPainelGlosas({
      estabelecimentoId: 1,
      itemDescricao: "SESSÃO DE PSICOLOGIA",
      motivoCodigo: "S/MOTIVO",
    }, "item");

    expect(filtroItem.where).not.toContain("TRIM(d.descricao_item) = ?");
    expect(filtroItem.where).toContain("d.codigo_glosa IS NULL");
    expect(filtroItem.params).toEqual([1]);
  });
});
