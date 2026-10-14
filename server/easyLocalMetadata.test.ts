import { readEasyLocalConfig } from "./easyLocalConnection";
vi.mock("./easyLocalCadastroStore", () => ({
  resolverEasyLocalConfig: vi.fn(),
}));
import { resolverEasyLocalConfig } from "./easyLocalCadastroStore";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  Client: vi.fn(),
}));
vi.mock("pg", () => ({ default: { Client: pgMock.Client } }));

import {
  detectarEasyLocalCampos,
  listarEasyLocalOrigens,
} from "./easyLocalMetadata";

const env = {
  EASYLOCAL_PG_HOST: "easylocal.example.org",
  EASYLOCAL_PG_PORT: "5432",
  EASYLOCAL_PG_DATABASE: "easylocal",
  EASYLOCAL_PG_USER: "safatle_catalog_reader",
  EASYLOCAL_PG_PASSWORD: "segredo-de-teste",
  EASYLOCAL_PG_CA_CERT:
    "-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----",
};
const originalEnv: Record<string, string | undefined> = {};

function mockSafeCatalog(columns: unknown[] = [], origins: unknown[] = []) {
  pgMock.query.mockImplementation(async (query: string) => {
    if (query.includes("information_schema.columns")) return { rows: columns };
    if (query.includes("information_schema.tables")) return { rows: origins };
    return { rows: [] };
  });
}

describe("catálogo EASYLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolverEasyLocalConfig).mockImplementation(async () =>
      readEasyLocalConfig()
    );
    for (const [key, value] of Object.entries(env)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
    pgMock.Client.mockImplementation(() => ({
      connect: pgMock.connect,
      query: pgMock.query,
      end: pgMock.end,
    }));
    pgMock.connect.mockResolvedValue(undefined);
    pgMock.end.mockResolvedValue(undefined);
    mockSafeCatalog();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(env)) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("aceita credencial administrativa e consulta somente metadados em READ ONLY com TLS validado", async () => {
    vi.mocked(resolverEasyLocalConfig).mockResolvedValueOnce({
      host: env.EASYLOCAL_PG_HOST,
      port: 5432,
      database: env.EASYLOCAL_PG_DATABASE,
      user: "postgres_admin",
      password: "segredo-administrativo-de-teste",
      ca: env.EASYLOCAL_PG_CA_CERT,
    });
    mockSafeCatalog(
      [],
      [
        { schema: "clinica", tabela: "atendimentos" },
        { schema: "clinica", tabela: "pacientes" },
      ]
    );

    await expect(listarEasyLocalOrigens()).resolves.toEqual([
      { schema: "clinica", tabela: "atendimentos" },
      { schema: "clinica", tabela: "pacientes" },
    ]);

    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        host: env.EASYLOCAL_PG_HOST,
        user: "postgres_admin",
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
        statement_timeout: 5000,
        ssl: {
          ca: env.EASYLOCAL_PG_CA_CERT,
          rejectUnauthorized: true,
          servername: env.EASYLOCAL_PG_HOST,
        },
      })
    );
    const originQuery = pgMock.query.mock.calls.find(([query]) =>
      String(query).includes("information_schema.tables")
    );
    expect(originQuery).toBeDefined();
    expect(originQuery![0]).toContain("table_type IN ('BASE TABLE', 'VIEW')");
    expect(originQuery![0]).toContain("has_table_privilege");
    expect(originQuery![0]).toContain("LIMIT $1");
    expect(originQuery![1]).toEqual([201]);
    expect(pgMock.query).toHaveBeenCalledWith("BEGIN READ ONLY");
    expect(pgMock.query).toHaveBeenCalledWith("ROLLBACK");
    const statements = pgMock.query.mock.calls.map(([query]) => String(query));
    expect(statements.join("\n")).not.toMatch(
      /pg_catalog\.pg_roles|pg_auth|GRANT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE/i
    );
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("falha em vez de omitir silenciosamente a origem 201", async () => {
    mockSafeCatalog(
      [],
      Array.from({ length: 201 }, (_, index) => ({
        schema: "clinica",
        tabela: `origem_${index}`,
      }))
    );

    await expect(listarEasyLocalOrigens()).rejects.toThrow(
      "mais de 200 origens"
    );
    const originQuery = pgMock.query.mock.calls.find(([query]) =>
      String(query).includes("information_schema.tables")
    );
    expect(originQuery?.[1]).toEqual([201]);
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("passa origem validada como parâmetros e nunca interpola identificadores", async () => {
    mockSafeCatalog([
      {
        nome: "codigo",
        tipo_postgres: "integer",
        tamanho: null,
        precisao: 32,
        escala: 0,
        nullable: "NO",
      },
    ]);

    await expect(
      detectarEasyLocalCampos({ schema: "clinica", tabela: "atendimentos" })
    ).resolves.toEqual([
      {
        nome: "codigo",
        tipoPostgres: "integer",
        tipoSugerido: "int",
        obrigatorio: true,
      },
    ]);

    const columnsQuery = pgMock.query.mock.calls.find(([query]) =>
      String(query).includes("information_schema.columns")
    );
    expect(columnsQuery).toBeDefined();
    expect(columnsQuery![0]).toContain("c.table_schema = $1");
    expect(columnsQuery![0]).toContain("c.table_name = $2");
    expect(columnsQuery![0]).not.toContain("clinica");
    expect(columnsQuery![0]).not.toContain("atendimentos");
    expect(columnsQuery![1]).toEqual(["clinica", "atendimentos"]);

    await expect(
      detectarEasyLocalCampos({
        schema: "clinica;drop",
        tabela: "atendimentos",
      })
    ).rejects.toThrow("origem informada é inválida");
    expect(pgMock.Client).toHaveBeenCalledTimes(1);
  });

  it("mapeia tipos com metadata precisa e preserva tipos nulos ou incompatíveis para revisão", async () => {
    mockSafeCatalog([
      {
        nome: "id_externo",
        tipo_postgres: "bigint",
        tamanho: null,
        precisao: 64,
        escala: 0,
        nullable: "NO",
      },
      {
        nome: "valor",
        tipo_postgres: "numeric",
        tamanho: null,
        precisao: 20,
        escala: 4,
        nullable: "YES",
      },
      {
        nome: "observacao",
        tipo_postgres: "character varying",
        tamanho: 4097,
        precisao: null,
        escala: null,
        nullable: "YES",
      },
      {
        nome: "nascimento",
        tipo_postgres: "date",
        tamanho: null,
        precisao: null,
        escala: null,
        nullable: "YES",
      },
      {
        nome: "ocorrido_em",
        tipo_postgres: "timestamp with time zone",
        tamanho: null,
        precisao: null,
        escala: null,
        nullable: "YES",
      },
      {
        nome: null,
        tipo_postgres: null,
        tamanho: null,
        precisao: null,
        escala: null,
        nullable: null,
      },
      {
        nome: "geometria",
        tipo_postgres: "USER-DEFINED",
        tamanho: null,
        precisao: null,
        escala: null,
        nullable: "NO",
      },
    ]);

    await expect(
      detectarEasyLocalCampos({ schema: "clinica", tabela: "atendimentos" })
    ).resolves.toEqual([
      {
        nome: "id_externo",
        tipoPostgres: "bigint",
        tipoSugerido: "bigint",
        obrigatorio: true,
      },
      {
        nome: "valor",
        tipoPostgres: "numeric",
        tipoSugerido: "decimal",
        tamanho: 20,
        escala: 4,
        obrigatorio: false,
      },
      {
        nome: "observacao",
        tipoPostgres: "character varying",
        tipoSugerido: "text",
        obrigatorio: false,
      },
      {
        nome: "nascimento",
        tipoPostgres: "date",
        tipoSugerido: "date",
        obrigatorio: false,
      },
      {
        nome: "ocorrido_em",
        tipoPostgres: "timestamp with time zone",
        tipoSugerido: null,
        obrigatorio: false,
      },
      { nome: "", tipoPostgres: "", tipoSugerido: null, obrigatorio: false },
      {
        nome: "geometria",
        tipoPostgres: "USER-DEFINED",
        tipoSugerido: null,
        obrigatorio: true,
      },
    ]);
  });

  it("não aguarda indefinidamente no cleanup: destrói o socket após 1,5 s", async () => {
    const destroy = vi.fn();
    pgMock.Client.mockImplementationOnce(() => ({
      connect: pgMock.connect,
      query: pgMock.query,
      end: () => new Promise<void>(() => {}),
      connection: { stream: { destroy } },
    }));
    vi.useFakeTimers();

    const listing = listarEasyLocalOrigens();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(listing).resolves.toEqual([]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("sanitiza falhas do driver sem refletir segredo ou erro bruto", async () => {
    pgMock.connect.mockRejectedValueOnce(
      new Error(`${env.EASYLOCAL_PG_PASSWORD} host recusado`)
    );

    const error = await listarEasyLocalOrigens().catch(
      (reason: unknown) => reason as Error
    );
    expect(error.message).toBe(
      "Não foi possível consultar o catálogo EASYLocal."
    );
    expect(error.message).not.toContain(env.EASYLOCAL_PG_PASSWORD);
  });
});
