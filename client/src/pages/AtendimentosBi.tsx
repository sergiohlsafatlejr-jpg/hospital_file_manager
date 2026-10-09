import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { ATENDIMENTOS_BI_QUERY_OPTIONS } from "@shared/atendimentosBiRefresh";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Building2, CalendarDays, CircleDollarSign, Clock3, Filter, Layers3, MapPin, RefreshCw, RotateCcw, Tags, WalletCards } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Filters = {
  mesEntrada?: string;
  etapa?: string;
  convenio?: string;
  setor?: string;
  categoria?: string;
  permanencia?: string;
};
type MetricRow = { chave: string; quantidade: number; valor: number };

const COLORS = ["#0f766e", "#0369a1", "#7c3aed", "#b45309", "#be123c", "#4f46e5", "#15803d", "#c2410c"];
const EMPTY = "__TODOS__";
const fmtNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);
const fmtMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
const fmtMonth = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${value.slice(5)}/${value.slice(0, 4)}` : value;
const short = (value: string, size = 23) => value.length > size ? `${value.slice(0, size - 1)}…` : value;
const categoryLabel = (value: string) => ({ INTERNACAO: "Internação", "INTERNAÇÃO": "Internação", AMBULATORIO: "Ambulatório", "AMBULATÓRIO": "Ambulatório", EXAME: "Exame" }[value] || value);

function KpiCard({ label, value, helper, icon: Icon, onClick, selected, tone }: {
  label: string; value: string; helper: string; icon: LucideIcon; onClick?: () => void; selected?: boolean; tone: "teal" | "blue" | "amber" | "violet";
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-700 ring-teal-600/25",
    blue: "bg-blue-50 text-blue-700 ring-blue-600/25",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/25",
    violet: "bg-violet-50 text-violet-700 ring-violet-600/25",
  } as const;
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
    </div>
    <p className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{helper}</p>
  </>;
  return onClick ? <button onClick={onClick} className={`min-h-[138px] rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-teal-600 ring-2 ring-teal-600/20" : "border-slate-200"}`}>{content}</button> : <div className="min-h-[138px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</div>;
}

function RankingPanel({ title, subtitle, icon: Icon, rows, onSelect, selected, formatLabel = (value) => value }: {
  title: string; subtitle: string; icon: typeof Layers3; rows: MetricRow[]; onSelect: (value: string) => void; selected?: string; formatLabel?: (value: string) => string;
}) {
  const max = Math.max(...rows.map((row) => row.valor), 1);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h2 className="text-sm font-bold text-slate-800">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>
      <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon className="h-4 w-4" /></div>
    </div>
    {rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhum dado para os filtros selecionados.</p> :
      <div className="space-y-2.5">
        {rows.map((row, index) => <button key={row.chave} onClick={() => onSelect(row.chave)} className={`group w-full rounded-xl p-2 text-left transition ${selected === row.chave ? "bg-teal-50 ring-1 ring-teal-600/30" : "hover:bg-slate-50"}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-700">{formatLabel(row.chave)}</span><span className="shrink-0 font-semibold text-slate-900">{fmtMoney(row.valor)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max((row.valor / max) * 100, 3)}%`, backgroundColor: COLORS[index % COLORS.length] }} /></div>
          <div className="mt-1 text-[11px] text-slate-500">{fmtNumber(row.quantidade)} contas</div>
        </button>)}
      </div>}
  </section>;
}

function SelectFilter({ value, placeholder, items, onChange, format = (item) => item }: { value?: string; placeholder: string; items: string[]; onChange: (value?: string) => void; format?: (item: string) => string }) {
  return <Select value={value || EMPTY} onValueChange={(item) => onChange(item === EMPTY ? undefined : item)}>
    <SelectTrigger className="h-10 bg-white text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent><SelectItem value={EMPTY}>{placeholder}</SelectItem>{items.map((item) => <SelectItem key={item} value={item}>{format(item)}</SelectItem>)}</SelectContent>
  </Select>;
}

export default function AtendimentosBi() {
  const { estabelecimentoAtual } = useEstabelecimento();
  // Cada unidade tem seu próprio estado: filtros antigos não escondem uma carga nova.
  return <AtendimentosBiPainel key={estabelecimentoAtual?.id ?? 0} />;
}

function AtendimentosBiPainel() {
  const { estabelecimentoAtual, temAcessoModulo } = useEstabelecimento();
  const [filters, setFilters] = useState<Filters>({});
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : 0;
  const enabled = Boolean(estabelecimentoId && temAcessoModulo("relAtendimentos"));
  const input = useMemo(() => ({ estabelecimentoId, ...filters, limite: 12 }), [estabelecimentoId, filters]);
  const dashboardQuery = trpc.atendimentosBi.painel.useQuery(input, { enabled, ...ATENDIMENTOS_BI_QUERY_OPTIONS });
  const data = dashboardQuery.data;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const setFilter = <K extends keyof Filters>(field: K, value: Filters[K]) => setFilters((current) => ({ ...current, [field]: value }));
  const toggle = <K extends keyof Filters>(field: K, value: NonNullable<Filters[K]>) => setFilters((current) => ({ ...current, [field]: current[field] === value ? undefined : value }));
  const chartData = useMemo(() => (data?.porMesEntrada || []).map((row) => ({ ...row, label: fmtMonth(row.chave) })), [data?.porMesEntrada]);

  if (!estabelecimentoId) return <DashboardLayout><div className="mx-auto max-w-3xl p-8"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><AlertCircle className="mb-3 h-6 w-6" /><h1 className="font-bold">Selecione um estabelecimento</h1><p className="mt-1 text-sm">O painel é recortado por unidade e não permite a visão de “Todos”.</p></div></div></DashboardLayout>;
  if (!temAcessoModulo("relAtendimentos")) return <DashboardLayout><div className="mx-auto max-w-3xl p-8"><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"><AlertCircle className="mb-3 h-6 w-6" /><h1 className="font-bold">Acesso não liberado</h1><p className="mt-1 text-sm">Solicite a permissão individual <strong>Rel. Atendimentos</strong> para esta unidade.</p></div></div></DashboardLayout>;

  return <DashboardLayout>
    <main className="min-h-full bg-slate-50/80 px-4 py-6 lg:px-7">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="overflow-hidden rounded-2xl border border-teal-900/20 bg-gradient-to-r from-slate-950 via-teal-950 to-teal-800 px-6 py-6 text-white shadow-lg">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200"><Building2 className="h-4 w-4" /> Relatórios BI · Atendimentos</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Fluxo de contas e permanência</h1><p className="mt-2 max-w-2xl text-sm text-teal-100">Visão gerencial agregada de <strong>{estabelecimentoAtual?.nome}</strong>. Não são exibidos pacientes, contas ou identificadores individuais.</p></div>
            <Button variant="secondary" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching} className="bg-white text-teal-900 hover:bg-teal-50"><RefreshCw className={`mr-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500" aria-live="polite">
          <span>Mesma base da tela de atendimentos: registros ativos e sem título, sem nova importação para o BI.</span>
          <span>{dashboardQuery.isFetching ? "Consultando dados atuais…" : dashboardQuery.isError ? "Falha na consulta; tente Atualizar." : dashboardQuery.dataUpdatedAt > 0 ? `Consulta concluída às ${new Date(dashboardQuery.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Aguardando consulta"} · Atualização automática a cada 1 min com esta tela visível.</span>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter className="h-4 w-4 text-teal-700" /><h2 className="text-sm font-bold text-slate-800">Filtros interativos</h2>{activeFilterCount > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">{activeFilterCount} ativo(s)</span>}</div><Button size="sm" variant="ghost" onClick={() => setFilters({})} disabled={activeFilterCount === 0}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Limpar filtros</Button></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SelectFilter value={filters.mesEntrada} placeholder="Mês de entrada" items={data?.filtrosDisponiveis.mesesEntrada || []} onChange={(value) => setFilter("mesEntrada", value)} format={fmtMonth} />
            <SelectFilter value={filters.etapa} placeholder="Etapa da conta" items={data?.filtrosDisponiveis.etapas || []} onChange={(value) => setFilter("etapa", value)} />
            <SelectFilter value={filters.convenio} placeholder="Convênio" items={data?.filtrosDisponiveis.convenios || []} onChange={(value) => setFilter("convenio", value)} />
            <SelectFilter value={filters.setor} placeholder="Setor" items={data?.filtrosDisponiveis.setores || []} onChange={(value) => setFilter("setor", value)} />
            <SelectFilter value={filters.categoria} placeholder="Categoria" items={data?.filtrosDisponiveis.categorias || []} onChange={(value) => setFilter("categoria", value)} format={categoryLabel} />
            <SelectFilter value={filters.permanencia} placeholder="Permanência" items={data?.filtrosDisponiveis.permanencias || []} onChange={(value) => setFilter("permanencia", value)} />
          </div>
        </section>

        {dashboardQuery.isLoading ? <div className="grid gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-200" />)}</div> : dashboardQuery.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"><AlertCircle className="mb-2 h-5 w-5" /><p className="font-semibold">Não foi possível carregar o painel.</p><p className="mt-1 text-sm">{dashboardQuery.error.message}</p></div> : data && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Contas pendentes" value={fmtNumber(data.resumo.quantidade)} helper="Todas sem título, conforme a regra do painel" icon={WalletCards} tone="teal" />
            <KpiCard label="Valor pendente" value={fmtMoney(data.resumo.valor)} helper="Soma das contas sem título" icon={CircleDollarSign} tone="blue" />
            <KpiCard label="Ticket médio" value={fmtMoney(data.resumo.ticketMedio)} helper="Valor médio por conta no recorte" icon={CircleDollarSign} tone="teal" />
            <KpiCard label="Sem etapa" value={fmtNumber(data.resumo.semEtapa)} helper="Contas sem etapa registrada" icon={Clock3} tone="amber" />
            <KpiCard label="Sem saída" value={fmtNumber(data.resumo.semSaida)} helper="Contas sem data de saída" icon={Tags} tone="violet" />
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4"><div className="mb-4 flex items-start justify-between"><div><h2 className="text-sm font-bold text-slate-800">Contas por mês de entrada</h2><p className="mt-1 text-xs text-slate-500">Clique em uma barra para filtrar o mês.</p></div><CalendarDays className="h-4 w-4 text-slate-500" /></div><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8 }} onClick={(state) => { const key = state?.activePayload?.[0]?.payload?.chave; if (key) toggle("mesEntrada", key); }}><XAxis type="number" hide /><YAxis dataKey="label" type="category" width={55} tick={{ fontSize: 11, fill: "#475569" }} /><Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(value: number) => fmtMoney(value)} labelFormatter={(value) => `Entrada: ${value}`} /><Bar dataKey="valor" radius={[0, 5, 5, 0]}>{chartData.map((entry, index) => <Cell key={entry.chave} fill={filters.mesEntrada === entry.chave ? "#0f766e" : COLORS[index % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
            <div className="xl:col-span-4"><RankingPanel title="Etapas da conta" subtitle="Valores por etapa do processo" icon={Layers3} rows={data.porEtapa} onSelect={(value) => toggle("etapa", value)} selected={filters.etapa} /></div>
            <div className="xl:col-span-4"><RankingPanel title="Contas por convênio" subtitle="Valores do recorte selecionado" icon={Tags} rows={data.porConvenio} onSelect={(value) => toggle("convenio", value)} selected={filters.convenio} /></div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <RankingPanel title="Contas por setor" subtitle="Etapa ou setor de entrada" icon={MapPin} rows={data.porSetor} onSelect={(value) => toggle("setor", value)} selected={filters.setor} />
            <RankingPanel title="Categorias de atendimento" subtitle="Origem da categoria informada" icon={Layers3} rows={data.porCategoria} onSelect={(value) => toggle("categoria", value)} selected={filters.categoria} formatLabel={categoryLabel} />
            <RankingPanel title="Permanência da conta" subtitle="Tempo desde entrega ou etapa" icon={Clock3} rows={data.porPermanencia} onSelect={(value) => toggle("permanencia", value)} selected={filters.permanencia} />
            <RankingPanel title="Ciclo operacional" subtitle="Sinais das contas pendentes" icon={Filter} rows={data.cicloProcessos} onSelect={(value) => { if (value === "SEM ETAPA") toggle("etapa", "SEM ETAPA"); }} selected={filters.etapa === "SEM ETAPA" ? "SEM ETAPA" : undefined} />
          </section>

          <footer className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500"><strong className="text-slate-700">Metodologia:</strong> {data.metodologia.fonte} {data.metodologia.particulares} {data.metodologia.privacidade}</footer>
        </>}
      </div>
    </main>
  </DashboardLayout>;
}
