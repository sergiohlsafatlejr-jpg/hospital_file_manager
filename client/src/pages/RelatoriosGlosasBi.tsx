import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer
} from "recharts";
import {
  AlertTriangle, TrendingDown, TrendingUp, DollarSign,
  FileX, Shield, BarChart2, Download, Info, Brain,
  CheckCircle2, XCircle, Clock, Layers, ChevronRight,
  Loader2, Sparkles
} from "lucide-react";
import * as XLSX from "xlsx";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1"];

const STATUS_COLORS: Record<string, string> = {
  sem_recurso: "#ef4444",
  recurso_criado: "#f97316",
  recurso_enviado: "#eab308",
  recurso_deferido: "#22c55e",
  recurso_indeferido: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  sem_recurso: "Sem Recurso",
  recurso_criado: "Criado",
  recurso_enviado: "Enviado",
  recurso_deferido: "Deferido",
  recurso_indeferido: "Indeferido",
  pendente: "Pendente",
};

const PRIORIDADE_COLORS: Record<string, string> = {
  alta: "text-red-400 border-red-400/30",
  media: "text-yellow-400 border-yellow-400/30",
  baixa: "text-green-400 border-green-400/30",
};

export default function RelatoriosGlosasBi() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id !== 0 ? estabelecimentoAtual.id : undefined;
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [competenciaInicio, setCompetenciaInicio] = useState<string | undefined>();
  const [competenciaFim, setCompetenciaFim] = useState<string | undefined>();
  const [tipoLancamento, setTipoLancamento] = useState<string | undefined>();
  const [recursoStatusFiltro, setRecursoStatusFiltro] = useState<string | undefined>();
  const [codigoGlosaIA, setCodigoGlosaIA] = useState<string>("");
  const [analiseIA, setAnaliseIA] = useState<any>(null);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [recursosOffset, setRecursosOffset] = useState(0);

  const filtrosQuery = trpc.relatoriosGlosasBi.filtros.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0 },
    { enabled: !!estabelecimentoId }
  );

  const kpisQuery = trpc.relatoriosGlosasBi.kpis.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim, tipoLancamento },
    { enabled: !!estabelecimentoId }
  );

  const tendenciaQuery = trpc.relatoriosGlosasBi.tendenciaMensal.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, meses: 12 },
    { enabled: !!estabelecimentoId }
  );

  const porConvenioQuery = trpc.relatoriosGlosasBi.porConvenio.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, competenciaInicio, competenciaFim },
    { enabled: !!estabelecimentoId }
  );

  const porCodigoQuery = trpc.relatoriosGlosasBi.porCodigo.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim, limite: 15 },
    { enabled: !!estabelecimentoId }
  );

  const porTipoQuery = trpc.relatoriosGlosasBi.porTipoLancamento.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim },
    { enabled: !!estabelecimentoId }
  );

  const statusRecursoQuery = trpc.relatoriosGlosasBi.statusRecurso.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim },
    { enabled: !!estabelecimentoId }
  );

  const topItensQuery = trpc.relatoriosGlosasBi.topItensGlosados.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim, limite: 15 },
    { enabled: !!estabelecimentoId }
  );

  const recursosQuery = trpc.relatoriosGlosasBi.recursosIntegrados.useQuery(
    {
      estabelecimentoId: estabelecimentoId ?? 0,
      convenioId,
      competenciaInicio,
      competenciaFim,
      status: recursoStatusFiltro,
      limite: 50,
      offset: recursosOffset,
    },
    { enabled: !!estabelecimentoId }
  );

  const setorQuery = trpc.relatoriosGlosasBi.analisePorSetor.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0, convenioId, competenciaInicio, competenciaFim },
    { enabled: !!estabelecimentoId }
  );

  const analisarDevolutivaMutation = trpc.relatoriosGlosasBi.analisarDevolutiva.useMutation();

  const kpis = kpisQuery.data;
  const filtros = filtrosQuery.data;

  const handleAnalisarIA = async () => {
    if (!codigoGlosaIA || !estabelecimentoId) return;
    setAnalisandoIA(true);
    setAnaliseIA(null);
    try {
      const result = await analisarDevolutivaMutation.mutateAsync({
        estabelecimentoId,
        codigoGlosa: codigoGlosaIA,
        convenioId,
        competenciaInicio,
        competenciaFim,
      });
      setAnaliseIA(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalisandoIA(false);
    }
  };

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    if (kpis) {
      const kpiData = [
        ["Métrica", "Valor"],
        ["Total Itens", kpis.totalItens],
        ["Total Glosados", kpis.totalGlosados],
        ["Total Informado", kpis.totalInformado],
        ["Total Glosa", kpis.totalGlosa],
        ["Taxa de Glosa (%)", kpis.taxaGlosa],
        ["Ticket Médio Glosa", kpis.ticketMedioGlosa],
        ["Total Recuperado", kpis.totalRecuperado],
        ["Taxa de Recuperação (%)", kpis.taxaRecuperacao],
        ["Total em Recurso", kpis.totalEmRecurso],
        ["Pendente Análise", kpis.totalPendenteAnalise],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), "KPIs");
    }

    if (porCodigoQuery.data) {
      const data = [
        ["Código Glosa", "Descrição", "Total Glosados", "Total Glosa (R$)", "Total Recuperado (R$)", "Taxa Recuperação (%)"],
        ...porCodigoQuery.data.map(r => [r.codigoGlosa, r.descricao, r.totalGlosados, r.totalGlosa, r.totalRecuperado, r.taxaRecuperacao]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Por Código");
    }

    if (porConvenioQuery.data) {
      const data = [
        ["Convênio", "Total Glosados", "Total Informado (R$)", "Total Glosa (R$)", "Taxa Glosa (%)", "Total Recuperado (R$)"],
        ...porConvenioQuery.data.map(r => [r.convenio, r.totalGlosados, r.totalInformado, r.totalGlosa, r.taxaGlosa, r.totalRecuperado]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Por Convênio");
    }

    if (topItensQuery.data) {
      const data = [
        ["Código Item", "Descrição", "Tipo", "Total Glosados", "Total Glosa (R$)", "Ticket Médio (R$)", "Taxa Glosa (%)"],
        ...topItensQuery.data.map(r => [r.codigoItem, r.descricaoItem, r.tipoLancamento, r.totalGlosados, r.totalGlosa, r.ticketMedioGlosa, r.taxaGlosa]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Top Itens");
    }

    if (setorQuery.data) {
      const data = [
        ["Setor/Tipo", "Total Itens", "Total Glosados", "Total Informado (R$)", "Total Glosa (R$)", "Taxa Glosa (%)", "Taxa Recuperação (%)"],
        ...setorQuery.data.map(r => [r.setor, r.totalItens, r.totalGlosados, r.totalInformado, r.totalGlosa, r.taxaGlosa, r.taxaRecuperacao]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Por Setor");
    }

    XLSX.writeFile(wb, `relatorio-glosas-bi-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!estabelecimentoId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione um estabelecimento para visualizar o relatório.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-red-500" />
              Relatório BI de Glosas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Análise detalhada de glosas — dados reais do demonstrativo ({kpis?.totalItens?.toLocaleString("pt-BR") ?? "..."} registros)
            </p>
          </div>
          <Button onClick={exportarExcel} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Convênio</label>
                <Select
                  value={convenioId?.toString() ?? "todos"}
                  onValueChange={v => setConvenioId(v === "todos" ? undefined : Number(v))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {filtros?.convenios.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Competência Início</label>
                <Select
                  value={competenciaInicio ?? "todas"}
                  onValueChange={v => setCompetenciaInicio(v === "todas" ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {filtros?.competencias.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Competência Fim</label>
                <Select
                  value={competenciaFim ?? "todas"}
                  onValueChange={v => setCompetenciaFim(v === "todas" ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {filtros?.competencias.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de Lançamento</label>
                <Select
                  value={tipoLancamento ?? "todos"}
                  onValueChange={v => setTipoLancamento(v === "todos" ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {filtros?.tiposLancamento.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        {kpisQuery.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i}><CardContent className="pt-4 h-24 animate-pulse bg-muted/30 rounded" /></Card>
            ))}
          </div>
        ) : kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Total Glosado</span>
                  <FileX className="h-4 w-4 text-red-500" />
                </div>
                <div className="text-xl font-bold text-red-400">{fmt(kpis.totalGlosa)}</div>
                <div className="text-xs text-muted-foreground">{kpis.totalGlosados.toLocaleString("pt-BR")} itens</div>
              </CardContent>
            </Card>

            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Taxa de Glosa</span>
                  <TrendingDown className="h-4 w-4 text-orange-500" />
                </div>
                <div className="text-xl font-bold text-orange-400">{fmtPct(kpis.taxaGlosa)}</div>
                <div className="text-xs text-muted-foreground">do total informado</div>
              </CardContent>
            </Card>

            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Total Recuperado</span>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <div className="text-xl font-bold text-green-400">{fmt(kpis.totalRecuperado)}</div>
                <div className="text-xs text-muted-foreground">Taxa: {fmtPct(kpis.taxaRecuperacao)}</div>
              </CardContent>
            </Card>

            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Em Recurso</span>
                  <Shield className="h-4 w-4 text-yellow-500" />
                </div>
                <div className="text-xl font-bold text-yellow-400">{fmt(kpis.totalEmRecurso)}</div>
                <div className="text-xs text-muted-foreground">aguardando resposta</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Ticket Médio Glosa</span>
                  <DollarSign className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-xl font-bold">{fmt(kpis.ticketMedioGlosa)}</div>
                <div className="text-xs text-muted-foreground">por item glosado</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Pendente Análise</span>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-xl font-bold text-amber-400">{fmt(kpis.totalPendenteAnalise)}</div>
                <div className="text-xs text-muted-foreground">sem classificação</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Total Informado</span>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold">{fmt(kpis.totalInformado)}</div>
                <div className="text-xs text-muted-foreground">{kpis.totalGuias.toLocaleString("pt-BR")} guias</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Guias com Glosa</span>
                  <FileX className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold">{kpis.guiasComGlosa.toLocaleString("pt-BR")}</div>
                <div className="text-xs text-muted-foreground">
                  {kpis.totalGuias > 0 ? fmtPct((kpis.guiasComGlosa / kpis.totalGuias) * 100) : "0%"} do total
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Abas principais */}
        <Tabs defaultValue="visao-geral">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="visao-geral" className="text-xs">
              <BarChart2 className="h-3.5 w-3.5 mr-1" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="por-codigo" className="text-xs">
              <Layers className="h-3.5 w-3.5 mr-1" />
              Por Código
            </TabsTrigger>
            <TabsTrigger value="por-setor" className="text-xs">
              <ChevronRight className="h-3.5 w-3.5 mr-1" />
              Por Setor
            </TabsTrigger>
            <TabsTrigger value="recursos" className="text-xs">
              <Shield className="h-3.5 w-3.5 mr-1" />
              Recursos
            </TabsTrigger>
            <TabsTrigger value="ia-devolutiva" className="text-xs">
              <Brain className="h-3.5 w-3.5 mr-1" />
              IA Devolutiva
            </TabsTrigger>
          </TabsList>

          {/* ABA: VISÃO GERAL */}
          <TabsContent value="visao-geral" className="space-y-4 mt-4">
            {/* Gráficos linha 1: Tendência + Status Recurso */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tendência Mensal de Glosas</CardTitle>
                </CardHeader>
                <CardContent>
                  {tendenciaQuery.isLoading ? (
                    <div className="h-48 animate-pulse bg-muted/30 rounded" />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={tendenciaQuery.data ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="competencia" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value: any, name: string) => {
                            if (name === "Taxa Glosa (%)") return [`${Number(value).toFixed(2)}%`, name];
                            return [fmt(Number(value)), name];
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="totalGlosa" name="Total Glosa" fill="#ef4444" opacity={0.8} />
                        <Line yAxisId="right" type="monotone" dataKey="taxaGlosa" name="Taxa Glosa (%)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Status de Recurso</CardTitle>
                </CardHeader>
                <CardContent>
                  {statusRecursoQuery.isLoading ? (
                    <div className="h-48 animate-pulse bg-muted/30 rounded" />
                  ) : (
                    <div className="space-y-2">
                      {(statusRecursoQuery.data ?? []).map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#6b7280" }} />
                            <span className="text-xs">{s.label}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-xs">{fmt(s.totalGlosa)}</div>
                            <div className="text-muted-foreground text-xs">{s.total} itens</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Gráficos linha 2: Por Convênio + Por Tipo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Glosas por Convênio</CardTitle>
                </CardHeader>
                <CardContent>
                  {porConvenioQuery.isLoading ? (
                    <div className="h-48 animate-pulse bg-muted/30 rounded" />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={(porConvenioQuery.data ?? []).slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="convenio" tick={{ fontSize: 10 }} width={90} />
                        <RechartsTooltip formatter={(v: any) => [fmt(Number(v)), "Total Glosa"]} />
                        <Bar dataKey="totalGlosa" name="Total Glosa" radius={[0, 4, 4, 0]}>
                          {(porConvenioQuery.data ?? []).slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Glosas por Tipo de Lançamento</CardTitle>
                </CardHeader>
                <CardContent>
                  {porTipoQuery.isLoading ? (
                    <div className="h-48 animate-pulse bg-muted/30 rounded" />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={porTipoQuery.data ?? []}
                          dataKey="totalGlosa"
                          nameKey="tipoLancamento"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ tipoLancamento, percent }) =>
                            `${String(tipoLancamento ?? "").substring(0, 10)} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {(porTipoQuery.data ?? []).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v: any, name: string) => [fmt(Number(v)), name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Itens */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Itens Mais Glosados</CardTitle>
              </CardHeader>
              <CardContent>
                {topItensQuery.isLoading ? (
                  <div className="h-32 animate-pulse bg-muted/30 rounded" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-2 pr-3">Código</th>
                          <th className="text-left py-2 pr-3">Descrição</th>
                          <th className="text-left py-2 pr-3">Tipo</th>
                          <th className="text-right py-2 pr-3">Itens</th>
                          <th className="text-right py-2 pr-3">Total Glosa</th>
                          <th className="text-right py-2 pr-3">Ticket Médio</th>
                          <th className="text-right py-2">Taxa Glosa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(topItensQuery.data ?? []).map((r, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2 pr-3 font-mono text-xs">{r.codigoItem}</td>
                            <td className="py-2 pr-3 text-xs max-w-[180px] truncate" title={r.descricaoItem ?? ""}>
                              {r.descricaoItem}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant="secondary" className="text-xs">{r.tipoLancamento ?? "—"}</Badge>
                            </td>
                            <td className="py-2 pr-3 text-right text-xs">{r.totalGlosados.toLocaleString("pt-BR")}</td>
                            <td className="py-2 pr-3 text-right text-xs font-medium text-red-400">{fmt(r.totalGlosa)}</td>
                            <td className="py-2 pr-3 text-right text-xs">{fmt(r.ticketMedioGlosa)}</td>
                            <td className="py-2 text-right text-xs">
                              <Badge
                                variant="outline"
                                className={r.taxaGlosa > 30 ? "text-red-400 border-red-400/30" : r.taxaGlosa > 10 ? "text-yellow-400 border-yellow-400/30" : "text-green-400 border-green-400/30"}
                              >
                                {fmtPct(r.taxaGlosa)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: POR CÓDIGO */}
          <TabsContent value="por-codigo" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Top Motivos de Glosa (por código TISS)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Passe o mouse sobre o código para ver a descrição completa TISS
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {porCodigoQuery.isLoading ? (
                  <div className="h-32 animate-pulse bg-muted/30 rounded" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-2 pr-4">Código</th>
                          <th className="text-left py-2 pr-4">Descrição</th>
                          <th className="text-right py-2 pr-4">Itens</th>
                          <th className="text-right py-2 pr-4">Total Glosa</th>
                          <th className="text-right py-2 pr-4">Recuperado</th>
                          <th className="text-right py-2 pr-4">Taxa Rec.</th>
                          <th className="text-right py-2">Analisar IA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(porCodigoQuery.data ?? []).map((r, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2 pr-4">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs cursor-help font-mono">
                                    {r.codigoGlosa}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {r.descricao}
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground max-w-[200px] truncate">
                              {r.descricao.length > 40 ? r.descricao.substring(0, 40) + "..." : r.descricao}
                            </td>
                            <td className="py-2 pr-4 text-right text-xs">{r.totalGlosados.toLocaleString("pt-BR")}</td>
                            <td className="py-2 pr-4 text-right text-xs font-medium text-red-400">{fmt(r.totalGlosa)}</td>
                            <td className="py-2 pr-4 text-right text-xs text-green-400">{fmt(r.totalRecuperado)}</td>
                            <td className="py-2 pr-4 text-right text-xs">
                              <Badge
                                variant="outline"
                                className={r.taxaRecuperacao > 50 ? "text-green-400 border-green-400/30" : r.taxaRecuperacao > 20 ? "text-yellow-400 border-yellow-400/30" : "text-red-400 border-red-400/30"}
                              >
                                {fmtPct(r.taxaRecuperacao)}
                              </Badge>
                            </td>
                            <td className="py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs gap-1 text-purple-400 hover:text-purple-300"
                                onClick={() => {
                                  setCodigoGlosaIA(r.codigoGlosa === "Sem código" ? "" : r.codigoGlosa);
                                  // Trigger tab change via custom event
                                  document.querySelector('[data-value="ia-devolutiva"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                }}
                              >
                                <Sparkles className="h-3 w-3" />
                                IA
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: POR SETOR */}
          <TabsContent value="por-setor" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Análise de Glosas por Setor / Tipo de Lançamento</CardTitle>
              </CardHeader>
              <CardContent>
                {setorQuery.isLoading ? (
                  <div className="h-32 animate-pulse bg-muted/30 rounded" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200} className="mb-4">
                      <BarChart data={setorQuery.data ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="setor" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                        <RechartsTooltip formatter={(v: any, name: string) => [fmt(Number(v)), name]} />
                        <Legend />
                        <Bar dataKey="totalInformado" name="Informado" fill="#3b82f6" opacity={0.7} />
                        <Bar dataKey="totalPago" name="Pago" fill="#22c55e" opacity={0.7} />
                        <Bar dataKey="totalGlosa" name="Glosado" fill="#ef4444" opacity={0.7} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="text-left py-2 pr-3">Setor</th>
                            <th className="text-right py-2 pr-3">Itens</th>
                            <th className="text-right py-2 pr-3">Glosados</th>
                            <th className="text-right py-2 pr-3">Total Informado</th>
                            <th className="text-right py-2 pr-3">Total Glosa</th>
                            <th className="text-right py-2 pr-3">Taxa Glosa</th>
                            <th className="text-right py-2">Taxa Rec.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(setorQuery.data ?? []).map((r, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="py-2 pr-3 text-xs font-medium">{r.setor}</td>
                              <td className="py-2 pr-3 text-right text-xs">{r.totalItens.toLocaleString("pt-BR")}</td>
                              <td className="py-2 pr-3 text-right text-xs text-red-400">{r.totalGlosados.toLocaleString("pt-BR")}</td>
                              <td className="py-2 pr-3 text-right text-xs">{fmt(r.totalInformado)}</td>
                              <td className="py-2 pr-3 text-right text-xs font-medium text-red-400">{fmt(r.totalGlosa)}</td>
                              <td className="py-2 pr-3 text-right text-xs">
                                <Badge variant="outline" className={r.taxaGlosa > 20 ? "text-red-400 border-red-400/30" : r.taxaGlosa > 10 ? "text-yellow-400 border-yellow-400/30" : "text-green-400 border-green-400/30"}>
                                  {fmtPct(r.taxaGlosa)}
                                </Badge>
                              </td>
                              <td className="py-2 text-right text-xs">
                                <Badge variant="outline" className={r.taxaRecuperacao > 30 ? "text-green-400 border-green-400/30" : "text-muted-foreground"}>
                                  {fmtPct(r.taxaRecuperacao)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: RECURSOS DE GLOSA */}
          <TabsContent value="recursos" className="space-y-4 mt-4">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs text-muted-foreground">Filtrar por status:</label>
              <Select
                value={recursoStatusFiltro ?? "todos"}
                onValueChange={v => { setRecursoStatusFiltro(v === "todos" ? undefined : v); setRecursosOffset(0); }}
              >
                <SelectTrigger className="h-8 text-sm w-48">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente (sem recurso)</SelectItem>
                  <SelectItem value="recurso_criado">Recurso Criado</SelectItem>
                  <SelectItem value="recurso_enviado">Recurso Enviado</SelectItem>
                  <SelectItem value="recurso_deferido">Recurso Deferido</SelectItem>
                  <SelectItem value="recurso_indeferido">Recurso Indeferido</SelectItem>
                </SelectContent>
              </Select>
              {recursosQuery.data && (
                <span className="text-xs text-muted-foreground">
                  {recursosQuery.data.total.toLocaleString("pt-BR")} itens encontrados
                </span>
              )}
            </div>

            <Card>
              <CardContent className="pt-4">
                {recursosQuery.isLoading ? (
                  <div className="h-48 animate-pulse bg-muted/30 rounded" />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="text-left py-2 pr-2">Guia</th>
                            <th className="text-left py-2 pr-2">Paciente</th>
                            <th className="text-left py-2 pr-2">Convênio</th>
                            <th className="text-left py-2 pr-2">Código</th>
                            <th className="text-left py-2 pr-2">Descrição</th>
                            <th className="text-right py-2 pr-2">Valor Glosa</th>
                            <th className="text-left py-2 pr-2">Motivo</th>
                            <th className="text-left py-2 pr-2">Status</th>
                            <th className="text-left py-2">Competência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(recursosQuery.data?.items ?? []).map((r, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="py-1.5 pr-2 font-mono">{r.numeroGuia}</td>
                              <td className="py-1.5 pr-2 max-w-[120px] truncate" title={r.nomeBeneficiario ?? ""}>
                                {r.nomeBeneficiario ?? "—"}
                              </td>
                              <td className="py-1.5 pr-2">{r.convenioNome ?? "—"}</td>
                              <td className="py-1.5 pr-2 font-mono">{r.codigoItem}</td>
                              <td className="py-1.5 pr-2 max-w-[150px] truncate" title={r.descricaoItem ?? ""}>
                                {r.descricaoItem ?? "—"}
                              </td>
                              <td className="py-1.5 pr-2 text-right font-medium text-red-400">{fmt(r.valorGlosa)}</td>
                              <td className="py-1.5 pr-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="font-mono text-xs cursor-help">
                                      {r.codigoGlosa ?? "—"}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    {r.descricaoGlosa}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                              <td className="py-1.5 pr-2">
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  style={{ color: STATUS_COLORS[r.recursoStatus ?? "sem_recurso"], borderColor: STATUS_COLORS[r.recursoStatus ?? "sem_recurso"] + "50" }}
                                >
                                  {STATUS_LABELS[r.recursoStatus ?? "sem_recurso"]}
                                </Badge>
                              </td>
                              <td className="py-1.5">
                                {r.dataReferencia ? new Date(r.dataReferencia).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginação */}
                    {recursosQuery.data && recursosQuery.data.total > 50 && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recursosOffset === 0}
                          onClick={() => setRecursosOffset(Math.max(0, recursosOffset - 50))}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {recursosOffset + 1}–{Math.min(recursosOffset + 50, recursosQuery.data.total)} de {recursosQuery.data.total.toLocaleString("pt-BR")}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recursosOffset + 50 >= recursosQuery.data.total}
                          onClick={() => setRecursosOffset(recursosOffset + 50)}
                        >
                          Próxima
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: IA DEVOLUTIVA */}
          <TabsContent value="ia-devolutiva" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-400" />
                  Análise de Devolutiva por IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Selecione um código de glosa para que a IA analise o padrão, identifique a causa raiz e sugira melhorias de processo e argumentos para recurso.
                </p>

                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Código de Glosa</label>
                    <Select
                      value={codigoGlosaIA || "selecione"}
                      onValueChange={v => setCodigoGlosaIA(v === "selecione" ? "" : v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione um código de glosa..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="selecione">Selecione um código...</SelectItem>
                        {(porCodigoQuery.data ?? [])
                          .filter(r => r.codigoGlosa !== "Sem código")
                          .map(r => (
                            <SelectItem key={r.codigoGlosa} value={r.codigoGlosa}>
                              {r.codigoGlosa} — {r.descricao.substring(0, 50)} ({fmt(r.totalGlosa)})
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAnalisarIA}
                    disabled={!codigoGlosaIA || analisandoIA}
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    {analisandoIA ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Analisar com IA</>
                    )}
                  </Button>
                </div>

                {analisandoIA && (
                  <div className="flex items-center gap-3 p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                    <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                    <div>
                      <div className="text-sm font-medium text-purple-300">Analisando padrões de glosa...</div>
                      <div className="text-xs text-muted-foreground">A IA está consultando o histórico de ocorrências e recursos para gerar sugestões personalizadas.</div>
                    </div>
                  </div>
                )}

                {analiseIA && !analisandoIA && (
                  <div className="space-y-4">
                    {/* Cabeçalho da análise */}
                    <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Badge variant="outline" className="font-mono text-purple-300 border-purple-500/30 mb-1">
                            Código {analiseIA.codigoGlosa}
                          </Badge>
                          <div className="text-sm font-medium">{analiseIA.descricaoMotivo}</div>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={PRIORIDADE_COLORS[analiseIA.analise?.prioridade ?? "media"]}
                          >
                            Prioridade {analiseIA.analise?.prioridade ?? "media"}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {analiseIA.analise?.estimativaRecuperabilidade ?? 0}% recuperável
                          </div>
                        </div>
                      </div>

                      {/* Dados quantitativos */}
                      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-purple-500/20">
                        <div className="text-center">
                          <div className="text-lg font-bold text-red-400">{analiseIA.dados?.totalOcorrencias?.toLocaleString("pt-BR")}</div>
                          <div className="text-xs text-muted-foreground">Ocorrências</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-red-400">{fmt(analiseIA.dados?.totalValorGlosado ?? 0)}</div>
                          <div className="text-xs text-muted-foreground">Valor Glosado</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-400">{analiseIA.dados?.recursosDeferidos ?? 0}</div>
                          <div className="text-xs text-muted-foreground">Recursos Deferidos</div>
                        </div>
                      </div>
                    </div>

                    {/* Resumo executivo */}
                    <Card className="border-purple-500/20">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-2">
                          <Brain className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-medium text-purple-300 mb-1">Resumo Executivo</div>
                            <p className="text-sm text-foreground">{analiseIA.analise?.resumoExecutivo}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Diagnóstico + Impacto */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                            Diagnóstico (Causa Raiz)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{analiseIA.analise?.diagnostico}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                            Impacto Financeiro e Operacional
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{analiseIA.analise?.impacto}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Sugestões de melhoria */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          Sugestões de Melhoria de Processo (Ações Preventivas)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {(analiseIA.analise?.sugestoesMelhoria ?? []).map((s: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="text-green-400 font-bold shrink-0">{i + 1}.</span>
                              <span className="text-foreground">{s}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    {/* Argumentos para recurso */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-1">
                          <Shield className="h-3.5 w-3.5 text-blue-400" />
                          Argumentos para Recurso de Glosa
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {(analiseIA.analise?.argumentosRecurso ?? []).map((a: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                              <span className="text-foreground">{a}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    {/* Histórico de recursos bem-sucedidos */}
                    {analiseIA.historicoBemSucedido && analiseIA.historicoBemSucedido.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs flex items-center gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                            Histórico de Recursos Deferidos (base de aprendizado)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {analiseIA.historicoBemSucedido.map((h: any, i: number) => (
                              <div key={i} className="p-3 bg-green-500/5 rounded border border-green-500/20">
                                <div className="text-xs font-medium text-green-400 mb-1">{h.convenio}</div>
                                <p className="text-xs text-muted-foreground">{h.justificativa}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
