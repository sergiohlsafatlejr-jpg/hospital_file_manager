import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getRawPool: vi.fn() }));

import { getRawPool } from "./db";
import { getAtendimentosBiDashboard } from "./atendimentosBiService";

describe("serviço BI de atendimentos", () => {
  const query = vi.fn();

  beforeEach(() => {
    query.mockReset();
    query
      .mockResolvedValueOnce([[{
        quantidade: "1", valor: "100.00", semTitulo: "1", semEtapa: "0", semSaida: "1",
        valorSemTitulo: "100.00", valorSemEtapa: "0", valorSemSaida: "100.00", valorComEtapa: "100.00", valorComSaida: "0",
      }], []])
      .mockResolvedValue([[], []]);
    vi.mocked(getRawPool).mockResolvedValue({ query } as any);
  });

  it("fixa pendência e Particular-Tasy em todas as consultas, sem selecionar identificadores", async () => {
    const result = await getAtendimentosBiDashboard({ estabelecimentoId: 6 });
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");

    expect(query).toHaveBeenCalledTimes(12);
    expect(sql).toContain("titulo IS NULL OR TRIM(titulo)='' ".trim());
    expect(sql).toContain("PARTICULAR");
    expect(sql).not.toMatch(/\b(paciente|numero_atendimento|matricula|origemId)\b/i);
    expect(result.resumo.quantidade).toBe(1);
    expect(result.resumo.ticketMedio).toBe(100);
    expect(result.filtrosAplicados.situacao).toBe("pendentes");
  });

  it("reconsulta a tabela unificada e reflete inserções e valores alterados sem cache de servidor", async () => {
    let quantidade = 2;
    let valor = "150.00";
    query.mockReset().mockImplementation(async (statement: string) => {
      if (statement.includes("AS semTitulo")) return [[{
        quantidade: String(quantidade), valor, semTitulo: String(quantidade), semEtapa: "0", semSaida: "0",
        valorSemTitulo: valor, valorSemEtapa: "0", valorSemSaida: "0", valorComEtapa: valor, valorComSaida: valor,
      }], []];
      return [[], []];
    });
    const anterior = await getAtendimentosBiDashboard({ estabelecimentoId: 6 });
    quantidade = 3;
    valor = "240.50";
    const atual = await getAtendimentosBiDashboard({ estabelecimentoId: 6 });

    expect(anterior.resumo).toMatchObject({ quantidade: 2, valor: 150 });
    expect(atual.resumo).toMatchObject({ quantidade: 3, valor: 240.5 });
    expect(query).toHaveBeenCalledTimes(24);
    for (const [statement, params] of query.mock.calls) {
      expect(statement).toContain("FROM atendimentos_unificados");
      expect(statement).toContain("estabelecimentoId=?");
      expect(params[0]).toBe(6);
      expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    }
  });

  it("aplica unidade, ativo e sem título também nos gráficos e opções de filtro", async () => {
    await getAtendimentosBiDashboard({ estabelecimentoId: 19, mesEntrada: "2026-10", etapa: "CONFERÊNCIA" });
    for (const [statement, params] of query.mock.calls) {
      expect(params[0]).toBe(19);
      expect(statement).toContain("ativoNaFonte=1");
      expect(statement).toContain("titulo IS NULL OR TRIM(titulo)=''");
      expect(statement).toContain("PARTICULAR");
    }
    expect(query.mock.calls[0][1]).toEqual([19, "2026-10", "CONFERÊNCIA"]);
    expect(query.mock.calls[7][1]).toEqual([19]);
  });
});
