import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs, readlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync, gzipSync, crc32 } from "node:zlib";
import type { Readable } from "node:stream";
import yauzl, { type ZipFile } from "yauzl";
import ExcelJS from "exceljs";
import archiver from "archiver";
import {
  iterateWarleineCsvZipRows,
  splitWarleineCsvRecord,
  WARLEINE_CSV_ZIP_LIMITS,
  type WarleineCsvZipOptions,
} from "./warleineCsvZipReader";

const database = vi.hoisted(() => ({ pool: null as any }));
vi.mock("./db", () => ({
  getRawPool: async () => {
    if (!database.pool)
      throw new Error("REAL_DATABASE_DISABLED_SYNTHETIC_TEST");
    return database.pool;
  },
}));
import {
  iterateWarleineFileRows,
  importWarleineFaturamentoFile,
  parseWarleineRow,
  WARLEINE_XLSX_HEADERS,
} from "./warleineFaturamentoImportService";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "issue177-synthetic-parser-"));
  database.pool = null;
});
afterEach(async () => {
  vi.restoreAllMocks();
  database.pool = null;
  await fs.rm(root, { recursive: true, force: true });
});
function row(): string[] {
  const result = Array<string>(48).fill("");
  result[0] = "SYNTHETIC_PAYER";
  result[1] = "SYN";
  result[2] = "2026/10";
  result[7] = "SYN-0001";
  result[18] = "SYNTHETIC_ITEM";
  result[20] = "S";
  result[25] = "1";
  result[26] = "100,00";
  result[30] = "100,00";
  result[47] = "100,00";
  return result;
}
function csvRecord(values: readonly unknown[]): string {
  return values
    .map(value => {
      const text = String(value);
      return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(";");
}
function csv(rows: string[][] = [row()]): string {
  return (
    [csvRecord(WARLEINE_XLSX_HEADERS), ...rows.map(csvRecord)].join("\r\n") +
    "\r\n"
  );
}
async function fixture(buffer: string | Buffer, name = "synthetic.csv") {
  const path = join(root, name);
  await fs.writeFile(path, buffer);
  return path;
}
async function collect(
  path: string,
  options: WarleineCsvZipOptions = {},
  name = path
) {
  const rows: string[][] = [];
  for await (const values of iterateWarleineCsvZipRows(path, name, options))
    rows.push(values);
  return rows;
}
function ownedFds() {
  return readdirSync("/proc/self/fd").filter(fd => {
    try {
      return readlinkSync(`/proc/self/fd/${fd}`).startsWith(root);
    } catch {
      return false;
    }
  });
}

type Member = {
  name: string;
  data?: string | Buffer;
  method?: number;
  flags?: number;
  mode?: number;
  localName?: string;
  crc?: number;
  expandedSize?: number;
  descriptor?: boolean;
  disk?: number;
  extra?: Buffer;
  offset?: number;
};
/** Test-only minimal ZIP writer: actual local headers, central directory, EOCD and DEFLATE. */
function zip(members: Member[]): Buffer {
  let offset = 0;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  for (const member of members) {
    const data = Buffer.from(member.data ?? "");
    const method = member.method ?? (member.name.endsWith("/") ? 0 : 8);
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const checksum = member.crc ?? crc32(data);
    const expanded = member.expandedSize ?? data.length;
    const flags = member.flags ?? 0x800 | (member.descriptor ? 8 : 0);
    const name = Buffer.from(member.name);
    const localName = Buffer.from(member.localName ?? member.name);
    const extra = member.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (!member.descriptor) {
      local.writeUInt32LE(checksum, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(expanded, 22);
    }
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(extra.length, 28);
    let descriptor = Buffer.alloc(0);
    if (member.descriptor) {
      descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(compressed.length, 8);
      descriptor.writeUInt32LE(expanded, 12);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(expanded, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt16LE(member.disk ?? 0, 34);
    central.writeUInt32LE(
      ((member.mode ?? (member.name.endsWith("/") ? 0x41ed : 0x81a4)) *
        65536) >>>
        0,
      38
    );
    central.writeUInt32LE(member.offset ?? offset, 42);
    const part = Buffer.concat([
      local,
      localName,
      extra,
      compressed,
      descriptor,
    ]);
    locals.push(part);
    centrals.push(Buffer.concat([central, name, extra]));
    offset += part.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function trackZip() {
  const archives: ZipFile[] = [];
  const streams: Readable[] = [];
  const open = yauzl.open.bind(yauzl);
  vi.spyOn(yauzl, "open").mockImplementation(((
    path: string,
    options: any,
    callback: any
  ) =>
    open(path, options, (error, archive) => {
      if (archive) {
        archives.push(archive);
        const read = archive.openReadStream.bind(archive);
        archive.openReadStream = ((entry: any, options: any, callback: any) =>
          read(entry, options, (error, stream) => {
            if (stream) streams.push(stream);
            callback(error, stream);
          })) as any;
      }
      callback(error, archive);
    })) as any);
  return {
    archives,
    streams,
    assertClosed() {
      expect(archives.length).toBeGreaterThan(0);
      expect(archives.every(archive => !archive.isOpen)).toBe(true);
      expect(streams.every(stream => stream.destroyed)).toBe(true);
      expect(ownedFds()).toEqual([]);
    },
  };
}

function fakePool() {
  const calls: Array<{ sql?: string; params?: any[]; op?: string }> = [];
  const stage: any[] = [];
  let competencies: string[] = [];
  const connection = {
    beginTransaction: async () => {
      calls.push({ op: "begin" });
    },
    commit: async () => {
      calls.push({ op: "commit" });
    },
    rollback: async () => {
      calls.push({ op: "rollback" });
    },
    release: () => {
      calls.push({ op: "release" });
    },
    query: async (sql: string, params: any[]) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM estabelecimentos"))
        return [[{ id: 700001 }], []];
      if (sql.includes("SELECT *, leaseExpiresAt"))
        return [
          [
            {
              id: 700003,
              status: "reservado",
              claimToken: "SYNTHETIC_CLAIM",
              leaseAtivoDb: 1,
            },
          ],
          [],
        ];
      if (sql.includes("SELECT arquivoHash"))
        return [[{ arquivoHash: "SYNTHETIC_HASH" }], []];
      if (sql.includes("SELECT status, competencias"))
        return [
          [
            {
              status: "validado",
              competencias: competencies,
              claimToken: "SYNTHETIC_CLAIM",
              leaseAtivo: 1,
            },
          ],
          [],
        ];
      if (sql.includes("SELECT id, numeroLinha, dadosBrutos"))
        return [
          params[2] ? [] : stage.filter(item => item.status !== "rejeitado"),
          [],
        ];
      if (sql.includes("FROM warleine_faturamento_itens_ativos"))
        return [[{ total: 0 }], []];
      if (sql.includes("COUNT(*)")) return [[{ total: stage.length }], []];
      throw new Error("UNEXPECTED_SYNTHETIC_QUERY");
    },
    execute: async (sql: string, params: any[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("INSERT INTO warleine_faturamento_staging"))
        for (let i = 0; i < params.length; i += 7)
          stage.push({
            id: stage.length + 1,
            numeroLinha: params[i + 3],
            status: params[i + 4],
            dadosBrutos: JSON.parse(params[i + 6]),
          });
      if (sql.includes("SET status='validado'"))
        competencies = JSON.parse(params[4]);
      return [{ affectedRows: 1, insertId: 700003 }, []];
    },
  };
  database.pool = { getConnection: async () => connection };
  return { calls, stage };
}
function importFixture(path: string) {
  return importWarleineFaturamentoFile({
    filePath: path,
    fileName: path,
    estabelecimentoId: 700001,
    userId: 700004,
    claimToken: "SYNTHETIC_CLAIM",
    publish: true,
    replaceCompetencies: true,
  });
}

describe("CSV Warleine por registro lógico", () => {
  it("executa com ambiente sintético e guard de rede", () => {
    expect(process.env.DATABASE_URL).toBe("");
    expect(process.env.VITE_APP_ID).toBe("synthetic-validation-app");
    expect(process.env.JWT_SECRET).toBe(
      "synthetic-test-only-not-production-issue177-validation"
    );
    expect(process.env.NODE_OPTIONS).toBe(
      "--require=/home/ubuntu/reports/issue168/network-guard.cjs"
    );
    expect(process.version).toMatch(/^v22\./);
  });
  it("preserva UTF8/BOM/CRLF, semicolon, escaped quotes e multiline LF/CRLF", async () => {
    const record = row();
    record[18] = 'SERVIÇO; "SYNTHETIC"';
    record[39] = 'SYNTHETIC_A\nSYNTHETIC_B\r\n"SYNTHETIC_C"';
    const rows = await collect(
      await fixture("\uFEFF\r\n  \r\n" + csv([record]))
    );
    expect(rows).toEqual([[...WARLEINE_XLSX_HEADERS], record]);
    expect(parseWarleineRow(rows[1]).canonical).toMatchObject({
      observacaoGlosa: record[39],
      valorUnitario: "100.0000",
    });
    expect(ownedFds()).toEqual([]);
  });
  it("não exige newline final quando o registro possui 48 campos completos", async () => {
    expect(await collect(await fixture(csv().trimEnd()))).toHaveLength(2);
  });
  it("mantém campos explicitamente vazios e não converte números no parser", async () => {
    const record = row();
    record[47] = "";
    record[26] = "9007199254740991,1234";
    const values = (await collect(await fixture(csv([record]))))[1];
    expect(values).toHaveLength(48);
    expect(parseWarleineRow(values).canonical?.valorFaturado).toBe(
      "9007199254740991.1234"
    );
    expect(parseWarleineRow(values).canonical?.valorUnitario).toBe("0.0000");
  });
  it("atravessa chunk UTF8 e aspas escapadas sem cortar campos", async () => {
    const record = row();
    record[39] = "Á".repeat(8190) + '"SYNTHETIC;\r\nEND';
    expect((await collect(await fixture(csv([record]))))[1]).toEqual(record);
  });
  it.each([
    [
      "aspas abertas",
      () =>
        csvRecord(WARLEINE_XLSX_HEADERS) +
        "\n" +
        csvRecord(row()).slice(0, -6) +
        '"SYNTHETIC',
    ],
    ["47 campos", () => csv([row().slice(0, 47)])],
    ["49 campos vazios", () => csv([[...row(), ""]])],
    ["header truncado", () => csvRecord(WARLEINE_XLSX_HEADERS.slice(0, 47))],
    [
      "aspas em campo não quoted",
      () => csv([row()]).replace("SYNTHETIC_PAYER", 'SYN"THETIC'),
    ],
    [
      "caractere após quote",
      () => csv([row()]).replace("SYNTHETIC_PAYER", '"SYNTHETIC"x'),
    ],
    ["separador comma", () => WARLEINE_XLSX_HEADERS.join(",")],
    ["vazio", () => "\r\n  \n"],
    ["registro quoted vazio incompleto", () => csv() + '\r\n""\r\n'],
    ["registro quoted multiline incompleto", () => csv() + '"\r\n"\r\n'],
    ["NUL binário", () => csv().replace("SYNTHETIC", "SY\0NTHETIC")],
  ])("rejeita %s sem ignorar erro", async (_name, content) => {
    await expect(collect(await fixture(content()))).rejects.toThrow(
      /Warleine rejeitado/
    );
    expect(ownedFds()).toEqual([]);
  });
  it.each([
    Buffer.from([0xff]),
    Buffer.from([0xef, 0xbb, 0xbf, 0xe2, 0x82]),
    Buffer.from([0xff, 0xfe, 0x41, 0]),
  ])("rejeita encoding inválido %j", async buffer => {
    await expect(collect(await fixture(buffer))).rejects.toThrow(
      /UTF8_INVALIDO|CONTEUDO_BINARIO/
    );
  });
  it("splitter compatível recebe um registro lógico, rejeita aspas abertas e múltiplos registros", () => {
    expect(splitWarleineCsvRecord('"A;B";"C""D";"E\nF"')).toEqual([
      "A;B",
      'C"D',
      "E\nF",
    ]);
    expect(() => splitWarleineCsvRecord('A;"B;C')).toThrow();
    expect(() => splitWarleineCsvRecord("A;B\nC;D")).toThrow();
  });
});

describe("ZIP real portável com único CSV elegível", () => {
  it.each([0, 8])("aceita ZIP real método %s", async method => {
    const tracking = trackZip();
    const record = row();
    record[39] = "SYNTHETIC_A\nSYNTHETIC_B";
    expect(
      await collect(
        await fixture(
          zip([{ name: "data.csv", data: csv([record]), method }]),
          "data.zip"
        )
      )
    ).toEqual([[...WARLEINE_XLSX_HEADERS], record]);
    tracking.assertClosed();
  });
  it("aceita diretórios pais opcionais e CSV uppercase", async () => {
    expect(
      await collect(
        await fixture(
          zip([
            { name: "folder/" },
            { name: "folder/SYNTHETIC.CSV", data: csv() },
          ]),
          "data.zip"
        )
      )
    ).toHaveLength(2);
  });
  it("aceita data descriptor legítimo", async () => {
    expect(
      await collect(
        await fixture(
          zip([{ name: "data.csv", data: csv(), descriptor: true }]),
          "data.zip"
        )
      )
    ).toHaveLength(2);
  });
  it.each([false, true])(
    "aceita ZIP produzido por archiver, ZIP64=%s",
    async forceZip64 => {
      const archive = archiver("zip", { forceZip64 });
      archive.append(csv(), { name: "data.csv" });
      const chunks: Buffer[] = [];
      const reading = (async () => {
        for await (const chunk of archive) chunks.push(Buffer.from(chunk));
      })();
      await archive.finalize();
      await reading;
      expect(
        await collect(await fixture(Buffer.concat(chunks), "archiver.zip"))
      ).toHaveLength(2);
    }
  );
  it("aceita ZIP64 pequeno com EOCD/locator válidos", async () => {
    const bytes = zip([{ name: "data.csv", data: csv() }]);
    const endOffset = bytes.length - 22;
    const end = Buffer.from(bytes.subarray(endOffset));
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(1n, 24);
    record.writeBigUInt64LE(1n, 32);
    record.writeBigUInt64LE(BigInt(end.readUInt32LE(12)), 40);
    record.writeBigUInt64LE(BigInt(end.readUInt32LE(16)), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50);
    locator.writeBigUInt64LE(BigInt(endOffset), 8);
    locator.writeUInt32LE(1, 16);
    end.writeUInt16LE(0xffff, 8);
    end.writeUInt16LE(0xffff, 10);
    end.writeUInt32LE(0xffffffff, 12);
    end.writeUInt32LE(0xffffffff, 16);
    expect(
      await collect(
        await fixture(
          Buffer.concat([bytes.subarray(0, endOffset), record, locator, end]),
          "small-zip64.zip"
        )
      )
    ).toHaveLength(2);
  });
  it("rejeita TAR gzip verdadeiro renomeado .zip sem subprocess", async () => {
    const archive = archiver("tar", { gzip: true });
    archive.append(csv(), { name: "data.csv" });
    const chunks: Buffer[] = [];
    const reading = (async () => {
      for await (const chunk of archive) chunks.push(Buffer.from(chunk));
    })();
    await archive.finalize();
    await reading;
    await expect(
      collect(await fixture(Buffer.concat(chunks), "disguised.zip"))
    ).rejects.toThrow(/ASSINATURA_ZIP_INVALIDA/);
  });
  it("rejeita membro local oculto removido do diretório central", async () => {
    const bytes = zip([
      { name: "data.csv", data: csv() },
      { name: "hidden.csv", data: csv() },
    ]);
    const central = bytes.readUInt32LE(bytes.length - 6);
    const firstCentralSize = 46 + Buffer.byteLength("data.csv");
    const end = Buffer.from(bytes.subarray(bytes.length - 22));
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(firstCentralSize, 12);
    const mutated = Buffer.concat([
      bytes.subarray(0, central + firstCentralSize),
      end,
    ]);
    await expect(collect(await fixture(mutated, "hidden.zip"))).rejects.toThrow(
      /ZIP_MEMBROS_OCULTOS/
    );
  });
  it("rejeita descriptor truncado ou divergente", async () => {
    const bytes = zip([{ name: "data.csv", data: csv(), descriptor: true }]);
    const central = bytes.readUInt32LE(bytes.length - 6);
    bytes.writeUInt32LE(123, central - 12);
    await expect(
      collect(await fixture(bytes, "descriptor.zip"))
    ).rejects.toThrow(/ZIP_DESCRIPTOR_INVALIDO/);
  });
  it.each([
    ["TAR gzip", gzipSync(Buffer.from("SYNTHETIC_TAR"))],
    ["gzip", gzipSync(Buffer.from(csv()))],
    ["CSV renomeado", Buffer.from(csv())],
    ["assinatura somente", Buffer.from("PK\x03\x04")],
    ["ZIP truncado", zip([{ name: "data.csv", data: csv() }]).subarray(0, -5)],
    [
      "trailing dados",
      Buffer.concat([
        zip([{ name: "data.csv", data: csv() }]),
        Buffer.from("SYNTHETIC"),
      ]),
    ],
    [
      "prefixo executável",
      Buffer.concat([
        Buffer.from("MZ"),
        zip([{ name: "data.csv", data: csv() }]),
      ]),
    ],
  ])("rejeita formato disfarçado %s", async (_name, buffer) => {
    await expect(collect(await fixture(buffer, "data.zip"))).rejects.toThrow(
      /Warleine rejeitado/
    );
    expect(ownedFds()).toEqual([]);
  });
  it.each([
    [
      "dois CSVs",
      [
        { name: "one.csv", data: csv() },
        { name: "two.csv", data: csv() },
      ],
    ],
    [
      "CSV mais binário",
      [
        { name: "one.csv", data: csv() },
        { name: "payload.bin", data: "SYNTHETIC" },
      ],
    ],
    [
      "CSV mais diretório alheio",
      [{ name: "one.csv", data: csv() }, { name: "other/" }],
    ],
    ["sem CSV", [{ name: "only/" }]],
    [
      "duplicado",
      [
        { name: "one.csv", data: csv() },
        { name: "one.csv", data: csv() },
      ],
    ],
    [
      "duplicado case insensitive",
      [
        { name: "one.csv", data: csv() },
        { name: "ONE.CSV", data: csv() },
      ],
    ],
    [
      "diretório com conteúdo",
      [
        { name: "folder/", data: "SYNTHETIC" },
        { name: "folder/data.csv", data: csv() },
      ],
    ],
    ["symlink", [{ name: "data.csv", data: csv(), mode: 0xa1ff }]],
    ["FIFO", [{ name: "data.csv", data: csv(), mode: 0x11ff }]],
    [
      "metadado link",
      [{ name: "data.csv", data: csv(), extra: Buffer.from([0x0d, 0, 0, 0]) }],
    ],
    ["criptografado", [{ name: "data.csv", data: csv(), flags: 1 }]],
    ["método inválido", [{ name: "data.csv", data: csv(), method: 12 }]],
    [
      "localName diferente",
      [{ name: "data.csv", localName: "payload.bin", data: csv() }],
    ],
    ["múltiplos discos", [{ name: "data.csv", data: csv(), disk: 1 }]],
    [
      "CSV contém ZIP",
      [{ name: "data.csv", data: zip([{ name: "nested.csv", data: csv() }]) }],
    ],
  ] as Array<[string, Member[]]>)(
    "rejeita membros %s antes de entregar conteúdo",
    async (_name, members) => {
      const tracking = trackZip();
      await expect(
        collect(await fixture(zip(members), "data.zip"))
      ).rejects.toThrow(/Warleine rejeitado/);
      tracking.assertClosed();
    }
  );
  it.each([
    "../data.csv",
    "/data.csv",
    "C:/data.csv",
    "folder\\data.csv",
    "folder/../data.csv",
    "folder/./data.csv",
    "folder//data.csv",
    "data.csv\0",
    "folder /data.csv",
  ])("rejeita caminho %s", async name => {
    const tracking = trackZip();
    await expect(
      collect(await fixture(zip([{ name, data: csv() }]), "data.zip"))
    ).rejects.toThrow(/Warleine rejeitado/);
    tracking.assertClosed();
  });
  it.each([
    ["CRC errado", { crc: 123 }],
    ["tamanho mentiroso", { expandedSize: 1 }],
  ])("rejeita integridade %s", async (_name, changes) => {
    const tracking = trackZip();
    await expect(
      collect(
        await fixture(
          zip([{ name: "data.csv", data: csv(), ...changes }]),
          "data.zip"
        )
      )
    ).rejects.toThrow(/Warleine rejeitado/);
    tracking.assertClosed();
  });
  it("rejeita dados comprimidos excedentes após stream DEFLATE", async () => {
    const bytes = zip([{ name: "data.csv", data: csv() }]);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
    const mutated = Buffer.concat([
      bytes.subarray(0, central),
      Buffer.from("SYNTHETIC"),
      bytes.subarray(central),
    ]);
    const extra = Buffer.byteLength("SYNTHETIC");
    mutated.writeUInt32LE(mutated.readUInt32LE(18) + extra, 18);
    mutated.writeUInt32LE(
      mutated.readUInt32LE(central + extra + 20) + extra,
      central + extra + 20
    );
    mutated.writeUInt32LE(central + extra, mutated.length - 6);
    await expect(collect(await fixture(mutated, "data.zip"))).rejects.toThrow(
      /ZIP_DADOS_COMPRIMIDOS_AMBIGUOS/
    );
  });
});

describe("orçamentos e cancelamento", () => {
  it.each([
    ["bytes de entrada", { maxInputBytes: 100 }, csv(), /TAMANHO/],
    ["bytes expandidos", { maxExpandedBytes: 100 }, csv(), /BYTES_EXPANDIDOS/],
    [
      "campo antes da alocação",
      { maxFieldBytes: 100 },
      csv([row().map((value, i) => (i === 39 ? "S".repeat(200) : value))]),
      /CAMPO_EXCEDIDO/,
    ],
    [
      "registro multiline antes da alocação",
      { maxRecordBytes: 650 },
      csv([row().map((value, i) => (i === 39 ? "S\n".repeat(500) : value))]),
      /REGISTRO_EXCEDIDO/,
    ],
    ["quantidade lógica", { maxRecords: 1 }, csv(), /QUANTIDADE_REGISTROS/],
  ] as Array<[string, WarleineCsvZipOptions["limits"], string, RegExp]>)(
    "limita %s",
    async (_name, limits, content, error) => {
      await expect(collect(await fixture(content), { limits })).rejects.toThrow(
        error
      );
      expect(ownedFds()).toEqual([]);
    }
  );
  it("limita membros antes de abrir stream de conteúdo", async () => {
    const tracking = trackZip();
    await expect(
      collect(
        await fixture(
          zip([{ name: "folder/" }, { name: "folder/data.csv", data: csv() }]),
          "data.zip"
        ),
        { limits: { maxMembers: 1 } }
      )
    ).rejects.toThrow(/MEMBROS/);
    expect(tracking.streams).toHaveLength(0);
    expect(ownedFds()).toEqual([]);
  });
  it("limita expansão ZIP pequena sem alocar expansão integral", async () => {
    const record = row();
    record[39] = "S".repeat(100_000);
    const tracking = trackZip();
    await expect(
      collect(
        await fixture(
          zip([{ name: "data.csv", data: csv([record]) }]),
          "data.zip"
        ),
        { limits: { maxExpandedBytes: 1024 } }
      )
    ).rejects.toThrow(/BYTES_EXPANDIDOS/);
    expect(tracking.streams).toHaveLength(0);
    tracking.assertClosed();
  });
  it("teto de campo real bloqueia bomb comprimida com newline ausente", async () => {
    const record = row();
    record[39] = "S".repeat(WARLEINE_CSV_ZIP_LIMITS.maxFieldBytes + 1);
    const tracking = trackZip();
    await expect(
      collect(
        await fixture(
          zip([{ name: "data.csv", data: csv([record]) }]),
          "data.zip"
        )
      )
    ).rejects.toThrow(/CAMPO_EXCEDIDO/);
    tracking.assertClosed();
  });
  it.each(["synthetic.csv", "synthetic.zip"])(
    "fecha recursos após early return %s",
    async name => {
      const tracking = trackZip();
      const content = csv(Array.from({ length: 2000 }, row));
      const path = await fixture(
        name.endsWith("zip")
          ? zip([{ name: "data.csv", data: content }])
          : content,
        name
      );
      for await (const _record of iterateWarleineCsvZipRows(path, path)) break;
      expect(ownedFds()).toEqual([]);
      if (name.endsWith("zip")) tracking.assertClosed();
    }
  );
  it("fecha ZIP quando consumidor lança erro", async () => {
    const tracking = trackZip();
    const path = await fixture(
      zip([{ name: "data.csv", data: csv(Array.from({ length: 2000 }, row)) }]),
      "data.zip"
    );
    await expect(
      (async () => {
        for await (const _record of iterateWarleineCsvZipRows(path, path))
          throw new Error("SYNTHETIC_CONSUMER");
      })()
    ).rejects.toThrow("SYNTHETIC_CONSUMER");
    tracking.assertClosed();
  });
  it.each(["signal", "deadline", "duration"])(
    "cancela ZIP ativo por %s",
    async mode => {
      const tracking = trackZip();
      const path = await fixture(
        zip([
          { name: "data.csv", data: csv(Array.from({ length: 2000 }, row)) },
        ]),
        "data.zip"
      );
      const controller = new AbortController();
      const options =
        mode === "duration"
          ? { limits: { maxDurationMs: 100 } }
          : mode === "deadline"
            ? { deadlineAtMs: Date.now() + 100 }
            : { signal: controller.signal };
      const iterator = iterateWarleineCsvZipRows(path, path, options);
      expect((await iterator.next()).done).toBe(false);
      if (mode === "signal") controller.abort();
      else await new Promise(resolve => setTimeout(resolve, 140));
      await expect(iterator.next()).rejects.toThrow(
        /TEMPO_ESGOTADO|LEITURA_CANCELADA/
      );
      tracking.assertClosed();
    }
  );
  it("deadline interrompe espera por membro ZIP sem deixar listeners/descritores", async () => {
    const tracking = trackZip();
    const original = yauzl.open.bind(yauzl);
    vi.spyOn(yauzl, "open").mockImplementation(((
      path: string,
      options: any,
      callback: any
    ) =>
      original(path, options, (error, archive) => {
        if (archive)
          archive.readEntry = () => {
            /* stalled metadata fake, no network */
          };
        callback(error, archive);
      })) as any);
    const path = await fixture(
      zip([{ name: "data.csv", data: csv() }]),
      "stalled.zip"
    );
    await expect(
      collect(path, { limits: { maxDurationMs: 100 } })
    ).rejects.toThrow(/TEMPO_ESGOTADO/);
    tracking.assertClosed();
  });
  it("rejeita deadline ou sinal já encerrados sem abrir arquivos", async () => {
    const path = await fixture(csv());
    const controller = new AbortController();
    controller.abort();
    await expect(collect(path, { signal: controller.signal })).rejects.toThrow(
      /LEITURA_CANCELADA/
    );
    await expect(
      collect(path, { deadlineAtMs: Date.now() - 1 })
    ).rejects.toThrow(/TEMPO_ESGOTADO/);
    expect(ownedFds()).toEqual([]);
  });
  it("não permite aumentar ou desativar orçamento", async () => {
    const path = await fixture(csv());
    for (const value of [
      0,
      -1,
      Infinity,
      WARLEINE_CSV_ZIP_LIMITS.maxMembers + 1,
    ])
      await expect(
        collect(path, { limits: { maxMembers: value } })
      ).rejects.toThrow(/ORCAMENTO_INVALIDO/);
  });
});

describe("integração do importador isolado com fake SQL", () => {
  it.each(["csv", "zip"])(
    "multiline %s publica somente registro inteiro e financeiro preservado no fake",
    async ext => {
      const record = row();
      record[39] = "SYNTHETIC_A\nSYNTHETIC_B";
      const path = await fixture(
        ext === "zip"
          ? zip([{ name: "data.csv", data: csv([record]) }])
          : csv([record]),
        `data.${ext}`
      );
      const fake = fakePool();
      const result = await importFixture(path);
      expect(result.processedRows).toBe(1);
      expect(result.publishedRows).toBe(1);
      expect(result.rejectedRows).toBe(0);
      expect(fake.stage[0].numeroLinha).toBe(1);
      expect(fake.stage[0].dadosBrutos).toMatchObject({
        observacaoGlosa: record[39],
        valorUnitario: "100.0000",
      });
      expect(
        fake.calls.some(call =>
          call.sql?.includes(
            "INSERT INTO warleine_faturamento_snapshots_ativos"
          )
        )
      ).toBe(true);
    }
  );
  it.each(["truncado", "aspas abertas", "CRC inválido"])(
    "bloqueia %s após staging parcial antes de validar/materializar/publicar",
    async scenario => {
      const good = csv(
        Array.from({ length: 1500 }, (_, i) => {
          const record = row();
          record[7] = `SYN-${i}`;
          record[39] = "S".repeat(200);
          return record;
        })
      );
      const content =
        scenario === "truncado"
          ? good + csvRecord(row().slice(0, 47))
          : scenario === "aspas abertas"
            ? good + '"SYNTHETIC_UNCLOSED'
            : good;
      const path = await fixture(
        scenario === "CRC inválido"
          ? zip([{ name: "data.csv", data: content, crc: 123 }])
          : content,
        scenario === "CRC inválido" ? "data.zip" : "data.csv"
      );
      const fake = fakePool();
      await expect(importFixture(path)).rejects.toThrow(/Warleine rejeitado/);
      expect(fake.stage.length).toBeGreaterThanOrEqual(1000);
      expect(
        fake.calls.some(call => call.sql?.includes("SET status='erro'"))
      ).toBe(true);
      expect(
        fake.calls.some(call => call.sql?.includes("SET status='validado'"))
      ).toBe(false);
      expect(
        fake.calls.some(call =>
          call.sql?.startsWith("INSERT INTO warleine_faturamento_itens")
        )
      ).toBe(false);
      expect(
        fake.calls.some(call =>
          call.sql?.includes("warleine_faturamento_snapshots_ativos")
        )
      ).toBe(false);
      expect(fake.calls.at(-1)?.op).toBe("release");
      expect(ownedFds()).toEqual([]);
    }
  );
  it("preserva XLSX tipado e valores Decimal no fake", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SYNTHETIC");
    sheet.addRow([...WARLEINE_XLSX_HEADERS]);
    const values: unknown[] = row();
    values[12] = new Date("2026-10-01T00:00:00Z");
    values[18] = { richText: [{ text: "SYNTHETIC_" }, { text: "ITEM" }] };
    values[26] = { formula: "50+50", result: 100 };
    values[47] = "9007199254740991,1234";
    sheet.addRow(values);
    const path = join(root, "data.xlsx");
    await workbook.xlsx.writeFile(path);
    const fake = fakePool();
    expect((await importFixture(path)).processedRows).toBe(1);
    expect(fake.stage[0].dadosBrutos).toMatchObject({
      dataAberturaConta: "2026-10-01",
      servicoNome: "SYNTHETIC_ITEM",
      valorFaturado: "100.0000",
      valorUnitario: "9007199254740991.1234",
    });
  });
  it("preserva rejeição de XLSX com duas abas", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("ONE").addRow([...WARLEINE_XLSX_HEADERS]);
    workbook.addWorksheet("TWO").addRow([...WARLEINE_XLSX_HEADERS]);
    const path = join(root, "data.xlsx");
    await workbook.xlsx.writeFile(path);
    await expect(
      (async () => {
        for await (const _row of iterateWarleineFileRows(path, path)) {
          /* no DB */
        }
      })()
    ).rejects.toThrow(/exatamente uma aba/);
  });
});
