import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import {
  createContratosUploadHandlers, createContratosUploadCloudStorage,
  registerContratosUploadRoutes, ContratosUploadError,
  type ContratosUploadManifest, type ContratosUploadRecord,
  type ContratosUploadRepository, type ContratosUploadStorage,
} from "./contratosUploadChunks";
import {
  CONTRATOS_UPLOAD_CHUNK_BYTES as CHUNK, CONTRATOS_UPLOAD_MAX_BATCH_BYTES as BATCH,
  CONTRATOS_UPLOAD_MAX_FILE_BYTES as FILE, CONTRATOS_UPLOAD_TTL_MS as TTL,
  CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS as DEADLINE,
} from "../shared/contratosUploadProtocol";
import type { Router, Request, Response } from "express";
import type { ContratoConvenioPdfLeitura } from "./contratosConveniosPdfService";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const actor = { id: 7 };
const pdf = Buffer.from("%PDF-1.7\nsynthetic contract only\n%%EOF");
const input = (bytes = pdf, extra: Record<string, unknown> = {}) => ({ contratoId: 9, filename: "sintético.pdf", byteLength: bytes.length, sha256: hash(bytes), ...extra });
const stream = (bytes: Uint8Array) => Readable.from([bytes]);
function fixture() {
  const records = new Map<number, ContratosUploadRecord>();
  const manifests = new Map<number, ContratosUploadManifest>();
  const objects = new Map<string, Buffer>();
  let sequence = 0;
  let clock = 100_000;
  let authorized = true;
  let hospital = 11;
  const repository: ContratosUploadRepository = {
    reserve: vi.fn(async (m, key) => {
      // Synthetic transactional quota/duplicate implementation for contract.
      if ([...records.values()].some(r => r.contratoId === m.contratoId && r.sha256 === m.sha256)) throw new ContratosUploadError(409, "duplicate");
      const batch = [...manifests.values()].filter(r => r.contratoId === m.contratoId && r.actorId === m.actorId && r.batchHash === m.batchHash);
      if (batch.some(r => r.batchTotalBytes !== m.batchTotalBytes)) throw new ContratosUploadError(409, "quota binding");
      if (batch.length >= 30 || batch.reduce((sum, r) => sum + r.byteLength, m.byteLength) > m.batchTotalBytes) throw new ContratosUploadError(413, "quota");
      const r: ContratosUploadRecord = { id: ++sequence, contratoId: m.contratoId, estabelecimentoId: m.estabelecimentoId, criadoPor: m.actorId, nomeArquivo: m.filename, tamanhoBytes: m.byteLength, sha256: m.sha256, storageKey: key, status: "processando", paginas: null, pontosImportantes: [] };
      manifests.set(r.id, structuredClone(m)); records.set(r.id, r); return structuredClone(r);
    }),
    get: vi.fn(async id => { const r = records.get(id); return r ? structuredClone(r) : undefined; }),
    compareAndSwap: vi.fn(async (expected, key, status = "processando", result) => {
      const current = records.get(expected.id);
      if (!current || current.storageKey !== expected.storageKey || current.status !== expected.status || current.criadoPor !== expected.criadoPor || current.estabelecimentoId !== expected.estabelecimentoId || current.contratoId !== expected.contratoId || current.sha256 !== expected.sha256) return false;
      records.set(current.id, { ...current, storageKey: key, status: result?.status ?? status, paginas: result?.paginas ?? null, pontosImportantes: result?.pontosImportantes ?? [] }); return true;
    }),
  };
  let maxFileRead = 0;
  let tempPath: string | undefined;
  const storage: ContratosUploadStorage = {
    put: vi.fn(async (key, bytes) => { objects.set(key, Buffer.from(bytes)); }),
    get: vi.fn(async key => { const bytes = objects.get(key); if (!bytes) throw new Error("not durable"); return stream(bytes); }),
    putFile: vi.fn(async (key, filePath) => {
      tempPath = filePath;
      const h = createHash("sha256"); let length = 0;
      for await (const bytes of createReadStream(filePath, { highWaterMark: CHUNK })) { h.update(bytes); length += bytes.length; maxFileRead = Math.max(maxFileRead, bytes.length); }
      // Store only digest/size for final PDF: no test Buffer of full PDF.
      objects.set(key, Buffer.from(JSON.stringify({ sha256: h.digest("hex"), length })));
    }),
  };
  const authorize = vi.fn(async () => { if (!authorized) throw new ContratosUploadError(403, "revoked"); return { estabelecimentoId: hospital }; });
  const ready = vi.fn(async (_bytes: number) => undefined);
  const processPdfFile = vi.fn(async (filePath: string, _bytes: number, _signal?: AbortSignal): Promise<ContratoConvenioPdfLeitura> => {
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    return { status: "concluido" as const, paginas: 1, pontosImportantes: [], textoExtraido: "synthetic" };
  });
  const deps = { repository, storage, authorize, ready, processPdfFile, now: () => clock, finalizationTimeoutMs: undefined as number | undefined };
  const api = () => createContratosUploadHandlers(deps);
  return { api, deps, records, manifests, objects, setClock: (value: number) => { clock = value; }, revoke: () => { authorized = false; }, moveHospital: () => { hospital++; }, get maxFileRead() { return maxFileRead; }, get tempPath() { return tempPath; } };
}
async function uploaded(f: ReturnType<typeof fixture>, bytes = pdf) {
  const start = await f.api().iniciar(actor, input(bytes));
  for (let i = 0; i * CHUNK < bytes.length; i++) { const part = bytes.subarray(i * CHUNK, (i + 1) * CHUNK); await f.api().bloco(actor, start.sessionId, i, stream(part), hash(part)); }
  return start.sessionId;
}

describe("contratos upload: handlers reais sem rede ou banco", () => {
  it("reserva manifesto cloud antes do placeholder e publica apenas protocolo sem chaves", async () => {
    const f = fixture();
    const start = await f.api().iniciar(actor, input());
    expect(start).toMatchObject({ chunkSize: CHUNK, maxFileBytes: FILE, maxBatchBytes: BATCH });
    expect(vi.mocked(f.deps.storage.put).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.deps.repository.reserve).mock.invocationCallOrder[0]);
    expect(f.records.get(1)).toMatchObject({ status: "processando", paginas: null, pontosImportantes: [] });
    expect(JSON.stringify(start)).not.toContain("storage");
  });
  it("retoma em instância nova, aceita reordenação e finaliza stream com cleanup", async () => {
    const f = fixture(); const bytes = Buffer.alloc(CHUNK + 13, 42); pdf.copy(bytes, 0);
    const { sessionId } = await f.api().iniciar(actor, input(bytes));
    await f.api().bloco(actor, sessionId, 1, stream(bytes.subarray(CHUNK)), hash(bytes.subarray(CHUNK)));
    expect(await f.api().status(actor, sessionId)).toMatchObject({ uploadedIndices: [1], totalChunks: 2, state: "recebendo" });
    await f.api().bloco(actor, sessionId, 0, stream(bytes.subarray(0, CHUNK)), hash(bytes.subarray(0, CHUNK)));
    const result = await f.api().finalizar(actor, sessionId);
    expect(result).toMatchObject({ processados: 1, documentos: [{ status: "concluido", reutilizado: false }] });
    expect(f.maxFileRead).toBeLessThanOrEqual(CHUNK);
    expect(f.records.get(1)?.storageKey).toContain("/pdf/");
    expect(await f.api().status(actor, sessionId)).toMatchObject({ uploadedIndices: [0, 1], state: "concluido" });
    expect((await f.api().finalizar(actor, sessionId)).documentos[0].reutilizado).toBe(true);
    expect(f.deps.processPdfFile).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("contratos-upload");
    await expect(fs.stat(f.tempPath!)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("hash de bloco incorreto não cria marcador ou objeto", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    await expect(f.api().bloco(actor, sessionId, 0, stream(pdf), "a".repeat(64))).rejects.toMatchObject({ status: 422 });
    expect(f.deps.storage.put).toHaveBeenCalledTimes(1);
    expect((await f.api().status(actor, sessionId)).uploadedIndices).toEqual([]);
  });
  it("hash de bloco pode ser omitido, mas hash final permanece obrigatório", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    await f.api().bloco(actor, sessionId, 0, stream(pdf));
    expect((await f.api().finalizar(actor, sessionId)).processados).toBe(1);
  });
  it("duplicata idêntica é idempotente; conteúdo divergente é recusado", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    expect(await f.api().bloco(actor, sessionId, 0, stream(pdf), hash(pdf))).toMatchObject({ reutilizado: true });
    await expect(f.api().bloco(actor, sessionId, 0, stream(Buffer.alloc(pdf.length, 3)))).rejects.toMatchObject({ status: 409 });
  });
  it("bloco incompleto, grande, índice inválido e header hash inválido falham fechados", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    for (const bytes of [pdf.subarray(1), Buffer.alloc(pdf.length + 1)]) await expect(f.api().bloco(actor, sessionId, 0, stream(bytes))).rejects.toMatchObject({ status: 400 });
    await expect(f.api().bloco(actor, sessionId, -1, stream(pdf))).rejects.toMatchObject({ status: 400 });
    await expect(f.api().bloco(actor, sessionId, 1, stream(pdf))).rejects.toMatchObject({ status: 400 });
    await expect(f.api().bloco(actor, sessionId, 0, stream(pdf), "bad")).rejects.toMatchObject({ status: 400 });
    expect(f.deps.repository.compareAndSwap).not.toHaveBeenCalled();
  });
  it("finalização incompleta não reserva claim nem processa PDF", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 409 });
    expect(f.deps.repository.compareAndSwap).not.toHaveBeenCalled(); expect(f.deps.processPdfFile).not.toHaveBeenCalled();
  });
  it("revalida actor, token e hospital em todas as rotas", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    for (const run of [() => f.api().status({ id: 8 }, sessionId), () => f.api().bloco({ id: 8 }, sessionId, 0, stream(pdf)), () => f.api().finalizar({ id: 8 }, sessionId)]) await expect(run()).rejects.toMatchObject({ status: 404 });
    await expect(f.api().status(actor, sessionId.slice(0, -1) + (sessionId.endsWith("f") ? "a" : "f"))).rejects.toMatchObject({ status: 404 });
    f.moveHospital(); await expect(f.api().status(actor, sessionId)).rejects.toMatchObject({ status: 403 });
  });
  it("permissão revogada impede status, bloco e finalização", async () => {
    const f = fixture(); const sessionId = await uploaded(f); f.revoke();
    for (const run of [() => f.api().status(actor, sessionId), () => f.api().bloco(actor, sessionId, 0, stream(pdf)), () => f.api().finalizar(actor, sessionId)]) await expect(run()).rejects.toMatchObject({ status: 403 });
  });
  it("CAS concorrente aceita somente uma extração/finalização em instâncias distintas", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    const result = await Promise.allSettled([f.api().finalizar(actor, sessionId), f.api().finalizar(actor, sessionId)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(f.deps.processPdfFile).toHaveBeenCalledTimes(1);
  });
  it("limita montagem local a um PDF e deixa outro documento recebendo sem claim", async () => {
    const f = fixture();
    const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("\nsecond synthetic document")]));
    let release!: () => void; let started!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const begun = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(f.deps.processPdfFile).mockImplementationOnce(async () => {
      started(); await wait;
      return { paginas: 1, textoExtraido: "synthetic", pontosImportantes: [], status: "concluido" };
    });
    const processing = f.api().finalizar(actor, first);
    await begun;
    try {
      await expect(f.api().finalizar(actor, second)).rejects.toMatchObject({ status: 429 });
      expect(await f.api().status(actor, second)).toMatchObject({ state: "recebendo", uploadedIndices: [0] });
      expect(f.deps.processPdfFile).toHaveBeenCalledTimes(1);
    } finally { release(); await processing; }
    expect((await f.api().finalizar(actor, second)).processados).toBe(1);
  });
  it("CAS concorrente de blocos não perde índices", async () => {
    const f = fixture(); const bytes = Buffer.alloc(CHUNK + 11, 23); pdf.copy(bytes);
    const { sessionId } = await f.api().iniciar(actor, input(bytes));
    await Promise.all([f.api().bloco(actor, sessionId, 0, stream(bytes.subarray(0, CHUNK))), f.api().bloco(actor, sessionId, 1, stream(bytes.subarray(CHUNK)))]);
    expect((await f.api().status(actor, sessionId)).uploadedIndices).toEqual([0, 1]);
  });
  it("falha de storage antes do marcador deixa bloco ausente e retomável", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    vi.mocked(f.deps.storage.put).mockRejectedValueOnce(new Error("cloud failed"));
    await expect(f.api().bloco(actor, sessionId, 0, stream(pdf))).rejects.toThrow();
    expect((await f.api().status(actor, sessionId)).uploadedIndices).toEqual([]);
    await f.api().bloco(actor, sessionId, 0, stream(pdf));
    expect((await f.api().finalizar(actor, sessionId)).processados).toBe(1);
  });
  it("falha ao persistir manifesto de bloco não marca upload", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input());
    const put = f.deps.storage.put;
    vi.mocked(put).mockImplementationOnce(async (key, bytes) => { f.objects.set(key, Buffer.from(bytes)); }).mockRejectedValueOnce(new Error("manifest failed"));
    await expect(f.api().bloco(actor, sessionId, 0, stream(pdf))).rejects.toThrow();
    expect((await f.api().status(actor, sessionId)).uploadedIndices).toEqual([]);
  });
  it("hash final incorreto marca erro e nunca processa ou publica", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input(pdf, { sha256: "b".repeat(64) }));
    await f.api().bloco(actor, sessionId, 0, stream(pdf));
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 422 });
    expect(await f.api().status(actor, sessionId)).toMatchObject({ state: "erro", recoveryRequired: true });
    expect(f.deps.storage.putFile).not.toHaveBeenCalled(); expect(f.deps.processPdfFile).not.toHaveBeenCalled();
  });
  it("cloudparts corrompidos são recusados após restart", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    const partKey = [...f.objects.keys()].find(k => k.includes("/parts/"))!;
    f.objects.set(partKey, Buffer.alloc(pdf.length, 0));
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 422 });
    expect(f.deps.processPdfFile).not.toHaveBeenCalled();
  });
  it("manifesto com índices duplicados ou binding corrompido falha fechado", async () => {
    const f = fixture(); const sessionId = await uploaded(f); const key = f.records.get(1)!.storageKey;
    const manifest = JSON.parse(f.objects.get(key)!.toString()) as ContratosUploadManifest;
    manifest.parts.push(manifest.parts[0]); f.objects.set(key, Buffer.from(JSON.stringify(manifest)));
    await expect(f.api().status(actor, sessionId)).rejects.toMatchObject({ status: 412 });
    manifest.parts.pop(); manifest.actorId++; f.objects.set(key, Buffer.from(JSON.stringify(manifest)));
    await expect(f.api().status(actor, sessionId)).rejects.toMatchObject({ status: 412 });
  });
  it("TTL é invalidado no status sem jobs agendados", async () => {
    const f = fixture(); const { sessionId } = await f.api().iniciar(actor, input()); f.setClock(100_000 + TTL);
    await expect(f.api().bloco(actor, sessionId, 0, stream(pdf))).rejects.toMatchObject({ status: 410 });
    expect(await f.api().status(actor, sessionId)).toMatchObject({ state: "expirado", recoveryRequired: true });
    expect(f.records.get(1)?.status).toBe("erro");
  });
  it("finalizador travado vira interrompido no status e claim antigo não publica", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    let resolve!: () => void; let started!: () => void;
    const wait = new Promise<void>(r => { resolve = r; }); const begun = new Promise<void>(r => { started = r; });
    vi.mocked(f.deps.processPdfFile).mockImplementationOnce(async () => { started(); await wait; return { paginas: 1, textoExtraido: "synthetic", pontosImportantes: [], status: "concluido" }; });
    const final = f.api().finalizar(actor, sessionId); const rejected = expect(final).rejects.toMatchObject({ status: 410 });
    await begun; f.setClock(100_000 + DEADLINE);
    try {
      expect(await f.api().status(actor, sessionId)).toMatchObject({ state: "interrompido", recoveryRequired: true });
      // Admission is before load/claim: even this interrupted session cannot
      // start another assembly while the injected noncancellable promise lives.
      await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 429 });
    } finally { resolve(); await rejected; }
    expect(f.records.get(1)?.status).toBe("erro");
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 409 });
  });
  it("pré-condição falha antes de reserva e antes do claim", async () => {
    const f = fixture(); vi.mocked(f.deps.ready).mockRejectedValueOnce(new ContratosUploadError(412, "not ready"));
    await expect(f.api().iniciar(actor, input())).rejects.toMatchObject({ status: 412 });
    expect(f.deps.storage.put).not.toHaveBeenCalled(); expect(f.deps.repository.reserve).not.toHaveBeenCalled();
    const sessionId = await uploaded(f); vi.mocked(f.deps.ready).mockRejectedValueOnce(new ContratosUploadError(412, "not ready"));
    const before = vi.mocked(f.deps.repository.compareAndSwap).mock.calls.length;
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 412 });
    expect(vi.mocked(f.deps.repository.compareAndSwap).mock.calls.length).toBe(before);
  });
  it("limites de 150/600 MiB são exatos; lote não impõe limite de um PDF", async () => {
    const f = fixture();
    await expect(f.api().iniciar(actor, input(pdf, { byteLength: FILE + 1 }))).rejects.toMatchObject({ status: 400 });
    await expect(f.api().iniciar(actor, input(pdf, { batchId: "lote", batchTotalBytes: BATCH + 1 }))).rejects.toMatchObject({ status: 400 });
    await f.api().iniciar(actor, input(pdf, { byteLength: FILE, batchId: "lote", batchTotalBytes: BATCH }));
    await f.api().iniciar(actor, input(pdf, { byteLength: FILE, sha256: "a".repeat(64), batchId: "lote", batchTotalBytes: BATCH }));
    expect(f.records.size).toBe(2);
  });
  it("cota byte/count e declaração de lote são vinculadas", async () => {
    const f = fixture(); const batch = { batchId: "lote", batchTotalBytes: pdf.length * 2 };
    await f.api().iniciar(actor, input(pdf, batch));
    await f.api().iniciar(actor, input(pdf, { ...batch, sha256: "a".repeat(64) }));
    await expect(f.api().iniciar(actor, input(pdf, { ...batch, sha256: "b".repeat(64) }))).rejects.toMatchObject({ status: 413 });
    await expect(f.api().iniciar(actor, input(pdf, { batchId: "lote", batchTotalBytes: pdf.length * 3, sha256: "c".repeat(64) }))).rejects.toMatchObject({ status: 409 });
    const count = fixture();
    for (let i = 1; i <= 30; i++) await count.api().iniciar(actor, input(pdf, { batchId: "count", batchTotalBytes: BATCH, sha256: i.toString(16).padStart(64, "0") }));
    await expect(count.api().iniciar(actor, input(pdf, { batchId: "count", batchTotalBytes: BATCH, sha256: "d".repeat(64) }))).rejects.toMatchObject({ status: 413 });
  });
  it("duplicata de hash/contrato recusa nova sessão sem replay", async () => {
    const f = fixture(); await f.api().iniciar(actor, input());
    await expect(f.api().iniciar(actor, input())).rejects.toMatchObject({ status: 409 });
    expect(f.records.size).toBe(1);
  });
  it("erro na persistência final não declara analisado e requer recuperação explícita", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    vi.mocked(f.deps.storage.putFile).mockRejectedValueOnce(new Error("storage down"));
    await expect(f.api().finalizar(actor, sessionId)).rejects.toThrow();
    expect(f.records.get(1)?.status).toBe("erro"); expect(f.deps.processPdfFile).not.toHaveBeenCalled();
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 409 });
  });
  it("OCR necessário não é marcado como analisado/concluído no documento", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    vi.mocked(f.deps.processPdfFile).mockResolvedValueOnce({ paginas: 1, textoExtraido: "", pontosImportantes: [], status: "ocr_necessario" });
    expect((await f.api().finalizar(actor, sessionId)).documentos[0].status).toBe("ocr_necessario");
    expect(f.records.get(1)?.status).toBe("ocr_necessario");
  });
});

describe("contratos upload: transporte e montagem HTTP injetados", () => {
  it("upload final usa Blob respaldado em arquivo e rejeita HTTP não-OK", async () => {
    const f = fixture(); const sessionId = await uploaded(f);
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const form = options!.body as FormData; const file = form.get("file") as Blob;
      expect(file.size).toBe(pdf.length); expect(file.type).toBe("application/pdf");
      expect(options!.headers).toEqual({ Authorization: "Bearer synthetic-not-a-secret" });
      return new globalThis.Response("synthetic", { status: 503 });
    });
    const cloud = createContratosUploadCloudStorage({ put: async () => undefined, get: async () => ({ url: "https://synthetic.invalid" }), configuration: () => ({ baseUrl: "https://synthetic.invalid", apiKey: "synthetic-not-a-secret" }), transport });
    vi.mocked(f.deps.storage.putFile).mockImplementation(cloud.putFile);
    await expect(f.api().finalizar(actor, sessionId)).rejects.toMatchObject({ status: 412 });
    expect(transport).toHaveBeenCalledTimes(1); expect(f.records.get(1)?.status).toBe("erro");
  });
  it("registra quatro endpoints sem listener e autentica antes de consumir bytes", async () => {
    const f = fixture(); const routes: Record<string, (req: Request, res: Response) => Promise<void>> = {};
    const router = { post: (path: string, fn: typeof routes[string]) => { routes[`POST ${path}`] = fn; }, put: (path: string, fn: typeof routes[string]) => { routes[`PUT ${path}`] = fn; }, get: (path: string, fn: typeof routes[string]) => { routes[`GET ${path}`] = fn; } } as unknown as Router;
    const authenticate = vi.fn(async () => actor);
    registerContratosUploadRoutes(router, { ...f.deps, authenticate });
    expect(Object.keys(routes)).toHaveLength(4);
    let status = 0; let body: unknown;
    const res = { status: (code: number) => { status = code; return res; }, json: (value: unknown) => { body = value; return res; } } as unknown as Response;
    const req = { body: input(), params: {}, header: () => undefined } as unknown as Request;
    await routes["POST /api/contratos-convenios/upload-sessoes"](req, res);
    expect(status).toBe(200); expect(body).toHaveProperty("sessionId");
    const start = body as { sessionId: string };
    vi.mocked(authenticate).mockRejectedValueOnce(new ContratosUploadError(401, "Não autenticado."));
    const binary = stream(pdf) as unknown as Request; binary.params = { sessionId: start.sessionId, index: "0" }; binary.header = (() => "application/octet-stream") as Request["header"];
    await routes["PUT /api/contratos-convenios/upload-sessoes/:sessionId/blocos/:index"](binary, res);
    expect(status).toBe(401); expect(f.deps.repository.compareAndSwap).not.toHaveBeenCalled();
  });
});

describe("multipart integrado: preservação PR156 e pré-condição de worker", () => {
  it("recusa antes de storage/registro; usa dispatch para XML/envio e mantém limpeza Excel/CSV/TXT", async () => {
    const updateArquivoStatus = vi.fn(async () => undefined);
    const updateArquivoProgresso = vi.fn(async () => undefined);
    const findArquivoExistente = vi.fn(async (): Promise<{ id: number } | undefined> => undefined);
    const createArquivo = vi.fn(async () => ({ id: 31 }));
    const updateArquivo = vi.fn(async () => undefined);
    const put = vi.fn(async () => ({ key: "private-synthetic", url: "https://synthetic.invalid" }));
    const ready = vi.fn(() => undefined);
    const dispatch = vi.fn(async () => undefined);
    vi.doMock("./db", () => ({ updateArquivoStatus, updateArquivoProgresso, findArquivoExistente, createArquivo, updateArquivo, getConvenioById: async () => ({ id: 2, estabelecimentoId: 11 }), verificarPermissaoEstabelecimento: async () => true }));
    vi.doMock("./storage", () => ({ storagePut: put, storageGet: async () => ({ key: "private", url: "https://synthetic.invalid" }) }));
    vi.doMock("./_core/sdk", () => ({ sdk: { authenticateRequest: async () => ({ id: 7, role: "user", isCron: false }) } }));
    vi.doMock("./internalFileDispatch", () => ({ assertInternalProcessingReady: ready, dispatchInternalFileProcessing: dispatch }));
    vi.doMock("./contratosConveniosPdfService", () => ({ CONTRATOS_PDF_MAX_BYTES: FILE, CONTRATOS_PDF_MAX_TOTAL_BYTES: BATCH, ensureContratosConveniosDocumentosTable: async () => undefined, sanitizarNomePdf: (v: string) => v }));
    vi.doMock("./tasyCsvImportService", () => ({ importTasyCsvFile: vi.fn() }));
    vi.doMock("./warleineFaturamentoImportService", () => ({ hashWarleineFile: vi.fn(), reserveWarleineImportJob: vi.fn() }));
    vi.doMock("./warleineFileVault", () => ({ encryptWarleineFile: vi.fn() }));
    try {
      const { uploadMultipartRouter } = await import("./uploadMultipart");
      type Layer = { route?: { path: string; stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }> } };
      const route = (uploadMultipartRouter.stack as Layer[]).find(layer => layer.route?.path === "/api/upload-file")!.route!;
      const handler = route.stack[route.stack.length - 1].handle;
      let status = 200; let body: unknown;
      const res = { locals: { uploadUser: { id: 7, role: "user" } }, status: (value: number) => { status = value; return res; }, json: (value: unknown) => { body = value; return res; } } as unknown as Response;
      const request = (tipoArquivo: string, direcao = "retornado") => ({ file: { buffer: Buffer.from("synthetic"), originalname: "synthetic.txt" }, body: { nome: "synthetic", tipoArquivo, direcao, convenioId: "2", estabelecimentoId: "11" } }) as Request;
      ready.mockImplementationOnce(() => { throw new Error("missing config"); });
      await handler(request("xml"), res);
      expect(status).toBe(412); expect(put).not.toHaveBeenCalled(); expect(createArquivo).not.toHaveBeenCalled(); expect(updateArquivoStatus).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
      for (const [kind, direction, existing, cleanup] of [
        ["excel", "retornado", false, false], ["excel", "retornado", true, true],
        ["csv", "retornado", false, true], ["txt", "retornado", false, true],
        ["xml", "retornado", false, undefined], ["pdf", "enviado", false, undefined],
      ] as const) {
        findArquivoExistente.mockResolvedValueOnce(existing ? { id: 31 } : undefined);
        status = 200;
        await handler(request(kind, direction), res);
        expect(status).toBe(200);
        expect(dispatch).toHaveBeenLastCalledWith({ arquivoId: 31, ...(cleanup === undefined ? {} : { limparDadosAnteriores: cleanup }) });
        expect(JSON.stringify(body)).not.toContain("private"); expect(JSON.stringify(body)).not.toContain("secret");
      }
      expect(ready).toHaveBeenCalledTimes(7); expect(dispatch).toHaveBeenCalledTimes(6);
      expect(vi.mocked(ready).mock.invocationCallOrder[1]).toBeLessThan(put.mock.invocationCallOrder[0]);
      expect(updateArquivo).toHaveBeenCalledTimes(1);
    } finally {
      for (const module of ["./db", "./storage", "./_core/sdk", "./internalFileDispatch", "./contratosConveniosPdfService", "./tasyCsvImportService", "./warleineFaturamentoImportService", "./warleineFileVault"]) vi.doUnmock(module);
    }
  });
});

describe("adapter 0141 real com DB mockado: reserva transacional e CAS", () => {
  it("adquire lock do contrato e usa condição de identidade/hash/ponteiro antes de publicar", async () => {
    const { createContratosUploadRepository } = await import("./contratosUploadChunks");
    const { MySqlDialect } = await import("drizzle-orm/mysql-core");
    const sample = fixture(); await sample.api().iniciar(actor, input());
    const m = sample.manifests.get(1)!; const record = sample.records.get(1)!;
    const lock = vi.fn();
    const rows: unknown[][] = [[{ id: 9, estabelecimentoId: 11 }], [], [], [record]];
    const select = vi.fn(() => ({ from: () => ({ where: () => {
      const value = rows.shift()!;
      return { for: async (strength: string) => { lock(strength); return value; }, limit: async () => value, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(value).then(resolve) };
    } }) }));
    const returning = vi.fn(async () => [{ id: 1 }]);
    const insert = vi.fn(() => ({ values: () => ({ $returningId: returning }) }));
    let affectedRows = 1;
    let predicate: import("drizzle-orm").SQL | undefined;
    const update = vi.fn(() => ({ set: () => ({ where: async (condition: import("drizzle-orm").SQL) => { predicate = condition; return [{ affectedRows }]; } }) }));
    const syntheticDb = { select, insert, update, transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(syntheticDb) };
    const getDb = async () => syntheticDb as unknown as NonNullable<Awaited<ReturnType<typeof import("./db").getDb>>>;
    const repo = createContratosUploadRepository(getDb);
    expect(await repo.reserve(m, record.storageKey)).toEqual(record);
    expect(lock).toHaveBeenCalledWith("update"); expect(returning).toHaveBeenCalledOnce();
    expect(await repo.compareAndSwap(record, "synthetic-next-manifest")).toBe(true);
    const query = new MySqlDialect().sqlToQuery(predicate!);
    expect(query.sql).toContain("BINARY");
    for (const column of ["id", "criadoPor", "estabelecimentoId", "contratoId", "sha256", "status", "storageKey"]) expect(query.sql).toContain(`\`${column}\``);
    expect(query.params).toContain(record.storageKey); expect(query.params).toContain(record.sha256);
    affectedRows = 0;
    expect(await repo.compareAndSwap(record, "synthetic-next-manifest")).toBe(false);
  });
  it("DB indisponível é erro 412, sem fallback de sessão local", async () => {
    const { createContratosUploadRepository } = await import("./contratosUploadChunks");
    const repo = createContratosUploadRepository(async () => null);
    await expect(repo.get(1)).rejects.toMatchObject({ status: 412 });
  });
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function abortableHeaders(signal: AbortSignal, onAbort: () => void): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => { onAbort(); reject(new Error("synthetic upstream failure")); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
const syntheticConfiguration = () => ({ baseUrl: "https://synthetic.invalid", apiKey: "synthetic-not-a-secret" });

describe("contratos upload: prazo cumulativo e recursos realmente encerrados", () => {
  it("prazo começa antes do load; headers de manifesto abortam sem claim e liberam admissão", async () => {
    const f = fixture(); const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("second")]));
    const originalGet = f.deps.storage.get;
    const begun = deferred(); const aborted = vi.fn(); const descriptorSignals: AbortSignal[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => { begun.resolve(); return abortableHeaders(init!.signal!, aborted); });
    const cloud = createContratosUploadCloudStorage({
      put: async () => undefined,
      get: async (_key, opts) => { descriptorSignals.push(opts!.signal!); return { url: "https://synthetic.invalid/body" }; },
      configuration: syntheticConfiguration, transport,
    });
    vi.mocked(originalGet).mockImplementationOnce(cloud.get);
    f.deps.finalizationTimeoutMs = 100;
    const claims = vi.mocked(f.deps.repository.compareAndSwap).mock.calls.length;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const rejected = expect(f.api().finalizar(actor, first)).rejects.toMatchObject({ status: 410 });
      await begun.promise;
      await expect(f.api().finalizar(actor, second)).rejects.toMatchObject({ status: 429 });
      f.setClock(100_100); await vi.advanceTimersByTimeAsync(100); await rejected;
      expect(aborted).toHaveBeenCalledOnce();
      expect(descriptorSignals[0]).toBe(transport.mock.calls[0][1]!.signal);
      expect(vi.mocked(f.deps.repository.compareAndSwap).mock.calls).toHaveLength(claims);
      expect(f.deps.processPdfFile).not.toHaveBeenCalled();
      expect(f.records.get(1)?.status).toBe("processando");
      expect((await f.api().finalizar(actor, second)).processados).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("abort destrói Readable, aguarda cancel/close real e remove /tmp ANTES de aceitar segundo PDF", async () => {
    const f = fixture(); const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("second")]));
    const originalGet = vi.mocked(f.deps.storage.get).getMockImplementation()!;
    const cancelGate = deferred(); const canceled = deferred(); const begun = deferred();
    const cancel = vi.fn(() => { canceled.resolve(); return cancelGate.promise; });
    const transport = vi.fn<typeof fetch>(async () => new globalThis.Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(pdf.subarray(0, 6)); }, cancel })));
    const descriptor = vi.fn(async (_key: string, _opts?: { signal?: AbortSignal }) => ({ url: "https://synthetic.invalid/body" }));
    const cloud = createContratosUploadCloudStorage({ put: async () => undefined, get: descriptor, configuration: syntheticConfiguration, transport });
    let bodyStream: Readable | undefined; let tempDir: string | undefined;
    const mkdtemp = fs.mkdtemp.bind(fs);
    const spy = vi.spyOn(fs, "mkdtemp").mockImplementation(async (...args) => { const dir = await mkdtemp(...args); tempDir = dir as string; return dir; });
    let stall = true;
    vi.mocked(f.deps.storage.get).mockImplementation(async (key, opts) => {
      if (stall && key.includes("/parts/")) { bodyStream = await cloud.get(key, opts) as Readable; begun.resolve(); return bodyStream; }
      return originalGet(key, opts);
    });
    f.deps.finalizationTimeoutMs = 100;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const final = f.api().finalizar(actor, first); const rejected = expect(final).rejects.toMatchObject({ status: 410 });
      await begun.promise;
      f.setClock(100_100); await vi.advanceTimersByTimeAsync(100); await canceled.promise;
      expect(bodyStream!.destroyed).toBe(true);
      expect(bodyStream!.closed).toBe(false);
      expect(cancel).toHaveBeenCalledOnce();
      expect(descriptor.mock.calls[0][1]!.signal).toBe(transport.mock.calls[0][1]!.signal);
      expect(transport.mock.calls[0][1]!.signal!.aborted).toBe(true);
      expect(await fs.stat(path.join(tempDir!, "contrato.pdf"))).toBeDefined();
      await expect(f.api().finalizar(actor, second)).rejects.toMatchObject({ status: 429 });
      expect(f.deps.processPdfFile).not.toHaveBeenCalled();
      expect(f.deps.storage.putFile).not.toHaveBeenCalled();
      expect(f.records.get(1)?.status).not.toBe("concluido");
      cancelGate.resolve(); await rejected;
      expect(bodyStream!.closed).toBe(true);
      await expect(fs.stat(tempDir!)).rejects.toMatchObject({ code: "ENOENT" });
      stall = false;
      expect((await f.api().finalizar(actor, second)).processados).toBe(1);
      expect(f.deps.processPdfFile).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { cancelGate.resolve(); vi.useRealTimers(); spy.mockRestore(); }
  });

  it("erro de montagem com persistência de ERRO travada usa sinal separado de 5s e deixa claim fail-closed", async () => {
    const f = fixture(); const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("second")]));
    const part = [...f.objects.keys()].find(key => key.includes("/parts/"))!;
    f.objects.set(part, Buffer.alloc(pdf.length));
    const originalPut = vi.mocked(f.deps.storage.put).getMockImplementation()!;
    const begun = deferred(); const aborted = vi.fn(); let cleanupSignal: AbortSignal | undefined; let requestSignal: AbortSignal | undefined;
    let tempDir: string | undefined;
    const mkdtemp = fs.mkdtemp.bind(fs);
    const spy = vi.spyOn(fs, "mkdtemp").mockImplementation(async (...args) => { const dir = await mkdtemp(...args); tempDir = dir as string; return dir; });
    vi.mocked(f.deps.storage.put).mockImplementation(async (key, bytes, mime, opts) => {
      const value = mime === "application/json" ? JSON.parse(Buffer.from(bytes).toString()) as ContratosUploadManifest : undefined;
      if (value?.state === "finalizando") requestSignal = opts!.signal;
      if (value?.state === "erro") {
        cleanupSignal = opts!.signal; begun.resolve();
        await abortableHeaders(cleanupSignal!, aborted); return;
      }
      return originalPut(key, bytes, mime, opts);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const rejected = expect(f.api().finalizar(actor, first)).rejects.toMatchObject({ status: 422 });
      await begun.promise;
      expect(requestSignal!.aborted).toBe(true);
      expect(cleanupSignal).not.toBe(requestSignal);
      expect(cleanupSignal!.aborted).toBe(false);
      await expect(f.api().finalizar(actor, second)).rejects.toMatchObject({ status: 429 });
      await vi.advanceTimersByTimeAsync(4999); expect(aborted).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await rejected;
      expect(aborted).toHaveBeenCalledOnce();
      await expect(fs.stat(tempDir!)).rejects.toMatchObject({ code: "ENOENT" });
      expect(f.deps.processPdfFile).not.toHaveBeenCalled();
      expect(f.records.get(1)?.status).toBe("processando");
      const durable = JSON.parse(f.objects.get(f.records.get(1)!.storageKey)!.toString()) as ContratosUploadManifest;
      expect(durable.state).toBe("finalizando");
      f.setClock(100_000 + DEADLINE);
      // Restore cleanup transport so the later status can persist interruption.
      vi.mocked(f.deps.storage.put).mockImplementation(originalPut);
      expect(await f.api().status(actor, first)).toMatchObject({ state: "interrompido", recoveryRequired: true });
      expect((await f.api().finalizar(actor, second)).processados).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); spy.mockRestore(); }
  });

  it("não reinicia orçamento entre manifesto/claim, chunks e upload PDF final", async () => {
    const f = fixture(); const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("second")]));
    f.deps.finalizationTimeoutMs = 100;
    const originalGet = vi.mocked(f.deps.storage.get).getMockImplementation()!;
    const begun = deferred(); const headers = deferred(); const aborted = vi.fn(); const signals: AbortSignal[] = [];
    vi.mocked(f.deps.storage.get).mockImplementationOnce(async (key, opts) => {
      signals.push(opts!.signal!); begun.resolve(); await new Promise(resolve => setTimeout(resolve, 70)); return originalGet(key, opts);
    });
    const cloud = createContratosUploadCloudStorage({ put: async () => undefined, get: async () => ({ url: "https://synthetic.invalid" }), configuration: syntheticConfiguration,
      transport: vi.fn<typeof fetch>(async (_url, opts) => { signals.push(opts!.signal!); headers.resolve(); return abortableHeaders(opts!.signal!, aborted); }),
    });
    vi.mocked(f.deps.storage.putFile).mockImplementationOnce(cloud.putFile);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const rejected = expect(f.api().finalizar(actor, first)).rejects.toMatchObject({ status: 410 });
      await begun.promise; f.setClock(100_070); await vi.advanceTimersByTimeAsync(70); await headers.promise;
      expect(signals[0]).toBe(signals[1]);
      f.setClock(100_099); await vi.advanceTimersByTimeAsync(29); expect(aborted).not.toHaveBeenCalled();
      f.setClock(100_100); await vi.advanceTimersByTimeAsync(1); await rejected;
      expect(aborted).toHaveBeenCalledOnce();
      expect(f.deps.processPdfFile).not.toHaveBeenCalled();
      expect(f.records.get(1)?.status).toBe("erro");
      expect((await f.api().finalizar(actor, second)).processados).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it("putFile cancela response body desnecessário sem expor capability URL", async () => {
    const f = fixture(); const first = await uploaded(f); const cancel = vi.fn();
    const cloud = createContratosUploadCloudStorage({ put: async () => undefined, get: async () => ({ url: "https://synthetic.invalid" }), configuration: syntheticConfiguration,
      transport: vi.fn<typeof fetch>(async () => new globalThis.Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.from("synthetic-capability")); }, cancel }))),
    });
    vi.mocked(f.deps.storage.putFile).mockImplementation(cloud.putFile);
    const result = await f.api().finalizar(actor, first);
    expect(cancel).toHaveBeenCalledOnce(); expect(result.processados).toBe(1);
    expect(JSON.stringify(result)).not.toContain("synthetic-capability");
  });

  it("TTL encurta o prazo cumulativo e aborta download mesmo antes dos 150s", async () => {
    const f = fixture(); const first = await uploaded(f);
    f.setClock(100_000 + TTL - 20);
    const originalGet = vi.mocked(f.deps.storage.get).getMockImplementation()!;
    const begun = deferred(); const aborted = vi.fn();
    vi.mocked(f.deps.storage.get).mockImplementation(async (key, opts) => {
      if (key.includes("/parts/")) { begun.resolve(); await abortableHeaders(opts!.signal!, aborted); }
      return originalGet(key, opts);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const rejected = expect(f.api().finalizar(actor, first)).rejects.toMatchObject({ status: 410 });
      await begun.promise;
      await vi.advanceTimersByTimeAsync(19); expect(aborted).not.toHaveBeenCalled();
      f.setClock(100_000 + TTL); await vi.advanceTimersByTimeAsync(1); await rejected;
      expect(aborted).toHaveBeenCalledOnce(); expect(f.deps.processPdfFile).not.toHaveBeenCalled();
      expect(f.records.get(1)?.status).toBe("erro"); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("propaga sinal ao processador e mantém slot/PDF até seu cleanup real terminar", async () => {
    const f = fixture(); const first = await uploaded(f);
    const second = await uploaded(f, Buffer.concat([pdf, Buffer.from("second")]));
    const begun = deferred(); const aborted = deferred(); const closed = deferred();
    const client = new AbortController(); let processorSignal: AbortSignal | undefined;
    vi.mocked(f.deps.processPdfFile).mockImplementationOnce(async (_filePath, _size, signal) => {
      processorSignal = signal; begun.resolve();
      await new Promise<void>(resolve => signal!.addEventListener("abort", () => { aborted.resolve(); resolve(); }, { once: true }));
      await closed.promise;
      signal!.throwIfAborted();
      throw new Error("unreachable");
    });
    const rejected = expect(f.api().finalizar(actor, first, client.signal)).rejects.toMatchObject({ status: 410 });
    await begun.promise;
    client.abort(); await aborted.promise;
    expect(processorSignal!.aborted).toBe(true);
    await expect(f.api().finalizar(actor, second)).rejects.toMatchObject({ status: 429 });
    expect(await fs.stat(f.tempPath!)).toBeDefined();
    closed.resolve(); await rejected;
    await expect(fs.stat(f.tempPath!)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.records.get(1)?.status).toBe("erro");
    expect((await f.api().finalizar(actor, second)).processados).toBe(1);
  });

  it.each(["aborted", "response-close"] as const)("HTTP %s cancela storage e remove listeners após cleanup", async kind => {
    const f = fixture(); const first = await uploaded(f); const begun = deferred(); const aborted = vi.fn();
    const routes: Record<string, (req: Request, res: Response) => Promise<void>> = {};
    const router = { post: (key: string, fn: typeof routes[string]) => { routes[key] = fn; }, get: () => undefined, put: () => undefined } as unknown as Router;
    registerContratosUploadRoutes(router, { ...f.deps, authenticate: async () => actor });
    const request = Object.assign(new EventEmitter(), { params: { sessionId: first }, aborted: false }) as unknown as Request;
    let status = 0;
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, status(code: number) { status = code; return this; }, json() { return this; } }) as unknown as Response;
    vi.mocked(f.deps.storage.get).mockImplementationOnce(async (_key, opts) => {
      begun.resolve(); await abortableHeaders(opts!.signal!, aborted); return stream(pdf);
    });
    const run = routes["/api/contratos-convenios/upload-sessoes/:sessionId/finalizar"](request, response);
    await begun.promise;
    if (kind === "aborted") request.emit("aborted"); else response.emit("close");
    await run;
    expect(aborted).toHaveBeenCalledOnce(); expect(status).toBe(410);
    expect(request.listenerCount("aborted")).toBe(0); expect(response.listenerCount("close")).toBe(0);
    expect(f.deps.processPdfFile).not.toHaveBeenCalled();
    expect(f.deps.repository.compareAndSwap).toHaveBeenCalledTimes(1); // only uploaded chunk
  });
});
