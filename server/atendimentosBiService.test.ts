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
});
