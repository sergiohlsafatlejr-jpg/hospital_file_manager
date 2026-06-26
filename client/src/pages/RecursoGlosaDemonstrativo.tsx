import { useState, useMemo, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, ChevronDown, ChevronRight, Sparkles, Copy, Check, Ban, Users, ListTree, Tag, ArrowLeft, FileText, AlertTriangle, DollarSign, TrendingDown, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";

export default function RecursoGlosaDemonstrativo() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const { user } = useAuth();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // States
  const [competencia, setCompetencia] = useState<string>("todas");
  const [convenioId, setConvenioId] = useState<string>("todos");
  const [dataPagto, setDataPagto] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [agrupamento, setAgrupamento] = useState<"guia" | "item" | "motivo">("guia");
  const [expandedGuia, setExpandedGuia] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedMotivo, setExpandedMotivo] = useState<string | null>(null);
  const [editingJustificativa, setEditingJustificativa] = useState<{ id: number; value: string; fonte?: string } | null>(null);
  const [editingValorRecurso, setEditingValorRecurso] = useState<{ id: number; value: string; fonte?: string } | null>(null);
  const [page, setPage] = useState(1);

  // Queries
  const { data: competencias } = trpc.faturamentoUnificado.competenciasDemonstrativo.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );
  const { data: convenios } = trpc.faturamentoUnificado.conveniosDemonstrativo.useQuery(
    { estabelecimentoId, competencia: competencia && competencia !== 'todas' ? competencia : undefined },
    { enabled: !!estabelecimentoId }
  );
  const { data: datasPagamento } = trpc.faturamentoUnificado.datasPagamentoDemonstrativo.useQuery(
    { estabelecimentoId, competencia: competencia && competencia !== 'todas' ? competencia : undefined, convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined },
    { enabled: !!estabelecimentoId }
  );
  const { data: itensGlosados, isLoading, refetch } = trpc.faturamentoUnificado.itensGlosadosDemonstrativo.useQuery(
    {
      estabelecimentoId,
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
      dataPagto: dataPagto && dataPagto !== 'todos' ? dataPagto : undefined,
      agrupamento,
      busca: busca || undefined,
      page,
      pageSize: 50,
    },
    { enabled: !!estabelecimentoId }
  );

  const { data: detalheGuia, refetch: refetchDetalheGuia } = trpc.faturamentoUnificado.itensGlosadosDetalheGuiaDemonstrativo.useQuery(
    {
      estabelecimentoId,
      guia: expandedGuia || "",
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
      dataPagto: dataPagto && dataPagto !== 'todos' ? dataPagto : undefined,
    },
    { enabled: !!expandedGuia && agrupamento === 'guia' }
  );

  const { data: detalheItem, refetch: refetchDetalheItem } = trpc.faturamentoUnificado.itensGlosadosDetalhePorItemDemonstrativo.useQuery(
    {
      estabelecimentoId,
      item: expandedItem || "",
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
      dataPagto: dataPagto && dataPagto !== 'todos' ? dataPagto : undefined,
    },
    { enabled: !!expandedItem && agrupamento === 'item' }
  );

  const { data: detalheMotivo, refetch: refetchDetalheMotivo } = trpc.faturamentoUnificado.itensGlosadosDetalhePorMotivoDemonstrativo.useQuery(
    {
      estabelecimentoId,
      codigoGlosa: expandedMotivo || "",
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
      dataPagto: dataPagto && dataPagto !== 'todos' ? dataPagto : undefined,
    },
    { enabled: !!expandedMotivo && agrupamento === 'motivo' }
  );

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
    onSuccess: () => {
      toast.success("Justificativas geradas com IA!");
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
    gerarIAMutation.mutate({ estabelecimentoId, recebimentoIds: ids });
  };

  const handleReplicar = (justificativa: string, item?: string, codigoGlosa?: string) => {
    if (!justificativa) {
      toast.error("Preencha uma justificativa antes de replicar");
      return;
    }
    replicarMutation.mutate({
      estabelecimentoId,
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
      item,
      codigoGlosa,
      justificativa,
    });
  };

  const handleAceitarTodas = (items: Array<{id: number; fonte: string}>) => {
    if (items.length === 0) return;
    aceitarEmLoteMutation.mutate({ items, aceita: true });
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

  const [, navigate] = useLocation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/analise-glosa')} title="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Recurso Glosa Demonstrativo</h1>
        </div>
        <Badge variant="outline" className="text-xs">Fonte: Demonstrativo XML + Recebimentos Excel</Badge>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Competência</label>
              <Select value={competencia} onValueChange={(v) => { setCompetencia(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Competência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {competencias?.map((c: any) => (
                  <SelectItem key={c.competencia} value={c.competencia}>
                    {c.competencia} ({c.total})
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Convênio</label>
              <Select value={convenioId} onValueChange={(v) => { setConvenioId(v); setPage(1); }}>
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
              <label className="text-xs font-medium text-muted-foreground">Data Pagamento</label>
              <Select value={dataPagto} onValueChange={(v) => { setDataPagto(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Data Pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {datasPagamento?.map((d: any) => (
                  <SelectItem key={d.dataPagto} value={d.dataPagto}>
                    {new Date(d.dataPagto + 'T12:00:00').toLocaleDateString('pt-BR')} ({d.total})
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Busca</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar guia, paciente, item..."
                  className="pl-9"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground flex items-center">
              {itensGlosados ? `${itensGlosados.total} registros` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="rounded-lg border bg-card p-3 flex items-center gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <BarChart3 className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Análise das glosas do período</span>
              </div>
              <div className="flex-1">
                <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                  <div className="bg-purple-600 h-4 rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${Math.max(Math.min(resumo.percentualAnalise || 0, 100), 8)}%` }}>
                    <span className="text-[10px] font-bold text-white">{resumo.percentualAnalise?.toFixed(2) || '0.00'}%</span>
                  </div>
                </div>
              </div>
              {(resumo.percentualAnalise || 0) < 100 && (
                <p className="text-xs text-red-500 font-bold shrink-0">Atenção! Podem haver glosas não submetidas</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tabs de agrupamento */}
      <Tabs value={agrupamento} onValueChange={(v) => { setAgrupamento(v as any); setPage(1); setExpandedGuia(null); setExpandedItem(null); setExpandedMotivo(null); }}>
        <TabsList>
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
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedGuia(expandedGuia === item.guia ? null : item.guia)}>
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
                                  <span className="text-sm font-medium">Itens glosados da guia {item.guia} ({detalheGuia?.length || 0} itens)</span>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => detalheGuia && handleGerarIA(detalheGuia.map((d: any) => d.id))} disabled={gerarIAMutation.isPending}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Gerar com IA
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => detalheGuia && handleAceitarTodas(detalheGuia.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={aceitarEmLoteMutation.isPending}>
                                      <Ban className="h-3 w-3 mr-1" /> Aceitar Todas
                                    </Button>
                                  </div>
                                </div>
                                {renderDetalheTable(detalheGuia || [], 'guia')}
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
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedItem(expandedItem === item.codigo ? null : item.codigo)}>
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
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium">Guias com item {item.codigo} ({detalheItem?.length || 0} ocorrências)</span>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => detalheItem && handleGerarIA(detalheItem.map((d: any) => d.id))} disabled={gerarIAMutation.isPending}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Gerar com IA
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const firstWithJustificativa = detalheItem?.find((d: any) => d.justificativa);
                                      if (firstWithJustificativa) handleReplicar(firstWithJustificativa.justificativa, item.codigo);
                                      else toast.error("Preencha ao menos uma justificativa antes de replicar");
                                    }} disabled={replicarMutation.isPending}>
                                      <Copy className="h-3 w-3 mr-1" /> Replicar em Todas as Contas
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => detalheItem && handleAceitarTodas(detalheItem.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={aceitarEmLoteMutation.isPending}>
                                      <Ban className="h-3 w-3 mr-1" /> Aceitar Todas
                                    </Button>
                                  </div>
                                </div>
                                {renderDetalheTable(detalheItem || [], 'item')}
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
                          <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedMotivo(expandedMotivo === motivoKey ? null : motivoKey)}>
                            <td className="p-2">{expandedMotivo === motivoKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                            <td className="p-2 font-mono text-xs">{item.codigoGlosa === 'SEM_CODIGO' ? '-' : item.codigoGlosa}</td>
                            <td className="p-2">{item.motivoGlosa || 'Não informado'}</td>
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
                                    <span className="text-sm font-medium">Itens com motivo {item.codigoGlosa === 'SEM_CODIGO' ? 'Sem código' : item.codigoGlosa} ({detalheMotivo?.length || 0} ocorrências)</span>
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => detalheMotivo && handleGerarIA(detalheMotivo.map((d: any) => d.id))} disabled={gerarIAMutation.isPending}>
                                        <Sparkles className="h-3 w-3 mr-1" /> Gerar com IA
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => {
                                        const firstWithJustificativa = detalheMotivo?.find((d: any) => d.justificativa);
                                        if (firstWithJustificativa) handleReplicar(firstWithJustificativa.justificativa, undefined, motivoKey);
                                        else toast.error("Preencha ao menos uma justificativa antes de replicar");
                                      }} disabled={replicarMutation.isPending}>
                                        <Copy className="h-3 w-3 mr-1" /> Replicar em Todas as Contas
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => detalheMotivo && handleAceitarTodas(detalheMotivo.filter((d: any) => !d.glosaAceita).map((d: any) => ({ id: d.id, fonte: d.fonte || 'demo' })))} disabled={aceitarEmLoteMutation.isPending}>
                                        <Ban className="h-3 w-3 mr-1" /> Aceitar Todas
                                      </Button>
                                    </div>
                                  </div>
                                  {renderDetalheTable(detalheMotivo || [], 'motivo')}
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
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );

  // Função auxiliar para renderizar tabela de detalhe
  function renderDetalheTable(data: any[], tipo: 'guia' | 'item' | 'motivo') {
    if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-background border-b">
            <tr>
              {tipo !== 'guia' && <th className="p-2 text-left">Guia</th>}
              {tipo !== 'guia' && <th className="p-2 text-left">Paciente</th>}
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
                  {editingValorRecurso?.id === row.id ? (
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
                    <Badge variant="destructive" className="text-xs cursor-pointer" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: false, fonte: row.fonte }); }}>
                      <Ban className="h-3 w-3 mr-1" /> Aceita
                    </Badge>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: true, fonte: row.fonte }); }}>
                      <Check className="h-3 w-3 mr-1" /> Aceitar
                    </Button>
                  )}
                  {row.glosaAceitaPor && <div className="text-[10px] text-muted-foreground">{row.glosaAceitaPor}</div>}
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
