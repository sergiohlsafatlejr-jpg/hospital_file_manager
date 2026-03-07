import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  Activity, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock, 
  BarChart3,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Timer,
  Award,
  FileText,
  Upload,
  DollarSign,
  FileUp,
  Database,
  Building2,
  ArrowUpDown,
  Calendar
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
};

export default function DashboardProdutividade() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [tipoMetrica, setTipoMetrica] = useState<"glosas" | "xml" | "banco">("glosas");

  // Métricas de classificação de glosas
  const { data: metricasGlosas, isLoading: loadingGlosas, refetch: refetchGlosas } = trpc.produtividade.metricas.useQuery({
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  });

  // Métricas de envio de XML
  const { data: metricasXML, isLoading: loadingXML, refetch: refetchXML } = trpc.produtividade.metricasEnvioXML.useQuery({
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  // Métricas de importação via banco
  const { data: metricasBanco, isLoading: loadingBanco, refetch: refetchBanco } = trpc.produtividade.metricasImportacaoBanco.useQuery({
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const isLoading = tipoMetrica === "glosas" ? loadingGlosas : tipoMetrica === "xml" ? loadingXML : loadingBanco;
  const refetch = () => {
    refetchGlosas();
    refetchXML();
    refetchBanco();
  };

  // Preparar dados para gráficos de glosas
  const chartDataDiaGlosas = useMemo(() => {
    if (!metricasGlosas?.porDia) return [];
    return metricasGlosas.porDia.map(d => ({
      data: new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      aceitas: d.aceitas,
      recursadas: d.recursadas,
      total: d.totalClassificados,
    }));
  }, [metricasGlosas?.porDia]);

  const chartDataValorGlosas = useMemo(() => {
    if (!metricasGlosas?.porDia) return [];
    return metricasGlosas.porDia.map(d => ({
      data: new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      valorAceito: d.valorAceito,
      valorRecursado: d.valorRecursado,
    }));
  }, [metricasGlosas?.porDia]);

  // Preparar dados para gráficos de XML
  const chartDataDiaXML = useMemo(() => {
    if (!metricasXML?.porDia) return [];
    return metricasXML.porDia.map(d => ({
      data: new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      arquivos: d.arquivos,
      procedimentos: d.procedimentos,
      valorFaturado: d.valorFaturado,
    }));
  }, [metricasXML?.porDia]);

  // Preparar dados para gráficos de importação via banco
  const chartDataDiaBanco = useMemo(() => {
    if (!metricasBanco?.porDia) return [];
    return metricasBanco.porDia.map(d => ({
      data: new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      contas: d.contas,
      itens: d.itens,
      valor: d.valor,
    }));
  }, [metricasBanco?.porDia]);

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Dashboard de Produtividade
            </h1>
            <p className="text-muted-foreground">
              Métricas de envio de XML e classificação de glosas por usuário
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-40"
              placeholder="Data início"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-40"
              placeholder="Data fim"
            />
            <Button variant="outline" size="icon" onClick={refetch}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs de Tipo de Métrica */}
        <Tabs value={tipoMetrica} onValueChange={(v) => setTipoMetrica(v as "glosas" | "xml" | "banco")}>
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="xml" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Envio de XML
            </TabsTrigger>
            <TabsTrigger value="glosas" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Classificação de Glosas
            </TabsTrigger>
            <TabsTrigger value="banco" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Importação via Banco
            </TabsTrigger>
          </TabsList>

          {/* Conteúdo de Envio de XML */}
          <TabsContent value="xml" className="space-y-6">
            {loadingXML ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <>
                {/* KPIs de XML */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Arquivos</p>
                          <p className="text-3xl font-bold">{metricasXML?.resumo.totalArquivos || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <FileUp className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Arquivos XML enviados
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Procedimentos</p>
                          <p className="text-3xl font-bold">{metricasXML?.resumo.totalProcedimentos || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                          <FileText className="h-6 w-6 text-purple-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Total de procedimentos
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Faturado</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(metricasXML?.resumo.valorTotalFaturado || 0)}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <DollarSign className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Total faturado no período
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Arquivos Hoje</p>
                          <p className="text-3xl font-bold text-blue-600">{metricasXML?.resumo.arquivosHoje || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <Clock className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Enviados hoje
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Hoje</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(metricasXML?.resumo.valorHoje || 0)}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <TrendingUp className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Faturado hoje
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Gráficos de XML */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Arquivos por Dia
                      </CardTitle>
                      <CardDescription>
                        Quantidade de arquivos XML enviados por dia
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataDiaXML.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartDataDiaXML}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="arquivos" name="Arquivos" fill="#3b82f6" />
                            <Bar dataKey="procedimentos" name="Procedimentos" fill="#8b5cf6" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Valores Faturados por Dia
                      </CardTitle>
                      <CardDescription>
                        Evolução do faturamento diário
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataDiaXML.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartDataDiaXML}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Area 
                              type="monotone" 
                              dataKey="valorFaturado" 
                              name="Valor Faturado" 
                              stroke="#22c55e" 
                              fill="#22c55e" 
                              fillOpacity={0.3} 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de Produtividade por Usuário - XML */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Produtividade por Usuário - Envio de XML
                    </CardTitle>
                    <CardDescription>
                      Ranking de envio de arquivos e valores faturados por usuário
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasXML?.porUsuario && metricasXML.porUsuario.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Usuário</TableHead>
                            <TableHead className="text-center">Arquivos</TableHead>
                            <TableHead className="text-center">Procedimentos</TableHead>
                            <TableHead className="text-right">Valor Faturado</TableHead>
                            <TableHead className="text-right">Média por Arquivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasXML.porUsuario.map((usuario, index) => (
                            <TableRow key={usuario.userId}>
                              <TableCell>
                                {index === 0 ? (
                                  <Award className="h-5 w-5 text-yellow-500" />
                                ) : index === 1 ? (
                                  <Award className="h-5 w-5 text-gray-400" />
                                ) : index === 2 ? (
                                  <Award className="h-5 w-5 text-amber-700" />
                                ) : (
                                  <span className="text-muted-foreground">{index + 1}</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{usuario.userName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{usuario.totalArquivos}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{usuario.totalProcedimentos}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(usuario.valorTotalFaturado)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(usuario.mediaValorPorArquivo)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum dado de produtividade disponível</p>
                        <p className="text-sm mt-2">Envie arquivos XML para ver as métricas por usuário</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tabela por Convênio */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Faturamento por Convênio
                    </CardTitle>
                    <CardDescription>
                      Distribuição de arquivos e valores por convênio
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasXML?.porConvenio && metricasXML.porConvenio.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Convênio</TableHead>
                            <TableHead className="text-center">Arquivos</TableHead>
                            <TableHead className="text-right">Valor Faturado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasXML.porConvenio.map((convenio) => (
                            <TableRow key={convenio.convenioId}>
                              <TableCell className="font-medium">{convenio.convenioNome}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{convenio.totalArquivos}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(convenio.valorFaturado)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum dado disponível</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Conteúdo de Classificação de Glosas */}
          <TabsContent value="glosas" className="space-y-6">
            {loadingGlosas ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <>
                {/* KPIs de Glosas */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Classificados</p>
                          <p className="text-3xl font-bold">{metricasGlosas?.totais.totalClassificados || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <CheckCircle2 className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          {metricasGlosas?.totais.totalAceitas || 0} aceitas
                        </Badge>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          {metricasGlosas?.totais.totalRecursadas || 0} recursadas
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Pendentes</p>
                          <p className="text-3xl font-bold text-amber-600">{metricasGlosas?.totais.totalPendentes || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                          <Clock className="h-6 w-6 text-amber-600" />
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Taxa de classificação</span>
                          <span className="font-medium">{(metricasGlosas?.totais.taxaClassificacao || 0).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${metricasGlosas?.totais.taxaClassificacao || 0}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Aceito</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(metricasGlosas?.totais.valorTotalAceito || 0)}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <ThumbsUp className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Glosas aceitas sem recurso
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Valor para Recurso</p>
                          <p className="text-2xl font-bold text-orange-600">
                            {formatCurrency(metricasGlosas?.totais.valorTotalRecursado || 0)}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                          <ThumbsDown className="h-6 w-6 text-orange-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Glosas marcadas para recurso
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Gráficos de Glosas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Classificações por Dia
                      </CardTitle>
                      <CardDescription>
                        Quantidade de itens classificados nos últimos 30 dias
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataDiaGlosas.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartDataDiaGlosas}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="aceitas" name="Aceitas" fill="#22c55e" stackId="a" />
                            <Bar dataKey="recursadas" name="Recursadas" fill="#f97316" stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                            <p className="text-sm">Classifique glosas para ver as métricas</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Valores por Dia
                      </CardTitle>
                      <CardDescription>
                        Valores de glosas aceitas e recursadas
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataValorGlosas.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartDataValorGlosas}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Area 
                              type="monotone" 
                              dataKey="valorAceito" 
                              name="Valor Aceito" 
                              stroke="#22c55e" 
                              fill="#22c55e" 
                              fillOpacity={0.3} 
                            />
                            <Area 
                              type="monotone" 
                              dataKey="valorRecursado" 
                              name="Valor Recursado" 
                              stroke="#f97316" 
                              fill="#f97316" 
                              fillOpacity={0.3} 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de Produtividade por Usuário - Glosas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Produtividade por Usuário - Classificação de Glosas
                    </CardTitle>
                    <CardDescription>
                      Ranking de classificações por usuário
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasGlosas?.porUsuario && metricasGlosas.porUsuario.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Usuário</TableHead>
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Aceitas</TableHead>
                            <TableHead className="text-center">Recursadas</TableHead>
                            <TableHead className="text-right">Valor Aceito</TableHead>
                            <TableHead className="text-right">Valor Recursado</TableHead>
                            <TableHead className="text-center">Tempo Médio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasGlosas.porUsuario.map((usuario, index) => (
                            <TableRow key={usuario.userId}>
                              <TableCell>
                                {index === 0 ? (
                                  <Award className="h-5 w-5 text-yellow-500" />
                                ) : index === 1 ? (
                                  <Award className="h-5 w-5 text-gray-400" />
                                ) : index === 2 ? (
                                  <Award className="h-5 w-5 text-amber-700" />
                                ) : (
                                  <span className="text-muted-foreground">{index + 1}</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{usuario.userName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{usuario.totalClassificados}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  {usuario.aceitas}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                  {usuario.recursadas}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(usuario.valorAceito)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600 font-medium">
                                {formatCurrency(usuario.valorRecursado)}
                              </TableCell>
                              <TableCell className="text-center">
                                {usuario.tempoMedioClassificacao > 0 ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Timer className="h-3 w-3" />
                                    {formatTime(usuario.tempoMedioClassificacao)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum dado de produtividade disponível</p>
                        <p className="text-sm mt-2">Classifique glosas para ver as métricas por usuário</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Conteúdo de Importação via Banco */}
          <TabsContent value="banco" className="space-y-6">
            {loadingBanco ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <>
                {/* KPIs de Importação via Banco */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total de Contas</p>
                          <p className="text-3xl font-bold">{metricasBanco?.resumo.totalContas || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                          <Database className="h-6 w-6 text-indigo-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Contas importadas via integrador
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total de Itens</p>
                          <p className="text-3xl font-bold">{metricasBanco?.resumo.totalItens || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                          <FileText className="h-6 w-6 text-purple-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Média de {metricasBanco?.resumo.mediaItensPorConta || 0} itens/conta
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Valor Total</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(metricasBanco?.resumo.valorTotal || 0)}
                          </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                          <DollarSign className="h-6 w-6 text-green-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Média de {formatCurrency(metricasBanco?.resumo.mediaValorPorConta || 0)}/conta
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Importadas Hoje</p>
                          <p className="text-3xl font-bold text-indigo-600">{metricasBanco?.resumo.contasHoje || 0}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                          <Clock className="h-6 w-6 text-indigo-600" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Valor hoje: {formatCurrency(metricasBanco?.resumo.valorHoje || 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Gráficos de Importação via Banco */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Importações por Dia
                      </CardTitle>
                      <CardDescription>
                        Quantidade de contas importadas via banco nos últimos 30 dias
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataDiaBanco.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartDataDiaBanco}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="contas" name="Contas" fill="#6366f1" />
                            <Bar dataKey="itens" name="Itens" fill="#a78bfa" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                            <p className="text-sm">Importe contas via banco para ver as métricas</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Valores por Dia
                      </CardTitle>
                      <CardDescription>
                        Valor total das contas importadas via banco
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartDataDiaBanco.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartDataDiaBanco}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" fontSize={12} />
                            <YAxis fontSize={12} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Area 
                              type="monotone" 
                              dataKey="valor" 
                              name="Valor" 
                              stroke="#6366f1" 
                              fill="#6366f1" 
                              fillOpacity={0.3} 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum dado disponível</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Importação por Convênio */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Importações por Convênio
                    </CardTitle>
                    <CardDescription>
                      Distribuição de contas importadas por convênio
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasBanco?.porConvenio && metricasBanco.porConvenio.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Convênio</TableHead>
                            <TableHead className="text-center">Contas</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasBanco.porConvenio.map((conv, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{conv.convenio}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{conv.totalContas}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{conv.totalItens}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(conv.valorTotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum dado por convênio disponível</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tabela de Produtividade por Usuário - Importação via Banco */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Produtividade por Usuário - Importação via Banco
                    </CardTitle>
                    <CardDescription>
                      Ranking de importações por usuário
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasBanco?.porUsuario && metricasBanco.porUsuario.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Usuário</TableHead>
                            <TableHead className="text-center">Contas</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-right">Média/Conta</TableHead>
                            <TableHead className="text-center">Última Importação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasBanco.porUsuario.map((usuario, index) => (
                            <TableRow key={usuario.userId}>
                              <TableCell>
                                {index === 0 ? (
                                  <Award className="h-5 w-5 text-yellow-500" />
                                ) : index === 1 ? (
                                  <Award className="h-5 w-5 text-gray-400" />
                                ) : index === 2 ? (
                                  <Award className="h-5 w-5 text-amber-700" />
                                ) : (
                                  <span className="text-muted-foreground">{index + 1}</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{usuario.userName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{usuario.totalContas}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{usuario.totalItens}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(usuario.valorTotal)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(usuario.mediaValorPorConta)}
                              </TableCell>
                              <TableCell className="text-center">
                                {usuario.ultimaImportacao ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(usuario.ultimaImportacao).toLocaleDateString("pt-BR")}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum dado de produtividade disponível</p>
                        <p className="text-sm mt-2">Importe contas via banco para ver as métricas por usuário</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Últimas Importações */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ArrowUpDown className="h-5 w-5" />
                      Últimas Importações
                    </CardTitle>
                    <CardDescription>
                      Últimas 20 contas importadas via integrador de dados
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metricasBanco?.ultimasImportacoes && metricasBanco.ultimasImportacoes.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Conta</TableHead>
                            <TableHead>Convênio</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Importado por</TableHead>
                            <TableHead>Data</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metricasBanco.ultimasImportacoes.map((imp, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium font-mono">{imp.numeroConta}</TableCell>
                              <TableCell>{imp.convenio || "-"}</TableCell>
                              <TableCell>{imp.paciente || "-"}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{imp.totalItens}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatCurrency(imp.valorTotal)}
                              </TableCell>
                              <TableCell>{imp.importadoPor}</TableCell>
                              <TableCell>
                                {imp.dataImportacao ? new Date(imp.dataImportacao).toLocaleString("pt-BR") : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhuma importação recente</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
