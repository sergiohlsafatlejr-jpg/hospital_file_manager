import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conn: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    destroy: vi.fn(),
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
  listarEasyLocalStagingsExistentes,
  salvarEasyLocalLeituraStaging,
} from "./easyLocalStagingsService";
import { listarEasyLocalLeituras } from "./easyLocalIntegradorService";
import {
  EASYLOCAL_STAGING_MARKER,
  easyLocalStagingContracts,
  type EasyLocalLeituraStagingInput,
} from "../shared/easyLocalStagings";

type SavedTable = {
  id: number;
  nome: string;
  nomeExibicao: string;
  descricao: string;
  estabelecimentoId: number;
};
type SavedMapping = {
  id: number;
  tabelaDestinoId: number;
  estabelecimentoId: number;
  descricao: string;
  queryOrigem: string;
  campoChave: string;
  frequencia: string;
  ativo: string;
  modoImportacao: string;
};

const hupAtend: EasyLocalLeituraStagingInput = {
  estabelecimentoId: 1260036,
  nomeStaging: "stagion_atendimentos_parados_urologico",
  origem: { schema: "raw_geral", tabela: "hup_atendimentos_parados" },
  colunaEstabelecimento: "estabelecimentos_id",
  valorEstabelecimento: "HUP1260036",
  dominio: "atendimentos",
  frequenciaDesejada: "15min",
  confirmarVinculo: true,
};

function contract(nome: string) {
  const found = easyLocalStagingContracts.find(
    item => item.nomeStaging === nome
  );
  if (!found) throw new Error("Contrato sintético ausente");
  return found;
}

function physical(nome: string) {
  return contract(nome).colunas.map(column => ({
    COLUMN_NAME: column.nome,
    DATA_TYPE: column.dataType,
    COLUMN_TYPE: column.columnType,
    IS_NULLABLE: column.nullable,
    CHARACTER_SET_NAME: column.charset,
    COLLATION_NAME: column.collation,
  }));
}

function fakeCatalog(
  transformColumns?: (
    rows: ReturnType<typeof physical>
  ) => ReturnType<typeof physical>
) {
  const tables: SavedTable[] = [];
  const mappings: SavedMapping[] = [];
  let connectionId: number | null = null;
  let nextTableId = 70;
  let nextMappingId = 90;

  mocks.conn.query.mockResolvedValue([[{ versao: "MariaDB-sintetico" }]]);
  mocks.campos.mockResolvedValue([{ nome: "estabelecimentos_id" }]);
  mocks.conn.execute.mockImplementation(
    async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM estabelecimentos")) return [[{ id: values[0] }]];
      if (sql.includes("information_schema.COLUMNS")) {
        const rows = physical(String(values[0]));
        return [transformColumns ? transformColumns(rows) : rows];
      }
      if (sql.includes("information_schema.STATISTICS")) return [[]];
      if (
        sql.startsWith(
          "SELECT id, nome, estabelecimentoId, descricao FROM integracao_tabelas"
        )
      )
        return [[...tables.filter(table => table.nome === values[0])]];
      if (sql.startsWith("INSERT INTO integracao_tabelas")) {
        const table: SavedTable = {
          id: nextTableId++,
          nome: String(values[0]),
          nomeExibicao: String(values[1]),
          descricao: String(values[2]),
          estabelecimentoId: Number(values[3]),
        };
        tables.push(table);
        return [{ insertId: table.id }];
      }
      if (sql.startsWith("SELECT id, descricao FROM integracao_conexoes"))
        return [
          connectionId
            ? [{ id: connectionId, descricao: "easylocal-direto-v1" }]
            : [],
        ];
      if (sql.startsWith("INSERT INTO integracao_conexoes")) {
        connectionId = 80;
        return [{ insertId: connectionId }];
      }
      if (
        sql.startsWith(
          "SELECT id, tabelaDestinoId, estabelecimentoId, descricao"
        )
      )
        return [[...mappings]];
      if (
        sql.includes("FROM integracao_mapeamentos m JOIN integracao_tabelas t")
      )
        return [
          mappings.map(mapping => {
            const table = tables.find(
              item => item.id === mapping.tabelaDestinoId
            );
            return {
              ...mapping,
              nome: table?.nome,
              nomeExibicao: table?.nomeExibicao,
              tabelaDescricao: table?.descricao,
            };
          }),
        ];
      if (sql.startsWith("INSERT INTO integracao_mapeamentos")) {
        const mapping: SavedMapping = {
          id: nextMappingId++,
          descricao: String(values[1]),
          tabelaDestinoId: Number(values[3]),
          queryOrigem: String(values[4]),
          campoChave: String(values[5]),
          estabelecimentoId: Number(values[6]),
          frequencia: "manual",
          ativo: "nao",
          modoImportacao: "incremental",
        };
        mappings.push(mapping);
        return [{ insertId: mapping.id }];
      }
      throw new Error(`SQL sintético inesperado: ${sql}`);
    }
  );

  return { tables, mappings };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getConnection.mockResolvedValue(mocks.conn);
});

describe("catálogo e vínculo de stagings EASYLocal existentes", () => {
  it("versiona contratos físicos exatos: HUP 13, IAD 14 e financeiro 43", () => {
    expect(
      contract("stagion_atendimentos_parados_urologico").colunas
    ).toHaveLength(13);
    expect(contract("stagion_atendimentos_parados_iad").colunas).toHaveLength(
      14
    );
    expect(contract("stagion_faturado_recebido_iad").colunas).toHaveLength(43);
    expect(
      contract("stagion_atendimentos_parados_iad").colunas.at(-1)?.nome
    ).toBe("Estabelecimentos_id");
    expect(
      contract("stagion_faturado_recebido_urologico").colunas.at(-1)?.nome
    ).toBe("estabelecimentos_id");
  });

  it("recusa unidade, nome final e par origem/domínio fora da allowlist antes de catálogo", async () => {
    await expect(
      salvarEasyLocalLeituraStaging({ ...hupAtend, estabelecimentoId: 7 }, 9)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      salvarEasyLocalLeituraStaging(
        { ...hupAtend, nomeStaging: "stagion_atendimentos_parados_iad" },
        9
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      salvarEasyLocalLeituraStaging(
        {
          ...hupAtend,
          origem: { schema: "raw_geral", tabela: "hup_faturado_recebido" },
        },
        9
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      salvarEasyLocalLeituraStaging(
        { ...hupAtend, colunaEstabelecimento: "Estabelecimentos_id" },
        9
      )
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(mocks.campos).not.toHaveBeenCalled();
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejeita identidade de autor inválida %s antes de consultar origem",
    async id => {
      await expect(
        salvarEasyLocalLeituraStaging(hupAtend, id)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.campos).not.toHaveBeenCalled();
      expect(mocks.getConnection).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      caso: "coluna ausente",
      alterar: (rows: ReturnType<typeof physical>) => rows.slice(1),
    },
    {
      caso: "ordem alterada",
      alterar: (rows: ReturnType<typeof physical>) => [
        rows[1]!,
        rows[0]!,
        ...rows.slice(2),
      ],
    },
    {
      caso: "tipo alterado",
      alterar: (rows: ReturnType<typeof physical>) =>
        rows.map((r, i) =>
          i ? r : { ...r, DATA_TYPE: "bigint", COLUMN_TYPE: "bigint" }
        ),
    },
    {
      caso: "nulabilidade alterada",
      alterar: (rows: ReturnType<typeof physical>) =>
        rows.map((r, i) => (i ? r : { ...r, IS_NULLABLE: "NO" as any })),
    },
    {
      caso: "coluna técnica estranha",
      alterar: (rows: ReturnType<typeof physical>) => [
        ...rows,
        { ...rows[0]!, COLUMN_NAME: "_id" },
      ],
    },
    {
      caso: "tabela ausente",
      alterar: (_rows: ReturnType<typeof physical>) => [],
    },
  ])("não registra contrato físico com $caso", async ({ alterar }) => {
    const state = fakeCatalog(alterar);
    const catalog = await listarEasyLocalStagingsExistentes(1260036);
    expect(catalog.every(item => item.estado !== "disponivel")).toBe(true);
    await expect(
      salvarEasyLocalLeituraStaging(hupAtend, 9)
    ).rejects.toMatchObject({
      code: expect.stringMatching(/CONFLICT|NOT_FOUND/),
    });
    expect(state.tables).toHaveLength(0);
    expect(state.mappings).toHaveLength(0);
    expect(
      mocks.conn.execute.mock.calls.map(call => String(call[0])).join("\n")
    ).not.toMatch(/INSERT|ALTER|CREATE|DROP|TRUNCATE/i);
  });

  it("lista catálogo sem INSERT, apresenta ausência de índice como bloqueio de carga e não consulta registros", async () => {
    fakeCatalog();
    const result = await listarEasyLocalStagingsExistentes(1260036);

    expect(result).toHaveLength(2);
    expect(result.every(item => item.estado === "disponivel")).toBe(true);
    expect(result.every(item => item.tabelaId === null)).toBe(true);
    expect(result.every(item => item.execucaoLiberada === false)).toBe(true);
    expect(result[0]?.bloqueios.join(" ")).toMatch(
      /sem chave primária ou índice único/i
    );
    const sql = mocks.conn.execute.mock.calls
      .map(call => String(call[0]))
      .join("\n");
    expect(sql).toMatch(/information_schema\.COLUMNS/);
    expect(sql).toMatch(/information_schema\.STATISTICS/);
    expect(sql).not.toMatch(
      /\bINSERT\b|\bUPDATE\b|\bDELETE\b|FROM `?stagion_/i
    );
  });

  it("persiste somente descritores staging inativos e é idempotente no rerun", async () => {
    const state = fakeCatalog();
    const first = await salvarEasyLocalLeituraStaging(hupAtend, 9);
    const second = await salvarEasyLocalLeituraStaging(hupAtend, 9);

    expect(first).toMatchObject({
      sucesso: true,
      tabelaId: 70,
      leituraId: 90,
      execucaoAtiva: false,
      idempotente: false,
    });
    expect(second).toMatchObject({
      sucesso: true,
      tabelaId: 70,
      leituraId: 90,
      execucaoAtiva: false,
      idempotente: true,
    });
    expect(state.tables).toHaveLength(1);
    expect(state.mappings).toHaveLength(1);
    expect(JSON.parse(state.tables[0]!.descricao)).toMatchObject({
      marker: EASYLOCAL_STAGING_MARKER,
      versaoContrato: "easylocal-staging-physical-v1",
      execucaoLiberada: false,
    });
    expect(JSON.parse(state.mappings[0]!.descricao)).toMatchObject({
      marker: EASYLOCAL_STAGING_MARKER,
      estado: "preparada_sem_execucao",
      escritorAtual: "nao_confirmado",
      execucaoLiberada: false,
    });
    expect(JSON.parse(state.mappings[0]!.queryOrigem)).toEqual(hupAtend);
    expect(state.mappings[0]).toMatchObject({
      campoChave: "numatend",
      frequencia: "manual",
      ativo: "nao",
      modoImportacao: "incremental",
    });
  });

  it("mantém o vínculo salvo na listagem unificada, marcado como staging não executável", async () => {
    fakeCatalog();
    await salvarEasyLocalLeituraStaging(hupAtend, 9);

    await expect(listarEasyLocalLeituras(1260036)).resolves.toEqual([
      expect.objectContaining({
        tabelaId: 70,
        origem: hupAtend.origem,
        valorEstabelecimento: "HUP1260036",
        campoChave: "numatend",
        estado: "preparada_sem_execucao",
        tipoDestino: "staging_existente",
        execucaoLiberada: false,
      }),
    ]);
  });

  it("rejeita vínculo concorrente e faz rollback sem nova escrita", async () => {
    const state = fakeCatalog();
    await salvarEasyLocalLeituraStaging(hupAtend, 9);
    await expect(
      salvarEasyLocalLeituraStaging(
        { ...hupAtend, valorEstabelecimento: "OUTRO-VALOR" },
        9
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.mappings).toHaveLength(1);
    expect(mocks.conn.rollback).toHaveBeenCalledOnce();
  });

  it("impede valor de origem já ligado a outra unidade mesmo se o descritor dela estiver adulterado", async () => {
    const state = fakeCatalog();
    state.mappings.push({
      id: 333,
      tabelaDestinoId: 999,
      estabelecimentoId: 2550002,
      descricao: JSON.stringify({
        marker: EASYLOCAL_STAGING_MARKER,
        adulterado: true,
      }),
      queryOrigem: JSON.stringify({ ...hupAtend, estabelecimentoId: 2550002 }),
      campoChave: "numatend",
      frequencia: "manual",
      ativo: "nao",
      modoImportacao: "incremental",
    });

    await expect(
      salvarEasyLocalLeituraStaging(hupAtend, 9)
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/outra unidade/i),
    });
    expect(state.mappings).toHaveLength(1);
    expect(mocks.conn.rollback).toHaveBeenCalledOnce();
  });

  it("descarta a conexão em vez de devolvê-la ao pool se rollback falhar", async () => {
    const state = fakeCatalog();
    await salvarEasyLocalLeituraStaging(hupAtend, 9);
    mocks.conn.rollback.mockRejectedValueOnce(new Error("erro privado"));

    await expect(
      salvarEasyLocalLeituraStaging(
        { ...hupAtend, valorEstabelecimento: "CONFLITO" },
        9
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.mappings).toHaveLength(1);
    expect(mocks.conn.destroy).toHaveBeenCalledOnce();
    expect(mocks.conn.release).toHaveBeenCalledTimes(1);
  });
});
