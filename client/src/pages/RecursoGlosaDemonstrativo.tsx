import { useEffect, useMemo, useState, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, ChevronDown, ChevronRight, Sparkles, Copy, Check, Ban, Users, ListTree, Tag, ArrowLeft, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import { RecursoGlosaMultiSelect } from "@/components/recurso-glosa/RecursoGlosaMultiSelect";
import { MAX_RECEBIMENTO_IDS_DEMONSTRATIVO } from "@shared/recursoGlosaDemonstrativoFiltros";
import {
  criarEscopoDemonstrativo,
  derivarOpcoesMotivoGlosa,
  filtrarDetalhePorMotivos,
  idsRecebimentosVisiveis,
  mesmaSelecao,
  normalizarSelecao,
  reconciliarSelecao,
} from "@/components/recurso-glosa/recursoGlosaDemonstrativo";

export default function RecursoGlosaDemonstrativo() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const { user } = useAuth();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // States
  // Array vazio significa "todas" no novo contrato do demonstrativo.
  const [competenciasSelecionadas, setCompetenciasSelecionadas] = useState<string[]>([]);
  const [convenioId, setConvenioId] = useState<string>("todos");
  const [datasPagtoSelecionadas, setDatasPagtoSelecionadas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [agrupamento, setAgrupamento] = useState<"guia" | "item" | "motivo">("guia");
  const [expandedGuia, setExpandedGuia] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedMotivo, setExpandedMotivo] = useState<string | null>(null);
  const [motivosInternosSelecionados, setMotivosInternosSelecionados] = useState<string[]>([]);
  const [detailScope, setDetailScope] = useState<string | null>(null);
  const [editingJustificativa, setEditingJustificativa] = useState<{ id: number; value: string; fonte?: string } | null>(null);
  const [editingValorRecurso, setEditingValorRecurso] = useState<{ id: number; value: string; fonte?: string } | null>(null);
  const [page, setPage] = useState(1);

  const convenioIdNumero = convenioId !== "todos" ? Number(convenioId) : undefined;
  const scopeKey = useMemo(() => criarEscopoDemonstrativo({
    estabelecimentoId,
    competencias: competenciasSelecionadas,
    datasPagto: datasPagtoSelecionadas,
    convenioId: convenioIdNumero,
  }), [estabelecimentoId, competenciasSelecionadas, datasPagtoSelecionadas, convenioIdNumero]);

  const limparEstadoDetalhe = () => {
    setExpandedGuia(null);
    setExpandedItem(null);
    setExpandedMotivo(null);
    setMotivosInternosSelecionados([]);
    setDetailScope(null);
    setEditingJustificativa(null);
    setEditingValorRecurso(null);
  };

  // Mudanças externas de estabelecimento são tratadas após a renderização,
  // nunca disparando setState durante render.
  useEffect(() => {
    limparEstadoDetalhe();
    setCompetenciasSelecionadas([]);
    setConvenioId('todos');
    setDatasPagtoSelecionadas([]);
    setPage(1);
  }, [estabelecimentoId]);

  // Queries
  const { data: competencias } = trpc.faturamentoUnificado.competenciasDemonstrativo.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );
  const { data: convenios } = trpc.faturamentoUnificado.conveniosDemonstrativo.useQuery(
    {
      estabelecimentoId,
      competencias: competenciasSelecionadas,
      datasPagto: datasPagtoSelecionadas,
    },
    { enabled: !!estabelecimentoId }
  );
  const { data: datasPagamento } = trpc.faturamentoUnificado.datasPagamentoDemonstrativo.useQuery(
    {
      estabelecimentoId,
      competencias: competenciasSelecionadas,
      convenioId: convenioIdNumero,
    },
    { enabled: !!estabelecimentoId }
  );
  const { data: itensGlosados, isLoading, refetch } = trpc.faturamentoUnificado.itensGlosadosDemonstrativo.useQuery(
    {
      estabelecimentoId,
      competencias: competenciasSelecionadas,
      convenioId: convenioIdNumero,
      datasPagto: datasPagtoSelecionadas,
      agrupamento,
      busca: busca || undefined,
      page,
      pageSize: 50,
    },
    { enabled: !!estabelecimentoId }
  );

  const isScopeAtual = detailScope === scopeKey;
  const { data: detalheGuia, refetch: refetchDetalheGuia, isLoading: detalheGuiaCarregando, isFetching: detalheGuiaAtualizando, isError: detalheGuiaComErro } = trpc.faturamentoUnificado.itensGlosadosDetalheGuiaDemonstrativo.useQuery(
    {
      estabelecimentoId,
      guia: expandedGuia || "",
      competencias: competenciasSelecionadas,
      convenioId: convenioIdNumero,
      datasPagto: datasPagtoSelecionadas,
    },
    { enabled: !!expandedGuia && agrupamento === 'guia' && isScopeAtual }
  );

  const { data: detalheItem, refetch: refetchDetalheItem, isLoading: detalheItemCarregando, isFetching: detalheItemAtualizando, isError: detalheItemComErro } = trpc.faturamentoUnificado.itensGlosadosDetalhePorItemDemonstrativo.useQuery(
    {
      estabelecimentoId,
      item: expandedItem || "",
      competencias: competenciasSelecionadas,
      convenioId: convenioIdNumero,
      datasPagto: datasPagtoSelecionadas,
    },
    { enabled: !!expandedItem && agrupamento === 'item' && isScopeAtual }
  );

  const { data: detalheMotivo, refetch: refetchDetalheMotivo, isLoading: detalheMotivoCarregando, isFetching: detalheMotivoAtualizando, isError: detalheMotivoComErro } = trpc.faturamentoUnificado.itensGlosadosDetalhePorMotivoDemonstrativo.useQuery(
    {
      estabelecimentoId,
      codigoGlosa: expandedMotivo || "",
      competencias: competenciasSelecionadas,
      convenioId: convenioIdNumero,
      datasPagto: datasPagtoSelecionadas,
    },
    { enabled: !!expandedMotivo && agrupamento === 'motivo' && isScopeAtual }
  );

  const { data: contextoContratual } = trpc.contratosConvenios.obterContextoGlosa.useQuery(
    {
      estabelecimentoId,
      convenioId: convenioIdNumero,
    },
    { enabled: !!estabelecimentoId && estabelecimentoId > 0 && isScopeAtual }
  );

  const competenciaOptions = useMemo(() => (competencias || []).map((competencia: any) => ({
    value: competencia.competencia,
    label: `${competencia.competencia} (${competencia.total})`,
  })), [competencias]);
  const dataPagtoOptions = useMemo(() => (datasPagamento || []).map((data: any) => ({
    value: data.dataPagto,
    label: `${new Date(`${data.dataPagto}T12:00:00`).toLocaleDateString('pt-BR')} (${data.total})`,
  })), [datasPagamento]);

  // A API retorna opções dependentes do escopo. A reconciliação é feita em
  // effects para não disparar reset durante a renderização nem reter seleção inválida.
  useEffect(() => {
    if (!competencias) return;
    const reconciliadas = reconciliarSelecao(competenciasSelecionadas, competenciaOptions.map((option) => option.value));
    if (!mesmaSelecao(competenciasSelecionadas, reconciliadas)) {
      limparEstadoDetalhe();
      setCompetenciasSelecionadas(reconciliadas);
      setPage(1);
    }
  }, [competencias, competenciaOptions, competenciasSelecionadas]);

  useEffect(() => {
    if (!convenios || convenioId === 'todos') return;
    const aindaDisponivel = convenios.some((convenio: any) => String(convenio.convenioId) === convenioId);
    if (!aindaDisponivel) {
      limparEstadoDetalhe();
      setConvenioId('todos');
      setDatasPagtoSelecionadas([]);
      setPage(1);
    }
  }, [convenioId, convenios]);

  useEffect(() => {
    if (!datasPagamento) return;
    const reconciliadas = reconciliarSelecao(datasPagtoSelecionadas, dataPagtoOptions.map((option) => option.value));
    if (!mesmaSelecao(datasPagtoSelecionadas, reconciliadas)) {
      limparEstadoDetalhe();
      setDatasPagtoSelecionadas(reconciliadas);
      setPage(1);
    }
  }, [dataPagtoOptions, datasPagamento, datasPagtoSelecionadas]);

  // Mutations
  const salvarJustificativaMutation = trpc.faturamentoUnificado.salvarJustificativaDemonstrativo.useMutation({
    onSuccess: () => {
      toast.success("Justificativa salva!");
      setEditingJustificativa(null);
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
    },
  });

  const salvarValorRecursoMutation = trpc.faturamentoUnificado.salvarValorRecursoDemonstrativo.useMutation({
    onSuccess: () => {
      toast.success("Valor recurso salvo!");
      setEditingValorRecurso(null);
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
      refetch();
    },
  });

  const marcarGlosaAceitaMutation = trpc.faturamentoUnificado.marcarGlosaAceitaDemonstrativo.useMutation({
    onSuccess: () => {
      toast.success("Glosa aceita atualizada!");
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
      refetch();
    },
  });

  const aceitarEmLoteMutation = trpc.faturamentoUnificado.marcarGlosaAceitaEmLoteDemonstrativo.useMutation({
    onSuccess: (data) => {
      toast.success(`Glosa aceita marcada em ${data.affected} itens!`);
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
      refetch();
    },
  });

  const gerarIAMutation = trpc.faturamentoUnificado.gerarJustificativasIADemonstrativo.useMutation({
    onSuccess: (data: any) => {
      if (data?.contextoContratual?.possuiContratoAtivo) {
        toast.success("Justificativas geradas com IA fundamentadas no Contrato e PDFs do Convênio!");
      } else {
        toast.success("Justificativas geradas com IA!");
      }
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
    },
    onError: (err) => toast.error(`Erro IA: ${err.message}`),
  });

  const replicarMutation = trpc.faturamentoUnificado.replicarJustificativasDemonstrativo.useMutation({
    onSuccess: (data) => {
      toast.success(`Justificativa replicada para ${data.affected} itens!`);
      refetchDetalheGuia();
      refetchDetalheItem();
      refetchDetalheMotivo();
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Handlers
  const handleSalvarJustificativa = () => {
    if (!editingJustificativa) return;
    salvarJustificativaMutation.mutate({
      recebimentoId: editingJustificativa.id,
      justificativa: editingJustificativa.value,
      fonte: editingJustificativa.fonte,
      estabelecimentoId,
      guia: expandedGuia || undefined,
    });
  };

  const handleSalvarValorRecurso = () => {
    if (!editingValorRecurso) return;
    salvarValorRecursoMutation.mutate({
      recebimentoId: editingValorRecurso.id,
      valor: parseFloat(editingValorRecurso.value) || 0,
      fonte: editingValorRecurso.fonte,
    });
  };

  const handleGerarIA = (ids: number[]) => {
    if (ids.length === 0) return;
    gerarIAMutation.mutate({ estabelecimentoId, recebimentoIds: ids });
  };

  const handleReplicar = ({
    justificativa,
    item,
    codigoGlosa,
    recebimentoIds,
  }: {
    justificativa: string;
    item?: string;
    codigoGlosa?: string;
    recebimentoIds: number[];
  }) => {
    if (!justificativa || recebimentoIds.length === 0) {
      toast.error("Preencha uma justificativa antes de replicar");
      return;
    }
    replicarMutation.mutate({
      estabelecimentoId,
      competencias: competenciasSelecionadas,
      datasPagto: datasPagtoSelecionadas,
      convenioId: convenioIdNumero,
      item,
      codigoGlosa,
      justificativa,
      recebimentoIds,
    });
  };

  const handleAceitarTodas = (items: Array<{id: number; fonte: string}>) => {
    if (items.length === 0) return;
    aceitarEmLoteMutation.mutate({ items, aceita: true, estabelecimentoId, guia: expandedGuia || undefined });
  };

  const resetarPorFiltro = () => {
    limparEstadoDetalhe();
    setPage(1);
  };

  const trocarCompetencias = (selecionadas: string[]) => {
    resetarPorFiltro();
    setCompetenciasSelecionadas(normalizarSelecao(selecionadas));
  };

  const trocarDatasPagto = (selecionadas: string[]) => {
    resetarPorFiltro();
    setDatasPagtoSelecionadas(normalizarSelecao(selecionadas));
  };

  const trocarConvenio = (proximoConvenioId: string) => {
    resetarPorFiltro();
    setConvenioId(proximoConvenioId);
    setDatasPagtoSelecionadas([]);
  };

  const trocarMotivosInternos = (selecionados: string[]) => {
    setEditingJustificativa(null);
    setEditingValorRecurso(null);
    setMotivosInternosSelecionados(normalizarSelecao(selecionados));
    setPage(1);
  };

  const abrirDetalhe = (tipo: 'guia' | 'item' | 'motivo', valor: string, aberto: boolean) => {
    setEditingJustificativa(null);
    setEditingValorRecurso(null);
    setMotivosInternosSelecionados([]);
    setExpandedGuia(tipo === 'guia' && aberto ? valor : null);
    setExpandedItem(tipo === 'item' && aberto ? valor : null);
    setExpandedMotivo(tipo === 'motivo' && aberto ? valor : null);
    setDetailScope(aberto ? scopeKey : null);
  };

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const items = itensGlosados?.items || [];
  const totalPages = itensGlosados?.totalPages || 1;
  const detalheGuiaAtual = isScopeAtual ? (detalheGuia || []) : [];
  const detalheItemAtual = isScopeAtual ? (detalheItem || []) : [];
  const detalheMotivoAtual = isScopeAtual ? (detalheMotivo || []) : [];
  const opcoesMotivosInternos = useMemo(
    () => derivarOpcoesMotivoGlosa(detalheItemAtual),
    [detalheItemAtual],
  );
  const detalheItemFiltrado = useMemo(
    () => filtrarDetalhePorMotivos(detalheItemAtual, motivosInternosSelecionados),
    [detalheItemAtual, motivosInternosSelecionados],
  );
  const excedeLimiteAcoes = (rows: Array<{ id: number }>) => idsRecebimentosVisiveis(rows).length > MAX_RECEBIMENTO_IDS_DEMONSTRATIVO;
  const acoesGuiaBloqueadas = !isScopeAtual || !detalheGuia || detalheGuiaCarregando || detalheGuiaAtualizando || detalheGuiaComErro || excedeLimiteAcoes(detalheGuiaAtual);
  const acoesItemBloqueadas = !isScopeAtual || !detalheItem || detalheItemCarregando || detalheItemAtualizando || detalheItemComErro || excedeLimiteAcoes(detalheItemFiltrado);
  const acoesMotivoBloqueadas = !isScopeAtual || !detalheMotivo || detalheMotivoCarregando || detalheMotivoAtualizando || detalheMotivoComErro || excedeLimiteAcoes(detalheMotivoAtual);

  // Não remover automaticamente um motivo durante refetch: isso ampliaria a
  // seleção para "Todos". Apenas a troca explícita de item/filtro limpa o recorte.

  const [, navigate] = useLocation();

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/analise-glosa')} title="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold sm:text-2xl">Recurso Glosa Demonstrativo</h1>
        </div>
        <Badge variant="outline" className="text-xs">Fonte: Demonstrativo XML + Recebimentos Excel</Badge>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Competências</label>
              <RecursoGlosaMultiSelect
                ariaLabel="Competências"
                options={competenciaOptions}
                selected={competenciasSelecionadas}
                onChange={trocarCompetencias}
                placeholder="Todas"
                allLabel="Todas"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Convênio</label>
              <Select value={convenioId} onValueChange={trocarConvenio}>
                <SelectTrigger><SelectValue placeholder="Convênio" /></SelectTrigger>
                <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {convenios?.map((c: any) => (
                  <SelectItem key={c.convenioId} value={String(c.convenioId)}>
                    {c.convenio || `Conv. ${c.convenioId}`} ({c.total})
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Datas de pagamento</label>
              <RecursoGlosaMultiSelect
                ariaLabel="Datas de pagamento"
                options={dataPagtoOptions}
                selected={datasPagtoSelecionadas}
                onChange={trocarDatasPagto}
                placeholder="Todas"
                allLabel="Todas"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Busca</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar guia, paciente, item..."
                  className="pl-9"
                  value={busca}
                  onChange={(e) => { resetarPorFiltro(); setBusca(e.target.value); }}
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground flex items-center">
              {itensGlosados ? `${itensGlosados.total} registros` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Base Contratual Vinculada para Análise de Recurso de Glosa */}
      {contextoContratual && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-blue-900 dark:text-blue-200">
                Base Contratual Integrada à IA de Recursos:
              </span>{" "}
              {contextoContratual.possuiContratoAtivo ? (
                <span className="text-blue-800 dark:text-blue-300">
                  {contextoContratual.contratos.length} contrato(s) ativo(s) (
                  {contextoContratual.contratos.map((c: any) => `${c.convenioNome}${c.numeroContrato ? ` #${c.numeroContrato}` : ""}`).join(", ")})
                  {" · "}
                  <strong>{contextoContratual.documentos.length} PDF(s) contratual(is) lido(s)</strong>
                  {contextoContratual.regrasNegocio.length > 0 ? ` · ${contextoContratual.regrasNegocio.length} regra(s) contratual(is)` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Nenhum contrato ou PDF contratual localizado para o filtro atual. Cadastre/importe o PDF em Contratos x Convênios para fundamentar os recursos automaticamente.
                </span>
              )}
            </div>
          </div>
          <a
            href="/contratos-convenios"
            className="text-xs font-medium text-blue-700 hover:underline shrink-0"
          >
            Gerenciar Contratos / PDFs →
          </a>
        </div>
      )}

      {/* KPIs */}
      {itensGlosados?.resumo && (() => {
        const resumo = itensGlosados.resumo;
        const glosaInicial = resumo.totalValorGlosa;
        const recurso = resumo.totalValorRecurso || 0;
        const refaturamento = 0; // Placeholder - será preenchido quando implementado
        const aceite = resumo.totalValorAceite || 0;
        const naoTrabalhado = resumo.totalValorNaoTrabalhado || 0;
        const recRecebido = 0; // Placeholder - será preenchido com dados do acompanhamento
        const saldoAberto = glosaInicial - recurso - refaturamento - aceite - recRecebido;
        return (
          <div className="space-y-3">
            {/* KPIs no estilo do modelo - linha única com todos os indicadores */}
            <div className="rounded-lg border bg-card p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Glosa Inicial</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(glosaInicial)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Recurso</p>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(recurso)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Refaturamento</p>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(refaturamento)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Aceite</p>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(aceite)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Não trabalhado</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(naoTrabalhado)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Rec. Recebido</p>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(recRecebido)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Saldo aberto</p>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(Math.max(saldoAberto, 0))}</p>
                </div>
              </div>
            </div>
            {/* Barra de progresso da análise */}
            <div className="rounded-lg border bg-card p-3 flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <BarChart3 className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Análise das glosas do período</span>
              </div>
              <div className="w-full md:flex-1">
                <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                  <div className="bg-purple-600 h-4 rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${Math.max(Math.min(resumo.percentualAnalise || 0, 100), 8)}%` }}>
                    <span className="text-[10px] font-bold text-white">{resumo.percentualAnalise?.toFixed(2) || '0.00'}%</span>
                  </div>
                </div>
              </div>
              {(resumo.percentualAnalise || 0) < 100 && (
                <p className="max-w-full text-xs text-red-500 font-bold md:shrink-0">Atenção! Podem haver glosas não submetidas</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tabs de agrupamento */}
      <Tabs value={agrupamento} onValueChange={(v) => { setAgrupamento(v as any); resetarPorFiltro(); }}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="guia" className="gap-1"><Users className="h-4 w-4" /> Por Guia/Paciente</TabsTrigger>
          <TabsTrigger value="item" className="gap-1"><ListTree className="h-4 w-4" /> Por Item</TabsTrigger>
          <TabsTrigger value="motivo" className="gap-1"><Tag className="h-4 w-4" /> Por Motivo de Glosa</TabsTrigger>
        </TabsList>

        {/* TAB GUIA */}
        <TabsContent value="guia">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-2 text-left w-8"></th>
                      <th className="p-2 text-left">Guia</th>
                      <th className="p-2 text-left">Paciente</th>
                      <th className="p-2 text-left">Lote</th>
                      <th className="p-2 text-left">Protocolo</th>
                      <th className="p-2 text-left">Carteirinha</th>
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-right">Valor Glosa</th>
                      <th className="p-2 text-right">Vlr Recursado</th>
                      <th className="p-2 text-right">Vlr Aceita</th>
                      <th className="p-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={14} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={14} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
                    ) : items.map((item: any) => (
                      <Fragment key={item.guia}>
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => abrirDetalhe('guia', item.guia, expandedGuia !== item.guia)}>
                          <td className="p-2">{expandedGuia === item.guia ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="p-2 font-mono text-xs">{item.guia}</td>
                          <td className="p-2">{item.paciente}</td>
                          <td className="p-2 font-mono text-xs">{item.lote || '-'}</td>
                          <td className="p-2 font-mono text-xs">{item.protocolo || '-'}</td>
                          <td className="p-2 font-mono text-xs">{item.carteirinha || '-'}</td>
                          <td className="p-2">{item.convenio}</td>
                          <td className="p-2 text-right">{item.itensGlosados}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorFaturado))}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorPago))}</td>
                          <td className="p-2 text-right text-red-600 font-medium">{formatCurrency(Number(item.valorGlosa))}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(Number(item.valorRecursado || 0))}</td>
                          <td className="p-2 text-right text-orange-600">{formatCurrency(Number(item.valorGlosaAceita || 0))}</td>
                          <td className="p-2">
                            <Badge variant={item.statusRecurso === 'Finalizado' ? 'default' : item.statusRecurso === 'Iniciado' ? 'secondary' : 'outline'} className="text-xs">
                              {item.statusRecurso || 'Pendente'}
                            </Badge>
                          </td>
                        </tr>
                        {expandedGuia === item.guia && (
                          <tr key={`${item.guia}-detail`}>
                            <td colSpan={14} className="p-0">
                              <div className="bg-muted/20 p-4 border-b">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium">Itens glosados da guia {item.guia} ({detalheGuiaAtual.length} itens)</span>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleGerarIA(idsRecebimentosVisiveis(detalheGuiaAtual))} disabled={acoesGuiaBloqueadas || gerarIAMutation.isPending}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Gerar IA ({detalheGuiaAtual.length} filtradas)
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleAceitarTodas(detalheGuiaAtual.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={acoesGuiaBloqueadas || aceitarEmLoteMutation.isPending}>
                                      <Ban className="h-3 w-3 mr-1" /> Aceitar filtradas ({detalheGuiaAtual.filter((d: any) => !d.glosaAceita).length})
                                    </Button>
                                  </div>
                                </div>
                                {renderDetalheTable(detalheGuiaAtual, 'guia', detalheGuiaCarregando || detalheGuiaAtualizando, detalheGuiaComErro)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB ITEM */}
        <TabsContent value="item">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-2 text-left w-8"></th>
                      <th className="p-2 text-left">Código</th>
                      <th className="p-2 text-left">Descrição</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Justificativa</th>
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-right">Valor Glosa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
                    ) : items.map((item: any) => (
                      <Fragment key={item.codigo}>
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => abrirDetalhe('item', item.codigo, expandedItem !== item.codigo)}>
                          <td className="p-2">{expandedItem === item.codigo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="p-2 font-mono text-xs">{item.codigo}</td>
                          <td className="p-2">{item.descricao}</td>
                          <td className="p-2">{item.tipo || '-'}</td>
                          <td className="p-2 text-xs text-muted-foreground">{item.justificativasPreenchidas}/{item.itensGlosados} preenchidas</td>
                          <td className="p-2">{item.convenio}</td>
                          <td className="p-2 text-right">{item.itensGlosados}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorFaturado))}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorPago))}</td>
                          <td className="p-2 text-right text-red-600 font-medium">{formatCurrency(Number(item.valorGlosa))}</td>
                        </tr>
                        {expandedItem === item.codigo && (
                          <tr key={`${item.codigo}-detail`}>
                            <td colSpan={10} className="p-0">
                              <div className="bg-muted/20 p-4 border-b">
                                <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                  <div>
                                    <span className="text-sm font-medium">Guias com item {item.codigo} ({detalheItemFiltrado.length}/{detalheItemAtual.length} ocorrências exibidas)</span>
                                  </div>
                                  <div className="min-w-[280px] xl:w-[320px]">
                                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo de glosa no item</label>
                                    <RecursoGlosaMultiSelect
                                      ariaLabel="Motivo de glosa no item"
                                      options={opcoesMotivosInternos}
                                      selected={motivosInternosSelecionados}
                                      onChange={trocarMotivosInternos}
                                      placeholder="Todos os motivos"
                                      allLabel="Todos os motivos"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleGerarIA(idsRecebimentosVisiveis(detalheItemFiltrado))} disabled={acoesItemBloqueadas || detalheItemFiltrado.length === 0 || gerarIAMutation.isPending}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Gerar IA ({detalheItemFiltrado.length} filtradas)
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const firstWithJustificativa = detalheItemFiltrado.find((d: any) => d.justificativa);
                                      if (firstWithJustificativa) handleReplicar({
                                        justificativa: firstWithJustificativa.justificativa,
                                        item: item.codigo,
                                        recebimentoIds: idsRecebimentosVisiveis(detalheItemFiltrado),
                                      });
                                      else toast.error("Preencha ao menos uma justificativa antes de replicar");
                                    }} disabled={acoesItemBloqueadas || detalheItemFiltrado.length === 0 || replicarMutation.isPending}>
                                      <Copy className="h-3 w-3 mr-1" /> Replicar filtradas ({detalheItemFiltrado.length})
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleAceitarTodas(detalheItemFiltrado.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={acoesItemBloqueadas || aceitarEmLoteMutation.isPending}>
                                      <Ban className="h-3 w-3 mr-1" /> Aceitar filtradas ({detalheItemFiltrado.filter((d: any) => !d.glosaAceita).length})
                                    </Button>
                                  </div>
                                </div>
                                {renderDetalheTable(detalheItemFiltrado, 'item', detalheItemCarregando || detalheItemAtualizando, detalheItemComErro)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB MOTIVO */}
        <TabsContent value="motivo">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-2 text-left w-8"></th>
                      <th className="p-2 text-left">Código Glosa</th>
                      <th className="p-2 text-left">Motivo</th>
                      <th className="p-2 text-left">Justificativa</th>
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-right">Valor Glosa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
                    ) : items.map((item: any) => {
                      const motivoKey = item.codigoGlosa || 'SEM_CODIGO';
                      return (
                        <Fragment key={motivoKey}>
                          <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => abrirDetalhe('motivo', motivoKey, expandedMotivo !== motivoKey)}>
                            <td className="p-2">{expandedMotivo === motivoKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                            <td className="p-2 font-mono text-xs">{item.codigoGlosa === 'SEM_CODIGO' ? '-' : item.codigoGlosa}</td>
                            <td className="p-2">{item.motivoGlosa || '-'}</td>
                            <td className="p-2 text-xs text-muted-foreground">{item.justificativasPreenchidas}/{item.itensGlosados} preenchidas</td>
                            <td className="p-2">{item.convenio}</td>
                            <td className="p-2 text-right">{item.itensGlosados}</td>
                            <td className="p-2 text-right">{formatCurrency(Number(item.valorFaturado))}</td>
                            <td className="p-2 text-right">{formatCurrency(Number(item.valorPago))}</td>
                            <td className="p-2 text-right text-red-600 font-medium">{formatCurrency(Number(item.valorGlosa))}</td>
                          </tr>
                          {expandedMotivo === motivoKey && (
                            <tr key={`${motivoKey}-detail`}>
                              <td colSpan={9} className="p-0">
                                <div className="bg-muted/20 p-4 border-b">
                                  <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium">Itens com motivo {item.codigoGlosa === 'SEM_CODIGO' ? 'Sem código' : item.codigoGlosa} ({detalheMotivoAtual.length} ocorrências)</span>
                                  <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => handleGerarIA(idsRecebimentosVisiveis(detalheMotivoAtual))} disabled={acoesMotivoBloqueadas || gerarIAMutation.isPending}>
                                        <Sparkles className="h-3 w-3 mr-1" /> Gerar IA ({detalheMotivoAtual.length} filtradas)
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => {
                                        const firstWithJustificativa = detalheMotivoAtual.find((d: any) => d.justificativa);
                                        if (firstWithJustificativa) handleReplicar({
                                          justificativa: firstWithJustificativa.justificativa,
                                          codigoGlosa: motivoKey,
                                          recebimentoIds: idsRecebimentosVisiveis(detalheMotivoAtual),
                                        });
                                        else toast.error("Preencha ao menos uma justificativa antes de replicar");
                                      }} disabled={acoesMotivoBloqueadas || detalheMotivoAtual.length === 0 || replicarMutation.isPending}>
                                        <Copy className="h-3 w-3 mr-1" /> Replicar filtradas ({detalheMotivoAtual.length})
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => handleAceitarTodas(detalheMotivoAtual.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={acoesMotivoBloqueadas || aceitarEmLoteMutation.isPending}>
                                        <Ban className="h-3 w-3 mr-1" /> Aceitar filtradas ({detalheMotivoAtual.filter((d: any) => !d.glosaAceita).length})
                                      </Button>
                                    </div>
                                  </div>
                                  {renderDetalheTable(detalheMotivoAtual, 'motivo', detalheMotivoCarregando || detalheMotivoAtualizando, detalheMotivoComErro)}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { resetarPorFiltro(); setPage(page - 1); }}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => { resetarPorFiltro(); setPage(page + 1); }}>Próxima</Button>
        </div>
      )}
    </div>
  );

  // Função auxiliar para renderizar tabela de detalhe
  function renderDetalheTable(data: any[], tipo: 'guia' | 'item' | 'motivo', carregando = false, comErro = false) {
    if (carregando) return <p className="text-sm text-muted-foreground">Carregando detalhes...</p>;
    if (comErro) return <p role="alert" className="text-sm text-destructive">Não foi possível carregar os detalhes deste item.</p>;
    if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>;
    return (
      <div className="overflow-x-auto">
        {excedeLimiteAcoes(data) && <p role="status" className="mb-2 text-xs text-amber-700">As ações em lote aceitam até {MAX_RECEBIMENTO_IDS_DEMONSTRATIVO} registros. Reduza o período ou selecione um motivo para continuar; nenhuma linha será omitida automaticamente.</p>}
        <table className="w-full text-xs" aria-label={tipo === 'item' ? 'Guias do item' : undefined}>
          <thead className="bg-background border-b">
            <tr>
              {tipo !== 'guia' && <th className="p-2 text-left">Guia</th>}
              {tipo !== 'guia' && <th className="p-2 text-left">Paciente</th>}
              {tipo !== 'guia' && <th className="p-2 text-left">Lote</th>}
              {tipo !== 'guia' && <th className="p-2 text-left">Protocolo</th>}
              {tipo === 'guia' && <th className="p-2 text-left">Código</th>}
              {tipo === 'guia' && <th className="p-2 text-left">Descrição</th>}
              {tipo === 'guia' && <th className="p-2 text-left">Tipo</th>}
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-right">Qtde</th>
              <th className="p-2 text-right">Faturado</th>
              <th className="p-2 text-right">Pago</th>
              <th className="p-2 text-right">Glosa</th>
              <th className="p-2 text-left">Cód. Glosa</th>
              <th className="p-2 text-left">Motivo</th>
              <th className="p-2 text-right">Vlr Recurso</th>
              <th className="p-2 text-center">Aceita</th>
              <th className="p-2 text-left">Justificativa</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => (
              <tr key={row.id} className="border-b hover:bg-muted/20">
                {tipo !== 'guia' && <td className="p-2 font-mono">{row.guia}</td>}
                {tipo !== 'guia' && <td className="p-2">{row.paciente}</td>}
                {tipo !== 'guia' && <td className="p-2 font-mono">{row.lote || '-'}</td>}
                {tipo !== 'guia' && <td className="p-2 font-mono">{row.protocolo || '-'}</td>}
                {tipo === 'guia' && <td className="p-2 font-mono">{row.codigo}</td>}
                {tipo === 'guia' && <td className="p-2 max-w-[200px] truncate">{row.descricao}</td>}
                {tipo === 'guia' && <td className="p-2">{row.tipo || '-'}</td>}
                <td className="p-2">{formatDate(row.dataExecucao)}</td>
                <td className="p-2 text-right">{row.qtde}</td>
                <td className="p-2 text-right">{formatCurrency(row.valorFaturado)}</td>
                <td className="p-2 text-right">{formatCurrency(row.valorPago)}</td>
                <td className="p-2 text-right text-red-600">{formatCurrency(row.valorGlosa)}</td>
                <td className="p-2 font-mono">{row.codigoGlosa || '-'}</td>
                <td className="p-2 max-w-[150px] truncate">{row.motivoGlosa}</td>
                <td className="p-2 text-right">
                  {row.glosaAceita ? (
                    <span className="text-muted-foreground">R$ 0,00</span>
                  ) : editingValorRecurso?.id === row.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-6 w-20 text-xs"
                        value={editingValorRecurso!.value}
                        onChange={(e) => setEditingValorRecurso({ ...editingValorRecurso!, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSalvarValorRecurso()}
                        onBlur={handleSalvarValorRecurso}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span className="cursor-pointer text-blue-600 hover:underline" onClick={(e) => { e.stopPropagation(); setEditingValorRecurso({ id: row.id, value: String(row.valorRecurso), fonte: row.fonte }); }}>
                      {formatCurrency(row.valorRecurso)}
                    </span>
                  )}
                </td>
                <td className="p-2 text-center">
                  {row.glosaAceita ? (
                    <Badge variant="destructive" className="text-xs cursor-pointer" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: false, fonte: row.fonte, estabelecimentoId, guia: expandedGuia || row.guia }); }}>
                      <Ban className="h-3 w-3 mr-1" /> Aceita
                    </Badge>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: true, fonte: row.fonte, estabelecimentoId, guia: expandedGuia || row.guia }); }}>
                      <Check className="h-3 w-3 mr-1" /> Aceitar
                    </Button>
                  )}
                  {row.glosaAceitaPor && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {row.glosaAceitaPor.includes('Aceite Auto') && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-semibold border border-purple-200">
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Auto
                        </span>
                      )}
                      {row.glosaAceitaPor}
                    </div>
                  )}
                </td>
                <td className="p-2">
                  {editingJustificativa?.id === row.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-6 text-xs"
                        value={editingJustificativa!.value}
                        onChange={(e) => setEditingJustificativa({ ...editingJustificativa!, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSalvarJustificativa()}
                        onBlur={handleSalvarJustificativa}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span
                      className={`cursor-pointer hover:underline ${row.justificativa ? 'text-green-700' : 'text-muted-foreground italic'}`}
                      onClick={(e) => { e.stopPropagation(); setEditingJustificativa({ id: row.id, value: row.justificativa || '', fonte: row.fonte }); }}
                    >
                      {row.justificativa || 'Clique para adicionar'} ✏️
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
