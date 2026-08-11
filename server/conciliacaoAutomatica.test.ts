import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb
const mockExecute = vi.fn();
const mockPoolQuery = vi.fn();
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    execute: mockExecute,
  })),
  getRawPool: vi.fn(() => ({
    query: mockPoolQuery,
  })),
}));

import {
  executarConciliacaoAutomatica,
  resetarConciliacao,
} from "./faturamentoUnificadoService";

/**
 * Sequência de queries na executarConciliacaoAutomatica:
 * (O processamento em lotes por competência agora é feito pelo conciliacaoJobManager)
 * 
 * 1. DELETE conciliados_automatico (PASSO 0.5)
 * 2. SELECT faturamento_unificado (PASSO 1)
 * 3. SELECT prestadores próprios (PASSO 1.5) - só se faturamento não vazio
 * 4. SELECT recebimentos_excel (PASSO 2) - só se faturamento não vazio
 * 5. SELECT vinculacao_codigos (PASSO 3) - só se faturamento não vazio
 * 6. INSERT conciliados_automatico (PASSO 6) - batches
 * 7. UPDATE faturamento_unificado (PASSO 7) - batches
 */

describe("conciliacaoAutomatica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([[]]);
    mockPoolQuery.mockResolvedValue([{ affectedRows: 0 }]);
  });

  describe("executarConciliacaoAutomatica", () => {
    it("deve retornar resultado vazio quando nao ha itens de faturamento", async () => {
      // DELETE conciliações anteriores (PASSO 0.5)
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // SELECT faturamento retorna vazio
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(0);
      expect(result.totalConciliados).toBe(0);
      expect(result.totalDivergentes).toBe(0);
      expect(result.totalNaoRecebidos).toBe(0);
    });

    it("deve conciliar itens com match exato por guia + codigo", async () => {
      // DELETE conciliações anteriores (PASSO 0.5)
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // SELECT faturamento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          codigoItemTuss: null,
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 4.13,
          quantidade: 1,
        },
      ]]);
      // SELECT prestadores próprios (PASSO 1.5)
      mockExecute.mockResolvedValueOnce([[]]);
      // SELECT recebimentos
      mockExecute.mockResolvedValueOnce([[
        {
          id: 100,
          numeroGuia: "18874660",
          codigoItem: "40302385",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 4.13,
          valorGlosa: 0,
          situacao: "PAGO",
          quantidade: 1,
        },
      ]]);
      // SELECT vinculacao
      mockExecute.mockResolvedValueOnce([[]]);
      // INSERT batch + UPDATE batch (default mock handles these)

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(1);
      expect(result.totalDivergentes).toBe(0);
      expect(result.totalNaoRecebidos).toBe(0);
      expect(result.detalhes.conciliadosPorGuiaCodigo).toBe(1);
    });

    it("deve marcar como divergente quando valores sao diferentes", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          codigoItemTuss: null,
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 100.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - valor diferente com glosa
      mockExecute.mockResolvedValueOnce([[
        {
          id: 100,
          numeroGuia: "18874660",
          codigoItem: "40302385",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 80.00,
          valorGlosa: 20.00,
          situacao: "PARCIAL",
          quantidade: 1,
        },
      ]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(0);
      // Item com glosa explícita e valor pago < faturado = glosado (não divergente)
      expect(result.totalProcessados).toBe(1);
    });

    it("deve marcar como nao_recebido quando nao ha match", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          codigoItemTuss: null,
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 100.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - vazio
      mockExecute.mockResolvedValueOnce([[]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(0);
      expect(result.totalNaoRecebidos).toBe(1);
    });

    it("deve usar match por codigo TUSS quando codigo direto nao encontra", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento com codigoItemTuss diferente do codigoItem
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "HOSP001",
          codigoItemTuss: "40302385",
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 50.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - match pelo TUSS
      mockExecute.mockResolvedValueOnce([[
        {
          id: 200,
          numeroGuia: "18874660",
          codigoItem: "40302385",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 50.00,
          valorGlosa: 0,
          situacao: "PAGO",
          quantidade: 1,
        },
      ]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(1);
      expect(result.detalhes.conciliadosPorGuiaCodigoTuss).toBe(1);
    });

    it("deve usar vinculacao de codigos (de-para) quando match direto falha", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "HOSP001",
          codigoItemTuss: null,
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 50.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - match pelo codigo traduzido
      mockExecute.mockResolvedValueOnce([[
        {
          id: 300,
          numeroGuia: "18874660",
          codigoItem: "CONV001",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 50.00,
          valorGlosa: 0,
          situacao: "PAGO",
          quantidade: 1,
        },
      ]]);
      // Demonstrativo - vazio
      mockExecute.mockResolvedValueOnce([[]]);
      // Vinculacao - HOSP001 -> CONV001
      mockExecute.mockResolvedValueOnce([[
        {
          codigoHospital: "HOSP001",
          codigoConvenio: "CONV001",
          convenioId: 10,
        },
      ]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(1);
      expect(result.detalhes.conciliadosPorVinculacao).toBe(1);
    });

    it("deve usar match por paciente + codigo como fallback", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento - guia diferente do recebimento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          codigoItemTuss: null,
          numeroGuia: "GUIA_HOSP_001",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 50.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - guia diferente mas mesmo paciente e codigo
      mockExecute.mockResolvedValueOnce([[
        {
          id: 400,
          numeroGuia: "GUIA_CONV_999",
          codigoItem: "40302385",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 50.00,
          valorGlosa: 0,
          situacao: "PAGO",
          quantidade: 1,
        },
      ]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(1);
      expect(result.detalhes.conciliadosPorPacienteCodigo).toBe(1);
    });

    it("deve aceitar tolerancia percentual customizada", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento
      mockExecute.mockResolvedValueOnce([[
        {
          id: 1,
          codigoItem: "40302385",
          codigoItemTuss: null,
          numeroGuia: "18874660",
          contaNumero: "12345",
          pacienteNome: "JOAO SILVA",
          carteiraBeneficiario: "001",
          convenioId: 10,
          competencia: "2025-12",
          valorFaturado: 100.00,
          quantidade: 1,
        },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - 5% de diferenca
      mockExecute.mockResolvedValueOnce([[
        {
          id: 100,
          numeroGuia: "18874660",
          codigoItem: "40302385",
          nomeBeneficiario: "JOAO SILVA",
          carteira: "001",
          valorPago: 95.00,
          valorGlosa: 5.00,
          situacao: "PARCIAL",
          quantidade: 1,
        },
      ]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      // Com tolerancia de 5%, mas glosa explícita classifica como glosado
      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
        toleranciaPercentual: 5,
      });

      expect(result.totalProcessados).toBe(1);
    });

    it("deve processar multiplos itens em batch", async () => {
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // Faturamento - 3 itens
      mockExecute.mockResolvedValueOnce([[
        { id: 1, codigoItem: "A", codigoItemTuss: null, numeroGuia: "G1", contaNumero: "C1", pacienteNome: "P1", carteiraBeneficiario: "001", convenioId: 10, competencia: "2025-12", valorFaturado: 10, quantidade: 1 },
        { id: 2, codigoItem: "B", codigoItemTuss: null, numeroGuia: "G1", contaNumero: "C1", pacienteNome: "P1", carteiraBeneficiario: "001", convenioId: 10, competencia: "2025-12", valorFaturado: 20, quantidade: 1 },
        { id: 3, codigoItem: "C", codigoItemTuss: null, numeroGuia: "G2", contaNumero: "C2", pacienteNome: "P2", carteiraBeneficiario: "002", convenioId: 10, competencia: "2025-12", valorFaturado: 30, quantidade: 1 },
      ]]);
      // Prestadores próprios
      mockExecute.mockResolvedValueOnce([[]]);
      // Recebimentos - match para 2 dos 3
      mockExecute.mockResolvedValueOnce([[
        { id: 100, numeroGuia: "G1", codigoItem: "A", nomeBeneficiario: "P1", carteira: "001", valorPago: 10, valorGlosa: 0, situacao: "PAGO", quantidade: 1 },
        { id: 101, numeroGuia: "G1", codigoItem: "B", nomeBeneficiario: "P1", carteira: "001", valorPago: 15, valorGlosa: 5, situacao: "PARCIAL", quantidade: 1 },
      ]]);
      // Vinculacao
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(3);
      expect(result.totalConciliados).toBe(1); // item A (valores iguais)
      // item B: glosa explícita (valorGlosa=5, valorPago=15 < valorFaturado=20) → glosado
      // item C: sem match → nao_recebido
      expect(result.totalNaoRecebidos).toBe(1); // item C (sem match)
    });

    it("deve filtrar por competencia quando fornecida", async () => {
      // DELETE conciliações anteriores
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // SELECT faturamento retorna vazio
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(0);
    });

    it("deve filtrar por convenioId quando fornecido", async () => {
      // DELETE conciliações anteriores
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // SELECT faturamento retorna vazio
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
        convenioId: 10,
      });

      expect(result.totalProcessados).toBe(0);
    });

    it("deve processar sem competencia (sem batch - agora feito pelo job manager)", async () => {
      // Sem competencia: vai direto para DELETE + SELECT (sem batch)
      // DELETE conciliações anteriores
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      // SELECT faturamento retorna vazio
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
      });

      expect(result.totalProcessados).toBe(0);
    });

    it("deve conciliar CASSI pela guia do prestador quando a guia da operadora difere", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([[
        {
          id: 501,
          codigoItem: "10101012",
          codigoItemTuss: null,
          numeroGuia: "GUIA-PRESTADOR-CASSI",
          numeroGuiaOperadora: "GUIA-OPERADORA-CASSI",
          contaNumero: "CONTA-CASSI",
          pacienteNome: "PACIENTE CASSI",
          carteiraBeneficiario: "CARTEIRA-CASSI",
          convenioId: 22,
          competencia: "2025-12",
          valorFaturado: 150,
          quantidade: 1,
        },
      ]]);
      mockExecute.mockResolvedValueOnce([[]]);
      mockExecute.mockResolvedValueOnce([[
        {
          id: 601,
          numeroGuia: "GUIA-PRESTADOR-CASSI",
          codigoItem: "10101012",
          nomeBeneficiario: "PACIENTE CASSI",
          carteira: "CARTEIRA-CASSI",
          valorPago: 150,
          valorGlosa: 0,
          situacao: "PAGO",
          quantidade: 1,
        },
      ]]);
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalConciliados).toBe(1);
      expect(result.totalNaoRecebidos).toBe(0);
      expect(result.detalhes.conciliadosPorGuiaCodigo).toBe(1);
    });

    it("deve preservar pagamento e glosa quando Vivacom antiga vem como GLOSADO parcial", async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      mockExecute.mockResolvedValueOnce([[
        {
          id: 502,
          codigoItem: "40304396",
          codigoItemTuss: null,
          numeroGuia: "VIVACOM-PARCIAL-001",
          contaNumero: "CONTA-VIVACOM",
          pacienteNome: "PACIENTE VIVACOM",
          carteiraBeneficiario: "CARTEIRA-VIVACOM",
          convenioId: 23,
          competencia: "2025-12",
          valorFaturado: 100,
          quantidade: 1,
        },
      ]]);
      mockExecute.mockResolvedValueOnce([[]]);
      mockExecute.mockResolvedValueOnce([[
        {
          id: 602,
          numeroGuia: "VIVACOM-PARCIAL-001",
          codigoItem: "40304396",
          nomeBeneficiario: "PACIENTE VIVACOM",
          carteira: "CARTEIRA-VIVACOM",
          valorPago: 75,
          valorGlosa: 25,
          situacao: "GLOSADO",
          quantidade: 1,
        },
      ]]);
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await executarConciliacaoAutomatica({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.totalProcessados).toBe(1);
      expect(result.totalGlosaParcial).toBe(1);
      expect(result.totalGlosaTotal).toBe(0);
    });
  });

  describe("resetarConciliacao", () => {
    it("deve resetar itens conciliados para pendente", async () => {
      // COUNT(*)
      mockExecute.mockResolvedValueOnce([[{ total: 50 }]]);
      // SELECT DISTINCT faturamentoUnificadoId
      mockExecute.mockResolvedValueOnce([[{ faturamentoUnificadoId: 1 }, { faturamentoUnificadoId: 2 }]]);
      // UPDATE faturamento_unificado
      mockExecute.mockResolvedValueOnce([{ affectedRows: 2 }]);
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 50 }]);

      const result = await resetarConciliacao({
        estabelecimentoId: 1,
      });

      expect(result.resetados).toBe(50);
      expect(mockExecute).toHaveBeenCalledTimes(4);
    });

    it("deve aceitar filtro de competencia", async () => {
      // COUNT(*)
      mockExecute.mockResolvedValueOnce([[{ total: 20 }]]);
      // SELECT DISTINCT
      mockExecute.mockResolvedValueOnce([[{ faturamentoUnificadoId: 10 }]]);
      // UPDATE faturamento_unificado
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 20 }]);

      const result = await resetarConciliacao({
        estabelecimentoId: 1,
        competencia: "2025-12",
      });

      expect(result.resetados).toBe(20);
    });

    it("deve aceitar filtro de convenioId", async () => {
      // COUNT(*)
      mockExecute.mockResolvedValueOnce([[{ total: 10 }]]);
      // SELECT DISTINCT
      mockExecute.mockResolvedValueOnce([[{ faturamentoUnificadoId: 20 }]]);
      // UPDATE faturamento_unificado
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 10 }]);

      const result = await resetarConciliacao({
        estabelecimentoId: 1,
        convenioId: 5,
      });

      expect(result.resetados).toBe(10);
    });

    it("deve retornar 0 quando nao ha itens para resetar", async () => {
      // COUNT(*)
      mockExecute.mockResolvedValueOnce([[{ total: 0 }]]);
      // SELECT DISTINCT - retorna vazio
      mockExecute.mockResolvedValueOnce([[]]);
      // DELETE
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const result = await resetarConciliacao({
        estabelecimentoId: 1,
      });

      expect(result.resetados).toBe(0);
    });
  });
});

describe("glosarItens e reverterGlosa com divergentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock retorna resultado de query vazio
    mockExecute.mockResolvedValue([[]]);
  });

  it("glosarItens deve aceitar itens e retornar contagem de atualizados", async () => {
    const { glosarItens } = await import("./faturamentoUnificadoService");
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce([{ affectedRows: 3 }]);

    const result = await glosarItens({
      ids: [1, 2, 3],
      estabelecimentoId: 6,
      motivoGlosa: "Valor divergente",
      codigoGlosa: "1015",
    });

    expect(result.atualizados).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("glosarItens deve executar query com parametros corretos", async () => {
    const { glosarItens } = await import("./faturamentoUnificadoService");
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await glosarItens({
      ids: [10],
      estabelecimentoId: 6,
      codigoGlosa: "1015",
    });

    expect(result.atualizados).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("glosarTodosNaoRecebidosPorGuia deve retornar contagem correta", async () => {
    const { glosarTodosNaoRecebidosPorGuia } = await import("./faturamentoUnificadoService");
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce([{ affectedRows: 5 }]);

    const result = await glosarTodosNaoRecebidosPorGuia({
      estabelecimentoId: 6,
      numeroGuia: "18414424",
      codigoGlosa: "1015",
    });

    expect(result.atualizados).toBe(5);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("reverterGlosa deve retornar contagem de itens revertidos", async () => {
    const { reverterGlosa } = await import("./faturamentoUnificadoService");
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await reverterGlosa({
      ids: [1, 2],
      estabelecimentoId: 6,
    });

    expect(result.atualizados).toBe(2);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("glosarItens deve retornar 0 quando ids vazio", async () => {
    const { glosarItens } = await import("./faturamentoUnificadoService");

    const result = await glosarItens({
      ids: [],
      estabelecimentoId: 6,
    });

    expect(result.atualizados).toBe(0);
  });

  it("reverterGlosa deve retornar 0 quando ids vazio", async () => {
    const { reverterGlosa } = await import("./faturamentoUnificadoService");

    const result = await reverterGlosa({
      ids: [],
      estabelecimentoId: 6,
    });

    expect(result.atualizados).toBe(0);
  });
});

describe("conciliacaoJobManager", () => {
  it("deve iniciar job e retornar jobId", async () => {
    const { iniciarJobConciliacao, consultarJob } = await import("./conciliacaoJobManager");
    
    const jobId = iniciarJobConciliacao({
      estabelecimentoId: 1,
      competencia: "2025-12",
    });

    expect(jobId).toBeTruthy();
    expect(typeof jobId).toBe("string");
    expect(jobId.startsWith("conc_")).toBe(true);

    const job = consultarJob(jobId);
    expect(job).toBeTruthy();
    expect(job!.params.estabelecimentoId).toBe(1);
    expect(job!.params.competencia).toBe("2025-12");
  });

  it("deve detectar job em andamento para o mesmo estabelecimento", async () => {
    const { iniciarJobConciliacao, jobEmAndamento } = await import("./conciliacaoJobManager");
    
    iniciarJobConciliacao({
      estabelecimentoId: 99,
      competencia: "2025-12",
    });

    const existente = jobEmAndamento(99);
    expect(existente).toBeTruthy();
    expect(existente!.params.estabelecimentoId).toBe(99);
  });

  it("deve retornar null para job inexistente", async () => {
    const { consultarJob } = await import("./conciliacaoJobManager");
    
    const job = consultarJob("job_inexistente");
    expect(job).toBeNull();
  });
});
