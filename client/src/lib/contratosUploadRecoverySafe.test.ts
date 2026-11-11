import { describe, expect, it, vi } from "vitest";
import { createContratosUploadRepository } from "../../../server/contratosUploadChunks";
import { CONTRATOS_UPLOAD_TTL_MS as TTL, CONTRATOS_UPLOAD_CHUNK_BYTES as CHUNK } from "../../../shared/contratosUploadProtocol";
import { batchIdContratosPdf, sha256ContratoBlob, uploadContratoPdf } from "./contratosUploadChunks";
const BASE = "/api/contratos-convenios/upload-sessoes";
const ORIGINAL = "1.synthetic";
const replacement = { sessionId: "2.synthetic", chunkSize: CHUNK, maxFileBytes: 150 * 1024 * 1024, maxBatchBytes: 600 * 1024 * 1024 };
async function fixture() {
  const file = Object.assign(new Blob(["%PDF-1.4 fixture"], { type: "application/pdf" }), { name: "synthetic.pdf", lastModified: 42 });
  const fingerprint = JSON.stringify([file.name, file.size, file.lastModified, await sha256ContratoBlob(file)]);
  const key = "contratos-upload:v1:9:" + batchIdContratosPdf(9, [file]);
  const values = new Map([[key, JSON.stringify({ sessionId: ORIGINAL, fingerprint, contratoId: 9 })]]);
  const writes: unknown[] = [];
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(JSON.parse(v)); values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const opts = { contratoId: 9, signal: new AbortController().signal, storage };
  return { file, key, values, writes, opts, saved: () => JSON.parse(values.get(key)!) };
}
const state = (value = "recebendo", indices: number[] = []) => Response.json({ state: value, totalChunks: 1, uploadedIndices: indices });
const result = () => Response.json({ processados: 1, documentos: [{ nomeArquivo: "synthetic.pdf", status: "concluido" }] });

// Corrected expectations of the original external audit recovery matrix.
describe("recuperação cliente mantém referência mínima até substituição confirmada", () => {
  it.each([404, 409, 410, 412])("GET %i + POST 409 preserva ID e a próxima tentativa consulta original", async status => {
    const f = await fixture(); const calls: string[] = [];
    const transport: typeof fetch = async (url, init = {}) => {
      calls.push(`${init.method ?? "GET"} ${url}`);
      if (String(url) === BASE) { expect(f.saved()).toMatchObject({ sessionId: ORIGINAL, creationUncertain: true }); return new Response(null, { status: 409 }); }
      return new Response(null, { status });
    };
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("HTTP 409");
    expect(calls.filter(c => c === `POST ${BASE}`)).toHaveLength(1);
    expect(calls.at(-1)).toBe(`GET ${BASE}/${ORIGINAL}`);
    expect(f.saved()).toMatchObject({ sessionId: ORIGINAL }); expect(f.saved().creationUncertain).toBeUndefined();
    const before = calls.length;
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("HTTP 409");
    expect(calls[before]).toBe(`GET ${BASE}/${ORIGINAL}`);
    expect(f.writes.every((v: any) => v.sessionId === ORIGINAL)).toBe(true);
    expect(Object.keys(f.saved()).sort()).toEqual(["contratoId", "fingerprint", "sessionId"]);
  });
  it.each(["recebendo", "concluido", "finalizando"])("POST 409 reconcilia original %s sem outra criação ou replay inseguro", async recovered => {
    const f = await fixture(); const calls: string[] = []; let conflict = false; let complete = recovered !== "recebendo";
    const transport: typeof fetch = async (url, init = {}) => {
      const route = String(url); calls.push(`${init.method ?? "GET"} ${route}`);
      if (route === BASE) { conflict = true; return new Response(null, { status: 409 }); }
      expect(route.startsWith(`${BASE}/${ORIGINAL}`)).toBe(true);
      if (init.method === "PUT") { complete = true; return new Response(null, { status: 204 }); }
      if (route.endsWith("/finalizar")) return result();
      return conflict ? state(recovered, complete ? [0] : []) : new Response(null, { status: 412 });
    };
    if (recovered === "finalizando") await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("em andamento");
    else expect(await uploadContratoPdf(f.file, { ...f.opts, transport })).toMatchObject({ processados: 1 });
    expect(calls.filter(c => c === `POST ${BASE}`)).toHaveLength(1);
    if (recovered !== "recebendo") expect(calls.some(c => c.startsWith("PUT"))).toBe(false);
    if (recovered === "finalizando") expect(calls.some(c => c.endsWith("/finalizar"))).toBe(false);
    expect(f.saved().sessionId).toBe(ORIGINAL);
  });
  it.each(["erro", "expirado", "interrompido"])("POST 409 + original %s preserva ID sem mutação", async recovered => {
    const f = await fixture(); let post = false; const methods: string[] = [];
    const transport: typeof fetch = async (url, init = {}) => {
      methods.push(init.method ?? "GET");
      if (String(url) === BASE) { post = true; return new Response(null, { status: 409 }); }
      return post ? state(recovered) : new Response(null, { status: 412 });
    };
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("HTTP 409");
    expect(methods).not.toContain("PUT"); expect(f.saved().sessionId).toBe(ORIGINAL);
  });
  it("não apaga erro confirmado antes da nova criação e só substitui ID após parseInfo válido", async () => {
    const f = await fixture(); let post = false;
    const transport: typeof fetch = async (url, init = {}) => {
      const route = String(url);
      if (route === BASE) { expect(f.saved().sessionId).toBe(ORIGINAL); post = true; return Response.json(replacement); }
      if (route.endsWith("/finalizar")) return result();
      return post ? state("concluido", [0]) : state("erro");
    };
    await uploadContratoPdf(f.file, { ...f.opts, transport });
    expect((f.writes[0] as any).sessionId).toBe(ORIGINAL); expect(f.saved().sessionId).toBe(replacement.sessionId);
  });
  it.each(["lost", "invalid", "500"])("resposta de criação %s mantém ID e guard sem repetir POST na próxima tentativa", async kind => {
    const f = await fixture(); let posts = 0;
    const transport: typeof fetch = async (url) => {
      if (String(url) !== BASE) return new Response(null, { status: 404 });
      posts++;
      if (kind === "lost") throw new TypeError("lost create response");
      if (kind === "500") return new Response(null, { status: 500 });
      return Response.json({ sessionId: "bad url" });
    };
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow();
    expect(f.saved()).toMatchObject({ sessionId: ORIGINAL, creationUncertain: true });
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("às cegas"); expect(posts).toBe(1);
  });
  it("resposta de substituição perdida ainda permite consulta original recuperada sem novo POST", async () => {
    const f = await fixture(); let recovering = false; let posts = 0;
    const transport: typeof fetch = async (url) => {
      if (String(url) === BASE) { posts++; throw new TypeError("lost create response"); }
      if (!recovering) return new Response(null, { status: 412 });
      if (String(url).endsWith("/finalizar")) return result();
      return state("concluido", [0]);
    };
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow("lost create");
    recovering = true;
    expect(await uploadContratoPdf(f.file, { ...f.opts, transport })).toMatchObject({ processados: 1 });
    expect(posts).toBe(1); expect(f.saved().creationUncertain).toBeUndefined();
  });
  it.each([401, 403, 500])("GET %i não autoriza recriação", async status => {
    const f = await fixture(); const methods: string[] = [];
    const transport: typeof fetch = async (_url, init = {}) => { methods.push(init.method ?? "GET"); return new Response(null, { status }); };
    await expect(uploadContratoPdf(f.file, { ...f.opts, transport })).rejects.toThrow(`HTTP ${status}`);
    expect(methods.every(m => m === "GET")).toBe(true); expect(f.writes).toHaveLength(0);
  });
  it("falha de storage antes do POST não introduz fallback local nem perde ID", async () => {
    const f = await fixture(); let post = 0;
    const transport: typeof fetch = async (url) => { if (String(url) === BASE) post++; return new Response(null, { status: 412 }); };
    await expect(uploadContratoPdf(f.file, { ...f.opts, storage: { ...f.opts.storage, setItem: () => { throw new Error("storage failure"); } }, transport })).rejects.toThrow("storage failure");
    expect(post).toBe(0); expect(f.saved().sessionId).toBe(ORIGINAL);
  });
});

const manifest: any = { version: 1, actorId: 7, contratoId: 9, estabelecimentoId: 11, sha256: "a".repeat(64), batchHash: "b".repeat(64), batchTotalBytes: 42, byteLength: 42, filename: "synthetic.pdf" };
function mockDb(duplicate: any) {
  const record = { ...manifest, id: 2, criadoPor: 7, status: "processando", storageKey: "synthetic-new" };
  const rows: any[][] = [[{ id: 9, estabelecimentoId: 11 }], [duplicate], [], [record]];
  const db: any = {
    select: () => ({ from: () => ({ where: () => { const value = rows.shift(); return { for: async () => value, limit: async () => value, then: (resolve: any) => Promise.resolve(value).then(resolve) }; } }) }),
    delete: vi.fn(() => ({ where: vi.fn(async () => {}) })), insert: vi.fn(() => ({ values: () => ({ $returningId: async () => [{ id: 2 }] }) })), transaction: async (run: any) => run(db),
  };
  return { db, repo: createContratosUploadRepository(async () => db) };
}
describe("adapter real só recupera reserva do próprio actor (DB mockado)", () => {
  it.each(["concluido", "ocr_necessario", "processando", "erro"])("não apaga reserva %s de outro actor", async status => {
    const f = mockDb({ id: 1, status, criadoPor: 8, updatedAt: new Date(Date.now() - TTL - 1000) });
    await expect(f.repo.reserve(manifest, "synthetic")).rejects.toMatchObject({ status: 409 });
    expect(f.db.delete).not.toHaveBeenCalled(); expect(f.db.insert).not.toHaveBeenCalled();
  });
  it.each(["concluido", "ocr_necessario", "processando"])("não apaga duplicata própria %s recente", async status => {
    const f = mockDb({ id: 1, status, criadoPor: 7, updatedAt: new Date() });
    await expect(f.repo.reserve(manifest, "synthetic")).rejects.toMatchObject({ status: 409 }); expect(f.db.delete).not.toHaveBeenCalled();
  });
  it.each([{ status: "erro", criadoPor: 7, updatedAt: new Date() }, { status: "processando", criadoPor: 7, updatedAt: new Date(Date.now() - TTL - 1000) }])("recupera erro/expirada do mesmo actor", async duplicate => {
    const f = mockDb({ id: 1, ...duplicate });
    await expect(f.repo.reserve(manifest, "synthetic")).resolves.toMatchObject({ id: 2 }); expect(f.db.delete).toHaveBeenCalledOnce(); expect(f.db.insert).toHaveBeenCalledOnce();
  });
});
