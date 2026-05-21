import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  Receipt, 
  Download,
  Loader2,
  Search,
  DollarSign,
  FileText,
  Stethoscope
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { formatDateBR } from "@/lib/dateUtils";

export default function Repasse() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioId, setConvenioId] = useState<string>("");
  const [tipoRelatorio, setTipoRelatorio] = useState<string>("geral");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
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
  }, [convenioId, dataInicio, dataFim, tipoRelatorio]);

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar dados de repasse com filtros no backend
  const { data: repasseData, isLoading } = trpc.repasse.list.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      search: buscaDebounced || undefined,
      tipoRelatorio: tipoRelatorio !== "geral" ? tipoRelatorio : undefined,
      page,
      pageSize,
    },
    { enabled: true }
  );

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  
  const [isExportingAll, setIsExportingAll] = useState(false);

  // Mutation para exportar todos os dados
  const exportAllMutation = trpc.repasse.exportAll.useQuery(
    {
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      search: buscaDebounced || undefined,
      tipoRelatorio: tipoRelatorio !== "geral" ? tipoRelatorio : undefined,
    },
    { enabled: false } // Não executar automaticamente
  );

  const handleExportExcel = () => {
    if (!repasseData?.items || repasseData.items.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const excelData = (repasseData.items as any[]).map((item: any) => ({
      "Guia": item.guiaNumero || "",
      "Data Procedimento": formatDateBR(item.dataExecucao),
      "Código": item.codigo,
      "Descrição": item.descricao || "",
      "Paciente": item.pacienteNome || "",
      "Médico": item.nomeMedico || "",
      "CRM": item.crmMedico || "",
      "Convênio": item.convenioNome || "",
      "Valor Faturado": parseFloat(item.valorFaturado || "0"),
      "Valor Pago": parseFloat(item.valorPago || "0"),
      "Valor Glosado": parseFloat(item.valorGlosado || "0"),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 30 },
      { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Repasse");
    
    XLSX.writeFile(wb, `repasse_pagina_${page}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Arquivo exportado com sucesso!");
  };

  const handleExportAllExcel = async () => {
    if (!repasseData?.total || repasseData.total === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    setIsExportingAll(true);
    toast.info(`Buscando ${repasseData.total} registros para exportação...`);

    try {
      const result = await exportAllMutation.refetch();
      
      if (!result.data?.items || result.data.items.length === 0) {
        toast.error("Nenhum dado retornado para exportação");
        return;
      }

      const excelData = (result.data.items as any[]).map((item: any) => ({
        "Guia": item.guiaNumero || "",
        "Data Procedimento": formatDateBR(item.dataExecucao),
        "Código": item.codigo,
        "Descrição": item.descricao || "",
        "Paciente": item.pacienteNome || "",
        "Médico": item.nomeMedico || "",
        "CRM": item.crmMedico || "",
        "Convênio": item.convenioNome || "",
        "Valor Faturado": parseFloat(item.valorFaturado || "0"),
        "Valor Pago": parseFloat(item.valorPago || "0"),
        "Valor Glosado": parseFloat(item.valorGlosado || "0"),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 30 },
        { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Repasse");
      
      XLSX.writeFile(wb, `repasse_completo_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`${result.data.items.length} registros exportados com sucesso!`);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar dados");
    } finally {
      setIsExportingAll(false);
    }
  };

  const resumo = repasseData?.resumo;
  const totalPages = Math.ceil((repasseData?.total || 0) / pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repasses e Relatórios</h1>
          <p className="text-muted-foreground">
            Comparativo entre valores faturados e recebidos para repasse (Médicos, Laboratório, Ultrassom)
          </p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Filtros de Repasse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={(v) => setConvenioId(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Relatório</label>
                <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
                  <SelectTrigger>
                    <SelectValue placeholder="Geral" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral (Procedimentos/Consultas)</SelectItem>
                    <SelectItem value="exames">Laboratório / Exames</SelectItem>
                    <SelectItem value="ultrassom">Ultrassom</SelectItem>
                    <SelectItem value="visitas">Repasse de Visitas (10102019)</SelectItem>
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

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium">Busca</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Código, guia, paciente, médico..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={handleExportExcel} disabled={!repasseData?.items?.length} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar Página Atual
              </Button>
              <Button 
                onClick={handleExportAllExcel} 
                disabled={!repasseData?.total || isExportingAll}
                className="bg-green-600 hover:bg-green-700"
              >
                {isExportingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Exportar Todos ({repasseData?.total || 0} itens)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cards de resumo */}
        {resumo && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Itens</p>
                    <p className="text-2xl font-bold">{resumo.totalItens}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Médicos</p>
                    <p className="text-2xl font-bold">{resumo.totalMedicos}</p>
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
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(resumo.totalFaturado)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Pago</p>
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
                    <p className="text-sm text-muted-foreground">Glosado</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(resumo.totalGlosado)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabela de repasse */}
        <Tabs defaultValue="detalhado" className="w-full space-y-4">
          <TabsList>
            <TabsTrigger value="detalhado">Itens Detalhados</TabsTrigger>
            <TabsTrigger value="convenio">Resumo por Convênio</TabsTrigger>
          </TabsList>
          
          <TabsContent value="detalhado" className="m-0">
        <Card>
          <CardHeader>
            <CardTitle>
              Itens para Repasse
              {repasseData?.total !== undefined && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({repasseData.total} itens)
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Procedimentos faturados com valores pagos pelo convênio
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : repasseData?.items && repasseData.items.length > 0 ? (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Guia</TableHead>
                        <TableHead className="w-[100px]">Data</TableHead>
                        <TableHead className="w-[100px]">Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[150px]">Paciente</TableHead>
                        <TableHead className="w-[150px]">Médico</TableHead>
                        <TableHead className="w-[100px]">Convênio</TableHead>
                        <TableHead className="w-[120px] text-right">Faturado</TableHead>
                        <TableHead className="w-[120px] text-right">Pago</TableHead>
                        <TableHead className="w-[120px] text-right">Glosado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(repasseData.items as any[]).map((item: any, idx: number) => (
                        <TableRow 
                          key={item.id || idx}
                          className={parseFloat(item.valorGlosado || "0") > 0 ? "bg-red-50" : ""}
                        >
                          <TableCell className="font-mono text-sm">{item.guiaNumero || "-"}</TableCell>
                          <TableCell>{formatDateBR(item.dataExecucao)}</TableCell>
                          <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                          <TableCell className="max-w-[250px] truncate" title={item.descricao || ""}>
                            {item.descricao || "-"}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate" title={item.pacienteNome || ""}>
                            {item.pacienteNome || "-"}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate" title={item.nomeMedico || ""}>
                            <div className="flex flex-col">
                              <span>{item.nomeMedico || "-"}</span>
                              {item.crmMedico && (
                                <span className="text-xs text-muted-foreground">CRM: {item.crmMedico}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.convenioNome || "-"}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(parseFloat(item.valorFaturado || "0"))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            {formatCurrency(parseFloat(item.valorPago || "0"))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            {parseFloat(item.valorGlosado || "0") > 0 
                              ? formatCurrency(parseFloat(item.valorGlosado || "0"))
                              : "-"
                            }
                          </TableCell>
                        </TableRow>
                      ))}
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
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum item de repasse encontrado.</p>
                <p className="text-sm mt-2">
                  Importe arquivos XML (enviados) e Excel (retornados) para gerar os dados de repasse.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
          
          <TabsContent value="convenio" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle>Resumo Consolidado por Convênio</CardTitle>
                <CardDescription>Visualização agrupada dos valores por operadora de saúde</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Quantidade de Itens</TableHead>
                        <TableHead className="text-right">Total Faturado</TableHead>
                        <TableHead className="text-right">Total Pago</TableHead>
                        <TableHead className="text-right">Total Glosado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resumo?.resumoPorConvenio && Object.keys(resumo.resumoPorConvenio).length > 0 ? (
                        Object.keys(resumo.resumoPorConvenio).sort().map((conv) => {
                          const dados = resumo.resumoPorConvenio[conv];
                          return (
                            <TableRow key={conv}>
                              <TableCell className="font-medium">{conv}</TableCell>
                              <TableCell className="text-right">{dados.itens}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(dados.faturado)}</TableCell>
                              <TableCell className="text-right font-mono text-green-600">{formatCurrency(dados.pago)}</TableCell>
                              <TableCell className="text-right font-mono text-red-600">
                                {dados.glosado > 0 ? formatCurrency(dados.glosado) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            Nenhum resumo disponível.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
