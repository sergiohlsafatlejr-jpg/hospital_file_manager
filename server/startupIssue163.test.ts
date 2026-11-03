import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRawPool: vi.fn(),
  execute: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("./db", () => ({ getRawPool: mocks.getRawPool }));

import {
  assertInternalProcessingReady,
  dispatchInternalFileProcessing,
  INTERNAL_DISPATCH_REVIEW_MARKER,
} from "./internalFileDispatch";

// Nunca importar _core/index: inspeção sintática não abre porta nem inicializa jobs.
const startupSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const startup = ts.createSourceFile("index.ts", startupSource, ts.ScriptTarget.Latest, true);
const schedulerSource = readFileSync(new URL("./_core/jobScheduler.ts", import.meta.url), "utf8");
const syntheticSecret = "issue163-synthetic-only-dispatch-secret-2026";

function nodesMatching(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = [];
  function visit(node: ts.Node): void {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(startup);
  return matches;
}

function callsNamed(name: string): ts.Node[] {
  return nodesMatching(node => ts.isCallExpression(node) && node.expression.getText(startup) === name);
}

function registeredArgument(name: string): boolean {
  return nodesMatching(node => ts.isCallExpression(node) && node.arguments.some(arg =>
    ts.isIdentifier(arg) && arg.text === name
  )).length > 0;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("JWT_SECRET", syntheticSecret);
  vi.stubEnv("PORT", "3000");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.getRawPool.mockResolvedValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Issue163 — bootstrap sem reparos ou replay implícitos", () => {
  it("remove integralmente as duas rotinas introduzidas na Etapa 3", () => {
    const identifiers = nodesMatching(ts.isIdentifier).map(node => (node as ts.Identifier).text);
    expect(identifiers).not.toContain("ensureInternalProcessingInfrastructure");
    expect(identifiers).not.toContain("resumeStuckInitialUploads");
  });

  it("não executa DDL, UPDATE global de convênios ou DELETE de evidência", () => {
    const literals = nodesMatching(node => ts.isStringLiteralLike(node))
      .map(node => (node as ts.StringLiteralLike).text);
    for (const value of literals) {
      expect(value).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|INDEX)\b/i);
      expect(value).not.toMatch(/\bUPDATE\s+convenios\b/i);
      expect(value).not.toMatch(/\bDELETE\s+FROM\s+process_logs\b/i);
      expect(value).not.toMatch(/\bSELECT\b.*\bFROM\s+arquivos\b/is);
    }
    const imports = nodesMatching(ts.isImportDeclaration)
      .map(node => (node as ts.ImportDeclaration).moduleSpecifier.getText(startup));
    expect(imports).not.toContain('"../db"');
    expect(callsNamed("pool.execute")).toHaveLength(0);
  });

  it("não dispara processamento, timer de retomada ou cron próprio no bootstrap", () => {
    for (const call of ["dispatchInternalFileProcessing", "setTimeout", "setInterval", "cron.schedule"]) {
      expect(callsNamed(call)).toHaveLength(0);
    }
    const imports = nodesMatching(ts.isImportDeclaration)
      .map(node => (node as ts.ImportDeclaration).moduleSpecifier.getText(startup));
    expect(imports).not.toContain('"../internalFileDispatch"');
  });

  it("não deriva, sobrescreve nem captura JWT de Forge, banco ou aleatoriedade", () => {
    const identifiers = nodesMatching(ts.isIdentifier).map(node => (node as ts.Identifier).text);
    for (const name of ["JWT_SECRET", "BUILT_IN_FORGE_API_KEY", "DATABASE_URL", "createHash", "randomBytes"]) {
      expect(identifiers).not.toContain(name);
    }
    // A única atribuição de ambiente preexistente é a porta efetivamente escolhida.
    const assignments = nodesMatching(node => ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(startup).startsWith("process.env")
    ).map(node => (node as ts.BinaryExpression).left.getText(startup));
    expect(assignments).toEqual(["process.env.PORT"]);
  });

  it("preserva uma inicialização de cada worker e o scheduler que instala o watchdog", () => {
    for (const call of ["initializeJobScheduler", "initializeWarleineImportWorker", "initializeXmlImportacaoLoteWorker"]) {
      expect(callsNamed(call)).toHaveLength(1);
    }
    expect(schedulerSource).toContain("initializeFileWatchdog();");
    expect(schedulerSource).toContain("NOT EXISTS (SELECT 1 FROM process_logs dispatch_log");
    expect(schedulerSource).toContain("INTERNAL_DISPATCH_REVIEW_MARKER");
  });

  it.each([
    "registerOAuthRoutes", "registrarUploadProntuarioPdf", "registrarDownloadProntuarioPdf",
  ])("preserva o registrador preexistente %s", name => {
    expect(callsNamed(name)).toHaveLength(1);
  });

  it.each([
    "fileProcessorRouter", "uploadMultipartRouter", "xmlImportacaoLoteUploadRouter",
    "easyLocalAgendamentoHandler", "atendimentosHopDiarioCallback", "atendimentosHopProdutorRouter",
  ])("preserva a rota preexistente %s", name => {
    expect(registeredArgument(name)).toBe(true);
  });

  it("preserva tRPC, assets e listen sem guarda global indevida", () => {
    for (const call of ["createExpressMiddleware", "setupVite", "serveStatic"]) {
      expect(callsNamed(call)).toHaveLength(1);
    }
    // Um listen pertence à sondagem de porta; o outro, ao servidor HTTP.
    expect(callsNamed("server.listen")).toHaveLength(2);
    expect(startupSource).toContain("router: appRouter");
    expect(startupSource).toContain("createContext,");
    expect(callsNamed("assertInternalProcessingReady")).toHaveLength(0);
  });
});

describe("Issue163 — JWT explícito e fail-closed sem alterar a configuração", () => {
  it.each([undefined, "", "curto", "x".repeat(31)])("recusa configuração inválida (%s) sem banco ou rede", async key => {
    const env = Object.freeze({ JWT_SECRET: key });
    expect(() => assertInternalProcessingReady(env)).toThrow("O processamento interno não está configurado.");
    await expect(dispatchInternalFileProcessing({ arquivoId: 163 }, { env }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(env.JWT_SECRET).toBe(key);
    expect(mocks.getRawPool).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("não infere segredo de Forge nem usa o JWT do processo no lugar de configuração explícita inválida", async () => {
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-synthetic-not-a-jwt-secret-for-issue163");
    const env = Object.freeze({ JWT_SECRET: "curto" });
    await expect(dispatchInternalFileProcessing({ arquivoId: 163 }, { env }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(process.env.JWT_SECRET).toBe(syntheticSecret);
    expect(process.env.DATABASE_URL).toBe("");
    expect(mocks.getRawPool).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sem JWT no processo falha fechado mesmo com Forge sintético configurado", async () => {
    vi.stubEnv("JWT_SECRET", undefined);
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-synthetic-not-a-jwt-secret-for-issue163");
    await expect(dispatchInternalFileProcessing({ arquivoId: 163 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(process.env.JWT_SECRET).toBeUndefined();
    expect(mocks.getRawPool).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("mantém o contrato existente de no mínimo 32 caracteres sem mutar o objeto", () => {
    const env = Object.freeze({ JWT_SECRET: "x".repeat(32) });
    expect(() => assertInternalProcessingReady(env)).not.toThrow();
    expect(env.JWT_SECRET).toBe("x".repeat(32));
    expect(process.env.JWT_SECRET).toBe(syntheticSecret);
    expect(mocks.getRawPool).not.toHaveBeenCalled();
  });
});

describe("Issue163 — infraestrutura ausente não cria tabela nem emite despacho", () => {
  it("sem pool recusa o despacho sem HTTP", async () => {
    mocks.getRawPool.mockResolvedValue(null);
    await expect(dispatchInternalFileProcessing({ arquivoId: 163 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_TABLEACCESS_DENIED_ERROR"])(
    "falha simulada %s conserva evidência e não tenta reparar estrutura", async code => {
      mocks.execute.mockRejectedValue(Object.assign(new Error("synthetic-infrastructure-failure"), { code }));
      await expect(dispatchInternalFileProcessing({ arquivoId: 163 }))
        .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(mocks.execute).toHaveBeenCalledOnce();
      expect(mocks.execute).toHaveBeenCalledWith(
        "INSERT INTO process_logs (arquivo_id, level, message) VALUES (?, 'info', ?)",
        [163, INTERNAL_DISPATCH_REVIEW_MARKER]
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it("somente evidência persistida autoriza HTTP, mantendo assinatura e marcador da PR158", async () => {
    await dispatchInternalFileProcessing({ arquivoId: 163 });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith(
      "INSERT INTO process_logs (arquivo_id, level, message) VALUES (?, 'info', ?)",
      [163, INTERNAL_DISPATCH_REVIEW_MARKER]
    );
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
    expect(process.env.JWT_SECRET).toBe(syntheticSecret);
  });

  it("resposta perdida exige reconciliação, sem replay ou exclusão de logs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.fetch.mockRejectedValue(new Error("synthetic-lost-response"));
    await expect(dispatchInternalFileProcessing({ arquivoId: 163 }))
      .rejects.toThrow("Resposta do processamento não confirmada.");
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][0]).toMatch(/^INSERT INTO process_logs /);
  });
});
