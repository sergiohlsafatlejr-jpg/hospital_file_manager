import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EasyLocalColuna } from "../shared/easyLocalIntegrador";

const mocks = vi.hoisted(() => ({
  destination: {
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn(),
    query: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
  },
  getConnection: vi.fn(),
  config: vi.fn(),
  pgConnect: vi.fn(),
  pgQuery: vi.fn(),
  pgInstances: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("./db", () => ({
  getRawPool: async () => ({ getConnection: mocks.getConnection }),
}));
vi.mock("./easyLocalCadastroStore", () => ({
  resolverEasyLocalConfig: mocks.config,
}));
vi.mock("pg", async importOriginal => {
  const actual = await importOriginal<typeof import("pg")>();
  class Client {
    connect = mocks.pgConnect;
    query = mocks.pgQuery;
    end = vi.fn();
    constructor() {
      mocks.pgInstances.push(this);
    }
  }
  return { ...actual, default: { ...actual.default, Client } };
});

import {
  executarEasyLocalImportacaoAgendada,
  preverEasyLocalImportacaoAgendada,
} from "./easyLocalImportacaoService";

const input = { estabelecimentoId: 12, leituraId: 4 };
let rows: Array<Record<string, unknown>> = [];
let reading = {
  estabelecimentoId: 12,
  tabelaId: 77,
  origem: { schema: "public", tabela: "origem" },
  colunaEstabelecimento: "unidade",
  valorEstabelecimento: "hospital_12",
  campoChave: "codigo",
  dominio: "atendimentos" as const,
  frequenciaDesejada: "manual" as const,
};
let columns: EasyLocalColuna[] = [
  { nome: "codigo", tipo: "bigint" as const, obrigatorio: true },
  {
    nome: "valor",
    tipo: "decimal" as const,
    tamanho: 15,
    escala: 4,
    obrigatorio: false,
  },
];
let counters = {
  ultimaSincronizacao: null as string | null,
  totalRegistrosImportados: 0,
  atualizadoEm: "2026-01-01 00:00:00",
  totalRegistros: 0,
};
let existing: Array<Record<string, unknown>> = [];

function sqlOf(value: unknown): string {
  return typeof value === "string"
    ? value
    : String((value as { sql?: unknown } | null)?.sql ?? "");
}

function physical() {
  return [
    {
      COLUMN_NAME: "_id",
      DATA_TYPE: "bigint",
      IS_NULLABLE: "NO",
      COLUMN_KEY: "PRI",
      EXTRA: "auto_increment",
      ORDINAL_POSITION: 1,
    },
    {
      COLUMN_NAME: "estabelecimento_id",
      DATA_TYPE: "int",
      IS_NULLABLE: "NO",
      COLUMN_DEFAULT: "12",
      COLUMN_KEY: "",
      EXTRA: "",
      ORDINAL_POSITION: 2,
    },
    ...columns.map((column, index) => ({
      COLUMN_NAME: column.nome,
      DATA_TYPE: column.tipo === "boolean" ? "tinyint" : column.tipo,
      IS_NULLABLE: column.obrigatorio ? "NO" : "YES",
      COLUMN_KEY: "",
      EXTRA: "",
      ...(column.tipo === "varchar"
        ? {
            CHARACTER_MAXIMUM_LENGTH: String(column.tamanho ?? 255),
            CHARACTER_SET_NAME: "utf8mb4",
            COLLATION_NAME: "utf8mb4_bin",
          }
        : {}),
      ...(column.tipo === "text"
        ? { CHARACTER_SET_NAME: "utf8mb4", COLLATION_NAME: "utf8mb4_bin" }
        : {}),
      ...(column.tipo === "decimal"
        ? {
            NUMERIC_PRECISION: String(column.tamanho ?? 18),
            NUMERIC_SCALE: String(column.escala ?? 2),
          }
        : {}),
      ORDINAL_POSITION: index + 3,
      ...(column.tipo !== "varchar" && column.tipo !== "text"
        ? { CHARACTER_SET_NAME: null, COLLATION_NAME: null }
        : {}),
    })),
    {
      COLUMN_NAME: "_sincronizado_em",
      DATA_TYPE: "datetime",
      IS_NULLABLE: "YES",
      COLUMN_KEY: "",
      EXTRA: "",
      ORDINAL_POSITION: columns.length + 3,
    },
  ];
}

function sourceColumns() {
  const mapped = columns.map((column, index) => ({
    nome: column.nome,
    tipo:
      column.tipo === "varchar"
        ? "character varying"
        : column.tipo === "text"
          ? "text"
          : column.tipo === "bigint"
            ? "bigint"
            : "numeric",
    udt:
      column.tipo === "varchar"
        ? "varchar"
        : column.tipo === "text"
          ? "text"
          : column.tipo === "bigint"
            ? "int8"
            : "numeric",
    nullable: column.obrigatorio ? "NO" : "YES",
    tamanho: column.tipo === "varchar" ? (column.tamanho ?? 255) : null,
    precisao:
      column.tipo === "decimal"
        ? (column.tamanho ?? 18)
        : column.tipo === "bigint"
          ? 64
          : null,
    escala:
      column.tipo === "decimal"
        ? (column.escala ?? 2)
        : column.tipo === "bigint"
          ? 0
          : null,
    precisao_data_hora: null,
    ordem: index + 1,
  }));
  return [
    ...mapped,
    {
      nome: "unidade",
      tipo: "character varying",
      udt: "varchar",
      nullable: "NO",
      tamanho: 40,
      precisao: null,
      escala: null,
      precisao_data_hora: null,
      ordem: mapped.length + 1,
    },
  ];
}

function setupDestination() {
  mocks.destination.query.mockResolvedValue([[{ versao: "8.0.36 MySQL" }]]);
  mocks.destination.execute.mockImplementation(async (request: unknown) => {
    const sql = sqlOf(request);
    if (sql.includes("SELECT VERSION()")) return [[{ versao: "8.0.36 MySQL" }]];
    if (sql.includes("START TRANSACTION")) return [{ affectedRows: 0 }];
    if (sql.includes("FROM estabelecimentos")) return [[{ id: 12 }]];
    if (sql.includes("FROM integracao_mapeamentos"))
      return [
        [
          {
            id: 4,
            tabelaDestinoId: 77,
            conexaoOrigemId: 3,
            descricao: JSON.stringify({ marker: "easylocal-direto-v1" }),
            queryOrigem: JSON.stringify(reading),
            campoChave: reading.campoChave,
            frequencia: "manual",
            ativo: "nao",
            estabelecimentoId: 12,
            modoImportacao: "incremental",
            colunaControle: null,
            ultimoValorControle: null,
            ultimaSincronizacao: counters.ultimaSincronizacao,
            totalRegistrosImportados: counters.totalRegistrosImportados,
          },
        ],
      ];
    if (sql.includes("FROM integracao_tabelas"))
      return [
        [
          {
            id: 77,
            nome: "el_12_teste",
            estabelecimentoId: 12,
            criadaNoBanco: "sim",
            totalRegistros: counters.totalRegistros,
            atualizadoEm: counters.atualizadoEm,
            descricao: JSON.stringify({
              marker: "easylocal-direto-v1",
              colunas: columns,
            }),
          },
        ],
      ];
    if (sql.includes("FROM integracao_conexoes"))
      return [
        [
          {
            id: 3,
            nome: "__EASYLOCAL_SERVER__",
            descricao: "easylocal-direto-v1",
            tipo: "postgresql",
            host: "nao-retornar",
            porta: 5432,
            banco: "easy",
            usuario: "admin",
            ssl: "sim",
            estabelecimentoId: 12,
            ativo: "nao",
          },
        ],
      ];
    if (sql.includes("information_schema.COLUMNS")) return [physical()];
    if (sql.includes("GROUP BY")) return [[]];
    if (sql.startsWith("SELECT CAST(`_id`")) return [existing];
    if (sql.startsWith("UPDATE integracao_mapeamentos"))
      return [{ affectedRows: 1 }];
    if (sql.startsWith("INSERT INTO") || sql.startsWith("UPDATE `integ_")) {
      if (sql.startsWith("UPDATE `integ_")) {
        const ids = /`_id` IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
        return [{ affectedRows: (ids.match(/\?/g) ?? []).length }];
      }
      const tuples = sql.match(/\), \(/g)?.length ?? 0;
      return [{ affectedRows: tuples + 1 }];
    }
    return [{ affectedRows: 1 }];
  });
}

function setupPg() {
  mocks.pgQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (
      sql.startsWith("BEGIN TRANSACTION") ||
      sql.startsWith("SET LOCAL") ||
      sql === "ROLLBACK"
    )
      return { rows: [] };
    if (sql.includes("information_schema.columns"))
      return { rows: sourceColumns() };
    if (sql.includes("information_schema.table_constraints"))
      return { rows: [] };
    if (sql.startsWith('SELECT "codigo"')) {
      const limit = Number(values?.[1]);
      const offset = Number(values?.[2]);
      return { rows: rows.slice(offset, offset + limit) };
    }
    return { rows: [] };
  });
}

function reset() {
  vi.resetAllMocks();
  mocks.pgInstances.length = 0;
  rows = [];
  existing = [];
  reading = {
    estabelecimentoId: 12,
    tabelaId: 77,
    origem: { schema: "public", tabela: "origem" },
    colunaEstabelecimento: "unidade",
    valorEstabelecimento: "hospital_12",
    campoChave: "codigo",
    dominio: "atendimentos",
    frequenciaDesejada: "manual",
  };
  columns = [
    { nome: "codigo", tipo: "bigint", obrigatorio: true },
    {
      nome: "valor",
      tipo: "decimal",
      tamanho: 15,
      escala: 4,
      obrigatorio: false,
    },
  ];
  counters = {
    ultimaSincronizacao: null,
    totalRegistrosImportados: 0,
    atualizadoEm: "2026-01-01 00:00:00",
    totalRegistros: 0,
  };
  mocks.getConnection.mockResolvedValue(mocks.destination);
  mocks.config.mockResolvedValue({
    host: "db.example",
    port: 5432,
    database: "easy",
    user: "admin",
    password: "secret",
    ca: "pem",
  });
  setupDestination();
  setupPg();
}

describe("importação agendada EASYLocal → Portal", () => {
  beforeEach(reset);
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pagina mais de 2.000 registros na origem PostgreSQL repeatable-read/read-only", async () => {
    rows = Array.from({ length: 2001 }, (_, index) => ({
      codigo: String(index + 1),
      valor: "0.0000",
    }));
    await expect(
      preverEasyLocalImportacaoAgendada(input, 9)
    ).resolves.toMatchObject({
      registrosLidos: 2001,
      registrosInseridos: 2001,
      limite: 100000,
    });
    const client = mocks.pgInstances[0]!;
    expect(client.query).toHaveBeenCalledWith(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    const pages = client.query.mock.calls.filter(call =>
      String(call[0]).startsWith('SELECT "codigo"')
    );
    expect(pages).toHaveLength(3);
    expect(pages.map(call => call[1]?.[2])).toEqual([0, 1000, 2000]);
    expect(
      client.query.mock.calls.some(call =>
        /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE)\b/i.test(
          String(call[0])
        )
      )
    ).toBe(false);
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ_|UPDATE `integ_/.test(sqlOf(call[0]))
      )
    ).toBe(false);
  });

  it("detecta o registro 100001 e faz rollback sem truncar nem escrever", async () => {
    rows = Array.from({ length: 100001 }, (_, index) => ({
      codigo: String(index + 1),
      valor: "0.0000",
    }));
    await expect(
      preverEasyLocalImportacaoAgendada(input, 9)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("100000"),
    });
    expect(mocks.destination.rollback).toHaveBeenCalledOnce();
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ_|UPDATE `integ_/.test(sqlOf(call[0]))
      )
    ).toBe(false);
  });

  it("mantém revisão estática quando somente contadores/timestamps mudam e a invalida para mudança do plano", async () => {
    rows = [{ codigo: "1", valor: "0.0000" }];
    const first = await preverEasyLocalImportacaoAgendada(input, 9);
    counters = {
      ultimaSincronizacao: "2026-10-01 00:00:00",
      totalRegistrosImportados: 999,
      atualizadoEm: "2026-10-02 00:00:00",
      totalRegistros: 999,
    };
    const countersChanged = await preverEasyLocalImportacaoAgendada(input, 9);
    expect(countersChanged.revisao).toBe(first.revisao);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "admin",
      password: "senha-trocada",
      ca: "certificado-trocado",
    });
    const credentialChanged = await preverEasyLocalImportacaoAgendada(input, 9);
    expect(credentialChanged.revisao).not.toBe(first.revisao);
    reading = { ...reading, valorEstabelecimento: "hospital_outra_unidade" };
    const planChanged = await preverEasyLocalImportacaoAgendada(input, 9);
    expect(planChanged.revisao).not.toBe(credentialChanged.revisao);
  });

  it("faz INSERT em lote, trata A/a binariamente e não passa _id auto-increment", async () => {
    columns = [
      { nome: "codigo", tipo: "varchar", tamanho: 20, obrigatorio: true },
      { nome: "descricao", tipo: "varchar", tamanho: 100, obrigatorio: false },
    ];
    rows = [
      { codigo: "A", descricao: "maiuscula" },
      { codigo: "a", descricao: "minuscula" },
    ];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    columns = [
      { nome: "codigo", tipo: "varchar", tamanho: 20, obrigatorio: true },
      { nome: "descricao", tipo: "varchar", tamanho: 100, obrigatorio: false },
    ];
    rows = [
      { codigo: "A", descricao: "maiuscula" },
      { codigo: "a", descricao: "minuscula" },
    ];
    await expect(
      executarEasyLocalImportacaoAgendada(input, 9, preview.revisao)
    ).resolves.toEqual({
      sucesso: true,
      registrosLidos: 2,
      registrosInseridos: 2,
      registrosAtualizados: 0,
      registrosInalterados: 0,
    });
    const statements = mocks.destination.execute.mock.calls.map(call =>
      sqlOf(call[0])
    );
    expect(statements.join("\n")).toContain("BINARY `codigo` IN (?, ?)");
    const insert = statements.find(statement =>
      statement.startsWith("INSERT INTO `integ_el_12_teste`")
    )!;
    expect(insert).toContain("), (");
    expect(insert).not.toContain("`_id`");
    expect(mocks.destination.commit).toHaveBeenCalledOnce();
  });

  it("faz UPDATE bulk CASE pelo _id técnico e não uma query por linha", async () => {
    rows = [
      { codigo: "1", valor: "2.0000" },
      { codigo: "2", valor: "3.0000" },
    ];
    existing = [
      { _easylocal_id: "101", codigo: "1", valor: "1.0000" },
      { _easylocal_id: "102", codigo: "2", valor: "1.0000" },
    ];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    rows = [
      { codigo: "1", valor: "2.0000" },
      { codigo: "2", valor: "3.0000" },
    ];
    existing = [
      { _easylocal_id: "101", codigo: "1", valor: "1.0000" },
      { _easylocal_id: "102", codigo: "2", valor: "1.0000" },
    ];
    await expect(
      executarEasyLocalImportacaoAgendada(input, 9, preview.revisao)
    ).resolves.toMatchObject({ registrosAtualizados: 2 });
    const updates = mocks.destination.execute.mock.calls
      .map(call => sqlOf(call[0]))
      .filter(statement => statement.startsWith("UPDATE `integ_el_12_teste`"));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("CASE `_id` WHEN ? THEN ? WHEN ? THEN ?");
    expect(updates[0]).toContain("`_id` IN (?, ?)");
    expect(updates[0]).not.toContain("`codigo` = ?");
  });

  it("não inicia writes nem devolve conexão tardia ao pool ao expirar durante aquisição", async () => {
    rows = [{ codigo: "1", valor: "0.0000" }];
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(90_001);
    await expect(
      preverEasyLocalImportacaoAgendada(input, 9)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.destination.rollback).not.toHaveBeenCalled();
    expect(mocks.destination.release).not.toHaveBeenCalled();
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ_|UPDATE `integ_/.test(sqlOf(call[0]))
      )
    ).toBe(false);
  });

  it("faz rollback quando revisão aprovada não corresponde à metaconfiguração atual", async () => {
    rows = [{ codigo: "1", valor: "0.0000" }];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    rows = [{ codigo: "1", valor: "0.0000" }];
    reading = { ...reading, valorEstabelecimento: "mudou" };
    await expect(
      executarEasyLocalImportacaoAgendada(input, 9, preview.revisao)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.destination.rollback).toHaveBeenCalledOnce();
    expect(mocks.destination.commit).not.toHaveBeenCalled();
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ_|UPDATE `integ_/.test(sqlOf(call[0]))
      )
    ).toBe(false);
  });

  it("destrói a conexão no commit incerto e não a devolve ao pool", async () => {
    rows = [{ codigo: "1", valor: "0.0000" }];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    rows = [{ codigo: "1", valor: "0.0000" }];
    mocks.destination.commit.mockRejectedValue(new Error("falha privada"));
    await expect(
      executarEasyLocalImportacaoAgendada(input, 9, preview.revisao)
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringMatching(/privada/),
    });
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.release).not.toHaveBeenCalled();
  });

  it("cancela getConnection bloqueado e destrói a conexão que chega após o deadline", async () => {
    vi.useFakeTimers();
    let resolveConnection!: (connection: typeof mocks.destination) => void;
    mocks.getConnection.mockImplementation(
      () =>
        new Promise<typeof mocks.destination>(resolve => {
          resolveConnection = resolve;
        })
    );
    const pending = preverEasyLocalImportacaoAgendada(input, 9);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    resolveConnection(mocks.destination);
    await Promise.resolve();
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.release).not.toHaveBeenCalled();
    expect(mocks.destination.execute).not.toHaveBeenCalled();
  });

  it("quarentena o destino quando uma escrita bloqueada excede o deadline e não faz COMMIT", async () => {
    vi.useFakeTimers();
    rows = [{ codigo: "1", valor: "0.0000" }];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    vi.useFakeTimers();
    rows = [{ codigo: "1", valor: "0.0000" }];
    const normal = mocks.destination.execute.getMockImplementation()!;
    mocks.destination.execute.mockImplementation(
      (request: unknown, values?: unknown[]) => {
        if (sqlOf(request).startsWith("INSERT INTO `integ_"))
          return new Promise(() => undefined);
        return normal(request, values);
      }
    );
    const pending = executarEasyLocalImportacaoAgendada(
      input,
      9,
      preview.revisao
    );
    const rejected = expect(pending).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.commit).not.toHaveBeenCalled();
    expect(mocks.destination.release).not.toHaveBeenCalled();
  });

  it("trata COMMIT bloqueado ou ACK tardio como resultado incerto e mantém a conexão destruída", async () => {
    vi.useFakeTimers();
    rows = [{ codigo: "1", valor: "0.0000" }];
    const preview = await preverEasyLocalImportacaoAgendada(input, 9);
    reset();
    vi.useFakeTimers();
    rows = [{ codigo: "1", valor: "0.0000" }];
    mocks.destination.commit.mockImplementation(
      () => new Promise(() => undefined)
    );
    const pending = executarEasyLocalImportacaoAgendada(
      input,
      9,
      preview.revisao
    );
    const rejected = expect(pending).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("não confirmado"),
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.rollback).not.toHaveBeenCalled();
    expect(mocks.destination.release).not.toHaveBeenCalled();
  });

  it("interrompe conexão PostgreSQL bloqueada e não devolve o destino ao pool", async () => {
    vi.useFakeTimers();
    mocks.pgConnect.mockImplementation(() => new Promise(() => undefined));
    const pending = preverEasyLocalImportacaoAgendada(input, 9);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(mocks.pgInstances[0]!.end).toHaveBeenCalled();
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.release).not.toHaveBeenCalled();
    expect(mocks.destination.commit).not.toHaveBeenCalled();
  });

  it("encerra rollback bloqueado em cleanup curto e descarta a conexão", async () => {
    vi.useFakeTimers();
    mocks.destination.rollback.mockImplementation(
      () => new Promise(() => undefined)
    );
    const pending = preverEasyLocalImportacaoAgendada(input, 9);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await rejected;
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.release).not.toHaveBeenCalled();
    expect(mocks.destination.commit).not.toHaveBeenCalled();
  });

  it("adquire mutex central antes de unidade e metadados para bloquear troca de credencial", async () => {
    await preverEasyLocalImportacaoAgendada(input, 9);
    const statements = mocks.destination.execute.mock.calls.map(call =>
      sqlOf(call[0])
    );
    const mutex = statements.indexOf(
      "SELECT id FROM estabelecimentos ORDER BY id LIMIT 1 FOR UPDATE"
    );
    expect(mutex).toBeGreaterThanOrEqual(0);
    expect(mutex).toBeLessThan(
      statements.findIndex(sql => sql.includes("FROM integracao_mapeamentos"))
    );
    expect(mutex).toBeLessThan(
      statements.findIndex(sql => sql.includes("information_schema.COLUMNS"))
    );
  });

  it("rejeita snapshot textual acima de 32 MiB antes de qualquer escrita", async () => {
    columns = [
      { nome: "codigo", tipo: "bigint", obrigatorio: true },
      { nome: "valor", tipo: "text", obrigatorio: false },
    ];
    // Cada TEXT cabe em 65.535 bytes; é a soma válida que ultrapassa 32 MiB.
    rows = Array.from({ length: 600 }, (_, index) => ({
      codigo: String(index + 1),
      valor: "x".repeat(60 * 1024),
    }));
    await expect(
      preverEasyLocalImportacaoAgendada(input, 9)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("limite seguro de dados"),
    });
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ_|UPDATE `integ_/.test(sqlOf(call[0]))
      )
    ).toBe(false);
  });
});
