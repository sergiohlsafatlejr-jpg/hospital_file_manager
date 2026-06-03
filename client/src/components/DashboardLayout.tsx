import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEstabelecimento, Estabelecimento, TODOS_ESTABELECIMENTOS } from "@/contexts/EstabelecimentoContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, 
  LogOut, 
  PanelLeft, 
  Upload, 
  FileSearch, 
  GitCompare, 
  Settings,
  FileText,
  List,
  Scale,
  BarChart3,
  PieChart,
  Gavel,
  TrendingUp,
  FileSpreadsheet,
  Receipt,
  BookOpen,
  History,
  Building2,
  Sliders,
  DollarSign,
  Settings2,
  LayoutGrid,
  Shield,
  Activity,
  Lock,
  KeyRound,
  Brain,
  Clock,
  Database,
  ArrowLeftRight,
  FileCode2,
  Users,
  Megaphone,
  Home,
  Wrench,
  Moon,
  Sun,
  AlertCircle,
  ChevronRight,
  Link2,
  FolderUp,
  ClipboardList,
  Inbox,
  Search,
  Send,
  Eye,
  Gauge,
  Package,
  ClipboardCheck,
  FileCheck,
  FlaskConical,
  Stethoscope,
  CalendarClock,
  Microscope,
  AlertTriangle,
  Bed,
  Bot,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { MotorRegrasNotificationBell } from "./MotorRegrasNotificationBell";
import { SettingsMenu } from "./SettingsMenu";

import type { ModuloPermissao } from "@/contexts/EstabelecimentoContext";
import { SAFATLE_ESTABELECIMENTO_ID } from "@shared/const";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  modulo?: ModuloPermissao;
  adminOnly?: boolean;
  estabelecimentoIds?: number[]; // Se definido, item só aparece para estes estabelecimentos
  children?: MenuItem[]; // Sub-itens para menus expansíveis
};

const menuItems: MenuItem[] = [
  // Início
  { icon: Home, label: "Início", path: "/" },

  // Módulo 7 - Gerenciamento
  { icon: Gauge, label: "Gerenciamento", path: "/dashboard", modulo: "dashboard", children: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", modulo: "dashboard" },
    { icon: LayoutGrid, label: "Dashboard Consolidado", path: "/dashboard-consolidado", adminOnly: true },
    { icon: Brain, label: "Dashboard IA", path: "/dashboard-ia", modulo: "comparacoes" },
    { icon: Activity, label: "Produtividade", path: "/produtividade", modulo: "produtividade" },
    { icon: TrendingUp, label: "Tendências", path: "/tendencias", modulo: "analiseGlosa" },
    { icon: FileText, label: "Relatórios", path: "/relatorios", modulo: "faturamento" },
    { icon: ClipboardCheck, label: "Dashboard Auditoria", path: "/dashboard-auditoria", modulo: "dashboard" },
    { icon: FileCheck, label: "Conferência Pós-Correção", path: "/conferencia-correcao", modulo: "dashboard" },
  ]},

  // Módulo 1 - Upload Contas
  { icon: FolderUp, label: "Upload Contas", path: "/upload", modulo: "arquivos", children: [
    { icon: Upload, label: "Upload de Arquivos", path: "/upload", modulo: "arquivos" },
    { icon: FileSearch, label: "Arquivos", path: "/arquivos", modulo: "arquivos" },
    { icon: List, label: "Conta Convênio", path: "/conta-convenio", modulo: "arquivos" },
  ]},

  // Módulo 2 - Regras de Contas
  { icon: ClipboardList, label: "Regras de Contas", path: "/comparacoes", modulo: "comparacoes", children: [
    { icon: GitCompare, label: "Comparativos", path: "/comparacoes", modulo: "comparacoes" },
    { icon: Activity, label: "Motor de Regras", path: "/motor-regras", modulo: "relatoriosBi" },
    { icon: Wrench, label: "Regras de Negócio", path: "/regras-negocio", modulo: "regrasNegocio" },
    { icon: BarChart3, label: "Padrões de Cobrança", path: "/padroes-cobranca", modulo: "comparacoes" },
    { icon: BookOpen, label: "Tabelas de Porte", path: "/tabelas-porte", modulo: "comparacoes" },
  ]},

  // Módulo 3 - Recebimentos
  { icon: Inbox, label: "Recebimentos", path: "/recebimentos-xml", modulo: "recebimentosXml", children: [
    { icon: FileCode2, label: "Upload XML", path: "/recebimentos-xml", modulo: "recebimentosXml" },
    { icon: FileSpreadsheet, label: "Upload Excel", path: "/recebimentos-excel", modulo: "recebimentosExcel" },
    { icon: FileText, label: "Demonstrativo", path: "/demonstrativo", modulo: "demonstrativo" },
    { icon: FileText, label: "Importar PDF Saúde Caixa", path: "/recebimentos-pdf-saude-caixa", modulo: "recebimentosExcel" },
    { icon: Receipt, label: "Repasse", path: "/repasse", modulo: "faturamento" },
  ]},

  // Módulo 4 - Recurso de Glosa
  { icon: Gavel, label: "Recurso de Glosa", path: "/analise-glosa", modulo: "analiseGlosa", children: [
    { icon: Search, label: "Análise de Glosa", path: "/analise-glosa", modulo: "analiseGlosa" },
    { icon: Eye, label: "Recursos Analisados", path: "/recursos", modulo: "recursosGlosa" },
    { icon: Send, label: "Envio de Lote", path: "/envio-recursos-lote", modulo: "recursosGlosa" },
    { icon: History, label: "Acompanhamento Recursos", path: "/acompanhamento-recursos", modulo: "recursosGlosa" },
  ]},

// Módulo 5 - Relatórios BI (com subpastas)
  { icon: PieChart, label: "Relatórios BI", path: "/relatorios-bi", modulo: "relatoriosBi", children: [
    // Subpasta: Faturamento
    { icon: Receipt, label: "Faturamento", path: "/relatorios-bi", modulo: "relatoriosBi", children: [
      { icon: BarChart3, label: "Faturado x Recebido x Glosado", path: "/relatorios-bi", modulo: "relFaturadoRecebido" },
      { icon: Receipt, label: "Recebimento Geral", path: "/relatorio-recebimento-geral", modulo: "relRecebimentoGeral" },
      { icon: FileText, label: "Rel. Faturamento", path: "/relatorio-faturamento", modulo: "relFaturamento" },
      { icon: Clock, label: "Não Recebidos", path: "/nao-recebidos", modulo: "relNaoRecebidos" },
      { icon: TrendingUp, label: "Previsão de Glosa", path: "/previsao-glosa", modulo: "relPrevisaoGlosa" },
      { icon: FileSpreadsheet, label: "Faturamento Externo", path: "/faturamento-externo", modulo: "faturamentoExterno" },
      { icon: BarChart3, label: "BI Financeiro (TASY)", path: "/bi-financeiro-tasy", modulo: "relFaturadoRecebido" },
      { icon: Receipt, label: "Protocolos TASY", path: "/relatorio-protocolos", modulo: "relFaturadoRecebido" },
      { icon: CalendarClock, label: "Previsão Recebimentos", path: "/previsao-recebimentos", modulo: "relFaturadoRecebido" },
      { icon: FileSearch, label: "Faturado x Recebido (TASY)", path: "/analise-faturamento-itens", modulo: "relFaturadoRecebido" },
      { icon: BarChart3, label: "Fluxo de Caixa (BI)", path: "/fluxo-caixa-bi", modulo: "relFaturadoRecebido" },
      { icon: FlaskConical, label: "Rel. Laboratório", path: "/relatorio-laboratorio", modulo: "relFaturadoRecebido" },
      { icon: Activity, label: "Rel. Ultrassom", path: "/relatorio-ultrassom", modulo: "relFaturadoRecebido" },
      { icon: Stethoscope, label: "Rel. Visita Hospitalar", path: "/relatorio-visita", modulo: "relFaturadoRecebido" },
      { icon: Stethoscope, label: "Visitas Faturadas (XML)", path: "/relatorio-visita-xml", modulo: "relFaturadoRecebido" },
      { icon: Bed, label: "Rel. Ox UTI", path: "/relatorio-ox-uti", modulo: "relFaturadoRecebido" },
      { icon: Bed, label: "Ox UTI - Faturado (XML)", path: "/relatorio-ox-uti-faturado", modulo: "relFaturadoRecebido" },
    ]},
    // Subpasta: Glosas BI
    { icon: AlertTriangle, label: "Glosas", path: "/relatorios-glosas-bi", modulo: "relatoriosBi", children: [
      { icon: AlertTriangle, label: "Relatório BI de Glosas", path: "/relatorios-glosas-bi", modulo: "relatoriosBi" },
    ]},
    // Subpasta: Recepção
    { icon: Users, label: "Recepção", path: "/relatorio-atendimentos", modulo: "relatoriosBi", children: [
      { icon: Users, label: "Rel. Atendimentos", path: "/relatorio-atendimentos", modulo: "relAtendimentos" },
    ]},
    // Subpasta: Compras
    { icon: Package, label: "Compras", path: "/relatorio-custos", modulo: "relatoriosBi", children: [
      { icon: DollarSign, label: "Rel. Custos", path: "/relatorio-custos", modulo: "relCustos" },
    ]},
  ]},

  // Módulo 5b - Atendimentos
  { icon: Users, label: "Atendimentos", path: "/atendimentos-unificados", modulo: "atendimentos", children: [
    { icon: LayoutGrid, label: "Visão Unificada", path: "/atendimentos-unificados", modulo: "atendimentos" },
    { icon: Users, label: "Atendimentos (Legado)", path: "/atendimentos", modulo: "atendimentos" },
    { icon: FileText, label: "Atendimentos a Faturar", path: "/atendimentos-faturar", modulo: "atendimentosFaturar" },
    { icon: Shield, label: "Atendimentos com Protocolo", path: "/atendimentos-com-protocolo", modulo: "atendimentos" },
  ]},

  // Módulo 6 - Conciliações
  { icon: Scale, label: "Conciliações", path: "/conciliacao-cruzada", modulo: "conciliacaoContasPagas", children: [
    { icon: Link2, label: "Conciliação Cruzada", path: "/conciliacao-cruzada", modulo: "conciliacaoContasPagas" },
    { icon: Brain, label: "Vinculação Inteligente", path: "/vinculacao-inteligente", modulo: "conciliacaoContasPagas" },
  ]},

  // Módulo 8 - NFS-e (disponível para TODOS os estabelecimentos)
  { icon: Receipt, label: "NFS-e", path: "/nfse", modulo: "faturamento" },

  // ===== MÓDULOS SAFATLE (admin only, só quando Safatle está selecionado) =====
  { icon: LayoutGrid, label: "Painel Executivo", path: "/painel-executivo", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  { icon: DollarSign, label: "Financeiro", path: "/financeiro", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  { icon: FileText, label: "Contratos", path: "/contratos", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  { icon: Building2, label: "Contratos Hosp x Convênio", path: "/contratos-convenios" },
  { icon: FileSpreadsheet, label: "Propostas", path: "/propostas", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  { icon: Shield, label: "Permissões Safatle", path: "/permissoes-safatle", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  { icon: Shield, label: "Logs do Sistema", path: "/auditoria-sistema", adminOnly: true },
  // Módulo RPA
  { icon: Bot, label: "Automação RPA", path: "/rpa-manager", adminOnly: true, children: [
    { icon: Bot, label: "Gerenciar Robôs", path: "/rpa-manager", adminOnly: true },
  ]},
  // Módulo RH
  { icon: Users, label: "Recursos Humanos", path: "/rh/folha-pagamento", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID], children: [
    { icon: Users, label: "Colaboradores", path: "/rh/colaboradores", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
    { icon: FileSpreadsheet, label: "Plano de Salários", path: "/rh/plano-salarios", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
    { icon: Upload, label: "Importar Folha", path: "/rh/upload", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
    { icon: FileSpreadsheet, label: "Folha de Pagamento", path: "/rh/folha-pagamento", adminOnly: true, estabelecimentoIds: [SAFATLE_ESTABELECIMENTO_ID] },
  ]},

];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

// Componente para verificar acesso e mostrar mensagem amigável
function AccessGuard({ 
  children, 
  location, 
  isGestor, 
  temAcessoModulo,
  userRole,
  estabelecimentoId 
}: { 
  children: React.ReactNode; 
  location: string;
  isGestor: boolean;
  temAcessoModulo: (modulo: ModuloPermissao) => boolean;
  userRole?: string;
  estabelecimentoId?: number;
}) {
  // Encontrar o item de menu correspondente à rota atual (incluindo children)
  const currentMenuItem = menuItems.find(item => item.path === location) 
    || menuItems.flatMap(item => item.children || []).find(child => child.path === location);
  
  // Verificar restrição por estabelecimento
  if (currentMenuItem?.estabelecimentoIds && estabelecimentoId) {
    if (!currentMenuItem.estabelecimentoIds.includes(estabelecimentoId)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 max-w-md">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Funcionalidade não disponível</h2>
            <p className="text-slate-600">Esta funcionalidade não está disponível para o estabelecimento selecionado.</p>
          </div>
        </div>
      );
    }
  }
  

  
  // Se não encontrou o item ou não tem módulo definido, permite acesso
  if (!currentMenuItem || (!currentMenuItem.modulo && !currentMenuItem.adminOnly)) {
    return <>{children}</>;
  }
  
  // Verificar se é rota adminOnly
  if (currentMenuItem.adminOnly && !isGestor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-md">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-semibold text-amber-800 mb-2">
            Acesso Restrito
          </h2>
          <p className="text-amber-700 mb-4">
            Esta área é exclusiva para gestores e administradores do sistema.
          </p>
          <p className="text-sm text-amber-600">
            Se você acredita que deveria ter acesso a esta funcionalidade, 
            entre em contato com o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }
  
  // Verificar permissão do módulo
  if (currentMenuItem.modulo && !temAcessoModulo(currentMenuItem.modulo)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 max-w-md">
          <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Acesso Não Autorizado
          </h2>
          <p className="text-slate-600 mb-4">
            Você não tem permissão para acessar o módulo <strong>{currentMenuItem.label}</strong>.
          </p>
          <p className="text-sm text-slate-500">
            Suas permissões são definidas pelo grupo de serviço atribuído a você. 
            Caso precise de acesso, solicite ao gestor do seu estabelecimento.
          </p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full bg-white rounded-2xl shadow-xl">
          <div className="flex flex-col items-center gap-6">
            <img 
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" 
              alt="Safatle Logo" 
              className="w-20 h-20 object-contain"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-center text-slate-900">
              Safatle Gerenciamento
            </h1>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              Sistema de gerenciamento e comparação de arquivos de convênios médicos. Faça login para continuar.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function ThemeToggleMenuItem() {
  const { theme, toggleTheme } = useTheme();
  
  if (!toggleTheme) return null;
  
  return (
    <DropdownMenuItem
      onClick={toggleTheme}
      className="cursor-pointer"
    >
      {theme === 'light' ? (
        <>
          <Moon className="mr-2 h-4 w-4" />
          <span>Modo Escuro</span>
        </>
      ) : (
        <>
          <Sun className="mr-2 h-4 w-4" />
          <span>Modo Claro</span>
        </>
      )}
    </DropdownMenuItem>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const { estabelecimentos, estabelecimentoAtual, setEstabelecimentoAtual, isGestor, temAcessoModulo } = useEstabelecimento();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0 bg-sidebar"
          disableTransition={isResizing}
        >
          <SidebarHeader className="border-b border-sidebar-border">
            {/* Logo da Safatle */}
            <div className="flex items-center justify-center py-3 border-b border-sidebar-border/50">
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" 
                alt="Safatle" 
                className={`object-contain transition-all ${isCollapsed ? "w-8 h-8" : "w-12 h-12"}`}
              />
              {!isCollapsed && (
                <span className="ml-2 font-bold text-sidebar-foreground text-sm">Safatle</span>
              )}
            </div>
            {/* Seletor de estabelecimento */}
            <div className="flex items-center gap-3 px-2 py-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 min-w-0 hover:bg-sidebar-accent rounded-lg px-2 py-1 transition-colors">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold tracking-tight truncate text-sidebar-foreground text-sm">
                        {estabelecimentoAtual?.nome || "Selecionar"}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Estabelecimentos</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setEstabelecimentoAtual(TODOS_ESTABELECIMENTOS)}
                      className={`cursor-pointer ${estabelecimentoAtual?.id === 0 ? "bg-primary/10 text-primary" : ""}`}
                    >
                      <Building2 className="mr-2 h-4 w-4" />
                      <span className="truncate font-semibold">Todos os Estabelecimentos</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {estabelecimentos.map((est: Estabelecimento) => (
                      <DropdownMenuItem
                        key={est.id}
                        onClick={() => setEstabelecimentoAtual(est)}
                        className={`cursor-pointer ${estabelecimentoAtual?.id === est.id ? "bg-primary/10 text-primary" : ""}`}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        <span className="truncate">{est.nome}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors">
                      <Building2 className="h-4 w-4 text-primary" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Estabelecimentos</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setEstabelecimentoAtual(TODOS_ESTABELECIMENTOS)}
                      className={`cursor-pointer ${estabelecimentoAtual?.id === 0 ? "bg-primary/10 text-primary" : ""}`}
                    >
                      <Building2 className="mr-2 h-4 w-4" />
                      <span className="truncate font-semibold">Todos os Estabelecimentos</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {estabelecimentos.map((est: Estabelecimento) => (
                      <DropdownMenuItem
                        key={est.id}
                        onClick={() => setEstabelecimentoAtual(est)}
                        className={`cursor-pointer ${estabelecimentoAtual?.id === est.id ? "bg-primary/10 text-primary" : ""}`}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        <span className="truncate">{est.nome}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 bg-sidebar">
            <SidebarMenu className="px-2 py-3">
              {menuItems
                .filter(item => {
                  // Verificar restrição por estabelecimento
                  if (item.estabelecimentoIds && estabelecimentoAtual) {
                    if (!item.estabelecimentoIds.includes(estabelecimentoAtual.id)) return false;
                  }
                  // Se não tem módulo definido, sempre mostra
                  if (!item.modulo && !item.adminOnly) return true;
                  // Se é adminOnly, verificar se é gestor
                  if (item.adminOnly) return isGestor;
                  // Verificar permissão do módulo
                  return temAcessoModulo(item.modulo!);
                })
                .map(item => {
                // Função recursiva para verificar se algum filho está ativo
                const isAnyChildActive = (menuItem: MenuItem): boolean => {
                  if (location === menuItem.path) return true;
                  if (menuItem.children) return menuItem.children.some(c => isAnyChildActive(c));
                  return false;
                };

                // Se tem children, renderizar como grupo expansível
                if (item.children && item.children.length > 0) {
                  const isChildActive = isAnyChildActive(item);
                  return (
                    <Collapsible key={item.label} asChild defaultOpen={isChildActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={item.label}
                            isActive={isChildActive}
                            className={`h-10 transition-all font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent ${isChildActive ? "bg-primary/10 text-primary" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isChildActive ? "text-primary" : "text-sidebar-foreground/60"}`}
                            />
                            <span>{item.label}</span>
                            <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children
                              .filter(child => {
                                if (!child.modulo && !child.adminOnly) return true;
                                if (child.adminOnly) return isGestor;
                                return temAcessoModulo(child.modulo!);
                              })
                              .map(child => {
                                // Nível 3: Se o child também tem children (subpasta dentro de subpasta)
                                if (child.children && child.children.length > 0) {
                                  const isSubChildActive = isAnyChildActive(child);
                                  return (
                                    <Collapsible key={child.label} asChild defaultOpen={isSubChildActive} className="group/subfolder">
                                      <SidebarMenuSubItem>
                                        <CollapsibleTrigger asChild>
                                          <button
                                            type="button"
                                            className={`flex w-full items-center gap-2 rounded-md px-2 h-7 text-sm cursor-pointer font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${isSubChildActive ? "text-primary bg-sidebar-accent" : "text-sidebar-foreground/70"}`}
                                          >
                                            <child.icon className={`h-3.5 w-3.5 shrink-0 ${isSubChildActive ? "text-primary" : ""}`} />
                                            <span className="truncate">{child.label}</span>
                                            <ChevronRight className="ml-auto h-3 w-3 shrink-0 transition-transform duration-200 group-data-[state=open]/subfolder:rotate-90" />
                                          </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <SidebarMenuSub className="ml-2 border-l border-sidebar-border/50">
                                            {child.children
                                              .filter(grandchild => {
                                                if (!grandchild.modulo && !grandchild.adminOnly) return true;
                                                if (grandchild.adminOnly) return isGestor;
                                                return temAcessoModulo(grandchild.modulo!);
                                              })
                                              .map(grandchild => {
                                                const isGrandchildActive = location === grandchild.path;
                                                return (
                                                  <SidebarMenuSubItem key={grandchild.path}>
                                                    <SidebarMenuSubButton
                                                      onClick={() => setLocation(grandchild.path)}
                                                      data-active={isGrandchildActive}
                                                      className={`cursor-pointer text-xs ${isGrandchildActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                                                    >
                                                      <grandchild.icon className={`h-3 w-3 ${isGrandchildActive ? "text-primary-foreground" : ""}`} />
                                                      <span>{grandchild.label}</span>
                                                    </SidebarMenuSubButton>
                                                  </SidebarMenuSubItem>
                                                );
                                              })}
                                          </SidebarMenuSub>
                                        </CollapsibleContent>
                                      </SidebarMenuSubItem>
                                    </Collapsible>
                                  );
                                }

                                // Nível 2: Item normal sem sub-children
                                const isSubActive = location === child.path;
                                return (
                                  <SidebarMenuSubItem key={child.path}>
                                    <SidebarMenuSubButton
                                      onClick={() => setLocation(child.path)}
                                      data-active={isSubActive}
                                      className={`cursor-pointer ${isSubActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                                    >
                                      <child.icon className={`h-3.5 w-3.5 ${isSubActive ? "text-primary-foreground" : ""}`} />
                                      <span>{child.label}</span>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent ${isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/60"}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SettingsMenu />
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 bg-sidebar border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-accent text-sidebar-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/alterar-senha")}
                  className="cursor-pointer"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Alterar Senha</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ThemeToggleMenuItem />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-card" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground font-medium">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MotorRegrasNotificationBell />
              {estabelecimentoAtual && estabelecimentoAtual.id > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 px-3 py-1 rounded-full">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate max-w-[150px] font-medium text-primary">{estabelecimentoAtual.nome}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {!isMobile && estabelecimentoAtual && estabelecimentoAtual.id > 0 && (
          <div className="flex items-center justify-between px-6 py-3 bg-card border-b">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Visualizando:</span>
              <span className="text-sm font-semibold text-foreground">{estabelecimentoAtual.nome}</span>
            </div>
            <MotorRegrasNotificationBell />
          </div>
        )}
        {!isMobile && (!estabelecimentoAtual || estabelecimentoAtual.id <= 0) && (
          <div className="flex items-center justify-end px-6 py-3 bg-card border-b">
            <MotorRegrasNotificationBell />
          </div>
        )}
        <main className="flex-1 p-6">
          <AccessGuard location={location} isGestor={isGestor} temAcessoModulo={temAcessoModulo} userRole={user?.role} estabelecimentoId={estabelecimentoAtual?.id}>
            {children}
          </AccessGuard>
        </main>
      </SidebarInset>
    </>
  );
}
