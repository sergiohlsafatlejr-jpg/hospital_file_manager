import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import {
  BarChart3,
  PieChart,
  LineChart,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Building2,
  Calendar,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Percent,
} from "lucide-react";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  BarChart as RechartsBarChart,
  Bar as RechartsBar,
  PieChart as RechartsPieChart,
  Pie as RechartsPie,
  LineChart as RechartsLineChart,
  Line,
  Cell,
  ResponsiveContainer,
  Legend as RechartsLegend,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function RelatoriosBI() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [ano, setAno] = useState("2026");
  const [mes, setMes] = useState("todos");
  const [convenio, setConvenio] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [prestador, setPrestador] = useState("todos");
  const [categoriaGlosa, setCategoriaGlosa] = useState("todas");
  const [mostrarGraficoCategoriasGlosa, setMostrarGraficoCategoriasGlosa] = useState(false);
  const [mostrarComparativoMes, setMostrarComparativoMes] = useState(false);
  const [mostrarAnaliseTrimestre, setMostrarAnaliseTrimestre] = useState(false);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [usarPeriodoAvancado, setUsarPeriodoAvancado] = useState(false);

  const { data: relatorioData, isLoading } = trpc.relatoriosBI.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      anoReferencia: parseInt(ano),
      mesReferencia: mes !== "todos" ? parseInt(mes) : undefined,
      convenioId: convenio !== "todos" ? parseInt(convenio) : undefined,
      tipo: tipo !== "todos" ? tipo : undefined,
      codigoPrestadorExecutante: prestador !== "todos" ? prestador : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id }
  );

  // Dados agregados por convênio
  const dadosPorConvenio = useMemo(() => {
    if (!relatorioData?.porConvenio) return [];
    return relatorioData.porConvenio.map((item: any) => ({
      convenio: item.chave,
      faturado: item.valorFaturado || 0,
      recebido: item.valorRecebido || 0,
      glosado: item.valorGlosado || 0,
      itens: item.quantidade || 0,
    }));
  }, [relatorioData]);

  // Dados agregados por tipo
  const dadosPorTipo = useMemo(() => {
    if (!relatorioData?.porTipo) return [];
    const total = relatorioData.porTipo.reduce((sum: number, item: any) => sum + (item.valorRecebido || 0), 0);
    return relatorioData.porTipo.map((item: any) => ({
      tipo: item.chave,
      valor: item.valorRecebido || 0,
      percentual: total > 0 ? ((item.valorRecebido / total) * 100).toFixed(1) : 0,
    }));
  }, [relatorioData]);

  const metricas = useMemo(() => {
    if (!relatorioData?.resumo) {
      return { faturado: 0, recebido: 0, glosado: 0, itens: 0, percentualGlosa: 0 };
    }
    const { totalFaturado, totalRecebido, totalGlosado, totalItens } = relatorioData.resumo;
    const percentualGlosa = totalFaturado > 0 ? ((totalGlosado / totalFaturado) * 100).toFixed(2) : 0;
    const ticketMedio = totalItens > 0 ? (totalFaturado / totalItens) : 0;
    return { 
      faturado: totalFaturado, 
      recebido: totalRecebido, 
      glosado: totalGlosado, 
      itens: totalItens, 
      percentualGlosa,
      ticketMedio
    };
  }, [relatorioData]);

  const handleExportarExcel = () => {
    if (!relatorioData?.porConvenio || relatorioData.porConvenio.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const wb = XLSX.utils.book_new();
    
    // Aba 1: Resumo Geral
    const resumoData = [{
      Metrica: "Valor Faturado",
      Valor: metricas.faturado,
    }, {
      Metrica: "Valor Recebido",
      Valor: metricas.recebido,
    }, {
      Metrica: "Valor Glosado",
      Valor: metricas.glosado,
    }, {
      Metrica: "Taxa de Glosa (%)",
      Valor: metricas.percentualGlosa,
    }];
    const wsResumo = XLSX.utils.json_to_sheet(resumoData);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
    
    // Aba 2: Por Convenio
    const wsConvenio = XLSX.utils.json_to_sheet(relatorioData.porConvenio);
    XLSX.utils.book_append_sheet(wb, wsConvenio, "Por Convenio");
    
    // Aba 3: Por Motivo de Glosa (com nomes descritivos)
    const motivosData = (relatorioData.porMotivoGlosa || []).map((item: any) => {
      const codigoMatch = String(item.chave).match(/^(\d+)/);
      const codigo = codigoMatch ? codigoMatch[1] : "";
      const descricao = String(item.chave).replace(/^\d+\s*-?\s*/, "") || "Sem motivo";
      const percentualGlosa = item.valorFaturado > 0 ? ((item.valorGlosado / item.valorFaturado) * 100).toFixed(2) : 0;
      return {
        "Codigo TISS": codigo,
        "Motivo da Glosa": descricao,
        "Quantidade": item.quantidade || 0,
        "Valor Faturado": item.valorFaturado || 0,
        "Valor Glosado": item.valorGlosado || 0,
        "Taxa Glosa (%)": percentualGlosa,
      };
    });
    const wsMotivos = XLSX.utils.json_to_sheet(motivosData);
    XLSX.utils.book_append_sheet(wb, wsMotivos, "Motivos Glosa");
    
    XLSX.writeFile(wb, `relatorio-bi-${ano}-${mes}-${new Date().getTime()}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios BI</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise de Faturamento, Recebimento e Glosas
            </p>
          </div>
          <Button onClick={handleExportarExcel} disabled={isLoading} className="gap-2">
            <Download className="w-4 h-4" />
            Exportar Excel
          </Button>
        </div>

        {/* Filtros */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ano" className="text-sm font-medium">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Ano
                </Label>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger id="ano">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mes" className="text-sm font-medium">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Mês
                </Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger id="mes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Meses</SelectItem>
                    <SelectItem value="1">Janeiro</SelectItem>
                    <SelectItem value="2">Fevereiro</SelectItem>
                    <SelectItem value="3">Março</SelectItem>
                    <SelectItem value="4">Abril</SelectItem>
                    <SelectItem value="5">Maio</SelectItem>
                    <SelectItem value="6">Junho</SelectItem>
                    <SelectItem value="7">Julho</SelectItem>
                    <SelectItem value="8">Agosto</SelectItem>
                    <SelectItem value="9">Setembro</SelectItem>
                    <SelectItem value="10">Outubro</SelectItem>
                    <SelectItem value="11">Novembro</SelectItem>
                    <SelectItem value="12">Dezembro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="convenio" className="text-sm font-medium">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Convênio
                </Label>
                <Select value={convenio} onValueChange={setConvenio}>
                  <SelectTrigger id="convenio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Convênios</SelectItem>
                    {dadosPorConvenio.map((item: any) => (
                      <SelectItem key={item.convenio} value={String(item.convenio)}>
                        {item.convenio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo" className="text-sm font-medium">
                  <Package className="w-4 h-4 inline mr-2" />
                  Tipo
                </Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Tipos</SelectItem>
                    <SelectItem value="medicamento">Medicamento</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="taxa">Taxa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prestador" className="text-sm font-medium">
                  Prestador/Médico
                </Label>
                <Select value={prestador} onValueChange={setPrestador}>
                  <SelectTrigger id="prestador">
                    <SelectValue placeholder="Selecione um prestador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Prestadores</SelectItem>
                    {relatorioData?.porMedico?.map((item: any) => (
                      <SelectItem key={item.chave} value={item.chave || "sem-codigo"}>
                        {item.chave || "Sem código"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoriaGlosa" className="text-sm font-medium">
                  Categoria de Glosa
                </Label>
                <Select value={categoriaGlosa} onValueChange={setCategoriaGlosa}>
                  <SelectTrigger id="categoriaGlosa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Categorias</SelectItem>
                    <SelectItem value="elegibilidade">Elegibilidade</SelectItem>
                    <SelectItem value="protocolo">Protocolo</SelectItem>
                    <SelectItem value="prestador">Prestador</SelectItem>
                    <SelectItem value="guia">Guia</SelectItem>
                    <SelectItem value="autorizacao">Autorização</SelectItem>
                    <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                    <SelectItem value="atendimento">Atendimento</SelectItem>
                    <SelectItem value="valorizacao">Valorização</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                Faturado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {metricas.faturado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valor total faturado</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Recebido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {metricas.recebido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valor recebido</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Glosado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {metricas.glosado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valor glosado</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                % Glosa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metricas.percentualGlosa}%</div>
              <p className="text-xs text-muted-foreground mt-1">Taxa de glosa</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Barras - Convênios */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Valores por Convênio
              </CardTitle>
              <CardDescription>Comparação de faturado, recebido e glosado</CardDescription>
            </CardHeader>
            <CardContent>
              {dadosPorConvenio.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsBarChart data={dadosPorConvenio}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="convenio" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <RechartsTooltip
                      formatter={(value) =>
                        `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      }
                    />
                    <RechartsLegend />
                    <RechartsBar dataKey="faturado" fill="#3b82f6" name="Faturado" />
                    <RechartsBar dataKey="recebido" fill="#10b981" name="Recebido" />
                    <RechartsBar dataKey="glosado" fill="#ef4444" name="Glosado" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico de Pizza - Distribuição por Tipo */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-600" />
                Distribuição por Tipo
              </CardTitle>
              <CardDescription>Percentual de valores recebidos</CardDescription>
            </CardHeader>
            <CardContent>
              {dadosPorTipo.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <RechartsPie
                      data={dadosPorTipo}
                      dataKey="valor"
                      nameKey="tipo"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {dadosPorTipo.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CORES[index % CORES.length]} />
                      ))}
                    </RechartsPie>
                    <RechartsTooltip
                      formatter={(value) =>
                        `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      }
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Dados */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Detalhes dos Dados
            </CardTitle>
            <CardDescription>Listagem completa dos registros</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <div className="text-muted-foreground">Carregando dados...</div>
              </div>
            ) : relatorioData?.porConvenio && relatorioData.porConvenio.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Convênio</TableHead>
                      <TableHead className="font-semibold">Tipo</TableHead>
                      <TableHead className="font-semibold text-right">Faturado</TableHead>
                      <TableHead className="font-semibold text-right">Recebido</TableHead>
                      <TableHead className="font-semibold text-right">Glosado</TableHead>
                      <TableHead className="font-semibold text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relatorioData.porConvenio.slice(0, 10).map((item: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{item.chave || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Convênio</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {(item.valorFaturado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          R$ {(item.valorRecebido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          R$ {(item.valorGlosado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.valorGlosado && item.valorGlosado > 0 ? (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">
                              Glosado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                              Pago
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {relatorioData?.porConvenio && relatorioData.porConvenio.length > 10 && (
                  <div className="mt-4 text-sm text-muted-foreground text-center">
                    Mostrando 10 de {relatorioData.porConvenio.length} registros
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Nenhum dado encontrado para os filtros selecionados
              </div>
            )}
          </CardContent>
        </Card>

        {/* Relatório por Motivo de Glosa */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Glosados por Motivo
            </CardTitle>
            <CardDescription>Análise de glosados agrupados por motivo/justificativa</CardDescription>
          </CardHeader>
          <CardContent>
            {relatorioData?.porMotivoGlosa && relatorioData.porMotivoGlosa.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motivo da Glosa</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Valor Faturado</TableHead>
                      <TableHead className="text-right">Valor Glosado</TableHead>
                      <TableHead className="text-center">% Glosa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relatorioData.porMotivoGlosa.slice(0, 10).map((item) => {
                      const percentualGlosa = item.valorFaturado > 0 ? ((item.valorGlosado / item.valorFaturado) * 100).toFixed(2) : 0;
                      // Extrair código e descrição
                      const codigoMatch = String(item.chave).match(/^(\d+)/);
                      const codigo = codigoMatch ? codigoMatch[1] : "";
                      const descricao = String(item.chave).replace(/^\d+\s*-?\s*/, "") || "Sem motivo";
                      
                      return (
                        <TableRow key={item.chave}>
                          <TableCell className="font-medium">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dotted border-gray-400 hover:border-gray-600">
                                  {descricao}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-sm">
                                  <p className="font-semibold">Código TISS: {codigo || "N/A"}</p>
                                  <p className="mt-1">{descricao}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right">{item.quantidade}</TableCell>
                          <TableCell className="text-right">
                            R$ {(item.valorFaturado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            R$ {(item.valorGlosado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                              {percentualGlosa}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {relatorioData.porMotivoGlosa && relatorioData.porMotivoGlosa.length > 10 && (
                  <div className="mt-4 text-sm text-muted-foreground text-center">
                    Mostrando 10 de {relatorioData.porMotivoGlosa.length} registros
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum dado de glosa encontrado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Relatório por Descrição de Itens */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Itens por Descrição
            </CardTitle>
            <CardDescription>Análise de itens agrupados por descrição/procedimento</CardDescription>
          </CardHeader>
          <CardContent>
            {relatorioData?.porDescricao && relatorioData.porDescricao.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição do Item</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Valor Faturado</TableHead>
                      <TableHead className="text-right">Valor Recebido</TableHead>
                      <TableHead className="text-right">Valor Glosado</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relatorioData.porDescricao.slice(0, 15).map((item) => (
                      <TableRow key={item.chave}>
                        <TableCell className="font-medium text-sm">{item.chave || "-"}</TableCell>
                        <TableCell className="text-right">{item.quantidade}</TableCell>
                        <TableCell className="text-right">
                          R$ {(item.valorFaturado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          R$ {(item.valorRecebido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          R$ {(item.valorGlosado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.valorGlosado && item.valorGlosado > 0 ? (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">
                              Glosado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                              Pago
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {relatorioData.porDescricao && relatorioData.porDescricao.length > 15 && (
                  <div className="mt-4 text-sm text-muted-foreground text-center">
                    Mostrando 15 de {relatorioData.porDescricao.length} registros
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum dado de itens encontrado
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
