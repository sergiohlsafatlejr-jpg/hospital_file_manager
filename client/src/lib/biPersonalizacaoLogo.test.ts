import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BI_CLIENT_CONFIG,
  BI_THEME_PRESETS,
} from "../../../shared/biPersonalizadoConfig";
import * as shared from "../../../shared/biPersonalizadoConfig";
import * as extractor from "./biLogoColorExtractor";
import * as operation from "./biLogoOperation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const palette = (color = "#008844") => ({
  corPrimaria: color,
  corSecundaria: "#cc8800",
  coresDetectadas: [color, "#cc8800"],
  secundariaVindaDaLogo: true,
});
const config = (logoUrl: string | null = "logo-original") => ({
  ...DEFAULT_BI_CLIENT_CONFIG,
  logoUrl,
});

/**
 * Node-only executable hook/JSX harness (not a DOM renderer): executes the actual
 * component's handlers, lifecycle cleanups and real operation owner. Only UI,
 * hooks and external I/O are substituted; there is no source-pattern assertion.
 * Rendering is explicit to also exercise closures from before a batched commit.
 */
function mount(initial = config(), initiallyOpen = true) {
  const cells: any[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let writesAfterUnmount = 0;
  let queued: (() => void)[] = [];
  const reads: {
    file: any;
    resolve: (url: string) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const extractions: ReturnType<
    typeof deferred<extractor.PaletaExtraidaLogo>
  >[] = [];
  const urls: string[] = [];
  const saves: any[] = [];
  const resets: any[] = [];
  const mutations: ReturnType<typeof deferred<any>>[] = [];
  const images: any[] = [];
  const notices = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const invalidate = vi.fn(async () => undefined);
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const input = { value: "selected-file", click: vi.fn() };
  const React: any = {
    createElement(type: any, props: any, ...children: any[]) {
      if (props?.type === "file" && props.ref) props.ref.current = input;
      return { type, props: props || {}, children };
    },
    useState(initial: any) {
      const n = cursor++;
      if (!(n in cells))
        cells[n] = typeof initial === "function" ? initial() : initial;
      return [
        cells[n],
        (value: any) => {
          if (!mounted) writesAfterUnmount++;
          cells[n] = typeof value === "function" ? value(cells[n]) : value;
          dirty = true;
        },
      ];
    },
    useRef(initial: any) {
      const n = cursor++;
      if (!(n in cells)) cells[n] = { current: initial };
      return cells[n];
    },
    useMemo(fn: () => any, deps: any[]) {
      const n = cursor++;
      if (!cells[n] || deps.some((d, i) => d !== cells[n].deps[i]))
        cells[n] = { value: fn(), deps };
      return cells[n].value;
    },
    useLayoutEffect(fn: () => any, deps: unknown[]) {
      const n = cursor++;
      const previous = effects.get(n);
      if (!previous || deps.some((d, i) => d !== previous.deps[i])) {
        queued.push(() => {
          previous?.cleanup?.();
          effects.set(n, { deps, cleanup: fn() });
        });
      }
    },
  };
  React.default = React;
  const useMutation = (kind: "save" | "reset") => {
    const [pending, setPending] = React.useState(false);
    return {
      isPending: pending,
      mutateAsync: async (value: any) => {
        (kind === "save" ? saves : resets).push(value);
        const request = deferred<any>();
        mutations.push(request);
        setPending(true);
        try {
          return await request.promise;
        } finally {
          if (mounted) setPending(false);
        }
      },
    };
  };
  const dependencies: any = {
    react: React,
    "@shared/biPersonalizadoConfig": shared,
    "@/lib/biLogoOperation": operation,
    "@/lib/biLogoColorExtractor": {
      ...extractor,
      extrairCoresDeLogoDataUrl: (url: string) => {
        urls.push(url);
        const request = deferred<extractor.PaletaExtraidaLogo>();
        extractions.push(request);
        return request.promise;
      },
    },
    "@/lib/utils": {
      cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    },
    sonner: { toast: notices },
    "@/lib/trpc": {
      trpc: {
        useUtils: () => ({ painelBiPersonalizado: { invalidate } }),
        painelBiPersonalizado: {
          salvarConfiguracao: { useMutation: () => useMutation("save") },
          resetarConfiguracao: { useMutation: () => useMutation("reset") },
        },
      },
    },
  };
  for (const name of [
    "dialog",
    "button",
    "input",
    "label",
    "switch",
    "tabs",
    "select",
  ]) {
    dependencies["@/components/ui/" + name] = new Proxy(
      {},
      { get: (_, key) => String(key) }
    );
  }
  dependencies["lucide-react"] = new Proxy(
    {},
    { get: (_, key) => String(key) }
  );
  class FileReaderStub {
    result: string | null = null;
    onload!: () => void;
    onerror!: () => void;
    readAsDataURL(file: any) {
      reads.push({
        file,
        resolve: url => {
          this.result = url;
          this.onload();
        },
        reject: () => this.onerror(),
      });
    }
  }
  class ImageStub {
    src = "";
    width = 760;
    height = 280;
    onload!: () => void;
    onerror!: () => void;
    constructor() {
      images.push(this);
    }
  }
  const document = {
    createElement: () => {
      let source = "";
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          clearRect() {},
          drawImage(img: ImageStub) {
            source = img.src;
          },
        }),
        toDataURL: () => "resized:" + source,
      };
    },
  };
  const source = readFileSync(
    resolve("client/src/components/bi-executivo/BiPersonalizacaoDialog.tsx"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name: string) => {
      if (!(name in dependencies)) throw Error("Unexpected import: " + name);
      return dependencies[name];
    },
    FileReader: FileReaderStub,
    Image: ImageStub,
    document,
  });
  let props = {
    open: initiallyOpen,
    onOpenChange,
    estabelecimentoId: 101,
    estabelecimentoNome: "Hospital sintético",
    configAtual: initial,
    onSaved,
  };
  let tree: any;
  const render = () => {
    do {
      dirty = false;
      cursor = 0;
      tree = module.exports.BiPersonalizacaoDialog(props);
      const pending = queued;
      queued = [];
      pending.forEach(fn => fn());
    } while (dirty);
    return tree;
  };
  const nodes = (node: any): any[] =>
    node && typeof node === "object"
      ? [node, ...node.children.flat(Infinity).flatMap(nodes)]
      : [];
  const all = () => nodes(render());
  const find = (match: (node: any) => boolean) => {
    const node = all().find(match);
    if (!node) throw Error("Control not found");
    return node;
  };
  const button = (text: string) => find(node => node.children.includes(text));
  const click = (text: string) => button(text).props.onClick();
  const upload = (name = "synthetic.svg", type = "image/svg+xml") =>
    find(node => node.props.type === "file").props.onChange({
      target: { files: [{ type, size: 42, name }] },
    });
  const draft = () => saves.at(-1)?.config;
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  render();
  return {
    reads,
    extractions,
    urls,
    saves,
    resets,
    mutations,
    images,
    notices,
    input,
    onSaved,
    onOpenChange,
    invalidate,
    all,
    find,
    button,
    click,
    upload,
    draft,
    flush,
    update(next: Partial<typeof props>) {
      props = { ...props, ...next };
      render();
    },
    unmount() {
      effects.forEach(effect => effect.cleanup?.());
      mounted = false;
    },
    get writesAfterUnmount() {
      return writesAfterUnmount;
    },
    get logo() {
      return all().find(n => n.props.alt === "Logo cliente")?.props.src ?? null;
    },
    get loading() {
      return all().some(n => n.props.role === "status");
    },
    get colors() {
      return all()
        .filter(n => n.props.title?.startsWith("Clique para usar"))
        .map(n => n.props.title);
    },
  };
}

async function ready() {
  const f = mount();
  f.extractions[0].resolve(palette());
  await f.flush();
  return f;
}
async function completeUpload(
  f: ReturnType<typeof mount>,
  url: string,
  color = "#0044bb"
) {
  f.reads.at(-1)!.resolve(url);
  await f.flush();
  f.extractions.at(-1)!.resolve(palette(color));
  await f.flush();
}

describe("BiPersonalizacaoDialog — deferred I/O integrated with generation owner", () => {
  it("blocks save during initial extraction; success exposes current palette and releases loading", async () => {
    const f = mount();
    expect(f.loading).toBe(true);
    expect(f.button("Salvar Personalização deste Cliente").props.disabled).toBe(
      true
    );
    await f.click("Salvar Personalização deste Cliente");
    expect(f.saves).toHaveLength(0);
    f.extractions[0].resolve(palette());
    await f.flush();
    expect(f.loading).toBe(false);
    expect(f.colors.join()).toContain("#008844");
  });

  it("A/B resize out of order never starts extraction for stale A", async () => {
    const f = await ready();
    const a = f.upload("A.svg");
    const b = f.upload("B.svg");
    f.reads[1].resolve("logo-B");
    await f.flush();
    f.extractions.at(-1)!.resolve(palette("#1122cc"));
    await b;
    f.reads[0].resolve("logo-A");
    await a;
    await f.flush();
    expect(f.urls).not.toContain("logo-A");
    expect(f.logo).toBe("logo-B");
    expect(f.colors.join()).toContain("#1122cc");
    expect(f.notices.success).toHaveBeenCalledTimes(1);
  });

  it("raster A/B image decoding/resize finishes B before A and accepts only B", async () => {
    const f = await ready();
    const a = f.upload("A.png", "image/png");
    f.reads[0].resolve("raw-A");
    await f.flush();
    const b = f.upload("B.png", "image/png");
    f.reads[1].resolve("raw-B");
    await f.flush();
    f.images[1].onload();
    await f.flush();
    f.extractions.at(-1)!.resolve(palette("#0011aa"));
    await b;
    f.images[0].onload();
    await a;
    await f.flush();
    expect(f.logo).toBe("resized:raw-B");
    expect(f.urls).not.toContain("resized:raw-A");
    expect(f.colors.join()).toContain("#0011aa");
  });

  it("raster image decode error releases current loading and preserves previous logo", async () => {
    const f = await ready();
    const pending = f.upload("bad.png", "image/png");
    f.reads[0].resolve("invalid-image");
    await f.flush();
    f.images[0].onerror();
    await pending;
    expect(f.logo).toBe("logo-original");
    expect(f.loading).toBe(false);
    expect(f.notices.error).toHaveBeenCalledWith("Arquivo de imagem inválido.");
  });

  it("A/B extraction out of order (same file/logo) retains B palette; A finally cannot clear B loading", async () => {
    const f = await ready();
    const a = f.upload("same.svg");
    f.reads[0].resolve("same-logo");
    await f.flush();
    const requestA = f.extractions.at(-1)!;
    const b = f.upload("same.svg");
    f.reads[1].resolve("same-logo");
    await f.flush();
    requestA.resolve(palette("#aa0011"));
    await a;
    await f.flush();
    expect(f.loading).toBe(true);
    expect(f.button("Salvar Personalização deste Cliente").props.disabled).toBe(
      true
    );
    f.extractions.at(-1)!.resolve(palette("#0011aa"));
    await b;
    expect(f.logo).toBe("same-logo");
    expect(f.colors.join()).toContain("#0011aa");
    expect(f.colors.join()).not.toContain("#aa0011");
    expect(f.loading).toBe(false);
  });

  it("B success before A extraction late success cannot replace B draft, palette or notices", async () => {
    const f = await ready();
    const a = f.upload("A.svg");
    f.reads[0].resolve("logo-A");
    await f.flush();
    const old = f.extractions.at(-1)!;
    const b = f.upload("B.svg");
    await completeUpload(f, "logo-B");
    await b;
    old.resolve(palette("#aa0011"));
    await a;
    await f.flush();
    expect(f.logo).toBe("logo-B");
    expect(f.colors.join()).not.toContain("#aa0011");
    expect(f.notices.success).toHaveBeenCalledTimes(1);
  });

  it.each(["resize", "extraction"])(
    "remove during %s invalidates work and never resurrects logo",
    async stage => {
      const f = await ready();
      const pending = f.upload();
      if (stage === "extraction") {
        f.reads[0].resolve("removed-logo");
        await f.flush();
      }
      await f.click("Remover");
      expect(f.logo).toBeNull();
      expect(f.loading).toBe(false);
      if (stage === "resize") f.reads[0].resolve("removed-logo");
      else f.extractions.at(-1)!.resolve(palette());
      await pending;
      await f.flush();
      expect(f.logo).toBeNull();
      expect(f.colors).toEqual([]);
      expect(f.notices.success).not.toHaveBeenCalled();
    }
  );

  it("cancel processing makes save possible without the discarded upload draft", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].resolve("discarded");
    await f.flush();
    const old = f.extractions.at(-1)!;
    await f.click("Cancelar processamento da logo");
    expect(f.loading).toBe(false);
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft().logoUrl).toBe("logo-original");
    old.resolve(palette());
    await pending;
    f.mutations[0].resolve(undefined);
    await saving;
    expect(f.onSaved).toHaveBeenCalledTimes(1);
    expect(f.logo).toBe("logo-original");
  });

  it.each(["Cancelar", "dialog-close"])(
    "%s invalidates immediately, before parent updates open",
    async how => {
      const f = await ready();
      const pending = f.upload();
      f.reads[0].resolve("discarded");
      await f.flush();
      if (how === "Cancelar") await f.click(how);
      else f.find(n => n.type === "Dialog").props.onOpenChange(false);
      f.extractions.at(-1)!.resolve(palette());
      await pending;
      expect(f.logo).toBe("logo-original");
      expect(f.onOpenChange).toHaveBeenCalledWith(false);
      expect(f.loading).toBe(false);
      expect(f.notices.success).not.toHaveBeenCalled();
    }
  );

  it("close/reopen same scope/logo discards old success and keeps new loading", async () => {
    const f = mount();
    const old = f.extractions[0];
    f.update({ open: false });
    f.update({ open: true });
    old.resolve(palette("#aa0011"));
    await f.flush();
    expect(f.loading).toBe(true);
    expect(f.colors).toEqual([]);
    f.extractions[1].resolve(palette("#0011aa"));
    await f.flush();
    expect(f.colors.join()).toContain("#0011aa");
    expect(f.loading).toBe(false);
  });

  it("new config/logo in same hospital discards previous initial palette", async () => {
    const f = mount();
    const old = f.extractions[0];
    f.update({ configAtual: config("logo-new") });
    f.extractions[1].resolve(palette("#0011aa"));
    await f.flush();
    old.resolve(palette("#aa0011"));
    await f.flush();
    expect(f.logo).toBe("logo-new");
    expect(f.colors.join()).not.toContain("#aa0011");
  });

  it("defensive hospital scope invalidation works even with same config object (not a real-flow bypass claim)", async () => {
    const f = mount();
    const old = f.extractions[0];
    f.update({ estabelecimentoId: 202 });
    old.resolve(palette("#aa0011"));
    await f.flush();
    expect(f.loading).toBe(true);
    expect(f.colors).toEqual([]);
    f.extractions[1].resolve(palette());
    await f.flush();
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.saves[0].estabelecimentoId).toBe(202);
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("new manual preset during upload wins while extraction and logo remain enabled", async () => {
    const f = await ready();
    const pending = f.upload();
    const presetKey = Object.keys(
      BI_THEME_PRESETS
    )[1] as keyof typeof BI_THEME_PRESETS;
    const name = BI_THEME_PRESETS[presetKey].nome;
    const preset = f
      .all()
      .find(
        n => n.type === "button" && JSON.stringify(n.children).includes(name)
      )!;
    preset.props.onClick();
    await completeUpload(f, "logo-new");
    await pending;
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft().temaPreset).toBe(presetKey);
    expect(f.draft().corFundoCustom).toBeNull();
    expect(f.draft().logoUrl).toBe("logo-new");
    expect(f.colors.length).toBeGreaterThan(0);
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("manual custom color after await starts is not overwritten by automatic palette", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].resolve("logo-new");
    await f.flush();
    f.find(n => n.props.onChangeCapture).props.onChangeCapture();
    f.find(
      n => n.type === "Input" && n.props.placeholder === "#073b4c"
    ).props.onChange({ target: { value: "#123456" } });
    f.extractions.at(-1)!.resolve(palette());
    await pending;
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft().corFundoCustom).toBe("#123456");
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("automatic toggle changed during upload uses latest preference, not pre-await closure", async () => {
    const f = await ready();
    const pending = f.upload();
    f.all()
      .find(n => n.type === "Switch")!
      .props.onCheckedChange(false);
    await completeUpload(f, "logo-new");
    await pending;
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft().temaPreset).toBe(DEFAULT_BI_CLIENT_CONFIG.temaPreset);
    expect(f.colors.length).toBeGreaterThan(0);
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("latest automatic toggle on still applies unchanged Power BI theme", async () => {
    const f = await ready();
    f.all()
      .find(n => n.type === "Switch")!
      .props.onCheckedChange(false);
    const pending = f.upload();
    f.all()
      .find(n => n.type === "Switch")!
      .props.onCheckedChange(true);
    await completeUpload(f, "logo-new");
    await pending;
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft()).toMatchObject(
      extractor.gerarCamposTemaPorCoresDaLogo(
        "#0044bb",
        "#cc8800",
        "executivo_escuro"
      )
    );
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("A/B reapply out of order keeps B and uses real Power BI theme generator", async () => {
    const f = mount();
    f.extractions[0].reject(Error("synthetic"));
    await f.flush();
    const apply = f.button("Aplicar cores da logo").props.onClick;
    const a = apply();
    const extractionA = f.extractions.at(-1)!;
    const b = apply();
    const extractionB = f.extractions.at(-1)!;
    extractionB.resolve(palette("#0011aa"));
    await b;
    extractionA.resolve(palette("#aa0011"));
    await a;
    await f.click("Executivo Claro");
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft()).toMatchObject(
      extractor.gerarCamposTemaPorCoresDaLogo(
        "#0011aa",
        "#cc8800",
        "executivo_claro"
      )
    );
    expect(f.colors.join()).not.toContain("#aa0011");
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("manual theme choice during uncached reapply wins without disabling palette extraction", async () => {
    const f = mount();
    f.extractions[0].reject(Error("synthetic"));
    await f.flush();
    const applying = f.click("Aplicar cores da logo");
    f.find(n => n.props.onChangeCapture).props.onChangeCapture();
    f.find(
      n => n.type === "Input" && n.props.placeholder === "#073b4c"
    ).props.onChange({ target: { value: "#abcdef" } });
    f.extractions.at(-1)!.resolve(palette());
    await applying;
    const saving = f.click("Salvar Personalização deste Cliente");
    expect(f.draft().corFundoCustom).toBe("#abcdef");
    expect(f.colors.join()).toContain("#008844");
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("uncached reapply error releases loading and keeps current draft", async () => {
    const f = mount();
    f.extractions[0].reject(Error("synthetic"));
    await f.flush();
    const applying = f.click("Aplicar cores da logo");
    f.extractions.at(-1)!.reject(Error("synthetic-reapply"));
    await applying;
    expect(f.loading).toBe(false);
    expect(f.logo).toBe("logo-original");
    expect(f.notices.error).toHaveBeenCalledWith(
      "Não foi possível ler automaticamente as cores desta imagem."
    );
  });

  it("captured save handler after successful upload reads latest draft before next render", async () => {
    const f = await ready();
    const saveBefore = f.button("Salvar Personalização deste Cliente").props
      .onClick;
    const pending = f.upload();
    await saveBefore();
    expect(f.saves).toHaveLength(0);
    await completeUpload(f, "logo-new");
    await pending;
    const saving = saveBefore();
    expect(f.draft().logoUrl).toBe("logo-new");
    expect(f.draft().temaPreset).toBe("custom");
    f.mutations[0].resolve(undefined);
    await saving;
  });

  it("reset invalidates upload and freezes controls until mutation completes", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].resolve("discarded");
    await f.flush();
    const old = f.extractions.at(-1)!;
    const resetting = f.click("Restaurar padrão Safatle");
    expect(f.resets).toEqual([{ estabelecimentoId: 101 }]);
    expect(f.find(n => n.type === "fieldset").props.disabled).toBe(true);
    expect(f.button("Cancelar").props.disabled).toBe(true);
    expect(f.button("Salvar Personalização deste Cliente").props.disabled).toBe(
      true
    );
    await f.click("Salvar Personalização deste Cliente");
    await f.upload();
    expect(f.reads).toHaveLength(1);
    f.find(n => n.type === "Dialog").props.onOpenChange(false);
    expect(f.onOpenChange).not.toHaveBeenCalled();
    old.resolve(palette());
    await pending;
    f.mutations[0].resolve({ config: config(null) });
    await resetting;
    expect(f.logo).toBeNull();
    expect(f.onSaved).toHaveBeenCalledTimes(1);
    expect(f.notices.success).toHaveBeenCalledTimes(1);
  });

  it("save locks controls and duplicate/captured calls do not submit twice", async () => {
    const f = await ready();
    const handler = f.button("Salvar Personalização deste Cliente").props
      .onClick;
    const saving = handler();
    await handler();
    await f.click("Restaurar padrão Safatle");
    expect(f.saves).toHaveLength(1);
    expect(f.resets).toHaveLength(0);
    expect(f.find(n => n.type === "fieldset").props.disabled).toBe(true);
    f.mutations[0].resolve(undefined);
    await saving;
    expect(f.invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(["save", "reset"])(
    "%s error releases UI and reports only current error",
    async kind => {
      const f = await ready();
      const work = f.click(
        kind === "save"
          ? "Salvar Personalização deste Cliente"
          : "Restaurar padrão Safatle"
      );
      f.mutations[0].reject(Error("synthetic-mutation-error"));
      await work;
      expect(f.find(n => n.type === "fieldset").props.disabled).toBe(false);
      expect(
        f.button("Salvar Personalização deste Cliente").props.disabled
      ).toBe(false);
      expect(f.onSaved).not.toHaveBeenCalled();
      expect(f.notices.error).toHaveBeenCalledWith("synthetic-mutation-error");
    }
  );

  it("extraction error still accepts uploaded logo without replacing theme", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].resolve("logo-without-palette");
    await f.flush();
    f.extractions.at(-1)!.reject(Error("synthetic-extract"));
    await pending;
    expect(f.logo).toBe("logo-without-palette");
    expect(f.loading).toBe(false);
    expect(f.colors).toEqual([]);
  });

  it("resize error releases loading without accepting the new logo", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].reject(Error("synthetic-read"));
    await pending;
    expect(f.logo).toBe("logo-original");
    expect(f.loading).toBe(false);
    expect(f.notices.error).toHaveBeenCalledTimes(1);
    expect(f.input.value).toBe("");
  });

  it("stale resize error is silent and does not clean current loading/input", async () => {
    const f = await ready();
    const a = f.upload("A.svg");
    const b = f.upload("B.svg");
    f.reads[0].reject(Error("synthetic-read"));
    await a;
    expect(f.loading).toBe(true);
    expect(f.notices.error).not.toHaveBeenCalled();
    await completeUpload(f, "logo-B");
    await b;
  });

  it.each(["initial", "upload", "save", "reset"])(
    "unmount during %s has no late draft/loading writes or success/error callbacks",
    async kind => {
      const f = kind === "initial" ? mount() : await ready();
      let pending: Promise<unknown> | undefined;
      if (kind === "upload") {
        pending = f.upload();
        f.reads[0].resolve("discarded");
        await f.flush();
      }
      if (kind === "save" || kind === "reset")
        pending = f.click(
          kind === "save"
            ? "Salvar Personalização deste Cliente"
            : "Restaurar padrão Safatle"
        );
      f.unmount();
      if (kind === "initial" || kind === "upload")
        f.extractions.at(-1)!.resolve(palette());
      else f.mutations[0].resolve({ config: config(null) });
      await pending;
      await f.flush();
      expect(f.writesAfterUnmount).toBe(0);
      expect(f.onSaved).not.toHaveBeenCalled();
      expect(f.onOpenChange).not.toHaveBeenCalled();
      expect(f.notices.success).not.toHaveBeenCalled();
      expect(f.notices.error).not.toHaveBeenCalled();
    }
  );

  it("upload unmount also cancels deferred resize before extraction", async () => {
    const f = await ready();
    const pending = f.upload();
    f.unmount();
    f.reads[0].resolve("discarded-before-extraction");
    await pending;
    await f.flush();
    expect(f.urls).toEqual(["logo-original"]);
    expect(f.writesAfterUnmount).toBe(0);
    expect(f.notices.success).not.toHaveBeenCalled();
  });

  it("late extraction rejection after unmount is consumed without UI/error callback", async () => {
    const f = await ready();
    const pending = f.upload();
    f.reads[0].resolve("discarded");
    await f.flush();
    f.unmount();
    f.extractions.at(-1)!.reject(Error("synthetic-late"));
    await pending;
    await f.flush();
    expect(f.writesAfterUnmount).toBe(0);
    expect(f.notices.error).not.toHaveBeenCalled();
  });

  it("forced lifecycle change during reset discards stale success and does not close reopened dialog", async () => {
    const f = await ready();
    const reset = f.click("Restaurar padrão Safatle");
    f.update({ open: false });
    f.update({ open: true });
    f.mutations[0].resolve({ config: config(null) });
    await reset;
    expect(f.logo).toBe("logo-original");
    expect(f.onSaved).not.toHaveBeenCalled();
    expect(f.onOpenChange).not.toHaveBeenCalled();
    expect(f.loading).toBe(true);
    f.extractions.at(-1)!.resolve(palette());
    await f.flush();
    expect(f.loading).toBe(false);
  });
});

describe("biLogoOperation — actual deferred cancellation", () => {
  it("same scope/logo new generation aborts A; stale success/finally cannot finish B", async () => {
    const owner = operation.createBiLogoOperationOwner();
    const a = owner.begin(1, "same-logo", "apply");
    const request = deferred<number>();
    const awaited = operation.awaitBiLogoOperation(request.promise, a);
    const rejection = expect(awaited).rejects.toMatchObject({
      name: "AbortError",
    });
    const b = owner.begin(1, "same-logo", "apply");
    await rejection;
    request.resolve(42);
    await Promise.resolve();
    expect(a.signal.aborted).toBe(true);
    expect(owner.isCurrent(a)).toBe(false);
    expect(owner.finish(a)).toBe(false);
    expect(owner.isCurrent(b)).toBe(true);
    expect(owner.finish(b)).toBe(true);
    expect(owner.kind).toBeNull();
  });
  it("late underlying rejection after cancel is handled and cannot become current", async () => {
    const owner = operation.createBiLogoOperationOwner();
    const token = owner.begin(1, "logo", "upload");
    const request = deferred<number>();
    const awaited = operation.awaitBiLogoOperation(request.promise, token);
    const rejected = expect(awaited).rejects.toMatchObject({
      name: "AbortError",
    });
    owner.invalidate();
    await rejected;
    request.reject(Error("late"));
    await Promise.resolve();
    expect(owner.finish(token)).toBe(false);
  });
});
