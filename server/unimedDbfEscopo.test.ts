import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    verificarPermissaoEstabelecimento: vi.fn(),
    getOpcoesExportacaoUnimed: vi.fn(),
    getLinhasExportacaoUnimed: vi.fn(),
  };
});

import { appRouter } from "./routers";
import {
  escopoExportacaoUnimed,
  getLinhasExportacaoUnimed,
  getOpcoesExportacaoUnimed,
  selecionarLinhasUnimedPorUnidade,
  verificarPermissaoEstabelecimento,
} from "./db";

function caller() {
  return appRouter.createCaller({
    user: {
      id: 91, openId: "usuario-teste", email: "test@example.com", name: "Usuário teste",
      loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} }, res: {},
  } as any);
}

const filtros = {
  convenioId: 7,
  estabelecimentoId: 42,
  vigencia: "2026-09-01 00:00:00",
  tipoBeneficiario: "Teste",
};

describe("DBF Unimed: isolamento de estabelecimento", () => {
  beforeEach(() => {
    vi.mocked(verificarPermissaoEstabelecimento).mockReset();
    vi.mocked(getOpcoesExportacaoUnimed).mockReset();
    vi.mocked(getLinhasExportacaoUnimed).mockReset();
  });

  it("aplica convênio, procedimentos ativos, unidade e tabelas globais ao SQL do exportador", () => {
    const { sql, params } = new MySqlDialect().sqlToQuery(escopoExportacaoUnimed(7, 42)!);
    expect(params).toEqual([7, "procedimentos", "sim", 42]);
    expect(sql).toContain("`convenioId`");
    expect(sql).toMatch(/`estabelecimentoId`\s*=\s*\?\s+or\s+`tabelasPreco`\.`estabelecimentoId`\s+is null/i);
  });

  it("prioriza preço próprio sobre o global sem exportar dois códigos iguais", () => {
    const rows = [
      { codigo: "002", estabelecimentoId: null, valor: "1.00" },
      { codigo: "002", estabelecimentoId: 42, valor: "2.00" },
      { codigo: "001", estabelecimentoId: null, valor: "3.00" },
    ];
    expect(selecionarLinhasUnimedPorUnidade(rows, 42)).toEqual([
      rows[2], rows[1],
    ]);
    expect(selecionarLinhasUnimedPorUnidade([...rows].reverse(), 42)).toEqual([
      rows[2], rows[1],
    ]);
  });

  it("falha fechado para colisões no mesmo escopo ou linhas de outra unidade", () => {
    expect(() => selecionarLinhasUnimedPorUnidade([
      { codigo: "001", estabelecimentoId: 42 }, { codigo: "001", estabelecimentoId: 42 },
    ], 42)).toThrow(/repetidos/);
    expect(() => selecionarLinhasUnimedPorUnidade([
      { codigo: "001", estabelecimentoId: 51 },
    ], 42)).toThrow(/outra unidade/);
  });

  it("exige unidade explícita também para listar as opções", async () => {
    await expect(caller().tabelasPreco.exportarUnimedOpcoes({ convenioId: 7 } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getOpcoesExportacaoUnimed).not.toHaveBeenCalled();
  });

  it("nega acesso a outra unidade antes de buscar filtros e antes de gerar DBF", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().tabelasPreco.exportarUnimedOpcoes({ convenioId: 7, estabelecimentoId: 42 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().tabelasPreco.exportarUnimedDbf(filtros))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getOpcoesExportacaoUnimed).not.toHaveBeenCalled();
    expect(getLinhasExportacaoUnimed).not.toHaveBeenCalled();
  });

  it("não exporta linhas sem unidade nem com data sem horário", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    await expect(caller().tabelasPreco.exportarUnimedDbf({ ...filtros, estabelecimentoId: undefined } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().tabelasPreco.exportarUnimedDbf({ ...filtros, vigencia: "2026-09-01" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getLinhasExportacaoUnimed).not.toHaveBeenCalled();
  });

  it("consulta apenas a unidade autorizada com a vigência completa da #29", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(getOpcoesExportacaoUnimed).mockResolvedValue({
      vigencias: [filtros.vigencia], tiposBeneficiarios: [filtros.tipoBeneficiario],
    });
    vi.mocked(getLinhasExportacaoUnimed).mockResolvedValue([]);
    await expect(caller().tabelasPreco.exportarUnimedOpcoes({ convenioId: 7, estabelecimentoId: 42 }))
      .resolves.toMatchObject({ vigencias: [filtros.vigencia] });
    await expect(caller().tabelasPreco.exportarUnimedDbf(filtros))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getOpcoesExportacaoUnimed).toHaveBeenCalledWith(7, 42);
    expect(getLinhasExportacaoUnimed).toHaveBeenCalledWith(filtros);
  });
});
