import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("sincronização da Conta Convênio", () => {
  it("usa faturamento_tiss como fonte atual e preserva o filtro por estabelecimento", () => {
    const source = readFileSync(new URL("./syncContaConvenio.ts", import.meta.url), "utf8");

    expect(source).toContain("FROM faturamento_tiss ft");
    expect(source).toContain("WHERE ft.estabelecimentoId = ${estabelecimentoId}");
    expect(source).toContain("INSERT INTO contas_convenio_itens");
    expect(source).toContain("INSERT INTO contas_convenio_resumo");
    expect(source).not.toContain("FROM staging_faturamento_xml");
  });

  it("é acionada automaticamente depois da persistência do XML enviado", () => {
    const processor = readFileSync(new URL("./fileProcessor.ts", import.meta.url), "utf8");
    const insertPosition = processor.indexOf("await db.insertFaturamentoTissBatch(faturamentoRecords)");
    const syncPosition = processor.indexOf("syncContaConvenioFromFaturamentoTiss");

    expect(insertPosition).toBeGreaterThan(-1);
    expect(syncPosition).toBeGreaterThan(insertPosition);
  });
});
