import { describe, it, expect, vi } from "vitest";

// Mock the pgAtendimentos module
vi.mock("./pgAtendimentos", () => ({
  getAtendimentosAFaturar: vi.fn().mockResolvedValue([
    {
      numatend: "830001",
      codtipsai: "A",
      nomeplaco: "UNIMED",
      nomepac: "Carlos Alberto",
      carater: "EL",
      datatend: "2026-01-10",
      datasai: "2026-01-15",
      tipoatend: "I",
      tipoatendimentodescricao: "INTERNACAO",
      codserv: "Clínica Médica",
      procprin: "10101012",
      codcc_destino: "BN2028",
    },
    {
      numatend: "830002",
      codtipsai: null,
      nomeplaco: "CASSI",
      nomepac: "Maria Fernanda",
      carater: "UR",
      datatend: "2026-01-20",
      datasai: "2026-01-20",
      tipoatend: "E",
      tipoatendimentodescricao: "EXAME",
      codserv: "Laboratório",
      procprin: "40301010",
      codcc_destino: "000022",
    },
    {
      numatend: "830003",
      codtipsai: null,
      nomeplaco: "IPASGO",
      nomepac: "João Pedro",
      carater: "EL",
      datatend: "2026-02-01",
      datasai: null,
      tipoatend: "A",
      tipoatendimentodescricao: "AMBULATORIO",
      codserv: "Consulta",
      procprin: "10101039",
      codcc_destino: "BN100",
    },
  ]),
}));

describe("Atendimentos a Faturar Module", () => {
  it("should return atendimentos a faturar data", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const result = await getAtendimentosAFaturar();
    expect(result).toHaveLength(3);
    expect(result[0].numatend).toBe("830001");
    expect(result[0].nomepac).toBe("Carlos Alberto");
    expect(result[0].tipoatendimentodescricao).toBe("INTERNACAO");
    expect(result[0].codtipsai).toBe("A");
  });

  it("should have correct fields for each row", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const result = await getAtendimentosAFaturar();
    const primeiro = result[0];

    expect(primeiro).toHaveProperty("numatend");
    expect(primeiro).toHaveProperty("codtipsai");
    expect(primeiro).toHaveProperty("nomeplaco");
    expect(primeiro).toHaveProperty("nomepac");
    expect(primeiro).toHaveProperty("carater");
    expect(primeiro).toHaveProperty("datatend");
    expect(primeiro).toHaveProperty("datasai");
    expect(primeiro).toHaveProperty("tipoatend");
    expect(primeiro).toHaveProperty("tipoatendimentodescricao");
    expect(primeiro).toHaveProperty("codserv");
    expect(primeiro).toHaveProperty("procprin");
    expect(primeiro).toHaveProperty("codcc_destino");
  });

  it("should calculate KPIs from atendimentos a faturar data", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const data = await getAtendimentosAFaturar();

    const total = data.length;
    const internacao = data.filter((d: any) => d.tipoatendimentodescricao === "INTERNACAO").length;
    const exame = data.filter((d: any) => d.tipoatendimentodescricao === "EXAME").length;
    const ambulatorio = data.filter((d: any) => d.tipoatendimentodescricao === "AMBULATORIO").length;

    expect(total).toBe(3);
    expect(internacao).toBe(1);
    expect(exame).toBe(1);
    expect(ambulatorio).toBe(1);
  });

  it("should filter by carater (urgencia vs eletivo)", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const data = await getAtendimentosAFaturar();

    const urgencia = data.filter((d: any) => d.carater === "UR");
    const eletivo = data.filter((d: any) => d.carater === "EL");

    expect(urgencia).toHaveLength(1);
    expect(urgencia[0].numatend).toBe("830002");
    expect(eletivo).toHaveLength(2);
  });

  it("should handle codtipsai being null", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const data = await getAtendimentosAFaturar();

    const comTipoSaida = data.filter((d: any) => d.codtipsai !== null);
    const semTipoSaida = data.filter((d: any) => d.codtipsai === null);

    expect(comTipoSaida).toHaveLength(1);
    expect(semTipoSaida).toHaveLength(2);
  });

  it("should have valid codcc_destino values", async () => {
    const { getAtendimentosAFaturar } = await import("./pgAtendimentos");
    const data = await getAtendimentosAFaturar();

    const validDestinos = ["BN2028", "000022", "BN100"];
    data.forEach((d: any) => {
      expect(validDestinos).toContain(d.codcc_destino);
    });
  });
});
