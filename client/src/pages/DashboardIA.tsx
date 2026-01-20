import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Bell,
  RefreshCw,
  BarChart3,
  Target,
  Zap,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";

export default function DashboardIA() {
  const { estabelecimentoAtual: estabelecimentoSelecionado } = useEstabelecimento();
  const [convenioId, setConvenioId] = useState<number | undefined>(undefined);

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery(
    undefined,
    { enabled: !!estabelecimentoSelecionado }
  );

  // Buscar métricas de acurácia
  const { data: metricas, isLoading, refetch } = trpc.insightsIA.metricas.useQuery(
    { 
      estabelecimentoId: estabelecimentoSelecionado?.id,
      convenioId 
    },
    { enabled: !!estabelecimentoSelecionado }
  );

  // Mutation para verificar insights críticos
  const verificarCriticos = trpc.insightsIA.verificarCriticos.useMutation({
    onSuccess: (result) => {
      if (result.notificado) {
        toast.success(`Notificação enviada! ${result.insightsCriticos} divergência(s) crítica(s) detectada(s).`);
      } else if (result.insightsCriticos > 0) {
        toast.info(`${result.insightsCriticos} divergência(s) crítica(s) encontrada(s), mas a notificação não pôde ser enviada.`);
      } else {
        toast.info("Nenhuma divergência crítica encontrada no momento.");
      }
    },
    onError: () => {
      toast.error("Erro ao verificar insights críticos");
    }
  });

  const handleVerificarCriticos = () => {
    if (!estabelecimentoSelecionado) return;
    verificarCriticos.mutate({
      estabelecimentoId: estabelecimentoSelecionado.id,
    });
  };

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      item_faltante: "Item Faltante",
      quantidade_baixa: "Qtd. Baixa",
      quantidade_alta: "Qtd. Alta",
      valor_divergente: "Valor Divergente",
      item_incomum: "Item Incomum",
      padrao_incompleto: "Padrão Incompleto",
      oportunidade_cobranca: "Oportunidade",
    };
    return labels[tipo] || tipo;
  };

  const getTipoColor = (tipo: string) => {
    const colors: Record<string, string> = {
      item_faltante: "bg-red-100 text-red-800",
      quantidade_baixa: "bg-orange-100 text-orange-800",
      quantidade_alta: "bg-yellow-100 text-yellow-800",
      valor_divergente: "bg-purple-100 text-purple-800",
      item_incomum: "bg-blue-100 text-blue-800",
      padrao_incompleto: "bg-gray-100 text-gray-800",
      oportunidade_cobranca: "bg-green-100 text-green-800",
    };
    return colors[tipo] || "bg-gray-100 text-gray-800";
  };

  if (!estabelecimentoSelecionado) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione um estabelecimento para ver o dashboard de IA</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Dashboard de IA
            </h1>
            <p className="text-muted-foreground">
              Acompanhe a acurácia e evolução do aprendizado da IA
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              value={convenioId?.toString() || "todos"}
              onValueChange={(v) => setConvenioId(v === "todos" ? undefined : parseInt(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos os convênios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {convenios?.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={handleVerificarCriticos} disabled={verificarCriticos.isPending}>
              <Bell className="h-4 w-4 mr-2" />
              Verificar Críticos
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : metricas ? (
          <>
            {/* Cards de Métricas Principais */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Acerto</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{metricas.taxaAcerto}%</div>
                  <Progress value={metricas.taxaAcerto} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {metricas.aceitos} aceitos de {metricas.aceitos + metricas.rejeitados} avaliados
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Insights</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metricas.totalInsights}</div>
                  <div className="flex gap-2 mt-2 text-xs">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> {metricas.aceitos}
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-3 w-3" /> {metricas.rejeitados}
                    </span>
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Clock className="h-3 w-3" /> {metricas.pendentes}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Valor Recuperado</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    R$ {metricas.impactoRecuperado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Baseado em insights aceitos
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Potencial Pendente</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    R$ {metricas.impactoPotencial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metricas.pendentes} insights aguardando análise
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos e Detalhes */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Evolução Mensal */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Evolução Mensal
                  </CardTitle>
                  <CardDescription>
                    Taxa de acerto ao longo do tempo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metricas.evolucaoMensal.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      Nenhum dado de evolução disponível
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {metricas.evolucaoMensal.slice(-6).map((mes) => (
                        <div key={mes.mes} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {new Date(mes.mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-green-600">{mes.aceitos} ✓</span>
                              <span className="text-red-600">{mes.rejeitados} ✗</span>
                              <Badge variant={mes.taxaAcerto >= 70 ? "default" : mes.taxaAcerto >= 50 ? "secondary" : "destructive"}>
                                {mes.taxaAcerto}%
                              </Badge>
                            </span>
                          </div>
                          <Progress 
                            value={mes.taxaAcerto} 
                            className={`h-2 ${mes.taxaAcerto >= 70 ? "[&>div]:bg-green-500" : mes.taxaAcerto >= 50 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Por Tipo de Insight */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Acurácia por Tipo
                  </CardTitle>
                  <CardDescription>
                    Desempenho da IA por categoria de insight
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metricas.porTipoInsight.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      Nenhum insight categorizado ainda
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {metricas.porTipoInsight.map((tipo) => (
                        <div key={tipo.tipo} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Badge className={getTipoColor(tipo.tipo)}>
                              {getTipoLabel(tipo.tipo)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              ({tipo.total} total)
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-sm">
                              <span className="text-green-600">{tipo.aceitos}</span>
                              {" / "}
                              <span className="text-red-600">{tipo.rejeitados}</span>
                            </div>
                            <Badge 
                              variant={tipo.taxaAcerto >= 70 ? "default" : tipo.taxaAcerto >= 50 ? "secondary" : "destructive"}
                              className="min-w-[50px] justify-center"
                            >
                              {tipo.taxaAcerto}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Resumo de Status */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Status</CardTitle>
                <CardDescription>
                  Visão geral de todos os insights gerados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{metricas.aceitos}</p>
                      <p className="text-sm text-green-600">Aceitos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                    <XCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700">{metricas.rejeitados}</p>
                      <p className="text-sm text-red-600">Rejeitados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                    <Clock className="h-8 w-8 text-yellow-600" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-700">{metricas.pendentes}</p>
                      <p className="text-sm text-yellow-600">Pendentes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                    <TrendingDown className="h-8 w-8 text-gray-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-700">{metricas.ignorados}</p>
                      <p className="text-sm text-gray-600">Ignorados</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Nenhum dado de métricas disponível</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
