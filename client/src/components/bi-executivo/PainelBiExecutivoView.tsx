import React, { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { LancamentosManuaisDialog } from "@/components/bi/LancamentosManuaisDialog";
import { ImportarWarleineDialog } from "@/components/bi/ImportarWarleineDialog";
import { BI_AUTO_REFRESH_INTERVAL_MS } from "@shared/biAutoRefresh";
import {
  BI_KPI_CATALOG,
  DEFAULT_BI_CLIENT_CONFIG,
  resolveBiThemePalette,
  type BiAbaId,
  type BiCriterioPeriodoXml,
  type BiDimensaoSetor,
  type BiKpiId,
  type BiSubFonteBanco,
} from "@shared/biPersonalizadoConfig";
import { BiSlicerDropdown } from "./BiSlicerDropdown";
import { BiMatrixTable } from "./BiMatrixTable";
import { BiEvolucaoComboChart } from "./BiEvolucaoComboChart";
import { BiPersonalizacaoDialog } from "./BiPersonalizacaoDialog";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Building2,
  Database,
  Download,
  FileCode2,
  FilePenLine,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmtMoeda = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

const fmtInt = (v: number) => Number(v || 0).toLocaleString("pt-BR");

function formatarDataHoraRodape(iso: string | null | undefined): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) {
    return new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function obterIniciaisHospital(nome: string): string {
  const partes = nome
    .replace(/hospital|clinica|clínica|maternidade|instituto|santa|são|sao/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return nome.slice(0, 2).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 3).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export interface PainelBiExecutivoViewProps {
  modoFonte: "XML" | "BANCO_CSV";
}

export function PainelBiExecutivoView({ modoFonte }: PainelBiExecutivoViewProps) {
  const { estabelecimentoAtual, isGestor, temAcessoModulo } = useEstabelecimento();
  const { user } = useAuth();
  const podePersonalizar = user?.role === "admin" || isGestor;

  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const isXml = modoFonte === "XML";
  const isHopHup = !isXml && estabelecimentoId === 1260036;

  const [abaAtiva, setAbaAtiva] = useState<BiAbaId>("visao_geral");
  const [setoresSel, setSetoresSel] = useState<string[]>([]);
  const [competenciasSel, setCompetenciasSel] = useState<string[]>([]);
  const [conveniosSel, setConveniosSel] = useState<string[]>([]);

  const [criterioXmlOverride, setCriterioXmlOverride] = useState<BiCriterioPeriodoXml | undefined>();
  const [subFonteBancoOverride, setSubFonteBancoOverride] = useState<BiSubFonteBanco | undefined>();
  const [dimensaoSetorOverride, setDimensaoSetorOverride] = useState<BiDimensaoSetor | undefined>();

  const [personalizarOpen, setPersonalizarOpen] = useState(false);
  const [cadastroManualOpen, setCadastroManualOpen] = useState(false);
  const [importarBancoOpen, setImportarBancoOpen] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const containerFullscreenRef = useRef<HTMLDivElement>(null);

  // Resetar seleções ao trocar de estabelecimento
  useEffect(() => {
    setSetoresSel([]);
    setCompetenciasSel([]);
    setConveniosSel([]);
    setCriterioXmlOverride(undefined);
    setSubFonteBancoOverride(undefined);
    setDimensaoSetorOverride(undefined);
    setAbaAtiva("visao_geral");
  }, [estabelecimentoId, modoFonte]);

  useEffect(() => {
    const onFsChange = () => {
      setTelaCheia(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const queryInput = useMemo(
    () => ({
      estabelecimentoId,
      modoFonte,
      setores: setoresSel.length > 0 ? setoresSel : undefined,
      competencias: competenciasSel.length > 0 ? competenciasSel : undefined,
      convenios: conveniosSel.length > 0 ? conveniosSel : undefined,
      criterioPeriodoXml: criterioXmlOverride,
      subFonteBanco: subFonteBancoOverride,
      dimensaoSetor: dimensaoSetorOverride,
    }),
    [
      estabelecimentoId,
      modoFonte,
      setoresSel,
      competenciasSel,
      conveniosSel,
      criterioXmlOverride,
      subFonteBancoOverride,
      dimensaoSetorOverride,
    ],
  );

  const query = trpc.painelBiPersonalizado.dados.useQuery(queryInput, {
    enabled: estabelecimentoId > 0,
    placeholderData: (prev) => prev,
    refetchInterval: BI_AUTO_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const data = query.data;
  const config = data?.configCliente || DEFAULT_BI_CLIENT_CONFIG;
  const palette = useMemo(() => resolveBiThemePalette(config), [config]);

  // Garantir que a aba ativa pertença às abas habilitadas do cliente
  useEffect(() => {
    if (config.abasVisiveis.length > 0 && !config.abasVisiveis.includes(abaAtiva)) {
      setAbaAtiva(config.abasVisiveis[0]);
    }
  }, [config.abasVisiveis, abaAtiva]);

  const toggleValorCrossFilter = (
    listaAtual: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    chave: string,
  ) => {
    if (listaAtual.length === 1 && listaAtual[0] === chave) {
      setter([]);
    } else {
      setter([chave]);
    }
  };

  const limparTodosFiltros = () => {
    setSetoresSel([]);
    setCompetenciasSel([]);
    setConveniosSel([]);
  };

  const totalFiltrosAtivos =
    setoresSel.length + competenciasSel.length + conveniosSel.length;

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

  const obterValorKpi = (kpiId: BiKpiId): string => {
    const r = data?.resumo;
    if (!r) return "R$ 0,00";
    switch (kpiId) {
      case "produzido":
        return fmtMoeda(r.produzido);
      case "faturado":
        return fmtMoeda(r.faturado);
      case "recebido":
        return fmtMoeda(r.recebido);
      case "a_receber":
        return fmtMoeda(r.aReceber);
      case "glosa":
        return fmtMoeda(r.glosa);
      case "pct_glosa":
        return fmtPct(r.pctGlosa);
      case "pct_recebido":
        return fmtPct(r.pctRecebido);
      case "glosa_recurso":
        return fmtMoeda(r.glosaEmRecurso);
      case "glosa_recuperada":
        return fmtMoeda(r.glosaRecuperada);
      case "qtd_contas":
        return fmtInt(r.qtdContas);
      default:
        return "R$ 0,00";
    }
  };

  const dimensaoSetorEfetiva =
    dimensaoSetorOverride || data?.fonteAtiva.dimensaoSetorAtiva || config.dimensaoPainelSetores;

  const labelPainelSetor = useMemo(() => {
    if (config.tituloPainelSetores && !dimensaoSetorOverride) {
      return { titulo: config.tituloPainelSetores, coluna: config.tituloPainelSetores };
    }
    if (dimensaoSetorEfetiva === "tipo_item") {
      return { titulo: "GRUPOS DE FATURAMENTO", coluna: "Tipo de Item" };
    }
    if (dimensaoSetorEfetiva === "prestador") {
      return { titulo: "PRESTADORES / CORPO CLÍNICO", coluna: "Prestador" };
    }
    return { titulo: "SETORES", coluna: "Setor" };
  }, [config.tituloPainelSetores, dimensaoSetorOverride, dimensaoSetorEfetiva]);

  const handleExportExcel = () => {
    if (!data) return toast.error("Sem dados carregados para exportar.");
    const wb = XLSX.utils.book_new();
    const r = data.resumo;

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Painel BI Executivo — Safatle Consultoria Hospitalar"],
        ["Cliente / Estabelecimento", config.nomeExibicao || data.estabelecimento.nome],
        ["Fonte de Dados", isXml ? "Base XML / Demonstrativos Oficiais" : `Banco / CSV (${data.fonteAtiva.subFonteResolvida})`],
        ["Atualizado em", formatarDataHoraRodape(data.fonteAtiva.atualizadoEm)],
        [],
        ["Indicador", "Valor"],
        ["Faturado", r.faturado],
        ["VL. Recebido", r.recebido],
        ["A Receber", r.aReceber],
        ["Glosa", r.glosa],
        ["% Glosa", r.pctGlosa],
        ["% Recebido", r.pctRecebido],
        ["Glosa em Recurso", r.glosaEmRecurso],
        ["Glosa Recuperada", r.glosaRecuperada],
        ["Contas / Guias", r.qtdContas],
      ]),
      "Resumo Executivo",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.porCompetencia.map((x) => ({
          "Comp. Fat.": x.label,
          Faturado: x.faturado,
          "VL. Recebido": x.recebido,
          Glosa: x.glosa,
          "A Receber": x.aReceber,
          "% Glosa": x.pctGlosa,
        })),
      ),
      "Competência",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.porSetor.map((x) => ({
          [labelPainelSetor.coluna]: x.label,
          Faturado: x.faturado,
          "VL. Recebido": x.recebido,
          Glosa: x.glosa,
          "A Receber": x.aReceber,
          "% Glosa": x.pctGlosa,
        })),
      ),
      "Setores",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.porConvenio.map((x) => ({
          Convênio: x.label,
          Faturado: x.faturado,
          "VL. Recebido": x.recebido,
          Glosa: x.glosa,
          "A Receber": x.aReceber,
          "% Glosa": x.pctGlosa,
        })),
      ),
      "Convênios",
    );

    if (data.porMotivoGlosa.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.porMotivoGlosa.map((m) => ({
            Código: m.codigo,
            Motivo: m.motivo,
            "Valor Glosa": m.glosa,
            "% Participação": m.pctParticipacao,
            Quantidade: m.quantidade,
          })),
        ),
        "Motivos Glosa",
      );
    }

    const slug = (config.nomeExibicao || data.estabelecimento.nome)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    XLSX.writeFile(wb, `painel-bi-${isXml ? "xml" : "banco"}-${slug}.xlsx`);
    toast.success("Relatório BI exportado em Excel com sucesso!");
  };

  if (!estabelecimentoAtual || estabelecimentoAtual.id === 0) {
    return (
      <DashboardLayout>
        <main className="flex min-h-[72vh] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-bold text-slate-900">
              Selecione um Cliente / Estabelecimento
            </h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Escolha um hospital específico no seletor superior para abrir seu Painel BI
              Executivo com identidade visual e indicadores personalizados.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  const abasCatalogo: Array<{ id: BiAbaId; indice: string; nome: string }> = [
    { id: "visao_geral", indice: "01", nome: config.nomesAbas.visao_geral || "Visão Geral" },
    { id: "glosas", indice: "02", nome: config.nomesAbas.glosas || "Glosas & Recursos" },
    {
      id: "setores_producao",
      indice: "03",
      nome: config.nomesAbas.setores_producao || "Setores & Produção",
    },
  ];
  const abasHabilitadas = abasCatalogo.filter((a) => config.abasVisiveis.includes(a.id));
  const abaMetaAtual = abasHabilitadas.find((a) => a.id === abaAtiva) || abasHabilitadas[0] || abasCatalogo[0];

  const nomeExibidoCliente = config.nomeExibicao || estabelecimentoAtual.nome;
  const criterioXmlAtivo = criterioXmlOverride || data?.fonteAtiva.criterioPeriodoXml || config.criterioPeriodoXmlPadrao;

  const gridKpiColsClass =
    config.kpisVisiveis.length <= 3
      ? "grid-cols-1 sm:grid-cols-3"
      : config.kpisVisiveis.length === 4
        ? "grid-cols-2 lg:grid-cols-4"
        : config.kpisVisiveis.length === 5
          ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
          : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6";

  return (
    <DashboardLayout>
      <div className="space-y-2.5 p-2 sm:p-3">
        {/* BARRA DE FERRAMENTAS DO SISTEMA (FORA DO QUADRO EXECUTIVO / OCULTA EM TELA CHEIA) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                isXml
                  ? "bg-sky-50 text-sky-800 border border-sky-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200",
              )}
            >
              {isXml ? (
                <>
                  <FileCode2 className="h-3.5 w-3.5" />
                  Fonte: Base XML & Demonstrativos
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5" />
                  Fonte: Banco / CSV (
                  {data?.fonteAtiva.subFonteResolvida === "RECEBIMENTO_GERAL"
                    ? "ERP Recebimento Geral"
                    : isHopHup
                      ? "Snapshot Hop HUP"
                      : "Snapshot CSV / Warleine"}
                  )
                </>
              )}
            </span>

            {isXml ? (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setCriterioXmlOverride("FATURAMENTO")}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition-colors",
                    criterioXmlAtivo === "FATURAMENTO"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  Comp. Faturamento
                </button>
                <button
                  type="button"
                  onClick={() => setCriterioXmlOverride("PAGAMENTO")}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition-colors",
                    criterioXmlAtivo === "PAGAMENTO"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  Mês Pagamento
                </button>
              </div>
            ) : (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSubFonteBancoOverride("AUTO")}
                  className={cn(
                    "rounded-md px-2 py-1 font-semibold transition-colors",
                    (!subFonteBancoOverride || subFonteBancoOverride === "AUTO")
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  Automático
                </button>
                <button
                  type="button"
                  onClick={() => setSubFonteBancoOverride("WARLEINE")}
                  className={cn(
                    "rounded-md px-2 py-1 font-semibold transition-colors",
                    subFonteBancoOverride === "WARLEINE"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  CSV / Warleine
                </button>
                <button
                  type="button"
                  onClick={() => setSubFonteBancoOverride("RECEBIMENTO_GERAL")}
                  className={cn(
                    "rounded-md px-2 py-1 font-semibold transition-colors",
                    subFonteBancoOverride === "RECEBIMENTO_GERAL"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  ERP Geral
                </button>
              </div>
            )}

            {totalFiltrosAtivos > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                onClick={limparTodosFiltros}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Limpar filtros ({totalFiltrosAtivos})
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isXml && temAcessoModulo("faturamentoExterno") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCadastroManualOpen(true)}
              >
                <FilePenLine className="h-3.5 w-3.5 mr-1.5" />
                Cadastrar Valores
              </Button>
            )}

            {!isXml && !isHopHup && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-indigo-200 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100"
                onClick={() => setImportarBancoOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Importar CSV / XLSX / ZIP
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
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", query.isFetching && "animate-spin")} />
              Atualizar
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleExportExcel}
              disabled={!data}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Excel
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

        {/* QUADRO EXECUTIVO POWER BI (WHITE-LABEL POR CLIENTE) */}
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
            {/* Marca do Cliente + Título + Seletor de Abas */}
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
                {config.logoUrl ? (
                  <img
                    src={config.logoUrl}
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
                        <p className="text-[10px] font-medium opacity-65 group-hover:underline" style={{ color: palette.headerSubtext }}>
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
                  {config.tituloRelatorio}
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

                  {/* Seletor rápido de abas quando o cliente possui mais de 1 aba */}
                  {abasHabilitadas.length > 1 && (
                    <nav className="ml-1 sm:ml-3 inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-900/10 p-1 backdrop-blur-xs">
                      {abasHabilitadas.map((aba) => {
                        const selecionada = aba.id === abaMetaAtual.id;
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
                            {aba.indice} · {aba.nome}
                          </button>
                        );
                      })}
                    </nav>
                  )}
                </div>
              </div>
            </div>

            {/* Slicers (Segmentações de Dados) Estilo Power BI */}
            <div className="flex flex-wrap items-center gap-2.5">
              {config.filtrosVisiveis.includes("setor") && (
                <BiSlicerDropdown
                  titulo={labelPainelSetor.coluna.toUpperCase()}
                  opcoes={data?.filtrosDisponiveis.setores || []}
                  selecionados={setoresSel}
                  onChange={setSetoresSel}
                  palette={palette}
                />
              )}
              {config.filtrosVisiveis.includes("competencia") && (
                <BiSlicerDropdown
                  titulo="COMPETÊNCIA"
                  opcoes={data?.filtrosDisponiveis.competencias || []}
                  selecionados={competenciasSel}
                  onChange={setCompetenciasSel}
                  palette={palette}
                />
              )}
              {config.filtrosVisiveis.includes("convenio") && (
                <BiSlicerDropdown
                  titulo="CONVÊNIO"
                  opcoes={data?.filtrosDisponiveis.convenios || []}
                  selecionados={conveniosSel}
                  onChange={setConveniosSel}
                  palette={palette}
                />
              )}
              {telaCheia && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={toggleTelaCheia}
                  title="Sair da Tela Cheia"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </header>

          {/* CORPO PRINCIPAL DO DASHBOARD */}
          <main className="flex-1 p-3.5 sm:p-5 space-y-4">
            {query.isLoading && !data ? (
              <div className="flex min-h-[52vh] flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="h-9 w-9 animate-spin opacity-80" />
                <p className="text-sm font-medium opacity-80">
                  Consolidando indicadores executivos de {nomeExibidoCliente}...
                </p>
              </div>
            ) : query.isError ? (
              <div className="mx-auto my-12 max-w-lg rounded-2xl border border-rose-400/40 bg-rose-950/60 p-6 text-center text-white">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-rose-300" />
                <p className="font-bold">Não foi possível carregar os dados do BI</p>
                <p className="mt-1 text-xs text-rose-200">{query.error.message}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => query.refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : data ? (
              <>
                {/* ========================================================= */}
                {/* PÁGINA 01: VISÃO GERAL (IDÊNTICA AO MODELO POWER BI)       */}
                {/* ========================================================= */}
                {abaMetaAtual.id === "visao_geral" && (
                  <>
                    {/* FAIXA DE CARTÕES BIG NUMBERS */}
                    <section className={cn("grid gap-3", gridKpiColsClass)}>
                      {config.kpisVisiveis.map((kpiId) => {
                        const meta = BI_KPI_CATALOG.find((k) => k.id === kpiId);
                        if (!meta) return null;
                        return (
                          <div
                            key={kpiId}
                            className="rounded-xl px-4 py-3.5 text-center shadow-md transition-transform hover:-translate-y-0.5"
                            style={{ backgroundColor: palette.kpiCardBg }}
                          >
                            <p
                              className="text-xl sm:text-2xl 2xl:text-[27px] font-extrabold tracking-tight tabular-nums truncate"
                              style={{ color: palette.kpiValueColor }}
                              title={obterValorKpi(kpiId)}
                            >
                              {obterValorKpi(kpiId)}
                            </p>
                            <p
                              className="mt-1 text-xs font-bold tracking-wide"
                              style={{ color: palette.kpiLabelColor }}
                            >
                              {meta.label}
                            </p>
                          </div>
                        );
                      })}
                    </section>

                    {/* LINHA CENTRAL: COMPETÊNCIA + SETORES */}
                    {(config.blocosVisaoGeral.competencia || config.blocosVisaoGeral.setores) && (
                      <div
                        className={cn(
                          "grid gap-4",
                          config.blocosVisaoGeral.competencia && config.blocosVisaoGeral.setores
                            ? "grid-cols-1 xl:grid-cols-2"
                            : "grid-cols-1",
                        )}
                      >
                        {config.blocosVisaoGeral.competencia && (
                          <BiMatrixTable
                            titulo="COMPETÊNCIA"
                            colunaDimensaoLabel={
                              isXml && criterioXmlAtivo === "PAGAMENTO"
                                ? "Mês Pgto."
                                : "Comp. Fat."
                            }
                            linhas={data.porCompetencia}
                            palette={palette}
                            mostrarDataBars={config.mostrarDataBars}
                            formulaPctGlosa={config.formulaPctGlosa}
                            defaultSortField="label"
                            defaultSortDir="asc"
                            chavesSelecionadas={competenciasSel}
                            onToggleChave={(chave) =>
                              toggleValorCrossFilter(competenciasSel, setCompetenciasSel, chave)
                            }
                            onLimparSelecao={() => setCompetenciasSel([])}
                            casasPercentual={2}
                          />
                        )}

                        {config.blocosVisaoGeral.setores && (
                          <BiMatrixTable
                            titulo={labelPainelSetor.titulo}
                            colunaDimensaoLabel={labelPainelSetor.coluna}
                            linhas={data.porSetor}
                            palette={palette}
                            mostrarDataBars={false}
                            formulaPctGlosa={config.formulaPctGlosa}
                            defaultSortField="faturado"
                            defaultSortDir="desc"
                            chavesSelecionadas={setoresSel}
                            onToggleChave={(chave) =>
                              toggleValorCrossFilter(setoresSel, setSetoresSel, chave)
                            }
                            onLimparSelecao={() => setSetoresSel([])}
                            casasPercentual={1}
                            headerRightSlot={
                              <div className="inline-flex rounded-md bg-black/20 p-0.5 text-[10px]">
                                {(
                                  [
                                    { id: "setor", label: "Setor" },
                                    { id: "tipo_item", label: "Grupo" },
                                    { id: "prestador", label: "Prestador" },
                                  ] as const
                                ).map((opt) => {
                                  const ativo = dimensaoSetorEfetiva === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => {
                                        setSetoresSel([]);
                                        setDimensaoSetorOverride(opt.id);
                                      }}
                                      className={cn(
                                        "rounded px-2 py-0.5 font-semibold transition-colors",
                                        ativo
                                          ? "bg-white text-slate-900"
                                          : "text-white/75 hover:text-white",
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            }
                          />
                        )}
                      </div>
                    )}

                    {/* LINHA INFERIOR: CONVÊNIOS + GRÁFICO EVOLUÇÃO MENSAL */}
                    {(config.blocosVisaoGeral.convenios ||
                      config.blocosVisaoGeral.evolucaoMensal) && (
                      <div
                        className={cn(
                          "grid gap-4",
                          config.blocosVisaoGeral.convenios &&
                            config.blocosVisaoGeral.evolucaoMensal
                            ? "grid-cols-1 xl:grid-cols-2"
                            : "grid-cols-1",
                        )}
                      >
                        {config.blocosVisaoGeral.convenios && (
                          <BiMatrixTable
                            titulo="CONVÊNIOS"
                            colunaDimensaoLabel="Convênio"
                            linhas={data.porConvenio}
                            palette={palette}
                            mostrarDataBars={false}
                            formulaPctGlosa={config.formulaPctGlosa}
                            defaultSortField="faturado"
                            defaultSortDir="desc"
                            chavesSelecionadas={conveniosSel}
                            onToggleChave={(chave) =>
                              toggleValorCrossFilter(conveniosSel, setConveniosSel, chave)
                            }
                            onLimparSelecao={() => setConveniosSel([])}
                            casasPercentual={1}
                          />
                        )}

                        {config.blocosVisaoGeral.evolucaoMensal && (
                          <BiEvolucaoComboChart
                            dados={data.porCompetencia}
                            palette={palette}
                            mostrarSerieProduzido={config.mostrarSerieProduzido}
                            competenciasSelecionadas={competenciasSel}
                            onToggleCompetencia={(comp) =>
                              toggleValorCrossFilter(competenciasSel, setCompetenciasSel, comp)
                            }
                          />
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ========================================================= */}
                {/* PÁGINA 02: GLOSAS & RECURSOS                              */}
                {/* ========================================================= */}
                {abaMetaAtual.id === "glosas" && (
                  <>
                    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      {[
                        { label: "Faturado", val: fmtMoeda(data.resumo.faturado) },
                        { label: "Glosa Total", val: fmtMoeda(data.resumo.glosa) },
                        { label: "% Glosa", val: fmtPct(data.resumo.pctGlosa) },
                        { label: "A Recursar", val: fmtMoeda(data.resumo.glosaARecursar) },
                        { label: "Em Recurso", val: fmtMoeda(data.resumo.glosaEmRecurso) },
                        { label: "Glosa Recuperada", val: fmtMoeda(data.resumo.glosaRecuperada) },
                      ].map((k) => (
                        <div
                          key={k.label}
                          className="rounded-xl px-3.5 py-3 text-center shadow-md"
                          style={{ backgroundColor: palette.kpiCardBg }}
                        >
                          <p
                            className="text-lg sm:text-xl font-extrabold tabular-nums truncate"
                            style={{ color: palette.kpiValueColor }}
                          >
                            {k.val}
                          </p>
                          <p
                            className="mt-1 text-[11px] font-bold"
                            style={{ color: palette.kpiLabelColor }}
                          >
                            {k.label}
                          </p>
                        </div>
                      ))}
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Matriz Pareto de Motivos de Glosa */}
                      <section
                        className="rounded-2xl p-3.5 shadow-lg flex flex-col"
                        style={{
                          background: palette.panelBg,
                          border: `1px solid ${palette.panelBorder}`,
                        }}
                      >
                        <h3
                          className="text-xs font-extrabold uppercase tracking-[0.08em] mb-2.5"
                          style={{ color: palette.panelTitleColor }}
                        >
                          PARETO DE MOTIVOS DE GLOSA
                        </h3>
                        <div className="max-h-[300px] overflow-auto rounded-lg border border-slate-300/60 bg-white">
                          <table className="w-full border-collapse text-[11.5px] leading-tight">
                            <thead
                              className="sticky top-0 z-20"
                              style={{
                                background: palette.tableHeaderBg,
                                color: palette.tableHeaderText,
                              }}
                            >
                              <tr>
                                <th className="px-2.5 py-2 text-left font-bold">Cód.</th>
                                <th className="px-2.5 py-2 text-left font-bold">Motivo TISS / Operadora</th>
                                <th className="px-2 py-2 text-right font-bold">Glosa</th>
                                <th className="px-2 py-2 text-right font-bold">% Part.</th>
                                <th className="px-2 py-2 text-right font-bold">Qtd</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/80">
                              {data.porMotivoGlosa.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                                    Nenhuma glosa identificada no recorte selecionado.
                                  </td>
                                </tr>
                              ) : (
                                (() => {
                                  const maxGlosa = Math.max(
                                    ...data.porMotivoGlosa.map((m) => m.glosa),
                                    1,
                                  );
                                  return data.porMotivoGlosa.map((m, idx) => {
                                    const barW = Math.max(3, Math.min(92, (m.glosa / maxGlosa) * 92));
                                    return (
                                      <tr
                                        key={`${m.codigo}-${idx}`}
                                        className={idx % 2 === 0 ? "bg-white" : "bg-[#f5f8fa]"}
                                      >
                                        <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-700 border-r border-slate-200/80">
                                          {m.codigo}
                                        </td>
                                        <td
                                          className="px-2.5 py-1.5 text-slate-900 max-w-[260px] truncate border-r border-slate-200/80"
                                          title={m.motivo}
                                        >
                                          {m.motivo}
                                        </td>
                                        <td className="relative px-2 py-1.5 text-right tabular-nums border-r border-slate-200/80 whitespace-nowrap">
                                          {config.mostrarDataBars && (
                                            <div
                                              className="pointer-events-none absolute left-1 top-[3px] bottom-[3px] rounded-[2px]"
                                              style={{
                                                width: `${barW}%`,
                                                backgroundColor: palette.dataBarGlosa,
                                                opacity: 0.72,
                                              }}
                                            />
                                          )}
                                          <span className="relative z-10 font-semibold text-slate-800">
                                            {fmtMoeda(m.glosa)}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-700 border-r border-slate-200/80">
                                          {fmtPct(m.pctParticipacao)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                                          {fmtInt(m.quantidade)}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Matriz Convênios ordenada por Glosa */}
                      <BiMatrixTable
                        titulo="RANKING DE GLOSA POR CONVÊNIO"
                        colunaDimensaoLabel="Convênio"
                        linhas={data.porConvenio}
                        palette={palette}
                        mostrarDataBars={config.mostrarDataBars}
                        formulaPctGlosa={config.formulaPctGlosa}
                        defaultSortField="glosa"
                        defaultSortDir="desc"
                        chavesSelecionadas={conveniosSel}
                        onToggleChave={(chave) =>
                          toggleValorCrossFilter(conveniosSel, setConveniosSel, chave)
                        }
                        onLimparSelecao={() => setConveniosSel([])}
                      />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Itens Mais Glosados */}
                      <section
                        className="rounded-2xl p-3.5 shadow-lg flex flex-col"
                        style={{
                          background: palette.panelBg,
                          border: `1px solid ${palette.panelBorder}`,
                        }}
                      >
                        <h3
                          className="text-xs font-extrabold uppercase tracking-[0.08em] mb-2.5"
                          style={{ color: palette.panelTitleColor }}
                        >
                          ITENS E PROCEDIMENTOS MAIS GLOSADOS
                        </h3>
                        <div className="max-h-[290px] overflow-auto rounded-lg border border-slate-300/60 bg-white">
                          <table className="w-full border-collapse text-[11.5px] leading-tight">
                            <thead
                              className="sticky top-0 z-20"
                              style={{
                                background: palette.tableHeaderBg,
                                color: palette.tableHeaderText,
                              }}
                            >
                              <tr>
                                <th className="px-2.5 py-2 text-left font-bold">Código</th>
                                <th className="px-2.5 py-2 text-left font-bold">Procedimento / Item</th>
                                <th className="px-2 py-2 text-right font-bold">Glosa</th>
                                <th className="px-2 py-2 text-right font-bold">% Glosa</th>
                                <th className="px-2 py-2 text-right font-bold">Qtd</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/80">
                              {data.porProcedimentoGlosado.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                                    Sem itens glosados no período selecionado.
                                  </td>
                                </tr>
                              ) : (
                                data.porProcedimentoGlosado.map((it, idx) => (
                                  <tr
                                    key={`${it.codigo}-${idx}`}
                                    className={idx % 2 === 0 ? "bg-white" : "bg-[#f5f8fa]"}
                                  >
                                    <td className="px-2.5 py-1.5 font-mono text-slate-700 border-r border-slate-200/80">
                                      {it.codigo}
                                    </td>
                                    <td
                                      className="px-2.5 py-1.5 font-medium text-slate-900 max-w-[260px] truncate border-r border-slate-200/80"
                                      title={it.descricao}
                                    >
                                      {it.descricao}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-rose-700 border-r border-slate-200/80 whitespace-nowrap">
                                      {fmtMoeda(it.glosa)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800 border-r border-slate-200/80">
                                      {fmtPct(it.pctGlosa)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                                      {fmtInt(it.quantidade)}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Evolução Mensal de Glosas */}
                      <section
                        className="rounded-2xl p-3.5 shadow-lg flex flex-col justify-between min-h-[320px]"
                        style={{
                          background: palette.panelBg,
                          border: `1px solid ${palette.panelBorder}`,
                        }}
                      >
                        <h3
                          className="text-xs font-extrabold uppercase tracking-[0.08em] mb-2"
                          style={{ color: palette.panelTitleColor }}
                        >
                          EVOLUÇÃO MENSAL DE GLOSAS (R$ vs % GLOSA)
                        </h3>
                        <div className="h-[270px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={data.porCompetencia.slice(-14)}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke={
                                  palette.isLightCanvas ? "#e2e8f0" : "rgba(255,255,255,0.08)"
                                }
                              />
                              <XAxis
                                dataKey="label"
                                tick={{
                                  fontSize: 10.5,
                                  fill: palette.isLightCanvas ? "#475569" : "#cbd5e1",
                                }}
                                tickLine={false}
                              />
                              <YAxis yAxisId="left" hide />
                              <YAxis yAxisId="right" orientation="right" hide />
                              <RechartsTooltip
                                formatter={(val: any, name: string) =>
                                  name === "% Glosa" ? fmtPct(Number(val)) : fmtMoeda(Number(val))
                                }
                              />
                              <Bar
                                yAxisId="left"
                                dataKey="glosa"
                                name="Glosa"
                                fill="#f43f5e"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={38}
                              />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="pctGlosa"
                                name="% Glosa"
                                stroke="#fbbf24"
                                strokeWidth={2.3}
                                dot={{ r: 3, fill: "#fbbf24" }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    </div>
                  </>
                )}

                {/* ========================================================= */}
                {/* PÁGINA 03: SETORES & PRODUÇÃO                             */}
                {/* ========================================================= */}
                {abaMetaAtual.id === "setores_producao" && (
                  <>
                    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                      {[
                        { label: "Faturado Total", val: fmtMoeda(data.resumo.faturado) },
                        { label: "Contas / Guias", val: fmtInt(data.resumo.qtdContas) },
                        {
                          label: "Ticket Médio / Conta",
                          val: fmtMoeda(
                            data.resumo.qtdContas > 0
                              ? data.resumo.faturado / data.resumo.qtdContas
                              : 0,
                          ),
                        },
                        { label: "Itens Lançados", val: fmtInt(data.resumo.qtdItens) },
                        { label: "VL. Recebido", val: fmtMoeda(data.resumo.recebido) },
                      ].map((k) => (
                        <div
                          key={k.label}
                          className="rounded-xl px-4 py-3.5 text-center shadow-md"
                          style={{ backgroundColor: palette.kpiCardBg }}
                        >
                          <p
                            className="text-xl sm:text-2xl font-extrabold tabular-nums truncate"
                            style={{ color: palette.kpiValueColor }}
                          >
                            {k.val}
                          </p>
                          <p
                            className="mt-1 text-xs font-bold"
                            style={{ color: palette.kpiLabelColor }}
                          >
                            {k.label}
                          </p>
                        </div>
                      ))}
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <BiMatrixTable
                        titulo={labelPainelSetor.titulo}
                        colunaDimensaoLabel={labelPainelSetor.coluna}
                        linhas={data.porSetor}
                        palette={palette}
                        mostrarDataBars={config.mostrarDataBars}
                        formulaPctGlosa={config.formulaPctGlosa}
                        defaultSortField="faturado"
                        defaultSortDir="desc"
                        chavesSelecionadas={setoresSel}
                        onToggleChave={(chave) =>
                          toggleValorCrossFilter(setoresSel, setSetoresSel, chave)
                        }
                        onLimparSelecao={() => setSetoresSel([])}
                        maxHeightClass="max-h-[340px]"
                      />

                      <BiMatrixTable
                        titulo="COMPOSIÇÃO POR GRUPO / TIPO DE ITEM"
                        colunaDimensaoLabel="Grupo / Tipo"
                        linhas={data.porTipoItem}
                        palette={palette}
                        mostrarDataBars={config.mostrarDataBars}
                        formulaPctGlosa={config.formulaPctGlosa}
                        defaultSortField="faturado"
                        defaultSortDir="desc"
                        maxHeightClass="max-h-[340px]"
                      />
                    </div>

                    {/* Top Procedimentos / Serviços Faturados */}
                    <section
                      className="rounded-2xl p-3.5 shadow-lg flex flex-col"
                      style={{
                        background: palette.panelBg,
                        border: `1px solid ${palette.panelBorder}`,
                      }}
                    >
                      <h3
                        className="text-xs font-extrabold uppercase tracking-[0.08em] mb-2.5"
                        style={{ color: palette.panelTitleColor }}
                      >
                        PRINCIPAIS PROCEDIMENTOS, DIÁRIAS E MATERIAIS FATURADOS
                      </h3>
                      <div className="max-h-[290px] overflow-auto rounded-lg border border-slate-300/60 bg-white">
                        <table className="w-full border-collapse text-[11.5px] leading-tight">
                          <thead
                            className="sticky top-0 z-20"
                            style={{
                              background: palette.tableHeaderBg,
                              color: palette.tableHeaderText,
                            }}
                          >
                            <tr>
                              <th className="px-2.5 py-2 text-left font-bold">Código</th>
                              <th className="px-2.5 py-2 text-left font-bold">Descrição do Item / Procedimento</th>
                              <th className="px-2.5 py-2 text-left font-bold">Grupo</th>
                              <th className="px-2 py-2 text-right font-bold">Qtd</th>
                              <th className="px-2 py-2 text-right font-bold">Faturado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/80">
                            {data.porProcedimento.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                                  Nenhum procedimento encontrado no recorte selecionado.
                                </td>
                              </tr>
                            ) : (
                              (() => {
                                const maxFat = Math.max(
                                  ...data.porProcedimento.map((p) => p.faturado),
                                  1,
                                );
                                return data.porProcedimento.map((p, idx) => {
                                  const barW = Math.max(3, Math.min(92, (p.faturado / maxFat) * 92));
                                  return (
                                    <tr
                                      key={`${p.codigo}-${idx}`}
                                      className={idx % 2 === 0 ? "bg-white" : "bg-[#f5f8fa]"}
                                    >
                                      <td className="px-2.5 py-1.5 font-mono text-slate-700 border-r border-slate-200/80">
                                        {p.codigo}
                                      </td>
                                      <td
                                        className="px-2.5 py-1.5 font-medium text-slate-900 max-w-[380px] truncate border-r border-slate-200/80"
                                        title={p.descricao}
                                      >
                                        {p.descricao}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-slate-600 border-r border-slate-200/80">
                                        {p.tipo}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 border-r border-slate-200/80">
                                        {fmtInt(p.quantidade)}
                                      </td>
                                      <td className="relative px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                                        {config.mostrarDataBars && (
                                          <div
                                            className="pointer-events-none absolute left-1 top-[3px] bottom-[3px] rounded-[2px]"
                                            style={{
                                              width: `${barW}%`,
                                              backgroundColor: palette.dataBarFaturado,
                                              opacity: 0.72,
                                            }}
                                          />
                                        )}
                                        <span className="relative z-10 font-bold text-slate-900">
                                          {fmtMoeda(p.faturado)}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
              </>
            ) : null}
          </main>

          {/* RODAPÉ INSTITUCIONAL ESTILO POWER BI SAFATLE */}
          <footer
            className="px-5 py-2.5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]"
            style={{
              background: palette.footerBg,
              color: palette.footerText,
            }}
          >
            <div className="flex items-center gap-2 font-semibold tracking-[0.12em] uppercase">
              <span
                className="h-2 w-2 rounded-full inline-block"
                style={{ backgroundColor: palette.accentColor }}
              />
              <span>{config.rodapeTexto}</span>
            </div>

            <div className="font-bold tracking-wider uppercase">
              ATUALIZADO EM: {formatarDataHoraRodape(data?.fonteAtiva.atualizadoEm)}
            </div>

            <div className="opacity-85 font-medium">
              Desenvolvido por Safatle Consultoria Hospitalar · www.safatle.com.br
            </div>
          </footer>
        </div>
      </div>

      {/* MODAIS DE APOIO E PERSONALIZAÇÃO */}
      {podePersonalizar && (
        <BiPersonalizacaoDialog
          open={personalizarOpen}
          onOpenChange={setPersonalizarOpen}
          estabelecimentoId={estabelecimentoId}
          estabelecimentoNome={estabelecimentoAtual.nome}
          configAtual={config}
          onSaved={() => {
            void query.refetch();
          }}
        />
      )}

      {isXml && temAcessoModulo("faturamentoExterno") && (
        <LancamentosManuaisDialog
          estabelecimentoId={estabelecimentoId}
          estabelecimentoNome={estabelecimentoAtual.nome}
          open={cadastroManualOpen}
          onOpenChange={setCadastroManualOpen}
        />
      )}

      {!isXml && !isHopHup && (
        <ImportarWarleineDialog
          estabelecimentoId={estabelecimentoId}
          estabelecimentoNome={estabelecimentoAtual.nome}
          open={importarBancoOpen}
          onOpenChange={setImportarBancoOpen}
          onImported={() => {
            void query.refetch();
          }}
        />
      )}
    </DashboardLayout>
  );
}
