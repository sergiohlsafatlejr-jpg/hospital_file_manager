import { describe, expect, it } from "vitest";
import {
  extrairPontosImportantes,
  normalizarTextoPdf,
  sanitizarNomePdf,
  sha256Pdf,
  validarPdfContrato,
} from "./contratosConveniosPdfService";

describe("contratosConveniosPdfService", () => {
  it("normaliza espaços e quebras de página sem apagar o conteúdo", () => {
    expect(
      normalizarTextoPdf(
        "  CLÁUSULA  PRIMEIRA\r\n\r\nPagamento\u000c em 30 dias  "
      )
    ).toBe("CLÁUSULA PRIMEIRA\nPagamento\nem 30 dias");
  });

  it("extrai partes, vigência, faturamento, pagamento, sigilo e contatos", () => {
    const texto = [
      "AWP SERVICE BRASIL LTDA., CNPJ 52.910.023/0001-37",
      "HOSPITAL COTEFI LTDA, CNPJ 02.984.340/0001-20",
      "CLÁUSULA SEGUNDA — DA VIGÊNCIA",
      "O contrato terá prazo indeterminado e aviso de 30 dias.",
      "Documentos necessários para faturamento: guia, conta e nota fiscal.",
      "O pagamento será realizado conforme calendário de depósito.",
      "As partes manterão sigilo e confidencialidade dos dados.",
      "Contato: faturamento@allianz.com",
    ].join("\n");

    const pontos = extrairPontosImportantes(texto);
    expect(pontos.map(ponto => ponto.categoria)).toEqual(
      expect.arrayContaining([
        "partes",
        "vigencia",
        "faturamento",
        "pagamento",
        "dados_e_sigilo",
        "contatos",
      ])
    );
    expect(
      pontos.find(ponto => ponto.categoria === "contatos")?.resumo
    ).toContain("faturamento@allianz.com");
  });

  it("recusa arquivo que não começa com assinatura PDF", () => {
    expect(() => validarPdfContrato(Buffer.from("não é pdf"))).toThrow(
      "não é um PDF válido"
    );
  });

  it("sanitiza nome e calcula hash estável", () => {
    expect(sanitizarNomePdf("Minuta padrão / Rede Médica.pdf")).toBe(
      "Minuta_padrao_Rede_Medica.pdf"
    );
    expect(sha256Pdf(Buffer.from("contrato"))).toBe(
      sha256Pdf(Buffer.from("contrato"))
    );
  });
});
