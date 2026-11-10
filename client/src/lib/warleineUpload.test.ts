import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  clearWarleineAttempt, getWarleineUploadStatus, isWarleinePublished, persistWarleineAttempt,
  readWarleineAttempt, statusWarleineMessage, uploadWarleineInParts, type WarleineAttemptStorage,
} from "./warleineUpload";
import { WARLEINE_UPLOAD_BASE_PATH, WARLEINE_UPLOAD_CHUNK_BYTES, WARLEINE_UPLOAD_MAX_FILE_BYTES } from "../../../shared/warleineUploadProtocol";

const USER = 701;
const HOSPITAL = 901;
const UUID = "bb4a9e7b-6cb1-4a75-a8fa-205c4f133bb9";
const SESSION = `321.${"a".repeat(48)}`;
class MemoryStorage implements WarleineAttemptStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
function testFile(size = 19): File {
  const blob = new Blob([new Uint8Array(size).fill(42)]);
  return Object.assign(blob, { name: "fixture-synthetic.csv", lastModified: 1, webkitRelativePath: "" }) as File;
}
function fixture(size = 19) {
  const storage = new MemoryStorage();
  const signal = new AbortController();
  let queued = false;
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === WARLEINE_UPLOAD_BASE_PATH) return json({ sessionId: SESSION, chunkSize: WARLEINE_UPLOAD_CHUNK_BYTES, maxFileBytes: WARLEINE_UPLOAD_MAX_FILE_BYTES });
    if (String(url).endsWith("/finalizar")) {
      queued = true;
      return json({ success: true, sessionId: SESSION, estabelecimentoId: HOSPITAL, loteId: 911, status: "enfileirado" });
    }
    if (init?.method === "PUT") return json({ success: true });
    return json({ state: queued ? "enfileirado" : "recebendo", uploadedIndices: [], byteLength: size, totalChunks: Math.ceil(size / WARLEINE_UPLOAD_CHUNK_BYTES), ...(queued ? { loteId: 911, jobStatus: "enfileirado" } : {}) });
  });
  return { storage, signal, transport, opts: { file: testFile(size), userId: USER, hospitalId: HOSPITAL, storage, signal: signal.signal, randomId: () => UUID, transport: transport as typeof fetch } };
}
afterEach(() => { vi.unstubAllGlobals(); });

 describe("Warleine partes — cliente sem PHI persistido", () => {
  it("divide acima de 4 MiB; nenhuma requisição binária excede um bloco e não lê o arquivo inteiro", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture(WARLEINE_UPLOAD_CHUNK_BYTES + 7);
    f.opts.file.arrayBuffer = vi.fn(() => { throw new Error("full-file read forbidden"); });
    const result = await uploadWarleineInParts(f.opts);
    expect(result.status).toBe("enfileirado");
    const puts = f.transport.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts.map(([, init]) => (init!.body as Blob).size)).toEqual([WARLEINE_UPLOAD_CHUNK_BYTES, 7]);
    for (const [, init] of puts) expect((init!.headers as Record<string, string>)["x-chunk-sha256"]).toMatch(/^[a-f0-9]{64}$/);
    expect(f.opts.file.arrayBuffer).not.toHaveBeenCalled();
  });
  it("representa 300 MiB em 75 requisições de 4 MiB, sem ler ou reservar o arquivo inteiro em memória", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    const part = new Blob([new Uint8Array(WARLEINE_UPLOAD_CHUNK_BYTES).fill(42)]);
    const virtualFile = {
      name: "fixture-virtual-300mib.csv", size: WARLEINE_UPLOAD_MAX_FILE_BYTES,
      slice: vi.fn((start: number, end: number) => {
        expect(end - start).toBe(WARLEINE_UPLOAD_CHUNK_BYTES);
        return part;
      }), arrayBuffer: vi.fn(() => { throw new Error("full-file read forbidden"); }),
    } as unknown as File;
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => init?.method === undefined
      ? json({ state: "recebendo", uploadedIndices: [], byteLength: WARLEINE_UPLOAD_MAX_FILE_BYTES, totalChunks: 75 })
      : original(url, init));
    const result = await uploadWarleineInParts({ ...f.opts, file: virtualFile });
    expect(result.status).toBe("enfileirado");
    expect(f.transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(75);
    expect(virtualFile.slice).toHaveBeenCalledTimes(75);
    expect(virtualFile.arrayBuffer).not.toHaveBeenCalled();
  });
  it("preserva UUID antes da rede e guarda somente versão/UUID/sessão", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => {
      expect(readWarleineAttempt(f.storage, USER, HOSPITAL)?.idempotencyKey).toBe(UUID);
      return original(url, init);
    });
    await uploadWarleineInParts(f.opts);
    const text = [...f.storage.map.values()][0];
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["idempotencyKey", "sessionId", "version"]);
    expect(text).not.toContain(f.opts.file.name);
    expect(text).not.toMatch(/sha256|byteLength|paciente|fileName|guia/);
  });
  it("resposta inicial perdida/reload reutiliza o UUID e não revela erro do transporte", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    f.transport.mockRejectedValueOnce(new Error("credential host sql secret fixture"));
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow("Retome/verifique esta mesma tentativa");
    expect(readWarleineAttempt(f.storage, USER, HOSPITAL)).toEqual({ version: 1, idempotencyKey: UUID });
    const randomId = vi.fn(() => "cccccccc-cccc-4ccc-accc-cccccccccccc");
    await uploadWarleineInParts({ ...f.opts, randomId });
    expect(randomId).not.toHaveBeenCalled();
    const posts = f.transport.mock.calls.filter(([url]) => String(url) === WARLEINE_UPLOAD_BASE_PATH);
    expect(posts).toHaveLength(2);
    expect(posts.map(([, init]) => JSON.parse(String(init!.body)).idempotencyKey)).toEqual([UUID, UUID]);
  });
  it("finalização incerta é reconciliada pela mesma sessão, sem reenviar arquivo ou emitir outro lote", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => {
      const value = await original(url, init);
      if (String(url).endsWith("/finalizar")) throw new Error("lost receipt");
      return value;
    });
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow("Retome/verifique");
    const firstPutCount = f.transport.mock.calls.filter(([, init]) => init?.method === "PUT").length;
    const receipt = await uploadWarleineInParts(f.opts);
    expect(receipt.loteId).toBe(911);
    expect(f.transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(firstPutCount);
    expect(f.transport.mock.calls.filter(([url]) => String(url).endsWith("/finalizar"))).toHaveLength(1);
  });
  it("na retomada verifica também partes já reconhecidas, sem confiar apenas em tamanho ou filename", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    persistWarleineAttempt(f.storage, USER, HOSPITAL, { version: 1, idempotencyKey: UUID, sessionId: SESSION });
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => init?.method === undefined
      ? json({ state: "recebendo", uploadedIndices: [0], byteLength: 19, totalChunks: 1 }) : original(url, init));
    await uploadWarleineInParts(f.opts);
    expect(f.transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });
  it("nega recibo de hospital diferente e preserva a tentativa", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture();
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => String(url).endsWith("/finalizar")
      ? json({ success: true, sessionId: SESSION, estabelecimentoId: HOSPITAL + 1, loteId: 911, status: "publicado" }) : original(url, init));
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow("não confirmado");
    expect(readWarleineAttempt(f.storage, USER, HOSPITAL)?.sessionId).toBe(SESSION);
  });
  it.each(["publicado falso", "completed", "concluido", "", null, undefined, "erro", "validado", "processando", "enfileirado"])("não transforma %s em publicação", status => {
    expect(isWarleinePublished(status)).toBe(false);
  });
  it("reconhece apenas status publicado e separa recebido, validado e erro", () => {
    expect(isWarleinePublished("publicado")).toBe(true);
    expect(statusWarleineMessage("enfileirado")).toContain("ainda não ocorreu");
    expect(statusWarleineMessage("validado")).toContain("não confirmada");
    expect(statusWarleineMessage("erro")).toContain("não foi confirmada");
  });
  it("nega arquivo acima do teto antes da reserva ou rede", async () => {
    const f = fixture();
    const invalid = { size: WARLEINE_UPLOAD_MAX_FILE_BYTES + 1, name: "fixture.csv" } as File;
    await expect(uploadWarleineInParts({ ...f.opts, file: invalid })).rejects.toThrow("300 MiB");
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.storage.map.size).toBe(0);
  });
  it("falha de persistência local impede qualquer requisição", async () => {
    const f = fixture();
    f.storage.setItem = () => { throw new Error("storage unavailable"); };
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("troca de usuário/hospital nunca reutiliza a sessão de outra identidade", () => {
    const storage = new MemoryStorage();
    persistWarleineAttempt(storage, USER, HOSPITAL, { version: 1, idempotencyKey: UUID, sessionId: SESSION });
    expect(readWarleineAttempt(storage, USER + 1, HOSPITAL)).toBeNull();
    expect(readWarleineAttempt(storage, USER, HOSPITAL + 1)).toBeNull();
    clearWarleineAttempt(storage, USER, HOSPITAL + 1);
    expect(readWarleineAttempt(storage, USER, HOSPITAL)?.sessionId).toBe(SESSION);
  });
  it("abortar envio conserva sessão e não envia finalizar", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const f = fixture(WARLEINE_UPLOAD_CHUNK_BYTES + 7);
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) => {
      const result = await original(url, init);
      if (init?.method === "PUT") f.signal.abort();
      return result;
    });
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow();
    expect(f.transport.mock.calls.filter(([url]) => String(url).endsWith("/finalizar"))).toHaveLength(0);
    expect(readWarleineAttempt(f.storage, USER, HOSPITAL)?.sessionId).toBe(SESSION);
  });
  it("erro do backend não vaza payload, SQL ou credencial na mensagem", async () => {
    const f = fixture();
    f.transport.mockResolvedValueOnce(json({ error: "SQL credential fixture.patient.example" }, 500));
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow("Não foi possível confirmar");
    expect(readWarleineAttempt(f.storage, USER, HOSPITAL)?.idempotencyKey).toBe(UUID);
  });
  it("registro local inválido/com payload não é apagado nem convertido em tentativa nova", async () => {
    const f = fixture();
    persistWarleineAttempt(f.storage, USER, HOSPITAL, { version: 1, idempotencyKey: UUID });
    const [key] = f.storage.map.keys();
    const bad = JSON.stringify({ version: 1, idempotencyKey: UUID, patient: "synthetic" });
    f.storage.map.set(key, bad);
    await expect(uploadWarleineInParts(f.opts)).rejects.toThrow("inválido");
    expect(f.storage.map.get(key)).toBe(bad);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("nega status desconhecido ou índices fora do total", async () => {
    const signal = new AbortController().signal;
    const transport = vi.fn(async () => json({ state: "completed", byteLength: 19, totalChunks: 1, uploadedIndices: [1] }));
    await expect(getWarleineUploadStatus(HOSPITAL, SESSION, signal, transport)).rejects.toThrow("não confirmado");
  });
  it("modal não usa desaparecimento de lotes como sucesso e bloqueia resposta de escopo atrasado", () => {
    const source = readFileSync(new URL("../components/bi/ImportarWarleineDialog.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("hadProcessingRef");
    expect(source).not.toContain("Enviar e Publicar Lote");
    expect(source).toContain("isWarleinePublished(status.jobStatus)");
    expect(source).toContain("current.current.userId !== captured.userId");
    expect(source).toContain("current.current.estabelecimentoId !== captured.estabelecimentoId");
    expect(source).toContain("getWarleineUploadStatus");
    expect(source).toContain("setConfirmarSubstituicao] = useState(false)");
  });
});
