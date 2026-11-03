import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Browser, CDPSession, Frame, Page } from "puppeteer";
import {
  assegurarPoliticaPortalSemBloqueios,
  configurarPoliticaPortal,
  enderecoDnsPublico,
  ErroPoliticaPortal,
  validarContextoPortalAntesDeCredenciais,
  type DependenciasPoliticaPortal,
} from "./rpaPortalPolicy";
import { RoboSaudeCaixa } from "./robos/RoboSaudeCaixa";
import { RoboIpasgo } from "./robos/RoboIpasgo";
import { RoboCassi } from "./robos/RoboCassi";
import { RoboUnimed } from "./robos/RoboUnimed";

vi.mock("../../server/db", () => ({ getDb: vi.fn(() => { throw new Error("DB proibido no teste"); }) }));
vi.mock("node:fs", () => ({ default: { existsSync: vi.fn(() => true), mkdirSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() } }));
vi.mock("fs", () => ({ default: { existsSync: vi.fn(() => true), mkdirSync: vi.fn(), readFileSync: vi.fn(() => Buffer.from("sintetico")), writeFileSync: vi.fn() } }));
vi.mock("../../drizzle/schema", () => ({ arquivos: {} }));
vi.mock("drizzle-orm", () => ({ like: vi.fn() }));
vi.mock("puppeteer", () => ({ default: { launch: vi.fn(() => { throw new Error("Browser real proibido"); }) } }));
vi.mock("../../server/_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const portal = "https://portal.unimedgoiania.coop.br/login";
const publico = [{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];

class SessaoSintetica {
  handlers = new Map<string, (event: unknown) => void>();
  filhos = new Map<string, SessaoSintetica>();
  arvore = { frame: { id: "main", url: portal, securityOrigin: new URL(portal).origin } };
  send = vi.fn(async (method: string, _params?: unknown) => {
    if (method === "Page.getFrameTree") return { frameTree: this.arvore };
    return {};
  });
  on(event: string, handler: (event: unknown) => void) { this.handlers.set(event, handler); return this; }
  connection() { return { session: (id: string) => this.filhos.get(id) }; }
  async emitir(event: string, payload: unknown) {
    this.handlers.get(event)?.(payload);
    // Apenas drena microtasks/ações assíncronas do mock, sem rede ou timers longos.
    for (let i = 0; i < 30; i++) await Promise.resolve();
  }
  async anexar(tipo: string, id: string) {
    const filho = new SessaoSintetica();
    this.filhos.set(id, filho);
    await this.emitir("Target.attachedToTarget", { sessionId: id, targetInfo: { type: tipo, targetId: id } });
    return filho;
  }
}

function ambiente(url = portal) {
  const root = new SessaoSintetica();
  let atual = url;
  let origin = new URL(url).origin;
  let base = url;
  let actions: string[] = [];
  const main = {
    url: () => atual,
    parentFrame: () => null,
    evaluate: vi.fn(async () => ({ href: atual, origin, base, actions })),
    page: () => page,
  };
  const browser = {
    target: () => ({ createCDPSession: async () => root as unknown as CDPSession }),
    close: vi.fn(async () => {}),
    pages: async () => [page],
  };
  const field = { click: vi.fn(async () => {}), type: vi.fn(async () => {}) };
  const page = {
    browser: () => browser as unknown as Browser,
    mainFrame: () => main as unknown as Frame,
    url: () => atual,
    goto: vi.fn(async () => {}),
    frames: () => [],
    evaluate: vi.fn(async () => false),
    target: () => ({ createCDPSession: async () => root }),
    waitForSelector: vi.fn(async () => {}),
    waitForNavigation: vi.fn(async () => {}),
    type: vi.fn(async () => {}), click: vi.fn(async () => {}),
    screenshot: vi.fn(async () => ""),
    content: vi.fn(async () => ""),
    $: vi.fn(async () => field),
  };
  return {
    root, page: page as unknown as Page, main: main as unknown as Frame,
    browser, pageMock: page, field,
    mudarUrl: (url: string) => { atual = url; origin = new URL(url).origin; base = url; },
    origem: (value: string) => { origin = value; },
    base: (value: string) => { base = value; },
    actions: (value: string[]) => { actions = value; },
  };
}

function evento(url: string, method = "GET", resourceType = "Document", frameId = "main") {
  return { requestId: "req-1", frameId, resourceType, request: { url, method } };
}

async function configurado(resolverDns: NonNullable<DependenciasPoliticaPortal["resolverDns"]> = vi.fn(async () => publico)) {
  const env = ambiente();
  await configurarPoliticaPortal(env.page, { convenio: "UNIMED" }, { resolverDns });
  const session = await env.root.anexar("page", "popup");
  return { ...env, session, resolverDns };
}

beforeEach(() => vi.clearAllMocks());

describe("DNS e destinos fail-closed", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "192.0.2.1", "203.0.113.1",
    "::", "::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "::ffff:8.8.8.8", "2002:7f00:1::", "2001::1", "2001:db8::1", "invalid",
  ])("recusa IP não público/mapped %s", address => {
    expect(enderecoDnsPublico(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])("aceita unicast público %s", address => {
    expect(enderecoDnsPublico(address)).toBe(true);
  });

  it.each([
    { respostas: [] },
    { respostas: [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }] },
    { respostas: [{ address: "8.8.8.8", family: 4 }, { address: "::ffff:7f00:1", family: 6 }] },
    { respostas: [{ address: "8.8.8.8", family: 6 }] },
  ])("bloqueia resposta DNS vazia/mista/inválida", async ({ respostas }) => {
    const env = await configurado(vi.fn(async () => respostas));
    await env.session.emitir("Fetch.requestPaused", evento(portal));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
    expect(env.session.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
  });

  it("falha DNS aborta sem sucesso silencioso", async () => {
    const env = await configurado(vi.fn(async () => { throw new Error("DNS failure"); }));
    await env.session.emitir("Fetch.requestPaused", evento(portal));
    await expect(assegurarPoliticaPortalSemBloqueios(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it.each([
    "https://evil.example/login", "https://unimedgoiania.coop.br.evil.example/login",
    "https://cassi.com.br/login", "http://portal.unimedgoiania.coop.br/",
    "https://127.0.0.1/", "https://[::ffff:127.0.0.1]/", "data:text/html,secret", "blob:https://portal.unimedgoiania.coop.br/secret",
  ])("bloqueia redirect/document externo ou esquema inseguro %s", async url => {
    const env = await configurado();
    await env.session.emitir("Fetch.requestPaused", evento(url));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
    expect(env.resolverDns).not.toHaveBeenCalled();
  });

  it("revalida DNS em cada salto de redirect e não cacheia IP público", async () => {
    const dns = vi.fn().mockResolvedValueOnce(publico).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const env = await configurado(dns);
    await env.session.emitir("Fetch.requestPaused", evento(portal));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
    await env.session.emitir("Fetch.requestPaused", evento(`${portal}?redirect=2`));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
    expect(dns).toHaveBeenCalledTimes(2);
  });
});

describe("Intercepção efetiva e novos targets", () => {
  it("instala Fetch antes de liberar popup e habilita proteção de cache/service-worker", async () => {
    const env = await configurado();
    const methods = env.session.send.mock.calls.map(([method]) => method);
    expect(methods.indexOf("Fetch.enable")).toBeLessThan(methods.indexOf("Runtime.runIfWaitingForDebugger"));
    expect(env.root.send).toHaveBeenCalledWith("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    expect(env.session.send).toHaveBeenCalledWith("Network.setBypassServiceWorker", { bypass: true });
    expect(env.session.send).toHaveBeenCalledWith("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
    await env.session.emitir("Fetch.requestPaused", evento("https://external.example/login"));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
  });

  it("instala proteção recursiva em OOPIF antes de executar", async () => {
    const env = await configurado();
    const iframe = await env.session.anexar("iframe", "iframe-new");
    expect(iframe.send).toHaveBeenCalledWith("Fetch.enable", expect.anything());
    await iframe.emitir("Fetch.requestPaused", evento("https://external.example/frame"));
    expect(iframe.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
  });

  it.each(["worker", "service_worker", "shared_worker"])("fecha canal de rede não interceptável %s", async tipo => {
    const env = await configurado();
    const worker = await env.session.anexar(tipo, "worker-new");
    expect(env.root.send).toHaveBeenCalledWith("Target.closeTarget", { targetId: "worker-new" });
    expect(worker.send).not.toHaveBeenCalledWith("Runtime.runIfWaitingForDebugger");
  });

  it.each(["XHR", "Fetch", "Document"])("aborta envio POST/remote upload externo %s", async resource => {
    const env = await configurado();
    await env.session.emitir("Fetch.requestPaused", evento("https://external.example/upload", "POST", resource));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
  });

  it("permite POST aprovado apenas com frame e ancestrais aprovados", async () => {
    const env = await configurado();
    await env.session.emitir("Fetch.requestPaused", evento(portal, "POST"));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
    env.session.arvore.frame.url = "https://external.example/iframe";
    await env.session.emitir("Fetch.requestPaused", evento(portal, "POST"));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
  });

  it("não envia POST de frame opaco mesmo com URL aprovada", async () => {
    const env = await configurado();
    env.session.arvore.frame.securityOrigin = "null";
    await env.session.emitir("Fetch.requestPaused", evento(portal, "POST"));
    expect(env.session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
    expect(env.session.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
  });

  it("bloqueio websocket/CDP não permite sucesso silencioso", async () => {
    const env = await configurado();
    await env.session.emitir("Network.loadingFailed", { blockedReason: "inspector" });
    await expect(assegurarPoliticaPortalSemBloqueios(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("asset CDN não aprovado bloqueia sessão e impede retorno silencioso de sucesso", async () => {
    const env = await configurado();
    await env.session.emitir("Fetch.requestPaused", evento("https://cdn.example/script.js", "GET", "Script"));
    await expect(assegurarPoliticaPortalSemBloqueios(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("aguarda DNS pendente para não retornar sucesso antes de um bloqueio", async () => {
    let resolver!: (value: typeof publico) => void;
    const dns = new Promise<typeof publico>(resolve => { resolver = resolve; });
    const env = await configurado(vi.fn(() => dns));
    await env.session.emitir("Fetch.requestPaused", evento(portal));
    const resultado = assegurarPoliticaPortalSemBloqueios(env.page);
    const verificacao = expect(resultado).rejects.toThrow(ErroPoliticaPortal);
    resolver([{ address: "10.0.0.1", family: 4 }]);
    await verificacao;
  });

  it("exceção inline só aceita imagem raster local explicitamente cadastrada", async () => {
    const env = ambiente();
    const asset = "data:image/png;base64,YQ==";
    await configurarPoliticaPortal(env.page, { convenio: "UNIMED" }, {
      resolverDns: vi.fn(async () => publico), assetsInlinePermitidos: [asset],
    });
    const session = await env.root.anexar("page", "inline");
    await session.emitir("Fetch.requestPaused", evento(asset, "GET", "Image"));
    expect(session.send).toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
    await session.emitir("Fetch.requestPaused", evento(asset, "POST", "Fetch"));
    expect(session.send).toHaveBeenCalledWith("Fetch.failRequest", expect.anything());
  });

  it("erro ao instalar Fetch fecha novo target sem liberá-lo", async () => {
    const env = await configurado();
    const session = new SessaoSintetica();
    session.send.mockImplementation(async method => {
      if (method === "Fetch.enable") throw new Error("interceptor failure");
      return {};
    });
    env.root.filhos.set("bad", session);
    await env.root.emitir("Target.attachedToTarget", { sessionId: "bad", targetInfo: { type: "page", targetId: "bad" } });
    expect(env.root.send).toHaveBeenCalledWith("Target.closeTarget", { targetId: "bad" });
    expect(session.send).not.toHaveBeenCalledWith("Runtime.runIfWaitingForDebugger");
    await expect(assegurarPoliticaPortalSemBloqueios(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });
});

describe("Contexto antes de preencher/anexar/clicar", () => {
  it("exige política configurada", async () => {
    const env = ambiente();
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("aceita página e formulário aprovados", async () => {
    const env = await configurado();
    env.actions(["/submit"]);
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).resolves.toBeUndefined();
  });

  it.each(["https://external.example/collect", "https://127.0.0.1/", "data:text/plain,secret"])("bloqueia form.action/formaction antes de preencher %s", async action => {
    const env = await configurado();
    env.actions([action]);
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("recusa origem opaca/sandbox mesmo com URL na allowlist", async () => {
    const env = await configurado();
    env.origem("null");
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("recusa baseURI externa antes de credenciais", async () => {
    const env = await configurado();
    env.base("https://external.example/");
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("recusa frame externo e página principal externa antes de preencher", async () => {
    const env = await configurado();
    const frame = {
      page: () => env.page, parentFrame: () => env.main, url: () => "https://external.example/iframe",
    } as unknown as Frame;
    await expect(validarContextoPortalAntesDeCredenciais(frame)).rejects.toThrow(ErroPoliticaPortal);
    const outro = await configurado();
    outro.mudarUrl("https://external.example/popup");
    await expect(validarContextoPortalAntesDeCredenciais(outro.page)).rejects.toThrow(ErroPoliticaPortal);
  });

  it("bloqueia troca de operadora na sessão", async () => {
    const env = await configurado();
    await expect(configurarPoliticaPortal(env.page, { convenio: "CASSI" })).rejects.toThrow(ErroPoliticaPortal);
  });

  it("não usa fallback de todos os hosts quando convênio é desconhecido", async () => {
    const env = ambiente();
    const dns = vi.fn(async () => publico);
    await configurarPoliticaPortal(env.page, { convenio: "DESCONHECIDO" }, { resolverDns: dns });
    await expect(validarContextoPortalAntesDeCredenciais(env.page)).rejects.toThrow(ErroPoliticaPortal);
    expect(dns).not.toHaveBeenCalled();
  });
});

class CaixaSintetica extends RoboSaudeCaixa {
  constructor(private env: ReturnType<typeof ambiente>) { super(); }
  protected async iniciarBrowser() { this.page = this.env.page; this.browser = this.env.browser as unknown as Browser; }
  protected async delay() {}
  protected async definirContextoPortal(convenio: string, credenciais: { url: string }) {
    await super.definirContextoPortal(convenio, credenciais, { resolverDns: async () => publico });
  }
}
class IpasgoSintetico extends RoboIpasgo {
  constructor(private env: ReturnType<typeof ambiente>) { super(); }
  protected async iniciarBrowser() { this.page = this.env.page; this.browser = this.env.browser as unknown as Browser; }
  protected async delay() {}
  protected async definirContextoPortal(convenio: string, credenciais: { url: string }) {
    await super.definirContextoPortal(convenio, credenciais, { resolverDns: async () => publico });
  }
}
class CassiSintetico extends RoboCassi {
  constructor(private env: ReturnType<typeof ambiente>) { super(); }
  protected async iniciarBrowser() { this.page = this.env.page; this.browser = this.env.browser as unknown as Browser; }
  protected async delay() {}
  protected async definirContextoPortal(convenio: string, credenciais: { url: string }) {
    await super.definirContextoPortal(convenio, credenciais, { resolverDns: async () => publico });
  }
}
class UnimedSintetica extends RoboUnimed {
  constructor(private env: ReturnType<typeof ambiente>, readonly dns = vi.fn(async () => publico)) { super(); }
  protected async iniciarBrowser() { this.page = this.env.page; this.browser = this.env.browser as unknown as Browser; }
  protected async delay() {}
  protected async capturarEvidenciaTela() { return { path: "", base64: "" }; }
  protected async definirContextoPortal(convenio: string, credenciais: { url: string }) {
    await super.definirContextoPortal(convenio, credenciais, { resolverDns: this.dns });
  }
}
const scopeSintetico = { estabelecimentoId: 900001, convenioId: 900002 };
const loteSintetico = {
  filaId: 900003, numeroLote: "123", nomeArquivo: "sintetico.xml",
  caminhoXml: `${process.cwd()}/uploads/storage_rpa_xml/sintetico.xml`,
};

describe("Regressões nos fluxos reais dos robôs (browser/FS/DB mocks)", () => {
  it("Saúde Caixa não preenche credencial quando form.action aponta para fora e não engole falha", async () => {
    const env = ambiente("https://saudecaixa.com.br/login");
    env.actions(["https://external.example/collect"]);
    await expect(new CaixaSintetica(env).executar({ url: env.page.url(), login: "synthetic", senha: "synthetic" })).rejects.toThrow(/política de segurança/);
    expect(env.pageMock.type).not.toHaveBeenCalled();
    expect(env.pageMock.click).not.toHaveBeenCalled();
    expect(env.browser.close).toHaveBeenCalled();
    expect(env.root.send).toHaveBeenCalledWith("Target.setAutoAttach", expect.anything());
  });

  it("Saúde Caixa preenche e clica apenas quando contexto aprovado", async () => {
    const env = ambiente("https://saudecaixa.com.br/login");
    const result = await new CaixaSintetica(env).executar({ url: env.page.url(), login: "synthetic", senha: "synthetic" });
    expect(result.status).toBe("sucesso");
    expect(env.pageMock.type).toHaveBeenCalledTimes(2);
    expect(env.pageMock.click).toHaveBeenCalledTimes(1);
  });

  it("IPASGO bloqueia form externo antes de handle.type/login real", async () => {
    const env = ambiente("https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx");
    env.actions(["https://external.example/collect"]);
    await expect(new IpasgoSintetico(env).executar({ ...scopeSintetico, url: env.page.url(), login: "synthetic", senha: "synthetic" })).rejects.toThrow(ErroPoliticaPortal);
    expect(env.field.type).not.toHaveBeenCalled();
    expect(env.field.click).not.toHaveBeenCalled();
    expect(env.browser.close).toHaveBeenCalled();
  });

  it("Cassi configura interceptação antes de navegar e não altera adaptação pendente", async () => {
    const env = ambiente("https://www.cassi.com.br/prestador/");
    const result = await new CassiSintetico(env).executar({ url: env.page.url() });
    expect(result.status).toBe("sucesso");
    expect(env.root.send.mock.invocationCallOrder[0]).toBeLessThan(env.pageMock.goto.mock.invocationCallOrder[0]);
  });

  it.each(["form", "base", "origin", "redirect"] as const)("Unimed executar bloqueia %s antes de preencher e propaga política sem fallback", async tipo => {
    const env = ambiente();
    if (tipo === "form") env.actions(["https://external.example/collect"]);
    if (tipo === "base") env.base("https://external.example/");
    if (tipo === "origin") env.origem("null");
    if (tipo === "redirect") env.pageMock.goto.mockImplementation(async () => { env.mudarUrl("https://external.example/login"); });
    await expect(new UnimedSintetica(env).executar({ ...scopeSintetico, url: portal, login: "synthetic", senha: "synthetic" })).rejects.toThrow(ErroPoliticaPortal);
    expect(env.field.type).not.toHaveBeenCalled();
    expect(env.field.click).not.toHaveBeenCalled();
    expect(env.pageMock.type).not.toHaveBeenCalled();
    expect(env.pageMock.evaluate).not.toHaveBeenCalled();
    expect(env.browser.close).toHaveBeenCalled();
    expect(env.root.send.mock.invocationCallOrder[0]).toBeLessThan(env.pageMock.goto.mock.invocationCallOrder[0]);
  });

  it("Unimed produção prova pré-upload quando form externo impede login", async () => {
    const env = ambiente();
    env.actions(["https://external.example/collect"]);
    const resultado = await new UnimedSintetica(env).enviarLotesXml(
      { ...scopeSintetico, url: portal, login: "synthetic", senha: "synthetic" }, [loteSintetico], { modoExecucao: "producao" }
    );
    expect(resultado.resultadosLotes[0]).toMatchObject({ sucesso: false, envioIniciado: false });
    expect(env.field.type).not.toHaveBeenCalled();
    expect(env.pageMock.evaluate).not.toHaveBeenCalled();
    expect(env.browser.close).toHaveBeenCalled();
  });

  it("Unimed revalida antes da senha se formulário muda após usuário", async () => {
    const env = ambiente();
    env.field.type.mockImplementation(async () => { env.actions(["https://external.example/collect"]); });
    await expect(new UnimedSintetica(env).executar({ ...scopeSintetico, url: portal, login: "synthetic", senha: "synthetic" })).rejects.toThrow(ErroPoliticaPortal);
    expect(env.field.type).toHaveBeenCalledTimes(1);
    expect(env.field.type).toHaveBeenCalledWith("synthetic", expect.anything());
    // Só o clique de escolha de perfil; nenhuma submissão de login/fallback.
    expect(env.pageMock.evaluate).toHaveBeenCalledTimes(1);
  });

  it("Unimed não engole política em iframe nem tenta outro login", async () => {
    const env = ambiente();
    env.pageMock.$.mockResolvedValue(null as never);
    const consulta = vi.fn(async () => env.field);
    const frame = { page: () => env.page, parentFrame: () => env.main, url: () => "https://external.example/frame", $: consulta };
    env.pageMock.frames = () => [frame] as never;
    await expect(new UnimedSintetica(env).executar({ ...scopeSintetico, url: portal, login: "synthetic", senha: "synthetic" })).rejects.toThrow(ErroPoliticaPortal);
    expect(consulta).not.toHaveBeenCalled();
    expect(env.field.type).not.toHaveBeenCalled();
    expect(env.pageMock.evaluate).toHaveBeenCalledTimes(1);
  });

  it("Unimed valida aba adotada externa antes de procurar campos", async () => {
    const env = ambiente();
    const popup = ambiente("https://external.example/popup");
    popup.pageMock.browser = () => env.browser as unknown as Browser;
    env.browser.pages = async () => [env.pageMock, popup.pageMock];
    await expect(new UnimedSintetica(env).executar({ ...scopeSintetico, url: portal, login: "synthetic", senha: "synthetic" })).rejects.toThrow(ErroPoliticaPortal);
    expect(popup.pageMock.$).not.toHaveBeenCalled();
    expect(env.field.type).not.toHaveBeenCalled();
    expect(popup.field.type).not.toHaveBeenCalled();
  });

  it("Unimed dry-run não configura browser/política nem resolve DNS", async () => {
    const env = ambiente();
    const robo = new UnimedSintetica(env);
    const resultado = await robo.enviarLotesXml({ ...scopeSintetico, url: portal }, [loteSintetico], { modoExecucao: "simulacao" });
    expect(resultado.resultadosLotes[0]).toMatchObject({ status: "SIMULADO_OK", envioIniciado: false, protocolo: null });
    expect(robo.dns).not.toHaveBeenCalled();
    expect(env.root.send).not.toHaveBeenCalled();
    expect(env.pageMock.goto).not.toHaveBeenCalled();
    expect(env.field.type).not.toHaveBeenCalled();
    expect(env.pageMock.evaluate).not.toHaveBeenCalled();
  });
});
