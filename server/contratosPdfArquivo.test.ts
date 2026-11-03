import { EventEmitter } from "node:events";
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childMocks = vi.hoisted(() => ({ spawn: vi.fn(), real: false }));
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => childMocks.real ? actual.spawn(...args) : childMocks.spawn(...args),
  };
});

import {
  CONTRATOS_PDF_ARQUIVO_MAX_BYTES,
  CONTRATOS_PDF_ARQUIVO_MAX_LINHAS,
  CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS,
  CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES,
  CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS,
  CONTRATOS_PDF_FILHO_MEMORIA_BYTES,
  criarLeitorContratoPdfArquivo,
  executarPopplerLimitado,
  type ContratoPdfComando,
  type ContratoPdfExecutor,
} from "./contratosPdfArquivo";
import {
  extrairPontosImportantes,
  lerContratoPdfArquivo,
  normalizarTextoPdf,
} from "./contratosConveniosPdfService";

const contrato = [
  "HOSPITAL SINTETICO LTDA",
  "Vigencia contratual de 12 meses.",
  "Pagamento em 30 dias e recurso de glosa em 60 dias.",
  "Faturamento por tabela CBHPM. Sigilo e protecao dos dados.",
  "Contato: contas@exemplo.invalid",
].join("\n");
const resultado = (stdout: string | Buffer, stderr = "") => ({ stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr: Buffer.from(stderr) });
const executorPadrao = (): ContratoPdfExecutor => vi.fn(async comando => resultado(comando.ferramenta === "pdfinfo" ? "Pages: 1\nEncrypted: no\n" : contrato));
const criarLeitor = (executar: ContratoPdfExecutor = executorPadrao(), agora?: () => number) => criarLeitorContratoPdfArquivo({ executar, agora, normalizarTexto: normalizarTextoPdf, extrairPontos: extrairPontosImportantes });

let tempDir: string;
let filePath: string;
beforeEach(async () => {
  childMocks.real = false;
  childMocks.spawn.mockReset();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contratos-pdf-test-"));
  filePath = path.join(tempDir, "synthetic.pdf");
  await fs.writeFile(filePath, "%PDF-1.4\nfixture sem documento real\n", { mode: 0o600 });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  childMocks.real = false;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("leitura de contrato por arquivo (executores sintéticos)", () => {
  it("reusa normalização/pontos, valida só 1 KiB e não lê o PDF inteiro", async () => {
    const readFile = vi.spyOn(fs, "readFile");
    const executar = executorPadrao();
    const leitura = await criarLeitor(executar)(filePath);
    expect(leitura).toMatchObject({ paginas: 1, textoExtraido: contrato, status: "concluido" });
    expect(leitura.pontosImportantes).toEqual(extrairPontosImportantes(contrato));
    expect(readFile).not.toHaveBeenCalled();
    const comandos = vi.mocked(executar).mock.calls.map(([comando]) => comando);
    expect(comandos[0]).toMatchObject({ ferramenta: "pdfinfo", argumentos: ["-enc", "UTF-8", "/proc/self/fd/3"], timeoutMs: 10_000, maxStdoutBytes: 64 * 1024 });
    expect(comandos[1]).toMatchObject({ ferramenta: "pdftotext", argumentos: ["-f", "1", "-l", "1", "-enc", "UTF-8", "-eol", "unix", "/proc/self/fd/3", "-"], maxStdoutBytes: CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES });
    expect(comandos[0].inputFd).toBe(comandos[1].inputFd);
  });

  it("PDF sem texto resulta somente em ocr_necessario, sem realizar OCR", async () => {
    const executar: ContratoPdfExecutor = async c => resultado(c.ferramenta === "pdfinfo" ? "Pages: 2\n" : "\f\f");
    await expect(criarLeitor(executar)(filePath)).resolves.toEqual({ paginas: 2, textoExtraido: "", pontosImportantes: [], status: "ocr_necessario" });
  });

  it.each(["relative.pdf", "", "/tmp/pdf\0invalid"])("recusa caminho inválido %j antes do subprocesso", async value => {
    const executar = executorPadrao();
    await expect(criarLeitor(executar)(value)).rejects.toMatchObject({ code: "PDF_ARQUIVO_INVALIDO" });
    expect(executar).not.toHaveBeenCalled();
  });

  it("recusa ausente, vazio, diretório e symlink", async () => {
    const executar = executorPadrao();
    const leitor = criarLeitor(executar);
    const empty = path.join(tempDir, "empty.pdf");
    const link = path.join(tempDir, "link.pdf");
    await fs.writeFile(empty, "");
    await fs.symlink(filePath, link);
    for (const invalid of [path.join(tempDir, "missing"), empty, tempDir, link]) {
      await expect(leitor(invalid)).rejects.toMatchObject({ code: "PDF_ARQUIVO_INVALIDO" });
    }
    expect(executar).not.toHaveBeenCalled();
  });

  it("recusa cabeçalho PDF fora dos primeiros 1024 bytes", async () => {
    await fs.writeFile(filePath, "x".repeat(1024) + "%PDF-1.4\n");
    await expect(criarLeitor()(filePath)).rejects.toMatchObject({ code: "PDF_ARQUIVO_INVALIDO" });
  });

  it("limita 150 MiB por stat sem alocar buffer de entrada", async () => {
    const executar = executorPadrao();
    await fs.truncate(filePath, CONTRATOS_PDF_ARQUIVO_MAX_BYTES + 1);
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_LIMITE_BYTES" });
    expect(executar).not.toHaveBeenCalled();
    // Sparse synthetic input tests the boundary, not real 150 MiB capacity.
    await fs.truncate(filePath, CONTRATOS_PDF_ARQUIVO_MAX_BYTES);
    await expect(criarLeitor(executar)(filePath)).resolves.toMatchObject({ status: "concluido" });
  });

  it("acima de 4 MiB continua file-backed, sem pdf-parse ou Buffer integral", async () => {
    await fs.truncate(filePath, 5 * 1024 * 1024);
    const readFile = vi.spyOn(fs, "readFile");
    await expect(criarLeitor()(filePath)).resolves.toMatchObject({ status: "concluido" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each(["Pages: 0\n", "Pages: nan\n", "Pages: 1\nPages: 2\n", "Title: only metadata\n"])("recusa contagem não verificável %j", async info => {
    await expect(criarLeitor(async () => resultado(info))(filePath)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  });

  it("recusa páginas excedidas sem extrair prefixo e aceita a fronteira", async () => {
    const executar = vi.fn<ContratoPdfExecutor>(async () => resultado(`Pages: ${CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS + 1}\n`));
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_LIMITE_PAGINAS" });
    expect(executar).toHaveBeenCalledTimes(1);
    const limite: ContratoPdfExecutor = async c => resultado(c.ferramenta === "pdfinfo" ? `Pages: ${CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS}\n` : contrato);
    await expect(criarLeitor(limite)(filePath)).resolves.toMatchObject({ paginas: CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS });
  });

  it("recusa PDF protegido sem tentar remover restrições", async () => {
    const executar = vi.fn<ContratoPdfExecutor>(async () => resultado("Pages: 1\nEncrypted: yes (print:yes copy:no)\n"));
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it("recusa texto e diagnóstico excedidos sem resultado concluído", async () => {
    for (const [output, code] of [
      [resultado(Buffer.alloc(CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES + 1)), "PDF_LIMITE_TEXTO"],
      [resultado(contrato, "e".repeat(16 * 1024 + 1)), "PDF_LIMITE_SAIDA"],
      [resultado(contrato, "Syntax Warning: skipped damaged content"), "PDF_EXTRACAO_INCOMPLETA"],
      [resultado(Buffer.from([0xe2, 0x82])), "PDF_EXTRACAO_INCOMPLETA"],
    ] as const) {
      const executar: ContratoPdfExecutor = async c => c.ferramenta === "pdfinfo" ? resultado("Pages: 1\n") : output;
      await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code });
    }
  });

  it("recusa stdout de metadados excedido e avisos do pdfinfo", async () => {
    await expect(criarLeitor(async () => resultado("x".repeat(64 * 1024 + 1)))(filePath)).rejects.toMatchObject({ code: "PDF_LIMITE_SAIDA" });
    await expect(criarLeitor(async () => resultado("Pages: 1\n", "warning"))(filePath)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  });

  it("limita linhas para evitar inflação de objetos JS", async () => {
    const executar: ContratoPdfExecutor = async c => resultado(c.ferramenta === "pdfinfo" ? "Pages: 1\n" : "x\n".repeat(CONTRATOS_PDF_ARQUIVO_MAX_LINHAS));
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_LIMITE_TEXTO" });
  });

  it("aceita exatamente 2 MiB sem busca quadrática de e-mails em token longo", async () => {
    const texto = "x".repeat(CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES);
    const executar: ContratoPdfExecutor = async c => resultado(c.ferramenta === "pdfinfo" ? "Pages: 1\n" : texto);
    const leitura = await criarLeitor(executar)(filePath);
    expect(leitura.textoExtraido.length).toBe(CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES);
    expect(leitura.pontosImportantes).toEqual([]);
  });

  it("preserva ordem/deduplicação de partes e contatos e descarta endereços absurdos", () => {
    const partes = Array.from({ length: 6 }, (_, i) => `HOSPITAL ${i} LTDA`);
    const contatos = Array.from({ length: 10 }, (_, i) => `contas${i}@exemplo.invalid`);
    const texto = [...partes, partes[0], ...contatos, contatos[0], `${"x".repeat(2000)}@exemplo.invalid`].join("\n");
    const pontos = extrairPontosImportantes(texto);
    expect(pontos.find(p => p.categoria === "partes")?.resumo).toBe(partes.slice(0, 4).join("; "));
    expect(pontos.find(p => p.categoria === "contatos")?.resumo).toBe(contatos.slice(0, 8).join(", "));
    expect(extrairPontosImportantes(`${"x".repeat(2000)}@exemplo.invalid`).some(p => p.categoria === "contatos")).toBe(false);
  });

  it("aplica deadline cumulativo mesmo com executor alternativo", async () => {
    let clock = 0;
    const executar: ContratoPdfExecutor = async () => { clock += CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS + 1; return resultado("Pages: 1\n"); };
    await expect(criarLeitor(executar, () => clock)(filePath)).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
  });

  it("serializa chamadas entre leitores e libera o slot depois de falha", async () => {
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const executar: ContratoPdfExecutor = async () => { started(); await blocked; throw new Error("synthetic child failure"); };
    const first = criarLeitor(executar)(filePath);
    await ready;
    await expect(criarLeitor()(filePath)).rejects.toMatchObject({ code: "PDF_PROCESSADOR_OCUPADO" });
    release();
    await expect(first).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
    await expect(criarLeitor()(filePath)).resolves.toMatchObject({ status: "concluido" });
  });

  it("mantém inode validado mesmo se caminho for substituído", async () => {
    const executar: ContratoPdfExecutor = async c => {
      if (c.ferramenta === "pdfinfo") {
        await fs.rename(filePath, `${filePath}.original`);
        await fs.writeFile(filePath, "NOT A PDF");
      }
      const header = Buffer.alloc(8);
      // The executor sees the passed descriptor, not the replacement path.
      const read = await new Promise<number>((resolve, reject) => {
        import("node:fs").then(({ read }) => read(c.inputFd, header, 0, 8, 0, (error, count) => error ? reject(error) : resolve(count)));
      });
      expect(header.subarray(0, read).toString()).toContain("%PDF-");
      return resultado(c.ferramenta === "pdfinfo" ? "Pages: 1\n" : contrato);
    };
    // Rename can change ctime, so even this conservative case must fail closed.
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  });

  it("recusa arquivo modificado durante a extração", async () => {
    const executar: ContratoPdfExecutor = async c => {
      if (c.ferramenta === "pdftotext") await fs.appendFile(filePath, "changed");
      return resultado(c.ferramenta === "pdfinfo" ? "Pages: 1\n" : contrato);
    };
    await expect(criarLeitor(executar)(filePath)).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
  });
});

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true),
  });
  childMocks.spawn.mockReturnValue(child);
  return child;
}
function comando(overrides: Partial<ContratoPdfComando> = {}): ContratoPdfComando {
  return { ferramenta: "pdftotext", argumentos: ["/proc/self/fd/3", "-"], inputFd: 42, timeoutMs: 1000, maxStdoutBytes: 100, ...overrides };
}

describe("executor Poppler limitado (child runner sintético)", () => {
  it("usa prlimit, SIGKILL, fd herdado e nenhum shell ou segredo", async () => {
    const child = fakeChild();
    const promise = executarPopplerLimitado(comando());
    child.stdout.write("texto");
    child.emit("close", 0, null);
    await expect(promise).resolves.toEqual(resultado("texto"));
    expect(childMocks.spawn).toHaveBeenCalledWith("/usr/bin/prlimit", expect.arrayContaining([`--as=${CONTRATOS_PDF_FILHO_MEMORIA_BYTES}`, "--core=0", "/usr/bin/pdftotext"]), expect.objectContaining({ shell: false, detached: false, stdio: ["ignore", "pipe", "pipe", 42], env: { LANG: "C", LC_ALL: "C" } }));
  });

  it("timeout mata o filho e só termina após close", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const promise = executarPopplerLimitado(comando());
    const rejection = expect(promise).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    await vi.advanceTimersByTimeAsync(1001);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    await rejection;
  });

  it("abort externo mata o filho e aguarda close sem resultado parcial", async () => {
    const child = fakeChild();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let settled = false;
    const pending = executarPopplerLimitado(comando({ signal: controller.signal }));
    void pending.then(() => { settled = true; }, () => { settled = true; });
    const rejection = expect(pending).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    controller.abort();
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(settled).toBe(false);
    child.emit("close", null, "SIGKILL");
    await rejection;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("sinal já abortado não abre subprocesso ou aceita leitura", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(executarPopplerLimitado(comando({ signal: controller.signal })))
      .rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    await expect(lerContratoPdfArquivo(filePath, controller.signal))
      .rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    expect(childMocks.spawn).not.toHaveBeenCalled();
  });

  it("wrapper público transmite abort e só libera outra leitura depois de close", async () => {
    const child = fakeChild();
    const controller = new AbortController();
    let started!: () => void;
    const begun = new Promise<void>(resolve => { started = resolve; });
    childMocks.spawn.mockImplementationOnce(() => { started(); return child; });
    const pending = lerContratoPdfArquivo(filePath, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ code: "PDF_TEMPO_ESGOTADO" });
    await begun;
    controller.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    await expect(criarLeitor()(filePath)).rejects.toMatchObject({ code: "PDF_PROCESSADOR_OCUPADO" });
    child.emit("close", null, "SIGKILL");
    await rejection;
    await expect(criarLeitor()(filePath)).resolves.toMatchObject({ status: "concluido" });
  });

  it.each(["stdout", "stderr"] as const)("interrompe stream %s excedido, nunca aceita truncamento", async stream => {
    const child = fakeChild();
    const promise = executarPopplerLimitado(comando());
    const rejection = expect(promise).rejects.toMatchObject({ code: stream === "stdout" ? "PDF_LIMITE_TEXTO" : "PDF_LIMITE_SAIDA" });
    child[stream].write(Buffer.alloc(stream === "stdout" ? 101 : 16 * 1024 + 1));
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    await rejection;
  });

  it.each(["stdout", "stderr"] as const)("recusa erro no pipe %s e mata o subprocesso", async stream => {
    const child = fakeChild();
    const promise = executarPopplerLimitado(comando());
    const rejection = expect(promise).rejects.toMatchObject({ code: "PDF_EXTRACAO_INCOMPLETA" });
    child[stream].emit("error", new Error("synthetic pipe failure"));
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    await rejection;
  });

  it("preserva erro de spawn e códigos de falha/sinais do filho", async () => {
    for (const failure of ["spawn", "exit", "signal"]) {
      const child = fakeChild();
      const promise = executarPopplerLimitado(comando());
      const rejection = expect(promise).rejects.toMatchObject({ code: failure === "spawn" ? "PDF_PROCESSADOR_INDISPONIVEL" : "PDF_EXTRACAO_INCOMPLETA" });
      if (failure === "spawn") child.emit("error", new Error("ENOENT"));
      child.emit("close", failure === "exit" ? 99 : null, failure === "signal" ? "SIGKILL" : null);
      await rejection;
    }
  });
});

/** Fully synthetic PDF with exact object offsets; no uploaded contract/object. */
function tinyPdf(): Buffer {
  const stream = `BT\n/F1 11 Tf\n40 760 Td\n(${contrato.replace(/\n/g, ") Tj\n0 -16 Td\n(")}) Tj\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

describe("runtime local com Poppler e PDF mínimo sintético (sem LLM/OCR/rede)", () => {
  it("export público extrai todas as páginas do PDF sintético dentro do teto do filho", async () => {
    for (const binary of ["/usr/bin/prlimit", "/usr/bin/pdfinfo", "/usr/bin/pdftotext"]) await fs.access(binary, constants.X_OK);
    childMocks.real = true;
    const bytes = tinyPdf();
    expect(bytes.length).toBeLessThan(2048);
    await fs.writeFile(filePath, bytes);
    const leitura = await lerContratoPdfArquivo(filePath);
    expect(leitura).toMatchObject({ paginas: 1, textoExtraido: contrato, status: "concluido" });
    expect(leitura.pontosImportantes.map(p => p.categoria)).toEqual(expect.arrayContaining(["partes", "vigencia", "pagamento", "glosa_recurso", "tabelas_valores", "dados_e_sigilo", "contatos"]));
  });
});
