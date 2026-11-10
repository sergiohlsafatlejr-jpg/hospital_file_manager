import { createReadStream, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { extname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TextDecoder } from "node:util";
import * as zlib from "node:zlib";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import yauzl, { type Entry, type ZipFile, type LocalFileHeader } from "yauzl";

/** Budgets apply to CSV/ZIP only, not to the existing ExcelJS/Decimal path. */
export const WARLEINE_CSV_ZIP_LIMITS = Object.freeze({
  maxInputBytes: 300 * 1024 * 1024,
  maxExpandedBytes: 1024 * 1024 * 1024,
  maxRecordBytes: 1024 * 1024,
  maxFieldBytes: 256 * 1024,
  maxRecords: 5_000_001, // Header + up to five million logical data records.
  maxMembers: 64, // One CSV plus its optional parent directory entries.
  maxDurationMs: 15 * 60 * 1000,
});
export type WarleineCsvZipLimits = typeof WARLEINE_CSV_ZIP_LIMITS;
export type WarleineCsvZipOptions = {
  deadlineAtMs?: number;
  signal?: AbortSignal;
  /** Tests/callers may tighten, never exceed, the production ceilings. */
  limits?: Partial<{ [K in keyof WarleineCsvZipLimits]: number }>;
};

function invalid(code: string): Error {
  // No field contents, archive paths or patient information in error messages.
  return new Error(`Arquivo CSV/ZIP Warleine rejeitado: ${code}.`);
}

class ReadBudget {
  readonly limits: { -readonly [K in keyof WarleineCsvZipLimits]: number };
  readonly controller = new AbortController();
  readonly deadline: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly cleanup = new Set<() => void>();
  constructor(options: WarleineCsvZipOptions) {
    this.limits = { ...WARLEINE_CSV_ZIP_LIMITS };
    for (const key of Object.keys(options.limits || {}) as Array<
      keyof WarleineCsvZipLimits
    >) {
      const value = options.limits![key]!;
      if (
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > this.limits[key]
      )
        throw invalid("ORCAMENTO_INVALIDO");
      this.limits[key] = value;
    }
    if (
      options.deadlineAtMs !== undefined &&
      !Number.isFinite(options.deadlineAtMs)
    )
      throw invalid("DEADLINE_INVALIDO");
    this.deadline = Math.min(
      Date.now() + this.limits.maxDurationMs,
      options.deadlineAtMs ?? Infinity
    );
    this.timer = setTimeout(
      () => this.abort(invalid("TEMPO_ESGOTADO")),
      Math.max(1, this.deadline - Date.now())
    );
    this.timer.unref();
    if (options.signal) {
      const abort = () => this.abort(invalid("LEITURA_CANCELADA"));
      options.signal.addEventListener("abort", abort, { once: true });
      this.cleanup.add(() =>
        options.signal!.removeEventListener("abort", abort)
      );
      if (options.signal.aborted) abort();
    }
  }
  check() {
    if (Date.now() >= this.deadline) this.abort(invalid("TEMPO_ESGOTADO"));
    if (this.controller.signal.aborted) throw this.controller.signal.reason;
  }
  own(close: () => void) {
    this.cleanup.add(close);
  }
  abort(error: Error) {
    if (!this.controller.signal.aborted) this.controller.abort(error);
  }
  async wait<T>(
    start: (callback: (error: Error | null, value?: T) => void) => void,
    closeLate?: (value: T) => void
  ): Promise<T> {
    this.check();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const signal = this.controller.signal;
      const abort = () => done(signal.reason);
      const done = (error: Error | null, value?: T) => {
        if (settled) {
          if (value !== undefined) closeLate?.(value);
          return;
        }
        settled = true;
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(value as T);
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        start(done);
      } catch (error) {
        done(error as Error);
      }
    });
  }
  finish() {
    clearTimeout(this.timer);
    this.abort(invalid("LEITURA_ENCERRADA"));
    for (const close of this.cleanup) close();
    this.cleanup.clear();
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function updateCrc(buffer: Buffer, previous: number): number {
  if (typeof zlib.crc32 === "function") return zlib.crc32(buffer, previous);
  let crc = previous ^ 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Raw byte guard runs BEFORE csv-parse allocates fields/records. csv-parse owns CSV grammar. */
class CsvByteGuard extends Transform {
  bytes = 0;
  crc = 0;
  private recordBytes = 0;
  private fieldBytes = 0;
  private columns = 1;
  private quoted = false;
  private readonly decoder = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  });
  constructor(
    private readonly budget: ReadBudget,
    private readonly expected?: Entry
  ) {
    super();
  }
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void
  ) {
    try {
      this.budget.check();
      this.bytes += chunk.length;
      if (
        this.bytes > this.budget.limits.maxExpandedBytes ||
        (this.expected && this.bytes > this.expected.uncompressedSize)
      )
        throw invalid("BYTES_EXPANDIDOS_EXCEDIDOS");
      this.crc = updateCrc(chunk, this.crc);
      try {
        this.decoder.decode(chunk, { stream: true });
      } catch {
        throw invalid("UTF8_INVALIDO");
      }
      for (const byte of chunk) {
        if (byte === 0) throw invalid("CONTEUDO_BINARIO");
        if ((byte === 10 || byte === 13) && !this.quoted) {
          this.recordBytes = 0;
          this.fieldBytes = 0;
          this.columns = 1;
          continue;
        }
        this.recordBytes++;
        if (byte === 59 && !this.quoted) {
          this.fieldBytes = 0;
          if (++this.columns > 48) throw invalid("COLUNAS_EXCEDENTES");
        } else {
          this.fieldBytes++;
          if (byte === 34) this.quoted = !this.quoted; // Escaped pairs toggle twice, including across chunks.
        }
        if (this.recordBytes > this.budget.limits.maxRecordBytes)
          throw invalid("REGISTRO_EXCEDIDO");
        if (this.fieldBytes > this.budget.limits.maxFieldBytes)
          throw invalid("CAMPO_EXCEDIDO");
      }
      this.budget.check();
      callback(null, chunk);
    } catch (error) {
      callback(error as Error);
    }
  }
  _flush(callback: (error?: Error | null) => void) {
    try {
      this.budget.check();
      try {
        this.decoder.decode();
      } catch {
        throw invalid("UTF8_INVALIDO");
      }
      if (this.quoted) throw invalid("ASPAS_NAO_FECHADAS");
      if (
        this.expected &&
        (this.bytes !== this.expected.uncompressedSize ||
          this.crc !== this.expected.crc32)
      )
        throw invalid("ZIP_INTEGRIDADE_INVALIDA");
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

function csvOptions(maxRecordBytes: number) {
  return {
    delimiter: ";",
    bom: true,
    encoding: "utf8" as const,
    relax_quotes: false,
    relax_column_count: true,
    skip_empty_lines: true,
    max_record_size: maxRecordBytes,
    record_delimiter: ["\r\n", "\n", "\r"],
  };
}

/** Compatibility function for one complete logical record; not a physical-line iterator. */
export function splitWarleineCsvRecord(
  record: string,
  delimiter = ";"
): string[] {
  if (
    Buffer.byteLength(record, "utf8") > WARLEINE_CSV_ZIP_LIMITS.maxRecordBytes
  )
    throw invalid("REGISTRO_EXCEDIDO");
  try {
    const rows = parseSync(record, {
      ...csvOptions(WARLEINE_CSV_ZIP_LIMITS.maxRecordBytes),
      delimiter,
    }) as string[][];
    if (rows.length !== 1) throw invalid("REGISTRO_LOGICO_UNICO_EXIGIDO");
    return rows[0];
  } catch {
    throw invalid("SINTAXE_CSV_INVALIDA");
  }
}

async function* csvRows(
  source: Readable,
  budget: ReadBudget,
  expected?: Entry,
  inflate?: zlib.InflateRaw
): AsyncGenerator<string[]> {
  const guard = new CsvByteGuard(budget, expected);
  let records = 0;
  const parser = parse({
    ...csvOptions(budget.limits.maxRecordBytes),
    raw: true,
    on_record: (value: unknown) => {
      budget.check();
      // csv-parse's stream overload omits the raw=true wrapper from its types.
      const parsed = value as { record: string[]; raw: string };
      const row = parsed.record;
      if (!parsed.raw.trim()) return null;
      if (row.length !== 48) throw invalid("48_COLUNAS_INTEIRAS_EXIGIDAS");
      if (++records > budget.limits.maxRecords)
        throw invalid("QUANTIDADE_REGISTROS_EXCEDIDA");
      return row;
    },
  });
  for (const stream of [source, inflate, guard, parser])
    if (stream) budget.own(() => stream.destroy());
  let failure: unknown;
  const completion = (
    inflate
      ? pipeline(source, inflate, guard, parser, {
          signal: budget.controller.signal,
        })
      : pipeline(source, guard, parser, { signal: budget.controller.signal })
  ).catch(error => {
    failure = error;
  }); // Attach immediately: no unhandled rejection on early return.
  try {
    for await (const row of parser) {
      budget.check();
      yield row as string[];
      budget.check();
    }
    await completion;
    budget.check();
    if (failure) throw failure;
    if (!records) throw invalid("CSV_VAZIO");
    if (inflate && expected && inflate.bytesWritten !== expected.compressedSize)
      throw invalid("ZIP_DADOS_COMPRIMIDOS_AMBIGUOS");
  } catch (error) {
    budget.check();
    if (
      error instanceof Error &&
      error.message.startsWith("Arquivo CSV/ZIP Warleine rejeitado:")
    )
      throw error;
    throw invalid("SINTAXE_CSV_OU_INTEGRIDADE_ZIP_INVALIDA");
  } finally {
    source.destroy();
    inflate?.destroy();
    guard.destroy();
    parser.destroy();
    await completion;
  }
}

async function readAt(
  file: FileHandle,
  position: number,
  size: number,
  budget: ReadBudget
): Promise<Buffer> {
  budget.check();
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await file.read(
      buffer,
      offset,
      size - offset,
      position + offset
    );
    budget.check();
    if (!bytesRead) throw invalid("ZIP_TRUNCADO");
    offset += bytesRead;
  }
  return buffer;
}

/** Validate ZIP envelope (including small ZIP64), disallow prepended/trailing disguised formats. */
async function zipEnvelope(file: FileHandle, size: number, budget: ReadBudget) {
  if (
    size < 22 ||
    (await readAt(file, 0, 4, budget)).readUInt32LE() !== 0x04034b50
  )
    throw invalid("ASSINATURA_ZIP_INVALIDA");
  const tailSize = Math.min(size, 65_557);
  const tail = await readAt(file, size - tailSize, tailSize, budget);
  let index = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      tail.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + tail.readUInt16LE(i + 20) === tail.length
    ) {
      index = i;
      break;
    }
  }
  if (index < 0) throw invalid("ZIP_TRUNCADO");
  const endOffset = size - tailSize + index;
  if (tail.readUInt16LE(index + 4) || tail.readUInt16LE(index + 6))
    throw invalid("ZIP_MULTIDISCO");
  let count = tail.readUInt16LE(index + 10);
  let centralSize = tail.readUInt32LE(index + 12);
  let centralOffset = tail.readUInt32LE(index + 16);
  let centralEnd = endOffset;
  if (
    count === 0xffff ||
    centralOffset === 0xffffffff ||
    centralSize === 0xffffffff
  ) {
    const locator = await readAt(file, endOffset - 20, 20, budget);
    if (
      locator.readUInt32LE() !== 0x07064b50 ||
      locator.readUInt32LE(4) !== 0 ||
      locator.readUInt32LE(16) !== 1
    )
      throw invalid("ZIP64_INVALIDO");
    const zip64Offset = Number(locator.readBigUInt64LE(8));
    if (
      !Number.isSafeInteger(zip64Offset) ||
      zip64Offset < 0 ||
      zip64Offset > endOffset - 76
    )
      throw invalid("ZIP64_INVALIDO");
    const zip64 = await readAt(file, zip64Offset, 56, budget);
    if (
      zip64.readUInt32LE() !== 0x06064b50 ||
      Number(zip64.readBigUInt64LE(4)) !== 44 ||
      zip64.readUInt32LE(16) ||
      zip64.readUInt32LE(20) ||
      zip64Offset + 56 !== endOffset - 20
    )
      throw invalid("ZIP64_INVALIDO");
    count = Number(zip64.readBigUInt64LE(32));
    if (zip64.readBigUInt64LE(24) !== zip64.readBigUInt64LE(32))
      throw invalid("ZIP_MULTIDISCO");
    centralSize = Number(zip64.readBigUInt64LE(40));
    centralOffset = Number(zip64.readBigUInt64LE(48));
    centralEnd = zip64Offset;
  } else if (count !== tail.readUInt16LE(index + 8))
    throw invalid("ZIP_MULTIDISCO");
  if (
    ![count, centralSize, centralOffset].every(Number.isSafeInteger) ||
    count < 1 ||
    count > budget.limits.maxMembers
  )
    throw invalid("MEMBROS_EXCEDIDOS_OU_AUSENTES");
  if (
    centralOffset < 4 ||
    centralSize < 46 ||
    centralOffset + centralSize !== centralEnd
  )
    throw invalid("ZIP_ESTRUTURA_AMBIGUA");
  return { count, centralSize, centralOffset };
}

function safeMember(entry: Entry) {
  const name = entry.fileName;
  const directory = name.endsWith("/");
  const components = (directory ? name.slice(0, -1) : name).split("/");
  if (
    !name ||
    /[\\:\x00-\x1f\x7f]/.test(name) ||
    components.some(
      part => !part || part === "." || part === ".." || /[ .]$/.test(part)
    )
  )
    throw invalid("ZIP_CAMINHO_INDEVIDO");
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (mode && mode !== (directory ? 0x4000 : 0x8000))
    throw invalid("ZIP_LINK_OU_MEMBRO_ESPECIAL");
  if (Boolean(entry.externalFileAttributes & 0x10) && !directory)
    throw invalid("ZIP_TIPO_MEMBRO_AMBIGUO");
  if (entry.extraFields.some(field => [0x000d, 0x756e].includes(field.id)))
    throw invalid("ZIP_METADADOS_LINK_INDEVIDOS");
  if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
    throw invalid("ZIP_ENCRIPTADO_OU_METODO_INDEVIDO");
  if (
    directory &&
    (entry.uncompressedSize !== 0 ||
      entry.compressedSize !== 0 ||
      entry.crc32 !== 0)
  )
    throw invalid("ZIP_DIRETORIO_COM_CONTEUDO");
  if (!directory && extname(name).toLowerCase() !== ".csv")
    throw invalid("ZIP_MEMBRO_NAO_CSV");
  return { name, directory, key: name.normalize("NFC").toLowerCase() };
}

async function eligibleCsv(
  zip: ZipFile,
  file: FileHandle,
  envelope: Awaited<ReturnType<typeof zipEnvelope>>,
  budget: ReadBudget
): Promise<Entry> {
  const entries: Array<{
    entry: Entry;
    local: LocalFileHeader;
    directory: boolean;
  }> = [];
  const names = new Set<string>();
  let centralBytes = 0;
  for (let i = 0; i < envelope.count; i++) {
    const central = await readAt(
      file,
      envelope.centralOffset + centralBytes,
      46,
      budget
    );
    if (central.readUInt32LE() !== 0x02014b50 || central.readUInt16LE(34) !== 0)
      throw invalid("ZIP_MULTIDISCO_OU_DIRETORIO_INVALIDO");
    const entry = await budget.wait<Entry>(done => {
      const onEntry = (value: Entry) => {
        cleanup();
        done(null, value);
      };
      const onEnd = () => {
        cleanup();
        done(invalid("ZIP_MEMBROS_TRUNCADOS"));
      };
      const onAbort = () => cleanup();
      const cleanup = () => {
        zip.removeListener("entry", onEntry);
        zip.removeListener("end", onEnd);
        budget.controller.signal.removeEventListener("abort", onAbort);
      };
      zip.once("entry", onEntry);
      zip.once("end", onEnd);
      budget.controller.signal.addEventListener("abort", onAbort, {
        once: true,
      });
      zip.readEntry();
    });
    const member = safeMember(entry);
    if (names.has(member.key)) throw invalid("ZIP_MEMBROS_DUPLICADOS");
    names.add(member.key);
    if (entry.uncompressedSize > budget.limits.maxExpandedBytes)
      throw invalid("BYTES_EXPANDIDOS_EXCEDIDOS");
    centralBytes +=
      46 +
      entry.fileNameLength +
      entry.extraFieldLength +
      entry.fileCommentLength;
    const local = await budget.wait<LocalFileHeader>(done =>
      zip.readLocalFileHeader(entry, {}, done)
    );
    if (
      !local.fileName.equals(entry.fileNameRaw) ||
      local.compressionMethod !== entry.compressionMethod ||
      local.generalPurposeBitFlag !== entry.generalPurposeBitFlag
    )
      throw invalid("ZIP_CABECALHOS_AMBIGUOS");
    if (
      !(entry.generalPurposeBitFlag & 8) &&
      (local.crc32 !== entry.crc32 ||
        (local.compressedSize !== 0xffffffff &&
          local.compressedSize !== entry.compressedSize) ||
        (local.uncompressedSize !== 0xffffffff &&
          local.uncompressedSize !== entry.uncompressedSize))
    )
      throw invalid("ZIP_CABECALHOS_AMBIGUOS");
    entries.push({ entry, local, directory: member.directory });
  }
  if (centralBytes !== envelope.centralSize)
    throw invalid("ZIP_DIRETORIO_CENTRAL_AMBIGUO");
  const files = entries.filter(item => !item.directory);
  if (files.length !== 1) throw invalid("ZIP_EXIGE_UM_CSV");
  const selected = files[0].entry;
  for (const item of entries)
    if (item.directory && !selected.fileName.startsWith(item.entry.fileName))
      throw invalid("ZIP_DIRETORIO_INDEVIDO");
  entries.sort(
    (a, b) =>
      a.entry.relativeOffsetOfLocalHeader - b.entry.relativeOffsetOfLocalHeader
  );
  if (entries[0].entry.relativeOffsetOfLocalHeader !== 0)
    throw invalid("ZIP_ESTRUTURA_AMBIGUA");
  for (let i = 0; i < entries.length; i++) {
    const { entry, local } = entries[i];
    const dataEnd = local.fileDataStart + entry.compressedSize;
    const nextOffset =
      entries[i + 1]?.entry.relativeOffsetOfLocalHeader ??
      envelope.centralOffset;
    const gap = nextOffset - dataEnd;
    if (!(entry.generalPurposeBitFlag & 8)) {
      if (gap !== 0) throw invalid("ZIP_MEMBROS_OCULTOS_OU_SOBREPOSTOS");
    } else {
      if (![12, 16, 20, 24].includes(gap))
        throw invalid("ZIP_DESCRIPTOR_INVALIDO");
      const descriptor = await readAt(file, dataEnd, gap, budget);
      const start = gap === 16 || gap === 24 ? 4 : 0;
      if (start && descriptor.readUInt32LE() !== 0x08074b50)
        throw invalid("ZIP_DESCRIPTOR_INVALIDO");
      const wide = gap >= 20;
      const compressed = wide
        ? Number(descriptor.readBigUInt64LE(start + 4))
        : descriptor.readUInt32LE(start + 4);
      const expanded = wide
        ? Number(descriptor.readBigUInt64LE(start + 12))
        : descriptor.readUInt32LE(start + 8);
      if (
        descriptor.readUInt32LE(start) !== entry.crc32 ||
        compressed !== entry.compressedSize ||
        expanded !== entry.uncompressedSize
      )
        throw invalid("ZIP_DESCRIPTOR_INVALIDO");
    }
  }
  return selected;
}

/** Fully consume before publication. Throws on structural/integrity failures, closes on return/throw/abort. */
export async function* iterateWarleineCsvZipRows(
  filePath: string,
  fileName: string,
  options: WarleineCsvZipOptions = {}
): AsyncGenerator<string[]> {
  const budget = new ReadBudget(options);
  let file: FileHandle | undefined;
  let zip: ZipFile | undefined;
  let zipClosed: Promise<void> | undefined;
  try {
    budget.check();
    const ext = extname(fileName || filePath).toLowerCase();
    if (ext !== ".csv" && ext !== ".zip") throw invalid("FORMATO_NAO_CSV_ZIP");
    file = await budget.wait<FileHandle>(
      done => {
        fs.open(filePath, "r").then(value => done(null, value), done);
      },
      late => {
        void late.close().catch(() => undefined);
      }
    );
    const stat = await file.stat();
    budget.check();
    if (!stat.isFile() || stat.size > budget.limits.maxInputBytes)
      throw invalid("TAMANHO_OU_ARQUIVO_INVALIDO");
    if (ext === ".csv") {
      yield* csvRows(
        createReadStream(filePath, {
          fd: file.fd,
          autoClose: false,
          highWaterMark: 16 * 1024,
        }),
        budget
      );
    } else {
      const envelope = await zipEnvelope(file, stat.size, budget);
      zip = await budget.wait<ZipFile>(
        done =>
          yauzl.open(
            filePath,
            {
              autoClose: false,
              lazyEntries: true,
              strictFileNames: true,
              validateEntrySizes: true,
            },
            done
          ),
        late => late.close()
      );
      zipClosed = new Promise<void>(resolve => zip!.once("close", resolve));
      const onError = () => budget.abort(invalid("ZIP_ESTRUTURA_INVALIDA"));
      zip.on("error", onError);
      // ZIP and envelope FileHandle own separate descriptors, closed independently.
      const zipOwner = zip;
      budget.own(() => zipOwner.close());
      const abortZip = () => zipOwner.close();
      budget.controller.signal.addEventListener("abort", abortZip, {
        once: true,
      });
      zip.once("close", () => {
        zipOwner.removeListener("error", onError);
        budget.controller.signal.removeEventListener("abort", abortZip);
      });
      const entry = await eligibleCsv(zip, file, envelope, budget);
      const source = await budget.wait<Readable>(
        done => zip!.openReadStream(entry, { decodeFileData: false }, done),
        late => late.destroy()
      );
      yield* csvRows(
        source,
        budget,
        entry,
        entry.compressionMethod === 8
          ? zlib.createInflateRaw({ chunkSize: 16 * 1024 })
          : undefined
      );
    }
  } catch (error) {
    budget.check();
    if (
      error instanceof Error &&
      error.message.startsWith("Arquivo CSV/ZIP Warleine rejeitado:")
    )
      throw error;
    throw invalid("LEITURA_OU_ESTRUTURA_INVALIDA");
  } finally {
    budget.finish();
    if (zip?.isOpen) zip.close();
    if (zipClosed) await zipClosed;
    if (file) await file.close().catch(() => undefined);
  }
}
