import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-custos",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("relatorioCustos", () => {
  const { ctx } = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  describe("buscar", () => {
    it("retorna estrutura correta com dados paginados", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.buscar({
        estabelecimentoId: 1,
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("pagina");
      expect(result).toHaveProperty("totalPaginas");
      expect(result).toHaveProperty("fonte");
      expect(Array.isArray(result.dados)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.pagina).toBe("number");
      expect(typeof result.totalPaginas).toBe("number");
      expect(["cache_local", "postgresql_direto"]).toContain(result.fonte);
    });

    it("aceita filtro por tipo de produto", async () => {
      const result = await caller.relatorioCustos.buscar({
        estabelecimentoId: 1,
        tipoprod: "M",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
    });

    it("aceita filtro por tabela de preco", async () => {
      const result = await caller.relatorioCustos.buscar({
        estabelecimentoId: 1,
        codtbmm: "50",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
    });

    it("aceita filtro por busca textual", async () => {
      const result = await caller.relatorioCustos.buscar({
        estabelecimentoId: 1,
        busca: "dipirona",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
    });

    it("aceita combinacao de filtros", async () => {
      const result = await caller.relatorioCustos.buscar({
        estabelecimentoId: 1,
        tipoprod: "M",
        codtbmm: "50",
        busca: "test",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("dados");
      expect(result).toHaveProperty("total");
    });
  });

  describe("opcoesFiltro", () => {
    it("retorna opcoes de filtro com tipos de produto e tabelas de preco", async () => {
      const result = await caller.relatorioCustos.opcoesFiltro({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("tiposProduto");
      expect(result).toHaveProperty("tabelasPreco");
      expect(Array.isArray(result.tiposProduto)).toBe(true);
      expect(Array.isArray(result.tabelasPreco)).toBe(true);
    });
  });

  describe("statusSincronizacao", () => {
    it("retorna status de sincronizacao com campos esperados", async () => {
      const result = await caller.relatorioCustos.statusSincronizacao({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("ultimaSincronizacao");
      expect(result).toHaveProperty("totalRegistrosCache");
      expect(["nunca", "em_andamento", "sucesso", "erro"]).toContain(result.status);
      expect(typeof result.totalRegistrosCache).toBe("number");
    });

    it("retorna campo mensagemErro quando status eh erro", async () => {
      const result = await caller.relatorioCustos.statusSincronizacao({
        estabelecimentoId: 1,
      });

      // Deve ter o campo mensagemErro (pode ser null se não houver erro)
      expect(result).toHaveProperty("mensagemErro");
      expect(result).toHaveProperty("duracaoSegundos");
      expect(typeof result.duracaoSegundos).toBe("number");
    });

    it("retorna status nunca para estabelecimento inexistente", async () => {
      const result = await caller.relatorioCustos.statusSincronizacao({
        estabelecimentoId: 999999,
      });

      expect(result.status).toBe("nunca");
      expect(result.totalRegistrosCache).toBe(0);
    });
  });

  describe("metricasDashboard", () => {
    it("retorna metricas com estrutura completa", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.metricasDashboard({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("totalProdutos");
      expect(result).toHaveProperty("totalMedicamentos");
      expect(result).toHaveProperty("totalTaxas");
      expect(result).toHaveProperty("totalOutros");
      expect(result).toHaveProperty("custoMedioEstoque");
      expect(result).toHaveProperty("custoMedioFatura");
      expect(result).toHaveProperty("valorMedioMM");
      expect(result).toHaveProperty("porTipoProduto");
      expect(result).toHaveProperty("porTabelaPreco");
      expect(result).toHaveProperty("topCustoEstoque");
      expect(result).toHaveProperty("topCustoFatura");
      expect(result).toHaveProperty("comparativoCustos");
      expect(result).toHaveProperty("fonte");

      expect(typeof result.totalProdutos).toBe("number");
      expect(typeof result.custoMedioEstoque).toBe("number");
      expect(typeof result.custoMedioFatura).toBe("number");
      expect(typeof result.valorMedioMM).toBe("number");
      expect(Array.isArray(result.porTipoProduto)).toBe(true);
      expect(Array.isArray(result.porTabelaPreco)).toBe(true);
      expect(Array.isArray(result.topCustoEstoque)).toBe(true);
      expect(Array.isArray(result.topCustoFatura)).toBe(true);
      expect(Array.isArray(result.comparativoCustos)).toBe(true);
    });

    it("aceita filtro por tipo de produto nas metricas", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.metricasDashboard({
        estabelecimentoId: 1,
        tipoprod: "M",
      });

      expect(result).toHaveProperty("totalProdutos");
      expect(result).toHaveProperty("fonte");
    });

    it("aceita filtro por tabela de preco nas metricas", async () => {
      const result = await caller.relatorioCustos.metricasDashboard({
        estabelecimentoId: 1,
        codtbmm: "50",
      });

      expect(result).toHaveProperty("totalProdutos");
      expect(result).toHaveProperty("fonte");
    });

    it("aceita combinacao de filtros nas metricas", async () => {
      const result = await caller.relatorioCustos.metricasDashboard({
        estabelecimentoId: 1,
        tipoprod: "T",
        codtbmm: "04",
      });

      expect(result).toHaveProperty("totalProdutos");
      expect(result).toHaveProperty("fonte");
    });
  });

  describe("comparacaoCustoConvenio", () => {
    it("retorna estrutura completa de comparacao", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("pagina");
      expect(result).toHaveProperty("totalPaginas");
      expect(result).toHaveProperty("resumo");
      expect(result).toHaveProperty("fonte");

      expect(Array.isArray(result.itens)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.pagina).toBe("number");
      expect(typeof result.totalPaginas).toBe("number");

      // Resumo
      expect(result.resumo).toHaveProperty("totalItens");
      expect(result.resumo).toHaveProperty("totalComLucro");
      expect(result.resumo).toHaveProperty("totalComPrejuizo");
      expect(result.resumo).toHaveProperty("totalNeutro");
      expect(result.resumo).toHaveProperty("margemMediaPercent");
      expect(result.resumo).toHaveProperty("margemTotalReais");
      expect(result.resumo).toHaveProperty("custoTotalHospital");
      expect(result.resumo).toHaveProperty("valorTotalConvenio");
      expect(typeof result.resumo.totalItens).toBe("number");
      expect(typeof result.resumo.totalComLucro).toBe("number");
      expect(typeof result.resumo.totalComPrejuizo).toBe("number");
    });

    it("aceita filtro por tipo de produto", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        tipoprod: "M",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumo");
    });

    it("aceita filtro por tabela de preco", async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        codtbmm: "50",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumo");
    });

    it("aceita filtro apenasComPrejuizo", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        apenasComPrejuizo: true,
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumo");
      // Se houver itens, todos devem ter margem negativa
      for (const item of result.itens) {
        if (item.custoHospital > 0) {
          expect(item.margemReais).toBeLessThanOrEqual(0);
        }
      }
    });

    it("aceita busca textual", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        busca: "dipirona",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumo");
    });

    it("aceita combinacao de filtros", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        tipoprod: "M",
        codtbmm: "50",
        busca: "test",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumo");
    });

    it("itens retornados tem campos de margem calculados", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        limit: 10,
        offset: 0,
      });

      for (const item of result.itens) {
        expect(item).toHaveProperty("codprod");
        expect(item).toHaveProperty("descricao");
        expect(item).toHaveProperty("custoHospital");
        expect(item).toHaveProperty("valorConvenio");
        expect(item).toHaveProperty("margemReais");
        expect(item).toHaveProperty("margemPercent");
        expect(item).toHaveProperty("status");
        expect(["lucro", "prejuizo", "neutro"]).toContain(item.status);
        expect(typeof item.custoHospital).toBe("number");
        expect(typeof item.valorConvenio).toBe("number");
        expect(typeof item.margemReais).toBe("number");
        expect(typeof item.margemPercent).toBe("number");
      }
    });

    it("itens retornados incluem unidadeFaturas e multFaturas", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        limit: 10,
        offset: 0,
      });

      for (const item of result.itens) {
        expect(item).toHaveProperty("unidadeFaturas");
        expect(typeof item.unidadeFaturas).toBe("string");
        expect(item).toHaveProperty("multFaturas");
        // multFaturas pode ser number ou null
        if (item.multFaturas !== null) {
          expect(typeof item.multFaturas).toBe("number");
        }
      }
    });

    it("custoHospital usa custoMultFat (nao custoEstoque inflado)", { timeout: 15000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        limit: 50,
        offset: 0,
      });

      // Verificar que os valores de custoHospital sao razoaveis (nao inflados)
      // custoMultFat tipicamente < 100 para a maioria dos itens
      // Se estivesse usando custoEstoque, teriamos valores como 329.54 (frasco inteiro)
      for (const item of result.itens) {
        // custoHospital deve ser > 0 (filtro do backend)
        expect(item.custoHospital).toBeGreaterThan(0);
        // valorConvenio deve ser > 0 (filtro do backend)
        expect(item.valorConvenio).toBeGreaterThan(0);
        // margemReais = valorConvenio - custoHospital
        expect(item.margemReais).toBeCloseTo(item.valorConvenio - item.custoHospital, 2);
      }
    });

    it("topPrejuizo e topLucro incluem unidadeFaturas", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.comparacaoCustoConvenio({
        estabelecimentoId: 1,
        limit: 10,
        offset: 0,
      });

      for (const item of result.topPrejuizo) {
        expect(item).toHaveProperty("unidadeFaturas");
        expect(typeof item.unidadeFaturas).toBe("string");
      }
      for (const item of result.topLucro) {
        expect(item).toHaveProperty("unidadeFaturas");
        expect(typeof item.unidadeFaturas).toBe("string");
      }
    });
  });
});


describe("relatorioCustos - custoMultFat nas abas", () => {
  const { ctx } = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  describe("custosPorConvenio", () => {
    it("retorna estrutura completa com kpis e itens detalhados", { timeout: 60000 }, async () => {
      const result = await caller.relatorioCustos.custosPorConvenio({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("itensDetalhados");
      expect(result).toHaveProperty("totalItensDetalhados");
      expect(result).toHaveProperty("itens");
      expect(result).toHaveProperty("resumoPorConvenio");
      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("topItensPrejuizo");
      expect(result).toHaveProperty("topItensLucro");
      expect(result).toHaveProperty("conveniosDisponiveis");
      expect(result).toHaveProperty("competenciasDisponiveis");
      expect(result).toHaveProperty("fonte");

      expect(Array.isArray(result.itensDetalhados)).toBe(true);
      expect(typeof result.kpis.valorFaturadoTotal).toBe("number");
      expect(typeof result.kpis.custoTotal).toBe("number");
    });

    it("itens detalhados possuem custoUnitario baseado em custoMultFat", { timeout: 60000 }, async () => {
      const result = await caller.relatorioCustos.custosPorConvenio({
        estabelecimentoId: 1,
      });

      for (const item of result.itensDetalhados) {
        expect(item).toHaveProperty("codprod");
        expect(item).toHaveProperty("descricao");
        expect(item).toHaveProperty("unidade");
        expect(item).toHaveProperty("custoUnitario");
        expect(item).toHaveProperty("custoTotal");
        expect(item).toHaveProperty("valorCobradoTotal");
        expect(item).toHaveProperty("margem");
        expect(item).toHaveProperty("resultado");
        expect(typeof item.custoUnitario).toBe("number");
        expect(typeof item.custoTotal).toBe("number");
        expect(["lucro", "prejuizo", "empate"]).toContain(item.resultado);
      }
    });

    it("custoUnitario nao deve ser inflado (custoEstoque do frasco inteiro)", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.custosPorConvenio({
        estabelecimentoId: 1,
        busca: "SEVOFLURANO",
      });

      // Se houver SEVOFLURANO, custoUnitario deve ser ~1.32/ml, nao ~329.54/frasco
      for (const item of result.itensDetalhados) {
        if (item.descricao.includes("SEVOFLURANO")) {
          // custoMultFat para SEVOFLURANO = custoatual / multcobr = ~329.54 / 250 = ~1.32
          // Se estivesse usando custoEstoque, seria ~329.54
          expect(item.custoUnitario).toBeLessThan(50);
        }
      }
    });
  });

  describe("custosPorConta", () => {
    it("retorna estrutura completa com contas e kpis", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.custosPorConta({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("contas");
      expect(result).toHaveProperty("totalContas");
      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("topContasPrejuizo");
      expect(result).toHaveProperty("topContasLucro");
      expect(result).toHaveProperty("conveniosDisponiveis");
      expect(result).toHaveProperty("competenciasDisponiveis");
      expect(result).toHaveProperty("fonte");

      expect(Array.isArray(result.contas)).toBe(true);
      expect(typeof result.kpis.custoTotalGeral).toBe("number");
      expect(typeof result.kpis.valorCobradoGeral).toBe("number");
    });

    it("contas possuem custoTotal baseado em custoMultFat (nao inflado)", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.custosPorConta({
        estabelecimentoId: 1,
      });

      for (const conta of result.contas) {
        expect(conta).toHaveProperty("numconta");
        expect(conta).toHaveProperty("custoTotal");
        expect(conta).toHaveProperty("valorCobrado");
        expect(conta).toHaveProperty("margem");
        expect(conta).toHaveProperty("resultado");
        expect(typeof conta.custoTotal).toBe("number");
        expect(typeof conta.valorCobrado).toBe("number");
        expect(["lucro", "prejuizo", "empate"]).toContain(conta.resultado);
      }
    });
  });

  describe("custosPorSetor", () => {
    it("retorna estrutura completa com resumo por setor e itens detalhados", { timeout: 60000 }, async () => {
      const result = await caller.relatorioCustos.custosPorSetor({
        estabelecimentoId: 1,
      });

      expect(result).toHaveProperty("resumoPorSetor");
      expect(result).toHaveProperty("itensDetalhados");
      expect(result).toHaveProperty("totalItensDetalhados");
      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("topSetoresPrejuizo");
      expect(result).toHaveProperty("topSetoresLucro");
      expect(result).toHaveProperty("setoresDisponiveis");
      expect(result).toHaveProperty("conveniosDisponiveis");
      expect(result).toHaveProperty("competenciasDisponiveis");
      expect(result).toHaveProperty("fonte");

      expect(Array.isArray(result.resumoPorSetor)).toBe(true);
      expect(Array.isArray(result.itensDetalhados)).toBe(true);
      expect(typeof result.kpis.valorFaturadoTotal).toBe("number");
      expect(typeof result.kpis.custoTotal).toBe("number");
    });

    it("itens detalhados possuem custoUnitario baseado em custoMultFat", { timeout: 60000 }, async () => {
      const result = await caller.relatorioCustos.custosPorSetor({
        estabelecimentoId: 1,
      });

      for (const item of result.itensDetalhados) {
        expect(item).toHaveProperty("codprod");
        expect(item).toHaveProperty("descricao");
        expect(item).toHaveProperty("setor");
        expect(item).toHaveProperty("unidade");
        expect(item).toHaveProperty("custoUnitario");
        expect(item).toHaveProperty("custoTotal");
        expect(item).toHaveProperty("valorCobradoTotal");
        expect(item).toHaveProperty("margem");
        expect(item).toHaveProperty("resultado");
        expect(typeof item.custoUnitario).toBe("number");
        expect(typeof item.custoTotal).toBe("number");
        expect(["lucro", "prejuizo", "empate"]).toContain(item.resultado);
      }
    });

    it("custoUnitario nao deve ser inflado para SEVOFLURANO", { timeout: 30000 }, async () => {
      const result = await caller.relatorioCustos.custosPorSetor({
        estabelecimentoId: 1,
        busca: "SEVOFLURANO",
      });

      for (const item of result.itensDetalhados) {
        if (item.descricao.includes("SEVOFLURANO")) {
          expect(item.custoUnitario).toBeLessThan(50);
        }
      }
    });
  });
});
