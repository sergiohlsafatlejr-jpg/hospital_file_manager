import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const root = process.cwd();
const req = createRequire(path.join(root, "package.json"));
const dialect = new MySqlDialect();
/** Só imports explicitamente autorizados. Não executa db, env, LLM ou storage reais. */
export function loadSource(
  rel: string,
  imports: Record<string, unknown> = {},
  functionOnly?: string,
  globals: Record<string, unknown> = {}
): any {
  const file = path.join(root, rel);
  let source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  if (rel === "drizzle/schema.ts")
    source = ast.statements
      .filter(n => !ts.isExportDeclaration(n))
      .map(n => n.getText(ast))
      .join("\n");
  if (functionOnly) {
    const fn = ast.statements.find(
      n => ts.isFunctionDeclaration(n) && n.name?.text === functionOnly
    );
    if (!fn) throw new Error("Função real ausente: " + functionOnly);
    source = fn.getText(ast);
  }
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    js,
    {
      module,
      exports: module.exports,
      require(name: string) {
        if (Object.hasOwn(imports, name)) return imports[name];
        if (
          [
            "drizzle-orm",
            "drizzle-orm/mysql-core",
            "zod",
            "@trpc/server",
          ].includes(name)
        )
          return req(name);
        throw new Error("IMPORT_BLOQUEADO:" + name);
      },
      console,
      Date,
      Map,
      Set,
      Promise,
      Number,
      String,
      Math,
      JSON,
      Error,
      Object,
      Array,
      BigInt,
      ...globals,
    },
    { filename: file, timeout: 5000 }
  );
  return module.exports;
}
export const schema = loadSource("drizzle/schema.ts");
export const price = loadSource("server/contratosPrecoAplicavel.ts", {
  "../drizzle/schema": schema,
});
export const integrity = loadSource(
  "server/contratosDossieIssue182Integridade.ts"
);
export function fresh(
  extra: Record<string, any[]> = {}
): Record<string, any[]> {
  return {
    contratos_convenios: [
      {
        id: 1,
        estabelecimentoId: 10,
        convenioId: 20,
        numeroContrato: "SYN",
        status: "ativo",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
        reajusteProposto: null,
        emailContato: null,
        observacoes: null,
      },
    ],
    convenios: [
      {
        id: 20,
        nome: "Convênio sintético",
        estabelecimentoId: 10,
        ativo: "sim",
      },
    ],
    estabelecimentos: [{ id: 10, nome: "Unidade sintética" }],
    contratos_convenios_documentos: [],
    tabelasPreco: [],
    regrasNegocio: [],
    demonstrativo: [],
    conciliados_automatico: [],
    recursos_glosa_justificativas: [],
    recursos_glosa_itens: [],
    ...extra,
  };
}
export function preco(
  id: number,
  hospital: number | null,
  valor: string,
  inicio: string,
  extra = {}
) {
  return {
    id,
    convenioId: 20,
    estabelecimentoId: hospital,
    codigo: "10101012",
    nome: "Consulta sintética",
    valor,
    tipo: "procedimentos",
    porte: null,
    ativo: "sim",
    vigenciaInicio: new Date(inicio),
    ...extra,
  };
}
export function documento(extra = {}) {
  return {
    id: 1,
    contratoId: 1,
    estabelecimentoId: 10,
    nomeArquivo: "tabela-sintetica.pdf",
    paginas: 1,
    status: "concluido",
    textoExtraido:
      "Vigência: 2026-10-01\n10101012 Consulta sintética R$ 150,00",
    pontosImportantes: [],
    createdAt: new Date("2026-10-01"),
    ...extra,
  };
}
export function glosa(id = 77, extra = {}) {
  return {
    id,
    estabelecimentoId: 10,
    convenioId: 20,
    valorGlosa: "10.00",
    glosaAceita: 0,
    statusConciliacao: "glosa_parcial",
    statusRecurso: null,
    recursoId: null,
    classificacaoGlosa: "pendente",
    vinculado: 0,
    valorRecurso: null,
    justificativa: null,
    ...extra,
  };
}
export function makeDb(
  data = fresh(),
  options: {
    raw?: (q: any) => any;
    fail?: (q: any) => boolean;
    affected?: number;
    failSelect?: string;
    skipPersist?: boolean;
  } = {}
) {
  const trace: any[] = [];
  let writes = 0,
    transactions = 0,
    rollbacks = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let syncLocks = new Set<string>();
  const emit = (q: any) => {
    trace.push(q);
    if (options.fail?.(q))
      throw new Error("SQL_DRIVER_SINTETICO_SECRET_SELECT_PASSWORD");
  };
  const query = (q: any) => dialect.sqlToQuery(q);
  // Condições emitidas por Drizzle reais. Campos simples: equações, IN e DATE.
  function filter(row: any, q: any, table: string): boolean {
    const text = String(q.sql);
    if (/EXISTS/.test(text)) {
      const [convenioId, ativo, hospital, host2, active2, dia] = q.params;
      const conv = data.convenios.find(
        c =>
          c.id === convenioId &&
          c.ativo === ativo &&
          (c.estabelecimentoId === hospital || c.estabelecimentoId === null)
      );
      const contracts = data.contratos_convenios.some(
        c =>
          c.estabelecimentoId === hospital &&
          c.convenioId === convenioId &&
          ["ativo", "vencendo", "renovado"].includes(c.status) &&
          (!c.dataInicio || c.dataInicio.toISOString().slice(0, 10) <= dia) &&
          (!c.dataFim || c.dataFim.toISOString().slice(0, 10) >= dia)
      );
      const codes = q.params.slice(6, -4);
      return (
        !!conv &&
        contracts &&
        row.convenioId === convenioId &&
        row.ativo === active2 &&
        (row.estabelecimentoId === host2 || row.estabelecimentoId === null) &&
        row.vigenciaInicio.toISOString().slice(0, 10) <= dia &&
        codes.includes(row.codigo)
      );
    }
    let i = 0;
    let expr = text.replace(/DATE\(`[^`]+`\.`([^`]+)`\)/g, (_, col) =>
      JSON.stringify(row[col]?.toISOString?.().slice(0, 10) ?? null)
    );
    expr = expr.replace(/`[^`]+`\.`([^`]+)`/g, (_, col) =>
      JSON.stringify(row[col] ?? null)
    );
    expr = expr.replace(/\?/g, () => JSON.stringify(q.params[i++]));
    expr = expr
      .replace(/\bis null\b/gi, "=== null")
      .replace(/\band\b/gi, "&&")
      .replace(/\bor\b/gi, "||")
      .replace(/(?<![<>=!])=(?!=)/g, "===");
    return vm.runInNewContext(expr, {}, { timeout: 1000 });
  }
  const db: any = {
    data,
    trace,
    get writes() {
      return writes;
    },
    get transactions() {
      return transactions;
    },
    get rollbacks() {
      return rollbacks;
    },
    select(selection?: Record<string, any>) {
      let table = "",
        where: any,
        ordering: any[] = [],
        limit: number | undefined,
        lock = false;
      const chain: any = {
        from(t: any) {
          table = orm.getTableName(t);
          return chain;
        },
        innerJoin() {
          return chain;
        },
        where(w: any) {
          where = w;
          return chain;
        },
        orderBy(...o: any[]) {
          ordering = o;
          return chain;
        },
        limit(n: number) {
          limit = n;
          return chain;
        },
        for(kind: string) {
          lock = kind === "update";
          return chain;
        },
        then(resolve: any, reject: any) {
          try {
            const q = {
              kind: "select",
              table,
              where: where && query(where),
              ordering: ordering.map(query),
              lock,
              limit,
            };
            emit(q);
            if (options.failSelect === table)
              throw new Error("RAW_DRIVER_PASSWORD_SELECT");
            if (lock) syncLocks.add(table);
            let rows = data[table].filter(
              r => !where || filter(r, query(where), table)
            );
            if (ordering.length)
              rows = [...rows].sort((a, b) => {
                for (const o of ordering.map(query)) {
                  const col = o.sql.match(/\.\x60([^`]+)\x60/)?.[1];
                  if (col && a[col] !== b[col])
                    return (
                      (a[col] > b[col] ? 1 : -1) *
                      (/desc/i.test(o.sql) ? -1 : 1)
                    );
                }
                return 0;
              });
            if (limit !== undefined) rows = rows.slice(0, limit);
            return Promise.resolve(
              rows.map(r =>
                selection
                  ? Object.fromEntries(
                      Object.entries(selection).map(([k, col]) => [
                        k,
                        r[col.name],
                      ])
                    )
                  : { ...r }
              )
            ).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return chain;
    },
    update(tableObj: any) {
      const table = orm.getTableName(tableObj);
      return {
        set(values: any) {
          return {
            async where(w: any) {
              const q = { kind: "update", table, values, where: query(w) };
              emit(q);
              writes++;
              const rows = data[table].filter(r => filter(r, query(w), table));
              if (!options.skipPersist)
                rows.forEach(r => Object.assign(r, values));
              return [{ affectedRows: options.affected ?? rows.length }, []];
            },
          };
        },
      };
    },
    insert(tableObj: any) {
      const table = orm.getTableName(tableObj);
      return {
        async values(values: any) {
          emit({ kind: "insert", table, values });
          if (
            !syncLocks.has("contratos_convenios") ||
            !syncLocks.has("convenios")
          )
            throw new Error("LOCK_ESTAVEL_AUSENTE");
          writes++;
          if (!options.skipPersist)
            data[table].push({
              id: 1 + Math.max(0, ...data[table].map(r => r.id)),
              ...values,
            });
          return [{ affectedRows: options.affected ?? 1 }, []];
        },
      };
    },
    async execute(input: any) {
      const q = query(input);
      emit({ kind: "execute", ...q });
      const text = q.sql.replace(/\s+/g, " ").trim();
      if (options.raw) {
        const r = options.raw(q);
        if (r !== undefined) return r;
      }
      if (/^SELECT/.test(text)) {
        if (
          /FROM demonstrativo d|FROM conciliados_automatico ca/.test(text) &&
          /FOR UPDATE/.test(text)
        ) {
          const table = text.includes("FROM demonstrativo d")
            ? "demonstrativo"
            : "conciliados_automatico";
          const [id, hospital, convenio] = q.params;
          return [
            data[table]
              .filter(
                r =>
                  r.id === id &&
                  r.estabelecimentoId === hospital &&
                  r.convenioId === convenio
              )
              .map(r => ({ ...r })),
            [],
          ];
        }
        if (/FROM recursos_glosa_justificativas/.test(text)) {
          return [
            data.recursos_glosa_justificativas
              .filter(r => r.conciliadoId === q.params[0])
              .map(r => ({ ...r })),
            [],
          ];
        }
        return [[], []];
      }
      writes++;
      if (/INSERT INTO recursos_glosa_justificativas/.test(text)) {
        data.recursos_glosa_justificativas.push({
          conciliadoId: q.params[0],
          justificativa: q.params[1],
        });
      } else if (/UPDATE recursos_glosa_justificativas/.test(text)) {
        const [just, id] = q.params;
        data.recursos_glosa_justificativas
          .filter(r => r.conciliadoId === id)
          .forEach(r => (r.justificativa = just));
      } else if (/UPDATE demonstrativo/.test(text)) {
        const [just, valor, id] = q.params;
        const r = data.demonstrativo.find(r => r.id === id);
        if (r)
          Object.assign(r, {
            justificativa: just,
            valorRecurso: valor,
            statusRecurso: "recurso_criado",
          });
      } else if (/UPDATE conciliados_automatico/.test(text)) {
        const [valor, id] = q.params;
        const r = data.conciliados_automatico.find(r => r.id === id);
        if (r)
          Object.assign(r, { valorRecurso: valor, statusRecurso: "iniciado" });
      } else throw new Error("SQL não mockado: " + text);
      return [{ affectedRows: options.affected ?? 1 }, []];
    },
    async transaction(fn: any) {
      transactions++;
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>(r => (release = r));
      await previous;
      const snapshot = structuredClone(data);
      syncLocks = new Set();
      try {
        return await fn(db);
      } catch (err) {
        rollbacks++;
        for (const key of Object.keys(data)) data[key] = snapshot[key];
        throw err;
      } finally {
        release();
      }
    },
  };
  return db;
}
export function service(
  db: any,
  invokeLLM: (...args: any[]) => any = async () => {
    throw new Error("IA_MOCK_INDISPONIVEL");
  }
) {
  return loadSource("server/contratosConveniosDossieService.ts", {
    "../drizzle/schema": schema,
    "./db": { getDb: async () => db },
    "./contratosConveniosPdfService": { extrairPontosImportantes: () => [] },
    "./contratosPrecoAplicavel": price,
    "./contratosDossieIssue182Integridade": integrity,
    "./_core/llm": { invokeLLM },
  });
}
