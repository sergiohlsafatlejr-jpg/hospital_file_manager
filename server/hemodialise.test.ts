import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});
vi.mock("pg", () => ({
  default: { Pool: vi.fn(() => ({ connect: mockConnect })) },
}));

// Mock db
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
    $count: vi.fn(),
  }),
}));

// Mock env
vi.mock("./_core/env", () => ({
  ENV: {
    warleineDbHost: "localhost",
    warleineDbPort: "5432",
    warleineDbName: "test",
    warleineDbUser: "test",
    warleineDbPassword: "test",
    builtInForgeApiUrl: "http://localhost",
    builtInForgeApiKey: "test",
  },
}));

// Mock map
vi.mock("./_core/map", () => ({
  makeRequest: vi.fn(),
}));

describe("buscarPacientesHemodialise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct structure from PostgreSQL fallback", async () => {
    // Mock getDb to return null (force PostgreSQL fallback)
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    const agora = new Date();
    const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Mock ativos query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          numatend: "50001",
          paciente: "Carlos Hemodiálise",
          centro_custo: "HEMODIALISE MATUTINO",
          prestador: "Dr. Nefrologista",
          data_entrada: trintaDiasAtras.toISOString(),
        },
        {
          numatend: "50002",
          paciente: "Ana Renal",
          centro_custo: "HEMODIALISE VESPERTINO",
          prestador: "Dr. Nefrologista",
          data_entrada: agora.toISOString(),
        },
      ],
    });

    // Mock sessões no mês query
    mockQuery.mockResolvedValueOnce({
      rows: [{ total: "15" }],
    });

    const { buscarPacientesHemodialise } = await import("./relatorioAtendimentos");
    const result = await buscarPacientesHemodialise();

    expect(result).toBeDefined();
    expect(result.totalPacientes).toBe(2);
    expect(result.pacientes).toHaveLength(2);
    expect(result.fonte).toBe("postgresql_direto");
    expect(result.sessoesNoMes).toBe(15);

    // Check structure
    expect(result.pacientes[0]).toHaveProperty("numatend");
    expect(result.pacientes[0]).toHaveProperty("paciente");
    expect(result.pacientes[0]).toHaveProperty("turno");
    expect(result.pacientes[0]).toHaveProperty("prestador");
    expect(result.pacientes[0]).toHaveProperty("dataEntrada");
    expect(result.pacientes[0]).toHaveProperty("diasTratamento");
  });

  it("should extract turno from centro de custo", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    const agora = new Date();

    mockQuery.mockResolvedValueOnce({
      rows: [
        { numatend: "1", paciente: "P1", centro_custo: "HEMODIALISE MATUTINO", prestador: "D1", data_entrada: agora.toISOString() },
        { numatend: "2", paciente: "P2", centro_custo: "HEMODIALISE VESPERTINO", prestador: "D2", data_entrada: agora.toISOString() },
        { numatend: "3", paciente: "P3", centro_custo: "HEMODIALISE NOTURNO", prestador: "D3", data_entrada: agora.toISOString() },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [{ total: "0" }] });

    const { buscarPacientesHemodialise } = await import("./relatorioAtendimentos");
    const result = await buscarPacientesHemodialise();

    expect(result.pacientes[0].turno).toBe("Matutino");
    expect(result.pacientes[1].turno).toBe("Vespertino");
    expect(result.pacientes[2].turno).toBe("Noturno");

    // Check porTurno grouping
    expect(result.porTurno).toHaveLength(3);
    expect(result.porTurno.every(t => t.total === 1)).toBe(true);
  });

  it("should handle empty results", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total: "0" }] });

    const { buscarPacientesHemodialise } = await import("./relatorioAtendimentos");
    const result = await buscarPacientesHemodialise();

    expect(result.totalPacientes).toBe(0);
    expect(result.pacientes).toHaveLength(0);
    expect(result.porTurno).toHaveLength(0);
    expect(result.porPrestador).toHaveLength(0);
    expect(result.sessoesNoMes).toBe(0);
    expect(result.mediaDiasTratamento).toBe(0);
  });

  it("should calculate diasTratamento correctly", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          numatend: "99999",
          paciente: "Teste Longo Tratamento",
          centro_custo: "HEMODIALISE",
          prestador: "Dr. Teste",
          data_entrada: trintaDiasAtras.toISOString(),
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [{ total: "5" }] });

    const { buscarPacientesHemodialise } = await import("./relatorioAtendimentos");
    const result = await buscarPacientesHemodialise();

    expect(result.pacientes[0].diasTratamento).toBeGreaterThanOrEqual(29);
    expect(result.pacientes[0].diasTratamento).toBeLessThanOrEqual(31);
    expect(result.mediaDiasTratamento).toBeGreaterThanOrEqual(29);
  });

  it("should group porPrestador correctly and limit to top 10", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce(null);

    const agora = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [
        { numatend: "1", paciente: "P1", centro_custo: "HEMODIALISE", prestador: "Dr. A", data_entrada: agora.toISOString() },
        { numatend: "2", paciente: "P2", centro_custo: "HEMODIALISE", prestador: "Dr. A", data_entrada: agora.toISOString() },
        { numatend: "3", paciente: "P3", centro_custo: "HEMODIALISE", prestador: "Dr. B", data_entrada: agora.toISOString() },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [{ total: "10" }] });

    const { buscarPacientesHemodialise } = await import("./relatorioAtendimentos");
    const result = await buscarPacientesHemodialise();

    expect(result.porPrestador[0].nome).toBe("Dr. A");
    expect(result.porPrestador[0].total).toBe(2);
    expect(result.porPrestador[1].nome).toBe("Dr. B");
    expect(result.porPrestador[1].total).toBe(1);
  });
});
