import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AtendimentosPaineisValor } from "../client/src/components/atendimentos/AtendimentosPaineisValor";
import type { FiltrosState } from "../client/src/components/atendimentos/AtendimentosFiltros";

const filtros: FiltrosState = { busca: "", tipo: "todos", origem: "all", protocolo: "all", etapa: "", convenio: "", servico: "", situacao: "pendentes", ano: "", mes: "", mesEntrada: "", setor: "", permanencia: "" };
const data = {
  mesEntrada: [{ chave: "2026-08", quantidade: 2, valor: 100.25 }],
  etapa: [{ chave: "Em Faturamento", quantidade: 2, valor: 100.25 }],
  convenio: [{ chave: "Convênio sintético", quantidade: 2, valor: 100.25 }],
  setor: [{ chave: "SEM SETOR", quantidade: 2, valor: 100.25 }],
  permanencia: [{ chave: "SEM REFERÊNCIA", quantidade: 2, valor: 100.25 }],
};
function render(props = {}) {
  return renderToStaticMarkup(createElement(AtendimentosPaineisValor, { data, filtros, onFiltro: () => {}, ...props }));
}

describe("interface de painéis por valor", () => {
  it("renderiza cinco painéis com moeda BRL, contagem secundária e botões acessíveis", () => {
    const html = render();
    for (const title of ["Contas por mês de entrada", "Etapas da conta", "Contas por convênio", "Contas por setor", "Permanência da conta"]) expect(html).toContain(title);
    expect(html).toContain("100,25");
    expect(html).toContain("08/2026");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5);
    expect(html).toContain("2 contas");
  });

  it("mostra o filtro ativo e seu botão de remoção", () => {
    const html = render({ filtros: { ...filtros, etapa: "Em Faturamento" } });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Remover filtro deste painel");
  });

  it("diferencia valor negativo, sem entrada e ausência de dados", () => {
    const html = render({ data: { ...data, mesEntrada: [{ chave: "__SEM_ENTRADA__", quantidade: 1, valor: -25 }] } });
    expect(html).toContain("Sem data de entrada");
    expect(html).toContain("saldo negativo");
    expect(html).toContain("25,00");
    expect(render({ data: undefined })).toContain("Sem contas neste recorte.");
    expect(render({ data: undefined, disabled: true })).toContain("Carregando agrupamentos...");
  });

  it("usa quantidades e conserva botões filtráveis quando a origem não informa valores", () => {
    const html = render({ data: { ...data, metric: "quantidade" }, filtros: { ...filtros, convenio: "Convênio sintético" } });
    expect(html).toContain("Explore as contas por quantidade");
    expect(html).toContain("Quantidade por etapa do processo");
    expect(html).not.toContain("Valores do recorte");
    expect(html).not.toContain("100,25");
    expect(html).not.toContain("R$");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/Quantidade de contas/g)).toHaveLength(5);
    expect(html).toContain("Remover filtro deste painel");
  });

  it("conecta os cinco filtros à consulta paginada e conserva tabela, abas e seleção segura por unidade", () => {
    const page = readFileSync(new URL("../client/src/pages/AtendimentosUnificados.tsx", import.meta.url), "utf8");
    const filters = readFileSync(new URL("../client/src/components/atendimentos/AtendimentosFiltros.tsx", import.meta.url), "utf8");
    for (const key of ["mesEntrada", "setor", "permanencia"]) {
      expect(page).toContain(`filtros.${key}`);
      expect(filters).toContain(`onFiltroChange("${key}", "")`);
    }
    expect(page).toContain("paineisValor: true");
    expect(page).toContain("<AtendimentosDaUnidade key={estabelecimentoAtual?.id");
    expect(page).toContain("<AtendimentosTabela");
    expect(page).toContain('value="atendimentos"');
    expect(page).not.toContain("<AtendimentosDistribuicao");
    expect(page).not.toContain("<AtendimentosPendenciasEtapa");
    const handlers = page.slice(page.indexOf("const handleFiltroChange"), page.indexOf("const handleSort"));
    expect(handlers.match(/setSelecionados\(new Set\(\)\)/g)).toHaveLength(2);
    expect(handlers.match(/setPaginaAtual\(1\)/g)).toHaveLength(2);
  });
});
