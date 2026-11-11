import { AlertCircle, Building2, MapPin, FileText, LogIn, Newspaper, ExternalLink, Clock, Activity, TrendingUp, Shield } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DisplayScaleControl } from "@/components/DisplayScaleControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento, Estabelecimento } from "@/contexts/EstabelecimentoContext";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getOAuthLoginFeedback } from "@shared/oauthLoginFeedback";

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getCategoriaColor(categoria: string): string {
  switch (categoria) {
    case "Faturamento Hospitalar": return "bg-blue-100 text-blue-700";
    case "Gestão Hospitalar": return "bg-emerald-100 text-emerald-700";
    case "Regulação ANS": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function SelecionarEstabelecimento() {
  const { estabelecimentos, setEstabelecimentoAtual, isLoading } = useEstabelecimento();
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAuthenticated = Boolean(user);
  const authFeedback = getOAuthLoginFeedback(window.location.search, isAuthenticated);

  const { data: noticias, isLoading: noticiasLoading } = trpc.noticias.listar.useQuery(undefined, {
    refetchInterval: 30 * 60 * 1000, // 30 minutos
    staleTime: 15 * 60 * 1000,
  });



  const handleSelecionar = (estabelecimento: Estabelecimento) => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    setEstabelecimentoAtual(estabelecimento);
    setLocation("/");
  };

  const handleLogin = () => {
    setLocation("/login");
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" 
                alt="Safatle Logo" 
                className="w-10 h-10 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold text-foreground leading-tight">Safatle</h1>
                <p className="text-xs text-muted-foreground leading-tight">Gerenciamento Hospitalar</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DisplayScaleControl />
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    Olá, <span className="font-medium text-foreground">{user?.name || "Usuário"}</span>
                  </span>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                </div>
              ) : (
                <Button onClick={handleLogin} className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-safatle-navy to-safatle-navy-light opacity-95"></div>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-safatle-blue rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-safatle-red rounded-full blur-3xl"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                Gestão Inteligente de
                <span className="text-safatle-blue-light block mt-1">Faturamento Hospitalar</span>
              </h2>
              <p className="text-lg text-white/70 mb-8 max-w-lg">
                Plataforma completa para gerenciamento de convênios, análise de glosas, 
                conciliação de contas e controle de atendimentos hospitalares.
              </p>
              {authFeedback && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mb-8 max-w-lg rounded-lg border border-red-200/70 bg-white p-4 text-slate-950 shadow-sm"
                >
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-semibold">{authFeedback.title}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-700">{authFeedback.message}</p>
                      {authFeedback.reference && (
                        <p className="mt-2 text-xs text-slate-600">
                          Referência de atendimento: {authFeedback.reference}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={handleLogin}
                      >
                        Ir para o login
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {!isAuthenticated && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={handleLogin} 
                    size="lg" 
                    className="bg-safatle-red hover:bg-safatle-red-light text-white gap-2 text-base px-8"
                  >
                    <LogIn className="h-5 w-5" />
                    Acessar o Sistema
                  </Button>
                </div>
              )}
              {isAuthenticated && (
                <p className="text-white/60 text-sm">
                  Selecione um estabelecimento abaixo para continuar.
                </p>
              )}
            </div>
            <div className="hidden lg:grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                  <Activity className="h-8 w-8 text-safatle-blue-light mb-3" />
                  <h4 className="text-white font-semibold mb-1">Monitoramento</h4>
                  <p className="text-white/60 text-sm">Acompanhe atendimentos e faturamento em tempo real</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                  <Shield className="h-8 w-8 text-safatle-blue-light mb-3" />
                  <h4 className="text-white font-semibold mb-1">Análise de Glosas</h4>
                  <p className="text-white/60 text-sm">Identifique e recurse glosas com inteligência</p>
                </div>
              </div>
              <div className="space-y-4 mt-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                  <TrendingUp className="h-8 w-8 text-safatle-blue-light mb-3" />
                  <h4 className="text-white font-semibold mb-1">Relatórios</h4>
                  <p className="text-white/60 text-sm">Dashboards e relatórios detalhados de performance</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                  <FileText className="h-8 w-8 text-safatle-blue-light mb-3" />
                  <h4 className="text-white font-semibold mb-1">Conciliação</h4>
                  <p className="text-white/60 text-sm">Compare faturamento e recebimento automaticamente</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Estabelecimentos - Apenas após login */}
      {isAuthenticated && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-2 gap-6">
            {estabelecimentos.map((estabelecimento) => (
              <Card
                key={estabelecimento.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] hover:border-primary/50 bg-card"
                onClick={() => handleSelecionar(estabelecimento)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{estabelecimento.nome}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <FileText className="h-3 w-3" />
                          {estabelecimento.cnpj || "CNPJ não informado"}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mb-4">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{estabelecimento.endereco || "Endereço não informado"}</span>
                  </div>
                  <Button className="w-full" variant="outline">
                    Selecionar este estabelecimento
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {estabelecimentos.length === 0 && (
            <Card className="bg-card">
              <CardContent className="text-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Nenhum estabelecimento cadastrado
                </h3>
                <p className="text-muted-foreground">
                  Entre em contato com o administrador para cadastrar estabelecimentos.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Seção de Notícias */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-lg bg-primary/10">
            <Newspaper className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Notícias do Setor</h3>
            <p className="text-muted-foreground text-sm">Últimas notícias sobre saúde, faturamento hospitalar e regulação</p>
          </div>
        </div>

        {noticiasLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-5 w-3/4 mb-4" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : noticias && noticias.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {noticias.map((noticia, index) => (
              <a
                key={index}
                href={noticia.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <Card className="border-0 shadow-sm h-full transition-all group-hover:shadow-md group-hover:scale-[1.01] group-hover:border-primary/30">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoriaColor(noticia.categoria)}`}>
                        {noticia.categoria}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-foreground leading-snug mb-3 line-clamp-3 group-hover:text-primary transition-colors flex-1">
                      {noticia.titulo}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-3 border-t border-border/50">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {noticia.fonte && (
                          <span className="truncate font-medium">{noticia.fonte}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimeAgo(noticia.dataPublicacao)}</span>
                        <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="text-center py-12">
              <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h4 className="text-lg font-medium text-foreground mb-2">Nenhuma notícia disponível</h4>
              <p className="text-muted-foreground text-sm">As notícias serão carregadas automaticamente.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" 
                alt="Safatle Logo" 
                className="w-8 h-8 object-contain"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">Safatle Gerenciamento</p>
                <p className="text-xs text-muted-foreground">Automação de Processos Hospitalares</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Safatle. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
