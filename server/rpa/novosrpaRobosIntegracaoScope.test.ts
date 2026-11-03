import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "puppeteer";
import type { CredenciaisConvenio } from "./RoboBase";
import type { RpaImportadorScope } from "./rpaImportadorScope";
import { validarConvenioRpa } from "./rpaImportadorScope";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => null),
  importar: vi.fn(async (_path: string, _name: string, _scope: RpaImportadorScope, _competencia?: string) => ({ success: true })),
  launch: vi.fn(() => { throw new Error("Browser real proibido"); }),
  readdir: vi.fn(() => ["retorno_sintetico.xlsx"]),
}));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./importador", () => ({ processarArquivoRpa: mocks.importar }));
vi.mock("../../drizzle/schema", () => ({ arquivos: {} }));
vi.mock("drizzle-orm", () => ({ like: vi.fn() }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("puppeteer", () => ({ default: { launch: mocks.launch } }));
vi.mock("fs", () => ({ default: {
  existsSync: vi.fn(() => true), mkdirSync: vi.fn(), writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("sintetico")),
  readdirSync: mocks.readdir, statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
  realpathSync: vi.fn((path: string) => path), lstatSync: vi.fn(() => ({ isFile: () => true })),
} }));

import { RoboUnimed } from "./robos/RoboUnimed";
import { RoboIpasgo } from "./robos/RoboIpasgo";

const credenciais: CredenciaisConvenio = {
  estabelecimentoId: 900001, convenioId: 900002,
  registroAns: "900003", codigoPrestadorOperadora: " 900004 ",
  url: "https://portal.unimedgoiania.coop.br/login", login: "synthetic", senha: "synthetic",
};
const scopeEsperado = {
  estabelecimentoId: 900001, convenioId: 900002,
  registroAns: "900003", codigoPrestadorOperadora: " 900004 ",
};

function cenario(tipo: "unimed" | "ipasgo") {
  const eventos: string[] = [];
  let atual = tipo === "unimed" ? credenciais.url : "https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx";
  const campo = { click: vi.fn(async () => {}), type: vi.fn(async () => {}) };
  const frame = {
    url: () => atual,
    evaluate: vi.fn(async (callback: () => unknown) => {
      const texto = callback.toString();
      if (texto.includes("rowsData")) return { indexXlsx: 2, rowsData: [{ rowIndex: 0, numero: "900005", mesAno: "04/2026" }] };
      if (texto.includes("idxRow")) eventos.push("download");
      return true;
    }),
    content: vi.fn(async () => ""),
  };
  const pagina = {
    url: () => atual,
    goto: vi.fn(async (url: string) => { atual = url; }),
    frames: () => [frame],
    browser: () => ({ pages: async () => [pagina] }),
    target: () => ({ createCDPSession: async () => ({ send: vi.fn(async () => ({})) }) }),
    $: vi.fn(async () => campo),
    waitForSelector: vi.fn(async () => {}), waitForNavigation: vi.fn(async () => {}),
    screenshot: vi.fn(async () => ""), content: vi.fn(async () => ""),
    evaluate: vi.fn(async (callback: () => unknown) => {
      const texto = callback.toString();
      if (texto.includes("icons.map")) return [{ index: 0, class: "x-icon" }];
      if (texto.includes("parent.click")) eventos.push("download");
      return true;
    }),
  };
  // Estes testes isolam o contrato do caller. A política real é exercitada em
  // rpaPortalPolicy.test.ts; somente subclasses de teste substituem as proteções.
  class UnimedCaller extends RoboUnimed {
    protected async iniciarBrowser() { eventos.push("browser"); this.page = pagina as unknown as Page; }
    protected async definirContextoPortal() { eventos.push("configurar"); }
    protected async validarAntesDeCredenciais() { eventos.push("validar"); }
    protected async assegurarPortalSemBloqueios() { eventos.push("assert"); }
    protected async delay() {}
    protected async fecharBrowser() { eventos.push("fechar"); }
    protected async capturarEvidenciaTela() { return { path: "", base64: "" }; }
  }
  class IpasgoCaller extends RoboIpasgo {
    protected async iniciarBrowser() { eventos.push("browser"); this.page = pagina as unknown as Page; }
    protected async definirContextoPortal() { eventos.push("configurar"); }
    protected async validarAntesDeCredenciais() { eventos.push("validar"); }
    protected async assegurarPortalSemBloqueios() { eventos.push("assert"); }
    protected async delay() {}
    protected async fecharBrowser() { eventos.push("fechar"); }
  }
  const robo = tipo === "unimed" ? new UnimedCaller() : new IpasgoCaller();
  if (tipo === "unimed") {
    vi.spyOn(robo as unknown as { realizarLoginUnimed(): Promise<{ sucesso: boolean; mensagem: string }> }, "realizarLoginUnimed")
      .mockResolvedValue({ sucesso: true, mensagem: "Login sintético" });
  }
  return { robo, eventos, pagina };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue(null);
  mocks.importar.mockResolvedValue({ success: true });
  mocks.readdir.mockReturnValue(["retorno_sintetico.xlsx"]);
});

for (const tipo of ["unimed", "ipasgo"] as const) {
  describe(`caller ${tipo}: escopo explícito da importação`, () => {
    it("passa exatamente os quatro campos da entrada e competência na assinatura nova", async () => {
      const teste = cenario(tipo);
      const entrada = { ...credenciais };
      const resultado = await teste.robo.executar(entrada, { competencia: "04/2026" });
      expect(resultado.status).toBe("sucesso");
      expect(mocks.importar).toHaveBeenCalledTimes(1);
      const args = mocks.importar.mock.calls[0];
      expect(args).toHaveLength(4);
      expect(args[0]).toMatch(/\/rpa_estab_900001_conv_900002_[a-f0-9-]{36}\/retorno_sintetico\.xlsx$/);
      expect(args[0]).not.toContain("uploads/demonstrativos");
      expect(args[1]).toBe("retorno_sintetico.xlsx");
      expect(args[2]).toEqual(scopeEsperado);
      expect(Object.keys(args[2])).toEqual(["estabelecimentoId", "convenioId", "registroAns", "codigoPrestadorOperadora"]);
      expect(Object.isFrozen(args[2])).toBe(true);
      expect(args[3]).toBe("04/2026");
      expect(entrada).toEqual(credenciais);
      expect(teste.eventos[teste.eventos.indexOf("download") - 1]).toBe("validar");
      expect(teste.eventos.at(-1)).toBe("fechar");
      // Unimed só consulta duplicidade do extrato. IPASGO não consulta DB algum.
      expect(mocks.getDb).toHaveBeenCalledTimes(tipo === "unimed" ? 1 : 0);
      expect(mocks.launch).not.toHaveBeenCalled();
    });

    it.each([
      {}, { estabelecimentoId: null, convenioId: 900002 },
      { estabelecimentoId: 900001, convenioId: 0 },
      { estabelecimentoId: -1, convenioId: 900002 },
      { estabelecimentoId: 1.5, convenioId: 900002 },
      { estabelecimentoId: "900001", convenioId: 900002 },
      { estabelecimentoId: 900001, convenioId: Number.MAX_SAFE_INTEGER + 1 },
    ])("rejeita IDs inválidos antes de browser/download/importação, sem ID default: %j", async ids => {
      const teste = cenario(tipo);
      const entrada = { url: credenciais.url, login: "secret-synthetic", senha: "secret-synthetic", ...ids } as CredenciaisConvenio;
      await expect(teste.robo.executar(entrada)).rejects.toThrow("hospital e convênio explícitos e válidos");
      expect(teste.eventos).toEqual([]);
      expect(mocks.importar).not.toHaveBeenCalled();
      expect(mocks.readdir).not.toHaveBeenCalled();
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.launch).not.toHaveBeenCalled();
    });

    it("conflito hospital/convênio no importador não vira sucesso nem troca para o primeiro convênio", async () => {
      const teste = cenario(tipo);
      mocks.importar.mockImplementation(async (_path, _name, scope) => {
        try {
          validarConvenioRpa(scope, { id: 1, estabelecimentoId: 900009, registroAns: scope.registroAns ?? null, ativo: "sim" });
          return { success: true };
        } catch { return { success: false }; }
      });
      await expect(teste.robo.executar(credenciais)).rejects.toThrow(/RPA.*revisão necessária/);
      expect(mocks.importar).toHaveBeenCalledTimes(1);
      expect(mocks.importar.mock.calls[0][2]).toEqual(scopeEsperado);
      expect(mocks.getDb).toHaveBeenCalledTimes(tipo === "unimed" ? 1 : 0);
      expect(teste.eventos.at(-1)).toBe("fechar");
    });

    it("erro do importador é sanitizado e não aciona tentativa alternativa", async () => {
      const teste = cenario(tipo);
      mocks.importar.mockRejectedValue(new Error("secret-synthetic /synthetic/private.xlsx token"));
      let erro: unknown;
      try { await teste.robo.executar(credenciais); } catch (e) { erro = e; }
      expect(erro).toBeInstanceOf(Error);
      expect((erro as Error).message).toMatch(/revisão necessária/);
      expect((erro as Error).message).not.toMatch(/secret-synthetic|private.xlsx|token/);
      expect(mocks.importar).toHaveBeenCalledTimes(1);
      expect(teste.eventos.at(-1)).toBe("fechar");
    });
  });
}
