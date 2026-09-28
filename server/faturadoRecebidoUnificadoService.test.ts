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

  it("soma o cadastro manual como complemento da fonte automática na mesma competência", () => {
    const consolidado = consolidarRegistrosFinanceiros([
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", origem: "automatica", recebido: 58086.20, recebidoVinculado: 58086.20, glosado: 1912.22, quantidade: 698 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "faturado", origem: "manual", faturado: 18034.84, quantidade: 1 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", origem: "manual", recebido: 19356.48, recebidoSemVinculo: 19356.48, glosado: 0, quantidade: 1 },
    ]);
    const resumo = calcularIndicadoresFinanceiros(consolidado);
    expect(resumo.totalFaturado).toBe(78033.26);
    expect(resumo.totalRecebido).toBe(77442.68);
    expect(resumo.totalRecebidoVinculado + resumo.totalRecebidoSemVinculo).toBe(resumo.totalRecebido);
    expect(resumo.totalGlosado).toBe(1912.22);
    expect(resumo.totalAcrescimo).toBe(1321.64);
  });
});
