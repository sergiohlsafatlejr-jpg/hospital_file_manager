import { Fragment, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { LancamentosManuaisDialog } from "@/components/bi/LancamentosManuaisDialog";
import { ImportarWarleineDialog } from "@/components/bi/ImportarWarleineDialog";
import { BiAutoRefreshBar } from "@/components/bi/BiAutoRefreshBar";
import { BI_AUTO_REFRESH_INTERVAL_MS } from "@shared/biAutoRefresh";
import { criarTooltipFinanceiro, type FinanceiroTooltipMetric } from "@/lib/faturadoRecebidoTooltip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Download,
  FilePenLine,
  FileSpreadsheet,
  Filter,
  HandCoins,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const COLORS = { navy: "#243653", blue: "#4777b7", teal: "#17847e", coral: "#d0576b", amber: "#d3952f", violet: "#7664a8", grid: "#e5e7eb" };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const compact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const percent = (value: number) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const monthLabel = (value: string) => value === "Sem competência" ? value : `${value.slice(5, 7)}/${value.slice(0, 4)}`;
const short = (value: string, max = 30) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

function MetricCard({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: LucideIcon; tone: "navy" | "blue" | "teal" | "coral" | "amber" | "violet" }) {
  const styles = {
    navy: "bg-slate-900 text-white border-slate-800",
    blue: "bg-blue-50 text-blue-900 border-blue-100",
    teal: "bg-teal-50 text-teal-900 border-teal-100",
    coral: "bg-rose-50 text-rose-900 border-rose-100",
    amber: "bg-amber-50 text-amber-900 border-amber-100",
    violet: "bg-violet-50 text-violet-900 border-violet-100",
  }[tone];
  return <div className={`rounded-2xl border p-4 shadow-sm ${styles}`}>
    <div className="flex items-start justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p><Icon className="h-4 w-4 opacity-75" /></div>
    <p className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">{value}</p><p className="mt-1 text-xs opacity-65">{helper}</p>
  </div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>;
}

const TOOLTIP_TONES: Record<FinanceiroTooltipMetric["tone"], string> = {
  neutral: "text-slate-900",
  positive: "text-teal-700",
  negative: "text-rose-700",
  warning: "text-amber-700",
  info: "text-blue-700",
  violet: "text-violet-700",
};

function TooltipMetric({ metric }: { metric: FinanceiroTooltipMetric }) {
  const value = metric.format === "money" ? money(metric.value) : metric.format === "percent" ? percent(metric.value) : Number(metric.value || 0).toLocaleString("pt-BR");
  return <div className="flex items-baseline justify-between gap-5 py-1 text-xs"><span className="text-slate-500">{metric.label}</span><strong className={`text-right tabular-nums ${TOOLTIP_TONES[metric.tone]}`}>{value}</strong></div>;
}

function FinancialTooltip({ active, payload, context = "mes" }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const model = criarTooltipFinanceiro(row, context, { monthLabel });
  return <div className="pointer-events-none w-[min(86vw,370px)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-sm">
    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{model.eyebrow}</p>
    <p className="mt-1 text-sm font-bold leading-5 text-slate-950">{model.title}</p>
    {model.description && <p className="mt-1 text-[11px] leading-4 text-slate-500">{model.description}</p>}
    <div className="mt-3 border-t border-slate-100 pt-2">{model.metrics.map((metric) => <TooltipMetric key={metric.label} metric={metric} />)}</div>
    {!!model.resourceMetrics.length && <><p className="mt-3 border-t border-slate-100 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Tratamento das glosas</p><div className="mt-1">{model.resourceMetrics.map((metric) => <TooltipMetric key={metric.label} metric={metric} />)}</div></>}
  </div>;
}

function Ranking({ data, labelKey, color, totalGlosado }: { data: any[]; labelKey: string; color: string; totalGlosado: number }) {
  const rows = data.slice(0, 8).map((row) => ({ ...row, label: short(String(row[labelKey] || "Não informado"), 27) }));
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Nenhuma glosa encontrada no recorte.</div>;
  return <ResponsiveContainer width="100%" height={Math.max(280, rows.length * 42)}><BarChart data={rows} layout="vertical" margin={{ left: 5, right: 18 }} accessibilityLayer><CartesianGrid stroke={COLORS.grid} horizontal={false} /><XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10, fill: COLORS.navy }} axisLine={false} tickLine={false} /><RechartsTooltip content={<RankingTooltip totalGlosado={totalGlosado} />} cursor={{ fill: "#f8fafc" }} animationDuration={150} wrapperStyle={{ outline: "none", zIndex: 30 }} allowEscapeViewBox={{ x: false, y: true }} /><Bar dataKey="valorGlosado" name="Valor glosado" fill={color} radius={[0, 7, 7, 0]} barSize={19} /></BarChart></ResponsiveContainer>;
}

function RankingTooltip({ active, payload, totalGlosado }: any) {
  if (!active || !payload?.length) return null;
  const model = criarTooltipFinanceiro(payload[0]?.payload || {}, "ranking", { totalGlosado });
  return <div className="pointer-events-none w-[min(86vw,360px)] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-sm">
    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{model.eyebrow}</p>
    <p className="mt-1 text-sm font-bold leading-5 text-slate-950">{model.title}</p>
    {model.description && <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{model.description}</p>}
    <div className="mt-3 border-t border-slate-100 pt-2">{model.metrics.map((metric) => <TooltipMetric key={metric.label} metric={metric} />)}</div>
  </div>;
}

export function FaturadoRecebidoView({ fonte = "OFICIAL" }: { fonte?: "OFICIAL" | "WARLEINE" }) {
  const { estabelecimentoAtual, temAcessoModulo } = useEstabelecimento();
  const isWarleine = fonte === "WARLEINE";
  const [competencia, setCompetencia] = useState<string | undefined>();
  const [convenio, setConvenio] = useState<string | undefined>();
  const [criterioPeriodo, setCriterioPeriodo] = useState<"PAGAMENTO" | "FATURAMENTO">("PAGAMENTO");
  const [cadastroManualAberto, setCadastroManualAberto] = useState(false);
  const [importarWarleineAberto, setImportarWarleineAberto] = useState(false);

  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const isHopHup = isWarleine && estabelecimentoId === 1260036;
  const [observouProcessamento, setObservouProcessamento] = useState(false);
  const [autoRefreshAtivo, setAutoRefreshAtivo] = useState(true);
  const [visaoDrilldown, setVisaoDrilldown] = useState<"CONVENIO_MES" | "MES_CONVENIO">("CONVENIO_MES");
  const [conveniosExpandidos, setConveniosExpandidos] = useState<Set<string>>(new Set());
  const [mesesExpandidos, setMesesExpandidos] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCompetencia(undefined);
    setConvenio(undefined);
    setCriterioPeriodo("PAGAMENTO");
    setObservouProcessamento(false);
    setConveniosExpandidos(new Set());
    setMesesExpandidos(new Set());
  }, [estabelecimentoId]);
  const officialInput = useMemo(() => ({ estabelecimentoId, criterioPeriodo, competencia, convenio, limite: 10 }), [estabelecimentoId, criterioPeriodo, competencia, convenio]);
  const warleineInput = useMemo(() => ({ estabelecimentoId, competencia, convenio, limite: 10 }), [estabelecimentoId, competencia, convenio]);
  const officialQuery = trpc.faturadoRecebidoUnificado.dados.useQuery(officialInput, {
    enabled: estabelecimentoId > 0 && !isWarleine,
    staleTime: 0,
    placeholderData: (previous) => previous,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    refetchInterval: autoRefreshAtivo ? BI_AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  const warleineQuery = trpc.warleineFaturamento.faturadoRecebido.useQuery(warleineInput, {
    enabled: estabelecimentoId > 0 && isWarleine,
    staleTime: 0,
    placeholderData: (previous) => previous,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    refetchInterval: autoRefreshAtivo ? BI_AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  const query = (isWarleine ? warleineQuery : officialQuery) as typeof officialQuery;
  const processamentoQuery = trpc.arquivos.processando.useQuery(
    { estabelecimentoId },
    {
      enabled: estabelecimentoId > 0 && !isWarleine && autoRefreshAtivo,
      refetchInterval: (state) => state.state.data?.length ? 3_000 : 15_000,
      refetchIntervalInBackground: true,
    },
  );
  const arquivosEmProcessamento = processamentoQuery.data?.length || 0;

  useEffect(() => {
    if (isWarleine || !autoRefreshAtivo) return;
    if (arquivosEmProcessamento > 0) {
      setObservouProcessamento(true);
      return;
    }
    if (observouProcessamento) {
      setObservouProcessamento(false);
      void query.refetch().then(() => toast.success("Importações concluídas e relatório atualizado."));
    }
  }, [arquivosEmProcessamento, observouProcessamento, query.refetch, isWarleine, autoRefreshAtivo]);
  const data = query.data;
  const convenioOptions: Array<{ chave: string; nome: string }> = isWarleine
    ? ((data as any)?.filtrosDisponiveis?.conveniosDetalhes || [])
    : (data?.filtrosDisponiveis.convenios || []).map((nome) => ({ chave: nome, nome }));
  const convenioSelecionadoNome = convenioOptions.find((item) => item.chave === convenio)?.nome || convenio;
  const mesesGrafico = (data?.porMes || []).filter((item: any) => item.competencia !== "Sem competência").slice(-12);
  const periodoLabel = isWarleine || criterioPeriodo === "FATURAMENTO" ? "Competência" : "Mês do pagamento";

  const toggleConvenio = (value: string) => setConvenio((current) => current === value ? undefined : value);
  const toggleMes = (value: string) => setCompetencia((current) => current === value ? undefined : value);
  const clear = () => { setCompetencia(undefined); setConvenio(undefined); };
  const alterarCriterioPeriodo = (value: "PAGAMENTO" | "FATURAMENTO") => {
    setCriterioPeriodo(value);
    setCompetencia(undefined);
  };

  const toggleExpandirConvenio = (chave: string) => {
    setConveniosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  const toggleExpandirMes = (comp: string) => {
    setMesesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(comp)) next.delete(comp);
      else next.add(comp);
      return next;
    });
  };

  const mesesOrdenadosDesc = useMemo(() => {
    if (!data?.porMes) return [];
    return [...data.porMes].sort((a: any, b: any) => {
      if (a.competencia === "Sem competência") return 1;
      if (b.competencia === "Sem competência") return -1;
      return String(b.competencia).localeCompare(String(a.competencia));
    });
  }, [data?.porMes]);

  const expandirTodos = () => {
    if (!data) return;
    if (visaoDrilldown === "CONVENIO_MES") {
      const todasChaves = data.porConvenio.map((row: any) => isWarleine ? (row.convenioChave || row.convenio) : row.convenio);
      setConveniosExpandidos(new Set(todasChaves));
    } else {
      setMesesExpandidos(new Set(mesesOrdenadosDesc.map((row: any) => String(row.competencia))));
    }
  };

  const recolherTodos = () => {
    if (visaoDrilldown === "CONVENIO_MES") setConveniosExpandidos(new Set());
    else setMesesExpandidos(new Set());
  };

  const exportExcel = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Indicador", "Valor"], ["Estabelecimento", data.estabelecimento.nome], ["Visão do período", isHopHup ? "Competência HUP da produção" : isWarleine ? "Competência Warleine" : criterioPeriodo === "PAGAMENTO" ? "Mês do pagamento" : "Competência do faturamento"], [periodoLabel, competencia || "Todos"], ["Convênio", convenioSelecionadoNome || "Todos"],
      ["Faturado reconhecido", data.resumo.totalFaturado], ["Recebido", data.resumo.totalRecebido], ["Glosado", data.resumo.totalGlosado], ["Saldo a baixar", data.resumo.totalSaldo], ["Acréscimo", data.resumo.totalAcrescimo],
      ["Glosa a recursar", data.resumo.glosaARecursar], ["Glosa recursada", data.resumo.glosaRecursada], ["Glosa em recurso", data.resumo.glosaEmRecurso], ["Glosa recuperada", data.resumo.glosaRecuperada], ["Glosa aceita", data.resumo.glosaAceita],
      ["% Recebido", data.resumo.percentualRecebido], ["% Glosa", data.resumo.percentualGlosa], ["% Recurso", data.resumo.percentualRecurso],
      ["Critério de consolidação", isHopHup ? "Snapshot Hop HUP isolado na visão do sistema Warleine; não somado às fontes oficiais" : isWarleine ? "Fonte isolada Warleine" : "Faturado: XML > manual > planilha externa > estimativa do demonstrativo, por período e convênio. Recebido/glosa manuais são complementares. A aba Valores Externos mostra lançamentos brutos para auditoria, não valores necessariamente somados ao Resumo."],
    ]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porConvenio.map((row: any) => ({ "Convênio": row.convenio, "Faturado": row.totalFaturado, "A baixar": row.totalSaldo, "Acréscimo": row.totalAcrescimo, "Glosa a recursar": row.glosaARecursar, "Glosa recursada": row.glosaRecursada, "Glosa em recurso": row.glosaEmRecurso, "Glosa recuperada": row.glosaRecuperada, "Glosa aceita": row.glosaAceita, "Recebido": row.totalRecebido, "Glosado": row.totalGlosado, "% Recebido": row.percentualRecebido, "% Glosa": row.percentualGlosa, "% Recurso": row.percentualRecurso }))), "Por Convênio");
    const linhasDrilldown = data.porConvenio.flatMap((row: any) =>
      ((row.meses as any[]) || []).map((mesRow: any) => ({
        "Convênio": row.convenio,
        [periodoLabel]: monthLabel(String(mesRow.competencia)),
        "Faturado": mesRow.totalFaturado,
        "A baixar": mesRow.totalSaldo,
        "Acréscimo": mesRow.totalAcrescimo,
        "Glosa a recursar": mesRow.glosaARecursar,
        "Glosa recursada": mesRow.glosaRecursada,
        "Glosa em recurso": mesRow.glosaEmRecurso,
        "Glosa recuperada": mesRow.glosaRecuperada,
        "Glosa aceita": mesRow.glosaAceita,
        "Recebido": mesRow.totalRecebido,
        "Glosado": mesRow.totalGlosado,
        "% Recebido": mesRow.percentualRecebido,
        "% Glosa": mesRow.percentualGlosa,
        "% Recurso": mesRow.percentualRecurso,
      }))
    );
    if (linhasDrilldown.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasDrilldown), "Convênio x Mês");
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porMes.map((row: any) => ({ [periodoLabel]: row.competencia, "Faturado": row.totalFaturado, "Recebido": row.totalRecebido, "Glosado": row.totalGlosado, "Saldo": row.totalSaldo, "Glosa recursada": row.glosaRecursada, "Glosa em recurso": row.glosaEmRecurso, "Glosa recuperada": row.glosaRecuperada }))), "Por Período");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.motivosGlosa.map((row) => ({ "Código": row.codigo, "Motivo": row.motivo, "Valor glosado": row.valorGlosado, "Quantidade": row.quantidade }))), "Motivos de Glosa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.itensGlosados.map((row) => ({ "Código": row.codigo, "Item": row.item, "Tipo": row.tipo, "Valor glosado": row.valorGlosado, "Quantidade": row.quantidade }))), "Itens Glosados");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.lancamentosExternosConsiderados.map((row) => ({ "Mês/Ano": row.competencia, "Convênio": row.convenio, "Código prestador": row.codigoPrestador || "", "Faturado": row.faturado, "Recebido": row.recebido, "Glosado": row.glosado, "Origem": row.origem, "Observação": row.observacao || "", "Atualizado por": row.atualizadoPorNome || "" }))), "Valores Externos");
    const unidade = data.estabelecimento.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    XLSX.writeFile(wb, `faturado-recebido-${isHopHup ? "hop-hup-" : isWarleine ? "warleine-" : ""}${unidade}-${competencia?.replace("/", "-") || "historico"}.xlsx`);
    toast.success("Excel exportado com o recorte atual.");
  };

  if (!estabelecimentoAtual) return <DashboardLayout><main className="flex min-h-[70vh] items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 h-9 w-9 text-amber-500" /><h1 className="text-lg font-semibold text-slate-900">Selecione um estabelecimento</h1><p className="mt-2 text-sm leading-6 text-slate-500">Escolha a unidade no cabeçalho para carregar somente os dados autorizados daquele estabelecimento.</p></div></main></DashboardLayout>;

  return <DashboardLayout><main className="min-h-screen bg-[#f4f7fb] px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1800px] space-y-5">
    <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="h-1.5 bg-gradient-to-r from-slate-900 via-blue-600 to-teal-500" /><div className="flex flex-col gap-5 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><BarChart3 className="h-6 w-6" /></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-950">Faturado x Recebido{isHopHup ? " — Sistema HUP (Hop)" : isWarleine ? " — Sistema Warleine" : ""}</h1><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{estabelecimentoAtual.nome}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isWarleine ? "bg-indigo-50 text-indigo-700" : arquivosEmProcessamento > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{isHopHup ? "Fonte Hop isolada" : isWarleine ? "Fonte isolada Warleine" : arquivosEmProcessamento > 0 ? `${arquivosEmProcessamento} arquivo(s) em processamento` : "Atualização automática ativa"}</span></div><p className="mt-1 text-sm text-slate-500">{isHopHup ? "Snapshot faturado x recebido do HUP importado via Hop, separado dos demonstrativos oficiais" : isWarleine ? "Valores faturados, recebidos, em aberto e glosados informados pelo sistema Warleine" : "Resultado mensal por convênio, retorno financeiro, glosas e recursos"}</p></div></div><div className="flex flex-wrap gap-2">{!isWarleine && temAcessoModulo("faturamentoExterno") && <Button variant="outline" size="sm" className="bg-white" onClick={() => setCadastroManualAberto(true)}><FilePenLine className="mr-2 h-4 w-4" />Cadastrar valores</Button>}{isWarleine && !isHopHup && <Button variant="outline" size="sm" className="border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100" onClick={() => setImportarWarleineAberto(true)}><Upload className="mr-2 h-4 w-4" />Importar CSV / ZIP / XLSX</Button>}<Button variant="outline" size="sm" className="bg-white" onClick={() => query.refetch()} disabled={query.isRefetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isRefetching ? "animate-spin" : ""}`} />Atualizar</Button><Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800" onClick={exportExcel} disabled={!data}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button></div></div></header>

    <BiAutoRefreshBar
      autoRefreshAtivo={autoRefreshAtivo}
      onToggleAutoRefresh={() => setAutoRefreshAtivo((atual) => !atual)}
      isFetching={query.isFetching}
      isError={query.isError}
      dataUpdatedAt={query.dataUpdatedAt}
      arquivosEmProcessamento={isWarleine ? 0 : arquivosEmProcessamento}
      fonteIsoladaLabel={isHopHup ? "Fonte Hop isolada" : isWarleine ? "Fonte isolada Warleine" : undefined}
    />

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`grid gap-3 ${isWarleine ? "md:grid-cols-[220px_260px_1fr]" : "md:grid-cols-[230px_220px_260px_1fr]"} md:items-end`}>{!isWarleine && <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Organizar recebido por</label><Select value={criterioPeriodo} onValueChange={(value) => alterarCriterioPeriodo(value as "PAGAMENTO" | "FATURAMENTO")}><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PAGAMENTO">Mês do pagamento</SelectItem><SelectItem value="FATURAMENTO">Competência do faturamento</SelectItem></SelectContent></Select></div>}<div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{periodoLabel}</label><Select value={competencia || "todos"} onValueChange={(value) => setCompetencia(value === "todos" ? undefined : value)}><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todo o histórico</SelectItem>{data?.filtrosDisponiveis.competencias.map((item) => <SelectItem key={item} value={item}>{monthLabel(item)}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Convênio</label><Select value={convenio || "todos"} onValueChange={(value) => setConvenio(value === "todos" ? undefined : value)}><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os convênios</SelectItem>{convenioOptions.map((item) => <SelectItem key={item.chave} value={item.chave}>{item.nome}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-wrap items-center gap-2">{competencia && <button onClick={() => setCompetencia(undefined)} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{periodoLabel} {monthLabel(competencia)}<X className="h-3.5 w-3.5" /></button>}{convenio && <button onClick={() => setConvenio(undefined)} className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">{convenioSelecionadoNome}<X className="h-3.5 w-3.5" /></button>}{(competencia || convenio) && <Button variant="ghost" size="sm" onClick={clear}><RotateCcw className="mr-2 h-4 w-4" />Limpar filtros</Button>}</div></div></section>

    {query.isLoading && <div className="flex min-h-96 items-center justify-center rounded-2xl bg-white"><Loader2 className="mr-3 h-6 w-6 animate-spin text-blue-600" /><span className="text-sm text-slate-500">Calculando o resultado de {estabelecimentoAtual.nome}...</span></div>}
    {query.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Não foi possível carregar o relatório: {query.error.message}</div>}

    {data && <>
      {!!data.lancamentosExternosConsiderados.length && <div className="flex flex-col gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 sm:flex-row sm:items-center sm:justify-between"><span><strong>{data.lancamentosExternosConsiderados.length} lançamento(s) externo(s)</strong> encontrado(s) neste recorte. Para o faturado, a prioridade é conta XML, manual, planilha externa e estimativa do demonstrativo; recebido e glosa manuais continuam complementares e devem ser revisados quando houver importação.</span><Button variant="outline" size="sm" className="border-violet-200 bg-white" onClick={() => setCadastroManualAberto(true)}>Revisar lançamentos</Button></div>}
      <section className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${isWarleine ? "xl:grid-cols-4 2xl:grid-cols-8" : "xl:grid-cols-5 2xl:grid-cols-9"}`}><MetricCard label="Faturado" value={money(data.resumo.totalFaturado)} helper="Base reconhecida no recorte" icon={CircleDollarSign} tone="navy" /><MetricCard label="Recebido" value={money(data.resumo.totalRecebido)} helper={isWarleine ? percent(data.resumo.percentualRecebido) : criterioPeriodo === "PAGAMENTO" ? "Total informado no pagamento" : "Total atribuído ao período"} icon={HandCoins} tone="teal" /><MetricCard label="Glosado" value={money(data.resumo.totalGlosado)} helper={`${percent(data.resumo.percentualGlosa)} do faturado`} icon={TrendingDown} tone="coral" /><MetricCard label="A baixar" value={money(data.resumo.totalSaldo)} helper="Saldo ainda sem baixa" icon={WalletCards} tone="amber" /><MetricCard label="Glosa a recursar" value={money(data.resumo.glosaARecursar)} helper="Sem decisão registrada" icon={AlertCircle} tone="amber" /><MetricCard label="Glosa recursada" value={money(data.resumo.glosaRecursada)} helper="Total já colocado em recurso" icon={ShieldCheck} tone="blue" /><MetricCard label="Em recurso" value={money(data.resumo.glosaEmRecurso)} helper={`${percent(data.resumo.percentualRecurso)} já recursado`} icon={ShieldCheck} tone="blue" /><MetricCard label="Recuperada" value={money(data.resumo.glosaRecuperada)} helper="Retorno favorável registrado" icon={RefreshCw} tone="teal" /><MetricCard label="Glosa aceita" value={money(data.resumo.glosaAceita)} helper="Aceite registrado na análise" icon={FileSpreadsheet} tone="violet" /></section>

      <Panel
        title={`Resultado ${competencia ? `de ${monthLabel(competencia)}` : "consolidado"}`}
        subtitle={`${periodoLabel}: clique na linha para abrir o drill-down por ${visaoDrilldown === "CONVENIO_MES" ? "mês sem precisar filtrar" : "convênio sem precisar filtrar"}, ou use o botão Filtrar para recalcular os gráficos`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setVisaoDrilldown("CONVENIO_MES")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                visaoDrilldown === "CONVENIO_MES"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              Convênio → Mês
            </button>
            <button
              type="button"
              onClick={() => setVisaoDrilldown("MES_CONVENIO")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                visaoDrilldown === "MES_CONVENIO"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-teal-600" />
              {periodoLabel} → Convênio
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={expandirTodos} className="h-8 text-xs">
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              Expandir todos
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={recolherTodos} className="h-8 text-xs text-slate-600">
              Recolher todos
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">{visaoDrilldown === "CONVENIO_MES" ? "Convênio / Mês" : `${periodoLabel} / Convênio`}</th>
                <th className="px-3 py-3 text-right">Faturado</th>
                <th className="px-3 py-3 text-right">A baixar</th>
                <th className="px-3 py-3 text-right">Acréscimo</th>
                <th className="px-3 py-3 text-right">Glosa a rec.</th>
                <th className="px-3 py-3 text-right">Recursada</th>
                <th className="px-3 py-3 text-right">Em recurso</th>
                <th className="px-3 py-3 text-right">Recuperada</th>
                <th className="px-3 py-3 text-right">Aceita</th>
                <th className="px-3 py-3 text-right">Recebido</th>
                <th className="px-3 py-3 text-right">Glosado</th>
                <th className="px-3 py-3 text-right">% receb.</th>
                <th className="px-3 py-3 text-right">% glosa</th>
                <th className="px-3 py-3 text-right">% recurso</th>
              </tr>
            </thead>
            <tbody>
              {visaoDrilldown === "CONVENIO_MES" ? (
                data.porConvenio.map((row: any) => {
                  const convenioChave = isWarleine ? (row.convenioChave || row.convenio) : row.convenio;
                  const active = convenio === convenioChave;
                  const mesesSub: any[] = row.meses || [];
                  const isExpanded = conveniosExpandidos.has(convenioChave);
                  return (
                    <Fragment key={convenioChave}>
                      <tr
                        onClick={() => toggleExpandirConvenio(convenioChave)}
                        className={`cursor-pointer border-b border-slate-100 transition-colors ${
                          active ? "bg-blue-50/90 ring-1 ring-inset ring-blue-200" : isExpanded ? "bg-slate-50/90" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                              <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                              <span>{row.convenio}</span>
                              {mesesSub.length > 0 && (
                                <span className="rounded-full bg-slate-200/75 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                  {mesesSub.length} {mesesSub.length === 1 ? "mês" : "meses"}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleConvenio(convenioChave);
                              }}
                              title={active ? "Remover filtro deste convênio" : "Filtrar gráficos e indicadores por este convênio"}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                active
                                  ? "border-blue-300 bg-blue-600 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                              }`}
                            >
                              <Filter className="h-2.5 w-2.5" />
                              {active ? "Filtrado" : "Filtrar"}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-900">{money(row.totalFaturado)}</td>
                        <td className="px-3 py-3 text-right text-amber-700">{money(row.totalSaldo)}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{money(row.totalAcrescimo)}</td>
                        <td className="px-3 py-3 text-right text-amber-700">{money(row.glosaARecursar)}</td>
                        <td className="px-3 py-3 text-right text-cyan-700">{money(row.glosaRecursada)}</td>
                        <td className="px-3 py-3 text-right text-blue-700">{money(row.glosaEmRecurso)}</td>
                        <td className="px-3 py-3 text-right text-teal-700">{money(row.glosaRecuperada)}</td>
                        <td className="px-3 py-3 text-right text-violet-700">{money(row.glosaAceita)}</td>
                        <td className="px-3 py-3 text-right font-medium text-teal-700">{money(row.totalRecebido)}</td>
                        <td className="px-3 py-3 text-right font-medium text-rose-700">{money(row.totalGlosado)}</td>
                        <td className="px-3 py-3 text-right">{percent(row.percentualRecebido)}</td>
                        <td className="px-3 py-3 text-right">{percent(row.percentualGlosa)}</td>
                        <td className="px-3 py-3 text-right">{percent(row.percentualRecurso)}</td>
                      </tr>
                      {isExpanded &&
                        mesesSub.map((mesRow: any) => {
                          const mesAtivo = competencia === mesRow.competencia && active;
                          return (
                            <tr
                              key={`${convenioChave}-${mesRow.competencia}`}
                              onClick={() => {
                                if (mesRow.competencia !== "Sem competência") {
                                  setConvenio(convenioChave);
                                  toggleMes(mesRow.competencia);
                                }
                              }}
                              className={`cursor-pointer border-b border-slate-100/80 bg-slate-50/60 text-[11px] transition-colors hover:bg-blue-50/50 ${
                                mesAtivo ? "bg-blue-50/80 font-semibold" : ""
                              }`}
                            >
                              <td className="py-2.5 pl-10 pr-3 text-slate-700">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-2 border-l-2 border-blue-300 pl-2.5">
                                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                                    <span className="font-medium">{monthLabel(String(mesRow.competencia))}</span>
                                  </span>
                                  {mesRow.competencia !== "Sem competência" && (
                                    <span className="text-[10px] text-slate-400">clique p/ focar mês</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{money(mesRow.totalFaturado)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{money(mesRow.totalSaldo)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{money(mesRow.totalAcrescimo)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{money(mesRow.glosaARecursar)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-cyan-700">{money(mesRow.glosaRecursada)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-blue-700">{money(mesRow.glosaEmRecurso)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-teal-700">{money(mesRow.glosaRecuperada)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-violet-700">{money(mesRow.glosaAceita)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-teal-700">{money(mesRow.totalRecebido)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-rose-700">{money(mesRow.totalGlosado)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(mesRow.percentualRecebido)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(mesRow.percentualGlosa)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(mesRow.percentualRecurso)}</td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })
              ) : (
                mesesOrdenadosDesc.map((mesRow: any) => {
                  const comp = String(mesRow.competencia);
                  const activeMes = competencia === comp;
                  const conveniosSub: any[] = mesRow.convenios || [];
                  const isExpanded = mesesExpandidos.has(comp);
                  return (
                    <Fragment key={comp}>
                      <tr
                        onClick={() => toggleExpandirMes(comp)}
                        className={`cursor-pointer border-b border-slate-100 transition-colors ${
                          activeMes ? "bg-teal-50/90 ring-1 ring-inset ring-teal-200" : isExpanded ? "bg-slate-50/90" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-teal-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                              <Calendar className="h-4 w-4 shrink-0 text-teal-600" />
                              <span>{monthLabel(comp)}</span>
                              {conveniosSub.length > 0 && (
                                <span className="rounded-full bg-slate-200/75 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                  {conveniosSub.length} {conveniosSub.length === 1 ? "convênio" : "convênios"}
                                </span>
                              )}
                            </span>
                            {comp !== "Sem competência" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMes(comp);
                                }}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                  activeMes
                                    ? "border-teal-300 bg-teal-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
                                }`}
                              >
                                <Filter className="h-2.5 w-2.5" />
                                {activeMes ? "Filtrado" : "Filtrar"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-900">{money(mesRow.totalFaturado)}</td>
                        <td className="px-3 py-3 text-right text-amber-700">{money(mesRow.totalSaldo)}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{money(mesRow.totalAcrescimo)}</td>
                        <td className="px-3 py-3 text-right text-amber-700">{money(mesRow.glosaARecursar)}</td>
                        <td className="px-3 py-3 text-right text-cyan-700">{money(mesRow.glosaRecursada)}</td>
                        <td className="px-3 py-3 text-right text-blue-700">{money(mesRow.glosaEmRecurso)}</td>
                        <td className="px-3 py-3 text-right text-teal-700">{money(mesRow.glosaRecuperada)}</td>
                        <td className="px-3 py-3 text-right text-violet-700">{money(mesRow.glosaAceita)}</td>
                        <td className="px-3 py-3 text-right font-medium text-teal-700">{money(mesRow.totalRecebido)}</td>
                        <td className="px-3 py-3 text-right font-medium text-rose-700">{money(mesRow.totalGlosado)}</td>
                        <td className="px-3 py-3 text-right">{percent(mesRow.percentualRecebido)}</td>
                        <td className="px-3 py-3 text-right">{percent(mesRow.percentualGlosa)}</td>
                        <td className="px-3 py-3 text-right">{percent(mesRow.percentualRecurso)}</td>
                      </tr>
                      {isExpanded &&
                        conveniosSub.map((convRow: any) => {
                          const convChave = isWarleine ? (convRow.convenioChave || convRow.convenio) : convRow.convenio;
                          return (
                            <tr
                              key={`${comp}-${convChave}`}
                              onClick={() => {
                                setConvenio(convChave);
                                if (comp !== "Sem competência") setCompetencia(comp);
                              }}
                              className="cursor-pointer border-b border-slate-100/80 bg-slate-50/60 text-[11px] transition-colors hover:bg-teal-50/50"
                            >
                              <td className="py-2.5 pl-10 pr-3 text-slate-700">
                                <span className="inline-flex items-center gap-2 border-l-2 border-teal-300 pl-2.5">
                                  <Building2 className="h-3.5 w-3.5 text-teal-600" />
                                  <span className="font-medium">{convRow.convenio}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{money(convRow.totalFaturado)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{money(convRow.totalSaldo)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{money(convRow.totalAcrescimo)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{money(convRow.glosaARecursar)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-cyan-700">{money(convRow.glosaRecursada)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-blue-700">{money(convRow.glosaEmRecurso)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-teal-700">{money(convRow.glosaRecuperada)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-violet-700">{money(convRow.glosaAceita)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-teal-700">{money(convRow.totalRecebido)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-rose-700">{money(convRow.totalGlosado)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(convRow.percentualRecebido)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(convRow.percentualGlosa)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{percent(convRow.percentualRecurso)}</td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-100/90 font-bold text-slate-900">
                <td className="px-3 py-3 uppercase tracking-wide">Total Consolidado</td>
                <td className="px-3 py-3 text-right">{money(data.resumo.totalFaturado)}</td>
                <td className="px-3 py-3 text-right text-amber-800">{money(data.resumo.totalSaldo)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{money(data.resumo.totalAcrescimo)}</td>
                <td className="px-3 py-3 text-right text-amber-800">{money(data.resumo.glosaARecursar)}</td>
                <td className="px-3 py-3 text-right text-cyan-800">{money(data.resumo.glosaRecursada)}</td>
                <td className="px-3 py-3 text-right text-blue-800">{money(data.resumo.glosaEmRecurso)}</td>
                <td className="px-3 py-3 text-right text-teal-800">{money(data.resumo.glosaRecuperada)}</td>
                <td className="px-3 py-3 text-right text-violet-800">{money(data.resumo.glosaAceita)}</td>
                <td className="px-3 py-3 text-right text-teal-800">{money(data.resumo.totalRecebido)}</td>
                <td className="px-3 py-3 text-right text-rose-800">{money(data.resumo.totalGlosado)}</td>
                <td className="px-3 py-3 text-right">{percent(data.resumo.percentualRecebido)}</td>
                <td className="px-3 py-3 text-right">{percent(data.resumo.percentualGlosa)}</td>
                <td className="px-3 py-3 text-right">{percent(data.resumo.percentualRecurso)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <section className="grid gap-5 xl:grid-cols-2"><Panel title={`Evolução por ${periodoLabel}`} subtitle="Passe o mouse ou toque para ver os detalhes; clique em um período para filtrar todo o relatório">{mesesGrafico.length ? <ResponsiveContainer width="100%" height={330}><BarChart data={mesesGrafico} margin={{ top: 10, right: 8, left: 2, bottom: 6 }} accessibilityLayer><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="competencia" tickFormatter={monthLabel} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip content={<FinancialTooltip context="mes" />} cursor={{ fill: "#eff6ff", opacity: 0.75 }} animationDuration={150} wrapperStyle={{ outline: "none", zIndex: 30 }} allowEscapeViewBox={{ x: false, y: true }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="totalFaturado" name="Faturado" fill={COLORS.blue} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)}>{mesesGrafico.map((item: any) => <Cell key={item.competencia} fill={competencia && competencia !== item.competencia ? "#cbd5e1" : COLORS.blue} />)}</Bar><Bar dataKey="totalRecebido" name="Recebido" fill={COLORS.teal} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)} /><Bar dataKey="totalGlosado" name="Glosado" fill={COLORS.coral} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)} /></BarChart></ResponsiveContainer> : <div className="flex h-64 items-center justify-center text-sm text-slate-500">Sem evolução mensal para o recorte.</div>}</Panel><Panel title="Convênios por faturamento" subtitle="Passe o mouse ou toque para comparar os valores; clique para filtrar a operadora"><ResponsiveContainer width="100%" height={330}><BarChart data={data.porConvenio.slice(0, 10)} layout="vertical" margin={{ left: 5, right: 18 }} accessibilityLayer><CartesianGrid stroke={COLORS.grid} horizontal={false} /><XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="convenio" width={125} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip content={<FinancialTooltip context="convenio" />} cursor={{ fill: "#f0fdfa" }} animationDuration={150} wrapperStyle={{ outline: "none", zIndex: 30 }} allowEscapeViewBox={{ x: false, y: true }} /><Bar dataKey="totalFaturado" name="Faturado" fill={COLORS.navy} radius={[0, 7, 7, 0]} barSize={20} cursor="pointer" onClick={(entry: any) => toggleConvenio((isWarleine ? (entry?.convenioChave || entry?.payload?.convenioChave) : undefined) || entry?.convenio || entry?.payload?.convenio)}>{data.porConvenio.slice(0, 10).map((item: any) => <Cell key={(isWarleine ? item.convenioChave : item.convenio) || item.convenio} fill={convenio === ((isWarleine ? item.convenioChave : item.convenio) || item.convenio) ? COLORS.teal : convenio ? "#cbd5e1" : COLORS.navy} />)}</Bar></BarChart></ResponsiveContainer></Panel></section>

      <section className="grid gap-5 xl:grid-cols-2"><Panel title={`Principais motivos de glosa${convenioSelecionadoNome ? ` — ${convenioSelecionadoNome}` : ""}`} subtitle="Passe o mouse ou toque para ver código TISS, quantidade, média e participação"><Ranking data={data.motivosGlosa} labelKey="motivo" color={COLORS.amber} totalGlosado={data.resumo.totalGlosado} /></Panel><Panel title={`Itens mais glosados${convenioSelecionadoNome ? ` — ${convenioSelecionadoNome}` : ""}`} subtitle="Passe o mouse ou toque para ver código, tipo, quantidade, média e participação"><Ranking data={data.itensGlosados} labelKey="item" color={COLORS.coral} totalGlosado={data.resumo.totalGlosado} /></Panel></section>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Metodologia auditável:</strong> {isHopHup ? "valores provenientes exclusivamente do snapshot Hop HUP publicado por competência na base do sistema Warleine; XMLs, demonstrativos, lançamentos manuais e a base oficial não são somados nesta visão. Sem data de pagamento no layout Hop, o recebido é classificado pela competência de produção, não pelo mês do pagamento." : isWarleine ? "todos os valores vêm exclusivamente do lote Warleine ativo por competência. XMLs, demonstrativos, lançamentos manuais e a base oficial não são somados nesta visão." : `${(data.metodologia as any).criterioPeriodo}. ${(data.metodologia as any).recebidoGlosado} O recebido inclui todos os valores informados pela operadora para a unidade, independentemente de existir uma conta XML correspondente no portal.`} Todas as consultas são restritas à unidade selecionada.</div>
    </>}
    {!isWarleine && temAcessoModulo("faturamentoExterno") && <LancamentosManuaisDialog estabelecimentoId={estabelecimentoId} estabelecimentoNome={estabelecimentoAtual.nome} open={cadastroManualAberto} onOpenChange={setCadastroManualAberto} />}
    {isWarleine && !isHopHup && <ImportarWarleineDialog estabelecimentoId={estabelecimentoId} estabelecimentoNome={estabelecimentoAtual.nome} open={importarWarleineAberto} onOpenChange={setImportarWarleineAberto} onImported={() => { void query.refetch(); }} />}
  </div></main></DashboardLayout>;
}

export default function FaturadoRecebidoUnificado() {
  return <FaturadoRecebidoView />;
}
