import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import type { TrpcContext } from "../_core/context";
import type { InsertFilaEnvioXmlPortal } from "../../drizzle/schema";
import { convenios, credenciaisPortais, estabelecimentos, filaEnvioXmlPortal } from "../../drizzle/schema";
import { inserirFilaXmlAtomica } from "./rpaFilaAtomica";
import { executarCicloEnvioXmlRpa } from "./rpaEnvioService";
import { rpaRouter } from "../routers/rpaRouter";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), permissao: vi.fn(), enviar: vi.fn(), identificar: vi.fn(),
  write: vi.fn(), error: vi.fn(), validarPath: vi.fn(),
}));
vi.mock("../db", () => ({
  getDb: mocks.getDb,
  verificarPermissaoEstabelecimento: mocks.permissao,
  verificarAcessoModulo: vi.fn(),
}));
vi.mock("../_core/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../_core/logger", () => ({ logger: { error: mocks.error, info: vi.fn(), warn: vi.fn() } }));
vi.mock("./robos/RoboUnimed", () => ({ RoboUnimed: class { enviarLotesXml = mocks.enviar; } }));
vi.mock("./robos/RoboIpasgo", () => ({ RoboIpasgo: class { enviarLotesXml = mocks.enviar; } }));
vi.mock("./robos/RoboCassi", () => ({ RoboCassi: class { enviarLotesXml = mocks.enviar; } }));
vi.mock("./robos/RoboSaudeCaixa", () => ({ RoboSaudeCaixa: class { enviarLotesXml = mocks.enviar; } }));
vi.mock("./identificadorXmlTiss", () => ({ identificarERotearXmlTiss: mocks.identificar }));
vi.mock("./cofreCredenciais", () => ({
  cofreRpaKeyAvailable: () => true, estaCriptografadaNoCofre: () => true,
  obterSenhaParaRobo: () => "synthetic-only", salvarSenhaCofre: () => "synthetic-cipher",
  validarUrlPortalConvenio: (url: string) => url,
  validarCaminhoContidoXmlRpa: mocks.validarPath,
  sanitizarNumeroLoteTiss: (lote: string) => lote,
  resolverCaminhoSeguroXmlRpa: () => ({ pastaDestino: "synthetic", caminhoCompleto: "synthetic/lote.xml" }),
}));
vi.mock("fs", () => ({ default: { existsSync: () => true, mkdirSync: vi.fn(), writeFileSync: mocks.write } }));

type Row = Record<string, unknown> & { id: number };
type RpaDb = Parameters<typeof inserirFilaXmlAtomica>[0];
type MockQuery = PromiseLike<Row[]> & {
  where: (condition: SQL) => MockQuery;
  leftJoin: () => MockQuery;
  orderBy: () => MockQuery;
  limit: (maximum: number) => MockQuery;
  for: (mode: string) => Promise<Row[]>;
};
const dialect = new MySqlDialect();
const hash = "a".repeat(64);
const valores: InsertFilaEnvioXmlPortal = {
  estabelecimentoId: 3, convenioId: 10, hashXml: hash,
  nomeArquivo: "synthetic.xml", numeroLote: "LOTE-SYNTHETIC",
  usuarioUploadId: 7, caminhoArquivoXml: "synthetic/lote.xml", statusEsteira: "LIBERADO_ENVIO",
};

// Renderiza as condições Drizzle reais para que o mock respeite WHERE/status,
// em vez de permitir um UPDATE/DELETE incondicional passar nas regressões.
function matches(condition: SQL | undefined, row: Row): boolean {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  let index = 0;
  const columns: Record<string, string> = {
    estabelecimento_id: "estabelecimentoId", convenio_id: "convenioId",
    hash_xml: "hashXml", status_esteira: "statusEsteira",
  };
  const clauses = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=\s*\?|in\s*\(([^)]+)\))/gi)];
  return clauses.map((clause) => {
    const key = columns[clause[1]] || clause[1];
    const count = clause[3] ? (clause[3].match(/\?/g) || []).length : 1;
    const params = query.params.slice(index, index + count);
    index += count;
    return params.includes(row[key]);
  }).every(Boolean);
}

function criarDb() {
  const fila: Row[] = [];
  const credentials: Row[] = [{
    id: 9, estabelecimentoId: 3, convenioId: 10, ativo: "sim", statusCredencial: "ATIVA",
    urlLogin: "https://synthetic.invalid", login: "synthetic", senha: "synthetic-cipher", registroAns: "382876",
  }];
  const hospitals: Row[] = [{ id: 3, nome: "Hospital sintético", ativo: "sim" }, { id: 5, nome: "Outro sintético", ativo: "sim" }];
  const events: string[] = [];
  const writes: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  let nextId = 100;
  let anchorTail = Promise.resolve();
  let nextMutation: (() => void) | undefined;
  function rows(table: unknown) {
    if (table === filaEnvioXmlPortal) return fila;
    if (table === credenciaisPortais) return credentials;
    if (table === estabelecimentos) return hospitals;
    if (table === convenios) return [{ id: 10, nome: "Unimed sintética" }];
    return [];
  }
  function connection(inTx: boolean, lock: () => Promise<void>) {
    let anchored = false;
    return {
      select: () => ({ from: (table: unknown) => {
        let condition: SQL | undefined;
        let maximum = Infinity;
        const query: MockQuery = {
          where: (sql: SQL) => { condition = sql; return query; },
          leftJoin: () => query,
          orderBy: () => query,
          limit: (n: number) => { maximum = n; return query; },
          for: async (mode: string) => {
            expect(mode).toBe("update");
            expect(inTx).toBe(true);
            if (table === estabelecimentos) {
              await lock(); anchored = true; events.push("anchor");
            } else {
              expect(anchored).toBe(true); events.push("lookup");
            }
            return rows(table).filter((row) => matches(condition, row)).slice(0, maximum).map((row) => ({ ...row }));
          },
          then: (resolve, reject) =>
            Promise.resolve(rows(table).filter((row) => matches(condition, row)).slice(0, maximum).map((row) => ({ ...row }))).then(resolve, reject),
        };
        return query;
      } }),
      insert: (table: unknown) => ({ values: async (data: Record<string, unknown>) => {
        if (table === filaEnvioXmlPortal) {
          expect(inTx && anchored).toBe(true); events.push("insert");
          const id = nextId++;
          fila.push({ ...data, id, tentativas: 0 });
          return [{ insertId: id, affectedRows: 1 }];
        }
        writes.push({ table, values: data });
        return [{ insertId: 999, affectedRows: 1 }];
      } }),
      update: (table: unknown) => ({ set: (data: Record<string, unknown>) => ({ where: async (condition: SQL) => {
        nextMutation?.(); nextMutation = undefined;
        let affectedRows = 0;
        for (const row of rows(table)) {
          if (matches(condition, row)) { Object.assign(row, data); affectedRows++; }
        }
        writes.push({ table, values: data });
        return [{ affectedRows }];
      } }) }),
      delete: (table: unknown) => ({ where: async (condition: SQL) => {
        nextMutation?.(); nextMutation = undefined;
        const collection = rows(table);
        const removed = collection.filter((row) => matches(condition, row));
        for (const row of removed) collection.splice(collection.indexOf(row), 1);
        return [{ affectedRows: removed.length }];
      } }),
    };
  }
  const db = {
    ...connection(false, async () => { throw new Error("Lock fora da TX"); }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      let release: (() => void) | undefined;
      let before: Row[] = [];
      const lock = async () => {
        const preceding = anchorTail;
        anchorTail = new Promise<void>((resolve) => { release = resolve; });
        await preceding;
        before = fila.map((row) => ({ ...row }));
      };
      try { return await callback(connection(true, lock)); }
      catch (error) { fila.splice(0, fila.length, ...before); throw error; }
      finally { events.push("end"); release?.(); }
    },
  };
  return { db: db as unknown as RpaDb, fila, hospitals, credentials, events, writes,
    beforeMutation: (fn: () => void) => { nextMutation = fn; } };
}

function caller() {
  return rpaRouter.createCaller({
    user: { id: 7, name: "Usuário sintético", role: "admin" }, req: {}, res: {},
  } as TrpcContext);
}
function addLote(state: ReturnType<typeof criarDb>, overrides: Record<string, unknown> = {}) {
  state.fila.push({ ...valores, id: 100, tentativas: 0, estabelecimentoNome: "Hospital sintético",
    convenioNome: "Unimed sintética", valorTotal: "0.00", qtdGuias: 0, ...overrides });
}
function group(results: Array<Record<string, unknown>>) {
  return { estabelecimentoId: 3, convenioId: 10, loginSucesso: true, resultadosLotes: results };
}
function resultado(overrides: Record<string, unknown> = {}) {
  return { filaId: 100, numeroLote: valores.numeroLote, sucesso: false, status: "ERRO_PORTAL", mensagem: "synthetic", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enviar.mockReset();
  mocks.write.mockReset();
  mocks.validarPath.mockReset();
  mocks.permissao.mockReset().mockResolvedValue(true);
  mocks.identificar.mockResolvedValue({
    hashXml: hash, estabelecimentoIdDetectado: 3, convenioIdDetectado: 10,
    numeroLote: valores.numeroLote, conflitoHospital: false, qtdGuias: 0, qtdItens: 0,
    valorTotal: 0, resumoGuias: [], estabelecimentoNomeDetectado: "Hospital sintético",
  });
});

describe("Fila RPA com âncora transacional persistente", () => {
  it("duas conexões concorrentes retornam o mesmo ID; lookup só ocorre após âncora", async () => {
    const state = criarDb();
    const metadados = vi.fn(async () => {});
    const [a, b] = await Promise.all([
      inserirFilaXmlAtomica(state.db, valores, metadados),
      inserirFilaXmlAtomica(state.db, { ...valores, nomeArquivo: "renamed.xml", usuarioUploadId: 8 }, metadados),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.reutilizado, b.reutilizado].sort()).toEqual([false, true]);
    expect(state.fila).toHaveLength(1);
    expect(metadados).toHaveBeenCalledTimes(1);
    expect(state.events).toEqual(["anchor", "lookup", "insert", "end", "anchor", "lookup", "end"]);
  });

  it.each(["ERRO_ROBO", "ERRO_PORTAL", "ERRO_CREDENCIAL", "AGUARDANDO_PORTAL", "PROTOCOLADO"])(
    "reutiliza identidade em %s sem alterar estado ou remover evidência", async (status) => {
      const state = criarDb();
      addLote(state, { statusEsteira: status, comprovanteUrl: "synthetic-evidence" });
      const result = await inserirFilaXmlAtomica(state.db, valores);
      expect(result).toMatchObject({ id: 100, reutilizado: true, statusEsteira: status });
      expect(state.fila).toHaveLength(1);
      expect(state.fila[0].comprovanteUrl).toBe("synthetic-evidence");
    }
  );

  it("mesmo hash em outro hospital/convênio não colide", async () => {
    const state = criarDb();
    const first = await inserirFilaXmlAtomica(state.db, valores);
    const otherHospital = await inserirFilaXmlAtomica(state.db, { ...valores, estabelecimentoId: 5 });
    const otherConvenio = await inserirFilaXmlAtomica(state.db, { ...valores, convenioId: 11 });
    expect(new Set([first.id, otherHospital.id, otherConvenio.id]).size).toBe(3);
  });

  it("dup legado protegido prevalece sobre erro antigo sem apagar nenhuma linha", async () => {
    const state = criarDb();
    addLote(state, { statusEsteira: "ERRO_ROBO" });
    state.fila.push({ ...state.fila[0], id: 101, statusEsteira: "AGUARDANDO_PORTAL" });
    const result = await inserirFilaXmlAtomica(state.db, valores);
    expect(result).toMatchObject({ id: 101, statusEsteira: "AGUARDANDO_PORTAL", reutilizado: true });
    expect(state.fila).toHaveLength(2);
  });

  it("rollback de metadados desfaz INSERT na mesma TX", async () => {
    const state = criarDb();
    await expect(inserirFilaXmlAtomica(state.db, valores, async (tx, id) => {
      expect(tx).not.toBe(state.db); expect(id).toBe(100);
      throw new Error("synthetic metadata failure");
    })).rejects.toThrow("synthetic metadata failure");
    expect(state.fila).toHaveLength(0);
  });

  it("hospital ausente recusa INSERT", async () => {
    const state = criarDb(); state.hospitals.splice(0);
    await expect(inserirFilaXmlAtomica(state.db, valores)).rejects.toThrow(/proprietário não encontrado/);
    expect(state.fila).toHaveLength(0);
  });

  it("router integra TX em retries renomeados sem sobrescrever bytes existentes", async () => {
    const state = criarDb(); mocks.getDb.mockResolvedValue(state.db);
    mocks.write.mockImplementation(() => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); });
    const upload = (nomeArquivo: string) => caller().importarLotesXmlParaFila({
      arquivos: [{ nomeArquivo, conteudoBase64: Buffer.from("synthetic XML").toString("base64") }],
      liberarImediatamente: true,
    });
    const [first, second] = await Promise.all([upload("first.xml"), upload("renamed.xml")]);
    expect(first.importados[0].id).toBe(second.importados[0].id);
    expect(state.fila).toHaveLength(1);
    expect(mocks.write).toHaveBeenCalledWith("synthetic/lote.xml", expect.any(Buffer), { flag: "wx" });
  });
});

describe("Guardas reais de fila e autorização", () => {
  it.each(["AGUARDANDO_PORTAL", "PROCESSANDO_ROBO", "PROTOCOLADO"])(
    "recusa exclusão/liberação/disparo de %s", async (status) => {
      const state = criarDb(); addLote(state, { statusEsteira: status });
      mocks.getDb.mockResolvedValue(state.db);
      await expect(caller().excluirLoteFila({ id: 100 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(caller().liberarLotesParaRobo({ loteIds: [100] })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(caller().dispararCicloEnvioRpa({ loteIds: [100], modoExecucao: "simulacao" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(state.fila[0].statusEsteira).toBe(status);
      expect(state.fila).toHaveLength(1);
      expect(mocks.enviar).not.toHaveBeenCalled();
    }
  );

  it.each(["excluir", "liberar"])("WHERE protege transição concorrente antes de %s", async (action) => {
    const state = criarDb(); addLote(state, { statusEsteira: "IMPORTADO" });
    mocks.getDb.mockResolvedValue(state.db);
    state.beforeMutation(() => { state.fila[0].statusEsteira = "AGUARDANDO_PORTAL"; });
    const pending = action === "excluir" ? caller().excluirLoteFila({ id: 100 }) : caller().liberarLotesParaRobo({ loteIds: [100] });
    await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.fila).toHaveLength(1);
    expect(state.fila[0].statusEsteira).toBe("AGUARDANDO_PORTAL");
  });

  it("permite liberar/importado e exclui somente estado elegível autorizado", async () => {
    const state = criarDb(); addLote(state, { statusEsteira: "IMPORTADO" });
    mocks.getDb.mockResolvedValue(state.db);
    await expect(caller().liberarLotesParaRobo({ loteIds: [100] })).resolves.toMatchObject({ sucesso: true });
    expect(state.fila[0].statusEsteira).toBe("LIBERADO_ENVIO");
    await expect(caller().excluirLoteFila({ id: 100 })).resolves.toEqual({ sucesso: true });
    expect(state.fila).toHaveLength(0);
  });

  it("triagem não expõe metadados do proprietário sem permissão final", async () => {
    const state = criarDb(); mocks.getDb.mockResolvedValue(state.db);
    mocks.permissao.mockResolvedValue(false);
    const result = await caller().analisarXmlTriagem({
      arquivos: [{ nomeArquivo: "synthetic.xml", conteudoBase64: "eA==" }], estabelecimentoIdContexto: 2160001,
    });
    expect(result.resultados[0]).toMatchObject({ valido: false });
    expect(result.resultados[0]).not.toHaveProperty("resumoGuias");
    expect(result.resultados[0]).not.toHaveProperty("estabelecimentoNomeDetectado");
    expect(mocks.permissao).toHaveBeenCalledWith(7, 3, "visualizar");
  });
});

describe("Worker real com adapter exclusivamente mockado", () => {
  const run = () => executarCicloEnvioXmlRpa({ modoExecucao: "producao", estabelecimentosAutorizadosIds: [3] });

  it("adapter throw após claim termina AGUARDANDO, sanitiza exceção e bloqueia novo claim", async () => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockRejectedValue(new Error("synthetic-secret-raw"));
    const first = await run();
    expect(state.fila[0]).toMatchObject({ statusEsteira: "AGUARDANDO_PORTAL", tentativas: 1, protocoloRetorno: null });
    expect(JSON.stringify(first)).not.toContain("synthetic-secret-raw");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("synthetic-secret-raw");
    await run(); expect(mocks.enviar).toHaveBeenCalledTimes(1);
  });

  it.each(["ERRO_ROBO", "ERRO_PORTAL", "ERRO_CREDENCIAL"])("retorno %s sem prova de pré-envio permanece protegido", async (status) => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockResolvedValue(group([resultado({ status })]));
    await run(); expect(state.fila[0].statusEsteira).toBe("AGUARDANDO_PORTAL");
  });

  it("erro comprovadamente pré-envio não fabrica protocolo", async () => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockResolvedValue(group([resultado({ status: "ERRO_ROBO", envioIniciado: false, protocolo: "FAKE" })]));
    const result = await run();
    expect(state.fila[0]).toMatchObject({ statusEsteira: "ERRO_ROBO", protocoloRetorno: null, enviadoEm: null });
    expect(result.detalhesGrupos[0].resultados[0].protocolo).toBeNull();
  });

  it("claim concorrente não chama adapter duas vezes", async () => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockResolvedValue(group([resultado({ status: "AGUARDANDO_PORTAL" })]));
    await Promise.all([run(), run()]);
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
    expect(state.fila[0].statusEsteira).toBe("AGUARDANDO_PORTAL");
  });

  it.each(["omitido", "duplicado", "outro-lote"])("resultado %s não deixa claim preso", async (kind) => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    const results = kind === "omitido" ? [] : kind === "duplicado" ? [resultado(), resultado()] : [resultado({ numeroLote: "WRONG" })];
    mocks.enviar.mockResolvedValue(group(results));
    await run(); expect(state.fila[0].statusEsteira).toBe("AGUARDANDO_PORTAL");
  });

  it("PROTOCOLADO sem confirmação não avança fábrica", async () => {
    const state = criarDb(); addLote(state, { fabricaContaId: 22 }); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockResolvedValue(group([resultado({ status: "PROTOCOLADO", sucesso: true, protocolo: null })]));
    await run();
    expect(state.fila[0]).toMatchObject({ statusEsteira: "AGUARDANDO_PORTAL", protocoloRetorno: null });
    expect(state.writes.every((write) => write.table === filaEnvioXmlPortal || write.table === credenciaisPortais)).toBe(true);
  });

  it("protocolo confirmado em produção mantém o fluxo existente", async () => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.enviar.mockResolvedValue(group([resultado({ status: "PROTOCOLADO", sucesso: true, protocolo: "SYNTHETIC-PROTOCOL" })]));
    const result = await run();
    expect(result.protocolados).toBe(1);
    expect(state.fila[0]).toMatchObject({ statusEsteira: "PROTOCOLADO", protocoloRetorno: "SYNTHETIC-PROTOCOL" });
    expect(state.fila[0].enviadoEm).toBeInstanceOf(Date);
  });

  it("pré-claim inválido não chama adapter nem cria protocolo", async () => {
    const state = criarDb(); addLote(state); mocks.getDb.mockResolvedValue(state.db);
    mocks.validarPath.mockImplementation(() => { throw new Error("synthetic invalid path"); });
    await run();
    expect(state.fila[0].statusEsteira).toBe("ERRO_ROBO");
    expect(state.fila[0].protocoloRetorno).toBeUndefined();
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
