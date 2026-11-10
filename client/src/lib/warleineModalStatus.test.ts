import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateIndex: 0, refIndex: 0,
  effects: [] as Array<() => void | (() => void)>, status: vi.fn(), success: vi.fn(), imported: vi.fn(),
  history: [] as Array<Record<string, unknown>>, late: undefined as undefined | ((v: unknown) => void),
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = h.stateIndex++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [h.states[index], (next: unknown) => { h.states[index] = typeof next === "function" ? (next as (v: unknown) => unknown)(h.states[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = h.refIndex++;
    if (!h.refs[index]) h.refs[index] = { current: initial };
    return h.refs[index];
  },
  useEffect: (run: () => void | (() => void)) => { h.effects.push(run); },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 701 } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { warleineFaturamento: { lotesRelatorio: { useQuery: () => ({ data: h.history, isFetching: false, isError: false, refetch: vi.fn(async () => ({})) }) } } } }));
vi.mock("@/lib/warleineUpload", async () => ({
  ...(await vi.importActual<typeof import("./warleineUpload")>("@/lib/warleineUpload")), getWarleineUploadStatus: h.status,
}));
vi.mock("sonner", () => ({ toast: { success: h.success, error: vi.fn(), info: vi.fn() } }));
import { ImportarWarleineDialog } from "../components/bi/ImportarWarleineDialog";
const sessionId = `321.${"a".repeat(48)}`;
const pending = { version: 1, idempotencyKey: "bb4a9e7b-6cb1-4a75-a8fa-205c4f133bb9", sessionId };
const stateFor = (jobStatus: string) => ({ state: "enfileirado", byteLength: 19, uploadedIndices: [0], totalChunks: 1, loteId: 911, jobStatus });
function render(hospital = 901, run = true) {
  h.stateIndex = 0; h.refIndex = 0; h.effects = [];
  ImportarWarleineDialog({ estabelecimentoId: hospital, estabelecimentoNome: "Hospital fictício", open: true, onOpenChange: vi.fn(), onImported: h.imported });
  return run ? h.effects.map(fn => fn()) : [];
}
async function settle() { for (let i = 0; i < 6; i += 1) await Promise.resolve(); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  h.states = [null, 0, false, false, 0, pending, null, null, true];
  h.refs = []; h.stateIndex = 0; h.refIndex = 0;
  h.effects = []; h.history = [{ id: 888, status: "publicado", competencias: [], arquivoNome: "other-fixture.csv", totalPublicadas: 0, totalLinhas: 0, valorFaturado: 0, valorTotalRecebido: 0 }];
  h.success.mockReset(); h.imported.mockReset(); h.status.mockReset();
  const store = new Map<string, string>([["safatle:warleine-upload:v1:u701:h901", JSON.stringify(pending)]]);
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); h.late = undefined; });
describe("Warleine — efeitos do modal com recibo por sessão", () => {
  it("estado erro do lote acompanhado nunca anuncia publicação, mesmo com outro lote publicado no histórico", async () => {
    h.status.mockResolvedValue(stateFor("erro"));
    const cleanup = render(); await settle();
    expect(h.status).toHaveBeenCalledWith(901, sessionId, expect.any(AbortSignal));
    expect(h.success).not.toHaveBeenCalled(); expect(h.imported).not.toHaveBeenCalled();
    cleanup.forEach(fn => { if (typeof fn === "function") fn(); });
  });
  it("só o status publicado da mesma sessão dispara callback de importação", async () => {
    h.status.mockResolvedValue(stateFor("publicado"));
    const cleanup = render(); await settle();
    expect(h.success).toHaveBeenCalledOnce(); expect(h.imported).toHaveBeenCalledOnce();
    expect(h.success.mock.calls[0][0]).toContain("#911");
    cleanup.forEach(fn => { if (typeof fn === "function") fn(); });
  });
  it.each(["enfileirado", "reservado", "processando", "validado"])("status %s ainda não confirma publicação", async status => {
    h.status.mockResolvedValue(stateFor(status));
    const cleanup = render(); await settle();
    expect(h.success).not.toHaveBeenCalled(); expect(h.imported).not.toHaveBeenCalled();
    cleanup.forEach(fn => { if (typeof fn === "function") fn(); });
  });
  it("falha de status e histórico vazio não se transformam em sucesso", async () => {
    h.history = [];
    h.status.mockRejectedValue(new Error("fixture transport failure"));
    const cleanup = render(); await settle();
    expect(h.success).not.toHaveBeenCalled(); expect(h.imported).not.toHaveBeenCalled();
    expect(h.states[7]).toContain("mesma tentativa");
    cleanup.forEach(fn => { if (typeof fn === "function") fn(); });
  });
  it("resposta antiga publicada é descartada ao trocar de hospital", async () => {
    h.status.mockImplementation(() => new Promise(resolve => { h.late = resolve; }));
    const cleanup = render();
    render(902, false); // updates the live identity before the old response resolves
    h.late?.(stateFor("publicado")); await settle();
    expect(h.success).not.toHaveBeenCalled(); expect(h.imported).not.toHaveBeenCalled();
    cleanup.forEach(fn => { if (typeof fn === "function") fn(); });
  });
});
