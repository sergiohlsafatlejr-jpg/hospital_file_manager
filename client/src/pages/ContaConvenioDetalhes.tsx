import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  ArrowLeft,
  Download, 
  RefreshCw, 
  Calendar, 
  FileSpreadsheet,
  CreditCard,
  Hash,
  User,
  DollarSign,
  FileText,
  Receipt,
  Package,
  Pill,
  Syringe,
  Bed,
  Stethoscope,
  Activity,
  MoreHorizontal,
  Shield,
  Key
} from "lucide-react";
import React, { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";

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

// Ícones por tipo de item
const getTipoIcon = (tipo: string) => {
  const tipoLower = (tipo || "").toLowerCase();
  if (tipoLower.includes("medicamento") || tipoLower.includes("med")) return Pill;
  if (tipoLower.includes("material") || tipoLower.includes("mat")) return Package;
  if (tipoLower.includes("diária") || tipoLower.includes("diaria")) return Bed;
  if (tipoLower.includes("taxa")) return Receipt;
  if (tipoLower.includes("procedimento") || tipoLower.includes("proc")) return Stethoscope;
  if (tipoLower.includes("exame")) return Activity;
  if (tipoLower.includes("sadt")) return Syringe;
  return FileText;
};

// Cores por tipo de item
const getTipoColor = (tipo: string) => {
  const tipoLower = (tipo || "").toLowerCase();
  if (tipoLower.includes("medicamento") || tipoLower.includes("med")) return "bg-green-100 text-green-800";
  if (tipoLower.includes("material") || tipoLower.includes("mat")) return "bg-blue-100 text-blue-800";
  if (tipoLower.includes("diária") || tipoLower.includes("diaria")) return "bg-purple-100 text-purple-800";
  if (tipoLower.includes("taxa")) return "bg-yellow-100 text-yellow-800";
  if (tipoLower.includes("procedimento") || tipoLower.includes("proc")) return "bg-red-100 text-red-800";
  if (tipoLower.includes("exame")) return "bg-cyan-100 text-cyan-800";
  if (tipoLower.includes("sadt")) return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-800";
};

export default function ContaConvenioDetalhes() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const guia = params.get("guia") || "";
  const lote = params.get("lote") || undefined;
  const arquivoId = params.get("arquivoId") || "";
  const convenioId = params.get("convenioId") || "";

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({});

  // Buscar itens individuais da guia usando a nova procedure
  const { data: itensGuia, isLoading, refetch } = trpc.faturamentoTiss.itensGuia.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id,
      numeroGuiaPrestador: guia,
      numeroLote: lote,
      convenioId: convenioId ? parseInt(convenioId) : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id && !!guia }
  );

  // Calcular KPIs por tipo
  const kpisPorTipo = useMemo(() => {
    if (!itensGuia) return [];
    const tipos = new Map<string, { quantidade: number; valor: number; itens: number }>();
    
    itensGuia.forEach((item: any) => {
      const tipo = item.tipoItem || "Outros";
      const valor = parseFloat(item.valorFaturado || "0");
      const qtd = parseFloat(item.quantidade || "1");
      
      if (tipos.has(tipo)) {
        const existing = tipos.get(tipo)!;
        existing.quantidade += qtd;
        existing.valor += valor;
        existing.itens += 1;
      } else {
        tipos.set(tipo, { quantidade: qtd, valor, itens: 1 });
      }
    });
    
    return Array.from(tipos.entries())
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.valor - a.valor);
  }, [itensGuia]);

  // Calcular totais
  const totais = useMemo(() => {
    if (!itensGuia) return { valorTotal: 0, totalItens: 0 };
    let valorTotal = 0;
    let totalItens = 0;
    
    itensGuia.forEach((item: any) => {
      valorTotal += parseFloat(item.valorFaturado || "0");
      totalItens += 1;
    });
    
    return { valorTotal, totalItens };
  }, [itensGuia]);

  // Obter informações da guia
  const infoGuia = (itensGuia && itensGuia[0]) || {} as any;
  const convenioSelecionado = convenios?.find(c => c.id === parseInt(convenioId));

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!itensGuia?.length) return;

    const data = itensGuia.map((item: any) => ({
      "Guia": item.numeroGuiaPrestador || "-",
      "Nº Lote": item.numeroLote || "-",
      "Seq. Transação": item.sequencialTransacao || "-",
      "Registro ANS": item.registroAns || "-",
      "Guia Operadora": item.numeroGuiaOperadora || "-",
      "Senha": item.senha || "-",
      "Carteirinha": item.carteiraBeneficiario || "-",
      "Tipo Item": item.tipoItem || "-",
      "Seq. Item": item.sequencialItem || "-",
      "Código": item.codigoItem || "-",
      "Descrição": item.descricaoItem || "-",
      "Data Execução": formatDate(item.dataExecucao),
      "Quantidade": item.quantidade || 0,
      "Valor Unitário": parseFloat(item.valorUnitario || "0"),
      "Valor Faturado": parseFloat(item.valorFaturado || "0"),
      "Profissional": item.nomeProf || "-",
      "CRM": item.conselhoProf || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    
    XLSX.writeFile(wb, `guia_${guia}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Voltar para lista
  const handleVoltar = () => {
    setLocation("/conta-convenio");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleVoltar}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Detalhes da Guia</h1>
              <p className="text-muted-foreground">
                Guia: {guia} | Convênio: {convenioSelecionado?.nome || "-"}
                {lote && ` | Lote: ${lote}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button 
              size="sm" 
              onClick={handleExportExcel}
              disabled={!itensGuia?.length}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Informações da Guia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Informações da Guia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-start gap-3">
                <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Número da Guia</p>
                  <p className="font-semibold">{guia}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Carteirinha</p>
                  <p className="font-semibold">{infoGuia.carteiraBeneficiario || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Data Execução</p>
                  <p className="font-semibold">{formatDate(infoGuia.dataExecucao)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Profissional</p>
                  <p className="font-semibold">{infoGuia.nomeProf || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Registro ANS</p>
                  <p className="font-semibold">{infoGuia.registroAns || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Guia Operadora</p>
                  <p className="font-semibold">{infoGuia.numeroGuiaOperadora || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Senha</p>
                  <p className="font-semibold">{infoGuia.senha || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Receipt className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Nº Lote</p>
                  <p className="font-semibold">{infoGuia.numeroLote || "-"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs por Tipo */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Valores por Tipo de Item
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpisPorTipo.map((kpi) => {
              const TipoIcon = getTipoIcon(kpi.tipo);
              const tipoColor = getTipoColor(kpi.tipo);
              
              return (
                <Card key={kpi.tipo}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{kpi.tipo}</p>
                        <p className="text-2xl font-bold text-emerald-600">{formatCurrency(kpi.valor)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {kpi.itens} {kpi.itens === 1 ? "item" : "itens"}
                        </p>
                      </div>
                      <div className={`p-3 rounded-full ${tipoColor}`}>
                        <TipoIcon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Itens</p>
                  <p className="text-3xl font-bold">{totais.totalItens}</p>
                </div>
                <FileText className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total da Guia</p>
                  <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totais.valorTotal)}</p>
                </div>
                <DollarSign className="h-10 w-10 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Itens */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Itens da Guia ({totais.totalItens})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !itensGuia?.length ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum item encontrado para esta guia</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seq.</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Data Exec.</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor Unit.</TableHead>
                      <TableHead className="text-right">Valor Faturado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensGuia.map((item: any, index: number) => {
                      const TipoIcon = getTipoIcon(item.tipoItem);
                      const tipoColor = getTipoColor(item.tipoItem);
                      
                      return (
                        <TableRow key={`${item.id}-${index}`}>
                          <TableCell className="font-medium">{item.sequencialItem || index + 1}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={tipoColor}>
                              <TipoIcon className="h-3 w-3 mr-1" />
                              {item.tipoItem || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.codigoItem || "-"}</TableCell>
                          <TableCell className="max-w-xs truncate" title={item.descricaoItem}>
                            {item.descricaoItem || "-"}
                          </TableCell>
                          <TableCell>{formatDate(item.dataExecucao)}</TableCell>
                          <TableCell className="text-right">{item.quantidade || 1}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valorUnitario)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">
                            {formatCurrency(item.valorFaturado)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
