import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb - precisa retornar um objeto com execute
const mockExecute = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
}));

// Import after mocking
import {
  popularDeTasy,
  popularDeXmlTiss,
  popularDeIntegFaturado,
  popularFaturamentoUnificado,
  listarFaturamentoUnificado,
  resumoFaturamentoPorConvenio,
  resumoFaturamentoPorGuia,
  itensPorGuia,
  competenciasDisponiveis,
  conveniosDisponiveis,
  atualizarStatusConciliacao,
  vincularGuiaManual,
  buscarRecebimentosCandidatos,
  lotesXmlTissDisponiveis,
  lotesRetornoDisponiveis,
  datasPagamentoConciliados,
  montarCondicaoDataPagamentoConciliado,
  resumoConciliadosAutomatico,
  resumoConciliadosPorGuia,
} from "./faturamentoUnificadoService";

describe("faturamentoUnificadoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: retorna resultado vazio
    mockExecute.mockResolvedValue([[]]);
  });

  // ============================================================
  // TESTES DE ANTI-DUPLICAÇÃO (CORREÇÃO PRINCIPAL)
  // ============================================================

  describe("popularDeIntegFaturado - anti-duplicação", () => {
    it("deve deletar APENAS itens com statusConciliacao = 'pendente'", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 100 }]) // DELETE (apenas pendentes)
        .mockResolvedValueOnce([{ affectedRows: 50 }])  // INSERT (novos itens)
        .mockResolvedValueOnce([[{ total: 150 }]]);      // COUNT
      
      await popularDeIntegFaturado(2);
      
      // Verificar que o DELETE contém statusConciliacao = 'pendente'
      const deleteCall = mockExecute.mock.calls[0][0];
      const deleteSql = deleteCall.queryChunks?.[0]?.value?.[0] || deleteCall.toString();
      expect(deleteSql).toContain("statusConciliacao = 'pendente'");
      expect(deleteSql).toContain("origemSistema = 'WARLEINE'");
    });

    it("deve usar LEFT JOIN para evitar inserir itens que já existem", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])   // DELETE
        .mockResolvedValueOnce([{ affectedRows: 10 }])   // INSERT
        .mockResolvedValueOnce([[{ total: 200 }]]);       // COUNT
      
      await popularDeIntegFaturado(2);
      
      // Verificar que o INSERT contém LEFT JOIN e fu.id IS NULL
      const insertCall = mockExecute.mock.calls[1][0];
      const insertSql = insertCall.queryChunks?.[0]?.value?.[0] || insertCall.toString();
      expect(insertSql).toContain("LEFT JOIN faturamento_unificado fu");
      expect(insertSql).toContain("fu.id IS NULL");
    });

    it("deve aceitar competência como filtro", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 50 }])
        .mockResolvedValueOnce([[{ total: 50 }]]);
      
      const result = await popularDeIntegFaturado(2, "2025-12");
      
      expect(mockExecute).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("total");
    });
  });

  describe("popularDeTasy - anti-duplicação", () => {
    it("deve deletar APENAS itens pendentes do TASY", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])   // DELETE
        .mockResolvedValueOnce([{ affectedRows: 100 }])  // INSERT
        .mockResolvedValueOnce([[{ total: 100 }]]);       // COUNT
      
      await popularDeTasy(1);
      
      const deleteCall = mockExecute.mock.calls[0][0];
      const deleteSql = deleteCall.queryChunks?.[0]?.value?.[0] || deleteCall.toString();
      expect(deleteSql).toContain("statusConciliacao = 'pendente'");
      expect(deleteSql).toContain("origemSistema = 'TASY'");
    });

    it("deve usar LEFT JOIN para evitar duplicação", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 100 }])
        .mockResolvedValueOnce([[{ total: 100 }]]);
      
      await popularDeTasy(1);
      
      const insertCall = mockExecute.mock.calls[1][0];
      const insertSql = insertCall.queryChunks?.[0]?.value?.[0] || insertCall.toString();
      expect(insertSql).toContain("LEFT JOIN faturamento_unificado fu");
      expect(insertSql).toContain("fu.id IS NULL");
    });

    it("deve aceitar competência como filtro opcional", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 50 }])
        .mockResolvedValueOnce([[{ total: 50 }]]);
      
      const result = await popularDeTasy(1, "2025-12");
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("popularDeXmlTiss - anti-duplicação", () => {
    it("deve deletar APENAS itens XML_TISS pendentes", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])   // DELETE
        .mockResolvedValueOnce([{ affectedRows: 200 }])  // INSERT
        .mockResolvedValueOnce([[{ total: 200 }]]);       // COUNT
      
      await popularDeXmlTiss(1);
      
      const deleteCall = mockExecute.mock.calls[0][0];
      const deleteSql = deleteCall.queryChunks?.[0]?.value?.[0] || deleteCall.toString();
      expect(deleteSql).toContain("statusConciliacao = 'pendente'");
      expect(deleteSql).toContain("origemSistema = 'XML_TISS'");
    });

    it("deve usar LEFT JOIN para evitar inserir itens já existentes", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 200 }])
        .mockResolvedValueOnce([[{ total: 200 }]]);
      
      await popularDeXmlTiss(1);
      
      const insertCall = mockExecute.mock.calls[1][0];
      const insertSql = insertCall.queryChunks?.[0]?.value?.[0] || insertCall.toString();
      expect(insertSql).toContain("LEFT JOIN faturamento_unificado fu");
      expect(insertSql).toContain("fu.id IS NULL");
    });

    it("deve aceitar dataReferencia como filtro", async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 50 }])
        .mockResolvedValueOnce([[{ total: 50 }]]);
      
      const result = await popularDeXmlTiss(1, "2025-12");
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("inseridos");
    });
  });

  // ============================================================
  // TESTES EXISTENTES
  // ============================================================

  describe("popularFaturamentoUnificado", () => {
    it("deve chamar popularDeIntegFaturado e popularDeXmlTiss", async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      
      const result = await popularFaturamentoUnificado(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("warleine");
      expect(result).toHaveProperty("xmlTiss");
    });
  });

  describe("resumoFaturamentoPorGuia", () => {
    it("deve retornar resumo com totais", async () => {
      mockExecute
        .mockResolvedValueOnce([[{
          totalItens: 500,
          totalContas: 50,
          totalFaturado: "150000.00",
          totalPago: "120000.00",
          totalGlosado: "30000.00",
          totalPendente: "0.00",
          itensConciliados: 300,
          itensDivergentes: 50,
          itensPendentes: 100,
          itensNaoRecebidos: 50,
        }]])
        .mockResolvedValueOnce([[{ total: 50 }]])
        .mockResolvedValueOnce([[]]);
      
      const result = await resumoFaturamentoPorGuia({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("deve aceitar filtros de competência e convênio", async () => {
      mockExecute
        .mockResolvedValueOnce([[{
          totalItens: 100,
          totalContas: 10,
          totalFaturado: "50000.00",
          totalPago: "40000.00",
          totalGlosado: "10000.00",
          totalPendente: "0.00",
          itensConciliados: 80,
          itensDivergentes: 10,
          itensPendentes: 5,
          itensNaoRecebidos: 5,
        }]])
        .mockResolvedValueOnce([[{ total: 10 }]])
        .mockResolvedValueOnce([[]]);
      
      const result = await resumoFaturamentoPorGuia({
        estabelecimentoId: 1,
        competencia: "2025-12",
        convenio: "IPASGO",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("itensPorGuia", () => {
    it("deve retornar itens de uma guia específica por contaNumero", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          descricaoItem: "Proteínas Totais",
          tipoItem: "PROC",
          quantidade: 1,
          valorFaturado: "4.13",
          valorPago: "4.13",
          valorGlosado: "0.00",
          statusConciliacao: "conciliado",
        },
      ]]);
      
      const result = await itensPorGuia({
        estabelecimentoId: 1,
        contaNumero: "12345",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve retornar itens por numeroGuia", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await itensPorGuia({
        estabelecimentoId: 1,
        numeroGuia: "G001",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("buscarRecebimentosCandidatos", () => {
    it("deve buscar recebimentos por nome do paciente", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          origem: "excel",
          numeroGuia: "18874660",
          nomeBeneficiario: "JOÃO SILVA",
          codigoItem: "40302385",
          descricaoItem: "Proteínas Totais",
          valorPago: "4.13",
          valorGlosa: "0.00",
        },
      ]]);
      
      const result = await buscarRecebimentosCandidatos({
        estabelecimentoId: 1,
        pacienteNome: "João",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("vincularGuiaManual", () => {
    it("deve atualizar os registros de faturamento com o recebimento vinculado", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 3 }]);
      
      const result = await vincularGuiaManual({
        faturamentoIds: [1, 2, 3],
        recebimentoId: 100,
        recebimentoOrigem: "excel",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toHaveProperty("atualizados");
    });
  });

  describe("atualizarStatusConciliacao", () => {
    it("deve atualizar o status de conciliação de um item", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      
      await atualizarStatusConciliacao({
        id: 1,
        statusConciliacao: "conciliado",
      });
      
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe("competenciasDisponiveis", () => {
    it("deve retornar lista de competências disponíveis", async () => {
      mockExecute.mockResolvedValueOnce([[
        { competencia: "2025-12", origemSistema: "TASY", total: 500 },
        { competencia: "2025-11", origemSistema: "TASY", total: 300 },
      ]]);
      
      const result = await competenciasDisponiveis(1);
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("conveniosDisponiveis", () => {
    it("deve retornar lista de convênios disponíveis", async () => {
      mockExecute.mockResolvedValueOnce([[
        { convenio: "IPASGO", total: 200 },
        { convenio: "UNIMED", total: 150 },
      ]]);
      
      const result = await conveniosDisponiveis({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve aceitar filtro de competência", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await conveniosDisponiveis({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("listarFaturamentoUnificado", () => {
    it("deve retornar lista paginada de itens", async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 100 }]])
        .mockResolvedValueOnce([[
          {
            id: 1,
            origemSistema: "TASY",
            contaNumero: "12345",
            pacienteNome: "João Silva",
            convenio: "IPASGO",
            competencia: "2025-12",
            codigoItem: "40302385",
            descricaoItem: "Proteínas Totais",
            valorFaturado: "4.13",
            valorPago: "4.13",
            valorGlosado: "0.00",
            statusConciliacao: "conciliado",
          },
        ]]);
      
      const result = await listarFaturamentoUnificado({
        estabelecimentoId: 1,
        limite: 50,
        offset: 0,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("resumoFaturamentoPorConvenio", () => {
    it("deve retornar resumo agrupado por convênio", async () => {
      mockExecute.mockResolvedValueOnce([[
        {
          convenio: "IPASGO",
          totalItens: 200,
          totalFaturado: "50000.00",
          totalPago: "40000.00",
          totalGlosado: "10000.00",
        },
      ]]);
      
      const result = await resumoFaturamentoPorConvenio({
        estabelecimentoId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ============================================================
  // TESTES DOS FILTROS DE LOTE
  // ============================================================

  describe("lotesXmlTissDisponiveis", () => {
    it("deve retornar lista de lotes do XML TISS", async () => {
      mockExecute.mockResolvedValueOnce([[
        { lote: "89482", total: 150 },
        { lote: "89345", total: 120 },
      ]]);
      
      const result = await lotesXmlTissDisponiveis({
        estabelecimentoId: 6,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve aceitar filtro de competência e convênio", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await lotesXmlTissDisponiveis({
        estabelecimentoId: 6,
        competencia: "2025-12",
        convenioId: 1,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("lotesRetornoDisponiveis", () => {
    it("deve retornar lista de lotes do retorno/demonstrativo", async () => {
      mockExecute.mockResolvedValueOnce([[
        { lote: "88914", protocolo: "473604", total: 200 },
        { lote: "89345", protocolo: "487435", total: 180 },
      ]]);
      
      const result = await lotesRetornoDisponiveis({
        estabelecimentoId: 6,
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve aceitar filtro de competência", async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      
      const result = await lotesRetornoDisponiveis({
        estabelecimentoId: 6,
        competencia: "2025-12",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("resumoFaturamentoPorGuia - filtros de lote", () => {
    it("deve aplicar filtro de loteXml na query", async () => {
      mockExecute
        .mockResolvedValueOnce([[]]) // rows
        .mockResolvedValueOnce([[{ total: 0 }]]) // count
        .mockResolvedValueOnce([[{ totalItens: 0, totalContas: 0, totalFaturado: 0, totalPago: 0, totalGlosado: 0, totalPendente: 0, itensConciliados: 0, itensDivergentes: 0, itensPendentes: 0, itensNaoRecebidos: 0 }]]); // resumo
      
      await resumoFaturamentoPorGuia({
        estabelecimentoId: 6,
        loteXml: "89482",
      });
      
      // Verificar que a função foi chamada com parâmetros de lote
      expect(mockExecute).toHaveBeenCalled();
      // Verificar que recebeu mais chamadas do que sem filtro (SQL com WHERE adicional)
      const calls = mockExecute.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      // Serializar todas as chamadas para verificar presença do filtro
      const allSql = calls.map(c => {
        try { return JSON.stringify(c[0]); } catch { return String(c[0]); }
      }).join(' ');
      expect(allSql).toContain("89482");
    });

    it("deve aplicar filtro de loteRetorno na query", async () => {
      mockExecute
        .mockResolvedValueOnce([[]]) // rows
        .mockResolvedValueOnce([[{ total: 0 }]]) // count
        .mockResolvedValueOnce([[{ totalItens: 0, totalContas: 0, totalFaturado: 0, totalPago: 0, totalGlosado: 0, totalPendente: 0, itensConciliados: 0, itensDivergentes: 0, itensPendentes: 0, itensNaoRecebidos: 0 }]]); // resumo
      
      await resumoFaturamentoPorGuia({
        estabelecimentoId: 6,
        loteRetorno: "88914",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      const calls = mockExecute.mock.calls;
      const allSql = calls.map(c => {
        try { return JSON.stringify(c[0]); } catch { return String(c[0]); }
      }).join(' ');
      expect(allSql).toContain("88914");
    });
  });

  describe("resumoConciliadosPorGuia - filtros de lote", () => {
    it("deve aplicar filtro de loteXml via subquery", async () => {
      mockExecute
        .mockResolvedValueOnce([[]]) // rows
        .mockResolvedValueOnce([[{ total: 0 }]]); // count
      
      await resumoConciliadosPorGuia({
        estabelecimentoId: 6,
        loteXml: "89482",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      const calls = mockExecute.mock.calls;
      const allSql = calls.map(c => {
        try { return JSON.stringify(c[0]); } catch { return String(c[0]); }
      }).join(' ');
      expect(allSql).toContain("89482");
    });

    it("deve aplicar filtro de loteRetorno via subquery demonstrativo", async () => {
      mockExecute
        .mockResolvedValueOnce([[]]) // rows
        .mockResolvedValueOnce([[{ total: 0 }]]); // count
      
      await resumoConciliadosPorGuia({
        estabelecimentoId: 6,
        loteRetorno: "88914",
      });
      
      expect(mockExecute).toHaveBeenCalled();
      const calls = mockExecute.mock.calls;
      const allSql = calls.map(c => {
        try { return JSON.stringify(c[0]); } catch { return String(c[0]); }
      }).join(' ');
      expect(allSql).toContain("88914");
    });
  });

  describe("filtro Data de Pagamento - múltiplas origens", () => {
    it("deve consultar recebimentos Excel e demonstrativos XML pela data exata", () => {
      const filtro = montarCondicaoDataPagamentoConciliado('ca', '2026-08-01');

      expect(filtro).toContain("ca.recebimentoOrigem = 'excel'");
      expect(filtro).toContain("FROM recebimentos_excel");
      expect(filtro).toContain("DATE(re_data_pagto.data_pagto) = '2026-08-01'");
      expect(filtro).toContain("ca.recebimentoOrigem IN ('demonstrativo', 'xml')");
      expect(filtro).toContain("FROM demonstrativo");
      expect(filtro).toContain("DATE(d_data_pagto.data_pagamento) = '2026-08-01'");
    });

    it("deve rejeitar mês sem dia para impedir comparação incompatível", () => {
      expect(() => montarCondicaoDataPagamentoConciliado('ca', '2026-08')).toThrow(
        'Data de pagamento deve estar no formato YYYY-MM-DD',
      );
    });

    it("deve aplicar as duas origens ao resumo por guia", async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await resumoConciliadosPorGuia({
        estabelecimentoId: 1,
        dataPagto: '2026-08-01',
      });

      const allSql = mockExecute.mock.calls.map(c => JSON.stringify(c[0])).join(' ');
      expect(allSql).toContain('recebimentos_excel');
      expect(allSql).toContain('demonstrativo');
      expect(allSql).toContain('2026-08-01');
    });

    it("deve usar a data real do recebimento no resumo, não competenciaPagamento mensal", async () => {
      mockExecute.mockResolvedValueOnce([[]]);

      await resumoConciliadosAutomatico({
        estabelecimentoId: 1,
        dataPagto: '2026-08-01',
      });

      const allSql = mockExecute.mock.calls.map(c => JSON.stringify(c[0])).join(' ');
      expect(allSql).toContain('recebimentos_excel');
      expect(allSql).toContain('demonstrativo');
      expect(allSql).not.toContain("competenciaPagamento LIKE '2026-08-01%'");
    });

    it("deve listar datas de pagamento combinando Excel e demonstrativo", async () => {
      mockExecute.mockResolvedValueOnce([[]]);

      await datasPagamentoConciliados({ estabelecimentoId: 1 });

      const allSql = mockExecute.mock.calls.map(c => JSON.stringify(c[0])).join(' ');
      expect(allSql).toContain('UNION ALL');
      expect(allSql).toContain('recebimentos_excel');
      expect(allSql).toContain('demonstrativo');
      expect(allSql).toContain('data_pagamento');
    });
  });
});
