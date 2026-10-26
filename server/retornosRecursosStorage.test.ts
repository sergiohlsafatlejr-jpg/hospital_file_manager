import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: mocks.put, storageGet: mocks.get }));
import { armazenamentoRetornosPronto, cifrarArquivoRetorno, decifrarArquivoRetorno, salvarArquivoRetorno, lerArquivoRetorno } from "./retornosRecursosStorage";
import { RETORNO_XML_MAX_BYTES } from "../shared/retornosRecursos";
const escopo = { estabelecimentoId: 100, convenioId: 200 };
const plain = Buffer.from("<xml>somente fixture sintética</xml>");
const key = Buffer.alloc(32, 7).toString("base64");
beforeEach(() => { vi.stubEnv("RETORNOS_RECURSOS_FILE_KEY", key); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("arquivos cifrados de retornos", () => {
  it("exige chave dedicada sem reutilizar chave de sessão", () => {
    vi.stubEnv("RETORNOS_RECURSOS_FILE_KEY", ""); vi.stubEnv("JWT_SECRET", "nao-usar");
    expect(armazenamentoRetornosPronto()).toBe(false);
    expect(() => cifrarArquivoRetorno(plain, escopo, "xml")).toThrow("precisa ser configurado");
  });
  it.each(["segredo-curto", "!".repeat(44), Buffer.alloc(31).toString("base64")])("rejeita chave malformada", bad => {
    vi.stubEnv("RETORNOS_RECURSOS_FILE_KEY", bad); expect(armazenamentoRetornosPronto()).toBe(false);
  });
  it("aceita chave hexadecimal de 32 bytes", () => { vi.stubEnv("RETORNOS_RECURSOS_FILE_KEY", Buffer.alloc(32, 9).toString("hex")); expect(armazenamentoRetornosPronto()).toBe(true); });
  it("preserva bytes e não expõe conteúdo no objeto cifrado", () => {
    const sealed = cifrarArquivoRetorno(plain, escopo, "xml");
    expect(sealed.includes(plain)).toBe(false); expect(decifrarArquivoRetorno(sealed, escopo, "xml")).toEqual(plain);
    expect(cifrarArquivoRetorno(plain, escopo, "xml")).not.toEqual(sealed);
  });
  it.each([{ estabelecimentoId: 101, convenioId: 200 }, { estabelecimentoId: 100, convenioId: 201 }])("rejeita troca de unidade/convênio", other => {
    expect(() => decifrarArquivoRetorno(cifrarArquivoRetorno(plain, escopo, "xml"), other, "xml")).toThrow("integridade");
  });
  it("rejeita troca de tipo", () => { expect(() => decifrarArquivoRetorno(cifrarArquivoRetorno(plain, escopo, "xml"), escopo, "pdf")).toThrow("integridade"); });
  it("rejeita adulteração", () => { const sealed = cifrarArquivoRetorno(plain, escopo, "xml"); sealed[sealed.length - 1] ^= 1; expect(() => decifrarArquivoRetorno(sealed, escopo, "xml")).toThrow("integridade"); });
  it.each([Buffer.alloc(0), Buffer.alloc(RETORNO_XML_MAX_BYTES + 1)])("rejeita arquivo vazio ou acima do limite", b => { expect(() => cifrarArquivoRetorno(b, escopo, "xml")).toThrow("limite"); });
  it("rejeita envelope truncado", () => { expect(() => decifrarArquivoRetorno(Buffer.from("SRR1"), escopo, "xml")).toThrow("inválido"); });
  it("salva apenas ciphertext e devolve somente a chave interna", async () => {
    mocks.put.mockImplementation(async (key: string) => ({ key, url: "https://fixture.invalid/ciphertext" }));
    const result = await salvarArquivoRetorno(plain, escopo, "xml");
    expect(Object.keys(result)).toEqual(["key"]); expect(result.key).toMatch(/^retornos-recursos-protegidos\/100\/200\/xml\/[a-f0-9]{48}\.enc$/);
    expect(mocks.put.mock.calls[0][1].includes(plain)).toBe(false); expect(mocks.put.mock.calls[0][2]).toBe("application/octet-stream");
  });
  it("não consulta armazenamento para chave fora do escopo", async () => {
    await expect(lerArquivoRetorno(`retornos-recursos-protegidos/101/200/xml/${"a".repeat(48)}.enc`, escopo, "xml")).rejects.toThrow("escopo"); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("não aceita caminhos arbitrários", async () => { await expect(lerArquivoRetorno("../outro", escopo, "xml")).rejects.toThrow("escopo"); expect(mocks.get).not.toHaveBeenCalled(); });
  it("decifra download controlado sem devolver URL", async () => {
    const fileKey = `retornos-recursos-protegidos/100/200/xml/${"a".repeat(48)}.enc`;
    const sealed = cifrarArquivoRetorno(plain, escopo, "xml");
    mocks.get.mockResolvedValue({ key: fileKey, url: "https://fixture.invalid/ciphertext" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sealed)));
    expect(await lerArquivoRetorno(fileKey, escopo, "xml")).toEqual(plain);
  });
  it("não expõe mensagens do storage", async () => {
    mocks.put.mockRejectedValue(new Error("segredo-do-provedor")); await expect(salvarArquivoRetorno(plain, escopo, "xml")).rejects.toThrow("Não foi possível salvar");
  });
});
