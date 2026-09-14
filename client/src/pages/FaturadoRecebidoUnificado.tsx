import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
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
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  HandCoins,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
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

function FinancialTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><p className="mb-2 text-xs font-semibold text-slate-900">{label}</p>{payload.map((entry: any) => <div key={entry.dataKey} className="flex min-w-48 items-center justify-between gap-5 py-0.5 text-xs"><span className="text-slate-500">{entry.name}</span><strong className="text-slate-800">{money(entry.value)}</strong></div>)}</div>;
}

function Ranking({ data, labelKey, color }: { data: any[]; labelKey: string; color: string }) {
  const rows = data.slice(0, 8).map((row) => ({ ...row, label: short(String(row[labelKey] || "Não informado"), 27) }));
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Nenhuma glosa encontrada no recorte.</div>;
  return <ResponsiveContainer width="100%" height={Math.max(280, rows.length * 42)}><BarChart data={rows} layout="vertical" margin={{ left: 5, right: 18 }}><CartesianGrid stroke={COLORS.grid} horizontal={false} /><XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10, fill: COLORS.navy }} axisLine={false} tickLine={false} /><RechartsTooltip content={<FinancialTooltip />} /><Bar dataKey="valorGlosado" name="Valor glosado" fill={color} radius={[0, 7, 7, 0]} barSize={19} /></BarChart></ResponsiveContainer>;
}

export default function FaturadoRecebidoUnificado() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competencia, setCompetencia] = useState<string | undefined>();
  const [convenio, setConvenio] = useState<string | undefined>();

  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  useEffect(() => {
    setCompetencia(undefined);
    setConvenio(undefined);
  }, [estabelecimentoId]);
  const input = useMemo(() => ({ estabelecimentoId, competencia, convenio, limite: 10 }), [estabelecimentoId, competencia, convenio]);
  const query = trpc.faturadoRecebidoUnificado.dados.useQuery(input, { enabled: estabelecimentoId > 0, staleTime: 60_000, placeholderData: (previous) => previous });
  const data = query.data;
  const mesesGrafico = (data?.porMes || []).filter((item: any) => item.competencia !== "Sem competência").slice(-12);

  const toggleConvenio = (value: string) => setConvenio((current) => current === value ? undefined : value);
  const toggleMes = (value: string) => setCompetencia((current) => current === value ? undefined : value);
  const clear = () => { setCompetencia(undefined); setConvenio(undefined); };

  const exportExcel = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Indicador", "Valor"], ["Estabelecimento", data.estabelecimento.nome], ["Mês/Ano", competencia || "Todos"], ["Convênio", convenio || "Todos"],
      ["Faturado reconhecido", data.resumo.totalFaturado], ["Recebido", data.resumo.totalRecebido], ["Glosado", data.resumo.totalGlosado], ["Saldo a baixar", data.resumo.totalSaldo], ["Acréscimo", data.resumo.totalAcrescimo],
      ["Glosa a recursar", data.resumo.glosaARecursar], ["Glosa em recurso", data.resumo.glosaEmRecurso], ["Glosa recuperada", data.resumo.glosaRecuperada], ["Glosa aceita", data.resumo.glosaAceita],
      ["% Recebido", data.resumo.percentualRecebido], ["% Glosa", data.resumo.percentualGlosa], ["% Recurso", data.resumo.percentualRecurso],
    ]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porConvenio.map((row: any) => ({ "Convênio": row.convenio, "Faturado": row.totalFaturado, "A baixar": row.totalSaldo, "Acréscimo": row.totalAcrescimo, "Glosa a recursar": row.glosaARecursar, "Glosa em recurso": row.glosaEmRecurso, "Glosa recuperada": row.glosaRecuperada, "Glosa aceita": row.glosaAceita, "Recebido": row.totalRecebido, "Glosado": row.totalGlosado, "% Recebido": row.percentualRecebido, "% Glosa": row.percentualGlosa, "% Recurso": row.percentualRecurso }))), "Por Convênio");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porMes.map((row: any) => ({ "Mês/Ano": row.competencia, "Faturado": row.totalFaturado, "Recebido": row.totalRecebido, "Glosado": row.totalGlosado, "Saldo": row.totalSaldo, "Glosa em recurso": row.glosaEmRecurso, "Glosa recuperada": row.glosaRecuperada }))), "Por Mês");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.motivosGlosa.map((row) => ({ "Código": row.codigo, "Motivo": row.motivo, "Valor glosado": row.valorGlosado, "Quantidade": row.quantidade }))), "Motivos de Glosa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.itensGlosados.map((row) => ({ "Código": row.codigo, "Item": row.item, "Tipo": row.tipo, "Valor glosado": row.valorGlosado, "Quantidade": row.quantidade }))), "Itens Glosados");
    const unidade = data.estabelecimento.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    XLSX.writeFile(wb, `faturado-recebido-${unidade}-${competencia?.replace("/", "-") || "historico"}.xlsx`);
    toast.success("Excel exportado com o recorte atual.");
  };

  if (!estabelecimentoAtual) return <DashboardLayout><main className="flex min-h-[70vh] items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 h-9 w-9 text-amber-500" /><h1 className="text-lg font-semibold text-slate-900">Selecione um estabelecimento</h1><p className="mt-2 text-sm leading-6 text-slate-500">Escolha a unidade no cabeçalho para carregar somente os dados autorizados daquele estabelecimento.</p></div></main></DashboardLayout>;

  return <DashboardLayout><main className="min-h-screen bg-[#f4f7fb] px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1800px] space-y-5">
    <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="h-1.5 bg-gradient-to-r from-slate-900 via-blue-600 to-teal-500" /><div className="flex flex-col gap-5 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><BarChart3 className="h-6 w-6" /></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-950">Faturado x Recebido</h1><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{estabelecimentoAtual.nome}</span></div><p className="mt-1 text-sm text-slate-500">Resultado mensal por convênio, retorno financeiro, glosas e recursos</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="bg-white" onClick={() => query.refetch()} disabled={query.isRefetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isRefetching ? "animate-spin" : ""}`} />Atualizar</Button><Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800" onClick={exportExcel} disabled={!data}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button></div></div></header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-[220px_260px_1fr] md:items-end"><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mês/Ano</label><Select value={competencia || "todos"} onValueChange={(value) => setCompetencia(value === "todos" ? undefined : value)}><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todo o histórico</SelectItem>{data?.filtrosDisponiveis.competencias.map((item) => <SelectItem key={item} value={item}>{monthLabel(item)}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Convênio</label><Select value={convenio || "todos"} onValueChange={(value) => setConvenio(value === "todos" ? undefined : value)}><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os convênios</SelectItem>{data?.filtrosDisponiveis.convenios.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-wrap items-center gap-2">{competencia && <button onClick={() => setCompetencia(undefined)} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Mês {monthLabel(competencia)}<X className="h-3.5 w-3.5" /></button>}{convenio && <button onClick={() => setConvenio(undefined)} className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">{convenio}<X className="h-3.5 w-3.5" /></button>}{(competencia || convenio) && <Button variant="ghost" size="sm" onClick={clear}><RotateCcw className="mr-2 h-4 w-4" />Limpar filtros</Button>}</div></div></section>

    {query.isLoading && <div className="flex min-h-96 items-center justify-center rounded-2xl bg-white"><Loader2 className="mr-3 h-6 w-6 animate-spin text-blue-600" /><span className="text-sm text-slate-500">Calculando o resultado de {estabelecimentoAtual.nome}...</span></div>}
    {query.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Não foi possível carregar o relatório: {query.error.message}</div>}

    {data && <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8"><MetricCard label="Faturado" value={money(data.resumo.totalFaturado)} helper="Base reconhecida no recorte" icon={CircleDollarSign} tone="navy" /><MetricCard label="Recebido" value={money(data.resumo.totalRecebido)} helper={percent(data.resumo.percentualRecebido)} icon={HandCoins} tone="teal" /><MetricCard label="Glosado" value={money(data.resumo.totalGlosado)} helper={`${percent(data.resumo.percentualGlosa)} do faturado`} icon={TrendingDown} tone="coral" /><MetricCard label="A baixar" value={money(data.resumo.totalSaldo)} helper="Saldo ainda sem baixa" icon={WalletCards} tone="amber" /><MetricCard label="Glosa a recursar" value={money(data.resumo.glosaARecursar)} helper="Sem decisão registrada" icon={AlertCircle} tone="amber" /><MetricCard label="Em recurso" value={money(data.resumo.glosaEmRecurso)} helper={`${percent(data.resumo.percentualRecurso)} já recursado`} icon={ShieldCheck} tone="blue" /><MetricCard label="Recuperada" value={money(data.resumo.glosaRecuperada)} helper="Retorno favorável registrado" icon={RefreshCw} tone="teal" /><MetricCard label="Glosa aceita" value={money(data.resumo.glosaAceita)} helper="Aceite registrado na análise" icon={FileSpreadsheet} tone="violet" /></section>

      <Panel title={`Resultado ${competencia ? `do mês ${monthLabel(competencia)}` : "consolidado"}`} subtitle="Clique em um convênio para recalcular indicadores, motivos, itens e evolução mensal"><div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Convênio</th><th className="px-3 py-3 text-right">Faturado</th><th className="px-3 py-3 text-right">A baixar</th><th className="px-3 py-3 text-right">Acréscimo</th><th className="px-3 py-3 text-right">Glosa a rec.</th><th className="px-3 py-3 text-right">Em recurso</th><th className="px-3 py-3 text-right">Recuperada</th><th className="px-3 py-3 text-right">Aceita</th><th className="px-3 py-3 text-right">Recebido</th><th className="px-3 py-3 text-right">Glosado</th><th className="px-3 py-3 text-right">% receb.</th><th className="px-3 py-3 text-right">% glosa</th><th className="px-3 py-3 text-right">% recurso</th></tr></thead><tbody>{data.porConvenio.map((row: any) => { const active = convenio === row.convenio; return <tr key={row.convenio} onClick={() => toggleConvenio(row.convenio)} className={`cursor-pointer border-b border-slate-100 transition-colors ${active ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50"}`}><td className="px-3 py-3 font-semibold text-slate-900"><span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" />{row.convenio}</span></td><td className="px-3 py-3 text-right font-medium text-slate-900">{money(row.totalFaturado)}</td><td className="px-3 py-3 text-right text-amber-700">{money(row.totalSaldo)}</td><td className="px-3 py-3 text-right text-slate-600">{money(row.totalAcrescimo)}</td><td className="px-3 py-3 text-right text-amber-700">{money(row.glosaARecursar)}</td><td className="px-3 py-3 text-right text-blue-700">{money(row.glosaEmRecurso)}</td><td className="px-3 py-3 text-right text-teal-700">{money(row.glosaRecuperada)}</td><td className="px-3 py-3 text-right text-violet-700">{money(row.glosaAceita)}</td><td className="px-3 py-3 text-right font-medium text-teal-700">{money(row.totalRecebido)}</td><td className="px-3 py-3 text-right font-medium text-rose-700">{money(row.totalGlosado)}</td><td className="px-3 py-3 text-right">{percent(row.percentualRecebido)}</td><td className="px-3 py-3 text-right">{percent(row.percentualGlosa)}</td><td className="px-3 py-3 text-right">{percent(row.percentualRecurso)}</td></tr>; })}</tbody></table></div></Panel>

      <section className="grid gap-5 xl:grid-cols-2"><Panel title="Evolução por Mês/Ano" subtitle="Clique em um mês para aplicar o filtro cruzado em todo o relatório">{mesesGrafico.length ? <ResponsiveContainer width="100%" height={330}><BarChart data={mesesGrafico} margin={{ top: 10, right: 8, left: 2, bottom: 6 }}><CartesianGrid stroke={COLORS.grid} vertical={false} /><XAxis dataKey="competencia" tickFormatter={monthLabel} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip content={<FinancialTooltip />} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="totalFaturado" name="Faturado" fill={COLORS.blue} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)}>{mesesGrafico.map((item: any) => <Cell key={item.competencia} fill={competencia && competencia !== item.competencia ? "#cbd5e1" : COLORS.blue} />)}</Bar><Bar dataKey="totalRecebido" name="Recebido" fill={COLORS.teal} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)} /><Bar dataKey="totalGlosado" name="Glosado" fill={COLORS.coral} radius={[5, 5, 0, 0]} cursor="pointer" onClick={(entry: any) => toggleMes(entry?.competencia || entry?.payload?.competencia)} /></BarChart></ResponsiveContainer> : <div className="flex h-64 items-center justify-center text-sm text-slate-500">Sem evolução mensal para o recorte.</div>}</Panel><Panel title="Convênios por faturamento" subtitle="Clique em uma barra para abrir motivos e itens daquela operadora"><ResponsiveContainer width="100%" height={330}><BarChart data={data.porConvenio.slice(0, 10)} layout="vertical" margin={{ left: 5, right: 18 }}><CartesianGrid stroke={COLORS.grid} horizontal={false} /><XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="convenio" width={125} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><RechartsTooltip content={<FinancialTooltip />} /><Bar dataKey="totalFaturado" name="Faturado" fill={COLORS.navy} radius={[0, 7, 7, 0]} barSize={20} cursor="pointer" onClick={(entry: any) => toggleConvenio(entry?.convenio || entry?.payload?.convenio)}>{data.porConvenio.slice(0, 10).map((item: any) => <Cell key={item.convenio} fill={convenio === item.convenio ? COLORS.teal : convenio ? "#cbd5e1" : COLORS.navy} />)}</Bar></BarChart></ResponsiveContainer></Panel></section>

      <section className="grid gap-5 xl:grid-cols-2"><Panel title={`Principais motivos de glosa${convenio ? ` — ${convenio}` : ""}`} subtitle="Código TISS, descrição e impacto financeiro do recorte"><Ranking data={data.motivosGlosa} labelKey="motivo" color={COLORS.amber} /></Panel><Panel title={`Itens mais glosados${convenio ? ` — ${convenio}` : ""}`} subtitle="Itens e procedimentos que concentram o valor glosado"><Ranking data={data.itensGlosados} labelKey="item" color={COLORS.coral} /></Panel></section>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Metodologia auditável:</strong> faturado por competência no XML de Conta Convênio, com piso no valor processado confirmado pelo demonstrativo; recebido e glosado pelo mês de referência do demonstrativo; recursos vinculados por estabelecimento, guia, código e valor. Todas as consultas são restritas à unidade selecionada.</div>
    </>}
  </div></main></DashboardLayout>;
}
