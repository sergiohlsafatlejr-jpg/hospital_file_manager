import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, Building2, Calendar,
  Stethoscope, Heart, BarChart3, TableIcon, Loader2,
  ArrowUpRight, ArrowDownRight, Minus, FileText, Hash, Filter, X,
  ChevronDown, ChevronRight, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import KpiCard from "@/components/dashboard/KpiCard";
import ChartCard from "@/components/dashboard/ChartCard";
import { toast } from "sonner";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#84cc16", "#e11d48", "#0ea5e9", "#a855f7", "#22c55e",
  "#d946ef", "#0891b2", "#65a30d", "#dc2626", "#7c3aed",
];

function formatCurrency(value: number | null | undefined): string {
  if (value == null || value === 0) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1 max-w-[280px] truncate">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const PieTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold max-w-[280px] truncate">{d.name}</p>
      <p>{formatCurrency(d.value)}</p>
      {d.payload?.percentual != null && (
        <p className="text-muted-foreground">{d.payload.percentual}%</p>
      )}
      <p className="text-xs text-primary mt-1">Clique para filtrar</p>
    </div>
  );
};

function VariacaoBadge({ valor }: { valor: number }) {
  if (valor === 0) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" />
        0%
      </Badge>
    );
  }
  if (valor > 0) {
    return (
      <Badge className="gap-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        <ArrowUpRight className="h-3 w-3" />
        +{valor.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-red-500/20 text-red-400 border-red-500/30">
      <ArrowDownRight className="h-3 w-3" />
      {valor.toFixed(1)}%
    </Badge>
  );
}

// ============================================================
// Sub-componente: Linhas expandidas por convênio dentro de um mês
// ============================================================
function MesExpandido({
  estabelecimentoId,
  anoAtual,
  anoAnterior,
  mes,
}: {
  estabelecimentoId: number;
  anoAtual: number;
  anoAnterior: number;
  mes: string;
}) {
  const { data, isLoading } = trpc.relatorioFaturamento.detalheMesConvenio.useQuery(
    { estabelecimentoId, anoAtual, anoAnterior, mes },
    { enabled: estabelecimentoId > 0 }
  );

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="bg-muted/20">
          <div className="flex items-center gap-2 py-2 pl-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando convênios...
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (!data?.convenios?.length) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="bg-muted/20">
          <div className="py-2 pl-8 text-muted-foreground text-sm">
            Nenhum convênio encontrado neste mês
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.convenios.map((c, i) => (
        <TableRow key={i} className="bg-muted/10 border-l-2 border-l-primary/30">
          <TableCell className="pl-10 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs font-normal">
              {c.convenio}
            </Badge>
          </TableCell>
          <TableCell className="text-right text-sm">
            {c.faturadoAtual > 0 ? formatCurrency(c.faturadoAtual) : "-"}
          </TableCell>
          <TableCell className="text-right text-sm text-muted-foreground">
            {c.faturadoAnterior > 0 ? formatCurrency(c.faturadoAnterior) : "-"}
          </TableCell>
          <TableCell className="text-center text-sm">
            {(c.faturadoAtual > 0 || c.faturadoAnterior > 0) ? (
              <VariacaoBadge valor={c.variacao} />
            ) : "-"}
          </TableCell>
          <TableCell className="text-right text-sm">
            {c.qtdContasAtual > 0 ? formatNumber(c.qtdContasAtual) : "-"}
          </TableCell>
          <TableCell className="text-right text-sm text-muted-foreground">
            {c.qtdContasAnterior > 0 ? formatNumber(c.qtdContasAnterior) : "-"}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ============================================================
// Badge de filtro ativo
// ============================================================
function ActiveFilterBadge({
  type,
  label,
  icon: Icon,
  onClear,
}: {
  type: string;
  label: string;
  icon: any;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="text-xs text-muted-foreground">{type}:</span>
      <span className="text-sm font-medium text-primary">{label}</span>
      <button
        onClick={onClear}
        className="ml-1 p-0.5 rounded-full hover:bg-primary/20 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
      </button>
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function RelatorioFaturamento() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  const anoCorrente = new Date().getFullYear();
  const [anoAtual, setAnoAtual] = useState(anoCorrente);
  const [anoAnterior, setAnoAnterior] = useState(anoCorrente - 1);
  const [carregado, setCarregado] = useState(false);
  const [queryParams, setQueryParams] = useState<{ estabelecimentoId: number; anoAtual: number; anoAnterior: number } | null>(null);

  // Filtros da aba Tabela Comparativa
  const [convenioSelecionado, setConvenioSelecionado] = useState<string>("");
  const [mesesExpandidos, setMesesExpandidos] = useState<Set<string>>(new Set());

  // Filtros do Dashboard (clicáveis nos gráficos)
  const [filtroConvenio, setFiltroConvenio] = useState<string>("");
  const [filtroSetor, setFiltroSetor] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");

  // ============ QUERIES ============

  const { data, isLoading, error } = trpc.relatorioFaturamento.buscar.useQuery(
    queryParams ?? { estabelecimentoId: 0, anoAtual, anoAnterior },
    { enabled: !!queryParams && queryParams.estabelecimentoId > 0 }
  );

  const { data: conveniosDisponiveis } = trpc.relatorioFaturamento.listarConvenios.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 && carregado }
  );

  // Dados filtrados por convênio (aba tabela)
  const { data: dadosConvenio, isLoading: isLoadingConvenio } = trpc.relatorioFaturamento.buscarPorConvenio.useQuery(
    { estabelecimentoId, anoAtual, anoAnterior, convenio: convenioSelecionado },
    { enabled: estabelecimentoId > 0 && carregado && convenioSelecionado.length > 0 }
  );

  // Dados filtrados por convênio (dashboard)
  const { data: dadosConvenioDash, isLoading: isLoadingConvenioDash } = trpc.relatorioFaturamento.buscarPorConvenio.useQuery(
    { estabelecimentoId, anoAtual, anoAnterior, convenio: filtroConvenio },
    { enabled: estabelecimentoId > 0 && carregado && filtroConvenio.length > 0 }
  );

  // Dados filtrados por setor (dashboard)
  const { data: dadosSetorDash, isLoading: isLoadingSetorDash } = trpc.relatorioFaturamento.buscarPorSetor.useQuery(
    { estabelecimentoId, anoAtual, anoAnterior, setor: filtroSetor },
    { enabled: estabelecimentoId > 0 && carregado && filtroSetor.length > 0 }
  );

  // Dados filtrados por tipo de atendimento (dashboard)
  const { data: dadosTipoDash, isLoading: isLoadingTipoDash } = trpc.relatorioFaturamento.buscarPorTipoAtendimento.useQuery(
    { estabelecimentoId, anoAtual, anoAnterior, tipoAtendimento: filtroTipo },
    { enabled: estabelecimentoId > 0 && carregado && filtroTipo.length > 0 }
  );

  // ============ HANDLERS ============

  const handleExportarExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo Geral
    const resumoData = [
      ["Relatório de Faturamento - Comparativo"],
      [""],
      ["Estabelecimento", estabelecimentoAtual?.nome || ""],
      ["Ano Atual", anoAtual],
      ["Ano Comparação", anoAnterior],
      ["Filtro Convênio", convenioSelecionado || "Todos"],
      [""],
      ["Métrica", "Valor"],
      [`Total Faturado ${anoAtual}`, data.acumulado.totalFaturadoAtual],
      [`Total Faturado ${anoAnterior}`, data.acumulado.totalFaturadoAnterior],
      ["Diferença", data.acumulado.totalFaturadoAtual - data.acumulado.totalFaturadoAnterior],
      ["Variação (%)", data.acumulado.variacaoPercentual],
      [`Contas ${anoAtual}`, data.acumulado.qtdContasAtual],
      [`Contas ${anoAnterior}`, data.acumulado.qtdContasAnterior],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoData), "Resumo");

    // Aba 2: Comparativo Mês a Mês
    const mesData = [
      ["Mês", `Faturado ${anoAtual}`, `Faturado ${anoAnterior}`, "Variação (%)", `Contas ${anoAtual}`, `Contas ${anoAnterior}`],
      ...data.tabelaComparativa.map((m) => [
        m.mesNome,
        m.faturadoAtual || 0,
        m.faturadoAnterior || 0,
        m.variacao,
        m.qtdContasAtual || 0,
        m.qtdContasAnterior || 0,
      ]),
      ["TOTAL", data.acumulado.totalFaturadoAtual, data.acumulado.totalFaturadoAnterior, data.acumulado.variacaoPercentual, data.acumulado.qtdContasAtual, data.acumulado.qtdContasAnterior],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mesData), "Mês a Mês");

    // Aba 3: Por Convênio
    if (data.porConvenio?.length) {
      const convData = [
        ["Convênio", "Total Faturado", "Qtd Contas", "Percentual (%)"],
        ...data.porConvenio.map((c) => [
          c.convenio,
          c.totalFaturado,
          c.qtdContas,
          c.percentual,
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(convData), "Por Convênio");
    }

    // Aba 4: Por Setor
    if (data.porSetor?.length) {
      const setorData = [
        ["Setor", "Total Faturado", "Qtd Contas", "Percentual (%)"],
        ...data.porSetor.map((s) => [
          s.setor,
          s.totalFaturado,
          s.qtdContas,
          s.percentual,
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setorData), "Por Setor");
    }

    // Aba 5: Por Tipo de Atendimento
    if (data.porTipoAtendimento?.length) {
      const tipoData = [
        ["Tipo", "Descrição", "Total Faturado", "Qtd Contas", "Percentual (%)"],
        ...data.porTipoAtendimento.map((t) => [
          t.tipo,
          t.tipoDescricao,
          t.totalFaturado,
          t.qtdContas,
          t.percentual,
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tipoData), "Por Tipo Atendimento");
    }

    // Aba 6: Se filtro de convênio ativo, incluir dados detalhados do convênio
    if (convenioSelecionado && dadosConvenio) {
      const convDetalhe = [
        [`Detalhamento: ${convenioSelecionado}`],
        [""],
        ["Mês", `Faturado ${anoAtual}`, `Faturado ${anoAnterior}`, "Variação (%)", `Contas ${anoAtual}`, `Contas ${anoAnterior}`],
        ...dadosConvenio.tabelaComparativa.map((m) => [
          m.mesNome,
          m.faturadoAtual || 0,
          m.faturadoAnterior || 0,
          m.variacao,
          m.qtdContasAtual || 0,
          m.qtdContasAnterior || 0,
        ]),
        ["TOTAL", dadosConvenio.totalFaturadoAtual, dadosConvenio.totalFaturadoAnterior, dadosConvenio.variacaoPercentual, dadosConvenio.qtdContasAtual, dadosConvenio.qtdContasAnterior],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(convDetalhe), convenioSelecionado.substring(0, 31));
    }

    const nomeArquivo = `Relatorio_Faturamento_${anoAtual}_vs_${anoAnterior}${convenioSelecionado ? `_${convenioSelecionado}` : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success("Relatório exportado com sucesso!");
  };

  const handleCarregar = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Selecione um estabelecimento primeiro");
      return;
    }
    setCarregado(true);
    setConvenioSelecionado("");
    setMesesExpandidos(new Set());
    clearDashFilters();
    setQueryParams({ estabelecimentoId, anoAtual, anoAnterior });
  };

  const clearDashFilters = () => {
    setFiltroConvenio("");
    setFiltroSetor("");
    setFiltroTipo("");
  };

  const handleClickSetor = (setorName: string) => {
    // Resolve truncated name back to full name
    const fullSetor = data?.porSetor.find(s => {
      const truncated = s.setor.length > 25 ? s.setor.slice(0, 25) + "..." : s.setor;
      return truncated === setorName || s.setor === setorName;
    })?.setor || setorName;

    if (filtroSetor === fullSetor) {
      setFiltroSetor("");
    } else {
      setFiltroSetor(fullSetor);
      setFiltroConvenio("");
      setFiltroTipo("");
    }
  };

  const handleClickTipo = (tipoDesc: string) => {
    const tipoObj = data?.porTipoAtendimento.find(t => t.tipoDescricao === tipoDesc);
    const tipoCode = tipoObj?.tipo || tipoDesc;

    if (filtroTipo === tipoCode) {
      setFiltroTipo("");
    } else {
      setFiltroTipo(tipoCode);
      setFiltroConvenio("");
      setFiltroSetor("");
    }
  };

  const handleClickConvenio = (convenioName: string) => {
    const fullConvenio = data?.porConvenio.find(c => {
      const truncated = c.convenio.length > 25 ? c.convenio.slice(0, 25) + "..." : c.convenio;
      return truncated === convenioName || c.convenio === convenioName;
    })?.convenio || convenioName;

    if (filtroConvenio === fullConvenio) {
      setFiltroConvenio("");
    } else {
      setFiltroConvenio(fullConvenio);
      setFiltroSetor("");
      setFiltroTipo("");
    }
  };

  const toggleMesExpandido = (mes: string) => {
    setMesesExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(mes)) next.delete(mes);
      else next.add(mes);
      return next;
    });
  };

  // ============ COMPUTED DATA ============

  const hasDashFilter = filtroConvenio || filtroSetor || filtroTipo;
  const isLoadingDashFilter = isLoadingConvenioDash || isLoadingSetorDash || isLoadingTipoDash;

  // Determine which filtered data to use for dashboard
  const dashboardEfetivo = useMemo(() => {
    if (filtroConvenio && dadosConvenioDash) {
      return {
        totalFaturadoAtual: dadosConvenioDash.totalFaturadoAtual,
        totalFaturadoAnterior: dadosConvenioDash.totalFaturadoAnterior,
        variacaoPercentual: dadosConvenioDash.variacaoPercentual,
        qtdContasAtual: dadosConvenioDash.qtdContasAtual,
        qtdContasAnterior: dadosConvenioDash.qtdContasAnterior,
        tabelaComparativa: dadosConvenioDash.tabelaComparativa,
      };
    }
    if (filtroSetor && dadosSetorDash) {
      return {
        totalFaturadoAtual: dadosSetorDash.totalFaturadoAtual,
        totalFaturadoAnterior: dadosSetorDash.totalFaturadoAnterior,
        variacaoPercentual: dadosSetorDash.variacaoPercentual,
        qtdContasAtual: dadosSetorDash.qtdContasAtual,
        qtdContasAnterior: dadosSetorDash.qtdContasAnterior,
        tabelaComparativa: dadosSetorDash.tabelaComparativa,
      };
    }
    if (filtroTipo && dadosTipoDash) {
      return {
        totalFaturadoAtual: dadosTipoDash.totalFaturadoAtual,
        totalFaturadoAnterior: dadosTipoDash.totalFaturadoAnterior,
        variacaoPercentual: dadosTipoDash.variacaoPercentual,
        qtdContasAtual: dadosTipoDash.qtdContasAtual,
        qtdContasAnterior: dadosTipoDash.qtdContasAnterior,
        tabelaComparativa: dadosTipoDash.tabelaComparativa,
      };
    }
    if (data) {
      return {
        totalFaturadoAtual: data.acumulado.totalFaturadoAtual,
        totalFaturadoAnterior: data.acumulado.totalFaturadoAnterior,
        variacaoPercentual: data.acumulado.variacaoPercentual,
        qtdContasAtual: data.acumulado.qtdContasAtual,
        qtdContasAnterior: data.acumulado.qtdContasAnterior,
        tabelaComparativa: data.tabelaComparativa,
      };
    }
    return null;
  }, [filtroConvenio, dadosConvenioDash, filtroSetor, dadosSetorDash, filtroTipo, dadosTipoDash, data]);

  // Tabela comparativa (aba tabela)
  const tabelaEfetiva = useMemo(() => {
    if (convenioSelecionado && dadosConvenio) {
      return {
        tabelaComparativa: dadosConvenio.tabelaComparativa,
        totalFaturadoAtual: dadosConvenio.totalFaturadoAtual,
        totalFaturadoAnterior: dadosConvenio.totalFaturadoAnterior,
        variacaoPercentual: dadosConvenio.variacaoPercentual,
        qtdContasAtual: dadosConvenio.qtdContasAtual,
        qtdContasAnterior: dadosConvenio.qtdContasAnterior,
      };
    }
    if (data) {
      return {
        tabelaComparativa: data.tabelaComparativa,
        totalFaturadoAtual: data.acumulado.totalFaturadoAtual,
        totalFaturadoAnterior: data.acumulado.totalFaturadoAnterior,
        variacaoPercentual: data.acumulado.variacaoPercentual,
        qtdContasAtual: data.acumulado.qtdContasAtual,
        qtdContasAnterior: data.acumulado.qtdContasAnterior,
      };
    }
    return null;
  }, [convenioSelecionado, dadosConvenio, data]);

  // Chart data
  const chartMesComparativo = useMemo(() => {
    if (!dashboardEfetivo?.tabelaComparativa) return [];
    return dashboardEfetivo.tabelaComparativa
      .filter(m => m.faturadoAtual > 0 || m.faturadoAnterior > 0)
      .map(m => ({
        mes: m.mesNome.substring(0, 3),
        [`${anoAtual}`]: m.faturadoAtual,
        [`${anoAnterior}`]: m.faturadoAnterior,
      }));
  }, [dashboardEfetivo?.tabelaComparativa, anoAtual, anoAnterior]);

  const chartSetor = useMemo(() => {
    if (!data?.porSetor) return [];
    return data.porSetor.slice(0, 12).map(s => ({
      ...s,
      nome: s.setor.length > 25 ? s.setor.slice(0, 25) + "..." : s.setor,
      fullName: s.setor,
    }));
  }, [data?.porSetor]);

  const chartTipo = useMemo(() => {
    if (!data?.porTipoAtendimento) return [];
    return data.porTipoAtendimento.map(t => ({
      name: t.tipoDescricao,
      value: t.totalFaturado,
      percentual: t.percentual,
      tipo: t.tipo,
    }));
  }, [data?.porTipoAtendimento]);

  const chartConvenio = useMemo(() => {
    if (!data?.porConvenio) return [];
    return data.porConvenio.slice(0, 12).map(c => ({
      ...c,
      nome: c.convenio.length > 25 ? c.convenio.slice(0, 25) + "..." : c.convenio,
      fullName: c.convenio,
    }));
  }, [data?.porConvenio]);

  const anosDisponiveis = useMemo(() => {
    const anos = [];
    for (let a = anoCorrente; a >= anoCorrente - 5; a--) anos.push(a);
    return anos;
  }, [anoCorrente]);

  // Filter label for chart title
  const filterLabel = filtroConvenio
    ? `Convênio: ${filtroConvenio}`
    : filtroSetor
    ? `Setor: ${filtroSetor}`
    : filtroTipo
    ? `Tipo: ${(data?.porTipoAtendimento.find(t => t.tipo === filtroTipo)?.tipoDescricao) || filtroTipo}`
    : "";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-card-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Relatório de Faturamento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise comparativa do faturamento por período, setor, convênio e tipo de atendimento
            </p>
          </div>
        </div>

        {/* Filtros de Ano */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4 justify-between">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ano Atual</label>
                <Select value={String(anoAtual)} onValueChange={(v) => { setAnoAtual(Number(v)); setAnoAnterior(Number(v) - 1); }}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(a => (<SelectItem key={a} value={String(a)}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ano Comparação</label>
                <Select value={String(anoAnterior)} onValueChange={(v) => setAnoAnterior(Number(v))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(a => (<SelectItem key={a} value={String(a)}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCarregar} disabled={isLoading || estabelecimentoId === 0}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Carregar
              </Button>
              {estabelecimentoId === 0 && (
                <p className="text-sm text-amber-400">Selecione um estabelecimento primeiro</p>
              )}
            </div>
            {data && (
              <Button variant="outline" size="sm" onClick={handleExportarExcel} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar Excel
              </Button>
            )}
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && carregado && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-32 rounded-xl" />))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-80 rounded-xl" />))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <DollarSign className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione o período e clique em "Carregar"</p>
            <p className="text-sm mt-1">Os dados serão buscados da tabela de faturamento integrado</p>
          </div>
        )}

        {/* Error state */}
        {error && carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <DollarSign className="h-16 w-16 mb-4 opacity-30 text-red-400" />
            <p className="text-lg font-medium text-red-400">Erro ao carregar dados</p>
            <p className="text-sm mt-1">{error.message}</p>
            <Button variant="outline" className="mt-4" onClick={handleCarregar}>Tentar novamente</Button>
          </div>
        )}

        {/* No data state */}
        {carregado && !isLoading && !error && data && data.acumulado.totalFaturadoAtual === 0 && data.acumulado.totalFaturadoAnterior === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <DollarSign className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum dado encontrado</p>
            <p className="text-sm mt-1">Não há registros de faturamento para o estabelecimento e período selecionados</p>
          </div>
        )}

        {/* Data loaded */}
        {data && !isLoading && !error && (data.acumulado.totalFaturadoAtual > 0 || data.acumulado.totalFaturadoAnterior > 0) && (
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList>
              <TabsTrigger value="dashboard" className="gap-2">
                <BarChart3 className="h-4 w-4" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="tabela" className="gap-2">
                <TableIcon className="h-4 w-4" /> Tabela Comparativa
              </TabsTrigger>
            </TabsList>

            {/* ========== ABA DASHBOARD ========== */}
            <TabsContent value="dashboard" className="space-y-6">

              {/* Filtros ativos (badges) */}
              {hasDashFilter && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
                        <Filter className="h-3.5 w-3.5" />
                        Filtro ativo:
                      </div>
                      {filtroConvenio && (
                        <ActiveFilterBadge
                          type="Convênio"
                          label={filtroConvenio}
                          icon={Heart}
                          onClear={() => setFiltroConvenio("")}
                        />
                      )}
                      {filtroSetor && (
                        <ActiveFilterBadge
                          type="Setor"
                          label={filtroSetor}
                          icon={Building2}
                          onClear={() => setFiltroSetor("")}
                        />
                      )}
                      {filtroTipo && (
                        <ActiveFilterBadge
                          type="Tipo"
                          label={(data?.porTipoAtendimento.find(t => t.tipo === filtroTipo)?.tipoDescricao) || filtroTipo}
                          icon={Stethoscope}
                          onClear={() => setFiltroTipo("")}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearDashFilters}
                        className="text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                        Limpar todos
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hint: clique nos gráficos */}
              {!hasDashFilter && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                  <Filter className="h-3 w-3" />
                  Clique nas barras ou fatias dos gráficos abaixo para filtrar os KPIs e a evolução mensal
                </div>
              )}

              {/* Loading filtro dashboard */}
              {isLoadingDashFilter && hasDashFilter && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Carregando dados filtrados...</span>
                </div>
              )}

              {/* KPIs Acumulado */}
              {dashboardEfetivo && !isLoadingDashFilter && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key={`kpis-${filtroConvenio}-${filtroSetor}-${filtroTipo}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    title={`Faturado ${anoAtual}`}
                    value={formatCurrency(dashboardEfetivo.totalFaturadoAtual)}
                    subtitle={filterLabel || "Acumulado no ano"}
                    icon={DollarSign}
                    gradient="blue"
                    trend={{ value: dashboardEfetivo.variacaoPercentual, label: `vs ${anoAnterior}` }}
                  />
                  <KpiCard
                    title={`Faturado ${anoAnterior}`}
                    value={formatCurrency(dashboardEfetivo.totalFaturadoAnterior)}
                    subtitle={filterLabel || "Acumulado no ano"}
                    icon={DollarSign}
                    gradient="violet"
                  />
                  <KpiCard
                    title={`Contas ${anoAtual}`}
                    value={formatNumber(dashboardEfetivo.qtdContasAtual)}
                    subtitle="Contas distintas"
                    icon={Hash}
                    gradient="emerald"
                  />
                  <KpiCard
                    title={`Contas ${anoAnterior}`}
                    value={formatNumber(dashboardEfetivo.qtdContasAnterior)}
                    subtitle="Contas distintas"
                    icon={Hash}
                    gradient="amber"
                  />
                </div>
              </motion.div>
              )}

              {/* Gráfico Evolução Mensal - LINHAS */}
              {dashboardEfetivo && !isLoadingDashFilter && (
              <ChartCard
                title={`Evolução Mensal${filterLabel ? ` - ${filterLabel}` : ""}: ${anoAtual} vs ${anoAnterior}`}
                icon={TrendingUp}
              >
                {chartMesComparativo.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartMesComparativo}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Legend />
                      <Line type="monotone" dataKey={String(anoAtual)} name={String(anoAtual)} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey={String(anoAnterior)} name={String(anoAnterior)} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[350px] text-muted-foreground">Sem dados para exibir</div>
                )}
              </ChartCard>
              )}

              {/* Gráficos: Por Setor e Por Tipo de Atendimento (sempre visíveis) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Por Setor - CLICÁVEL */}
                <ChartCard
                  title={`Faturamento por Setor (${anoAtual})`}
                  icon={Building2}
                >
                  <p className="text-xs text-muted-foreground mb-2 px-1">Clique em um setor para filtrar</p>
                  {chartSetor.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(250, chartSetor.length * 32)}>
                      <BarChart
                        data={chartSetor}
                        layout="vertical"
                        margin={{ left: 10 }}
                        onClick={(e: any) => {
                          if (e?.activePayload?.[0]?.payload) {
                            const d = e.activePayload[0].payload;
                            handleClickSetor(d.fullName || d.nome);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                        <YAxis type="category" dataKey="nome" width={180} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltipContent />} />
                        <Bar
                          dataKey="totalFaturado"
                          name="Faturado"
                          radius={[0, 6, 6, 0]}
                          cursor="pointer"
                        >
                          {chartSetor.map((s, i) => (
                            <Cell
                              key={i}
                              fill={filtroSetor === s.fullName ? "#22d3ee" : CHART_COLORS[i % CHART_COLORS.length]}
                              stroke={filtroSetor === s.fullName ? "#22d3ee" : "none"}
                              strokeWidth={filtroSetor === s.fullName ? 2 : 0}
                              opacity={filtroSetor && filtroSetor !== s.fullName ? 0.3 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">Sem dados</div>
                  )}
                </ChartCard>

                {/* Por Tipo de Atendimento - CLICÁVEL */}
                <ChartCard
                  title={`Faturamento por Tipo de Atendimento (${anoAtual})`}
                  icon={Stethoscope}
                >
                  <p className="text-xs text-muted-foreground mb-2 px-1">Clique em uma fatia para filtrar</p>
                  {chartTipo.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart
                        onClick={(e: any) => {
                          if (e?.activePayload?.[0]?.payload?.name) {
                            handleClickTipo(e.activePayload[0].payload.name);
                          }
                        }}
                      >
                        <Pie
                          data={chartTipo}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          innerRadius={60}
                          paddingAngle={3}
                          label={({ name, percentual }) => `${name} (${percentual}%)`}
                          labelLine={true}
                          cursor="pointer"
                          onClick={(pieData: any) => {
                            if (pieData?.name) {
                              handleClickTipo(pieData.name);
                            }
                          }}
                        >
                          {chartTipo.map((t, i) => (
                            <Cell
                              key={i}
                              fill={filtroTipo === t.tipo ? "#22d3ee" : CHART_COLORS[i % CHART_COLORS.length]}
                              opacity={filtroTipo && filtroTipo !== t.tipo ? 0.3 : 1}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[350px] text-muted-foreground">Sem dados</div>
                  )}
                </ChartCard>
              </div>

              {/* Gráfico: Por Convênio - CLICÁVEL */}
              <ChartCard
                title={`Faturamento por Convênio - Top 12 (${anoAtual})`}
                icon={Heart}
              >
                <p className="text-xs text-muted-foreground mb-2 px-1">Clique em um convênio para filtrar</p>
                {chartConvenio.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(250, chartConvenio.length * 32)}>
                    <BarChart
                      data={chartConvenio}
                      layout="vertical"
                      margin={{ left: 10 }}
                      onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload) {
                          const d = e.activePayload[0].payload;
                          handleClickConvenio(d.fullName || d.nome);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <YAxis type="category" dataKey="nome" width={180} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Bar
                        dataKey="totalFaturado"
                        name="Faturado"
                        radius={[0, 6, 6, 0]}
                        cursor="pointer"
                      >
                        {chartConvenio.map((c, i) => (
                          <Cell
                            key={i}
                            fill={filtroConvenio === c.fullName ? "#22d3ee" : CHART_COLORS[i % CHART_COLORS.length]}
                            stroke={filtroConvenio === c.fullName ? "#22d3ee" : "none"}
                            strokeWidth={filtroConvenio === c.fullName ? 2 : 0}
                            opacity={filtroConvenio && filtroConvenio !== c.fullName ? 0.3 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground">Sem dados</div>
                )}
              </ChartCard>

              {/* Tabelas de ranking (só quando sem filtro) */}
              {!hasDashFilter && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title={`Ranking de Setores (${anoAtual})`} icon={Building2}>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Setor</TableHead>
                          <TableHead className="text-right">Faturado</TableHead>
                          <TableHead className="text-right">Contas</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.porSetor.slice(0, 15).map((s, i) => (
                          <TableRow
                            key={i}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleClickSetor(s.setor)}
                          >
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={s.setor}>{s.setor}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(s.totalFaturado)}</TableCell>
                            <TableCell className="text-right">{formatNumber(s.qtdContas)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{s.percentual}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ChartCard>

                <ChartCard title={`Ranking de Convênios (${anoAtual})`} icon={Heart}>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Convênio</TableHead>
                          <TableHead className="text-right">Faturado</TableHead>
                          <TableHead className="text-right">Contas</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.porConvenio.map((c, i) => (
                          <TableRow
                            key={i}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleClickConvenio(c.convenio)}
                          >
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={c.convenio}>{c.convenio}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(c.totalFaturado)}</TableCell>
                            <TableCell className="text-right">{formatNumber(c.qtdContas)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{c.percentual}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ChartCard>
              </div>
              )}

              {/* Ranking Tipo de Atendimento (só quando sem filtro) */}
              {!hasDashFilter && (
              <ChartCard title={`Faturamento por Tipo de Atendimento (${anoAtual})`} icon={Stethoscope}>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Contas</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.porTipoAtendimento.map((t, i) => (
                        <TableRow
                          key={i}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleClickTipo(t.tipoDescricao)}
                        >
                          <TableCell><Badge variant="secondary">{t.tipo}</Badge></TableCell>
                          <TableCell>{t.tipoDescricao}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(t.totalFaturado)}</TableCell>
                          <TableCell className="text-right">{formatNumber(t.qtdContas)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{t.percentual}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ChartCard>
              )}
            </TabsContent>

            {/* ========== ABA TABELA COMPARATIVA ========== */}
            <TabsContent value="tabela" className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Filtro por Convênio */}
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="space-y-1.5 flex-1 min-w-[250px] max-w-[400px]">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Filter className="h-3 w-3" />
                          Filtrar por Convênio
                        </label>
                        <Select
                          value={convenioSelecionado || "__todos__"}
                          onValueChange={(v) => {
                            setConvenioSelecionado(v === "__todos__" ? "" : v);
                            setMesesExpandidos(new Set());
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Todos os convênios" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__todos__">Todos os convênios</SelectItem>
                            {(conveniosDisponiveis || []).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {convenioSelecionado && (
                        <Button variant="outline" size="sm" onClick={() => { setConvenioSelecionado(""); setMesesExpandidos(new Set()); }} className="gap-1.5">
                          <X className="h-3.5 w-3.5" />
                          Limpar filtro
                        </Button>
                      )}
                      {convenioSelecionado && (
                        <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                          <Heart className="h-3.5 w-3.5" />
                          {convenioSelecionado}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Loading convênio */}
                {isLoadingConvenio && convenioSelecionado && (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Carregando dados de {convenioSelecionado}...</span>
                  </div>
                )}

                {/* KPIs resumo */}
                {tabelaEfetiva && !isLoadingConvenio && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <KpiCard
                    title={`Total ${anoAtual}`}
                    value={formatCurrency(tabelaEfetiva.totalFaturadoAtual)}
                    subtitle={convenioSelecionado || "Acumulado"}
                    icon={DollarSign}
                    gradient="blue"
                    trend={{ value: tabelaEfetiva.variacaoPercentual, label: `vs ${anoAnterior}` }}
                  />
                  <KpiCard
                    title={`Total ${anoAnterior}`}
                    value={formatCurrency(tabelaEfetiva.totalFaturadoAnterior)}
                    subtitle={convenioSelecionado || "Acumulado"}
                    icon={DollarSign}
                    gradient="violet"
                  />
                  <KpiCard
                    title="Diferença"
                    value={formatCurrency(tabelaEfetiva.totalFaturadoAtual - tabelaEfetiva.totalFaturadoAnterior)}
                    subtitle={`${anoAtual} - ${anoAnterior}`}
                    icon={tabelaEfetiva.variacaoPercentual >= 0 ? TrendingUp : TrendingDown}
                    gradient={tabelaEfetiva.variacaoPercentual >= 0 ? "emerald" : "amber"}
                  />
                  <KpiCard
                    title="Variação"
                    value={`${tabelaEfetiva.variacaoPercentual > 0 ? "+" : ""}${tabelaEfetiva.variacaoPercentual.toFixed(1)}%`}
                    subtitle="Percentual"
                    icon={tabelaEfetiva.variacaoPercentual >= 0 ? TrendingUp : TrendingDown}
                    gradient={tabelaEfetiva.variacaoPercentual >= 0 ? "emerald" : "amber"}
                  />
                </div>
                )}

                {/* Tabela Mês a Mês */}
                {tabelaEfetiva && !isLoadingConvenio && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Comparativo Mês a Mês
                      {convenioSelecionado && (
                        <Badge variant="outline" className="ml-2 text-xs">{convenioSelecionado}</Badge>
                      )}
                      {!convenioSelecionado && (
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          Clique no mês para ver detalhamento por convênio
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mês</TableHead>
                            <TableHead className="text-right">Faturado {anoAtual}</TableHead>
                            <TableHead className="text-right">Faturado {anoAnterior}</TableHead>
                            <TableHead className="text-center">Variação</TableHead>
                            <TableHead className="text-right">Contas {anoAtual}</TableHead>
                            <TableHead className="text-right">Contas {anoAnterior}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tabelaEfetiva.tabelaComparativa.map((m, i) => {
                            const temDados = m.faturadoAtual > 0 || m.faturadoAnterior > 0;
                            const isExpandido = mesesExpandidos.has(m.mes);
                            const podeExpandir = !convenioSelecionado && temDados;
                            return (
                              <>{/* Fragment key on outer */}
                                <TableRow
                                  key={`row-${i}`}
                                  className={`${!temDados ? "opacity-40" : ""} ${podeExpandir ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                                  onClick={() => podeExpandir && toggleMesExpandido(m.mes)}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      {podeExpandir && (
                                        isExpandido ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      {m.mesNome}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {m.faturadoAtual > 0 ? formatCurrency(m.faturadoAtual) : "-"}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {m.faturadoAnterior > 0 ? formatCurrency(m.faturadoAnterior) : "-"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {temDados ? <VariacaoBadge valor={m.variacao} /> : "-"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {m.qtdContasAtual > 0 ? formatNumber(m.qtdContasAtual) : "-"}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {m.qtdContasAnterior > 0 ? formatNumber(m.qtdContasAnterior) : "-"}
                                  </TableCell>
                                </TableRow>
                                {isExpandido && (
                                  <MesExpandido
                                    key={`expand-${i}`}
                                    estabelecimentoId={estabelecimentoId}
                                    anoAtual={anoAtual}
                                    anoAnterior={anoAnterior}
                                    mes={m.mes}
                                  />
                                )}
                              </>
                            );
                          })}

                          {/* Totais */}
                          <TableRow className="border-t-2 border-primary/30 font-bold bg-muted/30">
                            <TableCell>TOTAL</TableCell>
                            <TableCell className="text-right">{formatCurrency(tabelaEfetiva.totalFaturadoAtual)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(tabelaEfetiva.totalFaturadoAnterior)}</TableCell>
                            <TableCell className="text-center"><VariacaoBadge valor={tabelaEfetiva.variacaoPercentual} /></TableCell>
                            <TableCell className="text-right">{formatNumber(tabelaEfetiva.qtdContasAtual)}</TableCell>
                            <TableCell className="text-right">{formatNumber(tabelaEfetiva.qtdContasAnterior)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                )}

                {/* Gráfico de linha comparativo */}
                {tabelaEfetiva && !isLoadingConvenio && (
                <ChartCard title={`Evolução Mensal${convenioSelecionado ? ` - ${convenioSelecionado}` : ""}: ${anoAtual} vs ${anoAnterior}`} icon={TrendingUp}>
                  {(() => {
                    const chartData = (tabelaEfetiva?.tabelaComparativa || [])
                      .filter(m => m.faturadoAtual > 0 || m.faturadoAnterior > 0)
                      .map(m => ({
                        mes: m.mesNome.substring(0, 3),
                        [`${anoAtual}`]: m.faturadoAtual,
                        [`${anoAnterior}`]: m.faturadoAnterior,
                      }));
                    return chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                        <Tooltip content={<CustomTooltipContent />} />
                        <Legend />
                        <Line type="monotone" dataKey={String(anoAtual)} name={String(anoAtual)} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey={String(anoAnterior)} name={String(anoAnterior)} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[350px] text-muted-foreground">Sem dados para exibir</div>
                    );
                  })()}
                </ChartCard>
                )}
              </motion.div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
