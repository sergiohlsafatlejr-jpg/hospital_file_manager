import { describe, expect, it } from "vitest";
import { HUP_HOP_COLUMNS, HUP_FINANCE_ESTABELECIMENTO, fingerprintHupFinance, originForHupFinance, parseHupFinanceRow } from "./hupWarleineFinanceMap";
import { FINAL_COLUMNS, canonicalParams } from "./warleineFaturamentoImportService";

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(HUP_HOP_COLUMNS.map((column) => [column, null])),
  estabelecimentos_id: String(HUP_FINANCE_ESTABELECIMENTO),
  nomeconv: "Operadora teste", codconv: "004", mesprod: "2026/09",
  numconta: "123", receber: "N", descricao: "Pessoa sintética",
  descricao_1: "Descrição do item", codrecur: "11", codrecur_1: "11",
  vl_faturado: "10.00", vl_total_recebido: "0.00", vl_recebido: "0.00",
  ...overrides,
});

describe("publicação do Hop HUP na visão Warleine", () => {
  it("preserva unidade, competência, itens e campos posicionais repetidos", () => {
    const row = parseHupFinanceRow(makeRow());
    expect(row.competencia).toBe("2026/09");
    expect(row.convenioFaturadoCodigo).toBe("004");
    expect(row.servicoNome).toBe("Descrição do item");
    expect(row.codigoMotivoInterno).toBe("11");
    expect(row.numeroConta).toBe("123");
    expect(row.dataPagamento).toBeNull();
    expect(row.valorTotalRecebido).toBe("0.0000");
  });
  it("rejeita qualquer estabelecimento diferente do HUP", () => {
    expect(() => parseHupFinanceRow(makeRow({ estabelecimentos_id: "77" }))).toThrow("UNIDADE_HUP_DIVERGENTE");
    expect(() => parseHupFinanceRow(makeRow({ estabelecimentos_id: null }))).toThrow("UNIDADE_HUP_DIVERGENTE");
  });
  it("rejeita competência e conta inválidas sem corrigir automaticamente", () => {
    expect(() => parseHupFinanceRow(makeRow({ mesprod: "09/2026" }))).toThrow("LAYOUT_HUP_INVALIDO");
    expect(() => parseHupFinanceRow(makeRow({ numconta: null }))).toThrow("LAYOUT_HUP_INVALIDO");
  });
  it("não colapsa ocorrências idênticas e usa identidades distintas", () => {
    const one = parseHupFinanceRow(makeRow());
    const two = parseHupFinanceRow(makeRow());
    const snapshot = fingerprintHupFinance([two, one]);
    expect(snapshot.ordered).toHaveLength(2);
    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(originForHupFinance(one, 1)).not.toBe(originForHupFinance(two, 2));
  });
  it("altera fingerprint se qualquer medida for alterada", () => {
    const first = parseHupFinanceRow(makeRow());
    const second = parseHupFinanceRow(makeRow({ vl_faturado: "11.00" }));
    expect(fingerprintHupFinance([first]).hash).not.toBe(fingerprintHupFinance([second]).hash);
  });
  it("usa o contrato completo de itens e origem rastreável do lote HUP", () => {
    const row = parseHupFinanceRow(makeRow());
    const params = canonicalParams(31, HUP_FINANCE_ESTABELECIMENTO, 1, {
      ...row, origemRegistroId: originForHupFinance(row, 1),
    });
    expect(params).toHaveLength(FINAL_COLUMNS.length);
    expect(params[FINAL_COLUMNS.indexOf("estabelecimentoId")]).toBe(HUP_FINANCE_ESTABELECIMENTO);
    expect(params[FINAL_COLUMNS.indexOf("origemRegistroId")]).toBe(`hop_hup:${row.linhaHash}:1`);
    expect(params[FINAL_COLUMNS.indexOf("ativoParaRelatorio")]).toBe(false);
  });
});
