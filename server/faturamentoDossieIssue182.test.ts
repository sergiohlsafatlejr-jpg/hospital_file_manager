import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getDb } from "./db";
import { itensPorGuia } from "./faturamentoUnificadoService";
import { enriquecerCobrancaContratualPorItem } from "./faturamentoDossieIssue182";
import type { BancoContratosPreco, PrecoAplicavel } from "./contratosPrecoAplicavel";

vi.mock("./db", () => ({ getDb: vi.fn(), getRawPool: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
vi.mock("pdf-parse", () => ({ default: vi.fn() }));

function preco(id = 1, extras: Partial<PrecoAplicavel> = {}): PrecoAplicavel {
  return { id, estabelecimentoId: 10, convenioId: 20, codigo: "SYN-X", nome: "Sintético", valor: "100.00",
    tipo: "procedimentos", porte: null, ativo: "sim", vigenciaInicio: new Date("2026-01-01T00:00:00Z"), ...extras };
}
function item(extras: Record<string, unknown> = {}) {
  return { id: 7, estabelecimentoId: 10, convenioId: 20, codigoItem: "SYN-X", dataExecucao: "2026-02-10",
    quantidade: 2, valorFaturado: "200.00", valorUnitario: "100.00", ...extras };
}
function banco(options: { itens?: Record<string, unknown>[]; precos?: PrecoAplicavel[]; falhaPreco?: boolean; falhaItens?: boolean } = {}) {
  const queries: ReturnType<MySqlDialect["sqlToQuery"]>[] = [];
  const dialect = new MySqlDialect();
  const execute = vi.fn(async (_query: SQL) => {
    if (options.falhaItens) throw new Error("falha sintética de itens");
    return [options.itens ?? [], []];
  });
  const select = vi.fn(() => {
    let table = "";
    const chain = {
      from(t: Parameters<typeof getTableName>[0]) { table = getTableName(t); return chain; },
      innerJoin() { return chain; },
      where(q: SQL) { queries.push(dialect.sqlToQuery(q)); return chain; },
      orderBy() { return chain; },
      then(resolve: (rows: PrecoAplicavel[]) => unknown, reject: (e: Error) => unknown) {
        if (options.falhaPreco) return Promise.reject(new Error("SQL privado sintético que não deve sair no retorno")).then(resolve, reject);
        return Promise.resolve(table === "tabelasPreco" ? options.precos ?? [] : []).then(resolve, reject);
      },
    };
    return chain;
  });
  const update = vi.fn(), insert = vi.fn(), remove = vi.fn();
  const db = { execute, select, update, insert, delete: remove } as unknown as BancoContratosPreco;
  vi.mocked(getDb).mockResolvedValue(db);
  return { db, execute, select, update, insert, remove, queries };
}

beforeEach(() => vi.clearAllMocks());

describe("Issue182 — enriquecimento contratual real de itensPorGuia", () => {
  it("consome retorno Array do seletor real e preenche os campos no endpoint, sem alterar dados originais", async () => {
    const origem = item(); const b = banco({ itens: [origem], precos: [preco()] });
    const rows = await itensPorGuia({ estabelecimentoId: 10, numeroGuia: "SYN-GUIA" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valorContratadoTabela: 100, valorContratadoTotal: 200, diferencaContratoXml: 0,
      statusCobrancaContrato: "conforme_contrato", statusAuditoriaContrato: "disponivel", valorFaturado: "200.00" });
    expect(origem).not.toHaveProperty("valorContratadoTabela");
    expect(b.queries[0].params).toEqual(expect.arrayContaining([10, 20, "2026-02-10", "SYN-X"]));
    expect(b.queries[0].sql).toContain("EXISTS");
    expect(b.queries[0].sql).not.toMatch(/CURDATE|NOW\(/);
    expect(b.update).not.toHaveBeenCalled(); expect(b.insert).not.toHaveBeenCalled(); expect(b.remove).not.toHaveBeenCalled();
  });
  it("mantém prioridade hospitalar e não aplica preço futuro/global a item antigo", async () => {
    const b = banco({ precos: [preco(2, { estabelecimentoId: null, valor: "300.00", vigenciaInicio: new Date("2027-01-01") }),
      preco(3, { estabelecimentoId: null, valor: "250.00", vigenciaInicio: new Date("2026-02-01") }), preco()] });
    const rows = await enriquecerCobrancaContratualPorItem(b.db, 10, [item()]);
    expect(rows[0].valorContratadoTabela).toBe(100); expect(rows[0].diferencaContratoXml).toBe(0);
  });
  it("seleciona por convênio e data de cada item, preservando IDs e códigos repetidos legítimos", async () => {
    const b = banco({ precos: [preco(), preco(2, { convenioId: 21, valor: "150.00" }),
      preco(3, { valor: "200.00", vigenciaInicio: new Date("2026-03-01") })] });
    const rows = await enriquecerCobrancaContratualPorItem(b.db, 10, [item(), item({ convenioId: 21 }), item({ dataExecucao: "2026-03-10" }), item()]);
    expect(rows.map(r => r.valorContratadoTabela)).toEqual([100, 150, 200, 100]);
    expect(rows.map(r => r.id)).toEqual([7, 7, 7, 7]); expect(b.select).toHaveBeenCalledTimes(3);
  });
  it("respeita codigoItemTuss quando o código local não tem preço", async () => {
    const b = banco({ precos: [preco()] });
    const rows = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ codigoItem: "LOCAL", codigoItemTuss: "SYN-X" })]);
    expect(rows[0].valorContratadoTabela).toBe(100);
  });
  it.each([undefined, null, "2026-02-30", "2026-02-10T99:00:00Z"])("sem execução válida (%s), não inventa hoje/criação/atendimento", async dataExecucao => {
    const b = banco({ precos: [preco()] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ dataExecucao, createdAt: "2026-02-10", dataAtendimento: "2026-02-10" })]);
    expect(row).toMatchObject({ statusAuditoriaContrato: "indeterminado", statusCobrancaContrato: "indeterminado", valorContratadoTabela: null });
    expect(b.select).not.toHaveBeenCalled();
  });
  it("preserva zeros de quantidade e valor faturado sem substituir por um/unidade", async () => {
    const b = banco({ precos: [preco()] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ quantidade: 0, valorFaturado: 0, valorTotal: 999, valorUnitario: 999 })]);
    expect(row).toMatchObject({ valorContratadoTotal: 0, diferencaContratoXml: 0, statusCobrancaContrato: "conforme_contrato", quantidade: 0, valorFaturado: 0 });
  });
  it("usa o total autoritativo de faturamento, não o valor unitário nem outro valor legado", async () => {
    const b = banco({ precos: [preco()] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ valorFaturado: 0, valorTotal: 999, valorUnitario: 999 })]);
    expect(row).toMatchObject({ diferencaContratoXml: 200, statusCobrancaContrato: "cobranca_menor_contrato" });
  });
  it.each([undefined, null, -1, "NaN", ""])("quantidade incompleta/inválida (%s) não recebe comparação inventada", async quantidade => {
    const b = banco({ precos: [preco()] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ quantidade })]);
    expect(row.valorContratadoTotal).toBeNull(); expect(row.diferencaContratoXml).toBeNull(); expect(row.statusAuditoriaContrato).toBe("indeterminado");
  });
  it("valor faturado ausente não vira preço unitário nem zero cobrado", async () => {
    const b = banco({ precos: [preco()] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ valorFaturado: null })]);
    expect(row.valorContratadoTotal).toBe(200); expect(row.diferencaContratoXml).toBeNull(); expect(row.statusCobrancaContrato).toBe("indeterminado");
  });
  it("calcula centavos com decimal e conserva a tolerância de cinco centavos", async () => {
    const b = banco({ precos: [preco(1, { valor: "0.10" })] });
    const rows = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ quantidade: 3, valorFaturado: "0.30" }),
      item({ quantidade: 3, valorFaturado: "0.25" }), item({ quantidade: 3, valorFaturado: "0.24" }), item({ quantidade: 3, valorFaturado: "0.36" })]);
    expect(rows.map(r => r.diferencaContratoXml)).toEqual([0, 0.05, 0.06, -0.06]);
    expect(rows.map(r => r.statusCobrancaContrato)).toEqual(["conforme_contrato", "conforme_contrato", "cobranca_menor_contrato", "cobranca_maior_contrato"]);
  });
  it("preço zero é válido, distinto de ausência de preço", async () => {
    const b = banco({ precos: [preco(1, { valor: "0.00" })] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item({ valorFaturado: 0 })]);
    expect(row.valorContratadoTabela).toBe(0); expect(row.statusCobrancaContrato).toBe("conforme_contrato");
  });
  it("sem preço elegível não classifica falsamente conforme nem como perda", async () => {
    const b = banco({ precos: [preco(1, { estabelecimentoId: 99 }), preco(2, { convenioId: 99 }), preco(3, { ativo: "nao" })] });
    const [row] = await enriquecerCobrancaContratualPorItem(b.db, 10, [item()]);
    expect(row).toMatchObject({ statusAuditoriaContrato: "disponivel", statusCobrancaContrato: "sem_preco_tabela", valorContratadoTotal: null });
  });
  it("falha SQL do enriquecimento é sanitizada e marcada indisponível sem perder os itens", async () => {
    const b = banco({ itens: [item()], falhaPreco: true });
    const [row] = await itensPorGuia({ estabelecimentoId: 10, numeroGuia: "SYN" });
    expect(row).toMatchObject({ valorFaturado: "200.00", statusAuditoriaContrato: "indisponivel", statusCobrancaContrato: "auditoria_indisponivel", valorContratadoTotal: null });
    expect(JSON.stringify(row)).not.toContain("SQL privado"); expect(b.update).not.toHaveBeenCalled();
  });
  it("lista vazia não consulta preço; falha da leitura original não é engolida", async () => {
    const b = banco(); expect(await itensPorGuia({ estabelecimentoId: 10 })).toEqual([]); expect(b.select).not.toHaveBeenCalled();
    banco({ falhaItens: true }); await expect(itensPorGuia({ estabelecimentoId: 10 })).rejects.toThrow("falha sintética de itens");
  });
});
