import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({ authenticate: vi.fn(), execute: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: fns.authenticate } }));
vi.mock("./easyLocalAgendamentoService", () => ({
  executarEasyLocalAgendamentoPorTaskUid: fns.execute,
}));

import { easyLocalAgendamentoHandler } from "./easyLocalAgendamentoCallback";

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as any;
}

describe("easyLocalAgendamentoHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fns.authenticate.mockResolvedValue({ id: -1, isCron: true, taskUid: "task-real" });
    fns.execute.mockResolvedValue({ status: "ignorado" });
  });

  it("recusa qualquer chamador não cron", async () => {
    fns.authenticate.mockResolvedValue({ id: 3, isCron: false });
    const res = response();
    await easyLocalAgendamentoHandler({ body: { taskUid: "forged" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fns.execute).not.toHaveBeenCalled();
  });

  it("ignora task, unidade e leitura forjados no body", async () => {
    const res = response();
    await easyLocalAgendamentoHandler(
      { body: { taskUid: "forged", estabelecimentoId: 999, leituraId: 123 } } as any,
      res
    );
    expect(fns.execute).toHaveBeenCalledWith("task-real");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it("expõe no máximo as contagens públicas da execução", async () => {
    fns.execute.mockResolvedValue({
      status: "executado",
      counts: { registrosLidos: 8, registrosInseridos: 2, registrosAtualizados: 3, registrosInalterados: 3 },
    });
    const res = response();
    await easyLocalAgendamentoHandler({ body: { segredo: "nunca" } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      registrosLidos: 8,
      registrosInseridos: 2,
      registrosAtualizados: 3,
      registrosInalterados: 3,
    });
  });

  it("sanitiza exceções sem stack, SQL ou dados da origem", async () => {
    fns.execute.mockRejectedValue(new Error("SELECT senha FROM pacientes at db.internal"));
    const res = response();
    await easyLocalAgendamentoHandler({} as any, res);
    const payload = res.json.mock.calls[0]![0] as Record<string, unknown>;
    expect(res.status).toHaveBeenCalledWith(500);
    expect(payload).toMatchObject({ codigo: "AGENDAMENTO_INDISPONIVEL", taskUid: "task-real" });
    expect(JSON.stringify(payload)).not.toMatch(/SELECT|senha|pacientes|internal/i);
  });
});
