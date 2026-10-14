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
      query.includes("pg_catalog.pg_roles")
        ? { rows: [{ privilegiada: false }] }
        : { rows: [{ conectividade: 1 }] }
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

  it("verifica CA, hostname e privilégios antes de SELECT 1 e fecha a conexão", async () => {
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
    expect(pgMock.query).toHaveBeenCalledTimes(2);
    expect(pgMock.query.mock.calls[0][0]).toContain("pg_catalog.pg_roles");
    expect(pgMock.query.mock.calls[0][0]).toContain("rolbypassrls");
    expect(pgMock.query.mock.calls[0][0]).toContain(
      "pg_has_role(session_user, r.oid, 'MEMBER')"
    );
    expect(pgMock.query.mock.calls[1][0]).toBe("SELECT 1 AS conectividade");
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("rejeita a role administrativa antes de SELECT 1 e nunca consulta tabelas de dados", async () => {
    pgMock.query.mockResolvedValueOnce({ rows: [{ privilegiada: true }] });
    expect(await testarConexaoEasyLocal()).toEqual({
      status: "credencial_privilegiada",
    });
    expect(pgMock.query).toHaveBeenCalledOnce();
    expect(pgMock.query.mock.calls[0][0]).toContain("pg_catalog.pg_roles");
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("rejeita privilégios administrativos assumíveis via associação aninhada", async () => {
    // O catálogo representa o resultado do EXISTS para qualquer caminho de MEMBER.
    pgMock.query.mockResolvedValueOnce({ rows: [{ privilegiada: true }] });
    expect(await testarConexaoEasyLocal()).toEqual({
      status: "credencial_privilegiada",
    });
    expect(pgMock.query.mock.calls[0][0]).toContain(
      "pg_has_role(session_user, r.oid, 'MEMBER')"
    );
    expect(pgMock.query).toHaveBeenCalledOnce();
  });

  it("falha fechado quando a consulta ao catálogo não identifica exatamente uma role", async () => {
    pgMock.query.mockResolvedValueOnce({ rows: [] });
    expect(await testarConexaoEasyLocal()).toEqual({ status: "falha_conexao" });
    expect(pgMock.query).toHaveBeenCalledOnce();
  });

  it("usa a CA pública do sistema somente quando SYSTEM é configurado explicitamente", async () => {
    process.env.EASYLOCAL_PG_CA_CERT = "SYSTEM";
    expect(await testarConexaoEasyLocal()).toEqual({ status: "conectado" });
    expect(pgMock.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: true, servername: env.EASYLOCAL_PG_HOST },
      })
    );
    expect(pgMock.query).toHaveBeenCalledWith("SELECT 1 AS conectividade");
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
