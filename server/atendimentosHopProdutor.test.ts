import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const fns = vi.hoisted(() => ({ iniciar: vi.fn(), concluir: vi.fn(), falhar: vi.fn() }));
vi.mock("./atendimentosHopDiarioService", () => ({
  iniciarLoteAtendimentosHopProdutor: fns.iniciar,
  concluirLoteAtendimentosHopProdutor: fns.concluir,
  falharLoteAtendimentosHopProdutor: fns.falhar,
}));
import { atendimentosHopProdutorConcluir, atendimentosHopProdutorFalhar, atendimentosHopProdutorIniciar } from "./atendimentosHopProdutor";
const token = "a".repeat(43);
function response() { const json = vi.fn(); const status = vi.fn(() => ({ json })); return { status, json } as any; }
describe("REST produtor Hop", () => {
  beforeEach(() => { vi.resetAllMocks(); fns.iniciar.mockResolvedValue({ estado: "carregando" }); fns.concluir.mockResolvedValue({ estado: "completo" }); fns.falhar.mockResolvedValue({ estado: "falhou" }); });
  it("exige Bearer de formato 256-bit e não aceita unidade pelo body", async () => {
    const absent = response(); await atendimentosHopProdutorIniciar({ header: () => undefined, body: {} } as any, absent);
    expect(absent.status).toHaveBeenCalledWith(401); expect(fns.iniciar).not.toHaveBeenCalled();
    const res = response(); const body = { loteRef: "00000000-0000-4000-8000-000000000001", estabelecimentoId: 999, tabela: "atendimentos_unificados" };
    await atendimentosHopProdutorIniciar({ header: () => `Bearer ${token}`, body } as any, res);
    expect(fns.iniciar).toHaveBeenCalledWith(token, body); expect(res.json).toHaveBeenCalledWith({ estado: "carregando" });
  });
  it("não vaza erro de serviço, token, SQL ou dados clínicos", async () => {
    fns.concluir.mockRejectedValue(new TRPCError({ code: "CONFLICT", message: "SELECT paciente senha" }));
    const res = response(); await atendimentosHopProdutorConcluir({ header: () => `Bearer ${token}`, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(409); const payload = res.json.mock.calls[0]![0];
    expect(payload).toEqual({ codigo: "OPERACAO_REQUER_CONFERENCIA" }); expect(JSON.stringify(payload)).not.toMatch(/SELECT|paciente|senha|a{43}/);
  });
  it("encaminha /falhar somente com Bearer e mantém a resposta agregada", async () => {
    const absent = response(); await atendimentosHopProdutorFalhar({ header: () => undefined, body: {} } as any, absent);
    expect(absent.status).toHaveBeenCalledWith(401); expect(fns.falhar).not.toHaveBeenCalled();
    const res = response(); const body = { loteRef: "00000000-0000-4000-8000-000000000001" };
    await atendimentosHopProdutorFalhar({ header: () => `Bearer ${token}`, body } as any, res);
    expect(fns.falhar).toHaveBeenCalledWith(token, body); expect(res.json).toHaveBeenCalledWith({ estado: "falhou" });
  });
});
