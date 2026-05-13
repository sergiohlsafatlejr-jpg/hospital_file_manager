import { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import {
  DollarSign, BarChart3, Loader2, Receipt, AlertCircle, RefreshCcw,
  FileWarning, CalendarClock, FolderOpen, Shield, CheckCircle2, Clock, XCircle
} from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import ChartCard from "@/components/dashboard/ChartCard";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarMesAno(periodo: string) {
  if (!periodo || periodo.length !== 7) return periodo;
  const [ano, mes] = periodo.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[parseInt(mes) - 1]}/${ano}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
}

const COLORS = [
  "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48"
];

const STATUS_COLORS: Record<string, string> = {
  DEFINITIVO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  PROVISORIO: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  PERDA: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  OUTROS: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1 max-w-[280px] truncate">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">
            {typeof p.value === "number" && p.name !== "Qtd" ? formatCurrency(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{d.name}</p>
      <p>Valor: {formatCurrency(d.value)}</p>
      <p>Qtd: {d.payload.qtd}</p>
    </div>
  );
};

export default function RelatorioProtocolos() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [carregado, setCarregado] = useState(false);
  const [selectedPeriodos, setSelectedPeriodos] = useState<string[]>([]);

  // Carregar períodos disponíveis automaticamente
  const { data: periodosData } = trpc.tasy.getProtocoloPeriodos.useQuery(
    { estabelecimentoId },
    { staleTime: 60_000, enabled: estabelecimentoId > 0 }
  );

  // Resetar seleção ao trocar de estabelecimento
  useEffect(() => {
    setSelectedPeriodos([]);
    setCarregado(false);
  }, [estabelecimentoId]);

  // Quando períodos carregam, selecionar todos por padrão
  useEffect(() => {
    if (periodosData && periodosData.length > 0 && selectedPeriodos.length === 0) {
      setSelectedPeriodos(periodosData.map((p: any) => p.periodo));
    }
  }, [periodosData]);

  const { data, isLoading, error, refetch } = trpc.tasy.getDashboardProtocolos.useQuery(
    { estabelecimentoId, periodos: selectedPeriodos },
    { enabled: carregado && selectedPeriodos.length > 0 }
  );

  // Query dedicada para Previsão de Recebimentos (aba BI)
  const { data: previsaoData } = trpc.tasy.getPrevisaoRecebimentos.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 && carregado, staleTime: 120_000 }
  );

  const handleCarregar = () => {
    setCarregado(true);
  };

  const togglePeriodo = (periodo: string) => {
    setSelectedPeriodos(prev =>
      prev.includes(periodo) ? prev.filter(p => p !== periodo) : [...prev, periodo]
    );
  };

  const toggleAll = () => {
    if (!periodosData) return;
    if (selectedPeriodos.length === periodosData.length) {
      setSelectedPeriodos([]);
    } else {
      setSelectedPeriodos(periodosData.map((p: any) => p.periodo));
    }
  };

  // ============ DADOS MEMORIZADOS ============

  const chartConvenio = useMemo(() => {
    if (!data?.porConvenio) return [];
    return data.porConvenio.slice(0, 12).map((c: any) => ({
      name: c.convenio.length > 22 ? c.convenio.substring(0, 22) + "..." : c.convenio,
      Faturado: c.faturado,
      Qtd: c.qtdProtocolos,
    }));
  }, [data]);

  const chartPrevisao = useMemo(() => {
    if (!data?.previsaoRecebimentos) return [];
    return data.previsaoRecebimentos.map((v: any) => ({
      name: v.mes,
      Valor: v.valor,
      Qtd: v.qtd,
    }));
  }, [data]);

  const chartTipo = useMemo(() => {
    if (!data?.porTipo) return [];
    return data.porTipo.map((t: any) => ({
      name: t.tipo,
      value: t.valor,
      qtd: t.qtd,
    }));
  }, [data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-card-foreground flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" />
              Acompanhamento de Protocolos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Relatório de protocolos TASY — Faturamento, pagamentos e pendências
            </p>
          </div>
        </div>

        {/* Controles + Filtro de Períodos */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <Button onClick={handleCarregar} disabled={isLoading || selectedPeriodos.length === 0}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                {carregado ? "Atualizar Dados" : "Carregar Relatório"}
              </Button>
              {selectedPeriodos.length === 0 && (
                <span className="text-sm text-amber-600">Selecione ao menos um período abaixo</span>
              )}
            </div>

            {/* Filtro de Períodos */}
            {periodosData && periodosData.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> Referência (DT_MESANO_REFERENCIA)
                  </label>
                  <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
                    {selectedPeriodos.length === periodosData.length ? "Desmarcar Todos" : "Selecionar Todos"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {periodosData.map((p: any) => {
                    const isSelected = selectedPeriodos.includes(p.periodo);
                    return (
                      <button
                        key={p.periodo}
                        onClick={() => { togglePeriodo(p.periodo); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePeriodo(p.periodo)}
                          className="h-3.5 w-3.5"
                        />
                        {formatarMesAno(p.periodo)}
                        <span className="text-[10px] opacity-60">({p.qtd})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && carregado && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-32 rounded-xl" />))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}

        {/* Empty state */}
        {!carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Receipt className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Clique em "Carregar Relatório" para ver os protocolos</p>
            <p className="text-sm mt-1">Dados extraídos da tabela tasy_protocolo_bi</p>
          </div>
        )}

        {/* Error */}
        {error && carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertCircle className="h-16 w-16 mb-4 opacity-30 text-red-500" />
            <p className="text-lg text-red-400 font-medium">Erro ao carregar dados</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {/* Dashboard */}
        {data && !isLoading && !error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard title="Valor Total Protocolado" value={formatCurrency(data.kpis.totalGeral)} subtitle={`${data.kpis.totalProtocolos} protocolos`} icon={DollarSign} gradient="blue" />
              <KpiCard title="Definitivos" value={String(data.kpis.totalDefinitivo)} subtitle="Protocolos definitivos" icon={CheckCircle2} gradient="emerald" />
              <KpiCard title="Provisórios" value={String(data.kpis.totalProvisorio)} subtitle="Aguardando fechamento" icon={Clock} gradient="amber" />
              <KpiCard title="Sem Título" value={String(data.kpis.totalSemTitulo)} subtitle="Sem NR_TITULO ou DOC_CONV" icon={FileWarning} gradient="amber" />
              <KpiCard title="Convênios" value={String(data.porConvenio.length)} subtitle="Convênios com protocolos" icon={Shield} gradient="blue" />
            </div>

            {/* ABAS */}
            <Tabs defaultValue="convenio" className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="convenio" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Por Convênio
                </TabsTrigger>
                <TabsTrigger value="previsao" className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" /> Previsão Recebimentos
                </TabsTrigger>
                <TabsTrigger value="tipo" className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" /> Por Tipo
                </TabsTrigger>
                <TabsTrigger value="sem-titulo" className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4" /> Sem Título ({data.kpis.totalSemTitulo})
                </TabsTrigger>
              </TabsList>

              {/* ============ ABA 1: POR CONVÊNIO ============ */}
              <TabsContent value="convenio" className="space-y-6 outline-none">
                <ChartCard title="Valor Protocolado por Convênio (Top 12)" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={380}>
                    <ComposedChart data={chartConvenio} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                      <XAxis type="number" tickFormatter={formatCompact} />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="Faturado" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={16} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                <Card className="border border-border/50 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-card">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" /> Detalhamento por Convênio
                    </h3>
                  </div>
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader className="bg-muted/30 sticky top-0">
                        <TableRow>
                          <TableHead>Convênio</TableHead>
                          <TableHead className="text-right">Valor Faturado</TableHead>
                          <TableHead className="text-center">Protocolos</TableHead>
                          <TableHead className="text-center">Definitivo</TableHead>
                          <TableHead className="text-center">Provisório</TableHead>
                          <TableHead className="text-center">Perda</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.porConvenio.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.convenio}</TableCell>
                            <TableCell className="text-right font-medium text-blue-600">{formatCurrency(item.faturado)}</TableCell>
                            <TableCell className="text-center">{item.qtdProtocolos}</TableCell>
                            <TableCell className="text-center">
                              {item.definitivo > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">{item.definitivo}</Badge>}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.provisorio > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{item.provisorio}</Badge>}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.perda > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">{item.perda}</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>

              {/* ============ ABA 2: PREVISÃO DE RECEBIMENTOS (BI) ============ */}
              <TabsContent value="previsao" className="space-y-6 outline-none">
                {previsaoData ? (
                  <>
                    {/* KPIs da Previsão */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <KpiCard title="Total Faturado" value={formatCurrency(previsaoData.resumo.totalFaturado || 0)} subtitle={`${previsaoData.resumo.qtdProtocolos || 0} protocolos`} icon={DollarSign} gradient="blue" />
                      <KpiCard title="Projeção c/ Vencimento" value={formatCurrency(previsaoData.resumo.totalProjetado || 0)} subtitle="Com título vinculado" icon={CalendarClock} gradient="emerald" />
                      <KpiCard title="Sem Vencimento" value={formatCurrency(previsaoData.resumo.totalSemVencimento || 0)} subtitle="Sem título atrelado" icon={AlertCircle} gradient="amber" />
                      <KpiCard title="% Cobertura" value={previsaoData.resumo.totalFaturado > 0 ? `${((previsaoData.resumo.totalProjetado / previsaoData.resumo.totalFaturado) * 100).toFixed(1)}%` : '0%'} subtitle="Protocolos com projeção" icon={Shield} gradient="blue" />
                    </div>

                    {/* Gráfico - Faturado por Competência */}
                    <ChartCard title="Faturado por Competência (DT_MESANO_REFERENCIA)" icon={BarChart3}>
                      <ResponsiveContainer width="100%" height={350}>
                        <ComposedChart data={previsaoData.porMesReferencia.map((m: any) => ({ name: formatarMesAno(m.mes), Faturado: m.valor, Qtd: m.qtd }))}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar dataKey="Faturado" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    {/* Gráfico - Projeção por Vencimento */}
                    <ChartCard title="Projeção de Recebimento (VENC_TITULO)" icon={CalendarClock}>
                      <ResponsiveContainer width="100%" height={350}>
                        <AreaChart data={previsaoData.porMesVencimento.map((m: any) => ({ name: formatarMesAno(m.mes), Projetado: m.valor, Qtd: m.qtd }))} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <defs>
                            <linearGradient id="colorProj" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Area type="monotone" dataKey="Projetado" stroke="#059669" fillOpacity={1} fill="url(#colorProj)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    {/* Tabela por Convênio */}
                    <Card className="border border-border/50 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b bg-card">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Shield className="h-4 w-4 text-blue-500" /> Detalhamento por Convênio
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">Comparativo entre faturado e projeção de recebimento por convênio</p>
                      </div>
                      <div className="overflow-auto max-h-[600px]">
                        <Table>
                          <TableHeader className="bg-muted/30 sticky top-0">
                            <TableRow>
                              <TableHead>Convênio</TableHead>
                              <TableHead className="text-right">Valor Faturado</TableHead>
                              <TableHead className="text-right">Projeção Recebimento</TableHead>
                              <TableHead className="text-center">Protocolos</TableHead>
                              <TableHead className="text-right">Sem Vencimento</TableHead>
                              <TableHead className="text-center">Cobertura</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previsaoData.porConvenio.map((c: any, i: number) => {
                              const semVenc = c.valorRef - c.valorProj;
                              const cobertura = c.valorRef > 0 ? ((c.valorProj / c.valorRef) * 100) : 0;
                              return (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{c.convenio}</TableCell>
                                  <TableCell className="text-right font-medium text-blue-600">{formatCurrency(c.valorRef)}</TableCell>
                                  <TableCell className="text-right font-medium text-emerald-600">{formatCurrency(c.valorProj)}</TableCell>
                                  <TableCell className="text-center">{c.qtd}</TableCell>
                                  <TableCell className="text-right">
                                    <span className={semVenc > 0 ? 'text-amber-600' : 'text-muted-foreground'}>{formatCurrency(semVenc)}</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                      cobertura >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                      cobertura >= 40 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    }`}>
                                      {cobertura.toFixed(0)}%
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p>Carregando previsão de recebimentos...</p>
                  </div>
                )}
              </TabsContent>

              {/* ============ ABA 3: POR TIPO ============ */}
              <TabsContent value="tipo" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Distribuição por Tipo de Protocolo" icon={FolderOpen}>
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart>
                        <Pie
                          data={chartTipo}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={120}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {chartTipo.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <Card className="border border-border/50 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b bg-card">
                      <h3 className="font-semibold flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-violet-500" /> Valores por Tipo
                      </h3>
                    </div>
                    <div className="overflow-auto max-h-[400px]">
                      <Table>
                        <TableHeader className="bg-muted/30 sticky top-0">
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-center">Qtd.</TableHead>
                            <TableHead className="text-right">% do Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.porTipo.map((item: any, idx: number) => {
                            const perc = data.kpis.totalGeral > 0 ? (item.valor / data.kpis.totalGeral) * 100 : 0;
                            return (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    {item.tipo}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(item.valor)}</TableCell>
                                <TableCell className="text-center">{item.qtd}</TableCell>
                                <TableCell className="text-right">
                                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                    {perc.toFixed(1)}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* ============ ABA 4: SEM TÍTULO ============ */}
              <TabsContent value="sem-titulo" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <KpiCard
                    title="Protocolos Sem Título"
                    value={String(data.kpis.totalSemTitulo)}
                    subtitle={`${((data.kpis.totalSemTitulo / data.kpis.totalProtocolos) * 100).toFixed(1)}% do total`}
                    icon={FileWarning}
                    gradient="amber"
                  />
                  <KpiCard
                    title="Valor em Risco"
                    value={formatCurrency(data.semTitulo.reduce((acc: number, s: any) => acc + s.valor, 0))}
                    subtitle="Protocolos sem título/doc convênio"
                    icon={XCircle}
                    gradient="amber"
                  />
                  <KpiCard
                    title="Convênios Afetados"
                    value={String(new Set(data.semTitulo.map((s: any) => s.convenio)).size)}
                    subtitle="Com protocolos pendentes"
                    icon={AlertCircle}
                    gradient="blue"
                  />
                </div>

                <Card className="border border-border/50 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-card">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FileWarning className="h-4 w-4 text-amber-500" />
                      Protocolos sem NR_TITULO ou DOC_CONV
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Estes protocolos precisam de atenção — não possuem título gerado ou documento de convênio vinculado
                    </p>
                  </div>
                  <div className="overflow-auto max-h-[600px]">
                    <Table>
                      <TableHeader className="bg-muted/30 sticky top-0">
                        <TableRow>
                          <TableHead>Convênio</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Protocolo</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Emissão</TableHead>
                          <TableHead>Venc. Prot.</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Doc Conv.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.semTitulo.slice(0, 200).map((item: any, idx: number) => (
                          <TableRow key={idx} className="hover:bg-amber-50/50 dark:hover:bg-amber-900/10">
                            <TableCell className="font-medium max-w-[150px] truncate">{item.convenio}</TableCell>
                            <TableCell className="text-xs">{item.tipo}</TableCell>
                            <TableCell>
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.OUTROS}`}>
                                {item.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs max-w-[180px] truncate">{item.protocolo}</TableCell>
                            <TableCell className="text-right font-medium text-amber-600">{formatCurrency(item.valor)}</TableCell>
                            <TableCell className="text-xs">{item.dtEmissao}</TableCell>
                            <TableCell className="text-xs">{item.vencProt}</TableCell>
                            <TableCell>
                              {item.nrTitulo ? (
                                <span className="text-xs">{item.nrTitulo}</span>
                              ) : (
                                <Badge variant="outline" className="bg-red-50 text-red-600 text-xs dark:bg-red-900/20 dark:text-red-400">VAZIO</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.docConv ? (
                                <span className="text-xs">{item.docConv}</span>
                              ) : (
                                <Badge variant="outline" className="bg-red-50 text-red-600 text-xs dark:bg-red-900/20 dark:text-red-400">VAZIO</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {data.semTitulo.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                              Todos os protocolos possuem título e documento de convênio!
                            </TableCell>
                          </TableRow>
                        )}
                        {data.semTitulo.length > 200 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-4">
                              Exibindo 200 de {data.semTitulo.length} registros
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
