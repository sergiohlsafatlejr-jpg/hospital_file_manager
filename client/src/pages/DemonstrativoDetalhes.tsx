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
  Gavel,
  Layers2,
  Package,
  Pill,
  Stethoscope,
  BedDouble,
  TestTube2,
  Wrench,
  CircleDot,
  BarChart3
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

// Mapa de tipos de lançamento com labels legíveis, ícones e cores
const TIPO_LANCAMENTO_MAP: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
  "EXA": { label: "Exames", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200", icon: TestTube2 },
  "HOS": { label: "Diárias/Hosp.", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: BedDouble },
  "MED": { label: "Medicamentos", color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", icon: Pill },
  "MAT": { label: "Materiais", color: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: Package },
  "CON": { label: "Procedimentos", color: "text-indigo-700", bgColor: "bg-indigo-50", borderColor: "border-indigo-200", icon: Stethoscope },
  "HON": { label: "Honorários", color: "text-cyan-700", bgColor: "bg-cyan-50", borderColor: "border-cyan-200", icon: CircleDot },
  "TAX": { label: "Taxas", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: Wrench },
};

// Inferir tipo de lançamento pelo código do item quando não disponível
const inferirTipoLancamento = (codigoItem: string | null | undefined): string | null => {
  if (!codigoItem) return null;
  const codigo = codigoItem.trim();
  // Códigos que começam com 9 = Medicamentos
  if (codigo.startsWith("9")) return "MED";
  // Códigos que começam com 7 = Materiais
  if (codigo.startsWith("7")) return "MAT";
  // Códigos que começam com 2 = Exames/Procedimentos
  if (codigo.startsWith("2")) return "EXA";
  // Códigos que começam com 6 = Hospitalares/Diárias
  if (codigo.startsWith("6")) return "HOS";
  // Códigos que começam com 1 = Consultas/Procedimentos
  if (codigo.startsWith("1")) return "CON";
  // Códigos que começam com 3 ou 4 = Honorários
  if (codigo.startsWith("3") || codigo.startsWith("4")) return "HON";
  return null;
};

// Obter tipo efetivo do item (original ou inferido)
const getTipoEfetivo = (item: any): string | null => {
  if (item.tipoLancamento && item.tipoLancamento.trim() !== "") {
    return item.tipoLancamento.trim().toUpperCase();
  }
  return inferirTipoLancamento(item.codigoItem);
};

// Obter info do tipo
const getTipoInfo = (tipo: string | null) => {
  if (!tipo) return { label: "Outros", color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: Layers2 };
  return TIPO_LANCAMENTO_MAP[tipo] || { label: tipo, color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: Layers2 };
};

export default function DemonstrativoDetalhes() {
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
      lotePrestador: urlParams.get("lotePrestador") || "",
      nomeBeneficiario: urlParams.get("nomeBeneficiario") || "",
    };
  }, [searchString]);

  // Construir URL de volta preservando filtros do Demonstrativo
  const voltarUrl = useMemo(() => {
    const urlParams = new URLSearchParams(searchString);
    const filtros = new URLSearchParams();
    const comp = urlParams.get("_competencia");
    const status = urlParams.get("_statusGlosa");
    const pg = urlParams.get("_page");
    const search = urlParams.get("_searchTerm");
    const convId = urlParams.get("_convenioId");
    if (comp) filtros.set("competencia", comp);
    if (status && status !== "todos") filtros.set("statusGlosa", status);
    if (pg && pg !== "1") filtros.set("page", pg);
    if (search) filtros.set("searchTerm", search);
    if (convId) filtros.set("convenioId", convId);
    const qs = filtros.toString();
    return qs ? `/demonstrativo?${qs}` : "/demonstrativo";
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

  // Calcular totais gerais
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

  // Calcular totais por tipo de lançamento
  const totaisPorTipo = useMemo(() => {
    if (!itens?.length) return [];
    
    const map = new Map<string, { tipo: string; qtd: number; valorInformado: number; valorPago: number; valorGlosa: number; qtdGlosados: number }>();
    
    for (const item of itens) {
      const tipo = getTipoEfetivo(item) || "OUTROS";
      const existing = map.get(tipo) || { tipo, qtd: 0, valorInformado: 0, valorPago: 0, valorGlosa: 0, qtdGlosados: 0 };
      const valorGlosa = parseFloat(item.valorGlosa || "0");
      existing.qtd += 1;
      existing.valorInformado += parseFloat(item.valorInformado || "0");
      existing.valorPago += parseFloat(item.valorPago || "0");
      existing.valorGlosa += valorGlosa;
      existing.qtdGlosados += valorGlosa > 0 ? 1 : 0;
      map.set(tipo, existing);
    }
    
    // Ordenar por valor pago (maior primeiro)
    return Array.from(map.values()).sort((a, b) => (b.valorPago + b.valorInformado) - (a.valorPago + a.valorInformado));
  }, [itens]);

  // % de glosa
  const percentualGlosa = totais.valorInformado > 0 
    ? ((totais.valorGlosa / totais.valorInformado) * 100).toFixed(1)
    : totais.valorPago > 0 
      ? ((totais.valorGlosa / (totais.valorPago + totais.valorGlosa)) * 100).toFixed(1)
      : "0.0";

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
      "Tipo Lançamento": getTipoInfo(getTipoEfetivo(item)).label,
      "Data Execução": formatDateBR(item.dataExecucao),
      "Quantidade": item.quantidade || "",
      "Valor Informado": parseFloat(item.valorInformado || "0"),
      "Valor Pago": parseFloat(item.valorPago || "0"),
      "Valor Glosa": parseFloat(item.valorGlosa || "0"),
      "Código Glosa": resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb)?.codigo || item.codigoGlosa || "",
      "Descrição Glosa": resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb)?.descricao || item.erroTiss || "",
      "Situação": item.situacaoItem || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 12 },
      { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 30 }, { wch: 12 },
    ];
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
                Guia: {params.guia} {params.protocolo && `| Protocolo: ${params.protocolo}`} {convenio && `| ${convenio.nome}`}
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
              Exportar Excel
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
                    <p className="font-medium">{cabecalho?.nomeBeneficiario || params.nomeBeneficiario || "-"}</p>
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
                      <p className="font-medium font-mono">{params.guia || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Protocolo</p>
                      <p className="font-medium font-mono">{cabecalho?.protocolo || params.protocolo || "-"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Data Pagamento</p>
                      <p className="font-medium">{formatDateBR(cabecalho?.dataPagamento)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Competência</p>
                      <p className="font-medium">{formatDateBR(cabecalho?.dataReferencia)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">Lote:</p>
                    <p className="font-medium font-mono">{cabecalho?.lotePrestador || params.lotePrestador || "-"}</p>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <p className="text-sm text-muted-foreground">Origem:</p>
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
                    <span className="font-semibold text-blue-600">{formatCurrency(totais.valorInformado)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Pago</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(totais.valorPago)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Valor Glosado</span>
                    <span className="font-semibold text-red-600">{formatCurrency(totais.valorGlosa)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">% Glosa</span>
                    <span className={`font-semibold ${parseFloat(percentualGlosa) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {percentualGlosa}%
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
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

            {/* KPIs por Tipo de Lançamento */}
            {totaisPorTipo.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Resumo por Tipo de Lançamento
                  </CardTitle>
                  <CardDescription>
                    Valores agrupados por categoria de item ({totaisPorTipo.length} tipos encontrados)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {totaisPorTipo.map((t) => {
                      const info = getTipoInfo(t.tipo === "OUTROS" ? null : t.tipo);
                      const TipoIcon = info.icon;
                      const valorTotal = t.valorPago + t.valorGlosa + t.valorInformado;
                      const percGlosa = (t.valorPago + t.valorGlosa) > 0 
                        ? ((t.valorGlosa / (t.valorPago + t.valorGlosa)) * 100).toFixed(1)
                        : t.valorInformado > 0 
                          ? ((t.valorGlosa / t.valorInformado) * 100).toFixed(1)
                          : "0.0";
                      
                      return (
                        <div 
                          key={t.tipo} 
                          className={`rounded-lg border p-4 ${info.bgColor} ${info.borderColor} transition-all hover:shadow-md`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <TipoIcon className={`h-5 w-5 ${info.color}`} />
                              <span className={`font-semibold text-sm ${info.color}`}>{info.label}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {t.qtd} {t.qtd === 1 ? "item" : "itens"}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1.5">
                            {t.valorInformado > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Informado</span>
                                <span className="font-medium text-blue-600">{formatCurrency(t.valorInformado)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Pago</span>
                              <span className="font-medium text-emerald-600">{formatCurrency(t.valorPago)}</span>
                            </div>
                            {t.valorGlosa > 0 && (
                              <>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Glosado</span>
                                  <span className="font-medium text-red-600">{formatCurrency(t.valorGlosa)}</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1 border-t">
                                  <span className="text-muted-foreground">% Glosa</span>
                                  <span className="font-semibold text-red-600">{percGlosa}%</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Glosados</span>
                                  <span className="font-semibold text-red-600">{t.qtdGlosados} de {t.qtd}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Alerta de Glosa */}
            {totais.qtdGlosados > 0 && (
              <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <AlertTriangle className="h-8 w-8 text-yellow-600 shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Atenção: Itens Glosados</h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Esta conta possui {totais.qtdGlosados} item(ns) glosado(s) totalizando {formatCurrency(totais.valorGlosa)} ({percentualGlosa}% de glosa). 
                        Verifique os motivos e considere fazer um recurso de glosa.
                      </p>
                    </div>
                    <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-300 dark:hover:bg-yellow-900 shrink-0" onClick={handleRecursoGlosa}>
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
                  {totais.qtdItens} item(ns) encontrado(s) — {totais.qtdGlosados > 0 ? `${totais.qtdGlosados} com glosa` : "nenhuma glosa"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Seq</TableHead>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[130px]">Tipo</TableHead>
                        <TableHead className="w-[100px]">Data Exec.</TableHead>
                        <TableHead className="w-[60px] text-center">Qtd</TableHead>
                        <TableHead className="w-[120px] text-right">Informado</TableHead>
                        <TableHead className="w-[120px] text-right">Pago</TableHead>
                        <TableHead className="w-[120px] text-right">Glosa</TableHead>
                        <TableHead className="w-[100px]">Cód. Glosa</TableHead>
                        <TableHead className="w-[90px] text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item, index) => {
                        const status = getStatusItem(item);
                        const StatusIcon = status.icon;
                        const hasGlosa = parseFloat(item.valorGlosa || "0") > 0;
                        const tipoEfetivo = getTipoEfetivo(item);
                        const tipoInfo = getTipoInfo(tipoEfetivo);
                        const TipoIcon = tipoInfo.icon;
                        const isInferido = !item.tipoLancamento && tipoEfetivo;
                        const glosaDicionario = resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosGlosaDb);
                        
                        return (
                          <TableRow 
                            key={item.id || index}
                            className={hasGlosa ? "bg-red-50/50 dark:bg-red-950/20" : ""}
                          >
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {item.sequencialItem || index + 1}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.codigoItem || "-"}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <span className="line-clamp-2 text-sm" title={item.descricaoItem || ""}>
                                {item.descricaoItem || "-"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {tipoEfetivo ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs ${tipoInfo.color} ${tipoInfo.borderColor} ${isInferido ? "border-dashed" : ""}`}
                                      >
                                        <TipoIcon className="h-3 w-3 mr-1" />
                                        {tipoInfo.label}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{isInferido ? `Tipo inferido pelo código ${item.codigoItem}` : `Tipo: ${tipoInfo.label} (${tipoEfetivo})`}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDateBR(item.dataExecucao)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm">
                              {item.quantidade || "1"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatCurrency(item.valorInformado)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">
                              {formatCurrency(item.valorPago)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600">
                              {hasGlosa ? formatCurrency(item.valorGlosa) : "-"}
                            </TableCell>
                            <TableCell>
                              {(item.codigoGlosa || item.erroTiss) ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="destructive" className="text-xs cursor-help">
                                        {glosaDicionario?.codigo || item.codigoGlosa || (item.erroTiss ? item.erroTiss.split('-')[0] : '-')}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[300px]">
                                      <p className="font-semibold">
                                        Glosa: {glosaDicionario?.codigo || 'N/A'}
                                        {glosaDicionario?.grupo ? ` (${glosaDicionario.grupo})` : ''}
                                      </p>
                                      <p className="text-sm">{glosaDicionario?.descricao || "Sem descrição"}</p>
                                      {glosaDicionario?.descricaoOperadora && (
                                        <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                                          Operadora: {glosaDicionario.descricaoOperadora}
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="text-center">
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

                {/* Totais */}
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Itens</p>
                      <p className="text-lg font-bold">{totais.qtdItens}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Informado</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(totais.valorInformado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Pago</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(totais.valorPago)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Glosado</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(totais.valorGlosa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">% Glosa</p>
                      <p className={`text-lg font-bold ${parseFloat(percentualGlosa) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {percentualGlosa}%
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
