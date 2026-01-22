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
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, 
  LogOut, 
  PanelLeft, 
  Upload, 
  FileSearch, 
  GitCompare, 
  AlertTriangle,
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
  Clock
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

import type { ModuloPermissao } from "@/contexts/EstabelecimentoContext";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  modulo?: ModuloPermissao;
  adminOnly?: boolean;
};

const menuItems: MenuItem[] = [
  // Dashboards
  { icon: LayoutDashboard, label: "Dashboard", path: "/", modulo: "dashboard" },
  { icon: LayoutGrid, label: "Dashboard Consolidado", path: "/dashboard-consolidado", adminOnly: true },
  { icon: Brain, label: "Dashboard IA", path: "/dashboard-ia", modulo: "comparacoes" },
  { icon: Activity, label: "Produtividade", path: "/produtividade", modulo: "produtividade" },
  
  // Arquivos e Upload
  { icon: Upload, label: "Upload de Arquivos", path: "/upload", modulo: "arquivos" },
  { icon: FileSearch, label: "Arquivos", path: "/arquivos", modulo: "arquivos" },
  { icon: List, label: "Contas", path: "/contas", modulo: "arquivos" },
  
  // Comparações e Conciliação
  { icon: GitCompare, label: "Comparações", path: "/comparacoes", modulo: "comparacoes" },
  { icon: AlertTriangle, label: "Divergências", path: "/divergencias", modulo: "comparacoes" },
  { icon: Scale, label: "Conciliação", path: "/conciliacao", modulo: "comparacoes" },
  
  // Faturamento
  { icon: BarChart3, label: "Faturamento", path: "/faturamento", modulo: "faturamento" },
  { icon: FileText, label: "Relatório de Contas", path: "/relatorio-contas", modulo: "faturamento" },
  { icon: FileSpreadsheet, label: "Demonstrativo", path: "/demonstrativo", modulo: "faturamento" },
  
  // Análise e Recursos de Glosa
  { icon: PieChart, label: "Análise de Glosa", path: "/analise-glosa", modulo: "analiseGlosa" },
  { icon: Gavel, label: "Recursos de Glosa", path: "/recursos", modulo: "recursosGlosa" },
  { icon: History, label: "Acompanhamento Recursos", path: "/acompanhamento-recursos", modulo: "recursosGlosa" },
  { icon: Gavel, label: "Envio em Lote", path: "/envio-recursos-lote", modulo: "recursosGlosa" },
  
  // Itens Não Recebidos
  { icon: Clock, label: "Não Recebidos", path: "/nao-recebidos", modulo: "faturamento" },
  
  // Relatórios e Históricos
  { icon: FileText, label: "Relatórios", path: "/relatorios", modulo: "faturamento" },
  { icon: TrendingUp, label: "Tendências", path: "/tendencias", modulo: "analiseGlosa" },
  { icon: History, label: "Histórico Contestações", path: "/historico-contestacoes", modulo: "recursosGlosa" },
  { icon: Receipt, label: "Repasse", path: "/repasse", modulo: "faturamento" },
  
  // Administração
  { icon: Shield, label: "Gerenciar Permissões", path: "/gerenciar-permissoes", modulo: "permissoes" },
  { icon: BookOpen, label: "Dicionário de Glosas", path: "/dicionario-glosas", modulo: "dicionarioGlosas" },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
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
  temAcessoModulo 
}: { 
  children: React.ReactNode; 
  location: string;
  isGestor: boolean;
  temAcessoModulo: (modulo: ModuloPermissao) => boolean;
}) {
  // Encontrar o item de menu correspondente à rota atual
  const currentMenuItem = menuItems.find(item => item.path === location);
  
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
              src="/safatle-logo.png" 
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
                src="/safatle-logo.png" 
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
                  // Se não tem módulo definido, sempre mostra
                  if (!item.modulo && !item.adminOnly) return true;
                  // Se é adminOnly, verificar se é gestor
                  if (item.adminOnly) return isGestor;
                  // Verificar permissão do módulo
                  return temAcessoModulo(item.modulo!);
                })
                .map(item => {
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

      <SidebarInset className="bg-slate-50">
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-white px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground font-medium">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            {estabelecimentoAtual && estabelecimentoAtual.id > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 px-3 py-1 rounded-full">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="truncate max-w-[150px] font-medium text-primary">{estabelecimentoAtual.nome}</span>
              </div>
            )}
          </div>
        )}
        {!isMobile && estabelecimentoAtual && estabelecimentoAtual.id > 0 && (
          <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary/5 to-transparent border-b">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Visualizando:</span>
            <span className="text-sm font-semibold text-slate-700">{estabelecimentoAtual.nome}</span>
          </div>
        )}
        <main className="flex-1 p-6">
          <AccessGuard location={location} isGestor={isGestor} temAcessoModulo={temAcessoModulo}>
            {children}
          </AccessGuard>
        </main>
      </SidebarInset>
    </>
  );
}
