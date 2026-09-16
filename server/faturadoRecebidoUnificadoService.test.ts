import { describe, expect, it } from "vitest";
import { agruparFinanceiro, calcularFaturadoReconhecido, calcularIndicadoresFinanceiros, consolidarRegistrosFinanceiros, normalizarConvenio } from "./faturadoRecebidoUnificadoService";

describe("faturadoRecebidoUnificadoService", () => {
  it("calcula saldo, acréscimo e percentuais sem dupla contagem", () => {
    const resumo = calcularIndicadoresFinanceiros([
      { competencia: "2026/08", convenio: "Unimed", faturado: 1000, recebido: 800, glosado: 100, glosaAceita: 20, glosaRecursada: 50, glosaEmRecurso: 40, glosaRecuperada: 10, quantidade: 4 },
    ]);
    expect(resumo.totalSaldo).toBe(100);
    expect(resumo.totalAcrescimo).toBe(0);
    expect(resumo.glosaARecursar).toBe(30);
    expect(resumo.percentualGlosa).toBe(10);
    expect(resumo.percentualRecebido).toBe(80);
    expect(resumo.percentualRecurso).toBe(50);
  });

  it("calcula acréscimo quando recebido e glosado superam o faturado", () => {
    const resumo = calcularIndicadoresFinanceiros([{ competencia: "2026/08", convenio: "Unimed", faturado: 100, recebido: 95, glosado: 15 }]);
    expect(resumo.totalSaldo).toBe(0);
    expect(resumo.totalAcrescimo).toBe(10);
  });

  it("agrupa por convênio preservando as métricas financeiras", () => {
    const grupos = agruparFinanceiro([
      { competencia: "2026/07", convenio: "Unimed", faturado: 100 },
      { competencia: "2026/08", convenio: "Unimed", recebido: 70, glosado: 10 },
      { competencia: "2026/08", convenio: "Cassi", faturado: 50 },
    ], "convenio") as Array<{ convenio: string; totalFaturado: number; totalRecebido: number }>;
    expect(grupos.find((item) => item.convenio === "Unimed")).toMatchObject({ totalFaturado: 100, totalRecebido: 70 });
    expect(grupos.find((item) => item.convenio === "Cassi")?.totalFaturado).toBe(50);
  });

  it("normaliza acentuação e espaços para reconciliar nomes de convênio", () => {
    expect(normalizarConvenio("  Saúde   Caixa ")).toBe("SAUDE CAIXA");
  });

  it("preserva o faturado da fonte mesmo quando o processado no retorno é maior", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Unimed", fonte: "faturado", faturado: 100, quantidade: 2 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", recebido: 180, glosado: 20, quantidade: 4 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);
    expect(resumo.totalFaturado).toBe(100);
    expect(resumo.percentualRecebido).toBe(180);
    expect(resumo.percentualGlosa).toBe(20);
    expect(resumo.totalAcrescimo).toBe(100);
    expect(resumo.quantidade).toBe(4);
  });

  it("usa o processado do retorno somente quando não existe faturado na fonte", () => {
    expect(calcularFaturadoReconhecido(0, 180, 20)).toBe(200);
    expect(calcularFaturadoReconhecido(100, 180, 20)).toBe(100);
  });
});
