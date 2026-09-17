import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/ConciliacaoCruzada.tsx"),
  "utf8",
);
const uploadSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Upload.tsx"),
  "utf8",
);

describe("fluxo da tela Conciliação Cruzada", () => {
  it("abre na aba Faturamento Unificado para exibir os XMLs antes da conciliação", () => {
    expect(source).toContain('useState("faturamento")');
  });

  it("atualiza o faturamento unificado antes de iniciar a conciliação", () => {
    const inicio = source.indexOf("const executarConciliacaoAutomatica = async");
    const fim = source.indexOf("const executarReset", inicio);
    const handler = source.slice(inicio, fim);
    const popular = handler.indexOf("await popularTudo.mutateAsync");
    const conciliar = handler.indexOf("conciliarAuto.mutate");

    expect(inicio).toBeGreaterThan(-1);
    expect(popular).toBeGreaterThan(-1);
    expect(conciliar).toBeGreaterThan(popular);
    expect(handler).toContain('setAbaAtiva("conciliados")');
  });

  it("bloqueia uma nova execução enquanto os dados estão sendo atualizados", () => {
    expect(source).toContain(
      "disabled={popularTudo.isPending || conciliarAuto.isPending || conciliacaoEmAndamento}",
    );
  });

  it("explica que a referência do XML é a competência das guias", () => {
    expect(uploadSource).toContain("Competência das guias (data de referência)");
    expect(uploadSource).toContain("não a data do upload nem a data do pagamento");
  });
});
