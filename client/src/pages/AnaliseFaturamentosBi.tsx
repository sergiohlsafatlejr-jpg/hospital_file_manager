import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { MetricCard } from "@/components/bi/MetricCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, AlertCircle, CheckCircle2, AlertTriangle, Clock,
  Search, Wand2, TrendingDown, Calendar, Filter, ArrowLeft,
  Stethoscope, FileX, BarChart3, Building2, Package, Users
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Cell
} from "recharts";

function fmtCur(value: number): string {
  if (!value || isNaN(value)) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtK(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return fmtCur(value);
}
function pctBar(value: number, max: number) {
  return max > 0 ? Math.min(100, (value / max) * 100) : 0;
}

const CHART_COLORS = {
  faturado: "#6366f1",
  recebido: "#22c55e",
  glosado: "#ef4444",
  pct: "#f59e0b",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs space-y-1.5">
      <p className="font-bold text-white mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-white">
            {p.name === "% Glosa" ? `${p.value}%` : fmtK(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function AnaliseFaturamentosBi() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [, setLocation] = useLocation();

  const [anoSelecionado, setAnoSelecionado] = useState<string>("todos");
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState<string>("todas");
  const [convenioSelecionado, setConvenioSelecionado] = useState<string>("todos");
  const [setorSelecionado, setSetorSelecionado] = useState<string>("todos");
  const [tipoItemSelecionado, setTipoItemSelecionado] = useState<string>("todos");
  const [buscaItem, setBuscaItem] = useState("");

  const { data, isLoading } = trpc.tasy.getFaturamentoItensBi.useQuery({
    estabelecimentoId,
    ano: anoSelecionado !== "todos" ? anoSelecionado : undefined,
    competencia: competenciaSelecionada !== "todas" ? competenciaSelecionada : undefined,
    convenio: convenioSelecionado !== "todos" ? convenioSelecionado : undefined,
    setor: setorSelecionado !== "todos" ? setorSelecionado : undefined,
    tipoItem: tipoItemSelecionado !== "todos" ? tipoItemSelecionado : undefined,
  }, {
    enabled: estabelecimentoId > 0,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const anosDisponiveis = useMemo(() => {
    if (!data?.competencias) return [];
    const anos = new Set((data.competencias as string[]).map((c) => c.split("/")[0]));
    return Array.from(anos).sort((a, b) => b.localeCompare(a));
  }, [data?.competencias]);

  const competenciasDisponiveis = useMemo(() => {
    if (!data?.competencias) return [];
    if (anoSelecionado === "todos") return data.competencias as string[];
    return (data.competencias as string[]).filter((c) => c.startsWith(anoSelecionado + "/"));
  }, [data?.competencias, anoSelecionado]);

  function handleAnoChange(ano: string) {
    setAnoSelecionado(ano);
    setCompetenciaSelecionada("todas");
  }

  const kpis = (data?.resumo as any) || {};
  const totalGlosado = kpis.totalGlosado || 0;
  const maxMotivo = (data?.topMotivos as any[])?.[0]?.vl_glosa || 1;
  const maxConvenio = (data?.porConvenio as any[])?.[0]?.glosado || 1;

  // Agrupar evolução em chunks menores para o gráfico
  const evolucaoChart = useMemo(() => {
    if (!data?.evolucaoMensal) return [];
    return (data.evolucaoMensal as any[]).map((r) => ({
      ...r,
      competencia: r.competencia?.replace(/(\d{4})\/(\d{2})/, "$2/$1") ?? r.competencia,
    }));
  }, [data?.evolucaoMensal]);

  const topGlosasFiltradas = useMemo(() => {
    if (!data?.topGlosas) return [];
    const arr = data.topGlosas as any[];
    if (!buscaItem.trim()) return arr;
    const t = buscaItem.toLowerCase();
    return arr.filter((g) =>
      g.descricao?.toLowerCase().includes(t) ||
      g.convenio?.toLowerCase().includes(t) ||
      g.codigo?.toLowerCase().includes(t) ||
      g.setor?.toLowerCase().includes(t)
    );
  }, [data?.topGlosas, buscaItem]);

  if (!estabelecimentoId) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-muted-foreground">Selecione um estabelecimento para continuar.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto" />
            <p className="mt-4 text-muted-foreground text-sm">Processando dados de faturamento...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 pb-24">

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg"
              onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4" /><span className="text-sm">Voltar</span>
            </Button>
            <div className="border-l border-border h-8" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Faturamento Geral <span className="text-indigo-400">(Por Item)</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {kpis.qtdTotal?.toLocaleString("pt-BR")} itens · {kpis.qtdGlosados?.toLocaleString("pt-BR")} glosados
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { icon: Calendar, value: anoSelecionado, onChange: handleAnoChange, placeholder: "Ano", w: "w-[100px]",
                items: [{ value: "todos", label: "Todos os Anos" }, ...anosDisponiveis.map(a => ({ value: a, label: a }))] },
              { icon: Filter, value: competenciaSelecionada, onChange: setCompetenciaSelecionada, placeholder: "Competência", w: "w-[130px]",
                items: [{ value: "todas", label: "Todas" }, ...competenciasDisponiveis.map(c => ({ value: c, label: c }))] },
              { icon: Building2, value: convenioSelecionado, onChange: setConvenioSelecionado, placeholder: "Convênio", w: "w-[150px]",
                items: [{ value: "todos", label: "Todos" }, ...(data?.convenios as string[] || []).map(c => ({ value: c, label: c }))] },
              { icon: Users, value: setorSelecionado, onChange: setSetorSelecionado, placeholder: "Setor", w: "w-[140px]",
                items: [{ value: "todos", label: "Todos Setores" }, ...(data?.setores as string[] || []).map(s => ({ value: s, label: s }))] },
              { icon: Package, value: tipoItemSelecionado, onChange: setTipoItemSelecionado, placeholder: "Tipo", w: "w-[120px]",
                items: [{ value: "todos", label: "Todos Tipos" }, { value: "PROC/TAXA", label: "Proc/Taxa" }, { value: "MAT/MED", label: "Mat/Med" }] },
            ].map((f, i) => (
              <div key={i} className={`flex items-center gap-1.5 bg-card/60 border rounded-lg px-2.5 py-1.5 transition-colors ${
                f.value !== 'todos' && f.value !== 'todas' ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-border'
              }`}>
                <f.icon className={`h-3.5 w-3.5 flex-shrink-0 ${
                  f.value !== 'todos' && f.value !== 'todas' ? 'text-indigo-400' : 'text-muted-foreground'
                }`} />
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger className={`h-7 ${f.w} border-0 bg-transparent focus:ring-0 text-xs font-medium p-0`}>
                    <SelectValue placeholder={f.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.items.map(it => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {/* Limpar todos os filtros */}
            {(anoSelecionado !== 'todos' || competenciaSelecionada !== 'todas' || convenioSelecionado !== 'todos' || setorSelecionado !== 'todos' || tipoItemSelecionado !== 'todos') && (
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-muted-foreground hover:text-white hover:bg-white/10 gap-1 border border-dashed border-border rounded-lg"
                onClick={() => { setAnoSelecionado('todos'); setCompetenciaSelecionada('todas'); setConvenioSelecionado('todos'); setSetorSelecionado('todos'); setTipoItemSelecionado('todos'); }}>
                ✕ <span>Limpar Filtros</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <MetricCard title="Faturado" value={fmtCur(kpis.totalFaturado ?? 0)}
            subtitle="Definitivos (STATUS_PROT = 2)"
            icon={DollarSign} variant="primary" delay={0.05} active={true} />
          <MetricCard title="Provisório" value={fmtCur(kpis.totalProvisorio ?? 0)}
            subtitle="Provisórios (STATUS_PROT = 1)"
            icon={AlertCircle} variant="warning" delay={0.10} active={true} />
          <MetricCard title="Recebido" value={fmtCur(kpis.totalRecebido ?? 0)}
            subtitle={`${((kpis.totalRecebido / Math.max(kpis.totalFaturado, 1)) * 100).toFixed(1)}% do faturado`}
            icon={CheckCircle2} variant="success" delay={0.15} active={true} />
          <MetricCard title="Glosado" value={fmtCur(kpis.totalGlosado ?? 0)}
            subtitle={`${kpis.taxaGlosa?.toFixed(1)}% de perdas`}
            icon={AlertTriangle} variant="danger" delay={0.20} active={true} />
          <MetricCard title="A Receber" value={fmtCur(Math.abs(kpis.totalAReceber ?? 0))}
            subtitle="Saldo pendente (Contas Tasy)"
            icon={Clock} variant="warning" delay={0.25} active={true} />
          <MetricCard title="Taxa de Glosa" value={`${kpis.taxaGlosa?.toFixed(2) ?? 0}%`}
            subtitle={`${kpis.qtdGlosados?.toLocaleString("pt-BR")} itens glosados`}
            icon={TrendingDown} variant="warning" delay={0.30} active={true} />
          <MetricCard title="Honorários" value={fmtCur(kpis.totalMedico ?? 0)}
            subtitle="Médico executante"
            icon={Stethoscope} variant="primary" delay={0.35} active={true} />
        </div>

        {/* ── TABELAS CONSOLIDADAS (DASHBOARD GERAL) ────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tabela por Competência */}
          <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col">
            <CardHeader className="border-b border-border p-4 bg-gradient-to-r from-blue-500/10 to-transparent">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-400" /> Valores por Competência
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-[320px]">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10 border-b">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-xs h-9">Competência</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">Faturado</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">VL Recebido</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9 text-rose-400">Valor Glosado</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">A Receber</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">% Glosa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evolucaoChart.map((r: any, i: number) => (
                      <TableRow key={i} className="hover:bg-muted/30 transition-colors border-border/50">
                        <TableCell className="text-xs py-2.5 font-medium">{r.competencia}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-indigo-400 font-medium">{fmtCur(r.faturado)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-emerald-400 font-medium">{fmtCur(r.recebido)}</TableCell>
                        <TableCell className={`text-right text-xs py-2.5 font-bold ${r.glosado > 0 ? 'bg-rose-500/10 text-rose-500' : 'text-muted-foreground'}`}>{fmtCur(r.glosado)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-amber-400 font-medium">{fmtCur(r.aReceber)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-bold text-white">{r.pct_glosa?.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="hover:bg-transparent border-t-2 border-border/80 bg-muted/20">
                      <TableCell className="text-xs py-2.5 font-bold text-rose-500">Total</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalFaturado)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalRecebido)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalGlosado)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalAReceber)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{kpis.taxaGlosa?.toFixed(2)}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Tabela por Convênio */}
          <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col">
            <CardHeader className="border-b border-border p-4 bg-gradient-to-r from-emerald-500/10 to-transparent">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-400" /> Valores por Convênio
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-[320px]">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10 border-b">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-xs h-9">Convênio</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">Faturado</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">VL Recebido</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9 text-rose-400">Valor Glosado</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">A Receber</TableHead>
                      <TableHead className="text-right font-semibold text-xs h-9">% Glosa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.porConvenio as any[] || []).map((r: any, i: number) => (
                      <TableRow key={i} className="hover:bg-muted/30 transition-colors border-border/50">
                        <TableCell className="text-xs py-2.5 font-medium max-w-[120px] truncate" title={r.convenio}>{r.convenio}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-indigo-400 font-medium">{fmtCur(r.faturado)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-emerald-400 font-medium">{fmtCur(r.recebido)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-rose-500 font-bold">{fmtCur(r.glosado)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 text-amber-400 font-medium">{fmtCur(r.aReceber)}</TableCell>
                        <TableCell className="text-right text-xs py-2.5 font-bold text-white">{r.pct_glosa?.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="hover:bg-transparent border-t-2 border-border/80 bg-muted/20">
                      <TableCell className="text-xs py-2.5 font-bold text-rose-500">Total</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalFaturado)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalRecebido)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalGlosado)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{fmtCur(kpis.totalAReceber)}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 font-bold text-rose-500">{kpis.taxaGlosa?.toFixed(2)}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ── GRÁFICO EVOLUÇÃO MENSAL ───────────────────────────────────────── */}
        <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border p-5 bg-gradient-to-r from-indigo-500/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg"><BarChart3 className="h-5 w-5 text-indigo-400" /></div>
              <div>
                <CardTitle className="text-base font-semibold">Evolução Mensal — Faturado × Recebido × Glosado</CardTitle>
                <CardDescription className="text-xs mt-0.5">Comparação mensal com taxa de glosa (%) — linha secundária</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={evolucaoChart} margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="competencia" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={70} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#f59e0b" }} tickLine={false} axisLine={false} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar yAxisId="left" dataKey="faturado" name="Faturado" fill={CHART_COLORS.faturado} radius={[3,3,0,0]} maxBarSize={28} />
                <Bar yAxisId="left" dataKey="recebido" name="Recebido" fill={CHART_COLORS.recebido} radius={[3,3,0,0]} maxBarSize={28} />
                <Bar yAxisId="left" dataKey="glosado" name="Glosado" fill={CHART_COLORS.glosado} radius={[3,3,0,0]} maxBarSize={28} />
                <Line yAxisId="right" type="monotone" dataKey="pct_glosa" name="% Glosa" stroke={CHART_COLORS.pct} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.pct }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── ANÁLISE MULTIDIMENSIONAL ──────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Motivos de Glosa */}
          <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col">
            <CardHeader className="border-b border-border p-5 bg-gradient-to-r from-rose-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/20 rounded-lg"><AlertCircle className="h-5 w-5 text-rose-500" /></div>
                <div>
                  <CardTitle className="text-base font-semibold">Top Motivos de Glosa</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Hierarquia financeira das perdas no período</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-[380px]">
                <div className="p-4 space-y-3">
                  {(data?.topMotivos as any[])?.map((m, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Badge variant="secondary" className="text-[10px] font-mono mt-0.5 flex-shrink-0">{m.qtd_glosada}x</Badge>
                          <span className="text-xs leading-tight text-foreground/90" title={m.motivo}>{m.motivo}</span>
                        </div>
                        <span className="text-xs font-bold text-rose-500 flex-shrink-0">{fmtK(m.vl_glosa)}</span>
                      </div>
                      <Progress value={pctBar(m.vl_glosa, maxMotivo)} className="h-1.5 bg-muted" />
                    </div>
                  ))}
                  {(!data?.topMotivos || (data.topMotivos as any[]).length === 0) && (
                    <p className="text-center text-muted-foreground text-sm py-8">Nenhum motivo de glosa.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Ranking de Convênios — clicável para filtrar */}
          <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden flex flex-col">
            <CardHeader className="border-b border-border p-5 bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg"><Building2 className="h-5 w-5 text-amber-400" /></div>
                  <div>
                    <CardTitle className="text-base font-semibold">Top Convênios por Glosa</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Clique na barra para filtrar o dashboard
                      {convenioSelecionado !== 'todos' && <span className="ml-2 text-amber-400 font-semibold">· {convenioSelecionado}</span>}
                    </CardDescription>
                  </div>
                </div>
                {convenioSelecionado !== 'todos' && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-white"
                    onClick={() => setConvenioSelecionado('todos')}>✕ Limpar</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={(data?.porConvenio as any[] || []).slice(0, 10)} layout="vertical" margin={{ left: 0, right: 60, top: 0, bottom: 0 }}
                  onClick={(e) => { if (e?.activePayload?.[0]) setConvenioSelecionado(e.activePayload[0].payload.convenio); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="convenio" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={110}
                    tickFormatter={(v) => v.length > 18 ? v.substring(0, 16) + "…" : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="glosado" name="Glosado" radius={[0,4,4,0]} maxBarSize={16} cursor="pointer">
                    {(data?.porConvenio as any[] || []).slice(0, 10).map((row: any, idx: number) => (
                      <Cell key={idx}
                        fill={row.convenio === convenioSelecionado ? '#ffffff' : idx === 0 ? '#ef4444' : idx < 3 ? '#f97316' : '#f59e0b'}
                        opacity={convenioSelecionado !== 'todos' && row.convenio !== convenioSelecionado ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── ANÁLISE POR DIMENSÃO (TABS) ────────────────────────────────────── */}
        <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border p-5 bg-gradient-to-r from-purple-500/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg"><BarChart3 className="h-5 w-5 text-purple-400" /></div>
              <div>
                <CardTitle className="text-base font-semibold">Análise por Dimensão</CardTitle>
                <CardDescription className="text-xs mt-0.5">Setor · Tipo de Item · Profissional</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="setor">
              <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10">
                {[
                  { value: "setor", label: "Por Setor" },
                  { value: "tipo", label: "Por Tipo de Item" },
                  { value: "profissional", label: "Por Profissional" },
                ].map(t => (
                  <TabsTrigger key={t.value} value={t.value}
                    className="flex-1 rounded-none text-xs data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:text-white">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Por Setor — clicável como filtro */}
              <TabsContent value="setor" className="m-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Clique em uma linha para filtrar o dashboard</span>
                  {setorSelecionado !== 'todos' && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-white gap-1"
                      onClick={() => setSetorSelecionado('todos')}>✕ Limpar filtro: <strong>{setorSelecionado.substring(0,25)}</strong></Button>
                  )}
                </div>
                <ScrollArea className="h-[310px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs h-9">Setor</TableHead>
                        <TableHead className="text-right text-xs h-9">Faturado</TableHead>
                        <TableHead className="text-right text-xs h-9">Glosado</TableHead>
                        <TableHead className="text-xs w-32 h-9">% Glosa</TableHead>
                        <TableHead className="text-right text-xs h-9">Itens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.porSetor as any[])?.map((row, i) => (
                        <TableRow key={i}
                          className={`hover:bg-indigo-500/10 border-border/50 cursor-pointer transition-colors ${
                            setorSelecionado === row.setor ? 'bg-indigo-500/15 border-l-2 border-l-indigo-500' : ''
                          }`}
                          onClick={() => setSetorSelecionado(setorSelecionado === row.setor ? 'todos' : row.setor)}>
                          <TableCell className="text-xs py-2 font-medium">
                            {setorSelecionado === row.setor && <span className="text-indigo-400 mr-1">▶</span>}
                            {row.setor}
                          </TableCell>
                          <TableCell className="text-right text-xs py-2 text-indigo-400">{fmtCur(row.faturado)}</TableCell>
                          <TableCell className="text-right text-xs py-2 text-rose-500 font-semibold">{fmtCur(row.glosado)}</TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(100, row.pct_glosa)} className="h-1.5 flex-1" />
                              <span className="text-[10px] text-muted-foreground w-10 text-right">{row.pct_glosa?.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs py-2 text-muted-foreground">{row.qtd_itens?.toLocaleString("pt-BR")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Por Tipo de Item */}
              <TabsContent value="tipo" className="m-0">
                <div className="p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {(data?.porTipoItem as any[])?.map((row, i) => (
                      <div key={i} className="bg-muted/30 rounded-xl p-5 border border-border/50 space-y-4">
                        <div className="flex items-center justify-between">
                          <Badge variant={row.tipo_item === "MAT/MED" ? "secondary" : "outline"} className="text-xs font-mono">{row.tipo_item}</Badge>
                          <span className="text-xs text-muted-foreground">{row.qtd_itens?.toLocaleString("pt-BR")} itens</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Faturado</p>
                            <p className="text-sm font-bold text-indigo-400">{fmtK(row.faturado)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Recebido</p>
                            <p className="text-sm font-bold text-emerald-400">{fmtK(row.recebido)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Glosado</p>
                            <p className="text-sm font-bold text-rose-500">{fmtK(row.glosado)}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Taxa de Glosa</span><span className="font-semibold text-amber-400">{row.pct_glosa?.toFixed(2)}%</span>
                          </div>
                          <Progress value={Math.min(100, row.pct_glosa)} className="h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Por Profissional — clicável para ver detalhes */}
              <TabsContent value="profissional" className="m-0">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs h-9">Profissional</TableHead>
                        <TableHead className="text-xs h-9">CRM</TableHead>
                        <TableHead className="text-right text-xs h-9">Faturado</TableHead>
                        <TableHead className="text-right text-xs h-9">Glosado</TableHead>
                        <TableHead className="text-xs w-28 h-9">% Glosa</TableHead>
                        <TableHead className="text-right text-xs h-9">Itens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.topProfissionais as any[])?.map((row, i) => (
                        <TableRow key={i} className="hover:bg-muted/30 border-border/50">
                          <TableCell className="text-xs py-2 font-medium">{row.profissional}</TableCell>
                          <TableCell className="text-xs py-2 text-muted-foreground font-mono">{row.crm}</TableCell>
                          <TableCell className="text-right text-xs py-2 text-indigo-400">{fmtCur(row.faturado)}</TableCell>
                          <TableCell className="text-right text-xs py-2 text-rose-500 font-semibold">{fmtCur(row.glosado)}</TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(100, row.pct_glosa)} className="h-1.5 flex-1" />
                              <span className="text-[10px] text-muted-foreground w-10 text-right">{row.pct_glosa?.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs py-2 text-muted-foreground">{row.qtd_itens?.toLocaleString("pt-BR")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── TABELA DETALHADA DE ITENS GLOSADOS ────────────────────────────── */}
        <Card className="border border-border bg-card/40 backdrop-blur-md rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border p-5 bg-gradient-to-r from-indigo-500/10 to-transparent">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg"><FileX className="h-5 w-5 text-indigo-400" /></div>
                <div>
                  <CardTitle className="text-base font-semibold">Itens Glosados — Detalhe</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {topGlosasFiltradas.length} itens · total glosado: <span className="text-rose-400 font-semibold">{fmtCur(totalGlosado)}</span>
                  </CardDescription>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar item, convênio, setor..." value={buscaItem}
                  onChange={(e) => setBuscaItem(e.target.value)}
                  className="pl-8 h-8 w-56 bg-background/50 text-xs border-border/50" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10 border-b">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold h-9 text-xs">Item / Serviço</TableHead>
                    <TableHead className="font-semibold h-9 text-xs">Tipo</TableHead>
                    <TableHead className="font-semibold h-9 text-xs">Convênio</TableHead>
                    <TableHead className="font-semibold h-9 text-xs hidden lg:table-cell">Setor</TableHead>
                    <TableHead className="text-right font-semibold h-9 text-xs">Faturado</TableHead>
                    <TableHead className="text-right font-semibold h-9 text-xs">Glosado</TableHead>
                    <TableHead className="text-right font-semibold h-9 text-xs">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topGlosasFiltradas.map((g: any, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/30 transition-colors border-border/50">
                      <TableCell className="py-2.5">
                        <p className="text-xs font-semibold leading-tight">{g.descricao}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{g.codigo}{g.codigo_tuss ? ` · TUSS: ${g.codigo_tuss}` : ''}</p>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="text-[10px]">{g.tipo_item || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2.5 text-muted-foreground max-w-[120px] truncate" title={g.convenio}>{g.convenio}</TableCell>
                      <TableCell className="text-xs py-2.5 text-muted-foreground hidden lg:table-cell max-w-[100px] truncate" title={g.setor}>{g.setor}</TableCell>
                      <TableCell className="text-right text-xs py-2.5 text-indigo-400">{fmtCur(g.vl_faturado)}</TableCell>
                      <TableCell className="text-right py-2.5">
                        <p className="text-sm font-bold text-rose-500">{fmtCur(g.vl_glosa)}</p>
                        <p className="text-[10px] text-muted-foreground">{g.qtd_glosada}x</p>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <Button variant="ghost" size="sm"
                          className="h-7 gap-1 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-full px-2.5"
                          onClick={() => setLocation('/sistema/motor/regras')}>
                          <Wand2 className="h-3 w-3" />
                          <span className="text-[10px] font-medium">Regra IA</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {topGlosasFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground h-24 text-sm">
                        Nenhum item com glosa encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
