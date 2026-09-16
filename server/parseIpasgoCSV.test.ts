import { describe, expect, it } from "vitest";
import { parseIpasgoCSV } from "./parsers/parseIpasgoCSV";

describe("parseIpasgoCSV", () => {
  it("preserva os códigos do prestador do XML e do executante", () => {
    const cabecalho = [
      "FATURA", "PAGAMENTO", "CODIGO_PRESTADOR_PAGAMENTO", "NOME_PRESTADOR_PAGAMENTO",
      "COMPETENCIA", "ENTREGA", "PROTOCOLO", "LOTE", "CODIGO_PRESTADOR_XML",
      "NUMERO_GUIA_OPERADORA", "SENHA", "CARTEIRA_BENEFICIARIO", "NOME_BENEFICIARIO",
      "REALIZACAO", "CODIGO_PROCEDIMENTO", "DESCRICAO_PROCEDIMENTO", "GRAU_PARTICIPACAO",
      "TIPO_GUIA", "QUANTIDADE", "VALOR_UNITARIO", "VALOR_GLOSADO", "VALOR_TOTAL_PAGAMENTO",
      "JUSTIFICATIVA_GLOSA", "OBSERVACAO_GLOSA", "SITUACAO", "CODIGO_PROFISSIONAL_SOLICITANTE",
      "NOME_PROFISSIONAL_SOLICITANTE", "CODIGO_PRESTADOR_EXECUTANTE", "NOME_PRESTADOR_EXECUTANTE",
      "TIPO_LANCAMENTO",
    ];
    const linha = [
      "1647625", "31/08/2026", "01648-2", "IPASGO", "08/2026", "", "123", "456",
      "05562645000131", "789", "", "CARTEIRA", "PACIENTE", "10/08/2026", "10101012",
      "PROCEDIMENTO TESTE", "", "CONSULTA", "1", "100,00", "10,00", "90,00", "9999 GLOSA",
      "", "PARCIAL", "", "", "05562645000131", "OX UTI", "PROCEDIMENTO",
    ];

    const resultado = parseIpasgoCSV(`${cabecalho.join(";")}\n${linha.join(";")}`, 1, 30001, 3);

    expect(resultado.success).toBe(true);
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]).toMatchObject({
      codigoPrestadorPagamento: "01648-2",
      nomePrestadorPagamento: "IPASGO",
      codigoPrestador: "05562645000131",
      prestadorExecutante: "05562645000131",
      nomePrestadorExecutante: "OX UTI",
    });
  });
});
