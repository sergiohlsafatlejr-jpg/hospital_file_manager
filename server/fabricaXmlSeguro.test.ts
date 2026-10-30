import { beforeEach, describe, expect, it, vi } from "vitest";

const vault = vi.hoisted(() => ({
  armazenamentoXmlImportacaoPronto: vi.fn(),
  criarChaveStorageXmlImportacao: vi.fn(),
  salvarXmlImportacaoProtegido: vi.fn(),
  lerXmlImportacaoProtegido: vi.fn(),
}));
vi.mock("./xmlImportacaoLoteVault", () => ({ ...vault, XML_IMPORTACAO_MAX_FILE_BYTES: 64 }));
import {
  criarArquivoXmlFabricaProtegido,
  confirmarArquivoXmlFabrica,
  decodificarXmlFabricaBase64,
  lerXmlFabricaProtegido,
} from "./fabricaXmlSeguro";

const input = {
  xml: Buffer.from("<xml>sintetico</xml>"), nome: "documento.xml", fabricaContaId: 9,
  estabelecimentoId: 20, convenioId: 30, usuarioId: 71, dataReferencia: new Date("2026-01-01T00:00:00Z"),
};
function banco(eventos: string[] = []) {
  const values = vi.fn(async () => { eventos.push("reserva"); return [{ insertId: 44 }]; });
  const sets: any[] = [];
  const set = vi.fn((value) => ({ where: async () => { sets.push(value); eventos.push(value.status === "processado" ? "processado" : "referencia"); } }));
  return { db: { insert: vi.fn(() => ({ values })), update: vi.fn(() => ({ set })) }, values, sets, set };
}

describe("Fábrica: original XML protegido antes de confirmar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vault.armazenamentoXmlImportacaoPronto.mockReturnValue(true);
    vault.criarChaveStorageXmlImportacao.mockReturnValue("chave-cifrada-sintetica.enc");
    vault.salvarXmlImportacaoProtegido.mockResolvedValue(undefined);
    vault.lerXmlImportacaoProtegido.mockResolvedValue(input.xml);
  });
  it("reserva pendente, grava no cofre, salva referência e só depois confirma explicitamente", async () => {
    const eventos: string[] = [];
    const b = banco(eventos);
    vault.salvarXmlImportacaoProtegido.mockImplementation(async () => { eventos.push("cofre"); });
    const id = await criarArquivoXmlFabricaProtegido(b.db as any, input);
    expect(eventos).toEqual(["reserva", "cofre", "referencia"]);
    expect(b.values).toHaveBeenCalledWith(expect.objectContaining({ status: "pendente", s3Key: "", s3Url: "", progresso: 0 }));
    expect(vault.salvarXmlImportacaoProtegido).toHaveBeenCalledWith(input.xml, { loteId: 9, estabelecimentoId: 20, convenioId: 30, arquivoId: 44 }, "chave-cifrada-sintetica.enc");
    expect(b.sets).toEqual([{ s3Key: "chave-cifrada-sintetica.enc", s3Url: "cofre-xml-fabrica://9/44" }]);
    await confirmarArquivoXmlFabrica(b.db as any, id, 20, 30, 2);
    expect(eventos).toEqual(["reserva", "cofre", "referencia", "processado"]);
    expect(b.sets[1]).toMatchObject({ status: "processado", totalItens: 2, itensProcessados: 2 });
  });
  it("sem chave disponível não reserva arquivo nem confirma importação", async () => {
    const b = banco(); vault.armazenamentoXmlImportacaoPronto.mockReturnValue(false);
    await expect(criarArquivoXmlFabricaProtegido(b.db as any, input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(b.db.insert).not.toHaveBeenCalled(); expect(vault.salvarXmlImportacaoProtegido).not.toHaveBeenCalled();
  });
  it("falha de storage não grava referência nem status processado e sanitiza o erro", async () => {
    const b = banco(); vault.salvarXmlImportacaoProtegido.mockRejectedValue(new Error("detalhe-interno-nao-expor"));
    await expect(criarArquivoXmlFabricaProtegido(b.db as any, input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(b.db.update).not.toHaveBeenCalled();
    await expect(criarArquivoXmlFabricaProtegido(b.db as any, input)).rejects.not.toThrow("detalhe-interno-nao-expor");
  });
  it("rejeita base64 vazio, inválido, não canônico e acima do limite", () => {
    for (const value of ["", "???", "YWJj!", "YQ=", "YR==", Buffer.alloc(65).toString("base64")]) {
      expect(() => decodificarXmlFabricaBase64(value)).toThrow();
    }
    expect(decodificarXmlFabricaBase64(input.xml.toString("base64"))).toEqual(input.xml);
  });
  it("releitura usa o mesmo AAD de conta, hospital, convênio e arquivo", async () => {
    await expect(lerXmlFabricaProtegido({ id: 44, estabelecimentoId: 20, convenioId: 30, s3Key: "chave-cifrada-sintetica.enc", s3Url: "cofre-xml-fabrica://9/44" })).resolves.toEqual(input.xml);
    expect(vault.lerXmlImportacaoProtegido).toHaveBeenCalledWith({ loteId: 9, estabelecimentoId: 20, convenioId: 30, arquivoId: 44 }, "chave-cifrada-sintetica.enc");
  });
  it("marcador de outro arquivo ou URL de rede não abre o cofre", async () => {
    for (const s3Url of ["cofre-xml-fabrica://9/45", "cofre-xml-fabrica://9/44?x=1", "https://exemplo.test/44", "local://fabrica/44"]) {
      await expect(lerXmlFabricaProtegido({ id: 44, estabelecimentoId: 20, convenioId: 30, s3Key: "chave-cifrada-sintetica.enc", s3Url })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    expect(vault.lerXmlImportacaoProtegido).not.toHaveBeenCalled();
  });
});
