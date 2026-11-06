import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  calcularAlertasPrazoContaFabrica,
  PRAZO_FATURAMENTO_SAFATLE_HORAS,
  PRAZO_VENCIMENTO_GUIA_DIAS,
} from "@/lib/fabricaPrazosAlertas";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Expand,
  Factory,
  Layers,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  Target,
  Timer,
  Tv,
  Users,
  X,
} from "lucide-react";

interface SetorConfigItem {
  id: string;
  numero: number;
  nome: string;
  curto: string;
  descricao: string;
  corBadge: string;
  corBorda: string;
  icon: any;
}

interface FabricaPainelTvModalProps {
  open: boolean;
  onClose: () => void;
  competencia: string;
  hospitalNomeFiltro: string;
  setoresVisiveis: SetorConfigItem[];
  resumoSetores: any;
  relatoriosData: any;
  contasEsteira: any[];
  onRefresh: () => void;
}

function formatCurrency(val: number | string | null | undefined) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!n || isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateStr(d: string | Date | null | undefined) {
  if (!d) return "-";
  const s = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) return String(d);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

type AbaTv = "visao_geral" | "convenios_contas" | "metas_equipe";

export default function FabricaPainelTvModal({
  open,
  onClose,
  competencia,
  hospitalNomeFiltro,
  setoresVisiveis,
  resumoSetores,
  relatoriosData,
  contasEsteira,
  onRefresh,
}: FabricaPainelTvModalProps) {
  const [abaTv, setAbaTv] = useState<AbaTv>("visao_geral");
  const [autoRotacao, setAutoRotacao] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [agora, setAgora] = useState<Date>(() => new Date());
  const [segundosParaAtualizar, setSegundosParaAtualizar] = useState<number>(30);

  // Relógio ao vivo + disparo de auto-refresh a cada 30s
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setAgora(new Date());
      setSegundosParaAtualizar((prev) => {
        if (prev <= 1) {
          onRefresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, onRefresh]);

  // Rotação automática de telas na TV a cada 20 segundos
  useEffect(() => {
    if (!open || !autoRotacao) return;
    const ORDEM_ABAS: AbaTv[] = ["visao_geral", "convenios_contas", "metas_equipe"];
    const rotacaoTimer = setInterval(() => {
      setAbaTv((atual) => {
        const idx = ORDEM_ABAS.indexOf(atual);
        return ORDEM_ABAS[(idx + 1) % ORDEM_ABAS.length];
      });
    }, 20000);
    return () => clearInterval(rotacaoTimer);
  }, [open, autoRotacao]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const alternarTelaCheia = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora caso o navegador bloqueie fullscreen sem gesto direto
    }
  };

  // Agrupamento de Convênios e suas Contas + Resumo de Alertas de Prazo
  const dadosConsolidadosTv = useMemo(() => {
    const mapaConvenios = new Map<
      string,
      {
        convenioNome: string;
        totalContas: number;
        valorTotal: number;
        emRecepcao: number;
        emFaturamento: number;
        emAuditoria: number;
        emLimpeza: number;
        enviadas: number;
        devolvidasErro: number;
        vencidas25d: number;
        estouradas60h: number;
        contasRecentes: any[];
      }
    >();

    let totalGuiasVencidas25d = 0;
    let totalSla60hEstourado = 0;
    let totalDevolvidasErro = 0;

    for (const conta of contasEsteira) {
      const alerta = calcularAlertasPrazoContaFabrica(conta, agora);
      if (alerta.guiaVencida25Dias) totalGuiasVencidas25d++;
      if (alerta.prazoFaturamento60hEstourado) totalSla60hEstourado++;
      if (conta.statusSetor === "devolvido_erro") totalDevolvidasErro++;

      const nomeConv = String(conta.convenioNome || "Não informado").trim();
      const valorConta =
        Number(conta.valorFaturadoFinal) || Number(conta.valorFaturadoInicial) || 0;

      if (!mapaConvenios.has(nomeConv)) {
        mapaConvenios.set(nomeConv, {
          convenioNome: nomeConv,
          totalContas: 0,
          valorTotal: 0,
          emRecepcao: 0,
          emFaturamento: 0,
          emAuditoria: 0,
          emLimpeza: 0,
          enviadas: 0,
          devolvidasErro: 0,
          vencidas25d: 0,
          estouradas60h: 0,
          contasRecentes: [],
        });
      }

      const item = mapaConvenios.get(nomeConv)!;
      item.totalContas += 1;
      item.valorTotal += valorConta;

      if (conta.setorAtual === "recepcao") item.emRecepcao += 1;
      else if (conta.setorAtual === "faturamento") item.emFaturamento += 1;
      else if (
        conta.setorAtual === "auditoria_interna" ||
        conta.setorAtual === "auditoria_externa"
      )
        item.emAuditoria += 1;
      else if (conta.setorAtual === "limpeza_prontuario") item.emLimpeza += 1;
      else item.enviadas += 1;

      if (conta.statusSetor === "devolvido_erro") item.devolvidasErro += 1;
      if (alerta.guiaVencida25Dias) item.vencidas25d += 1;
      if (alerta.prazoFaturamento60hEstourado) item.estouradas60h += 1;

      if (item.contasRecentes.length < 6) {
        item.contasRecentes.push({
          ...conta,
          alerta,
          valorConta,
        });
      }
    }

    const rankingConvenios = Array.from(mapaConvenios.values()).sort(
      (a, b) => b.totalContas - a.totalContas || b.valorTotal - a.valorTotal
    );

    // Cálculo consolidado de Metas do Mês
    const metasLista = relatoriosData?.metas || [];
    const metaTotalContas = metasLista.reduce(
      (acc: number, m: any) => acc + (Number(m.metaQuantidadeContas) || 0),
      0
    );
    const metaTotalValor = metasLista.reduce(
      (acc: number, m: any) => acc + (Number(m.metaValorFaturado) || 0),
      0
    );

    const realizadoContas =
      Number(relatoriosData?.resumoPeriodo?.totalFaturadas) ||
      contasEsteira.filter((c) => c.setorAtual !== "recepcao" && c.setorAtual !== "faturamento")
        .length;
    const realizadoValor =
      Number(relatoriosData?.resumoPeriodo?.valorTotalFaturado) ||
      Number(resumoSetores?.totalGeralValor) ||
      0;

    const percMetaContas =
      metaTotalContas > 0
        ? Math.min(100, Math.round((realizadoContas / metaTotalContas) * 100))
        : 0;
    const percMetaValor =
      metaTotalValor > 0
        ? Math.min(100, Math.round((realizadoValor / metaTotalValor) * 100))
        : 0;

    return {
      rankingConvenios,
      totalGuiasVencidas25d,
      totalSla60hEstourado,
      totalDevolvidasErro,
      metaTotalContas,
      metaTotalValor,
      realizadoContas,
      realizadoValor,
      percMetaContas,
      percMetaValor,
    };
  }, [contasEsteira, relatoriosData, resumoSetores, agora]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-50 flex flex-col overflow-y-auto">
      {/* BARRA SUPERIOR DA TV */}
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Tv className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-tight text-white">
                PAINEL TV • GESTÃO À VISTA SAFATLE
              </h1>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse text-xs">
                AO VIVO • Atualiza em {segundosParaAtualizar}s
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Competência: <strong className="text-slate-200">{competencia}</strong> • Escopo:{" "}
              <strong className="text-slate-200">{hospitalNomeFiltro}</strong> •{" "}
              {agora.toLocaleDateString("pt-BR")}{" "}
              {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Seletor de Telas e Controles do Modo TV */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-1 gap-1">
            <button
              type="button"
              onClick={() => setAbaTv("visao_geral")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                abaTv === "visao_geral"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              1. Setores, Metas & Convênios
            </button>
            <button
              type="button"
              onClick={() => setAbaTv("convenios_contas")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                abaTv === "convenios_contas"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              2. Detalhamento Convênios & Contas ({dadosConsolidadosTv.rankingConvenios.length})
            </button>
            <button
              type="button"
              onClick={() => setAbaTv("metas_equipe")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                abaTv === "metas_equipe"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              3. Metas & Produção Equipe
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoRotacao((v) => !v)}
            className="h-8 gap-1.5 bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
            title="Alterna automaticamente entre as 3 visões a cada 20 segundos"
          >
            {autoRotacao ? <Pause className="h-3.5 w-3.5 text-amber-400" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
            {autoRotacao ? "Rotação Auto (20s)" : "Rotação Pausada"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onRefresh();
              setSegundosParaAtualizar(30);
            }}
            className="h-8 gap-1.5 bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={alternarTelaCheia}
            className="h-8 gap-1.5 bg-blue-950/60 border-blue-700 text-blue-200 hover:bg-blue-900/60 text-xs"
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            {isFullscreen ? "Sair Tela Cheia" : "Tela Cheia (F11)"}
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              onClose();
            }}
            className="h-8 gap-1 text-xs"
          >
            <X className="h-4 w-4" />
            Fechar TV
          </Button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL DO PAINEL TV */}
      <main className="flex-1 p-6 space-y-6">
        {/* FAIXA DE KPIs GLOBAIS E ALERTAS DE SLA */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>TOTAL NA ESTEIRA</span>
              <Factory className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-3xl font-black text-white mt-1">
              {resumoSetores?.totalGeralContas || contasEsteira.length}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {formatCurrency(resumoSetores?.totalGeralValor)} em processamento
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-blue-900/60 p-4">
            <div className="text-xs font-medium text-blue-300 flex items-center justify-between">
              <span>FATURADAS NO MÊS</span>
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-3xl font-black text-blue-400 mt-1">
              {dadosConsolidadosTv.realizadoContas}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Volume: {formatCurrency(dadosConsolidadosTv.realizadoValor)}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-emerald-900/60 p-4">
            <div className="text-xs font-medium text-emerald-300 flex items-center justify-between">
              <span>META DE CONTAS</span>
              <Target className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-emerald-400">
                {dadosConsolidadosTv.metaTotalContas > 0
                  ? `${dadosConsolidadosTv.percMetaContas}%`
                  : `${dadosConsolidadosTv.realizadoContas}`}
              </span>
              {dadosConsolidadosTv.metaTotalContas > 0 && (
                <span className="text-xs text-slate-400">
                  ({dadosConsolidadosTv.realizadoContas}/{dadosConsolidadosTv.metaTotalContas})
                </span>
              )}
            </div>
            <Progress value={dadosConsolidadosTv.percMetaContas} className="h-2 mt-2 bg-slate-800" />
          </div>

          <div
            className={`rounded-xl border p-4 ${
              dadosConsolidadosTv.totalGuiasVencidas25d > 0
                ? "bg-red-950/50 border-red-700"
                : "bg-slate-900 border-blue-800/60"
            }`}
          >
            <div className="text-xs font-semibold text-blue-300 flex items-center justify-between">
              <span>VENC. GUIA (&gt;{PRAZO_VENCIMENTO_GUIA_DIAS}d ALTA)</span>
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <div
              className={`text-3xl font-black mt-1 ${
                dadosConsolidadosTv.totalGuiasVencidas25d > 0 ? "text-red-400" : "text-blue-400"
              }`}
            >
              {dadosConsolidadosTv.totalGuiasVencidas25d}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Guias acima de {PRAZO_VENCIMENTO_GUIA_DIAS} dias sem entregar
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              dadosConsolidadosTv.totalSla60hEstourado > 0
                ? "bg-red-950/50 border-red-700"
                : "bg-slate-900 border-slate-800"
            }`}
          >
            <div className="text-xs font-semibold text-amber-300 flex items-center justify-between">
              <span>SLA FATURAMENTO (&gt;{PRAZO_FATURAMENTO_SAFATLE_HORAS}h)</span>
              <Timer className="h-4 w-4 text-amber-400" />
            </div>
            <div
              className={`text-3xl font-black mt-1 ${
                dadosConsolidadosTv.totalSla60hEstourado > 0 ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {dadosConsolidadosTv.totalSla60hEstourado}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Acima de {PRAZO_FATURAMENTO_SAFATLE_HORAS}h desde chegada Safatle
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              dadosConsolidadosTv.totalDevolvidasErro > 0
                ? "bg-red-950/50 border-red-700"
                : "bg-slate-900 border-slate-800"
            }`}
          >
            <div className="text-xs font-semibold text-red-300 flex items-center justify-between">
              <span>DEVOLVIDAS C/ ERRO</span>
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div
              className={`text-3xl font-black mt-1 ${
                dadosConsolidadosTv.totalDevolvidasErro > 0 ? "text-red-400" : "text-slate-200"
              }`}
            >
              {dadosConsolidadosTv.totalDevolvidasErro}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Contas em retrabalho no setor
            </div>
          </div>
        </div>

        {/* =====================================================================
            TELA 1: VISÃO GERAL UNIFICADA (6 SETORES + METAS + CONVÊNIOS)
           ===================================================================== */}
        {abaTv === "visao_geral" && (
          <div className="space-y-6">
            {/* 1. QUANTIDADE DE CONTAS NOS 6 SETORES */}
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                Quantidade de Contas por Setor da Esteira
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {setoresVisiveis.map((setor) => {
                  const dados = resumoSetores?.porSetor?.[setor.id] || {
                    totalContas: 0,
                    devolvidasErro: 0,
                    emAndamento: 0,
                    emFila: 0,
                    valorTotal: 0,
                    mediaHorasNoSetor: 0,
                  };
                  const Icon = setor.icon;
                  return (
                    <div
                      key={setor.id}
                      className={`rounded-xl bg-slate-900 border border-slate-800 border-t-4 ${setor.corBorda} p-4 flex flex-col justify-between space-y-3`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                          <span>SETOR {setor.numero}</span>
                          <Icon className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="text-base font-bold text-white mt-0.5">{setor.curto}</div>
                      </div>

                      <div>
                        <div className="text-4xl font-black text-white">{dados.totalContas}</div>
                        <div className="text-xs font-medium text-emerald-400 mt-0.5">
                          {formatCurrency(dados.valorTotal)}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-300">
                          <span>Na Fila: <strong>{dados.emFila}</strong></span>
                          <span>Em Curso: <strong className="text-blue-400">{dados.emAndamento}</strong></span>
                        </div>
                        {dados.devolvidasErro > 0 && (
                          <div className="rounded bg-red-950/80 border border-red-700/80 text-red-300 px-2 py-0.5 text-center font-semibold text-[11px]">
                            ⚠ {dados.devolvidasErro} devolvida(s) c/ erro
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. GRID INFERIOR: METAS DE FATURAMENTO (ESQUERDA) + CONVÊNIOS E SUAS CONTAS (DIREITA) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COLUNA ESQUERDA (5 cols): METAS DE FATURAMENTO */}
              <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Target className="h-4 w-4 text-emerald-400" />
                    Metas de Faturamento ({competencia})
                  </h2>
                  <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
                    {(relatoriosData?.metas || []).length} meta(s) ativa(s)
                  </Badge>
                </div>

                {(relatoriosData?.metas || []).length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center space-y-2">
                    <p className="text-sm text-slate-300 font-medium">
                      Resumo de Produção da Competência {competencia}
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                        <div className="text-xs text-slate-400">Contas Faturadas</div>
                        <div className="text-2xl font-bold text-blue-400">
                          {dadosConsolidadosTv.realizadoContas}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                        <div className="text-xs text-slate-400">Valor Faturado</div>
                        <div className="text-xl font-bold text-emerald-400">
                          {formatCurrency(dadosConsolidadosTv.realizadoValor)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {relatoriosData.metas.map((m: any) => {
                      const prodUser = m.usuarioId
                        ? (relatoriosData.producaoPorFuncionario || []).find(
                            (p: any) => p.usuarioId === m.usuarioId
                          )
                        : null;
                      const qtdRealizada = prodUser
                        ? prodUser.contasFaturadas || prodUser.totalContasMovimentadas
                        : relatoriosData?.resumoPeriodo?.totalFaturadas || 0;
                      const valorRealizado = prodUser
                        ? prodUser.valorFaturado
                        : relatoriosData?.resumoPeriodo?.valorTotalFaturado || 0;

                      const percQtd =
                        m.metaQuantidadeContas > 0
                          ? Math.min(100, Math.round((qtdRealizada / m.metaQuantidadeContas) * 100))
                          : 0;
                      const percValor =
                        m.metaValorFaturado > 0
                          ? Math.min(100, Math.round((valorRealizado / m.metaValorFaturado) * 100))
                          : 0;

                      return (
                        <div
                          key={m.id}
                          className="rounded-lg bg-slate-950/80 border border-slate-800 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-sm text-white">{m.usuarioNome}</div>
                              <div className="text-xs text-slate-400">
                                Setor: {String(m.setor).toUpperCase()} • {m.hospitalNome}
                              </div>
                            </div>
                            <Badge
                              className={
                                percQtd >= 100
                                  ? "bg-emerald-600 text-white"
                                  : percQtd >= 70
                                    ? "bg-blue-600 text-white"
                                    : "bg-amber-600 text-white"
                              }
                            >
                              {percQtd}% da Meta
                            </Badge>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-300">
                              <span>
                                Quantidade: <strong>{qtdRealizada}</strong> / {m.metaQuantidadeContas} contas
                              </span>
                              <span className="font-bold text-blue-400">{percQtd}%</span>
                            </div>
                            <Progress value={percQtd} className="h-2.5 bg-slate-800" />
                          </div>

                          {m.metaValorFaturado > 0 && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-300">
                                <span>
                                  Financeiro: <strong>{formatCurrency(valorRealizado)}</strong> /{" "}
                                  {formatCurrency(m.metaValorFaturado)}
                                </span>
                                <span className="font-bold text-emerald-400">{percValor}%</span>
                              </div>
                              <Progress value={percValor} className="h-2 bg-slate-800" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA (7 cols): CONVÊNIOS E SUAS CONTAS */}
              <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    Convênios e suas Contas na Esteira ({dadosConsolidadosTv.rankingConvenios.length})
                  </h2>
                  <span className="text-xs text-slate-400">
                    Distribuição por setor e alertas de prazo
                  </span>
                </div>

                {dadosConsolidadosTv.rankingConvenios.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    Nenhuma conta ativa nos setores para exibir por convênio.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[380px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                          <th className="py-2 pr-3">Convênio</th>
                          <th className="py-2 px-2 text-center">Total Contas</th>
                          <th className="py-2 px-2 text-right">Valor (R$)</th>
                          <th className="py-2 px-2 text-center text-blue-300">Faturamento</th>
                          <th className="py-2 px-2 text-center text-amber-300">Auditoria</th>
                          <th className="py-2 px-2 text-center text-cyan-300">Limpeza</th>
                          <th className="py-2 px-2 text-center text-emerald-300">Enviadas</th>
                          <th className="py-2 pl-2 text-center text-red-400">Alertas SLA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {dadosConsolidadosTv.rankingConvenios.map((conv) => {
                          const totalAlertas =
                            conv.vencidas25d + conv.estouradas60h + conv.devolvidasErro;
                          return (
                            <tr
                              key={conv.convenioNome}
                              className={
                                totalAlertas > 0
                                  ? "bg-red-950/25 hover:bg-red-950/40"
                                  : "hover:bg-slate-800/50"
                              }
                            >
                              <td className="py-2.5 pr-3 font-bold text-white">
                                {conv.convenioNome}
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <Badge className="bg-slate-800 text-white font-bold">
                                  {conv.totalContas}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-emerald-400">
                                {formatCurrency(conv.valorTotal)}
                              </td>
                              <td className="py-2.5 px-2 text-center font-bold text-blue-400">
                                {conv.emFaturamento + conv.emRecepcao}
                              </td>
                              <td className="py-2.5 px-2 text-center font-semibold text-amber-300">
                                {conv.emAuditoria}
                              </td>
                              <td className="py-2.5 px-2 text-center font-semibold text-cyan-300">
                                {conv.emLimpeza}
                              </td>
                              <td className="py-2.5 px-2 text-center font-semibold text-emerald-400">
                                {conv.enviadas}
                              </td>
                              <td className="py-2.5 pl-2 text-center">
                                {totalAlertas > 0 ? (
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {conv.vencidas25d > 0 && (
                                      <Badge variant="destructive" className="text-[10px]">
                                        {conv.vencidas25d} &gt;25d
                                      </Badge>
                                    )}
                                    {conv.estouradas60h > 0 && (
                                      <Badge variant="destructive" className="text-[10px]">
                                        {conv.estouradas60h} &gt;60h
                                      </Badge>
                                    )}
                                    {conv.devolvidasErro > 0 && (
                                      <Badge variant="destructive" className="text-[10px]">
                                        {conv.devolvidasErro} erro
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-emerald-400 font-medium">No prazo</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TELA 2: DETALHAMENTO DE CONVÊNIOS E SUAS CONTAS
           ===================================================================== */}
        {abaTv === "convenios_contas" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              Visão Detalhada por Convênio e Contas na Esteira
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dadosConsolidadosTv.rankingConvenios.map((conv) => (
                <div
                  key={conv.convenioNome}
                  className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <div className="font-extrabold text-base text-white">{conv.convenioNome}</div>
                      <div className="text-xs text-emerald-400 font-semibold">
                        {formatCurrency(conv.valorTotal)}
                      </div>
                    </div>
                    <Badge className="bg-blue-600 text-white text-sm px-2.5 py-0.5">
                      {conv.totalContas} conta(s)
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                    <div className="rounded bg-slate-950 p-1.5 border border-slate-800">
                      <div className="text-slate-400">Faturam.</div>
                      <div className="font-bold text-blue-400 text-sm">
                        {conv.emFaturamento + conv.emRecepcao}
                      </div>
                    </div>
                    <div className="rounded bg-slate-950 p-1.5 border border-slate-800">
                      <div className="text-slate-400">Auditoria</div>
                      <div className="font-bold text-amber-400 text-sm">{conv.emAuditoria}</div>
                    </div>
                    <div className="rounded bg-slate-950 p-1.5 border border-slate-800">
                      <div className="text-slate-400">Limpeza</div>
                      <div className="font-bold text-cyan-400 text-sm">{conv.emLimpeza}</div>
                    </div>
                    <div className="rounded bg-slate-950 p-1.5 border border-slate-800">
                      <div className="text-slate-400">Enviadas</div>
                      <div className="font-bold text-emerald-400 text-sm">{conv.enviadas}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {conv.contasRecentes.map((c: any) => (
                      <div
                        key={c.id}
                        className={`rounded-lg px-2.5 py-1.5 text-xs border flex items-center justify-between gap-2 ${
                          c.alerta.deveDestacarLinhaComoErro
                            ? "bg-red-950/60 border-red-700/80 text-red-100"
                            : "bg-slate-950/70 border-slate-800 text-slate-200"
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-semibold truncate">{c.nomePaciente}</div>
                          <div className="text-[10px] text-slate-400">
                            {c.numeroGuia ? `Guia #${c.numeroGuia}` : `Atend #${c.numeroAtendimento || c.id}`} •{" "}
                            Alta: {formatDateStr(c.dataAlta)}{" "}
                            {c.alerta.possuiDataAlta && (
                              <span className="text-blue-400 font-semibold">
                                (Venc: {c.alerta.dataVencimentoGuiaFormatada})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-emerald-400">
                            {formatCurrency(c.valorConta)}
                          </div>
                          <div className="text-[10px] text-slate-300">
                            {c.alerta.tempoParadoSetorFormatado}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            TELA 3: METAS E RANKING DE PRODUÇÃO DA EQUIPE
           ===================================================================== */}
        {abaTv === "metas_equipe" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                Ranking de Produção por Colaborador ({competencia})
              </h2>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                    <th className="py-2">Colaborador</th>
                    <th className="py-2 text-center">Recep.</th>
                    <th className="py-2 text-center text-blue-300">Faturadas</th>
                    <th className="py-2 text-right text-emerald-300">Valor Faturado</th>
                    <th className="py-2 text-center">Auditadas</th>
                    <th className="py-2 text-center">Enviadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(relatoriosData?.producaoPorFuncionario || []).map((p: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-2.5 font-bold text-white">{p.usuarioNome}</td>
                      <td className="py-2.5 text-center text-slate-300">{p.contasRecepcionadas}</td>
                      <td className="py-2.5 text-center font-bold text-blue-400">
                        {p.contasFaturadas}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-emerald-400">
                        {formatCurrency(p.valorFaturado)}
                      </td>
                      <td className="py-2.5 text-center text-amber-300">
                        {(p.contasAuditadasInterna || 0) + (p.contasAuditadasExterna || 0)}
                      </td>
                      <td className="py-2.5 text-center text-purple-300">
                        {p.contasLimpasEnviadas}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-400" />
                SLA e Entregas por Hospital ({competencia})
              </h2>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                    <th className="py-2">Hospital</th>
                    <th className="py-2 text-center">Total Contas</th>
                    <th className="py-2 text-center text-emerald-300">Entregues</th>
                    <th className="py-2 text-center text-amber-300">Em Aberto</th>
                    <th className="py-2 text-center">Alta → Safatle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(relatoriosData?.slaPorHospital || []).map((s: any) => (
                    <tr key={s.hospitalId} className="hover:bg-slate-800/40">
                      <td className="py-2.5 font-bold text-white">{s.hospitalNome}</td>
                      <td className="py-2.5 text-center font-semibold">{s.totalContas}</td>
                      <td className="py-2.5 text-center font-bold text-emerald-400">
                        {s.contasEntregues}
                      </td>
                      <td className="py-2.5 text-center font-bold text-amber-400">
                        {s.contasEmAberto}
                      </td>
                      <td className="py-2.5 text-center text-slate-300">
                        {s.mediaDiasAltaParaRecebimento}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
