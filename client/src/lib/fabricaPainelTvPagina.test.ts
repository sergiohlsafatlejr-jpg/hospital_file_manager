import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
(globalThis as any).React = React;

const fixture = vi.hoisted(() => ({
  hospitalOperacional: "20", hospitalRelatorio: "31", competencia: "2026-11", todosIndex: 0,
  permiteRelatorio: true, estado: "success" as "success" | "pending" | "error", fetching: false, placeholder: false,
  calls: [] as { name: string; input: any; options: any }[],
}));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return { ...real, useState: (initial: any) => {
    let value = typeof initial === "function" ? initial() : initial;
    if (value === "todos") {
      fixture.todosIndex++;
      if (fixture.todosIndex === 1) value = fixture.hospitalOperacional;
      if (fixture.todosIndex === 5) value = fixture.hospitalRelatorio;
    }
    if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) value = fixture.competencia;
    return real.useState(value);
  } };
});
vi.mock("wouter", () => ({ useLocation: () => ["/fabrica", vi.fn()], useSearch: () => "tv=1" }));
vi.mock("../components/DashboardLayout", () => ({ default: ({ children }: any) => children }));
vi.mock("../components/EsteiraAmbulatorialPanel", () => ({ default: () => null }));
vi.mock("./trpc", () => ({ trpc: { fabricaFaturamento: new Proxy({}, { get: (_, name: string) => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: (input: any, options: any) => {
    fixture.calls.push({ name, input, options });
    const base = { status: fixture.estado, isFetching: fixture.fetching, isPlaceholderData: fixture.placeholder, refetch: vi.fn() };
    if (name === "dadosAuxiliares") return { ...base, status: "success", data: {
      hospitais: [{ id: 20, nome: "Hospital operacional A" }, { id: 31, nome: "Hospital relatório B" }],
      convenios: [], colaboradores: [],
      meuPerfil: { isGestorFabrica: false, verRelatoriosGerenciais: fixture.permiteRelatorio, setoresPermitidos: ["faturamento"] },
    } };
    if (name === "relatoriosGerenciais") return { ...base, data: { resumoPeriodo: { totalFaturadas: 6543, valorTotalFaturado: 76543 }, metas: [], producaoPorFuncionario: [], slaPorHospital: [] } };
    if (name === "resumoSetores") return { ...base, data: { totalGeralContas: input?.dataInicio ? 721 : 88, totalGeralValor: 0, porSetor: {} } };
    if (name === "listarContas") return { ...base, data: { total: input?.pageSize === 500 ? 721 : 301, contas: [{ id: 1, setorAtual: "faturamento", convenioNome: "Convênio do cache", valorFaturadoFinal: 0 }] } };
    return { ...base, data: undefined };
  },
}) }) } }));
import Pagina from "../pages/FabricaFaturamento";

function render() { fixture.todosIndex = 0; return renderToStaticMarkup(createElement(Pagina)); }
function tv(html: string) { return html.slice(html.indexOf("PAINEL TV"), html.indexOf("Cabeçalho inexistente") < 0 ? html.indexOf("Esteira de Faturamento Safatle", html.indexOf("Fechar TV")) : undefined); }

beforeEach(() => {
  Object.assign(fixture, { hospitalOperacional: "20", hospitalRelatorio: "31", competencia: "2026-11", permiteRelatorio: true, estado: "success", fetching: false, placeholder: false, todosIndex: 0 });
  fixture.calls.length = 0;
});

describe("Issue #174 — integração real da página/TV sem backend", () => {
  it("cabeçalho, resumo, amostra e relatório usam hospital B; operacional A não contamina a TV", () => {
    const html = tv(render());
    expect(html).toContain("Hospital relatório B"); expect(html).not.toContain("Hospital operacional A");
    const report = fixture.calls.find(c => c.name === "relatoriosGerenciais")!;
    const resumo = fixture.calls.find(c => c.name === "resumoSetores" && c.input.dataInicio)!;
    const contas = fixture.calls.find(c => c.name === "listarContas" && c.input.pageSize === 500)!;
    expect(report.input).toEqual({ hospitalEstabelecimentoId: 31, competencia: "2026-11" });
    expect(resumo.input).toEqual({ hospitalEstabelecimentoId: 31, dataInicio: "2026-11-01", dataFim: "2026-11-30" });
    expect(contas.input).toMatchObject({ hospitalEstabelecimentoId: 31, dataInicio: "2026-11-01", dataFim: "2026-11-30", page: 1, pageSize: 500 });
    expect(contas.input).not.toHaveProperty("convenioId");
    expect(html).toContain("de 721 no escopo");
    expect(render()).toContain("limite 100 de 301 no escopo");
  });
  it("troca hospital/competência deriva novo recorte sincronamente", () => {
    render(); fixture.calls.length = 0;
    fixture.hospitalRelatorio = "20"; fixture.competencia = "2024-02";
    const html = tv(render());
    expect(html).toContain("Hospital operacional A"); expect(html).toContain("2024-02");
    expect(fixture.calls.find(c => c.name === "listarContas" && c.input.pageSize === 500)?.input).toMatchObject({ hospitalEstabelecimentoId: 20, dataFim: "2024-02-29" });
  });
  it("permissão report falsa bloqueia dados antigos mesmo retornados por useQuery desabilitado", () => {
    fixture.permiteRelatorio = false;
    const html = tv(render());
    expect(fixture.calls.find(c => c.name === "relatoriosGerenciais")?.options.enabled).toBe(false);
    expect(html).toContain("Sem permissão para relatórios gerenciais");
    expect(html).not.toContain("6543"); expect(html).not.toContain("76.543");
  });
  it.each(["pending", "error", "fetching", "placeholder"])("dados antigos bloqueados na página durante %s", (estado) => {
    fixture.estado = estado === "pending" || estado === "error" ? estado : "success";
    fixture.fetching = estado === "fetching"; fixture.placeholder = estado === "placeholder";
    const html = tv(render());
    expect(html).not.toContain("Convênio do cache"); expect(html).not.toContain("6543"); expect(html).not.toContain(">721<");
    expect(html).toContain("Indisponível");
  });
  it("mês inválido impede consultas e descarrega cache sem inferir competência", () => {
    fixture.competencia = "2026-13";
    const html = tv(render());
    for (const call of fixture.calls.filter(c => c.name === "relatoriosGerenciais" || c.name === "listarContas" && c.input.pageSize === 500)) expect(call.options.enabled).toBe(false);
    expect(html).not.toContain("6543"); expect(html).toContain("Dados indisponíveis");
  });
});
