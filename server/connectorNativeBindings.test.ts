import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  const mysqlQuery = vi.fn();
  const mysqlEnd = vi.fn();
  const mysqlRollback = vi.fn();
  const mysqlDestroy = vi.fn();
  const createConnection = vi.fn();
  const input = vi.fn();
  const sqlQuery = vi.fn();
  const connect = vi.fn();
  const close = vi.fn();
  const request = vi.fn();
  const connectionPool = vi.fn();
  const oracleExecute = vi.fn();
  const oracleRollback = vi.fn();
  const oracleClose = vi.fn();
  const pgQuery = vi.fn();
  const pgRelease = vi.fn();
  const pgConnect = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return { execute, mysqlQuery, mysqlEnd, mysqlRollback, mysqlDestroy, createConnection, input, sqlQuery, connect, close, request, connectionPool, oracleExecute, oracleRollback, oracleClose, pgQuery, pgRelease, pgConnect, logger };
});

vi.mock("mysql2/promise", () => ({ default: { createConnection: mocks.createConnection } }));
vi.mock("mssql", () => ({ default: {
  ConnectionPool: mocks.connectionPool,
  Float: "Float", Bit: "Bit", DateTime2: "DateTime2", MAX: "MAX",
  NVarChar: (size: unknown) => ({ kind: "NVarChar", size }),
  VarBinary: (size: unknown) => ({ kind: "VarBinary", size }),
} }));
vi.mock("oracledb", () => ({ default: { OUT_FORMAT_OBJECT: "OBJECT" } }));
vi.mock("pg", () => ({ default: { Pool: vi.fn() } }));
vi.mock("./_core/logger", () => ({ logger: mocks.logger }));

import { MysqlConnector } from "./connectors/MysqlConnector";
import { SqlServerConnector } from "./connectors/SqlServerConnector";
import { OracleConnector } from "./connectors/OracleConnector";
import { EasyVisionConnector } from "./connectors/EasyVisionConnector";

const config = { host: "example.invalid", port: 1, database: "synthetic", user: "synthetic", password: "synthetic-not-a-secret" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([[{ ok: 1 }], []]);
  mocks.mysqlQuery.mockResolvedValue([[{ ok: 1 }], []]);
  mocks.mysqlEnd.mockResolvedValue(undefined);
  mocks.mysqlRollback.mockResolvedValue(undefined);
  mocks.createConnection.mockResolvedValue({ execute: mocks.execute, query: mocks.mysqlQuery, end: mocks.mysqlEnd, rollback: mocks.mysqlRollback, destroy: mocks.mysqlDestroy });
  mocks.input.mockReturnThis();
  mocks.sqlQuery.mockResolvedValue({ recordset: [{ ok: 1 }] });
  mocks.connect.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.request.mockReturnValue({ input: mocks.input, query: mocks.sqlQuery });
  mocks.connectionPool.mockImplementation(() => ({ connect: mocks.connect, close: mocks.close, request: mocks.request }));
  mocks.oracleExecute.mockResolvedValue({ rows: [{ ok: 1 }] });
  mocks.oracleRollback.mockResolvedValue(undefined);
  mocks.oracleClose.mockResolvedValue(undefined);
  mocks.pgQuery.mockResolvedValue({ rows: [{ ok: 1 }] });
  mocks.pgConnect.mockResolvedValue({ query: mocks.pgQuery, release: mocks.pgRelease });
});

async function connector(kind: "mysql" | "sqlserver") {
  const instance = kind === "mysql" ? new MysqlConnector(config) : new SqlServerConnector(config);
  expect(await instance.conectar()).toBe(true); // mock factory ONLY
  return instance;
}

describe("real connectors / mocked native driver transports", () => {
  it.each(["mysql", "sqlserver"] as const)("%s sends special strings as data, never SQL", async kind => {
    const instance = await connector(kind);
    const values = ["$' OR 1=1 -- ", "$`", "$&", "$$", "$2", "O'Reilly", "back\\slash", "Unicode ã 日本語", null, 42, false];
    const query = "SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $1";
    expect(await instance.executarQuery(query, values)).toEqual([{ ok: 1 }]);
    if (kind === "mysql") {
      expect(mocks.execute).toHaveBeenCalledOnce();
      expect(mocks.execute).toHaveBeenCalledWith("SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?", [...values, values[0]]);
      expect(mocks.mysqlQuery).not.toHaveBeenCalled();
    } else {
      expect(mocks.sqlQuery).toHaveBeenCalledOnce();
      expect(mocks.sqlQuery).toHaveBeenCalledWith("SELECT @safatle_p1, @safatle_p2, @safatle_p3, @safatle_p4, @safatle_p5, @safatle_p6, @safatle_p7, @safatle_p8, @safatle_p9, @safatle_p10, @safatle_p11, @safatle_p1");
      expect(mocks.input).toHaveBeenCalledTimes(values.length);
      values.forEach((value, index) => expect(mocks.input.mock.calls[index][0]).toBe(`safatle_p${index + 1}`));
      expect(mocks.input.mock.calls.map(call => call[2])).toEqual(values);
      expect(mocks.input.mock.calls[0][1]).toEqual({ kind: "NVarChar", size: "MAX" });
      expect(mocks.input.mock.calls[9][1]).toBe("Float");
      expect(mocks.input.mock.calls[10][1]).toBe("Bit");
    }
    expect(JSON.stringify(mocks.logger.info.mock.calls)).not.toContain(values[0]);
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s supports null/numbers/date/binary without string conversion", async kind => {
    const instance = await connector(kind);
    const date = new Date("2026-01-01T12:34:56.789Z");
    const binary = Buffer.from("synthetic");
    const values = [null, 3.14, 2147483648, date, binary];
    await instance.executarQuery("SELECT $1, $2, $3, $4, $5", values);
    if (kind === "mysql") expect(mocks.execute.mock.calls[0][1]).toEqual(values);
    else {
      expect(mocks.input.mock.calls.map(call => call[2])).toEqual(values);
      expect(mocks.input.mock.calls.map(call => call[1])).toEqual([
        { kind: "NVarChar", size: "MAX" }, "Float", "Float", "DateTime2", { kind: "VarBinary", size: "MAX" },
      ]);
    }
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s retains literals/comments and binds real occurrences only", async kind => {
    const instance = await connector(kind);
    const query = "SELECT '$1' AS literal, $1 AS actual /* $2 */ -- $3\n";
    await instance.executarQuery(query, ["$2"]);
    const expected = kind === "mysql" ? "SELECT '$1' AS literal, ? AS actual /* $2 */ -- $3\n" : "SELECT '$1' AS literal, @safatle_p1 AS actual /* $2 */ -- $3\n";
    expect((kind === "mysql" ? mocks.execute : mocks.sqlQuery).mock.calls[0][0]).toBe(expected);
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s preserves legacy execution without params", async kind => {
    const instance = await connector(kind);
    expect(await instance.executarQuery("SELECT 1 AS ok")).toEqual([{ ok: 1 }]);
    if (kind === "mysql") {
      expect(mocks.mysqlQuery).toHaveBeenCalledOnce();
      expect(mocks.mysqlQuery).toHaveBeenCalledWith("SELECT 1 AS ok");
      expect(mocks.execute).not.toHaveBeenCalled();
    } else {
      expect(mocks.sqlQuery).toHaveBeenCalledOnce();
      expect(mocks.sqlQuery).toHaveBeenCalledWith("SELECT 1 AS ok");
      expect(mocks.input).not.toHaveBeenCalled();
    }
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s rejects invalid params before any request/execute/query", async kind => {
    const instance = await connector(kind);
    for (const [query, values] of [
      ["SELECT $1", []], ["SELECT $1", [undefined]], ["SELECT $1", [1, 2]],
      ["SELECT $1", [{}]], ["SELECT $1", [NaN]], ["SELECT $3", [1, 2, 3]],
      ["SELECT $1, ?", [1, 2]], ["SELECT '$1'", [1]], ["SELECT 1 /* $1 */", [1]],
    ] as [string, unknown[]][]) {
      await expect(instance.executarQuery(query, values)).rejects.toThrow("Parâmetros SQL inválidos");
    }
    await expect(instance.executarQuery("SELECT $1")).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.mysqlQuery).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.sqlQuery).not.toHaveBeenCalled();
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s does not log/throw raw driver SQL, data or secrets", async kind => {
    const instance = await connector(kind);
    const secret = "synthetic-sensitive-driver-error-with-SQL-and-password";
    (kind === "mysql" ? mocks.execute : mocks.sqlQuery).mockRejectedValueOnce(new Error(secret));
    await expect(instance.executarQuery("SELECT $1", [secret])).rejects.toThrow("Falha ao executar consulta");
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(mocks.logger.info.mock.calls)).not.toContain(config.password);
    await instance.desconectar();
  });

  it("MySQL retains CA but forces TLS certificate validation and single statements", async () => {
    const instance = new MysqlConnector({ ...config, ssl: { ca: "synthetic-CA", rejectUnauthorized: false } });
    expect(await instance.conectar()).toBe(true);
    expect(mocks.createConnection.mock.calls[0][0]).toMatchObject({ ssl: { ca: "synthetic-CA", rejectUnauthorized: true }, multipleStatements: false });
    await instance.desconectar();
  });

  it("MySQL boolean TLS config verifies certificates", async () => {
    const instance = new MysqlConnector({ ...config, ssl: true });
    expect(await instance.conectar()).toBe(true);
    expect(mocks.createConnection.mock.calls[0][0].ssl).toEqual({ rejectUnauthorized: true });
    await instance.desconectar();
  });

  it("SQL Server does not trust arbitrary server certificates", async () => {
    const instance = new SqlServerConnector({ ...config, ssl: true });
    expect(await instance.conectar()).toBe(true);
    expect(mocks.connectionPool.mock.calls[0][0].options).toMatchObject({ encrypt: true, trustServerCertificate: false });
    await instance.desconectar();
  });

  it.each(["mysql", "sqlserver"] as const)("%s connection errors are sanitized", async kind => {
    const secret = "synthetic-password-in-driver-error";
    (kind === "mysql" ? mocks.createConnection : mocks.connect).mockRejectedValueOnce(new Error(secret));
    const instance = kind === "mysql" ? new MysqlConnector(config) : new SqlServerConnector(config);
    expect(await instance.conectar()).toBe(false);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(config.password);
  });

  it("SQL Server test helper closes the pool on query failure and returns a safe message", async () => {
    const instance = new SqlServerConnector(config);
    mocks.sqlQuery.mockRejectedValueOnce(new Error("synthetic-driver-SQL-secret"));
    const result = await instance.testarConexaoEQuery("SELECT 1");
    expect(result.sucesso).toBe(false);
    expect(result.mensagem).not.toContain("synthetic-driver-SQL-secret");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(["mysql", "sqlserver"] as const)("%s refuses query while disconnected", async kind => {
    const instance = kind === "mysql" ? new MysqlConnector(config) : new SqlServerConnector(config);
    await expect(instance.executarQuery("SELECT 1")).rejects.toThrow("Conexão não estabelecida");
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(mocks.connectionPool).not.toHaveBeenCalled();
  });
});

async function readOnlyConnector(kind: "mysql" | "sqlserver" | "oracle" | "postgres") {
  if (kind === "mysql" || kind === "sqlserver") return connector(kind);
  if (kind === "oracle") {
    const instance = new OracleConnector(config);
    (instance as any).connection = { execute: mocks.oracleExecute, rollback: mocks.oracleRollback, close: mocks.oracleClose };
    return instance;
  }
  const instance = new EasyVisionConnector(config);
  (instance as any).pool = { connect: mocks.pgConnect };
  return instance;
}

describe("account-only read methods / no real drivers or network", () => {
  it.each(["mysql", "sqlserver", "oracle", "postgres"] as const)("%s validates and binds before reading", async kind => {
    const instance = await readOnlyConnector(kind);
    const value = "$' OR 1=1 -- ";
    const rows = await instance.executarQuerySomenteLeitura("SELECT * FROM contas WHERE numconta = $1 OR parent = $1;", [value]);
    expect(rows).toEqual([{ ok: 1 }]);
    if (kind === "mysql") {
      expect(mocks.mysqlQuery).toHaveBeenCalledWith("START TRANSACTION READ ONLY");
      expect(mocks.execute).toHaveBeenCalledWith("SELECT * FROM contas WHERE numconta = ? OR parent = ?;", [value, value]);
      expect(mocks.mysqlRollback).toHaveBeenCalledOnce();
    } else if (kind === "sqlserver") {
      expect(mocks.sqlQuery).toHaveBeenCalledWith("SELECT * FROM contas WHERE numconta = @safatle_p1 OR parent = @safatle_p1;");
      expect(mocks.input.mock.calls.map(call => call[2])).toEqual([value]);
    } else if (kind === "oracle") {
      expect(mocks.oracleExecute.mock.calls[0]).toEqual(["SET TRANSACTION READ ONLY"]);
      expect(mocks.oracleExecute.mock.calls[1]).toEqual([
        "SELECT * FROM contas WHERE numconta = :safatle_p1 OR parent = :safatle_p1",
        { safatle_p1: value }, { autoCommit: false, outFormat: "OBJECT" },
      ]);
      expect(mocks.oracleRollback).toHaveBeenCalledOnce();
    } else {
      expect(mocks.pgQuery.mock.calls).toEqual([
        ["BEGIN READ ONLY"], ["SET LOCAL statement_timeout = 300000"],
        ["SELECT * FROM contas WHERE numconta = $1 OR parent = $1;", [value]], ["ROLLBACK"],
      ]);
      expect(mocks.pgRelease).toHaveBeenCalledWith(false);
    }
  });

  it.each(["mysql", "sqlserver", "oracle", "postgres"] as const)("%s rejects unsafe SQL without reaching driver", async kind => {
    const instance = await readOnlyConnector(kind);
    for (const query of ["UPDATE contas SET numconta = $1", "SELECT '$1'", "SELECT dangerous_udf($1)", "SELECT $1; DELETE FROM contas"]) {
      await expect(instance.executarQuerySomenteLeitura(query, ["synthetic"])).rejects.toThrow();
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.mysqlQuery).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.oracleExecute).not.toHaveBeenCalled();
    expect(mocks.pgConnect).not.toHaveBeenCalled();
  });

  it.each(["mysql", "oracle", "postgres"] as const)("%s rolls back even after query failure and sanitizes errors", async kind => {
    const instance = await readOnlyConnector(kind);
    const error = new Error("synthetic-sensitive-SQL-driver-error");
    if (kind === "mysql") mocks.execute.mockRejectedValueOnce(error);
    else if (kind === "oracle") mocks.oracleExecute.mockResolvedValueOnce({}).mockRejectedValueOnce(error);
    else mocks.pgQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockRejectedValueOnce(error);
    await expect(instance.executarQuerySomenteLeitura("SELECT * FROM contas WHERE numconta = $1", ["synthetic"])).rejects.toThrow("Falha ao executar consulta");
    if (kind === "mysql") expect(mocks.mysqlRollback).toHaveBeenCalledOnce();
    else if (kind === "oracle") expect(mocks.oracleRollback).toHaveBeenCalledOnce();
    else {
      expect(mocks.pgQuery).toHaveBeenLastCalledWith("ROLLBACK");
      expect(mocks.pgRelease).toHaveBeenCalledOnce();
    }
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(error.message);
  });

  it.each(["mysql", "oracle", "postgres"] as const)("%s rejects unsupported READ ONLY setup, no fallback", async kind => {
    const instance = await readOnlyConnector(kind);
    if (kind === "mysql") mocks.mysqlQuery.mockRejectedValueOnce(new Error("synthetic-unsupported"));
    else if (kind === "oracle") mocks.oracleExecute.mockRejectedValueOnce(new Error("synthetic-unsupported"));
    else mocks.pgQuery.mockRejectedValueOnce(new Error("synthetic-unsupported"));
    await expect(instance.executarQuerySomenteLeitura("SELECT $1", ["synthetic"])).rejects.toThrow("Falha ao executar consulta");
    if (kind === "mysql") expect(mocks.execute).not.toHaveBeenCalled();
    else if (kind === "oracle") expect(mocks.oracleExecute).toHaveBeenCalledOnce();
    else expect(mocks.pgQuery.mock.calls).toEqual([["BEGIN READ ONLY"], ["ROLLBACK"]]);
  });

  it.each(["mysql", "oracle", "postgres"] as const)("%s rollback failure discards connection and never returns success", async kind => {
    const instance = await readOnlyConnector(kind);
    if (kind === "mysql") mocks.mysqlRollback.mockRejectedValueOnce(new Error("synthetic-rollback"));
    else if (kind === "oracle") mocks.oracleRollback.mockRejectedValueOnce(new Error("synthetic-rollback"));
    else mocks.pgQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("synthetic-rollback"));
    await expect(instance.executarQuerySomenteLeitura("SELECT $1", ["synthetic"])).rejects.toThrow("Falha ao encerrar consulta");
    if (kind === "mysql") {
      expect(mocks.mysqlDestroy).toHaveBeenCalledOnce();
      expect((instance as any).connection).toBeNull();
    } else if (kind === "oracle") {
      expect(mocks.oracleClose).toHaveBeenCalledOnce();
      expect((instance as any).connection).toBeNull();
    } else expect(mocks.pgRelease).toHaveBeenCalledWith(true);
  });

  it("PostgreSQL acquisition failure is sanitized", async () => {
    const instance = await readOnlyConnector("postgres");
    mocks.pgConnect.mockRejectedValueOnce(new Error("synthetic-connection-secret"));
    await expect(instance.executarQuerySomenteLeitura("SELECT $1", ["synthetic"])).rejects.toThrow("Falha ao executar consulta");
    expect(mocks.pgQuery).not.toHaveBeenCalled();
    expect(mocks.pgRelease).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain("synthetic-connection-secret");
  });
});
