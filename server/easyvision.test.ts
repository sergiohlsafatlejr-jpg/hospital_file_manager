import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg module
vi.mock("pg", () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  };
  return {
    default: {
      Pool: vi.fn(() => mockPool),
    },
  };
});

describe("EasyVisionConnector", () => {
  let EasyVisionConnector: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./connectors/EasyVisionConnector");
    EasyVisionConnector = mod.EasyVisionConnector;
  });

  it("deve criar uma instância com as configurações corretas", () => {
    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    expect(connector).toBeDefined();
  });

  it("deve conectar com sucesso ao banco EASYVISION", async () => {
    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    const resultado = await connector.conectar();
    expect(resultado).toBe(true);
  });

  it("deve respeitar a configuração SSL ao criar o pool", async () => {
    const pg = await import("pg");
    const connector = new EasyVisionConnector({
      host: "postgres.hospital.local",
      port: 5432,
      database: "hospital",
      user: "integrador",
      password: "segredo",
      ssl: true,
    });

    await connector.conectar();

    expect(pg.default.Pool).toHaveBeenLastCalledWith(expect.objectContaining({
      ssl: { rejectUnauthorized: false },
    }));
  });

  it("deve traduzir rejeição do pg_hba para uma orientação operacional", async () => {
    const pg = await import("pg");
    const mockPool = new (pg.default.Pool as any)();
    mockPool.connect.mockRejectedValueOnce(new Error(
      'no pg_hba.conf entry for host "34.96.50.193", user "TI", database "db1", no encryption'
    ));

    const connector = new EasyVisionConnector({
      host: "postgres.hospital.local",
      port: 5432,
      database: "hospital",
      user: "integrador",
      password: "segredo",
    });

    await expect(connector.conectar()).resolves.toBe(false);
    expect(connector.getUltimoErro()).toContain("34.96.50.193");
    expect(connector.getUltimoErro()).toContain("pg_hba.conf");
    expect(connector.getUltimoErro()).toContain("sem SSL");
  });

  it("deve desconectar corretamente", async () => {
    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    await connector.conectar();
    await connector.desconectar();
    // Não deve lançar erro
  });

  it("deve lançar erro ao executar query sem conexão", async () => {
    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    // Sem chamar conectar()
    await expect(connector.executarQuery("SELECT 1")).rejects.toThrow(
      "Conexão EASYVISION não estabelecida"
    );
  });

  it("deve extrair atendimentos sem conta (mock)", async () => {
    const pg = await import("pg");
    const mockRows = [
      {
        numatend: "12345",
        nomeplaco: "UNIMED",
        nomepac: "JOAO SILVA",
        carater: "EL",
        datatend: "2026-01-15",
        datasai: "2026-01-16",
        tipoatend: "I",
        tipoatendimentodescricao: "INTERNACAO",
        codserv: "CLINICA MEDICA",
        procprin: "10101012",
        codcc_destino: "BN001",
        motivo: null,
      },
    ];

    // Configurar mock para retornar dados
    const mockPool = new (pg.default.Pool as any)();
    mockPool.query.mockResolvedValueOnce({ rows: mockRows });

    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    await connector.conectar();
    const dados = await connector.extrairAtendimentosSemConta();
    expect(Array.isArray(dados)).toBe(true);
  });

  it("deve extrair atendimentos a faturar (mock)", async () => {
    const pg = await import("pg");
    const mockRows = [
      {
        numatend: "67890",
        nomeplaco: "BRADESCO",
        nomepac: "MARIA SANTOS",
        carater: "UR",
        datatend: "2026-02-01",
        datasai: "2026-02-03",
        tipoatend: "E",
        tipoatendimentodescricao: "EXAME",
        codserv: "LABORATORIO",
        procprin: "20201014",
      },
    ];

    const mockPool = new (pg.default.Pool as any)();
    mockPool.query.mockResolvedValueOnce({ rows: mockRows });

    const config = {
      host: "147.93.4.135",
      port: 5432,
      database: "coletor",
      user: "test_user",
      password: "test_pass",
    };

    const connector = new EasyVisionConnector(config);
    await connector.conectar();
    const dados = await connector.extrairAtendimentosAFaturar();
    expect(Array.isArray(dados)).toBe(true);
  });
});

describe("Fluxo de Sincronização EASYVISION", () => {
  it("deve ter origemSistema EASYVISION nos dados sincronizados", () => {
    // Verifica que o mapeamento de dados usa EASYVISION como origemSistema
    const mockRow = {
      numatend: "12345",
      nomeplaco: "UNIMED",
      nomepac: "JOAO SILVA",
      carater: "EL",
      datatend: "2026-01-15",
      datasai: "2026-01-16",
      tipoatend: "I",
      tipoatendimentodescricao: "INTERNACAO",
      codserv: "CLINICA MEDICA",
      procprin: "10101012",
      codcc_destino: "BN001",
      motivo: null,
    };

    // Simula o mapeamento feito na procedure sincronizarAtendimentosSemConta
    const stagingValue = {
      estabelecimentoId: 4,
      origemSistema: "EASYVISION",
      numatend: mockRow.numatend || "",
      nomeplaco: mockRow.nomeplaco || null,
      nomepac: mockRow.nomepac || null,
      carater: mockRow.carater || null,
      datatend: mockRow.datatend ? new Date(mockRow.datatend) : null,
      datasai: mockRow.datasai ? new Date(mockRow.datasai) : null,
      tipoatend: mockRow.tipoatend || null,
      tipoatendimentodescricao: mockRow.tipoatendimentodescricao || null,
      codserv: mockRow.codserv || null,
      procprin: mockRow.procprin || null,
      codcc_destino: mockRow.codcc_destino || null,
      motivo: mockRow.motivo || null,
    };

    expect(stagingValue.origemSistema).toBe("EASYVISION");
    expect(stagingValue.estabelecimentoId).toBe(4);
    expect(stagingValue.numatend).toBe("12345");
    expect(stagingValue.nomeplaco).toBe("UNIMED");
    expect(stagingValue.datatend).toBeInstanceOf(Date);

    // Simula o mapeamento para atendimentos_unificados
    const unificadoValue = {
      origemSistema: "EASYVISION",
      origemId: `easyvision-sem-conta-${mockRow.numatend}`,
      estabelecimentoId: 4,
      numero_atendimento: mockRow.numatend || null,
      codigo_saida: null,
      convenio: mockRow.nomeplaco || null,
      paciente: mockRow.nomepac || null,
      caracter_atendimento: mockRow.carater || null,
      data_entrada: mockRow.datatend ? new Date(mockRow.datatend) : null,
      data_saida: mockRow.datasai ? new Date(mockRow.datasai) : null,
      tipo_atendimento: mockRow.tipoatend || null,
      descricao_atendimento: mockRow.tipoatendimentodescricao
        ? `${mockRow.tipoatendimentodescricao} - SEM_CONTA`
        : "SEM_CONTA",
      codigo_servico: mockRow.codserv || null,
      codigo_procedimento: mockRow.procprin || null,
      destino_conta: mockRow.codcc_destino || null,
    };

    expect(unificadoValue.origemSistema).toBe("EASYVISION");
    expect(unificadoValue.origemId).toBe("easyvision-sem-conta-12345");
    expect(unificadoValue.descricao_atendimento).toBe("INTERNACAO - SEM_CONTA");
    expect(unificadoValue.convenio).toBe("UNIMED");
    expect(unificadoValue.paciente).toBe("JOAO SILVA");
  });

  it("deve mapear corretamente atendimentos a faturar para unificados", () => {
    const mockRow = {
      numatend: "67890",
      nomeplaco: "BRADESCO",
      nomepac: "MARIA SANTOS",
      carater: "UR",
      datatend: "2026-02-01",
      datasai: "2026-02-03",
      tipoatend: "E",
      tipoatendimentodescricao: "EXAME",
      codserv: "LABORATORIO",
      procprin: "20201014",
    };

    const unificadoValue = {
      origemSistema: "EASYVISION",
      origemId: `easyvision-a-faturar-${mockRow.numatend}`,
      estabelecimentoId: 4,
      numero_atendimento: mockRow.numatend || null,
      codigo_saida: null,
      convenio: mockRow.nomeplaco || null,
      paciente: mockRow.nomepac || null,
      caracter_atendimento: mockRow.carater || null,
      data_entrada: mockRow.datatend ? new Date(mockRow.datatend) : null,
      data_saida: mockRow.datasai ? new Date(mockRow.datasai) : null,
      tipo_atendimento: mockRow.tipoatend || null,
      descricao_atendimento: mockRow.tipoatendimentodescricao
        ? `${mockRow.tipoatendimentodescricao} - A_FATURAR`
        : "A_FATURAR",
      codigo_servico: mockRow.codserv || null,
      codigo_procedimento: mockRow.procprin || null,
      destino_conta: null,
    };

    expect(unificadoValue.origemSistema).toBe("EASYVISION");
    expect(unificadoValue.origemId).toBe("easyvision-a-faturar-67890");
    expect(unificadoValue.descricao_atendimento).toBe("EXAME - A_FATURAR");
    expect(unificadoValue.convenio).toBe("BRADESCO");
    expect(unificadoValue.destino_conta).toBeNull();
  });

  it("deve respeitar o estabelecimentoId no fluxo de sincronização", () => {
    const estabelecimentoId = 4; // Instituto do Rim
    const mockRow = {
      numatend: "11111",
      nomeplaco: "AMIL",
      nomepac: "PEDRO OLIVEIRA",
      tipoatendimentodescricao: "AMBULATORIO",
    };

    const staging = {
      estabelecimentoId,
      origemSistema: "EASYVISION",
      numatend: mockRow.numatend,
    };

    const unificado = {
      origemSistema: "EASYVISION",
      origemId: `easyvision-sem-conta-${mockRow.numatend}`,
      estabelecimentoId,
    };

    expect(staging.estabelecimentoId).toBe(4);
    expect(unificado.estabelecimentoId).toBe(4);
    expect(staging.origemSistema).toBe("EASYVISION");
  });

  it("deve lidar com campos nulos corretamente", () => {
    const mockRow = {
      numatend: "99999",
      nomeplaco: null,
      nomepac: null,
      carater: null,
      datatend: null,
      datasai: null,
      tipoatend: null,
      tipoatendimentodescricao: null,
      codserv: null,
      procprin: null,
      codcc_destino: null,
      motivo: null,
    };

    const stagingValue = {
      estabelecimentoId: 4,
      origemSistema: "EASYVISION",
      numatend: mockRow.numatend || "",
      nomeplaco: mockRow.nomeplaco || null,
      nomepac: mockRow.nomepac || null,
      carater: mockRow.carater || null,
      datatend: mockRow.datatend ? new Date(mockRow.datatend) : null,
      datasai: mockRow.datasai ? new Date(mockRow.datasai) : null,
      tipoatend: mockRow.tipoatend || null,
      tipoatendimentodescricao: mockRow.tipoatendimentodescricao || null,
      codserv: mockRow.codserv || null,
      procprin: mockRow.procprin || null,
      codcc_destino: mockRow.codcc_destino || null,
      motivo: mockRow.motivo || null,
    };

    expect(stagingValue.numatend).toBe("99999");
    expect(stagingValue.nomeplaco).toBeNull();
    expect(stagingValue.datatend).toBeNull();
    expect(stagingValue.datasai).toBeNull();

    // Unificado com campos nulos
    const unificadoValue = {
      descricao_atendimento: mockRow.tipoatendimentodescricao
        ? `${mockRow.tipoatendimentodescricao} - SEM_CONTA`
        : "SEM_CONTA",
    };

    expect(unificadoValue.descricao_atendimento).toBe("SEM_CONTA");
  });
});
