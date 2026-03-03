import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import { 
  Search, Filter, Download, Eye, CheckCircle2, AlertCircle, XCircle, Clock,
  DollarSign, TrendingUp, TrendingDown, FileText, Building2, ArrowUpDown,
  ChevronDown, ChevronUp, RefreshCw, Link2, Database, Loader2, Unlink,
  Zap, RotateCcw, BarChart3, Info
} from "lucide-react";
import * as XLSX from "xlsx";

export default function ConciliacaoCruzada() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // Filtros
  const [competenciaFiltro, setCompetenciaFiltro] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(0);
  const ITENS_POR_PAGINA = 50;

  // Modal de detalhes da guia
  const [guiaSelecionada, setGuiaSelecionada] = useState<{ contaNumero?: string; numeroGuia?: string } | null>(null);
  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);

  // Modal de vinculacao manual
  const [modalVinculacaoAberto, setModalVinculacaoAberto] = useState(false);
  const [buscaVinculacao, setBuscaVinculacao] = useState("");
  const [faturamentoParaVincular, setFaturamentoParaVincular] = useState<any>(null);

  // Modal de resultado da conciliacao
  const [modalResultadoAberto, setModalResultadoAberto] = useState(false);
  const [resultadoConciliacao, setResultadoConciliacao] = useState<any>(null);

  // Query de competencias disponiveis
  const { data: competencias } = trpc.faturamentoUnificado.competencias.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de convenios disponiveis
  const { data: convenios } = trpc.faturamentoUnificado.convenios.useQuery(
    { estabelecimentoId, competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined },
    { enabled: estabelecimentoId > 0 }
  );

  // Query principal - resumo por guia
  const { data: dadosGuias, isLoading, refetch } = trpc.faturamentoUnificado.resumoPorGuia.useQuery(
    {
      estabelecimentoId,
      competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined,
      convenio: convenioFiltro !== "todos" ? convenioFiltro : undefined,
      statusConciliacao: statusFiltro !== "todos" ? statusFiltro : undefined,
      busca: busca || undefined,
      limite: ITENS_POR_PAGINA,
      offset: paginaAtual * ITENS_POR_PAGINA,
    },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de itens da guia selecionada
  const { data: itensGuia, isLoading: isLoadingItens } = trpc.faturamentoUnificado.itensPorGuia.useQuery(
    {
      estabelecimentoId,
      contaNumero: guiaSelecionada?.contaNumero || undefined,
      numeroGuia: guiaSelecionada?.numeroGuia || undefined,
    },
    { enabled: !!guiaSelecionada && estabelecimentoId > 0 }
  );

  // Query de recebimentos candidatos para vinculacao
  const { data: recebimentosCandidatos, isLoading: isLoadingCandidatos } = trpc.faturamentoUnificado.buscarRecebimentosCandidatos.useQuery(
    {
      estabelecimentoId,
      pacienteNome: buscaVinculacao || undefined,
      competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined,
    },
    { enabled: modalVinculacaoAberto && buscaVinculacao.length >= 3 && estabelecimentoId > 0 }
  );

  // Mutations
  const popularTudo = trpc.faturamentoUnificado.popularTudo.useMutation({
    onSuccess: (data) => {
      toast.success(`Faturamento unificado atualizado: ${data.warleine.inseridos} itens Warleine + ${data.xmlTiss.inseridos} itens XML TISS`);
      refetch();
    },
    onError: (err) => toast.error(`Erro ao popular: ${err.message}`),
  });

  const vincularGuia = trpc.faturamentoUnificado.vincularGuia.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.atualizados} itens vinculados com sucesso`);
      setModalVinculacaoAberto(false);
      refetch();
    },
    onError: (err) => toast.error(`Erro ao vincular: ${err.message}`),
  });

  const atualizarStatus = trpc.faturamentoUnificado.atualizarStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado");
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const conciliarAuto = trpc.faturamentoUnificado.conciliarAutomaticamente.useMutation({
    onSuccess: (data) => {
      setResultadoConciliacao(data);
      setModalResultadoAberto(true);
      toast.success(`Conciliacao concluida: ${data.totalConciliados} conciliados, ${data.totalDivergentes} divergentes, ${data.totalNaoRecebidos} nao recebidos`);
      refetch();
    },
    onError: (err) => toast.error(`Erro na conciliacao: ${err.message}`),
  });

  const resetarConc = trpc.faturamentoUnificado.resetarConciliacao.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.resetados} itens resetados para pendente`);
      refetch();
    },
    onError: (err) => toast.error(`Erro ao resetar: ${err.message}`),
  });

  // Funcoes auxiliares
  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  };

  const formatarCompetencia = (comp: string | null) => {
    if (!comp) return '-';
    const match = comp.match(/(\d{4})-(\d{2})/);
    if (match) return `${match[2]}/${match[1]}`;
    return comp;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'conciliado':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Conciliado</Badge>;
      case 'divergente':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600"><AlertCircle className="w-3 h-3 mr-1" /> Divergente</Badge>;
      case 'nao_recebido':
        return <Badge className="bg-red-500 hover:bg-red-600"><XCircle className="w-3 h-3 mr-1" /> Nao Recebido</Badge>;
      case 'pendente':
      default:
        return <Badge className="bg-gray-500 hover:bg-gray-600"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
    }
  };

  const abrirDetalhes = (conta: any) => {
    setGuiaSelecionada({ contaNumero: conta.contaNumero, numeroGuia: conta.numeroGuia });
    setModalDetalhesAberto(true);
  };

  const abrirVinculacao = (conta: any) => {
    setFaturamentoParaVincular(conta);
    setBuscaVinculacao(conta.pacienteNome || "");
    setModalVinculacaoAberto(true);
  };

  const confirmarVinculacao = (recebimento: any) => {
    if (!faturamentoParaVincular) return;
    
    const ids = faturamentoParaVincular.ids ? 
      (typeof faturamentoParaVincular.ids === 'string' ? faturamentoParaVincular.ids.split(',').map(Number) : [faturamentoParaVincular.ids]) :
      [faturamentoParaVincular.id];

    vincularGuia.mutate({
      faturamentoIds: ids,
      recebimentoId: recebimento.id,
      recebimentoOrigem: recebimento.origem || 'excel',
    });
  };

  const executarConciliacaoAutomatica = () => {
    conciliarAuto.mutate({
      estabelecimentoId,
      competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined,
      convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) || undefined : undefined,
    });
  };

  const executarReset = () => {
    if (!confirm("Tem certeza que deseja resetar a conciliacao? Todos os itens voltarao para status 'pendente'.")) return;
    resetarConc.mutate({
      estabelecimentoId,
      competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined,
      convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) || undefined : undefined,
    });
  };

  // Exportar para Excel
  const exportarExcel = () => {
    if (!dadosGuias?.contas?.length) return;

    const dados = dadosGuias.contas.map((c: any) => ({
      'Guia/Conta': c.contaNumero || c.numeroGuia || '-',
      'Paciente': c.pacienteNome || '-',
      'Convenio': c.convenio || '-',
      'Competencia': formatarCompetencia(c.competencia),
      'Origem': c.origemSistema || '-',
      'Total Itens': c.totalItens || 0,
      'Valor Faturado': Number(c.valorTotalFaturado || 0),
      'Valor Pago': Number(c.valorTotalPago || 0),
      'Valor Glosado': Number(c.valorTotalGlosado || 0),
      'Status Conciliacao': c.statusConciliacao || 'pendente',
    }));

    const wb = XLSX.utils.book_new();
    
    if (dadosGuias.resumo) {
      const wsResumo = XLSX.utils.json_to_sheet([{
        'Total Itens': dadosGuias.resumo.totalItens || 0,
        'Total Contas': dadosGuias.resumo.totalContas || 0,
        'Total Faturado': Number(dadosGuias.resumo.totalFaturado || 0),
        'Total Pago': Number(dadosGuias.resumo.totalPago || 0),
        'Total Glosado': Number(dadosGuias.resumo.totalGlosado || 0),
        'Itens Conciliados': dadosGuias.resumo.itensConciliados || 0,
        'Itens Divergentes': dadosGuias.resumo.itensDivergentes || 0,
        'Itens Pendentes': dadosGuias.resumo.itensPendentes || 0,
      }]);
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
    }

    const wsContas = XLSX.utils.json_to_sheet(dados);
    XLSX.utils.book_append_sheet(wb, wsContas, 'Guias');

    // Se tem resultado de conciliacao com divergencias, adicionar aba
    if (resultadoConciliacao?.divergencias?.length) {
      const wsDivergencias = XLSX.utils.json_to_sheet(resultadoConciliacao.divergencias.map((d: any) => ({
        'Guia': d.numeroGuia,
        'Codigo Item': d.codigoItem,
        'Valor Faturado': d.valorFaturado,
        'Valor Recebido': d.valorRecebido,
        'Diferenca': d.diferenca,
      })));
      XLSX.utils.book_append_sheet(wb, wsDivergencias, 'Divergencias');
    }

    XLSX.writeFile(wb, `conciliacao_cruzada_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!estabelecimentoId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Selecione um estabelecimento para visualizar a conciliacao cruzada.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const resumo = dadosGuias?.resumo;
  const contas = dadosGuias?.contas || [];
  const totalPaginas = Math.ceil((dadosGuias?.total || 0) / ITENS_POR_PAGINA);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabecalho */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="w-7 h-7 text-primary" />
              Conciliacao Cruzada
            </h1>
            <p className="text-muted-foreground">Cruzamento do faturamento (Warleine + XML TISS) com recebimentos (Excel + XML retorno)</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => popularTudo.mutate({ estabelecimentoId, competencia: competenciaFiltro !== "todos" ? competenciaFiltro : undefined })}
              disabled={popularTudo.isPending}
            >
              {popularTudo.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              Popular Dados
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/90"
              onClick={executarConciliacaoAutomatica}
              disabled={conciliarAuto.isPending}
            >
              {conciliarAuto.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {conciliarAuto.isPending ? "Conciliando..." : "Conciliar Automaticamente"}
            </Button>
            <Button 
              variant="outline" 
              onClick={executarReset}
              disabled={resetarConc.isPending}
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              {resetarConc.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Resetar
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={exportarExcel} disabled={!contas.length}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Cards de Resumo */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : resumo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Total Faturado</p>
                    <p className="text-2xl font-bold">{formatarMoeda(Number(resumo.totalFaturado))}</p>
                    <p className="text-xs opacity-70">{resumo.totalContas} guias / {resumo.totalItens} itens</p>
                  </div>
                  <DollarSign className="w-10 h-10 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Total Pago</p>
                    <p className="text-2xl font-bold">{formatarMoeda(Number(resumo.totalPago))}</p>
                    <p className="text-xs opacity-70">
                      {Number(resumo.totalFaturado) > 0 
                        ? ((Number(resumo.totalPago) / Number(resumo.totalFaturado)) * 100).toFixed(1) 
                        : 0}%
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Total Glosado</p>
                    <p className="text-2xl font-bold">{formatarMoeda(Number(resumo.totalGlosado))}</p>
                    <p className="text-xs opacity-70">
                      {Number(resumo.totalFaturado) > 0 
                        ? ((Number(resumo.totalGlosado) / Number(resumo.totalFaturado)) * 100).toFixed(1) 
                        : 0}%
                    </p>
                  </div>
                  <TrendingDown className="w-10 h-10 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Pendente</p>
                    <p className="text-2xl font-bold">{formatarMoeda(Number(resumo.totalPendente))}</p>
                    <p className="text-xs opacity-70">{resumo.itensPendentes} itens</p>
                  </div>
                  <Clock className="w-10 h-10 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Status Conciliacao</p>
                    <div className="flex gap-2 mt-1 text-xs flex-wrap">
                      <span className="bg-white/20 px-2 py-0.5 rounded">{resumo.itensConciliados} OK</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded">{resumo.itensDivergentes} Div.</span>
                    </div>
                    <div className="flex gap-2 mt-1 text-xs flex-wrap">
                      <span className="bg-white/20 px-2 py-0.5 rounded">{resumo.itensPendentes} Pend.</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded">{resumo.itensNaoRecebidos} N/R</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label className="font-semibold text-primary">Competencia</Label>
                <Select value={competenciaFiltro} onValueChange={(v) => { setCompetenciaFiltro(v); setPaginaAtual(0); }}>
                  <SelectTrigger className="border-primary">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {competencias?.map((c: any) => (
                      <SelectItem key={c.competencia} value={c.competencia}>
                        {formatarCompetencia(c.competencia)} ({c.total} itens)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Convenio</Label>
                <Select value={convenioFiltro} onValueChange={(v) => { setConvenioFiltro(v); setPaginaAtual(0); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.convenio || c.convenioId} value={c.convenio || String(c.convenioId)}>
                        {c.convenio} ({c.total})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status Conciliacao</Label>
                <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPaginaAtual(0); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="conciliado">Conciliado</SelectItem>
                    <SelectItem value="divergente">Divergente</SelectItem>
                    <SelectItem value="nao_recebido">Nao Recebido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Guia, conta, paciente, convenio..."
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setPaginaAtual(0); }}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Guias */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              Guias / Contas ({dadosGuias?.total || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : contas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma guia encontrada.</p>
                <p className="text-sm mt-2">Clique em "Popular Dados" para importar do Tasy e XML TISS.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">Guia/Conta</th>
                        <th className="text-left p-3 font-medium">Paciente</th>
                        <th className="text-left p-3 font-medium">Convenio</th>
                        <th className="text-left p-3 font-medium">Competencia</th>
                        <th className="text-center p-3 font-medium">Origem</th>
                        <th className="text-center p-3 font-medium">Itens</th>
                        <th className="text-right p-3 font-medium">Faturado</th>
                        <th className="text-right p-3 font-medium">Pago</th>
                        <th className="text-right p-3 font-medium">Glosado</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-center p-3 font-medium">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contas.map((conta: any, index: number) => (
                        <tr key={`${conta.contaNumero || conta.numeroGuia}-${index}`} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <div className="font-medium font-mono text-sm">{conta.contaNumero || conta.numeroGuia || '-'}</div>
                          </td>
                          <td className="p-3 text-sm max-w-[200px] truncate" title={conta.pacienteNome}>
                            {conta.pacienteNome || '-'}
                          </td>
                          <td className="p-3 text-sm max-w-[150px] truncate" title={conta.convenio}>
                            {conta.convenio || '-'}
                          </td>
                          <td className="p-3 text-sm">{formatarCompetencia(conta.competencia)}</td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="text-xs">
                              {conta.origemSistema === 'TASY' ? 'Tasy' : 'XML'}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">{conta.totalItens || 0}</td>
                          <td className="p-3 text-right font-medium text-blue-600">{formatarMoeda(Number(conta.valorTotalFaturado))}</td>
                          <td className="p-3 text-right font-medium text-green-600">{formatarMoeda(Number(conta.valorTotalPago))}</td>
                          <td className="p-3 text-right font-medium text-red-600">{formatarMoeda(Number(conta.valorTotalGlosado))}</td>
                          <td className="p-3 text-center">{getStatusBadge(conta.statusConciliacao || 'pendente')}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => abrirDetalhes(conta)}
                                title="Ver detalhes"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => abrirVinculacao(conta)}
                                title="Vincular com recebimento"
                              >
                                <Link2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginacao */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Pagina {paginaAtual + 1} de {totalPaginas} ({dadosGuias?.total} guias)
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setPaginaAtual(p => Math.max(0, p - 1))}
                        disabled={paginaAtual === 0}
                      >
                        Anterior
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setPaginaAtual(p => Math.min(totalPaginas - 1, p + 1))}
                        disabled={paginaAtual >= totalPaginas - 1}
                      >
                        Proxima
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalhes da Guia */}
        <Dialog open={modalDetalhesAberto} onOpenChange={setModalDetalhesAberto}>
          <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalhes da Guia: {guiaSelecionada?.contaNumero || guiaSelecionada?.numeroGuia}
              </DialogTitle>
            </DialogHeader>

            {isLoadingItens ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : itensGuia && itensGuia.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Codigo</th>
                        <th className="text-left p-2 font-medium min-w-[250px]">Descricao</th>
                        <th className="text-left p-2 font-medium">Tipo</th>
                        <th className="text-center p-2 font-medium">Qtd</th>
                        <th className="text-right p-2 font-medium">Faturado</th>
                        <th className="text-right p-2 font-medium">Pago</th>
                        <th className="text-right p-2 font-medium">Glosado</th>
                        <th className="text-left p-2 font-medium">Data Exec.</th>
                        <th className="text-center p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensGuia.map((item: any, index: number) => (
                        <tr key={item.id || index} className={`border-b ${Number(item.valorGlosado) > 0 ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                          <td className="p-2 font-mono text-sm">{item.codigoItem || '-'}</td>
                          <td className="p-2 text-sm">{item.descricaoItem || '-'}</td>
                          <td className="p-2">
                            <Badge variant="secondary" className="text-xs">{item.tipoItem || '-'}</Badge>
                          </td>
                          <td className="p-2 text-center">{item.quantidade || 1}</td>
                          <td className="p-2 text-right text-blue-600">{formatarMoeda(Number(item.valorFaturado))}</td>
                          <td className="p-2 text-right text-green-600">{formatarMoeda(Number(item.valorPago))}</td>
                          <td className="p-2 text-right text-red-600">{formatarMoeda(Number(item.valorGlosado))}</td>
                          <td className="p-2 text-sm">{item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString('pt-BR') : '-'}</td>
                          <td className="p-2 text-center">{getStatusBadge(item.statusConciliacao || 'pendente')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhum item encontrado para esta guia.</p>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Vinculacao Manual */}
        <Dialog open={modalVinculacaoAberto} onOpenChange={setModalVinculacaoAberto}>
          <DialogContent className="max-w-[800px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Vincular Guia com Recebimento
              </DialogTitle>
            </DialogHeader>

            {faturamentoParaVincular && (
              <div className="space-y-4">
                <Card className="bg-blue-50 dark:bg-blue-950">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Guia/Conta do Faturamento</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      <div><span className="text-muted-foreground">Guia:</span> {faturamentoParaVincular.contaNumero || faturamentoParaVincular.numeroGuia}</div>
                      <div><span className="text-muted-foreground">Paciente:</span> {faturamentoParaVincular.pacienteNome || '-'}</div>
                      <div><span className="text-muted-foreground">Convenio:</span> {faturamentoParaVincular.convenio || '-'}</div>
                      <div><span className="text-muted-foreground">Valor:</span> {formatarMoeda(Number(faturamentoParaVincular.valorTotalFaturado))}</div>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <Label>Buscar recebimento por nome do paciente (min. 3 caracteres)</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Nome do paciente..."
                      value={buscaVinculacao}
                      onChange={(e) => setBuscaVinculacao(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {isLoadingCandidatos ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : recebimentosCandidatos && recebimentosCandidatos.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recebimentosCandidatos.map((rec: any) => (
                      <Card key={`${rec.origem}-${rec.id}`} className="hover:bg-muted/50 cursor-pointer" onClick={() => confirmarVinculacao(rec)}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <div className="font-medium">{rec.nomeBeneficiario || '-'}</div>
                              <div className="text-muted-foreground">
                                Guia: {rec.numeroGuia || '-'} | Codigo: {rec.codigoItem || '-'} | {rec.descricaoItem || '-'}
                              </div>
                              <div className="text-muted-foreground">
                                Pago: <span className="text-green-600 font-medium">{formatarMoeda(Number(rec.valorPago))}</span>
                                {Number(rec.valorGlosa) > 0 && (
                                  <> | Glosa: <span className="text-red-600">{formatarMoeda(Number(rec.valorGlosa))}</span></>
                                )}
                              </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); confirmarVinculacao(rec); }}>
                              <Link2 className="w-4 h-4 mr-1" />
                              Vincular
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : buscaVinculacao.length >= 3 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhum recebimento encontrado para "{buscaVinculacao}".</p>
                ) : (
                  <p className="text-center text-muted-foreground py-4">Digite pelo menos 3 caracteres para buscar.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Resultado da Conciliacao Automatica */}
        <Dialog open={modalResultadoAberto} onOpenChange={setModalResultadoAberto}>
          <DialogContent className="max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Resultado da Conciliacao Automatica
              </DialogTitle>
            </DialogHeader>

            {resultadoConciliacao && (
              <div className="space-y-4">
                {/* Resumo geral */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-blue-50 dark:bg-blue-950">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Processados</p>
                      <p className="text-2xl font-bold text-blue-600">{resultadoConciliacao.totalProcessados}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-950">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Conciliados</p>
                      <p className="text-2xl font-bold text-green-600">{resultadoConciliacao.totalConciliados}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-50 dark:bg-yellow-950">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Divergentes</p>
                      <p className="text-2xl font-bold text-yellow-600">{resultadoConciliacao.totalDivergentes}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50 dark:bg-red-950">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Nao Recebidos</p>
                      <p className="text-2xl font-bold text-red-600">{resultadoConciliacao.totalNaoRecebidos}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Barra de progresso visual */}
                {resultadoConciliacao.totalProcessados > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Distribuicao dos resultados</p>
                    <div className="flex h-6 rounded-full overflow-hidden bg-muted">
                      {resultadoConciliacao.totalConciliados > 0 && (
                        <div 
                          className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                          style={{ width: `${(resultadoConciliacao.totalConciliados / resultadoConciliacao.totalProcessados) * 100}%` }}
                          title={`Conciliados: ${resultadoConciliacao.totalConciliados}`}
                        >
                          {((resultadoConciliacao.totalConciliados / resultadoConciliacao.totalProcessados) * 100).toFixed(0)}%
                        </div>
                      )}
                      {resultadoConciliacao.totalDivergentes > 0 && (
                        <div 
                          className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                          style={{ width: `${(resultadoConciliacao.totalDivergentes / resultadoConciliacao.totalProcessados) * 100}%` }}
                          title={`Divergentes: ${resultadoConciliacao.totalDivergentes}`}
                        >
                          {((resultadoConciliacao.totalDivergentes / resultadoConciliacao.totalProcessados) * 100).toFixed(0)}%
                        </div>
                      )}
                      {resultadoConciliacao.totalNaoRecebidos > 0 && (
                        <div 
                          className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                          style={{ width: `${(resultadoConciliacao.totalNaoRecebidos / resultadoConciliacao.totalProcessados) * 100}%` }}
                          title={`Nao Recebidos: ${resultadoConciliacao.totalNaoRecebidos}`}
                        >
                          {((resultadoConciliacao.totalNaoRecebidos / resultadoConciliacao.totalProcessados) * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Conciliado</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Divergente</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Nao Recebido</span>
                    </div>
                  </div>
                )}

                {/* Detalhes do metodo de matching */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Metodos de Matching Utilizados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Guia + Codigo:</span>
                        <span className="font-medium">{resultadoConciliacao.detalhes?.conciliadosPorGuiaCodigo || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Guia + TUSS:</span>
                        <span className="font-medium">{resultadoConciliacao.detalhes?.conciliadosPorGuiaCodigoTuss || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vinculacao (de-para):</span>
                        <span className="font-medium">{resultadoConciliacao.detalhes?.conciliadosPorVinculacao || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paciente + Codigo:</span>
                        <span className="font-medium">{resultadoConciliacao.detalhes?.conciliadosPorPacienteCodigo || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Top divergencias */}
                {resultadoConciliacao.divergencias && resultadoConciliacao.divergencias.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                        Top Divergencias ({resultadoConciliacao.divergencias.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto max-h-[250px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-background">
                            <tr className="border-b">
                              <th className="text-left p-2">Guia</th>
                              <th className="text-left p-2">Codigo</th>
                              <th className="text-right p-2">Faturado</th>
                              <th className="text-right p-2">Recebido</th>
                              <th className="text-right p-2">Diferenca</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resultadoConciliacao.divergencias.slice(0, 20).map((d: any, i: number) => (
                              <tr key={i} className="border-b hover:bg-muted/50">
                                <td className="p-2 font-mono">{d.numeroGuia}</td>
                                <td className="p-2 font-mono">{d.codigoItem}</td>
                                <td className="p-2 text-right text-blue-600">{formatarMoeda(d.valorFaturado)}</td>
                                <td className="p-2 text-right text-green-600">{formatarMoeda(d.valorRecebido)}</td>
                                <td className={`p-2 text-right font-medium ${d.diferenca > 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                  {formatarMoeda(d.diferenca)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {resultadoConciliacao.divergencias.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Mostrando 20 de {resultadoConciliacao.divergencias.length} divergencias. Exporte para Excel para ver todas.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setModalResultadoAberto(false)}>
                    Fechar
                  </Button>
                  {resultadoConciliacao.divergencias?.length > 0 && (
                    <Button variant="outline" onClick={exportarExcel}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar Divergencias
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
