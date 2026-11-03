import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  buscarPrecosAplicaveis, normalizarDataExecucao, selecionarPrecosAplicaveis,
  validarDataReferenciaIso, type BancoContratosPreco, type PrecoAplicavel,
} from "./contratosPrecoAplicavel";
import { obterContextoContratualParaGlosa } from "./contratosConveniosPdfService";
import {
  gerarJustificativasIA, gerarJustificativasIADemonstrativo,
  itensConciliadosPorGuia, itensGlosadosDetalheGuia,
} from "./faturamentoUnificadoService";

vi.mock("./db", () => ({ getDb: vi.fn(), getRawPool: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
vi.mock("pdf-parse", () => ({ default: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

const params = { estabelecimentoId: 7, convenioId: 8, codigos: ["X", "Y"], dataReferencia: "2026-02-28" };
function preco(id: number, extra: Partial<PrecoAplicavel> = {}): PrecoAplicavel {
  return { id, convenioId: 8, estabelecimentoId: 7, codigo: "X", nome: "Sintético",
    valor: "100.00", tipo: "procedimentos", porte: null, ativo: "sim",
    vigenciaInicio: new Date("2026-01-01T00:00:00Z"), ...extra };
}
const contrato = { id: 12, convenioId: 8, convenioNome: "Sintético", numeroContrato: "SYN",
  status: "renovado", dataInicio: new Date("2026-02-01T00:00:00Z"), dataFim: new Date("2026-02-28T00:00:00Z"),
  reajusteProposto: null, observacoes: null };

/** Mock exclusivo: nenhum driver abre conexão ou acessa env. */
function bancoSintetico(options: { precos?: PrecoAplicavel[]; itens?: object[]; documentos?: object[]; falha?: string; convenios?: { id: number }[] } = {}) {
  const filtros: Array<{ tabela: string; query: ReturnType<MySqlDialect["sqlToQuery"]> }> = [];
  const selecoes: Array<Record<string, unknown> | undefined> = [];
  const dialect = new MySqlDialect();
  const execute = vi.fn().mockResolvedValue([options.itens ?? [], []]);
  const select = vi.fn((campos?: Record<string, unknown>) => {
    selecoes.push(campos);
    let tabela = "";
    const chain = {
      from(table: Parameters<typeof getTableName>[0]) { tabela = getTableName(table); return chain; },
      innerJoin() { return chain; },
      where(filtro: SQL) { filtros.push({ tabela, query: dialect.sqlToQuery(filtro) }); return chain; },
      orderBy() { return chain; },
      then(resolve: (rows: object[]) => unknown, reject: (err: Error) => unknown) {
        if (options.falha === tabela) return Promise.reject(new Error("SQL sintético indisponível")).then(resolve, reject);
        const rows = tabela === "tabelasPreco" ? options.precos ?? [] :
          tabela === "convenios" ? options.convenios ?? [{ id: 8 }] :
          tabela === "contratos_convenios" ? [contrato] :
          tabela === "contratos_convenios_documentos" ? options.documentos ?? [] : [];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  });
  const db = { select, execute } as unknown as BancoContratosPreco;
  vi.mocked(getDb).mockResolvedValue(db);
  return { db, select, execute, filtros, selecoes };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: '{"justificativas":[]}' } }] } as Awaited<ReturnType<typeof invokeLLM>>);
});

describe("preço aplicável — seleção e SQL", () => {
  it("não aplica preços futuros ou inativos, outro hospital ou outro convênio", () => {
    expect(selecionarPrecosAplicaveis([
      preco(1), preco(2, { vigenciaInicio: new Date("2026-03-01T00:00:00Z") }),
      preco(3, { convenioId: 9 }), preco(4, { estabelecimentoId: 99 }), preco(5, { ativo: "nao" }),
    ], params).map(p => p.id)).toEqual([1]);
  });
  it("prioriza unidade específica sobre global mesmo quando global é mais recente", () => {
    expect(selecionarPrecosAplicaveis([
      preco(1), preco(2, { estabelecimentoId: null, vigenciaInicio: new Date("2026-02-28T23:59:59Z") }),
      preco(3, { codigo: "Y", estabelecimentoId: null }),
    ], params).map(p => p.id)).toEqual([1, 3]);
  });
  it("escolhe início mais recente e maior ID no empate, independentemente da ordem", () => {
    const rows = [preco(1), preco(9, { vigenciaInicio: new Date("2026-02-01T00:00:00Z") }),
      preco(10, { vigenciaInicio: new Date("2026-02-01T00:00:00Z") })];
    expect(selecionarPrecosAplicaveis(rows, params)[0].id).toBe(10);
    expect(selecionarPrecosAplicaveis([...rows].reverse(), params)[0].id).toBe(10);
  });
  it("inclui todo o dia inicial e não corta versões antes da deduplicação", async () => {
    const { db, filtros } = bancoSintetico({ precos: [
      ...Array.from({ length: 35 }, (_, n) => preco(n + 1)),
      preco(40, { codigo: "Y", vigenciaInicio: new Date("2026-02-28T23:59:59Z") }),
    ] });
    expect((await buscarPrecosAplicaveis(db, params)).map(p => p.codigo)).toEqual(["Y", "X"]);
    const filtro = filtros[0].query;
    expect(filtro.sql).toContain("DATE(`tabelasPreco`.`vigenciaInicio`) <= ?");
    expect(filtro.sql).toContain("EXISTS");
    expect(filtro.sql).toContain("`contratos_convenios`.`dataInicio` <= ?");
    expect(filtro.sql).toContain("`contratos_convenios`.`dataFim` >= ?");
    expect(filtro.sql).toContain("'ativo', 'vencendo', 'renovado'");
    expect(filtro.sql).not.toMatch(/LIMIT|CURDATE|NOW\(/i);
    expect(filtro.params).toContain("2026-02-28");
  });
  it("valida calendário real sem mudar contratos backend para data pt-BR", () => {
    expect(validarDataReferenciaIso("2024-02-29")).toBe("2024-02-29");
    for (const valor of ["2026-02-29", "2026-04-31", "28/02/2026", "2026-02-28' OR 1=1"]) {
      expect(() => validarDataReferenciaIso(valor)).toThrow();
    }
    expect(normalizarDataExecucao("2026-02-28 10:20:00")).toBe("2026-02-28");
    expect(normalizarDataExecucao("28/02/2026")).toBeUndefined();
    expect(normalizarDataExecucao("2026-02-28T99:99:99Z")).toBeUndefined();
    expect(normalizarDataExecucao("2026-02-28T24:00:00Z")).toBeUndefined();
    expect(() => validarDataReferenciaIso("0000-01-01")).toThrow();
  });
});

describe("contexto contratual integrado", () => {
  it("usa data histórica inclusiva e a coluna real acaoInconsistencia", async () => {
    const { filtros, selecoes } = bancoSintetico({ precos: [preco(1)] });
    const resultado = await obterContextoContratualParaGlosa({ ...params, codigosProcedimento: ["X"] });
    expect(resultado.possuiContratoAtivo).toBe(true);
    expect(resultado.statusContexto).toBe("disponivel");
    expect(resultado.dataReferencia).toBe("2026-02-28");
    expect(resultado.resumoPrompt).toContain("28/02/2026");
    expect(resultado.itensTabelaNegociada[0].valorContratado).toBe("100.00");
    expect(selecoes.find(s => s?.acoes)?.acoes).toHaveProperty("name", "acaoInconsistencia");
    const contratosSql = filtros.find(f => f.tabela === "contratos_convenios")!.query;
    expect(contratosSql.sql).toContain("`contratos_convenios`.`dataInicio` <= ?");
    expect(contratosSql.sql).toContain("`contratos_convenios`.`dataFim` >= ?");
    expect(contratosSql.params).toEqual(expect.arrayContaining([7, 8, "ativo", "vencendo", "renovado", "2026-02-28"]));
  });
  it("não cai para outro convênio quando o informado não existe/está inativo", async () => {
    const { select, filtros } = bancoSintetico({ convenios: [] });
    const resultado = await obterContextoContratualParaGlosa({ ...params, convenioId: 99, convenioNome: "Outro sintético" });
    expect(resultado.contratos).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(filtros[0].query.params).toEqual([99, "sim", 7]);
  });
  it("não escolhe convênio arbitrário quando nome exato é ambíguo", async () => {
    const { select } = bancoSintetico({ convenios: [{ id: 8 }, { id: 9 }] });
    const resultado = await obterContextoContratualParaGlosa({ estabelecimentoId: 7, convenioNome: "Duplicado", dataReferencia: params.dataReferencia });
    expect(resultado.statusContexto).toBe("indeterminado");
    expect(select).toHaveBeenCalledTimes(1);
  });
  it("sem data, marca indeterminado sem consultas ou cláusulas de hoje", async () => {
    const { select } = bancoSintetico();
    const resultado = await obterContextoContratualParaGlosa({ estabelecimentoId: 7, convenioId: 8 });
    expect(resultado.statusContexto).toBe("indeterminado");
    expect(resultado.contratos).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
  it.each(["convenios", "contratos_convenios", "contratos_convenios_documentos", "tabelasPreco", "regrasNegocio"])("falha SQL em %s não vira contexto vazio", async tabela => {
    bancoSintetico({ falha: tabela });
    await expect(obterContextoContratualParaGlosa({ ...params, codigosProcedimento: ["X"] }))
      .rejects.toMatchObject({ code: "CONTEXTO_CONTRATUAL_INDISPONIVEL" });
  });
  it("PDF com JSON corrompido declara contexto incompleto", async () => {
    bancoSintetico({ documentos: [{ id: 1, contratoId: 12, pontosImportantes: "{ inválido" }] });
    await expect(obterContextoContratualParaGlosa(params))
      .rejects.toMatchObject({ code: "CONTEXTO_CONTRATUAL_INDISPONIVEL" });
  });
  it("banco indisponível não significa ausência de contrato", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(obterContextoContratualParaGlosa(params))
      .rejects.toMatchObject({ code: "CONTEXTO_CONTRATUAL_INDISPONIVEL" });
  });
});

describe("fulfillment por item e proteção dos callers IA", () => {
  it.each([
    ["conciliados", itensConciliadosPorGuia], ["glosados", itensGlosadosDetalheGuia],
  ] as const)("enriquece o fluxo %s por convênio e execução de cada item", async (_nome, fluxo) => {
    const { filtros } = bancoSintetico({ precos: [preco(1), preco(2, { convenioId: 9, valor: "200.00" }),
      preco(3, { vigenciaInicio: new Date("2026-03-01T00:00:00Z"), valor: "300.00" })], itens: [
      { id: 1, convenioId: 8, codigoItem: "X", dataExecucao: "2026-02-28", quantidade: 1, valorPago: 0, valorGlosa: 100 },
      { id: 2, convenioId: 9, codigoItem: "X", dataExecucao: "2026-02-28", quantidade: 1, valorPago: 0, valorGlosa: 200 },
      { id: 3, convenioId: 8, codigoItem: "X", dataExecucao: "2026-03-01", quantidade: 1, valorPago: 0, valorGlosa: 300 },
    ] });
    const resultado = await fluxo({ estabelecimentoId: 7, numeroGuia: "SYN" });
    expect(resultado.map(r => r.valorContratadoTabela)).toEqual([100, 200, 300]);
    expect(filtros).toHaveLength(3);
  });
  it("declara indisponibilidade da auditoria sem inventar preço ou alterar finanças", async () => {
    bancoSintetico({ falha: "tabelasPreco", itens: [{ convenioId: 8, codigoItem: "X", dataExecucao: "2026-02-28", valorPago: 10 }] });
    const resultado = await itensConciliadosPorGuia({ estabelecimentoId: 7, numeroGuia: "SYN" });
    expect(resultado[0]).toMatchObject({ statusAuditoriaContrato: "indisponivel", valorPago: 10 });
    expect(resultado[0].valorContratadoTabela).toBeUndefined();
  });
  it("data ausente e preço ausente não recebem classificação contratual", async () => {
    bancoSintetico({ itens: [{ id: 1, convenioId: 8, codigoItem: "X", valorPago: 10 }] });
    const resultado = await itensConciliadosPorGuia({ estabelecimentoId: 7, numeroGuia: "SYN" });
    expect(resultado[0].statusAuditoriaContrato).toBe("indeterminado");
    expect(resultado[0].classificacaoAuditoriaContrato).toBeUndefined();
  });
  it("caller IA normal não usa getExternalPool e bloqueia IA na falha contextual", async () => {
    bancoSintetico({ falha: "regrasNegocio" });
    await expect(gerarJustificativasIA({ estabelecimentoId: 7, convenioId: 8,
      itens: [{ id: 1, codigoItem: "X", descricaoItem: "Sintético", dataExecucao: "2026-02-28" }] }))
      .rejects.toMatchObject({ code: "CONTEXTO_CONTRATUAL_INDISPONIVEL" });
    expect(invokeLLM).not.toHaveBeenCalled();
  });
  it("caller IA demonstrativo bloqueia IA e escritas na falha SQL", async () => {
    const { execute } = bancoSintetico({ falha: "tabelasPreco", itens: [
      { id: 1, item: "X", convenioId: 8, dataExecucao: "2026-02-28", valor_glosa: 100 },
    ] });
    await expect(gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [1] }))
      .rejects.toMatchObject({ code: "CONTEXTO_CONTRATUAL_INDISPONIVEL" });
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("falha de leitura do dicionário também bloqueia IA com erro de negócio", async () => {
    const { execute } = bancoSintetico();
    execute.mockRejectedValueOnce(new Error("SQL sintético"));
    await expect(gerarJustificativasIA({ estabelecimentoId: 7,
      itens: [{ id: 1, codigoItem: "X", descricaoItem: "Sintético", codigoGlosa: "100" }] }))
      .rejects.toThrow("Contexto de negócio indisponível");
    expect(invokeLLM).not.toHaveBeenCalled();
  });
  it("preserva PR156: seleção vazia não acessa banco e IDs externos da IA nunca são gravados", async () => {
    const { execute } = bancoSintetico({ itens: [{ id: 1, item: "X", valor_glosa: 10 }] });
    await expect(gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [] }))
      .resolves.toEqual({ justificativas: [] });
    expect(execute).not.toHaveBeenCalled();
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ justificativas: [
      { id: 1, justificativa: "Sintética válida" }, { id: 2, justificativa: "Outra unidade" }, { id: 999, justificativa: "Fora seleção" },
    ] }) } }] } as Awaited<ReturnType<typeof invokeLLM>>);
    const resultado = await gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [1, 2] });
    expect(resultado.justificativas).toEqual([{ id: 1, justificativa: "Sintética válida" }]);
    expect(execute).toHaveBeenCalledTimes(2);
    const update = new MySqlDialect().sqlToQuery(execute.mock.calls[1][0]);
    expect(update.sql).toContain("WHERE estabelecimentoId = 7 AND id = 1");
  });
  it("caller IA normal usa a execução no prompt e não hoje", async () => {
    bancoSintetico({ precos: [preco(1)] });
    await gerarJustificativasIA({ estabelecimentoId: 7, convenioId: 8,
      itens: [{ id: 1, codigoItem: "X", descricaoItem: "Sintético", dataExecucao: "2026-02-28" }] });
    expect(JSON.stringify(vi.mocked(invokeLLM).mock.calls[0][0])).toContain("28/02/2026");
  });
  it.each([
    [{ id: 1, item: "X", convenioId: 8, dataExecucao: "2026-02-28", valor_glosa: 10 }, { id: 2, item: "X", convenioId: 8, dataExecucao: "2026-03-01", valor_glosa: 10 }],
    [{ id: 1, item: "X", convenioId: 8, dataExecucao: "2026-02-28", valor_glosa: 10 }, { id: 2, item: "X", convenioId: 9, dataExecucao: "2026-02-28", valor_glosa: 10 }],
  ])("caller demonstrativo marca indeterminação em datas/convênios múltiplos", async (a, b) => {
    const { select } = bancoSintetico({ itens: [a, b] });
    const resultado = await gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [1, 2] });
    expect(resultado.contextoContratual.statusContexto).toBe("indeterminado");
    expect(select).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(invokeLLM).mock.calls[0][0])).toContain("INDETERMINADA");
  });
});
