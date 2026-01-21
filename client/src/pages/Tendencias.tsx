import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  BarChart3,
  LineChart as LineChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Area,
} from "recharts";

export default function Tendencias() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [meses, setMeses] = useState(6);
  const [convenioId, setConvenioId] = useState<number | undefined>(undefined);

  const { data: tendenciasConvenio, isLoading: isLoadingConvenios } = trpc.tendencias.porConvenio.useQuery({
    meses,
    convenioId,
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const { data: tendenciaGeral, isLoading: isLoadingGeral } = trpc.tendencias.geral.useQuery({
    meses,
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const { data: convenios } = trpc.convenios.list.useQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getTendenciaIcon = (tendencia: "aumentando" | "diminuindo" | "estavel") => {
    switch (tendencia) {
      case "aumentando":
        return <TrendingUp className="h-5 w-5 text-red-500" />;
      case "diminuindo":
        return <TrendingDown className="h-5 w-5 text-green-500" />;
      default:
        return <Minus className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTendenciaBadge = (tendencia: "aumentando" | "diminuindo" | "estavel") => {
    switch (tendencia) {
      case "aumentando":
        return <Badge variant="destructive" className="flex items-center gap-1">
          <ArrowUpRight className="h-3 w-3" /> Aumentando
        </Badge>;
      case "diminuindo":
        return <Badge className="bg-green-500 flex items-center gap-1">
          <ArrowDownRight className="h-3 w-3" /> Diminuindo
        </Badge>;
      default:
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Minus className="h-3 w-3" /> Estável
        </Badge>;
    }
  };

  // Preparar dados para o gráfico geral
  const dadosGraficoGeral = tendenciaGeral?.map((t) => ({
    name: t.mesAno,
    faturado: t.valorFaturado,
    pago: t.valorPago,
    glosado: t.valorGlosado,
    percentual: t.percentualGlosa,
  })) || [];

  // Preparar dados para o gráfico comparativo de convênios
  const dadosComparativo = tendenciasConvenio?.map((conv) => {
    const ultimoMes = conv.tendencias[conv.tendencias.length - 1];
    return {
      name: conv.convenioNome,
      glosado: conv.totalGlosado,
      percentual: conv.mediaPercentualGlosa,
      tendencia: conv.tendenciaGlosa,
    };
  }) || [];

  // Preparar dados para o gráfico de linhas por convênio
  const cores = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
  const dadosLinhasConvenio: any[] = [];
  
  if (tendenciasConvenio && tendenciasConvenio.length > 0) {
    // Criar um mapa de meses
    const mesesSet = new Set<string>();
    tendenciasConvenio.forEach((conv) => {
      conv.tendencias.forEach((t) => {
        mesesSet.add(t.mesAno);
      });
    });

    const mesesOrdenados = Array.from(mesesSet).sort();
    
    mesesOrdenados.forEach((mesAno) => {
      const ponto: any = { name: mesAno };
      tendenciasConvenio.forEach((conv) => {
        const tendenciaMes = conv.tendencias.find((t) => t.mesAno === mesAno);
        ponto[conv.convenioNome] = tendenciaMes?.percentualGlosa || 0;
      });
      dadosLinhasConvenio.push(ponto);
    });
  }

  const isLoading = isLoadingConvenios || isLoadingGeral;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tendências de Glosa</h1>
            <p className="text-muted-foreground">
              Análise da evolução das glosas por convênio ao longo do tempo
            </p>
          </div>

          <div className="flex gap-3">
            <Select value={String(meses)} onValueChange={(v) => setMeses(Number(v))}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Últimos 3 meses</SelectItem>
                <SelectItem value="6">Últimos 6 meses</SelectItem>
                <SelectItem value="12">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={convenioId ? String(convenioId) : "all"} 
              onValueChange={(v) => setConvenioId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos os convênios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os convênios</SelectItem>
                {convenios?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resumo Geral */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Faturado ({meses} meses)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(tendenciaGeral?.reduce((acc, t) => acc + t.valorFaturado, 0) || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Pago ({meses} meses)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(tendenciaGeral?.reduce((acc, t) => acc + t.valorPago, 0) || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Glosado ({meses} meses)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(tendenciaGeral?.reduce((acc, t) => acc + t.valorGlosado, 0) || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Média % Glosa</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatPercent(
                    tendenciaGeral && tendenciaGeral.length > 0
                      ? tendenciaGeral.reduce((acc, t) => acc + t.percentualGlosa, 0) / tendenciaGeral.length
                      : 0
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gráfico de Evolução Geral */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Evolução Mensal</CardTitle>
            </div>
            <CardDescription>
              Comparativo entre valores faturados, pagos e glosados ao longo do tempo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[350px] w-full" />
            ) : dadosGraficoGeral.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={dadosGraficoGeral}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis 
                    yAxisId="left"
                    tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                    className="text-xs"
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right"
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    className="text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === "percentual") return [formatPercent(value), "% Glosa"];
                      return [formatCurrency(value), name === "faturado" ? "Faturado" : name === "pago" ? "Pago" : "Glosado"];
                    }}
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="faturado" name="Faturado" fill="#3b82f6" opacity={0.8} />
                  <Bar yAxisId="left" dataKey="pago" name="Pago" fill="#22c55e" opacity={0.8} />
                  <Bar yAxisId="left" dataKey="glosado" name="Glosado" fill="#ef4444" opacity={0.8} />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="percentual" 
                    name="% Glosa" 
                    stroke="#f59e0b" 
                    strokeWidth={3}
                    dot={{ fill: "#f59e0b", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Tendência por Convênio */}
        {tendenciasConvenio && tendenciasConvenio.length > 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Evolução % Glosa por Convênio</CardTitle>
              </div>
              <CardDescription>
                Comparativo da evolução do percentual de glosa entre convênios
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[350px] w-full" />
              ) : dadosLinhasConvenio.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={dadosLinhasConvenio}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis 
                      tickFormatter={(value) => `${value.toFixed(0)}%`}
                      className="text-xs"
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatPercent(value), "% Glosa"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    {tendenciasConvenio.map((conv, index) => (
                      <Line
                        key={conv.convenioId}
                        type="monotone"
                        dataKey={conv.convenioNome}
                        stroke={cores[index % cores.length]}
                        strokeWidth={2}
                        dot={{ fill: cores[index % cores.length], strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Nenhum dado disponível para o período selecionado
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cards por Convênio */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Detalhes por Convênio</h2>
          
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[200px] w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tendenciasConvenio && tendenciasConvenio.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tendenciasConvenio.map((conv) => (
                <Card key={conv.convenioId} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{conv.convenioNome}</CardTitle>
                      {getTendenciaBadge(conv.tendenciaGlosa)}
                    </div>
                    <CardDescription>
                      Média de glosa: {formatPercent(conv.mediaPercentualGlosa)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Mini gráfico */}
                    <div className="h-[120px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={conv.tendencias}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mesAno" tick={false} />
                          <YAxis 
                            tickFormatter={(value) => `${value.toFixed(0)}%`}
                            className="text-xs"
                            width={40}
                          />
                          <Tooltip 
                            formatter={(value: number) => [formatPercent(value), "% Glosa"]}
                            labelFormatter={(label) => label}
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))", 
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px"
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="percentualGlosa" 
                            fill={conv.tendenciaGlosa === "aumentando" ? "#fecaca" : conv.tendenciaGlosa === "diminuindo" ? "#bbf7d0" : "#e5e7eb"}
                            stroke={conv.tendenciaGlosa === "aumentando" ? "#ef4444" : conv.tendenciaGlosa === "diminuindo" ? "#22c55e" : "#6b7280"}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Resumo */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Faturado</p>
                        <p className="font-semibold text-blue-600">{formatCurrency(conv.totalFaturado)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Glosado</p>
                        <p className="font-semibold text-red-600">{formatCurrency(conv.totalGlosado)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
                Nenhum dado de tendência disponível para o período selecionado.
                Importe arquivos XML enviados e retornados para ver as tendências.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
