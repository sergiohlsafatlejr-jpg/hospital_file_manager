import { readFileSync } from "node:fs";
import ts from "typescript";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import * as drizzle from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLOSA_MANUAL_NO_ORIGINAL_MESSAGE,
  GLOSA_MANUAL_ORIGIN_LABEL,
  GLOSA_MANUAL_ORIGIN_PREFIX,
  isGlosaManualOrigin,
  isGlosaManualOriginName,
} from "../shared/glosaManualOrigin";

const mocks = vi.hoisted(() => ({
  getArquivoById: vi.fn(),
  getArquivos: vi.fn(),
  getValorTotalPorArquivos: vi.fn(),
  getFaturamentoTissByArquivo: vi.fn(),
  getConvenioById: vi.fn(),
  findArquivoExistente: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  getRawPool: vi.fn(async () => null),
  getDb: vi.fn(async () => null),
  updateArquivoStatus: vi.fn(async () => {}),
  updateArquivoProgresso: vi.fn(async () => {}),
  updateArquivo: vi.fn(async () => {}),
  createArquivo: vi.fn(async () => ({ id: 71 })),
  deleteFaturamentoTissByArquivo: vi.fn(async () => 0),
  deleteRecebimentoTissByArquivo: vi.fn(async () => 0),
  deleteRecebimentosExcelByArquivo: vi.fn(async () => 0),
  deleteDemonstrativoByArquivo: vi.fn(async () => 0),
  deleteArquivo: vi.fn(async () => ({ success: true })),
  insertRecebimentosExcelBatch: vi.fn(async () => 1),
  dispatchInternalFileProcessing: vi.fn(async () => {}),
  assertInternalProcessingReady: vi.fn(),
  storagePut: vi.fn(async () => ({ url: "https://storage.invalid/synthetic.xlsx" })),
  consultarAcoesPublicasLoteXmlPorArquivos: vi.fn(async () => new Map()),
  parseExcelRecebimentosExcel: vi.fn(() => [{ arquivoId: 71 }]),
  parseExcelRecebimentosExcelChunked: vi.fn(),
  syncDemonstrativoByArquivo: vi.fn(async () => ({ total: 1 })),
  fetch: vi.fn(),
}));
vi.mock("./db", () => mocks);
vi.mock("./recebimentosExcelParser", () => ({
  parseExcelRecebimentosExcel: mocks.parseExcelRecebimentosExcel,
  parseExcelRecebimentosExcelChunked: mocks.parseExcelRecebimentosExcelChunked,
}));
vi.mock("./syncDemonstrativo", () => ({ syncDemonstrativoByArquivo: mocks.syncDemonstrativoByArquivo }));
import { fileProcessorRouter } from "./fileProcessor";

const manualName = `${GLOSA_MANUAL_ORIGIN_PREFIX}${"a".repeat(64)}:${"b".repeat(64)}:2026-11-03`;
const normalArquivo = {
  id: 71, nome: "sintetico.xlsx", tipoArquivo: "excel", direcao: "retornado",
  estabelecimentoId: 13, convenioId: 31, userId: 7,
  s3Key: "synthetic/key", s3Url: "https://storage.invalid/synthetic.xlsx",
  status: "processado", tamanho: 8, progresso: 100, itensProcessados: 1, totalItens: 1,
};
const manualArquivo = { ...normalArquivo, nome: manualName, tipoArquivo: "txt", s3Key: "", s3Url: "", tamanho: 0 };
const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("routers.ts", source, ts.ScriptTarget.Latest, true);
function findNode(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let result: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (result) return;
    if (predicate(node)) { result = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(root);
  if (!result) throw new Error("Trecho de produção não encontrado");
  return result;
}
function compile(code: string, dependencies: Record<string, unknown>) {
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), js)(...Object.values(dependencies));
}
// Executar os blocos EXATOS do router real sem importar appRouter/entrypoint/jobs.
// O AST seleciona arquivos e importarExcel; todo I/O vem dos mocks acima.
const t = initTRPC.context<any>().create();
const arquivosNode = findNode(ast, n => ts.isPropertyAssignment(n) && n.name.getText(ast) === "arquivos" && n.parent.getText(ast).startsWith("{\n  system:")) as ts.PropertyAssignment;
const excelNode = findNode(ast, n => ts.isPropertyAssignment(n) && n.name.getText(ast) === "recebimentosExcel" && ts.isCallExpression(n.initializer)) as ts.PropertyAssignment;
const helperCode = ["arquivoEhLoteXmlProtegido", "exigirArquivoOriginal", "obterArquivoAutorizado"].map(name =>
  findNode(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)
).join("\n");
const dependencies = {
  router: t.router, protectedProcedure: t.procedure, z, TRPCError, db: mocks,
  getDb: mocks.getDb,
  GLOSA_MANUAL_NO_ORIGINAL_MESSAGE, GLOSA_MANUAL_ORIGIN_LABEL, isGlosaManualOriginName,
  consultarAcoesPublicasLoteXmlPorArquivos: mocks.consultarAcoesPublicasLoteXmlPorArquivos,
  assertInternalProcessingReady: mocks.assertInternalProcessingReady,
  dispatchInternalFileProcessing: mocks.dispatchInternalFileProcessing,
  storagePut: mocks.storagePut, sanitizeFilename: (name: string) => name,
  nanoid: () => "synthetic-id",
  require: (path: string) => {
    if (path === "../drizzle/schema") return schema;
    if (path === "drizzle-orm") return drizzle;
    if (path === "./recebimentosExcelParser") return { parseExcelRecebimentosExcel: mocks.parseExcelRecebimentosExcel };
    throw new Error(`Dependência não autorizada no teste: ${path}`);
  },
};
const isolatedRouter = compile(`${helperCode}\nreturn router({ arquivos: ${arquivosNode.initializer.getText(ast)}, recebimentosExcel: ${excelNode.initializer.getText(ast)} });`, dependencies);
function caller(role = "admin") {
  return isolatedRouter.createCaller({ user: { id: 7, role }, req: {}, res: {} });
}
const processor = (fileProcessorRouter as any).stack.find((r: any) => r.route?.path === "/api/internal/process-file").route.stack[0].handle;
function response() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res); res.json.mockReturnValue(res);
  return res;
}
function expectNoDocumentWrites() {
  for (const mock of [mocks.deleteFaturamentoTissByArquivo, mocks.deleteRecebimentoTissByArquivo,
    mocks.deleteRecebimentosExcelByArquivo, mocks.deleteDemonstrativoByArquivo,
    mocks.deleteArquivo, mocks.updateArquivoStatus, mocks.updateArquivoProgresso,
    mocks.updateArquivo, mocks.createArquivo, mocks.dispatchInternalFileProcessing,
    mocks.storagePut, mocks.insertRecebimentosExcelBatch]) {
    expect(mock).not.toHaveBeenCalled();
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("JWT_SECRET", "issue163-synthetic-processor-secret-only");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  mocks.getArquivoById.mockResolvedValue(manualArquivo);
  mocks.getArquivos.mockResolvedValue([manualArquivo, normalArquivo]);
  mocks.getValorTotalPorArquivos.mockResolvedValue({ 71: { valorGlosado: 10 } });
  mocks.getFaturamentoTissByArquivo.mockResolvedValue([{ id: 1, arquivoId: 71 }]);
  mocks.getConvenioById.mockResolvedValue({ id: 31, estabelecimentoId: 13 });
  mocks.findArquivoExistente.mockResolvedValue(null);
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.getDb.mockResolvedValue(null);
  mocks.getRawPool.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Issue163: origem manual pura", () => {
  it("detecta apenas prefixo reservado, sem inferir por TXT/URL vazia/tamanho zero", () => {
    expect(isGlosaManualOriginName(manualName)).toBe(true);
    expect(isGlosaManualOriginName(GLOSA_MANUAL_ORIGIN_PREFIX)).toBe(true);
    for (const value of [undefined, null, 1, "manual-glosa:v2:key", "manual-glosa.txt", "prefix-manual-glosa:v1:key"]) {
      expect(isGlosaManualOriginName(value)).toBe(false);
    }
    expect(isGlosaManualOrigin({ nome: "retorno.txt" })).toBe(false);
    expect(isGlosaManualOrigin({ nome: GLOSA_MANUAL_ORIGIN_LABEL, origemManual: true })).toBe(true);
    expect(isGlosaManualOrigin({ nome: GLOSA_MANUAL_ORIGIN_LABEL, origemManual: "true" })).toBe(false);
  });
});
describe("Issue163: APIs documentais não destroem âncora", () => {
  it.each(["admin", "user"])("delete/reprocessar recusam origem manual para %s antes de derivados/status/dispatch", async role => {
    await expect(caller(role).arquivos.delete({ id: 71 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    await expect(caller(role).arquivos.reprocessar({ id: 71 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    expectNoDocumentWrites();
    expect(mocks.assertInternalProcessingReady).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("seleção em lote não contorna a guarda por IDs", async () => {
    mocks.getArquivoById.mockImplementation(async (id: number) => id === 71 ? manualArquivo : { ...normalArquivo, id });
    const attempts = await Promise.allSettled([71, 72].map(id => caller().arquivos.reprocessar({ id })));
    expect(attempts.map(a => a.status)).toEqual(["rejected", "fulfilled"]);
    expect(mocks.dispatchInternalFileProcessing).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchInternalFileProcessing).toHaveBeenCalledWith(expect.objectContaining({ arquivoId: 72 }));
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, expect.anything());
    expect(mocks.updateArquivoProgresso).not.toHaveBeenCalledWith(71, expect.anything(), expect.anything());
  });
  it("importação Excel nega download da âncora antes de fetch ou catch marcar erro", async () => {
    await expect(caller().recebimentosExcel.importarExcel({ arquivoId: 71, estabelecimentoId: 13 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.assertInternalProcessingReady).not.toHaveBeenCalled();
    expectNoDocumentWrites();
  });
  it("upload não cria documento nem sobrescreve âncora no namespace reservado", async () => {
    await expect(caller().arquivos.upload({ nome: manualName, tipoArquivo: "txt", direcao: "retornado", estabelecimentoId: 13, convenioId: 31, conteudo: "c2ludGV0aWNv" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoDocumentWrites();
    expect(mocks.assertInternalProcessingReady).not.toHaveBeenCalled();
  });
  it("reimportação também valida o objeto interno retornado, não só o nome da entrada", async () => {
    mocks.findArquivoExistente.mockResolvedValue(manualArquivo);
    await expect(caller().arquivos.upload({ nome: normalArquivo.nome, tipoArquivo: "excel", direcao: "retornado", estabelecimentoId: 13, convenioId: 31, conteudo: "c2ludGV0aWNv" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoDocumentWrites();
  });
  it("list/get/status sanitizam hashes, preservam flag e não inventam URL nem ocultam totais", async () => {
    const list = await caller().arquivos.list({ estabelecimentoId: 13 });
    const get = await caller().arquivos.get({ id: 71 });
    const status = await caller().arquivos.status({ id: 71 });
    for (const dto of [list[0], get, status]) {
      expect(dto).toMatchObject({ nome: GLOSA_MANUAL_ORIGIN_LABEL, origemManual: true, status: "processado" });
      expect(dto).not.toHaveProperty("s3Key"); expect(dto).not.toHaveProperty("s3Url");
      expect(JSON.stringify(dto)).not.toContain(manualName);
    }
    expect(list[0].valorTotalGlosado).toBe(10);
    expect(list[1]).toMatchObject({ nome: normalArquivo.nome, origemManual: false });
    expect(await caller().arquivos.procedimentos({ arquivoId: 71 })).toEqual([{ id: 1, arquivoId: 71 }]);
    expectNoDocumentWrites();
  });
  it("não amplia autorização de acesso legado", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(caller("user").arquivos.delete({ id: 71 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").arquivos.get({ id: 71 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDocumentWrites();
  });
  it("arquivo normal mantém exclusão de derivados e reprocessamento", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.getArquivoById.mockResolvedValue(normalArquivo);
    await expect(caller().arquivos.delete({ id: 71 })).resolves.toEqual({ success: true });
    for (const fn of [mocks.deleteFaturamentoTissByArquivo, mocks.deleteRecebimentoTissByArquivo,
      mocks.deleteRecebimentosExcelByArquivo, mocks.deleteDemonstrativoByArquivo, mocks.deleteArquivo]) {
      expect(fn).toHaveBeenCalledWith(71);
    }
    await expect(caller().arquivos.reprocessar({ id: 71 })).resolves.toMatchObject({ success: true });
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processando");
    expect(mocks.updateArquivoProgresso).toHaveBeenCalledWith(71, 5, 0);
    expect(mocks.dispatchInternalFileProcessing).toHaveBeenCalledWith({ arquivoId: 71, limparDadosAnteriores: true });
  });
});
describe("Issue163: processor HTTP sem alteração da origem manual", () => {
  it("nega antes de download/limpeza/status/progresso/logs, sem cair no catch de erro", async () => {
    const res = response();
    await processor({ body: { arquivoId: 71, secret: process.env.JWT_SECRET, limparDadosAnteriores: true } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.getRawPool).not.toHaveBeenCalled();
    expect(mocks.parseExcelRecebimentosExcel).not.toHaveBeenCalled();
    expectNoDocumentWrites();
    expect(manualArquivo.status).toBe("processado");
  });
  it("arquivo físico normal mantém download, limpeza e finalização", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.getArquivoById.mockResolvedValue(normalArquivo);
    const res = response();
    await processor({ body: { arquivoId: 71, secret: process.env.JWT_SECRET, limparDadosAnteriores: true } }, res);
    expect(mocks.fetch).toHaveBeenCalledWith(normalArquivo.s3Url, expect.anything());
    expect(mocks.deleteRecebimentosExcelByArquivo).toHaveBeenCalledWith(71);
    expect(mocks.deleteDemonstrativoByArquivo).toHaveBeenCalledWith(71);
    expect(mocks.insertRecebimentosExcelBatch).toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processado");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "erro");
    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Processing completed" });
  });
});
describe("Issue163: defesa direta deleteArquivo sem banco real", () => {
  const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const dbAst = ts.createSourceFile("db.ts", dbSource, ts.ScriptTarget.Latest, true);
  const fn = findNode(dbAst, n => ts.isFunctionDeclaration(n) && n.name?.text === "deleteArquivo").getText(dbAst).replace(/^export\s+/, "");
  function directDb(nome: string) {
    const deleteWhere = vi.fn(async () => ({ affectedRows: 1 }));
    const query: any = {};
    query.from = vi.fn(() => query); query.where = vi.fn(() => query);
    query.limit = vi.fn(async () => [{ nome }]);
    const db = { select: vi.fn(() => query), delete: vi.fn(() => ({ where: deleteWhere })) };
    const run = compile(`${fn}\nreturn deleteArquivo;`, { getDb: async () => db, arquivos: schema.arquivos, eq: drizzle.eq });
    return { db, run, deleteWhere };
  }
  it("recusa nome manual antes do DELETE mantendo assinatura", async () => {
    const { db, run } = directDb(manualName);
    await expect(run(71)).rejects.toThrow(GLOSA_MANUAL_NO_ORIGINAL_MESSAGE);
    expect(db.delete).not.toHaveBeenCalled();
  });
  it("arquivo comum continua excluindo", async () => {
    const { db, run, deleteWhere } = directDb(normalArquivo.nome);
    await expect(run(71)).resolves.toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledWith(schema.arquivos);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
describe("Issue163: UI documental", () => {
  it("rotula origem por nome/flag e esconde reprocessar, reenvio de lote e excluir em conjunto", () => {
    const ui = readFileSync(new URL("../client/src/pages/Arquivos.tsx", import.meta.url), "utf8");
    expect(ui).toContain("GLOSA_MANUAL_ORIGIN_LABEL");
    expect(ui).toContain("Sem arquivo original");
    const protectedActions = ui.slice(ui.indexOf("{!isGlosaManualOrigin(arquivo) && <>"), ui.indexOf("</>}", ui.indexOf("{!isGlosaManualOrigin(arquivo) && <>")));
    expect(protectedActions).toContain("handleReprocessar(arquivo.id)");
    expect(protectedActions).toContain("handleReenviarSelecaoProtegida(arquivo)");
    expect(protectedActions).toContain("setArquivoToDelete");
    expect(ui).not.toContain("arquivo.s3Url");
  });
});
