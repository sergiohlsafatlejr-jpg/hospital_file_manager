import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const launch = vi.hoisted(() => vi.fn(() => { throw new Error("Browser real proibido"); }));
vi.mock("puppeteer", () => ({ default: { launch } }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { RoboBase } from "./RoboBase";
import { RoboUnimed } from "./robos/RoboUnimed";
import { RoboIpasgo } from "./robos/RoboIpasgo";
class TesteBase extends RoboBase {
  constructor() { super("sintetico"); }
  async executar() { return {}; }
  criar(scope = { estabelecimentoId: 900001, convenioId: 900002 }) { return this.criarDiretorioDownloadRpa(scope); }
  arquivo(diretorio: string, nome: string) { return this.resolverArquivoDownloadRpa(diretorio, nome); }
}
const pastas: string[] = [];
const criar = (robo: TesteBase, scope?: { estabelecimentoId: number; convenioId: number }) => { const pasta = robo.criar(scope); pastas.push(pasta); return pasta; };
afterEach(() => { for (const pasta of pastas.splice(0)) fs.rmSync(pasta, { recursive: true, force: true }); vi.clearAllMocks(); });
describe("download namespace RPA", () => {
  it("construtores reais não criam pastas nem iniciam navegador", () => {
    const mkdir = vi.spyOn(fs, "mkdirSync");
    new RoboUnimed(); new RoboIpasgo();
    expect(mkdir).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled(); mkdir.mockRestore();
  });
  it("isola instâncias, reexecuções e hospitais com UUID e modo 0700 fora de uploads", () => {
    const a = new TesteBase(); const b = new TesteBase();
    const nomes = [criar(a), criar(b), criar(a), criar(a, { estabelecimentoId: 900003, convenioId: 900004 })];
    expect(new Set(nomes).size).toBe(4);
    for (const nome of nomes) {
      expect(path.dirname(nome)).toBe(path.resolve(os.tmpdir()));
      expect(path.basename(nome)).toMatch(/^rpa_estab_90000[13]_conv_90000[24]_[a-f0-9-]{36}$/);
      expect(fs.statSync(nome).mode & 0o777).toBe(0o700);
      expect(nome).not.toContain("uploads");
    }
  });
  it("importa apenas arquivo regular da pasta atribuída à instância", () => {
    const a = new TesteBase(); const b = new TesteBase(); const pasta = criar(a); const outra = criar(b);
    fs.writeFileSync(path.join(pasta, "sintetico.xlsx"), "synthetic");
    expect(a.arquivo(pasta, "sintetico.xlsx")).toBe(path.join(pasta, "sintetico.xlsx"));
    expect(() => a.arquivo(outra, "sintetico.xlsx")).toThrow("namespace privado");
    expect(() => a.arquivo(pasta, "../sintetico.xlsx")).toThrow("namespace privado");
    fs.symlinkSync(path.join(pasta, "sintetico.xlsx"), path.join(pasta, "link.xlsx"));
    expect(() => a.arquivo(pasta, "link.xlsx")).toThrow("namespace privado");
    fs.mkdirSync(path.join(pasta, "pasta.xlsx"));
    expect(() => a.arquivo(pasta, "pasta.xlsx")).toThrow("namespace privado");
    expect(launch).not.toHaveBeenCalled();
  });
  it("recusa IDs inválidos sem criar diretório", () => {
    expect(() => new TesteBase().criar({ estabelecimentoId: 0, convenioId: 81 })).toThrow("explícitos");
    expect(launch).not.toHaveBeenCalled();
  });
});
