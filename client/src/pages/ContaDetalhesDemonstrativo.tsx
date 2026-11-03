import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  ArrowLeft,
  Download, 
  RefreshCw, 
  Calendar, 
  CreditCard,
  Hash,
  User,
  DollarSign,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  AlertTriangle,
  Gavel
} from "lucide-react";
import React, { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import { formatDateBR } from "@/lib/dateUtils";
import { resolverGlosaDicionario } from "@shared/glossaryGlosas";

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

export default function ContaDetalhesDemonstrativo() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  // Parsear parâmetros da URL
  const params = useMemo(() => {
    const urlParams = new URLSearchParams(searchString);
    return {
      guia: urlParams.get("guia") || "",
      protocolo: urlParams.get("protocolo") || "",
      convenioId: urlParams.get("convenioId") ? parseInt(urlParams.get("convenioId")!) : undefined,
      arquivoId: urlParams.get("arquivoId") ? parseInt(urlParams.get("arquivoId")!) : undefined,
    };
  }, [searchString]);

  // Construir URL de volta preservando filtros
  const voltarUrl = useMemo(() => {
    const urlParams = new URLSearchParams(searchString);
    const filtros = new URLSearchParams();
    const comp = urlParams.get("_competencia");
    const status = urlParams.get("_statusGlosa");
    const pg = urlParams.get("_page");
    const search = urlParams.get("_searchTerm");
    const convId = urlParams.get("convenioId");
    if (comp) filtros.set("competencia", comp);
    if (status && status !== "todos") filtros.set("statusGlosa", status);
    if (pg && pg !== "1") filtros.set("page", pg);
    if (search) filtros.set("searchTerm", search);
    if (convId) filtros.set("convenioId", convId);
    const qs = filtros.toString();
    return qs ? `/contas-demonstrativo?${qs}` : "/contas-demonstrativo";
  }, [searchString]);

  // Buscar convênio
  const { data: convenios } = trpc.convenios.list.useQuery({});
  const convenio = convenios?.find(c => c.id === params.convenioId);
  const { data: motivosGlosaDb } = trpc.motivosGlosa.list.useQuery();

  // Buscar itens da conta
  const { data: itens, isLoading, refetch } = trpc.demonstrativo.itensPorGuia.useQuery(
    {
      numeroGuia: params.guia,
      protocolo: params.protocolo || undefined,
      convenioId: params.convenioId,
      arquivoId: params.arquivoId,
    },
    { enabled: !!params.guia }
  );

  // Calcular totais
  const totais = useMemo(() => {
    if (!itens?.length) return { valorInformado: 0, valorPago: 0, valorGlosa: 0, qtdItens: 0, qtdGlosados: 0 };
    
    return itens.reduce((acc, item) => ({
      valorInformado: acc.valorInformado + parseFloat(item.valorInformado || "0"),
      valorPago: acc.valorPago + parseFloat(item.valorPago || "0"),
      valorGlosa: acc.valorGlosa + parseFloat(item.valorGlosa || "0"),
      qtdItens: acc.qtdItens + 1,
      qtdGlosados: acc.qtdGlosados + (parseFloat(item.valorGlosa || "0") > 0 ? 1 : 0),
    }), { valorInformado: 0, valorPago: 0, valorGlosa: 0, qtdItens: 0, qtdGlosados: 0 });
  }, [itens]);

  // Informações do cabeçalho (primeiro item)
  const cabecalho = itens?.[0];

  // Determinar status do item
  const getStatusItem = (item: any) => {
    const valorGlosa = parseFloat(item.valorGlosa || "0");
    const valorPago = parseFloat(item.valorPago || "0");
    
    if (valorGlosa === 0 && valorPago > 0) {
      return { label: "Pago", color: "bg-green-100 text-green-800", icon: CheckCircle2 };
    } else if (valorGlosa > 0 && valorPago === 0) {
      return { label: "Glosado", color: "bg-red-100 text-red-800", icon: XCircle };
    } else if (valorGlosa > 0 && valorPago > 0) {
      return { label: "Parcial", color: "bg-yellow-100 text-yellow-800", icon: AlertCircle };
    }
    return { label: "Pendente", color: "bg-gray-100 text-gray-800", icon: AlertCircle };
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!itens?.length) return;

    const data = itens.map(item => ({
      "Seq": item.sequencialItem || "",
      "Código": item.codigoItem || "",
      "Descrição": item.descricaoItem || "",
      "Data Execução": formatDateBR(item.dataExecucao),
      "Quantidade": item.quantidade || "",
      "Valor Informado": parseFloat(item.valorInformado || "0"),
      "Valor Pago": parseFloat(item.valorPago || "0"),
      "Valor Glosa": parseFloat(item.valorGlosa || "0"),
      "Código Glosa": resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb)?.codigo || item.codigoGlosa || "",
      "Descrição Glosa": resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb)?.descricao || item.erroTiss || "",
      "Situação": item.situacaoItem || "",
      "Tipo Lançamento": item.tipoLancamento || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    
    XLSX.writeFile(wb, `conta_${params.guia}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Navegar para recurso de glosa
  const handleRecursoGlosa = () => {
    const urlParams = new URLSearchParams({
      convenioId: String(params.convenioId || ""),
      guia: params.guia,
    });
    setLocation(`/recursos-glosa?${urlParams.toString()}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation(voltarUrl)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Detalhes da Conta</h1>
              <p className="text-muted-foreground">
                Guia: {params.guia} | {convenio?.nome || "Convênio"}
              </p>
            </div>
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
              disabled={!itens?.length}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            {totais.qtdGlosados > 0 && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleRecursoGlosa}
              >
                <Gavel className="mr-2 h-4 w-4" />
                Recurso de Glosa
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !itens?.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum item encontrado</h3>
              <p className="text-muted-foreground">
                Não foram encontrados itens para esta conta
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Informações da Conta */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Dados do Beneficiário */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Beneficiário
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium">{cabecalho?.nomeBeneficiario || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Carteirinha</p>
                    <p className="font-medium">{cabecalho?.carteiraBeneficiario || "-"}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Dados da Guia */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Identificação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Guia</p>
                      <p className="font-medium">{params.guia || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Protocolo</p>
                      <p className="font-medium">{cabecalho?.protocolo || "-"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Data Pagamento</p>
                      <p className="font-medium">{formatDateBR(cabecalho?.dataPagamento)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Data Referência</p>
                      <p className="font-medium">{formatDateBR(cabecalho?.dataReferencia)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Origem</p>
                    <Badge variant="secondary">
                      {cabecalho?.origemTipo === "excel" ? "Excel" : "XML"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Resumo Financeiro */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Resumo Financeiro
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Informado</span>
                    <span className="font-medium text-blue-600">{formatCurrency(totais.valorInformado)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Pago</span>
                    <span className="font-medium text-green-600">{formatCurrency(totais.valorPago)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Glosado</span>
                    <span className="font-medium text-red-600">{formatCurrency(totais.valorGlosa)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm text-muted-foreground">Itens</span>
                    <div className="flex gap-2">
                      <Badge variant="outline">{totais.qtdItens} total</Badge>
                      {totais.qtdGlosados > 0 && (
                        <Badge variant="destructive">{totais.qtdGlosados} glosados</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alerta de Glosa */}
            {totais.qtdGlosados > 0 && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-800">Atenção: Itens Glosados</h3>
                      <p className="text-sm text-yellow-700">
                        Esta conta possui {totais.qtdGlosados} item(ns) glosado(s) totalizando {formatCurrency(totais.valorGlosa)}. 
                        Verifique os motivos e considere fazer um recurso de glosa.
                      </p>
                    </div>
                    <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-100" onClick={handleRecursoGlosa}>
                      <Gavel className="mr-2 h-4 w-4" />
                      Fazer Recurso
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Itens da Conta</CardTitle>
                <CardDescription>
                  {totais.qtdItens} item(ns) encontrado(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">Seq</TableHead>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[100px]">Data</TableHead>
                        <TableHead className="w-[80px] text-right">Qtd</TableHead>
                        <TableHead className="w-[120px] text-right">Informado</TableHead>
                        <TableHead className="w-[120px] text-right">Pago</TableHead>
                        <TableHead className="w-[120px] text-right">Glosa</TableHead>
                        <TableHead className="w-[100px]">Cód. Glosa</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item, index) => {
                        const status = getStatusItem(item);
                        const StatusIcon = status.icon;
                        const hasGlosa = parseFloat(item.valorGlosa || "0") > 0;
                        const glosaDicionario = resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb);
                        
                        return (
                          <TableRow 
                            key={item.id || index}
                            className={hasGlosa ? "bg-red-50" : ""}
                          >
                            <TableCell className="font-mono text-sm">
                              {item.sequencialItem || index + 1}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.codigoItem || "-"}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <span className="line-clamp-2" title={item.descricaoItem || ""}>
                                {item.descricaoItem || "-"}
                              </span>
                              {item.tipoLancamento && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {item.tipoLancamento}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDateBR(item.dataExecucao)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.quantidade || "1"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatCurrency(item.valorInformado)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600">
                              {formatCurrency(item.valorPago)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600">
                              {hasGlosa ? formatCurrency(item.valorGlosa) : "-"}
                            </TableCell>
                            <TableCell>
                              {glosaDicionario ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="destructive" className="text-xs cursor-help">
                                        {glosaDicionario.codigo}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[300px]">
                                      <p className="font-semibold">
                                        Glosa: {glosaDicionario.codigo}
                                        {glosaDicionario.grupo ? ` (${glosaDicionario.grupo})` : ""}
                                      </p>
                                      <p className="text-sm">{glosaDicionario.descricao}</p>
                                      {glosaDicionario.descricaoOperadora && (
                                        <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                                          Operadora: {glosaDicionario.descricaoOperadora}
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : "-"}{false && (
                                <Badge variant="destructive" className="text-xs">
                                  {item.codigoGlosa}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={status.color}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {status.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
