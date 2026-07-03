import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { 
  GitCompare, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Download,
  RefreshCw,
  Loader2,
  TrendingDown,
  DollarSign,
  FileText,
  Search,
  Calendar,
  ArrowRight,
  ChevronLeft,
  Eye,
  AlertCircle,
  CircleCheck,
  CircleMinus
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// Lista de meses em português
const MESES = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

// Gerar lista de anos (últimos 5 anos + ano atual)
const getAnos = () => {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let i = anoAtual; i >= anoAtual - 5; i--) {
    anos.push({ value: String(i), label: String(i) });
  }
  return anos;
};

interface ItemConciliacao {
  guiaNumero: string;
  numeroLote: string;
  sequencialTransacao: string; // Para identificar Alta Administrativa
  protocoloTISS: string; // Para arquivos Excel da Unimed
  dataExecucao: string;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  status: "ok" | "divergente" | "glosado" | "nao_encontrado" | "nao_recebido";
  arquivoId?: number | null;
}

interface ContaConciliacao {
  chave: string; // Chave composta para identificação única
  guiaNumero: string;
  numeroLote: string;
  sequencialTransacao: string; // Para identificar Alta Administrativa
  protocoloTISS: string; // Para arquivos Excel da Unimed
  pacienteNome: string;
  dataExecucao: string;
  valorTotalFaturado: number;
  valorTotalRecebido: number;
  valorTotalGlosado: number;
  status: "ok" | "glosado" | "nao_encontrado" | "parcial";
  totalItens: number;
  isAltaAdministrativa: boolean; // Indica se a guia tem múltiplas transações
  itens: ItemConciliacao[];
}

interface ResumoConciliacao {
  convenioId: number;
  convenioNome: string;
  totalEnviados: number;
  totalRetornados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalGlosados: number;
  totalNaoRecebidos: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalGlosado: number;
  valorTotalNaoRecebido: number;
  percentualGlosa: number;
}

// Etapas do fluxo
type Etapa = "selecao_periodo" | "resumo_convenios" | "lista_contas";

export default function Conciliacao() {
  const [, setLocation] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  
  // Estado do fluxo
  const [etapa, setEtapa] = useState<Etapa>("selecao_periodo");
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [anoReferencia, setAnoReferencia] = useState<string>(String(new Date().getFullYear()));
  
  // Estado para lista de contas
  const [convenioId, setConvenioId] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 50;

  // Estado para modal de detalhes da conta
  const [contaSelecionada, setContaSelecionada] = useState<ContaConciliacao | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  // Memoize anos para evitar recriação a cada render
  const anos = useMemo(() => getAnos(), []);

  // Restaurar estado a partir dos parâmetros da URL (quando voltar da tela de detalhes)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const convenioParam = urlParams.get("convenio");
    const mesParam = urlParams.get("mes");
    const anoParam = urlParams.get("ano");
    
    if (convenioParam && mesParam && anoParam) {
      // Restaurar estado para mostrar a lista de contas do convênio
      setConvenioId(convenioParam);
      setMesReferencia(mesParam);
      setAnoReferencia(anoParam);
      setEtapa("lista_contas");
      
      // Limpar os parâmetros da URL para evitar loop
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar resumo de todos os convênios - só quando tiver mês/ano selecionado
  const { data: resumoGeral, isLoading: isLoadingResumo } = trpc.conciliacao.resumo.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    mesReferencia: mesReferencia ? parseInt(mesReferencia) : undefined,
    anoReferencia: anoReferencia ? parseInt(anoReferencia) : undefined,
  }, {
    enabled: etapa !== "selecao_periodo" && !!mesReferencia && !!anoReferencia,
  });

  // Buscar conciliação agrupada por conta
  const { data: contasData, isLoading: isLoadingContas, refetch } = trpc.conciliacao.agrupadaPorConta.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : 0,
      estabelecimentoId: estabelecimentoAtual?.id,
      mesReferencia: mesReferencia ? parseInt(mesReferencia) : 1,
      anoReferencia: anoReferencia ? parseInt(anoReferencia) : 2024,
      pagina: paginaAtual,
      itensPorPagina,
    },
    { enabled: etapa === "lista_contas" && !!convenioId && !!mesReferencia && !!anoReferencia }
  );

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  // Ícone de status da conta
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CircleCheck className="h-5 w-5 text-green-500" />;
      case "glosado":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "nao_encontrado":
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case "parcial":
        return <CircleMinus className="h-5 w-5 text-orange-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ok":
        return "100% Recebido";
      case "glosado":
        return "Com Glosa";
      case "nao_encontrado":
        return "Não Encontrado";
      case "parcial":
        return "Parcial";
      default:
        return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge className="bg-green-100 text-green-700 border-green-200">OK</Badge>;
      case "divergente":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Divergente</Badge>;
      case "glosado":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Glosado</Badge>;
      case "nao_encontrado":
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Não Encontrado</Badge>;
      case "nao_recebido":
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Não Recebido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Filtrar contas localmente (busca e status)
  const contasFiltradas = useMemo(() => {
    if (!contasData?.contas) return [];
    
    return contasData.contas.filter(conta => {
      // Filtro de status
      if (filtroStatus !== "todos" && conta.status !== filtroStatus) return false;
      
      // Filtro de busca
      if (busca) {
        const termoBusca = busca.toLowerCase();
        return (
          conta.guiaNumero.toLowerCase().includes(termoBusca) ||
          conta.pacienteNome.toLowerCase().includes(termoBusca) ||
          conta.numeroLote.toLowerCase().includes(termoBusca)
        );
      }
      
      return true;
    });
  }, [contasData?.contas, filtroStatus, busca]);

  const handleExportExcel = () => {
    if (!contasData?.contas || contasData.contas.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    // Exportar todas as contas com seus itens
    const excelData: any[] = [];
    
    for (const conta of contasData.contas) {
      for (const item of conta.itens) {
        excelData.push({
          "Conta (Guia)": item.guiaNumero,
          "Lote": item.numeroLote || "",
          "Paciente": item.pacienteNome,
          "Data Execução": item.dataExecucao,
          "Código": item.codigo,
          "Descrição": item.descricao,
          "Valor Faturado": item.valorFaturado,
          "Valor Pago": item.valorPago,
          "Valor Glosado": item.valorGlosado,
          "Motivo Glosa": item.motivoGlosa,
          "Status": item.status === "ok" ? "OK" : 
                   item.status === "divergente" ? "Divergente" :
                   item.status === "glosado" ? "Glosado" : 
                   item.status === "nao_recebido" ? "Não Recebido" : "Não Encontrado",
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 50 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Conciliação");
    
    const convenioNome = convenios?.find(c => c.id === parseInt(convenioId))?.nome || "convenio";
    const mesNome = MESES.find(m => m.value === mesReferencia)?.label || "";
    XLSX.writeFile(wb, `conciliacao_${convenioNome}_${mesNome}_${anoReferencia}.xlsx`);
    toast.success("Arquivo exportado com sucesso!");
  };

  const handleIniciarConciliacao = () => {
    if (!mesReferencia || !anoReferencia) {
      toast.error("Selecione o mês e ano de referência");
      return;
    }
    setEtapa("resumo_convenios");
  };

  const handleSelecionarConvenio = (convId: string) => {
    setConvenioId(convId);
    setPaginaAtual(1);
    setEtapa("lista_contas");
  };

  const handleVoltarResumo = () => {
    setConvenioId("");
    setFiltroStatus("todos");
    setBusca("");
    setPaginaAtual(1);
    setEtapa("resumo_convenios");
  };

  const handleVoltarSelecao = () => {
    setConvenioId("");
    setFiltroStatus("todos");
    setBusca("");
    setPaginaAtual(1);
    setEtapa("selecao_periodo");
  };

  const handleAbrirDetalhes = (conta: ContaConciliacao) => {
    // Navegar para a tela de detalhes da conta
    // Usa a chave composta para identificar corretamente a transação (especialmente em Altas Administrativas)
    const guiaEncoded = encodeURIComponent(conta.guiaNumero || "sem-guia");
    const chaveEncoded = encodeURIComponent(conta.chave || `${conta.guiaNumero}_${conta.numeroLote}_${conta.sequencialTransacao}`);
    setLocation(`/conciliacao/${convenioId}/${guiaEncoded}?mes=${mesReferencia}&ano=${anoReferencia}&chave=${chaveEncoded}`);
  };

  // Calcular total de páginas
  const totalPaginas = contasData?.total ? Math.ceil(contasData.total / itensPorPagina) : 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Conciliação Automática</h1>
          <p className="text-muted-foreground">
            Compare automaticamente os arquivos XML enviados com os retornos dos convênios
          </p>
        </div>

        {/* ETAPA 1: Seleção de Período */}
        {etapa === "selecao_periodo" && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Selecione o Período de Referência</CardTitle>
              <CardDescription>
                Escolha o mês e ano para visualizar a conciliação dos convênios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mês de Referência</label>
                  <Select value={mesReferencia} onValueChange={setMesReferencia}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((mes) => (
                        <SelectItem key={mes.value} value={mes.value}>
                          {mes.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Ano de Referência</label>
                  <Select value={anoReferencia} onValueChange={setAnoReferencia}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {anos.map((ano) => (
                        <SelectItem key={ano.value} value={ano.value}>
                          {ano.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleIniciarConciliacao}
                disabled={!mesReferencia || !anoReferencia}
              >
                Visualizar Conciliação
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ETAPA 2: Resumo por Convênio */}
        {etapa === "resumo_convenios" && (
          <div className="space-y-4">
            {/* Indicador de período */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <Calendar className="h-5 w-5" />
                    <span className="font-medium">
                      Período: {MESES.find(m => m.value === mesReferencia)?.label} / {anoReferencia}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleVoltarSelecao}>
                    Alterar Período
                  </Button>
                </div>
              </CardContent>
            </Card>

            <h2 className="text-xl font-semibold">Resumo por Convênio</h2>
            {isLoadingResumo ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : resumoGeral && resumoGeral.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {resumoGeral.map((resumo: ResumoConciliacao) => (
                  <Card 
                    key={resumo.convenioId} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleSelecionarConvenio(String(resumo.convenioId))}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{resumo.convenioNome}</CardTitle>
                      <CardDescription>
                        {resumo.totalEnviados} enviados • {resumo.totalRetornados} retornados
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Faturado</p>
                          <p className="font-semibold text-blue-600">{formatCurrency(resumo.valorTotalFaturado)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Pago</p>
                          <p className="font-semibold text-green-600">{formatCurrency(resumo.valorTotalPago)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Glosado</p>
                          <p className="font-semibold text-red-600">{formatCurrency(resumo.valorTotalGlosado)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">% Glosa</p>
                          <p className="font-semibold text-amber-600">{resumo.percentualGlosa.toFixed(1)}%</p>
                        </div>
                      </div>
                      {resumo.totalNaoRecebidos > 0 && (
                        <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-950 rounded border border-orange-200 dark:border-orange-800">
                          <p className="text-xs text-orange-700 dark:text-orange-300">
                            {resumo.totalNaoRecebidos} itens não recebidos ({formatCurrency(resumo.valorTotalNaoRecebido || 0)})
                          </p>
                        </div>
                      )}
                      <div className="mt-4 flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-green-600">{resumo.totalConciliados} OK</Badge>
                        <Badge variant="outline" className="text-red-600">{resumo.totalGlosados} Glosados</Badge>
                        <Badge variant="outline" className="text-amber-600">{resumo.totalDivergentes} Divergentes</Badge>
                        {resumo.totalNaoRecebidos > 0 && (
                          <Badge variant="outline" className="text-orange-600">{resumo.totalNaoRecebidos} Não Recebidos</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum dado de conciliação disponível para o período selecionado.</p>
                  <p className="text-sm mt-2">Importe arquivos XML (enviados) e Excel (retornados) do mesmo convênio para iniciar a conciliação.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ETAPA 3: Lista de Contas */}
        {etapa === "lista_contas" && (
          <>
            {/* Header com filtros */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={handleVoltarResumo}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <GitCompare className="h-5 w-5" />
                      {convenios?.find(c => c.id === parseInt(convenioId))?.nome || "Convênio"}
                    </CardTitle>
                    <CardDescription>
                      {MESES.find(m => m.value === mesReferencia)?.label} / {anoReferencia}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status da Conta</label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as Contas</SelectItem>
                        <SelectItem value="ok">100% Recebido</SelectItem>
                        <SelectItem value="glosado">Com Glosa</SelectItem>
                        <SelectItem value="nao_encontrado">Não Encontrado</SelectItem>
                        <SelectItem value="parcial">Parcial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Buscar Conta</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Número da guia, paciente, lote..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => refetch()}
                    disabled={isLoadingContas}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingContas ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                  <Button onClick={handleExportExcel} disabled={!contasData?.contas?.length}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cards de resumo */}
            {contasData?.resumo && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Total Contas</p>
                        <p className="text-2xl font-bold">{contasData.total}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Faturado</p>
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(contasData.resumo.valorTotalFaturado)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Recebido</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(contasData.resumo.valorTotalPago)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Glosado</p>
                        <p className="text-lg font-bold text-red-600">{formatCurrency(contasData.resumo.valorTotalGlosado)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Não Recebido</p>
                        <p className="text-lg font-bold text-orange-600">{formatCurrency(contasData.resumo.valorTotalNaoRecebido || 0)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">% Glosa</p>
                        <p className="text-2xl font-bold text-amber-600">{contasData.resumo.percentualGlosa.toFixed(1)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Lista de Contas */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Lista de Contas
                  {contasData?.total && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({contasData.total} contas - Página {paginaAtual} de {totalPaginas})
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Clique em uma conta para ver os detalhes dos procedimentos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingContas ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : contasFiltradas.length > 0 ? (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">Status</TableHead>
                            <TableHead className="w-[120px]">Conta (Guia)</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead className="w-[100px]">Data</TableHead>
                            <TableHead className="w-[80px] text-center">Itens</TableHead>
                            <TableHead className="w-[130px] text-right">Faturado</TableHead>
                            <TableHead className="w-[130px] text-right">Recebido</TableHead>
                            <TableHead className="w-[130px] text-right">Glosado</TableHead>
                            <TableHead className="w-[80px]">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contasFiltradas.map((conta) => (
                            <TableRow 
                              key={conta.chave || `${conta.guiaNumero}-${conta.numeroLote}-${conta.sequencialTransacao}`}
                              className={`cursor-pointer hover:bg-muted/50 ${
                                conta.status === "glosado" ? "bg-red-50/50 dark:bg-red-950/20" :
                                conta.status === "nao_encontrado" ? "bg-amber-50/50 dark:bg-amber-950/20" :
                                conta.status === "parcial" ? "bg-orange-50/50 dark:bg-orange-950/20" :
                                ""
                              }`}
                              onClick={() => handleAbrirDetalhes(conta)}
                            >
                              <TableCell>
                                <div className="flex items-center justify-center" title={getStatusLabel(conta.status)}>
                                  {getStatusIcon(conta.status)}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {conta.guiaNumero || "Sem Guia"}
                                  {conta.isAltaAdministrativa && (
                                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                      Alta Adm.
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate" title={conta.pacienteNome}>
                                {conta.pacienteNome}
                              </TableCell>
                              <TableCell>{conta.dataExecucao}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{conta.totalItens}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(conta.valorTotalFaturado)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-green-600">
                                {formatCurrency(conta.valorTotalRecebido)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-red-600">
                                {conta.valorTotalGlosado > 0 ? formatCurrency(conta.valorTotalGlosado) : "-"}
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAbrirDetalhes(conta);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginação */}
                    {totalPaginas > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                          disabled={paginaAtual === 1}
                        >
                          Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Página {paginaAtual} de {totalPaginas}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                          disabled={paginaAtual === totalPaginas}
                        >
                          Próxima
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma conta encontrada para os filtros selecionados.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Modal de Detalhes da Conta */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {contaSelecionada && getStatusIcon(contaSelecionada.status)}
                Detalhes da Conta: {contaSelecionada?.guiaNumero || "Sem Guia"}
              </DialogTitle>
              <DialogDescription>
                Paciente: {contaSelecionada?.pacienteNome} • Data: {contaSelecionada?.dataExecucao}
              </DialogDescription>
            </DialogHeader>

            {contaSelecionada && (
              <div className="space-y-4">
                {/* Resumo da conta */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Valor Faturado</p>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(contaSelecionada.valorTotalFaturado)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Valor Recebido</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(contaSelecionada.valorTotalRecebido)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Valor Glosado</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(contaSelecionada.valorTotalGlosado)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de itens */}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[100px]">Data</TableHead>
                        <TableHead className="w-[110px] text-right">Faturado</TableHead>
                        <TableHead className="w-[110px] text-right">Recebido</TableHead>
                        <TableHead className="w-[110px] text-right">Glosado</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contaSelecionada.itens.map((item, idx) => (
                        <TableRow 
                          key={idx}
                          className={
                            item.status === "glosado" ? "bg-red-50 dark:bg-red-950/20" :
                            item.status === "nao_recebido" ? "bg-orange-50 dark:bg-orange-950/20" :
                            item.status === "divergente" ? "bg-amber-50 dark:bg-amber-950/20" :
                            ""
                          }
                        >
                          <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                          <TableCell className="max-w-[250px]">
                            <div className="truncate" title={item.descricao}>{item.descricao}</div>
                            {item.motivoGlosa && (
                              <div className="text-xs text-red-600 mt-1 truncate" title={item.motivoGlosa}>
                                {item.motivoGlosa}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{item.dataExecucao}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(item.valorFaturado)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{formatCurrency(item.valorPago)}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            {item.valorGlosado > 0 ? formatCurrency(item.valorGlosado) : "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
