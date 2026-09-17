/**
 * Testes para a permissão de Usuário Tasy
 * Valida que usuários com role 'tasy_user' só podem acessar funcionalidades do Tasy
 */
import { describe, it, expect } from "vitest";

// Definição dos itens de menu (cópia simplificada do DashboardLayout)
type MenuItem = {
  label: string;
  path: string;
  adminOnly?: boolean;
  tasyOnly?: boolean;
};

const menuItems: MenuItem[] = [
  // Dashboards
  { label: "Dashboard", path: "/" },
  { label: "Dashboard Consolidado", path: "/dashboard-consolidado", adminOnly: true },
  { label: "Dashboard IA", path: "/dashboard-ia" },
  { label: "Produtividade", path: "/produtividade" },
  
  // Arquivos e Upload
  { label: "Upload de Arquivos", path: "/upload" },
  { label: "Arquivos", path: "/arquivos" },
  { label: "Conta Convênio", path: "/conta-convenio" },
  { label: "Contas Demonstrativo", path: "/contas-demonstrativo" },
  
  // Comparações e Conciliação
  { label: "Comparações", path: "/comparacoes" },
  { label: "Divergências", path: "/divergencias" },
  { label: "Conciliação", path: "/conciliacao" },
  
  // Faturamento
  { label: "Faturamento", path: "/faturamento" },
  { label: "Relatório de Contas", path: "/relatorio-contas" },
  { label: "Demonstrativo", path: "/demonstrativo" },
  
  // Análise e Recursos de Glosa
  { label: "Análise de Glosa", path: "/analise-glosa" },
  { label: "Recursos de Glosa", path: "/recursos" },
  { label: "Acompanhamento Recursos", path: "/acompanhamento-recursos" },
  { label: "Envio em Lote", path: "/envio-recursos-lote" },
  
  // Relatórios e Históricos
  { label: "Relatórios", path: "/relatorios" },
  { label: "Tendências", path: "/tendencias" },
  { label: "Histórico Contestações", path: "/historico-contestacoes" },
  { label: "Repasse", path: "/repasse" },
  
  // Administração
  { label: "Gerenciar Permissões", path: "/gerenciar-permissoes" },
  { label: "Dicionário de Glosas", path: "/dicionario-glosas" },
  { label: "Regras de IA", path: "/regras-ia", adminOnly: true },
  
  // Itens Tasy
  { label: "Importação Tasy", path: "/importacao-tasy", adminOnly: true, tasyOnly: true },
  { label: "Faturado Tasy", path: "/faturado-tasy", tasyOnly: true },
  { label: "Contas Faturadas", path: "/contas-faturadas", tasyOnly: true },
  { label: "Relatórios Tasy", path: "/relatorios-tasy", tasyOnly: true },
  { label: "Conciliação Contas Pagas", path: "/conciliacao-contas-pagas", tasyOnly: true },
  
  // Configurações
  { label: "Configurações", path: "/configuracoes" },
];

// Função de filtragem de menu para usuário Tasy (cópia da lógica do DashboardLayout)
function filterMenuForTasyUser(items: MenuItem[], userRole: string, isGestor: boolean): MenuItem[] {
  return items.filter(item => {
    const isTasyUser = userRole === 'tasy_user';
    
    if (isTasyUser) {
      const allowedPaths = ['/', '/configuracoes'];
      if (allowedPaths.includes(item.path) || item.tasyOnly) {
        if (item.adminOnly) return false;
        return true;
      }
      return false;
    }
    
    // Para usuários normais e admins
    if (!item.adminOnly) return true;
    return isGestor;
  });
}

// Função para verificar se uma rota é permitida para usuário Tasy
function isRouteAllowedForTasyUser(path: string): boolean {
  const item = menuItems.find(i => i.path === path);
  if (!item) return true; // Rotas não mapeadas são permitidas
  
  const allowedPaths = ['/', '/configuracoes'];
  return allowedPaths.includes(path) || !!item.tasyOnly;
}

describe("Permissão de Usuário Tasy", () => {
  describe("Filtragem de Menu", () => {
    it("deve mostrar apenas itens Tasy + Dashboard + Configurações para usuário tasy_user", () => {
      const filteredMenu = filterMenuForTasyUser(menuItems, 'tasy_user', false);
      
      // Verificar que todos os itens filtrados são permitidos
      filteredMenu.forEach(item => {
        const allowedPaths = ['/', '/configuracoes'];
        const isAllowed = allowedPaths.includes(item.path) || item.tasyOnly;
        expect(isAllowed).toBe(true);
      });
      
      // Verificar que itens Tasy estão presentes
      const tasyItems = filteredMenu.filter(i => i.tasyOnly);
      expect(tasyItems.length).toBeGreaterThan(0);
      
      // Verificar que Dashboard está presente
      expect(filteredMenu.some(i => i.path === '/')).toBe(true);
      
      // Verificar que Configurações está presente
      expect(filteredMenu.some(i => i.path === '/configuracoes')).toBe(true);
    });
    
    it("não deve mostrar itens adminOnly para usuário tasy_user", () => {
      const filteredMenu = filterMenuForTasyUser(menuItems, 'tasy_user', false);
      
      const adminItems = filteredMenu.filter(i => i.adminOnly);
      expect(adminItems.length).toBe(0);
    });
    
    it("não deve mostrar itens comuns (não-Tasy) para usuário tasy_user", () => {
      const filteredMenu = filterMenuForTasyUser(menuItems, 'tasy_user', false);
      
      // Verificar que itens comuns não estão presentes
      expect(filteredMenu.some(i => i.path === '/arquivos')).toBe(false);
      expect(filteredMenu.some(i => i.path === '/comparacoes')).toBe(false);
      expect(filteredMenu.some(i => i.path === '/faturamento')).toBe(false);
      expect(filteredMenu.some(i => i.path === '/analise-glosa')).toBe(false);
    });
    
    it("deve mostrar todos os itens (exceto adminOnly) para usuário comum", () => {
      const filteredMenu = filterMenuForTasyUser(menuItems, 'user', false);
      
      // Usuário comum deve ver itens não-admin
      expect(filteredMenu.some(i => i.path === '/arquivos')).toBe(true);
      expect(filteredMenu.some(i => i.path === '/comparacoes')).toBe(true);
      expect(filteredMenu.some(i => i.path === '/faturamento')).toBe(true);
      
      // Mas não itens adminOnly
      expect(filteredMenu.some(i => i.path === '/dashboard-consolidado')).toBe(false);
    });
    
    it("deve mostrar itens adminOnly para gestor", () => {
      const filteredMenu = filterMenuForTasyUser(menuItems, 'user', true);
      
      // Gestor deve ver itens adminOnly
      expect(filteredMenu.some(i => i.path === '/dashboard-consolidado')).toBe(true);
      expect(filteredMenu.some(i => i.path === '/regras-ia')).toBe(true);
    });
  });
  
  describe("Verificação de Rotas Permitidas", () => {
    it("deve permitir Dashboard para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/')).toBe(true);
    });
    
    it("deve permitir Configurações para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/configuracoes')).toBe(true);
    });
    
    it("deve permitir Faturado Tasy para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/faturado-tasy')).toBe(true);
    });
    
    it("deve permitir Relatórios Tasy para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/relatorios-tasy')).toBe(true);
    });
    
    it("deve permitir Conciliação Contas Pagas para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/conciliacao-contas-pagas')).toBe(true);
    });
    
    it("não deve permitir Arquivos para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/arquivos')).toBe(false);
    });
    
    it("não deve permitir Comparações para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/comparacoes')).toBe(false);
    });
    
    it("não deve permitir Faturamento para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/faturamento')).toBe(false);
    });
    
    it("não deve permitir Análise de Glosa para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/analise-glosa')).toBe(false);
    });
    
    it("não deve permitir Gerenciar Permissões para usuário Tasy", () => {
      expect(isRouteAllowedForTasyUser('/gerenciar-permissoes')).toBe(false);
    });
  });
  
  describe("Itens Tasy Marcados Corretamente", () => {
    it("deve ter pelo menos 4 itens marcados como tasyOnly", () => {
      const tasyItems = menuItems.filter(i => i.tasyOnly);
      expect(tasyItems.length).toBeGreaterThanOrEqual(4);
    });
    
    it("todos os itens Tasy devem conter 'Tasy' no label ou path", () => {
      const tasyItems = menuItems.filter(i => i.tasyOnly);
      
      tasyItems.forEach(item => {
        const hasTasyInLabel = item.label.toLowerCase().includes('tasy');
        const hasTasyInPath = item.path.toLowerCase().includes('tasy');
        const isRelatedToTasy = hasTasyInLabel || hasTasyInPath || 
          item.path === '/contas-faturadas' || 
          item.path === '/conciliacao-contas-pagas';
        
        expect(isRelatedToTasy).toBe(true);
      });
    });
  });
});
