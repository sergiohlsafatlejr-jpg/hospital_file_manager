import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "./contratosConveniosPdfService";
import {
  ContratoPdfArquivoError, criarLeitorContratoPdfArquivo,
  CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS as PAGES,
  CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES as TEXT,
  CONTRATOS_PDF_ARQUIVO_MAX_LINHAS as LINES,
} from "./contratosPdfArquivo";
import {
  createContratosUploadHandlers, criarExecutorContratosPdfFallback, processContratosUploadPdfFile,
  type ContratosUploadDependencies, type ContratosUploadRecord,
} from "./contratosUploadChunks";

// Original public synthetic fixture from pdf-layout-audit/pdf-fixtures.ts.
function syntheticPdf(pageCount: number, text = "Documento sintetico para auditoria isolada. Vigencia e pagamento de teste sem dados reais.", large = false, lineOverride?: string[]): Buffer {
  const lines = lineOverride ?? (large ? Array.from({ length: 40 }, () => "x".repeat(1800)) : [text]);
  const stream = `BT\n/F1 9 Tf\n10 780 Td\n${lines.map((line, i) => `${i ? "0 -12 Td\n" : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj\n`).join("")}ET\n`;
  const compressed = deflateSync(Buffer.from(stream));
  const pages = Array.from({ length: pageCount }, (_, i) => 5 + i);
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(`<< /Type /Pages /Kids [${pages.map(id => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from("\nendstream")]),
    ...pages.map(() => Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${large ? 100000 : 612} 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>`)),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")]; let length = chunks[0].length; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(length); const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); chunks.push(part); length += part.length; });
  chunks.push(Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-fallback-test-")); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(dir, { recursive: true, force: true }); });
async function local(bytes = syntheticPdf(1)) {
  const file = path.join(dir, "synthetic.pdf"); await fs.writeFile(file, bytes, { mode: 0o600 }); return { file, bytes };
}
function unavailable() {
  return vi.spyOn(service, "lerContratoPdfArquivo").mockRejectedValue(new ContratoPdfArquivoError("PDF_PROCESSADOR_INDISPONIVEL", "synthetic unavailable"));
}
const reading = () => ({ paginas: 1, textoExtraido: "x".repeat(80), pontosImportantes: [], status: "concluido" as const });

describe("wrapper PDF: limites e integridade não viram fallback/OCR", () => {
  it.each(["PDF_ARQUIVO_INVALIDO", "PDF_LIMITE_BYTES", "PDF_LIMITE_PAGINAS", "PDF_LIMITE_TEXTO", "PDF_LIMITE_SAIDA", "PDF_TEMPO_ESGOTADO", "PDF_EXTRACAO_INCOMPLETA", "PDF_PROCESSADOR_OCUPADO"] as const)("propaga a identidade de %s", async code => {
    const f = await local(); const error = new ContratoPdfArquivoError(code, "synthetic rejection");
    vi.spyOn(service, "lerContratoPdfArquivo").mockRejectedValue(error);
    const legacy = vi.spyOn(service, "lerContratoPdf");
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toBe(error);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each([new Error("unknown"), new DOMException("cancel", "AbortError"), Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })])("não classifica falha genérica como indisponibilidade", async error => {
    const f = await local(); vi.spyOn(service, "lerContratoPdfArquivo").mockRejectedValue(error);
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toBe(error);
  });
  it("preserva o motivo de cancelamento e não inicia extrator", async () => {
    const f = await local(); const controller = new AbortController(); const error = new Error("synthetic cancel"); controller.abort(error);
    const spy = vi.spyOn(service, "lerContratoPdfArquivo");
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length, controller.signal)).rejects.toBe(error); expect(spy).not.toHaveBeenCalled();
  });
  it("recusa tamanho declarado divergente antes de extração", async () => {
    const f = await local(); const spy = vi.spyOn(service, "lerContratoPdfArquivo");
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length + 1)).rejects.toMatchObject({ code: "PDF_ARQUIVO_INVALIDO" }); expect(spy).not.toHaveBeenCalled();
  });
  it("recusa symlink antes da extração", async () => {
    const f = await local(); const link = path.join(dir, "link.pdf"); await fs.symlink(f.file, link);
    await expect(processContratosUploadPdfFile(link, f.bytes.length)).rejects.toMatchObject({ code: "PDF_ARQUIVO_INVALIDO" });
  });
  it("recusa alteração de inode/conteúdo entre extratores", async () => {
    const f = await local(); vi.spyOn(service, "lerContratoPdfArquivo").mockImplementation(async () => {
      await fs.rename(f.file, f.file + ".old"); await fs.writeFile(f.file, f.bytes);
      throw new ContratoPdfArquivoError("PDF_PROCESSADOR_INDISPONIVEL", "unavailable");
    });
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  });
  it.each([
    { ...reading(), paginas: PAGES + 1, code: "PDF_LIMITE_PAGINAS" },
    { ...reading(), textoExtraido: "é".repeat(TEXT / 2 + 1), code: "PDF_LIMITE_TEXTO" },
    { ...reading(), textoExtraido: "a\n".repeat(LINES), code: "PDF_LIMITE_TEXTO" },
    { ...reading(), paginas: 0, code: "PDF_EXTRACAO_INCOMPLETA" },
    { ...reading(), textoExtraido: "", code: "PDF_EXTRACAO_INCOMPLETA" },
  ])("valida resultado do extrator antes de devolver ($code)", async ({ code, ...value }) => {
    const f = await local(); vi.spyOn(service, "lerContratoPdfArquivo").mockResolvedValue(value);
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code });
  });
  it.each([[PAGES + 1, false, "PDF_LIMITE_PAGINAS"], [32, true, "PDF_LIMITE_TEXTO"]] as const)("fixture focal Poppler %i/%s permanece bloqueada", async (pages, large, code) => {
    const f = await local(syntheticPdf(pages, undefined, large));
    await expect(service.lerContratoPdfArquivo(f.file)).rejects.toMatchObject({ code });
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code });
  }, 30_000);
});

describe("fallback legítimo em subprocesso com fonte única de limites", () => {
  it("extrai documento válido sem invocar parser irrestrito no processo Node", async () => {
    const f = await local(); unavailable(); const legacy = vi.spyOn(service, "lerContratoPdf");
    const result = await processContratosUploadPdfFile(f.file, f.bytes.length);
    expect(result).toMatchObject({ paginas: 1, status: "concluido" }); expect(result.textoExtraido).toContain("sintetico"); expect(legacy).not.toHaveBeenCalled();
  }, 30_000);
  it("preserva OCR de documento válido sem texto", async () => {
    const f = await local(syntheticPdf(1, "")); unavailable();
    expect(await processContratosUploadPdfFile(f.file, f.bytes.length)).toMatchObject({ paginas: 1, textoExtraido: "", status: "ocr_necessario" });
  }, 30_000);
  it.each([[PAGES + 1, false, "PDF_LIMITE_PAGINAS"], [32, true, "PDF_LIMITE_TEXTO"]] as const)("fallback também bloqueia fixture %i/%s", async (pages, large, code) => {
    const f = await local(syntheticPdf(pages, undefined, large)); unavailable();
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code });
  }, 30_000);
  it("fallback aceita o teto exato de páginas sem leitura parcial", async () => {
    const f = await local(syntheticPdf(PAGES)); unavailable();
    expect(await processContratosUploadPdfFile(f.file, f.bytes.length)).toMatchObject({ paginas: PAGES, status: "concluido" });
  }, 30_000);
  it("fallback rejeita linhas brutas excedidas antes de normalizar", async () => {
    const f = await local(syntheticPdf(PAGES, undefined, false, Array.from({ length: 100 }, () => "a"))); unavailable();
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code: "PDF_LIMITE_TEXTO" });
  }, 30_000);
  it("falha de parser/malformado não publica OCR zero páginas", async () => {
    const f = await local(Buffer.from("%PDF-1.4 invalid synthetic\n%%EOF")); unavailable();
    await expect(processContratosUploadPdfFile(f.file, f.bytes.length)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  }, 30_000);
  it("prazo de subprocesso esgota e o slot é liberado só após close", async () => {
    const f = await local();
    const reader = criarLeitorContratoPdfArquivo({ normalizarTexto: service.normalizarTextoPdf, extrairPontos: service.extrairPontosImportantes,
      executar: criarExecutorContratosPdfFallback(performance.now() + 1) });
    await expect(reader(f.file)).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    expect(await service.lerContratoPdfArquivo(f.file)).toMatchObject({ paginas: 1 });
  });
  it("cancelamento de filho é observado antes de permitir nova leitura", async () => {
    const f = await local(); const controller = new AbortController();
    const reader = criarLeitorContratoPdfArquivo({ normalizarTexto: service.normalizarTextoPdf, extrairPontos: service.extrairPontosImportantes,
      executar: criarExecutorContratosPdfFallback(performance.now() + 10_000) });
    const pending = reader(f.file, controller.signal); const rejected = expect(pending).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    const timer = setTimeout(() => controller.abort(), 20); await rejected; clearTimeout(timer);
    expect(await service.lerContratoPdfArquivo(f.file)).toMatchObject({ paginas: 1 });
  });
});

it("finalizador real persiste erro, nunca concluido/OCR, para PDF de 513 páginas", async () => {
  const bytes = syntheticPdf(PAGES + 1); const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objects = new Map<string, Buffer>(); let row: ContratosUploadRecord; const published = vi.fn(); let mounted: string | undefined;
  const deps: ContratosUploadDependencies = {
    repository: {
      reserve: async (m, key) => { row = { id: 1, contratoId: m.contratoId, estabelecimentoId: m.estabelecimentoId, criadoPor: m.actorId, nomeArquivo: m.filename, tamanhoBytes: m.byteLength, sha256: m.sha256, storageKey: key, status: "processando", paginas: null, pontosImportantes: [] }; return structuredClone(row); },
      get: async () => structuredClone(row),
      compareAndSwap: async (r, key, status = "processando", result) => {
        if (row.storageKey !== r.storageKey || row.status !== r.status) return false;
        if (result) published(result); row = { ...row, storageKey: key, status: result?.status ?? status }; return true;
      },
    },
    storage: { put: async (k, b) => { objects.set(k, Buffer.from(b)); }, get: async k => Readable.from([objects.get(k)!]), putFile: async (_k, f) => { mounted = f; } },
    authorize: async () => ({ estabelecimentoId: 11 }), ready: async () => {}, processPdfFile: processContratosUploadPdfFile,
  };
  const api = createContratosUploadHandlers(deps); const actor = { id: 7 };
  const start = await api.iniciar(actor, { contratoId: 9, filename: "synthetic.pdf", byteLength: bytes.length, sha256 });
  await api.bloco(actor, start.sessionId, 0, Readable.from([bytes]), sha256);
  await expect(api.finalizar(actor, start.sessionId)).rejects.toMatchObject({ code: "PDF_LIMITE_PAGINAS" });
  expect(row!.status).toBe("erro"); expect(published).not.toHaveBeenCalled();
  expect(await api.status(actor, start.sessionId)).toMatchObject({ state: "erro", recoveryRequired: true });
  await expect(fs.stat(mounted!)).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
