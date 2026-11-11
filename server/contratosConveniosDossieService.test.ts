import { describe, expect, it } from "vitest";
import {
  classificarTipoDocumentoPdf,
  construirDossieContratualTexto,
  extrairLinhasTabelaValoresPdf,
} from "./contratosConveniosDossieService";

describe("contratosConveniosDossieService - Modelo Consultoria & Cruzamento", () => {
  it("classificarTipoDocumentoPdf distingue Contrato, Aditivo, Tabela e Circular", () => {
    expect(
      classificarTipoDocumentoPdf("1 Termo Aditivo 2025.pdf", "TERMO ADITIVO AO CONTRATO")
    ).toBe("Aditivo");
    expect(
      classificarTipoDocumentoPdf("Anexo II Tabela de Diarias e Taxas.pdf", "valores acordados")
    ).toBe("Tabela");
    expect(
      classificarTipoDocumentoPdf("Oficio Reajuste 2026.pdf", "Comunicado de reajuste anual")
    ).toBe("Circular");
    expect(
      classificarTipoDocumentoPdf(
        "Contrato Prestacao Servicos Hospitalares.pdf",
        "CONTRATO DE PRESTAÇÃO DE SERVIÇOS"
      )
    ).toBe("Contrato");
  });

  it("extrairLinhasTabelaValoresPdf extrai códigos TUSS e valores monetários do texto do PDF", () => {
    const texto = [
      "ANEXO I - TABELA DE PROCEDIMENTOS E CONSULTAS",
      "10101012 - Consulta médica em consultório no horário normal R$ 135,00",
      "10101039 - Consulta em pronto socorro plantão 24h R$ 180,50",
      "40304361 Hemograma com contagem de plaquetas R$ 22,40",
    ].join("\n");

    const itens = extrairLinhasTabelaValoresPdf(texto, "Anexo_Tabela.pdf");
    expect(itens.length).toBe(3);
    expect(itens[0]).toEqual([
      "10101012",
      "Consulta médica em consultório no horário normal",
      135,
      "Anexo_Tabela.pdf",
    ]);
    expect(itens[1][0]).toBe("10101039");
    expect(itens[1][2]).toBe(180.5);
    expect(itens[2][0]).toBe("40304361");
    expect(itens[2][2]).toBe(22.4);
  });

  it("construirDossieContratualTexto monta dossiê completo no padrão Consultoria com semáforo RED/YEL/GRN", () => {
    const textoContrato = `
      CONTRATO DE PRESTAÇÃO DE SERVIÇOS HOSPITALARES Nº CT-2025/089
      Registro ANS: 345678
      Contratante CNPJ: 12.345.678/0001-90
      Contratada CNPJ: 98.765.432/0001-10
      CLÁUSULA QUINTA - DO FATURAMENTO E PAGAMENTO
      O envio do faturamento XML TISS deverá ocorrer até o 5º dia útil de cada mês subsequente.
      O pagamento será efetuado em até 60 dias após a apresentação da fatura.
      CLÁUSULA SEXTA - DAS GLOSAS E RECURSOS
      O prazo para apresentação de recurso de glosa será de 60 dias corridos a contar do demonstrativo.
      Exige-se autorização prévia e senha nas guias TISS.
      CLÁUSULA SÉTIMA - DA REMUNERAÇÃO E REAJUSTE
      Honorários médicos pela tabela CBHPM 5ª Edição com horário especial de 30% em urgência e emergência.
      Medicamentos remunerados pelo Brasíndice vigente e materiais pelo Simpro / TNUMM.
      O contrato será reajustado anualmente pelo IPCA acumulado de 12 meses, com juros e correção monetária por atraso.
      10101012 - Consulta médica eletiva em consultório R$ 140,00
    `;

    const dossie = construirDossieContratualTexto({
      contrato: {
        id: 10,
        estabelecimentoId: 1,
        convenioId: 5,
        numeroContrato: "CT-2025/089",
        dataInicio: "2025-01-01",
        dataFim: "2026-12-31",
        status: "ativo",
        observacoes: null,
        reajusteProposto: "6.5",
        emailContato: "credenciamento@unimed.com.br",
      },
      convenioNome: "UNIMED OESTE",
      registroAns: "345678",
      estabelecimentoNome: "Hospital Santa Casa",
      estabelecimentoCnpj: "98.765.432/0001-10",
      documentos: [
        {
          id: 101,
          nomeArquivo: "Contrato_Unimed_2025.pdf",
          paginas: 18,
          status: "concluido",
          textoExtraido: textoContrato,
          pontosImportantes: [],
          createdAt: "2025-01-15T10:00:00Z",
        },
      ],
      itensTabelaPortal: [
        {
          codigo: "20104090",
          nome: "Curativo cirúrgico grande",
          valor: "95.00",
          tipo: "procedimentos",
          vigenciaInicio: "2025-01-01",
        },
      ],
    });

    expect(dossie.convenio).toBe("UNIMED OESTE");
    expect(dossie.estabelecimentoNome).toBe("Hospital Santa Casa");
    expect(dossie.numeroContrato).toBe("CT-2025/089");
    expect(dossie.resumo_executivo.prazoRecursoGlosa).toContain("60 dias");
    expect(dossie.resumo_executivo.indiceReajuste).toContain("IPCA");
    expect(dossie.documentos).toHaveLength(1);
    expect(dossie.documentos[0].tipo).toBe("Contrato");
    expect(dossie.clausulas.length).toBeGreaterThanOrEqual(3);
    expect(dossie.remuneracao.length).toBeGreaterThanOrEqual(3);

    // Verifica que mesclou item do PDF com item da Tabela do Portal
    const codigosTabela = dossie.tabela_valores.linhas.map(l => l[0]);
    expect(codigosTabela).toContain("10101012");
    expect(codigosTabela).toContain("20104090");

    // Verifica semáforo RED / YEL / GRN nos pontos de atenção
    const semaforos = new Set(dossie.pontos_atencao.map(p => p[2]));
    expect(semaforos.has("RED")).toBe(true);
    expect(semaforos.has("YEL")).toBe(true);
    expect(semaforos.has("GRN")).toBe(true);
  });
});
