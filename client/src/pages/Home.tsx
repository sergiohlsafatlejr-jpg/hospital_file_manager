import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { 
  FileText, 
  Upload, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { SAFATLE_ESTABELECIMENTO_ID } from "@shared/const";
import { useEffect } from "react";
import { formatDateBR } from "@/lib/dateUtils";
import { toast } from "sonner";
export default function Home() {
  const [, setLocation] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;

  // Detectar erros de autenticação via query param e exibir mensagem amigável
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError === "rate_limit") {
      toast.error("⚠️ Muitas tentativas de login. Aguarde alguns segundos e tente novamente.", { duration: 10000 });
      window.history.replaceState({}, "", "/");
    } else if (authError === "callback_failed") {
      toast.error("Erro ao realizar login. Por favor, tente novamente.", { duration: 8000 });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Redirecionar para Painel Executivo quando Safatle está selecionado
  useEffect(() => {
    if (estabelecimentoAtual?.id === SAFATLE_ESTABELECIMENTO_ID) {
      setLocation("/painel-executivo");
    }
  }, [estabelecimentoAtual?.id, setLocation]);
  
  const { data: resumo, isLoading } = trpc.dashboard.resumo.useQuery({ estabelecimentoId });
  const { data: ultimasComparacoes } = trpc.dashboard.ultimasComparacoes.useQuery({ limit: 5, estabelecimentoId });
  const { data: ultimosArquivos } = trpc.dashboard.ultimosArquivos.useQuery({ limit: 5, estabelecimentoId });

  // Se Safatle está selecionado, não renderizar o dashboard normal
  if (estabelecimentoAtual?.id === SAFATLE_ESTABELECIMENTO_ID) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de gerenciamento de arquivos de convênios
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Arquivos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{resumo?.arquivos?.total || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                arquivos processados
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Enviados</CardTitle>
              <Upload className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{resumo?.arquivos?.enviados || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                arquivos enviados aos convênios
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Retornados</CardTitle>
              <Download className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{resumo?.arquivos?.retornados || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                arquivos retornados dos convênios
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Divergências</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{resumo?.comparacoes?.comDivergencias || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                comparações com divergências
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Comparison Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-primary">Comparações Realizadas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">{resumo?.comparacoes?.total || 0}</span>
                  <span className="text-sm text-primary/80">total</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Concluídas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-green-900">{resumo?.comparacoes?.concluidas || 0}</span>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-700">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-amber-900">{resumo?.comparacoes?.pendentes || 0}</span>
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recent Files */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Últimos Arquivos</CardTitle>
                  <CardDescription>Arquivos processados recentemente</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation("/arquivos")}>
                  Ver todos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ultimosArquivos?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum arquivo processado ainda
                  </p>
                ) : (
                  ultimosArquivos?.map((arquivo) => (
                    <div key={arquivo.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        arquivo.direcao === "enviado" ? "bg-primary/20" : "bg-green-100"
                      }`}>
                        {arquivo.direcao === "enviado" ? (
                          <ArrowUpRight className="h-5 w-5 text-primary" />
                        ) : (
                          <ArrowDownRight className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{arquivo.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {arquivo.tipoArquivo.toUpperCase()} • {arquivo.direcao}
                        </p>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        arquivo.status === "processado" 
                          ? "bg-green-100 text-green-700"
                          : arquivo.status === "erro"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {arquivo.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Comparisons */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Últimas Comparações</CardTitle>
                  <CardDescription>Comparações realizadas recentemente</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation("/comparacoes")}>
                  Ver todas
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ultimasComparacoes?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma comparação realizada ainda
                  </p>
                ) : (
                  ultimasComparacoes?.map((comp) => (
                    <div key={comp.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        comp.totalDivergencias && comp.totalDivergencias > 0 
                          ? "bg-amber-100" 
                          : "bg-green-100"
                      }`}>
                        {comp.totalDivergencias && comp.totalDivergencias > 0 ? (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Comparação #{comp.id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {comp.totalItensEnviados} enviados • {comp.totalItensRetornados} retornados
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          comp.totalDivergencias && comp.totalDivergencias > 0 
                            ? "text-amber-600" 
                            : "text-green-600"
                        }`}>
                          {comp.totalDivergencias || 0} divergências
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateBR(comp.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
            <CardDescription>Acesse rapidamente as principais funcionalidades</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/30"
                onClick={() => setLocation("/upload")}
              >
                <Upload className="h-6 w-6 text-primary" />
                <span className="font-medium">Upload de Arquivo</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col gap-2 hover:bg-green-50 hover:border-green-200"
                onClick={() => setLocation("/comparacoes")}
              >
                <TrendingUp className="h-6 w-6 text-green-600" />
                <span className="font-medium">Nova Comparação</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col gap-2 hover:bg-amber-50 hover:border-amber-200"
                onClick={() => setLocation("/divergencias")}
              >
                <AlertTriangle className="h-6 w-6 text-amber-600" />
                <span className="font-medium">Ver Divergências</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col gap-2 hover:bg-destructive/10 hover:border-destructive/30"
                onClick={() => setLocation("/relatorios")}
              >
                <FileText className="h-6 w-6 text-destructive" />
                <span className="font-medium">Gerar Relatório</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
