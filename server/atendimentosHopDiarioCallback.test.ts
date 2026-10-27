import { beforeEach, describe, expect, it, vi } from "vitest";
const fns = vi.hoisted(() => ({ authenticate: vi.fn(), execute: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: fns.authenticate } }));
vi.mock("./atendimentosHopDiarioService", () => ({ executarAtendimentosHopDiarioPorTaskUid: fns.execute }));
import { atendimentosHopDiarioCallback } from "./atendimentosHopDiarioCallback";
function response() { const json = vi.fn(); const status = vi.fn(() => ({ json })); return { status, json } as any; }
describe("atendimentosHopDiarioCallback", () => {
  beforeEach(() => { vi.resetAllMocks(); fns.authenticate.mockResolvedValue({ id: -1, isCron: true, taskUid: "task-private" }); fns.execute.mockResolvedValue({ status: "ignorado" }); });
  it("rejeita não-cron antes de acessar o serviço", async () => {
    fns.authenticate.mockResolvedValue({ id: 9, isCron: false }); const res = response();
    await atendimentosHopDiarioCallback({ body: { taskUid: "forged" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403); expect(fns.execute).not.toHaveBeenCalled();
  });
  it("ignora body forjado e usa exclusivamente task UID autenticado", async () => {
    const res = response(); await atendimentosHopDiarioCallback({ body: { taskUid: "forged", estabelecimentoId: 999, loteRef: "x" } } as any, res);
    expect(fns.execute).toHaveBeenCalledWith("task-private"); expect(res.json).toHaveBeenCalledWith({});
  });
  it("sanitiza falhas sem SQL, credencial ou PHI", async () => {
    fns.execute.mockRejectedValue(new Error("SELECT senha, paciente FROM internal")); const res = response();
    await atendimentosHopDiarioCallback({} as any, res); const payload = res.json.mock.calls[0]![0];
    expect(res.status).toHaveBeenCalledWith(500); expect(payload).toMatchObject({ codigo: "SNAPSHOT_INDISPONIVEL", taskUid: "task-private" });
    expect(JSON.stringify(payload)).not.toMatch(/SELECT|senha|paciente|internal/i);
  });
});
