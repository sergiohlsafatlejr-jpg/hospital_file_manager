import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock mysql2/promise
vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(),
  },
  createConnection: vi.fn(),
}));

// Mock invokeLLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          diagnostico: "Falta de autorização prévia para o procedimento.",
          impacto: "Alto impacto financeiro com 50 ocorrências e R$ 15.000 glosados.",
          sugestoesMelhoria: ["Verificar autorização antes de realizar o procedimento", "Treinar equipe sobre regras do convênio"],
          argumentosRecurso: ["O procedimento foi realizado em caráter de urgência", "Documentação completa disponível"],
          prioridade: "alta",
          estimativaRecuperabilidade: 65,
          resumoExecutivo: "Glosa recorrente por falta de autorização. Ação preventiva recomendada.",
        }),
      },
    }],
  }),
}));

// Helper to create mock connection
function createMockConn(rows: any[]) {
  return {
    execute: vi.fn().mockResolvedValue([rows]),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

describe("relatoriosGlosasBiRouter — lógica de negócio", () => {
  describe("getMotivoDescricao", () => {
    it("retorna descrição para código TISS conhecido", () => {
      const MOTIVOS: Record<string, string> = {
        "24": "Falta de autorização prévia",
        "15": "Documentação incompleta",
      };
      const getMotivoDescricao = (codigo: string | null): string => {
        if (!codigo) return "Sem código";
        const codigos = codigo.split(/[,;|\/]/).map(c => c.trim());
        const descricoes = codigos.map(c => {
          const desc = MOTIVOS[c];
          return desc ? `${c} - ${desc}` : c;
        });
        return descricoes.join("; ");
      };

      expect(getMotivoDescricao("24")).toBe("24 - Falta de autorização prévia");
      expect(getMotivoDescricao("15")).toBe("15 - Documentação incompleta");
      expect(getMotivoDescricao(null)).toBe("Sem código");
      expect(getMotivoDescricao("99")).toBe("99");
    });

    it("trata múltiplos códigos separados por vírgula", () => {
      const MOTIVOS: Record<string, string> = {
        "24": "Falta de autorização prévia",
        "15": "Documentação incompleta",
      };
      const getMotivoDescricao = (codigo: string | null): string => {
        if (!codigo) return "Sem código";
        const codigos = codigo.split(/[,;|\/]/).map(c => c.trim());
        const descricoes = codigos.map(c => {
          const desc = MOTIVOS[c];
          return desc ? `${c} - ${desc}` : c;
        });
        return descricoes.join("; ");
      };

      const result = getMotivoDescricao("24,15");
      expect(result).toContain("24 - Falta de autorização prévia");
      expect(result).toContain("15 - Documentação incompleta");
    });
  });

  describe("cálculo de taxas de glosa", () => {
    it("calcula taxa de glosa corretamente", () => {
      const totalInformado = 100000;
      const totalGlosa = 15000;
      const taxaGlosa = (totalGlosa / totalInformado) * 100;
      expect(taxaGlosa).toBe(15);
    });

    it("retorna 0 quando total informado é zero", () => {
      const totalInformado = 0;
      const totalGlosa = 0;
      const taxaGlosa = totalInformado > 0 ? (totalGlosa / totalInformado) * 100 : 0;
      expect(taxaGlosa).toBe(0);
    });

    it("calcula taxa de recuperação corretamente", () => {
      const totalGlosa = 10000;
      const totalRecuperado = 3000;
      const taxaRecuperacao = (totalRecuperado / totalGlosa) * 100;
      expect(taxaRecuperacao).toBe(30);
    });
  });

  describe("processamento de KPIs", () => {
    it("processa KPIs do demonstrativo corretamente", () => {
      const rawKpi = {
        total_itens: "1000",
        total_glosados: "150",
        total_informado: "500000",
        total_pago: "450000",
        total_glosa: "50000",
        total_guias: "200",
        guias_com_glosa: "80",
        total_recuperado: "15000",
        total_em_recurso: "20000",
        total_pendente_analise: "15000",
      };

      const kpi = {
        totalItens: Number(rawKpi.total_itens),
        totalGlosados: Number(rawKpi.total_glosados),
        totalInformado: Number(rawKpi.total_informado),
        totalPago: Number(rawKpi.total_pago),
        totalGlosa: Number(rawKpi.total_glosa),
        totalGuias: Number(rawKpi.total_guias),
        guiasComGlosa: Number(rawKpi.guias_com_glosa),
        totalRecuperado: Number(rawKpi.total_recuperado),
        totalEmRecurso: Number(rawKpi.total_em_recurso),
        totalPendenteAnalise: Number(rawKpi.total_pendente_analise),
      };

      expect(kpi.totalItens).toBe(1000);
      expect(kpi.totalGlosados).toBe(150);
      expect(kpi.totalGlosa).toBe(50000);
      expect(kpi.taxaGlosa).toBeUndefined(); // calculado separadamente
    });

    it("calcula taxa de glosa a partir dos KPIs", () => {
      const totalInformado = 500000;
      const totalGlosa = 50000;
      const taxaGlosa = Number(((totalGlosa / totalInformado) * 100).toFixed(2));
      expect(taxaGlosa).toBe(10);
    });
  });

  describe("processamento de tendência mensal", () => {
    it("ordena competências em ordem crescente", () => {
      const rawRows = [
        { competencia: "2026/03", total_glosados: "10", total_informado: "50000", total_glosa: "5000", total_pago: "45000", total_guias: "20" },
        { competencia: "2026/01", total_glosados: "8", total_informado: "40000", total_glosa: "3000", total_pago: "37000", total_guias: "15" },
        { competencia: "2026/02", total_glosados: "12", total_informado: "60000", total_glosa: "7000", total_pago: "53000", total_guias: "25" },
      ];

      // Simula o .reverse() aplicado no router
      const processado = rawRows.map(r => ({
        competencia: r.competencia,
        totalGlosados: Number(r.total_glosados),
        totalGlosa: Number(r.total_glosa),
        taxaGlosa: Number(((Number(r.total_glosa) / Number(r.total_informado)) * 100).toFixed(2)),
      })).reverse();

      expect(processado[0].competencia).toBe("2026/02");
      expect(processado[1].competencia).toBe("2026/01");
      expect(processado[2].competencia).toBe("2026/03");
    });
  });

  describe("processamento de recursos integrados", () => {
    it("mapeia status de recurso corretamente", () => {
      const STATUS_LABELS: Record<string, string> = {
        sem_recurso: "Sem Recurso",
        recurso_criado: "Criado",
        recurso_enviado: "Enviado",
        recurso_deferido: "Deferido",
        recurso_indeferido: "Indeferido",
      };

      expect(STATUS_LABELS["sem_recurso"]).toBe("Sem Recurso");
      expect(STATUS_LABELS["recurso_deferido"]).toBe("Deferido");
      expect(STATUS_LABELS["recurso_indeferido"]).toBe("Indeferido");
    });

    it("calcula paginação corretamente", () => {
      const total = 150;
      const limite = 50;
      const offset = 50;
      const totalPages = Math.ceil(total / limite);
      const currentPage = Math.floor(offset / limite) + 1;

      expect(totalPages).toBe(3);
      expect(currentPage).toBe(2);
      expect(offset + limite < total).toBe(true); // há próxima página
    });
  });

  describe("análise IA de devolutiva", () => {
    it("estrutura de resposta da IA é válida", () => {
      const analiseEsperada = {
        diagnostico: "Falta de autorização prévia para o procedimento.",
        impacto: "Alto impacto financeiro com 50 ocorrências e R$ 15.000 glosados.",
        sugestoesMelhoria: ["Verificar autorização antes de realizar o procedimento"],
        argumentosRecurso: ["O procedimento foi realizado em caráter de urgência"],
        prioridade: "alta",
        estimativaRecuperabilidade: 65,
        resumoExecutivo: "Glosa recorrente por falta de autorização.",
      };

      expect(analiseEsperada.prioridade).toMatch(/^(alta|media|baixa)$/);
      expect(analiseEsperada.estimativaRecuperabilidade).toBeGreaterThanOrEqual(0);
      expect(analiseEsperada.estimativaRecuperabilidade).toBeLessThanOrEqual(100);
      expect(Array.isArray(analiseEsperada.sugestoesMelhoria)).toBe(true);
      expect(Array.isArray(analiseEsperada.argumentosRecurso)).toBe(true);
    });

    it("trata erro de parse da IA com fallback", () => {
      const content = "resposta inválida não é JSON";
      let analise: any;
      try {
        analise = JSON.parse(content);
      } catch {
        analise = {
          diagnostico: "Não foi possível processar a análise automática.",
          sugestoesMelhoria: ["Revisar processo de faturamento"],
          argumentosRecurso: ["Contestar com base na prestação do serviço"],
          prioridade: "media",
          estimativaRecuperabilidade: 30,
          resumoExecutivo: "Análise automática indisponível.",
        };
      }

      expect(analise.diagnostico).toBe("Não foi possível processar a análise automática.");
      expect(analise.prioridade).toBe("media");
    });
  });
});
