import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  FileText,
  Building2,
  RefreshCw,
  Download,
  BarChart3,
  PieChart,
  Calendar
} from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#FF6B6B"];

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

export default function Faturamento() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [periodoMeses, setPeriodoMeses] = useState<string>("12");
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [anoReferencia, setAnoReferencia] = useState<string>(String(new Date().getFullYear()));

  // Buscar dados
  const { data: faturamentoConvenio, isLoading: loadingConvenio, refetch: refetchConvenio } = 
    trpc.faturamento.porConvenio.useQuery({ estabelecimentoId });
  
  const { data: faturamentoMes, isLoading: loadingMes, refetch: refetchMes } = 
    trpc.faturamento.porMes.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      meses: parseInt(periodoMeses),
      estabelecimentoId,
    });

  const { data: resumoGeral, isLoading: loadingResumo } = 
    trpc.faturamento.resumoGeral.useQuery({ estabelecimentoId });

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleRefresh = () => {
    refetchConvenio();
    refetchMes();
  };

  const handleExportExcel = () => {
    if (!faturamentoConvenio) return;

    const excelData = faturamentoConvenio.map(item => ({
      "Convênio": item.convenioNome,
      "Total Enviado": item.totalEnviado,
      "Total Retornado": item.totalRetornado,
      "Total Glosado": item.totalGlosado,
      "% Glosa": item.percentualGlosa,
      "Qtd Arquivos": item.quantidadeArquivos,
      "Qtd Procedimentos": item.quantidadeProcedimentos,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento por Convênio");

    // Adicionar aba de faturamento por mês
    if (faturamentoMes) {
      const mesData = faturamentoMes.map(item => ({
        "Mês": `${item.mes}/${item.ano}`,
        "Total Enviado": item.totalEnviado,
        "Total Retornado": item.totalRetornado,
        "Total Glosado": item.totalGlosado,
      }));
      const wsMes = XLSX.utils.json_to_sheet(mesData);
      wsMes["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsMes, "Faturamento por Mês");
    }

    XLSX.writeFile(wb, `faturamento_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Preparar dados para gráfico de pizza
  const pieData = faturamentoConvenio?.map(item => ({
    name: item.convenioNome,
    value: item.totalEnviado,
  })) || [];

  // Preparar dados para gráfico de barras comparativo
  const barData = faturamentoConvenio?.map(item => ({
    name: item.convenioNome.length > 15 ? item.convenioNome.substring(0, 15) + "..." : item.convenioNome,
    enviado: item.totalEnviado,
    retornado: item.totalRetornado,
    glosado: item.totalGlosado,
  })) || [];

  // Preparar dados para gráfico de linha temporal
  const lineData = faturamentoMes?.map(item => ({
    name: `${item.mes}`,
    enviado: item.totalEnviado,
    retornado: item.totalRetornado,
    glosado: item.totalGlosado,
  })) || [];

  const isLoading = loadingConvenio || loadingMes || loadingResumo;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Painel de Faturamento</h1>
            <p className="text-muted-foreground">
              Acompanhe os totais de faturamento e glosa por convênio
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={handleExportExcel} disabled={!faturamentoConvenio?.length}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Filtros por Período */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filtrar por Período de Referência
            </CardTitle>
            <CardDescription>
              Selecione o mês e ano para filtrar os dados de faturamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-48">
                <label className="text-sm font-medium mb-2 block">Mês</label>
                <Select value={mesReferencia} onValueChange={setMesReferencia}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os meses</SelectItem>
                    {MESES.map((mes) => (
                      <SelectItem key={mes.value} value={mes.value}>
                        {mes.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <label className="text-sm font-medium mb-2 block">Ano</label>
                <Select value={anoReferencia} onValueChange={setAnoReferencia}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((ano) => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(mesReferencia && mesReferencia !== "todos") && (
                <Button 
                  variant="outline" 
                  onClick={() => setMesReferencia("")}
                  size="sm"
                >
                  Limpar Filtro
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Faturado</p>
                  {loadingResumo ? (
                    <Skeleton className="h-8 w-32 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(resumoGeral?.valorTotalEnviado || 0)}
                    </p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Recebido</p>
                  {loadingResumo ? (
                    <Skeleton className="h-8 w-32 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(resumoGeral?.valorTotalRetornado || 0)}
                    </p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Glosado</p>
                  {loadingResumo ? (
                    <Skeleton className="h-8 w-32 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(resumoGeral?.valorGlosado || 0)}
                    </p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">% Glosa</p>
                  {loadingResumo ? (
                    <Skeleton className="h-8 w-20 mt-1" />
                  ) : (
                    <p className={`text-2xl font-bold ${(resumoGeral?.percentualGlosa || 0) > 10 ? "text-red-600" : "text-amber-600"}`}>
                      {formatPercent(resumoGeral?.percentualGlosa || 0)}
                    </p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Barras - Comparativo por Convênio */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Faturamento por Convênio
              </CardTitle>
              <CardDescription>Comparativo entre enviado, retornado e glosado</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingConvenio ? (
                <Skeleton className="h-[300px] w-full" />
              ) : barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: "#333" }}
                    />
                    <Legend />
                    <Bar dataKey="enviado" name="Enviado" fill="#22c55e" />
                    <Bar dataKey="retornado" name="Retornado" fill="#3b82f6" />
                    <Bar dataKey="glosado" name="Glosado" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico de Pizza - Distribuição por Convênio */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Distribuição por Convênio
              </CardTitle>
              <CardDescription>Participação de cada convênio no faturamento total</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingConvenio ? (
                <Skeleton className="h-[300px] w-full" />
              ) : pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </RechartsPie>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráfico de Evolução Temporal */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Evolução do Faturamento
                </CardTitle>
                <CardDescription>Acompanhamento mensal de faturamento e glosa</CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {convenios?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 meses</SelectItem>
                    <SelectItem value="6">6 meses</SelectItem>
                    <SelectItem value="12">12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMes ? (
              <Skeleton className="h-[300px] w-full" />
            ) : lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={lineData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="enviado" name="Enviado" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="retornado" name="Retornado" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="glosado" name="Glosado" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela Detalhada por Convênio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Detalhamento por Convênio
            </CardTitle>
            <CardDescription>
              {faturamentoConvenio?.length || 0} convênio(s) com faturamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingConvenio ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : faturamentoConvenio?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum faturamento registrado</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-right">Total Enviado</TableHead>
                      <TableHead className="text-right">Total Retornado</TableHead>
                      <TableHead className="text-right">Total Glosado</TableHead>
                      <TableHead className="text-center">% Glosa</TableHead>
                      <TableHead className="text-center">Arquivos</TableHead>
                      <TableHead className="text-center">Procedimentos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faturamentoConvenio?.map((item) => (
                      <TableRow key={item.convenioId}>
                        <TableCell className="font-medium">{item.convenioNome}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCurrency(item.totalEnviado)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600 font-medium">
                          {formatCurrency(item.totalRetornado)}
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {formatCurrency(item.totalGlosado)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            className={
                              item.percentualGlosa > 10 
                                ? "bg-red-100 text-red-700" 
                                : item.percentualGlosa > 5 
                                ? "bg-amber-100 text-amber-700" 
                                : "bg-green-100 text-green-700"
                            }
                          >
                            {formatPercent(item.percentualGlosa)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{item.quantidadeArquivos}</TableCell>
                        <TableCell className="text-center">{item.quantidadeProcedimentos}</TableCell>
                      </TableRow>
                    ))}
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
