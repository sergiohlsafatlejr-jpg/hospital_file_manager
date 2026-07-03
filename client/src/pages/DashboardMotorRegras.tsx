import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, TrendingUp, AlertTriangle, Loader2, RefreshCw, CheckCircle2, AlertOctagon, Activity, BarChart3, Clock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatDateBR } from "@/lib/dateUtils";

const getRiscoBadgeColor = (risco: string) => {
  switch (risco) {
    case "critico":
      return "bg-red-600 text-white";
    case "alto":
      return "bg-orange-500 text-white";
    case "medio":
      return "bg-yellow-500 text-white";
    case "baixo":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const getRiscoIcon = (risco: string) => {
  switch (risco) {
    case "critico":
      return <AlertOctagon className="w-4 h-4 text-red-600" />;
    case "alto":
      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case "medio":
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case "baixo":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    default:
      return <Activity className="w-4 h-4 text-gray-500" />;
  }
};

export function DashboardMotorRegras() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id;

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 segundos

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.motorRegras.obterEstatisticas.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
    },
    {
      enabled: !!estabelecimentoId,
    }
  );

  const { data: historico, isLoading: historicoLoading, refetch: refetchHistorico } = trpc.motorRegras.listarHistorico.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
      limit: 10,
      offset: 0,
    },
    {
      enabled: !!estabelecimentoId,
    }
  );

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refetchStats();
      refetchHistorico();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refetchStats, refetchHistorico]);

  const handleRefresh = () => {
    refetchStats();
    refetchHistorico();
    toast.success("Dados atualizados");
  };

  // Dados para gráficos
  const conformidadeData = [
    { mes: "Jan", conformidade: 85, validacoes: 120 },
    { mes: "Fev", conformidade: 88, validacoes: 135 },
    { mes: "Mar", conformidade: 82, validacoes: 110 },
    { mes: "Abr", conformidade: 90, validacoes: 145 },
    { mes: "Mai", conformidade: 87, validacoes: 128 },
    { mes: "Jun", conformidade: 92, validacoes: 155 },
  ];

  const motivosGlosaData = [
    { motivo: "Carteira Inválida", valor: 45 },
    { motivo: "Procedimento Não Autorizado", valor: 38 },
    { motivo: "Valor Divergente", valor: 32 },
    { motivo: "Documentação Incompleta", valor: 28 },
    { motivo: "Duplicidade", valor: 15 },
  ];

  const coresMotivos = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Dashboard - Motor de Regras</h1>
            <p className="text-gray-600 mt-2">
              Monitoramento em tempo real de conformidade e risco de glosa
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              size="sm"
            >
              <Activity className="w-4 h-4 mr-2" />
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </Button>

            <Button onClick={handleRefresh} size="sm" variant="outline">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-600">Total de Validações</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {statsLoading ? "-" : stats?.totalValidacoes || 0}
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-600">Taxa de Conformidade</p>
                  <p className="text-3xl font-bold text-green-600">
                    {statsLoading ? "-" : (stats?.taxaConformidade || 0).toFixed(1)}%
                  </p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-600">Score Médio</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {statsLoading ? "-" : (stats?.scoreConformidadeMedia || 0).toFixed(0)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-600">Contas Inválidas</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {statsLoading ? "-" : stats?.contasInvalidas || 0}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Evolução de Conformidade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evolução de Conformidade</CardTitle>
              <CardDescription>Últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={conformidadeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <RechartsTooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="conformidade" stroke="#3b82f6" name="Conformidade (%)" />
                  <Line yAxisId="right" type="monotone" dataKey="validacoes" stroke="#10b981" name="Validações" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Motivos de Glosa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 Motivos de Glosa</CardTitle>
              <CardDescription>Últimas validações</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={motivosGlosaData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="motivo" type="category" width={150} />
                  <RechartsTooltip />
                  <Bar dataKey="valor" fill="#f97316" name="Ocorrências" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Histórico de Validações */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Histórico de Validações</CardTitle>
              <CardDescription>Últimas validações processadas</CardDescription>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              {autoRefresh && <span>Auto-refresh a cada {(refreshInterval / 1000).toFixed(0)}s</span>}
            </div>
          </CardHeader>

          <CardContent>
            {historicoLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : historico && historico.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="text-right">Total de Contas</TableHead>
                      <TableHead className="text-right">Válidas</TableHead>
                      <TableHead className="text-right">Inválidas</TableHead>
                      <TableHead className="text-right">Score Médio</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((validacao: any) => (
                      <TableRow key={validacao.id}>
                        <TableCell className="font-mono text-sm">{validacao.nomeArquivo}</TableCell>
                        <TableCell className="text-right">{validacao.totalContas}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {validacao.contasValidas}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            {validacao.contasInvalidas}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {(validacao.scoreConformidadeMedio || 0).toFixed(1)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatDateBR(validacao.dataProcessamento)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma validação encontrada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas Críticos */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-lg text-red-800 flex items-center gap-2">
              <AlertOctagon className="w-5 h-5" />
              Alertas Críticos
            </CardTitle>
            <CardDescription className="text-red-700">
              Ações recomendadas para melhorar conformidade
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              {stats && stats.taxaConformidade < 80 && (
                <div className="p-3 bg-white border border-red-200 rounded-lg flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-red-800">Taxa de Conformidade Baixa</p>
                    <p className="text-sm text-red-700 mt-1">
                      A taxa de conformidade está abaixo de 80%. Recomenda-se revisar os padrões de validação e treinar equipe.
                    </p>
                  </div>
                </div>
              )}

              {stats && stats.contasInvalidas > 50 && (
                <div className="p-3 bg-white border border-red-200 rounded-lg flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-red-800">Alto Volume de Contas Inválidas</p>
                    <p className="text-sm text-red-700 mt-1">
                      Existem mais de 50 contas inválidas. Investigar motivos recorrentes e implementar medidas corretivas.
                    </p>
                  </div>
                </div>
              )}

              {(!stats || (stats.taxaConformidade >= 80 && stats.contasInvalidas <= 50)) && (
                <div className="p-3 bg-white border border-green-200 rounded-lg flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-green-800">Status Normal</p>
                    <p className="text-sm text-green-700 mt-1">
                      Nenhum alerta crítico. Continue monitorando os padrões de conformidade.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recomendações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recomendações</CardTitle>
            <CardDescription>Sugestões para melhorar a análise de risco</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="font-semibold text-sm text-blue-800">📊 Análise de Padrões</p>
                <p className="text-sm text-blue-700 mt-1">
                  Execute análise de padrões regularmente para atualizar os dados de risco. Recomenda-se executar a cada semana.
                </p>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="font-semibold text-sm text-purple-800">🔍 Revisão de Motivos</p>
                <p className="text-sm text-purple-700 mt-1">
                  Revise os motivos de glosa mais frequentes e implemente ações corretivas específicas.
                </p>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="font-semibold text-sm text-indigo-800">📈 Treinamento</p>
                <p className="text-sm text-indigo-700 mt-1">
                  Realize treinamento com a equipe sobre os itens com maior risco identificados pelo motor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default DashboardMotorRegras;
