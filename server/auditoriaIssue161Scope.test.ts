import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  getConvenioById: vi.fn(),
}));
// Do not import the real DB module or appRouter: these tests cannot connect to any database.
vi.mock("./db", () => ({
  ...mocks,
  verificarAcessoModulo: vi.fn(),
  getRecursoById: vi.fn(),
  getLoteRecursoById: vi.fn(),
}));
import { auditoriaRouter } from "./routers/auditoriaRouter";
import {
  ajustesAuditoria, aprendizadoAuditoria, contasConvenioItens, contasConvenioResumo,
} from "../drizzle/schema";

const dialect = new MySqlDialect();
const HOSPITAL = 101;
const OUTRO_HOSPITAL = 202;
const CONVENIO = 31;
const CONTA = "SYNTHETIC-A";
const itemTable = getTableName(contasConvenioItens);
const resumoTable = getTableName(contasConvenioResumo);
const ajusteTable = getTableName(ajustesAuditoria);
const aprendizadoTable = getTableName(aprendizadoAuditoria);
type Row = Record<string, any>;

function contexto(role: "user" | "admin" = "user") {
  return {
    user: {
      id: 44, role, name: "Auditor sintético", openId: "synthetic-audit161",
      email: "audit161@example.test", loginMethod: "password",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} }, res: {},
  } as any;
}
function caller(role: "user" | "admin" = "user") {
  return auditoriaRouter.createCaller(contexto(role));
}
function item(overrides: Row = {}): Row {
  return {
    id: 11, numeroConta: CONTA, estabelecimentoId: HOSPITAL, origem: "BANCO_CLIENTE",
    convenioId: CONVENIO, convenio: "SYNTHETIC-CONVENIO", arquivoId: null,
    loteImportacaoId: null, numeroLote: null, competencia: "2026/10",
    statusAnalise: "pendente", divergencias: [], quantidade: "2", valorUnitario: "5.00",
    valorTotal: "10.00", setor: "ENFERMARIA", dataExecucao: new Date("2026-10-20T12:00:00"),
    ...overrides,
  };
}
function resumo(overrides: Row = {}): Row {
  return {
    id: 21, numeroConta: CONTA, estabelecimentoId: HOSPITAL, origem: "BANCO_CLIENTE",
    convenioId: CONVENIO, convenio: "SYNTHETIC-CONVENIO", arquivoHospitalId: null,
    loteImportacaoId: null, numeroLote: null, competencia: "2026/10", totalItens: 1,
    valorTotal: "10.00", ...overrides,
  };
}
function matches(row: Row, condition: any): boolean {
  const compiled = dialect.sqlToQuery(condition);
  // Evaluate only the deterministic predicates used by these procedures.
  const regex = /`[^`]+`\.`([^`]+)`\s*(=\s*\?|<=>\s*\?|in\s*\((?:\?\s*,?\s*)+\))/gi;
  let parameter = 0;
  for (const match of compiled.sql.matchAll(regex)) {
    const count = (match[2].match(/\?/g) ?? []).length;
    const values = compiled.params.slice(parameter, parameter + count);
    parameter += count;
    const actual = row[match[1]] ?? null;
    if (match[2].toLowerCase().startsWith("in")) {
      if (!values.includes(actual)) return false;
    } else if (actual !== (values[0] ?? null)) return false;
  }
  return true;
}

function syntheticDb(options: {
  items?: Row[]; resumos?: Row[]; ajustes?: Row[];
  failUpdate?: number; failItemInsert?: boolean; missingInsertId?: "ajuste" | "item";
  flatInsertResult?: boolean;
  onAjusteInsert?: (row: Row) => Promise<void>;
} = {}) {
  const state: Record<string, Row[]> = {
    [itemTable]: options.items ?? [item()],
    [resumoTable]: options.resumos ?? [resumo()],
    [ajusteTable]: options.ajustes ?? [],
    [aprendizadoTable]: [],
  };
  const selects: { table: string; condition: any; lock?: string }[] = [];
  const inserts: { table: string; row: Row }[] = [];
  const updates: { table: string; data: Row; condition: any }[] = [];
  let nextAjuste = 401;
  let nextItem = 801;
  let rolledBack = 0;
  let committed = 0;
  function connection(local: Record<string, Row[]>, pending: (() => void)[]) {
    return {
      select: vi.fn(() => {
        let table = "";
        let condition: any;
        let limit = Infinity;
        const query: any = {
          from: vi.fn((target) => { table = getTableName(target); return query; }),
          where: vi.fn((value) => {
            condition = value;
            selects.push({ table, condition });
            return query;
          }),
          limit: vi.fn((value) => { limit = value; return query; }),
          orderBy: vi.fn(() => query),
          for: vi.fn((lock) => {
            selects[selects.length - 1].lock = lock;
            return query;
          }),
          then: (resolve: any, reject: any) => Promise.resolve(
            (local[table] ?? []).filter(row => !condition || matches(row, condition)).slice(0, limit),
          ).then(resolve, reject),
        };
        return query;
      }),
      insert: vi.fn((target) => ({
        values: vi.fn(async (values: Row) => {
          const table = getTableName(target);
          if (table === itemTable && options.failItemInsert) throw new Error("synthetic item insert failure");
          const id = table === ajusteTable ? nextAjuste++ : table === itemTable ? nextItem++ : 901;
          const row = { ...values, id };
          inserts.push({ table, row });
          local[table].push(row);
          pending.push(() => state[table].push({ ...row }));
          if (table === ajusteTable) await options.onAjusteInsert?.(row);
          const missing = options.missingInsertId === (table === ajusteTable ? "ajuste" : "item");
          const result = missing ? {} : { insertId: id };
          return options.flatInsertResult ? result : [result];
        }),
      })),
      update: vi.fn((target) => ({
        set: vi.fn((data: Row) => ({
          where: vi.fn(async (condition: any) => {
            const table = getTableName(target);
            updates.push({ table, data, condition });
            if (updates.length === options.failUpdate) throw new Error("synthetic update failure");
            const apply = (rows: Row[]) => {
              for (const row of rows.filter(r => matches(r, condition))) {
                for (const [key, value] of Object.entries(data)) {
                  if (value && typeof value === "object" && "queryChunks" in value) {
                    const compiled = dialect.sqlToQuery(value as any);
                    row[key] = key === "totalItens" ? row[key] + 1
                      : (Number(row[key] ?? 0) + Number(compiled.params[0])).toFixed(2);
                  } else row[key] = value;
                }
              }
            };
            apply(local[table]);
            pending.push(() => apply(state[table]));
            return [{ affectedRows: local[table].filter(row => matches(row, condition)).length }];
          }),
        })),
      })),
    };
  }
  const root = {
    select: vi.fn(() => { throw new Error("Selection must use transaction"); }),
    insert: vi.fn(() => { throw new Error("Insertion must use transaction"); }),
    update: vi.fn(() => { throw new Error("Update must use transaction"); }),
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
      const local = structuredClone(state);
      const pending: (() => void)[] = [];
      try {
        const result = await callback(connection(local, pending));
        pending.forEach(apply => apply());
        committed++;
        return result;
      } catch (error) {
        rolledBack++;
        throw error;
      }
    }),
  };
  mocks.getDb.mockResolvedValue(root);
  return { root, state, selects, inserts, updates, get rolledBack() { return rolledBack; }, get committed() { return committed; } };
}
const marcar = (auditado = true, itemIds = [11]) => ({ numeroConta: CONTA, estabelecimentoId: HOSPITAL, itemIds, auditado });
const adicionar = (overrides: Row = {}) => ({
  numeroConta: CONTA, estabelecimentoId: HOSPITAL, tipoAjuste: "ADICIONAR_ITEM" as const,
  codigoItem: "SYNTHETIC-001", descricaoItem: "Item sintético", quantidadeAjustada: "2",
  valorAjustado: "5.25", setorNovoItem: "UTI", dataNovoItem: "2026-10-21", ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.getConvenioById.mockImplementation(async (id) => ({ id, estabelecimentoId: HOSPITAL }));
});

describe("Issue161: marcador de auditoria e escrita real por escopo", () => {
  it.each([true, false])("visualizador não escreve (auditado=%s)", async auditado => {
    const db = syntheticDb();
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_id, _hospital, acao) => acao === "visualizar");
    await expect(caller().marcarItensAuditados(marcar(auditado))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(44, HOSPITAL, "editar");
    expect(db.root.transaction).not.toHaveBeenCalled();
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
  it("role admin da requisição não substitui a permissão persistida", async () => {
    const db = syntheticDb();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(caller("admin").marcarItensAuditados(marcar())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(44, HOSPITAL, "editar");
    expect(db.updates).toEqual([]);
  });
  it.each([
    { numeroConta: "SYNTHETIC-OUTRA" }, { estabelecimentoId: OUTRO_HOSPITAL },
    { convenioId: 32 }, { convenio: "OUTRO-CONVENIO" }, { origem: "XML", arquivoId: 99 },
    { arquivoId: 99 }, { loteImportacaoId: 7 }, { numeroLote: "OUTRO" }, { competencia: "2026/09" },
  ])("nega lote misto %j antes da primeira escrita", async override => {
    const db = syntheticDb({ items: [item(), item({ id: 12, ...override })] });
    await expect(caller().marcarItensAuditados(marcar(true, [11, 12]))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(db.state[itemTable][0].statusAnalise).toBe("pendente");
  });
  it("ID inexistente não permite atualização parcial", async () => {
    const db = syntheticDb();
    await expect(caller().marcarItensAuditados(marcar(false, [11, 999]))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updates).toEqual([]);
  });
  it("convênio de outro hospital é negado antes de escrever", async () => {
    const db = syntheticDb();
    mocks.getConvenioById.mockResolvedValue({ id: CONVENIO, estabelecimentoId: OUTRO_HOSPITAL });
    await expect(caller().marcarItensAuditados(marcar())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updates).toEqual([]);
  });
  it("deduplica IDs e restringe escrita por hospital, conta e snapshot", async () => {
    const db = syntheticDb({ items: [item({ origem: "XML", arquivoId: 61, numeroLote: "L1", loteImportacaoId: 8 })] });
    await expect(caller().marcarItensAuditados(marcar(true, [11, 11]))).resolves.toEqual({ sucesso: true, totalAtualizados: 1 });
    expect(db.state[itemTable][0].statusAnalise).toBe("revisado");
    const compiled = dialect.sqlToQuery(db.updates[0].condition);
    expect(compiled.params).toEqual([HOSPITAL, CONTA, "XML", CONVENIO, "SYNTHETIC-CONVENIO", 61, 8, "L1", "2026/10", 11]);
    expect(db.selects[0].lock).toBe("update");
    expect(mocks.getConvenioById).toHaveBeenCalledWith(CONVENIO, expect.objectContaining({ select: expect.any(Function) }));
    expect(db.committed).toBe(1);
  });
  it("preserva reversão para divergente/pendente conforme severidade", async () => {
    const db = syntheticDb({ items: [
      item({ statusAnalise: "revisado", divergencias: [{ severidade: "aviso" }] }),
      item({ id: 12, statusAnalise: "revisado", divergencias: [{ severidade: "info" }] }),
    ] });
    await expect(caller().marcarItensAuditados(marcar(false, [11, 12]))).resolves.toEqual({ sucesso: true, totalAtualizados: 2 });
    expect(db.state[itemTable].map(row => row.statusAnalise)).toEqual(["divergente", "pendente"]);
    for (const update of db.updates) {
      const compiled = dialect.sqlToQuery(update.condition);
      expect(compiled.sql).toContain("estabelecimentoId");
      expect(compiled.sql).toContain("numeroConta");
      expect(compiled.sql).toContain("arquivoId");
    }
  });
  it("erro na segunda desmarcação faz rollback da primeira", async () => {
    const db = syntheticDb({ items: [item({ statusAnalise: "revisado" }), item({ id: 12, statusAnalise: "revisado" })], failUpdate: 2 });
    await expect(caller().marcarItensAuditados(marcar(false, [11, 12]))).rejects.toThrow("synthetic update failure");
    expect(db.state[itemTable].map(row => row.statusAnalise)).toEqual(["revisado", "revisado"]);
    expect(db.rolledBack).toBe(1);
    expect(db.committed).toBe(0);
  });
});

describe("Issue161: ajuste vinculado ao próprio INSERT e atomicidade", () => {
  it("somente leitura não adiciona item nem ajuste", async () => {
    const db = syntheticDb();
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_id, _hospital, acao) => acao === "visualizar");
    await expect(caller().registrarAjuste(adicionar())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
  it("item de outra conta não cria sequer ajuste", async () => {
    const db = syntheticDb({ items: [item({ numeroConta: "OUTRA" })] });
    await expect(caller().registrarAjuste({ ...adicionar(), tipoAjuste: "ALTERAR_SETOR", itemId: 11, setorAjustado: "UTI" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
  it("conta/snapshot ambíguo exige resolução antes de qualquer INSERT", async () => {
    const db = syntheticDb({ resumos: [resumo(), resumo({ id: 22, arquivoHospitalId: 55 })] });
    await expect(caller().registrarAjuste(adicionar())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
  it("conta ausente e convênio alheio são negados antes de escrever", async () => {
    const absent = syntheticDb({ resumos: [] });
    await expect(caller().registrarAjuste(adicionar())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(absent.inserts).toEqual([]);
    const alien = syntheticDb();
    mocks.getConvenioById.mockResolvedValue({ id: CONVENIO, estabelecimentoId: OUTRO_HOSPITAL });
    await expect(caller().registrarAjuste(adicionar())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(alien.inserts).toEqual([]);
  });
  it.each([false, true])("preserva setor/data e liga os IDs próprios (retorno plano=%s)", async flatInsertResult => {
    const db = syntheticDb({ flatInsertResult });
    await expect(caller().registrarAjuste(adicionar())).resolves.toEqual({ sucesso: true });
    const added = db.state[itemTable].find(row => row.id === 801)!;
    expect(added).toMatchObject({ setor: "UTI", quantidade: "2", valorUnitario: "5.25", valorTotal: "10.50", competencia: "2026/10" });
    expect(added.dataExecucao.getDate()).toBe(21);
    expect(added.dataExecucao.getHours()).toBe(12);
    expect(db.state[ajusteTable][0]).toMatchObject({ id: 401, itemId: 801, status: "aplicado" });
    expect(db.state[resumoTable][0]).toMatchObject({ totalItens: 2, valorTotal: "20.50" });
    const adjustment = db.updates.find(update => update.table === ajusteTable)!;
    expect(dialect.sqlToQuery(adjustment.condition).params).toEqual([401, HOSPITAL, CONTA]);
    expect(db.selects.some(select => select.table === ajusteTable)).toBe(false);
  });
  it("novo item herda o snapshot XML da conta sem trocar convênio, arquivo ou lote", async () => {
    const db = syntheticDb({ resumos: [resumo({ origem: "XML", arquivoHospitalId: 61, numeroLote: "L1", loteImportacaoId: 8 })] });
    await caller().registrarAjuste(adicionar());
    expect(db.state[itemTable].find(row => row.id === 801)).toMatchObject({
      origem: "XML", convenioId: CONVENIO, arquivoId: 61, numeroLote: "L1", loteImportacaoId: 8,
    });
  });
  it("concorrência B finaliza entre INSERT e UPDATE de A sem roubar seu ajuste", async () => {
    let startB!: () => void;
    let finishB!: () => void;
    const insertedA = new Promise<void>(resolve => { startB = resolve; });
    const completedB = new Promise<void>(resolve => { finishB = resolve; });
    const db = syntheticDb({
      resumos: [resumo(), resumo({ id: 22, numeroConta: "SYNTHETIC-B" })],
      onAjusteInsert: async row => {
        if (row.numeroConta === CONTA) { startB(); await completedB; }
      },
    });
    const a = caller().registrarAjuste(adicionar());
    await insertedA;
    await caller().registrarAjuste(adicionar({ numeroConta: "SYNTHETIC-B" }));
    finishB();
    await a;
    const ajustes = db.state[ajusteTable];
    for (const conta of [CONTA, "SYNTHETIC-B"]) {
      const ajuste = ajustes.find(row => row.numeroConta === conta)!;
      const ownItem = db.state[itemTable].find(row => row.id === ajuste.itemId)!;
      expect(ajuste.status).toBe("aplicado");
      expect(ownItem.numeroConta).toBe(conta);
      expect(dialect.sqlToQuery(db.updates.find(update => update.table === ajusteTable && update.data.itemId === ownItem.id)!.condition).params).toEqual([ajuste.id, HOSPITAL, conta]);
    }
    expect(ajustes.find(row => row.numeroConta === CONTA)!.id).toBe(401);
    expect(ajustes.find(row => row.numeroConta === "SYNTHETIC-B")!.id).toBe(402);
    expect(db.selects.some(select => select.table === ajusteTable)).toBe(false);
  });
  it.each(["ajuste", "item"] as const)("ID ausente de %s provoca rollback, sem buscar último registro", async missingInsertId => {
    const db = syntheticDb({ missingInsertId });
    await expect(caller().registrarAjuste(adicionar())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.state[itemTable]).toHaveLength(1);
    expect(db.state[ajusteTable]).toEqual([]);
    expect(db.state[resumoTable][0].totalItens).toBe(1);
    expect(db.rolledBack).toBe(1);
  });
  it.each([1, 2])("erro no UPDATE %s reverte item, ajuste e resumo", async failUpdate => {
    const db = syntheticDb({ failUpdate });
    await expect(caller().registrarAjuste(adicionar())).rejects.toThrow("synthetic update failure");
    expect(db.state[itemTable]).toHaveLength(1);
    expect(db.state[ajusteTable]).toEqual([]);
    expect(db.state[resumoTable][0]).toMatchObject({ totalItens: 1, valorTotal: "10.00" });
    expect(db.state[aprendizadoTable]).toEqual([]);
    expect(db.rolledBack).toBe(1);
  });
  it("erro no INSERT do item reverte também o INSERT do ajuste", async () => {
    const db = syntheticDb({ failItemInsert: true });
    await expect(caller().registrarAjuste(adicionar())).rejects.toThrow("synthetic item insert failure");
    expect(db.state[ajusteTable]).toEqual([]);
    expect(db.rolledBack).toBe(1);
  });
  it.each([
    { tipoAjuste: "ALTERAR_QUANTIDADE", quantidadeAjustada: "3", expected: { quantidade: "3", valorTotal: "15.00" } },
    { tipoAjuste: "ALTERAR_VALOR", valorAjustado: "8", expected: { valorUnitario: "8", valorTotal: "16.00" } },
    { tipoAjuste: "ALTERAR_SETOR", setorAjustado: "UTI", expected: { setor: "UTI" } },
  ])("preserva ajuste $tipoAjuste e não consulta último global", async ({ expected, ...change }) => {
    const db = syntheticDb();
    await caller().registrarAjuste({ ...adicionar(), ...change, itemId: 11 } as any);
    expect(db.state[itemTable][0]).toMatchObject({ ...expected, statusAnalise: "revisado" });
    expect(db.state[ajusteTable][0]).toMatchObject({ id: 401, itemId: 11, status: "aplicado" });
    expect(db.selects.some(select => select.table === ajusteTable)).toBe(false);
  });
});


describe("Issue161: adição manual preserva o snapshot exibido", () => {
  it("seleciona somente o resumo da âncora entre versões distintas", async () => {
    const db = syntheticDb({
      items: [item({ origem: "XML_TISS", arquivoId: 301, loteImportacaoId: 401, numeroLote: "SYNTHETIC-LOTE" })],
      resumos: [
        resumo({ origem: "XML_TISS", arquivoHospitalId: 301, loteImportacaoId: 401, numeroLote: "SYNTHETIC-LOTE" }),
        resumo({ id: 22, origem: "XML_TISS", arquivoHospitalId: 302, loteImportacaoId: 402, numeroLote: "SYNTHETIC-OUTRO" }),
      ],
    });
    await caller().registrarAjuste(adicionar({ snapshotItemId: 11 }));
    const novoItem = db.inserts.find(row => row.table === itemTable)?.row;
    expect(novoItem).toMatchObject({ arquivoId: 301, loteImportacaoId: 401, numeroLote: "SYNTHETIC-LOTE" });
    expect(db.state[resumoTable].find(row => row.id === 21)?.totalItens).toBe(2);
    expect(db.state[resumoTable].find(row => row.id === 22)?.totalItens).toBe(1);
    expect(db.selects.filter(row => row.table === itemTable).every(row => row.lock === "update")).toBe(true);
    expect(db.committed).toBe(1);
  });

  it.each([
    { estabelecimentoId: OUTRO_HOSPITAL },
    { numeroConta: "SYNTHETIC-OUTRA-CONTA" },
  ])("recusa âncora fora da conta ou hospital antes de inserir", async (foreign) => {
    const db = syntheticDb({ items: [item(foreign)] });
    await expect(caller().registrarAjuste(adicionar({ snapshotItemId: 11 }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
    expect(db.rolledBack).toBe(1);
  });

  it("não usa resumo legado se a âncora fornecida não existe", async () => {
    const db = syntheticDb();
    await expect(caller().registrarAjuste(adicionar({ snapshotItemId: 999 }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("mantém o bloqueio se a identidade da âncora ainda tiver dois resumos", async () => {
    const db = syntheticDb({ resumos: [resumo(), resumo({ id: 22 })] });
    await expect(caller().registrarAjuste(adicionar({ snapshotItemId: 11 }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
});
