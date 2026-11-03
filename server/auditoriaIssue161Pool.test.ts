import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

const factories = vi.hoisted(() => ({ buildDrizzle: vi.fn(), createPool: vi.fn(), createPromisePool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return {
    ...actual,
    drizzle: Object.assign((...params: unknown[]) => factories.buildDrizzle(...params), actual.drizzle),
  };
});
// No mysql2 client can be created: both factories are replaced before the real DB module loads.
vi.mock("mysql2", () => ({ createPool: factories.createPool }));
vi.mock("mysql2/promise", () => ({ createPool: factories.createPromisePool }));
import { getConvenioById, getDb, verificarPermissaoEstabelecimento } from "./db";
import { exigirHospitalProprietario } from "./hospitalScope";
import { exigirAcessoEstabelecimento, exigirConvenioDoEstabelecimento } from "./recursoGlosaPermissions";
import { auditoriaRouter } from "./routers/auditoriaRouter";
import type { TrpcContext } from "./_core/context";
import {
  users, convenios, permissoesEstabelecimento, contasConvenioItens,
  contasConvenioResumo, aprendizadoAuditoria,
} from "../drizzle/schema";

type SyntheticRow = Record<string, unknown>;
type QueryOptions = { sql: string; rowsAsArray?: boolean };
type Call = { sql: string; params: unknown[] };
const HOSPITAL = 101;
const OUTRO = 202;
const USER = 44;
const CONVENIO = 31;
const CONTA = "SYNTHETIC-POOL161";
const usuario = { id: USER, role: "user" };
const tables = [users, convenios, permissoesEstabelecimento, contasConvenioItens, contasConvenioResumo, aprendizadoAuditoria];
const columnKeys = new Map(tables.map(table => [getTableName(table), new Map(
  Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]),
)]));
let rows: Record<string, SyntheticRow[]>;
let globalCalls: Call[];
let txCalls: Call[];
let activeTransactions = 0;
let nextId = 400;
let txPermission: "sim" | "nao";
let txFailure = false;

function result(options: QueryOptions, params: unknown[], transactional: boolean) {
  const command = options.sql;
  if (/^select /i.test(command)) {
    const match = /^select (.+?) from `([^`]+)`/i.exec(command);
    if (!match) throw new Error(`Unexpected synthetic SELECT: ${command}`);
    const [, projection, table] = match;
    let selected = rows[table] ?? [];
    if (table === getTableName(users)) selected = selected.filter(row => row.id === params[0]);
    if (table === getTableName(permissoesEstabelecimento)) {
      selected = selected.filter(row => row.userId === params[0] && row.estabelecimentoId === params[1]);
      if (transactional) selected = selected.map(row => ({ ...row, podeEditar: txPermission }));
    }
    if (table === getTableName(convenios)) selected = selected.filter(row => row.id === params[0]);
    const fields = projection.split(", ").map(field => {
      const name = /`([^`]+)`$/.exec(field)?.[1];
      if (!name) throw new Error(`Unexpected synthetic field: ${field}`);
      return columnKeys.get(table)?.get(name) ?? name;
    });
    return [selected.map(row => fields.map(key => {
      const value = row[key] ?? null;
      return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
    })), []];
  }
  if (/^(begin|commit|rollback)$/i.test(command) || /^(insert|update) /i.test(command)) {
    return [{ insertId: ++nextId, affectedRows: 1 }, []];
  }
  throw new Error(`Unexpected synthetic SQL: ${command}`);
}
const globalQuery = vi.fn(async (options: QueryOptions, params: unknown[] = []) => {
  globalCalls.push({ sql: options.sql, params });
  if (activeTransactions > 0) throw new Error("GLOBAL_POOL_QUERY_DURING_TX");
  return result(options, params, false);
});
const pool = {
  query: globalQuery,
  getConnection: vi.fn(async () => {
    activeTransactions++;
    return {
      query: vi.fn(async (options: QueryOptions, params: unknown[] = []) => {
        txCalls.push({ sql: options.sql, params });
        if (txFailure && /^select /i.test(options.sql)) throw new Error("SYNTHETIC_TX_QUERY_FAILURE");
        return result(options, params, true);
      }),
      release: vi.fn(() => { activeTransactions--; }),
    };
  }),
};

function caller(role: "user" | "admin" = "user") {
  const ctx = {
    user: {
      id: USER, role, openId: "synthetic-pool161", name: "Auditor sintético", email: null,
      emailCanonical: null, loginMethod: "password", passwordHash: null, sessionVersion: 0,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    }, req: {}, res: {},
  } as TrpcContext;
  return auditoriaRouter.createCaller(ctx);
}
const adicionar = (snapshotItemId?: number) => ({
  estabelecimentoId: HOSPITAL, numeroConta: CONTA, tipoAjuste: "ADICIONAR_ITEM" as const,
  codigoItem: "SYNTHETIC", descricaoItem: "Item sintético", quantidadeAjustada: "2",
  valorAjustado: "5.25", setorNovoItem: "UTI", dataNovoItem: "2026-10-21", snapshotItemId,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "SYNTHETIC_NO_NETWORK");
  vi.stubEnv("APP_DATABASE_URL", "");
  // drizzle.mock creates a real MySql2Session without creating a mysql2 client.
  // Replace only its I/O client, retaining real query builders, prepared queries and transactions.
  factories.buildDrizzle.mockImplementation(() => {
    const db = drizzle.mock();
    const session: unknown = Reflect.get(db, "session");
    if (!session || typeof session !== "object") throw new Error("Synthetic Drizzle session unavailable");
    Reflect.set(session, "client", pool);
    return db;
  });
  factories.createPool.mockImplementation(() => { throw new Error("MYSQL_POOL_FORBIDDEN"); });
  factories.createPromisePool.mockImplementation(() => { throw new Error("RAW_POOL_FORBIDDEN"); });
  globalCalls = [];
  txCalls = [];
  activeTransactions = 0;
  txPermission = "sim";
  txFailure = false;
  nextId = 400;
  rows = {
    [getTableName(users)]: [{ id: USER, role: "user" }],
    [getTableName(permissoesEstabelecimento)]: [{
      id: 1, userId: USER, estabelecimentoId: HOSPITAL, podeVisualizar: "sim",
      podeEditar: "sim", podeExcluir: "nao", podeGerenciar: "nao",
    }],
    [getTableName(convenios)]: [{ id: CONVENIO, nome: "SYNTHETIC", estabelecimentoId: HOSPITAL }],
    [getTableName(contasConvenioItens)]: [{
      id: 11, estabelecimentoId: HOSPITAL, numeroConta: CONTA, origem: "BANCO_CLIENTE",
      convenioId: CONVENIO, convenio: "SYNTHETIC", arquivoId: null, loteImportacaoId: null,
      numeroLote: null, competencia: "2026/10", statusAnalise: "pendente", divergencias: [],
      quantidade: "2", valorUnitario: "5.00", valorTotal: "10.00", setor: "ENFERMARIA",
    }],
    [getTableName(contasConvenioResumo)]: [{
      id: 21, estabelecimentoId: HOSPITAL, numeroConta: CONTA, origem: "BANCO_CLIENTE",
      convenioId: CONVENIO, convenio: "SYNTHETIC", arquivoHospitalId: null, loteImportacaoId: null,
      numeroLote: null, competencia: "2026/10", totalItens: 1, valorTotal: "10.00",
    }],
    [getTableName(aprendizadoAuditoria)]: [],
  };
});
afterEach(() => {
  expect(activeTransactions).toBe(0);
  expect(factories.createPool).not.toHaveBeenCalled();
  expect(factories.createPromisePool).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

// Real Drizzle SQL compilation, mapping and transactions; only mysql2 I/O is synthetic.
describe("Issue161: conexão transacional injetada não consulta pool global", () => {
  it("API anterior sem banco falha fechado: permissão false e convênio null", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar")).resolves.toBe(false);
    await expect(getConvenioById(CONVENIO)).resolves.toBeNull();
    expect(factories.buildDrizzle).not.toHaveBeenCalled();
    expect(globalCalls).toEqual([]);
  });

  it("getters injetados não inicializam sequer o pool global e mantêm resultados", async () => {
    const connection = drizzle("SYNTHETIC_INJECTED_ONLY");
    factories.buildDrizzle.mockClear();
    await connection.transaction(async tx => {
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).resolves.toBe(true);
      await expect(getConvenioById(CONVENIO, tx)).resolves.toMatchObject({ id: CONVENIO, estabelecimentoId: HOSPITAL });
      await exigirHospitalProprietario(usuario, HOSPITAL, "editar", tx);
      await exigirAcessoEstabelecimento(USER, HOSPITAL, "editar", tx);
      await expect(exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar", tx)).resolves.toMatchObject({ id: CONVENIO });
    });
    expect(factories.buildDrizzle).not.toHaveBeenCalled();
    expect(globalCalls).toEqual([]);
    expect(txCalls.filter(call => /^select /i.test(call.sql))).toHaveLength(10);
  });

  it("API anterior mantém as mesmas autorizações e o mesmo retorno legítimo", async () => {
    const oldConvenio = await getConvenioById(CONVENIO);
    await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL)).resolves.toBe(true);
    await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar")).resolves.toBe(true);
    await expect(exigirHospitalProprietario(usuario, HOSPITAL, "editar")).resolves.toBeUndefined();
    await expect(exigirAcessoEstabelecimento(USER, HOSPITAL, "editar")).resolves.toBeUndefined();
    await expect(exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar")).resolves.toEqual(oldConvenio);
    expect(globalCalls.length).toBeGreaterThan(0);
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    const previousCalls = globalCalls.length;
    await db.transaction(async tx => {
      await expect(getConvenioById(CONVENIO, tx)).resolves.toEqual(oldConvenio);
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).resolves.toBe(true);
    });
    expect(globalCalls).toHaveLength(previousCalls);
  });

  it("role admin da requisição não ignora permissão persistida nem consulta convênio ao negar", async () => {
    txPermission = "nao";
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    await db.transaction(async tx => {
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).resolves.toBe(false);
      await expect(exigirHospitalProprietario({ ...usuario, role: "admin" }, HOSPITAL, "editar", tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar", tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    expect(txCalls.some(call => call.sql.includes("from `convenios`"))).toBe(false);
    expect(globalCalls).toEqual([]);
  });

  it("admin realmente persistido mantém o bypass sem permissão explícita", async () => {
    rows[getTableName(users)][0].role = "admin";
    rows[getTableName(permissoesEstabelecimento)] = [];
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    await db.transaction(async tx => {
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).resolves.toBe(true);
      await exigirHospitalProprietario(usuario, HOSPITAL, "editar", tx);
    });
    expect(txCalls.some(call => call.sql.includes("from `permissoesEstabelecimento`"))).toBe(false);
  });

  it("ownership de convênio permanece obrigatório e convênio global continua legítimo", async () => {
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    await db.transaction(async tx => {
      rows[getTableName(convenios)][0].estabelecimentoId = OUTRO;
      await expect(exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar", tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      rows[getTableName(convenios)][0].estabelecimentoId = null;
      await expect(exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar", tx)).resolves.toMatchObject({ id: CONVENIO, estabelecimentoId: null });
      await expect(getConvenioById(999, tx)).resolves.toBeNull();
      await expect(exigirConvenioDoEstabelecimento(USER, 999, HOSPITAL, "editar", tx)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    expect(globalCalls).toEqual([]);
  });

  it("ausência de permissão retorna false e falha de query transacional não faz fallback", async () => {
    rows[getTableName(permissoesEstabelecimento)] = [];
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    await db.transaction(async tx => {
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).resolves.toBe(false);
      txFailure = true;
      await expect(verificarPermissaoEstabelecimento(USER, HOSPITAL, "editar", tx)).rejects.toThrow();
      await expect(getConvenioById(CONVENIO, tx)).rejects.toThrow();
    });
    expect(globalCalls).toEqual([]);
  });

  it("dez transações simultâneas concluem sem disputar o pool global", async () => {
    const db = await getDb();
    if (!db) throw new Error("Synthetic DB unavailable");
    let entered = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>(resolve => { releaseBarrier = resolve; });
    await Promise.all(Array.from({ length: 10 }, () => db.transaction(async tx => {
      entered++;
      if (entered === 10) releaseBarrier();
      await barrier;
      expect(activeTransactions).toBe(10);
      await exigirHospitalProprietario(usuario, HOSPITAL, "editar", tx);
      await exigirConvenioDoEstabelecimento(USER, CONVENIO, HOSPITAL, "editar", tx);
    })));
    expect(entered).toBe(10);
    expect(pool.getConnection).toHaveBeenCalledTimes(10);
    expect(globalCalls).toEqual([]);
  });

  it.each([
    "marcar", "desmarcar", "alterar-item", "adicionar", "adicionar-ancora",
  ] as const)("auditoria %s usa query real Drizzle no tx sem query global no callback", async operation => {
    const api = caller();
    if (operation === "marcar" || operation === "desmarcar") {
      await expect(api.marcarItensAuditados({
        estabelecimentoId: HOSPITAL, numeroConta: CONTA, itemIds: [11], auditado: operation === "marcar",
      })).resolves.toEqual({ sucesso: true, totalAtualizados: 1 });
    } else if (operation === "alterar-item") {
      await expect(api.registrarAjuste({
        estabelecimentoId: HOSPITAL, numeroConta: CONTA, tipoAjuste: "ALTERAR_SETOR", itemId: 11, setorAjustado: "UTI",
      })).resolves.toEqual({ sucesso: true });
    } else {
      await expect(api.registrarAjuste(adicionar(operation === "adicionar-ancora" ? 11 : undefined))).resolves.toEqual({ sucesso: true });
    }
    expect(globalCalls).toHaveLength(4); // middleware visualizar + guard editar, both outside tx
    expect(txCalls.some(call => call.sql.includes("from `users`"))).toBe(true);
    expect(txCalls.some(call => call.sql.includes("from `permissoesEstabelecimento`"))).toBe(true);
    expect(txCalls.some(call => call.sql.includes("from `convenios`"))).toBe(true);
    expect(txCalls.some(call => /^update /i.test(call.sql))).toBe(true);
    expect(txCalls.at(-1)?.sql).toBe("commit");
  });

  it.each(["marcar", "adicionar"] as const)("auditoria %s revalida permissão no tx e nega antes da escrita", async operation => {
    txPermission = "nao";
    const api = caller("admin"); // Only middleware's request-role bypass, never the persisted edit permission.
    const action = operation === "marcar"
      ? api.marcarItensAuditados({ estabelecimentoId: HOSPITAL, numeroConta: CONTA, itemIds: [11], auditado: true })
      : api.registrarAjuste(adicionar());
    await expect(action).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(txCalls.some(call => /^(insert|update) /i.test(call.sql))).toBe(false);
    expect(txCalls.at(-1)?.sql).toBe("rollback");
  });
});
