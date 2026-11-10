import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { Router } from "express";
import { encryptWarleineFile, decryptWarleineFile } from "./warleineFileVault";
import {
  createWarleineUploadService, createWarleineUploadSqlRepository, createWarleineUploadCloudStorage,
  downloadWarleineChunkFileWithCloud, registerWarleineUploadRoutes,
  type WarleineUploadCloud, type WarleineUploadControl, type WarleineUploadDependencies,
  type WarleineUploadJob, type WarleineUploadManifest, type WarleineUploadRepository,
} from "./warleineUploadChunks";
import { WARLEINE_UPLOAD_CHUNK_BYTES as C, WARLEINE_UPLOAD_MAX_FILE_BYTES as MAX,
  WARLEINE_UPLOAD_BASE_PATH as BASE } from "../shared/warleineUploadProtocol";

const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const signal = () => new AbortController().signal;
const key1 = "00000000-0000-4000-8000-000000000001";
const input = (byteLength = 3, idempotencyKey = key1) => ({ estabelecimentoId: 7, filename: "synthetic.csv", byteLength, idempotencyKey, confirmarSubstituicao: true as const });
const cleanup: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const p of cleanup.splice(0)) await fs.rm(p, { recursive: true, force: true }); });
function fixture() {
  let nextId = 1, now = 1_000_000;
  const objects = new Map<string, Buffer>();
  const controls = new Map<number, WarleineUploadControl>();
  const jobs = new Map<string, WarleineUploadJob & { source: string; hosp: number }>();
  const calls = { puts: [] as number[], gets: [] as number[], conflicts: 0, publication: 0, concurrent: 0, maxConcurrent: 0 };
  const cloud: WarleineUploadCloud = {
    ready: vi.fn(),
    async put(key, bytes, s) { s.throwIfAborted(); expect(objects.has(key)).toBe(false); objects.set(key, Buffer.from(bytes)); calls.puts.push(bytes.length); },
    async get(key, max, s) {
      s.throwIfAborted(); calls.gets.push(max); calls.concurrent++; calls.maxConcurrent = Math.max(calls.maxConcurrent, calls.concurrent);
      await Promise.resolve(); calls.concurrent--;
      const value = objects.get(key); if (!value || value.length > max) throw Error("synthetic-cloud-failure");
      return Buffer.from(value);
    },
  };
  const copy = (row: WarleineUploadControl) => ({ ...row });
  const repository: WarleineUploadRepository = {
    async reserve(actor, i, pointer, s) {
      s.throwIfAborted();
      const hash = digest(`warleine-upload:${actor}:${i.estabelecimentoId}:${i.idempotencyKey.toLowerCase()}`);
      const old = [...controls.values()].find(c => c.estabelecimentoId === i.estabelecimentoId && c.arquivoHash === hash);
      if (old) { if (old.arquivoNome !== i.filename || old.arquivoTamanho !== i.byteLength) throw Error("synthetic-metadata-conflict"); return copy(old); }
      const row: WarleineUploadControl = { id: nextId++, criadoPor: actor, estabelecimentoId: i.estabelecimentoId, arquivoHash: hash,
        arquivoNome: i.filename, arquivoTamanho: i.byteLength, arquivoStorageKey: pointer, status: "recebendo" };
      controls.set(row.id, row); return copy(row);
    },
    async get(id, actor, hosp, s) { s.throwIfAborted(); const row = controls.get(id); if (!row || row.criadoPor !== actor || row.estabelecimentoId !== hosp) throw Error("synthetic-scope"); return copy(row); },
    async cas(row, pointer, state, s) {
      s.throwIfAborted(); if (calls.conflicts > 0) { calls.conflicts--; return false; }
      const actual = controls.get(row.id)!;
      if (actual.arquivoStorageKey !== row.arquivoStorageKey || actual.status !== row.status) return false;
      controls.set(row.id, { ...actual, arquivoStorageKey: pointer, status: state }); return true;
    },
    async publish(row, manifest, source, receipt, s, beforeCommit) {
      s.throwIfAborted(); const actual = controls.get(row.id)!;
      if (actual.arquivoStorageKey !== row.arquivoStorageKey || actual.status !== "finalizando") throw Error("synthetic-cas");
      const k = `${row.estabelecimentoId}:${manifest.fullSha256}`;
      const old = jobs.get(k);
      const job = old ? { ...old, created: false } : { loteId: nextId++, status: "enfileirado", created: true, source, hosp: row.estabelecimentoId };
      const pointer = await receipt(job); s.throwIfAborted();
      await beforeCommit?.(); s.throwIfAborted();
      if (!old) { jobs.set(k, job); calls.publication++; }
      controls.set(row.id, { ...actual, arquivoStorageKey: pointer, status: "enfileirado" }); return job;
    },
    async jobStatus(id, hosp, s) { s.throwIfAborted(); const j = [...jobs.values()].find(j => j.loteId === id && j.hosp === hosp); if (!j) throw Error("synthetic-missing-job"); return j.status; },
  };
  const deps: WarleineUploadDependencies = { cloud, repository, now: () => now,
    authenticate: vi.fn(async () => ({ id: 11, role: "user" })), authorize: vi.fn(async () => true), dispatch: vi.fn(async () => undefined) };
  const service = createWarleineUploadService(deps);
  async function uploaded(bytes = Buffer.from("abc"), idempotencyKey = key1) {
    const start = await service.start(11, input(bytes.length, idempotencyKey), signal());
    for (let index = 0; index < Math.ceil(bytes.length / C); index++) {
      const part = bytes.subarray(index * C, (index + 1) * C);
      await service.put(11, 7, start.sessionId, index, part, digest(part), signal());
    }
    return start.sessionId;
  }
  return { cloud, repository, deps, service, objects, controls, jobs, calls, uploaded, advance: (n: number) => { now += n; } };
}

describe("Warleine durable chunks protocol", () => {
  it("exports the exact gateway limits and creates metadata-only opaque controls", async () => {
    expect(BASE).toBe("/api/warleine/uploads"); expect(C).toBe(4 * 1024 * 1024); expect(MAX).toBe(300 * 1024 * 1024);
    const f = fixture(); const started = await f.service.start(11, input(), signal());
    expect(started).toEqual({ sessionId: expect.stringMatching(/^1\.[a-f0-9]{48}$/), chunkSize: C, maxFileBytes: MAX });
    expect(f.controls.size).toBe(1); const row = [...f.controls.values()][0];
    expect(row.status).toBe("recebendo"); expect(row.arquivoStorageKey).toMatch(/^warleine-upload:v1:warleine-upload-data\/v1\/[a-f0-9]{48}$/);
    expect(row.arquivoHash).toBe(digest(`warleine-upload:11:7:${key1}`));
    for (const encrypted of f.objects.values()) expect(encrypted.includes(Buffer.from("synthetic.csv"))).toBe(false);
    expect(f.jobs.size).toBe(0);
  });
  it("resumes the same actor/hospital/idempotency key across replicas", async () => {
    const f = fixture(); const a = await f.service.start(11, input(), signal());
    const replica = createWarleineUploadService(f.deps);
    expect(await replica.start(11, input(), signal())).toEqual(a);
    const other = await replica.start(12, input(), signal()); expect(other.sessionId).not.toBe(a.sessionId);
    expect(f.controls.size).toBe(2);
  });
  it("rejects changed metadata under the same idempotency key", async () => {
    const f = fixture(); await f.service.start(11, input(), signal());
    await expect(f.service.start(11, { ...input(), filename: "different.csv" }, signal())).rejects.toThrow();
    await expect(f.service.start(11, input(4), signal())).rejects.toThrow(); expect(f.controls.size).toBe(1);
  });
  it.each([0, -1, 1.5, MAX + 1, Infinity, NaN])("rejects invalid byteLength %s before reservation", async n => {
    const f = fixture(); await expect(f.service.start(11, input(n), signal())).rejects.toThrow(); expect(f.controls.size).toBe(0); expect(f.objects.size).toBe(0);
  });
  it.each(["../synthetic.csv", "synthetic.exe", "file\n.csv", "", "a".repeat(256) + ".csv"])("rejects invalid filenames", async filename => {
    const f = fixture(); await expect(f.service.start(11, { ...input(), filename }, signal())).rejects.toThrow(); expect(f.controls.size).toBe(0);
  });
  it("requires UUID and explicit replacement confirmation", async () => {
    const f = fixture(); await expect(f.service.start(11, { ...input(), idempotencyKey: "not-uuid" }, signal())).rejects.toThrow();
    await expect(f.service.start(11, { ...input(), confirmarSubstituicao: false } as any, signal())).rejects.toThrow();
  });
  it("fails closed before reserve when durable cloud or encryption is unavailable", async () => {
    const f = fixture(); vi.mocked(f.cloud.ready).mockImplementationOnce(() => { throw Error("synthetic-not-ready"); });
    await expect(f.service.start(11, input(), signal())).rejects.toThrow(); expect(f.controls.size).toBe(0);
    vi.stubEnv("WARLEINE_FILE_ENCRYPTION_KEY", ""); vi.stubEnv("JWT_SECRET", "");
    await expect(f.service.start(11, input(), signal())).rejects.toThrow(); expect(f.controls.size).toBe(0);
    vi.stubEnv("BUILT_IN_FORGE_API_URL", ""); vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    expect(() => createWarleineUploadCloudStorage().ready()).toThrow();
  });
  it("rejects cross-actor, cross-hospital and wrong-token access", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(), signal());
    await expect(f.service.status(12, 7, sessionId, signal())).rejects.toThrow();
    await expect(f.service.status(11, 8, sessionId, signal())).rejects.toThrow();
    await expect(f.service.status(11, 7, `1.${"0".repeat(48)}`, signal())).rejects.toThrow();
  });
  it("validates chunk index, length, sha and exact last chunk length", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(C + 3), signal()); const abc = Buffer.from("abc");
    await expect(f.service.put(11, 7, sessionId, -1, abc, digest(abc), signal())).rejects.toThrow();
    await expect(f.service.put(11, 7, sessionId, 2, abc, digest(abc), signal())).rejects.toThrow();
    await expect(f.service.put(11, 7, sessionId, 0, abc, digest(abc), signal())).rejects.toThrow();
    await expect(f.service.put(11, 7, sessionId, 1, abc, "0".repeat(64), signal())).rejects.toThrow();
    await expect(f.service.put(11, 7, sessionId, 1, Buffer.from("abcd"), digest("abcd"), signal())).rejects.toThrow();
    await f.service.put(11, 7, sessionId, 1, abc, digest(abc), signal());
    expect((await f.service.status(11, 7, sessionId, signal())).uploadedIndices).toEqual([1]);
  });
  it("deduplicates equal hashes and rejects a wrong file even after a receipt", async () => {
    const f = fixture(); const session = await f.uploaded(); const puts = f.calls.puts.length;
    await f.service.put(11, 7, session, 0, Buffer.from("abc"), digest("abc"), signal()); expect(f.calls.puts.length).toBe(puts);
    await f.service.finalize(11, 7, session, signal());
    await f.service.put(11, 7, session, 0, Buffer.from("abc"), digest("abc"), signal());
    await expect(f.service.put(11, 7, session, 0, Buffer.from("xyz"), digest("xyz"), signal())).rejects.toThrow();
  });
  it("merges simultaneous parts across CAS replicas without losing indices", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(C + 3), signal());
    const replica = createWarleineUploadService(f.deps); const big = Buffer.alloc(C, 65), last = Buffer.from("abc");
    await Promise.all([f.service.put(11, 7, sessionId, 0, big, digest(big), signal()), replica.put(11, 7, sessionId, 1, last, digest(last), signal())]);
    expect((await f.service.status(11, 7, sessionId, signal())).uploadedIndices).toEqual([0, 1]);
    await f.service.finalize(11, 7, sessionId, signal()); expect(f.calls.publication).toBe(1);
  });
  it("bounds CAS merge retries to eight and never queues a partial control", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(), signal()); f.calls.conflicts = 8;
    await expect(f.service.put(11, 7, sessionId, 0, Buffer.from("abc"), digest("abc"), signal())).rejects.toThrow();
    expect(f.calls.conflicts).toBe(0); expect(f.jobs.size).toBe(0); expect(f.controls.get(1)?.status).toBe("recebendo");
  });
  it("does not publish incomplete sessions", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(C + 3), signal());
    await expect(f.service.finalize(11, 7, sessionId, signal())).rejects.toThrow(); expect(f.jobs.size).toBe(0);
  });
  it("seals full SHA in order, commits a receipt, and dispatches only a scoped actual job", async () => {
    const f = fixture(); const session = await f.uploaded(); const receipt = await f.service.finalize(11, 7, session, signal());
    expect(receipt).toEqual({ success: true, sessionId: session, estabelecimentoId: 7, loteId: 2, status: "enfileirado" });
    expect(f.deps.dispatch).toHaveBeenCalledTimes(1);
    expect(f.deps.dispatch).toHaveBeenCalledWith({ loteId: 2, estabelecimentoId: 7 });
    const job = [...f.jobs.values()][0]; expect(job.source).toMatch(/^warleine-chunks:v1:/);
    const sealed = JSON.parse(decryptWarleineFile(f.objects.get(job.source.replace("warleine-chunks:v1:", ""))!).toString()) as WarleineUploadManifest;
    expect(sealed.fullSha256).toBe(digest("abc")); expect(sealed.kind).toBe("selado");
    expect(await f.service.status(11, 7, session, signal())).toMatchObject({ state: "enfileirado", loteId: 2, jobStatus: "enfileirado" });
    await f.service.finalize(11, 7, session, signal()); expect(f.calls.publication).toBe(1); expect(f.deps.dispatch).toHaveBeenCalledTimes(1);
  });
  it("reuses published/active source without overwriting or re-emitting", async () => {
    const f = fixture(); const a = await f.uploaded(); await f.service.finalize(11, 7, a, signal());
    const job = [...f.jobs.values()][0]; job.status = "publicado"; const original = job.source;
    const b = await f.uploaded(Buffer.from("abc"), "00000000-0000-4000-8000-000000000002");
    expect(await f.service.finalize(11, 7, b, signal())).toMatchObject({ loteId: job.loteId, status: "publicado", success: true });
    expect([...f.jobs.values()][0].source).toBe(original); expect(f.deps.dispatch).toHaveBeenCalledTimes(1);
  });
  it("preserves a committed receipt on uncertain publication response and reconciles by status", async () => {
    const f = fixture(); const session = await f.uploaded(); const original = f.repository.publish;
    f.repository.publish = async (...args) => { await original(...args); throw Error("synthetic-response-lost"); };
    await expect(f.service.finalize(11, 7, session, signal())).rejects.toThrow();
    expect(await f.service.status(11, 7, session, signal())).toMatchObject({ state: "enfileirado", loteId: 2 });
    expect(f.calls.publication).toBe(1); expect(f.controls.get(1)?.status).toBe("enfileirado");
  });
  it("marks integrity failure safely without any actual job", async () => {
    const f = fixture(); const session = await f.uploaded();
    const row = f.controls.get(1)!; const m = JSON.parse(decryptWarleineFile(f.objects.get(row.arquivoStorageKey.replace("warleine-upload:v1:", ""))!).toString());
    const bytes = f.objects.get(m.parts[0].key)!; bytes[bytes.length - 1] ^= 1;
    await expect(f.service.finalize(11, 7, session, signal())).rejects.toThrow();
    expect(await f.service.status(11, 7, session, signal())).toMatchObject({ state: "erro", recoveryRequired: true });
    expect(f.jobs.size).toBe(0);
  });
  it("aborts uncertain finalization without a blind retry or queue", async () => {
    const f = fixture(); const session = await f.uploaded(); const controller = new AbortController(); const original = f.cloud.get;
    let part = false; f.cloud.get = async (key, max, s) => { const value = await original(key, max, s); if (max === 3 + 51 && !part) { part = true; controller.abort(); } return value; };
    await expect(f.service.finalize(11, 7, session, controller.signal)).rejects.toThrow();
    expect(f.controls.get(1)?.status).toBe("finalizando"); expect(f.jobs.size).toBe(0);
    await expect(f.service.finalize(11, 7, session, signal())).rejects.toThrow(); expect(f.jobs.size).toBe(0);
  });
  it("expires only receiving controls; queued receipts remain reconcilable beyond TTL", async () => {
    const f = fixture(); const session = await f.uploaded(); await f.service.finalize(11, 7, session, signal()); f.advance(25 * 60 * 60 * 1000);
    expect(await f.service.status(11, 7, session, signal())).toMatchObject({ state: "enfileirado", loteId: 2 });
    expect((await f.service.start(11, input(), signal())).sessionId).toBe(session);
    const b = await f.service.start(11, input(3, "00000000-0000-4000-8000-000000000003"), signal()); f.advance(25 * 60 * 60 * 1000);
    expect(await f.service.status(11, 7, b.sessionId, signal())).toMatchObject({ state: "erro", recoveryRequired: true });
    await expect(f.service.put(11, 7, b.sessionId, 0, Buffer.from("abc"), digest("abc"), signal())).rejects.toThrow();
  });
  it("downloads parts sequentially to 0600 with per-part and whole-file integrity", async () => {
    const f = fixture(); const bytes = Buffer.concat([Buffer.alloc(C, 65), Buffer.from("abc")]); const session = await f.uploaded(bytes); await f.service.finalize(11, 7, session, signal());
    const dir = await fs.mkdtemp(join(tmpdir(), "issue177-synthetic-")); cleanup.push(dir); const output = join(dir, "file.csv");
    await downloadWarleineChunkFileWithCloud(f.cloud, [...f.jobs.values()][0].source, output, { estabelecimentoId: 7, userId: 11 }, signal());
    expect(digest(await fs.readFile(output))).toBe(digest(bytes)); expect((await fs.stat(output)).mode & 0o777).toBe(0o600);
    expect(f.calls.maxConcurrent).toBe(1); expect(Math.max(...f.calls.puts)).toBeLessThanOrEqual(C + 51); expect(Math.max(...f.calls.gets)).toBeLessThanOrEqual(C + 51);
  });
  it("rejects non-sealed source prefixes and wrong hospital before local file creation", async () => {
    const f = fixture(); const session = await f.uploaded(); await f.service.finalize(11, 7, session, signal());
    const dir = await fs.mkdtemp(join(tmpdir(), "issue177-synthetic-")); cleanup.push(dir); const output = join(dir, "file.csv");
    await expect(downloadWarleineChunkFileWithCloud(f.cloud, f.controls.get(1)!.arquivoStorageKey, output, { estabelecimentoId: 7 }, signal())).rejects.toThrow();
    await expect(downloadWarleineChunkFileWithCloud(f.cloud, [...f.jobs.values()][0].source, output, { estabelecimentoId: 8 }, signal())).rejects.toThrow();
    await expect(fs.stat(output)).rejects.toThrow();
  });
  it("removes the output on final SHA mismatch and preserves pre-existing local files", async () => {
    const f = fixture(); const session = await f.uploaded(); await f.service.finalize(11, 7, session, signal());
    const job = [...f.jobs.values()][0]; const key = job.source.replace("warleine-chunks:v1:", "");
    const m = JSON.parse(decryptWarleineFile(f.objects.get(key)!).toString()); m.fullSha256 = "0".repeat(64); f.objects.set(key, encryptWarleineFile(Buffer.from(JSON.stringify(m))));
    const dir = await fs.mkdtemp(join(tmpdir(), "issue177-synthetic-")); cleanup.push(dir); const output = join(dir, "file.csv");
    await expect(downloadWarleineChunkFileWithCloud(f.cloud, job.source, output, { estabelecimentoId: 7 }, signal())).rejects.toThrow(); await expect(fs.stat(output)).rejects.toThrow();
    await fs.writeFile(output, "synthetic-existing");
    await expect(downloadWarleineChunkFileWithCloud(f.cloud, job.source, output, { estabelecimentoId: 7 }, signal())).rejects.toThrow();
    expect(await fs.readFile(output, "utf8")).toBe("synthetic-existing");
  });
  it("cancels download and removes partial output", async () => {
    const f = fixture(); const session = await f.uploaded(); await f.service.finalize(11, 7, session, signal());
    const dir = await fs.mkdtemp(join(tmpdir(), "issue177-synthetic-")); cleanup.push(dir); const output = join(dir, "file.csv"); const controller = new AbortController(); const original = f.cloud.get;
    f.cloud.get = async (key, max, s) => { const value = await original(key, max, s); if (max === 54) controller.abort(); return value; };
    await expect(downloadWarleineChunkFileWithCloud(f.cloud, [...f.jobs.values()][0].source, output, { estabelecimentoId: 7 }, controller.signal)).rejects.toThrow();
    await expect(fs.stat(output)).rejects.toThrow();
  });
  it("reconciles an abandoned finalizando only after its durable deadline via fenced CAS", async () => {
    const f = fixture(); const session = await f.uploaded(); const controller = new AbortController(); const original = f.cloud.get;
    f.cloud.get = async (key, max, s) => { const value = await original(key, max, s); if (max === 54) controller.abort(); return value; };
    await expect(f.service.finalize(11, 7, session, controller.signal)).rejects.toThrow();
    expect((await f.service.status(11, 7, session, signal())).state).toBe("finalizando");
    f.advance(150_001);
    expect(await f.service.status(11, 7, session, signal())).toMatchObject({ state: "erro", recoveryRequired: true });
    expect(f.controls.get(1)?.status).toBe("erro"); expect(f.jobs.size).toBe(0);
  });
  it("reauthorizes immediately before publication and before commit, with revocation failing closed", async () => {
    const f = fixture(); const session = await f.uploaded(); const permission = vi.fn(async () => undefined);
    permission.mockRejectedValueOnce(Error("synthetic-permission-revoked"));
    await expect(f.service.finalize(11, 7, session, signal(), permission)).rejects.toThrow();
    expect(f.jobs.size).toBe(0); expect(f.deps.dispatch).not.toHaveBeenCalled();
    const g = fixture(); const other = await g.uploaded(); const before = vi.fn(async () => undefined);
    before.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("synthetic-permission-revoked-before-commit"));
    await expect(g.service.finalize(11, 7, other, signal(), before)).rejects.toThrow();
    expect(before).toHaveBeenCalledTimes(2); expect(g.jobs.size).toBe(0); expect(g.deps.dispatch).not.toHaveBeenCalled();
  });
  it("requires a dedicated 32-character production encryption key without changing global crypto", async () => {
    const f = fixture(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WARLEINE_FILE_ENCRYPTION_KEY", "");
    await expect(f.service.start(11, input(), signal())).rejects.toThrow(); expect(f.controls.size).toBe(0);
    vi.stubEnv("WARLEINE_FILE_ENCRYPTION_KEY", "synthetic-dedicated-test-key-longer-than-32");
    await expect(f.service.start(11, input(), signal())).resolves.toHaveProperty("sessionId");
  });
  it("verifies a synthetic 300 MiB file as 75 bounded sequential parts without full-file allocation", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(MAX), signal());
    const row = f.controls.get(1)!; const key = row.arquivoStorageKey.replace("warleine-upload:v1:", "");
    const m = JSON.parse(decryptWarleineFile(f.objects.get(key)!).toString()) as WarleineUploadManifest;
    const bytes = Buffer.alloc(C, 65), partKey = `warleine-upload-data/v1/${"a".repeat(48)}`;
    f.objects.set(partKey, encryptWarleineFile(bytes));
    m.parts = Array.from({ length: 75 }, (_, index) => ({ index, byteLength: C, sha256: digest(bytes), key: partKey }));
    f.objects.set(key, encryptWarleineFile(Buffer.from(JSON.stringify(m))));
    const whole = createHash("sha256"); for (let i = 0; i < 75; i++) whole.update(bytes);
    const expectedSha = whole.digest("hex");
    await f.service.finalize(11, 7, sessionId, signal());
    const job = [...f.jobs.values()][0]; const sealed = JSON.parse(decryptWarleineFile(f.objects.get(job.source.replace("warleine-chunks:v1:", ""))!).toString());
    expect(sealed.fullSha256).toBe(expectedSha); expect(sealed.byteLength).toBe(MAX); expect(sealed.parts).toHaveLength(75);
    expect(f.calls.maxConcurrent).toBe(1); expect(Math.max(...f.calls.puts)).toBeLessThanOrEqual(C + 51); expect(Math.max(...f.calls.gets)).toBeLessThanOrEqual(C + 51);
  });
});

async function invoke(f: ReturnType<typeof fixture>, method: string, path: string, extras: any = {}) {
  const router = Router(); registerWarleineUploadRoutes(router, f.deps);
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  const req = Object.assign(Readable.from(extras.bytes ? [extras.bytes] : []), {
    body: extras.body, params: extras.params ?? {}, headers: extras.headers ?? {},
    header(name: string) { return this.headers[name]; }, setTimeout: vi.fn(),
  });
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false, destroyed: false, headersSent: false, code: 0, output: undefined as any,
    setTimeout: vi.fn(), setHeader: vi.fn(), status(code: number) { this.code = code; return this; },
    json(output: unknown) { this.output = output; this.writableEnded = true; return this; },
  });
  await layer.route.stack[0].handle(req, res);
  return { req, res };
}
describe("Warleine REST authorization and safe errors without network", () => {
  it("checks authentication and permissions for every endpoint, including status and finalization", async () => {
    const f = fixture(); const start = await invoke(f, "post", BASE, { body: input() }); expect(start.res.code).toBe(200); const sessionId = start.res.output.sessionId;
    await invoke(f, "get", `${BASE}/:sessionId`, { params: { sessionId }, headers: { "x-estabelecimento-id": "7" } });
    await invoke(f, "put", `${BASE}/:sessionId/blocos/:index`, { params: { sessionId, index: "0" }, bytes: Buffer.from("abc"), headers: { "x-estabelecimento-id": "7", "content-type": "application/octet-stream", "x-chunk-sha256": digest("abc"), "content-length": "3" } });
    const final = await invoke(f, "post", `${BASE}/:sessionId/finalizar`, { params: { sessionId }, headers: { "x-estabelecimento-id": "7" } });
    expect(final.res.output.success).toBe(true); expect(f.deps.authenticate).toHaveBeenCalledTimes(6); expect(f.deps.authorize).toHaveBeenCalledTimes(6);
    expect(start.res.req).toBeUndefined(); expect(start.req.setTimeout).toHaveBeenCalledWith(150_000, expect.any(Function));
  });
  it("forbids Cron and returns only generic safe errors", async () => {
    const f = fixture(); vi.mocked(f.deps.authenticate).mockResolvedValueOnce({ id: 11, role: "admin", isCron: true });
    const cron = await invoke(f, "post", BASE, { body: input() }); expect(cron.res.code).toBe(403); expect(f.controls.size).toBe(0);
    vi.mocked(f.deps.authenticate).mockRejectedValueOnce(Error("synthetic-secret-driver-https://example.invalid"));
    const bad = await invoke(f, "post", BASE, { body: input() }); expect(bad.res.code).toBe(401); expect(JSON.stringify(bad.res.output)).not.toContain("secret");
    vi.mocked(f.deps.authorize).mockResolvedValueOnce(false); const denied = await invoke(f, "post", BASE, { body: input() }); expect(denied.res.code).toBe(403);
  });
  it("rejects invalid raw headers before consuming the request stream", async () => {
    const f = fixture(); const { sessionId } = await f.service.start(11, input(), signal());
    const result = await invoke(f, "put", `${BASE}/:sessionId/blocos/:index`, { params: { sessionId, index: "0" }, bytes: Buffer.from("abc"), headers: { "x-estabelecimento-id": "7", "content-type": "application/octet-stream", "x-chunk-sha256": digest("abc"), "content-length": "30000000" } });
    expect(result.res.code).toBe(400); expect(result.req.readableEnded).toBe(false); expect(f.jobs.size).toBe(0);
  });
});

describe("Warleine zero-DDL SQL adapter contract", () => {
  function sqlFixture(options: { existing?: any; failCommit?: boolean } = {}) {
    const queries: { sql: string; values: unknown[] }[] = [];
    const connection = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes("FROM estabelecimentos")) return [[{ id: 7 }]];
        if (sql.includes("SELECT *") && sql.includes("arquivoHash=?")) return [[options.existing].filter(Boolean)];
        if (sql.includes("SELECT id,status,origem")) return [[options.existing].filter(Boolean)];
        if (sql.includes("SELECT id FROM warleine")) return [[{ id: 1 }]];
        return [[]];
      }),
      execute: vi.fn(async (sql: string, values: unknown[] = []) => { queries.push({ sql, values }); return [{ insertId: 2, affectedRows: 1 }]; }),
      beginTransaction: vi.fn(async () => undefined), commit: vi.fn(async () => { if (options.failCommit) throw Error("synthetic-commit-uncertain"); }),
      rollback: vi.fn(async () => undefined), release: vi.fn(), destroy: vi.fn(),
    };
    return { connection, queries, repository: createWarleineUploadSqlRepository(async () => ({ getConnection: async () => connection })) };
  }
  const row: WarleineUploadControl = { id: 1, estabelecimentoId: 7, criadoPor: 11, arquivoHash: "a".repeat(64), arquivoNome: "synthetic.csv", arquivoTamanho: 3, arquivoStorageKey: "warleine-upload:v1:old", status: "finalizando" };
  it("locks establishment before control reserve and performs no DDL", async () => {
    const f = sqlFixture(); const saved = await f.repository.reserve(11, input(), "warleine-upload:v1:synthetic", signal());
    expect(f.queries[0].sql).toBe("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE"); expect(saved.status).toBe("recebendo");
    expect(f.queries[2].sql).toContain("'upload-controle'"); expect(f.queries.every(q => !/CREATE|ALTER|DROP|DELETE|TRUNCATE/.test(q.sql))).toBe(true);
    expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });
  it("uses binary pointer/status CAS tied to actor, hospital and idempotency hash", async () => {
    const f = sqlFixture(); await f.repository.cas(row, "new-pointer", "erro", signal()); const q = f.queries[0];
    expect(q.sql).toContain("BINARY arquivoStorageKey=BINARY ?"); expect(q.sql).toContain("BINARY status=BINARY ?"); expect(q.sql).toContain("origem='upload-controle'");
    expect(q.values).toEqual(["new-pointer", "erro", 1, 11, 7, row.arquivoHash, row.arquivoStorageKey, "finalizando"]);
  });
  it.each(["publicado", "enfileirado", "reservado", "processando", "validado"])("does not overwrite or re-emit existing %s source", async status => {
    const f = sqlFixture({ existing: { id: 90, status, origem: "arquivo" } });
    const m = { kind: "selado", fullSha256: "b".repeat(64) } as WarleineUploadManifest;
    const receipt = vi.fn(async (j: WarleineUploadJob) => { expect(j.created).toBe(false); return "immutable-receipt"; });
    const result = await f.repository.publish(row, m, "warleine-chunks:v1:synthetic", receipt, signal());
    expect(result).toEqual({ loteId: 90, status, created: false }); expect(f.queries[0].sql).toContain("estabelecimentos");
    const mutations = f.queries.filter(q => /UPDATE|INSERT/.test(q.sql) && !q.sql.startsWith("SELECT"));
    expect(mutations).toHaveLength(1); expect(mutations[0].sql).toContain("origem='upload-controle'"); expect(mutations[0].values[0]).toBe("immutable-receipt");
  });
  it("creates actual job and control receipt in one transaction", async () => {
    const f = sqlFixture(); const m = { kind: "selado", fullSha256: "b".repeat(64), filename: "synthetic.csv", byteLength: 3 } as WarleineUploadManifest;
    await f.repository.publish(row, m, "warleine-chunks:v1:synthetic", async () => "immutable-receipt", signal());
    const jobInsert = f.queries.find(q => q.sql.startsWith("INSERT"))!; expect(jobInsert.values).toEqual([7, "synthetic.csv", "b".repeat(64), 3, "warleine-chunks:v1:synthetic", 11]);
    expect(f.connection.beginTransaction).toHaveBeenCalledTimes(1); expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });
  it("rolls back on receipt failure and sanitizes connection failures", async () => {
    const f = sqlFixture(); const m = { kind: "selado", fullSha256: "b".repeat(64), filename: "synthetic.csv", byteLength: 3 } as WarleineUploadManifest;
    await expect(f.repository.publish(row, m, "warleine-chunks:v1:synthetic", async () => { throw Error("synthetic-sensitive-storage-url"); }, signal())).rejects.toThrow("Não foi possível");
    expect(f.connection.rollback).toHaveBeenCalledTimes(1); expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it("destroys a connection on abort and never commits after cancellation", async () => {
    const f = sqlFixture(); const controller = new AbortController(); f.connection.query.mockImplementationOnce(async () => { controller.abort(); return [[{ id: 7 }]]; });
    await expect(f.repository.reserve(11, input(), "pointer", controller.signal)).rejects.toThrow();
    expect(f.connection.destroy).toHaveBeenCalledTimes(1); expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it("rolls back when permission is revoked after writing the receipt but before commit", async () => {
    const f = sqlFixture(); const m = { kind: "selado", fullSha256: "b".repeat(64), filename: "synthetic.csv", byteLength: 3 } as WarleineUploadManifest;
    const before = vi.fn(async () => { throw Error("synthetic-permission-revoked"); });
    await expect(f.repository.publish(row, m, "warleine-chunks:v1:synthetic", async () => "immutable-receipt", signal(), before)).rejects.toThrow();
    expect(before).toHaveBeenCalledTimes(1); expect(f.connection.commit).not.toHaveBeenCalled(); expect(f.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
