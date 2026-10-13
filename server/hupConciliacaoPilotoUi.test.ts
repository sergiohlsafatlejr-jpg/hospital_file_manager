import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("../client/src/components/HupConciliacaoPiloto.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/ConciliacaoCruzada.tsx", import.meta.url), "utf8");

describe("Banco HUP na Conciliação Cruzada: tabela de guias e leitura", () => {
  it("usa somente queries de opções e guias do router próprio", () => {
    expect(ui).toContain("trpc.hupConciliacaoPiloto.opcoes.useQuery");
    expect(ui).toContain("trpc.hupConciliacaoPiloto.guias.useQuery");
    expect(ui).not.toMatch(/useMutation|\.mutate\(|\.mutateAsync\(|popularTudo|conciliarAutomaticamente|resetarConciliacao/);
    expect(ui).not.toContain("trpc.faturamentoUnificado");
  });
  it("desmonta o fluxo legado no modo Banco e restringe unidade e módulo", () => {
    const wrapper = page.slice(page.indexOf("export default function ConciliacaoCruzada"), page.indexOf("function ConciliacaoCruzadaAtual"));
    expect(wrapper).toContain("estabelecimentoId === 1260036");
    expect(wrapper).toContain('temAcessoModuloNoEstabelecimento("conciliacaoContasPagas", estabelecimentoId)');
    expect(wrapper).toContain("if (recorteBanco && bancoDisponivel)");
    expect(wrapper).toContain("key={estabelecimentoId}");
    expect(wrapper).toContain("setRecorteBanco(null)");
    expect(wrapper).toContain("return <ConciliacaoCruzadaAtual");
  });
  it("posiciona Buscar dados do banco imediatamente após Popular Dados", () => {
    const header=page.slice(page.indexOf("{/* Cabeçalho */}"),page.indexOf("{/* Filtros */}"));
    expect(header.indexOf("Popular Dados")).toBeLessThan(header.indexOf("Buscar dados do banco"));
    expect(header.indexOf("Buscar dados do banco")).toBeLessThan(header.indexOf("Conciliar Automaticamente"));
    expect(header).toContain("disabled={popularTudo.isPending || conciliarAuto.isPending || conciliacaoEmAndamento}");
    expect(header).not.toContain("Piloto Banco — somente leitura");
    expect(header).toContain("competenciaFiltro !== \"todos\" ? competenciaFiltro : undefined");
    expect(header).toContain("convenioId: convenioIdNum");
  });
  it("mantém título, filtros, tabela Guias/Contas e modal de itens", () => {
    for(const label of ["Conciliação Cruzada","Cruzamento do faturamento com recebimentos","Buscar dados do banco","Guias / Contas (","Origem","Faturado","Pago candidato","Glosa candidata","Fonte Banco","Ver base atual"])expect(ui).toContain(label);
    expect(ui).toContain('aria-label="Guias e contas da fonte Banco"');
    expect(ui).toContain('aria-label="Itens e candidatos da guia"');
    expect(ui).toContain("setGuiaSelecionada(guia)");
    expect(ui).toContain("<Dialog open=");
    expect(ui).not.toContain("Grupos de itens e candidatos para revisão");
  });
  it("não oferece gravação no modo Banco e informa limites dos valores", () => {
    expect(ui).toContain('disabled title="Popular Dados pertence à base atual.');
    expect(ui).toContain("consulta sem gravação");
    expect(ui).toContain("não soma os recebimentos do Hop");
    expect(ui).toContain("não recebimentos confirmados");
    expect(ui).toContain("grupos hospitalares");
    expect(ui).toContain("Os totais desse campo são parciais");
    expect(ui).toContain('if (value == null) return "—"');
    expect(ui).toContain("detalhesLimitados");
    expect(ui).toContain("primeiros 100");
    expect(ui).toContain("item.diferencaEstimada != null");
    expect(ui).toContain("Não é glosa automática nem vínculo confirmado");
  });
  it("mostra cobertura 0/y com valor desconhecido, sem ocultar grupos hospitalares", () => {
    expect(ui).not.toContain("guia.gruposComPago > 0 &&");
    expect(ui).not.toContain("guia.gruposComGlosa > 0 &&");
    expect(ui.match(/guia\.gruposHospitalares > 0 &&/g)).toHaveLength(2);
    expect(ui).toContain("{guia.gruposComPago}/{guia.gruposHospitalares}");
    expect(ui).toContain("{guia.gruposComGlosa}/{guia.gruposHospitalares}");
  });
  it("limpa resultados e detalhes após alterar recorte, erro ou consulta", () => {
    expect(ui).toContain("setApplied(null); setPage(1); setGuiaSelecionada(null)");
    expect(ui).toContain("const result = applied && !error && !isFetching ? data : undefined");
    expect(ui).toContain("enabled: applied !== null && estabelecimentoId === 1260036");
    expect(ui).toContain("retry: false");
    expect(ui).toContain("open={!!guiaSelecionada && !!result}");
  });
  it("valida o recorte da tela antiga contra opções Banco antes de buscar", () => {
    expect(ui).toContain("opcoes?.competencias.includes(competencia)");
    expect(ui).toContain("opcoes?.convenios.some(c => String(c.id) === convenio)");
    expect(ui).toContain("recorteInicial.competencia && recorteInicial.convenioId && recorteValido");
    expect(ui).toContain('replace("-", "/")');
    expect(ui).toContain("new Decimal(value)");
    expect(ui).not.toMatch(/Number\((?:item|guia)\.(codigoTuss|guiaPrestador|conta|valorFaturado)\)/);
  });
});
