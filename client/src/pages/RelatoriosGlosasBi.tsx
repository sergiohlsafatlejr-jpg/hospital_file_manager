import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Gavel,
  ListChecks,
  Loader2,
  MousePointerClick,
  Presentation,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Stethoscope,
  Tags,
  TrendingDown,
  Undo2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const COLORS = {
  ink: "#172033",
  muted: "#667085",
  grid: "#e4e7ec",
  rose: "#c24162",
  roseSoft: "#fce7ef",
  teal: "#168a83",
  blue: "#3157a4",
  amber: "#d18b20",
  purple: "#7656a8",
};

const fmtCurrency = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));

const fmtCompact = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(valor || 0));

const fmtPercent = (valor: number) => `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const fmtMonth = (valor?: string | null) => {
  if (!valor) return "Sem data";
  const [ano, mes] = valor.split("/");
  return mes && ano ? `${mes}/${ano}` : valor;
};

const fmtDate = (valor?: string | null) => {
  if (!valor) return "Não informada";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
};

const fmtResourceStatus = (valor?: string | null) => ({
  rascunho: "Rascunho",
  pendente_envio: "Aguardando envio",
  aguardando_lote: "Aguardando lote",
  enviado: "Enviado",
  em_analise: "Em análise",
  respondido: "Respondido",
  deferido: "Deferido",
  deferido_parcial: "Deferido parcial",
  indeferido: "Indeferido",
  finalizado: "Finalizado",
}[String(valor || "")] || String(valor || "Não informado"));

const shorten = (texto: string | null | undefined, limite: number) => {
  const valor = texto?.trim() || "Não informado";
  return valor.length > limite ? `${valor.slice(0, limite - 1)}…` : valor;
};

type KpiCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: "rose" | "teal" | "blue" | "amber" | "purple";
};

const toneClasses: Record<KpiCardProps["tone"], { surface: string; icon: string; text: string }> = {
  rose: { surface: "bg-rose-50", icon: "bg-rose-100 text-rose-700", text: "text-rose-700" },
  teal: { surface: "bg-teal-50", icon: "bg-teal-100 text-teal-700", text: "text-teal-700" },
  blue: { surface: "bg-blue-50", icon: "bg-blue-100 text-blue-700", text: "text-blue-700" },
  amber: { surface: "bg-amber-50", icon: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  purple: { surface: "bg-violet-50", icon: "bg-violet-100 text-violet-700", text: "text-violet-700" },
};

function KpiCard({ label, value, helper, icon: Icon, tone }: KpiCardProps) {
  const styles = toneClasses[tone];
  return (
    <div className={`rounded-2xl border border-slate-200/80 p-4 shadow-sm ${styles.surface}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <div className={`rounded-xl p-2 ${styles.icon}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${styles.text}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children, className = "" }: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><Icon className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="max-w-xs rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-slate-800">{label}</p>
      {payload.map((entry: any) => (
        <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-6 py-0.5 text-xs">
          <span className="flex items-center gap-2 text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold text-slate-800">
            {entry.dataKey === "taxaGlosa" ? fmtPercent(entry.value) : fmtCurrency(entry.value)}
          </span>
        </div>
      ))}
      {point?.valorProcessado !== undefined && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
          <div className="flex justify-between gap-6 text-slate-500"><span>Valor processado</span><strong className="text-slate-800">{fmtCurrency(point.valorProcessado)}</strong></div>
          <div className="flex justify-between gap-6 text-blue-700"><span>Percentual de glosa</span><strong>{fmtPercent(point.taxaGlosa)}</strong></div>
          <div className="flex justify-between gap-6 text-rose-600"><span>Glosa aceita</span><strong>{fmtCurrency(point.glosaAceita)}</strong></div>
          <div className="flex justify-between gap-6 text-teal-700"><span>Glosa recursada</span><strong>{fmtCurrency(point.glosaRecursada)}</strong></div>
          <div className="flex justify-between gap-6 text-amber-700"><span>Pendente</span><strong>{fmtCurrency(point.glosaPendente)}</strong></div>
        </div>
      )}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
      <SearchX className="mb-3 h-7 w-7 text-slate-300" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function HorizontalRankingChart({ data, labelKey = "nome", color = COLORS.rose, selectedValue, getValue, onSelect }: {
  data: any[];
  labelKey?: string;
  color?: string;
  selectedValue?: string | number;
  getValue?: (item: any) => string | number;
  onSelect?: (item: any) => void;
}) {
  const chartData = data.slice(0, 10).map((item) => ({
    ...item,
    chartLabel: shorten(String(item[labelKey] || "Não informado"), 28),
  }));

  if (!chartData.length) return <EmptyChart message="Nenhuma glosa encontrada para os filtros selecionados." />;

  return (
    <ResponsiveContainer width="100%" height={Math.max(290, chartData.length * 40)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
        <CartesianGrid stroke={COLORS.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={fmtCompact} tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="chartLabel" width={170} tick={{ fill: COLORS.ink, fontSize: 11 }} axisLine={false} tickLine={false} />
        <RechartsTooltip content={<ChartTooltip />} />
        <Bar
          dataKey="valorGlosado"
          name="Valor glosado"
          fill={color}
          radius={[0, 7, 7, 0]}
          barSize={19}
          cursor={onSelect ? "pointer" : "default"}
          onClick={(entry: any) => onSelect?.(entry?.payload ?? entry)}
        >
          {chartData.map((item: any, index: number) => {
            const isSelected = selectedValue !== undefined && getValue?.(item) === selectedValue;
            const hasSelection = selectedValue !== undefined;
            return (
              <Cell
                key={index}
                fill={isSelected ? color : hasSelection ? "#cbd5e1" : color}
                fillOpacity={isSelected ? 1 : hasSelection ? 0.48 : Math.max(0.42, 1 - index * 0.055)}
                stroke={isSelected ? COLORS.ink : "transparent"}
                strokeWidth={isSelected ? 2 : 0}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActiveFilterChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 transition-colors hover:border-rose-300 hover:bg-rose-100"
      title={`Remover filtro ${label}: ${value}`}
    >
      <span className="text-rose-500">{label}</span>
      <span className="max-w-[260px] truncate font-semibold">{value}</span>
      <X className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110" />
    </button>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-slate-200" />)}
      </div>
      <div className="h-96 rounded-2xl bg-slate-200" />
    </div>
  );
}

export default function RelatoriosGlosasBi() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const estabelecimentoNome = estabelecimentoAtual?.nome?.trim() || "Estabelecimento";
  const hasEstabelecimento = estabelecimentoId > 0;

  const [mesPagamentoInicio, setMesPagamentoInicio] = useState<string | undefined>();
  const [mesPagamentoFim, setMesPagamentoFim] = useState<string | undefined>();
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [categoriaGlosa, setCategoriaGlosa] = useState<string | undefined>();
  const [mesPagamento, setMesPagamento] = useState<string | undefined>();
  const [itemDescricao, setItemDescricao] = useState<string | undefined>();
  const [procedimentoCodigo, setProcedimentoCodigo] = useState<string | undefined>();
  const [motivoCodigo, setMotivoCodigo] = useState<string | undefined>();
  const [showComparar, setShowComparar] = useState(false);
  const [competencia1, setCompetencia1] = useState("");
  const [competencia2, setCompetencia2] = useState("");
  const [comparativo, setComparativo] = useState<any>(null);

  const filtrosQuery = trpc.relatoriosGlosasBi.filtros.useQuery(
    { estabelecimentoId },
    { enabled: hasEstabelecimento, staleTime: 60_000 },
  );

  const painelInput = useMemo(() => ({
    estabelecimentoId,
    convenioId,
    mesPagamentoInicio,
    mesPagamentoFim,
    categoriaGlosa,
    mesPagamento,
    itemDescricao,
    procedimentoCodigo,
    motivoCodigo,
    limite: 20,
  }), [estabelecimentoId, convenioId, mesPagamentoInicio, mesPagamentoFim, categoriaGlosa, mesPagamento, itemDescricao, procedimentoCodigo, motivoCodigo]);

  const painelQuery = trpc.relatoriosGlosasBi.painelExecutivo.useQuery(
    painelInput,
    { enabled: hasEstabelecimento, staleTime: 60_000, placeholderData: (previousData) => previousData },
  );

  const comparativoMutation = trpc.relatoriosGlosasBi.comparativoMeses.useMutation({
    onSuccess: (data) => {
      setComparativo(data);
      setShowComparar(false);
    },
    onError: (error) => toast.error(`Não foi possível comparar os meses: ${error.message}`),
  });

  const data = painelQuery.data;
  const filtrosAtivos = [mesPagamentoInicio, mesPagamentoFim, convenioId, categoriaGlosa, mesPagamento, itemDescricao, procedimentoCodigo, motivoCodigo].filter(Boolean).length;
  const periodoLabel = mesPagamentoInicio || mesPagamentoFim
    ? `${fmtMonth(mesPagamentoInicio || filtrosQuery.data?.competencias.at(-1))} a ${fmtMonth(mesPagamentoFim || filtrosQuery.data?.competencias[0])}`
    : "Todo o histórico com data de pagamento";

  const limparFiltros = () => {
    setMesPagamentoInicio(undefined);
    setMesPagamentoFim(undefined);
    setConvenioId(undefined);
    setCategoriaGlosa(undefined);
    setMesPagamento(undefined);
    setItemDescricao(undefined);
    setProcedimentoCodigo(undefined);
    setMotivoCodigo(undefined);
  };

  const toggleMesPagamento = (valor: string) => setMesPagamento((atual) => atual === valor ? undefined : valor);
  const toggleConvenio = (valor: number) => setConvenioId((atual) => atual === valor ? undefined : valor);
  const toggleItem = (valor: string) => setItemDescricao((atual) => atual === valor ? undefined : valor);
  const toggleProcedimento = (valor: string) => setProcedimentoCodigo((atual) => atual === valor ? undefined : valor);
  const toggleMotivo = (valor: string) => setMotivoCodigo((atual) => atual === valor ? undefined : valor);

  const convenioSelecionadoNome = convenioId
    ? filtrosQuery.data?.convenios.find((item) => item.id === convenioId)?.nome || String(convenioId)
    : undefined;
  const motivoSelecionadoNome = motivoCodigo
    ? data?.porMotivo.find((item: any) => item.codigoGlosa === motivoCodigo)?.nome || motivoCodigo
    : undefined;
  const recorteInterativoLabel = [
    mesPagamento ? `Mês ${fmtMonth(mesPagamento)}` : null,
    convenioSelecionadoNome ? `Convênio ${convenioSelecionadoNome}` : null,
    itemDescricao ? `Item ${itemDescricao}` : null,
    procedimentoCodigo ? `Procedimento ${procedimentoCodigo}` : null,
    motivoSelecionadoNome ? `Motivo ${motivoSelecionadoNome}` : null,
  ].filter(Boolean).join(" • ") || "Visão geral";

  const handleRefresh = async () => {
    await Promise.all([painelQuery.refetch(), filtrosQuery.refetch()]);
    toast.success("Relatório atualizado com os dados mais recentes.");
  };

  const handleExportExcel = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const workbook = XLSX.utils.book_new();
    const resumoRows = [
      ["Estabelecimento", estabelecimentoNome],
      ["Período de pagamento", periodoLabel],
      ["Convênio", convenioId ? filtrosQuery.data?.convenios.find((item) => item.id === convenioId)?.nome || convenioId : "Todos"],
      ["Categoria de glosa", categoriaGlosa || "Todas"],
      ["Mês selecionado no painel", mesPagamento ? fmtMonth(mesPagamento) : "Todos"],
      ["Item selecionado no painel", itemDescricao || "Todos"],
      ["Procedimento selecionado no painel", procedimentoCodigo || "Todos"],
      ["Motivo selecionado no painel", motivoCodigo ? `${motivoCodigo} — ${motivoSelecionadoNome || motivoCodigo}` : "Todos"],
      ["Recorte interativo", recorteInterativoLabel],
      ["Valor processado", data.resumo.valorProcessado],
      ["Valor pago", data.resumo.valorPago],
      ["Valor glosado", data.resumo.valorGlosado],
      ["Percentual de glosa (%)", data.resumo.taxaGlosa],
      ["Ticket médio da glosa", data.resumo.ticketMedio],
      ["Glosa aceita", data.resumo.glosaAceita],
      ["Glosa recursada", data.resumo.glosaRecursada],
      ["Glosa recursada vinculada ao demonstrativo atual", data.resumo.glosaRecursadaVinculada || 0],
      ["Glosa recursada histórica sem item no demonstrativo atual", data.resumo.glosaRecursadaHistoricaSemVinculo || 0],
      ["Glosa pendente de análise", data.resumo.glosaPendente],
      ["Percentual analisado (%)", data.resumo.percentualAnalisado],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Indicador", "Valor"], ...resumoRows]), "Resumo");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.porMesPagamento.map((item: any) => ({
      "Mês do pagamento": fmtMonth(item.mesPagamento),
      "Valor processado": item.valorProcessado,
      "Valor glosado": item.valorGlosado,
      "Glosa aceita": item.glosaAceita,
      "Glosa recursada": item.glosaRecursada,
      "Glosa pendente": item.glosaPendente,
      "Percentual de glosa (%)": item.taxaGlosa,
      "Quantidade de itens": item.qtdItens,
    }))), "Glosa por Mês");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.porConvenio.map((item: any) => ({
      "Convênio": item.nome,
      "Valor processado": item.valorProcessado,
      "Valor glosado": item.valorGlosado,
      "Glosa aceita": item.glosaAceita,
      "Glosa recursada": item.glosaRecursada,
      "Glosa pendente": item.glosaPendente,
      "% da glosa": item.percentualTotal,
      "Taxa de glosa (%)": item.taxaGlosa,
      "Quantidade de itens": item.qtdItens,
    }))), "Glosa por Convênio");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.porItem.map((item: any) => ({
      "Código do item": item.codigoItem || "",
      "Descrição do item": item.nome,
      "Tipo": item.tipoLancamento,
      "Valor processado": item.valorProcessado,
      "Valor glosado": item.valorGlosado,
      "Glosa aceita": item.glosaAceita,
      "Glosa recursada": item.glosaRecursada,
      "Glosa pendente": item.glosaPendente,
      "% da glosa": item.percentualTotal,
      "Taxa de glosa (%)": item.taxaGlosa,
      "Quantidade": item.qtdItens,
    }))), "Glosa por Item");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.porProcedimento.map((item: any) => ({
      "Código do procedimento": item.codigoItem,
      "Descrição do procedimento": item.nome,
      "Tipo": item.tipoLancamento,
      "Valor processado": item.valorProcessado,
      "Valor glosado": item.valorGlosado,
      "Glosa aceita": item.glosaAceita,
      "Glosa recursada": item.glosaRecursada,
      "Glosa pendente": item.glosaPendente,
      "% da glosa": item.percentualTotal,
      "Quantidade": item.qtdItens,
    }))), "Glosa por Procedimento");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.porMotivo.map((item: any) => ({
      "Código TISS": item.codigoGlosa,
      "Motivo descritivo": item.nome,
      "Categoria": item.categoria,
      "Valor glosado": item.valorGlosado,
      "Glosa aceita": item.glosaAceita,
      "Glosa recursada": item.glosaRecursada,
      "Glosa pendente": item.glosaPendente,
      "% da glosa": item.percentualTotal,
      "Quantidade": item.qtdItens,
    }))), "Motivos de Glosa");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.recursosAnalisados?.lotes || []).map((lote: any) => ({
      "Lote": lote.numeroLote || (lote.loteId ? `Lote ${lote.loteId}` : "Ainda sem lote"),
      "Convênio": lote.convenioNome,
      "Status": fmtResourceStatus(lote.status),
      "Data de criação": fmtDate(lote.dataCriacao),
      "Data de envio": fmtDate(lote.dataEnvio),
      "Quantidade de itens": lote.quantidadeItens,
      "Valor recursado": lote.valorRecursado,
      "Itens históricos sem vínculo atual": lote.itensSemVinculoAtual,
    }))), "Recursos por Lote");
    XLSX.writeFile(workbook, `glosas-${estabelecimentoNome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado com os dados e descrições do relatório.");
  };

  const handleExportPptx = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Safatle Sistemas";
    pptx.subject = "Análise executiva de glosas";
    pptx.title = `Glosas — ${estabelecimentoNome}`;

    const addHeader = (slide: any, title: string, subtitle: string) => {
      slide.background = { color: "F8FAFC" };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.1, fill: { color: "C24162" }, line: { color: "C24162" } });
      slide.addText(title, { x: 0.55, y: 0.35, w: 8.5, h: 0.42, fontFace: "Aptos", fontSize: 21, bold: true, color: "172033" });
      slide.addText(subtitle, { x: 0.55, y: 0.82, w: 11.8, h: 0.3, fontFace: "Aptos", fontSize: 9, color: "667085" });
      slide.addText(`${estabelecimentoNome} • ${periodoLabel} • ${shorten(recorteInterativoLabel, 90)}`, { x: 0.55, y: 7.08, w: 11.8, h: 0.2, fontFace: "Aptos", fontSize: 8, color: "98A2B3" });
    };

    const capa = pptx.addSlide();
    capa.background = { color: "172033" };
    capa.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.8, w: 0.12, h: 5.8, fill: { color: "C24162" }, line: { color: "C24162" } });
    capa.addText("RELATÓRIO EXECUTIVO\nDE GLOSAS", { x: 1.1, y: 1.4, w: 9.5, h: 1.5, fontFace: "Aptos Display", fontSize: 31, bold: true, color: "FFFFFF", breakLine: false });
    capa.addText(estabelecimentoNome, { x: 1.1, y: 3.15, w: 8.5, h: 0.5, fontFace: "Aptos", fontSize: 19, color: "F8B4C5" });
    capa.addText(`${periodoLabel}\n${shorten(recorteInterativoLabel, 95)}`, { x: 1.1, y: 3.75, w: 10.8, h: 0.65, fontFace: "Aptos", fontSize: 11, color: "CBD5E1", breakLine: false });
    capa.addText(`Glosa total: ${fmtCurrency(data.resumo.valorGlosado)}  •  Taxa: ${fmtPercent(data.resumo.taxaGlosa)}`, { x: 1.1, y: 4.55, w: 9.5, h: 0.4, fontFace: "Aptos", fontSize: 15, bold: true, color: "FFFFFF" });

    const resumoSlide = pptx.addSlide();
    addHeader(resumoSlide, "Indicadores principais", "Visão consolidada do período selecionado");
    const cards = [
      ["VALOR PROCESSADO", fmtCurrency(data.resumo.valorProcessado), "3157A4"],
      ["VALOR GLOSADO", fmtCurrency(data.resumo.valorGlosado), "C24162"],
      ["PERCENTUAL DE GLOSA", fmtPercent(data.resumo.taxaGlosa), "3157A4"],
      ["GLOSA ACEITA", fmtCurrency(data.resumo.glosaAceita), "C24162"],
      ["GLOSA RECURSADA", fmtCurrency(data.resumo.glosaRecursada), "168A83"],
      ["PENDENTE DE ANÁLISE", fmtCurrency(data.resumo.glosaPendente), "D18B20"],
    ];
    cards.forEach(([label, value, color], index) => {
      const x = 0.55 + (index % 3) * 4.15;
      const y = 1.45 + Math.floor(index / 3) * 2.25;
      resumoSlide.addShape(pptx.ShapeType.roundRect, { x, y, w: 3.75, h: 1.8, fill: { color: "FFFFFF" }, line: { color: "E4E7EC" } });
      resumoSlide.addText(label, { x: x + 0.2, y: y + 0.22, w: 3.3, h: 0.3, fontSize: 9, bold: true, color: "667085" });
      resumoSlide.addText(value, { x: x + 0.2, y: y + 0.75, w: 3.3, h: 0.5, fontSize: 19, bold: true, color });
    });

    const addRankingSlide = (title: string, subtitle: string, rows: any[], label: (row: any) => string) => {
      const slide = pptx.addSlide();
      addHeader(slide, title, subtitle);
      const top = rows.slice(0, 10);
      slide.addChart(pptx.ChartType.bar, [{ name: "Valor glosado", labels: top.map(label), values: top.map((row) => row.valorGlosado) }], {
        x: 0.45, y: 1.25, w: 7.4, h: 5.45, barDir: "bar", showLegend: false,
        chartColors: ["C24162"], catAxisLabelFontSize: 8, catAxisLabelColor: "344054",
        valAxisLabelFontSize: 8, valAxisLabelColor: "667085", valGridLine: { color: "E4E7EC" },
      });
      slide.addTable([
        [{ text: "Descrição", options: { bold: true, color: "FFFFFF", fill: { color: "172033" } } }, { text: "Glosado", options: { bold: true, color: "FFFFFF", fill: { color: "172033" } } }, { text: "%", options: { bold: true, color: "FFFFFF", fill: { color: "172033" } } }],
        ...top.map((row, index) => [
          { text: label(row), options: { fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" } } },
          { text: fmtCurrency(row.valorGlosado), options: { align: "right" as const, fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" } } },
          { text: fmtPercent(row.percentualTotal), options: { align: "right" as const, fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" } } },
        ]),
      ], { x: 8.0, y: 1.3, w: 4.85, border: { color: "E4E7EC", pt: 0.5 }, fontFace: "Aptos", fontSize: 8, colW: [2.9, 1.3, 0.65] });
    };

    addRankingSlide("Glosa por convênio", "Operadoras com maior impacto financeiro", data.porConvenio, (row) => shorten(row.nome, 28));
    addRankingSlide("Glosa por item", "Itens com maior valor total glosado", data.porItem, (row) => shorten(row.nome, 28));
    addRankingSlide("Glosa por procedimento", "Códigos de procedimento consolidados", data.porProcedimento, (row) => `${row.codigoItem} — ${shorten(row.nome, 20)}`);

    pptx.writeFile({ fileName: `relatorio-glosas-${estabelecimentoNome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pptx` });
    toast.success("PowerPoint exportado.");
  };

  const compararMeses = () => {
    if (!competencia1 || !competencia2) return toast.error("Selecione os dois meses para comparar.");
    comparativoMutation.mutate({ estabelecimentoId, competencia1, competencia2, convenioId });
  };

  if (!hasEstabelecimento) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[65vh] items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-9 w-9 text-amber-500" />
            <h1 className="text-lg font-semibold text-slate-900">Selecione um estabelecimento</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">O relatório de glosas exige uma unidade específica para impedir a mistura de dados entre estabelecimentos.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#f5f7fa] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1700px] space-y-5">
          <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1.5 bg-gradient-to-r from-rose-700 via-rose-500 to-amber-400" />
            <div className="flex flex-col gap-5 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-700"><ShieldCheck className="h-6 w-6" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Análise de Glosas</h1>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Demonstrativo</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{estabelecimentoNome} • visão financeira por pagamento, item, convênio e procedimento</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={painelQuery.isRefetching} className="bg-white">
                  <RefreshCw className={`mr-2 h-4 w-4 ${painelQuery.isRefetching ? "animate-spin" : ""}`} />Atualizar
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportExcel} className="bg-white text-emerald-700"><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="bg-white"><FileText className="mr-2 h-4 w-4" />PDF</Button>
                <Button variant="outline" size="sm" onClick={handleExportPptx} className="bg-white text-violet-700"><Presentation className="mr-2 h-4 w-4" />PowerPoint</Button>
                <Button size="sm" onClick={() => setShowComparar(true)} className="bg-slate-900 text-white hover:bg-slate-800"><ArrowLeftRight className="mr-2 h-4 w-4" />Comparar meses</Button>
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Filtros do relatório</h2>
                <p className="mt-0.5 text-xs text-slate-500">O período considera a data de pagamento registrada no demonstrativo.</p>
              </div>
              {filtrosAtivos > 0 && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-slate-600"><RotateCcw className="mr-2 h-4 w-4" />Limpar {filtrosAtivos}</Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Select value={mesPagamentoInicio || "todos"} onValueChange={(value) => setMesPagamentoInicio(value === "todos" ? undefined : value)}>
                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Pagamento inicial" /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Desde o início</SelectItem>{filtrosQuery.data?.competencias.map((mes) => <SelectItem key={mes} value={mes}>{fmtMonth(mes)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={mesPagamentoFim || "todos"} onValueChange={(value) => setMesPagamentoFim(value === "todos" ? undefined : value)}>
                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Pagamento final" /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Até o último mês</SelectItem>{filtrosQuery.data?.competencias.map((mes) => <SelectItem key={mes} value={mes}>{fmtMonth(mes)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={convenioId?.toString() || "todos"} onValueChange={(value) => setConvenioId(value === "todos" ? undefined : Number(value))}>
                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Todos os convênios" /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os convênios</SelectItem>{filtrosQuery.data?.convenios.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={categoriaGlosa || "todas"} onValueChange={(value) => setCategoriaGlosa(value === "todas" ? undefined : value)}>
                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
                <SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{filtrosQuery.data?.categoriasGlosa.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs leading-5 text-blue-800">
                <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
                <p><span className="font-semibold">Exploração interativa:</span> clique em uma barra ou linha das tabelas para filtrar todos os indicadores. Clique novamente para remover a seleção.</p>
              </div>
              {painelQuery.isFetching && !painelQuery.isLoading && <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-blue-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />Recalculando</span>}
            </div>
            {(mesPagamento || convenioId || itemDescricao || procedimentoCodigo || motivoCodigo) && (
              <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros interativos ativos">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recorte ativo</span>
                {mesPagamento && <ActiveFilterChip label="Mês" value={fmtMonth(mesPagamento)} onClear={() => setMesPagamento(undefined)} />}
                {convenioId && <ActiveFilterChip label="Convênio" value={convenioSelecionadoNome || String(convenioId)} onClear={() => setConvenioId(undefined)} />}
                {itemDescricao && <ActiveFilterChip label="Item" value={itemDescricao} onClear={() => setItemDescricao(undefined)} />}
                {procedimentoCodigo && <ActiveFilterChip label="Procedimento" value={procedimentoCodigo} onClear={() => setProcedimentoCodigo(undefined)} />}
                {motivoCodigo && <ActiveFilterChip label="Motivo" value={`${motivoCodigo} — ${motivoSelecionadoNome || motivoCodigo}`} onClear={() => setMotivoCodigo(undefined)} />}
              </div>
            )}
          </section>

          {painelQuery.isLoading ? <LoadingDashboard /> : painelQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-red-600" />
              <h2 className="font-semibold text-red-900">Não foi possível carregar o relatório</h2>
              <p className="mt-1 text-sm text-red-700">{painelQuery.error.message}</p>
              <Button variant="outline" size="sm" className="mt-4 bg-white" onClick={() => painelQuery.refetch()}>Tentar novamente</Button>
            </div>
          ) : data ? (
            <>
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Valor processado" value={fmtCurrency(data.resumo.valorProcessado)} helper={`${data.resumo.totalGuiasGlosadas.toLocaleString("pt-BR")} guias com alguma glosa`} icon={CircleDollarSign} tone="blue" />
                <KpiCard label="Valor glosado" value={fmtCurrency(data.resumo.valorGlosado)} helper={`${data.resumo.totalItensGlosados.toLocaleString("pt-BR")} itens glosados`} icon={AlertTriangle} tone="rose" />
                <KpiCard label="Percentual de glosa" value={fmtPercent(data.resumo.taxaGlosa)} helper="Valor glosado ÷ valor processado" icon={TrendingDown} tone="amber" />
                <KpiCard label="Ticket médio" value={fmtCurrency(data.resumo.ticketMedio)} helper="Valor médio por item glosado" icon={ReceiptText} tone="purple" />
              </section>

              <Panel title="Tratamento das glosas" subtitle="Decisões registradas na análise: aceite da glosa, recurso e saldo ainda pendente" icon={Gavel}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Glosa aceita</p><Undo2 className="h-4 w-4 text-rose-600" /></div>
                    <p className="mt-2 text-xl font-bold text-rose-800">{fmtCurrency(data.resumo.glosaAceita)}</p>
                    <p className="mt-1 text-xs text-rose-700">{fmtPercent(data.resumo.percentualAceito)} do valor glosado</p>
                  </div>
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Glosa recursada</p><ShieldCheck className="h-4 w-4 text-teal-600" /></div>
                    <p className="mt-2 text-xl font-bold text-teal-800">{fmtCurrency(data.resumo.glosaRecursada)}</p>
                    <p className="mt-1 text-xs text-teal-700">{fmtPercent(data.resumo.percentualRecursado)} do valor glosado</p>
                    <p className="mt-2 text-[11px] leading-4 text-teal-700">{data.recursosAnalisados?.quantidadeRecursada?.toLocaleString("pt-BR") || 0} itens registrados em recurso</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pendente de análise</p><Loader2 className="h-4 w-4 text-amber-600" /></div>
                    <p className="mt-2 text-xl font-bold text-amber-800">{fmtCurrency(data.resumo.glosaPendente)}</p>
                    <p className="mt-1 text-xs text-amber-700">{fmtPercent(100 - data.resumo.percentualAnalisado)} do valor glosado</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${fmtPercent(data.resumo.percentualAnalisado)} das glosas analisadas`}>
                  <div className="flex h-full">
                    <div className="bg-rose-500" style={{ width: `${Math.min(100, data.resumo.percentualAceito)}%` }} />
                    <div className="bg-teal-500" style={{ width: `${Math.min(100, data.resumo.percentualRecursado)}%` }} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{fmtPercent(data.resumo.percentualAnalisado)} das glosas do recorte já possuem decisão registrada.</p>
                {data.recursosAnalisados?.valorHistoricoSemVinculo > 0 && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                    <strong>{fmtCurrency(data.recursosAnalisados.valorHistoricoSemVinculo)}</strong> correspondem a {data.recursosAnalisados.quantidadeHistoricaSemVinculo.toLocaleString("pt-BR")} recursos históricos preservados cujos itens de origem não estão mais no demonstrativo atual. Eles entram no total recursado, sem atribuição artificial a mês, item ou motivo.
                  </div>
                )}
              </Panel>

              <Panel title="Recursos por lote" subtitle="Lotes e itens de recurso preservados no sistema, respeitando o estabelecimento e o recorte selecionado" icon={ListChecks}>
                {data.recursosAnalisados?.lotes?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[940px] text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-semibold">Lote</th><th className="px-3 py-3 font-semibold">Convênio</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Envio</th><th className="px-3 py-3 text-right font-semibold">Itens</th><th className="px-3 py-3 text-right font-semibold">Recursado</th><th className="px-3 py-3 text-right font-semibold">Histórico sem vínculo</th>
                      </tr></thead>
                      <tbody>{data.recursosAnalisados.lotes.map((lote: any, index: number) => (
                        <tr key={`${lote.loteId ?? "sem-lote"}-${lote.convenioId ?? "sem-convenio"}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3"><p className="font-medium text-slate-900">{lote.numeroLote || (lote.loteId ? `Lote ${lote.loteId}` : "Ainda sem lote")}</p><p className="mt-0.5 text-xs text-slate-500">Criado em {fmtDate(lote.dataCriacao)}</p></td>
                          <td className="px-3 py-3 text-slate-700">{lote.convenioNome}</td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lote.status === "enviado" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>{fmtResourceStatus(lote.status)}</span></td>
                          <td className="px-3 py-3 text-slate-600">{fmtDate(lote.dataEnvio)}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{lote.quantidadeItens.toLocaleString("pt-BR")}</td>
                          <td className="px-3 py-3 text-right font-semibold text-teal-700">{fmtCurrency(lote.valorRecursado)}</td>
                          <td className="px-3 py-3 text-right text-blue-700">{lote.itensSemVinculoAtual.toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptyChart message="Nenhum recurso analisado foi encontrado para os filtros selecionados." />}
              </Panel>

              <Panel title="Glosa por mês de pagamento" subtitle={`Clique em uma barra para cruzar todas as análises • ${periodoLabel}`} icon={CalendarDays}>
                {data.porMesPagamento.length ? (
                  <div className="h-[300px] sm:h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.porMesPagamento.map((item: any) => ({ ...item, label: fmtMonth(item.mesPagamento) }))} margin={{ top: 12, right: 4, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke={COLORS.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="money" width={46} tickFormatter={fmtCompact} tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      <Bar
                        yAxisId="money"
                        dataKey="valorGlosado"
                        name="Valor glosado"
                        fill={COLORS.rose}
                        radius={[7, 7, 0, 0]}
                        maxBarSize={54}
                        cursor="pointer"
                        onClick={(entry: any) => toggleMesPagamento(entry?.payload?.mesPagamento ?? entry?.mesPagamento)}
                      >
                        {data.porMesPagamento.map((item: any) => (
                          <Cell
                            key={item.mesPagamento}
                            fill={item.mesPagamento === mesPagamento ? COLORS.rose : mesPagamento ? "#cbd5e1" : COLORS.rose}
                            fillOpacity={item.mesPagamento === mesPagamento ? 1 : mesPagamento ? 0.5 : 0.92}
                            stroke={item.mesPagamento === mesPagamento ? COLORS.ink : "transparent"}
                            strokeWidth={item.mesPagamento === mesPagamento ? 2 : 0}
                          />
                        ))}
                        <LabelList dataKey="taxaGlosa" position="top" formatter={(value: any) => fmtPercent(Number(value))} fill={COLORS.blue} fontSize={11} fontWeight={700} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                ) : <EmptyChart message="Não há glosas com data de pagamento para o período selecionado." />}
              </Panel>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Panel title="Glosa por convênio" subtitle="Clique em uma operadora para cruzar todo o relatório" icon={Tags}>
                  <HorizontalRankingChart data={data.porConvenio} color={COLORS.blue} selectedValue={convenioId} getValue={(item) => item.convenioId} onSelect={(item) => toggleConvenio(item.convenioId)} />
                </Panel>
                <Panel title="Glosa por procedimento" subtitle="Clique em um código para cruzar todo o relatório" icon={Stethoscope}>
                  <HorizontalRankingChart data={data.porProcedimento.map((item: any) => ({ ...item, nome: `${item.codigoItem} — ${item.nome}` }))} color={COLORS.purple} selectedValue={procedimentoCodigo} getValue={(item) => item.codigoItem} onSelect={(item) => toggleProcedimento(item.codigoItem)} />
                </Panel>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Panel title="Glosa por item" subtitle="Clique para recalcular mês, motivos, convênios, procedimentos e indicadores" icon={BarChart3}>
                  <HorizontalRankingChart data={data.porItem} color={COLORS.rose} selectedValue={itemDescricao} getValue={(item) => item.nome} onSelect={(item) => toggleItem(item.nome)} />
                </Panel>
                <Panel title="Glosa por motivo" subtitle="Clique em um motivo para identificar os itens, meses e convênios relacionados" icon={Activity}>
                  <HorizontalRankingChart
                    data={data.porMotivo.map((item: any) => ({ ...item, nome: `${item.codigoGlosa} — ${item.nome}` }))}
                    color={COLORS.amber}
                    selectedValue={motivoCodigo}
                    getValue={(item) => item.codigoGlosa}
                    onSelect={(item) => toggleMotivo(item.codigoGlosa)}
                  />
                </Panel>
              </div>

              <Panel title="Detalhamento da glosa por item" subtitle="Situação do recurso, participação no total e taxa por item" icon={ListChecks}>
                {data.porItem.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1160px] text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-semibold">Item</th><th className="px-3 py-3 font-semibold">Tipo</th><th className="px-3 py-3 text-right font-semibold">Qtd.</th><th className="px-3 py-3 text-right font-semibold">Glosado</th><th className="px-3 py-3 text-right font-semibold">Aceita</th><th className="px-3 py-3 text-right font-semibold">Recursada</th><th className="px-3 py-3 text-right font-semibold">Pendente</th><th className="px-3 py-3 text-right font-semibold">% glosa</th><th className="px-3 py-3 text-right font-semibold">Taxa</th>
                      </tr></thead>
                      <tbody>{data.porItem.map((item: any, index: number) => (
                        <tr
                          key={`${item.codigoItem}-${item.nome}-${index}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={itemDescricao === item.nome}
                          onClick={() => toggleItem(item.nome)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleItem(item.nome); } }}
                          className={`cursor-pointer border-b border-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400 ${itemDescricao === item.nome ? "bg-rose-50" : "hover:bg-rose-50/40"}`}
                        >
                          <td className="px-4 py-3"><p className="font-medium text-slate-900" title={item.nome}>{shorten(item.nome, 72)}</p><p className="mt-0.5 text-xs text-slate-500">Código: {item.codigoItem || "não informado"}</p></td>
                          <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.tipoLancamento}</span></td>
                          <td className="px-3 py-3 text-right text-slate-600">{item.qtdItens.toLocaleString("pt-BR")}</td>
                          <td className="px-3 py-3 text-right font-semibold text-rose-700">{fmtCurrency(item.valorGlosado)}</td>
                          <td className="px-3 py-3 text-right text-rose-600">{fmtCurrency(item.glosaAceita)}</td>
                          <td className="px-3 py-3 text-right font-medium text-teal-700">{fmtCurrency(item.glosaRecursada)}</td>
                          <td className="px-3 py-3 text-right text-amber-700">{fmtCurrency(item.glosaPendente)}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{fmtPercent(item.percentualTotal)}</td>
                          <td className="px-3 py-3 text-right"><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">{fmtPercent(item.taxaGlosa)}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptyChart message="Nenhum item glosado encontrado." />}
              </Panel>

              <Panel title="Motivos de glosa" subtitle="Descrição, código TISS e categoria para apoiar correção e recurso" icon={Activity}>
                {data.porMotivo.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-semibold">Motivo</th><th className="px-3 py-3 font-semibold">Categoria</th><th className="px-3 py-3 text-right font-semibold">Ocorrências</th><th className="px-3 py-3 text-right font-semibold">Valor glosado</th><th className="px-3 py-3 text-right font-semibold">% do total</th><th className="px-3 py-3 text-right font-semibold">Aceita</th><th className="px-3 py-3 text-right font-semibold">Recursada</th><th className="px-3 py-3 text-right font-semibold">Pendente</th>
                      </tr></thead>
                      <tbody>{data.porMotivo.map((item: any, index: number) => (
                        <tr
                          key={`${item.codigoGlosa}-${index}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={motivoCodigo === item.codigoGlosa}
                          onClick={() => toggleMotivo(item.codigoGlosa)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleMotivo(item.codigoGlosa); } }}
                          className={`cursor-pointer border-b border-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${motivoCodigo === item.codigoGlosa ? "bg-blue-50" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-4 py-3"><p className="font-medium text-slate-900" title={`Código TISS: ${item.codigoGlosa} — ${item.nome}`}>{shorten(item.nome, 78)}</p><p className="mt-0.5 text-xs text-slate-500">Código TISS: {item.codigoGlosa}</p></td>
                          <td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{item.categoria}</span></td>
                          <td className="px-3 py-3 text-right text-slate-600">{item.qtdItens.toLocaleString("pt-BR")}</td>
                          <td className="px-3 py-3 text-right font-semibold text-rose-700">{fmtCurrency(item.valorGlosado)}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{fmtPercent(item.percentualTotal)}</td>
                          <td className="px-3 py-3 text-right text-rose-600">{fmtCurrency(item.glosaAceita)}</td>
                          <td className="px-3 py-3 text-right font-medium text-teal-700">{fmtCurrency(item.glosaRecursada)}</td>
                          <td className="px-3 py-3 text-right text-amber-700">{fmtCurrency(item.glosaPendente)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptyChart message="Nenhum motivo de glosa encontrado para os filtros selecionados." />}
              </Panel>

              {comparativo && <ComparativoSection result={comparativo} />}
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={showComparar} onOpenChange={setShowComparar}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comparar competências</DialogTitle>
            <DialogDescription>Selecione dois períodos para obter uma leitura comparativa das glosas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div><p className="mb-2 text-xs font-medium text-slate-600">Competência inicial</p><Select value={competencia1} onValueChange={setCompetencia1}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{filtrosQuery.data?.competencias.map((mes) => <SelectItem key={mes} value={mes}>{fmtMonth(mes)}</SelectItem>)}</SelectContent></Select></div>
            <div><p className="mb-2 text-xs font-medium text-slate-600">Competência final</p><Select value={competencia2} onValueChange={setCompetencia2}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{filtrosQuery.data?.competencias.map((mes) => <SelectItem key={mes} value={mes}>{fmtMonth(mes)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button onClick={compararMeses} disabled={!competencia1 || !competencia2 || comparativoMutation.isPending} className="bg-slate-900 text-white hover:bg-slate-800">
            {comparativoMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}Gerar comparativo
          </Button>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ComparativoSection({ result }: { result: any }) {
  const cards = [
    ["Visão geral", result.analise?.visaoGeral],
    ["Diagnóstico", result.analise?.diagnostico],
    ["Recomendações", result.analise?.recomendacoes],
  ].filter(([, content]) => content);

  return (
    <Panel title="Comparativo inteligente" subtitle={`${fmtMonth(result.periodo1?.competencia)} × ${fmtMonth(result.periodo2?.competencia)}`} icon={ArrowLeftRight}>
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ["Variação glosada", fmtCurrency(Math.abs(result.variacoes?.glosa || 0)), result.variacoes?.glosa],
          ["Variação da taxa", `${Math.abs(result.variacoes?.taxa || 0).toFixed(2)} p.p.`, result.variacoes?.taxa],
          ["Variação faturada", fmtCurrency(Math.abs(result.variacoes?.faturado || 0)), result.variacoes?.faturado],
        ].map(([label, value, direction]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-bold ${Number(direction) > 0 ? "text-rose-700" : "text-teal-700"}`}>{Number(direction) > 0 ? "+" : "−"}{value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {cards.map(([title, content]) => <div key={String(title)} className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{content}</p></div>)}
      </div>
    </Panel>
  );
}
