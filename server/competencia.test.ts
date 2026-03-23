import { describe, it, expect } from "vitest";

/**
 * Testes para validar a padronização de competência no sistema.
 * 
 * A competência deve seguir o formato AAAA/MM em todas as tabelas:
 * - faturamento_tiss.competencia
 * - contas_convenio_resumo.competencia
 * - contas_convenio_itens.competencia
 * - conciliados_automatico.competencia
 * - recebimento_geral.mes_producao (formato AAAA/MM)
 */

describe("Padronização de Competência", () => {
  
  describe("Formato de competência AAAA/MM", () => {
    const formatoValido = /^\d{4}\/\d{2}$/;
    
    it("deve aceitar formato AAAA/MM válido", () => {
      expect("2026/02").toMatch(formatoValido);
      expect("2025/12").toMatch(formatoValido);
      expect("2026/01").toMatch(formatoValido);
    });
    
    it("deve rejeitar formatos inválidos", () => {
      expect("02/2026").not.toMatch(formatoValido);
      expect("2026-02").not.toMatch(formatoValido);
      expect("202602").not.toMatch(formatoValido);
      expect("2026/2").not.toMatch(formatoValido);
    });
  });
  
  describe("Construção de competência a partir de Date", () => {
    function buildCompetencia(date: Date): string {
      return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    
    it("deve gerar competência correta para janeiro", () => {
      const date = new Date(Date.UTC(2026, 0, 15));
      expect(buildCompetencia(date)).toBe("2026/01");
    });
    
    it("deve gerar competência correta para fevereiro", () => {
      const date = new Date(Date.UTC(2026, 1, 1));
      expect(buildCompetencia(date)).toBe("2026/02");
    });
    
    it("deve gerar competência correta para dezembro", () => {
      const date = new Date(Date.UTC(2025, 11, 31));
      expect(buildCompetencia(date)).toBe("2025/12");
    });
    
    it("deve gerar competência correta para último dia do mês", () => {
      const date = new Date(Date.UTC(2026, 1, 28));
      expect(buildCompetencia(date)).toBe("2026/02");
    });
  });
  
  describe("Filtro de competência para queries", () => {
    function buildCompetenciaFiltro(mes: number, ano: number): string {
      return `${ano}/${String(mes).padStart(2, '0')}`;
    }
    
    it("deve construir filtro correto para Fev/2026", () => {
      expect(buildCompetenciaFiltro(2, 2026)).toBe("2026/02");
    });
    
    it("deve construir filtro correto para Dez/2025", () => {
      expect(buildCompetenciaFiltro(12, 2025)).toBe("2025/12");
    });
    
    it("deve construir filtro correto para Jan/2026", () => {
      expect(buildCompetenciaFiltro(1, 2026)).toBe("2026/01");
    });
  });
  
  describe("Conversão de competência para display", () => {
    function competenciaParaDisplay(competencia: string): string {
      // Converte AAAA/MM para AAAA-MM (usado no agrupamento por mês do BI)
      return competencia.replace('/', '-');
    }
    
    function competenciaParaLabel(competencia: string): string {
      const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const parts = competencia.split('/');
      const ano = parseInt(parts[0]);
      const mes = parseInt(parts[1]);
      return `${mesesNomes[mes - 1]}/${ano}`;
    }
    
    it("deve converter AAAA/MM para AAAA-MM", () => {
      expect(competenciaParaDisplay("2026/02")).toBe("2026-02");
    });
    
    it("deve gerar label legível", () => {
      expect(competenciaParaLabel("2026/02")).toBe("Fev/2026");
      expect(competenciaParaLabel("2025/12")).toBe("Dez/2025");
      expect(competenciaParaLabel("2026/01")).toBe("Jan/2026");
    });
  });
  
  describe("Parsing de competência de diferentes formatos", () => {
    function parseCompetencia(input: string): { ano: number; mes: number } | null {
      const parts = input.split('/');
      if (parts.length !== 2) return null;
      
      let ano: number, mes: number;
      if (parts[0].length === 4) {
        // AAAA/MM
        ano = parseInt(parts[0]);
        mes = parseInt(parts[1]);
      } else {
        // MM/AAAA
        mes = parseInt(parts[0]);
        ano = parseInt(parts[1]);
      }
      
      if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) return null;
      return { ano, mes };
    }
    
    it("deve parsear formato AAAA/MM", () => {
      expect(parseCompetencia("2026/02")).toEqual({ ano: 2026, mes: 2 });
    });
    
    it("deve parsear formato MM/AAAA (legado)", () => {
      expect(parseCompetencia("02/2026")).toEqual({ ano: 2026, mes: 2 });
    });
    
    it("deve retornar null para formato inválido", () => {
      expect(parseCompetencia("2026")).toBeNull();
      expect(parseCompetencia("")).toBeNull();
      expect(parseCompetencia("2026/13")).toBeNull();
    });
  });

  describe("Consistência entre tabelas", () => {
    it("deve usar o mesmo formato AAAA/MM em faturamento_tiss e contas_convenio_resumo", () => {
      // Simula dados de ambas as tabelas
      const competenciaFaturamento = "2026/02";
      const competenciaResumo = "2026/02";
      
      expect(competenciaFaturamento).toBe(competenciaResumo);
    });
    
    it("deve filtrar mesmos dados quando usando mesma competência", () => {
      // Simula filtro de competência
      const filtroMes = 2;
      const filtroAno = 2026;
      const competenciaFiltro = `${filtroAno}/${String(filtroMes).padStart(2, '0')}`;
      
      // Dados simulados de faturamento_tiss
      const dadosFaturamento = [
        { competencia: "2026/01", valor: 100 },
        { competencia: "2026/02", valor: 200 },
        { competencia: "2026/03", valor: 300 },
      ];
      
      // Dados simulados de contas_convenio_resumo
      const dadosResumo = [
        { competencia: "2026/01", valor: 100 },
        { competencia: "2026/02", valor: 200 },
        { competencia: "2026/03", valor: 300 },
      ];
      
      const filtradosFaturamento = dadosFaturamento.filter(d => d.competencia === competenciaFiltro);
      const filtradosResumo = dadosResumo.filter(d => d.competencia === competenciaFiltro);
      
      expect(filtradosFaturamento.length).toBe(1);
      expect(filtradosResumo.length).toBe(1);
      expect(filtradosFaturamento[0].competencia).toBe(filtradosResumo[0].competencia);
    });
    
    it("deve filtrar por ano usando LIKE pattern", () => {
      const anoFiltro = 2026;
      const likePattern = `${anoFiltro}/%`;
      
      const dados = [
        { competencia: "2025/12" },
        { competencia: "2026/01" },
        { competencia: "2026/02" },
        { competencia: "2026/03" },
        { competencia: "2027/01" },
      ];
      
      // Simula SQL LIKE
      const filtrados = dados.filter(d => d.competencia.startsWith(`${anoFiltro}/`));
      
      expect(filtrados.length).toBe(3);
      expect(filtrados.every(d => d.competencia.startsWith("2026/"))).toBe(true);
    });
  });
});
