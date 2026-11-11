import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { DEFAULT_BI_CLIENT_CONFIG } from "@shared/biPersonalizadoConfig";
import {
  obterRespostaBiAtual,
  vincularRespostaBi,
  type BiExecutivoInput,
} from "./biExecutivoScope";
import type { PainelBiExecutivoResponse } from "../../../server/painelBiPersonalizadoService";
import { build } from "esbuild";
import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";

// Payload completo do contrato existente, somente agregados/marcadores sintéticos.
function fixture(input: BiExecutivoInput): PainelBiExecutivoResponse {
  const valor = input.estabelecimentoId === 101 ? 10101 : 20202;
  const linha = {
    chave: `SETOR-${input.estabelecimentoId}`,
    label: `DADO-SINTETICO-${input.estabelecimentoId}`,
    produzido: valor,
    faturado: valor,
    recebido: 0,
    glosa: 0,
    aReceber: valor,
    pctGlosa: 0,
    pctRecebido: 0,
    qtdContas: 1,
  };
  return {
    estabelecimento: {
      id: input.estabelecimentoId,
      nome: `Hospital Sintético ${input.estabelecimentoId}`,
      cnpj: null,
    },
    configCliente: {
      ...DEFAULT_BI_CLIENT_CONFIG,
      nomeExibicao: `MARCA-${input.estabelecimentoId}`,
      logoUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text>LOGO-${input.estabelecimentoId}</text></svg>`)}`,
    },
    fonteAtiva: {
      modoFonte: input.modoFonte,
      subFonteResolvida:
        input.modoFonte === "XML"
          ? "XML_OFICIAL"
          : input.subFonteBanco === "RECEBIMENTO_GERAL"
            ? "RECEBIMENTO_GERAL"
            : "WARLEINE",
      criterioPeriodoXml: input.criterioPeriodoXml ?? "FATURAMENTO",
      dimensaoSetorAtiva: input.dimensaoSetor ?? "setor",
      possuiSetorReal: true,
      atualizadoEm: "2026-10-01T12:00:00.000Z",
    },
    resumo: {
      produzido: valor,
      faturado: valor,
      recebido: 0,
      aReceber: valor,
      glosa: 0,
      pctGlosa: 0,
      pctRecebido: 0,
      glosaARecursar: 0,
      glosaEmRecurso: 0,
      glosaRecuperada: 0,
      glosaAceita: 0,
      qtdContas: 1,
      qtdItens: 1,
    },
    porCompetencia: [linha],
    porSetor: [linha],
    porConvenio: [linha],
    porTipoItem: [linha],
    porMotivoGlosa: [
      {
        codigo: "SINTETICO",
        motivo: `MOTIVO-${input.estabelecimentoId}`,
        glosa: 0,
        pctParticipacao: 0,
        quantidade: 1,
      },
    ],
    porProcedimento: [
      {
        codigo: "SINTETICO",
        descricao: `PROCEDIMENTO-${input.estabelecimentoId}`,
        tipo: "Procedimento",
        faturado: valor,
        recebido: 0,
        glosa: 0,
        pctGlosa: 0,
        quantidade: 1,
      },
    ],
    porProcedimentoGlosado: [],
    filtrosDisponiveis: {
      setores: [{ chave: linha.chave, label: linha.label }],
      competencias: [{ chave: "2026/10", label: "2026/10" }],
      convenios: [
        {
          chave: `PLANO-${input.estabelecimentoId}`,
          label: `PLANO-${input.estabelecimentoId}`,
        },
      ],
    },
  };
}

const base: BiExecutivoInput = { estabelecimentoId: 101, modoFonte: "XML" };
const estadoOk = { isPlaceholderData: false, isError: false };

function options(
  input: BiExecutivoInput,
  queryFn = async () => fixture(input)
) {
  return {
    queryKey: [["painelBiPersonalizado", "dados"], { input, type: "query" }],
    queryFn,
    placeholderData: undefined,
    select: (resposta: PainelBiExecutivoResponse) =>
      vincularRespostaBi(input, resposta),
  };
}

describe("BI-H02: vínculo da resposta ao escopo atual", () => {
  it("aceita somente a resposta completa do escopo exato e rejeita placeholder/erro", () => {
    const vinculada = vincularRespostaBi(base, fixture(base));
    expect(obterRespostaBiAtual(base, vinculada, estadoOk)).toBe(
      vinculada.resposta
    );
    expect(
      obterRespostaBiAtual(base, vinculada, {
        ...estadoOk,
        isPlaceholderData: true,
      })
    ).toBeUndefined();
    expect(
      obterRespostaBiAtual(base, vinculada, { ...estadoOk, isError: true })
    ).toBeUndefined();
    for (const patch of [
      { estabelecimentoId: 202 },
      { modoFonte: "BANCO_CSV" as const },
      { criterioPeriodoXml: "PAGAMENTO" as const },
      { subFonteBanco: "WARLEINE" as const },
      { dimensaoSetor: "prestador" as const },
      { setores: ["OUTRO"] },
      { competencias: ["2026/09"] },
      { convenios: ["OUTRO"] },
    ])
      expect(
        obterRespostaBiAtual({ ...base, ...patch }, vinculada, estadoOk)
      ).toBeUndefined();
  });

  it("confere os campos efetivos do contrato, inclusive AUTO e padrões personalizados", () => {
    const resposta = fixture(base);
    const conferir = (r: PainelBiExecutivoResponse, input = base) =>
      obterRespostaBiAtual(input, vincularRespostaBi(input, r), estadoOk);
    expect(
      conferir({
        ...resposta,
        estabelecimento: { ...resposta.estabelecimento, id: 202 },
      })
    ).toBeUndefined();
    expect(
      conferir({
        ...resposta,
        fonteAtiva: { ...resposta.fonteAtiva, modoFonte: "BANCO_CSV" },
      })
    ).toBeUndefined();
    expect(
      conferir({
        ...resposta,
        fonteAtiva: { ...resposta.fonteAtiva, criterioPeriodoXml: "PAGAMENTO" },
      })
    ).toBeUndefined();
    expect(
      conferir({
        ...resposta,
        fonteAtiva: { ...resposta.fonteAtiva, dimensaoSetorAtiva: "tipo_item" },
      })
    ).toBeUndefined();
    const banco: BiExecutivoInput = {
      ...base,
      modoFonte: "BANCO_CSV",
      subFonteBanco: "AUTO",
    };
    const rg = {
      ...fixture(banco),
      fonteAtiva: {
        ...fixture(banco).fonteAtiva,
        subFonteResolvida: "RECEBIMENTO_GERAL" as const,
      },
    };
    expect(conferir(rg, banco)).toBe(rg);
    expect(
      conferir(rg, { ...banco, subFonteBanco: "WARLEINE" })
    ).toBeUndefined();
    const personalizado = {
      ...resposta,
      configCliente: {
        ...resposta.configCliente,
        criterioPeriodoXmlPadrao: "PAGAMENTO" as const,
        dimensaoPainelSetores: "prestador" as const,
      },
      fonteAtiva: {
        ...resposta.fonteAtiva,
        criterioPeriodoXml: "PAGAMENTO" as const,
        dimensaoSetorAtiva: "prestador" as const,
      },
    };
    expect(conferir(personalizado)).toBe(personalizado);
  });

  it.each([
    ["hospital", { ...base, estabelecimentoId: 202 }],
    ["modo", { ...base, modoFonte: "BANCO_CSV" }],
    ["critério", { ...base, criterioPeriodoXml: "PAGAMENTO" }],
    ["dimensão", { ...base, dimensaoSetor: "prestador" }],
    ["filtros", { ...base, setores: ["OUTRO"] }],
    [
      "subfonte",
      { ...base, modoFonte: "BANCO_CSV", subFonteBanco: "RECEBIMENTO_GERAL" },
    ],
  ] as const)(
    "QueryObserver instalado não conserva payload ao mudar %s",
    async (_nome, proximo) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        },
      });
      client.setQueryData(options(base).queryKey, fixture(base));
      const observer = new QueryObserver(client, options(base));
      const unsubscribe = observer.subscribe(() => {});
      try {
        expect(
          obterRespostaBiAtual(
            base,
            observer.getCurrentResult().data,
            observer.getCurrentResult()
          )
        ).toBeDefined();
        let rejeitar!: (error: Error) => void;
        observer.setOptions(
          options(
            proximo,
            () =>
              new Promise((_resolve, reject) => {
                rejeitar = reject;
              })
          )
        );
        const pending = observer.getCurrentResult();
        expect(pending.data).toBeUndefined();
        expect(pending.isPlaceholderData).toBe(false);
        expect(pending.isLoading).toBe(true);
        expect(
          obterRespostaBiAtual(proximo, pending.data, pending)
        ).toBeUndefined();
        rejeitar(new Error("SYNTHETIC_FORBIDDEN"));
        await new Promise(resolve => setTimeout(resolve, 10));
        const denied = observer.getCurrentResult();
        expect(denied.isError).toBe(true);
        expect(
          obterRespostaBiAtual(proximo, denied.data, denied)
        ).toBeUndefined();
      } finally {
        unsubscribe();
        client.clear();
      }
    }
  );

  it("mantém cache/refetch somente da mesma chave, inclusive ao voltar A→B→A", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      },
    });
    client.setQueryData(options(base).queryKey, fixture(base));
    const observer = new QueryObserver(client, options(base));
    const unsubscribe = observer.subscribe(() => {});
    try {
      const refetch = observer.refetch();
      const pending = observer.getCurrentResult();
      expect(
        obterRespostaBiAtual(base, pending.data, pending)?.estabelecimento.id
      ).toBe(101);
      await refetch;
      observer.setOptions(options({ ...base, estabelecimentoId: 202 }));
      await observer.refetch();
      observer.setOptions(options(base));
      const voltou = observer.getCurrentResult();
      expect(
        obterRespostaBiAtual(base, voltou.data, voltou)?.estabelecimento.id
      ).toBe(101);
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});

/** Render do componente real, React/tRPC/ReactQuery instalados; endpoint em memória.
 * Chromium via pipe, CSP/request interception e DNS bloqueados: nenhum servidor/app/backend.
 * Stubs restringem-se a layout/filhos gráficos/modais/auth/contexto e writer XLSX.
 */
it("render real: primeiro frame isolado, filtros/modais resetados e Excel guardado", async () => {
  expect(process.env.DATABASE_URL).toBe("");
  expect(process.env.NODE_OPTIONS).toMatch(/network-guard\.cjs/);
  const root = path.resolve(import.meta.dirname, "../../..");
  const source = fs.readFileSync(
    path.join(
      root,
      "client/src/components/bi-executivo/PainelBiExecutivoView.tsx"
    ),
    "utf8"
  );
  expect(source).not.toMatch(/placeholderData:\s*\(prev\)\s*=>\s*prev/);
  expect(source).not.toContain("Resetar seleções ao trocar de estabelecimento");
  const virtual: Record<string, string> = {
    "@/components/DashboardLayout":
      'import React from "react"; export default ({children}) => <div>{children}</div>;',
    "@/contexts/EstabelecimentoContext":
      'import React from "react"; export const Context=React.createContext(null); export const useEstabelecimento=()=>React.useContext(Context);',
    "@/_core/hooks/useAuth":
      'export const useAuth=()=>({user:{role:"admin"}});',
    "./BiSlicerDropdown":
      'import React from "react"; export const BiSlicerDropdown=({titulo,opcoes,selecionados,onChange})=><button data-slicer={titulo} onClick={()=>onChange([opcoes[0]?.chave])}>{titulo}: {selecionados.join(",")}</button>;',
    "./BiMatrixTable":
      'import React from "react"; export const BiMatrixTable=({titulo,linhas,headerRightSlot,onToggleChave})=><section data-matrix={titulo}>{headerRightSlot}{linhas.map(x=><button key={x.chave} onClick={()=>onToggleChave?.(x.chave)}>{x.label}</button>)}</section>;',
    "./BiEvolucaoComboChart": "export const BiEvolucaoComboChart=()=>null;",
    "./BiPersonalizacaoDialog":
      'import React from "react"; export const BiPersonalizacaoDialog=({open,estabelecimentoId,configAtual})=>open?<div data-personalizacao={estabelecimentoId}>{configAtual.nomeExibicao}</div>:null;',
    "@/components/bi/LancamentosManuaisDialog":
      "export const LancamentosManuaisDialog=()=>null;",
    "@/components/bi/ImportarWarleineDialog":
      "export const ImportarWarleineDialog=()=>null;",
    recharts:
      'import React from "react"; const Box=({children})=><div>{children}</div>; export {Box as Bar,Box as CartesianGrid,Box as ComposedChart,Box as Line,Box as ResponsiveContainer,Box as Tooltip,Box as XAxis,Box as YAxis};',
    sonner: "export const toast={error:()=>{},success:()=>{}};",
    xlsx: "export const utils={book_new:()=>({sheets:[]}),aoa_to_sheet:x=>x,json_to_sheet:x=>x,book_append_sheet:(w,s,n)=>w.sheets.push({name:n,data:s})}; export const writeFile=(book,name)=>{window.__exports.push({book,name})};",
  };
  const fixtureSource = fixture
    .toString()
    .replace(/[\w$]+\.DEFAULT_BI_CLIENT_CONFIG/g, "DEFAULT_BI_CLIENT_CONFIG");
  const entry = `
    import React, {useState, useLayoutEffect} from "react";
    import {createRoot} from "react-dom/client";
    import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
    import {observable} from "@trpc/server/observable";
    import {trpc} from "./client/src/lib/trpc";
    import {Context} from "@/contexts/EstabelecimentoContext";
    import {PainelBiExecutivoView} from "./client/src/components/bi-executivo/PainelBiExecutivoView";
    import {DEFAULT_BI_CLIENT_CONFIG} from "./shared/biPersonalizadoConfig";
    const fixture=${fixtureSource};
    const requests=[]; const exports=[]; const frames=[];
    window.__requests=requests; window.__exports=exports; window.__frames=frames;
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:Infinity,placeholderData:prev=>prev}}});
    const rpc=trpc.createClient({links:[()=>({op})=>observable(observer=>{
      const request={input:op.input,done:false,resolve(){request.done=true;observer.next({result:{data:fixture(op.input)}});observer.complete()},reject(){request.done=true;observer.error(new Error("SYNTHETIC_FORBIDDEN"))}};
      requests.push(request);
      if(requests.length===1) request.resolve();
      return ()=>{};
    })]});
    function Harness(){
      const [scope,setScope]=useState({id:101,modoFonte:"XML"});
      window.__trocar=(id,modoFonte)=>setScope({id,modoFonte});
      useLayoutEffect(()=>{frames.push({id:scope.id,modoFonte:scope.modoFonte,html:document.body.innerHTML})},[scope]);
      return <Context.Provider value={{estabelecimentoAtual:{id:scope.id,nome:"CONTEXTO-"+scope.id},isGestor:true,temAcessoModulo:()=>true}}><PainelBiExecutivoView modoFonte={scope.modoFonte}/></Context.Provider>;
    }
    createRoot(document.getElementById("root")).render(<trpc.Provider client={rpc} queryClient={client}><QueryClientProvider client={client}><Harness/></QueryClientProvider></trpc.Provider>);
  `;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: root, loader: "tsx" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    alias: {
      "@": path.join(root, "client/src"),
      "@shared": path.join(root, "shared"),
    },
    plugins: [
      {
        name: "bi-render-fixtures",
        setup(b) {
          b.onResolve({ filter: /.*/ }, args =>
            virtual[args.path]
              ? { path: args.path, namespace: "bi-fixture" }
              : undefined
          );
          b.onLoad({ filter: /.*/, namespace: "bi-fixture" }, args => ({
            contents: virtual[args.path],
            loader: "tsx",
            resolveDir: root,
          }));
        },
      },
    ],
  });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    pipe: true,
    args: [
      "--no-sandbox",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run",
      "--host-resolver-rules=MAP * ~NOTFOUND",
    ],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    const network: string[] = [];
    page.on("pageerror", error => {
      errors.push(error.message);
      console.error("BI_RENDER_ERROR", error.message);
    });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (!request.url().startsWith("data:")) network.push(request.url());
      void request.abort();
    });
    await page.setContent(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:\"><div id=\"root\"></div>"
    );
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const snapshot = () =>
      page.evaluate(() => ({
        text: document.body.textContent,
        logos: [...document.querySelectorAll("img")].map(x =>
          x.getAttribute("src")
        ),
        excelDisabled: [...document.querySelectorAll("button")].find(
          x => x.textContent?.trim() === "Excel"
        )?.disabled,
        dialog: document
          .querySelector("[data-personalizacao]")
          ?.getAttribute("data-personalizacao"),
        requests: (window as any).__requests.map((x: any) => x.input),
        frames: (window as any).__frames,
        exports: (window as any).__exports,
      }));
    const click = async (label: string) => {
      await page.evaluate(label => {
        const button = [...document.querySelectorAll("button")].find(
          x => x.textContent?.trim() === label
        );
        if (!button) throw new Error("BOTAO_NAO_ENCONTRADO: " + label);
        button.click();
      }, label);
    };
    const resolve = async () => {
      await page.evaluate(() =>
        (window as any).__requests.findLast((x: any) => !x.done)?.resolve()
      );
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find(
            x => x.textContent?.trim() === "Excel"
          )?.disabled
      );
    };
    const pending = async (oldMarker: string) => {
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].find(
            x => x.textContent?.trim() === "Excel"
          )?.disabled
      );
      const s = await snapshot();
      expect(s.text).not.toContain(oldMarker);
      expect(s.logos).toEqual([]);
      expect(s.excelDisabled).toBe(true);
      expect(s.dialog).toBeUndefined();
      const exportCount = s.exports.length;
      await click("Excel");
      // Mesmo ignorando o disabled no DOM, o handler não pode gerar stale Excel.
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find(
          x => x.textContent?.trim() === "Excel"
        )!;
        button.disabled = false;
        button.click();
        button.disabled = true;
      });
      expect((await snapshot()).exports.length).toBe(exportCount);
      return s;
    };
    await page.waitForFunction(() =>
      document.body.textContent?.includes("DADO-SINTETICO-101")
    );
    expect((await snapshot()).excelDisabled).toBe(false);
    await click("Excel");
    expect((await snapshot()).exports[0].name).toBe(
      "painel-bi-xml-marca-101.xlsx"
    );
    expect((await snapshot()).exports[0].book.sheets[0].data[1][1]).toBe(
      "MARCA-101"
    );

    // Todas as páginas permanecem acessíveis, com os agregados/filhos esperados.
    await click("02 · Glosas & Recursos");
    expect((await snapshot()).text).toContain("MOTIVO-101");
    await click("03 · Setores & Produção");
    expect((await snapshot()).text).toContain("PROCEDIMENTO-101");
    await click("01 · Visão Geral");
    await click("Personalizar Cliente");
    expect((await snapshot()).dialog).toBe("101");
    await page.evaluate(() =>
      (
        document.querySelector('[data-slicer="SETOR"]') as HTMLButtonElement
      ).click()
    );
    await pending("DADO-SINTETICO-101");
    await resolve();
    expect((await snapshot()).requests.at(-1).setores).toEqual(["SETOR-101"]);
    await click("Mês Pagamento");
    await pending("DADO-SINTETICO-101");
    await resolve();
    await click("Prestador");
    await pending("DADO-SINTETICO-101");
    await resolve();
    await click("Personalizar Cliente");
    await page.evaluate(() => (window as any).__trocar(202, "XML"));
    const hospitalPending = await pending("MARCA-101");
    expect(hospitalPending.requests.at(-1)).toEqual({
      estabelecimentoId: 202,
      modoFonte: "XML",
    });
    const frameB = hospitalPending.frames.at(-1);
    expect(frameB.html).not.toContain("MARCA-101");
    expect(frameB.html).not.toContain("LOGO-101");
    expect(frameB.html).not.toContain("DADO-SINTETICO-101");
    expect(frameB.html).not.toContain("SETOR-101");
    expect(frameB.html).toContain("Consolidando indicadores");
    await page.evaluate(() => (window as any).__requests.at(-1).reject());
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Não foi possível carregar")
    );
    expect((await snapshot()).excelDisabled).toBe(true);
    await click("Tentar novamente");
    await page.waitForFunction(() => !(window as any).__requests.at(-1).done);
    await resolve();
    expect((await snapshot()).text).toContain("DADO-SINTETICO-202");
    await click("Excel");
    const exportB = (await snapshot()).exports.at(-1);
    expect(exportB.name).toBe("painel-bi-xml-marca-202.xlsx");
    expect(JSON.stringify(exportB)).not.toContain("MARCA-101");

    await page.evaluate(() => (window as any).__trocar(202, "BANCO_CSV"));
    const modePending = await pending("DADO-SINTETICO-202");
    expect(modePending.frames.at(-1).html).not.toContain("DADO-SINTETICO-202");
    expect(modePending.requests.at(-1)).toEqual({
      estabelecimentoId: 202,
      modoFonte: "BANCO_CSV",
    });
    await resolve();
    await click("CSV / Warleine");
    await pending("DADO-SINTETICO-202");
    await resolve();
    await click("ERP Geral");
    await pending("DADO-SINTETICO-202");
    await resolve();
    await click("Excel");
    const exportBanco = (await snapshot()).exports.at(-1);
    expect(exportBanco.name).toBe("painel-bi-banco-marca-202.xlsx");
    expect(exportBanco.book.sheets[0].data[2][1]).toContain(
      "RECEBIMENTO_GERAL"
    );
    // Volta ao hospital A sem reaplicar os overrides/filtros anteriores.
    await page.evaluate(() => (window as any).__trocar(101, "XML"));
    await page.waitForFunction(() =>
      document.body.textContent?.includes("DADO-SINTETICO-101")
    );
    expect((await snapshot()).excelDisabled).toBe(false);
    expect((await snapshot()).text).not.toContain("SETOR-101");
    expect((await snapshot()).dialog).toBeUndefined();
    expect(errors).toEqual([]);
    expect(network).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60000);
