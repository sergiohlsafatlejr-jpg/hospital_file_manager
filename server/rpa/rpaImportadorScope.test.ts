import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { arquivos, convenioEstabelecimentoPrestador, convenios, recebimentosExcel } from "../../drizzle/schema";
import type { InsertArquivo, InsertRecebimentoExcel } from "../../drizzle/schema";
import type { parseExcelRecebimentosExcelChunked } from "../recebimentosExcelParser";
import type { RpaImportadorScope } from "./rpaImportadorScope";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), createArquivo: vi.fn(), insertBatch: vi.fn(), parse: vi.fn(),
  sync: vi.fn(), readFile: vi.fn(), legacyProgress: vi.fn(), legacyStatus: vi.fn(), storagePut: vi.fn(),
}));
vi.mock("fs", () => ({ default: { readFileSync: mocks.readFile, realpathSync: (value: string) => value, lstatSync: () => ({ isFile: () => true }) } }));
vi.mock("../db", () => ({
  getDb: mocks.getDb, createArquivo: mocks.createArquivo, insertRecebimentosExcelBatch: mocks.insertBatch,
  updateArquivoProgresso: mocks.legacyProgress, updateArquivoStatus: mocks.legacyStatus,
}));
vi.mock("../storage", () => ({ storagePut: mocks.storagePut }));
vi.mock("../recebimentosExcelParser", () => ({ parseExcelRecebimentosExcelChunked: mocks.parse }));
vi.mock("../syncDemonstrativo", () => ({ syncDemonstrativoByArquivo: mocks.sync }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { processarArquivoRpa } from "./importador";

type Row = Record<string, unknown>;
type QueryLog = { table: string; sql: string; params: unknown[] };
const dialect = new MySqlDialect();
const scope: RpaImportadorScope = {
  estabelecimentoId: 71, convenioId: 81, registroAns: "123456", codigoPrestadorOperadora: "SYNTH-PAY",
};
let tables: Record<string, Row[]>;
let reads: QueryLog[];
let writes: Array<QueryLog & { payload: Partial<InsertArquivo> }>;
let chunks: Array<Array<Partial<InsertRecebimentoExcel>>>;
let beforeSelect: ((table: string, query: QueryLog) => void) | undefined;
let beforeUpdate: (() => void) | undefined;

/** Aplica as igualdades emitidas pelo Drizzle às fixtures, não ao DB real. */
function equalities(query: QueryLog): Array<[string, unknown]> {
  const matches = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)];
  return matches.map((match, index) => [match[1], query.params[index]]);
}
function filterRows(query: QueryLog): Row[] {
  const rows = tables[query.table] ?? [];
  if (query.table === getTableName(convenios)) {
    const [id, hospital] = query.params;
    return rows.filter(row => row.id === id && (row.estabelecimentoId === hospital || row.estabelecimentoId === null));
  }
  if (query.table === getTableName(recebimentosExcel) && query.sql.includes("<>")) {
    const [arquivoId, hospital, convenioId] = query.params;
    return rows.filter(row => row.arquivo_id === arquivoId &&
      (row.estabelecimentoId !== hospital || row.convenioId !== convenioId));
  }
  const conditions = equalities(query);
  return rows.filter(row => conditions.every(([field, value]) => row[field] === value));
}
function mockDb() {
  return {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const name = getTableName(table);
        return {
          where: (condition: SQL) => {
            const compiled = dialect.sqlToQuery(condition);
            const query = { table: name, sql: compiled.sql, params: compiled.params };
            reads.push(query);
            beforeSelect?.(name, query);
            const rows = filterRows(query).map(row => ({ ...row, arquivoId: row.arquivo_id }));
            return Object.assign(Promise.resolve(rows), { limit: (count: number) => Promise.resolve(rows.slice(0, count)) });
          },
          limit: (count: number) => Promise.resolve((tables[name] ?? []).slice(0, count)),
        };
      },
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (payload: Partial<InsertArquivo>) => ({
        where: async (condition: SQL) => {
          const compiled = dialect.sqlToQuery(condition);
          const query = { table: getTableName(table), sql: compiled.sql, params: compiled.params };
          writes.push({ ...query, payload });
          beforeUpdate?.();
          const matched = filterRows(query);
          matched.forEach(row => Object.assign(row, payload));
          return [{ affectedRows: matched.length }];
        },
      }),
    }),
  };
}
const caminhoSintetico = path.join(os.tmpdir(), "rpa_estab_71_conv_81_00000000-0000-4000-8000-000000000001", "synthetic.xlsx");
function run() {
  return processarArquivoRpa(caminhoSintetico, "synthetic.xlsx", scope, "04/2026");
}
function noWrites() {
  expect(mocks.createArquivo).not.toHaveBeenCalled();
  expect(mocks.insertBatch).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  expect(mocks.legacyProgress).not.toHaveBeenCalled();
  expect(mocks.legacyStatus).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  beforeSelect = undefined;
  beforeUpdate = undefined;
  reads = [];
  writes = [];
  chunks = [[{ codigoPrestadorPagamento: "SYNTH-PAY", valorPagamento: "10.00", valorGlosa: "2.00", item: "SYNTH-ITEM" }]];
  tables = {
    [getTableName(convenios)]: [{ id: 81, estabelecimentoId: null, registroAns: "123456", ativo: "sim" }],
    [getTableName(convenioEstabelecimentoPrestador)]: [
      { estabelecimentoId: 71, convenioId: 81, codigoPrestador: "SYNTH-PAY", ativo: "sim" },
    ],
    [getTableName(arquivos)]: [],
    [getTableName(recebimentosExcel)]: [],
    users: [{ id: 91 }],
  };
  mocks.readFile.mockReturnValue(Buffer.from("synthetic mock only"));
  mocks.getDb.mockResolvedValue(mockDb());
  mocks.storagePut.mockImplementation(async (key: string) => ({ key, url: `https://storage.invalid/${key}` }));
  mocks.createArquivo.mockImplementation(async (data: InsertArquivo) => {
    tables[getTableName(arquivos)].push({ ...data, id: 101 });
    return { id: 101 };
  });
  mocks.insertBatch.mockImplementation(async (records: InsertRecebimentoExcel[]) => {
    tables[getTableName(recebimentosExcel)].push(...records.map(row => ({ ...row, arquivo_id: row.arquivoId })));
    return records.length;
  });
  mocks.sync.mockResolvedValue({ success: true, total: 1 });
  mocks.parse.mockImplementation(async (...args: Parameters<typeof parseExcelRecebimentosExcelChunked>) => {
    const [, arquivoId, convenioId, dataReferencia, , estabelecimentoId, , onChunk] = args;
    for (const [index, chunk] of chunks.entries()) {
      await onChunk(chunk.map(row => ({ arquivoId, convenioId, estabelecimentoId, dataReferencia, ...row })), index,
        chunks.reduce((count, records) => count + records.length, 0));
    }
    const total = chunks.reduce((count, records) => count + records.length, 0);
    return { totalRows: total, totalRecords: total };
  });
});

describe("original RPA durável sem rede real", () => {
  it("storage confirmado precede cadastro e processamento", async () => {
    expect(await run()).toMatchObject({ success: true });
    expect(mocks.storagePut).toHaveBeenCalledOnce();
    expect(mocks.storagePut.mock.invocationCallOrder[0]).toBeLessThan(mocks.createArquivo.mock.invocationCallOrder[0]);
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^rpa\/estab_71\/conv_81\//), expect.any(Buffer), expect.any(String));
    expect(tables[getTableName(arquivos)][0].s3Url).toMatch(/^https:\/\/storage\.invalid\//);
  });
  it("falha de storage não cadastra nem importa e não expõe o erro bruto", async () => {
    mocks.storagePut.mockRejectedValueOnce(new Error("https://private.invalid/key sensitive-storage-secret"));
    expect(await run()).toMatchObject({ success: false, error: "Armazenamento durável do original RPA não confirmado" });
    noWrites();
  });
  it("erro bruto de persistência não expõe SQL, caminho ou dados no retorno", async () => {
    const privateMessage = "SQL INSERT paciente-private secret-private https://private.invalid/object";
    mocks.createArquivo.mockRejectedValueOnce(new Error(privateMessage));
    const result = await run();
    expect(result).toEqual({ success: false, error: "Falha na importação RPA; resultado não confirmado." });
    expect(JSON.stringify(result)).not.toContain(privateMessage);
    expect(mocks.insertBatch).not.toHaveBeenCalled();
  });
  it("resposta de storage divergente não cadastra o arquivo", async () => {
    mocks.storagePut.mockResolvedValueOnce({ key: "different", url: "https://storage.invalid/object" });
    expect(await run()).toMatchObject({ success: false });
    noWrites();
  });
});

describe("importador RPA: ownership hospital + convênio sem identificação global", () => {
  it("importa corretamente com código coincidente em outro hospital e mantém valores e origem", async () => {
    tables[getTableName(convenioEstabelecimentoPrestador)].unshift({
      estabelecimentoId: 72, convenioId: 81, codigoPrestador: "SYNTH-PAY", ativo: "sim",
    });
    expect(await run()).toEqual({ success: true, arquivoId: 101, registros: 1 });
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(mocks.createArquivo).toHaveBeenCalledWith(expect.objectContaining({
      estabelecimentoId: 71, convenioId: 81, tipoArquivo: "excel", direcao: "retornado",
    }));
    expect(mocks.insertBatch).toHaveBeenCalledWith([expect.objectContaining({
      arquivoId: 101, estabelecimentoId: 71, convenioId: 81, valorPagamento: "10.00", valorGlosa: "2.00",
    })]);
    expect(mocks.sync).toHaveBeenCalledWith(101, "excel");
    expect(writes.at(-1)?.payload).toEqual({ status: "processado" });
    expect(writes.every(write => !Object.hasOwn(write.payload, "estabelecimentoId"))).toBe(true);
    const providerQueries = reads.filter(query => query.table === getTableName(convenioEstabelecimentoPrestador));
    expect(providerQueries.length).toBeGreaterThan(0);
    for (const query of providerQueries) {
      expect(query.sql).toContain("`estabelecimentoId` = ?");
      expect(query.sql).toContain("`convenioId` = ?");
      expect(query.params).toEqual([71, 81, "sim"]);
    }
    for (const write of writes) {
      expect(write.table).toBe(getTableName(arquivos));
      expect(write.params).toEqual([101, 71, 81, "synthetic.xlsx", "excel", "retornado", 91,
        "rpa/estab_71/conv_81/00000000-0000-4000-8000-000000000001/synthetic.xlsx", "https://storage.invalid/rpa/estab_71/conv_81/00000000-0000-4000-8000-000000000001/synthetic.xlsx"]);
    }
    expect(mocks.legacyProgress).not.toHaveBeenCalled();
    expect(mocks.legacyStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["outro hospital", { estabelecimentoId: 72, convenioId: 81 }],
    ["outro convênio", { estabelecimentoId: 71, convenioId: 82 }],
  ])("recusa prestador cadastrado apenas em %s sem qualquer escrita", async (_label, otherScope) => {
    tables[getTableName(convenioEstabelecimentoPrestador)] = [{ ...otherScope, codigoPrestador: "SYNTH-PAY", ativo: "sim" }];
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/prestador/) });
    noWrites();
  });

  it("recusa vínculo duplicado sem escolher arbitrariamente o primeiro", async () => {
    tables[getTableName(convenioEstabelecimentoPrestador)].push({ ...tables[getTableName(convenioEstabelecimentoPrestador)][0] });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/ambígua/) });
    noWrites();
  });

  it("recusa conflito ANS antes de inserir ou atualizar status", async () => {
    tables[getTableName(convenios)][0].registroAns = "654321";
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/ANS/) });
    noWrites();
  });

  it("recusa convênio exclusivo de outro hospital", async () => {
    tables[getTableName(convenios)][0].estabelecimentoId = 72;
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/Convênio/) });
    noWrites();
  });

  it.each([null, undefined, 0, -1, 1.5])("não aceita hospital ausente/inválido %s nem fallback 1", async (hospital) => {
    const invalidScope = { ...scope, estabelecimentoId: hospital } as unknown as RpaImportadorScope;
    expect(await processarArquivoRpa("/synthetic/mock.xlsx", "synthetic.xlsx", invalidScope)).toMatchObject({ success: false });
    noWrites();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each([
    ["arquivo", { arquivoId: 999 }], ["hospital", { estabelecimentoId: 72 }], ["convênio", { convenioId: 82 }],
  ])("valida %s em todos os chunks no preflight, incluindo o último", async (_label, mismatch) => {
    chunks.push([{ codigoPrestadorPagamento: "SYNTH-PAY", ...mismatch }]);
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/arquivo\/hospital\/convênio/) });
    noWrites();
  });

  it("recusa código de pagamento conflitante no último chunk, mesmo com credencial válida", async () => {
    chunks.push([{ codigoPrestadorPagamento: "SYNTH-OTHER" }]);
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/prestador/) });
    noWrites();
  });

  it("não retorna arquivo homônimo de outro hospital como importação duplicada", async () => {
    tables[getTableName(arquivos)].push({
      id: 202, nome: "synthetic.xlsx", tipoArquivo: "excel", direcao: "retornado", convenioId: 81, estabelecimentoId: 72,
    });
    expect(await run()).toMatchObject({ success: true, arquivoId: 101 });
    expect(mocks.createArquivo).toHaveBeenCalledTimes(1);
    expect(tables[getTableName(arquivos)][0].estabelecimentoId).toBe(72);
  });

  it("ignora duplicado apenas no escopo autorizado após revalidar seu snapshot", async () => {
    tables[getTableName(arquivos)].push({
      id: 202, nome: "synthetic.xlsx", tipoArquivo: "excel", direcao: "retornado", convenioId: 81, estabelecimentoId: 71,
      userId: 91, s3Key: "local/rpa/synthetic.xlsx", s3Url: "/synthetic", totalItens: 5,
    });
    expect(await run()).toEqual({ success: true, arquivoId: 202, registros: 5, skipped: true });
    noWrites();
  });

  it("recusa duplicados ambíguos dentro do escopo sem selecionar o primeiro", async () => {
    const row = { id: 202, nome: "synthetic.xlsx", tipoArquivo: "excel", direcao: "retornado", convenioId: 81, estabelecimentoId: 71 };
    tables[getTableName(arquivos)].push(row, { ...row, id: 203 });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/ambígua/) });
    noWrites();
  });

  it.each([
    ["owner hospital", "estabelecimentoId", 72], ["convênio", "convenioId", 82],
    ["objeto", "s3Key", "synthetic/changed"], ["autor", "userId", 92], ["nome", "nome", "changed.xlsx"],
    ["origem", "direcao", "enviado"],
  ])("recusa snapshot divergente de %s antes do primeiro recebimento/update", async (_label, field, value) => {
    mocks.createArquivo.mockImplementation(async (data: InsertArquivo) => {
      tables[getTableName(arquivos)].push({ ...data, id: 101, [field]: value });
      return { id: 101 };
    });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/Snapshot/) });
    expect(mocks.insertBatch).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("recusa snapshot alterado na releitura de duplicado, sem escrita", async () => {
    tables[getTableName(arquivos)].push({
      id: 202, nome: "synthetic.xlsx", tipoArquivo: "excel", direcao: "retornado", convenioId: 81, estabelecimentoId: 71,
      userId: 91, s3Key: "synthetic/original", s3Url: "/synthetic", totalItens: 5,
    });
    beforeSelect = (table, query) => {
      if (table === getTableName(arquivos) && query.sql.includes("`s3Key`")) {
        tables[table][0].s3Key = "synthetic/replaced";
      }
    };
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/Snapshot/) });
    noWrites();
  });

  it("revalida snapshot após insert e impede progresso/status/sync em arquivo transferido", async () => {
    mocks.insertBatch.mockImplementation(async () => {
      tables[getTableName(arquivos)][0].estabelecimentoId = 72;
      return 1;
    });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/Snapshot/) });
    expect(mocks.insertBatch).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("revalida cadastro antes da criação: conflito ANS após preflight não grava arquivo", async () => {
    const originalParser = mocks.parse.getMockImplementation();
    mocks.parse.mockImplementation(async (...args: Parameters<typeof parseExcelRecebimentosExcelChunked>) => {
      const result = await originalParser?.(...args);
      tables[getTableName(convenios)][0].registroAns = "654321";
      return result;
    });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/ANS/) });
    noWrites();
  });

  it("não sincroniza recebimento persistido com owner inválido nem finaliza o status", async () => {
    mocks.insertBatch.mockImplementation(async (records: InsertRecebimentoExcel[]) => {
      tables[getTableName(recebimentosExcel)].push({ ...records[0], arquivo_id: 101, estabelecimentoId: 72 });
      return 1;
    });
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/Recebimentos persistidos/) });
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(writes.some(write => write.payload.status === "processado")).toBe(false);
  });

  it("preserva extração da referência sem alterar ownership de recebimentos", async () => {
    chunks = [[{ codigoPrestadorPagamento: "SYNTH-PAY", dataPagto: new Date(2026, 3, 5) }]];
    expect(await processarArquivoRpa(caminhoSintetico, "synthetic.xlsx", scope)).toMatchObject({ success: true });
    expect(writes.some(write => write.payload.dataReferencia?.getTime() === new Date(2026, 3, 1).getTime())).toBe(true);
    expect(writes.every(write => write.table === getTableName(arquivos))).toBe(true);
  });

  it("não infere hospital a partir de prestador executante nem de código de pagamento ausente", async () => {
    chunks = [[{ codigoPrestador: "SYNTH-THIRD", prestadorExecutante: "SYNTH-THIRD" }]];
    expect(await run()).toMatchObject({ success: true, arquivoId: 101 });
    expect(mocks.insertBatch).toHaveBeenCalledWith([expect.objectContaining({ estabelecimentoId: 71 })]);
    expect(writes.every(write => !Object.hasOwn(write.payload, "estabelecimentoId"))).toBe(true);
  });

  it("revalida o vínculo antes de inserir: cadastro transferido não gera recebimentos ou updates", async () => {
    let count = 0;
    beforeSelect = (table) => {
      if (table === getTableName(convenioEstabelecimentoPrestador) && ++count === 3) {
        tables[table][0].estabelecimentoId = 72;
      }
    };
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/prestador/) });
    expect(mocks.insertBatch).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("update condicional não modifica arquivo transferido entre a releitura e a escrita", async () => {
    beforeUpdate = () => { tables[getTableName(arquivos)][0].estabelecimentoId = 72; };
    expect(await run()).toMatchObject({ success: false, error: expect.stringMatching(/durante atualização/) });
    expect(writes).toHaveLength(1);
    expect(tables[getTableName(arquivos)][0].progresso).toBe(0);
    expect(tables[getTableName(arquivos)][0].status).toBe("processando");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});


describe("namespace privado do importador RPA", () => {
  it("grava chave por hospital, convênio e UUID sem URL pública global", async () => {
    expect(await run()).toMatchObject({ success: true });
    const arquivo = mocks.createArquivo.mock.calls[0][0];
    expect(arquivo.s3Key).toBe("rpa/estab_71/conv_81/00000000-0000-4000-8000-000000000001/synthetic.xlsx");
    expect(arquivo.s3Url).not.toContain("/uploads/");
    expect(arquivo.s3Url).toBe(`https://storage.invalid/${arquivo.s3Key}`);
  });
  it.each(["/synthetic/mock.xlsx", path.join(os.tmpdir(), "rpa_estab_72_conv_81_00000000-0000-4000-8000-000000000001", "synthetic.xlsx")])("recusa caminho fora do namespace autorizado antes de ler arquivo/banco: %s", async candidato => {
    expect(await processarArquivoRpa(candidato, "synthetic.xlsx", scope)).toMatchObject({ success: false, error: expect.stringContaining("namespace privado") });
    expect(mocks.readFile).not.toHaveBeenCalled(); expect(mocks.getDb).not.toHaveBeenCalled(); noWrites();
  });
});
