import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("../client/src/components/HupConciliacaoPiloto.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/ConciliacaoCruzada.tsx", import.meta.url), "utf8");

describe("Piloto HUP: interface isolada de leitura", () => {
  it("usa somente queries do router próprio, sem escrita ou geração de recursos", () => {
    expect(ui).toContain("trpc.hupConciliacaoPiloto.opcoes.useQuery");
    expect(ui).toContain("trpc.hupConciliacaoPiloto.comparar.useQuery");
    expect(ui).not.toMatch(/useMutation|\.mutate\(|\.mutateAsync\(|popularTudo|conciliarAutomaticamente|resetarConciliacao/);
    expect(ui).not.toContain("trpc.faturamentoUnificado");
  });
  it("desmonta a tela legada enquanto o piloto está aberto e valida unidade/permissão", () => {
    const wrapper = page.slice(page.indexOf("export default function ConciliacaoCruzada"), page.indexOf("function ConciliacaoCruzadaAtual"));
    expect(wrapper).toContain("estabelecimentoId === 1260036");
    expect(wrapper).toContain('temAcessoModuloNoEstabelecimento("conciliacaoContasPagas", estabelecimentoId)');
    expect(wrapper).toContain("if (pilotoAberto && pilotoDisponivel)");
    expect(wrapper).toContain("<HupConciliacaoPiloto key={estabelecimentoId}");
    expect(wrapper).toContain("return <ConciliacaoCruzadaAtual");
    expect(page).toContain("disabled={popularTudo.isPending || conciliarAuto.isPending || conciliacaoEmAndamento}");
  });
  it("limpa resultados ao editar filtros e não mostra cache após falha ou nova consulta", () => {
    expect(ui).toContain("setApplied(null); setPage(1); setExpanded(null)");
    expect(ui).toContain("const result = applied && !error && !isFetching ? data : undefined");
    expect(ui).toContain("enabled: applied !== null && estabelecimentoId === 1260036");
    expect(ui).toContain("retry: false");
  });
  it("explica limites, separa datas e recebimentos e preserva códigos textuais", () => {
    for (const label of ["Somente leitura — nada será gravado", "Comparar sem gravar", "Mês do pagamento (opcional)",
      "Glosa informada nos demonstrativos", "não soma os recebimentos do Hop", "Não é glosa automática nem vínculo confirmado",
      "sem alocação de pagamento", "sem convênio com de-para confirmado"]) expect(ui).toContain(label);
    expect(ui).toContain("formatWarleineItemCivilDate(item.dataItem)");
    expect(ui).toContain("formatPilotoMoney(item.valorFaturado)");
    expect(ui).not.toMatch(/Number\(item\.(codigoTuss|guiaPrestador|conta|valorFaturado)\)/);
    expect(ui).toContain("Setores, modalidades e tipos diferentes não são misturados");
  });
  it("apresenta valores com Decimal e diferença apenas quando o backend a autoriza", () => {
    expect(ui).toContain("new Decimal(value)");
    expect(ui).toContain("item.diferencaEstimada != null");
    expect(ui).toContain("faturado − pago − glosa informada");
    expect(ui).toContain("não esses totais");
  });
  it("destaca valores não informados e totais parciais sem presumir zero", () => {
    expect(ui).toContain("resumo.eventosSemValorGlosa > 0");
    expect(ui).toContain("Nulo não significa zero");
    expect(ui).toContain("Os totais desse campo são parciais");
    expect(ui).toContain('if (value == null) return "—"');
  });
});
