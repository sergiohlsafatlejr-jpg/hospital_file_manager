import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
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
  DollarSign,
  Users,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  AlertCircle
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

            {/* Seção de Alertas da IA */}
            <AlertasIASection estabelecimentoId={estabelecimentoSelecionado.id} />

            {/* Seção de Contas Outliers */}
            <OutliersSection estabelecimentoId={estabelecimentoSelecionado.id} convenioId={convenioId} />

            {/* Seção de Padrões de Erro por Funcionário */}
            <PadroesErroSection estabelecimentoId={estabelecimentoSelecionado.id} />

            {/* Seção de Risco de Glosa */}
            <RiscoGlosaSection estabelecimentoId={estabelecimentoSelecionado.id} />
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

// Componente de Alertas da IA
function AlertasIASection({ estabelecimentoId }: { estabelecimentoId: number }) {
  const { data: alertas, isLoading } = trpc.ia.alertas.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Alertas da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!alertas || alertas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Alertas da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mr-2 text-green-500" />
            Nenhum alerta no momento
          </div>
        </CardContent>
      </Card>
    );
  }

  const getAlertaIcon = (tipo: string) => {
    switch (tipo) {
      case 'critico': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'alerta': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default: return <Bell className="h-5 w-5 text-blue-500" />;
    }
  };

  const getAlertaBg = (tipo: string) => {
    switch (tipo) {
      case 'critico': return 'bg-red-50 border-red-200';
      case 'alerta': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Alertas da IA
          <Badge variant="secondary">{alertas.length}</Badge>
        </CardTitle>
        <CardDescription>Problemas identificados que requerem atenção</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alertas.map((alerta, index) => (
            <div key={index} className={`p-4 rounded-lg border ${getAlertaBg(alerta.tipo)}`}>
              <div className="flex items-start gap-3">
                {getAlertaIcon(alerta.tipo)}
                <div className="flex-1">
                  <h4 className="font-medium">{alerta.titulo}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{alerta.descricao}</p>
                </div>
                <Badge variant="outline" className="capitalize">{alerta.categoria.replace('_', ' ')}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Componente de Contas Outliers
function OutliersSection({ estabelecimentoId, convenioId }: { estabelecimentoId: number; convenioId?: number }) {
  const { data: outliers, isLoading } = trpc.ia.contasOutliers.useQuery(
    { estabelecimentoId, convenioId, limiteDesvio: 2 },
    { enabled: !!estabelecimentoId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Contas com Valores Fora da Média
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const outliersAbaixo = outliers?.filter(o => o.tipo === 'abaixo_media') || [];
  const outliersAcima = outliers?.filter(o => o.tipo === 'acima_media') || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Contas com Valores Fora da Média
        </CardTitle>
        <CardDescription>Contas com valores significativamente diferentes da média histórica</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Abaixo da Média */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2 text-orange-600">
              <ArrowDown className="h-4 w-4" />
              Abaixo da Média ({outliersAbaixo.length})
            </h4>
            {outliersAbaixo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta identificada</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {outliersAbaixo.slice(0, 5).map((o, i) => (
                  <div key={i} className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{o.procedimento.pacienteNome || 'Paciente'}</p>
                        <p className="text-xs text-muted-foreground">Guia: {o.procedimento.guiaNumero}</p>
                        <p className="text-xs text-muted-foreground">{o.procedimento.codigo} - {o.procedimento.descricao}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-600">
                          R$ {Number(o.procedimento.valorTotal || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Média: R$ {o.valorMedio.toFixed(2)}
                        </p>
                        <Badge variant="outline" className="text-orange-600">
                          {o.diferencaPercentual.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acima da Média */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2 text-blue-600">
              <ArrowUp className="h-4 w-4" />
              Acima da Média ({outliersAcima.length})
            </h4>
            {outliersAcima.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta identificada</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {outliersAcima.slice(0, 5).map((o, i) => (
                  <div key={i} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{o.procedimento.pacienteNome || 'Paciente'}</p>
                        <p className="text-xs text-muted-foreground">Guia: {o.procedimento.guiaNumero}</p>
                        <p className="text-xs text-muted-foreground">{o.procedimento.codigo} - {o.procedimento.descricao}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">
                          R$ {Number(o.procedimento.valorTotal || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Média: R$ {o.valorMedio.toFixed(2)}
                        </p>
                        <Badge variant="outline" className="text-blue-600">
                          +{o.diferencaPercentual.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente de Padrões de Erro por Funcionário
function PadroesErroSection({ estabelecimentoId }: { estabelecimentoId: number }) {
  const { data: padroes, isLoading } = trpc.ia.padroesErroPorFuncionario.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Padrões de Erro por Funcionário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!padroes || padroes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Padrões de Erro por Funcionário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Dados insuficientes para análise
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTaxaColor = (taxa: number) => {
    if (taxa > 20) return 'text-red-600 bg-red-50';
    if (taxa > 10) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Padrões de Erro por Funcionário
        </CardTitle>
        <CardDescription>Análise de taxa de glosa por faturista nos últimos 6 meses</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Funcionário</th>
                <th className="text-right py-2">Contas</th>
                <th className="text-right py-2">Procedimentos</th>
                <th className="text-right py-2">Glosados</th>
                <th className="text-right py-2">Taxa Glosa</th>
                <th className="text-right py-2">Valor Glosado</th>
              </tr>
            </thead>
            <tbody>
              {padroes.slice(0, 10).map((p, i) => (
                <tr key={i} className="border-b hover:bg-muted/50">
                  <td className="py-2">
                    <div>
                      <p className="font-medium">{p.userName}</p>
                      <p className="text-xs text-muted-foreground">{p.userEmail}</p>
                    </div>
                  </td>
                  <td className="text-right py-2">{p.totalContas}</td>
                  <td className="text-right py-2">{p.totalProcedimentos}</td>
                  <td className="text-right py-2">{p.totalGlosados}</td>
                  <td className="text-right py-2">
                    <Badge className={getTaxaColor(p.taxaGlosa)}>
                      {p.taxaGlosa.toFixed(1)}%
                    </Badge>
                  </td>
                  <td className="text-right py-2 font-medium">
                    R$ {Number(p.valorTotalGlosado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente de Risco de Glosa
function RiscoGlosaSection({ estabelecimentoId }: { estabelecimentoId: number }) {
  const { data: contasRisco, isLoading } = trpc.ia.riscoGlosa.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Contas com Alto Risco de Glosa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const contasAltoRisco = contasRisco?.filter(c => c.riscoMaximo > 30) || [];

  if (contasAltoRisco.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Contas com Alto Risco de Glosa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mr-2 text-green-500" />
            Nenhuma conta com alto risco identificada
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRiscoColor = (risco: number) => {
    if (risco > 50) return 'text-red-600 bg-red-100';
    if (risco > 30) return 'text-orange-600 bg-orange-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Contas com Alto Risco de Glosa
          <Badge variant="destructive">{contasAltoRisco.length}</Badge>
        </CardTitle>
        <CardDescription>Contas com procedimentos que historicamente têm alta taxa de glosa</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {contasAltoRisco.slice(0, 10).map((conta, i) => (
            <div key={i} className="p-4 rounded-lg border bg-card hover:bg-muted/50">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{conta.pacienteNome || 'Paciente'}</p>
                  <p className="text-sm text-muted-foreground">Guia: {conta.guiaNumero}</p>
                  <p className="text-xs text-muted-foreground">
                    {conta.itens.length} procedimento(s) - {conta.arquivoNome}
                  </p>
                </div>
                <div className="text-right">
                  <Badge className={getRiscoColor(conta.riscoMaximo)}>
                    Risco: {conta.riscoMaximo.toFixed(0)}%
                  </Badge>
                  <p className="text-sm font-medium mt-1">
                    R$ {conta.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Procedimentos de risco:</p>
                <div className="flex flex-wrap gap-1">
                  {conta.itens.filter(item => item.riscoIndividual > 30).slice(0, 3).map((item, j) => (
                    <Badge key={j} variant="outline" className="text-xs">
                      {item.codigo} ({item.riscoIndividual.toFixed(0)}%)
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
