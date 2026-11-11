import { afterAll, beforeAll, describe, expect, it } from "vitest";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
import { BiGlosasMatrixTable, type LinhaMatrizGlosaBi } from "@/components/bi-executivo/BiGlosasMatrixTable";
import { calcularTotaisMatrizGlosa, obterPercentualLinhaMatrizGlosa } from "./biGlosasMatrixTotals";
import { DEFAULT_BI_CLIENT_CONFIG, resolveBiThemePalette } from "@shared/biPersonalizadoConfig";
import { complementarRankingGlosa, construirFiltroPainelGlosas } from "../../../server/relatoriosGlosasBiService";

const palette = resolveBiThemePalette(DEFAULT_BI_CLIENT_CONFIG);
const repo = path.resolve(import.meta.dirname, "../../..");
const pageSource = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(repo, "client/src/pages/RelatoriosGlosasBi.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node: ts.Node, predicate: (n: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(node)) return node;
  let result: ts.Node | undefined;
  ts.forEachChild(node, child => { result ||= find(child, predicate); });
  return result;
}
function evaluate(expression: string, context: Record<string, unknown>) {
  const code = ts.transpileModule(`exports.result = (${expression});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const exports: { result?: any } = {};
  vm.runInNewContext(code, { exports, React, Number, String, ...context });
  return exports.result;
}
// Executa os mappers e o JSX exatos da página; sem grep e sem backend.
function matrixFromPage(variable: string, data: any, options: Record<string, unknown> = {}) {
  const declaration = find(pageSource, node => ts.isVariableDeclaration(node) && node.name.getText(pageSource) === variable) as ts.VariableDeclaration;
  const lines = evaluate(declaration.initializer!.getText(pageSource), { data, useMemo: (fn: () => unknown) => fn(), fmtMonth: (s: string) => s });
  const jsx = find(pageSource, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageSource) === "BiGlosasMatrixTable" && node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(pageSource) === "linhas" && prop.initializer?.getText(pageSource) === `{${variable}}`));
  expect(jsx).toBeDefined();
  return evaluate(jsx!.getText(pageSource), {
    BiGlosasMatrixTable, [variable]: lines, data, palette,
    configCliente: DEFAULT_BI_CLIENT_CONFIG, isWarleine: false,
    mesPagamento: undefined, convenioSelecionado: undefined, motivoCodigo: undefined,
    procedimentoCodigo: undefined, itemDescricao: undefined,
    toggleMesPagamento() {}, toggleConvenio() {}, toggleMotivo() {}, toggleProcedimento() {}, toggleItem() {},
    setMesPagamento() {}, setConvenioChave() {}, setConvenioId() {}, setMotivoCodigo() {}, setProcedimentoCodigo() {}, setItemDescricao() {},
    ...options,
  });
}
function row(chave: string, value: number, extra: Partial<LinhaMatrizGlosaBi> = {}): LinhaMatrizGlosaBi {
  return { chave, label: chave, valorProcessado: value * 10, valorGlosado: value, glosaAceita: 0, glosaRecursada: 0, glosaPendente: value, ...extra };
}
const footer = (element: React.ReactElement) => renderToStaticMarkup(element).match(/<tfoot[\s\S]*?<\/tfoot>/)?.[0] ?? "";
const component = (lines: LinhaMatrizGlosaBi[], props = {}) => React.createElement(BiGlosasMatrixTable, { titulo: "Sintético", colunaDimensaoLabel: "Dimensão", palette, linhas: lines, ...props });

describe("matriz glosas: precisão e escopos integrados", () => {
  it("executa offline com DATABASE_URL vazio e rede bloqueada", () => {
    expect(process.env.DATABASE_URL).toBe("");
    expect(process.env.JWT_SECRET).toBe("synthetic-test-only-not-production-issue177-validation");
    expect(process.env.NODE_OPTIONS).toBe("--require=/home/ubuntu/reports/issue168/network-guard.cjs");
    expect(() => createRequire(import.meta.url)("node:https").request("https://synthetic.invalid")).toThrow("VALIDATION_EXTERNAL_NETWORK_DISABLED");
  });
  it.each(["linhasMatrizMotivos", "linhasMatrizProcedimentos"])("%s: 40%% + 20%% = 60%% sobre resumo 100, não 100%%", variable => {
    const ranking = complementarRankingGlosa([
      { codigoGlosa: "M1", codigoItem: "P1", nome: "Um", valor_glosado: 40, valor_pago: 360 },
      { codigoGlosa: "M2", codigoItem: "P2", nome: "Dois", valor_glosado: 20, valor_pago: 180 },
    ], 100);
    const element = matrixFromPage(variable, { resumo: { valorGlosado: 100 }, porMotivo: ranking, porProcedimento: ranking });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("40,00%"); expect(html).toContain("20,00%");
    expect(footer(element)).toContain("60,00%");
    expect(footer(element)).toContain("Subtotal das linhas");
    expect(footer(element)).toContain("60,00");
    expect(footer(element)).not.toContain("100,00%");
    expect(element.props.denominadorParticipacao).toBe(100);
  });
  it("usa valores não arredondados para cobertura, evitando somar percentuais arredondados", () => {
    const lines = [row("A", 1, { percentualTotal: 33.33 }), row("B", 1, { percentualTotal: 33.33 })];
    expect(footer(component(lines, { modoPercentual: "participacao", denominadorParticipacao: 3 }))).toContain("66,67%");
    expect(calcularTotaisMatrizGlosa(lines, "participacao", undefined, 3).pct).toBeCloseTo(66.6666666667);
    expect(calcularTotaisMatrizGlosa(lines, "participacao").pct).toBe(66.66);
  });
  it.each(["linhasMatrizCompetencia", "linhasMatrizConvenio"])("%s: mantém total seleção 100 e ranking próprio com linhas 100+200", variable => {
    const ranking = complementarRankingGlosa([
      { mesPagamento: "2026/01", convenioId: 11, nome: "Convênio 11", valor_glosado: 100, valor_pago: 900 },
      { mesPagamento: "2026/02", convenioId: 22, nome: "Convênio 22", valor_glosado: 200, valor_pago: 1800 },
    ], 100);
    const resumo = { valorProcessado: 1000, valorGlosado: 100, glosaAceita: 7, glosaRecursada: 19, glosaPendente: 74, taxaGlosa: 10 };
    const input = { estabelecimentoId: 1, mesPagamento: "2026/01", convenioId: 11 };
    const dimension = variable === "linhasMatrizCompetencia" ? "mesPagamento" : "convenio";
    expect(construirFiltroPainelGlosas(input).params).toContain(dimension === "convenio" ? 11 : "2026/01");
    expect(construirFiltroPainelGlosas(input, dimension).params).not.toContain(dimension === "convenio" ? 11 : "2026/01");
    const element = matrixFromPage(variable, { resumo, porMesPagamento: ranking, porConvenio: ranking }, { mesPagamento: "2026/01", convenioSelecionado: 11 });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("200,00");
    expect(footer(element)).toContain("Total da seleção"); expect(footer(element)).toContain("100,00");
    expect(footer(element)).toContain("19,00"); expect(footer(element)).not.toContain("300,00");
    expect(html).toContain("não é a soma das linhas");
    expect(html).toContain(dimension === "convenio" ? "sem o filtro do próprio convênio" : "sem o filtro do próprio mês");
  });
  it("cross-filter motivo pode exceder 100% sem trocar o denominador pelo TOP N", () => {
    const ranking = complementarRankingGlosa([{ codigoGlosa: "M", nome: "M", valor_glosado: 100 }, { codigoGlosa: "N", nome: "N", valor_glosado: 200 }], 100);
    const element = matrixFromPage("linhasMatrizMotivos", { resumo: { valorGlosado: 100 }, porMotivo: ranking }, { motivoCodigo: "M" });
    expect(footer(element)).toContain("300,00%"); expect(renderToStaticMarkup(element)).toContain("podendo exceder 100%");
  });
  it("denominador zero explícito vence percentuais incorretos ou inferência", () => {
    const ranking = [{ codigoGlosa: "M", nome: "M", valorGlosado: 10, percentualTotal: 0 }];
    const element = matrixFromPage("linhasMatrizMotivos", { resumo: { valorGlosado: 0 }, porMotivo: ranking });
    const cells = [...footer(element).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    expect(cells.at(-1)?.[1]).toBe("0,00%");
    expect(calcularTotaisMatrizGlosa([row("M", 10, { percentualTotal: 100 })], "participacao", undefined, 0).pct).toBe(0);
    expect(obterPercentualLinhaMatrizGlosa(row("M", 10, { percentualTotal: 0 }), "participacao", 10)).toBe(0);
  });
  it("zeros do resumo/taxa são autoritativos e ausências não se confundem com zero", () => {
    const lines = [row("A", 10, { taxaGlosa: 0 })];
    const zero = { valorProcessado: 0, valorGlosado: 0, glosaAceita: 0, glosaRecursada: 0, glosaPendente: 0, taxaGlosa: 0 };
    expect(calcularTotaisMatrizGlosa(lines, "taxaGlosa", zero)).toMatchObject({ valorProcessado: 0, valorGlosado: 0, glosaAceita: 0, glosaRecursada: 0, glosaPendente: 0, qtdItens: 0, pct: 0 });
    const explicit = { ...zero, valorProcessado: 100, valorGlosado: 10 };
    expect(calcularTotaisMatrizGlosa(lines, "taxaGlosa", explicit).pct).toBe(0);
    expect(calcularTotaisMatrizGlosa(lines, "taxaGlosa", { ...explicit, taxaGlosa: undefined }).pct).toBe(10);
    expect(obterPercentualLinhaMatrizGlosa(lines[0], "taxaGlosa")).toBe(0);
  });
  it("preserva chaves legítimas iguais, centavos e quantidade; não arredonda cada linha", () => {
    const lines = [row("Mesmo", 0.01, { badge: "Material", qtdItens: 1 }), row("Mesmo", 0.02, { badge: "Medicamento", qtdItens: 2 })];
    expect(calcularTotaisMatrizGlosa(lines, "taxaGlosa").valorGlosado).toBe(0.03);
    expect(calcularTotaisMatrizGlosa([row("A", 0.004), row("B", 0.004)], "taxaGlosa").valorGlosado).toBe(0.008);
    const html = renderToStaticMarkup(component(lines, { mostrarQuantidade: true }));
    expect(html).toContain("Material"); expect(html).toContain("Medicamento"); expect(footer(component(lines))).toContain("0,03");
  });
  it("mantém a semântica Warleine (todos os filtros) separada da fonte oficial", () => {
    const element = matrixFromPage("linhasMatrizConvenio", { resumo: { valorGlosado: 100, glosaRecursada: 0, glosaAceita: 0, glosaPendente: 100 }, porConvenio: [{ convenioId: "W", nome: "Warleine", valorGlosado: 60 }] }, { isWarleine: true });
    expect(renderToStaticMarkup(element)).toContain("com todos os filtros aplicados");
    expect(renderToStaticMarkup(element)).not.toContain("sem o filtro do próprio");
    expect(footer(element)).toContain("100,00");
  });
  it("matriz vazia não cria um subtotal falso", () => {
    const html = renderToStaticMarkup(component([]));
    expect(html).toContain("Nenhuma glosa encontrada"); expect(html).not.toContain("<tfoot");
  });
});

describe("ReactDOM real em host DOM sintético: foco, teclado e aria", () => {
  let dom: any; let createRoot: any; const saved: Record<string, PropertyDescriptor | undefined> = {};
  beforeAll(async () => {
    dom = createRequire(import.meta.url)("./biGlosasMatrixSyntheticDom.cjs").createSyntheticDom();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
      saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    createRoot = (await import("react-dom/client")).createRoot;
  });
  afterAll(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  });
  async function mounted(interactive = true) {
    const container = dom.document.createElement("div"); dom.document.body.appendChild(container);
    const root = createRoot(container); const toggles: string[] = [];
    function Harness() {
      const [selected, setSelected] = React.useState<string>();
      return component([row("A", 10), row("B", 20)], interactive ? {
        chaveSelecionada: selected, onToggleChave: (key: string) => { toggles.push(key); setSelected(prev => prev === key ? undefined : key); },
      } : {});
    }
    await act(async () => root.render(React.createElement(Harness)));
    return { container, root, toggles, close: async () => { await act(async () => root.unmount()); dom.document.body.removeChild(container); } };
  }
  it("Tab percorre cabeçalhos e linhas; Enter/Espaço alternam filtro uma vez e atualizam aria", async () => {
    const view = await mounted();
    try {
      const headers = dom.all(view.container, "th"); const buttons = dom.all(view.container, "button");
      expect(buttons).toHaveLength(7);
      await act(async () => dom.press("Tab"));
      expect(dom.document.activeElement).toBe(buttons[0]);
      expect(buttons[0].getAttribute("class")).toContain("focus-visible:outline");
      for (let index = 0; index < buttons.length; index++) await act(async () => dom.press("Tab"));
      const rows = () => dom.all(view.container, "tr").filter((r: any) => r.getAttribute("role") === "button");
      const selectedRow = rows()[0];
      expect(dom.document.activeElement).toBe(selectedRow);
      expect(selectedRow.getAttribute("tabindex")).toBe("0"); expect(selectedRow.getAttribute("aria-pressed")).toBe("false");
      expect(selectedRow.getAttribute("class")).toContain("focus-visible:outline-slate-900");
      let enter: any; await act(async () => { enter = dom.press("Enter"); });
      expect(enter.defaultPrevented).toBe(true); expect(view.toggles).toEqual(["B"]);
      expect(selectedRow.getAttribute("aria-pressed")).toBe("true");
      await act(async () => dom.press(" "));
      expect(view.toggles).toEqual(["B", "B"]); expect(selectedRow.getAttribute("aria-pressed")).toBe("false");
      await act(async () => dom.press("Enter", { repeat: true }));
      await act(async () => dom.press("ArrowDown")); expect(view.toggles).toHaveLength(2);
      await act(async () => dom.press("Tab")); expect(dom.document.activeElement).toBe(rows()[1]);
      await act(async () => dom.press("Tab", { shiftKey: true })); expect(dom.document.activeElement).toBe(rows()[0]);
      expect(headers[3].getAttribute("aria-sort")).toBe("none");
    } finally { await view.close(); }
  });
  it("ordenar por Enter e Espaço altera ordem e aria-sort sem invocar filtro", async () => {
    const view = await mounted();
    try {
      const headers = dom.all(view.container, "th"); const buttons = dom.all(view.container, "button");
      expect(headers[2].getAttribute("aria-sort")).toBe("descending");
      buttons[0].focus(); await act(async () => dom.press("Enter"));
      expect(headers[0].getAttribute("aria-sort")).toBe("ascending"); expect(headers[2].getAttribute("aria-sort")).toBe("none");
      const labels = () => dom.all(view.container, "tr").filter((r: any) => r.getAttribute("role") === "button").map((r: any) => r.getAttribute("aria-label"));
      expect(labels()).toEqual(["Filtrar Dimensão: A", "Filtrar Dimensão: B"]);
      await act(async () => dom.press(" "));
      expect(headers[0].getAttribute("aria-sort")).toBe("descending"); expect(labels()).toEqual(["Filtrar Dimensão: B", "Filtrar Dimensão: A"]);
      expect(view.toggles).toEqual([]); expect(dom.document.activeElement).toBe(buttons[0]);
      for (const button of buttons) {
        button.focus(); await act(async () => dom.press("Enter"));
        expect(dom.all(view.container, "th").filter((th: any) => th.getAttribute("aria-sort") !== "none")).toHaveLength(1);
      }
    } finally { await view.close(); }
  });
  it("linhas não interativas não entram no Tab nem recebem estados de botão", async () => {
    const view = await mounted(false);
    try {
      const body = dom.all(view.container, "tbody")[0];
      for (const row of dom.all(body, "tr")) {
        expect(row.getAttribute("role")).toBeNull(); expect(row.tabIndex).toBe(-1); expect(row.getAttribute("aria-pressed")).toBeNull();
      }
    } finally { await view.close(); }
  });
});
