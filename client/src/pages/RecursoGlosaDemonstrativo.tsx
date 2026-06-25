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
import { Search, ChevronDown, ChevronRight, Sparkles, Copy, Check, Ban, Users, ListTree, Tag } from "lucide-react";

export default function RecursoGlosaDemonstrativo() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const { user } = useAuth();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // States
  const [competencia, setCompetencia] = useState<string>("");
  const [convenioId, setConvenioId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [agrupamento, setAgrupamento] = useState<"guia" | "item" | "motivo">("guia");
  const [expandedGuia, setExpandedGuia] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedMotivo, setExpandedMotivo] = useState<string | null>(null);
  const [editingJustificativa, setEditingJustificativa] = useState<{ id: number; value: string } | null>(null);
  const [editingValorRecurso, setEditingValorRecurso] = useState<{ id: number; value: string } | null>(null);
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
  const { data: itensGlosados, isLoading, refetch } = trpc.faturamentoUnificado.itensGlosadosDemonstrativo.useQuery(
    {
      estabelecimentoId,
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
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
    },
    { enabled: !!expandedGuia }
  );

  const { data: detalheItem, refetch: refetchDetalheItem } = trpc.faturamentoUnificado.itensGlosadosDetalhePorItemDemonstrativo.useQuery(
    {
      estabelecimentoId,
      item: expandedItem || "",
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
    },
    { enabled: !!expandedItem }
  );

  const { data: detalheMotivo, refetch: refetchDetalheMotivo } = trpc.faturamentoUnificado.itensGlosadosDetalhePorMotivoDemonstrativo.useQuery(
    {
      estabelecimentoId,
      codigoGlosa: expandedMotivo || "",
      competencia: competencia && competencia !== 'todas' ? competencia : undefined,
      convenioId: convenioId && convenioId !== 'todos' ? Number(convenioId) : undefined,
    },
    { enabled: !!expandedMotivo }
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
    });
  };

  const handleSalvarValorRecurso = () => {
    if (!editingValorRecurso) return;
    salvarValorRecursoMutation.mutate({
      recebimentoId: editingValorRecurso.id,
      valor: parseFloat(editingValorRecurso.value) || 0,
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

  const handleAceitarTodas = (ids: number[]) => {
    if (ids.length === 0) return;
    aceitarEmLoteMutation.mutate({ recebimentoIds: ids, aceita: true });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recurso Glosa Demonstrativo</h1>
        <Badge variant="outline" className="text-xs">Fonte: Demonstrativo (Recebimentos Excel)</Badge>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar guia, paciente, item..."
                className="pl-9"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              />
            </div>

            <div className="text-sm text-muted-foreground flex items-center">
              {itensGlosados ? `${itensGlosados.total} registros` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {itensGlosados?.resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Guias</p>
              <p className="text-xl font-bold">{itensGlosados.resumo.totalGuias}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Itens Glosados</p>
              <p className="text-xl font-bold">{itensGlosados.resumo.totalItens}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Valor Faturado</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(itensGlosados.resumo.totalValorFaturado)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Valor Glosa</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(itensGlosados.resumo.totalValorGlosa)}</p>
            </CardContent>
          </Card>
        </div>
      )}

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
                      <th className="p-2 text-left">Data Início</th>
                      <th className="p-2 text-left">Data Fim</th>
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
                      <tr><td colSpan={13} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={13} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
                    ) : items.map((item: any) => (
                      <Fragment key={item.guia}>
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedGuia(expandedGuia === item.guia ? null : item.guia)}>
                          <td className="p-2">{expandedGuia === item.guia ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="p-2 font-mono text-xs">{item.guia}</td>
                          <td className="p-2">{item.paciente}</td>
                          <td className="p-2 text-xs">{formatDate(item.dataInicio)}</td>
                          <td className="p-2 text-xs">{formatDate(item.dataFim)}</td>
                          <td className="p-2">{item.convenio}</td>
                          <td className="p-2 text-right">{item.itensGlosados}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorFaturado))}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorPago))}</td>
                          <td className="p-2 text-right text-red-600 font-medium">{formatCurrency(Number(item.valorGlosa))}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(Number(item.valorRecursado))}</td>
                          <td className="p-2 text-right text-orange-600">{formatCurrency(Number(item.valorGlosaAceita))}</td>
                          <td className="p-2">
                            <Badge variant={item.statusRecurso === 'Finalizado' ? 'default' : item.statusRecurso === 'Iniciado' ? 'secondary' : 'outline'} className="text-xs">
                              {item.statusRecurso}
                            </Badge>
                          </td>
                        </tr>
                        {expandedGuia === item.guia && (
                          <tr key={`${item.guia}-detail`}>
                            <td colSpan={13} className="p-0">
                              <div className="bg-muted/20 p-4 border-b">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium">Itens glosados da guia {item.guia} ({detalheGuia?.length || 0} itens)</span>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => detalheGuia && handleGerarIA(detalheGuia.map((d: any) => d.id))} disabled={gerarIAMutation.isPending}>
                                      <Sparkles className="h-3 w-3 mr-1" /> Gerar com IA
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => detalheGuia && handleAceitarTodas(detalheGuia.filter((d: any) => !d.glosaAceita).map((d: any) => d.id))} disabled={aceitarEmLoteMutation.isPending}>
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
                      <th className="p-2 text-left">Justificativa</th>
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
                    ) : items.map((item: any) => (
                      <Fragment key={item.codigo}>
                        <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedItem(expandedItem === item.codigo ? null : item.codigo)}>
                          <td className="p-2">{expandedItem === item.codigo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="p-2 font-mono text-xs">{item.codigo}</td>
                          <td className="p-2">{item.descricao}</td>
                          <td className="p-2 text-xs text-muted-foreground">{item.justificativasPreenchidas}/{item.itensGlosados} preenchidas</td>
                          <td className="p-2">{item.convenio}</td>
                          <td className="p-2 text-right">{item.itensGlosados}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorFaturado))}</td>
                          <td className="p-2 text-right">{formatCurrency(Number(item.valorPago))}</td>
                        </tr>
                        {expandedItem === item.codigo && (
                          <tr key={`${item.codigo}-detail`}>
                            <td colSpan={8} className="p-0">
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
                                    <Button size="sm" variant="outline" onClick={() => detalheItem && handleAceitarTodas(detalheItem.filter((d: any) => !d.glosaAceita).map((d: any) => d.id))} disabled={aceitarEmLoteMutation.isPending}>
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
                      <th className="p-2 text-right">Valor Glosa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhum item encontrado</td></tr>
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
                            <td className="p-2 text-right text-red-600">{formatCurrency(Number(item.valorGlosa))}</td>
                          </tr>
                          {expandedMotivo === motivoKey && (
                            <tr key={`${motivoKey}-detail`}>
                              <td colSpan={7} className="p-0">
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
                                      <Button size="sm" variant="outline" onClick={() => detalheMotivo && handleAceitarTodas(detalheMotivo.filter((d: any) => !d.glosaAceita).map((d: any) => d.id))} disabled={aceitarEmLoteMutation.isPending}>
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
    if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Carregando...</p>;
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
                        value={editingValorRecurso.value}
                        onChange={(e) => setEditingValorRecurso({ ...editingValorRecurso, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSalvarValorRecurso()}
                        onBlur={handleSalvarValorRecurso}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span className="cursor-pointer text-blue-600 hover:underline" onClick={(e) => { e.stopPropagation(); setEditingValorRecurso({ id: row.id, value: String(row.valorRecurso) }); }}>
                      {formatCurrency(row.valorRecurso)}
                    </span>
                  )}
                </td>
                <td className="p-2 text-center">
                  {row.glosaAceita ? (
                    <Badge variant="destructive" className="text-xs cursor-pointer" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: false }); }}>
                      <Ban className="h-3 w-3 mr-1" /> Aceita
                    </Badge>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); marcarGlosaAceitaMutation.mutate({ recebimentoId: row.id, aceita: true }); }}>
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
                        value={editingJustificativa.value}
                        onChange={(e) => setEditingJustificativa({ ...editingJustificativa, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSalvarJustificativa()}
                        onBlur={handleSalvarJustificativa}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span
                      className={`cursor-pointer hover:underline ${row.justificativa ? 'text-green-700' : 'text-muted-foreground italic'}`}
                      onClick={(e) => { e.stopPropagation(); setEditingJustificativa({ id: row.id, value: row.justificativa || '' }); }}
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
