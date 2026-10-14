vi.mock("./easyLocalCadastroStore", () => ({
  resolverEasyLocalConfig: vi.fn(),
}));
import { resolverEasyLocalConfig } from "./easyLocalCadastroStore";

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  Client: vi.fn(),
}));
vi.mock("pg", () => ({ default: { Client: pgMock.Client } }));

import {
  readEasyLocalConfig,
  testarConexaoComConfig,
  testarConexaoEasyLocal,
} from "./easyLocalConnection";

const env = {
  EASYLOCAL_PG_HOST: "easylocal.example.org",
  EASYLOCAL_PG_PORT: "5432",
  EASYLOCAL_PG_DATABASE: "easylocal",
  EASYLOCAL_PG_USER: "safatle_readonly",
  EASYLOCAL_PG_PASSWORD: "segredo-de-teste",
  EASYLOCAL_PG_CA_CERT:
    "-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----",
};
const originalEnv: Record<string, string | undefined> = {};

describe("EASYLocal: conexão mínima e protegida", () => {
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
    pgMock.query.mockImplementation(async (query: string) =>
      query === "SELECT 1 AS conectividade"
        ? { rows: [{ conectividade: 1 }] }
        : { rows: [] }
    );
    pgMock.connect.mockResolvedValue(undefined);
    pgMock.end.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(env)) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("falha fechado sem configuração completa, DNS ou CA", async () => {
    for (const [key, invalid] of [
      ["EASYLOCAL_PG_CA_CERT", ""],
      ["EASYLOCAL_PG_CA_CERT", "certificado-invalido"],
      ["EASYLOCAL_PG_HOST", "127.0.0.1"],
      ["EASYLOCAL_PG_PORT", "0"],
      ["EASYLOCAL_PG_PASSWORD", ""],
    ]) {
      const old = process.env[key];
      process.env[key] = invalid;
      expect(readEasyLocalConfig()).toBeNull();
      expect(await testarConexaoEasyLocal()).toEqual({
        status: "configuracao_pendente",
      });
      process.env[key] = old;
    }
    expect(pgMock.Client).not.toHaveBeenCalled();
  });

  it("verifica CA e hostname, testa em READ ONLY e fecha a conexão", async () => {
    expect(await testarConexaoEasyLocal()).toEqual({ status: "conectado" });
    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        host: env.EASYLOCAL_PG_HOST,
        ssl: {
          ca: env.EASYLOCAL_PG_CA_CERT,
          rejectUnauthorized: true,
          servername: env.EASYLOCAL_PG_HOST,
        },
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      })
    );
    expect(pgMock.query.mock.calls.map(([query]) => query)).toEqual([
      "BEGIN READ ONLY",
      "SELECT 1 AS conectividade",
      "ROLLBACK",
    ]);
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("aceita credencial administrativa sem consultar catálogo de privilégios ou emitir escrita", async () => {
    expect(
      await testarConexaoComConfig({
        host: "admin.easylocal.example.org",
        port: 5432,
        database: "easylocal",
        user: "postgres_admin",
        password: "segredo-administrativo-de-teste",
      })
    ).toEqual({ status: "conectado" });

    const statements = pgMock.query.mock.calls.map(([query]) => String(query));
    expect(statements).toEqual([
      "BEGIN READ ONLY",
      "SELECT 1 AS conectividade",
      "ROLLBACK",
    ]);
    expect(statements.join("\n")).not.toMatch(
      /pg_catalog\.pg_roles|pg_auth|GRANT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE/i
    );
    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "postgres_admin",
        ssl: {
          rejectUnauthorized: true,
          servername: "admin.easylocal.example.org",
        },
      })
    );
  });

  it("usa a CA pública do sistema somente quando SYSTEM é configurado explicitamente", async () => {
    process.env.EASYLOCAL_PG_CA_CERT = "SYSTEM";
    expect(await testarConexaoEasyLocal()).toEqual({ status: "conectado" });
    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: true, servername: env.EASYLOCAL_PG_HOST },
      })
    );
    expect(pgMock.query.mock.calls.map(([query]) => query)).toEqual([
      "BEGIN READ ONLY",
      "SELECT 1 AS conectividade",
      "ROLLBACK",
    ]);
  });

  it("não propaga erro bruto que contenha segredo, nem resultado de linhas", async () => {
    pgMock.query.mockRejectedValueOnce(
      new Error("segredo-de-teste pg connection")
    );
    expect(await testarConexaoEasyLocal()).toEqual({ status: "falha_conexao" });
    expect(pgMock.end).toHaveBeenCalledOnce();
    pgMock.connect.mockRejectedValueOnce(new Error("segredo-de-teste refused"));
    expect(await testarConexaoEasyLocal()).toEqual({ status: "falha_conexao" });
    expect(pgMock.end).toHaveBeenCalledTimes(2);
  });

  it("usa a configuração persistida em vez da ENV e bloqueia falha de resolução", async () => {
    vi.mocked(resolverEasyLocalConfig).mockResolvedValueOnce({
      host: "cadastro.example.org",
      port: 5432,
      database: "outro",
      user: "leitor",
      password: "ficticio",
    });
    expect(await testarConexaoEasyLocal()).toEqual({ status: "conectado" });
    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "cadastro.example.org",
        password: "ficticio",
        ssl: { rejectUnauthorized: true, servername: "cadastro.example.org" },
      })
    );
    pgMock.Client.mockClear();
    vi.mocked(resolverEasyLocalConfig).mockRejectedValueOnce(
      new Error("falha-privada")
    );
    expect(await testarConexaoEasyLocal()).toEqual({ status: "falha_conexao" });
    expect(pgMock.Client).not.toHaveBeenCalled();
  });
  it("encerra a espera e destrói o socket se end não resolver", async () => {
    const destroy = vi.fn();
    pgMock.Client.mockImplementationOnce(() => ({
      connect: pgMock.connect,
      query: pgMock.query,
      end: () => new Promise<void>(() => {}),
      connection: { stream: { destroy } },
    }));
    vi.useFakeTimers();
    const testing = testarConexaoEasyLocal();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(testing).resolves.toEqual({ status: "conectado" });
    expect(destroy).toHaveBeenCalledOnce();
  });
});
