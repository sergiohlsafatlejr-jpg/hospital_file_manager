import { spawn } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type {
  ContratoConvenioPdfLeitura,
  ContratoConvenioPonto,
} from "./contratosConveniosPdfService";

export const CONTRATOS_PDF_ARQUIVO_MAX_BYTES = 150 * 1024 * 1024;
export const CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS = 512;
export const CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES = 2 * 1024 * 1024;
export const CONTRATOS_PDF_ARQUIVO_MAX_LINHAS = 50_000;
export const CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS = 75_000;
export const CONTRATOS_PDF_FILHO_MEMORIA_BYTES = 128 * 1024 * 1024;
const MAX_INFO_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const INFO_TIMEOUT_MS = 10_000;
const TEXTO_TIMEOUT_MS = 60_000;

export type ContratoPdfArquivoCodigo =
  | "PDF_ARQUIVO_INVALIDO"
  | "PDF_LIMITE_BYTES"
  | "PDF_LIMITE_PAGINAS"
  | "PDF_LIMITE_TEXTO"
  | "PDF_LIMITE_SAIDA"
  | "PDF_TEMPO_ESGOTADO"
  | "PDF_PROCESSADOR_INDISPONIVEL"
  | "PDF_EXTRACAO_INCOMPLETA"
  | "PDF_PROCESSADOR_OCUPADO";

/** A failure is never represented as a concluded or OCR-only reading. */
export class ContratoPdfArquivoError extends Error {
  constructor(public readonly code: ContratoPdfArquivoCodigo, message: string) {
    super(message);
    this.name = "ContratoPdfArquivoError";
  }
}

export interface ContratoPdfComando {
  ferramenta: "pdfinfo" | "pdftotext";
  argumentos: string[];
  inputFd: number;
  timeoutMs: number;
  maxStdoutBytes: number;
  signal?: AbortSignal;
}
export interface ContratoPdfComandoResultado {
  stdout: Buffer;
  stderr: Buffer;
}
export type ContratoPdfExecutor = (
  comando: ContratoPdfComando
) => Promise<ContratoPdfComandoResultado>;

function falhar(code: ContratoPdfArquivoCodigo, message: string): never {
  throw new ContratoPdfArquivoError(code, message);
}

/** Linux production: no shell, no network, no output file, no core dumps.
 * fd 3 survives prlimit's exec and fixes the validated inode for both tools.
 * RLIMIT_AS is a virtual-address-space ceiling, not a container RSS limit.
 */
export const executarPopplerLimitado: ContratoPdfExecutor = comando => {
  if (comando.signal?.aborted || !Number.isFinite(comando.timeoutMs) || comando.timeoutMs <= 0) {
    return Promise.reject(new ContratoPdfArquivoError("PDF_TEMPO_ESGOTADO", "Prazo de leitura do PDF esgotado."));
  }
  return new Promise((resolve, reject) => {
    const args = [
      `--as=${CONTRATOS_PDF_FILHO_MEMORIA_BYTES}`,
      `--cpu=${Math.max(1, Math.ceil(comando.timeoutMs / 1000))}`,
      "--core=0",
      "--",
      `/usr/bin/${comando.ferramenta}`,
      ...comando.argumentos,
    ];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("/usr/bin/prlimit", args, {
        shell: false,
        detached: false,
        stdio: ["ignore", "pipe", "pipe", comando.inputFd],
        // Only locale is supplied: project secrets are not passed to Poppler.
        env: { LANG: "C", LC_ALL: "C" },
      });
    } catch {
      reject(new ContratoPdfArquivoError("PDF_PROCESSADOR_INDISPONIVEL", "Processador PDF local indisponível."));
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: ContratoPdfArquivoError | undefined;
    const abort = (error: ContratoPdfArquivoError) => {
      if (failure) return;
      failure = error;
      child.kill("SIGKILL");
    };
    const onAbort = () => abort(new ContratoPdfArquivoError(
      "PDF_TEMPO_ESGOTADO", "Leitura PDF interrompida; resultado não confirmado."
    ));
    comando.signal?.addEventListener("abort", onAbort, { once: true });
    if (comando.signal?.aborted) onAbort();
    const timer = setTimeout(() => abort(new ContratoPdfArquivoError(
      "PDF_TEMPO_ESGOTADO", "Prazo de leitura do PDF esgotado."
    )), comando.timeoutMs);
    child.stdout!.on("data", (bytes: Buffer) => {
      if (failure) return;
      stdoutBytes += bytes.length;
      if (stdoutBytes > comando.maxStdoutBytes) {
        abort(new ContratoPdfArquivoError(
          comando.ferramenta === "pdftotext" ? "PDF_LIMITE_TEXTO" : "PDF_LIMITE_SAIDA",
          "A saída da leitura PDF excede o limite seguro; nenhum texto parcial foi aceito."
        ));
        return;
      }
      stdout.push(bytes);
    });
    child.stderr!.on("data", (bytes: Buffer) => {
      if (failure) return;
      stderrBytes += bytes.length;
      if (stderrBytes > MAX_STDERR_BYTES) {
        abort(new ContratoPdfArquivoError("PDF_LIMITE_SAIDA", "Diagnóstico do processador PDF excede o limite seguro."));
        return;
      }
      stderr.push(bytes);
    });
    const pipeError = () => abort(new ContratoPdfArquivoError(
      "PDF_EXTRACAO_INCOMPLETA", "Falha na leitura da saída do processador PDF."
    ));
    child.stdout!.on("error", pipeError);
    child.stderr!.on("error", pipeError);
    child.on("error", () => abort(new ContratoPdfArquivoError(
      "PDF_PROCESSADOR_INDISPONIVEL", "Processador PDF local indisponível."
    )));
    child.on("close", (code, signal) => {
      // Do not release the admission slot until the child and pipes close.
      clearTimeout(timer);
      comando.signal?.removeEventListener("abort", onAbort);
      if (failure) { reject(failure); return; }
      if (code !== 0 || signal) {
        reject(new ContratoPdfArquivoError("PDF_EXTRACAO_INCOMPLETA", "O processador PDF falhou ou atingiu um limite de recursos; leitura não concluída."));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout, stdoutBytes), stderr: Buffer.concat(stderr, stderrBytes) });
    });
  });
};

interface DependenciasLeitor {
  normalizarTexto: (texto: string) => string;
  extrairPontos: (texto: string) => ContratoConvenioPonto[];
  executar?: ContratoPdfExecutor;
  agora?: () => number;
}

// Shared across factory instances in this process. Reject instead of queueing:
// queued requests would retain additional /tmp PDFs inside the 512 MiB budget.
let leituraEmCurso = false;

export function criarLeitorContratoPdfArquivo(deps: DependenciasLeitor) {
  const executar = deps.executar ?? executarPopplerLimitado;
  const agora = deps.agora ?? (() => performance.now());
  return async (filePath: string, signal?: AbortSignal): Promise<ContratoConvenioPdfLeitura> => {
    if (signal?.aborted) falhar("PDF_TEMPO_ESGOTADO", "Leitura PDF interrompida; resultado não confirmado.");
    if (leituraEmCurso) falhar("PDF_PROCESSADOR_OCUPADO", "Já existe uma leitura PDF nesta instância; consulte o status antes de tentar novamente.");
    leituraEmCurso = true;
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    const deadline = agora() + CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS;
    const restante = (max: number) => {
      if (signal?.aborted) falhar("PDF_TEMPO_ESGOTADO", "Leitura PDF interrompida; resultado não confirmado.");
      const ms = Math.floor(Math.min(max, deadline - agora()));
      if (ms <= 0) falhar("PDF_TEMPO_ESGOTADO", "Prazo de leitura do PDF esgotado.");
      return ms;
    };
    try {
      if (typeof filePath !== "string" || !filePath || filePath.includes("\0") || !path.isAbsolute(filePath)) {
        falhar("PDF_ARQUIVO_INVALIDO", "Informe um caminho absoluto de arquivo PDF local.");
      }
      try {
        // NONBLOCK prevents opening a FIFO from hanging before fstat.
        file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      } catch {
        falhar("PDF_ARQUIVO_INVALIDO", "Arquivo PDF local indisponível ou caminho simbólico inválido.");
      }
      const original = await file.stat();
      if (!original.isFile() || original.size <= 0) falhar("PDF_ARQUIVO_INVALIDO", "O PDF deve ser um arquivo regular não vazio.");
      if (original.size > CONTRATOS_PDF_ARQUIVO_MAX_BYTES) falhar("PDF_LIMITE_BYTES", "Cada PDF deve ter no máximo 150 MiB.");
      const header = Buffer.alloc(1024);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (!header.subarray(0, bytesRead).includes(Buffer.from("%PDF-", "ascii"))) {
        falhar("PDF_ARQUIVO_INVALIDO", "O arquivo enviado não possui cabeçalho PDF válido.");
      }
      const run = async (ferramenta: ContratoPdfComando["ferramenta"], argumentos: string[], maxStdoutBytes: number, timeout: number) => {
        const result = await executar({ ferramenta, argumentos, inputFd: file!.fd, maxStdoutBytes, timeoutMs: restante(timeout), signal });
        restante(CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS);
        // Defense in depth for alternate/test executors; never silently slice.
        if (!Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) falhar("PDF_EXTRACAO_INCOMPLETA", "Resposta inválida do processador PDF.");
        if (result.stdout.length > maxStdoutBytes) falhar(ferramenta === "pdftotext" ? "PDF_LIMITE_TEXTO" : "PDF_LIMITE_SAIDA", "Saída PDF excede o limite seguro.");
        if (result.stderr.length > MAX_STDERR_BYTES) falhar("PDF_LIMITE_SAIDA", "Diagnóstico PDF excede o limite seguro.");
        if (result.stderr.toString("utf8").trim()) falhar("PDF_EXTRACAO_INCOMPLETA", "O processador PDF emitiu avisos ou erros; leitura integral não confirmada.");
        try { return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout); }
        catch { falhar("PDF_EXTRACAO_INCOMPLETA", "Texto PDF possui codificação incompleta ou inválida."); }
      };
      const input = "/proc/self/fd/3";
      const info = await run("pdfinfo", ["-enc", "UTF-8", input], MAX_INFO_BYTES, INFO_TIMEOUT_MS);
      const pages = [...info.matchAll(/^Pages:\s*([0-9]+)\s*$/gm)];
      const paginas = pages.length === 1 ? Number(pages[0][1]) : 0;
      if (!Number.isSafeInteger(paginas) || paginas <= 0) falhar("PDF_EXTRACAO_INCOMPLETA", "Não foi possível confirmar o total de páginas do PDF.");
      if (paginas > CONTRATOS_PDF_ARQUIVO_MAX_PAGINAS) falhar("PDF_LIMITE_PAGINAS", "O PDF excede 512 páginas; nenhuma leitura parcial foi aceita.");
      // Do not bypass copy restrictions, passwords, or resource failures.
      if (/^Encrypted:\s*yes\b/im.test(info)) falhar("PDF_EXTRACAO_INCOMPLETA", "PDF protegido; leitura integral não confirmada.");
      const texto = await run("pdftotext", ["-f", "1", "-l", String(paginas), "-enc", "UTF-8", "-eol", "unix", input, "-"], CONTRATOS_PDF_ARQUIVO_MAX_TEXTO_BYTES, TEXTO_TIMEOUT_MS);
      let linhas = 1;
      for (let i = 0; i < texto.length; i++) {
        if ((texto[i] === "\n" || texto[i] === "\f" || texto[i] === "\r") && ++linhas > CONTRATOS_PDF_ARQUIVO_MAX_LINHAS) {
          falhar("PDF_LIMITE_TEXTO", "O texto PDF excede o limite de linhas; leitura integral não confirmada.");
        }
      }
      const final = await file.stat();
      if (final.size !== original.size || final.mtimeMs !== original.mtimeMs || final.ctimeMs !== original.ctimeMs) {
        falhar("PDF_EXTRACAO_INCOMPLETA", "O PDF foi alterado durante a leitura.");
      }
      const textoExtraido = deps.normalizarTexto(texto);
      const pontosImportantes = deps.extrairPontos(textoExtraido);
      restante(CONTRATOS_PDF_ARQUIVO_TIMEOUT_MS);
      return { paginas, textoExtraido, pontosImportantes, status: textoExtraido.length >= 80 ? "concluido" : "ocr_necessario" };
    } catch (error) {
      if (error instanceof ContratoPdfArquivoError) throw error;
      falhar("PDF_EXTRACAO_INCOMPLETA", "Não foi possível confirmar a leitura integral do PDF local.");
    } finally {
      try { await file?.close(); }
      finally { leituraEmCurso = false; }
    }
  };
}
