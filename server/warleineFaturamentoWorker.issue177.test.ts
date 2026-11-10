import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getRawPool: vi.fn() }));
vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./warleineFaturamentoImportService", () => ({ importWarleineFaturamentoFile: vi.fn() }));
vi.mock("./warleineFileVault", () => ({ decryptWarleineFile: vi.fn() }));
vi.mock("./warleineUploadChunks", () => ({ downloadWarleineChunkFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), readFile: vi.fn(), stat: vi.fn(), unlink: vi.fn(), writeFile: vi.fn() }));

import { getRawPool } from "./db";
import { storageGet } from "./storage";
import { importWarleineFaturamentoFile } from "./warleineFaturamentoImportService";
import { decryptWarleineFile } from "./warleineFileVault";
import { downloadWarleineChunkFile } from "./warleineUploadChunks";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import {
  claimWarleineJobByScope,
  downloadJobFile,
  getWarleineImportJobStatus,
  processNextGlobalWarleineImportJob,
  processNextWarleineImportJob,
  processWarleineImportJob,
} from "./warleineFaturamentoWorker";

const scope = { loteId: 700001, estabelecimentoId: 700011 };
const candidate = { id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, configId: null, arquivoNome: "SYNTHETIC.csv", arquivoStorageKey: "synthetic-key", criadoPor: 700021 };
const imported = { loteId: scope.loteId, status: "publicado", phase: "completed", publishedRows: 1 };

describe("Issue 177 worker — scoped immediate command and fail-closed status", () => {
  const connection = { beginTransaction: vi.fn(), query: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const pool = { getConnection: vi.fn(async () => connection), query: vi.fn(), execute: vi.fn() };
  let log: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    pool.getConnection.mockResolvedValue(connection);
    vi.mocked(getRawPool).mockResolvedValue(pool as any);
    connection.beginTransaction.mockResolvedValue(undefined);
    connection.commit.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(unlink).mockResolvedValue(undefined);
    connection.query.mockResolvedValue([[candidate]]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }]);
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: "publicado" }]]);
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    vi.mocked(stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(readFile).mockResolvedValue(Buffer.from("encrypted"));
    vi.mocked(decryptWarleineFile).mockReturnValue(Buffer.from("synthetic decrypted"));
    vi.mocked(storageGet).mockResolvedValue({ url: "https://synthetic.invalid/file" } as any);
    vi.mocked(importWarleineFaturamentoFile).mockResolvedValue(imported as any);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("encrypted"))));
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("claims only lot + establishment with parameterized SELECT and UPDATE", async () => {
    const claimed = await claimWarleineJobByScope(scope);
    expect(connection.query.mock.calls[0][0]).toContain("AND id=? AND estabelecimentoId=?");
    expect(connection.query.mock.calls[0][1]).toEqual([scope.loteId, scope.estabelecimentoId]);
    expect(connection.execute.mock.calls[0][0]).toContain("WHERE id=? AND estabelecimentoId=?");
    expect(connection.query.mock.calls[0][0]).toContain("AND origem!='upload-controle'");
    expect(connection.query.mock.calls[0][0]).toContain("AND arquivoStorageKey NOT LIKE 'warleine-upload:v1:%'");
    expect(connection.execute.mock.calls[0][1].slice(-2)).toEqual([scope.loteId, scope.estabelecimentoId]);
    expect(claimed).toMatchObject(candidate);
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("rejects a candidate outside the requested scope before mutation", async () => {
    connection.query.mockResolvedValue([[{ ...candidate, estabelecimentoId: 700099 }]]);
    await expect(claimWarleineJobByScope(scope)).rejects.toThrow("fora do escopo");
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("rejects invalid IDs without querying a pool", async () => {
    await expect(claimWarleineJobByScope({ loteId: 0, estabelecimentoId: scope.estabelecimentoId })).rejects.toThrow("inválido");
    expect(getRawPool).not.toHaveBeenCalled();
  });

  it("does not import when scoped claim is absent or occupied", async () => {
    connection.query.mockResolvedValue([[]]);
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: "reservado" }]]);
    expect(await processWarleineImportJob(scope)).toEqual({ ...scope, outcome: "not_claimed", durableStatus: "reservado", published: false });
    expect(importWarleineFaturamentoFile).not.toHaveBeenCalled();
  });

  it("does not import when conditional claim UPDATE lost the race", async () => {
    connection.execute.mockResolvedValue([{ affectedRows: 0 }]);
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: "processando" }]]);
    expect((await processWarleineImportJob(scope)).published).toBe(false);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(importWarleineFaturamentoFile).not.toHaveBeenCalled();
  });

  it("confirms an already-published lot via scoped durable state only", async () => {
    connection.query.mockResolvedValue([[]]);
    expect(await processWarleineImportJob(scope)).toEqual({ ...scope, outcome: "published", durableStatus: "publicado", published: true });
    expect(importWarleineFaturamentoFile).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[0][1]).toEqual([scope.loteId, scope.estabelecimentoId]);
  });

  it("passes lot scope, claim and deadline, confirms publish status and cleans temporary file", async () => {
    const before = Date.now();
    expect(await processWarleineImportJob(scope)).toEqual({ ...scope, outcome: "published", durableStatus: "publicado", published: true });
    const options = vi.mocked(importWarleineFaturamentoFile).mock.calls[0][0] as any;
    expect(options).toMatchObject({ loteId: scope.loteId, estabelecimentoId: scope.estabelecimentoId, publish: true, replaceCompetencies: true });
    expect(options.claimToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(options.deadlineAtMs).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(options.deadlineAtMs).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    expect(writeFile).toHaveBeenCalledWith(options.filePath, expect.any(Buffer), { mode: 0o600, flag: "wx" });
    expect(unlink).toHaveBeenCalledWith(options.filePath);
  });

  it.each([
    ["validado", "validado"],
    ["publicado", "validado"],
    ["validado", "publicado"],
    [undefined, "publicado"],
  ])("phase completed is not publication: import status=%s durable=%s", async (importStatus, durableStatus) => {
    vi.mocked(importWarleineFaturamentoFile).mockResolvedValue({ ...imported, status: importStatus } as any);
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: durableStatus }]]);
    const result = await processWarleineImportJob(scope);
    expect(result).toMatchObject({ outcome: "not_published", durableStatus, published: false });
    expect(unlink).toHaveBeenCalledOnce();
  });

  it("rejects mismatched result lot and sanitizes SQL/clinical/path errors", async () => {
    vi.mocked(importWarleineFaturamentoFile).mockResolvedValue({ ...imported, loteId: 700099 } as any);
    expect((await processWarleineImportJob(scope)).outcome).toBe("error");
    const errorWrite = pool.execute.mock.calls[0];
    expect(errorWrite[1]).toEqual(["WARLEINE_JOB_FAILED", scope.loteId, scope.estabelecimentoId, expect.any(String)]);
    expect(errorWrite[0]).toContain("AND claimToken=? AND leaseExpiresAt>NOW()");
    expect(unlink).toHaveBeenCalledOnce();
  });

  it("returns sanitized failure even when error-state persistence fails", async () => {
    vi.mocked(importWarleineFaturamentoFile).mockRejectedValue(new Error("SELECT clinical_secret FROM x /tmp/clinical.pdf"));
    pool.execute.mockRejectedValue(new Error("SQL clinical_secret"));
    pool.query.mockRejectedValue(new Error("SQL clinical_secret"));
    const result = await processWarleineImportJob(scope);
    expect(result).toMatchObject({ outcome: "error", published: false, durableStatus: null, errorCode: "WARLEINE_JOB_FAILED" });
    expect(JSON.stringify([result, errorLog.mock.calls, log.mock.calls, pool.execute.mock.calls])).not.toContain("clinical_secret");
    expect(unlink).toHaveBeenCalledOnce();
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: "publicado" }]]);
    vi.mocked(importWarleineFaturamentoFile).mockResolvedValue(imported as any);
    expect((await processWarleineImportJob(scope)).published).toBe(true);
  });

  it("returns busy for requested lot while another job runs, never makes another claim", async () => {
    let release!: (value: any) => void;
    vi.mocked(importWarleineFaturamentoFile).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const pending = processWarleineImportJob(scope);
    await vi.waitFor(() => expect(importWarleineFaturamentoFile).toHaveBeenCalledOnce());
    pool.query.mockResolvedValue([[{ id: 700002, estabelecimentoId: 700012, status: "enfileirado" }]]);
    const busy = await processWarleineImportJob({ loteId: 700002, estabelecimentoId: 700012 });
    expect(busy).toEqual({ loteId: 700002, estabelecimentoId: 700012, outcome: "busy", durableStatus: "enfileirado", published: false });
    expect(connection.query).toHaveBeenCalledOnce();
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: scope.estabelecimentoId, status: "publicado" }]]);
    release(imported);
    await pending;
  });

  it("retains global background semantics explicitly, without an immediate lot selector", async () => {
    expect(await processNextGlobalWarleineImportJob()).toBe(true);
    expect(connection.query.mock.calls[0][1]).toEqual([]);
    expect(connection.query.mock.calls[0][0]).not.toContain("AND id=? AND estabelecimentoId=?");
    expect(connection.query.mock.calls[0][0]).toContain("AND origem!='upload-controle'");
    expect(connection.query.mock.calls[0][0]).toContain("AND arquivoStorageKey NOT LIKE 'warleine-upload:v1:%'");
  });

  it("compatible immediate overload scopes claim and returns structured durable result", async () => {
    expect(await processNextWarleineImportJob(scope)).toEqual({ ...scope, outcome: "published", durableStatus: "publicado", published: true });
    expect(connection.query.mock.calls[0][1]).toEqual([scope.loteId, scope.estabelecimentoId]);
  });

  it("compatible legacy no-argument call retains background boolean semantics", async () => {
    expect(await processNextWarleineImportJob()).toBe(true);
    expect(connection.query.mock.calls[0][1]).toEqual([]);
  });

  it("fails closed if durable SELECT returns another establishment", async () => {
    pool.query.mockResolvedValue([[{ id: scope.loteId, estabelecimentoId: 700099, status: "publicado" }]]);
    await expect(getWarleineImportJobStatus(scope)).rejects.toThrow("fora do escopo");
  });

  it.each([false, true])("production rejects local source regardless of opt-in=%s or storage configuration", async (allowLocalSource) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    await expect(downloadJobFile("local:/synthetic/source.bin", "/synthetic/target.csv", scope, Date.now() + 10_000, { allowLocalSource })).rejects.toThrow("não permitida");
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
  });

  it("requires explicit local opt-in outside production and permits opted-in synthetic source", async () => {
    await expect(downloadJobFile("local:/synthetic/source.bin", "/synthetic/target.csv", scope, Date.now() + 10_000)).rejects.toThrow("não permitida");
    await downloadJobFile("local:/synthetic/source.bin", "/synthetic/target.csv", scope, Date.now() + 10_000, { allowLocalSource: true });
    expect(readFile).toHaveBeenCalledWith("/synthetic/source.bin");
  });

  it("rejects oversized encrypted local file before reading it", async () => {
    vi.mocked(stat).mockResolvedValue({ size: 301 * 1024 * 1024 } as any);
    await expect(downloadJobFile("local:/synthetic/source.bin", "/synthetic/target.csv", scope, Date.now() + 10_000, { allowLocalSource: true })).rejects.toThrow("limite");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects oversized content-length and cancels the remote body before decryption", async () => {
    const cancel = vi.fn(async () => undefined);
    vi.mocked(fetch).mockResolvedValue({ ok: true, headers: new Headers({ "content-length": String(301 * 1024 * 1024) }), body: { cancel } } as any);
    await expect(downloadJobFile("synthetic-key", "/synthetic/target.csv", scope, Date.now() + 10_000)).rejects.toThrow("limite");
    expect(cancel).toHaveBeenCalledOnce();
    expect(decryptWarleineFile).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeDefined();
  });

  it("bounds streamed bytes even without content-length and cancels reader", async () => {
    const value = { byteLength: 301 * 1024 * 1024 }; // No huge buffer allocated.
    const reader = { read: vi.fn(async () => ({ done: false, value })), cancel: vi.fn(async () => undefined), releaseLock: vi.fn() };
    vi.mocked(fetch).mockResolvedValue({ ok: true, headers: new Headers(), body: { getReader: () => reader } } as any);
    await expect(downloadJobFile("synthetic-key", "/synthetic/target.csv", scope, Date.now() + 10_000)).rejects.toThrow("limite");
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(decryptWarleineFile).not.toHaveBeenCalled();
  });

  it("fails before storage download when deadline is exhausted", async () => {
    await expect(downloadJobFile("synthetic-key", "/synthetic/target.csv", scope, Date.now() - 1)).rejects.toThrow("Prazo");
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("dispatches chunk prefix only to scoped adapter and enforces reconstructed size", async () => {
    const downloadChunks = vi.fn(async () => undefined);
    const deadlineAtMs = Date.now() + 10_000;
    await downloadJobFile("warleine-chunks:v1:synthetic", "/synthetic/target.csv", scope, deadlineAtMs, { downloadChunks });
    expect(downloadChunks).toHaveBeenCalledWith({ ...scope, storageKey: "warleine-chunks:v1:synthetic", localPath: "/synthetic/target.csv", deadlineAtMs });
    expect(storageGet).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    vi.mocked(stat).mockResolvedValue({ size: 301 * 1024 * 1024 } as any);
    await expect(downloadJobFile("warleine-chunks:v1:synthetic", "/synthetic/target.csv", scope, deadlineAtMs, { downloadChunks })).rejects.toThrow("limite");
  });

  it("uses sealed chunk helper with expected establishment and abort signal, never legacy storage", async () => {
    await downloadJobFile("warleine-chunks:v1:synthetic", "/synthetic/target.csv", scope, Date.now() + 10_000);
    expect(downloadWarleineChunkFile).toHaveBeenCalledWith("warleine-chunks:v1:synthetic", "/synthetic/target.csv", { estabelecimentoId: scope.estabelecimentoId }, expect.any(AbortSignal));
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("rejects upload controls without reading storage, chunks or filesystem", async () => {
    await expect(downloadJobFile("warleine-upload:v1:synthetic", "/synthetic/target.csv", scope, Date.now() + 10_000)).rejects.toThrow("não é fonte publicável");
    expect(storageGet).not.toHaveBeenCalled();
    expect(downloadWarleineChunkFile).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });
});
