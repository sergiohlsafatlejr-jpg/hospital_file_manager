import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  FileSearch, 
  Download, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  ArrowLeftRight,
  TrendingDown,
  DollarSign,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Hash,
  Calendar,
  Save,
  History,
  Loader2
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";

// Interface para item do demonstrativo
interface ItemDemonstrativo {
  guia: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  valorInformado: number;
  valorPago: number;
  valorGlosado: number;
  codigoGlosa: string;
  motivoGlosa: string;
  status: string;
}

// Interface para resultado da conciliação
interface ResultadoConciliacao {
  id: number;
  nrInternoConta: string;
  guia: string;
  paciente: string;
  convenio: string;
  dataFaturado: string;
  totalProcedimentos: number;
  totalMatMed: number;
  valorTotalTasy: number;
  valorTotalPago: number;
  valorTotalGlosado: number;
  diferenca: number;
  status: 'ok' | 'glosa' | 'divergencia' | 'nao_encontrado';
  itensDemonstrativo: ItemDemonstrativo[];
}

// Função para formatar data de forma segura
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

export default function ConciliacaoTasy() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, navigate] = useLocation();
  const [convenioId, setConvenioId] = useState<string>("");
  const [mes, setMes] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [expandedContas, setExpandedContas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const pageSize = 20;

  // Mutation para salvar conciliação
  const salvarConciliacaoMutation = trpc.historicoConciliacao.salvar.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Conciliação salva com sucesso!');
        setSalvando(false);
      } else {
        toast.error('Erro ao salvar conciliação');
        setSalvando(false);
      }
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      setSalvando(false);
    },
  });

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({});

  // Buscar contas unificadas do Tasy
  const { data: contasTasy, isLoading: loadingTasy, refetch: refetchContas } = trpc.importacaoTasy.contasUnificadas.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      convenio: convenioId && convenioId !== 'all' ? convenioId : undefined,
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Buscar procedimentos do demonstrativo (arquivos de retorno)
  const { data: procedimentosDemonstrativo, isLoading: loadingDemonstrativo } = trpc.procedimentos.list.useQuery(
    {
      convenioId: convenioId && convenioId !== 'all' ? parseInt(convenioId) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      page: 1,
      pageSize: 50000,
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Realizar conciliação entre Tasy e Demonstrativo
  const resultadosConciliacao = useMemo(() => {
    if (!contasTasy || contasTasy.length === 0) return [];

    const resultados: ResultadoConciliacao[] = [];
    
    // Criar mapa de itens do demonstrativo por guia
    const demonstrativoPorGuia = new Map<string, ItemDemonstrativo[]>();
    
    if (procedimentosDemonstrativo?.items) {
      for (const proc of procedimentosDemonstrativo.items) {
        const guia = proc.guiaNumero || '';
        if (!guia) continue;
        
        if (!demonstrativoPorGuia.has(guia)) {
          demonstrativoPorGuia.set(guia, []);
        }
        
        const dadosExtras = proc.dadosExtras as Record<string, unknown> | undefined;
        demonstrativoPorGuia.get(guia)!.push({
          guia,
          codigo: proc.codigo || '',
          descricao: proc.descricao || '',
          quantidade: proc.quantidade || 1,
          valorInformado: parseFloat(String(dadosExtras?.valorInformado || proc.valorTotal || '0')),
          valorPago: parseFloat(String(dadosExtras?.valorLiberado || proc.valorTotal || '0')),
          valorGlosado: parseFloat(proc.valorGlosado || '0'),
          codigoGlosa: String(dadosExtras?.codigoGlosa || proc.motivoGlosa || ''),
          motivoGlosa: String(dadosExtras?.descricaoGlosa || ''),
          status: parseFloat(proc.valorGlosado || '0') > 0 ? 'glosa' : 'ok',
        });
      }
    }

    // Processar cada conta do Tasy
    for (const conta of contasTasy) {
      const guia = String(conta.guia || '');
      const itensDemonstrativo = demonstrativoPorGuia.get(guia) || [];
      
      // Calcular totais do demonstrativo para esta guia
      const valorTotalPago = itensDemonstrativo.reduce((acc, i) => acc + i.valorPago, 0);
      const valorTotalGlosado = itensDemonstrativo.reduce((acc, i) => acc + i.valorGlosado, 0);
      const valorContaTasy = parseFloat(String(conta.valorTotalConta || '0'));
      const diferenca = valorContaTasy - valorTotalPago;
      
      // Contar itens por status
      const totalItensGlosa = itensDemonstrativo.filter(i => i.status === 'glosa').length;
      
      // Determinar status da conciliação
      let status: ResultadoConciliacao['status'] = 'ok';
      if (itensDemonstrativo.length === 0) {
        status = 'nao_encontrado';
      } else if (totalItensGlosa > 0) {
        status = 'glosa';
      } else if (Math.abs(diferenca) > 0.01) {
        status = 'divergencia';
      }

      resultados.push({
        id: conta.id,
        nrInternoConta: String(conta.nrInternoConta || ''),
        guia: guia,
        paciente: String(conta.paciente || ''),
        convenio: String(conta.convenio || ''),
        dataFaturado: formatDate(conta.dataFaturado),
        totalProcedimentos: Number(conta.totalProcedimentos || 0),
        totalMatMed: Number(conta.totalMatMed || 0),
        valorTotalTasy: valorContaTasy,
        valorTotalPago,
        valorTotalGlosado,
        diferenca,
        status,
        itensDemonstrativo,
      });
    }

    return resultados;
  }, [contasTasy, procedimentosDemonstrativo]);

  // Filtrar resultados
  const resultadosFiltrados = useMemo(() => {
    let filtrados = [...resultadosConciliacao];

    // Filtrar por status
    if (statusFiltro !== 'all') {
      filtrados = filtrados.filter(r => r.status === statusFiltro);
    }

    // Filtrar por busca
    if (searchTerm) {
      const termo = searchTerm.toLowerCase();
      filtrados = filtrados.filter(r => 
        r.guia?.toLowerCase().includes(termo) ||
        r.paciente?.toLowerCase().includes(termo) ||
        r.nrInternoConta?.toLowerCase().includes(termo)
      );
    }

    return filtrados;
  }, [resultadosConciliacao, statusFiltro, searchTerm]);

  // Paginação
  const totalResultados = resultadosFiltrados.length;
  const totalPages = Math.ceil(totalResultados / pageSize);
  const resultadosPaginados = resultadosFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // Estatísticas
  const estatisticas = useMemo(() => {
    const total = resultadosConciliacao.length;
    const ok = resultadosConciliacao.filter(r => r.status === 'ok').length;
    const glosas = resultadosConciliacao.filter(r => r.status === 'glosa').length;
    const divergencias = resultadosConciliacao.filter(r => r.status === 'divergencia').length;
    const naoEncontrados = resultadosConciliacao.filter(r => r.status === 'nao_encontrado').length;
    
    const valorTotalTasy = resultadosConciliacao.reduce((acc, r) => acc + r.valorTotalTasy, 0);
    const valorTotalPago = resultadosConciliacao.reduce((acc, r) => acc + r.valorTotalPago, 0);
    const valorTotalGlosado = resultadosConciliacao.reduce((acc, r) => acc + r.valorTotalGlosado, 0);
    const valorTotalDiferenca = resultadosConciliacao.reduce((acc, r) => acc + r.diferenca, 0);
    const percentualGlosa = valorTotalTasy > 0 ? (valorTotalGlosado / valorTotalTasy) * 100 : 0;

    return {
      total,
      ok,
      glosas,
      divergencias,
      naoEncontrados,
      valorTotalTasy,
      valorTotalPago,
      valorTotalGlosado,
      valorTotalDiferenca,
      percentualGlosa,
    };
  }, [resultadosConciliacao]);

  // Funções auxiliares
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-500">OK</Badge>;
      case 'glosa':
        return <Badge className="bg-red-500">Glosa</Badge>;
      case 'divergencia':
        return <Badge className="bg-yellow-500">Divergência</Badge>;
      case 'nao_encontrado':
        return <Badge className="bg-gray-500">Não Encontrado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const toggleContaExpanded = (contaId: string) => {
    const newExpanded = new Set(expandedContas);
    if (newExpanded.has(contaId)) {
      newExpanded.delete(contaId);
    } else {
      newExpanded.add(contaId);
    }
    setExpandedContas(newExpanded);
  };

  const exportarExcel = () => {
    const dados = resultadosFiltrados.map(r => ({
      'Nr Conta': r.nrInternoConta,
      'Guia': r.guia,
      'Paciente': r.paciente,
      'Convênio': r.convenio,
      'Data Faturado': r.dataFaturado,
      'Procedimentos': r.totalProcedimentos,
      'Mat/Med': r.totalMatMed,
      'Valor Tasy': r.valorTotalTasy,
      'Valor Pago': r.valorTotalPago,
      'Valor Glosado': r.valorTotalGlosado,
      'Diferença': r.diferenca,
      'Status': r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação Tasy');
    XLSX.writeFile(wb, `conciliacao_tasy_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Arquivo Excel exportado com sucesso!');
  };

  const salvarConciliacao = () => {
    if (!estabelecimentoAtual || resultadosConciliacao.length === 0) {
      toast.error('Não há dados para salvar');
      return;
    }

    setSalvando(true);

    // Mapear status para o formato esperado pela API
    const mapStatus = (status: string): 'ok' | 'glosa' | 'divergente' | 'nao_encontrado' => {
      if (status === 'divergencia') return 'divergente';
      return status as 'ok' | 'glosa' | 'divergente' | 'nao_encontrado';
    };

    // Preparar dados para salvar
    const itens = resultadosConciliacao.map(r => ({
      contaTasyId: r.id,
      nrInternoConta: r.nrInternoConta,
      guia: r.guia,
      paciente: r.paciente,
      dataInternacao: r.dataFaturado !== '-' ? r.dataFaturado : undefined,
      valorTasy: r.valorTotalTasy,
      valorPago: r.valorTotalPago,
      valorGlosado: r.valorTotalGlosado,
      valorDiferenca: r.diferenca,
      statusConciliacao: mapStatus(r.status),
      totalProcedimentos: r.totalProcedimentos,
      totalMatMed: r.totalMatMed,
    }));

    salvarConciliacaoMutation.mutate({
      estabelecimentoId: estabelecimentoAtual.id,
      convenioId: convenioId && convenioId !== 'all' ? parseInt(convenioId) : undefined,
      mesReferencia: mes && mes !== 'all' ? parseInt(mes) : undefined,
      anoReferencia: ano && ano !== 'all' ? parseInt(ano) : undefined,
      totalContas: estatisticas.total,
      contasOk: estatisticas.ok,
      contasComGlosa: estatisticas.glosas,
      contasDivergentes: estatisticas.divergencias,
      contasNaoEncontradas: estatisticas.naoEncontrados,
      valorTotalTasy: estatisticas.valorTotalTasy,
      valorTotalPago: estatisticas.valorTotalPago,
      valorTotalGlosado: estatisticas.valorTotalGlosado,
      valorDiferenca: estatisticas.valorTotalDiferenca,
      percentualGlosa: estatisticas.percentualGlosa,
      percentualRecebido: estatisticas.valorTotalTasy > 0 
        ? (estatisticas.valorTotalPago / estatisticas.valorTotalTasy) * 100 
        : 0,
      itens,
    });
  };

  const isLoading = loadingTasy || loadingDemonstrativo;

  // Anos disponíveis para filtro
  const anosDisponiveis = [2024, 2025, 2026];
  const mesesDisponiveis = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Conciliação Tasy</h1>
            <p className="text-muted-foreground">
              Compare os dados faturados no Tasy com os retornos dos convênios
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetchContas()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={exportarExcel} disabled={resultadosFiltrados.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
            <Button 
              variant="outline" 
              onClick={salvarConciliacao} 
              disabled={resultadosConciliacao.length === 0 || salvando}
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {salvando ? 'Salvando...' : 'Salvar Conciliação'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/historico-conciliacao-tasy')}>
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Convênio</label>
                <Select value={convenioId} onValueChange={setConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {convenios?.map((conv) => (
                      <SelectItem key={conv.id} value={String(conv.id)}>
                        {conv.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Mês</label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {mesesDisponiveis.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Ano</label>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {anosDisponiveis.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                    <SelectItem value="glosa">Glosa</SelectItem>
                    <SelectItem value="divergencia">Divergência</SelectItem>
                    <SelectItem value="nao_encontrado">Não Encontrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Guia, paciente, conta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas */}
        {resultadosConciliacao.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="text-2xl font-bold">{estatisticas.total}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Total de Contas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <div className="text-2xl font-bold text-green-600">{estatisticas.ok}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Contas OK</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <div className="text-2xl font-bold text-red-600">{estatisticas.glosas}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Com Glosa</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <div className="text-2xl font-bold text-yellow-600">{estatisticas.divergencias}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Divergências</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-gray-500" />
                    <div className="text-2xl font-bold text-gray-600">{estatisticas.naoEncontrados}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Não Encontrados</p>
                </CardContent>
              </Card>
            </div>

            {/* Resumo de Valores */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    <div className="text-xl font-bold">{formatCurrency(estatisticas.valorTotalTasy)}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Valor Total Tasy</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <div className="text-xl font-bold text-green-600">{formatCurrency(estatisticas.valorTotalPago)}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Valor Total Pago</p>
                </CardContent>
              </Card>
              <Card className={estatisticas.valorTotalGlosado > 0 ? "border-red-200 bg-red-50" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <div className="text-xl font-bold text-red-600">{formatCurrency(estatisticas.valorTotalGlosado)}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Valor Glosado ({estatisticas.percentualGlosa.toFixed(1)}%)
                  </p>
                </CardContent>
              </Card>
              <Card className={estatisticas.valorTotalDiferenca !== 0 ? "border-yellow-200 bg-yellow-50" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-yellow-500" />
                    <div className={`text-xl font-bold ${estatisticas.valorTotalDiferenca > 0 ? 'text-red-600' : estatisticas.valorTotalDiferenca < 0 ? 'text-green-600' : ''}`}>
                      {formatCurrency(estatisticas.valorTotalDiferenca)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Diferença Total</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Tabela de Conciliação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Resultado da Conciliação
            </CardTitle>
            <CardDescription>
              Compare os valores faturados no Tasy com os valores pagos pelos convênios. Clique em uma conta para ver os detalhes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : resultadosPaginados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {contasTasy && contasTasy.length > 0 
                  ? "Nenhuma conta encontrada com os filtros aplicados" 
                  : "Nenhuma conta do Tasy encontrada. Importe os dados do Tasy primeiro."}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {resultadosPaginados.map((resultado) => (
                    <Collapsible
                      key={resultado.id}
                      open={expandedContas.has(String(resultado.id))}
                      onOpenChange={() => toggleContaExpanded(String(resultado.id))}
                    >
                      <div className={`rounded-lg border ${resultado.status === 'glosa' ? 'border-red-200 bg-red-50/50' : resultado.status === 'divergencia' ? 'border-yellow-200 bg-yellow-50/50' : resultado.status === 'nao_encontrado' ? 'border-gray-200 bg-gray-50/50' : ''}`}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                {expandedContas.has(String(resultado.id)) ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div className="font-mono font-bold">{resultado.nrInternoConta}</div>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  {resultado.guia || '-'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {resultado.paciente || '-'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {resultado.dataFaturado}
                                </span>
                                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                  {resultado.totalProcedimentos} proc + {resultado.totalMatMed} mat/med
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-sm font-medium">Tasy: {formatCurrency(resultado.valorTotalTasy)}</div>
                                <div className="text-sm text-green-600">Pago: {formatCurrency(resultado.valorTotalPago)}</div>
                              </div>
                              <div className={`text-right font-bold ${resultado.diferenca > 0.01 ? 'text-red-600' : resultado.diferenca < -0.01 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {formatCurrency(resultado.diferenca)}
                              </div>
                              {getStatusBadge(resultado.status)}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t px-4 pb-4">
                            {resultado.itensDemonstrativo.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Qtd</TableHead>
                                    <TableHead className="text-right">Valor Informado</TableHead>
                                    <TableHead className="text-right">Valor Pago</TableHead>
                                    <TableHead className="text-right">Valor Glosado</TableHead>
                                    <TableHead>Código Glosa</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {resultado.itensDemonstrativo.map((item, index) => (
                                    <TableRow key={index} className={item.status === 'glosa' ? 'bg-red-50' : ''}>
                                      <TableCell className="font-mono">{item.codigo}</TableCell>
                                      <TableCell className="max-w-[200px] truncate">{item.descricao}</TableCell>
                                      <TableCell className="text-right">{item.quantidade}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(item.valorInformado)}</TableCell>
                                      <TableCell className="text-right text-green-600">{formatCurrency(item.valorPago)}</TableCell>
                                      <TableCell className="text-right text-red-600">{formatCurrency(item.valorGlosado)}</TableCell>
                                      <TableCell>{item.codigoGlosa || '-'}</TableCell>
                                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                Nenhum item do demonstrativo encontrado para esta guia
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, totalResultados)} de {totalResultados} contas
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Página {page} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
