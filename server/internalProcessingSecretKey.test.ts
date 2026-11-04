import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Todas as chaves e identidades deste arquivo são fixtures sintéticas.
// Não importar entrypoint, appRouter, scheduler, storage nem conexões reais.
const mocks = vi.hoisted(() => ({
  getRawPool: vi.fn(),
  getDb: vi.fn(),
  getArquivoById: vi.fn(),
  execute: vi.fn(),
  updateArquivoStatus: vi.fn(),
  updateArquivoProgresso: vi.fn(),
  updateArquivo: vi.fn(),
  createArquivo: vi.fn(),
  deleteArquivo: vi.fn(),
  deleteFaturamentoTissByArquivo: vi.fn(),
  deleteRecebimentoTissByArquivo: vi.fn(),
  deleteRecebimentosExcelByArquivo: vi.fn(),
  deleteDemonstrativoByArquivo: vi.fn(),
  insertRecebimentosExcelBatch: vi.fn(),
  replaceFaturamentoTissByArquivo: vi.fn(),
  parseFile: vi.fn(),
  mapTipoDespesaParaTipoItem: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./parsers", () => ({ parseFile: mocks.parseFile }));
vi.mock("./routers", () => ({
  mapTipoDespesaParaTipoItem: mocks.mapTipoDespesaParaTipoItem,
}));

import {
  assertInternalProcessingReady,
  dispatchInternalFileProcessing,
  INTERNAL_DISPATCH_REVIEW_MARKER,
  InternalFileDispatchUncertainError,
  resolveInternalProcessingSecret,
} from "./internalFileDispatch";
import { fileProcessorRouter } from "./fileProcessor";
import {
  GLOSA_MANUAL_NO_ORIGINAL_MESSAGE,
  GLOSA_MANUAL_ORIGIN_PREFIX,
} from "../shared/glosaManualOrigin";

type TestEnv = {
  INTERNAL_PROCESSING_SECRET_KEY?: string;
  JWT_SECRET?: string;
  PORT?: string;
};

const dedicatedKey = "aB09".repeat(16);
const otherDedicatedKey = "cD12".repeat(16);
const legacyJwt = "synthetic-legacy-jwt-only-".repeat(3);
const boundaryJwt = "s".repeat(32);
const invalidDedicated = [
  { label: "vazia", key: "" },
  { label: "31 caracteres", key: "a".repeat(31) },
  { label: "64 caracteres não hexadecimais", key: "g".repeat(64) },
  { label: "63 caracteres hexadecimais", key: "a".repeat(63) },
  { label: "65 caracteres hexadecimais", key: "a".repeat(65) },
  { label: "quebra de linha após 64 hexadecimais", key: `${dedicatedKey}\n` },
];
const fetchMock = vi.fn<typeof fetch>();
const dbMockNames = [
  "getRawPool", "getDb", "getArquivoById", "execute",
  "updateArquivoStatus", "updateArquivoProgresso", "updateArquivo",
  "createArquivo", "deleteArquivo", "deleteFaturamentoTissByArquivo",
  "deleteRecebimentoTissByArquivo", "deleteRecebimentosExcelByArquivo",
  "deleteDemonstrativoByArquivo", "insertRecebimentosExcelBatch",
  "replaceFaturamentoTissByArquivo",
] as const;
const writeMockNames = dbMockNames.filter(name =>
  !["getRawPool", "getDb", "getArquivoById", "execute"].includes(name)
);

// Invocar o callback da rota Express real, sem abrir socket ou iniciar servidor.
const handler = (fileProcessorRouter as any).stack.find(
  (layer: any) => layer.route?.path === "/api/internal/process-file"
).route.stack[0].handle;

function response() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function stubConfig(env: TestEnv) {
  vi.stubEnv("INTERNAL_PROCESSING_SECRET_KEY", env.INTERNAL_PROCESSING_SECRET_KEY);
  vi.stubEnv("JWT_SECRET", env.JWT_SECRET);
  vi.stubEnv("PORT", env.PORT ?? "3999");
}

function currentConfig(): TestEnv {
  return {
    INTERNAL_PROCESSING_SECRET_KEY: process.env.INTERNAL_PROCESSING_SECRET_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    PORT: process.env.PORT,
  };
}

function expectNoWorkerWrites() {
  for (const name of writeMockNames) expect(mocks[name]).not.toHaveBeenCalled();
  expect(mocks.parseFile).not.toHaveBeenCalled();
  expect(mocks.mapTipoDespesaParaTipoItem).not.toHaveBeenCalled();
}

function expectNoIo() {
  for (const name of dbMockNames) expect(mocks[name]).not.toHaveBeenCalled();
  expectNoWorkerWrites();
  expect(fetchMock).not.toHaveBeenCalled();
}

async function invokeRoute(body: Record<string, unknown>) {
  const res = response();
  await handler({ body }, res);
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "");
  stubConfig({ JWT_SECRET: legacyJwt });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  mocks.getRawPool.mockResolvedValue({ execute: mocks.execute });
  mocks.getDb.mockResolvedValue(null);
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("resolver da chave dedicada do processamento interno", () => {
  it.each([
    { label: "JWT ausente", JWT_SECRET: undefined },
    { label: "JWT curto", JWT_SECRET: "curto" },
    { label: "JWT com 31 caracteres", JWT_SECRET: "s".repeat(31) },
    { label: "JWT forte", JWT_SECRET: legacyJwt },
  ])("prioriza 64 hexadecimais válidos com $label, sem derivar ou normalizar", ({ JWT_SECRET }) => {
    const env = Object.freeze({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET });
    expect(resolveInternalProcessingSecret(env)).toBe(dedicatedKey);
    expect(() => assertInternalProcessingReady(env)).not.toThrow();
    expectNoIo();
  });

  it.each([
    { label: "hexadecimal minúsculo", key: "ab09".repeat(16) },
    { label: "hexadecimal maiúsculo", key: "AB09".repeat(16) },
  ])("aceita $label e retorna exatamente o valor configurado", ({ key }) => {
    expect(resolveInternalProcessingSecret({ INTERNAL_PROCESSING_SECRET_KEY: key })).toBe(key);
    expectNoIo();
  });

  it.each([
    { label: "propriedade ausente", env: { JWT_SECRET: boundaryJwt } },
    { label: "propriedade undefined", env: { INTERNAL_PROCESSING_SECRET_KEY: undefined, JWT_SECRET: boundaryJwt } },
    { label: "JWT maior que 32", env: { JWT_SECRET: legacyJwt } },
  ])("usa somente o JWT legado com dedicada ausente: $label", ({ env }) => {
    expect(resolveInternalProcessingSecret(env)).toBe(env.JWT_SECRET);
    expect(() => assertInternalProcessingReady(env)).not.toThrow();
    expectNoIo();
  });

  it.each([
    { label: "JWT ausente", JWT_SECRET: undefined },
    { label: "JWT vazio", JWT_SECRET: "" },
    { label: "JWT com 31 caracteres", JWT_SECRET: "s".repeat(31) },
  ])("sem dedicada falha fechado com $label", ({ JWT_SECRET }) => {
    const env = { JWT_SECRET };
    expect(() => resolveInternalProcessingSecret(env)).toThrow();
    expect(() => assertInternalProcessingReady(env)).toThrow();
    expectNoIo();
  });

  it.each(invalidDedicated)("dedicada $label bloqueia o fallback mesmo com JWT forte", ({ key }) => {
    const env = Object.freeze({ INTERNAL_PROCESSING_SECRET_KEY: key, JWT_SECRET: legacyJwt });
    expect(() => resolveInternalProcessingSecret(env)).toThrow();
    expect(() => assertInternalProcessingReady(env)).toThrow();
    expect(env.INTERNAL_PROCESSING_SECRET_KEY).toBe(key);
    expect(env.JWT_SECRET).toBe(legacyJwt);
    expectNoIo();
  });

  it("não altera o objeto env, não consulta o ambiente global no fallback explícito e não gera chaves", () => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: otherDedicatedKey, JWT_SECRET: legacyJwt });
    const before = currentConfig();
    const env = Object.freeze({ JWT_SECRET: boundaryJwt, PORT: "3998" });
    expect(resolveInternalProcessingSecret(env)).toBe(boundaryJwt);
    assertInternalProcessingReady(env);
    expect(env).toEqual({ JWT_SECRET: boundaryJwt, PORT: "3998" });
    expect(Object.keys(env)).toEqual(["JWT_SECRET", "PORT"]);
    expect(currentConfig()).toEqual(before);
    expectNoIo();
  });

  it("o argumento padrão lê process.env sem mutá-lo nem substituir JWT_SECRET", () => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: "curto" });
    const before = currentConfig();
    expect(resolveInternalProcessingSecret()).toBe(dedicatedKey);
    assertInternalProcessingReady();
    expect(currentConfig()).toEqual(before);
    expectNoIo();
  });
});

describe("dispatch usa o segredo resolvido antes de qualquer evidência ou HTTP", () => {
  it.each([
    { label: "JWT forte", JWT_SECRET: legacyJwt },
    { label: "JWT curto", JWT_SECRET: "curto" },
  ])("serializa a dedicada intacta com $label e grava a marca antes do fetch", async ({ JWT_SECRET }) => {
    const env = Object.freeze({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET, PORT: "3999" });
    const before = { ...env };
    await dispatchInternalFileProcessing(
      { arquivoId: 71, skipContaConvenioSync: true, limparDadosAnteriores: false },
      { env, fetch: fetchMock }
    );
    expect(env).toEqual(before);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3999/api/internal/process-file");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      arquivoId: 71, secret: dedicatedKey, skipContaConvenioSync: true, limparDadosAnteriores: false,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO process_logs"), [71, INTERNAL_DISPATCH_REVIEW_MARKER]
    );
    expect(mocks.getRawPool.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]);
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expectNoWorkerWrites();
    expect(mocks.getArquivoById).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fixa o valor retornado pelo resolver antes do await, sem reler o env no JSON", async () => {
    const env = { INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: legacyJwt };
    // Simular alteração externa durante o I/O, não alteração feita pelo dispatch.
    mocks.execute.mockImplementationOnce(async () => {
      env.INTERNAL_PROCESSING_SECRET_KEY = otherDedicatedKey;
      env.JWT_SECRET = boundaryJwt;
      return [{ affectedRows: 1 }];
    });
    await dispatchInternalFileProcessing({ arquivoId: 71 }, { env, fetch: fetchMock });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).secret).toBe(dedicatedKey);
    expectNoWorkerWrites();
  });

  it("dispatch sem options.env usa a dedicada de process.env sem mutação", async () => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: legacyJwt });
    const before = currentConfig();
    await dispatchInternalFileProcessing({ arquivoId: 71 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ arquivoId: 71, secret: dedicatedKey });
    expect(currentConfig()).toEqual(before);
    expectNoWorkerWrites();
  });

  it("preserva o fallback JWT de exatamente 32 caracteres quando a dedicada está ausente", async () => {
    await dispatchInternalFileProcessing({ arquivoId: 71 }, { env: { JWT_SECRET: boundaryJwt }, fetch: fetchMock });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ arquivoId: 71, secret: boundaryJwt });
    expectNoWorkerWrites();
  });

  it.each(invalidDedicated)("dedicada $label rejeita antes de todo DB, status e fetch", async ({ key }) => {
    await expect(dispatchInternalFileProcessing({ arquivoId: 71 }, {
      env: { INTERNAL_PROCESSING_SECRET_KEY: key, JWT_SECRET: legacyJwt }, fetch: fetchMock,
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expectNoIo();
  });
});

describe("autenticação do handler real /api/internal/process-file", () => {
  it.each([
    { label: "JWT forte", JWT_SECRET: legacyJwt },
    { label: "JWT curto", JWT_SECRET: "curto" },
  ])("dedicada correta com $label alcança a validação de arquivoId (400)", async ({ JWT_SECRET }) => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET });
    const res = await invokeRoute({ secret: dedicatedKey });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "arquivoId is required" });
    expectNoIo();
  });

  it.each([
    { label: "chave errada", secret: otherDedicatedKey },
    { label: "JWT legado forte", secret: legacyJwt },
    { label: "chave com casing alterado", secret: dedicatedKey.toLowerCase() },
    { label: "segredo ausente", secret: undefined },
  ])("dedicada configurada rejeita $label com 403 antes de todo I/O", async ({ secret }) => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: legacyJwt });
    const res = await invokeRoute({ arquivoId: 71, secret });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expectNoIo();
  });

  it.each(invalidDedicated)("configuração dedicada $label rejeita inclusive JWT forte antes de todo I/O", async ({ key }) => {
    stubConfig({ INTERNAL_PROCESSING_SECRET_KEY: key, JWT_SECRET: legacyJwt });
    for (const secret of [key, legacyJwt]) {
      const res = await invokeRoute({ arquivoId: 71, secret });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
      expectNoIo();
    }
  });

  it.each([
    { label: "limite de 32 caracteres", JWT_SECRET: boundaryJwt },
    { label: "mais de 32 caracteres", JWT_SECRET: legacyJwt },
  ])("dedicada ausente aceita fallback JWT no $label e retorna 400 sem arquivoId", async ({ JWT_SECRET }) => {
    stubConfig({ JWT_SECRET });
    const res = await invokeRoute({ secret: JWT_SECRET });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "arquivoId is required" });
    expectNoIo();
  });

  it.each([
    { label: "ausente", JWT_SECRET: undefined },
    { label: "vazio", JWT_SECRET: "" },
    { label: "31 caracteres", JWT_SECRET: "s".repeat(31) },
  ])("sem dedicada e JWT $label retorna 403 antes de todo I/O", async ({ JWT_SECRET }) => {
    stubConfig({ JWT_SECRET });
    const res = await invokeRoute({ arquivoId: 71, secret: JWT_SECRET });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expectNoIo();
  });

  it("fallback JWT não aceita um segredo diferente e autentica antes de validar arquivoId", async () => {
    stubConfig({ JWT_SECRET: boundaryJwt });
    const res = await invokeRoute({ secret: dedicatedKey });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expectNoIo();
  });
});

describe("integração sem HTTP real: dispatch para o handler autenticado", () => {
  it.each([
    { label: "dedicada prioritária", env: { INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: legacyJwt }, secret: dedicatedKey },
    { label: "dedicada com JWT curto", env: { INTERNAL_PROCESSING_SECRET_KEY: dedicatedKey, JWT_SECRET: "curto" }, secret: dedicatedKey },
    { label: "fallback JWT de 32 caracteres", env: { JWT_SECRET: boundaryJwt }, secret: boundaryJwt },
  ])("$label alcança a âncora manual (409), sem writes do worker e sem declarar erro terminal", async ({ env, secret }) => {
    stubConfig(env);
    const before = currentConfig();
    mocks.getArquivoById.mockResolvedValue({
      id: 71,
      nome: `${GLOSA_MANUAL_ORIGIN_PREFIX}${"a".repeat(64)}:${"b".repeat(64)}:2026-11-03`,
      status: "processado", s3Key: "", s3Url: "",
    });
    const res = response();
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      await handler({ body: JSON.parse(String(init?.body)) }, res);
      return new Response(null, { status: res.status.mock.calls[0]?.[0] ?? 200 });
    });

    await expect(dispatchInternalFileProcessing({ arquivoId: 71 }, { fetch: transport }))
      .rejects.toBeInstanceOf(InternalFileDispatchUncertainError);

    expect(transport).toHaveBeenCalledOnce();
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ arquivoId: 71, secret });
    expect(res.status).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    expect(mocks.getArquivoById).toHaveBeenCalledOnce();
    expect(mocks.getArquivoById).toHaveBeenCalledWith(71);
    expect(mocks.getRawPool).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO process_logs"), [71, INTERNAL_DISPATCH_REVIEW_MARKER]
    );
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(transport.mock.invocationCallOrder[0]);
    expect(transport.mock.invocationCallOrder[0]).toBeLessThan(mocks.getArquivoById.mock.invocationCallOrder[0]);
    expectNoWorkerWrites();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentConfig()).toEqual(before);
    const logs = JSON.stringify([
      vi.mocked(console.log).mock.calls,
      vi.mocked(console.warn).mock.calls,
      vi.mocked(console.error).mock.calls,
    ]);
    for (const key of [dedicatedKey, legacyJwt, boundaryJwt]) expect(logs).not.toContain(key);
  });
});
