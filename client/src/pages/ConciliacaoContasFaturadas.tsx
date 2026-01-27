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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  RefreshCw,
  Package
} from "lucide-react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";

export default function ConciliacaoContasFaturadas() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [, setLocation] = useLocation();

  // Filtros
  const [anoFiltro, setAnoFiltro] = useState("todos");
  const [mesFiltro, setMesFiltro] = useState("todos");
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
  const { data: competencias } = trpc.faturadoTasy.competenciasDisponiveis.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  // Calcular competência a partir de ano e mês selecionados
  // Formato no banco: AAAA-MM-DD (ex: 2025-12-01)
  // Filtro usa apenas AAAA-MM para comparar com LIKE 'AAAA-MM%'
  const competenciaFiltro = useMemo(() => {
    if (anoFiltro === "todos" || mesFiltro === "todos") return undefined;
    return `${anoFiltro}-${mesFiltro}`;
  }, [anoFiltro, mesFiltro]);

  // Extrair anos e meses únicos das competências
  // Formato no banco: AAAA-MM-DD (ex: 2025-12-01)
  const anosDisponiveis = useMemo(() => {
    if (!competencias) return [];
    const anos = new Set<string>();
    competencias.forEach(c => {
      const comp = c.competencia || '';
      // Formato AAAA-MM-DD - extrair os primeiros 4 dígitos
      const matchAno = comp.match(/^(\d{4})/);
      if (matchAno) anos.add(matchAno[1]);
    });
    return Array.from(anos).sort((a, b) => b.localeCompare(a));
  }, [competencias]);

  const mesesDisponiveis = useMemo(() => {
    return [
      { valor: '01', nome: 'Janeiro' },
      { valor: '02', nome: 'Fevereiro' },
      { valor: '03', nome: 'Março' },
      { valor: '04', nome: 'Abril' },
      { valor: '05', nome: 'Maio' },
      { valor: '06', nome: 'Junho' },
      { valor: '07', nome: 'Julho' },
      { valor: '08', nome: 'Agosto' },
      { valor: '09', nome: 'Setembro' },
      { valor: '10', nome: 'Outubro' },
      { valor: '11', nome: 'Novembro' },
      { valor: '12', nome: 'Dezembro' },
    ];
  }, []);

  // Query de convênios disponíveis
  const { data: convenios } = trpc.faturadoTasy.convenios.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de conciliação
  const { data: conciliacao, isLoading, refetch } = trpc.faturadoTasy.conciliacao.useQuery(
    {
      estabelecimentoId,
      competencia: competenciaFiltro,
      convenio: convenioFiltro !== "todos" ? convenioFiltro : undefined,
      conta: contaFiltro || undefined,
      status: statusFiltro !== "todos" ? statusFiltro as any : undefined,
    },
    { enabled: estabelecimentoId > 0 }
  );

  // Query de itens da conta selecionada
  const { data: itensConta, isLoading: isLoadingItens } = trpc.faturadoTasy.itensPorConta.useQuery(
    {
      estabelecimentoId,
      conta: contaSelecionada || "",
      competencia: competenciaFiltro,
      convenio: convenioFiltro !== "todos" ? convenioFiltro : undefined,
    },
    { enabled: !!contaSelecionada && modalAberto }
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
        c.protocolo?.toLowerCase().includes(termoBusca) ||
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
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const formatarCompetencia = (comp: string | null | undefined): string => {
    if (!comp) return '-';
    // Se já está no formato MM/AAAA, retorna como está
    if (/^\d{2}\/\d{4}$/.test(comp)) return comp;
    // Se está no formato AAAA-MM-DD ou AAAA/MM/DD
    const matchYMD = comp.match(/(\d{4})[-\/](\d{2})[-\/]?(\d{2})?/);
    if (matchYMD) {
      return `${matchYMD[2]}/${matchYMD[1]}`;
    }
    // Se está no formato MM-AAAA
    const matchMY = comp.match(/(\d{2})[-](\d{4})/);
    if (matchMY) {
      return `${matchMY[1]}/${matchMY[2]}`;
    }
    // Se está no formato AAAA-MM
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
    // Navegar para a tela de detalhes usando wouter
    setLocation(`/contas-faturadas/${encodeURIComponent(conta)}`);
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

    XLSX.writeFile(wb, `conciliacao_contas_faturadas_${new Date().toISOString().split('T')[0]}.xlsx`);
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
              Contas Faturadas (Tasy)
            </h1>
            <p className="text-muted-foreground">Visualização de contas faturadas do Tasy agrupadas por conta</p>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">Total Contas</span>
                </div>
                <p className="text-2xl font-bold">{conciliacao?.resumo.totalContas || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm">Total Faturado</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">{formatarMoeda(conciliacao?.resumo.totalFaturado || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Total Pago</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{formatarMoeda(conciliacao?.resumo.totalPago || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-sm">Total Glosado</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{formatarMoeda(conciliacao?.resumo.totalGlosado || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Total Pendente</span>
                </div>
                <p className="text-2xl font-bold text-yellow-600">{formatarMoeda(conciliacao?.resumo.totalPendente || 0)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <Label>Ano</Label>
                <Select value={anoFiltro} onValueChange={setAnoFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {anosDisponiveis.map((ano) => (
                      <SelectItem key={ano} value={ano}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mês</Label>
                <Select value={mesFiltro} onValueChange={setMesFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {mesesDisponiveis.map((mes) => (
                      <SelectItem key={mes.valor} value={mes.valor}>
                        {mes.nome}
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
                      <SelectItem key={c.convenio} value={c.convenio}>
                        {c.convenio}
                      </SelectItem>
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
                  placeholder="Buscar conta..."
                  value={contaFiltro}
                  onChange={(e) => setContaFiltro(e.target.value)}
                />
              </div>
              <div>
                <Label>Busca Geral</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Contas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
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
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => alternarOrdenacao('conta')}>
                        <div className="flex items-center gap-1">
                          Conta
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => alternarOrdenacao('competencia')}>
                        <div className="flex items-center gap-1">
                          Competência
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Atendimento</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => alternarOrdenacao('valorFaturado')}>
                        <div className="flex items-center justify-end gap-1">
                          Faturado
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => alternarOrdenacao('valorPago')}>
                        <div className="flex items-center justify-end gap-1">
                          Pago
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => alternarOrdenacao('valorGlosado')}>
                        <div className="flex items-center justify-end gap-1">
                          Glosado
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contasFiltradas.map((conta, index) => (
                      <TableRow key={`${conta.conta}-${index}`} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">{conta.conta || '-'}</TableCell>
                        <TableCell>{formatarCompetencia(conta.competencia)}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={conta.convenio}>
                          {conta.convenio || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{conta.atendimento || '-'}</TableCell>
                        <TableCell className="text-center">{conta.totalItens}</TableCell>
                        <TableCell className="text-right font-medium">{formatarMoeda(conta.valorFaturado)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{formatarMoeda(conta.valorPago)}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">{formatarMoeda(conta.valorGlosado)}</TableCell>
                        <TableCell>{getStatusBadge(conta.status)}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => abrirDetalhes(conta.conta)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalhes da Conta */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                  <div>
                    <p className="text-sm text-muted-foreground">Convênio</p>
                    <p className="font-medium">{itensConta.convenio || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Competência</p>
                    <p className="font-medium">{formatarCompetencia(itensConta.competencia)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Atendimento</p>
                    <p className="font-medium">{itensConta.atendimento || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Protocolo</p>
                    <p className="font-medium">{itensConta.protocolo || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Setor</p>
                    <p className="font-medium">{itensConta.setor || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Profissional</p>
                    <p className="font-medium">{itensConta.profExec || '-'}</p>
                  </div>
                </div>

                {/* Totais */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Faturado</p>
                    <p className="text-xl font-bold text-blue-600">{formatarMoeda(itensConta.valorFaturadoTotal)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Pago</p>
                    <p className="text-xl font-bold text-green-600">{formatarMoeda(itensConta.valorPagoTotal)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Glosado</p>
                    <p className="text-xl font-bold text-red-600">{formatarMoeda(itensConta.valorGlosadoTotal)}</p>
                  </div>
                </div>

                {/* Tabela de Itens */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Itens da Conta ({itensConta.itens.length})
                  </h3>
                  <div className="overflow-x-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Faturado</TableHead>
                          <TableHead className="text-right">Pago</TableHead>
                          <TableHead className="text-right">Glosa</TableHead>
                          <TableHead>Motivo Glosa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensConta.itens.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant={item.tipoItem === 'PROC/TAXA' ? 'default' : 'secondary'} className="text-xs">
                                {item.tipoItem}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.cdItem}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                              {item.descricao}
                            </TableCell>
                            <TableCell className="text-right">{item.qtd}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(item.vlFaturado)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatarMoeda(item.vlPago)}</TableCell>
                            <TableCell className="text-right text-red-600">{formatarMoeda(item.vlGlosa)}</TableCell>
                            <TableCell className="max-w-[150px] truncate" title={item.motivoGlosa}>
                              {item.motivoGlosa || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
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
