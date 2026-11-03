import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adicionarPdfsAoLote, batchIdContratosPdf, CONTRATOS_PDF_CHUNK_BYTES,
  CONTRATOS_PDF_MAX_BATCH_BYTES, CONTRATOS_PDF_MAX_FILE_BYTES,
  exigirIdNovoContrato, sha256ContratoBlob, uploadContratoPdf, validarLoteContratosPdf,
  type PdfMetadata, type PdfUploadFile, type UploadProgress, type UploadSessionStorage,
} from "./contratosUploadChunks";

const BASE = "/api/contratos-convenios/upload-sessoes";
const metadata = (name: string, size = 4): PdfMetadata => ({ name, size, type: "application/pdf", lastModified: 42 });
function pdf(text = "%PDF-1.7 test"): PdfUploadFile {
  return Object.assign(new Blob([text], { type: "application/pdf" }), { name: "synthetic.pdf", lastModified: 42 });
}
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: UploadSessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  return { values, storage };
}
function fixture(file: PdfUploadFile, config: {
  chunkSize?: number; losePutResponse?: "received" | "not-received";
  loseFinalizerResponse?: boolean; loseCreateResponse?: boolean;
  abortAtPut?: AbortController; state?: string; defaultGet?: boolean;
  infoOverride?: Record<string, unknown>; invalidStatus?: boolean;
  pendingFinalizer?: boolean; initialIndices?: number[]; recoveryRequired?: boolean;
} = {}) {
  const chunkSize = config.chunkSize ?? 4;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploaded = new Set<number>(config.initialIndices);
  const events: string[] = [];
  const requests: { path: string; init: RequestInit }[] = [];
  const createBodies: Record<string, unknown>[] = [];
  let lostPut = false, lostFinish = false, persisted = 0;
  let state = config.state ?? "recebendo";
  const result = { processados: 1, documentos: [{ nomeArquivo: file.name, status: "ocr_necessario", storageKey: "never-client", url: "https://storage.invalid/object" }] };
  const transport: typeof fetch = async (input, init = {}) => {
    const path = String(input);
    requests.push({ path, init });
    events.push(`${init.method ?? "GET"} ${path}`);
    expect(init.credentials).toBe("same-origin");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(path.startsWith(BASE)).toBe(true);
    if (path === BASE) {
      createBodies.push(JSON.parse(String(init.body)));
      if (config.loseCreateResponse) throw new TypeError("lost create response");
      return Response.json({ sessionId: "17.0123456789abcdef0123456789abcdef0123456789abcdef", chunkSize, maxFileBytes: CONTRATOS_PDF_MAX_FILE_BYTES, maxBatchBytes: CONTRATOS_PDF_MAX_BATCH_BYTES, ...config.infoOverride });
    }
    if (init.method === "PUT") {
      const index = Number(path.split("/").at(-1));
      const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
      const expected = new Uint8Array(await file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer());
      expect(bytes).toEqual(expected);
      expect(init.headers).toEqual({ "Content-Type": "application/octet-stream", "X-Chunk-SHA256": createHash("sha256").update(bytes).digest("hex") });
      if (config.abortAtPut) { config.abortAtPut.abort(); throw new DOMException("pause", "AbortError"); }
      if (!lostPut && config.losePutResponse) {
        lostPut = true;
        if (config.losePutResponse === "received") uploaded.add(index);
        throw new TypeError("lost chunk response");
      }
      uploaded.add(index);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith("/finalizar")) {
      expect(uploaded.size).toBe(totalChunks);
      if (!persisted) persisted++;
      state = "concluido";
      if (!lostFinish && config.loseFinalizerResponse) {
        lostFinish = true;
        if (config.pendingFinalizer) state = "finalizando";
        throw new TypeError("lost finalizer response");
      }
      return Response.json(result);
    }
    return Response.json({ uploadedIndices: config.invalidStatus ? [totalChunks] : [...uploaded], totalChunks, state, recoveryRequired: config.recoveryRequired, ...(config.defaultGet ? {} : { chunkSize }) });
  };
  return { transport, events, requests, uploaded, createBodies, persistenceCount: () => persisted };
}
const signal = () => new AbortController().signal;

describe("contratos PDF metadata limits (no large allocations)", () => {
  it("accepts exactly 150 MiB per PDF / 600 MiB per batch and rejects one extra byte", () => {
    const max = metadata("max.pdf", CONTRATOS_PDF_MAX_FILE_BYTES);
    expect(validarLoteContratosPdf([max])).toBe(CONTRATOS_PDF_MAX_FILE_BYTES);
    const batch = Array.from({ length: 4 }, (_, i) => metadata(`${i}.pdf`, max.size));
    expect(validarLoteContratosPdf(batch)).toBe(CONTRATOS_PDF_MAX_BATCH_BYTES);
    expect(() => validarLoteContratosPdf([metadata("too-big.pdf", max.size + 1)])).toThrow("150 MiB");
    expect(() => validarLoteContratosPdf([...batch, metadata("extra.pdf", 1)])).toThrow("600 MiB");
  });
  it("enforces zero/negative/noninteger size, PDF type, 30 files and nonempty batch", () => {
    for (const size of [0, -1, 0.5, NaN]) expect(() => validarLoteContratosPdf([metadata("bad.pdf", size)])).toThrow();
    expect(() => validarLoteContratosPdf([{ ...metadata("virus.exe"), type: "text/plain" }])).toThrow("apenas");
    expect(() => validarLoteContratosPdf([{ ...metadata("bad.bin"), type: "application/not-pdf" }])).toThrow();
    const thirty = Array.from({ length: 30 }, (_, i) => metadata(`${i}.pdf`));
    expect(validarLoteContratosPdf(thirty)).toBe(120);
    expect(() => validarLoteContratosPdf([...thirty, metadata("31.pdf")])).toThrow("30");
    expect(() => validarLoteContratosPdf([])).toThrow();
  });
  it("preserves drop/select selection and deduplicates within the newly dropped files", () => {
    const a = metadata("a.pdf"), b = metadata("b.pdf");
    const selected = adicionarPdfsAoLote([a], [a, b, b, { ...metadata("bad.exe"), type: "text/plain" }]);
    expect(selected.files).toEqual([a, b]);
    expect(selected.rejected).toHaveLength(1);
    const full = Array.from({ length: 4 }, (_, i) => metadata(`${i}.pdf`, CONTRATOS_PDF_MAX_FILE_BYTES));
    expect(adicionarPdfsAoLote(full, [metadata("extra.pdf")]).files).toEqual(full);
  });
  it("uses a deterministic batch fingerprint independent of file selection order and contract scope", () => {
    const a = metadata("a.pdf"), b = metadata("b.pdf");
    expect(batchIdContratosPdf(1, [a, b])).toBe(batchIdContratosPdf(1, [b, a]));
    expect(batchIdContratosPdf(1, [a])).not.toBe(batchIdContratosPdf(2, [a]));
  });
  it("fails closed on missing/invalid new contract ID without selecting the first list row", () => {
    for (const value of [undefined, {}, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: "42" }]) expect(() => exigirIdNovoContrato(value)).toThrow("ID exato");
    expect(exigirIdNovoContrato({ id: 73 })).toBe(73);
  });
});

describe("incremental SHA-256 bounded file reads", () => {
  it.each([0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 127, 128, 999])("matches independent node SHA-256 for %i bytes", async length => {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 31) % 256);
    expect(await sha256ContratoBlob(new Blob([bytes]))).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
  it("never calls the original file.arrayBuffer and splits reads at the default 4 MiB boundary", async () => {
    const bytes = new Uint8Array(CONTRATOS_PDF_CHUNK_BYTES + 7).fill(97);
    const source = new Blob([bytes]);
    const readSizes: number[] = [];
    const boundedBlob: Blob = {
      size: source.size, type: source.type,
      slice: (start, end, type) => { const part = source.slice(start, end, type); readSizes.push(part.size); return part; },
      arrayBuffer: async () => { throw new Error("Full-file read forbidden"); },
      text: () => source.text(), stream: () => source.stream(),
      bytes: async () => new Uint8Array(await source.arrayBuffer()),
    };
    expect(await sha256ContratoBlob(boundedBlob)).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(readSizes).toEqual([CONTRATOS_PDF_CHUNK_BYTES, 7]);
  });
  it("honors cancellation during hashing", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sha256ContratoBlob(pdf(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("authenticated resumable chunk transport", () => {
  it("negotiates chunks, transmits correct binary hashes, reports receipt separately from OCR and strips storage fields", async () => {
    const file = pdf(), mock = fixture(file), { storage, values } = memoryStorage();
    const progress: UploadProgress[] = [];
    const result = await uploadContratoPdf(file, { contratoId: 17, batchId: "batch", batchTotalBytes: file.size + 5, signal: signal(), storage, transport: mock.transport, onProgress: p => progress.push(p) });
    expect(mock.createBodies).toEqual([{ contratoId: 17, filename: file.name, byteLength: file.size, sha256: createHash("sha256").update(await file.arrayBuffer().then(b => new Uint8Array(b))).digest("hex"), batchId: "batch", batchTotalBytes: file.size + 5 }]);
    expect(result).toEqual({ processados: 1, documentos: [{ nomeArquivo: file.name, status: "ocr_necessario", reutilizado: false, erro: undefined }] });
    expect(progress.some(p => p.phase === "received" && p.receivedBytes === file.size)).toBe(true);
    expect(progress.some(p => p.phase === "processing")).toBe(true);
    expect(progress.at(-1)?.phase).toBe("done");
    const saved = JSON.parse([...values.values()][0]);
    expect(Object.keys(saved).sort()).toEqual(["contratoId", "fingerprint", "sessionId"]);
    expect(saved).toMatchObject({ contratoId: 17, sessionId: "17.0123456789abcdef0123456789abcdef0123456789abcdef" });
    expect(JSON.stringify(saved)).not.toContain("%PDF");
    expect(JSON.stringify(result)).not.toContain("never-client");
  });
  it("resumes after reload, skips verified blocks, and finalizes idempotently without another create", async () => {
    const file = pdf(), mock = fixture(file), { storage } = memoryStorage();
    await uploadContratoPdf(file, { contratoId: 17, signal: signal(), storage, transport: mock.transport });
    const before = mock.events.length;
    await uploadContratoPdf(file, { contratoId: 17, signal: signal(), storage, transport: mock.transport });
    const resumed = mock.events.slice(before);
    expect(resumed[0]).toBe(`GET ${BASE}/17.0123456789abcdef0123456789abcdef0123456789abcdef`);
    expect(resumed.some(event => event.startsWith("PUT"))).toBe(false);
    expect(mock.createBodies).toHaveLength(1);
    expect(mock.persistenceCount()).toBe(1);
  });
  it("resumes a partial session after reload and skips only verified indices", async () => {
    const file = pdf(), controller = new AbortController(), first = fixture(file, { abortAtPut: controller });
    const { storage } = memoryStorage();
    await expect(uploadContratoPdf(file, { contratoId: 17, signal: controller.signal, storage, transport: first.transport })).rejects.toMatchObject({ name: "AbortError" });
    const resumed = fixture(file, { initialIndices: [0] });
    await uploadContratoPdf(file, { contratoId: 17, signal: signal(), storage, transport: resumed.transport });
    expect(resumed.createBodies).toHaveLength(0);
    expect(resumed.events.some(event => event.includes("/blocos/0"))).toBe(false);
    expect(resumed.events.some(event => event.includes("/blocos/1"))).toBe(true);
  });
  it("accepts GET's minimal shape for default negotiated chunk geometry", async () => {
    const file = pdf(), mock = fixture(file, { chunkSize: CONTRATOS_PDF_CHUNK_BYTES, defaultGet: true }), { storage } = memoryStorage();
    await uploadContratoPdf(file, { contratoId: 17, signal: signal(), storage, transport: mock.transport });
    await uploadContratoPdf(file, { contratoId: 17, signal: signal(), storage, transport: mock.transport });
    expect(mock.createBodies).toHaveLength(1);
  });
  it.each(["received", "not-received"] as const)("verifies status before retrying an uncertain PUT (%s)", async lost => {
    const file = pdf(), mock = fixture(file, { losePutResponse: lost });
    await uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport });
    const firstPut = mock.events.findIndex(event => event.includes("/blocos/0"));
    expect(mock.events[firstPut + 1]).toBe(`GET ${BASE}/17.0123456789abcdef0123456789abcdef0123456789abcdef`);
    expect(mock.events.filter(event => event.includes("/blocos/0"))).toHaveLength(lost === "received" ? 1 : 2);
    expect(mock.createBodies).toHaveLength(1);
  });
  it("retries a transient GET without recreating the session", async () => {
    const file = pdf(), mock = fixture(file);
    let failed = false;
    const transport: typeof fetch = async (input, init) => {
      if (String(input) !== BASE && !init?.method && !failed) { failed = true; throw new TypeError("temporary status loss"); }
      return mock.transport(input, init);
    };
    await uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport });
    expect(failed).toBe(true);
    expect(mock.createBodies).toHaveLength(1);
  });
  it("does not resend an uncertain PUT when status cannot be verified", async () => {
    const file = pdf(), mock = fixture(file, { losePutResponse: "received" });
    let uncertain = false, verificationCalls = 0;
    const transport: typeof fetch = async (input, init) => {
      if (!init?.method && uncertain) { verificationCalls++; throw new TypeError("status unavailable"); }
      try { return await mock.transport(input, init); }
      catch (error) { if (init?.method === "PUT") uncertain = true; throw error; }
    };
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport })).rejects.toThrow("status unavailable");
    expect(verificationCalls).toBe(3);
    expect(mock.events.filter(event => event.includes("/blocos/0"))).toHaveLength(1);
    expect(mock.createBodies).toHaveLength(1);
  });
  it("verifies status after a lost finalizer response and never persists a duplicate", async () => {
    const file = pdf(), mock = fixture(file, { loseFinalizerResponse: true });
    await uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport });
    const firstFinish = mock.events.findIndex(event => event.endsWith("/finalizar"));
    expect(mock.events[firstFinish + 1]).toBe(`GET ${BASE}/17.0123456789abcdef0123456789abcdef0123456789abcdef`);
    expect(mock.events[firstFinish + 2]).toBe(`POST ${BASE}/17.0123456789abcdef0123456789abcdef0123456789abcdef/finalizar`);
    expect(mock.persistenceCount()).toBe(1);
  });
  it("does not replay an uncertain finalizer while GET reports finalizando", async () => {
    const file = pdf(), mock = fixture(file, { loseFinalizerResponse: true, pendingFinalizer: true });
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport })).rejects.toThrow("em andamento");
    expect(mock.events.filter(event => event.endsWith("/finalizar"))).toHaveLength(1);
    expect(mock.events.at(-1)).toContain("GET");
  });
  it("does not send any new operation to a session requiring controlled recovery", async () => {
    const file = pdf(), mock = fixture(file, { recoveryRequired: true });
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport })).rejects.toThrow("recuperação controlada");
    expect(mock.events.some(event => event.startsWith("PUT") || event.endsWith("/finalizar"))).toBe(false);
  });
  it("keeps an uncertain creation guard across reload rather than blindly creating duplicates", async () => {
    const file = pdf(), mock = fixture(file, { loseCreateResponse: true }), { storage } = memoryStorage();
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport, storage })).rejects.toThrow("lost create");
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport, storage })).rejects.toThrow("às cegas");
    expect(mock.createBodies).toHaveLength(1);
  });
  it("cancels without DELETE and restores the same session after reselect/reload", async () => {
    const file = pdf(), controller = new AbortController(), mock = fixture(file, { abortAtPut: controller });
    const { storage } = memoryStorage();
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: controller.signal, storage, transport: mock.transport })).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.requests.every(r => r.init.method !== "DELETE")).toBe(true);
    const resumedMock = fixture(file);
    await uploadContratoPdf(file, { contratoId: 1, signal: signal(), storage, transport: resumedMock.transport });
    expect(resumedMock.createBodies).toHaveLength(0);
    expect(resumedMock.events[0]).toBe(`GET ${BASE}/17.0123456789abcdef0123456789abcdef0123456789abcdef`);
  });
  it("does not use session metadata belonging to another contract or a same-metadata changed file", async () => {
    const file = pdf(), mock = fixture(file), { storage, values } = memoryStorage();
    await uploadContratoPdf(file, { contratoId: 1, signal: signal(), storage, transport: mock.transport });
    const [key, raw] = [...values.entries()][0];
    const saved = JSON.parse(raw);
    values.set(key, JSON.stringify({ ...saved, contratoId: 2 }));
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), storage, transport: mock.transport })).rejects.toThrow("arquivo/contrato");
    values.set(key, raw);
    const changed = pdf("%PDF-1.7 xxxx");
    expect(changed.size).toBe(file.size);
    await expect(uploadContratoPdf(changed, { contratoId: 1, signal: signal(), storage, transport: mock.transport })).rejects.toThrow("arquivo/contrato");
    expect(mock.createBodies).toHaveLength(1);
  });
  it.each([
    { chunkSize: 8 * 1024 * 1024 + 1 }, { chunkSize: 0 },
    { sessionId: "https://external.invalid/session" },
    { sessionId: ".." }, { sessionId: "." },
  ])("rejects unsafe negotiated sessions before PUT: %j", async infoOverride => {
    const file = pdf(), mock = fixture(file, { infoOverride });
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport })).rejects.toThrow("Parâmetros");
    expect(mock.events.some(event => event.startsWith("PUT"))).toBe(false);
  });
  it("enforces negotiated server limits before any binary body", async () => {
    const file = pdf(), mock = fixture(file, { infoOverride: { maxFileBytes: 1 } });
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport })).rejects.toThrow("negociados");
    expect(mock.events.some(event => event.startsWith("PUT"))).toBe(false);
  });
  it("fails closed on invalid uploaded indices and expired sessions, never creates replacement sessions", async () => {
    const file = pdf();
    for (const config of [{ invalidStatus: true }, { state: "expirado" }, { state: "interrompido" }]) {
      const mock = fixture(file, config);
      await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport: mock.transport })).rejects.toThrow();
      expect(mock.events.some(event => event.startsWith("PUT"))).toBe(false);
      expect(mock.createBodies).toHaveLength(1);
    }
  });
  it("rejects over-limit batch metadata without reading bytes or making transport requests", async () => {
    const file = pdf(), mock = fixture(file);
    await expect(uploadContratoPdf(file, { contratoId: 1, batchTotalBytes: CONTRATOS_PDF_MAX_BATCH_BYTES + 1, signal: signal(), transport: mock.transport })).rejects.toThrow("600 MiB");
    expect(mock.requests).toHaveLength(0);
  });
  it("does not retry authorization failures", async () => {
    const file = pdf();
    let calls = 0;
    const transport: typeof fetch = async () => { calls++; return new Response(null, { status: 403 }); };
    await expect(uploadContratoPdf(file, { contratoId: 1, signal: signal(), transport })).rejects.toThrow("HTTP 403");
    expect(calls).toBe(1);
  });
});

describe("page integration regression guards", () => {
  it("uses the tested transport, not legacy multipart/fallback and does not claim upload is AI analysis", () => {
    const page = readFileSync(new URL("../pages/ContratosConvenios.tsx", import.meta.url), "utf8");
    expect(page).toContain("await uploadContratoPdf(arquivo");
    expect(page).toContain("exigirIdNovoContrato(novoContrato)");
    expect(page).not.toContain("/importar-pdfs");
    expect(page).not.toContain("listaAtualizada?.[0]");
    expect(page).not.toContain("importado(s) e analisado(s) com sucesso");
    expect(page).toContain('item.status === "ocr_necessario"');
    expect(page).not.toContain("href={documentoDetalhe.data.downloadUrl}");
    expect(page).toContain("Já recebido · ${conf.label}");
    expect(page).toContain("formatDateBR(c.dataInicio)");
    expect(page).toContain("formatDateBR(c.dataFim)");
  });
});
