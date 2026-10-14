import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  conn: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn(),
    query: vi.fn(),
    release: vi.fn(),
  },
  getConnection: vi.fn(),
  campos: vi.fn(),
}));
vi.mock("./db", () => ({
  getRawPool: async () => ({ getConnection: mocks.getConnection }),
}));
vi.mock("./easyLocalMetadata", () => ({
  detectarEasyLocalCampos: mocks.campos,
}));
import {
  criarEasyLocalTabela,
  ddlEasyLocalTabela,
  salvarEasyLocalLeitura,
  listarEasyLocalTabelas,
} from "./easyLocalIntegradorService";
import { easyLocalCriarTabela } from "../shared/easyLocalIntegrador";
const input = {
  estabelecimentoId: 12,
  nome: "teste",
  nomeExibicao: "Tabela de teste",
  confirmarCriacao: true as const,
  colunas: [
    { nome: "codigo", tipo: "varchar" as const, obrigatorio: true },
    {
      nome: "valor",
      tipo: "decimal" as const,
      tamanho: 15,
      escala: 4,
      obrigatorio: false,
    },
  ],
};
function physical() {
  return [
    {
      COLUMN_NAME: "_id",
      DATA_TYPE: "bigint",
      IS_NULLABLE: "NO",
      COLUMN_KEY: "PRI",
      EXTRA: "auto_increment",
    },
    {
      COLUMN_NAME: "estabelecimento_id",
      DATA_TYPE: "int",
      IS_NULLABLE: "NO",
      COLUMN_DEFAULT: "12",
    },
    {
      COLUMN_NAME: "codigo",
      DATA_TYPE: "varchar",
      IS_NULLABLE: "NO",
      CHARACTER_MAXIMUM_LENGTH: "255",
    },
    {
      COLUMN_NAME: "valor",
      DATA_TYPE: "decimal",
      IS_NULLABLE: "YES",
      NUMERIC_PRECISION: "15",
      NUMERIC_SCALE: "4",
    },
    {
      COLUMN_NAME: "_sincronizado_em",
      DATA_TYPE: "datetime",
      IS_NULLABLE: "YES",
    },
  ];
}
function defaults() {
  mocks.conn.query.mockResolvedValue([[{ versao: "MariaDB-local-sintetico" }]]);
  mocks.conn.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM estabelecimentos")) return [[{ id: 12 }]];
    if (sql.includes("information_schema.COLUMNS")) return [physical()];
    if (sql.startsWith("INSERT INTO integracao_tabelas"))
      return [{ insertId: 77 }];
    return [[]];
  });
}
describe("criação direta EASYLocal isolada", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getConnection.mockResolvedValue(mocks.conn);
    defaults();
  });
  it("gera somente CREATE novo com unidade fixa e preserva escala zero", () => {
    const ddl = ddlEasyLocalTabela({
      ...input,
      colunas: [
        {
          nome: "valor",
          tipo: "decimal",
          tamanho: 15,
          escala: 0,
          obrigatorio: false,
        },
      ],
    });
    expect(ddl).toContain("CREATE TABLE `integ_el_12_teste`");
    expect(ddl).toContain("DECIMAL(15,0)");
    expect(ddl).toContain("DEFAULT 12");
    expect(ddl).not.toMatch(/IF NOT EXISTS|DROP|TRUNCATE|ALTER|DELETE|UPDATE/i);
  });
  it.each([
    { ...input, nome: "stagion;DROP" },
    { ...input, colunas: [...input.colunas, input.colunas[0]] },
    { ...input, colunas: [{ nome: "estabelecimento_id", tipo: "int" }] },
    {
      ...input,
      colunas: [{ nome: "valor", tipo: "decimal", tamanho: 4, escala: 5 }],
    },
    { ...input, confirmarCriacao: false },
  ])("recusa payload inválido antes de obter conexão", async value => {
    expect(easyLocalCriarTabela.safeParse(value).success).toBe(false);
    await expect(criarEasyLocalTabela(value as any, 9)).rejects.toBeDefined();
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it("reserva pelo lock da unidade, cria vazia, valida tipos e só então marca criada", async () => {
    expect(await criarEasyLocalTabela(input, 9)).toMatchObject({
      tabelaId: 77,
      nomeFisico: "integ_el_12_teste",
    });
    expect(mocks.conn.execute.mock.calls[0]).toEqual([
      "SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE",
      [12],
    ]);
    expect(mocks.conn.commit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.conn.query.mock.invocationCallOrder[1]
    );
    expect(mocks.conn.execute.mock.calls.at(-1)?.[0]).toContain(
      "SET criadaNoBanco = 'sim'"
    );
    expect(
      mocks.conn.query.mock.calls.filter(c =>
        String(c[0]).startsWith("CREATE TABLE")
      )
    ).toHaveLength(1);
    expect(mocks.conn.release).toHaveBeenCalledOnce();
  });
  it.each(["integracao_tabelas", "information_schema.TABLES"])(
    "rejeita nome já utilizado em %s sem DDL",
    async origem => {
      mocks.conn.execute.mockImplementation(async (sql: string) =>
        sql.includes("FROM estabelecimentos")
          ? [[{ id: 12 }]]
          : sql.includes(origem)
            ? [[{ id: 7 }]]
            : [[]]
      );
      await expect(criarEasyLocalTabela(input, 9)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(
        mocks.conn.query.mock.calls.some(c =>
          String(c[0]).startsWith("CREATE TABLE")
        )
      ).toBe(false);
      expect(mocks.conn.rollback).toHaveBeenCalled();
    }
  );
  it("preserva reserva após DDL falhar, nunca faz DROP ou retry", async () => {
    mocks.conn.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("CREATE TABLE"))
        throw new Error("host-segredo erro driver");
      return [[{ versao: "MariaDB-local" }]];
    });
    await expect(criarEasyLocalTabela(input, 9)).rejects.toMatchObject({
      message: expect.not.stringContaining("host-segredo"),
    });
    expect(
      mocks.conn.query.mock.calls.filter(c =>
        String(c[0]).startsWith("CREATE TABLE")
      )
    ).toHaveLength(1);
    expect(
      mocks.conn.execute.mock.calls.some(c =>
        String(c[0]).includes("SET criadaNoBanco")
      )
    ).toBe(false);
    expect(mocks.conn.rollback).not.toHaveBeenCalled();
  });
  it("não marca sucesso se estrutura criada divergir", async () => {
    mocks.conn.execute.mockImplementation(async (sql: string) =>
      sql.includes("FROM estabelecimentos")
        ? [[{ id: 12 }]]
        : sql.includes("information_schema.COLUMNS")
          ? [[...physical().slice(0, 3)]]
          : sql.startsWith("INSERT INTO integracao_tabelas")
            ? [{ insertId: 77 }]
            : [[]]
    );
    await expect(criarEasyLocalTabela(input, 9)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(
      mocks.conn.execute.mock.calls.some(c =>
        String(c[0]).includes("SET criadaNoBanco")
      )
    ).toBe(false);
  });
  it("lista somente descritores válidos da unidade", async () => {
    mocks.conn.execute.mockImplementation(async (sql: string) =>
      sql.includes("FROM estabelecimentos")
        ? [[{ id: 12 }]]
        : [
            [
              {
                id: 77,
                nome: "el_12_teste",
                nomeExibicao: "Teste",
                criadaNoBanco: "sim",
                descricao: JSON.stringify({
                  marker: "easylocal-direto-v1",
                  colunas: input.colunas,
                }),
              },
              {
                id: 78,
                nome: "el_13_outro",
                descricao: JSON.stringify({
                  marker: "easylocal-direto-v1",
                  colunas: input.colunas,
                }),
              },
              { id: 79, nome: "el_12_legado", descricao: "texto" },
            ],
          ]
    );
    expect((await listarEasyLocalTabelas(12)).map(t => t.id)).toEqual([77]);
  });
  it("salva somente preparação, sem segredo real, SQL de origem ou agendamento", async () => {
    mocks.campos.mockResolvedValue(
      ["codigo", "valor", "unidade"].map(nome => ({ nome }))
    );
    mocks.conn.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM estabelecimentos")) return [[{ id: 12 }]];
      if (sql.includes("FROM integracao_tabelas"))
        return [
          [
            {
              nome: "el_12_teste",
              criadaNoBanco: "sim",
              descricao: JSON.stringify({
                marker: "easylocal-direto-v1",
                colunas: input.colunas,
              }),
            },
          ],
        ];
      if (sql.startsWith("INSERT INTO integracao_conexoes"))
        return [{ insertId: 4 }];
      if (sql.startsWith("INSERT INTO integracao_mapeamentos"))
        return [{ insertId: 5 }];
      return [[]];
    });
    const out = await salvarEasyLocalLeitura(
      {
        estabelecimentoId: 12,
        tabelaId: 77,
        origem: { schema: "public", tabela: "origem" },
        colunaEstabelecimento: "unidade",
        valorEstabelecimento: "hospital_teste",
        campoChave: "codigo",
        dominio: "atendimentos",
        frequenciaDesejada: "15min",
      },
      9
    );
    expect(out).toEqual({ sucesso: true, leituraId: 5, execucaoAtiva: false });
    const stmt = mocks.conn.execute.mock.calls.find(c =>
      c[0].startsWith("INSERT INTO integracao_mapeamentos")
    )!;
    expect(stmt[0]).toContain("'manual', 'nao'");
    expect(String(stmt[1])).not.toContain("SELECT *");
    expect(
      mocks.conn.query.mock.calls.some(c =>
        String(c[0]).startsWith("CREATE TABLE")
      )
    ).toBe(false);
  });
  it("TiDB reserva em modo pessimista, sem mudar configuração global", async () => {
    mocks.conn.query.mockResolvedValue([[{ versao: "8.0-TiDB-test" }]]);
    await criarEasyLocalTabela(input, 9);
    expect(mocks.conn.query).toHaveBeenCalledWith("BEGIN PESSIMISTIC");
    expect(mocks.conn.beginTransaction).not.toHaveBeenCalled();
    expect(
      mocks.conn.query.mock.calls.some(c =>
        String(c[0]).startsWith("SET GLOBAL")
      )
    ).toBe(false);
  });
  it("commit da reserva incerto não dispara CREATE nem retry e solicita conferência", async () => {
    mocks.conn.commit.mockRejectedValue(
      new Error("aceito-remotamente-socket-perdido")
    );
    await expect(criarEasyLocalTabela(input, 9)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("catálogo"),
    });
    expect(
      mocks.conn.query.mock.calls.some(c =>
        String(c[0]).startsWith("CREATE TABLE")
      )
    ).toBe(false);
    expect(mocks.conn.commit).toHaveBeenCalledOnce();
    expect(mocks.conn.rollback).toHaveBeenCalled();
  });
  it("commit da leitura incerto nunca informa execução ativa ou repete o INSERT", async () => {
    mocks.campos.mockResolvedValue(
      ["codigo", "valor", "unidade"].map(nome => ({ nome }))
    );
    mocks.conn.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM estabelecimentos")) return [[{ id: 12 }]];
      if (sql.includes("FROM integracao_tabelas"))
        return [
          [
            {
              nome: "el_12_teste",
              criadaNoBanco: "sim",
              descricao: JSON.stringify({
                marker: "easylocal-direto-v1",
                colunas: input.colunas,
              }),
            },
          ],
        ];
      if (sql.startsWith("INSERT INTO")) return [{ insertId: 5 }];
      return [[]];
    });
    mocks.conn.commit.mockRejectedValue(new Error("commit aceito rede caiu"));
    await expect(
      salvarEasyLocalLeitura(
        {
          estabelecimentoId: 12,
          tabelaId: 77,
          origem: { schema: "public", tabela: "origem" },
          colunaEstabelecimento: "unidade",
          valorEstabelecimento: "hospital_teste",
          campoChave: "codigo",
          dominio: "atendimentos",
          frequenciaDesejada: "15min",
        },
        9
      )
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("listagem"),
    });
    expect(
      mocks.conn.execute.mock.calls.filter(c =>
        String(c[0]).startsWith("INSERT INTO integracao_mapeamentos")
      )
    ).toHaveLength(1);
    expect(mocks.conn.commit).toHaveBeenCalledOnce();
    expect(mocks.conn.rollback).toHaveBeenCalled();
  });
});
