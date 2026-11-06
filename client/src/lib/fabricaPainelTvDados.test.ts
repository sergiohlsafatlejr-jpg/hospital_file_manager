import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import Tv from "../components/faturamento/FabricaPainelTvModal";
import {
  criarEscopoPainelTv, dadosConsultaPainelTv, descreverAmostraPainelTv,
  intervaloCompetenciaTv, LIMITE_AMOSTRA_SETOR, LIMITE_AMOSTRA_TV,
  numeroAutoritativo, producaoMensalPainelTv, realizadoMetaPainelTv, valorContaPainelTv,
} from "./fabricaPainelTvDados";

// Os componentes JSX usam runtime classic na configuração versionada atual.
import React from "react";
(globalThis as any).React = React;

const props = {
  open: true, onClose() {}, onRefresh() {}, competencia: "2026-11", hospitalNomeFiltro: "Hospital fictício A",
  setoresVisiveis: [], resumoSetores: { totalGeralContas: 0, totalGeralValor: 0 },
  relatoriosData: { resumoPeriodo: { totalFaturadas: 0, valorTotalFaturado: 0 }, metas: [] },
  contasEsteira: [
    { id: 1, setorAtual: "auditoria_interna", convenioNome: "Convênio fictício", valorFaturadoFinal: 0, valorFaturadoInicial: 120 },
    { id: 2, setorAtual: "limpeza_prontuario", convenioNome: "Convênio fictício", valorFaturadoFinal: 0, valorFaturadoInicial: 80 },
  ],
};
const render = (extra = {}) => renderToStaticMarkup(createElement(Tv, { ...props, ...extra }));
const kpi = (html: string, inicio: string, fim: string) => html.slice(html.indexOf(inicio), html.indexOf(fim));

describe("Issue #174 — números autoritativos e amostra TV", () => {
  it.each([0, "0", "0.00"])("preserva zero mensal %s sem inferir setores posteriores", (zero) => {
    expect(producaoMensalPainelTv({ resumoPeriodo: { totalFaturadas: zero, valorTotalFaturado: zero }, metas: [] }))
      .toMatchObject({ contas: 0, valor: 0, metaContas: 0 });
    expect(kpi(render(), "FATURADAS NO MÊS", "META DE CONTAS")).toMatch(/>0<\/div>/);
    expect(kpi(render(), "TOTAL DO ESCOPO", "FATURADAS NO MÊS")).toMatch(/>0<\/div>/);
  });
  it.each([0, "0", "0.00"])("final %s não é substituído pelo inicial", (zero) => {
    expect(valorContaPainelTv({ valorFaturadoFinal: zero, valorFaturadoInicial: 120 })).toBe(0);
    expect(render()).not.toMatch(/200,00|120,00|80,00/);
  });
  it("final ausente permite inicial, mas inválido preenchido não autoriza substituição", () => {
    expect(valorContaPainelTv({ valorFaturadoFinal: null, valorFaturadoInicial: 120 })).toBe(120);
    expect(valorContaPainelTv({ valorFaturadoInicial: 80 })).toBe(80);
    expect(valorContaPainelTv({ valorFaturadoFinal: "inválido", valorFaturadoInicial: 120 })).toBe(0);
  });
  it.each([null, undefined, "", "inválido", Infinity, NaN, false])("ausência/inválido %s não vira zero autoritativo", (raw) => {
    expect(numeroAutoritativo(raw)).toBeNull();
  });
  it("relatório ausente é indisponível, não zero, nem resumo/amostra como produção", () => {
    expect(producaoMensalPainelTv(undefined)).toEqual({ contas: null, valor: null, metaContas: null, metaValor: null });
    const html = render({ relatoriosData: undefined, resumoSetores: { totalGeralContas: 721, totalGeralValor: 98765 } });
    expect(kpi(html, "FATURADAS NO MÊS", "META DE CONTAS")).toContain("Indisponível");
    expect(html).toContain("Sem produção inferida");
  });
  it("meta individual com zero não usa movimentações e colaborador ausente não usa total geral", () => {
    const relatorio = { resumoPeriodo: { totalFaturadas: 99, valorTotalFaturado: 999 }, producaoPorFuncionario: [{ usuarioId: 7, contasFaturadas: 0, totalContasMovimentadas: 12, valorFaturado: 0 }] };
    expect(realizadoMetaPainelTv({ usuarioId: 7 }, relatorio)).toEqual({ contas: 0, valor: 0 });
    expect(realizadoMetaPainelTv({ usuarioId: 8 }, relatorio)).toEqual({ contas: null, valor: null });
    expect(realizadoMetaPainelTv({ usuarioId: null }, relatorio)).toEqual({ contas: 99, valor: 999 });
  });
  it("separa 721 no resumo e 500 na amostra, sem sugerir alertas totais", () => {
    const contas = Array.from({ length: 500 }, (_, id) => ({ id, setorAtual: "faturamento", convenioNome: "Convênio amostrado", valorFaturadoFinal: 0 }));
    const html = render({ resumoSetores: { totalGeralContas: 721, totalGeralValor: 0 }, contasEsteira: contas, totalContasAmostra: 721 });
    expect(kpi(html, "TOTAL DO ESCOPO", "FATURADAS NO MÊS")).toMatch(/>721<\/div>/);
    expect(html).toContain("AMOSTRA da página 1: 500 conta(s), limite 500 de 721 no escopo");
    expect(html).toContain("alertas de prazo são somente da AMOSTRA, não totais");
    expect(html).toContain("Convênio amostrado");
    expect(descreverAmostraPainelTv(100, 301, LIMITE_AMOSTRA_SETOR)).toContain("limite 100 de 301 no escopo");
    expect(descreverAmostraPainelTv(0, 0, LIMITE_AMOSTRA_TV)).toContain("de 0 no escopo");
    expect(descreverAmostraPainelTv(2, undefined, 500)).toContain("total do escopo indisponível");
  });
  it.each(["carregando", "erro", "sem_permissao", "indisponivel"] as const)("TV descarta props antigas quando estado é %s", (estado) => {
    const html = render({ estadoResumo: estado, estadoRelatorios: estado, estadoContas: estado, contasEsteira: [{ id: 1, convenioNome: "SEGREDO-DO-FILTRO-ANTERIOR", valorFaturadoFinal: 87654 }], resumoSetores: { totalGeralContas: 7654 } });
    expect(html).not.toContain("SEGREDO-DO-FILTRO-ANTERIOR");
    expect(html).not.toContain(">7654<");
    expect(kpi(html, "FATURADAS NO MÊS", "META DE CONTAS")).toContain("Indisponível");
  });
  it("mantém controles fullscreen, atualização e rotação de três visões", () => {
    const html = render();
    for (const controle of ["Tela Cheia (F11)", "Rotação Auto (20s)", "Fechar TV", "Atualizar", "2. Detalhamento", "3. Metas"]) expect(html).toContain(controle);
    expect(render({ open: false })).toBe("");
  });
  it("não classifica ausência/data inválida como 'No prazo' na distribuição", () => {
    const html = render({ contasEsteira: [{ id: 1, setorAtual: "faturamento", convenioNome: "Convênio sem datas", dataAlta: "2026-02-31", dataRecebimentoSafatle: null }] });
    expect(html).toContain("1 sem datas válidas");
    expect(html).not.toContain(">No prazo<");
  });
});

describe("Issue #174 — escopo e cache de consultas", () => {
  it("usa hospital do relatório e intervalo civil da competência, nunca filtro operacional", () => {
    expect(criarEscopoPainelTv("31", "2026-11")).toEqual({ competencia: "2026-11", hospitalEstabelecimentoId: 31, dataInicio: "2026-11-01", dataFim: "2026-11-30" });
    expect(criarEscopoPainelTv("todos", "2024-02")?.dataFim).toBe("2024-02-29");
    expect(intervaloCompetenciaTv("2100-02")?.dataFim).toBe("2100-02-28");
    for (const comp of ["2026-13", "2026-00", "2026-2", "0000-01", ""]) expect(intervaloCompetenciaTv(comp)).toBeNull();
    for (const hospital of ["-1", "0", "NaN", "1.5"]) expect(criarEscopoPainelTv(hospital, "2026-11")).toBeNull();
  });
  it.each([
    { status: "pending" as const },
    { status: "success" as const, isFetching: true },
    { status: "success" as const, isPlaceholderData: true },
    { status: "error" as const },
    { status: "success" as const, isError: true },
  ])("bloqueia cache antigo em loading/placeholder/erro: %j", (consulta) => {
    expect(dadosConsultaPainelTv({ ...consulta, data: props.relatoriosData }, true).data).toBeUndefined();
  });
  it("enabled falso não vaza relatório em cache após perda de permissão ou mês inválido", () => {
    const consulta = { status: "success" as const, data: props.relatoriosData };
    expect(dadosConsultaPainelTv(consulta, false)).toEqual({ estado: "sem_permissao", data: undefined });
    expect(dadosConsultaPainelTv(consulta, true, false)).toEqual({ estado: "indisponivel", data: undefined });
    expect(dadosConsultaPainelTv({ status: "success" }, true).estado).toBe("indisponivel");
    expect(dadosConsultaPainelTv(consulta, true).data).toBe(props.relatoriosData);
  });
  it.each(["hospital", "competencia"])("QueryObserver real: alteração de %s bloqueia previousData e erro de refetch", async (alteracao) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const origem = criarEscopoPainelTv("20", "2026-11")!;
    const destino = criarEscopoPainelTv(alteracao === "hospital" ? "31" : "20", alteracao === "competencia" ? "2026-12" : "2026-11")!;
    const oldKey = ["relatoriosGerenciais", origem];
    const newKey = ["relatoriosGerenciais", destino];
    client.setQueryData(oldKey, { hospital: 20, total: 987 });
    const observer = new QueryObserver(client, { queryKey: oldKey, enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    expect(dadosConsultaPainelTv(observer.getCurrentResult(), true).data).toEqual({ hospital: 20, total: 987 });
    observer.setOptions({ queryKey: newKey, queryFn: async () => { throw new Error("falha sintética"); }, placeholderData: (prev) => prev });
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    expect(dadosConsultaPainelTv(observer.getCurrentResult(), true).data).toBeUndefined();
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe("error"));
    expect(dadosConsultaPainelTv(observer.getCurrentResult(), true).data).toBeUndefined();
    client.setQueryData(newKey, { hospital: destino.hospitalEstabelecimentoId, total: 0 });
    await observer.refetch();
    expect(observer.getCurrentResult().data).toEqual({ hospital: destino.hospitalEstabelecimentoId, total: 0 });
    expect(dadosConsultaPainelTv(observer.getCurrentResult(), true)).toEqual({ estado: "erro", data: undefined });
    unsubscribe(); observer.destroy(); client.clear();
  });
});
