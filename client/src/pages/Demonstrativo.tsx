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
  FileSpreadsheet, 
  Download,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  DollarSign,
  FileText
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function Demonstrativo() {
  const { user } = useAuth();
  const [convenioId, setConvenioId] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [buscaDebounced, setBuscaDebounced] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaDebounced(busca);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [busca]);

  // Resetar página quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [convenioId, filtroStatus]);

  // Buscar convênios
  const { data: convenios, isLoading: isLoadingConvenios } = trpc.convenios.list.useQuery();

  // Buscar procedimentos do convênio selecionado com filtros no backend
  // Apenas arquivos retornados (para evitar duplicação com arquivos enviados)
  const { data: procedimentosData, isLoading: isLoadingProcedimentos } = trpc.procedimentos.list.useQuery(
    { 
      convenioId: parseInt(convenioId), 
      page, 
      pageSize,
      search: buscaDebounced || undefined,
      statusGlosa: filtroStatus !== "todos" ? filtroStatus as "pago" | "glosado" | "parcial" : undefined,
      apenasRetornados: true,
    },
    { enabled: !!convenioId }
  );

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const handleExportExcel = () => {
    if (!procedimentosData?.items || procedimentosData.items.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const excelData = (procedimentosData.items as any[]).map((proc: any) => {
      const extras = proc.dadosExtras ? 
        (typeof proc.dadosExtras === "string" ? JSON.parse(proc.dadosExtras) : proc.dadosExtras) : {};
      const valorGlosado = parseFloat(extras.valorGlosado || "0");
      const valor = parseFloat(proc.valorTotal || "0");
      
      let status = "Pago";
      if (valorGlosado > 0 && valorGlosado >= valor) {
        status = "Glosado";
      } else if (valorGlosado > 0) {
        status = "Parcial";
      }

      return {
        "Guia": proc.guiaNumero || "",
        "Data Execução": proc.dataExecucao ? new Date(proc.dataExecucao).toLocaleDateString("pt-BR") : "",
        "Código": proc.codigo,
        "Descrição": proc.descricao || "",
        "Paciente": proc.pacienteNome || "",
        "Quantidade": proc.quantidade || 1,
        "Valor Pago": valor - valorGlosado,
        "Valor Glosado": valorGlosado,
        "Motivo Glosa": extras.motivoGlosa || "",
        "Status": status,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 30 },
      { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Demonstrativo");
    
    const convenio = convenios?.find((c: any) => c.id === parseInt(convenioId));
    const nomeArquivo = convenio?.nome || "demonstrativo";
    XLSX.writeFile(wb, `${nomeArquivo}_demonstrativo.xlsx`);
    toast.success("Arquivo exportado com sucesso!");
  };

  const getStatusBadge = (proc: any) => {
    const extras = proc.dadosExtras ? 
      (typeof proc.dadosExtras === "string" ? JSON.parse(proc.dadosExtras) : proc.dadosExtras) : {};
    const valorGlosado = parseFloat(extras.valorGlosado || "0");
    const valor = parseFloat(proc.valorTotal || "0");

    if (valorGlosado > 0 && valorGlosado >= valor) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Glosado</Badge>;
    } else if (valorGlosado > 0) {
      return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3" /> Parcial</Badge>;
    }
    return <Badge variant="outline" className="gap-1 border-green-500 text-green-600"><CheckCircle2 className="h-3 w-3" /> Pago</Badge>;
  };

  const resumo = procedimentosData?.resumo;
  const totalPages = Math.ceil((procedimentosData?.total || 0) / pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Demonstrativo de Retorno</h1>
          <p className="text-muted-foreground">
            Visualize os itens do arquivo de retorno com status de pagamento e glosas
          </p>
        </div>

        {/* Seleção de arquivo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Selecionar Arquivo de Retorno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={setConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {convenios?.map((convenio: any) => (
                      <SelectItem key={convenio.id} value={String(convenio.id)}>
                        {convenio.nome} ({convenio.codigo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pago">Pagos</SelectItem>
                    <SelectItem value="glosado">Glosados</SelectItem>
                    <SelectItem value="parcial">Parciais</SelectItem>
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

            {convenioId && (
              <div className="flex gap-2 mt-4">
                <Button onClick={handleExportExcel} disabled={!procedimentosData?.items?.length}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Excel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cards de resumo */}
        {convenioId && resumo && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Itens</p>
                    <p className="text-2xl font-bold">{resumo.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Pagos</p>
                    <p className="text-2xl font-bold text-green-600">{resumo.quantidadePagos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Glosados</p>
                    <p className="text-2xl font-bold text-red-600">{resumo.quantidadeGlosados}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Pago</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(resumo.totalPago)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Glosado</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(resumo.totalGlosado)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabela de procedimentos */}
        {convenioId && (
          <Card>
            <CardHeader>
              <CardTitle>
                Itens do Demonstrativo
                {procedimentosData?.total !== undefined && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({procedimentosData.total} itens{filtroStatus !== "todos" ? ` filtrados` : ""})
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Detalhamento dos procedimentos com valores pagos e glosados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProcedimentos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : procedimentosData?.items && procedimentosData.items.length > 0 ? (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Guia</TableHead>
                          <TableHead className="w-[100px]">Data</TableHead>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[150px]">Paciente</TableHead>
                          <TableHead className="w-[80px] text-center">Qtd</TableHead>
                          <TableHead className="w-[120px] text-right">Valor Pago</TableHead>
                          <TableHead className="w-[120px] text-right">Valor Glosado</TableHead>
                          <TableHead className="w-[200px]">Motivo Glosa</TableHead>
                          <TableHead className="w-[100px] text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(procedimentosData.items as any[]).map((proc: any) => {
                          const extras = proc.dadosExtras ? 
                            (typeof proc.dadosExtras === "string" ? JSON.parse(proc.dadosExtras) : proc.dadosExtras) : {};
                          const valorGlosado = parseFloat(extras.valorGlosado || "0");
                          const valor = parseFloat(proc.valorTotal || "0");
                          const valorPago = valor - valorGlosado;

                          return (
                            <TableRow 
                              key={proc.id}
                              className={valorGlosado > 0 ? (valorGlosado >= valor ? "bg-red-50" : "bg-yellow-50") : ""}
                            >
                              <TableCell className="font-mono text-sm">{proc.guiaNumero || "-"}</TableCell>
                              <TableCell>
                                {proc.dataExecucao 
                                  ? new Date(proc.dataExecucao).toLocaleDateString("pt-BR") 
                                  : "-"}
                              </TableCell>
                              <TableCell className="font-mono text-sm">{proc.codigo}</TableCell>
                              <TableCell className="max-w-[250px] truncate" title={proc.descricao || ""}>
                                {proc.descricao || "-"}
                              </TableCell>
                              <TableCell className="max-w-[150px] truncate" title={proc.pacienteNome || ""}>
                                {proc.pacienteNome || "-"}
                              </TableCell>
                              <TableCell className="text-center">{proc.quantidade || 1}</TableCell>
                              <TableCell className="text-right font-mono text-green-600">
                                {formatCurrency(valorPago > 0 ? valorPago : 0)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-red-600">
                                {valorGlosado > 0 ? formatCurrency(valorGlosado) : "-"}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={extras.motivoGlosa || ""}>
                                {extras.motivoGlosa || "-"}
                              </TableCell>
                              <TableCell className="text-center">
                                {getStatusBadge(proc)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Página {page} de {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          Anterior
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage(p => p + 1)}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum item encontrado com os filtros aplicados.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!convenioId && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione um convênio para visualizar o demonstrativo.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
