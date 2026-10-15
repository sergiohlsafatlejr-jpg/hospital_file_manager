import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destination: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn(),
    query: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
  },
  getConnection: vi.fn(),
  config: vi.fn(),
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
    connect = vi.fn();
    query = mocks.pgQuery;
    end = vi.fn();
    constructor() {
      mocks.pgInstances.push(this);
    }
  }
  return { ...actual, default: { ...actual.default, Client } };
});

import {
  executarEasyLocalImportacao,
  preverEasyLocalImportacao,
} from "./easyLocalImportacaoService";

const input = { estabelecimentoId: 12, leituraId: 4 };
const defaultColumns = [
  { nome: "codigo", tipo: "bigint", obrigatorio: true },
  {
    nome: "valor",
    tipo: "decimal",
    tamanho: 15,
    escala: 4,
    obrigatorio: false,
  },
  { nome: "data_civil", tipo: "datetime", obrigatorio: false },
];
const defaultReading = {
  estabelecimentoId: 12,
  tabelaId: 77,
  origem: { schema: "public", tabela: "origem" },
  colunaEstabelecimento: "unidade",
  valorEstabelecimento: "hospital_12",
  campoChave: "codigo",
  dominio: "atendimentos",
  frequenciaDesejada: "manual",
};
const defaultPhysical = [
  {
    COLUMN_NAME: "_id",
    DATA_TYPE: "bigint",
    IS_NULLABLE: "NO",
    COLUMN_KEY: "PRI",
    EXTRA: "auto_increment",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 1,
  },
  {
    COLUMN_NAME: "estabelecimento_id",
    DATA_TYPE: "int",
    IS_NULLABLE: "NO",
    COLUMN_DEFAULT: "12",
    COLUMN_KEY: "",
    EXTRA: "",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 2,
  },
  {
    COLUMN_NAME: "codigo",
    DATA_TYPE: "bigint",
    IS_NULLABLE: "NO",
    COLUMN_KEY: "",
    EXTRA: "",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 3,
  },
  {
    COLUMN_NAME: "valor",
    DATA_TYPE: "decimal",
    IS_NULLABLE: "YES",
    COLUMN_KEY: "",
    EXTRA: "",
    NUMERIC_PRECISION: "15",
    NUMERIC_SCALE: "4",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 4,
  },
  {
    COLUMN_NAME: "data_civil",
    DATA_TYPE: "datetime",
    IS_NULLABLE: "YES",
    COLUMN_KEY: "",
    EXTRA: "",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 5,
  },
  {
    COLUMN_NAME: "_sincronizado_em",
    DATA_TYPE: "datetime",
    IS_NULLABLE: "YES",
    COLUMN_KEY: "",
    EXTRA: "",
    CHARACTER_SET_NAME: null,
    COLLATION_NAME: null,
    ORDINAL_POSITION: 6,
  },
];
const defaultSourceColumns = [
  {
    nome: "codigo",
    tipo: "bigint",
    udt: "int8",
    nullable: "NO",
    tamanho: null,
    precisao: 64,
    escala: 0,
    precisao_data_hora: null,
    ordem: 1,
  },
  {
    nome: "valor",
    tipo: "numeric",
    udt: "numeric",
    nullable: "YES",
    tamanho: null,
    precisao: 15,
    escala: 4,
    precisao_data_hora: null,
    ordem: 2,
  },
  {
    nome: "data_civil",
    tipo: "timestamp without time zone",
    udt: "timestamp",
    nullable: "YES",
    tamanho: null,
    precisao: null,
    escala: null,
    precisao_data_hora: 0,
    ordem: 3,
  },
  {
    nome: "unidade",
    tipo: "character varying",
    udt: "varchar",
    nullable: "NO",
    tamanho: 40,
    precisao: null,
    escala: null,
    precisao_data_hora: null,
    ordem: 4,
  },
];
let columns = defaultColumns;
let reading = defaultReading;
let physicalRows = defaultPhysical;
let sourceColumnRows = defaultSourceColumns;
let sourcePrimaryKeyRows: Array<Record<string, unknown>> = [];

function physical() {
  return physicalRows;
}

function sourceColumns() {
  return sourceColumnRows;
}

function destinationDefaults(existing: Array<Record<string, unknown>> = []) {
  mocks.destination.query.mockResolvedValue([[{ versao: "8.0.36 MySQL" }]]);
  mocks.destination.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM estabelecimentos")) return [[{ id: 12 }]];
    if (sql.includes("FROM integracao_mapeamentos")) {
      return [
        [
          {
            id: 4,
            tabelaDestinoId: 77,
            conexaoOrigemId: 3,
            descricao: JSON.stringify({ marker: "easylocal-direto-v1" }),
            queryOrigem: JSON.stringify(reading),
            campoChave: "codigo",
            frequencia: "manual",
            ativo: "nao",
            estabelecimentoId: 12,
            modoImportacao: "incremental",
            colunaControle: null,
            ultimoValorControle: null,
            ultimaSincronizacao: null,
            totalRegistrosImportados: 0,
          },
        ],
      ];
    }
    if (sql.includes("FROM integracao_tabelas")) {
      return [
        [
          {
            id: 77,
            nome: "el_12_teste",
            estabelecimentoId: 12,
            criadaNoBanco: "sim",
            totalRegistros: 0,
            atualizadoEm: "2026-01-01 00:00:00",
            descricao: JSON.stringify({
              marker: "easylocal-direto-v1",
              colunas: columns,
            }),
          },
        ],
      ];
    }
    if (sql.includes("FROM integracao_conexoes")) {
      return [
        [
          {
            id: 3,
            nome: "__EASYLOCAL_SERVER__",
            descricao: "easylocal-direto-v1",
            tipo: "postgresql",
            host: "segredos-do-servidor",
            porta: 5432,
            banco: "EASYLocal",
            usuario: "role-servidor",
            ssl: "sim",
            estabelecimentoId: 12,
            ativo: "nao",
          },
        ],
      ];
    }
    if (sql.includes("information_schema.COLUMNS")) return [physical()];
    if (
      sql.startsWith("SELECT ") &&
      sql.includes("FROM `integ_el_12_teste`") &&
      sql.includes(" IN (")
    )
      return [existing];
    if (sql.startsWith("UPDATE ")) return [{ affectedRows: 1 }];
    return [{ affectedRows: 1, insertId: 99 }];
  });
}

function pgDefaults(rows: Array<Record<string, unknown>>) {
  mocks.pgQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith("BEGIN TRANSACTION")) return { rows: [] };
    if (sql.includes("information_schema.columns"))
      return { rows: sourceColumns() };
    if (sql.includes("information_schema.table_constraints"))
      return { rows: sourcePrimaryKeyRows };
    if (sql.startsWith('SELECT "codigo"')) return { rows };
    return { rows: [] };
  });
}

async function preview(
  rows: Array<Record<string, unknown>>,
  existing: Array<Record<string, unknown>> = []
) {
  pgDefaults(rows);
  return preverEasyLocalImportacao(input, 9);
}

describe("importação manual EASYLocal → Portal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pgInstances.length = 0;
    columns = defaultColumns;
    reading = defaultReading;
    physicalRows = defaultPhysical;
    sourceColumnRows = defaultSourceColumns;
    sourcePrimaryKeyRows = [];
    mocks.getConnection.mockResolvedValue(mocks.destination);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "reader",
      password: "secret",
      ca: "pem",
    });
    process.env.JWT_SECRET = "teste-token-hmac";
    destinationDefaults();
  });

  it("produz somente contagens, lê em repeatable read/read only e preserva decimal/bigint/data civil como texto", async () => {
    const result = await preview([
      {
        codigo: "9007199254740993",
        valor: "12.3400",
        data_civil: "2026-10-14 08:30:00",
      },
    ]);
    expect(result).toMatchObject({
      registrosLidos: 1,
      registrosInseridos: 1,
      registrosAtualizados: 0,
      registrosInalterados: 0,
      nomeTabela: "integ_el_12_teste",
      limite: 2000,
    });
    expect(Object.keys(result).sort()).toEqual([
      "expiraEm",
      "limite",
      "nomeTabela",
      "registrosAtualizados",
      "registrosInalterados",
      "registrosInseridos",
      "registrosLidos",
      "tokenPrevia",
    ]);
    const client = mocks.pgInstances[0]!;
    expect(client.query).toHaveBeenCalledWith(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    const select = client.query.mock.calls.find(call =>
      String(call[0]).startsWith('SELECT "codigo"')
    )!;
    expect(select[0]).toContain("LIMIT $2");
    expect(select[1]).toEqual(["hospital_12", 2001]);
    expect(JSON.stringify(result)).not.toContain("9007199254740993");
    expect(JSON.stringify(result)).not.toContain("12.3400");
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO|UPDATE .*integ_el/.test(String(call[0]))
      )
    ).toBe(false);
  });

  it("aceita credencial administrativa sem consultar pg_roles e mantém a origem somente leitura", async () => {
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "role-admin",
      password: "secret",
      ca: "pem",
    });
    await expect(
      preview([{ codigo: "1", valor: null, data_civil: null }])
    ).resolves.toMatchObject({ registrosLidos: 1 });
    const client = mocks.pgInstances[0]!;
    expect(
      client.query.mock.calls.some(call =>
        String(call[0]).includes("pg_catalog.pg_roles")
      )
    ).toBe(false);
    expect(client.query).toHaveBeenCalledWith(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
  });

  it("aceita view sem PK física e chave nullable no catálogo quando o recorte tem chave real única não nula", async () => {
    sourceColumnRows = defaultSourceColumns.map(column =>
      column.nome === "codigo" ? { ...column, nullable: "YES" } : column
    );
    await expect(
      preview([{ codigo: "1", valor: null, data_civil: null }])
    ).resolves.toMatchObject({ registrosLidos: 1 });
    const client = mocks.pgInstances[0]!;
    expect(
      client.query.mock.calls.some(call =>
        String(call[0]).includes("information_schema.table_constraints")
      )
    ).toBe(true);
  });

  it.each([
    ["latin1", "latin1_swedish_ci"],
    ["utf8mb3", "utf8mb3_general_ci"],
    ["utf8mb4", "utf8_general_ci"],
  ])(
    "rejeita destino textual com charset/collation incompatível (%s/%s) antes de escrever",
    async (charset, collation) => {
      columns = [
        { nome: "codigo", tipo: "varchar", tamanho: 20, obrigatorio: true },
        { nome: "descricao", tipo: "text", obrigatorio: false },
      ];
      physicalRows = [
        ...defaultPhysical.slice(0, 2),
        {
          COLUMN_NAME: "codigo",
          DATA_TYPE: "varchar",
          IS_NULLABLE: "NO",
          COLUMN_KEY: "",
          EXTRA: "",
          CHARACTER_MAXIMUM_LENGTH: "20",
          CHARACTER_SET_NAME: charset,
          COLLATION_NAME: collation,
          ORDINAL_POSITION: 3,
        },
        {
          COLUMN_NAME: "descricao",
          DATA_TYPE: "text",
          IS_NULLABLE: "YES",
          COLUMN_KEY: "",
          EXTRA: "",
          CHARACTER_SET_NAME: "utf8mb4",
          COLLATION_NAME: "utf8mb4_bin",
          ORDINAL_POSITION: 4,
        },
        {
          ...defaultPhysical.at(-1)!,
          ORDINAL_POSITION: 5,
        },
      ];
      await expect(
        preview([{ codigo: "😀", descricao: "🏥" }])
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mocks.pgInstances).toHaveLength(0);
      expect(
        mocks.destination.execute.mock.calls.some(call =>
          /^(INSERT INTO `integ_|UPDATE `integ_)/.test(String(call[0]))
        )
      ).toBe(false);
      expect(
        mocks.destination.execute.mock.calls.some(
          call =>
            String(call[0]).includes("CHARACTER_SET_NAME") &&
            String(call[0]).includes("COLLATION_NAME")
        )
      ).toBe(true);
    }
  );

  it("preserva A/a como chaves distintas em SQL binário e no fingerprint", async () => {
    columns = [
      { nome: "codigo", tipo: "varchar", tamanho: 20, obrigatorio: true },
      { nome: "descricao", tipo: "text", obrigatorio: false },
    ];
    reading = { ...defaultReading, campoChave: "codigo" };
    physicalRows = [
      {
        COLUMN_NAME: "_id",
        DATA_TYPE: "bigint",
        IS_NULLABLE: "NO",
        COLUMN_KEY: "PRI",
        EXTRA: "auto_increment",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 1,
      },
      {
        COLUMN_NAME: "estabelecimento_id",
        DATA_TYPE: "int",
        IS_NULLABLE: "NO",
        COLUMN_DEFAULT: "12",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 2,
      },
      {
        COLUMN_NAME: "codigo",
        DATA_TYPE: "varchar",
        IS_NULLABLE: "NO",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_MAXIMUM_LENGTH: "20",
        CHARACTER_SET_NAME: "utf8mb4",
        COLLATION_NAME: "utf8mb4_0900_ai_ci",
        ORDINAL_POSITION: 3,
      },
      {
        COLUMN_NAME: "descricao",
        DATA_TYPE: "text",
        IS_NULLABLE: "YES",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: "utf8mb4",
        COLLATION_NAME: "utf8mb4_0900_ai_ci",
        ORDINAL_POSITION: 4,
      },
      {
        COLUMN_NAME: "_sincronizado_em",
        DATA_TYPE: "datetime",
        IS_NULLABLE: "YES",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 5,
      },
    ];
    sourceColumnRows = [
      {
        nome: "codigo",
        tipo: "character varying",
        udt: "varchar",
        nullable: "YES",
        tamanho: 20,
        precisao: null,
        escala: null,
        precisao_data_hora: null,
        ordem: 1,
      },
      {
        nome: "descricao",
        tipo: "text",
        udt: "text",
        nullable: "YES",
        tamanho: null,
        precisao: null,
        escala: null,
        precisao_data_hora: null,
        ordem: 2,
      },
      {
        nome: "unidade",
        tipo: "character varying",
        udt: "varchar",
        nullable: "NO",
        tamanho: 40,
        precisao: null,
        escala: null,
        precisao_data_hora: null,
        ordem: 3,
      },
    ];
    const rows = [
      { codigo: "A", descricao: "maiúscula 😀" },
      { codigo: "a", descricao: "minúscula 🏥" },
    ];
    await expect(preview(rows)).resolves.toMatchObject({
      registrosLidos: 2,
      registrosInseridos: 2,
    });
    const sql = mocks.destination.execute.mock.calls
      .map(call => String(call[0]))
      .join("\n");
    expect(sql).toContain("GROUP BY BINARY `codigo`");
    expect(sql).toContain("BINARY `codigo` IN (?, ?)");
  });

  it.each([
    [
      [{ codigo: "1", valor: 12.34, data_civil: null }],
      "decimal de origem como float",
    ],
    [
      [{ codigo: Number.MAX_SAFE_INTEGER + 1, valor: null, data_civil: null }],
      "bigint de origem como number inseguro",
    ],
    [
      [{ codigo: "1", valor: null, data_civil: "2026-02-29 10:00:00" }],
      "dia de calendário inexistente",
    ],
    [
      [{ codigo: "1", valor: null, data_civil: "0999-12-31 10:00:00" }],
      "ano fora da faixa MySQL",
    ],
    [
      [{ codigo: "1", valor: null, data_civil: "2026-10-14 24:00:00" }],
      "hora inválida",
    ],
    [
      [{ codigo: "1", valor: null, data_civil: "2026-10-14 23:60:00" }],
      "minuto inválido",
    ],
    [
      [{ codigo: "1", valor: null, data_civil: "2026-10-14 23:59:60" }],
      "segundo inválido",
    ],
  ])(
    "rejeita %s sem arredondar ou aceitar calendário/relógio inválidos",
    async rows => {
      await expect(preview(rows)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  );

  it("rejeita TEXT acima de 65535 bytes UTF-8 antes de escrever o destino", async () => {
    columns = [
      { nome: "codigo", tipo: "bigint", obrigatorio: true },
      { nome: "descricao", tipo: "text", obrigatorio: false },
    ];
    physicalRows = [
      {
        COLUMN_NAME: "_id",
        DATA_TYPE: "bigint",
        IS_NULLABLE: "NO",
        COLUMN_KEY: "PRI",
        EXTRA: "auto_increment",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 1,
      },
      {
        COLUMN_NAME: "estabelecimento_id",
        DATA_TYPE: "int",
        IS_NULLABLE: "NO",
        COLUMN_DEFAULT: "12",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 2,
      },
      {
        COLUMN_NAME: "codigo",
        DATA_TYPE: "bigint",
        IS_NULLABLE: "NO",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 3,
      },
      {
        COLUMN_NAME: "descricao",
        DATA_TYPE: "text",
        IS_NULLABLE: "YES",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: "utf8mb4",
        COLLATION_NAME: "utf8mb4_bin",
        ORDINAL_POSITION: 4,
      },
      {
        COLUMN_NAME: "_sincronizado_em",
        DATA_TYPE: "datetime",
        IS_NULLABLE: "YES",
        COLUMN_KEY: "",
        EXTRA: "",
        CHARACTER_SET_NAME: null,
        COLLATION_NAME: null,
        ORDINAL_POSITION: 5,
      },
    ];
    sourceColumnRows = [
      defaultSourceColumns[0]!,
      {
        nome: "descricao",
        tipo: "text",
        udt: "text",
        nullable: "YES",
        tamanho: null,
        precisao: null,
        escala: null,
        precisao_data_hora: null,
        ordem: 2,
      },
      defaultSourceColumns[3]!,
    ];
    await expect(
      preview([{ codigo: "1", descricao: "😀".repeat(16384) }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita a linha 2001 em vez de truncar o lote", async () => {
    const rows = Array.from({ length: 2001 }, (_, index) => ({
      codigo: String(index + 1),
      valor: "0.0000",
      data_civil: null,
    }));
    await expect(preview(rows)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("2000"),
    });
  });

  it("rejeita chave nula ou duplicada, sem escrever destino", async () => {
    await expect(
      preview([{ codigo: null, valor: null, data_civil: null }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.resetAllMocks();
    mocks.pgInstances.length = 0;
    mocks.getConnection.mockResolvedValue(mocks.destination);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "reader",
      password: "secret",
      ca: "pem",
    });
    destinationDefaults();
    await expect(
      preview([
        { codigo: "1", valor: null, data_civil: null },
        { codigo: "1", valor: null, data_civil: null },
      ])
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      mocks.destination.execute.mock.calls.some(call =>
        /INSERT INTO `integ|UPDATE `integ/.test(String(call[0]))
      )
    ).toBe(false);
  });

  it("vincula token a usuário/unidade/leitura e expiração sem revelar conteúdo", async () => {
    const result = await preview([
      { codigo: "1", valor: null, data_civil: null },
    ]);
    await expect(
      executarEasyLocalImportacao(
        {
          ...input,
          confirmarImportacao: true,
          tokenPrevia: result.tokenPrevia,
        },
        10
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      executarEasyLocalImportacao(
        {
          estabelecimentoId: 13,
          leituraId: 4,
          confirmarImportacao: true,
          tokenPrevia: result.tokenPrevia,
        },
        9
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(result)).not.toContain("hospital_12");
  });

  it("recomputa após lock, executa insert/update somente na unidade e registra apenas sucesso agregado", async () => {
    const prior = [
      { codigo: "2", valor: "1.0000", data_civil: "2026-10-13 10:00:00" },
    ];
    destinationDefaults(prior);
    const result = await preview(
      [
        { codigo: "1", valor: "0.0000", data_civil: null },
        { codigo: "2", valor: "2.0000", data_civil: "2026-10-14 10:00:00" },
      ],
      prior
    );
    vi.resetAllMocks();
    mocks.pgInstances.length = 0;
    mocks.getConnection.mockResolvedValue(mocks.destination);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "reader",
      password: "secret",
      ca: "pem",
    });
    destinationDefaults(prior);
    pgDefaults([
      { codigo: "1", valor: "0.0000", data_civil: null },
      { codigo: "2", valor: "2.0000", data_civil: "2026-10-14 10:00:00" },
    ]);
    const executePromise = executarEasyLocalImportacao(
      { ...input, confirmarImportacao: true, tokenPrevia: result.tokenPrevia },
      9
    );
    await expect(executePromise).resolves.toEqual({
      sucesso: true,
      registrosLidos: 2,
      registrosInseridos: 1,
      registrosAtualizados: 1,
      registrosInalterados: 0,
    });
    const sql = mocks.destination.execute.mock.calls
      .map(call => String(call[0]))
      .join("\n");
    expect(sql).toContain("INSERT INTO `integ_el_12_teste`");
    expect(sql).toContain("WHERE `estabelecimento_id` = ? AND `codigo` = ?");
    expect(sql).toContain("INSERT INTO integracao_sincronizacoes");
    expect(sql).not.toMatch(/DELETE|TRUNCATE|DROP|ALTER|CREATE/i);
    expect(mocks.destination.commit).toHaveBeenCalledOnce();
  });

  it("permanece idempotente na repetição: linha já igual é somente inalterada", async () => {
    const same = [
      { codigo: "1", valor: "2.0000", data_civil: "2026-10-14 10:00:00" },
    ];
    destinationDefaults(same);
    const result = await preview(same, same);
    vi.resetAllMocks();
    mocks.pgInstances.length = 0;
    mocks.getConnection.mockResolvedValue(mocks.destination);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "reader",
      password: "secret",
      ca: "pem",
    });
    destinationDefaults(same);
    pgDefaults(same);
    await expect(
      executarEasyLocalImportacao(
        {
          ...input,
          confirmarImportacao: true,
          tokenPrevia: result.tokenPrevia,
        },
        9
      )
    ).resolves.toEqual({
      sucesso: true,
      registrosLidos: 1,
      registrosInseridos: 0,
      registrosAtualizados: 0,
      registrosInalterados: 1,
    });
    const tableWrites = mocks.destination.execute.mock.calls.filter(call =>
      /^(INSERT INTO `integ_|UPDATE `integ_)/.test(String(call[0]))
    );
    expect(tableWrites).toHaveLength(0);
    expect(mocks.destination.commit).toHaveBeenCalledOnce();
  });

  it("falha fechado no commit incerto e não repete automaticamente", async () => {
    const result = await preview([
      { codigo: "1", valor: null, data_civil: null },
    ]);
    vi.resetAllMocks();
    mocks.pgInstances.length = 0;
    mocks.getConnection.mockResolvedValue(mocks.destination);
    mocks.config.mockResolvedValue({
      host: "db.example",
      port: 5432,
      database: "easy",
      user: "reader",
      password: "secret",
      ca: "pem",
    });
    destinationDefaults();
    mocks.destination.commit.mockRejectedValue(new Error("host privado senha"));
    pgDefaults([{ codigo: "1", valor: null, data_civil: null }]);
    const executePromise = executarEasyLocalImportacao(
      { ...input, confirmarImportacao: true, tokenPrevia: result.tokenPrevia },
      9
    );
    await expect(executePromise).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringMatching(/host privado|senha/),
    });
    expect(mocks.destination.commit).toHaveBeenCalledOnce();
  });

  it("destrói a conexão se o rollback da prévia falha e não a devolve ao pool", async () => {
    mocks.destination.rollback.mockRejectedValueOnce(
      new Error("falha privada de rollback")
    );
    await expect(
      preview([{ codigo: "1", valor: null, data_civil: null }])
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringMatching(/privada|rollback/),
    });
    expect(mocks.destination.destroy).toHaveBeenCalledOnce();
    expect(mocks.destination.release).not.toHaveBeenCalled();
  });
});
