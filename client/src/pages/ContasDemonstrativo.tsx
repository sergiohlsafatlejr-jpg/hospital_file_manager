import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  CheckCircle2,
  XCircle,
  AlertCircle,
  Receipt,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Layers2,
  Package
} from "lucide-react";
import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

// Gerar lista de competências no formato MM/AAAA
const getCompetencias = () => {
  const competencias = [];
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  
  // Gerar últimos 24 meses
  for (let i = 0; i < 24; i++) {
    let mes = mesAtual - i;
    let ano = anoAtual;
    
    while (mes <= 0) {
      mes += 12;
      ano -= 1;
    }
    
    const mesStr = String(mes).padStart(2, '0');
    const value = `${mes}-${ano}`; // formato interno: mes-ano
    const label = `${mesStr}/${ano}`; // formato exibição: MM/AAAA
    
    competencias.push({ value, label, mes, ano });
  }
  
  return competencias;
};

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
const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
};

// Formatar data de referência como MM/AAAA
const formatDataReferencia = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${mes}/${ano}`;
};

export default function ContasDemonstrativo() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioId, setConvenioId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Inicializar com mês anterior (para mostrar dados mais recentes disponíveis)
  const getCompetenciaInicial = () => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    if (mesAtual === 1) {
      return `12-${hoje.getFullYear() - 1}`;
    }
    return `${mesAtual - 1}-${hoje.getFullYear()}`;
  };
  
  const [competencia, setCompetencia] = useState<string>(getCompetenciaInicial());
  const [statusGlosa, setStatusGlosa] = useState<string>("todos");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();

  // Extrair mês e ano da competência selecionada
  const { mesReferencia, anoReferencia } = useMemo(() => {
    if (!competencia || competencia === "all") {
      return { mesReferencia: undefined, anoReferencia: undefined };
    }
    const [mes, ano] = competencia.split("-").map(Number);
    return { mesReferencia: mes, anoReferencia: ano };
  }, [competencia]);

  // Lista de competências
  const competencias = useMemo(() => getCompetencias(), []);

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({});

  // Buscar contas do demonstrativo
  const { data: contasData, isLoading, refetch } = trpc.demonstrativo.contas.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      mesReferencia,
      anoReferencia,
      search: searchTerm || undefined,
      statusGlosa: statusGlosa as "todos" | "pago" | "glosado" | "parcial",
      page,
      pageSize: 20,
    },
    { enabled: !!convenioId && !!estabelecimentoAtual?.id }
  );

  // Buscar resumo
  const { data: resumo } = trpc.demonstrativo.resumo.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      mesReferencia,
      anoReferencia,
    },
    { enabled: !!convenioId && !!estabelecimentoAtual?.id }
  );

  // Obter nome do convênio selecionado
  const convenioSelecionado = convenios?.find(c => c.id === parseInt(convenioId));

  // Obter label da competência selecionada
  const competenciaSelecionada = competencias.find(c => c.value === competencia);

  // Determinar status da conta
  const getStatusConta = (conta: any) => {
    const valorGlosa = parseFloat(conta.valorGlosado || "0");
    const valorPago = parseFloat(conta.valorTotal || "0");
    
    if (valorGlosa === 0 && valorPago > 0) {
      return { label: "Pago", color: "bg-green-100 text-green-800", icon: CheckCircle2 };
    } else if (valorGlosa > 0 && valorPago === 0) {
      return { label: "Glosado", color: "bg-red-100 text-red-800", icon: XCircle };
    } else if (valorGlosa > 0 && valorPago > 0) {
      return { label: "Parcial", color: "bg-yellow-100 text-yellow-800", icon: AlertCircle };
    }
    return { label: "Pendente", color: "bg-gray-100 text-gray-800", icon: Minus };
  };

  // Navegar para detalhes da conta
  const handleVerDetalhes = (conta: any) => {
    const params = new URLSearchParams({
      guia: conta.numeroGuia || "",
      protocolo: conta.protocolo || "",
      convenioId: convenioId,
      arquivoId: String(conta.arquivoId || ""),
    });
    setLocation(`/conta-detalhes?${params.toString()}`);
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!contasData?.items?.length) return;

    const data = contasData.items.map(conta => ({
      "Guia": conta.numeroGuia || "",
      "Protocolo": conta.protocolo || "",
      "Carteirinha": conta.carteiraBeneficiario || "",
      "Paciente": conta.nomeBeneficiario || "",
      "Data Pagamento": formatDate(conta.dataPagamento),
      "Competência": formatDataReferencia(conta.dataReferencia),
      "Qtd Itens": conta.totalItens || 0,
      "Itens Glosados": conta.itensGlosados || 0,
      "Valor Informado": parseFloat(conta.valorInformado || "0"),
      "Valor Pago": parseFloat(conta.valorTotal || "0"),
      "Valor Glosado": parseFloat(conta.valorGlosado || "0"),
      "Origem": conta.origemTipo === "excel" ? "Excel" : "XML",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas");
    
    const nomeArquivo = convenioSelecionado?.nome || "demonstrativo";
    const competenciaLabel = competenciaSelecionada?.label?.replace("/", "-") || "";
    XLSX.writeFile(wb, `contas_demonstrativo_${nomeArquivo}_${competenciaLabel}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contas Demonstrativo</h1>
            <p className="text-muted-foreground">
              Visualize as contas retornadas pelas operadoras (XML e Excel)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportExcel}
              disabled={!contasData?.items?.length}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Convênio */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio *</label>
                <Select value={convenioId} onValueChange={setConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {convenios?.map(conv => (
                      <SelectItem key={conv.id} value={String(conv.id)}>
                        {conv.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Competência (MM/AAAA) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Competência (MM/AAAA)</label>
                <Select value={competencia} onValueChange={setCompetencia}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {competencias.map(comp => (
                      <SelectItem key={comp.value} value={comp.value}>
                        {comp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusGlosa} onValueChange={setStatusGlosa}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="glosado">Glosado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Busca */}
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium">Buscar</label>
                <div className="relative">
                  <FileSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Guia, paciente, carteirinha..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        {convenioId && resumo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Contas</p>
                    <p className="text-2xl font-bold">{resumo.totalContas}</p>
                  </div>
                  <Receipt className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Itens</p>
                    <p className="text-2xl font-bold">{resumo.totalItens}</p>
                  </div>
                  <FileText className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Informado</p>
                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(resumo.valorTotal)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Pago</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(resumo.valorPago)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(resumo.valorGlosado)}</p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Lista de Contas */}
        {!convenioId ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Selecione um convênio</h3>
              <p className="text-muted-foreground">
                Escolha um convênio nos filtros acima para visualizar as contas do demonstrativo
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Card key={i}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : contasData?.items?.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileSearch className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma conta encontrada</h3>
              <p className="text-muted-foreground">
                Não há contas para os filtros selecionados
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contasData?.items?.map((conta, index) => {
              const status = getStatusConta(conta);
              const StatusIcon = status.icon;
              
              return (
                <Card 
                  key={`${conta.numeroGuia}-${conta.protocolo}-${index}`}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleVerDetalhes(conta)}
                >
                  <CardContent className="py-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Ícone e Status */}
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-full ${status.color}`}>
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div className="md:hidden">
                          <Badge variant="outline" className={status.color}>
                            {status.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Informações principais */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Guia e Paciente */}
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Hash className="h-3 w-3" />
                            <span>Guia</span>
                            {conta.isAltaAdministrativa && (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs px-1.5 py-0.5">
                                <Layers2 className="h-3 w-3 mr-1" />
                                Alta Adm ({conta.totalLotesGuia} lotes)
                              </Badge>
                            )}
                          </div>
                          <p className="font-semibold">{conta.numeroGuia || "-"}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <User className="h-3 w-3" />
                            <span className="truncate">{conta.nomeBeneficiario || "-"}</span>
                          </div>
                        </div>

                        {/* Carteirinha e Lote */}
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CreditCard className="h-3 w-3" />
                            <span>Carteirinha</span>
                          </div>
                          <p className="font-medium">{conta.carteiraBeneficiario || "-"}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-muted-foreground">
                              Lote: {conta.lotePrestador || "-"}
                            </span>
                          </div>
                        </div>

                        {/* Datas */}
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Data Pagamento</span>
                          </div>
                          <p className="font-medium">{formatDate(conta.dataPagamento)}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Comp: {formatDataReferencia(conta.dataReferencia)}
                          </p>
                        </div>

                        {/* Valores */}
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            <span>Valores</span>
                          </div>
                          <p className="font-semibold text-green-600">
                            {formatCurrency(conta.valorTotal)}
                          </p>
                          {parseFloat(conta.valorGlosado || "0") > 0 && (
                            <p className="text-sm text-red-500">
                              Glosa: {formatCurrency(conta.valorGlosado)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="hidden md:flex">
                          {conta.totalItens} {conta.totalItens === 1 ? "item" : "itens"}
                        </Badge>
                        {conta.itensGlosados > 0 && (
                          <Badge variant="destructive" className="hidden md:flex">
                            {conta.itensGlosados} glosado{conta.itensGlosados > 1 ? "s" : ""}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="hidden md:flex">
                          {conta.origemTipo === "excel" ? "Excel" : "XML"}
                        </Badge>
                        <Badge variant="outline" className={`hidden md:flex ${status.color}`}>
                          {status.label}
                        </Badge>
                        <Button variant="ghost" size="sm" className="hidden md:flex">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Paginação */}
            {contasData && contasData.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Página {contasData.page} de {contasData.totalPages} ({contasData.total} contas)
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
                    onClick={() => setPage(p => Math.min(contasData.totalPages, p + 1))}
                    disabled={page >= contasData.totalPages}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
