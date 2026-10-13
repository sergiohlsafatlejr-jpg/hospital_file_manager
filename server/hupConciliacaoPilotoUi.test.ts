import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("../client/src/components/HupConciliacaoPiloto.tsx", import.meta.url), "utf8");
const detalhes = readFileSync(new URL("../client/src/components/HupComparativoGuiaDetalhes.tsx", import.meta.url), "utf8");
const money = readFileSync(new URL("../client/src/lib/hupPilotoMoney.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/ConciliacaoCruzada.tsx", import.meta.url), "utf8");

describe("Banco HUP: comparativo explícito por guia e item", () => {
  it("usa somente queries e não oferece gravação", () => {
    for (const name of ["opcoes", "guias"]) expect(ui).toContain(`trpc.hupConciliacaoPiloto.${name}.useQuery`);
    expect(detalhes).toContain("trpc.hupConciliacaoPiloto.itensGuia.useQuery");
    for (const source of [ui, detalhes]) expect(source).not.toMatch(/useMutation|\.mutate\(|\.mutateAsync\(|popularTudo|conciliarAutomaticamente|resetarConciliacao/);
    expect(ui).not.toContain("trpc.faturamentoUnificado");
    expect(ui).toContain('disabled title="Popular Dados pertence à base atual.');
  });
  it("preserva rota, unidade, módulo e botão na tela principal", () => {
    const wrapper = page.slice(page.indexOf("export default function ConciliacaoCruzada"), page.indexOf("function ConciliacaoCruzadaAtual"));
    for (const value of ['estabelecimentoId === 1260036', 'temAcessoModuloNoEstabelecimento("conciliacaoContasPagas", estabelecimentoId)', 'if (recorteBanco && bancoDisponivel)', 'key={estabelecimentoId}', 'return <ConciliacaoCruzadaAtual']) expect(wrapper).toContain(value);
    const header = page.slice(page.indexOf("{/* Cabeçalho */}"), page.indexOf("{/* Filtros */}"));
    expect(header.indexOf("Popular Dados")).toBeLessThan(header.indexOf("Buscar dados do banco"));
    expect(header.indexOf("Buscar dados do banco")).toBeLessThan(header.indexOf("Conciliar Automaticamente"));
  });
  it("explicita todos os meses ou um mês sem equiparar mês de pagamento a competência", () => {
    for (const label of ["Período dos demonstrativos", "Todos os meses de pagamento", "Um mês de pagamento", "Não usamos o mês do pagamento como competência faturada"]) expect(ui).toContain(label);
    expect(ui).toContain('periodoDemonstrativos === "mes" ? mesPagamento : undefined');
    expect(ui).toContain('disabled={periodoDemonstrativos !== "mes"}');
    expect(ui).toContain('periodoDemonstrativos === "todos" ||');
  });
  it("indicadores candidatos não usam totais gerais de demonstrativo", () => {
    expect(ui).toContain('title:"Pago candidato das guias",value:comparativo.valorPagoCandidato');
    expect(ui).toContain('title:"Glosa candidata das guias",value:comparativo.valorGlosaCandidata');
    expect(ui).not.toContain('value:resumo.valorPagoDemonstrativo');
    expect(ui).not.toContain('value:resumo.valorGlosaDemonstrativo');
    expect(ui).toContain("Contexto dos demonstrativos — não somado ao comparativo das guias");
    expect(ui).toContain("comparativo.diferencaComparavel");
    expect(ui).toContain("comparativo.gruposComparaveis}/{comparativo.totalGruposHospitalares}");
  });
  it("diferença da guia só usa valor integral e sinaliza cobertura parcial", () => {
    expect(ui).toContain("Diferença da guia");
    expect(ui).toContain("formatPilotoMoney(guia.diferencaGuia)");
    expect(ui).toContain('!guia.comparacaoCompleta && " · cobertura parcial"');
    expect(ui).not.toContain("formatPilotoMoney(guia.diferencaComparavel)");
    expect(detalhes).toContain("Subtotal da diferença apenas dos grupos comparáveis");
    expect(detalhes).toContain("Não representa a diferença de toda a guia");
  });
  it("mostra data e diferença por item diretamente, não só dentro de acordeão", () => {
    expect(detalhes).toContain('aria-label="Comparativo por item da guia"');
    expect(detalhes).toContain('"Data faturado / retorno"');
    expect(detalhes).toContain('"Diferença", "Resultado"');
    expect(detalhes).toContain("const avaliacao = avaliarComparativoItem(item)");
    expect(detalhes).toContain("formatPilotoMoney(avaliacao.diferenca)");
    expect(detalhes).toContain("Quantidade paga não está disponível");
  });
  it("todos os detalhes são paginados, sem limitar a revisão aos primeiros cem", () => {
    expect(ui).toContain("<HupComparativoGuiaDetalhes key={guiaSelecionada.chave}");
    expect(detalhes).toContain("guiaChave, page, pageSize: 50");
    expect(detalhes).toContain("Itens anteriores");
    expect(detalhes).toContain("Próximos itens");
    expect(detalhes).not.toContain("primeiros 100");
    expect(detalhes).toContain("if (isFetching) return");
    expect(detalhes).toContain("if (error) return");
  });
  it("preserva zero conhecido e cobertura 0/y sem valores fictícios", () => {
    expect(money).toContain('if (value == null) return "—"');
    expect(ui).not.toContain("guia.gruposComPago > 0 &&");
    expect(ui).not.toContain("guia.gruposComGlosa > 0 &&");
    expect(ui.match(/guia\.gruposHospitalares > 0 &&/g)).toHaveLength(2);
    expect(ui).toContain("{guia.gruposComPago}/{guia.gruposHospitalares}");
    expect(ui).toContain("{guia.gruposComGlosa}/{guia.gruposHospitalares}");
    expect(ui).toContain("Os totais desse campo são parciais");
  });
  it("limpa dados e modal com troca de filtro, paginação, erro ou consulta", () => {
    expect(ui).toContain("setApplied(null); setPage(1); setGuiaSelecionada(null)");
    expect(ui).toContain("const result = applied && !error && !isFetching ? data : undefined");
    expect(ui).toContain("enabled: applied !== null && estabelecimentoId === 1260036");
    expect(ui).toContain("open={!!guiaSelecionada && !!result}");
    expect(ui).toContain("setPage(1); setGuiaSelecionada(null)");
    expect(ui).toContain("opcoes?.competencias.includes(competencia)");
    expect(ui).toContain("opcoes?.convenios.some(c => String(c.id) === convenio)");
    expect(ui).toContain("recorteInicial.competencia && recorteInicial.convenioId && recorteValido");
  });
});
