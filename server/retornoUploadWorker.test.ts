import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({
  getArquivoById: vi.fn(), getRawPool: vi.fn(async () => null),
  updateArquivoStatus: vi.fn(async () => {}), updateArquivoProgresso: vi.fn(async () => {}),
  deleteRecebimentosExcelByArquivo: vi.fn(async () => 0), deleteDemonstrativoByArquivo: vi.fn(async () => 0),
  insertRecebimentosExcelBatch: vi.fn(async () => 1), getDb: vi.fn(async () => null),
  parseExcelRecebimentosExcel: vi.fn(() => [{ arquivoId: 71, item: "TESTE" }]),
  parseChunked: vi.fn(async (...args: any[]) => {
    await args[7]([{ arquivoId: 71, item: "TESTE" }], 0, 1);
    return { totalRows: 1, totalRecords: 1 };
  }),
  sync: vi.fn(async () => ({ success: true, total: 1 })),
}));
vi.mock("./db", () => mocks);
vi.mock("./recebimentosExcelParser", () => ({ parseExcelRecebimentosExcel: mocks.parseExcelRecebimentosExcel, parseExcelRecebimentosExcelChunked: mocks.parseChunked }));
vi.mock("./syncDemonstrativo", () => ({ syncDemonstrativoByArquivo: mocks.sync }));
import { fileProcessorRouter } from "./fileProcessor";
const handler = (fileProcessorRouter as any).stack.find((r:any) => r.route?.path === "/api/internal/process-file").route.stack[0].handle;
function response() {
  const res:any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getArquivoById.mockResolvedValue({ id: 71, nome: "sintetico.xlsx", s3Url: "https://arquivo.invalid/sintetico", direcao: "retornado", convenioId: 2, estabelecimentoId: 3 });
  mocks.insertRecebimentosExcelBatch.mockResolvedValue(1);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
});
afterEach(() => vi.unstubAllGlobals());
const payload = (sinal: unknown) => ({ body: { arquivoId: 71, secret: process.env.JWT_SECRET || "internal-process-secret", limparDadosAnteriores: sinal } });

describe("worker de retorno Excel sem banco real", () => {
  it("Excel grande genérico mantém lotes e progresso sem a limpeza inicial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024) })));
    await handler(payload(false), response());
    expect(mocks.parseChunked).toHaveBeenCalledOnce();
    expect(mocks.deleteRecebimentosExcelByArquivo).not.toHaveBeenCalled();
    expect(mocks.insertRecebimentosExcelBatch).toHaveBeenCalledOnce();
    expect(mocks.sync).toHaveBeenCalledWith(71, "excel");
    expect(mocks.updateArquivoProgresso).toHaveBeenLastCalledWith(71, 100, 1, 1);
  });
  it("novo Excel dispensa os DELETEs e conclui somente depois de inserir e sincronizar", async () => {
    const res = response();
    await handler(payload(false), res);
    expect(mocks.deleteRecebimentosExcelByArquivo).not.toHaveBeenCalled();
    expect(mocks.deleteDemonstrativoByArquivo).not.toHaveBeenCalled();
    expect(mocks.insertRecebimentosExcelBatch).toHaveBeenCalledOnce();
    expect(mocks.sync).toHaveBeenCalledWith(71, "excel");
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processado");
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateArquivoStatus.mock.invocationCallOrder[0]);
    expect(mocks.updateArquivoProgresso).toHaveBeenLastCalledWith(71, 100, 1, 1);
  });
  it.each([undefined, true, "false"])("reprocessamento ou sinal ausente/inválido mantém a limpeza (%s)", async sinal => {
    await handler(payload(sinal), response());
    expect(mocks.deleteRecebimentosExcelByArquivo).toHaveBeenCalledWith(71);
    expect(mocks.deleteDemonstrativoByArquivo).toHaveBeenCalledWith(71);
  });
  it("falha de inserção marca erro e não sincroniza nem declara sucesso", async () => {
    mocks.insertRecebimentosExcelBatch.mockRejectedValueOnce(new Error("falha sintetica"));
    const res = response();
    await handler(payload(false), res);
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "erro");
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "processado");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it("não finaliza enquanto a inserção estiver pendente", async () => {
    let finalizar!: (n:number) => void;
    mocks.insertRecebimentosExcelBatch.mockImplementationOnce(() => new Promise<number>(resolve => { finalizar = resolve; }));
    const pending = handler(payload(false), response());
    await vi.waitFor(() => expect(mocks.insertRecebimentosExcelBatch).toHaveBeenCalled());
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalledWith(71, "processado");
    finalizar(1);
    await pending;
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processado");
  });
  it("sem segredo válido não baixa, não limpa e não escreve", async () => {
    const res = response();
    await handler({ body: { arquivoId: 71, secret: "incorreto", limparDadosAnteriores: false } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.getArquivoById).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).not.toHaveBeenCalled();
    expect(mocks.deleteRecebimentosExcelByArquivo).not.toHaveBeenCalled();
  });
});
