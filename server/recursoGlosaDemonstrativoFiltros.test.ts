import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_COMPETENCIAS_DEMONSTRATIVO,
  MAX_RECEBIMENTO_IDS_DEMONSTRATIVO,
  montarRecorteRecursoGlosaDemonstrativoSql,
  normalizarRecorteRecursoGlosaDemonstrativo,
} from "../shared/recursoGlosaDemonstrativoFiltros";

const mockExecute = vi.fn();
const { mockInvokeLLM } = vi.hoisted(() => ({ mockInvokeLLM: vi.fn() }));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ execute: mockExecute })),
  getRawPool: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mockInvokeLLM }));

import {
  gerarJustificativasIADemonstrativo,
  itensGlosadosDemonstrativo,
  itensGlosadosDetalheGuiaDemonstrativo,
  itensGlosadosDetalhePorItemDemonstrativo,
  itensGlosadosDetalhePorMotivoDemonstrativo,
  marcarGlosaAceitaEmLoteDemonstrativo,
  replicarJustificativasDemonstrativo,
} from "./faturamentoUnificadoService";

function sqlText(query: unknown): string {
  const candidate = query as { queryChunks?: Array<{ value?: unknown[] }> };
  const text = candidate.queryChunks?.[0]?.value?.[0];
  return typeof text === "string" ? text : JSON.stringify(query);
}

function allSql(): string {
  return mockExecute.mock.calls.map(([query]) => sqlText(query)).join("\n");
}

describe("recursoGlosaDemonstrativoFiltros", () => {
  it("normaliza arrays com precedência explícita sobre scalars e [] como Todas", () => {
    const selecionado = normalizarRecorteRecursoGlosaDemonstrativo({
      estabelecimentoId: 7,
      competencia: "2026-01",
      competencias: ["2026-02", "2026-03", "2026-02"],
      dataPagto: "2026-02-01",
      datasPagto: ["2026-02-03", "2026-02-04", "2026-02-03"],
    });

    expect(selecionado.competencias).toEqual(["2026-02", "2026-03"]);
    expect(selecionado.datasPagto).toEqual(["2026-02-03", "2026-02-04"]);
    expect(montarRecorteRecursoGlosaDemonstrativoSql("d", selecionado)).toBe(
      "d.estabelecimentoId = 7 AND DATE_FORMAT(d.data_pagamento, '%Y-%m') IN ('2026-02', '2026-03') AND DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') IN ('2026-02-03', '2026-02-04')",
    );

    const todas = normalizarRecorteRecursoGlosaDemonstrativo({
      estabelecimentoId: 7,
      competencia: "2026-01",
      competencias: [],
      dataPagto: "2026-01-20",
      datasPagto: [],
    });
    expect(todas.competencias).toBeUndefined();
    expect(todas.datasPagto).toBeUndefined();
    expect(todas.competenciasFoiInformado).toBe(true);
    expect(todas.datasPagtoFoiInformado).toBe(true);
    expect(montarRecorteRecursoGlosaDemonstrativoSql("d", todas)).toBe("d.estabelecimentoId = 7");
  });

  it("rejeita IDs, calendário, aliases e quantidades malformados sem ampliar o escopo", () => {
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 0 })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, competencias: ["0000-01"] })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, competencias: ["2026-13"] })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, datasPagto: ["2026-02-29"] })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, datasPagto: ["2024-02-29"] })).not.toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, recebimentoIds: [1, 0] })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({
      estabelecimentoId: 7,
      competencias: Array.from({ length: MAX_COMPETENCIAS_DEMONSTRATIVO + 1 }, () => "2026-01"),
    })).toThrow();
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({
      estabelecimentoId: 7,
      recebimentoIds: Array.from({ length: MAX_RECEBIMENTO_IDS_DEMONSTRATIVO + 1 }, (_, index) => index + 1),
    })).toThrow();
    expect(() => montarRecorteRecursoGlosaDemonstrativoSql("d;DROP", { estabelecimentoId: 7 })).toThrow();
  });

  it("aceita os 767 IDs da seleção original e rejeita somente acima do máximo defensivo", () => {
    const idsOriginais = Array.from({ length: 767 }, (_, index) => index + 1);
    expect(normalizarRecorteRecursoGlosaDemonstrativo({ estabelecimentoId: 7, recebimentoIds: idsOriginais })
      .recebimentoIds).toEqual(idsOriginais);
    expect(() => normalizarRecorteRecursoGlosaDemonstrativo({
      estabelecimentoId: 7,
      recebimentoIds: Array.from({ length: MAX_RECEBIMENTO_IDS_DEMONSTRATIVO + 1 }, (_, index) => index + 1),
    })).toThrow();
  });
});

describe("consultas do demonstrativo com filtros múltiplos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([[]]);
  });

  it("aplica competências OR, datas OR e dimensões AND na lista, sem voltar a unir recebimentos_excel", async () => {
    await itensGlosadosDemonstrativo({
      estabelecimentoId: 7,
      competencia: "2026-01",
      competencias: ["2026-02", "2026-03"],
      convenioId: 8,
      dataPagto: "2026-01-01",
      datasPagto: ["2026-02-03", "2026-03-04"],
      agrupamento: "guia",
      page: 1,
      pageSize: 50,
    });

    const query = allSql();
    expect(query).toContain("d.estabelecimentoId = 7");
    expect(query).toContain("d.convenio_id = 8");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m') IN ('2026-02', '2026-03')");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') IN ('2026-02-03', '2026-03-04')");
    expect(query).not.toContain("2026-01')");
    expect(query).not.toContain("recebimentos_excel");
  });

  it.each([
    ["guia", () => itensGlosadosDetalheGuiaDemonstrativo({ estabelecimentoId: 7, guia: "G-1", competencias: ["2026-02", "2026-03"], datasPagto: ["2026-02-03", "2026-03-04"], convenioId: 8 })],
    ["item", () => itensGlosadosDetalhePorItemDemonstrativo({ estabelecimentoId: 7, item: "4030", competencias: ["2026-02", "2026-03"], datasPagto: ["2026-02-03", "2026-03-04"], convenioId: 8 })],
    ["motivo", () => itensGlosadosDetalhePorMotivoDemonstrativo({ estabelecimentoId: 7, codigoGlosa: "100", competencias: ["2026-02", "2026-03"], datasPagto: ["2026-02-03", "2026-03-04"], convenioId: 8 })],
  ])("aplica o mesmo recorte no detalhe por %s", async (_tipo, run) => {
    await run();
    const query = allSql();
    expect(query).toContain("d.estabelecimentoId = 7");
    expect(query).toContain("d.convenio_id = 8");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m') IN ('2026-02', '2026-03')");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') IN ('2026-02-03', '2026-03-04')");
  });

  it("retorna protocolo e lote da própria linha no detalhe por item, sem MAX nem joins novos", async () => {
    mockExecute.mockResolvedValueOnce([[{
      id: 11,
      protocolo: "PROTO-11",
      lote: "LOTE-22",
      valorFaturado: "20",
      valorPago: "10",
      valorGlosa: "10",
      valorRecurso: "10",
      glosaAceita: 0,
    }]]);

    const rows = await itensGlosadosDetalhePorItemDemonstrativo({ estabelecimentoId: 7, item: "4030" });
    expect(rows[0]).toMatchObject({ protocolo: "PROTO-11", lote: "LOTE-22" });
    const query = allSql();
    expect(query).toContain("d.protocolo as protocolo");
    expect(query).toContain("d.lote_prestador as lote");
    expect(query).not.toContain("MAX(d.protocolo)");
    expect(query).not.toContain("recebimentos_excel");
  });
});

describe("ações em lote do demonstrativo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ affectedRows: 2 }]);
    mockInvokeLLM.mockReset();
  });

  it("não escreve ao replicar uma seleção explícita vazia", async () => {
    await expect(replicarJustificativasDemonstrativo({
      estabelecimentoId: 7,
      recebimentoIds: [],
      item: "4030",
      justificativa: "Justificativa",
    })).resolves.toEqual({ success: true, affected: 0 });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("restringe replicação a unidade, IDs visíveis, competências, pagamentos, item e código", async () => {
    await replicarJustificativasDemonstrativo({
      estabelecimentoId: 7,
      recebimentoIds: [11, 12],
      competencias: ["2026-02", "2026-03"],
      datasPagto: ["2026-02-03", "2026-03-04"],
      convenioId: 8,
      item: "4030",
      codigoGlosa: "100",
      justificativa: "Justificativa",
    });

    const query = allSql();
    expect(query).toContain("UPDATE demonstrativo d");
    expect(query).toContain("d.estabelecimentoId = 7");
    expect(query).toContain("d.id IN (11, 12)");
    expect(query).toContain("d.convenio_id = 8");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m') IN ('2026-02', '2026-03')");
    expect(query).toContain("DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') IN ('2026-02-03', '2026-03-04')");
    expect(query).toContain("codigo_item = '4030'");
    expect(query).toContain("codigo_glosa = '100'");
  });

  it("restringe aceite em lote ao estabelecimento e aos IDs enviados", async () => {
    await marcarGlosaAceitaEmLoteDemonstrativo([
      { id: 11, fonte: "demo" },
      { id: 12, fonte: "demo" },
    ], true, "Usuário", 7);

    expect(allSql()).toContain("WHERE estabelecimentoId = 7 AND id IN (11,12)");
  });

  it("retorna as linhas realmente atualizadas, inclusive zero, após deduplicar IDs", async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(marcarGlosaAceitaEmLoteDemonstrativo([
      { id: 11, fonte: "demo" },
      { id: 11, fonte: "demo" },
      { id: 12, fonte: "demo" },
    ], true, "Usuário", 7)).resolves.toEqual({ success: true, affected: 0 });

    expect(allSql()).toContain("WHERE estabelecimentoId = 7 AND id IN (11,12)");
  });

  it("não abre banco nem chama IA para lista de IDs vazia", async () => {
    await expect(gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [] }))
      .resolves.toEqual({ justificativas: [] });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("não chama IA quando o SELECT da unidade não retorna linhas", async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    await expect(gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [11] }))
      .resolves.toEqual({ justificativas: [] });

    expect(mockInvokeLLM).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("ignora retorno da IA fora da seleção ou não retornado pela unidade", async () => {
    mockExecute.mockResolvedValueOnce([[{
      id: 11,
      item: "4030",
      item_desc: "Item de teste",
      codigo_glosa: "100",
      motivoGlosa: "Motivo",
      valor_glosa: "10",
    }]]);
    mockInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ justificativas: [
        { id: 11, justificativa: "Justificativa válida" },
        { id: 12, justificativa: "ID selecionado, mas de outra unidade" },
        { id: 999, justificativa: "ID fora da seleção" },
      ] }) } }],
    });

    await expect(gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [11, 12] }))
      .resolves.toEqual({ justificativas: [{ id: 11, justificativa: "Justificativa válida" }] });

    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    const updates = mockExecute.mock.calls
      .map(([query]) => sqlText(query))
      .filter(query => query.includes("UPDATE demonstrativo"));
    expect(updates).toEqual([expect.stringContaining("WHERE estabelecimentoId = 7 AND id = 11")]);
  });
});
