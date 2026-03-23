import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica de classificação de terceiros na conciliação.
 * 
 * A lógica principal:
 * - Se um item de faturamento NÃO encontra match no retorno/demonstrativo,
 *   e o codigoPrestadorExecutante pertence a um prestador terceiro cadastrado,
 *   o item deve ser marcado como 'terceiro' em vez de 'glosado'.
 * - Itens de terceiros NÃO devem entrar no XML de recurso de glosa.
 * - Itens de terceiros devem ter valorGlosa = 0 e diferenca = 0.
 */

// Simula a lógica de classificação de terceiros extraída do faturamentoUnificadoService
// Lógica: se o código do prestador executante NÃO está entre os códigos PRÓPRIOS, é terceiro
function classificarItemSemMatch(params: {
  codigoPrestadorExecutante: string | null;
  codigosProprios: Set<string>;
  valorFaturado: number;
}): {
  statusConciliacao: string;
  valorGlosa: number;
  diferenca: number;
  codigoGlosa: string | null;
} {
  const { codigoPrestadorExecutante, codigosProprios, valorFaturado } = params;
  const isTerceiro = codigoPrestadorExecutante && codigosProprios.size > 0 && !codigosProprios.has(codigoPrestadorExecutante);

  if (isTerceiro) {
    return {
      statusConciliacao: 'terceiro',
      valorGlosa: 0,
      diferenca: 0,
      codigoGlosa: null,
    };
  } else {
    return {
      statusConciliacao: 'glosado',
      valorGlosa: valorFaturado,
      diferenca: valorFaturado,
      codigoGlosa: '5007',
    };
  }
}

// Simula a lógica de filtragem de terceiros no XML de recurso
function deveIncluirNoXmlRecurso(statusConciliacao: string): boolean {
  return statusConciliacao !== 'terceiro';
}

// Simula a lógica isTerceiro do frontend
// Lógica: se statusGuia é 'terceiro' OU se o código NÃO está nos próprios
function isTerceiroFrontend(params: {
  statusGuia?: string;
  codigoPrestadorExecutante?: string;
  codigosProprios: string[];
}): boolean {
  if (params.statusGuia === 'terceiro') return true;
  if (!params.codigosProprios.length) return false;
  if (!params.codigoPrestadorExecutante) return false;
  return !params.codigosProprios.includes(params.codigoPrestadorExecutante);
}

describe("Classificação de Terceiros na Conciliação", () => {
  // Códigos próprios do hospital (CNPJ e códigos cadastrados)
  const codigosProprios = new Set(["00418954000119", "3201151"]);

  describe("classificarItemSemMatch", () => {
    it("deve classificar como 'terceiro' quando o prestador NÃO está nos próprios", () => {
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: "05046748622", // CPF do médico terceiro
        codigosProprios,
        valorFaturado: 50.54,
      });

      expect(result.statusConciliacao).toBe("terceiro");
      expect(result.valorGlosa).toBe(0);
      expect(result.diferenca).toBe(0);
      expect(result.codigoGlosa).toBeNull();
    });

    it("deve classificar como 'glosado' quando o prestador é próprio", () => {
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: "00418954000119", // CNPJ do hospital
        codigosProprios,
        valorFaturado: 100.00,
      });

      expect(result.statusConciliacao).toBe("glosado");
      expect(result.valorGlosa).toBe(100.00);
      expect(result.diferenca).toBe(100.00);
      expect(result.codigoGlosa).toBe("5007");
    });

    it("deve classificar como 'glosado' quando não tem código de prestador", () => {
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: null,
        codigosProprios,
        valorFaturado: 75.00,
      });

      expect(result.statusConciliacao).toBe("glosado");
      expect(result.valorGlosa).toBe(75.00);
      expect(result.diferenca).toBe(75.00);
      expect(result.codigoGlosa).toBe("5007");
    });

    it("deve classificar como 'glosado' quando não há próprios cadastrados (sem referência)", () => {
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: "05046748622",
        codigosProprios: new Set(),
        valorFaturado: 50.54,
      });

      expect(result.statusConciliacao).toBe("glosado");
      expect(result.valorGlosa).toBe(50.54);
    });
  });

  describe("Filtragem de terceiros no XML de recurso", () => {
    it("deve excluir itens com status 'terceiro' do XML", () => {
      expect(deveIncluirNoXmlRecurso("terceiro")).toBe(false);
    });

    it("deve incluir itens com status 'glosado' no XML", () => {
      expect(deveIncluirNoXmlRecurso("glosado")).toBe(true);
    });

    it("deve incluir itens com status 'conciliado' no XML", () => {
      expect(deveIncluirNoXmlRecurso("conciliado")).toBe(true);
    });

    it("deve incluir itens com status 'divergente' no XML", () => {
      expect(deveIncluirNoXmlRecurso("divergente")).toBe(true);
    });
  });

  describe("isTerceiro (lógica frontend)", () => {
    it("deve retornar true quando statusGuia é 'terceiro'", () => {
      expect(isTerceiroFrontend({
        statusGuia: "terceiro",
        codigosProprios: [],
      })).toBe(true);
    });

    it("deve retornar true quando código NÃO está nos próprios", () => {
      expect(isTerceiroFrontend({
        codigoPrestadorExecutante: "05046748622",
        codigosProprios: ["00418954000119", "3201151"],
      })).toBe(true);
    });

    it("deve retornar false quando código ESTÁ nos próprios", () => {
      expect(isTerceiroFrontend({
        codigoPrestadorExecutante: "00418954000119",
        codigosProprios: ["00418954000119", "3201151"],
      })).toBe(false);
    });

    it("deve retornar false quando não tem código de prestador", () => {
      expect(isTerceiroFrontend({
        codigoPrestadorExecutante: undefined,
        codigosProprios: ["00418954000119"],
      })).toBe(false);
    });

    it("deve retornar false quando lista de próprios está vazia (sem referência)", () => {
      expect(isTerceiroFrontend({
        codigoPrestadorExecutante: "05046748622",
        codigosProprios: [],
      })).toBe(false);
    });
  });

  describe("Cenário da guia 17007812 (Erich Pires Marota)", () => {
    it("deve classificar o item do médico terceiro como 'terceiro' e não 'glosado'", () => {
      // Dados reais: hospital tem CNPJ 00418954000119 como próprio
      // Médico Erich Pires Marota tem CPF 05046748622 (NÃO é próprio)
      const codigoMedicoTerceiro = "05046748622";
      const codigosPropriosHospital = new Set(["00418954000119", "3201151"]);
      
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: codigoMedicoTerceiro,
        codigosProprios: codigosPropriosHospital,
        valorFaturado: 50.54, // Valor do procedimento 20104294
      });

      // O item NÃO deve ser glosado
      expect(result.statusConciliacao).not.toBe("glosado");
      // O item deve ser marcado como terceiro
      expect(result.statusConciliacao).toBe("terceiro");
      // Não deve ter valor de glosa
      expect(result.valorGlosa).toBe(0);
      // Não deve ter diferença
      expect(result.diferenca).toBe(0);
      // Não deve ter código de glosa
      expect(result.codigoGlosa).toBeNull();
    });

    it("item próprio do hospital deve ser glosado normalmente", () => {
      const codigosPropriosHospital = new Set(["00418954000119", "3201151"]);
      
      const result = classificarItemSemMatch({
        codigoPrestadorExecutante: "00418954000119", // CNPJ do hospital
        codigosProprios: codigosPropriosHospital,
        valorFaturado: 73.51,
      });

      expect(result.statusConciliacao).toBe("glosado");
      expect(result.valorGlosa).toBe(73.51);
    });

    it("o item do terceiro NÃO deve ser incluído no XML de recurso", () => {
      expect(deveIncluirNoXmlRecurso("terceiro")).toBe(false);
    });
  });
});
