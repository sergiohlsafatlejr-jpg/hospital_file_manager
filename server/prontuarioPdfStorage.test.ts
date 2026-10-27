import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: mocks.put, storageGet: mocks.get }));

import {
  armazenamentoProntuarioPdfPronto,
  cifrarPdfProntuario,
  criarChaveStoragePdfProntuario,
  decifrarPdfProntuario,
  lerPdfProntuario,
  salvarPdfProntuario,
} from "./prontuarioPdfStorage";
import { validarPdfProntuario } from "./prontuarioPdfService";
import { PRONTUARIO_PDF_MAX_BYTES } from "../shared/prontuarioPdf";

const chave = Buffer.alloc(32, 13).toString("base64");
const scope = {
  estabelecimentoId: 10,
  convenioId: 20,
  arquivoHospitalId: 30,
  numeroConta: "CONTA-SINTETICA",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};
const pdf = Buffer.from(
  "%PDF-1.7\n% PDF sintético, sem conteúdo clínico real\n",
  "ascii"
);

beforeEach(() => {
  vi.stubEnv("PRONTUARIO_PDF_FILE_KEY", chave);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PDF de prontuário protegido", () => {
  it("exige chave dedicada de 32 bytes e não reutiliza chave de sessão", () => {
    vi.stubEnv("PRONTUARIO_PDF_FILE_KEY", "");
    vi.stubEnv("JWT_SECRET", "nao-usar-como-chave-de-arquivo");
    expect(armazenamentoProntuarioPdfPronto()).toBe(false);
    expect(() => cifrarPdfProntuario(pdf, scope)).toThrow(
      "precisa ser configurado"
    );
  });

  it("preserva bytes sem guardar PDF puro no envelope", () => {
    const sealed = cifrarPdfProntuario(pdf, scope);
    expect(sealed.includes(pdf)).toBe(false);
    expect(sealed).not.toEqual(cifrarPdfProntuario(pdf, scope));
    expect(decifrarPdfProntuario(sealed, scope)).toEqual(pdf);
  });

  it.each([
    { estabelecimentoId: 11 },
    { convenioId: 21 },
    { arquivoHospitalId: 31 },
    { numeroConta: "OUTRA-CONTA" },
    { numeroLote: "LOTE-2" },
    { competencia: "2026/11" },
  ])("rejeita envelope quando AAD muda: %o", alteracao => {
    const sealed = cifrarPdfProntuario(pdf, scope);
    expect(() =>
      decifrarPdfProntuario(sealed, { ...scope, ...alteracao })
    ).toThrow("integridade");
  });

  it("rejeita adulteração e limites de tamanho", () => {
    const sealed = cifrarPdfProntuario(pdf, scope);
    sealed[sealed.length - 1] ^= 1;
    expect(() => decifrarPdfProntuario(sealed, scope)).toThrow("integridade");
    expect(() => cifrarPdfProntuario(Buffer.alloc(0), scope)).toThrow(
      "entre 1 byte e 5 MB"
    );
    expect(() =>
      cifrarPdfProntuario(Buffer.alloc(PRONTUARIO_PDF_MAX_BYTES + 1), scope)
    ).toThrow("entre 1 byte e 5 MB");
  });

  it("gera chave privada antes do I/O e grava apenas ciphertext nela", async () => {
    const key = criarChaveStoragePdfProntuario(scope);
    expect(key).toMatch(
      /^prontuario-pdf-protegido\/10\/20\/30\/[a-f0-9]{32}\/[a-f0-9]{48}\.enc$/
    );
    mocks.put.mockImplementation(async (putKey: string) => ({
      key: putKey,
      url: "https://fixture.invalid/ciphertext",
    }));
    await expect(salvarPdfProntuario(pdf, scope, key)).resolves.toBeUndefined();
    expect(mocks.put).toHaveBeenCalledWith(
      key,
      expect.any(Buffer),
      "application/octet-stream"
    );
    expect(mocks.put.mock.calls[0][1].includes(pdf)).toBe(false);
  });

  it("recusa gravar com chave fora do escopo antes de chamar storage", async () => {
    await expect(
      salvarPdfProntuario(
        pdf,
        scope,
        "prontuario-pdf-protegido/outra-chave.enc"
      )
    ).rejects.toThrow("escopo");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("não consulta storage fora do escopo e lê ciphertext sem expor URL", async () => {
    const key = criarChaveStoragePdfProntuario(scope);
    await expect(
      lerPdfProntuario(key, { ...scope, numeroConta: "OUTRA" })
    ).rejects.toThrow("escopo");
    expect(mocks.get).not.toHaveBeenCalled();

    const sealed = cifrarPdfProntuario(pdf, scope);
    mocks.get.mockResolvedValue({
      key,
      url: "https://fixture.invalid/ciphertext",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sealed)));
    await expect(lerPdfProntuario(key, scope)).resolves.toEqual(pdf);
  });

  it("valida somente bytes PDF e tamanho no servidor", () => {
    expect(() => validarPdfProntuario(pdf)).not.toThrow();
    expect(() => validarPdfProntuario(Buffer.from("texto comum"))).toThrow(
      "não é um PDF"
    );
    expect(() =>
      validarPdfProntuario(Buffer.alloc(PRONTUARIO_PDF_MAX_BYTES + 1))
    ).toThrow("entre 1 byte e 5 MB");
  });
});
