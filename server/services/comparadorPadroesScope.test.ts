import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { contasConvenioItens, contasConvenioResumo, convenios } from "../../drizzle/schema";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), where: vi.fn(), select: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { compararContaComPadroes, compararItensComPadroes, executarComparacaoESalvar } from "./comparadorPadroes";
const dialect = new MySqlDialect();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.where.mockResolvedValue([]);
  mocks.select.mockImplementation(() => ({ from: () => ({ where: mocks.where }) }));
  mocks.getDb.mockResolvedValue({ select: mocks.select });
});
describe("comparação usa hospital proprietário concreto", () => {
  it("usa a conexão transacional injetada inclusive na avaliação de padrões", async () => {
    const banco = { select: mocks.select };
    await compararContaComPadroes("CONTA-TESTE", 101, { banco: banco as any, escopoContextoMedico: {
      estabelecimentoId: 101, numeroConta: "CONTA-TESTE", arquivoHospitalId: 55,
      convenioId: 77, numeroLote: "LOTE-TESTE", competencia: "2026/10",
    } });
    expect(mocks.getDb).not.toHaveBeenCalled();
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual(["CONTA-TESTE", 101, "XML", 55, 77, "LOTE-TESTE", "2026/10"]);
  });

  it("não aceita a central como proprietário e não consulta itens globais", async () => {
    await expect(compararContaComPadroes("CONTA-TESTE", 2160001)).rejects.toThrow("hospital de origem");
    expect(mocks.select).not.toHaveBeenCalled();
    await expect(compararItensComPadroes({ numeroConta: "CONTA-TESTE", estabelecimentoId: 2160001, convenio: "CONVENIO-TESTE", itens: [] })).rejects.toThrow("hospital de origem");
  });
  it("o mesmo número em dois hospitais gera consultas separadas por proprietário", async () => {
    await compararContaComPadroes("CONTA-IGUAL", 101);
    await compararContaComPadroes("CONTA-IGUAL", 202);
    const first = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    const second = dialect.sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(first.sql).toContain("estabelecimentoId");
    expect(first.params).toEqual(["CONTA-IGUAL", 101]);
    expect(second.params).toEqual(["CONTA-IGUAL", 202]);
  });
  it("o contexto médico delimita também o snapshot hospitalar e o convênio", async () => {
    await compararContaComPadroes("CONTA-TESTE", 101, {
      escopoContextoMedico: {
        estabelecimentoId: 101, numeroConta: "CONTA-TESTE", arquivoHospitalId: 55,
        convenioId: 77, numeroLote: "LOTE-TESTE", competencia: "2026/10",
      },
    });
    const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual(["CONTA-TESTE", 101, "XML", 55, 77, "LOTE-TESTE", "2026/10"]);
    expect(query.sql).toContain("arquivoId");
    expect(query.sql).toContain("convenioId");
    expect(query.sql).toContain("numeroLote");
    expect(query.sql).toContain("competencia");
  });
  it("bloqueia contexto médico de outro hospital antes de consultar a conta", async () => {
    await expect(compararContaComPadroes("CONTA-TESTE", 101, {
      escopoContextoMedico: {
        estabelecimentoId: 202, numeroConta: "CONTA-TESTE", arquivoHospitalId: 55,
        convenioId: 77, numeroLote: "LOTE-TESTE", competencia: "2026/10",
      },
    })).rejects.toThrow("mesmo hospital e conta");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("persiste o resumo apenas na tupla XML completa, nunca em arquivo nulo", async () => {
    const updates: { table: unknown; condition: unknown }[] = [];
    mocks.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: async (condition: unknown) => {
      mocks.where(condition);
      if (table === convenios) return [{ id: 77, nome: "CONVENIO-TESTE", estabelecimentoId: 101, ativo: "sim" }];
      if (table === contasConvenioItens) return [{ id: 7, codigoItem: "ITEM-TESTE", convenio: "CONVENIO-TESTE", convenioId: 77 }];
      return [];
    } }) }));
    mocks.getDb.mockResolvedValue({
      select: mocks.select,
      update: (table: unknown) => ({ set: () => ({ where: async (condition: unknown) => { updates.push({ table, condition }); } }) }),
      insert: () => ({ values: async () => undefined }),
    });
    await executarComparacaoESalvar("CONTA-TESTE", 101, { escopoContextoMedico: {
      estabelecimentoId: 101, numeroConta: "CONTA-TESTE", arquivoHospitalId: 55, convenioId: 77,
      numeroLote: "LOTE-TESTE", competencia: "2026/10",
    } });
    const resumo = updates.find(item => item.table === contasConvenioResumo);
    expect(resumo).toBeDefined();
    const condition = dialect.sqlToQuery(resumo!.condition as any);
    expect(condition.params).toEqual(["CONTA-TESTE", 101, "XML", 55, 77, "LOTE-TESTE", "2026/10"]);
    expect(condition.sql).not.toMatch(/\bOR\b|IS NULL/i);
    expect(condition.sql).toContain("arquivoHospitalId");
  });
});
