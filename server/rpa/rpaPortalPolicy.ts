import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Browser, CDPSession, Frame, Page, Protocol } from "puppeteer";
import { validarUrlPortalConvenio } from "./cofreCredenciais";

export interface ContextoPortalRpa {
  convenio: string;
  registroAns?: string | null;
}

export interface DependenciasPoliticaPortal {
  /** Sempre resolve TODOS os A/AAAA; testes devem injetar resolução sintética. */
  resolverDns?: (host: string) => Promise<readonly { address: string; family: number }[]>;
  /** Somente imagens raster data: locais conhecidas, nunca documentos/scripts/blob:. */
  assetsInlinePermitidos?: readonly string[];
}

export class ErroPoliticaPortal extends Error {
  constructor() {
    super("Destino ou contexto bloqueado pela política de segurança do portal RPA; revisão necessária.");
    this.name = "ErroPoliticaPortal";
  }
}

interface EstadoPolitica {
  contexto: ContextoPortalRpa;
  dependencias: DependenciasPoliticaPortal;
  bloqueado: boolean;
  pronta: Promise<void>;
  requestsPendentes: Set<Promise<void>>;
}

const politicas = new WeakMap<Browser, EstadoPolitica>();

/** Não aceita endereços não globais, inválidos, IPv4-mapped nem mecanismos de transição. */
export function enderecoDnsPublico(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  // Normalização do URL expande a notação IPv4-mapped para hex, sem DNS.
  const host = new URL(`https://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  const primeiro = Number.parseInt(host.split(":")[0], 16);
  // Apenas unicast global 2000::/3. Isso também recusa ::, ::1, fc/fd, fe80 e ff.
  if (!Number.isFinite(primeiro) || primeiro < 0x2000 || primeiro > 0x3fff) return false;
  // 2001::/23 é reservado (Teredo, benchmarking, ORCHID etc.), 2001:db8 e 6to4.
  const segundo = Number.parseInt(host.split(":")[1] || "0", 16);
  return !(primeiro === 0x2002 || (primeiro === 0x2001 && (segundo < 0x200 || segundo === 0xdb8)));
}

function validarCanonica(url: string, estado: EstadoPolitica): string {
  // O fallback da allowlist para convênio desconhecido não é aceitável nesta fronteira.
  const nome = estado.contexto.convenio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (!["UNIMED", "IPASGO", "CASSI", "CAIXA", "BRADESCO", "SULAMERICA", "SUL AMERICA", "AMIL", "GEAP"].some(t => nome.includes(t))) {
    throw new ErroPoliticaPortal();
  }
  // Usa a regra pelo nome, evitando que ANS conflitante selecione outra operadora.
  const canonical = validarUrlPortalConvenio(url, estado.contexto.convenio);
  if (estado.contexto.registroAns) {
    validarUrlPortalConvenio(canonical, estado.contexto.convenio, estado.contexto.registroAns);
  }
  return canonical;
}

async function validarDestino(url: string, estado: EstadoPolitica): Promise<void> {
  const canonical = validarCanonica(url, estado);
  const resolver = estado.dependencias.resolverDns ?? (host => lookup(host, { all: true, verbatim: true }));
  const respostas = await resolver(new URL(canonical).hostname);
  if (!respostas.length || respostas.some(r =>
    (r.family !== 4 && r.family !== 6) || isIP(r.address) !== r.family || !enderecoDnsPublico(r.address))) {
    throw new ErroPoliticaPortal();
  }
}

function verificarBloqueio(estado: EstadoPolitica): void {
  if (estado.bloqueado) throw new ErroPoliticaPortal();
}

async function validarArvoreFrame(
  frameId: string,
  arvore: Protocol.Page.FrameTree,
  estado: EstadoPolitica,
  ancestrais: Protocol.Page.Frame[] = []
): Promise<boolean> {
  const caminho = [...ancestrais, arvore.frame];
  if (arvore.frame.id === frameId) {
    for (const frame of caminho) {
      await validarDestino(frame.url, estado);
      if (frame.securityOrigin !== new URL(frame.url).origin) throw new ErroPoliticaPortal();
    }
    return true;
  }
  for (const child of arvore.childFrames ?? []) {
    if (await validarArvoreFrame(frameId, child, estado, caminho)) return true;
  }
  return false;
}

async function interceptar(
  session: CDPSession,
  evento: Protocol.Fetch.RequestPausedEvent,
  estado: EstadoPolitica
): Promise<void> {
  try {
    verificarBloqueio(estado);
    const request = evento.request;
    const inline = estado.dependencias.assetsInlinePermitidos?.includes(request.url) &&
      evento.resourceType === "Image" && request.method === "GET" && !request.postData &&
      /^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(request.url);
    if (!inline) await validarDestino(request.url, estado);
    // Document inclui redirects, iframe, navegação e POST de formulário.
    // Requisições de recursos/fetch/uploads também precisam de iniciador confiável.
    if (evento.resourceType !== "Document" || request.method !== "GET") {
      const { frameTree } = await session.send("Page.getFrameTree");
      if (!await validarArvoreFrame(evento.frameId, frameTree, estado)) throw new ErroPoliticaPortal();
    }
    verificarBloqueio(estado);
    await session.send("Fetch.continueRequest", { requestId: evento.requestId });
  } catch {
    estado.bloqueado = true;
    try {
      await session.send("Fetch.failRequest", { requestId: evento.requestId, errorReason: "BlockedByClient" });
    } catch {
      // Não continuar se o target foi fechado ou a intercepção falhou.
      await session.send("Page.stopLoading").catch(() => {});
    }
  }
}

async function instalarNoBrowser(browser: Browser, estado: EstadoPolitica): Promise<void> {
  const root = await browser.target().createCDPSession();
  const pendentes = new Set<Promise<void>>();
  const instalarFilhos = async (parent: CDPSession): Promise<void> => {
    parent.on("Target.attachedToTarget", evento => {
      const tarefa = (async () => {
        const session = parent.connection()?.session(evento.sessionId);
        if (!session) throw new ErroPoliticaPortal();
        const tipo = evento.targetInfo.type;
        if (tipo !== "page" && tipo !== "iframe" && tipo !== "tab") {
          // Workers/service-workers não podem criar canais de rede fora da política.
          await root.send("Target.closeTarget", { targetId: evento.targetInfo.targetId });
          return;
        }
        if (tipo !== "tab") {
          session.on("Fetch.requestPaused", event => {
            const tarefa = interceptar(session, event, estado);
            estado.requestsPendentes.add(tarefa);
            void tarefa.finally(() => estado.requestsPendentes.delete(tarefa));
          });
          await session.send("Network.enable");
          session.on("Network.loadingFailed", event => {
            if (event.blockedReason === "inspector") estado.bloqueado = true;
          });
          await session.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
          await session.send("Network.setCacheDisabled", { cacheDisabled: true });
          await session.send("Network.setBypassServiceWorker", { bypass: true });
          await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
        }
        // Autoattach recursivo cobre iframe OOPIF e popup ANTES de liberar sua execução.
        await instalarFilhos(session);
        await session.send("Runtime.runIfWaitingForDebugger");
      })().catch(async () => {
        estado.bloqueado = true;
        await root.send("Target.closeTarget", { targetId: evento.targetInfo.targetId }).catch(() => {});
      });
      pendentes.add(tarefa);
      void tarefa.finally(() => pendentes.delete(tarefa));
    });
    await parent.send("Target.setAutoAttach", {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    });
  };
  await instalarFilhos(root);
  while (pendentes.size) await Promise.all([...pendentes]);
  verificarBloqueio(estado);
}

/** Uma operadora por browser/operação. Configurar antes de goto/fill/upload/click. */
export async function configurarPoliticaPortal(
  page: Page,
  contexto: ContextoPortalRpa,
  dependencias: DependenciasPoliticaPortal = {}
): Promise<void> {
  const browser = page.browser();
  const existente = politicas.get(browser);
  if (existente) {
    if (existente.contexto.convenio !== contexto.convenio || existente.contexto.registroAns !== contexto.registroAns) {
      existente.bloqueado = true;
      throw new ErroPoliticaPortal();
    }
    await existente.pronta;
    verificarBloqueio(existente);
    return;
  }
  const estado: EstadoPolitica = {
    contexto: { ...contexto }, dependencias: { ...dependencias, assetsInlinePermitidos: [...(dependencias.assetsInlinePermitidos ?? [])] },
    bloqueado: false, pronta: Promise.resolve(),
    requestsPendentes: new Set(),
  };
  politicas.set(browser, estado);
  estado.pronta = instalarNoBrowser(browser, estado).catch(() => {
    estado.bloqueado = true;
    throw new ErroPoliticaPortal();
  });
  await estado.pronta;
}

/** Chamar imediatamente antes de cada ação sensível no Page/Frame do elemento. */
export async function validarContextoPortalAntesDeCredenciais(alvo: Page | Frame): Promise<void> {
  const page = "mainFrame" in alvo ? alvo : alvo.page();
  const estado = politicas.get(page.browser());
  if (!estado) throw new ErroPoliticaPortal();
  await estado.pronta;
  await assegurarPoliticaPortalSemBloqueios(page);
  try {
    const frame = "mainFrame" in alvo ? alvo.mainFrame() : alvo;
    const frames = new Set<Frame>([page.mainFrame()]);
    for (let f: Frame | null = frame; f; f = f.parentFrame()) frames.add(f);
    for (const f of frames) {
      await validarDestino(f.url(), estado);
      const dom = await f.evaluate(() => ({
        href: location.href,
        origin: location.origin,
        base: document.baseURI,
        actions: [
          ...Array.from(document.forms, form => form.action || location.href),
          ...Array.from(document.querySelectorAll<HTMLButtonElement | HTMLInputElement>("[formaction]"), el => el.formAction),
        ],
      }));
      if (dom.origin !== new URL(f.url()).origin || new URL(dom.href).origin !== dom.origin || new URL(dom.base).origin !== dom.origin) {
        throw new ErroPoliticaPortal();
      }
      await validarDestino(dom.href, estado);
      for (const action of dom.actions) await validarDestino(new URL(action, dom.base).href, estado);
    }
    verificarBloqueio(estado);
  } catch {
    estado.bloqueado = true;
    throw new ErroPoliticaPortal();
  }
}

/** Impede que um bloqueio assíncrono de asset/redirect resulte em sucesso silencioso. */
export async function assegurarPoliticaPortalSemBloqueios(page: Page): Promise<void> {
  const estado = politicas.get(page.browser());
  if (!estado) throw new ErroPoliticaPortal();
  await estado.pronta;
  while (estado.requestsPendentes.size) await Promise.all([...estado.requestsPendentes]);
  verificarBloqueio(estado);
}
