import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Page } from "puppeteer";
import type { CredenciaisConvenio, LoteParaEnvioRpa } from "./RoboBase";
import { ErroPoliticaPortal } from "./rpaPortalPolicy";
import {
  avaliarConfirmacaoRpa,
  type ConfirmacaoEstruturadaRpa,
  type EstadoConfirmacaoRpa,
} from "./rpaConfirmacao";

// Importar o robô não carrega banco, env, logger real ou objetos reais neste teste.
vi.mock("../db", () => ({ getDb: vi.fn(() => { throw new Error("DB proibido"); }) }));
vi.mock("../../drizzle/schema", () => ({ arquivos: {} }));
vi.mock("drizzle-orm", () => ({ like: vi.fn() }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("fs", () => ({ default: { existsSync: vi.fn(() => true), readFileSync: vi.fn(() => Buffer.from("<xml>sintetico</xml>")), mkdirSync: vi.fn() } }));
vi.mock("puppeteer", () => ({ default: { launch: vi.fn(() => { throw new Error("Browser real proibido"); }) } }));

import fs from "fs";
import { RoboUnimed } from "./robos/RoboUnimed";

const hashXml = createHash("sha256").update("<xml>sintetico</xml>").digest("hex");
const identidade = { numeroLote: "123", nomeArquivo: "rpaConfirmacao_sintetico.xml", hashXmlSha256: hashXml };
const confirmacao: ConfirmacaoEstruturadaRpa = {
  numeroLote: "123",
  protocolo: "222222",
  nomeArquivo: identidade.nomeArquivo,
  estado: "confirmado",
};
function estado(confirmacoes: ConfirmacaoEstruturadaRpa[] = [], protocolosVisiveis: string[] = []): EstadoConfirmacaoRpa {
  return { adaptadorValidado: true, leituraCompleta: true, confirmacoes, protocolosVisiveis };
}
function aguarda(resultado: ReturnType<typeof avaliarConfirmacaoRpa>) {
  expect(resultado).toMatchObject({ sucesso: false, status: "AGUARDANDO_PORTAL" });
  expect(resultado).not.toHaveProperty("protocolo");
}

describe("contrato de confirmação estruturada RPA", () => {
  it("recusa protocolo já presente antes do upload, inclusive em outra linha", () => {
    aguarda(avaliarConfirmacaoRpa(identidade, estado([{ ...confirmacao, numeroLote: "999" }]), estado([confirmacao])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado([], [confirmacao.protocolo]), estado([confirmacao])));
  });

  it("recusa histórico persistente e lote substring", () => {
    aguarda(avaliarConfirmacaoRpa(identidade, estado([confirmacao]), estado([confirmacao])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, numeroLote: "1234" }])));
  });

  it("aceita referência nova, lote e arquivo exatos na mesma confirmação", () => {
    expect(avaliarConfirmacaoRpa(identidade, estado([], ["111111"]), estado([confirmacao]))).toMatchObject({
      sucesso: true, status: "PROTOCOLADO", protocolo: confirmacao.protocolo,
    });
  });

  it("não junta protocolo de uma linha com identidade de outra", () => {
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([
      { ...confirmacao, numeroLote: "999" },
      { ...confirmacao, protocolo: "", estado: "processando" },
    ])));
  });

  it("recusa lote errado e arquivo substring ou ausente", () => {
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, numeroLote: "999" }])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, nomeArquivo: `prefixo_${identidade.nomeArquivo}` }])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, nomeArquivo: null }])));
  });

  it("hash disponível no portal deve coincidir, sem fallback por nome", () => {
    expect(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, hashXmlSha256: hashXml.toUpperCase(), nomeArquivo: null }]))).toMatchObject({ sucesso: true });
    for (const hash of ["f".repeat(64), "", "invalido"]) {
      aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, hashXmlSha256: hash }])));
    }
  });

  it("recusa baseline incompleto ou adaptador sem validação por fixtures", () => {
    for (const parcial of [{ adaptadorValidado: false }, { leituraCompleta: false }]) {
      aguarda(avaliarConfirmacaoRpa(identidade, { ...estado(), ...parcial }, estado([confirmacao])));
      aguarda(avaliarConfirmacaoRpa(identidade, estado(), { ...estado([confirmacao]), ...parcial }));
    }
  });

  it("não corrige lote por sanitização e não aceita protocolo malformado", () => {
    aguarda(avaliarConfirmacaoRpa({ ...identidade, numeroLote: "1/23" }, estado(), estado([confirmacao])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, protocolo: "recibo 222222" }])));
  });

  it("crítica, processamento, timeout ou referências conflitantes permanecem aguardando", () => {
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([confirmacao]), true));
    for (const estadoLinha of ["rejeitado", "processando"] as const) {
      aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([{ ...confirmacao, estado: estadoLinha }])));
      aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([confirmacao, { ...confirmacao, estado: estadoLinha }])));
    }
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([confirmacao, { ...confirmacao, protocolo: "333333" }])));
    aguarda(avaliarConfirmacaoRpa(identidade, estado(), estado([confirmacao, { ...confirmacao, numeroLote: "999" }])));
  });
});

interface ControlePrivadoMock {
  realizarLoginUnimed(): Promise<{ sucesso: boolean; mensagem: string }>;
  navegarParaTelaEnvioXml(): Promise<{ encontrouMenuOuInput: boolean; detalheNavegacao: string }>;
}

function criarCenario(opcoes: {
  antes?: EstadoConfirmacaoRpa;
  depois?: EstadoConfirmacaoRpa;
  falhaLeitura?: "antes" | "depois";
  uploadFalha?: boolean;
  clickFalha?: boolean;
  semBotao?: boolean;
  semInput?: boolean;
  timeout?: boolean;
  screenshotFalha?: boolean;
  fechamentoFalha?: boolean;
  observadorLegado?: boolean;
  bloqueio?: "antes" | "aposUpload" | "aceitacao";
} = {}) {
  const eventos: string[] = [];
  const uploadFile = vi.fn(async () => {
    eventos.push("upload");
    if (opcoes.uploadFalha) throw new Error("timeout upload (conteudo privado)");
  });
  const pagina = {
    url: () => "https://www.unimedgoiania.coop.br/envio",
    frames: () => [],
    $: vi.fn(async () => opcoes.semInput ? null : { uploadFile }),
    waitForNavigation: vi.fn(async () => {
      eventos.push("navegacao");
      if (opcoes.timeout) throw new Error("timeout navegacao");
    }),
    evaluate: vi.fn(async (callback: () => unknown) => {
      // Callback do observador legado roda contra um DOM sintético, jamais HTML real.
      if (opcoes.observadorLegado && callback.toString().includes("matchAll")) {
        eventos.push("observacao-legada");
        const anterior = Object.getOwnPropertyDescriptor(globalThis, "document");
        Object.defineProperty(globalThis, "document", { configurable: true, value: {
          body: { innerText: "lote 123 rpaConfirmacao_sintetico.xml historico protocolo 111111" },
          querySelectorAll: () => [{ textContent: "Protocolo: 111111 lote 123" }],
        } });
        try { return callback(); }
        finally {
          if (anterior) Object.defineProperty(globalThis, "document", anterior);
          else Reflect.deleteProperty(globalThis, "document");
        }
      }
      eventos.push("click");
      if (opcoes.clickFalha) throw new Error("contexto perdido depois de click");
      return !opcoes.semBotao;
    }),
  };
  class RoboMock extends RoboUnimed {
    protected async iniciarBrowser() { this.page = pagina as unknown as Page; }
    protected async definirContextoPortal() { eventos.push("politica-configurada"); }
    protected async validarAntesDeCredenciais() {
      eventos.push("politica-contexto");
      if (opcoes.bloqueio === "antes" || (opcoes.bloqueio === "aposUpload" && eventos.includes("upload"))) {
        throw new ErroPoliticaPortal();
      }
    }
    protected async assegurarPortalSemBloqueios() {
      eventos.push("politica-aceitacao");
      if (opcoes.bloqueio === "aceitacao") throw new ErroPoliticaPortal();
    }
    protected async fecharBrowser() {
      eventos.push("fechar");
      if (opcoes.fechamentoFalha) throw new Error("fechamento indisponivel");
    }
    protected async delay() { /* sem timers ou rede */ }
    protected async capturarEvidenciaTela() {
      eventos.push("screenshot");
      if (opcoes.screenshotFalha) throw new Error("screenshot indisponivel");
      return { path: "", base64: "" };
    }
    private leituras = 0;
    protected async capturarEstadoConfirmacaoRpa(contexto: Page) {
      if (opcoes.observadorLegado) return super.capturarEstadoConfirmacaoRpa(contexto);
      const etapa = this.leituras++ === 0 ? "antes" : "depois";
      eventos.push(etapa);
      if (opcoes.falhaLeitura === etapa) throw new Error("leitura indisponivel");
      return (etapa === "antes" ? opcoes.antes : opcoes.depois) ?? estado(etapa === "depois" ? [confirmacao] : []);
    }
  }
  const robo = new RoboMock();
  const controle = robo as unknown as ControlePrivadoMock;
  vi.spyOn(controle, "realizarLoginUnimed").mockResolvedValue({ sucesso: true, mensagem: "Login sintético" });
  vi.spyOn(controle, "navegarParaTelaEnvioXml").mockResolvedValue({ encontrouMenuOuInput: true, detalheNavegacao: "Navegação sintética" });
  const credenciais: CredenciaisConvenio = { url: "https://www.unimedgoiania.coop.br/envio", estabelecimentoId: 900001, convenioId: 900002 };
  const lote: LoteParaEnvioRpa = {
    filaId: 900003, numeroLote: identidade.numeroLote,
    nomeArquivo: "nome_original_diferente.xml",
    caminhoXml: `${process.cwd()}/uploads/storage_rpa_xml/${identidade.nomeArquivo}`,
  };
  return { eventos, uploadFile, pagina, robo, enviar: () => robo.enviarLotesXml(credenciais, [lote], { modoExecucao: "producao" }) };
}

async function resultadoCenario(cenario: ReturnType<typeof criarCenario>) {
  const resultado = await cenario.enviar();
  expect(resultado.resultadosLotes).toHaveLength(1);
  expect(cenario.eventos.at(-1)).toBe("fechar");
  return resultado.resultadosLotes[0];
}

describe("RoboUnimed.enviarLotesXml com browser/filesystem mocks", () => {
  beforeEach(() => { vi.mocked(fs.existsSync).mockReturnValue(true); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("usa baseline antes de upload/click e aceita nova referência da mesma linha", async () => {
    const cenario = criarCenario({ antes: estado([], ["111111"]) });
    expect(await resultadoCenario(cenario)).toMatchObject({ sucesso: true, status: "PROTOCOLADO", protocolo: "222222", envioIniciado: true });
    expect(cenario.eventos[0]).toBe("politica-configurada");
    expect(cenario.eventos[cenario.eventos.indexOf("antes") - 1]).toBe("politica-contexto");
    expect(cenario.eventos[cenario.eventos.indexOf("upload") - 1]).toBe("politica-contexto");
    expect(cenario.eventos.indexOf("politica-aceitacao")).toBeGreaterThan(cenario.eventos.indexOf("depois"));
    expect(cenario.eventos.indexOf("antes")).toBeLessThan(cenario.eventos.indexOf("upload"));
    expect(cenario.eventos.indexOf("upload")).toBeLessThan(cenario.eventos.indexOf("click"));
    expect(cenario.eventos.indexOf("click")).toBeLessThan(cenario.eventos.indexOf("depois"));
    expect(cenario.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("observador legado real não aceita protocolo antigo + lote/body/histórico", async () => {
    const cenario = criarCenario({ observadorLegado: true });
    aguarda(await resultadoCenario(cenario) as ReturnType<typeof avaliarConfirmacaoRpa>);
    expect(cenario.eventos.filter((etapa) => etapa === "observacao-legada")).toHaveLength(2);
  });

  it.each([
    { antes: estado([confirmacao]) },
    { depois: estado([{ ...confirmacao, numeroLote: "1234" }]) },
    { depois: estado([{ ...confirmacao, numeroLote: "999" }]) },
    { depois: estado([{ ...confirmacao, estado: "rejeitado" }]) },
    { depois: estado() },
  ])("retorno histórico, lote errado ou crítica pós-transmissão não são sucesso/erro retentável: %j", async (opcoes) => {
    const cenario = criarCenario(opcoes);
    const resultado = await resultadoCenario(cenario);
    expect(resultado).toMatchObject({ sucesso: false, status: "AGUARDANDO_PORTAL" });
    expect(resultado).not.toHaveProperty("protocolo");
    expect(cenario.uploadFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    { uploadFalha: true },
    { clickFalha: true },
    { semBotao: true },
    { timeout: true },
    { falhaLeitura: "depois" as const },
    { screenshotFalha: true },
    { fechamentoFalha: true },
  ])("incerteza depois de possível upload/click nunca libera retry: %j", async (opcoes) => {
    const cenario = criarCenario(opcoes);
    const resultado = await resultadoCenario(cenario);
    expect(resultado).toMatchObject({ sucesso: false, status: "AGUARDANDO_PORTAL", envioIniciado: true });
    expect(resultado).not.toHaveProperty("protocolo");
    expect(resultado.mensagem).not.toMatch(/conteudo privado|contexto perdido/);
    expect(cenario.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("falha no baseline é pré-envio e não anexa nem clica", async () => {
    const cenario = criarCenario({ falhaLeitura: "antes" });
    expect(await resultadoCenario(cenario)).toMatchObject({ sucesso: false, status: "ERRO_ROBO", envioIniciado: false });
    expect(cenario.uploadFile).not.toHaveBeenCalled();
    expect(cenario.eventos).not.toContain("click");
  });

  it("sem input permanece erro pré-envio e sem transmissão", async () => {
    const cenario = criarCenario({ semInput: true });
    expect(await resultadoCenario(cenario)).toMatchObject({ sucesso: false, status: "ERRO_PORTAL", envioIniciado: false });
    expect(cenario.uploadFile).not.toHaveBeenCalled();
  });

  it("erro de leitura local do XML é pré-envio", async () => {
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => { throw new Error("leitura local indisponivel"); });
    const cenario = criarCenario();
    expect(await resultadoCenario(cenario)).toMatchObject({ sucesso: false, status: "ERRO_ROBO", envioIniciado: false });
    expect(cenario.uploadFile).not.toHaveBeenCalled();
  });

  it("bloqueio de contexto antes do baseline prova pré-envio e não aciona fallback", async () => {
    const cenario = criarCenario({ bloqueio: "antes" });
    expect(await resultadoCenario(cenario)).toMatchObject({ status: "ERRO_ROBO", envioIniciado: false });
    expect(cenario.uploadFile).not.toHaveBeenCalled();
    expect(cenario.eventos).not.toContain("antes");
    expect(cenario.eventos).not.toContain("click");
  });

  it.each(["aposUpload", "aceitacao"] as const)("bloqueio %s não aceita protocolo nem libera retry", async bloqueio => {
    const cenario = criarCenario({ bloqueio });
    expect(await resultadoCenario(cenario)).toMatchObject({ status: "AGUARDANDO_PORTAL", envioIniciado: true });
    expect(cenario.uploadFile).toHaveBeenCalledTimes(1);
    if (bloqueio === "aposUpload") expect(cenario.eventos).not.toContain("click");
  });

  it("simulação mantém protocolo null e não inicia browser, navega, anexa ou clica", async () => {
    const cenario = criarCenario();
    const resultado = await cenario.robo.enviarLotesXml(
      { url: "https://www.unimedgoiania.coop.br/envio" },
      [{ filaId: 900003, numeroLote: "123", nomeArquivo: identidade.nomeArquivo,
        caminhoXml: `${process.cwd()}/uploads/storage_rpa_xml/${identidade.nomeArquivo}` }],
      { modoExecucao: "simulacao" }
    );
    expect(resultado.resultadosLotes[0]).toMatchObject({ status: "SIMULADO_OK", protocolo: null, envioIniciado: false });
    expect(cenario.eventos).toEqual([]);
    expect(cenario.uploadFile).not.toHaveBeenCalled();
    expect(cenario.pagina.evaluate).not.toHaveBeenCalled();
    expect(cenario.pagina.$).not.toHaveBeenCalled();
  });
});
