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

  it("preserva e mede separadamente o recebido vinculado e sem vínculo", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Ipasgo", fonte: "retorno", recebido: 715740, recebidoVinculado: 405325.16, recebidoSemVinculo: 310414.84 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);

    expect(resumo.totalRecebido).toBe(715740);
    expect(resumo.totalRecebidoVinculado).toBe(405325.16);
    expect(resumo.totalRecebidoSemVinculo).toBe(310414.84);
    expect(resumo.percentualRecebidoSemVinculo).toBe(43.37);
  });

  it("não soma faturado manual com processado automático, preservando recebido manual complementar", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", origem: "automatica", recebido: 58086.20, recebidoVinculado: 58086.20, glosado: 1912.22, quantidade: 698 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "faturado", origem: "manual", faturado: 18034.84, quantidade: 1 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", origem: "manual", recebido: 19356.48, recebidoSemVinculo: 19356.48, glosado: 0, quantidade: 1 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);
    expect(resumo.totalFaturado).toBe(18034.84);
    expect(resumo.totalRecebido).toBe(77442.68);
    expect(resumo.totalRecebidoVinculado + resumo.totalRecebidoSemVinculo).toBe(resumo.totalRecebido);
    expect(resumo.totalGlosado).toBe(1912.22);
    expect(resumo.totalAcrescimo).toBe(61320.06);
  });

  it("usa o faturado manual do HF Visão/Senaprev sem duplicá-lo pelo retorno importado", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado", origem: "manual", faturado: 22184.16 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "retorno", origem: "automatica", recebido: 22132.50, glosado: 331.76, quantidade: 505 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);
    expect(resumo.totalFaturado).toBe(22184.16);
    expect(resumo.totalRecebido).toBe(22132.50);
    expect(resumo.totalGlosado).toBe(331.76);
    expect(resumo.totalSaldo).toBe(0);
    expect(resumo.totalAcrescimo).toBe(280.10);
  });

  it("preserva apenas o cadastro manual quando não há fonte automática no mesmo período", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado", origem: "manual", faturado: 22184.16 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "retorno", origem: "manual", recebido: 21000, recebidoSemVinculo: 21000, glosado: 100 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);
    expect(resumo.totalFaturado).toBe(22184.16);
    expect(resumo.totalRecebido).toBe(21000);
    expect(resumo.totalGlosado).toBe(100);
    expect(resumo.totalRecebidoSemVinculo).toBe(21000);
    expect(resumo.totalSaldo).toBe(1084.16);
  });

  it("prioriza o faturamento XML quando ele chega após o cadastro manual, sem afetar outro convênio", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado", origem: "manual", faturado: 22184.16, quantidade: 9 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado", origem: "automatica", faturado: 22000, quantidade: 2 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "retorno", origem: "automatica", recebido: 21000, glosado: 100, quantidade: 1 },
      { competencia: "2026/08", convenio: "Outro convênio", fonte: "faturado", origem: "manual", faturado: 300 },
    ]);
    const porConvenio = agruparFinanceiro(consolidado, "convenio") as Array<{ convenio: string; totalFaturado: number; quantidade: number }>;
    expect(porConvenio.find((row) => row.convenio === "Senaprev - Iamesc")?.totalFaturado).toBe(22000);
    expect(porConvenio.find((row) => row.convenio === "Senaprev - Iamesc")?.quantidade).toBe(2);
    expect(porConvenio.find((row) => row.convenio === "Outro convênio")?.totalFaturado).toBe(300);
  });

  it("usa manual antes de planilha externa e seleciona a quantidade correspondente", () => {
    const registros = [
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado" as const, origem: "planilha" as const, faturado: 200, quantidade: 30 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "faturado" as const, origem: "manual" as const, faturado: 100, quantidade: 1 },
      { competencia: "2026/08", convenio: "Senaprev - Iamesc", fonte: "retorno" as const, origem: "planilha" as const, recebido: 75, quantidade: 1 },
    ];
    const manualPrioritario = consolidarRegistrosFinanceiros(registros)[0];
    expect(manualPrioritario).toMatchObject({ faturado: 100, recebido: 75, quantidade: 1 });

    const apenasPlanilha = consolidarRegistrosFinanceiros(registros.filter((r) => r.origem !== "manual"))[0];
    expect(apenasPlanilha).toMatchObject({ faturado: 200, recebido: 75, quantidade: 30 });
  });

  it("gera drill-down por mês dentro de cada convênio e por convênio dentro de cada mês", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/07", convenio: "Unimed", fonte: "faturado", faturado: 1000 },
      { competencia: "2026/07", convenio: "Unimed", fonte: "retorno", recebido: 850, glosado: 50 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "faturado", faturado: 2000 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", recebido: 1800, glosado: 100 },
      { competencia: "2026/08", convenio: "Ipasgo", fonte: "faturado", faturado: 500 },
    ]);

    const porConvenio = agruparFinanceiro(consolidado, "convenio") as any[];
    const unimed = porConvenio.find((item) => item.convenio === "Unimed");
    expect(unimed.totalFaturado).toBe(3000);
    expect(unimed.meses).toHaveLength(2);
    expect(unimed.meses[0]).toMatchObject({ competencia: "2026/08", totalFaturado: 2000, totalRecebido: 1800, totalGlosado: 100 });
    expect(unimed.meses[1]).toMatchObject({ competencia: "2026/07", totalFaturado: 1000, totalRecebido: 850, totalGlosado: 50 });

    const porMes = agruparFinanceiro(consolidado, "competencia") as any[];
    const agosto = porMes.find((item) => item.competencia === "2026/08");
    expect(agosto.convenios).toHaveLength(2);
    expect(agosto.convenios[0]).toMatchObject({ convenio: "Unimed", totalFaturado: 2000 });
    expect(agosto.convenios[1]).toMatchObject({ convenio: "Ipasgo", totalFaturado: 500 });
  });
});
