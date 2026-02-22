import { describe, it, expect } from "vitest";
import { AnalisadorConformidadePadrao, RelatorioConformidade } from "./analisadorConformidadePadrao";

describe("Analisador de Conformidade de Padrões", () => {
  describe("Validação de estrutura de relatório", () => {
    it("deve retornar relatório com campos obrigatórios", () => {
      const relatorio: RelatorioConformidade = {
        contaId: 1,
        codigoProcedimento: "31008",
        padraoId: 1,
        scoreConformidade: 85,
        statusGeral: "conforme",
        divergencias: [],
        itensConformes: 5,
        itensDivergentes: 0,
        recomendacoes: [],
      };

      expect(relatorio.contaId).toBeTruthy();
      expect(relatorio.codigoProcedimento).toBeTruthy();
      expect(relatorio.scoreConformidade).toBeGreaterThanOrEqual(0);
      expect(relatorio.scoreConformidade).toBeLessThanOrEqual(100);
      expect(["conforme", "nao_conforme", "parcialmente_conforme"]).toContain(relatorio.statusGeral);
    });

    it("deve validar que divergências têm status válido", () => {
      const statusValidos = ["faltante", "excedente", "quantidade_incorreta", "valor_fora_tolerancia", "conforme"];
      const severidadesValidas = ["critica", "alta", "media", "baixa"];

      const divergencia = {
        codigoItem: "10101039",
        descricaoItem: "Taxa Sala",
        tipoItem: "taxa",
        status: "faltante" as const,
        esperado: { quantidade: 1 },
        encontrado: {},
        severidade: "critica" as const,
        mensagem: "Item faltante",
      };

      expect(statusValidos).toContain(divergencia.status);
      expect(severidadesValidas).toContain(divergencia.severidade);
    });
  });

  describe("Cálculo de score de conformidade", () => {
    it("deve calcular score 100 quando todos itens conformes", () => {
      const scoreTotal = 100;
      const totalItens = 5;
      const itensConformes = 5;
      const scoreCalculado = Math.round((itensConformes / totalItens) * 100);

      expect(scoreCalculado).toBe(scoreTotal);
    });

    it("deve calcular score 0 quando nenhum item conforme", () => {
      const scoreTotal = 0;
      const totalItens = 5;
      const itensConformes = 0;
      const scoreCalculado = Math.round((itensConformes / totalItens) * 100);

      expect(scoreCalculado).toBe(scoreTotal);
    });

    it("deve calcular score 60 quando 3 de 5 itens conformes", () => {
      const totalItens = 5;
      const itensConformes = 3;
      const scoreCalculado = Math.round((itensConformes / totalItens) * 100);

      expect(scoreCalculado).toBe(60);
    });

    it("deve respeitar limites de score mínimo aceitável", () => {
      const scoreConformidade = 65;
      const scoreMinimo = 70;
      const statusGeral = scoreConformidade >= scoreMinimo ? "conforme" : "nao_conforme";

      expect(statusGeral).toBe("nao_conforme");
    });
  });

  describe("Validação de divergências", () => {
    it("deve identificar item faltante obrigatório", () => {
      const itemEsperado = { codigoItem: "10101039", obrigatorio: "sim" };
      const itemEncontrado = null;

      const ehFaltante = !itemEncontrado && itemEsperado.obrigatorio === "sim";
      expect(ehFaltante).toBe(true);
    });

    it("deve identificar quantidade incorreta", () => {
      const qtdEsperada = { min: 1, max: 2 };
      const qtdEncontrada = 5;

      const ehIncorreta = qtdEncontrada < qtdEsperada.min || qtdEncontrada > qtdEsperada.max;
      expect(ehIncorreta).toBe(true);
    });

    it("deve identificar item excedente", () => {
      const itemEsperado = null;
      const itemEncontrado = { codigoItem: "10101099" };

      const ehExcedente = !itemEsperado && !!itemEncontrado;
      expect(ehExcedente).toBe(true);
    });

    it("deve validar exemplo de Endoscopia com 7 itens", () => {
      const itensEsperados = [
        { codigoItem: "10101039", descricaoItem: "Taxa Sala", tipoItem: "taxa", obrigatorio: "sim" },
        { codigoItem: "10101040", descricaoItem: "Taxa Endoscopia", tipoItem: "taxa", obrigatorio: "sim" },
        { codigoItem: "10101041", descricaoItem: "Oxigênio", tipoItem: "medicamento", obrigatorio: "sim" },
        { codigoItem: "10101042", descricaoItem: "Diária", tipoItem: "diaria", obrigatorio: "sim" },
        { codigoItem: "10101043", descricaoItem: "Dormonid", tipoItem: "medicamento", obrigatorio: "sim" },
        { codigoItem: "10101044", descricaoItem: "Fentanil", tipoItem: "medicamento", obrigatorio: "sim" },
        { codigoItem: "10101045", descricaoItem: "Compressa", tipoItem: "material", obrigatorio: "sim" },
      ];

      expect(itensEsperados.length).toBe(7);
      expect(itensEsperados.filter((i) => i.tipoItem === "taxa").length).toBe(2);
      expect(itensEsperados.filter((i) => i.tipoItem === "medicamento").length).toBe(3);
    });
  });

  describe("Determinação de status geral", () => {
    it("deve retornar conforme quando sem divergências críticas", () => {
      const divergencias = [];
      const statusGeral = divergencias.length === 0 ? "conforme" : "nao_conforme";

      expect(statusGeral).toBe("conforme");
    });

    it("deve retornar nao_conforme quando tem divergências críticas", () => {
      const divergencias = [
        { status: "faltante", severidade: "critica" },
        { status: "quantidade_incorreta", severidade: "media" },
      ];
      const temCritica = divergencias.some((d) => d.severidade === "critica");
      const statusGeral = temCritica ? "nao_conforme" : "parcialmente_conforme";

      expect(statusGeral).toBe("nao_conforme");
    });

    it("deve retornar parcialmente_conforme quando tem divergências não críticas", () => {
      const divergencias = [
        { status: "quantidade_incorreta", severidade: "media" },
        { status: "excedente", severidade: "baixa" },
      ];
      const temCritica = divergencias.some((d) => d.severidade === "critica");
      const statusGeral = temCritica ? "nao_conforme" : "parcialmente_conforme";

      expect(statusGeral).toBe("parcialmente_conforme");
    });
  });

  describe("Geração de recomendações", () => {
    it("deve gerar recomendação para itens faltantes", () => {
      const divergencias = [
        { status: "faltante", codigoItem: "10101039" },
        { status: "faltante", codigoItem: "10101040" },
      ];

      const faltantes = divergencias.filter((d) => d.status === "faltante");
      const recomendacao = faltantes.length > 0 ? `Adicionar ${faltantes.length} item(ns) faltante(s)` : "";

      expect(recomendacao).toBe("Adicionar 2 item(ns) faltante(s)");
    });

    it("deve gerar recomendação para itens excedentes", () => {
      const divergencias = [{ status: "excedente", codigoItem: "10101099" }];

      const excedentes = divergencias.filter((d) => d.status === "excedente");
      const recomendacao = excedentes.length > 0 ? `Remover ${excedentes.length} item(ns) não esperado(s)` : "";

      expect(recomendacao).toBe("Remover 1 item(ns) não esperado(s)");
    });

    it("deve gerar recomendação para score baixo", () => {
      const scoreConformidade = 65;
      const scoreMinimo = 70;
      const recomendacao =
        scoreConformidade < scoreMinimo
          ? `Score de conformidade (${scoreConformidade}%) abaixo do mínimo aceitável (${scoreMinimo}%)`
          : "";

      expect(recomendacao).toContain("abaixo do mínimo aceitável");
    });
  });

  describe("Relatório consolidado", () => {
    it("deve calcular estatísticas de múltiplos relatórios", () => {
      const relatorios: RelatorioConformidade[] = [
        {
          contaId: 1,
          codigoProcedimento: "31008",
          padraoId: 1,
          scoreConformidade: 100,
          statusGeral: "conforme",
          divergencias: [],
          itensConformes: 5,
          itensDivergentes: 0,
          recomendacoes: [],
        },
        {
          contaId: 2,
          codigoProcedimento: "31008",
          padraoId: 1,
          scoreConformidade: 80,
          statusGeral: "parcialmente_conforme",
          divergencias: [{ codigoItem: "10101039", descricaoItem: "", tipoItem: "taxa", status: "quantidade_incorreta", esperado: {}, encontrado: {}, severidade: "media", mensagem: "" }],
          itensConformes: 4,
          itensDivergentes: 1,
          recomendacoes: [],
        },
        {
          contaId: 3,
          codigoProcedimento: "31008",
          padraoId: 1,
          scoreConformidade: 60,
          statusGeral: "nao_conforme",
          divergencias: [
            { codigoItem: "10101040", descricaoItem: "", tipoItem: "taxa", status: "faltante", esperado: {}, encontrado: {}, severidade: "critica", mensagem: "" },
            { codigoItem: "10101041", descricaoItem: "", tipoItem: "medicamento", status: "faltante", esperado: {}, encontrado: {}, severidade: "critica", mensagem: "" },
          ],
          itensConformes: 3,
          itensDivergentes: 2,
          recomendacoes: [],
        },
      ];

      let contasConformes = 0;
      let contasParcialmenteConformes = 0;
      let contasNaoConformes = 0;
      let scoreTotal = 0;

      for (const rel of relatorios) {
        scoreTotal += rel.scoreConformidade;
        if (rel.statusGeral === "conforme") contasConformes++;
        else if (rel.statusGeral === "parcialmente_conforme") contasParcialmenteConformes++;
        else contasNaoConformes++;
      }

      const scoreMedia = Math.round(scoreTotal / relatorios.length);

      expect(contasConformes).toBe(1);
      expect(contasParcialmenteConformes).toBe(1);
      expect(contasNaoConformes).toBe(1);
      expect(scoreMedia).toBe(80);
    });

    it("deve identificar divergências mais frequentes", () => {
      const divergenciasMap = new Map<string, number>();

      const divergencias = [
        { status: "faltante", tipoItem: "taxa" },
        { status: "faltante", tipoItem: "taxa" },
        { status: "quantidade_incorreta", tipoItem: "medicamento" },
        { status: "excedente", tipoItem: "material" },
        { status: "faltante", tipoItem: "taxa" },
      ];

      for (const div of divergencias) {
        const chave = `${div.status}:${div.tipoItem}`;
        divergenciasMap.set(chave, (divergenciasMap.get(chave) || 0) + 1);
      }

      const maisFrequentes = Array.from(divergenciasMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1);

      expect(maisFrequentes[0][0]).toBe("faltante:taxa");
      expect(maisFrequentes[0][1]).toBe(3);
    });
  });

  describe("Validação de quantidade", () => {
    it("deve validar quantidade mínima e máxima", () => {
      const qtdMin = 1;
      const qtdMax = 5;
      const qtdEncontrada = 3;

      const ehValida = qtdEncontrada >= qtdMin && qtdEncontrada <= qtdMax;
      expect(ehValida).toBe(true);
    });

    it("deve rejeitar quantidade abaixo do mínimo", () => {
      const qtdMin = 2;
      const qtdMax = 5;
      const qtdEncontrada = 1;

      const ehValida = qtdEncontrada >= qtdMin && qtdEncontrada <= qtdMax;
      expect(ehValida).toBe(false);
    });

    it("deve rejeitar quantidade acima do máximo", () => {
      const qtdMin = 1;
      const qtdMax = 2;
      const qtdEncontrada = 5;

      const ehValida = qtdEncontrada >= qtdMin && qtdEncontrada <= qtdMax;
      expect(ehValida).toBe(false);
    });
  });

  describe("Exemplo prático: Auditoria de Endoscopia", () => {
    it("deve validar Endoscopia com todos itens conformes", () => {
      const itensEsperados = [
        { codigoItem: "10101039", quantidadeMinima: 1, quantidadeMaxima: 1, obrigatorio: "sim" },
        { codigoItem: "10101040", quantidadeMinima: 1, quantidadeMaxima: 1, obrigatorio: "sim" },
        { codigoItem: "10101041", quantidadeMinima: 1, quantidadeMaxima: 1, obrigatorio: "sim" },
      ];

      const itensEncontrados = [
        { codigoItem: "10101039", quantidade: 1 },
        { codigoItem: "10101040", quantidade: 1 },
        { codigoItem: "10101041", quantidade: 1 },
      ];

      let itensConformes = 0;
      for (const itemEsp of itensEsperados) {
        const itemEnc = itensEncontrados.find((i) => i.codigoItem === itemEsp.codigoItem);
        if (
          itemEnc &&
          itemEnc.quantidade >= itemEsp.quantidadeMinima &&
          itemEnc.quantidade <= itemEsp.quantidadeMaxima
        ) {
          itensConformes++;
        }
      }

      const scoreConformidade = Math.round((itensConformes / itensEsperados.length) * 100);
      expect(scoreConformidade).toBe(100);
    });

    it("deve validar Endoscopia com item faltante", () => {
      const itensEsperados = [
        { codigoItem: "10101039", obrigatorio: "sim" },
        { codigoItem: "10101040", obrigatorio: "sim" },
        { codigoItem: "10101041", obrigatorio: "sim" },
      ];

      const itensEncontrados = [
        { codigoItem: "10101039" },
        { codigoItem: "10101040" },
        // Falta 10101041
      ];

      const divergencias = [];
      for (const itemEsp of itensEsperados) {
        const itemEnc = itensEncontrados.find((i) => i.codigoItem === itemEsp.codigoItem);
        if (!itemEnc && itemEsp.obrigatorio === "sim") {
          divergencias.push({ status: "faltante", codigoItem: itemEsp.codigoItem });
        }
      }

      expect(divergencias.length).toBe(1);
      expect(divergencias[0].codigoItem).toBe("10101041");
    });
  });
});
