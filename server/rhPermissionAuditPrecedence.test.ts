import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getModulePermissionsForGroup, sanitizeCustomModulePermissions } from "../shared/permissions";
import { isRhPermissionAuditOnly, markRhPermissionAuditOnly } from "./rhPermissionAuditOrigin";

// Executa as funções EXATAS de db.ts, selecionadas por AST. Não importa getDb,
// entrypoint, jobs, dotenv ou qualquer conexão real. Só o I/O Drizzle é substituído;
// a resolução de precedência, tombstones, fallback e os payloads são de produção.
const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true);
const names = [
  "chavePermissaoRh", "extrairAcessoRhDeJson", "executarEmTransacaoPermissao",
  "anexarAcessoRecursosHumanos", "registrarLogAuditoria", "upsertPermissaoEstabelecimento",
  "criarPermissaoEstabelecimento", "deletePermissaoEstabelecimento",
] as const;
const printer = ts.createPrinter();
const productionCode = names.map(name => {
  const node = ast.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node?.body) throw new Error(`Função real ausente em db.ts: ${name}`);
  const local = ts.factory.updateFunctionDeclaration(
    node,
    node.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword),
    node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body,
  );
  return printer.printNode(ts.EmitHint.Unspecified, local, ast);
}).join("\n");
const compiled = ts.transpileModule(`${productionCode}\nreturn { ${names.join(", ")} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;

type Row = Record<string, unknown>;
type Permission = Row & {
  userId: number;
  estabelecimentoId: number;
  grupoServico?: string;
  grupoId?: number;
  acessoRecursosHumanos?: "sim" | "nao";
};
type Predicate = (row: Row) => boolean;
type TableName = "permissions" | "logs" | "groups";
type State = Record<TableName, Row[]> & { nextId: number };
const table = (name: TableName, fields: string[]) => ({
  name, ...Object.fromEntries(fields.map(field => [field, field])),
});
const permissions = table("permissions", ["id", "userId", "estabelecimentoId"]);
const logs = table("logs", [
  "id", "usuarioAfetadoId", "estabelecimentoId", "tipoAcao", "valoresNovos", "createdAt",
]);
const groups = table("groups", ["id", "permissoesPadrao", "ativo", "estabelecimentoId"]);
const eq = (column: string, value: unknown): Predicate => row => row[column] === value;
const inArray = (column: string, values: unknown[]): Predicate => row => values.includes(row[column]);
const and = (...predicates: Predicate[]): Predicate => row => predicates.every(predicate => predicate(row));
const or = (...predicates: Predicate[]): Predicate => row => predicates.some(predicate => predicate(row));
const isNull = (column: string): Predicate => row => row[column] == null;
const desc = (column: string) => column;
const epoch = Date.parse("2026-01-01T00:00:00.000Z");

function harness() {
  const state: State = { permissions: [], logs: [], groups: [], nextId: 1 };
  const controls = { failRead: undefined as TableName | undefined, failAuditWrite: false };
  const reads = vi.fn<(name: TableName) => void>();
  function connection(current: State) {
    return {
      select: vi.fn(() => {
        let selected: TableName;
        let predicate: Predicate = () => true;
        let ordering: string[] = [];
        let maximum = Infinity;
        const query = {
          from(target: { name: TableName }) { selected = target.name; return query; },
          where(filter: Predicate) { predicate = filter; return query; },
          orderBy(...columns: string[]) { ordering = columns; return query; },
          limit(value: number) { maximum = value; return query; },
          then(resolve: (rows: Row[]) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve().then(() => {
              reads(selected);
              if (controls.failRead === selected) throw new Error("Falha sintética de leitura");
              return current[selected].filter(predicate).slice().sort((left, right) => {
                for (const column of ordering) {
                  const a = Number(left[column]);
                  const b = Number(right[column]);
                  if (a !== b) return b - a;
                }
                return 0;
              }).slice(0, maximum).map(row => structuredClone(row));
            }).then(resolve, reject);
          },
        };
        return query;
      }),
      insert: vi.fn((target: { name: TableName }) => ({
        values: vi.fn(async (values: Row) => {
          if (target.name === "logs" && controls.failAuditWrite) {
            throw new Error("Falha sintética de auditoria");
          }
          const id = current.nextId++;
          current[target.name].push({
            ...structuredClone(values), id, createdAt: new Date(epoch + id * 1000),
          });
          return [{ insertId: id }];
        }),
      })),
      update: vi.fn((target: { name: TableName }) => ({
        set: (values: Row) => ({
          where: async (filter: Predicate) => {
            current[target.name] = current[target.name].map(row =>
              filter(row) ? { ...row, ...structuredClone(values) } : row);
          },
        }),
      })),
      delete: vi.fn((target: { name: TableName }) => ({
        where: async (filter: Predicate) => {
          current[target.name] = current[target.name].filter(row => !filter(row));
        },
      })),
      transaction: vi.fn(async <T>(operation: (tx: unknown) => Promise<T>) => {
        const pending = structuredClone(current);
        const result = await operation(connection(pending));
        Object.assign(current, pending);
        return result;
      }),
    };
  }
  const db = connection(state);
  const getDb = vi.fn().mockResolvedValue(db);
  const dependencies = {
    getDb, permissoesEstabelecimento: permissions, logAuditoriaPermissoes: logs,
    gruposServico: groups, eq, inArray, and, or, isNull, desc,
    isRhPermissionAuditOnly, markRhPermissionAuditOnly,
    getModulePermissionsForGroup, sanitizeCustomModulePermissions,
  };
  const real = new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies)) as {
    anexarAcessoRecursosHumanos: (rows: Permission[], connection?: unknown) => Promise<Permission[]>;
    registrarLogAuditoria: (data: Row) => Promise<void>;
    upsertPermissaoEstabelecimento: (data: Permission) => Promise<{ id: number; updated: boolean }>;
    criarPermissaoEstabelecimento: (data: Row) => Promise<{ id: number }>;
    deletePermissaoEstabelecimento: (userId: number, estabelecimentoId: number) => Promise<void>;
  };
  function legacy(tipoAcao: string, valoresNovos: unknown, userId = 41, estabelecimentoId = 101) {
    const id = state.nextId++;
    state.logs.push({
      id, usuarioAfetadoId: userId, estabelecimentoId, tipoAcao, valoresNovos,
      createdAt: new Date(epoch + id * 1000),
    });
  }
  const audit = (tipoAcao: string, valoresNovos: unknown, userId = 41, estabelecimentoId = 101) =>
    real.registrarLogAuditoria({
      usuarioId: userId, usuarioAfetadoId: userId, estabelecimentoId,
      tipoAcao, descricao: "Auditoria sintética adicional do router", valoresNovos,
    });
  const read = (rows: Permission[] = [permission()]) => real.anexarAcessoRecursosHumanos(rows);
  return { state, controls, reads, db, getDb, real, legacy, audit, read };
}

function permission(overrides: Partial<Permission> = {}): Permission {
  return { userId: 41, estabelecimentoId: 101, grupoServico: "visualizador", ...overrides };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const actions = ["criar_permissao", "alterar_permissao", "remover_permissao"] as const;

describe("RH — precedência do leitor REAL e origem do writer REAL (Issue #166)", () => {
  it("A concede/commita, pausa getUserById; B revoga e termina; descrição tardia de A não reabre RH", async () => {
    const h = harness();
    const granted = deferred();
    const resumeGetUserById = deferred();
    const data = permission({ grupoServico: "administrador", grupoId: 7 });
    h.state.groups.push({ id: 7, permissoesPadrao: { acessoRecursosHumanos: "sim" } });
    const getUserById = vi.fn(async () => {
      granted.resolve();
      await resumeGetUserById.promise;
      return { id: data.userId };
    });
    const requestA = (async () => {
      await h.real.upsertPermissaoEstabelecimento({ ...data, acessoRecursosHumanos: "sim" });
      await getUserById(); // Janela entre commit e log descritivo adicional do router.
      await h.audit("criar_permissao", { ...data, acessoRecursosHumanos: "sim" });
    })();
    await granted.promise;
    try {
      expect((await h.read([data]))[0].acessoRecursosHumanos).toBe("sim");
      await h.real.upsertPermissaoEstabelecimento({ ...data, acessoRecursosHumanos: "nao" });
      await h.audit("alterar_permissao", { ...data, acessoRecursosHumanos: "nao" });
      expect((await h.read([data]))[0].acessoRecursosHumanos).toBe("nao");
    } finally {
      resumeGetUserById.resolve();
      await requestA;
    }
    expect(h.state.logs.map(log => [log.tipoAcao, isRhPermissionAuditOnly(log.valoresNovos)])).toEqual([
      ["criar_permissao", false], ["alterar_permissao", false],
      ["alterar_permissao", true], ["criar_permissao", true],
    ]);
    const [revocation, late] = [h.state.logs[1], h.state.logs[3]];
    expect(Number(late.id)).toBeGreaterThan(Number(revocation.id));
    expect(Number(late.createdAt)).toBeGreaterThan(Number(revocation.createdAt));
    expect((await h.read([data]))[0].acessoRecursosHumanos).toBe("nao");
  });

  it.each([false, true])("remover descritivo tardio após recriação sim não revoga (JSON serializado=%s)", async serialized => {
    const h = harness();
    await h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "sim" }));
    await h.real.deletePermissaoEstabelecimento(41, 101);
    expect((await h.read())[0].acessoRecursosHumanos).toBe("nao");
    await h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "sim" }));
    await h.audit("remover_permissao", { acessoRecursosHumanos: "nao" });
    if (serialized) {
      const late = h.state.logs.at(-1)!;
      late.valoresNovos = JSON.stringify(late.valoresNovos);
    }
    expect(h.state.logs.slice(0, 3).every(log => !isRhPermissionAuditOnly(log.valoresNovos))).toBe(true);
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
  });

  it.each(["criar_permissao", "alterar_permissao"])('%s descritivo isolado não concede nem sufoca fallback de grupo válido', async action => {
    for (const groupValue of ["sim", "nao"] as const) {
      const h = harness();
      h.state.groups.push({ id: 7, permissoesPadrao: JSON.stringify({ acessoRecursosHumanos: groupValue }) });
      await h.audit(action, { acessoRecursosHumanos: groupValue === "sim" ? "nao" : "sim" });
      expect((await h.read([permission({ grupoId: 7 })]))[0].acessoRecursosHumanos).toBe(groupValue);
      expect(h.reads).toHaveBeenCalledWith("groups");
    }
  });

  it("descrição isolada não concede sem grupo e não bloqueia fallback administrativo válido", async () => {
    const h = harness();
    await h.audit("criar_permissao", { acessoRecursosHumanos: "sim" });
    expect((await h.read())[0].acessoRecursosHumanos).toBe("nao");
    await h.audit("remover_permissao", { acessoRecursosHumanos: "nao" });
    expect((await h.read([permission({ grupoServico: "administrador" })]))[0].acessoRecursosHumanos).toBe("sim");
  });

  it.each(actions)("evento legado %s sem marcador permanece autoritativo", async action => {
    const h = harness();
    h.legacy("criar_permissao", { acessoRecursosHumanos: "sim" });
    const expected = action === "criar_permissao" ? "sim" : "nao";
    h.legacy(action, action === "remover_permissao" ? null : { acessoRecursosHumanos: expected });
    expect((await h.read([permission({ grupoServico: "administrador" })]))[0].acessoRecursosHumanos).toBe(expected);
  });

  it("JSON serializado: legado elegível e descrições criar/alterar/remover ignoradas antes do tombstone", async () => {
    const h = harness();
    h.legacy("alterar_permissao", JSON.stringify({ acessoRecursosHumanos: "sim", __rhPermissionAuditOnly: false }));
    for (const action of actions) {
      await h.audit(action, JSON.stringify({ acessoRecursosHumanos: "nao", detalhe: "sintético" }));
      const last = h.state.logs.at(-1)!;
      last.valoresNovos = JSON.stringify(last.valoresNovos);
      expect(isRhPermissionAuditOnly(last.valoresNovos)).toBe(true);
    }
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
  });

  it("ordem real por timestamp e desempate por ID continua valendo só para eventos elegíveis", async () => {
    const h = harness();
    h.legacy("criar_permissao", { acessoRecursosHumanos: "sim" });
    h.legacy("alterar_permissao", { acessoRecursosHumanos: "nao" });
    h.state.logs[1].createdAt = h.state.logs[0].createdAt;
    await h.audit("alterar_permissao", { acessoRecursosHumanos: "sim" });
    expect((await h.read())[0].acessoRecursosHumanos).toBe("nao");
    h.state.logs[0].createdAt = new Date(epoch + 100_000);
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
  });

  it("isola pares user/hospital, incluindo combinações cruzadas retornadas pelo filtro IN", async () => {
    const h = harness();
    h.legacy("alterar_permissao", { acessoRecursosHumanos: "nao" }, 41, 101);
    h.legacy("criar_permissao", { acessoRecursosHumanos: "sim" }, 42, 102);
    h.legacy("remover_permissao", null, 41, 102);
    h.legacy("alterar_permissao", { acessoRecursosHumanos: "sim" }, 42, 101);
    await h.audit("alterar_permissao", { acessoRecursosHumanos: "sim" }, 41, 101);
    await h.audit("remover_permissao", null, 42, 102);
    const rows = [permission(), permission({ userId: 42, estabelecimentoId: 102 })];
    expect((await h.read(rows)).map(row => row.acessoRecursosHumanos)).toEqual(["nao", "sim"]);
    expect(rows.every(row => row.acessoRecursosHumanos === undefined)).toBe(true);
  });

  it.each(["logs", "groups", "unavailable"] as const)("falha durável (%s) nega sem recorrer a grupo ou administrador", async failure => {
    const h = harness();
    h.state.groups.push({ id: 7, permissoesPadrao: { acessoRecursosHumanos: "sim" } });
    await h.audit("criar_permissao", { acessoRecursosHumanos: "sim" });
    if (failure === "unavailable") h.getDb.mockResolvedValue(null);
    else h.controls.failRead = failure;
    const rows = [permission({ grupoId: 7 }), permission({ userId: 42, grupoServico: "administrador" })];
    expect((await h.read(rows)).map(row => row.acessoRecursosHumanos)).toEqual(["nao", "nao"]);
    if (failure === "logs") expect(h.reads).not.toHaveBeenCalledWith("groups");
  });

  it.each(actions)("writer genérico REAL impõe marcador true em %s, conserva payload e não muta input false", async action => {
    const h = harness();
    const nested = Object.freeze({ campo: "sintético" });
    const values = Object.freeze({ acessoRecursosHumanos: "sim", nested, __rhPermissionAuditOnly: false });
    const old = Object.freeze({ acessoRecursosHumanos: "nao" });
    const data = Object.freeze({
      usuarioId: 41, usuarioAfetadoId: 41, estabelecimentoId: 101,
      tipoAcao: action, descricao: "Mantida", valoresAnteriores: old, valoresNovos: values,
    });
    await h.real.registrarLogAuditoria(data);
    expect(h.state.logs[0]).toMatchObject({
      ...data, valoresNovos: { ...values, __rhPermissionAuditOnly: true },
    });
    expect(values.__rhPermissionAuditOnly).toBe(false);
    expect(data.valoresNovos).toBe(values);
    expect(data.valoresAnteriores).toBe(old);
    expect(markRhPermissionAuditOnly(action, values)).not.toBe(values);
  });

  it.each(["alterar_grupo", "login"])("outro tipoAcao (%s) conserva valores sem acrescentar marcador", async action => {
    const h = harness();
    const values = Object.freeze({ acessoRecursosHumanos: "sim", detalhe: "mantido" });
    expect(markRhPermissionAuditOnly(action, values)).toBe(values);
    await h.audit(action, values);
    expect(h.state.logs[0].valoresNovos).toEqual(values);
    expect(isRhPermissionAuditOnly(h.state.logs[0].valoresNovos)).toBe(false);
    expect((await h.read())[0].acessoRecursosHumanos).toBe("nao");
  });

  it("helper conserva valores não-objeto, sem interpretar false/string inválida como marcador", () => {
    for (const value of [undefined, null, false, 17, "não é JSON", ["sintético"]]) {
      const marked = markRhPermissionAuditOnly("remover_permissao", value);
      expect(marked).toEqual({ valorOriginal: value ?? null, __rhPermissionAuditOnly: true });
      expect(isRhPermissionAuditOnly(marked)).toBe(true);
    }
    for (const value of [null, "JSON inválido", [], { __rhPermissionAuditOnly: false }, { __rhPermissionAuditOnly: "true" }]) {
      expect(isRhPermissionAuditOnly(value)).toBe(false);
    }
  });

  it("writers transacionais REAIS criar/upsert/update/delete não marcam e continuam autoridade", async () => {
    const h = harness();
    await h.real.criarPermissaoEstabelecimento({ usuarioId: 41, estabelecimentoId: 101, grupoServico: "administrador" });
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
    await h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "nao" }));
    expect((await h.read())[0].acessoRecursosHumanos).toBe("nao");
    await h.real.deletePermissaoEstabelecimento(41, 101);
    expect((await h.read([permission({ grupoServico: "administrador" })]))[0].acessoRecursosHumanos).toBe("nao");
    await h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "sim" }));
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
    expect(h.state.logs.map(log => log.tipoAcao)).toEqual([
      "criar_permissao", "alterar_permissao", "remover_permissao", "criar_permissao",
    ]);
    for (const log of h.state.logs) {
      expect(log.valoresNovos).not.toHaveProperty("__rhPermissionAuditOnly");
    }
    expect(h.db.transaction).toHaveBeenCalledTimes(4);
  });

  it("falha do evento transacional faz rollback da atualização e da remoção no mock de persistência", async () => {
    const h = harness();
    await h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "sim" }));
    const before = structuredClone(h.state);
    h.controls.failAuditWrite = true;
    await expect(h.real.upsertPermissaoEstabelecimento(permission({ acessoRecursosHumanos: "nao" }))).rejects.toThrow("Falha sintética de auditoria");
    expect(h.state).toEqual(before);
    await expect(h.real.deletePermissaoEstabelecimento(41, 101)).rejects.toThrow("Falha sintética de auditoria");
    expect(h.state).toEqual(before);
    expect((await h.read())[0].acessoRecursosHumanos).toBe("sim");
  });
});
