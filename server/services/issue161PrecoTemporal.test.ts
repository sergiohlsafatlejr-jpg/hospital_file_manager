import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  contasConvenioItens, contasConvenioResumo, convenios, convenioMapeamento,
  tabelasPreco, padroesCobranca, padraoPrecoConvenio, padraoQuantidadeItem,
  padraoGlosaConvenio, vinculacaoCodigos, regrasNegocio, itensRegraNegocio,
} from "../../drizzle/schema";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/logger", () => ({ logger: { warn: mocks.warn, info: mocks.info, error: vi.fn() } }));
import { compararItensComPadroes, executarComparacaoESalvar, resolverConvenioIdParaConta } from "./comparadorPadroes";
import { carregarContextoRegrasConvenioAmbulatorial, validarGuiaAmbulatorial } from "./esteiraAmbulatorialService";

const hospital = 101;
const convenioId = 77;
const convenio = { id: convenioId, nome: "OPERADORA TESTE", estabelecimentoId: hospital, ativo: "sim" };
const dialect = new MySqlDialect();
function preco(id: number, inicio: string, valor: number, estabelecimentoId: number | null = hospital, extra = {}) {
  return { id, convenioId, estabelecimentoId, codigo: "40304361", nome: "Item sintético", valor: String(valor),
    tipo: "procedimentos", procedimentoFonte: "dados_completo", porte: null, ativo: "sim", vigenciaInicio: new Date(`${inicio}T00:00:00Z`), ...extra };
}
function item(dataExecucao: string | null | undefined, valor = 999) {
  return { id: 1, convenio: convenio.nome, convenioId, codigoItem: "40304361", codigoItemTuss: "40304361", descricaoItem: "Item sintético", tipoItem: "PROCEDIMENTO",
    quantidade: "1", valorUnitario: String(valor), valorTotal: String(valor), setor: "AMBULATÓRIO", dataExecucao };
}
function criarBanco(overrides = new Map<unknown, unknown>(), falha?: unknown) {
  const rows = new Map<unknown, unknown>([[convenios, [convenio]], [convenioMapeamento, []], ...overrides]);
  const where = vi.fn(async (table: unknown, _condition: unknown) => {
    if (table === falha) throw new Error("senha=segredo paciente=SINTETICO sql=SELECT_PRIVADO");
    return rows.get(table) ?? [];
  });
  const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const insertValues = vi.fn(async () => undefined);
  const db = {
    select: vi.fn(() => ({ from: (table: unknown) => ({ where: (condition: unknown) => where(table, condition) }) })),
    update: vi.fn(() => ({ set })), insert: vi.fn(() => ({ values: insertValues })),
  };
  return { db, where, set, insertValues };
}
function comparar(db: unknown, itens = [item("2026-06-15")]) {
  return compararItensComPadroes({ numeroConta: "CONTA-SINTETICA", estabelecimentoId: hospital, convenio: convenio.nome, itens, banco: db as any });
}
function guia(data = "2026-06-15", valor = 100) {
  return { numeroGuia: "GUIA-SINTETICA", nomePaciente: "Beneficiário sintético", carteiraBeneficiario: "CARTEIRA-SINTETICA",
    senhaAutorizacao: "AUTORIZACAO-SINTETICA", numeroGuiaOperadora: null,
    procedimentos: [{ codigo: "40304361", descricao: "Item sintético", quantidade: 1, valorUnitario: valor, valorTotal: valor,
      dataExecucao: new Date(`${data}T00:00:00Z`), nomeMedico: "Profissional sintético" }], itensPadronizados: [item(data, valor)] };
}
beforeEach(() => vi.clearAllMocks());

describe("Issue161 — convênio canônico e unívoco", () => {
  it("aceita somente nome exato normalizado e não utiliza primeiro token ou substring", async () => {
    const { db } = criarBanco(new Map([[convenios, [
      { ...convenio, nome: "UNIMED GOIANIA" }, { ...convenio, id: 78, nome: "UNIMED CATALAO" },
    ]]]));
    expect(await resolverConvenioIdParaConta(db as any, hospital, "  unimed   goiania  ")).toBe(77);
    expect(await resolverConvenioIdParaConta(db as any, hospital, "UNIMED")).toBeNull();
    expect(await resolverConvenioIdParaConta(db as any, hospital, "UNIMED GOIANIA PLUS", "001")).toBeNull();
  });
  it.each([false, true])("bloqueia nomes duplicados independentemente da ordem (%s)", async reverso => {
    const duplicados = [convenio, { ...convenio, id: 78, estabelecimentoId: null }];
    const { db } = criarBanco(new Map([[convenios, reverso ? duplicados.reverse() : duplicados]]));
    expect(await resolverConvenioIdParaConta(db as any, hospital, convenio.nome)).toBeNull();
    await expect(compararItensComPadroes({ numeroConta: "CONTA-SINTETICA", estabelecimentoId: hospital, convenio: convenio.nome,
      itens: [{ ...item("2026-06-15"), convenioId: null }], banco: db as any })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("valida ID explícito e rejeita inativo, central ou outro hospital", async () => {
    const { db } = criarBanco(new Map([[convenios, [convenio, { ...convenio, id: 78, estabelecimentoId: 202 },
      { ...convenio, id: 79, estabelecimentoId: 2160001 }, { ...convenio, id: 80, ativo: "nao" }]]]));
    expect(await resolverConvenioIdParaConta(db as any, hospital, null, undefined, 77)).toBe(77);
    for (const id of [78, 79, 80, 999, 1.5, -1]) expect(await resolverConvenioIdParaConta(db as any, hospital, convenio.nome, undefined, id)).toBeNull();
  });
  it("não permite de-para conflitante nem referência inválida", async () => {
    for (const id of [78, 999]) {
      const { db } = criarBanco(new Map([[convenios, [convenio, { ...convenio, id: 78, nome: "OUTRA OPERADORA" }]],
        [convenioMapeamento, [{ convenioId: id, nomeOrigem: convenio.nome }]]]));
      expect(await resolverConvenioIdParaConta(db as any, hospital, convenio.nome)).toBeNull();
    }
  });
  it("ID canônico válido permite nome ausente e usa nome cadastral nas regras aprendidas", async () => {
    const { db, where } = criarBanco();
    for (const nome of [null, "ALIAS EXTERNO", "OUTRA OPERADORA"]) {
      await compararItensComPadroes({ numeroConta: "CONTA-SINTETICA", estabelecimentoId: hospital, convenio: nome,
        itens: [item("2026-06-15")], banco: db as any });
    }
    const filtros = where.mock.calls.filter(([table]) => table === padraoPrecoConvenio);
    expect(filtros).toHaveLength(3);
    for (const [, condition] of filtros) expect(dialect.sqlToQuery(condition as any).params).toContain(convenio.nome);
  });
  it("bloqueia itens com identidades de convênio diferentes", async () => {
    const { db } = criarBanco();
    await expect(comparar(db, [item("2026-06-15"), { ...item("2026-06-15"), convenioId: 78 }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.update).not.toHaveBeenCalled();
  });
  it("não escolhe gabarito de outro convênio, mesmo quando manual", async () => {
    const gab = { id: 90, estabelecimentoId: hospital, convenioId: 78, isGabarito: 1, status: "ativo", codigoProcedimentoPrincipal: "40304361",
      descricaoProcedimentoPrincipal: "Sintético", setor: null, itensAssociados: [{ codigo: "FALTANTE", descricao: "Sintético", frequencia: 100 }] };
    const { db } = criarBanco(new Map([[padroesCobranca, [gab]]]));
    const resultado = await comparar(db);
    expect(resultado.gabaritosUsados).toBe(0);
    expect(resultado.divergencias).toEqual([]);
  });
});

describe("Issue161 — data do item e precedência contratual", () => {
  it("analisa versões anterior, vigente e futura por cada item, sem usar a primeira data da conta", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100), preco(2, "2026-07-01", 200), preco(3, "2027-01-01", 300)]]]));
    const resultado = await comparar(db, [item("2026-06-30"), item("2026-07-01"), item("2026-12-31")]);
    expect(resultado.divergencias.filter(d => d.tipo === "PRECO").map(d => [d.padraoId, d.valorEsperado])).toEqual([[1, "100.00"], [2, "200.00"], [2, "200.00"]]);
  });
  it.each([false, true])("hospital > global; vigência mais recente > ID maior no empate; ordem irrelevante (%s)", async reverso => {
    const precos = [preco(1, "2025-01-01", 100), preco(5, "2026-01-01", 150), preco(6, "2026-01-01", 160, hospital, { procedimentoFonte: null }),
      preco(100, "2026-06-01", 900, null), preco(101, "2027-01-01", 999), preco(200, "2026-01-01", 888, 202), preco(201, "2026-01-01", 777, 2160001)];
    const { db, where } = criarBanco(new Map([[tabelasPreco, reverso ? precos.reverse() : precos]]));
    const resultado = await comparar(db);
    expect(resultado.divergencias[0]).toMatchObject({ padraoId: 6, valorEsperado: "160.00" });
    const consulta = dialect.sqlToQuery(where.mock.calls.find(([table]) => table === tabelasPreco)![1] as any);
    expect(consulta.params).not.toContain(2160001);
  });
  it("usa global vigente quando a única versão hospitalar é futura", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100, null), preco(2, "2027-01-01", 200)]]]));
    expect((await comparar(db)).divergencias[0]).toMatchObject({ padraoId: 1, valorEsperado: "100.00" });
  });
  it("não aplica preço futuro nem vigência inválida antes da execução", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2027-01-01", 100), { ...preco(2, "2025-01-01", 200), vigenciaInicio: null }]]]));
    expect((await comparar(db)).divergencias.filter(d => d.tipo === "PRECO")).toEqual([]);
  });
  it("vigência civil impossível não é ajustada automaticamente para outro dia", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [{ ...preco(1, "2025-01-01", 100), vigenciaInicio: "2026-02-30" }]]]));
    const resultado = await comparar(db, [item("2026-03-02")]);
    expect(resultado.divergencias.filter(d => d.tipo === "PRECO")).toEqual([]);
  });
  it.each([null, undefined, "15/06/2026", "2026-02-30"])("data ausente/inválida não aplica preço atual nem persiste liberação (%s)", async data => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100)]], [contasConvenioItens, [item(data, 100)]]]));
    expect((await comparar(db, [item(data, 100)])).statusGeral).toBe("incompleta");
    const resultado = await executarComparacaoESalvar("CONTA-SINTETICA", hospital, { banco: db as any });
    expect(resultado.statusGeral).toBe("incompleta");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("preserva TUSS, normalização, de-para e tipos ao selecionar versão temporal", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100), preco(2, "2027-01-01", 500)]],
      [vinculacaoCodigos, [{ codigoHospital: "INTERNO", codigoConvenio: "40304361", convenioId }]]]));
    const resultado = await comparar(db, [{ ...item("2026-06-15"), codigoItem: "X", codigoItemTuss: "040304361" },
      { ...item("2026-06-15"), codigoItem: "INTERNO", codigoItemTuss: null }]);
    expect(resultado.divergencias.map(d => [d.padraoId, d.detalhes?.origemCodigo])).toEqual([[1, "TUSS"], [1, "VINCULO"]]);
  });
});

describe("Issue161 — serviço ambulatorial fechado e conexão transacional", () => {
  it("reutiliza contexto com versões para guias em datas diferentes", async () => {
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100), preco(2, "2026-07-01", 200), preco(3, "2027-01-01", 300)]]]));
    const contexto = await carregarContextoRegrasConvenioAmbulatorial(db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome });
    expect(contexto.mapaPrecosPorCodigo.get("40304361")).toHaveLength(3);
    expect((await validarGuiaAmbulatorial(db, contexto, guia("2026-06-30", 100))).statusAuditoriaRegras).toBe("conforme");
    expect((await validarGuiaAmbulatorial(db, contexto, guia("2026-07-01", 200))).statusAuditoriaRegras).toBe("conforme");
    const resultado = await validarGuiaAmbulatorial(db, contexto, guia("2026-07-01", 100));
    expect(resultado.statusAuditoriaRegras).toBe("divergente");
    expect(resultado.erros.find(e => e.camada === "TABELA_PRECO")?.valorEsperado).toBe("R$ 200.00");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each([convenios, tabelasPreco, regrasNegocio, itensRegraNegocio])("falha ao carregar uma dependência aborta sem erro bruto (%s)", async tabela => {
    const { db } = criarBanco(new Map([[regrasNegocio, [{ id: 1, nome: "Regra sintética" }]]]), tabela);
    await expect(carregarContextoRegrasConvenioAmbulatorial(db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a validação ambulatorial. Nenhuma guia foi liberada.", cause: undefined,
    });
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it.each([padraoPrecoConvenio, padraoQuantidadeItem, padraoGlosaConvenio, padroesCobranca, tabelasPreco, vinculacaoCodigos])("falha do comparador não produz conforme ou liberação (%s)", async tabela => {
    const base = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100)]]]));
    const contexto = await carregarContextoRegrasConvenioAmbulatorial(base.db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome });
    const { db } = criarBanco(new Map([[tabelasPreco, [preco(1, "2025-01-01", 100)]]]), tabela);
    await expect(validarGuiaAmbulatorial(db, contexto, guia())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("gabarito malformado é falha de validação, não conjunto vazio conforme", async () => {
    const gab = { id: 90, estabelecimentoId: hospital, convenioId, isGabarito: 1, status: "ativo",
      codigoProcedimentoPrincipal: "40304361", descricaoProcedimentoPrincipal: "Sintético", setor: null, itensAssociados: "{invalido" };
    const { db } = criarBanco(new Map([[padroesCobranca, [gab]]]));
    const contexto = await carregarContextoRegrasConvenioAmbulatorial(db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome });
    await expect(validarGuiaAmbulatorial(db, contexto, guia())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: undefined });
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it("resultado explicitamente incompleto do comparador aborta em vez de liberar guia", async () => {
    const { db } = criarBanco();
    const contexto = await carregarContextoRegrasConvenioAmbulatorial(db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome });
    await expect(validarGuiaAmbulatorial(db, contexto, { ...guia(), itensPadronizados: [] })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it("rejeição propaga ao chamador transacional e nenhuma liberação é guardada", async () => {
    const { db } = criarBanco();
    const contexto = await carregarContextoRegrasConvenioAmbulatorial(db, { hospitalEstabId: hospital, convenioId, convenioNome: convenio.nome });
    const quebrado = criarBanco(new Map(), padroesCobranca).db;
    const liberacoes: unknown[] = [];
    const rollback = vi.fn();
    const transaction = async (callback: (tx: unknown) => Promise<void>) => {
      try { await callback(quebrado); } catch (erro) { liberacoes.splice(0); rollback(); throw erro; }
    };
    await expect(transaction(async tx => {
      liberacoes.push("importação intermediária sintética");
      const validacao = await validarGuiaAmbulatorial(tx, contexto, guia());
      liberacoes.push(validacao.statusAuditoriaRegras);
    })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(rollback).toHaveBeenCalledOnce();
    expect(liberacoes).toEqual([]);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("persistência preserva conexão e snapshot XML completo", async () => {
    const { db, where } = criarBanco(new Map([[contasConvenioItens, [item("2026-06-15", 100)]], [tabelasPreco, [preco(1, "2025-01-01", 100)]]]));
    const predicates: unknown[] = [];
    db.update.mockImplementation((() => ({ set: () => ({ where: async (condition: unknown) => { predicates.push(condition); } }) })) as any);
    await executarComparacaoESalvar("CONTA-SINTETICA", hospital, { banco: db as any, escopoContextoMedico: {
      estabelecimentoId: hospital, convenioId, numeroConta: "CONTA-SINTETICA", arquivoHospitalId: 555, numeroLote: "LOTE-SINTETICO", competencia: "2026/06",
    } });
    const resumo = dialect.sqlToQuery(predicates.at(-1) as any);
    expect(resumo.params).toEqual(["CONTA-SINTETICA", hospital, "XML", 555, convenioId, "LOTE-SINTETICO", "2026/06"]);
    expect(resumo.sql).not.toMatch(/\bOR\b|IS NULL/i);
    expect(where.mock.calls.filter(([table]) => table === contasConvenioItens)).toHaveLength(3);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});
