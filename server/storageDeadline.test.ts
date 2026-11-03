import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://synthetic.invalid", forgeApiKey: "synthetic-not-a-secret" } }));
import { storageGet, storagePut } from "./storage";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function stalledHeaders() {
  const aborted = vi.fn();
  const transport = vi.fn<typeof fetch>(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    signal.addEventListener("abort", () => { aborted(); reject(new Error("upstream synthetic capability must not escape")); }, { once: true });
  }));
  vi.stubGlobal("fetch", transport);
  return { transport, aborted };
}
function stalledBody() {
  const canceled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"url":"https://synthetic.invalid/')); }, cancel: canceled });
  const transport = vi.fn<typeof fetch>(async () => new Response(body));
  vi.stubGlobal("fetch", transport);
  return { canceled, transport };
}

describe("storage: cancelamento real sem rede", () => {
  it.each(["get", "put"] as const)("%s cancela headers travados com o sinal do chamador", async operation => {
    const f = stalledHeaders(); const client = new AbortController();
    const run = operation === "get" ? storageGet("synthetic-key", client.signal) : storagePut("synthetic-key", "synthetic", "application/json", client.signal);
    const result = expect(run).rejects.toThrow("Storage request aborted.");
    expect(f.transport.mock.calls[0][1]?.signal).toBe(client.signal);
    client.abort(); await result;
    expect(f.aborted).toHaveBeenCalledOnce();
  });
  it.each(["get", "put"] as const)("%s cancela response body parcial em vez de aguardar json para sempre", async operation => {
    const f = stalledBody(); const client = new AbortController();
    const run = operation === "get" ? storageGet("synthetic-key", client.signal) : storagePut("synthetic-key", "synthetic", "application/json", client.signal);
    const result = expect(run).rejects.toThrow("Storage request aborted.");
    await Promise.resolve(); await Promise.resolve();
    client.abort(); await result;
    expect(f.canceled).toHaveBeenCalledOnce();
  });
  it("aguarda o cancelamento original do body antes de rejeitar a operação", async () => {
    let release!: () => void; let cancelStarted!: () => void;
    const closed = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { cancelStarted = resolve; });
    const cancel = vi.fn(() => { cancelStarted(); return closed; });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{"url":')); }, cancel }))));
    const client = new AbortController(); let settled = false;
    const run = storageGet("synthetic-key", client.signal);
    void run.then(() => { settled = true; }, () => { settled = true; });
    const rejected = expect(run).rejects.toThrow("Storage request aborted.");
    await Promise.resolve(); await Promise.resolve();
    client.abort(); await started;
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    release(); await rejected;
    expect(cancel).toHaveBeenCalledOnce(); expect(settled).toBe(true);
  });
  it("default retrocompatível aborta fetch travado depois de 15 min", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const f = stalledHeaders(); const run = storageGet("synthetic-key");
    const rejected = expect(run).rejects.toThrow("Storage request aborted.");
    await vi.advanceTimersByTimeAsync(FIFTEEN_MINUTES - 1);
    expect(f.aborted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(f.aborted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("default cobre headers e body cumulativamente sem reiniciar timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cancel = vi.fn();
    const transport = vi.fn<typeof fetch>(async () => {
      await new Promise(resolve => setTimeout(resolve, FIFTEEN_MINUTES - 10));
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"url":')); }, cancel }));
    });
    vi.stubGlobal("fetch", transport);
    const rejected = expect(storageGet("synthetic-key")).rejects.toThrow("Storage request aborted.");
    await vi.advanceTimersByTimeAsync(FIFTEEN_MINUTES - 1);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("status HTTP inválido cancela body sem expor conteúdo upstream", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("synthetic-capability")); }, cancel }), { status: 503 })));
    await expect(storagePut("synthetic-key", "synthetic")).rejects.toThrow(/^Storage request failed\.$/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([{}, { url: "file:///synthetic-private" }, { url: "https://user:password@synthetic.invalid" }, { url: 123 }])("rejeita referência inválida sem expor valor: %j", async value => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(value)));
    await expect(storageGet("synthetic-key")).rejects.toThrow(/^Storage request failed\.$/);
  });
  it("consumidores antigos mantêm key/url e novos sinais já abortados não chamam fetch", async () => {
    const transport = vi.fn(async () => Response.json({ url: "https://synthetic.invalid/signed" }));
    vi.stubGlobal("fetch", transport);
    expect(await storageGet("/synthetic-key")).toEqual({ key: "synthetic-key", url: "https://synthetic.invalid/signed" });
    expect(await storagePut("/synthetic-key", "synthetic")).toEqual({ key: "synthetic-key", url: "https://synthetic.invalid/signed" });
    const client = new AbortController(); client.abort();
    await expect(storageGet("synthetic-key", client.signal)).rejects.toThrow("Storage request aborted.");
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
