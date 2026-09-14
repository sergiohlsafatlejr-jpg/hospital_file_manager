import { describe, expect, it } from "vitest";
import { agruparFinanceiroPsi, calcularIndicadoresPsi, consolidarRegistrosPsi, normalizarConvenioPsi, PSI_ESTABELECIMENTO_ID } from "./faturadoRecebidoPsiService";

describe("faturadoRecebidoPsiService", () => {
  it("mantém o painel vinculado ao estabelecimento PSI", () => {
    expect(PSI_ESTABELECIMENTO_ID).toBe(1);
  });

  it("calcula saldo, acréscimo e percentuais sem dupla contagem", () => {
    const resumo = calcularIndicadoresPsi([
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
    const resumo = calcularIndicadoresPsi([{ competencia: "2026/08", convenio: "Unimed", faturado: 100, recebido: 95, glosado: 15 }]);
    expect(resumo.totalSaldo).toBe(0);
    expect(resumo.totalAcrescimo).toBe(10);
  });

  it("agrupa por convênio preservando as métricas financeiras", () => {
    const grupos = agruparFinanceiroPsi([
      { competencia: "2026/07", convenio: "Unimed", faturado: 100 },
      { competencia: "2026/08", convenio: "Unimed", recebido: 70, glosado: 10 },
      { competencia: "2026/08", convenio: "Cassi", faturado: 50 },
    ], "convenio") as Array<{ convenio: string; totalFaturado: number; totalRecebido: number }>;
    expect(grupos.find((item) => item.convenio === "Unimed")).toMatchObject({ totalFaturado: 100, totalRecebido: 70 });
    expect(grupos.find((item) => item.convenio === "Cassi")?.totalFaturado).toBe(50);
  });

  it("normaliza acentuação e espaços para reconciliar nomes de convênio", () => {
    expect(normalizarConvenioPsi("  Saúde   Caixa ")).toBe("SAUDE CAIXA");
  });

  it("usa o processado do retorno quando o histórico faturado está incompleto, sem ultrapassar 100%", () => {
    const consolidado = consolidarRegistrosPsi([
      { competencia: "2026/08", convenio: "Unimed", fonte: "faturado", faturado: 100, quantidade: 2 },
      { competencia: "2026/08", convenio: "Unimed", fonte: "retorno", recebido: 180, glosado: 20, quantidade: 4 },
    ]);
    const resumo = calcularIndicadoresPsi(consolidado);
    expect(resumo.totalFaturado).toBe(200);
    expect(resumo.percentualRecebido).toBe(90);
    expect(resumo.percentualGlosa).toBe(10);
    expect(resumo.totalAcrescimo).toBe(0);
    expect(resumo.quantidade).toBe(4);
  });
});
