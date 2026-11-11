import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useBiAutoRefresh } from "@/hooks/useBiAutoRefresh";
import { BiAutoRefreshBar } from "@/components/bi/BiAutoRefreshBar";
import {
  BiGlosasMatrixTable,
  type LinhaMatrizGlosaBi,
} from "@/components/bi-executivo/BiGlosasMatrixTable";
import { BiPersonalizacaoDialog } from "@/components/bi-executivo/BiPersonalizacaoDialog";
import {
  DEFAULT_BI_CLIENT_CONFIG,
  resolveBiThemePalette,
  type BiThemePalette,
} from "@shared/biPersonalizadoConfig";
import { cn } from "@/lib/utils";
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
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Database,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Gavel,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Presentation,
  RefreshCw,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AbaGlosasBiId = "visao_geral" | "itens_procedimentos" | "tratamento_lotes";

const fmtCurrency = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(valor || 0),
  );

const fmtCompact = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(valor || 0));

const fmtPercent = (valor: number) =>
  `${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

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

const fmtResourceStatus = (valor?: string | null) =>
  ({
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

function limparHexPptx(cor: string | undefined, fallbackHex6: string): string {
  if (!cor) return fallbackHex6;
  const m = cor.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (m) return m[1].toUpperCase();
  const m3 = cor.trim().match(/^#([0-9a-fA-F]{3})$/);
  if (m3) {
    const [a, b, c] = m3[1].split("");
    return `${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return fallbackHex6;
}

function obterIniciaisHospital(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 && !["de", "da", "do", "das", "dos"].includes(p.toLowerCase()));
  if (partes.length === 0) return nome.slice(0, 2).toUpperCase() || "BI";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function ActiveFilterChip({
  label,
  value,
  palette,
  onClear,
}: {
  label: string;
  value: string;
  palette: BiThemePalette;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        palette.isLightCanvas
          ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
          : "border-white/25 bg-white/15 text-white hover:bg-white/25",
      )}
      title={`Remover filtro ${label}: ${value}`}
    >
      <span className="opacity-75">{label}:</span>
      <span className="max-w-[230px] truncate font-bold">{value}</span>
      <X className="h-3 w-3 shrink-0 transition-transform group-hover:scale-110" />
    </button>
  );
}

function ChartTooltipExecutivo({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="max-w-xs rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-slate-100 shadow-2xl">
      <p className="mb-1.5 text-xs font-bold text-amber-400">{label}</p>
      {payload.map((entry: any) => (
        <div
          key={`${entry.dataKey}-${entry.name}`}
          className="flex items-center justify-between gap-5 py-0.5 text-[11px]"
        >
          <span className="flex items-center gap-1.5 text-slate-300">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-bold text-white tabular-nums">
            {entry.dataKey === "taxaGlosa"
              ? fmtPercent(entry.value)
              : fmtCurrency(entry.value)}
          </span>
        </div>
      ))}
      {point?.valorProcessado !== undefined && (
        <div className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-[11px]">
          <div className="flex justify-between gap-5 text-slate-400">
            <span>Valor processado</span>
            <strong className="text-slate-100 tabular-nums">
              {fmtCurrency(point.valorProcessado)}
            </strong>
          </div>
          <div className="flex justify-between gap-5 text-emerald-400">
            <span>Glosa recursada</span>
            <strong className="tabular-nums">{fmtCurrency(point.glosaRecursada)}</strong>
          </div>
          <div className="flex justify-between gap-5 text-rose-400">
            <span>Glosa aceita</span>
            <strong className="tabular-nums">{fmtCurrency(point.glosaAceita)}</strong>
          </div>
          <div className="flex justify-between gap-5 text-amber-300">
            <span>Pendente</span>
            <strong className="tabular-nums">{fmtCurrency(point.glosaPendente)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function HorizontalRankingExecutivo({
  titulo,
  data,
  palette,
  barColor,
  selectedValue,
  getValue,
  onSelect,
}: {
  titulo: string;
  data: any[];
  palette: BiThemePalette;
  barColor: string;
  selectedValue?: string | number;
  getValue?: (item: any) => string | number;
  onSelect?: (item: any) => void;
}) {
  const chartData = data.slice(0, 10).map((item) => ({
    ...item,
    chartLabel: shorten(String(item.nome || "Não informado"), 30),
  }));

  return (
    <section
      className="flex flex-col rounded-xl border shadow-sm overflow-hidden"
      style={{
        background: palette.panelBg,
        borderColor: palette.panelBorder,
      }}
    >
      <div className="px-3.5 py-2.5">
        <h3
          className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
          style={{ color: palette.panelTitleColor }}
        >
          {titulo}
        </h3>
      </div>
      <div className="px-2.5 pb-2.5 flex-1">
        <div className="rounded-lg bg-white p-3 border border-black/10">
          {chartData.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center text-center">
              <SearchX className="mb-2 h-6 w-6 text-slate-300" />
              <p className="text-xs text-slate-400">
                Nenhuma glosa encontrada para os filtros selecionados.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(255, chartData.length * 32)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtCompact}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="chartLabel"
                  width={168}
                  tick={{ fill: "#0f172a", fontSize: 10.5 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<ChartTooltipExecutivo />} />
                <Bar
                  dataKey="valorGlosado"
                  name="Valor glosado"
                  fill={barColor}
                  radius={[0, 6, 6, 0]}
                  barSize={17}
                  cursor={onSelect ? "pointer" : "default"}
                  onClick={(entry: any) => onSelect?.(entry?.payload ?? entry)}
                >
                  {chartData.map((item: any, index: number) => {
                    const isSelected =
                      selectedValue !== undefined && getValue?.(item) === selectedValue;
                    const hasSelection = selectedValue !== undefined;
                    return (
                      <Cell
                        key={index}
                        fill={isSelected ? barColor : hasSelection ? "#cbd5e1" : barColor}
                        fillOpacity={
                          isSelected
                            ? 1
                            : hasSelection
                              ? 0.45
                              : Math.max(0.48, 1 - index * 0.048)
                        }
                        stroke={isSelected ? "#0f172a" : "transparent"}
                        strokeWidth={isSelected ? 1.5 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

function ComparativoSectionExecutivo({
  result,
  palette,
}: {
  result: any;
  palette: BiThemePalette;
}) {
  const cards = [
    ["Visão geral", result.analise?.visaoGeral],
    ["Diagnóstico", result.analise?.diagnostico],
    ["Recomendações", result.analise?.recomendacoes],
  ].filter(([, content]) => content);

  return (
    <section
      className="rounded-xl border shadow-sm overflow-hidden"
      style={{
        background: palette.panelBg,
        borderColor: palette.panelBorder,
      }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between">
        <h3
          className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
          style={{ color: palette.panelTitleColor }}
        >
          COMPARATIVO INTELIGENTE ({fmtMonth(result.periodo1?.competencia)} ×{" "}
          {fmtMonth(result.periodo2?.competencia)})
        </h3>
      </div>
      <div className="px-3 pb-3">
        <div className="rounded-lg bg-white p-4 border border-black/10 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              [
                "Variação glosada",
                fmtCurrency(Math.abs(result.variacoes?.glosa || 0)),
                result.variacoes?.glosa,
              ],
              [
                "Variação da taxa",
                `${Math.abs(result.variacoes?.taxa || 0).toFixed(2)} p.p.`,
                result.variacoes?.taxa,
              ],
              [
                "Variação faturada",
                fmtCurrency(Math.abs(result.variacoes?.faturado || 0)),
                result.variacoes?.faturado,
              ],
            ].map(([label, value, direction]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
              >
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p
                  className={`mt-1 text-lg font-extrabold tabular-nums ${
                    Number(direction) > 0 ? "text-rose-700" : "text-teal-700"
                  }`}
                >
                  {Number(direction) > 0 ? "+" : "−"}
                  {value}
                </p>
              </div>
            ))}
          </div>
          {cards.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {cards.map(([title, content]) => (
                <div
                  key={String(title)}
                  className="rounded-xl border border-slate-200 p-3.5"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                    {title}
                  </h4>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RelatoriosGlosasContent({
  estabelecimentoId,
  estabelecimentoNome,
  fonte,
}: {
  estabelecimentoId: number;
  estabelecimentoNome: string;
  fonte: "OFICIAL" | "WARLEINE";
}) {
  const { isGestor } = useEstabelecimento();
  const { user } = useAuth();
  const podePersonalizar = user?.role === "admin" || isGestor;

  const isWarleine = fonte === "WARLEINE";
  const isHopHup = isWarleine && estabelecimentoId === 1260036;

  const [abaAtiva, setAbaAtiva] = useState<AbaGlosasBiId>("visao_geral");
  const [mesPagamentoInicio, setMesPagamentoInicio] = useState<string | undefined>();
  const [mesPagamentoFim, setMesPagamentoFim] = useState<string | undefined>();
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [convenioChave, setConvenioChave] = useState<string | undefined>();
  const [categoriaGlosa, setCategoriaGlosa] = useState<string | undefined>();
  const [mesPagamento, setMesPagamento] = useState<string | undefined>();
  const [itemDescricao, setItemDescricao] = useState<string | undefined>();
  const [procedimentoCodigo, setProcedimentoCodigo] = useState<string | undefined>();
  const [motivoCodigo, setMotivoCodigo] = useState<string | undefined>();
  const [showComparar, setShowComparar] = useState(false);
  const [competencia1, setCompetencia1] = useState("");
  const [competencia2, setCompetencia2] = useState("");
  const [comparativo, setComparativo] = useState<any>(null);
  const [personalizarOpen, setPersonalizarOpen] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const containerFullscreenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFsChange = () => {
      setTelaCheia(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleTelaCheia = async () => {
    try {
      if (!document.fullscreenElement && containerFullscreenRef.current) {
        await containerFullscreenRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      setTelaCheia((v) => !v);
    }
  };

  const utils = trpc.useUtils();
  const refetchAllGlosas = useCallback(async () => {
    await Promise.all([
      utils.relatoriosGlosasBi.painelExecutivo.invalidate(),
      utils.relatoriosGlosasBi.filtros.invalidate(),
      utils.warleineFaturamento.glosasBi.invalidate(),
      utils.warleineFaturamento.filtrosGlosas.invalidate(),
      utils.painelBiPersonalizado.obterConfiguracaoGlosas.invalidate(),
    ]);
  }, [utils]);

  const {
    autoRefreshAtivo,
    toggleAutoRefresh,
    arquivosEmProcessamento,
    queryOptions,
  } = useBiAutoRefresh({
    estabelecimentoId,
    onRefetch: refetchAllGlosas,
    monitorarProcessamento: !isWarleine,
  });

  // Identidade visual compartilhada do hospital (mesma logo e paleta extraída do cliente)
  const configClienteQuery = trpc.painelBiPersonalizado.obterConfiguracaoGlosas.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 },
  );
  const configCliente = configClienteQuery.data || DEFAULT_BI_CLIENT_CONFIG;
  const palette = useMemo(() => resolveBiThemePalette(configCliente), [configCliente]);
  const nomeExibidoCliente = configCliente.nomeExibicao || estabelecimentoNome;

  const officialFiltersQuery = trpc.relatoriosGlosasBi.filtros.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 && !isWarleine, ...queryOptions },
  );
  const warleineFiltersQuery = trpc.warleineFaturamento.filtrosGlosas.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 && isWarleine, ...queryOptions },
  );
  const filtrosQuery = (
    isWarleine ? warleineFiltersQuery : officialFiltersQuery
  ) as typeof officialFiltersQuery;

  const painelInput = useMemo(
    () => ({
      estabelecimentoId,
      convenioId,
      mesPagamentoInicio,
      mesPagamentoFim,
      categoriaGlosa,
      mesPagamento,
      itemDescricao,
      procedimentoCodigo,
      motivoCodigo,
      limite: 25,
    }),
    [
      estabelecimentoId,
      convenioId,
      mesPagamentoInicio,
      mesPagamentoFim,
      categoriaGlosa,
      mesPagamento,
      itemDescricao,
      procedimentoCodigo,
      motivoCodigo,
    ],
  );

  const warleinePanelInput = useMemo(() => {
    const categoriaWarleine: "COM_CODIGO" | "SEM_CODIGO" | undefined =
      categoriaGlosa === "COM_CODIGO" || categoriaGlosa === "SEM_CODIGO"
        ? categoriaGlosa
        : undefined;
    const { convenioId: _officialConvenioId, ...commonInput } = painelInput;
    return { ...commonInput, convenioChave, categoriaGlosa: categoriaWarleine };
  }, [painelInput, convenioChave, categoriaGlosa]);

  const officialPanelQuery = trpc.relatoriosGlosasBi.painelExecutivo.useQuery(
    painelInput,
    {
      enabled: estabelecimentoId > 0 && !isWarleine,
      placeholderData: (previousData) => previousData,
      ...queryOptions,
    },
  );
  const warleinePanelQuery = trpc.warleineFaturamento.glosasBi.useQuery(
    warleinePanelInput,
    {
      enabled: estabelecimentoId > 0 && isWarleine,
      placeholderData: (previousData) => previousData,
      ...queryOptions,
    },
  );
  const painelQuery = (
    isWarleine ? warleinePanelQuery : officialPanelQuery
  ) as typeof officialPanelQuery;

  const comparativoMutation = trpc.relatoriosGlosasBi.comparativoMeses.useMutation({
    onSuccess: (res) => {
      setComparativo(res);
      setShowComparar(false);
      setAbaAtiva("tratamento_lotes");
      toast.success("Comparativo entre competências gerado!");
    },
    onError: (error) =>
      toast.error(`Não foi possível comparar os meses: ${error.message}`),
  });

  const data = painelQuery.isError ? undefined : painelQuery.data;
  const convenioSelecionado = isWarleine ? convenioChave : convenioId;
  const filtrosAtivos = [
    mesPagamentoInicio,
    mesPagamentoFim,
    convenioSelecionado,
    categoriaGlosa,
    mesPagamento,
    itemDescricao,
    procedimentoCodigo,
    motivoCodigo,
  ].filter(Boolean).length;

  const periodoLabel =
    mesPagamentoInicio || mesPagamentoFim
      ? `${fmtMonth(mesPagamentoInicio || filtrosQuery.data?.competencias.at(-1))} a ${fmtMonth(mesPagamentoFim || filtrosQuery.data?.competencias[0])}`
      : isWarleine
        ? "Todo o histórico da competência importada"
        : "Todo o histórico por data de referência";

  const limparFiltros = () => {
    setMesPagamentoInicio(undefined);
    setMesPagamentoFim(undefined);
    setConvenioId(undefined);
    setConvenioChave(undefined);
    setCategoriaGlosa(undefined);
    setMesPagamento(undefined);
    setItemDescricao(undefined);
    setProcedimentoCodigo(undefined);
    setMotivoCodigo(undefined);
  };

  const toggleMesPagamento = (valor: string) =>
    setMesPagamento((atual) => (atual === valor ? undefined : valor));
  const toggleConvenio = (valor: number | string) => {
    if (isWarleine) {
      setConvenioChave((atual) => (atual === String(valor) ? undefined : String(valor)));
    } else {
      setConvenioId((atual) => (atual === Number(valor) ? undefined : Number(valor)));
    }
  };
  const toggleItem = (valor: string) =>
    setItemDescricao((atual) => (atual === valor ? undefined : valor));
  const toggleProcedimento = (valor: string) =>
    setProcedimentoCodigo((atual) => (atual === valor ? undefined : valor));
  const toggleMotivo = (valor: string) =>
    setMotivoCodigo((atual) => (atual === valor ? undefined : valor));

  const convenioSelecionadoNome = convenioSelecionado
    ? filtrosQuery.data?.convenios.find(
        (item) => String(item.id) === String(convenioSelecionado),
      )?.nome || String(convenioSelecionado)
    : undefined;

  const motivoSelecionadoNome = motivoCodigo
    ? data?.porMotivo.find((item: any) => item.codigoGlosa === motivoCodigo)?.nome ||
      motivoCodigo
    : undefined;

  const recorteInterativoLabel =
    [
      mesPagamento
        ? `${isWarleine ? "Competência" : "Mês"} ${fmtMonth(mesPagamento)}`
        : null,
      convenioSelecionadoNome ? `Convênio ${convenioSelecionadoNome}` : null,
      itemDescricao ? `Item ${itemDescricao}` : null,
      procedimentoCodigo ? `Procedimento ${procedimentoCodigo}` : null,
      motivoSelecionadoNome ? `Motivo ${motivoSelecionadoNome}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || "Visão geral";

  const handleRefresh = async () => {
    await Promise.all([
      painelQuery.refetch(),
      filtrosQuery.refetch(),
      configClienteQuery.refetch(),
    ]);
    toast.success("Painel de glosas atualizado com os dados mais recentes.");
  };

  // Transformação das linhas para as Matrizes Power BI
  const linhasMatrizCompetencia: LinhaMatrizGlosaBi[] = useMemo(
    () =>
      (data?.porMesPagamento || []).map((item: any) => ({
        chave: String(item.mesPagamento),
        label: fmtMonth(item.mesPagamento),
        qtdItens: Number(item.qtdItens || 0),
        valorProcessado: Number(item.valorProcessado || 0),
        valorGlosado: Number(item.valorGlosado || 0),
        glosaRecursada: Number(item.glosaRecursada || 0),
        glosaAceita: Number(item.glosaAceita || 0),
        glosaPendente: Number(item.glosaPendente || 0),
        taxaGlosa: Number(item.taxaGlosa || 0),
      })),
    [data?.porMesPagamento],
  );

  const linhasMatrizConvenio: LinhaMatrizGlosaBi[] = useMemo(
    () =>
      (data?.porConvenio || []).map((item: any) => ({
        chave: String(item.convenioId),
        label: String(item.nome || "Não informado"),
        qtdItens: Number(item.qtdItens || 0),
        valorProcessado: Number(item.valorProcessado || 0),
        valorGlosado: Number(item.valorGlosado || 0),
        glosaRecursada: Number(item.glosaRecursada || 0),
        glosaAceita: Number(item.glosaAceita || 0),
        glosaPendente: Number(item.glosaPendente || 0),
        taxaGlosa: Number(item.taxaGlosa || 0),
        percentualTotal: Number(item.percentualTotal || 0),
      })),
    [data?.porConvenio],
  );

  const linhasMatrizMotivos: LinhaMatrizGlosaBi[] = useMemo(
    () =>
      (data?.porMotivo || []).map((item: any) => ({
        chave: String(item.codigoGlosa),
        label: `${item.codigoGlosa} — ${item.nome}`,
        badge: item.categoria,
        qtdItens: Number(item.qtdItens || 0),
        valorGlosado: Number(item.valorGlosado || 0),
        glosaRecursada: Number(item.glosaRecursada || 0),
        glosaAceita: Number(item.glosaAceita || 0),
        glosaPendente: Number(item.glosaPendente || 0),
        percentualTotal: Number(item.percentualTotal || 0),
      })),
    [data?.porMotivo],
  );

  const linhasMatrizProcedimentos: LinhaMatrizGlosaBi[] = useMemo(
    () =>
      (data?.porProcedimento || []).map((item: any) => ({
        chave: String(item.codigoItem),
        label: `${item.codigoItem} — ${item.nome}`,
        badge: item.tipoLancamento,
        qtdItens: Number(item.qtdItens || 0),
        valorProcessado: Number(item.valorProcessado || 0),
        valorGlosado: Number(item.valorGlosado || 0),
        glosaRecursada: Number(item.glosaRecursada || 0),
        glosaAceita: Number(item.glosaAceita || 0),
        glosaPendente: Number(item.glosaPendente || 0),
        percentualTotal: Number(item.percentualTotal || 0),
      })),
    [data?.porProcedimento],
  );

  const linhasMatrizItens: LinhaMatrizGlosaBi[] = useMemo(
    () =>
      (data?.porItem || []).map((item: any) => ({
        chave: String(item.nome),
        label: String(item.nome || "Não informado"),
        sublabel: item.codigoItem ? `Código: ${item.codigoItem}` : undefined,
        badge: item.tipoLancamento,
        qtdItens: Number(item.qtdItens || 0),
        valorProcessado: Number(item.valorProcessado || 0),
        valorGlosado: Number(item.valorGlosado || 0),
        glosaRecursada: Number(item.glosaRecursada || 0),
        glosaAceita: Number(item.glosaAceita || 0),
        glosaPendente: Number(item.glosaPendente || 0),
        taxaGlosa: Number(item.taxaGlosa || 0),
        percentualTotal: Number(item.percentualTotal || 0),
      })),
    [data?.porItem],
  );

  const handleExportExcel = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const workbook = XLSX.utils.book_new();
    const resumoRows = [
      ["Estabelecimento", nomeExibidoCliente],
      ["Fonte", isWarleine ? "Sistema Warleine / Banco CSV" : "Demonstrativo Oficial"],
      ["Período de referência", periodoLabel],
      ["Convênio", convenioSelecionadoNome || "Todos"],
      ["Categoria de glosa", categoriaGlosa || "Todas"],
      [
        isWarleine
          ? "Competência selecionada no painel"
          : "Mês selecionado no painel",
        mesPagamento ? fmtMonth(mesPagamento) : "Todos",
      ],
      ["Item selecionado no painel", itemDescricao || "Todos"],
      ["Procedimento selecionado no painel", procedimentoCodigo || "Todos"],
      [
        "Motivo selecionado no painel",
        motivoCodigo
          ? `${motivoCodigo} — ${motivoSelecionadoNome || motivoCodigo}`
          : "Todos",
      ],
      ["Recorte interativo", recorteInterativoLabel],
      ["Valor processado", data.resumo.valorProcessado],
      ["Valor pago", data.resumo.valorPago],
      ["Valor glosado", data.resumo.valorGlosado],
      ["Percentual de glosa (%)", data.resumo.taxaGlosa],
      ["Ticket médio da glosa", data.resumo.ticketMedio],
      ["Glosa aceita", data.resumo.glosaAceita],
      ["Glosa recursada", data.resumo.glosaRecursada],
      [
        "Glosa recursada vinculada ao demonstrativo atual",
        data.resumo.glosaRecursadaVinculada || 0,
      ],
      [
        "Glosa recursada histórica sem item no demonstrativo atual",
        data.resumo.glosaRecursadaHistoricaSemVinculo || 0,
      ],
      ["Glosa pendente de análise", data.resumo.glosaPendente],
      ["Percentual analisado (%)", data.resumo.percentualAnalisado],
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Indicador", "Valor"], ...resumoRows]),
      "Resumo",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        data.porMesPagamento.map((item: any) => ({
          [isWarleine ? "Competência Warleine" : "Mês de referência"]: fmtMonth(
            item.mesPagamento,
          ),
          "Valor processado": item.valorProcessado,
          "Valor glosado": item.valorGlosado,
          "Glosa aceita": item.glosaAceita,
          "Glosa recursada": item.glosaRecursada,
          "Glosa pendente": item.glosaPendente,
          "Percentual de glosa (%)": item.taxaGlosa,
          "Quantidade de itens": item.qtdItens,
        })),
      ),
      "Glosa por Mês",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        data.porConvenio.map((item: any) => ({
          Convênio: item.nome,
          "Valor processado": item.valorProcessado,
          "Valor glosado": item.valorGlosado,
          "Glosa aceita": item.glosaAceita,
          "Glosa recursada": item.glosaRecursada,
          "Glosa pendente": item.glosaPendente,
          "% da glosa": item.percentualTotal,
          "Taxa de glosa (%)": item.taxaGlosa,
          "Quantidade de itens": item.qtdItens,
        })),
      ),
      "Glosa por Convênio",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        data.porItem.map((item: any) => ({
          "Código do item": item.codigoItem || "",
          "Descrição do item": item.nome,
          Tipo: item.tipoLancamento,
          "Valor processado": item.valorProcessado,
          "Valor glosado": item.valorGlosado,
          "Glosa aceita": item.glosaAceita,
          "Glosa recursada": item.glosaRecursada,
          "Glosa pendente": item.glosaPendente,
          "% da glosa": item.percentualTotal,
          "Taxa de glosa (%)": item.taxaGlosa,
          Quantidade: item.qtdItens,
        })),
      ),
      "Glosa por Item",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        data.porProcedimento.map((item: any) => ({
          "Código do procedimento": item.codigoItem,
          "Descrição do procedimento": item.nome,
          Tipo: item.tipoLancamento,
          "Valor processado": item.valorProcessado,
          "Valor glosado": item.valorGlosado,
          "Glosa aceita": item.glosaAceita,
          "Glosa recursada": item.glosaRecursada,
          "Glosa pendente": item.glosaPendente,
          "% da glosa": item.percentualTotal,
          Quantidade: item.qtdItens,
        })),
      ),
      "Glosa por Procedimento",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        data.porMotivo.map((item: any) => ({
          "Código TISS": item.codigoGlosa,
          "Motivo descritivo": item.nome,
          Categoria: item.categoria,
          "Valor glosado": item.valorGlosado,
          "Glosa aceita": item.glosaAceita,
          "Glosa recursada": item.glosaRecursada,
          "Glosa pendente": item.glosaPendente,
          "% da glosa": item.percentualTotal,
          Quantidade: item.qtdItens,
        })),
      ),
      "Motivos de Glosa",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        (data.recursosAnalisados?.lotes || []).map((lote: any) => ({
          Lote: lote.numeroLote || (lote.loteId ? `Lote ${lote.loteId}` : "Ainda sem lote"),
          Convênio: lote.convenioNome,
          Status: fmtResourceStatus(lote.status),
          "Data de criação": fmtDate(lote.dataCriacao),
          "Data de envio": fmtDate(lote.dataEnvio),
          "Quantidade de itens": lote.quantidadeItens,
          "Valor recursado": lote.valorRecursado,
          "Itens históricos sem vínculo atual": lote.itensSemVinculoAtual,
        })),
      ),
      "Recursos por Lote",
    );
    XLSX.writeFile(
      workbook,
      `glosas-${isWarleine ? "warleine-" : ""}${nomeExibidoCliente.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success("Excel exportado com os dados e descrições do relatório.");
  };

  // Exportação PowerPoint já personalizada com a identidade de cores da logo do hospital
  const handleExportPptx = () => {
    if (!data) return toast.error("Não há dados para exportar.");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Safatle Consultoria Hospitalar";
    pptx.subject = "Análise executiva de glosas";
    pptx.title = `Glosas — ${nomeExibidoCliente}`;

    const brandPrimaryHex = limparHexPptx(palette.tableHeaderBg, "083D4F");
    const brandAccentHex = limparHexPptx(palette.accentColor, "E87A1E");

    const addHeader = (slide: any, title: string, subtitle: string) => {
      slide.background = { color: "F8FAFC" };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.12,
        fill: { color: brandAccentHex },
        line: { color: brandAccentHex },
      });
      slide.addText(title, {
        x: 0.55,
        y: 0.35,
        w: 8.5,
        h: 0.42,
        fontFace: "Aptos",
        fontSize: 21,
        bold: true,
        color: brandPrimaryHex,
      });
      slide.addText(subtitle, {
        x: 0.55,
        y: 0.82,
        w: 11.8,
        h: 0.3,
        fontFace: "Aptos",
        fontSize: 9,
        color: "667085",
      });
      slide.addText(
        `${nomeExibidoCliente} • ${periodoLabel} • ${shorten(recorteInterativoLabel, 90)}`,
        {
          x: 0.55,
          y: 7.08,
          w: 11.8,
          h: 0.2,
          fontFace: "Aptos",
          fontSize: 8,
          color: "98A2B3",
        },
      );
    };

    const capa = pptx.addSlide();
    capa.background = { color: brandPrimaryHex };
    capa.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y: 0.8,
      w: 0.12,
      h: 5.8,
      fill: { color: brandAccentHex },
      line: { color: brandAccentHex },
    });
    capa.addText("RELATÓRIO EXECUTIVO\nDE GLOSAS", {
      x: 1.1,
      y: 1.4,
      w: 9.5,
      h: 1.5,
      fontFace: "Aptos Display",
      fontSize: 31,
      bold: true,
      color: "FFFFFF",
      breakLine: false,
    });
    capa.addText(nomeExibidoCliente, {
      x: 1.1,
      y: 3.15,
      w: 8.5,
      h: 0.5,
      fontFace: "Aptos",
      fontSize: 19,
      color: brandAccentHex,
    });
    capa.addText(`${periodoLabel}\n${shorten(recorteInterativoLabel, 95)}`, {
      x: 1.1,
      y: 3.75,
      w: 10.8,
      h: 0.65,
      fontFace: "Aptos",
      fontSize: 11,
      color: "CBD5E1",
      breakLine: false,
    });
    capa.addText(
      `Glosa total: ${fmtCurrency(data.resumo.valorGlosado)}  •  Taxa: ${fmtPercent(data.resumo.taxaGlosa)}`,
      {
        x: 1.1,
        y: 4.55,
        w: 9.5,
        h: 0.4,
        fontFace: "Aptos",
        fontSize: 15,
        bold: true,
        color: "FFFFFF",
      },
    );

    const resumoSlide = pptx.addSlide();
    addHeader(resumoSlide, "Indicadores principais", "Visão consolidada do período selecionado");
    const cards = [
      ["VALOR PROCESSADO", fmtCurrency(data.resumo.valorProcessado), brandPrimaryHex],
      ["VALOR GLOSADO", fmtCurrency(data.resumo.valorGlosado), "C24162"],
      ["PERCENTUAL DE GLOSA", fmtPercent(data.resumo.taxaGlosa), brandAccentHex],
      ["GLOSA ACEITA", fmtCurrency(data.resumo.glosaAceita), "C24162"],
      ["GLOSA RECURSADA", fmtCurrency(data.resumo.glosaRecursada), "168A83"],
      ["PENDENTE DE ANÁLISE", fmtCurrency(data.resumo.glosaPendente), "D18B20"],
    ];
    cards.forEach(([label, value, color], index) => {
      const x = 0.55 + (index % 3) * 4.15;
      const y = 1.45 + Math.floor(index / 3) * 2.25;
      resumoSlide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: 3.75,
        h: 1.8,
        fill: { color: "FFFFFF" },
        line: { color: "E4E7EC" },
      });
      resumoSlide.addText(label, {
        x: x + 0.2,
        y: y + 0.22,
        w: 3.3,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: "667085",
      });
      resumoSlide.addText(value, {
        x: x + 0.2,
        y: y + 0.75,
        w: 3.3,
        h: 0.5,
        fontSize: 19,
        bold: true,
        color,
      });
    });

    const addRankingSlide = (
      title: string,
      subtitle: string,
      rows: any[],
      label: (row: any) => string,
    ) => {
      const slide = pptx.addSlide();
      addHeader(slide, title, subtitle);
      const top = rows.slice(0, 10);
      slide.addChart(
        pptx.ChartType.bar,
        [
          {
            name: "Valor glosado",
            labels: top.map(label),
            values: top.map((row) => row.valorGlosado),
          },
        ],
        {
          x: 0.45,
          y: 1.25,
          w: 7.4,
          h: 5.45,
          barDir: "bar",
          showLegend: false,
          chartColors: [brandAccentHex],
          catAxisLabelFontSize: 8,
          catAxisLabelColor: "344054",
          valAxisLabelFontSize: 8,
          valAxisLabelColor: "667085",
          valGridLine: { color: "E4E7EC" },
        },
      );
      slide.addTable(
        [
          [
            {
              text: "Descrição",
              options: { bold: true, color: "FFFFFF", fill: { color: brandPrimaryHex } },
            },
            {
              text: "Glosado",
              options: { bold: true, color: "FFFFFF", fill: { color: brandPrimaryHex } },
            },
            {
              text: "%",
              options: { bold: true, color: "FFFFFF", fill: { color: brandPrimaryHex } },
            },
          ],
          ...top.map((row, index) => [
            {
              text: label(row),
              options: { fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" } },
            },
            {
              text: fmtCurrency(row.valorGlosado),
              options: {
                align: "right" as const,
                fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" },
              },
            },
            {
              text: fmtPercent(row.percentualTotal),
              options: {
                align: "right" as const,
                fill: { color: index % 2 ? "F8FAFC" : "FFFFFF" },
              },
            },
          ]),
        ],
        {
          x: 8.0,
          y: 1.3,
          w: 4.85,
          border: { color: "E4E7EC", pt: 0.5 },
          fontFace: "Aptos",
          fontSize: 8,
          colW: [2.9, 1.3, 0.65],
        },
      );
    };

    addRankingSlide(
      "Glosa por convênio",
      "Operadoras com maior impacto financeiro",
      data.porConvenio,
      (row) => shorten(row.nome, 28),
    );
    addRankingSlide(
      "Glosa por item",
      "Itens com maior valor total glosado",
      data.porItem,
      (row) => shorten(row.nome, 28),
    );
    addRankingSlide(
      "Glosa por procedimento",
      "Códigos de procedimento consolidados",
      data.porProcedimento,
      (row) => `${row.codigoItem} — ${shorten(row.nome, 20)}`,
    );

    pptx.writeFile({
      fileName: `relatorio-glosas-${nomeExibidoCliente.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pptx`,
    });
    toast.success("PowerPoint exportado com a identidade do cliente!");
  };

  const compararMeses = () => {
    if (!competencia1 || !competencia2) {
      return toast.error("Selecione os dois meses para comparar.");
    }
    comparativoMutation.mutate({
      estabelecimentoId,
      competencia1,
      competencia2,
      convenioId,
    });
  };

  const abasGlosas: Array<{ id: AbaGlosasBiId; indice: string; nome: string }> = [
    { id: "visao_geral", indice: "01", nome: "Visão Geral" },
    { id: "itens_procedimentos", indice: "02", nome: "Itens & Procedimentos" },
    { id: "tratamento_lotes", indice: "03", nome: "Tratamento & Lotes" },
  ];
  const abaMetaAtual = abasGlosas.find((a) => a.id === abaAtiva) || abasGlosas[0];

  const kpisPrincipais = data
    ? [
        {
          label: "Valor Processado",
          valor: fmtCurrency(data.resumo.valorProcessado),
          detalhe: `${data.resumo.totalGuiasGlosadas.toLocaleString("pt-BR")} guias c/ glosa`,
        },
        {
          label: "Valor Glosado",
          valor: fmtCurrency(data.resumo.valorGlosado),
          detalhe: `${data.resumo.totalItensGlosados.toLocaleString("pt-BR")} itens glosados`,
        },
        {
          label: "% Glosa",
          valor: fmtPercent(data.resumo.taxaGlosa),
          detalhe: "Glosado ÷ Processado",
        },
        {
          label: "Glosa Recursada",
          valor: fmtCurrency(data.resumo.glosaRecursada),
          detalhe: `${fmtPercent(data.resumo.percentualRecursado)} da glosa`,
        },
        {
          label: "Glosa Aceita",
          valor: fmtCurrency(data.resumo.glosaAceita),
          detalhe: `${fmtPercent(data.resumo.percentualAceito)} da glosa`,
        },
        {
          label: "Pendente Análise",
          valor: fmtCurrency(data.resumo.glosaPendente),
          detalhe: `Ticket médio ${fmtCurrency(data.resumo.ticketMedio)}`,
        },
      ]
    : [];

  return (
    <div className="space-y-2.5 p-2 sm:p-3">
      {/* BARRA DE FERRAMENTAS DO SISTEMA (FORA DO QUADRO DE TV) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
              !isWarleine
                ? "bg-rose-50 text-rose-800 border border-rose-200"
                : "bg-indigo-50 text-indigo-800 border border-indigo-200",
            )}
          >
            {!isWarleine ? (
              <>
                <FileCode2 className="h-3.5 w-3.5" />
                Fonte: Demonstrativos Oficiais (Glosas)
              </>
            ) : (
              <>
                <Database className="h-3.5 w-3.5" />
                Fonte: Banco / CSV ({isHopHup ? "Snapshot Hop HUP" : "Snapshot Warleine"})
              </>
            )}
          </span>

          {filtrosAtivos > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-700 hover:bg-amber-50"
              onClick={limparFiltros}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Limpar filtros ({filtrosAtivos})
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!isWarleine && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowComparar(true)}
            >
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
              Comparar meses
            </Button>
          )}

          {podePersonalizar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100 font-semibold"
              onClick={() => setPersonalizarOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              Personalizar Cliente
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRefresh}
            disabled={painelQuery.isFetching}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1", painelQuery.isFetching && "animate-spin")}
            />
            Atualizar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs text-emerald-700"
            onClick={handleExportExcel}
            disabled={!data}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            Excel
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs text-violet-700"
            onClick={handleExportPptx}
            disabled={!data}
          >
            <Presentation className="h-3.5 w-3.5 mr-1" />
            PowerPoint
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => window.print()}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            PDF
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8 text-xs bg-slate-900 text-white hover:bg-slate-800"
            onClick={toggleTelaCheia}
          >
            {telaCheia ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 mr-1" />
                Sair Tela Cheia
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 mr-1" />
                Modo Apresentação
              </>
            )}
          </Button>
        </div>
      </div>

      {/* BARRA DE ATUALIZAÇÃO AUTOMÁTICA PADRONIZADA DO MÓDULO BI */}
      <BiAutoRefreshBar
        autoRefreshAtivo={autoRefreshAtivo}
        onToggleAutoRefresh={toggleAutoRefresh}
        isFetching={painelQuery.isFetching}
        isError={painelQuery.isError}
        dataUpdatedAt={painelQuery.dataUpdatedAt}
        arquivosEmProcessamento={isWarleine ? 0 : arquivosEmProcessamento}
        fonteIsoladaLabel={
          isHopHup
            ? "Fonte Hop isolada"
            : isWarleine
              ? "Fonte isolada Warleine"
              : undefined
        }
      />

      {/* QUADRO EXECUTIVO POWER BI DE GLOSAS (WHITE-LABEL POR CLIENTE) */}
      <div
        ref={containerFullscreenRef}
        className={cn(
          "overflow-hidden rounded-2xl shadow-2xl flex flex-col justify-between",
          telaCheia ? "fixed inset-0 z-50 rounded-none overflow-y-auto" : "min-h-[82vh]",
        )}
        style={{ background: palette.canvasBg }}
      >
        {/* CABEÇALHO SUPERIOR ESTILO POWER BI */}
        <header
          className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-black/10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3"
          style={{ background: palette.headerBg }}
        >
          {/* Marca do Hospital + Título + Seletor de Abas */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <div
              onClick={() => podePersonalizar && setPersonalizarOpen(true)}
              title={
                podePersonalizar
                  ? "Clique para personalizar a logomarca e cores deste hospital"
                  : nomeExibidoCliente
              }
              className={cn(
                "flex items-center gap-2.5 shrink-0",
                podePersonalizar && "cursor-pointer group",
              )}
            >
              {configCliente.logoUrl ? (
                <img
                  src={configCliente.logoUrl}
                  alt={nomeExibidoCliente}
                  className="h-11 sm:h-12 max-w-[180px] object-contain drop-shadow-2xs"
                />
              ) : (
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl font-extrabold text-sm shadow-sm transition-transform group-hover:scale-105"
                    style={{
                      backgroundColor: palette.accentColor,
                      color: palette.accentContrast,
                    }}
                  >
                    {obterIniciaisHospital(nomeExibidoCliente)}
                  </div>
                  <div className="leading-tight">
                    <p
                      className="text-sm font-extrabold tracking-tight max-w-[190px] truncate"
                      style={{ color: palette.headerText }}
                    >
                      {nomeExibidoCliente}
                    </p>
                    {podePersonalizar && (
                      <p
                        className="text-[10px] font-medium opacity-70 group-hover:underline"
                        style={{ color: palette.headerSubtext }}
                      >
                        + Adicionar logo do cliente
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block h-10 w-px bg-slate-400/35" />

            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.24em]"
                style={{ color: palette.headerSubtext }}
              >
                AUDITORIA DE GLOSAS & RECURSOS
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center justify-center rounded-[5px] px-2 py-0.5 text-xs font-extrabold shadow-2xs"
                  style={{
                    backgroundColor: palette.accentColor,
                    color: palette.accentContrast,
                  }}
                >
                  {abaMetaAtual.indice}
                </span>
                <h1
                  className="text-lg sm:text-xl font-extrabold tracking-tight"
                  style={{ color: palette.accentColor }}
                >
                  {abaMetaAtual.nome}
                </h1>

                <nav className="ml-1 sm:ml-3 inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-900/10 p-1 backdrop-blur-xs">
                  {abasGlosas.map((aba) => {
                    const selecionada = aba.id === abaAtiva;
                    return (
                      <button
                        key={aba.id}
                        type="button"
                        onClick={() => setAbaAtiva(aba.id)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                          selecionada
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-700 hover:bg-white/60",
                        )}
                      >
                        {aba.indice} {aba.nome}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>

          {/* MOLDURA DE SEGMENTAÇÃO DE DADOS (SLICERS ESTILO POWER BI) */}
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border p-2 shadow-sm"
            style={{
              background: palette.slicerFrameBg,
              borderColor: palette.slicerFrameBorder,
            }}
          >
            <div className="min-w-[122px]">
              <span
                className="block rounded-t-[4px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-center"
                style={{
                  backgroundColor: palette.slicerLabelBg,
                  color: palette.slicerLabelText,
                }}
              >
                REF. INICIAL
              </span>
              <Select
                value={mesPagamentoInicio || "todos"}
                onValueChange={(v) => setMesPagamentoInicio(v === "todos" ? undefined : v)}
              >
                <SelectTrigger className="h-7 rounded-t-none rounded-b-[4px] border-0 bg-white/95 px-2 text-[11px] font-semibold text-slate-800 shadow-none">
                  <SelectValue placeholder="Início" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Desde o início</SelectItem>
                  {filtrosQuery.data?.competencias.map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {fmtMonth(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[122px]">
              <span
                className="block rounded-t-[4px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-center"
                style={{
                  backgroundColor: palette.slicerLabelBg,
                  color: palette.slicerLabelText,
                }}
              >
                REF. FINAL
              </span>
              <Select
                value={mesPagamentoFim || "todos"}
                onValueChange={(v) => setMesPagamentoFim(v === "todos" ? undefined : v)}
              >
                <SelectTrigger className="h-7 rounded-t-none rounded-b-[4px] border-0 bg-white/95 px-2 text-[11px] font-semibold text-slate-800 shadow-none">
                  <SelectValue placeholder="Fim" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Último mês</SelectItem>
                  {filtrosQuery.data?.competencias.map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {fmtMonth(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[155px]">
              <span
                className="block rounded-t-[4px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-center"
                style={{
                  backgroundColor: palette.slicerLabelBg,
                  color: palette.slicerLabelText,
                }}
              >
                CONVÊNIO
              </span>
              <Select
                value={convenioSelecionado?.toString() || "todos"}
                onValueChange={(value) => {
                  if (isWarleine) {
                    setConvenioChave(value === "todos" ? undefined : value);
                  } else {
                    setConvenioId(value === "todos" ? undefined : Number(value));
                  }
                }}
              >
                <SelectTrigger className="h-7 rounded-t-none rounded-b-[4px] border-0 bg-white/95 px-2 text-[11px] font-semibold text-slate-800 shadow-none">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {filtrosQuery.data?.convenios.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[145px]">
              <span
                className="block rounded-t-[4px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-center"
                style={{
                  backgroundColor: palette.slicerLabelBg,
                  color: palette.slicerLabelText,
                }}
              >
                CATEGORIA
              </span>
              <Select
                value={categoriaGlosa || "todas"}
                onValueChange={(value) =>
                  setCategoriaGlosa(value === "todas" ? undefined : value)
                }
              >
                <SelectTrigger className="h-7 rounded-t-none rounded-b-[4px] border-0 bg-white/95 px-2 text-[11px] font-semibold text-slate-800 shadow-none">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas categorias</SelectItem>
                  {filtrosQuery.data?.categoriasGlosa.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        {/* CORPO PRINCIPAL DO PAINEL BI DE GLOSAS */}
        <div className="flex-1 px-3 py-3 sm:px-5 sm:py-4 space-y-3.5">
          {/* FAIXA DE CHIPS DE CROSS-FILTERING ATIVO */}
          {(mesPagamento ||
            convenioSelecionado ||
            itemDescricao ||
            procedimentoCodigo ||
            motivoCodigo) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/15 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "mr-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                    palette.isLightCanvas ? "text-slate-600" : "text-white/80",
                  )}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Recorte ativo:
                </span>
                {mesPagamento && (
                  <ActiveFilterChip
                    label={isWarleine ? "Competência" : "Mês"}
                    value={fmtMonth(mesPagamento)}
                    palette={palette}
                    onClear={() => setMesPagamento(undefined)}
                  />
                )}
                {convenioSelecionado && (
                  <ActiveFilterChip
                    label="Convênio"
                    value={convenioSelecionadoNome || String(convenioSelecionado)}
                    palette={palette}
                    onClear={() =>
                      isWarleine ? setConvenioChave(undefined) : setConvenioId(undefined)
                    }
                  />
                )}
                {itemDescricao && (
                  <ActiveFilterChip
                    label="Item"
                    value={shorten(itemDescricao, 36)}
                    palette={palette}
                    onClear={() => setItemDescricao(undefined)}
                  />
                )}
                {procedimentoCodigo && (
                  <ActiveFilterChip
                    label="Procedimento"
                    value={procedimentoCodigo}
                    palette={palette}
                    onClear={() => setProcedimentoCodigo(undefined)}
                  />
                )}
                {motivoCodigo && (
                  <ActiveFilterChip
                    label="Motivo TISS"
                    value={`${motivoCodigo} — ${shorten(motivoSelecionadoNome || motivoCodigo, 30)}`}
                    palette={palette}
                    onClear={() => setMotivoCodigo(undefined)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={limparFiltros}
                className={cn(
                  "text-[11px] font-bold underline",
                  palette.isLightCanvas ? "text-slate-700" : "text-amber-300",
                )}
              >
                Limpar seleção
              </button>
            </div>
          )}

          {painelQuery.isLoading && !data ? (
            <div className="flex min-h-[52vh] flex-col items-center justify-center gap-3">
              <Loader2
                className="h-9 w-9 animate-spin"
                style={{ color: palette.accentColor }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: palette.isLightCanvas ? "#334155" : "#e2e8f0" }}
              >
                Consolidando auditoria executiva de glosas de {nomeExibidoCliente}...
              </p>
            </div>
          ) : painelQuery.isError ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-center">
              <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-rose-600" />
              <p className="text-sm font-bold text-rose-900">
                Não foi possível carregar o relatório de glosas
              </p>
              <p className="mt-1 text-xs text-rose-700">{painelQuery.error.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 bg-white"
                onClick={() => painelQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : data ? (
            <>
              {/* FAIXA DE CARTÕES BIG NUMBERS ESTILO POWER BI */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                {kpisPrincipais.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl px-3.5 py-3 text-center shadow-md border border-black/5 flex flex-col justify-center transition-transform hover:-translate-y-0.5"
                    style={{ backgroundColor: palette.kpiCardBg }}
                  >
                    <p
                      className="text-base sm:text-lg lg:text-[20px] font-extrabold tracking-tight tabular-nums truncate"
                      style={{ color: palette.kpiValueColor }}
                      title={kpi.valor}
                    >
                      {kpi.valor}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ color: palette.kpiLabelColor }}
                    >
                      {kpi.label}
                    </p>
                    <p
                      className="mt-0.5 text-[10px] opacity-75 truncate"
                      style={{ color: palette.kpiLabelColor }}
                    >
                      {kpi.detalhe}
                    </p>
                  </div>
                ))}
              </div>

              {/* ABA 01: VISÃO GERAL EXECUTIVA (MATRIZ 2x2 POWER BI) */}
              {abaAtiva === "visao_geral" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                  <BiGlosasMatrixTable
                    titulo={isWarleine ? "COMPETÊNCIA WARLEINE" : "MÊS DE REFERÊNCIA"}
                    colunaDimensaoLabel={isWarleine ? "Comp." : "Referência"}
                    linhas={linhasMatrizCompetencia}
                    palette={palette}
                    mostrarDataBars={configCliente.mostrarDataBars}
                    mostrarProcessado
                    chaveSelecionada={mesPagamento}
                    onToggleChave={toggleMesPagamento}
                    onLimparSelecao={() => setMesPagamento(undefined)}
                    totaisExplicito={{
                      valorProcessado: data.resumo.valorProcessado,
                      valorGlosado: data.resumo.valorGlosado,
                      glosaRecursada: data.resumo.glosaRecursada,
                      glosaAceita: data.resumo.glosaAceita,
                      glosaPendente: data.resumo.glosaPendente,
                      taxaGlosa: data.resumo.taxaGlosa,
                    }}
                  />

                  <BiGlosasMatrixTable
                    titulo="CONVÊNIOS / OPERADORAS"
                    colunaDimensaoLabel="Convênio"
                    linhas={linhasMatrizConvenio}
                    palette={palette}
                    mostrarDataBars={configCliente.mostrarDataBars}
                    mostrarProcessado
                    chaveSelecionada={convenioSelecionado}
                    onToggleChave={toggleConvenio}
                    onLimparSelecao={() =>
                      isWarleine ? setConvenioChave(undefined) : setConvenioId(undefined)
                    }
                    totaisExplicito={{
                      valorProcessado: data.resumo.valorProcessado,
                      valorGlosado: data.resumo.valorGlosado,
                      glosaRecursada: data.resumo.glosaRecursada,
                      glosaAceita: data.resumo.glosaAceita,
                      glosaPendente: data.resumo.glosaPendente,
                      taxaGlosa: data.resumo.taxaGlosa,
                    }}
                  />

                  {/* GRÁFICO COMBINADO DE EVOLUÇÃO MENSAL DE GLOSAS & % TAXA */}
                  <section
                    className="flex flex-col rounded-xl border shadow-sm overflow-hidden"
                    style={{
                      background: palette.panelBg,
                      borderColor: palette.panelBorder,
                    }}
                  >
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <h3
                        className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
                        style={{ color: palette.panelTitleColor }}
                      >
                        EVOLUÇÃO MENSAL DE GLOSAS & % TAXA
                      </h3>
                      <span
                        className={cn(
                          "text-[10px]",
                          palette.isLightCanvas ? "text-slate-500" : "text-white/70",
                        )}
                      >
                        Clique na coluna para filtrar o mês
                      </span>
                    </div>
                    <div className="px-2.5 pb-2.5 flex-1">
                      <div className="h-[310px] rounded-lg bg-white p-3 border border-black/10">
                        {data.porMesPagamento.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center text-center">
                            <SearchX className="mb-2 h-6 w-6 text-slate-300" />
                            <p className="text-xs text-slate-400">
                              Sem série mensal disponível para o filtro atual.
                            </p>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={data.porMesPagamento.map((item: any) => ({
                                ...item,
                                label: fmtMonth(item.mesPagamento),
                              }))}
                              margin={{ top: 14, right: 12, left: 0, bottom: 4 }}
                            >
                              <CartesianGrid stroke="#e2e8f0" vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={{ fill: "#475569", fontSize: 10.5 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="money"
                                width={50}
                                tickFormatter={fmtCompact}
                                tick={{ fill: "#64748b", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="pct"
                                orientation="right"
                                width={42}
                                tickFormatter={(v) => `${Number(v || 0).toFixed(0)}%`}
                                tick={{ fill: "#64748b", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <RechartsTooltip content={<ChartTooltipExecutivo />} />
                              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                              <Bar
                                yAxisId="money"
                                dataKey="valorGlosado"
                                name="Valor glosado"
                                fill={palette.chartBarColor}
                                radius={[5, 5, 0, 0]}
                                maxBarSize={44}
                                cursor="pointer"
                                onClick={(entry: any) =>
                                  toggleMesPagamento(
                                    entry?.payload?.mesPagamento ?? entry?.mesPagamento,
                                  )
                                }
                              >
                                {data.porMesPagamento.map((item: any) => (
                                  <Cell
                                    key={item.mesPagamento}
                                    fill={
                                      item.mesPagamento === mesPagamento
                                        ? palette.accentColor
                                        : mesPagamento
                                          ? "#cbd5e1"
                                          : palette.chartBarColor
                                    }
                                    fillOpacity={
                                      item.mesPagamento === mesPagamento
                                        ? 1
                                        : mesPagamento
                                          ? 0.48
                                          : 0.9
                                    }
                                  />
                                ))}
                              </Bar>
                              <Line
                                yAxisId="money"
                                type="monotone"
                                dataKey="glosaRecursada"
                                name="Glosa recursada"
                                stroke="#0d9488"
                                strokeWidth={2.2}
                                dot={{ r: 3 }}
                              />
                              <Line
                                yAxisId="pct"
                                type="monotone"
                                dataKey="taxaGlosa"
                                name="% Taxa de glosa"
                                stroke="#dc2626"
                                strokeWidth={2.4}
                                dot={{ r: 3.5 }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </section>

                  <BiGlosasMatrixTable
                    titulo="MOTIVOS DE GLOSA (CÓDIGO TISS)"
                    colunaDimensaoLabel="Código / Motivo"
                    linhas={linhasMatrizMotivos}
                    palette={palette}
                    mostrarDataBars={configCliente.mostrarDataBars}
                    mostrarProcessado={false}
                    mostrarQuantidade
                    modoPercentual="participacao"
                    chaveSelecionada={motivoCodigo}
                    onToggleChave={toggleMotivo}
                    onLimparSelecao={() => setMotivoCodigo(undefined)}
                  />
                </div>
              )}

              {/* ABA 02: ITENS & PROCEDIMENTOS */}
              {abaAtiva === "itens_procedimentos" && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                    <HorizontalRankingExecutivo
                      titulo="TOP 10 PROCEDIMENTOS MAIS GLOSADOS"
                      data={data.porProcedimento.map((item: any) => ({
                        ...item,
                        nome: `${item.codigoItem} — ${item.nome}`,
                      }))}
                      palette={palette}
                      barColor={palette.chartBarColor}
                      selectedValue={procedimentoCodigo}
                      getValue={(item) => item.codigoItem}
                      onSelect={(item) => toggleProcedimento(item.codigoItem)}
                    />

                    <HorizontalRankingExecutivo
                      titulo="TOP 10 ITENS COM MAIOR IMPACTO FINANCEIRO"
                      data={data.porItem}
                      palette={palette}
                      barColor="#e11d48"
                      selectedValue={itemDescricao}
                      getValue={(item) => item.nome}
                      onSelect={(item) => toggleItem(item.nome)}
                    />
                  </div>

                  <BiGlosasMatrixTable
                    titulo="PROCEDIMENTOS CONSOLIDADOS"
                    colunaDimensaoLabel="Código / Procedimento"
                    linhas={linhasMatrizProcedimentos}
                    palette={palette}
                    mostrarDataBars={configCliente.mostrarDataBars}
                    mostrarProcessado
                    mostrarQuantidade
                    modoPercentual="participacao"
                    maxHeightClass="max-h-[340px]"
                    chaveSelecionada={procedimentoCodigo}
                    onToggleChave={toggleProcedimento}
                    onLimparSelecao={() => setProcedimentoCodigo(undefined)}
                  />

                  <BiGlosasMatrixTable
                    titulo="DETALHAMENTO ANALÍTICO POR ITEM GLOSADO"
                    colunaDimensaoLabel="Descrição do Item"
                    linhas={linhasMatrizItens}
                    palette={palette}
                    mostrarDataBars={configCliente.mostrarDataBars}
                    mostrarProcessado
                    mostrarQuantidade
                    modoPercentual="taxaGlosa"
                    maxHeightClass="max-h-[380px]"
                    chaveSelecionada={itemDescricao}
                    onToggleChave={toggleItem}
                    onLimparSelecao={() => setItemDescricao(undefined)}
                  />
                </div>
              )}

              {/* ABA 03: TRATAMENTO DAS GLOSAS & LOTES DE RECURSO */}
              {abaAtiva === "tratamento_lotes" && (
                <div className="space-y-3.5">
                  <section
                    className="rounded-xl border shadow-sm overflow-hidden"
                    style={{
                      background: palette.panelBg,
                      borderColor: palette.panelBorder,
                    }}
                  >
                    <div className="px-4 py-2.5 flex items-center gap-2">
                      <Gavel className="h-4 w-4" style={{ color: palette.panelTitleColor }} />
                      <h3
                        className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
                        style={{ color: palette.panelTitleColor }}
                      >
                        FUNIL DE TRATAMENTO DAS GLOSAS (AUDITORIA & RECURSOS)
                      </h3>
                    </div>
                    <div className="px-3 pb-3">
                      <div className="rounded-lg bg-white p-4 border border-black/10 space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-rose-700">
                                Glosa aceita
                              </p>
                              <Undo2 className="h-4 w-4 text-rose-600" />
                            </div>
                            <p className="mt-2 text-xl font-extrabold text-rose-800 tabular-nums">
                              {fmtCurrency(data.resumo.glosaAceita)}
                            </p>
                            <p className="mt-1 text-xs text-rose-700">
                              {fmtPercent(data.resumo.percentualAceito)} do valor glosado
                            </p>
                            {(data.recursosAnalisados?.quantidadeAceitaHistorica || 0) > 0 && (
                              <p className="mt-2 text-[11px] leading-4 text-rose-700">
                                {data.recursosAnalisados.quantidadeAceitaHistorica.toLocaleString(
                                  "pt-BR",
                                )}{" "}
                                decisões históricas preservadas com vínculo seguro.
                              </p>
                            )}
                          </div>

                          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                                Glosa recursada
                              </p>
                              <ShieldCheck className="h-4 w-4 text-teal-600" />
                            </div>
                            <p className="mt-2 text-xl font-extrabold text-teal-800 tabular-nums">
                              {fmtCurrency(data.resumo.glosaRecursada)}
                            </p>
                            <p className="mt-1 text-xs text-teal-700">
                              {fmtPercent(data.resumo.percentualRecursado)} do valor glosado
                            </p>
                            <p className="mt-2 text-[11px] leading-4 text-teal-700">
                              {data.recursosAnalisados?.quantidadeRecursada?.toLocaleString(
                                "pt-BR",
                              ) || 0}{" "}
                              itens registrados em recurso
                            </p>
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                                Pendente de análise
                              </p>
                              <Loader2 className="h-4 w-4 text-amber-600" />
                            </div>
                            <p className="mt-2 text-xl font-extrabold text-amber-800 tabular-nums">
                              {fmtCurrency(data.resumo.glosaPendente)}
                            </p>
                            <p className="mt-1 text-xs text-amber-700">
                              {fmtPercent(Math.max(0, 100 - data.resumo.percentualAnalisado))} do
                              valor glosado
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="flex h-full">
                              <div
                                className="bg-rose-500 transition-all"
                                style={{
                                  width: `${Math.min(100, data.resumo.percentualAceito)}%`,
                                }}
                              />
                              <div
                                className="bg-teal-500 transition-all"
                                style={{
                                  width: `${Math.min(100, data.resumo.percentualRecursado)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500">
                            {fmtPercent(data.resumo.percentualAnalisado)} das glosas do recorte
                            já possuem decisão registrada.
                          </p>
                        </div>

                        {data.recursosAnalisados?.valorHistoricoSemVinculo > 0 && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                            <strong>
                              {fmtCurrency(data.recursosAnalisados.valorHistoricoSemVinculo)}
                            </strong>{" "}
                            correspondem a{" "}
                            {data.recursosAnalisados.quantidadeHistoricaSemVinculo.toLocaleString(
                              "pt-BR",
                            )}{" "}
                            recursos históricos preservados cujos itens de origem não estão
                            mais no demonstrativo atual. Eles entram no total recursado, sem
                            atribuição artificial a mês, item ou motivo.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* MATRIZ DE LOTES DE RECURSO */}
                  <section
                    className="rounded-xl border shadow-sm overflow-hidden"
                    style={{
                      background: palette.panelBg,
                      borderColor: palette.panelBorder,
                    }}
                  >
                    <div className="px-4 py-2.5 flex items-center gap-2">
                      <ListChecks
                        className="h-4 w-4"
                        style={{ color: palette.panelTitleColor }}
                      />
                      <h3
                        className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
                        style={{ color: palette.panelTitleColor }}
                      >
                        LOTES DE RECURSO REGISTRADOS NO ESTABELECIMENTO
                      </h3>
                    </div>
                    <div className="px-3 pb-3">
                      <div className="overflow-auto max-h-[380px] rounded-lg border border-black/10 bg-white">
                        {data.recursosAnalisados?.lotes?.length ? (
                          <table className="w-full min-w-[880px] border-collapse text-left text-xs">
                            <thead
                              className="sticky top-0 z-10 text-[11px] font-bold uppercase"
                              style={{
                                backgroundColor: palette.tableHeaderBg,
                                color: palette.tableHeaderText,
                              }}
                            >
                              <tr>
                                <th className="px-3 py-2.5">Lote</th>
                                <th className="px-3 py-2.5">Convênio</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5">Envio</th>
                                <th className="px-3 py-2.5 text-right">Itens</th>
                                <th className="px-3 py-2.5 text-right">Valor Recursado</th>
                                <th className="px-3 py-2.5 text-right">
                                  Histórico s/ vínculo
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {data.recursosAnalisados.lotes.map(
                                (lote: any, index: number) => (
                                  <tr
                                    key={`${lote.loteId ?? "sem-lote"}-${lote.convenioId ?? "sem-convenio"}-${index}`}
                                    className="hover:bg-slate-50"
                                  >
                                    <td className="px-3 py-2">
                                      <p className="font-semibold text-slate-900">
                                        {lote.numeroLote ||
                                          (lote.loteId
                                            ? `Lote ${lote.loteId}`
                                            : "Ainda sem lote")}
                                      </p>
                                      <p className="text-[10.5px] text-slate-500">
                                        Criado em {fmtDate(lote.dataCriacao)}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {lote.convenioNome}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                                          lote.status === "enviado"
                                            ? "bg-teal-50 text-teal-700"
                                            : "bg-amber-50 text-amber-700",
                                        )}
                                      >
                                        {fmtResourceStatus(lote.status)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">
                                      {fmtDate(lote.dataEnvio)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                      {lote.quantidadeItens.toLocaleString("pt-BR")}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-teal-700 tabular-nums">
                                      {fmtCurrency(lote.valorRecursado)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-blue-700 tabular-nums">
                                      {lote.itensSemVinculoAtual.toLocaleString("pt-BR")}
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        ) : (
                          <div className="py-10 text-center text-xs text-slate-400">
                            Nenhum lote de recurso encontrado para os filtros selecionados.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {!isWarleine && comparativo && (
                    <ComparativoSectionExecutivo
                      result={comparativo}
                      palette={palette}
                    />
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* RODAPÉ INSTITUCIONAL ESTILO POWER BI */}
        <footer
          className="px-4 py-2 sm:px-6 text-[10.5px] flex flex-wrap items-center justify-between gap-2 border-t border-white/10"
          style={{
            backgroundColor: palette.footerBg,
            color: palette.footerText,
          }}
        >
          <span className="font-bold uppercase tracking-wider">
            AUDITORIA DE GLOSAS & RECURSOS — {nomeExibidoCliente}
          </span>
          <span className="font-medium opacity-90">
            Safatle Consultoria Hospitalar
          </span>
          <span className="tabular-nums opacity-80">
            {periodoLabel} • {isWarleine ? "Base Banco/CSV" : "Demonstrativos Oficiais"}
          </span>
        </footer>
      </div>

      {/* MODAL DE COMPARATIVO INTELIGENTE ENTRE COMPETÊNCIAS */}
      <Dialog open={!isWarleine && showComparar} onOpenChange={setShowComparar}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comparar competências</DialogTitle>
            <DialogDescription>
              Selecione dois períodos para obter uma leitura comparativa das glosas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                Competência inicial
              </p>
              <Select value={competencia1} onValueChange={setCompetencia1}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filtrosQuery.data?.competencias.map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {fmtMonth(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                Competência final
              </p>
              <Select value={competencia2} onValueChange={setCompetencia2}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filtrosQuery.data?.competencias.map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {fmtMonth(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={compararMeses}
            disabled={!competencia1 || !competencia2 || comparativoMutation.isPending}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {comparativoMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="mr-2 h-4 w-4" />
            )}
            Gerar comparativo
          </Button>
        </DialogContent>
      </Dialog>

      {/* ESTÚDIO DE PERSONALIZAÇÃO DO CLIENTE (SINCRONIZADO COM FATURAMENTO) */}
      {podePersonalizar && (
        <BiPersonalizacaoDialog
          open={personalizarOpen}
          onOpenChange={setPersonalizarOpen}
          estabelecimentoId={estabelecimentoId}
          estabelecimentoNome={estabelecimentoNome}
          configAtual={configCliente}
          onSaved={() => {
            void configClienteQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

export function RelatoriosGlosasView({
  fonte = "OFICIAL",
}: {
  fonte?: "OFICIAL" | "WARLEINE";
}) {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const estabelecimentoNome =
    estabelecimentoAtual?.nome?.trim() || "Estabelecimento";

  if (!estabelecimentoAtual || estabelecimentoId <= 0) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[65vh] items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-9 w-9 text-amber-500" />
            <h1 className="text-lg font-semibold text-slate-900">
              Selecione um estabelecimento
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              O relatório executivo de glosas exige uma unidade específica para exibir a
              identidade visual e impedir a mistura de dados entre hospitais.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <RelatoriosGlosasContent
        key={`${estabelecimentoId}:${fonte}`}
        estabelecimentoId={estabelecimentoId}
        estabelecimentoNome={estabelecimentoNome}
        fonte={fonte}
      />
    </DashboardLayout>
  );
}

export default function RelatoriosGlosasBi() {
  return <RelatoriosGlosasView />;
}
