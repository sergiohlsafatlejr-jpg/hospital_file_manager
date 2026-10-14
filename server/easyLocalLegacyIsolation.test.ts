import { beforeEach, describe, expect, it, vi } from "vitest";
const drizzleMock = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: drizzleMock,
}));

type RowsByTable = Record<string, unknown[]>;

function criarDbMock(rowsByTable: RowsByTable = {}) {
  const execute = vi.fn().mockResolvedValue([[]]);
  const insert = vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) });
  const update = vi.fn().mockReturnValue({
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  const remove = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const select = vi.fn().mockReturnValue({
    from: (table: unknown) => {
      const nomeTabela = (table as Record<symbol, string>)[
        Symbol.for("drizzle:Name")
      ];
      const rows = rowsByTable[nomeTabela] ?? [];
      const resultado: Promise<unknown[]> & {
        limit: (limite: number) => Promise<unknown[]>;
      } = Object.assign(Promise.resolve(rows), {
        limit: vi.fn().mockResolvedValue(rows),
      });
      return {
        where: vi.fn().mockReturnValue(resultado),
        orderBy: vi.fn().mockResolvedValue(rows),
      };
    },
  });

  return { select, insert, update, delete: remove, execute };
}

const tabelaEasyLocal = { id: 701, nome: "el_42_pedidos" };
const tabelaLegada = { id: 702, nome: "pedidos_legado" };
const conexaoLegada = { id: 703, nome: "ERP Legado" };
const mapeamentoEasyLocal = {
  id: 704,
  tabelaDestinoId: tabelaEasyLocal.id,
  conexaoOrigemId: conexaoLegada.id,
};

describe("isolamento do namespace EASYLocal na camada legada", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it.each([
    [
      "executarDDLCriarTabela",
      (db: typeof import("./db-integrador")) =>
        db.executarDDLCriarTabela("el_42_pedidos", []),
    ],
    [
      "executarDDLAdicionarColuna",
      (db: typeof import("./db-integrador")) =>
        db.executarDDLAdicionarColuna("integ_el_42_pedidos", {
          nome: "codigo",
          tipo: "int",
          obrigatorio: "nao",
        }),
    ],
    [
      "executarDDLRemoverTabela",
      (db: typeof import("./db-integrador")) =>
        db.executarDDLRemoverTabela("integ_el_42_pedidos"),
    ],
    [
      "limparDadosTabela",
      (db: typeof import("./db-integrador")) =>
        db.limparDadosTabela("integ_el_42_pedidos"),
    ],
    [
      "inserirDadosTabela",
      (db: typeof import("./db-integrador")) =>
        db.inserirDadosTabela("el_42_pedidos", []),
    ],
  ])(
    "recusa %s para os nomes metadata e físicos EASYLocal",
    async (_operacao, executar) => {
      const db = await import("./db-integrador");

      await expect(executar(db)).rejects.toThrow(
        /EASYLocal.*serviço dedicado/i
      );
      expect(drizzleMock).not.toHaveBeenCalled();
    }
  );

  it("oculta tabelas EASYLocal e nega acesso ou mutação por ID", async () => {
    const dbMock = criarDbMock({
      integracao_tabelas: [tabelaEasyLocal, tabelaLegada],
    });
    drizzleMock.mockReturnValue(dbMock);
    process.env.DATABASE_URL = "mysql://mock-only";
    const db = await import("./db-integrador");

    await expect(db.listarTabelas()).resolves.toEqual([tabelaLegada]);
    await expect(db.obterTabela(tabelaEasyLocal.id)).rejects.toThrow(
      /EASYLocal.*não pode ser acessada pela API legada/i
    );
    await expect(
      db.atualizarTabela(tabelaEasyLocal.id, { nomeExibicao: "Não alterar" })
    ).rejects.toThrow(/EASYLocal/);
    await expect(db.excluirTabela(tabelaEasyLocal.id)).rejects.toThrow(
      /EASYLocal/
    );
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("nega mapeamento EASYLocal por ID antes de salvar ou excluir seus campos", async () => {
    const dbMock = criarDbMock({
      integracao_mapeamentos: [mapeamentoEasyLocal],
      integracao_tabelas: [tabelaEasyLocal],
      integracao_conexoes: [conexaoLegada],
    });
    drizzleMock.mockReturnValue(dbMock);
    process.env.DATABASE_URL = "mysql://mock-only";
    const db = await import("./db-integrador");

    await expect(db.obterMapeamento(mapeamentoEasyLocal.id)).rejects.toThrow(
      /EASYLocal.*API legada/i
    );
    await expect(
      db.criarMapeamento({
        nome: "Não criar",
        conexaoOrigemId: conexaoLegada.id,
        tabelaDestinoId: tabelaEasyLocal.id,
        queryOrigem: "SELECT 1",
      } as any)
    ).rejects.toThrow(/EASYLocal/);
    await expect(
      db.atualizarMapeamento(mapeamentoEasyLocal.id, { nome: "Não alterar" })
    ).rejects.toThrow(/EASYLocal/);
    await expect(
      db.salvarCamposMapeamento(mapeamentoEasyLocal.id, [])
    ).rejects.toThrow(/EASYLocal/);
    await expect(db.excluirMapeamento(mapeamentoEasyLocal.id)).rejects.toThrow(
      /EASYLocal/
    );
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("reserva o alias interno de servidor EASYLocal e não o expõe nas listagens", async () => {
    const aliasInterno = { id: 705, nome: "__EASYLOCAL_SERVER__" };
    const dbMock = criarDbMock({
      integracao_conexoes: [aliasInterno, conexaoLegada],
    });
    drizzleMock.mockReturnValue(dbMock);
    process.env.DATABASE_URL = "mysql://mock-only";
    const db = await import("./db-integrador");

    await expect(
      db.criarConexao({ nome: "__EASYLOCAL_SERVER__" } as any)
    ).rejects.toThrow(/reservada ao EASYLocal/i);
    await expect(db.listarConexoes()).resolves.toEqual([conexaoLegada]);
    await expect(db.obterConexao(aliasInterno.id)).rejects.toThrow(
      /reservada ao EASYLocal/i
    );
    await expect(db.excluirConexao(aliasInterno.id)).rejects.toThrow(
      /reservada ao EASYLocal/i
    );
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
  it("bloqueia nomes físicos em maiúsculas e alias com espaços", async () => {
    const db = await import("./db-integrador");
    await expect(
      db.executarDDLRemoverTabela("INTEG_EL_42_PEDIDOS")
    ).rejects.toThrow(/EASYLocal/);
    await expect(
      db.criarConexao({ nome: " __easylocal_server__ " } as any)
    ).rejects.toThrow(/reservada ao EASYLocal/i);
    expect(drizzleMock).not.toHaveBeenCalled();
  });
});
