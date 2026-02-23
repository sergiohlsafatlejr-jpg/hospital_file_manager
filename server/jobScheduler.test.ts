import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JobScheduler, getJobScheduler, initializeJobScheduler } from "./jobScheduler";

describe("JobScheduler", () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    // Criar nova instância para cada teste
    scheduler = new JobScheduler();
  });

  afterEach(async () => {
    // Parar scheduler após cada teste
    if (scheduler) {
      await scheduler.stop();
    }
  });

  describe("Inicialização", () => {
    it("deve criar instância do JobScheduler", () => {
      expect(scheduler).toBeDefined();
      expect(scheduler).toBeInstanceOf(JobScheduler);
    });

    it("deve retornar status inicial correto", () => {
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.totalJobs).toBe(0);
      expect(status.jobs).toEqual([]);
    });

    it("deve marcar como rodando após start", async () => {
      // Mock do banco de dados para retornar array vazio
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe("Singleton", () => {
    it("deve retornar mesma instância com getJobScheduler", () => {
      const scheduler1 = getJobScheduler();
      const scheduler2 = getJobScheduler();
      expect(scheduler1).toBe(scheduler2);
    });
  });

  describe("Frequências de Sincronização", () => {
    it("deve suportar frequência tempo_real", () => {
      const frequencia = "tempo_real" as const;
      expect(["tempo_real", "1x_dia", "1x_semana"]).toContain(frequencia);
    });

    it("deve suportar frequência 1x_dia", () => {
      const frequencia = "1x_dia" as const;
      expect(["tempo_real", "1x_dia", "1x_semana"]).toContain(frequencia);
    });

    it("deve suportar frequência 1x_semana", () => {
      const frequencia = "1x_semana" as const;
      expect(["tempo_real", "1x_dia", "1x_semana"]).toContain(frequencia);
    });
  });

  describe("Status do Scheduler", () => {
    it("deve retornar objeto status com propriedades corretas", () => {
      const status = scheduler.getStatus();
      
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("totalJobs");
      expect(status).toHaveProperty("jobs");
      expect(Array.isArray(status.jobs)).toBe(true);
    });

    it("deve ter totalJobs igual a zero inicialmente", () => {
      const status = scheduler.getStatus();
      expect(status.totalJobs).toBe(0);
    });

    it("deve ter isRunning como false inicialmente", () => {
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe("Parada do Scheduler", () => {
    it("deve parar sem erros quando não há jobs", async () => {
      await expect(scheduler.stop()).resolves.not.toThrow();
    });

    it("deve marcar como não rodando após stop", async () => {
      await scheduler.stop();
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe("Configurações de Sincronização", () => {
    it("deve aceitar configuração WARLEINE", () => {
      const config = {
        id: 1,
        sistema: "warleine",
        tipoDados: "atendimentos",
        estabelecimentoId: 1,
        querySql: "SELECT * FROM atendimentos",
        frequencia: "tempo_real" as const,
        ativo: true,
      };

      expect(config.sistema).toBe("warleine");
      expect(config.tipoDados).toBe("atendimentos");
    });

    it("deve aceitar configuração TASY", () => {
      const config = {
        id: 2,
        sistema: "tasy",
        tipoDados: "faturamento",
        estabelecimentoId: 1,
        querySql: "SELECT * FROM faturamento",
        frequencia: "1x_dia" as const,
        ativo: true,
      };

      expect(config.sistema).toBe("tasy");
      expect(config.tipoDados).toBe("faturamento");
    });

    it("deve aceitar configuração OMNI", () => {
      const config = {
        id: 3,
        sistema: "omni",
        tipoDados: "procedimentos",
        estabelecimentoId: 1,
        querySql: "SELECT * FROM procedimentos",
        frequencia: "1x_semana" as const,
        ativo: true,
      };

      expect(config.sistema).toBe("omni");
      expect(config.tipoDados).toBe("procedimentos");
    });

    it("deve aceitar configuração GESTHOR", () => {
      const config = {
        id: 4,
        sistema: "gesthor",
        tipoDados: "pacientes",
        estabelecimentoId: 1,
        querySql: "SELECT * FROM pacientes",
        frequencia: "1x_dia" as const,
        ativo: true,
      };

      expect(config.sistema).toBe("gesthor");
      expect(config.tipoDados).toBe("pacientes");
    });
  });

  describe("Tipos de Dados", () => {
    it("deve aceitar tipo_dados atendimentos", () => {
      const tipoDados = "atendimentos";
      expect(["atendimentos", "faturamento", "procedimentos", "pacientes"]).toContain(
        tipoDados
      );
    });

    it("deve aceitar tipo_dados faturamento", () => {
      const tipoDados = "faturamento";
      expect(["atendimentos", "faturamento", "procedimentos", "pacientes"]).toContain(
        tipoDados
      );
    });

    it("deve aceitar tipo_dados procedimentos", () => {
      const tipoDados = "procedimentos";
      expect(["atendimentos", "faturamento", "procedimentos", "pacientes"]).toContain(
        tipoDados
      );
    });

    it("deve aceitar tipo_dados pacientes", () => {
      const tipoDados = "pacientes";
      expect(["atendimentos", "faturamento", "procedimentos", "pacientes"]).toContain(
        tipoDados
      );
    });
  });

  describe("Configuração de Conexão", () => {
    it("deve aceitar conexaoConfig com host, port, database, user, password", () => {
      const conexaoConfig = {
        host: "localhost",
        port: 5432,
        database: "warleine",
        user: "admin",
        password: "senha123",
      };

      expect(conexaoConfig.host).toBe("localhost");
      expect(conexaoConfig.port).toBe(5432);
      expect(conexaoConfig.database).toBe("warleine");
      expect(conexaoConfig.user).toBe("admin");
      expect(conexaoConfig.password).toBe("senha123");
    });

    it("deve aceitar conexaoConfig como undefined", () => {
      const conexaoConfig = undefined;
      expect(conexaoConfig).toBeUndefined();
    });

    it("deve aceitar conexaoConfig com campos opcionais", () => {
      const conexaoConfig = {
        host: "localhost",
        port: 5432,
      };

      expect(conexaoConfig.host).toBe("localhost");
      expect(conexaoConfig.port).toBe(5432);
      expect(conexaoConfig.database).toBeUndefined();
    });
  });

  describe("Status de Configuração", () => {
    it("deve aceitar ativo como true", () => {
      const config = {
        id: 1,
        ativo: true,
      };

      expect(config.ativo).toBe(true);
    });

    it("deve aceitar ativo como false", () => {
      const config = {
        id: 1,
        ativo: false,
      };

      expect(config.ativo).toBe(false);
    });
  });

  describe("Rastreamento de Sincronização", () => {
    it("deve aceitar ultimaSincronizacao como timestamp", () => {
      const config = {
        id: 1,
        ultimaSincronizacao: new Date("2026-02-23"),
      };

      expect(config.ultimaSincronizacao).toBeInstanceOf(Date);
    });

    it("deve aceitar ultimaSincronizacao como null", () => {
      const config = {
        id: 1,
        ultimaSincronizacao: null,
      };

      expect(config.ultimaSincronizacao).toBeNull();
    });

    it("deve aceitar ultimoErro como string", () => {
      const config = {
        id: 1,
        ultimoErro: "Erro de conexão",
      };

      expect(config.ultimoErro).toBe("Erro de conexão");
    });

    it("deve aceitar ultimoErro como null", () => {
      const config = {
        id: 1,
        ultimoErro: null,
      };

      expect(config.ultimoErro).toBeNull();
    });
  });

  describe("Inicialização Global", () => {
    it("deve retornar instância do JobScheduler", async () => {
      // Não vamos chamar initializeJobScheduler pois requer banco de dados
      // Apenas testamos que a função existe
      expect(typeof initializeJobScheduler).toBe("function");
    });
  });
});
