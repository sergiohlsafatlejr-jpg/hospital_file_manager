import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ArrowRight
} from "lucide-react";
import { useState, useMemo } from "react";
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
  dataExecucao: string;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  status: "ok" | "divergente" | "glosado" | "nao_encontrado" | "nao_recebido";
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
type Etapa = "selecao_periodo" | "resumo_convenios" | "detalhes_convenio";

export default function Conciliacao() {
  const { estabelecimentoAtual } = useEstabelecimento();
  
  // Estado do fluxo
  const [etapa, setEtapa] = useState<Etapa>("selecao_periodo");
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [anoReferencia, setAnoReferencia] = useState<string>(String(new Date().getFullYear()));
  
  // Estado para detalhes do convênio
  const [convenioId, setConvenioId] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 100;

  // Memoize anos para evitar recriação a cada render
  const anos = useMemo(() => getAnos(), []);

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

  // Buscar conciliação detalhada do convênio selecionado - com paginação
  const { data: conciliacaoData, isLoading: isLoadingConciliacao, refetch } = trpc.conciliacao.porConvenio.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : 0,
      estabelecimentoId: estabelecimentoAtual?.id,
      mesReferencia: mesReferencia ? parseInt(mesReferencia) : undefined,
      anoReferencia: anoReferencia ? parseInt(anoReferencia) : undefined,
      pagina: paginaAtual,
      itensPorPagina,
    },
    { enabled: etapa === "detalhes_convenio" && !!convenioId }
  );

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
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

  // Filtrar itens localmente (busca e status)
  const itensFiltrados = useMemo(() => {
    if (!conciliacaoData?.itens) return [];
    
    return conciliacaoData.itens.filter(item => {
      // Filtro de status
      if (filtroStatus !== "todos" && item.status !== filtroStatus) return false;
      
      // Filtro de busca
      if (busca) {
        const termoBusca = busca.toLowerCase();
        return (
          item.codigo.toLowerCase().includes(termoBusca) ||
          item.descricao.toLowerCase().includes(termoBusca) ||
          item.guiaNumero.toLowerCase().includes(termoBusca) ||
          item.pacienteNome.toLowerCase().includes(termoBusca) ||
          item.motivoGlosa.toLowerCase().includes(termoBusca)
        );
      }
      
      return true;
    });
  }, [conciliacaoData?.itens, filtroStatus, busca]);

  // Agrupar por guia
  const itensAgrupados = useMemo(() => {
    const grupos: { [key: string]: ItemConciliacao[] } = {};
    for (const item of itensFiltrados) {
      const chave = item.guiaNumero || "Sem Guia";
      if (!grupos[chave]) {
        grupos[chave] = [];
      }
      grupos[chave].push(item);
    }
    return grupos;
  }, [itensFiltrados]);

  const handleExportExcel = () => {
    if (!conciliacaoData?.itens || conciliacaoData.itens.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const excelData = conciliacaoData.itens.map(item => ({
      "Guia": item.guiaNumero,
      "Lote": item.numeroLote || "",
      "Data Execução": item.dataExecucao,
      "Código": item.codigo,
      "Descrição": item.descricao,
      "Paciente": item.pacienteNome,
      "Valor Faturado": item.valorFaturado,
      "Valor Pago": item.valorPago,
      "Valor Glosado": item.valorGlosado,
      "Motivo Glosa": item.motivoGlosa,
      "Status": item.status === "ok" ? "OK" : 
               item.status === "divergente" ? "Divergente" :
               item.status === "glosado" ? "Glosado" : 
               item.status === "nao_recebido" ? "Não Recebido" : "Não Encontrado",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 30 },
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
    setEtapa("detalhes_convenio");
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

  // Calcular total de páginas
  const totalPaginas = conciliacaoData?.total ? Math.ceil(conciliacaoData.total / itensPorPagina) : 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conciliação Automática</h1>
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

        {/* ETAPA 3: Detalhes do Convênio */}
        {etapa === "detalhes_convenio" && (
          <>
            {/* Filtros */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  {convenios?.find(c => c.id === parseInt(convenioId))?.nome || "Convênio"}
                  <span className="text-sm font-normal text-muted-foreground">
                    - {MESES.find(m => m.value === mesReferencia)?.label} / {anoReferencia}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="glosado">Glosado</SelectItem>
                        <SelectItem value="divergente">Divergente</SelectItem>
                        <SelectItem value="nao_encontrado">Não Encontrado</SelectItem>
                        <SelectItem value="nao_recebido">Não Recebido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Busca</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Código, guia, paciente..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={handleVoltarResumo}>
                    Voltar ao Resumo
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => refetch()}
                    disabled={isLoadingConciliacao}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingConciliacao ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                  <Button onClick={handleExportExcel} disabled={!conciliacaoData?.itens?.length}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cards de resumo do convênio selecionado */}
            {conciliacaoData?.resumo && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Enviados</p>
                        <p className="text-2xl font-bold">{conciliacaoData.resumo.totalEnviados}</p>
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
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(conciliacaoData.resumo.valorTotalFaturado)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Pago</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(conciliacaoData.resumo.valorTotalPago)}</p>
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
                        <p className="text-lg font-bold text-red-600">{formatCurrency(conciliacaoData.resumo.valorTotalGlosado)}</p>
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
                        <p className="text-lg font-bold text-orange-600">{formatCurrency(conciliacaoData.resumo.valorTotalNaoRecebido || 0)}</p>
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
                        <p className="text-2xl font-bold text-amber-600">{conciliacaoData.resumo.percentualGlosa.toFixed(1)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Divergentes</p>
                        <p className="text-2xl font-bold">{conciliacaoData.resumo.totalDivergentes}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tabela de itens */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Detalhes da Conciliação
                  {conciliacaoData?.total && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({conciliacaoData.total} itens total - Página {paginaAtual} de {totalPaginas})
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Comparação item a item entre valores faturados e pagos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConciliacao ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : itensFiltrados.length > 0 ? (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[120px]">Guia</TableHead>
                            <TableHead className="w-[100px]">Lote</TableHead>
                            <TableHead className="w-[100px]">Data</TableHead>
                            <TableHead className="w-[100px]">Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-[150px]">Paciente</TableHead>
                            <TableHead className="w-[120px] text-right">Faturado</TableHead>
                            <TableHead className="w-[120px] text-right">Pago</TableHead>
                            <TableHead className="w-[120px] text-right">Glosado</TableHead>
                            <TableHead className="w-[200px]">Motivo Glosa</TableHead>
                            <TableHead className="w-[120px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(itensAgrupados).map(([guia, itens]) => (
                            <>
                              {/* Cabeçalho do grupo */}
                              <TableRow key={`header-${guia}`} className="bg-muted/50">
                                <TableCell colSpan={11} className="font-semibold">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Guia: {guia}
                                    <span className="text-muted-foreground font-normal">
                                      ({itens.length} procedimentos)
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {/* Itens do grupo */}
                              {itens.map((item, idx) => (
                                <TableRow 
                                  key={`${guia}-${idx}`}
                                  className={
                                    item.status === "glosado" ? "bg-red-50 dark:bg-red-950/20" :
                                    item.status === "nao_encontrado" ? "bg-gray-50 dark:bg-gray-950/20" :
                                    item.status === "divergente" ? "bg-amber-50 dark:bg-amber-950/20" :
                                    item.status === "nao_recebido" ? "bg-orange-50 dark:bg-orange-950/20" :
                                    ""
                                  }
                                >
                                  <TableCell className="text-muted-foreground text-sm">{item.guiaNumero}</TableCell>
                                  <TableCell className="text-muted-foreground text-sm">{item.numeroLote || "-"}</TableCell>
                                  <TableCell>{item.dataExecucao}</TableCell>
                                  <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                                  <TableCell className="max-w-[300px] truncate" title={item.descricao}>
                                    {item.descricao}
                                  </TableCell>
                                  <TableCell className="max-w-[150px] truncate" title={item.pacienteNome}>
                                    {item.pacienteNome}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatCurrency(item.valorFaturado)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-600">
                                    {formatCurrency(item.valorPago)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-red-600">
                                    {item.valorGlosado > 0 ? formatCurrency(item.valorGlosado) : "-"}
                                  </TableCell>
                                  <TableCell className="max-w-[200px] truncate text-sm" title={item.motivoGlosa}>
                                    {item.motivoGlosa || "-"}
                                  </TableCell>
                                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                                </TableRow>
                              ))}
                            </>
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
                    <p>Nenhum item encontrado para os filtros selecionados.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
