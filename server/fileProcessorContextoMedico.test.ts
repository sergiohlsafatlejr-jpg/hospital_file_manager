import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  getArquivoById: vi.fn(),
  getRawPool: vi.fn(async () => null),
  updateArquivoStatus: vi.fn(async () => {}),
  updateArquivoProgresso: vi.fn(async () => {}),
  deleteFaturamentoTissByArquivo: vi.fn(async () => 0),
  insertFaturamentoTissBatch: vi.fn(async () => 0),
  getPrestadorPorCodigo: vi.fn(async () => null),
  getDb: vi.fn(async () => null),
  rotear: vi.fn(),
  parseFile: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./parsers", () => ({ parseFile: mocks.parseFile }));
vi.mock("./routers", () => ({
  mapTipoDespesaParaTipoItem: (tipo: string | undefined) => tipo || "outro",
}));
vi.mock("./importacaoAutomaticaContextoMedico", () => ({
  rotearEnvioXmlParaContextoMedico: mocks.rotear,
}));

import { fileProcessorRouter } from "./fileProcessor";

const handler = (fileProcessorRouter as any).stack.find(
  (route: any) => route.route?.path === "/api/internal/process-file"
).route.stack[0].handle;

function resposta() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const request = (extra: Record<string, unknown> = {}) => ({
  body: {
    arquivoId: 71,
    secret: process.env.JWT_SECRET || "internal-process-secret",
    ...extra,
  },
});

describe("worker de envio — contexto médico automático", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getArquivoById.mockResolvedValue({
      id: 71,
      nome: "sintetico.xml",
      tipoArquivo: "xml",
      direcao: "enviado",
      s3Url: "https://storage.invalid/arquivo.xml",
      convenioId: 2,
      estabelecimentoId: 3,
    });
    mocks.rotear.mockResolvedValue({ destino: "financeiro_normal" });
    mocks.parseFile.mockResolvedValue({ success: false, procedimentos: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }))
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("honorários puro termina no fluxo informativo antes de todo DELETE/INSERT financeiro", async () => {
    mocks.rotear.mockResolvedValue({
      destino: "contexto_informativo",
      indexadas: 1,
      jaIndexadas: 0,
      semCorrespondencia: 0,
      ambiguas: 0,
    });

    await handler(request(), resposta());

    expect(mocks.rotear).toHaveBeenCalledOnce();
    expect(mocks.deleteFaturamentoTissByArquivo).not.toHaveBeenCalled();
    expect(mocks.insertFaturamentoTissBatch).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processado");
  });

  it("preserva o vínculo ativo por prestador, mantém fallback na unidade do upload e informa progresso", async () => {
    const repositorioReimportacao = {
      selectDistinct: vi.fn(() => ({
        from: () => ({ where: async () => [] }),
      })),
      delete: vi.fn(() => ({ where: async () => ({}) })),
    };
    mocks.getDb.mockResolvedValue(repositorioReimportacao);
    mocks.getPrestadorPorCodigo
      .mockResolvedValueOnce({ estabelecimentoId: 9, ativo: "sim" })
      .mockResolvedValueOnce(null);
    mocks.parseFile.mockResolvedValue({
      success: true,
      procedimentos: [
        {
          codigo: "PROC-1",
          tipoDespesa: "procedimento",
          codigoPrestadorExecutante: "VINCULADO",
        },
        {
          codigo: "PROC-2",
          tipoDespesa: "procedimento",
          codigoPrestadorExecutante: "SEM-VINCULO",
        },
      ],
    });
    mocks.insertFaturamentoTissBatch.mockImplementationOnce(
      async (registros, onProgress) => {
        await onProgress(50, 1, 2);
        return registros.length;
      }
    );

    await handler(request({ skipContaConvenioSync: true }), resposta());

    const [registros] = mocks.insertFaturamentoTissBatch.mock.calls[0];
    expect(
      registros.map((registro: any) => registro.estabelecimentoId)
    ).toEqual([9, 3]);
    expect(mocks.getPrestadorPorCodigo).toHaveBeenCalledWith("VINCULADO", 2);
    expect(mocks.getPrestadorPorCodigo).toHaveBeenCalledWith("SEM-VINCULO", 2);
    expect(mocks.updateArquivoProgresso).toHaveBeenCalledWith(71, 50, 1, 2);
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "processado");
  });

  it("não apaga dados anteriores quando o parser financeiro falha antes da reimportação", async () => {
    mocks.parseFile.mockResolvedValue({ success: false, procedimentos: [] });
    const res = resposta();

    await handler(request(), res);

    expect(mocks.deleteFaturamentoTissByArquivo).not.toHaveBeenCalled();
    expect(mocks.insertFaturamentoTissBatch).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "erro");
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("XML ambíguo marca erro sanitizado sem alcançar mutação financeira", async () => {
    mocks.rotear.mockRejectedValue(new Error("classificação bloqueada"));
    const res = resposta();

    await handler(request(), res);

    expect(mocks.deleteFaturamentoTissByArquivo).not.toHaveBeenCalled();
    expect(mocks.insertFaturamentoTissBatch).not.toHaveBeenCalled();
    expect(mocks.updateArquivoStatus).toHaveBeenCalledWith(71, "erro");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Processing failed" });
  });
  it("bloqueia guia médica sem procedimento e preserva o parser TXT explícito", () => {
    const service = readFileSync(
      new URL("./contaContextoMedicoService.ts", import.meta.url),
      "utf8"
    );
    const processor = readFileSync(
      new URL("./fileProcessor.ts", import.meta.url),
      "utf8"
    );
    expect(service).toContain(
      "if (!fontesProcedimentosSemanticos(guia).length)"
    );
    expect(service).toContain("semCorrespondencia += 1;");
    expect(processor).toContain("parseUnimedCerradoTxt");
    expect(processor).toContain("const tipoArquivo = arquivo.tipoArquivo;");
  });
});
