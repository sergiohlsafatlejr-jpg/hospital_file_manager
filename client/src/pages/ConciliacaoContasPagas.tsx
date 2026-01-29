import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  Search, 
  Filter, 
  Download, 
  Eye,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  Building2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";
import { GLOSAS_TISS, traduzirMotivoGlosa } from "../../../shared/glossaryGlosas";

export default function ConciliacaoContasPagas() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // Filtros - Ano e Mês separados
  const [anoFiltro, setAnoFiltro] = useState("");
  const [mesFiltro, setMesFiltro] = useState("");
  const [convenioFiltro, setConvenioFiltro] = useState("todos");
  const [contaFiltro, setContaFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  // Modal de detalhes
  const [contaSelecionada, setContaSelecionada] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  // Ordenação
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'valorFaturado', direcao: 'desc' });

  // Query de competências disponíveis
  const { data: competenciasDisponiveis } = trpc.faturadoTasy.competenciasDisponiveis.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  // Extrair anos e meses únicos das competências
  const { anosDisponiveis, mesesPorAno } = useMemo(() => {
    if (!competenciasDisponiveis) return { anosDisponiveis: [], mesesPorAno: {} as Record<string, { mes: string; total: number }[]> };
    
    const anosSet = new Set<string>();
    const mesesPorAnoMap: Record<string, Map<string, number>> = {};
    
    competenciasDisponiveis.forEach((c: any) => {
      const match = c.competencia?.match(/(\d{4})-(\d{2})/);
      if (match) {
        const ano = match[1];
        const mes = match[2];
        anosSet.add(ano);
        
        if (!mesesPorAnoMap[ano]) {
          mesesPorAnoMap[ano] = new Map();
        }
        mesesPorAnoMap[ano].set(mes, (mesesPorAnoMap[ano].get(mes) || 0) + c.total);
      }
    });
    
    const anos = Array.from(anosSet).sort((a, b) => b.localeCompare(a)); // Mais recente primeiro
    
    const mesesPorAnoResult: Record<string, { mes: string; total: number }[]> = {};
    for (const [ano, mesesMap] of Object.entries(mesesPorAnoMap)) {
      mesesPorAnoResult[ano] = Array.from(mesesMap.entries())
        .map(([mes, total]) => ({ mes, total }))
        .sort((a, b) => b.mes.localeCompare(a.mes)); // Mais recente primeiro
    }
    
    return { anosDisponiveis: anos, mesesPorAno: mesesPorAnoResult };
  }, [competenciasDisponiveis]);

  // Meses disponíveis para o ano selecionado
  const mesesDisponiveis = useMemo(() => {
    if (!anoFiltro || anoFiltro === "todos") return [];
    return mesesPorAno[anoFiltro] || [];
  }, [anoFiltro, mesesPorAno]);

  // Construir competência para filtro baseado em ano e mês selecionados
  const competenciaFiltro = useMemo(() => {
    if (!anoFiltro || anoFiltro === "todos") return undefined;
    if (!mesFiltro || mesFiltro === "todos") {
      // Filtrar por ano apenas - retorna a primeira competência do ano
      return competenciasDisponiveis
        ?.filter((c: any) => c.competencia?.startsWith(anoFiltro))
        .map((c: any) => c.competencia)[0];
    }
    // Filtrar por ano e mês
    return `${anoFiltro}-${mesFiltro}-01 00:00:00`;
  }, [anoFiltro, mesFiltro, competenciasDisponiveis]);

  // Query de conciliação usando endpoint do faturadoTasy
  const { data: conciliacao, isLoading, refetch } = trpc.faturadoTasy.conciliacao.useQuery(
    {
      estabelecimentoId,
      competencia: competenciaFiltro || undefined,
      convenio: convenioFiltro !== "todos" ? convenioFiltro : undefined,
      conta: contaFiltro || undefined,
      status: statusFiltro !== "todos" ? statusFiltro as any : undefined,
      limite: 500,
    },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de convênios
  const { data: convenios } = trpc.faturadoTasy.convenios.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de itens da conta selecionada
  const { data: itensConta, isLoading: isLoadingItens } = trpc.faturadoTasy.itensPorConta.useQuery(
    {
      estabelecimentoId,
      conta: contaSelecionada || "",
      competencia: competenciaFiltro && competenciaFiltro !== "todos" ? competenciaFiltro : undefined,
      convenio: convenioFiltro !== "todos" ? convenioFiltro : undefined,
    },
    { enabled: !!contaSelecionada && estabelecimentoId > 0 }
  );

  // Filtrar e ordenar contas
  const contasFiltradas = useMemo(() => {
    if (!conciliacao?.contas) return [];

    let resultado = [...conciliacao.contas];

    // Filtro por busca
    if (busca) {
      const termoBusca = busca.toLowerCase();
      resultado = resultado.filter(c =>
        c.conta?.toLowerCase().includes(termoBusca) ||
        c.convenio?.toLowerCase().includes(termoBusca) ||
        c.atendimento?.toLowerCase().includes(termoBusca) ||
        c.profExec?.toLowerCase().includes(termoBusca)
      );
    }

    // Ordenação
    resultado.sort((a, b) => {
      let valorA: any, valorB: any;
      
      switch (ordenacao.campo) {
        case 'valorFaturado':
          valorA = a.valorFaturado;
          valorB = b.valorFaturado;
          break;
        case 'valorPago':
          valorA = a.valorPago;
          valorB = b.valorPago;
          break;
        case 'valorGlosado':
          valorA = a.valorGlosado;
          valorB = b.valorGlosado;
          break;
        case 'conta':
          valorA = a.conta || '';
          valorB = b.conta || '';
          break;
        case 'competencia':
          valorA = a.competencia || '';
          valorB = b.competencia || '';
          break;
        default:
          valorA = a.valorFaturado;
          valorB = b.valorFaturado;
      }

      if (ordenacao.direcao === 'asc') {
        return valorA > valorB ? 1 : -1;
      }
      return valorA < valorB ? 1 : -1;
    });

    return resultado;
  }, [conciliacao?.contas, busca, ordenacao]);

  // Funções auxiliares
  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  };

  const formatarCompetencia = (comp: string | null) => {
    if (!comp) return '-';
    // Formato esperado: "2025-01-01 00:00:00" ou "2025-01"
    const matchYMD = comp.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (matchYMD) {
      return `${matchYMD[2]}/${matchYMD[1]}`;
    }
    const matchYM = comp.match(/(\d{4})-(\d{2})$/);
    if (matchYM) {
      return `${matchYM[2]}/${matchYM[1]}`;
    }
    return comp;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pago':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Pago</Badge>;
      case 'parcial':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600"><AlertCircle className="w-3 h-3 mr-1" /> Parcial</Badge>;
      case 'glosado':
        return <Badge className="bg-red-500 hover:bg-red-600"><XCircle className="w-3 h-3 mr-1" /> Glosado</Badge>;
      case 'pendente':
        return <Badge className="bg-gray-500 hover:bg-gray-600"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const alternarOrdenacao = (campo: string) => {
    if (ordenacao.campo === campo) {
      setOrdenacao({ campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' });
    } else {
      setOrdenacao({ campo, direcao: 'desc' });
    }
  };

  const abrirDetalhes = (conta: string) => {
    setContaSelecionada(conta);
    setModalAberto(true);
  };

  // Exportar para Excel
  const exportarExcel = () => {
    if (!contasFiltradas.length) return;

    // Dados das contas
    const dadosContas = contasFiltradas.map(c => ({
      'Conta': c.conta || '-',
      'Competência': formatarCompetencia(c.competencia),
      'Convênio': c.convenio || '-',
      'Atendimento': c.atendimento || '-',
      'Protocolo': c.protocolo || '-',
      'Setor': c.setor || '-',
      'Profissional': c.profExec || '-',
      'Total Itens': c.totalItens,
      'Valor Faturado': c.valorFaturado,
      'Valor Pago': c.valorPago,
      'Valor Glosado': c.valorGlosado,
      'Valor Pendente': c.valorPendente,
      'Status': c.status
    }));

    const wb = XLSX.utils.book_new();
    
    // Aba de resumo
    const wsResumo = XLSX.utils.json_to_sheet([{
      'Total Contas': conciliacao?.resumo.totalContas || 0,
      'Total Faturado': conciliacao?.resumo.totalFaturado || 0,
      'Total Pago': conciliacao?.resumo.totalPago || 0,
      'Total Glosado': conciliacao?.resumo.totalGlosado || 0,
      'Total Pendente': conciliacao?.resumo.totalPendente || 0,
      'Contas Pagas': conciliacao?.resumo.contasPagas || 0,
      'Contas Parciais': conciliacao?.resumo.contasParciais || 0,
      'Contas Glosadas': conciliacao?.resumo.contasGlosadas || 0,
      'Contas Pendentes': conciliacao?.resumo.contasPendentes || 0
    }]);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    // Aba de contas
    const wsContas = XLSX.utils.json_to_sheet(dadosContas);
    XLSX.utils.book_append_sheet(wb, wsContas, 'Contas');

    XLSX.writeFile(wb, `conciliacao_contas_pagas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Exportar itens de uma conta específica para Excel
  const exportarItensConta = () => {
    if (!itensConta || !itensConta.itens.length) return;

    // Dados do cabeçalho da conta
    const dadosConta = [{
      'Conta': contaSelecionada || '-',
      'Convênio': itensConta.convenio || '-',
      'Competência': formatarCompetencia(itensConta.competencia),
      'Atendimento': itensConta.atendimento || '-',
      'Protocolo': itensConta.protocolo || '-',
      'Setor': itensConta.setor || '-',
      'Profissional': itensConta.profExec || '-',
      'Total Faturado': itensConta.valorFaturadoTotal,
      'Total Pago': itensConta.valorPagoTotal,
      'Total Glosado': itensConta.valorGlosadoTotal,
    }];

    // Dados dos itens
    const dadosItens = itensConta.itens.map((item: any) => ({
      'Tipo': item.tipoItem || '-',
      'Código': item.cdItem || '-',
      'Código TUSS': item.cdItemTuss || '-',
      'Descrição': item.descricao || '-',
      'Quantidade': item.qtd || 0,
      'Valor Faturado': item.vlFaturado || 0,
      'Valor Pago': item.vlPago || 0,
      'Valor Glosa': item.vlGlosa || 0,
      'Motivo Glosa': item.motivoGlosa || '-',
      'Data Item': item.dtItem || '-',
      'Retorno': item.retorno || '-',
    }));

    const wb = XLSX.utils.book_new();
    
    // Aba de resumo da conta
    const wsResumo = XLSX.utils.json_to_sheet(dadosConta);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Conta');

    // Aba de itens
    const wsItens = XLSX.utils.json_to_sheet(dadosItens);
    XLSX.utils.book_append_sheet(wb, wsItens, 'Itens');

    XLSX.writeFile(wb, `itens_conta_${contaSelecionada}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!estabelecimentoId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Selecione um estabelecimento para visualizar a conciliação.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-7 h-7 text-primary" />
              Conciliação Contas Pagas
            </h1>
            <p className="text-muted-foreground">Visualização de contas pagas do Tasy agrupadas por conta (dados do FaturadoTasy)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={exportarExcel} disabled={!contasFiltradas.length}>
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
        ) : conciliacao?.resumo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Total Faturado</p>
                    <p className="text-2xl font-bold">{formatarMoeda(conciliacao.resumo.totalFaturado)}</p>
                    <p className="text-xs opacity-70">{conciliacao.resumo.totalContas} contas</p>
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
                    <p className="text-2xl font-bold">{formatarMoeda(conciliacao.resumo.totalPago)}</p>
                    <p className="text-xs opacity-70">
                      {conciliacao.resumo.totalFaturado > 0 
                        ? ((conciliacao.resumo.totalPago / conciliacao.resumo.totalFaturado) * 100).toFixed(1) 
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
                    <p className="text-2xl font-bold">{formatarMoeda(conciliacao.resumo.totalGlosado)}</p>
                    <p className="text-xs opacity-70">
                      {conciliacao.resumo.totalFaturado > 0 
                        ? ((conciliacao.resumo.totalGlosado / conciliacao.resumo.totalFaturado) * 100).toFixed(1) 
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
                    <p className="text-sm opacity-80">Total Pendente</p>
                    <p className="text-2xl font-bold">{formatarMoeda(conciliacao.resumo.totalPendente)}</p>
                    <p className="text-xs opacity-70">
                      {conciliacao.resumo.totalFaturado > 0 
                        ? ((conciliacao.resumo.totalPendente / conciliacao.resumo.totalFaturado) * 100).toFixed(1) 
                        : 0}%
                    </p>
                  </div>
                  <Clock className="w-10 h-10 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Status das Contas</p>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span className="bg-white/20 px-2 py-0.5 rounded">{conciliacao.resumo.contasPagas} Pagas</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded">{conciliacao.resumo.contasParciais} Parciais</span>
                    </div>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span className="bg-white/20 px-2 py-0.5 rounded">{conciliacao.resumo.contasGlosadas} Glosadas</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded">{conciliacao.resumo.contasPendentes} Pendentes</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <Label className="font-semibold text-primary">Ano</Label>
                <Select value={anoFiltro} onValueChange={(v) => { setAnoFiltro(v); setMesFiltro(""); }}>
                  <SelectTrigger className="border-primary">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os anos</SelectItem>
                    {anosDisponiveis.map((ano) => (
                      <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-semibold text-primary">Mês</Label>
                <Select value={mesFiltro} onValueChange={setMesFiltro} disabled={!anoFiltro || anoFiltro === "todos"}>
                  <SelectTrigger className="border-primary">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os meses</SelectItem>
                    {mesesDisponiveis.map((m) => (
                      <SelectItem key={m.mes} value={m.mes}>
                        {new Date(2000, parseInt(m.mes) - 1).toLocaleString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + new Date(2000, parseInt(m.mes) - 1).toLocaleString('pt-BR', { month: 'long' }).slice(1)} ({m.total} itens)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Convênio</Label>
                <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.convenio} value={c.convenio}>{c.convenio}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="glosado">Glosado</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Conta</Label>
                <Input
                  placeholder="Número da conta"
                  value={contaFiltro}
                  onChange={(e) => setContaFiltro(e.target.value)}
                />
              </div>
              <div>
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Conta, convênio, atendimento..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Contas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              Contas ({contasFiltradas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : contasFiltradas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma conta encontrada com os filtros selecionados.</p>
                <p className="text-sm">Importe dados do FaturadoTasy para visualizar a conciliação.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th 
                        className="text-left p-3 font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => alternarOrdenacao('conta')}
                      >
                        <div className="flex items-center gap-1">
                          Conta
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th 
                        className="text-left p-3 font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => alternarOrdenacao('competencia')}
                      >
                        <div className="flex items-center gap-1">
                          Competência
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="text-left p-3 font-medium">Convênio</th>
                      <th className="text-left p-3 font-medium">Atendimento</th>
                      <th className="text-center p-3 font-medium">Itens</th>
                      <th 
                        className="text-right p-3 font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => alternarOrdenacao('valorFaturado')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Faturado
                          {ordenacao.campo === 'valorFaturado' && (
                            ordenacao.direcao === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="text-right p-3 font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => alternarOrdenacao('valorPago')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Pago
                          {ordenacao.campo === 'valorPago' && (
                            ordenacao.direcao === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="text-right p-3 font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => alternarOrdenacao('valorGlosado')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Glosado
                          {ordenacao.campo === 'valorGlosado' && (
                            ordenacao.direcao === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasFiltradas.slice(0, 100).map((conta, index) => (
                      <tr key={`${conta.conta}-${index}`} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div className="font-medium font-mono">{conta.conta || '-'}</div>
                        </td>
                        <td className="p-3 text-sm">{formatarCompetencia(conta.competencia)}</td>
                        <td className="p-3 text-sm max-w-[150px] truncate" title={conta.convenio}>{conta.convenio || '-'}</td>
                        <td className="p-3 text-sm font-mono">{conta.atendimento || '-'}</td>
                        <td className="p-3 text-center">{conta.totalItens}</td>
                        <td className="p-3 text-right font-medium text-blue-600">{formatarMoeda(conta.valorFaturado)}</td>
                        <td className="p-3 text-right font-medium text-green-600">{formatarMoeda(conta.valorPago)}</td>
                        <td className="p-3 text-right font-medium text-red-600">{formatarMoeda(conta.valorGlosado)}</td>
                        <td className="p-3 text-center">{getStatusBadge(conta.status)}</td>
                        <td className="p-3 text-center">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => abrirDetalhes(conta.conta)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {contasFiltradas.length > 100 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Exibindo 100 de {contasFiltradas.length} contas. Use os filtros para refinar a busca.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalhes */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalhes da Conta: {contaSelecionada}
              </DialogTitle>
            </DialogHeader>

            {isLoadingItens ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : itensConta ? (
              <div className="space-y-6">
                {/* Resumo da Conta */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Conta</p>
                      <p className="font-bold">{contaSelecionada || '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Convênio</p>
                      <p className="font-bold">{itensConta.convenio || '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Competência</p>
                      <p className="font-bold">{formatarCompetencia(itensConta.competencia)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Atendimento</p>
                      <p className="font-bold">{itensConta.atendimento || '-'}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Informações adicionais */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Protocolo</p>
                      <p className="font-bold">{itensConta.protocolo || '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Setor</p>
                      <p className="font-bold">{itensConta.setor || '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Profissional</p>
                      <p className="font-bold">{itensConta.profExec || '-'}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-blue-50 dark:bg-blue-950">
                    <CardContent className="p-4">
                      <p className="text-sm text-blue-600 dark:text-blue-400">Valor Faturado</p>
                      <p className="font-bold text-2xl text-blue-700 dark:text-blue-300">
                        {formatarMoeda(itensConta.valorFaturadoTotal)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-950">
                    <CardContent className="p-4">
                      <p className="text-sm text-green-600 dark:text-green-400">Valor Pago</p>
                      <p className="font-bold text-2xl text-green-700 dark:text-green-300">
                        {formatarMoeda(itensConta.valorPagoTotal)}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {itensConta.valorFaturadoTotal > 0 
                          ? ((itensConta.valorPagoTotal / itensConta.valorFaturadoTotal) * 100).toFixed(1) 
                          : 0}% do faturado
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50 dark:bg-red-950">
                    <CardContent className="p-4">
                      <p className="text-sm text-red-600 dark:text-red-400">Valor Glosado</p>
                      <p className="font-bold text-2xl text-red-700 dark:text-red-300">
                        {formatarMoeda(itensConta.valorGlosadoTotal)}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {itensConta.valorFaturadoTotal > 0 
                          ? ((itensConta.valorGlosadoTotal / itensConta.valorFaturadoTotal) * 100).toFixed(1) 
                          : 0}% do faturado
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de Itens */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Itens da Conta ({itensConta.itens.length})</CardTitle>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => exportarItensConta()}
                        disabled={!itensConta.itens.length}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Exportar Itens
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Tipo</th>
                            <th className="text-left p-2 font-medium">Código</th>
                            <th className="text-left p-2 font-medium min-w-[300px]">Descrição</th>
                            <th className="text-center p-2 font-medium">Qtd</th>
                            <th className="text-right p-2 font-medium">Faturado</th>
                            <th className="text-right p-2 font-medium">Pago</th>
                            <th className="text-right p-2 font-medium">Glosado</th>
                            <th className="text-left p-2 font-medium min-w-[150px]">Cód. Glosa</th>
                            <th className="text-left p-2 font-medium min-w-[300px]">Descrição da Glosa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itensConta.itens.map((item: any, index: number) => (
                            <tr key={item.id || index} className={`border-b ${item.vlGlosa > 0 ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                              <td className="p-2">
                                <Badge variant={item.tipoItem === 'PROC/TAXA' ? 'default' : 'secondary'} className="text-xs">
                                  {item.tipoItem}
                                </Badge>
                              </td>
                              <td className="p-2 font-mono text-sm">{item.cdItem || '-'}</td>
                              <td className="p-2 text-sm">{item.descricao || '-'}</td>
                              <td className="p-2 text-center">{item.qtd}</td>
                              <td className="p-2 text-right text-blue-600">{formatarMoeda(item.vlFaturado)}</td>
                              <td className="p-2 text-right text-green-600">{formatarMoeda(item.vlPago)}</td>
                              <td className="p-2 text-right text-red-600">{formatarMoeda(item.vlGlosa)}</td>
                              <td className="p-2 text-sm text-red-600 font-mono">{item.motivoGlosa || '-'}</td>
                              <td className="p-2 text-sm text-red-600">
                                {item.motivoGlosa ? (
                                  <div className="space-y-1">
                                    {(() => {
                                      const descricao = traduzirMotivoGlosa(item.motivoGlosa);
                                      const codigoMatch = item.motivoGlosa.match(/\b(\d{4})\b/);
                                      const glosaInfo = codigoMatch ? GLOSAS_TISS[codigoMatch[1]] : null;
                                      return (
                                        <>
                                          <p className="font-medium">{descricao !== item.motivoGlosa ? descricao : 'Código não encontrado no dicionário'}</p>
                                          {glosaInfo && (
                                            <div className="text-xs space-y-1 mt-1">
                                              <p className="text-muted-foreground"><span className="font-medium">Grupo:</span> {glosaInfo.grupo}</p>
                                              {glosaInfo.probabilidadeSucesso && (
                                                <p className="text-muted-foreground">
                                                  <span className="font-medium">Chance de reverter:</span>{' '}
                                                  <span className={glosaInfo.probabilidadeSucesso >= 60 ? 'text-green-600' : glosaInfo.probabilidadeSucesso >= 40 ? 'text-yellow-600' : 'text-red-600'}>
                                                    {glosaInfo.probabilidadeSucesso}%
                                                  </span>
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para esta conta.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
