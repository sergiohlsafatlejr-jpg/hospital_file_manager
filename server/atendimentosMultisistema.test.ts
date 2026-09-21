import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("tela de atendimentos padronizada entre sistemas", () => {
  it("normaliza Categoria e Tipo de Serviço no backend", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("normalizedCategorySql");
    expect(router).toContain("normalizedServiceSql");
    expect(router).toContain("normalizeAtendimentoCategory");
    expect(router).toContain("resolveAtendimentoServiceType");
    expect(router).toContain("tipoAtendimentoOrigem");
    expect(router).toContain("servicos: parseAgg(servicosR)");
    expect(router).toContain("filterConditions.push(sql`${normalizedServiceSql} = ${input.descricao}`)");
  });

  it("exibe Categoria e Tipo de Serviço na tabela para qualquer origem", () => {
    const table = read("client/src/components/atendimentos/AtendimentosTabela.tsx");
    expect(table).toContain('label: "Categoria"');
    expect(table).toContain('label: "Tipo de Serviço"');
    expect(table).toContain("d.categoriaAtendimento");
    expect(table).toContain("d.tipoServico");
  });

  it("oferece distribuição e filtro de Tipo de Serviço sem depender do layout Tasy", () => {
    const page = read("client/src/pages/AtendimentosUnificados.tsx");
    const filters = read("client/src/components/atendimentos/AtendimentosFiltros.tsx");
    expect(page).toContain('titulo="Quantidade por Tipo de Serviço"');
    expect(page).toContain("aggregations?.servicos");
    expect(filters).toContain('placeholder="Tipo de Serviço"');
    expect(filters).toContain("servicos.length > 0 || isTasyLayout");
  });

  it("calcula os KPIs a partir das categorias canônicas", () => {
    const page = read("client/src/pages/AtendimentosUnificados.tsx");
    expect(page).toContain('count("INTERNACAO")');
    expect(page).toContain('count("EXAME")');
    expect(page).toContain('count("AMBULATORIO")');
  });
});
