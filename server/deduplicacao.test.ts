import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";

// Mock getDb
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
}));

// Compila também fragmentos SQL aninhados, preservando valores como parâmetros.
const dialect = new MySqlDialect();
function extractQuery(sqlObj: SQL): string {
  return dialect.sqlToQuery(sqlObj).sql;
}

import {
  popularDeXmlTiss,
  itensConciliadosPorGuia,
} from "./faturamentoUnificadoService";

describe("deduplicação na popularDeXmlTiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([[]]);
  });

  it("deve usar ROW_NUMBER para deduplicar registros do faturamento_tiss", async () => {
    // DELETE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    // INSERT (com dedup)
    mockExecute.mockResolvedValueOnce([{ affectedRows: 100 }]);
    // COUNT
    mockExecute.mockResolvedValueOnce([[{ total: 100 }]]);

    const result = await popularDeXmlTiss(1);

    expect(result.inseridos).toBe(100);
    expect(mockExecute).toHaveBeenCalledTimes(3);

    // Verificar que a query INSERT contém ROW_NUMBER e PARTITION BY
    const insertCall = mockExecute.mock.calls[1][0];
    const queryStr = extractQuery(insertCall);
    expect(queryStr).toContain("ROW_NUMBER");
    expect(queryStr).toContain("PARTITION BY");
    expect(queryStr).toContain("sequencial_item");
    expect(queryStr).toContain("rn = 1");
  });

  it("deve incluir filtro de dataReferencia quando fornecido", async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 50 }]);
    mockExecute.mockResolvedValueOnce([[{ total: 50 }]]);

    const result = await popularDeXmlTiss(1, "2025-12");

    expect(result.inseridos).toBe(50);
    // Verificar que a query de INSERT contém o filtro de data
    const insertCall = mockExecute.mock.calls[1][0];
    const queryStr = extractQuery(insertCall);
    expect(queryStr).toContain("2025-12");
  });
});

describe("itensConciliadosPorGuia - COALESCE para descricaoItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([[]]);
  });

  it("deve usar COALESCE para buscar descricaoItem do faturamento_unificado quando conciliados_automatico está NULL", async () => {
    // Simular resultado com descricaoItem vindo do JOIN
    mockExecute.mockResolvedValueOnce([[
      {
        id: 1,
        faturamentoUnificadoId: 100,
        codigoItem: "90094719",
        descricaoItem: "CLORETO SODIO 0.9%",
        tipoItem: "MEDICAMENTO",
        statusConciliacao: "conciliado",
        valorFaturado: 5.58,
        valorPago: 5.58,
        valorGlosa: 0,
        diferenca: 0,
      },
    ]]);

    const result = await itensConciliadosPorGuia({
      estabelecimentoId: 1,
      numeroGuia: "2585810",
    });

    expect(result).toHaveLength(1);
    expect(result[0].descricaoItem).toBe("CLORETO SODIO 0.9%");
    expect(result[0].tipoItem).toBe("MEDICAMENTO");

    // Verificar que a query usa COALESCE e LEFT JOIN
    const queryCall = mockExecute.mock.calls[0][0];
    const queryStr = extractQuery(queryCall);
    expect(queryStr).toContain("COALESCE(ca.descricaoItem, fu.descricaoItem)");
    expect(queryStr).toContain("COALESCE(ca.tipoItem, fu.tipoItem)");
    expect(queryStr).toContain("LEFT JOIN faturamento_unificado fu");
  });

  it("deve usar LEFT JOIN com motivosGlosa para traduzir códigos de glosa", async () => {
    mockExecute.mockResolvedValueOnce([[
      {
        id: 1,
        codigoItem: "40302385",
        codigoGlosa: "1001",
        motivoGlosa: "Beneficiário não identificado na operadora",
        grupoGlosa: "Beneficiário",
        statusConciliacao: "divergente",
      },
    ]]);

    const result = await itensConciliadosPorGuia({
      estabelecimentoId: 1,
      numeroGuia: "12345",
    });

    expect(result).toHaveLength(1);
    expect(result[0].motivoGlosa).toBe("Beneficiário não identificado na operadora");
    expect(result[0].grupoGlosa).toBe("Beneficiário");

    // Verificar que a query usa LEFT JOIN com motivosGlosa
    const queryCall = mockExecute.mock.calls[0][0];
    const queryStr = extractQuery(queryCall);
    expect(queryStr).toContain("LEFT JOIN motivosGlosa mg");
    expect(queryStr).toContain("mg.codigo");
    expect(queryStr).toContain("mg.grupo as grupoGlosa");
  });

  it("deve filtrar por contaNumero quando fornecido", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    await itensConciliadosPorGuia({
      estabelecimentoId: 1,
      contaNumero: "C12345",
    });

    const queryCall = mockExecute.mock.calls[0][0];
    const queryStr = extractQuery(queryCall);
    expect(queryStr).toContain("ca.contaNumero = ?");
    expect(queryStr).not.toContain("C12345");
    expect(dialect.sqlToQuery(queryCall).params).toContain("C12345");
  });

  it("deve retornar array vazio quando não há itens", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    const result = await itensConciliadosPorGuia({
      estabelecimentoId: 1,
      numeroGuia: "INEXISTENTE",
    });

    expect(result).toEqual([]);
  });
});
