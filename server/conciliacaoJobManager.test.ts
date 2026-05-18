/**
 * Testes unitários para o conciliacaoJobManager
 * Verifica a normalização de competências e a lógica de seleção de fontes de dados
 */

import { describe, expect, it } from "vitest";

// Função de normalização extraída do conciliacaoJobManager para teste isolado
function normalizarComp(c: string): string {
  return c.replace('/', '-');
}

describe("normalizarComp", () => {
  it("deve converter formato com barra para hífen", () => {
    expect(normalizarComp("2026/03")).toBe("2026-03");
  });

  it("deve manter formato com hífen inalterado", () => {
    expect(normalizarComp("2026-03")).toBe("2026-03");
  });

  it("deve funcionar com anos anteriores", () => {
    expect(normalizarComp("2025/12")).toBe("2025-12");
    expect(normalizarComp("2025-12")).toBe("2025-12");
  });
});

describe("lógica de seleção de competências com demonstrativo", () => {
  it("deve incluir competências com recebimentos_excel (formato hífen)", () => {
    const compRecebimentos = ["2026-03", "2026-02", "2026-01", "2025-12"];
    const compDemonstrativo: string[] = [];
    const competenciasComRetorno = [...new Set([...compRecebimentos, ...compDemonstrativo])];
    const normalizarComp = (c: string) => c.replace('/', '-');
    const competenciasComRetornoNorm = competenciasComRetorno.map(normalizarComp);

    const todasCompetencias = ["2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12", "2025-11"];
    const competencias = todasCompetencias.filter((c) => competenciasComRetornoNorm.includes(normalizarComp(c)));

    expect(competencias).toContain("2026-03");
    expect(competencias).toContain("2026-02");
    expect(competencias).toContain("2026-01");
    expect(competencias).toContain("2025-12");
    expect(competencias).not.toContain("2026-05"); // sem demonstrativo
    expect(competencias).not.toContain("2026-04"); // sem demonstrativo
    expect(competencias).not.toContain("2025-11"); // sem demonstrativo
  });

  it("deve incluir competências da tabela demonstrativo (formato hífen)", () => {
    const compRecebimentos: string[] = [];
    const compDemonstrativo = ["2026-04", "2026-05"];
    const competenciasComRetorno = [...new Set([...compRecebimentos, ...compDemonstrativo])];
    const normalizarComp = (c: string) => c.replace('/', '-');
    const competenciasComRetornoNorm = competenciasComRetorno.map(normalizarComp);

    const todasCompetencias = ["2026-05", "2026-04", "2026-03"];
    const competencias = todasCompetencias.filter((c) => competenciasComRetornoNorm.includes(normalizarComp(c)));

    expect(competencias).toContain("2026-04");
    expect(competencias).toContain("2026-05");
    expect(competencias).not.toContain("2026-03"); // sem demonstrativo
  });

  it("deve normalizar formato com barra do recebimentos_excel para comparar com hífen do faturamento", () => {
    // Simula o caso onde arquivos retornam competência com barra mas faturamento usa hífen
    const compRecebimentos = ["2026/03", "2026/02"]; // formato antigo com barra
    const compDemonstrativo: string[] = [];
    const competenciasComRetorno = [...new Set([...compRecebimentos, ...compDemonstrativo])];
    const normalizarComp = (c: string) => c.replace('/', '-');
    const competenciasComRetornoNorm = competenciasComRetorno.map(normalizarComp);

    const todasCompetencias = ["2026-03", "2026-02", "2026-01"]; // formato do faturamento
    const competencias = todasCompetencias.filter((c) => competenciasComRetornoNorm.includes(normalizarComp(c)));

    expect(competencias).toContain("2026-03");
    expect(competencias).toContain("2026-02");
    expect(competencias).not.toContain("2026-01");
  });

  it("deve unir as duas fontes sem duplicatas", () => {
    const compRecebimentos = ["2026-03", "2026-02"];
    const compDemonstrativo = ["2026-03", "2026-04"]; // 2026-03 duplicado
    const competenciasComRetorno = [...new Set([...compRecebimentos, ...compDemonstrativo])];

    expect(competenciasComRetorno).toHaveLength(3);
    expect(competenciasComRetorno).toContain("2026-03");
    expect(competenciasComRetorno).toContain("2026-02");
    expect(competenciasComRetorno).toContain("2026-04");
  });
});

describe("lógica de fallback para tabela demonstrativo", () => {
  it("deve usar recebimentos_excel quando disponível", () => {
    const itensRecebimentoExcel = [{ id: 1, numeroGuia: "123" }];
    const itensRecebimentoDem = [{ id: 10, numeroGuia: "456" }];

    const itensRecebimento = itensRecebimentoExcel.length > 0
      ? itensRecebimentoExcel
      : itensRecebimentoDem;

    expect(itensRecebimento).toHaveLength(1);
    expect(itensRecebimento[0].id).toBe(1);
  });

  it("deve usar demonstrativo quando recebimentos_excel está vazio", () => {
    const itensRecebimentoExcel: any[] = [];
    const itensRecebimentoDem = [{ id: 10, numeroGuia: "456" }, { id: 11, numeroGuia: "789" }];

    const itensRecebimento = itensRecebimentoExcel.length > 0
      ? itensRecebimentoExcel
      : itensRecebimentoDem;

    expect(itensRecebimento).toHaveLength(2);
    expect(itensRecebimento[0].id).toBe(10);
  });
});
