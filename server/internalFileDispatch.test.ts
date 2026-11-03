import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getConvenioById: vi.fn(),
  getArquivoById: vi.fn(),
  findArquivoExistente: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  updateArquivoStatus: vi.fn(async (_id: number, _status: string) => {}),
  updateArquivoProgresso: vi.fn(async () => {}),
  createArquivo: vi.fn(async () => ({ id: 71 })),
  updateArquivo: vi.fn(async () => {}),
  getDb: vi.fn(),
  getRawPool: vi.fn(),
  storagePut: vi.fn(async () => ({ key: "sintetico", url: "https://arquivo.invalid/sintetico" })),
  execute: vi.fn(),
  update: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("./db", () => mocks);
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGet: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: {} }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(() => { throw new Error("LLM proibido no teste"); }) }));
vi.mock("./_core/env", () => ({ ENV: {} }));
vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
vi.mock("./connectors/WarleineConnector", () => ({ WarleineConnector: vi.fn(() => { throw new Error("Conector real proibido"); }) }));

import { appRouter } from "./routers";
import { initializeJobScheduler } from "./_core/jobScheduler";
import {
  assertInternalProcessingReady,
  dispatchInternalFileProcessing,
  INTERNAL_FILE_PROCESSING_TIMEOUT_MS,
  INTERNAL_DISPATCH_REVIEW_MARKER,
} from "./internalFileDispatch";

const secret = "segredo-sintetico-exclusivo-despacho-71";
const uploadInput = {
  nome: "sintetico.xlsx", tipoArquivo: "excel" as const, direcao: "retornado" as const,
  convenioId: 2, estabelecimentoId: 3, conteudo: Buffer.from("sintetico").toString("base64"),
};
const arquivo = {
  id: 71, nome: "sintetico.xlsx", tipoArquivo: "excel", direcao: "retornado",
  convenioId: 2, estabelecimentoId: 3, userId: 91,
  s3Key: "sintetico", s3Url: "https://arquivo.invalid/sintetico", itensProcessados: 0, totalItens: null,
};
function caller(role = "admin") {
  return appRouter.createCaller({
    user: { id: 91, openId: "sintetico", role },
    req: { protocol: "https", headers: {} }, res: {},
  } as TrpcContext);
}
const fetchMock = vi.fn<typeof fetch>();
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("PORT", "3000");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  mocks.getConvenioById.mockResolvedValue({ id: 2, estabelecimentoId: 3 });
  mocks.getArquivoById.mockResolvedValue({ ...arquivo });
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.findArquivoExistente.mockResolvedValue(null);
  mocks.getDb.mockResolvedValue(null);
  mocks.getRawPool.mockResolvedValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.updateArquivoStatus.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function expectZeroWrites() {
  for (const fn of [mocks.storagePut, mocks.createArquivo, mocks.updateArquivo,
    mocks.updateArquivoStatus, mocks.updateArquivoProgresso, mocks.update, mocks.execute]) {
    expect(fn).not.toHaveBeenCalled();
  }
  expect(fetchMock).not.toHaveBeenCalled();
}

describe("precondição real dos endpoints de processamento", () => {
  it.each([undefined, "", "x".repeat(31)])("upload novo e reimportação não escrevem com JWT inválido (%s)", async key => {
    vi.stubEnv("JWT_SECRET", key);
    for (const existing of [null, { ...arquivo }]) {
      mocks.findArquivoExistente.mockResolvedValue(existing);
      await expect(caller().arquivos.upload(uploadInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expectZeroWrites();
    }
  });
  it.each([undefined, "", "curto"])("reprocessar não marca processando sem JWT válido (%s)", async key => {
    vi.stubEnv("JWT_SECRET", key);
    await expect(caller().arquivos.reprocessar({ id: 71 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expectZeroWrites();
  });
  it("mantém a negação de acesso ao hospital antes de qualquer despacho", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(caller("user").arquivos.upload(uploadInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").arquivos.reprocessar({ id: 71 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectZeroWrites();
  });
  it("mantém a guarda do lote XML protegido", async () => {
    mocks.getArquivoById.mockResolvedValue({ ...arquivo, s3Key: "xml-importacao-protegido", s3Url: "" });
    await expect(caller().arquivos.reprocessar({ id: 71 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().arquivos.upload({ ...uploadInput, tipoArquivo: "xml", direcao: "enviado" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectZeroWrites();
  });
  it.each([403, 500])("HTTP %s preserva estado do worker no upload e reprocessamento", async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await caller().arquivos.upload(uploadInput);
    await flush();
    expect(mocks.updateArquivoStatus).toHaveBeenLastCalledWith(71, "processando");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "erro");
    mocks.updateArquivoStatus.mockClear();
    await caller().arquivos.reprocessar({ id: 71 });
    await flush();
    expect(mocks.updateArquivoStatus).toHaveBeenLastCalledWith(71, "processando");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "erro");
  });
  it("JWT válido delega upload e reimportação mantendo DTO sem segredo/storage e limpeza correta", async () => {
    const result = await caller().arquivos.upload(uploadInput);
    await flush();
    expect(result).toEqual({ id: 71, reimportado: false, processandoEmBackground: true });
    const request = fetchMock.mock.calls[0][1]!;
    expect(JSON.parse(String(request.body))).toEqual({ arquivoId: 71, secret, limparDadosAnteriores: false });
    expect(mocks.updateArquivoStatus).toHaveBeenLastCalledWith(71, "processando");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "processado");
    mocks.findArquivoExistente.mockResolvedValue({ ...arquivo });
    const reimport = await caller().arquivos.upload(uploadInput);
    await flush();
    expect(reimport.reimportado).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).limparDadosAnteriores).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("arquivo.invalid");
  });
  it("reprocessar aceito não declara conclusão e mantém o sinal de limpeza existente", async () => {
    const result = await caller().arquivos.reprocessar({ id: 71 });
    await flush();
    expect(result.success).toBe(true);
    expect(mocks.updateArquivoStatus).toHaveBeenLastCalledWith(71, "processando");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body)).limparDadosAnteriores).toBe(false);
    mocks.getArquivoById.mockResolvedValue({ ...arquivo, itensProcessados: 1 });
    await caller().arquivos.reprocessar({ id: 71 });
    await flush();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).limparDadosAnteriores).toBe(true);
  });
});

describe("download do endpoint legado de processamento Excel", () => {
  it.each([undefined, "curto"])("precondição inválida (%s) não baixa nem atualiza", async key => {
    vi.stubEnv("JWT_SECRET", key);
    await expect(caller().recebimentosExcel.importarExcel({ arquivoId: 71, estabelecimentoId: 3 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expectZeroWrites();
  });
  it.each([403, 500])("HTTP %s não é interpretado como planilha e marca erro", async status => {
    const response = new Response("conteudo privado", { status });
    const read = vi.spyOn(response, "arrayBuffer");
    fetchMock.mockResolvedValue(response);
    await expect(caller().recebimentosExcel.importarExcel({ arquivoId: 71, estabelecimentoId: 3 }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível baixar o arquivo para processamento." });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).toHaveBeenLastCalledWith(71, "erro");
    expect(mocks.updateArquivo).not.toHaveBeenCalled();
  });
});

describe("contrato do despacho interno limitado", () => {
  it.each([undefined, "", "x".repeat(31)])("valida helper antes de fetch e update (%s)", async key => {
    const env = { JWT_SECRET: key };
    expect(() => assertInternalProcessingReady(env)).toThrow("O processamento interno não está configurado.");
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 }, { env })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expectZeroWrites();
  });
  it("aceita exatamente 32 caracteres, sem chave alternativa", async () => {
    await dispatchInternalFileProcessing({ arquivoId: 71, skipContaConvenioSync: true }, { env: { JWT_SECRET: "x".repeat(32) } });
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body)).skipContaConvenioSync).toBe(true);
  });
  it.each([403, 500])("HTTP %s não lê corpo privado nem sobrescreve estado", async status => {
    const response = new Response("corpo privado", { status });
    const text = vi.spyOn(response, "text");
    fetchMock.mockResolvedValue(response);
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 })).rejects.toThrow("Resposta do processamento não confirmada.");
    expect(text).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO process_logs"), [71, INTERNAL_DISPATCH_REVIEW_MARKER]);
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });
  it("timeout aborta o HTTP sem declarar erro ou repetir processamento", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const pending = dispatchInternalFileProcessing({ arquivoId: 71 });
    const assertion = expect(pending).rejects.toThrow("Resposta do processamento não confirmada.");
    await vi.advanceTimersByTimeAsync(INTERNAL_FILE_PROCESSING_TIMEOUT_MS);
    await assertion;
    expect((fetchMock.mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true);
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["processado", "processando"])('resposta perdida após estado durável %s não sobrescreve a tentativa', async persistedState => {
    let state = persistedState;
    mocks.updateArquivoStatus.mockImplementation(async (_id, status) => { state = status; });
    fetchMock.mockRejectedValue(new Error("resposta perdida depois do commit"));
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 })).rejects.toThrow("Resposta do processamento não confirmada.");
    expect(state).toBe(persistedState);
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("sem evidência durável não chama HTTP nem muda status", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("falha privada"));
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
  });
  it("erro de rede não vaza texto privado nos logs nem no erro público", async () => {
    fetchMock.mockRejectedValue(new Error(`https://arquivo.invalid/privado ${secret} corpo-privado`));
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 })).rejects.toThrow("Resposta do processamento não confirmada.");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    const logs = JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(console.error).mock.calls]);
    for (const value of [secret, "arquivo.invalid", "corpo-privado"]) expect(logs).not.toContain(value);
  });

});

async function watchdogFixture(retryCount = 0) {
  const set = vi.fn(() => ({ where: vi.fn(async () => {}) }));
  mocks.update.mockReturnValue({ set });
  mocks.execute.mockResolvedValue([[{ cnt: retryCount }]]);
  mocks.getRawPool.mockResolvedValue({ execute: mocks.execute });
  const where = vi.fn()
    .mockResolvedValueOnce([])
    .mockReturnValue({ limit: vi.fn(async () => [{ id: 71, nome: "sintetico.xlsx", progresso: 5 }]) });
  mocks.getDb.mockResolvedValue({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    update: mocks.update,
  });
  await initializeJobScheduler();
  expect(mocks.schedule).toHaveBeenCalledOnce();
  return { tick: mocks.schedule.mock.calls[0][1] as () => Promise<void>, set, where };
}

describe("watchdog sem ativação real, somente callback cron mockado", () => {
  it.each([undefined, "curto"])("não grava retry/status nem consulta arquivos sem JWT válido (%s)", async key => {
    const { tick } = await watchdogFixture();
    mocks.getDb.mockClear();
    vi.stubEnv("JWT_SECRET", key);
    await tick();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expectZeroWrites();
  });
  it.each([403, 500])("retry HTTP %s não sobrescreve o worker com erro", async status => {
    const { tick, set } = await watchdogFixture();
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await tick();
    await flush();
    expect(set).toHaveBeenCalledWith({ status: "processando", progresso: 5 });
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });
  it("retry válido aceito mantém processando sob responsabilidade do worker", async () => {
    const { tick, set } = await watchdogFixture();
    await tick();
    await flush();
    expect(set).toHaveBeenLastCalledWith({ status: "processando", progresso: 5 });
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("o seletor do watchdog exclui marca de reconciliação antes do replay", async () => {
    const { tick, where } = await watchdogFixture();
    await tick(); await flush();
    const { MySqlDialect } = await import("drizzle-orm/mysql-core");
    const predicate = new MySqlDialect().sqlToQuery(where.mock.calls[1][0]);
    expect(predicate.sql).toContain("NOT EXISTS");
    expect(predicate.sql).toContain("process_logs");
    expect(predicate.params).toContain(INTERNAL_DISPATCH_REVIEW_MARKER);
  });
  it("preserva o limite de três tentativas sem novo despacho", async () => {
    const { tick, set } = await watchdogFixture(3);
    await tick();
    expect(set).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ status: "erro", progresso: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
