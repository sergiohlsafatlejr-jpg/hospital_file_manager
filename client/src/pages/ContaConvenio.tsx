import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  FileSearch, 
  Download, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  FileSpreadsheet,
  Eye,
  CreditCard,
  Hash,
  User,
  DollarSign,
  FileText,
  Receipt,
  ExternalLink,
  Package,
  Layers2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Database,
  Loader2,
  Trash2,
  BarChart3,
  ShieldAlert,
  ArrowRight
} from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { formatDateBR } from "@/lib/dateUtils";

// Formatar valor em reais
const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
};

// Formatar data

// Badge de status de análise
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "conforme":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conforme
        </Badge>
      );
    case "divergente":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Divergente
        </Badge>
      );
    case "revisado":
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Eye className="h-3 w-3 mr-1" />
          Revisado
        </Badge>
      );
    default:
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
  }
};

// Badge de origem
const OrigemBadge = ({ origem }: { origem: string }) => {
  if (origem === "BANCO_CLIENTE") {
    return (
      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
        <Database className="h-3 w-3 mr-1" />
        Banco Hospital
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
      <FileText className="h-3 w-3 mr-1" />
      XML
    </Badge>
  );
};

export default function ContaConvenio() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState(urlParams.get("search") || "");
  const [convenioFiltro, setConvenioFiltro] = useState(urlParams.get("convenio") || "");
  const [origemFiltro, setOrigemFiltro] = useState(urlParams.get("origem") || "");
  const [statusFiltro, setStatusFiltro] = useState(urlParams.get("status") || "");
  const [anoFiltro, setAnoFiltro] = useState(urlParams.get("ano") || "");
  const [mesFiltro, setMesFiltro] = useState(urlParams.get("mes") || "");
  const [page, setPage] = useState(parseInt(urlParams.get("page") || "1"));
  const pageSize = 20;

  // Sincronizar filtros com a URL para preservar ao navegar e voltar
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (convenioFiltro) params.set("convenio", convenioFiltro);
    if (origemFiltro) params.set("origem", origemFiltro);
    if (statusFiltro) params.set("status", statusFiltro);
    if (anoFiltro) params.set("ano", anoFiltro);
    if (mesFiltro) params.set("mes", mesFiltro);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const newUrl = qs ? `/conta-convenio?${qs}` : "/conta-convenio";
    window.history.replaceState(null, "", newUrl);
  }, [searchTerm, convenioFiltro, origemFiltro, statusFiltro, anoFiltro, mesFiltro, page]);

  // Buscar competências disponíveis
  const { data: competenciasData } = trpc.contasConvenio.listarCompetencias.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || undefined }
  );

  // Meses do ano para o select
  const nomesMeses = [
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

  // Filtrar meses disponíveis para o ano selecionado
  const mesesDisponiveis = useMemo(() => {
    if (!competenciasData?.meses || !anoFiltro || anoFiltro === "all") return nomesMeses;
    const anoNum = parseInt(anoFiltro);
    const mesesComDados = competenciasData.meses
      .filter(m => m.ano === anoNum)
      .map(m => m.mes);
    return nomesMeses.filter(m => mesesComDados.includes(parseInt(m.value)));
  }, [competenciasData, anoFiltro]);

  // Buscar contas da nova tabela contas_convenio_resumo
  const { data: contasData, isLoading, refetch } = trpc.contasConvenio.listarContas.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || undefined,
      convenio: convenioFiltro && convenioFiltro !== "all" ? convenioFiltro : undefined,
      origem: origemFiltro && origemFiltro !== "all" ? origemFiltro as any : undefined,
      statusAnalise: statusFiltro && statusFiltro !== "all" ? statusFiltro as any : undefined,
      competenciaAno: anoFiltro && anoFiltro !== "all" ? parseInt(anoFiltro) : undefined,
      competenciaMes: mesFiltro && mesFiltro !== "all" ? parseInt(mesFiltro) : undefined,
      search: searchTerm || undefined,
      page,
      pageSize,
    }
  );

  // Buscar convênios disponíveis nas contas
  const { data: conveniosDisponiveis } = trpc.contasConvenio.listarConvenios.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || undefined }
  );

  // Mutation para excluir conta
  const excluirContaMutation = trpc.contasConvenio.excluirConta.useMutation({
    onSuccess: () => {
      toast.success("Conta excluída com sucesso");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Mutation para comparar com padrões
  const compararMutation = trpc.contasConvenio.compararComPadroes.useMutation({
    onSuccess: (result) => {
      if (result.statusGeral === "conforme") {
        toast.success(`Conta conforme! ${result.totalItensAnalisados} itens analisados, nenhuma divergência crítica.`);
      } else {
        toast.warning(`${result.totalDivergencias} divergência(s) encontrada(s) (${result.totalCriticos} crítica(s), ${result.totalAlertas} alerta(s))`);
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Mutation para migrar dados XML para contas_convenio_itens
  const migrarXml = trpc.contasConvenio.migrarDadosXml.useMutation({
    onSuccess: (result) => {
      toast.success(result.mensagem);
      refetch();
    },
    onError: (err) => toast.error(`Erro na migração: ${err.message}`),
  });

  // Calcular totais
  const resumo = contasData?.resumo;
  const totalPages = Math.ceil((contasData?.total || 0) / pageSize);

  // Navegar para detalhes da conta
  const handleVerDetalhes = (conta: any) => {
    const params = new URLSearchParams({
      numeroConta: conta.numeroConta,
      estabelecimentoId: String(conta.estabelecimentoId),
    });
    if (conta.numeroLote) {
      params.set('numeroLote', conta.numeroLote);
    }
    setLocation(`/conta-convenio-detalhes?${params.toString()}`);
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!contasData?.contas?.length) return;

    const data = contasData.contas.map((conta: any) => ({
      "Nº Conta": conta.numeroConta,
      "Convênio": conta.convenio || "-",
      "Paciente": conta.pacienteNome || "-",
      "Carteirinha": conta.carteiraBeneficiario || "-",
      "Origem": conta.origem,
      "Total Itens": conta.totalItens,
      "Valor Total": parseFloat(conta.valorTotal || "0"),
      "Status": conta.statusAnaliseResumo || conta.statusAnalise || "pendente",
      "Divergências": conta.totalDivergencias || 0,
      "Alertas": conta.totalAlertas || 0,
      "Data Busca": formatDateBR(conta.dataBusca || conta.criadoEm),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas Convênio");
    XLSX.writeFile(wb, `contas_convenio_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Limpar filtros
  const handleLimparFiltros = () => {
    setConvenioFiltro("");
    setOrigemFiltro("");
    setStatusFiltro("");
    setAnoFiltro("");
    setMesFiltro("");
    setSearchTerm("");
    setPage(1);
  };

  const temFiltrosAtivos = (convenioFiltro && convenioFiltro !== "all") || 
    (origemFiltro && origemFiltro !== "all") || 
    (statusFiltro && statusFiltro !== "all") || 
    (anoFiltro && anoFiltro !== "all") ||
    (mesFiltro && mesFiltro !== "all") ||
    searchTerm;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Conta Convênio</h1>
            <p className="text-muted-foreground">
              Contas importadas do banco do hospital e XML para análise e comparação com padrões
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => {
                if (!estabelecimentoAtual?.id) {
                  toast.error("Selecione um estabelecimento primeiro");
                  return;
                }
                migrarXml.mutate({ estabelecimentoId: estabelecimentoAtual.id });
              }}
              disabled={migrarXml.isPending || !estabelecimentoAtual?.id}
            >
              {migrarXml.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {migrarXml.isPending ? "Migrando..." : "Importar XMLs"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportExcel}
              disabled={!contasData?.contas?.length}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
              {/* Ano */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ano</label>
                <Select value={anoFiltro} onValueChange={(v) => { setAnoFiltro(v); setMesFiltro(""); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {competenciasData?.anos?.map((ano: number) => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Mês */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mês</label>
                <Select value={mesFiltro} onValueChange={(v) => { setMesFiltro(v); setPage(1); }} disabled={!anoFiltro || anoFiltro === "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
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

              {/* Convênio */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioFiltro} onValueChange={(v) => { setConvenioFiltro(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {conveniosDisponiveis?.map((conv: any) => (
                      <SelectItem key={conv.convenio || "sem"} value={conv.convenio || "sem"}>
                        {conv.convenio || "Sem convênio"} ({conv.totalContas})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Origem */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Origem</label>
                <Select value={origemFiltro} onValueChange={(v) => { setOrigemFiltro(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="BANCO_CLIENTE">Banco Hospital</SelectItem>
                    <SelectItem value="XML">XML</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status Análise</label>
                <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="conforme">Conforme</SelectItem>
                    <SelectItem value="divergente">Divergente</SelectItem>
                    <SelectItem value="revisado">Revisado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Busca */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <div className="relative">
                  <FileSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Conta, paciente, convênio..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Botão Limpar */}
              <div className="space-y-2">
                <label className="text-sm font-medium">&nbsp;</label>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleLimparFiltros}
                  disabled={!temFiltrosAtivos}
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Contas</p>
                  <p className="text-2xl font-bold">{Number(resumo?.totalContas || 0).toLocaleString("pt-BR")}</p>
                </div>
                <Receipt className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(resumo?.valorTotal)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conformes</p>
                  <p className="text-2xl font-bold text-green-600">{Number(resumo?.totalConformes || 0)}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Divergentes</p>
                  <p className="text-2xl font-bold text-red-600">{Number(resumo?.totalDivergentes || 0)}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-600">{Number(resumo?.totalPendentes || 0)}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Contas */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !contasData?.contas?.length ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileSearch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhuma conta encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  Importe contas via Upload de XML ou busque uma conta no banco do hospital.
                </p>
                <Button variant="outline" onClick={() => setLocation("/upload")}>
                  Ir para Upload
                </Button>
              </CardContent>
            </Card>
          ) : (
            contasData.contas.map((conta: any) => {
              const status = conta.statusAnaliseResumo || conta.statusAnalise || "pendente";
              return (
                <Card key={conta.virtualId || conta.id} className={`hover:shadow-md transition-shadow ${
                  status === "divergente" ? "border-l-4 border-l-red-400" : 
                  status === "conforme" ? "border-l-4 border-l-green-400" : ""
                }`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Informações da Conta */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Receipt className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-muted-foreground"># Conta</span>
                            <span className="font-semibold font-mono">{conta.numeroConta}</span>
                            {(conta as any).numeroLote && (
                              <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded" title="Número do lote">
                                Lote {(conta as any).numeroLote}
                              </span>
                            )}
                            <OrigemBadge origem={conta.origem} />
                            <StatusBadge status={status} />
                            {(conta as any).isAltaAdministrativa && (conta as any).totalLotes > 1 && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300" title={`Alta Administrativa - Lote ${(conta as any).numeroLote || ''} (${(conta as any).totalLotes} lotes no total)`}>
                                Alta Adm.
                              </Badge>
                            )}
                            {(conta as any).isOutlier && (
                              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-300" title="Valor total desta conta está significativamente fora da média">
                                Outlier
                              </Badge>
                            )}
                            {(conta as any).scoreRisco != null && (conta as any).scoreRisco > 0 && (
                              <Badge variant="outline" className={`text-xs ${
                                (conta as any).scoreRisco >= 70 ? 'bg-red-50 text-red-700 border-red-300' :
                                (conta as any).scoreRisco >= 40 ? 'bg-orange-50 text-orange-700 border-orange-300' :
                                'bg-green-50 text-green-700 border-green-300'
                              }`}>
                                Risco: {(conta as any).scoreRisco}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <User className="h-4 w-4" />
                            <span className="truncate">{conta.pacienteNome || "-"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Convênio e Carteirinha */}
                      <div className="flex flex-col gap-1 min-w-[180px]">
                        <div className="flex items-center gap-2 text-sm">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{conta.convenio || "-"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CreditCard className="h-4 w-4" />
                          <span>{conta.carteiraBeneficiario || "-"}</span>
                        </div>
                      </div>

                      {/* Valores */}
                      <div className="flex flex-col gap-1 min-w-[140px]">
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Valores</span>
                        </div>
                        <span className={`text-lg font-bold ${(conta as any).isOutlier ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(conta.valorTotal)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {conta.totalItens} itens
                        </span>
                      </div>

                      {/* Divergências */}
                      <div className="flex flex-col gap-1 min-w-[100px]">
                        {(conta.totalDivergencias > 0 || conta.totalAlertas > 0) ? (
                          <>
                            <div className="flex items-center gap-1 text-sm text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="font-medium">{conta.totalDivergencias} div.</span>
                            </div>
                            {conta.totalAlertas > 0 && (
                              <span className="text-xs text-orange-600">
                                {conta.totalAlertas} alerta(s)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem divergências</span>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            if (!estabelecimentoAtual?.id) return;
                            compararMutation.mutate({
                              numeroConta: conta.numeroConta,
                              estabelecimentoId: conta.estabelecimentoId,
                            });
                          }}
                          disabled={compararMutation.isPending}
                          title="Comparar com padrões de cobrança"
                        >
                          {compararMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BarChart3 className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => handleVerDetalhes(conta)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Excluir conta ${conta.numeroConta}?`)) {
                              excluirContaMutation.mutate({
                                numeroConta: conta.numeroConta,
                                estabelecimentoId: conta.estabelecimentoId,
                              });
                            }
                          }}
                          title="Excluir conta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages} ({contasData?.total || 0} contas)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próxima
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
