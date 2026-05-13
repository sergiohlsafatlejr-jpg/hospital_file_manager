/**
 * AtendimentosUnificados — Página única que substitui 4 páginas separadas:
 *   - Atendimentos.tsx (2.053 linhas)
 *   - AtendimentosParadosUnificados.tsx (1.678 linhas)
 *   - AtendimentosSemProtocolo.tsx (1.799 linhas)
 *   - AtendimentosFaturar.tsx (493 linhas)
 *
 * Usa a tabela `atendimentos_unificados` com filtros dinâmicos por tabs
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useLocation } from "wouter";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { formatDateBR, safeParseDate } from "@/lib/dateUtils";

// UI
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, RefreshCw, Download, Timer, Bell, FileText,
} from "lucide-react";

// Componentes de Atendimentos
import {
  AtendimentosKPIs,
  AtendimentosFiltros,
  AtendimentosDistribuicao,
  AtendimentosTabela,
  NotificacaoModal,
  NotificacaoLoteModal,
  EmailSection,
  HistoricoNotificacoes,
} from "@/components/atendimentos";
import type { FiltrosState, Aggregations } from "@/components/atendimentos";

// Constantes e tipos
import {
  type AtendimentoUnificado,
  type NotificacaoLinha,
  type AtendimentoView,
  ATENDIMENTO_VIEWS,
  isTasyOrigem,
  getOrigemLabel,
  formatCurrency,
  PAGE_SIZE,
} from "@/lib/atendimentosConstants";
import { gerarPDFAtendimentos } from "@/lib/atendimentosPdfGenerator";

const FILTROS_INICIAIS: FiltrosState = {
  busca: "",
  tipo: "todos",
  origem: "all",
  protocolo: "all",
  etapa: "",
  convenio: "",
  servico: "",
  ano: "",
  mes: "",
};

export default function AtendimentosUnificados() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, navigate] = useLocation();

  // ===== Estado da Aba Ativa =====
  const [viewAtiva, setViewAtiva] = useState<string>("atendimentos");
  const [subView, setSubView] = useState<AtendimentoView>("todos");

  // ===== Filtros =====
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIAIS);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [sortColumn, setSortColumn] = useState("data_entrada");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // ===== Debounce de busca =====
  const [debouncedBusca, setDebouncedBusca] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBusca(filtros.busca), 400);
    return () => clearTimeout(timer);
  }, [filtros.busca]);

  // ===== Seleção múltipla =====
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // ===== Modais =====
  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<{ numatend: string; nomepac: string } | null>(null);
  const [notificacaoLinhas, setNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [observacao, setObservacao] = useState("");

  const [modalLoteAberto, setModalLoteAberto] = useState(false);
  const [loteNotificacaoLinhas, setLoteNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [loteObservacao, setLoteObservacao] = useState("");

  // ===== Email =====
  const [emailExpandido, setEmailExpandido] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [emailMensagem, setEmailMensagem] = useState("");

  // ===== Query principal — server-side pagination =====
  const queryInput = useMemo(() => ({
    estabelecimentoId: estabelecimentoAtual?.id,
    page: paginaAtual,
    pageSize: PAGE_SIZE,
    origemSistema: filtros.origem !== "all" ? filtros.origem : undefined,
    tipo: filtros.tipo !== "todos" ? filtros.tipo : undefined,
    convenio: filtros.convenio || undefined,
    etapa: filtros.etapa || undefined,
    protocolo: filtros.protocolo !== "all" ? filtros.protocolo : undefined,
    ano: filtros.ano || undefined,
    mes: filtros.mes || undefined,
    busca: debouncedBusca || undefined,
    descricao: filtros.servico || undefined,
    sortColumn,
    sortOrder,
  }), [
    estabelecimentoAtual?.id, paginaAtual, filtros, debouncedBusca, sortColumn, sortOrder,
  ]);

  const { data: paginatedResult, isLoading, refetch, isFetching } = trpc.atendimentos.listarPaginado.useQuery(queryInput);

  const atendimentos = paginatedResult?.items || [];
  const serverTotal = paginatedResult?.total || 0;
  const serverTotalPages = paginatedResult?.totalPages || 0;
  const aggregations = (paginatedResult?.aggregations || null) as Aggregations | null;

  // ===== Histórico de notificações =====
  const { data: historicoNotificacoes, refetch: refetchHistorico } = trpc.atendimentos.listarHistorico.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const salvarHistoricoMutation = trpc.atendimentos.salvarHistorico.useMutation({
    onSuccess: () => { refetchHistorico(); },
  });

  const notificacoesGeradas = useMemo(() => {
    if (!historicoNotificacoes) return [];
    return historicoNotificacoes.map((h: any) => ({
      id: `DB-${h.id}`,
      data: new Date(h.dataGeracao),
      qtdAtendimentos: h.qtdAtendimentos,
      atendimentos: (h.atendimentos as any[]) || [],
      notificacoes: (h.notificacoes as NotificacaoLinha[]) || [],
      observacao: h.observacao || "",
      usuario: h.usuario || "",
    }));
  }, [historicoNotificacoes]);

  // ===== Mutations =====
  const registrarNotificacao = trpc.atendimentos.registrarNotificacao.useMutation({
    onSuccess: () => {
      requestAnimationFrame(() => {
        toast.success("Notificação registrada com sucesso!");
        setModalAberto(false);
        setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
        setObservacao("");
        refetch();
      });
    },
    onError: (err) => { toast.error(`Erro ao registrar notificação: ${err.message}`); },
  });

  const registrarNotificacaoLote = trpc.atendimentos.registrarNotificacaoEmLote.useMutation({
    onSuccess: (result) => {
      const atendimentosSelecionadosData = atendimentos.filter(d => selecionados.has(d.numero_atendimento || ""));
      salvarHistoricoMutation.mutate({
        qtdAtendimentos: result.count,
        observacao: loteObservacao,
        atendimentos: atendimentosSelecionadosData.map((a: any) => ({
          numatend: a.numero_atendimento || "",
          nomepac: a.paciente || "",
          nomeplaco: a.convenio || "",
          datatend: a.data_entrada ? String(a.data_entrada) : "",
          datasai: a.data_saida ? String(a.data_saida) : null,
          diasParado: a.diasParado || 0,
          tipoatendimentodescricao: a.tipo_atendimento || "",
          codserv: a.codigo_servico || "",
        })),
        notificacoes: loteNotificacaoLinhas.map(n => ({
          motivo: n.motivo,
          setor: n.setor,
          medico: n.medico,
        })),
      });

      requestAnimationFrame(() => {
        toast.success(`Notificação registrada para ${result.count} atendimentos!`);
        setModalLoteAberto(false);
        setLoteNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
        setLoteObservacao("");
        setSelecionados(new Set());
        refetch();
      });
    },
    onError: (err) => { toast.error(`Erro ao registrar notificações: ${err.message}`); },
  });

  const enviarEmailMutation = trpc.atendimentos.enviarNotificacaoEmail.useMutation({
    onSuccess: () => {
      requestAnimationFrame(() => {
        toast.success("E-mail enviado com sucesso!");
        setEmailDestinatario("");
        setEmailMensagem("");
        setEmailExpandido(false);
      });
    },
    onError: (err) => { toast.error(`Erro ao enviar e-mail: ${err.message}`); },
  });

  // ===== Detectar layout TASY =====
  const isTasyLayout = useMemo(() => {
    if (filtros.origem === "tasy" || filtros.origem === "tasy_hemolabor") return true;
    if (filtros.origem !== "all") return false;
    if (aggregations?.origens?.length === 1) {
      return isTasyOrigem(aggregations.origens[0].value);
    }
    return false;
  }, [filtros.origem, aggregations]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const tipos = aggregations?.tipos || [];
    let internacao = 0, exame = 0, ambulatorio = 0, prontoSocorro = 0;
    tipos.forEach(t => {
      const upper = t.value.toUpperCase();
      if (upper.includes("INTERNADO") || upper.includes("INTERNACAO") || upper.includes("INTERNAÇÃO")) internacao += t.count;
      else if (upper.includes("EXAME")) exame += t.count;
      else if (upper.includes("AMBULAT")) ambulatorio += t.count;
      else if (upper.includes("PRONTO") || upper.includes("SOCORRO")) prontoSocorro += t.count;
    });
    return { total: serverTotal, internacao, exame, ambulatorio, prontoSocorro };
  }, [aggregations, serverTotal]);

  const valorTotal = useMemo(() => {
    return (aggregations as any)?.totalValor || 0;
  }, [aggregations]);

  // ===== Distribuições =====
  const distribuicaoPlano = useMemo(() => {
    return (aggregations?.convenios || []).map(c => ({ label: c.value || "Sem Plano", count: c.count }));
  }, [aggregations]);

  const distribuicaoEtapa = useMemo(() => {
    return (aggregations?.etapas || []).map(e => ({ label: e.value || "Sem Etapa", count: e.count }));
  }, [aggregations]);

  // ===== Handlers =====
  const handleFiltroChange = useCallback((key: keyof FiltrosState, value: string) => {
    setFiltros(prev => ({ ...prev, [key]: value }));
    setPaginaAtual(1);
  }, []);

  const handleLimparFiltros = useCallback(() => {
    setFiltros(FILTROS_INICIAIS);
    setPaginaAtual(1);
  }, []);

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  }, [sortColumn]);

  const toggleSelecionado = useCallback((id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selecionarTodos = useCallback(() => {
    const pageIds = new Set(atendimentos.map(d => d.numero_atendimento || ""));
    const allSelected = atendimentos.every(d => selecionados.has(d.numero_atendimento || ""));
    if (allSelected) {
      setSelecionados(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelecionados(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [atendimentos, selecionados]);

  const todosSelecionados = atendimentos.length > 0 &&
    atendimentos.every(d => selecionados.has(d.numero_atendimento || ""));

  // ===== Notificação individual =====
  function abrirNotificacao(atendimento: AtendimentoUnificado) {
    setAtendimentoSelecionado({
      numatend: atendimento.numero_atendimento || atendimento.numatend || "",
      nomepac: atendimento.paciente || atendimento.nomepac || "",
    });
    setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setObservacao("");
    setModalAberto(true);
  }

  function aplicarNotificacao() {
    if (!atendimentoSelecionado) return;
    if (!observacao.trim()) { toast.error("Preencha a observação"); return; }
    registrarNotificacao.mutate({
      numatend: atendimentoSelecionado.numatend,
      observacao,
      notificacoes: notificacaoLinhas,
    });
  }

  // ===== Notificação em lote =====
  function abrirLote() {
    if (selecionados.size === 0) { toast.error("Selecione pelo menos um atendimento"); return; }
    setLoteNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setLoteObservacao("");
    setModalLoteAberto(true);
  }

  function aplicarLote() {
    if (!loteObservacao.trim()) { toast.error("Preencha a observação"); return; }
    const atends = atendimentos
      .filter(d => selecionados.has(d.numero_atendimento || ""))
      .map(d => ({ numatend: d.numero_atendimento || "", nomepac: d.paciente || "" }));
    registrarNotificacaoLote.mutate({
      atendimentos: atends,
      observacao: loteObservacao,
      notificacoes: loteNotificacaoLinhas,
    });
  }

  // ===== Email =====
  function enviarEmail() {
    if (selecionados.size === 0) { toast.error("Selecione pelo menos um atendimento"); return; }
    if (!emailDestinatario.trim()) { toast.error("Informe o e-mail do destinatário"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailDestinatario.trim())) { toast.error("E-mail inválido."); return; }

    const selecionadosData = atendimentos.filter(d => selecionados.has(d.numero_atendimento || ""));
    enviarEmailMutation.mutate({
      destinatarioEmail: emailDestinatario.trim(),
      estabelecimentoNome: estabelecimentoAtual?.nome || "Atendimentos",
      mensagemPersonalizada: emailMensagem.trim() || undefined,
      atendimentos: selecionadosData.map((a: any) => ({
        paciente: a.paciente || "",
        numatend: a.numero_atendimento || "",
        tipoAtendimento: a.tipo_atendimento || "-",
        plano: a.convenio || "Sem Plano",
        diasParado: a.diasParado || 0,
        dataEntrada: a.data_entrada ? formatDateBR(a.data_entrada as string) : "-",
        observacao: undefined,
      })),
    });
  }

  // ===== Exportações =====
  function exportarExcel() {
    const data = atendimentos.map((a: any) => ({
      "N° Atend": a.numero_atendimento,
      "Paciente": a.paciente,
      "Plano": a.convenio,
      "Data Entrada": a.data_entrada ? formatDateBR(a.data_entrada) : "-",
      "Data Saída": a.data_saida ? formatDateBR(a.data_saida) : "-",
      "Dias Parado": a.diasParado,
      "Tipo": a.tipo_atendimento,
      "Serviço": a.descricao_atendimento || a.codigo_servico || "-",
      "Valor": a.valorConta || "-",
      "Etapa": a.etapaConta || "-",
      "Setor Etapa": a.setorEtapa || "-",
      "Origem": getOrigemLabel(a.origemSistema),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, `atendimentos_unificados_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
    toast.success("Exportado com sucesso!");
  }

  async function exportarPDF() {
    if (selecionados.size === 0) { toast.error("Selecione para exportar PDF"); return; }
    try {
      toast.info("Gerando PDF...");
      const selecionadosData = atendimentos.filter(d => selecionados.has(d.numero_atendimento || ""));
      const doc = await gerarPDFAtendimentos(selecionadosData as any, [], "", { isTasy: isTasyLayout });
      doc.save(`atendimentos_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`);
      toast.success("PDF gerado!");
    } catch (err) {
      toast.error("Erro ao gerar PDF");
      console.error(err);
    }
  }

  // ===== Reset de página quando filtros mudam =====
  useEffect(() => { setPaginaAtual(1); }, [filtros, debouncedBusca]);

  // ===== UI =====
  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/")} className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-7 h-7 text-primary" />
              Atendimentos{estabelecimentoAtual ? ` — ${estabelecimentoAtual.nome}` : ""}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão unificada de todos os sistemas de gestão
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* ===== Tabs Principais ===== */}
      <Tabs value={viewAtiva} onValueChange={setViewAtiva}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="atendimentos" className="gap-2">
              <FileText className="w-4 h-4" />
              Atendimentos
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 rounded-md">
                {serverTotal}
              </span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <Bell className="w-4 h-4" />
              Histórico
              {notificacoesGeradas.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-orange-500/10 text-orange-600 rounded-md">
                  {notificacoesGeradas.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Ações de lote */}
          {viewAtiva === "atendimentos" && selecionados.size > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={abrirLote}>
                <Bell className="w-3.5 h-3.5 text-orange-500" />
                Notificar ({selecionados.size})
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarPDF}>
                <Download className="w-3.5 h-3.5" />
                PDF ({selecionados.size})
              </Button>
              <EmailSection
                expandido={emailExpandido}
                setExpandido={setEmailExpandido}
                destinatario={emailDestinatario}
                setDestinatario={setEmailDestinatario}
                mensagem={emailMensagem}
                setMensagem={setEmailMensagem}
                onEnviar={enviarEmail}
                isLoading={enviarEmailMutation.isPending}
                qtdSelecionados={selecionados.size}
              />
            </div>
          )}
        </div>

        {/* ===== Tab: Atendimentos ===== */}
        <TabsContent value="atendimentos" className="space-y-4 mt-4">
          {/* KPIs */}
          <AtendimentosKPIs
            total={kpis.total}
            internacao={kpis.internacao}
            exame={kpis.exame}
            ambulatorio={kpis.ambulatorio}
            prontoSocorro={kpis.prontoSocorro}
            valorTotal={valorTotal}
            filtroTipoAtivo={filtros.tipo}
            onFiltroTipo={(tipo) => handleFiltroChange("tipo", tipo)}
          />

          {/* Distribuições */}
          {distribuicaoPlano.length > 0 && (
            <AtendimentosDistribuicao
              titulo="Quantidade por Plano (Convênio)"
              icon="plano"
              items={distribuicaoPlano}
              filtroAtivo={filtros.convenio}
              onFiltro={(v) => handleFiltroChange("convenio", v)}
            />
          )}

          {isTasyLayout && distribuicaoEtapa.length > 0 && (
            <AtendimentosDistribuicao
              titulo="Quantidade por Etapa da Conta"
              icon="etapa"
              items={distribuicaoEtapa}
              filtroAtivo={filtros.etapa}
              onFiltro={(v) => handleFiltroChange("etapa", v)}
            />
          )}

          {/* Filtros */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <AtendimentosFiltros
                filtros={filtros}
                onFiltroChange={handleFiltroChange}
                onLimparFiltros={handleLimparFiltros}
                aggregations={aggregations}
                isTasyLayout={isTasyLayout}
              />
            </div>
            <Button onClick={exportarExcel} className="gap-2 bg-emerald-600 hover:bg-emerald-700 shrink-0">
              <Download className="w-4 h-4" /> Excel
            </Button>
          </div>

          {/* Tabela */}
          <AtendimentosTabela
            data={atendimentos as AtendimentoUnificado[]}
            isTasyLayout={isTasyLayout}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onSort={handleSort}
            selecionados={selecionados}
            onToggleSelecionado={toggleSelecionado}
            onSelecionarTodos={selecionarTodos}
            todosSelecionados={todosSelecionados}
            onNotificar={abrirNotificacao}
            paginaAtual={paginaAtual}
            totalPaginas={serverTotalPages}
            totalRegistros={serverTotal}
            onPagina={setPaginaAtual}
            isLoading={isLoading}
          />
        </TabsContent>

        {/* ===== Tab: Histórico ===== */}
        <TabsContent value="historico" className="mt-4">
          <HistoricoNotificacoes
            notificacoes={notificacoesGeradas}
            isTasyLayout={isTasyLayout}
          />
        </TabsContent>
      </Tabs>

      {/* ===== Modais ===== */}
      <NotificacaoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        atendimento={atendimentoSelecionado}
        linhas={notificacaoLinhas}
        setLinhas={setNotificacaoLinhas}
        observacao={observacao}
        setObservacao={setObservacao}
        onAplicar={aplicarNotificacao}
        isLoading={registrarNotificacao.isPending}
      />

      <NotificacaoLoteModal
        aberto={modalLoteAberto}
        onFechar={() => setModalLoteAberto(false)}
        qtdSelecionados={selecionados.size}
        linhas={loteNotificacaoLinhas}
        setLinhas={setLoteNotificacaoLinhas}
        observacao={loteObservacao}
        setObservacao={setLoteObservacao}
        onAplicar={aplicarLote}
        isLoading={registrarNotificacaoLote.isPending}
      />
    </div>
  );
}
