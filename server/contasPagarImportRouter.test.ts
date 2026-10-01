import { beforeEach, describe, expect, it, vi } from "vitest";
import { finEmpresas, finCategorias, finCentrosCusto, finTransacoes } from "../drizzle/schema";

vi.mock("./db", async importOriginal => ({
  ...await importOriginal<typeof import("./db")>(),
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

import { getDb, verificarPermissaoEstabelecimento } from "./db";
import { financeiroRouter } from "./routers/financeiroRouter";

const item = { linha: 2, descricao: "Conta de teste", valor: "100.00", dataVencimento: "2026-09-30", pago: "nao" as const, categoriaNome: "Operacional", centroCustoNome: "Administração" };
const input = { estabelecimentoId: 7, empresaId: 42, items: [item] };

function setup(empresaEstab: number | null = 7, existentes: any[] = [], insertError = false) {
  const inserts: any[] = [];
  const select = () => ({
    from(table: unknown) {
      const data = table === finEmpresas ? (empresaEstab === null ? [] : [{ id: 42, estabelecimentoId: empresaEstab }])
        : table === finCategorias ? [{ id: 3, nome: "Operacional" }]
          : table === finCentrosCusto ? [{ id: 5, nome: "Administração" }]
            : table === finTransacoes ? existentes : [];
      const promise = Promise.resolve(data);
      return Object.assign(promise, {
        where: () => Object.assign(Promise.resolve(data), {
          for: () => Object.assign(Promise.resolve(data), { limit: () => Promise.resolve(data) }),
        }),
      });
    },
  });
  const tx = {
    select,
    insert: () => ({ values: async (rows: unknown) => {
      if (insertError) throw new Error("Falha de banco simulada");
      inserts.push(rows);
    } }),
  };
  const transaction = vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));
  vi.mocked(getDb).mockResolvedValue({ transaction } as any);
  return { inserts, transaction };
}

const caller = (role = "admin") => financeiroRouter.createCaller({ user: { id: 11, role }, req: {}, res: {} } as any);

describe("importador.importarContasPagar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
  });

  it("grava um único lote, com categoria/centro existentes, empresa e status corretos", async () => {
    const { inserts, transaction } = setup();
    expect(await caller().importador.importarContasPagar(input)).toEqual({ imported: 1, errors: 0, total: 1 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toMatchObject({ empresaId: 42, categoriaId: 3, centroCustoId: 5, pago: "nao", valor: "100.00", userId: 11 });
  });

  it("rejeita empresa de outra unidade sem inserir nenhuma linha", async () => {
    const { inserts } = setup(8);
    await expect(caller().importador.importarContasPagar(input)).rejects.toThrow("Empresa não vinculada");
    expect(inserts).toHaveLength(0);
  });

  it("rejeita falta de permissão de edição antes de abrir transação", async () => {
    const { inserts, transaction } = setup();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller("user").importador.importarContasPagar(input)).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("bloqueia reenvio de tentativa antiga sem empresa mesmo que o vencimento antigo esteja invertido", async () => {
    const { inserts } = setup(7, [{ empresaId: null, descricao: item.descricao, valor: item.valor, dataVencimento: new Date("2026-03-09T12:00:00Z") }]);
    await expect(caller().importador.importarContasPagar(input)).rejects.toThrow("já há lançamento coincidente");
    expect(inserts).toHaveLength(0);
  });

  it("rejeita linha inválida antes de abrir transação", async () => {
    const { transaction } = setup();
    await expect(caller().importador.importarContasPagar({ ...input, items: [{ ...item, dataVencimento: "30/09/2026" }] })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejeita duas linhas iguais do próprio arquivo sem iniciar transação", async () => {
    const { inserts, transaction } = setup();
    await expect(caller().importador.importarContasPagar({ ...input, items: [item, { ...item, linha: 3 }] })).rejects.toThrow("lançamento repetido");
    expect(transaction).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("propaga falha de INSERT em vez de reportar sucesso parcial", async () => {
    const { inserts } = setup(7, [], true);
    await expect(caller().importador.importarContasPagar(input)).rejects.toThrow("Falha de banco simulada");
    expect(inserts).toHaveLength(0);
  });
});
