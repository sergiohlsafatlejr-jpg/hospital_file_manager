import { describe, expect, it } from "vitest";
import { parseBradescoCSV } from "./parsers/parseBradescoCSV";

const csv = [
  '"Extrato de Pagamento ",,,,,,,',
  ',"CNPJ/CPF - 01.545.649/0001-50","Código - 0000455911",',
  '"Liberado para crédito em 02/07/2026","---","---","---","---","---","1078.14",',
  '"Data do Evento","Nome","Código do Procedimento","Descrição do Procedimento","Quantidade Solicitada","Quantidade Liberada","Guia operadora/Senha","Doc Original","Protocolo","Valor (R$)","Justificativa",,,',
  '" 19/04/2026","PACIENTE TESTE",,,,,"0893727800","1727332004","341227139135","315,06",,,',
  ',,"40304361","HEMOGRAMA","1","1",,,,"11,16","",,,',
  ',,"40308391","PROTEINA C REATIVA","1","0",,,,"24,91","1407 SERVICO NAO AUTORIZADO",,,',
].join("\r\n");

describe("parseBradescoCSV", () => {
  it("extrai lote, guia, paciente e itens do extrato Bradesco", () => {
    const result = parseBradescoCSV(csv, 4650001, 60003, 1, new Date("2026-06-01T12:00:00Z"));

    expect(result.success).toBe(true);
    expect(result.totalLotes).toBe(1);
    expect(result.totalGuias).toBe(1);
    expect(result.totalItens).toBe(2);
    expect(result.cnpjPrestador).toBe("01.545.649/0001-50");
    expect(result.codigoPrestador).toBe("0000455911");
    expect(result.items[0]).toMatchObject({
      arquivoId: 4650001,
      convenioId: 60003,
      estabelecimentoId: 1,
      numeroGuia: "0893727800",
      nomeBeneficiario: "PACIENTE TESTE",
      item: "40304361",
      valorPagamento: "11.16",
      situacaoItem: "PAGO",
    });
  });

  it("classifica como glosado quando a quantidade liberada é zero", () => {
    const result = parseBradescoCSV(csv, 4650001, 60003, 1);
    expect(result.items[1]).toMatchObject({
      item: "40308391",
      quantidade: 1,
      valorPagamento: "0.00",
      valorGlosa: "24.91",
      codigoGlosa: "1407",
      situacaoItem: "GLOSADO",
    });
  });

  it("rejeita CSV que não seja extrato de pagamento Bradesco", () => {
    const result = parseBradescoCSV("COLUNA;VALOR\nA;1", 1, 1, 1);
    expect(result.success).toBe(false);
    expect(result.items).toHaveLength(0);
  });
});
