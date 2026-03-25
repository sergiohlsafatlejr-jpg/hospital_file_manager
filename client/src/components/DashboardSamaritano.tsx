import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, TrendingUp, TrendingDown, Building2, Users,
  Package, Activity, X, FileSpreadsheet, AlertTriangle,
  CheckCircle2, Banknote, PercentIcon, ShieldAlert,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Area,
} from "recharts";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

const CHART_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface Props {
  estabelecimentoId: number;
}

export default function DashboardSamaritano({ estabelecimentoId }: Props) {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [convenios, setConvenios] = useState<string[]>([]);
  const [tiposAtend, setTiposAtend] = useState<string[]>([]);
  const [setores, setSetores] = useState<string[]>([]);

  const queryInput = useMemo(() => ({
    estabelecimentoId,
    competencia: competencias.length > 0 ? competencias : undefined,
    convenio: convenios.length > 0 ? convenios : undefined,
    tipoAtend: tiposAtend.length > 0 ? tiposAtend : undefined,
    setor: setores.length > 0 ? setores : undefined,
  }), [estabelecimentoId, competencias, convenios, tiposAtend, setores]);

  const { data, isLoading, error } = trpc.relatorioCustos.dashboardSamaritano.useQuery(
    queryInput,
    { enabled: estabelecimentoId > 0 }
  );

  const handleClear = () => {
    setCompetencias([]);
    setConvenios([]);
    setTiposAtend([]);
    setSetores([]);
  };

  const hasFilters = competencias.length > 0 || convenios.length > 0 || tiposAtend.length > 0 || setores.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[...Array(8)].map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-64" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-600">
          Erro ao carregar dashboard: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const {
    kpis, evolucaoMensal, topConvenios, topSetores, distribuicaoTipoItem,
    evolucaoPorConvenio, distribuicaoTipoAtend, glosasPorConvenio,
  } = data;

  // Dados para gráfico de evolução mensal
  const evolucaoChartData = evolucaoMensal.map((e) => ({
    competencia: e.competencia,
    Faturado: e.faturado,
    Custo: e.custo,
    Recebido: e.recebido,
    Glosado: e.glosado,
    Margem: e.margem,
    "Ticket Médio": e.ticketMedio,
    Contas: e.totalContas,
    "% Recebimento": e.taxaRecebimento,
    "% Glosa": e.taxaGlosa,
  }));

  // Dados para gráfico de convênios
  const conveniosChartData = topConvenios.slice(0, 8).map((c) => ({
    name: c.convenio.length > 15 ? c.convenio.substring(0, 15) + "..." : c.convenio,
    fullName: c.convenio,
    Faturado: c.faturado,
    Recebido: c.recebido,
    Glosado: c.glosado,
    Custo: c.custo,
    Margem: c.margem,
  }));

  // Dados para gráfico de setores
  const setoresChartData = topSetores.map((s) => ({
    name: s.setor.length > 18 ? s.setor.substring(0, 18) + "..." : s.setor,
    fullName: s.setor,
    Faturado: s.faturado,
    Custo: s.custo,
    Recebido: s.recebido,
    Glosado: s.glosado,
    Margem: s.margem,
  }));

  // Dados para pie chart de tipo de item
  const tipoItemPieData = distribuicaoTipoItem.map((t, i) => ({
    name: t.tipoLabel,
    value: t.faturado,
    custo: t.custo,
    recebido: t.recebido,
    glosado: t.glosado,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Dados para tipo de atendimento
  const tipoAtendPieData = (distribuicaoTipoAtend || []).map((t, i) => ({
    name: t.tipoLabel,
    value: t.faturado,
    custo: t.custo,
    recebido: t.recebido,
    glosado: t.glosado,
    contas: t.totalContas,
    taxaGlosa: t.taxaGlosa,
    color: ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6"][i % 5],
  }));

  // Evolução por convênio (top 5)
  const top5Convenios = topConvenios.slice(0, 5).map((c) => c.codplaco);
  const top5ConvenioNames = topConvenios.slice(0, 5).map((c) => c.convenio);
  const evolConvenioChartData = evolucaoPorConvenio.map((e) => {
    const row: any = { competencia: e.competencia };
    for (const conv of e.convenios) {
      if (top5Convenios.includes(conv.codplaco)) {
        row[conv.convenio] = conv.faturado;
      }
    }
    return row;
  });

  // Dados para gráfico de glosa por convênio
  const glosaConvenioChartData = (glosasPorConvenio || []).map((g) => ({
    name: g.convenio.length > 15 ? g.convenio.substring(0, 15) + "..." : g.convenio,
    fullName: g.convenio,
    Glosado: g.glosado,
    "% Glosa": g.taxaGlosa,
    Faturado: g.faturado,
    Recebido: g.recebido,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
            <span>{entry.name}:</span>
            <span className="font-mono font-medium">
              {entry.name.includes("%") ? `${entry.value.toFixed(1)}%` : formatCurrency(entry.value)}
            </span>
          </p>
        ))}
      </div>
    );
  };

  const hasRecebidoData = kpis.totalRecebido > 0 || kpis.totalGlosado > 0;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <label className="text-xs text-muted-foreground block mb-1">Competência</label>
              <MultiSelect
                options={data.competenciasDisponiveis.map((c) => ({ value: c, label: c }))}
                selected={competencias}
                onChange={setCompetencias}
                placeholder="Todas"
                allLabel="Todas"
              />
            </div>

            <div className="w-52">
              <label className="text-xs text-muted-foreground block mb-1">Convênio</label>
              <MultiSelect
                options={data.conveniosDisponiveis.map((c) => ({ value: c.codplaco, label: c.nome }))}
                selected={convenios}
                onChange={setConvenios}
                placeholder="Todos"
                allLabel="Todos"
              />
            </div>

            <div className="w-48">
              <label className="text-xs text-muted-foreground block mb-1">Tipo Atendimento</label>
              <MultiSelect
                options={(data.tiposAtendDisponiveis || []).map((t) => ({ value: t.codigo, label: t.label }))}
                selected={tiposAtend}
                onChange={setTiposAtend}
                placeholder="Todos"
                allLabel="Todos"
              />
            </div>

            <div className="w-52">
              <label className="text-xs text-muted-foreground block mb-1">Setor</label>
              <MultiSelect
                options={(data.setoresDisponiveis || []).map((s) => ({ value: s, label: s }))}
                selected={setores}
                onChange={setSetores}
                placeholder="Todos"
                allLabel="Todos"
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-9">
                <X className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            )}

            <div className="ml-auto">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                Fonte: Importação Excel
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs - Linha 1: Financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5 text-blue-600" />
              Total Faturado
            </div>
            <p className="text-xl font-bold text-blue-600">{formatCurrencyShort(kpis.totalFaturado)}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalContas.toLocaleString("pt-BR")} contas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Activity className="h-3.5 w-3.5 text-red-600" />
              Total Custo
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrencyShort(kpis.totalCusto)}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalRegistros.toLocaleString("pt-BR")} registros</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Total Recebido
            </div>
            <p className="text-xl font-bold text-emerald-600">
              {hasRecebidoData ? formatCurrencyShort(kpis.totalRecebido) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasRecebidoData ? `${kpis.taxaRecebimento.toFixed(1)}% do faturado` : "Sem dados de recebimento"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ShieldAlert className="h-3.5 w-3.5 text-orange-600" />
              Total Glosado
            </div>
            <p className="text-xl font-bold text-orange-600">
              {hasRecebidoData ? formatCurrencyShort(kpis.totalGlosado) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasRecebidoData ? `${kpis.taxaGlosa.toFixed(1)}% do faturado` : "Sem dados de glosa"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs - Linha 2: Margem e Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              Margem (Fat - Custo)
            </div>
            <p className={`text-xl font-bold ${kpis.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrencyShort(kpis.margem)}
            </p>
            <p className="text-[10px] text-muted-foreground">{kpis.margemPercent.toFixed(1)}% de margem</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5 text-purple-600" />
              Ticket Médio
            </div>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(kpis.ticketMedio)}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalConvenios} convênios</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Banknote className="h-3.5 w-3.5 text-amber-600" />
              Perda Líquida
            </div>
            <p className={`text-xl font-bold ${kpis.perdaLiquida > 0 ? "text-red-600" : "text-green-600"}`}>
              {hasRecebidoData ? formatCurrencyShort(kpis.perdaLiquida) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasRecebidoData ? "Faturado - Recebido" : "Sem dados"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5 text-cyan-600" />
              Itens / Setores
            </div>
            <p className="text-xl font-bold text-cyan-600">{kpis.totalItensUnicos.toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalSetores} setores</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas de Gráficos */}
      <Tabs defaultValue="evolucao" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="evolucao" className="text-xs">Evolução Mensal</TabsTrigger>
          <TabsTrigger value="convenios" className="text-xs">Convênios</TabsTrigger>
          <TabsTrigger value="setores" className="text-xs">Setores</TabsTrigger>
          <TabsTrigger value="tipoAtend" className="text-xs">Tipo Atendimento</TabsTrigger>
          {hasRecebidoData && <TabsTrigger value="glosas" className="text-xs">Análise de Glosa</TabsTrigger>}
          <TabsTrigger value="tabelas" className="text-xs">Tabelas Resumo</TabsTrigger>
        </TabsList>

        {/* === ABA: Evolução Mensal === */}
        <TabsContent value="evolucao" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Evolução: Faturado vs Custo vs Recebido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  Evolução: Faturado vs Custo {hasRecebidoData ? "vs Recebido" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={evolucaoChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Faturado" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Custo" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    {hasRecebidoData && <Bar dataKey="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} />}
                    <Line type="monotone" dataKey="Margem" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Evolução: Ticket Médio e Volume */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  Ticket Médio e Volume de Contas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={evolucaoChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-semibold mb-1">{label}</p>
                          {payload.map((entry: any, i: number) => (
                            <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
                              <span>{entry.name}:</span>
                              <span className="font-mono font-medium">
                                {entry.name === "Contas" ? entry.value.toLocaleString("pt-BR") : formatCurrency(entry.value)}
                              </span>
                            </p>
                          ))}
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="left" type="monotone" dataKey="Ticket Médio" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} />
                    <Bar yAxisId="right" dataKey="Contas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Evolução: Recebimento e Glosa */}
          {hasRecebidoData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PercentIcon className="h-4 w-4 text-emerald-600" />
                    Evolução: Taxa de Recebimento e Glosa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={evolucaoChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-semibold mb-1">{label}</p>
                            {payload.map((entry: any, i: number) => (
                              <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
                                <span>{entry.name}:</span>
                                <span className="font-mono font-medium">{entry.value.toFixed(1)}%</span>
                              </p>
                            ))}
                          </div>
                        );
                      }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="% Recebimento" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="% Glosa" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-orange-600" />
                    Evolução: Glosado por Mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={evolucaoChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="left" dataKey="Glosado" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="% Glosa" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Evolução Top 5 Convênios */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Evolução Faturamento - Top 5 Convênios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={evolConvenioChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {top5ConvenioNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ABA: Convênios === */}
        <TabsContent value="convenios" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  Top Convênios: Faturado vs {hasRecebidoData ? "Recebido vs Glosado" : "Custo"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={conveniosChartData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-semibold mb-1">{d?.fullName}</p>
                          {payload.map((entry: any, i: number) => (
                            <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
                              <span>{entry.name}:</span>
                              <span className="font-mono font-medium">{formatCurrency(entry.value)}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Faturado" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    {hasRecebidoData ? (
                      <>
                        <Bar dataKey="Recebido" fill="#10b981" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Glosado" fill="#f97316" radius={[0, 4, 4, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="Custo" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-600" />
                  Distribuição por Tipo de Serviço
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={tipoItemPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      innerRadius={55}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {tipoItemPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-semibold mb-1">{d?.name}</p>
                          <p className="flex justify-between gap-4">
                            <span>Faturado:</span>
                            <span className="font-mono font-medium text-blue-600">{formatCurrency(d?.value)}</span>
                          </p>
                          <p className="flex justify-between gap-4">
                            <span>Custo:</span>
                            <span className="font-mono font-medium text-red-600">{formatCurrency(d?.custo)}</span>
                          </p>
                          {hasRecebidoData && (
                            <>
                              <p className="flex justify-between gap-4">
                                <span>Recebido:</span>
                                <span className="font-mono font-medium text-emerald-600">{formatCurrency(d?.recebido)}</span>
                              </p>
                              <p className="flex justify-between gap-4">
                                <span>Glosado:</span>
                                <span className="font-mono font-medium text-orange-600">{formatCurrency(d?.glosado)}</span>
                              </p>
                            </>
                          )}
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === ABA: Setores === */}
        <TabsContent value="setores" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-green-600" />
                Setores: Faturado vs Custo {hasRecebidoData ? "vs Recebido" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(300, setoresChartData.length * 45)}>
                <BarChart data={setoresChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                        <p className="font-semibold mb-1">{d?.fullName}</p>
                        {payload.map((entry: any, i: number) => (
                          <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4">
                            <span>{entry.name}:</span>
                            <span className="font-mono font-medium">{formatCurrency(entry.value)}</span>
                          </p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Faturado" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Custo" fill="#f97316" radius={[0, 4, 4, 0]} />
                  {hasRecebidoData && <Bar dataKey="Recebido" fill="#10b981" radius={[0, 4, 4, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ABA: Tipo de Atendimento === */}
        <TabsContent value="tipoAtend" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Faturamento por Tipo de Atendimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={tipoAtendPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {tipoAtendPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-semibold mb-1">{d?.name}</p>
                          <p className="flex justify-between gap-4">
                            <span>Contas:</span>
                            <span className="font-mono font-medium">{d?.contas?.toLocaleString("pt-BR")}</span>
                          </p>
                          <p className="flex justify-between gap-4">
                            <span>Faturado:</span>
                            <span className="font-mono font-medium text-blue-600">{formatCurrency(d?.value)}</span>
                          </p>
                          <p className="flex justify-between gap-4">
                            <span>Custo:</span>
                            <span className="font-mono font-medium text-red-600">{formatCurrency(d?.custo)}</span>
                          </p>
                          {hasRecebidoData && (
                            <>
                              <p className="flex justify-between gap-4">
                                <span>Recebido:</span>
                                <span className="font-mono font-medium text-emerald-600">{formatCurrency(d?.recebido)}</span>
                              </p>
                              <p className="flex justify-between gap-4">
                                <span>Glosado:</span>
                                <span className="font-mono font-medium text-orange-600">{formatCurrency(d?.glosado)}</span>
                              </p>
                              <p className="flex justify-between gap-4">
                                <span>Taxa Glosa:</span>
                                <span className="font-mono font-medium">{d?.taxaGlosa?.toFixed(1)}%</span>
                              </p>
                            </>
                          )}
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-600" />
                  Detalhamento por Tipo de Atendimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={tipoAtendPieData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="value" name="Faturado" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="custo" name="Custo" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    {hasRecebidoData && <Bar dataKey="recebido" name="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} />}
                    {hasRecebidoData && <Bar dataKey="glosado" name="Glosado" fill="#f97316" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === ABA: Análise de Glosa === */}
        {hasRecebidoData && (
          <TabsContent value="glosas" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    Ranking de Glosa por Convênio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={glosaConvenioChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-semibold mb-1">{d?.fullName}</p>
                            <p className="flex justify-between gap-4">
                              <span>Faturado:</span>
                              <span className="font-mono font-medium text-blue-600">{formatCurrency(d?.Faturado)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span>Recebido:</span>
                              <span className="font-mono font-medium text-emerald-600">{formatCurrency(d?.Recebido)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span>Glosado:</span>
                              <span className="font-mono font-medium text-orange-600">{formatCurrency(d?.Glosado)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span>Taxa Glosa:</span>
                              <span className="font-mono font-bold text-red-600">{d?.["% Glosa"]?.toFixed(1)}%</span>
                            </p>
                          </div>
                        );
                      }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Glosado" fill="#f97316" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Recebido" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PercentIcon className="h-4 w-4 text-red-600" />
                    Taxa de Glosa por Convênio (%)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={glosaConvenioChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-semibold mb-1">{d?.fullName}</p>
                            <p className="flex justify-between gap-4">
                              <span>Taxa Glosa:</span>
                              <span className="font-mono font-bold text-red-600">{d?.["% Glosa"]?.toFixed(1)}%</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span>Glosado:</span>
                              <span className="font-mono font-medium text-orange-600">{formatCurrency(d?.Glosado)}</span>
                            </p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="% Glosa" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* === ABA: Tabelas Resumo === */}
        <TabsContent value="tabelas" className="space-y-4 mt-4">
          {/* Tabela resumo convênios */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo por Convênio</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Convênio</th>
                      <th className="text-right p-2 font-medium">Contas</th>
                      <th className="text-right p-2 font-medium">Faturado</th>
                      <th className="text-right p-2 font-medium">Custo</th>
                      {hasRecebidoData && <th className="text-right p-2 font-medium">Recebido</th>}
                      {hasRecebidoData && <th className="text-right p-2 font-medium">Glosado</th>}
                      <th className="text-right p-2 font-medium">Margem</th>
                      <th className="text-right p-2 font-medium">Margem %</th>
                      {hasRecebidoData && <th className="text-right p-2 font-medium">% Glosa</th>}
                      <th className="text-center p-2 font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topConvenios.map((c) => (
                      <tr key={c.codplaco} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="p-2 font-medium">
                          {c.convenio}
                          <span className="text-muted-foreground ml-1">({c.codplaco})</span>
                        </td>
                        <td className="p-2 text-right tabular-nums">{c.totalContas.toLocaleString("pt-BR")}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{formatCurrency(c.faturado)}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(c.custo)}</td>
                        {hasRecebidoData && <td className="p-2 text-right tabular-nums text-emerald-600">{formatCurrency(c.recebido)}</td>}
                        {hasRecebidoData && <td className="p-2 text-right tabular-nums text-orange-600">{formatCurrency(c.glosado)}</td>}
                        <td className={`p-2 text-right tabular-nums font-bold ${c.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(c.margem)}
                        </td>
                        <td className={`p-2 text-right tabular-nums ${c.margemPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {c.margemPercent.toFixed(1)}%
                        </td>
                        {hasRecebidoData && (
                          <td className={`p-2 text-right tabular-nums ${c.taxaGlosa > 10 ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                            {c.taxaGlosa.toFixed(1)}%
                          </td>
                        )}
                        <td className="p-2 text-center">
                          <Badge
                            variant={c.margem > 0 ? "default" : c.margem < 0 ? "destructive" : "secondary"}
                            className={`text-[10px] ${c.margem > 0 ? "bg-green-600 hover:bg-green-700" : ""}`}
                          >
                            {c.margem > 0 ? (
                              <><TrendingUp className="h-2.5 w-2.5 mr-0.5" />Lucro</>
                            ) : c.margem < 0 ? (
                              <><TrendingDown className="h-2.5 w-2.5 mr-0.5" />Prejuízo</>
                            ) : "Empate"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tabela resumo setores */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo por Setor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Setor</th>
                      <th className="text-right p-2 font-medium">Contas</th>
                      <th className="text-right p-2 font-medium">Itens</th>
                      <th className="text-right p-2 font-medium">Faturado</th>
                      <th className="text-right p-2 font-medium">Custo</th>
                      {hasRecebidoData && <th className="text-right p-2 font-medium">Recebido</th>}
                      {hasRecebidoData && <th className="text-right p-2 font-medium">Glosado</th>}
                      <th className="text-right p-2 font-medium">Margem</th>
                      <th className="text-right p-2 font-medium">Margem %</th>
                      {hasRecebidoData && <th className="text-right p-2 font-medium">% Glosa</th>}
                      <th className="text-center p-2 font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSetores.map((s) => (
                      <tr key={s.setor} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="p-2 font-medium">{s.setor}</td>
                        <td className="p-2 text-right tabular-nums">{s.totalContas.toLocaleString("pt-BR")}</td>
                        <td className="p-2 text-right tabular-nums">{s.totalItens.toLocaleString("pt-BR")}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{formatCurrency(s.faturado)}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(s.custo)}</td>
                        {hasRecebidoData && <td className="p-2 text-right tabular-nums text-emerald-600">{formatCurrency(s.recebido)}</td>}
                        {hasRecebidoData && <td className="p-2 text-right tabular-nums text-orange-600">{formatCurrency(s.glosado)}</td>}
                        <td className={`p-2 text-right tabular-nums font-bold ${s.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(s.margem)}
                        </td>
                        <td className={`p-2 text-right tabular-nums ${s.margemPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {s.margemPercent.toFixed(1)}%
                        </td>
                        {hasRecebidoData && (
                          <td className={`p-2 text-right tabular-nums ${s.taxaGlosa > 10 ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                            {s.taxaGlosa.toFixed(1)}%
                          </td>
                        )}
                        <td className="p-2 text-center">
                          <Badge
                            variant={s.margem > 0 ? "default" : s.margem < 0 ? "destructive" : "secondary"}
                            className={`text-[10px] ${s.margem > 0 ? "bg-green-600 hover:bg-green-700" : ""}`}
                          >
                            {s.margem > 0 ? (
                              <><TrendingUp className="h-2.5 w-2.5 mr-0.5" />Lucro</>
                            ) : s.margem < 0 ? (
                              <><TrendingDown className="h-2.5 w-2.5 mr-0.5" />Prejuízo</>
                            ) : "Empate"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Glosa por Convênio */}
          {hasRecebidoData && glosasPorConvenio && glosasPorConvenio.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Detalhamento de Glosa por Convênio
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Convênio</th>
                        <th className="text-right p-2 font-medium">Contas</th>
                        <th className="text-right p-2 font-medium">Faturado</th>
                        <th className="text-right p-2 font-medium">Recebido</th>
                        <th className="text-right p-2 font-medium">Glosado</th>
                        <th className="text-right p-2 font-medium">% Glosa</th>
                        <th className="text-right p-2 font-medium">Perda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glosasPorConvenio.map((g) => (
                        <tr key={g.codplaco} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="p-2 font-medium">{g.convenio}</td>
                          <td className="p-2 text-right tabular-nums">{g.totalContas.toLocaleString("pt-BR")}</td>
                          <td className="p-2 text-right tabular-nums">{formatCurrency(g.faturado)}</td>
                          <td className="p-2 text-right tabular-nums text-emerald-600">{formatCurrency(g.recebido)}</td>
                          <td className="p-2 text-right tabular-nums text-orange-600 font-bold">{formatCurrency(g.glosado)}</td>
                          <td className={`p-2 text-right tabular-nums font-bold ${g.taxaGlosa > 10 ? "text-red-600" : "text-orange-600"}`}>
                            {g.taxaGlosa.toFixed(1)}%
                          </td>
                          <td className="p-2 text-right tabular-nums text-red-600">{formatCurrency(g.perda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
