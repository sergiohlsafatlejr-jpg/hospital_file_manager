import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module - MySQL/Drizzle returns [rows, fields] format
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: (...args: any[]) => mockExecute(...args),
  }),
}));

// Mock drizzle-orm sql
vi.mock("drizzle-orm", () => ({
  sql: {
    raw: (s: string) => s,
  },
}));

import {
  buscarCustosPorConvenioSamaritano,
  buscarCustosPorContaSamaritano,
  buscarDetalheContaCustoSamaritano,
  buscarCustosPorSetorSamaritano,
} from "./relatorioCustosSamaritano";

// Helper: MySQL format [rows, fields]
function mysqlResult(rows: any[]) {
  return [rows, []]; // [rows, fields]
}

describe("relatorioCustosSamaritano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buscarCustosPorConvenioSamaritano", () => {
    it("deve retornar dados estruturados com kpis, resumoPorConvenio e itensDetalhados", async () => {
      // Mock convenios
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { convenio: "Ipasgo Novo", codplaco: "IP01" },
        { convenio: "Unimed Goiânia", codplaco: "UN01" },
      ]));
      // Mock competencias
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { competencia: "2026/03" },
        { competencia: "2026/02" },
        { competencia: "2026/01" },
      ]));
      // Mock detalhado
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          codprod: "1001",
          descricao: "Consulta Médica",
          tipoitem: "CO",
          convenio: "Ipasgo Novo",
          codplaco: "IP01",
          total_quantidade: 10,
          total_cobrado: 1500.00,
          total_vlcusto: 800.00,
          total_custo_estoque: 900.00,
          num_lancamentos: 10,
        },
      ]));
      // Mock resumo
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          convenio: "Ipasgo Novo",
          codplaco: "IP01",
          total_lancamentos: 50,
          total_faturado: 15000.00,
          total_vlcusto: 8000.00,
          total_custo_estoque: 9000.00,
        },
      ]));

      const result = await buscarCustosPorConvenioSamaritano(2280016, {});

      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("resumoPorConvenio");
      expect(result).toHaveProperty("itensDetalhados");
      expect(result).toHaveProperty("conveniosDisponiveis");
      expect(result).toHaveProperty("competenciasDisponiveis");
      expect(result.fonte).toBe("samaritano_custo_staging");
      expect(result.conveniosDisponiveis).toHaveLength(2);
      expect(result.competenciasDisponiveis).toHaveLength(3);
      expect(result.itensDetalhados).toHaveLength(1);
      expect(result.itensDetalhados[0].codprod).toBe("1001");
      expect(result.itensDetalhados[0].descricao).toBe("Consulta Médica");
      expect(result.itensDetalhados[0].margem).toBe(600); // 1500 - 900
      expect(result.itensDetalhados[0].resultado).toBe("lucro");
      expect(result.resumoPorConvenio).toHaveLength(1);
      expect(result.resumoPorConvenio[0].convenio).toBe("Ipasgo Novo");
      expect(result.kpis.totalConvenios).toBe(1);
      expect(result.kpis.valorFaturadoTotal).toBe(1500);
    });

    it("deve aplicar filtros de competência e convênio (usando codplaco)", async () => {
      // Mock all 4 queries
      mockExecute.mockResolvedValue(mysqlResult([]));

      await buscarCustosPorConvenioSamaritano(2280016, {
        competencia: "2026/01",
        convenio: "IPN",
      });

      // Verify the detalhado query includes filters
      expect(mockExecute).toHaveBeenCalledTimes(4);
      const detalhadoCall = mockExecute.mock.calls[2][0];
      expect(detalhadoCall).toContain("competencia = '2026/01'");
      expect(detalhadoCall).toContain("codplaco = 'IPN'");
    });
  });

  describe("buscarCustosPorContaSamaritano", () => {
    it("deve retornar contas agrupadas com kpis e setoresDisponiveis", async () => {
      // Mock convenios
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { convenio: "Ipasgo Novo", codplaco: "IP01" },
      ]));
      // Mock competencias
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { competencia: "2026/01" },
      ]));
      // Mock setores
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { setor: "Ambulatório" },
        { setor: "Bloco Cirúrgico" },
      ]));
      // Mock contas
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          numconta: 12345,
          paciente: "João Silva",
          convenio: "Ipasgo Novo",
          codplaco: "IP01",
          data_execucao: "2026-01-15",
          total_itens: 5,
          total_cobrado: 2000.00,
          total_vlcusto: 1200.00,
          total_custo_estoque: 1300.00,
        },
      ]));

      const result = await buscarCustosPorContaSamaritano(2280016, {});

      expect(result).toHaveProperty("contas");
      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("setoresDisponiveis");
      expect(result.fonte).toBe("samaritano_custo_staging");
      expect(result.setoresDisponiveis).toHaveLength(2);
      expect(result.setoresDisponiveis[0]).toBe("Ambulatório");
      expect(result.contas).toHaveLength(1);
      expect(result.contas[0].numconta).toBe("12345");
      expect(result.contas[0].paciente).toBe("João Silva");
      expect(result.contas[0].margem).toBe(700); // 2000 - 1300
      expect(result.contas[0].resultado).toBe("lucro");
      expect(result.kpis.totalContas).toBe(1);
      expect(result.kpis.contasComLucro).toBe(1);
    });

    it("deve aplicar filtro de setor (usando codplaco para convênio)", async () => {
      // Mock all 4 queries (convenios, competencias, setores, contas)
      mockExecute.mockResolvedValue(mysqlResult([]));

      await buscarCustosPorContaSamaritano(2280016, {
        convenio: "IPN",
        setor: "Ambulatório",
      });

      // Verify the main query includes setor and codplaco filters
      expect(mockExecute).toHaveBeenCalledTimes(4);
      const mainCall = mockExecute.mock.calls[3][0];
      expect(mainCall).toContain("codplaco = 'IPN'");
      expect(mainCall).toContain("setor = 'Ambulatório'");
    });
  });

  describe("buscarDetalheContaCustoSamaritano", () => {
    it("deve retornar detalhes de uma conta específica", async () => {
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          codprod: "1001",
          descricao: "Consulta",
          tipoitem: "CO",
          paciente: "Maria",
          convenio: "Unimed",
          codplaco: "UN01",
          setor: "Ambulatório",
          data_execucao: "2026-01-10",
          quantidade: 1,
          total_cobrado: 200.00,
          total_vlcusto: 100.00,
          total_custo_estoque: 120.00,
        },
        {
          codprod: "2002",
          descricao: "Exame Sangue",
          tipoitem: "EX",
          paciente: "Maria",
          convenio: "Unimed",
          codplaco: "UN01",
          setor: "Laboratório",
          data_execucao: "2026-01-10",
          quantidade: 3,
          total_cobrado: 150.00,
          total_vlcusto: 80.00,
          total_custo_estoque: 90.00,
        },
      ]));

      const result = await buscarDetalheContaCustoSamaritano(2280016, "12345");

      expect(result).not.toBeNull();
      expect(result!.numconta).toBe("12345");
      expect(result!.paciente).toBe("Maria");
      expect(result!.itens).toHaveLength(2);
      expect(result!.totalItens).toBe(2);
      expect(result!.custoTotal).toBe(210); // 120 + 90
      expect(result!.valorCobrado).toBe(350); // 200 + 150
      expect(result!.margem).toBe(140); // 350 - 210
      expect(result!.resultado).toBe("lucro");
    });

    it("deve retornar null se conta não encontrada", async () => {
      mockExecute.mockResolvedValueOnce(mysqlResult([]));

      const result = await buscarDetalheContaCustoSamaritano(2280016, "99999");
      expect(result).toBeNull();
    });
  });

  describe("buscarCustosPorSetorSamaritano", () => {
    it("deve retornar resumo por setor com kpis", async () => {
      // Mock convenios
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { convenio: "Ipasgo Novo", codplaco: "IP01" },
      ]));
      // Mock competencias
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { competencia: "2026/01" },
      ]));
      // Mock setores
      mockExecute.mockResolvedValueOnce(mysqlResult([
        { setor: "Ambulatório" },
        { setor: "Bloco Cirúrgico" },
      ]));
      // Mock resumo por setor
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          setor: "Ambulatório",
          total_lancamentos: 100,
          total_itens: 30,
          total_contas: 20,
          total_faturado: 50000.00,
          total_vlcusto: 30000.00,
          total_custo_estoque: 35000.00,
        },
      ]));
      // Mock top itens por setor
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          setor: "Ambulatório",
          descricao: "Consulta",
          quantidade: 50,
          custo_total: 5000.00,
          valor_cobrado: 7500.00,
        },
      ]));
      // Mock detalhado
      mockExecute.mockResolvedValueOnce(mysqlResult([
        {
          codprod: "1001",
          descricao: "Consulta",
          tipoitem: "CO",
          setor: "Ambulatório",
          total_quantidade: 50,
          total_cobrado: 7500.00,
          total_vlcusto: 3000.00,
          total_custo_estoque: 5000.00,
          num_lancamentos: 50,
        },
      ]));

      const result = await buscarCustosPorSetorSamaritano(2280016, {});

      expect(result).toHaveProperty("resumoPorSetor");
      expect(result).toHaveProperty("itensDetalhados");
      expect(result).toHaveProperty("kpis");
      expect(result.fonte).toBe("samaritano_custo_staging");
      expect(result.setoresDisponiveis).toHaveLength(2);
      expect(result.resumoPorSetor).toHaveLength(1);
      expect(result.resumoPorSetor[0].setor).toBe("Ambulatório");
      expect(result.resumoPorSetor[0].totalFaturado).toBe(50000);
      expect(result.resumoPorSetor[0].totalCusto).toBe(35000);
      expect(result.resumoPorSetor[0].margem).toBe(15000);
      expect(result.resumoPorSetor[0].resultado).toBe("lucro");
      expect(result.kpis.totalSetores).toBe(1);
      expect(result.kpis.setoresComLucro).toBe(1);
    });
  });
});
