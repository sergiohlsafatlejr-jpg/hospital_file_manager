import { useAuth } from "@/_core/hooks/useAuth";
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
  Search
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ItemConciliacao {
  guiaNumero: string;
  dataExecucao: string;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  status: "ok" | "divergente" | "glosado" | "nao_encontrado";
}

interface ResumoConciliacao {
  convenioId: number;
  convenioNome: string;
  totalEnviados: number;
  totalRetornados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalGlosados: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalGlosado: number;
  percentualGlosa: number;
}

export default function Conciliacao() {
  const { user } = useAuth();
  const [convenioId, setConvenioId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar resumo de todos os convênios
  const { data: resumoGeral, isLoading: isLoadingResumo } = trpc.conciliacao.resumo.useQuery({});

  // Buscar conciliação detalhada do convênio selecionado
  const { data: conciliacaoData, isLoading: isLoadingConciliacao, refetch } = trpc.conciliacao.porConvenio.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : 0,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
    },
    { enabled: !!convenioId }
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
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Filtrar itens
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
               item.status === "glosado" ? "Glosado" : "Não Encontrado",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 30 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Conciliação");
    
    const convenioNome = convenios?.find(c => c.id === parseInt(convenioId))?.nome || "convenio";
    XLSX.writeFile(wb, `conciliacao_${convenioNome}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Arquivo exportado com sucesso!");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conciliação Automática</h1>
          <p className="text-muted-foreground">
            Compare automaticamente os arquivos XML enviados com os retornos dos convênios
          </p>
        </div>

        {/* Cards de resumo geral */}
        {!convenioId && (
          <div className="space-y-4">
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
                    onClick={() => setConvenioId(String(resumo.convenioId))}
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
                      <div className="mt-4 flex gap-2">
                        <Badge variant="outline" className="text-green-600">{resumo.totalConciliados} OK</Badge>
                        <Badge variant="outline" className="text-red-600">{resumo.totalGlosados} Glosados</Badge>
                        <Badge variant="outline" className="text-amber-600">{resumo.totalDivergentes} Divergentes</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum dado de conciliação disponível.</p>
                  <p className="text-sm mt-2">Importe arquivos XML (enviados) e Excel (retornados) do mesmo convênio para iniciar a conciliação.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filtros e detalhes quando convênio selecionado */}
        {convenioId && (
          <>
            {/* Filtros */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  Filtros de Conciliação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Convênio</label>
                    <Select value={convenioId} onValueChange={setConvenioId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os convênios</SelectItem>
                        {convenios?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Início</label>
                    <Input 
                      type="date" 
                      value={dataInicio} 
                      onChange={(e) => setDataInicio(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Fim</label>
                    <Input 
                      type="date" 
                      value={dataFim} 
                      onChange={(e) => setDataFim(e.target.value)}
                    />
                  </div>

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
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
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
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setConvenioId("");
                      setDataInicio("");
                      setDataFim("");
                      setFiltroStatus("todos");
                      setBusca("");
                    }}
                  >
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
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                  {itensFiltrados.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({itensFiltrados.length} itens)
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
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Guia</TableHead>
                          <TableHead className="w-[100px]">Data</TableHead>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[150px]">Paciente</TableHead>
                          <TableHead className="w-[120px] text-right">Faturado</TableHead>
                          <TableHead className="w-[120px] text-right">Pago</TableHead>
                          <TableHead className="w-[120px] text-right">Glosado</TableHead>
                          <TableHead className="w-[200px]">Motivo Glosa</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(itensAgrupados).map(([guia, itens]) => (
                          <>
                            {/* Cabeçalho do grupo */}
                            <TableRow key={`header-${guia}`} className="bg-muted/50">
                              <TableCell colSpan={10} className="font-semibold">
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
                                  item.status === "glosado" ? "bg-red-50" :
                                  item.status === "nao_encontrado" ? "bg-gray-50" :
                                  item.status === "divergente" ? "bg-amber-50" :
                                  ""
                                }
                              >
                                <TableCell className="text-muted-foreground text-sm">{item.guiaNumero}</TableCell>
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
