import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getWarleineItemPresentation, formatWarleineItemCivilDate } from "../shared/warleineItemPresentation";

vi.mock("./db", () => ({ getRawPool: vi.fn() }));
import { getRawPool } from "./db";
import { getWarleineAccountItems } from "./warleineFaturamentoService";

const HUP = 1260036;
const source = { origemRegistroId: "hop_hup:sintetico:1", dataAberturaConta: "2026-10-25", codigoTipoServico: "007", recebimentoViaHospital: "S" };

describe("campos de apresentação Warleine confirmados por Sergio", () => {
  it("expõe a data do item HUP sem substituir a coluna histórica", () => {
    expect(getWarleineItemPresentation(HUP, source)).toMatchObject({ dataItem: "2026-10-25", dataOrigem: "2026-10-25", dataOrigemRotulo: "Data do item", tipoItemCodigo: "007", modalidadeRecebimento: "S", modalidadeRecebimentoRotulo: "Via hospital" });
    expect(source.dataAberturaConta).toBe("2026-10-25");
  });
  it.each(["N", " n "])("identifica médico direto (%s)", (value) => {
    expect(getWarleineItemPresentation(HUP, { ...source, recebimentoViaHospital: value }).modalidadeRecebimentoRotulo).toBe("Médico direto");
  });
  it.each([null, "", "X"])("não inventa modalidade para %s", (value) => {
    expect(getWarleineItemPresentation(HUP, { ...source, recebimentoViaHospital: value }).modalidadeRecebimentoRotulo).toBe("Não informado");
  });
  it("não aplica a confirmação HUP a outro estabelecimento", () => {
    expect(getWarleineItemPresentation(99, source)).toMatchObject({ dataItem: null, dataOrigemRotulo: "Data de origem (abertura da conta)" });
  });
  it("não reinterpreta um XLSX histórico do mesmo hospital", () => {
    expect(getWarleineItemPresentation(HUP, { ...source, origemRegistroId: "arquivo-sintetico:1" }).dataItem).toBeNull();
  });
  it("mantém data ausente sem usar entrada/alta/hoje", () => {
    expect(getWarleineItemPresentation(HUP, { ...source, dataAberturaConta: null }).dataItem).toBeNull();
  });
  it("não devolve identificador técnico privado", () => {
    expect(getWarleineItemPresentation(HUP, source)).not.toHaveProperty("origemRegistroId");
  });
});

describe("data civil em português sem fuso", () => {
  it.each([["2026-10-25", "25/10/2026"], ["2024-02-29", "29/02/2024"], ["2026-01-01", "01/01/2026"]])("formata %s", (date, expected) => {
    expect(formatWarleineItemCivilDate(date)).toBe(expected);
  });
  it.each([null, "", "2026-02-29", "2026-13-01", "2026-04-31", "25/10/2026", "2026-10-25T00:00:00Z"])("rejeita %s sem inventar data", (date) => {
    expect(formatWarleineItemCivilDate(date)).toBe("—");
  });
});

describe("endpoint de itens Warleine", () => {
  beforeEach(() => vi.clearAllMocks());
  it("retorna cinco campos do snapshot, preserva valores e usa apenas SELECT segregado", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ ...source, id: 1, codigoTuss: "00012345", codigoItemInterno: "00999", servicoNome: "Item sintético", tipoItem: "PROCEDIMENTO", quantidade: "1.2500", valorUnitario: "80.0000", valorFaturado: "100.0000", valorTotalRecebido: "50.0000", valorAberto: "40.0000", valorGlosa: "10.0000", setorNome: "Setor sintético" }]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ valorFaturado: "100", valorRecebido: "50", valorAberto: "40", valorGlosa: "10" }]]);
    vi.mocked(getRawPool).mockResolvedValue({ query } as any);
    const result = await getWarleineAccountItems(HUP, "2026/10", "conta-sintetica", "convenio-sintetico", 2, 20);
    expect(result.items[0]).toMatchObject({ dataItem: "2026-10-25", codigoTuss: "00012345", codigoItemInterno: "00999", tipoItemCodigo: "007", modalidadeRecebimentoRotulo: "Via hospital", setorNome: "Setor sintético", valorFaturado: 100, valorRecebido: 50, valorAberto: 40, valorGlosa: 10, quantidade: 1.25 });
    expect(result.items[0]).not.toHaveProperty("origemRegistroId");
    expect(result.resumoConta).toEqual({ valorFaturado: 100, valorRecebido: 50, valorAberto: 40, valorGlosa: 10 });
    for (const [sql, args] of query.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT/i);
      expect(sql).toContain("warleine_faturamento_itens_ativos");
      expect(sql).toContain("estabelecimentoId=?");
      expect(args.slice(0, 4)).toEqual([HUP, "2026/10", "conta-sintetica", "convenio-sintetico"]);
    }
    expect(query.mock.calls[0][1].slice(-2)).toEqual([20, 20]);
  });
  it("mantém a UI na mesma rota e não confunde TUSS, código interno, tipo e modalidade", () => {
    const ui = readFileSync(new URL("../client/src/pages/ContaConvenioWarleineDetalhes.tsx", import.meta.url), "utf8");
    for (const label of ["Data do item", "Código TUSS", "Código interno", "Tipo de item (codgrufi)", "Recebimento", "Setor"]) expect(ui).toContain(label);
    for (const field of ["item.dataItem", "item.codigoTuss", "item.codigoItemInterno", "item.tipoItemCodigo", "item.modalidadeRecebimentoRotulo", "item.setor"]) expect(ui).toContain(field);
    expect(ui).not.toContain("item.codigoGlosa");
    expect(ui).toContain("formatWarleineItemCivilDate");
    expect(ui).toContain("Analisar com padrões");
    expect(ui).toContain("/conta-convenio?fonte=WARLEINE");
  });
});
