import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getRawPool: vi.fn() }));
vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./warleineFaturamentoImportService", () => ({ importWarleineFaturamentoFile: vi.fn() }));
vi.mock("./warleineFileVault", () => ({ decryptWarleineFile: vi.fn() }));
vi.mock("./warleineUploadChunks", () => ({ downloadWarleineChunkFile: vi.fn() }));

import { getRawPool } from "./db";
import { claimNextWarleineJob } from "./warleineFaturamentoWorker";

describe("worker de faturamento Warleine", () => {
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = { getConnection: vi.fn(async () => connection) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRawPool).mockResolvedValue(pool as any);
  });

  it("reclama o próximo job dentro de uma transação e persiste token e lease", async () => {
    connection.query.mockResolvedValueOnce([[{
      id: 7,
      estabelecimentoId: 4,
      configId: null,
      arquivoNome: "arquivo.xlsx",
      arquivoStorageKey: "chave",
      criadoPor: 1,
    }]]);
    connection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const job = await claimNextWarleineJob();

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(connection.execute.mock.calls[0][0]).toContain("claimToken=?");
    expect(connection.execute.mock.calls[0][0]).toContain("leaseExpiresAt=DATE_ADD");
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(job).toMatchObject({ id: 7, estabelecimentoId: 4 });
    expect(job?.claimToken).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("encerra a transação sem claim quando não há job elegível", async () => {
    connection.query.mockResolvedValueOnce([[]]);
    const job = await claimNextWarleineJob();
    expect(job).toBeNull();
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
